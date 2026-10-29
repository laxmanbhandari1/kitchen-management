/* Home-page stock alerts and allergy notes. Frontend demo: localStorage only. */
(function () {
  const STOCK_KEY = 'shell-home-stock-alerts-v1';
  const ALLERGY_KEY = 'shell-allergy-notes-v1';
  const canManage = () => ['manager', 'admin'].includes(window.currentUserRole || 'employee');
  const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const read = (key) => {
    try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : []; }
    catch (_) { return []; }
  };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const id = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  function renderStock() {
    const items = read(STOCK_KEY).sort((a, b) => (a.status === 'finished' ? -1 : 1) - (b.status === 'finished' ? -1 : 1) || a.name.localeCompare(b.name));
    ['stock-alerts-employee', 'stock-alerts-admin'].forEach((containerId) => {
      const container = document.getElementById(containerId);
      if (!container) return;
      if (!items.length) {
        container.innerHTML = '<div class="feature-empty">No items are currently marked very low or finished.</div>';
        return;
      }
      container.innerHTML = items.map((item) => `
        <article class="feature-item">
          <div class="feature-item-main">
            <div class="feature-item-title">${safe(item.name)}</div>
            <span class="feature-status ${item.status === 'finished' ? 'finished' : 'low'}">${item.status === 'finished' ? 'FINISHED · OUT OF STOCK' : 'VERY LOW'}</span>
            ${item.note ? `<div class="feature-item-note">${safe(item.note)}</div>` : ''}
            ${item.updatedAt ? `<div class="feature-item-note">Updated ${safe(item.updatedAt)}${item.updatedBy ? ` by ${safe(item.updatedBy)}` : ''}</div>` : ''}
          </div>
          ${canManage() ? `<div class="feature-item-actions"><button class="feature-small-btn" data-stock-action="low" data-id="${safe(item.id)}">Mark low</button><button class="feature-small-btn" data-stock-action="finished" data-id="${safe(item.id)}">Finished</button><button class="feature-small-btn" data-stock-action="available" data-id="${safe(item.id)}">Available</button><button class="feature-small-btn danger" data-stock-action="delete" data-id="${safe(item.id)}">Remove</button></div>` : ''}
        </article>`).join('');
    });
    document.querySelectorAll('[data-stock-action]').forEach((button) => {
      button.onclick = () => {
        if (!canManage()) return;
        const itemsNow = read(STOCK_KEY);
        const item = itemsNow.find((entry) => entry.id === button.dataset.id);
        if (!item) return;
        const action = button.dataset.stockAction;
        if (action === 'delete') {
          if (!confirm(`Remove ${item.name} from the stock alert list?`)) return;
          write(STOCK_KEY, itemsNow.filter((entry) => entry.id !== item.id));
        } else if (action === 'available') {
          write(STOCK_KEY, itemsNow.filter((entry) => entry.id !== item.id));
        } else {
          item.status = action;
          item.updatedAt = new Date().toLocaleString();
          item.updatedBy = window.currentUserName || 'Manager';
          write(STOCK_KEY, itemsNow);
        }
        renderStock();
      };
    });
  }

  function renderAllergies() {
    const notes = read(ALLERGY_KEY).sort((a, b) => a.title.localeCompare(b.title));
    ['allergy-notes-employee', 'allergy-notes-admin'].forEach((containerId) => {
      const container = document.getElementById(containerId);
      if (!container) return;
      if (!notes.length) {
        container.innerHTML = '<div class="feature-empty">No allergy notes have been added yet. Follow the current approved allergen matrix and ask the manager or chef if unsure.</div>';
        return;
      }
      container.innerHTML = notes.map((note) => `
        <article class="feature-item">
          <div class="feature-item-main">
            <div class="feature-item-title">${safe(note.title)}</div>
            <div class="feature-item-note">${safe(note.details)}</div>
            <div class="allergy-caution">Always verify against the current approved allergen information before serving.</div>
          </div>
          ${canManage() ? `<div class="feature-item-actions"><button class="feature-small-btn danger" data-allergy-delete="${safe(note.id)}">Remove</button></div>` : ''}
        </article>`).join('');
    });
    document.querySelectorAll('[data-allergy-delete]').forEach((button) => {
      button.onclick = () => {
        if (!canManage()) return;
        const notesNow = read(ALLERGY_KEY);
        const note = notesNow.find((entry) => entry.id === button.dataset.allergyDelete);
        if (note && confirm(`Remove the allergy note for ${note.title}?`)) {
          write(ALLERGY_KEY, notesNow.filter((entry) => entry.id !== note.id));
          renderAllergies();
        }
      };
    });
  }

  function initForms() {
    const stockForm = document.getElementById('stock-alert-form');
    if (stockForm) stockForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!canManage()) return alert('Only a manager or admin can update stock alerts.');
      const nameInput = document.getElementById('stock-alert-name');
      const statusInput = document.getElementById('stock-alert-status');
      const noteInput = document.getElementById('stock-alert-note');
      const name = nameInput.value.trim();
      if (!name) return;
      const items = read(STOCK_KEY);
      const existing = items.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
      const record = { id: existing?.id || id(), name, status: statusInput.value, note: noteInput.value.trim(), updatedAt: new Date().toLocaleString(), updatedBy: window.currentUserName || 'Manager' };
      write(STOCK_KEY, existing ? items.map((entry) => entry.id === existing.id ? record : entry) : [...items, record]);
      stockForm.reset();
      renderStock();
    });

    const allergyForm = document.getElementById('allergy-note-form');
    if (allergyForm) allergyForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!canManage()) return alert('Only a manager or admin can edit allergy notes.');
      const title = document.getElementById('allergy-note-title').value.trim();
      const details = document.getElementById('allergy-note-details').value.trim();
      if (!title || !details) return;
      const notes = read(ALLERGY_KEY);
      notes.push({ id: id(), title, details, updatedAt: new Date().toLocaleString(), updatedBy: window.currentUserName || 'Manager' });
      write(ALLERGY_KEY, notes);
      allergyForm.reset();
      renderAllergies();
    });
  }

  window.refreshHomeNotices = () => { renderStock(); renderAllergies(); };
  document.addEventListener('DOMContentLoaded', () => { initForms(); renderStock(); renderAllergies(); });
})();
