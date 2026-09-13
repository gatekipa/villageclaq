# M3 F3 `supabase db push` qualification candidate — 2026-09-13

**FILE-BASED RUNNER QUALIFICATION: HOLD**

Do **not** convert this artifact to PASS.  
Do **not** claim production approval.  
Do **not** claim hosted db push fidelity PASS.  
Daybreak has **not** approved `db push` as the production runner.

errorCode: `F3_DBPUSH_FLOOR_HOLD`  
exit: **1**

Management API `POST /database/migrations {query,name}` remains **PERMANENTLY DISQUALIFIED**.

Gated remote `psql -f` floor prep is **NOT** the candidate runner.  
`supabase db push` is the qualification candidate for **00118–00123 only** and was **not exercised** this run.

**DO NOT MERGE.**  
**DO NOT APPLY 00118+ TO PRODUCTION.**  
**NO ASTRA / DAYBREAK CONTACT.**  
**DO NOT DELETE OR PAUSE** disposable `jkorwnwwmdeflfntxntl`.  
**DO NOT CLEANUP / WIPE** the disposable in this commit.

**STOP:** founder must authorize wipe/retry. The disposable is now a **PARTIAL** floor. No agent cleanup.

PR **#84** remains **OPEN DRAFT UNMERGED** (authoritative). Companion **#85** stays OPEN DRAFT; trees identical.

## Pins

| Pin | Value |
|-----|-------|
| Base main | `d83d13d4fe9915a0d1ff149ce29a53ad708c9853` |
| Planning PR #83 (unchanged) | `a293f5958b31548ccec7591b653eff2857ae9a90` |
| Hosted functional tip | `164f57949df774586155b007bf8a6c067ded4874` |
| **Functional SHA** (unchanged) | `164f57949df774586155b007bf8a6c067ded4874` |
| Prior superseded HOLD (`db query --file`) | `ca6df986df53c7f4ab70dc9d5f8aa8be06d72425` |
| **Evidence SHA** | `79bdf1dd55fef7ddd0dcaa2162795a801ed4e741` |
| **Tip SHA** | `79bdf1dd55fef7ddd0dcaa2162795a801ed4e741` |
| Recognition | exactly `["manual_income"]` |
| Verdict | **HOLD** `F3_DBPUSH_FLOOR_HOLD` |
| Production approval | **NOT CLAIMED** |

## Authorized disposable (do not substitute)

| Item | Value |
|------|-------|
| Name | `villageclaq-f3-management-api-disposable-20260913` |
| Ref | `jkorwnwwmdeflfntxntl` |
| Org | `eyztkzkprpmlmcabrfef` |
| Identity host | `db.jkorwnwwmdeflfntxntl.supabase.co` |
| Session-mode pooler | `aws-0-us-east-1.pooler.supabase.com:5432` user `postgres.jkorwnwwmdeflfntxntl` `sslmode=require` |
| Sentinel | `villageclaq-f3-dbpush-20260913-authorized` |
| Production ref | `llbnliixczcqfftxpsmb` — **not contacted** |

## Partial-floor probe (before this run)

**CLEAN_ENOUGH_FOR_FLOOR** — no app/financial objects; `public` empty; `schema_migrations` empty leftover only; no STOP-before-cleanup required.

This run then created a **PARTIAL** floor. Disposable is no longer clean.

## Hosted tip run

Functional tip: `164f57949df774586155b007bf8a6c067ded4874`  
Command: `node scripts/qualify-f3-db-push-disposable.mjs --prep-floor --sequence-f3`

### Floor

- runner: **gated_psql_file** (NOT candidate; NOT db push; NOT Management API apply)
- Cleared the v1 multi-statement `db query --file` defect (`cannot insert multiple commands into a prepared statement`)
- bootstrap + **00001–00029** applied
- **failedAt: `00030_enterprise_branches_committees.sql`** (psql status=3)
- installed=`false` exact=`false`
- 00031–00117 **not applied**

Post-HOLD partial objects (Chief):

- org/group columns + `exchange_rates` committed
- `committees.budget_allocation` **absent**
- `get_user_group_ids` is `SETOF uuid` vs `unnest()` in 00030 policies (**likely cause**)
- Local bootstrap in `_f3_apply_current_main_floor.mjs` includes `public.unnest(uuid)` shim for that historical mismatch
- Remote floor **should** have applied that bootstrap first (qualifier order: bootstrap `psql -f`, then 00001–00117). This evidence commit does **not** re-query the disposable (no password here) and does **not** weaken checks. Whether `public.unnest(uuid)` is present and visible to unqualified `unnest(...)` on hosted search_path (vs `pg_catalog.unnest(anyarray)`) remains an **open investigation**, not a claimed proof.
- Do **not** weaken floor/HGP/digest checks in this commit.

### Sequence 00118–00123

**NOT RUN** (`sequence []`). No inject / repair / retry-skip / continuation / large-SQL apply observations beyond frozen digest prechecks.

### Disposable now PARTIAL

- ~71 public tables
- `schema_migrations` rows = 0
- Management API GET migrations `[]`
- Leave in place. Founder must authorize wipe/retry before another floor attempt.

## Frozen digests (UNCHANGED)

| File | SHA-256 |
|------|---------|
| `00118_f3_bounded_financial_epoch_foundation.sql` | `517774fd883ecc8c8ba7d2e287c7245a1289b21623c839f594b0801611968f3c` |
| `00119_f3_01_core_ledger_foundation.sql` | `9b09a733ed848e2a88a894db0815bd0f33f86335b58f7c9cd58845b6607d785d` |
| `00120_f3_02_secure_posting_idempotency.sql` | `4b870418ea15160a7aec0e6df707d9c8a3afc435f2d8bd1c861e0af7c47eb505` |
| `00121_f3_03_projection_read_proof.sql` | `568ae0b15b1b6e6c0a7effd9e9b5644a294cc22d76dbbf0e6714a28888825cf5` |
| `00122_f3_04_correction_reversal.sql` | `fd2c6e8729d1c7983421804b5f028edd16170c9f9056c8db2f3994f4dff8bdf9` |
| `00123_f3_05_opening_cash_command.sql` | `848b7cbe7e4e20e2e284d88f9954be0be8ffdfe4fc6d7c649e536d0c09aab699` |

Preassigned versions remain `20260913173000`–`20260913173005`. Collision vs prod ceiling `20260912174049` still PASS locally. No repo timestamp filenames.

## Claims

| Claim | Status |
|-------|--------|
| Production apply / approval | **NOT CLAIMED** / production untouched |
| Management API apply | **PERMANENTLY DISQUALIFIED** |
| `db push` | **QUALIFICATION CANDIDATE ONLY** — not exercised for F3 this run |
| `psql -f` floor prep | **NOT** the candidate production runner |
| FILE-BASED RUNNER QUALIFICATION PASS | **NOT CLAIMED** |

## Fresh local counts (do not override hosted HOLD)

Observed 2026-09-13T19:40Z; PostgreSQL 17.11; CLI 2.117.0. Hosted HOLD overrides any PASS claim.

| Suite | Result |
|-------|--------|
| db push harness | **29/29** (local only) |
| Combined `npm run test:f3` | **991/991** (local only) |
| `test:m2` | **111/111** |
| Cut 1 / Cut 2 / storage | **11/11 / 20/20 / 11/11** |
| `tsc --noEmit` | **PASS** |
| Qualify without env | exit 2 `NOT_RUN` |
| Hosted floor | **HOLD** `F3_DBPUSH_FLOOR_HOLD` failedAt 00030 |
| Hosted 00118–00123 | **NOT RUN** |

## Founder STOP

1. Do not cleanup, delete, or pause `jkorwnwwmdeflfntxntl` from this commit.
2. Do not continue 00118–00123 on this PARTIAL floor.
3. Wipe/retry requires **separate founder authorization**.
4. Next functional work (if authorized) must keep 00118–00123 bytes unchanged and must not treat `psql -f` as the F3 candidate runner.
