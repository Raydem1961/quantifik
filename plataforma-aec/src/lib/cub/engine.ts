/**
 * Motor de orçamentação paramétrica: CUB estadual × área equivalente (ABNT NBR 12721:2006).
 *
 * TypeScript puro, sem dependências — o mesmo arquivo roda no navegador, nas Cloud Functions
 * e nos testes. Todos os valores monetários são em reais (R$) e arredondados ao centavo
 * somente na saída, para não acumular erro de arredondamento nas etapas intermediárias.
 *
 * Fluxo de cálculo:
 *   1. Área equivalente  = Σ (área real × coeficiente NBR 12721 do ambiente)
 *   2. Custo básico      = área equivalente × CUB/m² do projeto-padrão (UF + mês)
 *   3. Alto luxo         = custo básico × fator paramétrico + adicionais por m²
 *   4. Itens fora do CUB = fundações especiais, elevadores, climatização, projetos etc.
 *   5. Custo direto      = (2 ou 3) + (4)
 *   6. Preço de venda    = custo direto × (1 + BDI)
 */

// ───────────────────────────── Tabela CUB ─────────────────────────────

/** Projetos-padrão da NBR 12721:2006 divulgados mensalmente pelos Sinduscons. */
export type CubProjectCode =
  | 'R1-B' | 'R1-N' | 'R1-A'
  | 'PP-4-B' | 'PP-4-N'
  | 'R8-B' | 'R8-N' | 'R8-A'
  | 'R16-N' | 'R16-A'
  | 'PIS' | 'RP1Q'
  | 'CAL-8-N' | 'CAL-8-A' | 'CSL-8-N' | 'CSL-8-A' | 'CSL-16-N' | 'CSL-16-A'
  | 'GI';

export const CUB_PROJECT_CODES: CubProjectCode[] = [
  'R1-B', 'R1-N', 'R1-A', 'PP-4-B', 'PP-4-N', 'R8-B', 'R8-N', 'R8-A', 'R16-N', 'R16-A',
  'PIS', 'RP1Q', 'CAL-8-N', 'CAL-8-A', 'CSL-8-N', 'CSL-8-A', 'CSL-16-N', 'CSL-16-A', 'GI',
];

/** Composição do CUB/m² de um projeto-padrão (R$/m²). `total` = soma das quatro parcelas. */
export interface CubEntry {
  total: number;
  materiais: number;
  maoDeObra: number;
  despesasAdministrativas: number;
  equipamentos: number;
}

/** Documento `cubTables/{UF}_{YYYY-MM}`. */
export interface CubTable {
  uf: string;
  /** Mês de referência no formato YYYY-MM. */
  competencia: string;
  /** Ex.: "SINDUSCON-SP". */
  fonte: string;
  /** true = tabela com desoneração da folha de pagamento. */
  desonerado: boolean;
  valores: Partial<Record<CubProjectCode, CubEntry>>;
  /** Marca tabelas de demonstração — nunca devem ser usadas em proposta real. */
  ilustrativo?: boolean;
}

// ───────────────────── Áreas equivalentes (NBR 12721) ─────────────────────

export type TipoArea =
  | 'privativa_padrao'
  | 'privativa_salas_com_acabamento'
  | 'privativa_salas_sem_acabamento'
  | 'loja_sem_acabamento'
  | 'garagem_subsolo'
  | 'varanda'
  | 'terraco_descoberto'
  | 'estacionamento_terreno'
  | 'area_servico_aberta'
  | 'barrilete'
  | 'caixa_dagua'
  | 'casa_maquinas'
  | 'piscina'
  | 'quintal_calcada_jardim'
  | 'projecao_terreno_sem_benfeitoria';

export interface CoeficienteArea {
  label: string;
  /** Faixa admitida pela NBR 12721:2006, item 5.7.3. */
  min: number;
  max: number;
  /** Valor sugerido quando o orçamentista não informa um coeficiente. */
  padrao: number;
}

/**
 * Coeficientes médios para cálculo da área equivalente em área de custo padrão
 * (NBR 12721:2006, 5.7.3). A norma dá faixas; o valor adotado dentro da faixa é
 * decisão técnica do orçamentista e fica registrado na memória de cálculo.
 */
export const COEFICIENTES_NBR12721: Record<TipoArea, CoeficienteArea> = {
  privativa_padrao: { label: 'Área privativa (unidade autônoma padrão)', min: 1, max: 1, padrao: 1 },
  privativa_salas_com_acabamento: { label: 'Área privativa — salas com acabamento', min: 1, max: 1, padrao: 1 },
  privativa_salas_sem_acabamento: { label: 'Área privativa — salas sem acabamento', min: 0.75, max: 0.9, padrao: 0.8 },
  loja_sem_acabamento: { label: 'Área de loja sem acabamento', min: 0.4, max: 0.6, padrao: 0.5 },
  garagem_subsolo: { label: 'Garagem (subsolo)', min: 0.5, max: 0.75, padrao: 0.6 },
  varanda: { label: 'Varandas', min: 0.75, max: 1, padrao: 0.8 },
  terraco_descoberto: { label: 'Terraços ou áreas descobertas sobre lajes', min: 0.3, max: 0.6, padrao: 0.45 },
  estacionamento_terreno: { label: 'Estacionamento sobre terreno', min: 0.05, max: 0.1, padrao: 0.07 },
  area_servico_aberta: { label: 'Área de serviço — residência unifamiliar padrão baixo (aberta)', min: 0.5, max: 0.5, padrao: 0.5 },
  barrilete: { label: 'Barrilete', min: 0.5, max: 0.75, padrao: 0.6 },
  caixa_dagua: { label: "Caixa d'água", min: 0.5, max: 0.75, padrao: 0.6 },
  casa_maquinas: { label: 'Casa de máquinas', min: 0.5, max: 0.75, padrao: 0.6 },
  piscina: { label: 'Piscinas', min: 0.5, max: 0.75, padrao: 0.6 },
  quintal_calcada_jardim: { label: 'Quintais, calçadas, jardins etc.', min: 0.1, max: 0.3, padrao: 0.2 },
  projecao_terreno_sem_benfeitoria: { label: 'Área de projeção do terreno sem benfeitoria', min: 0, max: 0, padrao: 0 },
};

export interface AreaInput {
  descricao: string;
  tipo: TipoArea;
  /** Área real em m² (do quadro de áreas ou do QTO extraído do CAD). */
  areaRealM2: number;
  /** Se omitido, usa o coeficiente padrão do tipo. */
  coeficiente?: number;
}

export interface AreaCalculada extends AreaInput {
  coeficiente: number;
  areaEquivalenteM2: number;
  /** true quando o coeficiente informado está fora da faixa da norma. */
  foraDaFaixa: boolean;
}

// ───────────────────── Padrões de acabamento ─────────────────────

export type PadraoAcabamento = 'popular' | 'medio' | 'luxo' | 'alto_luxo';
export type TipoEdificacao = 'unifamiliar' | 'multifamiliar';

export const PADRAO_LABEL: Record<PadraoAcabamento, string> = {
  popular: 'Popular',
  medio: 'Médio',
  luxo: 'Luxo',
  alto_luxo: 'Alto Luxo',
};

/** Projeto-padrão do CUB associado a cada padrão de acabamento. */
export const PROJETO_POR_PADRAO: Record<PadraoAcabamento, Record<TipoEdificacao, CubProjectCode>> = {
  popular: { unifamiliar: 'R1-B', multifamiliar: 'PP-4-B' },
  medio: { unifamiliar: 'R1-N', multifamiliar: 'R8-N' },
  luxo: { unifamiliar: 'R1-A', multifamiliar: 'R8-A' },
  // Alto luxo não existe na NBR 12721: parte-se do padrão alto e aplica-se ajuste paramétrico.
  alto_luxo: { unifamiliar: 'R1-A', multifamiliar: 'R8-A' },
};

/** Ajuste paramétrico do padrão Alto Luxo, customizável por tenant/projeto. */
export interface AjusteAltoLuxo {
  /** Multiplicador sobre o CUB do padrão alto (ex.: 1.35 = +35%). */
  fatorMultiplicador: number;
  /** Adicionais em R$ por m² de área equivalente (acabamentos importados, automação…). */
  adicionaisPorM2: { descricao: string; valorM2: number }[];
}

export const AJUSTE_ALTO_LUXO_PADRAO: AjusteAltoLuxo = {
  fatorMultiplicador: 1.35,
  adicionaisPorM2: [
    { descricao: 'Acabamentos importados (pedras, metais, marcenaria)', valorM2: 1200 },
    { descricao: 'Automação residencial e áudio/vídeo', valorM2: 450 },
  ],
};

// ───────────────────────────── BDI ─────────────────────────────

/** Parcelas do BDI em fração decimal (0.04 = 4%). */
export interface BdiParams {
  administracaoCentral: number;
  seguroGarantia: number;
  risco: number;
  despesasFinanceiras: number;
  lucro: number;
  /** Tributos sobre o faturamento (PIS + COFINS + ISS + CPRB, se houver). */
  tributos: number;
}

export const BDI_PADRAO: BdiParams = {
  administracaoCentral: 0.04,
  seguroGarantia: 0.008,
  risco: 0.0127,
  despesasFinanceiras: 0.0123,
  lucro: 0.074,
  tributos: 0.0565,
};

/**
 * BDI pela fórmula do Acórdão TCU 2622/2013:
 *   BDI = [(1 + AC + S + R + G) × (1 + DF) × (1 + L)] / (1 − I) − 1
 */
export function calcularBdi(p: BdiParams): number {
  const valores = Object.values(p);
  if (valores.some((v) => !Number.isFinite(v) || v < 0)) {
    throw new RangeError('Parcelas do BDI devem ser números não negativos.');
  }
  if (p.tributos >= 1) throw new RangeError('Tributos devem ser menores que 100%.');
  const numerador =
    (1 + p.administracaoCentral + p.seguroGarantia + p.risco) * (1 + p.despesasFinanceiras) * (1 + p.lucro);
  return numerador / (1 - p.tributos) - 1;
}

// ───────────────────────────── Orçamento ─────────────────────────────

/** Custos que a NBR 12721 exclui do CUB e que precisam ser somados à parte. */
export interface ItemNaoIncluso {
  descricao: string;
  /** `fixo`: valor em R$. `percentual`: fração do custo básico (0.03 = 3%). */
  tipo: 'fixo' | 'percentual';
  valor: number;
}

export interface OrcamentoInput {
  tabela: CubTable;
  padrao: PadraoAcabamento;
  tipoEdificacao: TipoEdificacao;
  /** Sobrepõe o projeto-padrão derivado de padrão + tipo (ex.: 'CSL-8-N' para comercial, 'GI' para galpão). */
  projetoCub?: CubProjectCode;
  areas: AreaInput[];
  ajusteAltoLuxo?: AjusteAltoLuxo;
  itensNaoInclusos?: ItemNaoIncluso[];
  /** BDI: fração já calculada (0.25) ou parcelas para a fórmula do TCU. */
  bdi: number | BdiParams;
}

export interface LinhaMemoria {
  descricao: string;
  formula: string;
  valor: number;
}

export interface OrcamentoResultado {
  padrao: PadraoAcabamento;
  projetoCub: CubProjectCode;
  uf: string;
  competencia: string;
  fonte: string;
  cubM2: number;
  /** CUB/m² efetivo após ajuste de alto luxo (igual a `cubM2` nos demais padrões). */
  cubAjustadoM2: number;
  areas: AreaCalculada[];
  areaRealTotalM2: number;
  areaEquivalenteTotalM2: number;
  /** Área equivalente × CUB ajustado, aberto pelas parcelas do CUB. */
  custoBasico: number;
  composicao: { materiais: number; maoDeObra: number; despesasAdministrativas: number; equipamentos: number };
  adicionaisAltoLuxo: { descricao: string; valor: number }[];
  totalAdicionaisAltoLuxo: number;
  itensNaoInclusos: { descricao: string; valor: number }[];
  totalItensNaoInclusos: number;
  custoDireto: number;
  bdiPercentual: number;
  valorBdi: number;
  precoVenda: number;
  /** Preço de venda ÷ área real total. */
  precoPorM2Real: number;
  memoria: LinhaMemoria[];
  avisos: string[];
}

/** Arredonda ao centavo (half-up, corrigindo o erro binário de ponto flutuante). */
export function arredondar(valor: number, casas = 2): number {
  const f = 10 ** casas;
  return Math.round((valor + Number.EPSILON) * f) / f;
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (v: number, casas = 2) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

/** Aplica os coeficientes da NBR 12721 e devolve as áreas equivalentes. */
export function calcularAreasEquivalentes(areas: AreaInput[]): AreaCalculada[] {
  return areas.map((a) => {
    if (!Number.isFinite(a.areaRealM2) || a.areaRealM2 < 0) {
      throw new RangeError(`Área inválida em "${a.descricao}": ${a.areaRealM2}`);
    }
    const ref = COEFICIENTES_NBR12721[a.tipo];
    const coeficiente = a.coeficiente ?? ref.padrao;
    if (!Number.isFinite(coeficiente) || coeficiente < 0) {
      throw new RangeError(`Coeficiente inválido em "${a.descricao}": ${coeficiente}`);
    }
    return {
      ...a,
      coeficiente,
      areaEquivalenteM2: a.areaRealM2 * coeficiente,
      foraDaFaixa: coeficiente < ref.min - 1e-9 || coeficiente > ref.max + 1e-9,
    };
  });
}

export function resolverProjetoCub(
  padrao: PadraoAcabamento,
  tipo: TipoEdificacao,
  override?: CubProjectCode,
): CubProjectCode {
  return override ?? PROJETO_POR_PADRAO[padrao][tipo];
}

/** Calcula o orçamento completo. Lança erro se a tabela não tiver o projeto-padrão pedido. */
export function calcularOrcamento(input: OrcamentoInput): OrcamentoResultado {
  const { tabela, padrao, tipoEdificacao } = input;
  const avisos: string[] = [];
  const memoria: LinhaMemoria[] = [];

  const projetoCub = resolverProjetoCub(padrao, tipoEdificacao, input.projetoCub);
  const entrada = tabela.valores[projetoCub];
  if (!entrada || !(entrada.total > 0)) {
    throw new Error(
      `A tabela CUB ${tabela.uf} ${tabela.competencia} (${tabela.fonte}) não tem valor para o projeto-padrão ${projetoCub}.`,
    );
  }
  if (tabela.ilustrativo) {
    avisos.push('Tabela CUB ilustrativa: importe a planilha oficial do Sinduscon antes de emitir proposta.');
  }

  // 1. Áreas equivalentes
  const areas = calcularAreasEquivalentes(input.areas);
  const areaRealTotalM2 = areas.reduce((s, a) => s + a.areaRealM2, 0);
  const areaEquivalenteTotalM2 = areas.reduce((s, a) => s + a.areaEquivalenteM2, 0);
  if (areaEquivalenteTotalM2 <= 0) throw new RangeError('A área equivalente total deve ser maior que zero.');
  for (const a of areas) {
    if (a.foraDaFaixa) {
      const ref = COEFICIENTES_NBR12721[a.tipo];
      avisos.push(
        `Coeficiente ${num(a.coeficiente)} de "${a.descricao}" está fora da faixa da NBR 12721 (${num(ref.min)}–${num(ref.max)}).`,
      );
    }
    memoria.push({
      descricao: `Área equivalente — ${a.descricao}`,
      formula: `${num(a.areaRealM2)} m² × ${num(a.coeficiente)}`,
      valor: arredondar(a.areaEquivalenteM2),
    });
  }

  // 2/3. CUB (com ajuste paramétrico no alto luxo)
  const ajuste = padrao === 'alto_luxo' ? input.ajusteAltoLuxo ?? AJUSTE_ALTO_LUXO_PADRAO : undefined;
  if (ajuste && !(ajuste.fatorMultiplicador > 0)) throw new RangeError('Fator de alto luxo deve ser maior que zero.');
  const fator = ajuste?.fatorMultiplicador ?? 1;
  const cubM2 = entrada.total;
  const cubAjustadoM2 = cubM2 * fator;
  const custoBasico = areaEquivalenteTotalM2 * cubAjustadoM2;
  memoria.push({
    descricao: `Custo básico (${projetoCub} — ${tabela.fonte} ${tabela.competencia})`,
    formula:
      fator === 1
        ? `${num(areaEquivalenteTotalM2)} m² × ${brl(cubM2)}/m²`
        : `${num(areaEquivalenteTotalM2)} m² × ${brl(cubM2)}/m² × ${num(fator)}`,
    valor: arredondar(custoBasico),
  });

  // Abertura pelas parcelas do CUB, proporcional à composição publicada.
  const somaParcelas =
    entrada.materiais + entrada.maoDeObra + entrada.despesasAdministrativas + entrada.equipamentos;
  if (Math.abs(somaParcelas - entrada.total) > 0.05) {
    avisos.push(
      `A soma das parcelas do CUB (${brl(somaParcelas)}) difere do total publicado (${brl(entrada.total)}); a composição foi normalizada.`,
    );
  }
  const base = somaParcelas > 0 ? somaParcelas : 1;
  const composicao = {
    materiais: arredondar((custoBasico * entrada.materiais) / base),
    maoDeObra: arredondar((custoBasico * entrada.maoDeObra) / base),
    despesasAdministrativas: arredondar((custoBasico * entrada.despesasAdministrativas) / base),
    equipamentos: arredondar((custoBasico * entrada.equipamentos) / base),
  };

  const adicionaisAltoLuxo = (ajuste?.adicionaisPorM2 ?? []).map((ad) => {
    const valor = ad.valorM2 * areaEquivalenteTotalM2;
    memoria.push({
      descricao: `Adicional alto luxo — ${ad.descricao}`,
      formula: `${num(areaEquivalenteTotalM2)} m² × ${brl(ad.valorM2)}/m²`,
      valor: arredondar(valor),
    });
    return { descricao: ad.descricao, valor };
  });
  const totalAdicionaisAltoLuxo = adicionaisAltoLuxo.reduce((s, a) => s + a.valor, 0);

  // 4. Itens não inclusos no CUB
  const itensNaoInclusos = (input.itensNaoInclusos ?? []).map((item) => {
    if (!Number.isFinite(item.valor) || item.valor < 0) {
      throw new RangeError(`Valor inválido no item "${item.descricao}".`);
    }
    const valor = item.tipo === 'fixo' ? item.valor : custoBasico * item.valor;
    memoria.push({
      descricao: `Não incluso no CUB — ${item.descricao}`,
      formula: item.tipo === 'fixo' ? 'valor fixo' : `${num(item.valor * 100)}% × custo básico`,
      valor: arredondar(valor),
    });
    return { descricao: item.descricao, valor };
  });
  const totalItensNaoInclusos = itensNaoInclusos.reduce((s, i) => s + i.valor, 0);

  // 5/6. Custo direto, BDI e preço de venda
  const custoDireto = custoBasico + totalAdicionaisAltoLuxo + totalItensNaoInclusos;
  const bdiPercentual = typeof input.bdi === 'number' ? input.bdi : calcularBdi(input.bdi);
  if (!Number.isFinite(bdiPercentual) || bdiPercentual < 0) throw new RangeError('BDI inválido.');
  const valorBdi = custoDireto * bdiPercentual;
  const precoVenda = custoDireto + valorBdi;
  memoria.push(
    { descricao: 'Custo direto', formula: 'custo básico + adicionais + itens não inclusos', valor: arredondar(custoDireto) },
    { descricao: 'BDI', formula: `${num(bdiPercentual * 100)}% × custo direto`, valor: arredondar(valorBdi) },
    { descricao: 'Preço de venda', formula: 'custo direto + BDI', valor: arredondar(precoVenda) },
  );

  return {
    padrao,
    projetoCub,
    uf: tabela.uf,
    competencia: tabela.competencia,
    fonte: tabela.fonte,
    cubM2: arredondar(cubM2),
    cubAjustadoM2: arredondar(cubAjustadoM2),
    areas: areas.map((a) => ({ ...a, areaEquivalenteM2: arredondar(a.areaEquivalenteM2) })),
    areaRealTotalM2: arredondar(areaRealTotalM2),
    areaEquivalenteTotalM2: arredondar(areaEquivalenteTotalM2),
    custoBasico: arredondar(custoBasico),
    composicao,
    adicionaisAltoLuxo: adicionaisAltoLuxo.map((a) => ({ ...a, valor: arredondar(a.valor) })),
    totalAdicionaisAltoLuxo: arredondar(totalAdicionaisAltoLuxo),
    itensNaoInclusos: itensNaoInclusos.map((i) => ({ ...i, valor: arredondar(i.valor) })),
    totalItensNaoInclusos: arredondar(totalItensNaoInclusos),
    custoDireto: arredondar(custoDireto),
    bdiPercentual,
    valorBdi: arredondar(valorBdi),
    precoVenda: arredondar(precoVenda),
    precoPorM2Real: areaRealTotalM2 > 0 ? arredondar(precoVenda / areaRealTotalM2) : 0,
    memoria,
    avisos,
  };
}

// ───────────────────── Simulador de cenários (What-If) ─────────────────────

export interface CenarioWhatIf {
  resultado: OrcamentoResultado;
  /** Diferença de preço em relação ao primeiro cenário (R$ e fração). */
  deltaValor: number;
  deltaPercentual: number;
}

/**
 * Calcula o mesmo empreendimento em vários padrões de acabamento para comparação lado a lado.
 * Padrões cujo projeto-padrão não existe na tabela são ignorados e listados em `indisponiveis`.
 */
export function simularCenarios(
  base: Omit<OrcamentoInput, 'padrao'>,
  padroes: PadraoAcabamento[] = ['medio', 'luxo', 'alto_luxo'],
): { cenarios: CenarioWhatIf[]; indisponiveis: PadraoAcabamento[] } {
  const cenarios: CenarioWhatIf[] = [];
  const indisponiveis: PadraoAcabamento[] = [];
  for (const padrao of padroes) {
    // No what-if o projeto-padrão acompanha o padrão; um override fixo anularia a comparação.
    const codigo = PROJETO_POR_PADRAO[padrao][base.tipoEdificacao];
    if (!base.tabela.valores[codigo]) {
      indisponiveis.push(padrao);
      continue;
    }
    const resultado = calcularOrcamento({ ...base, padrao, projetoCub: undefined });
    const ref = cenarios[0]?.resultado.precoVenda ?? resultado.precoVenda;
    cenarios.push({
      resultado,
      deltaValor: arredondar(resultado.precoVenda - ref),
      deltaPercentual: ref > 0 ? resultado.precoVenda / ref - 1 : 0,
    });
  }
  return { cenarios, indisponiveis };
}

/** Escolhe a tabela mais recente de uma UF (competência YYYY-MM ordena lexicograficamente). */
export function tabelaMaisRecente(tabelas: CubTable[], uf: string): CubTable | undefined {
  return tabelas
    .filter((t) => t.uf === uf)
    .sort((a, b) => b.competencia.localeCompare(a.competencia))[0];
}
