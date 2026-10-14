import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './config.js';
const sb=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
let user,orders=[];
function line(s){const m=String(s||'').trim().match(/^(\d+(?:\.\d+)?)\s*(?:[-xX×]\s*|\(\s*)?(\d+(?:\.\d+)?)\s*(?:gallons?|gal|g)?\s*\)?\s*(.*)$/i);return m?{qty:m[1],container:m[2],product:m[3]}:{qty:'—',container:'—',product:String(s||'')}}
function method(o){return o.delivery_method==='bl_neeley'?'B&L Neeley Delivery':o.delivery_method==='lje'?'LJE Shipping':o.delivery_method==='other'?(o.delivery_method_other?'Other — '+o.delivery_method_other:'Other'):'Delivery method not set'}
function date(s){if(!s)return 'No requested date';const [y,m,d]=s.split('-');return m+'/'+d+'/'+y}
async function init(){
 const {data:{session}}=await sb.auth.getSession();user=session?.user;
 if(!user){location.href='index.html?return=shipping-documents.html';return}
 const {data:a,error}=await sb.from('user_page_access').select('shipping_documents').eq('user_id',user.id).maybeSingle();
 if(error||!a?.shipping_documents){$('shippingGate').textContent='Access denied. Shipping Documents permission is required.';return}
 $('shippingGate').style.display='none';$('shippingApp').style.display='';
 document.querySelector('.logout').onclick=async e=>{e.preventDefault();await sb.auth.signOut();location.href='index.html'};
 $('shippingSearch').oninput=render;$('shippingFilter').onchange=render;$('shippingRefresh').onclick=load;
 await load();
}
async function load(){
 $('shippingMessage').textContent='Loading orders…';
 const {data,error}=await sb.from('orders').select('id,customer_name,po_number,po_status,requested_delivery_date,order_text,delivery_method,delivery_method_other,ready_to_ship,shipped,documents_complete,created_at,updated_at,order_items(item_text,lot_numbers,position)').eq('ready_to_ship',true).order('requested_delivery_date',{ascending:true}).limit(1000);
 if(error){$('shippingMessage').textContent='Could not load orders: '+error.message;return}
 orders=data||[];$('shippingMessage').textContent='';render();
}
function render(){
 const q=$('shippingSearch').value.trim().toLowerCase(),f=$('shippingFilter').value;
 const list=orders.filter(o=>{
 const done=o.shipped||o.documents_complete;
 if(f==='active'&&done)return false;
 if(f==='completed'&&!done)return false;
 return !q||[o.customer_name,o.po_number,o.order_text,o.requested_delivery_date,o.delivery_method,o.delivery_method_other,...(o.order_items||[]).flatMap(i=>[i.item_text,i.lot_numbers])].join(' ').toLowerCase().includes(q);
 });
 if(f==='completed')list.sort((a,b)=>String(b.updated_at||b.created_at).localeCompare(String(a.updated_at||a.created_at)));
 $('shippingCount').textContent=list.length;
 $('shippingList').innerHTML=list.map(o=>{
 const done=o.shipped||o.documents_complete;
 const items=(o.order_items||[]).sort((a,b)=>a.position-b.position).map(i=>{const p=line(i.item_text);return '<div class="delivery-item"><div class="delivery-item-product">'+esc(p.product)+'</div><div class="delivery-item-detail"><span class="delivery-item-label">Qty</span><strong>'+esc(p.qty)+'</strong></div><div class="delivery-item-detail"><span class="delivery-item-label">Container</span><strong>'+esc(p.container)+'</strong></div><div class="delivery-item-detail delivery-item-lot"><span class="delivery-item-label">Lot</span><strong>'+esc(i.lot_numbers||'—')+'</strong></div></div>'}).join('');
 return '<article class="delivery-order '+(done?'gray':'green')+'"><div class="delivery-order-header"><div class="delivery-order-main"><div class="delivery-order-date">'+esc(date(o.requested_delivery_date))+'</div><div class="delivery-order-customer">'+esc(o.customer_name)+'</div><div class="delivery-order-po">'+esc(o.po_number?'PO: '+o.po_number:o.po_status||'No PO')+'</div><div class="delivery-order-po">Delivery Method: '+esc(method(o))+'</div></div><div class="delivery-status '+(done?'is-shipped':'is-ready')+'">'+(o.shipped?'SHIPPED':done?'COMPLETE':'READY')+'</div></div><div class="delivery-items">'+(items||'<div class="delivery-no-items">'+esc(o.order_text||'No order items')+'</div>')+'</div><label class="delivery-complete"><input type="checkbox" data-document-order="'+o.id+'" '+(done?'checked':'')+' '+(o.shipped?'disabled':'')+'><span>'+(o.shipped?'Documents Complete (shipped)':'Documents Complete')+'</span></label></article>';
 }).join('')||'<div class="delivery-empty">No orders match this view.</div>';
 $('shippingList').querySelectorAll('[data-document-order]').forEach(cb=>cb.onchange=async()=>{
 const checked=cb.checked;cb.disabled=true;
 const {error}=await sb.from('orders').update({documents_complete:checked,updated_by:user.id,updated_by_email:user.email||null}).eq('id',Number(cb.dataset.documentOrder)).eq('shipped',false).select('id');
 if(error){cb.checked=!checked;cb.disabled=false;alert(error.message);return}
 await load();
 });
}
init().catch(e=>{$('shippingGate').textContent='Could not load Shipping Documents: '+e.message});
