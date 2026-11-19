/**
 * Dados do MODO DEMONSTRAÇÃO (sem Firebase configurado). Tudo aqui é fictício.
 * Os valores de CUB são ILUSTRATIVOS — não são os publicados pelos Sinduscons.
 */
import type { CubEntry, CubProjectCode, CubTable } from './cub/engine';
import type { AppNotification, ArtRrt, CadFile, Member, Project, Tenant, TimesheetEntry } from './types';

const hoje = new Date();
const iso = (dias: number) => new Date(hoje.getTime() + dias * 86400000).toISOString().slice(0, 10);

export const DEMO_TENANT: Tenant = {
  id: 'demo', razaoSocial: 'Atelier Demonstração Engenharia Ltda.', nomeFantasia: 'Atelier Demo', cnpj: '00.000.000/0001-00', uf: 'BA',
  branding: { corPrimaria: '#3b4cca', corSecundaria: '#111827' },
  responsavelTecnico: { nome: 'Eng. Responsável Demo', conselho: 'CREA', registro: 'CREA-BA 000000' },
  custoHoraTecnica: 95,
  contato: { endereco: 'Av. Tancredo Neves, 1000 — Salvador/BA', telefone: '(71) 3000-0000', email: 'contato@atelierdemo.com.br', engenheiroPadrao: 'Eng. Responsável Demo' },
};

export const DEMO_USER: Member = { uid: 'demo-user', nome: 'Você (demo)', email: 'demo@exemplo.com', role: 'socio_diretor', ativo: true };

export const DEMO_PROJECTS: Project[] = [
  { id: 'p1', codigo: 'RES-041', nome: 'Residência Alto da Colina', clientId: 'c1', clienteNome: 'Cliente A', tipologia: 'residencial', status: 'anteprojeto', uf: 'BA', municipio: 'Salvador', disciplinas: ['arquitetonico', 'estrutural', 'hidrossanitario', 'eletrico'], areaConstruidaM2: 420, valorContratado: 96000, inicio: iso(-70), fim: iso(60), progresso: 45, clienteUids: [] },
  { id: 'p2', codigo: 'COM-017', nome: 'Edifício Comercial Orla', clientId: 'c2', clienteNome: 'Cliente B', tipologia: 'comercial', status: 'projeto_executivo', uf: 'BA', municipio: 'Lauro de Freitas', disciplinas: ['arquitetonico', 'estrutural', 'hidrossanitario', 'eletrico', 'terraplenagem'], areaConstruidaM2: 3800, valorContratado: 412000, inicio: iso(-150), fim: iso(35), progresso: 78, clienteUids: [] },
  { id: 'p3', codigo: 'IND-006', nome: 'Galpão Logístico BR-324', clientId: 'c3', clienteNome: 'Cliente C', tipologia: 'industrial', status: 'estudo_preliminar', uf: 'BA', municipio: 'Simões Filho', disciplinas: ['arquitetonico', 'estrutural', 'eletrico', 'terraplenagem'], areaConstruidaM2: 6200, valorContratado: 238000, inicio: iso(-20), fim: iso(140), progresso: 15, clienteUids: [] },
  { id: 'p4', codigo: 'INF-003', nome: 'Loteamento Reserva das Águas', clientId: 'c4', clienteNome: 'Cliente D', tipologia: 'loteamento', status: 'aprovacao', uf: 'BA', municipio: 'Camaçari', disciplinas: ['topografia', 'urbanismo', 'terraplenagem', 'pavimentacao', 'drenagem', 'esgotamento', 'abastecimento_agua'], areaConstruidaM2: 0, valorContratado: 185000, inicio: iso(-200), fim: iso(12), progresso: 92, clienteUids: [] },
  { id: 'p5', codigo: 'RES-044', nome: 'Casa de Praia Guarajuba', clientId: 'c5', clienteNome: 'Cliente E', tipologia: 'residencial', status: 'briefing', uf: 'BA', municipio: 'Camaçari', disciplinas: ['arquitetonico'], areaConstruidaM2: 310, valorContratado: 54000, inicio: iso(-5), fim: iso(110), progresso: 5, clienteUids: [] },
  { id: 'p6', codigo: 'RES-038', nome: 'Reforma Cobertura Barra', clientId: 'c6', clienteNome: 'Cliente F', tipologia: 'residencial', status: 'concluido', uf: 'BA', municipio: 'Salvador', disciplinas: ['arquitetonico', 'eletrico'], areaConstruidaM2: 180, valorContratado: 38000, inicio: iso(-240), fim: iso(-25), progresso: 100, clienteUids: [] },
];

export const DEMO_ART: ArtRrt[] = [
  { id: 'a1', projectId: 'p2', projetoNome: 'Edifício Comercial Orla', tipo: 'ART', disciplina: 'estrutural', etapa: 'Projeto executivo', responsavel: 'Eng. Responsável Demo', status: 'a_emitir', valorTaxa: 271.47, vencimento: iso(-2) },
  { id: 'a2', projectId: 'p1', projetoNome: 'Residência Alto da Colina', tipo: 'RRT', disciplina: 'arquitetonico', etapa: 'Anteprojeto', responsavel: 'Arq. Demo', status: 'emitida', valorTaxa: 125.38, vencimento: iso(4) },
  { id: 'a3', projectId: 'p3', projetoNome: 'Galpão Logístico BR-324', tipo: 'ART', disciplina: 'terraplenagem', etapa: 'Estudo preliminar', responsavel: 'Eng. Responsável Demo', status: 'a_emitir', valorTaxa: 108.69, vencimento: iso(18) },
  { id: 'a4', projectId: 'p4', projetoNome: 'Loteamento Reserva das Águas', tipo: 'ART', disciplina: 'esgotamento', etapa: 'Aprovação', numero: 'BA20260000000', responsavel: 'Eng. Responsável Demo', status: 'vinculada', valorTaxa: 271.47, vencimento: iso(-40) },
];

const h = (projectId: string, disciplina: TimesheetEntry['disciplina'], horas: number, i: number): TimesheetEntry => ({
  id: `t${projectId}${i}`, projectId, uid: 'demo-user', nome: 'Equipe', disciplina, descricao: 'Lançamento demo', inicio: new Date(hoje.getTime() - i * 86400000).toISOString(), minutos: horas * 60,
});
export const DEMO_TIMESHEETS: TimesheetEntry[] = [
  h('p1', 'arquitetonico', 310, 1), h('p1', 'estrutural', 120, 2), h('p1', 'eletrico', 40, 3),
  h('p2', 'arquitetonico', 1450, 1), h('p2', 'estrutural', 1320, 2), h('p2', 'hidrossanitario', 780, 3), h('p2', 'eletrico', 690, 4),
  h('p3', 'arquitetonico', 190, 1), h('p3', 'terraplenagem', 85, 2),
  h('p4', 'terraplenagem', 1100, 1), h('p4', 'esgotamento', 640, 2), h('p4', 'drenagem', 420, 3),
  h('p5', 'arquitetonico', 22, 1), h('p6', 'arquitetonico', 260, 30), h('p6', 'eletrico', 70, 31),
];

export const DEMO_NOTIFICATIONS: AppNotification[] = [
  { id: 'n1', tipo: 'cad_atualizado', titulo: 'EST-FORMAS-T01.dwg — revisão R03', mensagem: 'Arquivo de estrutural atualizado no Edifício Comercial Orla.', projectId: 'p2', criadoEm: new Date(hoje.getTime() - 3600e3).toISOString(), lidaPor: [] },
  { id: 'n2', tipo: 'orcamento_aprovado', titulo: 'Orçamento aprovado', mensagem: 'Cliente A aprovou o cenário Luxo da Residência Alto da Colina.', projectId: 'p1', criadoEm: new Date(hoje.getTime() - 26 * 3600e3).toISOString(), lidaPor: [] },
  { id: 'n3', tipo: 'art_vencendo', titulo: 'ART a emitir — Edifício Comercial Orla', mensagem: 'ART de estrutural (Projeto executivo) está vencida.', projectId: 'p2', criadoEm: new Date(hoje.getTime() - 30 * 3600e3).toISOString(), lidaPor: ['demo-user'] },
];

export const DEMO_FILES: CadFile[] = [
  { id: 'f1', nome: 'ARQ-PLANTA-TERREO.dxf', disciplina: 'arquitetonico', extensao: 'dxf', revisaoAtual: 'R02', totalRevisoes: 3, atualizadoEm: iso(-1), atualizadoPor: 'Equipe' },
  { id: 'f2', nome: 'EST-FORMAS-T01.dwg', disciplina: 'estrutural', extensao: 'dwg', revisaoAtual: 'R03', totalRevisoes: 4, atualizadoEm: iso(0), atualizadoPor: 'Equipe' },
  { id: 'f3', nome: 'TER-VOLUMES.csv', disciplina: 'terraplenagem', extensao: 'csv', revisaoAtual: 'R00', totalRevisoes: 1, atualizadoEm: iso(-9), atualizadoPor: 'Equipe' },
];

// ── CUB ilustrativo ─────────────────────────────────────────────────────────
const comp = (total: number): CubEntry => ({
  total, materiais: +(total * 0.52).toFixed(2), maoDeObra: +(total * 0.42).toFixed(2),
  despesasAdministrativas: +(total * 0.045).toFixed(2), equipamentos: +(total - +(total * 0.52).toFixed(2) - +(total * 0.42).toFixed(2) - +(total * 0.045).toFixed(2)).toFixed(2),
});
const RELATIVOS: Record<CubProjectCode, number> = {
  'R1-B': 0.86, 'R1-N': 1, 'R1-A': 1.27, 'PP-4-B': 0.8, 'PP-4-N': 0.95, 'R8-B': 0.77, 'R8-N': 0.84, 'R8-A': 1.03, 'R16-N': 0.82, 'R16-A': 1.07,
  PIS: 0.58, RP1Q: 0.87, 'CAL-8-N': 0.98, 'CAL-8-A': 1.06, 'CSL-8-N': 0.85, 'CSL-8-A': 0.94, 'CSL-16-N': 1.13, 'CSL-16-A': 1.24, GI: 0.47,
};
const tabelaDemo = (uf: string, fonte: string, baseR1N: number): CubTable => ({
  uf, fonte, competencia: `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`, desonerado: false, ilustrativo: true,
  valores: Object.fromEntries(Object.entries(RELATIVOS).map(([k, r]) => [k, comp(+(baseR1N * r).toFixed(2))])) as CubTable['valores'],
});
export const DEMO_CUB: CubTable[] = [
  tabelaDemo('BA', 'SINDUSCON-BA (ilustrativo)', 2350), tabelaDemo('SP', 'SINDUSCON-SP (ilustrativo)', 2600),
  tabelaDemo('MG', 'SINDUSCON-MG (ilustrativo)', 2500), tabelaDemo('RJ', 'SINDUSCON-RIO (ilustrativo)', 2550),
  tabelaDemo('PR', 'SINDUSCON-PR (ilustrativo)', 2650), tabelaDemo('SC', 'SINDUSCON-SC (ilustrativo)', 2900),
];

// ── DXF de exemplo (planta 12 × 9 m em metros) ──────────────────────────────
const L: (string | number)[] = [0, 'SECTION', 2, 'HEADER', 9, '$INSUNITS', 70, 6, 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES'];
const pl = (layer: string, pts: [number, number][], fechada = true) => {
  L.push(0, 'LWPOLYLINE', 8, layer, 90, pts.length, 70, fechada ? 1 : 0);
  pts.forEach(([x, y]) => L.push(10, x, 20, y));
};
const txt = (x: number, y: number, s: string) => L.push(0, 'TEXT', 8, 'A-TEXTO', 10, x, 20, y, 40, 0.3, 1, s);
pl('A-AREA-PRIV', [[0, 0], [12, 0], [12, 9], [0, 9]]);
pl('A-AREA-GARAGEM', [[12, 0], [18, 0], [18, 6], [12, 6]]);
pl('A-AREA-VARANDA', [[0, 9], [12, 9], [12, 11.5], [0, 11.5]]);
pl('A-AREA-JARDIM', [[-4, -5], [22, -5], [22, 0], [-4, 0]]);
L.push(0, 'CIRCLE', 8, 'A-AREA-PISCINA', 10, 17, 20, 9.5, 40, 2.2);
pl('A-PAREDE', [[0, 4.5], [7, 4.5], [7, 9]], false);
pl('A-PAREDE', [[7, 4.5], [7, 0]], false);
pl('A-PAREDE', [[7, 2.2], [12, 2.2]], false);
for (const [x, y] of [[2, 4.5], [7, 6.5], [7, 1.2], [9.5, 2.2], [12, 3]] as [number, number][]) L.push(0, 'INSERT', 8, 'A-ESQUADRIA', 2, 'PORTA-80', 10, x, 20, y);
for (const [x, y] of [[3, 0], [9, 0], [3, 9], [9, 9], [0, 2], [0, 7]] as [number, number][]) L.push(0, 'INSERT', 8, 'A-ESQUADRIA', 2, 'JANELA-150', 10, x, 20, y);
txt(2.2, 6.6, 'ESTAR / JANTAR'); txt(8.3, 6.6, 'SUITE'); txt(2.4, 2, 'COZINHA'); txt(8.4, 0.9, 'BANHO'); txt(13.6, 2.8, 'GARAGEM'); txt(4.2, 10.1, 'VARANDA'); txt(15.9, 9.4, 'PISCINA');
L.push(0, 'ENDSEC', 0, 'EOF');
export const DEMO_DXF = L.join('\n') + '\n';

// ── Gestão de obras (mesmos campos do ObraTop) ─────────────────────────────
type Reg = { id: string } & Record<string, unknown>;
export const DEMO_OBRA: Record<string, Reg[]> = {
  works: [
    { id: 'w1', name: 'Residencial Jardim das Acácias', client: 'Cliente A', address: 'Salvador/BA', start: iso(-60), end: iso(120), value: 1850000, status: 'Em andamento', progress: 32, engineer: 'Eng. Responsável Demo' },
    { id: 'w2', name: 'Pavimentação Rua das Palmeiras', client: 'Cliente D', address: 'Camaçari/BA', start: iso(-20), end: iso(70), value: 640000, status: 'Em andamento', progress: 18, engineer: 'Eng. Responsável Demo' },
  ],
  activities: [
    { id: 'at1', workId: 'w1', wbs: '1.1', name: 'Serviços preliminares e canteiro', start: iso(-60), end: iso(-46), durationDays: 11, progressMode: 'Percentual', progress: 100, predecessors: '', status: 'Concluída', responsible: 'Mestre A' },
    { id: 'at2', workId: 'w1', wbs: '1.2', name: 'Fundações', start: iso(-45), end: iso(-18), durationDays: 20, progressMode: 'Percentual', progress: 100, predecessors: '1.1', status: 'Concluída', responsible: 'Mestre A' },
    { id: 'at3', workId: 'w1', wbs: '2.1', name: 'Estrutura — pavimento térreo', start: iso(-17), end: iso(12), durationDays: 21, progressMode: 'Percentual', progress: 55, predecessors: '1.2', status: 'Em andamento', responsible: 'Mestre B' },
    { id: 'at4', workId: 'w1', wbs: '2.2', name: 'Estrutura — pavimento superior', start: iso(13), end: iso(44), durationDays: 23, progressMode: 'Percentual', progress: 0, predecessors: '2.1', status: 'Não iniciada', responsible: 'Mestre B' },
    { id: 'at5', workId: 'w1', wbs: '3.1', name: 'Alvenaria de vedação', start: iso(20), end: iso(70), durationDays: 37, progressMode: 'Percentual', progress: 0, predecessors: '2.1SS+10d', status: 'Não iniciada', responsible: 'Mestre C' },
    { id: 'at6', workId: 'w1', wbs: '3.2', name: 'Instalações elétricas e hidráulicas', start: iso(45), end: iso(95), durationDays: 37, progressMode: 'Percentual', progress: 0, predecessors: '2.2', status: 'Não iniciada', responsible: 'Equipe D' },
    { id: 'at7', workId: 'w1', wbs: '4.1', name: 'Revestimentos e acabamentos', start: iso(71), end: iso(120), durationDays: 36, progressMode: 'Percentual', progress: 0, predecessors: '3.1;3.2FF', status: 'Não iniciada', responsible: 'Mestre C' },
    { id: 'at8', workId: 'w2', wbs: '1.1', name: 'Terraplenagem e regularização do subleito', start: iso(-20), end: iso(5), durationDays: 18, progressMode: 'Quantidade', progress: 60, plannedQty: 4200, actualQty: 2520, unit: 'm²', predecessors: '', status: 'Em andamento', responsible: 'Encarregado E' },
    { id: 'at9', workId: 'w2', wbs: '1.2', name: 'Base e sub-base', start: iso(6), end: iso(35), durationDays: 22, progressMode: 'Percentual', progress: 0, predecessors: '1.1', status: 'Não iniciada', responsible: 'Encarregado E' },
    { id: 'at10', workId: 'w2', wbs: '1.3', name: 'Revestimento asfáltico e sinalização', start: iso(36), end: iso(70), durationDays: 25, progressMode: 'Percentual', progress: 0, predecessors: '1.2', status: 'Não iniciada', responsible: 'Encarregado E' },
  ],
  budgets: [
    { id: 'b1', workId: 'w1', category: 'Estrutura', description: 'Concreto, fôrmas e armação', unit: 'vb', qty: 1, unitValue: 520000, bdi: 25 },
    { id: 'b2', workId: 'w1', category: 'Vedações', description: 'Alvenaria de vedação', unit: 'm²', qty: 1450, unitValue: 92, bdi: 25 },
    { id: 'b3', workId: 'w2', category: 'Pavimentação', description: 'Base, sub-base e CBUQ', unit: 'm²', qty: 4200, unitValue: 98, bdi: 22 },
  ],
  contracts: [{ id: 'k1', workId: 'w1', number: 'CT-012/2026', party: 'Cliente A', object: 'Construção do residencial', start: iso(-60), end: iso(120), value: 1850000, addendum: 45000, addendumNote: 'Acréscimo de muro de arrimo', status: 'Ativo' }],
  measurements: [
    { id: 'm1', workId: 'w1', date: iso(-30), number: '001', description: '1ª medição — serviços preliminares e fundações', physical: 14, value: 262000, contractId: 'k1', retention: 5, deduction: 0, status: 'Paga' },
    { id: 'm2', workId: 'w1', date: iso(-2), number: '002', description: '2ª medição — estrutura do térreo', physical: 12, value: 228000, contractId: 'k1', retention: 5, deduction: 3500, status: 'Aprovada' },
  ],
  finance: [
    { id: 'f1', workId: 'w1', date: iso(-28), dueDate: iso(-20), paymentDate: iso(-20), description: 'Recebimento da 1ª medição', type: 'Receita', category: 'Medição', value: 248900, status: 'Recebido', measurementId: 'm1' },
    { id: 'f2', workId: 'w1', date: iso(-25), dueDate: iso(-15), paymentDate: iso(-15), description: 'Concreto usinado — fundações', type: 'Despesa', category: 'Materiais', value: 96500, status: 'Pago' },
    { id: 'f3', workId: 'w1', date: iso(-10), dueDate: iso(5), description: 'Aço CA-50', type: 'Despesa', category: 'Materiais', value: 74200, status: 'Pendente' },
    { id: 'f4', workId: 'w1', date: iso(-5), dueDate: iso(10), description: 'Folha de pagamento da obra', type: 'Despesa', category: 'Mão de obra', value: 58000, status: 'Pendente' },
    { id: 'f5', workId: 'w1', date: iso(-2), dueDate: iso(18), description: 'Recebimento da 2ª medição', type: 'Receita', category: 'Medição', value: 213100, status: 'Previsto', measurementId: 'm2' },
  ],
  inventory: [{ id: 'i1', workId: 'w1', date: iso(0), material: 'Cimento CP II-32', category: 'Aglomerantes', unit: 'sc', currentStock: 40, minStock: 60, maxStock: 300, safetyStock: 30, avgDailyConsumption: 12, leadTimeDays: 3, unitValue: 38 }],
  suppliers: [{ id: 's1', name: 'Fornecedor Demo Ltda.', cnpj: '00.000.000/0001-00', category: 'Materiais básicos', status: 'Ativo' }],
  orders: [
    { id: 'o1', workId: 'w1', supplierId: 's1', date: iso(-6), dueDate: iso(4), description: 'Aço CA-50 10 mm e 12,5 mm', value: 74200, status: 'Aprovado' },
    { id: 'o2', workId: 'w1', supplierId: 's1', date: iso(-1), dueDate: iso(6), description: 'Cimento CP II-32 — 200 sacos', inventoryId: 'i1', qty: 200, value: 7600, status: 'Aguardando aprovação' },
    { id: 'o3', workId: 'w2', supplierId: 's1', date: iso(-3), dueDate: iso(9), description: 'Brita graduada simples — 320 m³', value: 41600, status: 'Em cotação' },
  ],
  staff: [
    { id: 'p1', name: 'Engenheira Residente Demo', role: 'Engenheira civil', cpf: '529.982.247-25', birthDate: '1988-03-14', cbo: '214205', admission: iso(-700), salary: 12500, workId: 'w1', status: 'Ativo' },
    { id: 'p2', name: 'Mestre de Obras Demo', role: 'Mestre de obras', admission: iso(-420), salary: 6800, workId: 'w1', status: 'Ativo' },
    { id: 'p3', name: 'Encarregado Demo', role: 'Encarregado de pavimentação', admission: iso(-200), salary: 5200, workId: 'w2', status: 'Ativo' },
    { id: 'p4', name: 'Técnica de Segurança Demo', role: 'Técnica de segurança', admission: iso(-150), salary: 4900, status: 'Ativo' },
    { id: 'p5', name: 'Almoxarife Demo', role: 'Almoxarife', admission: iso(-90), salary: 3100, workId: 'w1', status: 'Férias' },
  ],
  equipment: [
    { id: 'e1', name: 'Betoneira 400 L', code: 'EQ-014', workId: 'w1', startDate: iso(-58), monthlyCost: 650, hourmeter: 412, nextMaintenance: iso(5), status: 'Operacional' },
    { id: 'e2', name: 'Rolo compactador', code: 'EQ-031', workId: 'w2', startDate: iso(-18), monthlyCost: 9800, hourmeter: 1630, nextMaintenance: iso(21), status: 'Operacional' },
  ],
  quality: [
    { id: 'q1', workId: 'w1', date: iso(-4), stage: 'Estrutura — térreo', issue: 'Cobrimento de armadura abaixo do especificado no pilar P7', responsible: 'Mestre B', deadline: iso(3), severity: 'Crítica', status: 'Em andamento' },
    { id: 'q2', workId: 'w1', date: iso(-12), stage: 'Fundações', issue: 'Falha no registro de rastreabilidade do concreto', responsible: 'Engenheira Residente Demo', deadline: iso(-2), severity: 'Menor', status: 'Resolvida' },
  ],
  safety: [
    { id: 'g1', workId: 'w1', date: iso(-1), type: 'DDS', description: 'Trabalho em altura e uso do cinto', responsible: 'Técnica de Segurança Demo', status: 'Concluído' },
    { id: 'g2', workId: 'w1', date: iso(-7), type: 'Inspeção', description: 'Inspeção de andaimes e guarda-corpos', responsible: 'Técnica de Segurança Demo', status: 'Concluído' },
    { id: 'g3', workId: 'w2', date: iso(-3), type: 'Treinamento', description: 'NR-12 — operação de máquinas', responsible: 'Técnica de Segurança Demo', status: 'Concluído' },
  ],
  documents: [
    { id: 'd1', workId: 'w1', name: 'Alvará de construção', category: 'Licenças', date: iso(-70), expiry: iso(24), revision: 'R00', status: 'Aprovado' },
    { id: 'd2', workId: 'w1', name: 'PCMSO / PGR', category: 'Segurança', date: iso(-60), expiry: iso(300), revision: 'R01', status: 'Aprovado' },
    { id: 'd3', name: 'Certidão negativa de débitos', category: 'Fiscal', date: iso(-100), expiry: iso(80), revision: 'R00', status: 'Aprovado' },
  ],
  dailyLogs: [
    { id: 'r1', workId: 'w1', date: iso(-1), weather: 'Bom', workable: 'Sim', laborCount: 18, equipmentCount: 3, services: 'Armação e fôrmas das vigas do térreo', responsible: 'Mestre B', status: 'Assinado' },
    { id: 'r2', workId: 'w2', date: iso(-1), weather: 'Chuva fraca', workable: 'Parcial', laborCount: 9, equipmentCount: 4, services: 'Regularização do subleito — trecho 2', occurrences: 'Paralisação de 2 h por chuva', responsible: 'Encarregado E', status: 'Assinado' },
  ],
};
