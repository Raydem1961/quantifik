/**
 * Leitura do XML de NF-e (modelo 55) recebido do fornecedor: emitente, itens, total e
 * duplicatas, para virar fornecedor + contas a pagar sem redigitar. Leitura local; a consulta
 * e a manifestação na SEFAZ dependem do certificado digital da empresa e não são feitas aqui.
 */
import { chaveNfeValida } from './documentos';

export interface ItemNfe { codigo: string; descricao: string; ncm: string; unidade: string; quantidade: number; valorUnitario: number; valorTotal: number }
export interface Duplicata { numero: string; vencimento: string; valor: number }
export interface Nfe {
  chave: string; chaveValida: boolean; numero: string; serie: string; emissao: string; natureza: string;
  emitente: { cnpj: string; nome: string; fantasia: string; municipio: string; uf: string };
  destinatario: { documento: string; nome: string };
  itens: ItemNfe[]; duplicatas: Duplicata[]; valorTotal: number; valorProdutos: number; valorFrete: number; valorDesconto: number;
  autorizada: boolean; protocolo: string;
}

const txt = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
const bloco = (xml: string, tag: string) => new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(xml)?.[1] ?? '';
const blocos = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => m[1]!);
const val = (xml: string, tag: string) => txt(bloco(xml, tag));
const num = (xml: string, tag: string) => Number(val(xml, tag)) || 0;

export function lerNfe(xml: string): Nfe {
  const inf = /<infNFe[^>]*\bId="NFe(\d{44})"/.exec(xml);
  if (!inf || !/<emit>/.test(xml)) throw new Error('Este arquivo não é um XML de NF-e (modelo 55). Peça ao fornecedor o arquivo .xml da nota, não o PDF (DANFE).');
  const ide = bloco(xml, 'ide'), emit = bloco(xml, 'emit'), dest = bloco(xml, 'dest'), tot = bloco(xml, 'ICMSTot'), prot = bloco(xml, 'infProt');
  if (val(ide, 'mod') && val(ide, 'mod') !== '55') throw new Error(`Modelo ${val(ide, 'mod')} não suportado: apenas NF-e (modelo 55).`);
  const itens = blocos(xml, 'det').map((d) => {
    const p = bloco(d, 'prod');
    return { codigo: val(p, 'cProd'), descricao: val(p, 'xProd'), ncm: val(p, 'NCM'), unidade: val(p, 'uCom'), quantidade: num(p, 'qCom'), valorUnitario: num(p, 'vUnCom'), valorTotal: num(p, 'vProd') };
  });
  const duplicatas = blocos(bloco(xml, 'cobr'), 'dup').map((d) => ({ numero: val(d, 'nDup'), vencimento: val(d, 'dVenc').slice(0, 10), valor: num(d, 'vDup') }));
  return {
    chave: inf[1]!, chaveValida: chaveNfeValida(inf[1]!), numero: val(ide, 'nNF'), serie: val(ide, 'serie'), emissao: (val(ide, 'dhEmi') || val(ide, 'dEmi')).slice(0, 10), natureza: val(ide, 'natOp'),
    emitente: { cnpj: val(emit, 'CNPJ') || val(emit, 'CPF'), nome: val(emit, 'xNome'), fantasia: val(emit, 'xFant'), municipio: val(emit, 'xMun'), uf: val(emit, 'UF') },
    destinatario: { documento: val(dest, 'CNPJ') || val(dest, 'CPF'), nome: val(dest, 'xNome') },
    itens, duplicatas, valorTotal: num(tot, 'vNF'), valorProdutos: num(tot, 'vProd'), valorFrete: num(tot, 'vFrete'), valorDesconto: num(tot, 'vDesc'),
    autorizada: val(prot, 'cStat') === '100', protocolo: val(prot, 'nProt'),
  };
}

/** Contas a pagar da nota: uma por duplicata; sem duplicatas, uma só no valor total com vencimento na emissão. */
export function parcelasDaNfe(n: Nfe): Duplicata[] {
  const d = n.duplicatas.filter((x) => x.valor > 0 && x.vencimento);
  return d.length ? d : [{ numero: '001', vencimento: n.emissao, valor: n.valorTotal }];
}
