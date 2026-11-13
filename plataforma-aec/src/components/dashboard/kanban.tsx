'use client';
import * as React from 'react';
import { Badge } from '@/components/ui/form';
import { atualizarDoc } from '@/hooks/use-colecao';
import { brlCompacto, dataBr, diasAte } from '@/lib/format';
import { STATUS_LABEL, type Project, type ProjectStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

const COLUNAS: ProjectStatus[] = ['briefing', 'estudo_preliminar', 'anteprojeto', 'projeto_executivo', 'aprovacao', 'concluido'];

/** Kanban em tempo real: arrastar um cartão grava o novo status (onSnapshot propaga aos demais usuários). */
export function Kanban({ projetos, tenantId, podeEditar }: { projetos: Project[]; tenantId: string; podeEditar: boolean }) {
  const [sobre, setSobre] = React.useState<ProjectStatus | null>(null);
  const [erro, setErro] = React.useState<string>();

  const mover = async (id: string, status: ProjectStatus) => {
    const p = projetos.find((x) => x.id === id);
    if (!p || p.status === status) return;
    try {
      setErro(undefined);
      await atualizarDoc(tenantId, `projects/${id}`, { status, atualizadoEm: new Date().toISOString() });
    } catch {
      setErro(`Não foi possível mover "${p.nome}". Verifique sua permissão e a conexão.`);
    }
  };

  return (
    <div>
      {erro && <p role="alert" className="mb-2 text-xs text-destructive">{erro}</p>}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {COLUNAS.map((status) => {
          const itens = projetos.filter((p) => p.status === status);
          return (
            <section key={status} aria-label={STATUS_LABEL[status]}
              onDragOver={(e) => { if (podeEditar) { e.preventDefault(); setSobre(status); } }}
              onDragLeave={() => setSobre((s) => (s === status ? null : s))}
              onDrop={(e) => { e.preventDefault(); setSobre(null); void mover(e.dataTransfer.getData('text/plain'), status); }}
              className={cn('flex w-60 shrink-0 flex-col gap-2 rounded-lg border bg-muted/40 p-2 transition-colors', sobre === status && 'border-primary bg-primary/5')}>
              <header className="flex items-center justify-between px-1 pt-0.5">
                <h3 className="text-xs font-semibold">{STATUS_LABEL[status]}</h3>
                <span className="tabular text-[11px] text-muted-foreground">{itens.length}</span>
              </header>
              {itens.map((p) => {
                const dias = diasAte(p.fim);
                const atrasado = dias < 0 && p.status !== 'concluido';
                return (
                  <article key={p.id} draggable={podeEditar} onDragStart={(e) => e.dataTransfer.setData('text/plain', p.id)}
                    className={cn('rounded-md border bg-card p-3 shadow-sm', podeEditar && 'cursor-grab active:cursor-grabbing')}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="tabular text-[11px] text-muted-foreground">{p.codigo}</span>
                      {atrasado ? <Badge variant="destructive">Atrasado {-dias} d</Badge> : p.status !== 'concluido' && dias <= 14 ? <Badge variant="warning">{dias} d</Badge> : null}
                    </div>
                    <p className="mt-1 text-sm font-medium leading-snug">{p.nome}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{p.clienteNome} · {p.municipio}/{p.uf}</p>
                    <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={p.progresso} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${p.progresso}%` }} />
                    </div>
                    <div className="tabular mt-2 flex justify-between text-[11px] text-muted-foreground">
                      <span>{brlCompacto(p.valorContratado)}</span><span>entrega {dataBr(p.fim)}</span>
                    </div>
                  </article>
                );
              })}
              {itens.length === 0 && <p className="px-1 py-4 text-center text-[11px] text-muted-foreground">Sem projetos</p>}
            </section>
          );
        })}
      </div>
    </div>
  );
}
