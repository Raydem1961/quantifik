/**
 * Fontes das composições analíticas.
 *
 *  • SINAPI-BA: os dados do robô mensal do Quantifik, copiados para public/bases/sinapi-ba.json.gz
 *    por `npm run bases:atualizar` (aceita também o index.html do Quantifik, bloco "embedded-data").
 *  • ORSE-SE: a base analítica do catálogo, também copiada para public/bases.
 * Tudo é servido pelo próprio ObraTop 4: nenhum outro repositório precisa estar no ar.
 */
import type { BaseComposicoes, Composicao, ItemComposicao, Regime, TipoInsumo } from './motor';

export const URL_QUANTIFIK = process.env.NEXT_PUBLIC_QUANTIFIK_DATA_URL ?? '/bases/sinapi-ba.json.gz';
const absoluta = (url: string) => new URL(url, typeof window !== 'undefined' ? window.location.href : 'http://localhost/').toString();

/** Formato compacto gravado pelo robô: dicionário de insumos + composições por índice. */
interface Embutido {
  bases?: { sinapi?: { meta?: { nome?: string }; dict?: [string, string, string, TipoInsumo][]; comps?: [string, string, string, string, [number, number][], number?, number?][] } };
  precos?: {
    ref?: string;
    sd?: Record<string, number>; cd?: Record<string, number>;
    rec?: { sd?: Record<string, number>; cd?: Record<string, number> };
    enc?: { sd?: { horista?: number }; cd?: { horista?: number } };
  };
}

const paraMapa = (o: Record<string, number> | undefined) => new Map(Object.entries(o ?? {}).map(([k, v]) => [String(k), Number(v)]));

/** Extrai o JSON embutido do HTML do Quantifik. */
export function extrairEmbutido(html: string): Embutido {
  const m = /<script[^>]*id=["']embedded-data["'][^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('Os dados do SINAPI não foram encontrados no arquivo do Quantifik (bloco "embedded-data").');
  try {
    return JSON.parse(m[1]!) as Embutido;
  } catch {
    throw new Error('Os dados do SINAPI no arquivo do Quantifik estão corrompidos.');
  }
}

export function decodificarSinapi(e: Embutido): BaseComposicoes {
  const b = e.bases?.sinapi;
  if (!b?.comps?.length || !b.dict) throw new Error('O arquivo do Quantifik não traz a base SINAPI.');
  const dict = b.dict;
  const comps: Composicao[] = b.comps.map((c) => {
    const bruto = c[4];
    let cache: ItemComposicao[] | null = null;
    const o = { codigo: String(c[0]), descricao: c[1], unidade: c[2], grupo: c[3] ?? '', cs: c[5] || 0, cc: c[6] || 0 } as Composicao;
    // Os itens são montados só quando o serviço é aberto: são 10 mil composições.
    Object.defineProperty(o, 'itens', {
      enumerable: true,
      get(): ItemComposicao[] {
        cache ??= bruto.map(([i, coef]) => {
          const d = dict[i]!;
          // No dicionário o código vem prefixado: "C" = composição, "I" = insumo.
          return { t: d[3], cod: d[0].slice(1), c: d[0][0] === 'C' ? 1 : 0, desc: d[1], un: d[2], coef, preco: 0 };
        });
        return cache;
      },
    });
    return o;
  });
  const enc = e.precos?.enc;
  const horista = (r: Regime) => (enc?.[r]?.horista && enc[r]!.horista! > 0 ? enc[r]!.horista! : undefined);
  const sd = horista('sd'), cd = horista('cd');
  return {
    id: 'sinapi',
    nome: b.meta?.nome ?? 'SINAPI · composições analíticas',
    ref: e.precos?.ref,
    comps,
    porCodigo: new Map(comps.filter((c) => c.codigo !== '').map((c) => [c.codigo, c])),
    precos: { sd: paraMapa(e.precos?.sd), cd: paraMapa(e.precos?.cd) },
    derivados: { sd: paraMapa(e.precos?.rec?.sd), cd: paraMapa(e.precos?.rec?.cd) },
    encargosHorista: sd && cd ? { sd, cd } : undefined,
  };
}

// ───────────────────────────── ORSE ─────────────────────────────

interface LinhaOrse { code: string | number; description: string; unit: string; price: number; sheet?: string; group?: string }
/** [éComposição, código, coeficiente, tipo, preço unitário, descrição?, unidade?] */
type ItemOrse = [0 | 1, string, number, string, number, string?, string?];

const TIPO_ORSE: Record<string, TipoInsumo> = { MO: 'mo', MAT: 'mat', EQ: 'eqp', COMP: 'aux', OUT: 'srv' };

/**
 * Junta a base ORSE (descrições e preços) com a analítica (itens de cada composição).
 * No ORSE o mesmo número pode ser um insumo e uma composição: por isso os dois são indexados
 * separadamente, e o primeiro campo do item diz em qual procurar.
 */
export function montarOrse(linhas: LinhaOrse[], analitico: Record<string, ItemOrse[]>, meta: { reference?: string } = {}): BaseComposicoes {
  const insumos = new Map<string, LinhaOrse>();
  const servicos = new Map<string, LinhaOrse>();
  for (const l of linhas) (l.sheet === 'Insumos' ? insumos : servicos).set(String(l.code), l);
  const comps: Composicao[] = [];
  for (const [codigo, itensBrutos] of Object.entries(analitico)) {
    const s = servicos.get(codigo);
    if (!s) continue;
    const itens: ItemComposicao[] = itensBrutos.map((it) => {
      const [ehComp, cod, coef, tipo, preco, descInline, unInline] = it;
      const ref = ehComp ? servicos.get(String(cod)) : insumos.get(String(cod));
      return {
        t: TIPO_ORSE[tipo] ?? 'mat', cod: String(cod), c: ehComp ? 1 : 0,
        desc: descInline ?? ref?.description ?? `Item ${cod}`, un: unInline ?? ref?.unit ?? '', coef, preco: preco || 0,
      };
    });
    comps.push({ codigo, descricao: s.description, unidade: s.unit, grupo: s.group ?? '', cs: s.price || 0, cc: s.price || 0, itens });
  }
  if (comps.length === 0) throw new Error('A base ORSE analítica não tem composições reconhecidas.');
  return { id: 'orse', nome: `ORSE-SE${meta.reference ? ` ${meta.reference.split('-').reverse().join('/')}` : ''} · composições analíticas`, ref: meta.reference, comps, porCodigo: new Map(comps.map((c) => [c.codigo, c])) };
}

// ───────────────────────────── download ─────────────────────────────

const cache = new Map<string, Promise<BaseComposicoes>>();
function memo(chave: string, fn: () => Promise<BaseComposicoes>): Promise<BaseComposicoes> {
  const existente = cache.get(chave);
  if (existente) return existente;
  const p = fn();
  cache.set(chave, p);
  p.catch(() => cache.delete(chave)); // falha não fica em cache: permite tentar de novo
  return p;
}

export function carregarSinapi(url = URL_QUANTIFIK): Promise<BaseComposicoes> {
  return memo(`sinapi|${url}`, async () => {
    if (/\.json(\.gz)?$/.test(url)) return decodificarSinapi(await baixarJson<Embutido>(absoluta(url)));
    const r = await fetch(absoluta(url), { cache: 'no-cache' });
    if (!r.ok) throw new Error(`Base SINAPI indisponível (HTTP ${r.status}).`);
    return decodificarSinapi(extrairEmbutido(await r.text()));
  });
}

async function baixarJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error(`Arquivo de base indisponível (HTTP ${r.status}).`);
  const fluxo = url.endsWith('.gz') ? r.body.pipeThrough(new DecompressionStream('gzip')) : r.body;
  return (await new Response(fluxo).json()) as T;
}

/** Carrega o ORSE a partir do catálogo de bases: usa o mês mais recente que tenha a variante analítica. */
export function carregarOrse(urlCatalogo: string): Promise<BaseComposicoes> {
  return memo(`orse|${urlCatalogo}`, async () => {
    urlCatalogo = absoluta(urlCatalogo);
    const rc = await fetch(urlCatalogo, { cache: 'no-cache' });
    if (!rc.ok) throw new Error(`Catálogo de bases indisponível (HTTP ${rc.status}).`);
    const cat = (await rc.json()) as { bases?: { id: string; source: string; reference: string; file: string; status: string }[] };
    const entrada = (cat.bases ?? []).filter((b) => b.status === 'ready' && b.source.startsWith('ORSE') && !b.file.includes('.analitico.'))
      .sort((a, b) => b.reference.localeCompare(a.reference))[0];
    if (!entrada) throw new Error('O catálogo não tem base ORSE pronta.');
    const urlBase = new URL(entrada.file, urlCatalogo).toString();
    const urlAnalitico = urlBase.replace(/\.json(\.gz)?$/, '.analitico.json$1');
    const [base, analitico] = await Promise.all([
      baixarJson<{ rows: LinhaOrse[] }>(urlBase),
      baixarJson<Record<string, ItemOrse[]>>(urlAnalitico),
    ]);
    return montarOrse(base.rows, analitico, { reference: entrada.reference });
  });
}
