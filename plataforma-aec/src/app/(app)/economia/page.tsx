'use client';
/** Análise econômica da obra (módulo do ObraTop 3): margem estimada, caixa, Curva ABC de custos, sensibilidade e reajuste. */
import * as React from 'react';
import { AlertTriangle, Download, Printer } from 'lucide-react';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, Field, Input, Select, Textarea } from '@/components/ui/form';
import { useAuth } from '@/hooks/use-auth';
import { atualizarDoc } from '@/hooks/use-colecao';
import { useDados } from '@/hooks/use-dados';
import { auditar } from '@/lib/auditoria';
import { brl, num } from '@/lib/format';
import { podeGravarModulo, veTodasAsObras } from '@/lib/obratop/permissoes';
import { analyze, numeric } from '@/lib/obratop/vendor/economics.mjs';
import { cn } from '@/lib/utils';

const CAMPOS: [string, string, 'number' | 'date' | 'text' | 'textarea'][] = [
  ['initialCash', 'Saldo inicial da obra (R$)', 'number'], ['remainingCost', 'Custo restante estimado (R$)', 'number'], ['estimateDate', 'Data da estimativa', 'date'], ['estimateNote', 'Premissas do custo restante', 'text'],
  ['indexName', 'Série contratual (ex.: INCC-M, IPCA)', 'text'], ['indexSource', 'Fonte dos números-índice', 'text'], ['baseDate', 'Data-base contratual', 'date'], ['indexDate', 'Data de referência do índice', 'date'],
  ['baseIndex', 'Número-índice na base', 'number'], ['currentIndex', 'Número-índice de referência', 'number'], ['eligibleAmount', 'Parcela elegível ao reajuste (R$)', 'number'], ['contractClause', 'Cláusula e condições de reajuste', 'text'],
  ['event', 'Evento alegado para recomposição', 'textarea'], ['evidence', 'Documentos, nexo causal e matriz de riscos', 'textarea'],
];
const dinheiro = (v: number | null) => (v === null ? 'Dados insuficientes' : brl(v));
const n2 = (v: number | null) => (v === null ? '—' : num(v, 2));

export default function Economia() {
  const { tenantId, usuario, funcao, obraAtribuida } = useAuth();
  const d = useDados();
  const obras = d.works.filter((w) => !w.deleted).sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')));
  const [obraEscolhida, setObra] = React.useState('');
  const [corte, setCorte] = React.useState(() => new Date().toISOString().slice(0, 10));
  const obraId = veTodasAsObras(funcao) ? (obraEscolhida || String(obras[0]?.id ?? '')) : (obraAtribuida ?? '');
  const obra = obras.find((w) => w.id === obraId);
  const editavel = !!obra && podeGravarModulo(funcao, 'works', false, obraAtribuida) && (veTodasAsObras(funcao) ? funcao !== 'finance' : obraAtribuida === obra.id);
  const [p, setP] = React.useState<Record<string, string>>({});
  const [msg, setMsg] = React.useState<{ tipo: 'ok' | 'erro'; texto: string }>();
  React.useEffect(() => { const e = (obra?.economics ?? {}) as Record<string, unknown>; setP(Object.fromEntries(CAMPOS.map(([k]) => [k, e[k] == null ? '' : String(e[k])]))); }, [obra?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- recarrega ao trocar de obra

  const r = React.useMemo(() => { if (!obra) return null; try { return analyze(obra, d as unknown as Record<string, unknown[]>, corte); } catch { return null; } }, [obra, d, corte]);
  const salvar = async () => {
    if (!tenantId || !obra) return;
    const valores: Record<string, unknown> = {};
    for (const [k, , t] of CAMPOS) { const bruto = (p[k] ?? '').trim(); valores[k] = t === 'number' ? numeric(bruto.replace(/\./g, '').replace(',', '.')) : bruto; }
    if (valores.remainingCost !== null && (!valores.estimateDate || !valores.estimateNote)) { setMsg({ tipo: 'erro', texto: 'Informe a data e as premissas da estimativa de custo restante.' }); return; }
    try {
      await atualizarDoc(tenantId, `works/${obra.id}`, { economics: valores, updatedAt: new Date().toISOString(), updatedBy: usuario?.uid ?? '' });
      void auditar(tenantId, usuario, 'economics-parameters', 'works', obra.id, { economics: obra.economics }, { economics: valores });
      setMsg({ tipo: 'ok', texto: 'Parâmetros salvos (valem também no ObraTop 3).' });
    } catch { setMsg({ tipo: 'erro', texto: 'Não foi possível salvar os parâmetros.' }); }
  };
  const baixarCsv = () => {
    if (!r) return;
    const c = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
    const linhas = [['Mês', 'Recebido', 'Pago', 'Entrada prevista', 'Saída prevista', 'Custo por competência', 'Saldo projetado'], ...r.rows.map((x) => [x.month, x.received, x.paid, x.forecastIn, x.forecastOut, x.cost, x.projectedBalance].map((v) => (typeof v === 'number' ? v.toFixed(2).replace('.', ',') : v)))];
    const url = URL.createObjectURL(new Blob([`﻿${linhas.map((l) => l.map(c).join(';')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `Economia_${String(obra?.name ?? 'obra').replace(/[^\w]+/g, '_')}_${corte}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  const veredito = !r || r.margin === null ? 'Não há dados suficientes para concluir sobre a margem final.' : r.margin < 0 ? `A estimativa aponta déficit de ${brl(-r.margin)}. Revise o custo restante e identifique as causas documentadas.` : `A estimativa aponta margem de ${brl(r.margin)} (${n2(r.marginPct)}%), condicionada à completude dos custos e ao recebimento contratual.`;

  return (
    <>
      <PageHeader titulo="Análise econômica" descricao="Margem estimada, caixa, Curva ABC de custos, sensibilidade e reajuste contratual da obra.">
        {veTodasAsObras(funcao) && <Field label="Obra" className="w-60"><Select value={obraId} onChange={(e) => setObra(e.target.value)}>{obras.map((o) => <option key={o.id} value={o.id}>{String(o.name)}</option>)}</Select></Field>}
        <Field label="Data de corte" className="w-40"><Input type="date" value={corte} onChange={(e) => setCorte(e.target.value || corte)} /></Field>
        {r && <Button variant="outline" className="print:hidden" onClick={baixarCsv}><Download className="h-4 w-4" />Fluxo (CSV)</Button>}
        {r && <Button variant="outline" className="print:hidden" onClick={() => window.print()}><Printer className="h-4 w-4" />Imprimir</Button>}
      </PageHeader>
      {msg && <p role={msg.tipo === 'erro' ? 'alert' : 'status'} className={cn('mb-4 rounded-md border p-3 text-sm', msg.tipo === 'erro' ? 'border-destructive/40 bg-destructive/5 text-destructive' : 'border-success/40 bg-success/5')}>{msg.texto}</p>}
      {!obra ? <p className="text-sm text-muted-foreground">Cadastre uma obra para analisar.</p> : !r ? <p className="text-sm text-muted-foreground">Data de corte inválida.</p> : (<>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {([['Valor contratado', dinheiro(r.contract)], ['Orçamento sem BDI', dinheiro(r.budget)], ['Orçamento com BDI', dinheiro(r.sale)], ['Despesas por competência', dinheiro(r.incurred)],
            ['Custo final estimado', dinheiro(r.eac)], ['Margem estimada', r.margin === null ? 'Dados insuficientes' : `${brl(r.margin)} (${n2(r.marginPct)}%)`], ['Medido até o corte', brl(r.measured)], ['Necessidade de capital', dinheiro(r.funding)]] as const).map(([rot, val]) => (
            <Card key={rot}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{rot}</p><p className={cn('tabular mt-1 text-lg font-semibold', rot === 'Margem estimada' && r.margin !== null && r.margin < 0 && 'text-destructive')}>{val}</p></CardContent></Card>
          ))}
        </div>
        {r.warnings.length > 0 && <Card className="mt-4 border-warning/40"><CardContent className="p-4"><p className="mb-2 flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-warning" />Pontos de atenção</p><ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{r.warnings.map((w) => <li key={w}>{w}</li>)}</ul></CardContent></Card>}
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card><CardHeader><CardTitle>Composição de custos — Curva ABC</CardTitle><CardDescription>Classe A até 80% do acumulado; B até 95%; C o restante.</CardDescription></CardHeader>
            <CardContent>{r.categories.length === 0 ? <p className="text-sm text-muted-foreground">Sem despesas por competência.</p> : <ul className="flex flex-col gap-2.5">{r.categories.map((c) => (
              <li key={c.name}><div className="flex items-baseline justify-between gap-2 text-sm"><span className="truncate"><Badge variant={c.class === 'A' ? 'destructive' : c.class === 'B' ? 'warning' : 'default'} className="mr-2">{c.class}</Badge>{c.name}</span><span className="tabular shrink-0 text-xs text-muted-foreground">{brl(c.value, 0)} · {num(c.share * 100, 1)}% · acum. {num(c.cumulative * 100, 1)}%</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${c.share * 100}%`, background: 'var(--series-1)' }} /></div></li>))}</ul>}</CardContent></Card>
          <Card><CardHeader><CardTitle>Sensibilidade e estatística</CardTitle><CardDescription>Custo restante variando ±10%, sem probabilidade atribuída.</CardDescription></CardHeader>
            <CardContent>
              <table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2 font-medium">Variação</th><th className="px-2 py-2 text-right font-medium">Custo final</th><th className="px-2 py-2 text-right font-medium">Margem</th></tr></thead>
                <tbody className="divide-y">{r.scenarios.map((x) => <tr key={x.change}><td className="py-1.5">{x.change > 0 ? '+' : ''}{x.change}%</td><td className="tabular px-2 py-1.5 text-right">{dinheiro(x.cost)}</td><td className={cn('tabular px-2 py-1.5 text-right', x.margin !== null && x.margin < 0 && 'text-destructive')}>{dinheiro(x.margin)}</td></tr>)}</tbody></table>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-sm"><div><dt className="text-xs text-muted-foreground">Média mensal</dt><dd className="tabular font-medium">{dinheiro(r.mean)}</dd></div><div><dt className="text-xs text-muted-foreground">Desvio padrão</dt><dd className="tabular font-medium">{dinheiro(r.sd)}</dd></div><div><dt className="text-xs text-muted-foreground">Coef. de variação</dt><dd className="tabular font-medium">{r.cv === null ? '—' : `${num(r.cv, 1)}%`}</dd></div></dl>
            </CardContent></Card>
        </div>
        <Card className="mt-4"><CardHeader><CardTitle>Fluxo mensal realizado e projetado</CardTitle><CardDescription>Saldo inicial: {dinheiro(r.initial)}. Recebido {brl(r.received)} · pago {brl(r.paid)} · a pagar vencido {brl(r.overduePay)} · a receber vencido {brl(r.overdueReceive)}.</CardDescription></CardHeader>
          <CardContent className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2 font-medium">Mês</th>{['Recebido', 'Pago', 'Entrada prevista', 'Saída prevista', 'Custo (competência)', r.initial === null ? 'Movimento acumulado' : 'Saldo projetado'].map((h) => <th key={h} className="px-2 py-2 text-right font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y">{r.rows.map((x) => <tr key={x.month}><td className="tabular py-1.5">{x.month.slice(5)}/{x.month.slice(0, 4)}</td>{[x.received, x.paid, x.forecastIn, x.forecastOut, x.cost].map((v, i) => <td key={i} className="tabular px-2 py-1.5 text-right">{brl(v, 0)}</td>)}<td className={cn('tabular px-2 py-1.5 text-right font-medium', x.projectedBalance < 0 && 'text-destructive')}>{brl(x.projectedBalance, 0)}</td></tr>)}</tbody></table></CardContent></Card>
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card><CardHeader><CardTitle>Reajuste contratual — memória de cálculo</CardTitle><CardDescription>R = parcela elegível × (índice de referência ÷ índice-base − 1)</CardDescription></CardHeader>
            <CardContent className="text-sm"><p>Série: {p.indexName || 'não informada'} · Fonte: {p.indexSource || 'não informada'}</p><p className="tabular mt-2 text-lg font-semibold">{r.adjustment.value === null ? '—' : brl(r.adjustment.value)}{r.adjustment.rate !== null && <span className="ml-2 text-sm font-normal text-muted-foreground">({num(r.adjustment.rate * 100, 2)}%)</span>}</p><p className="mt-1 text-xs text-muted-foreground">{r.adjustment.reason}</p></CardContent></Card>
          <Card><CardHeader><CardTitle>Equilíbrio econômico-financeiro</CardTitle><CardDescription>Parecer preliminar — não substitui análise técnica e jurídica.</CardDescription></CardHeader>
            <CardContent className="text-sm"><p className={cn(r.margin !== null && r.margin < 0 && 'text-destructive')}>{veredito}</p><p className="mt-2 text-muted-foreground">Evento: {p.event || 'não informado'}. Evidências: {p.evidence || 'não informadas'}.</p></CardContent></Card>
        </div>
        <Card className="mt-4 print:hidden"><CardHeader><CardTitle>Parâmetros da análise</CardTitle><CardDescription>{editavel ? 'Gravados na obra — os mesmos campos do ObraTop 3.' : 'Somente leitura para a sua função.'}</CardDescription></CardHeader>
          <CardContent><form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
            {CAMPOS.map(([k, rot, t]) => <Field key={k} label={rot} className={t === 'textarea' ? 'sm:col-span-2' : ''}>{t === 'textarea' ? <Textarea className="min-h-[60px]" disabled={!editavel} value={p[k] ?? ''} onChange={(e) => setP((x) => ({ ...x, [k]: e.target.value }))} /> : <Input type={t === 'date' ? 'date' : 'text'} inputMode={t === 'number' ? 'decimal' : undefined} disabled={!editavel} value={p[k] ?? ''} onChange={(e) => setP((x) => ({ ...x, [k]: e.target.value }))} />}</Field>)}
            {editavel && <div className="sm:col-span-2 lg:col-span-4"><Button type="submit">Salvar parâmetros</Button></div>}
          </form></CardContent></Card>
      </>)}
    </>
  );
}
