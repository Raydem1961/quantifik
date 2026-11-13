'use client';
import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Bell, Building2, Calculator, ClipboardList, FileSignature, LayoutDashboard, LogOut, Moon, PenTool, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/form';
import { useAuth } from '@/hooks/use-auth';
import { atualizarDoc, useColecao } from '@/hooks/use-colecao';
import { MODO_DEMO } from '@/lib/firebase/client';
import { ROLE_LABEL, type AppNotification } from '@/lib/types';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/dashboard/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/briefing/', label: 'Briefing', icon: ClipboardList },
  { href: '/cad/', label: 'CAD & Quantitativos', icon: PenTool },
  { href: '/orcamento/', label: 'Orçamento CUB', icon: Calculator },
  { href: '/contratos/', label: 'Contratos & PDF', icon: FileSignature },
];

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
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-lg border bg-card p-1 shadow-lg">
          {lista.length === 0 && <p className="p-4 text-center text-xs text-muted-foreground">Nenhuma notificação.</p>}
          {lista.map((n) => (
            <button key={n.id} type="button" onClick={() => marcar(n)} className="flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left hover:bg-accent">
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

export function AppShell({ children }: { children: React.ReactNode }) {
  const caminho = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { carregando, usuario, tenant, role, semVinculo, sair } = useAuth();

  React.useEffect(() => { if (!carregando && !usuario) router.replace('/login/'); }, [carregando, usuario, router]);

  if (carregando || !usuario) return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Carregando…</div>;
  if (semVinculo) {
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <div className="max-w-sm space-y-3">
          <h1 className="text-base font-semibold">Conta ainda sem empresa vinculada</h1>
          <p className="text-sm text-muted-foreground">Peça ao Sócio-Diretor do seu escritório para atribuir um papel à conta {usuario.email}. Depois, saia e entre novamente.</p>
          <Button variant="outline" onClick={() => void sair()}>Sair</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-card/50 md:flex">
        <div className="flex h-14 items-center gap-2.5 border-b px-4">
          <div className="grid h-7 w-7 place-items-center rounded-md text-white" style={{ background: tenant?.branding.corPrimaria ?? 'hsl(var(--primary))' }}>
            <Building2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">{tenant?.nomeFantasia ?? 'Plataforma AEC'}</p>
            <p className="truncate text-[11px] text-muted-foreground">{tenant?.responsavelTecnico.registro}</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-2">
          {NAV.map(({ href, label, icon: Icon }) => {
            const ativo = caminho === href || caminho === href.slice(0, -1);
            return (
              <Link key={href} href={href} aria-current={ativo ? 'page' : undefined}
                className={cn('flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors', ativo ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground')}>
                <Icon className="h-4 w-4" />{label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-3">
          <p className="truncate text-xs font-medium">{usuario.nome}</p>
          <p className="text-[11px] text-muted-foreground">{role ? ROLE_LABEL[role] : ''}</p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
          <nav className="flex gap-1 overflow-x-auto md:hidden">
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} aria-label={label} className={cn('rounded-md p-2', caminho.startsWith(href.slice(0, -1)) ? 'bg-accent' : 'text-muted-foreground')}><Icon className="h-4 w-4" /></Link>
            ))}
          </nav>
          {MODO_DEMO && <Badge variant="warning">Modo demonstração · dados fictícios</Badge>}
          <div className="ml-auto flex items-center gap-1">
            <Notificacoes />
            <Button variant="ghost" size="icon" aria-label="Alternar tema claro/escuro" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              <Sun className="hidden h-4 w-4 dark:block" /><Moon className="h-4 w-4 dark:hidden" />
            </Button>
            {!MODO_DEMO && <Button variant="ghost" size="icon" aria-label="Sair" onClick={() => void sair()}><LogOut className="h-4 w-4" /></Button>}
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 md:p-6">{children}</main>
      </div>
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
