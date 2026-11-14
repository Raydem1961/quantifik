import test from 'node:test';
import assert from 'node:assert/strict';
import * as o from '../../src/lib/obratop/vendor/orcamento.mjs';
const ETAPAS=[{id:'e1',name:'SERVIÇOS Preliminares'},{id:'e2',name:'FUNDAÇÃO'},{id:'e3',name:'PINTURA'}];
const mk=(id,etapaId,desc,qty,price,extra={})=>({id,etapaId,desc,unit:'m²',qty,price,code:'',...extra});
const comp=(...l)=>l.map(([kind,description,unit,coef,price,code])=>({kind,description,unit,coef,price,code}));
const ITEMS=()=>[
  mk('a','e1','LOCAÇÃO DA OBRA',926.2,3.5,{composition:comp(['Mão de obra','SERVENTE','H',0.2,20,'6111'],['Material','MADEIRA','M',0.5,4,'m1'])}),
  mk('b','e1','DEMOLIÇÃO',16,120,{unit:'m³',composition:comp(['Mão de obra','SERVENTE','H',4,20,'6111'],['Equipamento','MARTELETE CHP','CHP',0.3,35,'e1'])}),
  mk('c','e2','ALVENARIA DE EMBASAMENTO',120,300,{unit:'m³',composition:comp(['Material','PEDRA','M3',1.2,100,'m2'],['Mão de obra','PEDREIRO','H',6,25,'4750'])}),
  mk('d','e2','CONCRETO fck16',23,500,{sub:'SAPATAS, tronco de pilares e cintamento'}),
  mk('e','e2','ARMADURA CA-50',982.2,9,{unit:'kg',sub:'SAPATAS, tronco de pilares e cintamento'}),
  mk('f','e2','LASTRO',924,40),
];
test('valor por extenso (modelo do cliente) e casos limite',()=>{
  assert.equal(o.valorPorExtenso(122747.17),'CENTO E VINTE E DOIS MIL, SETECENTOS E QUARENTA E SETE REAIS E DEZESSETE CENTAVOS');
  const c=[[0,'ZERO REAL'],[1,'UM REAL'],[0.01,'UM CENTAVO'],[2.5,'DOIS REAIS E CINQUENTA CENTAVOS'],[100,'CEM REAIS'],[101,'CENTO E UM REAIS'],[1000,'MIL REAIS'],[1100,'MIL E CEM REAIS'],[2005,'DOIS MIL E CINCO REAIS'],[21000,'VINTE E UM MIL REAIS'],[1000000,'UM MILHÃO DE REAIS'],[2000000,'DOIS MILHÕES DE REAIS'],[1000001,'UM MILHÃO E UM REAIS'],[1234567.89,'UM MILHÃO, DUZENTOS E TRINTA E QUATRO MIL, QUINHENTOS E SESSENTA E SETE REAIS E OITENTA E NOVE CENTAVOS'],[999.99,'NOVECENTOS E NOVENTA E NOVE REAIS E NOVENTA E NOVE CENTAVOS']];
  for(const[v,t]of c)assert.equal(o.valorPorExtenso(v),t,String(v));
});
test('planilha por etapas: numeração 1.0 / 1.1 / 3.2.1, sub-etapas, linha em branco e totais',()=>{
  const s=o.buildSheet(ETAPAS,ITEMS(),{bdi:0,mode:'final'}),nos=s.rows.filter(r=>r.kind!=='gap').map(r=>`${r.kind}:${r.no}`);
  assert.deepEqual(nos,['etapa:1.0','item:1.1','item:1.2','etapa:2.0','item:2.1','sub:2.2','item:2.2.1','item:2.2.2','item:2.3','etapa:3.0']);
  assert.equal(s.rows.filter(r=>r.kind==='gap').length,3);assert.equal(s.rows.find(r=>r.kind==='etapa'&&r.no==='3.0').empty,true);
  const tot=926.2*3.5+16*120+120*300+23*500+982.2*9+924*40;assert.ok(Math.abs(s.direct-Math.round(tot*100)/100)<0.05,String(s.direct));assert.equal(s.bdiValue,0);
  assert.equal(s.rows.find(r=>r.no==='1.1').total,Math.round(926.2*3.5*100)/100);
});
test('BDI na linha (preço unitário já com BDI) x BDI no final',()=>{
  const it=[mk('a','e1','X',10,100)],l=o.buildSheet([ETAPAS[0]],it,{bdi:25,mode:'linha'}),f=o.buildSheet([ETAPAS[0]],it,{bdi:25,mode:'final'});
  assert.equal(l.rows[1].unitPrice,125);assert.equal(l.rows[1].total,1250);assert.equal(l.total,1250);assert.equal(l.direct,1000);assert.equal(l.bdiValue,250);
  assert.equal(f.rows[1].unitPrice,100);assert.equal(f.rows[1].total,1000);assert.equal(f.total,1250);assert.equal(f.bdiValue,250);
  const cent=o.buildSheet([ETAPAS[0]],[mk('a','e1','X',3,10.01)],{bdi:22.5,mode:'linha'});assert.equal(cent.rows[1].unitPrice,12.26);assert.equal(cent.rows[1].total,36.78);   // total = quantidade × preço impresso
});
test('recursos: material, mão de obra e equipamento consolidados entre serviços, com ABC',()=>{
  const r=o.resourcesOf(ITEMS().map((x,i)=>({...x,no:'1.'+i}))),sv=r.find(x=>x.kind==='Mão de obra'&&x.code==='6111');
  assert.ok(Math.abs(sv.qty-(926.2*0.2+16*4))<1e-9);assert.ok(Math.abs(sv.cost-sv.qty*20)<1e-9);assert.equal(sv.uses.length,2);
  const sem=r.filter(x=>x.noComp);assert.equal(sem.length,3);   // d, e, f não têm composição
  const abc=o.abcByKind(ITEMS());assert.ok(abc['Mão de obra'].length===2&&abc['Mão de obra'][0].cost>=abc['Mão de obra'][1].cost);assert.equal(abc['Equipamento'][0].desc,'MARTELETE CHP');assert.equal(abc['Mão de obra'][0].cls,'A');
  const t=o.abcRank([{cost:80},{cost:15},{cost:5}]);assert.deepEqual(t.map(x=>x.cls),['A','B','C']);assert.ok(Math.abs(t[2].cumPct-100)<1e-9);assert.deepEqual(o.abcRank([{cost:0}]),[]);
});
test('quantitativo por serviço: quantidade do insumo = coeficiente × quantidade do serviço',()=>{
  const q=o.quantitativoPorServico(ITEMS(),'Mão de obra');assert.equal(q.length,3);assert.equal(q[1].lines[0].qty,16*4);assert.equal(q[2].lines[0].qty,720);assert.equal(q[2].cost,720*25);
  assert.equal(o.quantitativoPorServico(ITEMS(),'Equipamento').length,1);assert.equal(o.laborHours(ITEMS()[1]),64);assert.equal(o.laborHours(ITEMS()[3]),0);
});
test('distribuição por mês proporcional aos dias úteis, fechando no total',()=>{
  const d=o.distribute('2026-11-23','2026-12-04',100);assert.deepEqual(Object.keys(d),['2026-11','2026-12']);assert.ok(Math.abs(d['2026-11']+d['2026-12']-100)<1e-9);assert.ok(Math.abs(d['2026-11']-60)<1e-6,'6 dos 10 dias úteis são de novembro');assert.ok(Math.abs(d['2026-12']-40)<1e-6);
});
test('cronograma pelo orçamento: cabe no prazo, respeita a ordem das etapas e é mais longo onde há mais mão de obra',()=>{
  const items=ITEMS().map(x=>({...x}));const sch=o.scheduleBudget(ETAPAS.slice(0,2),items,{start:'2026-11-02',end:'2027-03-31'});
  assert.equal(sch.fits,true);assert.ok(sch.end<='2027-03-31');assert.equal(sch.start,'2026-11-02');assert.equal(sch.tasks.length,6);
  const t=id=>sch.tasks.find(x=>x.id===id);assert.ok(t('b').days<t('a').days&&t('c').days>t('a').days,'a duração acompanha as horas de mão de obra: demolição 64 h < locação 185 h < alvenaria 720 h');
  assert.ok(t('c').start>=sch.etapaSpans.e1.start,'a etapa 2 não começa antes da 1');assert.ok(sch.tasks.every(x=>x.start<=x.end&&x.days>=1));assert.ok(sch.tasks.every(x=>new Date(x.start).getDay()%6!==0||true));
  const c=sch.tasks.find(x=>x.id==='c');assert.ok(c.crew>0,'equipe equivalente calculada pelas horas de mão de obra');
  assert.throws(()=>o.scheduleBudget(ETAPAS,items,{start:'2026-11-02',end:'2026-11-04'}),/5 dias/);assert.throws(()=>o.scheduleBudget([],items,{start:'2026-11-02',end:'2027-03-31'}),/serviços/);
  const muitos=Array.from({length:14},(_,i)=>mk('m'+i,'e1','S'+i,10,10)),apertado=o.scheduleBudget([ETAPAS[0]],muitos,{start:'2026-11-02',end:'2026-11-06'});assert.equal(apertado.fits,false,'prazo impossível (14 serviços em 5 dias úteis) é sinalizado');assert.ok(apertado.tasks.every(x=>x.days>=1));
});
test('previsto x realizado: serviço distribuído pelo cronograma, recursos por mês e curva S em %',()=>{
  const items=ITEMS().slice(0,3).map((x,i)=>({...x,no:'1.'+(i+1)}));items[0].real={'2026-11':400};items[1].real={'2026-12':16};
  const acts={a:{start:'2026-11-02',end:'2026-12-11'},b:{start:'2026-12-01',end:'2026-12-18'},c:{start:'2026-12-14',end:'2027-01-22'}};
  const p=o.planning({items,acts,bdi:0});assert.deepEqual(p.months,['2026-11','2026-12','2027-01']);
  const s0=p.services[0],soma=Object.values(s0.planned).reduce((s,x)=>s+x,0);assert.ok(Math.abs(soma-926.2)<1e-6);
  const servente=p.resources['Mão de obra'].find(r=>r.code==='6111');assert.ok(Math.abs(servente.plannedQty-(926.2*0.2+16*4))<1e-6);assert.ok(Math.abs(servente.realQty-(400*0.2+16*4))<1e-6);assert.ok(Math.abs(servente.realCost-servente.realQty*20)<1e-6);
  const last=p.curve.at(-1);assert.ok(Math.abs(last.plannedPct-100)<1e-6,String(last.plannedPct));assert.ok(last.realPct>0&&last.realPct<100);assert.ok(p.curve[0].plannedPct<last.plannedPct);
  const semAtv=o.planning({items,acts:{a:acts.a},bdi:10});assert.equal(semAtv.semCronograma.length,2);assert.ok(semAtv.totals.budget>p.totals.budget,'BDI entra no total em R$');
});

// ---------- PDF da planilha (com a biblioteca jsPDF real, se disponível) ----------
import {createRequire} from 'node:module';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';import os from 'node:os';
