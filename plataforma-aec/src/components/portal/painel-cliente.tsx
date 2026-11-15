'use client';
/** O painel que o cliente vê: contrato, avanço, curva S físico-financeira, etapas, medições, parcelas. */
import * as React from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, CircleDollarSign, Clock3, FileText, Gauge, HardHat, Printer, TrendingUp, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, Segmented } from '@/components/ui/form';
import { brl, brlCompacto, dataBr } from '@/lib/format';
import type { Etapa, Parcela, PontoCurva, Portal } from '@/lib/portal';
import { cn } from '@/lib/utils';

const pc = (v: number, casas = 1) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
const dt = (iso: string) => (iso ? dataBr(iso) : '—');

function Cartao({ icone: Icone, rotulo, valor, detalhe, tom }: { icone: React.ElementType; rotulo: string; valor: string; detalhe?: string; tom?: 'bom' | 'alerta' | 'ruim' }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="flex items-center justify-between gap-2 text-xs text-muted-foreground">{rotulo}<Icone className={cn('h-4 w-4 shrink-0', tom === 'ruim' && 'text-destructive', tom === 'alerta' && 'text-warning', tom === 'bom' && 'text-success')} /></p>
      <p className={cn('tabular mt-2 text-2xl font-semibold tracking-tight', tom === 'ruim' && 'text-destructive')}>{valor}</p>
      <p className="mt-1 min-h-4 text-xs text-muted-foreground">{detalhe}</p>
    </div>
  );
}
function Secao({ titulo, sub, children, className }: { titulo: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('break-inside-avoid rounded-2xl border bg-card p-5', className)}>
      <h2 className="text-sm font-semibold tracking-tight">{titulo}</h2>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Curva S: previsto (tracejado) × realizado (cheio), acumulados. Um eixo, uma medida por vez. */
function CurvaS({ pontos, modo, hoje }: { pontos: PontoCurva[]; modo: 'fisico' | 'financeiro'; hoje: string }) {
  const [foco, setFoco] = React.useState<number | null>(null);
  if (pontos.length < 2) return <p className="text-sm text-muted-foreground">O cronograma ainda não tem meses suficientes para a curva.</p>;
  const prev = pontos.map((p) => (modo === 'fisico' ? p.fisicoPrevisto : p.financeiroPrevisto));
  const real = pontos.map((p) => (modo === 'fisico' ? p.fisicoRealizado : p.financeiroRealizado));
  const max = modo === 'fisico' ? 100 : Math.max(1, ...prev, ...real.map((v) => v ?? 0));
  const W = 720, H = 260, M = { l: 54, r: 14, t: 12, b: 30 };
  const passoX = (W - M.l - M.r) / (pontos.length - 1);
  const x = (i: number) => M.l + passoX * i, y = (v: number) => M.t + (H - M.t - M.b) * (1 - v / max);
  const linha = (vals: (number | null)[]) => vals.map((v, i) => (v === null ? null : `${x(i)},${y(v)}`)).filter(Boolean).join(' ');
  const fmt = (v: number | null) => (v === null ? '—' : modo === 'fisico' ? pc(v) : brl(v, 0));
  const eixo = [0, 0.25, 0.5, 0.75, 1].map((f) => max * f);
  const passo = Math.ceil(pontos.length / 12), iHoje = pontos.findIndex((p) => p.mes === hoje.slice(0, 7));
  const p = foco !== null ? pontos[foco] : undefined;
  return (
    <figure>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><svg width="22" height="6" aria-hidden><line x1="0" y1="3" x2="22" y2="3" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" /></svg>Previsto</span>
        <span className="flex items-center gap-1.5"><span className="h-1 w-5 rounded" style={{ background: 'var(--series-1)' }} />Realizado</span>
        <span className="tabular ml-auto min-h-4 text-foreground">{p ? `${p.rotulo} · previsto ${fmt(prev[foco!]!)} · realizado ${fmt(real[foco!] ?? null)}` : ''}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Curva S ${modo === 'fisico' ? 'física' : 'financeira'}: previsto e realizado acumulados em ${pontos.length} meses`} onMouseLeave={() => setFoco(null)}>
        {eixo.map((v) => <g key={v}><line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} stroke="var(--chart-grid)" /><text x={M.l - 8} y={y(v) + 4} textAnchor="end" fontSize={11} className="fill-muted-foreground tabular">{modo === 'fisico' ? `${v}%` : brlCompacto(v).replace('R$ ', '')}</text></g>)}
        {iHoje >= 0 && <g><line x1={x(iHoje)} x2={x(iHoje)} y1={M.t + 6} y2={H - M.b} className="stroke-foreground/40" strokeDasharray="2 3" /><text x={x(iHoje)} y={M.t + 2} textAnchor="middle" fontSize={10} className="fill-muted-foreground">hoje</text></g>}
        <polyline points={linha(prev)} fill="none" className="stroke-muted-foreground" strokeWidth={2} strokeDasharray="5 4" />
        <polyline points={linha(real)} fill="none" stroke="var(--series-1)" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        {pontos.map((q, i) => (
          <g key={q.mes} onMouseEnter={() => setFoco(i)} onClick={() => setFoco(i)}>
            <rect x={x(i) - passoX / 2} y={0} width={passoX} height={H} fill="transparent" />
            {real[i] !== null && <circle cx={x(i)} cy={y(real[i]!)} r={foco === i ? 5 : 3} fill="var(--series-1)" />}
            {foco === i && <circle cx={x(i)} cy={y(prev[i]!)} r={4} className="fill-muted-foreground" />}
            {i % passo === 0 && <text x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} className="fill-muted-foreground">{q.rotulo}</text>}
          </g>
        ))}
      </svg>
    </figure>
  );
}

const TOM_ETAPA: Record<Etapa['situacao'], [string, 'success' | 'primary' | 'destructive' | 'default']> = { concluida: ['Concluída', 'success'], em_andamento: ['Em andamento', 'primary'], atrasada: ['Atrasada', 'destructive'], a_iniciar: ['A iniciar', 'default'] };
const TOM_PARCELA: Record<Parcela['situacao'], [string, 'success' | 'warning' | 'destructive' | 'default']> = { paga: ['Paga', 'success'], vence_em_breve: ['Vence em breve', 'warning'], vencida: ['Vencida', 'destructive'], a_vencer: ['A vencer', 'default'] };

export function PainelCliente({ portal: p, acoes }: { portal: Portal; acoes?: React.ReactNode }) {
  const [modo, setModo] = React.useState<'fisico' | 'financeiro'>('fisico');
  const i = p.indicadores, k = p.contrato;
  const atraso = i.desvio <= -5, prazoPct = i.prazoTotalDias ? Math.min(100, (i.diasDecorridos / i.prazoTotalDias) * 100) : 0;
  const atrasoDias = i.terminoEstimado && i.terminoPrevisto ? Math.round((Date.parse(i.terminoEstimado) - Date.parse(i.terminoPrevisto)) / 86400000) : 0;
  return (
    <div className="aurora" style={{ ['--area' as string]: '233 70% 56%' }}>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">{p.empresa.nome} · Portal do Cliente</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">{p.obra.nome}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{[p.obra.cliente, p.obra.endereco, k?.numero && `Contrato ${k.numero}`].filter(Boolean).join(' · ')}</p>
          <p className="mt-1 text-xs text-muted-foreground">Atualizado em {new Date(p.atualizadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · situação: <strong className="text-foreground">{p.obra.status || '—'}</strong></p>
        </div>
        <div className="flex gap-2 print:hidden">{acoes}<Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" />Imprimir / PDF</Button></div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cartao icone={HardHat} rotulo="Obra executada" valor={pc(i.fisicoRealizado)} detalhe={`previsto para hoje: ${pc(i.fisicoPrevisto)}`} tom={atraso ? 'ruim' : 'bom'} />
        <Cartao icone={TrendingUp} rotulo="Desvio do cronograma" valor={`${i.desvio > 0 ? '+' : ''}${i.desvio.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} p.p.`} detalhe={i.desvio >= 0 ? 'adiantada ou em dia' : atraso ? 'abaixo do planejado' : 'dentro da tolerância de 5 p.p.'} tom={atraso ? 'ruim' : i.desvio < 0 ? 'alerta' : 'bom'} />
        <Cartao icone={Gauge} rotulo="Índice de prazo (IDP)" valor={i.idp.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} detalhe="1,00 = no ritmo planejado; abaixo = mais lento" tom={i.idp < 0.9 ? 'ruim' : i.idp < 1 ? 'alerta' : 'bom'} />
        <Cartao icone={CalendarClock} rotulo="Entrega estimada" valor={dt(i.terminoEstimado)} detalhe={atrasoDias > 3 ? `${atrasoDias} dias depois do contratado (${dt(i.terminoPrevisto)})` : `contratada: ${dt(i.terminoPrevisto)}`} tom={atrasoDias > 15 ? 'ruim' : atrasoDias > 3 ? 'alerta' : 'bom'} />
        {k && <Cartao icone={FileText} rotulo="Valor do contrato" valor={brlCompacto(k.valorAtual)} detalhe={k.aditivos ? `original ${brlCompacto(k.valorOriginal)} + aditivos ${brlCompacto(k.aditivos)}` : 'sem aditivos'} />}
        {k && <Cartao icone={CircleDollarSign} rotulo="Já medido" valor={brlCompacto(k.medido)} detalhe={`${k.valorAtual ? pc((k.medido / k.valorAtual) * 100, 0) : '—'} do contrato · saldo ${brlCompacto(k.saldo)}`} />}
        <Cartao icone={Wallet} rotulo="Total pago" valor={brlCompacto(i.totalPago)} detalhe={`a vencer: ${brlCompacto(i.totalAVencer)}`} tom="bom" />
        <Cartao icone={i.totalVencido > 0 ? AlertTriangle : Clock3} rotulo={i.totalVencido > 0 ? 'Parcelas vencidas' : 'Próximo vencimento'} valor={i.totalVencido > 0 ? brlCompacto(i.totalVencido) : i.proximoVencimento ? dt(i.proximoVencimento.data) : '—'}
          detalhe={i.totalVencido > 0 ? 'regularize para evitar encargos' : i.proximoVencimento ? `${brl(i.proximoVencimento.valor)} · ${i.proximoVencimento.descricao}` : 'nenhuma parcela em aberto'} tom={i.totalVencido > 0 ? 'ruim' : undefined} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Secao className="xl:col-span-2" titulo="Cronograma físico-financeiro (Curva S)" sub="Acumulado previsto no contrato contra o realizado até hoje.">
          <Segmented className="mb-3 print:hidden" value={modo} onChange={setModo} options={[{ value: 'fisico', label: 'Físico (%)' }, { value: 'financeiro', label: 'Financeiro (R$)' }]} />
          <CurvaS pontos={p.curva} modo={modo} hoje={p.dataBase} />
        </Secao>
        <Secao titulo="Prazo" sub={`${dt(p.obra.inicio)} a ${dt(p.obra.fim)}`}>
          <div className="relative h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${i.diasDecorridos} de ${i.prazoTotalDias} dias decorridos`}><div className="h-full rounded-full bg-primary" style={{ width: `${prazoPct}%` }} /></div>
          <dl className="mt-4 grid grid-cols-2 gap-y-3 text-sm">
            <dt className="text-muted-foreground">Dias decorridos</dt><dd className="tabular text-right font-medium">{i.diasDecorridos} de {i.prazoTotalDias}</dd>
            <dt className="text-muted-foreground">Dias restantes</dt><dd className="tabular text-right font-medium">{i.diasRestantes}</dd>
            <dt className="text-muted-foreground">Prazo consumido</dt><dd className="tabular text-right font-medium">{pc(prazoPct, 0)}</dd>
            <dt className="text-muted-foreground">Obra executada</dt><dd className="tabular text-right font-medium">{pc(i.fisicoRealizado, 0)}</dd>
            <dt className="text-muted-foreground">Etapas concluídas</dt><dd className="tabular text-right font-medium">{i.etapasConcluidas} de {i.etapasTotal}</dd>
            <dt className="text-muted-foreground">Etapas atrasadas</dt><dd className={cn('tabular text-right font-medium', i.etapasAtrasadas > 0 && 'text-destructive')}>{i.etapasAtrasadas}</dd>
            <dt className="text-muted-foreground">Retenção acumulada</dt><dd className="tabular text-right font-medium">{brl(i.retencaoAcumulada)}</dd>
          </dl>
          {k?.motivoAditivos && <p className="mt-4 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground"><strong className="text-foreground">Aditivos:</strong> {k.motivoAditivos}</p>}
        </Secao>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Secao titulo="Parcelas e pagamentos" sub="Valores devidos à construtora, com vencimento e situação.">
          {p.parcelas.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma parcela lançada até o momento.</p> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[460px] text-sm">
              <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2 pr-2 font-medium">Descrição</th><th className="px-2 py-2 font-medium">Vencimento</th><th className="px-2 py-2 text-right font-medium">Valor</th><th className="py-2 pl-2 font-medium">Situação</th></tr></thead>
              <tbody>{p.parcelas.map((x, n) => (
                <tr key={n} className="border-b last:border-0"><td className="py-2 pr-2">{x.descricao}</td><td className="tabular whitespace-nowrap px-2 py-2">{dt(x.vencimento)}</td><td className="tabular whitespace-nowrap px-2 py-2 text-right font-medium">{brl(x.valor)}</td>
                  <td className="whitespace-nowrap py-2 pl-2"><Badge variant={TOM_PARCELA[x.situacao][1]}>{TOM_PARCELA[x.situacao][0]}</Badge>{x.pagoEm && <span className="ml-1.5 text-xs text-muted-foreground">em {dt(x.pagoEm)}</span>}</td></tr>
              ))}</tbody>
              <tfoot><tr className="text-xs text-muted-foreground"><td colSpan={2} className="pt-3">Pago {brl(i.totalPago)} · a vencer {brl(i.totalAVencer)}{i.totalVencido > 0 && <> · <span className="text-destructive">vencido {brl(i.totalVencido)}</span></>}</td><td colSpan={2} className="tabular pt-3 text-right font-semibold text-foreground">{brl(i.totalPago + i.totalAVencer + i.totalVencido)}</td></tr></tfoot>
            </table></div>
          )}
        </Secao>
        <Secao titulo="Medições" sub="Serviços medidos, retenção contratual e valor líquido de cada medição.">
          {p.medicoes.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma medição emitida até o momento.</p> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm">
              <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2 pr-2 font-medium">Nº</th><th className="px-2 py-2 font-medium">Data</th><th className="px-2 py-2 text-right font-medium">Físico</th><th className="px-2 py-2 text-right font-medium">Medido</th><th className="px-2 py-2 text-right font-medium">Retenção</th><th className="px-2 py-2 text-right font-medium">Líquido</th><th className="py-2 pl-2 font-medium">Situação</th></tr></thead>
              <tbody>{p.medicoes.map((m, n) => (
                <tr key={n} className="border-b last:border-0" title={m.descricao}><td className="py-2 pr-2 font-medium">{m.numero}</td><td className="tabular whitespace-nowrap px-2 py-2">{dt(m.data)}</td><td className="tabular px-2 py-2 text-right">{pc(m.fisico)}</td><td className="tabular whitespace-nowrap px-2 py-2 text-right">{brl(m.bruto)}</td>
                  <td className="tabular whitespace-nowrap px-2 py-2 text-right text-muted-foreground">{brl(m.retencao + m.glosa)}</td><td className="tabular whitespace-nowrap px-2 py-2 text-right font-medium">{brl(m.liquido)}</td><td className="py-2 pl-2"><Badge variant={/Paga|Aprovada|Faturada/.test(m.status) ? 'success' : 'default'}>{m.status}</Badge></td></tr>
              ))}</tbody>
            </table></div>
          )}
        </Secao>
      </div>

      <Secao className="mt-4" titulo="Etapas da obra" sub="Cada etapa do cronograma, com o período previsto e o quanto já foi executado.">
        {p.etapas.length === 0 ? <p className="text-sm text-muted-foreground">O cronograma detalhado ainda não foi cadastrado.</p> : (
          <ul className="flex flex-col gap-3">{p.etapas.map((e, n) => (
            <li key={n} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto]">
              <span className="min-w-0"><span className="block truncate text-sm font-medium">{e.eap && <span className="mr-1.5 text-muted-foreground">{e.eap}</span>}{e.nome}</span><span className="block text-xs text-muted-foreground">{dt(e.inicio)} a {dt(e.fim)}</span></span>
              <span className="order-3 col-span-2 flex items-center gap-2 sm:order-none sm:col-span-1">
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${e.nome}: ${pc(e.avanco, 0)} executado`}><span className="block h-full rounded-full" style={{ width: `${e.avanco}%`, background: e.situacao === 'atrasada' ? 'hsl(var(--destructive))' : e.situacao === 'concluida' ? 'hsl(var(--success))' : 'var(--series-1)' }} /></span>
                <span className="tabular w-11 text-right text-xs font-medium">{pc(e.avanco, 0)}</span>
              </span>
              <Badge variant={TOM_ETAPA[e.situacao][1]}>{TOM_ETAPA[e.situacao][0]}</Badge>
            </li>
          ))}</ul>
        )}
      </Secao>

      {(p.diario.length > 0 || p.documentos.length > 0) && (
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          {p.diario.length > 0 && <Secao titulo="Últimos dias na obra" sub="Registros do diário de obra assinados pela equipe.">
            <ul className="flex flex-col gap-3">{p.diario.map((x, n) => <li key={n} className="flex gap-3 text-sm"><span className="tabular w-20 shrink-0 text-xs text-muted-foreground">{dt(x.data)}<br />{x.clima}</span><span>{x.servicos}</span></li>)}</ul>
          </Secao>}
          {p.documentos.length > 0 && <Secao titulo="Documentos" sub="Documentos aprovados e liberados pela construtora.">
            <ul className="flex flex-col divide-y">{p.documentos.map((x, n) => <li key={n} className="flex items-center justify-between gap-3 py-2 text-sm"><span className="min-w-0"><span className="block truncate font-medium">{x.nome}</span><span className="block text-xs text-muted-foreground">{[x.categoria, x.data && dt(x.data)].filter(Boolean).join(' · ')}</span></span>
              <a href={x.url} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-medium text-primary underline-offset-2 hover:underline">Abrir</a></li>)}</ul>
          </Secao>}
        </div>
      )}

      <footer className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 text-success" />Informações publicadas por {p.empresa.nome}{p.empresa.responsavel && <> · Responsável técnico: {p.empresa.responsavel}{p.empresa.registro && ` (${p.empresa.registro})`}</>}{p.obra.responsavel && <> · Engenheiro da obra: {p.obra.responsavel}</>}
      </footer>
    </div>
  );
}
