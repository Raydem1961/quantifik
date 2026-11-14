'use client';
import * as React from 'react';
import { onIdTokenChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db, MODO_DEMO } from '@/lib/firebase/client';
import { DEMO_TENANT, DEMO_USER } from '@/lib/demo-data';
import type { Member, Role, Tenant } from '@/lib/types';

interface Sessao {
  carregando: boolean;
  usuario: Member | null;
  tenant: Tenant | null;
  tenantId: string | null;
  role: Role | undefined;
  /** Autenticado, mas ainda sem empresa/papel atribuídos pelo Sócio-Diretor. */
  semVinculo: boolean;
  sair: () => Promise<void>;
}

const Ctx = React.createContext<Sessao | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = React.useState<Omit<Sessao, 'sair'>>(
    MODO_DEMO
      ? { carregando: false, usuario: DEMO_USER, tenant: DEMO_TENANT, tenantId: 'demo', role: 'socio_diretor', semVinculo: false }
      : { carregando: true, usuario: null, tenant: null, tenantId: null, role: undefined, semVinculo: false },
  );

  React.useEffect(() => {
    if (MODO_DEMO) return;
    let pararTenant: (() => void) | undefined;
    const parar = onIdTokenChanged(auth(), async (u) => {
      pararTenant?.();
      if (!u) {
        setEstado({ carregando: false, usuario: null, tenant: null, tenantId: null, role: undefined, semVinculo: false });
        return;
      }
      // tenantId e papel vêm dos custom claims — a mesma fonte que as regras de segurança usam.
      let tenantId: string | null = null;
      let role: Role | undefined;
      const chave = `aec.claims.${u.uid}`;
      try {
        const { claims } = await u.getIdTokenResult();
        tenantId = (claims.tenantId as string | undefined) ?? null;
        role = claims.role as Role | undefined;
        try { localStorage.setItem(chave, JSON.stringify({ tenantId, role })); } catch { /* sem armazenamento */ }
      } catch {
        // Sem internet e com o token vencido: usa o último papel conhecido só para montar a tela.
        // O acesso aos dados continua sendo decidido pelo servidor quando a conexão voltar.
        try { const salvo = JSON.parse(localStorage.getItem(chave) ?? 'null') as { tenantId: string | null; role?: Role } | null; tenantId = salvo?.tenantId ?? null; role = salvo?.role; } catch { /* idem */ }
      }
      const usuario: Member = { uid: u.uid, nome: u.displayName ?? u.email ?? 'Usuário', email: u.email ?? '', role: role ?? 'cliente', ativo: true };
      if (!tenantId || !role) {
        setEstado({ carregando: false, usuario, tenant: null, tenantId: null, role: undefined, semVinculo: true });
        return;
      }
      pararTenant = onSnapshot(doc(db(), 'tenants', tenantId), (snap) => {
        setEstado({ carregando: false, usuario, tenantId, role, semVinculo: false, tenant: snap.exists() ? ({ id: snap.id, ...snap.data() } as Tenant) : null });
      }, () => setEstado({ carregando: false, usuario, tenantId, role, semVinculo: false, tenant: null }));
    });
    return () => { parar(); pararTenant?.(); };
  }, []);

  const sair = React.useCallback(async () => { if (!MODO_DEMO) await signOut(auth()); }, []);
  const valor = React.useMemo(() => ({ ...estado, sair }), [estado, sair]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useAuth(): Sessao {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}
