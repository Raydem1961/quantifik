/**
 * Indicadores das áreas e central de pendências. Funções puras sobre os registros do ObraTop;
 * os cálculos de avanço, caixa e contrato são os módulos originais (vendor/calc.mjs).
 */
import { conferir, type Pessoa } from './integracoes/esocial';
import { budgetSale, cashProjection, contractBalance, incurredCost, measurementNet, schedulePerformance } from './obratop/vendor/calc.mjs';

export type Reg = { id: string; deleted?: boolean } & Record<string, unknown>;
export interface Dados {
  works: Reg[]; activities: Reg[]; budgets: Reg[]; measurements: Reg[]; finance: Reg[]; contracts: Reg[]; orders: Reg[]; inventory: Reg[];
  staff: Reg[]; equipment: Reg[]; quality: Reg[]; safety: Reg[]; documents: Reg[]; suppliers: Reg[]; dailyLogs: Reg[];
}
export const DADOS_VAZIOS: Dados = { works: [], activities: [], budgets: [], measurements: [], finance: [], contracts: [], orders: [], inventory: [], staff: [], equipment: [], quality: [], safety: [], documents: [], suppliers: [], dailyLogs: [] };

const n = (v: unknown) => Number(v) || 0;
const vivos = (l: Reg[]) => l.filter((r) => !r.deleted);
const dias = (iso: unknown, hoje: string) => (iso ? Math.round((new Date(`${String(iso).slice(0, 10)}T00:00:00`).getTime() - new Date(`${hoje}T00:00:00`).getTime()) / 86400000) : NaN);

export interface Pendencia { gravidade: 'critica' | 'atencao'; titulo: string; detalhe: string; href: string; area: string }

/** O que precisa de atenção hoje, da mais grave para a menos grave. */
export function pendencias(d: Dados, hoje: string): Pendencia[] {
  const out: Pendencia[] = [];
  const obra = (id: unknown) => String(vivos(d.works).find((w) => w.id === id)?.name ?? 'Obra');
  for (const w of vivos(d.works).filter((x) => x.status !== 'Concluída')) {
    const acts = vivos(d.activities).filter((a) => a.workId === w.id);
    if (!acts.length) continue;
    const p = schedulePerformance({ acts, budgets: vivos(d.budgets).filter((b) => b.workId === w.id), works: [w], day: hoje });
    if (p.variance <= -5) out.push({ gravidade: p.variance <= -10 ? 'critica' : 'atencao', titulo: `${String(w.name)} está atrasada`, detalhe: `${Math.abs(p.variance).toFixed(1)} pontos abaixo do planejado`, href: '/gestao/activities/', area: 'planejamento' });
  }
  const caixa = cashProjection(vivos(d.finance), hoje, 6);
  if (caixa.firstNegative) out.push({ gravidade: 'critica', titulo: 'Caixa negativo previsto', detalhe: `Saldo fica negativo em ${caixa.firstNegative.label}`, href: '/gestao/finance/', area: 'financeiro' });
  const vencidas = vivos(d.finance).filter((f) => f.type === 'Despesa' && !['Pago'].includes(String(f.status)) && f.status !== 'Previsto' && dias(f.dueDate, hoje) < 0);
  if (vencidas.length) out.push({ gravidade: 'critica', titulo: `${vencidas.length} conta(s) a pagar vencida(s)`, detalhe: `R$ ${vencidas.reduce((s, f) => s + n(f.value), 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} em atraso`, href: '/gestao/finance/', area: 'financeiro' });
  const baixo = vivos(d.inventory).filter((i) => n(i.currentStock) < n(i.minStock));
  if (baixo.length) out.push({ gravidade: 'atencao', titulo: `${baixo.length} material(is) abaixo do estoque mínimo`, detalhe: baixo.slice(0, 2).map((i) => String(i.material)).join(', '), href: '/gestao/inventory/', area: 'suprimentos' });
  const nc = vivos(d.quality).filter((q) => q.status !== 'Resolvida' && q.severity === 'Crítica');
  if (nc.length) out.push({ gravidade: 'critica', titulo: `${nc.length} não conformidade(s) crítica(s) em aberto`, detalhe: obra(nc[0]!.workId), href: '/gestao/quality/', area: 'qualidade' });
  const docs = vivos(d.documents).filter((x) => x.expiry && dias(x.expiry, hoje) <= 30 && x.status !== 'Vencido');
  if (docs.length) out.push({ gravidade: docs.some((x) => dias(x.expiry, hoje) < 0) ? 'critica' : 'atencao', titulo: `${docs.length} documento(s) vencendo em 30 dias`, detalhe: String(docs[0]!.name), href: '/gestao/documents/', area: 'qualidade' });
  const manut = vivos(d.equipment).filter((e) => e.nextMaintenance && dias(e.nextMaintenance, hoje) <= 7);
  if (manut.length) out.push({ gravidade: 'atencao', titulo: `${manut.length} equipamento(s) com manutenção na semana`, detalhe: String(manut[0]!.name), href: '/gestao/equipment/', area: 'suprimentos' });
  const med = vivos(d.measurements).filter((m) => m.status === 'Pendente');
  if (med.length) out.push({ gravidade: 'atencao', titulo: `${med.length} medição(ões) aguardando aprovação`, detalhe: `R$ ${med.reduce((s, m) => s + n(m.value), 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`, href: '/gestao/measurements/', area: 'planejamento' });
  return out.sort((a, b) => (a.gravidade === b.gravidade ? 0 : a.gravidade === 'critica' ? -1 : 1));
}

export interface Kpi { rotulo: string; valor: string; detalhe?: string; alerta?: boolean }
const brl = (v: number) => (Math.abs(v) >= 1e6 ? `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi` : `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`);

/** Quatro números que resumem cada área. */
export function kpisDaArea(area: string, d: Dados, hoje: string): Kpi[] {
  const obras = vivos(d.works), ativas = obras.filter((w) => w.status !== 'Concluída');
  switch (area) {
    case 'financeiro': {
      const f = vivos(d.finance), c = cashProjection(f, hoje, 6);
      const aReceber = f.filter((x) => x.type === 'Receita' && x.status !== 'Recebido').reduce((s, x) => s + n(x.value), 0);
      const aPagar = f.filter((x) => x.type === 'Despesa' && x.status !== 'Pago').reduce((s, x) => s + n(x.value), 0);
      const saldoContratos = vivos(d.contracts).reduce((s, k) => s + contractBalance(k, d.measurements).balance, 0);
      return [{ rotulo: 'Saldo realizado', valor: brl(c.opening), detalhe: 'recebido − pago', alerta: c.opening < 0 }, { rotulo: 'A receber', valor: brl(aReceber) }, { rotulo: 'A pagar', valor: brl(aPagar) },
        { rotulo: 'Saldo de contratos a medir', valor: brl(saldoContratos), detalhe: c.firstNegative ? `caixa negativo em ${c.firstNegative.label}` : 'sem caixa negativo em 6 meses', alerta: !!c.firstNegative }];
    }
    case 'planejamento': {
      const perf = ativas.map((w) => schedulePerformance({ acts: vivos(d.activities).filter((a) => a.workId === w.id), budgets: vivos(d.budgets).filter((b) => b.workId === w.id), works: [w], day: hoje }));
      const atrasadas = perf.filter((p) => p.variance <= -5).length;
      const medido = vivos(d.measurements).reduce((s, m) => s + measurementNet(m).gross, 0);
      const atv = vivos(d.activities).filter((a) => a.end && String(a.end) < hoje && n(a.progress) < 100).length;
      return [{ rotulo: 'Obras em andamento', valor: String(ativas.length), detalhe: `${obras.length} cadastradas` }, { rotulo: 'Obras atrasadas', valor: String(atrasadas), detalhe: 'mais de 5 pontos abaixo do planejado', alerta: atrasadas > 0 },
        { rotulo: 'Atividades com prazo vencido', valor: String(atv), alerta: atv > 0 }, { rotulo: 'Total medido', valor: brl(medido) }];
    }
    case 'suprimentos': {
      const abertos = vivos(d.orders).filter((o) => !['Entregue', 'Cancelado'].includes(String(o.status)));
      const baixo = vivos(d.inventory).filter((i) => n(i.currentStock) < n(i.minStock)).length;
      return [{ rotulo: 'Pedidos em aberto', valor: String(abertos.length), detalhe: brl(abertos.reduce((s, o) => s + n(o.value), 0)) }, { rotulo: 'Abaixo do estoque mínimo', valor: String(baixo), alerta: baixo > 0 },
        { rotulo: 'Valor em estoque', valor: brl(vivos(d.inventory).reduce((s, i) => s + n(i.currentStock) * n(i.unitValue), 0)) }, { rotulo: 'Fornecedores ativos', valor: String(vivos(d.suppliers).filter((s) => s.status === 'Ativo').length) }];
    }
    case 'rh': {
      const p = vivos(d.staff), ativos = p.filter((x) => x.status === 'Ativo');
      return [{ rotulo: 'Pessoas ativas', valor: String(ativos.length), detalhe: `${p.length} cadastradas` }, { rotulo: 'Folha mensal', valor: brl(ativos.reduce((s, x) => s + n(x.salary), 0)), detalhe: 'soma dos salários ativos' },
        { rotulo: 'Em férias', valor: String(p.filter((x) => x.status === 'Férias').length) }, { rotulo: 'Sem obra alocada', valor: String(ativos.filter((x) => !x.workId).length) }];
    }
    case 'qualidade': {
      const q = vivos(d.quality).filter((x) => x.status !== 'Resolvida'), s = vivos(d.safety);
      const inc = s.filter((x) => x.type === 'Incidente' && x.status !== 'Concluído').length;
      const venc = vivos(d.documents).filter((x) => x.expiry && dias(x.expiry, hoje) <= 30).length;
      return [{ rotulo: 'Não conformidades abertas', valor: String(q.length), detalhe: `${q.filter((x) => x.severity === 'Crítica').length} crítica(s)`, alerta: q.some((x) => x.severity === 'Crítica') }, { rotulo: 'Incidentes em acompanhamento', valor: String(inc), alerta: inc > 0 },
        { rotulo: 'DDS e treinamentos', valor: String(s.filter((x) => x.type === 'DDS' || x.type === 'Treinamento').length) }, { rotulo: 'Documentos vencendo', valor: String(venc), detalhe: 'próximos 30 dias', alerta: venc > 0 }];
    }
    case 'orcamento': {
      const b = vivos(d.budgets), venda = b.reduce((s, x) => s + budgetSale(x), 0), custo = b.reduce((s, x) => s + n(x.qty) * n(x.unitValue), 0);
      return [{ rotulo: 'Orçado nas obras', valor: brl(venda), detalhe: `${b.length} itens` }, { rotulo: 'Custo direto', valor: brl(custo) }, { rotulo: 'BDI médio', valor: custo > 0 ? `${((venda / custo - 1) * 100).toFixed(1)}%` : '—' },
        { rotulo: 'Custo incorrido', valor: brl(incurredCost(vivos(d.finance), hoje)), detalhe: 'despesas por competência' }];
    }
    case 'integracoes': {
      const f = vivos(d.finance), abertas = f.filter((x) => !x.bankRef && !['Pago', 'Recebido'].includes(String(x.status)));
      const notas = new Set(f.filter((x) => x.nfeKey).map((x) => String(x.nfeKey))).size;
      const incompletas = conferir(d.staff as Pessoa[]).filter((c) => c.pendencias.length > 0).length;
      return [{ rotulo: 'Contas em aberto', valor: String(abertas.length), detalhe: 'aguardando baixa pelo extrato' }, { rotulo: 'Conciliadas com o banco', valor: String(f.filter((x) => x.bankRef).length) },
        { rotulo: 'Notas fiscais lançadas', valor: String(notas) }, { rotulo: 'Cadastros incompletos (eSocial)', valor: String(incompletas), alerta: incompletas > 0 }];
    }
    default:
      return [{ rotulo: 'Obras em andamento', valor: String(ativas.length) }, { rotulo: 'Carteira de obras', valor: brl(ativas.reduce((s, w) => s + n(w.value), 0)) },
        { rotulo: 'Contratos ativos', valor: String(vivos(d.contracts).filter((k) => k.status === 'Ativo').length) }, { rotulo: 'Documentos', valor: String(vivos(d.documents).length) }];
  }
}

/** Fluxo de caixa projetado mês a mês (entradas, saídas e saldo acumulado). */
export const fluxoDeCaixa = (d: Dados, hoje: string) => cashProjection(vivos(d.finance), hoje, 6);
