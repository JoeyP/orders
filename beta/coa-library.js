import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './config.js';
const sb=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
let user,templates=[],importing=false;
async function boot(){
 const {data:{session}}=await sb.auth.getSession();user=session?.user;
 if(!user){location.href='index.html';return}
 const {data:access}=await sb.from('user_page_access').select('admin_orders').eq('user_id',user.id).maybeSingle();
 if(!access?.admin_orders){$('progress').textContent='Admin Orders access is required.';$('importBtn').disabled=true;return}
 $('importBtn').onclick=importFiles;$('query').oninput=render;await refresh();
}
async function refresh(){
 const {data,error}=await sb.from('coa_templates').select('*').order('original_filename').limit(2000);
 if(error){$('progress').textContent=error.message;return}
 templates=data||[];render();
}
function render(){
 const q=$('query').value.trim().toLowerCase(),rows=templates.filter(t=>(t.product_name+' '+t.original_filename+' '+t.brand).toLowerCase().includes(q));
 $('count').textContent=rows.length+' matching templates • '+templates.length+' total';
 $('results').innerHTML=rows.slice(0,150).map(t=>'<div class="master-row"><b>'+esc(t.product_name)+'</b><span>'+esc(t.original_filename)+' • '+esc(t.brand)+'</span> <button data-open="'+t.id+'">Download original</button></div>').join('')||'<p>No templates match.</p>';
 document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>download(templates.find(t=>String(t.id)===b.dataset.open)));
}
async function download(t){
 const {data,error}=await sb.storage.from('coa-originals').createSignedUrl(t.storage_path,90,{download:t.original_filename});
 if(error)return alert(error.message);window.open(data.signedUrl,'_blank','noopener');
}
async function jszip(){
 if(window.JSZip)return window.JSZip;
 await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';s.onload=resolve;s.onerror=reject;document.head.appendChild(s)});
 return window.JSZip;
}
function productName(name){return name.replace(/^.*\//,'').replace(/\.(docx|doc)$/i,'').replace(/^certificate\s+of\s+analysis\s*[-–—:]?\s*/i,'').trim()||name}
async function pathFor(archive,name){const bytes=new TextEncoder().encode(archive+'|'+name);const digest=await crypto.subtle.digest('SHA-256',bytes);const hash=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');return archive.replace(/[^a-z0-9._-]/gi,'_')+'/'+hash+name.match(/\.(docx|doc)$/i)[0].toLowerCase()}
async function importFiles(){
 if(importing)return;const files=[...$('archives').files];if(!files.length)return alert('Choose one or both ZIP archives.');
 importing=true;$('importBtn').disabled=true;let done=0,skipped=0,failed=0,failures=[];
 try{
  for(const archive of files){
   let entries=[];
   if(/\.zip$/i.test(archive.name)){
    const zip=await (await jszip()).loadAsync(archive);
    entries=Object.values(zip.files).filter(e=>!e.dir&&!e.name.startsWith('__MACOSX/')&&!e.name.split('/').pop().startsWith('._')&&/\.(docx|doc)$/i.test(e.name));
   }else if(/\.(docx|doc)$/i.test(archive.name))entries=[{name:archive.name,async:async()=>archive}];
   for(const entry of entries){
    const path=await pathFor(archive.name,entry.name);
    if(templates.some(t=>t.storage_path===path)){skipped++;continue}
    $('progress').textContent='Importing '+entry.name+' — '+done+' imported, '+skipped+' already present, '+failed+' errors';
    try{
     const blob=await entry.async('blob');
     const {error:uploadError}=await sb.storage.from('coa-originals').upload(path,blob,{upsert:false,contentType:/\.docx$/i.test(entry.name)?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'application/msword'});
     if(uploadError&&!/already exists|duplicate/i.test(uploadError.message))throw uploadError;
     const record={product_name:productName(entry.name),brand:/hawksley/i.test(archive.name)?'Hawksley Laboratories':'B&L Neeley',original_filename:entry.name.split('/').pop(),storage_path:path,file_extension:entry.name.match(/\.(docx|doc)$/i)[0].toLowerCase(),file_size_bytes:blob.size,created_by:user.id};
     const {data,error}=await sb.from('coa_templates').upsert(record,{onConflict:'storage_path'}).select().single();
     if(error)throw error;templates.push(data);done++;
    }catch(err){failed++;failures.push(entry.name+' — '+(err?.message||String(err)));console.error('COA import error',entry.name,err)}
   }
  }
  $('progress').textContent='Finished: '+done+' imported, '+skipped+' already present, '+failed+' failed. You can select the ZIPs again to retry failures.'+(failures.length?' Failed files: '+failures.join(' | '):'');
  await refresh();
 }catch(err){$('progress').textContent='Import interrupted: '+err.message}
 finally{importing=false;$('importBtn').disabled=false}
}
boot();