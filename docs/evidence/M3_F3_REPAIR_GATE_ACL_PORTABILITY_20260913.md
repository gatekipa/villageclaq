# M3 F3 repair-safety gate + optional-ubuntu ACL portability — 2026-09-13

**OVERALL VERDICT: local harness + ACL-portability PASS; hosted six-file qualify NOT_RUN (this VM).**

Required floor label:

`DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT`

Do **not** convert this packaging to production PASS.  
Do **not** claim clean `00001`–`00117` replay PASS.  
Do **not** claim unqualified FILE-BASED RUNNER QUALIFICATION PASS.  
Do **not** claim merge/deploy auth.  
Do **not** contact Daybreak Blue or Astra.  
Do **not** wipe/cleanup disposable.  
Do **not** touch production `llbnliixczcqfftxpsmb`.

## Prior hosted claim — SUPERSEDED (do not erase)

Prior hosted `FILE-BASED RUNNER MECHANICS PASS — STUB/LIVE-PIN QUALIFICATION FLOOR` is **SUPERSEDED**. Keep the prior packaging. Reasons (founder restatement):

1. Commands were exercised.
2. `00118` hit the intended history-failure.
3. `00119` / `00120` failed on missing role `ubuntu`.
4. `00121`–`00123` cascading `F3_ABORT`.
5. Repairing after SQL failures was **NOT** qualified recovery.
6. History alignment ≠ object install.
7. Repair-safety gate and F3 install were **NOT** qualified.

Permitted later hosted success label (Chief only; **not** claimed here):

`FILE-BASED RUNNER QUALIFICATION PASS — STUB/LIVE-PIN FLOOR LIMITATION`

## Pins

| Pin | Value |
|-----|-------|
| Starting shared tip | `a19b1ea965a9772e7471e2560db7ec6a16b3f3a9` |
| Starting functional | `e13e9108db9162981d4c5395be8d8514345b3363` |
| Starting evidence | `d313456fc685163c369c059eb42086c15c5b630f` |
| **Functional SHA** | `d70db3e54e1992a96aae0c9eceda7f4e61f7b4a4` |
| **Evidence SHA** | `6ca63131f4f09002cbdadd0aca1f388b1dc01096` |
| **Tip SHA** | `9c232407b7be0da387858d0d4b2581659efae104` |
| PR #83 | `a293f5958b31548ccec7591b653eff2857ae9a90` unchanged / frozen |
| Main | `d83d13d4fe9915a0d1ff149ce29a53ad708c9853` |
| Disposable | `jkorwnwwmdeflfntxntl` — Chief will seal/cleanup/reinstall; this agent did not wipe |
| Recognition | exactly `["manual_income"]` |
| PR #84 | OPEN DRAFT UNMERGED (authoritative) |
| PR #85 / #86 | OPEN DRAFT companions; tree-identical |
| ubuntu role created | **NO** |
| Merge / deploy | **DO NOT MERGE / DO NOT DEPLOY** |
| Hosted db push | **NOT_RUN** |

## TASK A — Repair gate first

Harness order reversed. Repair may spawn **only after all eight proofs**:

1. Failure injection installed for the exact target version
2. `db push` exited nonzero
3. Output contains the exact target-specific injected history-failure marker
4. No unrelated migration-SQL error
5. Target version absent from migration history
6. Every expected object + security postcondition exists
7. Migration-specific catalog/security fingerprint complete + exact
8. SQL digest matches founder-authorized candidate bytes

Any miss: finally-style drop only the disposable poison trigger/function; **no repair**; **no next migration**; **no continuation**; HOLD with the original SQL error.

Module: `scripts/lib/f3-db-push-repair-safety-gate.mjs` (`evaluateRepairSafetyGate`, `runRepairSafetyThenMaybeRepair`). Qualifier calls `runFilenameVersionRepair` only inside the authorized repair callback.

### Negative tests (zero repair processes; poison cleanup still safe)

Suite `repair-safety negatives spawn zero repair processes and still clean poison` — **6/6 PASS**, each `repairCalls === 0`, `cleanupCalls === 1`, `nextMigration === false`:

| Case | Result |
|------|--------|
| missing-role SQL failure | PASS — no repair |
| F3_ABORT | PASS — no repair |
| missing expected objects | PASS — no repair |
| wrong injection marker | PASS — no repair |
| missing injection marker | PASS — no repair |
| target history unexpectedly present | PASS — no repair |

Positive: `repair-safety gate authorizes repair only after all eight proofs` **PASS**.  
Ordering: `qualify runner classifies before repair and uses the new success label` **PASS**.

## TASK B — ACL portability (00118–00123 only)

Scan: 4 unconditional ubuntu-containing REVOKE statements per file × 6 = **24**.

Each `$f3_owner_acl$` statement now:

- `REVOKE … FROM PUBLIC, anon, authenticated, service_role` unconditionally
- `REVOKE … FROM ubuntu` only inside `IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ubuntu') THEN … END IF`

Surrounding `to_regprocedure` gates and authenticated GRANTs preserved. No financial/body/recognition/RLS/ownership/txn/API/object-definition changes. Generator `POST_OWNER` in `scripts/generate-f3-forward-migrations.py` matches so regenerate stays byte-identical. No `CREATE ROLE ubuntu`.

Functions (4 per file, identical ACL block across all six):

1. `public.post_financial_command(jsonb)`
2. `public.correct_financial_event(jsonb)`
3. `public.post_financial_opening_cash(jsonb)`
4. `public.get_financial_projection_bundle(...)` + `public.get_financial_cashbook(...)` (one combined REVOKE)

Semantic diff: only conditional optional-ubuntu handling inside `$f3_owner_acl$`.

### Old vs new SHA-256

| File | SUPERSEDED (old) | FROZEN (new) |
|------|------------------|--------------|
| `00118_f3_bounded_financial_epoch_foundation.sql` | `517774fd883ecc8c8ba7d2e287c7245a1289b21623c839f594b0801611968f3c` | `bb823ebdddcefba7774f3347a609a05393d9a67c9430d0bd925c3458eaf5efed` |
| `00119_f3_01_core_ledger_foundation.sql` | `9b09a733ed848e2a88a894db0815bd0f33f86335b58f7c9cd58845b6607d785d` | `b22e16783fbb429ccae0ce15291d83311861f4e873cd01363bbd630372633f11` |
| `00120_f3_02_secure_posting_idempotency.sql` | `4b870418ea15160a7aec0e6df707d9c8a3afc435f2d8bd1c861e0af7c47eb505` | `d81c8f52d4fccea4b654c3a54806ffc07d654ffa2a33540c97b74721d56b9a60` |
| `00121_f3_03_projection_read_proof.sql` | `568ae0b15b1b6e6c0a7effd9e9b5644a294cc22d76dbbf0e6714a28888825cf5` | `51f40ccbd7dad79362b8cf2cd9854b9c8cdfd7295e4c10be5892d953915e90ce` |
| `00122_f3_04_correction_reversal.sql` | `fd2c6e8729d1c7983421804b5f028edd16170c9f9056c8db2f3994f4dff8bdf9` | `84f52b89b764a468db7748e5c572f2543c5d466e5369ff36e6889d85ca8434f3` |
| `00123_f3_05_opening_cash_command.sql` | `848b7cbe7e4e20e2e284d88f9954be0be8ffdfe4fc6d7c649e536d0c09aab699` | `0c8af9d755e5329ca58d6c5ae967fbe5b18e3e41bb836c934cfea0c06afce96d` |

## TASK C — Fresh local verification (this agent)

| Suite | Result |
|-------|--------|
| `test:f3-db-push` | **67 pass / 1 skip / 0 fail** (68 tests). Skip: local PG17 optional-role REVOKE apply (`psql admin failed`) |
| Repair-gate negatives | **6/6 PASS** — zero repair processes |
| ACL portability static | **3/3 PASS** — 24 standard + 24 optional; no `CREATE ROLE ubuntu`; generator matches |
| `test:f3-oracles` | **577/577 PASS** |
| `test:f3-recognition` | **40/40 PASS** — allowlist exactly `["manual_income"]` |
| `test:f3-mapi-harness` | **22/22 PASS** |
| `test:f3-local-safety` | **45/45 PASS** |
| `test:f3-atomicity` | **2 pass / 12 fail** — generator/idempotent PASS; PG apply fail `psql admin failed` (no local PostgreSQL 17). Not a semantic fail |
| `test:f3-external-ledger` | **2 pass / 7 fail** — digests + runbook PASS; remainder no PG / no supabase CLI |
| Ubuntu-absent / ubuntu-present apply | **NOT_RUN** on this VM (no local PG17). Static SQL proves IF EXISTS no-op when absent; Chief hosted will exercise both |
| `tsc --noEmit` | **NOT_RUN** — `./node_modules/.bin/tsc` absent (`npx tsc` is not the project compiler) |
| Hosted `--prep-floor --sequence-f3` | **NOT_RUN** — no disposable password; out of scope |

Astra stopped — no UX/semantics change. HOLD if semantics/UX would change (they did not).

## Claims

| Claim | Status |
|-------|--------|
| Production apply / approval | **NOT CLAIMED** |
| Clean 00001–00117 replay | **NOT CLAIMED** |
| Production-equivalent floor | **NOT CLAIMED** |
| Management API apply | **PERMANENTLY DISQUALIFIED** |
| `db push` | **QUALIFICATION CANDIDATE ONLY** — hosted **NOT RUN** |
| FILE-BASED RUNNER QUALIFICATION PASS | **NOT CLAIMED** |
| FILE-BASED RUNNER MECHANICS PASS — STUB/LIVE-PIN QUALIFICATION FLOOR | **SUPERSEDED** (do not erase) |
| FILE-BASED RUNNER QUALIFICATION PASS — STUB/LIVE-PIN FLOOR LIMITATION | **NOT CLAIMED** — Chief hosted only |
| ubuntu role created | **NO** |
| Recognition widened | **NO** — still `["manual_income"]` |
| PR #83 touched | **NO** |
| New PR opened | **NO** |
| Merge / deploy | **DO NOT MERGE / DO NOT DEPLOY** |

## Chief hosted (out of scope here)

Chief seals inventory, cleans `jkorwnwwmdeflfntxntl`, reinstalls stub floor, and reruns six-file qualify after this tip.

```bash
export F3_DBPUSH_DISPOSABLE_SENTINEL=villageclaq-f3-dbpush-20260913-authorized
export F3_REMOTE_DESTRUCTIVE_TEST=1
export VILLAGECLAQ_F3_DISPOSABLE_DB_PASSWORD='<password from founder vault; do not commit>'
node scripts/qualify-f3-db-push-disposable.mjs --no-wipe --prep-floor --sequence-f3 --floor-mode=stub-live-pin
```
