'use client';
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/form';
import { brl, dataBr, diasAte } from '@/lib/format';
import { DISCIPLINA_LABEL, type ArtRrt, type ArtStatus } from '@/lib/types';

const STATUS: Record<ArtStatus, string> = { a_emitir: 'A emitir', emitida: 'Emitida — a pagar', paga: 'Paga', vinculada: 'Vinculada', baixada: 'Baixada' };

/** Painel de alertas de ART (CREA) e RRT (CAU): pendências ordenadas por vencimento. */
export function ArtPanel({ registros }: { registros: ArtRrt[] }) {
  const ordenados = [...registros].sort((a, b) => {
    const pa = a.status === 'a_emitir' || a.status === 'emitida' ? 0 : 1;
    const pb = b.status === 'a_emitir' || b.status === 'emitida' ? 0 : 1;
    return pa - pb || a.vencimento.localeCompare(b.vencimento);
  });
  if (ordenados.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma ART/RRT cadastrada.</p>;
  return (
    <ul className="divide-y">
      {ordenados.map((r) => {
        const pendente = r.status === 'a_emitir' || r.status === 'emitida';
        const dias = diasAte(r.vencimento);
        return (
          <li key={r.id} className="flex items-start gap-3 py-2.5">
            {!pendente ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : dias < 0 ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /> : <Clock className="mt-0.5 h-4 w-4 shrink-0 text-warning" />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{r.tipo} · {DISCIPLINA_LABEL[r.disciplina]} <span className="font-normal text-muted-foreground">— {r.etapa}</span></p>
              <p className="truncate text-xs text-muted-foreground">{r.projetoNome} · {r.responsavel}{r.numero ? ` · nº ${r.numero}` : ''}</p>
            </div>
            <div className="shrink-0 text-right">
              {pendente
                ? <Badge variant={dias < 0 ? 'destructive' : dias <= 7 ? 'warning' : 'default'}>{dias < 0 ? `Vencida há ${-dias} d` : dias === 0 ? 'Vence hoje' : `Vence em ${dias} d`}</Badge>
                : <Badge variant="success">{STATUS[r.status]}</Badge>}
              <p className="tabular mt-1 text-[11px] text-muted-foreground">{pendente ? `${STATUS[r.status]} · ` : ''}{brl(r.valorTaxa)} · {dataBr(r.vencimento)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
