import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './config.js';
const sb=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
let user,orders=[],templates=[],selection=null;
function parse(s){const m=String(s||'').trim().match(/^(\d+(?:\.\d+)?)\s*(?:[-xX×]\s*|\(\s*)?(\d+(?:\.\d+)?)\s*(?:gallons?|gal|g)?\s*\)?\s*(.*)$/i);return m?{quantity:m[1],container:m[2],product:m[3].trim()}:{quantity:'1',container:'',product:String(s||'')}}
function normalize(s){return String(s||'').toLowerCase().replace(/\.(docx|doc)$/,'').replace(/[^a-z0-9]+/g,' ').trim()}
// Product identifiers are frequently entered as BL4NA, H-BL4NA, or shorthand 4NA.
function codes(s){
 const raw=String(s||'').toUpperCase().replace(/\.(DOCX|DOC)$/,'');
 const matches=[...raw.matchAll(/(?:^|[^A-Z0-9])(?:H[- ]?)?(?:BL[- ]?)?([0-9][A-Z0-9]{1,7})(?=$|[^A-Z0-9])/g)];
 return [...new Set(matches.map(m=>m[1]).filter(v=>/[A-Z]/.test(v)&&!/^\d+(?:G|GAL|LB|LBS)$/.test(v)))];
}
function matchScore(orderText,t){
 const parsed=parse(orderText),whole=normalize(orderText),product=normalize(parsed.product);
 const name=normalize(t.product_name),file=normalize(t.original_filename);
 const oc=codes(parsed.product),tc=codes(t.original_filename+' '+t.product_name);
 const codeMatch=oc.some(c=>tc.includes(c));
 const productWithoutCode=product.replace(/\b(?:h )?bl ?[0-9][a-z0-9]{1,7}\b|\b[0-9][a-z0-9]*[a-z][a-z0-9]*\b/g,'').trim();
 const titleWithoutCode=name.replace(/\b(?:h )?bl ?[0-9][a-z0-9]{1,7}\b|\b[0-9][a-z0-9]*[a-z][a-z0-9]*\b/g,'').trim();
 const words=productWithoutCode.split(' ').filter(w=>w.length>2&&!['series','gallon','drum','tote'].includes(w));
 const nameMatch=productWithoutCode.length>3&&titleWithoutCode.length>3&&(titleWithoutCode===productWithoutCode||titleWithoutCode.includes(productWithoutCode)||productWithoutCode.includes(titleWithoutCode));
 const wordHits=words.filter(w=>name.split(' ').includes(w)).length;
 // Do not treat shorthand as an automatic selection: rank it and require a human choice.
 return (codeMatch?1000:0)+(nameMatch?500:0)+wordHits*25+(product&&name===product?100:0);
}
async function init(){
 const {data:{session}}=await sb.auth.getSession();user=session?.user;if(!user){location.href='index.html';return}
 const {data:access}=await sb.from('user_page_access').select('admin_orders').eq('user_id',user.id).maybeSingle();
 if(!access?.admin_orders){$('status').textContent='Admin Orders access required.';return}
 const [o,t]=await Promise.all([sb.from('orders').select('id,customer_name,po_number,requested_delivery_date,order_items(id,item_text,lot_numbers)').order('id',{ascending:false}).limit(1000),sb.from('coa_templates').select('*').eq('active',true).order('original_filename').limit(2000)]);
 if(o.error||t.error){$('status').textContent=o.error?.message||t.error?.message;return}
 orders=o.data||[];templates=t.data||[];
 $('order').innerHTML='<option value="">Select order…</option>'+orders.map(x=>'<option value="'+x.id+'">#'+x.id+' '+esc(x.customer_name)+' — '+esc(x.po_number||'No PO')+'</option>').join('');
 $('order').onchange=renderItems;$('item').onchange=renderTemplates;$('template').onchange=loadSelection;$('save').onclick=save;$('original').onclick=downloadOriginal;
 $('download').onclick=generate;$('search').oninput=renderTemplates;
 $('status').textContent=templates.length+' original COA templates available.';
}
function current(){const o=orders.find(x=>String(x.id)===$('order').value),i=o?.order_items?.find(x=>String(x.id)===$('item').value),t=templates.find(x=>String(x.id)===$('template').value);return{o,i,t}}
function renderItems(){const o=current().o;$('item').innerHTML='<option value="">Select product…</option>'+(o?.order_items||[]).map(i=>'<option value="'+i.id+'">'+esc(i.item_text)+'</option>').join('');$('template').innerHTML='';$('fields').hidden=true}
function renderTemplates(){
 const {i}=current();if(!i)return;
 const product=normalize(parse(i.item_text).product),query=normalize($('search').value);
 const ranked=templates.map(t=>({t,score:matchScore(i.item_text,t)})).filter(x=>!query||normalize(x.t.original_filename+' '+x.t.product_name+' '+codes(x.t.original_filename).join(' ')).includes(query)).sort((a,b)=>b.score-a.score||a.t.original_filename.localeCompare(b.t.original_filename));
 $('template').innerHTML='<option value="">Choose original COA…</option>'+ranked.map(({t,score})=>'<option value="'+t.id+'">'+(score>=1000?'Code match • ':score>=500?'Product match • ':score>0?'Possible match • ':'')+esc(t.original_filename)+' ['+esc(t.brand)+']</option>').join('');
 $('fields').hidden=true;$('status').textContent=ranked.length+' possible templates. Verify the correct version before generating.';
}
async function loadSelection(){
 const {i,t}=current();$('fields').hidden=!t;if(!t||!i)return;
 const parsed=parse(i.item_text);$('date').value=new Date().toLocaleDateString('en-CA');$('lot').value=i.lot_numbers||'';$('quantity').value=parsed.quantity;$('container').value=parsed.container;
 const {data,error}=await sb.from('coa_order_selections').select('*').eq('order_item_id',i.id).maybeSingle();
 if(!error&&data&&String(data.template_id)===String(t.id)){selection=data;$('date').value=data.coa_date||$('date').value;$('lot').value=data.lot_numbers??$('lot').value;$('quantity').value=data.quantity??$('quantity').value;$('container').value=data.container_size??$('container').value}
 else selection=null;
 $('chosen').textContent='Original: '+t.original_filename+' ('+t.brand+'). Download the original to check the correct version.';
 $('status').textContent=t.file_extension==='.doc'?'Legacy .doc: original download available; automatic editing requires conversion to .docx.':'DOCX: automatic generation is supported only for templates containing explicit placeholders.';
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
async function generate(){
 const {t}=current();if(!t)return alert('Select a template.');
 if(t.file_extension!=='.docx'){$('status').textContent='This is an older .doc file. Automatic editing is not supported; download the original.';return}
 try{
 const zip=await (await getZip()).loadAsync(await originalBlob());
 const replacements={'{{DATE}}':$('date').value,'{{LOT_NUMBER}}':$('lot').value,'{{QUANTITY}}':$('quantity').value,'{{CONTAINER_SIZE}}':$('container').value};
 let replaced=0;
 for(const name of Object.keys(zip.files).filter(n=>/^word\/(document|header\d+|footer\d+)\.xml$/.test(n))){
  const xml=await zip.file(name).async('string');let out=xml;
  for(const [tag,value] of Object.entries(replacements)){
   const encoded=esc(value);const occurrences=out.split(tag).length-1;if(occurrences){replaced+=occurrences;out=out.split(tag).join(encoded)}
  }
  if(out!==xml)zip.file(name,out);
 }
 if(!replaced){$('status').textContent='This original does not contain editable {{DATE}}, {{LOT_NUMBER}}, {{QUANTITY}}, or {{CONTAINER_SIZE}} placeholders. No altered COA was generated. Original remains available.';return}
 const missing=Object.keys(replacements).filter(tag=>!Object.keys(zip.files).some(()=>false)); // replaced count is not proof all four fields were updated
 if(replaced<4){$('status').textContent='Only '+replaced+' placeholders were found. Generation stopped to prevent an incomplete certificate.';return}
 offer(await zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}),t.original_filename.replace(/\.docx$/i,'')+' - Order '+current().o.id+'.docx');
 $('status').textContent='Generated Word document. Check all four fields and layout before printing.';
 }catch(e){$('status').textContent='Generation failed: '+e.message}
}
init();