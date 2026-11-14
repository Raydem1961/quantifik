/**
 * Lançamento sem internet: o registro fica na fila local e sobe quando a conexão volta.
 * Mesmos pré-requisitos do ui.e2e.cjs (emuladores no ar e app servido em :4173).
 */
const { chromium } = require('playwright');
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp({ projectId: 'demo-aec' });
const adb = getFirestore();
const T = 'offline-co';
let ok = 0; const falhas = [];
const checar = (n, c, d = '') => { if (c) { ok++; console.log(`  ok   ${n}`); } else { falhas.push(n); console.log(`  FALHA ${n} ${d}`); } };
const ate = async (fn, ms = 25000) => { const fim = Date.now() + ms; let r; while (Date.now() < fim) { r = await fn(); if (r) return r; await new Promise((x) => setTimeout(x, 400)); } return r; };
const obras = async () => (await adb.collection(`tenants/${T}/works`).get()).docs.map((d) => d.data().name);

(async () => {
  const email = `offline-${Date.now()}@teste.test`;
  const u = await getAuth().createUser({ email, password: 'senha-teste-123' });
  await getAuth().setCustomUserClaims(u.uid, { tenantId: T, role: 'socio_diretor' });
  await adb.doc(`tenants/${T}`).set({ nomeFantasia: 'Offline Co', razaoSocial: 'Offline Co', cnpj: '', uf: 'BA', custoHoraTecnica: 100, branding: { corPrimaria: '#3b4cca', corSecundaria: '#111827' }, responsavelTecnico: { nome: 'RT', conselho: 'CREA', registro: 'X' } });
  for (const d of (await adb.collection(`tenants/${T}/works`).get()).docs) await d.ref.delete();
  await adb.doc(`tenants/${T}/works/w0`).set({ tenantId: T, name: 'Obra já existente', client: 'C', start: '2026-01-01', end: '2026-12-31', status: 'Em andamento', deleted: false });
  const b = await chromium.launch();
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  try {
    await p.goto('http://localhost:4173/login/', { waitUntil: 'load' });
    await p.getByLabel('E-mail').fill(email); await p.getByLabel('Senha').fill('senha-teste-123');
    await p.getByRole('button', { name: 'Entrar', exact: true }).click();
    await p.waitForURL('**/dashboard/');
    await p.goto('http://localhost:4173/gestao/', { waitUntil: 'load' });
    await p.getByText('Obra já existente').first().waitFor({ timeout: 20000 });
    await p.evaluate(() => navigator.serviceWorker.ready); await p.waitForTimeout(4000);

    await ctx.setOffline(true);
    await p.reload({ waitUntil: 'load' });
    checar('sem internet: a tela abre e mostra os dados já carregados', await p.getByText('Obra já existente').first().waitFor({ timeout: 20000 }).then(() => true, () => false));
    await p.getByRole('button', { name: 'Novo' }).click();
    await p.getByLabel('Nome da obra *').fill('Obra lançada offline');
    await p.getByLabel('Cliente *').fill('Cliente');
    await p.getByLabel('Início *').fill('2026-02-02'); await p.getByLabel('Término previsto *').fill('2026-09-30');
    await p.getByRole('button', { name: 'Salvar' }).click();
    const apareceu = await p.locator('tbody tr', { hasText: 'Obra lançada offline' }).waitFor({ timeout: 10000 }).then(() => true, () => false);
    checar('sem internet: o formulário fecha (não fica preso em "Salvando…")', (await p.getByRole('button', { name: 'Salvar' }).count()) === 0);
    checar('sem internet: o registro aparece na tela na hora', apareceu);
    checar('sem internet: nada chegou ao servidor ainda', !(await obras()).includes('Obra lançada offline'));
    await ctx.setOffline(false);
    checar('conexão de volta: o registro sobe sozinho', await ate(async () => (await obras()).includes('Obra lançada offline')));
  } catch (e) { falhas.push(`exceção: ${e.message.split('\n')[0]}`); }
  await b.close();
  console.log(`\n${ok} verificações ok, ${falhas.length} falha(s)${falhas.length ? ':\n - ' + falhas.join('\n - ') : ''}`);
  process.exit(falhas.length ? 1 : 0);
})();
