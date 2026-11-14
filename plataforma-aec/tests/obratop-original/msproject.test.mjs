import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../../src/lib/obratop/vendor/msproject.mjs';
const T=(id,wbs,start,end,pred='',extra={})=>({id,wbs,start,end,pred,...extra});

test('predecessoras no padrão do MS Project: tipo (FS/SS/FF/SF e TI/II/TT/IT) e defasagem em dias',()=>{
  assert.deepEqual(m.parsePred('3'),[{code:'3',type:'FS',lag:0}]);
  assert.deepEqual(m.parsePred('3;5SS+2d;1.2FF-1d;4TI;7II+3 dias'),[{code:'3',type:'FS',lag:0},{code:'5',type:'SS',lag:2},{code:'1.2',type:'FF',lag:-1},{code:'4',type:'FS',lag:0},{code:'7',type:'SS',lag:3}]);
  assert.deepEqual(m.parsePred('2.1.3SF+4d'),[{code:'2.1.3',type:'SF',lag:4}]);assert.deepEqual(m.parsePred(''),[]);assert.deepEqual(m.parsePred(null),[]);assert.deepEqual(m.parsePred('@@;;'),[]);
  assert.equal(m.fmtPred(m.parsePred('3;5SS+2d;1.2FF-1d')),'3;5SS+2d;1.2FF-1d');assert.equal(m.fmtPred([{code:'9',type:'FS',lag:0}]),'9');
  assert.deepEqual(m.parsePred('1.2,1.3'),[{code:'1.2',type:'FS',lag:0},{code:'1.3',type:'FS',lag:0}],'lista antiga separada por vírgula continua valendo');
});
test('caminho crítico: cadeia sem folga é crítica; tarefa paralela curta tem folga; resumo é ignorado',()=>{
  const r=m.cpm([T('a','1','2026-11-02','2026-11-06'),T('b','2','2026-11-09','2026-11-13','1'),T('c','3','2026-11-16','2026-11-20','2'),T('d','4','2026-11-09','2026-11-10','1'),T('s','5','2026-11-02','2026-11-20','',{summary:true})]);
  for(const k of['a','b','c'])assert.equal(r.get(k).critical,true,k);
  assert.equal(r.get('d').critical,false);assert.equal(r.get('d').slack,8);assert.equal(r.has('s'),false);assert.equal(r.get('c').slack,0);
});
test('caminho crítico com início-início e defasagem (como o cronograma gerado do orçamento)',()=>{
  // B começa 2 dias úteis depois de A (SS+2d) e termina por último; A não pode atrasar sem atrasar B
  const r=m.cpm([T('a','1','2026-11-02','2026-11-13'),T('b','2','2026-11-04','2026-11-20','1SS+2d'),T('x','3','2026-11-02','2026-11-06')]);
  assert.equal(r.get('b').critical,true);assert.equal(r.get('a').critical,true,'A dirige o início de B');assert.equal(r.get('x').critical,false);assert.ok(r.get('x').slack>0);
});
test('caminho crítico: ligação que o cronograma já violou resulta em folga negativa (crítica) e ciclo não trava',()=>{
  const neg=m.cpm([T('a','1','2026-11-02','2026-11-13'),T('b','2','2026-11-04','2026-11-10','1')]);assert.equal(neg.get('a').critical,true);assert.ok(neg.get('a').slack<=0);
  const cic=m.cpm([T('a','1','2026-11-02','2026-11-06','2'),T('b','2','2026-11-09','2026-11-13','1')]);assert.equal(cic.size,2);   // não entra em laço infinito
  assert.equal(m.cpm([]).size,0);
});
const XML=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project"><Name>Obra Exemplo &amp; Cia</Name><Title>Reforma da UBS</Title><StartDate>2026-11-02T08:00:00</StartDate><FinishDate>2027-01-15T17:00:00</FinishDate>
<Tasks>
<Task><UID>0</UID><ID>0</ID><Name>Reforma da UBS</Name><OutlineLevel>0</OutlineLevel><Summary>1</Summary></Task>
<Task><UID>1</UID><ID>1</ID><Name>Fundação</Name><WBS>1</WBS><OutlineNumber>1</OutlineNumber><OutlineLevel>1</OutlineLevel><Start>2026-11-02T08:00:00</Start><Finish>2026-12-04T17:00:00</Finish><Duration>PT184H0M0S</Duration><PercentComplete>40</PercentComplete><Summary>1</Summary></Task>
<Task><UID>2</UID><ID>2</ID><Name>Escavação</Name><WBS>1.1</WBS><OutlineNumber>1.1</OutlineNumber><OutlineLevel>2</OutlineLevel><Start>2026-11-02T08:00:00</Start><Finish>2026-11-13T17:00:00</Finish><Duration>PT80H0M0S</Duration><PercentComplete>100</PercentComplete><Summary>0</Summary><Milestone>0</Milestone><Baseline><Number>0</Number><Start>2026-11-02T08:00:00</Start><Finish>2026-11-12T17:00:00</Finish></Baseline></Task>
<Task><UID>3</UID><ID>3</ID><Name>Concretagem</Name><WBS>1.2</WBS><OutlineNumber>1.2</OutlineNumber><OutlineLevel>2</OutlineLevel><Start>2026-11-16T08:00:00</Start><Finish>2026-12-04T17:00:00</Finish><Duration>PT120H0M0S</Duration><PercentComplete>10</PercentComplete><Critical>1</Critical><Summary>0</Summary><PredecessorLink><PredecessorUID>2</PredecessorUID><Type>3</Type><LinkLag>9600</LinkLag><LagFormat>7</LagFormat></PredecessorLink></Task>
<Task><UID>4</UID><ID>4</ID><Name>Marco: fundação concluída</Name><WBS>1.3</WBS><OutlineLevel>2</OutlineLevel><Start>2026-12-04T17:00:00</Start><Finish>2026-12-04T17:00:00</Finish><Duration>PT0H0M0S</Duration><Summary>0</Summary><Milestone>1</Milestone><PredecessorLink><PredecessorUID>3</PredecessorUID><Type>1</Type><LinkLag>0</LinkLag></PredecessorLink></Task>
<Task><UID>5</UID><ID>5</ID><Name>Tarefa vazia</Name><IsNull>1</IsNull></Task>
</Tasks>
<Resources><Resource><UID>0</UID><ID>0</ID></Resource><Resource><UID>1</UID><ID>1</ID><Name>Pedreiro</Name></Resource><Resource><UID>2</UID><ID>2</ID><Name>Betoneira</Name></Resource></Resources>
<Assignments><Assignment><UID>1</UID><TaskUID>2</TaskUID><ResourceUID>1</ResourceUID></Assignment><Assignment><UID>2</UID><TaskUID>3</TaskUID><ResourceUID>1</ResourceUID></Assignment><Assignment><UID>3</UID><TaskUID>3</TaskUID><ResourceUID>2</ResourceUID></Assignment></Assignments></Project>`;
test('XML do MS Project: lê projeto, tarefas, resumos, marcos, vínculos (tipo e defasagem), recursos e linha de base',()=>{
  const p=m.parseMspdi(XML);assert.equal(p.name,'Reforma da UBS');assert.equal(p.start,'2026-11-02');assert.equal(p.tasks.length,4,'tarefa 0 (projeto) e tarefa nula ficam de fora');
  const t=Object.fromEntries(p.tasks.map(x=>[x.wbs,x]));assert.equal(t['1'].summary,true);assert.equal(t['1.1'].pct,100);assert.equal(t['1.1'].dur,10);assert.deepEqual(t['1.1'].base,{s:'2026-11-02',e:'2026-11-12'});
  assert.deepEqual(t['1.2'].preds,[{uid:'2',type:'SS',lag:2}]);assert.equal(t['1.2'].critical,true);assert.deepEqual(t['1.2'].resources,['Pedreiro','Betoneira']);assert.equal(t['1.3'].milestone,true);assert.deepEqual(p.resources,['Pedreiro','Betoneira']);
});
test('importação para atividades do ObraTop: EAP, predecessoras por código EAP, recursos, status e marco',()=>{
  const {activities:a}=m.toActivities(m.parseMspdi(XML),{workId:'w1'}),by=Object.fromEntries(a.map(x=>[x.wbs,x]));
  assert.equal(a.length,3);assert.equal(by['1.1'].status,'Concluída');assert.equal(by['1.2'].status,'Em andamento');assert.equal(by['1.2'].predecessors,'1.1SS+2d');assert.equal(by['1.2'].responsible,'Pedreiro; Betoneira');
  assert.equal(by['1.3'].milestone,true);assert.equal(by['1.3'].durationDays,0);assert.equal(by['1.3'].predecessors,'1.2');assert.equal(by['1.1'].eapPhaseName,'Fundação');assert.equal(by['1.1'].workId,'w1');assert.equal(by['1.1'].durationDays,10);assert.equal(by['1.1']._base.e,'2026-11-12');
  assert.ok(a.every(x=>x.progressMode==='Percentual'&&x.source==='MS Project'));
});
test('exportação e leitura de volta (ida e volta) preservam EAP, datas, vínculos, recursos, marcos e linha de base',()=>{
  const acts=[{id:'a1',wbs:'1.1',name:'Escavação',start:'2026-11-02',end:'2026-11-13',progress:100,predecessors:'',responsible:'Pedreiro',durationDays:10,eapPhaseCode:'1.1',eapPhaseName:'Fundação'},
    {id:'a2',wbs:'1.2',name:'Concretagem & lastro',start:'2026-11-16',end:'2026-12-04',progress:10,predecessors:'1.1SS+2d',responsible:'Pedreiro; Betoneira',durationDays:15},
    {id:'a3',wbs:'1.3',name:'Marco',start:'2026-12-04',end:'2026-12-04',progress:0,predecessors:'1.2',durationDays:0,milestone:true}];
  const cr=m.cpm(acts.map(a=>({id:a.id,wbs:a.wbs,start:a.start,end:a.end,pred:a.predecessors,summary:false})));
  const xml=m.mspdiExport({name:'Obra X'},acts,{phaseNames:{'1':'Obra X'},baseline:{items:{a1:{s:'2026-11-02',e:'2026-11-12',w:1}}},critical:cr});
  assert.ok(xml.indexOf('<Tasks>')<xml.indexOf('<Resources>')&&xml.indexOf('<Resources>')<xml.indexOf('<Assignments>'),'ordem Tasks > Resources > Assignments');
  assert.ok(xml.includes('<Type>3</Type>')&&xml.includes('<LinkLag>9600</LinkLag>'),'SS com 2 dias de defasagem = tipo 3 e 9600');assert.ok(xml.includes('<Baseline><Number>0</Number>')&&xml.includes('Concretagem &amp; lastro'));
  const p=m.parseMspdi(xml),back=m.toActivities(p,{workId:'w1'}).activities,by=Object.fromEntries(back.map(x=>[x.wbs,x]));
  assert.equal(back.length,3);assert.equal(by['1.2'].name,'Concretagem & lastro');assert.equal(by['1.2'].start,'2026-11-16');assert.equal(by['1.2'].end,'2026-12-04');assert.equal(by['1.2'].predecessors,'1.1SS+2d');assert.equal(by['1.2'].responsible,'Pedreiro; Betoneira');assert.equal(by['1.3'].milestone,true);assert.equal(by['1.1'].progress,100);assert.equal(by['1.1']._base.e,'2026-11-12');
  assert.equal(p.tasks.find(t=>t.wbs==='1').summary,true,'o grupo "1" foi criado como tarefa resumo');
});
test('arquivo inválido: mensagem clara para XML que não é do MS Project ou malformado',()=>{
  assert.throws(()=>m.parseMspdi('<html><body>oi</body></html>'),/não é um XML do MS Project/);assert.throws(()=>m.parseMspdi('<Project><Tasks><Task>'),/malformad|incompleto/);assert.throws(()=>m.parseMspdi(''),/MS Project|XML/);
  const p=m.parseMspdi('<Project><Tasks><Task><UID>1</UID><ID>1</ID><Name>Sem datas</Name><WBS>1</WBS><OutlineLevel>1</OutlineLevel></Task></Tasks></Project>');const r=m.toActivities(p);assert.equal(r.activities.length,0);assert.ok(r.warnings.some(w=>/sem datas/.test(w)));
});

test('revisão da EAP: obra cuja numeração começa em 2 passa a começar em 1, com predecessoras e nomes de pacote preservados',()=>{
  const works=[{id:'w1',name:'UBS'},{id:'w2',name:'Estrada'},{id:'w3',name:'Orçamento novo'},{id:'w4',name:'Vazia'}];
  const A=(id,workId,wbs,pred='',extra={})=>({id,workId,wbs,predecessors:pred,...extra});
  const acts=[A('a1','w1','1.1.1'),A('a2','w1','1.1.2','1.1.1'),
    A('b1','w2','2.1.1'),A('b2','w2','2.1.2','2.1.1'),A('b3','w2','2.4.2','2.1.2;2.4.1SS+2d'),A('b4','w2','2.4.1','9.9.9'),
    A('c1','w3','3.1','',{eapPhase:'1.3',eapPhaseName:'Fundação'}),A('d1','w2','','',{}),
    A('e1','w2','2.1.1','')];
  const r=m.reviewEap(works,acts,{phaseNames:{'2.1':'Gestão, projetos e controle','2.4':'Drenagem'}}),by=Object.fromEntries(r.map(x=>[x.workId,x]));
  assert.equal(by.w1.changes.length,0,'obra que já começa em 1 não muda');assert.deepEqual(by.w2.map,{'2':'1'});assert.equal(by.w2.changes.length,5);
  const ch=Object.fromEntries(by.w2.changes.map(c=>[c.id,c]));assert.equal(ch.b1.newWbs,'1.1.1');assert.equal(ch.b3.newWbs,'1.4.2');assert.equal(ch.b3.newPred,'1.1.2;1.4.1SS+2d');assert.equal(ch.b2.newPred,'1.1.1');assert.equal(ch.b1.phaseName,'Gestão, projetos e controle');assert.equal(ch.b3.phaseName,'Drenagem');
  assert.equal(by.w2.duplicates,1,'2.1.1 aparece duas vezes');assert.equal(by.w2.brokenPred,1,'9.9.9 não existe');assert.equal(by.w2.semWbs,1);
  assert.equal(by.w3.changes.length,0,'atividades geradas do orçamento (grupos explícitos) não são tocadas');assert.equal(by.w3.comGrupo,1);assert.ok(!by.w4,'obra sem atividades fica fora');
  const lacuna=m.reviewEap([{id:'x',name:'X'}],[A('1','x','1.1'),A('2','x','3.1'),A('3','x','3.2')]);assert.deepEqual(lacuna[0].map,{'3':'2'},'raízes 1 e 3 viram 1 e 2');
  assert.equal(m.reviewEap([{id:'y',name:'Y'}],[A('1','y','A.1')])[0].nonNumeric,true);
});
