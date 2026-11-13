'use client';
/** Estado de trabalho compartilhado entre Orçamento → Contrato/PDF (persistido no navegador). */
import * as React from 'react';
import type { CenarioWhatIf, OrcamentoResultado } from '@/lib/cub/engine';

export interface OrcamentoAtual {
  resultado: OrcamentoResultado;
  cenarios: CenarioWhatIf[];
  prazoObraMeses: number;
}
/** Resumo do orçamento analítico (composições) levado para o contrato e o PDF. */
export interface AnaliticoAtual {
  projectId: string;
  base: string;
  custoDireto: number;
  bdiPercentual: number;
  precoVenda: number;
  itensPendentes: number;
  porDisciplina: { disciplina: string; total: number }[];
  linhas: { descricao: string; disciplina: string; unidade: string; quantidade: number; codigo: string; precoUnitario: number; total: number }[];
}
interface Workspace {
  orcamento: OrcamentoAtual | null;
  setOrcamento: (o: OrcamentoAtual) => void;
  analitico: AnaliticoAtual | null;
  setAnalitico: (a: AnaliticoAtual | null) => void;
}
const Ctx = React.createContext<Workspace>({ orcamento: null, setOrcamento: () => {}, analitico: null, setAnalitico: () => {} });
const CHAVE = 'aec.orcamentoAtual';
const CHAVE_ANALITICO = 'aec.analiticoAtual';

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [orcamento, set] = React.useState<OrcamentoAtual | null>(null);
  const [analitico, setA] = React.useState<AnaliticoAtual | null>(null);
  React.useEffect(() => {
    try {
      const salvo = sessionStorage.getItem(CHAVE);
      if (salvo) set(JSON.parse(salvo) as OrcamentoAtual);
      const a = sessionStorage.getItem(CHAVE_ANALITICO);
      if (a) setA(JSON.parse(a) as AnaliticoAtual);
    } catch { /* armazenamento indisponível: segue sem persistência */ }
  }, []);
  const setOrcamento = React.useCallback((o: OrcamentoAtual) => {
    set(o);
    try { sessionStorage.setItem(CHAVE, JSON.stringify(o)); } catch { /* idem */ }
  }, []);
  const setAnalitico = React.useCallback((a: AnaliticoAtual | null) => {
    setA(a);
    try { if (a) sessionStorage.setItem(CHAVE_ANALITICO, JSON.stringify(a)); else sessionStorage.removeItem(CHAVE_ANALITICO); } catch { /* idem */ }
  }, []);
  const valor = React.useMemo(() => ({ orcamento, setOrcamento, analitico, setAnalitico }), [orcamento, setOrcamento, analitico, setAnalitico]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}
export const useWorkspace = () => React.useContext(Ctx);
