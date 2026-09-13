# M3 F3 Management API runner-fidelity scaffolding — 2026-09-13

**Verdict: GATED SCAFFOLDING READY. Hosted Management API fidelity NOT RUN in this VM.**

Token env `VILLAGECLAQ_F3_DISPOSABLE_MGMT_TOKEN` was **absent**. No hosted POST/GET against `jkorwnwwmdeflfntxntl` was attempted. Production `llbnliixczcqfftxpsmb` was not contacted.

This file **supersedes** Path B “remote fidelity BLOCKED — authorization required” only insofar as the founder has now named the disposable project and the harness is implemented and fail-closed. It does **not** claim hosted runner-fidelity PASS.

**DO NOT MERGE.**  
**DO NOT APPLY 00118+ TO PRODUCTION.**  
**NO ASTRA / DAYBREAK CONTACT.**  
**DO NOT DELETE OR PAUSE** disposable `jkorwnwwmdeflfntxntl`.

Draft PR: https://github.com/gatekipa/villageclaq/pull/84

## Pins

| Pin | Value |
|-----|-------|
| Base main | `d83d13d4fe9915a0d1ff149ce29a53ad708c9853` |
| Planning PR #83 (unchanged) | `a293f5958b31548ccec7591b653eff2857ae9a90` |
| Start tip | `7affd0d90763bc6fd30fee0b0d968257ec7609d2` |
| Prior functional | `1ca63d9fe0d82a74a761fb742be87642b55329d6` |
| Harness unlock | `483e47f59927a11faeef305a33570e9976f48757` |
| **Functional SHA** | `96bed5a4cdccb71c977536265fead8c9f28529bb` |
| Recognition | exactly `["manual_income"]` |
| Disposable name | `villageclaq-f3-management-api-disposable-20260913` |
| Disposable ref | `jkorwnwwmdeflfntxntl` |
| Disposable org | `eyztkzkprpmlmcabrfef` |

## What was implemented (local + gated remote)

1. `scripts/lib/f3-management-api-remote-harness.mjs` — real apply/list client. Body fields **only** `query`, optional `name`, optional `rollback`. File-stream / no caller version. Sanitized captures. Production ref refused first.
2. Gates require **all** of: exact approved ref, exact sentinel `villageclaq-f3-mapi-20260913-authorized`, `F3_REMOTE_DESTRUCTIVE_TEST=1`, token present, positive identity (name match) before apply/list.
3. Disclosed floor prep: stub + live pins + real 00117 + frozen 00118+ bytes. **NOT** a clean 00001–00117 replay.
4. Disposable post-COMMIT history inject + recovery from response / list_migrations / `schema_migrations` only. Missing identity → `HOLD — MANAGEMENT API VERSION UNRECOVERABLE`.
5. Repair+continuation scaffolding: discover CLI, read `migration repair --help`, timestamp-named lookup of exact authorized bytes, repair only the recovered version, then VillageClaq file-stream orchestration. Custom API skip is **not claimed**.
6. Chief runners: `scripts/prep-f3-disposable-management-api-floor.mjs`, `scripts/qualify-f3-management-api-disposable.mjs` (exit 2 `NOT_RUN` without env).

## Observed remote results

| Check | Result |
|-------|--------|
| Hosted apply POST | **NOT RUN** |
| Hosted list GET | **NOT RUN** |
| Identity GET | **NOT RUN** |
| Floor install on disposable | **NOT RUN** |
| Post-COMMIT inject on disposable | **NOT RUN** |
| Version recovery on disposable | **NOT RUN** |
| CLI repair against disposable DB | **NOT RUN** (`F3_DISPOSABLE_DB_URL` also absent) |
| Sequential 00118–00123 via Management API | **NOT RUN** |
| Management API custom skip | **NOT OBSERVED — not claimed** |

**Limitation:** this revision does **not** establish runner-faithful hosted behavior for even one file. Local inject/repair suites remain **NON-API simulation**. Do not treat one local case as universal Management API behavior.

## Fresh local counts (2026-09-13T16:49Z; PostgreSQL 17.11; CLI 2.117.0)

| Suite | Result |
|-------|--------|
| Remote Management API fidelity | **NOT RUN** (token absent; harness gated) |
| Version recovery (local unit) | **PASS** (response / list / schema / HOLD / no clock) |
| Version recovery (hosted) | **NOT RUN** |
| Repair + continuation (local unit) | **PASS** (lookup bytes, `--help` flags, 00118→00123 order) |
| Repair + continuation (hosted) | **NOT RUN** |
| Local disposable safety | **45/45 PASS** (strength unchanged; unauthorized apply/list still sync-throw + zero fetch) |
| SQL pre-commit atomicity | **14/14 PASS** |
| Local two-phase external-ledger (NON-API) | **9/9 PASS** |
| Recognition | **40/40 PASS** |
| F3-01 DB | **43/43 PASS** |
| F3-02 DB | **159/159 PASS** |
| F3-02 Astra | **169/169 PASS** |
| F3-03 DB | **25/25 PASS** |
| F3-03 Astra | **80/80 PASS** |
| F3-04 DB | **23/23 PASS** |
| F3-04 Astra | **170/170 PASS** |
| F3-05 DB | **31/31 PASS** |
| F3-05 Astra | **118/118 PASS** |
| Post-S0 regression | **14/14 PASS** |
| Combined `npm run test:f3` | **960/960 PASS** (940 prior + 20 harness) |
| `test:m2` | **111/111 PASS** |
| M2 static | **9/9 PASS** |
| Cut 1 static | **11/11 PASS** |
| Cut 2 non-regression | **20/20 PASS** |
| Cut 3 storage buckets | **11/11 PASS** |
| `tsc --noEmit` | **PASS** |
| `npm run build` | **PASS** (dummy `https://example.invalid.supabase.local`) |

## Frozen digests (unchanged)

| File | SHA-256 |
|------|---------|
| `00118` | `517774fd883ecc8c8ba7d2e287c7245a1289b21623c839f594b0801611968f3c` |
| `00119` | `9b09a733ed848e2a88a894db0815bd0f33f86335b58f7c9cd58845b6607d785d` |
| `00120` | `4b870418ea15160a7aec0e6df707d9c8a3afc435f2d8bd1c861e0af7c47eb505` |
| `00121` | `568ae0b15b1b6e6c0a7effd9e9b5644a294cc22d76dbbf0e6714a28888825cf5` |
| `00122` | `fd2c6e8729d1c7983421804b5f028edd16170c9f9056c8db2f3994f4dff8bdf9` |
| `00123` | `848b7cbe7e4e20e2e284d88f9954be0be8ffdfe4fc6d7c649e536d0c09aab699` |

## Withdrawn / not claimed

- Hosted Management API fidelity PASS
- Apply-time clock / guessed / nearest timestamp as a repaired version
- Management API custom skip / skip-if-present
- Local two-phase helper is API-equivalent
- Clean 00001–00117 disposable replay
- All six F3 files applied on the disposable via Management API

## Chief remote execution

See `docs/runbooks/F3_FOUNDER_CONTROLLED_MIGRATION_REPAIR.md`.

```bash
export F3_DISPOSABLE_MAPI_SENTINEL=villageclaq-f3-mapi-20260913-authorized
export F3_REMOTE_DESTRUCTIVE_TEST=1
export VILLAGECLAQ_F3_DISPOSABLE_MGMT_TOKEN='<founder vault; do not commit>'
# optional for CLI repair only:
# export F3_DISPOSABLE_DB_URL='<disposable db url; never production>'
node scripts/prep-f3-disposable-management-api-floor.mjs
node scripts/qualify-f3-management-api-disposable.mjs --prep-floor --inject-probe --apply-f3
```

## Cleanup recommendation (do not execute)

Leave disposable project `jkorwnwwmdeflfntxntl` in place. Do **not** delete or pause it from this task. Founder may later reset schema or retire the project after evidence is accepted.
