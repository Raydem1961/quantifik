'use client';
/**
 * Sessão no mesmo modelo do ObraTop: `users/{uid}.currentOrg` aponta a empresa e
 * `organizations/{org}/members/{uid}` diz o papel (owner ou project_user, com a obra atribuída).
 * Os módulos novos guardam um perfil mais fino em `organizations/{org}/perfis/{uid}` (só o proprietário grava).
 */
import * as React from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db, MODO_DEMO } from '@/lib/firebase/client';
import { DEMO_TENANT, DEMO_USER } from '@/lib/demo-data';
import { funcaoDe, veTodasAsObras, type Funcao } from '@/lib/obratop/permissoes';
import type { Member, Role, Tenant } from '@/lib/types';

interface Sessao {
  carregando: boolean;
  usuario: Member | null;
  tenant: Tenant | null;
  /** Id da empresa (organização do ObraTop). */
  tenantId: string | null;
  role: Role | undefined;
  /** Autenticado, mas sem empresa: precisa criar uma ou usar um convite. */
  semVinculo: boolean;
  /** E-mail confirmado (exigido para o Portal do Cliente). */
  emailVerificado: boolean;
  /** Usuário de obra do ObraTop: só grava nos registros desta obra. `undefined` para quem vê todas as obras. */
  obraAtribuida: string | undefined;
  /** Função no ObraTop (owner, manager, finance, project_user, viewer). */
  funcao: Funcao;
  sair: () => Promise<void>;
  /** Relê a empresa do usuário (depois de criar a empresa ou aceitar um convite). */
  recarregar: () => void;
  /** Relê a conta no servidor (depois de clicar no link de confirmação do e-mail). */
  reverificar: () => Promise<void>;
}

const PERFIS: Role[] = ['coordenador', 'orcamentista', 'projetista'];
type Org = Record<string, unknown> & { name?: string; cnpj?: string; aec?: Partial<Tenant>; branding?: { logo?: string }; companyAddress?: string; companyPhone?: string; companyEmail?: string; defaultEngineer?: string };

/** Dados da empresa: nome e CNPJ do ObraTop + os campos dos módulos novos (em `aec`). */
export function empresaDe(id: string, org: Org): Tenant {
  const a = org.aec ?? {};
  return {
    id, nomeFantasia: org.name ?? 'Empresa', razaoSocial: a.razaoSocial || org.name || 'Empresa', cnpj: org.cnpj ?? '', uf: a.uf ?? 'BA',
    // O logotipo é o mesmo do ObraTop 3 (org.branding.logo, imagem embutida); o campo antigo dos módulos novos fica como reserva.
    branding: { corPrimaria: a.branding?.corPrimaria ?? '#3b4cca', corSecundaria: a.branding?.corSecundaria ?? '#111827', logoUrl: (typeof org.branding?.logo === 'string' && /^data:image\/(png|jpeg);base64,/.test(org.branding.logo) ? org.branding.logo : undefined) ?? a.branding?.logoUrl },
    contato: { endereco: org.companyAddress ?? '', telefone: org.companyPhone ?? '', email: org.companyEmail ?? '', engenheiroPadrao: org.defaultEngineer ?? '' },
    responsavelTecnico: { nome: a.responsavelTecnico?.nome ?? '', conselho: a.responsavelTecnico?.conselho ?? 'CREA', registro: a.responsavelTecnico?.registro ?? '' },
    webhookUrl: a.webhookUrl, custoHoraTecnica: a.custoHoraTecnica ?? 100,
  };
}
export function papelDe(membro: Record<string, unknown>, perfil?: unknown): Role {
  const f = funcaoDe(membro.role);
  if (f === 'owner') return 'socio_diretor';
  if (f === 'viewer') return 'consulta';
  if (PERFIS.includes(perfil as Role)) return perfil as Role;
  // Sem perfil próprio nos módulos novos: o Gestor atua como coordenador; o Financeiro, como orçamentista.
  return f === 'manager' ? 'coordenador' : f === 'finance' ? 'orcamentista' : 'projetista';
}

const Ctx = React.createContext<Sessao | null>(null);
type Estado = Omit<Sessao, 'sair' | 'recarregar' | 'reverificar'>;
const VAZIO: Estado = { carregando: false, usuario: null, tenant: null, tenantId: null, role: undefined, semVinculo: false, emailVerificado: false, obraAtribuida: undefined, funcao: 'project_user' };

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = React.useState<Estado>(
    MODO_DEMO ? { ...VAZIO, usuario: DEMO_USER, tenant: DEMO_TENANT, tenantId: 'demo', role: 'socio_diretor', emailVerificado: true, funcao: 'owner' } : { ...VAZIO, carregando: true },
  );
  const [versao, setVersao] = React.useState(0);

  React.useEffect(() => {
    if (MODO_DEMO) return;
    let parar: (() => void)[] = [];
    const limpar = () => { parar.forEach((f) => f()); parar = []; };
    const pararAuth = onAuthStateChanged(auth(), async (u) => {
      limpar();
      if (!u) { setEstado(VAZIO); return; }
      const base: Member = { uid: u.uid, nome: u.displayName ?? u.email ?? 'Usuário', email: u.email ?? '', role: 'projetista', ativo: true };
      let orgId: string | undefined;
      try { orgId = (await getDoc(doc(db(), 'users', u.uid))).data()?.currentOrg as string | undefined; }
      catch { /* sem rede e sem cache: trata como sem vínculo, e `recarregar` tenta de novo */ }
      if (!orgId) { setEstado({ ...VAZIO, usuario: base, semVinculo: true, emailVerificado: u.emailVerified }); return; }

      let org: Org | null = null, membro: Record<string, unknown> | null | undefined, perfil: unknown;
      const publicar = () => {
        if (membro === undefined || org === null) return; // aguardando as duas leituras
        // Removido ou bloqueado pelo administrador: sem acesso (como no ObraTop).
        if (!membro || membro.status !== 'active') { setEstado({ ...VAZIO, usuario: base, semVinculo: true, emailVerificado: u.emailVerified }); return; }
        const role = papelDe(membro, perfil);
        setEstado({
          carregando: false, semVinculo: false, emailVerificado: u.emailVerified, tenantId: orgId!, tenant: empresaDe(orgId!, org), role,
          usuario: { ...base, nome: (membro.name as string) || base.nome, role },
          funcao: funcaoDe(membro.role),
          obraAtribuida: veTodasAsObras(funcaoDe(membro.role)) ? undefined : ((membro.workId as string) || ''),
        });
      };
      const negado = () => setEstado({ ...VAZIO, usuario: base, semVinculo: true, emailVerificado: u.emailVerified });
      parar.push(onSnapshot(doc(db(), 'organizations', orgId), (s) => { org = (s.data() as Org) ?? {}; publicar(); }, negado));
      parar.push(onSnapshot(doc(db(), 'organizations', orgId, 'members', u.uid), (s) => { membro = s.exists() ? s.data() : null; publicar(); }, negado));
      parar.push(onSnapshot(doc(db(), 'organizations', orgId, 'perfis', u.uid), (s) => { perfil = s.data()?.perfil; publicar(); }, () => { /* sem perfil definido */ }));
    });
    return () => { pararAuth(); limpar(); };
  }, [versao]);

  const sair = React.useCallback(async () => { if (!MODO_DEMO) await signOut(auth()); }, []);
  const recarregar = React.useCallback(() => setVersao((v) => v + 1), []);
  const reverificar = React.useCallback(async () => {
    if (MODO_DEMO || !auth().currentUser) return;
    await auth().currentUser!.reload();
    await auth().currentUser!.getIdToken(true); // o novo token leva `email_verified` para as regras
    setVersao((v) => v + 1);
  }, []);
  const valor = React.useMemo(() => ({ ...estado, sair, recarregar, reverificar }), [estado, sair, recarregar, reverificar]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useAuth(): Sessao {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}
