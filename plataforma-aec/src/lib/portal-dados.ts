'use client';
/** Leitura e gravação dos painéis do Portal do Cliente (`portalCliente/{org}_{obra}`). */
import * as React from 'react';
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db, MODO_DEMO } from '@/lib/firebase/client';
import { idPortal, type Portal } from '@/lib/portal';

// Modo demonstração: os painéis ficam em memória.
const memoria = new Map<string, Portal>();
const ouvintes = new Set<() => void>();
let instantaneo: Portal[] = [];
const avisar = () => { instantaneo = [...memoria.values()]; ouvintes.forEach((f) => f()); };
const VAZIO: Portal[] = [];

export async function publicarPortal(p: Portal): Promise<void> {
  if (MODO_DEMO) { memoria.set(idPortal(p.orgId, p.workId), p); avisar(); return; }
  await setDoc(doc(db(), 'portalCliente', idPortal(p.orgId, p.workId)), p);
}
export async function removerPortal(orgId: string, workId: string): Promise<void> {
  if (MODO_DEMO) { memoria.delete(idPortal(orgId, workId)); avisar(); return; }
  await deleteDoc(doc(db(), 'portalCliente', idPortal(orgId, workId)));
}

function usePortais(campo: 'orgId' | 'emails', valor: string | null | undefined) {
  const demo = React.useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => instantaneo, () => VAZIO);
  const [estado, setEstado] = React.useState<{ portais: Portal[]; carregando: boolean; erro?: string }>({ portais: [], carregando: !MODO_DEMO && !!valor });
  React.useEffect(() => {
    if (MODO_DEMO || !valor) { setEstado({ portais: [], carregando: false }); return; }
    const q = query(collection(db(), 'portalCliente'), campo === 'orgId' ? where('orgId', '==', valor) : where('emails', 'array-contains', valor));
    return onSnapshot(q, (s) => setEstado({ portais: s.docs.map((d) => d.data() as Portal), carregando: false }), (e) => setEstado({ portais: [], carregando: false, erro: e.message }));
  }, [campo, valor]);
  return MODO_DEMO ? { portais: demo, carregando: false, erro: undefined } : estado;
}
/** Painéis publicados pela empresa (só o proprietário consegue ler). */
export const usePortaisDaEmpresa = (orgId: string | null) => usePortais('orgId', orgId);
/** Painéis liberados para o e-mail (confirmado) do cliente. */
export const usePortaisDoCliente = (email: string | null | undefined) => usePortais('emails', email ? email.toLowerCase() : null);
