/**
 * Orçamento analítico: quantitativos importados × composições de preços unitários
 * (SINAPI, SICRO, ORSE). TypeScript puro.
 *
 * O elo entre um item de quantitativo e uma composição é um VÍNCULO. Vínculos confirmados
 * pelo orçamentista são guardados por tenant e reaplicados automaticamente a cada nova
 * importação ou revisão — é isso que torna o orçamento automático e em tempo real sem
 * abrir mão da responsabilidade técnica sobre a escolha da composição.
 */
import { arredondar, calcularBdi, type BdiParams } from '../cub/engine';
import { gerarCurvaAbc, type ItemAbc } from '../cub/schedule';
import { normalizarUnidade, type ItemQuantitativo } from '../import/modelo';
import { DISCIPLINAS, type Disciplina } from '../types';

/** Linha de uma base publicada (formato do repositório de bases oficiais). */
export interface LinhaBase {
  code: string;
  description: string;
  unit: string;
  price: number;
  group?: string;
  sheet?: string;
}

export interface BasePrecos {
  meta: { id: string; source: string; uf: string; reference: string; regime?: string };
  rows: LinhaBase[];
}

export interface Vinculo {
  /** Fonte da base (SINAPI, SICRO3, ORSE-SE): o código só vale dentro da mesma fonte. */
  fonte: string;
  codigo: string;
  /** Multiplicador de conversão entre a unidade do item e a da composição (ex.: ha → m² = 10000). */
  fator: number;
  /** `sugerido` = proposto pelo sistema, ainda não validado por um orçamentista. */
  estado: 'confirmado' | 'sugerido';
}

const PARADAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'com', 'a', 'o', 'por', 'na', 'no', 'ao', 'ou', 'un', 'tipo', 'inclusive', 'incl', 'exclusive', 'af']);
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Palavras significativas + números (diâmetros, espessuras) de uma descrição. */
export function tokenizar(texto: string): string[] {
  return (semAcento(texto).replace(/(\d),(\d)/g, '$1.$2').match(/[a-z]{2,}|\d+(?:\.\d+)?/g) ?? [])
    .filter((t) => !PARADAS.has(t))
    .map((t) => (/^[a-z]/.test(t) && t.length > 4 ? t.replace(/(oes|aes|is|s)$/, '') : t)); // plural simples
}

export interface IndiceBase {
  base: BasePrecos;
  porCodigo: Map<string, LinhaBase>;
  /** token → índices das linhas que o contêm. */
  invertido: Map<string, number[]>;
  tokens: string[][];
}

export function indexarBase(base: BasePrecos): IndiceBase {
  const porCodigo = new Map<string, LinhaBase>();
  const invertido = new Map<string, number[]>();
  const tokens: string[][] = [];
  base.rows.forEach((linha, i) => {
    porCodigo.set(String(linha.code), linha);
    const ts = [...new Set(tokenizar(linha.description))];
    tokens.push(ts);
    for (const t of ts) {
      const lista = invertido.get(t);
      if (lista) lista.push(i);
      else invertido.set(t, [i]);
    }
  });
  return { base, porCodigo, invertido, tokens };
}

export interface Candidato {
  linha: LinhaBase;
  /** 0..1 — fração (ponderada pela raridade) dos termos da consulta encontrados. */
  pontuacao: number;
  unidadeCompativel: boolean;
}

/**
 * Busca composições por texto. Termos raros na base pesam mais (IDF); números da consulta
 * (DN 150, 20 MPa…) são tratados como obrigatórios: uma composição de DN 200 nunca é
 * sugerida para um tubo DN 150.
 */
export function buscarComposicoes(indice: IndiceBase, consulta: string, unidade?: string, limite = 8): Candidato[] {
  const termos = [...new Set(tokenizar(consulta))];
  if (termos.length === 0) return [];
  const n = indice.base.rows.length;
  const peso = (t: string) => Math.log(1 + n / ((indice.invertido.get(t)?.length ?? 0) + 1));
  const total = termos.reduce((s, t) => s + peso(t), 0);
  const numeros = termos.filter((t) => /^\d/.test(t));
  const pontos = new Map<number, number>();
  for (const t of termos) {
    for (const i of indice.invertido.get(t) ?? []) pontos.set(i, (pontos.get(i) ?? 0) + peso(t));
  }
  const alvo = unidade ? normalizarUnidade(unidade) : undefined;
  const candidatos: Candidato[] = [];
  for (const [i, p] of pontos) {
    const linha = indice.base.rows[i]!;
    if (!(linha.price > 0)) continue;
    const ts = indice.tokens[i]!;
    if (numeros.some((num) => !ts.includes(num))) continue;
    const unidadeCompativel = !alvo || normalizarUnidade(linha.unit) === alvo;
    // Descrições longas e específicas diluem a aderência: leve penalização por termos sobrando.
    const sobra = Math.max(0, ts.length - termos.length);
    candidatos.push({ linha, unidadeCompativel, pontuacao: (p / total) * (unidadeCompativel ? 1 : 0.6) / (1 + sobra * 0.01) });
  }
  return candidatos.sort((a, b) => b.pontuacao - a.pontuacao || a.linha.description.length - b.linha.description.length).slice(0, limite);
}

/** Chave estável do vínculo: mesma descrição + unidade → mesma composição em qualquer projeto. */
export const chaveVinculo = (item: Pick<ItemQuantitativo, 'descricao' | 'unidade'>) =>
  `${tokenizar(item.descricao).join(' ')}|${normalizarUnidade(item.unidade)}`;

/**
 * Pontuação mínima para o sistema propor um vínculo sozinho. Uma sugestão é só uma proposta:
 * descrições parecidas escondem serviços diferentes (tubo predial × rede coletora, fornecimento ×
 * assentamento), então ela NÃO entra no total até um orçamentista confirmar.
 */
export const LIMIAR_SUGESTAO = 0.72;

/**
 * Resolve o vínculo de cada item, nesta ordem:
 *  1. vínculo salvo do tenant (confirmado antes) para a mesma fonte;
 *  2. código de composição vindo da própria planilha de origem;
 *  3. sugestão automática por texto, se a aderência for alta e a unidade bater.
 */
export function resolverVinculos(
  itens: ItemQuantitativo[],
  indice: IndiceBase,
  salvos: Record<string, Vinculo>,
): Record<string, Vinculo> {
  const fonte = indice.base.meta.source;
  const resultado: Record<string, Vinculo> = {};
  for (const item of itens) {
    const salvo = salvos[chaveVinculo(item)];
    if (salvo && salvo.fonte === fonte && indice.porCodigo.has(salvo.codigo)) {
      resultado[item.id] = salvo;
      continue;
    }
    if (item.codigo && indice.porCodigo.has(item.codigo)) {
      resultado[item.id] = { fonte, codigo: item.codigo, fator: 1, estado: 'confirmado' };
      continue;
    }
    const melhor = buscarComposicoes(indice, item.descricao, item.unidade, 1)[0];
    if (melhor && melhor.unidadeCompativel && melhor.pontuacao >= LIMIAR_SUGESTAO) {
      resultado[item.id] = { fonte, codigo: String(melhor.linha.code), fator: 1, estado: 'sugerido' };
    }
  }
  return resultado;
}

export interface LinhaOrcamento {
  item: ItemQuantitativo;
  vinculo?: Vinculo;
  composicao?: LinhaBase;
  precoUnitario: number;
  total: number;
  estado: 'confirmado' | 'sugerido' | 'pendente';
  /** A unidade do item difere da unidade da composição e o fator ainda é 1. */
  unidadeDivergente: boolean;
}

export interface OrcamentoAnalitico {
  base: BasePrecos['meta'];
  linhas: LinhaOrcamento[];
  porDisciplina: { disciplina: Disciplina; total: number; itens: number }[];
  custoDireto: number;
  /** Valor das sugestões ainda não confirmadas — fica FORA do custo direto. */
  custoSugerido: number;
  bdiPercentual: number;
  valorBdi: number;
  precoVenda: number;
  itensPendentes: number;
  /** Fração dos itens com vínculo confirmado (0..1). */
  cobertura: number;
  abc: ItemAbc[];
}

export function calcularOrcamentoAnalitico(
  itens: ItemQuantitativo[],
  vinculos: Record<string, Vinculo>,
  indice: IndiceBase,
  bdi: number | BdiParams,
): OrcamentoAnalitico {
  const bdiPercentual = typeof bdi === 'number' ? bdi : calcularBdi(bdi);
  if (!Number.isFinite(bdiPercentual) || bdiPercentual < 0) throw new RangeError('BDI inválido.');

  const linhas: LinhaOrcamento[] = itens.map((item) => {
    const vinculo = vinculos[item.id];
    const composicao = vinculo ? indice.porCodigo.get(vinculo.codigo) : undefined;
    if (!vinculo || !composicao) return { item, precoUnitario: 0, total: 0, estado: 'pendente', unidadeDivergente: false };
    const fator = vinculo.fator > 0 ? vinculo.fator : 1;
    return {
      item, vinculo, composicao,
      precoUnitario: composicao.price,
      total: item.quantidade * fator * composicao.price,
      estado: vinculo.estado,
      unidadeDivergente: fator === 1 && normalizarUnidade(composicao.unit) !== normalizarUnidade(item.unidade),
    };
  });

  // Só vínculos confirmados formam o preço; sugestões são mostradas à parte.
  const custoDireto = linhas.filter((l) => l.estado === 'confirmado').reduce((s, l) => s + l.total, 0);
  const custoSugerido = linhas.filter((l) => l.estado === 'sugerido').reduce((s, l) => s + l.total, 0);
  const pendentes = linhas.filter((l) => l.estado !== 'confirmado').length;
  const porDisciplina = DISCIPLINAS.map((disciplina) => {
    const doGrupo = linhas.filter((l) => l.item.disciplina === disciplina);
    return { disciplina, total: arredondar(doGrupo.filter((l) => l.estado === 'confirmado').reduce((s, l) => s + l.total, 0)), itens: doGrupo.length };
  }).filter((d) => d.itens > 0);

  return {
    base: indice.base.meta,
    linhas: linhas.map((l) => ({ ...l, total: arredondar(l.total) })),
    porDisciplina,
    custoDireto: arredondar(custoDireto),
    custoSugerido: arredondar(custoSugerido),
    bdiPercentual,
    valorBdi: arredondar(custoDireto * bdiPercentual),
    precoVenda: arredondar(custoDireto * (1 + bdiPercentual)),
    itensPendentes: pendentes,
    cobertura: linhas.length ? (linhas.length - pendentes) / linhas.length : 0,
    abc: gerarCurvaAbc(linhas.filter((l) => l.total > 0 && l.estado === 'confirmado').map((l) => ({ descricao: l.item.descricao, valor: l.total }))),
  };
}
