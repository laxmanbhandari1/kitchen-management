/* Shared persistence adapter (Group A).
   - Screens retain their existing localStorage format.
   - Each changed item is saved individually.
   - Changes use optimistic version checking.
   - Pending changes persist on the device.
   - Failed writes remain queued.
   - Local pending edits are protected during hydration.
   - Conflicts are recorded instead of silently overwritten.
*/
(function () {
  "use strict";

  const CONFIG = window.SUPABASE_CONFIG || {};

  window.supabaseClient = null;
  window.supabaseReady = false;
  window.supabaseSyncError = "";

  const ITEM_KEYS = new Set([
    "shell.dailyStock.v1",
    "shell.toiletChecks.v1",
    "shell.fohOpening.v1",
    "shell.fohCleaning.v1",
    "shell.kitchenDownChecklists.v1",
    "shell.kitchenUpOpening.v1",
    "shell.kitchenUpCleaning.v1",
  ]);

  const NOTICE_KEYS = new Set([
    "shell-home-stock-alerts-v1",
    "shell-allergy-notes-v1",
  ]);

  const LEADERS = ["manager", "boss", "developer"];
  const TOMB = "__deleted";

  const isLeader = () => LEADERS.includes(window.currentUserRole);

  const isItemKey = (k) => ITEM_KEYS.has(k);
  const isNoticeKey = (k) => NOTICE_KEYS.has(k);

  let uid = null;
  let syncEnabled = false;
  let originalSetItem = null;
  let flushTimer = null;
  let flushing = false;
  let flushAgain = false;
  let channels = [];
  let retryDelay = 2000;

  // Persistent per-user sync state

  const sk = (name) => `shell.sync.${name}.v3.${uid}`;

  const load = (name, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(sk(name))) ?? fallback;
    } catch (_) {
      return fallback;
    }
  };

  const save = (name, value) => {
    try {
      (originalSetItem || Storage.prototype.setItem).call(
        localStorage,
        sk(name),
        JSON.stringify(value),
      );
    } catch (e) {
      console.warn("Could not persist sync state", e);
    }
  };

  const rawGet = (key) => {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch (_) {
      return null;
    }
  };

  const rawSet = (key, value) => {
    originalSetItem.call(
      localStorage,
      key,
      typeof value === "string" ? value : JSON.stringify(value),
    );
  };

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  const idOf = (appKey, date, item) => `${appKey}|${date}|${item}`;

  const queue = () => load("queue", {});
  const versions = () => load("versions", {});
  const conflicts = () => load("conflicts", []);

  // Supabase initialization

  window.initSupabase = async function () {
    if (!CONFIG.url || !CONFIG.publishableKey) {
      throw new Error(
        "Supabase is not configured. Check js/supabase-config.js.",
      );
    }

    if (!window.supabase?.createClient) {
      throw new Error("Supabase client library did not load.");
    }

    if (!window.supabaseClient) {
      window.supabaseClient = window.supabase.createClient(
        CONFIG.url,
        CONFIG.publishableKey,
        {
          auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true,
          },
        },
      );
    }

    return window.supabaseClient;
  };

  // Update the existing localStorage blob

  function setLocalItem(appKey, date, item, value) {
    const blob = rawGet(appKey) || {};

    if (value === undefined) {
      if (blob[date]) {
        delete blob[date][item];

        if (!Object.keys(blob[date]).length) {
          delete blob[date];
        }
      }
    } else {
      blob[date] = blob[date] || {};
      blob[date][item] = value;
    }

    rawSet(appKey, blob);
  }

  // Queue individual item changes

  function enqueueBlobChange(appKey, prevRaw, nextRaw) {
    let prev = {};
    let next;

    try {
      prev = JSON.parse(prevRaw) || {};
    } catch (_) {}

    try {
      next = JSON.parse(nextRaw);
    } catch (_) {
      return;
    }

    if (!next || typeof next !== "object" || Array.isArray(next)) {
      return;
    }

    const q = queue();
    let changed = false;

    const now = new Date().toISOString();

    const dates = new Set([...Object.keys(prev), ...Object.keys(next)]);

    for (const date of dates) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        continue;
      }

      const a = prev[date] && typeof prev[date] === "object" ? prev[date] : {};

      const b = next[date] && typeof next[date] === "object" ? next[date] : {};

      const items = new Set([...Object.keys(a), ...Object.keys(b)]);

      for (const item of items) {
        if (same(a[item], b[item])) continue;

        const id = idOf(appKey, date, item);

        q[id] = {
          appKey,
          date,
          item,
          value: b[item] === undefined ? { [TOMB]: true } : b[item],
          queuedAt: now + ":" + Math.random().toString(36).slice(2, 7),
        };

        changed = true;
      }
    }

    if (changed) {
      save("queue", q);
      scheduleFlush(200);
      renderStatus();
    }
  }

  // Only explicitly approved leadership notices use app_state

  function enqueueNotice(key, raw) {
    if (!isNoticeKey(key) || !isLeader()) return;

    let value;

    try {
      value = JSON.parse(raw);
    } catch (_) {
      return;
    }

    const q = queue();

    q[key] = {
      notice: true,
      appKey: key,
      value,
      queuedAt: new Date().toISOString(),
    };

    save("queue", q);
    scheduleFlush(200);
    renderStatus();
  }

  // Queue and retry handling

  function scheduleFlush(ms) {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flushPending, ms);
  }

  const isNetworkError = (e) =>
    e instanceof TypeError ||
    /failed to fetch|network|load failed/i.test(e?.message || "") ||
    navigator.onLine === false;

  const isConflict = (e) => /VERSION_CONFLICT/.test(e?.message || "");

  function dropOp(id, entry) {
    const q = queue();

    if (q[id]?.queuedAt === entry.queuedAt) {
      delete q[id];
      save("queue", q);
    }
  }

  function recordConflict(conflict) {
    const list = conflicts();

    list.push({
      ...conflict,
      at: new Date().toISOString(),
    });

    save("conflicts", list.slice(-50));
  }

  // Save one operational item with optimistic version checking

  async function pushItem(id, entry, client) {
    const v = versions();
    const expected = Number(v[id] || 0);

    const { data, error } = await client.rpc("update_operational_item", {
      p_app_key: entry.appKey,
      p_item_key: entry.item,
      p_work_date: entry.date,
      p_value: entry.value,
      p_expected_version: expected,
    });

    if (!error) {
      const newVersion = Array.isArray(data)
        ? data[0]?.new_version
        : data?.new_version;

      const updated = versions();
      updated[id] = newVersion;

      save("versions", updated);
      dropOp(id, entry);

      return "ok";
    }

    if (!isConflict(error)) {
      throw error;
    }

    // Fetch the other device's version

    const { data: row, error: readError } = await client
      .from("operational_items")
      .select("value,version")
      .eq("app_key", entry.appKey)
      .eq("item_key", entry.item)
      .eq("work_date", entry.date)
      .maybeSingle();

    if (readError) throw readError;

    const updated = versions();

    if (!row) {
      updated[id] = 0;
      save("versions", updated);
      return "retry";
    }

    updated[id] = row.version;
    save("versions", updated);

    if (same(row.value, entry.value)) {
      dropOp(id, entry);
      return "ok";
    }

    recordConflict({
      id,
      appKey: entry.appKey,
      date: entry.date,
      item: entry.item,
      mine: entry.value,
      theirs: row.value,
    });

    const theirs = row.value && row.value[TOMB] ? undefined : row.value;

    setLocalItem(entry.appKey, entry.date, entry.item, theirs);

    dropOp(id, entry);

    window.dispatchEvent(
      new CustomEvent("shell:state-updated", {
        detail: { key: entry.appKey },
      }),
    );

    window.dispatchEvent(
      new CustomEvent("shell:sync-conflict", {
        detail: { id },
      }),
    );

    return "conflict";
  }

  // Save leadership notices using app_state only

  async function pushNotice(key, entry, client) {
    if (!isNoticeKey(key) || !isLeader()) {
      throw new Error("Unauthorized notice update");
    }

    const known = versions()[key] || null;

    let result;

    if (!known) {
      result = await client
        .from("app_state")
        .insert({
          key,
          value: entry.value,
          updated_by: uid,
        })
        .select("updated_at");

      if (result.error && result.error.code === "23505") {
        result = {
          data: [],
          error: null,
        };
      }
    } else {
      result = await client
        .from("app_state")
        .update({
          value: entry.value,
          updated_by: uid,
        })
        .eq("key", key)
        .eq("updated_at", known)
        .select("updated_at");
    }

    if (result.error) throw result.error;

    if (result.data?.length) {
      const updated = versions();

      updated[key] = result.data[0].updated_at;

      save("versions", updated);
      dropOp(key, entry);

      return "ok";
    }

    const { data: row, error } = await client
      .from("app_state")
      .select("value,updated_at")
      .eq("key", key)
      .maybeSingle();

    if (error) throw error;

    const updated = versions();

    updated[key] = row?.updated_at || null;

    save("versions", updated);

    if (row && !same(row.value, entry.value)) {
      recordConflict({
        id: key,
        appKey: key,
        mine: entry.value,
        theirs: row.value,
      });

      rawSet(key, row.value);

      window.refreshHomeNotices?.();

      window.dispatchEvent(
        new CustomEvent("shell:sync-conflict", {
          detail: { id: key },
        }),
      );
    }

    dropOp(key, entry);

    return row ? "ok" : "retry";
  }

  // Flush without losing failed operations

  async function flushPending() {
    if (!syncEnabled || !uid || !window.supabaseClient) {
      return;
    }

    if (flushing) {
      flushAgain = true;
      return;
    }

    flushing = true;

    try {
      const client = window.supabaseClient;

      const {
        data: { session },
      } = await client.auth.getSession();

      if (!session?.user || session.user.id !== uid) {
        return;
      }

      let failed = false;

      for (const [id, entry] of Object.entries(queue())) {
        try {
          // Reject legacy or invalid queue entries.
          if (entry.notice) {
            if (!isNoticeKey(id) || !isLeader()) {
              continue;
            }
          } else if (!isItemKey(entry.appKey) || !entry.date || !entry.item) {
            continue;
          }

          let result = entry.notice
            ? await pushNotice(id, entry, client)
            : await pushItem(id, entry, client);

          if (result === "retry") {
            result = entry.notice
              ? await pushNotice(id, entry, client)
              : await pushItem(id, entry, client);
          }
        } catch (error) {
          failed = true;

          window.supabaseSyncError = error.message || "Sync failed";

          window.dispatchEvent(
            new CustomEvent("shell:sync-error", {
              detail: {
                key: entry.appKey,
                message: window.supabaseSyncError,
              },
            }),
          );

          if (isNetworkError(error)) {
            break;
          }
        }
      }

      if (failed) {
        retryDelay = Math.min(retryDelay * 2, 60000);

        scheduleFlush(retryDelay);
      } else {
        retryDelay = 2000;
        window.supabaseSyncError = "";
      }
    } finally {
      flushing = false;
      renderStatus();

      if (flushAgain) {
        flushAgain = false;
        scheduleFlush(300);
      }
    }
  }

  // Intercept localStorage writes

  function installStorageAdapter() {
    if (originalSetItem) return;

    originalSetItem = Storage.prototype.setItem;

    Storage.prototype.setItem = function (key, value) {
      const k = String(key);

      const watched =
        this === window.localStorage &&
        syncEnabled &&
        (isItemKey(k) || isNoticeKey(k));

      const previous = watched ? this.getItem(k) : null;

      originalSetItem.call(this, key, value);

      if (!watched) return;

      if (isItemKey(k)) {
        enqueueBlobChange(k, previous, String(value));
      } else {
        enqueueNotice(k, String(value));
      }
    };
  }

  // Fetch all operational records

  async function fetchAllItems(client) {
    const rows = [];
    const page = 1000;

    for (let from = 0; ; from += page) {
      const { data, error } = await client
        .from("operational_items")
        .select("app_key,item_key,work_date,value,version")
        .order("work_date", { ascending: true })
        .order("app_key")
        .order("item_key")
        .range(from, from + page - 1);

      if (error) throw error;

      rows.push(...data);

      if (data.length < page) break;
    }

    return rows;
  }

  // Hydrate without overwriting pending local edits

  window.hydrateShellState = async function () {
    const client = await window.initSupabase();

    const {
      data: { user },
    } = await client.auth.getUser();

    if (!user) {
      throw new Error("Authentication required");
    }

    syncEnabled = false;
    uid = user.id;

    installStorageAdapter();

    const rows = await fetchAllItems(client);

    const q = queue();
    const vers = versions();

    const remote = {};
    const nextVers = {};

    for (const row of rows) {
      const id = idOf(row.app_key, row.work_date, row.item_key);

      nextVers[id] = row.version;

      remote[row.app_key] ||= {};
      remote[row.app_key][row.work_date] ||= {};

      if (!(row.value && row.value[TOMB])) {
        remote[row.app_key][row.work_date][row.item_key] = row.value;
      }
    }

    for (const appKey of ITEM_KEYS) {
      const local = rawGet(appKey) || {};
      const merged = remote[appKey] || {};

      for (const date of Object.keys(local)) {
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          !local[date] ||
          typeof local[date] !== "object"
        ) {
          continue;
        }

        for (const item of Object.keys(local[date])) {
          const id = idOf(appKey, date, item);
          const known = id in nextVers;

          if (q[id]) {
            const value = q[id].value;

            (merged[date] ||= {})[item] =
              value && value[TOMB] ? undefined : value;

            if (merged[date][item] === undefined) {
              delete merged[date][item];
            }
          } else if (!known && !(id in vers)) {
            (merged[date] ||= {})[item] = local[date][item];

            q[id] = {
              appKey,
              date,
              item,
              value: local[date][item],
              queuedAt: new Date().toISOString() + ":init",
            };
          }
        }
      }

      // Restore pending items even when absent locally

      for (const id of Object.keys(q)) {
        const entry = q[id];

        if (entry.appKey !== appKey || entry.notice) {
          continue;
        }

        if (!(entry.value && entry.value[TOMB])) {
          (merged[entry.date] ||= {})[entry.item] = entry.value;
        }
      }

      rawSet(appKey, merged);
    }

    save("queue", q);

    save("versions", {
      ...nextVers,
      ...Object.fromEntries(
        Object.entries(vers).filter(([key]) => NOTICE_KEYS.has(key)),
      ),
    });

    // Load leadership notices

    const { data: notices, error: noticeError } = await client
      .from("app_state")
      .select("key,value,updated_at")
      .in("key", [...NOTICE_KEYS]);

    if (noticeError) throw noticeError;

    const updated = versions();

    for (const notice of notices || []) {
      updated[notice.key] = notice.updated_at;

      if (!q[notice.key]) {
        rawSet(notice.key, notice.value);
      }
    }

    save("versions", updated);

    syncEnabled = true;
    window.supabaseReady = true;

    for (const key of NOTICE_KEYS) {
      const present = (notices || []).some((n) => n.key === key);

      const raw = localStorage.getItem(key);

      if (!present && raw && isLeader() && !queue()[key]) {
        enqueueNotice(key, raw);
      }
    }

    await flushPending();
    await subscribeRealtime(client);

    renderStatus();
    window.refreshHomeNotices?.();
  };

  // Realtime subscriptions

  async function subscribeRealtime(client) {
    for (const channel of channels) {
      try {
        await client.removeChannel(channel);
      } catch (_) {}
    }

    channels = [];

    const itemChannel = client
      .channel("shell-items-live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "operational_items",
        },
        (payload) => {
          const row = payload.new;

          if (!row?.app_key || !isItemKey(row.app_key)) {
            return;
          }

          const id = idOf(row.app_key, row.work_date, row.item_key);

          const vv = versions();

          if (Number(vv[id] || 0) >= row.version) {
            return;
          }

          vv[id] = row.version;
          save("versions", vv);

          if (queue()[id]) return;

          setLocalItem(
            row.app_key,
            row.work_date,
            row.item_key,
            row.value && row.value[TOMB] ? undefined : row.value,
          );

          window.dispatchEvent(
            new CustomEvent("shell:state-updated", {
              detail: { key: row.app_key },
            }),
          );
        },
      )
      .subscribe();

    channels.push(itemChannel);

    const noticeChannel = client
      .channel("shell-notices-live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "app_state",
        },
        (payload) => {
          const row = payload.new;

          if (!row?.key || !isNoticeKey(row.key) || queue()[row.key]) {
            return;
          }

          const vv = versions();

          vv[row.key] = row.updated_at;

          save("versions", vv);
          rawSet(row.key, row.value);

          window.refreshHomeNotices?.();

          window.dispatchEvent(
            new CustomEvent("shell:state-updated", {
              detail: { key: row.key },
            }),
          );
        },
      )
      .subscribe();

    channels.push(noticeChannel);
  }

  // Sync status and conflict review

  function renderStatus() {
    if (!uid) return;

    let el = document.getElementById("shell-sync-status");

    const pendingCount = Object.keys(queue()).length;
    const conflictCount = conflicts().length;

    if (!pendingCount && !conflictCount) {
      el?.remove();
      return;
    }

    if (!el) {
      el = document.createElement("div");
      el.id = "shell-sync-status";

      el.setAttribute("role", "status");

      el.style.cssText =
        "position:fixed;left:12px;right:12px;bottom:12px;" +
        "z-index:9999;background:#1f2937;color:#fff;" +
        "border-radius:12px;padding:10px 14px;" +
        "font:14px system-ui,sans-serif;display:flex;" +
        "gap:10px;align-items:center;justify-content:space-between;" +
        "box-shadow:0 4px 16px rgba(0,0,0,.35)";

      document.body.appendChild(el);
    }

    el.replaceChildren();

    const message = document.createElement("span");

    message.textContent = [
      pendingCount
        ? `${pendingCount} change${pendingCount > 1 ? "s" : ""} waiting to sync${navigator.onLine === false ? " (offline)" : ""}`
        : "",
      conflictCount
        ? `${conflictCount} edit${conflictCount > 1 ? "s were" : " was"} changed on another device`
        : "",
    ]
      .filter(Boolean)
      .join(" · ");

    el.appendChild(message);

    const box = document.createElement("span");

    const makeButton = (label, callback) => {
      const button = document.createElement("button");

      button.type = "button";
      button.textContent = label;

      button.style.cssText =
        "background:#fff;color:#111;border:0;" +
        "border-radius:8px;padding:6px 10px;" +
        "font-weight:600;margin-left:6px";

      button.addEventListener("click", callback);

      return button;
    };

    if (pendingCount) {
      box.appendChild(makeButton("Retry", () => flushPending()));
    }

    if (conflictCount) {
      box.appendChild(makeButton("Review", reviewConflicts));
    }

    el.appendChild(box);
  }

  // Resolve conflicts without losing either version

  function reviewConflicts() {
    const list = conflicts();

    if (!list.length) return;

    const conflict = list[0];

    const label = conflict.date
      ? `${conflict.item} on ${conflict.date}`
      : conflict.appKey;

    const format = (value) => {
      try {
        return JSON.stringify(value).slice(0, 300);
      } catch (_) {
        return String(value);
      }
    };

    const keepMine = window.confirm(
      `Another device changed ${label} first.\n\n` +
        `Their value (now showing):\n${format(conflict.theirs)}\n\n` +
        `Your value:\n${format(conflict.mine)}\n\n` +
        `OK = re-apply YOUR value\n` +
        `Cancel = keep THEIR value`,
    );

    save("conflicts", list.slice(1));

    if (keepMine) {
      if (conflict.date) {
        setLocalItem(
          conflict.appKey,
          conflict.date,
          conflict.item,
          conflict.mine,
        );

        const q = queue();

        q[conflict.id] = {
          appKey: conflict.appKey,
          date: conflict.date,
          item: conflict.item,
          value: conflict.mine,
          queuedAt: new Date().toISOString() + ":redo",
        };

        save("queue", q);

        window.dispatchEvent(
          new CustomEvent("shell:state-updated", {
            detail: { key: conflict.appKey },
          }),
        );
      } else if (isLeader() && isNoticeKey(conflict.appKey)) {
        rawSet(conflict.appKey, conflict.mine);

        const q = queue();

        q[conflict.appKey] = {
          notice: true,
          appKey: conflict.appKey,
          value: conflict.mine,
          queuedAt: new Date().toISOString() + ":redo",
        };

        save("queue", q);

        window.refreshHomeNotices?.();
      }

      scheduleFlush(100);
    }

    renderStatus();
  }

  // Sign out safely

  window.stopShellSync = () => {
    syncEnabled = false;
  };

  window.shellSignOut = async function () {
    try {
      if (syncEnabled) {
        await Promise.race([
          flushPending(),
          new Promise((resolve) => setTimeout(resolve, 4000)),
        ]);
      }
    } catch (_) {}

    syncEnabled = false;

    document.getElementById("shell-sync-status")?.remove();

    for (const channel of channels) {
      try {
        await window.supabaseClient.removeChannel(channel);
      } catch (_) {}
    }

    channels = [];
    uid = null;

    if (window.supabaseClient) {
      await window.supabaseClient.auth.signOut();
    }

    document.getElementById("main-app")?.classList.remove("active");

    document.getElementById("login-screen")?.classList.add("active");
  };

  window.getShellSyncStatus = () => ({
    pending: uid ? Object.keys(queue()).length : 0,
    conflicts: uid ? conflicts().length : 0,
    online: navigator.onLine,
  });

  // Automatic reconnect and retry

  window.addEventListener("online", () => {
    renderStatus();
    flushPending();
  });

  window.addEventListener("offline", renderStatus);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      flushPending();
    }
  });

  setInterval(() => {
    if (syncEnabled && uid && Object.keys(queue()).length) {
      flushPending();
    }
  }, 30000);
})();
