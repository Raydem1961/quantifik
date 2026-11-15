const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const c = await b.newContext({ viewport: { width: 1360, height: 850 }, deviceScaleFactor: 1.5, javaScriptEnabled: false });
  const p = await c.newPage();
  // A tela de entrada como aparece com o Firebase configurado (o modo demonstração pula o login).
  await p.route('**/login/', async (r) => { const resp = await r.fetch(); let h = await resp.text(); h = h.replace('Modo demonstração — Firebase não configurado.', 'Use a conta da sua empresa.').replace(/ disabled=""/g, ''); await r.fulfill({ response: resp, body: h }); });
  await p.goto('http://localhost:4199/login/', { waitUntil: 'load' }); await p.waitForTimeout(800);
  await p.screenshot({ path: process.argv[2] + '/img/01-login.jpg', type: 'jpeg', quality: 80 }); await b.close();
})();
