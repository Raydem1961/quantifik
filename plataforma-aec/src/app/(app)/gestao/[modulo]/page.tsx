import { TelaGestao } from '@/components/gestao/tela-gestao';
import { MODULOS, type IdModulo } from '@/lib/obratop/esquemas';

export const dynamicParams = false;
export const generateStaticParams = () => MODULOS.map((modulo) => ({ modulo }));

export default function Pagina({ params }: { params: { modulo: string } }) {
  return <TelaGestao modulo={params.modulo as IdModulo} />;
}
