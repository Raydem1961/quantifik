'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Endereço antigo (/gestao/?m=finance): leva para a tela do módulo. */
export default function Gestao() {
  const router = useRouter();
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get('m');
    router.replace(`/gestao/${m && /^[A-Za-z]+$/.test(m) ? m : 'works'}/`);
  }, [router]);
  return null;
}
