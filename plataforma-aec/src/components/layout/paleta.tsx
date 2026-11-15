'use client';
/** Busca rápida (Ctrl+K): salta para qualquer tela, obra ou projeto digitando parte do nome. */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Building2, CornerDownLeft, FolderKanban, Search } from 'lucide-react';
import { useColecao } from '@/hooks/use-colecao';
import { AREAS, INICIO, corDaArea } from '@/lib/modulos';
import { cn } from '@/lib/utils';

interface Item { chave: string; rotulo: string; detalhe: string; href: string; icone: React.ElementType; matiz?: number; alvo: string }
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function Paleta({ aberta, onFechar }: { aberta: boolean; onFechar: () => void }) {
  const router = useRouter();
  const { dados: obras } = useColecao<{ id: string; name?: string; client?: string; deleted?: boolean }>(aberta ? 'works' : null);
  const { dados: projetos } = useColecao<{ id: string; nome?: string; codigo?: string; clienteNome?: string }>(aberta ? 'projects' : null);
  const [q, setQ] = React.useState('');
  const [foco, setFoco] = React.useState(0);
  const campo = React.useRef<HTMLInputElement>(null);

  const itens = React.useMemo<Item[]>(() => {
    const telas: Item[] = [{ chave: 'inicio', rotulo: INICIO.rotulo, detalhe: INICIO.descricao, href: INICIO.href, icone: INICIO.icone, alvo: norm('inicio visao geral pendencias') }];
    for (const a of AREAS) {
      telas.push({ chave: `a:${a.id}`, rotulo: a.nome, detalhe: a.resumo, href: `/area/${a.id}/`, icone: a.icone, matiz: a.matiz, alvo: norm(`${a.nome} ${a.resumo}`) });
      for (const t of a.telas) telas.push({ chave: `${a.id}:${t.href}`, rotulo: t.rotulo, detalhe: `${a.nome} · ${t.descricao}`, href: t.href, icone: t.icone, matiz: a.matiz, alvo: norm(`${t.rotulo} ${a.nome} ${t.descricao}`) });
    }
    const o: Item[] = obras.filter((x) => !x.deleted).map((x) => ({ chave: `o:${x.id}`, rotulo: x.name ?? 'Obra', detalhe: `Obra · ${x.client ?? ''}`, href: '/gestao/activities/', icone: Building2, matiz: 28, alvo: norm(`${x.name} ${x.client} obra`) }));
    const p: Item[] = projetos.map((x) => ({ chave: `p:${x.id}`, rotulo: x.nome ?? 'Projeto', detalhe: `Projeto ${x.codigo ?? ''} · ${x.clienteNome ?? ''}`, href: '/dashboard/', icone: FolderKanban, matiz: 212, alvo: norm(`${x.nome} ${x.codigo} ${x.clienteNome} projeto`) }));
    const termos = norm(q).split(/\s+/).filter(Boolean);
    return [...telas, ...o, ...p].filter((i) => termos.every((t) => i.alvo.includes(t))).slice(0, 9);
  }, [q, obras, projetos]);

  React.useEffect(() => { if (aberta) { setQ(''); setFoco(0); setTimeout(() => campo.current?.focus(), 0); } }, [aberta]);
  React.useEffect(() => { setFoco(0); }, [q]);
  if (!aberta) return null;
  const ir = (i: Item | undefined) => { if (!i) return; onFechar(); router.push(i.href); };

  return (
    <div className="fixed inset-0 z-50 grid place-items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div role="dialog" aria-modal="true" aria-label="Busca rápida" className="entrar w-full max-w-xl overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <div className="flex items-center gap-3 border-b px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input ref={campo} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ir para tela, obra ou projeto…" aria-label="Buscar" role="combobox" aria-expanded="true" aria-controls="paleta-lista" aria-activedescendant={itens[foco] ? `paleta-${foco}` : undefined}
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setFoco((f) => Math.min(f + 1, itens.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setFoco((f) => Math.max(f - 1, 0)); }
              else if (e.key === 'Enter') { e.preventDefault(); ir(itens[foco]); }
              else if (e.key === 'Escape') onFechar();
            }} />
          <kbd className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">Esc</kbd>
        </div>
        <ul id="paleta-lista" role="listbox" className="max-h-[52vh] overflow-y-auto p-2">
          {itens.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted-foreground">Nada encontrado para “{q}”.</li>}
          {itens.map((i, k) => (
            <li key={i.chave} id={`paleta-${k}`} role="option" aria-selected={k === foco}>
              <button type="button" onMouseEnter={() => setFoco(k)} onClick={() => ir(i)} style={i.matiz !== undefined ? corDaArea(i.matiz) : undefined}
                className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left', k === foco && 'bg-accent')}>
                <span className="icone-area h-8 w-8 shrink-0"><i.icone className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{i.rotulo}</span><span className="block truncate text-xs text-muted-foreground">{i.detalhe}</span></span>
                {k === foco && <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
