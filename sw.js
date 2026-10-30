/* QUANTIFIK v1.1: funciona offline depois da primeira abertura */
const CACHE = "quantifik-2026-09";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./xlsx.full.min.js", "./jszip.min.js", "./jspdf.umd.min.js", "./jspdf.plugin.autotable.min.js",
  "./icon-192.png", "./icon-512.png", "./maskable-512.png", "./apple-touch-icon.png", "./favicon-48.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
function save(cache, req, r){ if (r && r.status === 200) cache.put(req, r.clone()).catch(() => {}); return r; }
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    /* a página: tenta a rede por até 4 s (assim as atualizações chegam na hora) e cai para o cache se estiver sem sinal */
    if (req.mode === "navigate"){
      try{
        const r = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(rej, 4000))]);
        if (r && r.ok){ cache.put("./index.html", r.clone()).catch(() => {}); return r; }
      }catch(err){}
      return (await cache.match("./index.html")) || (await cache.match("./")) || Response.error();
    }
    /* demais arquivos: cache primeiro, atualiza em segundo plano */
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then(r => save(cache, req, r)).catch(() => null);
    if (hit){ e.waitUntil(net); return hit; }
    return (await net) || Response.error();
  }));
});
