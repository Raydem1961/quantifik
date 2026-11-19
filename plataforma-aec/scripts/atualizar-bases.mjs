// Copia as bases de preços para dentro do ObraTop 4 (public/bases), para que o aplicativo não
// dependa de nenhum outro repositório para funcionar: tudo é servido pelo próprio endereço.
//
//   node scripts/atualizar-bases.mjs                      → baixa as versões mais recentes do GitHub
//   node scripts/atualizar-bases.mjs --catalogo <pasta>   → usa uma pasta local com catalog.json + bases/
//                                    --sinapi <arquivo>   → usa um index.html local do Quantifik
//
// Fontes (atualizadas pelos robôs mensais): catálogo SINAPI/SICRO/ORSE do repositório obratop-bases
// e SINAPI-BA analítico embutido no Quantifik. Rode antes de publicar para levar o mês novo.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const destino = join(raiz, 'public', 'bases');
const args = process.argv.slice(2);
const opcao = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const CATALOGO_REMOTO = 'https://raw.githubusercontent.com/Raydem1961/obratop-bases/main/docs/';
const SINAPI_REMOTO = 'https://raw.githubusercontent.com/Raydem1961/quantifik/main/index.html';

async function ler(origem, relativo) {
  if (origem.startsWith('http')) {
    const r = await fetch(new URL(relativo, origem));
    if (!r.ok) throw new Error(`Falha ao baixar ${relativo} (HTTP ${r.status}).`);
    return Buffer.from(await r.arrayBuffer());
  }
  return readFileSync(join(origem, relativo));
}

/** Extrai do index.html do Quantifik o bloco de dados do SINAPI (o mesmo que o robô regrava). */
export function extrairSinapi(html) {
  const m = /<script[^>]*id=["']embedded-data["'][^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('Bloco "embedded-data" não encontrado no arquivo do Quantifik.');
  const json = JSON.parse(m[1]);
  if (!json?.bases?.sinapi?.comps?.length) throw new Error('Os dados do SINAPI vieram vazios.');
  return json;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const origemCat = opcao('catalogo') ?? CATALOGO_REMOTO;
  const catalogo = JSON.parse((await ler(origemCat, 'catalog.json')).toString('utf8'));
  // Só o mês mais recente de cada fonte + UF + regime (é o que o aplicativo usa).
  const recentes = new Map();
  for (const b of (catalogo.bases ?? []).filter((x) => x.status === 'ready')) {
    const k = `${b.source}|${b.uf}|${b.regime ?? ''}|${b.file.includes('.analitico.') ? 'a' : ''}`;
    if (!recentes.has(k) || b.reference > recentes.get(k).reference) recentes.set(k, b);
  }
  const prontas = [...recentes.values()];
  // A variante analítica do ORSE (composição aberta) acompanha a base principal.
  const arquivos = new Set(prontas.map((b) => b.file));
  for (const f of [...arquivos]) if (f.includes('ORSE')) arquivos.add(f.replace(/\.json(\.gz)?$/, '.analitico.json$1'));
  mkdirSync(join(destino, 'bases'), { recursive: true });
  let bytes = 0;
  for (const f of arquivos) {
    try { const b = await ler(origemCat, f); writeFileSync(join(destino, f), b); bytes += b.length; } catch (e) { if (!f.includes('.analitico.')) throw e; }
  }
  // Remove bases que saíram do catálogo.
  for (const nome of readdirSync(join(destino, 'bases'))) if (!arquivos.has(`bases/${nome}`)) rmSync(join(destino, 'bases', nome));
  writeFileSync(join(destino, 'catalog.json'), JSON.stringify({ ...catalogo, bases: prontas }, null, 1));

  const html = (await ler(opcao('sinapi') ?? SINAPI_REMOTO, '')).toString('utf8');
  const sinapi = extrairSinapi(html);
  const gz = gzipSync(Buffer.from(JSON.stringify(sinapi)), { level: 9 });
  writeFileSync(join(destino, 'sinapi-ba.json.gz'), gz);

  const origem = { atualizadoEm: new Date().toISOString(), catalogo: { geradoEm: catalogo.generatedAt ?? '', bases: prontas.length }, sinapiBA: { referencia: sinapi.precos?.ref ?? '', composicoes: sinapi.bases.sinapi.comps.length } };
  writeFileSync(join(destino, 'origem.json'), JSON.stringify(origem, null, 1));
  console.log(`Bases copiadas: ${prontas.length} do catálogo (${(bytes / 1e6).toFixed(1)} MB) + SINAPI-BA ${origem.sinapiBA.referencia} (${origem.sinapiBA.composicoes} composições, ${(gz.length / 1e6).toFixed(1)} MB).`);
  if (!existsSync(join(destino, 'catalog.json'))) process.exit(1);
}
