import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  let createdUserId: string | null = null;
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const anon = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anon || !serviceKey) return reply({ error: 'Staff management is not configured on the server.' }, 500);
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return reply({ error: 'Sign in as Boss or Developer first.' }, 401);

    const caller = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user }, error: authError } = await caller.auth.getUser(token);
    if (authError || !user) return reply({ error: 'Your session is invalid or expired. Sign in again.' }, 401);

    const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: actor, error: actorError } = await db.from('profiles').select('role,active').eq('id', user.id).maybeSingle();
    if (actorError) { console.error('Caller profile lookup:', actorError.message); return reply({ error: 'Could not verify your staff permissions.' }, 500); }
    if (!actor?.active || !['boss', 'developer'].includes(actor.role)) return reply({ error: 'Only active Boss or Developer accounts can create staff accounts.' }, 403);

    const body = await req.json();
    const email = String(body?.email || '').trim().toLowerCase();
    const name = String(body?.display_name || '').trim();
    const staffId = String(body?.user_id || '').trim();
    const pin = String(body?.pin || '');
    const role = String(body?.role || 'employee');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply({ error: 'Enter a valid staff email address.' }, 400);
    if (!name || name.length > 100) return reply({ error: 'Enter a staff name (maximum 100 characters).' }, 400);
    if (!/^[A-Za-z0-9_-]{2,40}$/.test(staffId)) return reply({ error: 'Staff ID must be 2–40 characters and use letters, numbers, hyphens or underscores.' }, 400);
    if (!/^\d{4,8}$/.test(pin)) return reply({ error: 'Temporary PIN must contain 4–8 digits.' }, 400);
    if (!['employee', 'manager', 'boss', 'developer'].includes(role)) return reply({ error: 'Select a valid account role.' }, 400);
    if (actor.role === 'boss' && !['employee', 'manager'].includes(role)) return reply({ error: 'Boss can create Employee and Manager accounts. Only Developer can create Boss or Developer accounts.' }, 403);

    const { data: duplicateId, error: duplicateError } = await db.from('profiles').select('id').ilike('user_id', staffId).maybeSingle();
    if (duplicateError) { console.error('Staff ID check failed:', duplicateError.message); return reply({ error: 'Could not check whether this Staff ID is already used.' }, 500); }
    if (duplicateId) return reply({ error: 'That Staff ID is already in use. Choose another one.' }, 409);

    const { data: created, error: createError } = await db.auth.admin.createUser({
      email, email_confirm: true, user_metadata: { display_name: name, staff_user_id: staffId },
    });
    if (createError || !created?.user) {
      console.error('Auth account creation failed:', createError?.message);
      return reply({ error: createError?.message || 'Supabase could not create this email account. Check whether the email is already registered.' }, 400);
    }
    createdUserId = created.user.id;

    const { data: pinHash, error: hashError } = await db.rpc('hash_staff_pin', { plain_pin: pin });
    if (hashError || !pinHash) {
      console.error('PIN hash function failed:', hashError?.message);
      await db.auth.admin.deleteUser(createdUserId); createdUserId = null;
      return reply({ error: hashError?.message || 'Could not securely create the PIN. Apply the latest database migration.' }, 500);
    }

    const { error: profileError } = await db.from('profiles').upsert({
      id: createdUserId, display_name: name, role, active: true,
      user_id: staffId, pin_hash: pinHash, must_change_pin: true,
    }, { onConflict: 'id' });
    if (profileError) {
      console.error('Staff profile save failed:', profileError.message);
      await db.auth.admin.deleteUser(createdUserId); createdUserId = null;
      if (profileError.code === '23505') return reply({ error: 'That Staff ID or email is already registered. Use a unique one.' }, 409);
      return reply({ error: `Could not save staff profile: ${profileError.message}` }, 500);
    }

    return reply({ user: { id: createdUserId, email, user_id: staffId, display_name: name, role, must_change_pin: true } }, 201);
  } catch (error) {
    console.error('manage-staff unexpected error:', error);
    if (createdUserId) {
      try { const url = Deno.env.get('SUPABASE_URL')!; const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!; await createClient(url, key).auth.admin.deleteUser(createdUserId); } catch (_) {}
    }
    return reply({ error: error instanceof Error ? error.message : 'Unexpected staff creation error.' }, 500);
  }
});
