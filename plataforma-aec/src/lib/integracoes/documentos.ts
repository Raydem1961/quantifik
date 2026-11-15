/** CPF, CNPJ e chave de acesso de NF-e: validação pelos dígitos verificadores. */
const digitos = (s: string) => s.replace(/\D/g, '');

export function cpfValido(v: string): boolean {
  const d = digitos(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

export function cnpjValido(v: string): boolean {
  const d = digitos(v);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (n: number) => { let s = 0, p = n - 7; for (let i = 0; i < n; i++) { s += Number(d[i]) * p--; if (p < 2) p = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

/** Chave de acesso (44 dígitos): módulo 11 com pesos 2 a 9 da direita para a esquerda. */
export function chaveNfeValida(v: string): boolean {
  const d = digitos(v);
  if (d.length !== 44) return false;
  let s = 0, p = 2;
  for (let i = 42; i >= 0; i--) { s += Number(d[i]) * p; p = p === 9 ? 2 : p + 1; }
  const r = s % 11, dv = r < 2 ? 0 : 11 - r;
  return dv === Number(d[43]);
}

export const formatarCnpj = (v: string) => { const d = digitos(v); return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : v; };
export const formatarCpf = (v: string) => { const d = digitos(v); return d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : v; };
export const soDigitos = digitos;
