#!/usr/bin/env bash
set -euo pipefail
# Run after `supabase login` and `supabase link --project-ref ...`.
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${1:-backups}/the-shell-${STAMP}.sql"
mkdir -p "$(dirname "$OUT")"
supabase db dump --linked --file "$OUT"
echo "Database schema/data dump written to $OUT"
echo "Also export Storage objects separately from the Supabase Dashboard; pg_dump does not back up object bytes."
