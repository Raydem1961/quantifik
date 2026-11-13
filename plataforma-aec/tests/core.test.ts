import { describe, expect, it } from 'vitest';
import { calcularBdi, calcularOrcamento, simularCenarios, type CubTable } from '@/lib/cub/engine';
import { gerarCronogramaFisicoFinanceiro, gerarCurvaAbc, gerarCurvaS } from '@/lib/cub/schedule';
import { areaPolilinha, comprimentoPolilinha, extrairQto, mapearCamadasParaAreas, parseDxf } from '@/lib/cad/dxf-qto';
import { numeroFlexivel, parseCivil3dCsv, parseLandXml } from '@/lib/cad/civil3d';
import { renderizarModelo, paraBlocos } from '@/lib/contracts/template';
import { gerarEscopo } from '@/lib/briefing/scope';
import { sha256Hex } from '@/lib/signature/hash';

const e = (total: number) => ({ total, materiais: total * 0.5, maoDeObra: total * 0.42, despesasAdministrativas: total * 0.06, equipamentos: total * 0.02 });
const tabela: CubTable = {
  uf: 'XX', competencia: '2026-10', fonte: 'TESTE', desonerado: false,
  valores: { 'R1-B': e(2000), 'R1-N': e(2500), 'R1-A': e(3200), 'R8-N': e(2100) },
};

describe('motor CUB / NBR 12721', () => {
  it('calcula área equivalente, custo básico, BDI e preço', () => {
    const r = calcularOrcamento({
      tabela, padrao: 'medio', tipoEdificacao: 'unifamiliar', bdi: 0.25,
      areas: [
        { descricao: 'Casa', tipo: 'privativa_padrao', areaRealM2: 200 },
        { descricao: 'Garagem', tipo: 'garagem_subsolo', areaRealM2: 50, coeficiente: 0.5 },
        { descricao: 'Varanda', tipo: 'varanda', areaRealM2: 20, coeficiente: 0.75 },
      ],
      itensNaoInclusos: [{ descricao: 'Fundações especiais', tipo: 'percentual', valor: 0.04 }, { descricao: 'Elevador', tipo: 'fixo', valor: 100000 }],
    });
    expect(r.projetoCub).toBe('R1-N');
    expect(r.areaEquivalenteTotalM2).toBe(240); // 200 + 25 + 15
    expect(r.custoBasico).toBe(600000);
    expect(r.totalItensNaoInclusos).toBe(124000);
    expect(r.custoDireto).toBe(724000);
    expect(r.precoVenda).toBe(905000);
    expect(r.precoPorM2Real).toBeCloseTo(905000 / 270, 2);
    const c = r.composicao;
    expect(c.materiais + c.maoDeObra + c.despesasAdministrativas + c.equipamentos).toBeCloseTo(600000, 2);
    expect(r.avisos).toHaveLength(0);
  });
  it('alto luxo aplica fator e adicionais por m²', () => {
    const r = calcularOrcamento({
      tabela, padrao: 'alto_luxo', tipoEdificacao: 'unifamiliar', bdi: 0,
      areas: [{ descricao: 'Casa', tipo: 'privativa_padrao', areaRealM2: 100 }],
      ajusteAltoLuxo: { fatorMultiplicador: 1.5, adicionaisPorM2: [{ descricao: 'Automação', valorM2: 500 }] },
    });
    expect(r.custoBasico).toBe(480000); // 100 × 3200 × 1,5
    expect(r.precoVenda).toBe(530000);
  });
  it('avisa coeficiente fora da faixa e falha sem projeto-padrão', () => {
    const r = calcularOrcamento({ tabela, padrao: 'medio', tipoEdificacao: 'unifamiliar', bdi: 0, areas: [{ descricao: 'G', tipo: 'garagem_subsolo', areaRealM2: 10, coeficiente: 1 }] });
    expect(r.avisos[0]).toMatch(/fora da faixa/);
    expect(() => calcularOrcamento({ tabela, padrao: 'luxo', tipoEdificacao: 'multifamiliar', bdi: 0, areas: [{ descricao: 'x', tipo: 'privativa_padrao', areaRealM2: 1 }] })).toThrow(/R8-A/);
  });
  it('BDI pela fórmula do TCU', () => {
    const bdi = calcularBdi({ administracaoCentral: 0.04, seguroGarantia: 0.008, risco: 0.0127, despesasFinanceiras: 0.0123, lucro: 0.074, tributos: 0.0565 });
    expect(bdi).toBeCloseTo((1.0607 * 1.0123 * 1.074) / 0.9435 - 1, 10);
    expect(bdi).toBeGreaterThan(0.22);
    expect(bdi).toBeLessThan(0.23);
  });
  it('what-if compara padrões e reporta indisponíveis', () => {
    const base = { tabela, tipoEdificacao: 'unifamiliar' as const, bdi: 0.2, areas: [{ descricao: 'Casa', tipo: 'privativa_padrao' as const, areaRealM2: 100 }] };
    const { cenarios } = simularCenarios(base, ['medio', 'luxo', 'alto_luxo']);
    expect(cenarios.map((c) => c.resultado.precoVenda)).toEqual([300000, 384000, expect.any(Number)]);
    expect(cenarios[1]!.deltaPercentual).toBeCloseTo(0.28, 10);
    expect(simularCenarios({ ...base, tipoEdificacao: 'multifamiliar' }, ['medio', 'luxo']).indisponiveis).toEqual(['luxo']);
  });
});

describe('cronograma', () => {
  it('Curva S fecha exatamente no total e é monotônica', () => {
    const c = gerarCurvaS(1234567.89, 14);
    expect(c.reduce((s, p) => s + p.valor, 0)).toBeCloseTo(1234567.89, 2);
    expect(c.at(-1)!.valorAcumulado).toBe(1234567.89);
    expect(c.every((p) => p.valor >= 0)).toBe(true);
    expect(c[6]!.percentual).toBeGreaterThan(c[0]!.percentual); // meio > início
    expect(c[6]!.percentual).toBeGreaterThan(c[13]!.percentual); // meio > fim
  });
  it('físico-financeiro: linhas e meses somam o total', () => {
    const total = 987654.32;
    const cr = gerarCronogramaFisicoFinanceiro(total, 11);
    expect(cr.linhas.reduce((s, l) => s + l.valor, 0)).toBeCloseTo(total, 2);
    for (const l of cr.linhas) expect(l.mensal.reduce((s, v) => s + v, 0)).toBeCloseTo(l.valor, 2);
    expect(cr.totais.at(-1)!.valorAcumulado).toBeCloseTo(total, 2);
    expect(cr.totais.at(-1)!.percentualAcumulado).toBeCloseTo(1, 6);
  });
  it('Curva ABC', () => {
    const abc = gerarCurvaAbc([{ descricao: 'a', valor: 70 }, { descricao: 'b', valor: 15 }, { descricao: 'c', valor: 10 }, { descricao: 'd', valor: 5 }]);
    expect(abc.map((i) => i.classe)).toEqual(['A', 'A', 'B', 'C']);
  });
});

const dxf = (linhas: (string | number)[]) => linhas.join('\n') + '\n';
const DXF_EXEMPLO = dxf([
  0, 'SECTION', 2, 'HEADER', 9, '$INSUNITS', 70, 4, 0, 'ENDSEC',
  0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER',
  0, 'LAYER', 2, 'A-AREA-PRIV', 70, 0, 62, 3,
  0, 'LAYER', 2, 'OCULTA', 70, 1, 62, 1,
  0, 'ENDTAB', 0, 'ENDSEC',
  0, 'SECTION', 2, 'BLOCKS', 0, 'BLOCK', 2, 'PORTA', 0, 'LINE', 8, '0', 10, 0, 20, 0, 11, 900, 21, 0, 0, 'ENDBLK', 0, 'ENDSEC',
  0, 'SECTION', 2, 'ENTITIES',
  // retângulo 10 m × 5 m desenhado em mm
  0, 'LWPOLYLINE', 8, 'A-AREA-PRIV', 90, 4, 70, 1, 10, 0, 20, 0, 10, 10000, 20, 0, 10, 10000, 20, 5000, 10, 0, 20, 5000,
  0, 'CIRCLE', 8, 'A-AREA-PISCINA', 10, 0, 20, 0, 40, 2000,
  0, 'LINE', 8, 'PAREDE', 10, 0, 20, 0, 11, 3000, 21, 4000,
  0, 'ARC', 8, 'PAREDE', 10, 0, 20, 0, 40, 1000, 50, 270, 51, 90,
  0, 'INSERT', 8, 'ESQ', 2, 'PORTA', 10, 5, 20, 5,
  0, 'INSERT', 8, 'ESQ', 2, 'PORTA', 10, 9, 20, 5,
  0, 'POLYLINE', 8, 'A-AREA-VARANDA', 66, 1, 70, 1,
  0, 'VERTEX', 8, 'A-AREA-VARANDA', 10, 0, 20, 0, 0, 'VERTEX', 8, 'A-AREA-VARANDA', 10, 4000, 20, 0, 0, 'VERTEX', 8, 'A-AREA-VARANDA', 10, 4000, 20, 2000, 0, 'SEQEND',
  0, 'HATCH', 8, 'PISO', 10, 0, 20, 0, 30, 0, 2, 'SOLID', 70, 1, 71, 0, 91, 2,
  92, 3, 72, 0, 73, 1, 93, 4, 10, 0, 20, 0, 10, 6000, 20, 0, 10, 6000, 20, 6000, 10, 0, 20, 6000, 97, 0,
  92, 1, 93, 4, 72, 1, 10, 1000, 20, 1000, 11, 3000, 21, 1000, 72, 1, 10, 3000, 20, 1000, 11, 3000, 21, 3000,
  72, 1, 10, 3000, 20, 3000, 11, 1000, 21, 3000, 72, 1, 10, 1000, 20, 3000, 11, 1000, 21, 1000, 97, 0,
  75, 0, 76, 1, 98, 1, 10, 500, 20, 500,
  0, 'LWPOLYLINE', 8, 'OCULTA', 90, 3, 70, 1, 10, 0, 20, 0, 10, 99999, 20, 0, 10, 0, 20, 99999,
  0, 'MTEXT', 8, 'TXT', 10, 1, 20, 1, 40, 200, 1, '\\fArial;SALA\\PESTAR',
  0, '3DFACE', 8, 'X',
  0, 'ENDSEC', 0, 'EOF',
]);

describe('parser DXF / QTO', () => {
  it('geometria com bulge: círculo em duas semicircunferências', () => {
    const v = [{ x: -1, y: 0, bulge: 1 }, { x: 1, y: 0, bulge: 1 }];
    expect(areaPolilinha(v)).toBeCloseTo(Math.PI, 10);
    expect(comprimentoPolilinha(v, true)).toBeCloseTo(2 * Math.PI, 10);
  });
  it('extrai áreas, perímetros, comprimentos e blocos por camada em metros', () => {
    const doc = parseDxf(DXF_EXEMPLO);
    expect(doc.insUnits).toBe(4);
    expect(doc.blocos).toEqual(['PORTA']);
    const q = extrairQto(doc);
    const L = Object.fromEntries(q.layers.map((l) => [l.layer, l]));
    expect(q.unidade).toBe('mm');
    expect(L['A-AREA-PRIV']!.areaM2).toBeCloseTo(50, 6);
    expect(L['A-AREA-PRIV']!.perimetroM).toBeCloseTo(30, 6);
    expect(L['A-AREA-PISCINA']!.areaM2).toBeCloseTo(Math.PI * 4, 3);
    expect(L['PAREDE']!.comprimentoM).toBeCloseTo(5 + Math.PI, 3); // linha 3-4-5 + semicírculo r=1
    expect(L['A-AREA-VARANDA']!.areaM2).toBeCloseTo(4, 6); // triângulo 4×2/2
    expect(L['PISO']!.areaHatchM2).toBeCloseTo(36 - 4, 6); // externo − ilha
    expect(L['OCULTA']).toBeUndefined(); // camada congelada
    expect(q.blocos).toEqual([{ bloco: 'PORTA', layer: 'ESQ', quantidade: 2 }]);
    expect(q.avisos.join(' ')).toMatch(/3DFACE/);
    const texto = doc.entidades.find((x) => x.tipo === 'TEXT');
    expect(texto && texto.tipo === 'TEXT' && texto.texto).toBe('SALA ESTAR');
    const areas = mapearCamadasParaAreas(q);
    expect(areas.map((a) => [a.tipo, Math.round(a.areaRealM2 * 100) / 100])).toEqual([
      ['piscina', 12.57], ['privativa_padrao', 50], ['varanda', 4],
    ]);
  });
  it('recusa DWG e arquivo sem ENTITIES', () => {
    expect(() => parseDxf('AC1032\u0000\u0000')).toThrow(/DWG/);
    expect(() => parseDxf(dxf([0, 'SECTION', 2, 'HEADER', 0, 'ENDSEC', 0, 'EOF']))).toThrow(/ENTITIES/);
  });
});

describe('Civil 3D', () => {
  it('números em formatos BR/US e estacas', () => {
    expect(numeroFlexivel('1.234,56')).toBe(1234.56);
    expect(numeroFlexivel('1,234.56')).toBe(1234.56);
    expect(numeroFlexivel('0+020.00')).toBe(20);
  });
  it('CSV com volumes (pt-BR, ponto e vírgula, linha de total)', () => {
    const csv = 'Relatório de Volumes\nEstaca;Área de Corte (m²);Área de Aterro (m²);Volume de Corte (m³);Volume de Aterro (m³);Vol. Corte Acum.\n0+000,00;10,00;0,00;0,00;0,00;0,00\n0+020,00;12,50;1,00;225,00;10,00;225,00\n0+040,00;0,00;8,00;125,00;90,00;350,00\nTotal;;;350,00;100,00;\n';
    const v = parseCivil3dCsv(csv);
    expect(v.corteM3).toBe(350);
    expect(v.aterroM3).toBe(100);
    expect(v.saldoM3).toBe(250);
    expect(v.secoes).toHaveLength(3);
  });
  it('CSV só com áreas → semissoma', () => {
    const v = parseCivil3dCsv('Station,Cut Area,Fill Area\n0,10,0\n20,12.5,1\n40,0,8\n');
    expect(v.corteM3).toBe(350);
    expect(v.aterroM3).toBe(100);
  });
  it('LandXML SurfVolume', () => {
    const v = parseLandXml('<LandXML><Units><Metric/></Units><SurfVolumes><SurfVolume surfBase="TN" surfCompare="PLATO" volCut="1520.5" volFill="980.25" volTotal="540.25"/></SurfVolumes></LandXML>');
    expect([v.corteM3, v.aterroM3, v.saldoM3]).toEqual([1520.5, 980.25, 540.25]);
  });
});

describe('contratos, briefing e hash', () => {
  it('variáveis, condicionais e pendências', () => {
    const r = renderizarModelo('Olá {{nome}}.\n\n{{#se tem_x}}Com X.{{/se}}\n\n{{#se padrao=luxo}}Luxo.{{/se}}{{#senao tem_y}}Sem Y.{{/senao}} {{falta}}', { nome: 'Ana', tem_x: true, padrao: 'medio' });
    expect(r.texto).toBe('Olá Ana.\n\nCom X.\n\nSem Y. [[falta]]');
    expect(r.pendentes).toEqual(['falta']);
    expect(paraBlocos('# T\n\nA **b** c')).toEqual([
      { tipo: 'h1', trechos: [{ texto: 'T', negrito: false }] },
      { tipo: 'p', trechos: [{ texto: 'A ', negrito: false }, { texto: 'b', negrito: true }, { texto: ' c', negrito: false }] },
    ]);
  });
  it('briefing gera escopo e acusa violação de TO', () => {
    const esc = gerarEscopo({ tipologia: 'residencial', areaTerrenoM2: 300, areaPretendidaM2: 400, pavimentos: 2, taxaOcupacaoMax: 0.5, coeficienteAproveitamentoMax: 1.5, topografia: 'declive', desnivelM: 4, prazoDesejadoMeses: 2, programa: { piscina: 1 } });
    expect(esc.disciplinas).toContain('terraplenagem');
    expect(esc.verificacoes[0]!.conforme).toBe(false); // projeção 200 > 150
    expect(esc.verificacoes[1]!.conforme).toBe(true); // 400 <= 450
    expect(esc.alertas.some((a) => /Prazo desejado/.test(a))).toBe(true);
  });
  it('SHA-256', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
