'use client';
/**
 * Fotos do Diário de Obra: compressão no aparelho (a foto do celular de 5–10 MB vira ~400 kB),
 * miniatura para listas e envio ao Storage em organizations/{org}/diario/{obra}/{diário}/.
 * O registro do diário guarda só os endereços e as legendas (campo `photos`).
 */
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { MODO_DEMO, storage } from '@/lib/firebase/client';

export interface FotoDiario {
  id: string;
  url: string;
  thumb: string;
  path?: string;
  thumbPath?: string;
  legenda: string;
  /** Serviço (atividade do cronograma) que a foto documenta. */
  activityId: string;
  /** Foto só para uso interno: não vai para o Portal do Cliente. */
  privada: boolean;
  largura: number;
  altura: number;
  tiradaEm: string;
  enviadaPor: string;
}
export interface FotoNova { chave: string; arquivo: File; previa: string; legenda: string; activityId: string; privada: boolean }

export const MAX_FOTOS_POR_DIA = 40;
export const MAX_BYTES_ORIGINAL = 30 * 1024 * 1024;

async function decodificar(arquivo: File): Promise<{ fonte: CanvasImageSource; largura: number; altura: number; liberar: () => void }> {
  // createImageBitmap respeita a orientação EXIF (foto de celular "deitada").
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(arquivo, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      return { fonte: bmp, largura: bmp.width, altura: bmp.height, liberar: () => bmp.close() };
    } catch { /* tenta pelo elemento <img> */ }
  }
  const url = URL.createObjectURL(arquivo);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  try { await img.decode(); } catch { URL.revokeObjectURL(url); throw new Error(`Não foi possível abrir "${arquivo.name}". Use fotos JPG ou PNG.`); }
  return { fonte: img, largura: img.naturalWidth, altura: img.naturalHeight, liberar: () => URL.revokeObjectURL(url) };
}

function redimensionar(fonte: CanvasImageSource, largura: number, altura: number, max: number, qualidade: number): Promise<{ blob: Blob; largura: number; altura: number }> {
  const f = Math.min(1, max / Math.max(largura, altura));
  const w = Math.max(1, Math.round(largura * f)), h = Math.max(1, Math.round(altura * f));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('O navegador não conseguiu processar a imagem.'));
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h); // PNG com transparência vira fundo branco no JPG
  ctx.drawImage(fonte, 0, 0, w, h);
  return new Promise((ok, falha) => canvas.toBlob((b) => (b ? ok({ blob: b, largura: w, altura: h }) : falha(new Error('Falha ao comprimir a imagem.'))), 'image/jpeg', qualidade));
}

/** Foto (até 1600 px, JPG 82%) e miniatura (480 px). */
export async function prepararFoto(arquivo: File) {
  if (!arquivo.type.startsWith('image/') && !/\.(jpe?g|png|webp|heic|heif)$/i.test(arquivo.name)) throw new Error(`"${arquivo.name}" não é uma imagem.`);
  if (arquivo.size > MAX_BYTES_ORIGINAL) throw new Error(`"${arquivo.name}" passa de 30 MB.`);
  const d = await decodificar(arquivo);
  try {
    const foto = await redimensionar(d.fonte, d.largura, d.altura, 1600, 0.82);
    const mini = await redimensionar(d.fonte, d.largura, d.altura, 480, 0.75);
    return { foto, mini };
  } finally { d.liberar(); }
}

const novoId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Comprime e envia as fotos novas de um diário. Devolve os registros prontos para o campo `photos`. */
export async function enviarFotos(orgId: string, workId: string, logId: string, novas: FotoNova[], uid: string, progresso?: (feitas: number, total: number) => void): Promise<FotoDiario[]> {
  const saida: FotoDiario[] = [];
  let feitas = 0;
  for (const n of novas) {
    const { foto, mini } = await prepararFoto(n.arquivo);
    const id = novoId(), base = `organizations/${orgId}/diario/${workId || 'geral'}/${logId}/${id}`;
    const tiradaEm = new Date(n.arquivo.lastModified || Date.now()).toISOString();
    let url: string, thumb: string;
    if (MODO_DEMO) {
      url = URL.createObjectURL(foto.blob);
      thumb = URL.createObjectURL(mini.blob);
    } else {
      const meta = { contentType: 'image/jpeg', cacheControl: 'public,max-age=31536000', customMetadata: { uid } };
      const [a, b] = await Promise.all([uploadBytes(ref(storage(), `${base}.jpg`), foto.blob, meta), uploadBytes(ref(storage(), `${base}_t.jpg`), mini.blob, meta)]);
      [url, thumb] = await Promise.all([getDownloadURL(a.ref), getDownloadURL(b.ref)]);
    }
    saida.push({ id, url, thumb, ...(MODO_DEMO ? {} : { path: `${base}.jpg`, thumbPath: `${base}_t.jpg` }), legenda: n.legenda.trim().slice(0, 240), activityId: n.activityId, privada: n.privada,
      largura: foto.largura, altura: foto.altura, tiradaEm, enviadaPor: uid });
    feitas++;
    progresso?.(feitas, novas.length);
  }
  return saida;
}

/** Remove os arquivos de fotos excluídas do diário (melhor esforço: o registro já não aponta para elas). */
export async function apagarArquivos(fotos: FotoDiario[]): Promise<void> {
  if (MODO_DEMO) return;
  await Promise.all(fotos.flatMap((f) => [f.path, f.thumbPath].filter(Boolean).map((p) => deleteObject(ref(storage(), p!)).catch(() => undefined))));
}

/** Lê o campo `photos` de um registro com tolerância a dados antigos ou incompletos. */
export function fotosDe(registro: Record<string, unknown> | null | undefined): FotoDiario[] {
  const l = registro?.photos;
  if (!Array.isArray(l)) return [];
  return l.filter((f): f is FotoDiario => !!f && typeof f === 'object' && typeof (f as FotoDiario).url === 'string')
    .map((f) => ({ ...f, thumb: f.thumb || f.url, legenda: f.legenda ?? '', activityId: f.activityId ?? '', privada: !!f.privada }));
}
