/**
 * Motor de modelos de contrato/proposta.
 *
 * Sintaxe:
 *   {{variavel}}                         → substituição
 *   {{#se chave}} … {{/se}}              → bloco condicional (chave verdadeira no contexto)
 *   {{#se chave=valor}} … {{/se}}        → bloco condicional por igualdade
 *   {{#senao chave}} … {{/senao}}        → bloco exibido quando a chave é falsa
 * Formatação leve do corpo: "# Título", "## Subtítulo", "**negrito**" e parágrafos separados por linha em branco.
 */
import type { Disciplina } from '../types';
import { DISCIPLINA_LABEL } from '../types';
import type { PadraoAcabamento } from '../cub/engine';
import { PADRAO_LABEL } from '../cub/engine';

export type ContextoContrato = Record<string, string | number | boolean | undefined>;

export const VARIAVEIS_DISPONIVEIS: { chave: string; descricao: string }[] = [
  { chave: 'contratada_razao_social', descricao: 'Razão social do escritório' },
  { chave: 'contratada_cnpj', descricao: 'CNPJ do escritório' },
  { chave: 'responsavel_tecnico', descricao: 'Responsável técnico' },
  { chave: 'registro_profissional', descricao: 'CREA/CAU do responsável' },
  { chave: 'cliente_nome', descricao: 'Nome do cliente' },
  { chave: 'cliente_documento', descricao: 'CPF/CNPJ do cliente' },
  { chave: 'projeto_nome', descricao: 'Nome do projeto' },
  { chave: 'projeto_local', descricao: 'Município/UF' },
  { chave: 'area_construida', descricao: 'Área construída (m²)' },
  { chave: 'padrao_acabamento', descricao: 'Padrão de acabamento' },
  { chave: 'valor_total_cub', descricao: 'Estimativa de obra pelo CUB' },
  { chave: 'valor_honorarios', descricao: 'Honorários de projeto' },
  { chave: 'disciplinas_lista', descricao: 'Disciplinas contratadas' },
  { chave: 'cronograma_etapas', descricao: 'Cronograma por etapas' },
  { chave: 'prazo_meses', descricao: 'Prazo em meses' },
  { chave: 'numero_art_rrt', descricao: 'Número da ART/RRT' },
  { chave: 'data_extenso', descricao: 'Data por extenso' },
  { chave: 'foro', descricao: 'Foro de eleição' },
];

export interface ResultadoRender {
  texto: string;
  /** Variáveis usadas no modelo mas sem valor no contexto. */
  pendentes: string[];
}

const verdadeiro = (v: unknown) => v !== undefined && v !== false && v !== '' && v !== 0 && v !== '0';

/** Resolve condicionais e variáveis. Variáveis sem valor permanecem visíveis como [[chave]]. */
export function renderizarModelo(modelo: string, ctx: ContextoContrato): ResultadoRender {
  let texto = modelo;
  // Condicionais (resolve de dentro para fora, permitindo aninhamento).
  const reSe = /\{\{#(se|senao)\s+([\w.]+)(?:\s*=\s*([^}]+?))?\s*\}\}((?:(?!\{\{#(?:se|senao)\s)[\s\S])*?)\{\{\/\1\}\}/;
  for (let guard = 0; guard < 500; guard++) {
    const m = reSe.exec(texto);
    if (!m) break;
    const [bloco, tipo, chave, valor, corpo] = m;
    const atual = ctx[chave!];
    const cond = valor !== undefined ? String(atual ?? '') === valor.trim() : verdadeiro(atual);
    const mostrar = tipo === 'se' ? cond : !cond;
    texto = texto.replace(bloco, mostrar ? corpo! : '');
  }
  const pendentes = new Set<string>();
  texto = texto.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, chave: string) => {
    const v = ctx[chave];
    if (v === undefined || v === '') {
      pendentes.add(chave);
      return `[[${chave}]]`;
    }
    return String(v);
  });
  // Normaliza linhas em branco deixadas por blocos removidos.
  texto = texto.replace(/\n{3,}/g, '\n\n').trim();
  return { texto, pendentes: [...pendentes] };
}

export interface BlocoTexto {
  tipo: 'h1' | 'h2' | 'p';
  /** Trechos com marcação de negrito já separada. */
  trechos: { texto: string; negrito: boolean }[];
}

/** Converte o texto renderizado em blocos para exibição (HTML ou PDF). */
export function paraBlocos(texto: string): BlocoTexto[] {
  return texto
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      let tipo: BlocoTexto['tipo'] = 'p';
      let corpo = p.replace(/\n/g, ' ');
      if (corpo.startsWith('## ')) { tipo = 'h2'; corpo = corpo.slice(3); }
      else if (corpo.startsWith('# ')) { tipo = 'h1'; corpo = corpo.slice(2); }
      const trechos = corpo.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((t) =>
        t.startsWith('**') && t.endsWith('**') ? { texto: t.slice(2, -2), negrito: true } : { texto: t, negrito: false },
      );
      return { tipo, trechos };
    });
}

/** Flags de contexto derivadas das disciplinas e do padrão — alimentam as cláusulas inteligentes. */
export function contextoDeEscopo(disciplinas: Disciplina[], padrao: PadraoAcabamento): ContextoContrato {
  const ctx: ContextoContrato = {
    padrao,
    padrao_acabamento: PADRAO_LABEL[padrao],
    disciplinas_lista: disciplinas.map((d) => DISCIPLINA_LABEL[d]).join(', '),
  };
  for (const d of ['arquitetonico', 'estrutural', 'hidrossanitario', 'eletrico', 'terraplenagem'] as Disciplina[]) {
    ctx[`tem_${d}`] = disciplinas.includes(d);
  }
  return ctx;
}

/**
 * Modelo-base de contrato de prestação de serviços de projeto.
 * É um ponto de partida editável — deve ser revisado pelo jurídico do escritório.
 */
export const MODELO_CONTRATO_PADRAO = `# CONTRATO DE PRESTAÇÃO DE SERVIÇOS TÉCNICOS DE PROJETO

**CONTRATADA:** {{contratada_razao_social}}, CNPJ {{contratada_cnpj}}, representada por seu responsável técnico {{responsavel_tecnico}}, {{registro_profissional}}.

**CONTRATANTE:** {{cliente_nome}}, inscrito(a) sob o nº {{cliente_documento}}.

## 1. Objeto

1.1. A CONTRATADA elaborará os projetos do empreendimento **{{projeto_nome}}**, em {{projeto_local}}, com área construída estimada de {{area_construida}} m², padrão de acabamento **{{padrao_acabamento}}**, nas disciplinas: {{disciplinas_lista}}.

{{#se tem_arquitetonico}}1.2. O projeto arquitetônico compreende estudo preliminar, anteprojeto, projeto legal e projeto executivo, conforme a ABNT NBR 16636.{{/se}}

{{#se tem_estrutural}}1.3. O projeto estrutural será desenvolvido conforme a ABNT NBR 6118 e dependerá de laudo de sondagem fornecido pelo CONTRATANTE.{{/se}}

{{#se tem_hidrossanitario}}1.4. O projeto hidrossanitário abrange água fria e quente, esgoto sanitário e águas pluviais (ABNT NBR 5626 e NBR 8160).{{/se}}

{{#se tem_eletrico}}1.5. O projeto elétrico atende à ABNT NBR 5410 e às normas da concessionária local.{{/se}}

{{#se tem_terraplenagem}}1.6. O projeto de terraplenagem será elaborado sobre levantamento planialtimétrico fornecido pelo CONTRATANTE; os volumes de corte e aterro são estimativos e sujeitos a confirmação em campo.{{/se}}

## 2. Estimativa de custo da obra

2.1. A estimativa de custo da obra, de **{{valor_total_cub}}**, foi calculada pelo Custo Unitário Básico (CUB/m²) e pelas áreas equivalentes da ABNT NBR 12721. Trata-se de referência paramétrica e não substitui o orçamento analítico.

{{#se padrao=alto_luxo}}2.2. Por se tratar de padrão Alto Luxo, a estimativa inclui fatores de ajuste para acabamentos importados e automação, cujos preços dependem de especificação e câmbio na data da compra.{{/se}}

{{#se padrao=popular}}2.2. No padrão Popular, substituições de materiais por itens de padrão superior não estão contempladas na estimativa.{{/se}}

## 3. Honorários e pagamento

3.1. Pelos serviços, o CONTRATANTE pagará **{{valor_honorarios}}**, conforme o cronograma abaixo:

{{cronograma_etapas}}

3.2. Alterações de programa solicitadas após a aprovação de cada etapa serão orçadas como serviço adicional.

## 4. Prazo

4.1. O prazo de execução é de {{prazo_meses}} meses, contados da assinatura e da entrega da documentação do terreno, suspendendo-se durante análises de órgãos públicos e aprovações do CONTRATANTE.

## 5. Responsabilidade técnica

5.1. A CONTRATADA registrará a responsabilidade técnica no conselho competente (ART/RRT nº {{numero_art_rrt}}), cabendo ao CONTRATANTE o custeio das taxas.

## 6. Direitos autorais

6.1. Os projetos são protegidos pela Lei 9.610/98 e destinam-se exclusivamente ao empreendimento objeto deste contrato.

## 7. Foro e assinatura

7.1. Fica eleito o foro de {{foro}} para dirimir questões deste contrato.

7.2. As partes reconhecem a validade da assinatura eletrônica deste instrumento, nos termos da MP 2.200-2/2001 e da Lei 14.063/2020.

{{projeto_local}}, {{data_extenso}}.
`;
