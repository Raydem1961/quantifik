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
};

export const DEMO_USER: Member = { uid: 'demo-user', nome: 'Você (demo)', email: 'demo@exemplo.com', role: 'socio_diretor', ativo: true };

export const DEMO_PROJECTS: Project[] = [
  { id: 'p1', codigo: 'RES-041', nome: 'Residência Alto da Colina', clientId: 'c1', clienteNome: 'Cliente A', tipologia: 'residencial', status: 'anteprojeto', uf: 'BA', municipio: 'Salvador', disciplinas: ['arquitetonico', 'estrutural', 'hidrossanitario', 'eletrico'], areaConstruidaM2: 420, valorContratado: 96000, inicio: iso(-70), fim: iso(60), progresso: 45, clienteUids: [] },
  { id: 'p2', codigo: 'COM-017', nome: 'Edifício Comercial Orla', clientId: 'c2', clienteNome: 'Cliente B', tipologia: 'comercial', status: 'projeto_executivo', uf: 'BA', municipio: 'Lauro de Freitas', disciplinas: ['arquitetonico', 'estrutural', 'hidrossanitario', 'eletrico', 'terraplenagem'], areaConstruidaM2: 3800, valorContratado: 412000, inicio: iso(-150), fim: iso(35), progresso: 78, clienteUids: [] },
  { id: 'p3', codigo: 'IND-006', nome: 'Galpão Logístico BR-324', clientId: 'c3', clienteNome: 'Cliente C', tipologia: 'industrial', status: 'estudo_preliminar', uf: 'BA', municipio: 'Simões Filho', disciplinas: ['arquitetonico', 'estrutural', 'eletrico', 'terraplenagem'], areaConstruidaM2: 6200, valorContratado: 238000, inicio: iso(-20), fim: iso(140), progresso: 15, clienteUids: [] },
  { id: 'p4', codigo: 'INF-003', nome: 'Loteamento Reserva das Águas', clientId: 'c4', clienteNome: 'Cliente D', tipologia: 'infraestrutura', status: 'aprovacao', uf: 'BA', municipio: 'Camaçari', disciplinas: ['terraplenagem', 'hidrossanitario', 'eletrico'], areaConstruidaM2: 0, valorContratado: 185000, inicio: iso(-200), fim: iso(12), progresso: 92, clienteUids: [] },
  { id: 'p5', codigo: 'RES-044', nome: 'Casa de Praia Guarajuba', clientId: 'c5', clienteNome: 'Cliente E', tipologia: 'residencial', status: 'briefing', uf: 'BA', municipio: 'Camaçari', disciplinas: ['arquitetonico'], areaConstruidaM2: 310, valorContratado: 54000, inicio: iso(-5), fim: iso(110), progresso: 5, clienteUids: [] },
  { id: 'p6', codigo: 'RES-038', nome: 'Reforma Cobertura Barra', clientId: 'c6', clienteNome: 'Cliente F', tipologia: 'residencial', status: 'concluido', uf: 'BA', municipio: 'Salvador', disciplinas: ['arquitetonico', 'eletrico'], areaConstruidaM2: 180, valorContratado: 38000, inicio: iso(-240), fim: iso(-25), progresso: 100, clienteUids: [] },
];

export const DEMO_ART: ArtRrt[] = [
  { id: 'a1', projectId: 'p2', projetoNome: 'Edifício Comercial Orla', tipo: 'ART', disciplina: 'estrutural', etapa: 'Projeto executivo', responsavel: 'Eng. Responsável Demo', status: 'a_emitir', valorTaxa: 271.47, vencimento: iso(-2) },
  { id: 'a2', projectId: 'p1', projetoNome: 'Residência Alto da Colina', tipo: 'RRT', disciplina: 'arquitetonico', etapa: 'Anteprojeto', responsavel: 'Arq. Demo', status: 'emitida', valorTaxa: 125.38, vencimento: iso(4) },
  { id: 'a3', projectId: 'p3', projetoNome: 'Galpão Logístico BR-324', tipo: 'ART', disciplina: 'terraplenagem', etapa: 'Estudo preliminar', responsavel: 'Eng. Responsável Demo', status: 'a_emitir', valorTaxa: 108.69, vencimento: iso(18) },
  { id: 'a4', projectId: 'p4', projetoNome: 'Loteamento Reserva das Águas', tipo: 'ART', disciplina: 'hidrossanitario', etapa: 'Aprovação', numero: 'BA20260000000', responsavel: 'Eng. Responsável Demo', status: 'vinculada', valorTaxa: 271.47, vencimento: iso(-40) },
];

const h = (projectId: string, disciplina: TimesheetEntry['disciplina'], horas: number, i: number): TimesheetEntry => ({
  id: `t${projectId}${i}`, projectId, uid: 'demo-user', nome: 'Equipe', disciplina, descricao: 'Lançamento demo', inicio: new Date(hoje.getTime() - i * 86400000).toISOString(), minutos: horas * 60,
});
export const DEMO_TIMESHEETS: TimesheetEntry[] = [
  h('p1', 'arquitetonico', 310, 1), h('p1', 'estrutural', 120, 2), h('p1', 'eletrico', 40, 3),
  h('p2', 'arquitetonico', 1450, 1), h('p2', 'estrutural', 1320, 2), h('p2', 'hidrossanitario', 780, 3), h('p2', 'eletrico', 690, 4),
  h('p3', 'arquitetonico', 190, 1), h('p3', 'terraplenagem', 85, 2),
  h('p4', 'terraplenagem', 1100, 1), h('p4', 'hidrossanitario', 640, 2), h('p4', 'eletrico', 420, 3),
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
