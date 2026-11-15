'use client';
/** Blocos visuais compartilhados pelo Início e pelas páginas de área. */
import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowUpRight, CheckCircle2, CircleAlert } from 'lucide-react';
import { brl, brlCompacto } from '@/lib/format';
import type { Kpi, Pendencia } from '@/lib/indicadores';
import { areaPorId, corDaArea } from '@/lib/modulos';
import { cn } from '@/lib/utils';

export function CartaoKpi({ k, atraso = 0 }: { k: Kpi; atraso?: number }) {
  return (
    <div className="entrar rounded-2xl border bg-card p-4" style={{ animationDelay: `${atraso}ms` }}>
      <p className="flex items-center justify-between gap-2 text-xs text-muted-foreground">{k.rotulo}{k.alerta && <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-label="Atenção" />}</p>
      <p className="tabular mt-2 text-2xl font-semibold tracking-tight">{k.valor}</p>
      <p className="mt-1 min-h-4 text-xs text-muted-foreground">{k.detalhe}</p>
    </div>
  );
}

export function ListaPendencias({ itens, vazio = 'Nada pendente. Tudo em dia por aqui.' }: { itens: Pendencia[]; vazio?: string }) {
  if (!itens.length) return <p className="flex items-center gap-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-success" />{vazio}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {itens.map((p, i) => {
        const a = areaPorId(p.area);
        return (
          <li key={`${p.titulo}${i}`} style={a ? corDaArea(a.matiz) : undefined}>
            <Link href={p.href} className="tile group flex items-center gap-3 !rounded-xl p-3">
              <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg', p.gravidade === 'critica' ? 'bg-destructive/15 text-destructive' : 'bg-warning/15 text-warning')}>
                {p.gravidade === 'critica' ? <CircleAlert className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{p.titulo}</span>
                <span className="block truncate text-xs text-muted-foreground">{a?.nome} · {p.detalhe}</span>
              </span>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

interface Mes { key: string; label: string; inflow: number; outflow: number; balance: number }
/** Entradas × saídas por mês (barras) com o saldo acumulado escrito embaixo de cada mês. */
export function FluxoCaixa({ meses }: { meses: Mes[] }) {
  const [foco, setFoco] = React.useState<number | null>(null);
  if (!meses.length) return <p className="text-sm text-muted-foreground">Sem lançamentos para projetar.</p>;
  const W = 640, H = 190, M = { l: 8, r: 8, t: 10, b: 44 };
  const max = Math.max(1, ...meses.flatMap((m) => [m.inflow, m.outflow]));
  const faixa = (W - M.l - M.r) / meses.length, barra = Math.min(26, faixa / 3.2);
  const y = (v: number) => M.t + (H - M.t - M.b) * (1 - v / max);
  const m = foco !== null ? meses[foco] : undefined;
  return (
    <figure>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--series-3)' }} />Entradas</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--series-2)' }} />Saídas</span>
        <span className="ml-auto tabular min-h-4">{m ? `${m.label}: entra ${brl(m.inflow, 0)} · sai ${brl(m.outflow, 0)} · saldo ${brl(m.balance, 0)}` : 'Passe o mouse ou toque em um mês'}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Fluxo de caixa projetado em ${meses.length} meses`} onMouseLeave={() => setFoco(null)}>
        <line x1={M.l} x2={W - M.r} y1={y(0)} y2={y(0)} stroke="var(--chart-grid)" />
        {meses.map((x, i) => {
          const cx = M.l + faixa * (i + 0.5);
          return (
            <g key={x.key} onMouseEnter={() => setFoco(i)} onClick={() => setFoco(i)} opacity={foco === null || foco === i ? 1 : 0.45}>
              <rect x={M.l + faixa * i} y={0} width={faixa} height={H} fill="transparent" />
              <rect x={cx - barra - 1} y={y(x.inflow)} width={barra} height={Math.max(0, y(0) - y(x.inflow))} rx={3} fill="var(--series-3)" />
              <rect x={cx + 1} y={y(x.outflow)} width={barra} height={Math.max(0, y(0) - y(x.outflow))} rx={3} fill="var(--series-2)" />
              <text x={cx} y={H - 26} textAnchor="middle" className="fill-muted-foreground" fontSize={11}>{x.label}</text>
              <text x={cx} y={H - 10} textAnchor="middle" fontSize={11} className={cn('tabular', x.balance < 0 ? 'fill-destructive' : 'fill-foreground')} fontWeight={600}>{brlCompacto(x.balance)}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 text-xs text-muted-foreground">O valor abaixo de cada mês é o saldo acumulado previsto.</figcaption>
    </figure>
  );
}

/** Barra dupla: planejado (fina) × realizado (cheia). */
export function Avanco({ nome, planejado, realizado, detalhe }: { nome: string; planejado: number; realizado: number; detalhe?: string }) {
  const atras = realizado - planejado <= -5;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm"><span className="truncate font-medium">{nome}</span>
        <span className={cn('tabular shrink-0 text-xs', atras ? 'text-destructive' : 'text-muted-foreground')}>{realizado.toFixed(0)}% feito · {planejado.toFixed(0)}% previsto</span></div>
      <div className="relative mt-1.5 h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${nome}: ${realizado.toFixed(0)}% realizado de ${planejado.toFixed(0)}% planejado`}>
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.min(100, realizado)}%`, background: atras ? 'hsl(var(--destructive))' : 'hsl(var(--area, var(--primary)))' }} />
        <div className="absolute top-0 h-full w-0.5 bg-foreground/70" style={{ left: `${Math.min(100, planejado)}%` }} />
      </div>
      {detalhe && <p className="mt-1 text-xs text-muted-foreground">{detalhe}</p>}
    </div>
  );
}
