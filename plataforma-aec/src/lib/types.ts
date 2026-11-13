/**
 * Schema do Firestore (documentos tipados).
 *
 * tenants/{tenantId}
 *   ├─ members/{uid}
 *   ├─ clients/{clientId}
 *   ├─ projects/{projectId}
 *   │    ├─ briefings/{briefingId}
 *   │    ├─ files/{fileId}/versions/{R00|R01|...}
 *   │    ├─ redlines/{redlineId}
 *   │    ├─ budgets/{budgetId}
 *   │    ├─ contracts/{contractId}
 *   │    ├─ artRrt/{registroId}
 *   │    └─ timesheets/{entryId}
 *   ├─ cubOverrides/{UF_YYYY-MM}
 *   ├─ notifications/{notificationId}
 *   └─ auditLogs/{logId}            (somente Cloud Functions gravam; imutável)
 * cubTables/{UF_YYYY-MM}            (global; somente Admin SDK grava)
 */

export type Role = 'socio_diretor' | 'coordenador' | 'orcamentista' | 'projetista' | 'cliente';

export type UF =
  | 'AC' | 'AL' | 'AP' | 'AM' | 'BA' | 'CE' | 'DF' | 'ES' | 'GO' | 'MA' | 'MT' | 'MS' | 'MG' | 'PA'
  | 'PB' | 'PR' | 'PE' | 'PI' | 'RJ' | 'RN' | 'RS' | 'RO' | 'RR' | 'SC' | 'SP' | 'SE' | 'TO';

export const UFS: UF[] = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

export type Tipologia = 'residencial' | 'comercial' | 'industrial' | 'infraestrutura';
export type Disciplina = 'arquitetonico' | 'estrutural' | 'hidrossanitario' | 'eletrico' | 'terraplenagem';
export type ProjectStatus = 'briefing' | 'estudo_preliminar' | 'anteprojeto' | 'projeto_executivo' | 'aprovacao' | 'concluido';

export const DISCIPLINA_LABEL: Record<Disciplina, string> = {
  arquitetonico: 'Arquitetônico',
  estrutural: 'Estrutural',
  hidrossanitario: 'Hidrossanitário',
  eletrico: 'Elétrico',
  terraplenagem: 'Terraplenagem',
};

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  briefing: 'Briefing',
  estudo_preliminar: 'Estudo preliminar',
  anteprojeto: 'Anteprojeto',
  projeto_executivo: 'Projeto executivo',
  aprovacao: 'Aprovação',
  concluido: 'Concluído',
};

export const ROLE_LABEL: Record<Role, string> = {
  socio_diretor: 'Sócio-Diretor',
  coordenador: 'Coordenador',
  orcamentista: 'Orçamentista',
  projetista: 'Projetista',
  cliente: 'Cliente',
};

export interface Tenant {
  id: string;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  uf: UF;
  /** White-label aplicado aos PDFs e ao cabeçalho do app. */
  branding: { logoUrl?: string; corPrimaria: string; corSecundaria: string };
  responsavelTecnico: { nome: string; conselho: 'CREA' | 'CAU'; registro: string };
  /** Webhook (WhatsApp/E-mail gateway) que recebe as notificações do tenant. */
  webhookUrl?: string;
  /** Custo médio da hora técnica (R$/h) usado no cálculo de margem do timesheet. */
  custoHoraTecnica: number;
}

export interface Member {
  uid: string;
  nome: string;
  email: string;
  role: Role;
  /** Para role=cliente: projetos que ele pode ver no Portal do Cliente. */
  projectIds?: string[];
  ativo: boolean;
}

export interface Client {
  id: string;
  nome: string;
  cpfCnpj: string;
  email: string;
  telefone?: string;
  endereco?: string;
}

export interface Project {
  id: string;
  codigo: string;
  nome: string;
  clientId: string;
  clienteNome: string;
  tipologia: Tipologia;
  status: ProjectStatus;
  uf: UF;
  municipio: string;
  disciplinas: Disciplina[];
  areaConstruidaM2: number;
  /** Honorários de projeto contratados (R$). */
  valorContratado: number;
  /** ISO yyyy-mm-dd */
  inicio: string;
  fim: string;
  /** 0..100 */
  progresso: number;
  /** uids com acesso de cliente (Portal do Cliente). */
  clienteUids: string[];
  atualizadoEm?: string;
}

export interface CadFile {
  id: string;
  nome: string;
  disciplina: Disciplina;
  extensao: 'dwg' | 'dxf' | 'csv' | 'xml';
  revisaoAtual: string;
  totalRevisoes: number;
  atualizadoEm: string;
  atualizadoPor: string;
}

export interface CadFileVersion {
  revisao: string;
  storagePath: string;
  tamanhoBytes: number;
  sha256: string;
  enviadoPor: string;
  enviadoEm: string;
  qtoStatus: 'pendente' | 'processado' | 'erro' | 'aguardando_aps';
  qtoErro?: string;
  /** Resumo do QTO (o detalhamento completo fica em `qto`). */
  qto?: unknown;
}

export interface Redline {
  id: string;
  fileId: string;
  revisao: string;
  autor: string;
  cor: string;
  /** Pontos em coordenadas do desenho (não da tela). */
  pontos: { x: number; y: number }[];
  comentario?: string;
  criadoEm: string;
}

export type ArtStatus = 'a_emitir' | 'emitida' | 'paga' | 'vinculada' | 'baixada';

export interface ArtRrt {
  id: string;
  projectId: string;
  projetoNome: string;
  tipo: 'ART' | 'RRT';
  disciplina: Disciplina;
  etapa: string;
  numero?: string;
  responsavel: string;
  status: ArtStatus;
  valorTaxa: number;
  /** ISO yyyy-mm-dd — data-limite para emissão/pagamento. */
  vencimento: string;
}

export interface TimesheetEntry {
  id: string;
  projectId: string;
  uid: string;
  nome: string;
  disciplina: Disciplina;
  descricao: string;
  /** ISO datetime */
  inicio: string;
  minutos: number;
}

export type ContractStatus = 'rascunho' | 'enviado_assinatura' | 'assinado' | 'cancelado';

export interface Contract {
  id: string;
  projectId: string;
  titulo: string;
  template: string;
  variaveis: Record<string, string>;
  status: ContractStatus;
  pdfPath?: string;
  sha256?: string;
  assinatura?: { provedor: 'clicksign' | 'docusign' | 'govbr'; documentoId?: string; assinadoEm?: string };
}

export type NotificationKind = 'cad_atualizado' | 'orcamento_aprovado' | 'contrato_assinado' | 'art_vencendo' | 'geral';

export interface AppNotification {
  id: string;
  tipo: NotificationKind;
  titulo: string;
  mensagem: string;
  projectId?: string;
  criadoEm: string;
  lidaPor: string[];
}

export interface AuditLog {
  id: string;
  acao: 'create' | 'update' | 'delete';
  recurso: string;
  caminho: string;
  uid: string;
  antes?: unknown;
  depois?: unknown;
  em: string;
}
