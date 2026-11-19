// ObraTop — identidade visual da empresa: logo (validação, redução) e cabeçalho/rodapé padronizados de PDF.
// As funções puras são testadas em tests/unit/branding.test.mjs; processLogoFile usa o navegador (canvas).
export const LOGO_MAX_W=480, LOGO_MAX_H=160, LOGO_MAX_FILE=5*1024*1024, LOGO_MAX_CHARS=260000, LOGO_MAX_PIXELS=36e6;

/** Lê largura/altura de um PNG ou JPEG sem decodificar a imagem (evita abrir arquivos gigantes). */
export function peekDimensions(bytes){
  if(!bytes||bytes.length<24)return null;
  const png=[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a];
  if(png.every((b,i)=>bytes[i]===b)){
    const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const w=dv.getUint32(16),h=dv.getUint32(20);return w>0&&h>0?{type:'png',w,h}:null
  }
  if(bytes[0]===0xff&&bytes[1]===0xd8){
    let i=2;
    while(i+9<bytes.length){
      if(bytes[i]!==0xff){i++;continue}
      const m=bytes[i+1];
      if(m===0xff){i++;continue}
      if(m>=0xd0&&m<=0xd9||m===0x01){i+=2;continue}
      const len=(bytes[i+2]<<8)|bytes[i+3];
      if(m>=0xc0&&m<=0xcf&&m!==0xc4&&m!==0xc8&&m!==0xcc){
        const h=(bytes[i+5]<<8)|bytes[i+6],w=(bytes[i+7]<<8)|bytes[i+8];return w>0&&h>0?{type:'jpeg',w,h}:null
      }
      i+=2+len
    }
  }
  return null
}
export function fitSize(w,h,maxW=LOGO_MAX_W,maxH=LOGO_MAX_H){const r=Math.min(1,maxW/w,maxH/h);return{w:Math.max(1,Math.round(w*r)),h:Math.max(1,Math.round(h*r))}}
export function logoFormat(url){const m=/^data:image\/(png|jpeg);base64,/.exec(url||'');return m?m[1]:null}
export function isValidLogo(url){return typeof url==='string'&&url.length<=LOGO_MAX_CHARS&&/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(url)}

/** Navegador: valida, reduz e converte o arquivo escolhido em data URL (PNG; JPEG se ficar grande). */
export async function processLogoFile(file){
  if(!file)throw new Error('Escolha um arquivo de imagem.');
  if(!['image/png','image/jpeg'].includes(file.type))throw new Error('Use um arquivo PNG ou JPG. SVG, GIF e WebP não são aceitos.');
  if(file.size>LOGO_MAX_FILE)throw new Error('O arquivo tem mais de 5 MB.');
  const bytes=new Uint8Array(await file.arrayBuffer()),dim=peekDimensions(bytes);
  if(!dim)throw new Error('Não foi possível ler a imagem. Confira se é um PNG ou JPG válido.');
  if((file.type==='image/png')!==(dim.type==='png'))throw new Error('O tipo do arquivo não confere com o seu conteúdo.');
  if(dim.w*dim.h>LOGO_MAX_PIXELS)throw new Error(`A imagem é muito grande (${dim.w}×${dim.h} px). Reduza para no máximo 6000×6000 px.`);
  let bmp;try{bmp=await createImageBitmap(new Blob([bytes],{type:file.type}))}catch{throw new Error('A imagem está corrompida ou não pôde ser aberta.')}
  const{w,h}=fitSize(dim.w,dim.h),cv=document.createElement('canvas');cv.width=w;cv.height=h;
  const ctx=cv.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(bmp,0,0,w,h);bmp.close?.();
  let url=cv.toDataURL('image/png');
  if(url.length>LOGO_MAX_CHARS){ctx.globalCompositeOperation='destination-over';ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);url=cv.toDataURL('image/jpeg',0.88);if(url.length>LOGO_MAX_CHARS)url=cv.toDataURL('image/jpeg',0.7)}
  if(!isValidLogo(url))throw new Error('Não foi possível reduzir a imagem ao tamanho permitido. Use um logo mais simples ou menor.');
  return{dataUrl:url,w,h,name:String(file.name||'logo').slice(0,80),kb:Math.round(url.length*3/4/1024)}
}

// ---------- PDF padronizado (recebe o construtor/instância do jsPDF)
const MAP={'–':'-','—':'-','−':'-','•':'-','…':'...','“':'"','”':'"','‘':"'",'’':"'",'→':'->','←':'<-','≥':'>=','≤':'<=','×':'x','÷':'/','✓':'ok','⚠':'!','º':'o','ª':'a','²':'2','³':'3'};
/** O jsPDF com fontes padrão só desenha Latin-1: troca símbolos fora dele para evitar caracteres quebrados. */
export function pdfText(v){return String(v??'').replace(/[^\x00-\xff]/g,c=>MAP[c]??'?').replace(/[\u0080-\u009f]/g,'')}
export function drawPdfHeader(doc,o){
  const margin=o.margin??12,pw=doc.internal.pageSize.getWidth();let x=margin,top=9,hLogo=0;
  const fmt=o.logo&&isValidLogo(o.logo.dataUrl)?logoFormat(o.logo.dataUrl):null;
  if(fmt){const r=Math.min(46/o.logo.w,16/o.logo.h),w=o.logo.w*r,h=o.logo.h*r;doc.addImage(o.logo.dataUrl,fmt==='png'?'PNG':'JPEG',x,top,w,h);x+=w+4;hLogo=h}
  doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(11,54,84);doc.text(pdfText(o.orgName||'ObraTop'),x,top+5);
  doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(90,100,110);
  const maxW=pw-margin-x-52,lines=companyLines({cnpj:o.cnpj,address:o.address,phone:o.phone,email:o.email}).flatMap(l=>doc.splitTextToSize?doc.splitTextToSize(pdfText(l),maxW):[pdfText(l)]);
  lines.forEach((l,i)=>doc.text(pdfText(l),x,top+9.5+i*3.9));
  doc.text(pdfText(o.generatedAt||''),pw-margin,top+5,{align:'right'});
  const y=top+Math.max(hLogo,6+lines.length*3.9)+3;
  doc.setDrawColor(11,54,84);doc.setLineWidth(0.5);doc.line(margin,y,pw-margin,y);
  doc.setFont('helvetica','bold');doc.setFontSize(13);doc.setTextColor(20,30,40);doc.text(pdfText(o.title||''),margin,y+7);
  let end=y+7;
  if(o.subtitle){doc.setFont('helvetica','normal');doc.setFontSize(8.5);doc.setTextColor(90,100,110);doc.text(pdfText(o.subtitle),margin,y+12);end=y+12}
  doc.setTextColor(0,0,0);return end+4
}
export function drawPdfFooters(doc,o){
  const margin=o.margin??12,n=doc.getNumberOfPages(),pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();
  for(let i=1;i<=n;i++){doc.setPage(i);doc.setDrawColor(200,205,210);doc.setLineWidth(0.2);doc.line(margin,ph-9,pw-margin,ph-9);doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setTextColor(110,120,130);
    doc.text(pdfText(`${o.orgName||'ObraTop'} - ObraTop ${o.release||''}`),margin,ph-5);doc.text(`Página ${i} de ${n}`,pw-margin,ph-5,{align:'right'})}
  doc.setTextColor(0,0,0)
}
/** Larguras de coluna proporcionais ao conteúdo, entre min e max, somando exatamente a largura útil. */
export function columnWidths(columns,rows,usable,min=14,max=70){
  const w=columns.map(c=>{const len=Math.max(String(c).length,...rows.slice(0,60).map(r=>String(r[c]??'').length),1);return Math.min(max,Math.max(min,Math.sqrt(len)*7))});
  const sum=w.reduce((a,b)=>a+b,0),k=usable/sum;return w.map(x=>x*k)
}
export function buildTablePdf(doc,o){
  const margin=o.margin??12,pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight(),usable=pw-2*margin;
  const all=[...new Set(o.rows.flatMap(Object.keys))].filter(c=>o.rows.some(r=>String(r[c]??'').trim()!=='')),max=o.maxColumns??10,pin=o.pinLast&&all.includes(o.pinLast)?o.pinLast:null,columns=pin?[...all.filter(c=>c!==pin).slice(0,max-1),pin]:all.slice(0,max),omitted=all.length-columns.length;   // pinLast: coluna que sempre fica por último no PDF
  const widths=columnWidths(columns,o.rows,usable),lineH=3.4,pad=1.6,head=()=>drawPdfHeader(doc,o);
  let y=head();
  const drawHead=()=>{doc.setFont('helvetica','bold');doc.setFontSize(7.5);const hl=columns.map((c,i)=>doc.splitTextToSize(pdfText(c),widths[i]-2*pad).slice(0,2)),hh=Math.max(1,...hl.map(l=>l.length))*3.4+2.8;doc.setFillColor(11,54,84);doc.rect(margin,y,usable,hh,'F');doc.setTextColor(255,255,255);let x=margin;hl.forEach((l,i)=>{doc.text(l,x+pad,y+4);x+=widths[i]});doc.setTextColor(0,0,0);y+=hh};
  drawHead();doc.setFont('helvetica','normal');doc.setFontSize(7.5);
  o.rows.forEach((r,ri)=>{
    const cells=columns.map((c,i)=>doc.splitTextToSize(pdfText(r[c]),widths[i]-2*pad)),lines=Math.max(1,...cells.map(c=>c.length)),h=lines*lineH+2*pad-1;
    if(y+h>ph-14){doc.addPage();y=head();drawHead();doc.setFont('helvetica','normal');doc.setFontSize(7.5)}
    if(ri%2===0){doc.setFillColor(243,246,248);doc.rect(margin,y,usable,h,'F')}
    let x=margin;cells.forEach((c,i)=>{doc.text(c,x+pad,y+pad+2.2);x+=widths[i]});y+=h
  });
  if(omitted>0){doc.setFontSize(7);doc.setTextColor(110,120,130);doc.text(pdfText(`${omitted} coluna(s) adicional(is) não exibida(s) neste PDF; exporte em Excel para ver todas.`),margin,Math.min(y+5,ph-12));doc.setTextColor(0,0,0)}
  drawPdfFooters(doc,o);return{columns,omitted,pages:doc.getNumberOfPages()}
}

// ---------- dados da empresa (cabeçalho de relatórios e impressões)
export function formatCnpj(v){const d=String(v||'').replace(/\D/g,'');return d.length===14?d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5'):String(v||'').trim().slice(0,24)}
export function validEmail(v){v=String(v||'').trim();return v===''||/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)}
/** Linhas do cabeçalho abaixo do nome da empresa: CNPJ, endereço e contato. */
export function companyLines(o={}){const l=[];if(o.cnpj)l.push('CNPJ: '+o.cnpj);if(o.address)l.push(o.address);const c=[];if(o.phone)c.push('Tel.: '+o.phone);if(o.email)c.push('E-mail: '+o.email);if(c.length)l.push(c.join('  •  '));return l}

// ---------- PDF da planilha orçamentária (modelo: ITENS | CÓD. | DESCRIÇÃO | UNID | QUANT | PR. UNIT | PR. TOTAL) e das composições analíticas
export const f2=v=>(Number(v)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const f4=v=>(Number(v)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:6});
/** o.sheet = resultado de buildSheet(); o.valorExtenso = texto; o.showEtapaTotal; o.note */
export function buildSheetPdf(doc,o){
  const margin=o.margin??8,pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight(),usable=pw-2*margin,W=[14,24,usable-14-24-12-20-20-22,12,20,20,22],X=[];W.reduce((x,w,i)=>(X[i]=x,x+w),margin);
  const pad=1.4,lh=3.7;let y=drawPdfHeader(doc,{...o,margin});
  const HT=['ITENS','CÓD. SINAPI/ORSE','DESCRIÇÃO DOS SERVIÇOS','UNID','QUANT','PR. UNIT','PR. TOTAL'];
  const head=()=>{doc.setFont('times','bold');doc.setFontSize(8.5);const ls=HT.map((t,i)=>doc.splitTextToSize(pdfText(t),W[i]-1.5)),h=Math.max(6.2,Math.max(...ls.map(l=>l.length))*3.5+2.6);
    doc.setFillColor(225,231,236);doc.rect(margin,y,usable,h,'F');doc.setDrawColor(120,130,140);doc.setLineWidth(0.25);doc.rect(margin,y,usable,h);
    ls.forEach((l,i)=>doc.text(l,X[i]+W[i]/2,y+(h-l.length*3.5)/2+2.7,{align:'center'}));y+=h};
  head();
  const room=h=>{if(y+h>ph-13){doc.addPage();y=margin+2;head()}};
  for(const r of o.sheet.rows){
    if(r.kind==='gap'){y+=2.2;continue}
    if(r.kind==='etapa'){if(r.empty)continue;room(8);doc.setFont('times','bold');doc.setFontSize(9);doc.setFillColor(238,242,245);doc.rect(margin,y,usable,5.6,'F');doc.text(pdfText(r.no),X[0]+W[0]/2,y+4,{align:'center'});doc.text(pdfText(r.desc),X[2]+pad,y+4);
      if(o.showEtapaTotal)doc.text(f2(o.sheet.etapaTotals[r.etapaId]),X[6]+W[6]-pad,y+4,{align:'right'});y+=5.6;continue}
    if(r.kind==='sub'){room(8);doc.setFont('times','bold');doc.setFontSize(9);doc.text(pdfText(r.no),X[0]+W[0]/2,y+4,{align:'center'});const l=doc.splitTextToSize(pdfText(r.desc),W[2]-2*pad);doc.text(l,X[2]+pad,y+4);y+=Math.max(5.4,l.length*lh+1.4);continue}
    doc.setFont('times','normal');doc.setFontSize(9);const dl=doc.splitTextToSize(pdfText(r.desc),W[2]-2*pad),cl=doc.splitTextToSize(pdfText(r.code),W[1]-2*pad),h=Math.max(5.4,Math.max(dl.length,cl.length)*lh+1.6);
    room(h);doc.text(pdfText(r.no),X[0]+W[0]/2,y+4,{align:'center'});doc.text(cl,X[1]+W[1]/2,y+4,{align:'center'});doc.text(dl,X[2]+pad,y+4);doc.text(pdfText(r.unit),X[3]+W[3]/2,y+4,{align:'center'});
    doc.text(f2(r.qty),X[4]+W[4]-pad,y+4,{align:'right'});doc.text(f2(r.unitPrice),X[5]+W[5]-pad,y+4,{align:'right'});doc.text(f2(r.total),X[6]+W[6]-pad,y+4,{align:'right'});
    doc.setDrawColor(215,220,225);doc.setLineWidth(0.15);doc.line(margin,y+h,margin+usable,y+h);y+=h
  }
  const ext=doc.splitTextToSize(pdfText(o.valorExtenso||''),usable-4);room(30+ext.length*4.2);y+=3;
  doc.setDrawColor(40,50,60);doc.setLineWidth(0.4);doc.line(margin,y,margin+usable,y);y+=5.5;doc.setFont('times','bold');doc.setFontSize(10);
  if(o.sheet.mode==='linha'&&o.sheet.bdi>0){doc.setFont('times','normal');doc.setFontSize(8.5);doc.text(pdfText(`Custo direto: R$ ${f2(o.sheet.direct)}   •   BDI ${String(o.sheet.bdi).replace('.',',')}%: R$ ${f2(o.sheet.bdiValue)}   (preços unitários já incluem o BDI)`),margin+pad,y);y+=5;doc.setFont('times','bold');doc.setFontSize(10)}
  else if(o.sheet.bdi>0){doc.setFont('times','normal');doc.setFontSize(8.5);doc.text(pdfText(`Custo direto: R$ ${f2(o.sheet.direct)}   •   BDI ${String(o.sheet.bdi).replace('.',',')}%: R$ ${f2(o.sheet.bdiValue)}`),margin+pad,y);y+=5;doc.setFont('times','bold');doc.setFontSize(10)}
  doc.text('TOTAL',X[2]+W[2]/2,y,{align:'center'});doc.text(`R$ ${f2(o.sheet.total)}`,margin+usable-pad,y,{align:'right'});y+=7;
  doc.text('Valor da obra:',margin+pad,y);y+=5;doc.setFontSize(9.5);doc.text(ext,margin+pad,y);y+=ext.length*4.2+2;
  if(o.note){doc.setFont('times','italic');doc.setFontSize(8);doc.setTextColor(90,100,110);doc.text(doc.splitTextToSize(pdfText(o.note),usable),margin+pad,y+2);doc.setTextColor(0,0,0)}
  drawPdfFooters(doc,{...o,margin});return{pages:doc.getNumberOfPages()}
}
/** o.blocks=[{no,code,desc,unit,qty,cpu:{lines:[{tipo,code,desc,unit,coef,price,cost,cls}],total},unitPrice}] */
export function buildCpuPdf(doc,o){
  const margin=o.margin??8,pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight(),usable=pw-2*margin,W=[20,20,usable-20-20-12-18-20-22,12,18,20,22],X=[];W.reduce((x,w,i)=>(X[i]=x,x+w),margin);
  const pad=1.2,lh=3.5;let y=drawPdfHeader(doc,{...o,margin});
  const room=h=>{if(y+h>ph-13){doc.addPage();y=margin+2}};
  const KIND={INSUMO:'Insumo','COMPOSIÇÃO':'Composição'};
  for(const b of o.blocks){
    const hl=doc.splitTextToSize(pdfText(`${b.no}  ${b.code?'['+b.code+'] ':''}${b.desc}`),usable-3),need=hl.length*lh+14+(b.cpu?.lines?.length?Math.min(b.cpu.lines.length,4)*5:0);room(need);
    doc.setFillColor(225,231,236);doc.rect(margin,y,usable,hl.length*lh+2.2,'F');doc.setFont('times','bold');doc.setFontSize(9);doc.text(hl,margin+pad,y+3.7);y+=hl.length*lh+2.2;
    if(b.cpu?.lines?.length){
      doc.setFont('times','bold');doc.setFontSize(8);['Código','Tipo','Descrição','Unid.','Coef.','Preço unit.','Custo'].forEach((t,i)=>doc.text(t,i>=4?X[i]+W[i]-pad:X[i]+pad,y+3.4,{align:i>=4?'right':'left'}));y+=4.6;doc.setDrawColor(150,160,170);doc.setLineWidth(0.15);doc.line(margin,y-0.6,margin+usable,y-0.6);
      doc.setFont('times','normal');doc.setFontSize(8);
      for(const l of b.cpu.lines){const dl=doc.splitTextToSize(pdfText(l.desc),W[2]-2*pad),h=Math.max(4.4,dl.length*lh+1);room(h);
        doc.text(pdfText(l.code),X[0]+pad,y+3.3);doc.text(KIND[l.tipo]||l.tipo,X[1]+pad,y+3.3);doc.text(dl,X[2]+pad,y+3.3);doc.text(pdfText(l.unit),X[3]+pad,y+3.3);doc.text(f4(l.coef),X[4]+W[4]-pad,y+3.3,{align:'right'});doc.text(f2(l.price),X[5]+W[5]-pad,y+3.3,{align:'right'});doc.text(f2(l.cost),X[6]+W[6]-pad,y+3.3,{align:'right'});y+=h}
    }else{doc.setFont('times','italic');doc.setFontSize(8);doc.setTextColor(120,90,20);doc.text(pdfText(b.noteSemCpu||'Sem composição analítica nesta base: o item usa o preço unitário publicado.'),margin+pad,y+3.6);doc.setTextColor(0,0,0);y+=5.4}
    room(13);doc.setFont('times','bold');doc.setFontSize(8.5);const line=(t,v,bold)=>{doc.setFont('times',bold?'bold':'normal');doc.text(pdfText(t),X[5]-2,y+3.4,{align:'right'});doc.text(v,X[6]+W[6]-pad,y+3.4,{align:'right'});y+=4.4};
    line(`Custo unitário (${pdfText(b.unit||'un')})`,f2(b.cpu?.lines?.length?b.cpu.total:b.baseUnit),true);if(b.cpu?.lines?.length&&Math.abs(b.cpu.total-b.baseUnit)>0.015)line('Preço publicado da composição',f2(b.baseUnit),false);
    if(b.bdi>0)line(`Preço unitário com BDI ${String(b.bdi).replace('.',',')}%`,f2(b.unitPrice),true);y+=3.5
  }
  drawPdfFooters(doc,{...o,margin});return{pages:doc.getNumberOfPages()}
}
