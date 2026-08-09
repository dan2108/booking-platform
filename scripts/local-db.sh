#!/usr/bin/env bash
# Stand up a local Postgres, apply every migration in order, and seed.
# No cloud account needed — the correctness core is plain Postgres.
set -euo pipefail
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PGPORT=${PGPORT:-5433}
PGDATA=${PGDATA:-/tmp/pgdata}
DB=${DB:-booking}

export PATH="$PGBIN:$PATH"
psql -h localhost -p "$PGPORT" -U postgres -c "select 1" >/dev/null 2>&1 || {
  echo "Postgres is not running on port $PGPORT" >&2; exit 1;
}

dropdb   -h localhost -p "$PGPORT" -U postgres --if-exists "$DB"
createdb -h localhost -p "$PGPORT" -U postgres "$DB"

run() { psql -v ON_ERROR_STOP=1 -q -h localhost -p "$PGPORT" -U postgres -d "$DB" -f "$1"; }

run "$(dirname "$0")/local-bootstrap.sql"
for f in "$(dirname "$0")"/../supabase/migrations/*.sql; do
  echo "  applying $(basename "$f")"
  run "$f"
done

psql -q -h localhost -p "$PGPORT" -U postgres -d "$DB" -c "select seed_demo_data();" -t
