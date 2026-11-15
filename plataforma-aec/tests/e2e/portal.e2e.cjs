/**
 * Portal do Cliente de ponta a ponta (emuladores no ar e app servido em :4173, como no ui.e2e.cjs):
 * o proprietário libera o painel; o cliente cria conta, confirma o e-mail e vê só o próprio contrato;
 * o painel acompanha os lançamentos; encerrar o acesso tira o cliente na hora.
 */
const { chromium } = require('playwright');
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp({ projectId: 'demo-aec' });
const adb = getFirestore();
const T = `portal-${Date.now()}`, O = `organizations/${T}`, APP = 'http://localhost:4173', SENHA = 'senha-teste-123';
let ok = 0; const falhas = [];
const checar = (n, c, d = '') => { if (c) { ok++; console.log(`  ok   ${n}`); } else { falhas.push(n); console.log(`  FALHA ${n} ${d}`); } };
const ate = async (fn, ms = 25000) => { const fim = Date.now() + ms; let r; while (Date.now() < fim) { r = await fn(); if (r) return r; await new Promise((x) => setTimeout(x, 400)); } return r; };
const dia = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const ve = (l, ms = 15000) => l.waitFor({ timeout: ms }).then(() => true, () => false);

(async () => {
  const sufixo = Date.now(), emailDono = `dono-${sufixo}@portal.test`, emailCli = `cliente-${sufixo}@portal.test`;
  const dono = await getAuth().createUser({ email: emailDono, password: SENHA, displayName: 'Dona' });
  await adb.doc(O).set({ name: 'Construtora Portal', ownerUid: dono.uid, aec: { responsavelTecnico: { nome: 'Eng. RT', conselho: 'CREA', registro: 'CREA-BA 1' } } });
  await adb.doc(`${O}/members/${dono.uid}`).set({ role: 'owner', status: 'active', email: emailDono });
  await adb.doc(`users/${dono.uid}`).set({ currentOrg: T });
  await adb.doc(`${O}/works/w1`).set({ name: 'Casa do Cliente', client: 'Cliente Portal', address: 'Salvador/BA', start: dia(-60), end: dia(120), value: 500000, status: 'Em andamento', deleted: false });
  await adb.doc(`${O}/works/w2`).set({ name: 'OBRA SECRETA DE OUTRO CLIENTE', client: 'Outro', start: dia(-10), end: dia(200), value: 9000000, status: 'Em andamento', deleted: false });
  await adb.doc(`${O}/activities/a1`).set({ workId: 'w1', wbs: '1', name: 'Fundações', start: dia(-60), end: dia(-20), progress: 100, progressMode: 'Percentual', deleted: false });
  await adb.doc(`${O}/activities/a2`).set({ workId: 'w1', wbs: '2', name: 'Estrutura', start: dia(-19), end: dia(60), progress: 20, progressMode: 'Percentual', deleted: false });
  await adb.doc(`${O}/contracts/k1`).set({ workId: 'w1', number: 'CT-77', party: 'Cliente Portal', object: 'Construção', value: 500000, addendum: 20000, addendumNote: 'Piscina', status: 'Ativo', deleted: false });
  await adb.doc(`${O}/measurements/m1`).set({ workId: 'w1', date: dia(-25), number: '1', description: 'Fundações', physical: 22, value: 110000, retention: 5, contractId: 'k1', status: 'Paga', deleted: false });
  await adb.doc(`${O}/finance/r1`).set({ workId: 'w1', type: 'Receita', description: 'Parcela 1', date: dia(-25), dueDate: dia(-20), paymentDate: dia(-21), value: 104500, status: 'Recebido', category: 'Medição', deleted: false });
  await adb.doc(`${O}/finance/r2`).set({ workId: 'w1', type: 'Receita', description: 'Parcela 2', date: dia(-2), dueDate: dia(-1), value: 50000, status: 'Pendente', category: 'Medição', deleted: false });
  await adb.doc(`${O}/finance/c1`).set({ workId: 'w1', type: 'Despesa', description: 'CUSTO INTERNO CONFIDENCIAL', date: dia(-5), dueDate: dia(5), value: 77777, status: 'Pendente', category: 'Materiais', deleted: false });
  const b = await chromium.launch(); const erros = [];
  const pagina = async () => { const c = await b.newContext({ viewport: { width: 1360, height: 900 } }); const p = await c.newPage(); p.on('pageerror', (e) => erros.push(e.message)); return p; };
  const entrar = async (p, email) => { await p.goto(`${APP}/login/`, { waitUntil: 'load' }); await p.getByLabel('E-mail').fill(email); await p.getByLabel('Senha').fill(SENHA); await p.getByRole('button', { name: 'Entrar', exact: true }).click(); };
  try {
    console.log('\n1. Proprietário libera o portal');
    const p = await pagina();
    await entrar(p, emailDono); await p.waitForURL('**/inicio/');
    checar('área Clientes no menu principal', (await p.getByRole('link', { name: 'Clientes', exact: true }).count()) > 0);
    await p.goto(`${APP}/clientes/`, { waitUntil: 'load' });
    await p.getByRole('heading', { name: 'Casa do Cliente' }).waitFor({ timeout: 15000 });
    await p.getByRole('button', { name: 'Liberar portal' }).first().click();
    checar('exige o e-mail do cliente', await ve(p.getByRole('alert').filter({ hasText: 'Informe o e-mail do cliente' }), 5000));
    await p.getByLabel(/E-mail\(s\) do cliente de Casa do Cliente/).fill(`  ${emailCli.toUpperCase()} `);
    await p.getByRole('button', { name: 'Ver como o cliente' }).first().click();
    checar('pré-visualização mostra o painel antes de liberar', await ve(p.getByRole('heading', { name: 'Casa do Cliente', level: 1 })) && await p.getByText('Cronograma físico-financeiro (Curva S)').isVisible());
    await p.getByRole('button', { name: 'Liberar portal' }).first().click();
    const pub = await ate(async () => (await adb.doc(`portalCliente/${T}_w1`).get()).data());
    checar('painel publicado com o e-mail normalizado e só os dados da obra', pub?.emails?.[0] === emailCli && pub?.obra?.nome === 'Casa do Cliente' && pub?.contrato?.valorAtual === 520000 && pub?.parcelas?.length === 2, JSON.stringify(pub?.emails));
    const bruto = JSON.stringify(pub ?? {});
    checar('nada de custo interno nem de outra obra no documento publicado', !bruto.includes('CONFIDENCIAL') && !bruto.includes('SECRETA') && !bruto.includes('77777'));
    checar('tela mostra "Portal liberado"', await ve(p.getByText(/Portal liberado/).first()));

    console.log('\n2. Cliente cria a conta e confirma o e-mail');
    const c = await pagina();
    await c.goto(`${APP}/login/`, { waitUntil: 'load' });
    await c.getByRole('button', { name: 'Criar conta' }).click();
    await c.getByLabel('Seu nome').fill('Cliente Portal'); await c.getByLabel('E-mail').fill(emailCli); await c.getByLabel('Senha').fill(SENHA);
    await c.getByRole('button', { name: 'Criar conta', exact: true }).first().click();
    checar('antes de confirmar o e-mail: não vê o painel, recebe a orientação', await ve(c.getByText('É cliente de uma construtora?')) && await c.getByText(/confirme o seu e-mail/).isVisible() && (await c.getByText('Casa do Cliente').count()) === 0);
    const uc = await getAuth().getUserByEmail(emailCli);
    await getAuth().updateUser(uc.uid, { emailVerified: true }); // equivale a clicar no link do e-mail
    await c.getByRole('button', { name: 'Já confirmei' }).click();
    checar('depois de confirmar: abre direto no painel do contrato', await ve(c.getByRole('heading', { name: 'Casa do Cliente', level: 1 })));
    checar('cabeçalho do portal: empresa e contrato', await c.getByText(/Construtora Portal · Portal do Cliente/i).isVisible() && await c.getByText(/Contrato CT-77/).isVisible());
    checar('indicadores: obra executada, IDP, entrega estimada, valor com aditivo', await c.getByText('Obra executada', { exact: true }).first().isVisible() && await c.getByText('Índice de prazo (IDP)').isVisible() && await c.getByText('Entrega estimada').isVisible() && await c.getByText(/original R\$ 500 mil \+ aditivos R\$ 20 mil/).isVisible());
    checar('parcelas: paga com data e vencida em destaque', await c.getByRole('row', { name: /Parcela 1.*Paga/ }).isVisible() && await c.getByRole('row', { name: /Parcela 2.*Vencida/ }).isVisible() && await c.getByText('Parcelas vencidas').isVisible());
    checar('medição com retenção e líquido', await c.getByRole('row', { name: /110\.000,00.*5\.500,00.*104\.500,00/ }).isVisible());
    checar('etapas do cronograma com situação', await c.getByText('Fundações').first().isVisible() && await c.getByText('Concluída', { exact: true }).isVisible());
    await c.getByRole('tab', { name: 'Financeiro (R$)' }).click();
    checar('curva S alterna entre físico e financeiro', await ve(c.getByRole('img', { name: /Curva S financeira/ }), 5000));
    checar('cliente não tem menu interno nem dados de terceiros', (await c.getByRole('navigation', { name: 'Áreas do aplicativo' }).count()) === 0 && (await c.getByText(/SECRETA|CONFIDENCIAL/).count()) === 0);
    await c.goto(`${APP}/gestao/finance/`, { waitUntil: 'load' });
    checar('endereço interno digitado à mão continua mostrando só o portal', await ve(c.getByRole('heading', { name: 'Casa do Cliente', level: 1 })) && (await c.getByText('CUSTO INTERNO').count()) === 0);

    console.log('\n3. Atualização automática e fim do acesso');
    await adb.doc(`${O}/finance/r3`).set({ workId: 'w1', type: 'Receita', description: 'Parcela 3 nova', date: dia(0), dueDate: dia(30), value: 80000, status: 'Previsto', category: 'Medição', deleted: false });
    checar('lançamento novo chega ao painel do cliente sem ninguém republicar', await ve(c.getByRole('row', { name: /Parcela 3 nova.*A vencer/ }), 30000));
    const p2 = await pagina();
    await p2.goto(`${APP}/login/`, { waitUntil: 'load' }); await p2.getByRole('button', { name: 'Criar conta' }).click();
    const emailIntruso = `intruso-${sufixo}@portal.test`;
    await p2.getByLabel('Seu nome').fill('Intruso'); await p2.getByLabel('E-mail').fill(emailIntruso); await p2.getByLabel('Senha').fill(SENHA);
    await p2.getByRole('button', { name: 'Criar conta', exact: true }).first().click();
    await ve(p2.getByText('É cliente de uma construtora?'));
    await getAuth().updateUser((await getAuth().getUserByEmail(emailIntruso)).uid, { emailVerified: true });
    await p2.getByRole('button', { name: 'Já confirmei' }).click();
    checar('outra pessoa com e-mail confirmado não vê contrato nenhum', await ve(p2.getByText(/Nenhum contrato foi liberado para/)) && (await p2.getByText('Casa do Cliente').count()) === 0);
    p.once('dialog', (d) => d.accept());
    await p.getByRole('button', { name: 'Encerrar o acesso ao painel de Casa do Cliente' }).click();
    checar('encerrar o acesso tira o cliente do painel na hora', await ve(c.getByText(/Nenhum contrato foi liberado para/), 20000) && !(await adb.doc(`portalCliente/${T}_w1`).get()).exists);
    checar('nenhum erro de JavaScript', erros.length === 0, JSON.stringify(erros));
  } catch (e) { falhas.push(`exceção: ${e.message.split('\n')[0]}`); console.error(e.message.split('\n').slice(0, 6).join('\n')); }
  await b.close();
  console.log(`\n${ok} verificações ok, ${falhas.length} falha(s)${falhas.length ? ':\n - ' + falhas.join('\n - ') : ''}`);
  process.exit(falhas.length ? 1 : 0);
})();
