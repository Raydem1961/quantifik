// ObraTop — bases de preços (SINAPI, ORSE e próprias): leitura de arquivos (XLSX, ZIP, CSV, PDF), busca e totalização.
// Funções puras e testadas em tests/unit/bases.test.mjs; o armazenamento local (IndexedDB) fica no fim do arquivo.
export const UFS=['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];
export const REGIMES={SD:'Não desonerado',CD:'Desonerado',SE:'Sem encargos sociais'};
export const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
export const r2=v=>Math.round((Number(v)+Number.EPSILON)*100)/100;

/** Converte número em formato brasileiro ou internacional ("1.234,56", "1234.56", "R$ 12,3"). Retorna NaN se não for número. */
export function parseNum(v,decimalComma){
  if(typeof v==='number')return Number.isFinite(v)?v:NaN;
  let s=String(v??'').replace(/R\$|\s|\u00a0/g,'');if(!s)return NaN;
  if(s.includes(',')){s=s.replace(/\./g,'').replace(',','.')}
  else if(decimalComma&&/^\d{1,3}(\.\d{3})+$/.test(s)){s=s.replace(/\./g,'')}
  else if((s.match(/\./g)||[]).length>1){s=s.replace(/\./g,'')}
  if(!/^-?\d+(\.\d+)?$/.test(s))return NaN;return Number(s)
}

// ---------- links oficiais
export const SINAPI_PAGE='https://www.caixa.gov.br/sinapi';
export const ORSE_DOWNLOADS='https://orse.cehop.se.gov.br/downloads.asp';
export const ORSE_CONSULTA='https://orse.cehop.se.gov.br/servicos.asp';
export function sinapiZipUrl(ym,fmt='xlsx'){const[y,m]=String(ym).split('-');return`https://www.caixa.gov.br/Downloads/sinapi-relatorios-mensais/SINAPI-${y}-${m}-formato-${fmt}.zip`}
/** Meses candidatos ao último relatório publicado (a CAIXA costuma publicar o mês de referência cerca de 6 semanas depois). */
export function sinapiCandidateRefs(now=new Date(),n=3){const out=[];for(let k=1;k<=n;k++){const d=new Date(now.getFullYear(),now.getMonth()-k,1),ym=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;out.push({ym,label:`${ym.slice(5)}/${ym.slice(0,4)}`,xlsx:sinapiZipUrl(ym,'xlsx'),pdf:sinapiZipUrl(ym,'pdf')})}return out}

// Arquivos do ZIP da CAIXA que não trazem preços de insumos/composições (famílias, manutenções, percentual de mão de obra...)
export const SKIP_FILE=/famil|manuten|m[aã]o[ _-]?de[ _-]?obra|percentual|coeficiente|cat[aá]logo|leia[ _-]?me|nota/i;
export const isPriceFileName=n=>!SKIP_FILE.test(String(n).split('/').pop());
const cellKey=n=>norm(n).replace(/[\s_-]/g,'');

// ---------- detecção de colunas
const isCodeH=h=>/^(cod\b|cod\.|codigo)/.test(h)&&!/item|insumo.*composicao/.test(h)||/^codigo d[ao] (composicao|insumo|servico)/.test(h);
const isDescH=h=>/descri|discrimina/.test(h)||/^(servicos?|insumos?|materiais?)$/.test(h);
const isUnitH=h=>/^(unid|un\b|un\.)/.test(h);
const isGroupH=h=>/^(grupo|classifica)/.test(h);
const isOriginH=h=>/origem/.test(h);
const isPriceH=h=>/(custo|preco|valor|mediano)/.test(h)&&!/%|origem|total do|encargo/.test(h);
export function findHeaderRow(rows,max=60){
  for(let i=0;i<Math.min(rows.length,max);i++){const h=(rows[i]||[]).map(norm);if(h.some(isCodeH)&&h.some(isDescH))return i}return-1
}
function detectUf(rows,hi){
  const map={};for(let i=Math.max(0,hi-3);i<=Math.min(rows.length-1,hi+3);i++)(rows[i]||[]).forEach((c,j)=>{const u=String(c??'').trim().toUpperCase();if(UFS.includes(u)&&map[u]===undefined)map[u]=j});
  return Object.keys(map).length>=3?map:null
}
function pickPriceCol(rows,hi,start,end,head,bare){
  // procura, entre os cabeçalhos próximos, a coluna de preço/custo (não a de origem ou de %)
  const cand=[];for(let j=start;j<end;j++){const labels=[hi-1,hi,hi+1,hi+2].map(i=>norm(rows[i]?.[j]||'')).join(' ');if(isPriceH(labels)&&!/%/.test(labels)&&!/origem/.test(labels))cand.push(j)}
  if(cand.length)return cand[0];
  return bare?start:-1      // sem rótulo de preço só se a aba tem nome oficial (ISD, CSD...); senão arrisca pegar um percentual
}
/** Lê linhas de uma planilha e devolve itens [código, descrição, unidade, preço, origem, grupo]. */
export function extractItems(rows,{uf='BA',decimalComma=false,bare=false,keepNoCode=false}={}){
  const hi=findHeaderRow(rows);if(hi<0)return{items:[],reason:'cabecalho'};
  const head=rows[hi].map(norm),cols={code:head.findIndex(isCodeH),desc:head.findIndex(isDescH),unit:head.findIndex(isUnitH),group:head.findIndex(isGroupH),origin:head.findIndex(isOriginH),price:-1};
  const ufMap=detectUf(rows,hi);let wide=false;
  if(ufMap){
    if(ufMap[uf]===undefined)return{items:[],reason:'uf',ufs:Object.keys(ufMap)};
    const cs=Object.values(ufMap).sort((a,b)=>a-b),start=ufMap[uf],next=cs.find(c=>c>start)??start+3;
    cols.price=pickPriceCol(rows,hi,start,Math.min(next,start+4),head,bare);wide=true;
    const og=[];for(let j=start;j<Math.min(next,start+4);j++){const l=norm((rows[hi]||[])[j]||'')+' '+norm((rows[hi+1]||[])[j]||'');if(/origem/.test(l))og.push(j)}cols.origin=og[0]??-1
  }else{
    const pc=head.map((h,j)=>isPriceH(h)?j:-1).filter(j=>j>=0);
    cols.price=pc.find(j=>/unit/.test(head[j]))??pc.find(j=>!/total/.test(head[j]))??pc[0]??-1
  }
  if(cols.code<0||cols.desc<0||cols.price<0)return{items:[],reason:wide&&cols.price<0?'preco':'colunas',cols,headerRow:hi};
  const items=[],seen=new Set();
  for(let i=hi+1;i<rows.length;i++){
    const r=rows[i]||[];let code=String(r[cols.code]??'').trim().replace(/\.0$/,'');
    const semCodigo=!code||/^0+$/.test(code);   // código vazio ou "0" = fórmula não calculada no arquivo
    if(semCodigo){if(!keepNoCode)continue;code=''}else if(!/\d/.test(code)||!/^[A-Za-z0-9][A-Za-z0-9.\-\/_]*$/.test(code))continue;
    const price=parseNum(r[cols.price],decimalComma);if(Number.isNaN(price))continue;
    const desc=String(r[cols.desc]??'').replace(/\s+/g,' ').trim();if(!desc)continue;
    const key=(code||'~')+'|'+norm(desc).slice(0,160)+'|'+norm(r[cols.unit]);if(seen.has(key))continue;seen.add(key);
    items.push([code,desc,String(r[cols.unit]??'').trim(),r2(price),cols.origin>=0?String(r[cols.origin]??'').trim():'',cols.group>=0?String(r[cols.group]??'').trim():''])
  }
  const priceLabel=[hi-1,hi,hi+1,hi+2].map(i=>String(rows[i]?.[cols.price]??'').trim()).filter(Boolean).join(' / ');
  if(items.length>=20&&looksLikePercent(items))return{items:[],reason:'percentual',cols,headerRow:hi,priceLabel};
  return{items,cols,headerRow:hi,wide,priceLabel,labels:{code:head[cols.code],desc:head[cols.desc],unit:cols.unit>=0?head[cols.unit]:'',price:priceLabel}}
}
/** Percentuais (0 a 1) não são preços: se quase tudo está entre 0 e 1, a coluna escolhida provavelmente é um percentual. */
export function looksLikePercent(items){const ps=items.map(i=>i[3]).sort((a,b)=>a-b);if(ps.length<20)return false;return ps[Math.floor(ps.length*.9)]<=1.0001&&ps[ps.length>>1]<1}
/** Aplica um mapeamento manual de colunas (índices) a linhas de planilha. */
export function extractWithMapping(rows,m){
  const items=[];const hi=m.headerRow??0;
  for(let i=hi+1;i<rows.length;i++){const r=rows[i]||[],code=String(r[m.code]??'').trim().replace(/\.0$/,'');if(!code||!/\d/.test(code))continue;
    const price=parseNum(r[m.price],m.decimalComma);if(Number.isNaN(price))continue;const desc=String(r[m.desc]??'').replace(/\s+/g,' ').trim();if(!desc)continue;
    items.push([code,desc,m.unit>=0?String(r[m.unit]??'').trim():'',r2(price),'',m.group>=0?String(r[m.group]??'').trim():''])}
  return{items}
}

// ---------- pasta de trabalho SINAPI (abas ISD/ICD/ISE e CSD/CCD/CSE)
const SHEET_KIND={isd:['ins','SD'],icd:['ins','CD'],ise:['ins','SE'],csd:['comp','SD'],ccd:['comp','CD'],cse:['comp','SE']};
export function classifySheet(name,rows,fileName=''){
  const n=norm(name).replace(/\s|_|-/g,'');if(SHEET_KIND[n])return{kind:SHEET_KIND[n][0],regime:SHEET_KIND[n][1],by:'nome'};
  if(/analitic/.test(n))return{kind:'analitico'};
  const hi=findHeaderRow(rows);if(hi<0)return null;const head=rows[hi].map(norm).join(' ');
  const kind=/composicao|servico/.test(head)||/composic|sintetic/.test(n)?'comp':/insumo/.test(head)||/insumo/.test(n)?'ins':null;if(!kind)return null;
  const ctx=norm(name+' '+fileName);const regime=/sem encargo/.test(ctx)?'SE':/nao desoner|sem desoner|naodesoner/.test(ctx)?'SD':/desoner/.test(ctx)?'CD':'SD';
  return{kind,regime,by:'conteudo'}
}
/** Aba "Analítico": itens (insumos e composições auxiliares) e coeficientes de cada composição. Devolve {codComposição:[[tipo(0=insumo,1=composição),codItem,coef],...]}. */
export function parseAnalitico(rows){
  let hi=-1;for(let i=0;i<Math.min(rows.length,60);i++){const h=(rows[i]||[]).map(norm);if(h.some(x=>/^codigo d[ae] composicao|^codigo composicao/.test(x))&&h.some(x=>/^codigo d[oe] item|^codigo item/.test(x))&&h.some(x=>/coef/.test(x))){hi=i;break}}
  if(hi<0)return{map:{},reason:'cabecalho'};
  const h=rows[hi].map(norm),c0={desc:h.findIndex(x=>/^descri/.test(x)),unit:h.findIndex(x=>/^unid/.test(x))},titles={},c={comp:h.findIndex(x=>/^codigo d[ae] composicao|^codigo composicao/.test(x)),item:h.findIndex(x=>/^codigo d[oe] item|^codigo item/.test(x)),tipo:h.findIndex(x=>/^tipo/.test(x)),coef:h.findIndex(x=>/coef/.test(x))},map={};let n=0;
  let atual='';   // composição da última linha de título (item em branco); as linhas de itens herdam esse código se a célula vier vazia (fórmula não calculada)
  for(let i=hi+1;i<rows.length;i++){const r=rows[i]||[],cc=String(r[c.comp]??'').trim().replace(/\.0$/,''),item=String(r[c.item]??'').trim().replace(/\.0$/,''),coef=parseNum(r[c.coef],true);
    if(cc&&!/^0+$/.test(cc)&&!item){atual=cc;if(c0.desc>=0)titles[cc]=[String(r[c0.desc]??'').replace(/\s+/g,' ').trim(),c0.unit>=0?String(r[c0.unit]??'').trim():''];continue}
    const comp=cc&&!/^0+$/.test(cc)?cc:atual;
    if(!comp||!item||/^0+$/.test(comp)||/^0+$/.test(item)||comp===item||Number.isNaN(coef)||coef<0)continue;
    const t=c.tipo>=0&&/^comp/.test(norm(r[c.tipo]))?1:0;(map[comp]??=[]).push([t,item,coef]);n++}
  return{map,count:n,headerRow:hi,titles}
}
export function detectRef(...texts){
  const t=texts.join(' ');let m=t.match(/(20\d{2})[-_\/ ]?(0[1-9]|1[0-2])(?!\d)/);if(m)return`${m[1]}-${m[2]}`;
  m=t.match(/\b(0[1-9]|1[0-2])\s*[\/-]\s*(20\d{2})\b/);if(m)return`${m[2]}-${m[1]}`;
  const meses=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];m=norm(t).match(/\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*[\/\-. ]+(20\d{2}|\d{2})\b/);
  if(m){const y=m[2].length===2?'20'+m[2]:m[2];return`${y}-${String(meses.indexOf(m[1])+1).padStart(2,'0')}`}return''
}
/** Interpreta uma pasta de trabalho do SheetJS: devolve {regimes:{SD:{comp,ins}},ref,sheets,avisos}. */
export function parseSinapiSheets(sheetsRows,{uf='BA',fileName='',decimalComma=false}={}){
  const out={regimes:{},ref:'',sheets:[],avisos:[],diag:[]};
  const strictOnly=Object.keys(sheetsRows).some(n=>SHEET_KIND[cellKey(n)]);      // se o arquivo tem ISD/CSD..., ignora as outras abas
  for(const[name,rows]of Object.entries(sheetsRows)){
    if(strictOnly&&!SHEET_KIND[cellKey(name)]&&cellKey(name)!=='analitico'){out.diag.push(`Aba "${name}": ignorada (não é uma aba de preços do SINAPI).`);continue}
    const cl=classifySheet(name,rows,fileName);
    if(cl?.kind==='analitico'){const a=parseAnalitico(rows);if(a.count){Object.assign(out.analitico??={},a.map);Object.assign(out.titulos??={},a.titles||{});out.diag.push(`Aba "${name}" (composições analíticas): ${a.count.toLocaleString?a.count:a.count} linhas de itens em ${Object.keys(a.map).length} composições (cabeçalho na linha ${a.headerRow+1}).`)}else out.diag.push(`Aba "${name}": composições analíticas não reconhecidas (${a.reason||'sem itens'}).`+'\n'+sampleRows(rows));continue}
    if(!cl){out.diag.push(`Aba "${name}": ignorada.`);continue}
    const r=extractItems(rows,{uf,decimalComma,bare:cl.by==='nome',keepNoCode:cl.by==='nome'&&cl.kind==='comp'});
    if(r.reason==='uf'){out.avisos.push(`Aba ${name}: a UF ${uf} não existe nesta planilha (há ${r.ufs.join(', ')}).`);out.diag.push(`Aba "${name}": UF ${uf} não encontrada (há ${r.ufs.join(', ')}).`);continue}
    if(!r.items.length){if(r.reason)out.avisos.push(`Aba ${name}: não foi possível identificar as colunas (${r.reason==='percentual'?'a coluna encontrada parece ser percentual, não preço':r.reason}).`);out.diag.push(`Aba "${name}": nada importado (${r.reason||'sem itens'})${r.priceLabel?` — coluna de preço candidata: "${r.priceLabel}"`:''}.`);out.diag.push(sampleRows(rows));continue}
    const zeros=r.items.filter(i=>!(i[3]>0)).length;
    out.diag.push(`Aba "${name}" (${cl.kind==='comp'?'composições':'insumos'}, ${REGIMES[cl.regime]}): cabeçalho na linha ${r.headerRow+1}; código="${r.labels?.code}" descrição="${r.labels?.desc}" unidade="${r.labels?.unit}" preço="${r.labels?.price}" (coluna ${r.cols.price+1}); ${r.items.length} itens${zeros?` (${zeros} sem preço/custo para ${uf}, que o app oculta da busca)`:''}; exemplos: ${r.items.slice(0,3).map(i=>`${i[0]}=${i[3]}`).join(', ')}`);
    (out.regimes[cl.regime]??={comp:[],ins:[]})[cl.kind==='comp'?'comp':'ins'].push(...r.items);
    out.sheets.push({name,kind:cl.kind,regime:cl.regime,count:r.items.length});
    if(!out.ref)out.ref=detectRef(name,fileName,rows.slice(0,15).flat().join(' '))
  }
  if(!out.ref)out.ref=detectRef(fileName);return out
}
export function sampleRows(rows,n=8,cols=10){return'  primeiras linhas lidas:\n'+rows.slice(0,n).map((r,i)=>`   ${i+1}: `+(r||[]).slice(0,cols).map(c=>String(c??'').slice(0,28)).join(' | ')).join('\n')}
export function mergeParsed(a,b){a.diag=[...(a.diag||[]),...(b.diag||[])];if(b.analitico)Object.assign(a.analitico??={},b.analitico);if(b.titulos)Object.assign(a.titulos??={},b.titulos);
  for(const[rg,v]of Object.entries(b.regimes)){const t=(a.regimes[rg]??={comp:[],ins:[]});t.comp.push(...v.comp);t.ins.push(...v.ins)}
  a.sheets.push(...b.sheets);a.avisos.push(...b.avisos);if(!a.ref)a.ref=b.ref;return a
}
/** Composições cujo código vem como fórmula não calculada (0) são identificadas pelo nome+unidade na aba Analítico; as que não se resolvem são descartadas. */
export function finalizeParsed(out){
  const key=(d,u)=>norm(d).replace(/\s+/g,' ')+'|'+norm(u),idx=new Map();
  for(const[code,[d,u]]of Object.entries(out.titulos||{})){const k=key(d,u),v=idx.get(k);if(v===undefined)idx.set(k,code);else if(v!==code)idx.set(k,null)}
  let ok=0,perdidos=0;
  for(const v of Object.values(out.regimes))for(const lista of [v.comp,v.ins])for(let i=lista.length-1;i>=0;i--){const it=lista[i];if(it[0])continue;const c=idx.get(key(it[1],it[2]));if(c){it[0]=c;ok++}else{lista.splice(i,1);perdidos++}}
  if(ok||perdidos)(out.diag??=[]).push(`Códigos que vinham como fórmula (0): ${ok} recuperados pelo nome na aba Analítico; ${perdidos} descartados por não terem código identificável.`);
  return out
}
export function countOf(regimes){const c={};for(const[k,v]of Object.entries(regimes))c[k]={comp:v.comp.length,ins:v.ins.length};return c}

// ---------- CSV
export function parseCsv(text){
  text=String(text).replace(/^\ufeff/,'');const first=text.split(/\r?\n/).slice(0,6).join('\n');
  const cnt=d=>(first.match(new RegExp(d==='\t'?'\t':'\\'+d,'g'))||[]).length,delim=[';','\t',','].sort((a,b)=>cnt(b)-cnt(a))[0];
  const rows=[];let row=[],cur='',q=false;
  for(let i=0;i<text.length;i++){const c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){cur+='"';i++}else q=false}else cur+=c}
    else if(c==='"')q=true;else if(c===delim){row.push(cur);cur=''}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cur);cur='';if(row.some(x=>x!==''))rows.push(row);row=[]}
    else cur+=c}
  row.push(cur);if(row.some(x=>x!==''))rows.push(row);return rows
}
export function csvUsesDecimalComma(rows){return rows.slice(0,200).some(r=>r.some(c=>/^\s*(R\$\s*)?\d{1,3}(\.\d{3})*,\d{2,4}\s*$/.test(String(c))))}

// ---------- PDF (linhas de texto extraídas pelo pdf.js)
export function parsePdfLine(line){
  const t=String(line).trim().split(/\s+/);if(t.length<4)return null;
  const last=t[t.length-1];if(!/^(\d{1,3}(\.\d{3})+|\d+),\d{2,5}$/.test(last))return null;
  const price=parseNum(last,true);let ui=t.length-2;let origin='';
  if(/^(C|CR|AS|I|Q|E)$/i.test(t[ui])&&ui>3){origin=t[ui].toUpperCase();ui--}
  const unit=t[ui];if(!/^(?=.*[A-Za-zµ²³%])[A-Za-zµ²³%\/.0-9]{1,10}$/.test(unit))return null;
  let ci=-1;for(let k=0;k<Math.min(5,ui);k++)if(/^\d{3,8}$/.test(t[k])){ci=k;break}
  if(ci<0)return null;const desc=t.slice(ci+1,ui).join(' ');if(desc.length<4)return null;
  return{code:t[ci],desc,unit,price:r2(price),origin,group:t.slice(0,ci).join(' ')}
}
export function parsePdfLines(lines){
  const items=[];let last=null;
  for(const raw of lines){const l=String(raw).trim();if(!l)continue;const p=parsePdfLine(l);
    if(p){last=[p.code,p.desc,p.unit,p.price,p.origin,p.group];items.push(last)}
    else if(last&&l.length<110&&!/\d,\d{2}/.test(l)&&!/^(codigo|c[oó]digo|descri|pagina|p[aá]gina|sinapi|relat)/i.test(l)&&last[1].length<260&&!/^\d+$/.test(l))last[1]=(last[1]+' '+l).replace(/\s+/g,' ')
  }
  return{items}
}

// ---------- ZIP (leitor mínimo; descompacta com DecompressionStream)
export function listZip(buf){
  const u=new Uint8Array(buf),dv=new DataView(u.buffer,u.byteOffset,u.byteLength);let e=-1;
  for(let i=u.length-22;i>=Math.max(0,u.length-70000);i--)if(dv.getUint32(i,true)===0x06054b50){e=i;break}
  if(e<0)throw new Error('Arquivo ZIP inválido.');
  const n=dv.getUint16(e+10,true);let p=dv.getUint32(e+16,true);const out=[];
  for(let k=0;k<n;k++){
    if(dv.getUint32(p,true)!==0x02014b50)throw new Error('ZIP corrompido.');
    const flags=dv.getUint16(p+8,true),method=dv.getUint16(p+10,true),csize=dv.getUint32(p+20,true),usize=dv.getUint32(p+24,true),nl=dv.getUint16(p+28,true),xl=dv.getUint16(p+30,true),cl=dv.getUint16(p+32,true),off=dv.getUint32(p+42,true);
    if(csize===0xffffffff||off===0xffffffff)throw new Error('ZIP64 não suportado.');
    const name=new TextDecoder(flags&0x800?'utf-8':'latin1').decode(u.subarray(p+46,p+46+nl));
    out.push({name,method,csize,usize,off,dir:name.endsWith('/')});p+=46+nl+xl+cl
  }
  return out
}
export async function readZipEntry(buf,entry){
  const u=new Uint8Array(buf),dv=new DataView(u.buffer,u.byteOffset,u.byteLength),o=entry.off;
  if(dv.getUint32(o,true)!==0x04034b50)throw new Error('ZIP corrompido.');
  const start=o+30+dv.getUint16(o+26,true)+dv.getUint16(o+28,true),data=u.subarray(start,start+entry.csize);
  if(entry.method===0)return data.slice();
  if(entry.method!==8)throw new Error('Método de compactação não suportado.');
  const stream=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

// ---------- leitura de arquivos completos (usada pelo navegador e pelo script mensal de atualização)
const SINAPI_SHEETS=['isd','icd','ise','csd','ccd','cse'];
export function sheetRowsFromBuffer(XLSX,buf,{limit=10}={}){
  const names=XLSX.read(buf,{type:'array',bookSheets:true}).SheetNames,key=n=>norm(n).replace(/[\s_-]/g,''),pick=names.filter(n=>SINAPI_SHEETS.includes(key(n))||key(n)==='analitico');
  const use=(pick.length?pick:names).slice(0,limit),wb=XLSX.read(buf,{type:'array',sheets:use,cellFormula:true}),rows={};
  for(const n of use){const ws=wb.Sheets[n];if(!ws)continue;
    // o SINAPI traz alguns códigos como fórmula; sem o Excel para calcular, o valor guardado é 0 — recupera o número que está na fórmula
    for(const a of Object.keys(ws)){if(a[0]==='!')continue;const c=ws[a];if(c&&c.f&&(c.v===0||c.v===''||c.v==null)){const m=/"(\d{3,8})"/.exec(c.f)||/(?:^|[^\w.])(\d{4,8})(?![\w.])/.exec(c.f);if(m){c.v=m[1];c.t='s';delete c.w}}}}
  for(const n of use)if(wb.Sheets[n])rows[n]=XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:''});return rows
}
/** Lê um ZIP (ou XLSX) do SINAPI e devolve as composições e insumos de uma UF, por regime de desoneração. */
export async function parseSinapiPackage(XLSX,buf,fileName,{uf='BA',onProgress}={}){
  const out={regimes:{},ref:'',sheets:[],avisos:[],diag:[]},isZip=/\.zip$/i.test(fileName);   // (um XLSX também é um ZIP por dentro; por isso vale só a extensão)
  if(!isZip){const r=parseSinapiSheets(sheetRowsFromBuffer(XLSX,buf),{uf,fileName});if(!r.ref)r.ref=detectRef(fileName);return finalizeParsed(r)}
  const ab=buf instanceof ArrayBuffer?buf:buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),xs=listZip(ab).filter(e=>!e.dir&&/\.(xlsx|xls)$/i.test(e.name)&&!/__MACOSX|(^|\/)\./.test(e.name));
  const usar=xs.filter(e=>isPriceFileName(e.name));for(const e of xs)if(!usar.includes(e))out.diag.push(`Arquivo ${e.name.split('/').pop()}: ignorado (não contém preços de insumos/composições).`);
  if(!usar.length)throw new Error('O ZIP não contém a planilha de referência do SINAPI em XLSX. Baixe o relatório em formato XLSX.');
  for(const e of usar){onProgress?.(e.name);out.diag.push(`Arquivo ${e.name.split('/').pop()}: lido.`);const data=await readZipEntry(ab,e);mergeParsed(out,parseSinapiSheets(sheetRowsFromBuffer(XLSX,data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)),{uf,fileName:e.name}))}
  if(!out.ref)out.ref=detectRef(fileName);return finalizeParsed(out)
}

// ---------- busca e orçamento
// busca por PALAVRA: cada termo digitado precisa ser o início de uma palavra (código ou discriminação); "locação" não traz "colocação" nem "alocação"
export const wordKey=s=>' '+norm(s).replace(/[^a-z0-9]+/g,' ').trim();
export function makeIndex(items){return items.map(it=>({it,k:wordKey(it[0]+' '+it[1]),d:norm(it[1])}))}
export const cmpAz=(a,b)=>String(a).localeCompare(String(b),'pt-BR',{sensitivity:'base',numeric:true});
/** az=true: devolve os resultados em ordem alfabética de A a Z pela discriminação (o código digitado por inteiro vem primeiro). */
export function searchIndex(index,q,limit=100,{az=false}={}){
  const qs=norm(q);if(!qs)return{items:index.slice(0,limit).map(x=>x.it),more:index.length>limit,total:index.length};
  const toks=wordKey(q).trim().split(' ').filter(Boolean),hit=[];let total=0;
  if(!toks.length)return{items:[],more:false,total:0};
  for(const x of index)if(toks.every(t=>x.k.includes(' '+t))){total++;if(hit.length<(az?20000:limit*4))hit.push(x)}
  if(az){hit.sort((a,b)=>(norm(b.it[0])===qs)-(norm(a.it[0])===qs)||cmpAz(a.d??a.it[1],b.d??b.it[1])||cmpAz(a.it[0],b.it[0]));return{items:hit.slice(0,limit).map(x=>x.it),more:total>limit,total}}
  hit.sort((a,b)=>(norm(b.it[0])===qs)-(norm(a.it[0])===qs)||(norm(b.it[0]).startsWith(qs)-norm(a.it[0]).startsWith(qs))||a.it[1].length-b.it[1].length);
  return{items:hit.slice(0,limit).map(x=>x.it),more:total>limit,total}
}
export const itemTotal=i=>r2((Number(i.qty)||0)*(Number(i.price)||0));
export function budgetTotals(items,bdi){const sub=r2(items.reduce((s,i)=>s+itemTotal(i),0)),b=r2(sub*(Number(bdi)||0)/100);return{subtotal:sub,bdiValue:b,total:r2(sub+b),count:items.length}}
export const priceWithBdi=(p,bdi)=>r2((Number(p)||0)*(1+(Number(bdi)||0)/100));
export function validateBudgetItem(i){
  if(!String(i.desc||'').trim())return'Informe a discriminação do item.';
  if(!(Number(i.qty)>=0)||Number(i.qty)>1e9)return'Quantidade inválida.';
  if(!(Number(i.price)>=0)||Number(i.price)>1e9)return'Preço unitário inválido.';return''
}

// ---------- armazenamento local (IndexedDB) — as bases grandes não vão para o Firestore
const DB='obratop-bases';
function open(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{r.result.createObjectStore('meta',{keyPath:'id'});r.result.createObjectStore('data',{keyPath:'id'})};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
const tx=(db,st,mode,fn)=>new Promise((res,rej)=>{const t=db.transaction(st,mode),out=fn(t);t.oncomplete=()=>res(out&&typeof out==='object'&&'result' in out?out.result:out);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error)});
export async function saveBase(b){const db=await open(),{regimes,analitico,...meta}=b;meta.counts=countOf(regimes);meta.analiticoCount=Object.keys(analitico||{}).length;await tx(db,['meta','data'],'readwrite',t=>{t.objectStore('meta').put(meta);t.objectStore('data').put({id:b.id,regimes,analitico:analitico||{}})});db.close();return meta}
export async function listBases(){const db=await open(),all=await tx(db,'meta','readonly',t=>t.objectStore('meta').getAll());db.close();return(all||[]).sort((a,b)=>String(b.ref).localeCompare(String(a.ref)))}
export async function loadBase(id){const db=await open(),m=await tx(db,'meta','readonly',t=>t.objectStore('meta').get(id)),d=await tx(db,'data','readonly',t=>t.objectStore('data').get(id));db.close();return m&&d?{...m,regimes:d.regimes,analitico:d.analitico||{}}:null}
export async function deleteBase(id){const db=await open();await tx(db,['meta','data'],'readwrite',t=>{t.objectStore('meta').delete(id);t.objectStore('data').delete(id)});db.close()}
export const baseId=(fonte,uf,ref,regimeTag='')=>`${fonte}-${uf}-${ref||'sem-ref'}${regimeTag?'-'+regimeTag:''}`;

// ---------- composições analíticas (CPU): linhas como publicadas + explosão em insumos (material, mão de obra, equipamento)
export const KIND_NAME={MAT:'Material',MO:'Mão de obra',EQ:'Equipamento',OUT:'Outros'};
const _lk=new WeakMap();
export function makeLookup(reg){const k=_lk.get(reg);if(k)return k;const ins=new Map(),comp=new Map();for(const i of reg?.ins||[])ins.set(i[0],i);for(const c of reg?.comp||[])comp.set(c[0],c);const o={ins,comp};if(reg)_lk.set(reg,o);return o}
/** Classifica um insumo/composição auxiliar em MAT, MO, EQ ou OUT a partir de classificação, unidade e descrição. */
export function classifyResource(code,desc,unit,group=''){
  const d=norm(desc),g=norm(group),u=norm(unit);
  if(/^(chp|chi)$/.test(u)||/\b(chp|chi)\b/.test(d)||/custo horario (produtivo|improdutivo)/.test(d))return'EQ';
  if(/mao de obra|mao-de-obra/.test(g)||/\b(horista|mensalista)\b/.test(d)||/encargos complementares/.test(d)||(u==='h'&&/^(ajudante|servente|pedreiro|carpinteiro|armador|eletricista|encanador|pintor|soldador|operador|motorista|mestre|encarregado|auxiliar|montador|gesseiro|azulejista|impermeabilizador|marteleteiro|vidraceiro|serralheiro|marceneiro|operario|calceteiro|topografo|engenheiro|tecnico|ferreiro|bombeiro|instalador|lixador|estucador|rejuntador|assentador)\b/.test(d)))return'MO';
  if(/equipamento|aluguel|locacao/.test(g))return'EQ';
  if(/^servic|terceir/.test(g))return'OUT';
  return'MAT'
}
function leafKind(sub){ // composição auxiliar que é um recurso "pronto": hora de equipamento (CHP/CHI) ou hora de mão de obra com encargos
  const u=norm(sub[2]),d=norm(sub[1]);if(/^(chp|chi)$/.test(u))return'EQ';if(u==='h'&&/encargos complementares|horista|mensalista/.test(d))return'MO';return null}
/** Monta a composição analítica de uma composição do SINAPI: linhas (como publicadas), insumos explodidos e totais. */
export function buildCpu(base,regime,code,{maxDepth=5}={}){
  const reg=base?.regimes?.[regime];if(!reg)return null;const L=makeLookup(reg),comp=L.comp.get(String(code));if(!comp)return null;
  const an=base.analitico||{},lines=an[String(code)]||[],out={code:comp[0],desc:comp[1],unit:comp[2],unitCost:comp[3],hasAnalitic:lines.length>0,lines:[],flat:[],total:0};
  if(!lines.length)return out;
  const CLS={MO:'MO',MAT:'MAT',EQ:'EQ',OUT:'OUT',COMP:'COMP'};
  const res=(t,ic,x)=>{if(x&&x.length>=5&&x[4]>0){const i=t===0?L.ins.get(ic):L.comp.get(ic),d=x[5]||i?.[1]||(t===0?`Insumo ${ic}`:`Composição ${ic}`),u=x[6]??i?.[2]??'';return{desc:d,unit:u,price:x[4],cls:CLS[x[3]]||(t===0?'MAT':'COMP'),found:true}}
    if(t===0){const i=L.ins.get(ic);return i?{desc:i[1],unit:i[2],price:i[3],cls:classifyResource(ic,i[1],i[2],i[5]),found:true}:{desc:`Insumo ${ic} (sem preço nesta base)`,unit:'',price:0,cls:'MAT',found:false}}
    const c=L.comp.get(ic);return c?{desc:c[1],unit:c[2],price:c[3],cls:leafKind(c)||'COMP',found:true}:{desc:`Composição ${ic} (sem custo nesta base)`,unit:'',price:0,cls:'COMP',found:false}};
  for(const ln of lines){const[t,ic,coef]=ln,r=res(t,ic,ln);out.lines.push({tipo:t===0?'INSUMO':'COMPOSIÇÃO',code:ic,desc:r.desc,unit:r.unit,coef,price:r.price,cost:coef*r.price,cls:r.cls,found:r.found})}
  out.total=out.lines.reduce((s,l)=>s+l.cost,0);
  const flat=new Map(),add=(ic,desc,unit,cls,coef,price)=>{const k=ic+'|'+cls;const x=flat.get(k);if(x)x.coef+=coef;else flat.set(k,{code:ic,desc,unit,cls,coef,price})};
  const explode=(cc,mult,depth)=>{for(const ln of an[cc]||[]){const[t,ic,coef]=ln,r=res(t,ic,ln),m=mult*coef;
    if(t===0)add(ic,r.desc,r.unit,r.cls,m,r.price);
    else if(r.cls==='EQ'||r.cls==='MO')add(ic,r.desc,r.unit,r.cls,m,r.price);
    else if(depth<maxDepth&&an[ic]?.length)explode(ic,m,depth+1);
    else add(ic,r.desc,r.unit,'OUT',m,r.price)}};
  explode(String(code),1,1);out.flat=[...flat.values()];return out
}
/** Converte os insumos explodidos para o formato de composição do orçamento do ObraTop (até 60 linhas; o excedente de menor custo vira "Outros"). */
export function toComposition(flat,max=60){
  const arr=flat.map(f=>({kind:KIND_NAME[f.cls]||'Outros',description:String(f.desc).slice(0,140),unit:String(f.unit||'').slice(0,12),coef:Math.round(f.coef*1e6)/1e6,price:r2(f.price),code:String(f.code)})).filter(x=>x.coef>0);
  if(arr.length<=max)return arr;arr.sort((a,b)=>b.coef*b.price-a.coef*a.price);const keep=arr.slice(0,max-1),rest=arr.slice(max-1);
  keep.push({kind:'Outros',description:`Demais insumos (${rest.length} itens de menor custo)`,unit:'vb',coef:1,price:r2(rest.reduce((s,x)=>s+x.coef*x.price,0)),code:''});return keep
}


// ---------- bases oficiais publicadas pelo robô no GitHub (catálogo)
const FONTE_CAT={SINAPI:'SINAPI','ORSE-SE':'ORSE'};
const REG_CAT=r=>{const n=norm(r||'');return n==='desonerado'?'CD':'SD'};
const catUrl=()=>(typeof window!=='undefined'&&window.OBRATOP_COST_BASES_CATALOG_URL||'').trim();
async function gzJson(url){
  const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`Falha HTTP ${r.status} ao baixar a base.`);
  const buf=await r.arrayBuffer();
  if(typeof DecompressionStream!=='function')throw new Error('Este navegador não descompacta a base. Atualize o Chrome/Edge.');
  const st=new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));return JSON.parse(await new Response(st).text())
}
/** Lista as bases prontas do catálogo para a fonte (SINAPI|ORSE), agrupadas por UF e mês: [{key,fonte,uf,ref,entries}] */
export async function catalogGroups(fonte){
  const u=catUrl();if(!u)throw new Error('Catálogo de bases não configurado.');
  const r=await fetch(u+(u.includes('?')?'&':'?')+'t='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error(`Catálogo indisponível (HTTP ${r.status}).`);
  const c=await r.json(),g=new Map();
  for(const b of c.bases||[]){if(b.status!=='ready'||FONTE_CAT[b.source]!==fonte)continue;const k=`${b.uf}|${b.reference}`;(g.get(k)||g.set(k,{key:k,fonte,uf:b.uf,ref:b.reference,entries:[]}).get(k)).entries.push(b)}
  return [...g.values()].sort((a,b)=>String(b.ref).localeCompare(String(a.ref))||a.uf.localeCompare(b.uf))
}
/** Baixa as bases de um grupo e monta o objeto {uf,ref,regimes,analitico} no formato local. */
export async function catalogDownload(group,onProgress){
  const regimes={},analitico={};
  for(const e of group.entries){
    onProgress?.(`Baixando ${e.regime||'base'}…`);
    const d=await gzJson(e.url),rg=(regimes[REG_CAT(e.regime)]??={comp:[],ins:[]});
    for(const x of d.rows||[]){const price=r2(Number(x.price));if(!(price>0))continue;
      const row=[String(x.code),String(x.description||''),String(x.unit||''),price,'',String(x.group||'')];
      (/^C|^Comp/i.test(String(x.sheet||''))?rg.comp:rg.ins).push(row)}
    if(e.analiticoUrl){onProgress?.('Baixando composições analíticas…');Object.assign(analitico,await gzJson(e.analiticoUrl))}
  }
  return{uf:group.uf,ref:group.ref,regimes,analitico}
}
