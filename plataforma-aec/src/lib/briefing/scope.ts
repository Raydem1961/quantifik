/**
 * Briefing paramétrico → escopo técnico e lista inicial de entregáveis.
 * As etapas seguem a nomenclatura da ABNT NBR 16636 (LV, EP, AP, PL, PE).
 */
import type { Disciplina, Tipologia } from '../types';

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
  infraestrutura: [
    { chave: 'lotes', label: 'Lotes previstos', tipo: 'numero' },
    { chave: 'extensao_vias', label: 'Extensão de vias', tipo: 'numero', unidade: 'm' },
    { chave: 'area_verde', label: 'Área verde', tipo: 'numero', unidade: 'm²' },
    { chave: 'area_institucional', label: 'Área institucional', tipo: 'numero', unidade: 'm²' },
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
  terraplenagem: [
    { etapa: 'LV', descricao: 'Levantamento planialtimétrico cadastral' },
    { etapa: 'AP', descricao: 'Estudo de platôs e greide' },
    { etapa: 'PE', descricao: 'Projeto de terraplenagem com seções e volumes de corte/aterro' },
  ],
};

/** Converte o briefing em escopo técnico, verificações legais e entregáveis. */
export function gerarEscopo(b: BriefingInput): EscopoTecnico {
  if (!(b.areaTerrenoM2 > 0)) throw new RangeError('Informe a área do terreno.');
  if (!(b.areaPretendidaM2 > 0)) throw new RangeError('Informe a área pretendida.');
  const pavimentos = Math.max(1, Math.trunc(b.pavimentos || 1));
  const alertas: string[] = [];
  const infra = b.tipologia === 'infraestrutura';

  // Restrições legais (não se aplicam da mesma forma a loteamentos).
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

  // Disciplinas
  const disciplinas = new Set<Disciplina>();
  if (infra) {
    disciplinas.add('terraplenagem').add('hidrossanitario').add('eletrico');
    alertas.push('Loteamento: prever licenciamento ambiental e diretrizes urbanísticas municipais (Lei 6.766/79).');
  } else {
    disciplinas.add('arquitetonico').add('estrutural').add('hidrossanitario').add('eletrico');
  }
  const desnivel = b.desnivelM ?? 0;
  if (b.topografia !== 'plano' || desnivel > 1) {
    disciplinas.add('terraplenagem');
    if (b.topografia === 'acidentado' || desnivel > 3) {
      alertas.push('Terreno com desnível relevante: prever sondagem (SPT), contenções e estudo de drenagem.');
    }
  }
  if (b.tipologia === 'industrial') {
    alertas.push('Uso industrial: confirmar cargas de piso, pontes rolantes e exigências de licenciamento/prevenção de incêndio.');
  }
  if (b.tipologia === 'comercial' || pavimentos > 2) {
    alertas.push('Verificar exigência de projeto de prevenção e combate a incêndio junto ao Corpo de Bombeiros estadual.');
  }
  if ((b.programa.elevadores ?? 0) > 0) alertas.push('Elevadores não estão incluídos no CUB: orçar à parte.');
  if ((b.programa.piscina ?? 0) > 0) alertas.push('Piscina: incluir como área equivalente (NBR 12721) e prever projeto específico.');

  const ordem: Disciplina[] = ['arquitetonico', 'estrutural', 'hidrossanitario', 'eletrico', 'terraplenagem'];
  const lista = ordem.filter((d) => disciplinas.has(d));
  const entregaveis = lista.flatMap((d) => ENTREGAVEIS_BASE[d].map((e) => ({ disciplina: d, ...e })));

  // Prazo paramétrico: base por tipologia + acréscimo por porte e por disciplina extra.
  const basePrazo: Record<Tipologia, number> = { residencial: 3, comercial: 4, industrial: 5, infraestrutura: 6 };
  const prazoSugeridoMeses = Math.ceil(basePrazo[b.tipologia] + Math.log2(1 + b.areaPretendidaM2 / 500) + (lista.includes('terraplenagem') && !infra ? 0.5 : 0));
  if (b.prazoDesejadoMeses > 0 && b.prazoDesejadoMeses < prazoSugeridoMeses) {
    alertas.push(`Prazo desejado (${b.prazoDesejadoMeses} meses) abaixo do sugerido (${prazoSugeridoMeses} meses): avaliar equipe adicional ou entrega faseada.`);
  }

  const resumo = `Projeto ${b.tipologia} com ${b.areaPretendidaM2.toLocaleString('pt-BR')} m² em ${pavimentos} pavimento(s), terreno de ${b.areaTerrenoM2.toLocaleString('pt-BR')} m² (${b.topografia}). ${lista.length} disciplina(s) e ${entregaveis.length} entregáveis.`;
  return { disciplinas: lista, verificacoes, entregaveis, alertas, prazoSugeridoMeses, resumo };
}
