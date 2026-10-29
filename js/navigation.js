// Main navigation across Home, Tasks, Profile and manager/admin screens.
function switchTab(tabId, element) {
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  if (element) element.classList.add('active');
  document.querySelectorAll('#main-app .view').forEach(view => view.classList.remove('active'));
  const target = document.getElementById(`view-${tabId === 'admin' ? 'admin' : tabId === 'home' ? 'employee' : tabId}`);
  if (target) target.classList.add('active');
  if (tabId === 'profile' && typeof window.refreshShellProfile === 'function') window.refreshShellProfile();
  if (tabId === 'tasks' && typeof window.renderTasksLanding === 'function') window.renderTasksLanding();
  if (typeof window.refreshHomeNotices === 'function') window.refreshHomeNotices();
}
