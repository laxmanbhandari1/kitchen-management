import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // The frontend sends { user_id, pin }.
    const body = await req.json();
    const user_id = body?.user_id;
    const pin = body?.pin;

    if (
      typeof user_id !== "string" || user_id.trim().length < 2 ||
      user_id.trim().length > 80 || typeof pin !== "string" ||
      !/^\d{4,8}$/.test(pin)
    ) return json({ error: "Invalid staff ID or PIN" }, 400);

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) {
      console.error("Missing Supabase server environment variables");
      return json({ error: "Login service is not configured" }, 500);
    }

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // This matches the SQL function created in SQL Editor:
    // verify_staff_pin(p_user_id text, p_pin text) RETURNS uuid
    const { data: authUserId, error: verifyError } = await admin.rpc(
      "verify_staff_pin",
      { p_user_id: user_id.trim(), p_pin: pin },
    );

    if (verifyError) {
      console.error("verify_staff_pin failed:", verifyError.message);
      return json({ error: "Login service error. Please contact an administrator." }, 500);
    }
    if (!authUserId) return json({ error: "Invalid staff ID or PIN" }, 401);

    const { data: authResult, error: authError } =
      await admin.auth.admin.getUserById(authUserId);
    const email = authResult?.user?.email;
    if (authError || !email) {
      console.error("Could not find linked Auth user:", authError?.message);
      return json({ error: "Staff login account is not configured" }, 401);
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("active, must_change_pin")
      .eq("id", authUserId)
      .single();

    if (profileError || !profile?.active) {
      return json({ error: "This staff account is disabled" }, 403);
    }

    // Generate a one-time magic-link token. No email is sent; the token is
    // returned to the app and exchanged for a normal Supabase Auth session.
    const { data: linkData, error: linkError } =
      await admin.auth.admin.generateLink({ type: "magiclink", email });

    const tokenHash = linkData?.properties?.hashed_token;
    if (linkError || !tokenHash) {
      console.error("Could not generate session token:", linkError?.message);
      return json({ error: "Could not start staff session" }, 500);
    }

    return json({
      token_hash: tokenHash,
      type: "magiclink",
      must_change_pin: !!profile.must_change_pin,
    });
  } catch (error) {
    console.error("pin-login unexpected error:", error);
    return json({ error: "Sign-in is temporarily unavailable" }, 500);
  }
});
