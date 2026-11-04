# The Shell — Restaurant Operations App

The Shell brings FOH, Kitchen Up and Kitchen Down opening, closing, cleaning, stock and toilet-check workflows into one mobile-friendly app. It uses Supabase for Staff ID + PIN authentication, shared state, profiles, role permissions and checklist templates.

## Quick start

1. Add the Supabase Project URL and publishable/anon key to `js/supabase-config.js`.
2. Apply all SQL migrations in filename order. See `supabase/README_SETUP.md` for the exact order and first Developer bootstrap instructions.
3. Deploy `pin-login`, `manage-staff` and `reset-staff-pin` Edge Functions as documented in `supabase/README_SETUP.md`.
4. Create the first Supabase Auth user in the Dashboard, promote it to Developer using its UUID, and assign a unique Staff ID and temporary PIN using the secure SQL helper.
5. Serve this folder over HTTP(S), not by opening `index.html` with `file://`.

## Roles

- Employee: complete operational tasks and manage own profile/PIN.
- Manager: manage operational checklists and notices; cannot create accounts or reset PINs.
- Boss: can create Employee/Manager accounts and reset their PINs.
- Developer: full leadership access and can create any role.

## Security

The staff login screen asks for Staff ID + PIN. Staff email is used only as the underlying Supabase Auth identity. PIN hashes and the service-role key are never exposed to the browser. Read `supabase/README_SETUP.md` before using this with real staff.

## Current architecture and limitations

Existing operational screens continue to sync their date-keyed records through `public.app_state` for compatibility. `checklist_templates` stores shared editable task definitions, and `audit_logs` records selected configuration/profile/state changes without storing PIN hashes. Dedicated normalized stock-movement, task-event, toilet-event and issue-report tables, plus persistent PIN rate limiting, remain recommended next steps before a high-compliance production rollout. This package has not been deployed or end-to-end tested against your live Supabase project.
