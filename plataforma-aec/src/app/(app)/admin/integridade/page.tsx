'use client';
/**
 * Integridade e manutenção (Administração do ObraTop 3): contagem por cadastro, duplicados
 * (vão para a Lixeira, nada é apagado), registros sem obra válida e revisão da numeração da EAP.
 */
import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ListOrdered, ShieldCheck, Trash2 } from 'lucide-react';
import { BotaoImprimir } from '@/components/controle/comum';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/form';
import { useAuth } from '@/hooks/use-auth';
import { atualizarEmLote, useColecao } from '@/hooks/use-colecao';
import { useDados } from '@/hooks/use-dados';
import { auditar } from '@/lib/auditoria';
import { rotulo, verificarIntegridade } from '@/lib/obratop/controle';
import { ESQUEMAS } from '@/lib/obratop/esquemas';

type Reg = { id: string; deleted?: unknown } & Record<string, unknown>;
const quando = (v: unknown): string => {
  if (!v) return '';
  if (typeof v === 'string') return v;
  const t = v as { toDate?: () => Date; seconds?: number };
  return t.toDate ? t.toDate().toISOString() : typeof t.seconds === 'number' ? new Date(t.seconds * 1000).toISOString() : '';
};

export default function Integridade() {
  const { tenantId, usuario, funcao } = useAuth();
  const dono = funcao === 'owner';
  const d = useDados() as unknown as Record<string, Reg[]>;
  const { dados: audits } = useColecao<Reg>(dono ? 'audits' : null);
  const r = React.useMemo(() => verificarIntegridade(d), [d]);
  const [msg, setMsg] = React.useState<{ tipo: 'ok' | 'erro'; texto: string }>();
  const [ocupado, setOcupado] = React.useState('');
  const ultimoBackup = audits.filter((a) => a.action === 'backup').map((a) => quando(a.createdAt ?? a.at)).sort().pop();
  const diasBackup = ultimoBackup ? Math.floor((Date.now() - Date.parse(ultimoBackup)) / 86400000) : undefined;
  const obras = Object.fromEntries((d.works ?? []).map((w) => [w.id, String(w.name ?? w.id)]));
  const eapComProblema = r.eap.filter((e) => e.changes.length || e.duplicates || e.brokenPred || e.semWbs || e.nonNumeric);

  if (!dono) return (<><PageHeader titulo="Integridade e manutenção" descricao="Somente o administrador geral." /><Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Esta área é do administrador geral da empresa.</CardContent></Card></>);

  const executar = async (chave: string, fn: () => Promise<string>) => {
    setOcupado(chave); setMsg(undefined);
    try { setMsg({ tipo: 'ok', texto: await fn() }); } catch { setMsg({ tipo: 'erro', texto: 'Não foi possível concluir. Verifique a conexão e tente de novo.' }); }
    setOcupado('');
  };
  const moverDuplicados = () => executar('dup', async () => {
    const agora = new Date().toISOString(), quem = usuario?.uid ?? '';
    const ops = r.duplicados.flatMap((g) => g.repetidos.map((x) => ({ caminho: `${g.modulo}/${x.id}`, patch: { deleted: true, deletedAt: agora, deletedBy: quem, deletedReason: 'Duplicado (Integridade e manutenção)', duplicateOf: g.manter.id, sanitizedAt: agora, sanitizedBy: quem } })));
    for (let i = 0; i < ops.length; i += 400) await atualizarEmLote(tenantId!, ops.slice(i, i + 400));
    void auditar(tenantId!, usuario, 'dedupe', 'organizations', tenantId!, undefined, { registros: ops.length });
    return `${ops.length} registro(s) duplicado(s) movido(s) para a Lixeira (podem ser restaurados em Segurança).`;
  });
  const renumerar = (workId: string) => executar(`eap-${workId}`, async () => {
    const e = r.eap.find((x) => x.workId === workId)!, agora = new Date().toISOString(), quem = usuario?.uid ?? '';
    const ops = e.changes.map((c) => ({ caminho: `activities/${c.id}`, patch: { wbs: c.newWbs, predecessors: c.newPred, ...(c.phaseName ? { eapPhaseName: c.phaseName } : {}), updatedAt: agora, updatedBy: quem } }));
    for (let i = 0; i < ops.length; i += 400) await atualizarEmLote(tenantId!, ops.slice(i, i + 400));
    void auditar(tenantId!, usuario, 'eap-renumber', 'activities', workId, undefined, { atividades: ops.length, mapa: JSON.stringify(e.map) });
    return `EAP de ${e.name} renumerada: ${ops.length} atividade(s) ajustada(s), predecessoras atualizadas.`;
  });

  return (
    <>
      <PageHeader titulo="Integridade e manutenção" descricao="Confira os dados da empresa: duplicados, registros sem obra e numeração da EAP. Nada é apagado — duplicados vão para a Lixeira.">
        <BotaoImprimir />
      </PageHeader>
      {msg && <p role={msg.tipo === 'erro' ? 'alert' : 'status'} className={`mb-4 rounded-md border p-3 text-sm ${msg.tipo === 'erro' ? 'border-destructive/40 bg-destructive/5 text-destructive' : 'border-success/40 bg-success/5'}`}>{msg.texto}</p>}
      <div className={`mb-4 flex items-start gap-3 rounded-xl border p-4 text-sm ${diasBackup === undefined || diasBackup > 7 ? 'border-warning/50 bg-warning/5' : 'border-success/40 bg-success/5'}`}>
        {diasBackup === undefined || diasBackup > 7 ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" /> : <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />}
        <span>{diasBackup === undefined ? 'Nenhum backup registrado.' : `Último backup há ${diasBackup} dia(s) (${new Date(ultimoBackup!).toLocaleDateString('pt-BR')}).`} Gere um backup antes de qualquer correção em massa. <Link href="/admin/backup/" className="text-primary underline">Ir para Backup</Link></span>
      </div>

      <div className="grid gap-4 xl:grid-cols-2 area-impressao">
        <Card>
          <CardHeader><CardTitle>Registros por cadastro</CardTitle><CardDescription>Ativos, na lixeira, sem obra válida e duplicados.</CardDescription></CardHeader>
          <CardContent><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2 font-medium">Cadastro</th><th className="px-2 py-2 text-right font-medium">Ativos</th><th className="px-2 py-2 text-right font-medium">Lixeira</th><th className="px-2 py-2 text-right font-medium">Sem obra</th><th className="px-2 py-2 text-right font-medium">Duplicados</th></tr></thead>
            <tbody className="divide-y">{r.porModulo.map((m) => (
              <tr key={m.modulo}><td className="py-1.5">{ESQUEMAS[m.modulo].title}</td><td className="tabular px-2 py-1.5 text-right">{m.ativos}</td><td className="tabular px-2 py-1.5 text-right">{m.lixeira}</td>
                <td className={`tabular px-2 py-1.5 text-right ${m.orfaos ? 'font-semibold text-destructive' : ''}`}>{m.orfaos}</td><td className={`tabular px-2 py-1.5 text-right ${m.duplicados ? 'font-semibold text-warning' : ''}`}>{m.duplicados}</td></tr>
            ))}</tbody></table></CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3"><div><CardTitle>Duplicados</CardTitle><CardDescription>Mesma chave (ex.: obra + nome, número do contrato, CNPJ). Fica o registro mais completo.</CardDescription></div>
              {r.duplicados.length > 0 && <Button variant="outline" disabled={!!ocupado} onClick={() => { if (confirm(`Mover ${r.duplicados.reduce((t, g) => t + g.repetidos.length, 0)} duplicado(s) para a Lixeira?`)) void moverDuplicados(); }} className="print:hidden"><Trash2 className="h-4 w-4" />{ocupado === 'dup' ? 'Movendo…' : 'Mover para a Lixeira'}</Button>}</CardHeader>
            <CardContent>{r.duplicados.length === 0 ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-success" />Nenhum duplicado.</p> : (
              <ul className="divide-y text-sm">{r.duplicados.slice(0, 50).map((g) => (
                <li key={`${g.modulo}-${g.chave}`} className="py-2"><Badge>{ESQUEMAS[g.modulo].title}</Badge> <span className="font-medium">{rotulo(g.modulo, g.manter)}</span> <span className="text-muted-foreground">— mantém 1, move {g.repetidos.length}</span></li>
              ))}</ul>)}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Sem obra válida</CardTitle><CardDescription>Registros que apontam para uma obra excluída ou inexistente. Abra o registro e escolha a obra certa.</CardDescription></CardHeader>
            <CardContent>{r.orfaos.length === 0 ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-success" />Todos os registros estão ligados a uma obra ativa.</p> : (
              <ul className="divide-y text-sm">{r.orfaos.slice(0, 50).map(({ modulo, r: x }) => (
                <li key={`${modulo}/${x.id}`} className="py-2"><Badge>{ESQUEMAS[modulo].title}</Badge> <Link href={`/gestao/${modulo}/`} className="font-medium hover:underline">{rotulo(modulo, x)}</Link> <span className="text-muted-foreground">— obra {obras[String(x.workId)] ? `${obras[String(x.workId)]} (excluída)` : 'inexistente'}</span></li>
              ))}</ul>)}</CardContent>
          </Card>
        </div>
      </div>

      <Card className="mt-4 area-impressao">
        <CardHeader><CardTitle>Revisão da EAP</CardTitle><CardDescription>Numeração das atividades (1, 1.1, 1.1.1…), códigos repetidos, predecessoras quebradas e atividades sem código.</CardDescription></CardHeader>
        <CardContent>{r.eap.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum cronograma cadastrado.</p> : eapComProblema.length === 0 ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-success" />Todas as EAPs estão em sequência e sem pendências.</p> : (
          <ul className="divide-y text-sm">{eapComProblema.map((e) => (
            <li key={e.workId} className="flex flex-wrap items-center gap-3 py-3">
              <span className="min-w-0 flex-1"><span className="block font-medium">{e.name} <span className="text-muted-foreground">({e.total} atividades)</span></span>
                <span className="block text-xs text-muted-foreground">{[e.changes.length && `${e.changes.length} fora de sequência (${Object.entries(e.map).map(([a, b]) => `${a}→${b}`).join(', ')})`, e.duplicates && `${e.duplicates} código(s) repetido(s)`, e.brokenPred && `${e.brokenPred} predecessora(s) quebrada(s)`, e.semWbs && `${e.semWbs} sem código`, e.nonNumeric && 'códigos não numéricos'].filter(Boolean).join(' · ')}</span></span>
              {e.changes.length > 0 && <Button variant="outline" disabled={!!ocupado} className="print:hidden" onClick={() => { if (confirm(`Renumerar a EAP de ${e.name}? ${e.changes.length} atividade(s) e suas predecessoras serão ajustadas.`)) void renumerar(e.workId); }}><ListOrdered className="h-4 w-4" />{ocupado === `eap-${e.workId}` ? 'Renumerando…' : 'Renumerar'}</Button>}
            </li>
          ))}</ul>)}</CardContent>
      </Card>
    </>
  );
}
