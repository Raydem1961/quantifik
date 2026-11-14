// Junta as regras de segurança da plataforma com as de OUTRO aplicativo que já usa o mesmo
// projeto Firebase (ex.: o ObraTop), para que publicar a plataforma não derrube o outro app.
// Um projeto Firebase tem um único arquivo de regras do Firestore e um do Storage; publicar o
// da plataforma sozinho apagaria as regras do aplicativo que já está no ar.
//
//   node scripts/mesclar-regras.mjs <pasta-do-outro-app> [pasta-de-saida]
//
// Gera firestore.rules e storage.rules combinados na pasta de saída (padrão: .regras-mescladas).
// Falha, sem gerar nada, se os dois arquivos definirem a mesma função ou o mesmo caminho.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Devolve o miolo do bloco `match <raiz> { … }` e o cabeçalho que o antecede. */
function miolo(texto, raiz, arquivo) {
  const i = texto.indexOf(raiz);
  if (i < 0) throw new Error(`${arquivo}: bloco "${raiz}" não encontrado.`);
  const abre = texto.indexOf('{', i + raiz.length - 1);
  let nivel = 0, emString = null, k = abre;
  for (; k < texto.length; k++) {
    const c = texto[k];
    if (emString) { if (c === '\\') k++; else if (c === emString) emString = null; continue; }
    if (c === "'" || c === '"') emString = c;
    else if (c === '/' && texto[k + 1] === '/') { k = texto.indexOf('\n', k); if (k < 0) break; }
    else if (c === '{') nivel++;
    else if (c === '}' && --nivel === 0) break;
  }
  if (nivel !== 0) throw new Error(`${arquivo}: chaves desbalanceadas.`);
  return { cabecalho: texto.slice(0, abre + 1), corpo: texto.slice(abre + 1, k) };
}

/** Nomes de funções e caminhos `match` declarados no nível mais externo do miolo. */
function declaracoes(corpo) {
  const funcoes = new Set(), caminhos = new Set();
  let nivel = 0;
  for (const linha of corpo.split('\n')) {
    const semComentario = linha.replace(/\/\/.*$/, '');
    if (nivel === 0) {
      const f = /^\s*function\s+(\w+)\s*\(/.exec(semComentario);
      if (f) funcoes.add(f[1]);
      const m = /^\s*match\s+(\S+)/.exec(semComentario);
      if (m) caminhos.add(m[1].replace(/\{[^}=]+(=\*\*)?\}/g, (_, rec) => (rec ? '{**}' : '{}')));
    }
    for (const c of semComentario) { if (c === '{') nivel++; else if (c === '}') nivel--; }
  }
  return { funcoes, caminhos };
}

export function mesclar(plataforma, outro, raiz, nomes = ['plataforma', 'outro aplicativo']) {
  const a = miolo(plataforma, raiz, nomes[0]);
  const b = miolo(outro, raiz, nomes[1]);
  const da = declaracoes(a.corpo), db = declaracoes(b.corpo);
  const conflitos = [
    ...[...da.funcoes].filter((f) => db.funcoes.has(f)).map((f) => `função ${f}()`),
    ...[...da.caminhos].filter((c) => db.caminhos.has(c)).map((c) => `caminho ${c}`),
  ];
  if (conflitos.length) throw new Error(`Não é seguro mesclar: os dois arquivos definem ${conflitos.join(', ')}. Use um projeto Firebase separado ou renomeie.`);
  return `${a.cabecalho}\n    // ═══════════ ${nomes[1]} (regras originais, sem alteração) ═══════════${b.corpo.replace(/\s+$/, '')}\n\n    // ═══════════ ${nomes[0]} ═══════════${a.corpo.replace(/\s+$/, '')}\n  }\n}\n`;
}

export const MARCA_OUTRO = '═══════════ Aplicativo já publicado (regras originais, sem alteração) ═══════════';
export const MARCA_PLATAFORMA = '═══════════ Plataforma AEC ═══════════';

/**
 * Decide o que publicar a partir das regras que estão NO AR no projeto.
 *  • projeto sem regras, ou só com as da plataforma → regras da plataforma;
 *  • regras de outro aplicativo → mescla;
 *  • regras já mescladas numa instalação anterior → separa a parte do outro aplicativo e
 *    mescla de novo com a versão atual da plataforma (reinstalar não duplica nada).
 */
export function combinarComAoVivo(plataforma, aoVivo, raiz) {
  const vivo = (aoVivo ?? '').trim();
  if (!vivo) return { regras: plataforma, modo: 'novo' };
  const iOutro = vivo.indexOf(MARCA_OUTRO), iPlat = vivo.indexOf(MARCA_PLATAFORMA);
  let outro = vivo;
  if (iOutro >= 0 && iPlat > iOutro) {
    const { cabecalho } = miolo(vivo, raiz, 'regras no ar');
    outro = `${cabecalho}${vivo.slice(iOutro + MARCA_OUTRO.length, vivo.lastIndexOf('//', iPlat))}\n  }\n}\n`;
  } else {
    // Só as regras da plataforma (instalação anterior em projeto novo): nada a mesclar.
    const a = declaracoes(miolo(plataforma, raiz, 'plataforma').corpo), b = declaracoes(miolo(vivo, raiz, 'regras no ar').corpo);
    if ([...b.caminhos].every((c) => a.caminhos.has(c)) && [...b.funcoes].every((f) => a.funcoes.has(f))) return { regras: plataforma, modo: 'novo' };
  }
  return { regras: mesclar(plataforma, outro, raiz, ['Plataforma AEC', 'Aplicativo já publicado']), modo: 'compartilhado' };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const raizProjeto = join(dirname(fileURLToPath(import.meta.url)), '..');
  const outroDir = process.argv[2] && resolve(process.argv[2]);
  const saida = resolve(process.argv[3] ?? join(raizProjeto, '.regras-mescladas'));
  if (!outroDir) { console.error('Uso: node scripts/mesclar-regras.mjs <pasta-do-outro-app> [pasta-de-saida]'); process.exit(2); }
  try {
    const pares = [['firestore.rules', 'match /databases/{database}/documents'], ['storage.rules', 'match /b/{bucket}/o']];
    const gerados = pares.map(([arquivo, raiz]) => {
      const doOutro = join(outroDir, arquivo);
      if (!existsSync(doOutro)) throw new Error(`${doOutro} não existe. Informe a pasta que contém as regras do aplicativo já publicado.`);
      return [arquivo, mesclar(readFileSync(join(raizProjeto, arquivo), 'utf8'), readFileSync(doOutro, 'utf8'), raiz, ['Plataforma AEC', 'Aplicativo já publicado'])];
    });
    mkdirSync(saida, { recursive: true });
    for (const [arquivo, conteudo] of gerados) writeFileSync(join(saida, arquivo), conteudo);
    console.log(`Regras mescladas em ${saida} (firestore.rules e storage.rules).`);
  } catch (e) { console.error(`ERRO: ${e.message}`); process.exit(1); }
}
