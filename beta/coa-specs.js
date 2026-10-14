import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './config.js';
const sb=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
let user,templates=[],specs=[],working=false;
function clean(s){return String(s||'').replace(/\s+/g,' ').trim()}
function escape(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]))}
async function zip(){if(window.JSZip)return window.JSZip;await new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';s.onload=ok;s.onerror=no;document.head.append(s)});return window.JSZip}
function readParagraphs(xml){
 const doc=new DOMParser().parseFromString(xml,'application/xml');
 return [...doc.getElementsByTagName('w:p')].map(p=>clean([...p.getElementsByTagName('w:t')].map(n=>n.textContent||'').join(''))).filter(Boolean);
}
function extract(lines,t){
 const joined=lines.join('\n'),title=lines.findIndex(s=>/certificate\s*of\s*analysis/i.test(s));
 const lot=lines.findIndex(s=>/lot\s*number/i.test(s)),qty=lines.findIndex(s=>/^qty\b/i.test(s)),spec=lines.findIndex(s=>/physical\s*product\s*specifications/i.test(s));
 const product=(title>=0&&lot>title?lines.slice(title+1,lot).find(s=>s.length>3):null)||t.product_name.replace(/^[-\s]+/,'');
 const rows=[];
 if(spec>=0)for(const line of lines.slice(spec+1)){
  const m=line.match(/^(.{2,70}?:)\s*(.+)$/);if(m)rows.push({parameter:clean(m[1]),value:clean(m[2]).replace(/(\d)\s+\.\s*(\d)/g,'$1.$2')});
 }
 const statement=qty>=0&&spec>qty?lines.slice(qty+1,spec).filter(x=>!/product specifications met/i.test(x)).join(' '):'';
 const note=[title<0?'Title not detected':'',lot<0?'Lot label not detected':'',spec<0?'Specification heading not detected':'',rows.length<2?'Insufficient specification rows':''].filter(Boolean).join('; ');
 return{template_id:t.id,product_name:product,product_code:(t.original_filename.match(/\b(?:H-)?BL[A-Z0-9-]+\b/i)||t.original_filename.match(/\bL-\d+[A-Z]?\b/i)||[])[0]||null,specification_rows:rows,standard_statement:statement,extraction_status:note?'failed':'needs_review',extraction_note:note||null,extracted_at:new Date().toISOString()};
}
async function refresh(){
 const [t,s]=await Promise.all([sb.from('coa_templates').select('*').order('original_filename').limit(2000),sb.from('coa_template_specs').select('*').limit(2000)]);
 if(t.error||s.error)throw Error(t.error?.message||s.error?.message);
 templates=t.data||[];specs=s.data||[];render();
}
function render(){
 const q=$('query').value.toLowerCase();
 const shown=templates.filter(t=>(t.original_filename+' '+t.product_name).toLowerCase().includes(q));
 const counts={approved:specs.filter(s=>s.extraction_status==='approved').length,needs_review:specs.filter(s=>s.extraction_status==='needs_review').length,failed:specs.filter(s=>s.extraction_status==='failed').length};
 $('counts').textContent=templates.length+' originals • '+counts.approved+' approved • '+counts.needs_review+' awaiting review • '+counts.failed+' extraction failures • '+(templates.length-specs.length)+' not extracted';
 $('items').innerHTML=shown.slice(0,150).map(t=>{const s=specs.find(x=>x.template_id===t.id);return '<div class="master-row"><b>'+escape(t.original_filename)+'</b><span>'+(s?escape(s.extraction_status):'Not extracted')+'</span><button data-edit="'+t.id+'">Review / Edit</button></div>'}).join('');
 document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>edit(Number(b.dataset.edit)));
}
async function importAll(){
 if(working)return;working=true;$('import').disabled=true;let ok=0,failed=0,skipped=0;
 try{
  for(const t of templates){
   if(specs.some(s=>s.template_id===t.id)){skipped++;continue}
   if(t.file_extension!=='.docx'){failed++;continue}
   $('progress').textContent='Extracting '+t.original_filename+' ('+(ok+failed+skipped)+'/'+templates.length+')';
   try{
    const {data,error}=await sb.storage.from('coa-originals').download(t.storage_path);if(error)throw error;
    const z=await(await zip()).loadAsync(data),doc=z.file('word/document.xml');if(!doc)throw Error('Missing document.xml');
    const record=extract(readParagraphs(await doc.async('string')),t);
    const {data:s,error:e}=await sb.from('coa_template_specs').insert(record).select().single();if(e)throw e;specs.push(s);ok++;
   }catch(e){failed++;console.error(t.original_filename,e)}
  }
  $('progress').textContent='Extraction finished: '+ok+' added, '+skipped+' previously extracted, '+failed+' skipped or failed. All new records require review.';
  render();
 }finally{working=false;$('import').disabled=false}
}
function edit(id){
 const t=templates.find(x=>x.id===id),s=specs.find(x=>x.template_id===id);
 if(!t)return;$('editor').hidden=false;$('selected').textContent=t.original_filename;$('templateId').value=id;
 $('name').value=s?.product_name||t.product_name;$('code').value=s?.product_code||'';
 $('statement').value=s?.standard_statement||'';
 $('rows').value=(s?.specification_rows||[]).map(r=>r.parameter+' | '+r.value).join('\n');
 $('note').textContent=s?.extraction_note||'Verify every value against the original certificate before approval.';
 $('original').onclick=async()=>{const {data,error}=await sb.storage.from('coa-originals').createSignedUrl(t.storage_path,90,{download:t.original_filename});if(error)alert(error.message);else window.open(data.signedUrl,'_blank')};
}
async function save(approve){
 const id=Number($('templateId').value);if(!id)return;
 const rows=$('rows').value.split('\n').filter(Boolean).map(l=>{const i=l.indexOf('|');if(i<0)throw Error('Every specification line must contain a | separator.');return{parameter:clean(l.slice(0,i)),value:clean(l.slice(i+1))}});
 if(!rows.length)throw Error('At least one specification is required.');
 const record={template_id:id,product_name:clean($('name').value),product_code:clean($('code').value)||null,standard_statement:clean($('statement').value),specification_rows:rows,extraction_status:approve?'approved':'needs_review',extraction_note:null,approved_at:approve?new Date().toISOString():null,approved_by:approve?user.id:null};
 const {error}=await sb.from('coa_template_specs').upsert(record,{onConflict:'template_id'});if(error)throw error;
 $('progress').textContent=approve?'Approved specifications for PDF generation.':'Draft specifications saved.';await refresh();
}
async function boot(){
 const {data:{session}}=await sb.auth.getSession();user=session?.user;if(!user)return location.href='index.html';
 const {data:a}=await sb.from('user_page_access').select('admin_orders').eq('user_id',user.id).maybeSingle();if(!a?.admin_orders){$('progress').textContent='Admin access required.';return}
 $('query').oninput=render;$('import').onclick=importAll;$('save').onclick=()=>save(false).catch(e=>alert(e.message));$('approve').onclick=()=>save(true).catch(e=>alert(e.message));
 try{await refresh()}catch(e){$('progress').textContent=e.message}
}
boot();
