-- The Shell: align Staff ID + PIN login, role model and profile permissions.
-- Safe to run after the existing 20261029/20261030 migrations; statements are repeatable.

create extension if not exists pgcrypto;

alter table public.profiles add column if not exists user_id text;
alter table public.profiles add column if not exists pin_hash text;
alter table public.profiles add column if not exists must_change_pin boolean not null default true;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists avatar_path text;

-- The current product roles are Developer, Boss, Manager and Employee.
alter table public.profiles drop constraint if exists profiles_role_check;
-- Migrate the earlier prototype's admin role to the new Boss role before constraining values.
update public.profiles set role = 'boss' where role = 'admin';
alter table public.profiles add constraint profiles_role_check
  check (role in ('developer','boss','manager','employee'));

create unique index if not exists profiles_user_id_unique
  on public.profiles (lower(user_id)) where user_id is not null;

-- Column grants must include every field selected by auth.js and profile.js.
revoke all on public.profiles from anon, authenticated;
grant select (id, user_id, display_name, role, active, must_change_pin,
              avatar_url, avatar_path, created_at, updated_at)
  on public.profiles to authenticated;
grant update (display_name, avatar_url, avatar_path)
  on public.profiles to authenticated;

-- Leadership can read team profiles; employees can read only their own profile.
drop policy if exists "profile self or management read" on public.profiles;
create policy "profile self or management read" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.current_app_role() in ('manager','boss','developer'));

-- Managers can administer operational notices; Boss/Developer retain oversight.
drop policy if exists staff_update_non_manager_app_state on public.app_state;
drop policy if exists "staff update non-manager app state" on public.app_state;
create policy "staff update operational app state" on public.app_state
  for update to authenticated
  using (public.current_app_role() is not null and
    (key not in ('shell-home-stock-alerts-v1','shell-allergy-notes-v1') or public.current_app_role() in ('manager','boss','developer')))
  with check (public.current_app_role() is not null and updated_by = (select auth.uid()) and
    (key not in ('shell-home-stock-alerts-v1','shell-allergy-notes-v1') or public.current_app_role() in ('manager','boss','developer')));
drop policy if exists "manager insert protected app state" on public.app_state;
create policy "leadership insert protected app state" on public.app_state
  for insert to authenticated
  with check (key in ('shell-home-stock-alerts-v1','shell-allergy-notes-v1') and
    public.current_app_role() in ('manager','boss','developer') and updated_by = (select auth.uid()));
drop policy if exists "manager delete app state" on public.app_state;
create policy "leadership delete app state" on public.app_state
  for delete to authenticated
  using (public.current_app_role() in ('manager','boss','developer'));

-- Secure PIN hash helper: executable only by the service role Edge Functions.
create or replace function public.hash_staff_pin(plain_pin text)
returns text
language plpgsql security definer set search_path = '' as $$
begin
  if plain_pin is null or plain_pin !~ '^[0-9]{4,8}$' then
    raise exception 'PIN must contain 4–8 digits';
  end if;
  return extensions.crypt(plain_pin, extensions.gen_salt('bf', 10));
end;
$$;
revoke all on function public.hash_staff_pin(text) from public, anon, authenticated;
grant execute on function public.hash_staff_pin(text) to service_role;

-- Drop the incompatible historical versions, then create the exact contract used by pin-login.
drop function if exists public.verify_staff_pin(text, text);
create function public.verify_staff_pin(login_user_id text, supplied_pin text)
returns table (staff_id uuid, staff_email text, force_pin_change boolean)
language sql security definer set search_path = '' as $$
  select p.id, u.email::text, p.must_change_pin
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.active = true
    and lower(p.user_id) = lower(trim(login_user_id))
    and p.pin_hash is not null
    and supplied_pin ~ '^[0-9]{4,8}$'
    and p.pin_hash = extensions.crypt(supplied_pin, p.pin_hash)
  limit 1;
$$;
revoke all on function public.verify_staff_pin(text, text) from public, anon, authenticated;
grant execute on function public.verify_staff_pin(text, text) to service_role;

-- First sign-in PIN rotation; users can only change their own PIN.
create or replace function public.complete_first_pin_change(new_pin text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if new_pin is null or new_pin !~ '^[0-9]{4,8}$' then raise exception 'PIN must contain 4–8 digits'; end if;
  update public.profiles
    set pin_hash = extensions.crypt(new_pin, extensions.gen_salt('bf', 10)), must_change_pin = false
    where id = auth.uid() and active = true and must_change_pin = true;
  if not found then raise exception 'First-login PIN change is not pending for this account'; end if;
end;
$$;
revoke all on function public.complete_first_pin_change(text) from public, anon;
grant execute on function public.complete_first_pin_change(text) to authenticated;

create or replace function public.set_my_pin(new_pin text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if new_pin is null or new_pin !~ '^[0-9]{4,8}$' then raise exception 'PIN must contain 4–8 digits'; end if;
  update public.profiles
    set pin_hash = extensions.crypt(new_pin, extensions.gen_salt('bf', 10))
    where id = auth.uid() and active = true and must_change_pin = false;
  if not found then raise exception 'Complete your first-login PIN change or contact leadership'; end if;
end;
$$;
revoke all on function public.set_my_pin(text) from public, anon;
grant execute on function public.set_my_pin(text) to authenticated;

-- Lightweight audit trail for high-value configuration and profile changes.
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  table_name text not null,
  record_key text,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;
drop policy if exists audit_logs_leadership_read on public.audit_logs;
create policy audit_logs_leadership_read on public.audit_logs
  for select to authenticated
  using (public.current_app_role() in ('developer','boss'));

create or replace function public.write_shell_audit_log()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  old_json jsonb;
  new_json jsonb;
  key_value text;
begin
  if tg_op <> 'INSERT' then old_json := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then new_json := to_jsonb(new); end if;
  -- Never store PIN hashes or other credential material in the audit trail.
  if old_json is not null then old_json := old_json - 'pin_hash'; end if;
  if new_json is not null then new_json := new_json - 'pin_hash'; end if;
  key_value := coalesce(new_json->>'id', old_json->>'id', new_json->>'key', old_json->>'key');
  insert into public.audit_logs(actor_id, table_name, record_key, action, before_data, after_data)
  values (auth.uid(), tg_table_name, key_value, tg_op, old_json, new_json);
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

 drop trigger if exists profiles_audit on public.profiles;
create trigger profiles_audit after insert or update or delete on public.profiles
for each row execute function public.write_shell_audit_log();
drop trigger if exists checklist_templates_audit on public.checklist_templates;
create trigger checklist_templates_audit after insert or update or delete on public.checklist_templates
for each row execute function public.write_shell_audit_log();
drop trigger if exists app_state_audit on public.app_state;
create trigger app_state_audit after insert or update or delete on public.app_state
for each row execute function public.write_shell_audit_log();

