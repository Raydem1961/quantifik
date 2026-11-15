'use client';
import * as React from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Avanco, CartaoKpi, FluxoCaixa, ListaPendencias } from '@/components/area/blocos';
import { useAuth } from '@/hooks/use-auth';
import { useColecao } from '@/hooks/use-colecao';
import { useDados } from '@/hooks/use-dados';
import { brlCompacto } from '@/lib/format';
import { fluxoDeCaixa, kpisDaArea, pendencias, type Dados, type Kpi } from '@/lib/indicadores';
import { areaPorId, corDaArea, type Area } from '@/lib/modulos';
import { weightedProgress } from '@/lib/obratop/vendor/calc.mjs';
import type { Project } from '@/lib/types';

const hoje = () => new Date().toISOString().slice(0, 10);

/** Comercial e Engenharia resumem a carteira de projetos (as demais áreas, os registros de obra). */
function kpisDeProjetos(area: string, projetos: Project[], cotacoes: number): Kpi[] | null {
  const ativos = projetos.filter((p) => p.status !== 'concluido');
  if (area === 'comercial') return [
    { rotulo: 'Projetos em briefing', valor: String(projetos.filter((p) => p.status === 'briefing').length), detalhe: 'aguardando proposta' },
    { rotulo: 'Cotações salvas', valor: String(cotacoes) },
    { rotulo: 'Carteira contratada', valor: brlCompacto(ativos.reduce((s, p) => s + (p.valorContratado || 0), 0)), detalhe: `${ativos.length} projeto(s) ativos` },
    { rotulo: 'Concluídos', valor: String(projetos.length - ativos.length) },
  ];
  if (area === 'engenharia') {
    const atras = ativos.filter((p) => p.fim && p.fim < hoje()).length;
    return [
      { rotulo: 'Projetos ativos', valor: String(ativos.length), detalhe: `${projetos.length} na carteira` },
      { rotulo: 'Com prazo vencido', valor: String(atras), alerta: atras > 0 },
      { rotulo: 'Em projeto executivo', valor: String(projetos.filter((p) => p.status === 'projeto_executivo').length) },
      { rotulo: 'Avanço médio', valor: ativos.length ? `${(ativos.reduce((s, p) => s + (p.progresso || 0), 0) / ativos.length).toFixed(0)}%` : '—' },
    ];
  }
  return null;
}

function Destaque({ area, d }: { area: Area; d: Dados }) {
  const dia = hoje();
  if (area.id === 'financeiro') return <Painel titulo="Fluxo de caixa projetado" sub="Seis meses a partir de hoje, pelos lançamentos e vencimentos."><FluxoCaixa meses={fluxoDeCaixa(d, dia).rows} /></Painel>;
  if (area.id === 'planejamento' || area.id === 'orcamento') {
    const obras = d.works.filter((w) => !w.deleted && w.status !== 'Concluída');
    return (
      <Painel titulo="Avanço das obras" sub="Realizado (barra) contra o planejado para hoje (marca).">
        {obras.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma obra em andamento.</p> : <div className="flex flex-col gap-4">{obras.map((w) => {
          const args = { acts: d.activities.filter((a) => !a.deleted && a.workId === w.id), budgets: d.budgets.filter((b) => !b.deleted), works: [w], day: dia };
          return <Avanco key={w.id} nome={String(w.name)} planejado={weightedProgress({ ...args, planned: true })} realizado={weightedProgress(args)} detalhe={`${args.acts.length} atividade(s) · ${brlCompacto(Number(w.value) || 0)}`} />;
        })}</div>}
      </Painel>
    );
  }
  return null;
}

function Painel({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="text-sm font-semibold tracking-tight">{titulo}</h2>
      {sub && <p className="mb-4 mt-1 text-xs text-muted-foreground">{sub}</p>}
      {children}
    </section>
  );
}

export function TelaArea({ id }: { id: string }) {
  const area = areaPorId(id);
  const { role } = useAuth();
  const d = useDados();
  const { dados: projetos } = useColecao<Project>('projects');
  const { dados: cotacoes } = useColecao<{ id: string }>('cotacoes');
  if (!area) return null;
  const dia = hoje();
  const kpis = kpisDeProjetos(area.id, projetos, cotacoes.length) ?? kpisDaArea(area.id, d, dia);
  const pend = pendencias(d, dia).filter((p) => p.area === area.id);
  const telas = area.telas.filter((t) => !t.soDono || role === 'socio_diretor');
  return (
    <div style={corDaArea(area.matiz)} className="aurora">
      <header className="mb-6 flex items-center gap-4">
        <span className="icone-area h-14 w-14 shrink-0"><area.icone className="h-7 w-7" /></span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{area.nome}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{area.resumo}</p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{kpis.map((k, i) => <CartaoKpi key={k.rotulo} k={k} atraso={i * 60} />)}</div>

      <h2 className="mb-3 mt-7 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Telas desta área</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {telas.map((t, i) => (
          <Link key={t.href} href={t.href} onClick={() => { try { sessionStorage.setItem('obratop.area', area.id); } catch { /* sem armazenamento */ } }} className="tile entrar group flex flex-col gap-3 p-4" style={{ animationDelay: `${120 + i * 50}ms` }}>
            <span className="flex items-center justify-between"><span className="icone-area h-10 w-10"><t.icone className="h-5 w-5" /></span>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></span>
            <span><span className="block text-sm font-semibold">{t.rotulo}</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{t.descricao}</span></span>
          </Link>
        ))}
      </div>

      <div className="mt-7 grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="xl:col-span-3"><Destaque area={area} d={d} /></div>
        <div className={area.id === 'financeiro' || area.id === 'planejamento' || area.id === 'orcamento' ? 'xl:col-span-2' : 'xl:col-span-5'}>
          <Painel titulo="Precisa de atenção" sub="Atualizado em tempo real a partir dos registros."><ListaPendencias itens={pend} /></Painel>
        </div>
      </div>
    </div>
  );
}
