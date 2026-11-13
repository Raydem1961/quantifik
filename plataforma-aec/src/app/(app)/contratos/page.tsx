'use client';
import * as React from 'react';
import Link from 'next/link';
import { Download, FileSignature, ShieldCheck } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { ref, uploadBytes } from 'firebase/storage';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, Field, Input, Select, Textarea } from '@/components/ui/form';
import { useAuth } from '@/hooks/use-auth';
import { adicionarDoc, useColecao } from '@/hooks/use-colecao';
import { useWorkspace } from '@/hooks/use-workspace';
import { contextoDeEscopo, MODELO_CONTRATO_PADRAO, paraBlocos, renderizarModelo, VARIAVEIS_DISPONIVEIS, type ContextoContrato } from '@/lib/contracts/template';
import { gerarCronogramaFisicoFinanceiro, gerarCurvaS } from '@/lib/cub/schedule';
import { functions, MODO_DEMO, storage } from '@/lib/firebase/client';
import { brl, dataExtenso, num } from '@/lib/format';
import { pode } from '@/lib/rbac';
import { sha256Hex, type PedidoAssinatura, type Signatario } from '@/lib/signature/hash';
import { TIPOLOGIAS_INFRA, type Project } from '@/lib/types';

const PARCELAS = [['Assinatura do contrato', 0.2], ['Entrega do anteprojeto', 0.3], ['Entrega do projeto legal', 0.2], ['Entrega do projeto executivo', 0.3]] as const;

export default function Contratos() {
  const { tenant, tenantId, role, usuario } = useAuth();
  const { orcamento, analitico: analiticoWs } = useWorkspace();
  const { dados: projetos } = useColecao<Project>('projects');
  const [projectId, setProjectId] = React.useState('');
  const projeto = projetos.find((p) => p.id === projectId) ?? projetos[0];
  // O orçamento analítico pertence a um projeto; só vale se for o selecionado.
  const analitico = analiticoWs && projeto && analiticoWs.projectId === projeto.id ? analiticoWs : null;
  const infra = projeto ? TIPOLOGIAS_INFRA.includes(projeto.tipologia) : false;
  const [fonteEscolhida, setFonte] = React.useState<'cub' | 'analitico' | ''>('');
  // Padrão: infraestrutura usa composições; edificação usa CUB. Cai para a outra se só ela existir.
  const fonte: 'cub' | 'analitico' = fonteEscolhida || (infra ? (analitico || !orcamento ? 'analitico' : 'cub') : orcamento || !analitico ? 'cub' : 'analitico');
  const estimativa = fonte === 'cub' ? orcamento : analitico;
  const [prazoObra, setPrazoObra] = React.useState(12);
  const [modelo, setModelo] = React.useState(MODELO_CONTRATO_PADRAO);
  const [manual, setManual] = React.useState<Record<string, string>>({ cliente_documento: '', numero_art_rrt: '', cliente_email: '' });
  const [pdf, setPdf] = React.useState<{ url: string; sha256: string; blob: Blob; codigo: string } | null>(null);
  const [estado, setEstado] = React.useState<{ ocupado?: string; erro?: string; ok?: string }>({});
  const editor = React.useRef<HTMLTextAreaElement>(null);

  const ctx = React.useMemo((): ContextoContrato => {
    if (!tenant || !projeto) return {};
    const honorarios = projeto.valorContratado;
    return {
      ...contextoDeEscopo(projeto.disciplinas, orcamento?.resultado.padrao ?? 'medio'),
      contratada_razao_social: tenant.razaoSocial, contratada_cnpj: tenant.cnpj,
      responsavel_tecnico: tenant.responsavelTecnico.nome, registro_profissional: tenant.responsavelTecnico.registro,
      cliente_nome: projeto.clienteNome, cliente_documento: manual.cliente_documento,
      projeto_nome: projeto.nome, projeto_local: `${projeto.municipio}/${projeto.uf}`,
      area_construida: num(fonte === 'cub' && orcamento ? orcamento.resultado.areaRealTotalM2 : projeto.areaConstruidaM2),
      estimativa_cub: fonte === 'cub', estimativa_analitica: fonte === 'analitico',
      valor_total_cub: orcamento ? brl(orcamento.resultado.precoVenda) : '',
      valor_total_analitico: analitico ? brl(analitico.precoVenda) : '', base_precos: analitico?.base ?? '',
      valor_honorarios: brl(honorarios),
      cronograma_etapas: PARCELAS.map(([etapa, f]) => `${etapa}: ${num(f * 100, 0)}% — ${brl(honorarios * f)}`).join('; ') + '.',
      prazo_meses: Math.max(1, Math.round((new Date(projeto.fim).getTime() - new Date(projeto.inicio).getTime()) / (30.44 * 86400000))),
      numero_art_rrt: manual.numero_art_rrt, data_extenso: dataExtenso(new Date()), foro: `${projeto.municipio}/${projeto.uf}`,
    };
  }, [tenant, projeto, orcamento, analitico, fonte, manual]);

  const render = React.useMemo(() => renderizarModelo(modelo, ctx), [modelo, ctx]);
  const blocos = React.useMemo(() => paraBlocos(render.texto), [render.texto]);
  // Qualquer mudança no conteúdo invalida o PDF gerado (o hash deixaria de corresponder).
  React.useEffect(() => { setPdf((p) => { if (p) URL.revokeObjectURL(p.url); return null; }); }, [render.texto, orcamento, analitico, fonte, prazoObra]);

  const inserir = (chave: string) => {
    const el = editor.current;
    const tag = `{{${chave}}}`;
    const i = el?.selectionStart ?? modelo.length, f = el?.selectionEnd ?? modelo.length;
    setModelo(modelo.slice(0, i) + tag + modelo.slice(f));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(i + tag.length, i + tag.length); });
  };

  const signatarios = (): Signatario[] => [
    { nome: projeto?.clienteNome ?? '', email: manual.cliente_email ?? '', papel: 'contratante' },
    { nome: tenant?.responsavelTecnico.nome ?? '', email: usuario?.email ?? '', papel: 'contratada' },
  ];

  const gerar = async () => {
    if (!tenant || !projeto || !estimativa) return;
    const meses = Math.max(1, Math.min(120, Math.trunc(prazoObra) || 1));
    setEstado({ ocupado: 'Gerando PDF…' });
    try {
      const [{ pdf: criar }, { PropostaContratoPdf }] = await Promise.all([import('@react-pdf/renderer'), import('@/components/contracts/contract-pdf')]);
      const codigo = `${projeto.codigo}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
      const blob = await criar(
        <PropostaContratoPdf d={{
          codigo, emitidoEm: new Date().toLocaleDateString('pt-BR'),
          empresa: { nome: tenant.nomeFantasia, cnpj: tenant.cnpj, responsavel: tenant.responsavelTecnico.nome, registro: tenant.responsavelTecnico.registro, logoUrl: tenant.branding.logoUrl, corPrimaria: tenant.branding.corPrimaria, corSecundaria: tenant.branding.corSecundaria },
          projeto: { nome: projeto.nome, cliente: projeto.clienteNome, local: `${projeto.municipio}/${projeto.uf}` },
          ...(fonte === 'cub' && orcamento
            ? { orcamento: orcamento.resultado, cenarios: orcamento.cenarios.filter((c) => c.resultado.padrao !== 'popular' || orcamento.resultado.padrao === 'popular'), cronograma: gerarCronogramaFisicoFinanceiro(orcamento.resultado.precoVenda, orcamento.prazoObraMeses) }
            // Obras de infraestrutura não seguem as etapas de edificação: só a Curva S paramétrica.
            : { analitico: analitico!, cenarios: [], cronograma: { linhas: [], totais: gerarCurvaS(analitico!.precoVenda, meses) } }),
          // Variáveis ainda sem valor viram lacuna para preenchimento manual no documento impresso.
          contrato: paraBlocos(render.texto.replace(/\[\[[\w.]+\]\]/g, '________________')), signatarios: signatarios(),
        }} />,
      ).toBlob();
      setPdf({ url: URL.createObjectURL(blob), sha256: await sha256Hex(blob), blob, codigo });
      setEstado({});
    } catch (e) {
      setEstado({ erro: `Não foi possível gerar o PDF: ${e instanceof Error ? e.message : 'erro desconhecido'}` });
    }
  };

  const enviarAssinatura = async () => {
    if (!pdf || !tenantId || !projeto) return;
    if (!/^\S+@\S+\.\S+$/.test(manual.cliente_email ?? '')) { setEstado({ erro: 'Informe o e-mail do cliente para a assinatura.' }); return; }
    if (MODO_DEMO) { setEstado({ ok: 'Modo demonstração: o envelope seria criado na Clicksign com o hash acima. Configure o Firebase para enviar de verdade.' }); return; }
    setEstado({ ocupado: 'Enviando para assinatura…' });
    try {
      const pdfPath = `tenants/${tenantId}/projects/${projeto.id}/docs/${pdf.codigo}-${pdf.sha256.slice(0, 12)}.pdf`;
      await uploadBytes(ref(storage(), pdfPath), pdf.blob, { contentType: 'application/pdf' });
      const contractId = await adicionarDoc(tenantId, `projects/${projeto.id}/contracts`, {
        projectId: projeto.id, titulo: `Contrato ${pdf.codigo}`, template: modelo, variaveis: Object.fromEntries(Object.entries(ctx).map(([k, v]) => [k, String(v ?? '')])), status: 'rascunho', criadoEm: new Date().toISOString(),
      });
      const pedido: Omit<PedidoAssinatura, 'tenantId'> = { projectId: projeto.id, contractId, provedor: 'clicksign', pdfPath, sha256: pdf.sha256, signatarios: signatarios() };
      await httpsCallable(functions(), 'solicitarAssinatura')(pedido);
      setEstado({ ok: 'Contrato enviado. Os signatários receberão o link por e-mail; o status é atualizado automaticamente.' });
    } catch (e) {
      setEstado({ erro: `Falha ao enviar para assinatura: ${e instanceof Error ? e.message : 'erro desconhecido'}` });
    }
  };

  const podeEditar = pode(role, 'contrato.editar');
  return (
    <>
      <PageHeader titulo="Contratos & PDF" descricao="Modelo com variáveis dinâmicas e cláusulas condicionais; PDF vetorial com hash SHA-256 para assinatura digital.">
        <Button variant="outline" onClick={() => void gerar()} disabled={!estimativa || !projeto || !!estado.ocupado}><Download className="h-4 w-4" />Gerar PDF</Button>
        <Button onClick={() => void enviarAssinatura()} disabled={!pdf || !!estado.ocupado || !pode(role, 'contrato.assinar') && role !== 'coordenador'}><FileSignature className="h-4 w-4" />Enviar para assinatura</Button>
      </PageHeader>

      {!estimativa && <p className="mb-4 rounded-md border bg-muted/40 p-3 text-sm">Falta a estimativa de obra deste projeto: calcule o <Link href="/orcamento/" className="font-medium text-primary underline-offset-2 hover:underline">orçamento CUB</Link> (edificações) ou o <Link href="/quantitativos/" className="font-medium text-primary underline-offset-2 hover:underline">orçamento analítico</Link> (infraestrutura, saneamento, BIM). Ela alimenta a memória de cálculo e o cronograma do PDF.</p>}
      {estado.ocupado && <p role="status" className="mb-4 text-sm text-muted-foreground">{estado.ocupado}</p>}
      {estado.erro && <p role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{estado.erro}</p>}
      {estado.ok && <p role="status" className="mb-4 rounded-md border border-success/40 bg-success/5 p-3 text-sm">{estado.ok}</p>}
      {pdf && (
        <Card className="mb-4"><CardContent className="flex flex-wrap items-center gap-3 p-4">
          <ShieldCheck className="h-5 w-5 shrink-0 text-success" />
          <div className="min-w-0 flex-1"><p className="text-sm font-medium">PDF pronto · {(pdf.blob.size / 1024).toFixed(0)} kB</p><p className="break-all font-mono text-[11px] text-muted-foreground">SHA-256 {pdf.sha256}</p></div>
          <a href={pdf.url} download={`${pdf.codigo}.pdf`} className="inline-flex h-9 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium hover:bg-accent"><Download className="h-4 w-4" />Baixar</a>
          <a href={pdf.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary underline-offset-2 hover:underline">Abrir</a>
        </CardContent></Card>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Dados do contrato</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <Field label="Projeto" className="sm:col-span-2"><Select value={projeto?.id ?? ''} onChange={(e) => setProjectId(e.target.value)}>{projetos.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.nome}</option>)}</Select></Field>
              <Field label="CPF/CNPJ do cliente"><Input value={manual.cliente_documento} onChange={(e) => setManual((m) => ({ ...m, cliente_documento: e.target.value }))} /></Field>
              <Field label="E-mail do cliente (assinatura)"><Input type="email" value={manual.cliente_email} onChange={(e) => setManual((m) => ({ ...m, cliente_email: e.target.value }))} /></Field>
              <Field label="Estimativa de obra no documento">
                <Select value={fonte} onChange={(e) => setFonte(e.target.value as 'cub' | 'analitico')}>
                  <option value="cub">CUB / NBR 12721{orcamento ? '' : ' (não calculado)'}</option>
                  <option value="analitico">Composições SINAPI/SICRO/ORSE{analitico ? '' : ' (não calculado)'}</option>
                </Select>
              </Field>
              {fonte === 'analitico' && <Field label="Prazo de obra (meses)"><Input type="number" min={1} max={120} value={prazoObra} onChange={(e) => setPrazoObra(Number(e.target.value) || 1)} /></Field>}
              <Field label="Nº da ART/RRT"><Input value={manual.numero_art_rrt} onChange={(e) => setManual((m) => ({ ...m, numero_art_rrt: e.target.value }))} /></Field>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Modelo</CardTitle><CardDescription>Clique em uma variável para inserir no cursor. Blocos <code>{'{{#se tem_estrutural}}…{{/se}}'}</code> só aparecem quando a condição é verdadeira.</CardDescription></CardHeader>
            <CardContent>
              <div className="mb-2 flex flex-wrap gap-1">
                {VARIAVEIS_DISPONIVEIS.map((v) => (
                  <button key={v.chave} type="button" title={v.descricao} disabled={!podeEditar} onClick={() => inserir(v.chave)}
                    className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10.5px] hover:bg-accent disabled:opacity-50">{v.chave}</button>
                ))}
              </div>
              <Textarea ref={editor} value={modelo} readOnly={!podeEditar} onChange={(e) => setModelo(e.target.value)} spellCheck={false} aria-label="Modelo do contrato" className="h-[520px] font-mono text-xs" />
              <Button variant="ghost" size="sm" className="mt-1" disabled={!podeEditar || modelo === MODELO_CONTRATO_PADRAO} onClick={() => { if (window.confirm('Descartar suas alterações e restaurar o modelo padrão?')) setModelo(MODELO_CONTRATO_PADRAO); }}>Restaurar modelo padrão</Button>
            </CardContent>
          </Card>
        </div>

        <Card className="xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
          <CardHeader className="flex-row items-center justify-between"><CardTitle>Pré-visualização</CardTitle>
            {render.pendentes.length > 0 ? <Badge variant="warning">{render.pendentes.length} variável(is) sem valor</Badge> : <Badge variant="success">Completo</Badge>}
          </CardHeader>
          <CardContent className="space-y-2.5 text-[13px] leading-relaxed">
            {blocos.map((b, i) => {
              const conteudo = b.trechos.map((t, j) => {
                // Variáveis pendentes ([[chave]]) ficam destacadas na prévia.
                const partes = t.texto.split(/(\[\[[\w.]+\]\])/).map((p, k) => (p.startsWith('[[') ? <mark key={k} className="rounded bg-warning/20 px-1 font-mono text-[11px] text-warning">{p.slice(2, -2)}</mark> : p));
                return t.negrito ? <strong key={j}>{partes}</strong> : <React.Fragment key={j}>{partes}</React.Fragment>;
              });
              return b.tipo === 'h1' ? <h2 key={i} className="pb-1 text-center text-sm font-bold">{conteudo}</h2> : b.tipo === 'h2' ? <h3 key={i} className="pt-2 text-[13px] font-semibold">{conteudo}</h3> : <p key={i} className="text-justify">{conteudo}</p>;
            })}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
