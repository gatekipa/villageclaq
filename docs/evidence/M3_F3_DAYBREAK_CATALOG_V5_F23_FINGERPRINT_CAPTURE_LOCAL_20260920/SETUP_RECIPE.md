# Temporary local PG 17 + CLI 2.117.0 recipe

Jude-authorized for the 2026-09-20 fingerprint-capture work. Later tasks may reuse this recipe. Official package/release downloads only. No hosted/disposable/production contact. No public database listener.

**Verified privilege prerequisite:** local role `ubuntu` must be `SUPERUSER LOGIN` (`rolsuper=true`, `rolcanlogin=true`) **before** consuming a capture. The committed stub-core floor creates cluster roles `anon` / `authenticated` / `service_role`. `CREATEDB` alone cannot `CREATE ROLE` and HOLDs at `F3_DBPUSH_FLOOR_HOLD` (attempt 1).

This is the documented F18 fixture privilege. It is a local-cluster privilege only. It is **not** hosted identity proof, **not** restricted-role authorization, and **not** RLS enforcement. It does **not** authorize fingerprint mapping, grant alignment, or an equality waiver.

## PostgreSQL 17.11 (do not substitute 16)

Ubuntu 24.04 archive `postgresql` is 16. Use PGDG. A later VM from the same environment snapshot may **not** still have these packages even if a prior cleanup left them on another VM.

```bash
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends curl ca-certificates lsb-release
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
  | sudo tee /etc/apt/sources.list.d/pgdg.list
sudo apt-get update
# pin observed 2026-09-20: 17.11-1.pgdg24.04+2
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  postgresql-17=17.11-1.pgdg24.04+2 \
  postgresql-client-17=17.11-1.pgdg24.04+2
# postgresql-contrib-17 is not a separate PGDG 17 package; btree_gist ships in postgresql-17
```

## Isolated run-owned cluster — confirm before creating the privileged role

Do **not** alter an existing shared cluster. If `pg_lsclusters` already shows an online or previously used cluster that this run did not create, stop and create a new uniquely named cluster instead.

```bash
# expect: no cluster, or a this-run package-postinst 17/main that has never been started
pg_lsclusters
# confirm no public bind (must not be 0.0.0.0:5432 / [::]:5432)
```

Explicit localhost-only listen, then start without systemd if `policy-rc.d` blocks:

```bash
sudo sed -i "s/^#listen_addresses = 'localhost'/listen_addresses = 'localhost'/" \
  /etc/postgresql/17/main/postgresql.conf
sudo install -d -o postgres -g postgres -m 2775 /var/run/postgresql
sudo pg_ctlcluster 17 main start
# confirm not 0.0.0.0:5432 / [::]:5432
```

Confirm isolation (single this-run cluster, localhost only, no `ubuntu` role yet) **then** create the privileged role.

### Role and extension

Connection guard / `disposable-postgres.mjs` require socket `/var/run/postgresql`, maintenance DB `postgres`, role `ubuntu` able to `CREATE DATABASE` `f3_*`. Do not modify those files.

**Required (verified on CAPTURE_ATTEMPT_2):**

```bash
sudo -u postgres psql -c 'CREATE ROLE ubuntu SUPERUSER LOGIN;'
sudo -u postgres psql -d template1 -c "CREATE EXTENSION IF NOT EXISTS btree_gist;"
sudo -u postgres psql -d postgres -c "CREATE EXTENSION IF NOT EXISTS btree_gist;"
```

Attempt 1 used `CREATEDB` only and HOLDed at the stub floor. Do not repeat that:

```bash
# INSUFFICIENT — documented attempt-1 failure; do not use for a capture
# sudo -u postgres psql -d postgres -c "CREATE ROLE ubuntu LOGIN CREATEDB;"
```

Fixture TCP password is set by `createDisposableDatabase()` via `LOCAL_TCP_PASSWORD` in the committed connection guard. Do not change the guard. Do not print the password into evidence.

## Supabase CLI exactly 2.117.0

Official GitHub release. Verify checksum before install.

```bash
# checksums.txt lists supabase_2.117.0_linux_amd64.tar.gz
# SHA256 69c05f85b9e47ee706d30f1a6ca8a526b4e337bfd12c7ef1ef522d24e7280d24
curl -fsSL -o checksums.txt \
  https://github.com/supabase/cli/releases/download/v2.117.0/checksums.txt
curl -fsSL -o supabase_2.117.0_linux_amd64.tar.gz \
  https://github.com/supabase/cli/releases/download/v2.117.0/supabase_2.117.0_linux_amd64.tar.gz
grep 'supabase_2.117.0_linux_amd64.tar.gz' checksums.txt | sha256sum -c -
tar -xzf supabase_2.117.0_linux_amd64.tar.gz
mkdir -p "$HOME/.local/bin"
install -m 0755 supabase "$HOME/.local/bin/supabase"
export PATH="$HOME/.local/bin:$PATH"
supabase --version   # must print 2.117.0
```

`discoverSupabaseCli()` looks at `$HOME/.local/bin/supabase` then `supabase` on `PATH`.

## Readiness checks (required before consuming a capture)

```bash
psql --version
# must print 17.11
supabase --version
# must print 2.117.0
psql -h /var/run/postgresql -U ubuntu -d postgres -Atc 'SHOW server_version; SHOW listen_addresses; SHOW server_version_num;'
# server_version_num must match ^17
psql -h /var/run/postgresql -U ubuntu -d postgres -Atc \
  "SELECT rolname, rolsuper, rolcanlogin FROM pg_roles WHERE rolname='ubuntu';"
# must print ubuntu|t|t
psql -h /var/run/postgresql -U ubuntu -d postgres -Atc \
  "SELECT extname FROM pg_extension WHERE extname='btree_gist';"
psql -h /var/run/postgresql -U ubuntu -d template1 -Atc \
  "SELECT extname FROM pg_extension WHERE extname='btree_gist';"
# discoverSupabaseCli().matchesPin === true
```

Do not start a capture if `rolsuper` is not true. That is the attempt-1 CREATEDB-only failure.

Then **one** capture only if newly authorized (do not invent a second):

```bash
node scripts/prove-f3-qualification-reset-local.mjs \
  --normal-application-only \
  --fingerprint-diff-out <run-owned-output-path>
```

## Cleanup

```bash
sudo pg_ctlcluster 17 main stop
sudo pg_dropcluster 17 main   # removes data dir; packages may remain
# confirm no listener on 5432
```

Leave notes if packages / `$HOME/.local/bin/supabase` remain. Do not leave `listen_addresses='*'`.
