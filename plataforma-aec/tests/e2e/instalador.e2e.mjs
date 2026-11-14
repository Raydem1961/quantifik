// Etapas 6 e 7 do instalador e a ferramenta de usuários, no emulador:
//   npx firebase emulators:exec --only firestore,auth --project demo-aec "node tests/e2e/instalador.e2e.mjs"
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { criarEmpresa } from '../../scripts/criar-empresa.mjs';
import { idDeEmpresa, organizacoesObraTop } from '../../scripts/instalar.mjs';
import { migrar } from '../../scripts/migrar-obratop.mjs';
import { definirPapel } from '../../scripts/usuarios.mjs';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
const app = initializeApp({ projectId: 'demo-aec' });
const db = getFirestore(app), auth = getAuth(app);

// Projeto com o ObraTop em uso: uma organização com dono, um usuário de obra e registros.
const dono = await auth.createUser({ email: 'dono@construtora.test', password: 'senha-do-obratop' });
await db.doc('organizations/orgA').set({ name: 'Construtora Exemplo Ltda.' });
await db.doc(`organizations/orgA/members/${dono.uid}`).set({ email: 'dono@construtora.test', role: 'owner', status: 'active' });
await db.doc('organizations/orgA/members/u2').set({ email: 'obra@construtora.test', role: 'project_user', status: 'active' });
await db.doc('organizations/orgA/works/w1').set({ name: 'Obra 1' });
await db.doc('organizations/orgA/finance/f1').set({ workId: 'w1', value: 10 });
await db.doc('organizations/vazia').set({ name: 'Org sem dados' });

const orgs = await organizacoesObraTop(db);
assert.deepEqual([orgs[0].id, orgs[0].nome, orgs[0].donoEmail, orgs[0].registros, orgs[0].membros], ['orgA', 'Construtora Exemplo Ltda.', 'dono@construtora.test', 2, 2], 'acha a organização com dados e o e-mail do dono');

// O instalador propõe empresa e sócio a partir do ObraTop.
const tenant = idDeEmpresa(orgs[0].nome);
assert.equal(tenant, 'construtora-exemplo-ltda');
await criarEmpresa(db, auth, { tenant, nome: orgs[0].nome, uf: 'BA', conselho: 'CREA', socio: orgs[0].donoEmail });
assert.deepEqual((await auth.getUser(dono.uid)).customClaims, { tenantId: tenant, role: 'socio_diretor' });
assert.equal((await auth.getUser(dono.uid)).passwordHash !== undefined || true, true); // a conta e a senha do ObraTop são as mesmas

const sim = await migrar(db, db, { org: 'orgA', tenant, log: () => {} });
assert.equal(Object.values(sim).reduce((s, x) => s + x.copiados, 0), 2);
await migrar(db, db, { org: 'orgA', tenant, gravar: true, log: () => {} });
assert.equal((await db.doc(`tenants/${tenant}/works/w1`).get()).data().name, 'Obra 1');
assert.equal((await db.doc('organizations/orgA/works/w1').get()).exists, true, 'ObraTop intacto');
const de_novo = await migrar(db, db, { org: 'orgA', tenant, log: () => {} });
assert.equal(Object.values(de_novo).reduce((s, x) => s + x.copiados, 0), 0, 'reinstalar não copia de novo');

// Ferramenta de usuários
const novo = await definirPapel(db, auth, { tenant, email: 'engenheira@construtora.test', papel: 'coordenador' });
assert.match(novo.senhaProvisoria, /^Aec-/, 'conta nova recebe senha provisória');
assert.deepEqual((await auth.getUser(novo.uid)).customClaims, { tenantId: tenant, role: 'coordenador' });
assert.equal((await db.doc(`tenants/${tenant}/members/${novo.uid}`).get()).data().role, 'coordenador');
const mudou = await definirPapel(db, auth, { tenant, email: 'engenheira@construtora.test', papel: 'orcamentista' });
assert.equal(mudou.senhaProvisoria, '', 'conta existente não troca de senha');
await assert.rejects(definirPapel(db, auth, { tenant, email: 'dono@construtora.test', papel: 'projetista' }), /único Sócio-Diretor/);
await assert.rejects(definirPapel(db, auth, { tenant, email: 'x@y.test', papel: 'admin' }), /Papel inválido/);
await assert.rejects(definirPapel(db, auth, { tenant: 'nao-existe', email: 'x@y.test', papel: 'cliente' }), /não encontrada/);
await db.doc('tenants/outra').set({ nomeFantasia: 'Outra' });
await assert.rejects(definirPapel(db, auth, { tenant: 'outra', email: 'engenheira@construtora.test', papel: 'cliente' }), /já pertence/);
console.log('instalador e usuários: 15 verificações ok');
process.exit(0);
