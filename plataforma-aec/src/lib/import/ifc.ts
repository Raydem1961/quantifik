/**
 * Leitor IFC (STEP / ISO 10303-21) para quantitativos BIM — IFC2x3 e IFC4.
 *
 * Funciona com modelos exportados do Revit, Archicad, Tekla, Civil 3D, QiBuilder, AltoQi Eberick,
 * TQS etc. Lê os elementos, seus tipos (IfcRelDefinesByType) e as quantidades de base
 * (IfcElementQuantity → IfcQuantityLength/Area/Volume/Count/Weight), convertendo unidades do
 * projeto (mm, cm…) para metro. Não calcula geometria: se o modelo foi exportado sem
 * "Base Quantities", só a contagem de elementos fica disponível — e o parser avisa.
 */
import type { Disciplina } from '../types';
import { criarItem, type ItemQuantitativo, type ResultadoImportacao } from './modelo';

interface Entidade { tipo: string; args: string }

/** Varre a seção DATA separando as instruções `#id = TIPO(args);` (strings podem conter ';'). */
function lerEntidades(texto: string): Map<number, Entidade> {
  const mapa = new Map<number, Entidade>();
  const inicio = texto.indexOf('DATA;');
  if (inicio < 0) throw new Error('Arquivo IFC inválido: seção DATA não encontrada.');
  const re = /#(\d+)\s*=\s*([A-Za-z0-9_]+)\s*\(/g;
  re.lastIndex = inicio;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    let i = re.lastIndex;
    let nivel = 1;
    let emString = false;
    for (; i < texto.length && nivel > 0; i++) {
      const c = texto.charCodeAt(i);
      if (c === 39 /* ' */) emString = !emString; // aspas duplicadas ('') alternam duas vezes: sem efeito
      else if (!emString) {
        if (c === 40) nivel++;
        else if (c === 41) nivel--;
      }
    }
    mapa.set(Number(m[1]), { tipo: m[2]!.toUpperCase(), args: texto.slice(re.lastIndex, i - 1) });
    re.lastIndex = i;
  }
  return mapa;
}

/** Divide os argumentos no nível superior (respeita strings e parênteses). */
export function dividirArgs(args: string): string[] {
  const partes: string[] = [];
  let nivel = 0;
  let emString = false;
  let ini = 0;
  for (let i = 0; i < args.length; i++) {
    const c = args[i];
    if (c === "'") emString = !emString;
    else if (!emString) {
      if (c === '(') nivel++;
      else if (c === ')') nivel--;
      else if (c === ',' && nivel === 0) {
        partes.push(args.slice(ini, i).trim());
        ini = i + 1;
      }
    }
  }
  partes.push(args.slice(ini).trim());
  return partes;
}

/** Decodifica uma string STEP: aspas duplicadas e escapes \X2\…\X0\ e \X\hh. */
export function decodificar(valor: string | undefined): string {
  if (!valor || valor === '$' || valor === '*') return '';
  let s = valor.trim();
  const tipado = /^[A-Z0-9_]+\((.*)\)$/s.exec(s); // IFCLABEL('x')
  if (tipado) s = tipado[1]!;
  if (s.startsWith("'") && s.endsWith("'")) s = s.slice(1, -1);
  return s
    .replace(/''/g, "'")
    .replace(/\\X2\\([0-9A-F]+)\\X0\\/g, (_, hex: string) =>
      (hex.match(/.{4}/g) ?? []).map((h) => String.fromCharCode(parseInt(h, 16))).join(''))
    .replace(/\\X\\([0-9A-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\S\\(.)/g, (_, ch: string) => String.fromCharCode(ch.charCodeAt(0) + 128));
}

const refs = (valor: string | undefined): number[] => [...(valor ?? '').matchAll(/#(\d+)/g)].map((m) => Number(m[1]));
const numero = (valor: string | undefined): number => {
  const tipado = /\(([^()]*)\)/.exec(valor ?? '');
  const v = Number.parseFloat(tipado ? tipado[1]! : valor ?? '');
  return Number.isFinite(v) ? v : 0;
};

const PREFIXO: Record<string, number> = { MILLI: 1e-3, CENTI: 1e-2, DECI: 1e-1, KILO: 1e3 };

type Dimensao = 'm' | 'm2' | 'm3' | 'un' | 'kg';
const TIPO_QUANTIDADE: Record<string, Dimensao> = {
  IFCQUANTITYLENGTH: 'm', IFCQUANTITYAREA: 'm2', IFCQUANTITYVOLUME: 'm3', IFCQUANTITYCOUNT: 'un', IFCQUANTITYWEIGHT: 'kg',
};

/** Classe IFC → rótulo e disciplina. Classes fora da lista entram como "Outros elementos". */
const CLASSES: Record<string, [rotulo: string, disciplina: Disciplina]> = {
  IFCWALL: ['Parede', 'arquitetonico'], IFCWALLSTANDARDCASE: ['Parede', 'arquitetonico'], IFCCURTAINWALL: ['Pele de vidro', 'arquitetonico'],
  IFCSLAB: ['Laje', 'estrutural'], IFCBEAM: ['Viga', 'estrutural'], IFCCOLUMN: ['Pilar', 'estrutural'], IFCFOOTING: ['Fundação', 'estrutural'],
  IFCPILE: ['Estaca', 'estrutural'], IFCREINFORCINGBAR: ['Armadura', 'estrutural'], IFCMEMBER: ['Perfil estrutural', 'estrutural'], IFCPLATE: ['Chapa', 'estrutural'],
  IFCDOOR: ['Porta', 'arquitetonico'], IFCWINDOW: ['Janela', 'arquitetonico'], IFCROOF: ['Cobertura', 'arquitetonico'], IFCCOVERING: ['Revestimento', 'arquitetonico'],
  IFCSTAIR: ['Escada', 'arquitetonico'], IFCSTAIRFLIGHT: ['Lance de escada', 'arquitetonico'], IFCRAMP: ['Rampa', 'arquitetonico'], IFCRAILING: ['Guarda-corpo', 'arquitetonico'],
  IFCSPACE: ['Ambiente', 'arquitetonico'], IFCFURNISHINGELEMENT: ['Mobiliário', 'arquitetonico'], IFCBUILDINGELEMENTPROXY: ['Elemento genérico', 'arquitetonico'],
  IFCPIPESEGMENT: ['Tubo', 'hidrossanitario'], IFCPIPEFITTING: ['Conexão', 'hidrossanitario'], IFCFLOWSEGMENT: ['Tubo/duto', 'hidrossanitario'], IFCFLOWFITTING: ['Conexão', 'hidrossanitario'],
  IFCFLOWTERMINAL: ['Ponto de consumo', 'hidrossanitario'], IFCSANITARYTERMINAL: ['Louça sanitária', 'hidrossanitario'], IFCVALVE: ['Registro/válvula', 'hidrossanitario'],
  IFCFLOWCONTROLLER: ['Registro/válvula', 'hidrossanitario'], IFCTANK: ['Reservatório', 'hidrossanitario'], IFCPUMP: ['Bomba', 'hidrossanitario'], IFCWASTETERMINAL: ['Ralo/caixa', 'hidrossanitario'],
  IFCDUCTSEGMENT: ['Duto', 'hidrossanitario'], IFCDUCTFITTING: ['Conexão de duto', 'hidrossanitario'],
  IFCCABLESEGMENT: ['Cabo', 'eletrico'], IFCCABLECARRIERSEGMENT: ['Eletroduto/eletrocalha', 'eletrico'], IFCCABLECARRIERFITTING: ['Conexão de eletroduto', 'eletrico'],
  IFCLIGHTFIXTURE: ['Luminária', 'eletrico'], IFCOUTLET: ['Tomada', 'eletrico'], IFCSWITCHINGDEVICE: ['Interruptor', 'eletrico'],
  IFCELECTRICDISTRIBUTIONBOARD: ['Quadro elétrico', 'eletrico'], IFCELECTRICAPPLIANCE: ['Equipamento elétrico', 'eletrico'], IFCJUNCTIONBOX: ['Caixa de passagem', 'eletrico'],
  IFCDISTRIBUTIONCHAMBERELEMENT: ['Poço de visita / caixa', 'esgotamento'], IFCEARTHWORKSCUT: ['Corte', 'terraplenagem'], IFCEARTHWORKSFILL: ['Aterro', 'terraplenagem'],
  IFCPAVEMENT: ['Pavimento', 'pavimentacao'], IFCCOURSE: ['Camada de pavimento', 'pavimentacao'], IFCKERB: ['Meio-fio', 'pavimentacao'],
};

/** Vazios e contêineres espaciais: têm quantidades no modelo, mas não são serviço a orçar. */
const NAO_ORCAVEIS = new Set(['IFCOPENINGELEMENT', 'IFCVIRTUALELEMENT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCPROJECT', 'IFCZONE']);

/** Quantidade preferida por dimensão (líquida antes de bruta). */
const PREFERENCIA: Record<Dimensao, RegExp[]> = {
  // Só comprimento: altura, largura e perímetro não são quantidades orçáveis somadas por tipo.
  m: [/^length$/i, /netlength/i, /grosslength/i],
  m2: [/netsidearea/i, /netarea/i, /netfloorarea/i, /grosssidearea/i, /grossarea/i, /grossfloorarea/i, /area/i],
  m3: [/netvolume/i, /grossvolume/i, /volume/i],
  kg: [/netweight/i, /grossweight/i, /weight/i],
  un: [/count/i],
};

export function parseIfc(arquivo: string, texto: string): ResultadoImportacao {
  if (!/^\s*ISO-10303-21/.test(texto)) throw new Error('O arquivo não é um IFC em formato STEP (.ifc). IFC-XML/ifcZIP não são suportados.');
  const ents = lerEntidades(texto);
  const avisos: string[] = [];
  const args = (id: number) => dividirArgs(ents.get(id)?.args ?? '');

  // Unidades do projeto → fatores para metro, m², m³. Só valem as unidades listadas no
  // IfcUnitAssignment: o arquivo costuma trazer outras IFCSIUNIT soltas (usadas em unidades
  // derivadas) que não são a unidade do projeto.
  const fator: Record<Dimensao, number> = { m: 1, m2: 1, m3: 1, un: 1, kg: 1 };
  const atribuidas = new Set<number>();
  for (const e of ents.values()) if (e.tipo === 'IFCUNITASSIGNMENT') refs(e.args).forEach((r) => atribuidas.add(r));
  for (const [id, e] of ents) {
    if (e.tipo !== 'IFCSIUNIT' || (atribuidas.size > 0 && !atribuidas.has(id))) continue;
    const a = dividirArgs(e.args);
    const p = PREFIXO[(a[2] ?? '').replace(/\./g, '')] ?? 1;
    const tipo = (a[1] ?? '').replace(/\./g, '');
    if (tipo === 'LENGTHUNIT') fator.m = p;
    else if (tipo === 'AREAUNIT') fator.m2 = p * p;
    else if (tipo === 'VOLUMEUNIT') fator.m3 = p ** 3;
    else if (tipo === 'MASSUNIT') fator.kg = (a[3] ?? '').includes('GRAM') ? p / 1000 : p; // SI: grama; KILO → 1 kg
  }
  const projetoEmMm = fator.m === 1e-3;
  let corrigidas = 0;
  let inconsistentes = 0;

  // Elemento → nome do tipo (família/tipo do Revit, por exemplo).
  const tipoDe = new Map<number, string>();
  // Elemento → conjuntos de quantidades.
  const qtosDe = new Map<number, number[]>();
  for (const e of ents.values()) {
    if (e.tipo === 'IFCRELDEFINESBYTYPE') {
      const a = dividirArgs(e.args);
      const nomeTipo = decodificar(args(refs(a[5])[0] ?? -1)[2]);
      if (nomeTipo) for (const obj of refs(a[4])) tipoDe.set(obj, nomeTipo);
    } else if (e.tipo === 'IFCRELDEFINESBYPROPERTIES') {
      const a = dividirArgs(e.args);
      const def = refs(a[5])[0];
      if (def !== undefined && ents.get(def)?.tipo === 'IFCELEMENTQUANTITY') {
        for (const obj of refs(a[4])) qtosDe.set(obj, [...(qtosDe.get(obj) ?? []), def]);
      }
    }
  }

  interface Grupo { classe: string; rotulo: string; disciplina: Disciplina; tipo: string; contagem: number; somas: Map<string, { dim: Dimensao; valor: number }> }
  const grupos = new Map<string, Grupo>();
  let elementos = 0;
  let comQuantidades = 0;

  for (const [id, e] of ents) {
    const conhecida = CLASSES[e.tipo];
    // Fora da lista, só entra quem tem quantidades de base ligadas (é um produto mensurável).
    if (!conhecida && !qtosDe.has(id)) continue;
    if (e.tipo.endsWith('TYPE') || e.tipo.endsWith('STYLE') || NAO_ORCAVEIS.has(e.tipo)) continue;
    const a = dividirArgs(e.args);
    let [rotulo, disciplina] = conhecida ?? [e.tipo.replace(/^IFC/, ''), 'arquitetonico' as Disciplina];
    if (e.tipo === 'IFCSLAB') {
      // O tipo predefinido distingue laje de piso, telhado e radier (o Revit exporta telhados como IfcSlab).
      const pre = (a[8] ?? '').replace(/\./g, '');
      if (pre === 'ROOF') [rotulo, disciplina] = ['Cobertura', 'arquitetonico'];
      else if (pre === 'BASESLAB') rotulo = 'Laje de fundação / radier';
      else if (pre === 'LANDING') rotulo = 'Patamar';
    }
    const tipo = tipoDe.get(id) || decodificar(a[4]) || decodificar(a[2]) || 'sem tipo';
    const chave = `${e.tipo}|${rotulo}|${tipo}`;
    let g = grupos.get(chave);
    if (!g) {
      g = { classe: e.tipo, rotulo, disciplina, tipo, contagem: 0, somas: new Map() };
      grupos.set(chave, g);
    }
    g.contagem++;
    elementos++;
    const conjuntos = qtosDe.get(id);
    if (conjuntos) comQuantidades++;
    // Quantidades deste elemento, por nome. O exportador do Revit às vezes grava a mesma
    // quantidade duas vezes no mesmo conjunto — uma delas sem converter (mm² ou mm³ num arquivo
    // que declara m² e m³). Entre repetidas vale a menor, que é a convertida.
    const doElemento = new Map<string, { dim: Dimensao; valor: number }>();
    for (const cj of conjuntos ?? []) {
      for (const q of refs(args(cj)[5])) {
        const ent = ents.get(q);
        const dim = ent && TIPO_QUANTIDADE[ent.tipo];
        if (!ent || !dim) continue;
        const qa = dividirArgs(ent.args);
        const nome = decodificar(qa[0]);
        let valor = numero(qa[3]) * fator[dim];
        // Mesma falha sem repetição: num projeto em milímetros, um único elemento com mais de
        // 1 km² ou 10 milhões de m³ só pode ser valor em mm²/mm³.
        if (projetoEmMm && ((dim === 'm2' && fator.m2 === 1 && valor > 1e6) || (dim === 'm3' && fator.m3 === 1 && valor > 1e7))) {
          valor *= dim === 'm2' ? 1e-6 : 1e-9;
          corrigidas++;
        }
        const anterior = doElemento.get(nome);
        if (anterior) corrigidas++;
        if (!anterior || valor < anterior.valor) doElemento.set(nome, { dim, valor });
      }
    }
    // Líquido maior que bruto é impossível: indica dado ruim do exportador, que não dá para corrigir daqui.
    for (const [liq, bruto] of [['NetArea', 'GrossArea'], ['NetSideArea', 'GrossSideArea'], ['NetVolume', 'GrossVolume']] as const) {
      const l = doElemento.get(liq)?.valor, b = doElemento.get(bruto)?.valor;
      if (l !== undefined && b !== undefined && l > b * 1.01) { inconsistentes++; break; }
    }
    for (const [nome, q] of doElemento) {
      const soma = g.somas.get(nome) ?? { dim: q.dim, valor: 0 };
      soma.valor += q.valor;
      g.somas.set(nome, soma);
    }
  }

  if (elementos === 0) throw new Error('Nenhum elemento construtivo encontrado no IFC.');
  if (comQuantidades === 0) {
    avisos.push('O modelo não traz quantidades de base (IfcElementQuantity): só a contagem de elementos foi extraída. Reexporte marcando "Export base quantities" (Revit) ou equivalente.');
  } else if (comQuantidades < elementos) {
    avisos.push(`${elementos - comQuantidades} de ${elementos} elementos não têm quantidades de base; para eles vale apenas a contagem.`);
  }

  if (inconsistentes) avisos.push(`${inconsistentes} elemento(s) trazem área ou volume líquido maior que o bruto — dado inconsistente gravado pelo software de origem. Confira esses itens no modelo antes de orçar.`);
  if (corrigidas) avisos.push(`${corrigidas} quantidade(s) repetidas ou gravadas em mm²/mm³ pelo exportador foram normalizadas — confira áreas e volumes dos itens principais.`);

  const itens: ItemQuantitativo[] = [];
  for (const g of grupos.values()) {
    const descricao = g.tipo === 'sem tipo' ? g.rotulo : `${g.rotulo} — ${g.tipo}`;
    const base = { arquivo, formato: 'ifc' as const, disciplina: g.disciplina, grupo: g.rotulo, descricao };
    itens.push(criarItem({ ...base, unidade: 'un', quantidade: g.contagem, atributos: { classeIfc: g.classe } }));
    for (const dim of ['m', 'm2', 'm3', 'kg'] as Dimensao[]) {
      const candidatas = [...g.somas].filter(([, s]) => s.dim === dim && s.valor > 0);
      if (candidatas.length === 0) continue;
      // Comprimento exige nome reconhecido; nas demais dimensões qualquer quantidade serve de reserva.
      const escolhida = PREFERENCIA[dim].map((re) => candidatas.find(([n]) => re.test(n))).find(Boolean) ?? (dim === 'm' ? undefined : candidatas[0]);
      if (!escolhida) continue;
      itens.push(criarItem({ ...base, unidade: dim, quantidade: escolhida[1].valor, atributos: { classeIfc: g.classe, quantidadeIfc: escolhida[0] } }));
    }
  }
  itens.sort((x, y) => x.disciplina.localeCompare(y.disciplina) || x.descricao.localeCompare(y.descricao));
  return { arquivo, formato: 'ifc', itens, avisos, resumo: `${elementos} elementos BIM · ${grupos.size} tipos` };
}
