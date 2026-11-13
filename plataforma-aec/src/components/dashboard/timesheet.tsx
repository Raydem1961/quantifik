'use client';
import * as React from 'react';
import { Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/form';
import { adicionarDoc } from '@/hooks/use-colecao';
import { brl, num, pct } from '@/lib/format';
import { DISCIPLINA_LABEL, type Disciplina, type Project, type TimesheetEntry } from '@/lib/types';
import { cn } from '@/lib/utils';

const CHAVE = 'aec.cronometro';
interface Rodando { projectId: string; disciplina: Disciplina; inicio: number }

/** Cronômetro por disciplina. O início fica no localStorage: sobrevive a recarregar a página. */
export function Cronometro({ projetos, tenantId, uid, nome }: { projetos: Project[]; tenantId: string; uid: string; nome: string }) {
  const ativos = projetos.filter((p) => p.status !== 'concluido');
  const [projectId, setProjectId] = React.useState('');
  const [disciplina, setDisciplina] = React.useState<Disciplina>('arquitetonico');
  const [rodando, setRodando] = React.useState<Rodando | null>(null);
  const [agora, setAgora] = React.useState(Date.now());
  const [msg, setMsg] = React.useState<string>();

  React.useEffect(() => {
    try { const s = localStorage.getItem(CHAVE); if (s) setRodando(JSON.parse(s) as Rodando); } catch { /* sem armazenamento */ }
  }, []);
  React.useEffect(() => {
    if (!rodando) return;
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [rodando]);

  const projeto = projetos.find((p) => p.id === (rodando?.projectId ?? projectId)) ?? ativos[0];
  const disciplinas = projeto?.disciplinas ?? [];
  const disciplinaValida = disciplinas.includes(disciplina) ? disciplina : disciplinas[0];

  const iniciar = () => {
    if (!projeto || !disciplinaValida) return;
    const r = { projectId: projeto.id, disciplina: disciplinaValida, inicio: Date.now() };
    setRodando(r); setAgora(Date.now()); setMsg(undefined);
    try { localStorage.setItem(CHAVE, JSON.stringify(r)); } catch { /* idem */ }
  };
  const parar = async () => {
    if (!rodando) return;
    const minutos = Math.round((Date.now() - rodando.inicio) / 60000);
    setRodando(null);
    try { localStorage.removeItem(CHAVE); } catch { /* idem */ }
    if (minutos < 1) { setMsg('Menos de 1 minuto: lançamento descartado.'); return; }
    try {
      await adicionarDoc(tenantId, `projects/${rodando.projectId}/timesheets`, {
        projectId: rodando.projectId, uid, nome, disciplina: rodando.disciplina, descricao: 'Cronômetro',
        inicio: new Date(rodando.inicio).toISOString(), minutos: Math.min(minutos, 1440),
      });
      setMsg(`${minutos} min lançados.`);
    } catch { setMsg('Falha ao gravar o lançamento. Tente novamente.'); }
  };

  const seg = rodando ? Math.max(0, Math.floor((agora - rodando.inicio) / 1000)) : 0;
  const relogio = [Math.floor(seg / 3600), Math.floor((seg % 3600) / 60), seg % 60].map((v) => String(v).padStart(2, '0')).join(':');

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Projeto" className="min-w-[180px] flex-1">
        <Select value={projeto?.id ?? ''} disabled={!!rodando} onChange={(e) => setProjectId(e.target.value)}>
          {ativos.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.nome}</option>)}
        </Select>
      </Field>
      <Field label="Disciplina" className="w-40">
        <Select value={rodando?.disciplina ?? disciplinaValida ?? ''} disabled={!!rodando} onChange={(e) => setDisciplina(e.target.value as Disciplina)}>
          {disciplinas.map((d) => <option key={d} value={d}>{DISCIPLINA_LABEL[d]}</option>)}
        </Select>
      </Field>
      <div className="flex items-center gap-3">
        <span className={cn('tabular w-24 text-right text-xl font-semibold', !rodando && 'text-muted-foreground')} aria-live="off">{relogio}</span>
        {rodando
          ? <Button variant="destructive" onClick={() => void parar()}><Pause className="h-4 w-4" />Parar e lançar</Button>
          : <Button onClick={iniciar} disabled={!projeto || !disciplinaValida}><Play className="h-4 w-4" />Iniciar</Button>}
      </div>
      {msg && <p role="status" className="w-full text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}

export interface MargemProjeto { projeto: Project; horas: number; custo: number; margem: number; margemPct: number }

/** Margem real = honorários contratados − horas técnicas × custo/hora do escritório. */
export function calcularMargens(projetos: Project[], lancamentos: TimesheetEntry[], custoHora: number): MargemProjeto[] {
  const minutos = new Map<string, number>();
  for (const l of lancamentos) minutos.set(l.projectId, (minutos.get(l.projectId) ?? 0) + l.minutos);
  return projetos.map((projeto) => {
    const horas = (minutos.get(projeto.id) ?? 0) / 60;
    const custo = horas * custoHora;
    const margem = projeto.valorContratado - custo;
    return { projeto, horas, custo, margem, margemPct: projeto.valorContratado > 0 ? margem / projeto.valorContratado : 0 };
  });
}

export function TabelaMargem({ margens }: { margens: MargemProjeto[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Projeto</th>
            <th className="tabular px-3 py-2 text-right font-medium">Horas</th>
            <th className="tabular px-3 py-2 text-right font-medium">Contratado</th>
            <th className="tabular px-3 py-2 text-right font-medium">Custo técnico</th>
            <th className="tabular py-2 pl-3 text-right font-medium">Margem real</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {margens.map(({ projeto, horas, custo, margem, margemPct }) => (
            <tr key={projeto.id}>
              <td className="max-w-[220px] truncate py-2 pr-3">{projeto.nome}</td>
              <td className="tabular whitespace-nowrap px-3 py-2 text-right">{num(horas, 0)} h</td>
              <td className="tabular px-3 py-2 text-right">{brl(projeto.valorContratado, 0)}</td>
              <td className="tabular px-3 py-2 text-right">{brl(custo, 0)}</td>
              <td className={cn('tabular whitespace-nowrap py-2 pl-3 text-right font-medium', margem < 0 ? 'text-destructive' : margemPct < 0.15 ? 'text-warning' : '')}>
                {margem < 0 ? '▼ ' : ''}{brl(margem, 0)} <span className="font-normal text-muted-foreground">({pct(margemPct, 0)})</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
