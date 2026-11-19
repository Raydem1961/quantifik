/**
 * Funções do ObraTop (campo `role` do membro), iguais às do ObraTop 3.26+:
 *   owner        Administrador geral — tudo, inclusive excluir e gerir equipe
 *   manager      Gestor — todas as obras; cria e altera, não exclui
 *   finance      Financeiro — todas as obras; altera financeiro, medições, contratos, compras e orçamentos
 *   project_user Engenheiro responsável — somente a obra atribuída
 *   viewer       Consulta — somente leitura
 * O servidor (regras) é quem decide; isto só molda a tela.
 */
export type Funcao = 'owner' | 'manager' | 'finance' | 'project_user' | 'viewer';
export const FUNCOES: Funcao[] = ['owner', 'manager', 'finance', 'project_user', 'viewer'];
export const FUNCAO_LABEL: Record<Funcao, string> = {
  owner: 'Administrador geral', manager: 'Gestor (todas as obras)', finance: 'Financeiro (todas as obras)', project_user: 'Engenheiro da obra', viewer: 'Consulta (somente leitura)',
};
export const funcaoDe = (v: unknown): Funcao => (FUNCOES.includes(v as Funcao) ? (v as Funcao) : 'project_user');

/** Módulos que o Financeiro altera em qualquer obra. */
export const MODULOS_FINANCEIRO = ['finance', 'measurements', 'contracts', 'orders', 'budgets'];
/** Módulos do ObraTop que o Gestor altera em qualquer obra. */
export const MODULOS_GESTOR = ['works', 'activities', 'budgets', 'measurements', 'finance', 'contracts', 'orders', 'inventory', 'suppliers', 'staff', 'equipment', 'quality', 'safety', 'documents', 'dailyLogs'];

export const veTodasAsObras = (f: Funcao) => f !== 'project_user';
export const podeExcluir = (f: Funcao) => f === 'owner';
export const somenteLeitura = (f: Funcao) => f === 'viewer';

/** Pode criar/alterar registros deste módulo? `obraAtribuida` vale só para o engenheiro da obra. */
export function podeGravarModulo(f: Funcao, modulo: string, temObra: boolean, obraAtribuida?: string): boolean {
  switch (f) {
    case 'owner': return true;
    case 'manager': return MODULOS_GESTOR.includes(modulo);
    case 'finance': return MODULOS_FINANCEIRO.includes(modulo);
    case 'viewer': return false;
    default: return !!obraAtribuida && modulo !== 'suppliers' && (modulo === 'works' || temObra);
  }
}
/** Cria obras novas (o engenheiro só altera a dele). */
export const podeCriarObra = (f: Funcao) => f === 'owner' || f === 'manager';
/** Salários e dados pessoais da equipe: só Administrador e Financeiro (como no ObraTop 3). */
export const veDadosDePessoal = (f: Funcao) => f === 'owner' || f === 'finance';
