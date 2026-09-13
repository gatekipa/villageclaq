# M3 F3 documented stub+live-pin floor — 2026-09-13

**OVERALL VERDICT: local composition PASS; Chief 06 clean-check PASS; hosted db-push NOT RUN (no password on this VM).**

Required floor label:

`DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT`

Do **not** convert this packaging to production PASS.  
Do **not** claim clean `00001`–`00117` replay PASS.  
Do **not** claim FILE-BASED RUNNER QUALIFICATION PASS.  
Do **not** claim merge/deploy auth.  
Success label, if and only if Chief hosted sequence + gates succeed:

`FILE-BASED RUNNER MECHANICS PASS — STUB/LIVE-PIN QUALIFICATION FLOOR`

## What this auth does

Greenfield `00001`–`00117` replay is **replaced** as the hosted default. Floor SQL is applied with gated disposable `psql -f` only:

1. `STUB_CORE_SQL`
2. `REGRESSION_SLICE_SQL`
3. `CUT2_QUEUE_SLICE_SQL`
4. Exact live `has_group_permission` from Cut 3 `_cut3_live_functiondef_hex.json`
5. Exact `enqueue_outbound_notification` from the 00115 extraction path
6. Exact `remoteFloorOwnershipAndAclSql`
7. Exact unmodified `00117_m2_notification_policy_foundation.sql` bytes via gated `psql -f`

**NOT** Management API. **NOT** db push for 00117. **NOT** MCP apply. **NOT** 00030/00057 transforms. **NOT** a re-wipe.

Isolated db-push workdir copies remain `00118`–`00123` only (`20260913173000`–`005`). Earlier production history is intentionally not reproduced. Do **not** invent `schema_migrations` rows for 00117.

Pre-db-push gates (any miss → HOLD, no db push): HGP/enqueue MD5+ACL, queue ACLs, 00117 postconditions, F3 absent, recognition exactly `["manual_income"]`, history empty, no residue, frozen 00118–00123 digests.

Hosted HOLD `F3_PRE_STUB_FLOOR_CLEAN_CHECK_HOLD` root cause: CLI 2.117.0 `supabase db query` defaulted to a box-drawn **text table**, so `inventoryCapture.body` was a string starting with `┌`. `JSON.parse` failed; `schema_migrations_present` was undefined; `leftoverOk` was false. Harness now detects `--output-format` from help, appends `--output-format json` before SQL/`--file`, and unwraps `{ rows: [ { jsonb_build_object } ] }` via `inventoryFromQuery`. `parseJsonish` stays as mixed-text defense-in-depth. Leftover named floor storage policies / empty `avatars` `group-documents` `receipts` buckets are residual cleanup (narrow DROP), not `--wipe-to-baseline`.

## This VM

| Check | Result |
|-------|--------|
| Unit tests `test:f3-db-push` (includes CLI JSON unwrap + Chief 06 clean-check) | **PASS** (56/56) |
| Local composition / isolated workdir / 00117 bytes | **PASS** |
| Local PG17 apply through 00117 | **NOT_RUN** — no local PostgreSQL 17 |
| Hosted disposable password | **absent** |
| Hosted `--prep-floor --sequence-f3` | **NOT_RUN** — Chief runs hosted |
| Qualify without env | **NOT_RUN** exit 2 |
| 00118–00123 SQL bytes | **unchanged** (frozen digests) |
| Disposable `jkorwnwwmdeflfntxntl` | **CLEAN** — Chief 06 PASS — do not re-wipe |
| Chief 06 packaging | `docs/evidence/M3_F3_06_PRE_STUB_FLOOR_CLEAN_CHECK_20260913.md` (from Chief box facts; originals not on this VM) |
| Production `llbnliixczcqfftxpsmb` | **not contacted** |

## Chief hosted RUN command

```bash
export F3_DBPUSH_DISPOSABLE_SENTINEL=villageclaq-f3-dbpush-20260913-authorized
export F3_REMOTE_DESTRUCTIVE_TEST=1
export VILLAGECLAQ_F3_DISPOSABLE_DB_PASSWORD='<password from founder vault; do not commit>'
# optional GET-only: export VILLAGECLAQ_F3_DISPOSABLE_MGMT_TOKEN='<token; GET/query only>'
node scripts/qualify-f3-db-push-disposable.mjs --no-wipe --prep-floor --sequence-f3 --floor-mode=stub-live-pin
```

`--floor-mode=greenfield` HOLDs. `--wipe-to-baseline` HOLDs. Session-mode pooler `aws-0-us-east-1.pooler.supabase.com:5432` user `postgres.jkorwnwwmdeflfntxntl`. Never `-p`. Never print the URL. CLI pin **2.117.0**.

## Pins

| Pin | Value |
|-----|-------|
| Functional SHA | `bb4d76d696313f5fb4812453d8ce4fb82ab193c4` |
| Evidence SHA | `PENDING_EVIDENCE` |
| Tip SHA | `PENDING_TIP` |
| Prior functional | `5fe08e237870739fb9765130380afa7c6c6da605` |
| Prior evidence | `eaf84a83214cdbefa727e594e6cd7287a2df28df` |
| Prior tip | `da9d89c800eae0ec2adb503ac6191e3e73c205dd` |
| PR #83 | `a293f5958b31548ccec7591b653eff2857ae9a90` unchanged |
| Main | `d83d13d4fe9915a0d1ff149ce29a53ad708c9853` |
| Disposable | `jkorwnwwmdeflfntxntl` CLEAN |
| Recognition | exactly `["manual_income"]` |
| PR #84 | OPEN DRAFT (authoritative) |
| PR #85 / #86 | OPEN DRAFT companions; tree-identical |

## Claims

| Claim | Status |
|-------|--------|
| Production apply / approval | **NOT CLAIMED** |
| Clean 00001–00117 replay | **NOT CLAIMED** — documented fixture only |
| Production-equivalent floor | **NOT CLAIMED** |
| Management API apply | **PERMANENTLY DISQUALIFIED** |
| `db push` | **QUALIFICATION CANDIDATE ONLY** — hosted **NOT RUN** |
| FILE-BASED RUNNER QUALIFICATION PASS | **NOT CLAIMED** |
| FILE-BASED RUNNER MECHANICS PASS — STUB/LIVE-PIN QUALIFICATION FLOOR | **NOT CLAIMED** until Chief hosted sequence + gates |
| Merge / deploy | **DO NOT MERGE / DO NOT DEPLOY** |
