import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './config.js';
const sb=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const fmt=d=>d?new Date(d).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'Unknown';
const display=v=>v===null||v===undefined||v===''?'(blank)':typeof v==='object'?JSON.stringify(v):String(v);
let results=[],searchToken=0;
async function start(){
 const {data:{session}}=await sb.auth.getSession();
 if(!session){location.replace('index.html?return=order-history.html');return}
 const {data:a,error}=await sb.from('user_page_access').select('admin_orders').eq('user_id',session.user.id).maybeSingle();
 if(error||!a?.admin_orders){$('historyAuth').textContent='Access denied. Admin Orders permission required.';return}
 $('historyAuth').hidden=true;$('historyApp').hidden=false;
 $('historySearch').addEventListener('input',()=>{clearTimeout(window.historyDebounce);window.historyDebounce=setTimeout(search,280)});
 const id=new URLSearchParams(location.search).get('order');if(id){$('historySearch').value=id;await search();const hit=results.find(x=>String(x.id)===id);if(hit)await show(hit)}
}
async function search(){
 const token=++searchToken,q=$('historySearch').value.trim();
 $('historyResults').innerHTML='';if(!q){$('historyCount').textContent='Enter a search term.';return}
 $('historyCount').textContent='Searching…';
 const safe=q.replace(/[%_,()]/g,' ').trim();if(!safe){$('historyCount').textContent='Enter a customer, PO, or order number.';return}
 let req=sb.from('orders').select('id,customer_name,po_number,created_at,requested_delivery_date,shipped').order('created_at',{ascending:false}).limit(100);
 if(/^\d+$/.test(q))req=req.or('id.eq.'+Number(q)+',po_number.ilike.%'+safe+'%,customer_name.ilike.%'+safe+'%');
 else req=req.or('customer_name.ilike.%'+safe+'%,po_number.ilike.%'+safe+'%');
 const {data,error}=await req;if(token!==searchToken)return;
 if(error){$('historyCount').textContent='Search failed: '+error.message;return}
 results=data||[];$('historyCount').textContent=results.length+' matching orders'+(results.length===100?' (first 100)':'');
 $('historyResults').innerHTML=results.map(o=>'<button class="history-order" data-id="'+o.id+'"><b>#'+o.id+' · '+esc(o.customer_name)+'</b><small>'+esc(o.po_number?'PO '+o.po_number:'No PO')+' · '+esc(o.requested_delivery_date||'No delivery date')+' · '+(o.shipped?'Shipped':'Not shipped')+'</small></button>').join('')||'<p>No matching orders.</p>';
 document.querySelectorAll('.history-order').forEach(b=>b.onclick=()=>{document.querySelectorAll('.history-order').forEach(x=>x.classList.toggle('active',x===b));show(results.find(x=>String(x.id)===b.dataset.id))});
}
const names={customer_name:'Customer',order_text:'Order items',po_number:'PO number',po_status:'PO status',requested_delivery_date:'Requested delivery date',lot_numbers:'Lot numbers',ready_to_ship:'Ready',shipped:'Shipped / delivered',scheduled:'Scheduled',scheduled_pickup_date:'Scheduled pickup date',back_ordered:'Back ordered',delivery_method:'Delivery method',delivery_method_other:'Other delivery method',item_text:'Product / quantity',requires_blending:'Blend required',position:'Line position'};
const ignored=new Set(['updated_at','updated_by','updated_by_email','created_at','created_by','created_by_email','id','order_id']);
function changes(ev){
 const old=ev.old_values||{},next=ev.new_values||{};
 if(ev.action==='insert')return '<li>Record created'+(next.item_text?': '+esc(next.item_text):'')+'</li>';
 if(ev.action==='delete')return '<li>Record deleted'+(old.item_text?': '+esc(old.item_text):'')+'</li>';
 const keys=[...new Set([...Object.keys(old),...Object.keys(next)])].filter(k=>!ignored.has(k)&&JSON.stringify(old[k])!==JSON.stringify(next[k]));
 return keys.map(k=>'<li><b>'+esc(names[k]||k)+'</b>: '+esc(display(old[k]))+' → '+esc(display(next[k]))+'</li>').join('')||'<li>Metadata-only update (no business fields changed)</li>';
}
async function show(o){
 if(!o)return;const box=$('historyDetail');box.innerHTML='<p>Loading order #'+o.id+'…</p>';
 const [orderRes,itemsRes,eventsRes]=await Promise.all([
 sb.from('orders').select('*').eq('id',o.id).single(),
 sb.from('order_items').select('*').eq('order_id',o.id).order('position'),
 sb.from('order_change_log').select('id,order_id,item_id,entity_type,action,changed_at,changed_by_email,old_values,new_values').eq('order_id',o.id).order('changed_at',{ascending:false}).order('id',{ascending:false}).limit(500)
 ]);
 if(orderRes.error||itemsRes.error||eventsRes.error){box.textContent='Could not load history: '+(orderRes.error||itemsRes.error||eventsRes.error).message;return}
 const order=orderRes.data,items=itemsRes.data||[],events=eventsRes.data||[];
 box.innerHTML='<h2>Order #'+o.id+' · '+esc(order.customer_name)+'</h2><p><b>PO:</b> '+esc(order.po_number||'None')+' · <b>Requested:</b> '+esc(order.requested_delivery_date||'None')+' · <b>Status:</b> '+(order.shipped?'Shipped':order.ready_to_ship?'Ready':'Open')+'</p><p><b>Items:</b> '+(items.map(i=>esc(i.item_text)+' (Lot: '+esc(i.lot_numbers||'Not entered')+')').join('; ')||'None')+'</p><p class="history-status"><b>Created:</b> '+esc(fmt(order.created_at))+' by '+esc(order.created_by_email||'Unknown')+'<br><b>Last order update:</b> '+esc(fmt(order.updated_at))+' by '+esc(order.updated_by_email||'Unknown')+'</p><hr><h2>Recorded change log</h2><p class="history-muted">'+events.length+' event(s)'+(events.length===500?' (showing latest 500)':'')+' · Newest first</p>'+(events.length?events.map(ev=>'<div class="history-event"><small>'+esc(fmt(ev.changed_at))+' · '+esc(ev.changed_by_email||'Unknown user')+'</small><h3>'+esc(ev.action==='insert'?'Created':ev.action==='delete'?'Deleted':'Updated')+' '+(ev.entity_type==='order_items'?'order item'+(ev.item_id?' #'+ev.item_id:''):'order')+'</h3><ul>'+changes(ev)+'</ul></div>').join(''):'<div class="history-note">No audit events recorded for this order yet. This does not mean the order was never edited.</div>');
}
start().catch(e=>{$('historyAuth').textContent='Could not load: '+e.message});