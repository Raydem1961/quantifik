/**
 * Testes das regras de segurança (rodam contra o emulador do Firestore):
 *   npm run test:rules
 * As regras são as do ObraTop (regras/obratop-base) + a extensão dos módulos novos; os testes
 * cobrem os dois lados: o que o ObraTop já garantia continua valendo, e a extensão não abre brechas.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { addDoc, collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, query, setDoc, Timestamp, updateDoc, where, writeBatch } from 'firebase/firestore';

let env: RulesTestEnvironment;
const como = (uid: string, email = `${uid}@x.com`) => env.authenticatedContext(uid, { email }).firestore();
const O = 'organizations/A';

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-aec', firestore: { rules: readFileSync(process.env.REGRAS ?? 'firestore.rules', 'utf8') } });
});
afterAll(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const m = (role: string, extra = {}) => ({ role, status: 'active', email: 'e@x.com', inviteCode: 'c', ...extra });
    await setDoc(doc(db, O), { name: 'A', ownerUid: 'dono' });
    await setDoc(doc(db, 'organizations/B'), { name: 'B', ownerUid: 'donoB' });
    await setDoc(doc(db, `${O}/members/dono`), m('owner'));
    await setDoc(doc(db, `${O}/members/coord`), m('project_user', { workId: 'w1' }));
    await setDoc(doc(db, `${O}/members/orc`), m('project_user', { workId: 'w1' }));
    await setDoc(doc(db, `${O}/members/proj`), m('project_user', { workId: 'w1' }));
    await setDoc(doc(db, `${O}/members/outraObra`), m('project_user', { workId: 'w2' }));
    await setDoc(doc(db, `${O}/members/bloqueado`), { ...m('project_user', { workId: 'w1' }), status: 'blocked' });
    await setDoc(doc(db, 'organizations/B/members/donoB'), m('owner'));
    await setDoc(doc(db, `${O}/perfis/coord`), { perfil: 'coordenador' });
    await setDoc(doc(db, `${O}/perfis/orc`), { perfil: 'orcamentista' });
    await setDoc(doc(db, `${O}/works/w1`), { name: 'Obra 1' });
    await setDoc(doc(db, `${O}/works/w2`), { name: 'Obra 2' });
    await setDoc(doc(db, `${O}/finance/f1`), { workId: 'w1', value: 10, deleted: false });
    await setDoc(doc(db, `${O}/suppliers/s1`), { name: 'Forn' });
    await setDoc(doc(db, `${O}/projects/p1`), { nome: 'P1', status: 'briefing' });
    await setDoc(doc(db, 'organizations/B/projects/pb'), { nome: 'PB' });
    await setDoc(doc(db, `${O}/projects/p1/budgets/b1`), { status: 'enviado', total: 100 });
    await setDoc(doc(db, `${O}/projects/p1/budgets/b2`), { status: 'aprovado', total: 100 });
    await setDoc(doc(db, `${O}/projects/p1/contracts/c1`), { status: 'rascunho', template: 'x' });
    await setDoc(doc(db, `${O}/projects/p1/contracts/c2`), { status: 'assinado', template: 'x', sha256: 'abc' });
    await setDoc(doc(db, `${O}/projects/p1/timesheets/t1`), { orgId: 'A', uid: 'proj', minutos: 60 });
    await setDoc(doc(db, `${O}/projects/p1/artRrt/a1`), { orgId: 'A', vencimento: '2026-01-01' });
    await setDoc(doc(db, 'organizations/B/projects/pb/artRrt/ab'), { orgId: 'B', vencimento: '2026-01-01' });
    await setDoc(doc(db, `${O}/auditLogs/l1`), { acao: 'update' });
    await setDoc(doc(db, `${O}/notifications/n1`), { titulo: 'x', lidaPor: [] });
    await setDoc(doc(db, 'cubTables/BA_2026-11'), { uf: 'BA' });
    await setDoc(doc(db, 'signatureRequests/k1'), { caminho: 'x' });
  });
});

describe('isolamento entre empresas', () => {
  it('membro da empresa B não lê nem escreve nada da empresa A', async () => {
    const db = como('donoB');
    await assertFails(getDoc(doc(db, O)));
    await assertFails(getDoc(doc(db, `${O}/projects/p1`)));
    await assertFails(getDocs(collection(db, `${O}/works`)));
    await assertFails(updateDoc(doc(db, `${O}/projects/p1`), { nome: 'invadido' }));
    await assertFails(getDoc(doc(db, `${O}/projects/p1/budgets/b1`)));
    await assertFails(getDoc(doc(db, `${O}/perfis/coord`)));
    await assertFails(setDoc(doc(db, `${O}/perfis/donoB`), { perfil: 'coordenador' }));
    await assertSucceeds(getDoc(doc(db, 'organizations/B/projects/pb')));
  });
  it('consulta entre projetos só devolve documentos da própria empresa', async () => {
    const db = como('proj');
    await assertSucceeds(getDocs(query(collectionGroup(db, 'artRrt'), where('orgId', '==', 'A'))));
    await assertFails(getDocs(query(collectionGroup(db, 'artRrt'), where('orgId', '==', 'B'))));
    await assertFails(getDocs(collectionGroup(db, 'artRrt')));
  });
  it('sem login, sem vínculo ou bloqueado: nada', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), `${O}/projects/p1`)));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'cubTables/BA_2026-11')));
    await assertFails(getDoc(doc(como('estranho'), `${O}/projects/p1`)));
    await assertFails(getDoc(doc(como('bloqueado'), `${O}/works/w1`)));
    await assertFails(getDoc(doc(como('bloqueado'), `${O}/projects/p1`)));
  });
});

describe('ObraTop: o que já valia continua valendo', () => {
  it('proprietário grava em qualquer obra; usuário de obra só na sua', async () => {
    await assertSucceeds(setDoc(doc(como('dono'), `${O}/finance/n1`), { workId: 'w2', value: 5, deleted: false }));
    await assertSucceeds(setDoc(doc(como('proj'), `${O}/finance/n2`), { workId: 'w1', value: 5, deleted: false }));
    await assertFails(setDoc(doc(como('proj'), `${O}/finance/n3`), { workId: 'w2', value: 5, deleted: false }));
    await assertFails(setDoc(doc(como('proj'), `${O}/finance/n4`), { workId: 'w1', value: -1, deleted: false }));
    await assertSucceeds(updateDoc(doc(como('proj'), `${O}/finance/f1`), { value: 20 }));
    await assertFails(updateDoc(doc(como('outraObra'), `${O}/finance/f1`), { value: 20 }));
  });
  it('exclusão (lógica ou definitiva) é só do proprietário', async () => {
    await assertFails(updateDoc(doc(como('proj'), `${O}/finance/f1`), { deleted: true }));
    await assertFails(deleteDoc(doc(como('proj'), `${O}/finance/f1`)));
    await assertSucceeds(updateDoc(doc(como('dono'), `${O}/finance/f1`), { deleted: true }));
  });
  it('obras e fornecedores: criação só pelo proprietário', async () => {
    await assertFails(setDoc(doc(como('proj'), `${O}/works/w9`), { name: 'Nova' }));
    await assertSucceeds(setDoc(doc(como('dono'), `${O}/works/w9`), { name: 'Nova' }));
    await assertSucceeds(updateDoc(doc(como('proj'), `${O}/works/w1`), { name: 'Obra 1', progress: 30 }));
    await assertFails(updateDoc(doc(como('proj'), `${O}/works/w2`), { name: 'Obra 2', progress: 30 }));
    await assertFails(setDoc(doc(como('proj'), `${O}/suppliers/s2`), { name: 'X' }));
    await assertSucceeds(setDoc(doc(como('dono'), `${O}/suppliers/s2`), { name: 'X' }));
  });
  it('diário de obra segue a mesma regra dos registros de obra', async () => {
    await assertSucceeds(setDoc(doc(como('proj'), `${O}/dailyLogs/d1`), { workId: 'w1', date: '2026-11-01', laborCount: 8, deleted: false }));
    await assertFails(setDoc(doc(como('proj'), `${O}/dailyLogs/d2`), { workId: 'w2', date: '2026-11-01', deleted: false }));
    await assertFails(setDoc(doc(como('proj'), `${O}/dailyLogs/d3`), { workId: 'w1', laborCount: -2, deleted: false }));
    await assertFails(deleteDoc(doc(como('proj'), `${O}/dailyLogs/d1`)));
  });
  it('criar empresa: o próprio usuário vira proprietário, e só dele', async () => {
    const db = como('novo');
    const lote = writeBatch(db);
    lote.set(doc(db, 'organizations/N'), { name: 'Nova', ownerUid: 'novo' });
    lote.set(doc(db, 'organizations/N/members/novo'), { role: 'owner', status: 'active', email: 'novo@x.com' });
    lote.set(doc(db, 'users/novo'), { currentOrg: 'N' });
    await assertSucceeds(lote.commit());
    await assertFails(setDoc(doc(como('estranho'), `${O}/members/estranho`), { role: 'owner', status: 'active' }));
    await assertFails(setDoc(doc(como('estranho'), 'organizations/Z'), { name: 'Z', ownerUid: 'outro' }));
    await assertFails(updateDoc(doc(como('proj'), O), { name: 'Tomada' }));
    await assertFails(updateDoc(doc(como('dono'), O), { ownerUid: 'proj' }));
    await assertSucceeds(updateDoc(doc(como('dono'), O), { name: 'A2', aec: { uf: 'BA' } }));
  });
  it('convite: só o proprietário emite; só o e-mail convidado entra, na obra do convite', async () => {
    const validade = Timestamp.fromDate(new Date(Date.now() + 86400000));
    const convite = { orgId: 'A', email: 'nova@x.com', role: 'project_user', workId: 'w1', expiresAt: validade };
    await assertFails(setDoc(doc(como('proj'), 'invites/cod12345'), convite));
    await assertSucceeds(setDoc(doc(como('dono'), 'invites/cod12345'), convite));
    const membro = { role: 'project_user', status: 'active', workId: 'w1', inviteCode: 'cod12345', email: 'nova@x.com' };
    await assertFails(setDoc(doc(como('intruso', 'intruso@x.com'), `${O}/members/intruso`), membro));
    await assertFails(setDoc(doc(como('nova', 'nova@x.com'), `${O}/members/nova`), { ...membro, workId: 'w2' }));
    await assertFails(setDoc(doc(como('nova', 'nova@x.com'), `${O}/members/nova`), { ...membro, role: 'owner' }));
    await assertSucceeds(setDoc(doc(como('nova', 'nova@x.com'), `${O}/members/nova`), membro));
  });
  it('membro não muda o próprio cadastro; proprietário muda a obra e remove', async () => {
    await assertFails(updateDoc(doc(como('proj'), `${O}/members/proj`), { workId: 'w2' }));
    await assertFails(updateDoc(doc(como('proj'), `${O}/members/proj`), { role: 'owner' }));
    await assertSucceeds(updateDoc(doc(como('dono'), `${O}/members/proj`), { workId: 'w2' }));
    await assertFails(updateDoc(doc(como('dono'), `${O}/members/proj`), { role: 'owner' }));
    await assertSucceeds(deleteDoc(doc(como('dono'), `${O}/members/outraObra`)));
    await assertFails(deleteDoc(doc(como('dono'), `${O}/members/dono`)));
  });
});

describe('perfis dos módulos novos', () => {
  it('ninguém se promove: só o proprietário grava perfil, e só valores conhecidos', async () => {
    await assertFails(setDoc(doc(como('proj'), `${O}/perfis/proj`), { perfil: 'coordenador' }));
    await assertFails(updateDoc(doc(como('orc'), `${O}/perfis/orc`), { perfil: 'coordenador' }));
    await assertFails(setDoc(doc(como('dono'), `${O}/perfis/proj`), { perfil: 'dono' }));
    await assertFails(setDoc(doc(como('dono'), `${O}/perfis/proj`), { perfil: 'coordenador', extra: 1 }));
    await assertSucceeds(setDoc(doc(como('dono'), `${O}/perfis/proj`), { perfil: 'orcamentista' }));
    await assertSucceeds(getDoc(doc(como('proj'), `${O}/perfis/proj`)));
  });
  it('campo perfil no cadastro de membro não dá poder nenhum', async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), `${O}/members/proj`), { perfil: 'coordenador' }));
    await assertFails(updateDoc(doc(como('proj'), `${O}/projects/p1`), { status: 'concluido' }));
  });
  it('projetista lê projeto mas não altera projeto nem orçamento', async () => {
    const db = como('proj');
    await assertSucceeds(getDoc(doc(db, `${O}/projects/p1`)));
    await assertFails(updateDoc(doc(db, `${O}/projects/p1`), { status: 'concluido' }));
    await assertFails(addDoc(collection(db, `${O}/projects/p1/budgets`), { status: 'rascunho' }));
    await assertFails(getDoc(doc(db, `${O}/projects/p1/contracts/c1`)));
    await assertFails(setDoc(doc(db, `${O}/cotacoes/x`), { itens: [] }));
  });
  it('orçamentista cria e envia orçamento, mas não aprova nem mexe em aprovado', async () => {
    const db = como('orc');
    await assertSucceeds(addDoc(collection(db, `${O}/projects/p1/budgets`), { status: 'rascunho' }));
    await assertFails(addDoc(collection(db, `${O}/projects/p1/budgets`), { status: 'aprovado' }));
    await assertFails(updateDoc(doc(db, `${O}/projects/p1/budgets/b1`), { status: 'aprovado' }));
    await assertFails(updateDoc(doc(db, `${O}/projects/p1/budgets/b2`), { total: 1 }));
    await assertSucceeds(updateDoc(doc(como('dono'), `${O}/projects/p1/budgets/b1`), { status: 'aprovado' }));
    await assertSucceeds(setDoc(doc(db, `${O}/cotacoes/x`), { itens: [] }));
    await assertSucceeds(setDoc(doc(db, `${O}/vinculos/v1`), { estado: 'confirmado', fator: 1 }));
    await assertFails(setDoc(doc(db, `${O}/vinculos/v2`), { estado: 'sugerido', fator: 1 }));
    await assertFails(updateDoc(doc(db, `${O}/projects/p1`), { status: 'concluido' }));
  });
  it('coordenador gere projetos e contratos em rascunho; assinado é intocável', async () => {
    const db = como('coord');
    await assertSucceeds(updateDoc(doc(db, `${O}/projects/p1`), { status: 'anteprojeto' }));
    await assertSucceeds(updateDoc(doc(db, `${O}/projects/p1/contracts/c1`), { template: 'novo' }));
    await assertFails(updateDoc(doc(db, `${O}/projects/p1/contracts/c1`), { status: 'assinado' }));
    await assertFails(updateDoc(doc(db, `${O}/projects/p1/contracts/c1`), { sha256: 'forjado' }));
    await assertFails(updateDoc(doc(db, `${O}/projects/p1/contracts/c2`), { template: 'adulterado' }));
    await assertFails(deleteDoc(doc(db, `${O}/projects/p1`)));
    await assertFails(deleteDoc(doc(como('dono'), `${O}/projects/p1/contracts/c2`)));
  });
  it('horas: cada um lança e vê as suas; gestor vê todas', async () => {
    const db = como('orc');
    await assertSucceeds(setDoc(doc(db, `${O}/projects/p1/timesheets/t2`), { orgId: 'A', uid: 'orc', minutos: 30 }));
    await assertFails(setDoc(doc(db, `${O}/projects/p1/timesheets/t3`), { orgId: 'A', uid: 'proj', minutos: 30 }));
    await assertFails(setDoc(doc(db, `${O}/projects/p1/timesheets/t4`), { orgId: 'B', uid: 'orc', minutos: 30 }));
    await assertFails(setDoc(doc(db, `${O}/projects/p1/timesheets/t5`), { orgId: 'A', uid: 'orc', minutos: 5000 }));
    await assertFails(getDoc(doc(db, `${O}/projects/p1/timesheets/t1`)));
    await assertSucceeds(getDoc(doc(como('proj'), `${O}/projects/p1/timesheets/t1`)));
    await assertFails(getDocs(query(collectionGroup(db, 'timesheets'), where('orgId', '==', 'A'))));
    await assertSucceeds(getDocs(query(collectionGroup(como('coord'), 'timesheets'), where('orgId', '==', 'A'))));
  });
});

describe('dados do servidor', () => {
  it('auditoria: só o proprietário lê; ninguém escreve', async () => {
    await assertSucceeds(getDoc(doc(como('dono'), `${O}/auditLogs/l1`)));
    await assertFails(getDoc(doc(como('coord'), `${O}/auditLogs/l1`)));
    await assertFails(setDoc(doc(como('dono'), `${O}/auditLogs/l2`), { acao: 'x' }));
    await assertFails(deleteDoc(doc(como('dono'), `${O}/auditLogs/l1`)));
  });
  it('arquivos CAD e revisões são criados só pelo servidor', async () => {
    await assertFails(setDoc(doc(como('dono'), `${O}/projects/p1/files/f1`), { nome: 'x' }));
    await assertFails(setDoc(doc(como('dono'), `${O}/projects/p1/files/f1/versions/R00`), { sha256: 'x' }));
  });
  it('notificação: só marcar como lida para si', async () => {
    const db = como('proj');
    await assertSucceeds(updateDoc(doc(db, `${O}/notifications/n1`), { lidaPor: ['proj'] }));
    await assertFails(updateDoc(doc(db, `${O}/notifications/n1`), { lidaPor: ['proj', 'outro'] }));
    await assertFails(updateDoc(doc(db, `${O}/notifications/n1`), { titulo: 'alterado' }));
    await assertFails(setDoc(doc(db, `${O}/notifications/n2`), { titulo: 'x', lidaPor: [] }));
  });
  it('CUB oficial e índice de assinaturas', async () => {
    await assertSucceeds(getDoc(doc(como('proj'), 'cubTables/BA_2026-11')));
    await assertFails(setDoc(doc(como('dono'), 'cubTables/BA_2026-12'), { uf: 'BA' }));
    await assertFails(getDoc(doc(como('dono'), 'signatureRequests/k1')));
    await assertSucceeds(setDoc(doc(como('dono'), `${O}/cubOverrides/BA_2026-11`), { x: 1 }));
    await assertFails(setDoc(doc(como('coord'), `${O}/cubOverrides/BA_2026-11`), { x: 1 }));
  });
});
