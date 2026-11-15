'use client';
/** O que vê quem entra sem pertencer a uma empresa: o Portal do Cliente (se houver contrato liberado) ou o primeiro acesso. */
import * as React from 'react';
import { useTheme } from 'next-themes';
import { LogOut, Moon, Sun } from 'lucide-react';
import { Nome, Simbolo } from '@/components/layout/marca';
import { Onboarding } from '@/components/layout/onboarding';
import { PainelCliente } from '@/components/portal/painel-cliente';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/form';
import { useAuth } from '@/hooks/use-auth';
import { usePortaisDoCliente } from '@/lib/portal-dados';

export function EntradaSemEmpresa() {
  const { usuario, emailVerificado, sair } = useAuth();
  const { theme, setTheme } = useTheme();
  // Só com o e-mail confirmado as regras liberam a consulta.
  const { portais, carregando } = usePortaisDoCliente(emailVerificado ? usuario?.email : null);
  const [escolhido, setEscolhido] = React.useState('');
  if (carregando) return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Carregando…</div>;
  if (portais.length === 0) return <Onboarding />;
  const ordenados = [...portais].sort((a, b) => a.obra.nome.localeCompare(b.obra.nome));
  const portal = ordenados.find((p) => p.workId === escolhido) ?? ordenados[0]!;
  return (
    <div className="min-h-screen overflow-x-clip">
      <header className="vidro sticky top-0 z-20 flex h-14 items-center gap-3 border-b px-4 md:px-6 print:hidden">
        <Simbolo className="h-9 w-9 shrink-0" /><Nome className="hidden text-[16px] font-bold tracking-tight sm:block" />
        {ordenados.length > 1 && <Select aria-label="Contrato" className="ml-2 max-w-[260px]" value={portal.workId} onChange={(e) => setEscolhido(e.target.value)}>{ordenados.map((p) => <option key={p.workId} value={p.workId}>{p.obra.nome}</option>)}</Select>}
        <span className="ml-auto hidden truncate text-xs text-muted-foreground md:block">{usuario?.email}</span>
        <Button variant="ghost" size="icon" className="ml-auto md:ml-0" aria-label="Alternar tema claro/escuro" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}><Sun className="hidden h-4 w-4 dark:block" /><Moon className="h-4 w-4 dark:hidden" /></Button>
        <Button variant="ghost" size="icon" aria-label="Sair" onClick={() => void sair()}><LogOut className="h-4 w-4" /></Button>
      </header>
      <main className="mx-auto w-full max-w-[1300px] p-4 md:p-6"><PainelCliente portal={portal} /></main>
    </div>
  );
}
