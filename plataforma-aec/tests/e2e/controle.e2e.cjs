/**
 * Menus do ObraTop 3 que entraram no 4.1, de ponta a ponta (emuladores auth/firestore/storage no
 * ar e app compilado para os emuladores em :4173): Alertas, Curvas S e ABC, Relatórios (Excel/CSV),
 * Super Planilha (exportar e importar), Manual e Implantação, Integridade e manutenção
 * (duplicados → lixeira, renumeração da EAP), ações em lote e Direitos Autorais.
 */
const fs = require('node:fs'); const path = require('node:path');
const { chromium } = require('playwright');
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp({ projectId: 'demo-aec' });
const adb = getFirestore();
const T = `ctl-${Date.now()}`, O = `organizations/${T}`, APP = 'http://localhost:4173', SENHA = 'senha-teste-123';
let ok = 0; const falhas = [];
const checar = (n, c, d = '') => { if (c) { ok++; console.log(`  ok   ${n}`); } else { falhas.push(n); console.log(`  FALHA ${n} ${d}`); } };
const ate = async (fn, ms = 25000) => { const fim = Date.now() + ms; let r; while (Date.now() < fim) { r = await fn(); if (r) return r; await new Promise((x) => setTimeout(x, 400)); } return r; };
const ve = (l, ms = 15000) => l.waitFor({ timeout: ms }).then(() => true, () => false);
const dia = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const vivos = async (col) => (await adb.collection(`${O}/${col}`).get()).docs.map((x) => ({ id: x.id, ...x.data() })).filter((x) => !x.deleted);

(async () => {
  const emailDono = `dono-${Date.now()}@ctl.test`;
  const dono = await getAuth().createUser({ email: emailDono, password: SENHA, displayName: 'Dono Controle' });
  await adb.doc(O).set({ name: 'Construtora Controle', ownerUid: dono.uid });
  await adb.doc(`${O}/members/${dono.uid}`).set({ role: 'owner', status: 'active', email: emailDono, name: 'Dono Controle' });
  await adb.doc(`users/${dono.uid}`).set({ currentOrg: T });
  await adb.doc(`${O}/works/w1`).set({ name: 'Obra Controle', client: 'Cliente X', start: dia(-60), end: dia(120), value: 500000, status: 'Em andamento', deleted: false });
  // EAP começando em 3 (fora de sequência) e atividade atrasada.
  await adb.doc(`${O}/activities/a1`).set({ workId: 'w1', wbs: '3', name: 'Fundações', start: dia(-50), end: dia(-5), progress: 40, progressMode: 'Percentual', status: 'Em andamento', deleted: false });
  await adb.doc(`${O}/activities/a2`).set({ workId: 'w1', wbs: '3.1', name: 'Estacas', start: dia(-50), end: dia(-20), progress: 100, predecessors: '3', progressMode: 'Percentual', status: 'Concluída', deleted: false });
  await adb.doc(`${O}/finance/f1`).set({ workId: 'w1', type: 'Receita', description: 'Parcela 1', category: 'Medição', date: dia(-20), dueDate: dia(-3), value: 80000, status: 'Previsto', deleted: false });
  await adb.doc(`${O}/finance/f2`).set({ workId: 'w1', type: 'Despesa', description: 'Aço CA-50', category: 'Materiais', date: dia(-15), dueDate: dia(10), value: 30000, status: 'Aberto', deleted: false });
  await adb.doc(`${O}/finance/f3`).set({ workId: 'w1', type: 'Despesa', description: 'Concreto usinado', category: 'Materiais', date: dia(-12), dueDate: dia(12), value: 45000, status: 'Aberto', deleted: false });
  await adb.doc(`${O}/inventory/i1`).set({ workId: 'w1', material: 'Cimento', unit: 'sc', currentStock: 10, minStock: 60, maxStock: 300, unitValue: 38, deleted: false });
  await adb.doc(`${O}/suppliers/s1`).set({ name: 'Concreteira Boa', cnpj: '11.222.333/0001-81', status: 'Ativo', phone: '7133334444', deleted: false, createdAt: '2026-01-01' });
  await adb.doc(`${O}/suppliers/s2`).set({ name: 'Concreteira Boa', cnpj: '11.222.333/0001-81', status: 'Ativo', deleted: false, createdAt: '2026-02-01' });
  await adb.doc(`${O}/quality/q1`).set({ workId: 'w-fantasma', date: dia(-2), issue: 'NC órfã', severity: 'Média', status: 'Aberta', deleted: false });

  const b = await chromium.launch(); const erros = [];
  const c = await b.newContext({ viewport: { width: 1400, height: 950 }, acceptDownloads: true }); const p = await c.newPage();
  p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => d.accept());
  const baixa = async (fn) => { const [d] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), fn()]); const f = await d.path(); return { nome: d.suggestedFilename(), buf: fs.readFileSync(f) }; };
  try {
    await p.goto(`${APP}/login/`, { waitUntil: 'load' }); await p.getByLabel('E-mail').fill(emailDono); await p.getByLabel('Senha').fill(SENHA);
    await p.getByRole('button', { name: 'Entrar', exact: true }).click(); await p.waitForURL('**/inicio/');

    console.log('\n1. Menu e Alertas');
    checar('área "Controle e Relatórios" no menu principal', await ve(p.getByRole('link', { name: /Controle e Relatórios/ }).first()));
    await p.getByRole('link', { name: 'Ver todos os alertas' }).click(); await p.waitForURL('**/alertas/');
    checar('alertas: atividade atrasada, recebimento vencido e estoque crítico', await ve(p.getByText('Atividade atrasada').first()) && await ve(p.getByText('Recebimento vencido').first()) && await ve(p.getByText(/Estoque/).first()));

    console.log('\n2. Curvas S e ABC');
    await p.goto(`${APP}/curvas/`, { waitUntil: 'load' });
    checar('curvas S e ABC exibidas', await ve(p.getByText(/Curva S/).first()) && await ve(p.getByText(/ABC/).first()));

    console.log('\n3. Relatórios e Super Planilha');
    await p.goto(`${APP}/relatorios/`, { waitUntil: 'load' });
    await p.getByRole('button', { name: /^Financeiro/ }).click();
    await p.getByText('Concreto usinado').first().waitFor({ timeout: 15000 });
    const x = await baixa(() => p.getByRole('button', { name: 'Excel' }).click());
    checar('relatório financeiro em Excel (.xlsx válido)', x.nome.endsWith('.xlsx') && x.buf.slice(0, 2).toString() === 'PK');
    const csv = await baixa(() => p.getByRole('button', { name: 'CSV' }).click());
    checar('relatório em CSV com os lançamentos', csv.buf.toString('utf8').includes('Concreto usinado'));
    const tudo = await baixa(() => p.getByRole('button', { name: 'Exportar todos os dados' }).click());
    checar('Super Planilha exportada com todas as abas', tudo.buf.slice(0, 2).toString() === 'PK' && tudo.nome.includes('Super_Planilha'));
    const obrasAntes = (await vivos('works')).length;
    await p.locator('input[type=file][accept=".xlsx"]').setInputFiles(path.join(__dirname, '../../public/ObraTop_Super_Planilha_Base.xlsx'));
    checar('conferência antes de gravar', await ve(p.getByText(/conferência antes de gravar/)));
    await p.getByRole('button', { name: /^Incluir \d+ registro/ }).click();
    checar('importação concluída', await ve(p.getByText(/Importação concluída/), 40000));
    const importadas = (await vivos('works')).filter((w) => w.imported === true);
    checar('obras da planilha gravadas (marcadas como importadas)', importadas.length > 0 && (await vivos('works')).length > obrasAntes);
    const atvImport = (await vivos('activities')).filter((a) => a.imported === true);
    checar('cronograma da planilha ligado às obras importadas', atvImport.length > 0 && atvImport.every((a) => importadas.some((w) => w.id === a.workId)));

    console.log('\n4. Manual e Implantação');
    await p.goto(`${APP}/implantacao/`, { waitUntil: 'load' });
    await p.getByRole('combobox', { name: 'Obra' }).selectOption({ label: 'Obra Controle' }).catch(() => {});
    await p.getByRole('button', { name: /Marcar etapa 02/ }).click();
    checar('etapa gravada em works.implantation (formato do ObraTop 3)', await ate(async () => { const i = (await adb.doc(`${O}/works/w1`).get()).data().implantation; return i?.manualVersion && i.items?.['02']?.done === true && i.items['02'].byEmail === emailDono; }));
    checar('progresso da implantação na tela', await ve(p.getByText(/1 de 15 etapas/)));

    console.log('\n5. Integridade e manutenção');
    await p.goto(`${APP}/admin/integridade/`, { waitUntil: 'load' });
    checar('aviso de backup e contagem por cadastro', await ve(p.getByText('Nenhum backup registrado.', { exact: false })) && await ve(p.getByText('Registros por cadastro')));
    checar('registro sem obra válida apontado', await ve(p.getByText('NC órfã')));
    await p.getByRole('button', { name: 'Mover para a Lixeira' }).click();
    checar('duplicado movido para a lixeira (fica o mais completo)', await ate(async () => { const s1 = (await adb.doc(`${O}/suppliers/s1`).get()).data(), s2 = (await adb.doc(`${O}/suppliers/s2`).get()).data(); return !s1.deleted && s2.deleted === true && s2.duplicateOf === 's1'; }));
    await p.getByRole('listitem').filter({ hasText: 'Obra Controle' }).getByRole('button', { name: 'Renumerar' }).click();
    checar('EAP renumerada com predecessoras', await ate(async () => { const a1 = (await adb.doc(`${O}/activities/a1`).get()).data(), a2 = (await adb.doc(`${O}/activities/a2`).get()).data(); return a1.wbs === '1' && a2.wbs === '1.1' && a2.predecessors === '1'; }));
    checar('ações registradas na auditoria', await ate(async () => { const a = (await adb.collection(`${O}/audits`).get()).docs.map((d) => d.data().action); return a.includes('dedupe') && a.includes('eap-renumber') && a.includes('import-create'); }));

    console.log('\n6. Ações em lote');
    await p.goto(`${APP}/gestao/finance/`, { waitUntil: 'load' });
    await p.getByRole('combobox', { name: 'Obra' }).first().selectOption({ label: 'Obra Controle' }).catch(() => {});
    await p.getByRole('checkbox', { name: /Selecionar Aço CA-50/ }).check();
    await p.getByRole('checkbox', { name: /Selecionar Concreto usinado/ }).check();
    checar('barra de ações em lote', await ve(p.getByText('2 selecionado(s)')));
    await p.getByRole('combobox', { name: 'Nova situação' }).selectOption('Pago');
    await p.getByRole('button', { name: 'Aplicar' }).click();
    checar('situação alterada em lote', await ate(async () => (await adb.doc(`${O}/finance/f2`).get()).data().status === 'Pago' && (await adb.doc(`${O}/finance/f3`).get()).data().status === 'Pago'));
    await p.getByRole('checkbox', { name: /Selecionar Aço CA-50/ }).check();
    await p.getByRole('button', { name: 'Excluir selecionados' }).click();
    checar('exclusão em lote vai para a lixeira', await ate(async () => (await adb.doc(`${O}/finance/f2`).get()).data().deleted === true));

    console.log('\n7. Direitos autorais');
    await p.goto(`${APP}/legal/#autorais`, { waitUntil: 'load' });
    checar('direitos autorais (Lei 9.609/1998) publicados', await ve(p.getByRole('heading', { name: /Direitos autorais e licença de uso/ })) && await ve(p.getByText(/Raydem Rabello Santana/).first()));
    checar('nenhum erro de JavaScript', erros.length === 0, JSON.stringify(erros));
  } catch (e) { falhas.push(`exceção: ${e.message.split('\n')[0]}`); console.error(e.message.split('\n').slice(0, 8).join('\n')); }
  await b.close();
  console.log(`\n${ok} verificações ok, ${falhas.length} falha(s)${falhas.length ? ':\n - ' + falhas.join('\n - ') : ''}`);
  process.exit(falhas.length ? 1 : 0);
})();
