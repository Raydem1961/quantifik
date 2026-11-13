/**
 * Cronograma físico-financeiro, Curva S e Curva ABC.
 * TypeScript puro — compartilhado entre frontend, PDFs e Cloud Functions.
 */
import { arredondar } from './engine';

export interface ParcelaMensal {
  mes: number;
  /** Fração do total desembolsada no mês (0..1). */
  percentual: number;
  percentualAcumulado: number;
  valor: number;
  valorAcumulado: number;
}

export interface CurvaSOpcoes {
  /** Posição do ponto de inflexão em % do prazo (10..90). Padrão 50. */
  inflexao?: number;
  /** Coeficiente de forma: maior = obra mais concentrada no meio. Padrão 2. */
  forma?: number;
}

/**
 * Curva S paramétrica clássica de planejamento de obras:
 *   %acum(n) = 1 − [1 − (n/N)^log10(I)]^s
 * onde N = prazo em meses, I = ponto de inflexão (%) e s = coeficiente de forma.
 * Os valores mensais são arredondados ao centavo e o resíduo vai para o último mês,
 * de modo que a soma das parcelas é exatamente igual ao total.
 */
export function gerarCurvaS(total: number, meses: number, opcoes: CurvaSOpcoes = {}): ParcelaMensal[] {
  if (!Number.isInteger(meses) || meses < 1) throw new RangeError('O prazo deve ser um número inteiro de meses ≥ 1.');
  if (!Number.isFinite(total) || total < 0) throw new RangeError('O valor total deve ser não negativo.');
  const inflexao = opcoes.inflexao ?? 50;
  const forma = opcoes.forma ?? 2;
  if (inflexao < 10 || inflexao > 90) throw new RangeError('A inflexão deve estar entre 10 e 90.');
  if (forma <= 0) throw new RangeError('O coeficiente de forma deve ser positivo.');

  const expoente = Math.log10(inflexao);
  const acumulado = (n: number) => 1 - (1 - (n / meses) ** expoente) ** forma;

  const parcelas: ParcelaMensal[] = [];
  let valorAcumulado = 0;
  let anterior = 0;
  for (let mes = 1; mes <= meses; mes++) {
    const pctAcum = mes === meses ? 1 : acumulado(mes);
    const valorAcumAlvo = mes === meses ? arredondar(total) : arredondar(total * pctAcum);
    const valor = arredondar(valorAcumAlvo - valorAcumulado);
    valorAcumulado = valorAcumAlvo;
    parcelas.push({
      mes,
      percentual: pctAcum - anterior,
      percentualAcumulado: pctAcum,
      valor,
      valorAcumulado,
    });
    anterior = pctAcum;
  }
  return parcelas;
}

// ───────────────────── Cronograma por etapas ─────────────────────

export interface EtapaObra {
  nome: string;
  /** Peso da etapa no custo total (as etapas são normalizadas para somar 100%). */
  peso: number;
  /** Janela de execução em fração do prazo (0..1). */
  inicio: number;
  fim: number;
}

/**
 * Distribuição de referência para edificação residencial convencional.
 * São pesos típicos de partida — cada escritório deve calibrar com seu histórico de obras.
 */
export const ETAPAS_PADRAO: EtapaObra[] = [
  { nome: 'Serviços preliminares', peso: 3, inicio: 0, fim: 0.1 },
  { nome: 'Fundações', peso: 7, inicio: 0.05, fim: 0.22 },
  { nome: 'Estrutura', peso: 18, inicio: 0.15, fim: 0.5 },
  { nome: 'Alvenaria e vedações', peso: 8, inicio: 0.3, fim: 0.6 },
  { nome: 'Cobertura e impermeabilização', peso: 6, inicio: 0.45, fim: 0.65 },
  { nome: 'Instalações elétricas e hidrossanitárias', peso: 14, inicio: 0.35, fim: 0.85 },
  { nome: 'Esquadrias e vidros', peso: 9, inicio: 0.55, fim: 0.8 },
  { nome: 'Revestimentos', peso: 13, inicio: 0.55, fim: 0.88 },
  { nome: 'Pisos', peso: 9, inicio: 0.65, fim: 0.92 },
  { nome: 'Pintura', peso: 6, inicio: 0.78, fim: 0.97 },
  { nome: 'Louças, metais e acabamentos finais', peso: 5, inicio: 0.85, fim: 1 },
  { nome: 'Limpeza e entrega', peso: 2, inicio: 0.94, fim: 1 },
];

export interface LinhaCronograma {
  etapa: string;
  /** Fração do total (0..1). */
  peso: number;
  valor: number;
  /** Valor da etapa em cada mês (índice 0 = mês 1). */
  mensal: number[];
}

export interface CronogramaFisicoFinanceiro {
  linhas: LinhaCronograma[];
  totais: ParcelaMensal[];
}

/**
 * Distribui o valor de cada etapa uniformemente dentro da sua janela de execução.
 * A soma dos meses resulta naturalmente em uma Curva S. O arredondamento é fechado
 * por etapa (resíduo no último mês ativo) e a última etapa absorve o resíduo global.
 */
export function gerarCronogramaFisicoFinanceiro(
  total: number,
  meses: number,
  etapas: EtapaObra[] = ETAPAS_PADRAO,
): CronogramaFisicoFinanceiro {
  if (!Number.isInteger(meses) || meses < 1) throw new RangeError('O prazo deve ser um número inteiro de meses ≥ 1.');
  if (etapas.length === 0) throw new RangeError('Informe ao menos uma etapa.');
  const somaPesos = etapas.reduce((s, e) => s + e.peso, 0);
  if (somaPesos <= 0) throw new RangeError('A soma dos pesos das etapas deve ser positiva.');

  let alocado = 0;
  const linhas: LinhaCronograma[] = etapas.map((etapa, idx) => {
    if (etapa.fim <= etapa.inicio || etapa.inicio < 0 || etapa.fim > 1) {
      throw new RangeError(`Janela inválida na etapa "${etapa.nome}".`);
    }
    const peso = etapa.peso / somaPesos;
    const ultima = idx === etapas.length - 1;
    const valor = ultima ? arredondar(total - alocado) : arredondar(total * peso);
    alocado += valor;

    const ini = etapa.inicio * meses;
    const fim = etapa.fim * meses;
    const duracao = fim - ini;
    const mensal: number[] = [];
    let somado = 0;
    let ultimoAtivo = -1;
    for (let m = 0; m < meses; m++) {
      // Sobreposição entre o mês [m, m+1] e a janela da etapa [ini, fim].
      const sobreposicao = Math.max(0, Math.min(m + 1, fim) - Math.max(m, ini));
      const v = arredondar((valor * sobreposicao) / duracao);
      if (sobreposicao > 1e-9) ultimoAtivo = m;
      mensal.push(v);
      somado += v;
    }
    if (ultimoAtivo >= 0) mensal[ultimoAtivo] = arredondar((mensal[ultimoAtivo] ?? 0) + (valor - somado));
    return { etapa: etapa.nome, peso, valor, mensal };
  });

  const totalFinal = linhas.reduce((s, l) => s + l.valor, 0);
  const totais: ParcelaMensal[] = [];
  let acumulado = 0;
  for (let m = 0; m < meses; m++) {
    const valor = arredondar(linhas.reduce((s, l) => s + (l.mensal[m] ?? 0), 0));
    acumulado = arredondar(acumulado + valor);
    totais.push({
      mes: m + 1,
      valor,
      valorAcumulado: acumulado,
      percentual: totalFinal > 0 ? valor / totalFinal : 0,
      percentualAcumulado: totalFinal > 0 ? acumulado / totalFinal : 0,
    });
  }
  return { linhas, totais };
}

// ───────────────────────────── Curva ABC ─────────────────────────────

export interface ItemAbc {
  descricao: string;
  valor: number;
  percentual: number;
  percentualAcumulado: number;
  classe: 'A' | 'B' | 'C';
}

/**
 * Curva ABC (Pareto): ordena os itens por valor decrescente e classifica pelo acumulado.
 * Um item pertence à classe da faixa onde o acumulado *anterior* a ele se encontra, de modo
 * que o item que cruza o limite ainda entra na classe mais relevante.
 */
export function gerarCurvaAbc(
  itens: { descricao: string; valor: number }[],
  limites: { a: number; b: number } = { a: 0.8, b: 0.95 },
): ItemAbc[] {
  const total = itens.reduce((s, i) => s + i.valor, 0);
  if (total <= 0) return [];
  let acumulado = 0;
  return [...itens]
    .sort((x, y) => y.valor - x.valor)
    .map((item) => {
      const antes = acumulado / total;
      acumulado += item.valor;
      const classe: ItemAbc['classe'] = antes < limites.a ? 'A' : antes < limites.b ? 'B' : 'C';
      return {
        descricao: item.descricao,
        valor: arredondar(item.valor),
        percentual: item.valor / total,
        percentualAcumulado: acumulado / total,
        classe,
      };
    });
}
