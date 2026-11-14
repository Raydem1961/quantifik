// Instalador completo — chamado pelo INSTALAR.cmd (dois cliques). Faz, em ordem:
//   1. encontra a chave de acesso do Firebase (guia o download se ainda não existir);
//   2. lê as regras de segurança que estão NO AR e as preserva (mescla com as da plataforma);
//   3. instala dependências e compila o aplicativo;
//   4. publica em um endereço próprio, sem tocar no site de outro aplicativo do projeto;
//   5. cria a empresa e o primeiro Sócio-Diretor;
//   6. se houver dados do ObraTop no projeto, simula a migração e pergunta antes de copiar.
// Pode ser executado de novo a qualquer momento: atualiza o que mudou e não duplica nada.
//
// Uso sem perguntas (automação): node scripts/instalar.mjs --sim [--socio email] [--empresa "Nome"]
//                                [--site id] [--sem-migrar] [--sem-publicar]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { criarEmpresa } from './criar-empresa.mjs';
import { prepararCredencial } from './deploy.mjs';
import { combinarComAoVivo } from './mesclar-regras.mjs';
import { COLECOES_OBRATOP, migrar } from './migrar-obratop.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opcao = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const tem = (n) => args.includes(`--${n}`);
const SEM_PERGUNTAS = tem('sim');

const titulo = (t) => console.log(`\n━━ ${t} ${'━'.repeat(Math.max(3, 64 - t.length))}`);
const ok = (t) => console.log(`   ✓ ${t}`);
const aviso = (t) => console.log(`   ! ${t}`);

// ───────────────────────── funções puras (testadas em tests/instalar.test.ts) ─────────────────────────

/** Procura a chave da conta de serviço: variáveis de ambiente, pasta do projeto e Downloads. */
export function localizarChave(env, pastas) {
  if (env.GOOGLE_APPLICATION_CREDENTIALS && existsSync(env.GOOGLE_APPLICATION_CREDENTIALS)) return env.GOOGLE_APPLICATION_CREDENTIALS;
  const candidatos = [];
  for (const pasta of pastas) {
    if (!existsSync(pasta)) continue;
    for (const nome of readdirSync(pasta)) {
      if (!/\.json$/i.test(nome) || !(nome === 'chave-firebase.json' || /firebase-adminsdk/i.test(nome))) continue;
      const caminho = join(pasta, nome);
      try {
        const j = JSON.parse(readFileSync(caminho, 'utf8'));
        if (j.type === 'service_account' && j.private_key && j.project_id) candidatos.push({ caminho, quando: statSync(caminho).mtimeMs });
      } catch { /* não é uma chave: ignora */ }
    }
  }
  return candidatos.sort((a, b) => b.quando - a.quando)[0]?.caminho ?? null;
}

/** Endereço de Hosting próprio da plataforma (6 a 30 caracteres, único no mundo). */
export function sitePadrao(projectId) {
  return `aec-${projectId}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 30).replace(/-+$/, '');
}

export function idDeEmpresa(nome) {
  const s = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return s.length >= 3 ? s : `empresa-${s || 'x'}`;
}

/** Linhas do .env.local a partir da configuração do aplicativo Web do Firebase. */
export function envLocal(cfg, regiao = 'southamerica-east1') {
  if (!cfg?.apiKey || !cfg?.projectId) throw new Error('A configuração do aplicativo Web veio incompleta (sem apiKey).');
  return [
    `NEXT_PUBLIC_FIREBASE_API_KEY=${cfg.apiKey}`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${cfg.authDomain ?? `${cfg.projectId}.firebaseapp.com`}`,
    `NEXT_PUBLIC_FIREBASE_PROJECT_ID=${cfg.projectId}`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${cfg.storageBucket ?? ''}`,
    `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=${cfg.messagingSenderId ?? ''}`, `NEXT_PUBLIC_FIREBASE_APP_ID=${cfg.appId ?? ''}`,
    `NEXT_PUBLIC_FUNCTIONS_REGION=${regiao}`,
  ].join('\n') + '\n';
}

/** Organizações do ObraTop no projeto, com o e-mail do proprietário (para propor a migração). */
export async function organizacoesObraTop(db) {
  const orgs = [];
  for (const d of (await db.collection('organizations').get()).docs) {
    const membros = (await d.ref.collection('members').get()).docs.map((m) => ({ uid: m.id, ...m.data() }));
    const dono = membros.find((m) => m.role === 'owner' && m.status !== 'inactive') ?? membros.find((m) => m.role === 'owner');
    let registros = 0;
    for (const c of COLECOES_OBRATOP) registros += (await d.ref.collection(c).count().get()).data().count;
    orgs.push({ id: d.id, nome: d.data().name ?? d.id, donoEmail: dono?.email ?? '', membros: membros.length, registros });
  }
  return orgs.sort((a, b) => b.registros - a.registros);
}

// ───────────────────────── execução ─────────────────────────

function rodar(cmd, argumentos, { tolerar = false, capturar = false, env } = {}) {
  // No Windows os executáveis do npm são .cmd e precisam do shell; argumentos com espaço vão entre aspas.
  const linha = [cmd, ...argumentos].map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(' ');
  const r = spawnSync(linha, { cwd: raiz, shell: true, stdio: capturar ? ['ignore', 'pipe', 'pipe'] : 'inherit', encoding: 'utf8', env: env ?? process.env });
  if (r.status !== 0 && !tolerar) throw new Error(`O comando falhou: ${cmd} ${argumentos.slice(0, 3).join(' ')}…${capturar ? `\n${(r.stderr || r.stdout || '').trim().split('\n').slice(-6).join('\n')}` : ''}`);
  return r;
}
// O Firebase CLI tenta primeiro a chave; se ela não tiver permissão para publicar (a chave padrão
// do Admin SDK nem sempre pode publicar o Hosting), passa a usar o login da própria pessoa no
// navegador — o mesmo que ela já faz para publicar outros aplicativos.
let envCli = process.env;
function usarLoginDoNavegador() {
  if (envCli !== process.env) return false; // já está usando
  console.log('\n   A chave não tem permissão para esta etapa. Vou usar o seu login do Google:\n   se abrir uma janela do navegador, entre com a conta dona do projeto Firebase.\n');
  const semChave = { ...process.env };
  delete semChave.GOOGLE_APPLICATION_CREDENTIALS;
  delete semChave.FIREBASE_SERVICE_ACCOUNT_JSON;
  rodar('npx', ['firebase', 'login'], { env: semChave });
  envCli = semChave;
  return true;
}
function firebase(argumentos, o = {}) {
  const r = rodar('npx', ['firebase', ...argumentos], { ...o, tolerar: true, env: envCli });
  if (r.status === 0) return r;
  // `tentarLogin: false` é para comandos que podem falhar por outro motivo (ex.: site já existe).
  if (o.tentarLogin !== false && usarLoginDoNavegador()) return rodar('npx', ['firebase', ...argumentos], { ...o, env: envCli });
  if (!o.tolerar) throw new Error(`O comando do Firebase falhou: ${argumentos.slice(0, 3).join(' ')}…${o.capturar ? `\n${(r.stderr || r.stdout || '').trim().split('\n').slice(-6).join('\n')}` : ''}`);
  return r;
}

function abrirNoNavegador(url) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  spawnSync(cmd, { shell: true, stdio: 'ignore' });
}

async function principal() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const perguntar = async (texto, padrao = '') => {
    if (SEM_PERGUNTAS) return padrao;
    const r = (await rl.question(`   ${texto}${padrao ? ` [${padrao}]` : ''}: `)).trim();
    return r || padrao;
  };
  const confirmar = async (texto) => SEM_PERGUNTAS || /^s/i.test(await perguntar(`${texto} (S/N)`, 'S'));

  console.log('\n  PLATAFORMA AEC — instalação e publicação\n  Pode fechar esta janela a qualquer momento; nada fica pela metade de forma irreversível.');

  // 1 ── chave de acesso ────────────────────────────────────────────────────
  titulo('1. Acesso ao Firebase');
  try { prepararCredencial(); } catch (e) { throw new Error(e.message); }
  const pastas = [raiz, join(homedir(), 'Downloads'), join(homedir(), 'Desktop'), join(homedir(), 'Área de Trabalho')];
  let chave = localizarChave(process.env, pastas);
  if (!chave) {
    const projeto = await perguntar('Nome (ID) do seu projeto Firebase', 'obratop-v3-teste');
    const url = `https://console.firebase.google.com/project/${projeto}/settings/serviceaccounts/adminsdk`;
    console.log(`\n   Preciso de uma chave de acesso. Vou abrir a página do Firebase no navegador.\n   Nela, clique no botão azul "Gerar nova chave privada" e depois em "Gerar chave".\n   O arquivo será baixado para a pasta Downloads — não precisa fazer mais nada.\n   (${url})\n`);
    abrirNoNavegador(url);
    process.stdout.write('   Aguardando o arquivo aparecer em Downloads');
    for (let i = 0; i < 360 && !chave; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      chave = localizarChave(process.env, pastas);
      if (i % 4 === 0) process.stdout.write('.');
    }
    console.log();
    if (!chave) throw new Error('Não encontrei a chave em 15 minutos. Baixe-a pela página aberta e execute o instalador de novo.');
  }
  // Guarda a chave junto do aplicativo (fora do controle de versão) para as próximas execuções.
  const destinoChave = join(raiz, 'chave-firebase.json');
  if (chave !== destinoChave && !process.env.FIREBASE_SERVICE_ACCOUNT_JSON) { try { writeFileSync(destinoChave, readFileSync(chave), { mode: 0o600 }); chave = destinoChave; } catch { /* segue com a original */ } }
  process.env.GOOGLE_APPLICATION_CREDENTIALS = chave;
  const conta = JSON.parse(readFileSync(chave, 'utf8'));
  const projectId = conta.project_id;
  ok(`Chave encontrada. Projeto: ${projectId}`);

  // 2 ── dependências ───────────────────────────────────────────────────────
  titulo('2. Preparando os arquivos (pode levar alguns minutos na primeira vez)');
  if (!existsSync(join(raiz, 'node_modules', 'firebase-admin')) || !existsSync(join(raiz, 'node_modules', 'next'))) rodar('npm', ['install', '--no-audit', '--no-fund']);
  if (!existsSync(join(raiz, 'functions', 'node_modules'))) rodar('npm', ['--prefix', 'functions', 'install', '--no-audit', '--no-fund'], { tolerar: true });
  ok('Dependências instaladas');

  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const { getAuth } = await import('firebase-admin/auth');
  const { getSecurityRules } = await import('firebase-admin/security-rules');
  const app = initializeApp({ credential: cert(conta), projectId });
  const db = getFirestore(app), auth = getAuth(app), regrasApi = getSecurityRules(app);

  // 3 ── regras de segurança: preserva o que está no ar ──────────────────────
  titulo('3. Regras de segurança');
  const aoVivo = async (ler) => { try { return (await ler())?.source?.[0]?.content ?? ''; } catch { return ''; } };
  const pares = [
    ['firestore.rules', 'match /databases/{database}/documents', await aoVivo(() => regrasApi.getFirestoreRuleset())],
    ['storage.rules', 'match /b/{bucket}/o', await aoVivo(() => regrasApi.getStorageRuleset())],
  ];
  mkdirSync(join(raiz, '.regras-mescladas'), { recursive: true });
  mkdirSync(join(raiz, 'backups'), { recursive: true });
  let compartilhado = false;
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  for (const [arquivo, raizRegra, vivo] of pares) {
    if (vivo.trim()) writeFileSync(join(raiz, 'backups', `${arquivo}.${projectId}.${carimbo}.antes`), vivo); // cópia do que estava no ar
    const r = combinarComAoVivo(readFileSync(join(raiz, arquivo), 'utf8'), vivo, raizRegra);
    writeFileSync(join(raiz, '.regras-mescladas', arquivo), r.regras);
    if (r.modo === 'compartilhado') compartilhado = true;
  }
  ok(compartilhado
    ? 'O projeto já tem outro aplicativo: as regras dele foram mantidas e as da plataforma, acrescentadas.'
    : 'Projeto sem outro aplicativo: serão usadas as regras da plataforma.');
  ok('Cópia das regras que estavam no ar guardada na pasta "backups".');
  const cfgFirebase = JSON.parse(readFileSync(join(raiz, 'firebase.json'), 'utf8'));
  cfgFirebase.firestore.rules = '.regras-mescladas/firestore.rules';
  cfgFirebase.storage.rules = '.regras-mescladas/storage.rules';
  writeFileSync(join(raiz, '.firebase.compartilhado.json'), JSON.stringify(cfgFirebase, null, 2));
  const base = ['--project', projectId, '--config', '.firebase.compartilhado.json', '--non-interactive'];

  // 4 ── configuração do aplicativo Web e compilação ─────────────────────────
  titulo('4. Compilando o aplicativo');
  const json = (r) => { try { return JSON.parse(r.stdout); } catch { return null; } };
  let apps = json(firebase(['apps:list', 'WEB', '--project', projectId, '--json'], { capturar: true }))?.result ?? [];
  if (!apps.length) {
    firebase(['apps:create', 'WEB', 'Plataforma AEC', '--project', projectId, '--json'], { capturar: true });
    apps = json(firebase(['apps:list', 'WEB', '--project', projectId, '--json'], { capturar: true }))?.result ?? [];
  }
  if (!apps.length) throw new Error('Não foi possível obter o aplicativo Web do projeto Firebase.');
  const sdk = json(firebase(['apps:sdkconfig', 'WEB', apps[0].appId, '--project', projectId, '--json'], { capturar: true }))?.result;
  writeFileSync(join(raiz, '.env.local'), envLocal(sdk?.sdkConfig ?? sdk));
  rodar('npm', ['run', 'build']);
  ok('Aplicativo compilado');

  // 5 ── publicação ─────────────────────────────────────────────────────────
  const site = opcao('site') ?? sitePadrao(projectId);
  const endereco = `https://${site}.web.app`;
  if (!tem('sem-publicar')) {
    titulo('5. Publicando');
    firebase(['hosting:sites:create', site, '--project', projectId, '--non-interactive'], { tolerar: true, capturar: true, tentarLogin: false });
    firebase(['target:apply', 'hosting', 'app', site, '--project', projectId, '--config', '.firebase.compartilhado.json']);
    // Sem --force: índices e regras de outros aplicativos nunca são apagados.
    firebase(['deploy', '--only', 'firestore:rules,firestore:indexes,storage,hosting:app', ...base]);
    ok(`Site e regras publicados em ${endereco}`);
    rodar('node', ['scripts/sync-shared.mjs'], { tolerar: true, capturar: true });
    const fn = firebase(['deploy', '--only', 'functions:plataforma-aec', ...base, '--force'], { tolerar: true, capturar: true, tentarLogin: false });
    if (fn.status === 0) ok('Funções do servidor publicadas (versões de CAD, auditoria, notificações, assinatura).');
    else aviso('As funções do servidor NÃO foram publicadas — normalmente porque o projeto está no plano gratuito (elas exigem o plano Blaze). O aplicativo funciona sem elas; ficam de fora o processamento de CAD no servidor, a auditoria automática, as notificações e a assinatura de contrato.');
    // O login com Google só funciona em endereços autorizados no Authentication.
    try {
      const token = (await app.options.credential.getAccessToken()).access_token;
      const api = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`;
      const atual = await (await fetch(api, { headers: { Authorization: `Bearer ${token}` } })).json();
      const dominios = new Set([...(atual.authorizedDomains ?? []), `${site}.web.app`, `${site}.firebaseapp.com`]);
      const r = await fetch(`${api}?updateMask=authorizedDomains`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ authorizedDomains: [...dominios] }) });
      if (!r.ok) throw new Error(String(r.status));
      ok('Endereço autorizado para login.');
    } catch { aviso(`Não consegui autorizar o endereço para login com Google. Se o botão "Entrar com Google" falhar, adicione ${site}.web.app em Authentication → Configurações → Domínios autorizados. O login por e-mail e senha funciona de qualquer forma.`); }
  }

  // 6 ── empresa e primeiro sócio ───────────────────────────────────────────
  titulo('6. Empresa e primeiro Sócio-Diretor');
  let orgs = [];
  try { orgs = await organizacoesObraTop(db); } catch { /* projeto sem ObraTop */ }
  const org = orgs[0];
  if (org) ok(`Encontrei o ObraTop neste projeto: "${org.nome}" (${org.registros} registros, ${org.membros} usuário(s)).`);
  const nome = opcao('empresa') ?? await perguntar('Nome da empresa', org?.nome ?? 'Minha Empresa');
  const socio = opcao('socio') ?? await perguntar('E-mail de quem será o Sócio-Diretor (administrador)', org?.donoEmail ?? '');
  if (!/^\S+@\S+\.\S+$/.test(socio)) throw new Error('E-mail do Sócio-Diretor não informado.');
  const tenant = idDeEmpresa(nome);
  let senhaProvisoria = '';
  try { await auth.getUserByEmail(socio); }
  catch {
    // Conta nova: cria com senha provisória (quem já usa o ObraTop entra com a senha de sempre).
    senhaProvisoria = `Aec-${Math.random().toString(36).slice(2, 8)}${Math.floor(Math.random() * 90 + 10)}`;
    await auth.createUser({ email: socio, password: senhaProvisoria, displayName: socio.split('@')[0] });
  }
  const emp = await criarEmpresa(db, auth, { tenant, nome, uf: opcao('uf') ?? 'BA', conselho: 'CREA', socio });
  ok(`${emp.criada ? 'Empresa criada' : 'Empresa já existia'}: "${nome}". ${socio} é Sócio-Diretor.`);
  if (emp.criada) aviso('CNPJ, responsável técnico e registro no CREA/CAU ficaram em branco: preencha-os depois, pois aparecem nos PDFs.');

  // 7 ── migração do ObraTop ────────────────────────────────────────────────
  if (org && !tem('sem-migrar')) {
    titulo('7. Dados do ObraTop');
    console.log('   Simulação (nada é gravado ainda):');
    const sim = await migrar(db, db, { org: org.id, tenant, log: (m) => console.log(`     ${m}`) });
    const aCopiar = Object.values(sim).reduce((s, x) => s + x.copiados, 0);
    if (aCopiar === 0) ok('Nada novo para copiar: os dados já estão na plataforma.');
    else if (await confirmar(`Copiar ${aCopiar} registros para a plataforma? O ObraTop não é alterado`)) {
      await migrar(db, db, { org: org.id, tenant, gravar: true, log: () => {} });
      ok(`${aCopiar} registros copiados. O ObraTop continua funcionando normalmente, com os dados dele intactos.`);
    } else aviso('Migração adiada. Execute o instalador de novo quando quiser copiar os dados.');
  }

  rl.close();
  titulo('Pronto');
  console.log(`\n   Aplicativo:  ${endereco}\n   Entrar com:  ${socio}${senhaProvisoria ? `\n   Senha provisória: ${senhaProvisoria}   (troque depois em "Esqueci minha senha")` : '   (a mesma senha que você já usa)'}\n`);
  if (!SEM_PERGUNTAS && !tem('sem-publicar')) abrirNoNavegador(`${endereco}/login/`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  principal().then(() => process.exit(0), (e) => {
    console.error(`\n   ✗ A instalação parou: ${e.message}\n     Nada do que já estava no ar foi apagado. Corrija o ponto acima e execute de novo.\n`);
    process.exit(1);
  });
}
