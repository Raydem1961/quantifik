/**
 * Ligações entre módulos, iguais às do ObraTop 3: diário → cronograma, medição/compra → financeiro,
 * compra → estoque e estoque → pedido de reposição. Funções puras (a tela grava o resultado).
 */
import { measurementNet } from './vendor/calc.mjs';

type Reg = { id: string } & Record<string, unknown>;
const n = (v: unknown) => Number(v) || 0;
const hoje = () => new Date().toISOString().slice(0, 10);
const somaDias = (iso: string, d: number) => new Date(Date.parse(`${iso}T12:00:00`) + d * 86400000).toISOString().slice(0, 10);
const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

export type NivelEstoque = 'ok' | 'warn' | 'bad' | 'over' | 'planned';
export interface SituacaoEstoque { nivel: NivelEstoque; rotulo: string; prioridade: string; acao: string; reposicao: number; custoReposicao: number; pontoDePedido: number }

/** Semáforo do estoque com a mesma régua do ObraTop 3 (mínimo, segurança, ponto de pedido, máximo). */
export function situacaoEstoque(x: Reg): SituacaoEstoque {
  const atual = n(x.currentStock), min = n(x.minStock), max = n(x.maxStock), seg = n(x.safetyStock), cons = n(x.avgDailyConsumption), prazo = n(x.leadTimeDays);
  const ponto = n(x.reorderPoint) > 0 ? n(x.reorderPoint) : cons * prazo + seg;
  const alvo = max > 0 ? max : Math.max(min, ponto) * 2;
  const reposicao = Math.max(0, Math.round((alvo - atual) * 100) / 100), custo = Math.round(reposicao * n(x.unitValue) * 100) / 100;
  const semPolitica = min <= 0 && seg <= 0 && ponto <= 0;
  if (semPolitica && atual <= 0) return { nivel: 'planned', rotulo: 'SEM POLÍTICA', prioridade: 'Planejamento', acao: 'Defina mínimo e máximo', reposicao: 0, custoReposicao: 0, pontoDePedido: ponto };
  if (max > 0 && atual > max) return { nivel: 'over', rotulo: 'EXCESSO', prioridade: 'Atenção', acao: 'Suspender compras e avaliar remanejamento', reposicao: 0, custoReposicao: 0, pontoDePedido: ponto };
  if (atual <= seg || (min > 0 && atual < min)) return { nivel: 'bad', rotulo: 'CRÍTICO', prioridade: 'IMEDIATA', acao: 'Emitir pedido de compra imediatamente', reposicao, custoReposicao: custo, pontoDePedido: ponto };
  if (ponto > 0 && atual <= ponto) return { nivel: 'warn', rotulo: 'COMPRAR', prioridade: 'ALTA', acao: 'Iniciar ressuprimento', reposicao, custoReposicao: custo, pontoDePedido: ponto };
  return { nivel: 'ok', rotulo: 'NORMAL', prioridade: 'Monitorar', acao: 'Manter acompanhamento', reposicao: 0, custoReposicao: 0, pontoDePedido: ponto };
}

/** Pedido de reposição pré-preenchido para um material crítico. */
export function pedidoDeReposicao(item: Reg): Record<string, unknown> | null {
  const s = situacaoEstoque(item);
  if (!['bad', 'warn'].includes(s.nivel) || s.reposicao <= 0) return null;
  const un = String(item.unit ?? '');
  return {
    workId: item.workId, date: hoje(), dueDate: somaDias(hoje(), n(item.leadTimeDays)), inventoryId: item.id, qty: s.reposicao, value: s.custoReposicao, status: 'Solicitado',
    description: `Ressuprimento — ${String(item.material)}: ${fmt(s.reposicao)} ${un}. Estoque atual ${fmt(n(item.currentStock))} ${un}; ponto de pedido ${fmt(s.pontoDePedido)}; máximo ${fmt(n(item.maxStock))}. Prioridade ${s.prioridade}.`.slice(0, 900),
  };
}

/** Lançamento financeiro pré-preenchido a partir de uma medição (receita) ou de um pedido (despesa). */
export function lancamentoDe(tipo: 'measurement' | 'order', src: Reg): Record<string, unknown> {
  if (tipo === 'measurement') return {
    workId: src.workId, date: hoje(), description: `Medição ${String(src.number ?? '')} — ${String(src.description ?? '')}`.slice(0, 180), type: 'Receita', category: 'Medição',
    value: measurementNet(src).net || n(src.value), status: src.status === 'Paga' ? 'Recebido' : src.status === 'Faturada' ? 'Pendente' : 'Previsto',
    paymentDate: src.status === 'Paga' ? hoje() : '', measurementId: src.id, contractId: src.contractId ?? '',
  };
  return { workId: src.workId, date: hoje(), dueDate: src.dueDate ?? '', description: `Pedido — ${String(src.description ?? '')}`.slice(0, 180), type: 'Despesa', category: 'Material', value: n(src.value), status: src.status === 'Entregue' ? 'Pendente' : 'Previsto', orderId: src.id };
}

/** Avanço do diário aplicado à atividade (null = não há o que aplicar). */
export function avancoDoDiario(log: Reg, atividade: Reg | undefined): { de: number; para: number; patch: Record<string, unknown> } | { erro: string } {
  if (!atividade) return { erro: 'A atividade vinculada ao diário não foi encontrada.' };
  const para = Math.min(100, Math.max(0, n(log.progressTo))), de = n(atividade.progress);
  if (para <= de) return { erro: `O avanço do diário (${fmt(para)}%) não é maior que o atual da atividade (${fmt(de)}%).` };
  const patch: Record<string, unknown> = { progress: para, status: para >= 100 ? 'Concluída' : atividade.status === 'Não iniciada' || !atividade.status ? 'Em andamento' : atividade.status };
  if (atividade.progressMode === 'Quantidade' && n(atividade.plannedQty) > 0) patch.actualQty = Math.round(n(atividade.plannedQty) * para) / 100;
  return { de, para, patch };
}
