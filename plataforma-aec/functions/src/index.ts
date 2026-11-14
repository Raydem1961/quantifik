/**
 * Cloud Functions (2ª geração) — automações, auditoria, notificações e assinatura digital.
 * Região: southamerica-east1 (São Paulo).
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger, setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentCreated, onDocumentWrittenWithAuthContext } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { defineSecret, defineString } from 'firebase-functions/params';
import { enviarParaOss, iniciarTraducao, obterToken } from './aps';
import { extrairQto, mapearCamadasParaAreas, parseDxf } from './shared/cad/dxf-qto';
import { importarArquivo } from './shared/import';
import type { Disciplina, Role } from './shared/types';

initializeApp();
setGlobalOptions({ region: 'southamerica-east1', maxInstances: 10 });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

const CLICKSIGN_TOKEN = defineSecret('CLICKSIGN_TOKEN');
const CLICKSIGN_HMAC = defineSecret('CLICKSIGN_HMAC_SECRET');
const WEBHOOK_SIGNING_KEY = defineSecret('WEBHOOK_SIGNING_KEY');
const APS_CLIENT_ID = defineSecret('APS_CLIENT_ID');
const APS_CLIENT_SECRET = defineSecret('APS_CLIENT_SECRET');
const CLICKSIGN_BASE = defineString('CLICKSIGN_BASE_URL', { default: 'https://sandbox.clicksign.com' });
const APS_BUCKET = defineString('APS_BUCKET', { default: '' });

const PAPEIS: Role[] = ['socio_diretor', 'coordenador', 'orcamentista', 'projetista', 'cliente'];
const agora = () => new Date().toISOString();
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

type TipoNotificacao = 'cad_atualizado' | 'orcamento_aprovado' | 'contrato_assinado' | 'art_vencendo' | 'geral';

async function notificar(tenantId: string, n: { tipo: TipoNotificacao; titulo: string; mensagem: string; projectId?: string; destinatarios?: string[] }) {
  await db.collection(`tenants/${tenantId}/notifications`).add({ ...n, destinatarios: n.destinatarios ?? [], lidaPor: [], criadoEm: agora() });
}

// ───────────────────── 1. Upload de CAD → versionamento + QTO ─────────────────────

const RE_CAD = /^tenants\/([^/]+)\/projects\/([^/]+)\/cad\/([^/]+)\/(?:[^/]*__)?([^/]+\.(dwg|dxf|csv|xml|ifc|inp|txt|landxml))$/i;

export const processarUploadCad = onObjectFinalized(
  { memory: '1GiB', timeoutSeconds: 300, secrets: [APS_CLIENT_ID, APS_CLIENT_SECRET] },
  async (event) => {
    const caminho = event.data.name;
    const m = RE_CAD.exec(caminho);
    if (!m) return;
    const [, tenantId, projectId, disciplina, nomeArquivo, ext] = m as unknown as [string, string, string, string, string, string];
    const extensao = ext.toLowerCase();
    const uid = event.data.metadata?.uid ?? 'sync-local';
    const arquivo = getStorage().bucket(event.data.bucket).file(caminho);
    const [conteudo] = await arquivo.download();
    const sha256 = createHash('sha256').update(conteudo).digest('hex');

    // Revisão sequencial (R00, R01…) decidida em transação: uploads simultâneos não colidem.
    const fileId = slug(`${disciplina}-${nomeArquivo}`);
    const fileRef = db.doc(`tenants/${tenantId}/projects/${projectId}/files/${fileId}`);
    const resultado = await db.runTransaction(async (tx) => {
      const snap = await tx.get(fileRef);
      // Reentrega do mesmo evento (at-least-once): não cria revisão duplicada.
      const repetida = await tx.get(fileRef.collection('versions').where('storagePath', '==', caminho).limit(1));
      if (!repetida.empty) return null;
      const total = (snap.data()?.totalRevisoes as number | undefined) ?? 0;
      const revisao = `R${String(total).padStart(2, '0')}`;
      tx.set(fileRef, {
        nome: nomeArquivo, disciplina, extensao, revisaoAtual: revisao, totalRevisoes: total + 1,
        atualizadoEm: agora(), atualizadoPor: uid,
      }, { merge: true });
      tx.set(fileRef.collection('versions').doc(revisao), {
        revisao, storagePath: caminho, tamanhoBytes: conteudo.length, sha256, enviadoPor: uid, enviadoEm: agora(), qtoStatus: 'pendente',
      });
      return revisao;
    });
    if (!resultado) return;
    const versaoRef = fileRef.collection('versions').doc(resultado);

    try {
      if (extensao !== 'dwg') {
        const texto = conteudo.toString('utf8');
        // Quantitativos unificados (alimentam o orçamento analítico em tempo real via onSnapshot).
        const importado = importarArquivo(nomeArquivo, texto, { disciplina: disciplina as Disciplina });
        if (importado.itens.length > 5000) throw new Error(`Arquivo gera ${importado.itens.length} itens; o limite é 5.000. Divida o modelo por disciplina.`);
        await db.doc(`tenants/${tenantId}/projects/${projectId}/quantities/${slug(nomeArquivo)}`).set({
          ...importado, tenantId, revisao: resultado, importadoEm: agora(), importadoPor: uid,
        });
        // DXF mantém também o QTO detalhado por camada e as áreas NBR 12721 para o orçamento CUB.
        const detalhe = extensao === 'dxf' ? (() => { const qto = extrairQto(parseDxf(texto)); return { ...qto, areasOrcamento: mapearCamadasParaAreas(qto) }; })() : undefined;
        await versaoRef.update({ qtoStatus: 'processado', qto: detalhe ?? null, resumo: importado.resumo, avisos: importado.avisos, formato: importado.formato });
      } else if (APS_BUCKET.value() && APS_CLIENT_ID.value()) {
        const token = await obterToken(APS_CLIENT_ID.value(), APS_CLIENT_SECRET.value());
        const urn = await enviarParaOss(token, APS_BUCKET.value(), `${tenantId}_${projectId}_${fileId}_${resultado}.dwg`, conteudo);
        await iniciarTraducao(token, urn);
        await versaoRef.update({ qtoStatus: 'aguardando_aps', apsUrn: urn });
      } else {
        await versaoRef.update({ qtoStatus: 'aguardando_aps', qtoErro: 'DWG armazenado. Configure o APS ou envie o DXF correspondente para extrair quantitativos.' });
      }
    } catch (erro) {
      logger.error('Falha no QTO', { caminho, erro: erro instanceof Error ? erro.message : String(erro) });
      await versaoRef.update({ qtoStatus: 'erro', qtoErro: erro instanceof Error ? erro.message : String(erro) });
    }

    await notificar(tenantId, {
      tipo: 'cad_atualizado', projectId,
      titulo: `${nomeArquivo} — revisão ${resultado}`,
      mensagem: `Arquivo de ${disciplina} atualizado (${(conteudo.length / 1024).toFixed(0)} kB).`,
    });
  },
);

// ───────────────────── 2. Auditoria imutável + gatilhos de negócio ─────────────────────

async function auditar(tenantId: string, recurso: string, caminho: string, uid: string | undefined, antes: unknown, depois: unknown) {
  const acao = antes === undefined ? 'create' : depois === undefined ? 'delete' : 'update';
  await db.collection(`tenants/${tenantId}/auditLogs`).add({
    acao, recurso, caminho, uid: uid ?? 'sistema', antes: antes ?? null, depois: depois ?? null, em: FieldValue.serverTimestamp(),
  });
}

export const auditarOrcamento = onDocumentWrittenWithAuthContext('tenants/{tenantId}/projects/{projectId}/budgets/{id}', async (event) => {
  const antes = event.data?.before.data();
  const depois = event.data?.after.data();
  const { tenantId, projectId } = event.params;
  await auditar(tenantId, 'orcamento', event.document, event.authId, antes, depois);
  if (depois?.status === 'aprovado' && antes?.status !== 'aprovado') {
    await notificar(tenantId, { tipo: 'orcamento_aprovado', projectId, titulo: 'Orçamento aprovado', mensagem: `O orçamento "${depois.titulo ?? event.params.id}" foi aprovado.` });
  }
});

export const auditarContrato = onDocumentWrittenWithAuthContext('tenants/{tenantId}/projects/{projectId}/contracts/{id}', async (event) => {
  const antes = event.data?.before.data();
  const depois = event.data?.after.data();
  const { tenantId, projectId } = event.params;
  await auditar(tenantId, 'contrato', event.document, event.authId, antes, depois);
  if (depois?.status === 'assinado' && antes?.status !== 'assinado') {
    await notificar(tenantId, { tipo: 'contrato_assinado', projectId, titulo: 'Contrato assinado', mensagem: `O contrato "${depois.titulo ?? event.params.id}" foi assinado por todas as partes.` });
  }
});

export const auditarArquivoCad = onDocumentWrittenWithAuthContext('tenants/{tenantId}/projects/{projectId}/files/{id}', async (event) => {
  const antes = event.data?.before.data();
  const depois = event.data?.after.data();
  if (depois !== undefined) return; // só exclusões interessam aqui (uploads já ficam nas revisões)
  await auditar(event.params.tenantId, 'arquivo_cad', event.document, event.authId, antes, depois);
});

export const auditarCub = onDocumentWrittenWithAuthContext('tenants/{tenantId}/cubOverrides/{id}', async (event) => {
  await auditar(event.params.tenantId, 'cub', event.document, event.authId, event.data?.before.data(), event.data?.after.data());
});

// ───────────────────── 3. Notificações → webhook (WhatsApp / e-mail) ─────────────────────

export const despacharNotificacao = onDocumentCreated(
  { document: 'tenants/{tenantId}/notifications/{id}', secrets: [WEBHOOK_SIGNING_KEY], retry: true },
  async (event) => {
    const tenant = (await db.doc(`tenants/${event.params.tenantId}`).get()).data();
    const url = tenant?.webhookUrl as string | undefined;
    // Só HTTPS em produção; no emulador local aceita http://localhost para testes.
    const emulador = process.env.FUNCTIONS_EMULATOR === 'true';
    if (!url || !(emulador ? /^https?:\/\//.test(url) : /^https:\/\//.test(url))) return;
    const corpo = JSON.stringify({ id: event.params.id, tenantId: event.params.tenantId, ...event.data?.data() });
    const assinatura = createHmac('sha256', WEBHOOK_SIGNING_KEY.value()).update(corpo).digest('hex');
    const r = await fetch(url, {
      method: 'POST', body: corpo, signal: AbortSignal.timeout(10_000),
      headers: { 'Content-Type': 'application/json', 'X-AEC-Signature': `sha256=${assinatura}`, 'X-AEC-Event-Id': event.params.id },
    });
    // 5xx → lança para o Firebase reentregar; 4xx é erro de configuração do destino, não adianta repetir.
    if (r.status >= 500) throw new Error(`Webhook respondeu ${r.status}`);
    if (!r.ok) logger.warn('Webhook recusou a notificação', { status: r.status, tenantId: event.params.tenantId });
  },
);

// ───────────────────── 4. RBAC: papéis via custom claims ─────────────────────

export const definirPapel = onCall<{ uid: string; role: Role; projectIds?: string[] }>(async (req) => {
  const chamador = req.auth?.token;
  if (!chamador?.tenantId || chamador.role !== 'socio_diretor') throw new HttpsError('permission-denied', 'Apenas o Sócio-Diretor gerencia a equipe.');
  const { uid, role, projectIds } = req.data;
  if (typeof uid !== 'string' || !PAPEIS.includes(role)) throw new HttpsError('invalid-argument', 'uid ou papel inválido.');
  const tenantId = chamador.tenantId as string;
  const alvo = await getAuth().getUser(uid);
  // Um usuário pertence a um único tenant: impede "sequestrar" a conta de outro escritório.
  const tenantAtual = alvo.customClaims?.tenantId as string | undefined;
  if (tenantAtual && tenantAtual !== tenantId) throw new HttpsError('failed-precondition', 'Usuário já vinculado a outra empresa.');
  if (uid === req.auth!.uid && role !== 'socio_diretor') {
    const socios = await db.collection(`tenants/${tenantId}/members`).where('role', '==', 'socio_diretor').where('ativo', '==', true).get();
    if (socios.size <= 1) throw new HttpsError('failed-precondition', 'A empresa precisa de ao menos um Sócio-Diretor.');
  }
  await getAuth().setCustomUserClaims(uid, { tenantId, role });
  await db.doc(`tenants/${tenantId}/members/${uid}`).set(
    { uid, nome: alvo.displayName ?? alvo.email ?? uid, email: alvo.email ?? '', role, projectIds: projectIds ?? [], ativo: true }, { merge: true });
  await auditar(tenantId, 'equipe', `tenants/${tenantId}/members/${uid}`, req.auth!.uid, undefined, { role });
  return { ok: true };
});

// ───────────────────── 5. Assinatura digital ─────────────────────

interface PedidoAssinatura {
  projectId: string; contractId: string; pdfPath: string; sha256: string;
  signatarios: { nome: string; email: string; cpf?: string; papel: 'contratante' | 'contratada' | 'testemunha' }[];
}

async function clicksign<T>(caminho: string, corpo: unknown): Promise<T> {
  const r = await fetch(`${CLICKSIGN_BASE.value()}/api/v1/${caminho}?access_token=${CLICKSIGN_TOKEN.value()}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(corpo),
  });
  if (!r.ok) throw new HttpsError('unavailable', `Clicksign ${caminho}: HTTP ${r.status} — ${(await r.text()).slice(0, 300)}`);
  return (await r.json()) as T;
}

export const solicitarAssinatura = onCall<PedidoAssinatura>({ secrets: [CLICKSIGN_TOKEN] }, async (req) => {
  const t = req.auth?.token;
  if (!t?.tenantId || !['socio_diretor', 'coordenador'].includes(t.role as string)) throw new HttpsError('permission-denied', 'Sem permissão para enviar contratos.');
  const tenantId = t.tenantId as string;
  const { projectId, contractId, pdfPath, sha256, signatarios } = req.data;
  const prefixo = `tenants/${tenantId}/projects/${projectId}/docs/`;
  if (typeof pdfPath !== 'string' || !pdfPath.startsWith(prefixo) || pdfPath.includes('..')) throw new HttpsError('invalid-argument', 'Caminho do PDF fora do projeto.');
  if (!Array.isArray(signatarios) || signatarios.length === 0) throw new HttpsError('invalid-argument', 'Informe ao menos um signatário.');

  const contratoRef = db.doc(`tenants/${tenantId}/projects/${projectId}/contracts/${contractId}`);
  const contrato = await contratoRef.get();
  if (!contrato.exists) throw new HttpsError('not-found', 'Contrato não encontrado.');
  if (contrato.data()!.status !== 'rascunho') throw new HttpsError('failed-precondition', 'Este contrato já foi enviado para assinatura.');

  // O servidor recalcula o hash: o documento enviado ao provedor é exatamente o que o usuário viu.
  const [pdf] = await getStorage().bucket().file(pdfPath).download();
  const hashServidor = createHash('sha256').update(pdf).digest('hex');
  if (hashServidor !== sha256) throw new HttpsError('data-loss', 'O hash SHA-256 do PDF não confere com o informado.');

  const doc = await clicksign<{ document: { key: string } }>('documents', {
    document: {
      path: `/${tenantId}/${projectId}/${contractId}.pdf`,
      content_base64: `data:application/pdf;base64,${pdf.toString('base64')}`,
      deadline_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      auto_close: true, locale: 'pt-BR', sequence_enabled: false,
    },
  });
  for (const s of signatarios) {
    const signer = await clicksign<{ signer: { key: string } }>('signers', {
      signer: { email: s.email, name: s.nome, documentation: s.cpf, auths: ['email'], has_documentation: Boolean(s.cpf) },
    });
    await clicksign('lists', {
      list: { document_key: doc.document.key, signer_key: signer.signer.key, sign_as: s.papel === 'testemunha' ? 'witness' : s.papel === 'contratada' ? 'contractor' : 'contractee' },
    });
  }
  await db.doc(`signatureRequests/${doc.document.key}`).set({ caminho: contratoRef.path, tenantId, criadoEm: agora() });
  await contratoRef.update({
    status: 'enviado_assinatura', pdfPath, sha256: hashServidor,
    assinatura: { provedor: 'clicksign', documentoId: doc.document.key, enviadoEm: agora(), enviadoPor: req.auth!.uid },
  });
  return { documentoId: doc.document.key, sha256: hashServidor };
});

/** Webhook da Clicksign: valida o HMAC do corpo bruto antes de confiar em qualquer campo. */
export const webhookAssinatura = onRequest({ secrets: [CLICKSIGN_HMAC] }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }
  const recebido = String(req.header('Content-Hmac') ?? '').replace(/^sha256=/, '');
  const esperado = createHmac('sha256', CLICKSIGN_HMAC.value()).update(req.rawBody).digest('hex');
  const a = Buffer.from(recebido, 'hex');
  const b = Buffer.from(esperado, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) { res.status(401).send('assinatura inválida'); return; }

  const evento = req.body?.event?.name as string | undefined;
  const chave = req.body?.document?.key as string | undefined;
  if (!chave) { res.status(400).send('payload sem document.key'); return; }
  const pedido = await db.doc(`signatureRequests/${chave}`).get();
  if (!pedido.exists) { res.status(200).send('documento desconhecido'); return; } // 200: evita reenvios infinitos
  const contratoRef = db.doc(pedido.data()!.caminho as string);
  if (evento === 'auto_close' || evento === 'close') {
    await contratoRef.update({ status: 'assinado', 'assinatura.assinadoEm': agora() });
  } else if (evento === 'cancel' || evento === 'deadline') {
    await contratoRef.update({ status: 'cancelado', 'assinatura.encerradoEm': agora(), 'assinatura.motivo': evento });
  } else if (evento === 'sign') {
    await contratoRef.update({ 'assinatura.assinaturasParciais': FieldValue.arrayUnion({ email: req.body?.event?.data?.signer?.email ?? '', em: agora() }) });
  }
  res.status(200).send('ok');
});

// ───────────────────── 6. Alertas diários de ART / RRT ─────────────────────

export const alertasArtRrt = onSchedule({ schedule: '0 8 * * *', timeZone: 'America/Sao_Paulo' }, async () => {
  const limite = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const pendentes = await db.collectionGroup('artRrt').where('vencimento', '<=', limite).get();
  for (const doc of pendentes.docs) {
    const d = doc.data();
    if (!['a_emitir', 'emitida'].includes(d.status) || !d.tenantId) continue;
    // Um alerta por registro por dia (id determinístico = idempotente em reexecuções).
    const id = `art-${doc.id}-${new Date().toISOString().slice(0, 10)}`;
    await db.doc(`tenants/${d.tenantId}/notifications/${id}`).set({
      tipo: 'art_vencendo', projectId: d.projectId, destinatarios: [], lidaPor: [], criadoEm: agora(),
      titulo: `${d.tipo} ${d.status === 'a_emitir' ? 'a emitir' : 'a pagar'} — ${d.projetoNome ?? ''}`,
      mensagem: `${d.tipo} de ${d.disciplina} (${d.etapa}) vence em ${String(d.vencimento).split('-').reverse().join('/')}.`,
    });
  }
});
