# Group A report (what changed, how it was verified)

| # | Problem | Status |
|---|---------|--------|
| 1 | PIN lockout | Done + DB-tested (5 tries/IP, 20/account, 15 min) |
| 2 | One row per item + version | Done: migration + sync client wired to the real screens; legacy data imported |
| 3 | Reliable offline queue | Done: persistent per-user queue, retry, conflict list; simulated 2-device tests pass |
| 4 | Tighter DB rules | Done + role-tested (employee cannot write items directly, blobs, or notices) |
| 5 | Audit actor | Done (code + DB-tested); needs deploy of the two Edge Functions |
| 6 | Safety nets | Backup script, staging template and workflow, version pinning DONE. Creating the staging project and taking the first backup need YOUR Supabase account |

## Deploy order
1. `scripts/backup-supabase.sh` against production (before anything else).
2. Apply migrations 20261121000100 then 20261121000200 to STAGING, deploy `pin-login`, `manage-staff`, `reset-staff-pin`, test with two devices.
3. Repeat on production, then deploy the website files.

## Not covered by this package
- Not run against your live Supabase project (no access). Run the staging checklist first.
- No SRI hash on the CDN script (version is pinned only).
- Items 7+ of your wider list are outside Group A.
