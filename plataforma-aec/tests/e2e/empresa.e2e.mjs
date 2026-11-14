// npx firebase emulators:exec --only firestore,auth --project demo-aec "node tests/e2e/empresa.e2e.mjs"
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { criarEmpresa } from '../../scripts/criar-empresa.mjs';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
const app = initializeApp({ projectId: 'demo-aec' });
const db = getFirestore(app), auth = getAuth(app);
const base = { tenant: 'construtora-x', nome: 'Construtora X', uf: 'BA', conselho: 'CREA', rt: 'Eng. X', registro: 'CREA-BA 1', socio: 'dono@x.test' };

await assert.rejects(criarEmpresa(db, auth, base), /Não existe conta/);
const u = await auth.createUser({ email: 'dono@x.test', password: 'senha-123456' });
await assert.rejects(criarEmpresa(db, auth, { ...base, tenant: 'X!' }), /--tenant/);
await assert.rejects(criarEmpresa(db, auth, { ...base, uf: 'ZZ' }), /--uf/);
assert.equal((await db.doc('tenants/construtora-x').get()).exists, false, 'entrada inválida não cria nada');

const r = await criarEmpresa(db, auth, base);
assert.equal(r.criada, true);
assert.deepEqual((await auth.getUser(u.uid)).customClaims, { tenantId: 'construtora-x', role: 'socio_diretor' });
const t = (await db.doc('tenants/construtora-x').get()).data();
assert.deepEqual([t.nomeFantasia, t.uf, t.responsavelTecnico.registro, t.branding.corPrimaria], ['Construtora X', 'BA', 'CREA-BA 1', '#3b4cca']);
assert.equal((await db.doc(`tenants/construtora-x/members/${u.uid}`).get()).data().role, 'socio_diretor');

await db.doc('tenants/construtora-x').update({ nomeFantasia: 'Editado no app' });
const u2 = await auth.createUser({ email: 'socio2@x.test', password: 'senha-123456' });
const r2 = await criarEmpresa(db, auth, { ...base, nome: 'Outro nome', socio: 'socio2@x.test' });
assert.equal(r2.criada, false);
assert.equal((await db.doc('tenants/construtora-x').get()).data().nomeFantasia, 'Editado no app', 'rodar de novo não sobrescreve o cadastro');
assert.equal((await auth.getUser(u2.uid)).customClaims.role, 'socio_diretor');
await assert.rejects(criarEmpresa(db, auth, { ...base, tenant: 'outra-empresa' }), /já pertence à empresa/);
console.log('criar empresa: 11 verificações ok');
process.exit(0);
