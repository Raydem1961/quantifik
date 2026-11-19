/**
 * Portal do Cliente: o retrato de UM contrato/obra que o cliente pode ver. É montado a partir
 * dos registros da obra e gravado em `portalCliente/{org}_{obra}` — o cliente lê só esse
 * documento, nunca os dados internos da empresa (custos, fornecedores, outras obras).
 */
import { contractBalance, measurementNet, schedulePerformance, weightedProgress } from './obratop/vendor/calc.mjs';

export type Reg = { id: string; deleted?: unknown } & Record<string, unknown>;
export interface DadosObra { works: Reg[]; activities: Reg[]; budgets: Reg[]; measurements: Reg[]; finance: Reg[]; contracts: Reg[]; documents: Reg[]; dailyLogs: Reg[] }
export interface OpcoesPortal { diario: boolean; documentos: boolean; /** Relatório fotográfico (padrão: ligado). */ fotos?: boolean }
export const OPCOES_PADRAO: OpcoesPortal = { diario: true, documentos: false, fotos: true };

export interface FotoPortal { url: string; thumb: string; legenda: string; servico: string }
export interface DiaPortal { data: string; clima: string; servicos: string; fotos: FotoPortal[] }
/** Um mês do relatório fotográfico: documento separado (portalCliente/{id}/fotos/{AAAA-MM}). */
export interface MesFotos { versao: 1; orgId: string; workId: string; mes: string; rotulo: string; dias: DiaPortal[] }
export interface IndiceMes { mes: string; rotulo: string; dias: number; fotos: number; hash: string }

export interface PontoCurva { mes: string; rotulo: string; fisicoPrevisto: number; fisicoRealizado: number | null; financeiroPrevisto: number; financeiroRealizado: number | null }
export interface Etapa { eap: string; nome: string; inicio: string; fim: string; avanco: number; situacao: 'concluida' | 'em_andamento' | 'atrasada' | 'a_iniciar' }
export interface MedicaoPortal { numero: string; data: string; descricao: string; fisico: number; bruto: number; retencao: number; glosa: number; liquido: number; status: string }
export interface Parcela { descricao: string; vencimento: string; valor: number; pagoEm: string; situacao: 'paga' | 'a_vencer' | 'vence_em_breve' | 'vencida' }
export interface Portal {
  versao: 1; orgId: string; workId: string; emails: string[]; opcoes: OpcoesPortal; atualizadoEm: string; dataBase: string;
  empresa: { nome: string; responsavel: string; registro: string };
  obra: { nome: string; cliente: string; endereco: string; inicio: string; fim: string; status: string; responsavel: string };
  contrato: { numero: string; objeto: string; valorOriginal: number; aditivos: number; motivoAditivos: string; valorAtual: number; medido: number; saldo: number; inicio: string; fim: string } | null;
  indicadores: {
    fisicoPrevisto: number; fisicoRealizado: number; desvio: number; idp: number;
    prazoTotalDias: number; diasDecorridos: number; diasRestantes: number; terminoPrevisto: string; terminoEstimado: string;
    etapasConcluidas: number; etapasTotal: number; etapasAtrasadas: number;
    totalPago: number; totalAVencer: number; totalVencido: number; retencaoAcumulada: number; proximoVencimento: { data: string; valor: number; descricao: string } | null;
  };
  curva: PontoCurva[]; etapas: Etapa[]; medicoes: MedicaoPortal[]; parcelas: Parcela[];
  diario: { data: string; clima: string; servicos: string }[]; documentos: { nome: string; categoria: string; data: string; url: string }[];
  /** Índice do relatório fotográfico (os meses ficam em documentos próprios). */
  fotosMeses: IndiceMes[];
}

const n = (v: unknown) => Number(v) || 0;
const s = (v: unknown) => String(v ?? '').trim();
const d10 = (v: unknown) => s(v).slice(0, 10);
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const dias = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const somaDias = (iso: string, q: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + q * 86400000).toISOString().slice(0, 10);
const fimDoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes + 1, 0)).toISOString().slice(0, 10);
export const idPortal = (orgId: string, workId: string) => `${orgId}_${workId}`;
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const rotuloMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1] ?? ''} de ${mes.slice(0, 4)}`;
/** Impressão digital curta do conteúdo (para regravar só os meses que mudaram). */
export function resumo(texto: string): string {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) | 0;
  return `${(h >>> 0).toString(36)}-${texto.length.toString(36)}`;
}

/**
 * Relatório fotográfico do cliente: fotos dos diários ASSINADOS da obra, sem as marcadas como
 * "uso interno", agrupadas por dia e por mês (mais recente primeiro). Só endereços https (ou o
 * armazenamento local de testes) — nada de javascript: nem data: vindos de registros adulterados.
 */
export function montarFotos(orgId: string, workId: string, dd: Pick<DadosObra, 'dailyLogs' | 'activities'>): MesFotos[] {
  const nomes = new Map(dd.activities.filter((a) => a.workId === workId && !a.deleted).map((a) => [a.id, [s(a.wbs), s(a.name)].filter(Boolean).join(' ')]));
  const dias: DiaPortal[] = dd.dailyLogs
    .filter((x) => !x.deleted && x.workId === workId && x.status === 'Assinado' && /^\d{4}-\d{2}-\d{2}/.test(d10(x.date)) && Array.isArray(x.photos))
    .map((x) => ({
      data: d10(x.date), clima: s(x.weather), servicos: s(x.services).slice(0, 300),
      fotos: (x.photos as Record<string, unknown>[]).filter((f) => f && !f.privada && /^(https:|blob:|http:\/\/(localhost|127\.0\.0\.1)[:/])/.test(s(f.url)))
        .slice(0, 60).map((f) => ({ url: s(f.url), thumb: s(f.thumb) || s(f.url), legenda: s(f.legenda).slice(0, 240), servico: nomes.get(s(f.activityId)) ?? '' })),
    }))
    .filter((d) => d.fotos.length > 0)
    .sort((a, b) => b.data.localeCompare(a.data));
  const porMes = new Map<string, DiaPortal[]>();
  for (const d of dias) { const m = d.data.slice(0, 7); porMes.set(m, [...(porMes.get(m) ?? []), d]); }
  return [...porMes.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([mes, ds]) => ({ versao: 1 as const, orgId, workId, mes, rotulo: rotuloMes(mes), dias: ds }));
}
export const indiceDeFotos = (meses: MesFotos[]): IndiceMes[] => meses.map((m) => ({ mes: m.mes, rotulo: m.rotulo, dias: m.dias.length, fotos: m.dias.reduce((t, d) => t + d.fotos.length, 0), hash: resumo(JSON.stringify(m.dias)) }));
export const normalizarEmails = (texto: string): string[] => [...new Set(texto.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => /^\S+@\S+\.\S+$/.test(e)))].slice(0, 10);

export function montarPortal(orgId: string, workId: string, dd: DadosObra, empresa: Portal['empresa'], emails: string[], opcoes: OpcoesPortal, hoje: string, agora = new Date().toISOString()): Portal {
  const vivos = (l: Reg[]) => l.filter((r) => !r.deleted && r.workId === workId);
  const obra = dd.works.find((w) => w.id === workId && !w.deleted);
  if (!obra) throw new Error('Obra não encontrada.');
  const acts = vivos(dd.activities), budgets = vivos(dd.budgets), meds = vivos(dd.measurements).sort((a, b) => d10(a.date).localeCompare(d10(b.date)) || s(a.number).localeCompare(s(b.number), undefined, { numeric: true }));
  const inicio = d10(obra.start), fim = d10(obra.end);
  const args = { acts, budgets, works: [obra] };
  const perf = acts.length ? schedulePerformance({ ...args, day: hoje }) : null;
  const fisicoPrevisto = perf ? perf.planned : 0, fisicoRealizado = perf ? perf.actual : n(obra.progress);

  // Contrato principal da obra (ativo, de maior valor); sem contrato cadastrado, vale o valor da obra.
  const contratos = vivos(dd.contracts).sort((a, b) => (a.status === 'Ativo' ? 0 : 1) - (b.status === 'Ativo' ? 0 : 1) || n(b.value) - n(a.value));
  const k = contratos[0];
  const saldoK = k ? contractBalance(k, meds) : null;
  const valorAtual = saldoK ? saldoK.current : n(obra.value);
  const medicoes: MedicaoPortal[] = meds.map((m) => { const x = measurementNet(m); return { numero: s(m.number), data: d10(m.date), descricao: s(m.description).slice(0, 200), fisico: n(m.physical), bruto: r2(x.gross), retencao: r2(x.retention), glosa: r2(x.deduction), liquido: r2(x.net), status: s(m.status) }; });
  const medidoTotal = medicoes.reduce((t, m) => t + m.bruto, 0);
  const contrato = k || valorAtual > 0 ? {
    numero: s(k?.number), objeto: s(k?.object).slice(0, 400), valorOriginal: n(k?.value ?? obra.value), aditivos: n(k?.addendum), motivoAditivos: s(k?.addendumNote).slice(0, 300),
    valorAtual: r2(valorAtual), medido: r2(saldoK ? saldoK.measured : medidoTotal), saldo: r2(saldoK ? saldoK.balance : Math.max(0, valorAtual - medidoTotal)), inicio: d10(k?.start) || inicio, fim: d10(k?.end) || fim,
  } : null;

  // Curva S físico-financeira, mês a mês do início ao término (no máximo 60 meses).
  const curva: PontoCurva[] = [];
  if (inicio && fim && fim >= inicio) {
    let ano = Number(inicio.slice(0, 4)), mes = Number(inicio.slice(5, 7)) - 1;
    for (let i = 0; i < 60; i++) {
      const chave = `${ano}-${String(mes + 1).padStart(2, '0')}`, ultimo = fimDoMes(ano, mes);
      const corte = ultimo > fim ? fim : ultimo, passado = `${chave}-01` <= hoje;
      const previsto = acts.length ? weightedProgress({ ...args, day: corte, planned: true }) : Math.min(100, Math.max(0, (dias(inicio, corte) / Math.max(1, dias(inicio, fim))) * 100));
      const ateAqui = medicoes.filter((m) => m.data && m.data <= ultimo);
      // O mês corrente mostra o avanço de hoje; os anteriores, o acumulado das medições.
      const realFisico = !passado ? null : chave === hoje.slice(0, 7) ? fisicoRealizado : Math.min(100, ateAqui.reduce((t, m) => t + m.fisico, 0));
      curva.push({ mes: chave, rotulo: `${String(mes + 1).padStart(2, '0')}/${String(ano).slice(2)}`, fisicoPrevisto: r1(previsto), fisicoRealizado: realFisico === null ? null : r1(realFisico),
        financeiroPrevisto: r2(valorAtual * previsto / 100), financeiroRealizado: passado ? r2(ateAqui.reduce((t, m) => t + m.bruto, 0)) : null });
      if (ultimo >= fim) break;
      mes++; if (mes > 11) { mes = 0; ano++; }
    }
  }

  const etapas: Etapa[] = acts.sort((a, b) => s(a.wbs).localeCompare(s(b.wbs), undefined, { numeric: true }) || d10(a.start).localeCompare(d10(b.start))).slice(0, 150).map((a) => {
    const av = Math.min(100, n(a.progress)), f = d10(a.end), i = d10(a.start);
    return { eap: s(a.wbs), nome: s(a.name).slice(0, 120), inicio: i, fim: f, avanco: r1(av), situacao: av >= 100 ? 'concluida' as const : f && f < hoje ? 'atrasada' as const : i && i <= hoje ? 'em_andamento' as const : 'a_iniciar' as const };
  });

  // Parcelas: o que o cliente paga à construtora (receitas da obra).
  const parcelas: Parcela[] = vivos(dd.finance).filter((f) => f.type === 'Receita').map((f) => {
    const venc = d10(f.dueDate) || d10(f.date), paga = f.status === 'Recebido', falta = venc ? dias(hoje, venc) : 0;
    return { descricao: s(f.description).slice(0, 160), vencimento: venc, valor: r2(n(f.value)), pagoEm: paga ? d10(f.paymentDate) || venc : '', situacao: paga ? 'paga' as const : falta < 0 ? 'vencida' as const : falta <= 7 ? 'vence_em_breve' as const : 'a_vencer' as const };
  }).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const abertas = parcelas.filter((p) => p.situacao !== 'paga');
  const proxima = abertas[0];

  const prazoTotal = inicio && fim ? Math.max(0, dias(inicio, fim)) : 0;
  const decorridos = inicio ? Math.min(prazoTotal, Math.max(0, dias(inicio, hoje))) : 0;
  const idp = perf && perf.planned > 0 ? perf.spi : 1;
  // Estimativa de término: o prazo que falta, corrigido pelo ritmo atual (IDP). Só com obra em curso e ritmo mensurável.
  const restantes = Math.max(0, prazoTotal - decorridos);
  const terminoEstimado = fim && fisicoRealizado < 100 && idp > 0.2 && hoje <= fim ? somaDias(hoje, Math.round(restantes / idp)) : fim;

  return {
    versao: 1, orgId, workId, emails, opcoes, atualizadoEm: agora, dataBase: hoje, empresa,
    obra: { nome: s(obra.name), cliente: s(obra.client), endereco: s(obra.address), inicio, fim, status: s(obra.status), responsavel: s(obra.engineer) },
    contrato,
    indicadores: {
      fisicoPrevisto: r1(fisicoPrevisto), fisicoRealizado: r1(fisicoRealizado), desvio: r1(fisicoRealizado - fisicoPrevisto), idp: r2(idp),
      prazoTotalDias: prazoTotal, diasDecorridos: decorridos, diasRestantes: restantes, terminoPrevisto: fim, terminoEstimado,
      etapasConcluidas: etapas.filter((e) => e.situacao === 'concluida').length, etapasTotal: etapas.length, etapasAtrasadas: etapas.filter((e) => e.situacao === 'atrasada').length,
      totalPago: r2(parcelas.filter((p) => p.situacao === 'paga').reduce((t, p) => t + p.valor, 0)), totalAVencer: r2(abertas.filter((p) => p.situacao !== 'vencida').reduce((t, p) => t + p.valor, 0)),
      totalVencido: r2(abertas.filter((p) => p.situacao === 'vencida').reduce((t, p) => t + p.valor, 0)), retencaoAcumulada: r2(medicoes.reduce((t, m) => t + m.retencao, 0)),
      proximoVencimento: proxima ? { data: proxima.vencimento, valor: proxima.valor, descricao: proxima.descricao } : null,
    },
    curva, etapas, medicoes, parcelas,
    diario: opcoes.diario ? vivos(dd.dailyLogs).filter((x) => x.status === 'Assinado').sort((a, b) => d10(b.date).localeCompare(d10(a.date))).slice(0, 12).map((x) => ({ data: d10(x.date), clima: s(x.weather), servicos: s(x.services).slice(0, 300) })) : [],
    fotosMeses: opcoes.fotos === false ? [] : indiceDeFotos(montarFotos(orgId, workId, dd)),
    documentos: opcoes.documentos ? vivos(dd.documents).filter((x) => x.status === 'Aprovado' && /^https:\/\//.test(s(x.fileUrl) || s(x.reference))).slice(0, 40).map((x) => ({ nome: s(x.name).slice(0, 120), categoria: s(x.category), data: d10(x.date), url: s(x.fileUrl) || s(x.reference) })) : [],
  };
}

/** Igualdade de conteúdo (ignora a hora da atualização) — para não regravar o painel sem mudança. */
export const mesmoConteudo = (a: Portal, b: Portal) => JSON.stringify({ ...a, atualizadoEm: '' }) === JSON.stringify({ ...b, atualizadoEm: '' });
