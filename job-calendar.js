import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './config.js';
const db=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id),today=()=>dateKey(new Date()),pad=n=>String(n).padStart(2,'0');
const dateKey=d=>[d.getFullYear(),pad(d.getMonth()+1),pad(d.getDate())].join('-');
const parse=s=>new Date(s+'T12:00:00'),addDays=(s,n)=>{let d=parse(s);d.setDate(d.getDate()+n);return dateKey(d)};
const diff=(a,b)=>Math.round((parse(b)-parse(a))/86400000);
const fmt=s=>parse(s).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const types={trial:'Chemical Trial',startup:'Startup',shutdown:'Shutdown',service:'Service Visit',installation:'Installation',other:'Other'};
let user,access,people=[],records=[],events=[],mode='calendar',anchor=parse(today()),editing=null,viewing=null,range={start:'',end:''},loading=false;
function show(msg){$('message').textContent=msg||''}
function assigned(o){return (o.assignees||[]).map(id=>people.find(p=>p.user_id===id)?.display_name).filter(Boolean).join(', ')}
function duration(o){return Math.max(0,diff(o.start_date,o.end_date))}
function moveMonth(date,n){const d=new Date(date);d.setDate(1);d.setMonth(d.getMonth()+n);return d}
function shiftMonth(s,n){const d=parse(s),day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+n);const month=d.getMonth();d.setDate(Math.min(day,new Date(d.getFullYear(),month+1,0).getDate()));return dateKey(d)}
function shiftYear(s,n){const d=parse(s),day=d.getDate(),month=d.getMonth();d.setDate(1);d.setFullYear(d.getFullYear()+n);d.setMonth(month);d.setDate(Math.min(day,new Date(d.getFullYear(),month+1,0).getDate()));return dateKey(d)}
function advance(s,rule){return rule==='daily'?addDays(s,1):rule==='weekly'?addDays(s,7):rule==='monthly'?shiftMonth(s,1):shiftYear(s,1)}
function expand(start,end){
 const overrides=new Map(records.filter(x=>x.parent_id).map(x=>[x.parent_id+':'+x.occurrence_date,x]));
 const output=[];
 for(const r of records.filter(x=>!x.parent_id)){
  const push=(s)=>{
   const override=overrides.get(r.id+':'+s);
   if(override){if(override.status!=='cancelled'||override.title!==r.title)output.push({...override,instance:s,series:r});else output.push({...override,instance:s,series:r});return;}
   const shift=diff(r.start_date,s);
   output.push({...r,start_date:s,end_date:addDays(r.end_date,shift),instance:s,series:r});
  };
  if(r.recurrence==='none'){if(r.end_date>=start&&r.start_date<=end)push(r.start_date);continue}
  let s=r.start_date,limit=0;
  while(s<=end&&(!r.recurrence_until||s<=r.recurrence_until)&&limit++<2000){
   if(addDays(s,duration(r))>=start)push(s);
   const next=advance(s,r.recurrence);
   if(next<=s)break;
   s=next;
  }
 }
 return output.filter(x=>x.end_date>=start&&x.start_date<=end).sort((a,b)=>a.start_date.localeCompare(b.start_date)||(a.start_time||'').localeCompare(b.start_time||'')||a.customer.localeCompare(b.customer));
}
function visible(){
 const emp=$('employeeFilter').value,customer=$('customerFilter').value,status=$('statusFilter').value;
 return events.filter(x=>(!emp||(x.assignees||[]).includes(emp))&&(!customer||x.customer===customer)&&(!status||x.status===status));
}
function getRange(){
 const d=new Date(anchor);
 if(mode==='list'){return {start:addDays(today(),-366),end:addDays(today(),730)}}
 if($('calendarMode').value==='week'){const weekday=(d.getDay()+6)%7;const s=addDays(dateKey(d),-weekday);return {start:s,end:addDays(s,6)}}
 const s=dateKey(new Date(d.getFullYear(),d.getMonth(),1));
 const e=dateKey(new Date(d.getFullYear(),d.getMonth()+1,0));
 return {start:addDays(s,-((parse(s).getDay()+6)%7)),end:addDays(e,6-((parse(e).getDay()+6)%7))};
}
function refreshFilters(){
 const old=$('customerFilter').value;
 const names=[...new Set(records.filter(x=>!x.parent_id).map(x=>x.customer))].sort((a,b)=>a.localeCompare(b));
 $('customerFilter').innerHTML='<option value="">All Customers</option>'+names.map(x=>'<option value="'+safe(x)+'">'+safe(x)+'</option>').join('');
 if(names.includes(old))$('customerFilter').value=old;
 $('knownCustomers').innerHTML=names.map(x=>'<option value="'+safe(x)+'"></option>').join('');
}
async function reload(){
 if(loading)return;loading=true;
 try{
  const {data,error}=await db.from('job_calendar').select('*').order('start_date',{ascending:true}).limit(5000);
  if(error)throw error;records=data||[];refreshFilters();render();show('Updated '+new Date().toLocaleTimeString());
 }catch(e){show('Unable to load calendar: '+e.message)}finally{loading=false}
}
function render(){
 range=getRange();events=expand(range.start,range.end);
 $('calendarView').classList.toggle('hidden',mode!=='calendar');$('listView').classList.toggle('hidden',mode!=='list');
 $('calendarTab').classList.toggle('primary',mode==='calendar');$('listTab').classList.toggle('primary',mode==='list');
 if(mode==='list')return renderList();
 const isWeek=$('calendarMode').value==='week',days=isWeek?7:diff(range.start,range.end)+1;
 $('periodTitle').textContent=isWeek?fmt(range.start)+' – '+fmt(range.end):anchor.toLocaleDateString(undefined,{month:'long',year:'numeric'});
 const list=visible(),head=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x=>'<div class="jc-dayhead">'+x+'</div>').join('');
 let html=head;
 for(let i=0;i<days;i++){
  const day=addDays(range.start,i),d=parse(day),other=d.getMonth()!==anchor.getMonth()&&!isWeek;
  const items=list.filter(x=>x.start_date<=day&&x.end_date>=day);
  html+='<div class="jc-day'+(other?' other':'')+(day===today()?' today':'')+'"><button type="button" class="jc-date" data-new="'+day+'">'+d.getDate()+'</button>'+items.slice(0,5).map(x=>'<button type="button" class="jc-chip '+x.job_type+' '+x.status+'" data-job="'+x.id+'" data-instance="'+x.instance+'">'+safe(x.customer)+' · '+safe(x.title)+'</button>').join('')+(items.length>5?'<div class="small">+'+(items.length-5)+' more</div>':'')+'</div>';
 }
 $('calendarGrid').innerHTML=html;
}
function renderList(){
 const rangeType=$('listRange').value,now=today();
 let list=visible().filter(x=>rangeType==='all'||(rangeType==='past'?x.end_date<now:x.end_date>=now));
 if(rangeType==='past')list.reverse();
 $('listCount').textContent=list.length+' jobs in displayed date range';
 $('jobList').innerHTML=list.length?list.map(x=>'<button class="jc-card" type="button" data-job="'+x.id+'" data-instance="'+x.instance+'"><div><strong>'+safe(x.customer)+' — '+safe(x.title)+'</strong><span class="small">'+fmt(x.start_date)+(x.end_date!==x.start_date?' – '+fmt(x.end_date):'')+(x.start_time?' · '+safe(x.start_time.slice(0,5)):' · Time TBD')+'</span><span class="small">'+safe(x.location||'')+' · '+safe(types[x.job_type]||'Other')+' · '+safe(x.status)+'</span>'+(assigned(x)?'<span class="small">Assigned: '+safe(assigned(x))+'</span>':'')+(x.notes?'<span class="small">'+safe(x.notes.slice(0,140))+'</span>':'')+'</div><span>›</span></button>').join(''):'<div class="jc-list-empty">No jobs match these filters.</div>';
}
function resetForm(){
 $('jobForm').reset();$('jobStart').value=today();$('jobEnd').value='';$('jobType').value='other';$('jobRepeat').value='none';$('jobStatus').value='scheduled';$('formError').textContent='';
 $('deleteJob').classList.add('hidden');$('seriesControls').classList.add('hidden');
 editing=null;
}
function openJob(o=null,day=null){
 resetForm();
 if(o){
  editing=o;
  $('formHeading').textContent='Edit Job';
  for(const [id,key] of [['jobCustomer','customer'],['jobLocation','location'],['jobTitle','title'],['jobStart','start_date'],['jobEnd','end_date'],['jobTime','start_time'],['jobEndTime','end_time'],['jobType','job_type'],['jobStatus','status'],['jobNotes','notes']])$(id).value=o[key]||'';
  if(o.end_date===o.start_date)$('jobEnd').value='';
  $('jobRepeat').value=o.series?.recurrence||'none';$('jobRepeatUntil').value=o.series?.recurrence_until||'';
  $('jobAssignees').querySelectorAll('input[type=checkbox]').forEach(opt=>opt.checked=(o.assignees||[]).includes(opt.value));
  $('deleteJob').classList.remove('hidden');
  if(o.series?.recurrence!=='none')$('seriesControls').classList.remove('hidden');
 }else if(day){$('jobStart').value=day;$('jobEnd').value=''}
 $('jobDialog').showModal();
}
function values(){
 const v={customer:$('jobCustomer').value.trim(),location:$('jobLocation').value.trim(),title:$('jobTitle').value.trim(),start_date:$('jobStart').value,end_date:$('jobEnd').value||$('jobStart').value,start_time:$('jobTime').value||null,end_time:$('jobEndTime').value||null,job_type:$('jobType').value,status:$('jobStatus').value,notes:$('jobNotes').value.trim(),assignees:[...$('jobAssignees').querySelectorAll('input:checked')].map(x=>x.value),recurrence:$('jobRepeat').value,recurrence_until:$('jobRepeatUntil').value||null};
 if(!v.customer||!v.title||!v.start_date)throw Error('Customer, title and start date are required.');
 if(v.end_date<v.start_date)throw Error('End date must be on or after start date.');
 if(v.recurrence!=='none'&&v.recurrence_until&&v.recurrence_until<v.start_date)throw Error('Repeat-until must be on or after the start date.');
 if(v.start_date===v.end_date&&v.start_time&&v.end_time&&v.end_time<v.start_time)throw Error('End time must not precede start time.');
 return v;
}
function completion(v,previous){
 return v.status==='completed'?{completed_at:previous?.status==='completed'?(previous.completed_at||new Date().toISOString()):new Date().toISOString(),completed_by:user.id}:{completed_at:null,completed_by:null};
}
async function upsert(v,id=null){
 const payload={...v,...completion(v,editing),updated_by:user.id};
 if(id){const {error}=await db.from('job_calendar').update(payload).eq('id',id);if(error)throw error;return id}
 const {data,error}=await db.from('job_calendar').insert({...payload,created_by:user.id}).select('id').single();if(error)throw error;return data.id;
}
async function save(e){
 e.preventDefault();const btn=$('saveJob');btn.disabled=true;$('formError').textContent='';
 try{
  const v=values();
  if(!editing){await upsert(v)}
  else if(editing.series?.recurrence==='none'){await upsert({...v,recurrence:'none',recurrence_until:null},editing.id)}
  else {
   const master=editing.series,scope=$('editScope').value,occ=editing.instance;
   if(scope==='series'){
    const delta=diff(editing.start_date,v.start_date);
    const start=addDays(master.start_date,delta),end=addDays(master.end_date,delta);
    await upsert({...v,start_date:start,end_date:end,recurrence:v.recurrence,recurrence_until:v.recurrence_until},master.id);
   }else if(scope==='future'){
    if(occ===master.start_date){
     await upsert(v,master.id);
    }else{
     const prior=addDays(occ,-1);
     const {error}=await db.from('job_calendar').update({recurrence_until:prior,updated_by:user.id}).eq('id',master.id);if(error)throw error;
     await upsert(v);
    }
   }else{
    const patch={...v,recurrence:'none',recurrence_until:null,parent_id:master.id,occurrence_date:occ};
    const prior=records.find(x=>x.parent_id===master.id&&x.occurrence_date===occ);
    await upsert(patch,prior?.id||null);
   }
  }
  $('jobDialog').close();await reload();
 }catch(err){$('formError').textContent=err.message}finally{btn.disabled=false}
}
async function remove(){
 if(!editing)return;
 const recurring=editing.series?.recurrence!=='none';
 const scope=recurring?$('editScope').value:'series';
 if(!confirm('Delete '+(scope==='one'?'this occurrence':scope==='future'?'this and future occurrences':'this job / series')+'?'))return;
 try{
  if(!recurring||scope==='series'){
   const {error}=await db.from('job_calendar').delete().eq('id',recurring?editing.series.id:editing.id);if(error)throw error;
  }else if(scope==='future'){
   const m=editing.series;
   if(editing.instance===m.start_date){const {error}=await db.from('job_calendar').delete().eq('id',m.id);if(error)throw error}
   else{const {error}=await db.from('job_calendar').update({recurrence_until:addDays(editing.instance,-1),updated_by:user.id}).eq('id',m.id);if(error)throw error}
  }else{
   const m=editing.series,existing=records.find(x=>x.parent_id===m.id&&x.occurrence_date===editing.instance);
   const patch={customer:m.customer,location:m.location,title:m.title,notes:m.notes,job_type:m.job_type,status:'cancelled',start_date:editing.instance,end_date:addDays(editing.instance,duration(m)),assignees:m.assignees,recurrence:'none',parent_id:m.id,occurrence_date:editing.instance,updated_by:user.id};
   if(existing){const {error}=await db.from('job_calendar').update(patch).eq('id',existing.id);if(error)throw error}
   else{const {error}=await db.from('job_calendar').insert({...patch,created_by:user.id});if(error)throw error}
  }
  $('jobDialog').close();await reload();
 }catch(e){$('formError').textContent=e.message}
}
function openDetails(o){
 viewing=o;
 const row=(label,value)=>'<div class="jc-detail"><span class="jc-detail-label">'+safe(label)+'</span><div class="jc-detail-value">'+safe(value||'—')+'</div></div>';
 const dates=fmt(o.start_date)+(o.end_date!==o.start_date?' – '+fmt(o.end_date):'');
 const time=o.start_time?o.start_time.slice(0,5)+(o.end_time?' – '+o.end_time.slice(0,5):''):'Time not specified';
 $('jobDetails').innerHTML=row('Customer',o.customer)+row('Location / Facility',o.location)+row('Job',o.title)+row('Date',dates)+row('Time',time)+row('Type',types[o.job_type]||'Other')+row('Status',o.status)+row('Assigned Employees',assigned(o))+row('Repeats',o.series?.recurrence==='none'?'No':o.series.recurrence)+row('Notes',o.notes);
 $('viewDialog').showModal();
}
function clickJob(e){
 const newBtn=e.target.closest('[data-new]');if(newBtn){openJob(null,newBtn.dataset.new);return}
 const btn=e.target.closest('[data-job]');if(!btn)return;
 const event=events.find(x=>String(x.id)===btn.dataset.job&&x.instance===btn.dataset.instance);
 if(event)openDetails(event);
}
function setup(){
 $('closeView').onclick=$('viewClose').onclick=()=>$('viewDialog').close();
 $('viewEdit').onclick=()=>{if(!viewing)return;const item=viewing;$('viewDialog').close();openJob(item)};
 $('addJob').onclick=()=>openJob();$('closeDialog').onclick=$('cancelJob').onclick=()=>$('jobDialog').close();
 $('jobForm').onsubmit=save;$('deleteJob').onclick=remove;
 $('calendarGrid').onclick=clickJob;$('jobList').onclick=clickJob;
 $('calendarTab').onclick=()=>{mode='calendar';render()};
 $('listTab').onclick=()=>{mode='list';render()};
 $('calendarMode').onchange=render;$('listRange').onchange=render;
 for(const id of ['employeeFilter','customerFilter','statusFilter'])$(id).onchange=render;
 $('prev').onclick=()=>{anchor=$('calendarMode').value==='week'?parse(addDays(dateKey(anchor),-7)):moveMonth(anchor,-1);render()};
 $('next').onclick=()=>{anchor=$('calendarMode').value==='week'?parse(addDays(dateKey(anchor),7)):moveMonth(anchor,1);render()};
 $('today').onclick=()=>{anchor=parse(today());render()};
 $('logout').onclick=async e=>{e.preventDefault();await db.auth.signOut();location.reload()};
 $('loginForm').onsubmit=async e=>{e.preventDefault();const f=e.target;const {error}=await db.auth.signInWithPassword({email:f.email.value,password:f.password.value});$('loginError').textContent=error?.message||'';if(!error)await boot()};
}
async function boot(){
 const {data:{user:u}}=await db.auth.getUser();user=u;
 document.querySelector('[data-auth="login"]').classList.toggle('hidden',!!user);
 document.querySelector('[data-auth="app"]').classList.toggle('hidden',!user);
 if(!user)return;
 const {data:a,error}=await db.from('user_page_access').select('job_calendar').eq('user_id',user.id).maybeSingle();
 if(error||!a?.job_calendar){document.querySelector('[data-auth="app"]').innerHTML='<div class="card"><h2>Access Denied</h2><p>Ask an administrator to enable Job Calendar in User Access.</p><a href="index.html">Return Home</a></div>';return}
 const {data:p,error:peopleError}=await db.from('job_calendar_employees').select('user_id,display_name').order('display_name');
 if(peopleError)show('Employee names unavailable: '+peopleError.message);
 people=p||[];
 $('employeeFilter').innerHTML='<option value="">All Employees</option>'+people.map(x=>'<option value="'+safe(x.user_id)+'">'+safe(x.display_name)+'</option>').join('');
 $('jobAssignees').innerHTML=people.length?people.map(x=>'<label><input type="checkbox" value="'+safe(x.user_id)+'"><span>'+safe(x.display_name)+'</span></label>').join(''):'<span class="small">No employees available</span>';
 await reload();
}
setup();await boot();
