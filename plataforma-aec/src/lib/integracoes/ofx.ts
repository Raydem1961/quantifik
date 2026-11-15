/**
 * Extrato bancário em OFX (o arquivo que todo banco brasileiro exporta no internet banking) e
 * conciliação com os lançamentos do Financeiro. Nada é enviado a terceiros: o arquivo é lido
 * no próprio navegador.
 */
export interface Movimento { id: string; data: string; valor: number; historico: string; tipo: string }
export interface Extrato { banco: string; conta: string; inicio: string; fim: string; saldo: number | null; movimentos: Movimento[] }

const campo = (bloco: string, nome: string): string => {
  // OFX 1.x é SGML (tags sem fechamento); OFX 2.x é XML. O valor vai até a próxima tag ou quebra de linha.
  const m = new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i').exec(bloco);
  return m ? m[1]!.trim() : '';
};
const data = (v: string) => (/^\d{8}/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : '');
const numero = (v: string) => {
  const t = v.trim();
  // Alguns bancos usam vírgula decimal (e ponto de milhar), fora do padrão.
  const n = Number(/,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : NaN;
};

export function lerOfx(texto: string): Extrato {
  if (!/<OFX>/i.test(texto) || !/<STMTTRN>/i.test(texto)) throw new Error('Este arquivo não é um extrato OFX com movimentos. No internet banking, exporte o extrato no formato OFX (Money).');
  const movimentos: Movimento[] = [];
  const vistos = new Map<string, number>();
  for (const bloco of texto.split(/<STMTTRN>/i).slice(1)) {
    const b = bloco.split(/<\/STMTTRN>|<\/BANKTRANLIST>/i)[0]!;
    const valor = numero(campo(b, 'TRNAMT')), dia = data(campo(b, 'DTPOSTED'));
    if (!dia || Number.isNaN(valor)) continue;
    const historico = [campo(b, 'NAME'), campo(b, 'MEMO')].filter((x, i, l) => x && l.indexOf(x) === i).join(' — ') || campo(b, 'TRNTYPE');
    // Há bancos que repetem o FITID no mesmo arquivo: o identificador precisa ser único.
    const base = campo(b, 'FITID') || `${dia}:${valor}:${historico}`;
    const n = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, n);
    movimentos.push({ id: n > 1 ? `${base}#${n}` : base, data: dia, valor, historico, tipo: campo(b, 'TRNTYPE').toUpperCase() });
  }
  const saldoTxt = /<LEDGERBAL>([\s\S]*?)(<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>|$)/i.exec(texto)?.[1] ?? '';
  const saldo = numero(campo(saldoTxt, 'BALAMT'));
  const datas = movimentos.map((m) => m.data).sort();
  return {
    banco: campo(texto, 'BANKID') || campo(texto, 'ORG'), conta: campo(texto, 'ACCTID'),
    inicio: data(campo(texto, 'DTSTART')) || datas[0] || '', fim: data(campo(texto, 'DTEND')) || datas[datas.length - 1] || '',
    saldo: Number.isNaN(saldo) ? null : saldo, movimentos,
  };
}

export interface Lancamento { id: string; type?: unknown; value?: unknown; status?: unknown; dueDate?: unknown; date?: unknown; paymentDate?: unknown; description?: unknown; bankRef?: unknown; deleted?: unknown }
export type Situacao = 'ja_conciliado' | 'sugestao' | 'sem_par';
export interface Linha { movimento: Movimento; situacao: Situacao; lancamento?: Lancamento; diasDeDiferenca?: number }

const dias = (a: string, b: string) => Math.abs((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);

/**
 * Casa cada movimento do extrato com um lançamento em aberto de mesmo sentido e mesmo valor,
 * vencendo até `tolerancia` dias antes ou depois. Cada lançamento é usado uma única vez, e o par
 * escolhido é sempre o de data mais próxima. Movimentos já conciliados (bankRef) não se repetem.
 */
export function conciliar(movimentos: Movimento[], lancamentos: Lancamento[], tolerancia = 5): Linha[] {
  const vivos = lancamentos.filter((l) => !l.deleted);
  const porRef = new Map(vivos.filter((l) => l.bankRef).map((l) => [String(l.bankRef), l]));
  const abertos = vivos.filter((l) => !l.bankRef && !['Pago', 'Recebido'].includes(String(l.status)));
  const usados = new Set<string>();
  return movimentos.map((m) => {
    const feito = porRef.get(m.id);
    if (feito) return { movimento: m, situacao: 'ja_conciliado' as const, lancamento: feito };
    const tipo = m.valor >= 0 ? 'Receita' : 'Despesa', alvo = Math.round(Math.abs(m.valor) * 100);
    let melhor: { l: Lancamento; d: number } | undefined;
    for (const l of abertos) {
      if (usados.has(l.id) || l.type !== tipo || Math.round(Number(l.value) * 100) !== alvo) continue;
      const ref = String(l.dueDate || l.date || '').slice(0, 10);
      const d = ref ? dias(ref, m.data) : Infinity;
      if (d <= tolerancia && (!melhor || d < melhor.d)) melhor = { l, d };
    }
    if (!melhor) return { movimento: m, situacao: 'sem_par' as const };
    usados.add(melhor.l.id);
    return { movimento: m, situacao: 'sugestao' as const, lancamento: melhor.l, diasDeDiferenca: melhor.d };
  });
}
