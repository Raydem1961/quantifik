/**
 * Quadro de áreas urbanístico de loteamentos e condomínios horizontais.
 * Os percentuais mínimos de áreas públicas são definidos pela lei municipal (a Lei 6.766/79,
 * após a Lei 9.785/99, deixou de fixar 35%); por isso entram como parâmetro.
 */
export type CategoriaUrbanistica = 'lotes' | 'sistema_viario' | 'area_verde' | 'institucional' | 'app' | 'outros';

export const CATEGORIA_LABEL: Record<CategoriaUrbanistica, string> = {
  lotes: 'Lotes (área privativa)',
  sistema_viario: 'Sistema viário',
  area_verde: 'Áreas verdes',
  institucional: 'Áreas institucionais',
  app: 'APP / não edificável',
  outros: 'Outros',
};

export interface ExigenciasMunicipais {
  /** Frações mínimas da gleba (0.15 = 15%). Omitido = sem exigência. */
  areaVerdeMin?: number;
  institucionalMin?: number;
  /** Soma mínima de áreas públicas (viário + verde + institucional). */
  areasPublicasMin?: number;
  loteMinimoM2?: number;
}

export interface LinhaQuadro { categoria: CategoriaUrbanistica; areaM2: number; percentual: number }

export interface QuadroUrbanistico {
  glebaM2: number;
  linhas: LinhaQuadro[];
  areaLoteavelM2: number;
  numeroLotes: number;
  loteMedioM2: number;
  verificacoes: { exigencia: string; exigido: number; obtido: number; conforme: boolean }[];
  /** Diferença entre a gleba e a soma das categorias (deve ser ~0). */
  residuoM2: number;
}

const REGRAS: [RegExp, CategoriaUrbanistica][] = [
  [/lote|quadra|privativ|unidade/i, 'lotes'],
  [/via|rua|avenida|viari|calcad|passeio|rotat/i, 'sistema_viario'],
  [/verde|praca|lazer|parque/i, 'area_verde'],
  [/instituc|equipamento|comunit/i, 'institucional'],
  [/app|preserv|non.?aedific|nao.?edific|faixa/i, 'app'],
];
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Classifica um nome de camada/parcela ("A-URB-VERDE", "Área Institucional 2") na categoria urbanística. */
export const classificarArea = (nome: string): CategoriaUrbanistica =>
  REGRAS.find(([re]) => re.test(semAcento(nome)))?.[1] ?? 'outros';

export function gerarQuadroUrbanistico(
  glebaM2: number,
  areas: { nome: string; areaM2: number; categoria?: CategoriaUrbanistica }[],
  numeroLotes: number,
  exigencias: ExigenciasMunicipais = {},
): QuadroUrbanistico {
  if (!(glebaM2 > 0)) throw new RangeError('Informe a área da gleba.');
  const soma = new Map<CategoriaUrbanistica, number>();
  for (const a of areas) {
    if (!(a.areaM2 >= 0)) throw new RangeError(`Área inválida em "${a.nome}".`);
    const c = a.categoria ?? classificarArea(a.nome);
    soma.set(c, (soma.get(c) ?? 0) + a.areaM2);
  }
  const linhas = (Object.keys(CATEGORIA_LABEL) as CategoriaUrbanistica[])
    .map((categoria) => ({ categoria, areaM2: soma.get(categoria) ?? 0, percentual: (soma.get(categoria) ?? 0) / glebaM2 }))
    .filter((l) => l.areaM2 > 0);
  const de = (c: CategoriaUrbanistica) => soma.get(c) ?? 0;
  const lotes = de('lotes');
  const verificacoes: QuadroUrbanistico['verificacoes'] = [];
  const checar = (exigencia: string, exigido: number | undefined, obtido: number) => {
    if (exigido !== undefined) verificacoes.push({ exigencia, exigido, obtido, conforme: obtido + 1e-9 >= exigido });
  };
  checar('Áreas verdes (% da gleba)', exigencias.areaVerdeMin, de('area_verde') / glebaM2);
  checar('Áreas institucionais (% da gleba)', exigencias.institucionalMin, de('institucional') / glebaM2);
  checar('Áreas públicas totais (% da gleba)', exigencias.areasPublicasMin, (de('sistema_viario') + de('area_verde') + de('institucional')) / glebaM2);
  const loteMedioM2 = numeroLotes > 0 ? lotes / numeroLotes : 0;
  if (exigencias.loteMinimoM2 !== undefined && numeroLotes > 0) {
    verificacoes.push({ exigencia: 'Lote médio × lote mínimo (m²)', exigido: exigencias.loteMinimoM2, obtido: loteMedioM2, conforme: loteMedioM2 + 1e-9 >= exigencias.loteMinimoM2 });
  }
  const total = [...soma.values()].reduce((s, v) => s + v, 0);
  return { glebaM2, linhas, areaLoteavelM2: glebaM2 - de('app'), numeroLotes, loteMedioM2, verificacoes, residuoM2: glebaM2 - total };
}
