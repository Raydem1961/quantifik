/**
 * Tabela de preços de insumos do próprio fornecedor/escritório (como no Quantifik): CSV, TXT,
 * texto colado ou planilha Excel (.xlsx). Reconhece as colunas pelo cabeçalho ("código",
 * "preço/valor/custo"); sem cabeçalho, usa a 1ª coluna como código e a última numérica como preço.
 */
import { unzipSync, strFromU8 } from 'fflate';

const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
/** Número em formato brasileiro ou internacional: "1.234,56", "1234.56", "R$ 12,3". */
export function numeroBr(v: string): number {
  const t = String(v ?? '').replace(/[R$\s]/g, '');
  if (!t) return NaN;
  const n = /,\d{1,4}$/.test(t) ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t.replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

export function linhasDeTexto(texto: string): string[][] {
  const linhas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const amostra = linhas.slice(0, 20).join('\n');
  const sep = (amostra.match(/\t/g)?.length ?? 0) > 0 ? '\t' : (amostra.match(/;/g)?.length ?? 0) > 0 ? ';' : ',';
  return linhas.map((l) => l.split(sep).map((c) => c.replace(/^"|"$/g, '').trim()));
}

/** Planilha .xlsx (primeira aba) em linhas de texto, sem bibliotecas pesadas. */
export function linhasDeXlsx(dados: Uint8Array): string[][] {
  let arquivos: Record<string, Uint8Array>;
  try { arquivos = unzipSync(dados); } catch { throw new Error('Arquivo Excel ilegível. Salve como .xlsx ou exporte em CSV.'); }
  const xml = (nome: string) => (arquivos[nome] ? strFromU8(arquivos[nome]!) : '');
  const desesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  const comp = [...xml('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => desesc([...m[1]!.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
  const rels = xml('xl/_rels/workbook.xml.rels'), wb = xml('xl/workbook.xml');
  const rid = /<sheet\b[^>]*r:id="([^"]+)"/.exec(wb)?.[1];
  const alvo = rid ? new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${rid}"`).exec(rels) : null;
  const caminho = alvo ? `xl/${(alvo[1] ?? alvo[2])!.replace(/^\/?xl\//, '').replace(/^\//, '')}` : 'xl/worksheets/sheet1.xml';
  const folha = xml(caminho) || xml('xl/worksheets/sheet1.xml');
  if (!folha) throw new Error('A planilha não tem abas legíveis.');
  const col = (ref: string) => [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const linhas: string[][] = [];
  for (const r of folha.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const linha: string[] = [];
    for (const c of r[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1]!, corpo = c[2] ?? '', ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1], tipo = /t="([^"]+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(corpo)?.[1] ?? '';
      const valor = tipo === 's' ? comp[Number(v)] ?? '' : tipo === 'inlineStr' ? desesc([...corpo.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')) : desesc(v);
      linha[ref ? col(ref) : linha.length] = valor;
    }
    linhas.push(Array.from(linha, (x) => x ?? ''));
  }
  return linhas;
}

/** Código → preço. Códigos só com dígitos (como no SINAPI/ORSE); preços positivos. */
export function tabelaDePrecos(linhas: string[][]): { precos: Map<string, number>; ignoradas: number } {
  let iCod = -1, iPreco = -1, inicio = 0;
  for (let i = 0; i < Math.min(linhas.length, 15); i++) {
    const h = linhas[i]!.map(sem);
    const c = h.findIndex((x) => /^(cod|codigo|cod\.|cod insumo|codigo do insumo|item)/.test(x));
    const p = h.findIndex((x) => /(preco|valor|custo|unit|mediano|r\$)/.test(x));
    if (c >= 0 && p >= 0) { iCod = c; iPreco = p; inicio = i + 1; break; }
  }
  const precos = new Map<string, number>();
  let ignoradas = 0;
  for (const l of linhas.slice(inicio)) {
    const cod = ((iCod >= 0 ? l[iCod] : l[0])?.replace(/\D/g, '') ?? '').replace(/^0+(?=\d)/, '');
    let v = NaN;
    if (iPreco >= 0) v = numeroBr(l[iPreco] ?? '');
    else for (let k = l.length - 1; k > 0 && !(v > 0); k--) v = numeroBr(l[k] ?? '');
    if (cod && v > 0 && v < 1e9) precos.set(cod, Math.round(v * 100) / 100); else ignoradas++;
  }
  return { precos, ignoradas };
}
