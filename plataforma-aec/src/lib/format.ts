export const brl = (v: number, casas = 2) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: casas, maximumFractionDigits: casas });
export const num = (v: number, casas = 2) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
export const pct = (v: number, casas = 1) => `${num(v * 100, casas)}%`;
/** R$ 1,2 mi / R$ 850 mil — para KPIs e eixos. */
export const brlCompacto = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e6) return `R$ ${num(v / 1e6, a >= 1e7 ? 1 : 2)} mi`;
  if (a >= 1e3) return `R$ ${num(v / 1e3, 0)} mil`;
  return brl(v, 0);
};
export const dataBr = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};
export const dataExtenso = (d: Date) => d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
export const diasAte = (iso: string, hoje = new Date()) =>
  Math.ceil((new Date(`${iso.slice(0, 10)}T00:00:00`).getTime() - new Date(hoje.toDateString()).getTime()) / 86400000);
