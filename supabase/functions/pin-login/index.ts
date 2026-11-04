import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  try {
    const body = await req.json();
    const userId = typeof body?.user_id === 'string' ? body.user_id.trim() : '';
    const pin = typeof body?.pin === 'string' ? body.pin : '';
    if (userId.length < 2 || userId.length > 80 || !/^\d{4,8}$/.test(pin)) return reply({ error: 'Enter a valid Staff ID and 4–8 digit PIN.' }, 400);

    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) return reply({ error: 'PIN login is not configured on the server.' }, 500);
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    // Must match the SQL function argument names and TABLE return shape exactly.
    const { data: matches, error: verifyError } = await admin.rpc('verify_staff_pin', {
      login_user_id: userId,
      supplied_pin: pin,
    });
    if (verifyError) {
      console.error('verify_staff_pin failed:', verifyError.message);
      return reply({ error: 'PIN verification is unavailable. Ask an administrator to check the database migration.' }, 500);
    }
    const match = Array.isArray(matches) ? matches[0] : matches;
    if (!match?.staff_id || !match?.staff_email) return reply({ error: 'Invalid Staff ID or PIN.' }, 401);

    const { data: profile, error: profileError } = await admin.from('profiles')
      .select('active,must_change_pin').eq('id', match.staff_id).maybeSingle();
    if (profileError) { console.error('Profile lookup failed:', profileError.message); return reply({ error: 'Could not load staff account.' }, 500); }
    if (!profile?.active) return reply({ error: 'This staff account is disabled. Contact leadership.' }, 403);

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email: match.staff_email });
    const tokenHash = linkData?.properties?.hashed_token;
    if (linkError || !tokenHash) {
      console.error('Session token generation failed:', linkError?.message);
      return reply({ error: 'Could not start the staff session.' }, 500);
    }
    return reply({ token_hash: tokenHash, type: 'magiclink', must_change_pin: !!profile.must_change_pin });
  } catch (error) {
    console.error('pin-login unexpected error:', error);
    return reply({ error: 'Sign-in is temporarily unavailable.' }, 500);
  }
});
