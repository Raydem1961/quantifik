'use client';
/**
 * Licenças da plataforma: o administrador da plataforma (definido pelo instalador) emite os códigos
 * que permitem a um cliente criar a própria empresa. Cada código vale para uma empresa.
 */
import * as React from 'react';
import { Check, Copy, KeySquare, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, Field, Input } from '@/components/ui/form';
import { useAuth } from '@/hooks/use-auth';
import { emitirLicenca, revogarLicenca, useAdminPlataforma, useLicencas, type Licenca } from '@/lib/licencas';

const data = (t?: { toDate?: () => Date }) => (t?.toDate ? t.toDate().toLocaleDateString('pt-BR') : '—');
function situacao(l: Licenca): { rotulo: string; variante: 'success' | 'default' | 'destructive' | 'warning' } {
  if (l.usada) return { rotulo: 'Usada', variante: 'default' };
  if ((l.expiraEm?.toMillis?.() ?? 0) < Date.now()) return { rotulo: 'Vencida', variante: 'destructive' };
  return { rotulo: 'Disponível', variante: 'success' };
}

export default function Plataforma() {
  const { usuario } = useAuth();
  const admin = useAdminPlataforma(usuario?.uid);
  const { lista, carregando } = useLicencas(admin);
  const [f, setF] = React.useState({ cliente: '', email: '', dias: '30', observacao: '' });
  const [nova, setNova] = React.useState('');
  const [copiado, setCopiado] = React.useState('');
  const [msg, setMsg] = React.useState<{ tipo: 'ok' | 'erro'; texto: string }>();
  const [ocupado, setOcupado] = React.useState(false);
  const ordenada = [...lista].sort((a, b) => (b.criadaEm?.toMillis?.() ?? 0) - (a.criadaEm?.toMillis?.() ?? 0));
  const endereco = (c: string) => `${typeof window !== 'undefined' ? window.location.origin : ''}/login/?licenca=${encodeURIComponent(c)}`;
  const copiar = async (texto: string, chave: string) => { try { await navigator.clipboard.writeText(texto); setCopiado(chave); setTimeout(() => setCopiado(''), 2000); } catch { setMsg({ tipo: 'erro', texto: 'Não foi possível copiar; selecione o código e copie manualmente.' }); } };

  if (!admin) return (<><PageHeader titulo="Licenças da plataforma" descricao="Somente o administrador da plataforma." /><Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Esta área é do administrador da plataforma ObraTop.</CardContent></Card></>);

  const emitir = async () => {
    setOcupado(true); setMsg(undefined);
    try { const c = await emitirLicenca({ ...f, dias: Number(f.dias) || 30 }); setNova(c); setF({ cliente: '', email: '', dias: '30', observacao: '' }); }
    catch (e) { setMsg({ tipo: 'erro', texto: e instanceof Error && !/permission/i.test(e.message) ? e.message : 'Não foi possível emitir o código.' }); }
    setOcupado(false);
  };
  return (
    <>
      <PageHeader titulo="Licenças da plataforma" descricao="Só quem recebe um código seu consegue criar uma empresa no ObraTop. Cada código vale para uma empresa, tem validade e pode ser preso ao e-mail do cliente." />
      {msg && <p role={msg.tipo === 'erro' ? 'alert' : 'status'} className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{msg.texto}</p>}
      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Emitir código</CardTitle><CardDescription>Envie o código (ou o link) ao cliente. Ele cria a conta e, em “Criar minha empresa”, informa o código.</CardDescription></CardHeader>
          <CardContent>
            <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void emitir(); }}>
              <Field label="Cliente (empresa)"><Input required maxLength={160} value={f.cliente} onChange={(e) => setF({ ...f, cliente: e.target.value })} /></Field>
              <Field label="E-mail do cliente (recomendado)"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
              <Field label="Validade (dias)"><Input type="number" min={1} max={365} value={f.dias} onChange={(e) => setF({ ...f, dias: e.target.value })} /></Field>
              <Field label="Observação (contrato, plano…)"><Input maxLength={500} value={f.observacao} onChange={(e) => setF({ ...f, observacao: e.target.value })} /></Field>
              <p className="text-xs text-muted-foreground">Com e-mail, o código só funciona para esse e-mail, depois de confirmado. Sem e-mail, vale para quem o tiver — trate-o como senha.</p>
              <Button type="submit" disabled={ocupado}><KeySquare className="h-4 w-4" />{ocupado ? 'Emitindo…' : 'Emitir código'}</Button>
            </form>
            {nova && (
              <div className="mt-4 rounded-xl border border-success/40 bg-success/5 p-4" role="status">
                <p className="text-xs text-muted-foreground">Código emitido</p>
                <p className="mt-1 select-all font-mono text-lg font-semibold tracking-wider">{nova}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => void copiar(nova, 'codigo')}>{copiado === 'codigo' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}Copiar código</Button>
                  <Button size="sm" variant="outline" onClick={() => void copiar(endereco(nova), 'link')}>{copiado === 'link' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}Copiar link</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="xl:col-span-3">
          <CardHeader><CardTitle>Códigos emitidos</CardTitle><CardDescription>{lista.filter((l) => situacao(l).rotulo === 'Disponível').length} disponível(is) · {lista.filter((l) => l.usada).length} usado(s)</CardDescription></CardHeader>
          <CardContent className="overflow-x-auto">
            {carregando ? <p className="text-sm text-muted-foreground">Carregando…</p> : ordenada.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum código emitido ainda.</p> : (
              <table className="w-full min-w-[560px] text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2 font-medium">Código</th><th className="px-2 py-2 font-medium">Cliente</th><th className="px-2 py-2 font-medium">Situação</th><th className="px-2 py-2 font-medium">Validade / uso</th><th className="w-10"><span className="sr-only">Ações</span></th></tr></thead>
                <tbody className="divide-y">{ordenada.map((l) => { const s = situacao(l); return (
                  <tr key={l.id} className="align-top">
                    <td className="py-2 font-mono text-xs">{l.id}</td>
                    <td className="px-2 py-2">{l.cliente}<span className="block text-xs text-muted-foreground">{l.email || 'qualquer e-mail'}</span></td>
                    <td className="px-2 py-2"><Badge variant={s.variante}>{s.rotulo}</Badge></td>
                    <td className="px-2 py-2 text-xs">{l.usada ? <>Usado em {data(l.usadaEm)}<span className="block text-muted-foreground">{l.usadaEmail}</span></> : <>Até {data(l.expiraEm)}</>}</td>
                    <td className="py-1 text-right">{!l.usada && <Button size="icon" variant="ghost" aria-label={`Revogar código ${l.id}`} onClick={() => { if (window.confirm(`Revogar o código ${l.id}? Ele deixa de funcionar.`)) void revogarLicenca(l.id); }}><Trash2 className="h-4 w-4" /></Button>}</td>
                  </tr>); })}</tbody></table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
