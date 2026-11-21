-- Group A security foundations. Apply after all 2026-11-11 migrations.
create table if not exists public.pin_login_attempts (
  attempt_key text primary key,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.pin_login_attempts enable row level security;
revoke all on public.pin_login_attempts from public, anon, authenticated;

create or replace function public.check_pin_login_lock(p_attempt_key text)
returns table(is_locked boolean, retry_after_seconds integer)
language plpgsql security definer set search_path = '' as $$
declare r public.pin_login_attempts%rowtype;
begin
  if p_attempt_key is null or length(p_attempt_key) < 20 or length(p_attempt_key) > 128 then
    raise exception 'Invalid login attempt key';
  end if;
  select * into r from public.pin_login_attempts where attempt_key=p_attempt_key;
  if not found then return query select false, 0; return; end if;
  if r.locked_until is not null and r.locked_until > now() then
    return query select true, greatest(1, ceil(extract(epoch from (r.locked_until-now())))::integer); return;
  end if;
  if r.locked_until is not null and r.locked_until <= now() then
    delete from public.pin_login_attempts where attempt_key=p_attempt_key;
  end if;
  return query select false, 0;
end; $$;

create or replace function public.record_pin_login_failure(p_attempt_key text)
returns table(is_locked boolean, retry_after_seconds integer)
language plpgsql security definer set search_path = '' as $$
declare n integer; until_at timestamptz;
begin
  insert into public.pin_login_attempts(attempt_key,failed_attempts,updated_at)
  values(p_attempt_key,1,now())
  on conflict(attempt_key) do update set
    failed_attempts=case when public.pin_login_attempts.locked_until is not null and public.pin_login_attempts.locked_until<=now() then 1 else public.pin_login_attempts.failed_attempts+1 end,
    locked_until=case when public.pin_login_attempts.locked_until is not null and public.pin_login_attempts.locked_until<=now() then null else public.pin_login_attempts.locked_until end,
    updated_at=now()
  returning failed_attempts,locked_until into n,until_at;
  if n >= 5 and (until_at is null or until_at <= now()) then
    until_at := now()+interval '15 minutes';
    update public.pin_login_attempts set locked_until=until_at where attempt_key=p_attempt_key;
  end if;
  return query select (until_at is not null and until_at>now()), case when until_at>now() then greatest(1,ceil(extract(epoch from (until_at-now())))::integer) else 0 end;
end; $$;

create or replace function public.clear_pin_login_failures(p_attempt_key text)
returns void language sql security definer set search_path = '' as $$
  delete from public.pin_login_attempts where attempt_key=p_attempt_key;
$$;
revoke all on function public.check_pin_login_lock(text), public.record_pin_login_failure(text), public.clear_pin_login_failures(text) from public, anon, authenticated;
grant execute on function public.check_pin_login_lock(text), public.record_pin_login_failure(text), public.clear_pin_login_failures(text) to service_role;

-- Item-level optimistic-concurrency store. New clients should use this instead of app_state blobs.
create table if not exists public.operational_items (
  app_key text not null check (app_key like 'shell%'),
  item_key text not null,
  work_date date not null,
  value jsonb not null,
  version bigint not null default 1,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key(app_key,item_key,work_date)
);
create index if not exists operational_items_date_idx on public.operational_items(work_date desc);
alter table public.operational_items enable row level security;
revoke all on public.operational_items from anon, public;
grant select, insert, update on public.operational_items to authenticated;
drop policy if exists operational_items_read_staff on public.operational_items;
create policy operational_items_read_staff on public.operational_items for select to authenticated
using (public.current_app_role() is not null);
drop policy if exists operational_items_insert_staff on public.operational_items;
create policy operational_items_insert_staff on public.operational_items for insert to authenticated
with check (public.current_app_role() is not null and updated_by=auth.uid());
drop policy if exists operational_items_update_staff on public.operational_items;
create policy operational_items_update_staff on public.operational_items for update to authenticated
using (public.current_app_role() is not null)
with check (public.current_app_role() is not null and updated_by=auth.uid());

create or replace function public.update_operational_item(
  p_app_key text,p_item_key text,p_work_date date,p_value jsonb,p_expected_version bigint
) returns table(new_version bigint)
language plpgsql security invoker set search_path = '' as $$
declare v bigint;
begin
  if auth.uid() is null or public.current_app_role() is null then raise exception 'Authentication required'; end if;
  if p_app_key not like 'shell%' or length(p_item_key)>200 then raise exception 'Invalid item key'; end if;
  if p_expected_version=0 then
    insert into public.operational_items(app_key,item_key,work_date,value,version,updated_by)
    values(p_app_key,p_item_key,p_work_date,p_value,1,auth.uid())
    on conflict do nothing returning version into v;
  else
    update public.operational_items set value=p_value,version=version+1,updated_by=auth.uid(),updated_at=now()
    where app_key=p_app_key and item_key=p_item_key and work_date=p_work_date and version=p_expected_version
    returning version into v;
  end if;
  if v is null then raise exception 'VERSION_CONFLICT: this item changed on another device. Reload and reconcile your edit.'; end if;
  return query select v;
end; $$;
grant execute on function public.update_operational_item(text,text,date,jsonb,bigint) to authenticated;

-- Audit rows preserve the authenticated actor for browser-originated staff/profile changes.
create or replace function public.write_shell_audit_log()
returns trigger language plpgsql security definer set search_path = '' as $$
declare old_json jsonb; new_json jsonb; key_value text; actor uuid;
begin
 if tg_op<>'INSERT' then old_json:=to_jsonb(old); end if;
 if tg_op<>'DELETE' then new_json:=to_jsonb(new); end if;
 if old_json is not null then old_json:=old_json-'pin_hash'; end if;
 if new_json is not null then new_json:=new_json-'pin_hash'; end if;
 key_value:=coalesce(new_json->>'id',old_json->>'id',new_json->>'key',old_json->>'key');
 actor:=auth.uid();
 insert into public.audit_logs(actor_id,table_name,record_key,action,before_data,after_data)
 values(actor,tg_table_name,key_value,tg_op,old_json,new_json);
 if tg_op='DELETE' then return old; else return new; end if;
end; $$;

-- Restrict compatibility JSON writes to known operational namespaces. Protected notices remain leadership-only.
drop policy if exists "staff insert non-manager app state" on public.app_state;
drop policy if exists "staff update operational app state" on public.app_state;
drop policy if exists "leadership insert protected app state" on public.app_state;
drop policy if exists "leadership delete app state" on public.app_state;
create policy app_state_insert_allowlisted on public.app_state for insert to authenticated
with check (
  updated_by=auth.uid() and (
    key in ('shell.dailyStock.v1','shell.toiletChecks.v1','shell.fohOpening.v1','shell.fohCleaning.v1',
            'shell.kitchenDownChecklists.v1','shell.kitchenUpOpening.v1','shell.kitchenUpCleaning.v1')
    or (key in ('shell-home-stock-alerts-v1','shell-allergy-notes-v1') and public.current_app_role() in ('manager','boss','developer'))
  )
);
create policy app_state_update_allowlisted on public.app_state for update to authenticated
using (
  public.current_app_role() is not null and (
    key in ('shell.dailyStock.v1','shell.toiletChecks.v1','shell.fohOpening.v1','shell.fohCleaning.v1',
            'shell.kitchenDownChecklists.v1','shell.kitchenUpOpening.v1','shell.kitchenUpCleaning.v1')
    or (key in ('shell-home-stock-alerts-v1','shell-allergy-notes-v1') and public.current_app_role() in ('manager','boss','developer'))
  )
)
with check (updated_by=auth.uid() and public.current_app_role() is not null);
create policy app_state_delete_leadership on public.app_state for delete to authenticated
using (public.current_app_role() in ('manager','boss','developer'));

-- Audit normalized item writes with the authenticated actor.
drop trigger if exists operational_items_audit on public.operational_items;
create trigger operational_items_audit after insert or update or delete on public.operational_items
for each row execute function public.write_shell_audit_log();

-- Trusted Edge Functions call this explicitly after privileged staff mutations so the initiating
-- human is recorded even though the database request itself uses the service role.
create or replace function public.write_staff_admin_audit(
  p_actor_id uuid,p_action text,p_target_id uuid,p_metadata jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_actor_id is null or p_action not in ('staff_created','pin_reset') then raise exception 'Invalid audit event'; end if;
  if not exists(select 1 from public.profiles where id=p_actor_id and active=true and role in ('boss','developer')) then
    raise exception 'Actor is not authorized';
  end if;
  insert into public.audit_logs(actor_id,table_name,record_key,action,before_data,after_data)
  values(p_actor_id,'profiles',p_target_id::text,'UPDATE',null,jsonb_build_object('event',p_action,'metadata',coalesce(p_metadata,'{}'::jsonb)));
end; $$;
revoke all on function public.write_staff_admin_audit(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.write_staff_admin_audit(uuid,text,uuid,jsonb) to service_role;
