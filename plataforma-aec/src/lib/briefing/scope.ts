/**
 * Briefing paramétrico → escopo técnico e lista inicial de entregáveis.
 * As etapas seguem a nomenclatura da ABNT NBR 16636 (LV, EP, AP, PL, PE).
 */
import { DISCIPLINAS, TIPOLOGIA_LABEL, TIPOLOGIAS_INFRA, type Disciplina, type Tipologia } from '../types';

export type Topografia = 'plano' | 'aclive' | 'declive' | 'acidentado';

export interface BriefingInput {
  tipologia: Tipologia;
  areaTerrenoM2: number;
  areaPretendidaM2: number;
  pavimentos: number;
  /** Projeção da edificação no terreno (m²). Se omitida, estima área pretendida ÷ pavimentos. */
  areaProjecaoM2?: number;
  /** Taxa de ocupação máxima da legislação municipal (fração, 0.6 = 60%). */
  taxaOcupacaoMax: number;
  /** Coeficiente de aproveitamento máximo. */
  coeficienteAproveitamentoMax: number;
  topografia: Topografia;
  /** Desnível aproximado do terreno (m). */
  desnivelM?: number;
  prazoDesejadoMeses: number;
  /** Programa de necessidades: ambiente → quantidade. */
  programa: Record<string, number>;
  observacoes?: string;
}

export interface CampoBriefing {
  chave: string;
  label: string;
  tipo: 'numero' | 'texto' | 'booleano';
  unidade?: string;
}

/** Itens do programa de necessidades exibidos por tipologia (formulário dinâmico). */
export const PROGRAMA_POR_TIPOLOGIA: Record<Tipologia, CampoBriefing[]> = {
  residencial: [
    { chave: 'suites', label: 'Suítes', tipo: 'numero' },
    { chave: 'quartos', label: 'Quartos', tipo: 'numero' },
    { chave: 'banheiros', label: 'Banheiros sociais', tipo: 'numero' },
    { chave: 'vagas', label: 'Vagas de garagem', tipo: 'numero' },
    { chave: 'piscina', label: 'Piscina', tipo: 'numero' },
    { chave: 'area_gourmet', label: 'Área gourmet', tipo: 'numero' },
  ],
  comercial: [
    { chave: 'salas', label: 'Salas / lojas', tipo: 'numero' },
    { chave: 'postos_trabalho', label: 'Postos de trabalho', tipo: 'numero' },
    { chave: 'sanitarios', label: 'Conjuntos sanitários', tipo: 'numero' },
    { chave: 'vagas', label: 'Vagas de estacionamento', tipo: 'numero' },
    { chave: 'elevadores', label: 'Elevadores', tipo: 'numero' },
  ],
  industrial: [
    { chave: 'area_producao', label: 'Área de produção', tipo: 'numero', unidade: 'm²' },
    { chave: 'pe_direito', label: 'Pé-direito livre', tipo: 'numero', unidade: 'm' },
    { chave: 'docas', label: 'Docas', tipo: 'numero' },
    { chave: 'ponte_rolante', label: 'Pontes rolantes', tipo: 'numero' },
    { chave: 'carga_piso', label: 'Sobrecarga de piso', tipo: 'numero', unidade: 'tf/m²' },
  ],
  condominio_horizontal: [
    { chave: 'unidades', label: 'Unidades (casas/lotes)', tipo: 'numero' },
    { chave: 'area_unidade', label: 'Área média por unidade', tipo: 'numero', unidade: 'm²' },
    { chave: 'extensao_vias', label: 'Vias internas', tipo: 'numero', unidade: 'm' },
    { chave: 'area_lazer', label: 'Área de lazer', tipo: 'numero', unidade: 'm²' },
    { chave: 'portaria', label: 'Portarias', tipo: 'numero' },
  ],
  condominio_vertical: [
    { chave: 'torres', label: 'Torres', tipo: 'numero' },
    { chave: 'unidades', label: 'Unidades autônomas', tipo: 'numero' },
    { chave: 'subsolos', label: 'Subsolos', tipo: 'numero' },
    { chave: 'vagas', label: 'Vagas de garagem', tipo: 'numero' },
    { chave: 'elevadores', label: 'Elevadores', tipo: 'numero' },
  ],
  loteamento: [
    { chave: 'lotes', label: 'Lotes previstos', tipo: 'numero' },
    { chave: 'extensao_vias', label: 'Extensão de vias', tipo: 'numero', unidade: 'm' },
    { chave: 'area_verde', label: 'Área verde', tipo: 'numero', unidade: 'm²' },
    { chave: 'area_institucional', label: 'Área institucional', tipo: 'numero', unidade: 'm²' },
  ],
  infraestrutura: [
    { chave: 'extensao_vias', label: 'Extensão do trecho', tipo: 'numero', unidade: 'm' },
    { chave: 'largura_pista', label: 'Largura da pista', tipo: 'numero', unidade: 'm' },
    { chave: 'obras_arte', label: 'Obras de arte (bueiros, pontes)', tipo: 'numero' },
  ],
  topografia: [
    { chave: 'area_levantamento', label: 'Área a levantar', tipo: 'numero', unidade: 'ha' },
    { chave: 'vertices_georref', label: 'Vértices a georreferenciar', tipo: 'numero' },
    { chave: 'marcos', label: 'Marcos a implantar', tipo: 'numero' },
  ],
  saneamento: [
    { chave: 'populacao', label: 'População de projeto', tipo: 'numero', unidade: 'hab' },
    { chave: 'extensao_rede', label: 'Extensão estimada de rede', tipo: 'numero', unidade: 'm' },
    { chave: 'elevatorias', label: 'Estações elevatórias', tipo: 'numero' },
    { chave: 'ete', label: 'Estações de tratamento', tipo: 'numero' },
  ],
  abastecimento_agua: [
    { chave: 'populacao', label: 'População de projeto', tipo: 'numero', unidade: 'hab' },
    { chave: 'extensao_rede', label: 'Extensão estimada de rede', tipo: 'numero', unidade: 'm' },
    { chave: 'reservatorios', label: 'Reservatórios', tipo: 'numero' },
    { chave: 'ligacoes', label: 'Ligações prediais', tipo: 'numero' },
  ],
};

export interface VerificacaoLegal {
  parametro: string;
  permitido: number;
  projetado: number;
  unidade: string;
  conforme: boolean;
}

export interface Entregavel {
  disciplina: Disciplina;
  etapa: 'LV' | 'EP' | 'AP' | 'PL' | 'PE';
  descricao: string;
}

export interface EscopoTecnico {
  disciplinas: Disciplina[];
  verificacoes: VerificacaoLegal[];
  entregaveis: Entregavel[];
  alertas: string[];
  /** Prazo de projeto sugerido (meses), para confronto com a expectativa do cliente. */
  prazoSugeridoMeses: number;
  resumo: string;
}

const ENTREGAVEIS_BASE: Record<Disciplina, Omit<Entregavel, 'disciplina'>[]> = {
  arquitetonico: [
    { etapa: 'LV', descricao: 'Levantamento de dados e programa de necessidades' },
    { etapa: 'EP', descricao: 'Estudo preliminar: implantação, plantas e volumetria' },
    { etapa: 'AP', descricao: 'Anteprojeto: plantas, cortes e fachadas' },
    { etapa: 'PL', descricao: 'Projeto legal para aprovação na prefeitura' },
    { etapa: 'PE', descricao: 'Projeto executivo e detalhamentos' },
  ],
  estrutural: [
    { etapa: 'AP', descricao: 'Concepção estrutural e pré-dimensionamento' },
    { etapa: 'PE', descricao: 'Formas, armaduras e locação de fundações' },
    { etapa: 'PE', descricao: 'Memorial de cálculo e quantitativo de aço e concreto' },
  ],
  hidrossanitario: [
    { etapa: 'AP', descricao: 'Traçado de água fria/quente, esgoto e pluvial' },
    { etapa: 'PE', descricao: 'Plantas, isométricos e detalhes executivos' },
    { etapa: 'PE', descricao: 'Memorial descritivo e lista de materiais' },
  ],
  eletrico: [
    { etapa: 'AP', descricao: 'Pontos elétricos, iluminação e previsão de carga' },
    { etapa: 'PE', descricao: 'Diagramas unifilares, quadros e entrada de energia' },
    { etapa: 'PE', descricao: 'Memorial descritivo e lista de materiais' },
  ],
  topografia: [
    { etapa: 'LV', descricao: 'Levantamento planialtimétrico cadastral (NBR 13133)' },
    { etapa: 'LV', descricao: 'Planta topográfica, curvas de nível e memorial descritivo' },
    { etapa: 'PE', descricao: 'Locação e implantação de marcos' },
  ],
  urbanismo: [
    { etapa: 'EP', descricao: 'Estudo de parcelamento e sistema viário' },
    { etapa: 'PL', descricao: 'Projeto urbanístico e quadro de áreas para aprovação' },
    { etapa: 'PE', descricao: 'Memorial descritivo dos lotes e áreas públicas' },
  ],
  pavimentacao: [
    { etapa: 'AP', descricao: 'Projeto geométrico: planta, perfil e seções-tipo' },
    { etapa: 'PE', descricao: 'Dimensionamento do pavimento e notas de serviço' },
    { etapa: 'PE', descricao: 'Sinalização viária e quantitativos' },
  ],
  drenagem: [
    { etapa: 'AP', descricao: 'Estudo hidrológico e delimitação de bacias' },
    { etapa: 'PE', descricao: 'Rede de microdrenagem: galerias, bocas de lobo e poços de visita' },
    { etapa: 'PE', descricao: 'Memorial de cálculo hidráulico e quantitativos' },
  ],
  esgotamento: [
    { etapa: 'AP', descricao: 'Concepção do sistema e estudo populacional' },
    { etapa: 'PE', descricao: 'Rede coletora: planta, perfis e planilha de cálculo (NBR 9649)' },
    { etapa: 'PE', descricao: 'Elevatórias, tratamento e quantitativos' },
  ],
  abastecimento_agua: [
    { etapa: 'AP', descricao: 'Concepção do sistema e estudo de demandas' },
    { etapa: 'PE', descricao: 'Rede de distribuição: traçado, setorização e simulação hidráulica (NBR 12218)' },
    { etapa: 'PE', descricao: 'Reservação, adução e quantitativos' },
  ],
  terraplenagem: [
    { etapa: 'LV', descricao: 'Levantamento planialtimétrico cadastral' },
    { etapa: 'AP', descricao: 'Estudo de platôs e greide' },
    { etapa: 'PE', descricao: 'Projeto de terraplenagem com seções e volumes de corte/aterro' },
  ],
};

const EDIFICACAO: Disciplina[] = ['arquitetonico', 'estrutural', 'hidrossanitario', 'eletrico'];

/** Disciplinas de partida por tipologia (o terreno e o programa podem acrescentar outras). */
export const DISCIPLINAS_POR_TIPOLOGIA: Record<Tipologia, Disciplina[]> = {
  residencial: EDIFICACAO,
  comercial: EDIFICACAO,
  industrial: [...EDIFICACAO, 'terraplenagem'],
  condominio_horizontal: [...EDIFICACAO, 'topografia', 'urbanismo', 'terraplenagem', 'pavimentacao', 'drenagem'],
  condominio_vertical: EDIFICACAO,
  loteamento: ['topografia', 'urbanismo', 'terraplenagem', 'pavimentacao', 'drenagem', 'esgotamento', 'abastecimento_agua', 'eletrico'],
  infraestrutura: ['topografia', 'terraplenagem', 'pavimentacao', 'drenagem'],
  topografia: ['topografia'],
  saneamento: ['topografia', 'esgotamento', 'drenagem'],
  abastecimento_agua: ['topografia', 'abastecimento_agua'],
};

const PRAZO_BASE: Record<Tipologia, number> = {
  residencial: 3, comercial: 4, industrial: 5, condominio_horizontal: 6, condominio_vertical: 7,
  loteamento: 6, infraestrutura: 5, topografia: 1, saneamento: 5, abastecimento_agua: 4,
};

/** Converte o briefing em escopo técnico, verificações legais e entregáveis. */
export function gerarEscopo(b: BriefingInput): EscopoTecnico {
  if (!(b.areaTerrenoM2 > 0)) throw new RangeError('Informe a área do terreno ou da gleba.');
  const infra = TIPOLOGIAS_INFRA.includes(b.tipologia);
  if (!infra && !(b.areaPretendidaM2 > 0)) throw new RangeError('Informe a área pretendida.');
  const pavimentos = Math.max(1, Math.trunc(b.pavimentos || 1));
  const alertas: string[] = [];
  const prog = (k: string) => b.programa[k] ?? 0;

  // Restrições legais de edificação (não se aplicam a obras lineares e parcelamentos).
  const verificacoes: VerificacaoLegal[] = [];
  if (!infra) {
    const projecao = b.areaProjecaoM2 ?? b.areaPretendidaM2 / pavimentos;
    const projecaoMax = b.areaTerrenoM2 * b.taxaOcupacaoMax;
    const computavelMax = b.areaTerrenoM2 * b.coeficienteAproveitamentoMax;
    verificacoes.push(
      { parametro: 'Taxa de ocupação (projeção)', permitido: projecaoMax, projetado: projecao, unidade: 'm²', conforme: projecao <= projecaoMax + 1e-6 },
      { parametro: 'Coeficiente de aproveitamento (área computável)', permitido: computavelMax, projetado: b.areaPretendidaM2, unidade: 'm²', conforme: b.areaPretendidaM2 <= computavelMax + 1e-6 },
    );
    for (const v of verificacoes) {
      if (!v.conforme) {
        alertas.push(`${v.parametro}: pretendido ${v.projetado.toFixed(1)} m² excede o permitido ${v.permitido.toFixed(1)} m². Rever programa ou número de pavimentos.`);
      }
    }
  }
  if (b.tipologia === 'loteamento') {
    // Áreas públicas informadas no programa, como fração da gleba.
    const publicas = prog('area_verde') + prog('area_institucional');
    if (publicas > 0) {
      verificacoes.push({ parametro: 'Áreas verdes + institucionais informadas', permitido: b.areaTerrenoM2, projetado: publicas, unidade: 'm²', conforme: publicas <= b.areaTerrenoM2 });
    }
  }

  const disciplinas = new Set<Disciplina>(DISCIPLINAS_POR_TIPOLOGIA[b.tipologia]);
  const desnivel = b.desnivelM ?? 0;
  if (!infra && (b.topografia !== 'plano' || desnivel > 1)) disciplinas.add('terraplenagem').add('topografia');
  if (b.topografia === 'acidentado' || desnivel > 3) {
    alertas.push('Terreno com desnível relevante: prever sondagem (SPT), contenções e estudo de drenagem.');
  }

  switch (b.tipologia) {
    case 'loteamento':
      alertas.push('Loteamento: solicitar diretrizes urbanísticas à prefeitura e prever licenciamento ambiental (Lei 6.766/79). Os percentuais de áreas públicas são definidos pela lei municipal.');
      break;
    case 'condominio_horizontal':
      alertas.push('Condomínio de lotes/casas: confirmar o enquadramento na lei municipal (Lei 13.465/17, art. 1.358-A do Código Civil) e a manutenção das vias internas pelo condomínio.');
      break;
    case 'condominio_vertical':
      alertas.push('Incorporação: preparar os quadros da NBR 12721 para o registro (Lei 4.591/64).');
      alertas.push('Verificar exigência de projeto de prevenção e combate a incêndio junto ao Corpo de Bombeiros estadual.');
      break;
    case 'industrial':
      alertas.push('Uso industrial: confirmar cargas de piso, pontes rolantes e exigências de licenciamento/prevenção de incêndio.');
      break;
    case 'saneamento':
      alertas.push('Saneamento: confirmar corpo receptor, outorga de lançamento e licenciamento ambiental da rede e do tratamento.');
      break;
    case 'abastecimento_agua':
      alertas.push('Abastecimento: confirmar manancial, outorga de captação e pressões mínima/máxima exigidas pela concessionária.');
      break;
    case 'topografia':
      if (prog('vertices_georref') > 0) alertas.push('Georreferenciamento de imóvel rural: seguir a Norma Técnica do INCRA e certificar no SIGEF.');
      break;
    case 'infraestrutura':
      alertas.push('Obra viária: definir classe da via e tráfego (número N) para o dimensionamento do pavimento.');
      break;
    default:
  }
  if (b.tipologia === 'comercial' || (b.tipologia === 'residencial' && pavimentos > 2)) {
    alertas.push('Verificar exigência de projeto de prevenção e combate a incêndio junto ao Corpo de Bombeiros estadual.');
  }
  if (prog('elevadores') > 0) alertas.push('Elevadores não estão incluídos no CUB: orçar à parte.');
  if (prog('piscina') > 0) alertas.push('Piscina: incluir como área equivalente (NBR 12721) e prever projeto específico.');
  if (infra) alertas.push('Orçamento por composições unitárias (SINAPI / SICRO / ORSE) a partir dos quantitativos importados — o CUB não se aplica a esta tipologia.');

  const lista = DISCIPLINAS.filter((d) => disciplinas.has(d));
  const entregaveis = lista.flatMap((d) => ENTREGAVEIS_BASE[d].map((e) => ({ disciplina: d, ...e })));

  // Prazo paramétrico: base por tipologia + acréscimo por porte.
  const porte = infra ? b.areaTerrenoM2 / 20000 : b.areaPretendidaM2 / 500;
  const prazoSugeridoMeses = Math.ceil(PRAZO_BASE[b.tipologia] + Math.log2(1 + porte));
  if (b.prazoDesejadoMeses > 0 && b.prazoDesejadoMeses < prazoSugeridoMeses) {
    alertas.push(`Prazo desejado (${b.prazoDesejadoMeses} meses) abaixo do sugerido (${prazoSugeridoMeses} meses): avaliar equipe adicional ou entrega faseada.`);
  }

  const fmt = (v: number) => v.toLocaleString('pt-BR');
  const resumo = infra
    ? `${TIPOLOGIA_LABEL[b.tipologia]} em área de ${fmt(b.areaTerrenoM2)} m² (${b.topografia}). ${lista.length} disciplina(s) e ${entregaveis.length} entregáveis.`
    : `${TIPOLOGIA_LABEL[b.tipologia]} com ${fmt(b.areaPretendidaM2)} m² em ${pavimentos} pavimento(s), terreno de ${fmt(b.areaTerrenoM2)} m² (${b.topografia}). ${lista.length} disciplina(s) e ${entregaveis.length} entregáveis.`;
  return { disciplinas: lista, verificacoes, entregaveis, alertas: [...new Set(alertas)], prazoSugeridoMeses, resumo };
}
