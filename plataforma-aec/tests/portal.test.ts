import { describe, expect, it } from 'vitest';
import { idPortal, mesmoConteudo, montarPortal, normalizarEmails, OPCOES_PADRAO, type DadosObra } from '../src/lib/portal';

const emp = { nome: 'Construtora X', responsavel: 'Eng. Y', registro: 'CREA 1' };
const D: DadosObra = {
  works: [{ id: 'w1', name: 'Residencial A', client: 'Cliente A', start: '2026-01-01', end: '2026-06-30', value: 600000, status: 'Em andamento' }, { id: 'w2', name: 'Outra obra', client: 'Outro', start: '2026-01-01', end: '2026-12-31', value: 9e6 }],
  activities: [
    { id: 'a1', workId: 'w1', wbs: '1', name: 'Fundações', start: '2026-01-01', end: '2026-02-28', progress: 100 },
    { id: 'a2', workId: 'w1', wbs: '2', name: 'Estrutura', start: '2026-03-01', end: '2026-04-30', progress: 40 },
    { id: 'a3', workId: 'w1', wbs: '3', name: 'Acabamento', start: '2026-05-01', end: '2026-06-30', progress: 0 },
    { id: 'a4', workId: 'w1', wbs: '0', name: 'Preliminares (atrasada)', start: '2026-01-01', end: '2026-01-31', progress: 80 },
    { id: 'ax', workId: 'w2', wbs: '1', name: 'SEGREDO DE OUTRA OBRA', start: '2026-01-01', end: '2026-12-31', progress: 5 },
    { id: 'ad', workId: 'w1', wbs: '9', name: 'Excluída', start: '2026-01-01', end: '2026-01-31', progress: 0, deleted: true },
  ],
  budgets: [{ id: 'b1', workId: 'w1', qty: 1, unitValue: 400000, bdi: 25 }],
  contracts: [{ id: 'k1', workId: 'w1', number: 'CT-1', object: 'Construção', value: 600000, addendum: 30000, addendumNote: 'Muro', status: 'Ativo' }],
  measurements: [
    { id: 'm1', workId: 'w1', date: '2026-02-28', number: '1', description: 'Fundações', physical: 30, value: 180000, retention: 5, deduction: 0, contractId: 'k1', status: 'Paga' },
    { id: 'm2', workId: 'w1', date: '2026-03-31', number: '2', description: 'Estrutura parcial', physical: 12, value: 75000, retention: 5, deduction: 1000, contractId: 'k1', status: 'Aprovada' },
    { id: 'mx', workId: 'w2', date: '2026-03-31', number: '9', description: 'OUTRA', physical: 50, value: 999999, status: 'Paga' },
  ],
  finance: [
    { id: 'f1', workId: 'w1', type: 'Receita', description: 'Parcela 1', dueDate: '2026-03-05', paymentDate: '2026-03-04', value: 171000, status: 'Recebido' },
    { id: 'f2', workId: 'w1', type: 'Receita', description: 'Parcela 2', dueDate: '2026-04-05', value: 70250, status: 'Pendente' },
    { id: 'f3', workId: 'w1', type: 'Receita', description: 'Parcela 3', dueDate: '2026-04-15', value: 50000, status: 'Previsto' },
    { id: 'f4', workId: 'w1', type: 'Receita', description: 'Parcela 4', dueDate: '2026-06-30', value: 100000, status: 'Previsto' },
    { id: 'f5', workId: 'w1', type: 'Despesa', description: 'CUSTO INTERNO AÇO', dueDate: '2026-03-10', value: 88000, status: 'Pago' },
    { id: 'fx', workId: 'w2', type: 'Receita', description: 'OUTRO CLIENTE', dueDate: '2026-03-10', value: 1, status: 'Recebido' },
  ],
  documents: [{ id: 'd1', workId: 'w1', name: 'Alvará', category: 'Licenças', status: 'Aprovado', fileUrl: 'https://x/alvara.pdf' }, { id: 'd2', workId: 'w1', name: 'Rascunho interno', status: 'Rascunho', fileUrl: 'https://x/r.pdf' }, { id: 'd3', workId: 'w1', name: 'Sem link', status: 'Aprovado' }],
  dailyLogs: [{ id: 'r1', workId: 'w1', date: '2026-04-09', weather: 'Bom', services: 'Concretagem', occurrences: 'DISCUSSÃO INTERNA', status: 'Assinado' }, { id: 'r2', workId: 'w1', date: '2026-04-10', weather: 'Bom', services: 'Rascunho', status: 'Rascunho' }],
};
const p = montarPortal('org', 'w1', D, emp, ['cliente@a.com'], { diario: true, documentos: true }, '2026-04-10', 'T');

describe('portal do cliente', () => {
  it('nada de outra obra nem de custo interno entra no painel', () => {
    const texto = JSON.stringify(p);
    for (const proibido of ['SEGREDO DE OUTRA OBRA', 'OUTRO CLIENTE', 'OUTRA', 'CUSTO INTERNO', 'DISCUSSÃO INTERNA', 'Rascunho interno', 'Excluída', '400000', 'Outra obra']) expect(texto).not.toContain(proibido);
    expect(p.obra.nome).toBe('Residencial A');
  });
  it('contrato: valor com aditivo, medido e saldo', () => {
    expect(p.contrato).toMatchObject({ numero: 'CT-1', valorOriginal: 600000, aditivos: 30000, valorAtual: 630000, medido: 255000, saldo: 375000 });
  });
  it('medições com retenção e glosa; retenção acumulada', () => {
    expect(p.medicoes.map((m) => [m.numero, m.bruto, m.retencao, m.glosa, m.liquido])).toEqual([['1', 180000, 9000, 0, 171000], ['2', 75000, 3750, 1000, 70250]]);
    expect(p.indicadores.retencaoAcumulada).toBe(12750);
  });
  it('parcelas: paga, vencida, vence em breve e a vencer; próximo vencimento', () => {
    expect(p.parcelas.map((x) => x.situacao)).toEqual(['paga', 'vencida', 'vence_em_breve', 'a_vencer']);
    expect(p.parcelas[0]!.pagoEm).toBe('2026-03-04');
    expect(p.indicadores).toMatchObject({ totalPago: 171000, totalVencido: 70250, totalAVencer: 150000 });
    expect(p.indicadores.proximoVencimento).toEqual({ data: '2026-04-05', valor: 70250, descricao: 'Parcela 2' });
  });
  it('etapas e indicadores de prazo', () => {
    expect(p.etapas.map((e) => e.situacao)).toEqual(['atrasada', 'concluida', 'em_andamento', 'a_iniciar']);
    expect(p.indicadores).toMatchObject({ etapasTotal: 4, etapasConcluidas: 1, etapasAtrasadas: 1, prazoTotalDias: 180, diasDecorridos: 99, diasRestantes: 81, terminoPrevisto: '2026-06-30' });
    expect(p.indicadores.fisicoRealizado).toBeGreaterThan(0);
    expect(p.indicadores.desvio).toBeCloseTo(p.indicadores.fisicoRealizado - p.indicadores.fisicoPrevisto, 1);
    // Atrasada em relação ao previsto → término estimado depois do contratual.
    expect(p.indicadores.idp).toBeLessThan(1);
    expect(p.indicadores.terminoEstimado > '2026-06-30').toBe(true);
  });
  it('curva S: um ponto por mês, previsto crescente até 100%, realizado só até hoje', () => {
    expect(p.curva.map((c) => c.mes)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']);
    const prev = p.curva.map((c) => c.fisicoPrevisto);
    expect([...prev].sort((a, b) => a - b)).toEqual(prev);
    expect(prev[5]).toBe(100);
    expect(p.curva[5]!.financeiroPrevisto).toBe(630000);
    expect(p.curva.map((c) => c.fisicoRealizado === null)).toEqual([false, false, false, false, true, true]);
    expect(p.curva[1]!.fisicoRealizado).toBe(30); expect(p.curva[2]!.fisicoRealizado).toBe(42);
    expect(p.curva[2]!.financeiroRealizado).toBe(255000);
    expect(p.curva[3]!.fisicoRealizado).toBe(p.indicadores.fisicoRealizado);
  });
  it('diário só assinado; documentos só aprovados com link — e só se a empresa liberar', () => {
    expect(p.diario).toEqual([{ data: '2026-04-09', clima: 'Bom', servicos: 'Concretagem' }]);
    expect(p.documentos.map((d) => d.nome)).toEqual(['Alvará']);
    const fechado = montarPortal('org', 'w1', D, emp, [], OPCOES_PADRAO, '2026-04-10', 'T');
    expect(fechado.documentos).toEqual([]);
    expect(montarPortal('org', 'w1', D, emp, [], { diario: false, documentos: false }, '2026-04-10').diario).toEqual([]);
  });
  it('obra sem cronograma nem contrato ainda gera painel coerente', () => {
    const v = montarPortal('org', 'w2', { ...D, activities: [], contracts: [], measurements: [], finance: [] }, emp, [], OPCOES_PADRAO, '2026-07-01');
    expect(v.contrato).toMatchObject({ valorAtual: 9e6, medido: 0, saldo: 9e6 });
    expect(v.indicadores).toMatchObject({ etapasTotal: 0, totalPago: 0, proximoVencimento: null, idp: 1 });
    expect(v.curva).toHaveLength(12);
    expect(v.curva[11]!.fisicoPrevisto).toBe(100);
    expect(() => montarPortal('org', 'nao-existe', D, emp, [], OPCOES_PADRAO, '2026-07-01')).toThrow(/Obra/);
  });
  it('utilitários', () => {
    expect(idPortal('o', 'w')).toBe('o_w');
    expect(normalizarEmails(' A@x.com; b@y.com, a@X.com\ninvalido ')).toEqual(['a@x.com', 'b@y.com']);
    expect(mesmoConteudo(p, { ...p, atualizadoEm: 'outra hora' })).toBe(true);
    expect(mesmoConteudo(p, { ...p, emails: [] })).toBe(false);
  });
});
