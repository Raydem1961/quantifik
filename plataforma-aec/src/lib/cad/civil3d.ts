/**
 * Leitura de volumes de corte/aterro exportados do AutoCAD Civil 3D.
 *
 *  • CSV do "Volume Report" / tabela de volumes por estaca (separador , ; ou TAB,
 *    decimal com ponto ou vírgula, cabeçalhos em português ou inglês).
 *  • LandXML (<SurfVolume volCut volFill>) e seções transversais (<CrossSect> com áreas).
 *
 * Quando o arquivo traz apenas áreas por estaca, o volume é calculado pelo método da
 * semissoma das áreas (average end area): V = (A1 + A2) / 2 × distância.
 */

export interface SecaoTerraplenagem {
  /** Estaca/estação em metros. */
  estaca: number;
  areaCorteM2: number;
  areaAterroM2: number;
  volumeCorteM3: number;
  volumeAterroM3: number;
}

export interface VolumesTerraplenagem {
  origem: 'csv' | 'landxml';
  secoes: SecaoTerraplenagem[];
  corteM3: number;
  aterroM3: number;
  /** Corte − aterro: positivo = bota-fora, negativo = empréstimo. */
  saldoM3: number;
  avisos: string[];
}

const r3 = (v: number) => Math.round(v * 1e3) / 1e3;

/** Converte "1.234,56", "1,234.56", "1234.56" e estacas "0+020.00" em número. */
export function numeroFlexivel(bruto: string): number {
  let s = bruto.trim().replace(/["\s]/g, '');
  if (s === '') return NaN;
  const estaca = /^(\d+)\+(\d+(?:[.,]\d+)?)$/.exec(s);
  if (estaca) return Number(estaca[1]) * 1000 + Number(estaca[2]!.replace(',', '.'));
  const temVirgula = s.includes(',');
  const temPonto = s.includes('.');
  if (temVirgula && temPonto) {
    // O último separador é o decimal; o outro é milhar.
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (temVirgula) {
    s = s.replace(',', '.');
  }
  const v = Number(s);
  return Number.isFinite(v) ? v : NaN;
}

function dividirLinhaCsv(linha: string, sep: string): string[] {
  const campos: string[] = [];
  let atual = '';
  let aspas = false;
  for (const ch of linha) {
    if (ch === '"') aspas = !aspas;
    else if (ch === sep && !aspas) {
      campos.push(atual);
      atual = '';
    } else atual += ch;
  }
  campos.push(atual);
  return campos.map((c) => c.trim());
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

type Coluna = 'estaca' | 'areaCorte' | 'areaAterro' | 'volCorte' | 'volAterro';

function identificarColuna(cabecalho: string): Coluna | undefined {
  const h = semAcento(cabecalho);
  if (/cum|acum|net|liquid|saldo/.test(h)) return undefined; // colunas acumuladas não são somadas
  const corte = /\bcut\b|corte/.test(h);
  const aterro = /\bfill\b|aterro/.test(h);
  const area = /area/.test(h);
  const volume = /vol/.test(h);
  if (/station|estaca|estacao|^sta\b/.test(h)) return 'estaca';
  if (corte && area) return 'areaCorte';
  if (aterro && area) return 'areaAterro';
  if (corte && volume) return 'volCorte';
  if (aterro && volume) return 'volAterro';
  return undefined;
}

function finalizar(origem: VolumesTerraplenagem['origem'], secoes: SecaoTerraplenagem[], avisos: string[], temVolume: boolean): VolumesTerraplenagem {
  secoes.sort((a, b) => a.estaca - b.estaca);
  if (!temVolume && secoes.length > 1) {
    for (let i = 1; i < secoes.length; i++) {
      const a = secoes[i - 1]!;
      const b = secoes[i]!;
      const d = b.estaca - a.estaca;
      b.volumeCorteM3 = r3(((a.areaCorteM2 + b.areaCorteM2) / 2) * d);
      b.volumeAterroM3 = r3(((a.areaAterroM2 + b.areaAterroM2) / 2) * d);
    }
    avisos.push('Volumes calculados pela semissoma das áreas (o arquivo traz apenas áreas por estaca).');
  }
  const corteM3 = r3(secoes.reduce((s, x) => s + x.volumeCorteM3, 0));
  const aterroM3 = r3(secoes.reduce((s, x) => s + x.volumeAterroM3, 0));
  return { origem, secoes, corteM3, aterroM3, saldoM3: r3(corteM3 - aterroM3), avisos };
}

/** Lê o relatório de volumes do Civil 3D em CSV. */
export function parseCivil3dCsv(texto: string): VolumesTerraplenagem {
  const linhas = texto.replace(/^﻿/, '').split(/\r\n|\r|\n/).filter((l) => l.trim() !== '');
  const avisos: string[] = [];

  // Procura a linha de cabeçalho (o relatório costuma ter linhas de título antes da tabela).
  let idxCabecalho = -1;
  let sep = ',';
  let mapa = new Map<Coluna, number>();
  for (let i = 0; i < Math.min(linhas.length, 30); i++) {
    for (const candidato of [';', '\t', ',']) {
      const campos = dividirLinhaCsv(linhas[i]!, candidato);
      const m = new Map<Coluna, number>();
      campos.forEach((c, idx) => {
        const col = identificarColuna(c);
        if (col && !m.has(col)) m.set(col, idx);
      });
      const temDados = m.has('volCorte') || m.has('volAterro') || m.has('areaCorte') || m.has('areaAterro');
      if (temDados && m.size > mapa.size) {
        mapa = m;
        sep = candidato;
        idxCabecalho = i;
      }
    }
    if (idxCabecalho >= 0 && mapa.size >= 3) break;
  }
  if (idxCabecalho < 0) {
    throw new Error('CSV do Civil 3D não reconhecido: não encontrei colunas de corte/aterro (Cut/Fill).');
  }

  const temVolume = mapa.has('volCorte') || mapa.has('volAterro');
  if (!temVolume && !mapa.has('estaca')) {
    throw new Error('O CSV traz apenas áreas, mas sem a coluna de estaca não é possível calcular volumes.');
  }
  const secoes: SecaoTerraplenagem[] = [];
  let descartadas = 0;
  for (const linha of linhas.slice(idxCabecalho + 1)) {
    const campos = dividirLinhaCsv(linha, sep);
    const ler = (c: Coluna) => (mapa.has(c) ? numeroFlexivel(campos[mapa.get(c)!] ?? '') : 0);
    const estaca = mapa.has('estaca') ? ler('estaca') : secoes.length;
    const valores = [ler('areaCorte'), ler('areaAterro'), ler('volCorte'), ler('volAterro')];
    if (Number.isNaN(estaca) || valores.some(Number.isNaN)) {
      descartadas++; // linha de total, rodapé ou texto
      continue;
    }
    secoes.push({
      estaca,
      areaCorteM2: Math.abs(valores[0]!), areaAterroM2: Math.abs(valores[1]!),
      volumeCorteM3: Math.abs(valores[2]!), volumeAterroM3: Math.abs(valores[3]!),
    });
  }
  if (secoes.length === 0) throw new Error('Nenhuma linha numérica encontrada no CSV do Civil 3D.');
  if (descartadas) avisos.push(`${descartadas} linha(s) não numéricas ignoradas (totais/rodapé).`);
  return finalizar('csv', secoes, avisos, temVolume);
}

function atributos(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:]+)\s*=\s*"([^"]*)"/g)) attrs[m[1]!] = m[2]!;
  return attrs;
}

/** Lê volumes de um LandXML exportado pelo Civil 3D. */
export function parseLandXml(texto: string): VolumesTerraplenagem {
  if (!/<LandXML[\s>]/.test(texto)) throw new Error('O arquivo XML não é um LandXML.');
  const avisos: string[] = [];
  const imperial = /<Imperial\b/.test(texto);
  if (imperial) avisos.push('LandXML em unidades imperiais: os valores foram mantidos como estão no arquivo (não convertidos).');

  // 1) Volumes entre superfícies (comparação TIN): <SurfVolume volCut="…" volFill="…"/>
  const secoes: SecaoTerraplenagem[] = [];
  for (const m of texto.matchAll(/<SurfVolume\b[^>]*>/g)) {
    const a = atributos(m[0]);
    const corte = numeroFlexivel(a.volCut ?? '0');
    const aterro = numeroFlexivel(a.volFill ?? '0');
    if (Number.isNaN(corte) || Number.isNaN(aterro)) continue;
    secoes.push({ estaca: secoes.length, areaCorteM2: 0, areaAterroM2: 0, volumeCorteM3: Math.abs(corte), volumeAterroM3: Math.abs(aterro) });
  }
  if (secoes.length) return finalizar('landxml', secoes, avisos, true);

  // 2) Seções transversais com áreas: <CrossSect sta="…" areaCut="…" areaFill="…">
  for (const m of texto.matchAll(/<CrossSect\b[^>]*>/g)) {
    const a = atributos(m[0]);
    const estaca = numeroFlexivel(a.sta ?? '');
    if (Number.isNaN(estaca)) continue;
    const temVol = a.volumeCut !== undefined || a.volumeFill !== undefined;
    secoes.push({
      estaca,
      areaCorteM2: Math.abs(numeroFlexivel(a.areaCut ?? '0') || 0),
      areaAterroM2: Math.abs(numeroFlexivel(a.areaFill ?? '0') || 0),
      volumeCorteM3: temVol ? Math.abs(numeroFlexivel(a.volumeCut ?? '0') || 0) : 0,
      volumeAterroM3: temVol ? Math.abs(numeroFlexivel(a.volumeFill ?? '0') || 0) : 0,
    });
  }
  if (secoes.length === 0) {
    throw new Error('LandXML sem <SurfVolume> nem <CrossSect>: exporte o relatório de volumes do Civil 3D.');
  }
  const temVolume = secoes.some((s) => s.volumeCorteM3 > 0 || s.volumeAterroM3 > 0);
  return finalizar('landxml', secoes, avisos, temVolume);
}

/** Decide o parser pelo nome do arquivo. */
export function parseCivil3d(nomeArquivo: string, texto: string): VolumesTerraplenagem {
  return /\.xml$/i.test(nomeArquivo) ? parseLandXml(texto) : parseCivil3dCsv(texto);
}
