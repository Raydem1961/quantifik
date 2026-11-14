// Cria uma empresa (tenant) e define o primeiro Sócio-Diretor. É o passo inicial de qualquer
// instalação: pelas regras de segurança, só o backend cria empresas e atribui papéis.
//
//   node scripts/criar-empresa.mjs --projeto <id-firebase> --tenant <id> --nome "Nome Fantasia" \
//        --razao "Razão Social Ltda." --cnpj 00.000.000/0001-00 --uf BA \
//        --rt "Eng. Fulano" --conselho CREA --registro "CREA-BA 12345" --socio email@empresa.com
//
// O usuário do --socio precisa já ter entrado uma vez no aplicativo (conta criada no
// Authentication). Depois de rodar, ele deve sair e entrar de novo para receber o papel.
// Autenticação: `gcloud auth application-default login` ou GOOGLE_APPLICATION_CREDENTIALS.
import { fileURLToPath } from 'node:url';

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {import('firebase-admin/auth').Auth} auth
 */
export async function criarEmpresa(db, auth, o) {
  if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(o.tenant ?? '')) throw new Error('--tenant deve ter de 3 a 40 caracteres: letras minúsculas, números e hífen.');
  if (!o.nome?.trim()) throw new Error('Informe --nome (nome fantasia).');
  if (!UFS.includes(o.uf)) throw new Error(`--uf inválida: ${o.uf}`);
  if (!['CREA', 'CAU'].includes(o.conselho)) throw new Error('--conselho deve ser CREA ou CAU.');
  if (!/^\S+@\S+\.\S+$/.test(o.socio ?? '')) throw new Error('Informe o e-mail do --socio.');

  let usuario;
  try { usuario = await auth.getUserByEmail(o.socio); }
  catch { throw new Error(`Não existe conta com o e-mail ${o.socio}. Peça para a pessoa entrar uma vez no aplicativo e rode de novo.`); }
  const atual = usuario.customClaims?.tenantId;
  if (atual && atual !== o.tenant) throw new Error(`${o.socio} já pertence à empresa "${atual}". Um usuário pertence a uma única empresa.`);

  const ref = db.doc(`tenants/${o.tenant}`);
  const existente = await ref.get();
  if (existente.exists && !o.atualizar) {
    // Empresa já criada: só acrescenta o sócio, sem tocar no cadastro.
    console.log(`Empresa "${o.tenant}" já existe: o cadastro foi mantido.`);
  } else {
    await ref.set({
      razaoSocial: o.razao?.trim() || o.nome.trim(), nomeFantasia: o.nome.trim(), cnpj: o.cnpj ?? '', uf: o.uf,
      branding: { corPrimaria: o.cor ?? '#3b4cca', corSecundaria: '#111827' },
      responsavelTecnico: { nome: o.rt ?? '', conselho: o.conselho, registro: o.registro ?? '' },
      custoHoraTecnica: Number(o.custoHora) > 0 ? Number(o.custoHora) : 100,
      ...(existente.exists ? {} : { criadoEm: new Date().toISOString() }),
    }, { merge: true });
  }
  await auth.setCustomUserClaims(usuario.uid, { tenantId: o.tenant, role: 'socio_diretor' });
  await ref.collection('members').doc(usuario.uid).set(
    { uid: usuario.uid, nome: usuario.displayName ?? usuario.email, email: usuario.email, role: 'socio_diretor', ativo: true }, { merge: true });
  return { tenant: o.tenant, uid: usuario.uid, criada: !existente.exists };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
  const projeto = arg('projeto');
  if (!projeto) { console.error('Uso: node scripts/criar-empresa.mjs --projeto <id> --tenant <id> --nome "…" --uf BA --conselho CREA --socio email  (ver cabeçalho do arquivo)'); process.exit(2); }
  const { initializeApp, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const { getAuth } = await import('firebase-admin/auth');
  const app = initializeApp({ credential: applicationDefault(), projectId: projeto });
  try {
    const r = await criarEmpresa(getFirestore(app), getAuth(app), {
      tenant: arg('tenant'), nome: arg('nome'), razao: arg('razao'), cnpj: arg('cnpj'), uf: arg('uf') ?? 'BA', rt: arg('rt'), conselho: arg('conselho') ?? 'CREA',
      registro: arg('registro'), socio: arg('socio'), cor: arg('cor'), custoHora: arg('custo-hora'), atualizar: process.argv.includes('--atualizar'),
    });
    console.log(`${r.criada ? 'Empresa criada' : 'Sócio acrescentado'}: tenants/${r.tenant}. ${arg('socio')} é Sócio-Diretor — peça para sair e entrar de novo no aplicativo.`);
  } catch (e) { console.error(`ERRO: ${e.message}`); process.exit(1); }
}
