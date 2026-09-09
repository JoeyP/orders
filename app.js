import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id); let user=null,orders=[];
const page=document.body.dataset.page;
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function splitItems(t){return String(t||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean)}
function fmtDate(s){if(!s)return'';const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}
function localDateString(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function statusClass(o){if(o.shipped)return'gray';if(o.back_ordered)return'charcoal';if(!o.requested_delivery_date)return'';const t=localDateString(new Date()),tm=(()=>{const d=new Date();d.setDate(d.getDate()+1);return localDateString(d)})();if(o.requested_delivery_date<t&&!o.ready_to_ship)return'red';if(o.requested_delivery_date===t&&!o.ready_to_ship)return'red';if(o.requested_delivery_date===t&&o.ready_to_ship)return'yellow';if(o.requested_delivery_date===tm&&!o.ready_to_ship)return'orange';if(o.ready_to_ship)return'green';return''}
function poLabel(o){if(o.po_number)return`PO ${esc(o.po_number)}`;if(o.po_status==='to_follow')return'PO TO FOLLOW';if(o.po_status==='no_po_required')return'NO PO REQUIRED';return'PO NOT SET'}
function parseOrderLine(raw){const text=String(raw||'').trim();let m=text.match(/^\s*(\d+(?:\.\d+)?)\s*(?:[-xX×]\s*)?(\d+(?:\.\d+)?)\s*(g|gal|gallon|gallons|lb|lbs|pound|pounds|oz|ounce|ounces|kg|l|liter|liters|litre|litres)\b\s*(.*)$/i);if(m){let u=m[3].toLowerCase();if(['g','gal','gallon','gallons'].includes(u))u='gal';else if(['lb','lbs','pound','pounds'].includes(u))u='lb';else if(['oz','ounce','ounces'].includes(u))u='oz';else if(u==='kg')u='kg';else u='L';return{qty:m[1],container:`${m[2]} ${u}`,item:(m[4]||'').trim()}}m=text.match(/^\s*(\d+(?:\.\d+)?)\s*(?:[-xX×]\s*)?(drum|drums|tote|totes|pail|pails|case|cases|bag|bags)\b\s*(.*)$/i);if(m){const c=m[2].replace(/s$/i,'');return{qty:m[1],container:c[0].toUpperCase()+c.slice(1).toLowerCase(),item:(m[3]||'').trim()}}m=text.match(/^\s*(\d+(?:\.\d+)?)\s*(?:[-xX×]\s*)?(.*)$/);if(m&&m[2].trim())return{qty:m[1],container:'',item:m[2].trim()};return{qty:'',container:'',item:text}}
function containerGallons(c){const m=String(c||'').match(/^(\d+(?:\.\d+)?)\s+gal$/i);return m?Number(m[1]):null}
async function showSession(s){user=s?.user||null;document.querySelectorAll('[data-auth=login]').forEach(x=>x.classList.toggle('hidden',!!user));document.querySelectorAll('[data-auth=app]').forEach(x=>x.classList.toggle('hidden',!user));if(user){document.querySelectorAll('.user-email').forEach(x=>x.textContent=user.email||'');await initPage()}}
async function signIn(e){e.preventDefault();const email=e.currentTarget.querySelector('[name=email]').value.trim(),password=e.currentTarget.querySelector('[name=password]').value;const{error}=await supabase.auth.signInWithPassword({email,password});const er=e.currentTarget.querySelector('.error');if(er)er.textContent=error?error.message:''}
async function loadOrders(){const{data,error}=await supabase.from('orders').select('*,order_items(*)').order('shipped',{ascending:true}).order('requested_delivery_date',{ascending:true,nullsFirst:false}).order('created_at',{ascending:true});if(error){if($('refreshText'))$('refreshText').textContent=error.message;return}orders=(data||[]).map(o=>({...o,order_items:(o.order_items||[]).sort((a,b)=>(a.position||0)-(b.position||0))}));if($('refreshText'))$('refreshText').textContent='Updated '+new Date().toLocaleTimeString()+' • Auto-refreshes every 60 seconds.'}
function setupPo(prefix=''){const po=$(prefix+'po'),f=$(prefix+'poFollow'),n=$(prefix+'noPo');if(!po||!f||!n)return;f.onchange=()=>{if(f.checked){n.checked=false;po.value=''}};n.onchange=()=>{if(n.checked){f.checked=false;po.value=''}};po.oninput=()=>{if(po.value.trim()){f.checked=false;n.checked=false}}}
function getPo(prefix=''){const po=$(prefix+'po').value.trim()||null;return po?{po_number:po,po_status:'provided'}:$(prefix+'poFollow').checked?{po_number:null,po_status:'to_follow'}:$(prefix+'noPo').checked?{po_number:null,po_status:'no_po_required'}:null}
function filtered(){
  const f=$('filter')?.value||'active',
        q=($('search')?.value||'').trim().toLowerCase(),
        dateFrom=$('dateFrom')?.value||'',
        dateTo=$('dateTo')?.value||'';

  return orders.filter(o=>{
    const hay=[
      o.customer_name,
      o.po_number,
      o.po_status,
      o.order_text,
      o.requested_delivery_date,
      o.scheduled_pickup_date,
      (o.order_items||[]).map(i=>i.item_text+' '+(i.lot_numbers||'')).join(' ')
    ].join(' ').toLowerCase();

    if(q&&!hay.includes(q)) return false;

    if(page==='desktop'){
      const d=o.requested_delivery_date||'';
      if(dateFrom && (!d || d<dateFrom)) return false;
      if(dateTo && (!d || d>dateTo)) return false;
    }

    return f==='all'
      ||(f==='active'&&!o.shipped)
      ||(f==='open'&&!o.ready_to_ship&&!o.shipped)
      ||(f==='back'&&o.back_ordered&&!o.shipped)
      ||(f==='ready'&&o.ready_to_ship&&!o.shipped)
      ||(f==='scheduled'&&o.scheduled&&!o.shipped)
      ||(f==='po_follow'&&o.po_status==='to_follow'&&!o.shipped)
      ||(f==='shipped'&&o.shipped);
  });
}
function closeEditModal(){document.getElementById('editModal')?.classList.add('hidden')}
function renderEditLots(o){
  const box=$('editLots'); if(!box)return;
  box.innerHTML='<label>Lot Number(s)</label><div class="edit-lots">'+(o.order_items||[]).map((i,idx)=>`<div class="edit-lot-row"><div><strong>${esc(i.item_text)}</strong></div><input data-edit-lot-index="${idx}" value="${esc(i.lot_numbers||'')}" placeholder="Lot number(s)"></div>`).join('')+'</div>';
}
function openEditOrder(id){
  ensureEditModal(); const o=orders.find(x=>String(x.id)===String(id)); if(!o)return;
  $('editId').value=o.id; $('editCustomer').value=o.customer_name||''; $('editPo').value=o.po_number||'';
  $('editPoFollow').checked=o.po_status==='to_follow'; $('editNoPo').checked=o.po_status==='no_po_required';
  $('editDate').value=o.requested_delivery_date||''; $('editOrderText').value=(o.order_items||[]).map(i=>i.item_text).join('\n')||o.order_text||'';
  $('editBack').checked=!!o.back_ordered; $('editReady').checked=!!o.ready_to_ship; $('editScheduled').checked=!!o.scheduled; $('editShipped').checked=!!o.shipped; $('editPickup').value=o.scheduled_pickup_date||'';
  renderEditLots(o); $('editError').textContent=''; $('editModal').classList.remove('hidden');
}
function preserveLots(oldItems,newLines){
  const used=new Set(), result=[];
  newLines.forEach((line,pos)=>{
    let idx=oldItems.findIndex((i,j)=>!used.has(j)&&String(i.item_text||'').trim()===line.trim());
    if(idx<0 && oldItems[pos] && !used.has(pos)) idx=pos;
    if(idx>=0){used.add(idx);result.push(oldItems[idx].lot_numbers||null)} else result.push(null);
  });
  return result;
}
async function saveEditOrder(e){
  e.preventDefault(); const id=$('editId').value, o=orders.find(x=>String(x.id)===String(id)); if(!o)return;
  const po=getPo('edit'); if(!po){$('editError').textContent='Enter a PO number, select PO to Follow, or select No PO Required.';return}
  const lines=splitItems($('editOrderText').value); if(!lines.length){$('editError').textContent='Enter at least one order item.';return}
  // Capture any lot edits currently displayed before rebuilding item rows.
  const oldItems=(o.order_items||[]).map((i,idx)=>({...i,lot_numbers:document.querySelector(`[data-edit-lot-index="${idx}"]`)?.value.trim()||i.lot_numbers||null}));
  const lots=preserveLots(oldItems,lines);
  if($('editReady').checked){const missing=lots.filter(x=>!String(x||'').trim()).length;if(missing&&!confirm(`${missing} order item(s) are missing lot numbers. Mark this order Ready anyway?`))return}
  const patch={customer_name:$('editCustomer').value.trim(),...po,requested_delivery_date:$('editDate').value||null,order_text:lines.join('\n'),back_ordered:$('editBack').checked,ready_to_ship:$('editReady').checked,scheduled:$('editScheduled').checked,scheduled_pickup_date:$('editScheduled').checked?($('editPickup').value||null):null,shipped:$('editShipped').checked,updated_by:user.id,updated_by_email:user.email||null};
  const save=$('saveEdit'); save.disabled=true; $('editError').textContent='';
  const{error}=await supabase.from('orders').update(patch).eq('id',id); if(error){$('editError').textContent=error.message;save.disabled=false;return}
  const{error:de}=await supabase.from('order_items').delete().eq('order_id',id); if(de){$('editError').textContent=de.message;save.disabled=false;return}
  const rows=lines.map((item_text,position)=>({order_id:Number(id),item_text,position,lot_numbers:lots[position]||null,updated_by:user.id,updated_by_email:user.email||null}));
  const{error:ie}=await supabase.from('order_items').insert(rows); if(ie){$('editError').textContent=ie.message;save.disabled=false;return}
  save.disabled=false; closeEditModal(); if(page==='mobile')await mobileLoad(); else await trackerLoad();
}
async function deleteOrder(id){
  const o=orders.find(x=>String(x.id)===String(id)); if(!o)return;
  if(!confirm(`Delete the order for ${o.customer_name}?\n\nThis permanently deletes the order and its line items.`))return;
  const{error}=await supabase.from('orders').delete().eq('id',id); if(error){alert(error.message);return} await trackerLoad();
}
function wireOrderActions(){
  document.querySelectorAll('[data-edit-order]').forEach(b=>b.onclick=()=>openEditOrder(b.dataset.editOrder));
}
async function mobileLoad(){await loadOrders();const directId=new URLSearchParams(location.search).get('order');let mobileOrders=filtered();if(directId){const direct=orders.find(o=>String(o.id)===String(directId));if(direct)mobileOrders=[direct]}if(directId){const note=document.getElementById('directOrderNote');if(note)note.classList.remove('hidden')}else{const note=document.getElementById('directOrderNote');if(note)note.classList.add('hidden')}$('cards').innerHTML=mobileOrders.map(o=>`<div class="order-card ${statusClass(o)}"><div class="card-top"><div><div class="customer">${esc(o.customer_name)}</div><div class="small">${poLabel(o)}</div></div><div><strong>${o.requested_delivery_date?fmtDate(o.requested_delivery_date):'No requested date'}</strong></div></div><ul>${(o.order_items||[]).map(i=>`<li>${esc(i.item_text)}</li>`).join('')}</ul><span class="pill">Back Ordered: ${o.back_ordered?'Yes':'No'}</span><span class="pill">Ready: ${o.ready_to_ship?'Yes':'No'}</span><span class="pill">Scheduled: ${o.scheduled?'Yes':'No'}</span>${o.scheduled_pickup_date?`<span class="pill">Pickup: ${fmtDate(o.scheduled_pickup_date)}</span>`:''}<span class="pill">Shipped: ${o.shipped?'Yes':'No'}</span><div class="card-actions"><button type="button" data-edit-order="${o.id}">Edit Order</button></div></div>`).join('');wireOrderActions()}
async function initPage(){if(page==='home')return;if(page==='new'){setupPo();$('form').onsubmit=newOrderSubmit;return}if(page==='tracker'){await trackerLoad();$('body').addEventListener('change',changeTracker);$('search').oninput=trackerLoad;$('filter').onchange=trackerLoad;$('refreshBtn').onclick=trackerLoad;return}if(page==='blending'){await forecastLoad();$('refreshBtn').onclick=forecastLoad;return}if(page==='mobile'){await mobileLoad();$('filter').onchange=mobileLoad;$('refreshBtn').onclick=mobileLoad;return}if(page==='desktop'){
  await trackerLoad();
  $('body').addEventListener('change',changeTracker);
  $('search').oninput=trackerLoad;
  $('filter').onchange=trackerLoad;
  $('dateFrom').onchange=trackerLoad;
  $('dateTo').onchange=trackerLoad;
  $('refreshBtn').onclick=trackerLoad;
  $('exportCsv').onclick=exportDesktopCsv;
  $('clearFilters').onclick=async()=>{
    $('search').value='';
    $('filter').value='active';
    $('dateFrom').value='';
    $('dateTo').value='';
    await trackerLoad();
  };
  return
}}
document.querySelectorAll('.login-form').forEach(f=>f.addEventListener('submit',signIn));document.querySelectorAll('.logout').forEach(a=>a.addEventListener('click',async e=>{e.preventDefault();await supabase.auth.signOut()}));const{data:{session}}=await supabase.auth.getSession();await showSession(session);supabase.auth.onAuthStateChange(async(_e,s)=>await showSession(s));setInterval(async()=>{if(!user)return;if(page==='tracker'||page==='desktop')await trackerLoad();if(page==='blending')await forecastLoad();if(page==='mobile')await mobileLoad()},60000);


