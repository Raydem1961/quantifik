'use client';
/**
 * Empresa, membros e convites — exatamente os documentos que o ObraTop usa, para que os dois
 * aplicativos compartilhem o mesmo cadastro (regras em regras/obratop-base.firestore.rules).
 */
import { deleteDoc, deleteField, doc, getDoc, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { formatCnpj, processLogoFile, validEmail } from '@/lib/obratop/vendor/branding.mjs';
import { auth, db } from '@/lib/firebase/client';
import type { Funcao } from '@/lib/obratop/permissoes';

export const PERFIL_LABEL: Record<string, string> = { '': 'Usuário de obra', coordenador: 'Coordenador', orcamentista: 'Orçamentista', projetista: 'Projetista' };

/**
 * Cria a empresa com o usuário atual como proprietário (mesmo lote de gravações do ObraTop).
 * Exige um código de licença emitido pelo administrador da plataforma: o código é gasto no mesmo
 * lote, e as regras do banco recusam a criação sem ele.
 */
export async function criarEmpresa(nome: string, cnpj: string, licenca = ''): Promise<string> {
  const u = auth().currentUser;
  if (!u) throw new Error('Entre na sua conta primeiro.');
  const limpo = nome.trim();
  if (!limpo || limpo.length > 120) throw new Error('Informe o nome da empresa (até 120 caracteres).');
  const codigo = licenca.trim().toUpperCase().replace(/\s+/g, '');
  const id = crypto.randomUUID();
  const lote = writeBatch(db()), agora = serverTimestamp();
  lote.set(doc(db(), 'organizations', id), { name: limpo, cnpj: cnpj.trim(), ownerUid: u.uid, legacyMigrated: true, createdAt: agora, updatedAt: agora, ...(codigo ? { licenca: codigo } : {}) });
  lote.set(doc(db(), 'organizations', id, 'members', u.uid), { email: u.email, name: u.displayName || u.email, role: 'owner', status: 'active', createdAt: agora });
  lote.set(doc(db(), 'users', u.uid), { email: u.email, currentOrg: id, updatedAt: agora }, { merge: true });
  if (codigo) lote.update(doc(db(), 'licencas', codigo), { usada: true, orgId: id, usadaPor: u.uid, usadaEm: agora, usadaEmail: u.email ?? '' });
  try { await lote.commit(); } catch (e) {
    if (codigo) {
      const l = await getDoc(doc(db(), 'licencas', codigo)).catch(() => null);
      if (!l?.exists()) throw new Error('Código de licença inválido ou já utilizado.');
      const d = l.data();
      if ((d.expiraEm as Timestamp | undefined)?.toMillis?.() && d.expiraEm.toMillis() < Date.now()) throw new Error('Este código de licença venceu. Peça um novo.');
      if (d.email && d.email !== u.email) throw new Error(`Este código foi emitido para outro e-mail. Entre com ${d.email} ou peça um novo código.`);
      if (d.email && !u.emailVerified) throw new Error('Confirme o seu e-mail (link enviado na criação da conta) e tente de novo.');
    }
    throw codigo ? e : new Error('Informe o código de licença fornecido pelo ObraTop.');
  }
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
    email: u.email, name: u.displayName || u.email, role: ['manager', 'finance', 'viewer'].includes(convite.role) ? convite.role : 'project_user', status: 'active', workId: convite.workId, inviteCode: cod,
    createdAt: agora,
  });
  lote.set(doc(db(), 'users', u.uid), { email: u.email, currentOrg: convite.orgId, updatedAt: agora }, { merge: true });
  await lote.commit();
  await deleteDoc(doc(db(), 'invites', cod)).catch(() => { /* o convite vence sozinho */ });
  return convite.orgId as string;
}

/**
 * Gera um convite (válido por 7 dias). Engenheiro da obra precisa de uma obra; Gestor, Financeiro
 * e Consulta enxergam todas as obras e não levam obra no convite.
 */
export async function criarConvite(orgId: string, email: string, workId: string, funcao: Funcao = 'project_user'): Promise<string> {
  const u = auth().currentUser;
  const e = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(e) || e.length > 254) throw new Error('E-mail inválido.');
  if (funcao === 'owner') throw new Error('Função inválida.');
  const obra = funcao === 'project_user' ? workId : '';
  if (funcao === 'project_user' && !obra) throw new Error('Escolha a obra a que a pessoa terá acesso.');
  const codigo = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  await setDoc(doc(db(), 'invites', codigo), {
    orgId, email: e, role: funcao, workId: obra, expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 86400000)),
    createdBy: u?.uid ?? '', createdAt: serverTimestamp(),
  });
  return codigo;
}

/** Muda função, obra e bloqueio de um membro (e-mail e código de convite ficam como estão, exigência das regras). */
export const atualizarMembro = (orgId: string, uid: string, dados: { role: Funcao; workId: string; status?: 'active' | 'blocked' }) =>
  updateDoc(doc(db(), 'organizations', orgId, 'members', uid), { role: dados.role, workId: dados.role === 'project_user' ? dados.workId : '', ...(dados.status ? { status: dados.status } : {}) });
/** Perfil nos módulos novos (documento separado, que só o proprietário grava). */
export const definirPerfil = (orgId: string, uid: string, perfil: string) => setDoc(doc(db(), 'organizations', orgId, 'perfis', uid), { perfil });
export async function removerMembro(orgId: string, uid: string): Promise<void> {
  await deleteDoc(doc(db(), 'organizations', orgId, 'members', uid));
  await deleteDoc(doc(db(), 'organizations', orgId, 'perfis', uid)).catch(() => { /* pode não existir */ });
}

/** Dados da empresa: campos do ObraTop 3 (nome, CNPJ, contatos) e dos módulos novos (em `aec`). */
export async function salvarEmpresa(orgId: string, dados: { name: string; cnpj: string; contato: { endereco: string; telefone: string; email: string; engenheiroPadrao: string }; aec: Record<string, unknown> }): Promise<void> {
  if (!validEmail(dados.contato.email)) throw new Error('Informe um e-mail válido (ex.: contato@empresa.com.br).');
  await updateDoc(doc(db(), 'organizations', orgId), {
    name: dados.name.trim(), cnpj: formatCnpj(dados.cnpj), companyAddress: dados.contato.endereco.trim().slice(0, 200), companyPhone: dados.contato.telefone.trim().slice(0, 40),
    companyEmail: dados.contato.email.trim().slice(0, 120), defaultEngineer: dados.contato.engenheiroPadrao.trim().slice(0, 120), aec: dados.aec, updatedAt: serverTimestamp(),
  });
}
/** Logotipo no mesmo formato do ObraTop 3 (aparece nos dois aplicativos e nos PDFs). */
export async function salvarLogo(orgId: string, arquivo: File | null): Promise<void> {
  if (!arquivo) { await updateDoc(doc(db(), 'organizations', orgId), { branding: deleteField(), updatedAt: serverTimestamp() }); return; }
  const l = await processLogoFile(arquivo);
  await updateDoc(doc(db(), 'organizations', orgId), { branding: { logo: l.dataUrl, w: l.w, h: l.h, name: l.name, updatedAt: new Date().toISOString() }, updatedAt: serverTimestamp() });
}
