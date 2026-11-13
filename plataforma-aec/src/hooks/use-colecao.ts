'use client';
/**
 * Acesso a dados em tempo real. Com Firebase: Firestore `onSnapshot` escopado ao tenant.
 * Em modo demonstração: um armazenamento em memória com a mesma interface (inclusive escrita),
 * para que Kanban, timesheet e redlines funcionem sem backend.
 */
import * as React from 'react';
import { addDoc, collection, collectionGroup, doc, onSnapshot, query, updateDoc, where, type DocumentData } from 'firebase/firestore';
import { db, MODO_DEMO } from '@/lib/firebase/client';
import { DEMO_ART, DEMO_FILES, DEMO_NOTIFICATIONS, DEMO_PROJECTS, DEMO_TIMESHEETS } from '@/lib/demo-data';
import { useAuth } from './use-auth';

type Item = { id: string } & Record<string, unknown>;

// ── armazenamento do modo demo ──────────────────────────────────────────────
const memoria = new Map<string, Item[]>([
  ['projects', DEMO_PROJECTS as unknown as Item[]],
  ['artRrt', DEMO_ART as unknown as Item[]],
  ['timesheets', DEMO_TIMESHEETS as unknown as Item[]],
  ['notifications', DEMO_NOTIFICATIONS as unknown as Item[]],
  ['files', DEMO_FILES as unknown as Item[]],
]);
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());
const VAZIO: Item[] = [];
/** Subcoleções de projeto viram uma lista plana no demo: 'projects/p1/timesheets' → 'timesheets'. */
const chaveDemo = (caminho: string) => caminho.split('/').filter((_, i, a) => i === a.length - 1 || a.length === 1).join('/');

export interface OpcoesColecao {
  /** Consulta collectionGroup filtrada por tenantId (ex.: 'artRrt' de todos os projetos). */
  grupo?: boolean;
}

export function useColecao<T extends { id: string }>(caminho: string | null, opcoes: OpcoesColecao = {}) {
  const { tenantId } = useAuth();
  const [estado, setEstado] = React.useState<{ dados: T[]; carregando: boolean; erro?: string }>({ dados: [], carregando: !MODO_DEMO });
  const demo = React.useSyncExternalStore(
    (f) => { ouvintes.add(f); return () => ouvintes.delete(f); },
    () => (caminho ? memoria.get(chaveDemo(caminho)) ?? VAZIO : VAZIO),
    () => VAZIO,
  );

  React.useEffect(() => {
    if (MODO_DEMO || !tenantId || !caminho) return;
    const ref = opcoes.grupo
      ? query(collectionGroup(db(), caminho), where('tenantId', '==', tenantId))
      : collection(db(), 'tenants', tenantId, ...caminho.split('/'));
    return onSnapshot(ref, (snap) => {
      setEstado({ dados: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T), carregando: false });
    }, (e) => setEstado({ dados: [], carregando: false, erro: e.message }));
  }, [tenantId, caminho, opcoes.grupo]);

  return MODO_DEMO ? { dados: demo as unknown as T[], carregando: false, erro: undefined } : estado;
}

/** Atualiza campos de um documento do tenant (ex.: 'projects/p1'). */
export async function atualizarDoc(tenantId: string, caminho: string, patch: DocumentData): Promise<void> {
  if (MODO_DEMO) {
    const partes = caminho.split('/');
    const id = partes.pop()!;
    const chave = chaveDemo(partes.join('/'));
    memoria.set(chave, (memoria.get(chave) ?? []).map((i) => (i.id === id ? { ...i, ...patch } : i)));
    avisar();
    return;
  }
  await updateDoc(doc(db(), 'tenants', tenantId, ...caminho.split('/')), patch);
}

/** Cria um documento em uma coleção do tenant (ex.: 'projects/p1/timesheets'). */
export async function adicionarDoc(tenantId: string, caminho: string, dados: DocumentData): Promise<string> {
  if (MODO_DEMO) {
    const id = `demo-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const chave = chaveDemo(caminho);
    memoria.set(chave, [...(memoria.get(chave) ?? []), { id, ...dados }]);
    avisar();
    return id;
  }
  // `tenantId` é gravado no documento: as regras de collectionGroup dependem dele.
  return (await addDoc(collection(db(), 'tenants', tenantId, ...caminho.split('/')), { ...dados, tenantId })).id;
}
