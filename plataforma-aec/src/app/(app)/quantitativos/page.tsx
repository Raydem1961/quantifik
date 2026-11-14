'use client';
/**
 * Importação universal (BIM/IFC, DXF, LandXML, EPANET, SWMM, pontos, planilhas) e orçamento
 * analítico por composições. Os quantitativos ficam em `projects/{id}/quantities` e os vínculos
 * em `vinculos`: como a tela assina as duas coleções (onSnapshot), qualquer importação, revisão
 * ou vínculo feito por um colega recalcula o orçamento na hora para todos.
 */
import * as React from 'react';
import Link from 'next/link';
import { Check, FileUp, Search, Sparkles, Trash2, X } from 'lucide-react';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, Field, Input, Select } from '@/components/ui/form';
import { useAuth } from '@/hooks/use-auth';
import { definirDoc, removerDoc, useColecao } from '@/hooks/use-colecao';
import { useWorkspace } from '@/hooks/use-workspace';
import { EXTENSOES_IMPORTAVEIS, FORMATO_LABEL, importarArquivo, slug, type ItemQuantitativo, type ResultadoImportacao } from '@/lib/import';
import { EPANET_EXEMPLO, IFC_EXEMPLO, LANDXML_EXEMPLO, PONTOS_EXEMPLO, SWMM_EXEMPLO, TABELA_EXEMPLO } from '@/lib/import/exemplos';
import { buscarComposicoes, calcularOrcamentoAnalitico, chaveVinculo, indexarBase, resolverVinculos, type IndiceBase, type LinhaOrcamento, type Vinculo } from '@/lib/orcamento/analitico';
import { carregarBase, carregarCatalogo, maisRecentes, type EntradaCatalogo } from '@/lib/orcamento/bases';
import { MODO_DEMO } from '@/lib/firebase/client';
import { analiticoParaOrcamento } from '@/lib/obratop/integracao';
import { brl, num, pct } from '@/lib/format';
import { pode } from '@/lib/rbac';
import { DISCIPLINA_LABEL, type Disciplina, type Project } from '@/lib/types';
import { cn } from '@/lib/utils';

type DocQuantidades = ResultadoImportacao & { id: string; importadoEm: string; importadoPor: string };
type DocVinculo = Vinculo & { id: string; chave: string };

/** Id de documento estável e válido no Firestore para uma chave de vínculo + fonte. */
function idVinculo(chave: string, fonte: string): string {
  let h = 5381;
  for (const c of `${fonte}|${chave}`) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0;
  return `${slug(fonte)}-${h.toString(16)}-${slug(chave).slice(0, 60)}`;
}

const EXEMPLOS: [string, string][] = [
  ['edificio.ifc', IFC_EXEMPLO], ['rede-agua.inp', EPANET_EXEMPLO], ['rede-esgoto.inp', SWMM_EXEMPLO],
  ['loteamento.xml', LANDXML_EXEMPLO], ['levantamento.txt', PONTOS_EXEMPLO], ['quantitativos-estrutura.csv', TABELA_EXEMPLO],
];

function PainelBusca({ linha, indice, onEscolher, onFechar }: {
  linha: LinhaOrcamento; indice: IndiceBase; onEscolher: (codigo: string, fator: number) => void; onFechar: () => void;
}) {
  const [consulta, setConsulta] = React.useState(linha.item.descricao);
  const [fator, setFator] = React.useState(linha.vinculo?.fator ?? 1);
  const candidatos = React.useMemo(() => buscarComposicoes(indice, consulta, linha.item.unidade, 12), [indice, consulta, linha.item.unidade]);
  return (
    <div className="space-y-2 rounded-md border bg-muted/40 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label={`Buscar composição em ${indice.base.meta.source} (por termos ou código)`} className="min-w-[220px] flex-1">
          <Input autoFocus value={consulta} onChange={(e) => setConsulta(e.target.value)} />
        </Field>
        <Field label="Fator de conversão" className="w-36">
          <Input type="number" min={0} step="any" className="tabular" value={fator} title="Multiplica a quantidade do item antes do preço (ex.: ha → m² = 10000)" onChange={(e) => setFator(Number(e.target.value) || 1)} />
        </Field>
        <Button variant="ghost" size="sm" onClick={onFechar}><X className="h-3.5 w-3.5" />Fechar</Button>
      </div>
      {indice.porCodigo.has(consulta.trim()) && (
        <Button size="sm" onClick={() => onEscolher(consulta.trim(), fator)}>Usar o código {consulta.trim()}</Button>
      )}
      {candidatos.length === 0 ? <p className="py-2 text-xs text-muted-foreground">Nenhuma composição encontrada. Tente menos termos, ou confira números (DN, espessura), que precisam existir na descrição.</p> : (
        <ul className="max-h-72 divide-y overflow-y-auto rounded-md border bg-card">
          {candidatos.map((c) => (
            <li key={c.linha.code} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs leading-snug">{c.linha.description}</p>
                <p className="tabular mt-0.5 text-[11px] text-muted-foreground">
                  {c.linha.code} · {brl(c.linha.price)}/{c.linha.unit.toLowerCase()}
                  {!c.unidadeCompativel && <span className="text-warning"> · unidade diferente do item ({linha.item.unidade}): ajuste o fator</span>}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => onEscolher(String(c.linha.code), fator)}>Usar</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Quantitativos() {
  const { tenantId, tenant, usuario, role } = useAuth();
  const { setAnalitico } = useWorkspace();
  const { dados: projetos } = useColecao<Project>('projects');
  const [projectId, setProjectId] = React.useState('');
  const projeto = projetos.find((p) => p.id === projectId) ?? projetos[0];
  const { dados: arquivos } = useColecao<DocQuantidades>(projeto ? `projects/${projeto.id}/quantities` : null);
  const { dados: vinculosSalvos } = useColecao<DocVinculo>('vinculos');
  const [catalogo, setCatalogo] = React.useState<EntradaCatalogo[]>([]);
  const [baseId, setBaseId] = React.useState('');
  const [indice, setIndice] = React.useState<IndiceBase | null>(null);
  const [estadoBase, setEstadoBase] = React.useState<{ carregando?: boolean; erro?: string }>({ carregando: true });
  const [bdi, setBdi] = React.useState(25);
  const [aberto, setAberto] = React.useState<string | null>(null);
  const [recusadas, setRecusadas] = React.useState<Set<string>>(new Set());
  const [mensagens, setMensagens] = React.useState<{ tipo: 'erro' | 'info'; texto: string }[]>([]);
  const podeEditar = pode(role, 'orcamento.editar');

  // Catálogo de bases oficiais; por padrão, SINAPI da UF do escritório.
  React.useEffect(() => {
    let vivo = true;
    carregarCatalogo().then((c) => {
      if (!vivo) return;
      const lista = maisRecentes(c);
      setCatalogo(lista);
      const padrao = lista.find((b) => b.source === 'SINAPI' && b.uf === (tenant?.uf ?? 'BA') && /n[aã]o/i.test(b.regime ?? '')) ?? lista.find((b) => b.source === 'SINAPI') ?? lista[0];
      setBaseId((atual) => atual || padrao?.id || '');
      if (lista.length === 0) setEstadoBase({ erro: 'O catálogo não tem bases prontas.' });
    }).catch((e: unknown) => vivo && setEstadoBase({ erro: e instanceof Error ? e.message : 'Falha ao carregar o catálogo de bases.' }));
    return () => { vivo = false; };
  }, [tenant?.uf]);

  React.useEffect(() => {
    const entrada = catalogo.find((b) => b.id === baseId);
    if (!entrada) return;
    let vivo = true;
    setEstadoBase({ carregando: true });
    setIndice(null);
    carregarBase(entrada).then((b) => { if (vivo) { setIndice(indexarBase(b)); setEstadoBase({}); } })
      .catch((e: unknown) => vivo && setEstadoBase({ erro: e instanceof Error ? e.message : 'Falha ao carregar a base de preços.' }));
    return () => { vivo = false; };
  }, [baseId, catalogo]);

  const itens = React.useMemo<ItemQuantitativo[]>(() => arquivos.flatMap((a) => a.itens ?? []), [arquivos]);

  const orcamento = React.useMemo(() => {
    if (!indice) return null;
    const salvos: Record<string, Vinculo> = {};
    for (const v of vinculosSalvos) salvos[v.chave] = v;
    const vinculos = resolverVinculos(itens, indice, salvos);
    for (const id of recusadas) if (vinculos[id]?.estado === 'sugerido') delete vinculos[id];
    return calcularOrcamentoAnalitico(itens, vinculos, indice, Math.max(0, bdi) / 100);
  }, [indice, itens, vinculosSalvos, recusadas, bdi]);

  // Disponibiliza o resultado para o contrato/PDF.
  React.useEffect(() => {
    if (!orcamento || !projeto || orcamento.custoDireto <= 0) return;
    setAnalitico({
      projectId: projeto.id, base: `${orcamento.base.source} ${orcamento.base.uf} ${orcamento.base.reference.split('-').reverse().join('/')}${orcamento.base.regime ? ` (${orcamento.base.regime})` : ''}`,
      custoDireto: orcamento.custoDireto, bdiPercentual: orcamento.bdiPercentual, precoVenda: orcamento.precoVenda, itensPendentes: orcamento.itensPendentes,
      porDisciplina: orcamento.porDisciplina.map((d) => ({ disciplina: DISCIPLINA_LABEL[d.disciplina], total: d.total })),
      linhas: orcamento.linhas.filter((l) => l.estado === 'confirmado').map((l) => ({
        descricao: l.item.descricao, disciplina: DISCIPLINA_LABEL[l.item.disciplina], unidade: l.item.unidade, quantidade: l.item.quantidade * (l.vinculo?.fator ?? 1),
        codigo: l.vinculo?.codigo ?? '', precoUnitario: l.precoUnitario, total: l.total,
      })),
    });
  }, [orcamento, projeto, setAnalitico]);

  const importar = async (entradas: { nome: string; texto: () => Promise<string> }[]) => {
    if (!tenantId || !projeto || !usuario) return;
    const msgs: typeof mensagens = [];
    for (const e of entradas) {
      try {
        const r = importarArquivo(e.nome, await e.texto());
        // Mesmo nome de arquivo = nova revisão: substitui os quantitativos anteriores.
        await definirDoc(tenantId, `projects/${projeto.id}/quantities/${slug(e.nome)}`, { ...r, importadoEm: new Date().toISOString(), importadoPor: usuario.nome });
        for (const a of r.avisos) msgs.push({ tipo: 'info', texto: `${e.nome}: ${a}` });
      } catch (erro) {
        msgs.push({ tipo: 'erro', texto: `${e.nome}: ${erro instanceof Error ? erro.message : 'não foi possível importar.'}` });
      }
    }
    setMensagens(msgs);
  };

  const vincular = async (linha: LinhaOrcamento, codigo: string, fator: number) => {
    if (!tenantId || !indice) return;
    const chave = chaveVinculo(linha.item);
    const fonte = indice.base.meta.source;
    try {
      await definirDoc(tenantId, `vinculos/${idVinculo(chave, fonte)}`, { chave, fonte, codigo, fator: fator > 0 ? fator : 1, estado: 'confirmado', descricao: linha.item.descricao, confirmadoPor: usuario?.nome ?? '', confirmadoEm: new Date().toISOString() });
      setAberto(null);
    } catch { setMensagens([{ tipo: 'erro', texto: 'Não foi possível salvar o vínculo. Verifique sua permissão e a conexão.' }]); }
  };
  const desvincular = async (linha: LinhaOrcamento) => {
    if (!tenantId || !indice) return;
    if (linha.estado === 'sugerido') { setRecusadas((s) => new Set(s).add(linha.item.id)); return; }
    try { await removerDoc(tenantId, `vinculos/${idVinculo(chaveVinculo(linha.item), indice.base.meta.source)}`); }
    catch { setMensagens([{ tipo: 'erro', texto: 'Não foi possível remover o vínculo.' }]); }
  };
  const confirmarSugestoes = async () => {
    const sugeridas = orcamento?.linhas.filter((l) => l.estado === 'sugerido') ?? [];
    if (!window.confirm(`Confirmar ${sugeridas.length} sugestão(ões) sem revisar uma a uma?\n\nSugestões vêm de semelhança de texto e podem apontar para um serviço parecido, mas errado. Elas passarão a compor o preço deste e dos próximos projetos.`)) return;
    for (const l of sugeridas) if (l.vinculo) await vincular(l, l.vinculo.codigo, l.vinculo.fator);
  };

  const { dados: obrasBrutas } = useColecao<{ id: string; name?: string; deleted?: boolean }>('works');
  const obras = obrasBrutas.filter((o) => !o.deleted);
  const [obraDestino, setObraDestino] = React.useState('');
  /** Leva as linhas com composição confirmada para o orçamento da obra (Gestão de obras). */
  const enviarParaObra = async () => {
    const obra = obras.find((o) => o.id === obraDestino);
    if (!tenantId || !orcamento || !obra) return;
    const itens = analiticoParaOrcamento(
      orcamento.linhas.filter((l) => l.estado === 'confirmado').map((l) => ({ id: l.item.id, descricao: l.item.descricao, disciplina: DISCIPLINA_LABEL[l.item.disciplina], unidade: l.item.unidade, quantidade: l.item.quantidade * (l.vinculo?.fator ?? 1), codigo: l.vinculo?.codigo ?? '', precoUnitario: l.precoUnitario })),
      obra.id, Math.max(0, bdi), `${orcamento.base.source} ${orcamento.base.uf} ${orcamento.base.reference}`,
    );
    if (!itens.length) { setMensagens([{ tipo: 'erro', texto: 'Não há linhas com composição confirmada para enviar.' }]); return; }
    try {
      const agora = new Date().toISOString();
      for (const { id, ...dados } of itens) await definirDoc(tenantId, `budgets/${id}`, { ...dados, deleted: false, createdAt: agora, createdBy: usuario?.uid ?? '', updatedAt: agora });
      setMensagens([{ tipo: 'info', texto: `${itens.length} item(ns) enviados ao orçamento da obra "${obra.name}". Em Gestão de obras → Orçamentos você pode gerar o cronograma.` }]);
    } catch { setMensagens([{ tipo: 'erro', texto: 'Não foi possível enviar ao orçamento da obra. Verifique sua permissão e a conexão.' }]); }
  };

  const sugeridas = orcamento?.linhas.filter((l) => l.estado === 'sugerido').length ?? 0;
  const grupos = React.useMemo(() => {
    const m = new Map<Disciplina, LinhaOrcamento[]>();
    for (const l of orcamento?.linhas ?? []) m.set(l.item.disciplina, [...(m.get(l.item.disciplina) ?? []), l]);
    return [...m];
  }, [orcamento]);

  return (
    <>
      <PageHeader titulo="BIM & Orçamento analítico" descricao="Importe modelos e projetos de qualquer software; os quantitativos são precificados por composições SINAPI, SICRO ou ORSE e recalculados a cada revisão.">
        <Link href="/contratos/" className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">Gerar proposta e contrato</Link>
      </PageHeader>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <Field label="Projeto" className="min-w-[200px] flex-1"><Select value={projeto?.id ?? ''} onChange={(e) => { setProjectId(e.target.value); setRecusadas(new Set()); }}>{projetos.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.nome}</option>)}</Select></Field>
          <Field label="Base de preços" className="min-w-[240px] flex-1">
            <Select value={baseId} disabled={catalogo.length === 0} onChange={(e) => setBaseId(e.target.value)}>
              {catalogo.map((b) => <option key={b.id} value={b.id}>{b.source} · {b.uf} · {b.reference.split('-').reverse().join('/')}{b.regime ? ` · ${b.regime}` : ''}</option>)}
            </Select>
          </Field>
          <Field label="BDI (%)" className="w-24"><Input type="number" min={0} step="0.5" className="tabular" value={bdi} onChange={(e) => setBdi(Number(e.target.value) || 0)} /></Field>
          {podeEditar && (
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-within:ring-2 focus-within:ring-ring">
              <FileUp className="h-4 w-4" />Importar arquivos
              <input type="file" multiple accept={EXTENSOES_IMPORTAVEIS.map((e) => `.${e}`).join(',')} className="sr-only"
                onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; void importar(fs.map((f) => ({ nome: f.name, texto: () => f.text() }))); }} />
            </label>
          )}
          {MODO_DEMO && <Button variant="outline" onClick={() => void importar(EXEMPLOS.map(([nome, t]) => ({ nome, texto: async () => t })))}>Carregar exemplos</Button>}
          <p className="w-full text-xs text-muted-foreground">
            Aceita IFC (Revit, Archicad, Tekla, TQS, Eberick, QiBuilder), DXF, LandXML (Civil 3D, TopoGRAPH, OpenRoads), EPANET e SWMM (.inp), pontos topográficos e planilhas CSV.
            {estadoBase.carregando && ' Carregando base de preços…'}
          </p>
          {estadoBase.erro && <p role="alert" className="w-full text-xs text-destructive">Base de preços: {estadoBase.erro} Os quantitativos continuam disponíveis; os preços voltam quando a base carregar.</p>}
          {mensagens.map((m) => <p key={m.texto} role={m.tipo === 'erro' ? 'alert' : 'status'} className={cn('w-full text-xs', m.tipo === 'erro' ? 'text-destructive' : 'text-muted-foreground')}>{m.tipo === 'erro' ? '✕ ' : '⚠ '}{m.texto}</p>)}
        </CardContent>
      </Card>

      {arquivos.length === 0 ? (
        <Card className="mt-4"><CardContent className="py-14 text-center text-sm text-muted-foreground">Nenhum arquivo importado neste projeto. Envie um modelo IFC, uma rede .inp, um LandXML ou uma planilha para começar.</CardContent></Card>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ['Preço de venda', orcamento ? brl(orcamento.precoVenda, 0) : '—', orcamento ? `custo direto ${brl(orcamento.custoDireto, 0)} + BDI ${pct(orcamento.bdiPercentual, 1)}` : 'aguardando base de preços'],
              ['Itens com preço confirmado', orcamento ? `${orcamento.linhas.length - orcamento.itensPendentes} de ${orcamento.linhas.length}` : `${itens.length} itens`, orcamento ? `${pct(orcamento.cobertura, 0)} do quantitativo` : ''],
              ['Sugestões a revisar', String(sugeridas), orcamento && sugeridas ? `${brl(orcamento.custoSugerido, 0)} fora do total até confirmar` : 'nenhuma pendente de revisão'],
              ['Arquivos', String(arquivos.length), `${itens.length} itens de quantitativo`],
            ].map(([rotulo, valor, detalhe]) => (
              <Card key={rotulo}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{rotulo}</p><p className="tabular mt-1 text-xl font-semibold tracking-tight">{valor}</p><p className="mt-0.5 text-xs text-muted-foreground">{detalhe}</p></CardContent></Card>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
                <div><CardTitle>Planilha orçamentária</CardTitle><CardDescription className="mt-1">Só vínculos confirmados entram no preço. Um vínculo confirmado vale para todos os projetos do escritório.</CardDescription></div>
                {podeEditar && obras.length > 0 && orcamento && orcamento.custoDireto > 0 && (
                  <span className="flex items-center gap-2">
                    <Select className="h-8 w-52 text-xs" aria-label="Obra de destino" value={obraDestino} onChange={(e) => setObraDestino(e.target.value)}><option value="">Enviar à obra…</option>{obras.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>
                    <Button size="sm" variant="outline" disabled={!obraDestino} onClick={() => void enviarParaObra()}>Enviar ao orçamento</Button>
                  </span>
                )}
                {podeEditar && sugeridas > 0 && <Button size="sm" variant="outline" onClick={() => void confirmarSugestoes()}><Sparkles className="h-3.5 w-3.5" />Confirmar {sugeridas} sugestões</Button>}
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead><tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-2 font-medium">Item</th><th className="px-2 py-2 text-right font-medium">Quantidade</th>
                    <th className="px-2 py-2 font-medium">Composição</th><th className="px-2 py-2 text-right font-medium">Preço unit.</th>
                    <th className="px-2 py-2 text-right font-medium">Total</th><th className="w-24 py-2"><span className="sr-only">Ações</span></th>
                  </tr></thead>
                  {grupos.map(([disciplina, linhas]) => (
                    <tbody key={disciplina} className="divide-y">
                      <tr><th colSpan={6} scope="colgroup" className="bg-muted/40 px-2 py-1.5 text-left text-xs font-semibold">
                        {DISCIPLINA_LABEL[disciplina]}
                        <span className="tabular float-right font-normal text-muted-foreground">{brl(orcamento?.porDisciplina.find((d) => d.disciplina === disciplina)?.total ?? 0, 0)}</span>
                      </th></tr>
                      {linhas.map((l) => (
                        <React.Fragment key={l.item.id}>
                          <tr className="align-top">
                            <td className="max-w-[280px] py-2 pr-2"><p className="leading-snug">{l.item.descricao}</p><p className="text-[11px] text-muted-foreground">{l.item.arquivo} · {l.item.grupo}</p></td>
                            <td className="tabular whitespace-nowrap px-2 py-2 text-right">{num(l.item.quantidade)} {l.item.unidade}</td>
                            <td className="max-w-[300px] px-2 py-2">
                              {l.composicao ? (
                                <><p className="text-xs leading-snug">{l.composicao.description.length > 110 ? `${l.composicao.description.slice(0, 110)}…` : l.composicao.description}</p>
                                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground"><span className="tabular">{l.composicao.code}</span>
                                    {l.estado === 'sugerido' ? <Badge variant="warning">Sugestão — revisar</Badge> : <Badge variant="success">Confirmado</Badge>}
                                    {l.unidadeDivergente && <Badge variant="destructive">unidade {l.composicao.unit.toLowerCase()} ≠ {l.item.unidade}</Badge>}
                                    {l.vinculo && l.vinculo.fator !== 1 && <span className="tabular">× {num(l.vinculo.fator, 4)}</span>}</p></>
                              ) : <span className="text-xs text-muted-foreground">Sem composição</span>}
                            </td>
                            <td className="tabular whitespace-nowrap px-2 py-2 text-right">{l.composicao ? brl(l.precoUnitario) : '—'}</td>
                            <td className={cn('tabular whitespace-nowrap px-2 py-2 text-right', l.estado === 'sugerido' && 'text-muted-foreground')}>{l.composicao ? brl(l.total) : '—'}</td>
                            <td className="whitespace-nowrap py-1.5 text-right">
                              {podeEditar && indice && (<>
                                {l.estado === 'sugerido' && l.vinculo && <Button size="icon" variant="ghost" aria-label={`Confirmar composição de ${l.item.descricao}`} onClick={() => void vincular(l, l.vinculo!.codigo, l.vinculo!.fator)}><Check className="h-4 w-4 text-success" /></Button>}
                                <Button size="icon" variant="ghost" aria-label={`Buscar composição para ${l.item.descricao}`} aria-expanded={aberto === l.item.id} onClick={() => setAberto(aberto === l.item.id ? null : l.item.id)}><Search className="h-4 w-4" /></Button>
                                {l.composicao && <Button size="icon" variant="ghost" aria-label={`Remover composição de ${l.item.descricao}`} onClick={() => void desvincular(l)}><X className="h-4 w-4" /></Button>}
                              </>)}
                            </td>
                          </tr>
                          {aberto === l.item.id && indice && <tr><td colSpan={6} className="pb-3"><PainelBusca linha={l} indice={indice} onFechar={() => setAberto(null)} onEscolher={(c, f) => void vincular(l, c, f)} /></td></tr>}
                        </React.Fragment>
                      ))}
                    </tbody>
                  ))}
                </table>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle>Arquivos importados</CardTitle></CardHeader>
                <CardContent><ul className="divide-y">
                  {arquivos.map((a) => (
                    <li key={a.id} className="flex items-start gap-2 py-2">
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{a.arquivo}</p><p className="text-[11px] text-muted-foreground">{FORMATO_LABEL[a.formato]} · {a.resumo}</p></div>
                      {podeEditar && <Button size="icon" variant="ghost" aria-label={`Remover ${a.arquivo}`} onClick={() => { if (tenantId && projeto && window.confirm(`Remover os quantitativos de ${a.arquivo}?`)) void removerDoc(tenantId, `projects/${projeto.id}/quantities/${a.id}`); }}><Trash2 className="h-4 w-4" /></Button>}
                    </li>
                  ))}
                </ul></CardContent>
              </Card>
              {orcamento && orcamento.abc.length > 0 && (
                <Card>
                  <CardHeader><CardTitle>Curva ABC</CardTitle><CardDescription>Itens que concentram o custo.</CardDescription></CardHeader>
                  <CardContent><ul className="space-y-2">
                    {orcamento.abc.slice(0, 8).map((i) => (
                      <li key={i.descricao} className="text-xs">
                        <div className="flex justify-between gap-2"><span className="truncate">{i.descricao}</span><span className="tabular shrink-0 text-muted-foreground">{pct(i.percentual)} · {i.classe}</span></div>
                        <div className="mt-1 h-1 rounded-full bg-secondary"><div className="h-full rounded-full" style={{ width: `${i.percentual * 100}%`, background: 'var(--series-1)' }} /></div>
                      </li>
                    ))}
                  </ul></CardContent>
                </Card>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
