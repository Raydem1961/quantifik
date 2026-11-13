/**
 * Carrega as bases oficiais de preços (SINAPI, SICRO, ORSE) publicadas como JSON compactado
 * com um catálogo (`catalog.json`). Os arquivos são públicos; nenhuma informação do projeto
 * ou do usuário é enviada — é apenas um download.
 */
import type { BasePrecos } from './analitico';

export interface EntradaCatalogo {
  id: string;
  source: string;
  uf: string;
  reference: string;
  regime?: string;
  status: string;
  count: number;
  file: string;
  url?: string;
}

export const CATALOGO_PADRAO =
  process.env.NEXT_PUBLIC_BASES_CATALOG_URL ?? 'https://raw.githubusercontent.com/Raydem1961/obratop-bases/main/docs/catalog.json';

export async function carregarCatalogo(url = CATALOGO_PADRAO): Promise<EntradaCatalogo[]> {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`Catálogo de bases indisponível (HTTP ${r.status}).`);
  const json = (await r.json()) as { bases?: EntradaCatalogo[] };
  // Só bases validadas, e sem as variantes analíticas (composição aberta), que têm outro formato.
  return (json.bases ?? []).filter((b) => b.status === 'ready' && !b.file.includes('.analitico.'));
}

/** Para cada fonte + UF + regime, mantém apenas o mês de referência mais recente. */
export function maisRecentes(catalogo: EntradaCatalogo[]): EntradaCatalogo[] {
  const mapa = new Map<string, EntradaCatalogo>();
  for (const b of catalogo) {
    const chave = `${b.source}|${b.uf}|${b.regime ?? ''}`;
    const atual = mapa.get(chave);
    if (!atual || b.reference > atual.reference) mapa.set(chave, b);
  }
  return [...mapa.values()].sort((a, b) => a.source.localeCompare(b.source) || a.uf.localeCompare(b.uf) || (a.regime ?? '').localeCompare(b.regime ?? ''));
}

const cache = new Map<string, Promise<BasePrecos>>();

export function carregarBase(entrada: EntradaCatalogo, urlCatalogo = CATALOGO_PADRAO): Promise<BasePrecos> {
  const existente = cache.get(entrada.id);
  if (existente) return existente;
  const promessa = (async () => {
    // O caminho relativo ao catálogo tem prioridade: permite espelhar as bases em outro host.
    const url = new URL(entrada.file, urlCatalogo).toString();
    const r = await fetch(url);
    if (!r.ok || !r.body) throw new Error(`Base ${entrada.id} indisponível (HTTP ${r.status}).`);
    // O servidor entrega o .gz como binário, sem Content-Encoding: descompacta aqui.
    const fluxo = url.endsWith('.gz') ? r.body.pipeThrough(new DecompressionStream('gzip')) : r.body;
    const base = (await new Response(fluxo).json()) as BasePrecos;
    if (!Array.isArray(base.rows) || base.rows.length === 0) throw new Error(`Base ${entrada.id} vazia ou em formato inesperado.`);
    return { meta: { id: entrada.id, source: entrada.source, uf: entrada.uf, reference: entrada.reference, regime: entrada.regime }, rows: base.rows };
  })();
  cache.set(entrada.id, promessa);
  promessa.catch(() => cache.delete(entrada.id)); // falha não fica em cache: permite tentar de novo
  return promessa;
}
