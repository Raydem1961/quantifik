/**
 * Pontes entre os três aplicativos reunidos:
 *   cotação (Quantifik) ou orçamento analítico (BIM/CAD) → orçamento da obra (ObraTop)
 *   orçamento da obra → cronograma (algoritmo original do ObraTop, `scheduleBudget`)
 *
 * Os ids gerados são determinísticos: reenviar a mesma cotação ou gerar o cronograma de novo
 * ATUALIZA os mesmos registros em vez de duplicar.
 */
import { CATEGORIA_LABEL, categoriaDe, unitPretty, type Cotacao, type CotacaoCalculada } from '../composicoes/motor';
import { scheduleBudget } from './vendor/orcamento.mjs';

export type Reg = { id: string } & Record<string, unknown>;

/** Item de composição no formato do orçamento do ObraTop. */
export interface ItemComposicaoObra { kind: 'Material' | 'Mão de obra' | 'Equipamento' | 'Outros'; code: string; description: string; unit: string; coef: number; price: number }
const TIPO: Record<string, ItemComposicaoObra['kind']> = { mo: 'Mão de obra', mat: 'Material', eqp: 'Equipamento', srv: 'Outros', aux: 'Outros' };
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const r2 = (v: number) => Math.round(v * 100) / 100;
const idSeguro = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 120);

/**
 * Cada serviço da cotação vira um item do orçamento da obra, com o custo unitário (sem BDI), o
 * BDI da cotação e a composição de insumos — é dela que saem as horas de mão de obra usadas
 * para dimensionar as durações do cronograma.
 */
export function cotacaoParaOrcamento(cotacao: Cotacao, calculo: CotacaoCalculada, workId: string): Reg[] {
  return calculo.itens.filter((r) => !r.falta && r.item.qtd > 0).map((r) => {
    const composition: ItemComposicaoObra[] = r.linhas.map((l) => ({
      kind: TIPO[l.t] ?? 'Outros', code: l.cod, description: l.desc, unit: /^h(ora)?s?$/i.test(l.un) ? 'h' : unitPretty(l.un), coef: r4(l.total / r.item.qtd), price: r2(l.p),
    }));
    return {
      id: idSeguro(`cot-${cotacao.id}-${r.item.id}`), workId,
      category: CATEGORIA_LABEL[categoriaDe({ grupo: '', descricao: r.item.descricao })] ?? 'Outros',
      description: r.item.descricao, unit: unitPretty(r.item.unidade), qty: r.item.qtd, unitValue: r2(r.custo / r.item.qtd), bdi: cotacao.bdi,
      composition, source: `Cotação ${cotacao.numero}`, sourceCode: `${r.item.base.toUpperCase()} ${r.item.cod}`, cotacaoId: cotacao.id,
    };
  });
}

export interface LinhaAnalitica { id: string; descricao: string; disciplina: string; unidade: string; quantidade: number; codigo: string; precoUnitario: number }

/** Linhas confirmadas do orçamento analítico (BIM/CAD × SINAPI/SICRO/ORSE) → orçamento da obra. */
export function analiticoParaOrcamento(linhas: LinhaAnalitica[], workId: string, bdiPercentual: number, base: string): Reg[] {
  return linhas.filter((l) => l.quantidade > 0 && l.precoUnitario > 0).map((l) => ({
    id: idSeguro(`qto-${l.id}`), workId, category: l.disciplina, description: l.descricao, unit: unitPretty(l.unidade), qty: l.quantidade,
    unitValue: r2(l.precoUnitario), bdi: bdiPercentual, composition: [], source: `Orçamento analítico (${base})`, sourceCode: l.codigo,
  }));
}

export interface CronogramaGerado {
  atividades: Reg[];
  /** O prazo pedido comporta as durações mínimas (1 dia útil por serviço)? */
  cabe: boolean;
  diasUteis: number;
  diasUteisDoPrazo: number;
  /** Quantos serviços tiveram a duração calculada pelas horas de mão de obra (os demais, pelo custo). */
  porHoras: number;
}

/**
 * Gera o cronograma de uma obra a partir do seu orçamento. As categorias do orçamento viram
 * as etapas (na ordem em que aparecem); cada item vira uma atividade ligada ao item do
 * orçamento, de modo que o avanço ponderado passa a usar o custo como peso.
 * `existentes` são as atividades atuais: avanço, quantidade executada e status já lançados
 * são preservados quando o cronograma é gerado de novo.
 */
export function cronogramaDoOrcamento(orcamentos: Reg[], workId: string, prazo: { start: string; end: string }, existentes: Reg[] = []): CronogramaGerado {
  const itens = orcamentos.filter((b) => b.workId === workId && !b.deleted && Number(b.qty) > 0);
  if (!itens.length) throw new Error('A obra não tem itens de orçamento com quantidade.');
  if (!prazo.start || !prazo.end || prazo.end <= prazo.start) throw new Error('Informe início e término da obra (o término deve ser posterior ao início).');
  const categorias = [...new Set(itens.map((b) => String(b.category || 'Geral')))];
  const etapas = categorias.map((c) => ({ id: c }));
  const paraAgendar = itens.map((b) => ({ id: b.id, etapaId: String(b.category || 'Geral'), qty: Number(b.qty), price: Number(b.unitValue) || 0, composition: Array.isArray(b.composition) ? b.composition : [] }));
  const plano = scheduleBudget(etapas, paraAgendar, prazo);
  const anteriores = new Map(existentes.map((a) => [a.id, a]));
  const porEtapa = new Map<string, number>();
  const atividades = plano.tasks.map((t): Reg => {
    const b = itens.find((x) => x.id === t.id)!;
    const ei = categorias.indexOf(t.etapaId) + 1;
    const n = (porEtapa.get(t.etapaId) ?? 0) + 1;
    porEtapa.set(t.etapaId, n);
    const id = idSeguro(`orc-${b.id}`);
    const antes = anteriores.get(id);
    return {
      id, workId, wbs: `${ei}.${n}`, name: String(b.description ?? '').slice(0, 150), start: t.start, end: t.end, durationDays: t.days,
      progressMode: 'Quantidade', progress: Number(antes?.progress) || 0, plannedQty: Number(b.qty), actualQty: Number(antes?.actualQty) || 0, unit: String(b.unit ?? ''),
      predecessors: String(antes?.predecessors ?? ''), responsible: String(antes?.responsible ?? ''), budgetId: b.id,
      status: String(antes?.status ?? 'Não iniciada'), eapPhase: String(ei), eapPhaseName: t.etapaId.slice(0, 100), crew: t.crew, laborHours: t.hours, source: 'Orçamento',
    };
  });
  return { atividades, cabe: plano.fits, diasUteis: plano.workdays, diasUteisDoPrazo: plano.target, porHoras: plano.tasks.filter((t) => t.hours > 0).length };
}
