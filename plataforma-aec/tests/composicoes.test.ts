/**
 * Motor de composições: testes unitários + comparação com o código ORIGINAL do Quantifik.
 * A comparação executa as funções do `../index.html` (o aplicativo publicado) e o motor novo
 * sobre as mesmas composições e exige o mesmo resultado, centavo a centavo. Se o arquivo do
 * Quantifik não estiver ao lado do projeto, essa parte é pulada.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import vm from 'node:vm';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  abrirComposicao, buscarServicos, calcularCotacao, calcularQuantidade, calcularServico, categoriaDe, chavePreco, classificar,
  descreverMedidas, parametrosPadrao, proximoNumero, type BaseComposicoes, type Composicao, type Cotacao,
} from '@/lib/composicoes/motor';
import { decodificarSinapi, extrairEmbutido, montarOrse } from '@/lib/composicoes/fonte';

const comp = (codigo: string, descricao: string, unidade: string, itens: Composicao['itens'], cs = 0): Composicao => ({ codigo, descricao, unidade, grupo: '', cs, cc: cs, itens });
const ins = (t: 'mo' | 'mat' | 'eqp' | 'aux', cod: string, c: 0 | 1, desc: string, un: string, coef: number, preco = 0) => ({ t, cod, c, desc, un, coef, preco });
function baseDe(comps: Composicao[], precos: Record<string, number> = {}): BaseComposicoes {
  const m = new Map(Object.entries(precos));
  return { id: 'sinapi', nome: 'T', comps, porCodigo: new Map(comps.map((c) => [c.codigo, c])), precos: { sd: m, cd: m }, derivados: { sd: new Map(), cd: new Map() }, encargosHorista: { sd: 100, cd: 80 } };
}

describe('medidas', () => {
  it('produto das dimensões × peças; unidade não geométrica usa só a quantidade', () => {
    expect(calcularQuantidade('M2', { comprimento: 4, altura: 2.5, quantidade: 2 })).toMatchObject({ qtd: 20, aviso: '', vazio: false });
    expect(calcularQuantidade('M3', { comprimento: 2, largura: 3 }).aviso).toMatch(/normalmente usa 3 medidas/);
    expect(calcularQuantidade('M2', {}).vazio).toBe(true);
    const un = calcularQuantidade('UN', { comprimento: 5, quantidade: 7 });
    expect([un.qtd, un.vazio]).toEqual([7, false]);
    expect(un.aviso).toMatch(/ignoradas/);
    expect(descreverMedidas('M2', { comprimento: 4, altura: 2.8, quantidade: 2 })).toBe('comprimento 4,00 m × altura 2,80 m × peças iguais 2,00');
    expect(descreverMedidas('UN', { quantidade: 3 })).toBe('quantidade 3,00');
  });
});

describe('classificação e categorias', () => {
  it('classifica pelo tipo, pela unidade e pelo nome', () => {
    expect(classificar('MAO DE OBRA', 'x', 'UN')).toBe('mo');
    expect(classificar('', 'PEDREIRO', 'H')).toBe('mo');
    expect(classificar('', 'BETONEIRA 400 L', 'CHP')).toBe('eqp');
    expect(classificar('', 'CIMENTO PORTLAND', 'KG')).toBe('mat');
    expect(categoriaDe({ grupo: '', descricao: 'ALVENARIA DE VEDAÇÃO DE BLOCOS' })).toBe('alv');
    expect(categoriaDe({ grupo: 'Pintura', descricao: 'x' })).toBe('pin');
    expect(categoriaDe({ grupo: '', descricao: 'ITEM SEM CATEGORIA' })).toBe('out');
  });
});

describe('custo de um serviço', () => {
  const pedreiro = comp('88309', 'PEDREIRO COM ENCARGOS COMPLEMENTARES', 'H', [
    ins('mo', '4750', 0, 'PEDREIRO (HORISTA)', 'H', 1),
    ins('mat', '900', 0, 'EPI - FAMILIA PEDREIRO - HORISTA (ENCARGOS COMPLEMENTARES - COLETADO CAIXA)', 'H', 1),
  ], 30);
  const argamassa = comp('87000', 'ARGAMASSA TRAÇO 1:4', 'M3', [ins('mat', '370', 0, 'AREIA MEDIA', 'M3', 1.2), ins('mat', '1379', 0, 'CIMENTO PORTLAND', 'KG', 300)], 400);
  const alvenaria = comp('87500', 'ALVENARIA DE VEDAÇÃO', 'M2', [
    ins('mo', '88309', 1, 'PEDREIRO COM ENCARGOS COMPLEMENTARES', 'H', 0.9),
    ins('mat', '7260', 0, 'BLOCO CERAMICO', 'UN', 26),
    ins('aux', '87000', 1, 'ARGAMASSA TRAÇO 1:4', 'M3', 0.01),
    ins('mat', '9999', 0, 'INSUMO SEM PRECO', 'UN', 1),
  ], 80);
  const base = baseDe([pedreiro, argamassa, alvenaria], { '7260': 1.1, '370': 100, '1379': 0.8, '900': 1.5 });
  const p = { ...parametrosPadrao(), bdi: 25 };

  it('mão de obra pelo piso do Sinduscon + encargos + complementares; auxiliar recalculada', () => {
    const r = calcularServico(base, alvenaria, 10, p, { expandir: false });
    const L = Object.fromEntries(r.linhas.map((l) => [l.cod, l]));
    // piso qualificado 2603,05 ÷ 220 h × (1 + 100%) + EPI 1,50
    expect(L['88309']!.p).toBeCloseTo((2603.05 / 220) * 2 + 1.5, 6);
    expect(L['88309']!.origem).toMatch(/Sinduscon-BA .* \+ encargos complementares R\$ 1,50 · SINAPI-BA: R\$ 30,00/);
    expect(L['88309']!.total).toBeCloseTo(9, 9);
    expect(L['7260']!.custo).toBeCloseTo(260 * 1.1, 9);
    // auxiliar: 1,2 × 100 + 300 × 0,8 = 360 (recalculada, não os 400 oficiais)
    expect(L['87000']!.p).toBeCloseTo(360, 9);
    expect(L['87000']!.origem).toMatch(/recalculada/);
    expect(r.semPreco).toBe(1);
    expect(r.precoVenda).toBeCloseTo(r.custo * 1.25, 9);
    expect(r.custoOficialUnitario).toBe(80);
  });
  it('expandir abre a auxiliar em insumos e soma repetidos', () => {
    const linhas = abrirComposicao(base, alvenaria, 10, true);
    expect(linhas.find((l) => l.cod === '87000')).toBeUndefined();
    expect(linhas.find((l) => l.cod === '1379')!.total).toBeCloseTo(10 * 0.01 * 300, 9);
    // a mão de obra é do tipo "mo", não "aux": continua como uma linha só
    expect(linhas.find((l) => l.cod === '88309')!.total).toBeCloseTo(9, 9);
  });
  it('preço manual tem prioridade; encargos digitados substituem os da base', () => {
    const r = calcularServico(base, alvenaria, 1, { ...p, encargos: 50, manuais: { [chavePreco({ cod: '9999', desc: '' })]: 5, 'c:7260': 2 } }, { expandir: false });
    const L = Object.fromEntries(r.linhas.map((l) => [l.cod, l]));
    expect(L['7260']!.p).toBe(2);
    expect(L['9999']!.origem).toBe('manual');
    expect(L['88309']!.p).toBeCloseTo((2603.05 / 220) * 1.5 + 1.5, 6);
    expect(r.semPreco).toBe(0);
  });
  it('referência circular entre auxiliares não trava', () => {
    const a = comp('A', 'A', 'UN', [ins('aux', 'B', 1, 'B', 'UN', 1)], 10);
    const b = comp('B', 'B', 'UN', [ins('aux', 'A', 1, 'A', 'UN', 1)], 20);
    const r = calcularServico(baseDe([a, b]), a, 1, p, { expandir: false });
    expect(r.linhas[0]!.p).toBe(20); // cai no custo oficial
  });
  it('cotação: BDI por linha arredondado; a soma das linhas fecha com o total', () => {
    const c: Cotacao = { id: 'c1', numero: '001/2026', cliente: 'X', obra: '', responsavel: '', data: '2026-01-01', validadeDias: 30, bdi: 22.37, observacoes: '', detalhar: true,
      itens: [{ id: 'i1', base: 'sinapi', cod: '87500', descricao: '', unidade: 'M2', qtd: 37.33, medidas: '' }, { id: 'i2', base: 'sinapi', cod: 'NAO-EXISTE', descricao: '', unidade: 'UN', qtd: 1, medidas: '' }] };
    const r = calcularCotacao(c, { sinapi: base }, p);
    const somaLinhas = r.itens[0]!.linhas.reduce((s, l) => s + l.totalVenda, 0);
    expect(Math.round(somaLinhas * 100)).toBe(Math.round(r.itens[0]!.venda * 100));
    expect(Math.round((r.porTipo.mo + r.porTipo.mat + r.porTipo.eqp + r.porTipo.aux + r.porTipo.srv) * 100)).toBe(Math.round(r.venda * 100));
    expect(r.itens[1]!.falta).toBe(true);
    expect(proximoNumero([c, { numero: '009/2026' }], 2026)).toBe('010/2026');
  });
  it('busca exige todos os termos e respeita a categoria', () => {
    expect(buscarServicos(base, 'alvenaria vedacao').map((c) => c.codigo)).toEqual(['87500']);
    expect(buscarServicos(base, '', 'alv').map((c) => c.codigo)).toEqual(['87500']);
    expect(buscarServicos(base, 'xyz')).toHaveLength(0);
  });
});

describe('ORSE', () => {
  it('insumo e composição com o mesmo número não se confundem', () => {
    const b = montarOrse(
      [{ code: '10', description: 'Concreto fck 25', unit: 'm3', price: 500, sheet: 'Composições', group: 'G' }, { code: '10', description: 'Cimento', unit: 'kg', price: 0.9, sheet: 'Insumos' },
        { code: '20', description: 'Lançamento', unit: 'm3', price: 50, sheet: 'Composições' }],
      { '10': [[0, '10', 350, 'MAT', 0.9], [1, '20', 1, 'COMP', 50], [0, 'SINAPI-6111', 2, 'MO', 16.7, 'SERVENTE DE OBRAS (HORISTA)', 'H']], '20': [[0, '10', 1, 'MAT', 0.9]] },
      { reference: '2026-08' },
    );
    const c = b.porCodigo.get('10')!;
    expect(c.itens.map((i) => [i.t, i.c, i.desc, i.un])).toEqual([['mat', 0, 'Cimento', 'kg'], ['aux', 1, 'Lançamento', 'm3'], ['mo', 0, 'SERVENTE DE OBRAS (HORISTA)', 'H']]);
    const r = calcularServico(b, c, 2, parametrosPadrao(), { expandir: false });
    // fora do SINAPI: material e auxiliar pelo preço da base; servente horista pelo piso
    expect(r.linhas[0]!.custo).toBeCloseTo(2 * 350 * 0.9, 9);
    expect(r.linhas[1]!.p).toBe(50);
    expect(r.linhas[2]!.origem).toMatch(/Sinduscon-BA \(servente comum\)/);
  });
});

// ───────────── comparação com o aplicativo original ─────────────
const HTML = path.resolve(__dirname, '../../index.html');
const temOriginal = existsSync(HTML);

describe.skipIf(!temOriginal)('paridade com o Quantifik publicado', () => {
  it('mesmos insumos, preços e totais em 600 composições, nos dois regimes', () => {
    const html = readFileSync(HTML, 'utf8');
    const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
    const dados = scripts.find((s) => s.startsWith('{"v":'))!;
    const app = scripts.find((s) => s.includes('/* ---------- cálculo ---------- */'))!;
    // Executa só o núcleo do aplicativo original (até antes da interface), com um DOM mínimo.
    const nucleo = app.slice(app.indexOf('/* ---------- utilidades'), app.indexOf('/* ---------- renderização'))
      + app.slice(app.indexOf('/* ---------- preços ---------- */'), app.indexOf('function computePrice'))
      + `;globalThis.__q = { state, settings, ov, flatten, resolvePrice, complCache, auxCache, prepare, decodeEmbedded, EMB };`;
    const sandbox: Record<string, unknown> = {
      document: { getElementById: (id: string) => (id === 'embedded-data' ? { textContent: dados } : { value: '', checked: true }) },
      localStorage: { getItem: () => null, setItem: () => {} }, indexedDB: undefined, console, Intl, Map, JSON, Object, Array, String, Math, Number, Date,
    };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(nucleo, sandbox);
    const q = sandbox.__q as {
      state: { base: string; data: Record<string, unknown>; embP?: unknown; embR?: unknown }; settings: { deson: string; enc: number; bdi: number };
      flatten: (c: unknown, f: number, d: number, acc: Map<string, { cod: string; t: string; total: number; desc: string }>, e: boolean, b: string) => void;
      resolvePrice: (x: unknown) => { p: number; src: string }; complCache: Map<string, unknown>; auxCache: Map<string, unknown>;
      prepare: (c: unknown, m: unknown, s: boolean) => { comps: { codigo: string }[]; byCode: Map<string, unknown> }; decodeEmbedded: (e: unknown) => unknown;
      EMB: { bases: { sinapi: unknown }; precos: { sd: Record<string, number>; cd: Record<string, number>; rec: { sd: Record<string, number>; cd: Record<string, number> }; enc: Record<string, { horista: number }> } };
    };
    // O original monta estes mapas na inicialização da interface; aqui são montados do mesmo dado.
    const mapa = (o: Record<string, number>) => new Map(Object.entries(o));
    q.state.data.sinapi = q.prepare(q.decodeEmbedded(q.EMB.bases.sinapi), {}, false);
    q.state.embP = { sd: mapa(q.EMB.precos.sd), cd: mapa(q.EMB.precos.cd) };
    q.state.embR = { sd: mapa(q.EMB.precos.rec.sd), cd: mapa(q.EMB.precos.rec.cd) };
    q.state.base = 'sinapi';
    const orig = q.state.data.sinapi as { comps: { codigo: string }[]; byCode: Map<string, unknown> };

    const base = decodificarSinapi(extrairEmbutido(html));
    expect(base.comps.length).toBe(orig.comps.length);
    const passo = Math.max(1, Math.floor(base.comps.length / 300));
    let comparadas = 0, linhas = 0;
    for (const regime of ['sd', 'cd'] as const) {
      q.settings.deson = regime;
      q.settings.enc = q.EMB.precos.enc[regime]!.horista;
      const p = { ...parametrosPadrao(), regime };
      for (let i = 0; i < base.comps.length; i += passo) {
        const c = base.comps[i]!;
        for (const expandir of [true, false]) {
          q.complCache.clear(); q.auxCache.clear();
          const acc = new Map<string, { cod: string; t: string; total: number; desc: string }>();
          q.flatten(orig.byCode.get(c.codigo), 3.7, 0, acc, expandir, 'sinapi');
          const esperado = [...acc.values()].map((x) => { const r = q.resolvePrice(x); return { k: `${x.t}|${x.cod}|${x.desc}`, total: x.total, p: r.p, src: r.src }; });
          const obtido = calcularServico(base, c, 3.7, p, { expandir }).linhas.map((x) => ({ k: `${x.t}|${x.cod}|${x.desc}`, total: x.total, p: x.p, src: x.origem }));
          expect(obtido.length, `${c.codigo} nº de linhas`).toBe(esperado.length);
          for (let j = 0; j < esperado.length; j++) {
            const e = esperado[j]!, o = obtido[j]!;
            expect(o.k, c.codigo).toBe(e.k);
            expect(o.total, `${c.codigo} consumo ${e.k}`).toBeCloseTo(e.total, 9);
            expect(o.p, `${c.codigo} preço ${e.k} (${regime})`).toBeCloseTo(e.p, 9);
            expect(o.src, `${c.codigo} origem ${e.k}`).toBe(e.src);
            linhas++;
          }
        }
        comparadas++;
      }
    }
    expect(comparadas).toBeGreaterThanOrEqual(600);
    console.log(`paridade: ${comparadas} composições × 2 modos, ${linhas} linhas de insumo idênticas`);
  }, 120000);

});

describe('bases de preços servidas pelo próprio ObraTop 4', () => {
  it('SINAPI-BA copiado do Quantifik decodifica com as composições do mês', () => {
    const f = path.resolve(__dirname, '../public/bases/sinapi-ba.json.gz');
    const b = decodificarSinapi(JSON.parse(gunzipSync(readFileSync(f)).toString()));
    expect(b.comps.length).toBeGreaterThan(5000);
    expect(b.comps.some((c) => c.itens.length > 0)).toBe(true);
  });
  it('catálogo próprio aponta só para arquivos que existem em public/bases', () => {
    const raiz = path.resolve(__dirname, '../public/bases');
    const cat = JSON.parse(readFileSync(`${raiz}/catalog.json`, 'utf8')) as { bases: { file: string; status: string }[] };
    expect(cat.bases.length).toBeGreaterThan(20);
    for (const b of cat.bases) expect(existsSync(`${raiz}/${b.file}`), b.file).toBe(true);
  });
  it('ORSE real: a soma coeficiente × preço reproduz o preço publicado', () => {
    // Bases do próprio ObraTop 4 (public/bases, copiadas por `npm run bases:atualizar`).
    const dir = path.resolve(__dirname, '../public/bases/bases');
    const principal = existsSync(dir) ? readdirSync(dir).filter((f) => /^ORSE-SE-\d{4}-\d{2}\.json\.gz$/.test(f)).sort().pop() : undefined;
    expect(principal, 'public/bases deve conter a base ORSE-SE').toBeTruthy();
    const ler = (f: string) => JSON.parse(gunzipSync(readFileSync(`${dir}/${f}`)).toString());
    const ref = principal!.slice(8, 15);
    const b = montarOrse(ler(principal!).rows, ler(principal!.replace('.json.gz', '.analitico.json.gz')), { reference: ref });
    let ok = 0, n = 0;
    for (const c of b.comps) {
      if (!(c.cs > 0)) continue;
      const soma = c.itens.reduce((s, i) => s + i.coef * i.preco, 0);
      n++;
      if (Math.abs(soma - c.cs) <= Math.max(0.05, c.cs * 0.01)) ok++;
    }
    console.log(`ORSE: ${ok} de ${n} composições fecham com o preço publicado (±1%)`);
    expect(ok / n).toBeGreaterThan(0.9);
  });
});

import { zipSync, strToU8 } from 'fflate';
import { linhasDeTexto, linhasDeXlsx, numeroBr, tabelaDePrecos } from '../src/lib/composicoes/importar-precos';
describe('tabela de preços própria (Quantifik)', () => {
  it('números brasileiros e internacionais', () => {
    expect([numeroBr('1.234,56'), numeroBr('1234.56'), numeroBr('R$ 12,3'), numeroBr('1,234.50'), numeroBr('')].map((x) => (Number.isNaN(x) ? 'NaN' : x))).toEqual([1234.56, 1234.56, 12.3, 1234.5, 'NaN']);
  });
  it('CSV com cabeçalho em qualquer ordem e texto colado do Excel (tabulação)', () => {
    const a = tabelaDePrecos(linhasDeTexto('Descrição;Unidade;Código;Preço unitário\nCimento CP II;sc;00001379;38,90\nAreia;m3;370;120,00\nlinha ruim;;;'));
    expect([...a.precos]).toEqual([['1379', 38.9], ['370', 120]]); expect(a.ignoradas).toBe(1);
    const b = tabelaDePrecos(linhasDeTexto('1379\tCIMENTO\tSC\t38,90\n370\tAREIA\tM3\t120'));
    expect([...b.precos]).toEqual([['1379', 38.9], ['370', 120]]);
  });
  it('planilha .xlsx (strings compartilhadas, células vazias e números)', () => {
    const xlsx = zipSync({
      'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="Preços" sheetId="1" r:id="rId1"/></sheets></workbook>'),
      'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
      'xl/sharedStrings.xml': strToU8('<sst><si><t>Código</t></si><si><t>Insumo</t></si><si><t>Preço</t></si><si><t>Aço CA-50 &amp; corte</t></si></sst>'),
      'xl/worksheets/sheet1.xml': strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row><row r="2"><c r="A2"><v>34</v></c><c r="B2" t="s"><v>3</v></c><c r="C2"><v>7.42</v></c></row><row r="3"><c r="A3"><v>370</v></c><c r="C3"><v>120</v></c></row></sheetData></worksheet>'),
    });
    const l = linhasDeXlsx(xlsx);
    expect(l[1]).toEqual(['34', 'Aço CA-50 & corte', '7.42']);
    expect(l[2]).toEqual(['370', '', '120']);
    expect([...tabelaDePrecos(l).precos]).toEqual([['34', 7.42], ['370', 120]]);
    expect(() => linhasDeXlsx(new Uint8Array([1, 2, 3]))).toThrow(/Excel/);
  });
});
