# Cleanup after CAPTURE_ATTEMPT_2 (2026-09-20)

Required after capture (success or failure). No public listener left running.

Attempt 1 cleanup record remains at [../CLEANUP.md](../CLEANUP.md).

## Cleaned

| Item | Action |
|------|--------|
| PostgreSQL 17 cluster `17/main` | stopped (`pg_ctlcluster 17 main stop`) then dropped (`pg_dropcluster 17 main`) |
| Work databases `f3_*` | helper `close()` dropped capture DBs; readiness probe `f3_readiness_probe` dropped before capture; none remained |
| Isolated CLI homes / workdirs under `/tmp` | removed (`f3-dbpush-*`, `f3-local-cli-home-*`, run-owned `/tmp/f23-fingerprint-capture-4ac0` after packaging) |
| TCP listener | none after stop/drop; during the run it was localhost only (`127.0.0.1` / `::1`) |

## Left installed (VM packages; not a running server)

| Item | Left in place | Note |
|------|---------------|------|
| PGDG apt repo + signing key | yes | `/etc/apt/sources.list.d/pgdg.list`, `/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc` |
| `postgresql-17` / `postgresql-client-17` `17.11-1.pgdg24.04+2` | packages remain | cluster data removed; `pg_lsclusters` should show no online cluster |
| `$HOME/.local/bin/supabase` 2.117.0 | yes | reuse via [../SETUP_RECIPE.md](../SETUP_RECIPE.md) |
| Role `ubuntu` / stub roles | gone with dropped cluster | |

A later VM booted from the same environment snapshot may **not** inherit these packages. Re-run the recipe; do not assume leftovers.

No hosted/disposable/production contact. No new billable infrastructure.
