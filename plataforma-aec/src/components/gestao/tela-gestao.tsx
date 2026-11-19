'use client';
/**
 * Gestão de obras — os módulos do ObraTop (obras, cronograma, medições, financeiro, compras,
 * estoque, contratos, qualidade, segurança…) em uma única tela guiada por esquema.
 * Os cálculos (medição líquida, saldo de contrato, avanço ponderado, valor agregado, fluxo de
 * caixa, caminho crítico, MS Project) são os módulos originais do ObraTop, sem alteração.
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CalendarRange, CheckCheck, Sparkles, Download, FileText, FileUp, Flag, PackageCheck, Paperclip, Pencil, Plus, ReceiptText, ShoppingCart, Trash2, X } from 'lucide-react';
import { AssistenteObra } from '@/components/gestao/assistente-obra';
import { EditorFotos, RelatorioFotografico, type DiaFotos } from '@/components/fotos/fotos';
import { GanttObra, type AtividadeGantt } from '@/components/gestao/gantt-obra';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, Field, Input, Segmented, Select, Textarea } from '@/components/ui/form';
import { useAuth } from '@/hooks/use-auth';
import { atualizarDoc, atualizarEmLote, definirDoc, useColecao } from '@/hooks/use-colecao';
import { brl, dataBr, num, pct } from '@/lib/format';
import { apagarArquivos, enviarFotos, fotosDe, type FotoDiario, type FotoNova } from '@/lib/fotos';
import { auditar } from '@/lib/auditoria';
import { podeCriarObra, podeExcluir, podeGravarModulo, veDadosDePessoal, veTodasAsObras } from '@/lib/obratop/permissoes';
import { avancoDoDiario, lancamentoDe, pedidoDeReposicao, situacaoEstoque } from '@/lib/obratop/fluxos';
import { COLECAO_DA_REFERENCIA, ESQUEMAS, GRUPOS_MODULOS, MODULOS, rotuloRegistro, type CampoEsquema, type EsquemaModulo, type IdModulo } from '@/lib/obratop/esquemas';
import { activityWeights, budgetSale, cashProjection, contractBalance, incurredCost, measurementNet, schedulePerformance } from '@/lib/obratop/vendor/calc.mjs';
import { cpm, mspdiExport, parseMspdi, toActivities } from '@/lib/obratop/vendor/msproject.mjs';
import { cronogramaDoOrcamento } from '@/lib/obratop/integracao';
import { MODO_DEMO, storage } from '@/lib/firebase/client';
import { getDownloadURL, ref as refArquivo, uploadBytes } from 'firebase/storage';
import { cn } from '@/lib/utils';

type Reg = { id: string; deleted?: boolean } & Record<string, unknown>;
const hoje = () => new Date().toISOString().slice(0, 10);
const novoId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const CAMPOS_MOEDA = /value|salary|cost|addendum|deduction/i;
/** A exclusão no ObraTop é lógica: registros com `deleted` ficam no banco, fora das telas. */
const vivos = (l: Reg[]) => l.filter((r) => !r.deleted);

export function TelaGestao({ modulo }: { modulo: IdModulo }) {
  const router = useRouter();
  const { tenantId, tenant, usuario, obraAtribuida, funcao } = useAuth();
  // Quem vê todas as obras escolhe a obra no filtro; o engenheiro da obra fica na dele.
  const veTodas = veTodasAsObras(funcao), apaga = podeExcluir(funcao), planeja = podeCriarObra(funcao);
  const setModulo = (m: IdModulo) => router.push(`/gestao/${m}/`);
  // Salário e dados pessoais da equipe ficam fora da tela de quem não é Administrador ou Financeiro.
  const esquemaBruto: EsquemaModulo = ESQUEMAS[modulo];
  const esquema: EsquemaModulo = React.useMemo(() => (modulo === 'staff' && !veDadosDePessoal(funcao) ? { ...esquemaBruto, fields: esquemaBruto.fields.filter((f) => !['salary', 'cpf', 'birthDate'].includes(f[0])) } : esquemaBruto), [modulo, funcao, esquemaBruto]);
  const gravavel = podeGravarModulo(funcao, modulo, esquema.fields.some((f) => f[0] === 'workId'), obraAtribuida);
  const gravaFinanceiro = podeGravarModulo(funcao, 'finance', true, obraAtribuida), gravaEstoque = podeGravarModulo(funcao, 'inventory', true, obraAtribuida), gravaPedidos = podeGravarModulo(funcao, 'orders', true, obraAtribuida), gravaCronograma = podeGravarModulo(funcao, 'activities', true, obraAtribuida);

  // Coleções: a do módulo, obras (filtro e rótulos) e as apontadas por campos de referência.
  const { dados: brutos, carregando, erro } = useColecao<Reg>(modulo);
  const { dados: obrasBrutas } = useColecao<Reg>('works');
  const { dados: atividades } = useColecao<Reg>('activities');
  const { dados: orcamentos } = useColecao<Reg>('budgets');
  const { dados: financeiro } = useColecao<Reg>('finance');
  const { dados: medicoes } = useColecao<Reg>('measurements');
  const { dados: contratos } = useColecao<Reg>('contracts');
  const { dados: fornecedores } = useColecao<Reg>(modulo === 'orders' ? 'suppliers' : null);
  const { dados: estoque } = useColecao<Reg>(modulo === 'orders' ? 'inventory' : null);
  const { dados: pedidos } = useColecao<Reg>(modulo === 'finance' ? 'orders' : null);
  const obras = React.useMemo(() => vivos(obrasBrutas), [obrasBrutas]);
  const referencias: Partial<Record<IdModulo, Reg[]>> = { works: obras, activities: vivos(atividades), budgets: vivos(orcamentos), measurements: vivos(medicoes), contracts: vivos(contratos), suppliers: vivos(fornecedores), inventory: vivos(estoque), orders: vivos(pedidos) };

  const [obraEscolhida, setObraId] = React.useState('');
  // O usuário de obra trabalha sempre na obra atribuída.
  const obraId = veTodas ? obraEscolhida : (obraAtribuida ?? '');
  const [busca, setBusca] = React.useState('');
  const [visao, setVisao] = React.useState<'tabela' | 'gantt' | 'fotos'>('tabela');
  const [editando, setEditando] = React.useState<Reg | 'novo' | null>(null);
  const [msg, setMsg] = React.useState<{ tipo: 'ok' | 'erro'; texto: string }>();
  // Registro novo pré-preenchido vindo de outra tela (ex.: medição → lançamento financeiro).
  const [iniciais, setIniciais] = React.useState<Record<string, unknown>>();
  const [assistente, setAssistente] = React.useState(false);
  React.useEffect(() => {
    try {
      const bruto = sessionStorage.getItem('obratop.prefill');
      if (!bruto) return;
      const p = JSON.parse(bruto) as { modulo: string; dados: Record<string, unknown>; aviso?: string };
      if (p.modulo !== modulo) return;
      sessionStorage.removeItem('obratop.prefill');
      setIniciais(p.dados); setEditando('novo');
      if (p.aviso) setMsg({ tipo: 'ok', texto: p.aviso });
    } catch { /* sem armazenamento */ }
  }, [modulo]);
  const abrirPreenchido = (destino: IdModulo, dados: Record<string, unknown>, aviso: string) => {
    try { sessionStorage.setItem('obratop.prefill', JSON.stringify({ modulo: destino, dados, aviso })); } catch { /* sem armazenamento */ }
    router.push(`/gestao/${destino}/`);
  };
  const temObra = esquema.fields.some((f) => f[0] === 'workId');

  const registros = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return vivos(brutos)
      .filter((r) => !temObra || !obraId || r.workId === obraId)
      .filter((r) => !termo || esquema.fields.some((f) => String(r[f[0]] ?? '').toLowerCase().includes(termo)))
      .sort((a, b) => String(b.date ?? b.start ?? '').localeCompare(String(a.date ?? a.start ?? '')) || String(a.wbs ?? a.name ?? '').localeCompare(String(b.wbs ?? b.name ?? ''), undefined, { numeric: true }));
  }, [brutos, busca, obraId, temObra, esquema]);

  const nomeRef = (campo: CampoEsquema, valor: unknown): string => {
    const col = COLECAO_DA_REFERENCIA[campo[2]];
    if (!col || !valor) return '';
    const r = referencias[col]?.find((x) => x.id === valor);
    return r ? rotuloRegistro(col, r) : '(registro removido)';
  };
  const formatar = (campo: CampoEsquema, r: Reg): React.ReactNode => {
    const v = r[campo[0]];
    if (v == null || v === '') return <span className="text-muted-foreground">—</span>;
    switch (campo[2]) {
      case 'date': return dataBr(String(v));
      case 'number': return CAMPOS_MOEDA.test(campo[0]) ? brl(Number(v)) : /%/.test(campo[1]) ? `${num(Number(v), 1)}%` : num(Number(v), 2);
      case 'select': return <Badge variant={/Conclu|Paga|Recebido|Pago|Aprovad|Ativo|Resolvida|Operacional|Assinado|Entregue/.test(String(v)) ? 'success' : /Atrasad|Vencid|Parad|Cr[ií]tica|Bloquead|Cancelad|Chuva forte/.test(String(v)) ? 'destructive' : 'default'}>{String(v)}</Badge>;
      case 'url': return <a href={String(v)} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">abrir</a>;
      default: return COLECAO_DA_REFERENCIA[campo[2]] ? nomeRef(campo, v) : String(v);
    }
  };
  // Na tabela: até 7 colunas, priorizando as obrigatórias e deixando textos longos para o formulário.
  const colunas = React.useMemo(() => {
    const curtas = esquema.fields.filter((f) => f[2] !== 'textarea' && f[2] !== 'file' || f[3]);
    return [...curtas.filter((f) => f[3]), ...curtas.filter((f) => !f[3])].slice(0, 7);
  }, [esquema]);

  const salvar = async (dados: Record<string, unknown>, id?: string, arquivo?: File | null, fotos?: { atuais: FotoDiario[]; novas: FotoNova[]; removidas: FotoDiario[] }) => {
    if (!tenantId) return;
    const anterior = id ? vivos(brutos).find((r) => r.id === id) : undefined;
    const idFinal = id ?? novoId();
    try {
      const agora = new Date().toISOString();
      if (arquivo) {
        if (arquivo.size > 10 * 1024 * 1024) { setMsg({ tipo: 'erro', texto: 'O arquivo deve ter no máximo 10 MB.' }); return; }
        if (MODO_DEMO) setMsg({ tipo: 'erro', texto: 'Modo demonstração: o arquivo não foi enviado; o registro foi salvo sem ele.' });
        else {
          // Mesmos campos do ObraTop: fileUrl, fileName e storagePath.
          const caminho = `organizations/${tenantId}/documents/${String(dados.workId || 'general')}/${crypto.randomUUID()}-${arquivo.name.replace(/[^\w.()-]/g, '_')}`;
          const snap = await uploadBytes(refArquivo(storage(), caminho), arquivo, { contentType: arquivo.type || 'application/octet-stream' });
          dados = { ...dados, fileUrl: await getDownloadURL(snap.ref), fileName: arquivo.name, storagePath: caminho };
        }
      }
      if (fotos) {
        // Fotos primeiro: se o envio falhar (sem internet), nada é gravado e o formulário continua aberto.
        let enviadas: FotoDiario[] = [];
        if (fotos.novas.length) {
          if (!MODO_DEMO && typeof navigator !== 'undefined' && !navigator.onLine) { setMsg({ tipo: 'erro', texto: 'Sem internet: as fotos não podem ser enviadas agora. Salve sem as fotos novas ou tente quando a conexão voltar.' }); return; }
          setMsg({ tipo: 'ok', texto: `Enviando ${fotos.novas.length} foto(s)…` });
          enviadas = await enviarFotos(tenantId, String(dados.workId || ''), idFinal, fotos.novas, usuario?.uid ?? '', (f, t) => setMsg({ tipo: 'ok', texto: `Enviando fotos: ${f} de ${t}…` }));
        }
        dados = { ...dados, photos: [...fotos.atuais, ...enviadas] };
      }
      if (id) await atualizarDoc(tenantId, `${modulo}/${id}`, { ...dados, updatedAt: agora, updatedBy: usuario?.uid ?? '' });
      else await definirDoc(tenantId, `${modulo}/${idFinal}`, { ...dados, deleted: false, createdAt: agora, createdBy: usuario?.uid ?? '', updatedAt: agora });
      void auditar(tenantId, usuario, id ? 'update' : 'create', modulo, idFinal, anterior, dados);
      if (fotos?.removidas.length) void apagarArquivos(fotos.removidas);
      setEditando(null);
      if (!(arquivo && MODO_DEMO)) setMsg({ tipo: 'ok', texto: `${esquema.title}: registro ${id ? 'atualizado' : 'criado'}${fotos?.novas.length ? ` com ${fotos.novas.length} foto(s) nova(s)` : ''}.` });
    } catch (e) {
      const texto = e instanceof Error && /imagem|abrir|30 MB|não é uma/.test(e.message) ? e.message : 'Não foi possível salvar. Seus dados continuam no formulário — verifique a conexão e a permissão.';
      setMsg({ tipo: 'erro', texto });
    }
  };
  // Ações em lote (como no ObraTop 3): marcar linhas e excluir ou mudar a situação de todas.
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  const [statusLote, setStatusLote] = React.useState('');
  React.useEffect(() => { setSel(new Set()); }, [modulo, obraEscolhida, busca]);
  const campoStatus = esquema.fields.find((f) => f[0] === 'status' && f[2] === 'select');
  const emLote = async (patch: Record<string, unknown>, acao: string, texto: string) => {
    if (!tenantId || sel.size === 0) return;
    const ids = [...sel], agora = new Date().toISOString(), quem = usuario?.uid ?? '';
    try {
      for (let i = 0; i < ids.length; i += 400) await atualizarEmLote(tenantId, ids.slice(i, i + 400).map((id) => ({ caminho: `${modulo}/${id}`, patch: { ...patch, updatedAt: agora, updatedBy: quem } })));
      void auditar(tenantId, usuario, acao, modulo, ids.join(',').slice(0, 900), undefined, { registros: ids.length, ...patch });
      setSel(new Set()); setMsg({ tipo: 'ok', texto });
    } catch { setMsg({ tipo: 'erro', texto: 'Não foi possível alterar os registros selecionados. Verifique a conexão e sua permissão.' }); }
  };
  const excluirSelecionados = () => { if (window.confirm(`Excluir ${sel.size} registro(s)? Eles vão para a lixeira e podem ser restaurados.`)) void emLote({ deleted: true, deletedAt: new Date().toISOString(), deletedBy: usuario?.uid ?? '' }, 'bulk-delete', `${sel.size} registro(s) movido(s) para a lixeira.`); };
  const mudarStatusSelecionados = () => { if (statusLote) void emLote({ status: statusLote }, 'bulk-status', `Situação de ${sel.size} registro(s) alterada para "${statusLote}".`); };
  const excluir = async (r: Reg) => {
    if (!tenantId || !window.confirm(`Excluir "${rotuloRegistro(modulo, r) || 'este registro'}"?`)) return;
    try {
      await atualizarDoc(tenantId, `${modulo}/${r.id}`, { deleted: true, deletedAt: new Date().toISOString(), deletedBy: usuario?.uid ?? '' });
      void auditar(tenantId, usuario, 'delete', modulo, r.id, r, { deleted: true });
      setMsg({ tipo: 'ok', texto: 'Registro movido para a lixeira (Administrativo → Lixeira e auditoria).' });
    } catch { setMsg({ tipo: 'erro', texto: 'Não foi possível excluir o registro.' }); }
  };

  // ── Ligações entre módulos (como no ObraTop 3) ─────────────────────────────
  const { dados: estoqueTodo, carregando: carregandoEstoque } = useColecao<Reg>(modulo === 'orders' || modulo === 'inventory' ? 'inventory' : null);
  const aplicarDiario = async (log: Reg) => {
    if (!tenantId) return;
    const atv = vivos(atividades).find((a) => a.id === log.activityId);
    const r = avancoDoDiario(log, atv);
    if ('erro' in r) { setMsg({ tipo: 'erro', texto: r.erro }); return; }
    if (!window.confirm(`Aplicar ao cronograma?\n\n${String(atv!.name)}\nAvanço: ${r.de}% → ${r.para}%`)) return;
    const agora = new Date().toISOString(), quem = usuario?.uid ?? '';
    try {
      await atualizarEmLote(tenantId, [
        { caminho: `activities/${atv!.id}`, patch: { ...r.patch, updatedAt: agora, updatedBy: quem } },
        { caminho: `dailyLogs/${log.id}`, patch: { appliedAt: agora, appliedProgress: r.para, updatedAt: agora, updatedBy: quem } },
      ]);
      void auditar(tenantId, usuario, 'rdo-apply', 'activities', atv!.id, { progress: r.de }, { progress: r.para, rdo: log.id });
      setMsg({ tipo: 'ok', texto: `Avanço aplicado: ${String(atv!.name)} agora em ${r.para}%.` });
    } catch { setMsg({ tipo: 'erro', texto: 'Não foi possível aplicar o avanço. Verifique a sua permissão nesta obra.' }); }
  };
  const lancarNoFinanceiro = (tipo: 'measurement' | 'order', r: Reg) => {
    const campo = tipo === 'measurement' ? 'measurementId' : 'orderId';
    const existe = vivos(financeiro).find((f) => f[campo] === r.id);
    if (existe && !window.confirm(`Já existe um lançamento ligado a este registro (${String(existe.description ?? existe.id)}). Criar outro mesmo assim?`)) return;
    abrirPreenchido('finance', lancamentoDe(tipo, r), 'Confira o lançamento pré-preenchido e clique em Salvar.');
  };
  const darEntrada = async (o: Reg) => {
    if (!tenantId) return;
    const inv = vivos(estoqueTodo).find((i) => i.id === o.inventoryId), qtd = Number(o.qty) || 0;
    if (!inv || qtd <= 0) { setMsg({ tipo: 'erro', texto: 'Informe no pedido o material do estoque e a quantidade antes de dar entrada.' }); return; }
    if (inv.workId !== o.workId) { setMsg({ tipo: 'erro', texto: 'O material pertence a outra obra.' }); return; }
    if (!window.confirm(`Dar entrada de ${qtd.toLocaleString('pt-BR')} ${String(inv.unit ?? '')} de ${String(inv.material)} no estoque e marcar o pedido como Entregue?`)) return;
    const agora = new Date().toISOString(), quem = usuario?.uid ?? '';
    try {
      await atualizarEmLote(tenantId, [
        { caminho: `orders/${o.id}`, patch: { status: 'Entregue', stockReceivedAt: agora, stockReceivedBy: quem, updatedAt: agora, updatedBy: quem } },
        { caminho: `inventory/${inv.id}`, patch: { date: agora.slice(0, 10), updatedAt: agora, updatedBy: quem }, soma: { currentStock: qtd } },
      ]);
      void auditar(tenantId, usuario, 'stock-receive', 'orders', o.id, { currentStock: inv.currentStock }, { inventoryId: inv.id, qty: qtd });
      setMsg({ tipo: 'ok', texto: `Entrada registrada: +${qtd.toLocaleString('pt-BR')} ${String(inv.unit ?? '')} de ${String(inv.material)}.` });
    } catch { setMsg({ tipo: 'erro', texto: 'Não foi possível registrar a entrada. Verifique a sua permissão nesta obra.' }); }
  };
  const pedirReposicao = (item: Reg) => {
    const pedido = pedidoDeReposicao(item);
    if (!pedido) { setMsg({ tipo: 'ok', texto: 'Este material não precisa de reposição agora.' }); return; }
    abrirPreenchido('orders', pedido, 'Pedido de reposição calculado pelo ponto de pedido. Confira e clique em Salvar.');
  };
  const nomeAtividade = (id: unknown) => { const a = vivos(atividades).find((x) => x.id === id); return a ? [a.wbs, a.name].filter(Boolean).join(' ') : ''; };
  const diasComFotos: DiaFotos[] = React.useMemo(() => modulo !== 'dailyLogs' ? [] : registros
    .map((r) => ({ data: String(r.date ?? '').slice(0, 10), titulo: obraId ? undefined : String(obras.find((o) => o.id === r.workId)?.name ?? ''), clima: String(r.weather ?? ''), servicos: String(r.services ?? ''),
      fotos: fotosDe(r).map((f) => ({ url: f.url, thumb: f.thumb, legenda: f.legenda, servico: nomeAtividade(f.activityId), data: String(r.date ?? '') })) }))
    .filter((d) => d.fotos.length > 0 && d.data)
    .sort((a, b) => b.data.localeCompare(a.data)), [modulo, registros, obraId, obras, atividades]); // eslint-disable-line react-hooks/exhaustive-deps -- nomeAtividade lê atividades

  /** Exporta os registros filtrados (todas as colunas do cadastro) em CSV que abre no Excel. */
  const exportarCsv = () => {
    const campos = esquema.fields.filter((f) => f[2] !== 'file');
    const celula = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const valor = (f: CampoEsquema, r: Reg) => {
      const v = r[f[0]];
      if (v == null || v === '') return '';
      if (f[2] === 'date') return dataBr(String(v));
      if (f[2] === 'number') return String(Number(v)).replace('.', ',');
      if (COLECAO_DA_REFERENCIA[f[2]]) return nomeRef(f, v);
      return String(v);
    };
    const linhas = [campos.map((f) => f[1]), ...registros.map((r) => campos.map((f) => valor(f, r)))];
    const url = URL.createObjectURL(new Blob([`\ufeff${linhas.map((l) => l.map(celula).join(';')).join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `ObraTop_${esquema.title.replace(/[^\wÀ-ú]+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 20000);
  };

  // ── MS Project ───────────────────────────────────────────────────────────
  const obraSel = obras.find((o) => o.id === obraId) ?? (modulo === 'activities' ? obras[0] : undefined);
  const atividadesDaObra = React.useMemo(() => vivos(atividades).filter((a) => a.workId === obraSel?.id), [atividades, obraSel]);
  const importarProject = async (arquivo: File) => {
    if (!tenantId || !obraSel) return;
    try {
      const { activities, warnings } = toActivities(parseMspdi(await arquivo.text()), { workId: obraSel.id });
      if (!activities.length) throw new Error('nenhuma tarefa com datas foi encontrada no arquivo');
      if (atividadesDaObra.length && !window.confirm(`A obra já tem ${atividadesDaObra.length} atividades. As ${activities.length} do arquivo serão ACRESCENTADAS (nada é apagado). Continuar?`)) return;
      const agora = new Date().toISOString();
      for (const a of activities) {
        const { _base, ...resto } = a;
        await definirDoc(tenantId, `activities/${novoId()}`, { ...resto, baseline: _base ?? null, deleted: false, createdAt: agora, createdBy: usuario?.uid ?? '', updatedAt: agora });
      }
      setMsg({ tipo: 'ok', texto: `${activities.length} atividades importadas do MS Project.${warnings.length ? ` Avisos: ${warnings.slice(0, 3).join(' ')}` : ''}` });
    } catch (e) { setMsg({ tipo: 'erro', texto: `Importação cancelada: ${e instanceof Error ? e.message : 'arquivo inválido'}.` }); }
  };
  const exportarProject = () => {
    if (!obraSel) return;
    const comWbs = atividadesDaObra.filter((a) => String(a.wbs ?? '').trim());
    if (!comWbs.length) { setMsg({ tipo: 'erro', texto: 'Para exportar, as atividades precisam do código EAP / WBS.' }); return; }
    const critico = cpm(comWbs.map((a) => ({ id: a.id, wbs: String(a.wbs), start: String(a.start), end: String(a.end), pred: String(a.predecessors ?? '') })));
    const blob = new Blob([mspdiExport(obraSel, atividadesDaObra, { critical: critico })], { type: 'application/xml' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${String(obraSel.name ?? 'obra').replace(/[^\w\-]+/g, '_')}.xml`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 30000);
  };

  // ── Cronograma a partir do orçamento (algoritmo original do ObraTop) ──────
  const gerarCronograma = async () => {
    const obra = obras.find((o) => o.id === obraId);
    if (!tenantId || !obra) return;
    try {
      const existentes = vivos(atividades).filter((a) => a.workId === obra.id);
      const g = cronogramaDoOrcamento(vivos(orcamentos), obra.id, { start: String(obra.start ?? ''), end: String(obra.end ?? '') }, existentes);
      const manuais = existentes.filter((a) => !String(a.id).startsWith('orc-')).length;
      if (!window.confirm(`Gerar ${g.atividades.length} atividades entre ${dataBr(String(obra.start))} e ${dataBr(String(obra.end))}?\n\n${g.porHoras} com duração pelas horas de mão de obra; as demais, pelo custo.\nAvanços já lançados nas atividades geradas antes são preservados.${manuais ? `\nAs ${manuais} atividades cadastradas à mão não são alteradas.` : ''}`)) return;
      const agora = new Date().toISOString();
      for (const { id, ...dados } of g.atividades) await definirDoc(tenantId, `activities/${id}`, { ...dados, deleted: false, createdAt: agora, createdBy: usuario?.uid ?? '', updatedAt: agora });
      setMsg({ tipo: g.cabe ? 'ok' : 'erro', texto: g.cabe
        ? `Cronograma gerado: ${g.atividades.length} atividades em ${g.diasUteis} dias úteis (prazo de ${g.diasUteisDoPrazo}). Veja em Cronograma → Gantt.`
        : `Cronograma gerado, mas NÃO cabe no prazo: precisa de ${g.diasUteis} dias úteis e a obra tem ${g.diasUteisDoPrazo}. Amplie o término da obra ou reduza o escopo.` });
    } catch (e) { setMsg({ tipo: 'erro', texto: `Não foi possível gerar o cronograma: ${e instanceof Error ? e.message : 'erro desconhecido'}` }); }
  };

  // ── Linha de base (mesma estrutura do ObraTop: works/{id}.baseline + baselineHistory) ──
  type LinhaBase = { revision: number; date: string; reason: string; byEmail: string; items: Record<string, { s: string; e: string; w: number }> };
  const linhaBase = (obraSel?.baseline as LinhaBase | undefined) ?? null;
  const congelarLinhaBase = async () => {
    if (!tenantId || !obraSel) return;
    const acts = atividadesDaObra.filter((a) => a.start && a.end);
    if (!acts.length) { setMsg({ tipo: 'erro', texto: 'A obra não tem atividades com datas para congelar.' }); return; }
    const motivo = window.prompt(linhaBase ? 'Motivo do replanejamento (a linha de base atual vai para o histórico):' : 'Motivo da linha de base:', linhaBase ? 'Replanejamento' : 'Linha de base inicial');
    if (motivo === null) return;
    const { weights } = activityWeights(acts, vivos(orcamentos));
    const items: LinhaBase['items'] = {};
    for (const a of acts) items[a.id] = { s: String(a.start), e: String(a.end), w: Math.round((weights.get(a.id) || 1) * 100) / 100 };
    const historico = [...((obraSel.baselineHistory as unknown[] | undefined) ?? [])];
    if (linhaBase) historico.push({ revision: linhaBase.revision, date: linhaBase.date, reason: linhaBase.reason || '', by: linhaBase.byEmail || '', count: Object.keys(linhaBase.items || {}).length });
    try {
      await atualizarDoc(tenantId, `works/${obraSel.id}`, {
        baseline: { revision: (linhaBase?.revision || 0) + 1, date: hoje(), reason: motivo.slice(0, 200), byEmail: usuario?.email ?? '', items },
        baselineHistory: historico.slice(-15), updatedAt: new Date().toISOString(), updatedBy: usuario?.uid ?? '',
      });
      setMsg({ tipo: 'ok', texto: `Linha de base rev. ${(linhaBase?.revision || 0) + 1} congelada com ${acts.length} atividades. O avanço planejado passa a ser medido contra ela.` });
    } catch { setMsg({ tipo: 'erro', texto: 'Não foi possível congelar a linha de base.' }); }
  };

  // ── Relatório da obra em PDF ─────────────────────────────────────────────
  const gerarRelatorio = async (obra: Reg) => {
    if (!tenant) return;
    try {
      const dia = hoje();
      const acts = vivos(atividades).filter((a) => a.workId === obra.id && a.start && a.end).sort((a, b) => String(a.wbs ?? '').localeCompare(String(b.wbs ?? ''), undefined, { numeric: true }));
      const bud = vivos(orcamentos).filter((b) => b.workId === obra.id);
      const fin = vivos(financeiro).filter((f) => f.workId === obra.id);
      const med = vivos(medicoes).filter((m) => m.workId === obra.id).sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const orcado = bud.reduce((t, b) => t + budgetSale(b), 0) || Number(obra.value) || 0;
      const incorrido = incurredCost(fin, dia);
      const critico = cpm(acts.map((a) => ({ id: a.id, wbs: String(a.wbs ?? ''), start: String(a.start), end: String(a.end), pred: String(a.predecessors ?? '') })));
      const [{ pdf }, { RelatorioObraPdf }] = await Promise.all([import('@react-pdf/renderer'), import('@/components/gestao/relatorio-obra-pdf')]);
      const blob = await pdf(<RelatorioObraPdf r={{
        empresa: { nome: tenant.nomeFantasia, responsavel: tenant.responsavelTecnico.nome, registro: tenant.responsavelTecnico.registro, corPrimaria: tenant.branding.corPrimaria },
        obra, emitidoEm: dia, orcado, incorrido,
        desempenho: schedulePerformance({ acts, budgets: bud, works: [obra], budget: orcado, incurred: incorrido, day: dia }),
        atividades: acts.map((a) => ({ ...a, critica: !!critico.get(a.id)?.critical, folga: critico.get(a.id)?.slack ?? null })),
        linhaBase: (obra.baseline as LinhaBase | undefined) ?? null,
        medicoes: med.map((m) => { const n = measurementNet(m); return { ...m, liquido: n.net, retencao: n.retention }; }),
        contratos: vivos(contratos).filter((c) => c.workId === obra.id).map((c) => { const b = contractBalance(c, medicoes); return { ...c, atual: b.current, medido: b.measured, saldo: b.balance }; }),
        caixa: cashProjection(fin, dia, 6),
      }} />).toBlob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `relatorio-${String(obra.name ?? 'obra').replace(/[^\w\-]+/g, '_')}-${dia}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 30000);
    } catch (e) { setMsg({ tipo: 'erro', texto: `Não foi possível gerar o relatório: ${e instanceof Error ? e.message : 'erro desconhecido'}` }); }
  };

  // ── Indicadores por módulo ───────────────────────────────────────────────
  const indicadores = React.useMemo((): [string, string, string?][] => {
    const dia = hoje();
    switch (modulo) {
      case 'measurements': {
        const t = registros.reduce((s, m) => { const n = measurementNet(m); return { bruto: s.bruto + n.gross, ret: s.ret + n.retention, glosa: s.glosa + n.deduction, liq: s.liq + n.net }; }, { bruto: 0, ret: 0, glosa: 0, liq: 0 });
        return [['Valor medido', brl(t.bruto)], ['Retenção contratual', brl(t.ret)], ['Glosas', brl(t.glosa)], ['Líquido a faturar', brl(t.liq)]];
      }
      case 'budgets': {
        const custo = registros.reduce((s, b) => s + (Number(b.qty) || 0) * (Number(b.unitValue) || 0), 0), venda = registros.reduce((s, b) => s + budgetSale(b), 0);
        return [['Custo direto', brl(custo)], ['BDI', brl(venda - custo)], ['Preço de venda', brl(venda)], ['Itens', String(registros.length)]];
      }
      case 'finance': {
        const cp = cashProjection(registros, dia, 6);
        const rec = registros.filter((x) => x.type === 'Receita').reduce((s, x) => s + (Number(x.value) || 0), 0), desp = registros.filter((x) => x.type === 'Despesa').reduce((s, x) => s + (Number(x.value) || 0), 0);
        return [['Receitas', brl(rec)], ['Despesas', brl(desp)], ['Saldo realizado', brl(cp.opening), 'recebido − pago'], ['Menor saldo projetado (6 meses)', brl(cp.minBalance), cp.firstNegative ? `fica negativo em ${cp.firstNegative.label}` : 'sem saldo negativo previsto']];
      }
      case 'contracts': {
        const t = registros.reduce((s, c) => { const b = contractBalance(c, medicoes); return { atual: s.atual + b.current, medido: s.medido + b.measured, saldo: s.saldo + b.balance }; }, { atual: 0, medido: 0, saldo: 0 });
        return [['Valor atual (com aditivos)', brl(t.atual)], ['Medido', brl(t.medido)], ['Saldo a medir', brl(t.saldo)], ['Contratos', String(registros.length)]];
      }
      case 'inventory': {
        const abaixo = registros.filter((i) => (Number(i.currentStock) || 0) < (Number(i.minStock) || 0)).length;
        return [['Itens', String(registros.length)], ['Abaixo do mínimo', String(abaixo), abaixo ? 'providenciar reposição' : 'estoque em dia'], ['Valor em estoque', brl(registros.reduce((s, i) => s + (Number(i.currentStock) || 0) * (Number(i.unitValue) || 0), 0))]];
      }
      default: return [];
    }
  }, [modulo, registros, medicoes]);

  /** Desempenho de cada obra: avanço planejado × real, IDP (prazo) e IDC (custo). */
  const desempenho = React.useMemo(() => {
    if (modulo !== 'works' && modulo !== 'activities') return [];
    const dia = hoje();
    return (modulo === 'activities' && obraSel ? [obraSel] : obras).map((o) => {
      const acts = vivos(atividades).filter((a) => a.workId === o.id);
      const bud = vivos(orcamentos).filter((b) => b.workId === o.id);
      const orcado = bud.reduce((s, b) => s + budgetSale(b), 0) || Number(o.value) || 0;
      const p = schedulePerformance({ acts, budgets: bud, works: [o], budget: orcado, incurred: incurredCost(vivos(financeiro).filter((f) => f.workId === o.id), dia), day: dia });
      return { obra: o, p, n: acts.length };
    });
  }, [modulo, obras, obraSel, atividades, orcamentos, financeiro]);

  return (
    <>
      <PageHeader titulo={esquema.title} descricao={`${esquema.subtitle}.`}>
        <Field label="Ir para" className="w-56">
          <Select value={modulo} onChange={(e) => setModulo(e.target.value as IdModulo)}>
            {GRUPOS_MODULOS.map((g) => <optgroup key={g} label={g}>{MODULOS.filter((m) => ESQUEMAS[m].group === g).map((m) => <option key={m} value={m}>{ESQUEMAS[m].title}</option>)}</optgroup>)}
          </Select>
        </Field>
      </PageHeader>
      {msg && <p role={msg.tipo === 'erro' ? 'alert' : 'status'} className={cn('mb-4 rounded-md border p-3 text-sm', msg.tipo === 'erro' ? 'border-destructive/40 bg-destructive/5 text-destructive' : 'border-success/40 bg-success/5')}>{msg.texto}</p>}
      {erro && <p role="alert" className="mb-4 text-sm text-destructive">Não foi possível carregar {esquema.title.toLowerCase()}: {erro}</p>}

      {/* Altura reservada: os cartões chegam depois dos dados e não podem empurrar a tabela. */}
      {(modulo === 'works' || modulo === 'activities') && desempenho.length === 0 && carregando && <div className="mb-4 h-[132px]" aria-hidden />}
      {desempenho.length > 0 && (
        <div className="mb-4 grid min-h-[132px] grid-cols-1 gap-3 lg:grid-cols-2">
          {desempenho.map(({ obra, p, n }) => (
            <Card key={obra.id}><CardContent className="p-4">
              <div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold">{String(obra.name)}</p>
                <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">{n} atividades{(obra.baseline as { revision?: number } | undefined)?.revision ? ` · base rev. ${(obra.baseline as { revision: number }).revision}` : ''}
                  <Button size="sm" variant="outline" aria-label={`Relatório PDF — ${String(obra.name)}`} onClick={() => void gerarRelatorio(obra)}><FileText className="h-3.5 w-3.5" />Relatório PDF</Button></span></div>
              {n === 0 ? <p className="mt-2 text-xs text-muted-foreground">Sem cronograma: cadastre atividades ou importe do MS Project.</p> : (
                <>
                  <div className="mt-2 space-y-1.5">
                    {([['Planejado', p.planned, 'color-mix(in srgb, var(--series-1) 35%, transparent)'], ['Realizado', p.actual, 'var(--series-1)']] as const).map(([r, v, cor]) => (
                      <div key={r} className="flex items-center gap-2 text-xs"><span className="w-16 text-muted-foreground">{r}</span>
                        <div className="h-2 flex-1 rounded-full bg-secondary"><div className="h-full rounded-full" style={{ width: `${Math.min(100, v)}%`, background: cor }} /></div>
                        <span className="tabular w-12 text-right">{num(v, 1)}%</span></div>
                    ))}
                  </div>
                  <dl className="tabular mt-3 grid grid-cols-4 gap-2 text-xs">
                    <div><dt className="text-muted-foreground">Desvio</dt><dd className={cn('font-medium', p.variance < -2 && 'text-destructive')}>{p.variance > 0 ? '+' : ''}{num(p.variance, 1)} p.p.</dd></div>
                    <div><dt className="text-muted-foreground">IDP (prazo)</dt><dd className={cn('font-medium', p.spi < 0.95 && 'text-destructive')}>{Number.isFinite(p.spi) ? num(p.spi, 2) : '—'}</dd></div>
                    <div><dt className="text-muted-foreground">IDC (custo)</dt><dd className={cn('font-medium', p.cpi < 0.95 && 'text-destructive')}>{Number.isFinite(p.cpi) ? num(p.cpi, 2) : '—'}</dd></div>
                    <div><dt className="text-muted-foreground">Estimativa no término</dt><dd className="font-medium">{brl(p.eac, 0)}</dd></div>
                  </dl>
                </>
              )}
            </CardContent></Card>
          ))}
        </div>
      )}
      {indicadores.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {indicadores.map(([r, v, d]) => <Card key={r}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{r}</p><p className="tabular mt-1 text-lg font-semibold">{v}</p>{d && <p className="text-xs text-muted-foreground">{d}</p>}</CardContent></Card>)}
        </div>
      )}

      {assistente && modulo === 'works' && <AssistenteObra nomesExistentes={obras.map((o) => String(o.name ?? ''))} onFechar={() => setAssistente(false)} onCriada={(id, texto) => { setAssistente(false); setObraId(id); setMsg({ tipo: 'ok', texto }); }} />}
      {editando && <Formulario key={editando === 'novo' ? 'novo' : editando.id} esquema={esquema} modulo={modulo} registro={editando === 'novo' ? null : editando} obraPadrao={obraId} referencias={referencias} atividades={vivos(atividades)} iniciais={editando === 'novo' ? iniciais : undefined} onCancelar={() => { setEditando(null); setIniciais(undefined); }} onSalvar={salvar} />}

      <Card>
        <CardHeader className="flex-row flex-wrap items-end justify-between gap-3">
          <div><CardTitle>{esquema.title}</CardTitle><CardDescription className="mt-1">{registros.length} registro(s){obraId && temObra ? ' nesta obra' : ''}</CardDescription></div>
          <div className="flex flex-wrap items-end gap-2">
            {veTodas && (temObra || modulo === 'activities') && <Select className="w-56" aria-label="Filtrar por obra" value={modulo === 'activities' && visao === 'gantt' ? obraSel?.id ?? '' : obraId} onChange={(e) => setObraId(e.target.value)}>
              {!(modulo === 'activities' && visao === 'gantt') && <option value="">Todas as obras</option>}
              {obras.map((o) => <option key={o.id} value={o.id}>{String(o.name)}</option>)}
            </Select>}
            <Input className="w-48" placeholder="Buscar…" aria-label="Buscar nos registros" value={busca} onChange={(e) => setBusca(e.target.value)} />
            {modulo === 'activities' && <Segmented value={visao} onChange={setVisao} options={[{ value: 'tabela', label: 'Tabela' }, { value: 'gantt', label: 'Gantt' }]} />}
            {modulo === 'dailyLogs' && <Segmented value={visao === 'fotos' ? 'fotos' : 'tabela'} onChange={setVisao} options={[{ value: 'tabela', label: 'Registros' }, { value: 'fotos', label: 'Relatório fotográfico' }]} />}
            {modulo === 'activities' && obraSel && <Button variant="outline" onClick={exportarProject}><Download className="h-4 w-4" />MS Project</Button>}
            {modulo === 'activities' && obraSel && gravavel && <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input px-4 text-sm font-medium hover:bg-accent focus-within:ring-2 focus-within:ring-ring"><FileUp className="h-4 w-4" />Importar XML
              <input type="file" accept=".xml" className="sr-only" onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ''; if (a) void importarProject(a); }} /></label>}
            {modulo === 'activities' && obraSel && planeja && <Button variant="outline" onClick={() => void congelarLinhaBase()}><Flag className="h-4 w-4" />{linhaBase ? `Replanejar (base rev. ${linhaBase.revision})` : 'Congelar linha de base'}</Button>}
            {modulo === 'budgets' && obraId && planeja && <Button variant="outline" onClick={() => void gerarCronograma()}><CalendarRange className="h-4 w-4" />Gerar cronograma</Button>}
            {modulo === 'works' && planeja && <Button variant="outline" onClick={() => { setAssistente(true); setEditando(null); }}><Sparkles className="h-4 w-4" />Nova obra por modelo</Button>}
            {registros.length > 0 && visao !== 'fotos' && <Button variant="outline" onClick={exportarCsv}><Download className="h-4 w-4" />Planilha</Button>}
            {gravavel && (planeja || modulo !== 'works') && <Button onClick={() => setEditando('novo')}><Plus className="h-4 w-4" />Novo</Button>}
          </div>
        </CardHeader>
        <CardContent>
          {carregando ? <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
            : modulo === 'dailyLogs' && visao === 'fotos' ? <RelatorioFotografico dias={diasComFotos} vazio={busca ? 'Nenhuma foto para esta busca.' : 'Nenhuma foto ainda. Abra um diário (Novo ou o lápis) e use "Tirar foto" ou "Escolher fotos".'}
                cabecalho={<div className="mb-6 border-b pb-3"><p className="text-xs uppercase tracking-wider text-muted-foreground">{tenant?.nomeFantasia} · Relatório fotográfico</p><p className="text-lg font-semibold">{obraId ? String(obras.find((o) => o.id === obraId)?.name ?? '') : 'Todas as obras'}</p><p className="text-xs text-muted-foreground">Emitido em {new Date().toLocaleDateString('pt-BR')}</p></div>} />
            : modulo === 'activities' && visao === 'gantt' ? <GanttObra atividades={atividadesDaObra as unknown as AtividadeGantt[]} linhaBase={linhaBase?.items} onAbrir={gravavel ? (id) => setEditando(atividadesDaObra.find((a) => a.id === id) ?? null) : undefined} />
            : registros.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Nenhum registro{busca ? ' para esta busca' : ''}. {gravavel && !busca ? 'Use "Novo" para começar.' : ''}</p>
            : (
              <div className="overflow-x-auto">
                {gravavel && sel.size > 0 && (
                  <div role="region" aria-label="Ações em lote" className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-2 text-sm">
                    <span className="px-1 font-medium">{sel.size} selecionado(s)</span>
                    {campoStatus && <><Select aria-label="Nova situação" className="h-8 w-44" value={statusLote} onChange={(e) => setStatusLote(e.target.value)}><option value="">Mudar situação para…</option>{(campoStatus[4] ?? []).map((o) => <option key={o} value={o}>{o}</option>)}</Select>
                      <Button size="sm" variant="outline" disabled={!statusLote} onClick={mudarStatusSelecionados}>Aplicar</Button></>}
                    {apaga && <Button size="sm" variant="outline" onClick={excluirSelecionados}><Trash2 className="h-4 w-4" />Excluir selecionados</Button>}
                    <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>Limpar seleção</Button>
                  </div>
                )}
                <table className="w-full min-w-[720px] text-sm">
                  <thead><tr className="border-b text-left text-xs text-muted-foreground">
                    {gravavel && <th className="w-8 py-2 pr-2"><input type="checkbox" aria-label="Selecionar todos" className="h-4 w-4 accent-primary" checked={sel.size > 0 && sel.size === registros.length} onChange={(e) => setSel(e.target.checked ? new Set(registros.map((x) => x.id)) : new Set())} /></th>}
                    {colunas.map((c) => <th key={c[0]} className={cn('px-2 py-2 font-medium first:pl-0', c[2] === 'number' && 'text-right')}>{c[1].replace(' (opcional)', '')}</th>)}
                    {modulo === 'measurements' && <th className="px-2 py-2 text-right font-medium">Líquido</th>}
                    {modulo === 'contracts' && <th className="px-2 py-2 text-right font-medium">Saldo a medir</th>}
                    {modulo === 'budgets' && <th className="px-2 py-2 text-right font-medium">Preço de venda</th>}
                    {modulo === 'documents' && <th className="px-2 py-2 font-medium">Arquivo</th>}
                    {modulo === 'dailyLogs' && <th className="px-2 py-2 font-medium">Fotos</th>}
                    {modulo === 'inventory' && <th className="px-2 py-2 font-medium">Situação</th>}
                    <th className="w-20"><span className="sr-only">Ações</span></th>
                  </tr></thead>
                  <tbody className="divide-y">
                    {registros.map((r) => (
                      <tr key={r.id} className={cn('align-top', sel.has(r.id) && 'bg-primary/5')}>
                        {gravavel && <td className="py-2 pr-2"><input type="checkbox" aria-label={`Selecionar ${rotuloRegistro(modulo, r)}`} className="h-4 w-4 accent-primary" checked={sel.has(r.id)} onChange={(e) => setSel((s0) => { const n0 = new Set(s0); if (e.target.checked) n0.add(r.id); else n0.delete(r.id); return n0; })} /></td>}
                        {colunas.map((c) => <td key={c[0]} className={cn('max-w-[280px] px-2 py-2 first:pl-0', c[2] === 'number' && 'tabular whitespace-nowrap text-right', c[2] === 'date' && 'tabular whitespace-nowrap')}>{formatar(c, r)}</td>)}
                        {modulo === 'measurements' && <td className="tabular whitespace-nowrap px-2 py-2 text-right font-medium">{brl(measurementNet(r).net)}</td>}
                        {modulo === 'contracts' && <td className="tabular whitespace-nowrap px-2 py-2 text-right font-medium">{brl(contractBalance(r, medicoes).balance)} <span className="font-normal text-muted-foreground">({pct(contractBalance(r, medicoes).percentLeft / 100, 0)})</span></td>}
                        {modulo === 'budgets' && <td className="tabular whitespace-nowrap px-2 py-2 text-right font-medium">{brl(budgetSale(r))}</td>}
                        {modulo === 'dailyLogs' && <td className="px-2 py-2">{(() => { const f = fotosDe(r); return f.length === 0 ? <span className="text-muted-foreground">—</span> : (
                          <button type="button" className="flex items-center gap-1" aria-label={`Ver ${f.length} foto(s) de ${dataBr(String(r.date ?? ''))}`} onClick={() => setVisao('fotos')}>
                            {/* eslint-disable-next-line @next/next/no-img-element -- miniaturas */}
                            {f.slice(0, 3).map((x) => <img key={x.id} src={x.thumb} alt="" className="h-9 w-9 rounded object-cover" />)}{f.length > 3 && <span className="text-xs text-muted-foreground">+{f.length - 3}</span>}
                          </button>); })()}</td>}
                        {modulo === 'inventory' && <td className="px-2 py-2">{(() => { const z = situacaoEstoque(r); return <Badge variant={z.nivel === 'bad' ? 'destructive' : z.nivel === 'warn' || z.nivel === 'over' ? 'warning' : z.nivel === 'ok' ? 'success' : 'default'} title={z.acao}>{z.rotulo}</Badge>; })()}</td>}
                        {modulo === 'documents' && <td className="max-w-[200px] truncate px-2 py-2">{r.fileUrl ? <a href={String(r.fileUrl)} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">{String(r.fileName ?? 'abrir')}</a> : <span className="text-muted-foreground">—</span>}</td>}
                        <td className="whitespace-nowrap py-1 text-right">
                          {gravaCronograma && modulo === 'dailyLogs' && !!r.activityId && Number(r.progressTo) > 0 && !r.appliedAt && <Button size="icon" variant="ghost" title="Aplicar o avanço ao cronograma" aria-label={`Aplicar ao cronograma o avanço do diário de ${dataBr(String(r.date ?? ''))}`} onClick={() => void aplicarDiario(r)}><CheckCheck className="h-4 w-4" /></Button>}
                          {gravaFinanceiro && (modulo === 'measurements' || modulo === 'orders') && <Button size="icon" variant="ghost" title="Lançar no financeiro" aria-label={`Lançar no financeiro: ${rotuloRegistro(modulo, r)}`} onClick={() => lancarNoFinanceiro(modulo === 'measurements' ? 'measurement' : 'order', r)}><ReceiptText className="h-4 w-4" /></Button>}
                          {gravavel && gravaEstoque && !carregandoEstoque && modulo === 'orders' && !!r.inventoryId && !r.stockReceivedAt && r.status !== 'Cancelado' && <Button size="icon" variant="ghost" title="Dar entrada no estoque" aria-label={`Dar entrada no estoque: ${rotuloRegistro(modulo, r)}`} onClick={() => void darEntrada(r)}><PackageCheck className="h-4 w-4" /></Button>}
                          {gravaPedidos && modulo === 'inventory' && ['bad', 'warn'].includes(situacaoEstoque(r).nivel) && <Button size="icon" variant="ghost" title="Pedir reposição" aria-label={`Pedir reposição: ${rotuloRegistro(modulo, r)}`} onClick={() => pedirReposicao(r)}><ShoppingCart className="h-4 w-4" /></Button>}
                          {gravavel && <><Button size="icon" variant="ghost" aria-label={`Editar ${rotuloRegistro(modulo, r)}`} onClick={() => { setEditando(r); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Pencil className="h-4 w-4" /></Button>
                            {apaga && <Button size="icon" variant="ghost" aria-label={`Excluir ${rotuloRegistro(modulo, r)}`} onClick={() => void excluir(r)}><Trash2 className="h-4 w-4" /></Button>}</>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </CardContent>
      </Card>
    </>
  );
}

function Formulario({ esquema, modulo, registro, obraPadrao, referencias, atividades, iniciais, onCancelar, onSalvar }: {
  esquema: EsquemaModulo; modulo: IdModulo; registro: Reg | null; obraPadrao: string; referencias: Partial<Record<IdModulo, Reg[]>>;
  atividades: Reg[]; iniciais?: Record<string, unknown>; onCancelar: () => void; onSalvar: (dados: Record<string, unknown>, id?: string, arquivo?: File | null, fotos?: { atuais: FotoDiario[]; novas: FotoNova[]; removidas: FotoDiario[] }) => Promise<void>;
}) {
  const [v, setV] = React.useState<Record<string, string>>(() => {
    const ini: Record<string, string> = {};
    for (const f of esquema.fields) ini[f[0]] = registro?.[f[0]] != null ? String(registro[f[0]]) : f[0] === 'workId' ? obraPadrao : f[2] === 'select' ? f[4]?.[0] ?? '' : f[2] === 'date' && f[3] && f[0] === 'date' ? new Date().toISOString().slice(0, 10) : '';
    if (!registro && iniciais) for (const [k, val] of Object.entries(iniciais)) if (val != null && esquema.fields.some((f) => f[0] === k)) ini[k] = String(val);
    return ini;
  });
  const [erros, setErros] = React.useState<Record<string, string>>({});
  const [salvando, setSalvando] = React.useState(false);
  const [arquivo, setArquivo] = React.useState<File | null>(null);
  const campos = esquema.fields.filter((f) => f[2] !== 'file');
  const temArquivo = esquema.fields.some((f) => f[2] === 'file');
  const comFotos = modulo === 'dailyLogs';
  const originais = React.useMemo(() => fotosDe(registro), [registro]);
  const [fotosAtuais, setFotosAtuais] = React.useState<FotoDiario[]>(originais);
  const [fotosNovas, setFotosNovas] = React.useState<FotoNova[]>([]);
  const servicos = React.useMemo(() => atividades.filter((a) => !v.workId || a.workId === v.workId)
    .sort((a, b) => String(a.wbs ?? '').localeCompare(String(b.wbs ?? ''), undefined, { numeric: true }))
    .map((a) => ({ id: a.id, rotulo: [a.wbs, a.name].filter(Boolean).join(' ') })), [atividades, v.workId]);

  const enviar = async () => {
    const e: Record<string, string> = {};
    const dados: Record<string, unknown> = {};
    for (const f of campos) {
      const bruto = (v[f[0]] ?? '').trim();
      if (f[3] && bruto === '') { e[f[0]] = 'Obrigatório'; continue; }
      if (f[2] === 'number') {
        if (bruto === '') { dados[f[0]] = 0; continue; }
        const n = Number(bruto.replace(/\./g, '').replace(',', '.'));
        const direto = Number(bruto);
        const valor = Number.isFinite(direto) ? direto : n;
        if (!Number.isFinite(valor) || valor < 0) { e[f[0]] = 'Número inválido'; continue; }
        if (/%/.test(f[1]) && valor > 100) { e[f[0]] = 'Máximo 100'; continue; }
        dados[f[0]] = valor;
      } else if (f[2] === 'url' && bruto && !/^https:\/\//i.test(bruto)) e[f[0]] = 'Use um link https://';
      else if (f[2] === 'email' && bruto && !/^\S+@\S+\.\S+$/.test(bruto)) e[f[0]] = 'E-mail inválido';
      else dados[f[0]] = bruto;
    }
    for (const [ini, fim] of [['start', 'end'], ['date', 'dueDate']] as const) {
      if (dados[ini] && dados[fim] && String(dados[fim]) < String(dados[ini])) e[fim] = 'Anterior à data inicial';
    }
    setErros(e);
    if (Object.keys(e).length) return;
    setSalvando(true);
    if (!registro && iniciais) for (const k of ['measurementId', 'orderId', 'contractId', 'inventoryId', 'qty']) if (iniciais[k] != null && dados[k] === undefined) dados[k] = iniciais[k];
    await onSalvar(dados, registro?.id, arquivo, comFotos ? { atuais: fotosAtuais, novas: fotosNovas, removidas: originais.filter((o) => !fotosAtuais.some((f) => f.id === o.id)) } : undefined);
    setSalvando(false);
  };

  return (
    <Card className="mb-4 border-primary/40">
      <CardHeader className="flex-row items-center justify-between"><CardTitle>{registro ? `Editar — ${rotuloRegistro(modulo, registro) || esquema.title}` : `Novo registro — ${esquema.title}`}</CardTitle>
        <Button size="icon" variant="ghost" aria-label="Fechar formulário" onClick={onCancelar}><X className="h-4 w-4" /></Button></CardHeader>
      <CardContent>
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(ev) => { ev.preventDefault(); void enviar(); }}>
          {campos.map((f) => {
            const [chave, rotulo, tipo, obrig, opcoes] = f;
            const col = COLECAO_DA_REFERENCIA[tipo];
            const comum = { value: v[chave] ?? '', 'aria-invalid': !!erros[chave], onChange: (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((x) => ({ ...x, [chave]: ev.target.value })) };
            return (
              <Field key={chave} label={`${rotulo}${obrig ? ' *' : ''}`} className={tipo === 'textarea' ? 'sm:col-span-2 lg:col-span-3' : ''}>
                {tipo === 'select' ? <Select {...comum}>{(opcoes ?? []).map((o) => <option key={o}>{o}</option>)}</Select>
                  : col ? <Select {...comum}><option value="">{obrig ? 'Selecione…' : '— nenhum —'}</option>
                    {(referencias[col] ?? []).filter((r) => col === 'works' || !v.workId || !r.workId || r.workId === v.workId).map((r) => <option key={r.id} value={r.id}>{rotuloRegistro(col, r)}</option>)}</Select>
                  : tipo === 'textarea' ? <Textarea className="min-h-[70px]" {...comum} />
                  : <Input type={tipo === 'date' ? 'date' : tipo === 'number' ? 'text' : tipo === 'email' ? 'email' : tipo === 'url' ? 'url' : 'text'} inputMode={tipo === 'number' ? 'decimal' : undefined} className={tipo === 'number' ? 'tabular' : ''} {...comum} />}
                {erros[chave] && <span role="alert" className="text-xs text-destructive">{erros[chave]}</span>}
              </Field>
            );
          })}
          {comFotos && <EditorFotos atuais={fotosAtuais} setAtuais={setFotosAtuais} novas={fotosNovas} setNovas={setFotosNovas} atividades={servicos} desabilitado={salvando} />}
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-3">
            <Button type="submit" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</Button>
            <Button variant="ghost" onClick={onCancelar}>Cancelar</Button>
            {temArquivo && (
              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input px-3 text-xs font-medium hover:bg-accent focus-within:ring-2 focus-within:ring-ring">
                <Paperclip className="h-3.5 w-3.5" />{arquivo ? `${arquivo.name} (${(arquivo.size / 1024).toFixed(0)} kB)` : registro?.fileName ? `Substituir ${String(registro.fileName)}` : 'Anexar arquivo (até 10 MB)'}
                <input type="file" className="sr-only" onChange={(ev) => setArquivo(ev.target.files?.[0] ?? null)} />
              </label>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
