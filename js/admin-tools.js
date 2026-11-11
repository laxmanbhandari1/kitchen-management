/* Leadership dashboard: shared templates, food-age review, summary and audit history. */
(() => {
 const $ = id => document.getElementById(id);
 const privileged = () => ['boss','developer'].includes(window.currentUserRole);
 const leadership = () => ['manager','boss','developer'].includes(window.currentUserRole);
 const read = (key, fallback={}) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (_) { return fallback; } };
 const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const dateKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 const dayAge = value => { if(!value) return null; const d=new Date(`${value}T12:00:00`); if(Number.isNaN(d.getTime()))return null; return Math.floor((new Date(`${dateKey(new Date())}T12:00:00`)-d)/86400000); };
 async function loadTemplates(){
  if(!window.supabaseClient)return;
  const {data,error}=await window.supabaseClient.from('checklist_templates').select('*').eq('active',true).order('station').order('checklist').order('sort_order');
  const host=$('template-list'); if(!host)return;
  if(error){host.textContent='Could not load shared templates: '+error.message;return;}
  host.innerHTML=(data||[]).map(x=>`<div class="feature-list-item"><span><b>${esc(x.station)} · ${esc(x.checklist)}</b><br>${esc(x.item_text)}</span><button type="button" class="profile-secondary-button danger" data-retire="${esc(x.id)}">Remove</button></div>`).join('')||'<p class="feature-help">No custom checklist items added yet.</p>';
  host.querySelectorAll('[data-retire]').forEach(b=>b.onclick=async()=>{const {error}=await window.supabaseClient.from('checklist_templates').update({active:false,updated_by:window.currentUserId}).eq('id',b.dataset.retire);if(error)alert(error.message);else loadTemplates();});
 }
 function stockAgeEntries(){
  const all=read('shell.dailyStock.v1',{}),dates=Object.keys(all).filter(d=>d<=dateKey(new Date())).sort().reverse();
  const catalog=typeof STOCK_ITEMS!=='undefined'?STOCK_ITEMS:[],ids=new Set([...catalog.map(x=>x.id),...dates.flatMap(d=>Object.keys(all[d]||{}))]),found=[];
  ids.forEach(id=>{
   const product=catalog.find(x=>x.id===id);let latest=null;
   for(const recordDate of dates){if(all[recordDate]?.[id]){latest={recordDate,item:all[recordDate][id]};break;}}
   if(!latest)return;
   const quantity=Number(latest.item.cooked??product?.cooked??0);if(quantity<=0)return;
   let cookedDate=latest.item.cookedDate||'';
   if(!cookedDate){for(const recordDate of dates){const older=all[recordDate]?.[id];if(older?.cookedDate){cookedDate=older.cookedDate;break;}}}
   const age=dayAge(cookedDate);if(age!==null&&age>6)found.push({recordDate:latest.recordDate,id,item:{...latest.item,cookedDate,cooked:quantity},age});
  });
  return found.sort((a,b)=>b.age-a.age);
 }
 function renderCookedAgeReview(){
  const host=$('cooked-age-review-list');if(!host)return;
  if(!leadership()){host.innerHTML='<p class="feature-help">Leadership access required.</p>';return;}
  const entries=stockAgeEntries();
  host.innerHTML=entries.length?entries.map(({recordDate,id,item,age})=>{
   const product=(typeof STOCK_ITEMS!=='undefined'?STOCK_ITEMS:[]).find(x=>x.id===id),name=product?.name||id;
   const review=item.ageReviewDate===item.cookedDate?item.ageReview||'pending':'pending';
   return `<article class="feature-item cooked-age-item"><div class="feature-item-main"><div class="feature-item-title">${esc(name)} · ${age} days old</div><div class="feature-item-note">Cooked: ${esc(item.cookedDate)} · Stock record: ${esc(recordDate)} · Quantity: ${esc(item.cooked)} ${esc(item.prepUnit||product?.prepUnit||'')}</div><div class="age-review-status ${review}">${review==='danger'?'Marked DANGER':review==='not-danger'?'Marked NOT DANGER':'Needs leadership review'}</div></div><div class="age-review-actions"><button type="button" data-age-review="danger" data-record="${esc(recordDate)}" data-item="${esc(id)}" data-cooked-date="${esc(item.cookedDate)}">Danger</button><button type="button" data-age-review="not-danger" data-record="${esc(recordDate)}" data-item="${esc(id)}" data-cooked-date="${esc(item.cookedDate)}">Not danger</button></div></article>`;
  }).join(''):'<p class="feature-empty">No cooked stock entries older than 6 days are currently flagged.</p>';
  host.querySelectorAll('[data-age-review]').forEach(btn=>btn.addEventListener('click',()=>{
   const all=read('shell.dailyStock.v1',{}),record=btn.dataset.record,id=btn.dataset.item;
   const item=all?.[record]?.[id];if(!item)return;
   item.ageReview=btn.dataset.ageReview;item.ageReviewDate=btn.dataset.cookedDate;
   item.ageReviewedBy=window.currentUserName||'Leadership';item.ageReviewedAt=new Date().toISOString();
   localStorage.setItem('shell.dailyStock.v1',JSON.stringify(all));
   renderCookedAgeReview();
  }));
 }
 function countProblems(value,total={problems:0}){if(!value||typeof value!=='object')return total;if(value.problem)total.problems++;Object.values(value).forEach(v=>countProblems(v,total));return total;}
 function addTaskStatus(entry,totals){if(entry?.status==='done')totals.done++;else if(entry?.status==='issue'||entry?.status==='notdone'||entry?.status==='missed')totals.issues++;else totals.pending++;}
 function collectStaff(value,set=new Set()){if(!value||typeof value!=='object')return set;if(typeof value.staff==='string'&&value.staff.trim())set.add(value.staff.trim());Object.values(value).forEach(v=>collectStaff(v,set));return set;}
 function renderDailySummary(){
  const host=$('admin-summary-content'),input=$('summary-date');if(!host||!input)return;
  const date=input.value||dateKey(new Date()),stock=read('shell.dailyStock.v1',{})[date]||{};
  const items=typeof STOCK_ITEMS!=='undefined'?STOCK_ITEMS:[],updated=items.filter(i=>stock[i.id]?.updated).length;
  const out=items.filter(i=>stock[i.id]?.updated&&Number(stock[i.id]?.raw??0)===0&&Number(stock[i.id]?.cooked??0)===0).length;
  const low=items.filter(i=>{const x=stock[i.id];if(!x?.updated)return false;const total=Number(x.raw||0)+Number(x.cooked||0);return total>0&&total<=2;}).length;
  const oldCooked=items.filter(i=>{const x=stock[i.id];return x?.cookedDate&&Number(x.cooked||0)>0&&(dayAge(x.cookedDate)||0)>6;}).length;
  const keys=['shell.kitchenDownChecklists.v1','shell.kitchenUpOpening.v1','shell.kitchenUpCleaning.v1','shell.fohOpening.v1','shell.fohCleaning.v1','shell.toiletChecks.v1'];
  const totals={done:0,pending:0,issues:0,problems:0},staffActive=new Set();
  const kd=read('shell.kitchenDownChecklists.v1',{})[date]||{};
  Object.entries(typeof KITCHEN_CHECKLISTS!=='undefined'?KITCHEN_CHECKLISTS:{}).forEach(([section,tasks])=>tasks.forEach((_,i)=>addTaskStatus(kd[section]?.[i],totals)));
  const kuOpen=read('shell.kitchenUpOpening.v1',{})[date]||{};
  (typeof KU_OPEN_TASKS!=='undefined'?KU_OPEN_TASKS:[]).forEach((_,i)=>addTaskStatus(kuOpen[`open-${i}`],totals));
  (typeof KU_CLOSE_TASKS!=='undefined'?KU_CLOSE_TASKS:[]).forEach((_,i)=>addTaskStatus(kuOpen[`close-${i}`],totals));
  const weekday=new Date(`${date}T12:00:00`).getDay(),monthDay=Number(date.slice(8,10));
  const kuClean=read('shell.kitchenUpCleaning.v1',{})[date]||{};
  (typeof KU_WEEKLY_TASKS!=='undefined'?KU_WEEKLY_TASKS:[]).filter(t=>t.day===weekday).forEach(t=>addTaskStatus(kuClean[t.id],totals));
  (typeof KU_MONTHLY_TASKS!=='undefined'?KU_MONTHLY_TASKS:[]).filter(t=>t.dueDay===monthDay).forEach(t=>addTaskStatus(kuClean[t.id],totals));
  const fohOpen=read('shell.fohOpening.v1',{})[date]||{};
  (typeof FOH_OPENING_TASKS!=='undefined'?FOH_OPENING_TASKS:[]).forEach((_,i)=>addTaskStatus(fohOpen[`opening-${i}`],totals));
  (typeof FOH_CLOSING_TASKS!=='undefined'?FOH_CLOSING_TASKS:[]).forEach((_,i)=>addTaskStatus(fohOpen[`closing-${i}`],totals));
  const fohClean=read('shell.fohCleaning.v1',{})[date]||{};
  (typeof FOH_WEEKLY_TASKS!=='undefined'?FOH_WEEKLY_TASKS:[]).filter(t=>t.day===weekday).forEach(t=>addTaskStatus(fohClean[t.id],totals));
  (typeof FOH_MONTHLY_TASKS!=='undefined'?FOH_MONTHLY_TASKS:[]).filter(t=>t.dueDay===monthDay).forEach(t=>addTaskStatus(fohClean[t.id],totals));
  const toilet=read('shell.toiletChecks.v1',{})[date]||{};
  for(let hour=12;hour<=22;hour++)addTaskStatus(toilet[String(hour)],totals);
  keys.forEach(key=>{const data=read(key,{});const day=data[date]||{};countProblems(day,totals);collectStaff(day,staffActive);});
  collectStaff(stock,staffActive);
  host.innerHTML=`<div class="summary-metric-grid">
   <div class="summary-metric"><b>${updated}/${items.length}</b><span>Stock items updated</span></div>
   <div class="summary-metric"><b>${out}</b><span>Out of stock</span></div>
   <div class="summary-metric"><b>${low}</b><span>Very low stock</span></div>
   <div class="summary-metric"><b>${totals.done}</b><span>Checklist tasks done</span></div>
   <div class="summary-metric"><b>${totals.pending}</b><span>Pending checklist tasks</span></div>
   <div class="summary-metric"><b>${totals.issues}</b><span>Not done / missed</span></div>
   <div class="summary-metric"><b>${totals.problems}</b><span>Problem reports</span></div>
   <div class="summary-metric"><b>${staffActive.size}</b><span>Staff active in saved records</span></div>
   <div class="summary-metric"><b>${oldCooked}</b><span>Cooked items over 6 days</span></div>
  </div><p class="feature-help">Checklist counts are based on saved task records for ${esc(date)}. Historical records only exist from the time each screen began saving them.</p>`;
 }
 async function renderHistory(){
  const host=$('admin-history-content');if(!host||!window.supabaseClient)return;
  if(!leadership()){host.textContent='Leadership access required.';return;}
  host.innerHTML='<p class="feature-help">Loading dated activity…</p>';
  const selectedDate=$('history-date')?.value||'';
  let query=window.supabaseClient.from('audit_logs').select('id,actor_id,table_name,record_key,action,before_data,after_data,created_at').order('created_at',{ascending:false}).limit(1000);
  if(selectedDate){const start=new Date(`${selectedDate}T00:00:00`),end=new Date(start);end.setDate(end.getDate()+1);query=query.gte('created_at',start.toISOString()).lt('created_at',end.toISOString());}
  const {data,error}=await query;
  if(error){host.innerHTML=`<p class="feature-help">History could not be loaded: ${esc(error.message)}. Apply the latest history migration and check access policies.</p>`;return;}
  const actorIds=[...new Set((data||[]).map(x=>x.actor_id).filter(Boolean))],actors={};
  if(actorIds.length){const {data:profiles}=await window.supabaseClient.from('profiles').select('id,display_name,role').in('id',actorIds);(profiles||[]).forEach(p=>actors[p.id]=`${p.display_name||'Staff'} (${p.role})`);}
  const date=$('history-date')?.value||'',term=($('history-search')?.value||'').toLowerCase();
  const rows=(data||[]).filter(row=>{
   const day=String(row.created_at||'').slice(0,10);
   const text=[actors[row.actor_id],row.table_name,row.record_key,row.action,JSON.stringify(row.before_data),JSON.stringify(row.after_data)].join(' ').toLowerCase();
   return (!date||day===date)&&(!term||text.includes(term));
  });
  host.innerHTML=rows.length?rows.map(row=>{
   const when=new Date(row.created_at).toLocaleString(),actor=actors[row.actor_id]||'System / unavailable';
   const detail=JSON.stringify({before:row.before_data,after:row.after_data},null,2);
   return `<details class="history-record"><summary><b>${esc(row.action)} · ${esc(row.table_name)}</b><span>${esc(actor)} · ${esc(when)}</span></summary><p class="feature-item-note">Record: ${esc(row.record_key||'—')}</p><pre>${esc(detail)}</pre></details>`;
  }).join(''):'<p class="feature-empty">No matching history records were found for this filter.</p>';
 }
 window.refreshShellAdminTools=async()=>{
  const client=await window.initSupabase();
  const today=dateKey(new Date());
  if($('summary-date')&&!$('summary-date').value)$('summary-date').value=today;
  if($('history-date')&&!$('history-date').value)$('history-date').value=today;
  const create=$('staff-create-form'),reset=$('staff-reset-form');
  if(create)create.hidden=!privileged();if(reset)reset.hidden=!privileged();
  const staffSection=$('admin-staff-section');if(staffSection)staffSection.hidden=!leadership();
  const adminNav=$('nav-admin');if(adminNav)adminNav.classList.toggle('hidden',!leadership());
  const shortcuts=$('leadership-home-shortcuts');if(shortcuts)shortcuts.hidden=!leadership();
  await loadTemplates();renderCookedAgeReview();renderDailySummary();await renderHistory();
 };
 window.addEventListener('DOMContentLoaded',()=>{
  $('template-form')?.addEventListener('submit',async e=>{e.preventDefault();const msg=$('template-message');try{const {error}=await window.supabaseClient.from('checklist_templates').insert({station:$('template-station').value,checklist:$('template-checklist').value,item_text:$('template-item').value.trim(),updated_by:window.currentUserId});if(error)throw error;$('template-item').value='';msg.textContent='Saved to the shared Supabase checklist templates.';loadTemplates();}catch(err){msg.textContent=err.message;}});
  $('staff-reset-form')?.addEventListener('submit',async e=>{e.preventDefault();const msg=$('staff-reset-message');try{const client=await window.initSupabase();const {data,error}=await client.functions.invoke('reset-staff-pin',{body:{user_id:$('reset-staff-id').value.trim(),pin:$('reset-staff-pin').value}});if(error)throw error;if(data?.error)throw new Error(data.error);msg.textContent='PIN reset. The staff member must change it at next login.';$('staff-reset-form').reset();}catch(err){msg.textContent=err.message;}});
  $('summary-date')?.addEventListener('change',renderDailySummary);
  $('history-date')?.addEventListener('change',renderHistory);
  $('history-search')?.addEventListener('input',renderHistory);
  window.addEventListener('shell:state-updated',e=>{if(e.detail?.key==='shell.dailyStock.v1'){renderCookedAgeReview();renderDailySummary();}});
 });
})();