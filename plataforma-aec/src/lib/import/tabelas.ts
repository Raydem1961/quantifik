/**
 * Arquivos tabulares:
 *  • pontos topográficos (estação total / GNSS): "id, N, E, Z, descrição" — CSV, TXT ou TAB;
 *  • planilhas de quantitativos exportadas de qualquer software (tabelas do Revit, Archicad,
 *    TQS, Eberick, QiBuilder, Excel): colunas de descrição, unidade e quantidade.
 */
import { numeroFlexivel } from '../cad/civil3d';
import type { Disciplina } from '../types';
import { consolidar, criarItem, normalizarUnidade, type ItemQuantitativo, type ResultadoImportacao } from './modelo';

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function detectarSeparador(linhas: string[]): string {
  // Vence o separador que divide mais linhas em 3+ colunas (linhas de título não atrapalham).
  const amostra = linhas.slice(0, 15);
  let melhor = ' ';
  let pontos = 0;
  for (const sep of [';', '\t', ',']) {
    const p = amostra.filter((l) => l.split(sep).length >= 3).length;
    if (p > pontos) { pontos = p; melhor = sep; }
  }
  return melhor;
}
const dividir = (linha: string, sep: string) =>
  (sep === ' ' ? linha.trim().split(/\s+/) : linha.split(sep)).map((c) => c.trim().replace(/^"|"$/g, ''));
const linhasUteis = (texto: string) =>
  texto.replace(/^﻿/, '').split(/\r\n|\r|\n/).filter((l) => l.trim() !== '' && !/^\s*[#!]/.test(l));

// ───────────────────── Pontos topográficos ─────────────────────

interface PontoTopo { id: string; a: number; b: number; z: number; codigo: string }

/** Envoltória convexa (monotone chain de Andrew) → área do polígono envolvente. */
function areaEnvoltoria(pts: { x: number; y: number }[]): number {
  const p = [...pts].sort((u, v) => u.x - v.x || u.y - v.y);
  if (p.length < 3) return 0;
  const cruz = (o: typeof p[0], a: typeof p[0], b: typeof p[0]) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const metade = (lista: typeof p) => {
    const h: typeof p = [];
    for (const q of lista) {
      while (h.length >= 2 && cruz(h[h.length - 2]!, h[h.length - 1]!, q) <= 0) h.pop();
      h.push(q);
    }
    h.pop();
    return h;
  };
  const casco = [...metade(p), ...metade([...p].reverse())];
  let area = 0;
  for (let i = 0; i < casco.length; i++) {
    const a = casco[i]!, b = casco[(i + 1) % casco.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

/** Tenta ler o arquivo como lista de pontos; devolve null se não parecer uma. */
export function lerPontos(texto: string): PontoTopo[] | null {
  const linhas = linhasUteis(texto);
  if (linhas.length < 3) return null;
  const sep = detectarSeparador(linhas);
  const pontos: PontoTopo[] = [];
  let invalidas = 0;
  linhas.forEach((linha, i) => {
    const c = dividir(linha, sep);
    const nums = [c[1], c[2], c[3]].map((v) => numeroFlexivel(v ?? ''));
    if (c.length < 4 || nums.some(Number.isNaN)) {
      if (i > 0) invalidas++; // a primeira linha pode ser cabeçalho
      return;
    }
    pontos.push({ id: c[0]!, a: nums[0]!, b: nums[1]!, z: nums[2]!, codigo: (c[4] ?? '').trim() });
  });
  // É uma lista de pontos se quase todas as linhas têm id + três números.
  return pontos.length >= 3 && invalidas <= linhas.length * 0.1 ? pontos : null;
}

export function parsePontos(arquivo: string, texto: string, pontos = lerPontos(texto)): ResultadoImportacao {
  if (!pontos) throw new Error('O arquivo não parece uma lista de pontos (esperado: id, N, E, Z, descrição).');
  const base = { arquivo, formato: 'pontos' as const, disciplina: 'topografia' as Disciplina };
  const avisos: string[] = [];
  // A área independe de a ordem ser N,E ou E,N — por isso não é preciso adivinhar a convenção.
  const areaM2 = areaEnvoltoria(pontos.map((p) => ({ x: p.a, y: p.b })));
  const zs = pontos.map((p) => p.z);
  const zMin = Math.min(...zs), zMax = Math.max(...zs);
  const itens: ItemQuantitativo[] = [
    criarItem({ ...base, grupo: 'Levantamento', descricao: 'Levantamento planialtimétrico cadastral — área levantada', unidade: 'ha', quantidade: areaM2 / 10000, atributos: { areaM2: Math.round(areaM2), cotaMin: zMin, cotaMax: zMax } }),
    criarItem({ ...base, grupo: 'Levantamento', descricao: 'Pontos levantados em campo', unidade: 'un', quantidade: pontos.length }),
  ];
  const porCodigo = new Map<string, number>();
  for (const p of pontos) if (p.codigo) porCodigo.set(p.codigo.toUpperCase(), (porCodigo.get(p.codigo.toUpperCase()) ?? 0) + 1);
  for (const [codigo, q] of porCodigo) itens.push(criarItem({ ...base, grupo: 'Cadastro por código', descricao: `Pontos com código ${codigo}`, unidade: 'un', quantidade: q }));
  avisos.push('A área levantada é a da envoltória convexa dos pontos — em perímetros côncavos ela superestima a área real.');
  return { arquivo, formato: 'pontos', itens, avisos, resumo: `${pontos.length} pontos · ${(areaM2 / 10000).toFixed(2)} ha · desnível ${(zMax - zMin).toFixed(2)} m` };
}

// ───────────────────── Planilha de quantitativos ─────────────────────

type Coluna = 'codigo' | 'descricao' | 'unidade' | 'quantidade' | 'grupo';
const PADROES: [Coluna, RegExp][] = [
  ['codigo', /^(cod|codigo|code|item code|composicao|sinapi|sicro|orse|ref)\b/],
  ['quantidade', /^(qtd|qtde|quant|quantidade|quantity|qty|count|contagem|total)\b/],
  ['unidade', /^(un|und|unid|unidade|unit|uom)\b/],
  ['grupo', /^(grupo|group|categoria|category|familia|family|disciplina|etapa|nivel|level)\b/],
  ['descricao', /^(descricao|description|desc|servico|item|nome|name|tipo|type|material|elemento)\b/],
];

const DISCIPLINA_POR_TERMO: [RegExp, Disciplina][] = [
  [/estrutur|concreto|forma|armad|aco ca|viga|pilar|laje|fundac|estaca/, 'estrutural'],
  [/eletric|cabo|eletroduto|luminar|tomada|quadro|disjuntor/, 'eletrico'],
  [/esgoto|coletor|poco de visita/, 'esgotamento'],
  [/rede de agua|adutora|abastecimento/, 'abastecimento_agua'],
  [/drenag|pluvial|boca de lobo|galeria|sarjeta/, 'drenagem'],
  [/paviment|asfalt|cbuq|meio.?fio|base|sub.?base|imprimacao/, 'pavimentacao'],
  [/escavac|aterro|terraplen|corte|bota.?fora|compactac/, 'terraplenagem'],
  [/topograf|levantamento|locacao/, 'topografia'],
  [/tubo|registro|hidraul|sanitar|louca|agua fria|agua quente/, 'hidrossanitario'],
];
export const inferirDisciplina = (texto: string): Disciplina => {
  const t = semAcento(texto);
  return DISCIPLINA_POR_TERMO.find(([re]) => re.test(t))?.[1] ?? 'arquitetonico';
};

export function parseTabela(arquivo: string, texto: string): ResultadoImportacao {
  const linhas = linhasUteis(texto);
  if (linhas.length < 2) throw new Error('Planilha vazia.');
  const sep = detectarSeparador(linhas);
  // O cabeçalho é a primeira linha (até a 15ª) que nomeia descrição e quantidade.
  let idx = -1;
  let mapa = new Map<Coluna, number>();
  for (let i = 0; i < Math.min(15, linhas.length); i++) {
    const m = new Map<Coluna, number>();
    dividir(linhas[i]!, sep).forEach((c, j) => {
      const col = PADROES.find(([, re]) => re.test(semAcento(c)))?.[0];
      if (col && !m.has(col)) m.set(col, j);
    });
    if (m.has('descricao') && m.has('quantidade')) { idx = i; mapa = m; break; }
  }
  if (idx < 0) {
    throw new Error('Não encontrei as colunas de descrição e quantidade. Use um cabeçalho como: descricao;unidade;quantidade (opcionais: codigo, grupo).');
  }
  const avisos: string[] = [];
  const itens: ItemQuantitativo[] = [];
  let ignoradas = 0;
  for (const linha of linhas.slice(idx + 1)) {
    const c = dividir(linha, sep);
    const ler = (col: Coluna) => (mapa.has(col) ? c[mapa.get(col)!] ?? '' : '');
    const descricao = ler('descricao');
    const quantidade = numeroFlexivel(ler('quantidade'));
    if (!descricao || Number.isNaN(quantidade) || quantidade <= 0) { ignoradas++; continue; }
    const grupo = ler('grupo') || 'Planilha';
    itens.push(criarItem({
      arquivo, formato: 'tabela', disciplina: inferirDisciplina(`${grupo} ${descricao}`), grupo, descricao,
      unidade: normalizarUnidade(ler('unidade') || 'un'), quantidade, codigo: ler('codigo') || undefined,
    }));
  }
  if (itens.length === 0) throw new Error('Nenhuma linha com descrição e quantidade válidas.');
  if (ignoradas) avisos.push(`${ignoradas} linha(s) sem descrição ou com quantidade não numérica foram ignoradas.`);
  if (!mapa.has('unidade')) avisos.push('Planilha sem coluna de unidade: presumido "un" em todos os itens.');
  return { arquivo, formato: 'tabela', itens: consolidar(itens), avisos, resumo: `${itens.length} linhas de quantitativo` };
}
