/**
 * Modelo unificado de quantitativos: qualquer arquivo importado (DXF, IFC/BIM, LandXML,
 * EPANET, SWMM, pontos topográficos, planilhas) é reduzido a uma lista destes itens,
 * que alimenta o orçamento analítico por composições (SINAPI / SICRO / ORSE).
 */
import type { Disciplina } from '../types';

export type FormatoImportacao =
  | 'dxf' | 'ifc' | 'landxml' | 'civil3d' | 'epanet' | 'swmm' | 'pontos' | 'tabela';

export const FORMATO_LABEL: Record<FormatoImportacao, string> = {
  dxf: 'AutoCAD DXF',
  ifc: 'BIM (IFC)',
  landxml: 'LandXML (Civil 3D, TopoGRAPH, QGIS…)',
  civil3d: 'Volumes Civil 3D',
  epanet: 'EPANET (rede de água)',
  swmm: 'SWMM (esgoto/drenagem)',
  pontos: 'Pontos topográficos',
  tabela: 'Planilha de quantitativos',
};

/** Unidades canônicas usadas na comparação com as bases de preços. */
export type Unidade = 'un' | 'm' | 'm2' | 'm3' | 'kg' | 't' | 'ha' | 'km' | 'h' | 'l' | 'mes' | string;

export interface ItemQuantitativo {
  /** Estável entre reimportações do mesmo arquivo: permite atualizar em vez de duplicar. */
  id: string;
  arquivo: string;
  formato: FormatoImportacao;
  disciplina: Disciplina;
  grupo: string;
  descricao: string;
  unidade: Unidade;
  quantidade: number;
  /** Código de composição já presente na origem (planilhas) — vínculo direto com a base. */
  codigo?: string;
  /** Dados técnicos para conferência (diâmetro, classe IFC, camada…). */
  atributos?: Record<string, string | number>;
}

export interface ResultadoImportacao {
  arquivo: string;
  formato: FormatoImportacao;
  itens: ItemQuantitativo[];
  avisos: string[];
  /** Linha-resumo para a interface (ex.: "128 elementos · 14 tipos"). */
  resumo: string;
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** "M²", "m2", "M2 ", "METRO QUADRADO" → "m2"; "UN", "UND", "pç" → "un"… */
export function normalizarUnidade(bruta: string): Unidade {
  const u = semAcento(bruta).toLowerCase().replace(/[\s.]/g, '').replace('²', '2').replace('³', '3');
  if (/^(un|und|unid|unidade|unidades|pc|pca|peca|pecas|cj|conj|ea|pcs|ud)$/.test(u)) return 'un';
  if (/^(m|ml|metro|metros|metrolinear)$/.test(u)) return 'm';
  if (/^(m2|metroquadrado|metrosquadrados|sqm)$/.test(u)) return 'm2';
  if (/^(m3|metrocubico|metroscubicos|cum)$/.test(u)) return 'm3';
  if (/^(kg|quilo|quilos|quilograma)$/.test(u)) return 'kg';
  if (/^(t|ton|tonelada|toneladas)$/.test(u)) return 't';
  if (/^(ha|hectare|hectares)$/.test(u)) return 'ha';
  if (/^(l|lt|litro|litros)$/.test(u)) return 'l';
  if (/^(h|hr|hora|horas)$/.test(u)) return 'h';
  if (/^(mes|meses)$/.test(u)) return 'mes';
  return u;
}

export const slug = (s: string) => semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const arred = (v: number, casas = 3) => {
  const f = 10 ** casas;
  return Math.round((v + Number.EPSILON) * f) / f;
};

/** Monta um item com id determinístico (arquivo + grupo + descrição + unidade). */
export function criarItem(
  base: Omit<ItemQuantitativo, 'id' | 'quantidade'> & { quantidade: number },
): ItemQuantitativo {
  return {
    ...base,
    quantidade: arred(base.quantidade),
    id: slug(`${base.arquivo}|${base.grupo}|${base.descricao}|${base.unidade}`),
  };
}

/** Soma itens idênticos (mesmo id) — útil quando um parser emite parcelas. */
export function consolidar(itens: ItemQuantitativo[]): ItemQuantitativo[] {
  const mapa = new Map<string, ItemQuantitativo>();
  for (const i of itens) {
    const atual = mapa.get(i.id);
    if (atual) atual.quantidade = arred(atual.quantidade + i.quantidade);
    else mapa.set(i.id, { ...i });
  }
  return [...mapa.values()].filter((i) => i.quantidade > 0);
}
