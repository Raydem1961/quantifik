'use client';
/** Estado de trabalho compartilhado entre Orçamento → Contrato/PDF (persistido no navegador). */
import * as React from 'react';
import type { CenarioWhatIf, OrcamentoResultado } from '@/lib/cub/engine';

export interface OrcamentoAtual {
  resultado: OrcamentoResultado;
  cenarios: CenarioWhatIf[];
  prazoObraMeses: number;
}
interface Workspace {
  orcamento: OrcamentoAtual | null;
  setOrcamento: (o: OrcamentoAtual) => void;
}
const Ctx = React.createContext<Workspace>({ orcamento: null, setOrcamento: () => {} });
const CHAVE = 'aec.orcamentoAtual';

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [orcamento, set] = React.useState<OrcamentoAtual | null>(null);
  React.useEffect(() => {
    try {
      const salvo = sessionStorage.getItem(CHAVE);
      if (salvo) set(JSON.parse(salvo) as OrcamentoAtual);
    } catch { /* armazenamento indisponível: segue sem persistência */ }
  }, []);
  const setOrcamento = React.useCallback((o: OrcamentoAtual) => {
    set(o);
    try { sessionStorage.setItem(CHAVE, JSON.stringify(o)); } catch { /* idem */ }
  }, []);
  return <Ctx.Provider value={{ orcamento, setOrcamento }}>{children}</Ctx.Provider>;
}
export const useWorkspace = () => React.useContext(Ctx);
