import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { abasDeXlsx } from '../src/lib/composicoes/importar-precos';
import { exportarTudo, gerarXlsx, moduloDaAba, objetosDaAba, prepararImportacao } from '../src/lib/obratop/planilha';

let seq = 0;
const novoId = () => `n${++seq}`;
const D = {
  works: [{ id: 'w1', name: 'Obra Existente', client: 'C', start: '2026-01-01', end: '2026-12-31', status: 'Em andamento' }],
  suppliers: [{ id: 's1', name: 'Fornecedor Antigo', cnpj: '11.222.333/0001-81' }],
  activities: [{ id: 'a1', workId: 'w1', wbs: '1', name: 'Fundações', start: '2026-01-01', end: '2026-02-01' }],
  staff: [{ id: 'p1', name: 'Maria', role: 'Eng', salary: 9999, status: 'Ativo' }],
  finance: [], budgets: [], measurements: [], inventory: [], equipment: [], orders: [], contracts: [], quality: [], safety: [], documents: [], dailyLogs: [],
};

describe('Super Planilha (ObraTop 3)', () => {
  it('lê a Super Planilha Base original do ObraTop 3 (todas as abas)', () => {
    const abas = abasDeXlsx(new Uint8Array(readFileSync('public/ObraTop_Super_Planilha_Base.xlsx')));
    expect(abas.map((a) => a.nome)).toEqual(expect.arrayContaining(['OBRAS', 'CRONOGRAMA', 'FINANCEIRO', 'ESTOQUE', 'EQUIPE_USUARIOS']));
    const obras = objetosDaAba(abas.find((a) => a.nome === 'OBRAS')!.linhas);
    expect(obras.length).toBeGreaterThan(0);
    const { resultados } = prepararImportacao(abas, { works: [], suppliers: [] } as never, { funcao: 'owner', novoId });
    const w = resultados.find((r) => r.modulo === 'works')!;
    expect(w.novos.length).toBeGreaterThan(0);
    expect(w.novos[0]!.dados.name).toBeTruthy();
    const crono = resultados.find((r) => r.modulo === 'activities')!;
    expect(crono.novos.length).toBeGreaterThan(0);
    expect(crono.novos.every((n) => w.novos.some((x) => x.id === n.dados.workId))).toBe(true); // obras criadas na mesma planilha servem de referência
  });
  it('exporta e reimporta: nada se duplica; dados novos entram com obra e fornecedor pelo nome', () => {
    const xlsx = exportarTudo(D as never, 'owner');
    const abas = abasDeXlsx(xlsx);
    expect(abas.find((a) => a.nome === 'CRONOGRAMA')!.linhas[1]).toEqual(expect.arrayContaining(['Obra Existente', '1', 'Fundações', '01/01/2026']));
    const r1 = prepararImportacao(abas, D as never, { funcao: 'owner', novoId });
    expect(r1.resultados.every((r) => r.novos.length === 0)).toBe(true);
    expect(r1.resultados.find((r) => r.modulo === 'activities')!.duplicados).toBe(1);
    const nova = gerarXlsx([{ nome: 'FINANCEIRO', linhas: [['Obra', 'Competência', 'Descrição', 'Tipo', 'Categoria', 'Valor', 'Status', 'Vencimento'], ['obra existente', '46000', 'Aço', 'despesa', 'Materiais', '1.234,56', 'Pago', '15/03/2026'], ['Obra Fantasma', '01/01/2026', 'X', 'Receita', 'Y', '1', 'Previsto', '']] }]);
    const r2 = prepararImportacao(abasDeXlsx(nova), D as never, { funcao: 'owner', novoId }).resultados[0]!;
    expect(r2.novos).toHaveLength(1);
    expect(r2.novos[0]!.dados).toMatchObject({ workId: 'w1', description: 'Aço', type: 'Despesa', value: 1234.56, status: 'Pago', dueDate: '2026-03-15', date: '2025-12-09' });
    expect(r2.erros[0]).toMatch(/Obra Fantasma/);
  });
  it('respeita a função: salário fora da planilha de quem não vê; Consulta não importa; engenheiro só na obra dele', () => {
    const g = abasDeXlsx(exportarTudo(D as never, 'manager'));
    expect(g.find((a) => a.nome === 'PESSOAL')!.linhas[0]).not.toContain('Salário');
    expect(abasDeXlsx(exportarTudo(D as never, 'owner')).find((a) => a.nome === 'PESSOAL')!.linhas[0]).toContain('Salário');
    const plan = [{ nome: 'DIARIO_DE_OBRA', linhas: [['Obra', 'Data', 'Clima', 'Dia trabalhável', 'Serviços executados', 'Status'], ['Qualquer', '2026-05-02', 'Bom', 'Sim', 'Concreto', 'Rascunho']] }];
    expect(prepararImportacao(plan, D as never, { funcao: 'viewer', novoId }).resultados[0]!.semPermissao).toBe(true);
    const eng = prepararImportacao(plan, D as never, { funcao: 'project_user', obraAtribuida: 'w1', novoId }).resultados[0]!;
    expect(eng.novos[0]!.dados.workId).toBe('w1');
    expect(moduloDaAba('Segurança')).toBe('safety'); expect(moduloDaAba('Medições')).toBe('measurements'); expect(moduloDaAba('Equipe / Usuários')).toBe('members');
  });
});
