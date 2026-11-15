import { mkdtempSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo de script sem tipos
import { envLocal, idDeEmpresa, localizarChave, sitePadrao } from '../scripts/instalar.mjs';
// @ts-expect-error módulo de script sem tipos
import { combinarComAoVivo } from '../scripts/mesclar-regras.mjs';
// @ts-expect-error módulo de script sem tipos
import { bases, regrasParaPublicar } from '../scripts/gerar-regras.mjs';
import { readFileSync } from 'node:fs';

describe('instalador', () => {
  it('acha a chave mais recente em Downloads e ignora outros JSON', () => {
    const d = mkdtempSync(join(tmpdir(), 'aec-inst-'));
    try {
      const chave = (p: string) => JSON.stringify({ type: 'service_account', private_key: 'k', project_id: p, client_email: 'a@b' });
      writeFileSync(join(d, 'obratop-firebase-adminsdk-abc.json'), chave('antigo'));
      writeFileSync(join(d, 'obratop-firebase-adminsdk-xyz.json'), chave('novo'));
      utimesSync(join(d, 'obratop-firebase-adminsdk-abc.json'), new Date(1e12), new Date(1e12));
      writeFileSync(join(d, 'package.json'), '{}');
      writeFileSync(join(d, 'falsa-firebase-adminsdk.json'), '{"type":"authorized_user"}');
      writeFileSync(join(d, 'quebrada-firebase-adminsdk.json'), '{');
      expect(localizarChave({}, [join(d, 'nao-existe'), d])).toBe(join(d, 'obratop-firebase-adminsdk-xyz.json'));
      expect(localizarChave({ GOOGLE_APPLICATION_CREDENTIALS: join(d, 'package.json') }, [])).toBe(join(d, 'package.json'));
      expect(localizarChave({}, [join(d, 'nao-existe')])).toBeNull();
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
  it('endereço próprio, id da empresa e .env.local', () => {
    expect(sitePadrao('obratop-v3-teste')).toBe('aec-obratop-v3-teste');
    expect(sitePadrao('um-projeto-com-nome-muito-comprido-mesmo').length).toBeLessThanOrEqual(30);
    expect(idDeEmpresa('Construtora São João & Filhos Ltda.')).toBe('construtora-sao-joao-filhos-ltda');
    expect(idDeEmpresa('AB')).toBe('empresa-ab');
    const env = envLocal({ apiKey: 'k', projectId: 'p', appId: 'a', storageBucket: 'p.appspot.com' });
    expect(env).toContain('NEXT_PUBLIC_FIREBASE_API_KEY=k\n');
    expect(env).toContain('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=p.firebaseapp.com');
    expect(() => envLocal({ projectId: 'p' })).toThrow(/apiKey/);
  });
  it('regras no ar: projeto novo, outro aplicativo e reinstalação', () => {
    const raiz = 'match /databases/{database}/documents';
    const plat = `rules_version = '2';\nservice cloud.firestore {\n  ${raiz} {\n    function fa() { return true; }\n    match /tenants/{t} { allow read: if fa(); }\n  }\n}\n`;
    const outro = `rules_version = '2';\nservice cloud.firestore {\n  ${raiz} {\n    function fb() { return true; }\n    match /organizations/{o} { allow read: if fb(); }\n  }\n}\n`;
    expect(combinarComAoVivo(plat, '', raiz)).toEqual({ regras: plat, modo: 'novo' });
    expect(combinarComAoVivo(plat, plat, raiz).modo).toBe('novo');
    const m1 = combinarComAoVivo(plat, outro, raiz);
    expect(m1.modo).toBe('compartilhado');
    expect(m1.regras).toContain('match /organizations/{o}');
    // reinstalar com uma versão NOVA da plataforma: o outro aplicativo fica igual, a plataforma é trocada
    const platV2 = plat.replace('allow read: if fa();', 'allow read, write: if fa();');
    const m2 = combinarComAoVivo(platV2, m1.regras, raiz);
    expect(m2.regras.match(/match \/organizations\/\{o\}/g)).toHaveLength(1);
    expect(m2.regras.match(/match \/tenants\/\{t\}/g)).toHaveLength(1);
    expect(m2.regras).toContain('allow read, write: if fa();');
    expect(combinarComAoVivo(platV2, m2.regras, raiz).regras).toBe(m2.regras);
  });
  it('regras a publicar: as do ObraTop no ar são a base, a extensão entra uma vez só', () => {
    const b = bases();
    // Projeto com o ObraTop no ar, com uma regra própria que não existe na cópia do repositório.
    const noAr = b.firestore.replace('match /audits/{id} {', 'match /relatoriosDoCliente/{id} { allow read: if member(orgId); }\n      match /audits/{id} {');
    const r = regrasParaPublicar(noAr, b.storage);
    expect(r.baseDoFirestore).toBe('no ar');
    expect(r.firestore).toContain('match /relatoriosDoCliente/{id}');
    expect(r.firestore.match(/>>> EXTENSÃO ObraTop 4/g)).toHaveLength(2);
    expect(r.firestore).toContain('match /perfis/{uid}');
    // Reinstalar sobre o resultado não duplica nada.
    const r2 = regrasParaPublicar(r.firestore, r.storage);
    expect(r2.firestore).toBe(r.firestore);
    expect(r2.storage).toBe(r.storage);
    // Sem as extensões, sobra exatamente o que estava no ar.
    expect(r.firestore.replace(/[ \t]*\/\/ >>> EXTENSÃO ObraTop 4[\s\S]*?\/\/ <<< EXTENSÃO ObraTop 4\n/g, '')).toBe(noAr);
    // Projeto novo (ou regras de outro aplicativo): usa a cópia do ObraTop.
    expect(regrasParaPublicar('', '').baseDoFirestore).toBe('cópia do ObraTop 3.39.13');
    // Os arquivos do repositório são exatamente o que o gerador produz.
    expect(readFileSync('firestore.rules', 'utf8')).toBe(regrasParaPublicar('', '').firestore);
    expect(readFileSync('storage.rules', 'utf8')).toBe(regrasParaPublicar('', '').storage);
  });
});
