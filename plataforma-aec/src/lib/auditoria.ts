'use client';
/**
 * Trilha de auditoria no mesmo formato do ObraTop (organizations/{org}/audits): quem fez, o quê,
 * em qual registro e o que mudou. As regras só aceitam o registro com o uid de quem está logado.
 */
import { adicionarDoc } from '@/hooks/use-colecao';
import type { Member } from '@/lib/types';

const IGNORAR = new Set(['updatedAt', 'updatedBy', 'createdAt', 'createdBy', 'orgId']);
const curto = (v: unknown) => { const t = typeof v === 'string' ? v : JSON.stringify(v ?? null); return t.length > 300 ? `${t.slice(0, 300)}…` : t; };

/** Somente os campos que mudaram, como { campo: { de, para } }. */
export function diferencas(antes: Record<string, unknown> | undefined, depois: Record<string, unknown>): Record<string, { de: string; para: string }> {
  const out: Record<string, { de: string; para: string }> = {};
  for (const k of Object.keys(depois)) {
    if (IGNORAR.has(k)) continue;
    const a = curto(antes?.[k]), b = curto(depois[k]);
    if (a !== b) out[k] = { de: antes ? a : '', para: b };
  }
  return out;
}

export async function auditar(orgId: string, usuario: Member | null, acao: string, modulo: string, recordId: string, antes: Record<string, unknown> | undefined, depois: Record<string, unknown>): Promise<boolean> {
  if (!usuario) return false;
  try {
    await adicionarDoc(orgId, 'audits', { action: acao, module: modulo, recordId, changes: diferencas(antes, depois), userId: usuario.uid, userEmail: usuario.email, at: new Date().toISOString(), release: '4.0' });
    return true;
  } catch { return false; } // auditoria nunca impede o trabalho; falhas aparecem como ausência na trilha
}
