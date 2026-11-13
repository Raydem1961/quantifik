/**
 * Redes hidráulicas: EPANET (.inp — abastecimento de água) e EPA SWMM (.inp — esgoto e drenagem).
 * Os dois usam o mesmo formato de seções "[NOME]" com colunas separadas por espaços/TAB e
 * comentários iniciados por ";". Softwares brasileiros (UFC, CRede, SANCAD, SewerGEMS, WaterGEMS,
 * QGIS/QWater/QEsg) exportam para esses formatos.
 */
import type { Disciplina } from '../types';
import { consolidar, criarItem, type ItemQuantitativo, type ResultadoImportacao } from './modelo';

/** Lê as seções do arquivo: nome em maiúsculas → linhas já divididas em colunas. */
export function lerSecoesInp(texto: string): Map<string, string[][]> {
  const secoes = new Map<string, string[][]>();
  let atual: string[][] | undefined;
  for (const bruta of texto.split(/\r\n|\r|\n/)) {
    const linha = bruta.split(';')[0]!.trim();
    if (!linha) continue;
    const cab = /^\[(.+)\]$/.exec(linha);
    if (cab) {
      atual = [];
      secoes.set(cab[1]!.trim().toUpperCase(), atual);
    } else if (atual) {
      atual.push(linha.split(/\s+/));
    }
  }
  return secoes;
}

const n = (v: string | undefined) => {
  const x = Number.parseFloat(v ?? '');
  return Number.isFinite(x) ? x : 0;
};
/** Diâmetros comerciais: 99,8 mm e 100 mm devem cair no mesmo item. */
const dn = (mm: number) => Math.round(mm);

function opcao(secoes: Map<string, string[][]>, chave: string): string {
  for (const l of secoes.get('OPTIONS') ?? []) {
    if ((l[0] ?? '').toUpperCase() === chave) return (l[1] ?? '').toUpperCase();
    // EPANET aceita chaves de duas palavras ("Units LPS" / "Flow Units LPS")
    if (`${l[0]}_${l[1]}`.toUpperCase() === chave) return (l[2] ?? '').toUpperCase();
  }
  return '';
}
const UNIDADES_SI = ['LPS', 'LPM', 'MLD', 'CMH', 'CMD', 'CMS'];

export function parseEpanet(arquivo: string, texto: string, secoes = lerSecoesInp(texto)): ResultadoImportacao {
  const avisos: string[] = [];
  const tubos = secoes.get('PIPES') ?? [];
  if (tubos.length === 0) throw new Error('Arquivo EPANET sem a seção [PIPES].');
  const unidade = opcao(secoes, 'UNITS') || opcao(secoes, 'FLOW_UNITS');
  // Em unidades americanas (GPM, CFS…): comprimento em pés e diâmetro em polegadas.
  const si = unidade === '' ? true : UNIDADES_SI.includes(unidade);
  if (unidade === '') avisos.push('[OPTIONS] não informa as unidades; presumido SI (comprimento em m, diâmetro em mm).');
  const kComp = si ? 1 : 0.3048;
  const kDiam = si ? 1 : 25.4;
  const base = { arquivo, formato: 'epanet' as const, disciplina: 'abastecimento_agua' as Disciplina };
  const itens: ItemQuantitativo[] = [];

  // [PIPES] ID Node1 Node2 Length Diameter Roughness MinorLoss Status
  for (const t of tubos) {
    const d = dn(n(t[4]) * kDiam);
    itens.push(criarItem({ ...base, grupo: 'Tubulação', descricao: `Tubo para rede de água DN ${d} mm`, unidade: 'm', quantidade: n(t[3]) * kComp, atributos: { diametroMm: d } }));
  }
  // [VALVES] ID Node1 Node2 Diameter Type Setting
  for (const v of secoes.get('VALVES') ?? []) {
    const d = dn(n(v[3]) * kDiam);
    const tipo = (v[4] ?? '').toUpperCase();
    itens.push(criarItem({ ...base, grupo: 'Válvulas', descricao: `Válvula ${tipo || 'de rede'} DN ${d} mm`, unidade: 'un', quantidade: 1, atributos: { diametroMm: d, tipo } }));
  }
  const contar = (secao: string, grupo: string, descricao: string) => {
    const q = (secoes.get(secao) ?? []).length;
    if (q) itens.push(criarItem({ ...base, grupo, descricao, unidade: 'un', quantidade: q }));
  };
  contar('JUNCTIONS', 'Nós', 'Nó de rede (junção / ponto de consumo)');
  contar('RESERVOIRS', 'Reservação', 'Manancial / reservatório de nível fixo');
  contar('PUMPS', 'Bombeamento', 'Conjunto motobomba');
  // [TANKS] ID Elev InitLvl MinLvl MaxLvl Diameter MinVol — volume útil = área × (máx − mín)
  for (const t of secoes.get('TANKS') ?? []) {
    const diam = n(t[5]) * kComp;
    const util = Math.max(0, n(t[4]) - n(t[3])) * kComp;
    const vol = Math.round((Math.PI * diam * diam) / 4 * util);
    itens.push(criarItem({ ...base, grupo: 'Reservação', descricao: `Reservatório ${vol > 0 ? `de ${vol} m³` : 'de distribuição'}`, unidade: 'un', quantidade: 1, atributos: { volumeM3: vol } }));
  }
  const final = consolidar(itens);
  const extensao = final.filter((i) => i.unidade === 'm').reduce((s, i) => s + i.quantidade, 0);
  return { arquivo, formato: 'epanet', itens: final, avisos, resumo: `${tubos.length} trechos · ${extensao.toFixed(0)} m de rede` };
}

/** Faixas de profundidade de poço de visita usadas nas composições de saneamento. */
function faixaProfundidade(m: number): string {
  if (m <= 0) return 'profundidade não informada';
  if (m <= 1.5) return 'profundidade até 1,50 m';
  if (m <= 2.5) return 'profundidade de 1,51 a 2,50 m';
  if (m <= 4) return 'profundidade de 2,51 a 4,00 m';
  return 'profundidade acima de 4,00 m';
}

export function parseSwmm(arquivo: string, texto: string, secoes = lerSecoesInp(texto)): ResultadoImportacao {
  const avisos: string[] = [];
  const condutos = secoes.get('CONDUITS') ?? [];
  if (condutos.length === 0) throw new Error('Arquivo SWMM sem a seção [CONDUITS].');
  const fluxo = opcao(secoes, 'FLOW_UNITS');
  const si = fluxo === '' ? true : ['LPS', 'CMS', 'MLD'].includes(fluxo);
  if (fluxo === '') avisos.push('[OPTIONS] não informa FLOW_UNITS; presumido SI (metros).');
  const k = si ? 1 : 0.3048;
  // Rede com sub-bacias é drenagem pluvial; sem elas, tratamos como esgoto sanitário.
  const drenagem = (secoes.get('SUBCATCHMENTS') ?? []).length > 0;
  const disciplina: Disciplina = drenagem ? 'drenagem' : 'esgotamento';
  const rede = drenagem ? 'drenagem pluvial' : 'esgoto sanitário';
  const base = { arquivo, formato: 'swmm' as const, disciplina };
  const itens: ItemQuantitativo[] = [];

  // [XSECTIONS] Link Shape Geom1 Geom2 … — Geom1 = diâmetro (CIRCULAR) ou altura.
  const secao = new Map<string, { forma: string; g1: number; g2: number }>();
  for (const x of secoes.get('XSECTIONS') ?? []) secao.set(x[0]!, { forma: (x[1] ?? '').toUpperCase(), g1: n(x[2]) * k, g2: n(x[3]) * k });

  // [CONDUITS] Name FromNode ToNode Length Roughness InOffset OutOffset
  let semSecao = 0;
  for (const c of condutos) {
    const s = secao.get(c[0]!);
    const comp = n(c[3]) * k;
    let descricao: string;
    const atributos: Record<string, string | number> = {};
    if (!s) { semSecao++; descricao = `Coletor de ${rede} (seção não informada)`; }
    else if (s.forma === 'CIRCULAR' || s.forma === 'FORCE_MAIN') {
      const d = dn(s.g1 * 1000);
      descricao = `Tubo para ${rede} DN ${d} mm`;
      atributos.diametroMm = d;
    } else {
      descricao = `Galeria/canal ${s.forma.toLowerCase().replace(/_/g, ' ')} ${s.g2 > 0 ? `${s.g2.toFixed(2)} × ` : ''}${s.g1.toFixed(2)} m`;
      atributos.forma = s.forma;
    }
    itens.push(criarItem({ ...base, grupo: 'Tubulação', descricao, unidade: 'm', quantidade: comp, atributos }));
  }
  if (semSecao) avisos.push(`${semSecao} conduto(s) sem [XSECTIONS]: diâmetro desconhecido.`);

  // [JUNCTIONS] Name Elevation MaxDepth … — MaxDepth = profundidade do poço.
  for (const j of secoes.get('JUNCTIONS') ?? []) {
    const prof = n(j[2]) * k;
    itens.push(criarItem({ ...base, grupo: 'Poços de visita', descricao: `${drenagem ? 'Poço de visita / boca de lobo' : 'Poço de visita'}, ${faixaProfundidade(prof)}`, unidade: 'un', quantidade: 1 }));
  }
  const contar = (nome: string, grupo: string, descricao: string) => {
    const q = (secoes.get(nome) ?? []).length;
    if (q) itens.push(criarItem({ ...base, grupo, descricao, unidade: 'un', quantidade: q }));
  };
  contar('OUTFALLS', 'Lançamento', 'Dispositivo de lançamento / emissário');
  contar('STORAGE', 'Reservação', 'Unidade de detenção / reservatório');
  contar('PUMPS', 'Bombeamento', 'Estação elevatória (conjunto motobomba)');
  // [SUBCATCHMENTS] Name RainGage Outlet Area … — área em hectares (SI) ou acres.
  const areaHa = (secoes.get('SUBCATCHMENTS') ?? []).reduce((s, b) => s + n(b[3]), 0) * (si ? 1 : 0.404686);
  if (areaHa > 0) itens.push(criarItem({ ...base, grupo: 'Bacias', descricao: 'Área de contribuição das sub-bacias', unidade: 'ha', quantidade: areaHa }));

  const final = consolidar(itens);
  const extensao = final.filter((i) => i.unidade === 'm').reduce((s, i) => s + i.quantidade, 0);
  return { arquivo, formato: 'swmm', itens: final, avisos, resumo: `${condutos.length} trechos de ${rede} · ${extensao.toFixed(0)} m` };
}

/** Decide entre EPANET e SWMM pelas seções presentes. */
export function parseInp(arquivo: string, texto: string): ResultadoImportacao {
  const secoes = lerSecoesInp(texto);
  if (secoes.has('CONDUITS')) return parseSwmm(arquivo, texto, secoes);
  if (secoes.has('PIPES')) return parseEpanet(arquivo, texto, secoes);
  throw new Error('Arquivo .inp não reconhecido: sem [PIPES] (EPANET) nem [CONDUITS] (SWMM).');
}
