// Testa a migração do ObraTop no emulador do Firestore:
//   npx firebase emulators:exec --only firestore --project demo-aec "node tests/e2e/migracao.e2e.mjs"
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { migrar } from '../../scripts/migrar-obratop.mjs';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
const origem = getFirestore(initializeApp({ projectId: 'demo-obratop' }, 'o'));
const destino = getFirestore(initializeApp({ projectId: 'demo-aec' }, 'd'));
const calado = { log: () => {} };

await origem.doc('organizations/org1').set({ name: 'Construtora' });
await origem.doc('organizations/org1/works/w1').set({ name: 'Obra 1', status: 'Em andamento' });
await origem.doc('organizations/org1/works/w2').set({ name: 'Obra apagada', deleted: true });
await origem.doc('organizations/org1/measurements/m1').set({ workId: 'w1', value: 1000, contractId: 'c1' });
await origem.doc('organizations/org1/contracts/c1').set({ workId: 'w1', value: 5000 });
await origem.doc('organizations/outra/works/x').set({ name: 'De outra organização' });
await origem.doc('organizations/org1/members/u1').set({ role: 'owner' }); // não é módulo de obra: não migra

await assert.rejects(migrar(origem, destino, { org: 'org1', tenant: 't1', gravar: true, ...calado }), /não existe no destino/);
await destino.doc('tenants/t1').set({ nomeFantasia: 'Escritório' });
await assert.rejects(migrar(origem, destino, { org: 'nao-existe', tenant: 't1', ...calado }), /não encontrada/);

const sim = await migrar(origem, destino, { org: 'org1', tenant: 't1', ...calado });
assert.equal(sim.works.copiados, 2);
assert.equal((await destino.collection('tenants/t1/works').get()).size, 0, 'simulação não grava');

await destino.doc('tenants/t1/works/w1').set({ name: 'Já editada na plataforma', tenantId: 't1' });
const r = await migrar(origem, destino, { org: 'org1', tenant: 't1', gravar: true, ...calado });
assert.deepEqual([r.works.copiados, r.works.jaExistiam, r.measurements.copiados, r.contracts.copiados], [1, 1, 1, 1]);
assert.equal((await destino.doc('tenants/t1/works/w1').get()).data().name, 'Já editada na plataforma', 'não sobrescreve sem pedir');
const m = (await destino.doc('tenants/t1/measurements/m1').get()).data();
assert.deepEqual([m.workId, m.contractId, m.tenantId, m.value], ['w1', 'c1', 't1', 1000], 'ids e referências preservados');
assert.equal((await destino.doc('tenants/t1/works/w2').get()).data().deleted, true, 'exclusões lógicas preservadas');
assert.equal((await destino.doc('tenants/t1/works/x').get()).exists, false, 'outra organização não entra');
assert.equal((await destino.doc('tenants/t1/members/u1').get()).exists, false, 'membros não são migrados');
assert.equal((await origem.collection('organizations/org1/works').get()).size, 2, 'origem intacta');

const de_novo = await migrar(origem, destino, { org: 'org1', tenant: 't1', gravar: true, ...calado });
assert.equal(Object.values(de_novo).reduce((s, x) => s + x.copiados, 0), 0, 'repetir a migração não duplica');
await migrar(origem, destino, { org: 'org1', tenant: 't1', gravar: true, sobrescrever: true, ...calado });
assert.equal((await destino.doc('tenants/t1/works/w1').get()).data().name, 'Obra 1', '--sobrescrever substitui');
console.log('migração: 12 verificações ok');
process.exit(0);
