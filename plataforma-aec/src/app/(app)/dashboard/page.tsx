'use client';
import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, Clock3, FolderKanban, TrendingUp, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/layout/app-shell';
import { ArtPanel } from '@/components/dashboard/art-panel';
import { Gantt } from '@/components/dashboard/gantt';
import { Kanban } from '@/components/dashboard/kanban';
import { calcularMargens, Cronometro, TabelaMargem } from '@/components/dashboard/timesheet';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Segmented } from '@/components/ui/form';
import { useAuth } from '@/hooks/use-auth';
import { useColecao } from '@/hooks/use-colecao';
import { brlCompacto, diasAte, num, pct } from '@/lib/format';
import { weightedProgress } from '@/lib/obratop/vendor/calc.mjs';
import { pode } from '@/lib/rbac';
import type { ArtRrt, Project, TimesheetEntry } from '@/lib/types';

function Kpi({ icon: Icon, rotulo, valor, detalhe, alerta }: { icon: React.ElementType; rotulo: string; valor: string; detalhe: string; alerta?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{rotulo}</span><Icon className={alerta ? 'h-4 w-4 text-destructive' : 'h-4 w-4'} /></div>
        <p className="tabular mt-2 text-2xl font-semibold tracking-tight">{valor}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detalhe}</p>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { tenantId, tenant, usuario, role } = useAuth();
  const { dados: projetos, carregando, erro } = useColecao<Project>('projects');
  const cliente = role === 'cliente';
  // ART/RRT é informação interna do escritório: o cliente não consulta.
  const { dados: arts } = useColecao<ArtRrt>(cliente ? null : 'artRrt', { grupo: true });
  const gestor = role === 'socio_diretor' || role === 'coordenador';
  // Só gestores podem ler as horas de toda a equipe (regra de segurança) — os demais não consultam.
  const { dados: horas } = useColecao<TimesheetEntry>(gestor ? 'timesheets' : null, { grupo: true });
  const [visao, setVisao] = React.useState<'kanban' | 'gantt'>('kanban');
  // Obras em execução (módulo Gestão de obras): avanço planejado × realizado.
  type Reg = { id: string; deleted?: boolean } & Record<string, unknown>;
  const { dados: obras } = useColecao<Reg>(cliente ? null : 'works');
  const { dados: atividades } = useColecao<Reg>(cliente ? null : 'activities');
  const { dados: itensOrcamento } = useColecao<Reg>(cliente ? null : 'budgets');
  const andamentoObras = React.useMemo(() => {
    const dia = new Date().toISOString().slice(0, 10);
    return obras.filter((o) => !o.deleted && o.status !== 'Concluída').map((o) => {
      const acts = atividades.filter((a) => !a.deleted && a.workId === o.id);
      const args = { acts, budgets: itensOrcamento.filter((b) => !b.deleted), works: [o], day: dia };
      return { obra: o, n: acts.length, planejado: weightedProgress({ ...args, planned: true }), realizado: weightedProgress(args) };
    });
  }, [obras, atividades, itensOrcamento]);

  const ativos = projetos.filter((p) => p.status !== 'concluido');
  const carteira = ativos.reduce((s, p) => s + p.valorContratado, 0);
  const atrasados = ativos.filter((p) => diasAte(p.fim) < 0).length;
  const artPendentes = arts.filter((a) => (a.status === 'a_emitir' || a.status === 'emitida') && diasAte(a.vencimento) <= 7).length;
  const margens = React.useMemo(() => calcularMargens(projetos, horas, tenant?.custoHoraTecnica ?? 0), [projetos, horas, tenant]);
  const totalContratado = margens.reduce((s, m) => s + m.projeto.valorContratado, 0);
  const margemMedia = totalContratado > 0 ? margens.reduce((s, m) => s + m.margem, 0) / totalContratado : 0;
  const horasTotais = margens.reduce((s, m) => s + m.horas, 0);

  if (!tenantId || !usuario) return null;
  return (
    <>
      <PageHeader titulo={cliente ? 'Meus projetos' : 'Projetos'} descricao={cliente ? 'Acompanhe o andamento dos seus projetos em tempo real.' : 'Carteira de projetos, prazos, responsabilidade técnica e rentabilidade em tempo real.'}>
        {!cliente && <><Link href="/briefing/" className="inline-flex h-9 items-center rounded-md border border-input px-4 text-sm font-medium hover:bg-accent">Novo briefing</Link>
        <Link href="/orcamento/" className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">Novo orçamento</Link></>}
      </PageHeader>
      {erro && <p role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">Não foi possível carregar os projetos: {erro}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={FolderKanban} rotulo="Projetos ativos" valor={String(ativos.length)} detalhe={atrasados ? `${atrasados} com prazo vencido` : 'Todos dentro do prazo'} alerta={atrasados > 0} />
        <Kpi icon={Wallet} rotulo="Carteira contratada" valor={brlCompacto(carteira)} detalhe="Honorários de projetos em andamento" />
        {gestor
          ? <Kpi icon={TrendingUp} rotulo="Margem real média" valor={pct(margemMedia, 0)} detalhe={`${num(horasTotais, 0)} h técnicas lançadas`} alerta={margemMedia < 0} />
          : <Kpi icon={Clock3} rotulo="Entregas em 14 dias" valor={String(ativos.filter((p) => { const d = diasAte(p.fim); return d >= 0 && d <= 14; }).length)} detalhe="Projetos com entrega próxima" />}
        <Kpi icon={AlertTriangle} rotulo="ART/RRT pendentes" valor={String(artPendentes)} detalhe="Vencidas ou vencendo em 7 dias" alerta={artPendentes > 0} />
      </div>

      <Card className="mt-4">
        <CardHeader className="flex-row items-center justify-between">
          <div><CardTitle>Projetos</CardTitle><CardDescription className="mt-1">{visao === 'kanban' ? 'Arraste os cartões para mudar a etapa.' : 'Prazo contratado e progresso de cada projeto.'}</CardDescription></div>
          <Segmented value={visao} onChange={setVisao} options={[{ value: 'kanban', label: 'Kanban' }, { value: 'gantt', label: 'Gantt' }]} />
        </CardHeader>
        <CardContent>
          {carregando ? <p className="py-10 text-center text-sm text-muted-foreground">Carregando projetos…</p>
            : projetos.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Nenhum projeto ainda. Comece por um briefing.</p>
            : visao === 'kanban' ? <Kanban projetos={projetos} tenantId={tenantId} podeEditar={pode(role, 'projeto.editar')} />
            : <div className="pt-4"><Gantt projetos={[...ativos].sort((a, b) => a.fim.localeCompare(b.fim))} /></div>}
        </CardContent>
      </Card>

      {andamentoObras.length > 0 && (
        <Card className="mt-4">
          <CardHeader className="flex-row items-center justify-between"><div><CardTitle>Obras em execução</CardTitle><CardDescription className="mt-1">Avanço físico planejado × realizado, ponderado pelo orçamento ou pela duração.</CardDescription></div>
            <Link href="/gestao/works/" className="text-sm font-medium text-primary underline-offset-2 hover:underline">Gestão de obras</Link></CardHeader>
          <CardContent className="grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-2">
            {andamentoObras.map(({ obra, n, planejado, realizado }) => {
              const desvio = realizado - planejado;
              return (
                <div key={obra.id}>
                  <div className="flex items-baseline justify-between gap-2"><p className="truncate text-sm font-medium">{String(obra.name)}</p>
                    <span className={desvio < -2 ? 'tabular shrink-0 text-xs font-medium text-destructive' : 'tabular shrink-0 text-xs text-muted-foreground'}>{n === 0 ? 'sem cronograma' : `${desvio > 0 ? '+' : ''}${num(desvio, 1)} p.p.${desvio < -2 ? ' · atrasada' : ''}`}</span></div>
                  {n > 0 && ([['Planejado', planejado, 'color-mix(in srgb, var(--series-1) 35%, transparent)'], ['Realizado', realizado, 'var(--series-1)']] as const).map(([r, v, cor]) => (
                    <div key={r} className="mt-1.5 flex items-center gap-2 text-xs"><span className="w-16 text-muted-foreground">{r}</span>
                      <div className="h-2 flex-1 rounded-full bg-secondary" role="progressbar" aria-label={`${r} — ${String(obra.name)}`} aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full" style={{ width: `${Math.min(100, v)}%`, background: cor }} /></div>
                      <span className="tabular w-12 text-right">{num(v, 1)}%</span></div>
                  ))}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {!cliente && <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader><CardTitle>Horas técnicas e margem real</CardTitle><CardDescription>Valor cobrado × horas gastas ao custo de {brlCompacto(tenant?.custoHoraTecnica ?? 0)}/h.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            {pode(role, 'timesheet.lancar') && <Cronometro projetos={projetos} tenantId={tenantId} uid={usuario.uid} nome={usuario.nome} />}
            {gestor && <TabelaMargem margens={margens.filter((m) => m.horas > 0)} />}
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>ART / RRT</CardTitle><CardDescription>Emissão, pagamento e vinculação por etapa.</CardDescription></CardHeader>
          <CardContent><ArtPanel registros={arts} /></CardContent>
        </Card>
      </div>}
    </>
  );
}
