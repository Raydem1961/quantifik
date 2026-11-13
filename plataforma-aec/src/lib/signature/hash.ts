/** SHA-256 (Web Crypto — navegador e Node 18+) e envelope de assinatura digital. */

export async function sha256Hex(dados: ArrayBuffer | Uint8Array | Blob | string): Promise<string> {
  let buffer: ArrayBuffer;
  if (typeof dados === 'string') buffer = new TextEncoder().encode(dados).buffer as ArrayBuffer;
  else if (dados instanceof Blob) buffer = await dados.arrayBuffer();
  else if (dados instanceof Uint8Array) buffer = dados.buffer.slice(dados.byteOffset, dados.byteOffset + dados.byteLength) as ArrayBuffer;
  else buffer = dados;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type ProvedorAssinatura = 'clicksign' | 'docusign' | 'govbr';

export interface Signatario {
  nome: string;
  email: string;
  cpf?: string;
  papel: 'contratante' | 'contratada' | 'testemunha';
}

/** Payload enviado à Cloud Function `solicitarAssinatura`. */
export interface PedidoAssinatura {
  tenantId: string;
  projectId: string;
  contractId: string;
  provedor: ProvedorAssinatura;
  /** Caminho do PDF no Cloud Storage. */
  pdfPath: string;
  /** Hash calculado no cliente; o servidor recalcula e recusa se divergir. */
  sha256: string;
  signatarios: Signatario[];
}

/** Texto de rodapé que amarra o PDF ao seu hash (verificação de integridade). */
export function textoIntegridade(sha256: string, geradoEm: Date): string {
  return `Documento gerado em ${geradoEm.toLocaleString('pt-BR')} · SHA-256 do conteúdo: ${sha256}`;
}
