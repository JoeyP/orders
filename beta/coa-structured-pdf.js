import {PDFDocument,StandardFonts} from 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm';
const ascii=s=>String(s??'').replace(/[–—−]/g,'-').replace(/≥/g,'>=').replace(/≤/g,'<=').replace(/°/g,' degrees ').replace(/[^\x20-\x7e]/g,'');
function wrap(s,font,size,max){const words=ascii(s).split(/\s+/),out=[];let line='';for(const w of words){const next=line?line+' '+w:w;if(font.widthOfTextAtSize(next,size)>max&&line){out.push(line);line=w}else line=next}if(line)out.push(line);return out}
export async function structuredPdf(spec,values,headerBytes){
 if(spec.extraction_status!=='approved')throw Error('Specifications have not been approved in COA Masters.');
 const pdf=await PDFDocument.create(),page=pdf.addPage([612,792]),font=await pdf.embedFont(StandardFonts.TimesRoman),bold=await pdf.embedFont(StandardFonts.TimesRomanBold),italic=await pdf.embedFont(StandardFonts.TimesRomanItalic);
 let y=760;
 if(headerBytes){const img=await pdf.embedPng(headerBytes);const k=Math.min(570/img.width,110/img.height),w=img.width*k,h=img.height*k;page.drawImage(img,{x:(612-w)/2,y:y-h,width:w,height:h});y-=h+45}
 const title='Certificate of Analysis';page.drawText(title,{x:(612-bold.widthOfTextAtSize(title,17))/2,y,size:17,font:bold});y-=58;
 const product=spec.product_name+(spec.product_code?'     '+spec.product_code:'');
 for(const line of wrap(product,bold,14,530)){page.drawText(line,{x:35,y,size:14,font:bold});y-=19}y-=20;
 const field=(name,value)=>{page.drawText(name,{x:35,y,size:14,font:bold});for(const line of wrap(value,bold,14,370)){page.drawText(line,{x:182,y,size:14,font:bold});y-=18}y-=22};
 field('Lot Number',values.lot);
 field('Qty.',values.quantity+' - '+values.container);
 page.drawText('Product Specifications met:',{x:35,y,size:12,font});page.drawText('YES',{x:266,y,size:12,font});y-=43;
 const statement=spec.standard_statement||'The specifications noted below are the parameters used to confirm product is within formulation standards. All product batches are tested to confirm product specifications are met and batch numbers recorded.';
 for(const line of wrap(statement,font,11,540)){page.drawText(line,{x:35,y,size:11,font});y-=15}y-=28;
 page.drawText('Physical Product Specifications:',{x:35,y,size:12,font:italic});y-=28;
 for(const row of spec.specification_rows){const label=ascii(row.parameter),value=ascii(row.value);if(y<65)throw Error('Too many specification rows for one page.');page.drawText(label,{x:35,y,size:11,font});for(const line of wrap(value,font,11,370)){page.drawText(line,{x:202,y,size:11,font});y-=15}}
 return await pdf.save();
}
