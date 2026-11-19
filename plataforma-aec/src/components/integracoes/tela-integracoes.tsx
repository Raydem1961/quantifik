'use client';
/**
 * Integrações: banco (extrato OFX + Pix), fiscal (NF-e em XML + consulta de CNPJ) e eSocial
 * (conferência cadastral). Tudo o que está aqui funciona sem certificado digital; a transmissão
 * oficial (SEFAZ, eSocial, API de banco) é explicada em cada aba.
 */
import * as React from 'react';
import Link from 'next/link';
import { Check, Copy, Download, FileUp, Info, Search } from 'lucide-react';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, Field, Input, Select } from '@/components/ui/form';
import { useAuth } from '@/hooks/use-auth';
import { atualizarDoc, definirDoc, useColecao } from '@/hooks/use-colecao';
import { brl, dataBr } from '@/lib/format';
import type { Aba } from '@/lib/integracoes/abas';
import { podeGravarModulo, veDadosDePessoal, veTodasAsObras } from '@/lib/obratop/permissoes';
import { cnpjValido, formatarCnpj, soDigitos } from '@/lib/integracoes/documentos';
import { conferir, planilhaTrabalhadores, type Pessoa } from '@/lib/integracoes/esocial';
import { lerNfe, parcelasDaNfe, type Nfe } from '@/lib/integracoes/nfe';
import { conciliar, lerOfx, type Extrato, type Lancamento, type Linha } from '@/lib/integracoes/ofx';
import { pixCopiaECola } from '@/lib/integracoes/pix';
import { cn } from '@/lib/utils';

type Reg = { id: string; deleted?: boolean } & Record<string, unknown>;
type Msg = { tipo: 'ok' | 'erro'; texto: string } | undefined;
const hoje = () => new Date().toISOString().slice(0, 10);
const novoId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const idSeguro = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);

const Aviso = ({ m }: { m: Msg }) => (m ? <p role={m.tipo === 'erro' ? 'alert' : 'status'} className={cn('rounded-md border p-3 text-sm', m.tipo === 'erro' ? 'border-destructive/40 bg-destructive/5 text-destructive' : 'border-success/40 bg-success/5')}>{m.texto}</p> : null);
const Nota = ({ children }: { children: React.ReactNode }) => <p className="flex gap-2 rounded-lg border border-dashed p-3 text-xs leading-relaxed text-muted-foreground"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{children}</span></p>;
const Arquivo = ({ rotulo, aceita, multiplo, onArquivos }: { rotulo: string; aceita: string; multiplo?: boolean; onArquivos: (f: File[]) => void }) => (
  <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-within:ring-2 focus-within:ring-ring">
    <FileUp className="h-4 w-4" />{rotulo}
    <input type="file" className="sr-only" accept={aceita} multiple={multiplo} onChange={(e) => { onArquivos([...(e.target.files ?? [])]); e.target.value = ''; }} />
  </label>
);

/** Obra em que os lançamentos novos entram: o proprietário escolhe; o usuário de obra usa a sua. */
function useObra() {
  const { funcao, obraAtribuida } = useAuth();
  const { dados } = useColecao<Reg>('works');
  const obras = React.useMemo(() => dados.filter((o) => !o.deleted), [dados]);
  const dono = veTodasAsObras(funcao); // escolhe a obra; cadastra fornecedor se a função permitir
  const cadastraFornecedor = podeGravarModulo(funcao, 'suppliers', false, obraAtribuida);
  const [escolhida, setEscolhida] = React.useState('');
  const obraId = dono ? (escolhida || String(obras[0]?.id ?? '')) : (obraAtribuida ?? '');
  const seletor = dono
    ? <Field label="Obra dos novos lançamentos" className="w-64"><Select value={obraId} onChange={(e) => setEscolhida(e.target.value)}>{obras.length === 0 && <option value="">Cadastre uma obra</option>}{obras.map((o) => <option key={o.id} value={o.id}>{String(o.name)}</option>)}</Select></Field>
    : null;
  return { obraId, seletor, dono: cadastraFornecedor, obras };
}

// ───────────────────────────── Bancos ─────────────────────────────
function Bancos() {
  const { tenantId, tenant, usuario } = useAuth();
  const { dados: financeiro } = useColecao<Reg>('finance');
  const { obraId, seletor } = useObra();
  const [extrato, setExtrato] = React.useState<Extrato>();
  const [msg, setMsg] = React.useState<Msg>();
  const linhas = React.useMemo(() => (extrato ? conciliar(extrato.movimentos, financeiro as Lancamento[]) : []), [extrato, financeiro]);
  const sugestoes = linhas.filter((l) => l.situacao === 'sugestao');

  const abrir = async ([f]: File[]) => {
    if (!f) return;
    try { const e = lerOfx(await f.text()); setExtrato(e); setMsg({ tipo: 'ok', texto: `${e.movimentos.length} movimento(s) lidos de ${f.name}.` }); }
    catch (e) { setExtrato(undefined); setMsg({ tipo: 'erro', texto: e instanceof Error ? e.message : 'Não foi possível ler o arquivo.' }); }
  };
  const confirmar = async (ls: Linha[]) => {
    if (!tenantId) return;
    try {
      for (const l of ls) await atualizarDoc(tenantId, `finance/${l.lancamento!.id}`, { status: l.movimento.valor >= 0 ? 'Recebido' : 'Pago', paymentDate: l.movimento.data, bankRef: l.movimento.id, updatedAt: new Date().toISOString(), updatedBy: usuario?.uid ?? '' });
      setMsg({ tipo: 'ok', texto: `${ls.length} lançamento(s) conciliado(s) com o extrato.` });
    } catch { setMsg({ tipo: 'erro', texto: 'Não foi possível conciliar. Verifique a conexão e a sua permissão nesta obra.' }); }
  };
  const lancar = async (l: Linha) => {
    if (!tenantId) return;
    if (!obraId) { setMsg({ tipo: 'erro', texto: 'Escolha a obra em que o lançamento deve entrar.' }); return; }
    const m = l.movimento, agora = new Date().toISOString();
    try {
      await definirDoc(tenantId, `finance/${novoId()}`, { workId: obraId, date: m.data, dueDate: m.data, paymentDate: m.data, description: m.historico.slice(0, 180) || 'Movimento do extrato', type: m.valor >= 0 ? 'Receita' : 'Despesa',
        category: 'Extrato bancário', value: Math.abs(m.valor), status: m.valor >= 0 ? 'Recebido' : 'Pago', bankRef: m.id, deleted: false, createdAt: agora, createdBy: usuario?.uid ?? '', updatedAt: agora });
      setMsg({ tipo: 'ok', texto: `Lançado: ${m.historico || 'movimento'} (${brl(Math.abs(m.valor))}).` });
    } catch { setMsg({ tipo: 'erro', texto: 'Não foi possível lançar. Verifique a conexão e a sua permissão nesta obra.' }); }
  };

  // Pix
  const [pix, setPix] = React.useState({ chave: '', nome: '', cidade: '', valor: '', id: '' });
  const [codigo, setCodigo] = React.useState<{ texto: string; qr: string }>();
  const [erroPix, setErroPix] = React.useState<string>();
  const [copiado, setCopiado] = React.useState(false);
  React.useEffect(() => {
    let salvo: Partial<typeof pix> = {};
    try { salvo = JSON.parse(localStorage.getItem('obratop.pix') ?? '{}'); } catch { /* sem armazenamento */ }
    setPix((p) => ({ ...p, chave: salvo.chave ?? '', cidade: salvo.cidade ?? '', nome: salvo.nome ?? tenant?.nomeFantasia ?? '' }));
  }, [tenant?.nomeFantasia]);
  const aReceber = financeiro.filter((f) => !f.deleted && f.type === 'Receita' && f.status !== 'Recebido');
  const gerar = async () => {
    setErroPix(undefined); setCopiado(false);
    try {
      const v = pix.valor.trim() ? Number(pix.valor.replace(/\./g, '').replace(',', '.')) : undefined;
      if (v !== undefined && !(v > 0)) throw new Error('Valor inválido.');
      const texto = pixCopiaECola({ chave: pix.chave, nome: pix.nome, cidade: pix.cidade, valor: v, identificador: pix.id });
      const QR = (await import('qrcode')).default;
      setCodigo({ texto, qr: await QR.toDataURL(texto, { margin: 1, width: 440, errorCorrectionLevel: 'M' }) });
      try { localStorage.setItem('obratop.pix', JSON.stringify({ chave: pix.chave, nome: pix.nome, cidade: pix.cidade })); } catch { /* sem armazenamento */ }
    } catch (e) { setCodigo(undefined); setErroPix(e instanceof Error ? e.message : 'Não foi possível gerar o código.'); }
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
      <Card className="xl:col-span-3">
        <CardHeader><CardTitle>Conciliação bancária</CardTitle><CardDescription>Importe o extrato em OFX (internet banking → exportar extrato → OFX/Money). O arquivo é lido neste computador e não é enviado a ninguém.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <Arquivo rotulo="Importar extrato OFX" aceita=".ofx,.qfx,.txt" onArquivos={(f) => void abrir(f)} />
            {seletor}
            {sugestoes.length > 1 && <Button variant="outline" onClick={() => void confirmar(sugestoes)}><Check className="h-4 w-4" />Confirmar as {sugestoes.length} sugestões</Button>}
          </div>
          <Aviso m={msg} />
          {extrato && (<>
            <p className="text-xs text-muted-foreground">Banco {extrato.banco || '—'} · conta {extrato.conta || '—'} · {dataBr(extrato.inicio)} a {dataBr(extrato.fim)}{extrato.saldo !== null && <> · saldo final <strong className="tabular text-foreground">{brl(extrato.saldo)}</strong></>}</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="px-2 py-2 font-medium">Data</th><th className="px-2 py-2 font-medium">Histórico</th><th className="px-2 py-2 text-right font-medium">Valor</th><th className="px-2 py-2 font-medium">Situação</th><th className="px-2 py-2"><span className="sr-only">Ação</span></th></tr></thead>
                <tbody>{linhas.map((l) => (
                  <tr key={l.movimento.id} className="border-b last:border-0">
                    <td className="tabular whitespace-nowrap px-2 py-2">{dataBr(l.movimento.data)}</td>
                    <td className="max-w-[260px] truncate px-2 py-2" title={l.movimento.historico}>{l.movimento.historico}</td>
                    <td className={cn('tabular whitespace-nowrap px-2 py-2 text-right font-medium', l.movimento.valor < 0 && 'text-destructive')}>{brl(l.movimento.valor)}</td>
                    <td className="px-2 py-2">
                      {l.situacao === 'ja_conciliado' && <Badge variant="success">Conciliado</Badge>}
                      {l.situacao === 'sugestao' && <span className="text-xs"><Badge variant="primary">Sugestão</Badge> <span className="text-muted-foreground">{String(l.lancamento?.description ?? '')}{l.diasDeDiferenca ? ` · ${l.diasDeDiferenca} dia(s) de diferença` : ''}</span></span>}
                      {l.situacao === 'sem_par' && <Badge variant="warning">Sem lançamento</Badge>}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {l.situacao === 'sugestao' && <Button size="sm" variant="outline" aria-label={`Confirmar ${l.movimento.historico}`} onClick={() => void confirmar([l])}>Confirmar</Button>}
                      {l.situacao === 'sem_par' && <Button size="sm" variant="outline" aria-label={`Lançar ${l.movimento.historico}`} onClick={() => void lancar(l)}>Lançar</Button>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </>)}
          <Nota>Extrato automático (sem importar arquivo) e emissão de boletos dependem de contrato de API com o seu banco (Open Finance / API Pix / cobrança) e do certificado da empresa. Com o contrato em mãos, a ligação é feita no servidor do aplicativo.</Nota>
        </CardContent>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader><CardTitle>Cobrança por Pix</CardTitle><CardDescription>Gera o Pix copia e cola e o QR Code. O valor cai direto na conta da chave, sem tarifa de intermediário.</CardDescription></CardHeader>
        <CardContent>
          <form className="grid grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); void gerar(); }}>
            <Field label="Chave Pix" className="col-span-2"><Input required placeholder="CNPJ, e-mail, telefone ou chave aleatória" value={pix.chave} onChange={(e) => setPix({ ...pix, chave: e.target.value })} /></Field>
            <Field label="Recebedor"><Input required maxLength={60} value={pix.nome} onChange={(e) => setPix({ ...pix, nome: e.target.value })} /></Field>
            <Field label="Cidade"><Input required maxLength={30} value={pix.cidade} onChange={(e) => setPix({ ...pix, cidade: e.target.value })} /></Field>
            {aReceber.length > 0 && <Field label="Preencher com uma conta a receber" className="col-span-2"><Select value="" onChange={(e) => { const f = aReceber.find((x) => x.id === e.target.value); if (f) setPix({ ...pix, valor: Number(f.value || 0).toFixed(2).replace('.', ','), id: idSeguro(String(f.description ?? '')).replace(/_/g, '').slice(0, 25) }); }}>
              <option value="">Escolha…</option>{aReceber.map((f) => <option key={f.id} value={f.id}>{String(f.description)} — {brl(Number(f.value) || 0)}</option>)}</Select></Field>}
            <Field label="Valor (R$) — opcional"><Input inputMode="decimal" placeholder="0,00" value={pix.valor} onChange={(e) => setPix({ ...pix, valor: e.target.value })} /></Field>
            <Field label="Identificador — opcional"><Input maxLength={25} placeholder="MED002" value={pix.id} onChange={(e) => setPix({ ...pix, id: e.target.value })} /></Field>
            <div className="col-span-2"><Button type="submit">Gerar Pix</Button></div>
            {erroPix && <p role="alert" className="col-span-2 text-xs text-destructive">{erroPix}</p>}
          </form>
          {codigo && (
            <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border bg-muted/30 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- imagem gerada na hora (data URL) */}
              <img src={codigo.qr} alt="QR Code do Pix" width={220} height={220} className="rounded-lg bg-white p-2" />
              <code aria-label="Pix copia e cola" className="w-full break-all rounded-md bg-background p-2 text-[11px] leading-relaxed">{codigo.texto}</code>
              <Button variant="outline" onClick={() => { void navigator.clipboard?.writeText(codigo.texto); setCopiado(true); }}><Copy className="h-4 w-4" />{copiado ? 'Copiado' : 'Copiar código'}</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ───────────────────────────── Fiscal ─────────────────────────────
interface Empresa { razao_social?: string; nome_fantasia?: string; descricao_situacao_cadastral?: string; municipio?: string; uf?: string; cnae_fiscal_descricao?: string; ddd_telefone_1?: string; email?: string }
function Fiscal() {
  const { tenantId, usuario } = useAuth();
  const { dados: financeiro } = useColecao<Reg>('finance');
  const { dados: fornecedores } = useColecao<Reg>('suppliers');
  const { obraId, seletor, dono } = useObra();
  const [notas, setNotas] = React.useState<Nfe[]>([]);
  const [msg, setMsg] = React.useState<Msg>();
  const lancada = (n: Nfe) => financeiro.some((f) => !f.deleted && f.nfeKey === n.chave);
  const fornecedorDe = (cnpj: string) => fornecedores.find((s) => !s.deleted && soDigitos(String(s.cnpj ?? '')) === soDigitos(cnpj));

  const abrir = async (arquivos: File[]) => {
    const lidas: Nfe[] = [], erros: string[] = [];
    for (const f of arquivos) { try { lidas.push(lerNfe(await f.text())); } catch (e) { erros.push(`${f.name}: ${e instanceof Error ? e.message : 'arquivo inválido'}`); } }
    setNotas((a) => [...lidas, ...a.filter((x) => !lidas.some((n) => n.chave === x.chave))]);
    setMsg(erros.length ? { tipo: 'erro', texto: erros.join(' ') } : { tipo: 'ok', texto: `${lidas.length} nota(s) lida(s).` });
  };
  const criarFornecedor = async (nome: string, cnpj: string, extra: Record<string, unknown> = {}) => {
    const agora = new Date().toISOString(), id = `cnpj-${soDigitos(cnpj)}`;
    await definirDoc(tenantId!, `suppliers/${id}`, { name: nome.slice(0, 180), cnpj: formatarCnpj(cnpj), status: 'Ativo', ...extra, deleted: false, createdAt: agora, createdBy: usuario?.uid ?? '', updatedAt: agora });
    return id;
  };
  const lancar = async (n: Nfe) => {
    if (!tenantId) return;
    if (!obraId) { setMsg({ tipo: 'erro', texto: 'Escolha a obra em que as contas a pagar devem entrar.' }); return; }
    try {
      let supplierId = fornecedorDe(n.emitente.cnpj)?.id;
      // Fornecedores são cadastro do proprietário (regra do ObraTop); o usuário de obra lança só as contas.
      if (!supplierId && dono && n.emitente.cnpj) supplierId = await criarFornecedor(n.emitente.nome, n.emitente.cnpj, { category: 'Materiais' });
      const parcelas = parcelasDaNfe(n), agora = new Date().toISOString();
      for (const p of parcelas) {
        await definirDoc(tenantId, `finance/nfe-${n.chave}-${idSeguro(p.numero)}`, { workId: obraId, date: n.emissao, dueDate: p.vencimento, description: `NF-e ${n.numero} — ${n.emitente.fantasia || n.emitente.nome}${parcelas.length > 1 ? ` (parcela ${p.numero})` : ''}`.slice(0, 180),
          type: 'Despesa', category: 'Materiais', value: p.valor, status: 'Pendente', nfeKey: n.chave, ...(supplierId ? { supplierId } : {}), deleted: false, createdAt: agora, createdBy: usuario?.uid ?? '', updatedAt: agora });
      }
      setMsg({ tipo: 'ok', texto: `NF-e ${n.numero}: ${parcelas.length} conta(s) a pagar lançada(s)${supplierId ? ' e fornecedor vinculado' : ''}.` });
    } catch { setMsg({ tipo: 'erro', texto: 'Não foi possível lançar a nota. Verifique a conexão e a sua permissão nesta obra.' }); }
  };

  const [cnpj, setCnpj] = React.useState('');
  const [consulta, setConsulta] = React.useState<{ ocupado?: boolean; erro?: string; dados?: Empresa }>({});
  const consultar = async () => {
    if (!cnpjValido(cnpj)) { setConsulta({ erro: 'CNPJ inválido: confira os dígitos.' }); return; }
    setConsulta({ ocupado: true });
    try {
      const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${soDigitos(cnpj)}`);
      if (r.status === 404) { setConsulta({ erro: 'CNPJ não encontrado na Receita Federal.' }); return; }
      if (!r.ok) throw new Error(String(r.status));
      setConsulta({ dados: await r.json() as Empresa });
    } catch { setConsulta({ erro: 'A consulta pública está indisponível agora. Tente de novo em alguns minutos.' }); }
  };
  const d = consulta.dados;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
      <Card className="xl:col-span-3">
        <CardHeader><CardTitle>Notas fiscais de compra (NF-e)</CardTitle><CardDescription>Importe o XML que o fornecedor envia junto com a nota. O aplicativo cadastra o fornecedor e lança as contas a pagar pelas duplicatas — sem redigitar.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3"><Arquivo rotulo="Importar XML de NF-e" aceita=".xml" multiplo onArquivos={(f) => void abrir(f)} />{seletor}</div>
          <Aviso m={msg} />
          {notas.map((n) => (
            <article key={n.chave} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold">NF-e {n.numero} · {n.emitente.fantasia || n.emitente.nome}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">{formatarCnpj(n.emitente.cnpj)} · {n.emitente.municipio}/{n.emitente.uf} · emitida em {dataBr(n.emissao)}</p>
                </div>
                <p className="tabular text-lg font-semibold">{brl(n.valorTotal)}</p>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant={n.autorizada ? 'success' : 'warning'}>{n.autorizada ? 'Autorizada pela SEFAZ' : 'Sem protocolo de autorização no arquivo'}</Badge>
                {!n.chaveValida && <Badge variant="destructive">Chave de acesso inválida</Badge>}
                {fornecedorDe(n.emitente.cnpj) ? <Badge>Fornecedor já cadastrado</Badge> : <Badge variant="primary">{dono ? 'Fornecedor novo' : 'Fornecedor não cadastrado'}</Badge>}
                {lancada(n) && <Badge variant="success">Já lançada no financeiro</Badge>}
              </div>
              <ul className="mt-3 divide-y text-xs">{n.itens.slice(0, 6).map((i, k) => <li key={k} className="flex justify-between gap-3 py-1.5"><span className="min-w-0 truncate">{i.descricao}</span><span className="tabular shrink-0 text-muted-foreground">{i.quantidade.toLocaleString('pt-BR')} {i.unidade} × {brl(i.valorUnitario)} = {brl(i.valorTotal)}</span></li>)}
                {n.itens.length > 6 && <li className="py-1.5 text-muted-foreground">… e mais {n.itens.length - 6} item(ns)</li>}</ul>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">{parcelasDaNfe(n).map((p) => `${dataBr(p.vencimento)}: ${brl(p.valor)}`).join(' · ')}</p>
                <Button size="sm" disabled={!n.chaveValida} onClick={() => void lancar(n)}>{lancada(n) ? 'Atualizar contas a pagar' : 'Lançar contas a pagar'}</Button>
              </div>
            </article>
          ))}
          <Nota>Emissão de NF-e/NFS-e, busca automática das notas emitidas contra o seu CNPJ e manifestação do destinatário são feitas na SEFAZ e na prefeitura com o certificado digital e-CNPJ (A1) da empresa. Isso exige o certificado e um serviço emissor contratado; não é feito por esta tela.</Nota>
        </CardContent>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader><CardTitle>Consulta de CNPJ</CardTitle><CardDescription>Dados públicos da Receita Federal, para conferir e cadastrar fornecedores.</CardDescription></CardHeader>
        <CardContent>
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void consultar(); }}>
            <Field label="CNPJ" className="flex-1"><Input required inputMode="numeric" placeholder="00.000.000/0000-00" value={cnpj} onChange={(e) => setCnpj(e.target.value)} /></Field>
            <Button type="submit" disabled={consulta.ocupado}><Search className="h-4 w-4" />Consultar</Button>
          </form>
          {consulta.erro && <p role="alert" className="mt-3 text-xs text-destructive">{consulta.erro}</p>}
          {d && (
            <div className="mt-4 rounded-xl border p-4 text-sm">
              <p className="font-semibold">{d.razao_social}</p>
              {d.nome_fantasia && <p className="text-xs text-muted-foreground">{d.nome_fantasia}</p>}
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Situação</dt><dd><Badge variant={d.descricao_situacao_cadastral === 'ATIVA' ? 'success' : 'destructive'}>{d.descricao_situacao_cadastral ?? '—'}</Badge></dd>
                <dt className="text-muted-foreground">Local</dt><dd>{d.municipio}/{d.uf}</dd>
                <dt className="text-muted-foreground">Atividade</dt><dd>{d.cnae_fiscal_descricao}</dd>
              </dl>
              {dono && (fornecedorDe(cnpj) ? <p className="mt-3 text-xs text-muted-foreground">Já está nos fornecedores.</p>
                : <Button size="sm" className="mt-3" onClick={() => void criarFornecedor(d.razao_social ?? 'Fornecedor', cnpj, { ...(d.ddd_telefone_1 ? { phone: d.ddd_telefone_1 } : {}), ...(d.email ? { email: d.email } : {}) }).then(() => setMsg({ tipo: 'ok', texto: `${d.razao_social} cadastrado nos fornecedores.` }), () => setConsulta({ dados: d, erro: 'Não foi possível cadastrar o fornecedor.' }))}>Cadastrar como fornecedor</Button>)}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ───────────────────────────── eSocial ─────────────────────────────
function Esocial() {
  const { funcao } = useAuth();
  const { dados: pessoal } = useColecao<Pessoa>('staff');
  const { obras } = useObra();
  const lista = React.useMemo(() => conferir(pessoal), [pessoal]);
  const prontas = lista.filter((l) => l.pendencias.length === 0).length;
  if (!veDadosDePessoal(funcao)) return <Card><CardContent className="p-6 text-sm text-muted-foreground">A conferência do eSocial mostra CPF, nascimento e salário: fica disponível ao Administrador e ao Financeiro.</CardContent></Card>;
  const baixar = () => {
    const url = URL.createObjectURL(new Blob([planilhaTrabalhadores(lista, (id) => String(obras.find((o) => o.id === id)?.name ?? ''))], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `trabalhadores-esocial-${hoje()}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div><CardTitle>Conferência cadastral para o eSocial</CardTitle><CardDescription className="mt-1">{lista.length === 0 ? 'Nenhuma pessoa ativa cadastrada.' : `${prontas} de ${lista.length} pessoa(s) com os dados de admissão completos.`}</CardDescription></div>
        <div className="flex gap-2"><Link href="/gestao/staff/" className="inline-flex h-9 items-center rounded-md border border-input px-4 text-sm font-medium hover:bg-accent">Corrigir em Pessoal</Link>
          <Button disabled={lista.length === 0} onClick={baixar}><Download className="h-4 w-4" />Planilha para a contabilidade</Button></div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {lista.length > 0 && (
          <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="px-2 py-2 font-medium">Pessoa</th><th className="px-2 py-2 font-medium">Função</th><th className="px-2 py-2 font-medium">Admissão</th><th className="px-2 py-2 font-medium">O que falta</th></tr></thead>
            <tbody>{lista.map(({ pessoa: p, pendencias }) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="px-2 py-2 font-medium">{String(p.name ?? '—')}</td><td className="px-2 py-2">{String(p.role ?? '—')}</td>
                <td className="tabular px-2 py-2">{p.admission ? dataBr(String(p.admission)) : '—'}</td>
                <td className="px-2 py-2">{pendencias.length === 0 ? <Badge variant="success">Completo</Badge> : <span className="flex flex-wrap gap-1">{pendencias.map((x) => <Badge key={x} variant="warning">{x}</Badge>)}</span>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <Nota>O envio dos eventos ao eSocial (admissão, folha, afastamentos, SST) é feito com o certificado digital da empresa, normalmente pelo sistema de folha da contabilidade. Esta tela garante que os dados saem daqui completos e válidos (CPF, CBO, datas e salário) e entrega a planilha pronta para importação.</Nota>
      </CardContent>
    </Card>
  );
}

const TITULOS: Record<Aba, [string, string]> = {
  bancos: ['Bancos e Pix', 'Conciliação do extrato com o financeiro e cobrança por Pix.'],
  fiscal: ['Notas fiscais e CNPJ', 'Notas de compra viram fornecedor e contas a pagar; consulta de CNPJ na Receita.'],
  esocial: ['eSocial', 'Dados dos trabalhadores conferidos e prontos para a contabilidade.'],
};
export function TelaIntegracoes({ aba }: { aba: Aba }) {
  const [titulo, descricao] = TITULOS[aba] ?? TITULOS.bancos;
  return (<><PageHeader titulo={titulo} descricao={descricao} />{aba === 'fiscal' ? <Fiscal /> : aba === 'esocial' ? <Esocial /> : <Bancos />}</>);
}
