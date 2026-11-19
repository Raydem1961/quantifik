'use client';
/** Componentes de fotos: visualizador em tela cheia, editor do diário e relatório fotográfico por dia. */
import * as React from 'react';
import { Camera, ChevronLeft, ChevronRight, Download, EyeOff, ImagePlus, Printer, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { dataBr } from '@/lib/format';
import { MAX_FOTOS_POR_DIA, type FotoDiario, type FotoNova } from '@/lib/fotos';
import { cn } from '@/lib/utils';

export interface FotoVisivel { url: string; thumb: string; legenda: string; servico?: string; data?: string; largura?: number; altura?: number }

/** Visualizador em tela cheia: setas do teclado, deslizar no celular, Esc fecha. */
export function Visualizador({ fotos, indice, onFechar }: { fotos: FotoVisivel[]; indice: number; onFechar: () => void }) {
  const [i, setI] = React.useState(indice);
  const toque = React.useRef<number | null>(null);
  const ir = React.useCallback((d: number) => setI((x) => (x + d + fotos.length) % fotos.length), [fotos.length]);
  React.useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); else if (e.key === 'ArrowRight') ir(1); else if (e.key === 'ArrowLeft') ir(-1); };
    window.addEventListener('keydown', tecla);
    const antes = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', tecla); document.body.style.overflow = antes; };
  }, [ir, onFechar]);
  const f = fotos[i];
  if (!f) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={`Foto ${i + 1} de ${fotos.length}`} className="fixed inset-0 z-[60] flex flex-col bg-black/95 text-white print:hidden"
      onTouchStart={(e) => { toque.current = e.touches[0]?.clientX ?? null; }} onTouchEnd={(e) => { const x0 = toque.current, x1 = e.changedTouches[0]?.clientX; if (x0 != null && x1 != null && Math.abs(x1 - x0) > 50) ir(x1 < x0 ? 1 : -1); toque.current = null; }}>
      <div className="flex items-center gap-3 px-4 py-3 text-sm">
        <span className="tabular text-white/70">{i + 1} / {fotos.length}</span>
        <span className="min-w-0 flex-1 truncate">{[f.data && dataBr(f.data), f.servico].filter(Boolean).join(' · ')}</span>
        <a href={f.url} target="_blank" rel="noreferrer" download className="grid h-9 w-9 place-items-center rounded-md hover:bg-white/10" aria-label="Abrir a foto original"><Download className="h-4 w-4" /></a>
        <button type="button" onClick={onFechar} className="grid h-9 w-9 place-items-center rounded-md hover:bg-white/10" aria-label="Fechar"><X className="h-5 w-5" /></button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2" onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- foto do Storage, dimensões variáveis */}
        <img src={f.url} alt={f.legenda || f.servico || 'Foto da obra'} className="max-h-full max-w-full object-contain" />
        {fotos.length > 1 && <>
          <button type="button" onClick={() => ir(-1)} className="absolute left-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/50 hover:bg-black/70" aria-label="Foto anterior"><ChevronLeft className="h-6 w-6" /></button>
          <button type="button" onClick={() => ir(1)} className="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/50 hover:bg-black/70" aria-label="Próxima foto"><ChevronRight className="h-6 w-6" /></button>
        </>}
      </div>
      {f.legenda && <p className="px-4 py-3 text-center text-sm text-white/90">{f.legenda}</p>}
    </div>
  );
}

/** Grade de miniaturas que abre o visualizador. */
export function GradeFotos({ fotos, className }: { fotos: FotoVisivel[]; className?: string }) {
  const [aberta, setAberta] = React.useState<number | null>(null);
  return (
    <>
      <ul className={cn('grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-3', className)}>
        {fotos.map((f, i) => (
          <li key={`${f.url}${i}`} className="break-inside-avoid">
            <button type="button" onClick={() => setAberta(i)} className="group block w-full overflow-hidden rounded-lg border bg-muted text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Ampliar foto${f.legenda ? `: ${f.legenda}` : ''}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- miniatura do Storage */}
              <img src={f.thumb} alt={f.legenda || f.servico || 'Foto da obra'} loading="lazy" className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
            </button>
            {(f.legenda || f.servico) && <p className="mt-1 text-xs leading-snug"><span className="text-foreground">{f.legenda}</span>{f.servico && <span className="block text-muted-foreground">{f.servico}</span>}</p>}
          </li>
        ))}
      </ul>
      {aberta !== null && <Visualizador fotos={fotos} indice={aberta} onFechar={() => setAberta(null)} />}
    </>
  );
}

function BotaoFotos({ camera, desabilitado, onArquivos }: { camera?: boolean; desabilitado?: boolean; onArquivos: (l: FileList | null) => void }) {
  return (
    <label className={cn('inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input px-3 text-sm font-medium hover:bg-accent focus-within:ring-2 focus-within:ring-ring', desabilitado && 'pointer-events-none opacity-50')}>
      {camera ? <Camera className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" />}{camera ? 'Tirar foto' : 'Escolher fotos'}
      <input type="file" accept="image/*" multiple={!camera} {...(camera ? { capture: 'environment' as const } : {})} className="sr-only" disabled={desabilitado} onChange={(e) => { onArquivos(e.target.files); e.target.value = ''; }} />
    </label>
  );
}

interface PropsCartao { src: string; legenda: string; activityId: string; privada: boolean; nova?: boolean; desabilitado?: boolean; atividades: { id: string; rotulo: string }[];
  onLegenda: (v: string) => void; onServico: (v: string) => void; onPrivada: (v: boolean) => void; onRemover: () => void }
function CartaoFoto({ src, legenda, activityId, privada, nova, desabilitado, atividades, onLegenda, onServico, onPrivada, onRemover }: PropsCartao) {
  return (
    <li className="overflow-hidden rounded-xl border bg-card">
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element -- prévia local ou miniatura do Storage */}
        <img src={src} alt={legenda || 'Foto do dia'} className="aspect-[4/3] w-full object-cover" />
        {nova && <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">nova</span>}
        {privada && <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white"><EyeOff className="h-3 w-3" />interna</span>}
        <button type="button" disabled={desabilitado} onClick={onRemover} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80" aria-label={`Remover foto${legenda ? ` ${legenda}` : ''}`}><Trash2 className="h-4 w-4" /></button>
      </div>
      <div className="flex flex-col gap-2 p-2.5">
        <Input aria-label="Legenda da foto" placeholder="Legenda (o que a foto mostra)" maxLength={240} value={legenda} disabled={desabilitado} onChange={(e) => onLegenda(e.target.value)} />
        {atividades.length > 0 && <Select aria-label="Serviço fotografado" value={activityId} disabled={desabilitado} onChange={(e) => onServico(e.target.value)}><option value="">Serviço (opcional)</option>{atividades.map((a) => <option key={a.id} value={a.id}>{a.rotulo}</option>)}</Select>}
        <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={privada} disabled={desabilitado} onChange={(e) => onPrivada(e.target.checked)} />Uso interno (não mostrar ao cliente)</label>
      </div>
    </li>
  );
}

/** Fotos dentro do formulário do diário: as já enviadas e as novas, com legenda e serviço. */
export function EditorFotos({ atuais, setAtuais, novas, setNovas, atividades, desabilitado }: {
  atuais: FotoDiario[]; setAtuais: (f: FotoDiario[]) => void; novas: FotoNova[]; setNovas: (f: FotoNova[]) => void;
  atividades: { id: string; rotulo: string }[]; desabilitado?: boolean;
}) {
  const [aviso, setAviso] = React.useState('');
  React.useEffect(() => () => novas.forEach((n) => URL.revokeObjectURL(n.previa)), []); // eslint-disable-line react-hooks/exhaustive-deps -- só ao desmontar
  const total = atuais.length + novas.length;
  const adicionar = (lista: FileList | null) => {
    if (!lista) return;
    const imagens = [...lista].filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name));
    const cabem = imagens.slice(0, Math.max(0, MAX_FOTOS_POR_DIA - total));
    setAviso(imagens.length > cabem.length ? `Limite de ${MAX_FOTOS_POR_DIA} fotos por dia: ${imagens.length - cabem.length} não foram incluídas.` : imagens.length < lista.length ? 'Arquivos que não são imagens foram ignorados.' : '');
    setNovas([...novas, ...cabem.map((arquivo) => ({ chave: `${arquivo.name}-${arquivo.size}-${Math.random()}`, arquivo, previa: URL.createObjectURL(arquivo), legenda: '', activityId: '', privada: false }))]);
  };
  return (
    <fieldset className="sm:col-span-2 lg:col-span-3">
      <legend className="mb-2 text-xs font-medium text-muted-foreground">Fotos do dia ({total}/{MAX_FOTOS_POR_DIA})</legend>
      <div className="flex flex-wrap gap-2"><BotaoFotos camera desabilitado={desabilitado} onArquivos={adicionar} /><BotaoFotos desabilitado={desabilitado} onArquivos={adicionar} /></div>
      {aviso && <p role="status" className="mt-2 text-xs text-warning">{aviso}</p>}
      {total > 0 && (
        <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {atuais.map((f, i) => <CartaoFoto key={f.id} atividades={atividades} desabilitado={desabilitado} src={f.thumb} legenda={f.legenda} activityId={f.activityId} privada={f.privada}
            onLegenda={(v) => setAtuais(atuais.map((x, j) => (j === i ? { ...x, legenda: v } : x)))} onServico={(v) => setAtuais(atuais.map((x, j) => (j === i ? { ...x, activityId: v } : x)))}
            onPrivada={(v) => setAtuais(atuais.map((x, j) => (j === i ? { ...x, privada: v } : x)))} onRemover={() => setAtuais(atuais.filter((_, j) => j !== i))} />)}
          {novas.map((n, i) => <CartaoFoto key={n.chave} nova atividades={atividades} desabilitado={desabilitado} src={n.previa} legenda={n.legenda} activityId={n.activityId} privada={n.privada}
            onLegenda={(v) => setNovas(novas.map((x, j) => (j === i ? { ...x, legenda: v } : x)))} onServico={(v) => setNovas(novas.map((x, j) => (j === i ? { ...x, activityId: v } : x)))}
            onPrivada={(v) => setNovas(novas.map((x, j) => (j === i ? { ...x, privada: v } : x)))} onRemover={() => { URL.revokeObjectURL(n.previa); setNovas(novas.filter((_, j) => j !== i)); }} />)}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted-foreground">As fotos são reduzidas no aparelho antes do envio (economiza dados e espaço). O cliente vê as fotos quando o diário do dia estiver <b>Assinado</b> e o portal dele estiver liberado.</p>
    </fieldset>
  );
}

export interface DiaFotos { data: string; titulo?: string; clima?: string; servicos?: string; fotos: FotoVisivel[] }

/** Relatório fotográfico: um bloco por dia, do mais recente para o mais antigo; imprime em PDF. */
export function RelatorioFotografico({ dias, cabecalho, vazio = 'Nenhuma foto no período.' }: { dias: DiaFotos[]; cabecalho?: React.ReactNode; vazio?: string }) {
  const total = dias.reduce((t, d) => t + d.fotos.length, 0);
  const raiz = React.useRef<HTMLDivElement>(null);
  const [preparando, setPreparando] = React.useState(false);
  // Imprime só o relatório: as miniaturas "preguiçosas" são carregadas antes de abrir a impressão.
  const imprimir = async () => {
    setPreparando(true);
    const imgs = [...(raiz.current?.querySelectorAll('img') ?? [])];
    imgs.forEach((i) => { i.loading = 'eager'; });
    await Promise.race([Promise.all(imgs.map((i) => (i.complete ? Promise.resolve() : i.decode().catch(() => undefined)))), new Promise((r) => setTimeout(r, 10000))]);
    setPreparando(false);
    document.body.dataset.imprimir = 'fotos';
    const limpar = () => { delete document.body.dataset.imprimir; window.removeEventListener('afterprint', limpar); };
    window.addEventListener('afterprint', limpar);
    window.print();
    setTimeout(limpar, 1500);
  };
  return (
    <div className="relatorio-fotos" ref={raiz}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-muted-foreground">{total} foto(s) em {dias.length} dia(s)</p>
        {total > 0 && <Button variant="outline" disabled={preparando} onClick={() => void imprimir()}><Printer className="h-4 w-4" />{preparando ? 'Preparando fotos…' : 'Imprimir / salvar PDF'}</Button>}
      </div>
      {cabecalho && <div className="hidden print:block">{cabecalho}</div>}
      {dias.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{vazio}</p> : (
        <ol className="flex flex-col gap-6">
          {dias.map((d) => (
            <li key={`${d.data}${d.titulo ?? ''}`} className="break-inside-avoid">
              <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b pb-2">
                <h3 className="text-sm font-semibold">{new Date(`${d.data}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</h3>
                {d.titulo && <span className="text-xs font-medium text-primary">{d.titulo}</span>}
                {d.clima && <span className="text-xs text-muted-foreground">Clima: {d.clima}</span>}
                <span className="ml-auto text-xs text-muted-foreground">{d.fotos.length} foto(s)</span>
              </div>
              {d.servicos && <p className="mb-3 text-sm text-muted-foreground">{d.servicos}</p>}
              <GradeFotos fotos={d.fotos} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
