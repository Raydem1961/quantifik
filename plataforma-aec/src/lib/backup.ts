'use client';
/**
 * Backup completo da empresa em um arquivo JSON (com SHA-256 para conferir a integridade) e
 * restauração conferida: mostra antes o que entra, o que muda e o que fica igual; nunca apaga
 * registros que não estão no arquivo e nunca mexe em membros, convites ou trilhas de auditoria.
 */
import { collection, doc, getDocs, Timestamp, writeBatch, type DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { MODULOS } from '@/lib/obratop/esquemas';

export const FORMATO = 'obratop4-backup' as const;
/** Coleções da empresa (caminho relativo a organizations/{org}). Projetos levam as subcoleções. */
export const COLECOES = [...MODULOS, 'progressSnapshots', 'clients', 'projects', 'cotacoes', 'config', 'vinculos', 'cubOverrides', 'notifications'] as const;
export const SUBCOLECOES_DE_PROJETO = ['briefings', 'budgets', 'contracts', 'artRrt', 'timesheets', 'quantities', 'redlines'] as const;

export interface Backup { formato: typeof FORMATO; versao: 1; orgId: string; empresa: string; geradoEm: string; sha256: string; colecoes: Record<string, Record<string, DocumentData>> }

/** Datas do Firestore viram {"__ts": "ISO"} no arquivo e voltam a ser datas na restauração. */
function serializar(v: unknown): unknown {
  if (v instanceof Timestamp) return { __ts: v.toDate().toISOString() };
  if (Array.isArray(v)) return v.map(serializar);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, serializar(x)]));
  return v;
}
function reviver(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(reviver);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (Object.keys(o).length === 1 && typeof o.__ts === 'string') return Timestamp.fromDate(new Date(o.__ts));
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, reviver(x)]));
  }
  return v;
}
/** JSON com chaves em ordem fixa — o mesmo conteúdo sempre dá o mesmo SHA-256. */
export function canonico(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonico((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}
export async function sha256(texto: string): Promise<string> {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export async function gerarBackup(orgId: string, empresa: string, progresso?: (t: string) => void): Promise<Backup> {
  const colecoes: Backup['colecoes'] = {};
  const ler = async (caminho: string) => {
    const s = await getDocs(collection(db(), 'organizations', orgId, ...caminho.split('/')));
    return s.docs.map((d) => [d.id, serializar(d.data()) as DocumentData] as const);
  };
  for (const c of COLECOES) {
    progresso?.(`Lendo ${c}…`);
    const docs = await ler(c);
    colecoes[c] = Object.fromEntries(docs);
    if (c === 'projects') for (const [pid] of docs) for (const sub of SUBCOLECOES_DE_PROJETO) {
      const filhos = await ler(`projects/${pid}/${sub}`);
      if (filhos.length) colecoes[`projects/${pid}/${sub}`] = Object.fromEntries(filhos);
    }
  }
  const semHash = { formato: FORMATO, versao: 1 as const, orgId, empresa, geradoEm: new Date().toISOString(), colecoes };
  return { ...semHash, sha256: await sha256(canonico(semHash)) };
}

export interface ResultadoValidacao { ok: boolean; erro?: string; backup?: Backup; outraEmpresa?: boolean }
export async function validarBackup(texto: string, orgId: string): Promise<ResultadoValidacao> {
  let b: Backup;
  try { b = JSON.parse(texto); } catch { return { ok: false, erro: 'O arquivo não é um backup válido (JSON ilegível).' }; }
  if (b?.formato !== FORMATO || b.versao !== 1 || typeof b.colecoes !== 'object') return { ok: false, erro: 'Este arquivo não é um backup do ObraTop 4.' };
  const { sha256: assinado, ...resto } = b;
  if ((await sha256(canonico(resto))) !== assinado) return { ok: false, erro: 'O arquivo foi alterado ou está corrompido: a conferência SHA-256 não bate. Nada foi restaurado.' };
  const permitidas = new Set<string>(COLECOES);
  for (const c of Object.keys(b.colecoes)) {
    const sub = /^projects\/[^/]+\/([^/]+)$/.exec(c)?.[1];
    if (!permitidas.has(c) && !(sub && (SUBCOLECOES_DE_PROJETO as readonly string[]).includes(sub))) return { ok: false, erro: `Coleção não permitida no arquivo: ${c}.` };
  }
  return { ok: true, backup: b, outraEmpresa: b.orgId !== orgId };
}

export interface Previa { colecao: string; novos: string[]; alterados: string[]; iguais: number }
/** Compara o arquivo com o que está no banco agora. */
export async function previaRestauracao(orgId: string, b: Backup): Promise<Previa[]> {
  const out: Previa[] = [];
  for (const [c, docs] of Object.entries(b.colecoes)) {
    // orgId é carimbado na gravação; não conta como diferença.
    const sem = (o: unknown) => { const { orgId: _o, ...r } = (o ?? {}) as Record<string, unknown>; void _o; return canonico(r); };
    const atuais = new Map((await getDocs(collection(db(), 'organizations', orgId, ...c.split('/')))).docs.map((d) => [d.id, sem(serializar(d.data()))]));
    const p: Previa = { colecao: c, novos: [], alterados: [], iguais: 0 };
    for (const [id, dados] of Object.entries(docs)) {
      const atual = atuais.get(id);
      if (atual === undefined) p.novos.push(id);
      else if (atual !== sem(dados)) p.alterados.push(id);
      else p.iguais++;
    }
    if (p.novos.length || p.alterados.length || p.iguais) out.push(p);
  }
  return out;
}

/** Grava os novos e os alterados em lotes; devolve quantos entraram e o que as regras recusaram. */
export async function restaurar(orgId: string, b: Backup, previa: Previa[], progresso?: (t: string) => void): Promise<{ gravados: number; recusados: string[] }> {
  let gravados = 0;
  const recusados: string[] = [];
  for (const p of previa) {
    const ids = [...p.novos, ...p.alterados];
    for (let i = 0; i < ids.length; i += 300) {
      const parte = ids.slice(i, i + 300), lote = writeBatch(db());
      for (const id of parte) lote.set(doc(db(), 'organizations', orgId, ...p.colecao.split('/'), id), { ...(reviver(b.colecoes[p.colecao]![id]) as DocumentData), orgId });
      try { await lote.commit(); gravados += parte.length; progresso?.(`Restaurando ${p.colecao}: ${Math.min(i + 300, ids.length)} de ${ids.length}`); }
      catch {
        // Um registro protegido (ex.: contrato já assinado) recusa o lote inteiro: tenta um a um.
        for (const id of parte) {
          const l = writeBatch(db());
          l.set(doc(db(), 'organizations', orgId, ...p.colecao.split('/'), id), { ...(reviver(b.colecoes[p.colecao]![id]) as DocumentData), orgId });
          try { await l.commit(); gravados++; } catch { recusados.push(`${p.colecao}/${id}`); }
        }
      }
    }
  }
  return { gravados, recusados };
}
