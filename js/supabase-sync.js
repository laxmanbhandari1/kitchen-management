/* Supabase connection + shared persistence adapter for existing The Shell screens. */
(function () {
  const CONFIG = window.SUPABASE_CONFIG || {};
  window.supabaseClient = null;
  window.supabaseReady = false;
  window.supabaseSyncError = '';
  let syncEnabled = false;
  let originalSetItem;
  let syncTimer = null;
  let realtimeChannel = null;
  const pending = new Map();
  const isAppKey = (key) => typeof key === 'string' && key.startsWith('shell');
  const protectedKeys = new Set(['shell-home-stock-alerts-v1', 'shell-allergy-notes-v1']);

  window.initSupabase = async function () {
    if (!CONFIG.url || !CONFIG.publishableKey) throw new Error('Supabase is not configured yet. Add the project URL and publishable key in js/supabase-config.js.');
    if (!window.supabase?.createClient) throw new Error('Supabase client library did not load. Check your internet connection.');
    if (!window.supabaseClient) window.supabaseClient = window.supabase.createClient(CONFIG.url, CONFIG.publishableKey, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
    });
    return window.supabaseClient;
  };

  async function pushKey(key, rawValue) {
    if (!syncEnabled || !window.supabaseClient || !isAppKey(key)) return;
    let value;
    try { value = JSON.parse(rawValue); } catch { return; }
    const { data: { user } } = await window.supabaseClient.auth.getUser();
    if (!user) return;
    const { error } = await window.supabaseClient.from('app_state').upsert({ key, value, updated_by: user.id }, { onConflict: 'key' });
    if (error) {
      window.supabaseSyncError = error.message;
      console.error('The Shell sync error:', key, error.message);
      pending.set(key, rawValue); // keep latest local value for retry after connection returns
      window.dispatchEvent(new CustomEvent('shell:sync-error', { detail: { key, message: error.message } }));
      return false;
    }
    return true;
  }

  async function flushPending() {
    const entries = [...pending.entries()];
    pending.clear();
    for (const [key, raw] of entries) await pushKey(key, raw);
  }

  function queuePush(key, rawValue) {
    if (!syncEnabled || !isAppKey(key)) return;
    if (protectedKeys.has(key) && !['manager', 'admin'].includes(window.currentUserRole)) return;
    pending.set(key, rawValue);
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      await flushPending();
    }, 150);
  }

  function installStorageAdapter() {
    if (originalSetItem) return;
    originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      originalSetItem.call(this, key, value);
      if (this === window.localStorage) queuePush(String(key), String(value));
    };
  }

  window.hydrateShellState = async function () {
    const client = await window.initSupabase();
    syncEnabled = false;
    installStorageAdapter();
    const { data, error } = await client.from('app_state').select('key,value');
    if (error) throw error;
    const remoteKeys = new Set((data || []).map(row => row.key));
    for (const row of (data || [])) {
      if (isAppKey(row.key)) originalSetItem.call(window.localStorage, row.key, JSON.stringify(row.value));
    }
    installStorageAdapter();
    syncEnabled = true;
    window.supabaseReady = true;
    // First-login migration: upload existing browser-only records if no shared copy exists yet.
    const localEntries = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (isAppKey(key) && !remoteKeys.has(key) && (!protectedKeys.has(key) || ['manager', 'admin'].includes(window.currentUserRole))) {
        localEntries.push([key, window.localStorage.getItem(key)]);
      }
    }
    for (const [key, raw] of localEntries) await pushKey(key, raw);
    if (realtimeChannel) await window.supabaseClient.removeChannel(realtimeChannel);
    realtimeChannel = window.supabaseClient.channel('shell-app-state-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_state' }, (payload) => {
        const row = payload.new;
        if (row?.key && isAppKey(row.key) && !pending.has(row.key)) {
          if (payload.eventType === 'DELETE') originalSetItem.call(window.localStorage, row.key, 'null');
          else originalSetItem.call(window.localStorage, row.key, JSON.stringify(row.value));
          if (typeof window.refreshHomeNotices === 'function') window.refreshHomeNotices();
          window.dispatchEvent(new CustomEvent('shell:state-updated', { detail: { key: row.key } }));
        }
      }).subscribe();
  };

  window.stopShellSync = function () { syncEnabled = false; };
  window.shellSignOut = async function () {
    syncEnabled = false;
    if (window.supabaseClient) await window.supabaseClient.auth.signOut();
    document.getElementById('main-app')?.classList.remove('active');
    document.getElementById('login-screen')?.classList.add('active');
  };

  window.addEventListener('online', async () => {
    if (!syncEnabled) return;
    try { await flushPending(); await window.hydrateShellState(); } catch (e) { console.warn('Reconnect sync failed:', e.message); }
  });
})();
