'use client';
import * as React from 'react';
import { Building2, KeyRound } from 'lucide-react';
import { Simbolo } from '@/components/layout/marca';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { useAuth } from '@/hooks/use-auth';
import { aceitarConvite, criarEmpresa } from '@/lib/obratop/empresa';

/** Primeiro acesso: criar a empresa (vira proprietário) ou entrar com um convite. */
export function Onboarding() {
  const { usuario, sair, recarregar } = useAuth();
  const [modo, setModo] = React.useState<'empresa' | 'convite'>('empresa');
  const [nome, setNome] = React.useState('');
  const [cnpj, setCnpj] = React.useState('');
  const [codigo, setCodigo] = React.useState('');
  const [estado, setEstado] = React.useState<{ ocupado?: boolean; erro?: string }>({});
  React.useEffect(() => {
    let c = new URLSearchParams(window.location.search).get('convite');
    try { c = c || sessionStorage.getItem('obratop.convite'); } catch { /* sem armazenamento */ }
    if (c) { setCodigo(c); setModo('convite'); }
  }, []);
  const enviar = async () => {
    setEstado({ ocupado: true });
    try {
      if (modo === 'empresa') await criarEmpresa(nome, cnpj); else await aceitarConvite(codigo);
      try { sessionStorage.removeItem('obratop.convite'); } catch { /* sem armazenamento */ }
      recarregar();
    } catch (e) { setEstado({ erro: e instanceof Error && !/permission/i.test(e.message) ? e.message : 'Não foi possível concluir. Confira os dados e tente de novo.' }); }
  };
  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-7 shadow-xl">
        <Simbolo className="mb-4 h-11 w-11" />
        <h1 className="text-lg font-semibold tracking-tight">Bem-vindo ao ObraTop</h1>
        <p className="mt-1 text-sm text-muted-foreground">A conta {usuario?.email} ainda não está ligada a nenhuma empresa.</p>
        <div role="tablist" className="mt-5 grid grid-cols-2 gap-2">
          {([['empresa', 'Criar minha empresa', Building2], ['convite', 'Tenho um convite', KeyRound]] as const).map(([m, rotulo, Icone]) => (
            <button key={m} role="tab" type="button" aria-selected={modo === m} onClick={() => { setModo(m); setEstado({}); }}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${modo === m ? 'border-primary bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-accent'}`}>
              <Icone className="h-4 w-4" />{rotulo}
            </button>
          ))}
        </div>
        <form className="mt-5 flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
          {modo === 'empresa' ? (<>
            <Field label="Nome da empresa"><Input required maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} /></Field>
            <Field label="CNPJ (opcional)"><Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} /></Field>
            <p className="text-xs text-muted-foreground">Você será o administrador e poderá convidar a equipe depois.</p>
          </>) : (<>
            <Field label="Código do convite"><Input required value={codigo} onChange={(e) => setCodigo(e.target.value)} /></Field>
            <p className="text-xs text-muted-foreground">O convite vale para o e-mail em que foi emitido. Peça o código ao administrador da empresa.</p>
          </>)}
          {estado.erro && <p role="alert" className="text-xs text-destructive">{estado.erro}</p>}
          <Button type="submit" disabled={estado.ocupado}>{estado.ocupado ? 'Aguarde…' : modo === 'empresa' ? 'Criar empresa' : 'Entrar na empresa'}</Button>
          <Button variant="ghost" onClick={() => void sair()}>Sair</Button>
        </form>
      </div>
    </div>
  );
}
