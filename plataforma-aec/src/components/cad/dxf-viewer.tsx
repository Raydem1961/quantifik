'use client';
/**
 * Visualizador DXF leve (Canvas 2D): pan (arrastar), zoom (roda do mouse), camadas e redlines.
 * As marcações são guardadas em coordenadas do desenho, então acompanham pan/zoom e revisões.
 */
import * as React from 'react';
import { Eraser, Hand, Maximize, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DxfDocument, DxfEntity, Ponto, Vertice } from '@/lib/cad/dxf-qto';
import { cn } from '@/lib/utils';

export interface Marcacao { id: string; pontos: Ponto[]; cor: string }
interface Vista { escala: number; ox: number; oy: number }

// Índice de cores do AutoCAD (ACI) 1–7; demais caem em cinza.
const ACI = ['#9ca3af', '#ef4444', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#d946ef', '#9ca3af'];

function tracarPolilinha(ctx: CanvasRenderingContext2D, v: Vertice[], fechada: boolean) {
  if (v.length === 0) return;
  ctx.moveTo(v[0]!.x, v[0]!.y);
  const n = fechada ? v.length : v.length - 1;
  for (let i = 0; i < n; i++) {
    const a = v[i]!;
    const b = v[(i + 1) % v.length]!;
    if (a.bulge === 0) { ctx.lineTo(b.x, b.y); continue; }
    // Arco definido por bulge: centro a partir da corda e do ângulo θ = 4·atan(bulge).
    const theta = 4 * Math.atan(a.bulge);
    const corda = Math.hypot(b.x - a.x, b.y - a.y);
    const r = corda / (2 * Math.sin(Math.abs(theta) / 2));
    const d = r * Math.cos(Math.abs(theta) / 2) * Math.sign(a.bulge);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const cx = mx - (d * (b.y - a.y)) / corda, cy = my + (d * (b.x - a.x)) / corda;
    ctx.arc(cx, cy, r, Math.atan2(a.y - cy, a.x - cx), Math.atan2(b.y - cy, b.x - cx), a.bulge < 0);
  }
  if (fechada) ctx.closePath();
}

function desenhar(ctx: CanvasRenderingContext2D, e: DxfEntity, pxPorUnidade: number) {
  const rad = (g: number) => (g * Math.PI) / 180;
  ctx.beginPath();
  switch (e.tipo) {
    case 'LINE': ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y); break;
    case 'POLYLINE': tracarPolilinha(ctx, e.vertices, e.fechada); break;
    case 'CIRCLE': ctx.arc(e.centro.x, e.centro.y, e.raio, 0, Math.PI * 2); break;
    case 'ARC': ctx.arc(e.centro.x, e.centro.y, e.raio, rad(e.anguloInicial), rad(e.anguloFinal)); break;
    case 'ELLIPSE': {
      const a = Math.hypot(e.eixoMaior.x, e.eixoMaior.y);
      ctx.ellipse(e.centro.x, e.centro.y, a, a * e.razao, Math.atan2(e.eixoMaior.y, e.eixoMaior.x), e.inicio, e.fim);
      break;
    }
    case 'HATCH':
      e.contornos.forEach((c) => tracarPolilinha(ctx, c, true));
      ctx.save(); ctx.globalAlpha = 0.15; ctx.fill('evenodd'); ctx.restore();
      break;
    case 'INSERT': { // bloco: marcador em cruz de 6 px
      const s = 6 / pxPorUnidade;
      ctx.moveTo(e.posicao.x - s, e.posicao.y); ctx.lineTo(e.posicao.x + s, e.posicao.y);
      ctx.moveTo(e.posicao.x, e.posicao.y - s); ctx.lineTo(e.posicao.x, e.posicao.y + s);
      break;
    }
    case 'TEXT': {
      const px = e.altura * pxPorUnidade;
      if (px < 5) return; // ilegível neste zoom
      ctx.save();
      ctx.translate(e.posicao.x, e.posicao.y);
      ctx.scale(1, -1); // o eixo Y do desenho aponta para cima; o do canvas, para baixo
      ctx.font = `${e.altura}px sans-serif`;
      ctx.fillText(e.texto, 0, 0);
      ctx.restore();
      return;
    }
  }
  ctx.stroke();
}

export function DxfViewer({ doc, extensao, marcacoes, onNovaMarcacao, onLimpar, className }: {
  doc: DxfDocument;
  extensao: { minX: number; minY: number; maxX: number; maxY: number } | null;
  marcacoes: Marcacao[];
  onNovaMarcacao?: (pontos: Ponto[]) => void;
  onLimpar?: () => void;
  className?: string;
}) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const [vista, setVista] = React.useState<Vista | null>(null);
  const [modo, setModo] = React.useState<'mover' | 'marcar'>('mover');
  const [ocultas, setOcultas] = React.useState<Set<string>>(new Set());
  const [tamanho, setTamanho] = React.useState({ w: 0, h: 0 });
  const arrasto = React.useRef<{ x: number; y: number } | null>(null);
  const traco = React.useRef<Ponto[] | null>(null);
  const [, redesenhar] = React.useReducer((x: number) => x + 1, 0);

  const enquadrar = React.useCallback(() => {
    if (!extensao || !tamanho.w) return;
    const w = Math.max(extensao.maxX - extensao.minX, 1e-6), h = Math.max(extensao.maxY - extensao.minY, 1e-6);
    const escala = Math.min(tamanho.w / w, tamanho.h / h) * 0.9;
    setVista({ escala, ox: tamanho.w / 2 - ((extensao.minX + extensao.maxX) / 2) * escala, oy: tamanho.h / 2 + ((extensao.minY + extensao.maxY) / 2) * escala });
  }, [extensao, tamanho]);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver(() => setTamanho({ w: el.clientWidth, h: el.clientHeight }));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  React.useEffect(enquadrar, [enquadrar, doc]);

  React.useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !vista) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = tamanho.w * dpr;
    canvas.height = tamanho.h * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Mundo → tela, com Y invertido.
    ctx.setTransform(vista.escala * dpr, 0, 0, -vista.escala * dpr, vista.ox * dpr, vista.oy * dpr);
    ctx.lineWidth = 1 / vista.escala;
    ctx.lineJoin = 'round';
    const cores = new Map(doc.layers.map((l) => [l.nome, l.cor]));
    const neutro = getComputedStyle(canvas).color;
    for (const e of doc.entidades) {
      if (ocultas.has(e.layer)) continue;
      const aci = cores.get(e.layer) ?? 7;
      ctx.strokeStyle = ctx.fillStyle = aci >= 1 && aci <= 6 ? ACI[aci]! : neutro;
      desenhar(ctx, e, vista.escala);
    }
    ctx.lineWidth = 2.5 / vista.escala;
    ctx.lineCap = 'round';
    for (const m of [...marcacoes, ...(traco.current ? [{ id: 'atual', pontos: traco.current, cor: '#ef4444' }] : [])]) {
      if (m.pontos.length < 2) continue;
      ctx.strokeStyle = m.cor;
      ctx.beginPath();
      m.pontos.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    }
  });

  const paraMundo = (e: React.PointerEvent): Ponto => {
    const r = ref.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - vista!.ox) / vista!.escala, y: -(e.clientY - r.top - vista!.oy) / vista!.escala };
  };
  const zoom = (fator: number, cx = tamanho.w / 2, cy = tamanho.h / 2) =>
    setVista((v) => v && { escala: v.escala * fator, ox: cx - (cx - v.ox) * fator, oy: cy - (cy - v.oy) * fator });

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant={modo === 'mover' ? 'secondary' : 'ghost'} aria-pressed={modo === 'mover'} onClick={() => setModo('mover')}><Hand className="h-3.5 w-3.5" />Mover</Button>
        {onNovaMarcacao && <Button size="sm" variant={modo === 'marcar' ? 'secondary' : 'ghost'} aria-pressed={modo === 'marcar'} onClick={() => setModo('marcar')}><Pencil className="h-3.5 w-3.5" />Marcar revisão</Button>}
        <Button size="sm" variant="ghost" onClick={enquadrar}><Maximize className="h-3.5 w-3.5" />Enquadrar</Button>
        <Button size="sm" variant="ghost" aria-label="Aproximar" onClick={() => zoom(1.25)}>+</Button>
        <Button size="sm" variant="ghost" aria-label="Afastar" onClick={() => zoom(0.8)}>−</Button>
        {onLimpar && marcacoes.length > 0 && <Button size="sm" variant="ghost" onClick={onLimpar}><Eraser className="h-3.5 w-3.5" />Limpar marcações ({marcacoes.length})</Button>}
      </div>
      <canvas ref={ref} aria-label="Visualização do desenho DXF"
        className={cn('h-[460px] w-full touch-none rounded-md border bg-muted/30 text-foreground', modo === 'marcar' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing')}
        onWheel={(e) => { const r = e.currentTarget.getBoundingClientRect(); zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); }}
        onPointerDown={(e) => {
          if (!vista) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          if (modo === 'marcar') traco.current = [paraMundo(e)];
          else arrasto.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          if (traco.current) { traco.current.push(paraMundo(e)); redesenhar(); }
          else if (arrasto.current) {
            const dx = e.clientX - arrasto.current.x, dy = e.clientY - arrasto.current.y;
            arrasto.current = { x: e.clientX, y: e.clientY };
            setVista((v) => v && { ...v, ox: v.ox + dx, oy: v.oy + dy });
          }
        }}
        onPointerUp={() => {
          if (traco.current && traco.current.length > 1) onNovaMarcacao?.(traco.current);
          traco.current = null; arrasto.current = null; redesenhar();
        }}
      />
      <div className="flex flex-wrap gap-1.5">
        {doc.layers.map((l) => {
          const oculta = ocultas.has(l.nome);
          return (
            <button key={l.nome} type="button" aria-pressed={!oculta}
              onClick={() => setOcultas((s) => { const n = new Set(s); if (oculta) n.delete(l.nome); else n.add(l.nome); return n; })}
              className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]', oculta && 'text-muted-foreground line-through opacity-60')}>
              <span className="h-2 w-2 rounded-full" style={{ background: l.cor >= 1 && l.cor <= 6 ? ACI[l.cor] : 'currentColor' }} />{l.nome}
            </button>
          );
        })}
      </div>
    </div>
  );
}
