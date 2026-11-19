/** ORIGEM-DO-CODIGO.md continua verdadeiro: caminhos existem e as cópias idênticas não mudaram. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const raiz = path.resolve(__dirname, '..');
const doc = readFileSync(path.join(raiz, 'ORIGEM-DO-CODIGO.md'), 'utf8');

describe('origem do código', () => {
  it('todo caminho citado existe', () => {
    const caminhos = [...doc.matchAll(/`((?:src|regras|public|tests|functions|scripts|manual)\/[^`\s]*)`/g)].map((m) => m[1]!);
    expect(caminhos.length).toBeGreaterThan(20);
    for (const c of caminhos) expect(existsSync(path.join(raiz, c)), c).toBe(true);
  });
  it('as cópias declaradas idênticas têm o hash declarado', () => {
    const linhas = doc.split('\n').filter((l) => /^\| `/.test(l) && /`[0-9a-f]{16}` \|$/.test(l));
    expect(linhas.length).toBeGreaterThanOrEqual(9);
    for (const l of linhas) {
      const arquivo = /^\| `([^`]+)`/.exec(l)![1]!, hash = /`([0-9a-f]{16})` \|$/.exec(l)![1]!;
      expect(createHash('sha256').update(readFileSync(path.join(raiz, arquivo))).digest('hex').slice(0, 16), arquivo).toBe(hash);
    }
  });
});
