/* Central Tasks landing page: quick links to the three operational work areas. */
(function () {
  const stations = [
    { name: 'FOH', icon: '🍽️', subtitle: 'Front of House', tasks: ['Opening Checks', 'Closing Checks', 'Cleaning Logs', 'Toilet Check'] },
    { name: 'Kitchen Up', icon: '🔥', subtitle: 'Main Kitchen', tasks: ['Opening Checks', 'Closing Checks', 'Cleaning Logs'] },
    { name: 'Kitchen Down', icon: '🔪', subtitle: 'Prep & Storage', tasks: ['Opening Checks', 'Closing Checks', 'Cleaning Checks', 'Daily Stock'] }
  ];
  window.renderTasksLanding = function () {
    const host = document.getElementById('tasks-station-list'); if (!host) return;
    host.innerHTML = stations.map(s => `<section class="task-station-card"><div class="task-station-top"><span class="task-station-icon">${s.icon}</span><div><h3>${s.name}</h3><p>${s.subtitle}</p></div></div><div class="task-quick-links">${s.tasks.map(t => `<button type="button" data-station="${s.name}" data-task="${t}">${t}<span>→</span></button>`).join('')}</div></section>`).join('');
    host.querySelectorAll('button[data-station]').forEach(button => button.addEventListener('click', () => {
      openStation(button.dataset.station, stations.find(s => s.name === button.dataset.station)?.icon);
      openForm(button.dataset.task);
    }));
  };
  window.addEventListener('DOMContentLoaded', window.renderTasksLanding);
})();
