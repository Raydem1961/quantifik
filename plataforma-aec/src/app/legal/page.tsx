import type { Metadata } from 'next';
import Link from 'next/link';
import { Nome, Simbolo } from '@/components/layout/marca';

export const metadata: Metadata = { title: 'Termos de uso e privacidade — ObraTop', description: 'Termos de uso do ObraTop e política de privacidade (LGPD).' };

const S = ({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) => (
  <section id={id} className="scroll-mt-6"><h2 className="mt-10 text-lg font-semibold tracking-tight">{titulo}</h2><div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground [&_b]:text-foreground [&_li]:ml-5 [&_li]:list-disc">{children}</div></section>
);

export default function Legal() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/login/" className="flex items-center gap-2.5"><Simbolo className="h-9 w-9" /><Nome className="text-lg font-bold tracking-tight" /></Link>
      <h1 className="mt-8 text-3xl font-semibold tracking-tight">Termos de uso e política de privacidade</h1>
      <p className="mt-2 text-sm text-muted-foreground">Versão 1.0 · vigente desde 19/11/2026. <b className="text-foreground">Modelo a ser revisado pelo jurídico do fornecedor antes da comercialização</b>; os campos entre colchetes devem ser preenchidos com os dados do fornecedor.</p>
      <nav aria-label="Seções" className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-sm"><a className="text-primary hover:underline" href="#termos">Termos de uso</a><a className="text-primary hover:underline" href="#privacidade">Privacidade (LGPD)</a><a className="text-primary hover:underline" href="#direitos">Seus direitos</a><a className="text-primary hover:underline" href="#contato">Contato</a><a className="text-primary hover:underline" href="#autorais">Direitos autorais</a></nav>

      <S id="termos" titulo="1. Termos de uso">
        <p>O ObraTop é um software de gestão de obras, projetos e orçamentos oferecido por <b>[razão social do fornecedor, CNPJ]</b> (“fornecedor”) a empresas de engenharia e construção (“empresa contratante”), que o disponibilizam aos seus colaboradores e, pelo Portal do Cliente, aos seus clientes.</p>
        <ul><li>A empresa contratante é responsável pelas contas que cria, pelas funções que atribui e pela exatidão do que é lançado (orçamentos, medições, contratos, pagamentos, fotos e documentos).</li>
          <li>Valores de referência (SINAPI, ORSE, CUB, modelos de obra) são públicos ou ilustrativos e devem ser conferidos pelo responsável técnico; não substituem orçamento e responsabilidade técnica (ART/RRT).</li>
          <li>Integrações com terceiros (assinatura digital, bancos, SEFAZ, eSocial) dependem de contratos e certificados da própria empresa contratante.</li>
          <li>É proibido usar o software para fins ilícitos, tentar acessar dados de outras empresas ou contornar as regras de acesso.</li>
          <li>Os dados lançados pertencem à empresa contratante, que pode exportá-los a qualquer momento (Administrativo → Backup e restauração).</li></ul>
      </S>

      <S id="privacidade" titulo="2. Política de privacidade (Lei 13.709/2018 — LGPD)">
        <p><b>Papéis.</b> A empresa contratante é a <b>controladora</b> dos dados pessoais que lança no ObraTop; o fornecedor atua como <b>operador</b>, tratando-os apenas para prestar o serviço, conforme as instruções da controladora. O Google (Firebase) é suboperador de hospedagem.</p>
        <p><b>Dados tratados.</b></p>
        <ul><li>Conta de acesso: nome, e-mail, senha (armazenada pelo Google de forma cifrada; o fornecedor não tem acesso a ela) e registros de acesso.</li>
          <li>Equipe: nome, função, CPF, data de nascimento, CBO, admissão e salário — somente se a empresa os lançar (cadastro de Pessoal e conferência para o eSocial).</li>
          <li>Clientes e fornecedores: nome, CPF/CNPJ, e-mail e telefone; contratos, medições, parcelas e pagamentos.</li>
          <li>Fotos do diário de obra: podem mostrar pessoas. A empresa deve evitar fotos que identifiquem trabalhadores sem necessidade e marcar como “uso interno” as que não devem ir ao cliente.</li>
          <li>Trilha de auditoria: quem alterou qual registro e quando, para segurança e prestação de contas.</li></ul>
        <p><b>Finalidades e bases legais.</b> Execução do contrato com a empresa contratante e com o cliente final (art. 7º, V), cumprimento de obrigação legal ou regulatória — por exemplo, eSocial e documentos fiscais (art. 7º, II) —, exercício regular de direitos (art. 7º, VI) e legítimo interesse na segurança e na auditoria do sistema (art. 7º, IX).</p>
        <p><b>Compartilhamento.</b> Google Cloud/Firebase (hospedagem, autenticação, banco de dados e arquivos — servidores que podem estar fora do Brasil, com cláusulas-padrão de proteção, art. 33); Clicksign (somente os contratos enviados para assinatura); BrasilAPI (somente o CNPJ consultado). Não vendemos dados pessoais.</p>
        <p><b>Portal do Cliente.</b> O cliente vê somente o painel da própria obra, liberado pela empresa para o seu e-mail confirmado. Custos internos, fornecedores, outras obras e anotações internas não são enviados ao painel.</p>
        <p><b>Retenção.</b> Os dados ficam enquanto durar o contrato com a empresa contratante e pelo prazo legal aplicável (por exemplo, documentos fiscais e trabalhistas). Excluir no aplicativo leva o registro à lixeira, de onde o administrador pode recuperá-lo ou excluí-lo definitivamente.</p>
        <p><b>Segurança.</b> Conexão cifrada (HTTPS), regras de acesso por empresa, função e obra verificadas no servidor, conferência de integridade dos backups (SHA-256) e trilha de auditoria.</p>
        <p><b>Armazenamento local.</b> O aplicativo guarda no aparelho uma cópia dos dados para funcionar sem internet e algumas preferências (tema, área aberta). Não usamos cookies de publicidade nem rastreadores de terceiros.</p>
      </S>

      <S id="direitos" titulo="3. Seus direitos (art. 18 da LGPD)">
        <p>Você pode pedir confirmação do tratamento, acesso, correção, anonimização, portabilidade, eliminação, informação sobre compartilhamento e revisão de decisões automatizadas. Como a empresa contratante é a controladora, os pedidos devem ser feitos primeiro a ela; o fornecedor a apoia no atendimento. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).</p>
      </S>

      <S id="contato" titulo="4. Contato e encarregado (DPO)">
        <p>Encarregado pelo tratamento de dados do fornecedor: <b>[nome]</b> — <b>[e-mail]</b>. Endereço: <b>[endereço do fornecedor]</b>.</p>
        <p>Alterações destes termos serão comunicadas no aplicativo com antecedência razoável.</p>
      </S>
      <p className="mt-12 text-xs text-muted-foreground"><Link href="/login/" className="text-primary hover:underline">Voltar ao ObraTop</Link></p>
      <S id="autorais" titulo="5. Direitos autorais e licença de uso">
        <p><b>Criação e autoria declarada:</b> Eng. Civil Raydem Rabello Santana. <b>© 2026 Raydem Rabello Santana. Todos os direitos reservados.</b></p>
        <p>O ObraTop é um programa de computador. Seu código-fonte e código-objeto, documentação, textos, elementos gráficos originais e demais expressões intelectuais protegíveis são protegidos pela legislação brasileira aplicável. A proteção autoral não abrange ideias, procedimentos, métodos de operação ou conceitos matemáticos considerados isoladamente.</p>
        <p><b>Licença e uso autorizado.</b> O acesso ao sistema não transfere propriedade intelectual ao usuário. Salvo autorização prévia e expressa do titular ou hipótese permitida pela legislação, é vedado copiar, reproduzir, distribuir, comercializar, sublicenciar, ceder, disponibilizar a terceiros, publicar, modificar, adaptar ou explorar o ObraTop, no todo ou em parte, bem como remover ou adulterar avisos de autoria e direitos autorais.</p>
        <p>Credenciais são pessoais. O usuário autorizado deve utilizar o sistema apenas dentro das permissões concedidas pelo administrador e não pode tentar contornar controles de acesso, obter código ou dados sem autorização ou utilizar cópias não autorizadas.</p>
        <p><b>Base legal.</b> <a className="text-primary underline" href="https://www.planalto.gov.br/ccivil_03/leis/l9609.htm" target="_blank" rel="noopener noreferrer">Lei nº 9.609/1998 (Lei de Software)</a>: art. 2º (regime de proteção autoral do software) e art. 12 (sanções penais, sem prejuízo das medidas civis). <a className="text-primary underline" href="https://www.planalto.gov.br/ccivil_03/leis/l9610.htm" target="_blank" rel="noopener noreferrer">Lei nº 9.610/1998 (Lei de Direitos Autorais)</a>: aplica-se aos programas de computador no que couber.</p>
        <p>O uso indevido poderá resultar em suspensão ou cancelamento do acesso e adoção das medidas administrativas, civis e/ou penais cabíveis. Este aviso não substitui instrumento contratual específico de licenciamento, quando existente.</p>
      </S>
    </main>
  );
}
