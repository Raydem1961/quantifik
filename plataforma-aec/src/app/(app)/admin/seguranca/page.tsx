'use client';
/** Lixeira (registros excluídos, com restauração) e trilha de auditoria — só o administrador geral. */
import * as React from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { deleteField } from 'firebase/firestore';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, Input, Segmented, Select } from '@/components/ui/form';
import { useAuth } from '@/hooks/use-auth';
import { atualizarDoc, removerDoc, useColecao } from '@/hooks/use-colecao';
import { useDados } from '@/hooks/use-dados';
import { auditar } from '@/lib/auditoria';
import { MODO_DEMO } from '@/lib/firebase/client';
import { ESQUEMAS, MODULOS, rotuloRegistro, type IdModulo } from '@/lib/obratop/esquemas';

type Reg = { id: string } & Record<string, unknown>;
const quando = (v: unknown): string => {
  if (!v) return '';
  if (typeof v === 'string') return v;
  const t = v as { toDate?: () => Date; seconds?: number };
  return t.toDate ? t.toDate().toISOString() : typeof t.seconds === 'number' ? new Date(t.seconds * 1000).toISOString() : '';
};
const dataHora = (iso: string) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const ACAO: Record<string, string> = { create: 'Criou', update: 'Alterou', delete: 'Excluiu', restore: 'Restaurou', purge: 'Excluiu definitivamente', 'rdo-apply': 'Aplicou diário ao cronograma', 'stock-receive': 'Deu entrada no estoque', 'config-empresa': 'Alterou a empresa', backup: 'Gerou backup', 'backup-restore': 'Restaurou backup' };

export default function Seguranca() {
  const { tenantId, role, usuario } = useAuth();
  const dono = role === 'socio_diretor';
  const d = useDados() as unknown as Record<string, Reg[]>;
  const { dados: membros } = useColecao<Reg>(dono ? 'members' : null);
  const { dados: audits } = useColecao<Reg>(dono && !MODO_DEMO ? 'audits' : null);
  const { dados: logsServidor } = useColecao<Reg>(dono && !MODO_DEMO ? 'auditLogs' : null);
  const [aba, setAba] = React.useState<'lixeira' | 'auditoria'>('lixeira');
  const [filtroModulo, setFiltroModulo] = React.useState('');
  const [busca, setBusca] = React.useState('');
  const [msg, setMsg] = React.useState<{ tipo: 'ok' | 'erro'; texto: string }>();
  if (!dono) return <><PageHeader titulo="Lixeira e auditoria" /><p className="text-sm text-muted-foreground">Somente o administrador geral acessa esta tela.</p></>;
  const pessoa = (uid: unknown) => { const m = membros.find((x) => x.id === uid); return String(m?.name ?? m?.email ?? (uid ? 'usuário removido' : '—')); };

  const excluidos = MODULOS.flatMap((m) => (d[m] ?? []).filter((r) => r.deleted === true).map((r) => ({ m, r })))
    .filter(({ m }) => !filtroModulo || m === filtroModulo)
    .filter(({ m, r }) => !busca || rotuloRegistro(m, r).toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => quando(b.r.deletedAt).localeCompare(quando(a.r.deletedAt)));
  const restaurar = async (m: IdModulo, r: Reg) => {
    if (!tenantId) return;
    try {
      await atualizarDoc(tenantId, `${m}/${r.id}`, { deleted: false, deletedAt: deleteField(), deletedBy: deleteField(), restoredAt: new Date().toISOString(), restoredBy: usuario?.uid ?? '' });
      void auditar(tenantId, usuario, 'restore', m, r.id, { deleted: true }, { deleted: false });
      setMsg({ tipo: 'ok', texto: `"${rotuloRegistro(m, r)}" restaurado em ${ESQUEMAS[m].title}.` });
    } catch { setMsg({ tipo: 'erro', texto: 'Não foi possível restaurar o registro.' }); }
  };
  const apagar = async (m: IdModulo, r: Reg) => {
    if (!tenantId || !window.confirm(`Excluir DEFINITIVAMENTE "${rotuloRegistro(m, r)}"? Não há como desfazer, a não ser por um backup.`)) return;
    try { await removerDoc(tenantId, `${m}/${r.id}`); void auditar(tenantId, usuario, 'purge', m, r.id, r, { purged: true }); setMsg({ tipo: 'ok', texto: 'Registro excluído definitivamente.' }); }
    catch { setMsg({ tipo: 'erro', texto: 'Não foi possível excluir definitivamente.' }); }
  };

  const eventos = [
    ...audits.map((a) => ({ id: a.id, em: quando(a.at), acao: String(a.action ?? ''), modulo: String(a.module ?? ''), registro: String(a.recordId ?? ''), quem: String(a.userEmail ?? pessoa(a.userId)), mudancas: a.changes as Record<string, unknown> | undefined, origem: String(a.release ?? '').startsWith('4') ? 'ObraTop 4' : 'ObraTop 3' })),
    ...logsServidor.map((a) => ({ id: a.id, em: quando(a.em), acao: String(a.acao ?? ''), modulo: String(a.recurso ?? ''), registro: String(a.caminho ?? '').split('/').pop() ?? '', quem: pessoa(a.uid), mudancas: undefined, origem: 'Servidor' })),
  ].filter((e) => !filtroModulo || e.modulo === filtroModulo)
    .filter((e) => !busca || `${e.quem} ${e.registro} ${e.modulo} ${JSON.stringify(e.mudancas ?? '')}`.toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => b.em.localeCompare(a.em)).slice(0, 400);
  const resumoMudancas = (c: Record<string, unknown> | undefined) => {
    if (!c) return '';
    return Object.entries(c).slice(0, 4).map(([k, v]) => { const x = v as { de?: unknown; para?: unknown } | unknown; return typeof x === 'object' && x && 'para' in x ? `${k}: ${String((x as { de?: unknown }).de ?? '') || '∅'} → ${String((x as { para?: unknown }).para ?? '')}` : `${k}: ${String(typeof x === 'object' ? JSON.stringify(x) : x)}`; }).join(' · ').slice(0, 220);
  };

  return (
    <>
      <PageHeader titulo="Lixeira e auditoria" descricao="Recupere registros excluídos e veja quem alterou o quê — nos dois aplicativos (ObraTop 3 e 4) e no servidor." />
      {msg && <p role={msg.tipo === 'erro' ? 'alert' : 'status'} className={`mb-4 rounded-md border p-3 text-sm ${msg.tipo === 'erro' ? 'border-destructive/40 bg-destructive/5 text-destructive' : 'border-success/40 bg-success/5'}`}>{msg.texto}</p>}
      <Card>
        <CardHeader className="flex-row flex-wrap items-end justify-between gap-3">
          <div><CardTitle>{aba === 'lixeira' ? `Lixeira (${excluidos.length})` : `Auditoria (${eventos.length})`}</CardTitle>
            <CardDescription className="mt-1">{aba === 'lixeira' ? 'Excluir no aplicativo só esconde o registro; aqui ele volta ou sai de vez.' : 'Últimos 400 eventos, do mais recente para o mais antigo.'}</CardDescription></div>
          <div className="flex flex-wrap items-end gap-2">
            <Segmented value={aba} onChange={setAba} options={[{ value: 'lixeira', label: 'Lixeira' }, { value: 'auditoria', label: 'Auditoria' }]} />
            <Select aria-label="Filtrar por módulo" className="w-48" value={filtroModulo} onChange={(e) => setFiltroModulo(e.target.value)}><option value="">Todos os módulos</option>{MODULOS.map((m) => <option key={m} value={m}>{ESQUEMAS[m].title}</option>)}</Select>
            <Input className="w-48" placeholder="Buscar…" aria-label="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {aba === 'lixeira' ? (excluidos.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">A lixeira está vazia.</p> : (
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2 pr-2 font-medium">Módulo</th><th className="px-2 py-2 font-medium">Registro</th><th className="px-2 py-2 font-medium">Excluído em</th><th className="px-2 py-2 font-medium">Por</th><th><span className="sr-only">Ações</span></th></tr></thead>
              <tbody className="divide-y">{excluidos.map(({ m, r }) => (
                <tr key={`${m}/${r.id}`}><td className="py-2 pr-2"><Badge>{ESQUEMAS[m].title}</Badge></td><td className="max-w-[320px] truncate px-2 py-2">{rotuloRegistro(m, r) || r.id}</td><td className="tabular whitespace-nowrap px-2 py-2">{dataHora(quando(r.deletedAt))}</td><td className="px-2 py-2">{pessoa(r.deletedBy)}</td>
                  <td className="whitespace-nowrap py-1 text-right"><Button size="sm" variant="outline" aria-label={`Restaurar ${rotuloRegistro(m, r)}`} onClick={() => void restaurar(m, r)}><RotateCcw className="h-3.5 w-3.5" />Restaurar</Button>
                    <Button size="icon" variant="ghost" aria-label={`Excluir definitivamente ${rotuloRegistro(m, r)}`} onClick={() => void apagar(m, r)}><Trash2 className="h-4 w-4" /></Button></td></tr>
              ))}</tbody>
            </table>
          )) : (MODO_DEMO ? <p className="py-10 text-center text-sm text-muted-foreground">No modo demonstração a auditoria não é gravada.</p> : eventos.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Nenhum evento registrado.</p> : (
            <table className="w-full min-w-[860px] text-sm">
              <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2 pr-2 font-medium">Quando</th><th className="px-2 py-2 font-medium">Quem</th><th className="px-2 py-2 font-medium">O quê</th><th className="px-2 py-2 font-medium">Onde</th><th className="px-2 py-2 font-medium">Mudanças</th><th className="px-2 py-2 font-medium">Origem</th></tr></thead>
              <tbody className="divide-y">{eventos.map((e) => (
                <tr key={e.id} className="align-top"><td className="tabular whitespace-nowrap py-2 pr-2">{dataHora(e.em)}</td><td className="px-2 py-2">{e.quem}</td><td className="px-2 py-2">{ACAO[e.acao] ?? e.acao}</td>
                  <td className="px-2 py-2">{ESQUEMAS[e.modulo as IdModulo]?.title ?? e.modulo}<span className="block text-xs text-muted-foreground">{e.registro}</span></td>
                  <td className="max-w-[340px] px-2 py-2 text-xs text-muted-foreground">{resumoMudancas(e.mudancas)}</td><td className="px-2 py-2"><Badge variant="outline">{e.origem}</Badge></td></tr>
              ))}</tbody>
            </table>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
