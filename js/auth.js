/* The Shell authentication: staff-facing sign-in is Staff ID + PIN only.
   Supabase Auth email accounts are created server-side and are never entered at login. */
window.currentUserRole = 'employee';
window.currentUserName = 'Staff';
window.currentUserId = null;
window.forcePinChange = false;

const SHELL_ROLE_LABELS = { employee: 'Employee', manager: 'Manager', boss: 'Boss', developer: 'Developer' };
const $shell = (id) => document.getElementById(id);

function shellInitials(name) {
  return (String(name || 'S').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('') || 'S').toUpperCase();
}

function showSignedInApp(profile, user) {
  window.currentUserRole = profile.role;
  window.currentUserName = profile.display_name || profile.user_id || 'Staff';
  window.currentUserId = user.id;
  window.forcePinChange = !!profile.must_change_pin;
  ['login-screen', 'intro-screen'].forEach(id => $shell(id)?.classList.remove('active'));
  $shell('main-app')?.classList.add('active');
  $shell('bottom-nav')?.classList.add('visible');
  if ($shell('welcome-text')) $shell('welcome-text').textContent = `Welcome, ${window.currentUserName}`;
  if ($shell('role-text')) $shell('role-text').textContent = `${SHELL_ROLE_LABELS[profile.role] || 'Staff'} View`;

  const adminNav = $shell('nav-admin');
  if (adminNav) adminNav.classList.toggle('hidden', profile.role === 'employee');
  const leadershipShortcuts = $shell('leadership-home-shortcuts');
  if (leadershipShortcuts) leadershipShortcuts.hidden = profile.role === 'employee';
  const adminTitle = document.querySelector('#view-admin > .section-title');
  if (adminTitle) adminTitle.textContent = profile.role === 'manager' ? 'Manager Dashboard' : `${SHELL_ROLE_LABELS[profile.role] || 'Leadership'} Dashboard`;

  const roleSelect = $shell('staff-role');
  if (roleSelect) {
    [...roleSelect.options].forEach(option => {
      const allowed = profile.role === 'developer'
        ? ['employee', 'manager', 'boss', 'developer'].includes(option.value)
        : ['employee', 'manager'].includes(option.value);
      option.hidden = !allowed;
    });
    if (profile.role !== 'developer' && ['boss', 'developer'].includes(roleSelect.value)) roleSelect.value = 'employee';
  }
  const avatar = document.querySelector('.header-avatar');
  if (avatar && !avatar.querySelector('img')) avatar.innerHTML = `<span class="avatar-initial">${shellInitials(window.currentUserName)}</span>`;
  window.refreshShellProfile?.();
  window.refreshHomeNotices?.();
  window.refreshShellAdminTools?.();

  if (window.forcePinChange) {
    switchTab('profile', $shell('nav-profile'));
    const note = $shell('profile-first-pin-notice');
    if (note) note.hidden = false;
  } else switchTab('home', document.querySelector('#bottom-nav .nav-item'));
}

async function handleLogin(event) {
  event?.preventDefault();
  const userId = $shell('login-user-id')?.value.trim();
  const pin = $shell('login-pin')?.value || '';
  const message = $shell('login-message');
  const button = $shell('login-submit');
  if (!userId || !/^\d{4,8}$/.test(pin)) { if (message) message.textContent = 'Enter your Staff ID and 4–8 digit PIN.'; return; }
  if (button) button.disabled = true;
  if (message) message.textContent = 'Signing in…';
  try {
    const client = await window.initSupabase();
    const { data, error } = await client.functions.invoke('pin-login', { body: { user_id: userId, pin } });
    if (error) {
      let detail = error.message;
      try { const context = error.context; if (context?.json) { const body = await context.json(); detail = body.error || detail; } } catch (_) {}
      throw new Error(detail || 'PIN sign-in failed.');
    }
    if (!data?.token_hash) throw new Error(data?.error || 'Invalid Staff ID or PIN.');
    const { data: authData, error: verifyError } = await client.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' });
    if (verifyError) throw verifyError;
    const { data: profile, error: profileError } = await client.from('profiles')
      .select('id,user_id,display_name,role,active,must_change_pin,avatar_url,avatar_path')
      .eq('id', authData.user.id).single();
    if (profileError) throw new Error(`Could not load staff profile: ${profileError.message}`);
    if (!profile?.active) { await client.auth.signOut(); throw new Error('This staff account is disabled. Contact leadership.'); }
    await window.hydrateShellState();
    showSignedInApp(profile, authData.user);
    if (message) message.textContent = '';
  } catch (error) {
    if (message) message.textContent = error.message || 'Sign-in failed. Check your Staff ID and PIN.';
    console.error('PIN login failed:', error);
  } finally { if (button) button.disabled = false; }
}

async function handleLogout() {
  await window.shellSignOut();
  window.currentUserId = null; window.currentUserRole = 'employee'; window.currentUserName = 'Staff'; window.forcePinChange = false;
}

window.addEventListener('DOMContentLoaded', async () => {
  $shell('login-form')?.addEventListener('submit', handleLogin);
  const staffForm = $shell('staff-create-form');
  staffForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const message = $shell('staff-create-message'); const button = $shell('staff-create-submit');
    if (!['boss', 'developer'].includes(window.currentUserRole)) { message.textContent = 'Only Boss or Developer can create staff accounts.'; return; }
    const payload = {
      display_name: $shell('staff-display-name').value.trim(),
      email: $shell('staff-email').value.trim(),
      user_id: $shell('staff-user-id').value.trim(),
      pin: $shell('staff-initial-pin').value,
      role: $shell('staff-role').value
    };
    if (!payload.display_name || !payload.email || !payload.user_id || !/^\d{4,8}$/.test(payload.pin)) {
      message.textContent = 'Complete every field and enter a 4–8 digit temporary PIN.'; return;
    }
    button.disabled = true; message.textContent = 'Creating account…';
    try {
      const client = await window.initSupabase();
      const { data, error } = await client.functions.invoke('manage-staff', { body: payload });
      if (error) {
        let detail = error.message;
        try { if (error.context?.json) { const body = await error.context.json(); detail = body.error || detail; } } catch (_) {}
        throw new Error(detail);
      }
      if (data?.error) throw new Error(data.error);
      staffForm.reset();
      if (window.currentUserRole !== 'developer') $shell('staff-role').value = 'employee';
      message.textContent = `Created ${data.user.display_name} (${SHELL_ROLE_LABELS[data.user.role] || data.user.role}). Give them their Staff ID and temporary PIN. They must change it at first sign-in.`;
      window.refreshShellAdminTools?.();
    } catch (error) {
      message.textContent = error.message || 'Could not create the account. Check the manage-staff Edge Function logs.';
      console.error('Staff creation failed:', error);
    } finally { button.disabled = false; }
  });

  const loginMessage = $shell('login-message');
  try {
    if (!window.SUPABASE_CONFIG?.url || !window.SUPABASE_CONFIG?.publishableKey) {
      if (loginMessage) loginMessage.textContent = 'Setup needed: add your Supabase URL and publishable key in js/supabase-config.js.';
      return;
    }
    const client = await window.initSupabase();
    const { data: { session } } = await client.auth.getSession();
    if (!session) return;
    const { data: profile, error } = await client.from('profiles')
      .select('id,user_id,display_name,role,active,must_change_pin,avatar_url,avatar_path')
      .eq('id', session.user.id).single();
    if (error || !profile?.active) { await client.auth.signOut(); if (loginMessage && error) loginMessage.textContent = `Profile access error: ${error.message}`; return; }
    await window.hydrateShellState();
    showSignedInApp(profile, session.user);
  } catch (error) { if (loginMessage) loginMessage.textContent = error.message || 'Supabase setup is incomplete.'; }
});
