/**
 * Licenças de uso, de ponta a ponta (emuladores auth/firestore no ar e app em :4173): só o
 * administrador da plataforma emite códigos; criar empresa exige um código válido, de uso único,
 * preso ao e-mail quando emitido assim; o link de licença chega preenchido depois do cadastro.
 */
const { chromium } = require('playwright');
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp({ projectId: 'demo-aec' });
const adb = getFirestore();
const S = Date.now(), T = `lic-${S}`, APP = 'http://localhost:4173', SENHA = 'senha-teste-123';
let ok = 0; const falhas = [];
const checar = (n, c, d = '') => { if (c) { ok++; console.log(`  ok   ${n}`); } else { falhas.push(n); console.log(`  FALHA ${n} ${d}`); } };
const ate = async (fn, ms = 20000) => { const fim = Date.now() + ms; let r; while (Date.now() < fim) { r = await fn(); if (r) return r; await new Promise((x) => setTimeout(x, 400)); } return r; };
const ve = (l, ms = 15000) => l.waitFor({ timeout: ms }).then(() => true, () => false);

(async () => {
  const conta = (email, nome) => getAuth().createUser({ email, password: SENHA, displayName: nome, emailVerified: true });
  const admin = await conta(`admin-${S}@lic.test`, 'Admin Plataforma');
  const outroDono = await conta(`outro-${S}@lic.test`, 'Outro Dono');
  const cliente = await conta(`cliente-${S}@lic.test`, 'Cliente Licenciado');
  const intruso = await conta(`intruso-${S}@lic.test`, 'Intruso');
  for (const [id, u] of [[T, admin], [`${T}-b`, outroDono]]) {
    await adb.doc(`organizations/${id}`).set({ name: `Empresa ${id}`, ownerUid: u.uid });
    await adb.doc(`organizations/${id}/members/${u.uid}`).set({ role: 'owner', status: 'active', email: u.email, name: u.displayName });
    await adb.doc(`users/${u.uid}`).set({ currentOrg: id });
  }
  await adb.doc('plataforma/acesso').set({ admins: [admin.uid], emails: [] }, { merge: true });

  const b = await chromium.launch(); const erros = [];
  const pagina = async () => { const c = await b.newContext({ viewport: { width: 1360, height: 900 } }); await c.grantPermissions(['clipboard-read', 'clipboard-write']); const p = await c.newPage(); p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => d.accept()); return p; };
  const entrar = async (p, email) => { await p.goto(`${APP}/login/`, { waitUntil: 'load' }); await p.getByLabel('E-mail', { exact: true }).fill(email); await p.getByLabel('Senha').fill(SENHA); await p.getByRole('button', { name: 'Entrar', exact: true }).click(); };
  try {
    console.log('\n1. Emissão (só o administrador da plataforma)');
    const pa = await pagina(); await entrar(pa, admin.email); await pa.waitForURL('**/inicio/');
    await pa.goto(`${APP}/area/administrativo/`, { waitUntil: 'load' });
    checar('menu "Licenças da plataforma" para o administrador', await ve(pa.getByRole('link', { name: 'Licenças da plataforma' }).first()));
    await pa.goto(`${APP}/plataforma/`, { waitUntil: 'load' });
    await pa.getByLabel('Cliente (empresa)').fill('Construtora Licenciada');
    await pa.getByLabel('E-mail do cliente (recomendado)').fill(cliente.email);
    await pa.getByRole('button', { name: 'Emitir código' }).click();
    await pa.getByText('Código emitido').waitFor({ timeout: 15000 });
    const codigo = (await pa.locator('p.font-mono').innerText()).trim();
    checar('código no formato OT4-XXXXX-XXXXX-XXXXX gravado', /^OT4-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(codigo) && (await adb.doc(`licencas/${codigo}`).get()).data()?.email === cliente.email);
    checar('código aparece como Disponível', await ve(pa.getByRole('row').filter({ hasText: codigo }).getByText('Disponível')));

    const po = await pagina(); await entrar(po, outroDono.email); await po.waitForURL('**/inicio/');
    await po.goto(`${APP}/area/administrativo/`, { waitUntil: 'load' });
    await po.getByRole('link', { name: 'Empresa e equipe' }).first().waitFor({ timeout: 15000 });
    checar('dono de outra empresa não vê o menu de licenças', (await po.getByRole('link', { name: 'Licenças da plataforma' }).count()) === 0);
    await po.goto(`${APP}/plataforma/`, { waitUntil: 'load' });
    checar('nem acessa a tela pelo endereço', await ve(po.getByText('Esta área é do administrador da plataforma ObraTop.')));

    console.log('\n2. Criar empresa com o código');
    const pi = await pagina(); await entrar(pi, intruso.email);
    await pi.getByRole('heading', { name: 'Bem-vindo ao ObraTop' }).waitFor({ timeout: 15000 });
    await pi.getByLabel('Nome da empresa').fill('Empresa Pirata');
    await pi.getByLabel('Código de licença').fill(codigo);
    await pi.getByRole('button', { name: 'Criar empresa' }).click();
    checar('código preso a outro e-mail é recusado', await ve(pi.getByText(/emitido para outro e-mail/)));
    checar('nenhuma empresa criada pelo intruso', (await adb.collection('organizations').where('ownerUid', '==', intruso.uid).get()).empty);

    const pc = await pagina(); await entrar(pc, cliente.email);
    await pc.getByRole('heading', { name: 'Bem-vindo ao ObraTop' }).waitFor({ timeout: 15000 });
    await pc.getByLabel('Nome da empresa').fill('Construtora Licenciada');
    await pc.getByLabel('Código de licença').fill(codigo.toLowerCase());
    await pc.getByRole('button', { name: 'Criar empresa' }).click();
    const nova = await ate(async () => { const x = await adb.collection('organizations').where('ownerUid', '==', cliente.uid).get(); return x.empty ? null : x.docs[0]; });
    const lic = (await adb.doc(`licencas/${codigo}`).get()).data();
    checar('empresa criada e código gasto nela', !!nova && nova.data().licenca === codigo && lic.usada === true && lic.orgId === nova.id && lic.usadaPor === cliente.uid);
    checar('cliente entra como proprietário da própria empresa', await ve(pc.getByText(/Construtora Licenciada/).first()));
    checar('o administrador vê o código como Usado', await ve(pa.getByRole('row').filter({ hasText: codigo }).getByText('Usada')));

    console.log('\n3. Link de licença e uso único');
    await pa.getByLabel('Cliente (empresa)').fill('Cliente do Link');
    await pa.getByRole('button', { name: 'Emitir código' }).click();
    await ate(async () => { const t = (await pa.locator('p.font-mono').innerText()).trim(); return t !== codigo ? t : null; });
    const codigo2 = (await pa.locator('p.font-mono').innerText()).trim();
    const pl = await pagina();
    await pl.goto(`${APP}/login/?licenca=${codigo2}`, { waitUntil: 'load' });
    await pl.getByLabel('Seu nome').fill('Pessoa do Link'); await pl.getByLabel('E-mail', { exact: true }).fill(`link-${S}@lic.test`); await pl.getByLabel('Senha').fill(SENHA);
    await pl.getByRole('button', { name: 'Criar conta', exact: true }).first().click();
    await pl.getByRole('heading', { name: 'Bem-vindo ao ObraTop' }).waitFor({ timeout: 15000 });
    checar('o código do link chega preenchido depois do cadastro', (await pl.getByLabel('Código de licença').inputValue()) === codigo2);
    await pl.getByLabel('Nome da empresa').fill('Empresa do Link');
    await pl.getByRole('button', { name: 'Criar empresa' }).click();
    checar('empresa do link criada', await ate(async () => (await adb.doc(`licencas/${codigo2}`).get()).data()?.usada === true));
    await pi.getByLabel('Código de licença').fill(codigo2);
    await pi.getByRole('button', { name: 'Criar empresa' }).click();
    checar('código já usado não serve de novo', await ve(pi.getByText('Código de licença inválido ou já utilizado.')));

    console.log('\n4. Revogar');
    await pa.getByLabel('Cliente (empresa)').fill('Vai ser revogado');
    await pa.getByRole('button', { name: 'Emitir código' }).click();
    await ate(async () => { const t = (await pa.locator('p.font-mono').innerText()).trim(); return t !== codigo2 ? t : null; });
    const codigo3 = (await pa.locator('p.font-mono').innerText()).trim();
    await pa.getByRole('button', { name: `Revogar código ${codigo3}` }).click();
    checar('código revogado deixa de existir', await ate(async () => !(await adb.doc(`licencas/${codigo3}`).get()).exists));
    checar('nenhum erro de JavaScript', erros.length === 0, JSON.stringify(erros));
  } catch (e) { falhas.push(`exceção: ${e.message.split('\n')[0]}`); console.error(e.message.split('\n').slice(0, 8).join('\n')); }
  await b.close();
  console.log(`\n${ok} verificações ok, ${falhas.length} falha(s)${falhas.length ? ':\n - ' + falhas.join('\n - ') : ''}`);
  process.exit(falhas.length ? 1 : 0);
})();
