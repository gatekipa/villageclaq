# PROPOSED HOSTED REQUALIFICATION PLAN — PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE

**Status:** PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE  
**Selected verification mode:** `fault-injection`  
**Overall status:** DAYBREAK HOLD — HOSTED ATTEMPT_2 STOPPED AT RESET; QUALIFICATION NOT STARTED  
**Label:** F24 REBOUND PROPOSED HOSTED REQUAL — NEW CANDIDATE AFTER LOCAL DEPENDENCY-ORDER CORRECTION  
**Policy / success identity:** `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1`  
**Floor (verbatim):** DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT

**PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE.**  
This document does not authorize wipe, hosted reset, credential use, Daybreak/Astra contact, Management API apply, enriched hosted capture, repair execution, merge, deploy, or a third hosted attempt.

ATTEMPT_1 (missing `psql`) and ATTEMPT_2 (`F13_RESET_SQL_FAILED`) budgets are **consumed**. Their original records and plan bytes are preserved. This file is a **new** proposed plan bound to **new** functional bytes. Old founder-auth cannot authorize these bytes.

Historical consumed plan (do not mutate):  
`docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_PROPOSED_HOSTED_REQUAL_PLAN_20260920/PROPOSED_HOSTED_REQUAL_PLAN.md`  
SHA-256 `bf9ca7b6c408d72b9f1231f223628a41e77fe275132acf273cd5386dd8c3b138`.

## Why a new plan exists

ATTEMPT_2 failed because `DROP FUNCTION public.has_group_permission(uuid,text,uuid) RESTRICT` ran before table-owned notification RLS policies. Local F24 reordered existing DROPs only. Scope/SQL identity changed. Runtime and union changed because design + proof helper bytes changed.

Local proof: `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F24_DEPENDENCY_ORDER_LOCAL_20260920/`  
tip `724c7b9f5f751961dfd97c4dd3d00007f9c0cb11`.  
Local profile still grants **no** hosted acceptance or repair authority. Raw hold `F23_FINGERPRINT_MISMATCH` is unchanged.

## Bound identities

| Role | Value |
|------|-------|
| Functional tip (**new candidate**) | `874d7c63868398ae6779feb0e9cfd9751a8e34c5` |
| Pre-correction candidate (consumed ATTEMPT_2) | `66be2b4797515975d737a0fd66656bc4c0de2145` |
| Design commit | `cc1557e535c4765b8c16be125431b6aee83f07e1` |
| F24 local proof evidence tip | `724c7b9f5f751961dfd97c4dd3d00007f9c0cb11` |
| Starting evidence head | `afd1257328a7bd5785ab474b66deb30405544224` |
| Accepted local contract | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_LOCAL_ACCEPTANCE_CONTRACT_20260920/` |
| Local comparison profile | `LOCAL_FINGERPRINT_COMPARISON_PROFILE_V1` (no hosted authority) |
| Repair amendment | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_LOCAL_ACCEPTANCE_CONTRACT_20260920/REPAIR_AMENDMENT.md` |
| Sealed platform-ACL envelope | `eb58900b492b95371decfdab86b3786afc2c8089c6b0a117497f9e0b22c41a2a` |
| Policy / success / already-clean | `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1` |
| Inventory / membership schemas | `f21-qualification-reset-inventory-v1` / `f21-qualification-reset-membership-v1` |
| Membership policy | `f21-btree-gist-extension-preserve-scoped-v1` |
| Classification | `EXTENSION_PRESERVE_SCOPED` |
| Authorized extension | `btree_gist` |
| Runtime closure | `a88f34b378aa683a9e6412b773beaad5fc71490c0bf85ad0384a64b077d3039f` (count **47**) |
| Verification union | `b62c82e56072248cd08c56912d31304c1e31ee997b4613d411724ca90e45e19f` (count **49**) |
| Scope/SQL identity SHA-256 | `efd00f25ec108ba0e8041ae8890905cd347d925a750b77ed083dcccd40ee33a8` |
| Forbidden summary (must remain unequal) | `16e4757840aec5f4fb44504fbd33e8480de169553f9a1ccfb180dbde051cb66d` |
| Independent reference | `3742c0396903f3e91a779deec9b62d93a879f134c186f3b4b817a19c6ca99c91` |
| CLI pin | `2.117.0` |
| Shared branch | `feat/m3-f3-01-05-forward-foundation-9b17` |
| PRs | #84 authoritative; #85 / #86 aligned; OPEN DRAFT UNMERGED DAYBREAK HOLD; no sibling PR |

Runtime matches `F3_FUNCTIONAL_RECURSIVE_CLOSURE.closure_sha256`. `closure_complete=true`, missing=0, unresolved=0.

Cited-not-reusable (consumed ATTEMPT_2; must not authorize this plan):

| Identity | Value |
|----------|-------|
| ATTEMPT_2 runtime | `b276d0cb9b39efd10f67422948b4cf9a6353359c116ab657d379c7c7f467a211` |
| ATTEMPT_2 union | `89e4f0d80ff24d0aa705b79210073e2316667317b50d2d82a69808e8d7ff1f50` |
| ATTEMPT_2 scope/SQL | `d95d96e02a3a1844977d852fa23a64f742b79b5f767984b6a2d4512cbe02632f` |
| ATTEMPT_2 plan SHA-256 | `bf9ca7b6c408d72b9f1231f223628a41e77fe275132acf273cd5386dd8c3b138` |

**PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE.**

## Consumed hosted budgets (do not invent a third attempt here)

| Attempt | Outcome | Budget |
|---------|---------|--------|
| ATTEMPT_1 | stopped — `psql` missing; `F13_INVENTORY_CAPTURE_PROCESS_FAILED` | reset used; qual not run |
| ATTEMPT_2 | stopped — `F13_RESET_SQL_FAILED`; inventory captured; `committed=false`; qual **NOT RUN** | reset 1/1 used; committed resets 0; quals 0/1; secondReset false |

This package does **not** spend a third hosted attempt. A later founder authorization, if issued, would be a **new** 1+1 budget on this new candidate — not a continuation of ATTEMPT_2.

## Operational rule — pre-budget host checks

Before any future authorized database-run budget: connection-free checks on the **actual** host — `psql --version` (spawnSync from the runner Node/`PATH`), `supabase --version` exactly `2.117.0`, PATH includes client bins, evidence destination dirs creatable, and pinned identities (HEAD / **this** plan SHA-256 / new closureDigest / new scopeSqlIdentitySha256). Record a readiness receipt. Do not start reset/qual if readiness fails.

## Mode selection (unchanged source)

`fault-injection` remains the only existing mode that can produce authentic `POST_COMMIT_HISTORY_FAILURE` and exercise CLI 2.117.0 filename-version repair inside one `--sequence-f3` command. `normal-application` cannot. No third mode.

Hosted fingerprints stay **raw and unnormalized**. Local profile is not an input to `evaluateRepairSafetyGate` or hosted `fingerprintCompleteAndExact`.

## One qualification procedure (proposed; not authorized; not a third attempt)

Budget if Jude later issues **new** founder-auth for this candidate (`F13_EXECUTION_BUDGET`):

| Item | Count |
|------|-------|
| Constrained preserve resets | **1** (`alreadyClean` is a no-op and does not consume) |
| Complete quals from 00118 | **1** (`--verification-mode=fault-injection`) |
| Second reset | **false** |

Expected per-file counts if all six `F3_FORWARD_FILES` classify `POST_COMMIT_HISTORY_FAILURE` and pass raw/repair-safety gates: calibration=6, applications=6, historyInjects=6, repairs=6, per-file retries=6. Per-file retry is not an overall qualification rerun. Stop on first unexpected failure.

Wipe remains `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`.

## Exact commands (NOT AUTHORIZED)

Execution checkout **must** be functional tip `874d7c63868398ae6779feb0e9cfd9751a8e34c5`. `readBoundFunctionalCandidateSha()` is `git rev-parse HEAD`. A docs-only successor HEAD fails `F13_FOUNDER_AUTH_STALE`. ATTEMPT_2 artifact (`66be2b47` / old closure / old scope) fails `F13_FOUNDER_AUTH_STALE` / `F13_FOUNDER_AUTH_MISMATCH`.

### 0) Preconditions (read-only; still not authorized)

```bash
git rev-parse HEAD
# must equal 874d7c63868398ae6779feb0e9cfd9751a8e34c5
```

Refuse production `llbnliixczcqfftxpsmb` and transaction pooler `:6543` before any SQL.

### 1) Exactly one constrained preserve reset

```bash
node scripts/qualify-f3-db-push-disposable.mjs \
  --qualification-reset \
  --founder-authorization-artifact=docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F24_HOSTED_REQUAL/hosted/qualification-reset/FOUNDER_AUTH.json \
  --evidence-out=docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F24_HOSTED_REQUAL/hosted/qualification-reset/qualify-result.json
```

Reset apply argv (existing): `psql -X -q -t -A -w -v ON_ERROR_STOP=1 -f [FILE]`. Fresh inventory required. Name-only membership rows HOLD. Stop before mutation on unsupported inventory.

### 2) Exactly one complete qualification 00118–00123 with repair inside

```bash
node scripts/qualify-f3-db-push-disposable.mjs \
  --no-wipe \
  --prep-floor \
  --sequence-f3 \
  --floor-mode=stub-live-pin \
  --verification-mode=fault-injection \
  --evidence-out=docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F24_HOSTED_REQUAL/hosted/qualify-from-00118/qualify-result.json
```

Do **not** run `--verification-mode=normal-application` as a second qualification.

## Founder-authorization artifact (do not create or execute now)

Flag alone is not authorization. Artifact must have **no** connection material.

Required fields for **this** candidate:

```json
{
  "targetRef": "jkorwnwwmdeflfntxntl",
  "functionalCandidateSha": "874d7c63868398ae6779feb0e9cfd9751a8e34c5",
  "closureDigest": "a88f34b378aa683a9e6412b773beaad5fc71490c0bf85ad0384a64b077d3039f",
  "scopeSqlIdentitySha256": "efd00f25ec108ba0e8041ae8890905cd347d925a750b77ed083dcccd40ee33a8",
  "executionBudget": {
    "constrainedResets": 1,
    "completeQualsFrom00118": 1,
    "secondReset": false
  }
}
```

Stale artifacts (ATTEMPT_1/ATTEMPT_2, F19/F21/F22/F23 historical closures, production ref, wipe flag, budget ≠ 1/1/false) must HOLD. This docs package does **not** write that artifact.

## Target / wipe / finite scope

- Disposable only: `jkorwnwwmdeflfntxntl`
- Production forbidden: `llbnliixczcqfftxpsmb`
- Reject `:6543`
- Wipe forbidden
- Success identity `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1`
- Object count **113** (112 destructive + 1 preserve `ext.btree_gist`)
- Dependency count **43**
- History key count **6**
- Scope/SQL `efd00f25ec108ba0e8041ae8890905cd347d925a750b77ed083dcccd40ee33a8`
- No CASCADE. Deletion authority not expanded (no `DROP POLICY` / `DROP TRIGGER` statements; table-owned effects still ride on approved table DROPs)
- Hosted 188-function ownership remains **CANNOT CONFIRM**

## What this package is not

- Not hosted requalification authorization or PASS
- Not a third hosted attempt
- Not a wipe, Management API apply, production contact, Daybreak/Astra contact, or repair execution
- Not a local-profile hosted waiver
- Not a sibling PR
- Not merge / deploy / `origin/main` / F3-06
- Not a clean 00001–00117 replay and not production-equivalent

**PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE.**  
DAYBREAK HOLD — HOSTED ATTEMPT_2 STOPPED AT RESET; QUALIFICATION NOT STARTED  
DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT
