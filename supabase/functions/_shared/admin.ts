import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
export const url = Deno.env.get('SUPABASE_URL')!;
export const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
export const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
export async function requireLeader(req: Request) {
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) throw new Error('Authentication required');
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) throw new Error('Authentication required');
  const { data: actor, error: profileError } = await admin.from('profiles').select('id,role,active').eq('id', user.id).single();
  if (profileError || !actor?.active || !['boss','developer'].includes(actor.role)) throw new Error('Boss or Developer access required');
  return { user, actor };
}
export const jsonResponse = (body: unknown, status=200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods':'POST, OPTIONS' } });
