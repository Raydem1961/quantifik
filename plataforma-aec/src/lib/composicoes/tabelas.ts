/**
 * Tabelas e expressões do Quantifik, copiadas literalmente do aplicativo original
 * (quantifik/index.html) para que a plataforma calcule exatamente os mesmos valores.
 * ARQUIVO GERADO — ao mudar uma regra no Quantifik, regenere em vez de editar à mão.
 */

/** [id, rótulo, padrão sobre o grupo/descrição sem acento e em maiúsculas]. A ordem importa. */
export const CATS: [string, string, RegExp][] = [
  ["alv","Alvenaria",/ALVENARIA|VERGAS/],
  ["arg","Argamassas",/ARGAMASSA/],
  ["arm","Armadura",/ARMACAO|ARMADURA/],
  ["for","Fôrmas",/\bFORMAS\b/],
  ["ar","Ar condicionado",/AR CONDICIONADO|DUTOS PARA AR/],
  ["gas","Gás e incêndio",/\bGAS\b|INCENDIO|ALARME/],
  ["san","Instalação sanitária",/ESGOTO|PLUVIAI|FOSSAS|SUMIDOURO|LOUCAS|CAIXAS ENTERRADAS|SANITARI/],
  ["ele","Instalação elétrica",/ELETRIC|ELETROCALHA|ELETRODUTO|LUMINARIA|ILUMINACAO|POSTES|SPDA|DESCARGAS ATMOSFERICAS|TRANSFORMADORES|ENERGIA SOLAR|LOGICA|TELEFONIA|QUADROS|DISJUNTOR|TOMADA|CABO/],
  ["hid","Instalação hidráulica",/HIDRAULIC|\bAGUA\b|\bCOBRE\b|\bPEX\b|\bPPR\b|CPVC|VALVULAS|REGISTROS|RESERVATORIO|BOMBAS|TUBULACAO|LIGACOES PREDIAIS|PEAD|TORNEIRA/],
  ["pin","Pintura",/PINTURA|TINTA/],
  ["imp","Impermeabilização",/IMPERMEABILIZ|TRATAMENTO DE JUNTA/],
  ["cob","Cobertura",/COBERTURA|TELHAMENTO|TELHA|ESTRUTURAS DE MADEIRA/],
  ["esq","Esquadrias, vidros e divisórias",/ESQUADRIA|VIDRO|GUARDA-CORPO|CORRIMAO|ESCADAS|PEITORIS|DIVISORIAS|DRYWALL|FORROS|BRISES|CERCAS|ALAMBRADO|PORTA|JANELA/],
  ["con","Concreto e lajes",/RADIER/],
  ["rev","Revestimentos e pisos",/MASSA UNICA|CHAPISCO|GESSO|MONOCAPA|REVESTIMENTO|\bPISOS?\b|CONTRAPISO|FACHADA|REBOCO|EMBOCO|RODAPE|AZULEJO/],
  ["pav","Pavimentação",/PAVIMENT|ASFALTO|GUIAS E SARJETAS|PASSEIOS|SINALIZACAO|VIARI|TRATAMENTOS SUPERFICIAIS|PARALELEP/],
  ["dre","Drenagem e galerias",/DRENO|DRENAGEM|GALERIAS|BOCAS|POCOS DE VISITA|CANALETAS|DISSIPADORES|GABIOES|ADUELAS/],
  ["fun","Fundações e contenções",/FUNDACOES|ESTACAS|TUBULOES|TIRANTES|GRAMPO|ARRASAMENTO|SAPATAS|CONTENCAO|BLOCOS DE FUNDACAO/],
  ["ter","Movimento de terra",/ESCAVACAO|ATERRO|REATERRO|ESGOTAMENTO|REBAIXAMENTO|ESCORAMENTO|SUB BASES|IMPRIMACOES|LOCACAO DE OBRAS|SUPRESSAO|DRAGAGEM|TERRAPLEN|PENEIRAMENTO|PERFURACAO|TUNNEL/],
  ["con","Concreto e lajes",/CONCRET|RADIER|\bLAJES?\b|PRE-MOLDAD|PRE-FABRIC|PROTENDID|GRAUTE/],
  ["urb","Paisagismo e urbanismo",/PAISAGISMO|MOBILIARIO URBANO|PARQUINHOS|QUADRAS/],
  ["can","Canteiro, transporte e demolição",/PROTECAO COLETIVA/],
  ["equ","Equipamentos e custos horários",/CUSTOS HORARIOS|DEPRECIACAO|MOBILIZACAO|GRUAS|CREMALHEIRAS|EQUIPAMENTO|USINAGENS/],
  ["can","Canteiro, transporte e demolição",/TRANSPORTE|CANTEIRO|LIMPEZA|ENTULHO|PROTECAO COLETIVA|DEMOLI|REMOCOES|RASGOS/]
];

/** Nomes de função que identificam mão de obra quando a base não classifica o insumo. */
export const LABOR = /SERVENTE|PEDREIRO|AJUDANTE|ENCARREGADO|CARPINTEIRO|ARMADOR|ELETRICISTA|ENCANADOR|BOMBEIRO|PINTOR|SOLDADOR|MONTADOR|OPERADOR|AZULEJISTA|LADRILHISTA|GESSEIRO|MARCENEIRO|MESTRE|AUXILIAR|OFICIAL|VIGIA|TOPOGRAFO|IMPERMEABILIZADOR|SERRALHEIRO|VIDRACEIRO|CALCETEIRO|MECANICO|TECNICO|ENGENHEIRO|ESTUCADOR|JARDINEIRO|SINALEIRO|MOTORISTA|APONTADOR|ALMOXARIFE|ASSENTADOR|COLOCADOR|FERREIRO|CALAFETADOR|TELHADISTA/;

/** Pisos normativos mensais do Sinduscon-BA (valores iniciais; editáveis em Parâmetros). */
export const PISOS: { id: string; nome: string; v: number }[] = [
  { id:"servente",         nome:"Servente comum",                      v:1654.08 },
  { id:"servente_pratico", nome:"Servente prático / ajudante",         v:1725.88 },
  { id:"qualificado",      nome:"Pedreiro / encanador / artífice",     v:2603.05 },
  { id:"rejuntador",       nome:"Rejuntador de azulejos",              v:1725.88 },
  { id:"vigia",            nome:"Vigia",                               v:1725.88 },
  { id:"encarregado",      nome:"Encarregado",                         v:3965.68 },
  { id:"cabo",             nome:"Cabo de turma",                       v:3525.04 },
  { id:"apropriador",      nome:"Apropriador",                         v:2569.50 },
  { id:"tecnico",          nome:"Técnico nível médio I",               v:3705.89 },
  { id:"operador",         nome:"Operador de equipamento pesado",      v:2880.61 }
];

/** Função do insumo de mão de obra → piso do Sinduscon-BA. A ordem importa. */
export const LABOR_MATCH: [string, RegExp][] = [
  ["encarregado", /ENCARREGADO/],
  ["cabo", /CABO DE TURMA/],
  ["apropriador", /APROPRIADOR/],
  ["tecnico", /TECNICO/],
  ["operador", /OPERADOR/],
  ["vigia", /VIGIA/],
  ["servente", /SERVENTE/],
  ["servente_pratico", /AJUDANTE|AUXILIAR/],
  ["rejuntador", /REJUNTADOR/],
  ["qualificado", /PEDREIRO|CARPINTEIRO|ARMADOR|ELETRICISTA|ENCANADOR|BOMBEIRO|PINTOR|SOLDADOR|AZULEJISTA|LADRILHISTA|GESSEIRO|MARCENEIRO|SERRALHEIRO|IMPERMEABILIZADOR|ASSENTADOR|TELHADISTA|ESTUCADOR|CALCETEIRO|FERREIRO|OFICIAL|ARTIFICE/]
];

/** Itens que não são salário (EPI, cursos…) ou funções sem piso equivalente: não recebem piso. */
export const NO_PISO = /^(CURSO DE CAPACITACAO|EPI|FERRAMENTAS|SEGURO|EXAMES|TRANSPORTE|ALIMENTACAO)\b|MONTADOR|MECANICO|VIDRACEIRO|BETONEIRA|MARTELETE|JATO|JATISTA|GUINCHO|COMPRESSOR|USINA|MUNCK|DEMARCADORA|BATE.?ESTACA|PERFURATRIZ|CAVOUQUEIRO/;

/** Encargos complementares dentro da composição de mão de obra do SINAPI. */
export const COMPL_RE = /ENCARGOS COMPLEMENTARES|COLETADO CAIXA|CURSO DE CAPACITACAO/;
