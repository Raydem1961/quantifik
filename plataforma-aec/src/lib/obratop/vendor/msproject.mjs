// ObraTop — MS Project: predecessoras (FS/SS/FF/SF com defasagem), caminho crítico (CPM), leitura e escrita do XML MSPDI.
// Funções puras, testadas em tests/unit/msproject.test.mjs. O XML (MSPDI) é o formato de troca do MS Project: no Project use Arquivo > Salvar como > XML.
import {workdayList,parseISO,fmtISO,workdaysBetween} from './orcamento.mjs';
export const LINK_NAME={FS:1,SS:3,FF:0,SF:2};          // código do tipo no MSPDI (0=FF, 1=FS, 2=SF, 3=SS)
const NAME_BY_CODE={0:'FF',1:'FS',2:'SF',3:'SS'};
const PT={TI:'FS',II:'SS',TT:'FF',IT:'SF'};            // MS Project em português: término-início, início-início, término-término, início-término
const xe=s=>String(s??'').replace(/[<>&"']/g,m=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[m]));

// ---------- predecessoras: "3", "3;5SS+2d", "1.2FF-1d", "4TI"
export function parsePred(spec){
  const out=[];
  for(const raw of String(spec??'').split(/[;]+/).flatMap(x=>x.includes(',')&&!/[+\-]\s*\d+,\d/.test(x)?x.split(','):[x])){
    const t=raw.trim();if(!t)continue;
    const m=t.match(/^([0-9A-Za-z][0-9A-Za-z._\-]*?)\s*(?:(FS|SS|FF|SF|TI|II|TT|IT)\b)?\s*(?:([+\-])\s*(\d+(?:[.,]\d+)?)\s*(?:d|dia|dias)?)?$/i);
    if(!m)continue;
    const type=PT[(m[2]||'').toUpperCase()]||(m[2]||'FS').toUpperCase(),lag=m[3]?(m[3]==='-'?-1:1)*Math.round(parseFloat(m[4].replace(',','.'))):0;
    out.push({code:m[1],type,lag})
  }
  return out
}
export function fmtPred(links){return links.map(l=>`${l.code}${l.type==='FS'&&!l.lag?'':l.type}${l.lag?(l.lag>0?'+':'-')+Math.abs(l.lag)+'d':''}`).join(';')}

// ---------- caminho crítico (em dias úteis, sobre as datas já planejadas)
/** tasks: [{id,wbs,start,end,summary,pred:'3;5SS+2d'}] — devolve Map id → {slack,critical,es,ef}. Tarefas resumo são ignoradas. */
export function cpm(tasks){
  const leaves=tasks.filter(t=>!t.summary&&t.start&&t.end);if(!leaves.length)return new Map();
  const min=leaves.map(t=>t.start).sort()[0],max=leaves.map(t=>t.end).sort().at(-1),days=workdayList(parseISO(min),parseISO(max)),ix=new Map(days.map((d,i)=>[fmtISO(d),i]));
  const at=(iso,back)=>{if(ix.has(iso))return ix.get(iso);const d=parseISO(iso);for(let k=0;k<8;k++){d.setDate(d.getDate()+(back?-1:1));const v=ix.get(fmtISO(d));if(v!==undefined)return v}return back?days.length-1:0};
  const byWbs=new Map(leaves.map(t=>[String(t.wbs),t])),N=new Map();
  for(const t of leaves){const es=at(t.start,false),ef=Math.max(es,at(t.end,true));N.set(t.id,{t,es,ef,dur:ef-es+1,lf:0,ls:0})}
  const end=Math.max(...[...N.values()].map(n=>n.ef));for(const n of N.values()){n.lf=end;n.ls=end-n.dur+1}
  const links=[];for(const n of N.values())for(const l of parsePred(n.t.pred)){const p=byWbs.get(l.code);if(p&&p.id!==n.t.id)links.push({p:N.get(p.id),s:n,type:l.type,lag:l.lag})}
  for(let pass=0;pass<Math.min(80,leaves.length+5);pass++){let ch=false;
    for(const{p,s,type,lag}of links){let lf=p.lf;
      if(type==='FS')lf=Math.min(lf,s.ls-1-lag);else if(type==='SS')lf=Math.min(lf,s.ls-lag+p.dur-1);else if(type==='FF')lf=Math.min(lf,s.lf-lag);else lf=Math.min(lf,s.lf-lag+p.dur-1);
      if(lf<p.lf){p.lf=lf;p.ls=lf-p.dur+1;ch=true}}
    if(!ch)break}
  const out=new Map();for(const n of N.values()){const slack=Math.min(n.ls-n.es,n.lf-n.ef);out.set(n.t.id,{slack,critical:slack<=0,es:n.es,ef:n.ef})}
  return out
}

// ---------- XML mínimo (suficiente para o MSPDI)
export function xmlParse(text){
  const root={name:'#root',children:[],text:''},stack=[root];let i=0;const s=String(text).replace(/^\ufeff/,'');
  const dec=v=>v.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16))).replace(/&amp;/g,'&');
  while(i<s.length){
    if(s[i]!=='<'){const j=s.indexOf('<',i),t=s.slice(i,j<0?s.length:j);stack.at(-1).text+=dec(t);i=j<0?s.length:j;continue}
    if(s.startsWith('<?',i)){i=s.indexOf('?>',i)+2;continue}if(s.startsWith('<!--',i)){i=s.indexOf('-->',i)+3;continue}
    if(s.startsWith('<![CDATA[',i)){const j=s.indexOf(']]>',i);stack.at(-1).text+=s.slice(i+9,j);i=j+3;continue}
    if(s.startsWith('<!',i)){i=s.indexOf('>',i)+1;continue}
    const j=s.indexOf('>',i);if(j<0)throw new Error('XML incompleto.');const tag=s.slice(i+1,j);
    if(tag[0]==='/'){stack.pop();if(!stack.length)throw new Error('XML malformado.')}
    else{const self=tag.endsWith('/'),name=tag.replace(/\/$/,'').trim().split(/\s+/)[0].replace(/^.*:/,''),node={name,children:[],text:''};stack.at(-1).children.push(node);if(!self)stack.push(node)}
    i=j+1}
  if(stack.length!==1)throw new Error('XML malformado (marcação não fechada).');
  return root.children[0]
}
const kid=(n,name)=>n.children.find(c=>c.name===name),kids=(n,name)=>n.children.filter(c=>c.name===name),val=(n,name)=>kid(n,name)?.text.trim()??'';

// ---------- leitura do MSPDI
const durDays=d=>{const m=String(d||'').match(/^PT(\d+)H(\d+)M/);return m?(+m[1]+(+m[2])/60)/8:0};
export function parseMspdi(text){
  const p=xmlParse(text);if(!p||p.name!=='Project')throw new Error('O arquivo não é um XML do MS Project (esperado: elemento Project). No MS Project use Arquivo > Salvar como > XML.');
  const res=new Map(kids(kid(p,'Resources')||{children:[]},'Resource').map(r=>[val(r,'UID'),val(r,'Name')]));
  const ass=new Map();for(const a of kids(kid(p,'Assignments')||{children:[]},'Assignment')){const t=val(a,'TaskUID'),r=res.get(val(a,'ResourceUID'));if(t&&r)(ass.get(t)||ass.set(t,[]).get(t)).push(r)}
  const tasks=[],warnings=[];
  for(const n of kids(kid(p,'Tasks')||{children:[]},'Task')){
    const uid=val(n,'UID');if(uid==='0'||val(n,'IsNull')==='1')continue;
    const level=+val(n,'OutlineLevel')||1,start=val(n,'Start').slice(0,10),finish=val(n,'Finish').slice(0,10);
    if(!val(n,'Name')){warnings.push(`Tarefa ${uid} sem nome ignorada.`);continue}
    const base=kids(n,'Baseline').find(b=>val(b,'Number')==='0'||!val(b,'Number'));
    tasks.push({uid,id:val(n,'ID'),name:val(n,'Name'),wbs:val(n,'WBS')||val(n,'OutlineNumber'),outline:val(n,'OutlineNumber'),level,summary:val(n,'Summary')==='1',milestone:val(n,'Milestone')==='1'||(durDays(val(n,'Duration'))===0&&!val(n,'Summary')),
      start,finish,dur:durDays(val(n,'Duration')),pct:Math.round(+val(n,'PercentComplete')||0),critical:val(n,'Critical')==='1',
      preds:kids(n,'PredecessorLink').map(l=>({uid:val(l,'PredecessorUID'),type:NAME_BY_CODE[val(l,'Type')]||'FS',lag:Math.round((+val(l,'LinkLag')||0)/4800)})),
      resources:ass.get(uid)||[],base:base&&val(base,'Start')?{s:val(base,'Start').slice(0,10),e:val(base,'Finish').slice(0,10)}:null})
  }
  return{name:val(p,'Title')||val(p,'Name')||'Projeto',start:val(p,'StartDate').slice(0,10),finish:val(p,'FinishDate').slice(0,10),tasks,resources:[...res.values()].filter(Boolean),warnings}
}
/** Converte as tarefas lidas em atividades do ObraTop (tarefas finais; os resumos viram a EAP em grupos). */
export function toActivities(proj,{workId=''}={}){
  const byUid=new Map(proj.tasks.map(t=>[t.uid,t])),sum=proj.tasks.filter(t=>t.summary),out=[],warnings=[...proj.warnings];
  const wbsOf=t=>t.wbs||t.outline||t.id;
  const parentChain=t=>{const chain=[];let cur=t;const ws=wbsOf(t).split('.');for(let k=ws.length-1;k>=1;k--){const code=ws.slice(0,k).join('.'),s=sum.find(x=>wbsOf(x)===code);if(s)chain.unshift(s)}return chain};
  for(const t of proj.tasks){if(t.summary)continue;
    const w=wbsOf(t);if(!w)continue;const chain=parentChain(t),phase=chain.length>=2?chain[1]:chain[0]||null,root=chain[0]||null;
    const links=t.preds.map(l=>{const pt=byUid.get(l.uid);return pt?{code:wbsOf(pt),type:l.type,lag:l.lag}:null}).filter(Boolean);
    const dur=t.milestone?0:Math.max(1,t.start&&t.finish?workdaysBetween(t.start,t.finish):Math.round(t.dur)||1);
    if(!t.start||!t.finish){warnings.push(`Tarefa "${t.name}" sem datas ignorada.`);continue}
    out.push({workId,wbs:w,name:t.name.slice(0,150),start:t.start,end:t.finish,durationDays:dur,progressMode:'Percentual',progress:t.pct,plannedQty:0,actualQty:0,unit:'',predecessors:fmtPred(links),responsible:t.resources.join('; ').slice(0,120),resources:t.resources.join('; ').slice(0,200),milestone:!!t.milestone,
      status:t.pct>=100?'Concluída':t.pct>0?'Em andamento':'Não iniciada',eapRoot:root?'1':'',eapPhase:phase?'1.'+(1+sum.filter(x=>x.level===phase.level).indexOf(phase)):'',eapPhaseCode:phase?wbsOf(phase):'',eapPhaseName:phase?phase.name.slice(0,100):'',source:'MS Project',_base:t.base})
  }
  return{activities:out,warnings}
}

// ---------- escrita do MSPDI (links com tipo e defasagem, marcos, linha de base, recursos e atribuições)
const cmpW=(a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true});
export function mspdiExport(work,acts,{phaseNames={},baseline=null,critical=new Map(),now=new Date()}={}){
  const leaves=(acts||[]).filter(a=>a.start&&a.end&&!a.deleted&&String(a.wbs||'').trim()).map(a=>({...a,wbs:String(a.wbs).trim()}));
  const all=new Map();
  for(const a of leaves)all.set(a.wbs,{wbs:a.wbs,id:a.id,name:a.name,start:a.start,end:a.end,pct:Math.max(0,Math.min(100,+a.progress||0)),leaf:true,milestone:!!a.milestone||(+a.durationDays===0),preds:parsePred(a.predecessors),dur:workdaysBetween(a.start,a.end),res:String(a.resources||a.responsible||'').split(/[;,]+/).map(s=>s.trim()).filter(Boolean)});
  const groupName=(k,i)=>{const kid=leaves.find(a=>a.wbs.startsWith(k+'.')||a.wbs===k);return phaseNames[k]||(i===1?(work?.name||'Obra'):(leaves.find(a=>String(a.eapPhaseCode)===k)?.eapPhaseName||`Pacote ${k}`))};
  for(const a of leaves){const p=a.wbs.split('.');for(let i=1;i<p.length;i++){const k=p.slice(0,i).join('.');if(!all.has(k))all.set(k,{wbs:k,name:groupName(k,i),leaf:false,preds:[],res:[]})}}
  const list=[...all.values()].sort((a,b)=>cmpW(a.wbs,b.wbs));
  for(const t of list)if(!t.leaf){const kids=list.filter(x=>x.leaf&&x.wbs.startsWith(t.wbs+'.'));if(kids.length){t.start=kids.map(k=>k.start).sort()[0];t.end=kids.map(k=>k.end).sort().at(-1);const tw=kids.reduce((s,k)=>s+k.dur,0);t.pct=tw?kids.reduce((s,k)=>s+k.pct*k.dur,0)/tw:0;t.dur=workdaysBetween(t.start,t.end)}else{t.start=t.end=leaves[0]?.start||'2026-01-01';t.pct=0;t.dur=1}}
  const uid=new Map(list.map((t,i)=>[t.wbs,i+1])),resNames=[...new Set(list.flatMap(t=>t.res))],resUid=new Map(resNames.map((n,i)=>[n,i+1])),dt=(d,h)=>`${d}T${h}`,bl=baseline?.items||{};
  const tasks=list.map((t,i)=>{const id=i+1,level=t.wbs.split('.').length,ms=t.leaf&&t.milestone,dur=ms?0:t.dur;
    const links=t.preds.filter(l=>uid.has(l.code)&&l.code!==t.wbs).map(l=>`<PredecessorLink><PredecessorUID>${uid.get(l.code)}</PredecessorUID><Type>${LINK_NAME[l.type]??1}</Type><CrossProject>0</CrossProject><LinkLag>${l.lag*4800}</LinkLag><LagFormat>7</LagFormat></PredecessorLink>`).join('');
    const b=t.leaf&&bl[t.id]?`<Baseline><Number>0</Number><Start>${dt(bl[t.id].s,'08:00:00')}</Start><Finish>${dt(bl[t.id].e,'17:00:00')}</Finish><Duration>PT${workdaysBetween(bl[t.id].s,bl[t.id].e)*8}H0M0S</Duration><DurationFormat>7</DurationFormat></Baseline>`:'';
    const cr=t.leaf&&critical.get?.(t.id)?.critical?1:0;
    return `<Task><UID>${id}</UID><ID>${id}</ID><Name>${xe(t.name)}</Name><Type>0</Type><IsNull>0</IsNull><WBS>${xe(t.wbs)}</WBS><OutlineNumber>${xe(t.wbs)}</OutlineNumber><OutlineLevel>${level}</OutlineLevel><Priority>500</Priority><Start>${dt(t.start,'08:00:00')}</Start><Finish>${dt(ms?t.start:t.end,ms?'08:00:00':'17:00:00')}</Finish><Duration>PT${dur*8}H0M0S</Duration><DurationFormat>7</DurationFormat><Work>PT0H0M0S</Work><PercentComplete>${Math.round(t.pct)}</PercentComplete><Critical>${cr}</Critical><Summary>${t.leaf?0:1}</Summary><Milestone>${ms?1:0}</Milestone>${links}${b}</Task>`}).join('');
  const resources=resNames.length?`<Resources>${resNames.map(n=>`<Resource><UID>${resUid.get(n)}</UID><ID>${resUid.get(n)}</ID><Name>${xe(n)}</Name><Type>1</Type><IsNull>0</IsNull><MaxUnits>1</MaxUnits></Resource>`).join('')}</Resources>`:'';
  let au=0;const assignments=resNames.length?`<Assignments>${list.flatMap(t=>t.res.map(n=>`<Assignment><UID>${++au}</UID><TaskUID>${uid.get(t.wbs)}</TaskUID><ResourceUID>${resUid.get(n)}</ResourceUID><Units>1</Units></Assignment>`)).join('')}</Assignments>`:'';
  const starts=list.map(t=>t.start).sort(),ends=list.map(t=>t.end).sort(),wd=(d,w)=>`<WeekDay><DayType>${d}</DayType><DayWorking>${w?1:0}</DayWorking>${w?'<WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes>':''}</WeekDay>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Project xmlns="http://schemas.microsoft.com/project"><SaveVersion>14</SaveVersion><Name>${xe(work?.name||'Obra')}</Name><Title>${xe(work?.name||'Obra')}</Title><CreationDate>${now.toISOString().slice(0,19)}</CreationDate><ScheduleFromStart>1</ScheduleFromStart><StartDate>${dt(starts[0]||'2026-01-01','08:00:00')}</StartDate><FinishDate>${dt(ends.at(-1)||'2026-01-02','17:00:00')}</FinishDate><DurationFormat>7</DurationFormat><MinutesPerDay>480</MinutesPerDay><MinutesPerWeek>2400</MinutesPerWeek><DaysPerMonth>20</DaysPerMonth><CalendarUID>1</CalendarUID><Calendars><Calendar><UID>1</UID><Name>Padrão</Name><IsBaseCalendar>1</IsBaseCalendar><WeekDays>${wd(1,false)}${[2,3,4,5,6].map(d=>wd(d,true)).join('')}${wd(7,false)}</WeekDays></Calendar></Calendars><Tasks>${tasks}</Tasks>${resources}${assignments}</Project>`
}

// ---------- revisão da EAP de todas as obras: a numeração de cada obra deve começar no item 1
/** works:[{id,name}] acts:[{id,workId,wbs,predecessors,eapPhase,eapPhaseName}] → relatório por obra com as renumerações propostas.
 *  Só mexe nas atividades com EAP "por raiz" (importadas/modelos); as geradas do orçamento já trazem grupos explícitos (eapPhase). */
export function reviewEap(works,acts,{phaseNames={}}={}){
  const out=[],num=(a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true});
  for(const w of works){
    const list=acts.filter(a=>a.workId===w.id&&!a.deleted);if(!list.length)continue;
    const explicit=list.filter(a=>String(a.wbs||'').trim()&&!a.eapPhase),semWbs=list.filter(a=>!String(a.wbs||'').trim()).length,comGrupo=list.filter(a=>a.eapPhase).length;
    const roots=[...new Set(explicit.map(a=>String(a.wbs).trim().split('.')[0]))].sort(num),numeric=roots.length>0&&roots.every(r=>/^\d+$/.test(r)),map={};
    if(numeric)roots.forEach((r,i)=>{if(String(i+1)!==r)map[r]=String(i+1)});
    const codes=new Set(explicit.map(a=>String(a.wbs).trim())),seen=new Map();let dup=0,broken=0;
    for(const a of explicit){const k=String(a.wbs).trim();seen.set(k,(seen.get(k)||0)+1)}for(const v of seen.values())if(v>1)dup+=v-1;
    for(const a of explicit)for(const l of parsePred(a.predecessors))if(!codes.has(l.code))broken++;
    const remap=code=>{const p=String(code).split('.'),r=map[p[0]];return r===undefined?code:[r,...p.slice(1)].join('.')},changes=[];
    for(const a of explicit){const old=String(a.wbs).trim(),p=old.split('.'),nr=map[p[0]];if(nr===undefined)continue;
      const links=parsePred(a.predecessors).map(l=>({...l,code:remap(l.code)})),phaseKey=p.slice(0,2).join('.');
      changes.push({id:a.id,wbs:old,newWbs:[nr,...p.slice(1)].join('.'),pred:a.predecessors||'',newPred:links.length?fmtPred(links):String(a.predecessors||''),phaseName:a.eapPhaseName?'':(phaseNames[phaseKey]||'')})}
    out.push({workId:w.id,name:w.name||w.id,total:list.length,roots,map,changes,duplicates:dup,brokenPred:broken,semWbs,comGrupo,nonNumeric:roots.length>0&&!numeric})
  }
  return out
}
