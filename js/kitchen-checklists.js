// Kitchen Down opening, closing and cleaning checklists. Browser-local storage only.
const KITCHEN_CHECKLIST_KEY = 'shell.kitchenDownChecklists.v1';
const KITCHEN_CHECKLISTS = {
  'Opening Checks': [
    'Turn on all the lights',
    'Clean and sanitise preparation surfaces',
    'Clean chopping boards',
    'Clean knives and utensils',
    'Clean preparation equipment',
    'Clean sinks',
    'Check fridge 4, 5, 6, 7, 8 temperatures',
    'Check all fridge doors',
    'Check frozen storage',
    'Check food labels and dates',
    'Check food is covered',
    'Clean doors',
    'Clean walls',
    'Sweep and mop floor',
    'Clean bins',
    'Clean ice machine',
    'Clean oven',
    'Check drainage entrance',
    'Complete Check 65'
  ],
  'Closing Checks': [
    'Clean preparation tables',
    'Clean chopping boards',
    'Clean sinks',
    'Clean taps',
    'Clean walking fridge and freezer',
    'Clean oven and microwave oven',
    'Clean fridge 4, 5, 6, 7, 8',
    'Clean all the walls',
    'Clean equipment',
    'Clean all the doors',
    'Clean fridge doors',
    'Clean underneath equipment',
    'Empty all the bins',
    'Wash all the bins',
    'Clean the bins area',
    'Check and clean all the storage',
    'Check and do all the labels',
    'Clean all the shelves',
    'Clean the handwashing area',
    'Turn off all the lights',
    'Complete Check 65'
  ],
  'Cleaning Checks': [
    'Clean and sanitise preparation surfaces',
    'Clean chopping boards',
    'Clean knives and utensils',
    'Clean preparation equipment',
    'Clean sinks and taps',
    'Sweep and mop floor',
    'Clean doors and walls',
    'Clean bins and bin area',
    'Clean ice machine',
    'Clean oven and microwave oven',
    'Clean fridge and freezer doors',
    'Clean underneath equipment',
    'Clean storage and shelves',
    'Clean handwashing area'
  ]
};
function kitchenChecklistRead() {
  try { return JSON.parse(localStorage.getItem(KITCHEN_CHECKLIST_KEY)) || {}; } catch (_) { return {}; }
}
function kitchenChecklistSave(data) {
  try { localStorage.setItem(KITCHEN_CHECKLIST_KEY, JSON.stringify(data)); return true; } catch (_) { return false; }
}
function kitchenChecklistDate() {
  const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function renderKitchenChecklistForm(area, section) {
  const allowed = KITCHEN_CHECKLISTS[section] ? section : 'Opening Checks';
  const today = kitchenChecklistDate();
  const staff = (window.currentUserName || 'Staff');
  const data = kitchenChecklistRead();
  const day = data[today] || {};
  const sectionState = day[allowed] || {};
  const items = KITCHEN_CHECKLISTS[allowed];
  const done = items.filter((_,i)=>sectionState[i]?.status==='done').length;
  const failed = items.filter((_,i)=>sectionState[i]?.status==='issue').length;
  area.innerHTML = `<div class="kcheck-app">
    <div class="kcheck-summary"><div><div class="eyebrow">KITCHEN DOWN · DAILY CHECKLIST</div><h2>${escapeHtml(allowed)}</h2><p>${new Date().toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'short',year:'numeric'})}</p></div><div class="kcheck-progress"><strong>${Math.round(done/items.length*100)}%</strong><span>${done}/${items.length}</span></div></div>
    <div class="kcheck-switcher">${Object.keys(KITCHEN_CHECKLISTS).map(s=>`<button type="button" class="kcheck-tab ${s===allowed?'active':''}" data-section="${escapeHtml(s)}">${escapeHtml(s.replace(' Checks',''))}</button>`).join('')}</div>
    <div class="kcheck-counts"><span class="kcheck-count good">✓ ${done} done</span><span class="kcheck-count issue">✕ ${failed} issues</span><span class="kcheck-count pending">○ ${items.length-done-failed} pending</span></div>
    <p class="kcheck-help">Tap ✓ if completed. Tap ✕ if not completed; add a reason. Use “Report a problem” for anything that needs follow-up.</p>
    <div class="kcheck-items">${items.map((label,i)=>{const entry=sectionState[i]||{};const status=entry.status||'pending';return `<article class="kcheck-item ${status}" data-index="${i}"><div class="kcheck-item-main"><span class="kcheck-number">${String(i+1).padStart(2,'0')}</span><div class="kcheck-label">${escapeHtml(label)}${entry.note?`<p class="kcheck-note">Reason: ${escapeHtml(entry.note)}</p>`:''}${entry.problem?`<p class="kcheck-problem">Problem: ${escapeHtml(entry.problem)}</p>`:''}${entry.staff?`<small>Updated by ${escapeHtml(entry.staff)}${entry.time?` · ${escapeHtml(entry.time)}`:''}</small>`:''}</div><span class="kcheck-status">${status==='done'?'✓':status==='issue'?'✕':'○'}</span></div><div class="kcheck-actions"><button type="button" class="kcheck-button done" data-action="done">✓ Done</button><button type="button" class="kcheck-button issue" data-action="issue">✕ Not done</button><button type="button" class="kcheck-button report" data-action="report">⚑ Report a problem</button>${entry.note||entry.problem?'<button type="button" class="kcheck-button clear" data-action="clear">Clear note</button>':''}</div></article>`;}).join('')}</div>
    <div class="kcheck-footer"><button type="button" class="stock-save-btn" id="kcheck-save">Save checklist</button><p id="kcheck-message" role="status">Saved on this device as you make changes.</p></div>
  </div>`;
  area.querySelectorAll('.kcheck-tab').forEach(btn=>btn.addEventListener('click',()=>renderKitchenChecklistForm(area,btn.dataset.section)));
  area.querySelectorAll('.kcheck-item button').forEach(btn=>btn.addEventListener('click',()=>{
    const card=btn.closest('.kcheck-item'), index=card.dataset.index, action=btn.dataset.action;
    const all=kitchenChecklistRead();all[today]=all[today]||{};all[today][allowed]=all[today][allowed]||{};
    const entry=all[today][allowed][index]||{};
    if(action==='done'){entry.status='done';entry.note='';}
    if(action==='issue'){
      const reason=window.prompt(`Why was this not completed?\n${items[index]}`,entry.note||'');
      if(reason===null)return;
      if(!reason.trim()){window.alert('Please enter a reason for marking this item as not done.');return;}
      entry.status='issue';entry.note=reason.trim();
    }
    if(action==='report'){
      const problem=window.prompt(`Report a problem for:\n${items[index]}`,entry.problem||'');
      if(problem===null)return;
      if(!problem.trim()){window.alert('Please enter a problem description.');return;}
      entry.problem=problem.trim();
    }
    if(action==='clear'){entry.note='';entry.problem='';if(entry.status==='issue')entry.status='pending';}
    entry.staff=staff;entry.time=new Date().toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
    all[today][allowed][index]=entry;
    const ok=kitchenChecklistSave(all);renderKitchenChecklistForm(area,allowed);
    const msg=area.querySelector('#kcheck-message');if(msg)msg.textContent=ok?'Saved on this device.':'Could not save; check browser storage settings.';
  }));
  area.querySelector('#kcheck-save').addEventListener('click',()=>{const ok=kitchenChecklistSave(kitchenChecklistRead());const msg=area.querySelector('#kcheck-message');msg.textContent=ok?'Checklist saved on this device.':'Could not save; check browser storage settings.';});
}
