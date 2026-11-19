'use client';
/**
 * Mantém os painéis do Portal do Cliente em dia: enquanto o proprietário usa o aplicativo, cada
 * painel publicado é recalculado a partir dos registros da obra e regravado quando algo muda.
 */
import * as React from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useDados } from '@/hooks/use-dados';
import { mesmoConteudo, montarFotos, montarPortal, type Portal } from '@/lib/portal';
import { publicarPortal, usePortaisDaEmpresa } from '@/lib/portal-dados';
import { MODO_DEMO } from '@/lib/firebase/client';

function Recalcular({ portais }: { portais: Portal[] }) {
  const { tenantId, tenant } = useAuth();
  const d = useDados();
  React.useEffect(() => {
    if (!tenantId || !tenant || d.works.length === 0) return;
    // Espera os dados assentarem: várias coleções chegam em sequência ao abrir o aplicativo.
    const t = setTimeout(() => {
      const hoje = new Date().toISOString().slice(0, 10);
      for (const atual of portais) {
        try {
          const novo = montarPortal(tenantId, atual.workId, d, { nome: tenant.nomeFantasia, responsavel: tenant.responsavelTecnico.nome, registro: tenant.responsavelTecnico.registro }, atual.emails, atual.opcoes, hoje);
          if (!mesmoConteudo(novo, atual)) void publicarPortal(novo, atual.opcoes.fotos === false ? [] : montarFotos(tenantId, atual.workId, d), atual).catch(() => { /* tenta de novo na próxima mudança */ });
        } catch { /* obra excluída: o painel fica como está até o proprietário remover */ }
      }
    }, 4000);
    return () => clearTimeout(t);
  }, [d, portais, tenantId, tenant]);
  return null;
}

export function SincronizadorDePortais() {
  const { tenantId, role } = useAuth();
  const dono = role === 'socio_diretor' && !MODO_DEMO;
  const { portais } = usePortaisDaEmpresa(dono ? tenantId : null);
  // Sem painel publicado, não há por que ler todos os registros.
  return dono && portais.length > 0 ? <Recalcular portais={portais} /> : null;
}
