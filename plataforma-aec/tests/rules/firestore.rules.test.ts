/**
 * Testes das regras de segurança (rodam contra o emulador do Firestore):
 *   npm run test:rules
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { addDoc, collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

let env: RulesTestEnvironment;
const como = (uid: string, tenantId: string, role: string) => env.authenticatedContext(uid, { tenantId, role }).firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-aec', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
});
afterAll(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'tenants/A'), { nomeFantasia: 'A' });
    await setDoc(doc(db, 'tenants/B'), { nomeFantasia: 'B' });
    await setDoc(doc(db, 'tenants/A/projects/p1'), { nome: 'P1', status: 'briefing', clienteUids: ['cli1'] });
    await setDoc(doc(db, 'tenants/A/projects/p2'), { nome: 'P2', status: 'briefing', clienteUids: [] });
    await setDoc(doc(db, 'tenants/B/projects/pb'), { nome: 'PB', status: 'briefing', clienteUids: [] });
    await setDoc(doc(db, 'tenants/A/projects/p1/budgets/b1'), { status: 'enviado', total: 100 });
    await setDoc(doc(db, 'tenants/A/projects/p1/budgets/b0'), { status: 'rascunho', total: 90 });
    await setDoc(doc(db, 'tenants/A/projects/p1/contracts/c1'), { status: 'rascunho', template: 'x' });
    await setDoc(doc(db, 'tenants/A/projects/p1/contracts/c2'), { status: 'assinado', template: 'x', sha256: 'abc' });
    await setDoc(doc(db, 'tenants/A/projects/p1/timesheets/t1'), { tenantId: 'A', uid: 'proj1', minutos: 60 });
    await setDoc(doc(db, 'tenants/A/projects/p1/artRrt/a1'), { tenantId: 'A', vencimento: '2026-01-01' });
    await setDoc(doc(db, 'tenants/B/projects/pb/artRrt/ab'), { tenantId: 'B', vencimento: '2026-01-01' });
    await setDoc(doc(db, 'tenants/A/auditLogs/l1'), { acao: 'update' });
    await setDoc(doc(db, 'tenants/A/members/proj1'), { role: 'projetista' });
    await setDoc(doc(db, 'tenants/A/notifications/n1'), { titulo: 'x', lidaPor: [], destinatarios: [] });
    await setDoc(doc(db, 'cubTables/BA_2026-11'), { uf: 'BA' });
    await setDoc(doc(db, 'signatureRequests/k1'), { caminho: 'x' });
  });
});

describe('isolamento multi-tenant', () => {
  it('usuário do tenant B não lê nem escreve nada do tenant A', async () => {
    const db = como('uB', 'B', 'socio_diretor');
    await assertFails(getDoc(doc(db, 'tenants/A')));
    await assertFails(getDoc(doc(db, 'tenants/A/projects/p1')));
    await assertFails(getDocs(collection(db, 'tenants/A/projects')));
    await assertFails(updateDoc(doc(db, 'tenants/A/projects/p1'), { nome: 'invadido' }));
    await assertFails(getDoc(doc(db, 'tenants/A/projects/p1/budgets/b1')));
    await assertFails(getDoc(doc(db, 'tenants/A/auditLogs/l1')));
    await assertSucceeds(getDoc(doc(db, 'tenants/B/projects/pb')));
  });
  it('collectionGroup só devolve documentos do próprio tenant', async () => {
    const db = como('uA', 'A', 'coordenador');
    await assertSucceeds(getDocs(query(collectionGroup(db, 'artRrt'), where('tenantId', '==', 'A'))));
    await assertFails(getDocs(query(collectionGroup(db, 'artRrt'), where('tenantId', '==', 'B'))));
    await assertFails(getDocs(collectionGroup(db, 'artRrt')));
  });
  it('sem autenticação ou sem claims: nada', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'tenants/A/projects/p1')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'cubTables/BA_2026-11')));
    await assertFails(getDoc(doc(env.authenticatedContext('semClaims').firestore(), 'tenants/A/projects/p1')));
  });
});

describe('RBAC', () => {
  it('projetista lê projeto mas não altera projeto nem orçamento', async () => {
    const db = como('proj1', 'A', 'projetista');
    await assertSucceeds(getDoc(doc(db, 'tenants/A/projects/p1')));
    await assertFails(updateDoc(doc(db, 'tenants/A/projects/p1'), { status: 'concluido' }));
    await assertFails(updateDoc(doc(db, 'tenants/A/projects/p1/budgets/b0'), { total: 1 }));
    await assertFails(getDoc(doc(db, 'tenants/A/projects/p1/contracts/c1')));
  });
  it('orçamentista edita rascunho mas não aprova; sócio aprova', async () => {
    const orc = como('orc1', 'A', 'orcamentista');
    await assertSucceeds(updateDoc(doc(orc, 'tenants/A/projects/p1/budgets/b0'), { total: 95 }));
    await assertFails(updateDoc(doc(orc, 'tenants/A/projects/p1/budgets/b0'), { status: 'aprovado' }));
    await assertSucceeds(updateDoc(doc(como('s1', 'A', 'socio_diretor'), 'tenants/A/projects/p1/budgets/b0'), { status: 'aprovado' }));
    await assertFails(updateDoc(doc(orc, 'tenants/A/projects/p1/budgets/b0'), { total: 1, status: 'rascunho' })); // aprovado fica travado
  });
  it('cliente: vê só o próprio projeto, só orçamento enviado, e só pode aprovar', async () => {
    const cli = como('cli1', 'A', 'cliente');
    await assertSucceeds(getDoc(doc(cli, 'tenants/A/projects/p1')));
    await assertFails(getDoc(doc(cli, 'tenants/A/projects/p2')));
    await assertSucceeds(getDoc(doc(cli, 'tenants/A/projects/p1/budgets/b1')));
    await assertFails(getDoc(doc(cli, 'tenants/A/projects/p1/budgets/b0')));
    await assertFails(updateDoc(doc(cli, 'tenants/A/projects/p1/budgets/b1'), { status: 'aprovado', total: 1 }));
    await assertSucceeds(updateDoc(doc(cli, 'tenants/A/projects/p1/budgets/b1'), { status: 'aprovado', aprovadoPor: 'cli1' }));
    await assertFails(getDoc(doc(cli, 'tenants/A/projects/p1/timesheets/t1')));
    await assertFails(getDoc(doc(cli, 'tenants/A/members/proj1')));
  });
  it('timesheet: cada um lança e vê as próprias horas', async () => {
    const p1 = como('proj1', 'A', 'projetista');
    const col = collection(p1, 'tenants/A/projects/p1/timesheets');
    await assertSucceeds(addDoc(col, { tenantId: 'A', uid: 'proj1', minutos: 30 }));
    await assertFails(addDoc(col, { tenantId: 'A', uid: 'outro', minutos: 30 }));
    await assertFails(addDoc(col, { tenantId: 'B', uid: 'proj1', minutos: 30 }));
    await assertFails(addDoc(col, { tenantId: 'A', uid: 'proj1', minutos: 5000 }));
    await assertFails(getDoc(doc(como('proj2', 'A', 'projetista'), 'tenants/A/projects/p1/timesheets/t1')));
    await assertSucceeds(getDoc(doc(como('co1', 'A', 'coordenador'), 'tenants/A/projects/p1/timesheets/t1')));
  });
});

describe('integridade', () => {
  it('auditoria é somente leitura do sócio e ninguém escreve', async () => {
    const socio = como('s1', 'A', 'socio_diretor');
    await assertSucceeds(getDoc(doc(socio, 'tenants/A/auditLogs/l1')));
    await assertFails(updateDoc(doc(socio, 'tenants/A/auditLogs/l1'), { acao: 'x' }));
    await assertFails(deleteDoc(doc(socio, 'tenants/A/auditLogs/l1')));
    await assertFails(addDoc(collection(socio, 'tenants/A/auditLogs'), { acao: 'x' }));
    await assertFails(getDoc(doc(como('co1', 'A', 'coordenador'), 'tenants/A/auditLogs/l1')));
  });
  it('contrato: status/hash são do servidor; assinado não é editável', async () => {
    const co = como('co1', 'A', 'coordenador');
    await assertSucceeds(updateDoc(doc(co, 'tenants/A/projects/p1/contracts/c1'), { template: 'novo' }));
    await assertFails(updateDoc(doc(co, 'tenants/A/projects/p1/contracts/c1'), { status: 'assinado' }));
    await assertFails(updateDoc(doc(co, 'tenants/A/projects/p1/contracts/c1'), { sha256: 'forjado' }));
    await assertFails(updateDoc(doc(co, 'tenants/A/projects/p1/contracts/c2'), { template: 'alterado' }));
    await assertFails(setDoc(doc(co, 'tenants/A/projects/p1/contracts/c9'), { status: 'assinado', template: 'x' }));
  });
  it('papéis, CUB oficial e índice de assinaturas não são graváveis pelo cliente web', async () => {
    const socio = como('s1', 'A', 'socio_diretor');
    await assertFails(setDoc(doc(socio, 'tenants/A/members/s1'), { role: 'socio_diretor' }));
    await assertSucceeds(getDoc(doc(socio, 'cubTables/BA_2026-11')));
    await assertFails(setDoc(doc(socio, 'cubTables/BA_2026-11'), { uf: 'BA', valores: {} }));
    await assertFails(getDoc(doc(socio, 'signatureRequests/k1')));
    await assertFails(setDoc(doc(socio, 'tenants/C'), { nomeFantasia: 'novo' }));
  });
  it('notificação: usuário só marca a si mesmo como leitor', async () => {
    const p1 = como('proj1', 'A', 'projetista');
    await assertFails(updateDoc(doc(p1, 'tenants/A/notifications/n1'), { lidaPor: ['outro'] }));
    await assertFails(updateDoc(doc(p1, 'tenants/A/notifications/n1'), { titulo: 'alterado', lidaPor: ['proj1'] }));
    await assertSucceeds(updateDoc(doc(p1, 'tenants/A/notifications/n1'), { lidaPor: ['proj1'] }));
  });
});

describe('quantitativos e vínculos', () => {
  const q = { tenantId: 'A', arquivo: 'm.ifc', formato: 'ifc', itens: [], avisos: [], resumo: '' };
  const v = { tenantId: 'A', chave: 'tubo|m', fonte: 'SINAPI', codigo: '1', fator: 1, estado: 'confirmado' };
  it('orçamentista grava; projetista só lê; outro tenant não acessa', async () => {
    const orc = como('orc1', 'A', 'orcamentista');
    await assertSucceeds(setDoc(doc(orc, 'tenants/A/projects/p1/quantities/m-ifc'), q));
    await assertSucceeds(setDoc(doc(orc, 'tenants/A/vinculos/v1'), v));
    const proj = como('proj1', 'A', 'projetista');
    await assertSucceeds(getDoc(doc(proj, 'tenants/A/projects/p1/quantities/m-ifc')));
    await assertFails(setDoc(doc(proj, 'tenants/A/vinculos/v2'), v));
    await assertFails(setDoc(doc(proj, 'tenants/A/projects/p1/quantities/x'), q));
    const fora = como('uB', 'B', 'socio_diretor');
    await assertFails(getDoc(doc(fora, 'tenants/A/vinculos/v1')));
    await assertFails(setDoc(doc(fora, 'tenants/A/vinculos/v1'), v));
    await assertFails(getDoc(doc(como('cli1', 'A', 'cliente'), 'tenants/A/projects/p1/quantities/m-ifc')));
  });
  it('vínculo precisa ser confirmado, com fator positivo e tenant correto', async () => {
    const orc = como('orc1', 'A', 'orcamentista');
    await assertFails(setDoc(doc(orc, 'tenants/A/vinculos/v3'), { ...v, estado: 'sugerido' }));
    await assertFails(setDoc(doc(orc, 'tenants/A/vinculos/v3'), { ...v, fator: 0 }));
    await assertFails(setDoc(doc(orc, 'tenants/A/vinculos/v3'), { ...v, tenantId: 'B' }));
  });
});

describe('cotações e parâmetros de preço', () => {
  const cot = { tenantId: 'A', numero: '001/2026', cliente: 'X', itens: [] };
  it('orçamentista grava; projetista só lê; cliente e outro tenant não acessam', async () => {
    const orc = como('orc1', 'A', 'orcamentista');
    await assertSucceeds(setDoc(doc(orc, 'tenants/A/cotacoes/c1'), cot));
    await assertSucceeds(setDoc(doc(orc, 'tenants/A/config/composicoes'), { tenantId: 'A', bdi: 25 }));
    const proj = como('proj1', 'A', 'projetista');
    await assertSucceeds(getDoc(doc(proj, 'tenants/A/cotacoes/c1')));
    await assertFails(setDoc(doc(proj, 'tenants/A/cotacoes/c2'), cot));
    await assertFails(setDoc(doc(proj, 'tenants/A/config/composicoes'), { tenantId: 'A', bdi: 0 }));
    await assertFails(getDoc(doc(como('cli1', 'A', 'cliente'), 'tenants/A/cotacoes/c1')));
    await assertFails(getDoc(doc(como('uB', 'B', 'socio_diretor'), 'tenants/A/cotacoes/c1')));
    await assertFails(setDoc(doc(orc, 'tenants/A/cotacoes/c3'), { ...cot, tenantId: 'B' }));
    await assertSucceeds(deleteDoc(doc(orc, 'tenants/A/cotacoes/c1')));
  });
});
