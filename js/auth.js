/* THE SHELL - Authentication
   Staff sign in using Staff ID + PIN.
   Supabase Auth accounts are created securely by the Edge Functions.
*/

window.currentUserRole = "employee";
window.currentUserName = "Staff";
window.currentUserId = null;
window.forcePinChange = false;

const SHELL_ROLE_LABELS = {
  employee: "Employee",
  manager: "Manager",
  boss: "Boss",
  developer: "Developer",
};

const $shell = (id) => document.getElementById(id);

function shellInitials(name) {
  return (
    String(name || "S")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((x) => x[0])
      .join("") || "S"
  ).toUpperCase();
}

function shellValidStaffId(userId) {
  return /^[A-Za-z0-9_-]{3,30}$/.test(userId);
}

function shellValidPin(pin) {
  return /^\d{4,8}$/.test(pin);
}

async function shellReadFunctionError(error) {
  let detail = error?.message || "Request failed.";

  try {
    const context = error?.context;

    if (context) {
      if (typeof context.clone === "function") {
        const response = context.clone();
        const body = await response.json();
        detail = body?.error || body?.message || detail;
      } else if (typeof context.json === "function") {
        const body = await context.json();
        detail = body?.error || body?.message || detail;
      }
    }
  } catch (_) {
    // Keep the original error message.
  }

  return detail;
}

function showSignedInApp(profile, user) {
  window.currentUserRole = profile.role;
  window.currentUserName = profile.display_name || profile.user_id || "Staff";
  window.currentUserId = user.id;
  window.forcePinChange = !!profile.must_change_pin;

  ["login-screen", "intro-screen"].forEach((id) => {
    $shell(id)?.classList.remove("active");
  });

  $shell("main-app")?.classList.add("active");
  $shell("bottom-nav")?.classList.add("visible");

  if ($shell("welcome-text")) {
    $shell("welcome-text").textContent = `Welcome, ${window.currentUserName}`;
  }

  if ($shell("role-text")) {
    $shell("role-text").textContent =
      `${SHELL_ROLE_LABELS[profile.role] || "Staff"} View`;
  }

  const adminNav = $shell("nav-admin");

  if (adminNav) {
    adminNav.classList.toggle("hidden", profile.role === "employee");
  }

  const adminTitle = document.querySelector("#view-admin > .section-title");

  if (adminTitle) {
    adminTitle.textContent =
      profile.role === "manager"
        ? "Manager Dashboard"
        : `${SHELL_ROLE_LABELS[profile.role] || "Leadership"} Dashboard`;
  }

  const roleSelect = $shell("staff-role");

  if (roleSelect) {
    [...roleSelect.options].forEach((option) => {
      const allowed =
        profile.role === "developer"
          ? ["employee", "manager", "boss", "developer"].includes(option.value)
          : ["employee", "manager"].includes(option.value);

      option.hidden = !allowed;
    });

    if (
      profile.role !== "developer" &&
      ["boss", "developer"].includes(roleSelect.value)
    ) {
      roleSelect.value = "employee";
    }
  }

  const avatar = document.querySelector(".header-avatar");

  if (avatar && !avatar.querySelector("img")) {
    avatar.innerHTML = `<span class="avatar-initial">${shellInitials(window.currentUserName)}</span>`;
  }

  window.refreshShellProfile?.();
  window.refreshHomeNotices?.();
  window.refreshShellAdminTools?.();

  if (window.forcePinChange) {
    switchTab("profile", $shell("nav-profile"));

    const note = $shell("profile-first-pin-notice");

    if (note) note.hidden = false;
  } else if (profile.role === "employee") {
    switchTab("home", document.querySelector(".nav-item"));
  } else if (adminNav) {
    switchTab("admin", adminNav);
  }
}

/* STAFF LOGIN */

async function handleLogin(event) {
  event?.preventDefault();

  const userId = ($shell("login-user-id")?.value || "").trim().toUpperCase();

  const pin = ($shell("login-pin")?.value || "").trim();

  const message = $shell("login-message");
  const button = $shell("login-submit");

  // Validate Staff ID.
  if (!shellValidStaffId(userId)) {
    if (message) {
      message.textContent = "Enter a valid Staff ID (3–30 letters or numbers).";
    }
    return;
  }

  // Validate PIN.
  if (!shellValidPin(pin)) {
    if (message) {
      message.textContent = "Your PIN must contain exactly 4–8 digits.";
    }
    return;
  }

  if (button) button.disabled = true;
  if (message) message.textContent = "Signing in…";

  try {
    if (typeof window.initSupabase !== "function") {
      throw new Error("Supabase has not been initialized.");
    }

    const client = await window.initSupabase();

    // Call the PIN login Edge Function.
    const { data, error } = await client.functions.invoke("pin-login", {
      body: {
        user_id: userId,
        pin: pin,
      },
    });

    if (error) {
      throw new Error(await shellReadFunctionError(error));
    }

    if (!data || data.error) {
      throw new Error(data?.error || "Invalid Staff ID or PIN.");
    }

    if (!data.token_hash) {
      throw new Error("Login response did not contain a valid sign-in token.");
    }

    // Verify the one-time Supabase login token.
    const { data: authData, error: verifyError } = await client.auth.verifyOtp({
      token_hash: data.token_hash,
      type: "magiclink",
    });

    if (verifyError) {
      throw new Error(`Login verification failed: ${verifyError.message}`);
    }

    if (!authData?.user) {
      throw new Error("Supabase did not return a signed-in user.");
    }

    // Load the signed-in staff profile.
    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select(
        "id,user_id,display_name,role,active,must_change_pin,avatar_url,avatar_path",
      )
      .eq("id", authData.user.id)
      .single();

    if (profileError) {
      throw new Error(`Could not load staff profile: ${profileError.message}`);
    }

    if (!profile || !profile.active) {
      await client.auth.signOut();

      throw new Error("This staff account is disabled. Contact leadership.");
    }

    // Load shared application data.
    if (typeof window.hydrateShellState === "function") {
      await window.hydrateShellState();
    }

    showSignedInApp(profile, authData.user);

    if (message) message.textContent = "";
  } catch (error) {
    console.error("PIN login failed:", error);

    if (message) {
      message.textContent =
        error.message || "Sign-in failed. Check your Staff ID and PIN.";
    }
  } finally {
    if (button) button.disabled = false;
  }
}

/* LOGOUT */

async function handleLogout() {
  try {
    await window.shellSignOut();
  } finally {
    window.currentUserId = null;
    window.currentUserRole = "employee";
    window.currentUserName = "Staff";
    window.forcePinChange = false;
  }
}

/* CREATE STAFF ACCOUNT */

async function handleStaffCreation(event) {
  event.preventDefault();

  const message = $shell("staff-create-message");
  const button = $shell("staff-create-submit");
  const staffForm = $shell("staff-create-form");

  if (!["boss", "developer"].includes(window.currentUserRole)) {
    if (message) {
      message.textContent =
        "Only Boss or Developer accounts can create staff accounts.";
    }
    return;
  }

  const payload = {
    display_name: ($shell("staff-display-name")?.value || "").trim(),
    email: ($shell("staff-email")?.value || "").trim().toLowerCase(),
    user_id: ($shell("staff-user-id")?.value || "").trim().toUpperCase(),
    pin: ($shell("staff-initial-pin")?.value || "").trim(),
    role: $shell("staff-role")?.value || "employee",
  };

  if (!payload.display_name) {
    if (message) message.textContent = "Enter the staff member’s name.";
    return;
  }

  if (!payload.email) {
    if (message) message.textContent = "Enter the staff member’s email.";
    return;
  }

  if (!shellValidStaffId(payload.user_id)) {
    if (message) {
      message.textContent = "Staff ID must be 3–30 letters, numbers, _ or -.";
    }
    return;
  }

  if (!shellValidPin(payload.pin)) {
    if (message) {
      message.textContent = "Temporary PIN must contain 4–8 digits.";
    }
    return;
  }

  if (button) button.disabled = true;
  if (message) message.textContent = "Creating staff account…";

  try {
    const client = await window.initSupabase();

    const { data, error } = await client.functions.invoke("manage-staff", {
      body: payload,
    });

    if (error) {
      throw new Error(await shellReadFunctionError(error));
    }

    if (!data || data.error) {
      throw new Error(data?.error || "Could not create staff account.");
    }

    if (!data.success || !data.user) {
      throw new Error("The server did not confirm staff account creation.");
    }

    staffForm?.reset();

    if (window.currentUserRole !== "developer" && $shell("staff-role")) {
      $shell("staff-role").value = "employee";
    }

    if (message) {
      message.textContent =
        `Created ${data.user.display_name} (${SHELL_ROLE_LABELS[data.user.role] || data.user.role}). ` +
        `Staff ID: ${data.user.user_id}. Give them their temporary PIN.`;
    }

    window.refreshShellAdminTools?.();
  } catch (error) {
    console.error("Staff creation failed:", error);

    if (message) {
      message.textContent =
        error.message ||
        "Could not create the account. Check the manage-staff Edge Function logs.";
    }
  } finally {
    if (button) button.disabled = false;
  }
}

/* PAGE INITIALIZATION */

window.addEventListener("DOMContentLoaded", async () => {
  $shell("login-form")?.addEventListener("submit", handleLogin);

  $shell("staff-create-form")?.addEventListener("submit", handleStaffCreation);

  const loginMessage = $shell("login-message");

  try {
    if (
      !window.SUPABASE_CONFIG?.url ||
      !window.SUPABASE_CONFIG?.publishableKey
    ) {
      if (loginMessage) {
        loginMessage.textContent =
          "Setup needed: add your Supabase URL and publishable key in js/supabase-config.js.";
      }
      return;
    }

    const client = await window.initSupabase();

    const {
      data: { session },
      error: sessionError,
    } = await client.auth.getSession();

    if (sessionError) throw sessionError;

    if (!session) return;

    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select(
        "id,user_id,display_name,role,active,must_change_pin,avatar_url,avatar_path",
      )
      .eq("id", session.user.id)
      .single();

    if (profileError || !profile?.active) {
      await client.auth.signOut();

      if (loginMessage && profileError) {
        loginMessage.textContent = `Profile access error: ${profileError.message}`;
      }

      return;
    }

    if (typeof window.hydrateShellState === "function") {
      await window.hydrateShellState();
    }

    showSignedInApp(profile, session.user);
  } catch (error) {
    console.error("Supabase initialization failed:", error);

    if (loginMessage) {
      loginMessage.textContent =
        error.message || "Supabase setup is incomplete.";
    }
  }
});
