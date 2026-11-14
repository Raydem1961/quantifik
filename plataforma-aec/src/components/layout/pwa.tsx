'use client';
import * as React from 'react';
import { WifiOff } from 'lucide-react';

/** Registra o service worker (uso sem internet) e avisa quando o aparelho está offline. */
export function Pwa() {
  const [offline, setOffline] = React.useState(false);
  React.useEffect(() => {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* sem service worker o app segue funcionando online */ });
    }
    const atualizar = () => setOffline(!navigator.onLine);
    atualizar();
    window.addEventListener('online', atualizar);
    window.addEventListener('offline', atualizar);
    return () => { window.removeEventListener('online', atualizar); window.removeEventListener('offline', atualizar); };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" className="fixed bottom-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-card px-4 py-2 text-xs shadow-lg">
      <WifiOff className="h-3.5 w-3.5 text-warning" />Sem internet: você vê os dados já carregados e o que lançar será enviado quando a conexão voltar.
    </div>
  );
}
