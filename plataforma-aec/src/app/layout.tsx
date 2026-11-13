import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import { AuthProvider } from '@/hooks/use-auth';
import { WorkspaceProvider } from '@/hooks/use-workspace';
import './globals.css';

export const metadata: Metadata = {
  title: 'Plataforma AEC — Gestão de Projetos, CAD e Orçamento',
  description: 'ERP para escritórios de arquitetura e engenharia: briefing, CAD/QTO, orçamento CUB, contratos e assinatura digital.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <AuthProvider>
            <WorkspaceProvider>{children}</WorkspaceProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
