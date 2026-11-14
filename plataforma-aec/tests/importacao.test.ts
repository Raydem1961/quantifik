import { describe, expect, it } from 'vitest';
import { importarArquivo, normalizarUnidade } from '@/lib/import';
import { decodificar, dividirArgs, parseIfc } from '@/lib/import/ifc';
import { buscarComposicoes, calcularOrcamentoAnalitico, chaveVinculo, indexarBase, resolverVinculos, type BasePrecos } from '@/lib/orcamento/analitico';
import { maisRecentes } from '@/lib/orcamento/bases';
import { classificarArea, gerarQuadroUrbanistico } from '@/lib/urbanismo/quadro';
import { gerarEscopo } from '@/lib/briefing/scope';
import { IFC_REVIT_QUIRKS, IFC_EXEMPLO, EPANET_EXEMPLO, SWMM_EXEMPLO, LANDXML_EXEMPLO, PONTOS_EXEMPLO, TABELA_EXEMPLO } from '@/lib/import/exemplos';

const q = (r: { itens: { descricao: string; unidade: string; quantidade: number }[] }, re: RegExp, un: string) =>
  r.itens.find((i) => re.test(i.descricao) && i.unidade === un)?.quantidade;

describe('IFC (BIM)', () => {
  it('argumentos e strings STEP', () => {
    expect(dividirArgs("'a,b',#1,(#2,#3),IFCLABEL('x(y)'),$")).toEqual(["'a,b'", '#1', '(#2,#3)', "IFCLABEL('x(y)')", '$']);
    expect(decodificar("'Concreto \\X2\\00E7\\X0\\ e ''aspas'''")).toBe("Concreto ç e 'aspas'");
  });
  it('agrupa por tipo, soma quantidades de base e converte mm → m', () => {
    const r = parseIfc('modelo.ifc', IFC_EXEMPLO);
    expect(r.formato).toBe('ifc');
    // 2 paredes do mesmo tipo: NetSideArea 30 + 22,5 m²; volume 6 + 4,5
    expect(q(r, /Parede — Alvenaria 15cm/, 'un')).toBe(2);
    expect(q(r, /Parede — Alvenaria 15cm/, 'm2')).toBe(52.5);
    expect(q(r, /Parede — Alvenaria 15cm/, 'm3')).toBe(10.5);
    // comprimento informado em mm (10000 + 7500) → 17,5 m
    expect(q(r, /Parede — Alvenaria 15cm/, 'm')).toBe(17.5);
    expect(q(r, /Laje/, 'm3')).toBe(12);
    expect(q(r, /Tubo — PVC DN100/, 'm')).toBe(6);
    expect(q(r, /Porta/, 'un')).toBe(1);
    // a porta não tem quantidades de base → aviso parcial
    expect(r.avisos.join(' ')).toMatch(/1 de 5 elementos/);
    expect(r.itens.find((i) => /Tubo/.test(i.descricao))?.disciplina).toBe('hidrossanitario');
  });
  it('peculiaridades reais do Revit: unidades, repetidas em mm²/mm³, vazios e telhado', () => {
    const r = parseIfc('revit.ifc', IFC_REVIT_QUIRKS);
    // A unidade do projeto é a do IfcUnitAssignment (mm), não a IFCSIUNIT solta em metros.
    expect(q(r, /Externa 54cm/, 'm')).toBe(22.6);
    // Entre repetidas vale a convertida; altura não vira "comprimento".
    expect(q(r, /Externa 54cm/, 'm2')).toBe(48.021);
    expect(q(r, /Externa 54cm/, 'm3')).toBe(25.11);
    // Sem repetição: 57.282.798,9 num projeto em mm só pode ser mm² → 57,283 m².
    expect(q(r, /Interna/, 'm2')).toBe(57.283);
    expect(r.itens.some((i) => /Opening|OPENING/.test(i.descricao))).toBe(false);
    expect(r.itens.find((i) => /Telha/.test(i.descricao))?.descricao).toMatch(/^Cobertura/);
    expect(r.avisos.join(' ')).toMatch(/líquido maior que o bruto/);
    expect(r.avisos.join(' ')).toMatch(/normalizadas/);
  });
  it('recusa arquivo que não é STEP', () => {
    expect(() => importarArquivo('x.ifc', '<ifcXML/>')).toThrow(/STEP/);
  });
});

describe('redes: EPANET e SWMM', () => {
  it('EPANET: extensão por diâmetro, válvulas, reservatório', () => {
    const r = importarArquivo('rede.inp', EPANET_EXEMPLO);
    expect(r.formato).toBe('epanet');
    expect(q(r, /DN 100 mm/, 'm')).toBe(350); // 200 + 150
    expect(q(r, /DN 150 mm/, 'm')).toBe(420);
    expect(q(r, /Válvula PRV DN 100/, 'un')).toBe(1);
    expect(q(r, /Nó de rede/, 'un')).toBe(3);
    expect(q(r, /Reservatório de 393 m³/, 'un')).toBe(1); // π·10²/4 × (6 − 1)
    expect(r.itens.every((i) => i.disciplina === 'abastecimento_agua')).toBe(true);
  });
  it('SWMM: sem sub-bacias é esgoto; PVs por faixa de profundidade', () => {
    const r = importarArquivo('esgoto.inp', SWMM_EXEMPLO);
    expect(r.formato).toBe('swmm');
    expect(q(r, /esgoto sanitário DN 150 mm/, 'm')).toBe(130);
    expect(q(r, /esgoto sanitário DN 200 mm/, 'm')).toBe(80);
    expect(q(r, /Poço de visita, profundidade até 1,50 m/, 'un')).toBe(2);
    expect(q(r, /Poço de visita, profundidade de 1,51 a 2,50 m/, 'un')).toBe(1);
    expect(q(r, /lançamento/, 'un')).toBe(1);
    expect(r.itens[0]!.disciplina).toBe('esgotamento');
  });
  it('unidades americanas são convertidas', () => {
    const us = '[OPTIONS]\nUnits GPM\n[PIPES]\nP1 A B 1000 6 100\n';
    const r = importarArquivo('us.inp', us);
    expect(q(r, /DN 152 mm/, 'm')).toBe(304.8);
  });
});

describe('LandXML, pontos e planilhas', () => {
  it('LandXML: parcelas, eixos, superfície, rede e volumes', () => {
    const r = importarArquivo('loteamento.xml', LANDXML_EXEMPLO);
    expect(q(r, /Área de parcelas — Lote/, 'm2')).toBe(750);
    expect(q(r, /Parcelas — Lote/, 'un')).toBe(2);
    expect(q(r, /Área de parcelas — Área Verde/, 'm2')).toBe(1200);
    expect(q(r, /Eixo Rua A/, 'm')).toBe(240.5);
    expect(q(r, /Área em planta/, 'm2')).toBe(52000);
    expect(q(r, /drenagem pluvial DN 600 mm/, 'm')).toBe(85); // diâmetro em metros → mm
    expect(q(r, /profundidade de 1,51 a 2,50 m/, 'un')).toBe(1);
    expect(q(r, /Escavação/, 'm3')).toBe(1520.5);
    expect(q(r, /Bota-fora/, 'm3')).toBe(540.25);
  });
  it('pontos topográficos: área da envoltória independe da ordem N/E', () => {
    const r = importarArquivo('levantamento.txt', PONTOS_EXEMPLO);
    expect(r.formato).toBe('pontos');
    expect(q(r, /área levantada/, 'ha')).toBe(2); // retângulo 200 × 100 m
    expect(q(r, /Pontos levantados/, 'un')).toBe(6);
    expect(q(r, /código CERCA/, 'un')).toBe(4);
    expect(r.resumo).toMatch(/desnível 4\.50 m/);
  });
  it('planilha genérica com código de composição', () => {
    const r = importarArquivo('quantitativos.csv', TABELA_EXEMPLO);
    expect(r.formato).toBe('tabela');
    expect(r.itens).toHaveLength(3);
    const concreto = r.itens.find((i) => /Concreto/.test(i.descricao))!;
    expect([concreto.unidade, concreto.quantidade, concreto.codigo, concreto.disciplina]).toEqual(['m3', 42.5, 'C-001', 'estrutural']);
    expect(r.avisos.join(' ')).toMatch(/1 linha/);
  });
  it('CSV de volumes do Civil 3D continua reconhecido', () => {
    expect(importarArquivo('vol.csv', 'Station,Cut Area,Fill Area\n0,10,0\n20,12.5,1\n40,0,8\n').formato).toBe('civil3d');
  });
  it('formatos binários recebem orientação de exportação', () => {
    expect(() => importarArquivo('modelo.rvt', 'x')).toThrow(/IFC/);
    expect(() => importarArquivo('planta.dwg', 'x')).toThrow(/DXF/);
    expect(() => importarArquivo('a.xlsx', 'x')).toThrow(/CSV/);
  });
  it('unidades', () => {
    expect(['M²', 'm2 ', 'UND', 'pç', 'M3', 'ML'].map(normalizarUnidade)).toEqual(['m2', 'm2', 'un', 'un', 'm3', 'm']);
  });
});

const BASE: BasePrecos = {
  meta: { id: 'T', source: 'TESTE', uf: 'XX', reference: '2026-09' },
  rows: [
    { code: 'C-001', description: 'CONCRETO FCK 25 MPA, LANÇAMENTO E ADENSAMENTO', unit: 'M3', price: 600 },
    { code: 'T-150', description: 'TUBO PVC PARA ESGOTO SANITÁRIO DN 150 MM, ASSENTAMENTO', unit: 'M', price: 80 },
    { code: 'T-200', description: 'TUBO PVC PARA ESGOTO SANITÁRIO DN 200 MM, ASSENTAMENTO', unit: 'M', price: 120 },
    { code: 'E-001', description: 'ESCAVAÇÃO MECANIZADA DE VALA', unit: 'M3', price: 15 },
    { code: 'P-001', description: 'POÇO DE VISITA EM ALVENARIA, PROFUNDIDADE ATÉ 1,50 M', unit: 'UN', price: 2500 },
    { code: 'Z-000', description: 'ITEM SEM PREÇO', unit: 'UN', price: 0 },
  ],
};

describe('orçamento analítico', () => {
  const indice = indexarBase(BASE);
  it('busca respeita números: DN 150 nunca vira DN 200', () => {
    const r = buscarComposicoes(indice, 'Tubo para esgoto sanitário DN 150 mm', 'm');
    expect(r[0]!.linha.code).toBe('T-150');
    expect(r.some((c) => c.linha.code === 'T-200')).toBe(false);
    expect(buscarComposicoes(indice, 'Tubo esgoto DN 300 mm', 'm')).toHaveLength(0);
  });
  it('vínculos: salvo > código da planilha > sugestão; sem aderência fica pendente', () => {
    const itens = [
      ...importarArquivo('esgoto.inp', SWMM_EXEMPLO).itens,
      ...importarArquivo('quantitativos.csv', TABELA_EXEMPLO).itens,
    ];
    const pv = itens.find((i) => /Poço de visita, profundidade até 1,50/.test(i.descricao))!;
    const vinculos = resolverVinculos(itens, indice, { [chaveVinculo(pv)]: { fonte: 'TESTE', codigo: 'P-001', fator: 1, estado: 'confirmado' } });
    const de = (re: RegExp) => vinculos[itens.find((i) => re.test(i.descricao))!.id];
    expect(de(/DN 150/)).toMatchObject({ codigo: 'T-150', estado: 'sugerido' });
    expect(de(/Concreto/)).toMatchObject({ codigo: 'C-001', estado: 'confirmado' });
    expect(vinculos[pv.id]).toMatchObject({ codigo: 'P-001', estado: 'confirmado' });
    expect(de(/lançamento/)).toBeUndefined();

    const o = calcularOrcamentoAnalitico(itens, vinculos, indice, 0.25);
    const total = 42.5 * 600 + 2 * 2500; // só confirmados entram no preço
    expect(o.custoDireto).toBe(total);
    expect(o.custoSugerido).toBe(130 * 80 + 80 * 120);
    expect(o.precoVenda).toBe(total * 1.25);
    expect(o.itensPendentes).toBeGreaterThan(0);
    expect(o.abc[0]!.descricao).toMatch(/Concreto/);
    expect(o.porDisciplina.map((d) => d.disciplina)).toContain('esgotamento');
  });
  it('vínculo salvo de outra fonte não é reaproveitado', () => {
    const item = importarArquivo('esgoto.inp', SWMM_EXEMPLO).itens.find((i) => /lançamento/.test(i.descricao))!;
    const v = resolverVinculos([item], indice, { [chaveVinculo(item)]: { fonte: 'SINAPI', codigo: 'P-001', fator: 1, estado: 'confirmado' } });
    expect(v[item.id]).toBeUndefined();
  });
  it('catálogo: só o mês mais recente por fonte/UF/regime', () => {
    const c = (reference: string, regime: string) => ({ id: reference + regime, source: 'SINAPI', uf: 'BA', reference, regime, status: 'ready', count: 1, file: 'x' });
    expect(maisRecentes([c('2026-08', 'D'), c('2026-09', 'D'), c('2026-08', 'N')]).map((b) => b.id)).toEqual(['2026-09D', '2026-08N']);
  });
});

describe('urbanismo e novas tipologias', () => {
  it('quadro de áreas de loteamento', () => {
    expect(classificarArea('A-URB-VERDE')).toBe('area_verde');
    const qd = gerarQuadroUrbanistico(100000, [
      { nome: 'Lotes', areaM2: 60000 }, { nome: 'Sistema viário', areaM2: 22000 }, { nome: 'Área verde', areaM2: 10000 },
      { nome: 'Institucional', areaM2: 4000 }, { nome: 'APP', areaM2: 4000 },
    ], 200, { areaVerdeMin: 0.1, institucionalMin: 0.05, areasPublicasMin: 0.35, loteMinimoM2: 250 });
    expect(qd.loteMedioM2).toBe(300);
    expect(qd.residuoM2).toBe(0);
    expect(qd.verificacoes.map((v) => v.conforme)).toEqual([true, false, true, true]);
  });
  it('briefing: loteamento, rede de água e condomínio vertical', () => {
    const base = { areaTerrenoM2: 80000, areaPretendidaM2: 0, pavimentos: 1, taxaOcupacaoMax: 0.5, coeficienteAproveitamentoMax: 1, topografia: 'aclive' as const, prazoDesejadoMeses: 12, programa: {} };
    const lot = gerarEscopo({ ...base, tipologia: 'loteamento' });
    expect(lot.disciplinas).toEqual(['eletrico', 'topografia', 'terraplenagem', 'urbanismo', 'pavimentacao', 'drenagem', 'esgotamento', 'abastecimento_agua']);
    expect(lot.verificacoes).toHaveLength(0);
    expect(lot.alertas.join(' ')).toMatch(/SINAPI/);
    expect(gerarEscopo({ ...base, tipologia: 'abastecimento_agua' }).disciplinas).toEqual(['topografia', 'abastecimento_agua']);
    const torre = gerarEscopo({ ...base, tipologia: 'condominio_vertical', areaTerrenoM2: 2000, areaPretendidaM2: 9000, pavimentos: 15, coeficienteAproveitamentoMax: 4, programa: { elevadores: 2 } });
    expect(torre.verificacoes[1]!.conforme).toBe(false); // 9000 > 2000 × 4
    expect(torre.alertas.join(' ')).toMatch(/NBR 12721/);
  });
});
