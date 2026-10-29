// FOH opening and recurring cleaning checklists. Browser-local storage only; no backend.
const FOH_OPEN_KEY = 'shell.fohOpening.v1';
const FOH_CLEAN_KEY = 'shell.fohCleaning.v1';
const FOH_OPENING_TASKS = [
  'Opening outside and canopy',
  'Turning on every light upstairs and downstairs',
  'Cleaning front doors and front glass',
  'Checking plates / cutlery',
  'Checking front and back stairs',
  'Cleaning reception',
  'Refilling front station',
  'Switch on the music',
  'Cleaning upstairs floor and walls',
  "Checking men's toilet",
  "Checking women's toilet",
  'Check disabled toilet',
  'Check handwash section upstairs',
  'Opening fridge 1, 2, 3',
  'Check and stock fridge 1, 2, 3',
  'Open and check all rubbish bins',
  'Checking all the labels',
  'Checking ice machine',
  'Checking glass washer',
  'Checking V1 and V2',
  'Checking downstairs floor and walls',
  'Complete Check 65',
  'Turn on the takeaway pads at 12',
  'Turn open sign at 12',
  'Bar items stock level check'
];
// Daily cleaning stays in Opening Checks. These are suggested recurring tasks, editable in the UI.
const FOH_WEEKLY_TASKS = [
  { id:'weekly-glass-washer', name:'Cleaning glass washer', day:3 },
  { id:'weekly-ice-machine', name:'Cleaning ice machine', day:3 },
  { id:'weekly-drinks-fridge', name:'Cleaning behind all the drinks fridge', day:3 },
  { id:'weekly-glass-ice-behind', name:'Cleaning behind glass washer and ice machine', day:3 },
  { id:'weekly-bar-shelves', name:'Cleaning bar shelves', day:4 }
];
const FOH_MONTHLY_TASKS = [
  { id:'monthly-beer-machine', name:'Cleaning beer machine', dueDay:20 }
];
const FOH_CLOSING_TASKS = [
  'Setting up tables',
  'Front stations stocked',
  'Floor brushed',
  'Closing outside',
  'Turning off the canopy',
  'Turning off lights downstairs',
  'Turning off lights upstairs',
  'Closing all the doors',
  'Turning off the music',
  'Charging the iPads',
  'Turning off the AC',
  'Cleaning plates and cutlery',
  'Washing all the bins',
  'All the clothes to wash',
  'Completing Check 65',
  'Cleaning fridges',
  'Checking all the labels',
  'Closing glass washer',
  'Checking ice machine',
  'Closing beer machine',
  'Wiping the counter',
  'Refilling the fridges',
  'Stocking the shelves',
  'Cleaning and closing coffee machine',
  'Cleaning back area shelves',
  'Cleaning back tables',
  "Cleaning men's toilet",
  "Cleaning ladies' toilet",
  'Cleaning disabled toilet',
  'Cleaning handwash section'
];
function fohEsc(v){return escapeHtml(v);}
function fohDateKey(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function fohRead(key){return readStore(key,{});}
function fohStaff(){return (window.currentUserName || 'Staff');}
function fohSaveEntry(key, date, id, entry){const all=fohRead(key);all[date]=all[date]||{};all[date][id]=entry;return writeStore(key,all);}
function fohEntry(key,date,id){return (fohRead(key)[date]||{})[id]||{};}
function fohStatusControl(status){return `<span class="foh-check-status ${status==='done'?'done':status==='notdone'?'notdone':'pending'}">${status==='done'?'✓ Done':status==='notdone'?'✕ Not done':'○ Not checked'}</span>`;}
function fohTaskMarkup(task, key, date){const e=fohEntry(key,date,task.id);return `<article class="foh-task" data-task="${fohEsc(task.id)}"><div class="foh-task-main"><div class="foh-task-name">${fohEsc(task.name)}</div>${fohStatusControl(e.status)}</div>${e.reason?`<p class="foh-note"><b>Reason:</b> ${fohEsc(e.reason)}</p>`:''}${e.problem?`<p class="foh-note problem"><b>Problem:</b> ${fohEsc(e.problem)}</p>`:''}<div class="foh-task-actions"><button type="button" data-foh-action="done">✓ Done</button><button type="button" class="negative" data-foh-action="notdone">✕ Not done</button><button type="button" class="quiet" data-foh-action="problem">⚑ Report a problem</button></div>${e.staff?`<div class="foh-task-meta">${fohEsc(e.staff)} · ${fohEsc(e.time||'')}</div>`:''}</article>`;}
function fohBindTasks(area, key, date, tasks, rerender){area.querySelectorAll('.foh-task').forEach(card=>card.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>{const id=card.dataset.task,action=btn.dataset.fohAction;let e=fohEntry(key,date,id);if(action==='done'){e={...e,status:'done',reason:'',staff:fohStaff(),time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})};}else if(action==='notdone'){const reason=window.prompt('Why was this task not completed?');if(reason===null)return;if(!reason.trim()){alert('Please enter a reason for a task marked Not done.');return;}e={...e,status:'notdone',reason:reason.trim(),staff:fohStaff(),time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})};}else{const problem=window.prompt('Describe the problem to report:');if(problem===null)return;if(!problem.trim()){alert('Please enter a problem description.');return;}e={...e,problem:problem.trim(),staff:fohStaff(),time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})};}fohSaveEntry(key,date,id,e);rerender();})));}
function renderFohOpening(area){const date=fohDateKey(),saved=fohRead(FOH_OPEN_KEY)[date]||{},done=FOH_OPENING_TASKS.filter((_,i)=>saved['opening-'+i]?.status==='done').length;area.innerHTML=`<div class="foh-app"><header class="foh-hero"><div class="foh-eyebrow">THE SHELL · FRONT OF HOUSE</div><h2>🌅 Opening Checks</h2><p>${new Date().toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'short',year:'numeric'})}</p><div class="foh-progress"><span>${done} / ${FOH_OPENING_TASKS.length} tasks done</span><div><i style="width:${Math.round(done/FOH_OPENING_TASKS.length*100)}%"></i></div></div></header><div class="foh-section-heading">Daily opening duties</div><p class="foh-help">Mark each task Done or Not done. A reason is required for tasks not completed. Use Report a problem for maintenance or other issues.</p><div id="foh-opening-list">${FOH_OPENING_TASKS.map((name,i)=>fohTaskMarkup({id:'opening-'+i,name},FOH_OPEN_KEY,date)).join('')}</div><p class="local-save-note">Opening checks save locally on this device.</p></div>`;fohBindTasks(area,FOH_OPEN_KEY,date,FOH_OPENING_TASKS.map((name,i)=>({id:'opening-'+i,name})),()=>renderFohOpening(area));}
function renderFohClosing(area){const date=fohDateKey(),saved=fohRead(FOH_OPEN_KEY)[date]||{},done=FOH_CLOSING_TASKS.filter((_,i)=>saved['closing-'+i]?.status==='done').length;const tasks=FOH_CLOSING_TASKS.map((name,i)=>({id:'closing-'+i,name}));area.innerHTML=`<div class="foh-app"><header class="foh-hero"><div class="foh-eyebrow">THE SHELL · FRONT OF HOUSE</div><h2>🌙 Closing Checks</h2><p>${new Date().toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'short',year:'numeric'})}</p><div class="foh-progress"><span>${done} / ${tasks.length} closing duties done</span><div><i style="width:${Math.round(done/tasks.length*100)}%"></i></div></div></header><div class="foh-section-heading">Daily closing duties</div><p class="foh-help">Weekly and monthly deep-cleaning jobs are listed separately in Cleaning Logs. Mark each daily duty Done or Not done; a reason is required if it was not completed.</p><div id="foh-closing-list">${tasks.map(t=>fohTaskMarkup(t,FOH_OPEN_KEY,date)).join('')}</div><p class="local-save-note">Closing checks save locally on this device.</p></div>`;fohBindTasks(area,FOH_OPEN_KEY,date,tasks,()=>renderFohClosing(area));}
function renderFohCleaning(area, selectedTab='weekly', selectedDate=fohDateKey()){const today=new Date();const weekDay=today.getDay();const month=Number(selectedDate.slice(5,7))-1,year=Number(selectedDate.slice(0,4));const monthlyDue=FOH_MONTHLY_TASKS.filter(t=>t.dueDay<=new Date(year,month+1,0).getDate());const tabNames=[['daily','Daily'],['weekly','Weekly'],['monthly','Monthly']];let content='';
 if(selectedTab==='daily'){const date=selectedDate;content=`<div class="foh-section-heading">Daily cleaning</div><p class="foh-help">Daily cleaning tasks are included in FOH Opening Checks so they are completed as part of opening.</p><div class="foh-task">Front doors and glass · reception · stairs · floors and walls · handwash area · rubbish bins</div><button type="button" class="foh-primary" id="foh-open-daily">Open daily opening checklist</button>`;}
 if(selectedTab==='weekly'){content=`<div class="foh-section-heading">Weekly cleaning schedule</div><p class="foh-help">The current day is highlighted. A dot marks a scheduled job. You can change a job's scheduled day and select an earlier date to record work retrospectively.</p><label class="foh-schedule-label">Record cleaning for date<input type="date" id="foh-weekly-date" value="${selectedDate}"></label><div class="foh-week-grid">${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d,i)=>`<div class="foh-week-day ${i===weekDay?'today':''}"><b>${d.slice(0,3)}</b><span>${FOH_WEEKLY_TASKS.some(t=>t.day===i)?'• Job scheduled':'—'}</span></div>`).join('')}</div>${FOH_WEEKLY_TASKS.map(t=>{const e=fohEntry(FOH_CLEAN_KEY,selectedDate,t.id);return `<article class="foh-task" data-task="${t.id}"><div class="foh-task-main"><div class="foh-task-name">${fohEsc(t.name)}</div>${fohStatusControl(e.status)}</div><label class="foh-schedule-label">Scheduled day<select data-weekday="${t.id}">${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d,i)=>`<option value="${i}" ${i===t.day?'selected':''}>${d}</option>`).join('')}</select></label>${e.doneDate?`<p class="foh-note">Last completed: ${fohEsc(e.doneDate)}${e.staff?' · '+fohEsc(e.staff):''}</p>`:''}<div class="foh-task-actions"><button type="button" data-foh-action="done">✓ Done today</button><button type="button" class="negative" data-foh-action="notdone">✕ Not done</button><button type="button" class="quiet" data-foh-action="problem">⚑ Report a problem</button></div>${e.problem?`<p class="foh-note problem">Problem: ${fohEsc(e.problem)}</p>`:''}</article>`;}).join('')}`;}
 if(selectedTab==='monthly'){const daysInMonth=new Date(year,month+1,0).getDate(),firstDay=new Date(year,month,1).getDay();const cells=Array.from({length:firstDay},()=>'<span class="foh-calendar-empty"></span>');for(let d=1;d<=daysInMonth;d++){const due=FOH_MONTHLY_TASKS.some(t=>t.dueDay===d),isToday=d===today.getDate()&&month===today.getMonth()&&year===today.getFullYear();cells.push(`<button type="button" class="foh-calendar-day ${due?'has-job':''} ${isToday?'today':''}" data-date="${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}">${d}${due?'<i>•</i>':''}</button>`);}const dayTasks=FOH_MONTHLY_TASKS.filter(t=>t.dueDay===Number(selectedDate.slice(8,10)));content=`<div class="foh-section-heading">Monthly cleaning calendar</div><p class="foh-help">Highlighted dates contain scheduled cleaning jobs. Select a date to see tasks and record work completed today or yesterday.</p><div class="foh-calendar-title"><button type="button" id="foh-prev-month" aria-label="Previous month">‹</button><b>${new Date(year,month,1).toLocaleDateString(undefined,{month:'long',year:'numeric'})}</b><button type="button" id="foh-next-month" aria-label="Next month">›</button></div><div class="foh-calendar-grid">${['S','M','T','W','T','F','S'].map(d=>`<b>${d}</b>`).join('')}${cells.join('')}</div><label class="foh-schedule-label">Selected date<input type="date" id="foh-selected-date" value="${selectedDate}"></label><div class="foh-section-heading">Jobs on ${new Date(year,month,Number(selectedDate.slice(8,10))).toLocaleDateString(undefined,{day:'numeric',month:'short'})}</div>${(dayTasks.length?dayTasks:FOH_MONTHLY_TASKS).map(t=>{const e=fohEntry(FOH_CLEAN_KEY,selectedDate,t.id);return `<article class="foh-task" data-task="${t.id}"><div class="foh-task-main"><div class="foh-task-name">${fohEsc(t.name)}${dayTasks.length?'':' <small>(scheduled monthly job)</small>'}</div>${fohStatusControl(e.status)}</div>${e.doneDate?`<p class="foh-note">Completed: ${fohEsc(e.doneDate)}${e.staff?' · '+fohEsc(e.staff):''}</p>`:''}<div class="foh-task-actions"><button type="button" data-foh-action="done">✓ Done on selected date</button><button type="button" class="negative" data-foh-action="notdone">✕ Not done</button><button type="button" class="quiet" data-foh-action="problem">⚑ Report a problem</button></div>${e.problem?`<p class="foh-note problem">Problem: ${fohEsc(e.problem)}</p>`:''}</article>`;}).join('')}`;}
 area.innerHTML=`<div class="foh-app"><header class="foh-hero"><div class="foh-eyebrow">THE SHELL · FRONT OF HOUSE</div><h2>🧹 Cleaning Logs</h2><p>Daily, weekly and monthly cleaning records</p></header><nav class="foh-tabs">${tabNames.map(([id,label])=>`<button type="button" data-clean-tab="${id}" class="${selectedTab===id?'active':''}">${label}</button>`).join('')}</nav><div id="foh-clean-content">${content}</div><p class="local-save-note">Cleaning records save in this browser only.</p></div>`;
 area.querySelectorAll('[data-clean-tab]').forEach(b=>b.addEventListener('click',()=>renderFohCleaning(area,b.dataset.cleanTab,selectedDate)));
 if(selectedTab==='daily')area.querySelector('#foh-open-daily').addEventListener('click',()=>openForm('Opening Checks'));
 if(selectedTab==='weekly'){area.querySelector('#foh-weekly-date').addEventListener('change',e=>{if(e.target.value)renderFohCleaning(area,'weekly',e.target.value);});area.querySelectorAll('[data-weekday]').forEach(sel=>sel.addEventListener('change',()=>{const task=FOH_WEEKLY_TASKS.find(t=>t.id===sel.dataset.weekday);task.day=Number(sel.value);renderFohCleaning(area,'weekly',selectedDate);}));fohBindCleaningEntries(area,selectedDate,()=>renderFohCleaning(area,'weekly',selectedDate));}
 if(selectedTab==='monthly'){area.querySelectorAll('[data-date]').forEach(b=>b.addEventListener('click',()=>renderFohCleaning(area,'monthly',b.dataset.date)));area.querySelector('#foh-selected-date').addEventListener('change',e=>{if(e.target.value)renderFohCleaning(area,'monthly',e.target.value);});area.querySelector('#foh-prev-month').addEventListener('click',()=>{const d=new Date(year,month-1,1);renderFohCleaning(area,'monthly',`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`);});area.querySelector('#foh-next-month').addEventListener('click',()=>{const d=new Date(year,month+1,1);renderFohCleaning(area,'monthly',`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`);});fohBindCleaningEntries(area,selectedDate,()=>renderFohCleaning(area,'monthly',selectedDate));}
}
function fohBindCleaningEntries(area,date,rerender){area.querySelectorAll('.foh-task').forEach(card=>card.querySelectorAll('button[data-foh-action]').forEach(btn=>btn.addEventListener('click',()=>{const id=card.dataset.task,action=btn.dataset.fohAction;let e=fohEntry(FOH_CLEAN_KEY,date,id);if(action==='done'){e={...e,status:'done',doneDate:date,staff:fohStaff(),time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),reason:''};}else if(action==='notdone'){const reason=window.prompt('Why was this cleaning job not completed?');if(reason===null)return;if(!reason.trim()){alert('Please enter a reason.');return;}e={...e,status:'notdone',reason:reason.trim(),staff:fohStaff(),time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})};}else{const problem=window.prompt('Describe the cleaning problem:');if(problem===null)return;if(!problem.trim()){alert('Please enter a problem description.');return;}e={...e,problem:problem.trim(),staff:fohStaff(),time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})};}fohSaveEntry(FOH_CLEAN_KEY,date,id,e);rerender();})));}
