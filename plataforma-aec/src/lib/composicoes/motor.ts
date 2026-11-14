/**
 * Motor de composições analíticas (herdado do Quantifik).
 *
 * Um serviço (composição) é uma lista de insumos com coeficientes por unidade de serviço.
 * Dada a quantidade medida, o motor devolve o consumo de cada insumo — mão de obra, materiais,
 * equipamentos — e o custo, com as mesmas regras do Quantifik:
 *   • mão de obra horista pelo piso do Sinduscon-BA: piso ÷ horas/mês × (1 + encargos) + encargos
 *     complementares da composição SINAPI (EPI, ferramentas, exames, transporte, alimentação);
 *   • insumos pelo preço mediano do SINAPI (ou preço derivado, quando a Caixa não publica mediana);
 *   • composições auxiliares recalculadas com esses mesmos parâmetros;
 *   • preço digitado pelo usuário tem prioridade sobre tudo.
 *
 * TypeScript puro e sem estado global: todas as funções recebem a base e os parâmetros.
 */
import { CATS, COMPL_RE, LABOR, LABOR_MATCH, NO_PISO, PISOS } from './tabelas';

export type TipoInsumo = 'mo' | 'mat' | 'eqp' | 'aux' | 'srv';
export type Regime = 'sd' | 'cd'; // sem / com desoneração da folha

export interface ItemComposicao {
  t: TipoInsumo;
  cod: string;
  /** 1 quando o item é outra composição (auxiliar); 0 quando é insumo. */
  c: 0 | 1;
  desc: string;
  un: string;
  coef: number;
  /** Preço que veio na própria base (ORSE e importações); 0 quando não há. */
  preco: number;
}

export interface Composicao {
  codigo: string;
  descricao: string;
  unidade: string;
  grupo: string;
  /** Custo oficial da composição sem / com desoneração (0 se a base não informa). */
  cs: number;
  cc: number;
  itens: ItemComposicao[];
}

export interface BaseComposicoes {
  id: string;
  nome: string;
  /** Mês de referência AAAA-MM, quando conhecido. */
  ref?: string;
  comps: Composicao[];
  porCodigo: Map<string, Composicao>;
  /** Preços medianos de insumos por regime (SINAPI). */
  precos?: Record<Regime, Map<string, number>>;
  /** Preços derivados do custo oficial das composições, para insumos sem mediana publicada. */
  derivados?: Record<Regime, Map<string, number>>;
  /** Encargos sociais do horista (%), por regime, lidos da própria base. */
  encargosHorista?: Record<Regime, number>;
}

// ───────────────────────────── utilidades ─────────────────────────────

export const norm = (s: unknown) =>
  String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

/** Converte "1.234,56", "1234.56" ou número em número (0 quando inválido). */
export function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v == null ? '' : v).trim().replace(/\s/g, '');
  if (!s) return 0;
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
export const unitKey = (u: string) => norm(u).replace('²', '2').replace('³', '3').replace(/\s/g, '');
export function unitPretty(u: string): string {
  const k = unitKey(u);
  if (k === 'M2') return 'm²';
  if (k === 'M3') return 'm³';
  return String(u || '').trim();
}
const limparCodigo = (c: unknown) => String(c == null ? '' : c).trim().replace(/\.0+$/, '');
const r2 = (n: number) => Math.round(n * 100) / 100;

// ───────────────────────────── categorias ─────────────────────────────

export const CATEGORIA_LABEL: Record<string, string> = {};
export const CATEGORIA_ORDEM: string[] = [];
for (const [id, rotulo] of CATS) {
  if (!CATEGORIA_LABEL[id]) {
    CATEGORIA_LABEL[id] = rotulo;
    CATEGORIA_ORDEM.push(id);
  }
}
CATEGORIA_LABEL.out = 'Outros e parâmetros';
CATEGORIA_ORDEM.push('out');

/** Atividade (categoria) de uma composição, pelo grupo da base ou, na falta, pela descrição. */
const cacheCategoria = new WeakMap<object, string>();
export function categoriaDe(c: Pick<Composicao, 'grupo' | 'descricao'>): string {
  const salvo = cacheCategoria.get(c);
  if (salvo) return salvo;
  const t = norm(c.grupo ? c.grupo : c.descricao);
  let id = 'out';
  for (const [k, , re] of CATS) if (re.test(t)) { id = k; break; }
  cacheCategoria.set(c, id);
  return id;
}

/** Classifica um insumo quando a base não informa o tipo (por unidade e pelo nome). */
export function classificar(tipoBruto: string, desc: string, un: string): TipoInsumo {
  const t = norm(tipoBruto), d = norm(desc), u = unitKey(un);
  if (/MAO ?DE ?OBRA|^MO$|^M\.O\.?$/.test(t)) return 'mo';
  if (/^MATERIA|^MAT$/.test(t)) return 'mat';
  if (/EQUIP/.test(t)) return 'eqp';
  if (/COMPOSICAO|SERVICO|AUXILIAR/.test(t)) return 'aux';
  if (u === 'CHP' || u === 'CHI') return 'eqp';
  if ((u === 'H' || u === 'HORA' || u === 'HORAS' || u === 'MES') && LABOR.test(d)) return 'mo';
  if (u === 'H' || u === 'HORA') return 'eqp';
  return 'mat';
}

// ───────────────────────────── medidas ─────────────────────────────

export interface Medidas {
  comprimento?: number;
  largura?: number;
  altura?: number;
  profundidade?: number;
  /** Peças iguais (serviços em m, m², m³) ou a própria quantidade (un, h, kg…). */
  quantidade?: number;
}
const DIMENSOES_ESPERADAS: Record<string, number> = { M: 1, M2: 2, M3: 3 };

/** Quantidade de serviço a partir das medidas: produto das dimensões preenchidas × peças. */
export function calcularQuantidade(unidade: string, m: Medidas): { qtd: number; aviso: string; vazio: boolean } {
  const usadas = [m.comprimento, m.largura, m.altura, m.profundidade].map((v) => v ?? 0).filter((v) => v > 0);
  const n = m.quantidade && m.quantidade > 0 ? m.quantidade : 1;
  const esperado = DIMENSOES_ESPERADAS[unitKey(unidade)];
  let base = usadas.length ? usadas.reduce((a, b) => a * b, 1) : 0;
  let aviso = '';
  if (esperado === undefined) {
    base = 1; // unidades não geométricas (un, h, kg…): vale só a quantidade
    if (usadas.length) aviso = `Este serviço é medido em ${unitPretty(unidade)}. As medidas foram ignoradas; o cálculo usa apenas a quantidade.`;
  } else if (usadas.length && usadas.length !== esperado) {
    aviso = `Serviço em ${unitPretty(unidade)} normalmente usa ${esperado} medida${esperado > 1 ? 's' : ''}. Você preencheu ${usadas.length}.`;
  }
  return { qtd: base * n, aviso, vazio: esperado !== undefined && !usadas.length };
}

/** Texto das medidas para a cotação: "comprimento 4,00 m × altura 2,80 m × peças iguais 2,00". */
export function descreverMedidas(unidade: string, m: Medidas): string {
  const f = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const geometrica = DIMENSOES_ESPERADAS[unitKey(unidade)] !== undefined;
  const partes: string[] = [];
  if (geometrica) {
    for (const [rotulo, v] of [['comprimento', m.comprimento], ['largura', m.largura], ['altura', m.altura], ['profundidade', m.profundidade]] as const) {
      if (v && v > 0) partes.push(`${rotulo} ${f(v)} m`);
    }
  }
  const n = m.quantidade && m.quantidade > 0 ? m.quantidade : 1;
  if (n !== 1 || !partes.length) partes.push(`${geometrica ? 'peças iguais ' : 'quantidade '}${f(n)}`);
  return partes.join(' × ');
}

// ───────────────────────────── consumo de insumos ─────────────────────────────

export interface LinhaInsumo {
  t: TipoInsumo;
  c: 0 | 1;
  cod: string;
  desc: string;
  un: string;
  preco: number;
  /** Consumo total do insumo para a quantidade de serviço. */
  total: number;
}

/**
 * Abre a composição em insumos, multiplicando os coeficientes pela quantidade. Com `expandir`,
 * as composições auxiliares são abertas recursivamente (até 6 níveis) e insumos iguais somados.
 */
export function abrirComposicao(base: BaseComposicoes, comp: Composicao, quantidade: number, expandir: boolean): LinhaInsumo[] {
  const acc = new Map<string, LinhaInsumo>();
  const percorrer = (c: Composicao, fator: number, nivel: number) => {
    for (const it of c.itens) {
      const f = fator * it.coef;
      if (it.t === 'aux' && expandir && nivel < 6) {
        const sub = base.porCodigo.get(String(it.cod));
        if (sub && sub !== c) {
          percorrer(sub, f, nivel + 1);
          continue;
        }
      }
      const k = `${it.t}|${it.c ? 'C' : 'I'}|${it.cod}|${it.desc}|${it.un}`;
      const atual = acc.get(k);
      if (atual) atual.total += f;
      else acc.set(k, { t: it.t, c: it.c, cod: it.cod, desc: it.desc, un: it.un, preco: it.preco || 0, total: f });
    }
  };
  percorrer(comp, quantidade, 0);
  return [...acc.values()];
}

// ───────────────────────────── preços ─────────────────────────────

export interface ParametrosPreco {
  /** Horas mensais para converter o piso em valor-hora (padrão 220). */
  horas: number;
  /** Encargos sociais sobre o salário (%). `null` = usar o do SINAPI da base, conforme o regime. */
  encargos: number | null;
  /** BDI em % (25 = 25%). */
  bdi: number;
  regime: Regime;
  /** Pisos mensais por função (id de PISOS → R$). */
  pisos: Record<string, number>;
  /** Preços digitados pelo usuário, por chave de insumo (ver `chavePreco`). */
  manuais: Record<string, number>;
  /** Tabela de preços de insumos importada pelo usuário (código → R$). */
  importados?: Map<string, number>;
}

export const ENCARGOS_RESERVA: Record<Regime, number> = { sd: 117.73, cd: 101.7 };

export function parametrosPadrao(): ParametrosPreco {
  return { horas: 220, encargos: null, bdi: 0, regime: 'sd', pisos: Object.fromEntries(PISOS.map((p) => [p.id, p.v])), manuais: {} };
}

/** Encargos efetivos (%): o digitado, ou o do SINAPI da base para o regime escolhido. */
export function encargosEfetivos(base: BaseComposicoes | undefined, p: ParametrosPreco): number {
  if (p.encargos !== null && p.encargos >= 0) return p.encargos;
  const daBase = base?.encargosHorista?.[p.regime];
  return daBase && daBase > 0 ? daBase : ENCARGOS_RESERVA[p.regime];
}

/** Chave do preço manual: pelo código quando existe, senão pela descrição normalizada. */
export function chavePreco(x: Pick<LinhaInsumo, 'cod' | 'desc'>): string {
  const c = limparCodigo(x.cod);
  return c ? `c:${c}` : `d:${norm(x.desc)}`;
}

export function pisoDe(desc: string): string | null {
  const d = norm(desc);
  for (const [id, re] of LABOR_MATCH) if (re.test(d)) return id;
  return null;
}

export interface PrecoResolvido {
  p: number;
  /** De onde veio o preço — mostrado ao usuário e no PDF. */
  origem: string;
  /** Composição auxiliar com insumos sem preço: o valor está incompleto. */
  parcial?: boolean;
}

const fmt2 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Cria o resolvedor de preços para uma base + parâmetros. As regras só se aplicam por código
 * quando a base é o SINAPI (`sinapi` = true); o SINAPI também serve de referência para os
 * encargos complementares da mão de obra.
 */
export function criarResolvedor(base: BaseComposicoes, p: ParametrosPreco, sinapi: boolean) {
  const enc = encargosEfetivos(sinapi ? base : undefined, p);
  const complCache = new Map<string, number>();
  const auxCache = new Map<string, { p: number; faltam: number }>();
  const valorHora = (id: string) => (p.horas > 0 ? (num(p.pisos[id]) / p.horas) * (1 + enc / 100) : 0);

  const precoInsumo = (cod: string): { p: number; derivado: boolean } | null => {
    const m = base.precos?.[p.regime];
    if (m?.has(cod)) return { p: m.get(cod)!, derivado: false };
    const d = base.derivados?.[p.regime];
    if (d?.has(cod)) return { p: d.get(cod)!, derivado: true };
    return null;
  };
  const unitarioSinapi = (cod: string, ehComposicao: boolean): number => {
    if (!cod) return 0;
    if (ehComposicao) {
      const sub = base.porCodigo.get(cod);
      return sub ? (p.regime === 'cd' ? sub.cc : sub.cs) || 0 : 0;
    }
    return precoInsumo(cod)?.p ?? 0;
  };
  /** EPI, ferramentas, exames, transporte, alimentação e curso da composição de mão de obra. */
  const complementar = (cod: string): number => {
    if (complCache.has(cod)) return complCache.get(cod)!;
    let v = 0;
    const sub = base.porCodigo.get(cod);
    if (sub) for (const it of sub.itens) if (COMPL_RE.test(norm(it.desc))) v += it.coef * unitarioSinapi(limparCodigo(it.cod), !!it.c);
    complCache.set(cod, v);
    return v;
  };
  const custoAuxiliar = (sub: Composicao, nivel: number) => {
    const k = sub.codigo;
    if (auxCache.has(k)) return auxCache.get(k)!;
    auxCache.set(k, { p: 0, faltam: 1 }); // trava contra referência circular
    let soma = 0, faltam = 0;
    for (const it of sub.itens) {
      const r = resolver({ t: it.t, c: it.c, cod: it.cod, desc: it.desc, un: it.un, preco: it.preco || 0, total: 0 }, nivel);
      soma += r.p * it.coef;
      if (!(r.p > 0) || r.parcial) faltam++;
    }
    const out = { p: soma, faltam };
    auxCache.set(k, out);
    return out;
  };

  function resolver(x: LinhaInsumo, nivel = 0): PrecoResolvido {
    const manual = p.manuais[chavePreco(x)];
    if (manual !== undefined) return { p: manual, origem: 'manual' };
    const cod = limparCodigo(x.cod);
    const sin = sinapi && !!cod;
    if (x.t === 'mo' && /^(H|HORA|HORAS)$/.test(unitKey(x.un)) && !NO_PISO.test(norm(x.desc))) {
      const id = pisoDe(x.desc);
      if (id) {
        const piso = PISOS.find((z) => z.id === id)!;
        let valor = valorHora(id);
        let texto = `Sinduscon-BA (${piso.nome.toLowerCase()})`;
        if (sin && x.c) {
          const ex = complementar(cod);
          if (ex > 0) { valor += ex; texto += ` + encargos complementares R$ ${fmt2(ex)}`; }
        }
        if (sin) {
          const ref = unitarioSinapi(cod, !!x.c);
          if (ref > 0) texto += ` · SINAPI-BA: R$ ${fmt2(ref)}`;
        }
        return { p: valor, origem: texto };
      }
    }
    if (!x.c && cod && p.importados?.has(cod)) return { p: p.importados.get(cod)!, origem: 'tabela de insumos importada' };
    if (sin) {
      if (x.c) {
        const sub = base.porCodigo.get(cod);
        const oficial = sub ? (p.regime === 'cd' ? sub.cc : sub.cs) || 0 : 0;
        if (x.t === 'aux' && sub && nivel < 6) {
          const a = custoAuxiliar(sub, nivel + 1);
          if (a.p > 0 && !a.faltam) return { p: a.p, origem: `composição auxiliar ${cod} recalculada com os seus parâmetros` };
          if (oficial > 0) return { p: oficial, origem: `SINAPI-BA, custo da composição ${cod}` };
          if (a.p > 0) return { p: a.p, origem: `composição auxiliar ${cod}: ${a.faltam} insumo(s) sem preço`, parcial: true };
        }
        if (oficial > 0) return { p: oficial, origem: `SINAPI-BA, custo da composição ${cod}` };
      } else {
        const e = precoInsumo(cod);
        if (e) return { p: e.p, origem: e.derivado ? 'SINAPI-BA, preço derivado do custo oficial das composições' : 'SINAPI-BA, preço mediano (Salvador)' };
      }
    }
    if (x.preco > 0) return { p: x.preco, origem: 'base importada' };
    return { p: 0, origem: '' };
  }
  return resolver;
}

// ───────────────────────────── cálculo de um serviço ─────────────────────────────

export interface LinhaCusto extends LinhaInsumo {
  p: number;
  origem: string;
  custo: number;
  parcial?: boolean;
}
export type TotaisPorTipo = Record<TipoInsumo, number>;

export interface CustoServico {
  quantidade: number;
  linhas: LinhaCusto[];
  /** Custo por natureza: mão de obra, materiais, equipamentos, serviços, composições auxiliares. */
  porTipo: TotaisPorTipo;
  custo: number;
  /** Insumos sem preço ou com preço incompleto — o total está subestimado enquanto for > 0. */
  semPreco: number;
  bdiFator: number;
  precoVenda: number;
  /** Custo oficial da composição na base (por unidade), para comparação; 0 se não houver. */
  custoOficialUnitario: number;
}

export function calcularServico(
  base: BaseComposicoes, comp: Composicao, quantidade: number, p: ParametrosPreco,
  opcoes: { expandir?: boolean; sinapi?: boolean } = {},
): CustoServico {
  const sinapi = opcoes.sinapi ?? base.id === 'sinapi';
  const resolver = criarResolvedor(base, p, sinapi);
  const porTipo: TotaisPorTipo = { mo: 0, mat: 0, eqp: 0, srv: 0, aux: 0 };
  let custo = 0, semPreco = 0;
  const linhas = abrirComposicao(base, comp, quantidade, opcoes.expandir ?? true).map((x): LinhaCusto => {
    const r = resolver(x);
    const c = r.p * x.total;
    porTipo[x.t] = (porTipo[x.t] || 0) + c;
    custo += c;
    if (!(r.p > 0) || r.parcial) semPreco++;
    return { ...x, p: r.p, origem: r.origem, custo: c, parcial: r.parcial };
  });
  const bdiFator = 1 + (p.bdi || 0) / 100;
  return { quantidade, linhas, porTipo, custo, semPreco, bdiFator, precoVenda: custo * bdiFator, custoOficialUnitario: (p.regime === 'cd' ? comp.cc : comp.cs) || 0 };
}

// ───────────────────────────── cotações ─────────────────────────────

export interface ItemCotacao {
  id: string;
  /** Base de onde veio o serviço ('sinapi', 'orse'…). */
  base: string;
  cod: string;
  descricao: string;
  unidade: string;
  qtd: number;
  /** Texto das medidas usadas ("comprimento 4,00 m × altura 2,80 m"). */
  medidas: string;
}

export interface Cotacao {
  id: string;
  numero: string;
  cliente: string;
  obra: string;
  responsavel: string;
  /** AAAA-MM-DD */
  data: string;
  validadeDias: number;
  bdi: number;
  observacoes: string;
  /** Mostrar a composição de custos (insumos) de cada serviço no PDF. */
  detalhar: boolean;
  itens: ItemCotacao[];
}

export interface LinhaVenda extends LinhaCusto {
  /** Preço unitário e total com BDI embutido, arredondados ao centavo. */
  precoVenda: number;
  totalVenda: number;
}
export interface ItemCotacaoCalculado {
  item: ItemCotacao;
  /** O serviço não existe mais na base carregada. */
  falta: boolean;
  linhas: LinhaVenda[];
  custo: number;
  vendaPorTipo: TotaisPorTipo;
  venda: number;
  semPreco: number;
}
export interface CotacaoCalculada {
  itens: ItemCotacaoCalculado[];
  bdiFator: number;
  /** Venda por natureza de custo, somando as linhas já arredondadas. */
  porTipo: TotaisPorTipo;
  custo: number;
  venda: number;
  semPreco: number;
}

/**
 * Calcula a cotação com o BDI embutido em cada linha. Cada linha é arredondada ao centavo antes
 * de somar, para que os totais do PDF fechem exatamente com a soma das linhas exibidas.
 */
export function calcularCotacao(c: Cotacao, bases: Record<string, BaseComposicoes | undefined>, p: ParametrosPreco): CotacaoCalculada {
  const bdiFator = 1 + (c.bdi || 0) / 100;
  const porTipo: TotaisPorTipo = { mo: 0, mat: 0, eqp: 0, srv: 0, aux: 0 };
  const itens = c.itens.map((item): ItemCotacaoCalculado => {
    const base = bases[item.base];
    const comp = base?.porCodigo.get(String(item.cod));
    const vendaPorTipo: TotaisPorTipo = { mo: 0, mat: 0, eqp: 0, srv: 0, aux: 0 };
    if (!base || !comp) return { item, falta: true, linhas: [], custo: 0, vendaPorTipo, venda: 0, semPreco: 1 };
    const r = calcularServico(base, comp, item.qtd, { ...p, bdi: c.bdi }, { expandir: true });
    let venda = 0;
    const linhas = r.linhas.map((x): LinhaVenda => {
      const totalVenda = r2(x.custo * bdiFator);
      vendaPorTipo[x.t] = r2((vendaPorTipo[x.t] || 0) + totalVenda);
      venda = r2(venda + totalVenda);
      return { ...x, precoVenda: r2(x.p * bdiFator), totalVenda };
    });
    for (const t of Object.keys(porTipo) as TipoInsumo[]) porTipo[t] = r2(porTipo[t] + (vendaPorTipo[t] || 0));
    return { item, falta: false, linhas, custo: r.custo, vendaPorTipo, venda, semPreco: r.semPreco };
  });
  return {
    itens, bdiFator, porTipo,
    custo: itens.reduce((a, r) => a + r.custo, 0),
    venda: r2(itens.reduce((a, r) => a + r.venda, 0)),
    semPreco: itens.reduce((a, r) => a + r.semPreco, 0),
  };
}

/** Numeração sequencial por ano: "007/2026". */
export function proximoNumero(existentes: Pick<Cotacao, 'numero'>[], ano: number): string {
  const maior = existentes.reduce((m, c) => Math.max(m, Number.parseInt(c.numero, 10) || 0), 0);
  return `${String(maior + 1).padStart(3, '0')}/${ano}`;
}

const cacheBusca = new WeakMap<Composicao, string>();

/** Busca de serviços: todos os termos precisam aparecer no código, descrição ou grupo. */
export function buscarServicos(base: BaseComposicoes, consulta: string, categoria?: string, limite = 60): Composicao[] {
  const termos = norm(consulta).split(/\s+/).filter(Boolean);
  const out: Composicao[] = [];
  for (const c of base.comps) {
    if (categoria && categoriaDe(c) !== categoria) continue;
    if (termos.length) {
      let alvo = cacheBusca.get(c);
      if (alvo === undefined) { alvo = norm(`${c.codigo} ${c.descricao} ${c.grupo}`); cacheBusca.set(c, alvo); }
      if (!termos.every((t) => alvo.includes(t))) continue;
    }
    out.push(c);
    if (out.length >= limite) break;
  }
  return out;
}
