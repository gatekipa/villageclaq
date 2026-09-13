# M3 F3 Management API live disposable probe — 2026-09-13

**FOUNDER-REPORT STATUS: HOLD — MANAGEMENT API VERSION UNRECOVERABLE**

Do **not** claim REMEDIATION PASS.  
Do **not** claim hosted Management API fidelity PASS.  
Do **not** attempt or claim repair.  
Do **not** claim full `00118`–`00123` remote apply completed.

This file is the current hosted-truth artifact. It incorporates the Chief live disposable probe on `jkorwnwwmdeflfntxntl` exactly. Token was never printed. No recovery was invented.

`docs/evidence/M3_F3_MANAGEMENT_API_RUNNER_FIDELITY_20260913.md` (tip `74e001e`) is **SUPERSEDED** insofar as it presented “GATED SCAFFOLDING READY / hosted NOT RUN” as current hosted truth. Local-gate counts below replace that revision’s counts.

**DO NOT MERGE.**  
**DO NOT APPLY 00118+ TO PRODUCTION.**  
**NO ASTRA / DAYBREAK CONTACT.**  
**DO NOT DELETE OR PAUSE** disposable `jkorwnwwmdeflfntxntl`.

Draft PR: https://github.com/gatekipa/villageclaq/pull/84

## Pins (Daybreak re-review — HOLD, not PASS)

| Pin | Value |
|-----|-------|
| Base main | `d83d13d4fe9915a0d1ff149ce29a53ad708c9853` |
| Planning PR #83 (unchanged) | `a293f5958b31548ccec7591b653eff2857ae9a90` |
| Start tip | `7affd0d90763bc6fd30fee0b0d968257ec7609d2` |
| Prior functional | `1ca63d9fe0d82a74a761fb742be87642b55329d6` |
| Harness unlock | `483e47f59927a11faeef305a33570e9976f48757` |
| Gate-sync fix | `96bed5a4cdccb71c977536265fead8c9f28529bb` |
| Superseded scaffolding evidence | `74e001eb2fd336924497b45f8db243da1f672f2c` |
| **Functional SHA** | `0c2fe83107fe440b46f978baf56ffd12db4f8cd4` |
| **Evidence tip** | *(this commit)* |
| Recognition | exactly `["manual_income"]` |
| Founder-report status | **HOLD — MANAGEMENT API VERSION UNRECOVERABLE** |
| Remediation PASS | **NOT CLAIMED** |
| Hosted fidelity PASS | **NOT CLAIMED** |

## Authorized disposable (do not substitute)

| Item | Value |
|------|-------|
| Name | `villageclaq-f3-management-api-disposable-20260913` |
| Ref | `jkorwnwwmdeflfntxntl` |
| Org | `eyztkzkprpmlmcabrfef` |
| Sentinel | `villageclaq-f3-mapi-20260913-authorized` via `F3_DISPOSABLE_MAPI_SENTINEL` |
| Token | env `VILLAGECLAQ_F3_DISPOSABLE_MGMT_TOKEN` only (never print / commit) |
| Destructive opt-in | `F3_REMOTE_DESTRUCTIVE_TEST=1` |
| Production ref | `llbnliixczcqfftxpsmb` — not contacted |

This VM still has token length 0. It did **not** re-run hosted POST/GET. Facts below are the Chief live probe, copied exactly.

## Chief live result on `jkorwnwwmdeflfntxntl`

- Identity GET 200: name `villageclaq-f3-management-api-disposable-20260913`, ref `jkorwnwwmdeflfntxntl`, ACTIVE_HEALTHY, ≠ production.
- Baseline GET migrations: `[]`
- POST `/database/query` works (201) for SQL.
- Failure injection: created `schema_migrations` + BEFORE INSERT trigger raising `F3_MAPI_DISPOSABLE_HISTORY_INJECT`; then POST `/database/migrations` `{query,name}` tiny SQL creating `public.f3_mapi_throwaway_probe` ending COMMIT.
- Migration POST → HTTP 400; error mentions history INSERT blocked; list still `[]`; `schema_migrations` rows=0; `to_regclass` shows table EXISTS.
- Conclusion: SQL committed, history failed.
- Version recovery from response body / list_migrations / schema_migrations → **NONE**.
- **Verdict required: HOLD — MANAGEMENT API VERSION UNRECOVERABLE**
- Repair: DO NOT attempt / DO NOT claim.
- Full 00118–00123 remote apply: DO NOT claim completed; limitation that one runner-faithful case established universal unrecoverability under history-insert failure.
- Poison trigger/function dropped; throwaway table left; project not deleted.

## Limitation

One runner-faithful case established **universal unrecoverability under history-insert failure**. Do not treat a parser-only `version= name=` extract as hosted recovery. Do not clock, guess, or nearest-match a version. Repair is forbidden when the history phase fails before version persistence.

## What this revision encoded (local + gated)

1. Harness remains unlocked only for ref `jkorwnwwmdeflfntxntl` + sentinel `villageclaq-f3-mapi-20260913-authorized` + `F3_REMOTE_DESTRUCTIVE_TEST=1` + env token. Token is never hardcoded.
2. `classifyHistoryInsertFailure()` HOLDs and sets `repairForbidden` for HTTP 400 + history INSERT blocked / inject marker + empty list + empty schema.
3. Qualifier refuses repair and does not continue 00118–00123 on that HOLD.
4. Runbook uses the exact HOLD wording and forbids repair for this failure mode.

## Fresh local counts (2026-09-13T17:03Z; PostgreSQL 17.11; CLI 2.117.0)

Local remediable gates remain green. Combined founder status is still HOLD.

| Suite | Result |
|-------|--------|
| Remote Management API hosted re-run in this VM | **NOT RUN** (token absent) |
| Chief live probe (hosted) | **HOLD — MANAGEMENT API VERSION UNRECOVERABLE** |
| Version recovery (hosted) | **NONE** (response / list / schema) |
| Repair + continuation (hosted) | **FORBIDDEN / NOT ATTEMPTED** |
| Sequential 00118–00123 via Management API | **NOT COMPLETED** |
| Management API custom skip | **NOT OBSERVED — not claimed** |
| Management API harness (local unit) | **22/22 PASS** (was 20; +2 live-HOLD tests) |
| Local disposable safety | **45/45 PASS** (strength unchanged) |
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
| Combined `npm run test:f3` | **962/962 PASS** (960 prior + 2 HOLD unit tests) |
| `test:m2` | **111/111 PASS** |
| M2 static | **9/9 PASS** |
| Cut 1 static | **11/11 PASS** |
| Cut 2 non-regression | **21/21 PASS** (local disposable `s0p0b_cut2_disposable`; never production) |
| Cut 3 storage buckets | **11/11 PASS** |
| `tsc --noEmit` | **PASS** |
| `npm run build` | **PASS** (dummy `https://example.invalid.supabase.local`) |
| Qualify without env | exit 2 `NOT_RUN`; runbook HOLD + repair FORBIDDEN |

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

- REMEDIATION PASS
- Hosted Management API fidelity PASS
- Recovered version from the live 400 body / list_migrations / schema_migrations
- CLI repair attempted or completed
- Full 00118–00123 Management API apply completed
- Apply-time clock / guessed / nearest timestamp as a repaired version
- Management API custom skip / skip-if-present
- Local two-phase helper is API-equivalent
- Clean 00001–00117 disposable replay

## Cleanup recommendation (do not execute)

Leave disposable project `jkorwnwwmdeflfntxntl` in place. Do **not** delete or pause it from this task. Poison trigger/function already dropped by Chief. Throwaway table `public.f3_mapi_throwaway_probe` left in place.
