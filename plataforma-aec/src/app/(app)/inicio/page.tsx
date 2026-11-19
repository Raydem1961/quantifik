'use client';
import * as React from 'react';
import Link from 'next/link';
import { ArrowUpRight, Search } from 'lucide-react';
import { Avanco, FluxoCaixa, ListaPendencias } from '@/components/area/blocos';
import { useAuth } from '@/hooks/use-auth';
import { useColecao } from '@/hooks/use-colecao';
import { useDados } from '@/hooks/use-dados';
import { brlCompacto } from '@/lib/format';
import { fluxoDeCaixa, kpisDaArea, pendencias } from '@/lib/indicadores';
import { AREAS, corDaArea } from '@/lib/modulos';
import { weightedProgress } from '@/lib/obratop/vendor/calc.mjs';
import type { Project } from '@/lib/types';

const saudacao = (h: number) => (h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite');

export default function Inicio() {
  const { usuario, tenant, funcao } = useAuth();
  const d = useDados();
  const { dados: projetos } = useColecao<Project>('projects');
  // Data e hora só depois de montar: a página é pré-renderizada e não pode fixar o dia da compilação.
  const [agora, setAgora] = React.useState<Date | null>(null);
  React.useEffect(() => { setAgora(new Date()); }, []);
  const dia = (agora ?? new Date()).toISOString().slice(0, 10);
  const pend = React.useMemo(() => pendencias(d, dia), [d, dia]);
  const obras = d.works.filter((w) => !w.deleted && w.status !== 'Concluída');
  const projetosAtivos = projetos.filter((p) => p.status !== 'concluido');
  const numeroDaArea = (id: string): { valor: string; rotulo: string } => {
    if (id === 'comercial') return { valor: String(projetos.filter((p) => p.status === 'briefing').length), rotulo: 'em briefing' };
    if (id === 'engenharia') return { valor: String(projetosAtivos.length), rotulo: 'projetos ativos' };
    if (id === 'administrativo') return { valor: String(d.documents.filter((x) => !x.deleted).length), rotulo: 'documentos' };
    const k = kpisDaArea(id, d, dia)[0]!;
    return { valor: k.valor, rotulo: k.rotulo.toLowerCase() };
  };
  const primeiroNome = (usuario?.nome ?? '').split(/[\s@(]/)[0];
  const criticas = pend.filter((p) => p.gravidade === 'critica').length;

  return (
    <div className="aurora">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{agora ? agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }) : ' '} · {tenant?.nomeFantasia}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{agora ? saudacao(agora.getHours()) : 'Olá'}{primeiroNome ? `, ${primeiroNome}` : ''}.</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {pend.length === 0 ? 'Nenhuma pendência hoje. ' : `${pend.length} ponto(s) de atenção${criticas ? `, ${criticas} crítico(s)` : ''}. `}
            {obras.length} obra(s) em andamento e {projetosAtivos.length} projeto(s) ativos.
          </p>
        </div>
        <p className="flex items-center gap-2 rounded-full border bg-card/60 px-3.5 py-1.5 text-xs text-muted-foreground"><Search className="h-3.5 w-3.5" />Aperte <kbd className="rounded border px-1.5 py-0.5 text-[10px]">Ctrl K</kbd> para ir a qualquer tela</p>
      </header>

      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Áreas</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {AREAS.map((a, i) => {
          const n = numeroDaArea(a.id);
          const alertas = pend.filter((p) => p.area === a.id).length;
          return (
            <Link key={a.id} href={`/area/${a.id}/`} style={{ ...corDaArea(a.matiz), animationDelay: `${i * 45}ms` }} className="tile entrar group flex min-h-[148px] flex-col justify-between p-4">
              <span className="flex items-start justify-between">
                <span className="icone-area h-11 w-11"><a.icone className="h-5 w-5" /></span>
                {alertas > 0 ? <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold text-destructive" aria-label={`${alertas} pendência(s)`}>{alertas}</span>
                  : <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />}
              </span>
              <span>
                <span className="block text-sm font-semibold leading-tight">{a.nome}</span>
                <span className="tabular mt-1.5 block text-xs text-muted-foreground"><span className="texto-area text-base font-semibold">{n.valor}</span> {n.rotulo}</span>
              </span>
            </Link>
          );
        })}
      </div>

      <div className="mt-7 grid grid-cols-1 gap-4 xl:grid-cols-5">
        <section className="rounded-2xl border bg-card p-5 xl:col-span-2">
          <h2 className="text-sm font-semibold tracking-tight">Central de pendências</h2>
          <p className="mb-4 mt-1 text-xs text-muted-foreground">O que pede uma decisão hoje, do mais grave para o menos grave.</p>
          <ListaPendencias itens={pend.slice(0, 6)} />
          <Link href="/alertas/" className="mt-3 inline-block text-xs font-medium text-primary underline-offset-2 hover:underline">Ver todos os alertas</Link>
        </section>
        <div className="flex flex-col gap-4 xl:col-span-3">
          <section className="rounded-2xl border bg-card p-5" style={corDaArea(28)}>
            <div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold tracking-tight">Obras em andamento</h2>
              <Link href="/gestao/works/" className="text-xs font-medium text-primary underline-offset-2 hover:underline">Ver todas</Link></div>
            {obras.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma obra cadastrada ainda. Comece em Planejamento e Obras → Obras.</p> : (
              <div className="flex flex-col gap-4">{obras.slice(0, 4).map((w) => {
                const args = { acts: d.activities.filter((a) => !a.deleted && a.workId === w.id), budgets: d.budgets.filter((b) => !b.deleted), works: [w], day: dia };
                return <Avanco key={w.id} nome={String(w.name)} planejado={weightedProgress({ ...args, planned: true })} realizado={weightedProgress(args)} detalhe={`${String(w.client ?? '')} · ${brlCompacto(Number(w.value) || 0)}`} />;
              })}</div>
            )}
          </section>
          {(funcao === 'owner' || funcao === 'manager' || funcao === 'finance') && (
            <section className="rounded-2xl border bg-card p-5">
              <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold tracking-tight">Fluxo de caixa projetado</h2>
                <Link href="/area/financeiro/" className="text-xs font-medium text-primary underline-offset-2 hover:underline">Financeiro</Link></div>
              <FluxoCaixa meses={fluxoDeCaixa(d, dia).rows} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
