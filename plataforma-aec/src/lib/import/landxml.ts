/**
 * LandXML de infraestrutura: lotes (Parcels), eixos viários (Alignments), superfícies (Surfaces),
 * redes de tubos (PipeNetworks) e volumes entre superfícies. É o formato de intercâmbio do
 * Civil 3D, TopoGRAPH, Topcon/Leica, Bentley OpenRoads, QGIS e da maioria dos softwares de
 * topografia e projeto viário.
 */
import type { Disciplina } from '../types';
import { parseLandXml as parseVolumes } from '../cad/civil3d';
import { consolidar, criarItem, type ItemQuantitativo, type ResultadoImportacao } from './modelo';

function attrs(tag: string): Record<string, string> {
  const a: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:]+)\s*=\s*"([^"]*)"/g)) a[m[1]!] = m[2]!;
  return a;
}
const n = (v: string | undefined) => {
  const x = Number.parseFloat(v ?? '');
  return Number.isFinite(x) ? x : 0;
};
/** Blocos `<Tag …>…</Tag>` ou `<Tag …/>`: devolve a tag de abertura e o conteúdo. */
function* blocos(xml: string, tag: string): Generator<{ abertura: string; corpo: string }> {
  const re = new RegExp(`<${tag}\\b([^>]*?)(/>|>([\\s\\S]*?)</${tag}>)`, 'g');
  for (const m of xml.matchAll(re)) yield { abertura: m[1] ?? '', corpo: m[3] ?? '' };
}

const FATOR_DIAMETRO_MM: Record<string, number> = { millimeter: 1, centimeter: 10, meter: 1000, inch: 25.4, foot: 304.8, USSurveyFoot: 304.8 };

export function parseLandXmlInfra(arquivo: string, xml: string): ResultadoImportacao {
  if (!/<LandXML[\s>]/.test(xml)) throw new Error('O arquivo XML não é um LandXML.');
  const avisos: string[] = [];
  const itens: ItemQuantitativo[] = [];
  const base = { arquivo, formato: 'landxml' as const };
  const partes: string[] = [];

  const metric = /<Metric\b([^>]*)>/.exec(xml);
  const imperial = /<Imperial\b([^>]*)>/.exec(xml);
  if (imperial) avisos.push('LandXML em unidades imperiais: comprimentos e áreas foram mantidos como estão no arquivo (não convertidos).');
  const unidadeDiam = attrs((metric ?? imperial)?.[1] ?? '').diameterUnit ?? 'meter';
  const kDiam = FATOR_DIAMETRO_MM[unidadeDiam] ?? 1000;

  // Lotes / quadras / áreas públicas
  let lotes = 0;
  for (const { abertura } of blocos(xml, 'Parcel')) {
    const a = attrs(abertura);
    const area = n(a.area);
    if (area <= 0) continue;
    lotes++;
    const classe = a.parcelType || a.class || a.desc || 'Lote';
    itens.push(criarItem({ ...base, disciplina: 'urbanismo', grupo: 'Parcelamento', descricao: `Área de parcelas — ${classe}`, unidade: 'm2', quantidade: area }));
    itens.push(criarItem({ ...base, disciplina: 'urbanismo', grupo: 'Parcelamento', descricao: `Parcelas — ${classe}`, unidade: 'un', quantidade: 1 }));
  }
  if (lotes) partes.push(`${lotes} parcelas`);

  // Eixos (vias, adutoras, interceptores)
  let eixos = 0;
  for (const { abertura } of blocos(xml, 'Alignment')) {
    const a = attrs(abertura);
    if (n(a.length) <= 0) continue;
    eixos++;
    itens.push(criarItem({ ...base, disciplina: 'pavimentacao', grupo: 'Eixos', descricao: `Eixo ${a.name || eixos}`, unidade: 'm', quantidade: n(a.length), atributos: { estacaInicial: n(a.staStart) } }));
  }
  if (eixos) partes.push(`${eixos} eixos`);

  // Superfícies (MDT): área 2D para limpeza/levantamento e 3D para regularização
  let superficies = 0;
  for (const { abertura, corpo } of blocos(xml, 'Surface')) {
    const def = /<Definition\b([^>]*)>/.exec(corpo);
    if (!def) continue;
    const d = attrs(def[1]!);
    const nome = attrs(abertura).name || `Superfície ${superficies + 1}`;
    if (n(d.area2DSurf) > 0) {
      superficies++;
      itens.push(criarItem({ ...base, disciplina: 'topografia', grupo: 'Superfícies', descricao: `Área em planta da superfície ${nome}`, unidade: 'm2', quantidade: n(d.area2DSurf), atributos: { cotaMin: n(d.elevMin), cotaMax: n(d.elevMax) } }));
    }
    if (n(d.area3DSurf) > 0) {
      itens.push(criarItem({ ...base, disciplina: 'terraplenagem', grupo: 'Superfícies', descricao: `Área inclinada (3D) da superfície ${nome}`, unidade: 'm2', quantidade: n(d.area3DSurf) }));
    }
  }
  if (superficies) partes.push(`${superficies} superfícies`);

  // Redes de tubos
  let tubos = 0;
  for (const { abertura, corpo } of blocos(xml, 'PipeNetwork')) {
    const tipo = (attrs(abertura).pipeNetType ?? '').toLowerCase();
    const disciplina: Disciplina = tipo.includes('water') ? 'abastecimento_agua' : tipo.includes('storm') ? 'drenagem' : 'esgotamento';
    const rede = disciplina === 'abastecimento_agua' ? 'rede de água' : disciplina === 'drenagem' ? 'drenagem pluvial' : 'esgoto sanitário';
    for (const { abertura: p, corpo: c } of blocos(corpo, 'Pipe')) {
      const a = attrs(p);
      const circ = /<CircPipe\b([^>]*)>/.exec(c);
      const ret = /<RectPipe\b([^>]*)>/.exec(c);
      const material = attrs((circ ?? ret)?.[1] ?? '').material;
      let descricao = `Tubo para ${rede} (seção não informada)`;
      const atributos: Record<string, string | number> = {};
      if (circ) {
        const d = Math.round(n(attrs(circ[1]!).diameter) * kDiam);
        descricao = `Tubo para ${rede} DN ${d} mm${material ? ` — ${material}` : ''}`;
        atributos.diametroMm = d;
      } else if (ret) {
        const r = attrs(ret[1]!);
        descricao = `Galeria retangular ${(n(r.width) * kDiam / 1000).toFixed(2)} × ${(n(r.height) * kDiam / 1000).toFixed(2)} m`;
      }
      if (n(a.length) <= 0) { avisos.push(`Tubo ${a.name ?? '?'} sem comprimento: ignorado.`); continue; }
      tubos++;
      itens.push(criarItem({ ...base, disciplina, grupo: 'Tubulação', descricao, unidade: 'm', quantidade: n(a.length), atributos }));
    }
    for (const { abertura: s } of blocos(corpo, 'Struct')) {
      const a = attrs(s);
      const prof = a.elevRim && a.elevSump ? n(a.elevRim) - n(a.elevSump) : 0;
      const faixa = prof <= 0 ? 'profundidade não informada' : prof <= 1.5 ? 'profundidade até 1,50 m' : prof <= 2.5 ? 'profundidade de 1,51 a 2,50 m' : prof <= 4 ? 'profundidade de 2,51 a 4,00 m' : 'profundidade acima de 4,00 m';
      itens.push(criarItem({ ...base, disciplina, grupo: 'Estruturas', descricao: `${a.desc || 'Poço de visita / caixa'}, ${faixa}`, unidade: 'un', quantidade: 1 }));
    }
  }
  if (tubos) partes.push(`${tubos} tubos`);

  // Volumes de corte/aterro (mesma leitura usada para os relatórios do Civil 3D)
  if (/<SurfVolume\b|<CrossSect\b/.test(xml)) {
    try {
      const v = parseVolumes(xml);
      if (v.corteM3 > 0) itens.push(criarItem({ ...base, disciplina: 'terraplenagem', grupo: 'Movimento de terra', descricao: 'Escavação (corte)', unidade: 'm3', quantidade: v.corteM3 }));
      if (v.aterroM3 > 0) itens.push(criarItem({ ...base, disciplina: 'terraplenagem', grupo: 'Movimento de terra', descricao: 'Aterro compactado', unidade: 'm3', quantidade: v.aterroM3 }));
      if (v.saldoM3 !== 0) itens.push(criarItem({ ...base, disciplina: 'terraplenagem', grupo: 'Movimento de terra', descricao: v.saldoM3 > 0 ? 'Bota-fora (excedente de corte)' : 'Empréstimo (déficit de aterro)', unidade: 'm3', quantidade: Math.abs(v.saldoM3) }));
      avisos.push(...v.avisos.filter((a) => !avisos.includes(a)));
      partes.push('volumes de terraplenagem');
    } catch { /* sem volumes aproveitáveis: segue com o restante */ }
  }

  const final = consolidar(itens);
  if (final.length === 0) throw new Error('LandXML sem dados quantificáveis (parcelas, eixos, superfícies com área, redes ou volumes).');
  return { arquivo, formato: 'landxml', itens: final, avisos: [...new Set(avisos)], resumo: partes.join(' · ') };
}
