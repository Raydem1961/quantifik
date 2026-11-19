/** Fotos ilustrativas de canteiro (desenhos) para o modo demonstração e o manual. */
const { chromium } = require('playwright'); const path = require('path');
const cenas = [
  { ceu: '#8ec5ff', chao: '#b08d57', andares: 2, cor: '#d9d4cc', obra: 'alvenaria' },
  { ceu: '#a7d3ff', chao: '#9c7b4b', andares: 3, cor: '#cfcac2', obra: 'estrutura' },
  { ceu: '#ffd59e', chao: '#a98455', andares: 1, cor: '#e2ddd5', obra: 'fundacao' },
  { ceu: '#9fd0ff', chao: '#8f6f43', andares: 2, cor: '#c9c3ba', obra: 'cobertura' },
  { ceu: '#b9dcff', chao: '#7d6a55', andares: 0, cor: '#555', obra: 'pavimento' },
  { ceu: '#c2e1ff', chao: '#a28158', andares: 2, cor: '#e8e2d8', obra: 'reboco' },
];
const svg = (c, i) => {
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><defs><linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.ceu}"/><stop offset="1" stop-color="#eef6ff"/></linearGradient></defs>`;
  s += `<rect width="1200" height="900" fill="url(#c)"/><circle cx="${980 - i * 60}" cy="140" r="60" fill="#fff6c8" opacity=".9"/>`;
  s += `<rect y="620" width="1200" height="280" fill="${c.chao}"/><rect y="620" width="1200" height="14" fill="#00000022"/>`;
  if (c.obra === 'pavimento') {
    s += `<polygon points="200,900 1000,900 700,620 500,620" fill="#3d3d3d"/><polygon points="590,900 610,900 604,620 596,620" fill="#f5f5f5"/>`;
    s += `<rect x="760" y="560" width="180" height="90" rx="10" fill="#f2b705"/><circle cx="790" cy="660" r="30" fill="#222"/><circle cx="910" cy="660" r="30" fill="#222"/>`;
  } else {
    const base = 300, larg = 600, h = 120;
    for (let a = 0; a < c.andares; a++) {
      const y = 620 - (a + 1) * h;
      s += `<rect x="${base}" y="${y}" width="${larg}" height="${h}" fill="${c.cor}" stroke="#8a8378" stroke-width="3"/>`;
      for (let x = base + 10; x < base + larg; x += 46) for (let yy = y + 8; yy < y + h - 8; yy += 22) s += `<rect x="${x + ((yy / 22) % 2 ? 23 : 0)}" y="${yy}" width="40" height="18" fill="#00000010"/>`;
      s += `<rect x="${base - 10}" y="${y - 12}" width="${larg + 20}" height="14" fill="#9a958d"/>`;
      if (c.obra !== 'alvenaria') for (let k = 0; k < 3; k++) s += `<rect x="${base + 90 + k * 180}" y="${y + 30}" width="80" height="60" fill="#6b8fb3" opacity=".8"/>`;
    }
    if (c.obra === 'estrutura' || c.obra === 'cobertura') for (let x = base - 40; x <= base + larg + 40; x += 80) s += `<line x1="${x}" y1="${620 - c.andares * h - 40}" x2="${x}" y2="620" stroke="#c0392b" stroke-width="6"/>`;
    if (c.obra === 'cobertura') s += `<polygon points="${base - 30},${620 - c.andares * h - 10} ${base + larg / 2},${620 - c.andares * h - 150} ${base + larg + 30},${620 - c.andares * h - 10}" fill="#b5542f"/>`;
    if (c.obra === 'fundacao') for (let x = base; x <= base + larg; x += 100) s += `<rect x="${x}" y="560" width="30" height="80" fill="#9a958d"/><rect x="${x - 20}" y="630" width="70" height="30" fill="#7f7a72"/>`;
    s += `<g transform="translate(${base + larg + 80},${620 - 260})"><rect width="18" height="260" fill="#f2b705"/><rect x="-120" width="260" height="14" fill="#f2b705"/><line x1="-110" y1="14" x2="-110" y2="140" stroke="#333" stroke-width="3"/></g>`;
  }
  for (let k = 0; k < 4; k++) s += `<rect x="${120 + k * 70}" y="${680 + (k % 2) * 30}" width="60" height="40" fill="#c8b48a" stroke="#8a7550"/>`;
  return s + '</svg>';
};
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  for (let i = 0; i < cenas.length; i++) {
    await p.setContent(`<body style="margin:0">${svg(cenas[i], i)}</body>`);
    await p.screenshot({ path: path.join(process.argv[2], `${i + 1}.jpg`), type: 'jpeg', quality: 72 });
    await p.screenshot({ path: path.join(process.argv[2], `${i + 1}_t.jpg`), type: 'jpeg', quality: 60, scale: 'css', clip: { x: 0, y: 0, width: 1200, height: 900 } });
  }
  await b.close();
})();
