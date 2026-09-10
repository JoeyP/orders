import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
});

const $=id=>document.getElementById(id);
let user=null,orders=[],initializedPage=null,newOrderSubmitting=false;
const page=document.body.dataset.page;

function esc(v){
  return String(v??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[c]));
}
function splitItems(t){
  return String(t||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
}
function fmtDate(s){
  if(!s)return'';
  const[y,m,d]=s.split('-').map(Number);
  return new Date(y,m-1,d).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
}
function localDateString(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function statusClass(o){
  if(o.shipped)return'gray';
  if(o.back_ordered)return'charcoal';
  if(!o.requested_delivery_date)return'';
  const t=localDateString(new Date());
  const tomorrow=new Date(); tomorrow.setDate(tomorrow.getDate()+1);
  const tm=localDateString(tomorrow);
  if(o.requested_delivery_date<=t&&!o.ready_to_ship)return'red';
  if(o.requested_delivery_date===t&&o.ready_to_ship)return'yellow';
  if(o.requested_delivery_date===tm&&!o.ready_to_ship)return'orange';
  if(o.ready_to_ship)return'green';
  return'';
}
function deliveryStatusClass(o){
  if(o.shipped)return'gray';
  if(o.ready_to_ship)return'green';
  return'';
}
function poLabel(o){
  if(o.po_number)return`PO ${esc(o.po_number)}`;
  if(o.po_status==='to_follow')return'PO TO FOLLOW';
  if(o.po_status==='no_po_required')return'NO PO REQUIRED';
  return'PO NOT SET';
}
function deliveryLabel(o){
  if(o.delivery_method==='bl_neeley')return'B&L Neeley Delivery';
  if(o.delivery_method==='lje')return'LJE Shipping';
  if(o.delivery_method==='other'){
    const txt=String(o.delivery_method_other||'').trim();
    return txt?`Other — ${txt}`:'Other';
  }
  return'DELIVERY METHOD NOT SET';
}
function parseOrderLine(raw){
  const text=String(raw||'').trim();
  if(!text)return{qty:'',container:'',item:''};

  const normalizeUnit=u=>{
    u=String(u||'').toLowerCase();
    if(['g','gal','gallon','gallons'].includes(u))return'gal';
    if(['lb','lbs','pound','pounds'].includes(u))return'lb';
    if(['oz','ounce','ounces'].includes(u))return'oz';
    if(u==='kg')return'kg';
    if(['l','liter','liters','litre','litres'].includes(u))return'L';
    return'';
  };

  let m;

  // 1 - 55g Product, 1x55 gal Product, 1 (55 gallon) Product.
  // Longest unit names come first so "gal" is never partially matched as "g".
  m=text.match(/^\s*(\d+(?:\.\d+)?)\s*(?:[-xX×]\s*|\(\s*)?(\d+(?:\.\d+)?)\s*(gallons|gallon|gal|g|pounds|pound|lbs|lb|ounces|ounce|oz|kg|liters|liter|litres|litre|l)\b\s*\)?\s*(.*)$/i);
  if(m){
    const u=normalizeUnit(m[3]);
    return{qty:m[1],container:`${m[2]} ${u}`,item:(m[4]||'').trim()};
  }

  // 1 (55) Product, 1(55) Product -> bare container defaults to gallons.
  m=text.match(/^\s*(\d+(?:\.\d+)?)\s*\(\s*(\d+(?:\.\d+)?)\s*\)\s*(.*)$/);
  if(m&&m[3].trim())return{qty:m[1],container:`${m[2]} gal`,item:m[3].trim()};

  // 1 x 55 Product, 1-55 Product, 1 - 55 Product, 1 55 Product.
  m=text.match(/^\s*(\d+(?:\.\d+)?)\s*(?:[-xX×]\s*|\s+)(\d+(?:\.\d+)?)\s+(.*)$/);
  if(m&&m[3].trim())return{qty:m[1],container:`${m[2]} gal`,item:m[3].trim()};

  // Named containers.
  m=text.match(/^\s*(\d+(?:\.\d+)?)\s*(?:[-xX×]\s*)?(drum|drums|tote|totes|pail|pails|case|cases|bag|bags)\b\s*(.*)$/i);
  if(m){
    const c=m[2].replace(/s$/i,'');
    return{qty:m[1],container:c[0].toUpperCase()+c.slice(1).toLowerCase(),item:(m[3]||'').trim()};
  }

  // Safe fallback: quantity + original remainder.
  m=text.match(/^\s*(\d+(?:\.\d+)?)\s*(?:[-xX×]\s*)?(.*)$/);
  if(m&&m[2].trim())return{qty:m[1],container:'',item:m[2].trim()};
  return{qty:'',container:'',item:text};
}
function containerGallons(c){
  const m=String(c||'').match(/^(\d+(?:\.\d+)?)\s+gal$/i);
  return m?Number(m[1]):null;
}

async function showSession(s){
  user=s?.user||null;
  document.querySelectorAll('[data-auth=login]').forEach(x=>x.classList.toggle('hidden',!!user));
  document.querySelectorAll('[data-auth=app]').forEach(x=>x.classList.toggle('hidden',!user));
  if(user){
    document.querySelectorAll('.user-email').forEach(x=>x.textContent=user.email||'');
    if(initializedPage!==page){
      initializedPage=page;
      await initPage();
    }else{
      await refreshCurrentPage();
    }
  }
}
async function signIn(e){
  e.preventDefault();
  const email=e.currentTarget.querySelector('[name=email]').value.trim();
  const password=e.currentTarget.querySelector('[name=password]').value;
  const{error}=await supabase.auth.signInWithPassword({email,password});
  const er=e.currentTarget.querySelector('.error');
  if(er)er.textContent=error?error.message:'';
}
async function loadOrders(){
  const{data,error}=await supabase.from('orders')
    .select('*,order_items(*)')
    .order('shipped',{ascending:true})
    .order('requested_delivery_date',{ascending:true,nullsFirst:false})
    .order('created_at',{ascending:true});
  if(error){
    if($('refreshText'))$('refreshText').textContent=error.message;
    return false;
  }
  orders=(data||[]).map(o=>({
    ...o,
    order_items:(o.order_items||[]).sort((a,b)=>(a.position||0)-(b.position||0))
  }));
  if($('refreshText'))$('refreshText').textContent='Updated '+new Date().toLocaleTimeString()+' • Auto-refreshes every 60 seconds.';
  return true;
}

function fieldId(prefix,name){
  if(!prefix)return name;
  return prefix+name.charAt(0).toUpperCase()+name.slice(1);
}
function setupPo(prefix=''){
  const po=$(fieldId(prefix,'po'));
  const f=$(fieldId(prefix,'poFollow'));
  const n=$(fieldId(prefix,'noPo'));
  if(!po||!f||!n)return;
  f.onchange=()=>{if(f.checked){n.checked=false;po.value=''}};
  n.onchange=()=>{if(n.checked){f.checked=false;po.value=''}};
  po.oninput=()=>{if(po.value.trim()){f.checked=false;n.checked=false}};
}
function getPo(prefix=''){
  const poEl=$(fieldId(prefix,'po'));
  const followEl=$(fieldId(prefix,'poFollow'));
  const noPoEl=$(fieldId(prefix,'noPo'));
  if(!poEl||!followEl||!noPoEl)return null;
  const po=poEl.value.trim()||null;
  return po?{po_number:po,po_status:'provided'}
    :followEl.checked?{po_number:null,po_status:'to_follow'}
    :noPoEl.checked?{po_number:null,po_status:'no_po_required'}
    :null;
}
function setupDelivery(prefix=''){
  const sel=$(fieldId(prefix,'deliveryMethod'));
  const wrap=$(fieldId(prefix,'deliveryOtherWrap'));
  const txt=$(fieldId(prefix,'deliveryOther'));
  if(!sel||!wrap)return;
  const sync=()=>{
    const isOther=sel.value==='other';
    wrap.classList.toggle('hidden',!isOther);
    if(txt&&!isOther)txt.value='';
  };
  sel.onchange=sync;
  sync();
}
function getDelivery(prefix=''){
  const sel=$(fieldId(prefix,'deliveryMethod'));
  const txt=$(fieldId(prefix,'deliveryOther'));
  if(!sel||!sel.value)return null;
  return{
    delivery_method:sel.value,
    delivery_method_other:sel.value==='other'?(txt?.value.trim()||null):null
  };
}

function filtered(){
  const f=$('filter')?.value||'active';
  const q=($('search')?.value||'').trim().toLowerCase();
  const dateFrom=$('dateFrom')?.value||'';
  const dateTo=$('dateTo')?.value||'';

  return orders.filter(o=>{
    const hay=[
      o.customer_name,o.po_number,o.po_status,o.order_text,
      deliveryLabel(o),o.requested_delivery_date,o.scheduled_pickup_date,
      (o.order_items||[]).map(i=>i.item_text+' '+(i.lot_numbers||'')).join(' ')
    ].join(' ').toLowerCase();

    if(q&&!hay.includes(q))return false;

    if(page==='desktop'){
      const d=o.requested_delivery_date||'';
      if(dateFrom&&(!d||d<dateFrom))return false;
      if(dateTo&&(!d||d>dateTo))return false;
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
function itemRows(o,editable=true){
  return (o.order_items||[]).map(i=>{
    const p=parseOrderLine(i.item_text);
    return `<div class="item-row">
      <div>${esc(p.qty)}</div>
      <div>${esc(p.container)}</div>
      <div>${esc(p.item)}</div>
      ${editable
        ?`<input class="lot" data-lot="${i.id}" value="${esc(i.lot_numbers||'')}" placeholder="Lot(s)" ${o.shipped?'disabled':''}>`
        :`<div>${esc(i.lot_numbers||'')}</div>`}
    </div>`;
  }).join('');
}

async function changeTracker(e){
  const t=e.target;
  if(t.dataset.lot){
    const{error}=await supabase.from('order_items').update({
      lot_numbers:t.value.trim()||null,
      updated_by:user.id,
      updated_by_email:user.email||null
    }).eq('id',t.dataset.lot);
    if(error)alert(error.message);
    await trackerLoad();
    return;
  }

  const id=t.dataset.back||t.dataset.ready||t.dataset.scheduled||t.dataset.pickup||t.dataset.shipped;
  if(!id)return;
  const o=orders.find(x=>String(x.id)===String(id));
  if(!o)return;

  const patch={updated_by:user.id,updated_by_email:user.email||null};
  if(t.dataset.back)patch.back_ordered=t.checked;

  if(t.dataset.ready){
    if(t.checked){
      const missing=(o.order_items||[]).filter(i=>!String(i.lot_numbers||'').trim()).length;
      if(missing&&!confirm(`${missing} item(s) are missing lot numbers. Mark Ready anyway?`)){
        t.checked=false;
        return;
      }
    }
    patch.ready_to_ship=t.checked;
  }

  if(t.dataset.scheduled){
    patch.scheduled=t.checked;
    if(!t.checked)patch.scheduled_pickup_date=null;
  }
  if(t.dataset.pickup){
    patch.scheduled_pickup_date=t.value||null;
    if(t.value)patch.scheduled=true;
  }
  if(t.dataset.shipped){
    patch.shipped=t.checked;
    if(t.checked)patch.ready_to_ship=true;
  }

  const{error}=await supabase.from('orders').update(patch).eq('id',id);
  if(error)alert(error.message);
  await trackerLoad();
}

async function trackerLoad(){
  await loadOrders();
  const body=$('body');
  if(!body)return;
  body.innerHTML='';

  filtered().forEach(o=>{
    const tr=document.createElement('tr');
    tr.className=statusClass(o);
    tr.innerHTML=`
      <td>${o.requested_delivery_date?fmtDate(o.requested_delivery_date):'<span class="small">No date</span>'}</td>
      <td><strong>${esc(o.customer_name)}</strong></td>
      <td>${poLabel(o)}</td>
      <td><span class="delivery-badge">${esc(deliveryLabel(o))}</span></td>
      <td class="items">
        <div class="item-head"><div>Qty</div><div>Container</div><div>Item</div><div>Lot Number(s)</div></div>
        ${itemRows(o,true)}
      </td>
      <td class="chk"><input type="checkbox" data-back="${o.id}" ${o.back_ordered?'checked':''} ${o.shipped?'disabled':''}></td>
      <td class="chk"><input type="checkbox" data-ready="${o.id}" ${o.ready_to_ship?'checked':''} ${o.shipped?'disabled':''}></td>
      <td class="chk"><input type="checkbox" data-scheduled="${o.id}" ${o.scheduled?'checked':''} ${o.shipped?'disabled':''}></td>
      <td><input class="pickup" type="date" data-pickup="${o.id}" value="${o.scheduled_pickup_date||''}" ${o.shipped?'disabled':''}></td>
      <td class="chk"><input type="checkbox" data-shipped="${o.id}" ${o.shipped?'checked':''}></td>
      <td class="actions"><button type="button" data-edit-order="${o.id}">Edit</button></td>`;
    body.appendChild(tr);
  });
  wireOrderActions();
}

async function deliveriesLoad(){
  await loadOrders();
  const f=$('deliveryFilter')?.value||'active';
  const q=($('deliverySearch')?.value||'').trim().toLowerCase();
  let list=orders.filter(o=>o.delivery_method==='bl_neeley');

  list=list.filter(o=>{
    if(f==='active'&&o.shipped)return false;
    if(f==='ready'&&(!o.ready_to_ship||o.shipped))return false;
    if(f==='shipped'&&!o.shipped)return false;
    if(q){
      const hay=[
        o.customer_name,o.po_number,o.order_text,o.requested_delivery_date,
        (o.order_items||[]).map(i=>i.item_text+' '+(i.lot_numbers||'')).join(' ')
      ].join(' ').toLowerCase();
      if(!hay.includes(q))return false;
    }
    return true;
  });

  const body=$('deliveryBody');
  if(!body)return;
  body.innerHTML='';

  list.forEach(o=>{
    const tr=document.createElement('tr');
    tr.className=deliveryStatusClass(o);
    tr.innerHTML=`
      <td>${o.requested_delivery_date?fmtDate(o.requested_delivery_date):'<span class="small">No date</span>'}</td>
      <td><strong>${esc(o.customer_name)}</strong></td>
      <td>${poLabel(o)}</td>
      <td class="items">
        <div class="item-head driver-items"><div>Qty</div><div>Container</div><div>Item</div><div>Lot Number(s)</div></div>
        ${itemRows(o,false)}
      </td>
      <td class="driver-status"><strong>${o.ready_to_ship?'READY':'Not Ready'}</strong></td>
      <td class="chk"><input type="checkbox" data-delivery-shipped="${o.id}" ${o.shipped?'checked':''}></td>`;
    body.appendChild(tr);
  });

  document.querySelectorAll('[data-delivery-shipped]').forEach(cb=>{
    cb.onchange=async()=>{
      const id=cb.dataset.deliveryShipped;
      const patch={
        shipped:cb.checked,
        updated_by:user.id,
        updated_by_email:user.email||null
      };
      if(cb.checked)patch.ready_to_ship=true;
      const{error}=await supabase.from('orders').update(patch).eq('id',id);
      if(error){
        alert(error.message);
        cb.checked=!cb.checked;
        return;
      }
      await deliveriesLoad();
    };
  });

  if($('deliveryCount'))$('deliveryCount').textContent=list.length;
}

async function forecastLoad(){
  const{data,error}=await supabase.from('orders')
    .select('id,ready_to_ship,scheduled,shipped,back_ordered,order_items(*)')
    .eq('ready_to_ship',false)
    .eq('scheduled',false)
    .eq('shipped',false);

  if(error){
    if($('refreshText'))$('refreshText').textContent=error.message;
    return;
  }

  const groups=new Map(),os=data||[];
  let itemCount=0;

  os.forEach(o=>(o.order_items||[]).forEach(i=>{
    itemCount++;
    const p=parseOrderLine(i.item_text);
    const name=(p.item||i.item_text).trim();
    const key=name.toLowerCase().replace(/\s+/g,' ');
    const qty=Number(p.qty)||0;
    const cont=p.container||'Unparsed';

    if(!groups.has(key))groups.set(key,{name,containers:new Map(),gallons:0});
    const g=groups.get(key);
    g.containers.set(cont,(g.containers.get(cont)||0)+qty);
    const gal=containerGallons(cont);
    if(gal!==null)g.gallons+=qty*gal;
  }));

  if($('orderCount'))$('orderCount').textContent=os.length;
  if($('itemCount'))$('itemCount').textContent=itemCount;

  const list=[...groups.values()].sort((a,b)=>a.name.localeCompare(b.name));

  if($('totals')){
    $('totals').innerHTML=list.length
      ?list.map(g=>`<tr><td>${esc(g.name)}</td><td><strong>${g.gallons.toLocaleString(undefined,{maximumFractionDigits:2})}</strong></td></tr>`).join('')
      :'<tr><td colspan="2">No pending blending demand.</td></tr>';
  }

  if($('products')){
    $('products').innerHTML=list.length
      ?list.map(g=>`<div class="product">
          <h2>${esc(g.name)}</h2>
          <div class="breakdown">
            ${[...g.containers.entries()].map(([c,q])=>`<div>${esc(c)}</div><div><strong>${q}</strong> container${q===1?'':'s'}</div>`).join('')}
          </div>
          <div class="total">Total gallons: ${g.gallons.toLocaleString(undefined,{maximumFractionDigits:2})}</div>
        </div>`).join('')
      :'<div class="panel">No pending blending demand.</div>';
  }

  if($('refreshText'))$('refreshText').textContent='Updated '+new Date().toLocaleTimeString()+' • Auto-refreshes every 60 seconds.';
}

async function newOrderSubmit(e){
  e.preventDefault();
  if(newOrderSubmitting)return;

  const form=e.currentTarget;
  const submitBtn=$('submitOrderBtn')||form.querySelector('button[type="submit"]');
  const originalText=submitBtn?.textContent||'Submit Order';

  const po=getPo('');
  if(!po){
    $('msg').className='error';
    $('msg').textContent='Enter a PO number, select PO to Follow, or select No PO Required.';
    return;
  }

  const delivery=getDelivery('');
  if(!delivery){
    $('msg').className='error';
    $('msg').textContent='Select a Delivery Method.';
    return;
  }

  const lines=splitItems($('orderText').value);
  if(!$('customer').value.trim()||!lines.length){
    $('msg').className='error';
    $('msg').textContent='Enter a customer and at least one order item.';
    return;
  }

  newOrderSubmitting=true;
  if(submitBtn){
    submitBtn.disabled=true;
    submitBtn.textContent='Submitting…';
  }
  $('msg').className='submit-status';
  $('msg').textContent='Saving order…';

  try{
    const payload={
      customer_name:$('customer').value.trim(),
      ...po,
      ...delivery,
      requested_delivery_date:$('date').value||null,
      order_text:lines.join('\n'),
      back_ordered:$('backOrdered').checked,
      ready_to_ship:false,
      scheduled:false,
      scheduled_pickup_date:null,
      shipped:false,
      created_by:user.id,
      created_by_email:user.email||null,
      updated_by:user.id,
      updated_by_email:user.email||null
    };

    const{data:o,error}=await supabase.from('orders').insert(payload).select().single();
    if(error)throw error;

    const{error:itemError}=await supabase.from('order_items').insert(
      lines.map((item_text,position)=>({
        order_id:o.id,item_text,position,updated_by:user.id,updated_by_email:user.email||null
      }))
    );
    if(itemError){
      await supabase.from('orders').delete().eq('id',o.id);
      throw itemError;
    }

    form.reset();
    setupDelivery('');
    $('msg').className='success success-box';
    $('msg').innerHTML=`<strong>Order #${o.id} added successfully.</strong>`;
    showNewOrderSuccess(o);
  }catch(err){
    $('msg').className='error';
    $('msg').textContent=err?.message||'The order could not be saved. Please try again.';
  }finally{
    newOrderSubmitting=false;
    if(submitBtn){
      submitBtn.disabled=false;
      submitBtn.textContent=originalText;
    }
  }
}

function showNewOrderSuccess(o){
  let modal=$('newOrderSuccessModal');
  if(!modal){
    modal=document.createElement('div');
    modal.id='newOrderSuccessModal';
    modal.className='success-modal hidden';
    modal.innerHTML=`
      <div class="success-modal-card" role="dialog" aria-modal="true" aria-labelledby="newOrderSuccessTitle">
        <div class="success-check">✓</div>
        <h2 id="newOrderSuccessTitle">Order Added Successfully</h2>
        <p id="newOrderSuccessDetail"></p>
        <div class="success-modal-actions">
          <a id="viewNewOrder" class="primary success-modal-button" href="#">View Order</a>
          <button id="addAnotherOrder" type="button" class="success-modal-button">Add Another Order</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  $('newOrderSuccessDetail').textContent=`${o.customer_name} · Order #${o.id}`;
  $('viewNewOrder').href=`mobile.html?order=${o.id}`;
  modal.classList.remove('hidden');
  $('addAnotherOrder').onclick=()=>{
    modal.classList.add('hidden');
    $('msg').className='';
    $('msg').textContent='';
    $('customer').focus();
  };
}

function ensureEditModal(){
  if($('editModal'))return;

  const wrap=document.createElement('div');
  wrap.id='editModal';
  wrap.className='modal hidden';
  wrap.innerHTML=`<div class="modal-card">
    <div class="modal-head">
      <h2>Edit Order</h2>
      <button type="button" class="icon-btn" id="closeEdit">×</button>
    </div>
    <form id="editForm">
      <input type="hidden" id="editId">

      <label>Customer Name</label>
      <input id="editCustomer" required>

      <label>PO Number</label>
      <input id="editPo">
      <div class="po-options">
        <label class="check"><input id="editPoFollow" type="checkbox"> PO to Follow</label>
        <label class="check"><input id="editNoPo" type="checkbox"> No PO Required</label>
      </div>

      <label>Requested Delivery Date <span class="small">(optional)</span></label>
      <input id="editDate" type="date">

      <label>Delivery Method</label>
      <select id="editDeliveryMethod" required>
        <option value="">Select delivery method…</option>
        <option value="bl_neeley">B&L Neeley Delivery</option>
        <option value="lje">LJE Shipping</option>
        <option value="other">Other</option>
      </select>
      <div id="editDeliveryOtherWrap" class="hidden">
        <label>Other Delivery Method <span class="small">(optional)</span></label>
        <input id="editDeliveryOther" placeholder="Customer pickup, UPS, etc.">
      </div>

      <label>Order <span class="small">(one item per line)</span></label>
      <textarea id="editOrderText" rows="7" required></textarea>

      <div id="editLots"></div>

      <div class="edit-status-grid">
        <label class="check"><input id="editBack" type="checkbox"> Back Ordered</label>
        <label class="check"><input id="editReady" type="checkbox"> Ready</label>
        <label class="check"><input id="editScheduled" type="checkbox"> Scheduled</label>
        <label class="check"><input id="editShipped" type="checkbox"> Shipped</label>
      </div>

      <label>Scheduled Pickup Date <span class="small">(optional)</span></label>
      <input id="editPickup" type="date">

      <div id="editError" class="edit-save-status"></div>
      <div class="modal-actions">
        <button type="button" id="cancelEdit">Cancel</button>
        <button type="button" class="primary" id="saveEdit">Save Changes</button>
        <button type="button" class="danger-btn" id="deleteEdit">Delete Order</button>
      </div>
    </form>
  </div>`;

  document.body.appendChild(wrap);
  wrap.addEventListener('click',e=>{if(e.target===wrap)closeEditModal()});
  setupPo('edit');
  setupDelivery('edit');
  $('editPickup').addEventListener('change',()=>{if($('editPickup').value)$('editScheduled').checked=true});
  $('editScheduled').addEventListener('change',()=>{if(!$('editScheduled').checked)$('editPickup').value=''});
}
function closeEditModal(){
  $('editModal')?.classList.add('hidden');
}
function renderEditLots(o){
  const box=$('editLots');
  if(!box)return;
  box.innerHTML='<label>Lot Number(s)</label><div class="edit-lots">'
    +(o.order_items||[]).map((i,idx)=>`<div class="edit-lot-row">
      <div><strong>${esc(i.item_text)}</strong></div>
      <input data-edit-lot-index="${idx}" value="${esc(i.lot_numbers||'')}" placeholder="Lot number(s)">
    </div>`).join('')
    +'</div>';
}
function openEditOrder(id){
  ensureEditModal();
  const o=orders.find(x=>String(x.id)===String(id));
  if(!o)return;

  $('editId').value=o.id;
  $('editCustomer').value=o.customer_name||'';
  $('editPo').value=o.po_number||'';
  $('editPoFollow').checked=o.po_status==='to_follow';
  $('editNoPo').checked=o.po_status==='no_po_required';
  $('editDate').value=o.requested_delivery_date||'';
  $('editDeliveryMethod').value=o.delivery_method||'';
  $('editDeliveryOther').value=o.delivery_method_other||'';
  setupDelivery('edit');
  $('editOrderText').value=(o.order_items||[]).map(i=>i.item_text).join('\n')||o.order_text||'';
  $('editBack').checked=!!o.back_ordered;
  $('editReady').checked=!!o.ready_to_ship;
  $('editScheduled').checked=!!o.scheduled;
  $('editShipped').checked=!!o.shipped;
  $('editPickup').value=o.scheduled_pickup_date||'';

  renderEditLots(o);
  $('editError').className='edit-save-status';
  $('editError').textContent='';
  $('editModal').classList.remove('hidden');
}
function preserveLots(oldItems,newLines){
  const used=new Set(),result=[];
  newLines.forEach((line,pos)=>{
    let idx=oldItems.findIndex((i,j)=>!used.has(j)&&String(i.item_text||'').trim()===line.trim());
    if(idx<0&&oldItems[pos]&&!used.has(pos))idx=pos;
    if(idx>=0){
      used.add(idx);
      result.push(oldItems[idx].lot_numbers||null);
    }else result.push(null);
  });
  return result;
}
async function saveEditOrder(e){
  if(e?.preventDefault)e.preventDefault();

  const id=$('editId').value;
  const o=orders.find(x=>String(x.id)===String(id));
  if(!o)return;

  const errorBox=$('editError');
  const save=$('saveEdit');
  const originalSaveText=save.textContent;

  const po=getPo('edit');
  if(!po){
    errorBox.textContent='Enter a PO number, select PO to Follow, or select No PO Required.';
    errorBox.scrollIntoView({block:'nearest'});
    return;
  }

  const delivery=getDelivery('edit');
  if(!delivery){
    errorBox.textContent='Select a Delivery Method.';
    errorBox.scrollIntoView({block:'nearest'});
    return;
  }

  const lines=splitItems($('editOrderText').value);
  if(!lines.length){
    errorBox.textContent='Enter at least one order item.';
    errorBox.scrollIntoView({block:'nearest'});
    return;
  }

  const oldItems=(o.order_items||[]).slice().sort((a,b)=>(a.position||0)-(b.position||0));
  const oldLines=oldItems.map(i=>String(i.item_text||'').trim());
  const linesChanged=
    oldLines.length!==lines.length ||
    oldLines.some((line,idx)=>line!==lines[idx]);

  // Current lot values from the popup, by existing item position.
  const currentLots=oldItems.map((i,idx)=>{
    const input=document.querySelector(`[data-edit-lot-index="${idx}"]`);
    return input ? (input.value.trim()||null) : (i.lot_numbers||null);
  });

  // If the line structure changed, carry old lots forward where possible.
  const rebuiltLots=linesChanged ? preserveLots(
    oldItems.map((i,idx)=>({...i,lot_numbers:currentLots[idx]})),
    lines
  ) : currentLots;

  if($('editReady').checked){
    const missing=rebuiltLots.filter(x=>!String(x||'').trim()).length;
    if(missing&&!confirm(`${missing} order item(s) are missing lot numbers. Mark this order Ready anyway?`))return;
  }

  const patch={
    customer_name:$('editCustomer').value.trim(),
    ...po,
    ...delivery,
    requested_delivery_date:$('editDate').value||null,
    order_text:lines.join('\n'),
    back_ordered:$('editBack').checked,
    ready_to_ship:$('editReady').checked||$('editShipped').checked,
    scheduled:$('editScheduled').checked,
    scheduled_pickup_date:$('editScheduled').checked?($('editPickup').value||null):null,
    shipped:$('editShipped').checked,
    updated_by:user.id,
    updated_by_email:user.email||null
  };

  save.disabled=true;
  save.textContent='Saving…';
  errorBox.className='edit-save-status';
  errorBox.textContent='Saving order changes…';
  errorBox.scrollIntoView({block:'nearest'});

  try{
    // STEP 1 — update only the order header.
    const{data:updated,error:updateError}=await supabase
      .from('orders')
      .update(patch)
      .eq('id',id)
      .select('*')
      .single();

    if(updateError)throw new Error(`Order update failed: ${updateError.message}`);

    if(!updated)throw new Error('Order update returned no saved row.');

    if(updated.delivery_method!==delivery.delivery_method){
      throw new Error(`Delivery Method verification failed. Expected "${delivery.delivery_method}" but Supabase returned "${updated.delivery_method||'blank'}".`);
    }

    if((updated.delivery_method_other||null)!==(delivery.delivery_method_other||null)){
      throw new Error('Other Delivery Method verification failed.');
    }

    // STEP 2 — only rebuild order_items if item lines actually changed.
    if(linesChanged){
      const{error:deleteError}=await supabase
        .from('order_items')
        .delete()
        .eq('order_id',id);

      if(deleteError)throw new Error(`Order items could not be replaced: ${deleteError.message}`);

      const replacementRows=lines.map((item_text,position)=>({
        order_id:Number(id),
        item_text,
        position,
        lot_numbers:rebuiltLots[position]||null,
        updated_by:user.id,
        updated_by_email:user.email||null
      }));

      const{error:insertError}=await supabase
        .from('order_items')
        .insert(replacementRows);

      if(insertError)throw new Error(`Order items could not be saved: ${insertError.message}`);
    }else{
      // STEP 2B — item text is unchanged, so update only lot numbers that changed.
      for(let idx=0;idx<oldItems.length;idx++){
        const oldLot=oldItems[idx].lot_numbers||null;
        const newLot=currentLots[idx]||null;
        if(oldLot===newLot)continue;

        const{error:lotError}=await supabase
          .from('order_items')
          .update({
            lot_numbers:newLot,
            updated_by:user.id,
            updated_by_email:user.email||null
          })
          .eq('id',oldItems[idx].id);

        if(lotError)throw new Error(`Lot number update failed: ${lotError.message}`);
      }
    }

    // STEP 3 — re-read the saved order from Supabase and verify it independently.
    const{data:verified,error:verifyError}=await supabase
      .from('orders')
      .select('id,customer_name,po_number,po_status,requested_delivery_date,delivery_method,delivery_method_other,back_ordered,ready_to_ship,scheduled,scheduled_pickup_date,shipped')
      .eq('id',id)
      .single();

    if(verifyError)throw new Error(`Save verification failed: ${verifyError.message}`);
    if(!verified)throw new Error('Save verification returned no order.');

    if(verified.delivery_method!==delivery.delivery_method){
      throw new Error(`Save verification failed: Delivery Method is still "${deliveryLabel(verified)}".`);
    }

    errorBox.className='edit-save-status success';
    errorBox.textContent='Saved successfully ✓';

    // Give the user visible confirmation, then close and reload.
    await new Promise(resolve=>setTimeout(resolve,450));
    closeEditModal();
    await refreshCurrentPage();

  }catch(err){
    errorBox.className='edit-save-status error';
    errorBox.textContent=err?.message||'The order could not be saved.';
    errorBox.scrollIntoView({behavior:'smooth',block:'nearest'});
  }finally{
    save.disabled=false;
    save.textContent=originalSaveText;
  }
}
async function deleteEditedOrder(){
  const id=$('editId')?.value;
  const o=orders.find(x=>String(x.id)===String(id));
  if(!o)return;
  if(!confirm(`Delete the order for ${o.customer_name}?\n\nThis permanently deletes the order and its line items.`))return;

  const{error}=await supabase.from('orders').delete().eq('id',id);
  if(error){
    $('editError').textContent=error.message;
    return;
  }
  closeEditModal();
  await refreshCurrentPage();
}

// Stable edit-modal action handling.
// These listeners live on document so they survive page/table refreshes and modal recreation.
document.addEventListener('click',async e=>{
  const closeButton=e.target.closest('#closeEdit,#cancelEdit');
  if(closeButton){
    e.preventDefault();
    closeEditModal();
    return;
  }

  const saveButton=e.target.closest('#saveEdit');
  if(saveButton){
    e.preventDefault();
    await saveEditOrder(e);
    return;
  }

  const deleteButton=e.target.closest('#deleteEdit');
  if(deleteButton){
    e.preventDefault();
    await deleteEditedOrder();
    return;
  }
});

function wireOrderActions(){
  document.querySelectorAll('[data-edit-order]').forEach(b=>{
    b.onclick=()=>openEditOrder(b.dataset.editOrder);
  });
}

async function mobileLoad(){
  await loadOrders();
  const directId=new URLSearchParams(location.search).get('order');
  let list=filtered();

  if(directId){
    const direct=orders.find(o=>String(o.id)===String(directId));
    if(direct)list=[direct];
  }

  if($('directOrderNote'))$('directOrderNote').classList.toggle('hidden',!directId);

  $('cards').innerHTML=list.map(o=>`
    <div class="order-card ${statusClass(o)}">
      <div class="card-top">
        <div>
          <div class="customer">${esc(o.customer_name)}</div>
          <div class="small">${poLabel(o)}</div>
        </div>
        <div><strong>${o.requested_delivery_date?fmtDate(o.requested_delivery_date):'No requested date'}</strong></div>
      </div>
      <div class="mobile-delivery-method">${esc(deliveryLabel(o))}</div>
      <div class="mobile-item-grid">
        <div class="mobile-item-head"><span>Qty</span><span>Container</span><span>Product</span></div>
        ${(o.order_items||[]).map(i=>{
          const p=parseOrderLine(i.item_text);
          return `<div class="mobile-item-row"><span>${esc(p.qty)}</span><span>${esc(p.container)}</span><span>${esc(p.item)}</span></div>`;
        }).join('')}
      </div>
      <span class="pill">Back Ordered: ${o.back_ordered?'Yes':'No'}</span>
      <span class="pill">Ready: ${o.ready_to_ship?'Yes':'No'}</span>
      <span class="pill">Scheduled: ${o.scheduled?'Yes':'No'}</span>
      ${o.scheduled_pickup_date?`<span class="pill">Pickup: ${fmtDate(o.scheduled_pickup_date)}</span>`:''}
      <span class="pill">Shipped: ${o.shipped?'Yes':'No'}</span>
      <div class="card-actions"><button type="button" data-edit-order="${o.id}">Edit Order</button></div>
    </div>`).join('');

  wireOrderActions();
}

function csvCell(v){
  const s=String(v??'');
  return `"${s.replace(/"/g,'""')}"`;
}
function orderStatusText(o){
  const states=[];
  if(o.back_ordered)states.push('Back Ordered');
  if(o.ready_to_ship)states.push('Ready');
  if(o.scheduled)states.push('Scheduled');
  if(o.shipped)states.push('Shipped');
  return states.length?states.join('; '):'Open';
}
function exportDesktopCsv(){
  const rows=filtered();
  const headers=[
    'Order ID','Requested Delivery Date','Customer','PO Number','PO Status',
    'Delivery Method','Other Delivery Method','Order Items','Lot Numbers',
    'Back Ordered','Ready','Scheduled','Scheduled Pickup Date','Shipped','Status',
    'Created By','Created At','Updated By','Updated At'
  ];
  const lines=[headers.map(csvCell).join(',')];

  rows.forEach(o=>{
    lines.push([
      o.id,o.requested_delivery_date||'',o.customer_name||'',o.po_number||'',o.po_status||'',
      deliveryLabel(o),o.delivery_method_other||'',
      (o.order_items||[]).map(i=>i.item_text).join(' | '),
      (o.order_items||[]).map(i=>i.lot_numbers||'').join(' | '),
      o.back_ordered?'Yes':'No',
      o.ready_to_ship?'Yes':'No',
      o.scheduled?'Yes':'No',
      o.scheduled_pickup_date||'',
      o.shipped?'Yes':'No',
      orderStatusText(o),
      o.created_by_email||'',o.created_at||'',o.updated_by_email||'',o.updated_at||''
    ].map(csvCell).join(','));
  });

  const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`B&L_Neeley_Orders_${localDateString(new Date())}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function refreshCurrentPage(){
  if(!user)return;
  if(page==='tracker'||page==='desktop')await trackerLoad();
  if(page==='mobile')await mobileLoad();
  if(page==='blending')await forecastLoad();
  if(page==='deliveries')await deliveriesLoad();
}

async function initPage(){
  if(page==='home')return;

  if(page==='new'){
    setupPo();
    setupDelivery();
    $('form').onsubmit=newOrderSubmit;
    return;
  }

  if(page==='tracker'){
    await trackerLoad();
    $('body').addEventListener('change',changeTracker);
    $('search').oninput=trackerLoad;
    $('filter').onchange=trackerLoad;
    $('refreshBtn').onclick=trackerLoad;
    return;
  }

  if(page==='blending'){
    await forecastLoad();
    $('refreshBtn').onclick=forecastLoad;
    return;
  }

  if(page==='mobile'){
    await mobileLoad();
    $('filter').onchange=mobileLoad;
    $('refreshBtn').onclick=mobileLoad;
    return;
  }

  if(page==='desktop'){
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
    return;
  }

  if(page==='deliveries'){
    await deliveriesLoad();
    $('deliveryFilter').onchange=deliveriesLoad;
    $('deliverySearch').oninput=deliveriesLoad;
    $('refreshBtn').onclick=deliveriesLoad;
  }
}

document.querySelectorAll('.login-form').forEach(f=>f.addEventListener('submit',signIn));
document.querySelectorAll('.logout').forEach(a=>a.addEventListener('click',async e=>{
  e.preventDefault();
  await supabase.auth.signOut();
}));

const{data:{session}}=await supabase.auth.getSession();
await showSession(session);

// Avoid doing Supabase work directly inside the auth callback.
supabase.auth.onAuthStateChange((_e,s)=>setTimeout(()=>showSession(s),0));

setInterval(refreshCurrentPage,60000);
