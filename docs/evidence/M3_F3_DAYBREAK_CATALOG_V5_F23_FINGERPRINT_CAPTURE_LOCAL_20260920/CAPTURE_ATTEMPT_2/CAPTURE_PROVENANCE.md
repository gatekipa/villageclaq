# Capture provenance — CAPTURE_ATTEMPT_2 2026-09-20

DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN  
DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT  
No hosted / disposable / production contact.

Attempt 1 provenance remains at [../CAPTURE_PROVENANCE.md](../CAPTURE_PROVENANCE.md) (CREATEDB-only floor HOLD). This file is attempt 2 only.

## Checkout and helper identity

| Item | Value |
|------|-------|
| Recorded checkout SHA at capture | `f65d1cec04450a017deec700d184aa9e82d4c6e7` |
| Helper path | `scripts/prove-f3-qualification-reset-local.mjs` |
| Helper git commit | `8346c856b7ddbb75b7e4dbaf57a42fc14e6d8f78` |
| Helper blob at checkout | `4099edd183a3ec0b73302b80ac7fd0f126d6f6de` |
| `git rev-parse HEAD:scripts/prove-f3-qualification-reset-local.mjs` | `4099edd183a3ec0b73302b80ac7fd0f126d6f6de` |
| FUNCTIONAL_TIP (frozen) | `77fd61dbf51652acabec0093d2a8549524b2dd75` |
| Shared branch | `feat/m3-f3-01-05-forward-foundation-9b17` |
| Fixture / frozen SQL / connection guard / disposable-postgres / oracle / acceptance | unmodified (not opened for edit) |

## Isolated run-owned cluster (before privileged role)

This VM had **no** `/etc/postgresql` and **no** listener before package restore. PGDG install created `17/main` at `2026-09-20T06:25:18Z` (this run). Cluster remained `down` until this run started it. No other cluster existed. Privileged role was created only after that isolation check.

| Item | Value |
|------|-------|
| Cluster | `17/main` (this-run package postinst; not a pre-existing shared cluster) |
| Data directory | `/var/lib/postgresql/17/main` |
| `listen_addresses` | `localhost` |
| TCP bind | `127.0.0.1:5432` and `::1:5432` only (not `0.0.0.0` / `::`) |
| Unix socket | `/var/run/postgresql` |
| Maintenance DB | `postgres` |
| Roles before `CREATE ROLE ubuntu` | default `postgres` superuser + built-in `pg_*` roles only |

## Environment

| Item | Value |
|------|-------|
| Cursor environment | personal `bdea159b-ab34-11f1-b532-320a589b8025` |
| Environment build / snapshot | `bld-20260920-f00b54bc-98db-45ae-b093-2c8e3399ff71` |
| OS | Ubuntu 24.04.4 LTS (`Linux cursor 6.12.94+`, x86_64) |
| Node | v22.14.0 |
| PostgreSQL packages | `postgresql-17` / `postgresql-client-17` `17.11-1.pgdg24.04+2` (reinstalled on this VM; prior VM leftovers were not present) |
| Server | `17.11 (Ubuntu 17.11-1.pgdg24.04+2)` / `server_version_num` `170011` |
| Client | `psql (PostgreSQL) 17.11 (Ubuntu 17.11-1.pgdg24.04+2)` |
| Role `ubuntu` at capture | `SUPERUSER LOGIN`; `rolsuper=true`; `rolcanlogin=true`; `rolcreaterole=false`; `rolcreatedb=false` (SUPERUSER still bypasses CREATE DATABASE / CREATE ROLE) |
| Cluster stub roles after capture | `anon` / `authenticated` / `service_role` **present** (`rolsuper=false`, `rolcanlogin=false`) |
| `btree_gist` | preinstalled in `template1` and `postgres`; inherited by `f3_*` work DBs (`extversion` `1.7`) |
| CLI source | official GitHub release `v2.117.0` linux amd64 tarball |
| CLI checksum | SHA256 `69c05f85b9e47ee706d30f1a6ca8a526b4e337bfd12c7ef1ef522d24e7280d24` |
| CLI version string | `2.117.0` |
| `discoverSupabaseCli().matchesPin` | `true` |
| CLI bind location (sanitized) | `$HOME/.local/bin/supabase` |

Jude authorized one isolated run-owned PostgreSQL 17.11 cluster, local `ubuntu` as `SUPERUSER LOGIN` (F18 recipe), and **one additional** normal-application capture. Attempt 1 remains recorded as used.

SUPERUSER on this localhost-only temporary cluster is **not** hosted identity proof and is **not** restricted-role authorization or RLS enforcement.

## Pre-DB checks (helper blob unchanged)

1. `node --check scripts/prove-f3-qualification-reset-local.mjs` → **SYNTAX_OK**
2. `discoverSupabaseCli().matchesPin === true`
3. `getFrozenExpectedFingerprint("00118_f3_bounded_financial_epoch_foundation.sql")` → `frozenOracleImportOk: true`
4. Socket admin as `ubuntu`: `CREATE DATABASE` / `DROP DATABASE` of `f3_readiness_probe` (inherited `btree_gist`)
5. Role attributes and `SHOW server_version` / `listen_addresses` as in [preflight.txt](preflight.txt)

## Authorized prove command — ran once

```
node scripts/prove-f3-qualification-reset-local.mjs --normal-application-only --fingerprint-diff-out <run-owned-output-path>
```

| Item | Value |
|------|-------|
| Start | `2026-09-20T06:26:46Z` |
| End | `2026-09-20T06:27:01Z` |
| Exit | `0` |
| `--normal-application-only` | yes (no fault injection, no lock-wait suite, no repair) |
| Automatic rerun | **not done** |

Sanitized helper extract: [helper-summary.json](helper-summary.json)  
Helper-written retention SHA-256 `9ba92c15f6ee40f85c835365de3e96775a2cc280d72b6ff40744d802d5ed9bd5`  
Raw helper stdout SHA-256 `eca4ecf3d907575a5878f81d7436fe1a128f0e749a13473a31f6651e07e71c6f` (not copied into the repo; membership tuple dump omitted)  
CLI stderr SHA-256 `e4ae224451d5fa3ffd5b290450330723ffd71c0f6e73927f8fa4096bc22e5ebc`

## What was not done

- No second prove after this result
- No fingerprint mapping, grant alignment, or equality waiver
- No hosted / disposable / production URL
- No repair experiment
- No rewrite of attempt 1 floor-HOLD files
- No executable / fixture / oracle / acceptance edits
- SUPERUSER was **not** credited as restricted-role or RLS proof

## Linked repair input (not re-executed)

[REPAIR_FEASIBILITY.md](../../M3_F3_DAYBREAK_CATALOG_V5_F23_CLOSEOUT_DECISION_INPUTS_20260920/REPAIR_FEASIBILITY.md)

## Cleanup

See [CLEANUP.md](CLEANUP.md). Cluster stopped and dropped. Packages and CLI binary left installed. No public listener.
