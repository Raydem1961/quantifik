/**
 * Controle (menu 7 e Administração do ObraTop 3): alertas completos, curvas ABC/S de recursos e
 * integridade dos dados (duplicados, registros sem obra, EAP fora do padrão).
 */
import { cashProjection, contractBalance } from './vendor/calc.mjs';
import { reviewEap, type RevisaoEap } from './vendor/msproject.mjs';
import { situacaoEstoque } from './fluxos';
import { ESQUEMAS, MODULOS, rotuloRegistro, type IdModulo } from './esquemas';

type Reg = { id: string; deleted?: unknown } & Record<string, unknown>;
export type Dados = Record<string, Reg[]>;
const n = (v: unknown) => Number(v) || 0;
const vivos = (l: Reg[] | undefined) => (l ?? []).filter((r) => !r.deleted);
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const dias = (iso: unknown, hoje: string) => (iso ? Math.ceil((Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / 86400000) : 9999);

export interface Alerta { nivel: 'bad' | 'warn'; titulo: string; texto: string; data: string; modulo: IdModulo; workId?: string }

/** Os mesmos alertas do ObraTop 3 (com a mesma régua de prazos). */
export function alertas(d: Dados, hoje: string, filtroObra?: string): Alerta[] {
  const a: Alerta[] = [];
  const de = (m: IdModulo) => vivos(d[m]).filter((x) => !filtroObra || x.workId === filtroObra);
  const push = (nivel: Alerta['nivel'], titulo: string, texto: unknown, data: unknown, modulo: IdModulo, workId?: unknown) => a.push({ nivel, titulo, texto: String(texto ?? ''), data: String(data ?? hoje).slice(0, 10), modulo, workId: workId ? String(workId) : undefined });
  for (const x of de('activities')) if (x.end && String(x.end) < hoje && x.status !== 'Concluída' && n(x.progress) < 100) push('bad', 'Atividade atrasada', x.name, x.end, 'activities', x.workId);
  for (const x of de('finance')) if (x.dueDate && String(x.dueDate) < hoje && !['Pago', 'Recebido'].includes(String(x.status))) push('bad', x.type === 'Receita' ? 'Recebimento vencido' : 'Pagamento vencido', `${String(x.description ?? '')} — ${brl(n(x.value))}`, x.dueDate, 'finance', x.workId);
  for (const x of de('contracts')) {
    if (!x.end || x.status === 'Encerrado') continue;
    const k = dias(x.end, hoje);
    if (k < 0) push('bad', 'Contrato vencido', x.number, x.end, 'contracts', x.workId); else if (k <= 30) push('warn', 'Contrato próximo do fim', x.number, x.end, 'contracts', x.workId);
  }
  for (const x of de('documents')) {
    if (!x.expiry) continue;
    const k = dias(x.expiry, hoje);
    if (k < 0) push('bad', 'Documento vencido', x.name, x.expiry, 'documents', x.workId); else if (k <= 30) push('warn', 'Documento próximo do vencimento', x.name, x.expiry, 'documents', x.workId);
  }
  for (const x of de('equipment')) {
    if (!x.nextMaintenance || x.status === 'Manutenção') continue;
    const k = dias(x.nextMaintenance, hoje);
    if (k < 0) push('bad', 'Manutenção atrasada', x.name, x.nextMaintenance, 'equipment', x.workId); else if (k <= 15) push('warn', 'Manutenção próxima', x.name, x.nextMaintenance, 'equipment', x.workId);
  }
  const pedidosAbertos = vivos(d.orders).filter((o) => !['Entregue', 'Cancelado'].includes(String(o.status)));
  for (const x of de('inventory')) {
    const z = situacaoEstoque(x), chegando = pedidosAbertos.filter((o) => o.inventoryId === x.id).reduce((t, o) => t + n(o.qty), 0), un = String(x.unit ?? '');
    if ((z.nivel === 'bad' || z.nivel === 'warn') && chegando > 0 && n(x.currentStock) + chegando >= z.pontoDePedido) { push('warn', 'Reposição já pedida — acompanhar entrega', `${String(x.material)}: ${chegando.toLocaleString('pt-BR')} ${un} em pedidos abertos.`, x.date, 'orders', x.workId); continue; }
    if (z.nivel === 'bad') push('bad', 'Estoque crítico — ação imediata', `${String(x.material)}: comprar ${z.reposicao.toLocaleString('pt-BR')} ${un} (${brl(z.custoReposicao)}).`, x.date, 'inventory', x.workId);
    else if (z.nivel === 'warn') push('warn', 'Ressuprimento necessário', `${String(x.material)}: sugerido ${z.reposicao.toLocaleString('pt-BR')} ${un} (${brl(z.custoReposicao)}).`, x.date, 'inventory', x.workId);
    else if (z.nivel === 'over') push('warn', 'Estoque em excesso', `${String(x.material)}: acima do máximo — suspender compras e avaliar remanejamento.`, x.date, 'inventory', x.workId);
  }
  for (const x of de('quality')) if (x.deadline && String(x.deadline) < hoje && x.status !== 'Resolvida') push('bad', 'Não conformidade vencida', x.issue, x.deadline, 'quality', x.workId);
  for (const x of de('contracts')) {
    if (x.status === 'Encerrado') continue;
    const b = contractBalance(x, vivos(d.measurements));
    if (!b.hasMeasurements) continue;
    if (b.balance < 0) push('bad', 'Contrato com saldo negativo', `${String(x.number)}: medido ${brl(b.measured)} acima do valor vigente ${brl(b.current)}.`, hoje, 'contracts', x.workId);
    else if (b.percentLeft < 10) push('warn', 'Saldo contratual baixo', `${String(x.number)}: restam ${brl(b.balance)} (${b.percentLeft.toFixed(0)}% do valor vigente).`, hoje, 'contracts', x.workId);
  }
  for (const x of de('measurements')) if (x.status === 'Pendente') push('warn', 'Medição aguardando aprovação', `${String(x.number ?? '')} — ${brl(n(x.value))}`, x.date, 'measurements', x.workId);
  const cp = cashProjection(de('finance'), hoje, 6);
  if (cp.firstNegative) push('bad', 'Fluxo de caixa projetado negativo', `Saldo projetado de ${brl(cp.firstNegative.balance)} em ${cp.firstNegative.label} (saldo realizado hoje: ${brl(cp.opening)}).`, hoje, 'finance');
  return a.sort((x, y) => (x.nivel === y.nivel ? x.data.localeCompare(y.data) : x.nivel === 'bad' ? -1 : 1));
}

export interface ItemAbc { nome: string; valor: number; participacao: number; acumulado: number; classe: 'A' | 'B' | 'C' }
/** Curva ABC: classe A até 80% do acumulado, B até 95%, C o restante. */
export function curvaAbc(itens: { nome: string; valor: number }[]): ItemAbc[] {
  const l = itens.filter((x) => x.valor > 0).sort((a, b) => b.valor - a.valor), total = l.reduce((t, x) => t + x.valor, 0);
  let acum = 0;
  return l.map((x) => { const antes = acum; acum += total ? x.valor / total : 0; return { ...x, participacao: total ? x.valor / total : 0, acumulado: acum, classe: antes < 0.8 ? 'A' : antes < 0.95 ? 'B' : 'C' }; });
}
/** Série acumulada por mês (a "curva S" de um recurso). */
export function serieAcumulada(itens: { data: string; valor: number }[]): { mes: string; valor: number; acumulado: number }[] {
  const meses = new Map<string, number>();
  for (const x of itens) if (/^\d{4}-\d{2}/.test(x.data) && x.valor > 0) meses.set(x.data.slice(0, 7), (meses.get(x.data.slice(0, 7)) ?? 0) + x.valor);
  let acum = 0;
  return [...meses.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([mes, valor]) => ({ mes, valor, acumulado: (acum += valor) }));
}

// ───────────────────────── integridade ─────────────────────────
const nz = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
/** Mesma régua do ObraTop 3 para "duplicado confirmado". */
export function chaveForte(m: IdModulo, x: Reg): string {
  switch (m) {
    case 'works': return nz(x.name) ? `nome:${nz(x.name)}` : '';
    case 'suppliers': return nz(x.cnpj) ? `cnpj:${nz(x.cnpj).replace(/\D/g, '')}` : '';
    case 'measurements': case 'contracts': return x.workId && nz(x.number) ? `${x.workId}|num:${nz(x.number)}` : '';
    case 'activities': return x.workId && nz(x.wbs) ? `${x.workId}|eap:${nz(x.wbs)}` : '';
    case 'equipment': return x.workId && nz(x.code) ? `${x.workId}|cod:${nz(x.code)}` : '';
    case 'inventory': return x.workId && nz(x.material) ? `${x.workId}|mat:${nz(x.material)}` : '';
    case 'dailyLogs': return x.workId && nz(x.date) ? `${x.workId}|dia:${nz(x.date)}` : '';
    default: {
      // Demais: todos os campos de negócio iguais.
      const campos = ESQUEMAS[m].fields.filter((f) => f[2] !== 'file').map((f) => f[0]);
      const k = campos.map((c) => nz(x[c])).join('|');
      return k.replace(/\|/g, '') ? k : '';
    }
  }
}
const preenchidos = (m: IdModulo, x: Reg) => ESQUEMAS[m].fields.filter((f) => x[f[0]] != null && x[f[0]] !== '').length;
const criadoEm = (x: Reg) => { const c = x.createdAt as { seconds?: number } | string | undefined; return typeof c === 'string' ? Date.parse(c) || 0 : c?.seconds ? c.seconds * 1000 : 0; };

export interface Duplicado { modulo: IdModulo; manter: Reg; repetidos: Reg[]; chave: string }
export interface Integridade { porModulo: { modulo: IdModulo; ativos: number; lixeira: number; orfaos: number; duplicados: number }[]; duplicados: Duplicado[]; orfaos: { modulo: IdModulo; r: Reg }[]; eap: RevisaoEap[] }

export function verificarIntegridade(d: Dados): Integridade {
  const obras = new Set(vivos(d.works).map((w) => w.id));
  const duplicados: Duplicado[] = [], orfaos: Integridade['orfaos'] = [];
  const porModulo = MODULOS.map((m) => {
    const todos = d[m] ?? [], ativos = vivos(todos), temObra = ESQUEMAS[m].fields.some((f) => f[0] === 'workId' && f[3]);
    const semObra = temObra ? ativos.filter((r) => r.workId && !obras.has(String(r.workId))) : [];
    semObra.forEach((r) => orfaos.push({ modulo: m, r }));
    const grupos = new Map<string, Reg[]>();
    for (const r of ativos) { const k = chaveForte(m, r); if (k) grupos.set(k, [...(grupos.get(k) ?? []), r]); }
    let dup = 0;
    for (const [k, g] of grupos) if (g.length > 1) {
      // Fica o mais completo; empate, o mais antigo.
      const ord = [...g].sort((a, b) => preenchidos(m, b) - preenchidos(m, a) || criadoEm(a) - criadoEm(b));
      duplicados.push({ modulo: m, manter: ord[0]!, repetidos: ord.slice(1), chave: k });
      dup += g.length - 1;
    }
    return { modulo: m, ativos: ativos.length, lixeira: todos.length - ativos.length, orfaos: semObra.length, duplicados: dup };
  });
  const eap = reviewEap(vivos(d.works), vivos(d.activities), { phaseNames: FASES_EAP });
  return { porModulo, duplicados, orfaos, eap };
}
export const rotulo = (m: IdModulo, r: Reg) => rotuloRegistro(m, r) || r.id;

/** Nomes das fases usados pelos modelos de obra do ObraTop 3 (para renumerar a EAP). */
export const FASES_EAP: Record<string, string> = {
  '1.1': 'Gestão, projetos e planejamento', '1.2': 'Serviços preliminares', '1.3': 'Estrutura e recuperação', '1.4': 'Cobertura e impermeabilização', '1.5': 'Instalações elétricas',
  '1.6': 'Instalações hidrossanitárias', '1.7': 'Arquitetura e acabamentos', '1.8': 'Climatização e utilidades', '1.9': 'Comissionamento e entrega', '2.1': 'Gestão, projetos e controle',
  '2.2': 'Mobilização e serviços preliminares', '2.3': 'Terraplenagem', '2.4': 'Drenagem e obras correntes', '2.5': 'Pavimentação', '2.6': 'Interseções e acostamentos',
  '2.7': 'Sinalização e segurança viária', '2.8': 'Meio ambiente e recuperação', '2.9': 'Controle tecnológico e entrega',
};

/** Checklist de implantação de uma obra (mesmos itens e chaves do ObraTop 3). */
export const CHECKLIST_IMPLANTACAO: [string, string, string][] = [
  ['01', 'Organização e usuário conferidos', '/admin/'], ['02', 'Obra cadastrada e revisada', '/gestao/works/'], ['03', 'Fornecedores/prestadores essenciais cadastrados', '/gestao/suppliers/'],
  ['04', 'Orçamento-base implantado e validado', '/gestao/budgets/'], ['05', 'Cronograma implantado e compatível com contrato', '/gestao/activities/'], ['06', 'Pessoal e equipamentos cadastrados', '/gestao/staff/'],
  ['07', 'Materiais/estoque inicial cadastrados', '/gestao/inventory/'], ['08', 'Fluxo de compras liberado', '/gestao/orders/'], ['09', 'Contratos e documentos críticos cadastrados', '/gestao/contracts/'],
  ['10', 'Segurança e qualidade configuradas', '/gestao/safety/'], ['11', 'Critério de medição definido', '/gestao/measurements/'], ['12', 'Financeiro preparado para lançamentos', '/gestao/finance/'],
  ['13', 'Data-base da Curva S definida', '/curvas/'], ['14', 'Projetos/quantitativos vinculados quando aplicável', '/quantitativos/'], ['15', 'Backup inicial realizado e relatórios conferidos', '/admin/backup/'],
];
export function contagensImplantacao(d: Dados, workId: string, membrosAtivos: number, historico: number): Record<string, number | null> {
  const w = (m: string) => vivos(d[m]).filter((x) => x.workId === workId).length;
  return { '01': membrosAtivos, '02': vivos(d.works).some((x) => x.id === workId) ? 1 : 0, '03': vivos(d.suppliers).length, '04': w('budgets'), '05': w('activities'), '06': w('staff') + w('equipment'),
    '07': w('inventory'), '08': w('orders'), '09': w('contracts') + w('documents'), '10': w('safety') + w('quality'), '11': w('measurements'), '12': w('finance'), '13': historico, '14': vivos(d.projects).length || null, '15': null };
}
