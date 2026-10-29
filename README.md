# The Shell Kitchen

Supabase-connected kitchen operations prototype with staff profiles, picture upload/removal, profile name editing, password/PIN settings, task shortcuts, stock alerts and checklist sections.

## Setup

1. Add your Supabase project URL and publishable key to `js/supabase-config.js`.
2. Apply the SQL migrations in `supabase/migrations/` using the Supabase CLI (`supabase db push`) or the Dashboard SQL Editor.
3. Deploy Edge Functions:
   ```bash
   supabase functions deploy manage-staff
   supabase functions deploy pin-login
   ```
4. Create initial Supabase Auth users, then set a unique `profiles.user_id` and PIN hash using the SQL instructions in `supabase/README_SETUP.md`.
5. Serve the folder through a local web server or your hosting provider; do not open the HTML as a `file://` URL.

Never place a Supabase service-role/secret key in frontend files. See `supabase/README_SETUP.md` for setup and security notes. Before production use, add persistent PIN-attempt rate limiting and test all workflows against your own Supabase project.
