'use client';
/**
 * Gestão de obras — os módulos do ObraTop (obras, cronograma, medições, financeiro, compras,
 * estoque, contratos, qualidade, segurança…) em uma única tela guiada por esquema.
 * Os cálculos (medição líquida, saldo de contrato, avanço ponderado, valor agregado, fluxo de
 * caixa, caminho crítico, MS Project) são os módulos originais do ObraTop, sem alteração.
 */
import * as React from 'react';
import { Download, FileText, FileUp, Flag, Pencil, Plus, Trash2, X } from 'lucide-react';
import { GanttObra, type AtividadeGantt } from '@/components/gestao/gantt-obra';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, Field, Input, Segmented, Select, Textarea } from '@/components/ui/form';
import { useAuth } from '@/hooks/use-auth';
import { atualizarDoc, definirDoc, useColecao } from '@/hooks/use-colecao';
import { brl, dataBr, num, pct } from '@/lib/format';
import { COLECAO_DA_REFERENCIA, ESQUEMAS, GRUPOS_MODULOS, MODULOS, rotuloRegistro, type CampoEsquema, type EsquemaModulo, type IdModulo } from '@/lib/obratop/esquemas';
import { activityWeights, budgetSale, cashProjection, contractBalance, incurredCost, measurementNet, schedulePerformance } from '@/lib/obratop/vendor/calc.mjs';
import { cpm, mspdiExport, parseMspdi, toActivities } from '@/lib/obratop/vendor/msproject.mjs';
import { cn } from '@/lib/utils';

type Reg = { id: string; deleted?: boolean } & Record<string, unknown>;
const hoje = () => new Date().toISOString().slice(0, 10);
const novoId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const CAMPOS_MOEDA = /value|salary|cost|addendum|deduction/i;
/** A exclusão no ObraTop é lógica: registros com `deleted` ficam no banco, fora das telas. */
const vivos = (l: Reg[]) => l.filter((r) => !r.deleted);
const ehModulo = (v: string | null): v is IdModulo => !!v && (MODULOS as string[]).includes(v);

/** Sócio e coordenador gravam tudo; os demais gravam os módulos que o ObraTop libera ao "usuário de projeto". */
function podeGravar(role: string | undefined, esquema: EsquemaModulo): boolean {
  if (role === 'socio_diretor' || role === 'coordenador') return true;
  return (role === 'orcamentista' || role === 'projetista') && esquema.roles.includes('project_user');
}

export default function Gestao() {
  const { tenantId, tenant, usuario, role } = useAuth();
  const [modulo, setModuloEstado] = React.useState<IdModulo>('works');
  // Exportação estática: o módulo vai na URL (?m=finance) sem depender do roteador.
  React.useEffect(() => {
    const m = new URLSearchParams(window.location.search).get('m');
    if (ehModulo(m)) setModuloEstado(m);
  }, []);
  const setModulo = (m: IdModulo) => {
    setModuloEstado(m);
    setEditando(null);
    setBusca('');
    setMsg(undefined);
    window.history.replaceState(null, '', `?m=${m}`);
  };
  const esquema: EsquemaModulo = ESQUEMAS[modulo];
  const gravavel = podeGravar(role, esquema);

  // Coleções: a do módulo, obras (filtro e rótulos) e as apontadas por campos de referência.
  const { dados: brutos, carregando, erro } = useColecao<Reg>(modulo);
  const { dados: obrasBrutas } = useColecao<Reg>('works');
  const { dados: atividades } = useColecao<Reg>('activities');
  const { dados: orcamentos } = useColecao<Reg>('budgets');
  const { dados: financeiro } = useColecao<Reg>('finance');
  const { dados: medicoes } = useColecao<Reg>('measurements');
  const { dados: contratos } = useColecao<Reg>('contracts');
  const { dados: fornecedores } = useColecao<Reg>(modulo === 'orders' ? 'suppliers' : null);
  const { dados: estoque } = useColecao<Reg>(modulo === 'orders' ? 'inventory' : null);
  const { dados: pedidos } = useColecao<Reg>(modulo === 'finance' ? 'orders' : null);
  const obras = React.useMemo(() => vivos(obrasBrutas), [obrasBrutas]);
  const referencias: Partial<Record<IdModulo, Reg[]>> = { works: obras, activities: vivos(atividades), budgets: vivos(orcamentos), measurements: vivos(medicoes), contracts: vivos(contratos), suppliers: vivos(fornecedores), inventory: vivos(estoque), orders: vivos(pedidos) };

  const [obraId, setObraId] = React.useState('');
  const [busca, setBusca] = React.useState('');
  const [visao, setVisao] = React.useState<'tabela' | 'gantt'>('tabela');
  const [editando, setEditando] = React.useState<Reg | 'novo' | null>(null);
  const [msg, setMsg] = React.useState<{ tipo: 'ok' | 'erro'; texto: string }>();
  const temObra = esquema.fields.some((f) => f[0] === 'workId');

  const registros = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return vivos(brutos)
      .filter((r) => !temObra || !obraId || r.workId === obraId)
      .filter((r) => !termo || esquema.fields.some((f) => String(r[f[0]] ?? '').toLowerCase().includes(termo)))
      .sort((a, b) => String(b.date ?? b.start ?? '').localeCompare(String(a.date ?? a.start ?? '')) || String(a.wbs ?? a.name ?? '').localeCompare(String(b.wbs ?? b.name ?? ''), undefined, { numeric: true }));
  }, [brutos, busca, obraId, temObra, esquema]);

  const nomeRef = (campo: CampoEsquema, valor: unknown): string => {
    const col = COLECAO_DA_REFERENCIA[campo[2]];
    if (!col || !valor) return '';
    const r = referencias[col]?.find((x) => x.id === valor);
    return r ? rotuloRegistro(col, r) : '(registro removido)';
  };
  const formatar = (campo: CampoEsquema, r: Reg): React.ReactNode => {
    const v = r[campo[0]];
    if (v == null || v === '') return <span className="text-muted-foreground">—</span>;
    switch (campo[2]) {
      case 'date': return dataBr(String(v));
      case 'number': return CAMPOS_MOEDA.test(campo[0]) ? brl(Number(v)) : /%/.test(campo[1]) ? `${num(Number(v), 1)}%` : num(Number(v), 2);
      case 'select': return <Badge variant={/Conclu|Paga|Recebido|Pago|Aprovad|Ativo|Resolvida|Operacional|Assinado|Entregue/.test(String(v)) ? 'success' : /Atrasad|Vencid|Parad|Cr[ií]tica|Bloquead|Cancelad|Chuva forte/.test(String(v)) ? 'destructive' : 'default'}>{String(v)}</Badge>;
      case 'url': return <a href={String(v)} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">abrir</a>;
      default: return COLECAO_DA_REFERENCIA[campo[2]] ? nomeRef(campo, v) : String(v);
    }
  };
  // Na tabela: até 7 colunas, priorizando as obrigatórias e deixando textos longos para o formulário.
  const colunas = React.useMemo(() => {
    const curtas = esquema.fields.filter((f) => f[2] !== 'textarea' && f[2] !== 'file' || f[3]);
    return [...curtas.filter((f) => f[3]), ...curtas.filter((f) => !f[3])].slice(0, 7);
  }, [esquema]);

  const salvar = async (dados: Record<string, unknown>, id?: string) => {
    if (!tenantId) return;
    try {
      const agora = new Date().toISOString();
      if (id) await atualizarDoc(tenantId, `${modulo}/${id}`, { ...dados, updatedAt: agora, updatedBy: usuario?.uid ?? '' });
      else await definirDoc(tenantId, `${modulo}/${novoId()}`, { ...dados, deleted: false, createdAt: agora, createdBy: usuario?.uid ?? '', updatedAt: agora });
      setEditando(null);
      setMsg({ tipo: 'ok', texto: `${esquema.title}: registro ${id ? 'atualizado' : 'criado'}.` });
    } catch { setMsg({ tipo: 'erro', texto: 'Não foi possível salvar. Seus dados continuam no formulário — verifique a conexão e a permissão.' }); }
  };
  const excluir = async (r: Reg) => {
    if (!tenantId || !window.confirm(`Excluir "${rotuloRegistro(modulo, r) || 'este registro'}"?`)) return;
    try { await atualizarDoc(tenantId, `${modulo}/${r.id}`, { deleted: true, deletedAt: new Date().toISOString(), deletedBy: usuario?.uid ?? '' }); }
    catch { setMsg({ tipo: 'erro', texto: 'Não foi possível excluir o registro.' }); }
  };

  // ── MS Project ───────────────────────────────────────────────────────────
  const obraSel = obras.find((o) => o.id === obraId) ?? (modulo === 'activities' ? obras[0] : undefined);
  const atividadesDaObra = React.useMemo(() => vivos(atividades).filter((a) => a.workId === obraSel?.id), [atividades, obraSel]);
  const importarProject = async (arquivo: File) => {
    if (!tenantId || !obraSel) return;
    try {
      const { activities, warnings } = toActivities(parseMspdi(await arquivo.text()), { workId: obraSel.id });
      if (!activities.length) throw new Error('nenhuma tarefa com datas foi encontrada no arquivo');
      if (atividadesDaObra.length && !window.confirm(`A obra já tem ${atividadesDaObra.length} atividades. As ${activities.length} do arquivo serão ACRESCENTADAS (nada é apagado). Continuar?`)) return;
      const agora = new Date().toISOString();
      for (const a of activities) {
        const { _base, ...resto } = a;
        await definirDoc(tenantId, `activities/${novoId()}`, { ...resto, baseline: _base ?? null, deleted: false, createdAt: agora, createdBy: usuario?.uid ?? '', updatedAt: agora });
      }
      setMsg({ tipo: 'ok', texto: `${activities.length} atividades importadas do MS Project.${warnings.length ? ` Avisos: ${warnings.slice(0, 3).join(' ')}` : ''}` });
    } catch (e) { setMsg({ tipo: 'erro', texto: `Importação cancelada: ${e instanceof Error ? e.message : 'arquivo inválido'}.` }); }
  };
  const exportarProject = () => {
    if (!obraSel) return;
    const comWbs = atividadesDaObra.filter((a) => String(a.wbs ?? '').trim());
    if (!comWbs.length) { setMsg({ tipo: 'erro', texto: 'Para exportar, as atividades precisam do código EAP / WBS.' }); return; }
    const critico = cpm(comWbs.map((a) => ({ id: a.id, wbs: String(a.wbs), start: String(a.start), end: String(a.end), pred: String(a.predecessors ?? '') })));
    const blob = new Blob([mspdiExport(obraSel, atividadesDaObra, { critical: critico })], { type: 'application/xml' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${String(obraSel.name ?? 'obra').replace(/[^\w\-]+/g, '_')}.xml`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 30000);
  };

  // ── Linha de base (mesma estrutura do ObraTop: works/{id}.baseline + baselineHistory) ──
  type LinhaBase = { revision: number; date: string; reason: string; byEmail: string; items: Record<string, { s: string; e: string; w: number }> };
  const linhaBase = (obraSel?.baseline as LinhaBase | undefined) ?? null;
  const congelarLinhaBase = async () => {
    if (!tenantId || !obraSel) return;
    const acts = atividadesDaObra.filter((a) => a.start && a.end);
    if (!acts.length) { setMsg({ tipo: 'erro', texto: 'A obra não tem atividades com datas para congelar.' }); return; }
    const motivo = window.prompt(linhaBase ? 'Motivo do replanejamento (a linha de base atual vai para o histórico):' : 'Motivo da linha de base:', linhaBase ? 'Replanejamento' : 'Linha de base inicial');
    if (motivo === null) return;
    const { weights } = activityWeights(acts, vivos(orcamentos));
    const items: LinhaBase['items'] = {};
    for (const a of acts) items[a.id] = { s: String(a.start), e: String(a.end), w: Math.round((weights.get(a.id) || 1) * 100) / 100 };
    const historico = [...((obraSel.baselineHistory as unknown[] | undefined) ?? [])];
    if (linhaBase) historico.push({ revision: linhaBase.revision, date: linhaBase.date, reason: linhaBase.reason || '', by: linhaBase.byEmail || '', count: Object.keys(linhaBase.items || {}).length });
    try {
      await atualizarDoc(tenantId, `works/${obraSel.id}`, {
        baseline: { revision: (linhaBase?.revision || 0) + 1, date: hoje(), reason: motivo.slice(0, 200), byEmail: usuario?.email ?? '', items },
        baselineHistory: historico.slice(-15), updatedAt: new Date().toISOString(), updatedBy: usuario?.uid ?? '',
      });
      setMsg({ tipo: 'ok', texto: `Linha de base rev. ${(linhaBase?.revision || 0) + 1} congelada com ${acts.length} atividades. O avanço planejado passa a ser medido contra ela.` });
    } catch { setMsg({ tipo: 'erro', texto: 'Não foi possível congelar a linha de base.' }); }
  };

  // ── Relatório da obra em PDF ─────────────────────────────────────────────
  const gerarRelatorio = async (obra: Reg) => {
    if (!tenant) return;
    try {
      const dia = hoje();
      const acts = vivos(atividades).filter((a) => a.workId === obra.id && a.start && a.end).sort((a, b) => String(a.wbs ?? '').localeCompare(String(b.wbs ?? ''), undefined, { numeric: true }));
      const bud = vivos(orcamentos).filter((b) => b.workId === obra.id);
      const fin = vivos(financeiro).filter((f) => f.workId === obra.id);
      const med = vivos(medicoes).filter((m) => m.workId === obra.id).sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const orcado = bud.reduce((t, b) => t + budgetSale(b), 0) || Number(obra.value) || 0;
      const incorrido = incurredCost(fin, dia);
      const critico = cpm(acts.map((a) => ({ id: a.id, wbs: String(a.wbs ?? ''), start: String(a.start), end: String(a.end), pred: String(a.predecessors ?? '') })));
      const [{ pdf }, { RelatorioObraPdf }] = await Promise.all([import('@react-pdf/renderer'), import('@/components/gestao/relatorio-obra-pdf')]);
      const blob = await pdf(<RelatorioObraPdf r={{
        empresa: { nome: tenant.nomeFantasia, responsavel: tenant.responsavelTecnico.nome, registro: tenant.responsavelTecnico.registro, corPrimaria: tenant.branding.corPrimaria },
        obra, emitidoEm: dia, orcado, incorrido,
        desempenho: schedulePerformance({ acts, budgets: bud, works: [obra], budget: orcado, incurred: incorrido, day: dia }),
        atividades: acts.map((a) => ({ ...a, critica: !!critico.get(a.id)?.critical, folga: critico.get(a.id)?.slack ?? null })),
        linhaBase: (obra.baseline as LinhaBase | undefined) ?? null,
        medicoes: med.map((m) => { const n = measurementNet(m); return { ...m, liquido: n.net, retencao: n.retention }; }),
        contratos: vivos(contratos).filter((c) => c.workId === obra.id).map((c) => { const b = contractBalance(c, medicoes); return { ...c, atual: b.current, medido: b.measured, saldo: b.balance }; }),
        caixa: cashProjection(fin, dia, 6),
      }} />).toBlob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `relatorio-${String(obra.name ?? 'obra').replace(/[^\w\-]+/g, '_')}-${dia}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 30000);
    } catch (e) { setMsg({ tipo: 'erro', texto: `Não foi possível gerar o relatório: ${e instanceof Error ? e.message : 'erro desconhecido'}` }); }
  };

  // ── Indicadores por módulo ───────────────────────────────────────────────
  const indicadores = React.useMemo((): [string, string, string?][] => {
    const dia = hoje();
    switch (modulo) {
      case 'measurements': {
        const t = registros.reduce((s, m) => { const n = measurementNet(m); return { bruto: s.bruto + n.gross, ret: s.ret + n.retention, glosa: s.glosa + n.deduction, liq: s.liq + n.net }; }, { bruto: 0, ret: 0, glosa: 0, liq: 0 });
        return [['Valor medido', brl(t.bruto)], ['Retenção contratual', brl(t.ret)], ['Glosas', brl(t.glosa)], ['Líquido a faturar', brl(t.liq)]];
      }
      case 'budgets': {
        const custo = registros.reduce((s, b) => s + (Number(b.qty) || 0) * (Number(b.unitValue) || 0), 0), venda = registros.reduce((s, b) => s + budgetSale(b), 0);
        return [['Custo direto', brl(custo)], ['BDI', brl(venda - custo)], ['Preço de venda', brl(venda)], ['Itens', String(registros.length)]];
      }
      case 'finance': {
        const cp = cashProjection(registros, dia, 6);
        const rec = registros.filter((x) => x.type === 'Receita').reduce((s, x) => s + (Number(x.value) || 0), 0), desp = registros.filter((x) => x.type === 'Despesa').reduce((s, x) => s + (Number(x.value) || 0), 0);
        return [['Receitas', brl(rec)], ['Despesas', brl(desp)], ['Saldo realizado', brl(cp.opening), 'recebido − pago'], ['Menor saldo projetado (6 meses)', brl(cp.minBalance), cp.firstNegative ? `fica negativo em ${cp.firstNegative.label}` : 'sem saldo negativo previsto']];
      }
      case 'contracts': {
        const t = registros.reduce((s, c) => { const b = contractBalance(c, medicoes); return { atual: s.atual + b.current, medido: s.medido + b.measured, saldo: s.saldo + b.balance }; }, { atual: 0, medido: 0, saldo: 0 });
        return [['Valor atual (com aditivos)', brl(t.atual)], ['Medido', brl(t.medido)], ['Saldo a medir', brl(t.saldo)], ['Contratos', String(registros.length)]];
      }
      case 'inventory': {
        const abaixo = registros.filter((i) => (Number(i.currentStock) || 0) < (Number(i.minStock) || 0)).length;
        return [['Itens', String(registros.length)], ['Abaixo do mínimo', String(abaixo), abaixo ? 'providenciar reposição' : 'estoque em dia'], ['Valor em estoque', brl(registros.reduce((s, i) => s + (Number(i.currentStock) || 0) * (Number(i.unitValue) || 0), 0))]];
      }
      default: return [];
    }
  }, [modulo, registros, medicoes]);

  /** Desempenho de cada obra: avanço planejado × real, IDP (prazo) e IDC (custo). */
  const desempenho = React.useMemo(() => {
    if (modulo !== 'works' && modulo !== 'activities') return [];
    const dia = hoje();
    return (modulo === 'activities' && obraSel ? [obraSel] : obras).map((o) => {
      const acts = vivos(atividades).filter((a) => a.workId === o.id);
      const bud = vivos(orcamentos).filter((b) => b.workId === o.id);
      const orcado = bud.reduce((s, b) => s + budgetSale(b), 0) || Number(o.value) || 0;
      const p = schedulePerformance({ acts, budgets: bud, works: [o], budget: orcado, incurred: incurredCost(vivos(financeiro).filter((f) => f.workId === o.id), dia), day: dia });
      return { obra: o, p, n: acts.length };
    });
  }, [modulo, obras, obraSel, atividades, orcamentos, financeiro]);

  return (
    <>
      <PageHeader titulo="Gestão de obras" descricao={`${esquema.title} — ${esquema.subtitle}.`}>
        <Field label="Módulo" className="w-64">
          <Select value={modulo} onChange={(e) => setModulo(e.target.value as IdModulo)}>
            {GRUPOS_MODULOS.map((g) => <optgroup key={g} label={g}>{MODULOS.filter((m) => ESQUEMAS[m].group === g).map((m) => <option key={m} value={m}>{ESQUEMAS[m].title}</option>)}</optgroup>)}
          </Select>
        </Field>
      </PageHeader>
      {msg && <p role={msg.tipo === 'erro' ? 'alert' : 'status'} className={cn('mb-4 rounded-md border p-3 text-sm', msg.tipo === 'erro' ? 'border-destructive/40 bg-destructive/5 text-destructive' : 'border-success/40 bg-success/5')}>{msg.texto}</p>}
      {erro && <p role="alert" className="mb-4 text-sm text-destructive">Não foi possível carregar {esquema.title.toLowerCase()}: {erro}</p>}

      {desempenho.length > 0 && (
        <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {desempenho.map(({ obra, p, n }) => (
            <Card key={obra.id}><CardContent className="p-4">
              <div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold">{String(obra.name)}</p>
                <span className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">{n} atividades{(obra.baseline as { revision?: number } | undefined)?.revision ? ` · base rev. ${(obra.baseline as { revision: number }).revision}` : ''}
                  <Button size="sm" variant="outline" aria-label={`Relatório em PDF de ${String(obra.name)}`} onClick={() => void gerarRelatorio(obra)}><FileText className="h-3.5 w-3.5" />Relatório PDF</Button></span></div>
              {n === 0 ? <p className="mt-2 text-xs text-muted-foreground">Sem cronograma: cadastre atividades ou importe do MS Project.</p> : (
                <>
                  <div className="mt-2 space-y-1.5">
                    {([['Planejado', p.planned, 'color-mix(in srgb, var(--series-1) 35%, transparent)'], ['Realizado', p.actual, 'var(--series-1)']] as const).map(([r, v, cor]) => (
                      <div key={r} className="flex items-center gap-2 text-[11px]"><span className="w-16 text-muted-foreground">{r}</span>
                        <div className="h-2 flex-1 rounded-full bg-secondary"><div className="h-full rounded-full" style={{ width: `${Math.min(100, v)}%`, background: cor }} /></div>
                        <span className="tabular w-12 text-right">{num(v, 1)}%</span></div>
                    ))}
                  </div>
                  <dl className="tabular mt-3 grid grid-cols-4 gap-2 text-[11px]">
                    <div><dt className="text-muted-foreground">Desvio</dt><dd className={cn('font-medium', p.variance < -2 && 'text-destructive')}>{p.variance > 0 ? '+' : ''}{num(p.variance, 1)} p.p.</dd></div>
                    <div><dt className="text-muted-foreground">IDP (prazo)</dt><dd className={cn('font-medium', p.spi < 0.95 && 'text-destructive')}>{Number.isFinite(p.spi) ? num(p.spi, 2) : '—'}</dd></div>
                    <div><dt className="text-muted-foreground">IDC (custo)</dt><dd className={cn('font-medium', p.cpi < 0.95 && 'text-destructive')}>{Number.isFinite(p.cpi) ? num(p.cpi, 2) : '—'}</dd></div>
                    <div><dt className="text-muted-foreground">Estimativa no término</dt><dd className="font-medium">{brl(p.eac, 0)}</dd></div>
                  </dl>
                </>
              )}
            </CardContent></Card>
          ))}
        </div>
      )}
      {indicadores.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {indicadores.map(([r, v, d]) => <Card key={r}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{r}</p><p className="tabular mt-1 text-lg font-semibold">{v}</p>{d && <p className="text-[11px] text-muted-foreground">{d}</p>}</CardContent></Card>)}
        </div>
      )}

      {editando && <Formulario key={editando === 'novo' ? 'novo' : editando.id} esquema={esquema} modulo={modulo} registro={editando === 'novo' ? null : editando} obraPadrao={obraId} referencias={referencias} onCancelar={() => setEditando(null)} onSalvar={salvar} />}

      <Card>
        <CardHeader className="flex-row flex-wrap items-end justify-between gap-3">
          <div><CardTitle>{esquema.title}</CardTitle><CardDescription className="mt-1">{registros.length} registro(s){obraId && temObra ? ' nesta obra' : ''}</CardDescription></div>
          <div className="flex flex-wrap items-end gap-2">
            {(temObra || modulo === 'activities') && <Select className="w-56" aria-label="Filtrar por obra" value={modulo === 'activities' && visao === 'gantt' ? obraSel?.id ?? '' : obraId} onChange={(e) => setObraId(e.target.value)}>
              {!(modulo === 'activities' && visao === 'gantt') && <option value="">Todas as obras</option>}
              {obras.map((o) => <option key={o.id} value={o.id}>{String(o.name)}</option>)}
            </Select>}
            <Input className="w-48" placeholder="Buscar…" aria-label="Buscar nos registros" value={busca} onChange={(e) => setBusca(e.target.value)} />
            {modulo === 'activities' && <Segmented value={visao} onChange={setVisao} options={[{ value: 'tabela', label: 'Tabela' }, { value: 'gantt', label: 'Gantt' }]} />}
            {modulo === 'activities' && obraSel && <Button variant="outline" onClick={exportarProject}><Download className="h-4 w-4" />MS Project</Button>}
            {modulo === 'activities' && obraSel && gravavel && <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input px-4 text-sm font-medium hover:bg-accent focus-within:ring-2 focus-within:ring-ring"><FileUp className="h-4 w-4" />Importar XML
              <input type="file" accept=".xml" className="sr-only" onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ''; if (a) void importarProject(a); }} /></label>}
            {modulo === 'activities' && obraSel && (role === 'socio_diretor' || role === 'coordenador') && <Button variant="outline" onClick={() => void congelarLinhaBase()}><Flag className="h-4 w-4" />{linhaBase ? `Replanejar (base rev. ${linhaBase.revision})` : 'Congelar linha de base'}</Button>}
            {gravavel && <Button onClick={() => setEditando('novo')}><Plus className="h-4 w-4" />Novo</Button>}
          </div>
        </CardHeader>
        <CardContent>
          {carregando ? <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
            : modulo === 'activities' && visao === 'gantt' ? <GanttObra atividades={atividadesDaObra as unknown as AtividadeGantt[]} linhaBase={linhaBase?.items} onAbrir={gravavel ? (id) => setEditando(atividadesDaObra.find((a) => a.id === id) ?? null) : undefined} />
            : registros.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Nenhum registro{busca ? ' para esta busca' : ''}. {gravavel && !busca ? 'Use "Novo" para começar.' : ''}</p>
            : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead><tr className="border-b text-left text-xs text-muted-foreground">
                    {colunas.map((c) => <th key={c[0]} className={cn('px-2 py-2 font-medium first:pl-0', c[2] === 'number' && 'text-right')}>{c[1].replace(' (opcional)', '')}</th>)}
                    {modulo === 'measurements' && <th className="px-2 py-2 text-right font-medium">Líquido</th>}
                    {modulo === 'contracts' && <th className="px-2 py-2 text-right font-medium">Saldo a medir</th>}
                    {modulo === 'budgets' && <th className="px-2 py-2 text-right font-medium">Preço de venda</th>}
                    <th className="w-20" />
                  </tr></thead>
                  <tbody className="divide-y">
                    {registros.map((r) => (
                      <tr key={r.id} className="align-top">
                        {colunas.map((c) => <td key={c[0]} className={cn('max-w-[280px] px-2 py-2 first:pl-0', c[2] === 'number' && 'tabular whitespace-nowrap text-right', c[2] === 'date' && 'tabular whitespace-nowrap')}>{formatar(c, r)}</td>)}
                        {modulo === 'measurements' && <td className="tabular whitespace-nowrap px-2 py-2 text-right font-medium">{brl(measurementNet(r).net)}</td>}
                        {modulo === 'contracts' && <td className="tabular whitespace-nowrap px-2 py-2 text-right font-medium">{brl(contractBalance(r, medicoes).balance)} <span className="font-normal text-muted-foreground">({pct(contractBalance(r, medicoes).percentLeft / 100, 0)})</span></td>}
                        {modulo === 'budgets' && <td className="tabular whitespace-nowrap px-2 py-2 text-right font-medium">{brl(budgetSale(r))}</td>}
                        <td className="whitespace-nowrap py-1 text-right">
                          {gravavel && <><Button size="icon" variant="ghost" aria-label={`Editar ${rotuloRegistro(modulo, r)}`} onClick={() => { setEditando(r); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Pencil className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" aria-label={`Excluir ${rotuloRegistro(modulo, r)}`} onClick={() => void excluir(r)}><Trash2 className="h-4 w-4" /></Button></>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </CardContent>
      </Card>
    </>
  );
}

function Formulario({ esquema, modulo, registro, obraPadrao, referencias, onCancelar, onSalvar }: {
  esquema: EsquemaModulo; modulo: IdModulo; registro: Reg | null; obraPadrao: string; referencias: Partial<Record<IdModulo, Reg[]>>;
  onCancelar: () => void; onSalvar: (dados: Record<string, unknown>, id?: string) => Promise<void>;
}) {
  const [v, setV] = React.useState<Record<string, string>>(() => {
    const ini: Record<string, string> = {};
    for (const f of esquema.fields) ini[f[0]] = registro?.[f[0]] != null ? String(registro[f[0]]) : f[0] === 'workId' ? obraPadrao : f[2] === 'select' ? f[4]?.[0] ?? '' : f[2] === 'date' && f[3] && f[0] === 'date' ? new Date().toISOString().slice(0, 10) : '';
    return ini;
  });
  const [erros, setErros] = React.useState<Record<string, string>>({});
  const [salvando, setSalvando] = React.useState(false);
  const campos = esquema.fields.filter((f) => f[2] !== 'file');
  const temArquivo = esquema.fields.some((f) => f[2] === 'file');

  const enviar = async () => {
    const e: Record<string, string> = {};
    const dados: Record<string, unknown> = {};
    for (const f of campos) {
      const bruto = (v[f[0]] ?? '').trim();
      if (f[3] && bruto === '') { e[f[0]] = 'Obrigatório'; continue; }
      if (f[2] === 'number') {
        if (bruto === '') { dados[f[0]] = 0; continue; }
        const n = Number(bruto.replace(/\./g, '').replace(',', '.'));
        const direto = Number(bruto);
        const valor = Number.isFinite(direto) ? direto : n;
        if (!Number.isFinite(valor) || valor < 0) { e[f[0]] = 'Número inválido'; continue; }
        if (/%/.test(f[1]) && valor > 100) { e[f[0]] = 'Máximo 100'; continue; }
        dados[f[0]] = valor;
      } else if (f[2] === 'url' && bruto && !/^https:\/\//i.test(bruto)) e[f[0]] = 'Use um link https://';
      else if (f[2] === 'email' && bruto && !/^\S+@\S+\.\S+$/.test(bruto)) e[f[0]] = 'E-mail inválido';
      else dados[f[0]] = bruto;
    }
    for (const [ini, fim] of [['start', 'end'], ['date', 'dueDate']] as const) {
      if (dados[ini] && dados[fim] && String(dados[fim]) < String(dados[ini])) e[fim] = 'Anterior à data inicial';
    }
    setErros(e);
    if (Object.keys(e).length) return;
    setSalvando(true);
    await onSalvar(dados, registro?.id);
    setSalvando(false);
  };

  return (
    <Card className="mb-4 border-primary/40">
      <CardHeader className="flex-row items-center justify-between"><CardTitle>{registro ? `Editar — ${rotuloRegistro(modulo, registro) || esquema.title}` : `Novo registro — ${esquema.title}`}</CardTitle>
        <Button size="icon" variant="ghost" aria-label="Fechar formulário" onClick={onCancelar}><X className="h-4 w-4" /></Button></CardHeader>
      <CardContent>
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(ev) => { ev.preventDefault(); void enviar(); }}>
          {campos.map((f) => {
            const [chave, rotulo, tipo, obrig, opcoes] = f;
            const col = COLECAO_DA_REFERENCIA[tipo];
            const comum = { value: v[chave] ?? '', 'aria-invalid': !!erros[chave], onChange: (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((x) => ({ ...x, [chave]: ev.target.value })) };
            return (
              <Field key={chave} label={`${rotulo}${obrig ? ' *' : ''}`} className={tipo === 'textarea' ? 'sm:col-span-2 lg:col-span-3' : ''}>
                {tipo === 'select' ? <Select {...comum}>{(opcoes ?? []).map((o) => <option key={o}>{o}</option>)}</Select>
                  : col ? <Select {...comum}><option value="">{obrig ? 'Selecione…' : '— nenhum —'}</option>
                    {(referencias[col] ?? []).filter((r) => col === 'works' || !v.workId || !r.workId || r.workId === v.workId).map((r) => <option key={r.id} value={r.id}>{rotuloRegistro(col, r)}</option>)}</Select>
                  : tipo === 'textarea' ? <Textarea className="min-h-[70px]" {...comum} />
                  : <Input type={tipo === 'date' ? 'date' : tipo === 'number' ? 'text' : tipo === 'email' ? 'email' : tipo === 'url' ? 'url' : 'text'} inputMode={tipo === 'number' ? 'decimal' : undefined} className={tipo === 'number' ? 'tabular' : ''} {...comum} />}
                {erros[chave] && <span role="alert" className="text-[11px] text-destructive">{erros[chave]}</span>}
              </Field>
            );
          })}
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-3">
            <Button type="submit" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</Button>
            <Button variant="ghost" onClick={onCancelar}>Cancelar</Button>
            {temArquivo && <span className="text-[11px] text-muted-foreground">Envio de arquivo ainda não disponível aqui: informe o link HTTPS do documento.</span>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
