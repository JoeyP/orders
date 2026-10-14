import {structuredPdf} from './coa-structured-pdf.js?v=1';
import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './config.js';
const sb=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
let user,orders=[],templates=[],specs=[],selection=null;
function parse(s){const m=String(s||'').trim().match(/^(\d+(?:\.\d+)?)\s*(?:[-xX×]\s*|\(\s*)?(\d+(?:\.\d+)?)\s*(?:gallons?|gal|g)?\s*\)?\s*(.*)$/i);return m?{quantity:m[1],container:m[2],product:m[3].trim()}:{quantity:'1',container:'',product:String(s||'')}}
function normalize(s){return String(s||'').toLowerCase().replace(/\.(docx|doc)$/,'').replace(/[^a-z0-9]+/g,' ').trim()}
// Match product families and abbreviated codes without assuming a unique certificate.
function codes(s){
 const raw=String(s||'').toUpperCase().replace(/\.(DOCX|DOC)$/,'');
 const found=[...raw.matchAll(/(?:^|[^A-Z0-9])(?:H[\s-]*)?(?:BL[\s-]*)?([0-9][A-Z0-9]{1,9})(?=$|[^A-Z0-9])/g)];
 return [...new Set(found.map(x=>x[1]).filter(x=>/[A-Z]/.test(x)&&!/^\d+(G|GAL|LB|LBS|ML|L)$/.test(x)))];
}
function tokens(s){return normalize(s).split(' ').filter(w=>w.length>1&&!['certificate','of','analysis','series','gallon','gallons','drum','tote','pail','product'].includes(w))}
function matchScore(orderText,t){
 const parsed=parse(orderText);
 const orderCodes=codes(parsed.product),templateCodes=codes(t.original_filename+' '+t.product_name);
 const exactCode=orderCodes.some(c=>templateCodes.includes(c));
 const orderName=normalize(parsed.product);
 const templateName=normalize(t.product_name+' '+t.original_filename);
 const orderProductWords=tokens(parsed.product).filter(w=>!/^(\d+|g|gal|gallon|gallons)$/.test(w));
 const templateWords=tokens(t.product_name+' '+t.original_filename);
 const productMatches=orderProductWords.filter(w=>templateWords.includes(w));
 const specificProductMatch=orderProductWords.some(w=>/[a-z]/.test(w)&&w.length>=3&&templateWords.includes(w));
 const sizeFromOrder=String(orderText).match(/(?:^|[\s(])(?:\d+\s*[-x]?\s*)?(55|275|300)\s*(?:g|gal|gallon|gallons)\b/i);
 const orderSize=sizeFromOrder?.[1]||'';
 const templateSize=String(t.original_filename).match(/(?:^|[\s-])(55|275|300)(?=\.[^.]+$|[\s-])/i)?.[1]||'';
 const sizeMatch=!!orderSize&&orderSize===templateSize;
 const sizeConflict=!!orderSize&&!!templateSize&&orderSize!==templateSize;
 // Container size alone must NEVER qualify an unrelated product as a suggestion.
 if(!exactCode&&!specificProductMatch)return 0;
 return (exactCode?1000:0)+(specificProductMatch?500:0)+productMatches.length*40+(sizeMatch?200:0)-(sizeConflict?500:0);
}
async function init(){
 const {data:{session}}=await sb.auth.getSession();user=session?.user;if(!user){location.href='index.html';return}
 const {data:access}=await sb.from('user_page_access').select('admin_orders').eq('user_id',user.id).maybeSingle();
 if(!access?.admin_orders){$('status').textContent='Admin Orders access required.';return}
 const [o,t,sp]=await Promise.all([sb.from('orders').select('id,customer_name,po_number,requested_delivery_date,order_items(id,item_text,lot_numbers)').order('id',{ascending:false}).limit(1000),sb.from('coa_templates').select('*').eq('active',true).order('original_filename').limit(2000),sb.from('coa_template_specs').select('*').limit(2000)]);
 if(o.error||t.error||sp.error){$('status').textContent=o.error?.message||t.error?.message||sp.error?.message;return}
 orders=o.data||[];templates=t.data||[];specs=sp.data||[];
 $('order').innerHTML='<option value="">Select order…</option>'+orders.map(x=>'<option value="'+x.id+'">#'+x.id+' '+esc(x.customer_name)+' — '+esc(x.po_number||'No PO')+'</option>').join('');
 $('order').onchange=renderItems;$('item').onchange=renderTemplates;$('template').onchange=loadSelection;$('save').onclick=save;$('original').onclick=downloadOriginal;
 $('download').onclick=()=>pdfAction('download');$('print').onclick=()=>pdfAction('print');$('email').onclick=()=>pdfAction('email');$('search').oninput=renderTemplates;
 $('status').textContent=templates.length+' original COA templates available.';
}
function current(){const o=orders.find(x=>String(x.id)===$('order').value),i=o?.order_items?.find(x=>String(x.id)===$('item').value),t=templates.find(x=>String(x.id)===$('template').value);return{o,i,t}}
function renderItems(){const o=current().o;$('item').innerHTML='<option value="">Select product…</option>'+(o?.order_items||[]).map(i=>'<option value="'+i.id+'">'+esc(i.item_text)+'</option>').join('');$('template').innerHTML='';$('fields').hidden=true;if(o?.order_items?.length===1){$('item').value=String(o.order_items[0].id);renderTemplates()}}
function renderTemplates(){
 const {i}=current();if(!i)return;
 const query=normalize($('search').value);
 const ranked=templates.map(t=>({t,score:matchScore(i.item_text,t)})).filter(x=>!query||normalize(x.t.original_filename+' '+x.t.product_name+' '+codes(x.t.original_filename).join(' ')).includes(query)).sort((a,b)=>b.score-a.score||a.t.original_filename.localeCompare(b.t.original_filename));
 const suggested=ranked.filter(x=>x.score>=500);$('suggestions').innerHTML=suggested.length?'<strong>Suggested certificates ('+suggested.length+')</strong><div class="small">Highest matching product codes and names first. Click to select:</div>'+suggested.slice(0,8).map(x=>'<button type="button" class="coa-suggestion" data-coa-id="'+x.t.id+'">'+esc(x.t.original_filename)+'</button>').join(' '):'<span class="small">No confident match found. Search all certificates below.</span>';
 $('suggestions').querySelectorAll('[data-coa-id]').forEach(btn=>btn.onclick=()=>{$('template').value=btn.dataset.coaId;loadSelection()});
 $('template').innerHTML='<option value="">Choose original COA…</option>'+ranked.map(({t,score})=>'<option value="'+t.id+'">'+(score>=1000?'Code match • ':score>=500?'Product match • ':score>0?'Possible match • ':'')+esc(t.original_filename)+' ['+esc(t.brand)+']</option>').join('');
 $('fields').hidden=true;$('status').textContent=suggested.length+' suggestions; '+ranked.length+' total matching search. Verify the correct version before generating.';
}
async function loadSelection(){
 const {i,t}=current();$('fields').hidden=!t;if(!t||!i)return;
 const parsed=parse(i.item_text);$('date').value=new Date().toLocaleDateString('en-CA');$('lot').value=i.lot_numbers||'';$('quantity').value=parsed.quantity;$('container').value=parsed.container;
 const {data,error}=await sb.from('coa_order_selections').select('*').eq('order_item_id',i.id).maybeSingle();
 if(!error&&data&&String(data.template_id)===String(t.id)){selection=data;$('date').value=data.coa_date||$('date').value;$('lot').value=data.lot_numbers??$('lot').value;$('quantity').value=data.quantity??$('quantity').value;$('container').value=data.container_size??$('container').value}
 else selection=null;
 $('chosen').textContent='Original: '+t.original_filename+' ('+t.brand+'). Download the original to check the correct version.';
 const spec=specs.find(x=>x.template_id===t.id);$('status').textContent=spec?.extraction_status==='approved'?'Approved specifications available for standardized PDF.':'Specifications not yet approved. Use COA Specifications in Masters to review and approve this certificate.';
}
async function save(){
 const {i,t}=current();if(!i||!t)return alert('Choose an order, product and template.');
 const values={order_item_id:i.id,template_id:t.id,coa_date:$('date').value||null,lot_numbers:$('lot').value,quantity:$('quantity').value,container_size:$('container').value,updated_by:user.id,updated_at:new Date().toISOString()};
 const {error}=await sb.from('coa_order_selections').upsert(values,{onConflict:'order_item_id'});$('status').textContent=error?'Could not save: '+error.message:'Selection and four values saved for this order product.';
}
async function originalBlob(){const {t}=current();if(!t)throw Error('Choose a template.');const {data,error}=await sb.storage.from('coa-originals').download(t.storage_path);if(error)throw error;return data}
function offer(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),30000)}
async function downloadOriginal(){try{const {t}=current();offer(await originalBlob(),t.original_filename)}catch(e){$('status').textContent=e.message}}
async function getZip(){if(window.JSZip)return window.JSZip;await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';s.onload=res;s.onerror=rej;document.head.append(s)});return window.JSZip}
let pdfUrl=null;
async function pdfAction(action){
 const {o,i,t}=current();if(!o||!i||!t)return alert('Select an order, product and certificate.');
 const spec=specs.find(x=>x.template_id===t.id);if(spec?.extraction_status!=='approved')return $('status').textContent='This COA has not been approved in COA Specifications yet. Open the COA Specifications page to review it.';
 if(t.file_extension!=='.docx')return $('status').textContent='Legacy .doc letterhead is not yet supported for PDF output.';
 if(!$('lot').value.trim()||!$('quantity').value.trim()||!$('container').value.trim())return alert('Lot number, quantity and container size are required.');
 $('status').textContent='Generating PDF from original certificate...';
 try{
  const original=await originalBlob();const z=await (await getZip()).loadAsync(original);
  const header=z.file('word/media/image1.png');
  if(!header)throw Error('Original letterhead image is not available as PNG.');
  const n=Number($('container').value.trim()),unit=(n===55?'Gallon Drum':n===275||n===300?'Gallon Tote':'Gallon Container');
  const bytes=await structuredPdf(spec,{lot:$('lot').value.trim(),quantity:$('quantity').value.trim(),container:$('container').value.trim()+' '+unit},await header.async('uint8array'));
  const data={product:spec.product_name};
  const blob=new Blob([bytes],{type:'application/pdf'});
  if(pdfUrl)URL.revokeObjectURL(pdfUrl);pdfUrl=URL.createObjectURL(blob);
  const filename='COA - '+data.product.replace(/[^a-z0-9 -]/gi,'').slice(0,65)+' - '+$('lot').value.trim().replace(/[^a-z0-9-]/gi,'')+'.pdf';
  const frame=$('pdfPreview');frame.src=pdfUrl;$('pdfArea').hidden=false;
  if(action==='download'||action==='email')offer(blob,filename);
  if(action==='print'){const w=window.open(pdfUrl,'_blank');if(!w)$('status').textContent='PDF preview ready. Allow pop-ups or print from the preview.';}
  if(action==='email'){
   const subject='Certificate of Analysis - '+data.product+' - Lot '+$('lot').value.trim();
   const body='Please find the attached Certificate of Analysis.\n\n(Attach the downloaded PDF before sending.)';
   location.href='mailto:?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
  }
  $('status').textContent='PDF generated. Check the preview against the original certificate before sending or printing.'+(action==='email'?' Attach the downloaded PDF in Outlook.':'');
 }catch(e){$('status').textContent='PDF not generated: '+e.message;console.error(e)}
}
init();