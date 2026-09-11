#!/usr/bin/env bash
# Disposable Cut 1 harness.
#
# Preferred: local postgres (this script).
# Alternative: supabase db reset on a throwaway local stack, then apply 00114
# against a schema-only dump. Full prod-equivalent restore is NOT attempted
# (paid PITR / live apply are out of scope).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$(cd "$(dirname "$0")" && pwd)"
MIGRATION="$ROOT/supabase/migrations/00114_s0_p0a_cut1_active_authorization.sql"

if [[ ! -f "$DIR/fixture.sql" ]]; then
  python3 "$DIR/generate_fixture.py"
fi
if [[ ! -f "$MIGRATION" ]]; then
  python3 "$DIR/generate_cut1_sql.py"
fi

PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-55432}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-cut1_disposable}"
PGPASSWORD="${PGPASSWORD:-cut1}"

need_install=0
if ! command -v psql >/dev/null 2>&1; then
  need_install=1
fi
if ! command -v pg_isready >/dev/null 2>&1 && [[ $need_install -eq 0 ]]; then
  true
fi

if [[ "${CUT1_INSTALL_POSTGRES:-1}" == "1" ]] && ! command -v psql >/dev/null 2>&1; then
  echo "Installing postgresql (local disposable)..."
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql postgresql-contrib >/tmp/cut1-pg-install.log
fi

if [[ "${CUT1_USE_EXISTING:-0}" != "1" ]]; then
  # Prefer a dedicated cluster on 55432 if we can; else use default local postgres.
  if command -v pg_lsclusters >/dev/null 2>&1; then
    if ! pg_isready -h "$PGHOST" -p "$PGPORT" >/dev/null 2>&1; then
      if pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
        PGPORT=5432
        unset PGPASSWORD || true
        export PGUSER="${PGUSER:-postgres}"
      else
        sudo service postgresql start || sudo pg_ctlcluster "$(ls /usr/lib/postgresql | tail -1)" main start || true
        PGPORT=5432
        unset PGPASSWORD || true
      fi
    fi
  elif ! pg_isready -h "$PGHOST" -p "$PGPORT" >/dev/null 2>&1; then
    sudo service postgresql start || true
    PGPORT=5432
    unset PGPASSWORD || true
  fi
fi

export PGHOST PGPORT PGUSER PGDATABASE
if [[ -n "${PGPASSWORD:-}" ]]; then
  export PGPASSWORD
fi

echo "Using postgres ${PGHOST}:${PGPORT} as ${PGUSER}"

# Create disposable DB as superuser.
if [[ "$(id -un)" == "postgres" ]]; then
  psql -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${PGDATABASE};"
  psql -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${PGDATABASE};"
else
  sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${PGDATABASE};" || \
    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${PGDATABASE};"
  sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${PGDATABASE};" || \
    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${PGDATABASE};"
  sudo -u postgres psql -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE ${PGDATABASE} TO ${PGUSER};" || true
fi

PSQL=(sudo -u postgres psql -d "$PGDATABASE" -v ON_ERROR_STOP=1)
if ! sudo -u postgres true 2>/dev/null; then
  PSQL=(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1)
fi

echo "==> loading fixture (live-shaped helpers + policies)"
"${PSQL[@]}" -f "$DIR/fixture.sql"

echo "==> applying 00114 Cut 1 migration"
"${PSQL[@]}" -f "$MIGRATION"

echo "==> actor matrix"
"${PSQL[@]}" -f "$DIR/actor_matrix.sql"

echo "CUT1_DISPOSABLE_PASS"
