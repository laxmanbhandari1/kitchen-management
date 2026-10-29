import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  try {
    const { user_id, pin } = await req.json();
    if (typeof user_id !== "string" || user_id.trim().length < 2 || user_id.length > 80 || typeof pin !== "string" || !/^\d{4,8}$/.test(pin)) {
      return new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("Server configuration missing");
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: matches, error: verifyError } = await admin.rpc("verify_staff_pin", { login_user_id: user_id.trim(), supplied_pin: pin });
    if (verifyError) throw verifyError;
    const match = matches?.[0];
    if (!match?.staff_email) return new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: match.staff_email });
    if (linkError || !link?.properties?.hashed_token) throw linkError || new Error("Could not create session");
    return new Response(JSON.stringify({ token_hash: link.properties.hashed_token }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("pin-login error", error);
    return new Response(JSON.stringify({ error: "Sign-in is temporarily unavailable" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
