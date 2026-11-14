// Dá acesso a uma pessoa da equipe (ou muda o papel dela). Chamado pelo USUARIOS.cmd.
//   node scripts/usuarios.mjs [--email x@y --papel coordenador --empresa id]
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { prepararCredencial } from './deploy.mjs';
import { localizarChave } from './instalar.mjs';

export const PAPEIS = { '1': 'socio_diretor', '2': 'coordenador', '3': 'orcamentista', '4': 'projetista', '5': 'cliente' };
const ROTULO = { socio_diretor: 'Sócio-Diretor', coordenador: 'Coordenador', orcamentista: 'Orçamentista', projetista: 'Projetista', cliente: 'Cliente (só acompanha os próprios projetos)' };

/** Atribui o papel: cria a conta se não existir, grava as permissões e o cadastro de membro. */
export async function definirPapel(db, auth, { tenant, email, papel }) {
  if (!Object.values(PAPEIS).includes(papel)) throw new Error(`Papel inválido: ${papel}`);
  if (!(await db.doc(`tenants/${tenant}`).get()).exists) throw new Error(`Empresa "${tenant}" não encontrada.`);
  let usuario, senhaProvisoria = '';
  try { usuario = await auth.getUserByEmail(email); }
  catch {
    senhaProvisoria = `Aec-${Math.random().toString(36).slice(2, 8)}${Math.floor(Math.random() * 90 + 10)}`;
    usuario = await auth.createUser({ email, password: senhaProvisoria, displayName: email.split('@')[0] });
  }
  const atual = usuario.customClaims?.tenantId;
  if (atual && atual !== tenant) throw new Error(`${email} já pertence à empresa "${atual}".`);
  if (usuario.customClaims?.role === 'socio_diretor' && papel !== 'socio_diretor') {
    const socios = await db.collection(`tenants/${tenant}/members`).where('role', '==', 'socio_diretor').get();
    if (socios.size <= 1) throw new Error('Esta pessoa é o único Sócio-Diretor. Defina outro antes de mudar o papel dela.');
  }
  await auth.setCustomUserClaims(usuario.uid, { tenantId: tenant, role: papel });
  await db.doc(`tenants/${tenant}/members/${usuario.uid}`).set({ uid: usuario.uid, nome: usuario.displayName ?? email, email, role: papel, ativo: true }, { merge: true });
  return { uid: usuario.uid, senhaProvisoria };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
  const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    prepararCredencial();
    const chave = localizarChave(process.env, [raiz, join(homedir(), 'Downloads')]);
    if (!chave) throw new Error('Chave de acesso não encontrada. Execute primeiro o INSTALAR.');
    const conta = JSON.parse(readFileSync(chave, 'utf8'));
    const { initializeApp, cert } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');
    const { getAuth } = await import('firebase-admin/auth');
    const app = initializeApp({ credential: cert(conta), projectId: conta.project_id });
    const db = getFirestore(app), auth = getAuth(app);
    const empresas = (await db.collection('tenants').get()).docs;
    if (!empresas.length) throw new Error('Nenhuma empresa cadastrada. Execute primeiro o INSTALAR.');
    let tenant = arg('empresa') ?? empresas[0].id;
    if (!arg('empresa') && empresas.length > 1) {
      empresas.forEach((e, i) => console.log(`  ${i + 1}. ${e.data().nomeFantasia ?? e.id}`));
      tenant = empresas[(Number(await rl.question('Empresa (número): ')) || 1) - 1]?.id ?? tenant;
    }
    console.log(`\n  Equipe de "${empresas.find((e) => e.id === tenant)?.data().nomeFantasia ?? tenant}":`);
    for (const m of (await db.collection(`tenants/${tenant}/members`).get()).docs) console.log(`   • ${m.data().email}  —  ${ROTULO[m.data().role] ?? m.data().role}`);
    const email = arg('email') ?? (await rl.question('\n  E-mail da pessoa: ')).trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('E-mail inválido.');
    let papel = arg('papel');
    if (!papel) {
      for (const [n, p] of Object.entries(PAPEIS)) console.log(`   ${n}. ${ROTULO[p]}`);
      papel = PAPEIS[(await rl.question('  Papel (número): ')).trim()];
    }
    const r = await definirPapel(db, auth, { tenant, email, papel });
    console.log(`\n  ✓ ${email} agora é ${ROTULO[papel]}.${r.senhaProvisoria ? `\n    Conta criada. Senha provisória: ${r.senhaProvisoria}` : '\n    Se a pessoa já estiver com o aplicativo aberto, ela precisa sair e entrar de novo.'}\n`);
    rl.close();
    process.exit(0);
  } catch (e) { console.error(`\n  ✗ ${e.message}\n`); rl.close(); process.exit(1); }
}
