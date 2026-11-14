/**
 * PDF da cotação para o cliente (A4 retrato): timbre do escritório, número, serviços com BDI
 * embutido, resumo por natureza de custo e, opcionalmente, a composição de custos de cada serviço.
 */
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { Cotacao, CotacaoCalculada, TipoInsumo } from '@/lib/composicoes/motor';

export interface DadosCotacaoPdf {
  empresa: { nome: string; razaoSocial: string; cnpj: string; responsavel: string; registro: string; logoUrl?: string; corPrimaria: string };
  cotacao: Cotacao;
  calculo: CotacaoCalculada;
  /** Texto das bases usadas ("SINAPI 10/2026 …"). */
  referencia: string;
}

const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (v: number, max = 4) => v.toLocaleString('pt-BR', { minimumFractionDigits: Math.min(2, max), maximumFractionDigits: max });
const un = (u: string) => u.replace(/^M2$/i, 'm²').replace(/^M3$/i, 'm³').toLowerCase();
const dataBr = (iso: string) => iso.split('-').reverse().join('/');
const NATUREZA: [TipoInsumo, string][] = [['mo', 'Mão de obra'], ['mat', 'Materiais'], ['eqp', 'Equipamentos'], ['srv', 'Serviços'], ['aux', 'Composições auxiliares']];

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 48, paddingHorizontal: 40, fontSize: 9, fontFamily: 'Helvetica', color: '#1f2937', lineHeight: 1.4 },
  footer: { position: 'absolute', bottom: 20, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: '#6b7280' },
  h2: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', marginTop: 14, marginBottom: 5 },
  bold: { fontFamily: 'Helvetica-Bold' },
  muted: { color: '#6b7280', fontSize: 7.5 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#e5e7eb', paddingVertical: 3.5 },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: '#374151' },
  right: { textAlign: 'right' },
});

export function CotacaoPdf({ d }: { d: DadosCotacaoPdf }) {
  const { cotacao: c, calculo: k, empresa: e } = d;
  const validade = new Date(`${c.data}T12:00:00`);
  validade.setDate(validade.getDate() + (c.validadeDias || 0));
  return (
    <Document title={`Cotação ${c.numero}`} author={e.nome} language="pt-BR">
      <Page size="A4" style={s.page}>
        {/* Timbre */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderBottomWidth: 2, borderBottomColor: e.corPrimaria, paddingBottom: 10 }}>
          <View style={{ maxWidth: '62%' }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf não é <img> */}
            {e.logoUrl ? <Image src={e.logoUrl} style={{ height: 30, objectFit: 'contain', objectPosition: 'left', marginBottom: 4 }} /> : <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold' }}>{e.nome}</Text>}
            <Text style={s.muted}>{e.razaoSocial} · CNPJ {e.cnpj}</Text>
            <Text style={s.muted}>{e.responsavel} · {e.registro}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 8, color: '#6b7280', letterSpacing: 1 }}>COTAÇÃO</Text>
            <Text style={{ fontSize: 16, fontFamily: 'Helvetica-Bold', color: e.corPrimaria }}>Nº {c.numero}</Text>
            <Text style={s.muted}>Emitida em {dataBr(c.data)}</Text>
            {c.validadeDias > 0 && <Text style={s.muted}>Válida até {validade.toLocaleDateString('pt-BR')}</Text>}
          </View>
        </View>

        <View style={{ flexDirection: 'row', marginTop: 12 }}>
          {([['Cliente', c.cliente], ['Obra / local', c.obra], ['Responsável', c.responsavel]] as [string, string][]).filter(([, v]) => v).map(([r, v]) => (
            <View key={r} style={{ flex: 1, paddingRight: 8 }}><Text style={s.muted}>{r}</Text><Text style={s.bold}>{v}</Text></View>
          ))}
        </View>

        <Text style={s.h2}>Serviços</Text>
        <View style={s.row}><Text style={[s.th, { width: 18 }]}>#</Text><Text style={[s.th, { flex: 6 }]}>Serviço</Text><Text style={[s.th, s.right, { flex: 1.8 }]}>Quantidade</Text><Text style={[s.th, s.right, { flex: 1.6 }]}>Preço unit.</Text><Text style={[s.th, s.right, { flex: 1.8 }]}>Total</Text></View>
        {k.itens.map((r, i) => (
          <View key={r.item.id} style={s.row} wrap={false}>
            <Text style={{ width: 18 }}>{i + 1}</Text>
            <View style={{ flex: 6 }}><Text>{r.item.descricao}</Text><Text style={s.muted}>{r.item.base.toUpperCase()} {r.item.cod}{r.item.medidas ? ` · ${r.item.medidas}` : ''}{r.falta ? ' · serviço não encontrado na base atual' : ''}</Text></View>
            <Text style={[s.right, { flex: 1.8 }]}>{num(r.item.qtd)} {un(r.item.unidade)}</Text>
            <Text style={[s.right, { flex: 1.6 }]}>{r.item.qtd > 0 ? brl(r.venda / r.item.qtd) : '—'}</Text>
            <Text style={[s.right, { flex: 1.8 }]}>{brl(r.venda)}</Text>
          </View>
        ))}
        <View style={[s.row, { borderBottomWidth: 0 }]} wrap={false}><Text style={[s.bold, { flex: 9.4, fontSize: 10.5 }]}>Total da cotação</Text><Text style={[s.bold, s.right, { flex: 1.8, fontSize: 10.5 }]}>{brl(k.venda)}</Text></View>

        <Text style={s.h2}>Resumo por natureza de custo</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }} wrap={false}>
          {NATUREZA.filter(([t]) => k.porTipo[t] > 0).map(([t, rotulo]) => (
            <View key={t} style={{ width: '25%', paddingRight: 6, marginBottom: 6 }}>
              <View style={{ borderTopWidth: 1.5, borderTopColor: e.corPrimaria, paddingTop: 4 }}>
                <Text style={s.muted}>{rotulo}</Text><Text style={s.bold}>{brl(k.porTipo[t])}</Text>
                <Text style={s.muted}>{k.venda > 0 ? `${num((k.porTipo[t] / k.venda) * 100, 1)}%` : ''}</Text>
              </View>
            </View>
          ))}
        </View>
        <Text style={s.muted}>Preços com BDI de {num(c.bdi, 2)}% embutido. Referência de custos: {d.referencia}.</Text>
        {k.semPreco > 0 && <Text style={[s.muted, { color: '#b45309', marginTop: 3 }]}>Atenção: {k.semPreco} insumo(s) sem preço — o total está incompleto.</Text>}

        {c.observacoes.trim() !== '' && (<><Text style={s.h2}>Observações</Text><Text>{c.observacoes}</Text></>)}

        {c.detalhar && k.itens.filter((r) => !r.falta).map((r, i) => (
          <View key={`d${r.item.id}`}>
            <Text style={s.h2} minPresenceAhead={50}>Composição de custos — {i + 1}. {r.item.descricao}</Text>
            <View style={s.row}><Text style={[s.th, { flex: 6 }]}>Insumo</Text><Text style={[s.th, s.right, { flex: 1.8 }]}>Consumo</Text><Text style={[s.th, s.right, { flex: 1.6 }]}>Preço unit.</Text><Text style={[s.th, s.right, { flex: 1.8 }]}>Total</Text></View>
            {NATUREZA.map(([t, rotulo]) => {
              const linhas = r.linhas.filter((l) => l.t === t);
              if (!linhas.length) return null;
              return (
                <View key={t}>
                  <View style={[s.row, { backgroundColor: '#f3f4f6' }]} wrap={false}><Text style={[s.bold, { flex: 9.4, fontSize: 8 }]}>{rotulo}</Text><Text style={[s.bold, s.right, { flex: 1.8, fontSize: 8 }]}>{brl(r.vendaPorTipo[t])}</Text></View>
                  {linhas.map((l, j) => (
                    <View key={j} style={[s.row, { paddingVertical: 2.5 }]} wrap={false}>
                      <Text style={{ flex: 6, fontSize: 8 }}>{l.desc}</Text>
                      <Text style={[s.right, { flex: 1.8, fontSize: 8 }]}>{num(l.total)} {un(l.un)}</Text>
                      <Text style={[s.right, { flex: 1.6, fontSize: 8 }]}>{l.precoVenda > 0 ? brl(l.precoVenda) : 'sem preço'}</Text>
                      <Text style={[s.right, { flex: 1.8, fontSize: 8 }]}>{brl(l.totalVenda)}</Text>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        ))}

        <View style={s.footer} fixed>
          <Text>{e.nome} · Cotação {c.numero}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
