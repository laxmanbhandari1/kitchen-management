/* Profile, picture upload, password and PIN settings. Requires the Supabase profile-settings migration. */
(function () {
  const $ = (id) => document.getElementById(id);
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  let profilePicturePath = null;
  let profileEmail = '';

  function setMessage(id, message, isError = false) {
    const el = $(id); if (!el) return;
    el.textContent = message;
    el.classList.toggle('error', isError);
  }
  function initials(name) {
    return (String(name || 'S').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('') || 'S').toUpperCase();
  }
  function setPicture(url, name) {
    const img = $('profile-avatar-image'); const fallback = $('profile-avatar-fallback');
    const header = document.querySelector('.header-avatar');
    if (img && url) { img.src = url; img.hidden = false; fallback.hidden = true; }
    else if (img && fallback) { img.removeAttribute('src'); img.hidden = true; fallback.hidden = false; fallback.textContent = initials(name); }
    if (header) {
      if (url) { header.innerHTML = `<img src="${String(url).replace(/"/g, '&quot;')}" alt="" />`; }
      else header.innerHTML = `<span class="avatar-initial">${initials(name)}</span>`;
    }
  }
  async function loadProfile() {
    if (!window.currentUserId || !window.supabaseClient) return;
    const { data, error } = await window.supabaseClient.from('profiles').select('id,display_name,role,avatar_url,avatar_path,active').eq('id', window.currentUserId).single();
    if (error) { setMessage('profile-message', `Could not load profile: ${error.message}`, true); return; }
    profilePicturePath = data.avatar_path || null;
    profileEmail = window.supabaseClient.auth.getUser ? (await window.supabaseClient.auth.getUser()).data.user?.email || '' : '';
    const name = data.display_name || window.currentUserName || 'Staff';
    $('profile-display-name').textContent = name;
    $('profile-email-label').textContent = profileEmail;
    $('profile-role-pill').textContent = `${data.role[0].toUpperCase()}${data.role.slice(1)}${data.active ? '' : ' · Disabled'}`;
    $('profile-name-input').value = name;
    setPicture(data.avatar_url || '', name);
  }
  async function saveName() {
    const name = $('profile-name-input').value.trim();
    if (!name) { setMessage('profile-message', 'Please enter your display name.', true); return; }
    const button = $('profile-save-button'); button.disabled = true;
    try {
      const client = await window.initSupabase();
      const { error } = await client.from('profiles').update({ display_name: name }).eq('id', window.currentUserId);
      if (error) throw error;
      window.currentUserName = name;
      $('welcome-text').textContent = `Welcome, ${name}`;
      $('profile-display-name').textContent = name;
      setPicture($('profile-avatar-image').hidden ? '' : $('profile-avatar-image').src, name);
      setMessage('profile-message', 'Your name has been saved.');
    } catch (e) { setMessage('profile-message', e.message || 'Could not save your name.', true); }
    finally { button.disabled = false; }
  }
  async function uploadPicture() {
    const file = $('profile-picture-input').files?.[0];
    if (!file) { setMessage('profile-message', 'Choose a picture first.', true); return; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > MAX_IMAGE_BYTES) {
      setMessage('profile-message', 'Choose a JPG, PNG or WebP image no larger than 5 MB.', true); return;
    }
    const button = $('profile-upload-button'); button.disabled = true; setMessage('profile-message', 'Uploading picture…');
    try {
      const client = await window.initSupabase();
      const path = `${window.currentUserId}/avatar-${Date.now()}.${file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'}`;
      const { error: uploadError } = await client.storage.from('profile-photos').upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' });
      if (uploadError) throw uploadError;
      const { data: publicData } = client.storage.from('profile-photos').getPublicUrl(path);
      const url = `${publicData.publicUrl}?v=${Date.now()}`;
      const { error: updateError } = await client.from('profiles').update({ avatar_url: url, avatar_path: path }).eq('id', window.currentUserId);
      if (updateError) { await client.storage.from('profile-photos').remove([path]); throw updateError; }
      if (profilePicturePath && profilePicturePath !== path) await client.storage.from('profile-photos').remove([profilePicturePath]);
      profilePicturePath = path; setPicture(url, window.currentUserName);
      setMessage('profile-message', 'Profile picture updated.');
      $('profile-picture-input').value = '';
    } catch (e) { setMessage('profile-message', e.message || 'Could not upload picture. Check the profile-photos bucket and policies.', true); }
    finally { button.disabled = false; }
  }
  async function removePicture() {
    if (!profilePicturePath && $('profile-avatar-image').hidden) { setMessage('profile-message', 'You have no profile picture to remove.'); return; }
    try {
      const client = await window.initSupabase();
      const oldPath = profilePicturePath;
      const { error } = await client.from('profiles').update({ avatar_url: null, avatar_path: null }).eq('id', window.currentUserId);
      if (error) throw error;
      if (oldPath) { const { error: storageError } = await client.storage.from('profile-photos').remove([oldPath]); if (storageError) console.warn('Picture metadata removed, but old file could not be deleted:', storageError.message); }
      profilePicturePath = null; setPicture('', window.currentUserName); setMessage('profile-message', 'Profile picture removed.');
    } catch (e) { setMessage('profile-message', e.message || 'Could not remove picture.', true); }
  }
  async function changePassword(event) {
    event.preventDefault();
    const current = $('profile-current-password').value;
    const next = $('profile-new-password').value;
    if (next.length < 8) return setMessage('profile-password-message', 'Use at least 8 characters.', true);
    if (next !== $('profile-confirm-password').value) return setMessage('profile-password-message', 'The new passwords do not match.', true);
    setMessage('profile-password-message', 'Verifying current password…');
    try {
      const client = await window.initSupabase();
      if (!profileEmail) profileEmail = (await client.auth.getUser()).data.user?.email || '';
      const { error: verifyError } = await client.auth.signInWithPassword({ email: profileEmail, password: current });
      if (verifyError) throw new Error('Current password is incorrect.');
      const { error } = await client.auth.updateUser({ password: next });
      if (error) throw error;
      $('profile-password-form').reset(); setMessage('profile-password-message', 'Password changed successfully.');
    } catch (e) { setMessage('profile-password-message', e.message || 'Could not change password.', true); }
  }
  async function changePin(event) {
    event.preventDefault();
    const pin = $('profile-pin-input').value;
    if (!/^\d{4,8}$/.test(pin)) return setMessage('profile-pin-message', 'PIN must be 4–8 digits.', true);
    if (pin !== $('profile-pin-confirm').value) return setMessage('profile-pin-message', 'The PINs do not match.', true);
    setMessage('profile-pin-message', 'Saving PIN securely…');
    try {
      const client = await window.initSupabase();
      const { data: prof } = await client.from('profiles').select('must_change_pin').eq('id', window.currentUserId).single();
      const { error } = await client.rpc(prof?.must_change_pin ? 'complete_first_pin_change' : 'set_my_pin', { new_pin: pin });
      if (error) throw error;
      $('profile-pin-form').reset(); setMessage('profile-pin-message', 'Your PIN has been saved securely.');
    } catch (e) { setMessage('profile-pin-message', e.message || 'Could not save PIN. Apply the profile-settings migration first.', true); }
  }
  window.refreshShellProfile = loadProfile;
  window.addEventListener('DOMContentLoaded', () => {
    $('profile-save-button')?.addEventListener('click', saveName);
    $('profile-upload-button')?.addEventListener('click', uploadPicture);
    $('profile-remove-picture-button')?.addEventListener('click', removePicture);
    $('profile-password-form')?.addEventListener('submit', changePassword);
    $('profile-pin-form')?.addEventListener('submit', changePin);
    document.getElementById('nav-profile')?.addEventListener('click', () => loadProfile());
  });
})();
