import { describe, expect, it } from 'vitest';
import { alertas, curvaAbc, serieAcumulada, verificarIntegridade } from '../src/lib/obratop/controle';

const H = '2026-06-15';
const D = {
  works: [{ id: 'w1', name: 'Obra 1' }, { id: 'w2', name: 'Obra 2' }],
  activities: [{ id: 'a1', workId: 'w1', wbs: '2', name: 'Atrasada', end: '2026-06-01', progress: 40, status: 'Em andamento' }, { id: 'a2', workId: 'w1', wbs: '2', name: 'Repetida EAP', end: '2026-07-01' }, { id: 'a3', workId: 'w1', wbs: '3', name: 'Ok', predecessors: '9', end: '2026-08-01' }],
  finance: [{ id: 'f1', workId: 'w1', type: 'Receita', description: 'Parcela', value: 1000, dueDate: '2026-06-10', status: 'Pendente' }, { id: 'f2', workId: 'w1', type: 'Despesa', description: 'Pago', value: 1, dueDate: '2026-06-01', status: 'Pago' }],
  contracts: [{ id: 'k1', workId: 'w1', number: 'CT-1', end: '2026-07-01', value: 100, status: 'Ativo' }],
  measurements: [{ id: 'm1', workId: 'w1', number: '1', contractId: 'k1', value: 120, status: 'Aprovada' }, { id: 'm2', workId: 'w1', number: '1', value: 5, status: 'Pendente' }],
  documents: [{ id: 'd1', workId: 'w1', name: 'Alvará', expiry: '2026-06-01' }],
  equipment: [{ id: 'e1', workId: 'w1', name: 'Betoneira', nextMaintenance: '2026-06-20', status: 'Operacional' }],
  inventory: [{ id: 'i1', workId: 'w1', material: 'Cimento', currentStock: 10, minStock: 50, maxStock: 200, unitValue: 40 }, { id: 'i2', workId: 'w9', material: 'Órfão', currentStock: 100, minStock: 1, maxStock: 500 }],
  orders: [], quality: [{ id: 'q1', workId: 'w1', issue: 'NC vencida', deadline: '2026-06-01', status: 'Aberta' }], suppliers: [{ id: 's1', name: 'A', cnpj: '11.222.333/0001-81' }, { id: 's2', name: 'A filial', cnpj: '11222333000181', phone: '1' }],
  staff: [], safety: [], budgets: [], dailyLogs: [],
};

describe('alertas (régua do ObraTop 3)', () => {
  const a = alertas(D as never, H);
  const t = a.map((x) => x.titulo);
  it('cobre os tipos do ObraTop 3', () => {
    for (const e of ['Atividade atrasada', 'Recebimento vencido', 'Contrato próximo do fim', 'Documento vencido', 'Manutenção próxima', 'Estoque crítico — ação imediata', 'Não conformidade vencida', 'Contrato com saldo negativo', 'Medição aguardando aprovação']) expect(t).toContain(e);
    expect(t).not.toContain('Pagamento vencido'); // pago não alerta
    expect(a[0]!.nivel).toBe('bad'); expect(a.at(-1)!.nivel).toBe('warn');
  });
  it('filtra por obra', () => { expect(alertas(D as never, H, 'w2')).toEqual([]); });
});
describe('curvas ABC e S', () => {
  it('classes A/B/C pelo acumulado', () => {
    const c = curvaAbc([{ nome: 'a', valor: 70 }, { nome: 'b', valor: 20 }, { nome: 'c', valor: 6 }, { nome: 'd', valor: 4 }, { nome: 'zero', valor: 0 }]);
    expect(c.map((x) => [x.nome, x.classe])).toEqual([['a', 'A'], ['b', 'A'], ['c', 'B'], ['d', 'C']]);
    expect(c.at(-1)!.acumulado).toBeCloseTo(1);
  });
  it('série acumulada por mês', () => { expect(serieAcumulada([{ data: '2026-02-10', valor: 5 }, { data: '2026-01-03', valor: 2 }, { data: '2026-02-01', valor: 1 }])).toEqual([{ mes: '2026-01', valor: 2, acumulado: 2 }, { mes: '2026-02', valor: 6, acumulado: 8 }]); });
});
describe('integridade', () => {
  const r = verificarIntegridade(D as never);
  it('duplicados, órfãos e EAP', () => {
    const dupMed = r.duplicados.find((x) => x.modulo === 'measurements')!;
    expect(dupMed.manter.id).toBe('m1'); expect(dupMed.repetidos.map((x) => x.id)).toEqual(['m2']);
    expect(r.duplicados.find((x) => x.modulo === 'suppliers')!.manter.id).toBe('s2'); // o mais completo fica
    expect(r.orfaos.map((x) => x.r.id)).toEqual(['i2']);
    const e = r.eap.find((x) => x.workId === 'w1')!;
    expect(e.duplicates).toBe(1); expect(e.brokenPred).toBe(1); expect(e.changes.length).toBe(3); // raízes 2,3 → 1,2
  });
});
