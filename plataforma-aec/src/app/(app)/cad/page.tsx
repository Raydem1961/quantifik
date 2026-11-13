'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FileUp, Layers } from 'lucide-react';
import { ref, uploadBytesResumable } from 'firebase/storage';
import { DxfViewer, type Marcacao } from '@/components/cad/dxf-viewer';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, Field, Select } from '@/components/ui/form';
import { useAuth } from '@/hooks/use-auth';
import { adicionarDoc, useColecao } from '@/hooks/use-colecao';
import { parseCivil3d, type VolumesTerraplenagem } from '@/lib/cad/civil3d';
import { extrairQto, mapearCamadasParaAreas, parseDxf, type DxfDocument, type QtoResultado, type UnidadeDesenho } from '@/lib/cad/dxf-qto';
import { COEFICIENTES_NBR12721, type AreaInput, type TipoArea } from '@/lib/cub/engine';
import { DEMO_DXF } from '@/lib/demo-data';
import { MODO_DEMO, storage } from '@/lib/firebase/client';
import { dataBr, num } from '@/lib/format';
import { pode } from '@/lib/rbac';
import { DISCIPLINA_LABEL, type CadFile, type Disciplina, type Project } from '@/lib/types';

const DISCIPLINAS = Object.keys(DISCIPLINA_LABEL) as Disciplina[];

export default function Cad() {
  const router = useRouter();
  const { tenantId, usuario, role } = useAuth();
  const { dados: projetos } = useColecao<Project>('projects');
  const [projectId, setProjectId] = React.useState('');
  const projeto = projetos.find((p) => p.id === projectId) ?? projetos[0];
  const { dados: arquivos } = useColecao<CadFile>(projeto ? `projects/${projeto.id}/files` : null);
  const [disciplina, setDisciplina] = React.useState<Disciplina>('arquitetonico');
  const [nome, setNome] = React.useState('planta-exemplo.dxf');
  const [texto, setTexto] = React.useState<string | null>(MODO_DEMO ? DEMO_DXF : null);
  const [unidade, setUnidade] = React.useState<UnidadeDesenho | 'auto'>('auto');
  const [volumes, setVolumes] = React.useState<VolumesTerraplenagem | null>(null);
  const [marcacoes, setMarcacoes] = React.useState<Marcacao[]>([]);
  const [status, setStatus] = React.useState<{ tipo: 'info' | 'erro'; msg: string }>();
  const [progresso, setProgresso] = React.useState<number | null>(null);

  const analise = React.useMemo((): { doc: DxfDocument; qto: QtoResultado } | { erro: string } | null => {
    if (!texto) return null;
    try {
      const doc = parseDxf(texto);
      return { doc, qto: extrairQto(doc, unidade === 'auto' ? {} : { unidade }) };
    } catch (e) { return { erro: e instanceof Error ? e.message : 'Falha ao ler o DXF.' }; }
  }, [texto, unidade]);

  const receber = async (arquivo: File) => {
    setStatus(undefined); setVolumes(null);
    const ext = arquivo.name.split('.').pop()?.toLowerCase() ?? '';
    if (!['dxf', 'dwg', 'csv', 'xml'].includes(ext)) { setStatus({ tipo: 'erro', msg: 'Formato não suportado. Envie .dwg, .dxf, .csv ou .xml.' }); return; }
    setNome(arquivo.name);
    // Pré-visualização local imediata (o processamento oficial é refeito no servidor após o upload).
    try {
      if (ext === 'dxf') { setTexto(await arquivo.text()); setMarcacoes([]); }
      else if (ext === 'csv' || ext === 'xml') setVolumes(parseCivil3d(arquivo.name, await arquivo.text()));
      else setStatus({ tipo: 'info', msg: 'DWG é binário: será armazenado e convertido no servidor (APS). Para pré-visualizar aqui, exporte em DXF.' });
    } catch (e) { setStatus({ tipo: 'erro', msg: e instanceof Error ? e.message : 'Arquivo inválido.' }); return; }

    if (MODO_DEMO || !tenantId || !projeto || !usuario) {
      if (MODO_DEMO && ext !== 'dwg') setStatus({ tipo: 'info', msg: 'Modo demonstração: arquivo analisado localmente, sem upload.' });
      return;
    }
    // Nome único → objeto imutável; a revisão (R00, R01…) é atribuída pela Cloud Function.
    const caminho = `tenants/${tenantId}/projects/${projeto.id}/cad/${disciplina}/${Date.now()}__${arquivo.name.replace(/[^\w.\-]+/g, '_')}`;
    const tarefa = uploadBytesResumable(ref(storage(), caminho), arquivo, { customMetadata: { uid: usuario.uid } });
    tarefa.on('state_changed',
      (s) => setProgresso(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0),
      () => { setProgresso(null); setStatus({ tipo: 'erro', msg: 'Falha no upload. Verifique a conexão e sua permissão no projeto.' }); },
      () => { setProgresso(null); setStatus({ tipo: 'info', msg: 'Upload concluído. A nova revisão aparecerá na lista em instantes.' }); });
  };

  const salvarMarcacao = (pontos: { x: number; y: number }[]) => {
    const m: Marcacao = { id: `m${Date.now()}`, pontos, cor: '#ef4444' };
    setMarcacoes((l) => [...l, m]);
    if (!MODO_DEMO && tenantId && projeto && usuario) {
      void adicionarDoc(tenantId, `projects/${projeto.id}/redlines`, { arquivo: nome, autorUid: usuario.uid, autor: usuario.nome, cor: m.cor, pontos, criadoEm: new Date().toISOString() })
        .catch(() => setStatus({ tipo: 'erro', msg: 'A marcação não foi salva no servidor.' }));
    }
  };

  const areasOrcamento = analise && 'qto' in analise ? mapearCamadasParaAreas(analise.qto) : [];
  const usarNoOrcamento = () => {
    const areas: AreaInput[] = areasOrcamento.filter((a) => a.tipo in COEFICIENTES_NBR12721).map((a) => ({ descricao: `${a.descricao} (${a.camadas.join(', ')})`, tipo: a.tipo as TipoArea, areaRealM2: Math.round(a.areaRealM2 * 100) / 100 }));
    try { sessionStorage.setItem('aec.areasQto', JSON.stringify(areas)); } catch { /* sem armazenamento */ }
    router.push('/orcamento/');
  };

  return (
    <>
      <PageHeader titulo="CAD & Quantitativos" descricao="Upload versionado de DWG/DXF e relatórios do Civil 3D, com extração automática de áreas, perímetros, blocos e volumes." />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          <Card>
            <CardContent className="flex flex-wrap items-end gap-3 p-4">
              <Field label="Projeto" className="min-w-[200px] flex-1"><Select value={projeto?.id ?? ''} onChange={(e) => setProjectId(e.target.value)}>{projetos.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.nome}</option>)}</Select></Field>
              <Field label="Disciplina" className="w-44"><Select value={disciplina} onChange={(e) => setDisciplina(e.target.value as Disciplina)}>{DISCIPLINAS.map((d) => <option key={d} value={d}>{DISCIPLINA_LABEL[d]}</option>)}</Select></Field>
              <Field label="Unidade do desenho" className="w-40"><Select value={unidade} onChange={(e) => setUnidade(e.target.value as UnidadeDesenho | 'auto')}><option value="auto">Do arquivo</option><option value="mm">Milímetros</option><option value="cm">Centímetros</option><option value="m">Metros</option></Select></Field>
              {pode(role, 'cad.enviar') && (
                <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-within:ring-2 focus-within:ring-ring">
                  <FileUp className="h-4 w-4" />Enviar arquivo
                  <input type="file" accept=".dwg,.dxf,.csv,.xml" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void receber(f); e.target.value = ''; }} />
                </label>
              )}
              {progresso !== null && <div className="h-1 w-full overflow-hidden rounded-full bg-secondary" role="progressbar" aria-label="Upload" aria-valuenow={Math.round(progresso * 100)} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-primary transition-all" style={{ width: `${progresso * 100}%` }} /></div>}
              {status && <p role={status.tipo === 'erro' ? 'alert' : 'status'} className={status.tipo === 'erro' ? 'w-full text-xs text-destructive' : 'w-full text-xs text-muted-foreground'}>{status.msg}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{nome}</CardTitle><CardDescription>Arraste para mover, use a roda do mouse para zoom. Marcações de revisão ficam vinculadas ao arquivo.</CardDescription></CardHeader>
            <CardContent>
              {!analise ? <p className="py-16 text-center text-sm text-muted-foreground">Envie um arquivo .dxf para visualizar e quantificar.</p>
                : 'erro' in analise ? <p role="alert" className="py-10 text-center text-sm text-destructive">{analise.erro}</p>
                : <DxfViewer doc={analise.doc} extensao={analise.qto.extensao} marcacoes={marcacoes} onNovaMarcacao={salvarMarcacao} onLimpar={() => setMarcacoes([])} />}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {analise && 'qto' in analise && (
            <Card>
              <CardHeader className="flex-row items-start justify-between gap-2">
                <div><CardTitle className="flex items-center gap-2"><Layers className="h-4 w-4" />Quantitativos por camada</CardTitle>
                  <CardDescription className="mt-1">Unidade: {analise.qto.unidade} ({analise.qto.unidadeOrigem}) · {analise.qto.totais.entidades} entidades</CardDescription></div>
                {areasOrcamento.length > 0 && <Button size="sm" onClick={usarNoOrcamento}>Usar no orçamento</Button>}
              </CardHeader>
              <CardContent>
                {analise.qto.avisos.map((a) => <p key={a} className="mb-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">⚠ {a}</p>)}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b text-left text-muted-foreground"><th className="py-1.5 font-medium">Camada</th><th className="py-1.5 text-right font-medium">Área (m²)</th><th className="py-1.5 text-right font-medium">Perímetro (m)</th><th className="py-1.5 text-right font-medium">Compr. (m)</th></tr></thead>
                    <tbody className="tabular divide-y">
                      {analise.qto.layers.map((l) => (
                        <tr key={l.layer}><td className="max-w-[160px] truncate py-1.5">{l.layer}</td>
                          <td className="py-1.5 text-right">{l.areaM2 || l.areaHatchM2 ? num(l.areaM2 || l.areaHatchM2) : '—'}</td>
                          <td className="py-1.5 text-right">{l.perimetroM ? num(l.perimetroM) : '—'}</td>
                          <td className="py-1.5 text-right">{l.comprimentoM ? num(l.comprimentoM) : '—'}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {analise.qto.blocos.length > 0 && (
                  <><p className="mb-1 mt-4 text-xs font-medium text-muted-foreground">Blocos</p>
                    <ul className="flex flex-wrap gap-1.5">{analise.qto.blocos.map((b) => <li key={b.bloco + b.layer}><Badge variant="outline" className="tabular">{b.bloco} × {b.quantidade}</Badge></li>)}</ul></>
                )}
                {areasOrcamento.length > 0 && (
                  <><p className="mb-1 mt-4 text-xs font-medium text-muted-foreground">Áreas reconhecidas para o orçamento (NBR 12721)</p>
                    <ul className="tabular space-y-0.5 text-xs">{areasOrcamento.map((a) => <li key={a.tipo} className="flex justify-between"><span>{a.descricao}</span><span>{num(a.areaRealM2)} m²</span></li>)}</ul></>
                )}
              </CardContent>
            </Card>
          )}

          {volumes && (
            <Card>
              <CardHeader><CardTitle>Terraplenagem — Civil 3D</CardTitle><CardDescription>{volumes.secoes.length} seção(ões) · origem {volumes.origem.toUpperCase()}</CardDescription></CardHeader>
              <CardContent>
                <dl className="tabular grid grid-cols-3 gap-2 text-center">
                  {[['Corte', volumes.corteM3], ['Aterro', volumes.aterroM3], [volumes.saldoM3 >= 0 ? 'Bota-fora' : 'Empréstimo', Math.abs(volumes.saldoM3)]].map(([r, v]) => (
                    <div key={r as string} className="rounded-md border p-2"><dt className="text-[11px] text-muted-foreground">{r}</dt><dd className="text-sm font-semibold">{num(v as number, 1)} m³</dd></div>
                  ))}
                </dl>
                {volumes.avisos.map((a) => <p key={a} className="mt-2 text-xs text-muted-foreground">{a}</p>)}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Arquivos do projeto</CardTitle><CardDescription>Cada upload gera uma nova revisão; versões anteriores são preservadas.</CardDescription></CardHeader>
            <CardContent>
              {arquivos.length === 0 ? <p className="py-4 text-center text-xs text-muted-foreground">Nenhum arquivo enviado.</p> : (
                <ul className="divide-y">
                  {[...arquivos].sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm)).map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0"><p className="truncate text-sm font-medium">{f.nome}</p><p className="text-xs text-muted-foreground">{DISCIPLINA_LABEL[f.disciplina]} · {dataBr(f.atualizadoEm)}</p></div>
                      <Badge variant="primary" className="tabular shrink-0">{f.revisaoAtual} · {f.totalRevisoes} rev.</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
