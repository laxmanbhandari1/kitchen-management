-- Group A, part 2: make item-level versioned storage the real write path.
-- Apply AFTER 20261121000100_group_a_hardening.sql. Safe to re-run.

-- 1) One-time import of legacy app_state day-blobs into one row per item (version 1).
--    Shape of every legacy blob: { "YYYY-MM-DD": { "<itemId>": <entry> } }
insert into public.operational_items(app_key, item_key, work_date, value, version, updated_by)
select s.key, i.key, d.key::date, i.value, 1, s.updated_by
from public.app_state s
cross join lateral jsonb_each(case when jsonb_typeof(s.value)='object' then s.value else '{}'::jsonb end) d
cross join lateral jsonb_each(case when jsonb_typeof(d.value)='object' then d.value else '{}'::jsonb end) i
where s.key in ('shell.dailyStock.v1','shell.toiletChecks.v1','shell.fohOpening.v1','shell.fohCleaning.v1',
                'shell.kitchenDownChecklists.v1','shell.kitchenUpOpening.v1','shell.kitchenUpCleaning.v1')
  and d.key ~ '^\d{4}-\d{2}-\d{2}$'
  and length(i.key) <= 200
on conflict do nothing;

-- 2) Employees can no longer write rows directly. The ONLY write path is the versioned RPC,
--    so a stale device can never overwrite a newer edit.
revoke insert, update, delete on public.operational_items from authenticated;
grant select on public.operational_items to authenticated;
drop policy if exists operational_items_insert_staff on public.operational_items;
drop policy if exists operational_items_update_staff on public.operational_items;

create or replace function public.update_operational_item(
  p_app_key text, p_item_key text, p_work_date date, p_value jsonb, p_expected_version bigint
) returns table(new_version bigint)
language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  if auth.uid() is null or public.current_app_role() is null then raise exception 'Authentication required'; end if;
  if p_app_key not in ('shell.dailyStock.v1','shell.toiletChecks.v1','shell.fohOpening.v1','shell.fohCleaning.v1',
                       'shell.kitchenDownChecklists.v1','shell.kitchenUpOpening.v1','shell.kitchenUpCleaning.v1')
    then raise exception 'Invalid app key'; end if;
  if p_item_key is null or length(p_item_key) = 0 or length(p_item_key) > 200 then raise exception 'Invalid item key'; end if;
  if p_value is null or pg_column_size(p_value) > 20000 then raise exception 'Invalid or oversized value'; end if;
  if p_expected_version is null or p_expected_version < 0 then raise exception 'Invalid expected version'; end if;
  if p_expected_version = 0 then
    insert into public.operational_items(app_key,item_key,work_date,value,version,updated_by)
    values(p_app_key,p_item_key,p_work_date,p_value,1,auth.uid())
    on conflict do nothing returning version into v;
  else
    update public.operational_items
       set value=p_value, version=version+1, updated_by=auth.uid(), updated_at=now()
     where app_key=p_app_key and item_key=p_item_key and work_date=p_work_date and version=p_expected_version
    returning version into v;
  end if;
  if v is null then raise exception 'VERSION_CONFLICT: this item changed on another device.'; end if;
  return query select v;
end; $$;
revoke all on function public.update_operational_item(text,text,date,jsonb,bigint) from public, anon;
grant execute on function public.update_operational_item(text,text,date,jsonb,bigint) to authenticated;

-- 3) Legacy blob keys for stock/checklists are no longer client-writable (notice keys stay leadership-only).
drop policy if exists app_state_insert_allowlisted on public.app_state;
drop policy if exists app_state_update_allowlisted on public.app_state;
create policy app_state_insert_allowlisted on public.app_state for insert to authenticated
with check (updated_by=auth.uid() and key in ('shell-home-stock-alerts-v1','shell-allergy-notes-v1')
            and public.current_app_role() in ('manager','boss','developer'));
create policy app_state_update_allowlisted on public.app_state for update to authenticated
using (key in ('shell-home-stock-alerts-v1','shell-allergy-notes-v1') and public.current_app_role() in ('manager','boss','developer'))
with check (updated_by=auth.uid() and key in ('shell-home-stock-alerts-v1','shell-allergy-notes-v1')
            and public.current_app_role() in ('manager','boss','developer'));

-- 4) Audit rows for operational items get a readable record key (item@date).
create or replace function public.write_shell_audit_log()
returns trigger language plpgsql security definer set search_path = '' as $$
declare old_json jsonb; new_json jsonb; key_value text;
begin
 if tg_op<>'INSERT' then old_json:=to_jsonb(old); end if;
 if tg_op<>'DELETE' then new_json:=to_jsonb(new); end if;
 if old_json is not null then old_json:=old_json-'pin_hash'; end if;
 if new_json is not null then new_json:=new_json-'pin_hash'; end if;
 key_value:=coalesce(new_json->>'id',old_json->>'id',new_json->>'key',old_json->>'key',
   coalesce(new_json->>'app_key',old_json->>'app_key')||'|'||coalesce(new_json->>'work_date',old_json->>'work_date')||'|'||coalesce(new_json->>'item_key',old_json->>'item_key'));
 insert into public.audit_logs(actor_id,table_name,record_key,action,before_data,after_data)
 values(auth.uid(),tg_table_name,key_value,tg_op,old_json,new_json);
 if tg_op='DELETE' then return old; else return new; end if;
end; $$;

-- 5) PIN lockout: add a per-account counter (any IP) so rotating IPs cannot brute-force a 4-8 digit PIN.
drop function if exists public.record_pin_login_failure(text);
create or replace function public.record_pin_login_failure(p_attempt_key text, p_max_attempts integer default 5, p_lock_minutes integer default 15)
returns table(is_locked boolean, retry_after_seconds integer)
language plpgsql security definer set search_path = '' as $$
declare n integer; until_at timestamptz;
begin
  if p_attempt_key is null or length(p_attempt_key) < 20 or length(p_attempt_key) > 128 then raise exception 'Invalid login attempt key'; end if;
  insert into public.pin_login_attempts(attempt_key,failed_attempts,updated_at) values(p_attempt_key,1,now())
  on conflict(attempt_key) do update set
    failed_attempts=case when public.pin_login_attempts.locked_until is not null and public.pin_login_attempts.locked_until<=now() then 1 else public.pin_login_attempts.failed_attempts+1 end,
    locked_until=case when public.pin_login_attempts.locked_until is not null and public.pin_login_attempts.locked_until<=now() then null else public.pin_login_attempts.locked_until end,
    updated_at=now()
  returning failed_attempts,locked_until into n,until_at;
  if n >= p_max_attempts and (until_at is null or until_at <= now()) then
    until_at := now()+make_interval(mins=>p_lock_minutes);
    update public.pin_login_attempts set locked_until=until_at where attempt_key=p_attempt_key;
  end if;
  return query select (until_at is not null and until_at>now()),
    case when until_at>now() then greatest(1,ceil(extract(epoch from (until_at-now())))::integer) else 0 end;
end; $$;
revoke all on function public.record_pin_login_failure(text,integer,integer) from public, anon, authenticated;
grant execute on function public.record_pin_login_failure(text,integer,integer) to service_role;

-- Housekeeping: stale counters are harmless but should not grow forever.
create or replace function public.purge_pin_login_attempts() returns void
language sql security definer set search_path = '' as $$
  delete from public.pin_login_attempts where updated_at < now() - interval '2 days';
$$;
revoke all on function public.purge_pin_login_attempts() from public, anon, authenticated;
grant execute on function public.purge_pin_login_attempts() to service_role;

-- 6) Live updates for item rows.
do $$ begin
  alter publication supabase_realtime add table public.operational_items;
exception when duplicate_object then null; when undefined_object then null; end $$;
