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
//                                [--site id] [--sem-publicar] [--admin-plataforma email]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { prepararCredencial } from './deploy.mjs';
import { regrasParaPublicar } from './gerar-regras.mjs';
const COLECOES_OBRATOP = ['works', 'activities', 'budgets', 'measurements', 'finance', 'contracts', 'orders', 'inventory', 'suppliers', 'staff', 'equipment', 'quality', 'safety', 'documents', 'dailyLogs'];

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

/**
 * Define quem é o administrador da plataforma (emite os códigos de licença para novas empresas).
 * Grava plataforma/acesso — documento que o aplicativo só lê; nenhuma conta consegue alterá-lo.
 * Acrescenta (não remove) administradores; aceita o e-mail mesmo antes de a conta existir.
 */
export async function definirAdminPlataforma(db, auth, email) {
  const e = String(email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error('E-mail do administrador da plataforma inválido.');
  const { FieldValue } = await import('firebase-admin/firestore');
  let uid = '';
  try { uid = (await auth.getUserByEmail(e)).uid; } catch { /* conta ainda não criada: vale pelo e-mail confirmado */ }
  await db.doc('plataforma/acesso').set({ emails: FieldValue.arrayUnion(e), ...(uid ? { admins: FieldValue.arrayUnion(uid) } : {}), atualizadoEm: new Date().toISOString() }, { merge: true });
  return { email: e, uid };
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

  console.log('\n  OBRATOP 4 — instalação e publicação\n  Pode fechar esta janela a qualquer momento; nada fica pela metade de forma irreversível.');

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
  const vivoFirestore = await aoVivo(() => regrasApi.getFirestoreRuleset()), vivoStorage = await aoVivo(() => regrasApi.getStorageRuleset());
  mkdirSync(join(raiz, '.regras-mescladas'), { recursive: true });
  mkdirSync(join(raiz, 'backups'), { recursive: true });
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  // Cópia do que estava no ar, antes de qualquer mudança.
  if (vivoFirestore.trim()) writeFileSync(join(raiz, 'backups', `firestore.rules.${projectId}.${carimbo}.antes`), vivoFirestore);
  if (vivoStorage.trim()) writeFileSync(join(raiz, 'backups', `storage.rules.${projectId}.${carimbo}.antes`), vivoStorage);
  // As regras do ObraTop que estão no ar são a base; os módulos novos entram como um bloco a mais.
  const regras = regrasParaPublicar(vivoFirestore, vivoStorage);
  writeFileSync(join(raiz, '.regras-mescladas', 'firestore.rules'), regras.firestore);
  writeFileSync(join(raiz, '.regras-mescladas', 'storage.rules'), regras.storage);
  ok(regras.baseDoFirestore === 'no ar'
    ? 'As regras do ObraTop que estão no ar foram mantidas; as dos módulos novos foram acrescentadas.'
    : 'Projeto sem o ObraTop: serão usadas as regras do ObraTop 3.39.13 com os módulos novos.');
  if (vivoFirestore.trim()) ok('Cópia das regras que estavam no ar guardada na pasta "backups".');
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
    firebase(['apps:create', 'WEB', 'ObraTop 4', '--project', projectId, '--json'], { capturar: true });
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
    firebase(['deploy', '--only', 'firestore:rules,firestore:indexes,hosting:app', ...base]);
    ok(`Site e regras do banco de dados publicados em ${endereco}`);
    // O Storage (arquivos) só existe em projetos no plano Blaze com o serviço ativado: sem ele, o resto é publicado.
    const st = firebase(['deploy', '--only', 'storage', ...base], { tolerar: true, capturar: true, tentarLogin: false });
    if (st.status === 0) ok('Regras de arquivos (Storage) publicadas.');
    else aviso(`O armazenamento de arquivos (Storage) NÃO está ativado neste projeto — ele exige o plano Blaze. O aplicativo funciona sem ele; ficam de fora os anexos de documentos, o envio de arquivos CAD e o PDF de contratos para assinatura. Para ativar: https://console.firebase.google.com/project/${projectId}/storage e depois execute o instalador de novo.`);
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

  // 6 ── empresa e usuários: os mesmos do ObraTop ──────────────────────────
  titulo('6. Empresa e usuários');
  let orgs = [];
  try { orgs = await organizacoesObraTop(db); } catch { /* projeto sem ObraTop */ }
  const org = orgs[0];
  if (org) ok(`ObraTop encontrado: "${org.nome}" (${org.registros} registros, ${org.membros} usuário(s)). O novo aplicativo usa esses mesmos dados e usuários — nada é copiado nem alterado.`);
  else ok('Projeto sem empresa cadastrada: na primeira vez que abrir o aplicativo, crie sua conta e a empresa.');
  const socio = org?.donoEmail ?? '';
  // Criar empresa passa a exigir código de licença; quem emite os códigos é o administrador da plataforma.
  let adminAtual = [];
  try { adminAtual = (await db.doc('plataforma/acesso').get()).data()?.emails ?? []; } catch { /* ainda não definido */ }
  const emailAdmin = opcao('admin-plataforma') ?? (adminAtual.length && SEM_PERGUNTAS ? '' : await perguntar('E-mail do administrador da plataforma (quem emite os códigos de licença)', adminAtual[0] ?? (socio || opcao('socio') || '')));
  if (emailAdmin) {
    try {
      const r = await definirAdminPlataforma(db, auth, emailAdmin);
      ok(`Administrador da plataforma: ${r.email}. Só ele emite códigos de licença (Administrativo → Licenças da plataforma).`);
      if (!r.uid) aviso('Essa conta ainda não existe: crie a conta com esse e-mail e confirme o e-mail pelo link recebido.');
    } catch (e) { aviso(`Não consegui definir o administrador da plataforma: ${e.message}`); }
  } else if (!adminAtual.length) aviso('Nenhum administrador da plataforma definido: ninguém conseguirá criar empresa nova. Execute o instalador de novo e informe o e-mail.');
  else ok(`Administrador da plataforma mantido: ${adminAtual.join(', ')}.`);

  rl.close();
  titulo('Pronto');
  console.log(`\n   Aplicativo:  ${endereco}\n   ${socio ? `Entrar com:  ${socio}   (a mesma senha do ObraTop)` : 'Primeiro acesso: clique em "Criar conta" com o e-mail do administrador da plataforma, confirme o e-mail e clique em "Criar minha empresa".'}\n`);
  if (!SEM_PERGUNTAS && !tem('sem-publicar')) abrirNoNavegador(`${endereco}/login/`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  principal().then(() => process.exit(0), (e) => {
    console.error(`\n   ✗ A instalação parou: ${e.message}\n     Nada do que já estava no ar foi apagado. Corrija o ponto acima e execute de novo.\n`);
    process.exit(1);
  });
}
