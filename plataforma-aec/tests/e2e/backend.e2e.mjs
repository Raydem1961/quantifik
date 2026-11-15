/**
 * Teste de ponta a ponta do backend contra o Firebase Emulator Suite.
 *
 *   1. (uma vez) npm --prefix functions run build
 *   2. functions/.secret.local e functions/.env.local  → ver README, seção "Testes de ponta a ponta"
 *   3. npx firebase emulators:start --project demo-aec --only auth,firestore,storage,functions
 *   4. node tests/e2e/backend.e2e.mjs
 *
 * Sobe dois servidores falsos locais: o provedor de assinatura (Clicksign) e o destino do
 * webhook de notificações. Nada sai da máquina.
 */
import { createHash, createHmac } from 'node:crypto';
import http from 'node:http';
import { createRequire } from 'node:module';
import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { getFirestore as adminDb } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { addDoc, collection, connectFirestoreEmulator, deleteDoc, doc, getFirestore, setDoc, updateDoc } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { connectStorageEmulator, getStorage, ref, uploadBytes, uploadString } from 'firebase/storage';

const PROJETO = 'demo-aec';
const REGIAO = 'southamerica-east1';
const BUCKET = process.env.E2E_BUCKET ?? `${PROJETO}.appspot.com`;
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';
process.env.GCLOUD_PROJECT = PROJETO;

initAdmin({ projectId: PROJETO, storageBucket: BUCKET });
const adb = adminDb();

let ok = 0;
const falhas = [];
function checar(nome, condicao, detalhe = '') {
  if (condicao) { ok++; console.log(`  ok   ${nome}`); }
  else { falhas.push(nome); console.log(`  FALHA ${nome} ${detalhe}`); }
}
async function ate(descricao, fn, ms = 25000) {
  const fim = Date.now() + ms;
  let ultimo;
  while (Date.now() < fim) {
    ultimo = await fn();
    if (ultimo) return ultimo;
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log(`  (tempo esgotado esperando: ${descricao})`);
  return ultimo;
}
async function rejeita(promessa) { try { await promessa; return false; } catch { return true; } }

// ── servidores falsos ───────────────────────────────────────────────────────
const recebidos = { webhook: [], clicksign: [] };
const corpo = (req) => new Promise((r) => { const p = []; req.on('data', (c) => p.push(c)); req.on('end', () => r(Buffer.concat(p))); });
const webhookSrv = http.createServer(async (req, res) => {
  const bruto = await corpo(req);
  recebidos.webhook.push({ assinatura: req.headers['x-aec-signature'], bruto, json: JSON.parse(bruto.toString()) });
  res.writeHead(200).end('ok');
}).listen(4181);
const clicksignSrv = http.createServer(async (req, res) => {
  const json = JSON.parse((await corpo(req)).toString() || '{}');
  const rota = req.url.split('?')[0];
  recebidos.clicksign.push({ rota, token: new URL(req.url, 'http://x').searchParams.get('access_token'), json });
  res.writeHead(201, { 'Content-Type': 'application/json' });
  if (rota.endsWith('/documents')) res.end(JSON.stringify({ document: { key: 'doc-key-123' } }));
  else if (rota.endsWith('/signers')) res.end(JSON.stringify({ signer: { key: `signer-${recebidos.clicksign.length}` } }));
  else res.end(JSON.stringify({ list: { key: 'list-1' } }));
}).listen(4180);

// ── semente ─────────────────────────────────────────────────────────────────
async function limpar() {
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJETO}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJETO}/accounts`, { method: 'DELETE' });
}
async function usuario(email, claims) {
  const u = await adminAuth().createUser({ email, password: 'senha-teste-123', displayName: email.split('@')[0] });
  if (claims) await adminAuth().setCustomUserClaims(u.uid, claims);
  return u.uid;
}
function cliente(nome) {
  const app = initializeApp({ apiKey: 'demo', projectId: PROJETO, storageBucket: BUCKET, authDomain: 'localhost' }, nome);
  connectAuthEmulator(getAuth(app), 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(getFirestore(app), '127.0.0.1', 8080);
  connectStorageEmulator(getStorage(app), '127.0.0.1', 9199);
  connectFunctionsEmulator(getFunctions(app, REGIAO), '127.0.0.1', 5001);
  return { auth: getAuth(app), db: getFirestore(app), storage: getStorage(app), fn: getFunctions(app, REGIAO) };
}

const DXF = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '6', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES',
  '0', 'LWPOLYLINE', '8', 'A-AREA-PRIV', '90', '4', '70', '1', '10', '0', '20', '0', '10', '10', '20', '0', '10', '10', '20', '8', '10', '0', '20', '8',
  '0', 'ENDSEC', '0', 'EOF', ''].join('\n');
const INP = '[OPTIONS]\nUnits LPS\n[JUNCTIONS]\nN1 10 1\n[PIPES]\nP1 N1 N2 250 100 140\n';

try {
  await limpar();
  const T = 'escritorio-a';
  const O = `organizations/${T}`;
  const uidSocio = await usuario('socio@a.test');
  const uidNovo = await usuario('novo@a.test');
  const uidOutro = await usuario('socio@b.test');
  await adb.doc(O).set({ name: 'Escritório A', ownerUid: uidSocio, aec: { webhookUrl: 'http://127.0.0.1:4181/notificacoes', custoHoraTecnica: 90 } });
  await adb.doc('organizations/escritorio-b').set({ name: 'Escritório B', ownerUid: uidOutro });
  await adb.doc(`${O}/works/w1`).set({ name: 'Obra 1' });
  await adb.doc(`${O}/members/${uidSocio}`).set({ role: 'owner', status: 'active', email: 'socio@a.test' });
  await adb.doc(`${O}/members/${uidNovo}`).set({ role: 'project_user', status: 'active', workId: 'w1', email: 'novo@a.test' });
  await adb.doc(`organizations/escritorio-b/members/${uidOutro}`).set({ role: 'owner', status: 'active', email: 'socio@b.test' });
  await adb.doc(`${O}/projects/p1`).set({ nome: 'Projeto 1', status: 'briefing' });

  const socio = cliente('socio');
  await signInWithEmailAndPassword(socio.auth, 'socio@a.test', 'senha-teste-123');
  const novo = cliente('novo');
  await signInWithEmailAndPassword(novo.auth, 'novo@a.test', 'senha-teste-123');
  const P = `${O}/projects/p1`;

  console.log('\n1. Papéis — cadastro de membros do ObraTop + perfil');
  checar('usuário de obra não altera projeto', await rejeita(updateDoc(doc(novo.db, P), { status: 'concluido' })));
  checar('usuário de obra não define o próprio perfil', await rejeita(setDoc(doc(novo.db, `${O}/perfis/${uidNovo}`), { perfil: 'coordenador' })));
  await setDoc(doc(socio.db, `${O}/perfis/${uidNovo}`), { perfil: 'coordenador' });
  await updateDoc(doc(novo.db, P), { status: 'estudo_preliminar' });
  checar('proprietário promove a coordenador, que passa a gerir projetos', (await adb.doc(P).get()).data()?.status === 'estudo_preliminar');
  await setDoc(doc(socio.db, `${O}/perfis/${uidNovo}`), { perfil: 'projetista' });
  checar('rebaixado a projetista, perde a permissão na hora', await rejeita(updateDoc(doc(novo.db, P), { status: 'concluido' })));

  console.log('\n2. Upload de CAD → versionamento + quantitativos');
  const enviar = (c, nome, conteudo, uid) => uploadString(ref(c.storage, `${P}/cad/arquitetonico/${Date.now()}__${nome}`), conteudo, 'raw', { customMetadata: { uid } });
  await enviar(novo, 'planta.dxf', DXF, uidNovo);
  const arquivoRef = adb.doc(`${P}/files/arquitetonico-planta-dxf`);
  const r00 = await ate('revisão R00', async () => { const s = await arquivoRef.collection('versions').doc('R00').get(); return s.data()?.qtoStatus === 'processado' ? s.data() : null; });
  checar('R00 criada e processada', !!r00, JSON.stringify(r00));
  checar('SHA-256 do arquivo registrado', r00?.sha256 === createHash('sha256').update(DXF).digest('hex'));
  checar('QTO do DXF: 80 m² na camada', r00?.qto?.layers?.[0]?.areaM2 === 80);
  checar('área reconhecida para o CUB (NBR 12721)', r00?.qto?.areasOrcamento?.[0]?.tipo === 'privativa_padrao');
  const q = (await adb.doc(`${P}/quantities/planta-dxf`).get()).data();
  checar('quantitativos unificados gravados', q?.formato === 'dxf' && q?.itens?.some((i) => i.unidade === 'm2' && i.quantidade === 80));
  await enviar(novo, 'planta.dxf', DXF.replace('10\n10\n20\n8', '10\n10\n20\n9'), uidNovo);
  const arq = await ate('revisão R01', async () => { const d = (await arquivoRef.get()).data(); return d?.revisaoAtual === 'R01' ? d : null; });
  checar('segundo upload vira R01 (R00 preservada)', arq?.totalRevisoes === 2 && (await arquivoRef.collection('versions').doc('R00').get()).exists);
  await ate('quantitativos da R01', async () => (await adb.doc(`${P}/quantities/planta-dxf`).get()).data()?.revisao === 'R01');
  checar('quantitativos acompanham a nova revisão (85 m²)', (await adb.doc(`${P}/quantities/planta-dxf`).get()).data()?.itens?.some((i) => i.quantidade === 85));
  await enviar(novo, 'rede.inp', INP, uidNovo);
  const rede = await ate('rede EPANET', async () => (await adb.doc(`${P}/quantities/rede-inp`).get()).data());
  checar('EPANET processado no servidor (250 m DN 100)', rede?.formato === 'epanet' && rede?.itens?.some((i) => /DN 100/.test(i.descricao) && i.quantidade === 250));
  await enviar(novo, 'forma.dwg', 'AC1032 binario', uidNovo);
  const dwg = await ate('DWG', async () => { const s = await adb.doc(`${P}/files/arquitetonico-forma-dwg/versions/R00`).get(); return s.data()?.qtoStatus !== 'pendente' ? s.data() : null; });
  checar('DWG é armazenado e fica aguardando conversão', dwg?.qtoStatus === 'aguardando_aps');
  await enviar(novo, 'quebrado.dxf', 'isto nao e um dxf', uidNovo);
  const ruim = await ate('DXF inválido', async () => { const s = await adb.doc(`${P}/files/arquitetonico-quebrado-dxf/versions/R00`).get(); return s.data()?.qtoStatus === 'erro' ? s.data() : null; });
  checar('arquivo inválido registra erro legível, sem derrubar a função', typeof ruim?.qtoErro === 'string' && ruim.qtoErro.length > 5, JSON.stringify(ruim));
  checar('upload com autoria forjada é barrado pelas regras', await rejeita(enviar(novo, 'x.dxf', DXF, 'outro-uid')));
  checar('extensão não permitida é barrada pelas regras', await rejeita(uploadString(ref(novo.storage, `${P}/cad/arquitetonico/1__virus.exe`), 'x', 'raw', { customMetadata: { uid: uidNovo } })));
  const b = cliente('b');
  await signInWithEmailAndPassword(b.auth, 'socio@b.test', 'senha-teste-123');
  checar('outra empresa não envia arquivo para este projeto', await rejeita(uploadString(ref(b.storage, `${P}/cad/arquitetonico/2__a.dxf`), DXF, 'raw', { customMetadata: { uid: uidOutro } })));

  console.log('\n3. Notificações e webhook');
  const notifs = await ate('notificações de CAD', async () => { const s = await adb.collection(`${O}/notifications`).where('tipo', '==', 'cad_atualizado').get(); return s.size >= 4 ? s.docs : null; });
  checar('notificação criada a cada upload', (notifs?.length ?? 0) >= 4);
  const wh = await ate('webhook', async () => (recebidos.webhook.length >= 4 ? recebidos.webhook : null));
  const primeiro = wh?.[0];
  checar('webhook entregue ao destino da empresa', !!primeiro && primeiro.json.tenantId === T);
  checar('webhook assinado com HMAC-SHA256 válido', !!primeiro && primeiro.assinatura === `sha256=${createHmac('sha256', 'chave-webhook-teste').update(primeiro.bruto).digest('hex')}`);

  console.log('\n4. Orçamento: auditoria e aprovação');
  const orc = await addDoc(collection(socio.db, `${P}/budgets`), { titulo: 'Orçamento CUB', status: 'rascunho', total: 1000, orgId: T });
  await updateDoc(orc, { status: 'aprovado', total: 1200 });
  const logs = await ate('auditoria do orçamento', async () => { const s = await adb.collection(`${O}/auditLogs`).where('recurso', '==', 'orcamento').get(); return s.size >= 2 ? s.docs.map((d) => d.data()) : null; });
  const upd = logs?.find((l) => l.acao === 'update');
  checar('criação e alteração auditadas', !!logs?.find((l) => l.acao === 'create') && !!upd);
  // O emulador do Firestore não repassa a identidade real ao gatilho (envia um autor fictício);
  // por isso aqui só se confere que o campo é preenchido. O uid real só existe em produção.
  checar('log guarda autor, antes e depois', !!upd?.uid && upd?.antes?.total === 1000 && upd?.depois?.total === 1200, JSON.stringify(upd));
  checar('notificação de orçamento aprovado', !!(await ate('notif. aprovado', async () => { const s = await adb.collection(`${O}/notifications`).where('tipo', '==', 'orcamento_aprovado').get(); return s.size === 1; })));
  await setDoc(doc(socio.db, `${O}/cubOverrides/BA_2026-11`), { uf: 'BA', ajuste: 1.05 });
  checar('alteração de CUB auditada', !!(await ate('auditoria CUB', async () => !(await adb.collection(`${O}/auditLogs`).where('recurso', '==', 'cub').get()).empty)));
  await deleteDoc(doc(socio.db, `${P}/files/arquitetonico-forma-dwg`));
  const del = await ate('auditoria de exclusão', async () => { const s = await adb.collection(`${O}/auditLogs`).where('recurso', '==', 'arquivo_cad').get(); return s.empty ? null : s.docs[0].data(); });
  checar('exclusão de arquivo CAD auditada, com o conteúdo excluído', del?.acao === 'delete' && !!del?.uid && del?.antes?.nome === 'forma.dwg', JSON.stringify(del));

  console.log('\n5. Assinatura digital');
  const pdf = Buffer.from('%PDF-1.4 conteudo de teste do contrato');
  const sha = createHash('sha256').update(pdf).digest('hex');
  const pdfPath = `${P}/docs/contrato-teste.pdf`;
  await uploadBytes(ref(socio.storage, pdfPath), pdf, { contentType: 'application/pdf' });
  const contrato = await addDoc(collection(socio.db, `${P}/contracts`), { projectId: 'p1', titulo: 'Contrato teste', template: 'x', status: 'rascunho', orgId: T });
  const solicitar = httpsCallable(socio.fn, 'solicitarAssinatura');
  const signatarios = [{ nome: 'Cliente', email: 'cliente@x.test', papel: 'contratante' }, { nome: 'RT', email: 'rt@a.test', papel: 'contratada' }];
  const pedido = { orgId: T, projectId: 'p1', contractId: contrato.id, pdfPath, signatarios };
  checar('hash divergente é recusado', await rejeita(solicitar({ ...pedido, sha256: 'f'.repeat(64) })));
  checar('PDF de outro projeto é recusado', await rejeita(solicitar({ ...pedido, sha256: sha, pdfPath: 'organizations/escritorio-b/projects/x/docs/a.pdf' })));
  checar('projetista não envia contrato', await rejeita(httpsCallable(novo.fn, 'solicitarAssinatura')({ ...pedido, sha256: sha })));
  checar('nenhuma chamada ao provedor nas tentativas recusadas', recebidos.clicksign.length === 0);
  const resp = await solicitar({ ...pedido, sha256: sha });
  checar('envelope criado no provedor', resp.data.documentoId === 'doc-key-123' && resp.data.sha256 === sha);
  const rotas = recebidos.clicksign.map((c) => c.rota.split('/').pop());
  checar('provedor recebeu documento, 2 signatários e 2 vínculos', rotas.join(',') === 'documents,signers,lists,signers,lists', rotas.join(','));
  checar('PDF enviado ao provedor é o mesmo do hash', createHash('sha256').update(Buffer.from(recebidos.clicksign[0].json.document.content_base64.split(',')[1], 'base64')).digest('hex') === sha);
  checar('token do provedor veio da secret', recebidos.clicksign[0].token === 'token-teste');
  const enviado = (await adb.doc(contrato.path).get()).data();
  checar('contrato passa a "enviado para assinatura" com hash', enviado?.status === 'enviado_assinatura' && enviado?.sha256 === sha);
  checar('reenvio do mesmo contrato é recusado', await rejeita(solicitar({ ...pedido, sha256: sha })));
  checar('cliente web não consegue forjar status "assinado"', await rejeita(updateDoc(contrato, { status: 'assinado' })));

  const urlWebhook = `http://127.0.0.1:5001/${PROJETO}/${REGIAO}/webhookAssinatura`;
  const evento = JSON.stringify({ event: { name: 'auto_close' }, document: { key: 'doc-key-123' } });
  const postar = (corpoTxt, hmac) => fetch(urlWebhook, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Hmac': `sha256=${hmac}` }, body: corpoTxt });
  checar('webhook com HMAC errado → 401', (await postar(evento, 'a'.repeat(64))).status === 401);
  checar('contrato continua não assinado após webhook forjado', (await adb.doc(contrato.path).get()).data()?.status === 'enviado_assinatura');
  checar('webhook GET → 405', (await fetch(urlWebhook)).status === 405);
  const bom = await postar(evento, createHmac('sha256', 'hmac-teste').update(evento).digest('hex'));
  checar('webhook legítimo → 200', bom.status === 200, String(bom.status));
  checar('contrato marcado como assinado', (await adb.doc(contrato.path).get()).data()?.status === 'assinado');
  checar('notificação de contrato assinado', !!(await ate('notif. assinado', async () => !(await adb.collection(`${O}/notifications`).where('tipo', '==', 'contrato_assinado').get()).empty)));
  checar('contrato auditado (criação → envio → assinatura)', (await ate('auditoria contrato', async () => { const s = await adb.collection(`${O}/auditLogs`).where('recurso', '==', 'contrato').get(); return s.size >= 3 ? s.size : null; })) >= 3);

  console.log('\n6. Alertas diários de ART/RRT');
  const dia = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  await adb.doc(`${P}/artRrt/vencendo`).set({ orgId: T, projectId: 'p1', projetoNome: 'Projeto 1', tipo: 'ART', disciplina: 'estrutural', etapa: 'Executivo', status: 'a_emitir', vencimento: dia(3) });
  await adb.doc(`${P}/artRrt/longe`).set({ orgId: T, projectId: 'p1', tipo: 'ART', disciplina: 'eletrico', etapa: 'EP', status: 'a_emitir', vencimento: dia(40) });
  await adb.doc(`${P}/artRrt/quitada`).set({ orgId: T, projectId: 'p1', tipo: 'RRT', disciplina: 'arquitetonico', etapa: 'AP', status: 'paga', vencimento: dia(-5) });
  // Funções agendadas não disparam no emulador: executa o mesmo código compilado diretamente.
  const fns = createRequire(import.meta.url)('../../functions/lib/index.js');
  await fns.alertasArtRrt.run({});
  await fns.alertasArtRrt.run({});
  const alertas = (await adb.collection(`${O}/notifications`).where('tipo', '==', 'art_vencendo').get()).docs.map((d) => d.data());
  checar('alerta só para ART pendente vencendo em 7 dias', alertas.length === 1 && /ART a emitir/.test(alertas[0].titulo), JSON.stringify(alertas));
  checar('execução repetida não duplica o alerta', alertas.length === 1);
} catch (e) {
  falhas.push(`exceção: ${e?.message ?? e}`);
  console.error(e);
} finally {
  webhookSrv.close(); clicksignSrv.close();
  console.log(`\n${ok} verificações ok, ${falhas.length} falha(s)${falhas.length ? ':\n - ' + falhas.join('\n - ') : ''}`);
  process.exit(falhas.length ? 1 : 0);
}
