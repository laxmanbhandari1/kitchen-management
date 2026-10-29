// Station menus and functional frontend forms. Data is saved in this browser only.
let currentStationName = "";
let currentFormName = "";
const stationData = {
  FOH: [
    { title: "Opening Checks", icon: "🌅" },
    { title: "Closing Checks", icon: "🌙" },
    { title: "Cleaning Logs", icon: "🧹" },
    { title: "Toilet Check", icon: "🚻" },
  ],
  "Kitchen Up": [
    { title: "Opening Checks", icon: "🌅" },
    { title: "Closing Checks", icon: "🌙" },
    { title: "Cleaning Logs", icon: "🧹" },
  ],
  "Kitchen Down": [
    { title: "Opening Checks", icon: "🌅" },
    { title: "Closing Checks", icon: "🌙" },
    { title: "Cleaning Checks", icon: "🧹" },
    { title: "Daily Stock", icon: "📦" },
  ],
};
const STOCK_KEY = "shell.dailyStock.v1";
const TOILET_KEY = "shell.toiletChecks.v1";
const UNIT_OPTIONS = ["pcs", "portion", "cut", "kg", "box", "bag", "pack", "tub", "tray", "leg", "item", "container", "g"];
let stockFilter = "All";
let stockSearch = "";

function openStation(stationName) {
  currentStationName = stationName;
  document.getElementById("station-title-text").innerText = stationName;
  const menuList = document.getElementById("station-menu-list");
  menuList.innerHTML = "";
  (stationData[stationName] || []).forEach((item) => {
    const btn = document.createElement("div");
    btn.className = "menu-btn";
    btn.innerHTML = `<div class="menu-btn-title">${item.title}</div><div class="menu-icon">${item.icon}</div>`;
    btn.addEventListener("click", () => openForm(item.title));
    menuList.appendChild(btn);
  });
  document.getElementById("station-screen").classList.add("active");
}
function closeStation() { document.getElementById("station-screen").classList.remove("active"); }
function closeForm() { document.getElementById("form-screen").classList.remove("active"); }
function readStore(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch (_) { return fallback; }
}
function writeStore(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; }
}
function openForm(formType) {
  currentFormName = formType;
  document.getElementById("form-title-text").innerText = `${currentStationName} · ${formType}`;
  document.getElementById("form-screen").classList.add("active");
  const area = document.getElementById("form-content-area");
  area.classList.add("functional-form-area");
  if (currentStationName === "Kitchen Down" && formType === "Daily Stock") renderStockForm(area);
  else if (currentStationName === "Kitchen Down" && ["Opening Checks", "Closing Checks", "Cleaning Checks"].includes(formType)) renderKitchenChecklistForm(area, formType);
  else if (currentStationName === "Kitchen Up" && ["Opening Checks", "Closing Checks"].includes(formType)) renderKitchenUpDaily(area, formType);
  else if (currentStationName === "Kitchen Up" && formType === "Cleaning Logs") renderKitchenUpCleaning(area);
  else if (currentStationName === "FOH" && formType === "Opening Checks") renderFohOpening(area);
  else if (currentStationName === "FOH" && formType === "Closing Checks") renderFohClosing(area);
  else if (currentStationName === "FOH" && formType === "Closing Checks") renderFohClosing(area);
  else if (currentStationName === "FOH" && formType === "Cleaning Logs") renderFohCleaning(area);
  else if (currentStationName === "FOH" && formType === "Toilet Check") renderToiletForm(area);
  else area.innerHTML = `<div class="functional-panel"><h2>${escapeHtml(formType)}</h2><p>This form is not configured yet.</p></div>`;
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function todayKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function dateLabel() { return new Date().toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"}); }
function stockState() { const all = readStore(STOCK_KEY, {}); return all[todayKey()] || {}; }
function saveStockState(state) { const all = readStore(STOCK_KEY, {}); all[todayKey()] = state; return writeStore(STOCK_KEY, all); }
function currentStockValue(item, field) { const saved = stockState()[item.id] || {}; const original = field === 'cooked' ? item.cooked : field === 'raw' ? item.raw : item[field]; return saved[field] !== undefined ? saved[field] : original; }
function renderStockForm(area) {
  stockFilter = "All"; stockSearch = "";
  const categories = ["All", "Seafood", "Meat", "Veg & Sides", "Dessert", "Other"];
  const state = stockState();
  const completed = STOCK_ITEMS.filter(i => state[i.id]?.updated).length;
  const out = STOCK_ITEMS.filter(i => Number(currentStockValue(i,'raw') || 0) === 0 && Number(currentStockValue(i,'cooked') || 0) === 0).length;
  const low = STOCK_ITEMS.filter(i => { const c=Number(currentStockValue(i,'cooked')||0), r=Number(currentStockValue(i,'raw')||0); return c+r>0 && c+r<=2; }).length;
  area.innerHTML = `
    <div class="stock-app">
      <div class="stock-summary"><div><div class="eyebrow">THE SHELL · DAILY REPORT</div><h2>Daily stock check</h2><p>${dateLabel()} · ${completed} / ${STOCK_ITEMS.length} updated today</p></div><div class="stock-progress"><strong>${Math.round(completed/STOCK_ITEMS.length*100)}%</strong></div></div>
      <div class="stock-alert" id="stock-alert">🚨 <span><b>${out} out of stock</b> · ⚠️ ${low} very little left</span></div>
      <div class="stock-tools"><input id="stock-search" type="search" placeholder="🔎 Search item…" aria-label="Search stock items"><select id="stock-category-select" aria-label="Filter category"><option value="All">All categories</option>${categories.slice(1).map(c=>`<option>${c}</option>`).join('')}</select></div>
      <div class="stock-chips" id="stock-chips">${categories.map(c=>`<button type="button" class="stock-chip ${c==='All'?'active':''}" data-category="${c}">${c}</button>`).join('')}</div>
      <div id="stock-items-list"></div>
      <div class="stock-footer"><button type="button" class="stock-save-btn" id="stock-save-all">Save today's stock check</button><p id="stock-save-message" role="status">Changes save in this browser as you edit.</p></div>
    </div>`;
  const search = area.querySelector('#stock-search');
  search.addEventListener('input', e => { stockSearch=e.target.value.toLowerCase(); renderStockCards(area); });
  area.querySelector('#stock-category-select').addEventListener('change', e => { stockFilter=e.target.value; syncChips(area); renderStockCards(area); });
  area.querySelectorAll('.stock-chip').forEach(b=>b.addEventListener('click',()=>{stockFilter=b.dataset.category; area.querySelector('#stock-category-select').value=stockFilter;syncChips(area);renderStockCards(area);}));
  area.querySelector('#stock-save-all').addEventListener('click',()=>{ const ok=writeStore(STOCK_KEY,readStore(STOCK_KEY,{})); area.querySelector('#stock-save-message').textContent=ok?"Today's stock check is saved on this device.":"Could not save. Check your browser storage settings."; });
  renderStockCards(area);
}
function syncChips(area) { area.querySelectorAll('.stock-chip').forEach(b=>b.classList.toggle('active',b.dataset.category===stockFilter)); }
function renderStockCards(area) {
  const list=area.querySelector('#stock-items-list'); if(!list) return;
  const state=stockState();
  const items=STOCK_ITEMS.filter(i=>(stockFilter==='All'||i.category===stockFilter)&&i.name.toLowerCase().includes(stockSearch));
  if(!items.length){list.innerHTML='<div class="functional-panel">No stock items match your search.</div>';return;}
  let lastCat='';
  list.innerHTML=items.map(item=>{
    const saved=state[item.id]||{}; const cooked=currentStockValue(item,'cooked'); const raw=currentStockValue(item,'raw');
    const sum=Number(cooked||0)+Number(raw||0); const badge=sum===0?'<span class="stock-status out">Out of stock</span>':sum<=2?'<span class="stock-status low">⚠ Very little left</span>':'';
    const catHeader=item.category!==lastCat?`<div class="stock-category-heading">📍 ${escapeHtml(item.category)}</div>`:''; lastCat=item.category;
    const units=(selected)=>UNIT_OPTIONS.map(u=>`<option value="${u}" ${String(selected).trim()===u?'selected':''}>${u}</option>`).join('');
    return `${catHeader}<article class="stock-item-card" data-item-id="${item.id}">
      <div class="stock-item-head"><div class="stock-item-emoji">${item.category==='Seafood'?'🦞':item.category==='Meat'?'🥩':item.category==='Veg & Sides'?'🥦':item.category==='Dessert'?'🍮':'📦'}</div><div class="stock-item-name"><h3>${escapeHtml(item.name)}</h3><span>${escapeHtml(item.category)}</span></div>${badge}</div>
      <div class="stock-quantity-grid"><label class="quantity-box"><span>COOKED / PREPPED</span><input type="number" min="0" step="any" data-field="cooked" value="${escapeHtml(cooked)}" aria-label="${escapeHtml(item.name)} cooked quantity"><select data-field="prepUnit" aria-label="${escapeHtml(item.name)} cooked unit">${units(saved.prepUnit??item.prepUnit)}</select></label><label class="quantity-box"><span>RAW / FROZEN</span><input type="number" min="0" step="any" data-field="raw" value="${escapeHtml(raw)}" aria-label="${escapeHtml(item.name)} raw quantity"><select data-field="rawUnit" aria-label="${escapeHtml(item.name)} raw unit">${units(saved.rawUnit??item.rawUnit)}</select></label></div>
      <div class="stock-item-meta"><span>${saved.updated?`Updated by ${escapeHtml(saved.staff||'staff')} · ${escapeHtml(saved.time||'just now')}`:'Not updated today'}</span><button type="button" class="stock-expand" aria-expanded="${saved.expanded?'true':'false'}">${saved.expanded?'Less ▴':'More ▾'}</button></div>
      <div class="stock-extra ${saved.expanded?'':'hidden'}"><label>USE-BY / PREP DATE<input type="date" data-field="useBy" value="${escapeHtml(saved.useBy??item.useBy)}"></label><label>NOTE<input type="text" data-field="note" placeholder="Optional" value="${escapeHtml(saved.note||'')}"></label><label class="waste-toggle"><input type="checkbox" data-field="waste" ${saved.waste?'checked':''}> ☠️ Dead / waste</label></div>
    </article>`;
  }).join('');
  list.querySelectorAll('.stock-item-card').forEach(card=>{
    card.querySelector('.stock-expand').addEventListener('click',()=>{const s=stockState();const id=card.dataset.itemId;s[id]=s[id]||{};s[id].expanded=!s[id].expanded;saveStockState(s);renderStockCards(area);});
    card.querySelectorAll('[data-field]').forEach(input=>input.addEventListener('change',()=>{
      const s=stockState(),id=card.dataset.itemId,item=STOCK_ITEMS.find(x=>x.id===id);s[id]=s[id]||{};
      const field=input.dataset.field;s[id][field]=input.type==='checkbox'?input.checked:input.value;
      s[id].updated=true;s[id].staff=(window.currentUserName || 'Staff');s[id].time=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
      saveStockState(s);updateStockSummary(area);
      // Keep the card in place while editing and update the status indicator.
      const cooked=Number(card.querySelector('[data-field="cooked"]').value||0),raw=Number(card.querySelector('[data-field="raw"]').value||0),total=cooked+raw;
      const old=card.querySelector('.stock-status');if(old)old.remove();if(total===0)card.querySelector('.stock-item-head').insertAdjacentHTML('beforeend','<span class="stock-status out">Out of stock</span>');else if(total<=2)card.querySelector('.stock-item-head').insertAdjacentHTML('beforeend','<span class="stock-status low">⚠ Very little left</span>');
    }));
  });
}
function updateStockSummary(area) {
  const state=stockState();const completed=STOCK_ITEMS.filter(i=>state[i.id]?.updated).length;
  const out=STOCK_ITEMS.filter(i=>Number(currentStockValue(i,'raw')||0)===0&&Number(currentStockValue(i,'cooked')||0)===0).length;
  const low=STOCK_ITEMS.filter(i=>{const c=Number(currentStockValue(i,'cooked')||0),r=Number(currentStockValue(i,'raw')||0);return c+r>0&&c+r<=2;}).length;
  const p=area.querySelector('.stock-summary p');if(p)p.textContent=`${dateLabel()} · ${completed} / ${STOCK_ITEMS.length} updated today`;
  const prog=area.querySelector('.stock-progress strong');if(prog)prog.textContent=`${Math.round(completed/STOCK_ITEMS.length*100)}%`;
  const alert=area.querySelector('#stock-alert');if(alert)alert.innerHTML=`🚨 <span><b>${out} out of stock</b> · ⚠️ ${low} very little left</span>`;
}
function toiletState(){const all=readStore(TOILET_KEY,{});return all[todayKey()]||{};}
function saveToiletState(state){const all=readStore(TOILET_KEY,{});all[todayKey()]=state;return writeStore(TOILET_KEY,all);}
function renderToiletForm(area){
  const hours=Array.from({length:11},(_,i)=>12+i);const state=toiletState();
  const rows=hours.map(hour=>{const key=String(hour),entry=state[key]||{};const label=`${String(hour).padStart(2,'0')}:00`;let status=entry.status;
    if(!status){const now=new Date();status=now.getHours()>hour?'missed':'pending';}
    return `<div class="toilet-row" data-hour="${key}"><div class="toilet-time">${label}</div><div class="toilet-status ${status}">${status==='done'?'✓ Completed':status==='missed'?'× Missed':'○ Pending'}</div><div class="toilet-actions">${status==='done'?`<button type="button" class="toilet-action secondary" data-action="undo">Undo</button>`:`<button type="button" class="toilet-action" data-action="complete">✓ Check</button>`}<button type="button" class="toilet-action explain" data-action="explain">✍️ Explain</button></div>${entry.note?`<p class="toilet-note">${escapeHtml(entry.note)}</p>`:''}</div>`;
  }).join('');
  const done=hours.filter(h=>state[String(h)]?.status==='done').length;
  area.innerHTML=`<div class="toilet-app"><div class="toilet-intro"><div class="eyebrow">FOH · HYGIENE LOG</div><h2>🚻 Toilet check</h2><p>Toilets are checked every hour from 12:00 to 22:00.</p><div class="toilet-today-progress">${done} of ${hours.length} checks completed · ${dateLabel()}</div></div><section class="toilet-panel"><h3>Today's checks</h3><div id="toilet-check-list">${rows}</div></section><p class="local-save-note" id="toilet-save-message">Check results and explanations save locally on this device.</p></div>`;
  area.querySelectorAll('.toilet-row button').forEach(btn=>btn.addEventListener('click',()=>{
    const row=btn.closest('.toilet-row'),hour=row.dataset.hour,action=btn.dataset.action;const s=toiletState();s[hour]=s[hour]||{};
    if(action==='complete'){s[hour].status='done';s[hour].checkedAt=new Date().toISOString();s[hour].staff=(window.currentUserName || 'Staff');}
    if(action==='undo'){s[hour].status='missed';delete s[hour].checkedAt;}
    if(action==='explain'){const note=window.prompt(`Explain the ${String(hour).padStart(2,'0')}:00 toilet check (e.g. why it was missed):`,s[hour].note||'');if(note===null)return;s[hour].note=note.trim();if(!s[hour].status)s[hour].status='missed';}
    const ok=saveToiletState(s);renderToiletForm(area);const msg=area.querySelector('#toilet-save-message');if(msg)msg.textContent=ok?'Saved on this device.':'Could not save; check browser storage settings.';
  }));
}
