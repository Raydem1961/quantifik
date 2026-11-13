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
      const { claims } = await u.getIdTokenResult();
      const tenantId = (claims.tenantId as string | undefined) ?? null;
      const role = claims.role as Role | undefined;
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
