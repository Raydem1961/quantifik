'use client';
/**
 * Empresa, membros e convites — exatamente os documentos que o ObraTop usa, para que os dois
 * aplicativos compartilhem o mesmo cadastro (regras em regras/obratop-base.firestore.rules).
 */
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/client';

export const PERFIL_LABEL: Record<string, string> = { '': 'Usuário de obra', coordenador: 'Coordenador', orcamentista: 'Orçamentista', projetista: 'Projetista' };

/** Cria a empresa com o usuário atual como proprietário (mesmo lote de gravações do ObraTop). */
export async function criarEmpresa(nome: string, cnpj: string): Promise<string> {
  const u = auth().currentUser;
  if (!u) throw new Error('Entre na sua conta primeiro.');
  const limpo = nome.trim();
  if (!limpo || limpo.length > 120) throw new Error('Informe o nome da empresa (até 120 caracteres).');
  const id = crypto.randomUUID();
  const lote = writeBatch(db()), agora = serverTimestamp();
  lote.set(doc(db(), 'organizations', id), { name: limpo, cnpj: cnpj.trim(), ownerUid: u.uid, legacyMigrated: true, createdAt: agora, updatedAt: agora });
  lote.set(doc(db(), 'organizations', id, 'members', u.uid), { email: u.email, name: u.displayName || u.email, role: 'owner', status: 'active', createdAt: agora });
  lote.set(doc(db(), 'users', u.uid), { email: u.email, currentOrg: id, updatedAt: agora }, { merge: true });
  await lote.commit();
  return id;
}

/** Entra em uma empresa com o código de convite recebido do administrador. */
export async function aceitarConvite(codigo: string): Promise<string> {
  const u = auth().currentUser;
  if (!u) throw new Error('Entre na sua conta primeiro.');
  const cod = codigo.trim();
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(cod)) throw new Error('Código de convite inválido.');
  let convite;
  try { convite = (await getDoc(doc(db(), 'invites', cod))).data(); }
  catch { throw new Error('Convite não encontrado, vencido ou emitido para outro e-mail.'); }
  if (!convite) throw new Error('Convite não encontrado.');
  const lote = writeBatch(db()), agora = serverTimestamp();
  lote.set(doc(db(), 'organizations', convite.orgId, 'members', u.uid), {
    email: u.email, name: u.displayName || u.email, role: 'project_user', status: 'active', workId: convite.workId, inviteCode: cod,
    createdAt: agora,
  });
  lote.set(doc(db(), 'users', u.uid), { email: u.email, currentOrg: convite.orgId, updatedAt: agora }, { merge: true });
  await lote.commit();
  await deleteDoc(doc(db(), 'invites', cod)).catch(() => { /* o convite vence sozinho */ });
  return convite.orgId as string;
}

/** Gera um convite (válido por 7 dias) para um e-mail, vinculado a uma obra, como exige o ObraTop. */
export async function criarConvite(orgId: string, email: string, workId: string): Promise<string> {
  const u = auth().currentUser;
  const e = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(e) || e.length > 254) throw new Error('E-mail inválido.');
  if (!workId) throw new Error('Escolha a obra a que a pessoa terá acesso.');
  const codigo = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  await setDoc(doc(db(), 'invites', codigo), {
    orgId, email: e, role: 'project_user', workId, expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 86400000)),
    createdBy: u?.uid ?? '', createdAt: serverTimestamp(),
  });
  return codigo;
}

/** Muda a obra de um membro; e-mail, papel e código de convite ficam como estão (exigência das regras). */
export const atualizarMembro = (orgId: string, uid: string, workId: string) => updateDoc(doc(db(), 'organizations', orgId, 'members', uid), { workId });
/** Perfil nos módulos novos (documento separado, que só o proprietário grava). */
export const definirPerfil = (orgId: string, uid: string, perfil: string) => setDoc(doc(db(), 'organizations', orgId, 'perfis', uid), { perfil });
export async function removerMembro(orgId: string, uid: string): Promise<void> {
  await deleteDoc(doc(db(), 'organizations', orgId, 'members', uid));
  await deleteDoc(doc(db(), 'organizations', orgId, 'perfis', uid)).catch(() => { /* pode não existir */ });
}

/** Dados dos módulos novos na empresa: razão social, UF, responsável técnico, cores e custo-hora. */
export async function salvarEmpresa(orgId: string, dados: { name: string; cnpj: string; aec: Record<string, unknown> }): Promise<void> {
  await updateDoc(doc(db(), 'organizations', orgId), { name: dados.name.trim(), cnpj: dados.cnpj.trim(), aec: dados.aec, updatedAt: serverTimestamp() });
}
