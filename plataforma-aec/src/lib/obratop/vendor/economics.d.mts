// Declarações da análise econômica do ObraTop (copiada sem alteração).
export declare const numeric: (v: unknown) => number | null;
export declare const isoDate: (v: unknown) => boolean;
export interface MesEconomico { month: string; received: number; paid: number; forecastIn: number; forecastOut: number; cost: number; net: number; projectedBalance: number }
export interface CategoriaCusto { name: string; value: number; share: number; class: 'A' | 'B' | 'C'; cumulative: number }
export interface AnaliseEconomica {
  workId: string; workName: string; cutoff: string; budget: number | null; sale: number | null; contract: number | null; incurred: number | null; eac: number | null;
  margin: number | null; marginPct: number | null; remaining: number | null; received: number; paid: number; net: number; initial: number | null; funding: number | null;
  overduePay: number; overdueReceive: number; measured: number; rows: MesEconomico[]; categories: CategoriaCusto[]; mean: number | null; sd: number | null; cv: number | null;
  adjustment: { value: number | null; rate: number | null; reason: string }; scenarios: { change: number; cost: number | null; margin: number | null }[]; warnings: string[];
  counts: Record<string, number>;
}
export declare function adjustment(p?: Record<string, unknown>): { value: number | null; rate: number | null; reason: string };
export declare function analyze(work: Record<string, unknown>, data: Record<string, unknown[]>, cutoff: string): AnaliseEconomica;
