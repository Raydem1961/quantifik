'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { GoogleAuthProvider, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/form';
import { auth, MODO_DEMO } from '@/lib/firebase/client';
import { useAuth } from '@/hooks/use-auth';

export default function Login() {
  const router = useRouter();
  const { usuario, carregando } = useAuth();
  const [email, setEmail] = React.useState('');
  const [senha, setSenha] = React.useState('');
  const [erro, setErro] = React.useState<string>();
  const [enviando, setEnviando] = React.useState(false);
  const [info, setInfo] = React.useState<string>();
  const redefinir = async () => {
    setErro(undefined); setInfo(undefined);
    if (!/^\S+@\S+\.\S+$/.test(email)) { setErro('Digite seu e-mail no campo acima e clique de novo em "Esqueci minha senha".'); return; }
    try { await sendPasswordResetEmail(auth(), email); } catch { /* não revela se o e-mail existe */ }
    setInfo(`Se ${email} tiver cadastro, enviamos um link para criar uma nova senha. Confira também a caixa de spam.`);
  };

  React.useEffect(() => { if (!carregando && usuario) router.replace('/dashboard/'); }, [carregando, usuario, router]);

  const entrar = async (acao: () => Promise<unknown>) => {
    setErro(undefined);
    setEnviando(true);
    try { await acao(); } catch { setErro('Não foi possível entrar. Confira e-mail e senha.'); } finally { setEnviando(false); }
  };

  return (
    <main className="grid min-h-screen place-items-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 grid h-10 w-10 place-items-center rounded-lg bg-primary text-primary-foreground"><Building2 className="h-5 w-5" /></div>
          <CardTitle className="text-base">Plataforma AEC</CardTitle>
          <CardDescription>{MODO_DEMO ? 'Modo demonstração — Firebase não configurado.' : 'Entre com a conta do seu escritório.'}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void entrar(() => signInWithEmailAndPassword(auth(), email, senha)); }}>
            <Field label="E-mail"><Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Senha"><Input type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} /></Field>
            {erro && <p role="alert" className="text-xs text-destructive">{erro}</p>}
            {info && <p role="status" className="text-xs text-muted-foreground">{info}</p>}
            <Button type="submit" disabled={enviando || MODO_DEMO}>Entrar</Button>
            <Button variant="outline" disabled={enviando || MODO_DEMO} onClick={() => void entrar(() => signInWithPopup(auth(), new GoogleAuthProvider()))}>Entrar com Google</Button>
            <button type="button" disabled={MODO_DEMO} onClick={() => void redefinir()} className="text-xs text-primary underline-offset-2 hover:underline disabled:opacity-50">Esqueci minha senha</button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
