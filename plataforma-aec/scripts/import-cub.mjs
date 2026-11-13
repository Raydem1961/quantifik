// Importa o CUB mensal (CSV normalizado) para a coleção global `cubTables/{UF}_{YYYY-MM}`.
// Uso: node scripts/import-cub.mjs <arquivo.csv> --project <id> [--dry-run]
import { readFileSync } from 'node:fs';

const CODIGOS = ['R1-B', 'R1-N', 'R1-A', 'PP-4-B', 'PP-4-N', 'R8-B', 'R8-N', 'R8-A', 'R16-N', 'R16-A', 'PIS', 'RP1Q', 'CAL-8-N', 'CAL-8-A', 'CSL-8-N', 'CSL-8-A', 'CSL-16-N', 'CSL-16-A', 'GI'];
const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
const COLUNAS = ['uf', 'competencia', 'fonte', 'desonerado', 'projeto', 'materiais', 'mao_de_obra', 'despesas_administrativas', 'equipamentos', 'total'];

const args = process.argv.slice(2);
const iProjeto = args.indexOf('--project');
const projeto = iProjeto >= 0 ? args[iProjeto + 1] : undefined;
const arquivo = args.find((a, i) => !a.startsWith('--') && (iProjeto < 0 || i !== iProjeto + 1));
const simular = args.includes('--dry-run');
if (!arquivo) { console.error('Uso: node scripts/import-cub.mjs <arquivo.csv> --project <id> [--dry-run]'); process.exit(2); }

/** Aceita "2.350,75" (pt-BR) e "2350.75". */
function numero(bruto) {
  let s = String(bruto ?? '').trim().replace(/[R$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const v = Number(s);
  return Number.isFinite(v) ? v : NaN;
}

const linhas = readFileSync(arquivo, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
const sep = linhas[0].includes(';') ? ';' : ',';
const cabecalho = linhas[0].split(sep).map((c) => c.trim().toLowerCase());
const faltando = COLUNAS.filter((c) => !cabecalho.includes(c));
if (faltando.length) { console.error(`Colunas ausentes no CSV: ${faltando.join(', ')}`); process.exit(1); }

const erros = [];
const tabelas = new Map();
linhas.slice(1).forEach((linha, i) => {
  const n = i + 2;
  const campos = linha.split(sep).map((c) => c.trim());
  const r = Object.fromEntries(cabecalho.map((c, j) => [c, campos[j] ?? '']));
  const uf = r.uf.toUpperCase();
  const cod = r.projeto.toUpperCase();
  if (!UFS.includes(uf)) return erros.push(`linha ${n}: UF inválida "${r.uf}"`);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(r.competencia)) return erros.push(`linha ${n}: competência deve ser AAAA-MM ("${r.competencia}")`);
  if (!CODIGOS.includes(cod)) return erros.push(`linha ${n}: projeto-padrão desconhecido "${r.projeto}"`);
  const v = { materiais: numero(r.materiais), maoDeObra: numero(r.mao_de_obra), despesasAdministrativas: numero(r.despesas_administrativas), equipamentos: numero(r.equipamentos), total: numero(r.total) };
  if (Object.values(v).some((x) => Number.isNaN(x) || x < 0)) return erros.push(`linha ${n}: valor numérico inválido`);
  if (!(v.total > 0)) return erros.push(`linha ${n}: total deve ser maior que zero`);
  const soma = v.materiais + v.maoDeObra + v.despesasAdministrativas + v.equipamentos;
  if (Math.abs(soma - v.total) > 0.05) return erros.push(`linha ${n}: soma das parcelas (${soma.toFixed(2)}) difere do total (${v.total.toFixed(2)})`);
  // Trava contra erro de digitação/unidade: CUB/m² fora de uma faixa plausível.
  if (v.total < 300 || v.total > 30000) return erros.push(`linha ${n}: total ${v.total} R$/m² fora da faixa plausível (300–30.000)`);
  const id = `${uf}_${r.competencia}`;
  const t = tabelas.get(id) ?? { uf, competencia: r.competencia, fonte: r.fonte, desonerado: /^(1|s|sim|true)$/i.test(r.desonerado), valores: {} };
  if (t.valores[cod]) return erros.push(`linha ${n}: ${cod} duplicado em ${id}`);
  t.valores[cod] = v;
  tabelas.set(id, t);
});

if (erros.length) {
  console.error(`Importação cancelada — ${erros.length} erro(s). Nada foi gravado.\n` + erros.map((e) => `  • ${e}`).join('\n'));
  process.exit(1);
}
for (const [id, t] of tabelas) console.log(`${id}  ${t.fonte}  ${Object.keys(t.valores).length} projetos-padrão  R1-N=${t.valores['R1-N']?.total ?? '—'}`);
if (simular) { console.log(`Simulação: ${tabelas.size} tabela(s) válidas; nada foi gravado.`); process.exit(0); }
if (!projeto) { console.error('Informe --project <id> para gravar.'); process.exit(2); }

const { initializeApp, applicationDefault } = await import('firebase-admin/app');
const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
initializeApp({ credential: applicationDefault(), projectId: projeto });
const db = getFirestore();
const lote = db.batch();
for (const [id, t] of tabelas) lote.set(db.doc(`cubTables/${id}`), { ...t, importadoEm: FieldValue.serverTimestamp() });
await lote.commit();
console.log(`${tabelas.size} tabela(s) gravadas em cubTables (projeto ${projeto}).`);
