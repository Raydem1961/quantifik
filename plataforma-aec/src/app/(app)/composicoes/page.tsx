'use client';
/**
 * Serviços & Cotações — o Quantifik dentro da plataforma: consulta de composições (SINAPI-BA e
 * ORSE-SE), quantitativo de insumos por medidas, preços com pisos do Sinduscon-BA e BDI, e
 * cotações por cliente com PDF. Cotações e parâmetros ficam no escritório (Firestore), não no
 * navegador de cada pessoa.
 */
import * as React from 'react';
import { Copy, Download, FileDown, FileUp, Plus, RotateCcw, Send, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, Field, Input, Segmented, Select, Textarea } from '@/components/ui/form';
import { useAuth } from '@/hooks/use-auth';
import { definirDoc, removerDoc, useColecao } from '@/hooks/use-colecao';
import { carregarOrse, carregarSinapi } from '@/lib/composicoes/fonte';
import {
  buscarServicos, calcularCotacao, calcularQuantidade, calcularServico, CATEGORIA_LABEL, CATEGORIA_ORDEM, categoriaDe, chavePreco, descreverMedidas,
  encargosEfetivos, num as lerNumero, parametrosPadrao, proximoNumero, unitPretty,
  type BaseComposicoes, type Composicao, type Cotacao, type LinhaCusto, type Medidas, type ParametrosPreco, type TipoInsumo,
} from '@/lib/composicoes/motor';
import { PISOS } from '@/lib/composicoes/tabelas';
import { cotacaoParaOrcamento } from '@/lib/obratop/integracao';
import { CATALOGO_PADRAO } from '@/lib/orcamento/bases';
import { brl, num } from '@/lib/format';
import { pode } from '@/lib/rbac';
import { cn } from '@/lib/utils';

type IdBase = 'sinapi' | 'orse';
type DocCotacao = Cotacao & { id: string };
type DocConfig = { id: string; horas?: number; encargos?: number | null; bdi?: number; regime?: 'sd' | 'cd'; pisos?: Record<string, number>; manuais?: Record<string, number> };

const GRUPOS: [TipoInsumo, string, string][] = [
  ['mo', 'Mão de obra', 'var(--series-1)'], ['mat', 'Materiais', 'var(--series-3)'], ['eqp', 'Equipamentos', 'var(--series-2)'],
  ['srv', 'Serviços', 'hsl(var(--muted-foreground))'], ['aux', 'Composições auxiliares', 'hsl(var(--muted-foreground))'],
];
const hoje = () => new Date().toISOString().slice(0, 10);
const novoId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export default function Composicoes() {
  const { tenantId, tenant, usuario, role } = useAuth();
  const podeEditar = pode(role, 'orcamento.editar');
  const [aba, setAba] = React.useState<'servicos' | 'cotacoes' | 'parametros'>('servicos');

  // ── bases ────────────────────────────────────────────────────────────────
  const [bases, setBases] = React.useState<Partial<Record<IdBase, BaseComposicoes>>>({});
  const [erroBase, setErroBase] = React.useState<Partial<Record<IdBase, string>>>({});
  const [idBase, setIdBase] = React.useState<IdBase>('sinapi');
  const carregar = React.useCallback((id: IdBase) => {
    setErroBase((e) => ({ ...e, [id]: undefined }));
    (id === 'sinapi' ? carregarSinapi() : carregarOrse(CATALOGO_PADRAO))
      .then((b) => setBases((x) => ({ ...x, [id]: b })))
      .catch((e: unknown) => setErroBase((x) => ({ ...x, [id]: e instanceof Error ? e.message : 'Falha ao carregar a base.' })));
  }, []);
  React.useEffect(() => { carregar('sinapi'); }, [carregar]);
  React.useEffect(() => { if (idBase === 'orse' && !bases.orse && !erroBase.orse) carregar('orse'); }, [idBase, bases.orse, erroBase.orse, carregar]);
  const base = bases[idBase];

  // ── parâmetros do escritório ─────────────────────────────────────────────
  const { dados: configs } = useColecao<DocConfig>('config');
  const salvo = configs.find((c) => c.id === 'composicoes');
  const [params, setParams] = React.useState<ParametrosPreco>(parametrosPadrao);
  const carregouConfig = React.useRef(false);
  React.useEffect(() => {
    if (!salvo || carregouConfig.current) return;
    carregouConfig.current = true;
    const padrao = parametrosPadrao();
    setParams({
      horas: salvo.horas && salvo.horas > 0 ? salvo.horas : padrao.horas, encargos: salvo.encargos ?? null, bdi: salvo.bdi ?? 0,
      regime: salvo.regime === 'cd' ? 'cd' : 'sd', pisos: { ...padrao.pisos, ...(salvo.pisos ?? {}) }, manuais: salvo.manuais ?? {},
    });
  }, [salvo]);
  const [erroSalvar, setErroSalvar] = React.useState<string>();
  const alterarParams = (patch: Partial<ParametrosPreco>) => {
    const novo = { ...params, ...patch };
    setParams(novo);
    carregouConfig.current = true; // a edição local passa a valer sobre o que vier do servidor
    if (!tenantId || !podeEditar) return;
    const { importados: _fora, ...persistir } = novo;
    definirDoc(tenantId, 'config/composicoes', persistir).then(() => setErroSalvar(undefined), () => setErroSalvar('Não foi possível salvar os parâmetros; eles valem só nesta sessão.'));
  };

  // ── seleção de serviço ───────────────────────────────────────────────────
  const [categoria, setCategoria] = React.useState('');
  const [consulta, setConsulta] = React.useState('');
  const [codigo, setCodigo] = React.useState('');
  const [medidas, setMedidas] = React.useState<Medidas>({});
  const [expandir, setExpandir] = React.useState(true);
  const resultados = React.useMemo(() => (base ? buscarServicos(base, consulta, categoria || undefined, 80) : []), [base, consulta, categoria]);
  // Classificar 10 mil composições custa algumas centenas de milissegundos: faz depois da
  // primeira pintura, para a tela aparecer e responder antes.
  const [contagem, setContagem] = React.useState<Record<string, number>>({});
  React.useEffect(() => {
    if (!base) { setContagem({}); return; }
    const id = setTimeout(() => {
      const m: Record<string, number> = {};
      for (const c of base.comps) { const k = categoriaDe(c); m[k] = (m[k] ?? 0) + 1; }
      setContagem(m);
    }, 0);
    return () => clearTimeout(id);
  }, [base]);
  const servico: Composicao | undefined = base?.porCodigo.get(codigo);
  const q = servico ? calcularQuantidade(servico.unidade, medidas) : null;
  const custo = React.useMemo(
    () => (base && servico && q && !q.vazio && q.qtd > 0 ? calcularServico(base, servico, q.qtd, params, { expandir, sinapi: idBase === 'sinapi' }) : null),
    [base, servico, q, params, expandir, idBase],
  );

  // ── cotações ─────────────────────────────────────────────────────────────
  const { dados: cotacoes } = useColecao<DocCotacao>('cotacoes');
  const ordenadas = React.useMemo(() => [...cotacoes].sort((a, b) => b.numero.localeCompare(a.numero)), [cotacoes]);
  const [idCotacao, setIdCotacao] = React.useState('');
  const cotacao = ordenadas.find((c) => c.id === idCotacao) ?? ordenadas[0];
  const [msg, setMsg] = React.useState<{ tipo: 'ok' | 'erro'; texto: string }>();
  const { dados: obrasBrutas } = useColecao<{ id: string; name?: string; deleted?: boolean }>('works');
  const obras = obrasBrutas.filter((o) => !o.deleted);
  const [obraDestino, setObraDestino] = React.useState('');
  const gravar = async (c: DocCotacao) => {
    if (!tenantId) return;
    try { await definirDoc(tenantId, `cotacoes/${c.id}`, c); } catch { setMsg({ tipo: 'erro', texto: 'Não foi possível salvar a cotação. Verifique sua permissão e a conexão.' }); }
  };
  const nova = async (extra: Partial<Cotacao> = {}): Promise<DocCotacao> => {
    const c: DocCotacao = {
      id: novoId(), numero: proximoNumero(cotacoes, new Date().getFullYear()), cliente: '', obra: '', responsavel: usuario?.nome ?? '', data: hoje(), validadeDias: 30,
      bdi: params.bdi, observacoes: '', detalhar: true, itens: [], ...extra,
    };
    await gravar(c);
    setIdCotacao(c.id);
    return c;
  };
  const adicionarServico = async () => {
    if (!servico || !q || !(q.qtd > 0)) return;
    const alvo = cotacao ?? (await nova());
    await gravar({ ...alvo, itens: [...alvo.itens, { id: novoId(), base: idBase, cod: servico.codigo, descricao: servico.descricao, unidade: servico.unidade, qtd: q.qtd, medidas: descreverMedidas(servico.unidade, medidas) }] });
    setMsg({ tipo: 'ok', texto: `Serviço adicionado à cotação ${alvo.numero}.` });
  };
  // As cotações podem misturar bases: carrega as que faltarem.
  React.useEffect(() => { if (cotacao?.itens.some((i) => i.base === 'orse') && !bases.orse && !erroBase.orse) carregar('orse'); }, [cotacao, bases.orse, erroBase.orse, carregar]);
  const calculo = React.useMemo(() => (cotacao ? calcularCotacao(cotacao, bases, params) : null), [cotacao, bases, params]);

  /** Leva os serviços da cotação para o orçamento da obra (módulo Gestão de obras). */
  const enviarParaObra = async () => {
    const obra = obras.find((o) => o.id === obraDestino);
    if (!tenantId || !cotacao || !calculo || !obra) return;
    const itens = cotacaoParaOrcamento(cotacao, calculo, obra.id);
    if (!itens.length) { setMsg({ tipo: 'erro', texto: 'Nenhum serviço da cotação pôde ser enviado (não encontrados na base atual).' }); return; }
    try {
      const agora = new Date().toISOString();
      for (const { id, ...dados } of itens) await definirDoc(tenantId, `budgets/${id}`, { ...dados, deleted: false, createdAt: agora, createdBy: usuario?.uid ?? '', updatedAt: agora });
      const faltaram = cotacao.itens.length - itens.length;
      setMsg({ tipo: 'ok', texto: `${itens.length} serviço(s) da cotação ${cotacao.numero} no orçamento da obra "${obra.name}".${faltaram ? ` ${faltaram} ficou(aram) de fora por não estar(em) na base atual.` : ''} Em Gestão de obras → Orçamentos você pode gerar o cronograma.` });
    } catch { setMsg({ tipo: 'erro', texto: 'Não foi possível enviar ao orçamento da obra. Verifique sua permissão e a conexão.' }); }
  };

  const gerarPdf = async () => {
    if (!cotacao || !calculo || !tenant) return;
    try {
      const [{ pdf }, { CotacaoPdf }] = await Promise.all([import('@react-pdf/renderer'), import('@/components/contracts/cotacao-pdf')]);
      const referencia = [...new Set(cotacao.itens.map((i) => bases[i.base as IdBase]?.nome).filter(Boolean))].join('; ');
      const blob = await pdf(<CotacaoPdf d={{
        empresa: { nome: tenant.nomeFantasia, razaoSocial: tenant.razaoSocial, cnpj: tenant.cnpj, responsavel: tenant.responsavelTecnico.nome, registro: tenant.responsavelTecnico.registro, logoUrl: tenant.branding.logoUrl, corPrimaria: tenant.branding.corPrimaria },
        cotacao, calculo, referencia,
      }} />).toBlob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `cotacao-${cotacao.numero.replace('/', '-')}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    } catch (e) { setMsg({ tipo: 'erro', texto: `Não foi possível gerar o PDF: ${e instanceof Error ? e.message : 'erro desconhecido'}` }); }
  };
  const exportar = () => {
    const blob = new Blob([JSON.stringify({ formato: 'aec-cotacoes', versao: 1, exportadoEm: new Date().toISOString(), cotacoes }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cotacoes-${hoje()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  };
  const importar = async (arquivo: File) => {
    try {
      const d = JSON.parse(await arquivo.text()) as { cotacoes?: DocCotacao[]; list?: Record<string, unknown>[] };
      // Aceita o arquivo desta plataforma e a cópia de segurança do Quantifik (campo `list`).
      const lista: DocCotacao[] = d.cotacoes ?? (d.list ?? []).map((c) => ({
        id: String(c.id ?? novoId()), numero: String(c.num ?? ''), cliente: String(c.cliente ?? ''), obra: String(c.obra ?? ''), responsavel: String(c.resp ?? ''), data: String(c.data ?? hoje()),
        validadeDias: Number(c.validade ?? 30), bdi: Number(c.bdi ?? 0), observacoes: String(c.obs ?? ''), detalhar: c.det !== false,
        itens: ((c.itens as Record<string, unknown>[] | undefined) ?? []).map((i) => ({ id: novoId(), base: String(i.base ?? 'sinapi'), cod: String(i.cod ?? ''), descricao: String(i.desc ?? i.descricao ?? ''), unidade: String(i.un ?? i.unidade ?? ''), qtd: Number(i.qty ?? i.qtd ?? 0), medidas: String(i.med ?? i.medidas ?? '') })),
      }));
      if (!lista.length) throw new Error('o arquivo não contém cotações');
      const existentes = new Set(cotacoes.map((c) => c.id));
      let n = 0;
      for (const c of lista) {
        if (!Array.isArray(c.itens)) continue;
        // Nunca sobrescreve: cotação com id já existente entra como cópia, com número novo.
        const repetida = existentes.has(c.id);
        await gravar({ ...c, id: repetida ? novoId() : c.id, numero: repetida || !c.numero ? proximoNumero([...cotacoes, ...lista.slice(0, n)], new Date().getFullYear()) : c.numero });
        n++;
      }
      setMsg({ tipo: 'ok', texto: `${n} cotação(ões) importada(s).` });
    } catch (e) { setMsg({ tipo: 'erro', texto: `Importação cancelada: ${e instanceof Error ? e.message : 'arquivo inválido'}.` }); }
  };
  const importarPrecos = async (arquivo: File) => {
    const m = new Map<string, number>();
    for (const linha of (await arquivo.text()).split(/\r?\n/)) {
      const [cod, preco] = linha.split(/[;\t]|,(?=\s*\d+[.,]?\d*\s*$)/);
      const v = lerNumero(preco);
      if (cod && /^\d+$/.test(cod.trim()) && v > 0) m.set(cod.trim(), v);
    }
    if (m.size === 0) { setMsg({ tipo: 'erro', texto: 'Nenhuma linha "código;preço" válida no arquivo.' }); return; }
    setParams((p) => ({ ...p, importados: m }));
    setMsg({ tipo: 'ok', texto: `${m.size} preços de insumos carregados para esta sessão.` });
  };

  const enc = encargosEfetivos(bases.sinapi, params);
  const f = 1 + (params.bdi || 0) / 100;
  const nManuais = Object.keys(params.manuais).length;

  return (
    <>
      <PageHeader titulo="Serviços & Cotações" descricao="Quantitativo de materiais e mão de obra por serviço, com preços do SINAPI-BA, pisos do Sinduscon-BA e BDI; cotações por cliente em PDF.">
        <Segmented value={aba} onChange={setAba} options={[{ value: 'servicos', label: 'Serviços' }, { value: 'cotacoes', label: `Cotações (${cotacoes.length})` }, { value: 'parametros', label: 'Parâmetros' }]} />
      </PageHeader>
      {msg && <p role={msg.tipo === 'erro' ? 'alert' : 'status'} className={cn('mb-4 rounded-md border p-3 text-sm', msg.tipo === 'erro' ? 'border-destructive/40 bg-destructive/5 text-destructive' : 'border-success/40 bg-success/5')}>{msg.texto}</p>}
      {erroSalvar && <p role="alert" className="mb-4 text-xs text-destructive">{erroSalvar}</p>}

      {aba === 'servicos' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Card>
            <CardHeader><CardTitle>Consultar serviços</CardTitle><CardDescription>{base ? `${base.nome} · ${base.comps.length.toLocaleString('pt-BR')} composições` : erroBase[idBase] ? '' : 'Carregando base…'}</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-3">
                <Field label="Base" className="w-36"><Select value={idBase} onChange={(e) => { setIdBase(e.target.value as IdBase); setCodigo(''); }}><option value="sinapi">SINAPI-BA</option><option value="orse">ORSE-SE</option></Select></Field>
                <Field label="Atividade" className="min-w-[180px] flex-1">
                  <Select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                    <option value="">Todas</option>
                    {CATEGORIA_ORDEM.filter((k) => contagem[k]).map((k) => <option key={k} value={k}>{CATEGORIA_LABEL[k]} ({contagem[k]})</option>)}
                  </Select>
                </Field>
              </div>
              <Field label="Buscar por código ou descrição"><Input value={consulta} placeholder="ex.: alvenaria bloco cerâmico 14" onChange={(e) => setConsulta(e.target.value)} /></Field>
              {erroBase[idBase] && <p role="alert" className="text-sm text-destructive">{erroBase[idBase]} <button type="button" className="underline" onClick={() => carregar(idBase)}>Tentar de novo</button></p>}
              <ul className="h-[560px] divide-y overflow-y-auto rounded-md border" aria-label="Serviços encontrados">
                {resultados.map((c) => (
                  <li key={c.codigo}>
                    <button type="button" aria-pressed={c.codigo === codigo} onClick={() => setCodigo(c.codigo)} className={cn('w-full px-3 py-2 text-left hover:bg-accent/60', c.codigo === codigo && 'bg-primary/10')}>
                      <span className="block text-xs leading-snug">{c.descricao}</span>
                      <span className="tabular text-[11px] text-muted-foreground">{c.codigo} · {unitPretty(c.unidade)}{c.grupo ? ` · ${c.grupo}` : ''}</span>
                    </button>
                  </li>
                ))}
                {base && resultados.length === 0 && <li className="p-4 text-center text-xs text-muted-foreground">Nenhum serviço encontrado. Tente menos termos.</li>}
                {!base && !erroBase[idBase] && <li className="p-4 text-center text-xs text-muted-foreground">Carregando composições…</li>}
              </ul>
              {resultados.length === 80 && <p className="text-[11px] text-muted-foreground">Mostrando os 80 primeiros — refine a busca para ver outros.</p>}
            </CardContent>
          </Card>

          <div className="space-y-4">
            {!servico ? <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">Escolha um serviço para informar as medidas e ver materiais, mão de obra e preços.</CardContent></Card> : (
              <>
                <Card>
                  <CardHeader><CardTitle className="leading-snug">{servico.descricao}</CardTitle><CardDescription className="tabular">{idBase.toUpperCase()} {servico.codigo} · medido em {unitPretty(servico.unidade)}</CardDescription></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                      {([['comprimento', 'Comprimento (m)'], ['largura', 'Largura (m)'], ['altura', 'Altura (m)'], ['profundidade', 'Profundidade (m)'], ['quantidade', 'Quantidade / peças']] as const).map(([k, rotulo]) => (
                        <Field key={k} label={rotulo}><Input inputMode="decimal" className="tabular" value={medidas[k] ?? ''} placeholder={k === 'quantidade' ? '1' : '0,00'}
                          onChange={(e) => setMedidas((m) => ({ ...m, [k]: e.target.value === '' ? undefined : lerNumero(e.target.value) }))} /></Field>
                      ))}
                    </div>
                    {q?.aviso && <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">⚠ {q.aviso}</p>}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm">Quantitativo calculado: <b className="tabular">{q && !q.vazio ? `${num(q.qtd, 4)} ${unitPretty(servico.unidade)}` : '—'}</b></p>
                      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={expandir} onChange={(e) => setExpandir(e.target.checked)} />Abrir composições auxiliares em insumos</label>
                      {podeEditar && <Button size="sm" disabled={!custo} onClick={() => void adicionarServico()}><Plus className="h-3.5 w-3.5" />Adicionar à cotação{cotacao ? ` ${cotacao.numero}` : ''}</Button>}
                    </div>
                  </CardContent>
                </Card>

                {!custo ? <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Digite as medidas para calcular quantidades e preços.</CardContent></Card> : (
                  <Card>
                    <CardContent className="space-y-4 p-5">
                      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        {[['Custo unitário', custo.custo / custo.quantidade], ['Custo total', custo.custo], ['Venda unitária (com BDI)', custo.precoVenda / custo.quantidade], ['Venda total (com BDI)', custo.precoVenda]].map(([r, v]) => (
                          <div key={r as string} className="rounded-md border p-3"><p className="text-[11px] text-muted-foreground">{r}</p><p className="tabular text-base font-semibold">{brl(v as number)}</p></div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">BDI de {num(params.bdi)}%: {brl(custo.precoVenda - custo.custo)} sobre o custo.
                        {custo.custoOficialUnitario > 0 && ` Para comparação, o custo oficial desta composição (${params.regime === 'cd' ? 'com' : 'sem'} desoneração) é ${brl(custo.custoOficialUnitario)} por ${unitPretty(servico.unidade)}.`}</p>
                      {custo.semPreco > 0 && <p role="status" className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">⚠ {custo.semPreco} {custo.semPreco > 1 ? 'itens' : 'item'} sem preço. Informe o valor unitário para completar o total.</p>}
                      {GRUPOS.map(([t, rotulo, cor]) => {
                        const linhas = custo.linhas.filter((l) => l.t === t);
                        if (!linhas.length) return null;
                        return (
                          <section key={t} aria-label={rotulo}>
                            <h3 className="flex items-baseline justify-between border-b pb-1 text-sm font-semibold"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: cor }} />{rotulo}</span>
                              <span className="tabular text-xs font-normal text-muted-foreground">{brl(custo.porTipo[t])} · com BDI {brl(custo.porTipo[t] * f)}</span></h3>
                            <ul className="divide-y">{linhas.map((l) => <LinhaPreco key={chavePreco(l) + l.t} l={l} f={f} editavel={podeEditar} manual={params.manuais[chavePreco(l)]}
                              onPreco={(v) => { const m = { ...params.manuais }; if (v === undefined) delete m[chavePreco(l)]; else m[chavePreco(l)] = v; alterarParams({ manuais: m }); }} />)}</ul>
                          </section>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {aba === 'cotacoes' && (
        <div className="space-y-4">
          <Card><CardContent className="flex flex-wrap items-end gap-2 p-4">
            <Field label="Cotação" className="min-w-[240px] flex-1">
              <Select value={cotacao?.id ?? ''} onChange={(e) => setIdCotacao(e.target.value)} disabled={!cotacoes.length}>
                {ordenadas.map((c) => <option key={c.id} value={c.id}>{c.numero} — {c.cliente || c.obra || 'sem cliente'} ({c.itens.length})</option>)}
              </Select>
            </Field>
            {podeEditar && <Button variant="outline" onClick={() => void nova()}><Plus className="h-4 w-4" />Nova</Button>}
            {podeEditar && cotacao && <Button variant="outline" onClick={() => void nova({ ...cotacao, id: novoId(), numero: proximoNumero(cotacoes, new Date().getFullYear()), data: hoje(), itens: cotacao.itens.map((i) => ({ ...i, id: novoId() })) })}><Copy className="h-4 w-4" />Duplicar</Button>}
            {podeEditar && cotacao && <Button variant="outline" onClick={() => { if (tenantId && window.confirm(`Excluir a cotação ${cotacao.numero}? Esta ação não pode ser desfeita.`)) void removerDoc(tenantId, `cotacoes/${cotacao.id}`); }}><Trash2 className="h-4 w-4" />Excluir</Button>}
            <Button variant="outline" disabled={!cotacoes.length} onClick={exportar}><FileDown className="h-4 w-4" />Exportar</Button>
            {podeEditar && <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input px-4 text-sm font-medium hover:bg-accent focus-within:ring-2 focus-within:ring-ring"><FileUp className="h-4 w-4" />Importar
              <input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ''; if (a) void importar(a); }} /></label>}
            <Button disabled={!cotacao || !calculo || !cotacao.itens.length} onClick={() => void gerarPdf()}><Download className="h-4 w-4" />Baixar PDF</Button>
            {podeEditar && cotacao && cotacao.itens.length > 0 && obras.length > 0 && (
              <div className="flex w-full flex-wrap items-end gap-2 border-t pt-3">
                <Field label="Levar esta cotação para o orçamento de uma obra" className="min-w-[240px] flex-1">
                  <Select value={obraDestino} onChange={(e) => setObraDestino(e.target.value)}><option value="">Escolha a obra…</option>{obras.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>
                </Field>
                <Button variant="outline" disabled={!obraDestino} onClick={() => void enviarParaObra()}><Send className="h-4 w-4" />Enviar ao orçamento da obra</Button>
              </div>
            )}
          </CardContent></Card>

          {!cotacao ? <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">Nenhuma cotação ainda. Crie uma ou adicione um serviço pela aba Serviços.</CardContent></Card> : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <Card>
                <CardHeader><CardTitle>Cotação nº {cotacao.numero}</CardTitle></CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  {([['cliente', 'Cliente'], ['obra', 'Obra / local'], ['responsavel', 'Responsável']] as const).map(([k, rotulo]) => (
                    <Field key={k} label={rotulo} className={k === 'responsavel' ? '' : 'sm:col-span-2'}><Input defaultValue={cotacao[k]} key={cotacao.id + k} readOnly={!podeEditar} onBlur={(e) => { if (e.target.value !== cotacao[k]) void gravar({ ...cotacao, [k]: e.target.value }); }} /></Field>
                  ))}
                  <Field label="Data"><Input type="date" defaultValue={cotacao.data} key={`${cotacao.id}data`} readOnly={!podeEditar} onBlur={(e) => { if (e.target.value && e.target.value !== cotacao.data) void gravar({ ...cotacao, data: e.target.value }); }} /></Field>
                  <Field label="Validade (dias)"><Input type="number" min={0} defaultValue={cotacao.validadeDias} key={`${cotacao.id}val`} readOnly={!podeEditar} onBlur={(e) => void gravar({ ...cotacao, validadeDias: Math.max(0, Number(e.target.value) || 0) })} /></Field>
                  <Field label="BDI desta cotação (%)"><Input type="number" min={0} step="0.5" defaultValue={cotacao.bdi} key={`${cotacao.id}bdi`} readOnly={!podeEditar} onBlur={(e) => void gravar({ ...cotacao, bdi: Math.max(0, Number(e.target.value) || 0) })} /></Field>
                  <Field label="Observações" className="sm:col-span-2"><Textarea className="min-h-[70px]" defaultValue={cotacao.observacoes} key={`${cotacao.id}obs`} readOnly={!podeEditar} onBlur={(e) => { if (e.target.value !== cotacao.observacoes) void gravar({ ...cotacao, observacoes: e.target.value }); }} /></Field>
                  <label className="flex items-center gap-2 text-xs sm:col-span-2"><input type="checkbox" checked={cotacao.detalhar} disabled={!podeEditar} onChange={(e) => void gravar({ ...cotacao, detalhar: e.target.checked })} />Incluir a composição de custos de cada serviço no PDF</label>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex-row items-start justify-between gap-2">
                  <div><CardTitle>Serviços da cotação</CardTitle><CardDescription className="mt-1">Preços com BDI de {num(cotacao.bdi)}% embutido.</CardDescription></div>
                  <p className="tabular text-xl font-semibold">{calculo ? brl(calculo.venda) : '—'}</p>
                </CardHeader>
                <CardContent>
                  {calculo && calculo.semPreco > 0 && <p role="status" className="mb-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">⚠ {calculo.semPreco} insumo(s) sem preço ou serviço(s) não encontrado(s): o total está incompleto.</p>}
                  {cotacao.itens.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Adicione serviços pela aba Serviços.</p> : (
                    <ul className="divide-y">{calculo?.itens.map((r) => (
                      <li key={r.item.id} className="flex items-start gap-3 py-2.5">
                        <div className="min-w-0 flex-1"><p className="text-sm leading-snug">{r.item.descricao}</p>
                          <p className="tabular text-[11px] text-muted-foreground">{r.item.base.toUpperCase()} {r.item.cod} · {num(r.item.qtd, 4)} {unitPretty(r.item.unidade)}{r.item.medidas ? ` · ${r.item.medidas}` : ''}</p>
                          {r.falta && <Badge variant="destructive">{bases[r.item.base as IdBase] ? 'não encontrado na base atual' : 'base ainda não carregada'}</Badge>}</div>
                        <p className="tabular shrink-0 text-right text-sm font-medium">{brl(r.venda)}<span className="block text-[11px] font-normal text-muted-foreground">{r.item.qtd > 0 ? `${brl(r.venda / r.item.qtd)}/${unitPretty(r.item.unidade)}` : ''}</span></p>
                        {podeEditar && <Button size="icon" variant="ghost" aria-label={`Remover ${r.item.descricao}`} onClick={() => void gravar({ ...cotacao, itens: cotacao.itens.filter((i) => i.id !== r.item.id) })}><Trash2 className="h-4 w-4" /></Button>}
                      </li>
                    ))}</ul>
                  )}
                  {calculo && calculo.venda > 0 && (
                    <dl className="tabular mt-4 grid grid-cols-2 gap-2 border-t pt-3 text-xs sm:grid-cols-3">
                      {GRUPOS.filter(([t]) => calculo.porTipo[t] > 0).map(([t, rotulo]) => <div key={t}><dt className="text-muted-foreground">{rotulo}</dt><dd className="font-medium">{brl(calculo.porTipo[t])}</dd></div>)}
                    </dl>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {aba === 'parametros' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Preços</CardTitle><CardDescription>Valem para todo o escritório. Preço de venda = custo × {num(f, 4)}.</CardDescription></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <Field label="BDI (%)"><Input type="number" min={0} step="0.5" disabled={!podeEditar} value={params.bdi} onChange={(e) => alterarParams({ bdi: Math.max(0, Number(e.target.value) || 0) })} /></Field>
              <Field label="Regime previdenciário"><Select disabled={!podeEditar} value={params.regime} onChange={(e) => alterarParams({ regime: e.target.value as 'sd' | 'cd' })}><option value="sd">Sem desoneração</option><option value="cd">Com desoneração</option></Select></Field>
              <Field label="Horas por mês"><Input type="number" min={1} disabled={!podeEditar} value={params.horas} onChange={(e) => alterarParams({ horas: Math.max(1, Number(e.target.value) || 220) })} /></Field>
              <Field label={`Encargos sociais (%)${params.encargos === null ? ' — automático' : ''}`}><Input type="number" min={0} step="0.01" disabled={!podeEditar} value={enc} onChange={(e) => alterarParams({ encargos: Math.max(0, Number(e.target.value) || 0) })} /></Field>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                {podeEditar && params.encargos !== null && <Button size="sm" variant="outline" onClick={() => alterarParams({ encargos: null })}><RotateCcw className="h-3.5 w-3.5" />Usar encargos horistas do SINAPI-BA</Button>}
                {podeEditar && nManuais > 0 && <Button size="sm" variant="outline" onClick={() => { if (window.confirm(`Apagar os ${nManuais} preços digitados? Os serviços voltam aos preços das bases.`)) alterarParams({ manuais: {} }); }}>Limpar {nManuais} preços digitados</Button>}
                <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border border-input px-3 text-xs font-medium hover:bg-accent focus-within:ring-2 focus-within:ring-ring"><FileUp className="h-3.5 w-3.5" />Importar tabela de insumos (código;preço)
                  <input type="file" accept=".csv,.txt" className="sr-only" onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ''; if (a) void importarPrecos(a); }} /></label>
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">Valor-hora = piso ÷ horas por mês × (1 + encargos). Na base SINAPI somam-se os encargos complementares da função (EPI, ferramentas, exames, transporte, alimentação).</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Mão de obra — pisos do Sinduscon-BA</CardTitle><CardDescription>Piso mensal por função (convenção coletiva). Atualize quando a convenção mudar.</CardDescription></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-1.5 font-medium">Função</th><th className="py-1.5 text-right font-medium">Piso mensal (R$)</th><th className="py-1.5 text-right font-medium">Valor-hora</th></tr></thead>
                <tbody className="divide-y">{PISOS.map((p) => (
                  <tr key={p.id}><td className="py-1.5 pr-2">{p.nome}</td>
                    <td className="w-36 py-1"><Input type="number" min={0} step="0.01" className="tabular text-right" disabled={!podeEditar} aria-label={`Piso de ${p.nome}`} value={params.pisos[p.id] ?? p.v} onChange={(e) => alterarParams({ pisos: { ...params.pisos, [p.id]: Math.max(0, Number(e.target.value) || 0) } })} /></td>
                    <td className="tabular w-28 py-1.5 text-right text-muted-foreground">{brl(((params.pisos[p.id] ?? p.v) / params.horas) * (1 + enc / 100))}</td></tr>
                ))}</tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

function LinhaPreco({ l, f, editavel, manual, onPreco }: { l: LinhaCusto; f: number; editavel: boolean; manual: number | undefined; onPreco: (v: number | undefined) => void }) {
  const [texto, setTexto] = React.useState<string | null>(null);
  const valor = texto ?? (l.p > 0 ? l.p.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2">
      <div className="min-w-[200px] flex-1">
        <p className="text-xs font-medium leading-snug">{l.desc}</p>
        <p className="tabular text-[11px] text-muted-foreground">{num(l.total, 4)} {unitPretty(l.un)} · {l.origem || 'sem preço: informe o valor'}</p>
      </div>
      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">R$
        <Input inputMode="decimal" className={cn('tabular h-8 w-24 text-right', manual !== undefined && 'border-primary')} disabled={!editavel} aria-label={`Preço unitário de ${l.desc}`} placeholder="0,00" value={valor}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => {
            if (texto === null) return;
            const limpo = texto.trim();
            setTexto(null);
            if (limpo === '') { if (manual !== undefined) onPreco(undefined); return; }
            const v = lerNumero(limpo);
            if (v >= 0 && v !== l.p) onPreco(v);
          }} />
        <span>/{unitPretty(l.un)}</span>
      </label>
      <p className="tabular w-28 text-right text-xs"><b>{brl(l.custo)}</b><span className="block text-[11px] text-muted-foreground">com BDI {brl(l.custo * f)}</span></p>
    </li>
  );
}
