import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
Deno.serve(async req=>{
 if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
 if(req.method!=='POST') return reply({error:'Method not allowed'},405);
 const url=Deno.env.get('SUPABASE_URL')!, anon=Deno.env.get('SUPABASE_ANON_KEY')!, secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,''); if(!token) return reply({error:'Sign in required'},401);
 const caller=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}}}); const {data:{user},error}=await caller.auth.getUser(token); if(error||!user) return reply({error:'Invalid session'},401);
 const db=createClient(url,secret); const {data:actor}=await db.from('profiles').select('role,active').eq('id',user.id).single();
 if(!actor?.active||!['boss','developer'].includes(actor.role)) return reply({error:'Only Boss or Developer accounts can create accounts.'},403);
 const body=await req.json(); const email=String(body.email||'').trim().toLowerCase(), name=String(body.display_name||'').trim(), staffId=String(body.user_id||'').trim(), pin=String(body.pin||''), role=String(body.role||'employee');
 if(!email.includes('@')||!name||staffId.length<2||!/^\d{4,8}$/.test(pin)||!['employee','manager','boss','developer'].includes(role)) return reply({error:'Enter a name, valid email, staff ID, 4–8 digit initial PIN and valid role.'},400);
 if(actor.role!=='developer' && ['boss','developer'].includes(role)) return reply({error:'Only Developer can create Boss or Developer accounts.'},403);
 const {data:created,error:createErr}=await db.auth.admin.createUser({email,email_confirm:true,user_metadata:{display_name:name}});
 if(createErr||!created.user) return reply({error:createErr?.message||'Account creation failed'},400);
 const {error:profileErr}=await db.from('profiles').upsert({id:created.user.id,display_name:name,role,active:true,user_id:staffId,pin_hash:await hashPin(pin),must_change_pin:true});
 if(profileErr){await db.auth.admin.deleteUser(created.user.id);return reply({error:profileErr.message},400)}
 return reply({user:{id:created.user.id,email,user_id:staffId,display_name:name,role,must_change_pin:true}},201);
});
async function hashPin(pin:string){const {data,error}=await createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!).rpc('hash_staff_pin',{plain_pin:pin});if(error)throw error;return data;}
