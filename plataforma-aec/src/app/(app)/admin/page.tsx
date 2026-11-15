'use client';
/** Administração: dados da empresa e equipe (membros e convites no mesmo cadastro do ObraTop). */
import * as React from 'react';
import { Copy, Trash2, UserPlus } from 'lucide-react';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, Field, Input, Select } from '@/components/ui/form';
import { useAuth } from '@/hooks/use-auth';
import { useColecao } from '@/hooks/use-colecao';
import { MODO_DEMO } from '@/lib/firebase/client';
import { atualizarMembro, criarConvite, definirPerfil, PERFIL_LABEL, removerMembro, salvarEmpresa } from '@/lib/obratop/empresa';
import { UFS, type UF } from '@/lib/types';

type Membro = { id: string; email?: string; name?: string; role?: string; status?: string; workId?: string };
type Obra = { id: string; name?: string; deleted?: boolean };
type Msg = { tipo: 'ok' | 'erro'; texto: string } | undefined;
const Aviso = ({ m }: { m: Msg }) => (m ? <p role={m.tipo === 'erro' ? 'alert' : 'status'} className={m.tipo === 'erro' ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>{m.texto}</p> : null);

export default function Admin() {
  const { tenantId, tenant, role, usuario } = useAuth();
  const { dados: membros } = useColecao<Membro>('members');
  const { dados: obrasBrutas } = useColecao<Obra>('works');
  const obras = obrasBrutas.filter((o) => !o.deleted);

  const [f, setF] = React.useState({ nome: '', razao: '', cnpj: '', uf: 'BA' as UF, rtNome: '', rtConselho: 'CREA' as 'CREA' | 'CAU', rtRegistro: '', custoHora: '100', cor: '#3b4cca', webhook: '' });
  const [msgEmpresa, setMsgEmpresa] = React.useState<Msg>();
  const [convite, setConvite] = React.useState({ email: '', workId: '' });
  const { dados: perfis } = useColecao<{ id: string; perfil?: string }>('perfis');
  const perfilDe = (uid: string) => perfis.find((p) => p.id === uid)?.perfil ?? '';
  const [msgConvite, setMsgConvite] = React.useState<Msg>();
  const [link, setLink] = React.useState('');
  const [ocupado, setOcupado] = React.useState(false);
  React.useEffect(() => {
    if (!tenant) return;
    setF({ nome: tenant.nomeFantasia, razao: tenant.razaoSocial, cnpj: tenant.cnpj, uf: tenant.uf, rtNome: tenant.responsavelTecnico.nome, rtConselho: tenant.responsavelTecnico.conselho, rtRegistro: tenant.responsavelTecnico.registro,
      custoHora: String(tenant.custoHoraTecnica), cor: tenant.branding.corPrimaria, webhook: tenant.webhookUrl ?? '' });
  }, [tenant?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- recarrega só ao trocar de empresa, para não apagar o que está sendo digitado

  if (role !== 'socio_diretor') return <><PageHeader titulo="Empresa e equipe" /><p className="text-sm text-muted-foreground">Somente o proprietário da empresa acessa esta tela.</p></>;
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((a) => ({ ...a, [k]: v }));

  const gravarEmpresa = async () => {
    if (!tenantId) return;
    if (MODO_DEMO) { setMsgEmpresa({ tipo: 'erro', texto: 'Modo demonstração: os dados da empresa não são gravados.' }); return; }
    if (f.webhook && !/^https:\/\//.test(f.webhook)) { setMsgEmpresa({ tipo: 'erro', texto: 'O endereço de notificações precisa começar com https://' }); return; }
    setOcupado(true);
    try {
      await salvarEmpresa(tenantId, { name: f.nome, cnpj: f.cnpj, aec: {
        razaoSocial: f.razao.trim(), uf: f.uf, custoHoraTecnica: Math.max(0, Number(f.custoHora.replace(',', '.')) || 0),
        responsavelTecnico: { nome: f.rtNome.trim(), conselho: f.rtConselho, registro: f.rtRegistro.trim() },
        branding: { corPrimaria: f.cor, corSecundaria: tenant?.branding.corSecundaria ?? '#111827', ...(tenant?.branding.logoUrl ? { logoUrl: tenant.branding.logoUrl } : {}) },
        ...(f.webhook ? { webhookUrl: f.webhook.trim() } : {}),
      } });
      setMsgEmpresa({ tipo: 'ok', texto: 'Dados da empresa salvos.' });
    } catch { setMsgEmpresa({ tipo: 'erro', texto: 'Não foi possível salvar. Verifique a conexão e tente de novo.' }); }
    setOcupado(false);
  };
  const convidar = async () => {
    if (!tenantId) return;
    setLink('');
    if (MODO_DEMO) { setMsgConvite({ tipo: 'erro', texto: 'Modo demonstração: convites não são emitidos.' }); return; }
    setOcupado(true);
    try {
      const codigo = await criarConvite(tenantId, convite.email, convite.workId);
      setLink(`${window.location.origin}/inicio/?convite=${codigo}`);
      setMsgConvite({ tipo: 'ok', texto: `Convite criado para ${convite.email.trim().toLowerCase()}. Vale por 7 dias e só para esse e-mail.` });
      setConvite({ email: '', workId: convite.workId });
    } catch (e) { setMsgConvite({ tipo: 'erro', texto: e instanceof Error && !/permission/i.test(e.message) ? e.message : 'Não foi possível criar o convite.' }); }
    setOcupado(false);
  };
  const mudar = async (m: Membro, campo: 'obra' | 'perfil', valor: string) => {
    if (!tenantId || MODO_DEMO) return;
    try { await (campo === 'obra' ? atualizarMembro(tenantId, m.id, valor) : definirPerfil(tenantId, m.id, valor)); } catch { setMsgConvite({ tipo: 'erro', texto: `Não foi possível alterar ${m.name ?? m.email}.` }); }
  };
  const remover = async (m: Membro) => {
    if (!tenantId || MODO_DEMO || !window.confirm(`Remover o acesso de ${m.name ?? m.email}?`)) return;
    try { await removerMembro(tenantId, m.id); } catch { setMsgConvite({ tipo: 'erro', texto: 'Não foi possível remover o acesso.' }); }
  };
  const equipe: Membro[] = MODO_DEMO ? [{ id: usuario?.uid ?? 'demo', name: usuario?.nome, email: usuario?.email, role: 'owner', status: 'active' }] : [...membros].sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : String(a.name).localeCompare(String(b.name))));

  return (
    <>
      <PageHeader titulo="Empresa e equipe" descricao="Dados que aparecem em propostas, contratos e relatórios, e quem pode usar o aplicativo." />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Empresa</CardTitle><CardDescription>Nome e CNPJ são os mesmos do cadastro do ObraTop.</CardDescription></CardHeader>
          <CardContent>
            <form className="grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void gravarEmpresa(); }}>
              <Field label="Nome da empresa"><Input required maxLength={120} value={f.nome} onChange={(e) => set('nome', e.target.value)} /></Field>
              <Field label="Razão social"><Input value={f.razao} onChange={(e) => set('razao', e.target.value)} /></Field>
              <Field label="CNPJ"><Input value={f.cnpj} onChange={(e) => set('cnpj', e.target.value)} /></Field>
              <Field label="Estado (UF)"><Select value={f.uf} onChange={(e) => set('uf', e.target.value as UF)}>{UFS.map((u) => <option key={u}>{u}</option>)}</Select></Field>
              <Field label="Responsável técnico"><Input value={f.rtNome} onChange={(e) => set('rtNome', e.target.value)} /></Field>
              <div className="grid grid-cols-[96px_1fr] gap-2">
                <Field label="Conselho"><Select value={f.rtConselho} onChange={(e) => set('rtConselho', e.target.value as 'CREA' | 'CAU')}><option>CREA</option><option>CAU</option></Select></Field>
                <Field label="Nº do registro"><Input value={f.rtRegistro} onChange={(e) => set('rtRegistro', e.target.value)} /></Field>
              </div>
              <Field label="Custo da hora técnica (R$)"><Input inputMode="decimal" value={f.custoHora} onChange={(e) => set('custoHora', e.target.value)} /></Field>
              <Field label="Cor da marca nos PDFs"><Input type="color" className="h-9 p-1" value={f.cor} onChange={(e) => set('cor', e.target.value)} /></Field>
              <Field label="Endereço para notificações (opcional)" className="sm:col-span-2"><Input type="url" placeholder="https://…" value={f.webhook} onChange={(e) => set('webhook', e.target.value)} /></Field>
              <div className="flex items-center gap-3 sm:col-span-2"><Button type="submit" disabled={ocupado}>Salvar empresa</Button><Aviso m={msgEmpresa} /></div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Convidar pessoa</CardTitle><CardDescription>Ela cria a própria senha e entra com o link. O acesso é ligado a uma obra, como no ObraTop; o perfil é escolhido na tabela Equipe depois que a pessoa entra.</CardDescription></CardHeader>
          <CardContent>
            <form className="grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void convidar(); }}>
              <Field label="E-mail" className="sm:col-span-2"><Input type="email" required value={convite.email} onChange={(e) => setConvite((c) => ({ ...c, email: e.target.value }))} /></Field>
              <Field label="Obra" className="sm:col-span-2"><Select required value={convite.workId} onChange={(e) => setConvite((c) => ({ ...c, workId: e.target.value }))}><option value="">Escolha…</option>{obras.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
              <div className="flex items-center gap-3 sm:col-span-2"><Button type="submit" disabled={ocupado}><UserPlus className="h-4 w-4" />Gerar convite</Button><Aviso m={msgConvite} /></div>
            </form>
            {obras.length === 0 && <p className="mt-3 text-xs text-muted-foreground">Cadastre uma obra antes de convidar alguém.</p>}
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
        <CardHeader><CardTitle>Equipe</CardTitle><CardDescription>{equipe.length} pessoa(s) com acesso.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="px-2 py-2 font-medium">Pessoa</th><th className="px-2 py-2 font-medium">Papel</th><th className="px-2 py-2 font-medium">Obra</th><th className="px-2 py-2 font-medium">Perfil</th><th className="px-2 py-2"><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>
              {equipe.map((m) => (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="px-2 py-2"><span className="block font-medium">{m.name ?? m.email}</span><span className="block text-xs text-muted-foreground">{m.email}</span></td>
                  <td className="px-2 py-2"><Badge variant={m.role === 'owner' ? 'success' : 'default'}>{m.role === 'owner' ? 'Proprietário' : 'Usuário de obra'}</Badge></td>
                  {m.role === 'owner' ? <><td className="px-2 py-2 text-muted-foreground">Todas</td><td className="px-2 py-2 text-muted-foreground">Acesso total</td><td /></> : (<>
                    <td className="px-2 py-2"><Select aria-label={`Obra de ${m.name ?? m.email}`} value={m.workId ?? ''} onChange={(e) => void mudar(m, 'obra', e.target.value)}>{!obras.some((o) => o.id === m.workId) && <option value={m.workId ?? ''}>—</option>}{obras.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></td>
                    <td className="px-2 py-2"><Select aria-label={`Perfil de ${m.name ?? m.email}`} value={perfilDe(m.id)} onChange={(e) => void mudar(m, 'perfil', e.target.value)}>{Object.entries(PERFIL_LABEL).map(([v, r]) => <option key={v} value={v}>{r}</option>)}</Select></td>
                    <td className="px-2 py-2 text-right"><Button size="icon" variant="ghost" aria-label={`Remover ${m.name ?? m.email}`} onClick={() => void remover(m)}><Trash2 className="h-4 w-4" /></Button></td>
                  </>)}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}
