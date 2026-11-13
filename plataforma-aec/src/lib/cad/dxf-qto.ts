/**
 * Parser DXF (ASCII) + extração automática de quantitativos (QTO).
 *
 * TypeScript puro, sem dependências: roda no navegador (pré-visualização imediata do upload),
 * na Cloud Function de processamento e nos testes.
 *
 * Suporta: HEADER ($INSUNITS), tabela LAYER, BLOCKS (nomes) e as entidades do model space
 * LINE, LWPOLYLINE (com bulge), POLYLINE/VERTEX, CIRCLE, ARC, ELLIPSE, SPLINE (aproximada),
 * HATCH (contornos em polilinha, linha e arco), INSERT, TEXT e MTEXT.
 *
 * Arquivos .dwg são binários e proprietários: são convertidos no servidor pelo Autodesk
 * Platform Services (ver functions/src/aps.ts) ou exportados como DXF pelo próprio AutoCAD
 * (comando DXFOUT / script sync-cad.ps1).
 */

export interface Ponto {
  x: number;
  y: number;
}

/** Vértice de polilinha; `bulge` = tan(θ/4) do arco até o próximo vértice (0 = segmento reto). */
export interface Vertice extends Ponto {
  bulge: number;
}

export type DxfEntity =
  | { tipo: 'LINE'; layer: string; a: Ponto; b: Ponto }
  | { tipo: 'POLYLINE'; layer: string; vertices: Vertice[]; fechada: boolean; aproximada?: boolean }
  | { tipo: 'CIRCLE'; layer: string; centro: Ponto; raio: number }
  | { tipo: 'ARC'; layer: string; centro: Ponto; raio: number; anguloInicial: number; anguloFinal: number }
  | { tipo: 'ELLIPSE'; layer: string; centro: Ponto; eixoMaior: Ponto; razao: number; inicio: number; fim: number }
  | { tipo: 'HATCH'; layer: string; contornos: Vertice[][]; padrao: string; parcial: boolean }
  | { tipo: 'INSERT'; layer: string; bloco: string; posicao: Ponto; escalaX: number; escalaY: number; rotacao: number }
  | { tipo: 'TEXT'; layer: string; posicao: Ponto; altura: number; texto: string };

export interface DxfLayer {
  nome: string;
  cor: number;
  congelada: boolean;
  desligada: boolean;
}

export interface DxfDocument {
  /** Código $INSUNITS (0 = sem unidade, 1 = pol, 2 = pé, 4 = mm, 5 = cm, 6 = m). */
  insUnits: number;
  layers: DxfLayer[];
  blocos: string[];
  entidades: DxfEntity[];
  /** Tipos de entidade encontrados mas não interpretados, com contagem. */
  ignoradas: Record<string, number>;
}

type Grupo = readonly [codigo: number, valor: string];

// ───────────────────────────── Leitura ─────────────────────────────

function tokenizar(texto: string): Grupo[] {
  if (texto.startsWith('AutoCAD Binary DXF')) {
    throw new Error('DXF binário não é suportado. Salve como DXF ASCII (SAVEAS → AutoCAD DXF).');
  }
  if (texto.startsWith('AC10')) {
    throw new Error('O arquivo é um DWG (binário). Converta via APS ou exporte DXF pelo AutoCAD (DXFOUT).');
  }
  const linhas = texto.split(/\r\n|\r|\n/);
  const grupos: Grupo[] = [];
  for (let i = 0; i + 1 < linhas.length; i += 2) {
    const codigo = Number.parseInt((linhas[i] ?? '').trim(), 10);
    if (Number.isNaN(codigo)) {
      // Linha em branco no fim do arquivo é tolerada; qualquer outra coisa é arquivo corrompido.
      if ((linhas[i] ?? '').trim() === '' && i + 2 >= linhas.length) break;
      throw new Error(`DXF inválido: código de grupo não numérico na linha ${i + 1}.`);
    }
    grupos.push([codigo, (linhas[i + 1] ?? '').trim()]);
  }
  if (grupos.length === 0) throw new Error('Arquivo DXF vazio.');
  return grupos;
}

const n = (v: string | undefined, padrao = 0): number => {
  const x = Number.parseFloat(v ?? '');
  return Number.isFinite(x) ? x : padrao;
};

/** Primeiro valor de um código dentro dos grupos de uma entidade. */
function primeiro(grupos: Grupo[], codigo: number): string | undefined {
  for (const g of grupos) if (g[0] === codigo) return g[1];
  return undefined;
}

/** Divide uma sequência de grupos em registros iniciados pelo código 0. */
function dividirRegistros(grupos: Grupo[]): { tipo: string; grupos: Grupo[] }[] {
  const registros: { tipo: string; grupos: Grupo[] }[] = [];
  let atual: { tipo: string; grupos: Grupo[] } | undefined;
  for (const g of grupos) {
    if (g[0] === 0) {
      atual = { tipo: g[1].toUpperCase(), grupos: [] };
      registros.push(atual);
    } else if (atual) {
      atual.grupos.push(g);
    }
  }
  return registros;
}

function lerVerticesLw(grupos: Grupo[]): Vertice[] {
  const vertices: Vertice[] = [];
  for (const [codigo, valor] of grupos) {
    if (codigo === 10) vertices.push({ x: n(valor), y: 0, bulge: 0 });
    else if (codigo === 20 && vertices.length) vertices[vertices.length - 1]!.y = n(valor);
    else if (codigo === 42 && vertices.length) vertices[vertices.length - 1]!.bulge = n(valor);
  }
  return vertices;
}

/** Converte um arco (centro, raio, ângulos em graus, sentido) em vértice com bulge. */
function arcoParaVertices(c: Ponto, r: number, a0: number, a1: number, antiHorario: boolean): [Vertice, Ponto] {
  const rad = (g: number) => (g * Math.PI) / 180;
  let varredura = antiHorario ? a1 - a0 : a0 - a1;
  varredura = ((varredura % 360) + 360) % 360;
  if (varredura === 0) varredura = 360;
  const theta = rad(varredura) * (antiHorario ? 1 : -1);
  const p0 = { x: c.x + r * Math.cos(rad(a0)), y: c.y + r * Math.sin(rad(a0)) };
  const p1 = { x: c.x + r * Math.cos(rad(a1)), y: c.y + r * Math.sin(rad(a1)) };
  return [{ ...p0, bulge: Math.tan(theta / 4) }, p1];
}

/** HATCH: percorre os contornos (grupo 91 = quantidade; 92 = tipo de cada contorno). */
function lerHatch(grupos: Grupo[], layer: string): DxfEntity {
  const contornos: Vertice[][] = [];
  let parcial = false;
  let i = grupos.findIndex((g) => g[0] === 91);
  const total = i >= 0 ? Math.trunc(n(grupos[i]![1])) : 0;
  i++;
  for (let c = 0; c < total && i < grupos.length; c++) {
    while (i < grupos.length && grupos[i]![0] !== 92) i++;
    if (i >= grupos.length) break;
    const flags = Math.trunc(n(grupos[i]![1]));
    i++;
    const vertices: Vertice[] = [];
    if (flags & 2) {
      // Contorno em polilinha: 72 (tem bulge), 73 (fechado), 93 (nº de vértices), 10/20/42…
      let nVert = 0;
      while (i < grupos.length && grupos[i]![0] !== 93) i++;
      if (i < grupos.length) nVert = Math.trunc(n(grupos[i]![1]));
      i++;
      while (i < grupos.length && vertices.length <= nVert) {
        const [cod, val] = grupos[i]!;
        if (cod === 10) {
          if (vertices.length === nVert) break;
          vertices.push({ x: n(val), y: 0, bulge: 0 });
        } else if (cod === 20 && vertices.length) vertices[vertices.length - 1]!.y = n(val);
        else if (cod === 42 && vertices.length) vertices[vertices.length - 1]!.bulge = n(val);
        else if (cod === 97 || cod === 92 || cod === 75) break;
        i++;
      }
    } else {
      // Contorno por arestas: 93 = nº de arestas; cada aresta começa com 72 (1 linha, 2 arco, 3 elipse, 4 spline).
      let nArestas = 0;
      while (i < grupos.length && grupos[i]![0] !== 93) i++;
      if (i < grupos.length) nArestas = Math.trunc(n(grupos[i]![1]));
      i++;
      for (let a = 0; a < nArestas && i < grupos.length; a++) {
        while (i < grupos.length && grupos[i]![0] !== 72) i++;
        if (i >= grupos.length) break;
        const tipoAresta = Math.trunc(n(grupos[i]![1]));
        i++;
        const campos = new Map<number, number>();
        while (i < grupos.length && ![72, 97, 92, 75].includes(grupos[i]![0])) {
          if (!campos.has(grupos[i]![0])) campos.set(grupos[i]![0], n(grupos[i]![1]));
          i++;
        }
        const f = (k: number) => campos.get(k) ?? 0;
        if (tipoAresta === 1) {
          vertices.push({ x: f(10), y: f(20), bulge: 0 });
        } else if (tipoAresta === 2) {
          const [v] = arcoParaVertices({ x: f(10), y: f(20) }, f(40), f(50), f(51), f(73) !== 0);
          vertices.push(v);
        } else {
          parcial = true; // elipse/spline em contorno de hatch: área não calculada
        }
      }
    }
    if (vertices.length >= 2) contornos.push(vertices);
  }
  return { tipo: 'HATCH', layer, contornos, padrao: primeiro(grupos, 2) ?? '', parcial };
}

/** Remove os códigos de formatação do MTEXT (\P, \fArial;, {…}) deixando só o texto. */
function limparMtext(s: string): string {
  return s
    .replace(/\\P/g, ' ')
    .replace(/\\[ACFHQTWfacqhtw][^;]*;/g, '')
    .replace(/\\[LlOoKk]/g, '')
    .replace(/[{}]/g, '')
    .trim();
}

function lerEntidades(grupos: Grupo[], ignoradas: Record<string, number>): DxfEntity[] {
  const registros = dividirRegistros(grupos);
  const entidades: DxfEntity[] = [];
  for (let r = 0; r < registros.length; r++) {
    const { tipo, grupos: g } = registros[r]!;
    if (primeiro(g, 67) === '1') continue; // paper space não entra no QTO
    const layer = primeiro(g, 8) ?? '0';
    const f = (codigo: number, padrao = 0) => n(primeiro(g, codigo), padrao);
    switch (tipo) {
      case 'LINE':
        entidades.push({ tipo, layer, a: { x: f(10), y: f(20) }, b: { x: f(11), y: f(21) } });
        break;
      case 'LWPOLYLINE':
        entidades.push({ tipo: 'POLYLINE', layer, vertices: lerVerticesLw(g), fechada: (f(70) & 1) === 1 });
        break;
      case 'POLYLINE': {
        const flags = f(70);
        const vertices: Vertice[] = [];
        while (r + 1 < registros.length && registros[r + 1]!.tipo === 'VERTEX') {
          r++;
          const v = registros[r]!.grupos;
          vertices.push({ x: n(primeiro(v, 10)), y: n(primeiro(v, 20)), bulge: n(primeiro(v, 42)) });
        }
        if (r + 1 < registros.length && registros[r + 1]!.tipo === 'SEQEND') r++;
        if (flags & (16 | 64)) {
          ignoradas['POLYLINE(malha)'] = (ignoradas['POLYLINE(malha)'] ?? 0) + 1;
        } else {
          entidades.push({ tipo: 'POLYLINE', layer, vertices, fechada: (flags & 1) === 1 });
        }
        break;
      }
      case 'CIRCLE':
        entidades.push({ tipo, layer, centro: { x: f(10), y: f(20) }, raio: f(40) });
        break;
      case 'ARC':
        entidades.push({ tipo, layer, centro: { x: f(10), y: f(20) }, raio: f(40), anguloInicial: f(50), anguloFinal: f(51) });
        break;
      case 'ELLIPSE':
        entidades.push({
          tipo, layer, centro: { x: f(10), y: f(20) }, eixoMaior: { x: f(11), y: f(21) },
          razao: f(40, 1), inicio: f(41, 0), fim: f(42, Math.PI * 2),
        });
        break;
      case 'SPLINE': {
        // Aproximação: usa os pontos de ajuste (11/21) ou, na falta, os de controle (10/20).
        const pts: Vertice[] = [];
        const temAjuste = g.some((x) => x[0] === 11);
        const [cx, cy] = temAjuste ? [11, 21] : [10, 20];
        for (const [cod, val] of g) {
          if (cod === cx) pts.push({ x: n(val), y: 0, bulge: 0 });
          else if (cod === cy && pts.length) pts[pts.length - 1]!.y = n(val);
        }
        entidades.push({ tipo: 'POLYLINE', layer, vertices: pts, fechada: (f(70) & 1) === 1, aproximada: true });
        break;
      }
      case 'HATCH':
        entidades.push(lerHatch(g, layer));
        break;
      case 'INSERT':
        entidades.push({
          tipo, layer, bloco: primeiro(g, 2) ?? '?', posicao: { x: f(10), y: f(20) },
          escalaX: f(41, 1), escalaY: f(42, 1), rotacao: f(50),
        });
        break;
      case 'TEXT':
        entidades.push({ tipo, layer, posicao: { x: f(10), y: f(20) }, altura: f(40, 1), texto: primeiro(g, 1) ?? '' });
        break;
      case 'MTEXT': {
        const texto = g.filter((x) => x[0] === 3 || x[0] === 1).map((x) => x[1]).join('');
        entidades.push({ tipo: 'TEXT', layer, posicao: { x: f(10), y: f(20) }, altura: f(40, 1), texto: limparMtext(texto) });
        break;
      }
      case 'VERTEX':
      case 'SEQEND':
      case 'ATTRIB':
        break;
      default:
        ignoradas[tipo] = (ignoradas[tipo] ?? 0) + 1;
    }
  }
  return entidades;
}

/** Interpreta o texto de um arquivo DXF ASCII. */
export function parseDxf(texto: string): DxfDocument {
  const grupos = tokenizar(texto);
  const doc: DxfDocument = { insUnits: 0, layers: [], blocos: [], entidades: [], ignoradas: {} };

  // Localiza as seções: 0/SECTION, 2/NOME … 0/ENDSEC
  const secoes = new Map<string, Grupo[]>();
  for (let i = 0; i < grupos.length; i++) {
    const [cod, val] = grupos[i]!;
    if (cod === 0 && val === 'SECTION' && grupos[i + 1]?.[0] === 2) {
      const nome = grupos[i + 1]![1].toUpperCase();
      const inicio = i + 2;
      let fim = inicio;
      while (fim < grupos.length && !(grupos[fim]![0] === 0 && grupos[fim]![1] === 'ENDSEC')) fim++;
      secoes.set(nome, grupos.slice(inicio, fim));
      i = fim;
    }
  }
  // DXF R12 mínimo pode vir sem seções explícitas além de ENTITIES; sem ENTITIES não há o que medir.
  const entities = secoes.get('ENTITIES');
  if (!entities) throw new Error('DXF sem seção ENTITIES — nada a quantificar.');

  const header = secoes.get('HEADER') ?? [];
  for (let i = 0; i < header.length - 1; i++) {
    if (header[i]![0] === 9 && header[i]![1] === '$INSUNITS') doc.insUnits = Math.trunc(n(header[i + 1]![1]));
  }

  for (const reg of dividirRegistros(secoes.get('TABLES') ?? [])) {
    if (reg.tipo !== 'LAYER') continue;
    const nome = primeiro(reg.grupos, 2);
    if (!nome) continue;
    const cor = Math.trunc(n(primeiro(reg.grupos, 62), 7));
    const flags = Math.trunc(n(primeiro(reg.grupos, 70)));
    doc.layers.push({ nome, cor: Math.abs(cor), congelada: (flags & 1) === 1, desligada: cor < 0 });
  }

  for (const reg of dividirRegistros(secoes.get('BLOCKS') ?? [])) {
    if (reg.tipo !== 'BLOCK') continue;
    const nome = primeiro(reg.grupos, 2);
    if (nome && !nome.startsWith('*')) doc.blocos.push(nome);
  }

  doc.entidades = lerEntidades(entities, doc.ignoradas);

  // Camadas usadas por entidades mas ausentes da tabela (DXF R12 simplificado).
  const conhecidas = new Set(doc.layers.map((l) => l.nome));
  for (const e of doc.entidades) {
    if (!conhecidas.has(e.layer)) {
      conhecidas.add(e.layer);
      doc.layers.push({ nome: e.layer, cor: 7, congelada: false, desligada: false });
    }
  }
  return doc;
}

// ───────────────────────────── Geometria ─────────────────────────────

/** Comprimento de um trecho de polilinha (reto ou em arco, conforme o bulge). */
function comprimentoTrecho(a: Vertice, b: Ponto): number {
  const corda = Math.hypot(b.x - a.x, b.y - a.y);
  if (a.bulge === 0 || corda === 0) return corda;
  const theta = 4 * Math.atan(Math.abs(a.bulge));
  return (corda * theta) / (2 * Math.sin(theta / 2));
}

/** Perímetro (fechada) ou comprimento (aberta) de uma polilinha, considerando arcos. */
export function comprimentoPolilinha(vertices: Vertice[], fechada: boolean): number {
  let total = 0;
  const ultimo = fechada ? vertices.length : vertices.length - 1;
  for (let i = 0; i < ultimo; i++) total += comprimentoTrecho(vertices[i]!, vertices[(i + 1) % vertices.length]!);
  return total;
}

/**
 * Área de uma polilinha fechada: fórmula de Gauss (shoelace) + área dos segmentos circulares
 * dos trechos com bulge. Para um arco de ângulo θ = 4·atan(bulge) e raio r, o segmento
 * circular vale r²/2 · (θ − sen θ); o sinal de θ acompanha o do bulge.
 */
export function areaPolilinha(vertices: Vertice[]): number {
  if (vertices.length < 2) return 0;
  let soma = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i]!;
    const b = vertices[(i + 1) % vertices.length]!;
    soma += (a.x * b.y - b.x * a.y) / 2;
    if (a.bulge !== 0) {
      const corda = Math.hypot(b.x - a.x, b.y - a.y);
      if (corda > 0) {
        const theta = 4 * Math.atan(a.bulge);
        const r = corda / (2 * Math.sin(Math.abs(theta) / 2));
        soma += (r * r * (theta - Math.sin(theta))) / 2;
      }
    }
  }
  return Math.abs(soma);
}

/** Perímetro da elipse pela 2ª aproximação de Ramanujan (erro < 0,01% para elipses usuais). */
function perimetroElipse(a: number, b: number): number {
  const h = ((a - b) / (a + b)) ** 2;
  return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}

// ───────────────────────────── QTO ─────────────────────────────

export type UnidadeDesenho = 'mm' | 'cm' | 'm' | 'pol' | 'pe';

const FATOR_PARA_METRO: Record<UnidadeDesenho, number> = { mm: 0.001, cm: 0.01, m: 1, pol: 0.0254, pe: 0.3048 };
const INSUNITS_PARA_UNIDADE: Record<number, UnidadeDesenho> = { 1: 'pol', 2: 'pe', 4: 'mm', 5: 'cm', 6: 'm' };

export interface QtoLayer {
  layer: string;
  /** Área de polilinhas fechadas, círculos e elipses completas (m²). */
  areaM2: number;
  /** Área de hachuras (m²) — separada para não duplicar o contorno que normalmente as acompanha. */
  areaHatchM2: number;
  /** Perímetro das figuras fechadas (m). */
  perimetroM: number;
  /** Comprimento de linhas, arcos e polilinhas abertas (m). */
  comprimentoM: number;
  entidades: number;
  figurasFechadas: number;
}

export interface QtoBloco {
  bloco: string;
  layer: string;
  quantidade: number;
}

export interface QtoResultado {
  unidade: UnidadeDesenho;
  unidadeOrigem: 'arquivo' | 'informada' | 'presumida';
  layers: QtoLayer[];
  blocos: QtoBloco[];
  totais: { areaM2: number; areaHatchM2: number; perimetroM: number; comprimentoM: number; entidades: number };
  extensao: { minX: number; minY: number; maxX: number; maxY: number } | null;
  avisos: string[];
}

export interface QtoOpcoes {
  /** Força a unidade do desenho, ignorando $INSUNITS. */
  unidade?: UnidadeDesenho;
  /** Unidade presumida quando o arquivo não informa $INSUNITS. Padrão: metro. */
  unidadePadrao?: UnidadeDesenho;
  /** Ignora camadas congeladas ou desligadas. Padrão: true. */
  ignorarCamadasOcultas?: boolean;
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

/** Extrai áreas, perímetros, comprimentos e contagem de blocos por camada. */
export function extrairQto(doc: DxfDocument, opcoes: QtoOpcoes = {}): QtoResultado {
  const avisos: string[] = [];
  let unidade: UnidadeDesenho;
  let unidadeOrigem: QtoResultado['unidadeOrigem'];
  if (opcoes.unidade) {
    unidade = opcoes.unidade;
    unidadeOrigem = 'informada';
  } else if (INSUNITS_PARA_UNIDADE[doc.insUnits]) {
    unidade = INSUNITS_PARA_UNIDADE[doc.insUnits]!;
    unidadeOrigem = 'arquivo';
  } else {
    unidade = opcoes.unidadePadrao ?? 'm';
    unidadeOrigem = 'presumida';
    avisos.push(`O arquivo não informa a unidade ($INSUNITS = ${doc.insUnits}); presumido "${unidade}". Confira antes de orçar.`);
  }
  const k = FATOR_PARA_METRO[unidade];
  const k2 = k * k;

  const ocultas = new Set(
    opcoes.ignorarCamadasOcultas === false
      ? []
      : doc.layers.filter((l) => l.congelada || l.desligada).map((l) => l.nome),
  );

  const porLayer = new Map<string, QtoLayer>();
  const obter = (layer: string): QtoLayer => {
    let q = porLayer.get(layer);
    if (!q) {
      q = { layer, areaM2: 0, areaHatchM2: 0, perimetroM: 0, comprimentoM: 0, entidades: 0, figurasFechadas: 0 };
      porLayer.set(layer, q);
    }
    return q;
  };
  const blocos = new Map<string, QtoBloco>();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const estender = (p: Ponto, folga = 0) => {
    minX = Math.min(minX, p.x - folga); minY = Math.min(minY, p.y - folga);
    maxX = Math.max(maxX, p.x + folga); maxY = Math.max(maxY, p.y + folga);
  };
  let aproximadas = 0;
  let hatchParcial = 0;

  for (const e of doc.entidades) {
    if (ocultas.has(e.layer)) continue;
    const q = obter(e.layer);
    q.entidades++;
    switch (e.tipo) {
      case 'LINE':
        q.comprimentoM += Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y) * k;
        estender(e.a); estender(e.b);
        break;
      case 'POLYLINE': {
        e.vertices.forEach((v) => estender(v));
        if (e.aproximada) aproximadas++;
        const comprimento = comprimentoPolilinha(e.vertices, e.fechada) * k;
        if (e.fechada && e.vertices.length >= 2) {
          q.areaM2 += areaPolilinha(e.vertices) * k2;
          q.perimetroM += comprimento;
          q.figurasFechadas++;
        } else {
          q.comprimentoM += comprimento;
        }
        break;
      }
      case 'CIRCLE':
        q.areaM2 += Math.PI * e.raio ** 2 * k2;
        q.perimetroM += 2 * Math.PI * e.raio * k;
        q.figurasFechadas++;
        estender(e.centro, e.raio);
        break;
      case 'ARC': {
        let varredura = (e.anguloFinal - e.anguloInicial) % 360;
        if (varredura <= 0) varredura += 360;
        q.comprimentoM += ((varredura * Math.PI) / 180) * e.raio * k;
        estender(e.centro, e.raio);
        break;
      }
      case 'ELLIPSE': {
        const a = Math.hypot(e.eixoMaior.x, e.eixoMaior.y);
        const b = a * e.razao;
        const completa = Math.abs(e.fim - e.inicio - 2 * Math.PI) < 1e-6;
        if (completa) {
          q.areaM2 += Math.PI * a * b * k2;
          q.perimetroM += perimetroElipse(a, b) * k;
          q.figurasFechadas++;
        } else {
          // Arco de elipse: integra numericamente o comprimento.
          let comp = 0;
          const passos = 64;
          let ant = { x: a * Math.cos(e.inicio), y: b * Math.sin(e.inicio) };
          for (let i = 1; i <= passos; i++) {
            const t = e.inicio + ((e.fim - e.inicio) * i) / passos;
            const p = { x: a * Math.cos(t), y: b * Math.sin(t) };
            comp += Math.hypot(p.x - ant.x, p.y - ant.y);
            ant = p;
          }
          q.comprimentoM += comp * k;
        }
        estender(e.centro, a);
        break;
      }
      case 'HATCH': {
        // O maior contorno é o externo; os demais são ilhas (vazios) e são subtraídos.
        const areas = e.contornos.map((c) => areaPolilinha(c)).sort((x, y) => y - x);
        const liquida = (areas[0] ?? 0) - areas.slice(1).reduce((s, v) => s + v, 0);
        q.areaHatchM2 += Math.max(0, liquida) * k2;
        if (e.parcial) hatchParcial++;
        e.contornos.forEach((c) => c.forEach((v) => estender(v)));
        break;
      }
      case 'INSERT': {
        const chave = `${e.bloco}\u0000${e.layer}`;
        const b = blocos.get(chave) ?? { bloco: e.bloco, layer: e.layer, quantidade: 0 };
        b.quantidade++;
        blocos.set(chave, b);
        estender(e.posicao);
        break;
      }
      case 'TEXT':
        estender(e.posicao);
        break;
    }
  }

  if (aproximadas) avisos.push(`${aproximadas} spline(s) medidas por aproximação poligonal.`);
  if (hatchParcial) avisos.push(`${hatchParcial} hachura(s) com contorno em elipse/spline: área não computada integralmente.`);
  const naoLidas = Object.entries(doc.ignoradas);
  if (naoLidas.length) {
    avisos.push(`Entidades não quantificadas: ${naoLidas.map(([t, c]) => `${t} (${c})`).join(', ')}.`);
  }

  const layers = [...porLayer.values()]
    .map((q) => ({
      ...q,
      areaM2: r4(q.areaM2), areaHatchM2: r4(q.areaHatchM2), perimetroM: r4(q.perimetroM), comprimentoM: r4(q.comprimentoM),
    }))
    .sort((a, b) => a.layer.localeCompare(b.layer));

  return {
    unidade,
    unidadeOrigem,
    layers,
    blocos: [...blocos.values()].sort((a, b) => a.bloco.localeCompare(b.bloco) || a.layer.localeCompare(b.layer)),
    totais: {
      areaM2: r4(layers.reduce((s, l) => s + l.areaM2, 0)),
      areaHatchM2: r4(layers.reduce((s, l) => s + l.areaHatchM2, 0)),
      perimetroM: r4(layers.reduce((s, l) => s + l.perimetroM, 0)),
      comprimentoM: r4(layers.reduce((s, l) => s + l.comprimentoM, 0)),
      entidades: layers.reduce((s, l) => s + l.entidades, 0),
    },
    extensao: Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null,
    avisos,
  };
}

// ───────────────────── Ponte QTO → orçamento ─────────────────────

export interface RegraCamada {
  /** Expressão regular (case-insensitive) aplicada ao nome da camada. */
  padrao: string;
  /** Tipo de área da NBR 12721 (chave de COEFICIENTES_NBR12721). */
  tipo: string;
  descricao: string;
}

/**
 * Convenção de camadas sugerida para o quadro de áreas. Desenhe uma polilinha fechada por
 * ambiente/pavimento nestas camadas e o orçamento é preenchido sozinho.
 */
export const REGRAS_CAMADAS_PADRAO: RegraCamada[] = [
  { padrao: '^(A-)?AREA[-_ ]?(PRIV|CONSTR|UTIL)', tipo: 'privativa_padrao', descricao: 'Área privativa' },
  { padrao: '^(A-)?AREA[-_ ]?GARAG', tipo: 'garagem_subsolo', descricao: 'Garagem' },
  { padrao: '^(A-)?AREA[-_ ]?VARAND', tipo: 'varanda', descricao: 'Varandas' },
  { padrao: '^(A-)?AREA[-_ ]?TERRAC', tipo: 'terraco_descoberto', descricao: 'Terraços descobertos' },
  { padrao: '^(A-)?AREA[-_ ]?PISCIN', tipo: 'piscina', descricao: 'Piscina' },
  { padrao: '^(A-)?AREA[-_ ]?(JARD|CALC|QUINT)', tipo: 'quintal_calcada_jardim', descricao: 'Jardins e calçadas' },
  { padrao: '^(A-)?AREA[-_ ]?ESTAC', tipo: 'estacionamento_terreno', descricao: 'Estacionamento descoberto' },
];

export interface AreaDeCamada {
  descricao: string;
  tipo: string;
  areaRealM2: number;
  camadas: string[];
}

/** Agrupa as áreas do QTO por tipo NBR 12721 conforme as regras de nomenclatura de camadas. */
export function mapearCamadasParaAreas(qto: QtoResultado, regras: RegraCamada[] = REGRAS_CAMADAS_PADRAO): AreaDeCamada[] {
  const compiladas = regras.map((r) => ({ ...r, re: new RegExp(r.padrao, 'i') }));
  const grupos = new Map<string, AreaDeCamada>();
  for (const l of qto.layers) {
    // Prefere polilinhas; se a camada só tiver hachuras, usa a área das hachuras.
    const area = l.areaM2 > 0 ? l.areaM2 : l.areaHatchM2;
    if (area <= 0) continue;
    const regra = compiladas.find((r) => r.re.test(l.layer));
    if (!regra) continue;
    const g = grupos.get(regra.tipo) ?? { descricao: regra.descricao, tipo: regra.tipo, areaRealM2: 0, camadas: [] };
    g.areaRealM2 = r4(g.areaRealM2 + area);
    g.camadas.push(l.layer);
    grupos.set(regra.tipo, g);
  }
  return [...grupos.values()];
}
