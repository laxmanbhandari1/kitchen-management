-- The Shell: self-service profile, avatar storage and secure staff PIN hash.
create extension if not exists pgcrypto;

alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles add column if not exists pin_hash text;

-- Users may edit only these profile fields. Role, active and pin_hash are not client-writable.
grant update (display_name, avatar_url, avatar_path) on public.profiles to authenticated;
drop policy if exists "profile self update personal fields" on public.profiles;
create policy "profile self update personal fields" on public.profiles
for update to authenticated
using (id = (select auth.uid()) and active = true)
with check (id = (select auth.uid()) and active = true);

-- PIN is stored as a salted adaptive hash. The hash is never selectable by clients.
revoke all on public.profiles from anon, authenticated;
grant select (id, display_name, role, active, created_at, updated_at, avatar_url, avatar_path) on public.profiles to authenticated;
grant update (display_name, avatar_url, avatar_path) on public.profiles to authenticated;

create or replace function public.set_my_pin(new_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if new_pin is null or new_pin !~ '^[0-9]{4,8}$' then
    raise exception 'PIN must contain 4 to 8 digits';
  end if;
  update public.profiles
    set pin_hash = extensions.crypt(new_pin, extensions.gen_salt('bf', 10))
    where id = auth.uid() and active = true;
  if not found then raise exception 'Active staff profile not found'; end if;
end;
$$;
revoke all on function public.set_my_pin(text) from public, anon;
grant execute on function public.set_my_pin(text) to authenticated;

-- Profile photos are public-read so avatar URLs can be rendered without signed-URL expiry;
-- only the owner can upload or delete files in their own UUID folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "Profile photos are publicly viewable" on storage.objects;
create policy "Profile photos are publicly viewable" on storage.objects
for select using (bucket_id = 'profile-photos');
drop policy if exists "Staff upload own profile photo" on storage.objects;
create policy "Staff upload own profile photo" on storage.objects
for insert to authenticated
with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Staff update own profile photo" on storage.objects;
create policy "Staff update own profile photo" on storage.objects
for update to authenticated
using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Staff delete own profile photo" on storage.objects;
create policy "Staff delete own profile photo" on storage.objects
for delete to authenticated
using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
