/**
 * Super Planilha (como no ObraTop 3): exporta todos os cadastros em um Excel (uma aba por módulo,
 * com os mesmos nomes de aba e de coluna da "Super Planilha Base") e importa de volta — só
 * registros novos, com obra/fornecedor reconhecidos pelo nome e duplicados ignorados.
 */
import { strToU8, zipSync } from 'fflate';
import { numeroBr } from '@/lib/composicoes/importar-precos';
import { COLECAO_DA_REFERENCIA, ESQUEMAS, rotuloRegistro, type CampoEsquema, type IdModulo } from './esquemas';
import { podeGravarModulo, veDadosDePessoal, veTodasAsObras, type Funcao } from './permissoes';

type Reg = { id: string; deleted?: unknown } & Record<string, unknown>;
export type Dados = Record<string, Reg[]>;

/** Abas da Super Planilha (mesmos nomes do ObraTop 3). */
export const ABAS: [string, IdModulo][] = [
  ['OBRAS', 'works'], ['FORNECEDORES', 'suppliers'], ['ORCAMENTO', 'budgets'], ['CRONOGRAMA', 'activities'], ['MEDICOES', 'measurements'], ['ESTOQUE', 'inventory'],
  ['EQUIPAMENTOS', 'equipment'], ['COMPRAS', 'orders'], ['FINANCEIRO', 'finance'], ['CONTRATOS', 'contracts'], ['PESSOAL', 'staff'], ['QUALIDADE', 'quality'],
  ['SEGURANCA', 'safety'], ['DOCUMENTOS', 'documents'], ['DIARIO_DE_OBRA', 'dailyLogs'],
];
const SINONIMOS: Record<string, IdModulo | 'members'> = { MATERIAIS: 'inventory', DIARIO: 'dailyLogs', RDO: 'dailyLogs', EQUIPE_USUARIOS: 'members', EQUIPE: 'members', USUARIOS: 'members' };
export const normAba = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
export const moduloDaAba = (nome: string): IdModulo | 'members' | undefined => { const k = normAba(nome); return ABAS.find(([a]) => a === k)?.[1] ?? SINONIMOS[k]; };
const norm = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const rotuloCampo = (f: CampoEsquema) => f[1].replace(/\s*\(opcional\)\s*/i, '').trim();
const camposDe = (m: IdModulo, funcao: Funcao) => ESQUEMAS[m].fields.filter((f) => f[2] !== 'file' && (m !== 'staff' || veDadosDePessoal(funcao) || !['salary', 'cpf', 'birthDate'].includes(f[0])));

// ───────────────────────── Excel (gravação) ─────────────────────────
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const letra = (i: number) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
/** Gera um .xlsx válido (uma aba por item; 1ª linha em negrito). */
export function gerarXlsx(abas: { nome: string; linhas: (string | number | null | undefined)[][] }[]): Uint8Array {
  const nomes = new Set<string>();
  const nomeSeguro = (n: string) => { let b = n.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Planilha', x = b, i = 2; while (nomes.has(x.toLowerCase())) x = `${b.slice(0, 28)} ${i++}`; nomes.add(x.toLowerCase()); return x; };
  const lista = abas.map((a) => ({ ...a, nome: nomeSeguro(a.nome) }));
  const folha = (linhas: (string | number | null | undefined)[][]) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${linhas.map((l, r) => `<row r="${r + 1}">${l.map((v, c) => {
    const ref = `${letra(c)}${r + 1}`, est = r === 0 ? ' s="1"' : '';
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${est}><v>${v}</v></c>`;
    const t = v == null ? '' : String(v);
    return t ? `<c r="${ref}"${est} t="inlineStr"><is><t xml:space="preserve">${esc(t)}</t></is></c>` : '';
  }).join('')}</row>`).join('')}</sheetData></worksheet>`;
  const arquivos: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${lista.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${lista.map((a, i) => `<sheet name="${esc(a.nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${lista.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${lista.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>'),
  };
  lista.forEach((a, i) => { arquivos[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(folha(a.linhas)); });
  return zipSync(arquivos);
}

// ───────────────────────── exportação ─────────────────────────
const dataBr = (iso: unknown) => { const s = String(iso ?? '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : String(iso ?? ''); };
export function rotuloRef(d: Dados, f: CampoEsquema, v: unknown): string {
  const col = COLECAO_DA_REFERENCIA[f[2]];
  if (!col || !v) return String(v ?? '');
  const r = (d[col] ?? []).find((x) => x.id === v);
  return r ? rotuloRegistro(col, r) : '';
}
/** Linhas (cabeçalho + registros) de um módulo, com datas dd/mm/aaaa e referências pelo nome. */
export function linhasDoModulo(m: IdModulo, d: Dados, funcao: Funcao, filtro?: (r: Reg) => boolean): (string | number)[][] {
  const campos = camposDe(m, funcao);
  const regs = (d[m] ?? []).filter((r) => !r.deleted && (!filtro || filtro(r)));
  return [campos.map(rotuloCampo), ...regs.map((r) => campos.map((f) => {
    const v = r[f[0]];
    if (v == null || v === '') return '';
    if (f[2] === 'number') return Number(v) || 0;
    if (f[2] === 'date') return dataBr(v);
    if (COLECAO_DA_REFERENCIA[f[2]]) return rotuloRef(d, f, v);
    return String(v);
  }))];
}
export const exportarTudo = (d: Dados, funcao: Funcao, filtro?: (r: Reg) => boolean) =>
  gerarXlsx(ABAS.map(([aba, m]) => ({ nome: aba, linhas: linhasDoModulo(m, d, funcao, m === 'works' || m === 'suppliers' || m === 'staff' ? undefined : filtro) })));

// ───────────────────────── importação ─────────────────────────
function dataDe(v: string): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (br) return `${br[3]}-${br[2]!.padStart(2, '0')}-${br[1]!.padStart(2, '0')}`;
  const n = Number(s);
  if (Number.isFinite(n) && n > 20000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000).toISOString().slice(0, 10); // data serial do Excel
  return '';
}
/** Linhas da aba em objetos {cabeçalho normalizado: valor}. O cabeçalho é a 1ª linha com 2+ células. */
export function objetosDaAba(linhas: string[][]): Record<string, string>[] {
  const i = linhas.findIndex((l) => l.filter((c) => String(c ?? '').trim()).length >= 2);
  if (i < 0) return [];
  const cab = linhas[i]!.map(norm);
  return linhas.slice(i + 1).filter((l) => l.some((c) => String(c ?? '').trim())).map((l) => Object.fromEntries(cab.map((h, k) => [h, String(l[k] ?? '').trim()])));
}
const chave = (m: IdModulo, x: Record<string, unknown>): string => {
  const n = (k: string) => norm(x[k]);
  switch (m) {
    case 'works': return n('name');
    case 'suppliers': return n('cnpj') ? `cnpj:${n('cnpj')}` : `n:${n('name')}`;
    case 'measurements': case 'contracts': return `${x.workId}|${n('number')}`;
    case 'activities': return `${x.workId}|${n('wbs') || n('name')}`;
    case 'equipment': return `${x.workId}|${n('code') || n('name')}`;
    case 'inventory': return `${x.workId}|${n('material')}`;
    case 'staff': return n('name');
    case 'documents': return `${x.workId}|${n('name')}`;
    case 'dailyLogs': return `${x.workId}|${n('date')}`;
    default: return `${x.workId}|${n('date')}|${n('description') || n('issue')}|${n('value')}`;
  }
};

export interface ResultadoImportacao { modulo: IdModulo; aba: string; novos: { id: string; dados: Record<string, unknown> }[]; duplicados: number; erros: string[]; semPermissao: boolean }

/** Monta (sem gravar) o que a planilha cria. Ids são gerados aqui para obras e fornecedores novos já servirem de referência. */
export function prepararImportacao(abas: { nome: string; linhas: string[][] }[], d: Dados, o: { funcao: Funcao; obraAtribuida?: string; novoId: () => string }): { resultados: ResultadoImportacao[]; ignoradas: string[] } {
  const ignoradas: string[] = [];
  const porModulo = new Map<IdModulo, { aba: string; linhas: Record<string, string>[] }>();
  for (const a of abas) {
    const m = moduloDaAba(a.nome);
    if (!m) { if (!/^(INSTRUCOES|AUDITORIA|DASHBOARD|EAP|DICIONARIO)/.test(normAba(a.nome))) ignoradas.push(a.nome); continue; }
    if (m === 'members') { ignoradas.push(`${a.nome} (convites são feitos em Administrativo → Empresa e equipe)`); continue; }
    porModulo.set(m, { aba: a.nome, linhas: objetosDaAba(a.linhas) });
  }
  // Índices de nomes (existentes + criados nesta importação).
  const vivos = (m: string) => (d[m] ?? []).filter((r) => !r.deleted);
  const obras = new Map(vivos('works').map((w) => [norm(w.name), w.id]));
  const fornecedores = new Map(vivos('suppliers').flatMap((s) => [[norm(s.name), s.id] as const, ...(s.cnpj ? [[norm(s.cnpj), s.id] as const] : [])]));
  const criados: Record<string, Reg[]> = {};
  const resultados: ResultadoImportacao[] = [];
  for (const [, m] of ABAS) {
    const pack = porModulo.get(m);
    if (!pack) continue;
    const temObra = ESQUEMAS[m].fields.some((f) => f[0] === 'workId');
    const res: ResultadoImportacao = { modulo: m, aba: pack.aba, novos: [], duplicados: 0, erros: [], semPermissao: !podeGravarModulo(o.funcao, m, temObra, o.obraAtribuida) || (m === 'works' && !['owner', 'manager'].includes(o.funcao)) };
    resultados.push(res);
    if (res.semPermissao) continue;
    const existentes = new Set(vivos(m).map((r) => chave(m, r)));
    pack.linhas.forEach((linha, i) => {
      try {
        const dados: Record<string, unknown> = {};
        for (const f of camposDe(m, o.funcao)) {
          const [k, , tipo] = f;
          let v: string = linha[norm(f[1])] ?? linha[norm(rotuloCampo(f))] ?? linha[norm(k)] ?? '';
          if (tipo === 'date') { dados[k] = dataDe(v); continue; }
          if (tipo === 'number') { const x = numeroBr(v); dados[k] = Number.isFinite(x) ? x : 0; continue; }
          v = String(v).trim();
          if (tipo === 'work') {
            if (!veTodasAsObras(o.funcao)) { dados[k] = o.obraAtribuida ?? ''; continue; }
            const id = obras.get(norm(v));
            if (!id) throw new Error(`obra "${v || '(vazia)'}" não encontrada`);
            dados[k] = id; continue;
          }
          if (tipo === 'supplier') { dados[k] = v ? fornecedores.get(norm(v)) ?? '' : ''; continue; }
          const col = COLECAO_DA_REFERENCIA[tipo];
          if (col && v) {
            const lista = [...vivos(col), ...(criados[col] ?? [])].filter((r) => !dados.workId || !r.workId || r.workId === dados.workId);
            dados[k] = lista.find((r) => r.id === v || norm(rotuloRegistro(col, r)) === norm(v))?.id ?? '';
            continue;
          }
          if (tipo === 'select' && v) { const op = (f[4] ?? []).find((x) => norm(x) === norm(v)); dados[k] = op ?? v; continue; }
          dados[k] = v;
        }
        // Já existe (mesma chave): ignora antes de cobrar campos obrigatórios.
        const k = chave(m, dados);
        if (existentes.has(k)) { res.duplicados++; return; }
        const faltando = ESQUEMAS[m].fields.filter((f) => f[3] && f[2] !== 'file' && (dados[f[0]] === '' || dados[f[0]] === undefined) && f[2] !== 'number').map((f) => rotuloCampo(f));
        if (faltando.length) throw new Error(`falta ${faltando.join(', ')}`);
        if (temObra && !dados.workId) throw new Error('sem obra');
        existentes.add(k);
        const id = o.novoId();
        res.novos.push({ id, dados });
        (criados[m] ??= []).push({ id, ...dados });
        if (m === 'works') obras.set(norm(dados.name), id);
        if (m === 'suppliers') { fornecedores.set(norm(dados.name), id); if (dados.cnpj) fornecedores.set(norm(dados.cnpj), id); }
      } catch (e) { res.erros.push(`linha ${i + 2}: ${e instanceof Error ? e.message : 'inválida'}`); }
    });
  }
  return { resultados, ignoradas };
}
