'use client';
/** Backup e restauração da empresa (administrador geral). */
import * as React from 'react';
import { DatabaseBackup, FileUp, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { auditar } from '@/lib/auditoria';
import { gerarBackup, previaRestauracao, restaurar, validarBackup, type Backup, type Previa } from '@/lib/backup';
import { MODO_DEMO } from '@/lib/firebase/client';
import { ESQUEMAS, type IdModulo } from '@/lib/obratop/esquemas';

const NOMES: Record<string, string> = { progressSnapshots: 'Histórico de avanço', clients: 'Clientes (projetos)', projects: 'Projetos', cotacoes: 'Cotações', config: 'Parâmetros', vinculos: 'Vínculos de composição', cubOverrides: 'Ajustes de CUB', notifications: 'Notificações' };
const nome = (c: string) => { const sub = /^projects\/([^/]+)\/(.+)$/.exec(c); return sub ? `Projeto ${sub[1]} · ${sub[2]}` : ESQUEMAS[c as IdModulo]?.title ?? NOMES[c] ?? c; };

export default function BackupPagina() {
  const { tenantId, tenant, role, usuario } = useAuth();
  const [estado, setEstado] = React.useState<{ ocupado?: boolean; texto?: string; erro?: string }>({});
  const [arquivo, setArquivo] = React.useState<{ backup: Backup; previa: Previa[]; outraEmpresa: boolean; nome: string }>();
  if (role !== 'socio_diretor') return <><PageHeader titulo="Backup e restauração" /><p className="text-sm text-muted-foreground">Somente o administrador geral acessa esta tela.</p></>;
  const bloqueado = MODO_DEMO || !tenantId;

  const baixar = async () => {
    if (bloqueado) { setEstado({ erro: 'Modo demonstração: não há banco de dados para copiar.' }); return; }
    setEstado({ ocupado: true, texto: 'Lendo os dados…' });
    try {
      const b = await gerarBackup(tenantId!, tenant?.nomeFantasia ?? '', (t) => setEstado({ ocupado: true, texto: t }));
      const total = Object.values(b.colecoes).reduce((t, c) => t + Object.keys(c).length, 0);
      const url = URL.createObjectURL(new Blob([JSON.stringify(b)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = `ObraTop4_backup_${(tenant?.nomeFantasia ?? 'empresa').replace(/[^\w]+/g, '_')}_${b.geradoEm.slice(0, 16).replace(/[:T]/g, '-')}.json`; a.click(); URL.revokeObjectURL(url);
      void auditar(tenantId!, usuario, 'backup', 'organizations', tenantId!, undefined, { registros: total, sha256: b.sha256 });
      setEstado({ texto: `Backup gerado: ${total} registros. SHA-256 ${b.sha256.slice(0, 16)}… Guarde o arquivo fora do computador (pen drive ou nuvem).` });
    } catch { setEstado({ erro: 'Não foi possível gerar o backup. Verifique a conexão e tente de novo.' }); }
  };
  const abrir = async (f: File) => {
    if (bloqueado) { setEstado({ erro: 'Modo demonstração: não há banco de dados para restaurar.' }); return; }
    setArquivo(undefined); setEstado({ ocupado: true, texto: 'Conferindo o arquivo…' });
    const v = await validarBackup(await f.text(), tenantId!);
    if (!v.ok || !v.backup) { setEstado({ erro: v.erro }); return; }
    try {
      const previa = await previaRestauracao(tenantId!, v.backup);
      setArquivo({ backup: v.backup, previa, outraEmpresa: !!v.outraEmpresa, nome: f.name }); setEstado({});
    } catch { setEstado({ erro: 'Não foi possível comparar o arquivo com os dados atuais.' }); }
  };
  const executar = async () => {
    if (!arquivo || !tenantId) return;
    const muda = arquivo.previa.reduce((t, p) => t + p.novos.length + p.alterados.length, 0);
    if (!window.confirm(`Gravar ${muda} registro(s) do backup de ${new Date(arquivo.backup.geradoEm).toLocaleString('pt-BR')}?\n\nRegistros alterados depois do backup voltarão à versão do arquivo. Registros que não estão no arquivo não são apagados.`)) return;
    setEstado({ ocupado: true, texto: 'Restaurando…' });
    try {
      const r = await restaurar(tenantId, arquivo.backup, arquivo.previa, (t) => setEstado({ ocupado: true, texto: t }));
      void auditar(tenantId, usuario, 'backup-restore', 'organizations', tenantId, undefined, { gravados: r.gravados, recusados: r.recusados.length, sha256: arquivo.backup.sha256 });
      setArquivo(undefined);
      setEstado({ texto: `Restauração concluída: ${r.gravados} registro(s) gravado(s).${r.recusados.length ? ` ${r.recusados.length} protegido(s) pelas regras ficaram como estão (ex.: contratos já assinados).` : ''}` });
    } catch { setEstado({ erro: 'A restauração foi interrompida. O que já foi gravado permanece; rode de novo para completar.' }); }
  };
  const totalMuda = arquivo?.previa.reduce((t, p) => t + p.novos.length + p.alterados.length, 0) ?? 0;

  return (
    <>
      <PageHeader titulo="Backup e restauração" descricao="Cópia completa dos dados da empresa em um arquivo, com conferência de integridade." />
      {estado.erro && <p role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{estado.erro}</p>}
      {estado.texto && <p role="status" className="mb-4 rounded-md border border-success/40 bg-success/5 p-3 text-sm">{estado.texto}</p>}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Gerar backup</CardTitle><CardDescription>Obras, cronogramas, orçamentos, medições, financeiro, compras, estoque, pessoal, qualidade, documentos, diário, projetos, cotações e parâmetros.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button className="self-start" disabled={estado.ocupado} onClick={() => void baixar()}><DatabaseBackup className="h-4 w-4" />Baixar backup completo</Button>
            <p className="text-xs text-muted-foreground">Fotos e arquivos anexos não entram no arquivo (ficam no armazenamento do Firebase); o backup guarda os endereços deles. Recomendado: um backup por semana.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Restaurar de um backup</CardTitle><CardDescription>Primeiro o aplicativo mostra o que vai mudar; só grava depois da sua confirmação.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 self-start rounded-md border border-input px-4 text-sm font-medium hover:bg-accent focus-within:ring-2 focus-within:ring-ring">
              <FileUp className="h-4 w-4" />Escolher arquivo de backup
              <input type="file" accept=".json,application/json" className="sr-only" disabled={estado.ocupado} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void abrir(f); }} />
            </label>
            <p className="text-xs text-muted-foreground">Nunca apaga registros que não estão no arquivo e não altera equipe, convites nem auditoria.</p>
          </CardContent>
        </Card>
      </div>
      {arquivo && (
        <Card className="mt-4">
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-success" />{arquivo.nome}</CardTitle>
            <CardDescription>Integridade conferida (SHA-256). Gerado em {new Date(arquivo.backup.geradoEm).toLocaleString('pt-BR')} · {arquivo.backup.empresa}{arquivo.outraEmpresa && <strong className="text-destructive"> · ATENÇÃO: o arquivo é de outra empresa</strong>}</CardDescription></CardHeader>
          <CardContent>
            <table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2 font-medium">Coleção</th><th className="px-2 py-2 text-right font-medium">Novos</th><th className="px-2 py-2 text-right font-medium">Alterados</th><th className="px-2 py-2 text-right font-medium">Iguais</th></tr></thead>
              <tbody className="divide-y">{arquivo.previa.map((p) => <tr key={p.colecao}><td className="py-1.5">{nome(p.colecao)}</td><td className="tabular px-2 py-1.5 text-right">{p.novos.length}</td><td className="tabular px-2 py-1.5 text-right">{p.alterados.length}</td><td className="tabular px-2 py-1.5 text-right text-muted-foreground">{p.iguais}</td></tr>)}</tbody></table>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button disabled={estado.ocupado || totalMuda === 0} onClick={() => void executar()}>{totalMuda === 0 ? 'Nada a restaurar: tudo igual' : `Restaurar ${totalMuda} registro(s)`}</Button>
              <Button variant="ghost" onClick={() => setArquivo(undefined)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
