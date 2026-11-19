'use client';
/**
 * Licenças de uso: só quem recebe um código do administrador da plataforma consegue criar uma
 * empresa. Cada código vale para uma empresa, tem validade e pode ser preso a um e-mail.
 * As regras do banco garantem isso no servidor (regras/extensao-raiz.firestore.rules).
 */
import * as React from 'react';
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';
import { auth, db, MODO_DEMO } from '@/lib/firebase/client';

export interface Licenca { id: string; usada: boolean; email: string; cliente: string; observacao?: string; expiraEm?: Timestamp; criadaEm?: Timestamp; orgId?: string; usadaEmail?: string; usadaEm?: Timestamp }

const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sem 0/O, 1/I/L: fácil de ditar
/** Código no formato OT4-XXXX-XXXX-XXXX (≈ 74 bits aleatórios). */
export function gerarCodigo(): string {
  const n = new Uint8Array(15); crypto.getRandomValues(n);
  const c = Array.from(n, (b) => ALFABETO[b % ALFABETO.length]).join('');
  return `OT4-${c.slice(0, 5)}-${c.slice(5, 10)}-${c.slice(10, 15)}`;
}
export const normalizarCodigo = (c: string) => c.trim().toUpperCase().replace(/\s+/g, '');

export async function emitirLicenca(d: { cliente: string; email: string; dias: number; observacao: string }): Promise<string> {
  const u = auth().currentUser;
  if (!u) throw new Error('Entre na sua conta primeiro.');
  const email = d.email.trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('E-mail inválido.');
  const codigo = gerarCodigo();
  await setDoc(doc(db(), 'licencas', codigo), {
    usada: false, email, cliente: d.cliente.trim().slice(0, 160), observacao: d.observacao.trim().slice(0, 500),
    expiraEm: Timestamp.fromDate(new Date(Date.now() + Math.max(1, Math.min(365, d.dias)) * 86400000)), criadaEm: serverTimestamp(), criadaPor: u.uid,
  });
  return codigo;
}
export const revogarLicenca = (codigo: string) => deleteDoc(doc(db(), 'licencas', codigo));

/** É o administrador da plataforma? (só ele consegue ler plataforma/acesso). */
export function useAdminPlataforma(uid: string | undefined): boolean {
  const [sim, setSim] = React.useState(false);
  React.useEffect(() => {
    if (MODO_DEMO || !uid) { setSim(false); return; }
    return onSnapshot(doc(db(), 'plataforma', 'acesso'), (s) => setSim(s.exists()), () => setSim(false));
  }, [uid]);
  return sim;
}
export function useLicencas(ativo: boolean): { lista: Licenca[]; carregando: boolean } {
  const [e, setE] = React.useState<{ lista: Licenca[]; carregando: boolean }>({ lista: [], carregando: true });
  React.useEffect(() => {
    if (!ativo || MODO_DEMO) { setE({ lista: [], carregando: false }); return; }
    return onSnapshot(collection(db(), 'licencas'), (s) => setE({ lista: s.docs.map((d) => ({ id: d.id, ...d.data() }) as Licenca), carregando: false }), () => setE({ lista: [], carregando: false }));
  }, [ativo]);
  return e;
}
