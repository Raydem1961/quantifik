'use client';
import * as React from 'react';
import { cpm } from '@/lib/obratop/vendor/msproject.mjs';
import { dataBr } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface AtividadeGantt { id: string; wbs?: string; name: string; start: string; end: string; progress?: number; predecessors?: string; status?: string; responsible?: string }

const DIA = 86400000;
const t = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`).getTime();
const cmpWbs = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

/**
 * Gantt de uma obra: barra = período planejado, preenchimento = progresso, contorno vermelho =
 * caminho crítico (CPM do ObraTop, em dias úteis, a partir das predecessoras por código EAP).
 */
export function GanttObra({ atividades, linhaBase, onAbrir }: { atividades: AtividadeGantt[]; linhaBase?: Record<string, { s: string; e: string }>; onAbrir?: (id: string) => void }) {
  const [foco, setFoco] = React.useState<string | null>(null);
  const validas = React.useMemo(() => atividades.filter((a) => a.start && a.end).sort((a, b) => cmpWbs(a.wbs ?? '', b.wbs ?? '') || a.start.localeCompare(b.start)), [atividades]);
  const critico = React.useMemo(() => cpm(validas.map((a) => ({ id: a.id, wbs: String(a.wbs ?? ''), start: a.start, end: a.end, pred: a.predecessors ?? '' }))), [validas]);
  if (validas.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma atividade com datas nesta obra.</p>;

  const bases = linhaBase ? validas.map((a) => linhaBase[a.id]).filter((b): b is { s: string; e: string } => !!b?.s && !!b?.e) : [];
  const inicio = Math.min(...validas.map((a) => t(a.start)), ...bases.map((b) => t(b.s)));
  const fim = Math.max(...validas.map((a) => t(a.end)), ...bases.map((b) => t(b.e))) + DIA;
  const span = Math.max(fim - inicio, DIA);
  const x = (ms: number) => ((ms - inicio) / span) * 100;
  const meses: { rotulo: string; pos: number }[] = [];
  const cursor = new Date(inicio);
  cursor.setDate(1);
  while (cursor.getTime() < fim) {
    if (cursor.getTime() >= inicio) meses.push({ rotulo: cursor.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', ''), pos: x(cursor.getTime()) });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  const passo = Math.ceil(meses.length / 10);
  const hoje = Date.now();
  const nCriticas = validas.filter((a) => critico.get(a.id)?.critical).length;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-sm" style={{ background: 'color-mix(in srgb, var(--series-1) 30%, transparent)' }} />planejado</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-sm" style={{ background: 'var(--series-1)' }} />executado</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-sm border-2 border-destructive" />caminho crítico ({nCriticas})</span>
        {bases.length > 0 && <span className="flex items-center gap-1.5"><span className="h-1 w-5 rounded-sm bg-muted-foreground/60" />linha de base</span>}
        <span>{validas.length} atividades · {dataBr(new Date(inicio).toISOString())} a {dataBr(new Date(fim - DIA).toISOString())}</span>
      </div>
      <div className="grid grid-cols-[minmax(150px,280px)_1fr] gap-x-3 text-xs">
        <div />
        <div className="relative h-5 border-b">
          {meses.map((m, i) => i % passo === 0 && <span key={i} className="absolute text-[10px] text-muted-foreground" style={{ left: `${m.pos}%` }}>{m.rotulo}</span>)}
        </div>
        {validas.map((a) => {
          const ini = x(t(a.start));
          const larg = Math.max(x(t(a.end) + DIA) - ini, 0.6);
          const c = critico.get(a.id);
          const pct = Math.max(0, Math.min(100, Number(a.progress) || 0));
          const atrasada = t(a.end) < hoje && pct < 100;
          return (
            <React.Fragment key={a.id}>
              <button type="button" onClick={() => onAbrir?.(a.id)} className="truncate py-1.5 pr-1 text-left hover:underline" title={`${a.wbs ?? ''} ${a.name}`}>
                <span className="tabular mr-1.5 text-muted-foreground">{a.wbs}</span>{a.name}
              </button>
              <div className="relative py-1.5" onMouseEnter={() => setFoco(a.id)} onMouseLeave={() => setFoco(null)}>
                {meses.map((m, i) => <span key={i} className="absolute inset-y-0 w-px bg-border/60" style={{ left: `${m.pos}%` }} />)}
                {hoje > inicio && hoje < fim && <span className="absolute inset-y-0 w-px bg-foreground/50" style={{ left: `${x(hoje)}%` }} />}
                <div tabIndex={0} onFocus={() => setFoco(a.id)} onBlur={() => setFoco(null)}
                  aria-label={`${a.name}: ${dataBr(a.start)} a ${dataBr(a.end)}, ${pct}% executado${c?.critical ? ', no caminho crítico' : ''}${atrasada ? ', atrasada' : ''}`}
                  className={cn('relative h-3.5 overflow-hidden rounded-sm outline-none ring-ring focus-visible:ring-2', c?.critical && 'ring-2 ring-destructive')}
                  style={{ marginLeft: `${ini}%`, width: `${larg}%`, background: 'color-mix(in srgb, var(--series-1) 30%, transparent)' }}>
                  <div className="h-full" style={{ width: `${pct}%`, background: 'var(--series-1)' }} />
                </div>
                {linhaBase?.[a.id] && <div aria-hidden className="mt-0.5 h-1 rounded-sm bg-muted-foreground/60" style={{ marginLeft: `${x(t(linhaBase[a.id]!.s))}%`, width: `${Math.max(x(t(linhaBase[a.id]!.e) + DIA) - x(t(linhaBase[a.id]!.s)), 0.6)}%` }} />}
                {foco === a.id && (
                  <div role="tooltip" className="pointer-events-none absolute -top-8 z-10 whitespace-nowrap rounded-md border bg-card px-2 py-1 shadow-md" style={{ left: `min(${ini}%, calc(100% - 300px))` }}>
                    {dataBr(a.start)} → {dataBr(a.end)} · {pct}%{c ? ` · folga ${Math.max(0, c.slack)} d` : ''}{c?.critical ? ' · crítica' : ''}{linhaBase?.[a.id] && linhaBase[a.id]!.e !== a.end ? ` · base terminava em ${dataBr(linhaBase[a.id]!.e)}` : ''}{atrasada && <span className="text-destructive"> · atrasada</span>}
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
