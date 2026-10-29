import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json({ error: 'Server environment is not configured.' }, 500);

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Sign in first.' }, 401);

  const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser(token);
  if (callerError || !callerData.user) return json({ error: 'Invalid session.' }, 401);

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: callerProfile, error: profileError } = await admin.from('profiles').select('role,active').eq('id', callerData.user.id).single();
  if (profileError || !callerProfile?.active || !['manager', 'admin'].includes(callerProfile.role)) {
    return json({ error: 'Only active managers and admins can manage staff.' }, 403);
  }

  let input: { email?: string; password?: string; display_name?: string; role?: string };
  try { input = await req.json(); } catch { return json({ error: 'Invalid JSON.' }, 400); }
  const email = String(input.email || '').trim().toLowerCase();
  const password = String(input.password || '');
  const displayName = String(input.display_name || '').trim().slice(0, 100);
  const role = String(input.role || 'employee');
  if (!email || !email.includes('@') || password.length < 12 || !displayName) {
    return json({ error: 'Provide a valid email, display name, and password of at least 12 characters.' }, 400);
  }
  if (!['employee', 'manager', 'admin'].includes(role)) return json({ error: 'Invalid role.' }, 400);
  if (role !== 'employee' && callerProfile.role !== 'admin') return json({ error: 'Only an admin can create manager/admin accounts.' }, 403);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { display_name: displayName },
  });
  if (createError || !created.user) return json({ error: createError?.message || 'Could not create account.' }, 400);

  const { error: updateError } = await admin.from('profiles').upsert({
    id: created.user.id, display_name: displayName, role, active: true,
  });
  if (updateError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: 'Account setup failed; the new account was rolled back.' }, 500);
  }
  return json({ user: { id: created.user.id, email, display_name: displayName, role } }, 201);
});
