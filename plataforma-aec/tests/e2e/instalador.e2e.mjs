// O instalador reconhece o ObraTop já em uso no projeto (empresa, dono, registros), no emulador:
//   npx firebase emulators:exec --only firestore,auth --project demo-aec "node tests/e2e/instalador.e2e.mjs"
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { organizacoesObraTop } from '../../scripts/instalar.mjs';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
const db = getFirestore(initializeApp({ projectId: 'demo-aec' }));
await db.doc('organizations/orgA').set({ name: 'Construtora Exemplo Ltda.' });
await db.doc('organizations/orgA/members/u1').set({ email: 'dono@construtora.test', role: 'owner', status: 'active' });
await db.doc('organizations/orgA/members/u2').set({ email: 'obra@construtora.test', role: 'project_user', status: 'active' });
await db.doc('organizations/orgA/works/w1').set({ name: 'Obra 1' });
await db.doc('organizations/orgA/finance/f1').set({ workId: 'w1', value: 10 });
await db.doc('organizations/orgA/dailyLogs/d1').set({ workId: 'w1' });
await db.doc('organizations/vazia').set({ name: 'Org sem dados' });
const antes = JSON.stringify((await db.doc('organizations/orgA/works/w1').get()).data());

const orgs = await organizacoesObraTop(db);
assert.deepEqual([orgs[0].id, orgs[0].nome, orgs[0].donoEmail, orgs[0].registros, orgs[0].membros], ['orgA', 'Construtora Exemplo Ltda.', 'dono@construtora.test', 3, 2], 'acha a organização com dados, o dono e a contagem');
assert.equal(orgs.length, 2);
assert.equal(orgs[1].registros, 0, 'organização vazia fica por último');
assert.equal(JSON.stringify((await db.doc('organizations/orgA/works/w1').get()).data()), antes, 'a leitura não altera nada do ObraTop');
console.log('instalador: 4 verificações ok');
process.exit(0);
