// Gera out/sw.js depois do build: o service worker que faz o aplicativo abrir sem internet.
// A lista de arquivos e a versão do cache saem do próprio build, então cada publicação
// substitui o cache anterior por inteiro.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'out');
const arquivos = [];
(function varrer(dir) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) varrer(p);
    else if (/\.(html|js|css|png|svg|webmanifest|woff2?)$/.test(nome) && nome !== 'sw.js' && nome !== '404.html') arquivos.push(p);
  }
})(out);
const urls = arquivos.map((p) => {
  const u = `/${relative(out, p).split(sep).join('/')}`;
  return u.endsWith('/index.html') ? u.slice(0, -'index.html'.length) : u; // páginas: /dashboard/
}).sort();
const versao = createHash('sha256').update(arquivos.sort().map((p) => readFileSync(p)).reduce((h, b) => h.update(b), createHash('sha256')).digest('hex')).digest('hex').slice(0, 12);

const sw = `// GERADO por scripts/gerar-sw.mjs — não edite.
const VERSAO = '${versao}';
const CACHE_APP = 'aec-app-' + VERSAO;
const CACHE_DADOS = 'aec-dados-v1';
const ARQUIVOS = ${JSON.stringify(urls)};
// Bases de preços e composições: arquivos públicos, grandes e que mudam uma vez por mês.
const HOSTS_DE_DADOS = ['raw.githubusercontent.com', 'raydem1961.github.io'];

self.addEventListener('install', (e) => {
  // Falhar em um arquivo não pode impedir a instalação: guarda o que conseguir.
  e.waitUntil(caches.open(CACHE_APP).then((c) => Promise.allSettled(ARQUIVOS.map((u) => c.add(new Request(u, { cache: 'reload' }))))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('aec-app-') && k !== CACHE_APP).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (HOSTS_DE_DADOS.includes(url.hostname)) {
    // Responde do cache na hora e atualiza em segundo plano; sem rede, fica com o que tem.
    e.respondWith(caches.open(CACHE_DADOS).then(async (c) => {
      const guardado = await c.match(req, { ignoreVary: true });
      const rede = fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; });
      if (guardado) { rede.catch(() => {}); return guardado; }
      return rede;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return; // Firebase e demais serviços: direto na rede
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/_next/static/')) {
    // Arquivos com hash no nome nunca mudam: cache primeiro.
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then((n) => { if (n.ok) { const copia = n.clone(); caches.open(CACHE_APP).then((c) => c.put(req, copia)); } return n; })));
    return;
  }
  // Páginas e demais arquivos: rede primeiro (sempre a versão nova), cache quando não há rede.
  e.respondWith(fetch(req).then((n) => { if (n.ok) { const copia = n.clone(); caches.open(CACHE_APP).then((c) => c.put(req, copia)); } return n; })
    .catch(async () => (await caches.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? caches.match('/dashboard/') : Response.error())));
});
`;
writeFileSync(join(out, 'sw.js'), sw);
console.log(`sw.js gerado: ${urls.length} arquivos, versão ${versao}`);
