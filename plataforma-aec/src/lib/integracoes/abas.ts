export const ABAS = ['bancos', 'fiscal', 'esocial'] as const;
export type Aba = (typeof ABAS)[number];
