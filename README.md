# The Shell — Kitchen Stock & Operations

Static frontend for FOH, Kitchen Up, Kitchen Down, daily stock, cleaning schedules, toilet checks, stock alerts and allergy notes. Supabase integration files and setup instructions are in `supabase/` and `js/supabase-*`.

## Quick start

1. Create a Supabase project.
2. Copy the Project URL and publishable key into `js/supabase-config.js`.
3. Run `supabase/migrations/20261029000100_the_shell_core.sql` in Supabase SQL Editor, or use the Supabase CLI migration workflow described in `supabase/README_SETUP.md`.
4. Create your first user in Supabase Auth, then promote that account to `admin` using the one-time SQL in `supabase/README_SETUP.md`.
5. Serve this folder over HTTP(S), not `file://`.

See **[Supabase setup guide](supabase/README_SETUP.md)** for complete CLI commands, Edge Function deployment, staff provisioning, security notes and verification steps.

## Structure

- `index.html`: app shell and sign-in form
- `css/`: styles
- `js/auth.js`: Supabase email/password sign-in and profile-based role display
- `js/supabase-config.js`: project URL + public publishable key placeholders
- `js/supabase-sync.js`: shared persistence and live updates for existing date-keyed screen state
- `js/home-notices.js`: out-of-stock alerts and allergy notes
- `js/stations.js`: Daily Stock and Toilet Check
- `js/foh-checklists.js`: FOH opening, closing and cleaning
- `js/kitchen-checklists.js`: Kitchen Down opening, closing and cleaning
- `js/kitchen-up-checklists.js`: Kitchen Up opening, closing and cleaning
- `supabase/migrations/`: database schema, trigger, RLS and permissions
- `supabase/functions/manage-staff/`: protected staff account creation Edge Function

## Important

The site will not sign in until `js/supabase-config.js` is configured and the SQL migration has run. No service role/secret key belongs in browser code. The shared state table is a compatibility layer for the existing prototype; use normalized tables and audit logging before relying on it for formal compliance records.
"# kitchen-management" 
