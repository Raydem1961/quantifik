// ObraTop — planilha orçamentária por etapas, valor por extenso, recursos (ABC), cronograma a partir do orçamento
// e quantitativos previsto x realizado mês a mês. Funções puras, testadas em tests/unit/orcamento.test.mjs.
import {norm,r2} from './bases.mjs';
export const KINDS=['Material','Mão de obra','Equipamento','Outros'];
const num=v=>Number.isFinite(+v)?+v:0,pad=n=>String(n).padStart(2,'0');

// ---------- datas e dias úteis
export const parseISO=s=>{const[y,m,d]=String(s).slice(0,10).split('-').map(Number);return new Date(y,m-1,d)};
export const fmtISO=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const isWd=d=>d.getDay()!==0&&d.getDay()!==6;
export function workdayList(a,b){const out=[],x=new Date(a);while(x<=b){if(isWd(x))out.push(new Date(x));x.setDate(x.getDate()+1)}return out}
export const workdaysBetween=(a,b)=>workdayList(parseISO(a),parseISO(b)).length;
function nextWd(d){const x=new Date(d);while(!isWd(x))x.setDate(x.getDate()+1);return x}
export const monthOf=iso=>String(iso).slice(0,7);
export function monthLabel(m){return`${m.slice(5)}/${m.slice(0,4)}`}
export function monthRange(a,b){const out=[];let[y,m]=a.split('-').map(Number);const[y2,m2]=b.split('-').map(Number);while(y<y2||(y===y2&&m<=m2)){out.push(`${y}-${pad(m)}`);if(++m>12){m=1;y++}}return out}
/** Distribui um total pelos meses de [início, fim], proporcionalmente aos dias úteis (a soma fecha exatamente no total). */
export function distribute(startISO,endISO,total){
  const days=workdayList(parseISO(startISO),parseISO(endISO)),cnt={};
  if(!days.length){const m=monthOf(startISO);return{[m]:total}}
  for(const d of days){const m=monthOf(fmtISO(d));cnt[m]=(cnt[m]||0)+1}
  const ms=Object.keys(cnt).sort(),out={};let acc=0;ms.forEach((m,i)=>{if(i===ms.length-1)out[m]=Math.round((total-acc)*1e6)/1e6;else{out[m]=Math.round(total*cnt[m]/days.length*1e6)/1e6;acc+=out[m]}});return out
}

// ---------- valor por extenso (ex.: "CENTO E VINTE E DOIS MIL, SETECENTOS E QUARENTA E SETE REAIS E DEZESSETE CENTAVOS")
const U=['zero','um','dois','três','quatro','cinco','seis','sete','oito','nove','dez','onze','doze','treze','quatorze','quinze','dezesseis','dezessete','dezoito','dezenove'],T=['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'],H=['','cento','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];
const ate999=n=>{if(n===100)return'cem';const c=Math.floor(n/100),r=n%100,p=[];if(c)p.push(H[c]);if(r)p.push(r<20?U[r]:T[Math.floor(r/10)]+(r%10?` e ${U[r%10]}`:''));return p.join(' e ')};
export function numeroPorExtenso(n){
  n=Math.floor(Math.abs(n));if(n===0)return'zero';if(n>999999999999)throw new Error('Valor grande demais.');
  const g=[];while(n>0){g.push(n%1000);n=Math.floor(n/1000)}
  const nome=(v,i)=>i===1?(v===1?'mil':`${ate999(v)} mil`):i===2?(v===1?'um milhão':`${ate999(v)} milhões`):i===3?(v===1?'um bilhão':`${ate999(v)} bilhões`):ate999(v);
  const partes=[];for(let i=g.length-1;i>=0;i--)if(g[i])partes.push({v:g[i],t:nome(g[i],i)});
  return partes.map((p,k)=>k===0?p.t:`${(p.v<100||p.v%100===0)?' e ':', '}${p.t}`).join('')
}
export function valorPorExtenso(v){
  const c=Math.round((Number(v)||0)*100),r=Math.floor(Math.abs(c)/100),ct=Math.abs(c)%100,out=[];
  if(r>0){const redondo=r%1000000===0;out.push(`${numeroPorExtenso(r)}${redondo?' de':''} ${r===1?'real':'reais'}`)}
  if(ct>0)out.push(`${numeroPorExtenso(ct)} ${ct===1?'centavo':'centavos'}`);
  return(out.length?out.join(' e '):'zero real').toUpperCase()
}

// ---------- planilha orçamentária: etapas (1.0), sub-etapas (3.2) e serviços (3.2.1)
/** items: [{id,etapaId,sub,code,desc,unit,qty,price,src}]; modo 'linha' = preço unitário já com BDI (como na planilha impressa); 'final' = BDI somado no fim. */
export function buildSheet(etapas,items,{bdi=0,mode='linha'}={}){
  const rows=[],totals={};let direct=0,total=0;
  const unitShown=p=>mode==='linha'?r2(num(p)*(1+num(bdi)/100)):r2(num(p));
  const mk=(it,no)=>{const u=unitShown(it.price),t=r2(num(it.qty)*u);direct+=r2(num(it.qty)*num(it.price));total+=t;totals[it.etapaId]=(totals[it.etapaId]||0)+t;return{kind:'item',no,code:it.code||'',desc:it.desc,unit:it.unit||'',qty:num(it.qty),unitPrice:u,total:t,item:it,etapaId:it.etapaId}};
  etapas.forEach((e,ei)=>{
    const its=items.filter(i=>i.etapaId===e.id),head={kind:'etapa',no:`${ei+1}.0`,desc:e.name,etapaId:e.id,empty:!its.length};rows.push(head);
    let k=0;const done=new Set();
    for(const it of its){
      if(it.sub){if(done.has(it.sub))continue;done.add(it.sub);k++;const sub={kind:'sub',no:`${ei+1}.${k}`,desc:it.sub,etapaId:e.id};rows.push(sub);let j=0;for(const x of its)if(x.sub===it.sub){j++;rows.push(mk(x,`${ei+1}.${k}.${j}`))}}
      else{k++;rows.push(mk(it,`${ei+1}.${k}`))}
    }
    rows.push({kind:'gap'})
  });
  const totalBudget=mode==='linha'?r2(total):r2(direct*(1+num(bdi)/100));
  const etapaTotals={};for(const e of etapas)etapaTotals[e.id]=r2(mode==='linha'?(totals[e.id]||0):items.filter(i=>i.etapaId===e.id).reduce((s,i)=>s+num(i.qty)*num(i.price),0)*(1+(mode==='linha'?0:num(bdi)/100)));
  return{rows,direct:r2(direct),bdiValue:r2(totalBudget-direct),total:totalBudget,etapaTotals,mode,bdi:num(bdi)}
}

// ---------- recursos do orçamento (material, mão de obra, equipamento) e curva ABC
export function resourcesOf(items){
  const map=new Map();
  for(const it of items){
    const q=num(it.qty),comp=Array.isArray(it.composition)?it.composition:[];
    if(!comp.length){const k='SEM|'+it.id;map.set(k,{key:k,code:'',desc:`${it.no?it.no+' — ':''}${it.desc}`,unit:it.unit||'',kind:'Outros',qty:q,cost:q*num(it.price),noComp:true,uses:[{id:it.id,no:it.no||'',qty:q}]});continue}
    for(const c of comp){
      const kind=KINDS.includes(c.kind)?c.kind:'Outros',coef=num(c.coef),price=num(c.price),k=`${kind}|${c.code||norm(c.description)}|${norm(c.unit)}`,rq=q*coef;
      const r=map.get(k)||{key:k,code:c.code||'',desc:c.description,unit:c.unit||'',kind,qty:0,cost:0,uses:[]};r.qty+=rq;r.cost+=rq*price;r.uses.push({id:it.id,no:it.no||'',qty:rq,price});map.set(k,r)
    }
  }
  return[...map.values()].map(r=>({...r,price:r.qty>0?r.cost/r.qty:0}))
}
/** Classe A até ~80% do valor, B até ~95%, C o restante (mesmo critério da tela Curvas S e ABC). */
export function abcRank(rows,valueKey='cost'){
  const arr=rows.filter(x=>num(x[valueKey])>0).sort((a,b)=>num(b[valueKey])-num(a[valueKey])),total=arr.reduce((s,x)=>s+num(x[valueKey]),0);let cum=0;
  return arr.map((x,i)=>{const before=total?cum/total*100:0;cum+=num(x[valueKey]);return{...x,rank:i+1,pct:total?num(x[valueKey])/total*100:0,cumPct:total?cum/total*100:0,cls:before<80?'A':before<95?'B':'C'}})
}
export function abcByKind(items){const res=resourcesOf(items),out={};for(const k of KINDS)out[k]=abcRank(res.filter(r=>r.kind===k));return out}
/** Quantitativo por serviço: para cada serviço, os insumos de um tipo com quantidade = coeficiente × quantidade do serviço. */
export function quantitativoPorServico(items,kind){
  const out=[];
  for(const it of items){
    const q=num(it.qty),lines=(it.composition||[]).filter(c=>c.kind===kind).map(c=>({code:c.code||'',desc:c.description,unit:c.unit||'',coef:num(c.coef),qty:q*num(c.coef),price:num(c.price),cost:q*num(c.coef)*num(c.price)}));
    if(lines.length)out.push({no:it.no||'',desc:it.desc,unit:it.unit||'',qty:q,lines,cost:lines.reduce((s,l)=>s+l.cost,0)})
  }
  return out
}
export function laborHours(it){return num(it.qty)*(it.composition||[]).filter(c=>c.kind==='Mão de obra'&&(!c.unit||/^h/i.test(String(c.unit).trim()))).reduce((s,c)=>s+num(c.coef),0)}

// ---------- cronograma a partir do orçamento fechado
/** Durações proporcionais às horas de mão de obra de cada serviço (ou ao custo, se não houver composição), ajustadas ao prazo total. */
export function scheduleBudget(etapas,items,{start,end,overlap=0.6,lag=0.6,hoursPerDay=8}={}){
  const its=items.filter(i=>etapas.some(e=>e.id===i.etapaId));
  if(!its.length)throw new Error('Não há serviços para programar.');
  const W0=nextWd(parseISO(start)),target=workdayList(W0,parseISO(end)).length;
  if(target<5)throw new Error('O prazo precisa ter pelo menos 5 dias úteis.');
  const hrs=its.map(laborHours),cost=its.map(i=>num(i.qty)*num(i.price)),hSum=hrs.reduce((s,x)=>s+x,0);
  const costPerDay=hSum>0?cost.reduce((s,x,i)=>s+(hrs[i]>0?x:0),0)/(hrs.filter(x=>x>0).reduce((s,x)=>s+x,0)/hoursPerDay):0;
  const wt=new Map();its.forEach((it,i)=>wt.set(it.id,Math.max(.5,hrs[i]>0?hrs[i]/hoursPerDay:(costPerDay>0?cost[i]/costPerDay:cost[i]>0?1:.5))));
  const order=etapas.filter(e=>its.some(i=>i.etapaId===e.id));
  const build=scale=>{const tasks=[],es={};let prevStart=0,prevLen=1;
    order.forEach((e,ei)=>{const ps=ei===0?0:prevStart+Math.max(1,Math.round(overlap*prevLen));let cur=ps,prev=null;const mine=[];
      for(const it of its.filter(i=>i.etapaId===e.id)){const d=Math.max(1,Math.round(wt.get(it.id)*scale));if(prev)cur+=Math.max(1,Math.round(lag*prev.d));const t={id:it.id,etapaId:e.id,s:cur,e:cur+d-1,d};tasks.push(t);mine.push(t);prev=t}
      const last=Math.max(...mine.map(t=>t.e));es[e.id]={s:ps,e:last};prevStart=ps;prevLen=last-ps+1});
    return{tasks,es,total:Math.max(...tasks.map(t=>t.e))+1}};
  let lo=0.001,hi=2000;for(let i=0;i<60;i++){const mid=(lo+hi)/2;if(build(mid).total>target)hi=mid;else lo=mid}
  let b=build(lo);const fits=b.total<=target;
  const days=workdayList(W0,new Date(W0.getTime()+(b.total+60)*864e5*1.5));
  const at=i=>fmtISO(days[Math.min(i,days.length-1)]);
  const tasks=b.tasks.map(t=>{const it=its.find(x=>x.id===t.id),h=laborHours(it);return{id:t.id,etapaId:t.etapaId,start:at(t.s),end:at(t.e),days:t.d,crew:h>0?Math.round(h/(t.d*hoursPerDay)*10)/10:0,hours:Math.round(h*100)/100}});
  const etapaSpans={};for(const e of order)etapaSpans[e.id]={start:at(b.es[e.id].s),end:at(b.es[e.id].e)};
  return{tasks,etapaSpans,start:at(0),end:tasks.map(t=>t.end).sort().at(-1),workdays:b.total,target,fits,scale:lo}
}

// ---------- previsto x realizado, mês a mês
/** acts: {budgetId:{start,end}}; item.real = {'AAAA-MM': quantidade do serviço executada no mês} */
export function planning({items,acts,bdi=0}){
  const mset=new Set(),svc=[],sem=[];
  for(const it of items){
    const a=acts[it.id],q=num(it.qty),real=it.real||{};
    const planned=a&&a.start&&a.end&&q>0?distribute(a.start,a.end,q):{};if(!a)sem.push(it);
    Object.keys(planned).forEach(m=>mset.add(m));Object.keys(real).filter(m=>num(real[m])).forEach(m=>mset.add(m));
    svc.push({item:it,no:it.no||'',planned,real,start:a?.start||'',end:a?.end||'',realTotal:Object.values(real).reduce((s,x)=>s+num(x),0)})
  }
  const months=[...mset].sort();const full=months.length?monthRange(months[0],months.at(-1)):[];
  const cost=(it,qm)=>qm*num(it.price)*(1+num(it.bdi!=null?it.bdi:bdi)/100);
  const curveBase=full.map(m=>({m,planned:svc.reduce((s,x)=>s+cost(x.item,num(x.planned[m])),0),real:svc.reduce((s,x)=>s+cost(x.item,num(x.real[m])),0)}));
  const totPlan=curveBase.reduce((s,x)=>s+x.planned,0),totReal=curveBase.reduce((s,x)=>s+x.real,0),budgetTotal=items.reduce((s,i)=>s+cost(i,num(i.qty)),0);let cp=0,cr=0;
  const curve=curveBase.map(x=>{cp+=x.planned;cr+=x.real;return{...x,plannedCum:cp,realCum:cr,plannedPct:budgetTotal?cp/budgetTotal*100:0,realPct:budgetTotal?cr/budgetTotal*100:0}});
  // recursos por mês
  const res=new Map();
  for(const x of svc){const it=x.item,comp=Array.isArray(it.composition)&&it.composition.length?it.composition:[{kind:'Outros',description:`${it.no?it.no+' — ':''}${it.desc} (sem composição)`,unit:it.unit,coef:1,price:it.price,code:''}];
    for(const c of comp){const kind=KINDS.includes(c.kind)?c.kind:'Outros',key=`${kind}|${c.code||norm(c.description)}|${norm(c.unit)}`,coef=num(c.coef),price=num(c.price);
      const r=res.get(key)||{key,code:c.code||'',desc:c.description,unit:c.unit||'',kind,planned:{},real:{},plannedQty:0,realQty:0,plannedCost:0,realCost:0};
      for(const m of full){const pq=num(x.planned[m])*coef,rq=num(x.real[m])*coef;if(pq){r.planned[m]=(r.planned[m]||0)+pq;r.plannedQty+=pq;r.plannedCost+=pq*price}if(rq){r.real[m]=(r.real[m]||0)+rq;r.realQty+=rq;r.realCost+=rq*price}}
      res.set(key,r)}}
  const resources={};for(const k of KINDS)resources[k]=[...res.values()].filter(r=>r.kind===k&&(r.plannedQty>0||r.realQty>0)).sort((a,b)=>b.plannedCost-a.plannedCost);
  return{months:full,services:svc,semCronograma:sem,curve,resources,totals:{budget:budgetTotal,planned:totPlan,real:totReal}}
}

/** Dias úteis de diferença entre duas datas ISO (positivo = b depois de a). */
export function workdayDelta(a,b){if(!a||!b||a===b)return 0;return a<b?workdaysBetween(a,b)-1:-(workdaysBetween(b,a)-1)}
/** Curva S da linha de base: items = {idAtividade:{s,e,w}} (datas planejadas e peso/valor). Devolve [{m,planned,cum,pct}] mês a mês. */
export function baselineCurve(items){
  const list=Object.values(items||{}).filter(x=>x&&x.s&&x.e&&Number(x.w)>0);if(!list.length)return[];
  const by={};for(const x of list)for(const[m,v]of Object.entries(distribute(x.s,x.e,Number(x.w))))by[m]=(by[m]||0)+v;
  const ms=Object.keys(by).sort(),full=monthRange(ms[0],ms.at(-1)),total=list.reduce((s,x)=>s+Number(x.w),0);let c=0;
  return full.map(m=>{const v=by[m]||0;c+=v;return{m,planned:v,cum:c,pct:total?c/total*100:0}})
}
