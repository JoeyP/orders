import {PDFDocument,StandardFonts} from 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm';
const tidy=s=>String(s||'').replace(/\s+/g,' ').trim();
function joinRuns(parts){
 let out='';
 for(const part of parts){
  const v=part.textContent||'';
  if(!v)continue;
  if(out&&/\w$/.test(out)&&/^\w/.test(v)&&/^\s/.test(v)===false){out+=v;continue}
  out+=v;
 }
 return tidy(out);
}
function formatSpec(s){
 return tidy(s).replace(/(\d)\s*\.\s*(\d)/g,'$1.$2').replace(/([A-Za-z])\s+([A-Za-z]{2,})/g,(m,a,b)=>a.length===1&&/^[A-Z]/.test(a)?a+b:m).replace(/([<>])\s*(=)\s*/g,'$1$2').replace(/([<>]=?)\s+(\d)/g,'$1$2');
}
function formatContainer(s){
 const v=tidy(s),m=v.match(/^(\d+(?:\.\d+)?)\s*(g|gal|gallon|gallons)?$/i);
 if(!m)return v;
 const n=Number(m[1]);if(n===55)return '55 Gallon Drum';
 if(n===275||n===300)return m[1]+' Gallon Tote';
 return m[1]+' Gallon Container';
}
const ascii=s=>String(s||'').replace(/[–—−]/g,'-').replace(/≥/g,'>=').replace(/≤/g,'<=').replace(/°/g,' deg ').replace(/[^\x20-\x7E]/g,'');
function linesFrom(xml){
 const doc=new DOMParser().parseFromString(xml,'application/xml');
 if(doc.querySelector('parsererror'))throw Error('Invalid Word XML.');
 return [...doc.getElementsByTagName('w:p')].map(p=>joinRuns([...p.getElementsByTagName('w:t')])).filter(Boolean);
}
function extract(lines){
 const title=lines.findIndex(x=>/certificate of analysis/i.test(x));
 const lot=lines.findIndex(x=>/^lot number\b/i.test(x));
 const qty=lines.findIndex(x=>/^qty\./i.test(x));
 const spec=lines.findIndex(x=>/physical product specifications/i.test(x));
 if(title<0||lot<0||qty<0||spec<0||!lines[title+1])throw Error('This certificate has an unfamiliar layout. Please use the original.');
 const product=lines.slice(title+1,lot).find(x=>!/^lot number/i.test(x));
 const statement=lines.slice(qty+1,spec).filter(x=>!/^product specifications met/i.test(x)).join(' ');
 const properties=[];
 for(const l of lines.slice(spec+1)){
  const m=l.match(/^(.{2,65}?:)\s*(.+)$/);
  if(m)properties.push([tidy(m[1]),formatSpec(m[2])]);
 }
 if(properties.length<2||properties.length>30)throw Error('Specifications could not be verified from the original.');
 return{product,statement,properties};
}
async function zipLoad(blob){
 if(!window.JSZip)await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';s.onload=resolve;s.onerror=reject;document.head.append(s)});
 return window.JSZip.loadAsync(blob);
}
function wrapped(text,font,size,width){
 const words=ascii(text).split(/\s+/),lines=[];let current='';
 for(const word of words){const next=current?current+' '+word:word;if(font.widthOfTextAtSize(next,size)>width&&current){lines.push(current);current=word}else current=next}
 if(current)lines.push(current);return lines;
}
export async function createCoaPdf(blob,values){
 const zip=await zipLoad(blob),document=zip.file('word/document.xml');
 if(!document)throw Error('This file is not a supported DOCX.');
 const data=extract(linesFrom(await document.async('string')));
 const imageFile=zip.file('word/media/image1.png')||zip.file('word/media/image1.jpg')||zip.file('word/media/image1.jpeg');
 if(!imageFile)throw Error('Company letterhead image not found. No PDF created.');
 const pdf=await PDFDocument.create(),page=pdf.addPage([612,792]);
 const normal=await pdf.embedFont(StandardFonts.TimesRoman),bold=await pdf.embedFont(StandardFonts.TimesRomanBold),italic=await pdf.embedFont(StandardFonts.TimesRomanItalic);
 const bytes=await imageFile.async('uint8array');
 const img=/\.png$/i.test(imageFile.name)?await pdf.embedPng(bytes):await pdf.embedJpg(bytes);
 const scale=Math.min(575/img.width,112/img.height),w=img.width*scale,h=img.height*scale;
 let y=780-h;page.drawImage(img,{x:(612-w)/2,y,width:w,height:h});y-=42;
 const heading='Certificate of Analysis';page.drawText(heading,{x:(612-bold.widthOfTextAtSize(heading,17))/2,y,size:17,font:bold});y-=57;
 for(const line of wrapped(data.product,bold,14,530)){page.drawText(line,{x:35,y,size:14,font:bold});y-=19}
 y-=23;
 function field(label,value){page.drawText(label,{x:35,y,size:14,font:bold});for(const line of wrapped(value,bold,14,380)){page.drawText(line,{x:182,y,size:14,font:bold});y-=19}y-=22}
 field('Lot Number',values.lot);
 field('Qty.',values.quantity+' - '+formatContainer(values.container));
 page.drawText('Product Specifications met:',{x:35,y,size:12,font:normal});
 page.drawText('YES',{x:270,y,size:12,font:normal});y-=47;
 const statement=data.statement||'The specifications noted below are the parameters used to confirm product is within formulation standards. All product batches are tested to confirm product specifications are met and batch numbers recorded.';
 for(const line of wrapped(statement,normal,11,540)){page.drawText(line,{x:35,y,size:11,font:normal});y-=15}
 y-=31;page.drawText('Physical Product Specifications:',{x:35,y,size:12,font:italic});y-=30;
 for(const [key,value] of data.properties){
  const label=ascii(key);const vlines=wrapped(value,normal,11,390);
  if(y-vlines.length*15<45)throw Error('This certificate exceeds one page. PDF not generated.');
  page.drawText(label,{x:35,y,size:11,font:normal});
  for(const v of vlines){page.drawText(v,{x:174,y,size:11,font:normal});y-=15}
 }
 return{bytes:await pdf.save(),data};
}
