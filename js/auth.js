/* Real Supabase Auth. Role is read from the protected profiles table, never selected by the user. */
window.currentUserRole = 'employee';
window.currentUserName = 'Staff';
window.currentUserId = null;

function showSignedInApp(profile, user) {
  window.currentUserRole = profile.role;
  window.currentUserName = profile.display_name || user.email?.split('@')[0] || 'Staff';
  window.currentUserId = user.id;
  document.getElementById('login-screen').classList.remove('active');
  document.getElementById('intro-screen').classList.remove('active');
  document.getElementById('main-app').classList.add('active');
  document.getElementById('bottom-nav').classList.add('visible');
  document.getElementById('welcome-text').innerText = `Welcome, ${window.currentUserName}`;
  document.getElementById('role-text').innerText = `${profile.role[0].toUpperCase()}${profile.role.slice(1)} View`;
  const adminNav = document.getElementById('nav-admin');
  if (adminNav) adminNav.classList.toggle('hidden', profile.role === 'employee');
  const staffRole = document.getElementById('staff-role');
  if (staffRole) {
    [...staffRole.options].forEach(option => { option.hidden = profile.role !== 'admin' && option.value !== 'employee'; });
    if (profile.role !== 'admin') staffRole.value = 'employee';
  }
  const avatar = document.querySelector('.header-avatar');
  if (avatar) avatar.innerHTML = `<span class="avatar-initial">${window.currentUserName.split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase()}</span>`;
  if (typeof window.refreshShellProfile === 'function') window.refreshShellProfile();
  if (typeof window.refreshHomeNotices === 'function') window.refreshHomeNotices();
  if (profile.role === 'employee') switchTab('home', document.querySelector('.nav-item'));
  else if (adminNav) switchTab('admin', adminNav);
}

async function handleLogin(event) {
  if (event) event.preventDefault();
  const userId = document.getElementById('login-user-id').value.trim();
  const pin = document.getElementById('login-pin').value;
  const message = document.getElementById('login-message');
  const button = document.getElementById('login-submit');
  if (!userId || !/^\d{4,8}$/.test(pin)) { message.textContent = 'Enter your staff user ID and 4–8 digit PIN.'; return; }
  button.disabled = true; message.textContent = 'Signing in…';
  try {
    const client = await window.initSupabase();
    const { data, error } = await client.functions.invoke('pin-login', { body: { user_id: userId, pin } });
    if (error) throw error;
    if (!data?.token_hash) throw new Error(data?.error || 'Sign-in failed. Check your user ID and PIN.');
    const { data: authData, error: verifyError } = await client.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' });
    if (verifyError) throw verifyError;
    const { data: profile, error: profileError } = await client.from('profiles').select('id,display_name,role,active').eq('id', authData.user.id).single();
    if (profileError) throw profileError;
    if (!profile.active) { await client.auth.signOut(); throw new Error('This staff account is disabled. Contact an admin.'); }
    window.currentUserRole = profile.role;
    window.currentUserName = profile.display_name || userId;
    await window.hydrateShellState();
    showSignedInApp(profile, authData.user);
    message.textContent = '';
  } catch (error) {
    message.textContent = 'Sign-in failed. Check your user ID and PIN, or contact your manager.';
    console.error('PIN login failed:', error);
  } finally { button.disabled = false; }
}

async function handleLogout() { await window.shellSignOut(); window.currentUserId = null; window.currentUserRole = 'employee'; window.currentUserName = 'Staff'; }

window.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('login-form');
  form?.addEventListener('submit', handleLogin);
  const staffForm = document.getElementById('staff-create-form');
  staffForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = document.getElementById('staff-create-message');
    const button = document.getElementById('staff-create-submit');
    if (!['manager', 'admin'].includes(window.currentUserRole)) { message.textContent = 'Only a manager or admin can create staff accounts.'; return; }
    const payload = {
      display_name: document.getElementById('staff-display-name').value.trim(),
      email: document.getElementById('staff-email').value.trim(),
      password: document.getElementById('staff-password').value,
      role: document.getElementById('staff-role').value
    };
    button.disabled = true; message.textContent = 'Creating account…';
    try {
      const client = await window.initSupabase();
      const { data, error } = await client.functions.invoke('manage-staff', { body: payload });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      staffForm.reset();
      if (window.currentUserRole !== 'admin') document.getElementById('staff-role').value = 'employee';
      message.textContent = `Created ${data.user.display_name} (${data.user.role}). Share the temporary password securely and ask them to change it.`;
    } catch (error) {
      message.textContent = error.message || 'Could not create the account. Check the Edge Function deployment and permissions.';
    } finally { button.disabled = false; }
  });
  const message = document.getElementById('login-message');
  try {
    if (!window.SUPABASE_CONFIG?.url || !window.SUPABASE_CONFIG?.publishableKey) {
      if (message) message.textContent = 'Setup needed: add your Supabase URL and publishable key in js/supabase-config.js.';
      return;
    }
    const client = await window.initSupabase();
    const { data: { session } } = await client.auth.getSession();
    if (!session) return;
    const { data: profile, error } = await client.from('profiles').select('id,display_name,role,active').eq('id', session.user.id).single();
    if (error || !profile?.active) { await client.auth.signOut(); return; }
    window.currentUserRole = profile.role;
    window.currentUserName = profile.display_name || session.user.email?.split('@')[0] || 'Staff';
    await window.hydrateShellState();
    showSignedInApp(profile, session.user);
  } catch (error) {
    if (message) message.textContent = error.message || 'Supabase setup is incomplete.';
  }
});
