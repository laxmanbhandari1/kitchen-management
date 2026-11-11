# The Shell — Supabase setup and deployment

This version uses **Staff ID + PIN** on the login screen. Staff email addresses are still required when Boss/Developer create an account because Supabase Auth uses the email as the underlying unique account identity. Staff do not enter email or password to sign in.

## 1. Configure the browser app

Open `js/supabase-config.js` and add your Supabase Project URL and **publishable** key (or legacy anon key):

```js
window.SUPABASE_CONFIG = {
  url: 'https://YOUR-PROJECT-REF.supabase.co',
  publishableKey: 'YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY'
};
```

Never put the service-role/secret key in frontend files.

## 2. Apply every database migration

The migrations are designed to be applied in filename order. If using Supabase CLI from this project folder:

```bash
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase db push
```

If using SQL Editor instead, run the complete SQL files in this exact order:

1. `supabase/migrations/20261029000100_the_shell_core.sql`
2. `supabase/migrations/20261029000200_profile_settings.sql`
3. `supabase/migrations/20261030000100_roles_admin_and_templates.sql`
4. `supabase/migrations/20261101000100_auth_roles_audit_hardening.sql`

The fourth migration is important. It fixes the old `verify_staff_pin` function signature/return type mismatch, grants the profile columns requested by the frontend, aligns the four roles, updates manager permissions, and adds a leadership audit log. Do not run only the last migration on a brand-new project; apply all four in order.

## 3. Bootstrap your first Developer account

Create your own Auth user first in **Supabase Dashboard → Authentication → Users → Add user**. Use an email you control and confirm the account. Copy its UUID, then run this in SQL Editor, replacing the placeholder:

```sql
UPDATE public.profiles
SET role = 'developer', active = true, display_name = 'Developer'
WHERE id = 'PASTE-YOUR-AUTH-USER-UUID-HERE'::uuid;
```

Assign the initial Staff ID and temporary PIN using the secure hash function:

```sql
UPDATE public.profiles
SET user_id = 'DEV001',
    pin_hash = public.hash_staff_pin('739251'),
    must_change_pin = true
WHERE id = 'PASTE-YOUR-AUTH-USER-UUID-HERE'::uuid;
```

Replace the example PIN with a unique 6–8 digit PIN. Do not share it or reuse it. The first login will require the Developer to choose a new PIN.

## 4. Deploy all Edge Functions

From the project root:

```bash
supabase functions deploy pin-login --no-verify-jwt
supabase functions deploy manage-staff
supabase functions deploy reset-staff-pin
```

`pin-login` has `verify_jwt = false` because staff are not authenticated until the function verifies their Staff ID/PIN. The function itself uses the server-side service-role key to verify the hash and generate a one-time Supabase Auth session. `manage-staff` and `reset-staff-pin` require a signed-in session and check the caller's role server-side.

Supabase hosted Edge Functions provide `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` as server environment variables. If you use a self-hosted environment, configure these as function secrets. Never add the service-role key to `js/supabase-config.js`.

## 5. Role permissions

| Role | Permissions |
|---|---|
| Employee | Complete operational tasks, use stock workflows, view shared notices, edit own display name/photo/PIN. |
| Manager | Employee permissions plus manage checklist templates, stock alerts, allergy notes and operational dashboards. Cannot create accounts or reset PINs. |
| Boss | Manager permissions plus create Employee/Manager accounts, reset their PINs, and view audit logs. Cannot create Boss/Developer accounts. |
| Developer | Full leadership access; can create any role, including Boss and Developer, reset PINs and view audit logs. |

The browser hides controls according to role, but the Edge Functions and database RLS enforce permissions independently.

## 6. Creating a staff account

In The Shell, sign in as Boss or Developer and open Admin → Create staff account. Enter:

- Staff name
- Staff email (unique; used by Supabase Auth, not entered at staff login)
- Staff ID (unique, 2–40 letters/numbers/hyphen/underscore)
- Temporary PIN (4–8 digits; use 6–8 in practice)
- Role (Boss can choose Employee/Manager; Developer can choose all roles)

The new account is created as active and `must_change_pin=true`. Give the staff member their Staff ID and temporary PIN privately. They must change the PIN in Profile before using the rest of the app.

If an email already exists, use a different email or resolve the existing account in Authentication → Users. Staff IDs must also be unique.

## 7. PIN reset

Only Boss and Developer can use Admin → Reset staff PIN. Boss can reset Employee/Manager PINs. Developer can reset any account. A reset sets `must_change_pin=true`, so the staff member must choose a new PIN at their next login.

PIN hashes are never selectable by browser users and are never written to `audit_logs`.

## 8. Profile photos

The profile migration creates the `profile-photos` bucket with a 5 MB limit and JPG/PNG/WebP support. Staff can upload or remove only their own photo. The bucket is public-read so avatar URLs work consistently across devices; do not upload sensitive images.

## 9. Data and audit model

- `profiles`: account role, active status, Staff ID, display name, PIN hash and avatar metadata.
- `app_state`: compatibility storage for existing date-keyed checklist, stock and toilet-check state. It keeps the existing screens working without a complete frontend rewrite.
- `checklist_templates`: shared checklist additions/removals for FOH, Kitchen Up and Kitchen Down.
- `audit_logs`: leadership-readable history of profile, checklist-template and app-state changes. PIN hashes are excluded.

The current app still uses `app_state` for much of its operational data. The normalized tables for individual task completions, stock movements, toilet check events and issue reports are a recommended next phase; they are not represented as completed features in this package.

## 10. Run and verify

Serve the folder over HTTP(S), not by opening `index.html` with `file://`:

```bash
python3 -m http.server 8080
```

Then test all of the following:

1. Developer can sign in with Staff ID + PIN.
2. First login forces PIN change and blocks navigation until it is saved.
3. Developer can create Employee, Manager, Boss and Developer accounts.
4. Boss can create Employee and Manager accounts only.
5. Manager cannot see Create Staff or Reset PIN controls and cannot invoke those functions successfully.
6. Employee cannot access the Admin view.
7. Manager can add/retire checklist templates and edit operational notices.
8. Employees cannot write protected stock-alert/allergy-notice records.
9. Staff can upload/remove their own profile photo and change their own PIN.
10. Boss/Developer can reset a staff PIN; reset forces PIN rotation at next login.
11. Audit logs show changes but never contain PIN hashes.
12. Test on two devices and verify saved state syncs as expected.

## 11. Important production limitations

This package includes code-level checks and local validation, but it has not been deployed or tested against your live Supabase project. Before relying on it operationally, test the full role matrix, PIN rate limiting/lockout, backups/restore, multi-device concurrent edits and data retention. Numeric PIN login should use unique 6–8 digit PINs and persistent rate limiting before a public production rollout.


## Leadership dashboard update (2026-11-11)

After updating the app files, apply the new migration
`supabase/migrations/20261111000100_leadership_dashboard.sql` in the Supabase SQL Editor
(or deploy it with the Supabase CLI). This grants active Managers, Bosses and Developers
read access to the audit history and ensures shared `app_state` changes are written to
`audit_logs`. The app's History screen can only show changes recorded after this migration
is applied; it cannot reconstruct activity from before audit logging was enabled.

No new Supabase secrets are required for this update. The existing `pin-login`,
`manage-staff` and `reset-staff-pin` Edge Functions remain in place.
