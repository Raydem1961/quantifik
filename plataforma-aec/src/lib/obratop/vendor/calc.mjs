// ObraTop — cálculos de gestão de obras (funções puras, sem acesso a tela ou banco de dados).
// Testados por tests/unit/calc.test.mjs (node --test).
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const num=v=>Number(v)||0;
const iso=s=>s?new Date(s+'T00:00:00'):null;
const money2=v=>Math.round((Number(v)||0)*100)/100;

// ---------- orçamento, medição e contrato
export function budgetSale(b){return num(b?.qty)*num(b?.unitValue)*(1+num(b?.bdi)/100)}
export function measurementNet(m){const gross=num(m?.value),ret=clamp(num(m?.retention),0,100),ded=Math.max(0,num(m?.deduction));return{gross,retention:money2(gross*ret/100),deduction:ded,net:money2(Math.max(0,gross-gross*ret/100-ded))}}
export function contractBalance(contract,measurements,statuses=['Pendente','Aprovada','Faturada','Paga']){
  const current=num(contract?.value)+num(contract?.addendum);
  const measured=(measurements||[]).filter(m=>!m.deleted&&m.contractId&&m.contractId===contract?.id&&statuses.includes(m.status)).reduce((s,m)=>s+num(m.value),0);
  const balance=current-measured;
  return{current,addendum:num(contract?.addendum),measured,balance,percentLeft:current>0?balance/current*100:0,hasMeasurements:measured>0}
}

// ---------- progresso: ponderação por custo do orçamento ou por duração; linha de base congelada
export function expectedProgress(a,dayISO){
  if(!a?.start||!a?.end)return 0;
  const s=iso(a.start),e=iso(a.end),n=iso(dayISO);
  if(n<=s)return 0;if(n>=e)return 100;
  return clamp((n-s)/(e-s)*100,0,100)
}
export function durationWeight(a){
  const explicit=num(a?.weight||a?.costWeight);if(explicit>0)return explicit;
  const dur=num(a?.durationDays);if(dur>0)return dur;
  if(a?.start&&a?.end){const s=iso(a.start),e=iso(a.end);if(s&&e)return Math.max(1,Math.round((e-s)/86400000)+1)}
  return 1
}
/** Peso por atividade. Se TODAS as atividades da obra apontam para um item do orçamento, o peso é o custo (preço de venda) do item,
 *  dividido entre as atividades que o compartilham. Caso contrário, usa a duração. */
export function activityWeights(valid,budgets){
  const byId=new Map((budgets||[]).filter(b=>!b.deleted).map(b=>[b.id,b]));
  const groups=new Map();for(const a of valid){if(!groups.has(a.workId))groups.set(a.workId,[]);groups.get(a.workId).push(a)}
  const weights=new Map(),modes=new Map(),linkedCount=new Map();
  for(const[wid,list]of groups){
    const linked=list.filter(a=>a.budgetId&&byId.has(a.budgetId)&&byId.get(a.budgetId).workId===wid);
    linkedCount.set(wid,{linked:linked.length,total:list.length});
    const costMode=list.length>0&&linked.length===list.length&&linked.some(a=>budgetSale(byId.get(a.budgetId))>0);
    modes.set(wid,costMode?'custo':'duração');
    if(costMode){
      const share=new Map();linked.forEach(a=>share.set(a.budgetId,(share.get(a.budgetId)||0)+1));
      linked.forEach(a=>weights.set(a.id,Math.max(1e-6,budgetSale(byId.get(a.budgetId))/share.get(a.budgetId))))
    }else list.forEach(a=>weights.set(a.id,durationWeight(a)))
  }
  return{weights,modes,linkedCount}
}
export function baselineItems(works){const m=new Map();for(const w of works||[])if(w?.baseline?.items)m.set(w.id,w.baseline.items);return m}
export function weightedProgress({acts,budgets=[],works=[],day,planned=false}){
  const valid=(acts||[]).filter(x=>x.start&&x.end&&!x.deleted);if(!valid.length)return 0;
  const{weights}=activityWeights(valid,budgets),bl=baselineItems(works);
  let sum=0,w=0;
  for(const a of valid){
    const aw=weights.get(a.id)??durationWeight(a);w+=aw;
    let v;
    if(planned){const b=bl.get(a.workId)?.[a.id];v=expectedProgress(b?{start:b.s,end:b.e}:a,day)}
    else v=clamp(num(a.progress),0,100);
    sum+=aw*v
  }
  return w?sum/w:0
}

// ---------- valor agregado (EVM). O CPI/IDC usa o custo INCORRIDO (competência), não só o pago.
export function incurredCost(fin,dayISO){
  return(fin||[]).filter(x=>!x.deleted&&x.type==='Despesa'&&x.date&&x.date<=dayISO&&x.status!=='Previsto').reduce((s,x)=>s+num(x.value),0)
}
export function schedulePerformance({acts,budgets=[],works=[],budget=0,incurred=0,day}){
  const planned=weightedProgress({acts,budgets,works,day,planned:true}),actual=weightedProgress({acts,budgets,works,day,planned:false});
  const spi=planned>0?actual/planned:NaN,ev=budget*actual/100,cpi=incurred>0?ev/incurred:NaN;
  const eac=Number.isFinite(cpi)&&cpi>0?budget/cpi:budget,etc=Math.max(0,eac-incurred),vac=budget-eac;
  return{planned,actual,variance:actual-planned,spi,cpi,ev,eac,etc,vac}
}

// ---------- fluxo de caixa projetado
export function cashProjection(fin,dayISO,months=6){
  const rows=(fin||[]).filter(x=>!x.deleted&&x.type&&num(x.value)>0);
  const opening=rows.filter(x=>(x.type==='Receita'&&x.status==='Recebido')||(x.type==='Despesa'&&x.status==='Pago')).reduce((s,x)=>s+(x.type==='Receita'?1:-1)*num(x.value),0);
  const base=new Date(dayISO+'T00:00:00'),y0=base.getFullYear(),m0=base.getMonth();
  const out=[];for(let i=0;i<months;i++){const d=new Date(y0,m0+i,1);const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;out.push({key,label:`${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`,inflow:0,outflow:0,net:0,balance:0})}
  for(const x of rows){
    if(['Recebido','Pago'].includes(x.status))continue;
    let when=x.dueDate||x.date;if(!when)continue;if(when<dayISO)when=dayISO;
    const row=out.find(r=>r.key===when.slice(0,7));if(!row)continue;
    if(x.type==='Receita')row.inflow+=num(x.value);else row.outflow+=num(x.value)
  }
  let bal=opening;for(const r of out){r.net=r.inflow-r.outflow;bal+=r.net;r.balance=bal}
  const firstNegative=out.find(r=>r.balance<0)||null;
  return{opening,rows:out,firstNegative,minBalance:Math.min(opening,...out.map(r=>r.balance))}
}

// ---------- vínculo automático atividade → item do orçamento (mesmo nome dentro da mesma obra)
export function suggestBudgetLinks(acts,budgets){
  const idx=new Map();for(const b of budgets||[]){if(b.deleted)continue;const k=b.workId+'|'+norm(b.description);if(!idx.has(k))idx.set(k,[]);idx.get(k).push(b)}
  const used=new Map(),links=[];
  for(const a of acts||[]){
    if(a.deleted||a.budgetId)continue;
    const list=idx.get(a.workId+'|'+norm(a.name));if(!list||list.length!==1)continue;
    links.push({activityId:a.id,budgetId:list[0].id});
  }
  return links
}

// ---------- exportação para o MS Project (formato XML MSPDI)
const xe=s=>String(s??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
const cmpWbs=(a,b)=>{const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<Math.max(x.length,y.length);i++){const d=(x[i]??-1)-(y[i]??-1);if(d)return d}return 0};
function wdays(a,b){let n=0;for(let d=new Date(a);d<=b;d.setDate(d.getDate()+1))if(d.getDay()!==0&&d.getDay()!==6)n++;return Math.max(1,n)}
export function mspdiXml(work,acts,{phaseNames={},now=new Date()}={}){
  const leaves=(acts||[]).filter(a=>a.start&&a.end&&!a.deleted&&String(a.wbs||'').trim()).map(a=>({...a,wbs:String(a.wbs).trim()}));
  const all=new Map();
  for(const a of leaves)all.set(a.wbs,{wbs:a.wbs,name:a.name,start:a.start,end:a.end,pct:clamp(num(a.progress),0,100),leaf:true,pred:String(a.predecessors||'').split(/[;,]+/).map(s=>s.trim()).filter(Boolean),dur:wdays(iso(a.start),iso(a.end))});
  for(const a of leaves){const p=a.wbs.split('.');for(let i=1;i<p.length;i++){const k=p.slice(0,i).join('.');if(!all.has(k))all.set(k,{wbs:k,name:phaseNames[k]||(i===1?(work?.name||'Obra'):`Pacote ${k}`),leaf:false,pred:[]})}}
  const list=[...all.values()].sort((a,b)=>cmpWbs(a.wbs,b.wbs));
  for(const t of list)if(!t.leaf){const kids=list.filter(x=>x.leaf&&x.wbs.startsWith(t.wbs+'.'));if(kids.length){t.start=kids.map(k=>k.start).sort()[0];t.end=kids.map(k=>k.end).sort().at(-1);const tw=kids.reduce((s,k)=>s+k.dur,0);t.pct=tw?kids.reduce((s,k)=>s+k.pct*k.dur,0)/tw:0;t.dur=wdays(iso(t.start),iso(t.end))}else{t.start=t.end=(leaves[0]?.start||'2026-01-01');t.pct=0;t.dur=1}}
  const uid=new Map(list.map((t,i)=>[t.wbs,i+1]));
  const dt=(s,h)=>`${s}T${h}`;
  const tasks=list.map((t,i)=>{
    const id=i+1,level=t.wbs.split('.').length;
    const links=t.pred.filter(p=>uid.has(p)&&p!==t.wbs).map(p=>`<PredecessorLink><PredecessorUID>${uid.get(p)}</PredecessorUID><Type>1</Type><CrossProject>0</CrossProject><LinkLag>0</LinkLag><LagFormat>7</LagFormat></PredecessorLink>`).join('');
    return `<Task><UID>${id}</UID><ID>${id}</ID><Name>${xe(t.name)}</Name><Type>0</Type><IsNull>0</IsNull><WBS>${xe(t.wbs)}</WBS><OutlineNumber>${xe(t.wbs)}</OutlineNumber><OutlineLevel>${level}</OutlineLevel><Priority>500</Priority><Start>${dt(t.start,'08:00:00')}</Start><Finish>${dt(t.end,'17:00:00')}</Finish><Duration>PT${t.dur*8}H0M0S</Duration><DurationFormat>7</DurationFormat><Work>PT0H0M0S</Work><PercentComplete>${Math.round(t.pct)}</PercentComplete><Summary>${t.leaf?0:1}</Summary><Milestone>0</Milestone>${links}</Task>`
  }).join('');
  const starts=list.map(t=>t.start).sort(),ends=list.map(t=>t.end).sort();
  const weekday=(d,work)=>`<WeekDay><DayType>${d}</DayType><DayWorking>${work?1:0}</DayWorking>${work?'<WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes>':''}</WeekDay>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Project xmlns="http://schemas.microsoft.com/project"><SaveVersion>14</SaveVersion><Name>${xe(work?.name||'Obra')}</Name><Title>${xe(work?.name||'Obra')}</Title><CreationDate>${now.toISOString().slice(0,19)}</CreationDate><ScheduleFromStart>1</ScheduleFromStart><StartDate>${dt(starts[0]||'2026-01-01','08:00:00')}</StartDate><FinishDate>${dt(ends.at(-1)||'2026-01-02','17:00:00')}</FinishDate><DurationFormat>7</DurationFormat><MinutesPerDay>480</MinutesPerDay><MinutesPerWeek>2400</MinutesPerWeek><DaysPerMonth>20</DaysPerMonth><CalendarUID>1</CalendarUID><Calendars><Calendar><UID>1</UID><Name>Padrão</Name><IsBaseCalendar>1</IsBaseCalendar><WeekDays>${weekday(1,false)}${[2,3,4,5,6].map(d=>weekday(d,true)).join('')}${weekday(7,false)}</WeekDays></Calendar></Calendars><Tasks>${tasks}</Tasks></Project>`
}

// ---------- composição de custo unitário (insumos por item do orçamento)
export const COMPOSITION_KINDS=['Material','Mão de obra','Equipamento','Outros'];
export function compositionCost(items){
  const byKind=Object.fromEntries(COMPOSITION_KINDS.map(k=>[k,0]));let total=0;
  for(const it of items||[]){
    const v=Math.max(0,num(it?.coef))*Math.max(0,num(it?.price));
    const k=COMPOSITION_KINDS.includes(it?.kind)?it.kind:'Outros';byKind[k]+=v;total+=v
  }
  for(const k of Object.keys(byKind))byKind[k]=money2(byKind[k]);
  return{total:money2(total),byKind}
}
export function validateComposition(items){
  if(!Array.isArray(items))return'Composição inválida.';
  if(items.length>60)return'Use no máximo 60 insumos por item.';
  for(const[i,it]of items.entries()){
    if(!String(it?.description||'').trim())return`Insumo ${i+1}: informe a descrição.`;
    if(!(num(it?.coef)>=0)||!(num(it?.price)>=0))return`Insumo ${i+1}: coeficiente e preço não podem ser negativos.`;
  }
  return''
}

// ---------- edição em lote
export function bulkFields(fields){return(fields||[]).filter(f=>(f[2]==='select'||f[2]==='date')&&f[0]!=='workId')}
export function chunk(arr,n){const out=[];for(let i=0;i<arr.length;i+=n)out.push(arr.slice(i,i+n));return out}
/** Confere uma alteração em lote antes de gravar: valor permitido para o campo e coerência início ≤ término. */
export function validateBulkChange(records,fieldDef,value){
  const[key,label,type,,options]=fieldDef||[];
  if(type==='select'){if(!Array.isArray(options)||!options.includes(value))return{ok:false,error:`Escolha um valor válido para “${label}”.`}}
  else if(type==='date'){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||'')||Number.isNaN(new Date(value+'T12:00:00').getTime()))return{ok:false,error:'Informe uma data válida.'}}
  else return{ok:false,error:'Este campo não pode ser alterado em lote.'};
  const bad=records.filter(r=>{const n={...r,[key]:value};return n.start&&n.end&&n.start>n.end}).map(r=>r.id);
  if(bad.length)return{ok:false,error:`A alteração deixaria o início depois do término em ${bad.length} registro(s). Nada foi alterado.`,conflicts:bad};
  return{ok:true,error:'',affected:records.map(r=>r.id)}
}
