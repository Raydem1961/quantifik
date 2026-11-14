// ObraTop — motor de análise. Não grava dados nem soma compras novamente ao financeiro.
export const numeric = v => v === null || v === undefined || v === '' || typeof v === 'boolean' ? null : Number.isFinite(Number(v)) ? Number(v) : null;
export const isoDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v+'T00:00:00Z').toISOString().slice(0,10) === v;
const sum = (a, fn=x=>x.value) => a.reduce((s,x)=>s+fn(x),0);
export function adjustment(p={}) {
 const base=numeric(p.baseIndex),current=numeric(p.currentIndex),amount=numeric(p.eligibleAmount);
 const valid=base>0&&current>0&&amount!==null&&amount>=0&&p.indexName&&p.indexSource&&isoDate(p.baseDate)&&isoDate(p.indexDate)&&p.indexDate>=p.baseDate;
 if(!valid)return {value:null,rate:null,reason:'Informe série, fonte, datas, números-índice positivos e parcela elegível.'};
 return {value:amount*(current/base-1),rate:current/base-1,reason:'Simulação aritmética; conferir cláusula, interregno, parcela elegível e aprovação contratual.'};
}
export function analyze(work,data,cutoff) {
 if(!work?.id||!isoDate(cutoff))throw Error('Obra e data de corte válidas são obrigatórias.');
 const warnings=[],scope=t=>(data[t]||[]).filter(x=>!x.deleted&&x.workId===work.id),p=work.economics||{};
 const budgets=scope('budgets'),finance=scope('finance'),measurements=scope('measurements');
 const validBudgets=budgets.filter(x=>numeric(x.qty)!==null&&numeric(x.qty)>=0&&numeric(x.unitValue)!==null&&numeric(x.unitValue)>=0&&numeric(x.bdi)!==null&&numeric(x.bdi)>=0);
 if(validBudgets.length!==budgets.length)warnings.push('Há itens de orçamento com quantidade, custo ou BDI inválidos; totais orçamentários indisponíveis.');
 const budget=budgets.length&&validBudgets.length===budgets.length?sum(budgets,x=>Number(x.qty)*Number(x.unitValue)):null;
 const sale=budget!==null?sum(budgets,x=>Number(x.qty)*Number(x.unitValue)*(1+Number(x.bdi)/100)):null;
 const valid=finance.filter(x=>numeric(x.value)!==null&&numeric(x.value)>=0&&isoDate(x.date)&&['Receita','Despesa'].includes(x.type)&&['Previsto','Pendente','Pago','Recebido','Vencido'].includes(x.status)&&!(x.type==='Receita'&&x.status==='Pago')&&!(x.type==='Despesa'&&x.status==='Recebido'));
 if(valid.length!==finance.length)warnings.push(`${finance.length-valid.length} lançamento(s) financeiro(s) inválido(s), excluído(s) da análise. Corrigir antes de decidir.`);
 const accrued=valid.filter(x=>x.type==='Despesa'&&x.status!=='Previsto'&&x.date<=cutoff);
 const incurred=accrued.length?sum(accrued,x=>Number(x.value)):null;
 const settled=valid.filter(x=>['Pago','Recebido'].includes(x.status));
 const dated=settled.filter(x=>isoDate(x.paymentDate));
 if(dated.length!==settled.length)warnings.push(`${settled.length-dated.length} pagamento(s)/recebimento(s) sem data de liquidação: fora do caixa realizado. Preencha no Financeiro.`);
 const cash=dated.filter(x=>x.paymentDate<=cutoff),received=sum(cash.filter(x=>x.type==='Receita'),x=>Number(x.value)),paid=sum(cash.filter(x=>x.type==='Despesa'),x=>Number(x.value));
 const pending=valid.filter(x=>!['Pago','Recebido'].includes(x.status)||isoDate(x.paymentDate)&&x.paymentDate>cutoff);
 const overdue=pending.filter(x=>x.status!=='Previsto'&&isoDate(x.dueDate)&&x.dueDate<cutoff);
 const contract=numeric(work.value),remaining=numeric(p.remainingCost)!==null&&numeric(p.remainingCost)>=0?numeric(p.remainingCost):null,initial=numeric(p.initialCash);
 const eac=incurred!==null&&remaining!==null&&remaining>=0?incurred+remaining:null;
 const margin=contract!==null&&eac!==null?contract-eac:null;
 if(budget===null)warnings.push('Orçamento insuficiente para comparar custos.');
 if(remaining===null)warnings.push('Informe a estimativa de custo restante para projetar custo final e margem.');
 if(initial===null)warnings.push('Saldo inicial ausente: o fluxo apresenta movimento líquido, sem saldo bancário.');
 if(contract===null)warnings.push('Valor contratual não informado.');
 if(isoDate(work.end)&&cutoff>work.end&&work.status!=='Concluída')warnings.push('Prazo previsto da obra vencido; revisar cronograma e custos de permanência.');
 if(margin!==null&&margin<0)warnings.push('Custo final estimado superior ao valor contratual. Revisar produtividade, escopo e custos restantes.');
 if(overdue.some(x=>x.type==='Despesa'))warnings.push('Há despesas vencidas: negociar pagamentos e revisar disponibilidade de caixa.');
 const months=new Map(), bucket=key=>{if(!months.has(key))months.set(key,{month:key,received:0,paid:0,forecastIn:0,forecastOut:0,cost:0});return months.get(key)};
 for(const x of cash)bucket(x.paymentDate.slice(0,7))[x.type==='Receita'?'received':'paid']+=Number(x.value);
 for(const x of accrued)bucket(x.date.slice(0,7)).cost+=Number(x.value);
 let undated=0;
 for(const x of pending){if(!isoDate(x.dueDate)){undated++;continue;}bucket((x.dueDate<cutoff?cutoff:x.dueDate).slice(0,7))[x.type==='Receita'?'forecastIn':'forecastOut']+=Number(x.value)}
 if(undated)warnings.push(`${undated} previsão(ões)/pendência(s) sem vencimento: fora do fluxo projetado.`);
 let keys=[...months.keys()].sort();
 if(keys.length){let cursor=keys[0];let guard=0;while(cursor<=keys.at(-1)&&guard++<1200){bucket(cursor);const [y,m]=cursor.split('-').map(Number);cursor=m===12?`${y+1}-01`:`${y}-${String(m+1).padStart(2,'0')}`}}
 let balance=initial??0;const rows=[...months.values()].sort((a,b)=>a.month.localeCompare(b.month)).map(x=>{balance+=x.received-x.paid+x.forecastIn-x.forecastOut;return{...x,net:x.received-x.paid,projectedBalance:balance}});
 const minBalance=rows.length?Math.min(initial??0,...rows.map(x=>x.projectedBalance)):initial;
 const funding=initial!==null&&minBalance!==null?Math.max(0,-minBalance):null;
 const costRows=rows.filter(x=>x.month<=cutoff.slice(0,7));
 const mean=costRows.length?sum(costRows,x=>x.cost)/costRows.length:null;
 const sd=costRows.length>=2?Math.sqrt(sum(costRows,x=>(x.cost-mean)**2)/(costRows.length-1)):null;
 const categories=Object.entries(accrued.reduce((a,x)=>{const k=x.category||'Sem categoria';a[k]=(a[k]||0)+Number(x.value);return a},Object.create(null))).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
 let cumulative=0;for(const x of categories){x.share=incurred>0?x.value/incurred:0;x.class=cumulative<.8?'A':cumulative<.95?'B':'C';cumulative+=x.share;x.cumulative=cumulative}
 const measured=measurements.filter(x=>['Aprovada','Faturada','Paga'].includes(x.status)&&isoDate(x.date)&&x.date<=cutoff&&numeric(x.value)!==null&&numeric(x.value)>=0);
 const adj=adjustment(p);
 const scenarios=[-10,0,10].map(change=>{const cost=incurred!==null&&remaining!==null?incurred+remaining*(1+change/100):null;return{change,cost,margin:cost!==null&&contract!==null?contract-cost:null}});
 return {workId:work.id,workName:work.name,cutoff,budget,sale,contract,incurred,eac,margin,marginPct:contract>0&&margin!==null?margin/contract*100:null,remaining,received,paid,net:received-paid,initial,funding,overduePay:sum(overdue.filter(x=>x.type==='Despesa'),x=>Number(x.value)),overdueReceive:sum(overdue.filter(x=>x.type==='Receita'),x=>Number(x.value)),measured:sum(measured,x=>Number(x.value)),rows,categories,mean,sd,cv:mean>0&&sd!==null?sd/mean*100:null,adjustment:adj,scenarios,warnings,counts:{budgets:budgets.length,finance:finance.length,validFinance:valid.length,measurements:measured.length},sourceIds:{budgets:budgets.map(x=>x.id),finance:valid.map(x=>x.id),measurements:measured.map(x=>x.id)}};
}
