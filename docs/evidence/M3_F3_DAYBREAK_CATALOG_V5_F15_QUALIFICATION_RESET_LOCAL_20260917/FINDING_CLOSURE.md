# F15 finding closure — six corrections + local 3-TX

**Supersedes** F14 package READY / seven-closed claims for qualification-reset local candidate status.
Historical F14 evidence at `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F14_QUALIFICATION_RESET_LOCAL_20260917/` is preserved and not rewritten.

## QA
- Verdict: **F15 ACCEPT** (offline) on tip `a4fa0832420d46f6cdd73b8f5e2ab381029dd2e1` + plan `5ec5958ea6d6b60c7046e1c96b53636bd5ffe81d`
- Citation: `qa-accept/score.md`

## Six corrections (operational on tip bytes)

| # | HOLD | Status | Notes |
| --- | --- | --- | --- |
| 1 | Reconcile inventory facts + reject duplicate JSON keys | CLOSED locally | `reconcileQualificationResetInventoryFacts` + `parseDuplicateKeySafeJson` |
| 2 | Retain full dependency identities | CLOSED locally | `canonicalDependencyTuple` / observed/plan/auth/TX keep (kind, identity, from, to) |
| 3 | Align allowlist with migration-created constraints | CLOSED locally | 37 complete tuples from UNCHANGED 00118–00123 SQL |
| 4 | Authenticate complete TX observation sequence | CLOSED in code/tests | schema `f15-qualification-reset-tx-observation-v1`; see local HOLD below for real-psql blank-line gap |
| 5 | Committed helper must reproduce all three transactions | PARTIAL locally | All three TX **executed** via shared real transport; success observation framing HOLD |
| 6 | Commit complete generated hosted plan | CLOSED | blob `8ef4d43e669378f6b5031d6aa6f3284f6fc6cab3` = 18256 bytes / 267 lines |

## Wipe
Still rejected: `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`

## Local 3-TX (committed helper)
- classification: LOCAL_PG_EXECUTED (not MUST_LOCAL)
- executedTransactions: 3
- PASS: unexpected pre-plan block; unexpected-object TX rollback + sentinel; history-mismatch TX rollback + retained history
- **HOLD:** `TX_SUCCESSFUL_RESET` — void `SELECT pg_advisory_xact_lock` under `-At` emits leading blank line → `F13_TX_OBSERVATION_FRAMING` → `F13_RESET_NOT_COMMITTED` despite physical CLEAN effects
- overallOk: false → **not LOCAL CANDIDATE READY**

## Closures (tip bytes)
- Runtime `F15_QUALIFICATION_RESET_RUNTIME_CLOSURE`: `a5ebe7e025e04455553197fa6caa86ca3d6d8c1becde5299d1deec4e035315a7` (count 45)
- Verification union `F15_QUALIFICATION_RESET_VERIFICATION_UNION`: `eb5cbbaa66fa0956fe2d84c71a192e8f34fe12cf6a2aa8e1eb7e63eb1dfb760f` (count 48)
- ≠ forbidden summary `16e4757840aec5f4fb44504fbd33e8480de169553f9a1ccfb180dbde051cb66d`

## Floor
DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT
