'use client';
/** Leitura e gravação dos painéis do Portal do Cliente (`portalCliente/{org}_{obra}` e `.../fotos/{AAAA-MM}`). */
import * as React from 'react';
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db, MODO_DEMO } from '@/lib/firebase/client';
import { idPortal, indiceDeFotos, type MesFotos, type Portal } from '@/lib/portal';

// Modo demonstração: os painéis ficam em memória.
const memoria = new Map<string, Portal>();
const memoriaFotos = new Map<string, MesFotos>();
const ouvintes = new Set<() => void>();
let instantaneo: Portal[] = [];
const avisar = () => { instantaneo = [...memoria.values()]; ouvintes.forEach((f) => f()); };
const VAZIO: Portal[] = [];

/**
 * Grava o painel e os meses de fotos que mudaram (pelo resumo do índice); apaga os meses que
 * deixaram de existir. Os meses vão antes do painel para o cliente nunca ver um índice sem fotos.
 */
export async function publicarPortal(p: Portal, meses: MesFotos[] = [], anterior?: Portal): Promise<void> {
  const id = idPortal(p.orgId, p.workId), antes = new Map((anterior?.fotosMeses ?? []).map((m) => [m.mes, m.hash]));
  const indice = new Map(indiceDeFotos(meses).map((m) => [m.mes, m.hash]));
  const gravar = meses.filter((m) => antes.get(m.mes) !== indice.get(m.mes));
  const apagar = [...antes.keys()].filter((m) => !indice.has(m));
  if (MODO_DEMO) {
    gravar.forEach((m) => memoriaFotos.set(`${id}/${m.mes}`, m)); apagar.forEach((m) => memoriaFotos.delete(`${id}/${m}`));
    memoria.set(id, p); avisar(); return;
  }
  await Promise.all(gravar.map((m) => setDoc(doc(db(), 'portalCliente', id, 'fotos', m.mes), m)));
  await setDoc(doc(db(), 'portalCliente', id), p);
  await Promise.all(apagar.map((m) => deleteDoc(doc(db(), 'portalCliente', id, 'fotos', m)).catch(() => undefined)));
}
export async function removerPortal(orgId: string, workId: string, meses: string[] = []): Promise<void> {
  const id = idPortal(orgId, workId);
  if (MODO_DEMO) { meses.forEach((m) => memoriaFotos.delete(`${id}/${m}`)); memoria.delete(id); avisar(); return; }
  await Promise.all(meses.map((m) => deleteDoc(doc(db(), 'portalCliente', id, 'fotos', m)).catch(() => undefined)));
  await deleteDoc(doc(db(), 'portalCliente', id));
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

/** Um mês do relatório fotográfico de um painel publicado. */
export function useMesDeFotos(portal: Portal | null, mes: string | null): { mes: MesFotos | null; carregando: boolean } {
  const [estado, setEstado] = React.useState<{ mes: MesFotos | null; carregando: boolean }>({ mes: null, carregando: !!mes });
  const id = portal ? idPortal(portal.orgId, portal.workId) : null;
  const hash = portal?.fotosMeses?.find((m) => m.mes === mes)?.hash;
  React.useEffect(() => {
    if (!id || !mes) { setEstado({ mes: null, carregando: false }); return; }
    if (MODO_DEMO) { setEstado({ mes: memoriaFotos.get(`${id}/${mes}`) ?? null, carregando: false }); return; }
    setEstado((e) => ({ ...e, carregando: true }));
    return onSnapshot(doc(db(), 'portalCliente', id, 'fotos', mes), (s) => setEstado({ mes: (s.data() as MesFotos) ?? null, carregando: false }), () => setEstado({ mes: null, carregando: false }));
  }, [id, mes, hash]);
  return estado;
}
