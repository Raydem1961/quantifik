'use client';
import * as React from 'react';
import { dataBr } from '@/lib/format';
import { STATUS_LABEL, type Project } from '@/lib/types';

const DIA = 86400000;
const t = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`).getTime();

/** Gantt dos projetos: barra = prazo contratado, trecho preenchido = progresso, linha vertical = hoje. */
export function Gantt({ projetos }: { projetos: Project[] }) {
  const [foco, setFoco] = React.useState<string | null>(null);
  if (projetos.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">Nenhum projeto no período.</p>;

  const inicio = Math.min(...projetos.map((p) => t(p.inicio)));
  const fim = Math.max(...projetos.map((p) => t(p.fim)), Date.now() + 7 * DIA);
  const span = Math.max(fim - inicio, DIA);
  const x = (ms: number) => ((ms - inicio) / span) * 100;

  // Marcas mensais do eixo.
  const meses: { label: string; pos: number }[] = [];
  const cursor = new Date(inicio);
  cursor.setDate(1);
  cursor.setMonth(cursor.getMonth() + 1);
  while (cursor.getTime() < fim) {
    meses.push({ label: cursor.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', ''), pos: x(cursor.getTime()) });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  const passo = Math.ceil(meses.length / 8); // evita rótulos colados em horizontes longos
  const hoje = x(new Date(new Date().toDateString()).getTime());

  return (
    <div className="grid grid-cols-[minmax(120px,200px)_1fr] gap-x-3 text-xs">
      <div />
      <div className="relative h-5 border-b">
        {meses.map((m, i) => i % passo === 0 && (
          <span key={m.label + i} className="absolute -translate-x-1/2 text-[10px] text-muted-foreground" style={{ left: `${m.pos}%` }}>{m.label}</span>
        ))}
      </div>
      {projetos.map((p) => {
        const ini = x(t(p.inicio));
        const larg = Math.max(x(t(p.fim)) - ini, 1);
        const atrasado = t(p.fim) < Date.now() && p.status !== 'concluido';
        return (
          <React.Fragment key={p.id}>
            <div className="truncate py-2 pr-1" title={p.nome}>
              <span className="font-medium">{p.nome}</span>
            </div>
            <div className="relative py-2" onMouseEnter={() => setFoco(p.id)} onMouseLeave={() => setFoco(null)}>
              {meses.map((m, i) => <span key={i} className="absolute inset-y-0 w-px bg-border/60" style={{ left: `${m.pos}%` }} />)}
              <div tabIndex={0} onFocus={() => setFoco(p.id)} onBlur={() => setFoco(null)}
                aria-label={`${p.nome}: ${dataBr(p.inicio)} a ${dataBr(p.fim)}, ${p.progresso}% concluído${atrasado ? ', atrasado' : ''}`}
                className="relative h-4 overflow-hidden rounded outline-none ring-ring focus-visible:ring-2" style={{ marginLeft: `${ini}%`, width: `${larg}%`, background: 'color-mix(in srgb, var(--series-1) 28%, transparent)' }}>
                <div className="h-full rounded-r" style={{ width: `${p.progresso}%`, background: 'var(--series-1)' }} />
              </div>
              {foco === p.id && (
                <div role="tooltip" className="pointer-events-none absolute z-10 -top-9 whitespace-nowrap rounded-md border bg-card px-2 py-1 shadow-md" style={{ left: `min(${ini}%, calc(100% - 260px))` }}>
                  <span className="font-medium">{STATUS_LABEL[p.status]}</span> · {dataBr(p.inicio)} → {dataBr(p.fim)} · {p.progresso}%{atrasado && <span className="text-destructive"> · atrasado</span>}
                </div>
              )}
            </div>
          </React.Fragment>
        );
      })}
      <div />
      <div className="relative h-0">
        <div className="absolute bottom-0 w-px bg-foreground/60" style={{ left: `${hoje}%`, height: `${projetos.length * 32 + 8}px` }}>
          <span className="absolute -top-4 -translate-x-1/2 rounded bg-foreground px-1 text-[9px] font-medium text-background">hoje</span>
        </div>
      </div>
    </div>
  );
}
