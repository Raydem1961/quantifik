'use client';
/**
 * Nova obra a partir de um modelo (mesmo catálogo do ObraTop 3): gera a obra, o orçamento
 * ilustrativo e o cronograma com predecessoras, ajustados ao porte e ao prazo informados.
 */
import * as React from 'react';
import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/form';
import { useAuth } from '@/hooks/use-auth';
import { gravarEmLote } from '@/hooks/use-colecao';
import { auditar } from '@/lib/auditoria';
import { brl, dataBr } from '@/lib/format';
import { buildProject, FAMILIES, validateWizard } from '@/lib/obratop/vendor/templates.mjs';

const novoId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
const hoje = () => new Date().toISOString().slice(0, 10);
const somaMeses = (iso: string, m: number) => { const d = new Date(`${iso}T12:00:00`); d.setMonth(d.getMonth() + m); return d.toISOString().slice(0, 10); };

export function AssistenteObra({ nomesExistentes, onFechar, onCriada }: { nomesExistentes: string[]; onFechar: () => void; onCriada: (id: string, texto: string) => void }) {
  const { tenantId, tenant, usuario } = useAuth();
  const [w, setW] = React.useState({ name: '', client: '', address: '', engineer: tenant?.contato.engenheiroPadrao ?? '', start: hoje(), end: somaMeses(hoje(), 8), family: 'BUILD', base: '300', bdi: '25', cf: '1', baseline: true });
  const [erro, setErro] = React.useState('');
  const [criando, setCriando] = React.useState(false);
  const set = <K extends keyof typeof w>(k: K, v: (typeof w)[K]) => setW((x) => ({ ...x, [k]: v }));
  const num = (v: string) => Number(v.replace(/\./g, '').replace(',', '.'));
  const params = { ...w, base: num(w.base), bdi: num(w.bdi), cf: num(w.cf) };
  const validacao = validateWizard(params, nomesExistentes);
  const previa = React.useMemo(() => {
    if (w.family === 'BLANK' || validacao) return null;
    try { return { p: buildProject({ family: w.family, base: params.base, start: w.start, end: w.end, bdi: params.bdi, cf: params.cf }), erro: '' }; }
    catch (e) { return { p: null, erro: e instanceof Error ? e.message : 'Modelo inválido.' }; }
  }, [w.family, w.base, w.start, w.end, w.bdi, w.cf, validacao]); // eslint-disable-line react-hooks/exhaustive-deps -- params deriva de w

  const criar = async () => {
    if (!tenantId) return;
    if (validacao) { setErro(validacao); return; }
    if (previa?.erro) { setErro(previa.erro); return; }
    setCriando(true); setErro('');
    const agora = new Date().toISOString(), quem = usuario?.uid ?? '', meta = { createdAt: agora, createdBy: quem, updatedAt: agora, updatedBy: quem, deleted: false };
    const p = previa?.p ?? null, workId = novoId();
    const obra = { name: w.name.trim(), client: w.client.trim(), address: w.address.trim(), engineer: w.engineer.trim(), start: p ? p.start : w.start, end: p ? p.end : w.end, value: p ? p.value : 0, status: 'Planejamento', progress: 0,
      templateFamily: p ? w.family : '', templateNote: p ? 'Gerada pelo assistente com valores ilustrativos de referência' : '' };
    try {
      await gravarEmLote(tenantId, [{ caminho: `works/${workId}`, dados: { ...obra, ...meta } }]);
      if (p) {
        const ids = p.tasks.map(() => ({ b: novoId(), a: novoId() }));
        await gravarEmLote(tenantId, p.tasks.flatMap((t, i) => [
          { caminho: `budgets/${ids[i]!.b}`, dados: { workId, category: t.category, description: t.name, unit: t.unit, qty: t.qty, unitValue: t.unitValue, bdi: params.bdi, templateKey: t.key, ...meta } },
          { caminho: `activities/${ids[i]!.a}`, dados: { workId, wbs: t.wbs, name: t.name, start: t.start, end: t.end, durationDays: t.durationDays, progressMode: 'Percentual', progress: 0, plannedQty: t.qty, actualQty: 0, unit: t.unit, predecessors: t.pred, responsible: '', budgetId: ids[i]!.b, status: 'Não iniciada', templateKey: t.key, ...meta } },
        ]));
        if (w.baseline) {
          const items = Object.fromEntries(p.tasks.map((t, i) => [ids[i]!.a, { s: t.start, e: t.end, w: t.sale }]));
          await gravarEmLote(tenantId, [{ caminho: `works/${workId}`, dados: { ...obra, ...meta, baseline: { revision: 1, date: hoje(), reason: 'Linha de base inicial (assistente de nova obra)', byEmail: usuario?.email ?? '', items }, baselineHistory: [] } }]);
        }
      }
      void auditar(tenantId, usuario, 'create', 'works', workId, undefined, { ...obra, assistente: true, atividades: p?.tasks.length ?? 0 });
      onCriada(workId, p ? `Obra criada com ${p.tasks.length} atividades e ${p.tasks.length} itens de orçamento (valores ilustrativos: ajuste ao seu orçamento real).` : 'Obra criada.');
    } catch { setErro('Não foi possível criar a obra. Verifique a conexão e a sua permissão.'); setCriando(false); }
  };

  return (
    <Card className="mb-4 border-primary/40">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div><CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />Nova obra por modelo</CardTitle>
          <CardDescription className="mt-1">Gera cronograma com predecessoras e orçamento de referência a partir do porte e do prazo. Os valores são ordens de grandeza: ajuste ao seu orçamento real.</CardDescription></div>
        <Button size="icon" variant="ghost" aria-label="Fechar assistente" onClick={onFechar}><X className="h-4 w-4" /></Button>
      </CardHeader>
      <CardContent>
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => { e.preventDefault(); void criar(); }}>
          <Field label="Nome da obra *" className="sm:col-span-2"><Input maxLength={180} value={w.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Cliente *"><Input value={w.client} onChange={(e) => set('client', e.target.value)} /></Field>
          <Field label="Engº responsável"><Input value={w.engineer} onChange={(e) => set('engineer', e.target.value)} /></Field>
          <Field label="Endereço" className="sm:col-span-2"><Input value={w.address} onChange={(e) => set('address', e.target.value)} /></Field>
          <Field label="Início *"><Input type="date" value={w.start} onChange={(e) => set('start', e.target.value)} /></Field>
          <Field label="Término *"><Input type="date" value={w.end} onChange={(e) => set('end', e.target.value)} /></Field>
          <Field label="Modelo" className="sm:col-span-2"><Select value={w.family} onChange={(e) => set('family', e.target.value)}>{Object.values(FAMILIES).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}<option value="BLANK">Obra em branco (sem cronograma)</option></Select></Field>
          {w.family !== 'BLANK' && <>
            <Field label={FAMILIES[w.family]?.baseLabel ?? 'Porte'}><Input inputMode="decimal" value={w.base} onChange={(e) => set('base', e.target.value)} /></Field>
            <Field label="BDI (%)"><Input inputMode="decimal" value={w.bdi} onChange={(e) => set('bdi', e.target.value)} /></Field>
            <Field label="Fator de custo (região/padrão)"><Input inputMode="decimal" value={w.cf} onChange={(e) => set('cf', e.target.value)} /></Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={w.baseline} onChange={(e) => set('baseline', e.target.checked)} />Congelar a linha de base</label>
          </>}
          {previa?.p && (
            <div className="rounded-xl border bg-muted/30 p-3 sm:col-span-2 lg:col-span-4">
              <p className="text-sm font-medium">{previa.p.tasks.length} atividades · orçamento de referência {brl(previa.p.budgetTotal)} · {dataBr(previa.p.start)} a {dataBr(previa.p.end)}</p>
              <ul className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">{previa.p.phaseSummary.map((f) => <li key={f.phase}><b className="text-foreground">{f.phase} {f.name}</b> — {f.tasks} atividades, {dataBr(f.start)} a {dataBr(f.end)}, {brl(f.sale, 0)}</li>)}</ul>
            </div>
          )}
          {(erro || validacao || previa?.erro) && <p role="alert" className="text-xs text-destructive sm:col-span-2 lg:col-span-4">{erro || previa?.erro || (w.name ? validacao : '')}</p>}
          <div className="flex gap-2 sm:col-span-2 lg:col-span-4"><Button type="submit" disabled={criando || !!validacao}>{criando ? 'Criando…' : 'Criar obra'}</Button><Button variant="ghost" onClick={onFechar}>Cancelar</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}
