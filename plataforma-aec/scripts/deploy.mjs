// Publicação segura no Firebase (usado pelo setup-deploy.ps1 e direto no Linux/macOS/CI).
//
//   node scripts/deploy.mjs --projeto <id> (--projeto-novo | --compartilhado-com <pasta>) \
//        [--site <site-hosting>] [--alvo tudo|hosting|functions|regras] [--simular]
//
// Um projeto Firebase tem UM arquivo de regras do Firestore, UM do Storage e, por site, UM
// aplicativo publicado. Por isso é obrigatório dizer em que situação o projeto está:
//
//   --projeto-novo             o projeto é só da plataforma: publica as regras dela como estão.
//   --compartilhado-com <dir>  o projeto já tem outro aplicativo (ex.: o ObraTop). <dir> é a
//                              pasta com o firestore.rules e o storage.rules desse aplicativo.
//                              As regras são MESCLADAS e a plataforma vai para um site de
//                              Hosting próprio (--site), sem tocar no site do outro aplicativo.
//
// --simular mostra o que seria feito sem executar nada.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Monta o plano de publicação. Função pura: não executa nada (testada em tests/deploy.test.ts). */
export function planejar(o) {
  const erros = [];
  if (!/^[a-z0-9-]{4,30}$/.test(o.projeto ?? '')) erros.push('--projeto inválido ou ausente.');
  const alvo = o.alvo ?? 'tudo';
  if (!['tudo', 'hosting', 'functions', 'regras'].includes(alvo)) erros.push(`--alvo inválido: ${alvo}`);
  if (!o.projetoNovo && !o.compartilhadoCom) {
    erros.push('Informe --projeto-novo (projeto só da plataforma) ou --compartilhado-com <pasta> (projeto que já tem outro aplicativo, como o ObraTop). Sem isso o deploy poderia apagar as regras e o site de um aplicativo no ar.');
  }
  if (o.projetoNovo && o.compartilhadoCom) erros.push('Use --projeto-novo OU --compartilhado-com, não os dois.');
  const site = o.site ?? (o.compartilhadoCom ? '' : o.projeto);
  if (o.compartilhadoCom) {
    if (!site) erros.push('Em projeto compartilhado informe --site com um site de Hosting só da plataforma (ex.: --site plataforma-aec-suaempresa).');
    else if (site === o.projeto) erros.push(`--site não pode ser "${site}": esse é o site padrão do projeto, onde o outro aplicativo está publicado.`);
  }
  if (site && !/^[a-z0-9-]{4,40}$/.test(site)) erros.push(`--site inválido: ${site}`);
  if (erros.length) return { erros, passos: [] };

  const compartilhado = !!o.compartilhadoCom;
  const config = compartilhado ? '.firebase.compartilhado.json' : 'firebase.json';
  const base = ['--project', o.projeto, '--config', config, '--non-interactive'];
  const passos = [];
  const comRegras = alvo === 'tudo' || alvo === 'regras';
  const comHosting = alvo === 'tudo' || alvo === 'hosting';
  const comFunctions = alvo === 'tudo' || alvo === 'functions';
  if (compartilhado && comRegras) passos.push({ descricao: 'Mesclar as regras com as do aplicativo já publicado', node: ['scripts/mesclar-regras.mjs', resolve(o.compartilhadoCom), '.regras-mescladas'] });
  if (compartilhado) passos.push({ descricao: 'Gerar a configuração que aponta para as regras mescladas', interno: 'config-compartilhada' });
  if (comHosting) {
    if (compartilhado) passos.push({ descricao: `Criar o site de Hosting "${site}" (ignorado se já existir)`, firebase: ['hosting:sites:create', site, '--project', o.projeto, '--non-interactive'], podeFalhar: true });
    passos.push({ descricao: `Apontar o Hosting da plataforma para o site "${site}"`, firebase: ['target:apply', 'hosting', 'app', site, '--project', o.projeto, '--config', config] });
  }
  // Sem --force aqui: índices e regras de outros aplicativos nunca são apagados.
  const semForca = [comRegras && 'firestore:rules,firestore:indexes,storage', comHosting && 'hosting:app'].filter(Boolean).join(',');
  if (semForca) passos.push({ descricao: `Publicar ${semForca}`, firebase: ['deploy', '--only', semForca, ...base] });
  // --force só nas Functions (exigido pela função com reentrega); o codebase próprio garante
  // que apenas as funções da plataforma são criadas, alteradas ou removidas.
  if (comFunctions) passos.push({ descricao: 'Publicar as Cloud Functions da plataforma', firebase: ['deploy', '--only', 'functions:plataforma-aec', ...base, '--force'] });
  return { erros: [], passos, site, config, url: comHosting ? `https://${site}.web.app` : undefined };
}

/**
 * Em ambientes sem login interativo (CI, sessões em nuvem) a chave da conta de serviço chega
 * pela variável FIREBASE_SERVICE_ACCOUNT_JSON. O Firebase CLI espera um ARQUIVO, então a chave
 * é gravada fora do repositório, legível só pelo usuário atual, e apontada por
 * GOOGLE_APPLICATION_CREDENTIALS. O conteúdo nunca é impresso.
 */
export function prepararCredencial(env = process.env) {
  if (env.GOOGLE_APPLICATION_CREDENTIALS || !env.FIREBASE_SERVICE_ACCOUNT_JSON) return null;
  let chave;
  try { chave = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON); }
  catch { throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON não é um JSON válido (cole o conteúdo inteiro do arquivo da chave).'); }
  if (chave.type !== 'service_account' || !chave.private_key || !chave.client_email) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON não é uma chave de conta de serviço.');
  const dir = mkdtempSync(join(tmpdir(), 'aec-cred-'));
  const arquivo = join(dir, 'conta-de-servico.json');
  writeFileSync(arquivo, JSON.stringify(chave), { mode: 0o600 });
  env.GOOGLE_APPLICATION_CREDENTIALS = arquivo;
  return { arquivo, conta: chave.client_email, projeto: chave.project_id };
}

function configCompartilhada() {
  const cfg = JSON.parse(readFileSync(join(raiz, 'firebase.json'), 'utf8'));
  cfg.firestore.rules = '.regras-mescladas/firestore.rules';
  cfg.storage.rules = '.regras-mescladas/storage.rules';
  writeFileSync(join(raiz, '.firebase.compartilhado.json'), JSON.stringify(cfg, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const valor = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
  const simular = args.includes('--simular');
  const plano = planejar({ projeto: valor('projeto'), alvo: valor('alvo'), site: valor('site'), projetoNovo: args.includes('--projeto-novo'), compartilhadoCom: valor('compartilhado-com') });
  if (plano.erros.length) { console.error(plano.erros.map((e) => `ERRO: ${e}`).join('\n')); process.exit(2); }
  if (valor('compartilhado-com') && !existsSync(join(resolve(valor('compartilhado-com')), 'firestore.rules'))) {
    console.error(`ERRO: ${resolve(valor('compartilhado-com'))} não contém firestore.rules.`); process.exit(2);
  }
  let credencial = null;
  if (!simular) {
    try { credencial = prepararCredencial(); } catch (e) { console.error(`ERRO: ${e.message}`); process.exit(2); }
    if (credencial) {
      console.log(`Usando a conta de serviço ${credencial.conta}.`);
      if (credencial.projeto && credencial.projeto !== valor('projeto')) console.log(`AVISO: a chave é do projeto "${credencial.projeto}", mas a publicação é em "${valor('projeto')}".`);
      process.on('exit', () => rmSync(dirname(credencial.arquivo), { recursive: true, force: true }));
    }
  }
  for (const p of plano.passos) {
    const cmd = p.firebase ? `firebase ${p.firebase.join(' ')}` : p.node ? `node ${p.node.join(' ')}` : `(interno) ${p.interno}`;
    console.log(`\n==> ${p.descricao}\n    > ${cmd}`);
    if (simular) continue;
    if (p.interno === 'config-compartilhada') { configCompartilhada(); continue; }
    const r = p.firebase
      ? spawnSync('npx', ['firebase', ...p.firebase], { cwd: raiz, stdio: 'inherit', shell: process.platform === 'win32' })
      : spawnSync(process.execPath, p.node, { cwd: raiz, stdio: 'inherit' });
    if (r.status !== 0 && !p.podeFalhar) { console.error(`\nERRO: o passo "${p.descricao}" falhou (código ${r.status}). Nada mais foi executado.`); process.exit(1); }
  }
  console.log(simular ? '\nSimulação: nada foi executado.' : `\nPublicação concluída.${plano.url ? ` Aplicativo: ${plano.url}` : ''}`);
}
