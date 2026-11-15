/**
 * Integrações de ponta a ponta (emuladores no ar e app servido em :4173, como no ui.e2e.cjs):
 * extrato OFX → conciliação, Pix copia e cola, NF-e XML → fornecedor + contas a pagar, eSocial.
 * A consulta pública de CNPJ é respondida por um servidor simulado (nada sai da máquina).
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
const T = `integ-${Date.now()}`, O = `organizations/${T}`, APP = 'http://localhost:4173';
let ok = 0; const falhas = [];
const checar = (n, c, d = '') => { if (c) { ok++; console.log(`  ok   ${n}`); } else { falhas.push(n); console.log(`  FALHA ${n} ${d}`); } };
const ate = async (fn, ms = 20000) => { const fim = Date.now() + ms; let r; while (Date.now() < fim) { r = await fn(); if (r) return r; await new Promise((x) => setTimeout(x, 300)); } return r; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'integ-'));
const arquivo = (nome, txt) => { const f = path.join(tmp, nome); fs.writeFileSync(f, txt); return f; };
const crc16 = (t) => { let c = 0xffff; for (let i = 0; i < t.length; i++) { c ^= t.charCodeAt(i) << 8; for (let b = 0; b < 8; b++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; } return c.toString(16).toUpperCase().padStart(4, '0'); };

const OFX = `<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>0341<ACCTID>999-1</BANKACCTFROM><BANKTRANLIST><DTSTART>20261101<DTEND>20261110
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261103<TRNAMT>213100.00<FITID>X1<MEMO>TED CLIENTE A</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261105<TRNAMT>-58000.00<FITID>X2<MEMO>FOLHA OBRA</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261106<TRNAMT>-35.90<FITID>X3<MEMO>TARIFA BANCARIA</STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>155064.10</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
const chave = (() => { const b = '2926111122233300018155001000001234100000123'; let s = 0, p = 2; for (let i = 42; i >= 0; i--) { s += Number(b[i]) * p; p = p === 9 ? 2 : p + 1; } return b + (s % 11 < 2 ? 0 : 11 - (s % 11)); })();
const NFE = `<nfeProc><NFe><infNFe Id="NFe${chave}"><ide><mod>55</mod><serie>1</serie><nNF>1234</nNF><dhEmi>2026-11-04T10:00:00-03:00</dhEmi></ide>
<emit><CNPJ>11222333000181</CNPJ><xNome>ACOS BAHIA LTDA</xNome><enderEmit><xMun>Salvador</xMun><UF>BA</UF></enderEmit></emit>
<det nItem="1"><prod><xProd>ACO CA-50 10MM</xProd><uCom>KG</uCom><qCom>8000</qCom><vUnCom>6.50</vUnCom><vProd>52000.00</vProd></prod></det>
<total><ICMSTot><vProd>52000.00</vProd><vNF>52000.00</vNF></ICMSTot></total>
<cobr><dup><nDup>001</nDup><dVenc>2026-12-04</dVenc><vDup>26000.00</vDup></dup><dup><nDup>002</nDup><dVenc>2027-01-04</dVenc><vDup>26000.00</vDup></dup></cobr>
</infNFe></NFe><protNFe><infProt><cStat>100</cStat><nProt>1</nProt></infProt></protNFe></nfeProc>`;

(async () => {
  const email = `dono-${Date.now()}@integ.test`;
  const u = await getAuth().createUser({ email, password: 'senha-teste-123', displayName: 'Dona' });
  await adb.doc(O).set({ name: 'Construtora Integ', ownerUid: u.uid });
  await adb.doc(`${O}/members/${u.uid}`).set({ role: 'owner', status: 'active', email });
  await adb.doc(`users/${u.uid}`).set({ currentOrg: T });
  await adb.doc(`${O}/works/w1`).set({ name: 'Obra Integ', status: 'Em andamento', deleted: false });
  await adb.doc(`${O}/finance/rec`).set({ workId: 'w1', type: 'Receita', value: 213100, status: 'Previsto', date: '2026-11-01', dueDate: '2026-11-04', description: 'Recebimento da 2ª medição', category: 'Medição', deleted: false });
  await adb.doc(`${O}/finance/folha`).set({ workId: 'w1', type: 'Despesa', value: 58000, status: 'Pendente', date: '2026-11-01', dueDate: '2026-11-05', description: 'Folha de pagamento', category: 'Mão de obra', deleted: false });
  await adb.doc(`${O}/staff/s1`).set({ name: 'Maria de Souza', role: 'Engenheira civil', cpf: '529.982.247-25', birthDate: '1990-05-10', cbo: '214205', admission: '2024-02-01', salary: 12500, status: 'Ativo', workId: 'w1', deleted: false });
  await adb.doc(`${O}/staff/s2`).set({ name: 'João', role: 'Pedreiro', admission: '2025-03-01', salary: 3200, status: 'Ativo', workId: 'w1', deleted: false });
  const b = await chromium.launch(); const erros = [];
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await ctx.route('https://brasilapi.com.br/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ razao_social: 'CIMENTOS DO NORDESTE SA', nome_fantasia: 'CIMENOR', descricao_situacao_cadastral: 'ATIVA', municipio: 'CAMACARI', uf: 'BA', cnae_fiscal_descricao: 'Fabricação de cimento' }) }));
  const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message));
  try {
    await p.goto(`${APP}/login/`, { waitUntil: 'load' });
    await p.getByLabel('E-mail').fill(email); await p.getByLabel('Senha').fill('senha-teste-123');
    await p.getByRole('button', { name: 'Entrar', exact: true }).click();
    await p.waitForURL('**/inicio/');

    console.log('\n1. Extrato OFX e conciliação');
    await p.goto(`${APP}/integracoes/bancos/`, { waitUntil: 'load' });
    await p.getByRole('combobox', { name: /^Obra dos novos/ }).locator('option', { hasText: 'Obra Integ' }).waitFor({ state: 'attached', timeout: 15000 });
    await p.locator('input[type=file]').setInputFiles(arquivo('extrato.ofx', OFX));
    checar('extrato lido: 3 movimentos e saldo final', await p.getByText('3 movimento(s) lidos').waitFor({ timeout: 10000 }).then(() => true, () => false) && await p.getByText(/saldo final/).isVisible());
    checar('sugere os dois lançamentos em aberto e aponta a tarifa sem par', (await p.getByText('Sugestão', { exact: true }).count()) === 2 && (await p.getByText('Sem lançamento').count()) === 1);
    await p.getByRole('button', { name: 'Confirmar as 2 sugestões' }).click();
    const rec = await ate(async () => { const d = (await adb.doc(`${O}/finance/rec`).get()).data(); return d.bankRef ? d : null; });
    const folha = (await adb.doc(`${O}/finance/folha`).get()).data();
    checar('recebimento baixado com a data e a referência do banco', rec?.status === 'Recebido' && rec?.paymentDate === '2026-11-03' && rec?.bankRef === 'X1', JSON.stringify(rec));
    checar('despesa baixada como paga', folha?.status === 'Pago' && folha?.paymentDate === '2026-11-05' && folha?.bankRef === 'X2');
    await p.getByRole('button', { name: 'Lançar TARIFA BANCARIA' }).click();
    const tarifa = await ate(async () => { const s = await adb.collection(`${O}/finance`).where('bankRef', '==', 'X3').get(); return s.empty ? null : s.docs[0].data(); });
    checar('tarifa lançada como despesa paga na obra escolhida', tarifa?.type === 'Despesa' && tarifa?.value === 35.9 && tarifa?.status === 'Pago' && tarifa?.workId === 'w1' && tarifa?.orgId === T, JSON.stringify(tarifa));
    checar('tela passa a mostrar os três como conciliados', await ate(async () => (await p.getByText('Conciliado', { exact: true }).count()) === 3, 10000));
    await p.locator('input[type=file]').setInputFiles(arquivo('extrato.ofx', OFX));
    await p.waitForTimeout(800);
    checar('reimportar o mesmo extrato não duplica nada', (await p.getByText('Conciliado', { exact: true }).count()) === 3 && (await adb.collection(`${O}/finance`).get()).size === 3);
    await p.locator('input[type=file]').setInputFiles(arquivo('planilha.ofx', 'data;valor'));
    checar('arquivo que não é OFX mostra orientação', await p.getByRole('alert').filter({ hasText: 'não é um extrato OFX' }).waitFor({ timeout: 5000 }).then(() => true, () => false));

    console.log('\n2. Pix copia e cola');
    await p.getByLabel('Chave Pix').fill('11.222.333/0001-81');
    await p.getByLabel('Cidade').fill('Salvador');
    await p.getByLabel(/^Valor/).fill('1.234,50');
    await p.getByLabel(/^Identificador/).fill('MED002');
    await p.getByRole('button', { name: 'Gerar Pix' }).click();
    const cod = await p.getByLabel('Pix copia e cola').innerText({ timeout: 10000 });
    checar('código Pix íntegro (CRC), com chave, valor e recebedor', crc16(cod.slice(0, -4)) === cod.slice(-4) && cod.includes('011411222333000181') && cod.includes('54071234.50') && cod.includes('5916Construtora Inte') === false && cod.includes('Construtora Integ') && cod.includes('0506MED002'), cod);
    checar('QR Code gerado', (await p.getByRole('img', { name: 'QR Code do Pix' }).getAttribute('src')).startsWith('data:image/png'));

    console.log('\n3. NF-e de compra e CNPJ');
    await p.goto(`${APP}/integracoes/fiscal/`, { waitUntil: 'load' });
    await p.getByRole('combobox', { name: /^Obra dos novos/ }).locator('option', { hasText: 'Obra Integ' }).waitFor({ state: 'attached', timeout: 15000 });
    await p.locator('input[type=file]').setInputFiles([arquivo('nota.xml', NFE), arquivo('danfe.xml', '<html>DANFE</html>')]);
    checar('nota lida e arquivo errado recusado com explicação', await p.getByRole('heading', { name: /NF-e 1234 · ACOS BAHIA LTDA/ }).waitFor({ timeout: 10000 }).then(() => true, () => false) && await p.getByRole('alert').filter({ hasText: 'danfe.xml' }).isVisible());
    checar('mostra autorização, fornecedor novo e valor', await p.getByText('Autorizada pela SEFAZ').isVisible() && await p.getByText('Fornecedor novo').isVisible());
    await p.getByRole('button', { name: 'Lançar contas a pagar' }).click();
    const contas = await ate(async () => { const s = await adb.collection(`${O}/finance`).where('nfeKey', '==', chave).get(); return s.size === 2 ? s.docs.map((d) => d.data()).sort((a, c) => a.dueDate.localeCompare(c.dueDate)) : null; });
    const forn = (await adb.collection(`${O}/suppliers`).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
    checar('duas contas a pagar pelas duplicatas, na obra', contas?.[0]?.value === 26000 && contas?.[0]?.dueDate === '2026-12-04' && contas?.[1]?.dueDate === '2027-01-04' && contas?.[0]?.type === 'Despesa' && contas?.[0]?.status === 'Pendente' && contas?.[0]?.workId === 'w1', JSON.stringify(contas));
    checar('fornecedor cadastrado e ligado às contas', forn.length === 1 && forn[0].name === 'ACOS BAHIA LTDA' && forn[0].cnpj === '11.222.333/0001-81' && contas?.[0]?.supplierId === forn[0].id, JSON.stringify(forn));
    await p.getByRole('button', { name: 'Atualizar contas a pagar' }).click();
    await p.waitForTimeout(1200);
    checar('lançar a mesma nota de novo não duplica contas nem fornecedor', (await adb.collection(`${O}/finance`).where('nfeKey', '==', chave).get()).size === 2 && (await adb.collection(`${O}/suppliers`).get()).size === 1);
    await p.getByLabel('CNPJ', { exact: true }).fill('11.222.333/0001-82');
    await p.getByRole('button', { name: 'Consultar' }).click();
    checar('CNPJ com dígito errado é barrado antes da consulta', await p.getByRole('alert').filter({ hasText: 'CNPJ inválido' }).waitFor({ timeout: 5000 }).then(() => true, () => false));
    await p.getByLabel('CNPJ', { exact: true }).fill('33.000.167/0001-01');
    await p.getByRole('button', { name: 'Consultar' }).click();
    await p.getByText('CIMENTOS DO NORDESTE SA').waitFor({ timeout: 10000 });
    await p.getByRole('button', { name: 'Cadastrar como fornecedor' }).click();
    checar('consulta de CNPJ cadastra o fornecedor (resposta simulada)', await ate(async () => (await adb.doc(`${O}/suppliers/cnpj-33000167000101`).get()).data()?.name === 'CIMENTOS DO NORDESTE SA'));

    console.log('\n4. eSocial');
    await p.goto(`${APP}/integracoes/esocial/`, { waitUntil: 'load' });
    checar('conferência: 1 de 2 completas, com o que falta', await p.getByText('1 de 2 pessoa(s) com os dados de admissão completos.').waitFor({ timeout: 15000 }).then(() => true, () => false)
      && await p.getByRole('row', { name: /João/ }).getByText('CPF', { exact: true }).isVisible() && await p.getByRole('row', { name: /Maria de Souza/ }).getByText('Completo').isVisible());
    const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Planilha para a contabilidade' }).click()]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    checar('planilha baixada com os dados e as pendências', /^trabalhadores-esocial-.*\.csv$/.test(dl.suggestedFilename()) && csv.includes('"Maria de Souza";"529.982.247-25"') && csv.includes('"Obra Integ"') && /"João";.*"Nome completo, CPF/.test(csv), csv.slice(0, 300));
    await p.goto(`${APP}/area/integracoes/`, { waitUntil: 'load' });
    checar('área Fiscal e Integrações no menu, com as três telas', await p.getByRole('heading', { name: 'Fiscal e Integrações', level: 1 }).waitFor({ timeout: 10000 }).then(() => true, () => false) && (await p.getByRole('main').getByRole('link', { name: /Bancos e Pix|Notas fiscais e CNPJ|eSocial/ }).count()) === 3);
    checar('nenhum erro de JavaScript', erros.length === 0, JSON.stringify(erros));
  } catch (e) { falhas.push(`exceção: ${e.message.split('\n')[0]}`); console.error(e.message.split('\n').slice(0, 5).join('\n')); }
  await b.close(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${ok} verificações ok, ${falhas.length} falha(s)${falhas.length ? ':\n - ' + falhas.join('\n - ') : ''}`);
  process.exit(falhas.length ? 1 : 0);
})();
