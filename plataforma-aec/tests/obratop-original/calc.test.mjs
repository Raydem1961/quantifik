import test from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../../src/lib/obratop/vendor/calc.mjs';
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<=e,`${a} ≠ ${b}`);

test('expectedProgress: antes, durante e depois do prazo',()=>{
  const a={start:'2026-01-01',end:'2026-01-11'};
  assert.equal(c.expectedProgress(a,'2025-12-31'),0);near(c.expectedProgress(a,'2026-01-06'),50);assert.equal(c.expectedProgress(a,'2026-02-01'),100);
});
test('durationWeight: peso explícito, dias úteis e intervalo',()=>{
  assert.equal(c.durationWeight({weight:5,durationDays:9}),5);assert.equal(c.durationWeight({durationDays:7}),7);
  assert.equal(c.durationWeight({start:'2026-01-01',end:'2026-01-10'}),10);assert.equal(c.durationWeight({}),1);
});
test('measurementNet: retenção e glosa',()=>{
  const n=c.measurementNet({value:100000,retention:5,deduction:2000});assert.equal(n.retention,5000);assert.equal(n.net,93000);
  assert.equal(c.measurementNet({value:1000,retention:150}).net,0);assert.equal(c.measurementNet({value:1000}).net,1000);
});
test('contractBalance: aditivos e medições vinculadas',()=>{
  const k={id:'c1',value:1000,addendum:200};
  const m=[{contractId:'c1',value:300,status:'Aprovada'},{contractId:'c1',value:100,status:'Paga'},{contractId:'c2',value:999,status:'Paga'},{contractId:'c1',value:50,status:'Paga',deleted:true}];
  const b=c.contractBalance(k,m);assert.equal(b.current,1200);assert.equal(b.measured,400);assert.equal(b.balance,800);near(b.percentLeft,66.6667,1e-3);
  assert.equal(c.contractBalance({id:'x',value:10},[]).hasMeasurements,false);
});
test('pesos por custo exigem 100% das atividades vinculadas; senão duração',()=>{
  const budgets=[{id:'b1',workId:'w',qty:10,unitValue:100,bdi:0},{id:'b2',workId:'w',qty:1,unitValue:3000,bdi:0}];
  const full=[{id:'a1',workId:'w',budgetId:'b1',start:'2026-01-01',end:'2026-01-02'},{id:'a2',workId:'w',budgetId:'b2',start:'2026-01-01',end:'2026-01-30'}];
  let r=c.activityWeights(full,budgets);assert.equal(r.modes.get('w'),'custo');assert.equal(r.weights.get('a1'),1000);assert.equal(r.weights.get('a2'),3000);
  const partial=[full[0],{id:'a3',workId:'w',start:'2026-01-01',end:'2026-01-10'}];
  r=c.activityWeights(partial,budgets);assert.equal(r.modes.get('w'),'duração');assert.equal(r.weights.get('a3'),10);
  const shared=[{id:'a1',workId:'w',budgetId:'b1',start:'2026-01-01',end:'2026-01-02'},{id:'a2',workId:'w',budgetId:'b1',start:'2026-01-03',end:'2026-01-04'}];
  r=c.activityWeights(shared,budgets);assert.equal(r.weights.get('a1'),500);assert.equal(r.weights.get('a2'),500);
});
test('avanço ponderado por custo difere do ponderado por duração',()=>{
  const budgets=[{id:'b1',workId:'w',qty:1,unitValue:1000,bdi:0},{id:'b2',workId:'w',qty:1,unitValue:9000,bdi:0}];
  const base=[{id:'a1',workId:'w',start:'2026-01-01',end:'2026-01-10',progress:100},{id:'a2',workId:'w',start:'2026-01-01',end:'2026-01-10',progress:0}];
  near(c.weightedProgress({acts:base,budgets,day:'2026-01-05'}),50);
  const linked=[{...base[0],budgetId:'b1'},{...base[1],budgetId:'b2'}];
  near(c.weightedProgress({acts:linked,budgets,day:'2026-01-05'}),10);
});
test('linha de base congelada altera só o planejado',()=>{
  const acts=[{id:'a1',workId:'w',start:'2026-02-01',end:'2026-02-11',progress:0}];
  const works=[{id:'w',baseline:{revision:1,items:{a1:{s:'2026-01-01',e:'2026-01-11',w:1}}}}];
  near(c.weightedProgress({acts,works,day:'2026-01-06',planned:true}),50);
  near(c.weightedProgress({acts,works:[],day:'2026-01-06',planned:true}),0);
  assert.equal(c.weightedProgress({acts,works,day:'2026-01-06',planned:false}),0);
});
test('EVM: CPI usa o custo incorrido',()=>{
  const acts=[{id:'a1',workId:'w',start:'2026-01-01',end:'2026-01-11',progress:50}];
  const p=c.schedulePerformance({acts,budget:1000,incurred:400,day:'2026-01-06'});
  near(p.spi,1);near(p.cpi,1.25);near(p.eac,800);near(p.etc,400);near(p.vac,200);
  assert.ok(Number.isNaN(c.schedulePerformance({acts,budget:1000,incurred:0,day:'2026-01-06'}).cpi));
});
test('incurredCost: soma despesas com competência até hoje, exceto Previsto',()=>{
  const fin=[{type:'Despesa',date:'2026-01-01',status:'Pago',value:100},{type:'Despesa',date:'2026-01-02',status:'Pendente',value:50},{type:'Despesa',date:'2026-01-03',status:'Vencido',value:25},
    {type:'Despesa',date:'2026-01-04',status:'Previsto',value:999},{type:'Despesa',date:'2026-03-01',status:'Pendente',value:7},{type:'Receita',date:'2026-01-01',status:'Recebido',value:500},{type:'Despesa',date:'2026-01-01',status:'Pago',value:9,deleted:true}];
  assert.equal(c.incurredCost(fin,'2026-02-01'),175);
});
test('fluxo de caixa projetado: saldo inicial, vencidos em atraso entram no mês atual e alerta de saldo negativo',()=>{
  const fin=[{type:'Receita',status:'Recebido',value:1000,date:'2026-01-01'},{type:'Despesa',status:'Pago',value:200,date:'2026-01-02'},
    {type:'Despesa',status:'Pendente',value:300,dueDate:'2026-02-01'},{type:'Receita',status:'Previsto',value:100,dueDate:'2026-04-10'},{type:'Despesa',status:'Previsto',value:900,dueDate:'2026-05-05'},{type:'Despesa',status:'Previsto',value:5,dueDate:'2027-12-31'}];
  const r=c.cashProjection(fin,'2026-03-15',4);
  assert.equal(r.opening,800);assert.equal(r.rows.length,4);assert.equal(r.rows[0].key,'2026-03');assert.equal(r.rows[0].outflow,300);assert.equal(r.rows[0].balance,500);
  assert.equal(r.rows[1].inflow,100);assert.equal(r.rows[2].outflow,900);assert.equal(r.rows[2].balance,-300);assert.equal(r.firstNegative.key,'2026-05');
});
test('suggestBudgetLinks: vincula só nomes idênticos e únicos na mesma obra',()=>{
  const budgets=[{id:'b1',workId:'w',description:'Pintura interna e externa'},{id:'b2',workId:'w',description:'Piso'},{id:'b3',workId:'w',description:'Piso'},{id:'b4',workId:'z',description:'Alvenaria'}];
  const acts=[{id:'a1',workId:'w',name:'Pintura Interna e Externa'},{id:'a2',workId:'w',name:'Piso'},{id:'a3',workId:'w',name:'Alvenaria'},{id:'a4',workId:'w',name:'Pintura interna e externa',budgetId:'b1'}];
  assert.deepEqual(c.suggestBudgetLinks(acts,budgets),[{activityId:'a1',budgetId:'b1'}]);
});
test('mspdiXml: bem formado, hierarquia, predecessoras e escape',()=>{
  const acts=[{id:'1',wbs:'1.1.1',name:'Escavação & "valas"',start:'2026-03-02',end:'2026-03-06',progress:100,predecessors:''},{id:'2',wbs:'1.1.2',name:'Fundações <bloco>',start:'2026-03-09',end:'2026-03-13',progress:40,predecessors:'1.1.1'},{id:'3',wbs:'1.2.1',name:'Alvenaria',start:'2026-03-16',end:'2026-03-20',progress:0,predecessors:'1.1.2, 9.9.9'}];
  const xml=c.mspdiXml({name:'Obra X'},acts,{phaseNames:{'1.1':'Fase 1.1'}});
  assert.match(xml,/^<\?xml/);assert.equal((xml.match(/<Task>/g)||[]).length,6);
  assert.ok(xml.includes('Escavação &amp; &quot;valas&quot;'));assert.ok(xml.includes('Fundações &lt;bloco&gt;'));
  assert.equal((xml.match(/<PredecessorLink>/g)||[]).length,2);assert.ok(xml.includes('<Summary>1</Summary>'));assert.ok(xml.includes('<Duration>PT40H0M0S</Duration>'));
  assert.ok(xml.includes('<PercentComplete>70</PercentComplete>')||xml.includes('<PercentComplete>69</PercentComplete>')||xml.includes('<PercentComplete>71</PercentComplete>'));
});

test('compositionCost: soma coeficiente × preço por tipo de insumo',()=>{
  const r=c.compositionCost([{kind:'Material',coef:2.5,price:10},{kind:'Mão de obra',coef:1.2,price:20},{kind:'Equipamento',coef:0.5,price:8},{kind:'Qualquer',coef:1,price:1},{kind:'Material',coef:-3,price:5}]);
  assert.equal(r.total,54);assert.equal(r.byKind['Material'],25);assert.equal(r.byKind['Mão de obra'],24);assert.equal(r.byKind['Equipamento'],4);assert.equal(r.byKind['Outros'],1);
  assert.equal(c.compositionCost([]).total,0);assert.equal(c.compositionCost(null).total,0);
});
test('validateComposition: descrição obrigatória, valores não negativos e limite',()=>{
  assert.equal(c.validateComposition([{description:'Cimento',coef:1,price:2}]),'');
  assert.match(c.validateComposition([{description:' ',coef:1,price:2}]),/descrição/);
  assert.match(c.validateComposition([{description:'x',coef:-1,price:2}]),/negativos/);
  assert.match(c.validateComposition(Array.from({length:61},()=>({description:'x',coef:1,price:1}))),/60/);
});

test('bulkFields: só campos de lista e data, sem a obra',()=>{
  const f=[['workId','Obra','work',1],['name','Nome','text',1],['status','Status','select',1,['A','B']],['start','Início','date',1],['value','Valor','number']];
  assert.deepEqual(c.bulkFields(f).map(x=>x[0]),['status','start']);
});
test('chunk divide em blocos',()=>{assert.deepEqual(c.chunk([1,2,3,4,5],2),[[1,2],[3,4],[5]]);assert.deepEqual(c.chunk([],3),[])});
test('validateBulkChange: valor permitido, data válida e início ≤ término',()=>{
  const st=['status','Status','select',1,['Ativo','Encerrado']],dt=['end','Fim','date',1];
  assert.equal(c.validateBulkChange([{id:'a'}],st,'Ativo').ok,true);
  assert.equal(c.validateBulkChange([{id:'a'}],st,'Outro').ok,false);assert.equal(c.validateBulkChange([{id:'a'}],st,'').ok,false);
  assert.equal(c.validateBulkChange([{id:'a'}],['value','Valor','number'],'1').ok,false);
  assert.equal(c.validateBulkChange([{id:'a',start:'2026-01-01'}],dt,'2026-02-30x').ok,false);
  const r=c.validateBulkChange([{id:'a',start:'2026-03-01',end:'2026-04-01'},{id:'b',start:'2026-06-01',end:'2026-07-01'}],dt,'2026-05-01');
  assert.equal(r.ok,false);assert.deepEqual(r.conflicts,['b']);
  assert.deepEqual(c.validateBulkChange([{id:'a',start:'2026-03-01'},{id:'b'}],dt,'2026-05-01').affected,['a','b']);
});
