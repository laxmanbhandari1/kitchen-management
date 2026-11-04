import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL'), anon = Deno.env.get('SUPABASE_ANON_KEY'), secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anon || !secret) return reply({ error: 'PIN reset is not configured on the server.' }, 500);
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return reply({ error: 'Sign in first.' }, 401);
    const caller = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user } } = await caller.auth.getUser(token);
    if (!user) return reply({ error: 'Invalid or expired session.' }, 401);
    const db = createClient(url, secret);
    const { data: actor } = await db.from('profiles').select('role,active').eq('id', user.id).maybeSingle();
    if (!actor?.active || !['boss', 'developer'].includes(actor.role)) return reply({ error: 'Only Boss or Developer can reset staff PINs.' }, 403);
    const body = await req.json();
    const staffId = String(body?.user_id || '').trim(), pin = String(body?.pin || '');
    if (!staffId || !/^\d{4,8}$/.test(pin)) return reply({ error: 'Enter a Staff ID and a 4–8 digit temporary PIN.' }, 400);
    const { data: target, error: targetError } = await db.from('profiles').select('id,role').ilike('user_id', staffId).maybeSingle();
    if (targetError) return reply({ error: `Could not find staff account: ${targetError.message}` }, 500);
    if (!target) return reply({ error: 'Staff account not found.' }, 404);
    if (actor.role === 'boss' && ['boss', 'developer'].includes(target.role)) return reply({ error: 'Boss cannot reset another Boss or Developer PIN.' }, 403);
    const { data: hash, error: hashError } = await db.rpc('hash_staff_pin', { plain_pin: pin });
    if (hashError || !hash) return reply({ error: hashError?.message || 'Could not hash the temporary PIN. Apply the latest migration.' }, 500);
    const { error: updateError } = await db.from('profiles').update({ pin_hash: hash, must_change_pin: true }).eq('id', target.id);
    if (updateError) return reply({ error: `Could not update PIN: ${updateError.message}` }, 500);
    return reply({ success: true, must_change_pin: true });
  } catch (error) {
    console.error('reset-staff-pin error:', error);
    return reply({ error: error instanceof Error ? error.message : 'Unexpected PIN reset error.' }, 500);
  }
});
