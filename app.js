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
function filtered(){const f=$('filter')?.value||'active',q=($('search')?.value||'').toLowerCase();return orders.filter(o=>{const hay=[o.customer_name,o.po_number,o.order_text,(o.order_items||[]).map(i=>i.item_text+' '+(i.lot_numbers||'')).join(' ')].join(' ').toLowerCase();if(q&&!hay.includes(q))return false;return f==='all'||(f==='active'&&!o.shipped)||(f==='open'&&!o.ready_to_ship&&!o.shipped)||(f==='back'&&o.back_ordered&&!o.shipped)||(f==='ready'&&o.ready_to_ship&&!o.shipped)||(f==='scheduled'&&o.scheduled&&!o.shipped)||(f==='po_follow'&&o.po_status==='to_follow'&&!o.shipped)||(f==='shipped'&&o.shipped)})}
function itemRows(o,editable=true){return (o.order_items||[]).map(i=>{const p=parseOrderLine(i.item_text);return `<div class="item-row"><div>${esc(p.qty)}</div><div>${esc(p.container)}</div><div>${esc(p.item)}</div>${editable?`<input class="lot" data-lot="${i.id}" value="${esc(i.lot_numbers||'')}" placeholder="Lot(s)" ${o.shipped?'disabled':''}>`:`<div>${esc(i.lot_numbers||'')}</div>`}</div>`}).join('')}
async function changeTracker(e){const t=e.target;if(t.dataset.lot){await supabase.from('order_items').update({lot_numbers:t.value.trim()||null,updated_by:user.id,updated_by_email:user.email||null}).eq('id',t.dataset.lot);await trackerLoad();return}const id=t.dataset.back||t.dataset.ready||t.dataset.scheduled||t.dataset.pickup||t.dataset.shipped;if(!id)return;const o=orders.find(x=>String(x.id)===String(id));let patch={updated_by:user.id,updated_by_email:user.email||null};if(t.dataset.back)patch.back_ordered=t.checked;if(t.dataset.ready){if(t.checked){const missing=(o.order_items||[]).filter(i=>!String(i.lot_numbers||'').trim()).length;if(missing&&!confirm(`${missing} item(s) are missing lot numbers. Mark Ready anyway?`)){t.checked=false;return}}patch.ready_to_ship=t.checked}if(t.dataset.scheduled){patch.scheduled=t.checked;if(!t.checked)patch.scheduled_pickup_date=null}if(t.dataset.pickup){patch.scheduled_pickup_date=t.value||null;if(t.value)patch.scheduled=true}if(t.dataset.shipped)patch.shipped=t.checked;const{error}=await supabase.from('orders').update(patch).eq('id',id);if(error)alert(error.message);await trackerLoad()}
async function trackerLoad(){await loadOrders();const body=$('body');body.innerHTML='';filtered().forEach(o=>{const tr=document.createElement('tr');tr.className=statusClass(o);tr.innerHTML=`<td>${o.requested_delivery_date?fmtDate(o.requested_delivery_date):'<span class="small">No date</span>'}</td><td><strong>${esc(o.customer_name)}</strong></td><td>${poLabel(o)}</td><td class="items"><div class="item-head"><div>Qty</div><div>Container</div><div>Item</div><div>Lot Number(s)</div></div>${itemRows(o,true)}</td><td class="chk"><input type="checkbox" data-back="${o.id}" ${o.back_ordered?'checked':''} ${o.shipped?'disabled':''}></td><td class="chk"><input type="checkbox" data-ready="${o.id}" ${o.ready_to_ship?'checked':''} ${o.shipped?'disabled':''}></td><td class="chk"><input type="checkbox" data-scheduled="${o.id}" ${o.scheduled?'checked':''} ${o.shipped?'disabled':''}></td><td><input class="pickup" type="date" data-pickup="${o.id}" value="${o.scheduled_pickup_date||''}" ${o.shipped?'disabled':''}></td><td class="chk"><input type="checkbox" data-shipped="${o.id}" ${o.shipped?'checked':''}></td>${page==='desktop'?`<td class="actions"><button type="button" data-edit-order="${o.id}">Edit</button><button type="button" class="danger-btn" data-delete-order="${o.id}">Delete</button></td>`:''}`;body.appendChild(tr)});if(page==='desktop')wireOrderActions()}
async function forecastLoad(){const{data,error}=await supabase.from('orders').select('id,ready_to_ship,scheduled,shipped,back_ordered,order_items(*)').eq('ready_to_ship',false).eq('scheduled',false).eq('shipped',false);if(error){$('refreshText').textContent=error.message;return}const gs=new Map(),os=data||[];let ic=0;os.forEach(o=>(o.order_items||[]).forEach(i=>{ic++;const p=parseOrderLine(i.item_text),name=(p.item||i.item_text).trim(),key=name.toLowerCase().replace(/\s+/g,' '),qty=Number(p.qty)||0,cont=p.container||'Unparsed';if(!gs.has(key))gs.set(key,{name,containers:new Map(),gallons:0});const g=gs.get(key);g.containers.set(cont,(g.containers.get(cont)||0)+qty);const gal=containerGallons(cont);if(gal!==null)g.gallons+=qty*gal}));$('orderCount').textContent=os.length;$('itemCount').textContent=ic;const list=[...gs.values()].sort((a,b)=>a.name.localeCompare(b.name));$('products').innerHTML=list.length?list.map(g=>`<div class="product"><h2>${esc(g.name)}</h2><div class="breakdown">${[...g.containers.entries()].map(([c,q])=>`<div>${esc(c)}</div><div><strong>${q}</strong> container${q===1?'':'s'}</div>`).join('')}</div><div class="total">Total gallons: ${g.gallons.toLocaleString(undefined,{maximumFractionDigits:2})}</div></div>`).join(''):'<div class="panel">No pending blending demand.</div>';$('totals').innerHTML=list.map(g=>`<tr><td>${esc(g.name)}</td><td><strong>${g.gallons.toLocaleString(undefined,{maximumFractionDigits:2})}</strong></td></tr>`).join('');$('refreshText').textContent='Updated '+new Date().toLocaleTimeString()+' • Auto-refreshes every 60 seconds.'}
async function newOrderSubmit(e){e.preventDefault();const po=getPo('');if(!po){$('msg').className='error';$('msg').textContent='Enter a PO number, select PO to Follow, or select No PO Required.';return}const lines=splitItems($('orderText').value);const payload={customer_name:$('customer').value.trim(),...po,requested_delivery_date:$('date').value||null,order_text:lines.join('\n'),back_ordered:$('backOrdered').checked,ready_to_ship:false,scheduled:false,scheduled_pickup_date:null,shipped:false,created_by:user.id,created_by_email:user.email||null,updated_by:user.id,updated_by_email:user.email||null};const{data:o,error}=await supabase.from('orders').insert(payload).select().single();if(error){$('msg').className='error';$('msg').textContent=error.message;return}const{error:ie}=await supabase.from('order_items').insert(lines.map((item_text,position)=>({order_id:o.id,item_text,position})));if(ie){await supabase.from('orders').delete().eq('id',o.id);$('msg').className='error';$('msg').textContent=ie.message;return}e.currentTarget.reset();$('msg').className='success';$('msg').innerHTML='Order submitted successfully. <a href="mobile.html">View orders</a>'}

function ensureEditModal(){
  if(document.getElementById('editModal')) return;
  const wrap=document.createElement('div');
  wrap.id='editModal'; wrap.className='modal hidden';
  wrap.innerHTML=`<div class="modal-card">
    <div class="modal-head"><h2>Edit Order</h2><button type="button" class="icon-btn" id="closeEdit">×</button></div>
    <form id="editForm">
      <input type="hidden" id="editId">
      <label>Customer Name</label><input id="editCustomer" required>
      <label>PO Number</label><input id="editPo">
      <div class="po-options"><label class="check"><input id="editPoFollow" type="checkbox"> PO to Follow</label><label class="check"><input id="editNoPo" type="checkbox"> No PO Required</label></div>
      <label>Requested Delivery Date <span class="small">(optional)</span></label><input id="editDate" type="date">
      <label>Order <span class="small">(one item per line)</span></label><textarea id="editOrderText" rows="7" required></textarea>
      <div id="editLots"></div>
      <div class="edit-status-grid">
        <label class="check"><input id="editBack" type="checkbox"> Back Ordered</label>
        <label class="check"><input id="editReady" type="checkbox"> Ready</label>
        <label class="check"><input id="editScheduled" type="checkbox"> Scheduled</label>
        <label class="check"><input id="editShipped" type="checkbox"> Shipped</label>
      </div>
      <label>Scheduled Pickup Date <span class="small">(optional)</span></label><input id="editPickup" type="date">
      <div class="modal-actions"><button type="button" id="cancelEdit">Cancel</button><button class="primary" id="saveEdit">Save Changes</button><button type="button" class="danger-btn" data-mobile-delete="${o.id}">Delete Order</button></div>
      <div id="editError" class="error"></div>
    </form>
  </div>`;
  document.body.appendChild(wrap);
  $('closeEdit').onclick=closeEditModal; $('cancelEdit').onclick=closeEditModal;
  wrap.addEventListener('click',e=>{if(e.target===wrap)closeEditModal()});
  setupPo('edit');
  $('editForm').addEventListener('submit',saveEditOrder);
  $('editPickup').addEventListener('change',()=>{if($('editPickup').value)$('editScheduled').checked=true});
  $('editScheduled').addEventListener('change',()=>{if(!$('editScheduled').checked)$('editPickup').value=''});
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
  document.querySelectorAll('[data-delete-order]').forEach(b=>b.onclick=()=>deleteOrder(b.dataset.deleteOrder));
}
async function mobileLoad(){await loadOrders();$('cards').innerHTML=filtered().map(o=>`<div class="order-card ${statusClass(o)}"><div class="card-top"><div><div class="customer">${esc(o.customer_name)}</div><div class="small">${poLabel(o)}</div></div><div><strong>${o.requested_delivery_date?fmtDate(o.requested_delivery_date):'No requested date'}</strong></div></div><ul>${(o.order_items||[]).map(i=>`<li>${esc(i.item_text)}</li>`).join('')}</ul><span class="pill">Back Ordered: ${o.back_ordered?'Yes':'No'}</span><span class="pill">Ready: ${o.ready_to_ship?'Yes':'No'}</span><span class="pill">Scheduled: ${o.scheduled?'Yes':'No'}</span>${o.scheduled_pickup_date?`<span class="pill">Pickup: ${fmtDate(o.scheduled_pickup_date)}</span>`:''}<span class="pill">Shipped: ${o.shipped?'Yes':'No'}</span><div class="card-actions"><button type="button" data-edit-order="${o.id}">Edit Order</button></div></div>`).join('');wireOrderActions()}
async function initPage(){if(page==='home')return;if(page==='new'){setupPo();$('form').onsubmit=newOrderSubmit;return}if(page==='tracker'){await trackerLoad();$('body').addEventListener('change',changeTracker);$('search').oninput=trackerLoad;$('filter').onchange=trackerLoad;$('refreshBtn').onclick=trackerLoad;return}if(page==='blending'){await forecastLoad();$('refreshBtn').onclick=forecastLoad;return}if(page==='mobile'){await mobileLoad();$('filter').onchange=mobileLoad;$('refreshBtn').onclick=mobileLoad;return}if(page==='desktop'){await trackerLoad();$('body').addEventListener('change',changeTracker);$('search').oninput=trackerLoad;$('filter').onchange=trackerLoad;$('refreshBtn').onclick=trackerLoad;return}}
document.querySelectorAll('.login-form').forEach(f=>f.addEventListener('submit',signIn));document.querySelectorAll('.logout').forEach(a=>a.addEventListener('click',async e=>{e.preventDefault();await supabase.auth.signOut()}));const{data:{session}}=await supabase.auth.getSession();await showSession(session);supabase.auth.onAuthStateChange(async(_e,s)=>await showSession(s));setInterval(async()=>{if(!user)return;if(page==='tracker'||page==='desktop')await trackerLoad();if(page==='blending')await forecastLoad();if(page==='mobile')await mobileLoad()},60000);


async function mobileDeleteOrder(id){
  const o = (typeof orders !== 'undefined' ? orders : []).find(x => String(x.id) === String(id));
  const label = o && o.customer_name ? ` for ${o.customer_name}` : '';
  if(!confirm(`Delete this order${label}? This cannot be undone.`)) return;
  const { error } = await supabase.from('orders').delete().eq('id', id);
  if(error){ alert(error.message); return; }
  const modal = document.getElementById('editModal');
  if(modal) modal.classList.add('hidden');
  if(typeof load === 'function') await load();
}

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-mobile-delete]');
  if(!btn) return;
  e.preventDefault();
  await mobileDeleteOrder(btn.dataset.mobileDelete);
});
