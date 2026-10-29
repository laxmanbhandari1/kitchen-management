# The Shell — Supabase setup

This frontend uses Supabase Auth + Postgres Row Level Security. The current screens are retained and their existing date-keyed state objects are shared through `public.app_state`. Stock alerts and allergy notes use protected keys in that table. This is an intentional migration-friendly bridge for the existing prototype; it avoids rewriting every screen before launch.

## 1. Create and configure your Supabase project

1. Create a project at https://supabase.com/dashboard.
2. Open **Project Settings → API** (or API Keys) and copy the Project URL and **publishable** key (legacy `anon` key is also supported).
3. Put those values in `js/supabase-config.js`:

```js
window.SUPABASE_CONFIG = {
  url: 'https://YOUR-PROJECT-REF.supabase.co',
  publishableKey: 'YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY'
};
```

Never put a `service_role` key or secret key in the website. The publishable/anon key is designed to be public; RLS is what protects the data.

## 2. Apply the database migration

### Dashboard method

1. Open **SQL Editor → New query**.
2. Paste and run the full contents of `supabase/migrations/20261029000100_the_shell_core.sql`.

### CLI method

Install the Supabase CLI, then from the project root run:

```bash
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase db push
```

If you are starting with an empty Supabase project, the migration creates `profiles` and `app_state`, the new-user profile trigger, role helper, grants and RLS policies.

## 3. Create the first admin safely

The Auth trigger makes every newly created user an `employee` by default. It is not possible to choose your own role from the website.

1. In Supabase Dashboard → **Authentication → Users → Add user**, create your own account with a strong password and confirm it.
2. Copy that user's UUID.
3. In SQL Editor, run the following once, replacing the UUID and display name:

```sql
update public.profiles
set role = 'admin', display_name = 'Outlet Admin', active = true
where id = 'REPLACE-WITH-AUTH-USER-UUID';
```

Do not make anyone else an admin unless authorised. Then add staff through the deployed `manage-staff` function, or create their Auth accounts in the Dashboard (those will start as employees).

## 4. Deploy the staff-management Edge Function

The function creates staff Auth accounts and assigns roles. It checks the signed-in caller's database role; managers can create employees, while only admins can create managers/admins.

```bash
supabase functions deploy manage-staff
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are Supabase-provided function environment values in standard hosted projects. Do not copy the service role key into frontend config or commit it to source control.

Example request (run from a trusted admin workstation; replace values):

```bash
curl -X POST 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/manage-staff' \
  -H 'Authorization: Bearer USER_ACCESS_TOKEN' \
  -H 'apikey: YOUR_PUBLISHABLE_OR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"email":"new.staff@example.com","password":"A-long-random-password-123!","display_name":"New Staff","role":"employee"}'
```

The user's access token is a short-lived session JWT from a signed-in manager/admin session. Do not put real passwords or tokens into scripts, screenshots, or chat. A future Staff Management screen can call this endpoint via `supabase.functions.invoke('manage-staff', { body: ... })`.

## 5. Run the app from a local web server

Do not rely on opening `index.html` with `file://` for production. Serve it over HTTP(S). For example, with Python installed:

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080` from the folder containing `index.html`. For deployment, upload the project folder to Netlify or another static host and use HTTPS.

## 6. Auth settings

- In Authentication → URL Configuration, set your production Site URL and allowed redirect URLs.
- Use strong unique passwords. Do not enable public self-registration unless that is wanted for your outlet.
- For staff accounts, prefer admin-created accounts or invitations; avoid shared logins.
- A disabled profile (`active = false`) is blocked at sign-in by the app. Disable the corresponding Auth user as well when offboarding.

## 7. Data model and permissions

- `auth.users`: managed by Supabase Auth.
- `public.profiles`: display name, role (`employee`, `manager`, `admin`), active flag.
- `public.app_state`: shared JSON state keyed by the existing app storage key. Date-keyed stock checks, checklists, cleaning logs and toilet-check data keep their existing structure, but now share across signed-in devices.
- `shell-home-stock-alerts-v1` and `shell-allergy-notes-v1`: readable by all signed-in staff; insert/update/delete restricted by database RLS to managers/admins.
- Other `shell*` keys: signed-in staff may write operational checklist state. RLS remains active.

This compatibility layer syncs the existing whole state object per key. It is suitable for getting the current prototype onto a shared backend; before a high-compliance production rollout, split high-volume records into normalized tables and add an audit log, retention rules, and automated RLS tests.

## 8. Verify before relying on it

- Sign in as an employee: should see stock alerts and allergy notes but not manager controls.
- Attempt to write the two protected app-state keys as an employee: database should reject it with an RLS error.
- Sign in as manager/admin: should be able to edit those notes.
- Complete a checklist on device A and sign in on device B: the saved state should hydrate from the database.
- Confirm a disabled account cannot sign in.
- Test `manage-staff` with employee, manager and admin tokens to confirm the role rules.

Supabase Realtime must have `public.app_state` enabled in the `supabase_realtime` publication. The migration attempts to add it; confirm it in Database → Publications if live updates do not appear.

## Profile and settings migration

The profile/settings screens add self-service display-name editing, profile photo upload/removal, password change, and a salted PIN hash. Apply the new migration too:

```bash
supabase db push
```

The migration `20261029000200_profile_settings.sql` creates the `profile-photos` Storage bucket and owner-folder policies, adds avatar fields, and adds `set_my_pin(new_pin)` which stores a salted hash. The PIN is not currently an alternative sign-in method; Supabase email/password remains the authentication method. Do not treat the PIN as an account password.

The app Home now has direct task launchers for FOH, Kitchen Up, and Kitchen Down, and the Tasks tab provides the same checklists grouped by station.

## Staff ID + PIN login

The login screen now uses a staff `user_id` and 4–8 digit PIN. Deploy the PIN login Edge Function after applying migrations:

```bash
supabase functions deploy pin-login
```

Each staff account still needs an underlying Supabase Auth user/email, but staff do not enter the email to sign in. Assign each profile a unique staff ID and a PIN hash in the SQL Editor (replace UUID, user ID, and PIN):

```sql
update public.profiles
set user_id = 'SHELL001',
    pin_hash = extensions.crypt('482716', extensions.gen_salt('bf', 10))
where id = 'REPLACE-WITH-AUTH-USER-UUID' and active = true;
```

Use a different ID and PIN for every staff member. Do not reuse the example PIN. After login, staff can change their PIN in Profile → Settings. Password change remains available as an account recovery/admin-managed credential, but it is not used on the staff-facing login screen. The PIN login function uses the service-role key only on the server and never exposes it to the browser.

**Production hardening:** add persistent rate limiting / lockout and monitoring for PIN attempts before using this with real staff accounts. Short numeric PINs are weaker than passwords; use 6–8 digits, unique per person, and do not expose the SQL Editor to staff.
