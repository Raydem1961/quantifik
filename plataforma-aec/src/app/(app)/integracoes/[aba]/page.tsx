import { TelaIntegracoes } from '@/components/integracoes/tela-integracoes';
import { ABAS, type Aba } from '@/lib/integracoes/abas';

export const dynamicParams = false;
export const generateStaticParams = () => ABAS.map((aba) => ({ aba }));

export default function Pagina({ params }: { params: { aba: string } }) {
  return <TelaIntegracoes aba={params.aba as Aba} />;
}
