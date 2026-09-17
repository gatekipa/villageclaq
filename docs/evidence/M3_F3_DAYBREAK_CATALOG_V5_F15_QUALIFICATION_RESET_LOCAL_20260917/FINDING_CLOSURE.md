# F15 finding closure — six corrections + local 3-TX (framing HOLD closed)

**Supersedes** F14 package READY / seven-closed claims for qualification-reset local candidate status.
**Supersedes** prior F15 HOLD evidence tip `d9e37d1f3bbfe35c47145b7ca886d2b4af486475` (TX_SUCCESSFUL_RESET observation framing).
Historical F14 evidence at `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F14_QUALIFICATION_RESET_LOCAL_20260917/` is preserved and **not rewritten**.

## QA
- Verdict: **F15 ACCEPT** (framing follow-up, offline) on tip `49a91169fbb53dba149f4e7bbcf3016f988f4922`
- Parent ACCEPT: `a4fa0832420d46f6cdd73b8f5e2ab381029dd2e1`
- Plan rebound: `206dce13d424f5303520d2b63a43768a078dda35` (blob `e8f2e894c9446793ae806eab2e58f46aa1026f58`)
- Citation: `qa-accept/score.md` (source `villageclaq-f15-49a91169/qa/score.md`)

## Six corrections (operational on tip bytes)

| # | HOLD | Status | Notes |
| --- | --- | --- | --- |
| 1 | Reconcile inventory facts + reject duplicate JSON keys | CLOSED locally | `reconcileQualificationResetInventoryFacts` + `parseDuplicateKeySafeJson` |
| 2 | Retain full dependency identities | CLOSED locally | `canonicalDependencyTuple` / observed/plan/auth/TX keep (kind, identity, from, to) |
| 3 | Align allowlist with migration-created constraints | CLOSED locally | 37 complete tuples from UNCHANGED 00118–00123 SQL |
| 4 | Authenticate complete TX observation sequence | CLOSED locally | schema `f15-qualification-reset-tx-observation-v1`; PERFORM-in-DO + whitespace skip; C4-R01–R04 PASS |
| 5 | Committed helper must reproduce all three transactions | CLOSED locally | All three TX PASS via shared real transport; success reaches commit/CLEAN_BASELINE |
| 6 | Commit complete generated hosted plan | CLOSED | rebound blob `e8f2e894c9446793ae806eab2e58f46aa1026f58` = 18256 bytes / 267 lines on `206dce13d424f5303520d2b63a43768a078dda35` |

## Wipe
Still rejected: `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`

## Local 3-TX (committed helper)
- classification: LOCAL_PG_EXECUTED (not MUST_LOCAL)
- executedTransactions: 3
- overallOk: **true** — pass 15 / fail 0
- PASS: pre-plan unexpected block; **TX_SUCCESSFUL_RESET → CLEAN_BASELINE / T7_COMMIT**; unexpected-object TX rollback + sentinel; history-mismatch TX rollback + retained history
- **Framing HOLD closed:** PERFORM `pg_advisory_xact_lock` in DO + protocol whitespace-only skip; PREFIX rejection retained
- → **LOCAL CANDIDATE READY** (local only; hosted not run)

## Closures (tip bytes)
- Runtime `F15_QUALIFICATION_RESET_RUNTIME_CLOSURE`: `949e68359e55870050e53ef3f93ec8179fc7a5e1587a908044e0ab26cfdbbb92` (count 45)
- Verification union `F15_QUALIFICATION_RESET_VERIFICATION_UNION`: `30dd8ad9972db6ef6dc7d4c35d49ae420ce2c445103c6180d469d901f88c5752` (count 48)
- ≠ forbidden summary `16e4757840aec5f4fb44504fbd33e8480de169553f9a1ccfb180dbde051cb66d`

## Floor
DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT
