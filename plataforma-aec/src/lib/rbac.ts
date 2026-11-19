/** Matriz de permissões (espelha o firestore.rules — o servidor é quem decide; isto só molda a UI). */
import type { Role } from './types';

export type Permissao =
  | 'projeto.editar' | 'cad.enviar' | 'cad.excluir' | 'orcamento.editar' | 'orcamento.aprovar'
  | 'contrato.editar' | 'contrato.assinar' | 'timesheet.lancar' | 'auditoria.ver' | 'equipe.gerir' | 'cub.sobrepor';

const MATRIZ: Record<Role, Permissao[]> = {
  socio_diretor: ['projeto.editar', 'cad.enviar', 'cad.excluir', 'orcamento.editar', 'orcamento.aprovar', 'contrato.editar', 'contrato.assinar', 'timesheet.lancar', 'auditoria.ver', 'equipe.gerir', 'cub.sobrepor'],
  coordenador: ['projeto.editar', 'cad.enviar', 'cad.excluir', 'orcamento.editar', 'contrato.editar', 'timesheet.lancar'],
  orcamentista: ['orcamento.editar', 'cad.enviar', 'timesheet.lancar'],
  projetista: ['cad.enviar', 'timesheet.lancar'],
  consulta: [],
  cliente: [],
};

export const pode = (role: Role | undefined, p: Permissao): boolean => !!role && MATRIZ[role].includes(p);
