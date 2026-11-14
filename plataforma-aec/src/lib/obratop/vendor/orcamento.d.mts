import type { Reg } from './calc.mjs';
export function scheduleBudget(etapas: { id: string }[], items: Reg[], o: { start: string; end: string; overlap?: number; lag?: number; hoursPerDay?: number }): {
  tasks: { id: string; etapaId: string; start: string; end: string; days: number; crew: number; hours: number }[];
  etapaSpans: Record<string, { start: string; end: string }>; start: string; end: string; workdays: number; target: number; fits: boolean; scale: number;
};
export function laborHours(it: Reg): number;
export function workdaysBetween(a: string, b: string): number;
