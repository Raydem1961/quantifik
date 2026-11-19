/**
 * Recursos da auditoria de paridade com o ObraTop 3 e o Quantifik, de ponta a ponta
 * (emuladores auth/firestore/storage no ar e app compilado para os emuladores em :4173):
 * fotos do diário → relatório fotográfico → Portal do Cliente; diário → cronograma;
 * medição → financeiro; pedido → estoque; reposição; assistente de obra; lixeira; auditoria;
 * backup; funções Gestor, Financeiro e Consulta; análise econômica; planilha; termos (LGPD).
 */
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { chromium } = require('playwright');
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp({ projectId: 'demo-aec' });
const adb = getFirestore();
const T = `aud-${Date.now()}`, O = `organizations/${T}`, APP = 'http://localhost:4173', SENHA = 'senha-teste-123';
let ok = 0; const falhas = [];
const checar = (n, c, d = '') => { if (c) { ok++; console.log(`  ok   ${n}`); } else { falhas.push(n); console.log(`  FALHA ${n} ${d}`); } };
const ate = async (fn, ms = 25000) => { const fim = Date.now() + ms; let r; while (Date.now() < fim) { r = await fn(); if (r) return r; await new Promise((x) => setTimeout(x, 400)); } return r; };
const ve = (l, ms = 15000) => l.waitFor({ timeout: ms }).then(() => true, () => false);
const dia = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aud-'));
// Imagens PNG pequenas e válidas (o aplicativo converte para JPG no navegador).
const PNG = (cor) => Buffer.from({ r: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', g: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' }[cor], 'base64');
const arquivo = (nome, buf) => { const f = path.join(tmp, nome); fs.writeFileSync(f, buf); return f; };

(async () => {
  const suf = Date.now(), emailDono = `dono-${suf}@aud.test`, emailCli = `cli-${suf}@aud.test`;
  const dono = await getAuth().createUser({ email: emailDono, password: SENHA, displayName: 'Dona Auditoria' });
  await adb.doc(O).set({ name: 'Construtora Auditoria', ownerUid: dono.uid, aec: { responsavelTecnico: { nome: 'Eng. RT', conselho: 'CREA', registro: 'CREA-BA 9' } } });
  await adb.doc(`${O}/members/${dono.uid}`).set({ role: 'owner', status: 'active', email: emailDono, name: 'Dona Auditoria' });
  await adb.doc(`users/${dono.uid}`).set({ currentOrg: T });
  await adb.doc(`${O}/works/w1`).set({ name: 'Obra Fotos', client: 'Cliente Fotos', start: dia(-30), end: dia(90), value: 300000, status: 'Em andamento', deleted: false });
  await adb.doc(`${O}/activities/a1`).set({ workId: 'w1', wbs: '1', name: 'Alvenaria', start: dia(-20), end: dia(20), progress: 10, progressMode: 'Percentual', status: 'Em andamento', deleted: false });
  await adb.doc(`${O}/measurements/m1`).set({ workId: 'w1', date: dia(-3), number: '7', description: 'Alvenaria', physical: 10, value: 50000, retention: 5, deduction: 0, status: 'Aprovada', deleted: false });
  await adb.doc(`${O}/inventory/i1`).set({ workId: 'w1', material: 'Cimento', unit: 'sc', currentStock: 40, minStock: 60, maxStock: 300, unitValue: 38, leadTimeDays: 3, date: dia(-1), deleted: false });
  await adb.doc(`${O}/orders/o1`).set({ workId: 'w1', date: dia(-2), description: 'Cimento 100 sc', inventoryId: 'i1', qty: 100, value: 3800, status: 'Aprovado', deleted: false });
  await adb.doc(`${O}/staff/s1`).set({ name: 'Maria Salário', role: 'Engenheira', salary: 12345, status: 'Ativo', workId: 'w1', deleted: false });
  await adb.doc(`${O}/finance/f1`).set({ workId: 'w1', type: 'Despesa', description: 'Aço', category: 'Materiais', date: dia(-10), dueDate: dia(-5), paymentDate: dia(-5), value: 20000, status: 'Pago', deleted: false });

  const b = await chromium.launch(); const erros = [];
  const pagina = async () => { const c = await b.newContext({ viewport: { width: 1400, height: 950 }, acceptDownloads: true }); const p = await c.newPage(); p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => d.accept()); return p; };
  const entrar = async (p, email) => { await p.goto(`${APP}/login/`, { waitUntil: 'load' }); await p.getByLabel('E-mail').fill(email); await p.getByLabel('Senha').fill(SENHA); await p.getByRole('button', { name: 'Entrar', exact: true }).click(); await p.waitForURL('**/inicio/'); };
  const criarConta = async (p, nome, email) => {
    await p.goto(`${APP}/login/`, { waitUntil: 'load' }); await p.getByRole('button', { name: 'Criar conta' }).click();
    await p.getByLabel('Seu nome').fill(nome); await p.getByLabel('E-mail').fill(email); await p.getByLabel('Senha').fill(SENHA);
    await p.getByRole('button', { name: 'Criar conta', exact: true }).first().click();
  };
  try {
    const p = await pagina();
    await entrar(p, emailDono);

    console.log('\n1. Fotos do diário de obra');
    await p.goto(`${APP}/gestao/dailyLogs/`, { waitUntil: 'load' });
    await p.getByRole('button', { name: 'Novo' }).click();
    await p.getByLabel('Obra *').selectOption({ label: 'Obra Fotos' });
    await p.getByLabel('Atividade principal do dia (opcional)').selectOption({ label: '1 — Alvenaria' }).catch(async () => { await p.getByLabel('Atividade principal do dia (opcional)').selectOption({ index: 1 }); });
    await p.getByLabel('Avanço acumulado da atividade (%)').fill('35');
    await p.getByLabel('Serviços executados *').fill('Alvenaria do pavimento térreo');
    await p.getByLabel('Status *').selectOption('Assinado');
    await p.locator('input[type=file][multiple]').setInputFiles([arquivo('frente.png', PNG('r')), arquivo('interna.png', PNG('g'))]);
    checar('prévia das duas fotos no formulário', (await p.getByRole('img', { name: 'Foto do dia' }).count()) === 2);
    await p.getByLabel('Legenda da foto').nth(0).fill('Fachada com alvenaria concluída');
    await p.getByLabel('Serviço fotografado').nth(0).selectOption({ index: 1 });
    await p.getByLabel('Legenda da foto').nth(1).fill('Detalhe interno da equipe');
    await p.getByLabel('Uso interno (não mostrar ao cliente)').nth(1).check();
    await p.getByRole('button', { name: 'Salvar' }).click();
    const log = await ate(async () => { const s = await adb.collection(`${O}/dailyLogs`).get(); return s.empty ? null : { id: s.docs[0].id, ...s.docs[0].data() }; });
    const fotos = log?.photos ?? [];
    checar('diário salvo com 2 fotos enviadas ao armazenamento (foto + miniatura)', fotos.length === 2 && fotos.every((f) => /^http:\/\/127\.0\.0\.1:9199\//.test(f.url) && f.thumb && f.path?.startsWith(`${O}/diario/w1/`)), JSON.stringify(fotos).slice(0, 300));
    checar('legenda, serviço e foto interna gravados', fotos[0]?.legenda === 'Fachada com alvenaria concluída' && fotos[0]?.activityId === 'a1' && fotos[1]?.privada === true && fotos[0]?.privada === false);
    const img = fotos[0] ? await fetch(fotos[0].url) : null;
    checar('a foto é um JPG reduzido no aparelho', img?.ok && (img.headers.get('content-type') ?? '').includes('image/jpeg'), img?.status);
    await p.getByRole('tab', { name: 'Relatório fotográfico' }).click();
    checar('relatório fotográfico mostra o dia com as fotos', await ve(p.getByRole('button', { name: /Ampliar foto: Fachada com alvenaria/ })) && (await p.getByRole('button', { name: /Ampliar foto/ }).count()) === 2);
    await p.getByRole('button', { name: /Ampliar foto: Fachada/ }).click();
    checar('visualizador em tela cheia abre e navega', await ve(p.getByRole('dialog', { name: 'Foto 1 de 2' })));
    await p.keyboard.press('ArrowRight');
    checar('setas passam para a próxima foto', await ve(p.getByRole('dialog', { name: 'Foto 2 de 2' }), 5000));
    await p.keyboard.press('Escape');

    console.log('\n2. Diário → cronograma');
    await p.getByRole('tab', { name: 'Registros' }).click();
    await p.getByRole('button', { name: /Aplicar ao cronograma o avanço/ }).click();
    checar('avanço do diário aplicado à atividade', await ate(async () => (await adb.doc(`${O}/activities/a1`).get()).data().progress === 35) && !!(await adb.doc(`${O}/dailyLogs/${log.id}`).get()).data().appliedAt);

    console.log('\n3. Relatório fotográfico no Portal do Cliente');
    await p.goto(`${APP}/clientes/`, { waitUntil: 'load' });
    await p.getByLabel(/E-mail\(s\) do cliente de Obra Fotos/).fill(emailCli);
    await p.getByRole('button', { name: 'Liberar portal' }).click();
    const mes = dia(0).slice(0, 7);
    const doc = await ate(async () => (await adb.doc(`portalCliente/${T}_w1/fotos/${mes}`).get()).data());
    checar('mês do relatório publicado só com a foto liberada ao cliente', doc?.dias?.[0]?.fotos?.length === 1 && doc.dias[0].fotos[0].legenda === 'Fachada com alvenaria concluída' && doc.dias[0].fotos[0].servico === '1 Alvenaria', JSON.stringify(doc?.dias));
    const c = await pagina();
    await criarConta(c, 'Cliente Fotos', emailCli);
    await ve(c.getByText('É cliente de uma construtora?'));
    await getAuth().updateUser((await getAuth().getUserByEmail(emailCli)).uid, { emailVerified: true });
    await c.getByRole('button', { name: 'Já confirmei' }).click();
    await c.getByRole('heading', { name: 'Obra Fotos', level: 1 }).waitFor({ timeout: 20000 });
    checar('cliente vê o relatório fotográfico com a foto do dia', await ve(c.getByRole('heading', { name: 'Relatório fotográfico' })) && await ve(c.getByRole('button', { name: /Ampliar foto: Fachada com alvenaria/ })));
    checar('a foto de uso interno não chega ao cliente', (await c.getByText('Detalhe interno da equipe').count()) === 0);

    console.log('\n4. Medição → financeiro; pedido → estoque; reposição');
    await p.goto(`${APP}/gestao/measurements/`, { waitUntil: 'load' });
    await p.getByRole('button', { name: /Lançar no financeiro: 7/ }).click();
    await p.waitForURL('**/gestao/finance/');
    checar('lançamento chega pré-preenchido com o valor líquido', await ve(p.getByText('Confira o lançamento pré-preenchido')) && (await p.getByLabel('Valor').inputValue()) === '47500');
    await p.getByRole('button', { name: 'Salvar' }).click();
    checar('receita gravada ligada à medição', await ate(async () => { const s = await adb.collection(`${O}/finance`).where('measurementId', '==', 'm1').get(); return !s.empty && s.docs[0].data().type === 'Receita'; }));
    await p.goto(`${APP}/gestao/orders/`, { waitUntil: 'load' });
    await p.getByRole('button', { name: /Dar entrada no estoque: Cimento 100 sc/ }).click();
    checar('entrada no estoque soma a quantidade e entrega o pedido', await ate(async () => (await adb.doc(`${O}/inventory/i1`).get()).data().currentStock === 140 && (await adb.doc(`${O}/orders/o1`).get()).data().status === 'Entregue'));
    await adb.doc(`${O}/inventory/i1`).update({ currentStock: 20 });
    await p.goto(`${APP}/gestao/inventory/`, { waitUntil: 'load' });
    checar('semáforo do estoque marca CRÍTICO', await ve(p.getByText('CRÍTICO', { exact: true })));
    await p.getByRole('button', { name: /Pedir reposição: Cimento/ }).click();
    await p.waitForURL('**/gestao/orders/');
    checar('pedido de reposição pré-preenchido até o estoque máximo', await ve(p.getByText('Pedido de reposição calculado')) && /Ressuprimento — Cimento: 280/.test(await p.getByLabel('Itens ou descrição *').inputValue()));
    await p.getByRole('button', { name: 'Cancelar' }).click();

    console.log('\n5. Assistente de nova obra (modelos do ObraTop 3)');
    await p.goto(`${APP}/gestao/works/`, { waitUntil: 'load' });
    await p.getByRole('button', { name: 'Nova obra por modelo' }).click();
    await p.getByLabel('Nome da obra *').fill('Escola Modelo');
    await p.getByLabel('Cliente *').fill('Prefeitura Modelo');
    checar('prévia do modelo: atividades e orçamento de referência', await ve(p.getByText(/atividades · orçamento de referência/)));
    await p.getByRole('button', { name: 'Criar obra' }).click();
    await p.getByText(/Obra criada com \d+ atividades/).waitFor({ timeout: 30000 });
    const wModelo = await ate(async () => { const s = await adb.collection(`${O}/works`).where('name', '==', 'Escola Modelo').get(); return s.empty ? null : s.docs[0]; });
    const nAtv = wModelo ? (await adb.collection(`${O}/activities`).where('workId', '==', wModelo.id).get()).size : 0;
    const nOrc = wModelo ? (await adb.collection(`${O}/budgets`).where('workId', '==', wModelo.id).get()).size : 0;
    checar('obra criada com cronograma, orçamento e linha de base', nAtv >= 10 && nAtv === nOrc && wModelo.data().baseline?.revision === 1 && wModelo.data().templateFamily === 'BUILD', `${nAtv}/${nOrc}`);

    console.log('\n6. Lixeira, auditoria e planilha');
    await p.getByRole('button', { name: 'Excluir Escola Modelo' }).click();
    await ate(async () => (await wModelo.ref.get()).data().deleted === true);
    await p.goto(`${APP}/admin/seguranca/`, { waitUntil: 'load' });
    checar('registro excluído aparece na lixeira', await ve(p.getByRole('row', { name: /Escola Modelo/ })));
    await p.getByRole('button', { name: 'Restaurar Escola Modelo' }).click();
    checar('restaurar devolve o registro', await ate(async () => (await wModelo.ref.get()).data().deleted === false));
    await p.getByRole('tab', { name: 'Auditoria' }).click();
    checar('auditoria registra quem fez o quê (criação, exclusão, restauração, diário, estoque)', await ve(p.getByRole('cell', { name: 'Restaurou' }).first()) && (await p.getByRole('cell', { name: 'Deu entrada no estoque' }).count()) >= 1 && (await p.getByRole('cell', { name: 'Aplicou diário ao cronograma' }).count()) >= 1);
    await p.goto(`${APP}/gestao/staff/`, { waitUntil: 'load' });
    const [csv] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Planilha' }).click()]);
    const texto = fs.readFileSync(await csv.path(), 'utf8');
    checar('planilha do cadastro (CSV para Excel) com todas as colunas', /^﻿"Nome";"Função";"CPF"/.test(texto) && texto.includes('"Maria Salário"'), texto.slice(0, 120));

    console.log('\n7. Backup e restauração');
    await p.goto(`${APP}/admin/backup/`, { waitUntil: 'load' });
    const [bk] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Baixar backup completo' }).click()]);
    const caminhoBk = await bk.path(), conteudo = JSON.parse(fs.readFileSync(caminhoBk, 'utf8'));
    checar('backup com SHA-256 e todas as coleções', conteudo.formato === 'obratop4-backup' && /^[0-9a-f]{64}$/.test(conteudo.sha256) && Object.keys(conteudo.colecoes.works).length === 2 && !!conteudo.colecoes.dailyLogs[log.id]);
    await adb.doc(`${O}/staff/s1`).update({ name: 'NOME ALTERADO DEPOIS DO BACKUP' });
    const adulterado = arquivo('adulterado.json', JSON.stringify({ ...conteudo, empresa: 'outra' }));
    await p.locator('input[type=file]').setInputFiles(adulterado);
    checar('arquivo adulterado é recusado pela conferência SHA-256', await ve(p.getByRole('alert').filter({ hasText: 'SHA-256 não bate' })));
    await p.locator('input[type=file]').setInputFiles(arquivo('bom.json', fs.readFileSync(caminhoBk)));
    checar('prévia mostra o que vai mudar', await ve(p.getByRole('button', { name: 'Restaurar 1 registro(s)' })));
    await p.getByRole('button', { name: 'Restaurar 1 registro(s)' }).click();
    checar('restauração devolve o registro à versão do backup', await ate(async () => (await adb.doc(`${O}/staff/s1`).get()).data().name === 'Maria Salário'));

    console.log('\n8. Funções do ObraTop 3: Gestor, Financeiro e Consulta');
    const funcoes = {};
    for (const [funcao, rotulo] of [['manager', 'Gestor (todas as obras)'], ['finance', 'Financeiro (todas as obras)'], ['viewer', 'Consulta (somente leitura)']]) {
      await p.goto(`${APP}/admin/`, { waitUntil: 'load' });
      const email = `${funcao}-${suf}@aud.test`;
      await p.getByLabel('E-mail', { exact: true }).fill(email);
      await p.getByLabel('Função').selectOption({ label: rotulo });
      await p.getByRole('button', { name: 'Gerar convite' }).click();
      const link = await p.locator('code').filter({ hasText: 'convite=' }).innerText({ timeout: 15000 });
      const q = await pagina();
      await q.goto(link.replace(/^https?:\/\/[^/]+/, APP), { waitUntil: 'load' });
      await q.waitForURL('**/login/');
      await q.getByLabel('Seu nome').fill(`Pessoa ${funcao}`); await q.getByLabel('E-mail').fill(email); await q.getByLabel('Senha').fill(SENHA);
      await q.getByRole('button', { name: 'Criar conta', exact: true }).first().click();
      await q.getByLabel('Código do convite').waitFor({ timeout: 15000 });
      await q.getByRole('button', { name: 'Entrar na empresa' }).click();
      await q.waitForURL('**/inicio/', { timeout: 20000 }).catch(() => undefined);
      const uid = (await getAuth().getUserByEmail(email)).uid;
      funcoes[funcao] = { q, uid, m: await ate(async () => (await adb.doc(`${O}/members/${uid}`).get()).data()) };
    }
    checar('convites com função: cada pessoa entra com a sua, sem obra atribuída', ['manager', 'finance', 'viewer'].every((f) => funcoes[f].m?.role === f && funcoes[f].m?.workId === ''), JSON.stringify(Object.fromEntries(Object.entries(funcoes).map(([k, v]) => [k, v.m]))));
    const g = funcoes.manager.q;
    await g.goto(`${APP}/gestao/activities/`, { waitUntil: 'load' });
    checar('Gestor: vê todas as obras e cria, mas não exclui', await ve(g.getByRole('combobox', { name: 'Filtrar por obra' })) && (await g.getByRole('button', { name: 'Novo' }).count()) === 1 && (await g.getByRole('button', { name: /^Excluir/ }).count()) === 0);
    await g.goto(`${APP}/gestao/staff/`, { waitUntil: 'load' });
    await g.getByText('Maria Salário').first().waitFor({ timeout: 15000 });
    checar('Gestor não vê salários', (await g.getByText('12.345').count()) === 0 && (await g.getByRole('columnheader', { name: 'Salário' }).count()) === 0);
    const fz = funcoes.finance.q;
    await fz.goto(`${APP}/gestao/finance/`, { waitUntil: 'load' });
    const novoFin = await ve(fz.getByRole('button', { name: 'Novo' }));
    await fz.goto(`${APP}/gestao/activities/`, { waitUntil: 'load' });
    await fz.getByRole('heading', { name: 'Cronograma', level: 1 }).waitFor({ timeout: 15000 });
    checar('Financeiro: lança no financeiro, não mexe no cronograma', novoFin && (await fz.getByRole('button', { name: 'Novo' }).count()) === 0);
    const v = funcoes.viewer.q;
    await v.goto(`${APP}/gestao/finance/`, { waitUntil: 'load' });
    await v.getByText('Aço').first().waitFor({ timeout: 15000 });
    checar('Consulta: lê e não tem botões de gravar', (await v.getByRole('button', { name: 'Novo' }).count()) === 0 && (await v.getByRole('button', { name: /^Editar/ }).count()) === 0);
    await p.goto(`${APP}/admin/`, { waitUntil: 'load' });
    await p.getByRole('button', { name: 'Bloquear Pessoa viewer' }).click();
    checar('bloquear tira o acesso na hora', await ve(v.getByRole('heading', { name: 'Bem-vindo ao ObraTop' }), 20000));

    console.log('\n9. Análise econômica e termos');
    await p.goto(`${APP}/economia/`, { waitUntil: 'load' });
    await p.getByRole('combobox', { name: 'Obra' }).selectOption({ label: 'Obra Fotos' });
    checar('análise econômica com margem, Curva ABC e fluxo', await ve(p.getByText('Margem estimada', { exact: true })) && await ve(p.getByText('Composição de custos — Curva ABC')) && await ve(p.getByText('Materiais').first()));
    await p.getByLabel('Custo restante estimado (R$)').fill('150000');
    await p.getByLabel('Data da estimativa').fill(dia(0));
    await p.getByLabel('Premissas do custo restante').fill('Orçamento revisado');
    await p.getByRole('button', { name: 'Salvar parâmetros' }).click();
    checar('parâmetros gravados na obra (mesmo campo do ObraTop 3)', await ate(async () => (await adb.doc(`${O}/works/w1`).get()).data().economics?.remainingCost === 150000));
    await p.goto(`${APP}/legal/`, { waitUntil: 'load' });
    checar('termos de uso e política de privacidade (LGPD) publicados', await ve(p.getByRole('heading', { name: 'Termos de uso e política de privacidade' })) && await ve(p.getByRole('heading', { name: /Política de privacidade \(Lei 13\.709/ })));
    checar('nenhum erro de JavaScript', erros.length === 0, JSON.stringify(erros));
  } catch (e) { falhas.push(`exceção: ${e.message.split('\n')[0]}`); console.error(e.message.split('\n').slice(0, 8).join('\n')); }
  await b.close(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${ok} verificações ok, ${falhas.length} falha(s)${falhas.length ? ':\n - ' + falhas.join('\n - ') : ''}`);
  process.exit(falhas.length ? 1 : 0);
})();
