'use client';
/** Peças comuns das telas de controle: impressão só da área do relatório, download e tabela simples. */
import * as React from 'react';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function imprimirArea() {
  document.body.dataset.imprimir = 'area';
  const limpar = () => { delete document.body.dataset.imprimir; window.removeEventListener('afterprint', limpar); };
  window.addEventListener('afterprint', limpar);
  window.print();
  setTimeout(limpar, 1500);
}
export const BotaoImprimir = ({ rotulo = 'Imprimir / PDF' }: { rotulo?: string }) => <Button variant="outline" className="print:hidden" onClick={imprimirArea}><Printer className="h-4 w-4" />{rotulo}</Button>;

export function baixar(dados: BlobPart, nome: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([dados], { type: tipo }));
  const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 20000);
}
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const csvDe = (linhas: (string | number)[][]) => `﻿${linhas.map((l) => l.map((v) => `"${String(typeof v === 'number' ? String(v).replace('.', ',') : v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n')}\r\n`;
export const nomeArquivo = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '');

/** Tabela a partir de linhas (1ª = cabeçalho); números à direita no formato brasileiro. */
export function TabelaLinhas({ linhas, vazio = 'Nenhum registro.', dinheiro }: { linhas: (string | number)[][]; vazio?: string; dinheiro?: Set<number> }) {
  if (linhas.length <= 1) return <p className="py-4 text-sm text-muted-foreground">{vazio}</p>;
  const [cab, ...corpo] = linhas;
  return (
    <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
      <thead><tr className="border-b text-left text-xs text-muted-foreground">{cab!.map((h, i) => <th key={i} className="px-2 py-2 font-medium first:pl-0">{h}</th>)}</tr></thead>
      <tbody className="divide-y">{corpo.map((l, r) => <tr key={r} className="align-top">{l.map((v, i) => <td key={i} className={`max-w-[260px] px-2 py-1.5 first:pl-0 ${typeof v === 'number' ? 'tabular whitespace-nowrap text-right' : ''}`}>
        {typeof v === 'number' ? v.toLocaleString('pt-BR', dinheiro?.has(i) ? { style: 'currency', currency: 'BRL' } : { maximumFractionDigits: 2 }) : v}</td>)}</tr>)}</tbody>
    </table></div>
  );
}
