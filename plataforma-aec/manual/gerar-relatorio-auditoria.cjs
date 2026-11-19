/** Relatório da auditoria do ObraTop 4 (PDF).  node manual/gerar-relatorio-auditoria.cjs <saida.pdf> */
const fs = require('node:fs'); const path = require('node:path'); const { chromium } = require('playwright');
const logo = `data:image/svg+xml;base64,${fs.readFileSync(path.join(__dirname, '..', 'public', 'marca', 'obratop-logo.svg')).toString('base64')}`;
const S = { ok: ['Presente e testado', '#15803d'], novo: ['Implementado nesta auditoria', '#1d4ed8'], subst: ['Substituído por recurso equivalente', '#7c3aed'], nao: ['Não portado', '#b45309'] };
const sel = (k) => `<span class="sel" style="--c:${S[k][1]}">${S[k][0]}</span>`;
const tabela = (linhas) => `<table><thead><tr><th>Funcionalidade</th><th>No ObraTop 4</th><th>Situação</th></tr></thead><tbody>${linhas.map(([a, b, c]) => `<tr><td>${a}</td><td>${b}</td><td>${sel(c)}</td></tr>`).join('')}</tbody></table>`;

const OBRATOP = [
  ['Login, verificação de e-mail, criar empresa, convites', 'Entrar, criar conta, convite por link, primeiro acesso', 'ok'],
  ['Funções Administrador, Gestor, Financeiro, Engº da obra, Consulta', 'Mesmas funções, com regras de segurança e testes', 'novo'],
  ['Bloquear / desbloquear usuário', 'Equipe → ícone de bloqueio (efeito imediato)', 'novo'],
  ['Painel executivo, alertas e obras que pedem atenção', 'Início, páginas de área, central de pendências', 'ok'],
  ['15 cadastros (obras, cronograma, orçamento, medições, financeiro, compras, estoque, contratos, pessoal, equipamentos, qualidade, segurança, documentos, fornecedores, diário)', 'Mesmos campos e dados; cálculos originais do ObraTop', 'ok'],
  ['Gantt, caminho crítico, linha de base, MS Project (exportar/importar)', 'Cronograma', 'ok'],
  ['Valor agregado (IDP/IDC), estimativa no término, Curva S', 'Obras, Cronograma, Portal do Cliente', 'ok'],
  ['Assistente de nova obra por modelo (edificação, pavimentação, rede, contenção)', 'Obras → Nova obra por modelo', 'novo'],
  ['Diário aplicado ao cronograma', 'Ícone na linha do diário', 'novo'],
  ['Medição/pedido → lançamento financeiro', 'Ícone na linha (formulário pré-preenchido)', 'novo'],
  ['Pedido → entrada no estoque; estoque → pedido de reposição; semáforo', 'Ícones e coluna Situação', 'novo'],
  ['Histórico diário de avanço (progressSnapshots)', 'Gravado no mesmo formato do ObraTop 3', 'novo'],
  ['Análise econômica (margem, caixa, Curva ABC, sensibilidade, reajuste)', 'Financeiro → Análise econômica', 'novo'],
  ['Trilha de auditoria', 'Gravada a cada alteração + tela de consulta', 'novo'],
  ['Lixeira (exclusão lógica com restauração)', 'Administrativo → Lixeira e auditoria', 'novo'],
  ['Backup e restauração profissional', 'Backup em arquivo com SHA-256 e prévia da restauração', 'novo'],
  ['Pontos de restauração no servidor', 'Backup em arquivo (os pontos antigos seguem no ObraTop 3)', 'subst'],
  ['Logotipo e dados da empresa nos relatórios', 'Mesmos campos do ObraTop 3 (valem nos dois)', 'novo'],
  ['Salário visível só a Administrador e Financeiro', 'Oculto para as demais funções (tela, planilha, indicadores)', 'novo'],
  ['Exportar CSV/Excel dos cadastros', 'Botão Planilha (CSV que abre no Excel)', 'novo'],
  ['Exportar relatórios em Word (.docx) e Excel (.xlsx) nativos', 'PDF e CSV', 'subst'],
  ['Relatório gerencial da obra em PDF', 'Obras → Relatório PDF', 'ok'],
  ['Anexos de documentos', 'Documentos (Storage)', 'ok'],
  ['Uso offline e instalação no celular', 'PWA com fila de gravação', 'ok'],
  ['Manual e glossário dentro do aplicativo', 'Manual ilustrado (PDF) no botão ?', 'subst'],
  ['Engenharia Inteligente: quantitativos de PDF e Google Planilhas', 'BIM e quantitativos (IFC, DXF, LandXML, EPANET, SWMM, CSV) — PDF não é lido', 'subst'],
  ['Edição e exclusão em lote', '—', 'nao'],
  ['Revisão automática da EAP (correção de numeração)', '—', 'nao'],
  ['Manutenção: detecção e saneamento de registros duplicados', '—', 'nao'],
];
const QUANTIFIK = [
  ['Consulta de serviços SINAPI-BA e ORSE-SE (grupos/atividades, busca)', 'Serviços e composições', 'ok'],
  ['Quantidade por medidas (comprimento, largura, altura, profundidade, peças)', 'Mesmo cálculo — paridade de 7.406 linhas de insumo', 'ok'],
  ['Pisos Sinduscon-BA, encargos horistas, desoneração, horas/mês, BDI', 'Parâmetros (guardados para a equipe)', 'ok'],
  ['Preços digitados por insumo e "limpar preços digitados"', 'Composição do serviço', 'ok'],
  ['Importar tabela de preços (Excel, CSV, texto colado)', 'Parâmetros → importar ou colar; guardada para a equipe', 'novo'],
  ['Cotações: nova, duplicar, excluir, exportar, importar', 'Cotações', 'ok'],
  ['PDF da cotação com composição de custos', 'Baixar PDF', 'ok'],
  ['Compartilhar PDF (celular)', 'Compartilhar PDF', 'novo'],
  ['Cotação levada ao orçamento da obra → cronograma', 'Enviar ao orçamento da obra', 'ok'],
];
const ERROS = [
  ['Funções Gestor, Financeiro e Consulta do ObraTop 3 eram tratadas como usuário de uma obra só (perdiam o acesso às demais obras).', 'Sessão, telas e regras reconhecem as cinco funções; 7 testes de regras cobrem cada função.'],
  ['A função Consulta conseguia lançar horas técnicas e marcações de revisão (achado pelos testes de regras).', 'Regras corrigidas (Consulta só lê) e testadas.'],
  ['Salários e dados pessoais da equipe apareciam para todas as funções (o ObraTop 3 escondia).', 'Ocultos para Gestor, Engenheiro da obra e Consulta na tela, na planilha, nos indicadores e no eSocial.'],
  ['"Dar entrada no estoque" falhava se clicado antes de o estoque terminar de carregar.', 'Botão só aparece com o estoque carregado.'],
  ['Tabela de preços importada (Quantifik) valia só na sessão; códigos com zeros à esquerda não casavam.', 'Guardada para toda a equipe; 00001379 = 1379.'],
  ['Logotipo e contatos da empresa não eram os mesmos do ObraTop 3.', 'Lidos e gravados nos campos do ObraTop 3.'],
  ['Exclusões e alterações do ObraTop 4 não entravam na trilha de auditoria; não havia lixeira.', 'Auditoria a cada gravação; lixeira com restauração.'],
  ['Funções sem obra: nas regras do ObraTop 3, quem tem obra atribuída pode gravar nela — inclusive Consulta.', 'O ObraTop 4 cria Consulta, Gestor e Financeiro sem obra. Atenção: Consultas criadas antes pelo ObraTop 3 com obra mantêm essa permissão nas regras antigas.'],
];
const TESTES = [['Testes de unidade (cálculos, importadores, integrações, portal, fotos, ligações)', 97], ['Testes originais dos cálculos do ObraTop', 34], ['Regras de segurança (emulador)', 32], ['Instalador', 4],
  ['Servidor: uploads, auditoria, assinatura, alertas', 45], ['Telas: todas as áreas, convites, papéis', 73], ['Integrações: banco, Pix, NF-e, CNPJ, eSocial', 21], ['Portal do Cliente', 20], ['Uso sem internet', 5],
  ['Auditoria: fotos, relatório fotográfico, portal, ligações, assistente, lixeira, backup, funções, análise econômica, termos', 36]];
const total = TESTES.reduce((t, x) => t + x[1], 0);

const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><style>
@page{size:A4;margin:16mm 14mm 16mm} body{font:10pt/1.5 Inter,'Segoe UI',Arial,sans-serif;color:#1c1c22;margin:0} h1{font-size:24pt;margin:6mm 0 2mm;letter-spacing:-.5px} h2{font-size:14pt;margin:9mm 0 3mm;border-bottom:.7mm solid #4f46e5;padding-bottom:1.5mm} h3{font-size:11pt;margin:5mm 0 2mm}
p{margin:0 0 2.5mm} table{width:100%;border-collapse:collapse;font-size:8.8pt;margin:2mm 0 4mm} th,td{border:1px solid #dcdce4;padding:1.6mm 2mm;text-align:left;vertical-align:top} th{background:#eef0ff} tr{break-inside:avoid}
.sel{display:inline-block;padding:.4mm 2mm;border-radius:3mm;font-size:7.8pt;font-weight:600;color:var(--c);background:color-mix(in srgb,var(--c) 12%,white);white-space:nowrap}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;margin:4mm 0} .kpi{border:1px solid #dcdce4;border-radius:2.5mm;padding:3mm} .kpi b{display:block;font-size:17pt;color:#4f46e5} .kpi span{font-size:8.5pt;color:#555}
ul{margin:0;padding-left:5mm} li{margin-bottom:1.2mm} .nota{background:#f6f6fa;border-left:1.2mm solid #4f46e5;padding:3mm 4mm;border-radius:1.5mm;margin:3mm 0}</style><body>
<img src="${logo}" style="height:12mm"><h1>Relatório de auditoria — ObraTop 4.1</h1><p style="color:#555">19 de novembro de 2026 · comparação com o ObraTop 3.39 e o Quantifik publicados · versão do código ${process.argv[3] ?? ''}</p>
<div class="kpis"><div class="kpi"><b>${total}</b><span>verificações automáticas, todas passando</span></div><div class="kpi"><b>${OBRATOP.filter((x) => x[2] !== 'nao').length}/${OBRATOP.length}</b><span>funcionalidades do ObraTop 3 presentes ou substituídas</span></div><div class="kpi"><b>${QUANTIFIK.length}/${QUANTIFIK.length}</b><span>funcionalidades do Quantifik presentes</span></div><div class="kpi"><b>100</b><span>acessibilidade, boas práticas e SEO (Lighthouse)</span></div></div>
<div class="nota"><b>Resumo.</b> Antes desta auditoria o ObraTop 4 <b>não</b> tinha todas as funcionalidades dos dois aplicativos: faltavam as funções Gestor/Financeiro/Consulta, lixeira, auditoria, backup, assistente de obra, análise econômica, as ligações entre compras, estoque, medições e financeiro, e parte da importação de preços do Quantifik. Tudo isso foi implementado e testado. Três recursos menores do ObraTop 3 não foram portados (lista no fim) e quatro foram substituídos por equivalentes.</div>
<h2>1. Pedidos desta etapa</h2><ul><li><b>Fotos diárias no Diário de Obra</b>: câmera ou galeria, até 40 por dia, reduzidas no aparelho (foto + miniatura), legenda, serviço do cronograma e marcação "uso interno"; relatório fotográfico por dia, ampliação em tela cheia e impressão em PDF.</li>
<li><b>Relatório fotográfico no Portal do Cliente</b>: mês a mês, só fotos de diários assinados e não marcadas como internas; o cliente só acessa o da própria obra (regras testadas).</li></ul>
<h2>2. ObraTop 3 → ObraTop 4</h2>${tabela(OBRATOP)}
<h2>3. Quantifik → ObraTop 4</h2>${tabela(QUANTIFIK)}
<h2>4. Erros encontrados e soluções</h2><table><thead><tr><th>Erro</th><th>Solução</th></tr></thead><tbody>${ERROS.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</tbody></table>
<h2>5. Testes</h2><table><thead><tr><th>Conjunto</th><th style="text-align:right">Verificações</th></tr></thead><tbody>${TESTES.map(([a, b]) => `<tr><td>${a}</td><td style="text-align:right">${b}</td></tr>`).join('')}<tr><td><b>Total</b></td><td style="text-align:right"><b>${total}</b></td></tr></tbody></table>
<p>Os testes de ponta a ponta rodam contra os emuladores do Firebase (banco, autenticação, arquivos e funções) — fotos reais são enviadas e lidas. Provedores externos (Clicksign, consulta de CNPJ) são simulados.</p>
<h2>6. Para chegar a 10/10</h2><h3>Depende de você (não pode ser feito daqui)</h3><ul>
<li><b>Publicar esta versão</b> com o instalador (INSTALAR.cmd) e conferir com os dados reais.</li><li><b>Revisar os Termos e a Política de Privacidade</b> com o jurídico e preencher razão social, CNPJ e encarregado de dados (página /legal/).</li>
<li><b>Ativar o App Check</b> no Console do Firebase (protege contra uso abusivo — o próprio Firebase recomenda na tela do Storage).</li><li>Contratos e certificados para as integrações oficiais: Clicksign (assinatura), Autodesk APS (DWG), e-CNPJ A1 (NF-e/NFS-e, eSocial), API do banco (extrato automático, boletos).</li>
<li>Definir um orçamento/alerta de gastos no plano Blaze.</li></ul>
<h3>Não portados do ObraTop 3 (baixo impacto)</h3><ul><li>Edição e exclusão em lote.</li><li>Revisão automática da numeração da EAP.</li><li>Detecção e saneamento de registros duplicados.</li></ul>
<h3>Recomendações</h3><ul><li>Monitoramento de erros em produção (ex.: Sentry ou Crashlytics) para saber de falhas antes do cliente.</li><li>Backup semanal (Administrativo → Backup e restauração) guardado fora do computador.</li>
<li>Rever as Consultas antigas criadas pelo ObraTop 3 com obra atribuída (podem gravar naquela obra pelas regras antigas): troque a função ou a obra em Equipe.</li></ul>
</body></html>`;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage(); await p.setContent(html, { waitUntil: 'load' });
  await p.pdf({ path: process.argv[2], format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: '<div style="width:100%;font:8pt Arial;color:#888;padding:0 14mm;display:flex;justify-content:space-between"><span>ObraTop 4.1 — relatório de auditoria</span><span class="pageNumber"></span></div>' });
  await b.close(); console.log('total', total);
})();
