/** Capturas das telas de licença para o manual (emuladores e app de emulador em :4173).  node manual/capturar-licencas.cjs <pasta-img> */
const { chromium } = require('playwright'); const path = require('path');
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'; process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const { initializeApp } = require('firebase-admin/app'); const { getAuth } = require('firebase-admin/auth'); const { getFirestore } = require('firebase-admin/firestore');
initializeApp({ projectId: 'demo-aec' }); const adb = getFirestore(); const D = process.argv[2], S = Date.now(), A = 'http://localhost:4173', SENHA = 'senha-teste-123';
(async () => {
  const adm = await getAuth().createUser({ email: `voce-${S}@construtora.test`, password: SENHA, displayName: 'Você', emailVerified: true });
  const cli = await getAuth().createUser({ email: `cliente-${S}@exemplo.test`, password: SENHA, displayName: 'Cliente', emailVerified: true });
  const T = `cap-${S}`;
  await adb.doc(`organizations/${T}`).set({ name: 'Construtora Exemplo', ownerUid: adm.uid });
  await adb.doc(`organizations/${T}/members/${adm.uid}`).set({ role: 'owner', status: 'active', email: adm.email, name: 'Você' });
  await adb.doc(`users/${adm.uid}`).set({ currentOrg: T });
  await adb.doc('plataforma/acesso').set({ admins: [adm.uid] }, { merge: true });
  for (const l of await adb.collection('licencas').listDocuments()) await l.delete();
  const b = await chromium.launch(); const c = await b.newContext({ viewport: { width: 1360, height: 850 }, deviceScaleFactor: 1.5 });
  await c.addInitScript(() => localStorage.setItem('theme', 'light')); const p = await c.newPage();
  await p.goto(`${A}/login/`); await p.getByLabel('E-mail', { exact: true }).fill(adm.email); await p.getByLabel('Senha').fill(SENHA); await p.getByRole('button', { name: 'Entrar', exact: true }).click(); await p.waitForURL('**/inicio/');
  await p.goto(`${A}/plataforma/`);
  for (const [n, e] of [['Construtora Alfa Ltda.', 'contato@alfa.test'], ['Engenharia Beta', '']]) { await p.getByLabel('Cliente (empresa)').fill(n); await p.getByLabel('E-mail do cliente (recomendado)').fill(e); await p.getByRole('button', { name: 'Emitir código' }).click(); await p.waitForTimeout(900); }
  await p.getByLabel('Cliente (empresa)').fill('Construtora Gama'); await p.getByLabel('E-mail do cliente (recomendado)').fill(cli.email); await p.getByRole('button', { name: 'Emitir código' }).click(); await p.waitForTimeout(1200);
  const codigo = (await p.locator('p.font-mono').innerText()).trim();
  await p.screenshot({ path: path.join(D, '58-licencas.jpg'), type: 'jpeg', quality: 80 });
  const c2 = await b.newContext({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 1.5 }); await c2.addInitScript(() => localStorage.setItem('theme', 'light')); const q = await c2.newPage();
  await q.goto(`${A}/login/`); await q.getByLabel('E-mail', { exact: true }).fill(cli.email); await q.getByLabel('Senha').fill(SENHA); await q.getByRole('button', { name: 'Entrar', exact: true }).click();
  await q.getByRole('heading', { name: 'Bem-vindo ao ObraTop' }).waitFor(); await q.getByLabel('Nome da empresa').fill('Construtora Gama'); await q.getByLabel('Código de licença').fill(codigo); await q.waitForTimeout(400);
  await q.screenshot({ path: path.join(D, '59-criar-empresa.jpg'), type: 'jpeg', quality: 80 });
  await b.close(); console.log('ok');
})();
