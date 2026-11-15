/**
 * Pix "copia e cola" (BR Code estático, Manual de Padrões para Iniciação do Pix — BCB).
 * Gera o texto que o pagador cola no aplicativo do banco ou lê pelo QR Code; o dinheiro cai
 * direto na conta da chave informada, sem intermediário.
 */
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '').trim();
const tlv = (id: string, valor: string) => `${id}${String(valor.length).padStart(2, '0')}${valor}`;

/** CRC-16/CCITT-FALSE (polinômio 0x1021, valor inicial 0xFFFF). */
export function crc16(texto: string): string {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Normaliza a chave como o banco espera: telefone com +55, CPF/CNPJ só dígitos, e-mail minúsculo. */
export function normalizarChave(chave: string): string {
  const c = chave.trim();
  if (c.includes('@')) return c.toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c)) return c.toLowerCase();
  if (c.startsWith('+')) return `+${c.replace(/\D/g, '')}`;
  const d = c.replace(/\D/g, '');
  // (71) 99999-8888 → telefone; 11 dígitos sem pontuação de telefone → CPF.
  if (/^\(?\d{2}\)?\s?9?\d{4}-?\d{4}$/.test(c) && /[()\s-]/.test(c)) return `+55${d}`;
  return d;
}

export interface DadosPix { chave: string; nome: string; cidade: string; valor?: number; identificador?: string; descricao?: string }

export function pixCopiaECola(d: DadosPix): string {
  const chave = normalizarChave(d.chave);
  if (!chave) throw new Error('Informe a chave Pix.');
  const nome = semAcento(d.nome).slice(0, 25), cidade = semAcento(d.cidade).slice(0, 15);
  if (!nome || !cidade) throw new Error('Informe o nome do recebedor e a cidade.');
  if (d.valor !== undefined && !(d.valor > 0 && d.valor < 1e10)) throw new Error('Valor inválido.');
  const descricao = semAcento(d.descricao ?? '').slice(0, Math.max(0, 99 - 22 - 4 - chave.length - 4));
  const conta = tlv('00', 'br.gov.bcb.pix') + tlv('01', chave) + (descricao ? tlv('02', descricao) : '');
  if (conta.length > 99) throw new Error('Chave Pix longa demais.');
  const txid = (d.identificador ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  const corpo = tlv('00', '01') + tlv('26', conta) + tlv('52', '0000') + tlv('53', '986')
    + (d.valor !== undefined ? tlv('54', d.valor.toFixed(2)) : '') + tlv('58', 'BR') + tlv('59', nome) + tlv('60', cidade)
    + tlv('62', tlv('05', txid)) + '6304';
  return corpo + crc16(corpo);
}

/** Confere se um texto é um BR Code íntegro (CRC bate). */
export const pixIntegro = (codigo: string) => /6304[0-9A-F]{4}$/.test(codigo) && crc16(codigo.slice(0, -4)) === codigo.slice(-4);
