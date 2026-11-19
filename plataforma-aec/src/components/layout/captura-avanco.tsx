'use client';
/**
 * Histórico diário de avanço (progressSnapshots/{obra}_{data}), no mesmo formato do ObraTop 3:
 * quem grava na obra registra, uma vez por dia e só quando algo mudou, o físico planejado e
 * realizado, o orçado, o pago e o medido. É o que desenha as curvas históricas do ObraTop 3.
 */
import * as React from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '@/hooks/use-auth';
import { useDados } from '@/hooks/use-dados';
import { db, MODO_DEMO } from '@/lib/firebase/client';
import { weightedProgress } from '@/lib/obratop/vendor/calc.mjs';

export const fotografiaDoAvanco = (workId: string, d: ReturnType<typeof useDados>, dia: string) => {
  const daObra = <T extends { workId?: unknown; deleted?: unknown }>(l: T[]) => l.filter((x) => x.workId === workId && !x.deleted);
  const acts = daObra(d.activities), bud = daObra(d.budgets), fin = daObra(d.finance), med = daObra(d.measurements), obra = d.works.filter((w) => w.id === workId);
  const n = (v: unknown) => Number(v) || 0;
  return {
    workId, date: dia,
    physicalPlanned: weightedProgress({ acts, budgets: bud, works: obra, day: dia, planned: true }), physicalActual: weightedProgress({ acts, budgets: bud, works: obra, day: dia }),
    budget: bud.reduce((s, x) => s + n(x.qty) * n(x.unitValue) * (1 + n(x.bdi) / 100), 0),
    paid: fin.filter((x) => x.type === 'Despesa' && x.status === 'Pago').reduce((s, x) => s + n(x.value), 0),
    measured: med.filter((x) => ['Aprovada', 'Faturada', 'Paga'].includes(String(x.status))).reduce((s, x) => s + n(x.value), 0),
  };
};

function Captura() {
  const { tenantId, usuario, funcao, obraAtribuida } = useAuth();
  const d = useDados();
  const feito = React.useRef(new Set<string>());
  React.useEffect(() => {
    if (!tenantId || !usuario || d.works.length === 0) return;
    // Espera os dados assentarem (coleções chegam em sequência) e roda fora do caminho do usuário.
    const t = setTimeout(async () => {
      const dia = new Date().toISOString().slice(0, 10);
      const ids = funcao === 'project_user' ? [obraAtribuida].filter((x): x is string => !!x) : d.works.filter((w) => !w.deleted && w.status !== 'Concluída').map((w) => w.id);
      for (const id of ids) {
        const f = fotografiaDoAvanco(id, d, dia), chave = `${id}_${dia}:${JSON.stringify(f)}`;
        if (feito.current.has(chave) || d.activities.every((a) => a.workId !== id)) continue;
        feito.current.add(chave);
        try {
          const ref = doc(db(), 'organizations', tenantId, 'progressSnapshots', `${id}_${dia}`), atual = (await getDoc(ref)).data();
          const igual = atual && (['physicalPlanned', 'physicalActual'] as const).every((k) => Math.abs((Number(atual[k]) || 0) - f[k]) < 0.01) && (['budget', 'paid', 'measured'] as const).every((k) => Math.abs((Number(atual[k]) || 0) - f[k]) < 0.005);
          if (!igual) await setDoc(ref, { ...f, capturedBy: usuario.uid, release: '4.0', updatedAt: new Date().toISOString(), deleted: false }, { merge: true });
        } catch { /* sem permissão ou sem rede: tenta de novo na próxima mudança */ }
      }
    }, 60000);
    return () => clearTimeout(t);
  }, [d, tenantId, usuario, funcao, obraAtribuida]);
  return null;
}

export function CapturaDeAvanco() {
  const { funcao } = useAuth();
  // Consulta só lê; Financeiro não altera cronograma.
  return MODO_DEMO || funcao === 'viewer' || funcao === 'finance' ? null : <Captura />;
}
