/**
 * Autodesk Platform Services (APS): conversão de DWG no servidor.
 * Fluxo: token 2-legged → upload assinado no OSS → job do Model Derivative → propriedades.
 * Requer as secrets APS_CLIENT_ID / APS_CLIENT_SECRET e um bucket OSS (APS_BUCKET).
 */
const BASE = 'https://developer.api.autodesk.com';

async function json<T>(resposta: Response, etapa: string): Promise<T> {
  if (!resposta.ok) throw new Error(`APS ${etapa}: HTTP ${resposta.status} — ${(await resposta.text()).slice(0, 300)}`);
  return (await resposta.json()) as T;
}

export async function obterToken(clientId: string, clientSecret: string): Promise<string> {
  const r = await fetch(`${BASE}/authentication/v2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'data:read data:write data:create bucket:create bucket:read' }),
  });
  return (await json<{ access_token: string }>(r, 'token')).access_token;
}

/** Envia o DWG ao OSS (upload direto S3 assinado) e devolve o URN em base64url. */
export async function enviarParaOss(token: string, bucket: string, objeto: string, dados: Buffer): Promise<string> {
  const auth = { Authorization: `Bearer ${token}` };
  const chave = encodeURIComponent(objeto);
  const assinado = await json<{ uploadKey: string; urls: string[] }>(
    await fetch(`${BASE}/oss/v2/buckets/${bucket}/objects/${chave}/signeds3upload`, { headers: auth }),
    'signeds3upload',
  );
  const put = await fetch(assinado.urls[0]!, { method: 'PUT', body: new Uint8Array(dados) });
  if (!put.ok) throw new Error(`APS upload S3: HTTP ${put.status}`);
  const final = await json<{ objectId: string }>(
    await fetch(`${BASE}/oss/v2/buckets/${bucket}/objects/${chave}/signeds3upload`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadKey: assinado.uploadKey }),
    }),
    'finalizar upload',
  );
  return Buffer.from(final.objectId).toString('base64url');
}

/** Dispara a tradução para SVF2 (visualização 2D/3D + extração de propriedades). */
export async function iniciarTraducao(token: string, urn: string): Promise<void> {
  const r = await fetch(`${BASE}/modelderivative/v2/designdata/job`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-ads-force': 'true' },
    body: JSON.stringify({ input: { urn }, output: { formats: [{ type: 'svf2', views: ['2d', '3d'] }] } }),
  });
  await json(r, 'job');
}

export async function statusTraducao(token: string, urn: string): Promise<{ status: string; progress: string }> {
  return json(await fetch(`${BASE}/modelderivative/v2/designdata/${urn}/manifest`, { headers: { Authorization: `Bearer ${token}` } }), 'manifest');
}
