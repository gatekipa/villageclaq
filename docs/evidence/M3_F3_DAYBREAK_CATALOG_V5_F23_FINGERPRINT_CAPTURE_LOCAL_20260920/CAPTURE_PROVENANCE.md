# Capture provenance — authorized local fingerprint capture 2026-09-20

DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN  
DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT  
No hosted / disposable / production contact.

## Checkout and helper identity

| Item | Value |
|------|-------|
| Recorded checkout SHA at capture | `122dccf4a1c9966adca67e79ca10507b929dfde2` |
| Contains retention helper | yes (`8346c856b7ddbb75b7e4dbaf57a42fc14e6d8f78` is ancestor) |
| Helper path | `scripts/prove-f3-qualification-reset-local.mjs` |
| Helper git commit | `8346c856b7ddbb75b7e4dbaf57a42fc14e6d8f78` |
| Helper blob at checkout | `4099edd183a3ec0b73302b80ac7fd0f126d6f6de` |
| `git rev-parse HEAD:scripts/prove-f3-qualification-reset-local.mjs` | `4099edd183a3ec0b73302b80ac7fd0f126d6f6de` (matches pin; tip did not move the blob) |
| FUNCTIONAL_TIP (frozen) | `77fd61dbf51652acabec0093d2a8549524b2dd75` |
| Shared branch | `feat/m3-f3-01-05-forward-foundation-9b17` |
| Work branch | `cursor/f23-fingerprint-capture-d232` |
| Fixture / frozen SQL / connection guard / disposable-postgres | unmodified (not opened for edit) |

## Environment (this host)

| Item | Value |
|------|-------|
| Cursor environment | personal `bdea159b-ab34-11f1-b532-320a589b8025` |
| Environment build / snapshot | `bld-20260920-f00b54bc-98db-45ae-b093-2c8e3399ff71` |
| OS | Ubuntu 24.04.4 LTS (`Linux cursor 6.12.94+`, x86_64) |
| Node | v22.14.0 |
| PostgreSQL packages | `postgresql-17` / `postgresql-client-17` `17.11-1.pgdg24.04+2` (PGDG noble; contrib modules included in server package; `btree_gist.so` present) |
| Server | `17.11 (Ubuntu 17.11-1.pgdg24.04+2)` / `server_version_num` `170011` |
| Client | `psql (PostgreSQL) 17.11 (Ubuntu 17.11-1.pgdg24.04+2)` |
| `listen_addresses` | `localhost` (TCP `127.0.0.1:5432` and `::1:5432` only; not `0.0.0.0` / `::`) |
| Unix socket | `/var/run/postgresql` |
| Maintenance DB | `postgres` |
| Role `ubuntu` at capture | `LOGIN CREATEDB`; `rolsuper=false`; `rolcreaterole=false` |
| Cluster stub roles after capture | `anon` / `authenticated` / `service_role` **absent** |
| `btree_gist` | preinstalled in `template1` and `postgres`; inherited by `f3_*` work DBs |
| CLI source | official GitHub release `v2.117.0` linux amd64 tarball |
| CLI checksum | SHA256 `69c05f85b9e47ee706d30f1a6ca8a526b4e337bfd12c7ef1ef522d24e7280d24` (matches `checksums.txt` entry `supabase_2.117.0_linux_amd64.tar.gz`) |
| CLI version string | `2.117.0` |
| `discoverSupabaseCli().matchesPin` | `true` |
| CLI bind location (sanitized) | `$HOME/.local/bin/supabase` |

Jude authorized this temporary PGDG + CLI install for this task only, superseding the prior BUILD_STATUS “do not install” stop.

## Pre-DB checks (reused; helper blob unchanged)

1. `node --check scripts/prove-f3-qualification-reset-local.mjs` → **SYNTAX_OK**
2. ESM import of `retainFingerprintFieldDiffs`, `retainQualifyFingerprintDiffs`, `secretsRemoved` → pass
3. Prior in-memory write-path remains valid ([write-path-check/](write-path-check/))
4. `getFrozenExpectedFingerprint("00118_f3_bounded_financial_epoch_foundation.sql")` → `frozenOracleImportOk: true`

Readiness also confirmed: socket admin URL as `ubuntu`, `CREATE DATABASE` / `DROP DATABASE` of `f3_readiness_probe`, TCP `127.0.0.1:5432` with the fixture local password (not recorded here), CLI pin via `discoverSupabaseCli()`.

## Authorized prove command — ran once

```
node scripts/prove-f3-qualification-reset-local.mjs --normal-application-only --fingerprint-diff-out <run-owned-output-path>
```

| Item | Value |
|------|-------|
| Start | `2026-09-20T06:05:54Z` |
| End | `2026-09-20T06:06:02Z` |
| Exit | `0` |
| `--normal-application-only` | yes (no fault injection, no lock-wait suite, no repair) |
| Automatic rerun | **not done** |

Sanitized helper extract: [helper-summary.json](helper-summary.json)  
SHA-256 `ab800bc2b7a43861431bd6725722cf94269142999688eff5bf010226bf13e468`

Packaged [fingerprint-diff.json](fingerprint-diff.json) SHA-256 `0a466afccdc7679ab6b480aa1aacd03b3d76723fd4481d58a5af69c68c3e8877`  
(helper-written retention plus `captureExecuted` metadata; secrets/absolute paths not present)

Run-owned raw helper stdout SHA-256 `c7961a2f671b16de4ce02317be3455e74f584e708d333ce96c7192aa79cce6f4` (not copied into the repo; membership tuple dump omitted from the packaged summary).

## What was not done

- No second capture
- No role mapping, SUPERUSER upgrade, or grant alignment **before or after** capture
- No hosted / disposable / production URL
- No repair experiment
- No fingerprint mapping or waiver
- No rewrite of the historical F23 package
- No executable / fixture / oracle edits

## Linked repair input (not re-executed)

[REPAIR_FEASIBILITY.md](../M3_F3_DAYBREAK_CATALOG_V5_F23_CLOSEOUT_DECISION_INPUTS_20260920/REPAIR_FEASIBILITY.md)

## Cleanup

See [CLEANUP.md](CLEANUP.md). Cluster stopped and dropped. Packages and CLI binary left installed. No public listener.
