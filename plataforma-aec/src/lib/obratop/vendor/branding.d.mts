// Declarações do módulo de marca do ObraTop (copiado sem alteração).
export declare const LOGO_MAX_W: number, LOGO_MAX_H: number, LOGO_MAX_FILE: number, LOGO_MAX_CHARS: number;
export declare function isValidLogo(url: unknown): boolean;
export declare function processLogoFile(file: File): Promise<{ dataUrl: string; w: number; h: number; name: string; kb: number }>;
export declare function formatCnpj(v: unknown): string;
export declare function validEmail(v: unknown): boolean;
export declare function companyLines(o?: { cnpj?: string; address?: string; phone?: string; email?: string }): string[];
