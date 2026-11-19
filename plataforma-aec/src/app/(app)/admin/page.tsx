'use client';
/** Administração: dados e logotipo da empresa, equipe (funções do ObraTop, perfis, bloqueio) e convites. */
import * as React from 'react';
import Link from 'next/link';
import { Archive, Ban, CheckCircle2, Copy, ImageUp, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, Field, Input, Select } from '@/components/ui/form';
import { useAuth } from '@/hooks/use-auth';
import { useColecao } from '@/hooks/use-colecao';
import { MODO_DEMO } from '@/lib/firebase/client';
import { atualizarMembro, criarConvite, definirPerfil, PERFIL_LABEL, removerMembro, salvarEmpresa, salvarLogo } from '@/lib/obratop/empresa';
import { FUNCAO_LABEL, funcaoDe, type Funcao } from '@/lib/obratop/permissoes';
import { UFS, type UF } from '@/lib/types';

type Membro = { id: string; email?: string; name?: string; role?: string; status?: string; workId?: string };
type Obra = { id: string; name?: string; deleted?: boolean };
type Msg = { tipo: 'ok' | 'erro'; texto: string } | undefined;
const Aviso = ({ m }: { m: Msg }) => (m ? <p role={m.tipo === 'erro' ? 'alert' : 'status'} className={m.tipo === 'erro' ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>{m.texto}</p> : null);
const FUNCOES_CONVITE: Funcao[] = ['project_user', 'manager', 'finance', 'viewer'];
const DESCRICAO_FUNCAO: Record<Funcao, string> = {
  owner: 'Acesso total.', project_user: 'Lança e altera somente na obra escolhida.', manager: 'Todas as obras: cria e altera, não exclui.',
  finance: 'Todas as obras: financeiro, medições, contratos, compras e orçamentos.', viewer: 'Todas as obras, somente leitura.',
};

export default function Admin() {
  const { tenantId, tenant, role, usuario } = useAuth();
  const { dados: membros } = useColecao<Membro>('members');
  const { dados: obrasBrutas } = useColecao<Obra>('works');
  const { dados: perfis } = useColecao<{ id: string; perfil?: string }>('perfis');
  const obras = obrasBrutas.filter((o) => !o.deleted);
  const perfilDe = (uid: string) => perfis.find((p) => p.id === uid)?.perfil ?? '';

  const [f, setF] = React.useState({ nome: '', razao: '', cnpj: '', uf: 'BA' as UF, rtNome: '', rtConselho: 'CREA' as 'CREA' | 'CAU', rtRegistro: '', custoHora: '100', cor: '#3b4cca', webhook: '', endereco: '', telefone: '', email: '', engenheiro: '' });
  const [msgEmpresa, setMsgEmpresa] = React.useState<Msg>();
  const [msgLogo, setMsgLogo] = React.useState<Msg>();
  const [convite, setConvite] = React.useState<{ email: string; workId: string; funcao: Funcao }>({ email: '', workId: '', funcao: 'project_user' });
  const [msgConvite, setMsgConvite] = React.useState<Msg>();
  const [msgEquipe, setMsgEquipe] = React.useState<Msg>();
  const [link, setLink] = React.useState('');
  const [ocupado, setOcupado] = React.useState(false);
  React.useEffect(() => {
    if (!tenant) return;
    setF({ nome: tenant.nomeFantasia, razao: tenant.razaoSocial, cnpj: tenant.cnpj, uf: tenant.uf, rtNome: tenant.responsavelTecnico.nome, rtConselho: tenant.responsavelTecnico.conselho, rtRegistro: tenant.responsavelTecnico.registro,
      custoHora: String(tenant.custoHoraTecnica), cor: tenant.branding.corPrimaria, webhook: tenant.webhookUrl ?? '', endereco: tenant.contato.endereco, telefone: tenant.contato.telefone, email: tenant.contato.email, engenheiro: tenant.contato.engenheiroPadrao });
  }, [tenant?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- recarrega só ao trocar de empresa, para não apagar o que está sendo digitado

  if (role !== 'socio_diretor') return <><PageHeader titulo="Empresa e equipe" /><p className="text-sm text-muted-foreground">Somente o administrador geral da empresa acessa esta tela.</p></>;
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((a) => ({ ...a, [k]: v }));

  const gravarEmpresa = async () => {
    if (!tenantId) return;
    if (MODO_DEMO) { setMsgEmpresa({ tipo: 'erro', texto: 'Modo demonstração: os dados da empresa não são gravados.' }); return; }
    if (f.webhook && !/^https:\/\//.test(f.webhook)) { setMsgEmpresa({ tipo: 'erro', texto: 'O endereço de notificações precisa começar com https://' }); return; }
    setOcupado(true);
    try {
      await salvarEmpresa(tenantId, { name: f.nome, cnpj: f.cnpj, contato: { endereco: f.endereco, telefone: f.telefone, email: f.email, engenheiroPadrao: f.engenheiro }, aec: {
        razaoSocial: f.razao.trim(), uf: f.uf, custoHoraTecnica: Math.max(0, Number(f.custoHora.replace(',', '.')) || 0),
        responsavelTecnico: { nome: f.rtNome.trim(), conselho: f.rtConselho, registro: f.rtRegistro.trim() },
        branding: { corPrimaria: f.cor, corSecundaria: tenant?.branding.corSecundaria ?? '#111827' },
        ...(f.webhook ? { webhookUrl: f.webhook.trim() } : {}),
      } });
      setMsgEmpresa({ tipo: 'ok', texto: 'Dados da empresa salvos (valem também no ObraTop 3).' });
    } catch (e) { setMsgEmpresa({ tipo: 'erro', texto: e instanceof Error && !/permission/i.test(e.message) ? e.message : 'Não foi possível salvar. Verifique a conexão e tente de novo.' }); }
    setOcupado(false);
  };
  const trocarLogo = async (arquivo: File | null) => {
    if (!tenantId) return;
    if (MODO_DEMO) { setMsgLogo({ tipo: 'erro', texto: 'Modo demonstração: o logotipo não é gravado.' }); return; }
    setOcupado(true);
    try { await salvarLogo(tenantId, arquivo); setMsgLogo({ tipo: 'ok', texto: arquivo ? 'Logotipo salvo: aparece nos PDFs, no Portal do Cliente e no ObraTop 3.' : 'Logotipo removido.' }); }
    catch (e) { setMsgLogo({ tipo: 'erro', texto: e instanceof Error ? e.message : 'Não foi possível salvar o logotipo.' }); }
    setOcupado(false);
  };
  const convidar = async () => {
    if (!tenantId) return;
    setLink('');
    if (MODO_DEMO) { setMsgConvite({ tipo: 'erro', texto: 'Modo demonstração: convites não são emitidos.' }); return; }
    setOcupado(true);
    try {
      const codigo = await criarConvite(tenantId, convite.email, convite.workId, convite.funcao);
      setLink(`${window.location.origin}/inicio/?convite=${codigo}`);
      setMsgConvite({ tipo: 'ok', texto: `Convite de ${FUNCAO_LABEL[convite.funcao]} criado para ${convite.email.trim().toLowerCase()}. Vale por 7 dias e só para esse e-mail.` });
      setConvite((c) => ({ ...c, email: '' }));
    } catch (e) { setMsgConvite({ tipo: 'erro', texto: e instanceof Error && !/permission/i.test(e.message) ? e.message : 'Não foi possível criar o convite.' }); }
    setOcupado(false);
  };
  const nomeDe = (m: Membro) => m.name ?? m.email ?? 'esta pessoa';
  const alterar = async (m: Membro, mudanca: Partial<{ role: Funcao; workId: string; status: 'active' | 'blocked' }>) => {
    if (!tenantId || MODO_DEMO) return;
    const novo = { role: mudanca.role ?? funcaoDe(m.role), workId: mudanca.workId ?? m.workId ?? '', status: mudanca.status ?? (m.status === 'blocked' ? 'blocked' as const : 'active' as const) };
    if (novo.role === 'project_user' && !obras.some((o) => o.id === novo.workId)) {
      if (!obras[0]) { setMsgEquipe({ tipo: 'erro', texto: 'Cadastre uma obra antes de tornar alguém engenheiro da obra.' }); return; }
      novo.workId = obras[0].id;
    }
    try { await atualizarMembro(tenantId, m.id, novo); setMsgEquipe({ tipo: 'ok', texto: `${nomeDe(m)}: ${FUNCAO_LABEL[novo.role]}${novo.status === 'blocked' ? ' (bloqueado)' : ''}.` }); }
    catch { setMsgEquipe({ tipo: 'erro', texto: `Não foi possível alterar ${nomeDe(m)}.` }); }
  };
  const mudarPerfil = async (m: Membro, perfil: string) => {
    if (!tenantId || MODO_DEMO) return;
    try { await definirPerfil(tenantId, m.id, perfil); } catch { setMsgEquipe({ tipo: 'erro', texto: `Não foi possível alterar o perfil de ${nomeDe(m)}.` }); }
  };
  const remover = async (m: Membro) => {
    if (!tenantId || MODO_DEMO || !window.confirm(`Remover o acesso de ${nomeDe(m)}?`)) return;
    try { await removerMembro(tenantId, m.id); } catch { setMsgEquipe({ tipo: 'erro', texto: 'Não foi possível remover o acesso.' }); }
  };
  const equipe: Membro[] = MODO_DEMO ? [{ id: usuario?.uid ?? 'demo', name: usuario?.nome, email: usuario?.email, role: 'owner', status: 'active' }] : [...membros].sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : String(a.name).localeCompare(String(b.name))));
  const precisaObra = convite.funcao === 'project_user';

  return (
    <>
      <PageHeader titulo="Empresa e equipe" descricao="Dados que aparecem em propostas, contratos e relatórios, e quem pode usar o aplicativo.">
        <Link href="/admin/seguranca/" className="inline-flex h-9 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium hover:bg-accent"><ShieldCheck className="h-4 w-4" />Lixeira e auditoria</Link>
        <Link href="/admin/backup/" className="inline-flex h-9 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium hover:bg-accent"><Archive className="h-4 w-4" />Backup e restauração</Link>
      </PageHeader>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Empresa</CardTitle><CardDescription>Os mesmos dados do ObraTop 3: o que salvar aqui vale nos dois aplicativos.</CardDescription></CardHeader>
          <CardContent>
            <form className="grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void gravarEmpresa(); }}>
              <Field label="Nome da empresa"><Input required maxLength={120} value={f.nome} onChange={(e) => set('nome', e.target.value)} /></Field>
              <Field label="Razão social"><Input value={f.razao} onChange={(e) => set('razao', e.target.value)} /></Field>
              <Field label="CNPJ"><Input value={f.cnpj} onChange={(e) => set('cnpj', e.target.value)} /></Field>
              <Field label="Estado (UF)"><Select value={f.uf} onChange={(e) => set('uf', e.target.value as UF)}>{UFS.map((u) => <option key={u}>{u}</option>)}</Select></Field>
              <Field label="Endereço" className="sm:col-span-2"><Input maxLength={200} value={f.endereco} onChange={(e) => set('endereco', e.target.value)} /></Field>
              <Field label="Telefone"><Input maxLength={40} value={f.telefone} onChange={(e) => set('telefone', e.target.value)} /></Field>
              <Field label="E-mail da empresa"><Input type="email" maxLength={120} value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
              <Field label="Responsável técnico"><Input value={f.rtNome} onChange={(e) => set('rtNome', e.target.value)} /></Field>
              <div className="grid grid-cols-[96px_1fr] gap-2">
                <Field label="Conselho"><Select value={f.rtConselho} onChange={(e) => set('rtConselho', e.target.value as 'CREA' | 'CAU')}><option>CREA</option><option>CAU</option></Select></Field>
                <Field label="Nº do registro"><Input value={f.rtRegistro} onChange={(e) => set('rtRegistro', e.target.value)} /></Field>
              </div>
              <Field label="Engenheiro padrão das obras"><Input maxLength={120} value={f.engenheiro} onChange={(e) => set('engenheiro', e.target.value)} /></Field>
              <Field label="Custo da hora técnica (R$)"><Input inputMode="decimal" value={f.custoHora} onChange={(e) => set('custoHora', e.target.value)} /></Field>
              <Field label="Cor da marca nos PDFs"><Input type="color" className="h-9 p-1" value={f.cor} onChange={(e) => set('cor', e.target.value)} /></Field>
              <Field label="Endereço para notificações (opcional)"><Input type="url" placeholder="https://…" value={f.webhook} onChange={(e) => set('webhook', e.target.value)} /></Field>
              <div className="flex items-center gap-3 sm:col-span-2"><Button type="submit" disabled={ocupado}>Salvar empresa</Button><Aviso m={msgEmpresa} /></div>
            </form>
            <div className="mt-5 flex flex-wrap items-center gap-4 rounded-xl border border-dashed p-4">
              <div className="grid h-16 w-44 place-items-center overflow-hidden rounded-lg bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element -- imagem embutida (data URL) */}
                {tenant?.branding.logoUrl ? <img src={tenant.branding.logoUrl} alt={`Logotipo de ${tenant.nomeFantasia}`} className="max-h-14 max-w-40 object-contain" /> : <span className="text-xs text-neutral-500">Sem logotipo</span>}
              </div>
              <div className="flex flex-col gap-2">
                <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input px-3 text-sm font-medium hover:bg-accent focus-within:ring-2 focus-within:ring-ring">
                  <ImageUp className="h-4 w-4" />{tenant?.branding.logoUrl ? 'Trocar logotipo' : 'Enviar logotipo'}
                  <input type="file" accept="image/png,image/jpeg" className="sr-only" disabled={ocupado} onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ''; if (a) void trocarLogo(a); }} />
                </label>
                {tenant?.branding.logoUrl && <button type="button" className="text-left text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => { if (window.confirm('Remover o logotipo?')) void trocarLogo(null); }}>Remover logotipo</button>}
                <p className="text-xs text-muted-foreground">PNG ou JPG; reduzido para até 480 × 160 px.</p>
                <Aviso m={msgLogo} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Convidar pessoa</CardTitle><CardDescription>Ela cria a própria senha e entra com o link. O cliente da obra não entra aqui: use Clientes → Portal do Cliente.</CardDescription></CardHeader>
          <CardContent>
            <form className="grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void convidar(); }}>
              <Field label="E-mail" className="sm:col-span-2"><Input type="email" required value={convite.email} onChange={(e) => setConvite((c) => ({ ...c, email: e.target.value }))} /></Field>
              <Field label="Função"><Select value={convite.funcao} onChange={(e) => setConvite((c) => ({ ...c, funcao: e.target.value as Funcao }))}>{FUNCOES_CONVITE.map((x) => <option key={x} value={x}>{FUNCAO_LABEL[x]}</option>)}</Select></Field>
              {precisaObra ? <Field label="Obra"><Select required value={convite.workId} onChange={(e) => setConvite((c) => ({ ...c, workId: e.target.value }))}><option value="">Escolha…</option>{obras.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
                : <p className="self-end pb-2 text-xs text-muted-foreground">Todas as obras.</p>}
              <p className="text-xs text-muted-foreground sm:col-span-2">{DESCRICAO_FUNCAO[convite.funcao]}</p>
              <div className="flex items-center gap-3 sm:col-span-2"><Button type="submit" disabled={ocupado}><UserPlus className="h-4 w-4" />Gerar convite</Button><Aviso m={msgConvite} /></div>
            </form>
            {precisaObra && obras.length === 0 && <p className="mt-3 text-xs text-muted-foreground">Cadastre uma obra antes de convidar um engenheiro da obra.</p>}
            {link && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border bg-muted/40 p-2.5">
                <code className="min-w-0 flex-1 truncate text-xs">{link}</code>
                <Button size="icon" variant="ghost" aria-label="Copiar link do convite" onClick={() => void navigator.clipboard?.writeText(link)}><Copy className="h-4 w-4" /></Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle>Equipe</CardTitle><CardDescription>{equipe.length} pessoa(s) com acesso. A função vale no ObraTop 3 e no 4; o perfil afina os módulos de projeto e orçamento.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          <Aviso m={msgEquipe} />
          <table className="mt-2 w-full min-w-[820px] text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="px-2 py-2 font-medium">Pessoa</th><th className="px-2 py-2 font-medium">Função</th><th className="px-2 py-2 font-medium">Obra</th><th className="px-2 py-2 font-medium">Perfil nos módulos novos</th><th className="px-2 py-2"><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>
              {equipe.map((m) => {
                const fm = funcaoDe(m.role), bloqueado = m.status === 'blocked';
                return (
                  <tr key={m.id} className={`border-b last:border-0 ${bloqueado ? 'opacity-60' : ''}`}>
                    <td className="px-2 py-2"><span className="block font-medium">{nomeDe(m)}</span><span className="block text-xs text-muted-foreground">{m.email}</span>{bloqueado && <Badge variant="destructive" className="mt-1">Bloqueado</Badge>}</td>
                    {fm === 'owner' ? <><td className="px-2 py-2"><Badge variant="success">{FUNCAO_LABEL.owner}</Badge></td><td className="px-2 py-2 text-muted-foreground">Todas</td><td className="px-2 py-2 text-muted-foreground">Acesso total</td><td /></> : (<>
                      <td className="px-2 py-2"><Select aria-label={`Função de ${nomeDe(m)}`} value={fm} onChange={(e) => void alterar(m, { role: e.target.value as Funcao })}>{FUNCOES_CONVITE.map((x) => <option key={x} value={x}>{FUNCAO_LABEL[x]}</option>)}</Select></td>
                      <td className="px-2 py-2">{fm === 'project_user' ? <Select aria-label={`Obra de ${nomeDe(m)}`} value={m.workId ?? ''} onChange={(e) => void alterar(m, { workId: e.target.value })}>{!obras.some((o) => o.id === m.workId) && <option value={m.workId ?? ''}>—</option>}{obras.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select> : <span className="text-muted-foreground">Todas</span>}</td>
                      <td className="px-2 py-2">{fm === 'viewer' ? <span className="text-muted-foreground">Somente leitura</span> : <Select aria-label={`Perfil de ${nomeDe(m)}`} value={perfilDe(m.id)} onChange={(e) => void mudarPerfil(m, e.target.value)}>{Object.entries(PERFIL_LABEL).map(([v, r]) => <option key={v} value={v}>{v === '' ? 'Conforme a função' : r}</option>)}</Select>}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">
                        <Button size="icon" variant="ghost" title={bloqueado ? 'Desbloquear' : 'Bloquear'} aria-label={`${bloqueado ? 'Desbloquear' : 'Bloquear'} ${nomeDe(m)}`} onClick={() => void alterar(m, { status: bloqueado ? 'active' : 'blocked' })}>{bloqueado ? <CheckCircle2 className="h-4 w-4" /> : <Ban className="h-4 w-4" />}</Button>
                        <Button size="icon" variant="ghost" aria-label={`Remover ${nomeDe(m)}`} onClick={() => void remover(m)}><Trash2 className="h-4 w-4" /></Button>
                      </td>
                    </>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}
