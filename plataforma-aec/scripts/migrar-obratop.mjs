// Migra os dados do ObraTop (organizations/{org}/…) para a plataforma (tenants/{tenant}/…).
//
//   node scripts/migrar-obratop.mjs --origem <projeto-obratop> --org <orgId> \
//        --destino <projeto-plataforma> --tenant <tenantId> [--gravar] [--sobrescrever]
//
// Sem --gravar é só uma SIMULAÇÃO: conta o que seria copiado e não escreve nada.
// A origem nunca é alterada. No destino nada é apagado; documentos que já existem são
// mantidos, a menos que se passe --sobrescrever. Os ids são preservados, então as referências
// entre registros (obra, contrato, medição…) continuam válidas e a migração pode ser repetida.
// Autenticação: `gcloud auth application-default login` com acesso aos dois projetos.
import { fileURLToPath } from 'node:url';

export const COLECOES_OBRATOP = ['works', 'measurements', 'budgets', 'activities', 'dailyLogs', 'suppliers', 'orders',
  'inventory', 'finance', 'quality', 'contracts', 'staff', 'equipment', 'safety', 'documents'];

/**
 * @param {import('firebase-admin/firestore').Firestore} origem
 * @param {import('firebase-admin/firestore').Firestore} destino
 * @param {{ org: string, tenant: string, gravar?: boolean, sobrescrever?: boolean, log?: (m: string) => void }} o
 */
export async function migrar(origem, destino, o) {
  const log = o.log ?? console.log;
  const resumo = {};
  if (!(await origem.doc(`organizations/${o.org}`).get()).exists) throw new Error(`Organização "${o.org}" não encontrada na origem.`);
  if (!(await destino.doc(`tenants/${o.tenant}`).get()).exists) throw new Error(`Empresa "${o.tenant}" não existe no destino. Crie o tenant antes de migrar.`);
  for (const col of COLECOES_OBRATOP) {
    const docs = (await origem.collection(`organizations/${o.org}/${col}`).get()).docs;
    const r = { lidos: docs.length, copiados: 0, jaExistiam: 0, excluidosLogicos: 0 };
    let lote = destino.batch(), noLote = 0;
    for (const d of docs) {
      const dados = d.data();
      if (dados.deleted) r.excluidosLogicos++; // são copiados também: preserva o histórico
      const alvo = destino.doc(`tenants/${o.tenant}/${col}/${d.id}`);
      if (!o.sobrescrever && (await alvo.get()).exists) { r.jaExistiam++; continue; }
      r.copiados++;
      if (!o.gravar) continue;
      lote.set(alvo, { ...dados, tenantId: o.tenant, migradoDe: `organizations/${o.org}/${col}/${d.id}`, migradoEm: new Date().toISOString() });
      if (++noLote === 400) { await lote.commit(); lote = destino.batch(); noLote = 0; }
    }
    if (o.gravar && noLote) await lote.commit();
    resumo[col] = r;
    log(`${col.padEnd(13)} lidos ${String(r.lidos).padStart(5)} · ${o.gravar ? 'copiados' : 'a copiar'} ${String(r.copiados).padStart(5)} · já existiam ${String(r.jaExistiam).padStart(5)}`);
  }
  return resumo;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (nome) => { const i = process.argv.indexOf(`--${nome}`); return i >= 0 ? process.argv[i + 1] : undefined; };
  const [origemId, org, destinoId, tenant] = ['origem', 'org', 'destino', 'tenant'].map(arg);
  if (!origemId || !org || !destinoId || !tenant) {
    console.error('Uso: node scripts/migrar-obratop.mjs --origem <projeto> --org <orgId> --destino <projeto> --tenant <tenantId> [--gravar] [--sobrescrever]');
    process.exit(2);
  }
  const { initializeApp, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const a = initializeApp({ credential: applicationDefault(), projectId: origemId }, 'origem');
  const b = initializeApp({ credential: applicationDefault(), projectId: destinoId }, 'destino');
  const gravar = process.argv.includes('--gravar');
  console.log(gravar ? 'GRAVANDO no destino…' : 'SIMULAÇÃO — nada será gravado (use --gravar para copiar).');
  try {
    await migrar(getFirestore(a), getFirestore(b), { org, tenant, gravar, sobrescrever: process.argv.includes('--sobrescrever') });
    console.log(gravar ? 'Migração concluída.' : 'Simulação concluída.');
  } catch (e) { console.error(`ERRO: ${e.message}`); process.exit(1); }
}
