import { TelaArea } from '@/components/area/tela-area';
import { AREAS } from '@/lib/modulos';

export const dynamicParams = false;
export const generateStaticParams = () => AREAS.map((a) => ({ area: a.id }));

export default function Pagina({ params }: { params: { area: string } }) {
  return <TelaArea id={params.area} />;
}
