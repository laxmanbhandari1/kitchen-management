-- The Shell: shared app state, profiles, role enforcement.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'employee' check (role in ('employee','manager','admin')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_state (
  key text primary key check (key like 'shell%'),
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists app_state_updated_at_idx on public.app_state(updated_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
drop trigger if exists app_state_set_updated_at on public.app_state;
create trigger app_state_set_updated_at before update on public.app_state
for each row execute function public.set_updated_at();

-- Every new Auth account starts as an employee. Privileged roles are assigned only by an admin.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(new.email, ''), '@', 1)),
    'employee'
  ) on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.current_app_role()
returns text language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p
  where p.id = (select auth.uid()) and p.active = true
  limit 1;
$$;

alter table public.profiles enable row level security;
alter table public.app_state enable row level security;
revoke all on public.profiles from anon, authenticated;
revoke all on public.app_state from anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.app_state to authenticated;

-- A user can read their own profile; managers/admins can read staff profiles.
drop policy if exists "profile self or management read" on public.profiles;
create policy "profile self or management read" on public.profiles
for select to authenticated
using (id = (select auth.uid()) or (select public.current_app_role()) in ('manager','admin'));

-- All signed-in staff can read operational state, including stock alerts and allergy reminders.
drop policy if exists "authenticated read app state" on public.app_state;
create policy "authenticated read app state" on public.app_state
for select to authenticated using ((select public.current_app_role()) is not null);

-- Checklist/stock-check/toilet state can be updated by signed-in staff.
-- Manager-only home notice keys are protected in the database, not only in the UI.
drop policy if exists "staff insert non-manager app state" on public.app_state;
create policy "staff insert non-manager app state" on public.app_state
for insert to authenticated
with check (
  key not in ('shell-home-stock-alerts-v1','shell-allergy-notes-v1')
  and (select public.current_app_role()) is not null
  and updated_by = (select auth.uid())
);
drop policy if exists "staff update non-manager app state" on public.app_state;
create policy "staff update non-manager app state" on public.app_state
for update to authenticated
using (
  (select public.current_app_role()) is not null
  and (key not in ('shell-home-stock-alerts-v1','shell-allergy-notes-v1') or (select public.current_app_role()) in ('manager','admin'))
)
with check (
  (select public.current_app_role()) is not null
  and updated_by = (select auth.uid())
  and (key not in ('shell-home-stock-alerts-v1','shell-allergy-notes-v1') or (select public.current_app_role()) in ('manager','admin'))
);
drop policy if exists "manager insert protected app state" on public.app_state;
create policy "manager insert protected app state" on public.app_state
for insert to authenticated
with check (
  key in ('shell-home-stock-alerts-v1','shell-allergy-notes-v1')
  and (select public.current_app_role()) in ('manager','admin')
  and updated_by = (select auth.uid())
);
drop policy if exists "manager delete app state" on public.app_state;
create policy "manager delete app state" on public.app_state
for delete to authenticated
using ((select public.current_app_role()) in ('manager','admin'));

-- Profiles are provisioned by the Auth trigger / trusted Edge Function. Clients cannot self-promote.
-- Realtime is optional, but enables cross-device notice refresh if enabled for app_state.
do $$ begin
  alter publication supabase_realtime add table public.app_state;
exception when duplicate_object then null;
when undefined_object then null;
end $$;
