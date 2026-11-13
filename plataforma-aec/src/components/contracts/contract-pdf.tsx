/**
 * PDF vetorial da proposta + contrato (@react-pdf/renderer): capa executiva, memória de cálculo
 * do CUB, comparativo de cenários, cronograma físico-financeiro com Curva S e contrato.
 * Carregado sob demanda (import dinâmico) para não pesar no bundle inicial.
 */
import { Document, Image, Page, Path, StyleSheet, Svg, Text, View } from '@react-pdf/renderer';
import type { BlocoTexto } from '@/lib/contracts/template';
import { PADRAO_LABEL, type CenarioWhatIf, type OrcamentoResultado } from '@/lib/cub/engine';
import type { CronogramaFisicoFinanceiro } from '@/lib/cub/schedule';
import type { Signatario } from '@/lib/signature/hash';

export interface DadosPdf {
  codigo: string;
  emitidoEm: string;
  empresa: { nome: string; cnpj: string; responsavel: string; registro: string; logoUrl?: string; corPrimaria: string; corSecundaria: string };
  projeto: { nome: string; cliente: string; local: string };
  /** Estimativa paramétrica pelo CUB (edificações). */
  orcamento?: OrcamentoResultado;
  /** Estimativa por composições unitárias (infraestrutura, saneamento, BIM…). */
  analitico?: AnaliticoPdf;
  cenarios: CenarioWhatIf[];
  cronograma: CronogramaFisicoFinanceiro;
  contrato: BlocoTexto[];
  signatarios: Signatario[];
}

export interface AnaliticoPdf {
  base: string;
  custoDireto: number;
  bdiPercentual: number;
  precoVenda: number;
  itensPendentes: number;
  porDisciplina: { disciplina: string; total: number }[];
  linhas: { descricao: string; disciplina: string; unidade: string; quantidade: number; codigo: string; precoUnitario: number; total: number }[];
}

const brl = (v: number, casas = 2) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}`;
const num = (v: number, casas = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const pct = (v: number, casas = 1) => `${num(v * 100, casas)}%`;

const s = StyleSheet.create({
  page: { paddingTop: 56, paddingBottom: 54, paddingHorizontal: 44, fontSize: 9.5, fontFamily: 'Helvetica', color: '#1f2937', lineHeight: 1.45 },
  header: { position: 'absolute', top: 22, left: 44, right: 44, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: '#6b7280', borderBottomWidth: 0.5, borderBottomColor: '#d1d5db', paddingBottom: 6 },
  footer: { position: 'absolute', bottom: 22, left: 44, right: 44, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: '#6b7280' },
  h1: { fontSize: 15, fontFamily: 'Helvetica-Bold', marginBottom: 10 },
  h2: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 12, marginBottom: 5 },
  p: { marginBottom: 6, textAlign: 'justify' },
  bold: { fontFamily: 'Helvetica-Bold' },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#e5e7eb', paddingVertical: 3.5 },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: '#374151' },
  right: { textAlign: 'right' },
  muted: { color: '#6b7280', fontSize: 8 },
  box: { borderWidth: 0.5, borderColor: '#d1d5db', borderRadius: 4, padding: 10 },
});

function Moldura({ d, titulo, children }: { d: DadosPdf; titulo: string; children: React.ReactNode }) {
  return (
    <Page size="A4" style={s.page}>
      <View style={s.header} fixed><Text>{d.empresa.nome} · {titulo}</Text><Text>{d.codigo}</Text></View>
      {children}
      <View style={s.footer} fixed>
        <Text>{d.empresa.responsavel} · {d.empresa.registro} · CNPJ {d.empresa.cnpj}</Text>
        <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
      </View>
    </Page>
  );
}

function CurvaS({ d }: { d: DadosPdf }) {
  const W = 500, H = 120, n = d.cronograma.totais.length;
  const max = Math.max(...d.cronograma.totais.map((p) => p.valor), 1);
  const lw = W / n;
  const barras = d.cronograma.totais.map((p, i) => {
    const h = (p.valor / max) * (H - 10);
    return `M${i * lw + 1},${H} V${H - h} H${(i + 1) * lw - 1} V${H} Z`;
  }).join(' ');
  const linha = d.cronograma.totais.map((p, i) => `${i === 0 ? `M0,${H} L` : 'L'}${(i + 1) * lw},${H - p.percentualAcumulado * (H - 4)}`).join(' ');
  return (
    <Svg width={W} height={H + 4} viewBox={`0 0 ${W} ${H + 4}`}>
      <Path d={barras} fill={d.empresa.corPrimaria} fillOpacity={0.28} />
      <Path d={linha} stroke={d.empresa.corPrimaria} strokeWidth={1.6} fill="none" />
      <Path d={`M0,${H} H${W}`} stroke="#9ca3af" strokeWidth={0.5} />
    </Svg>
  );
}

export function PropostaContratoPdf({ d }: { d: DadosPdf }) {
  const o = d.orcamento;
  const an = d.analitico;
  const total = o?.precoVenda ?? an?.precoVenda ?? 0;
  const cor = d.empresa.corPrimaria;
  // Tabela mensal: até 16 meses por faixa para caber na largura da página.
  const faixas: number[][] = [];
  for (let i = 0; i < d.cronograma.totais.length; i += 16) faixas.push(d.cronograma.totais.slice(i, i + 16).map((p) => p.mes));

  return (
    <Document title={`${d.codigo} — ${d.projeto.nome}`} author={d.empresa.nome} subject="Proposta técnica-comercial e contrato" language="pt-BR">
      {/* Capa executiva */}
      <Page size="A4" style={{ fontFamily: 'Helvetica', color: '#111827' }}>
        <View style={{ height: 300, backgroundColor: d.empresa.corSecundaria, padding: 44, justifyContent: 'space-between' }}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf não é <img> */}
          {d.empresa.logoUrl ? <Image src={d.empresa.logoUrl} style={{ height: 36, objectFit: 'contain', objectPosition: 'left' }} /> : <Text style={{ color: '#ffffff', fontSize: 14, fontFamily: 'Helvetica-Bold' }}>{d.empresa.nome}</Text>}
          <View>
            <Text style={{ color: '#d1d5db', fontSize: 10, letterSpacing: 1.5 }}>PROPOSTA TÉCNICA-COMERCIAL E CONTRATO</Text>
            <Text style={{ color: '#ffffff', fontSize: 26, fontFamily: 'Helvetica-Bold', marginTop: 8 }}>{d.projeto.nome}</Text>
          </View>
        </View>
        <View style={{ height: 4, backgroundColor: cor }} />
        <View style={{ padding: 44 }}>
          <Text style={{ fontSize: 9, color: '#6b7280' }}>Preparado para</Text>
          <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', marginBottom: 2 }}>{d.projeto.cliente}</Text>
          <Text style={{ fontSize: 10, color: '#4b5563' }}>{d.projeto.local}</Text>
          <View style={{ flexDirection: 'row', marginTop: 36, gap: 12 }}>
            {(o ? [
              ['Estimativa de obra', brl(o.precoVenda, 0)],
              ['Área construída', `${num(o.areaRealTotalM2)} m²`],
              ['Padrão', PADRAO_LABEL[o.padrao]],
              ['Referência', `${o.projetoCub} · ${o.competencia.split('-').reverse().join('/')}`],
            ] : [
              ['Estimativa de obra', brl(total, 0)],
              ['Itens orçados', String(an?.linhas.length ?? 0)],
              ['BDI', pct(an?.bdiPercentual ?? 0, 2)],
              ['Base de preços', an?.base ?? ''],
            ]).map(([rotulo, valor]) => (
              <View key={rotulo} style={{ flex: 1, borderTopWidth: 2, borderTopColor: cor, paddingTop: 8 }}>
                <Text style={{ fontSize: 8, color: '#6b7280' }}>{rotulo}</Text>
                <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', marginTop: 3 }}>{valor}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={{ position: 'absolute', bottom: 36, left: 44, right: 44, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8.5, color: '#6b7280' }}>
          <Text>{d.empresa.responsavel} · {d.empresa.registro}</Text><Text>{d.codigo} · {d.emitidoEm}</Text>
        </View>
      </Page>

      {/* Memória de cálculo */}
      {o && <Moldura d={d} titulo="Memória de cálculo">
        <Text style={s.h1}>Memória de cálculo — CUB e NBR 12721</Text>
        <Text style={s.p}>Estimativa paramétrica pelo Custo Unitário Básico ({o.fonte}, competência {o.competencia.split('-').reverse().join('/')}), projeto-padrão {o.projetoCub}, aplicada às áreas equivalentes calculadas conforme a ABNT NBR 12721:2006.</Text>
        <Text style={s.h2}>1. Quadro de áreas equivalentes</Text>
        <View style={s.row}><Text style={[s.th, { flex: 5 }]}>Ambiente</Text><Text style={[s.th, s.right, { flex: 2 }]}>Área real (m²)</Text><Text style={[s.th, s.right, { flex: 1.3 }]}>Coef.</Text><Text style={[s.th, s.right, { flex: 2 }]}>Equivalente (m²)</Text></View>
        {o.areas.map((a, i) => (
          <View key={i} style={s.row} wrap={false}><Text style={{ flex: 5 }}>{a.descricao}</Text><Text style={[s.right, { flex: 2 }]}>{num(a.areaRealM2)}</Text><Text style={[s.right, { flex: 1.3 }]}>{num(a.coeficiente)}</Text><Text style={[s.right, { flex: 2 }]}>{num(a.areaEquivalenteM2)}</Text></View>
        ))}
        <View style={s.row}><Text style={[s.bold, { flex: 5 }]}>Total</Text><Text style={[s.bold, s.right, { flex: 2 }]}>{num(o.areaRealTotalM2)}</Text><Text style={{ flex: 1.3 }} /><Text style={[s.bold, s.right, { flex: 2 }]}>{num(o.areaEquivalenteTotalM2)}</Text></View>

        <Text style={s.h2}>2. Formação do preço</Text>
        {o.memoria.filter((m) => !m.descricao.startsWith('Área equivalente')).map((m, i) => {
          const destaque = m.descricao === 'Preço de venda';
          return (
            <View key={i} style={s.row} wrap={false}>
              <View style={{ flex: 6 }}><Text style={destaque ? s.bold : {}}>{m.descricao}</Text><Text style={s.muted}>{m.formula}</Text></View>
              <Text style={[s.right, { flex: 2 }, destaque ? s.bold : {}]}>{brl(m.valor)}</Text>
            </View>
          );
        })}
        <Text style={s.h2}>3. Composição do custo básico</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {([['Materiais', o.composicao.materiais], ['Mão de obra', o.composicao.maoDeObra], ['Desp. administrativas', o.composicao.despesasAdministrativas], ['Equipamentos', o.composicao.equipamentos]] as [string, number][]).map(([r, v]) => (
            <View key={r} style={[s.box, { width: '23.5%' }]}><Text style={s.muted}>{r}</Text><Text style={s.bold}>{brl(v, 0)}</Text><Text style={s.muted}>{pct(o.custoBasico > 0 ? v / o.custoBasico : 0)}</Text></View>
          ))}
        </View>
        {o.avisos.length > 0 && <View style={[s.box, { marginTop: 10, borderColor: '#f59e0b', width: '100%' }]}>{o.avisos.map((a) => <Text key={a} style={{ fontSize: 8.5 }}>Atenção: {a}</Text>)}</View>}
        <Text style={[s.muted, { marginTop: 10 }]}>O CUB não contempla: fundações especiais, elevadores, climatização, paisagismo, projetos, taxas e remuneração do incorporador (NBR 12721, item 8.3.5). Itens aplicáveis foram somados à parte quando indicados acima.</Text>
      </Moldura>}

      {/* Orçamento analítico */}
      {an && <Moldura d={d} titulo="Orçamento analítico">
        <Text style={s.h1}>Orçamento por composições unitárias</Text>
        <Text style={s.p}>Quantitativos extraídos dos arquivos de projeto (BIM, CAD, redes e levantamentos), precificados pela base {an.base}. Custo direto de {brl(an.custoDireto)} acrescido de BDI de {pct(an.bdiPercentual, 2)}.</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          {an.porDisciplina.filter((x) => x.total > 0).map((x) => (
            <View key={x.disciplina} style={[s.box, { width: '32%', marginBottom: 6 }]}><Text style={s.muted}>{x.disciplina}</Text><Text style={s.bold}>{brl(x.total, 0)}</Text><Text style={s.muted}>{pct(an.custoDireto > 0 ? x.total / an.custoDireto : 0)}</Text></View>
          ))}
        </View>
        <View style={[s.row, { marginTop: 8 }]} fixed><Text style={[s.th, { width: 52 }]}>Código</Text><Text style={[s.th, { flex: 5 }]}>Serviço</Text><Text style={[s.th, s.right, { flex: 1.6 }]}>Quantidade</Text><Text style={[s.th, s.right, { flex: 1.5 }]}>Preço unit.</Text><Text style={[s.th, s.right, { flex: 1.8 }]}>Total</Text></View>
        {an.linhas.map((l, i) => (
          <View key={i} style={s.row} wrap={false}>
            <Text style={{ width: 52, fontSize: 8 }}>{l.codigo}</Text>
            <View style={{ flex: 5 }}><Text style={{ fontSize: 8.5 }}>{l.descricao}</Text><Text style={s.muted}>{l.disciplina}</Text></View>
            <Text style={[s.right, { flex: 1.6, fontSize: 8.5 }]}>{num(l.quantidade)} {l.unidade}</Text>
            <Text style={[s.right, { flex: 1.5, fontSize: 8.5 }]}>{brl(l.precoUnitario)}</Text>
            <Text style={[s.right, { flex: 1.8, fontSize: 8.5 }]}>{brl(l.total)}</Text>
          </View>
        ))}
        {([['Custo direto', an.custoDireto], [`BDI (${pct(an.bdiPercentual, 2)})`, an.precoVenda - an.custoDireto], ['Preço de venda', an.precoVenda]] as [string, number][]).map(([r, v]) => (
          <View key={r} style={s.row} wrap={false}><Text style={[s.bold, { flex: 8 }]}>{r}</Text><Text style={[s.bold, s.right, { flex: 2 }]}>{brl(v)}</Text></View>
        ))}
        {an.itensPendentes > 0 && <View style={[s.box, { marginTop: 10, borderColor: '#f59e0b', width: '100%' }]}><Text style={{ fontSize: 8.5 }}>Atenção: {an.itensPendentes} item(ns) do quantitativo ainda não têm composição confirmada e não estão neste total.</Text></View>}
      </Moldura>}

      {/* Cenários + cronograma */}
      <Moldura d={d} titulo="Cenários e cronograma">
        {o && d.cenarios.length > 1 && (
          <>
            <Text style={s.h1}>Comparativo de padrões de acabamento</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              {d.cenarios.map((c, i) => {
                const ativo = c.resultado.padrao === o.padrao && c.resultado.projetoCub === o.projetoCub;
                return (
                  <View key={c.resultado.padrao} style={[s.box, { width: `${96 / d.cenarios.length}%` }, ativo ? { borderColor: cor, borderWidth: 1.5 } : {}]}>
                    <Text style={s.bold}>{PADRAO_LABEL[c.resultado.padrao]}{ativo ? ' (proposto)' : ''}</Text>
                    <Text style={s.muted}>{c.resultado.projetoCub} · {brl(c.resultado.cubAjustadoM2)}/m²</Text>
                    <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', marginTop: 6 }}>{brl(c.resultado.precoVenda, 0)}</Text>
                    <Text style={s.muted}>{brl(c.resultado.precoPorM2Real, 0)}/m² real{i > 0 ? ` · +${pct(c.resultado.precoVenda / (d.cenarios[0]?.resultado.precoVenda || 1) - 1, 0)}` : ''}</Text>
                  </View>
                );
              })}
            </View>
            <Text style={s.muted}>Todos os cenários usam o mesmo quadro de áreas, BDI de {pct(o.bdiPercentual, 2)} e os mesmos itens adicionais.</Text>
          </>
        )}
        <Text style={[s.h1, { marginTop: 18 }]}>Cronograma físico-financeiro</Text>
        <Text style={s.muted}>Desembolso mensal (barras) e avanço acumulado (linha) em {d.cronograma.totais.length} meses.</Text>
        <View style={{ marginVertical: 8 }}><CurvaS d={d} /></View>
        {faixas.map((meses, f) => (
          <View key={f} style={{ marginTop: 8 }} wrap={false}>
            <View style={s.row}><Text style={[s.th, { width: 120 }]}>Etapa</Text>{meses.map((m) => <Text key={m} style={[s.th, s.right, { flex: 1 }]}>M{m}</Text>)}</View>
            {d.cronograma.linhas.map((l) => (
              <View key={l.etapa} style={[s.row, { paddingVertical: 2 }]}><Text style={{ width: 120, fontSize: 7 }}>{l.etapa}</Text>
                {meses.map((m) => <Text key={m} style={[s.right, { flex: 1, fontSize: 6.5 }]}>{(l.mensal[m - 1] ?? 0) > 0 ? num((l.mensal[m - 1] ?? 0) / 1000, 0) : ''}</Text>)}</View>
            ))}
            <View style={s.row}><Text style={[s.bold, { width: 120, fontSize: 7 }]}>Total (R$ mil)</Text>{meses.map((m) => <Text key={m} style={[s.bold, s.right, { flex: 1, fontSize: 6.5 }]}>{num((d.cronograma.totais[m - 1]?.valor ?? 0) / 1000, 0)}</Text>)}</View>
            <View style={s.row}><Text style={[s.bold, { width: 120, fontSize: 7 }]}>Acumulado</Text>{meses.map((m) => <Text key={m} style={[s.right, { flex: 1, fontSize: 6.5 }]}>{pct(d.cronograma.totais[m - 1]?.percentualAcumulado ?? 0, 0)}</Text>)}</View>
          </View>
        ))}
      </Moldura>

      {/* Contrato */}
      <Moldura d={d} titulo="Contrato">
        {d.contrato.map((b, i) => (
          <Text key={i} style={b.tipo === 'h1' ? [s.h1, { textAlign: 'center' }] : b.tipo === 'h2' ? s.h2 : s.p} minPresenceAhead={b.tipo === 'p' ? 0 : 40}>
            {b.trechos.map((t, j) => <Text key={j} style={t.negrito ? s.bold : {}}>{t.texto}</Text>)}
          </Text>
        ))}
        <View style={{ marginTop: 40, flexDirection: 'row', flexWrap: 'wrap', gap: 24 }} wrap={false}>
          {d.signatarios.map((sg) => (
            <View key={sg.email + sg.papel} style={{ width: '45%', borderTopWidth: 0.8, borderTopColor: '#111827', paddingTop: 5 }}>
              <Text style={s.bold}>{sg.nome}</Text>
              <Text style={s.muted}>{sg.papel === 'contratante' ? 'CONTRATANTE' : sg.papel === 'contratada' ? 'CONTRATADA' : 'TESTEMUNHA'}{sg.cpf ? ` · CPF ${sg.cpf}` : ''}</Text>
            </View>
          ))}
        </View>
        <Text style={[s.muted, { marginTop: 18 }]}>Documento {d.codigo}. A integridade deste arquivo é verificada pelo hash SHA-256 registrado na plataforma e no provedor de assinatura eletrônica.</Text>
      </Moldura>
    </Document>
  );
}
