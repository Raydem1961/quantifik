/**
 * Esquemas dos módulos de gestão de obras, copiados literalmente do ObraTop (`const schemas`
 * em public/app.js, versão 3.39.13.0). Cada módulo é uma lista de campos
 * [chave, rótulo, tipo, obrigatório?, opções?]; a tela genérica em /gestao desenha tabela e
 * formulário a partir disto, e os documentos guardam exatamente os mesmos campos — o que
 * permite migrar os dados do ObraTop sem conversão.
 * ARQUIVO GERADO — ao mudar um esquema no ObraTop, regenere em vez de editar à mão.
 */

export type TipoCampo =
  | 'text' | 'textarea' | 'number' | 'date' | 'select' | 'email' | 'url' | 'file'
  | 'work' | 'contract' | 'budget' | 'activity' | 'supplier' | 'inventory' | 'measurement' | 'order';

export type CampoEsquema = [chave: string, rotulo: string, tipo: TipoCampo, obrigatorio?: 0 | 1, opcoes?: string[]];

export interface EsquemaModulo {
  title: string;
  icon: string;
  group: string;
  subtitle: string;
  /** Papéis do ObraTop que podem gravar: 'owner' e/ou 'project_user'. */
  roles: string[];
  fields: CampoEsquema[];
}

export const ESQUEMAS = {
 works:{title:'Obras',icon:'🏗️',group:'Operação',subtitle:'Cadastro, situação e progresso',roles:['owner','project_user'],fields:[['name','Nome da obra','text',1],['client','Cliente','text',1],['address','Endereço','text'],['start','Início','date',1],['end','Término previsto','date',1],['value','Valor contratado','number'],['status','Status','select',1,['Planejamento','Em andamento','Parada','Concluída']],['progress','Progresso (%)','number'],['engineer','Engº Responsável','text']]},
 measurements:{title:'Medições',icon:'📐',group:'Operação',subtitle:'Avanço físico, aprovação e faturamento',roles:['owner','project_user'],fields:[['workId','Obra','work',1],['date','Data','date',1],['number','Número','text',1],['description','Descrição','textarea',1],['physical','Avanço físico (%)','number'],['value','Valor medido','number'],['contractId','Contrato (opcional)','contract'],['budgetId','Item do orçamento (opcional)','budget'],['retention','Retenção contratual (%)','number'],['deduction','Glosa (R$)','number'],['memo','Memória de cálculo','textarea'],['status','Status','select',1,['Pendente','Aprovada','Faturada','Paga']]]},
 budgets:{title:'Orçamentos',icon:'💰',group:'Planejamento',subtitle:'Custos diretos, BDI e preço de venda',roles:['owner','project_user'],fields:[['workId','Obra','work',1],['category','Categoria','text',1],['description','Serviço ou material','textarea',1],['unit','Unidade','text'],['qty','Quantidade','number'],['unitValue','Valor unitário','number'],['bdi','BDI (%)','number']]},
 activities:{title:'Cronograma',icon:'📅',group:'Planejamento',subtitle:'Cronograma Gantt avançado — anos, meses, dias, duração, quantidades e linha do tempo',roles:['owner','project_user'],fields:[['workId','Obra','work',1],['wbs','EAP / WBS','text'],['name','Atividade','text',1],['start','Início','date',1],['end','Fim','date',1],['durationDays','Dias úteis','number'],['progressMode','Controle de avanço','select',1,['Percentual','Quantidade']],['progress','Progresso (%)','number'],['plannedQty','Quantidade planejada','number'],['actualQty','Quantidade executada','number'],['unit','Unidade','text'],['predecessors','Predecessoras','text'],['responsible','Responsável','text'],['budgetId','Item do orçamento (opcional)','budget'],['status','Status','select',1,['Não iniciada','Em andamento','Atrasada','Concluída']]]},
 dailyLogs:{title:'Diário de Obra',icon:'📓',group:'Operação',subtitle:'Registro diário (RDO): clima, equipes, serviços executados e ocorrências',roles:['owner','project_user'],fields:[['workId','Obra','work',1],['date','Data','date',1],['weather','Clima','select',1,['Bom','Nublado','Chuva fraca','Chuva forte']],['workable','Dia trabalhável','select',1,['Sim','Parcial','Não']],['laborCount','Mão de obra (pessoas)','number'],['equipmentCount','Equipamentos em operação','number'],['activityId','Atividade principal do dia (opcional)','activity'],['progressTo','Avanço acumulado da atividade (%)','number'],['services','Serviços executados','textarea',1],['occurrences','Ocorrências e impedimentos','textarea'],['responsible','Responsável','text'],['status','Status','select',1,['Rascunho','Assinado']]]},
 suppliers:{title:'Fornecedores',icon:'🏪',group:'Suprimentos',subtitle:'Base qualificada de fornecedores',roles:['owner'],fields:[['name','Nome ou razão social','text',1],['cnpj','CNPJ','text'],['phone','Telefone','text'],['email','E-mail','email'],['category','Categoria','text'],['status','Status','select',1,['Ativo','Bloqueado','Inativo']]]},
 orders:{title:'Compras',icon:'🛒',group:'Suprimentos',subtitle:'Pedidos, entregas e aprovações',roles:['owner','project_user'],fields:[['workId','Obra','work',1],['supplierId','Fornecedor','supplier'],['date','Data','date',1],['dueDate','Prazo de entrega','date'],['description','Itens ou descrição','textarea',1],['inventoryId','Material do estoque (opcional)','inventory'],['qty','Quantidade do material (opcional)','number'],['value','Valor total','number'],['status','Status','select',1,['Solicitado','Em cotação','Aguardando aprovação','Aprovado','Entregue','Cancelado']]]},
 inventory:{title:'Estoque de Materiais',icon:'📦',group:'Suprimentos',subtitle:'Estoque mínimo, máximo, segurança, ponto de pedido e Curva ABC',roles:['owner','project_user'],fields:[['workId','Obra','work',1],['date','Data de referência','date',1],['material','Material / insumo','text',1],['category','Categoria','text'],['unit','Unidade','text',1],['currentStock','Estoque atual','number',1],['minStock','Estoque mínimo','number',1],['maxStock','Estoque máximo','number',1],['safetyStock','Estoque de segurança','number'],['avgDailyConsumption','Consumo médio diário','number'],['leadTimeDays','Prazo de reposição (dias)','number'],['reorderPoint','Ponto de pedido manual','number'],['anticipationStock','Estoque de antecipação','number'],['unitValue','Valor unitário','number']]},
 finance:{title:'Financeiro',icon:'💵',group:'Financeiro',subtitle:'Receitas, despesas e fluxo de caixa',roles:['owner','project_user'],fields:[['workId','Obra','work',1],['date','Competência','date',1],['dueDate','Vencimento','date'],['paymentDate','Liquidação (pagamento/recebimento)','date'],['description','Descrição','text',1],['type','Tipo','select',1,['Receita','Despesa']],['category','Categoria','text',1],['value','Valor','number'],['status','Status','select',1,['Previsto','Pendente','Pago','Recebido','Vencido']],['measurementId','Medição de origem (opcional)','measurement'],['orderId','Pedido de origem (opcional)','order'],['contractId','Contrato (opcional)','contract']]},
 quality:{title:'Qualidade',icon:'✅',group:'Conformidade',subtitle:'Não conformidades e planos de ação',roles:['owner','project_user'],fields:[['workId','Obra','work',1],['date','Data','date',1],['stage','Etapa ou serviço','text'],['issue','Não conformidade','textarea',1],['responsible','Responsável','text'],['deadline','Prazo','date'],['severity','Severidade','select',1,['Crítica','Maior','Menor']],['status','Status','select',1,['Aberta','Em andamento','Resolvida']]]},
 contracts:{title:'Contratos',icon:'📜',group:'Financeiro',subtitle:'Vigências, valores e vencimentos',roles:['owner','project_user'],fields:[['workId','Obra','work',1],['number','Número','text',1],['party','Contraparte','text',1],['object','Objeto','textarea',1],['start','Início','date'],['end','Fim','date'],['value','Valor','number'],['addendum','Aditivos acumulados (R$)','number'],['addendumNote','Motivo dos aditivos','textarea'],['status','Status','select',1,['Ativo','Suspenso','Encerrado']]]},
 staff:{title:'Pessoal',icon:'👷',group:'Administração',subtitle:'Equipe, funções, custos e alocação',roles:['owner','project_user'],fields:[['name','Nome','text',1],['role','Função','text',1],['cpf','CPF','text'],['birthDate','Nascimento','date'],['cbo','CBO (código da ocupação)','text'],['admission','Admissão','date'],['salary','Salário','number'],['workId','Obra alocada','work'],['status','Status','select',1,['Ativo','Férias','Inativo']]]},
 equipment:{title:'Equipamentos',icon:'🔧',group:'Operação',subtitle:'Patrimônio, custos, horímetro e manutenção',roles:['owner','project_user'],fields:[['name','Equipamento','text',1],['code','Patrimônio ou código','text',1],['workId','Obra alocada','work'],['startDate','Início de alocação','date'],['monthlyCost','Custo mensal','number'],['hourmeter','Horímetro','number'],['nextMaintenance','Próxima manutenção','date'],['status','Status','select',1,['Operacional','Manutenção','Parado']]]},
 safety:{title:'Segurança',icon:'⚠️',group:'Conformidade',subtitle:'DDS, inspeções, incidentes e treinamentos',roles:['owner','project_user'],fields:[['workId','Obra','work',1],['date','Data','date',1],['type','Tipo','select',1,['DDS','Inspeção','Incidente','Treinamento']],['description','Descrição','textarea',1],['responsible','Responsável','text'],['status','Status','select',1,['Aberto','Em acompanhamento','Concluído']]]},
 documents:{title:'Documentos',icon:'📁',group:'Administração',subtitle:'Arquivos, revisões, vencimentos e aprovações',roles:['owner','project_user'],fields:[['workId','Obra','work'],['name','Nome do documento','text',1],['category','Categoria','text',1],['date','Data','date'],['expiry','Vencimento','date'],['revision','Revisão','text'],['status','Status','select',1,['Rascunho','Em aprovação','Aprovado','Vencido']],['reference','Link HTTPS','url'],['file','Enviar arquivo','file'],['notes','Observações','textarea']]}
} satisfies Record<string, EsquemaModulo>;

export type IdModulo = keyof typeof ESQUEMAS;
export const MODULOS = Object.keys(ESQUEMAS) as IdModulo[];

/** Tipo de campo de referência → coleção apontada. */
export const COLECAO_DA_REFERENCIA: Partial<Record<TipoCampo, IdModulo>> = {
  work: 'works', contract: 'contracts', budget: 'budgets', activity: 'activities',
  supplier: 'suppliers', inventory: 'inventory', measurement: 'measurements', order: 'orders',
};

/** Grupos na ordem em que aparecem no menu. */
export const GRUPOS_MODULOS: string[] = [...new Set(MODULOS.map((m) => ESQUEMAS[m].group))];

/** Nome legível de um registro, para listas de seleção e colunas de referência. */
export function rotuloRegistro(modulo: IdModulo, r: Record<string, unknown>): string {
  const s = (k: string) => (r[k] == null ? '' : String(r[k]));
  switch (modulo) {
    case 'works': case 'suppliers': case 'staff': case 'documents': return s('name');
    case 'equipment': return [s('code'), s('name')].filter(Boolean).join(' — ');
    case 'contracts': return [s('number'), s('party')].filter(Boolean).join(' — ');
    case 'measurements': return [s('number'), s('description')].filter(Boolean).join(' — ');
    case 'activities': return [s('wbs'), s('name')].filter(Boolean).join(' ');
    case 'inventory': return s('material');
    case 'budgets': case 'orders': case 'finance': case 'safety': return s('description');
    case 'quality': return s('issue');
    case 'dailyLogs': return [s('date').split('-').reverse().join('/'), s('services')].filter(Boolean).join(' — ');
    default: return s('name') || s('description');
  }
}
