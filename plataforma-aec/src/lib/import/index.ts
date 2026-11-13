/**
 * Importador universal: identifica o formato pelo nome e pelo conteúdo e devolve os
 * quantitativos no modelo unificado. TypeScript puro — roda no navegador (resultado imediato)
 * e na Cloud Function que processa o upload.
 */
import { parseCivil3dCsv } from '../cad/civil3d';
import { extrairQto, mapearCamadasParaAreas, parseDxf, type UnidadeDesenho } from '../cad/dxf-qto';
import type { Disciplina } from '../types';
import { parseIfc } from './ifc';
import { parseLandXmlInfra } from './landxml';
import { consolidar, criarItem, type ItemQuantitativo, type ResultadoImportacao } from './modelo';
import { parseInp } from './redes';
import { lerPontos, parsePontos, parseTabela } from './tabelas';

export * from './modelo';

/** Extensões aceitas pelo upload (as binárias proprietárias exigem exportação — ver README). */
export const EXTENSOES_IMPORTAVEIS = ['dxf', 'ifc', 'xml', 'landxml', 'inp', 'csv', 'txt'] as const;

export interface OpcoesImportacao {
  /** Disciplina padrão para arquivos que não a informam (DXF). */
  disciplina?: Disciplina;
  unidadeDxf?: UnidadeDesenho;
}

function dxfParaItens(arquivo: string, texto: string, o: OpcoesImportacao): ResultadoImportacao {
  const qto = extrairQto(parseDxf(texto), o.unidadeDxf ? { unidade: o.unidadeDxf } : {});
  const disciplina = o.disciplina ?? 'arquitetonico';
  const base = { arquivo, formato: 'dxf' as const, disciplina };
  const itens: ItemQuantitativo[] = [];
  for (const l of qto.layers) {
    const area = l.areaM2 > 0 ? l.areaM2 : l.areaHatchM2;
    const atributos = { camada: l.layer };
    if (area > 0) itens.push(criarItem({ ...base, grupo: 'Áreas por camada', descricao: `Área — camada ${l.layer}`, unidade: 'm2', quantidade: area, atributos }));
    if (l.perimetroM > 0) itens.push(criarItem({ ...base, grupo: 'Perímetros por camada', descricao: `Perímetro — camada ${l.layer}`, unidade: 'm', quantidade: l.perimetroM, atributos }));
    if (l.comprimentoM > 0) itens.push(criarItem({ ...base, grupo: 'Comprimentos por camada', descricao: `Comprimento — camada ${l.layer}`, unidade: 'm', quantidade: l.comprimentoM, atributos }));
  }
  for (const b of qto.blocos) {
    itens.push(criarItem({ ...base, grupo: 'Blocos', descricao: `Bloco ${b.bloco}`, unidade: 'un', quantidade: b.quantidade, atributos: { camada: b.layer } }));
  }
  const areas = mapearCamadasParaAreas(qto).length;
  return {
    arquivo, formato: 'dxf', itens: consolidar(itens), avisos: qto.avisos,
    resumo: `${qto.totais.entidades} entidades · ${qto.layers.length} camadas${areas ? ` · ${areas} áreas NBR 12721` : ''}`,
  };
}

function civil3dParaItens(arquivo: string, texto: string): ResultadoImportacao {
  const v = parseCivil3dCsv(texto);
  const base = { arquivo, formato: 'civil3d' as const, disciplina: 'terraplenagem' as Disciplina, grupo: 'Movimento de terra' };
  const itens = [
    criarItem({ ...base, descricao: 'Escavação (corte)', unidade: 'm3', quantidade: v.corteM3 }),
    criarItem({ ...base, descricao: 'Aterro compactado', unidade: 'm3', quantidade: v.aterroM3 }),
    criarItem({ ...base, descricao: v.saldoM3 >= 0 ? 'Bota-fora (excedente de corte)' : 'Empréstimo (déficit de aterro)', unidade: 'm3', quantidade: Math.abs(v.saldoM3) }),
  ].filter((i) => i.quantidade > 0);
  return { arquivo, formato: 'civil3d', itens, avisos: v.avisos, resumo: `${v.secoes.length} seções · corte ${v.corteM3.toFixed(0)} m³ · aterro ${v.aterroM3.toFixed(0)} m³` };
}

const MSG_BINARIO: Record<string, string> = {
  dwg: 'DWG é binário: exporte em DXF (comando DXFOUT) ou use o sync-cad.ps1 -ConverterDxf.',
  rvt: 'Arquivo nativo do Revit: exporte em IFC (Arquivo → Exportar → IFC, com "Export base quantities") ou uma tabela em CSV.',
  pln: 'Arquivo nativo do Archicad: salve como IFC ou exporte a lista de quantitativos em CSV.',
  nwd: 'Navisworks: exporte o quantitativo (Quantification) em CSV.',
  nwc: 'Navisworks: exporte o quantitativo (Quantification) em CSV.',
  skp: 'SketchUp: exporte em IFC (Pro) ou DXF.',
  xlsx: 'Planilha Excel: salve a aba como CSV (separado por ponto e vírgula).',
  xls: 'Planilha Excel: salve a aba como CSV (separado por ponto e vírgula).',
  ifczip: 'ifcZIP: descompacte e envie o .ifc.',
  pdf: 'PDF não carrega quantitativos estruturados: envie o DXF, o IFC ou a planilha de origem.',
};

/** Importa qualquer arquivo de engenharia suportado. Lança erro com orientação quando não é possível. */
export function importarArquivo(arquivo: string, texto: string, opcoes: OpcoesImportacao = {}): ResultadoImportacao {
  const ext = arquivo.split('.').pop()?.toLowerCase() ?? '';
  if (MSG_BINARIO[ext]) throw new Error(MSG_BINARIO[ext]);
  if (texto.trim() === '') throw new Error('Arquivo vazio.');
  switch (ext) {
    case 'ifc': return parseIfc(arquivo, texto);
    case 'dxf': return dxfParaItens(arquivo, texto, opcoes);
    case 'inp': return parseInp(arquivo, texto);
    case 'xml':
    case 'landxml': return parseLandXmlInfra(arquivo, texto);
    case 'csv':
    case 'txt': {
      // Ordem: relatório de volumes (tem cabeçalho corte/aterro) → planilha com cabeçalho → pontos.
      const inicio = texto.slice(0, 4000).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      if (/(cut|corte)/.test(inicio) && /(fill|aterro)/.test(inicio)) return civil3dParaItens(arquivo, texto);
      const pontos = lerPontos(texto);
      if (pontos) return parsePontos(arquivo, texto, pontos);
      return parseTabela(arquivo, texto);
    }
    default:
      throw new Error(`Formato .${ext} não suportado. Aceitos: ${EXTENSOES_IMPORTAVEIS.map((e) => `.${e}`).join(', ')}.`);
  }
}
