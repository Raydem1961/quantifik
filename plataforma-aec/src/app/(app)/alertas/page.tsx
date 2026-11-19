'use client';
/** Alertas (menu Início do ObraTop 3): tudo o que venceu ou está para vencer, em todas as obras. */
import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowUpRight, CircleAlert } from 'lucide-react';
import { BotaoImprimir } from '@/components/controle/comum';
import { PageHeader } from '@/components/layout/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, Segmented, Select } from '@/components/ui/form';
import { useAuth } from '@/hooks/use-auth';
import { useDados } from '@/hooks/use-dados';
import { alertas } from '@/lib/obratop/controle';
import { ESQUEMAS } from '@/lib/obratop/esquemas';
import { veTodasAsObras } from '@/lib/obratop/permissoes';
import { dataBr } from '@/lib/format';

export default function Alertas() {
  const { funcao, obraAtribuida } = useAuth();
  const d = useDados() as unknown as Record<string, ({ id: string } & Record<string, unknown>)[]>;
  const [nivel, setNivel] = React.useState<'todos' | 'bad' | 'warn'>('todos');
  const [obraEsc, setObra] = React.useState('');
  const obraId = veTodasAsObras(funcao) ? obraEsc : (obraAtribuida ?? '');
  const hoje = new Date().toISOString().slice(0, 10);
  const lista = React.useMemo(() => alertas(d, hoje, obraId || undefined), [d, hoje, obraId]);
  const vis = lista.filter((a) => nivel === 'todos' || a.nivel === nivel);
  const obras = (d.works ?? []).filter((w) => !w.deleted);
  const nome = (id?: string) => String(obras.find((w) => w.id === id)?.name ?? '');
  return (
    <>
      <PageHeader titulo="Alertas" descricao="Atividades atrasadas, contas vencidas, contratos e documentos vencendo, estoque, manutenção, qualidade e caixa.">
        {veTodasAsObras(funcao) && <Select aria-label="Obra" className="w-56" value={obraEsc} onChange={(e) => setObra(e.target.value)}><option value="">Todas as obras</option>{obras.map((w) => <option key={w.id} value={w.id}>{String(w.name)}</option>)}</Select>}
        <Segmented value={nivel} onChange={setNivel} options={[{ value: 'todos', label: `Todos (${lista.length})` }, { value: 'bad', label: `Críticos (${lista.filter((a) => a.nivel === 'bad').length})` }, { value: 'warn', label: `Atenção (${lista.filter((a) => a.nivel === 'warn').length})` }]} />
        <BotaoImprimir />
      </PageHeader>
      <Card className="area-impressao"><CardContent className="p-0">
        {vis.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">Nenhum alerta. Tudo em dia.</p> : (
          <ul className="divide-y">{vis.map((a, i) => (
            <li key={i}><Link href={`/gestao/${a.modulo}/`} className="flex items-start gap-3 px-4 py-3 hover:bg-accent/50">
              <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${a.nivel === 'bad' ? 'bg-destructive/15 text-destructive' : 'bg-warning/15 text-warning'}`}>{a.nivel === 'bad' ? <CircleAlert className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}</span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{a.titulo}</span><span className="block text-sm text-muted-foreground">{a.texto}</span>
                <span className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground"><Badge variant="outline">{ESQUEMAS[a.modulo]?.title}</Badge>{a.workId && <span>{nome(a.workId)}</span>}<span className="tabular">{dataBr(a.data)}</span></span></span>
              <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground print:hidden" />
            </Link></li>
          ))}</ul>
        )}
      </CardContent></Card>
    </>
  );
}
