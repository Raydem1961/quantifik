'use client';
import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Bell, ChevronRight, CircleHelp, LogOut, Menu, Moon, Search, Sun, X } from 'lucide-react';
import { Nome, Simbolo } from '@/components/layout/marca';
import { EntradaSemEmpresa } from '@/components/portal/portal-do-cliente';
import { SincronizadorDePortais } from '@/components/portal/sincronizador';
import { CapturaDeAvanco } from '@/components/layout/captura-avanco';
import { Paleta } from '@/components/layout/paleta';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/form';
import { useAuth } from '@/hooks/use-auth';
import { atualizarDoc, useColecao } from '@/hooks/use-colecao';
import { MODO_DEMO } from '@/lib/firebase/client';
import { AREAS, INICIO, corDaArea, localizar, type Area } from '@/lib/modulos';
import { useAdminPlataforma } from '@/lib/licencas';
import { ROLE_LABEL, type AppNotification } from '@/lib/types';
import { cn } from '@/lib/utils';

const CHAVE_AREA = 'obratop.area';
const semBarra = (s: string) => s.replace(/\/+$/, '');

function Notificacoes() {
  const { tenantId, usuario } = useAuth();
  const { dados } = useColecao<AppNotification>('notifications');
  const [aberto, setAberto] = React.useState(false);
  const uid = usuario?.uid ?? '';
  const lista = [...dados].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)).slice(0, 12);
  const naoLidas = lista.filter((n) => !n.lidaPor.includes(uid));
  const marcar = (n: AppNotification) => {
    if (tenantId && !n.lidaPor.includes(uid)) void atualizarDoc(tenantId, `notifications/${n.id}`, { lidaPor: [...n.lidaPor, uid] });
  };
  return (
    <div className="relative">
      <Button variant="ghost" size="icon" aria-label={`Notificações (${naoLidas.length} não lidas)`} aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>
        <Bell className="h-4 w-4" />
        {naoLidas.length > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive" />}
      </Button>
      {aberto && (
        <div className="entrar absolute right-0 z-30 mt-2 w-80 rounded-xl border bg-card p-1 shadow-xl">
          {lista.length === 0 && <p className="p-4 text-center text-xs text-muted-foreground">Nenhuma notificação.</p>}
          {lista.map((n) => (
            <button key={n.id} type="button" onClick={() => marcar(n)} className="flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left hover:bg-accent">
              <span className="flex items-center gap-2 text-xs font-medium">
                {!n.lidaPor.includes(uid) && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                {n.titulo}
              </span>
              <span className="text-xs text-muted-foreground">{n.mensagem}</span>
              <span className="text-[10px] text-muted-foreground">{new Date(n.criadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Marca do aplicativo: monograma em gradiente + nome. */
function Marca({ compacta }: { compacta?: boolean }) {
  return (
    <Link href={INICIO.href} className="flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="ObraTop — Início">
      <Simbolo className="h-9 w-9 shrink-0 drop-shadow-[0_6px_10px_rgba(91,71,214,0.35)]" />
      {!compacta && <Nome className="text-[16px] font-bold tracking-tight" />}
    </Link>
  );
}

function Menu_({ area, caminho, soDono, onNavegar }: { area: Area | undefined; caminho: string; soDono: boolean; onNavegar?: () => void }) {
  const { usuario } = useAuth();
  const plataforma = useAdminPlataforma(usuario?.uid);
  return (
    <nav aria-label="Áreas do aplicativo" className="flex min-h-0 flex-1">
      {/* Trilho: uma área por ícone */}
      <ul className="flex w-[68px] shrink-0 flex-col items-center gap-1 overflow-y-auto border-r py-3">
        <li>
          <Link href={INICIO.href} onClick={onNavegar} aria-label={INICIO.rotulo} title={INICIO.rotulo} aria-current={semBarra(caminho) === '/inicio' ? 'page' : undefined}
            className={cn('grid h-11 w-11 place-items-center rounded-xl transition-colors', semBarra(caminho) === '/inicio' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground')}>
            <INICIO.icone className="h-5 w-5" />
          </Link>
        </li>
        <li aria-hidden className="my-1 h-px w-8 bg-border" />
        {AREAS.map((a) => {
          const ativa = a.id === area?.id;
          return (
            <li key={a.id} style={corDaArea(a.matiz)}>
              <Link href={`/area/${a.id}/`} onClick={onNavegar} aria-label={a.nome} title={a.nome} aria-current={ativa ? 'true' : undefined}
                className={cn('relative grid h-11 w-11 place-items-center rounded-xl transition-all', ativa ? 'icone-area' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground')}>
                <a.icone className="h-5 w-5" />
              </Link>
            </li>
          );
        })}
      </ul>
      {/* Painel: telas da área atual */}
      {area && (
        <div className="flex w-56 min-w-0 flex-col overflow-y-auto px-2.5 py-4" style={corDaArea(area.matiz)}>
          <Link href={`/area/${area.id}/`} onClick={onNavegar} className="mb-3 block rounded-lg px-2 py-1 outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring">
            <span className="texto-area block text-xs font-semibold uppercase tracking-wider">{area.nome}</span>
            <span className="block text-xs text-muted-foreground">{area.resumo}</span>
          </Link>
          <ul className="flex flex-col gap-0.5">
            {area.telas.filter((t) => (!t.soDono || soDono) && (!t.soPlataforma || plataforma)).map((t) => {
              const ativo = semBarra(caminho) === semBarra(t.href);
              return (
                <li key={t.href}>
                  <Link href={t.href} onClick={() => { try { sessionStorage.setItem(CHAVE_AREA, area.id); } catch { /* sem armazenamento */ } onNavegar?.(); }} aria-current={ativo ? 'page' : undefined}
                    className={cn('flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors', ativo ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground')}>
                    <t.icone className={cn('h-4 w-4 shrink-0', ativo && 'texto-area')} />{t.rotulo}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const caminho = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { carregando, usuario, tenant, role, semVinculo, sair } = useAuth();
  const [paleta, setPaleta] = React.useState(false);
  const [gaveta, setGaveta] = React.useState(false);
  const [areaLembrada, setAreaLembrada] = React.useState<string>();

  React.useEffect(() => {
    // O link de convite sobrevive ao login: o código fica guardado até a pessoa entrar.
    try { const c = new URLSearchParams(window.location.search).get('convite'); if (c && /^[A-Za-z0-9_-]{6,80}$/.test(c)) sessionStorage.setItem('obratop.convite', c); } catch { /* sem armazenamento */ }
  }, []);
  React.useEffect(() => { if (!carregando && !usuario) router.replace('/login/'); }, [carregando, usuario, router]);
  React.useEffect(() => { try { setAreaLembrada(sessionStorage.getItem(CHAVE_AREA) ?? undefined); } catch { /* sem armazenamento */ } setGaveta(false); }, [caminho]);
  React.useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaleta((v) => !v); } };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);

  if (carregando || !usuario) return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Carregando…</div>;
  if (semVinculo) return <EntradaSemEmpresa />;

  const { area, tela } = localizar(caminho, areaLembrada);
  const soDono = role === 'socio_diretor';
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-card/40 lg:flex">
        <div className="flex h-14 items-center border-b px-4"><Marca /></div>
        <Menu_ area={area} caminho={caminho} soDono={soDono} />
        <div className="border-t p-3">
          <p className="truncate text-xs font-medium">{usuario.nome}</p>
          <p className="truncate text-[11px] text-muted-foreground">{tenant?.nomeFantasia}{role ? ` · ${ROLE_LABEL[role]}` : ''}</p>
        </div>
      </aside>

      {gaveta && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onMouseDown={(e) => { if (e.target === e.currentTarget) setGaveta(false); }}>
          <div className="entrar flex h-full w-[min(92vw,330px)] flex-col border-r bg-card" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="flex h-14 items-center justify-between border-b px-4"><Marca /><Button variant="ghost" size="icon" aria-label="Fechar menu" onClick={() => setGaveta(false)}><X className="h-4 w-4" /></Button></div>
            <Menu_ area={area ?? AREAS[0]} caminho={caminho} soDono={soDono} onNavegar={() => setGaveta(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-x-clip">
        <header className="vidro sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-3 md:px-5">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu" onClick={() => setGaveta(true)}><Menu className="h-5 w-5" /></Button>
          <nav aria-label="Você está em" className="hidden min-w-0 items-center gap-1.5 text-sm sm:flex" style={area ? corDaArea(area.matiz) : undefined}>
            {area ? (<>
              <Link href={`/area/${area.id}/`} className="texto-area truncate font-medium hover:underline">{area.nome}</Link>
              {tela && <><ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span className="truncate text-muted-foreground">{tela.rotulo}</span></>}
            </>) : <span className="font-medium">{semBarra(caminho) === '/inicio' ? 'Início' : ''}</span>}
          </nav>
          <button type="button" onClick={() => setPaleta(true)} aria-label="Busca rápida"
            className="ml-auto flex h-9 min-w-0 items-center gap-2 rounded-lg border bg-background/60 px-3 text-sm text-muted-foreground transition-colors hover:bg-accent sm:w-64">
            <Search className="h-4 w-4 shrink-0" /><span className="hidden flex-1 truncate text-left sm:block">Buscar tela, obra ou projeto…</span>
            <kbd className="hidden rounded border px-1.5 py-0.5 text-[10px] sm:block">Ctrl K</kbd>
          </button>
          {MODO_DEMO && <Badge variant="warning" className="hidden md:inline-flex">Modo demonstração · dados fictícios</Badge>}
          <a href="/manual-obratop.pdf" target="_blank" rel="noreferrer" aria-label="Manual do usuário (PDF)" title="Manual do usuário" className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><CircleHelp className="h-4 w-4" /></a>
          <Notificacoes />
          <Button variant="ghost" size="icon" aria-label="Alternar tema claro/escuro" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            <Sun className="hidden h-4 w-4 dark:block" /><Moon className="h-4 w-4 dark:hidden" />
          </Button>
          {!MODO_DEMO && <Button variant="ghost" size="icon" aria-label="Sair" onClick={() => void sair()}><LogOut className="h-4 w-4" /></Button>}
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 md:p-6" style={area ? corDaArea(area.matiz) : undefined}>{children}</main>
      </div>
      <Paleta aberta={paleta} onFechar={() => setPaleta(false)} />
      <SincronizadorDePortais />
      <CapturaDeAvanco />
    </div>
  );
}

export function PageHeader({ titulo, descricao, children }: { titulo: string; descricao?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{titulo}</h1>
        {descricao && <p className="mt-1 text-sm text-muted-foreground">{descricao}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
