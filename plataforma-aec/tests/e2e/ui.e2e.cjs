/**
 * Teste de ponta a ponta da interface em modo Firebase real (emuladores).
 * Pré-requisitos: emuladores no ar, app compilado com NEXT_PUBLIC_USE_EMULATORS=1 e servido em
 * :4173, e uma cópia das bases de preços servida em :4174 (ver README).
 *   node tests/e2e/ui.e2e.cjs
 */
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const PROJETO = 'demo-aec';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.GCLOUD_PROJECT = PROJETO;
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp({ projectId: PROJETO });
const adb = getFirestore();
const APP = 'http://localhost:4173';
const SENHA = 'senha-teste-123';
const T = 'atelier';

let ok = 0;
const falhas = [];
const checar = (nome, cond, detalhe = '') => { if (cond) { ok++; console.log(`  ok   ${nome}`); } else { falhas.push(nome); console.log(`  FALHA ${nome} ${detalhe}`); } };
async function ate(fn, ms = 25000) { const fim = Date.now() + ms; let r; while (Date.now() < fim) { r = await fn(); if (r) return r; await new Promise((x) => setTimeout(x, 400)); } return r; }
const dia = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const clicksign = http.createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    const rota = req.url.split('?')[0];
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(rota.endsWith('/documents') ? { document: { key: 'ui-doc-1' } } : rota.endsWith('/signers') ? { signer: { key: `s${Date.now()}` } } : { list: { key: 'l' } }));
  });
}).listen(4180);

async function semear() {
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJETO}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJETO}/accounts`, { method: 'DELETE' });
  const criar = async (email, claims) => { const u = await getAuth().createUser({ email, password: SENHA, displayName: email.split('@')[0] }); if (claims) await getAuth().setCustomUserClaims(u.uid, claims); return u.uid; };
  const uids = {
    socio: await criar('socio@atelier.test', { tenantId: T, role: 'socio_diretor' }),
    projetista: await criar('projetista@atelier.test', { tenantId: T, role: 'projetista' }),
    cliente: await criar('cliente@atelier.test', { tenantId: T, role: 'cliente' }),
    semVinculo: await criar('novo@atelier.test'),
  };
  await adb.doc(`tenants/${T}`).set({ razaoSocial: 'Atelier Teste Ltda.', nomeFantasia: 'Atelier Teste', cnpj: '00.000.000/0001-00', uf: 'BA', custoHoraTecnica: 100, branding: { corPrimaria: '#3b4cca', corSecundaria: '#111827' }, responsavelTecnico: { nome: 'Eng. Teste', conselho: 'CREA', registro: 'CREA-BA 000' } });
  const proj = (id, extra) => adb.doc(`tenants/${T}/projects/${id}`).set({ tenantId: T, codigo: id.toUpperCase(), clientId: '', clienteNome: 'Cliente Teste', uf: 'BA', municipio: 'Salvador', areaConstruidaM2: 300, valorContratado: 80000, inicio: dia(-30), fim: dia(60), progresso: 30, clienteUids: [], ...extra });
  await proj('res-1', { nome: 'Casa Teste', tipologia: 'residencial', status: 'briefing', disciplinas: ['arquitetonico', 'estrutural'], clienteUids: [uids.cliente] });
  await proj('lot-1', { nome: 'Loteamento Teste', tipologia: 'loteamento', status: 'anteprojeto', disciplinas: ['topografia', 'urbanismo', 'esgotamento'] });
  await adb.doc(`tenants/${T}/projects/res-1/artRrt/a1`).set({ tenantId: T, projectId: 'res-1', projetoNome: 'Casa Teste', tipo: 'ART', disciplina: 'estrutural', etapa: 'Executivo', responsavel: 'Eng. Teste', status: 'a_emitir', valorTaxa: 100, vencimento: dia(2) });
  await adb.doc(`tenants/${T}/notifications/n1`).set({ tipo: 'geral', titulo: 'Bem-vindo', mensagem: 'Notificação de teste', criadoEm: new Date().toISOString(), lidaPor: [], destinatarios: [] });
  const e = (total) => ({ total, materiais: total * 0.5, maoDeObra: total * 0.4, despesasAdministrativas: total * 0.07, equipamentos: total * 0.03 });
  await adb.doc('cubTables/BA_2026-10').set({ uf: 'BA', competencia: '2026-10', fonte: 'TESTE-BA', desonerado: false, ilustrativo: true, valores: { 'R1-B': e(2000), 'R1-N': e(2400), 'R1-A': e(3000) } });
  return uids;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aec-e2e-'));
const arquivo = (nome, conteudo) => { const f = path.join(tmp, nome); fs.writeFileSync(f, conteudo); return f; };
const DXF = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '6', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', '0', 'LWPOLYLINE', '8', 'A-AREA-PRIV', '90', '4', '70', '1', '10', '0', '20', '0', '10', '12', '20', '0', '10', '12', '20', '10', '10', '0', '20', '10', '0', 'ENDSEC', '0', 'EOF', ''].join('\n');
const SWMM = '[OPTIONS]\nFLOW_UNITS LPS\n[JUNCTIONS]\nPV1 100 1.2\n[CONDUITS]\nC1 PV1 EX 140 0.013\n[XSECTIONS]\nC1 CIRCULAR 0.15 0 0 0 1\n';

(async () => {
  const uids = await semear();
  const navegador = await chromium.launch();
  const erros = [];
  const novaPagina = async () => {
    const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));
    return p;
  };
  const entrar = async (p, email, senha = SENHA) => {
    await p.goto(`${APP}/login/`, { waitUntil: 'load' });
    await p.getByLabel('E-mail').fill(email);
    await p.getByLabel('Senha').fill(senha);
    await p.getByRole('button', { name: 'Entrar', exact: true }).click();
  };

  try {
    console.log('\n1. Autenticação');
    let p = await novaPagina();
    await p.goto(`${APP}/dashboard/`);
    await p.waitForURL('**/login/', { timeout: 15000 });
    checar('rota protegida redireciona para o login', true);
    await entrar(p, 'socio@atelier.test', 'senha-errada');
    checar('senha errada mostra erro e não entra', await p.getByRole('alert').filter({ hasText: 'Não foi possível entrar' }).waitFor({ timeout: 10000 }).then(() => true, () => false));
    await entrar(p, 'socio@atelier.test');
    await p.waitForURL('**/dashboard/', { timeout: 15000 });
    await p.getByText('Casa Teste').first().waitFor({ timeout: 15000 });
    checar('sócio entra e vê os projetos do Firestore', await p.getByText('Loteamento Teste').first().isVisible());
    checar('nome do tenant e papel no menu', await p.getByText('Atelier Teste').isVisible() && await p.getByText('Sócio-Diretor').isVisible());
    checar('não há selo de modo demonstração', (await p.getByText('Modo demonstração').count()) === 0);

    console.log('\n2. Dashboard em tempo real');
    await p.locator('article', { hasText: 'Casa Teste' }).dragTo(p.getByRole('region', { name: 'Estudo preliminar' }));
    checar('arrastar no Kanban grava o status no Firestore', await ate(async () => (await adb.doc(`tenants/${T}/projects/res-1`).get()).data().status === 'estudo_preliminar'));
    await adb.doc(`tenants/${T}/projects/lot-1`).update({ status: 'aprovacao' });
    checar('mudança feita por outro usuário aparece sem recarregar', await p.getByRole('region', { name: 'Aprovação' }).locator('article', { hasText: 'Loteamento Teste' }).waitFor({ timeout: 10000 }).then(() => true, () => false));
    checar('alerta de ART vencendo em 2 dias', await p.getByText('Vence em 2 d').isVisible());
    await p.getByRole('button', { name: /Notificações \(1 não lidas\)/ }).click();
    await p.getByRole('button', { name: /Bem-vindo/ }).click();
    checar('marcar notificação como lida grava no Firestore', await ate(async () => (await adb.doc(`tenants/${T}/notifications/n1`).get()).data().lidaPor.includes(uids.socio)));
    await p.getByRole('tab', { name: 'Gantt' }).click();
    checar('Gantt mostra os projetos ativos', await p.getByLabel(/Casa Teste: .* 30% concluído/).isVisible());
    // Cronômetro: simula 5 minutos decorridos
    await p.getByRole('button', { name: 'Iniciar' }).click();
    await p.evaluate(() => { const r = JSON.parse(localStorage.getItem('aec.cronometro')); r.inicio -= 5 * 60000; localStorage.setItem('aec.cronometro', JSON.stringify(r)); });
    await p.reload({ waitUntil: 'load' });
    await p.getByRole('button', { name: 'Parar e lançar' }).click();
    const hora = await ate(async () => { const s = await adb.collectionGroup('timesheets').get(); return s.empty ? null : s.docs[0].data(); });
    checar('cronômetro sobrevive ao recarregar e lança 5 min com autor e tenant', hora?.minutos === 5 && hora?.uid === uids.socio && hora?.tenantId === T, JSON.stringify(hora));
    checar('tabela de margem reflete o lançamento', await p.getByRole('cell', { name: /R\$\s79\.992/ }).waitFor({ timeout: 10000 }).then(() => true, () => false));

    console.log('\n3. Briefing');
    await p.goto(`${APP}/briefing/`, { waitUntil: 'load' });
    await p.getByLabel('Nome do projeto').fill('Rede de Água Bairro Novo');
    await p.getByLabel('Cliente', { exact: true }).fill('Prefeitura Teste');
    await p.getByLabel('Município').fill('Camaçari');
    await p.getByLabel('Tipologia').selectOption('abastecimento_agua');
    checar('escopo muda com a tipologia', await p.getByText(/outorga de captação/).isVisible() && await p.getByText('Rede de distribuição: traçado', { exact: false }).isVisible());
    await p.getByRole('button', { name: 'Criar projeto' }).click();
    await p.waitForURL('**/dashboard/', { timeout: 15000 });
    const criado = await ate(async () => { const s = await adb.collection(`tenants/${T}/projects`).where('nome', '==', 'Rede de Água Bairro Novo').get(); return s.empty ? null : s.docs[0]; });
    checar('projeto criado com tipologia e disciplinas', criado?.data().tipologia === 'abastecimento_agua' && criado?.data().disciplinas.join() === 'topografia,abastecimento_agua', JSON.stringify(criado?.data()?.disciplinas));
    checar('briefing e escopo gravados no projeto', criado && !(await criado.ref.collection('briefings').get()).empty);

    console.log('\n4. CAD: upload, versão e marcação');
    await p.goto(`${APP}/cad/`, { waitUntil: 'load' });
    await p.getByRole('combobox', { name: /^Projeto/ }).selectOption({ label: 'RES-1 — Casa Teste' });
    await p.locator('input[type=file]').setInputFiles(arquivo('planta-teste.dxf', DXF));
    checar('pré-visualização imediata: 120 m² na camada', await p.getByRole('row', { name: /A-AREA-PRIV\s*120,00/ }).waitFor({ timeout: 10000 }).then(() => true, () => false));
    checar('revisão R00 aparece na lista após o processamento no servidor', await p.getByText('R00 · 1 rev.').waitFor({ timeout: 30000 }).then(() => true, () => false));
    checar('notificação de CAD chega em tempo real', await p.getByRole('button', { name: /Notificações \(1 não lidas\)/ }).waitFor({ timeout: 15000 }).then(() => true, () => false));
    await p.getByRole('button', { name: 'Marcar revisão' }).click();
    const c = await p.locator('canvas').boundingBox();
    await p.mouse.move(c.x + 200, c.y + 200); await p.mouse.down(); await p.mouse.move(c.x + 300, c.y + 260, { steps: 6 }); await p.mouse.up();
    const red = await ate(async () => { const s = await adb.collection(`tenants/${T}/projects/res-1/redlines`).get(); return s.empty ? null : s.docs[0].data(); });
    checar('marcação de revisão salva com autor e coordenadas do desenho', red?.autorUid === uids.socio && red?.pontos?.length > 2);
    await p.getByRole('button', { name: 'Usar no orçamento' }).click();
    await p.waitForURL('**/orcamento/');

    console.log('\n5. Orçamento CUB');
    await p.getByText('TESTE-BA · competência').waitFor({ timeout: 15000 });
    checar('áreas do CAD preenchem o quadro (120 m²)', await p.getByLabel('Área real').first().inputValue() === '120');
    // 120 m² × 2400 = 288.000 + 4% fundações = 299.520; BDI padrão 22,226% → 366.091,81
    const preco = await p.locator('p.text-3xl').innerText();
    checar('preço calculado com o CUB do Firestore', /366\.091,81/.test(preco), preco);
    await p.getByLabel('Projeto do orçamento').selectOption({ label: 'RES-1 — Casa Teste' });
    await p.getByRole('button', { name: 'Salvar no projeto' }).click();
    const orc = await ate(async () => { const s = await adb.collection(`tenants/${T}/projects/res-1/budgets`).get(); return s.empty ? null : s.docs[0].data(); });
    checar('orçamento salvo como rascunho no projeto', orc?.status === 'rascunho' && orc?.total === 366091.81 && orc?.tenantId === T, JSON.stringify(orc?.total));
    checar('gravação do orçamento gera log de auditoria', await ate(async () => !(await adb.collection(`tenants/${T}/auditLogs`).where('recurso', '==', 'orcamento').get()).empty));

    console.log('\n6. Importação universal e orçamento analítico');
    await p.goto(`${APP}/quantitativos/`, { waitUntil: 'load' });
    await p.getByRole('combobox', { name: /^Projeto/ }).selectOption({ label: 'LOT-1 — Loteamento Teste' });
    await p.locator('input[type=file]').setInputFiles([arquivo('esgoto.inp', SWMM), arquivo('modelo.rvt', 'binario')]);
    await p.getByText('Planilha orçamentária').waitFor({ timeout: 20000 });
    checar('arquivo nativo (.rvt) recebe orientação de exportar IFC', await p.getByRole('alert').filter({ hasText: /modelo\.rvt.*IFC/ }).waitFor({ timeout: 10000 }).then(() => true, () => false));
    const qd = await ate(async () => (await adb.doc(`tenants/${T}/projects/lot-1/quantities/esgoto-inp`).get()).data());
    checar('quantitativos gravados no projeto', qd?.formato === 'swmm' && qd?.tenantId === T);
    await p.getByRole('button', { name: 'Buscar composição para Tubo para esgoto sanitário DN 150 mm' }).click();
    await p.getByLabel(/Buscar composição em/).fill('tubo coletor esgoto DN 150');
    await p.getByRole('listitem').filter({ hasText: 'TUBO COLETOR DE ESGOTO' }).first().getByRole('button', { name: 'Usar' }).click();
    const vinc = await ate(async () => { const s = await adb.collection(`tenants/${T}/vinculos`).get(); return s.empty ? null : s.docs[0].data(); });
    checar('vínculo confirmado gravado para o escritório', vinc?.estado === 'confirmado' && vinc?.fonte === 'SINAPI' && vinc?.codigo === '41936', JSON.stringify(vinc));
    const n = (s) => Number(String(s).replace(/[^\d]/g, ''));
    const lerTotal = () => p.locator('p.text-xl').first().innerText();
    // 140 m × R$ 79,18 (SINAPI 41936) × BDI 1,25 = R$ 13.857
    const total1 = await ate(async () => { const t = await lerTotal(); return n(t) > 0 ? t : null; }, 10000);
    checar('preço recalculado com a composição (140 m × 79,18 × 1,25)', n(total1) === 13857, String(total1));
    // Nova revisão chega por outro caminho (servidor/colega): a extensão dobra
    await adb.doc(`tenants/${T}/projects/lot-1/quantities/esgoto-inp`).update({ itens: qd.itens.map((i) => (/DN 150/.test(i.descricao) ? { ...i, quantidade: 280 } : i)) });
    const total2 = await ate(async () => { const t = await lerTotal(); return n(t) !== n(total1) ? t : null; }, 10000);
    checar('nova revisão recalcula o orçamento sozinha, em tempo real', n(total2) === 27713, `${total1} → ${total2}`);

    console.log('\n7. Contrato, PDF e assinatura');
    await p.getByRole('link', { name: /Gerar proposta/ }).click();
    await p.waitForURL('**/contratos/');
    await p.getByRole('combobox', { name: /^Projeto/ }).selectOption({ label: 'LOT-1 — Loteamento Teste' });
    checar('loteamento usa a estimativa por composições', await p.getByLabel('Estimativa de obra no documento').inputValue() === 'analitico');
    checar('cláusulas seguem as disciplinas (urbanismo sim, estrutural não)', await p.locator('p', { hasText: '1.8. O projeto urbanístico' }).isVisible() && (await p.locator('p', { hasText: '1.3. O projeto estrutural' }).count()) === 0);
    await p.getByRole('button', { name: 'Gerar PDF' }).click();
    await p.getByText('PDF pronto').waitFor({ timeout: 60000 });
    const sha = (await p.locator('p.font-mono').innerText()).replace('SHA-256 ', '');
    await p.getByRole('button', { name: 'Enviar para assinatura' }).click();
    checar('exige e-mail do cliente antes de enviar', await p.getByRole('alert').filter({ hasText: 'e-mail do cliente' }).isVisible());
    await p.getByLabel('E-mail do cliente (assinatura)').fill('cliente@exemplo.test');
    checar('e-mail não faz parte do texto: o PDF continua válido', (await p.getByText('PDF pronto').count()) === 1);
    // mudar um dado que entra no contrato invalida o PDF (o hash deixaria de corresponder)
    await p.getByLabel('CPF/CNPJ do cliente').fill('123.456.789-00');
    checar('alterar o texto do contrato invalida o PDF anterior', await ate(async () => (await p.getByText('PDF pronto').count()) === 0, 5000));
    await p.getByRole('button', { name: 'Gerar PDF' }).click();
    await p.getByText('PDF pronto').waitFor({ timeout: 60000 });
    const sha2 = (await p.locator('p.font-mono').innerText()).replace('SHA-256 ', '');
    await p.getByRole('button', { name: 'Enviar para assinatura' }).click();
    checar('mensagem de envio concluído', await p.getByRole('status').filter({ hasText: 'Contrato enviado' }).waitFor({ timeout: 30000 }).then(() => true, async () => { console.log('    ', await p.getByRole('alert').allInnerTexts()); return false; }));
    const ct = await ate(async () => { const s = await adb.collection(`tenants/${T}/projects/lot-1/contracts`).get(); return s.empty ? null : s.docs[0].data(); });
    checar('contrato no Firestore: enviado, com o hash do PDF exibido', ct?.status === 'enviado_assinatura' && ct?.sha256 === sha2 && sha2.length === 64 && typeof sha === 'string', JSON.stringify({ s: ct?.status }));

    console.log('\n8. Serviços & Cotações (Quantifik) no Firestore');
    await p.goto(`${APP}/composicoes/`, { waitUntil: 'load' });
    await p.getByText(/composições$/).first().waitFor({ timeout: 60000 });
    await p.getByLabel('Buscar por código ou descrição').fill('103368');
    await p.getByRole('list', { name: 'Serviços encontrados' }).getByRole('button').first().click();
    await p.getByLabel('Comprimento (m)').fill('10');
    await p.getByLabel('Altura (m)').fill('3');
    await p.getByRole('button', { name: /Adicionar à cotação/ }).click();
    const cot = await ate(async () => { const s = await adb.collection(`tenants/${T}/cotacoes`).get(); return s.empty ? null : s.docs[0].data(); });
    checar('cotação gravada no escritório com número e serviço', cot?.numero === `001/${new Date().getFullYear()}` && cot?.itens?.[0]?.cod === '103368' && cot?.itens?.[0]?.qtd === 30 && cot?.tenantId === T, JSON.stringify(cot));
    await p.getByRole('tab', { name: 'Parâmetros' }).click();
    await p.getByLabel('BDI (%)').fill('30');
    const cfg = await ate(async () => { const d = (await adb.doc(`tenants/${T}/config/composicoes`).get()).data(); return d?.bdi === 30 ? d : null; });
    checar('parâmetros de preço salvos para toda a equipe', cfg?.bdi === 30 && cfg?.pisos?.servente > 0 && cfg?.tenantId === T);

    console.log('\n9. Gestão de obras (ObraTop) no Firestore');
    await p.goto(`${APP}/gestao/`, { waitUntil: 'load' });
    await p.getByRole('button', { name: 'Novo' }).click();
    await p.getByLabel('Nome da obra *').fill('Obra E2E');
    await p.getByLabel('Cliente *').fill('Cliente E2E');
    await p.getByLabel('Início *').fill('2026-01-05');
    await p.getByLabel('Término previsto *').fill('2026-06-30');
    await p.getByLabel('Valor contratado').fill('500.000,00');
    await p.getByRole('button', { name: 'Salvar' }).click();
    const obra = await ate(async () => { const s = await adb.collection(`tenants/${T}/works`).get(); return s.empty ? null : s.docs[0]; });
    checar('obra criada com os campos do ObraTop', obra?.data().name === 'Obra E2E' && obra?.data().value === 500000 && obra?.data().deleted === false && obra?.data().tenantId === T, JSON.stringify(obra?.data()));
    // cronograma chega por outro caminho (ex.: migração): aparece sem recarregar
    const act = (id, wbs, name, start, end, progress, pred) => adb.doc(`tenants/${T}/activities/${id}`).set({ tenantId: T, workId: obra.id, wbs, name, start, end, progress, predecessors: pred, progressMode: 'Percentual', status: 'Em andamento', deleted: false });
    await act('a1', '1.1', 'Fundações', '2026-01-05', '2026-02-13', 100, '');
    await act('a2', '1.2', 'Estrutura', '2026-02-16', '2026-04-30', 40, '1.1');
    await act('a3', '1.3', 'Acabamentos', '2026-05-01', '2026-06-30', 0, '1.2'); // sem folga: as três ficam no caminho crítico
    await p.getByRole('combobox', { name: /^Módulo/ }).selectOption('activities');
    await p.getByRole('tab', { name: 'Gantt' }).click();
    checar('cronograma em tempo real no Gantt, com caminho crítico', await p.getByText(/caminho crítico \(3\)/).waitFor({ timeout: 15000 }).then(() => true, () => false));
    p.once('dialog', (d) => d.accept('Linha de base inicial'));
    await p.getByRole('button', { name: 'Congelar linha de base' }).click();
    const base = await ate(async () => (await obra.ref.get()).data().baseline);
    checar('linha de base congelada no formato do ObraTop', base?.revision === 1 && base?.items?.a2?.s === '2026-02-16' && base?.items?.a2?.e === '2026-04-30' && base?.items?.a2?.w > 0 && base?.byEmail === 'socio@atelier.test', JSON.stringify(base?.items?.a2));
    await adb.doc(`tenants/${T}/activities/a2`).update({ end: '2026-05-15' });
    await p.getByRole('button', { name: /Replanejar \(base rev\. 1\)/ }).waitFor({ timeout: 10000 });
    p.once('dialog', (d) => d.accept('Atraso na estrutura'));
    await p.getByRole('button', { name: /Replanejar/ }).click();
    const obra2 = await ate(async () => { const d = (await obra.ref.get()).data(); return d.baseline?.revision === 2 ? d : null; });
    checar('replanejamento guarda a base anterior no histórico', obra2?.baselineHistory?.[0]?.revision === 1 && obra2?.baseline?.items?.a2?.e === '2026-05-15');
    const [rel] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.getByRole('button', { name: /Relatório PDF — Obra E2E/ }).click()]);
    checar('relatório da obra em PDF é gerado', /^relatorio-Obra_E2E-.*\.pdf$/.test(rel.suggestedFilename()), rel.suggestedFilename());
    // exclusão lógica
    await p.getByRole('tab', { name: 'Tabela' }).click();
    p.once('dialog', (d) => d.accept());
    await p.getByRole('button', { name: /^Excluir 1\.3 Acabamentos/ }).click();
    checar('exclusão é lógica: o registro continua no banco com deleted', await ate(async () => { const d = (await adb.doc(`tenants/${T}/activities/a3`).get()).data(); return d?.deleted === true && d?.name === 'Acabamentos'; }));

    console.log('\n10. Fluxo integrado: cotação → orçamento da obra → cronograma; documentos');
    await p.goto(`${APP}/composicoes/`, { waitUntil: 'load' });
    await p.getByRole('tab', { name: /Cotações/ }).click();
    await p.getByRole('combobox', { name: /Levar esta cotação/ }).selectOption({ label: 'Obra E2E' });
    await p.getByRole('button', { name: 'Enviar ao orçamento da obra' }).click();
    const itemOrc = await ate(async () => { const s = await adb.collection(`tenants/${T}/budgets`).where('workId', '==', obra.id).get(); return s.empty ? null : s.docs[0]; });
    const io = itemOrc?.data();
    checar('serviço da cotação vira item do orçamento da obra, com composição', io?.qty === 30 && io?.unitValue > 0 && io?.bdi === cot.bdi && io?.sourceCode === 'SINAPI 103368' && io?.composition?.some((c) => c.kind === 'Mão de obra' && c.unit === 'h'), JSON.stringify({ q: io?.qty, v: io?.unitValue, b: io?.bdi }));
    await p.getByRole('button', { name: 'Enviar ao orçamento da obra' }).click();
    await p.waitForTimeout(1500);
    checar('reenviar a cotação não duplica o item', (await adb.collection(`tenants/${T}/budgets`).where('workId', '==', obra.id).get()).size === 1);
    await p.goto(`${APP}/gestao/?m=budgets`, { waitUntil: 'load' });
    await p.getByRole('combobox', { name: 'Filtrar por obra' }).selectOption({ label: 'Obra E2E' });
    p.once('dialog', (d) => d.accept());
    await p.getByRole('button', { name: 'Gerar cronograma' }).click();
    const gerada = await ate(async () => (await adb.doc(`tenants/${T}/activities/orc-${itemOrc.id}`).get()).data());
    checar('cronograma gerado do orçamento, ligado ao item e dentro do prazo da obra', gerada?.budgetId === itemOrc.id && gerada?.start >= '2026-01-05' && gerada?.end <= '2026-06-30' && gerada?.laborHours > 0 && gerada?.plannedQty === 30, JSON.stringify(gerada));
    checar('atividades cadastradas antes não foram alteradas', (await adb.doc(`tenants/${T}/activities/a1`).get()).data().name === 'Fundações');
    // documento com anexo
    await p.goto(`${APP}/gestao/?m=documents`, { waitUntil: 'load' });
    await p.getByRole('button', { name: 'Novo' }).click();
    await p.getByLabel('Nome do documento *').fill('Alvará de construção');
    await p.getByLabel('Categoria *').fill('Licenças');
    await p.locator('form input[type=file]').setInputFiles(arquivo('alvara.pdf', '%PDF-1.4 alvara de teste'));
    await p.getByRole('button', { name: 'Salvar' }).click();
    const docArq = await ate(async () => { const s = await adb.collection(`tenants/${T}/documents`).get(); return s.empty ? null : s.docs[0].data(); });
    checar('documento salvo com anexo no Storage (campos do ObraTop)', docArq?.fileName === 'alvara.pdf' && /^tenants\/atelier\/documents\/general\//.test(docArq?.storagePath ?? '') && /^http/.test(docArq?.fileUrl ?? ''), JSON.stringify(docArq));
    const baixado = docArq?.fileUrl ? await (await fetch(docArq.fileUrl)).text() : '';
    checar('o anexo pode ser baixado e é o arquivo enviado', baixado === '%PDF-1.4 alvara de teste');
    await p.goto(`${APP}/dashboard/`, { waitUntil: 'load' });
    checar('painel inicial mostra as obras em execução', await p.getByText('Obras em execução').waitFor({ timeout: 15000 }).then(() => true, () => false) && await p.getByRole('progressbar', { name: 'Realizado — Obra E2E' }).isVisible());

    console.log('\n11. Papéis');
    p = await novaPagina();
    await entrar(p, 'projetista@atelier.test');
    await p.waitForURL('**/dashboard/');
    await p.getByText('Casa Teste').first().waitFor({ timeout: 15000 });
    checar('projetista: cartões do Kanban não são arrastáveis', (await p.locator('article[draggable=true]').count()) === 0);
    checar('projetista: não vê a tabela de margem', (await p.getByRole('columnheader', { name: 'Margem real' }).count()) === 0);
    await p.goto(`${APP}/quantitativos/`, { waitUntil: 'load' });
    checar('projetista: sem botão de importar no orçamento analítico', (await p.getByText('Importar arquivos').count()) === 0);
    await p.goto(`${APP}/gestao/?m=suppliers`, { waitUntil: 'load' });
    await p.getByRole('heading', { name: 'Fornecedores' }).waitFor({ timeout: 15000 });
    checar('projetista: fornecedores só para leitura (como no ObraTop)', (await p.getByRole('button', { name: 'Novo' }).count()) === 0);
    await p.goto(`${APP}/gestao/?m=dailyLogs`, { waitUntil: 'load' });
    await p.getByRole('heading', { name: 'Diário de Obra' }).waitFor({ timeout: 15000 });
    checar('projetista: pode lançar diário de obra', (await p.getByRole('button', { name: 'Novo' }).count()) === 1);
    p = await novaPagina();
    await entrar(p, 'cliente@atelier.test');
    await p.waitForURL('**/dashboard/');
    await p.getByText('Casa Teste').first().waitFor({ timeout: 15000 });
    checar('cliente: vê só o próprio projeto', (await p.getByText('Loteamento Teste').count()) === 0 && (await p.getByText('Rede de Água Bairro Novo').count()) === 0);
    checar('cliente: sem ART, horas e menus internos', (await p.getByText('ART / RRT').count()) === 0 && (await p.getByRole('link', { name: 'Orçamento CUB' }).count()) === 0);
    await p.goto(`${APP}/contratos/`);
    checar('cliente: rota interna volta para o painel', await p.waitForURL('**/dashboard/', { timeout: 10000 }).then(() => true, () => false));
    p = await novaPagina();
    await entrar(p, 'novo@atelier.test');
    checar('conta sem empresa vê a orientação, não os dados', await p.getByText('Conta ainda sem empresa vinculada').waitFor({ timeout: 15000 }).then(() => true, () => false));

    checar('nenhum erro de JavaScript nas páginas', erros.length === 0, JSON.stringify(erros));
  } catch (e) {
    falhas.push(`exceção: ${e.message.split('\n')[0]}`);
    console.error(e.message.split('\n').slice(0, 6).join('\n'));
  } finally {
    await navegador.close();
    clicksign.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`\n${ok} verificações ok, ${falhas.length} falha(s)${falhas.length ? ':\n - ' + falhas.join('\n - ') : ''}`);
    process.exit(falhas.length ? 1 : 0);
  }
})();
