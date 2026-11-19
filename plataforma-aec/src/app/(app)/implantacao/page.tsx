'use client';
/**
 * Manual e Implantação (Administração do ObraTop 3): checklist de implantação por obra, com a
 * contagem do que já foi cadastrado em cada etapa. Grava em works.implantation (mesmo formato).
 */
import * as React from 'react';
import Link from 'next/link';
import { ArrowUpRight, BookOpen, CheckCircle2, Circle, Download } from 'lucide-react';
import { baixar, BotaoImprimir, csvDe, nomeArquivo } from '@/components/controle/comum';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/form';
import { useAuth } from '@/hooks/use-auth';
import { atualizarDoc, useColecao } from '@/hooks/use-colecao';
import { useDados } from '@/hooks/use-dados';
import { CHECKLIST_IMPLANTACAO, contagensImplantacao } from '@/lib/obratop/controle';
import { veTodasAsObras } from '@/lib/obratop/permissoes';
import { cn } from '@/lib/utils';

type Reg = { id: string; deleted?: unknown } & Record<string, unknown>;
type Item = { done?: boolean; by?: string; byEmail?: string; at?: string };

export default function Implantacao() {
  const { tenantId, usuario, funcao, obraAtribuida } = useAuth();
  const d = useDados() as unknown as Record<string, Reg[]>;
  const obras = (d.works ?? []).filter((w) => !w.deleted && (veTodasAsObras(funcao) || w.id === obraAtribuida));
  const [esc, setEsc] = React.useState('');
  const obraId = esc || obras[0]?.id || '';
  const obra = obras.find((w) => w.id === obraId);
  const { dados: membros } = useColecao<Reg>(funcao === 'owner' ? 'members' : null);
  const { dados: historico } = useColecao<Reg>('progressSnapshots');
  const [erro, setErro] = React.useState('');
  const itens = ((obra?.implantation as { items?: Record<string, Item> } | undefined)?.items) ?? {};
  const contagem = obra ? contagensImplantacao(d, obra.id, funcao === 'owner' ? membros.filter((m) => m.status !== 'blocked').length : 1, historico.filter((h) => h.workId === obra.id).length) : {};
  const feitos = CHECKLIST_IMPLANTACAO.filter(([k]) => itens[k]?.done).length;
  const pct = Math.round((feitos / CHECKLIST_IMPLANTACAO.length) * 100);
  const pode = ['owner', 'manager', 'project_user'].includes(funcao);

  const marcar = async (k: string, done: boolean) => {
    if (!tenantId || !obra) return;
    setErro('');
    const agora = new Date().toISOString();
    try {
      await atualizarDoc(tenantId, `works/${obra.id}`, {
        'implantation.manualVersion': '4.1', [`implantation.items.${k}`]: { done, by: usuario?.uid ?? '', byEmail: usuario?.email ?? '', at: agora },
        updatedAt: agora, updatedBy: usuario?.uid ?? '',
      });
    } catch { setErro('Não foi possível salvar. Verifique sua permissão nesta obra.'); }
  };
  const exportar = () => baixar(csvDe([['Etapa', 'Descrição', 'Registros', 'Concluída', 'Por', 'Em'],
    ...CHECKLIST_IMPLANTACAO.map(([k, t]) => [k, t, contagem[k] ?? '', itens[k]?.done ? 'Sim' : 'Não', itens[k]?.byEmail ?? '', itens[k]?.at ? new Date(itens[k]!.at!).toLocaleString('pt-BR') : ''])]),
  `ObraTop_Implantacao_${nomeArquivo(String(obra?.name ?? 'obra'))}.csv`, 'text/csv;charset=utf-8');

  return (
    <>
      <PageHeader titulo="Manual e Implantação" descricao="Siga a sequência para colocar uma obra no ar: cada etapa mostra quantos registros já existem e quem a concluiu.">
        {obras.length > 1 && <Select aria-label="Obra" className="w-56" value={obraId} onChange={(e) => setEsc(e.target.value)}>{obras.map((w) => <option key={w.id} value={w.id}>{String(w.name)}</option>)}</Select>}
        <Button variant="outline" onClick={exportar} disabled={!obra}><Download className="h-4 w-4" />CSV</Button>
        <BotaoImprimir />
        <a href="/manual-obratop.pdf" target="_blank" rel="noopener" className="inline-flex h-9 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium hover:bg-accent print:hidden"><BookOpen className="h-4 w-4" />Manual</a>
      </PageHeader>
      {erro && <p role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{erro}</p>}
      {!obra ? <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Cadastre uma obra para começar a implantação. <Link className="text-primary underline" href="/gestao/works/">Ir para Obras</Link></CardContent></Card> : (
        <Card className="area-impressao">
          <CardHeader>
            <CardTitle>{String(obra.name)}</CardTitle>
            <CardDescription>{feitos} de {CHECKLIST_IMPLANTACAO.length} etapas concluídas ({pct}%)</CardDescription>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Implantação concluída"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
          </CardHeader>
          <CardContent className="p-0">
            <ol className="divide-y">{CHECKLIST_IMPLANTACAO.map(([k, titulo, rota]) => {
              const it = itens[k], c = contagem[k];
              return (
                <li key={k} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <button type="button" disabled={!pode} onClick={() => void marcar(k, !it?.done)} aria-pressed={!!it?.done} aria-label={`${it?.done ? 'Desmarcar' : 'Marcar'} etapa ${k}: ${titulo}`}
                    className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-full', it?.done ? 'text-success' : 'text-muted-foreground', pode && 'hover:bg-accent')}>
                    {it?.done ? <CheckCircle2 className="h-6 w-6" /> : <Circle className="h-6 w-6" />}
                  </button>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium"><span className="tabular mr-2 text-muted-foreground">{k}</span>{titulo}</span>
                    <span className="block text-xs text-muted-foreground">{c == null ? 'Conferência manual' : `${c} registro(s)`}{c === 0 && ' — ainda nada cadastrado'}{it?.done && it.byEmail ? ` · concluída por ${it.byEmail} em ${new Date(it.at ?? '').toLocaleDateString('pt-BR')}` : ''}</span>
                  </span>
                  <Link href={rota} className="inline-flex items-center gap-1 text-sm text-primary hover:underline print:hidden">Abrir<ArrowUpRight className="h-3.5 w-3.5" /></Link>
                </li>
              );
            })}</ol>
          </CardContent>
        </Card>
      )}
    </>
  );
}
