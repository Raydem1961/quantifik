/**
 * Mapa do aplicativo: as áreas (módulos) e as telas de cada uma. Navegação lateral, tela inicial,
 * busca rápida (Ctrl+K) e páginas de área são todas desenhadas a partir daqui.
 */
import {
  BadgeDollarSign, Boxes, Briefcase, Building, Building2, CalendarRange, Calculator, ClipboardCheck, ClipboardList, Compass, FileSignature, FileText,
  FolderKanban, Gauge, Hammer, HardHat, Landmark, LayoutGrid, NotebookPen, Package, PenTool, Ruler, ScrollText, ShieldAlert, ShieldCheck, ShoppingCart,
  Store, Truck, KeySquare, Bell, LineChart, FileBarChart, ListChecks, Stethoscope, Scale, Users, UserCog, Wallet, Wrench, Banknote, Plug, Receipt, Contact, Handshake, MonitorSmartphone, DatabaseBackup, TrendingUp, type LucideIcon,
} from 'lucide-react';

export type IdArea = 'controle' | 'clientes' | 'integracoes' | 'comercial' | 'engenharia' | 'orcamento' | 'planejamento' | 'suprimentos' | 'financeiro' | 'rh' | 'qualidade' | 'administrativo';

export interface Tela { href: string; rotulo: string; icone: LucideIcon; descricao: string; soDono?: boolean; /** Só o administrador da plataforma (emite licenças). */ soPlataforma?: boolean }
export interface Area {
  id: IdArea;
  nome: string;
  resumo: string;
  icone: LucideIcon;
  /** Matiz (HSL) da cor de destaque da área — usada em ícones, faixas e gráficos de identidade. */
  matiz: number;
  telas: Tela[];
}

export const AREAS: Area[] = [
  { id: 'comercial', nome: 'Comercial', resumo: 'Do primeiro contato ao contrato assinado.', icone: Briefcase, matiz: 262, telas: [
    { href: '/briefing/', rotulo: 'Briefing', icone: ClipboardList, descricao: 'Programa de necessidades que vira escopo e entregáveis' },
    { href: '/composicoes/', rotulo: 'Cotações', icone: BadgeDollarSign, descricao: 'Cotação por cliente com PDF e BDI embutido' },
    { href: '/contratos/', rotulo: 'Propostas e contratos', icone: FileSignature, descricao: 'Modelo com cláusulas inteligentes e assinatura digital' },
  ] },
  { id: 'engenharia', nome: 'Engenharia e Arquitetura', resumo: 'Projetos, desenhos e modelos BIM.', icone: Compass, matiz: 212, telas: [
    { href: '/dashboard/', rotulo: 'Projetos', icone: FolderKanban, descricao: 'Kanban e Gantt da carteira, ART/RRT e horas técnicas' },
    { href: '/cad/', rotulo: 'CAD e revisões', icone: PenTool, descricao: 'Arquivos versionados, áreas por camada e marcações' },
    { href: '/quantitativos/', rotulo: 'BIM e quantitativos', icone: Boxes, descricao: 'IFC, DXF, redes e topografia precificados por composições' },
  ] },
  { id: 'orcamento', nome: 'Orçamento', resumo: 'Custos, composições e preço de venda.', icone: Calculator, matiz: 172, telas: [
    { href: '/composicoes/', rotulo: 'Serviços e composições', icone: Hammer, descricao: 'SINAPI-BA e ORSE-SE com pisos do Sinduscon-BA' },
    { href: '/orcamento/', rotulo: 'Orçamento pelo CUB', icone: Ruler, descricao: 'Área equivalente NBR 12721, padrões e Curva S' },
    { href: '/gestao/budgets/', rotulo: 'Orçamento da obra', icone: ScrollText, descricao: 'Itens, BDI e geração do cronograma' },
    { href: '/quantitativos/', rotulo: 'Orçamento analítico', icone: Boxes, descricao: 'Quantitativos de projeto × bases oficiais' },
  ] },
  { id: 'planejamento', nome: 'Planejamento e Obras', resumo: 'Cronograma, avanço e medições.', icone: HardHat, matiz: 28, telas: [
    { href: '/gestao/works/', rotulo: 'Obras', icone: Building2, descricao: 'Cadastro, desempenho e relatório gerencial' },
    { href: '/gestao/activities/', rotulo: 'Cronograma', icone: CalendarRange, descricao: 'Gantt, caminho crítico, linha de base e MS Project' },
    { href: '/gestao/dailyLogs/', rotulo: 'Diário de obra', icone: NotebookPen, descricao: 'Clima, equipes, serviços e ocorrências do dia' },
    { href: '/gestao/measurements/', rotulo: 'Medições', icone: Gauge, descricao: 'Avanço físico, retenção, glosa e faturamento' },
  ] },
  { id: 'suprimentos', nome: 'Suprimentos', resumo: 'Compras, estoque e equipamentos.', icone: Truck, matiz: 340, telas: [
    { href: '/gestao/orders/', rotulo: 'Compras', icone: ShoppingCart, descricao: 'Pedidos, prazos de entrega e aprovações' },
    { href: '/gestao/inventory/', rotulo: 'Estoque', icone: Package, descricao: 'Mínimo, máximo, ponto de pedido e valor' },
    { href: '/gestao/suppliers/', rotulo: 'Fornecedores', icone: Store, descricao: 'Base qualificada de fornecedores' },
    { href: '/gestao/equipment/', rotulo: 'Equipamentos', icone: Wrench, descricao: 'Patrimônio, horímetro e manutenção' },
  ] },
  { id: 'financeiro', nome: 'Financeiro', resumo: 'Caixa, contratos e resultado.', icone: Landmark, matiz: 150, telas: [
    { href: '/gestao/finance/', rotulo: 'Lançamentos', icone: Wallet, descricao: 'Receitas, despesas e fluxo de caixa projetado' },
    { href: '/gestao/contracts/', rotulo: 'Contratos de obra', icone: FileText, descricao: 'Valores, aditivos e saldo a medir' },
    { href: '/integracoes/bancos/', rotulo: 'Bancos e Pix', icone: Banknote, descricao: 'Conciliação do extrato (OFX) e cobrança por Pix' },
    { href: '/integracoes/fiscal/', rotulo: 'Notas fiscais e CNPJ', icone: Receipt, descricao: 'NF-e de compra vira fornecedor e contas a pagar' },
    { href: '/economia/', rotulo: 'Análise econômica', icone: TrendingUp, descricao: 'Margem estimada, Curva ABC de custos, sensibilidade e reajuste' },
  ] },
  { id: 'rh', nome: 'Recursos Humanos', resumo: 'Pessoas, alocação e horas.', icone: Users, matiz: 292, telas: [
    { href: '/gestao/staff/', rotulo: 'Pessoal', icone: Users, descricao: 'Equipe, funções, salários e alocação por obra' },
    { href: '/dashboard/', rotulo: 'Horas técnicas', icone: ClipboardCheck, descricao: 'Cronômetro por disciplina e margem real' },
    { href: '/integracoes/esocial/', rotulo: 'eSocial', icone: Contact, descricao: 'Conferência cadastral e planilha para a contabilidade' },
  ] },
  { id: 'qualidade', nome: 'Qualidade e Segurança', resumo: 'Conformidade, SST e documentos.', icone: ShieldCheck, matiz: 48, telas: [
    { href: '/gestao/quality/', rotulo: 'Qualidade', icone: ClipboardCheck, descricao: 'Não conformidades e planos de ação' },
    { href: '/gestao/safety/', rotulo: 'Segurança do trabalho', icone: ShieldAlert, descricao: 'DDS, inspeções, incidentes e treinamentos' },
    { href: '/gestao/documents/', rotulo: 'Documentos', icone: FileText, descricao: 'Arquivos, revisões, vencimentos e aprovações' },
  ] },
  { id: 'controle', nome: 'Controle e Relatórios', resumo: 'Alertas, curvas, relatórios e implantação.', icone: FileBarChart, matiz: 245, telas: [
    { href: '/alertas/', rotulo: 'Alertas', icone: Bell, descricao: 'Atrasos, vencimentos, estoque, manutenção, qualidade e caixa' },
    { href: '/curvas/', rotulo: 'Curvas S e ABC', icone: LineChart, descricao: 'Curva S físico-financeira e ABC de materiais, pessoal e equipamentos' },
    { href: '/relatorios/', rotulo: 'Relatórios', icone: FileBarChart, descricao: 'Os 10 relatórios em Excel, CSV ou PDF e a Super Planilha' },
    { href: '/implantacao/', rotulo: 'Manual e Implantação', icone: ListChecks, descricao: 'Checklist de implantação por obra e manual do usuário' },
  ] },
  { id: 'clientes', nome: 'Clientes', resumo: 'Portal em que o cliente acompanha o contrato.', icone: Handshake, matiz: 198, telas: [
    { href: '/clientes/', rotulo: 'Portal do Cliente', icone: MonitorSmartphone, descricao: 'Libere ao cliente o painel do contrato: curva S, medições, parcelas e prazos', soDono: true },
  ] },
  { id: 'integracoes', nome: 'Fiscal e Integrações', resumo: 'Bancos, notas fiscais e eSocial.', icone: Plug, matiz: 190, telas: [
    { href: '/integracoes/bancos/', rotulo: 'Bancos e Pix', icone: Banknote, descricao: 'Conciliação do extrato (OFX) e cobrança por Pix' },
    { href: '/integracoes/fiscal/', rotulo: 'Notas fiscais e CNPJ', icone: Receipt, descricao: 'NF-e de compra vira fornecedor e contas a pagar' },
    { href: '/integracoes/esocial/', rotulo: 'eSocial', icone: Contact, descricao: 'Conferência cadastral e planilha para a contabilidade' },
  ] },
  { id: 'administrativo', nome: 'Administrativo', resumo: 'Empresa, equipe e acessos.', icone: Building, matiz: 222, telas: [
    { href: '/admin/', rotulo: 'Empresa e equipe', icone: UserCog, descricao: 'Dados da empresa, responsável técnico, usuários e convites', soDono: true },
    { href: '/admin/seguranca/', rotulo: 'Lixeira e auditoria', icone: ShieldCheck, descricao: 'Recupere registros excluídos e veja quem alterou o quê', soDono: true },
    { href: '/admin/backup/', rotulo: 'Backup e restauração', icone: DatabaseBackup, descricao: 'Cópia completa dos dados com conferência de integridade', soDono: true },
    { href: '/admin/integridade/', rotulo: 'Integridade e manutenção', icone: Stethoscope, descricao: 'Duplicados, registros sem obra e revisão da EAP', soDono: true },
    { href: '/gestao/documents/', rotulo: 'Documentos', icone: FileText, descricao: 'Arquivo geral da empresa e das obras' },
    { href: '/plataforma/', rotulo: 'Licenças da plataforma', icone: KeySquare, descricao: 'Códigos de licença para novas empresas', soDono: true, soPlataforma: true },
    { href: '/legal/', rotulo: 'Termos e direitos autorais', icone: Scale, descricao: 'Termos de uso, privacidade (LGPD) e direitos autorais' },
  ] },
];

export const INICIO: Tela = { href: '/inicio/', rotulo: 'Início', icone: LayoutGrid, descricao: 'Visão geral e pendências' };
export const areaPorId = (id: string): Area | undefined => AREAS.find((a) => a.id === id);
const semBarra = (s: string) => s.replace(/\/+$/, '');

/** Área e tela correspondentes a um caminho (a primeira área que contém a tela). */
export function localizar(caminho: string, areaPreferida?: string): { area?: Area; tela?: Tela } {
  const c = semBarra(caminho);
  const m = /^\/area\/([\w-]+)/.exec(c);
  if (m) return { area: areaPorId(m[1]!) };
  const candidatas = AREAS.filter((a) => a.telas.some((t) => semBarra(t.href) === c));
  const area = candidatas.find((a) => a.id === areaPreferida) ?? candidatas[0];
  return { area, tela: area?.telas.find((t) => semBarra(t.href) === c) };
}

/** Cores de uma área a partir do matiz (funcionam nos dois temas). */
export function corDaArea(matiz: number): React.CSSProperties {
  return { ['--area' as string]: `${matiz} 72% 52%`, ['--area-suave' as string]: `${matiz} 80% 60%` };
}
