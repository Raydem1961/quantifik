'use client';
import * as React from 'react';
import type { ParcelaMensal } from '@/lib/cub/schedule';
import { brl, brlCompacto, pct } from '@/lib/format';

/**
 * Desembolso mensal (barras) e avanço acumulado (linha) em dois painéis com o mesmo eixo de
 * meses — duas escalas diferentes nunca dividem o mesmo eixo vertical.
 */
export function CurvaSChart({ parcelas }: { parcelas: ParcelaMensal[] }) {
  const [foco, setFoco] = React.useState<number | null>(null);
  const W = 720, M = { l: 64, r: 12 };
  const hLinha = 120, hBarras = 130, gap = 26, topo = 8;
  const H = topo + hLinha + gap + hBarras + 22;
  const n = parcelas.length;
  const larg = (W - M.l - M.r) / n;
  const cx = (i: number) => M.l + larg * (i + 0.5);
  const maxValor = Math.max(...parcelas.map((p) => p.valor), 1);
  const yLinha = (v: number) => topo + hLinha * (1 - v);
  const baseBarras = topo + hLinha + gap + hBarras;
  const yBarra = (v: number) => baseBarras - (v / maxValor) * (hBarras - 8);
  const pontos = [`${M.l},${yLinha(0)}`, ...parcelas.map((p, i) => `${M.l + larg * (i + 1)},${yLinha(p.percentualAcumulado)}`)].join(' ');
  const passoX = Math.ceil(n / 12);
  const p = foco !== null ? parcelas[foco] : undefined;

  return (
    <figure className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Curva S: desembolso em ${n} meses, pico de ${brl(maxValor, 0)}`}
        onMouseLeave={() => setFoco(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const xSvg = ((e.clientX - r.left) / r.width) * W;
          const i = Math.floor((xSvg - M.l) / larg);
          setFoco(i >= 0 && i < n ? i : null);
        }}>
        {/* painel 1: acumulado */}
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={yLinha(v)} y2={yLinha(v)} stroke="var(--chart-grid)" strokeWidth={1} />
            <text x={M.l - 8} y={yLinha(v) + 3} textAnchor="end" className="fill-muted-foreground text-[12px]">{v * 100}%</text>
          </g>
        ))}
        <text x={M.l} y={topo + 2} className="fill-muted-foreground text-[12px]" dy={-1}>Acumulado</text>
        <polyline points={pontos} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {/* painel 2: mensal */}
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={yBarra(maxValor * v)} y2={yBarra(maxValor * v)} stroke="var(--chart-grid)" strokeWidth={1} />
            <text x={M.l - 8} y={yBarra(maxValor * v) + 3} textAnchor="end" className="fill-muted-foreground text-[12px]">{v === 0 ? '0' : brlCompacto(maxValor * v).replace('R$ ', '')}</text>
          </g>
        ))}
        <text x={M.l} y={topo + hLinha + gap - 6} className="fill-muted-foreground text-[12px]">Desembolso mensal (R$)</text>
        {parcelas.map((par, i) => {
          const y = yBarra(par.valor);
          const w = Math.max(larg - 2, 1);
          const h = baseBarras - y;
          const r = Math.min(4, w / 2, h);
          const x = cx(i) - w / 2;
          return (
            <g key={par.mes}>
              <path d={`M${x},${baseBarras} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${baseBarras} Z`}
                fill="var(--series-1)" opacity={foco === null || foco === i ? 1 : 0.45} />
              {i % passoX === 0 && <text x={cx(i)} y={baseBarras + 14} textAnchor="middle" className="fill-muted-foreground text-[12px]">{par.mes}</text>}
            </g>
          );
        })}
        {foco !== null && p && (
          <g pointerEvents="none">
            <line x1={cx(foco)} x2={cx(foco)} y1={topo} y2={baseBarras} stroke="hsl(var(--foreground))" strokeOpacity={0.35} strokeWidth={1} />
            <circle cx={M.l + larg * (foco + 1)} cy={yLinha(p.percentualAcumulado)} r={4} fill="var(--series-1)" stroke="hsl(var(--card))" strokeWidth={2} />
          </g>
        )}
      </svg>
      {foco !== null && p && (
        <div role="status" className="pointer-events-none absolute top-0 rounded-md border bg-card px-2.5 py-1.5 text-xs shadow-md" style={{ left: `clamp(0px, calc(${(cx(foco) / W) * 100}% - 70px), calc(100% - 150px))` }}>
          <p className="font-medium">Mês {p.mes}</p>
          <p className="tabular text-muted-foreground">{brl(p.valor, 0)} · {pct(p.percentual)}</p>
          <p className="tabular text-muted-foreground">Acumulado {pct(p.percentualAcumulado)}</p>
        </div>
      )}
      <figcaption className="sr-only">Eixo horizontal: meses de obra.</figcaption>
    </figure>
  );
}
