import type { Metadata, Viewport } from 'next';
import { ThemeProvider } from 'next-themes';
import { AuthProvider } from '@/hooks/use-auth';
import { WorkspaceProvider } from '@/hooks/use-workspace';
import { Pwa } from '@/components/layout/pwa';
import './globals.css';

export const viewport: Viewport = { themeColor: '#3b4cca', width: 'device-width', initialScale: 1 };

export const metadata: Metadata = {
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon-192.png', apple: '/icon-192.png' },
  appleWebApp: { capable: true, title: 'Plataforma AEC' },
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
            <Pwa />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
