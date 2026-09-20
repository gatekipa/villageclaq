# Capture provenance — authorized local fingerprint attempt 2026-09-20

DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN  
DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT  
No hosted / disposable / production contact.

## Checkout and helper identity

| Item | Value |
|------|-------|
| Recorded checkout SHA | `94b7b53f01c707bbbeda5416f4ab555393f9ce08` |
| Capture-addendum content | `f26b91e433c2dd6324c13560b9a8e7659d895a9e` |
| Contains retention helper | yes (`8346c856b7ddbb75b7e4dbaf57a42fc14e6d8f78` is ancestor) |
| Helper path | `scripts/prove-f3-qualification-reset-local.mjs` |
| Helper git commit | `8346c856b7ddbb75b7e4dbaf57a42fc14e6d8f78` |
| Helper blob at checkout | `4099edd183a3ec0b73302b80ac7fd0f126d6f6de` |
| FUNCTIONAL_TIP (frozen) | `77fd61dbf51652acabec0093d2a8549524b2dd75` |
| Shared branch | `feat/m3-f3-01-05-forward-foundation-9b17` |
| Work branch | `cursor/f23-fingerprint-capture-c354` |
| Fixture / frozen SQL | unmodified (not opened for edit) |

## Environment (this host)

| Item | Value |
|------|-------|
| Cursor environment | personal `bdea159b-ab34-11f1-b532-320a589b8025` |
| Environment build / snapshot | `bld-20260920-f00b54bc-98db-45ae-b093-2c8e3399ff71` |
| Build logs | generic VNC/desktop snapshot; no PostgreSQL or CLI install step |
| OS | Ubuntu 24.04.4 LTS (`Linux cursor 6.12.94+`, x86_64) |
| Node | v22.14.0 |
| `psql` | **MISSING** (`command -v` empty; no `/usr/bin/psql`) |
| `postgres` binary | **MISSING** |
| `/var/run/postgresql` | **MISSING** |
| `pg_lsclusters` / `/etc/postgresql` / `/usr/lib/postgresql` | absent |
| Ubuntu archive `postgresql` candidate | `16+257build1.1` (PostgreSQL **16**, not 17) |
| `postgresql-17` in archive | not present |
| `supabase` on PATH | **MISSING** |
| `$HOME/.local/bin/supabase` | **MISSING** |
| CLI version | not obtained (binary absent); pin remains `2.117.0` |
| PostgreSQL server version | not obtained (server absent); helper requires `server_version_num` `^17` |
| Operation counts | not obtained — prove command not run |

F23 historical fixture used `17.11 (Ubuntu 17.11-1.pgdg24.04+2)` plus CLI 2.117.0. This snapshot is not that host.

## Pre-DB checks (executed)

1. `node --check scripts/prove-f3-qualification-reset-local.mjs` → **SYNTAX_OK**
2. ESM import of `retainFingerprintFieldDiffs`, `retainQualifyFingerprintDiffs`, `secretsRemoved` → pass
3. In-memory write of `secretsRemoved(JSON.stringify(...))` to a workspace-external path → pass ([write-path-check/](write-path-check/))
4. `getFrozenExpectedFingerprint("00118_f3_bounded_financial_epoch_foundation.sql")` import via `retainQualifyFingerprintDiffs` → `frozenOracleImportOk: true`

These checks did not create a database and did not apply migrations.

## Authorized prove command — not run

```
node scripts/prove-f3-qualification-reset-local.mjs --normal-application-only --fingerprint-diff-out <path-in-workspace>
```

Not invoked. Without `psql` the helper’s `tryLocalPg()` path is `MUST_LOCAL` and writes `retention: null`. That is not a complete normal-application capture. The one authorized complete capture is left unused. No automatic rerun. No fault injection. No concurrency suite. No role alignment.

## What was not done

- No PGDG apt repo, no PostgreSQL 17 install, no CLI 2.117.0 download
- No hosted / disposable / production URL
- No repair experiment
- No fingerprint mapping or waiver
- No rewrite of the historical F23 package

## Linked repair input (not re-executed)

[REPAIR_FEASIBILITY.md](../M3_F3_DAYBREAK_CATALOG_V5_F23_CLOSEOUT_DECISION_INPUTS_20260920/REPAIR_FEASIBILITY.md)
