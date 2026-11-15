'use client';
/**
 * Acesso a dados em tempo real. Com Firebase: Firestore `onSnapshot` dentro de `organizations/{empresa}` — o mesmo lugar onde o ObraTop guarda os dados.
 * Em modo demonstração: um armazenamento em memória com a mesma interface (inclusive escrita),
 * para que Kanban, timesheet e redlines funcionem sem backend.
 */
import * as React from 'react';
import { collection, collectionGroup, deleteDoc, doc, onSnapshot, query, setDoc, updateDoc, where, type DocumentData } from 'firebase/firestore';
import { db, MODO_DEMO } from '@/lib/firebase/client';
import { DEMO_ART, DEMO_FILES, DEMO_NOTIFICATIONS, DEMO_OBRA, DEMO_PROJECTS, DEMO_TIMESHEETS } from '@/lib/demo-data';
import { useAuth } from './use-auth';

type Item = { id: string } & Record<string, unknown>;

// ── armazenamento do modo demo ──────────────────────────────────────────────
const memoria = new Map<string, Item[]>([
  ['projects', DEMO_PROJECTS as unknown as Item[]],
  ['artRrt', DEMO_ART as unknown as Item[]],
  ['timesheets', DEMO_TIMESHEETS as unknown as Item[]],
  ['notifications', DEMO_NOTIFICATIONS as unknown as Item[]],
  ['files', DEMO_FILES as unknown as Item[]],
  ...Object.entries(DEMO_OBRA).map(([k, v]) => [k, v as Item[]] as [string, Item[]]),
]);
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());
const VAZIO: Item[] = [];
/** Subcoleções de projeto viram uma lista plana no demo: 'projects/p1/timesheets' → 'timesheets'. */
const chaveDemo = (caminho: string) => {
  const partes = caminho.split('/');
  const ultima = partes[partes.length - 1]!;
  // Orçamentos e contratos de PROJETO não se misturam com os módulos de obra de mesmo nome.
  if (partes.length > 1 && (ultima === 'budgets' || ultima === 'contracts')) return caminho;
  return ultima;
};

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
    const colecao = collection(db(), 'organizations', tenantId, ...caminho.split('/'));
    const ref = opcoes.grupo
      ? query(collectionGroup(db(), caminho), where('orgId', '==', tenantId))
      : colecao;
    return onSnapshot(ref, (snap) => {
      setEstado({ dados: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T), carregando: false });
    }, (e) => setEstado({ dados: [], carregando: false, erro: e.message }));
  }, [tenantId, caminho, opcoes.grupo]);

  return MODO_DEMO ? { dados: demo as unknown as T[], carregando: false, erro: undefined } : estado;
}

/**
 * Sem internet o Firestore grava no cache local na hora, mas a promessa só termina quando o
 * servidor confirma. Esperar por ela deixaria a tela presa em "Salvando…"; por isso, offline,
 * a gravação segue em segundo plano e a tela é liberada (o dado já aparece pelo onSnapshot e
 * sobe sozinho quando a conexão volta).
 */
async function concluir(gravacao: Promise<unknown>): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    gravacao.catch((e) => console.error('Gravação pendente recusada pelo servidor ao reconectar:', e));
    return;
  }
  await gravacao;
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
  await concluir(updateDoc(doc(db(), 'organizations', tenantId, ...caminho.split('/')), patch));
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
  // O id é gerado no cliente para que a criação também funcione sem esperar o servidor.
  const novo = doc(collection(db(), 'organizations', tenantId, ...caminho.split('/')));
  await concluir(setDoc(novo, { ...dados, orgId: tenantId }));
  return novo.id;
}

/** Grava (cria ou substitui) um documento com id conhecido — ex.: 'projects/p1/quantities/planta-dxf'. */
export async function definirDoc(tenantId: string, caminho: string, dados: DocumentData): Promise<void> {
  if (MODO_DEMO) {
    const partes = caminho.split('/');
    const id = partes.pop()!;
    const chave = chaveDemo(partes.join('/'));
    memoria.set(chave, [...(memoria.get(chave) ?? []).filter((i) => i.id !== id), { id, ...dados }]);
    avisar();
    return;
  }
  await concluir(setDoc(doc(db(), 'organizations', tenantId, ...caminho.split('/')), { ...dados, orgId: tenantId }));
}

export async function removerDoc(tenantId: string, caminho: string): Promise<void> {
  if (MODO_DEMO) {
    const partes = caminho.split('/');
    const id = partes.pop()!;
    const chave = chaveDemo(partes.join('/'));
    memoria.set(chave, (memoria.get(chave) ?? []).filter((i) => i.id !== id));
    avisar();
    return;
  }
  await concluir(deleteDoc(doc(db(), 'organizations', tenantId, ...caminho.split('/'))));
}
