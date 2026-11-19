import { describe, expect, it } from 'vitest';
import { avancoDoDiario, lancamentoDe, pedidoDeReposicao, situacaoEstoque } from '../src/lib/obratop/fluxos';

describe('ligações entre módulos (ObraTop 3)', () => {
  it('semáforo do estoque', () => {
    expect(situacaoEstoque({ id: 'a', currentStock: 40, minStock: 60, maxStock: 300 }).nivel).toBe('bad');
    expect(situacaoEstoque({ id: 'a', currentStock: 80, minStock: 60, maxStock: 300, avgDailyConsumption: 12, leadTimeDays: 5, safetyStock: 30 }).nivel).toBe('warn'); // ponto = 90
    expect(situacaoEstoque({ id: 'a', currentStock: 200, minStock: 60, maxStock: 300 }).nivel).toBe('ok');
    expect(situacaoEstoque({ id: 'a', currentStock: 400, minStock: 60, maxStock: 300 }).nivel).toBe('over');
    expect(situacaoEstoque({ id: 'a', currentStock: 0 }).nivel).toBe('planned');
  });
  it('pedido de reposição completa até o máximo, com custo', () => {
    const p = pedidoDeReposicao({ id: 'i1', workId: 'w1', material: 'Cimento', unit: 'sc', currentStock: 40, minStock: 60, maxStock: 300, unitValue: 38, leadTimeDays: 3 });
    expect(p).toMatchObject({ workId: 'w1', inventoryId: 'i1', qty: 260, value: 9880, status: 'Solicitado' });
    expect(String(p!.description)).toContain('Cimento');
    expect(pedidoDeReposicao({ id: 'i2', currentStock: 200, minStock: 60, maxStock: 300 })).toBeNull();
  });
  it('lançamento a partir de medição (líquido) e de pedido', () => {
    const m = lancamentoDe('measurement', { id: 'm1', workId: 'w1', number: '2', description: 'Estrutura', value: 100000, retention: 5, deduction: 1000, status: 'Paga', contractId: 'k1' });
    expect(m).toMatchObject({ type: 'Receita', value: 94000, status: 'Recebido', measurementId: 'm1', contractId: 'k1' });
    const o = lancamentoDe('order', { id: 'o1', workId: 'w1', description: 'Aço', value: 74200, status: 'Entregue', dueDate: '2026-12-01' });
    expect(o).toMatchObject({ type: 'Despesa', value: 74200, status: 'Pendente', orderId: 'o1', dueDate: '2026-12-01' });
  });
  it('diário aplica avanço só para frente; quantidade acompanha', () => {
    expect(avancoDoDiario({ id: 'l', progressTo: 60 }, { id: 'a', progress: 40, status: 'Em andamento' })).toMatchObject({ de: 40, para: 60, patch: { progress: 60 } });
    expect(avancoDoDiario({ id: 'l', progressTo: 100 }, { id: 'a', progress: 40, progressMode: 'Quantidade', plannedQty: 500 })).toMatchObject({ patch: { progress: 100, status: 'Concluída', actualQty: 500 } });
    expect(avancoDoDiario({ id: 'l', progressTo: 30 }, { id: 'a', progress: 40 })).toHaveProperty('erro');
    expect(avancoDoDiario({ id: 'l', progressTo: 30 }, undefined)).toHaveProperty('erro');
  });
});
