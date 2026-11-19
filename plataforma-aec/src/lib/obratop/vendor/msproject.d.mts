import type { Reg } from './calc.mjs';
export function parsePred(spec: string): { code: string; type: 'FS' | 'SS' | 'FF' | 'SF'; lag: number }[];
export function cpm(tasks: { id: string; wbs: string; start: string; end: string; summary?: boolean; pred?: string }[]): Map<string, { slack: number; critical: boolean; es: number; ef: number }>;
export function parseMspdi(text: string): { name: string; start: string; finish: string; tasks: Reg[]; resources: string[]; warnings: string[] };
export function toActivities(proj: ReturnType<typeof parseMspdi>, o?: { workId?: string }): { activities: Reg[]; warnings: string[] };
export function mspdiExport(work: Reg, acts: Reg[], o?: { phaseNames?: Record<string, string>; baseline?: Reg | null; critical?: Map<string, { critical: boolean }>; now?: Date }): string;
export interface RevisaoEap { workId: string; name: string; total: number; roots: string[]; map: Record<string, string>; changes: { id: string; wbs: string; newWbs: string; pred: string; newPred: string; phaseName?: string }[]; duplicates: number; brokenPred: number; semWbs: number; comGrupo: number; nonNumeric: boolean }
export function reviewEap(works: Reg[], acts: Reg[], o?: { phaseNames?: Record<string, string> }): RevisaoEap[];
