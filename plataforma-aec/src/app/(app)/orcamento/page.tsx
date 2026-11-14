'use client';
import * as React from 'react';
import Link from 'next/link';
import { Plus, Trash2 } from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { CurvaSChart } from '@/components/budget/curva-s-chart';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, Field, Input, Segmented, Select } from '@/components/ui/form';
import { useAuth } from '@/hooks/use-auth';
import { adicionarDoc, useColecao } from '@/hooks/use-colecao';
import { useWorkspace } from '@/hooks/use-workspace';
import { pode } from '@/lib/rbac';
import type { Project } from '@/lib/types';
import {
  AJUSTE_ALTO_LUXO_PADRAO, BDI_PADRAO, calcularBdi, calcularOrcamento, COEFICIENTES_NBR12721, PADRAO_LABEL, simularCenarios, tabelaMaisRecente,
  CUB_PROJECT_CODES, type AreaInput, type BdiParams, type CubProjectCode, type CubTable, type ItemNaoIncluso, type PadraoAcabamento, type TipoArea, type TipoEdificacao,
} from '@/lib/cub/engine';
import { gerarCronogramaFisicoFinanceiro, gerarCurvaAbc } from '@/lib/cub/schedule';
import { DEMO_CUB } from '@/lib/demo-data';
import { db, MODO_DEMO } from '@/lib/firebase/client';
import { brl, num, pct } from '@/lib/format';
import { cn } from '@/lib/utils';

const PADROES: PadraoAcabamento[] = ['popular', 'medio', 'luxo', 'alto_luxo'];
const BDI_CAMPOS: { chave: keyof BdiParams; label: string }[] = [
  { chave: 'administracaoCentral', label: 'Administração central' }, { chave: 'seguroGarantia', label: 'Seguro e garantia' },
  { chave: 'risco', label: 'Risco' }, { chave: 'despesasFinanceiras', label: 'Despesas financeiras' },
  { chave: 'lucro', label: 'Lucro' }, { chave: 'tributos', label: 'Tributos' },
];
const AREAS_INICIAIS: AreaInput[] = [
  { descricao: 'Pavimentos (área privativa)', tipo: 'privativa_padrao', areaRealM2: 320 },
  { descricao: 'Garagem', tipo: 'garagem_subsolo', areaRealM2: 60 },
  { descricao: 'Varandas', tipo: 'varanda', areaRealM2: 40 },
];
const numero = (s: string) => { const v = Number(s.replace(',', '.')); return Number.isFinite(v) ? v : 0; };

function useTabelasCub(): { tabelas: CubTable[]; erro?: string } {
  const [estado, setEstado] = React.useState<{ tabelas: CubTable[]; erro?: string }>({ tabelas: MODO_DEMO ? DEMO_CUB : [] });
  React.useEffect(() => {
    if (MODO_DEMO) return;
    return onSnapshot(collection(db(), 'cubTables'), (s) => setEstado({ tabelas: s.docs.map((d) => d.data() as CubTable) }), (e) => setEstado({ tabelas: [], erro: e.message }));
  }, []);
  return estado;
}

export default function Orcamento() {
  const { tabelas, erro: erroCub } = useTabelasCub();
  const { setOrcamento } = useWorkspace();
  const { tenantId, role, usuario } = useAuth();
  const { dados: projetos } = useColecao<Project>('projects');
  const [projectId, setProjectId] = React.useState('');
  const projeto = projetos.find((p) => p.id === projectId) ?? projetos[0];
  const [salvo, setSalvo] = React.useState<'' | 'salvando' | 'ok' | 'erro'>('');
  const [uf, setUf] = React.useState('BA');
  const [padrao, setPadrao] = React.useState<PadraoAcabamento>('medio');
  const [tipo, setTipo] = React.useState<TipoEdificacao>('unifamiliar');
  const [areas, setAreas] = React.useState<AreaInput[]>(AREAS_INICIAIS);
  const [bdi, setBdi] = React.useState<BdiParams>(BDI_PADRAO);
  const [fator, setFator] = React.useState(AJUSTE_ALTO_LUXO_PADRAO.fatorMultiplicador);
  const [adicionais, setAdicionais] = React.useState(AJUSTE_ALTO_LUXO_PADRAO.adicionaisPorM2);
  const [extras, setExtras] = React.useState<ItemNaoIncluso[]>([{ descricao: 'Fundações especiais', tipo: 'percentual', valor: 0.04 }]);
  const [prazo, setPrazo] = React.useState(14);
  // '' = projeto-padrão derivado de padrão + tipo; senão, um código específico (R16-N, CSL-8-N, GI…).
  const [projetoCub, setProjetoCub] = React.useState<CubProjectCode | ''>('');

  // Áreas vindas do QTO do CAD (botão "Usar no orçamento" da tela de CAD).
  React.useEffect(() => {
    try {
      const qto = sessionStorage.getItem('aec.areasQto');
      if (qto) { setAreas(JSON.parse(qto) as AreaInput[]); sessionStorage.removeItem('aec.areasQto'); }
    } catch { /* sem armazenamento */ }
  }, []);

  const ufs = [...new Set(tabelas.map((t) => t.uf))].sort();
  const tabela = tabelaMaisRecente(tabelas, uf) ?? tabelaMaisRecente(tabelas, ufs[0] ?? '');

  const calculo = React.useMemo(() => {
    if (!tabela) return { ok: false, erro: 'Nenhuma tabela CUB disponível. Importe a planilha do Sinduscon (scripts/import-cub.ps1).' } as const;
    try {
      const base = { tabela, tipoEdificacao: tipo, areas: areas.filter((a) => a.areaRealM2 > 0), bdi, itensNaoInclusos: extras, ajusteAltoLuxo: { fatorMultiplicador: fator, adicionaisPorM2: adicionais } };
      const resultado = calcularOrcamento({ ...base, padrao, projetoCub: projetoCub || undefined });
      const { cenarios, indisponiveis } = simularCenarios(base, PADROES);
      const meses = Math.max(1, Math.min(120, Math.trunc(prazo) || 1));
      const cronograma = gerarCronogramaFisicoFinanceiro(resultado.precoVenda, meses);
      return { ok: true, resultado, cenarios, indisponiveis, cronograma, abc: gerarCurvaAbc(cronograma.linhas.map((l) => ({ descricao: l.etapa, valor: l.valor }))), meses } as const;
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : 'Erro no cálculo.' } as const;
    }
  }, [tabela, tipo, areas, bdi, extras, fator, adicionais, padrao, prazo, projetoCub]);

  React.useEffect(() => {
    if (calculo.ok) setOrcamento({ resultado: calculo.resultado, cenarios: calculo.cenarios, prazoObraMeses: calculo.meses });
  }, [calculo, setOrcamento]);

  const salvar = async () => {
    if (!calculo.ok || !tenantId || !projeto) return;
    setSalvo('salvando');
    try {
      const r = calculo.resultado;
      await adicionarDoc(tenantId, `projects/${projeto.id}/budgets`, {
        titulo: `CUB ${r.uf} ${r.competencia} — ${PADRAO_LABEL[r.padrao]}`, tipo: 'cub', status: 'rascunho',
        total: r.precoVenda, resultado: JSON.parse(JSON.stringify(r)) as Record<string, unknown>,
        entradas: { uf, padrao, tipoEdificacao: tipo, projetoCub: projetoCub || null, areas: areas.map((a) => ({ ...a, coeficiente: a.coeficiente ?? null })), bdi, itensNaoInclusos: extras, prazoObraMeses: calculo.meses },
        criadoPor: usuario?.uid ?? '', criadoEm: new Date().toISOString(),
      });
      setSalvo('ok');
    } catch { setSalvo('erro'); }
  };
  const editarArea = (i: number, patch: Partial<AreaInput>) => setAreas((l) => l.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  let bdiPct = 0;
  try { bdiPct = calcularBdi(bdi); } catch { /* exibido no erro do cálculo */ }

  return (
    <>
      <PageHeader titulo="Orçamento paramétrico — CUB" descricao="Área equivalente (NBR 12721) × CUB estadual, com BDI, cenários e cronograma físico-financeiro.">
        {pode(role, 'orcamento.editar') && projetos.length > 0 && (<>
          <Select className="w-56" aria-label="Projeto do orçamento" value={projeto?.id ?? ''} onChange={(e) => setProjectId(e.target.value)}>{projetos.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.nome}</option>)}</Select>
          <Button variant="outline" disabled={!calculo.ok || salvo === 'salvando'} onClick={() => void salvar()}>{salvo === 'salvando' ? 'Salvando…' : 'Salvar no projeto'}</Button>
        </>)}
        <Link href="/contratos/" className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">Gerar proposta e contrato</Link>
      </PageHeader>
      {salvo === 'ok' && <p role="status" className="mb-4 rounded-md border border-success/40 bg-success/5 p-3 text-sm">Orçamento salvo como rascunho no projeto {projeto?.codigo}.</p>}
      {salvo === 'erro' && <p role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">Não foi possível salvar o orçamento. Seus dados continuam nesta tela — tente novamente.</p>}
      {erroCub && <p role="alert" className="mb-4 text-sm text-destructive">Falha ao carregar as tabelas CUB: {erroCub}</p>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Referência</CardTitle>{tabela && <CardDescription>{tabela.fonte} · competência {tabela.competencia.split('-').reverse().join('/')}{tabela.desonerado ? ' · desonerado' : ''}</CardDescription>}</CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <Field label="Estado (UF)" className="w-28"><Select value={tabela?.uf ?? uf} onChange={(e) => setUf(e.target.value)}>{ufs.map((u) => <option key={u}>{u}</option>)}</Select></Field>
                <Field label="Tipo de edificação" className="w-48">
                  <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoEdificacao)}><option value="unifamiliar">Unifamiliar (R1)</option><option value="multifamiliar">Multifamiliar (PP-4 / R8)</option></Select>
                </Field>
                <Field label="Projeto-padrão CUB" className="w-56">
                  <Select value={projetoCub} onChange={(e) => setProjetoCub(e.target.value as CubProjectCode | '')}>
                    <option value="">Automático (pelo padrão)</option>
                    {CUB_PROJECT_CODES.filter((c) => tabela?.valores[c]).map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </Field>
                <Field label="Prazo de obra (meses)" className="w-40"><Input type="number" min={1} max={120} value={prazo} onChange={(e) => setPrazo(numero(e.target.value))} /></Field>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Padrão de acabamento</p>
                <Segmented value={padrao} onChange={setPadrao} options={PADROES.map((p) => ({ value: p, label: PADRAO_LABEL[p] }))} />
                {projetoCub && <p className="mt-1.5 text-xs text-muted-foreground">Projeto-padrão fixado em {projetoCub} (ex.: R16 para torres, CSL para salas e lojas, GI para galpão). O simulador de cenários abaixo continua comparando os padrões residenciais.</p>}
              </div>
              {padrao === 'alto_luxo' && (
                <div className="space-y-2 rounded-md border bg-muted/40 p-3">
                  <p className="text-xs font-medium">Ajuste paramétrico — Alto Luxo</p>
                  <Field label="Fator sobre o CUB do padrão alto" className="w-56"><Input type="number" step="0.05" min={1} value={fator} onChange={(e) => setFator(numero(e.target.value))} /></Field>
                  {adicionais.map((ad, i) => (
                    <div key={i} className="flex items-end gap-2">
                      <Field label={i === 0 ? 'Adicional' : ''} className="flex-1"><Input value={ad.descricao} aria-label="Descrição do adicional" onChange={(e) => setAdicionais((l) => l.map((x, j) => (j === i ? { ...x, descricao: e.target.value } : x)))} /></Field>
                      <Field label={i === 0 ? 'R$/m²' : ''} className="w-28"><Input type="number" min={0} value={ad.valorM2} aria-label="Valor por m²" onChange={(e) => setAdicionais((l) => l.map((x, j) => (j === i ? { ...x, valorM2: numero(e.target.value) } : x)))} /></Field>
                      <Button variant="ghost" size="icon" aria-label="Remover adicional" onClick={() => setAdicionais((l) => l.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setAdicionais((l) => [...l, { descricao: 'Novo adicional', valorM2: 0 }])}><Plus className="h-3.5 w-3.5" />Adicional por m²</Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Quadro de áreas</CardTitle><CardDescription>Coeficientes de área equivalente da NBR 12721 — ajuste dentro da faixa da norma.</CardDescription></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead><tr className="text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-2 font-medium">Descrição</th><th className="pb-2 pr-2 font-medium">Tipo (NBR 12721)</th>
                    <th className="pb-2 pr-2 text-right font-medium">Área real (m²)</th><th className="pb-2 pr-2 text-right font-medium">Coef.</th>
                    <th className="pb-2 pr-2 text-right font-medium">Equivalente</th><th><span className="sr-only">Ações</span></th>
                  </tr></thead>
                  <tbody>
                    {areas.map((a, i) => {
                      const ref = COEFICIENTES_NBR12721[a.tipo];
                      const coef = a.coeficiente ?? ref.padrao;
                      const fora = coef < ref.min - 1e-9 || coef > ref.max + 1e-9;
                      return (
                        <tr key={i}>
                          <td className="min-w-[180px] py-1 pr-2"><Input value={a.descricao} aria-label="Descrição" onChange={(e) => editarArea(i, { descricao: e.target.value })} /></td>
                          <td className="min-w-[200px] py-1 pr-2"><Select value={a.tipo} aria-label="Tipo de área" onChange={(e) => editarArea(i, { tipo: e.target.value as TipoArea, coeficiente: undefined })}>
                            {(Object.keys(COEFICIENTES_NBR12721) as TipoArea[]).map((t) => <option key={t} value={t}>{COEFICIENTES_NBR12721[t].label}</option>)}
                          </Select></td>
                          <td className="w-28 py-1 pr-2"><Input type="number" min={0} className="tabular text-right" aria-label="Área real" value={a.areaRealM2} onChange={(e) => editarArea(i, { areaRealM2: Math.max(0, numero(e.target.value)) })} /></td>
                          <td className="w-24 py-1 pr-2">
                            <Input type="number" step="0.05" min={0} className={cn('tabular text-right', fora && 'border-warning text-warning')} aria-label={`Coeficiente (faixa ${num(ref.min)} a ${num(ref.max)})`} title={`Faixa da norma: ${num(ref.min)} – ${num(ref.max)}`}
                              value={coef} onChange={(e) => editarArea(i, { coeficiente: Math.max(0, numero(e.target.value)) })} />
                          </td>
                          <td className="tabular w-24 py-1 pr-2 text-right">{num(a.areaRealM2 * coef)}</td>
                          <td className="w-9 py-1"><Button variant="ghost" size="icon" aria-label={`Remover ${a.descricao}`} onClick={() => setAreas((l) => l.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => setAreas((l) => [...l, { descricao: 'Novo ambiente', tipo: 'privativa_padrao', areaRealM2: 0 }])}><Plus className="h-3.5 w-3.5" />Adicionar área</Button>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>BDI <span className="tabular ml-1 font-normal text-muted-foreground">{pct(bdiPct, 2)}</span></CardTitle><CardDescription>Fórmula do Acórdão TCU 2622/2013.</CardDescription></CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                {BDI_CAMPOS.map(({ chave, label }) => (
                  <Field key={chave} label={`${label} (%)`}><Input type="number" step="0.1" min={0} className="tabular" value={+(bdi[chave] * 100).toFixed(4)} onChange={(e) => setBdi((b) => ({ ...b, [chave]: Math.max(0, numero(e.target.value)) / 100 }))} /></Field>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Itens não inclusos no CUB</CardTitle><CardDescription>Fundações especiais, elevadores, climatização, projetos etc.</CardDescription></CardHeader>
              <CardContent className="space-y-2">
                {extras.map((x, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <Input className="basis-full" value={x.descricao} aria-label="Descrição do item" onChange={(e) => setExtras((l) => l.map((y, j) => (j === i ? { ...y, descricao: e.target.value } : y)))} />
                    <Select className="w-20" value={x.tipo} aria-label="Tipo de valor" onChange={(e) => setExtras((l) => l.map((y, j) => (j === i ? { ...y, tipo: e.target.value as ItemNaoIncluso['tipo'], valor: 0 } : y)))}><option value="percentual">%</option><option value="fixo">R$</option></Select>
                    <Input type="number" min={0} className="tabular min-w-0 flex-1 text-right" aria-label="Valor" value={x.tipo === 'percentual' ? +(x.valor * 100).toFixed(4) : x.valor}
                      onChange={(e) => setExtras((l) => l.map((y, j) => (j === i ? { ...y, valor: Math.max(0, numero(e.target.value)) / (y.tipo === 'percentual' ? 100 : 1) } : y)))} />
                    <Button variant="ghost" size="icon" aria-label={`Remover ${x.descricao}`} onClick={() => setExtras((l) => l.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setExtras((l) => [...l, { descricao: 'Novo item', tipo: 'fixo', valor: 0 }])}><Plus className="h-3.5 w-3.5" />Adicionar item</Button>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="space-y-4">
          {!calculo.ok ? (
            <Card><CardContent className="p-5"><p role="alert" className="text-sm text-destructive">{calculo.erro}</p></CardContent></Card>
          ) : (
            <>
              <Card>
                <CardHeader><CardDescription>Preço de venda estimado · {PADRAO_LABEL[calculo.resultado.padrao]} · {calculo.resultado.projetoCub}</CardDescription>
                  <p className="tabular text-3xl font-semibold tracking-tight">{brl(calculo.resultado.precoVenda)}</p>
                  <CardDescription className="tabular">{brl(calculo.resultado.precoPorM2Real)}/m² de área real · {num(calculo.resultado.areaEquivalenteTotalM2)} m² equivalentes</CardDescription>
                </CardHeader>
                <CardContent>
                  {calculo.resultado.avisos.map((a) => <p key={a} className="mb-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">⚠ {a}</p>)}
                  <table className="w-full text-sm">
                    <tbody className="divide-y">
                      {calculo.resultado.memoria.filter((m) => !m.descricao.startsWith('Área equivalente')).map((m) => (
                        <tr key={m.descricao}><td className="py-1.5 pr-2">{m.descricao}<span className="block text-[11px] text-muted-foreground">{m.formula}</span></td><td className="tabular whitespace-nowrap py-1.5 text-right align-top">{brl(m.valor)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Simulador de cenários</CardTitle><CardDescription>Mesmo quadro de áreas em cada padrão de acabamento.</CardDescription></CardHeader>
                <CardContent className="grid grid-cols-2 gap-2">
                  {calculo.cenarios.map(({ resultado: r, deltaPercentual }, i) => (
                    <button key={r.padrao} type="button" onClick={() => setPadrao(r.padrao)} aria-pressed={r.padrao === padrao}
                      className={cn('rounded-md border p-3 text-left transition-colors hover:bg-accent/50', r.padrao === padrao && 'border-primary bg-primary/5')}>
                      <p className="flex items-center justify-between text-xs font-medium">{PADRAO_LABEL[r.padrao]}{i > 0 && <Badge variant="outline" className="tabular">+{pct(deltaPercentual, 0)}</Badge>}</p>
                      <p className="tabular mt-1 text-base font-semibold">{brl(r.precoVenda, 0)}</p>
                      <p className="tabular text-[11px] text-muted-foreground">{r.projetoCub} · {brl(r.cubAjustadoM2)}/m²</p>
                    </button>
                  ))}
                  {calculo.indisponiveis.length > 0 && <p className="col-span-2 text-xs text-muted-foreground">Sem CUB publicado nesta tabela para: {calculo.indisponiveis.map((p) => PADRAO_LABEL[p]).join(', ')}.</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Curva S — cronograma físico-financeiro</CardTitle><CardDescription>{calculo.meses} meses · distribuição por etapas de obra.</CardDescription></CardHeader>
                <CardContent>
                  <CurvaSChart parcelas={calculo.cronograma.totais} />
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Tabela mensal e Curva ABC por etapa</summary>
                    <div className="mt-2 grid gap-4 md:grid-cols-2">
                      <table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground"><th className="py-1 font-medium">Mês</th><th className="py-1 text-right font-medium">Valor</th><th className="py-1 text-right font-medium">Acum.</th></tr></thead>
                        <tbody className="tabular divide-y">{calculo.cronograma.totais.map((p) => <tr key={p.mes}><td className="py-1">{p.mes}</td><td className="py-1 text-right">{brl(p.valor, 0)}</td><td className="py-1 text-right">{pct(p.percentualAcumulado)}</td></tr>)}</tbody></table>
                      <table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground"><th className="py-1 font-medium">Etapa</th><th className="py-1 text-right font-medium">%</th><th className="py-1 text-right font-medium">Classe</th></tr></thead>
                        <tbody className="divide-y">{calculo.abc.map((i) => <tr key={i.descricao}><td className="py-1">{i.descricao}</td><td className="tabular py-1 text-right">{pct(i.percentual)}</td><td className="py-1 text-right font-medium">{i.classe}</td></tr>)}</tbody></table>
                    </div>
                  </details>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}
