/** Relatório gerencial da obra em PDF: desempenho, cronograma, medições, contratos e caixa. */
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

type Reg = Record<string, any>; // registros com os campos livres do ObraTop

export interface DadosRelatorioObra {
  empresa: { nome: string; responsavel: string; registro: string; corPrimaria: string };
  obra: Reg;
  emitidoEm: string;
  desempenho: { planned: number; actual: number; variance: number; spi: number; cpi: number; ev: number; eac: number };
  orcado: number;
  incorrido: number;
  atividades: (Reg & { critica: boolean; folga: number | null })[];
  linhaBase: { revision: number; date: string; reason: string; items: Record<string, { s: string; e: string }> } | null;
  medicoes: (Reg & { liquido: number; retencao: number })[];
  contratos: (Reg & { atual: number; medido: number; saldo: number })[];
  caixa: { opening: number; rows: { label: string; inflow: number; outflow: number; balance: number }[]; minBalance: number };
}

const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const n1 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const n2 = (v: number) => (Number.isFinite(v) ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
const d = (iso?: string) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—');

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 46, paddingHorizontal: 38, fontSize: 8.5, fontFamily: 'Helvetica', color: '#1f2937', lineHeight: 1.4 },
  h2: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', marginTop: 14, marginBottom: 5 },
  bold: { fontFamily: 'Helvetica-Bold' },
  muted: { color: '#6b7280', fontSize: 7.5 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#e5e7eb', paddingVertical: 3 },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: '#374151' },
  right: { textAlign: 'right' },
  footer: { position: 'absolute', bottom: 20, left: 38, right: 38, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: '#6b7280' },
});

function Barra({ rotulo, valor, cor }: { rotulo: string; valor: number; cor: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3 }}>
      <Text style={{ width: 52, fontSize: 7.5, color: '#6b7280' }}>{rotulo}</Text>
      <View style={{ flex: 1, height: 6, backgroundColor: '#e5e7eb', borderRadius: 3 }}><View style={{ width: `${Math.max(0, Math.min(100, valor))}%`, height: 6, backgroundColor: cor, borderRadius: 3 }} /></View>
      <Text style={[s.right, { width: 38 }]}>{n1(valor)}%</Text>
    </View>
  );
}

export function RelatorioObraPdf({ r }: { r: DadosRelatorioObra }) {
  const p = r.desempenho, cor = r.empresa.corPrimaria;
  const atrasadas = r.atividades.filter((a) => String(a.end) < r.emitidoEm && (Number(a.progress) || 0) < 100).length;
  return (
    <Document title={`Relatório — ${r.obra.name}`} author={r.empresa.nome} language="pt-BR">
      <Page size="A4" style={s.page}>
        <View style={{ borderBottomWidth: 2, borderBottomColor: cor, paddingBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View style={{ maxWidth: '70%' }}>
            <Text style={{ fontSize: 8, color: '#6b7280', letterSpacing: 1 }}>RELATÓRIO GERENCIAL DA OBRA</Text>
            <Text style={{ fontSize: 15, fontFamily: 'Helvetica-Bold' }}>{String(r.obra.name)}</Text>
            <Text style={s.muted}>{[r.obra.client, r.obra.address].filter(Boolean).join(' · ')}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}><Text style={s.bold}>{r.empresa.nome}</Text><Text style={s.muted}>Posição em {d(r.emitidoEm)}</Text><Text style={s.muted}>{String(r.obra.status ?? '')} · {d(r.obra.start)} a {d(r.obra.end)}</Text></View>
        </View>

        <Text style={s.h2}>Desempenho</Text>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1.3, paddingRight: 14 }}>
            <Barra rotulo="Planejado" valor={p.planned} cor="#9ca3af" />
            <Barra rotulo="Realizado" valor={p.actual} cor={cor} />
            <Text style={s.muted}>Desvio de {p.variance > 0 ? '+' : ''}{n1(p.variance)} ponto(s) percentual(is). {atrasadas > 0 ? `${atrasadas} atividade(s) com prazo vencido.` : 'Nenhuma atividade com prazo vencido.'}</Text>
            <Text style={s.muted}>{r.linhaBase ? `Planejado medido sobre a linha de base rev. ${r.linhaBase.revision}, de ${d(r.linhaBase.date)} (${r.linhaBase.reason}).` : 'Sem linha de base congelada: o planejado usa as datas atuais do cronograma.'}</Text>
          </View>
          <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap' }}>
            {([['IDP (prazo)', n2(p.spi)], ['IDC (custo)', n2(p.cpi)], ['Orçado', brl(r.orcado)], ['Valor agregado', brl(p.ev)], ['Custo incorrido', brl(r.incorrido)], ['Estimativa no término', brl(p.eac)]] as [string, string][]).map(([rot, v]) => (
              <View key={rot} style={{ width: '50%', marginBottom: 5 }}><Text style={s.muted}>{rot}</Text><Text style={s.bold}>{v}</Text></View>
            ))}
          </View>
        </View>

        <Text style={s.h2}>Cronograma ({r.atividades.length} atividades)</Text>
        <View style={s.row} fixed><Text style={[s.th, { width: 34 }]}>EAP</Text><Text style={[s.th, { flex: 5 }]}>Atividade</Text><Text style={[s.th, { flex: 1.5 }]}>Início</Text><Text style={[s.th, { flex: 1.5 }]}>Fim</Text>{r.linhaBase && <Text style={[s.th, { flex: 1.5 }]}>Fim (base)</Text>}<Text style={[s.th, s.right, { flex: 1 }]}>%</Text><Text style={[s.th, s.right, { flex: 1.3 }]}>Folga</Text></View>
        {r.atividades.map((a) => (
          <View key={String(a.id)} style={s.row} wrap={false}>
            <Text style={{ width: 34 }}>{String(a.wbs ?? '')}</Text>
            <Text style={[{ flex: 5 }, a.critica ? s.bold : {}]}>{String(a.name)}{a.critica ? '  (crítica)' : ''}</Text>
            <Text style={{ flex: 1.5 }}>{d(a.start)}</Text><Text style={{ flex: 1.5 }}>{d(a.end)}</Text>
            {r.linhaBase && <Text style={{ flex: 1.5 }}>{d(r.linhaBase.items[String(a.id)]?.e)}</Text>}
            <Text style={[s.right, { flex: 1 }]}>{Math.round(Number(a.progress) || 0)}</Text>
            <Text style={[s.right, { flex: 1.3 }]}>{a.folga === null ? '—' : `${Math.max(0, a.folga)} d`}</Text>
          </View>
        ))}

        {r.medicoes.length > 0 && (<>
          <Text style={s.h2}>Medições</Text>
          <View style={s.row}><Text style={[s.th, { width: 34 }]}>Nº</Text><Text style={[s.th, { flex: 1.4 }]}>Data</Text><Text style={[s.th, { flex: 4 }]}>Descrição</Text><Text style={[s.th, { flex: 1.3 }]}>Status</Text><Text style={[s.th, s.right, { flex: 1.8 }]}>Medido</Text><Text style={[s.th, s.right, { flex: 1.6 }]}>Retenção</Text><Text style={[s.th, s.right, { flex: 1.8 }]}>Líquido</Text></View>
          {r.medicoes.map((m) => (
            <View key={String(m.id)} style={s.row} wrap={false}><Text style={{ width: 34 }}>{String(m.number ?? '')}</Text><Text style={{ flex: 1.4 }}>{d(m.date)}</Text><Text style={{ flex: 4 }}>{String(m.description ?? '')}</Text><Text style={{ flex: 1.3 }}>{String(m.status ?? '')}</Text>
              <Text style={[s.right, { flex: 1.8 }]}>{brl(Number(m.value) || 0)}</Text><Text style={[s.right, { flex: 1.6 }]}>{brl(m.retencao)}</Text><Text style={[s.right, { flex: 1.8 }]}>{brl(m.liquido)}</Text></View>
          ))}
          <View style={s.row} wrap={false}><Text style={[s.bold, { flex: 6.7, paddingLeft: 34 }]}>Total</Text><Text style={[s.bold, s.right, { flex: 1.8 }]}>{brl(r.medicoes.reduce((t, m) => t + (Number(m.value) || 0), 0))}</Text><Text style={[s.bold, s.right, { flex: 1.6 }]}>{brl(r.medicoes.reduce((t, m) => t + m.retencao, 0))}</Text><Text style={[s.bold, s.right, { flex: 1.8 }]}>{brl(r.medicoes.reduce((t, m) => t + m.liquido, 0))}</Text></View>
        </>)}

        {r.contratos.length > 0 && (<>
          <Text style={s.h2}>Contratos</Text>
          <View style={s.row}><Text style={[s.th, { flex: 2 }]}>Número</Text><Text style={[s.th, { flex: 3 }]}>Contraparte</Text><Text style={[s.th, s.right, { flex: 2 }]}>Valor atual</Text><Text style={[s.th, s.right, { flex: 2 }]}>Medido</Text><Text style={[s.th, s.right, { flex: 2 }]}>Saldo</Text></View>
          {r.contratos.map((c) => <View key={String(c.id)} style={s.row} wrap={false}><Text style={{ flex: 2 }}>{String(c.number ?? '')}</Text><Text style={{ flex: 3 }}>{String(c.party ?? '')}</Text><Text style={[s.right, { flex: 2 }]}>{brl(c.atual)}</Text><Text style={[s.right, { flex: 2 }]}>{brl(c.medido)}</Text><Text style={[s.right, { flex: 2 }]}>{brl(c.saldo)}</Text></View>)}
        </>)}

        <View wrap={false}>
          <Text style={s.h2}>Fluxo de caixa projetado</Text>
          <Text style={s.muted}>Saldo realizado (recebido − pago): {brl(r.caixa.opening)}. Menor saldo projetado em 6 meses: {brl(r.caixa.minBalance)}.</Text>
          <View style={[s.row, { marginTop: 3 }]}><Text style={[s.th, { flex: 1.5 }]}>Mês</Text><Text style={[s.th, s.right, { flex: 2 }]}>Entradas</Text><Text style={[s.th, s.right, { flex: 2 }]}>Saídas</Text><Text style={[s.th, s.right, { flex: 2 }]}>Saldo acumulado</Text></View>
          {r.caixa.rows.map((x) => <View key={x.label} style={s.row}><Text style={{ flex: 1.5 }}>{x.label}</Text><Text style={[s.right, { flex: 2 }]}>{brl(x.inflow)}</Text><Text style={[s.right, { flex: 2 }]}>{brl(x.outflow)}</Text><Text style={[s.right, { flex: 2 }, x.balance < 0 ? { color: '#b91c1c', fontFamily: 'Helvetica-Bold' } : {}]}>{brl(x.balance)}</Text></View>)}
        </View>

        <View style={s.footer} fixed><Text>{r.empresa.responsavel} · {r.empresa.registro}</Text><Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} /></View>
      </Page>
    </Document>
  );
}
