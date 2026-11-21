/* STAGING config template. Copy to js/supabase-config.staging.js (git-ignored) and, when testing,
   load it INSTEAD of supabase-config.js (or temporarily paste these values there on a staging branch).
   Use your separate Supabase STAGING project URL + publishable key only. Never put a service_role key here. */
window.SUPABASE_CONFIG = {
  url: "https://YOUR-STAGING-PROJECT-REF.supabase.co",
  publishableKey: "YOUR-STAGING-PUBLISHABLE-KEY",
};
