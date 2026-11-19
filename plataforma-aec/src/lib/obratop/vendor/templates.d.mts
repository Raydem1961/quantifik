// Declarações dos modelos de obra do ObraTop (copiados sem alteração).
export interface FamiliaModelo { id: string; label: string; baseLabel: string; refBase: number; phases: Record<string, string>; tasks: { k: string; p: string; n: string; u: string }[] }
export declare const FAMILIES: Record<string, FamiliaModelo>;
export interface TarefaModelo { key: string; wbs: string; name: string; unit: string; category: string; qty: number; unitValue: number; sale: number; start: string; end: string; durationDays: number; pred: string }
export declare function buildProject(o: { family: string; base: number; start: string; end: string; bdi?: number; cf?: number; keys?: string[] | null }): {
  family: string; tasks: TarefaModelo[]; budgetTotal: number; value: number; start: string; end: string; bdi: number; cf: number; base: number;
  phaseSummary: { phase: string; name: string; tasks: number; start: string; end: string; sale: number }[];
};
export declare function validateWizard(w: Record<string, unknown>, existingNames?: string[]): string;
