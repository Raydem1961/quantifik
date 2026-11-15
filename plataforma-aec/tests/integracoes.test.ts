import { describe, expect, it } from 'vitest';
import { chaveNfeValida, cnpjValido, cpfValido } from '../src/lib/integracoes/documentos';
import { conferir, planilhaTrabalhadores } from '../src/lib/integracoes/esocial';
import { lerNfe, parcelasDaNfe } from '../src/lib/integracoes/nfe';
import { conciliar, lerOfx } from '../src/lib/integracoes/ofx';
import { crc16, normalizarChave, pixCopiaECola, pixIntegro } from '../src/lib/integracoes/pix';

describe('documentos', () => {
  it('CPF e CNPJ pelos dígitos verificadores', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('529.982.247-26')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('11.222.333/0001-82')).toBe(false);
  });
  it('chave de NF-e (módulo 11)', () => {
    const base = '2926111122233300018155001000001234100000123';
    let s = 0, p = 2;
    for (let i = 42; i >= 0; i--) { s += Number(base[i]) * p; p = p === 9 ? 2 : p + 1; }
    const dv = s % 11 < 2 ? 0 : 11 - (s % 11);
    expect(chaveNfeValida(base + dv)).toBe(true);
    expect(chaveNfeValida(base + ((dv + 1) % 10))).toBe(false);
  });
});

const OFX = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL
<BANKACCTFROM><BANKID>0341<ACCTID>12345-6<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20261101120000[-3:BRT]<DTEND>20261110120000[-3:BRT]
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261103120000[-3:BRT]<TRNAMT>248900.00<FITID>A1<MEMO>TED RECEBIDA CLIENTE A</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261105<TRNAMT>-74200,00<FITID>A2<MEMO>PAGTO FORNECEDOR ACO</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261106<TRNAMT>-35.90<FITID>A3<MEMO>TARIFA</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261106<TRNAMT>-35.90<FITID>A3<MEMO>TARIFA</STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>174628.20<DTASOF>20261110</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe('extrato OFX e conciliação', () => {
  const e = lerOfx(OFX);
  it('lê conta, período, saldo e movimentos (inclusive vírgula decimal e FITID repetido)', () => {
    expect(e.banco).toBe('0341'); expect(e.conta).toBe('12345-6');
    expect(e.inicio).toBe('2026-11-01'); expect(e.fim).toBe('2026-11-10'); expect(e.saldo).toBe(174628.2);
    expect(e.movimentos.map((m) => m.valor)).toEqual([248900, -74200, -35.9, -35.9]);
    expect(new Set(e.movimentos.map((m) => m.id)).size).toBe(4);
    expect(e.movimentos[0]!.data).toBe('2026-11-03');
  });
  it('recusa arquivo que não é OFX', () => { expect(() => lerOfx('data;valor\n1;2')).toThrow(/OFX/); });
  it('casa por sentido, valor e data mais próxima; cada lançamento uma vez', () => {
    const fin = [
      { id: 'r', type: 'Receita', value: 248900, status: 'Previsto', dueDate: '2026-11-02' },
      { id: 'd-longe', type: 'Despesa', value: 74200, status: 'Pendente', dueDate: '2026-11-09' },
      { id: 'd-perto', type: 'Despesa', value: 74200, status: 'Pendente', dueDate: '2026-11-05' },
      { id: 'pago', type: 'Despesa', value: 35.9, status: 'Pago', dueDate: '2026-11-06' },
      { id: 'apagado', type: 'Despesa', value: 35.9, status: 'Pendente', dueDate: '2026-11-06', deleted: true },
    ];
    const l = conciliar(e.movimentos, fin);
    expect(l.map((x) => [x.situacao, x.lancamento?.id])).toEqual([['sugestao', 'r'], ['sugestao', 'd-perto'], ['sem_par', undefined], ['sem_par', undefined]]);
    expect(l[0]!.diasDeDiferenca).toBe(1);
  });
  it('não sugere fora da tolerância nem com sentido trocado, e reconhece o que já foi conciliado', () => {
    const l = conciliar(e.movimentos, [
      { id: 'tarde', type: 'Receita', value: 248900, status: 'Previsto', dueDate: '2026-11-20' },
      { id: 'invertido', type: 'Receita', value: 74200, status: 'Previsto', dueDate: '2026-11-05' },
      { id: 'feito', type: 'Despesa', value: 35.9, status: 'Pago', bankRef: 'A3' },
    ]);
    expect(l.map((x) => x.situacao)).toEqual(['sem_par', 'sem_par', 'ja_conciliado', 'sem_par']);
  });
});

describe('Pix copia e cola', () => {
  it('CRC-16/CCITT-FALSE (vetor padrão)', () => { expect(crc16('123456789')).toBe('29B1'); });
  it('monta o BR Code com campos na ordem e CRC íntegro', () => {
    const c = pixCopiaECola({ chave: 'financeiro@construtora.com.br', nome: 'Construtora São João Ltda', cidade: 'Salvador', valor: 1234.5, identificador: 'MED-002/2026' });
    expect(c.startsWith('000201')).toBe(true);
    expect(c).toContain('0014br.gov.bcb.pix0129financeiro@construtora.com.br');
    expect(c).toContain('52040000530398654071234.505802BR5925Construtora Sao Joao Ltda6008Salvador62140510MED0022026');
    expect(pixIntegro(c)).toBe(true);
    expect(pixIntegro(c.replace('1234.50', '9234.50'))).toBe(false);
  });
  it('sem valor (pagador digita) e chaves normalizadas', () => {
    expect(pixCopiaECola({ chave: '11.222.333/0001-81', nome: 'A', cidade: 'B' })).not.toContain('5406');
    expect(normalizarChave('(71) 99999-8888')).toBe('+5571999998888');
    expect(normalizarChave('529.982.247-25')).toBe('52998224725');
    expect(normalizarChave('Fin@Empresa.com')).toBe('fin@empresa.com');
    expect(() => pixCopiaECola({ chave: '', nome: 'A', cidade: 'B' })).toThrow();
    expect(() => pixCopiaECola({ chave: 'a@b.c', nome: 'A', cidade: 'B', valor: -1 })).toThrow();
  });
});

const NFE = `<?xml version="1.0"?><nfeProc><NFe><infNFe Id="NFe29261111222333000181550010000012341000001230" versao="4.00">
<ide><natOp>VENDA DE MERCADORIA</natOp><mod>55</mod><serie>1</serie><nNF>1234</nNF><dhEmi>2026-11-04T10:15:00-03:00</dhEmi></ide>
<emit><CNPJ>11222333000181</CNPJ><xNome>ACOS &amp; FERROS BAHIA LTDA</xNome><xFant>ACOBAHIA</xFant><enderEmit><xMun>Salvador</xMun><UF>BA</UF></enderEmit></emit>
<dest><CNPJ>99888777000166</CNPJ><xNome>CONSTRUTORA TESTE</xNome></dest>
<det nItem="1"><prod><cProd>CA50-10</cProd><xProd>ACO CA-50 10MM</xProd><NCM>72142000</NCM><uCom>KG</uCom><qCom>8000.0000</qCom><vUnCom>6.50</vUnCom><vProd>52000.00</vProd></prod></det>
<det nItem="2"><prod><cProd>CA50-12</cProd><xProd>ACO CA-50 12,5MM</xProd><NCM>72142000</NCM><uCom>KG</uCom><qCom>3000</qCom><vUnCom>7.40</vUnCom><vProd>22200.00</vProd></prod></det>
<total><ICMSTot><vProd>74200.00</vProd><vFrete>0.00</vFrete><vDesc>0.00</vDesc><vNF>74200.00</vNF></ICMSTot></total>
<cobr><dup><nDup>001</nDup><dVenc>2026-12-04</dVenc><vDup>37100.00</vDup></dup><dup><nDup>002</nDup><dVenc>2027-01-04</dVenc><vDup>37100.00</vDup></dup></cobr>
</infNFe></NFe><protNFe><infProt><cStat>100</cStat><nProt>129260000012345</nProt></infProt></protNFe></nfeProc>`;

describe('NF-e (XML)', () => {
  const n = lerNfe(NFE);
  it('lê emitente, itens, total, duplicatas e autorização', () => {
    expect(n.numero).toBe('1234'); expect(n.emissao).toBe('2026-11-04');
    expect(n.emitente).toMatchObject({ cnpj: '11222333000181', nome: 'ACOS & FERROS BAHIA LTDA', uf: 'BA' });
    expect(n.itens).toHaveLength(2); expect(n.itens[0]).toMatchObject({ quantidade: 8000, valorUnitario: 6.5, valorTotal: 52000, unidade: 'KG' });
    expect(n.valorTotal).toBe(74200); expect(n.autorizada).toBe(true);
    expect(parcelasDaNfe(n)).toEqual([{ numero: '001', vencimento: '2026-12-04', valor: 37100 }, { numero: '002', vencimento: '2027-01-04', valor: 37100 }]);
    expect(n.itens.reduce((s, i) => s + i.valorTotal, 0)).toBe(n.valorProdutos);
  });
  it('sem duplicatas: uma conta no valor total; arquivo errado é recusado', () => {
    const semCobr = lerNfe(NFE.replace(/<cobr>[\s\S]*<\/cobr>/, ''));
    expect(parcelasDaNfe(semCobr)).toEqual([{ numero: '001', vencimento: '2026-11-04', valor: 74200 }]);
    expect(() => lerNfe('<html>DANFE</html>')).toThrow(/XML de NF-e/);
  });
});

describe('conferência para o eSocial', () => {
  const ok = { id: '1', name: 'Maria de Souza', cpf: '529.982.247-25', birthDate: '1990-05-10', admission: '2024-02-01', role: 'Engenheira civil', cbo: '2142-05', salary: 12500, status: 'Ativo', workId: 'w1' };
  it('aponta só o que falta; inativos e excluídos ficam de fora', () => {
    const r = conferir([ok, { id: '2', name: 'João', cpf: '123', admission: '2024-01-01', role: '', salary: 0, status: 'Ativo' }, { id: '3', name: 'X Y', status: 'Inativo' }, { ...ok, id: '4', deleted: true }]);
    expect(r).toHaveLength(2);
    expect(r[0]!.pendencias).toEqual(['Nome completo', 'CPF inválido', 'Data de nascimento', 'Função', 'CBO (6 dígitos)', 'Salário']);
    expect(r[1]!.pendencias).toEqual([]);
  });
  it('planilha abre no Excel (BOM, ponto e vírgula) e escapa aspas', () => {
    const csv = planilhaTrabalhadores(conferir([{ ...ok, role: 'Mestre "A"' }]), () => 'Obra 1');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"Maria de Souza";"529.982.247-25";"1990-05-10";"2024-02-01";"Mestre ""A""";"2142-05";"12500,00";"Obra 1";"Ativo";""');
  });
});
