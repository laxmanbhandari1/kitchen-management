/* THE SHELL - SUPABASE STAFF ID + PIN AUTHENTICATION */

window.currentUserRole = "employee";
window.currentUserName = "Staff";
window.currentUserId = null;
window.forcePinChange = false;

/* --------------------------------
   SHOW SIGNED-IN APPLICATION
-------------------------------- */

function showSignedInApp(profile, user) {
  window.currentUserRole = profile.role;
  window.currentUserName =
    profile.display_name || user.email?.split("@")[0] || "Staff";
  window.currentUserId = user.id;

  document.getElementById("login-screen")?.classList.remove("active");
  document.getElementById("intro-screen")?.classList.remove("active");
  document.getElementById("main-app")?.classList.add("active");
  document.getElementById("bottom-nav")?.classList.add("visible");

  const welcome = document.getElementById("welcome-text");
  if (welcome) {
    welcome.innerText = `Welcome, ${window.currentUserName}`;
  }

  const roleText = document.getElementById("role-text");
  if (roleText) {
    roleText.innerText = `${profile.role[0].toUpperCase()}${profile.role.slice(1)} View`;
  }

  const adminNav = document.getElementById("nav-admin");

  if (adminNav) {
    adminNav.classList.toggle("hidden", profile.role === "employee");
  }

  const adminTitle = document.querySelector("#view-admin > .section-title");

  if (adminTitle) {
    const titles = {
      developer: "Developer Dashboard",
      boss: "Boss Dashboard",
      manager: "Manager Dashboard",
      admin: "Admin Dashboard",
    };

    adminTitle.textContent = titles[profile.role] || "Leadership Dashboard";
  }

  const staffRole = document.getElementById("staff-role");

  if (staffRole) {
    [...staffRole.options].forEach((option) => {
      if (profile.role === "developer") {
        option.hidden = false;
      } else if (profile.role === "boss") {
        option.hidden = !["employee", "manager"].includes(option.value);
      } else {
        option.hidden = option.value !== "employee";
      }
    });

    if (profile.role === "boss") {
      staffRole.value = "employee";
    }
  }

  const avatar = document.querySelector(".header-avatar");

  if (avatar) {
    const initials = window.currentUserName
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();

    avatar.innerHTML = `<span class="avatar-initial">${initials}</span>`;
  }

  if (typeof window.refreshShellProfile === "function") {
    window.refreshShellProfile();
  }

  if (typeof window.refreshHomeNotices === "function") {
    window.refreshHomeNotices();
  }

  if (typeof window.refreshShellAdminTools === "function") {
    window.refreshShellAdminTools();
  }

  if (profile.role === "employee") {
    switchTab("home", document.querySelector(".nav-item"));
  } else if (adminNav) {
    switchTab("admin", adminNav);
  }
}

/* --------------------------------
   STAFF ID + PIN LOGIN
-------------------------------- */

async function handleLogin(event) {
  if (event) event.preventDefault();

  const userId = document.getElementById("login-user-id")?.value.trim();

  const pin = document.getElementById("login-pin")?.value.trim();

  const message = document.getElementById("login-message");
  const button = document.getElementById("login-submit");

  if (!userId || !/^\d{4,8}$/.test(pin || "")) {
    message.textContent = "Enter your Staff ID and a 4–8 digit PIN.";
    return;
  }

  button.disabled = true;
  message.textContent = "Signing in…";

  try {
    const client = await window.initSupabase();

    /*
      IMPORTANT:
      The Edge Function expects staffId and pin.
      Do not change staffId to user_id here.
    */

    const { data, error } = await client.functions.invoke("pin-login", {
      body: {
        staffId: userId,
        pin: pin,
      },
    });

    if (error) {
      console.error("PIN Edge Function error:", error);
      throw new Error(
        data?.error || error.message || "PIN login request failed.",
      );
    }

    if (!data?.token_hash) {
      throw new Error(data?.error || "Invalid Staff ID or PIN.");
    }

    /*
      Exchange the one-time token for a real Supabase session.
    */

    const { data: authData, error: verifyError } = await client.auth.verifyOtp({
      token_hash: data.token_hash,
      type: "magiclink",
    });

    if (verifyError) {
      console.error("Supabase session error:", verifyError);
      throw new Error("Could not create your login session. Please try again.");
    }

    if (!authData?.user) {
      throw new Error("Supabase did not return a valid user session.");
    }

    /*
      Read the actual profile and first-login PIN requirement.
    */

    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("id, display_name, role, active, must_change_pin")
      .eq("id", authData.user.id)
      .single();

    if (profileError || !profile) {
      console.error("Profile loading error:", profileError);
      await client.auth.signOut();
      throw new Error("Could not load your staff profile.");
    }

    if (!profile.active) {
      await client.auth.signOut();
      throw new Error("This staff account is disabled. Contact your manager.");
    }

    window.currentUserRole = profile.role;
    window.currentUserName = profile.display_name || userId;
    window.currentUserId = authData.user.id;

    /*
      Get the first-login PIN requirement from the database.
    */

    window.forcePinChange = profile.must_change_pin === true;

    /*
      Load shared application data.
    */

    await window.hydrateShellState();

    showSignedInApp(profile, authData.user);

    /*
      Require temporary PIN change on first login.
    */

    if (window.forcePinChange) {
      alert(
        "Welcome to The Shell. For account security, " +
          "you must change your temporary PIN before continuing.",
      );

      const profileNav = document.getElementById("nav-profile");

      if (profileNav) {
        switchTab("profile", profileNav);
      } else {
        switchTab("profile");
      }
    }

    message.textContent = "";
  } catch (error) {
    console.error("PIN login failed:", error);

    message.textContent =
      error.message ||
      "Sign-in failed. Check your Staff ID and PIN, or contact your manager.";
  } finally {
    button.disabled = false;
  }
}

/* --------------------------------
   LOGOUT
-------------------------------- */

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

/* --------------------------------
   CREATE STAFF ACCOUNTS
-------------------------------- */

async function handleStaffCreation(event) {
  event.preventDefault();

  const message = document.getElementById("staff-create-message");

  const button = document.getElementById("staff-create-submit");

  if (!["boss", "developer"].includes(window.currentUserRole)) {
    message.textContent =
      "Only Boss or Developer accounts can create staff accounts.";
    return;
  }

  const payload = {
    display_name: document.getElementById("staff-display-name").value.trim(),

    email: document.getElementById("staff-email").value.trim(),

    user_id: document.getElementById("staff-user-id").value.trim(),

    pin: document.getElementById("staff-initial-pin").value,

    role: document.getElementById("staff-role").value,
  };

  button.disabled = true;
  message.textContent = "Creating account…";

  try {
    const client = await window.initSupabase();

    const { data, error } = await client.functions.invoke("manage-staff", {
      body: payload,
    });

    if (error) {
      console.error("Staff creation error:", error);
      throw new Error(
        data?.error || error.message || "Account creation failed.",
      );
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    document.getElementById("staff-create-form").reset();

    if (window.currentUserRole !== "developer") {
      document.getElementById("staff-role").value = "employee";
    }

    message.textContent = `Account created successfully. Give the staff member their Staff ID and temporary PIN. They must change their PIN on first login.`;
  } catch (error) {
    console.error("Staff creation failed:", error);

    message.textContent = error.message || "Could not create the account.";
  } finally {
    button.disabled = false;
  }
}

/* --------------------------------
   RESTORE EXISTING SESSION
-------------------------------- */

async function restoreExistingSession() {
  const message = document.getElementById("login-message");

  try {
    if (
      !window.SUPABASE_CONFIG?.url ||
      !window.SUPABASE_CONFIG?.publishableKey
    ) {
      if (message) {
        message.textContent =
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
      .select("id, display_name, role, active, must_change_pin")
      .eq("id", session.user.id)
      .single();

    if (profileError || !profile || !profile.active) {
      await client.auth.signOut();
      return;
    }

    window.forcePinChange = profile.must_change_pin === true;

    await window.hydrateShellState();

    showSignedInApp(profile, session.user);

    if (window.forcePinChange) {
      alert("You must change your temporary PIN before continuing.");

      const profileNav = document.getElementById("nav-profile");

      if (profileNav) {
        switchTab("profile", profileNav);
      }
    }
  } catch (error) {
    console.error("Session restoration failed:", error);

    if (message) {
      message.textContent = error.message || "Could not restore your session.";
    }
  }
}

/* --------------------------------
   INITIALISE AUTHENTICATION
-------------------------------- */

window.addEventListener("DOMContentLoaded", async () => {
  const loginForm = document.getElementById("login-form");

  loginForm?.addEventListener("submit", handleLogin);

  const staffForm = document.getElementById("staff-create-form");

  staffForm?.addEventListener("submit", handleStaffCreation);

  await restoreExistingSession();
});
