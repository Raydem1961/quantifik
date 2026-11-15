const fs = require('fs'); const path = require('path'); const opentype = require('opentype.js'); const { chromium } = require('playwright');
const OUT = path.join(__dirname, 'marca');
const GRAD = '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3546c4"/><stop offset="1" stop-color="#7c3aed"/></linearGradient>';
// Símbolo: cobertura (o "topo") sobre três volumes (a obra / o crescimento). Desenhado em 512×512.
const tracos = (cor, o = 0.62) => `<path d="M92 262 L256 118 L420 262" fill="none" stroke="${cor}" stroke-width="42" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="146" y="314" width="60" height="96" rx="13" fill="${cor}" opacity="${o}"/><rect x="226" y="262" width="60" height="148" rx="13" fill="${cor}"/><rect x="306" y="314" width="60" height="96" rx="13" fill="${cor}" opacity="${o}"/>`;
const icone = (raio = 116) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="ObraTop"><defs>${GRAD}</defs><rect width="512" height="512" rx="${raio}" fill="url(#g)"/>${tracos('#fff')}</svg>`;
// Mascarável (Android): fundo sem cantos e símbolo dentro da área segura central (80%).
const mascaravel = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs>${GRAD}</defs><rect width="512" height="512" fill="url(#g)"/><g transform="translate(256 256) scale(.74) translate(-256 -264)">${tracos('#fff')}</g></svg>`;
const mono = (cor) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="60 86 392 340" role="img" aria-label="ObraTop">${tracos(cor, 0.55)}</svg>`;
const fonte = opentype.loadSync('/usr/share/fonts/opentype/inter/Inter-Bold.otf');
function palavra(corObra, corTop, tam = 150) {
  const a = fonte.getPath('Obra', 0, 0, tam, { letterSpacing: -0.035 }); const la = fonte.getAdvanceWidth('Obra', tam, { letterSpacing: -0.035 });
  const b = fonte.getPath('Top', la, 0, tam, { letterSpacing: -0.035 }); const lb = fonte.getAdvanceWidth('Top', tam, { letterSpacing: -0.035 });
  return { svg: `<path d="${a.toPathData(2)}" fill="${corObra}"/><path d="${b.toPathData(2)}" fill="${corTop}"/>`, largura: la + lb };
}
function horizontal(corObra, corTop, fundo) {
  const w = palavra(corObra, corTop); const L = Math.ceil(512 * 0.5 + 44 + w.largura + 8);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} 256" role="img" aria-label="ObraTop"><defs>${GRAD}</defs>${fundo ? `<rect width="${L}" height="256" fill="${fundo}"/>` : ''}<g transform="scale(.5)"><rect width="512" height="512" rx="116" fill="url(#g)"/>${tracos('#fff')}</g><g transform="translate(${256 + 44} 182)">${w.svg}</g></svg>`;
}
function vertical(corObra, corTop) {
  const w = palavra(corObra, corTop, 120); const L = Math.max(512, Math.ceil(w.largura) + 40);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} 700" role="img" aria-label="ObraTop"><defs>${GRAD}</defs><g transform="translate(${(L - 400) / 2} 0) scale(.78125)"><rect width="512" height="512" rx="116" fill="url(#g)"/>${tracos('#fff')}</g><g transform="translate(${(L - w.largura) / 2} 560)">${w.svg}</g></svg>`;
}
const A = {
  'obratop-icone.svg': icone(), 'obratop-icone-mascaravel.svg': mascaravel, 'obratop-simbolo-branco.svg': mono('#ffffff'), 'obratop-simbolo-escuro.svg': mono('#1c1c22'), 'obratop-simbolo-cor.svg': mono('#4f46e5'),
  'obratop-logo.svg': horizontal('#16161d', '#5b47d6'), 'obratop-logo-fundo-escuro.svg': horizontal('#ffffff', '#b4a5ff'), 'obratop-logo-vertical.svg': vertical('#16161d', '#5b47d6'),
};
for (const [n, s] of Object.entries(A)) fs.writeFileSync(path.join(OUT, n), s);
(async () => {
  const b = await chromium.launch();
  const png = async (svg, nome, w, h = w, fundo = 'transparent') => { const p = await b.newPage({ viewport: { width: w, height: h } }); await p.setContent(`<body style="margin:0;background:${fundo}">${svg.replace('<svg ', `<svg width="${w}" height="${h}" style="display:block" `)}</body>`); await p.screenshot({ path: path.join(OUT, nome), omitBackground: fundo === 'transparent' }); await p.close(); };
  for (const t of [16, 32, 48, 180, 192, 512, 1024]) await png(A['obratop-icone.svg'], `obratop-icone-${t}.png`, t);
  await png(mascaravel, 'obratop-icone-mascaravel-512.png', 512);
  const dim = (s) => s.match(/viewBox="0 0 (\d+) (\d+)"/).slice(1).map(Number);
  let [w, h] = dim(A['obratop-logo.svg']); await png(A['obratop-logo.svg'], 'obratop-logo.png', w * 2, h * 2);
  await png(A['obratop-logo-fundo-escuro.svg'], 'obratop-logo-fundo-escuro.png', w * 2, h * 2);
  [w, h] = dim(A['obratop-logo-vertical.svg']); await png(A['obratop-logo-vertical.svg'], 'obratop-logo-vertical.png', w * 2, h * 2);
  // Folha de apresentação da marca
  const u = (n) => `data:image/svg+xml;base64,${Buffer.from(A[n]).toString('base64')}`;
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  await p.setContent(`<body style="margin:0;font-family:Inter;background:#f3f3f7;padding:40px;display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:28px;height:920px;box-sizing:border-box;grid-template-rows:1.25fr 1fr">
  <style>section{border-radius:28px;display:grid;place-items:center;position:relative;overflow:hidden}small{position:absolute;left:24px;top:20px;font-size:14px;letter-spacing:1px;text-transform:uppercase;opacity:.55;font-weight:600}</style>
  <section style="background:#fff"><small>Logotipo principal</small><img src="${u('obratop-logo.svg')}" style="width:74%"></section>
  <section style="background:#fff"><small>Ícone do aplicativo</small><img src="${u('obratop-icone.svg')}" style="width:52%;filter:drop-shadow(0 24px 30px #5b47d655)"></section>
  <section style="background:#fff"><small>Versão vertical</small><img src="${u('obratop-logo-vertical.svg')}" style="height:68%"></section>
  <section style="background:#111118;color:#fff"><small>Sobre fundo escuro</small><img src="${u('obratop-logo-fundo-escuro.svg')}" style="width:70%"></section>
  <section style="background:#fff"><small>Tamanhos pequenos</small><div style="display:flex;align-items:flex-end;gap:26px">${[96, 64, 48, 32, 20, 16].map((t) => `<img src="${u('obratop-icone.svg')}" width="${t}">`).join('')}</div></section>
  <section style="background:linear-gradient(135deg,#3546c4,#7c3aed);color:#fff"><small>Símbolo em uma cor</small><div style="display:flex;gap:30px;align-items:center"><img src="${u('obratop-simbolo-branco.svg')}" width="150"><div style="display:grid;gap:10px;font-size:13px;font-weight:600">${[['#3546c4', 'Índigo'], ['#7c3aed', 'Violeta'], ['#16161d', 'Grafite'], ['#ffffff', 'Branco']].map(([c, n]) => `<span style="display:flex;align-items:center;gap:10px"><i style="width:26px;height:26px;border-radius:8px;background:${c};border:1px solid #ffffff55"></i>${n} ${c}</span>`).join('')}</div></div></section></body>`);
  await p.waitForTimeout(400); await p.screenshot({ path: path.join(OUT, 'apresentacao-da-marca.png') }); await b.close(); console.log(fs.readdirSync(OUT).length, 'arquivos');
})();
