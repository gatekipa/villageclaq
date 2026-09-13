# M3 F3 `supabase db push` qualification candidate — 2026-09-13

**FILE-BASED RUNNER QUALIFICATION: BLOCKED** (hosted six-file sequence has not succeeded; re-run pending Chief secrets)

Do **not** convert this artifact to PASS.  
Do **not** claim production approval.  
Do **not** claim hosted db push fidelity PASS.  
Daybreak has **not** approved `db push` as the production runner.

Management API `POST /database/migrations {query,name}` remains **PERMANENTLY DISQUALIFIED**.

## Superseded hosted attempt (Chief box on tip `ca6df98`)

Chief ran `node scripts/qualify-f3-db-push-disposable.mjs --prep-floor --sequence-f3` with vault secrets on tip `ca6df986df53c7f4ab70dc9d5f8aa8be06d72425`.

- Exit **1** **HOLD** `F3_DBPUSH_FLOOR_HOLD`
- Root cause: `supabase db query --db-url --file` cannot execute multi-statement SQL (`cannot insert multiple commands into a prepared statement`)
- Bootstrap + `00001_core_tables.sql` failed; 00118–00123 sequence never ran
- Disposable history still `[]`
- That sanitized Chief-box evidence is **superseded** by functional SHA `164f579`

## Required fix (this revision)

Repository-controlled floor authority is `_f3_apply_current_main_floor.mjs` (`psql` / `psqlFile`), not `db query`. Hosted floor now:

1. Does **not** use `supabase db query --file` for bootstrap or 00001–00117
2. Uses gated remote `psql -f` (same db-push gates; session-mode pooler via child env `PGPASSWORD`; never `-p`; never log URL; isolated HOME; no ambient `DATABASE_URL`)
3. Preserves `installLiveHasGroupPermission` before 00116/00117 and after 00117
4. Keeps **candidate** runner for 00118–00123 as real `supabase db push` only
5. Keeps Management API apply permanently disqualified
6. Single-statement probes may still use `db query`; multi-statement is refused

00118–00123 SQL bytes/digests **UNCHANGED**. PR #83 untouched. PR #84 stays OPEN DRAFT UNMERGED.

Hosted re-run of `--prep-floor --sequence-f3` is **pending Chief vault secrets**. This VM still has no password. Do not invent hosted PASS.

**DO NOT MERGE.**  
**DO NOT APPLY 00118+ TO PRODUCTION.**  
**NO ASTRA / DAYBREAK CONTACT.**  
**DO NOT DELETE OR PAUSE** disposable `jkorwnwwmdeflfntxntl`.

## Pins

| Pin | Value |
|-----|-------|
| Base main | `d83d13d4fe9915a0d1ff149ce29a53ad708c9853` |
| Planning PR #83 (unchanged) | `a293f5958b31548ccec7591b653eff2857ae9a90` |
| Superseded hosted HOLD tip | `ca6df986df53c7f4ab70dc9d5f8aa8be06d72425` |
| **Functional SHA** | `164f57949df774586155b007bf8a6c067ded4874` |
| **Evidence SHA** | `e437b66737fac910013dc355e3b9179e3e4504c8` |
| **Tip SHA** | `e437b66737fac910013dc355e3b9179e3e4504c8` |
| Recognition | exactly `["manual_income"]` |
| Verdict | **BLOCKED** — hosted six-file sequence not yet re-run |
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

## Collision / versions (unchanged)

PASS vs production ceiling `20260912174049`. Last hosted history `[]`. Preassigned versions `20260913173000`–`20260913173005`. Isolated copies byte-identical to frozen digests. No repo timestamp filenames.

## Fresh local counts (2026-09-13T19:40Z; PostgreSQL 17.11; CLI 2.117.0)

| Suite | Result |
|-------|--------|
| db push harness | **29/29 PASS** |
| Combined `npm run test:f3` | **991/991 PASS** |
| `test:m2` | **111/111 PASS** |
| Cut 1 / Cut 2 / storage | **11/11 / 20/20 / 11/11 PASS** |
| `tsc --noEmit` | **PASS** |
| Qualify without env | exit 2 `NOT_RUN` / **BLOCKED** |
| Hosted floor after fix | **PENDING CHIEF RE-RUN** |
| Hosted six failure / repair / retry-skip | **NOT RUN** |

## Changed files (functional SHA `164f579`)

- `scripts/lib/f3-db-push-remote-sql-file.mjs` (new)
- `scripts/lib/f3-db-push-target-guard.mjs`
- `scripts/lib/f3-db-push-floor.mjs`
- `scripts/lib/f3-db-push-cli.mjs`
- `scripts/qualify-f3-db-push-disposable.mjs`
- `scripts/test-f3-db-push-harness.mjs`
- `docs/runbooks/F3_FOUNDER_CONTROLLED_MIGRATION_REPAIR.md`

## Chief re-run

```bash
export F3_DBPUSH_DISPOSABLE_SENTINEL=villageclaq-f3-dbpush-20260913-authorized
export F3_REMOTE_DESTRUCTIVE_TEST=1
export VILLAGECLAQ_F3_DISPOSABLE_DB_PASSWORD='<founder vault; do not commit>'
node scripts/qualify-f3-db-push-disposable.mjs --prep-floor --sequence-f3
```

Repair is never automatic. Do not claim FILE-BASED RUNNER QUALIFICATION PASS until the hosted six-file sequence succeeds.
