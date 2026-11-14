// Declarações dos módulos de cálculo do ObraTop (copiados sem alteração).
export type Reg = Record<string, any>;
export function budgetSale(b: Reg): number;
export function measurementNet(m: Reg): { gross: number; retention: number; deduction: number; net: number };
export function contractBalance(contract: Reg, measurements: Reg[], statuses?: string[]): { current: number; addendum: number; measured: number; balance: number; percentLeft: number; hasMeasurements: boolean };
export function expectedProgress(a: Reg, dayISO: string): number;
export function weightedProgress(o: { acts: Reg[]; budgets?: Reg[]; works?: Reg[]; day: string; planned?: boolean }): number;
export function incurredCost(fin: Reg[], dayISO: string): number;
export function schedulePerformance(o: { acts: Reg[]; budgets?: Reg[]; works?: Reg[]; budget?: number; incurred?: number; day: string }): { planned: number; actual: number; variance: number; spi: number; cpi: number; ev: number; eac: number; etc: number; vac: number };
export function cashProjection(fin: Reg[], dayISO: string, months?: number): { opening: number; rows: { key: string; label: string; inflow: number; outflow: number; net: number; balance: number }[]; firstNegative: { key: string; label: string; balance: number } | null; minBalance: number };
export function suggestBudgetLinks(acts: Reg[], budgets: Reg[]): { activityId: string; budgetId: string }[];
export function activityWeights(valid: Reg[], budgets: Reg[]): { weights: Map<string, number>; modes: Map<string, string>; linkedCount: Map<string, { linked: number; total: number }> };
