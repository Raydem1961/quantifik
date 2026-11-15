// Monta as regras de segurança: as do ObraTop (base, sem alteração) + a extensão dos módulos novos.
// A extensão entra DENTRO do bloco `match /organizations/{orgId}`, para usar as mesmas funções de
// membro e proprietário do ObraTop. Reaplicar é seguro: a extensão anterior é removida antes.
//
//   node scripts/gerar-regras.mjs            → regenera firestore.rules e storage.rules do repositório
//   estender(regrasNoAr, …)                  → usado pelo instalador sobre as regras que estão no ar
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
export const INICIO = '// >>> EXTENSÃO ObraTop 4 (gerada — não edite aqui)';
export const FIM = '// <<< EXTENSÃO ObraTop 4';

/** Posição da chave que fecha o bloco aberto em `abre` (ignora strings e comentários). */
function fechamento(texto, abre) {
  let nivel = 0, emString = null;
  for (let k = abre; k < texto.length; k++) {
    const c = texto[k];
    if (emString) { if (c === '\\') k++; else if (c === emString) emString = null; continue; }
    if (c === "'" || c === '"') emString = c;
    else if (c === '/' && texto[k + 1] === '/') { k = texto.indexOf('\n', k); if (k < 0) break; }
    else if (c === '{') nivel++;
    else if (c === '}' && --nivel === 0) return k;
  }
  throw new Error('Regras com chaves desbalanceadas.');
}
function inserirAntesDoFim(texto, cabecalhoRe, bloco, recuo) {
  const m = cabecalhoRe.exec(texto);
  if (!m) return null;
  const fim = fechamento(texto, texto.indexOf('{', m.index + m[0].length - 1));
  const inicioLinha = texto.lastIndexOf('\n', fim) + 1;
  return `${texto.slice(0, inicioLinha)}${recuo}${INICIO}\n${bloco.replace(/\s+$/, '')}\n${recuo}${FIM}\n${texto.slice(inicioLinha)}`;
}
/** Remove extensões aplicadas antes (reinstalação). */
export function limpar(texto) {
  let t = texto;
  for (;;) {
    const a = t.indexOf(INICIO);
    if (a < 0) return t;
    const b = t.indexOf(FIM, a);
    if (b < 0) throw new Error('Extensão anterior incompleta nas regras.');
    t = t.slice(0, t.lastIndexOf('\n', a) + 1) + t.slice(t.indexOf('\n', b) + 1);
  }
}

/** Regras do Firestore: base + extensão no nível raiz + extensão dentro de cada organização. */
export function estenderFirestore(base, extRaiz, extOrg) {
  const limpo = limpar(base);
  const comOrg = inserirAntesDoFim(limpo, /match\s+\/organizations\/\{orgId\}\s*\{/, extOrg, '      ');
  if (comOrg === null) throw new Error('As regras não têm o bloco "match /organizations/{orgId}" do ObraTop.');
  const final = inserirAntesDoFim(comOrg, /match\s+\/databases\/\{database\}\/documents\s*\{/, extRaiz, '    ');
  if (final === null) throw new Error('Regras do Firestore sem o bloco de documentos.');
  return final;
}
export function estenderStorage(base, ext) {
  const final = inserirAntesDoFim(limpar(base), /match\s+\/b\/\{bucket\}\/o\s*\{/, ext, '    ');
  if (final === null) throw new Error('Regras do Storage sem o bloco do bucket.');
  return final;
}

const ler = (f) => readFileSync(join(raiz, 'regras', f), 'utf8');
export const extensoes = () => ({ raiz: ler('extensao-raiz.firestore.rules'), org: ler('extensao-org.firestore.rules'), storage: ler('extensao.storage.rules') });
export const bases = () => ({ firestore: ler('obratop-base.firestore.rules'), storage: ler('obratop-base.storage.rules') });

/**
 * Regras a publicar a partir do que está NO AR. Se o projeto já tem o ObraTop, as regras dele são
 * a base (exatamente como estão no ar); em projeto novo, usa a cópia das regras do ObraTop 3.39.13.
 */
export function regrasParaPublicar(noArFirestore, noArStorage) {
  const e = extensoes(), b = bases();
  const temObraTop = (t) => /match\s+\/organizations\/\{orgId\}/.test(t ?? '');
  return {
    firestore: estenderFirestore(temObraTop(noArFirestore) ? noArFirestore : b.firestore, e.raiz, e.org),
    storage: estenderStorage(temObraTop(noArStorage) ? noArStorage : b.storage, e.storage),
    baseDoFirestore: temObraTop(noArFirestore) ? 'no ar' : 'cópia do ObraTop 3.39.13',
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = regrasParaPublicar('', '');
  writeFileSync(join(raiz, 'firestore.rules'), r.firestore);
  writeFileSync(join(raiz, 'storage.rules'), r.storage);
  console.log('firestore.rules e storage.rules regenerados (base do ObraTop + extensão).');
}
