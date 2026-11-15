'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { createUserWithEmailAndPassword, GoogleAuthProvider, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, updateProfile } from 'firebase/auth';
import { BarChart3, Boxes, HardHat, ShieldCheck } from 'lucide-react';
import { Nome, Simbolo } from '@/components/layout/marca';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { auth, MODO_DEMO } from '@/lib/firebase/client';
import { useAuth } from '@/hooks/use-auth';

const DESTAQUES = [
  [HardHat, 'Obras sob controle', 'Cronograma, medições, diário e caixa em tempo real.'],
  [Boxes, 'Do projeto ao orçamento', 'CAD, BIM e redes viram quantitativos e preços.'],
  [BarChart3, 'Decisão em um olhar', 'Pendências e indicadores por área da empresa.'],
  [ShieldCheck, 'Cada um no seu papel', 'Acesso por obra e por perfil, com trilha de auditoria.'],
] as const;

export default function Login() {
  const router = useRouter();
  const { usuario, carregando } = useAuth();
  const [modo, setModo] = React.useState<'entrar' | 'criar'>('entrar');
  const [nome, setNome] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [senha, setSenha] = React.useState('');
  const [erro, setErro] = React.useState<string>();
  const [enviando, setEnviando] = React.useState(false);
  const [info, setInfo] = React.useState<string>();
  const [convite, setConvite] = React.useState(false);

  React.useEffect(() => {
    // Quem chega por um link de convite normalmente ainda não tem conta.
    try { if (sessionStorage.getItem('obratop.convite')) { setConvite(true); setModo('criar'); } } catch { /* sem armazenamento */ }
  }, []);
  React.useEffect(() => { if (!carregando && usuario) router.replace('/inicio/'); }, [carregando, usuario, router]);

  const redefinir = async () => {
    setErro(undefined); setInfo(undefined);
    if (!/^\S+@\S+\.\S+$/.test(email)) { setErro('Digite seu e-mail no campo acima e clique de novo em "Esqueci minha senha".'); return; }
    try { await sendPasswordResetEmail(auth(), email); } catch { /* não revela se o e-mail existe */ }
    setInfo(`Se ${email} tiver cadastro, enviamos um link para criar uma nova senha. Confira também a caixa de spam.`);
  };
  const executar = async (acao: () => Promise<unknown>, falha: string) => {
    setErro(undefined); setInfo(undefined);
    setEnviando(true);
    try { await acao(); } catch (e) {
      const cod = (e as { code?: string }).code ?? '';
      setErro(cod.includes('email-already-in-use') ? 'Este e-mail já tem conta. Use "Já tenho conta" para entrar.' : cod.includes('weak-password') ? 'A senha precisa ter pelo menos 6 caracteres.' : falha);
    } finally { setEnviando(false); }
  };
  const enviar = () => modo === 'entrar'
    ? executar(() => signInWithEmailAndPassword(auth(), email, senha), 'Não foi possível entrar. Confira e-mail e senha.')
    : executar(async () => { const c = await createUserWithEmailAndPassword(auth(), email.trim(), senha); if (nome.trim()) await updateProfile(c.user, { displayName: nome.trim() }); void sendEmailVerification(c.user).catch(() => { /* pode ser reenviado na tela seguinte */ }); }, 'Não foi possível criar a conta. Confira os dados e tente de novo.');

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="aurora relative hidden flex-col justify-between overflow-hidden border-r p-12 lg:flex" style={{ ['--area' as string]: '233 70% 56%' }}>
        <p className="flex items-center gap-3 text-lg font-semibold tracking-tight">
          <Simbolo className="h-11 w-11 drop-shadow-[0_8px_14px_rgba(91,71,214,0.35)]" /><Nome className="text-xl font-bold tracking-tight" />
        </p>
        <div>
          <h1 className="max-w-md text-4xl font-semibold leading-tight tracking-tight">A empresa de engenharia inteira em um só lugar.</h1>
          <ul className="mt-10 grid max-w-xl grid-cols-2 gap-5">
            {DESTAQUES.map(([Icone, titulo, texto]) => (
              <li key={titulo} className="rounded-2xl border bg-card/50 p-4">
                <Icone className="h-5 w-5 text-primary" />
                <p className="mt-3 text-sm font-semibold">{titulo}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{texto}</p>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-muted-foreground">Comercial · Engenharia · Orçamento · Planejamento · Suprimentos · Financeiro · RH · Qualidade</p>
      </section>

      <section className="grid place-items-center p-6">
        <div className="w-full max-w-sm">
          <p className="mb-8 flex items-center gap-2.5 font-semibold lg:hidden"><Simbolo className="h-9 w-9" /><Nome className="font-bold tracking-tight" /></p>
          <h2 className="text-2xl font-semibold tracking-tight">{modo === 'entrar' ? 'Entrar' : 'Criar conta'}</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {MODO_DEMO ? 'Modo demonstração — Firebase não configurado.' : convite && modo === 'criar' ? 'Você recebeu um convite. Crie sua conta com o e-mail convidado.' : modo === 'entrar' ? 'Use a conta da sua empresa.' : 'Depois você cria sua empresa ou usa um convite.'}
          </p>
          <form className="mt-6 flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
            {modo === 'criar' && <Field label="Seu nome"><Input autoComplete="name" required maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} /></Field>}
            <Field label="E-mail"><Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Senha"><Input type="password" autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} required minLength={modo === 'criar' ? 6 : undefined} value={senha} onChange={(e) => setSenha(e.target.value)} /></Field>
            {erro && <p role="alert" className="text-xs text-destructive">{erro}</p>}
            {info && <p role="status" className="text-xs text-muted-foreground">{info}</p>}
            <Button type="submit" disabled={enviando || MODO_DEMO}>{modo === 'entrar' ? 'Entrar' : 'Criar conta'}</Button>
            <Button variant="outline" disabled={enviando || MODO_DEMO} onClick={() => void executar(() => signInWithPopup(auth(), new GoogleAuthProvider()), 'Não foi possível entrar com o Google.')}>Continuar com Google</Button>
          </form>
          <div className="mt-5 flex items-center justify-between text-xs">
            <button type="button" disabled={MODO_DEMO} onClick={() => { setModo(modo === 'entrar' ? 'criar' : 'entrar'); setErro(undefined); setInfo(undefined); }} className="font-medium text-primary underline-offset-2 hover:underline disabled:opacity-50">{modo === 'entrar' ? 'Criar conta' : 'Já tenho conta'}</button>
            {modo === 'entrar' && <button type="button" disabled={MODO_DEMO} onClick={() => void redefinir()} className="text-primary underline-offset-2 hover:underline disabled:opacity-50">Esqueci minha senha</button>}
          </div>
        </div>
      </section>
    </main>
  );
}
