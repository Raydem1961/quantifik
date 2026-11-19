'use client';
/** Curvas S e ABC (menu 7 do ObraTop 3): avanço físico-financeiro e relevância econômica de materiais, pessoal e equipamentos. */
import * as React from 'react';
import { BotaoImprimir } from '@/components/controle/comum';
import { PageHeader } from '@/components/layout/app-shell';
import { CurvaS } from '@/components/portal/painel-cliente';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, Segmented, Select } from '@/components/ui/form';
import { useAuth } from '@/hooks/use-auth';
import { useDados } from '@/hooks/use-dados';
import { brl, num } from '@/lib/format';
import { curvaAbc, serieAcumulada, type ItemAbc } from '@/lib/obratop/controle';
import { veDadosDePessoal, veTodasAsObras } from '@/lib/obratop/permissoes';
import { montarPortal, OPCOES_PADRAO } from '@/lib/portal';

const n = (v: unknown) => Number(v) || 0;
function ListaAbc({ itens, vazio }: { itens: ItemAbc[]; vazio: string }) {
  if (!itens.length) return <p className="text-sm text-muted-foreground">{vazio}</p>;
  return (
    <ul className="flex flex-col gap-2">{itens.slice(0, 25).map((x) => (
      <li key={x.nome}><div className="flex items-baseline justify-between gap-2 text-sm"><span className="truncate"><Badge variant={x.classe === 'A' ? 'destructive' : x.classe === 'B' ? 'warning' : 'default'} className="mr-2">{x.classe}</Badge>{x.nome}</span>
        <span className="tabular shrink-0 text-xs text-muted-foreground">{brl(x.valor, 0)} · {num(x.participacao * 100, 1)}% · acum. {num(x.acumulado * 100, 1)}%</span></div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${x.participacao * 100}%`, background: 'var(--series-1)' }} /></div></li>
    ))}{itens.length > 25 && <li className="text-xs text-muted-foreground">… e mais {itens.length - 25} item(ns) classe C</li>}</ul>
  );
}
function Acumulada({ serie }: { serie: { mes: string; acumulado: number }[] }) {
  if (serie.length < 2) return <p className="text-xs text-muted-foreground">Datas insuficientes para a curva acumulada.</p>;
  const W = 520, H = 120, max = serie.at(-1)!.acumulado || 1, x = (i: number) => 30 + (i * (W - 40)) / (serie.length - 1), y = (v: number) => 10 + (H - 30) * (1 - v / max);
  return <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label={`Curva acumulada em ${serie.length} meses, total ${brl(max, 0)}`}>
    <polyline fill="none" stroke="var(--series-1)" strokeWidth={2.5} points={serie.map((s, i) => `${x(i)},${y(s.acumulado)}`).join(' ')} />
    {serie.map((s, i) => (i % Math.ceil(serie.length / 8) === 0 ? <text key={s.mes} x={x(i)} y={H - 4} fontSize={10} textAnchor="middle" className="fill-muted-foreground">{s.mes.slice(5)}/{s.mes.slice(2, 4)}</text> : null))}
  </svg>;
}

export default function Curvas() {
  const { tenant, funcao, obraAtribuida, tenantId } = useAuth();
  const d = useDados();
  const obras = d.works.filter((w) => !w.deleted);
  const [esc, setEsc] = React.useState('');
  const [modo, setModo] = React.useState<'fisico' | 'financeiro'>('fisico');
  const obraId = veTodasAsObras(funcao) ? (esc || String(obras[0]?.id ?? '')) : (obraAtribuida ?? '');
  const daObra = <T extends { workId?: unknown; deleted?: unknown }>(l: T[]) => l.filter((x) => !x.deleted && (!obraId || x.workId === obraId));
  const hoje = new Date().toISOString().slice(0, 10);
  const curva = React.useMemo(() => { try { return obraId ? montarPortal(tenantId ?? 'org', obraId, d, { nome: tenant?.nomeFantasia ?? '', responsavel: '', registro: '' }, [], OPCOES_PADRAO, hoje).curva : []; } catch { return []; } }, [d, obraId, tenantId, tenant, hoje]);
  const inv = daObra(d.inventory), staff = daObra(d.staff), eq = daObra(d.equipment), vePessoal = veDadosDePessoal(funcao);
  return (
    <>
      <PageHeader titulo="Curvas S e ABC" descricao="Avanço físico-financeiro da obra e classificação por relevância econômica de materiais, pessoal e equipamentos.">
        {veTodasAsObras(funcao) && <Select aria-label="Obra" className="w-56" value={obraId} onChange={(e) => setEsc(e.target.value)}>{obras.map((w) => <option key={w.id} value={w.id}>{String(w.name)}</option>)}</Select>}
        <BotaoImprimir />
      </PageHeader>
      <div className="area-impressao flex flex-col gap-4">
        <Card><CardHeader><CardTitle>Curva S físico-financeira</CardTitle><CardDescription>Previsto (tracejado) contra realizado, acumulados mês a mês.</CardDescription></CardHeader>
          <CardContent><Segmented className="mb-3 print:hidden" value={modo} onChange={setModo} options={[{ value: 'fisico', label: 'Físico (%)' }, { value: 'financeiro', label: 'Financeiro (R$)' }]} /><CurvaS pontos={curva} modo={modo} hoje={hoje} /></CardContent></Card>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card><CardHeader><CardTitle>Materiais (valor em estoque)</CardTitle><CardDescription>Estoque atual × valor unitário.</CardDescription></CardHeader>
            <CardContent><ListaAbc itens={curvaAbc(inv.map((x) => ({ nome: String(x.material ?? ''), valor: n(x.currentStock) * n(x.unitValue) })))} vazio="Sem materiais com valor." />
              <Acumulada serie={serieAcumulada(inv.map((x) => ({ data: String(x.date ?? ''), valor: n(x.currentStock) * n(x.unitValue) })))} /></CardContent></Card>
          <Card><CardHeader><CardTitle>Pessoal (folha)</CardTitle><CardDescription>Salário mensal de quem está alocado.</CardDescription></CardHeader>
            <CardContent>{vePessoal ? <><ListaAbc itens={curvaAbc(staff.map((x) => ({ nome: `${String(x.name ?? '')} — ${String(x.role ?? '')}`, valor: n(x.salary) })))} vazio="Sem pessoal com salário." />
              <Acumulada serie={serieAcumulada(staff.map((x) => ({ data: String(x.admission ?? ''), valor: n(x.salary) })))} /></> : <p className="text-sm text-muted-foreground">Salários visíveis ao Administrador e ao Financeiro.</p>}</CardContent></Card>
          <Card><CardHeader><CardTitle>Máquinas e equipamentos</CardTitle><CardDescription>Custo mensal de cada equipamento.</CardDescription></CardHeader>
            <CardContent><ListaAbc itens={curvaAbc(eq.map((x) => ({ nome: String(x.name ?? ''), valor: n(x.monthlyCost) })))} vazio="Sem equipamentos com custo." />
              <Acumulada serie={serieAcumulada(eq.map((x) => ({ data: String(x.startDate ?? x.nextMaintenance ?? ''), valor: n(x.monthlyCost) })))} /></CardContent></Card>
        </div>
        <p className="text-xs text-muted-foreground">Critério ABC: classe A até 80% do valor acumulado, B até 95%, C o restante. A Curva ABC dos custos realizados fica em Financeiro → Análise econômica.</p>
      </div>
    </>
  );
}
