const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const D = process.argv[2], A = 'http://localhost:4199';
const OFX = `<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>0341<ACCTID>12345-6</BANKACCTFROM><BANKTRANLIST><DTSTART>20261101<DTEND>20261130
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>${new Date(Date.now()+17*864e5).toISOString().slice(0,10).replace(/-/g,'')}<TRNAMT>213100.00<FITID>X1<MEMO>TED RECEBIDA - CLIENTE A</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>${new Date(Date.now()+4*864e5).toISOString().slice(0,10).replace(/-/g,'')}<TRNAMT>-74200.00<FITID>X2<MEMO>PAGAMENTO FORNECEDOR ACO</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>${new Date().toISOString().slice(0,10).replace(/-/g,'')}<TRNAMT>-35.90<FITID>X3<MEMO>TARIFA BANCARIA</STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>291264.10</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
const ch = (() => { const b = '2926111122233300018155001000001234100000123'; let s = 0, p = 2; for (let i = 42; i >= 0; i--) { s += Number(b[i]) * p; p = p === 9 ? 2 : p + 1; } return b + (s % 11 < 2 ? 0 : 11 - (s % 11)); })();
const NFE = `<nfeProc><NFe><infNFe Id="NFe${ch}"><ide><mod>55</mod><nNF>1234</nNF><dhEmi>2026-11-04T10:00:00-03:00</dhEmi></ide><emit><CNPJ>11222333000181</CNPJ><xNome>ACOS BAHIA LTDA</xNome><enderEmit><xMun>Salvador</xMun><UF>BA</UF></enderEmit></emit>
<det nItem="1"><prod><xProd>ACO CA-50 10MM</xProd><uCom>KG</uCom><qCom>8000</qCom><vUnCom>6.50</vUnCom><vProd>52000.00</vProd></prod></det><det nItem="2"><prod><xProd>ACO CA-50 12,5MM</xProd><uCom>KG</uCom><qCom>3000</qCom><vUnCom>7.40</vUnCom><vProd>22200.00</vProd></prod></det>
<total><ICMSTot><vProd>74200.00</vProd><vNF>74200.00</vNF></ICMSTot></total><cobr><dup><nDup>001</nDup><dVenc>2026-12-04</dVenc><vDup>37100.00</vDup></dup><dup><nDup>002</nDup><dVenc>2027-01-04</dVenc><vDup>37100.00</vDup></dup></cobr></infNFe></NFe><protNFe><infProt><cStat>100</cStat><nProt>1</nProt></infProt></protNFe></nfeProc>`;
fs.writeFileSync(path.join(D, 'extrato.ofx'), OFX); fs.writeFileSync(path.join(D, 'nota.xml'), NFE);
(async () => {
  const b = await chromium.launch(); const erros = [];
  const ctx = await b.newContext({ viewport: { width: 1360, height: 850 }, deviceScaleFactor: 1.5 });
  await ctx.addInitScript(() => localStorage.setItem('theme', 'light'));
  const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message));
  const foto = async (n, o = {}) => {
    await p.waitForTimeout(o.espera ?? 700);
    // Página inteira sem o artefato do cabeçalho fixo: aumenta a janela até a altura do conteúdo (no máximo `max`).
    if (o.inteira) { const h = await p.evaluate(() => document.documentElement.scrollHeight); await p.setViewportSize({ width: 1360, height: Math.max(850, Math.min(h, o.max ?? 1500)) }); await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(400); }
    await p.screenshot({ path: path.join(D, 'img', `${n}.jpg`), type: 'jpeg', quality: 80 });
    if (o.inteira) await p.setViewportSize({ width: 1360, height: 850 });
  };
  const ir = async (r, espera = 1000) => { await p.goto(`${A}/${r}/`, { waitUntil: 'load' }); await p.waitForTimeout(espera); };
  const tenta = async (n, f) => { try { await f(); } catch (e) { erros.push(`${n}: ${e.message.split('\n')[0]}`); } };
  await ir('login'); await foto('01-login');
  await ir('inicio'); await foto('02-inicio', { inteira: true });
  await p.keyboard.press('Control+k'); await p.getByRole('dialog', { name: 'Busca rápida' }).getByRole('combobox').fill('med'); await foto('03-busca'); await p.keyboard.press('Escape');
  await ir('area/planejamento'); await foto('04-area', { inteira: true });
  await ir('dashboard'); await foto('05-projetos', { inteira: true });
  await tenta('gantt', async () => { await p.getByRole('tab', { name: 'Gantt' }).click(); await foto('06-projetos-gantt'); });
  await ir('briefing'); await foto('07-briefing', { inteira: true });
  await ir('cad', 2000); await foto('08-cad', { inteira: true });
  await ir('quantitativos', 1500); await tenta('exemplos', async () => { await p.getByRole('button', { name: 'Carregar exemplos' }).click(); await p.waitForTimeout(6000); }); await foto('09-quantitativos', { inteira: true, max: 1250 });
  await ir('composicoes', 7000); await tenta('servico', async () => { await p.getByLabel('Buscar por código ou descrição').fill('alvenaria vedacao bloco ceramico 14'); await p.waitForTimeout(800); await p.getByRole('list', { name: 'Serviços encontrados' }).getByRole('button').first().click(); await p.getByLabel('Comprimento (m)').fill('10'); await p.getByLabel('Altura (m)').fill('3'); }); await foto('10-servicos', { inteira: true });
  await tenta('cotacao', async () => { await p.getByRole('button', { name: /Adicionar à cotação/ }).click(); await p.getByRole('tab', { name: /Cotações/ }).click(); }); await foto('11-cotacoes', { inteira: true });
  await ir('orcamento', 2000); await foto('12-cub', { inteira: true });
  await ir('contratos', 1500); await foto('13-contratos', { inteira: true });
  await ir('gestao/works', 1500); await foto('14-obras', { inteira: true });
  await tenta('novo', async () => { await p.getByRole('button', { name: 'Novo' }).click(); await foto('15-obras-form'); });
  await ir('gestao/activities', 1500); await foto('16-cronograma-tabela');
  await tenta('gantt-obra', async () => { await p.getByRole('tab', { name: 'Gantt' }).click(); await foto('17-cronograma-gantt', { inteira: true }); });
  for (const [n, m] of [['18-diario', 'dailyLogs'], ['19-medicoes', 'measurements'], ['20-orcamento-obra', 'budgets'], ['21-compras', 'orders'], ['22-estoque', 'inventory'], ['23-fornecedores', 'suppliers'], ['24-equipamentos', 'equipment'], ['25-financeiro', 'finance'], ['26-contratos-obra', 'contracts'], ['27-pessoal', 'staff'], ['28-qualidade', 'quality'], ['29-seguranca', 'safety'], ['30-documentos', 'documents']]) { await ir(`gestao/${m}`, 1200); await foto(n); }
  await ir('area/financeiro'); await foto('31-area-financeiro', { inteira: true });
  await ir('integracoes/bancos', 1500);
  await tenta('ofx', async () => { await p.locator('input[type=file]').setInputFiles(path.join(D, 'extrato.ofx')); await p.getByLabel('Chave Pix').fill('11.222.333/0001-81'); await p.getByLabel('Cidade').fill('Salvador'); await p.getByLabel(/^Valor/).fill('213.100,00'); await p.getByLabel(/^Identificador/).fill('MED002'); await p.getByRole('button', { name: 'Gerar Pix' }).click(); });
  await foto('32-bancos', { inteira: true, espera: 1500 });
  await ir('integracoes/fiscal', 1500); await tenta('nfe', async () => { await p.locator('input[type=file]').setInputFiles(path.join(D, 'nota.xml')); }); await foto('33-fiscal', { inteira: true, espera: 1200 });
  await ir('integracoes/esocial', 1500); await foto('34-esocial');
  await ir('admin', 1500); await foto('35-admin', { inteira: true });
  await ir('clientes', 1500);
  await tenta('portal', async () => {
    await p.getByLabel(/E-mail\(s\) do cliente de Residencial/).fill('cliente@exemplo.com');
    await p.getByRole('button', { name: 'Liberar portal' }).nth(1).click(); await p.waitForTimeout(600);
    await foto('39-clientes');
    await p.getByRole('button', { name: 'Ver como o cliente' }).nth(1).click(); await p.waitForTimeout(900);
    const painel = p.locator('.aurora').last();
    await p.setViewportSize({ width: 1360, height: 2600 }); await p.waitForTimeout(500);
    const cx = await painel.boundingBox();
    await p.screenshot({ path: path.join(D, 'img', '40-portal-topo.jpg'), type: 'jpeg', quality: 80, clip: { x: cx.x - 12, y: cx.y - 12, width: cx.width + 24, height: Math.min(cx.height + 24, 880) } });
    await p.screenshot({ path: path.join(D, 'img', '41-portal-detalhe.jpg'), type: 'jpeg', quality: 80, clip: { x: cx.x - 12, y: cx.y + 868, width: cx.width + 24, height: Math.min(cx.height - 856, 900) } });
    await p.setViewportSize({ width: 1360, height: 850 });
  });
  await ctx.addInitScript(() => localStorage.setItem('theme', 'dark')); await ir('inicio'); await foto('36-escuro');
  const cel = await b.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 }); await cel.addInitScript(() => localStorage.setItem('theme', 'light'));
  const pc = await cel.newPage(); await pc.goto(`${A}/inicio/`, { waitUntil: 'load' }); await pc.waitForTimeout(900); await pc.screenshot({ path: path.join(D, 'img', '37-celular.jpg'), type: 'jpeg', quality: 80 });
  await pc.getByRole('button', { name: 'Abrir menu' }).click(); await pc.waitForTimeout(500); await pc.screenshot({ path: path.join(D, 'img', '38-celular-menu.jpg'), type: 'jpeg', quality: 80 });
  console.log(erros.join('\n') || 'sem erros'); await b.close();
})();
