'use client';
/**
 * Relatórios (menu 7 do ObraTop 3): os mesmos 10 relatórios, em Excel, CSV ou impressão/PDF,
 * e a Super Planilha para exportar e importar todos os cadastros de uma vez.
 */
import * as React from 'react';
import Link from 'next/link';
import { Download, FileSpreadsheet, FileUp, ShieldCheck } from 'lucide-react';
import { baixar, BotaoImprimir, csvDe, nomeArquivo, TabelaLinhas, XLSX_MIME } from '@/components/controle/comum';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/form';
import { useAuth } from '@/hooks/use-auth';
import { gravarEmLote } from '@/hooks/use-colecao';
import { useDados } from '@/hooks/use-dados';
import { auditar } from '@/lib/auditoria';
import { abasDeXlsx } from '@/lib/composicoes/importar-precos';
import { ESQUEMAS, type IdModulo } from '@/lib/obratop/esquemas';
import { podeGravarModulo, veTodasAsObras } from '@/lib/obratop/permissoes';
import { exportarTudo, gerarXlsx, linhasDoModulo, prepararImportacao, type ResultadoImportacao } from '@/lib/obratop/planilha';
import { budgetSale, incurredCost, measurementNet, schedulePerformance } from '@/lib/obratop/vendor/calc.mjs';
import { cn } from '@/lib/utils';

type Reg = { id: string; deleted?: unknown } & Record<string, unknown>;
const RELATORIOS: { id: string; titulo: string; descricao: string; modulos: IdModulo[] }[] = [
  { id: 'executive', titulo: 'Executivo da obra', descricao: 'Painel físico-financeiro consolidado', modulos: [] },
  { id: 'finance', titulo: 'Financeiro', descricao: 'Receitas, despesas, saldo e situação', modulos: ['finance'] },
  { id: 'measurements', titulo: 'Medições', descricao: 'Medições e situação de faturamento', modulos: ['measurements'] },
  { id: 'budgets', titulo: 'Orçamento', descricao: 'Itens, BDI e preço de venda', modulos: ['budgets'] },
  { id: 'activities', titulo: 'Cronograma', descricao: 'Atividades, responsáveis e atrasos', modulos: ['activities'] },
  { id: 'inventory', titulo: 'Compras e estoque', descricao: 'Pedidos, materiais, níveis e ressuprimento', modulos: ['orders', 'inventory'] },
  { id: 'resourcecurves', titulo: 'Curvas S e ABC', descricao: 'Materiais, pessoal, máquinas e equipamentos', modulos: [] },
  { id: 'quality', titulo: 'Qualidade e segurança', descricao: 'Pendências e planos de ação', modulos: ['quality', 'safety'] },
  { id: 'contracts', titulo: 'Contratos e documentos', descricao: 'Vigências, revisões e vencimentos', modulos: ['contracts', 'documents'] },
  { id: 'staff', titulo: 'Pessoal e equipamentos', descricao: 'Alocação, custos e manutenção', modulos: ['staff', 'equipment'] },
];
const novoId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
const n = (v: unknown) => Number(v) || 0;

export default function Relatorios() {
  const { tenantId, tenant, usuario, funcao, obraAtribuida } = useAuth();
  const d = useDados() as unknown as Record<string, Reg[]>;
  const obras = (d.works ?? []).filter((w) => !w.deleted);
  const [esc, setEsc] = React.useState('');
  const obraId = veTodasAsObras(funcao) ? esc : (obraAtribuida ?? '');
  const [rel, setRel] = React.useState('executive');
  const [imp, setImp] = React.useState<{ nome: string; resultados: ResultadoImportacao[]; ignoradas: string[] }>();
  const [msg, setMsg] = React.useState<{ tipo: 'ok' | 'erro'; texto: string }>();
  const [ocupado, setOcupado] = React.useState(false);
  const filtro = (r: Reg) => !obraId || r.workId === obraId || r.id === obraId;
  const hoje = new Date().toISOString().slice(0, 10);
  const atual = RELATORIOS.find((r) => r.id === rel)!;

  const executivo = React.useMemo(() => {
    const cab = ['Obra', 'Cliente', 'Situação', 'Valor contratado', 'Orçado (venda)', 'Medido', 'Recebido', 'Pago', 'Físico previsto (%)', 'Físico realizado (%)', 'IDP', 'IDC', 'Término'];
    const linhas: (string | number)[][] = [cab];
    for (const w of obras.filter((o) => !obraId || o.id === obraId)) {
      const de = (m: string) => (d[m] ?? []).filter((x) => !x.deleted && x.workId === w.id);
      const bud = de('budgets'), fin = de('finance'), orcado = bud.reduce((t, b) => t + budgetSale(b), 0);
      const p = schedulePerformance({ acts: de('activities'), budgets: bud, works: [w], budget: orcado, incurred: incurredCost(fin, hoje), day: hoje });
      linhas.push([String(w.name ?? ''), String(w.client ?? ''), String(w.status ?? ''), n(w.value), Math.round(orcado * 100) / 100, de('measurements').reduce((t, m) => t + measurementNet(m).gross, 0),
        fin.filter((f) => f.type === 'Receita' && f.status === 'Recebido').reduce((t, f) => t + n(f.value), 0), fin.filter((f) => f.type === 'Despesa' && f.status === 'Pago').reduce((t, f) => t + n(f.value), 0),
        Math.round(p.planned * 10) / 10, Math.round(p.actual * 10) / 10, Number.isFinite(p.spi) ? Math.round(p.spi * 100) / 100 : '', Number.isFinite(p.cpi) ? Math.round(p.cpi * 100) / 100 : '', String(w.end ?? '').split('-').reverse().join('/')]);
    }
    return linhas;
  }, [d, obras, obraId, hoje]);
  const tabelas = atual.id === 'executive' ? [{ nome: 'Executivo', linhas: executivo }] : atual.modulos.map((m) => ({ nome: ESQUEMAS[m].title, linhas: linhasDoModulo(m, d, funcao, filtro) }));
  const sufixo = `${obraId ? nomeArquivo(String(obras.find((o) => o.id === obraId)?.name ?? '')) : 'todas'}_${hoje}`;
  const exportarExcel = () => baixar(gerarXlsx(tabelas.map((t) => ({ nome: t.nome, linhas: t.linhas }))) as BlobPart, `ObraTop_${nomeArquivo(atual.titulo)}_${sufixo}.xlsx`, XLSX_MIME);
  const exportarCsv = () => baixar(tabelas.map((t) => (tabelas.length > 1 ? csvDe([[t.nome], ...t.linhas]) : csvDe(t.linhas))).join('\r\n'), `ObraTop_${nomeArquivo(atual.titulo)}_${sufixo}.csv`, 'text/csv;charset=utf-8');

  const abrirPlanilha = async (f: File) => {
    setImp(undefined); setMsg(undefined);
    try {
      const abas = /\.xlsx$/i.test(f.name) ? abasDeXlsx(new Uint8Array(await f.arrayBuffer())) : (() => { throw new Error('Use a planilha em Excel (.xlsx).'); })();
      const r = prepararImportacao(abas, d, { funcao, obraAtribuida, novoId });
      if (!r.resultados.length) { setMsg({ tipo: 'erro', texto: 'Nenhuma aba reconhecida. Use as abas da Super Planilha (OBRAS, ORCAMENTO, CRONOGRAMA, FINANCEIRO…).' }); return; }
      setImp({ nome: f.name, ...r });
    } catch (e) { setMsg({ tipo: 'erro', texto: e instanceof Error ? e.message : 'Não foi possível ler a planilha.' }); }
  };
  const importar = async () => {
    if (!tenantId || !imp) return;
    const agora = new Date().toISOString(), quem = usuario?.uid ?? '', meta = { createdAt: agora, createdBy: quem, updatedAt: agora, updatedBy: quem, deleted: false, imported: true, importSource: '4.1' };
    const gravar = (mods: IdModulo[]) => imp.resultados.filter((r) => !r.semPermissao && mods.includes(r.modulo)).flatMap((r) => r.novos.map((x) => ({ caminho: `${r.modulo}/${x.id}`, dados: { ...x.dados, ...meta } })));
    setOcupado(true);
    try {
      // Obras e fornecedores primeiro: os demais registros apontam para eles.
      await gravarEmLote(tenantId, gravar(['works', 'suppliers']));
      await gravarEmLote(tenantId, gravar(imp.resultados.map((r) => r.modulo).filter((m) => m !== 'works' && m !== 'suppliers')));
      const total = imp.resultados.filter((r) => !r.semPermissao).reduce((t, r) => t + r.novos.length, 0);
      void auditar(tenantId, usuario, 'import-create', 'organizations', tenantId, undefined, { arquivo: imp.nome, registros: total });
      setMsg({ tipo: 'ok', texto: `Importação concluída: ${total} registro(s) incluído(s).` }); setImp(undefined);
    } catch { setMsg({ tipo: 'erro', texto: 'A importação parou no meio (conexão ou permissão). O que entrou fica; importe de novo — os já incluídos são reconhecidos e ignorados.' }); }
    setOcupado(false);
  };
  const totalNovos = imp?.resultados.filter((r) => !r.semPermissao).reduce((t, r) => t + r.novos.length, 0) ?? 0;
  const importa = ['owner', 'manager', 'finance', 'project_user'].includes(funcao);

  return (
    <>
      <PageHeader titulo="Relatórios" descricao="Os relatórios do ObraTop em Excel, CSV ou PDF, e a Super Planilha para importar ou exportar todos os cadastros.">
        {veTodasAsObras(funcao) && <Select aria-label="Obra" className="w-56" value={esc} onChange={(e) => setEsc(e.target.value)}><option value="">Todas as obras</option>{obras.map((w) => <option key={w.id} value={w.id}>{String(w.name)}</option>)}</Select>}
      </PageHeader>
      {msg && <p role={msg.tipo === 'erro' ? 'alert' : 'status'} className={cn('mb-4 rounded-md border p-3 text-sm', msg.tipo === 'erro' ? 'border-destructive/40 bg-destructive/5 text-destructive' : 'border-success/40 bg-success/5')}>{msg.texto}</p>}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5 print:hidden">
        {RELATORIOS.map((r) => r.id === 'resourcecurves'
          ? <Link key={r.id} href="/curvas/" className="tile p-3 text-left"><span className="block text-sm font-semibold">{r.titulo}</span><span className="block text-xs text-muted-foreground">{r.descricao}</span></Link>
          : <button key={r.id} type="button" onClick={() => setRel(r.id)} aria-pressed={rel === r.id} className={cn('tile p-3 text-left', rel === r.id && 'border-primary ring-1 ring-primary')}><span className="block text-sm font-semibold">{r.titulo}</span><span className="block text-xs text-muted-foreground">{r.descricao}</span></button>)}
      </div>
      <Card className="area-impressao">
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div><CardTitle>{atual.titulo}</CardTitle><CardDescription className="mt-1">{tenant?.nomeFantasia} · {obraId ? String(obras.find((o) => o.id === obraId)?.name ?? '') : 'Todas as obras'} · emitido em {new Date().toLocaleDateString('pt-BR')}</CardDescription></div>
          <div className="flex flex-wrap gap-2 print:hidden"><Button variant="outline" onClick={exportarExcel}><FileSpreadsheet className="h-4 w-4" />Excel</Button><Button variant="outline" onClick={exportarCsv}><Download className="h-4 w-4" />CSV</Button><BotaoImprimir /></div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">{tabelas.map((t) => <section key={t.nome}>{tabelas.length > 1 && <h3 className="mb-2 text-sm font-semibold">{t.nome}</h3>}<TabelaLinhas linhas={t.linhas} dinheiro={atual.id === 'executive' ? new Set([3, 4, 5, 6, 7]) : undefined} /></section>)}</CardContent>
      </Card>

      <Card className="mt-4 print:hidden">
        <CardHeader><CardTitle>Super Planilha</CardTitle><CardDescription>Uma planilha Excel com uma aba por cadastro (OBRAS, ORCAMENTO, CRONOGRAMA, FINANCEIRO…), igual à do ObraTop 3.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <a href="/ObraTop_Super_Planilha_Base.xlsx" download className="inline-flex h-9 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium hover:bg-accent"><Download className="h-4 w-4" />Baixar planilha modelo</a>
            <Button variant="outline" onClick={() => baixar(exportarTudo(d, funcao, obraId ? filtro : undefined) as BlobPart, `ObraTop_Super_Planilha_${sufixo}.xlsx`, XLSX_MIME)}><FileSpreadsheet className="h-4 w-4" />Exportar todos os dados</Button>
            {importa && <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-within:ring-2 focus-within:ring-ring"><FileUp className="h-4 w-4" />Importar planilha
              <input type="file" accept=".xlsx" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void abrirPlanilha(f); }} /></label>}
          </div>
          <p className="text-xs text-muted-foreground">Na importação entram só registros novos: obras, fornecedores e demais referências são reconhecidos pelo nome; o que já existe é ignorado. Faça um backup antes de importações grandes (Administrativo → Backup).</p>
          {imp && (
            <div className="rounded-xl border p-4">
              <p className="mb-2 flex items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4 text-success" />{imp.nome} — conferência antes de gravar</p>
              <table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2 font-medium">Aba</th><th className="px-2 py-2 text-right font-medium">Novos</th><th className="px-2 py-2 text-right font-medium">Já existem</th><th className="px-2 py-2 font-medium">Problemas</th></tr></thead>
                <tbody className="divide-y">{imp.resultados.map((r) => (
                  <tr key={r.modulo} className="align-top"><td className="py-1.5">{r.aba} <span className="text-xs text-muted-foreground">({ESQUEMAS[r.modulo].title})</span></td><td className="tabular px-2 py-1.5 text-right">{r.semPermissao ? '—' : r.novos.length}</td><td className="tabular px-2 py-1.5 text-right">{r.duplicados}</td>
                    <td className="px-2 py-1.5 text-xs text-muted-foreground">{r.semPermissao ? 'Sua função não grava neste cadastro.' : r.erros.slice(0, 3).join(' · ')}{r.erros.length > 3 ? ` · +${r.erros.length - 3}` : ''}</td></tr>
                ))}</tbody></table>
              {imp.ignoradas.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Abas ignoradas: {imp.ignoradas.join(', ')}.</p>}
              <div className="mt-3 flex gap-2"><Button disabled={ocupado || totalNovos === 0 || !podeGravarModulo(funcao, 'finance', true, obraAtribuida) && funcao !== 'owner'} onClick={() => void importar()}>{ocupado ? 'Importando…' : totalNovos ? `Incluir ${totalNovos} registro(s)` : 'Nada novo para incluir'}</Button><Button variant="ghost" onClick={() => setImp(undefined)}>Cancelar</Button></div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
