'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, Field, Input, Select, Textarea } from '@/components/ui/form';
import { useAuth } from '@/hooks/use-auth';
import { adicionarDoc } from '@/hooks/use-colecao';
import { gerarEscopo, PROGRAMA_POR_TIPOLOGIA, type BriefingInput, type EscopoTecnico, type Topografia } from '@/lib/briefing/scope';
import { num } from '@/lib/format';
import { pode } from '@/lib/rbac';
import { DISCIPLINA_LABEL, TIPOLOGIA_LABEL, TIPOLOGIAS_INFRA, UFS, type Tipologia, type UF } from '@/lib/types';

const TIPOLOGIAS = Object.keys(TIPOLOGIA_LABEL) as Tipologia[];
const n = (s: string) => { const v = Number(s.replace(',', '.')); return Number.isFinite(v) ? v : 0; };

export default function Briefing() {
  const router = useRouter();
  const { tenantId, role } = useAuth();
  const [id, setId] = React.useState({ nome: '', cliente: '', municipio: '', uf: 'BA' as UF });
  const [b, setB] = React.useState<BriefingInput>({
    tipologia: 'residencial', areaTerrenoM2: 600, areaPretendidaM2: 380, pavimentos: 2, taxaOcupacaoMax: 0.5, coeficienteAproveitamentoMax: 1.5,
    topografia: 'plano', desnivelM: 0, prazoDesejadoMeses: 5, programa: { suites: 3, vagas: 2 }, observacoes: '',
  });
  const [estado, setEstado] = React.useState<{ salvando?: boolean; erro?: string }>({});
  const set = <K extends keyof BriefingInput>(k: K, v: BriefingInput[K]) => setB((x) => ({ ...x, [k]: v }));

  const escopo = React.useMemo((): EscopoTecnico | { erro: string } => {
    try { return gerarEscopo(b); } catch (e) { return { erro: e instanceof Error ? e.message : 'Dados insuficientes.' }; }
  }, [b]);
  const infra = TIPOLOGIAS_INFRA.includes(b.tipologia);

  const salvar = async () => {
    if (!tenantId || 'erro' in escopo) return;
    if (!id.nome.trim() || !id.cliente.trim()) { setEstado({ erro: 'Informe o nome do projeto e do cliente.' }); return; }
    setEstado({ salvando: true });
    try {
      const hoje = new Date();
      const fim = new Date(hoje); fim.setMonth(fim.getMonth() + Math.max(b.prazoDesejadoMeses, escopo.prazoSugeridoMeses));
      const projectId = await adicionarDoc(tenantId, 'projects', {
        codigo: `${b.tipologia.slice(0, 3).toUpperCase()}-${String(hoje.getTime()).slice(-4)}`, nome: id.nome.trim(), clientId: '', clienteNome: id.cliente.trim(),
        tipologia: b.tipologia, status: 'briefing', uf: id.uf, municipio: id.municipio.trim(), disciplinas: escopo.disciplinas, areaConstruidaM2: infra ? 0 : b.areaPretendidaM2,
        valorContratado: 0, inicio: hoje.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10), progresso: 0, clienteUids: [],
      });
      await adicionarDoc(tenantId, `projects/${projectId}/briefings`, { ...b, escopo, criadoEm: hoje.toISOString() });
      router.push('/dashboard/');
    } catch {
      setEstado({ erro: 'Não foi possível salvar o briefing. Seus dados continuam nesta tela — tente novamente.' });
    }
  };

  return (
    <>
      <PageHeader titulo="Briefing paramétrico" descricao="O programa de necessidades e as restrições do terreno viram escopo técnico e lista de entregáveis.">
        {pode(role, 'projeto.editar') && <Button onClick={() => void salvar()} disabled={estado.salvando || 'erro' in escopo}>{estado.salvando ? 'Salvando…' : 'Criar projeto'}</Button>}
      </PageHeader>
      {estado.erro && <p role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{estado.erro}</p>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Identificação</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome do projeto"><Input value={id.nome} onChange={(e) => setId({ ...id, nome: e.target.value })} /></Field>
              <Field label="Cliente"><Input value={id.cliente} onChange={(e) => setId({ ...id, cliente: e.target.value })} /></Field>
              <Field label="Município"><Input value={id.municipio} onChange={(e) => setId({ ...id, municipio: e.target.value })} /></Field>
              <Field label="UF"><Select value={id.uf} onChange={(e) => setId({ ...id, uf: e.target.value as UF })}>{UFS.map((u) => <option key={u}>{u}</option>)}</Select></Field>
              <Field label="Tipologia" className="sm:col-span-2">
                <Select value={b.tipologia} onChange={(e) => setB((x) => ({ ...x, tipologia: e.target.value as Tipologia, programa: {} }))}>
                  {TIPOLOGIAS.map((t) => <option key={t} value={t}>{TIPOLOGIA_LABEL[t]}</option>)}
                </Select>
              </Field>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Terreno e restrições legais</CardTitle><CardDescription>Parâmetros da lei de uso e ocupação do solo do município.</CardDescription></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <Field label={infra ? 'Área da gleba / faixa (m²)' : 'Área do terreno (m²)'}><Input type="number" min={0} value={b.areaTerrenoM2} onChange={(e) => set('areaTerrenoM2', n(e.target.value))} /></Field>
              {!infra && <Field label="Área pretendida (m²)"><Input type="number" min={0} value={b.areaPretendidaM2} onChange={(e) => set('areaPretendidaM2', n(e.target.value))} /></Field>}
              {!infra && <Field label="Pavimentos"><Input type="number" min={1} value={b.pavimentos} onChange={(e) => set('pavimentos', n(e.target.value))} /></Field>}
              {!infra && <Field label="Taxa de ocupação máx. (%)"><Input type="number" min={0} max={100} value={+(b.taxaOcupacaoMax * 100).toFixed(2)} onChange={(e) => set('taxaOcupacaoMax', n(e.target.value) / 100)} /></Field>}
              {!infra && <Field label="Coef. de aproveitamento máx."><Input type="number" min={0} step="0.1" value={b.coeficienteAproveitamentoMax} onChange={(e) => set('coeficienteAproveitamentoMax', n(e.target.value))} /></Field>}
              <Field label="Topografia"><Select value={b.topografia} onChange={(e) => set('topografia', e.target.value as Topografia)}><option value="plano">Plano</option><option value="aclive">Aclive</option><option value="declive">Declive</option><option value="acidentado">Acidentado</option></Select></Field>
              <Field label="Desnível (m)"><Input type="number" min={0} step="0.5" value={b.desnivelM ?? 0} onChange={(e) => set('desnivelM', n(e.target.value))} /></Field>
              <Field label="Prazo desejado (meses)"><Input type="number" min={1} value={b.prazoDesejadoMeses} onChange={(e) => set('prazoDesejadoMeses', n(e.target.value))} /></Field>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Programa de necessidades</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                {PROGRAMA_POR_TIPOLOGIA[b.tipologia].map((c) => (
                  <Field key={c.chave} label={c.unidade ? `${c.label} (${c.unidade})` : c.label}><Input type="number" min={0} value={b.programa[c.chave] ?? 0} onChange={(e) => set('programa', { ...b.programa, [c.chave]: n(e.target.value) })} /></Field>
                ))}
              </div>
              <Field label="Observações e expectativas do cliente"><Textarea className="min-h-[80px]" value={b.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></Field>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {'erro' in escopo ? <Card><CardContent className="p-5 text-sm text-muted-foreground">{escopo.erro}</CardContent></Card> : (
            <>
              <Card>
                <CardHeader><CardTitle>Escopo técnico</CardTitle><CardDescription>{escopo.resumo}</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">{escopo.disciplinas.map((d) => <Badge key={d} variant="primary">{DISCIPLINA_LABEL[d]}</Badge>)}<Badge variant="outline">Prazo sugerido: {escopo.prazoSugeridoMeses} meses</Badge></div>
                  {escopo.verificacoes.map((v) => (
                    <div key={v.parametro} className="flex items-center gap-2 text-sm">
                      {v.conforme ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : <XCircle className="h-4 w-4 shrink-0 text-destructive" />}
                      <span className="flex-1">{v.parametro}</span>
                      <span className="tabular text-xs text-muted-foreground">{num(v.projetado, 1)} de {num(v.permitido, 1)} {v.unidade} — {v.conforme ? 'conforme' : 'excede'}</span>
                    </div>
                  ))}
                  {escopo.alertas.map((a) => <p key={a} className="flex gap-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{a}</p>)}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Entregáveis iniciais</CardTitle><CardDescription>{escopo.entregaveis.length} itens · etapas conforme NBR 16636.</CardDescription></CardHeader>
                <CardContent>
                  {escopo.disciplinas.map((d) => (
                    <div key={d} className="mb-3 last:mb-0"><p className="mb-1 text-xs font-semibold">{DISCIPLINA_LABEL[d]}</p>
                      <ul className="space-y-1">{escopo.entregaveis.filter((e) => e.disciplina === d).map((e) => <li key={e.descricao} className="flex gap-2 text-sm"><Badge variant="outline" className="h-5 shrink-0 font-mono">{e.etapa}</Badge>{e.descricao}</li>)}</ul></div>
                  ))}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}
