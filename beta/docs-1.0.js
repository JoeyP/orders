import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './config.js';
const sb=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
let user,orders=[],coaProducts=[],shipProducts=[],customers=[],carriers=[];
function parseLine(s){let m=String(s||'').trim().match(/^(\d+(?:\.\d+)?)\s*(?:[-xX×]\s*|\(\s*)?(\d+(?:\.\d+)?)\s*(?:gallons?|gal|g)?\s*\)?\s*(.*)$/i);return m?{qty:+m[1],container:m[2],item:m[3].trim()}:{qty:1,container:'',item:String(s||'').trim()}}
function showLogin(on){document.querySelector('[data-auth=login]')?.classList.toggle('hidden',!on);document.querySelector('[data-auth=app]')?.classList.toggle('hidden',on)}
async function init(){
 const {data:{session}}=await sb.auth.getSession(); user=session?.user;
 if(!user){location.replace('index.html?return='+encodeURIComponent(location.pathname.split('/').pop()));return}
 const {data:a,error:accessError}=await sb.from('user_page_access').select('admin_orders').eq('user_id',user.id).maybeSingle();
 if(accessError){console.error('Could not load document-tool access',accessError);}
 if(!a?.admin_orders){showLogin(false);document.querySelector('[data-auth=app]').innerHTML='<div class="card"><h2>Access Denied</h2><a href="index.html">Return Home</a></div>';return}
 showLogin(false);document.querySelectorAll('.user-email').forEach(x=>x.textContent=user.email||'');
 try{
  const results=await Promise.all([
   sb.from('orders').select('*,order_items(*)').eq('shipped',false).order('requested_delivery_date'),
   sb.from('shipping_customers').select('*').eq('active',true).order('customer_name'),
   sb.from('shipping_products').select('*').eq('active',true).order('item_key'),
   sb.from('coa_products').select('*').eq('active',true).order('product_name'),
   sb.from('shipping_carriers').select('*').eq('active',true).order('carrier_name')
  ]);
  const [or,cr,spr,cpr,car]=results;
  const loadError=[or,cr,spr,cpr,car].find(x=>x.error)?.error;
  if(loadError)throw loadError;
  orders=or.data||[];customers=cr.data||[];shipProducts=spr.data||[];coaProducts=cpr.data||[];carriers=car.data||[];
  if(document.body.dataset.page==='coa')setupCoa(); else if(document.body.dataset.page==='bol')setupBol(); else setupMasters();
 }catch(err){
  console.error('Document tools failed to load',err);
  const app=document.querySelector('[data-auth=app]');
  if(app)app.innerHTML='<div class="card"><h2>Could not load document tools</h2><p class="error">'+esc(err?.message||String(err))+'</p><p><a href="index.html">Return Home</a></p></div>';
 }
}
document.querySelectorAll('.logout').forEach(a=>a.onclick=async e=>{e.preventDefault();await sb.auth.signOut();location.href='index.html'});

function orderLabel(o){return `${o.customer_name} — ${o.requested_delivery_date||'No date'} — ${o.po_number||o.po_status||'No PO'}`}
function setupCoa(){
 const os=$('coaOrder');os.innerHTML='<option value="">Select order…</option>'+orders.map(o=>`<option value="${o.id}">${esc(orderLabel(o))}</option>`).join('');
 os.onchange=renderCoaLines;$('coaLines').onchange=previewCoa;$('coaPrint').onclick=()=>window.print();$('coaSave').onclick=saveCoa;
}
function bestCoa(item){const q=item.toLowerCase();return coaProducts.find(p=>q.includes((p.product_name||'').toLowerCase())||(p.product_name||'').toLowerCase().includes(q))}
function renderCoaLines(){
 const o=orders.find(x=>String(x.id)===$('coaOrder').value);const box=$('coaLines');if(!o){box.innerHTML='';return}
 box.innerHTML=(o.order_items||[]).map((i,n)=>{const p=parseLine(i.item_text),best=bestCoa(p.item);return `<div class="doc-line"><label><input type="radio" name="coaLine" value="${i.id}" ${n===0?'checked':''}> ${esc(i.item_text)}</label><select class="coa-product" data-item="${i.id}"><option value="">Choose COA product…</option>${coaProducts.map(x=>`<option value="${x.id}" ${best?.id===x.id?'selected':''}>${esc(x.product_name)}${x.product_code?' — '+esc(x.product_code):''}</option>`).join('')}</select><div class="small">Lot: ${esc(i.lot_numbers||'Not entered')}</div></div>`}).join('');
 $('coaPreviewBtn').onclick=previewCoa;previewCoa();
}
function coaData(){
 const o=orders.find(x=>String(x.id)===$('coaOrder').value),rid=document.querySelector('input[name=coaLine]:checked')?.value,i=o?.order_items?.find(x=>String(x.id)===rid);if(!o||!i)return null;
 const pid=document.querySelector(`.coa-product[data-item="${i.id}"]`)?.value,p=coaProducts.find(x=>String(x.id)===pid),line=parseLine(i.item_text);return{o,i,p,line}
}
function previewCoa(){
 const d=coaData();if(!d)return;const {o,i,p,line}=d;if(!p){$('coaPreview').innerHTML='<div class="notice">Choose the matching COA product.</div>';return}
 $('coaPreview').innerHTML=`<section class="print-doc coa-doc"><h1>Certificate of Analysis</h1><h2>${esc(p.product_name)} ${p.product_code?'<span>'+esc(p.product_code)+'</span>':''}</h2><p><b>Lot Number</b> ${esc(i.lot_numbers||'')}</p><p><b>Qty.</b> ${esc(i.item_text)}</p><p><b>Product Specifications met:</b> YES</p><p>The specifications noted below are the parameters used to confirm product is within formulation standards. All product batches are tested to confirm product specifications are met and batch numbers recorded.</p><h3>Physical Product Specifications:</h3><table class="spec-table"><tr><td>Specific Gravity (H₂O=1):</td><td>${esc(p.specific_gravity||'')}</td></tr><tr><td>Appearance:</td><td>${esc(p.appearance||'')}</td></tr><tr><td>Odor:</td><td>${esc(p.odor||'')}</td></tr><tr><td>pH:</td><td>${esc(p.ph||'')}</td></tr>${(p.specifications||[]).filter(s=>!['specific gravity (h2o=1)','appearance','odor','ph','ph:'].includes(String(s.label||'').toLowerCase())).map(s=>`<tr><td>${esc(s.label)}</td><td>${esc(s.value)}</td></tr>`).join('')}</table><div class="doc-foot">Order: ${esc(o.customer_name)}${o.po_number?' • PO '+esc(o.po_number):''}</div></section>`}
async function saveCoa(){const d=coaData();if(!d?.p)return alert('Choose a COA product first.');const {error}=await sb.from('generated_documents').insert({document_type:'coa',order_id:d.o.id,document_data:{order_item_id:d.i.id,coa_product_id:d.p.id,product_name:d.p.product_name,product_code:d.p.product_code,lot_numbers:d.i.lot_numbers,item_text:d.i.item_text,specs:{specific_gravity:d.p.specific_gravity,appearance:d.p.appearance,odor:d.p.odor,ph:d.p.ph}},created_by:user.id,created_by_email:user.email});alert(error?error.message:'COA snapshot saved.')}
function setupBol(){
 $('bolOrders').innerHTML=orders.map(o=>`<label class="order-pick"><input type="checkbox" value="${o.id}"> <span><b>${esc(o.customer_name)}</b><small>${esc(o.requested_delivery_date||'No date')} • ${esc(o.po_number||o.po_status||'No PO')}</small></span></label>`).join('');
 $('bolOrders').onchange=renderBolLines;$('bolCustomer').innerHTML='<option value="">Choose ship-to…</option>'+customers.map(c=>`<option value="${c.id}">${esc(c.customer_name)} — ${esc(c.city||'')}</option>`).join('');
 $('bolCarrier').innerHTML='<option value="">Choose carrier…</option>'+carriers.map(c=>`<option>${esc(c.carrier_name)}</option>`).join('');
 $('bolDate').value=new Date().toISOString().slice(0,10);$('bolPreviewBtn').onclick=previewBol;$('bolPrint').onclick=()=>window.print();$('bolSave').onclick=saveBol;
}
function selectedOrders(){const ids=[...document.querySelectorAll('#bolOrders input:checked')].map(x=>x.value);return orders.filter(o=>ids.includes(String(o.id)))}
function bestShip(item,container){const q=(item+' '+container).toLowerCase();return shipProducts.find(p=>q.includes((p.item_key||'').toLowerCase())||(p.item_key||'').toLowerCase().includes(item.toLowerCase()))}
function renderBolLines(){
 const os=selectedOrders();if(os.length===1){const match=customers.find(c=>c.customer_name.toLowerCase()===os[0].customer_name.toLowerCase());if(match)$('bolCustomer').value=match.id}
 const rows=[];os.forEach(o=>(o.order_items||[]).forEach(i=>{const l=parseLine(i.item_text),best=bestShip(l.item,l.container);rows.push(`<div class="bol-map-row" data-order="${o.id}" data-item="${i.id}" data-qty="${l.qty}"><div><b>${esc(i.item_text)}</b><small>${esc(o.customer_name)} • Lot ${esc(i.lot_numbers||'')}</small></div><select class="ship-product"><option value="">Choose shipping product…</option>${shipProducts.map(p=>`<option value="${p.id}" ${best?.id===p.id?'selected':''}>${esc(p.item_key)}</option>`).join('')}</select></div>`)}));$('bolLines').innerHTML=rows.join('');}
function bolData(){
 const os=selectedOrders(),c=customers.find(x=>String(x.id)===$('bolCustomer').value);let lines=[];
 document.querySelectorAll('.bol-map-row').forEach(r=>{const o=orders.find(x=>String(x.id)===r.dataset.order),i=o?.order_items?.find(x=>String(x.id)===r.dataset.item),p=shipProducts.find(x=>String(x.id)===r.querySelector('.ship-product').value),qty=+r.dataset.qty||1;if(i&&p)lines.push({order_id:o.id,item_id:i.id,qty,item_text:i.item_text,lot:i.lot_numbers||'',product_id:p.id,item_key:p.item_key,description:p.shipping_description||'',unit_weight:+p.weight_lbs||0,total_weight:qty*(+p.weight_lbs||0)})});
 return{orders:os,customer:c,lines,job:$('bolJob').value.trim(),date:$('bolDate').value,carrier:$('bolCarrier').value,prepaid:$('bolPrepaid').checked,placard_required:$('placardRequired').checked,placard_supplied:$('placardSupplied').checked}
}
function previewBol(){
 const d=bolData();if(!d.orders.length)return alert('Select at least one order.');if(!d.customer)return alert('Choose the ship-to customer/site.');
 const po=[...new Set(d.orders.map(o=>o.po_number).filter(Boolean))].join(', '),total=d.lines.reduce((s,x)=>s+x.total_weight,0);
 $('bolPreview').innerHTML=`<section class="print-doc bol-doc"><div class="bol-title">STRAIGHT BILL OF LADING - SHORT FORM - Original - Not Negotiable</div><div class="bol-head"><div><b>From:</b><br>B & L Neeley Inc.<br>151 W. Fifth St.<br>Ripon, CA 95366</div><div><b>Shipping/Invoice Number:</b> ${esc(d.job)}<br><b>Date:</b> ${esc(d.date)}<br><b>Emergency Phone:</b> (800)255-3924</div></div><div class="bol-head"><div><b>Ship To:</b><br>${esc(d.customer.customer_name)}<br>${esc(d.customer.street1||'')}<br>${esc(d.customer.street2||'')}</div><div><b>Carrier:</b> ${esc(d.carrier)}<br><b>PO:</b> ${esc(po)}<br><b>Prepaid:</b> ${d.prepaid?'YES':'NO'}<br><b>Placard Required:</b> ${d.placard_required?'YES':'NO'} &nbsp; <b>Supplied:</b> ${d.placard_supplied?'YES':'NO'}</div></div><table class="bol-table"><thead><tr><th>Qty</th><th>Shipping Description</th><th>Weight</th><th>Lot Number(s)</th></tr></thead><tbody>${d.lines.map(x=>`<tr><td>${x.qty}</td><td>${esc(x.description)}</td><td>${x.total_weight?x.total_weight.toLocaleString()+' lb':''}</td><td>${esc(x.lot)}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="2"><b>Total</b></td><td><b>${total.toLocaleString()} lb</b></td><td></td></tr></tfoot></table><div class="bol-note">Approved shipping descriptions are pulled from the B&L product master and are not generated by the application.</div></section>`}
async function saveBol(){const d=bolData();if(!d.orders.length||!d.customer||!d.lines.length)return alert('Select orders, ship-to, and map the products first.');const {error}=await sb.from('generated_documents').insert({document_type:'bol',order_id:d.orders[0].id,job_number:d.job||null,document_data:{...d,orders:d.orders.map(o=>({id:o.id,customer_name:o.customer_name,po_number:o.po_number}))},created_by:user.id,created_by_email:user.email});alert(error?error.message:'BOL snapshot saved.')}
function setupMasters(){
 const tabs=[['customers',customers],['shipping',shipProducts],['coa',coaProducts]];$('masterCounts').innerHTML=tabs.map(([n,a])=>`<div class="stat"><b>${a.length}</b><span>${n}</span></div>`).join('');
 $('masterSearch').oninput=renderMasters;$('masterType').onchange=renderMasters;renderMasters();
}
function renderMasters(){const q=($('masterSearch').value||'').toLowerCase(),t=$('masterType').value;let a=t==='customers'?customers:t==='shipping'?shipProducts:coaProducts;a=a.filter(x=>JSON.stringify(x).toLowerCase().includes(q));$('masterList').innerHTML=a.slice(0,250).map(x=>`<div class="master-row"><b>${esc(x.customer_name||x.item_key||x.product_name)}</b><span>${esc(x.city||x.shipping_description||[x.specific_gravity,x.appearance,x.odor,x.ph].filter(Boolean).join(' • '))}</span></div>`).join('')||'<div class="notice">No records yet.</div>'}
init();