import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo de script sem tipos
import { planejar, prepararCredencial } from '../scripts/deploy.mjs';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
// @ts-expect-error módulo de script sem tipos
import { mesclar } from '../scripts/mesclar-regras.mjs';

type Passo = { descricao: string; firebase?: string[]; node?: string[]; interno?: string };
const cmds = (p: { passos: Passo[] }): string[] => p.passos.map((x) => (x.firebase ? x.firebase.join(' ') : x.node ? `node ${x.node[0]}` : x.interno ?? ''));

describe('plano de publicação', () => {
  it('recusa publicar sem saber se o projeto é novo ou compartilhado', () => {
    const p = planejar({ projeto: 'obratop-v3-teste' });
    expect(p.passos).toHaveLength(0);
    expect(p.erros.join(' ')).toMatch(/apagar as regras e o site/);
  });
  it('projeto compartilhado: exige site próprio, diferente do site padrão', () => {
    expect(planejar({ projeto: 'obratop-v3-teste', compartilhadoCom: '/x' }).erros.join(' ')).toMatch(/informe --site/);
    expect(planejar({ projeto: 'obratop-v3-teste', compartilhadoCom: '/x', site: 'obratop-v3-teste' }).erros.join(' ')).toMatch(/site padrão/);
  });
  it('projeto compartilhado: mescla regras, usa site próprio e nunca força regras/índices', () => {
    const p = planejar({ projeto: 'obratop-v3-teste', compartilhadoCom: '/x', site: 'plataforma-aec-teste' });
    expect(p.erros).toHaveLength(0);
    const c = cmds(p);
    expect(c[0]).toBe('node scripts/mesclar-regras.mjs');
    expect(c).toContain('config-compartilhada');
    expect(c.find((x: string) => x.startsWith('target:apply'))).toContain('hosting app plataforma-aec-teste');
    const regras = c.find((x: string) => x.includes('firestore:rules'))!;
    expect(regras).toContain('hosting:app');
    expect(regras).toContain('--config .firebase.compartilhado.json');
    expect(regras).not.toContain('--force');
    expect(regras).not.toMatch(/--only \S*\bhosting(,|\s)/); // nunca o Hosting inteiro do projeto
    expect(c.at(-1)).toMatch(/--only functions:plataforma-aec .*--force/);
    expect(p.url).toBe('https://plataforma-aec-teste.web.app');
  });
  it('projeto novo: regras da plataforma, site padrão', () => {
    const p = planejar({ projeto: 'minha-plataforma', projetoNovo: true, alvo: 'regras' });
    expect(cmds(p)).toEqual(['deploy --only firestore:rules,firestore:indexes,storage --project minha-plataforma --config firebase.json --non-interactive']);
    expect(planejar({ projeto: 'minha-plataforma', projetoNovo: true, alvo: 'hosting' }).url).toBe('https://minha-plataforma.web.app');
  });
});

describe('mescla de regras', () => {
  const raiz = 'match /databases/{database}/documents';
  const a = `rules_version = '2';\nservice cloud.firestore {\n  ${raiz} {\n    function fa() { return true; }\n    match /tenants/{t} { allow read: if fa(); }\n  }\n}\n`;
  const b = `rules_version = '2';\nservice cloud.firestore {\n  ${raiz} {\n    function fb() { return true; } // comentário com { chave\n    match /organizations/{o} { allow read: if fb(); match /works/{id} { allow read: if true; } }\n  }\n}\n`;
  it('junta os dois miolos em um único serviço', () => {
    const m = mesclar(a, b, raiz) as string;
    expect(m.match(/service cloud\.firestore/g)).toHaveLength(1);
    expect(m).toContain('match /tenants/{t}');
    expect(m).toContain('match /organizations/{o}');
    expect((m.match(/\{/g) ?? []).length - 1).toBe((m.match(/\}/g) ?? []).length); // a chave do comentário não fecha
  });
  it('recusa quando há função ou caminho repetido', () => {
    expect(() => mesclar(a, a, raiz)).toThrow(/função fa\(\).*caminho \/tenants\/\{\}/);
  });
});

describe('credencial por variável de ambiente', () => {
  it('grava a chave fora do repositório, só para o usuário, e aponta o CLI para ela', () => {
    const env: Record<string, string> = { FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ type: 'service_account', private_key: 'x', client_email: 'robo@p.iam.gserviceaccount.com', project_id: 'p' }) };
    const c = prepararCredencial(env) as { arquivo: string; conta: string; projeto: string };
    try {
      expect(env.GOOGLE_APPLICATION_CREDENTIALS).toBe(c.arquivo);
      expect(c.arquivo.startsWith(process.cwd())).toBe(false);
      expect(statSync(c.arquivo).mode & 0o077).toBe(0);
      expect(JSON.parse(readFileSync(c.arquivo, 'utf8')).client_email).toBe('robo@p.iam.gserviceaccount.com');
    } finally { rmSync(dirname(c.arquivo), { recursive: true, force: true }); }
    expect(existsSync(c.arquivo)).toBe(false);
  });
  it('não mexe quando já há credencial ou quando não há variável; recusa chave inválida', () => {
    expect(prepararCredencial({ GOOGLE_APPLICATION_CREDENTIALS: '/x', FIREBASE_SERVICE_ACCOUNT_JSON: '{}' })).toBeNull();
    expect(prepararCredencial({})).toBeNull();
    expect(() => prepararCredencial({ FIREBASE_SERVICE_ACCOUNT_JSON: 'abc' })).toThrow(/JSON válido/);
    expect(() => prepararCredencial({ FIREBASE_SERVICE_ACCOUNT_JSON: '{"type":"authorized_user"}' })).toThrow(/conta de serviço/);
  });
});
