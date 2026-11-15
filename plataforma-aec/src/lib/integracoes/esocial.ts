/**
 * Conferência cadastral para o eSocial: aponta, pessoa por pessoa, o que falta ou está inválido
 * nos dados que o evento de admissão (S-2200) exige, e exporta a planilha para a contabilidade
 * ou o sistema de folha. A transmissão ao governo exige o certificado digital da empresa e é
 * feita pelo sistema de folha/contabilidade — este módulo prepara e confere os dados.
 */
import { cpfValido, formatarCpf } from './documentos';

export type Pessoa = { id: string; deleted?: unknown } & Record<string, unknown>;
export interface Conferencia { pessoa: Pessoa; pendencias: string[] }

export function conferirPessoa(p: Pessoa): string[] {
  const out: string[] = [];
  const s = (k: string) => String(p[k] ?? '').trim();
  if (s('name').split(/\s+/).length < 2) out.push('Nome completo');
  if (!s('cpf')) out.push('CPF'); else if (!cpfValido(s('cpf'))) out.push('CPF inválido');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s('birthDate'))) out.push('Data de nascimento');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s('admission'))) out.push('Data de admissão');
  else if (s('birthDate') && s('admission') < s('birthDate')) out.push('Admissão anterior ao nascimento');
  if (!s('role')) out.push('Função');
  if (!/^\d{6}$/.test(s('cbo').replace(/\D/g, ''))) out.push('CBO (6 dígitos)');
  if (!(Number(p.salary) > 0)) out.push('Salário');
  return out;
}

export const conferir = (pessoas: Pessoa[]): Conferencia[] =>
  pessoas.filter((p) => !p.deleted && p.status !== 'Inativo').map((pessoa) => ({ pessoa, pendencias: conferirPessoa(pessoa) }))
    .sort((a, b) => b.pendencias.length - a.pendencias.length || String(a.pessoa.name).localeCompare(String(b.pessoa.name)));

/** Planilha (CSV com ; e BOM, abre direto no Excel) dos trabalhadores, para a contabilidade. */
export function planilhaTrabalhadores(lista: Conferencia[], obra: (id: unknown) => string): string {
  const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const linhas = [['Nome', 'CPF', 'Nascimento', 'Admissão', 'Função', 'CBO', 'Salário', 'Obra', 'Situação', 'Pendências'].map(q).join(';')];
  for (const { pessoa: p, pendencias } of lista) {
    linhas.push([p.name, formatarCpf(String(p.cpf ?? '')), p.birthDate, p.admission, p.role, p.cbo, Number(p.salary || 0).toFixed(2).replace('.', ','), obra(p.workId), p.status, pendencias.join(', ')].map(q).join(';'));
  }
  return `﻿${linhas.join('\r\n')}\r\n`;
}
