import { describe, expect, it } from 'vitest';
import { calcularCotacao, parametrosPadrao, type BaseComposicoes, type Composicao, type Cotacao } from '@/lib/composicoes/motor';
import { analiticoParaOrcamento, cotacaoParaOrcamento, cronogramaDoOrcamento } from '@/lib/obratop/integracao';
import { budgetSale, weightedProgress } from '@/lib/obratop/vendor/calc.mjs';

const comp = (codigo: string, descricao: string, unidade: string, itens: Composicao['itens']): Composicao => ({ codigo, descricao, unidade, grupo: '', cs: 0, cc: 0, itens });
const alvenaria = comp('A1', 'ALVENARIA DE VEDAÇÃO DE BLOCOS', 'M2', [
  { t: 'mo', cod: '', c: 0, desc: 'PEDREIRO', un: 'H', coef: 0.8, preco: 0 },
  { t: 'mat', cod: 'B', c: 0, desc: 'BLOCO CERAMICO', un: 'UN', coef: 13, preco: 2 },
]);
const pintura = comp('P1', 'PINTURA LATEX DUAS DEMAOS', 'M2', [
  { t: 'mo', cod: '', c: 0, desc: 'PINTOR', un: 'H', coef: 0.2, preco: 0 },
  { t: 'mat', cod: 'T', c: 0, desc: 'TINTA LATEX', un: 'L', coef: 0.3, preco: 20 },
]);
const base: BaseComposicoes = { id: 'x', nome: 'T', comps: [alvenaria, pintura], porCodigo: new Map([['A1', alvenaria], ['P1', pintura]]) };
const cotacao: Cotacao = { id: 'c1', numero: '004/2026', cliente: '', obra: '', responsavel: '', data: '2026-01-01', validadeDias: 30, bdi: 25, observacoes: '', detalhar: true, itens: [
  { id: 'i1', base: 'x', cod: 'A1', descricao: alvenaria.descricao, unidade: 'M2', qtd: 500, medidas: '' },
  { id: 'i2', base: 'x', cod: 'P1', descricao: pintura.descricao, unidade: 'M2', qtd: 1000, medidas: '' },
  { id: 'i3', base: 'x', cod: 'SUMIU', descricao: 'Serviço que saiu da base', unidade: 'UN', qtd: 1, medidas: '' },
] };
const p = parametrosPadrao();
const calculo = calcularCotacao(cotacao, { x: base }, p);

describe('cotação → orçamento da obra', () => {
  const itens = cotacaoParaOrcamento(cotacao, calculo, 'w1');
  it('um item por serviço encontrado, com custo sem BDI, BDI e composição', () => {
    expect(itens.map((i) => i.id)).toEqual(['cot-c1-i1', 'cot-c1-i2']);
    const a = itens[0]!;
    expect([a.workId, a.category, a.unit, a.qty, a.bdi, a.source]).toEqual(['w1', 'Alvenaria', 'm²', 500, 25, 'Cotação 004/2026']);
    // o preço de venda do item no ObraTop reproduz o custo da cotação × (1 + BDI)
    expect(budgetSale(a)).toBeCloseTo(calculo.itens[0]!.custo * 1.25, 0);
    const mo = (a.composition as { kind: string; unit: string; coef: number }[]).find((c) => c.kind === 'Mão de obra')!;
    expect([mo.unit, mo.coef]).toEqual(['h', 0.8]);
  });
  it('reenviar gera os mesmos ids (atualiza em vez de duplicar)', () => {
    expect(cotacaoParaOrcamento(cotacao, calculo, 'w1').map((i) => i.id)).toEqual(itens.map((i) => i.id));
  });
});

describe('orçamento analítico → orçamento da obra', () => {
  it('só linhas com quantidade e preço', () => {
    const r = analiticoParaOrcamento([
      { id: 'rede|tubo dn150|m', descricao: 'Tubo DN 150', disciplina: 'Esgotamento sanitário', unidade: 'm', quantidade: 140, codigo: '41936', precoUnitario: 79.18 },
      { id: 'sem-preco', descricao: 'x', disciplina: 'y', unidade: 'un', quantidade: 1, codigo: '', precoUnitario: 0 },
    ], 'w1', 25, 'SINAPI BA 09/2026');
    expect(r).toHaveLength(1);
    expect([r[0]!.id, r[0]!.category, r[0]!.qty, r[0]!.unitValue, r[0]!.bdi]).toEqual(['qto-rede-tubo-dn150-m', 'Esgotamento sanitário', 140, 79.18, 25]);
  });
});

describe('orçamento → cronograma', () => {
  const orc = cotacaoParaOrcamento(cotacao, calculo, 'w1');
  const prazo = { start: '2026-03-02', end: '2026-06-26' };
  const g = cronogramaDoOrcamento(orc, 'w1', prazo);
  it('uma atividade por item, dentro do prazo, ligada ao orçamento', () => {
    expect(g.atividades).toHaveLength(2);
    expect(g.cabe).toBe(true);
    expect(g.porHoras).toBe(2);
    const [a, b] = g.atividades as Record<string, any>[];
    expect([a!.id, a!.wbs, a!.budgetId, a!.eapPhaseName, a!.plannedQty, a!.unit]).toEqual(['orc-cot-c1-i1', '1.1', 'cot-c1-i1', 'Alvenaria', 500, 'm²']);
    expect(b!.wbs).toBe('2.1');
    expect(a!.start >= prazo.start && b!.end <= prazo.end).toBe(true);
    // alvenaria tem 400 h de mão de obra; pintura, 200 h → a alvenaria dura mais
    expect(a!.durationDays).toBeGreaterThan(b!.durationDays);
    expect([a!.laborHours, b!.laborHours]).toEqual([400, 200]);
  });
  it('todas ligadas ao orçamento → avanço ponderado pelo custo', () => {
    const acts = g.atividades.map((a, i) => ({ ...a, progress: i === 0 ? 100 : 0 }));
    const pesoA = budgetSale(orc[0]!), pesoB = budgetSale(orc[1]!);
    expect(weightedProgress({ acts, budgets: orc, day: '2026-04-01' })).toBeCloseTo((pesoA / (pesoA + pesoB)) * 100, 6);
  });
  it('gerar de novo preserva o avanço já lançado', () => {
    const lancadas = g.atividades.map((a) => (a.id === 'orc-cot-c1-i1' ? { ...a, progress: 40, actualQty: 200, status: 'Em andamento', responsible: 'Mestre A' } : a));
    const de_novo = cronogramaDoOrcamento(orc, 'w1', { start: '2026-03-02', end: '2026-08-28' }, lancadas).atividades[0] as Record<string, any>;
    expect([de_novo.progress, de_novo.actualQty, de_novo.status, de_novo.responsible]).toEqual([40, 200, 'Em andamento', 'Mestre A']);
    expect(de_novo.end > (g.atividades[0] as Record<string, any>).end).toBe(true); // prazo maior → datas novas
  });
  it('erros claros: sem itens, prazo inválido', () => {
    expect(() => cronogramaDoOrcamento(orc, 'outra-obra', prazo)).toThrow(/não tem itens/);
    expect(() => cronogramaDoOrcamento(orc, 'w1', { start: '2026-06-01', end: '2026-05-01' })).toThrow(/término/);
    expect(() => cronogramaDoOrcamento(orc, 'w1', { start: '2026-06-01', end: '2026-06-03' })).toThrow(/5 dias úteis/);
  });
});
