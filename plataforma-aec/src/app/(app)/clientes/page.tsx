'use client';
/** Clientes: o proprietário escolhe quais obras têm Portal do Cliente, para quais e-mails e com quais informações. */
import * as React from 'react';
import { Eye, EyeOff, Send, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/app-shell';
import { PainelCliente } from '@/components/portal/painel-cliente';
import { Button } from '@/components/ui/button';
import { Badge, Field, Input } from '@/components/ui/form';
import { useAuth } from '@/hooks/use-auth';
import { useDados } from '@/hooks/use-dados';
import { brlCompacto } from '@/lib/format';
import { montarFotos, montarPortal, normalizarEmails, OPCOES_PADRAO, type OpcoesPortal, type Portal } from '@/lib/portal';
import { publicarPortal, removerPortal, usePortaisDaEmpresa } from '@/lib/portal-dados';

type Msg = { tipo: 'ok' | 'erro'; texto: string } | undefined;

export default function Clientes() {
  const { tenantId, tenant, role } = useAuth();
  const d = useDados();
  const { portais } = usePortaisDaEmpresa(role === 'socio_diretor' ? tenantId : null);
  const [rascunho, setRascunho] = React.useState<Record<string, { emails: string; opcoes: OpcoesPortal }>>({});
  const [aberta, setAberta] = React.useState<string>();
  const [msg, setMsg] = React.useState<Msg>();
  const [endereco, setEndereco] = React.useState('');
  React.useEffect(() => { setEndereco(`${window.location.origin}/login/`); }, []);

  if (role !== 'socio_diretor') return <><PageHeader titulo="Clientes" /><p className="text-sm text-muted-foreground">Somente o proprietário da empresa gerencia o Portal do Cliente.</p></>;
  const obras = d.works.filter((w) => !w.deleted).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const empresa = { nome: tenant?.nomeFantasia ?? '', responsavel: tenant?.responsavelTecnico.nome ?? '', registro: tenant?.responsavelTecnico.registro ?? '' };
  const hoje = new Date().toISOString().slice(0, 10);
  const montar = (workId: string, emails: string[], opcoes: OpcoesPortal): Portal => montarPortal(tenantId!, workId, d, empresa, emails, opcoes, hoje);

  const publicar = async (workId: string, nome: string, textoEmails: string, opcoes: OpcoesPortal) => {
    const emails = normalizarEmails(textoEmails);
    if (emails.length === 0) { setMsg({ tipo: 'erro', texto: `Informe o e-mail do cliente de "${nome}".` }); return; }
    try {
      await publicarPortal(montar(workId, emails, opcoes), opcoes.fotos === false ? [] : montarFotos(tenantId!, workId, d), portais.find((x) => x.workId === workId));
      setRascunho((r) => { const n = { ...r }; delete n[workId]; return n; });
      setMsg({ tipo: 'ok', texto: `Portal de "${nome}" liberado para ${emails.join(', ')}. Envie ao cliente o endereço ${endereco} — ele cria a conta com esse e-mail, confirma o e-mail e já vê o painel.` });
    } catch { setMsg({ tipo: 'erro', texto: 'Não foi possível publicar. Verifique a conexão e tente de novo.' }); }
  };
  const remover = async (workId: string, nome: string) => {
    if (!tenantId || !window.confirm(`Encerrar o acesso do cliente ao painel de "${nome}"?`)) return;
    try { await removerPortal(tenantId, workId, portais.find((x) => x.workId === workId)?.fotosMeses?.map((m) => m.mes)); setMsg({ tipo: 'ok', texto: `Acesso ao painel de "${nome}" encerrado.` }); } catch { setMsg({ tipo: 'erro', texto: 'Não foi possível encerrar o acesso.' }); }
  };

  return (
    <>
      <PageHeader titulo="Clientes" descricao="Portal do Cliente: cada cliente acompanha apenas o próprio contrato — cronograma físico-financeiro, medições, parcelas e indicadores." />
      {msg && <p role={msg.tipo === 'erro' ? 'alert' : 'status'} className={`mb-4 rounded-md border p-3 text-sm ${msg.tipo === 'erro' ? 'border-destructive/40 bg-destructive/5 text-destructive' : 'border-success/40 bg-success/5'}`}>{msg.texto}</p>}
      <p className="mb-4 rounded-lg border border-dashed p-3 text-xs leading-relaxed text-muted-foreground">O cliente <strong className="text-foreground">não</strong> entra na sua empresa: ele vê somente o painel da obra dele. Custos, fornecedores, outras obras e anotações internas nunca são enviados. O painel se atualiza sozinho enquanto você usa o aplicativo.</p>
      {obras.length === 0 && <p className="text-sm text-muted-foreground">Cadastre uma obra em Planejamento e Obras → Obras para liberar o portal ao cliente.</p>}
      <ul className="flex flex-col gap-3">
        {obras.map((w) => {
          const id = String(w.id), nome = String(w.name), pub = portais.find((p) => p.workId === id);
          const r = rascunho[id] ?? { emails: pub?.emails.join(', ') ?? '', opcoes: pub?.opcoes ?? OPCOES_PADRAO };
          const editar = (m: Partial<typeof r>) => setRascunho((x) => ({ ...x, [id]: { ...r, ...m } }));
          const mudou = !!rascunho[id];
          return (
            <li key={id} className="rounded-2xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold">{nome}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">{[String(w.client ?? ''), brlCompacto(Number(w.value) || 0), String(w.status ?? '')].filter(Boolean).join(' · ')}</p>
                </div>
                {pub ? <Badge variant="success">Portal liberado · atualizado {new Date(pub.atualizadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</Badge> : <Badge>Portal não liberado</Badge>}
              </div>
              <div className="mt-3 grid grid-cols-1 items-end gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                <Field label={`E-mail(s) do cliente de ${nome} — separe com vírgula`}><Input type="text" inputMode="email" placeholder="cliente@exemplo.com" value={r.emails} onChange={(e) => editar({ emails: e.target.value })} /></Field>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void publicar(id, nome, r.emails, r.opcoes)}><Send className="h-4 w-4" />{pub ? (mudou ? 'Salvar alterações' : 'Atualizar agora') : 'Liberar portal'}</Button>
                  <Button variant="outline" aria-expanded={aberta === id} onClick={() => setAberta(aberta === id ? undefined : id)}>{aberta === id ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{aberta === id ? 'Fechar' : 'Ver como o cliente'}</Button>
                  {pub && <Button variant="ghost" size="icon" aria-label={`Encerrar o acesso ao painel de ${nome}`} onClick={() => void remover(id, nome)}><Trash2 className="h-4 w-4" /></Button>}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs">
                <label className="flex items-center gap-2"><input type="checkbox" checked={r.opcoes.diario} onChange={(e) => editar({ opcoes: { ...r.opcoes, diario: e.target.checked } })} />Mostrar o diário de obra (só registros assinados, sem ocorrências)</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={r.opcoes.fotos !== false} onChange={(e) => editar({ opcoes: { ...r.opcoes, fotos: e.target.checked } })} />Relatório fotográfico (fotos dos diários assinados, exceto as de uso interno)</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={r.opcoes.documentos} onChange={(e) => editar({ opcoes: { ...r.opcoes, documentos: e.target.checked } })} />Compartilhar os documentos aprovados desta obra</label>
              </div>
              {aberta === id && tenantId && <div className="mt-4 rounded-2xl border bg-background p-4 md:p-6">{(() => { try { return <PainelCliente portal={montar(id, normalizarEmails(r.emails), r.opcoes)} fotosLocais={r.opcoes.fotos === false ? [] : montarFotos(tenantId, id, d)} />; } catch { return <p className="text-sm text-muted-foreground">Não foi possível montar o painel desta obra.</p>; } })()}</div>}
            </li>
          );
        })}
      </ul>
    </>
  );
}
