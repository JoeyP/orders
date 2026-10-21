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
 $('historyAuth').hidden=true;$('historyApp').hidden=false;setupActivity();
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
/* Cross-order audit feed; existing per-order history is unchanged. */
let activityOffset=0,activityToken=0,activityLoaded=false,activityBusy=false;
const pacific=d=>d?new Date(d).toLocaleString('en-US',{timeZone:'America/Los_Angeles',dateStyle:'medium',timeStyle:'short'}):'Unknown';
function dayPacific(offset=0){
 const d=new Date(Date.now()+offset*86400000);
 return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
}
function pacificMidnight(day){
 const utc=Date.parse(day+'T00:00:00Z');
 const fmt=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',timeZoneName:'shortOffset',hour:'2-digit'});
 const zone=fmt.formatToParts(new Date(utc)).find(p=>p.type==='timeZoneName')?.value||'GMT-8';
 const m=zone.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
 const minutes=m?(m[1]==='+'?1:-1)*(Number(m[2])*60+Number(m[3]||0)):-480;
 return new Date(utc-minutes*60000).toISOString();
}
function nextDay(day){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)}
function setupActivity(){
 const open=which=>{
  const activity=which==='activity';
  $('orderHistoryView').hidden=activity;$('activityView').hidden=!activity;
  $('tabOrders').classList.toggle('active',!activity);$('tabActivity').classList.toggle('active',activity);
  if(activity&&!activityLoaded){activityLoaded=true;loadActivity(false)}
 };
 $('tabOrders').onclick=()=>open('orders');$('tabActivity').onclick=()=>open('activity');
 const refresh=()=>{clearTimeout(window.activityDebounce);window.activityDebounce=setTimeout(()=>loadActivity(false),300)};
 ['activityUser','activityAction','activityDates','activityFrom','activityTo'].forEach(id=>$(id).addEventListener('change',()=>{
  if(id==='activityDates'){const custom=$('activityDates').value==='custom';$('activityFrom').hidden=!custom;$('activityTo').hidden=!custom}
  refresh();
 }));
 $('activitySearch').addEventListener('input',refresh);
 $('activityRefresh').onclick=()=>loadActivity(false);
 $('activityMore').onclick=()=>loadActivity(true);$('activityExport').onclick=exportActivity;
}
async function activityQuery(from,to){
 const query=$('activitySearch').value.trim();
 let ids=null;
 if(query){
  const safe=query.replace(/[%_,()]/g,' ').trim();
  if(!safe)throw Error('Enter a customer, PO, or order number.');
  let match=sb.from('orders').select('id').limit(1000);
  if(/^\d+$/.test(query))match=match.or('id.eq.'+Number(query)+',po_number.ilike.%'+safe+'%,customer_name.ilike.%'+safe+'%');
  else match=match.or('customer_name.ilike.%'+safe+'%,po_number.ilike.%'+safe+'%');
  const res=await match;if(res.error)throw res.error;
  ids=(res.data||[]).map(o=>o.id);
  if(!ids.length)return [];
 }
 let req=sb.from('order_change_log').select('id,order_id,item_id,entity_type,action,changed_at,changed_by_email,old_values,new_values')
   .order('changed_at',{ascending:false}).order('id',{ascending:false}).range(from,to);
 if(ids)req=req.in('order_id',ids);
 if($('activityUser').value)req=req.eq('changed_by_email',$('activityUser').value);
 if($('activityAction').value)req=req.eq('action',$('activityAction').value);
 const dateFilter=$('activityDates').value;
 if(dateFilter==='today'||dateFilter==='yesterday'){
  const d=dayPacific(dateFilter==='today'?0:-1);
  req=req.gte('changed_at',pacificMidnight(d)).lt('changed_at',pacificMidnight(nextDay(d)));
 }else if(dateFilter==='7')req=req.gte('changed_at',new Date(Date.now()-7*86400000).toISOString());
 else if(dateFilter==='custom'){
  if($('activityFrom').value)req=req.gte('changed_at',pacificMidnight($('activityFrom').value));
  if($('activityTo').value)req=req.lt('changed_at',pacificMidnight(nextDay($('activityTo').value)));
 }
 const {data,error}=await req;if(error)throw error;return data||[];
}
const csvCell=v=>'"'+String(v??'').replace(/"/g,'""').replace(/^[=+@-]/,m=>'\t'+m)+'"';
async function exportActivity(){
 const button=$('activityExport');button.disabled=true;
 const original=button.textContent;button.textContent='Preparing CSV…';
 try{
  const all=[];const max=20000;
  for(let offset=0;offset<max;offset+=500){
   const batch=await activityQuery(offset,offset+499);
   all.push(...batch);button.textContent='Preparing CSV… '+all.length;
   if(batch.length<500)break;
  }
  const ids=[...new Set(all.map(e=>e.order_id).filter(Boolean))],orderMap=new Map();
  for(let i=0;i<ids.length;i+=250){
   const {data,error}=await sb.from('orders').select('id,customer_name,po_number').in('id',ids.slice(i,i+250));
   if(error)throw error;(data||[]).forEach(o=>orderMap.set(o.id,o));
  }
  const header=['Date & Time (Pacific)','User','Order #','Customer','PO','Action','Record Type','Item ID','Changes','Event ID'];
  const rows=all.map(ev=>{
   const o=orderMap.get(ev.order_id),old=ev.old_values||{},next=ev.new_values||{};
   const changed=[...new Set([...Object.keys(old),...Object.keys(next)])].filter(k=>!ignored.has(k)&&JSON.stringify(old[k])!==JSON.stringify(next[k]));
   const details=ev.action==='insert'?'Record created'+(next.item_text?': '+next.item_text:''):ev.action==='delete'?'Record deleted'+(old.item_text?': '+old.item_text:''):changed.map(k=>(names[k]||k)+': '+display(old[k])+' -> '+display(next[k])).join(' | ')||'Metadata-only update';
   return [pacific(ev.changed_at),ev.changed_by_email||'Unknown',ev.order_id,o?.customer_name||'',o?.po_number||'',ev.action,ev.entity_type,ev.item_id||'',details,ev.id];
  });
  const csv='\uFEFF'+[header,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='order-activity-'+dayPacific()+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
  $('activityStatus').textContent='Exported '+rows.length+' matching activity records.'+(rows.length===max?' Export limited to 20,000 records; narrow the date filters for older activity.':'');
 }catch(e){$('activityStatus').textContent='CSV export failed: '+e.message}
 finally{button.disabled=false;button.textContent=original}
}
async function loadActivity(more){
 if(activityBusy&&more)return;
 const token=++activityToken;activityBusy=true;
 if(!more){activityOffset=0;$('activityEntries').innerHTML=''}
 $('activityStatus').textContent='Loading activity…';$('activityMore').hidden=true;
 try{
  const data=await activityQuery(activityOffset,activityOffset+99);if(token!==activityToken)return;
  const events=data||[],orderIds=[...new Set(events.map(e=>e.order_id).filter(Boolean))];
  const {data:orders,error:orderError}=orderIds.length?await sb.from('orders').select('id,customer_name,po_number').in('id',orderIds):{data:[]};
  if(orderError)throw orderError;
  const byId=new Map((orders||[]).map(o=>[o.id,o]));
  $('activityEntries').insertAdjacentHTML('beforeend',events.map(ev=>{
   const o=byId.get(ev.order_id);
   const action=ev.action==='insert'?'Created':ev.action==='delete'?'Deleted':'Updated';
   const target=ev.entity_type==='order_items'?'product line':'order';
   return '<details class="activity-entry"><summary><b>'+esc(pacific(ev.changed_at))+'</b> · '+esc(ev.changed_by_email||'Unknown user')+' · <b>'+action+' '+target+'</b> · <a href="order-history.html?order='+encodeURIComponent(ev.order_id)+'">Order #'+esc(ev.order_id)+'</a> · '+esc(o?.customer_name||'Customer unavailable')+'</summary><small>PO: '+esc(o?.po_number||'—')+' · '+esc(ev.entity_type)+' · Event #'+esc(ev.id)+'</small><ul>'+changes(ev)+'</ul><a href="order-history.html?order='+encodeURIComponent(ev.order_id)+'">View order history</a></details>';
  }).join(''));
  activityOffset+=events.length;
  $('activityStatus').textContent=activityOffset+' event(s) loaded'+(events.length===100?' · More available':'');
  $('activityMore').hidden=events.length<100;
  if(!activityOffset)$('activityEntries').innerHTML='<p>No recorded activity matches these filters.</p>';
  if(!more&& !$('activityUser').dataset.loaded){
   const users=await sb.from('order_change_log').select('changed_by_email').not('changed_by_email','is',null).order('changed_at',{ascending:false}).limit(1000);
   if(!users.error){const unique=[...new Set((users.data||[]).map(e=>e.changed_by_email).filter(Boolean))].sort();$('activityUser').insertAdjacentHTML('beforeend',unique.map(u=>'<option value="'+esc(u)+'">'+esc(u)+'</option>').join(''));$('activityUser').dataset.loaded='1'}
  }
 }catch(e){if(token===activityToken)$('activityStatus').textContent='Could not load activity: '+e.message}
 finally{if(token===activityToken)activityBusy=false}
}
