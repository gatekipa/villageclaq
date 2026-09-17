# VillageClaq QA — F15 LOCAL Correction REVIEW ONLY

**Assigned by:** VillageClaq Chief  
**Repo:** `gatekipa/villageclaq`  
**Functional tip:** `a4fa0832420d46f6cdd73b8f5e2ab381029dd2e1`  
**Plan commit (PROPOSED ONLY):** `5ec5958ea6d6b60c7046e1c96b53636bd5ffe81d`  
**Plan blob:** `8ef4d43e669378f6b5031d6aa6f3284f6fc6cab3` → `docs/evidence/.../PROPOSED_HOSTED_REQUAL_PLAN.md`  
**Parent F14 evidence:** `437f27c…` (ancestor OK)  
**F14 functional baseline:** `2d502a028b0d01808a871fb1d48d051813591ed2` (ancestor OK)  
**Accepted F12:** `1ec0e4da782ed7715a543be23f79bc0f10a28af2` (preserved)  
**Draft PR #111:** unused as authority  
**Date:** 2026-09-17 (America/New_York)

**Forbidden observed:** no Daybreak/Astra/disposable/production contact; no product-code edits by QA.

---

## Verdict: **F15 ACCEPT**

Daybreak F14 A/B defects reproduced and closed on the real shared inventory → plan → transport → proof → plan-blob path. Not live hosted reset / wipe / production authorization.

---

## Suites (own counts)

| Suite | Result | Log |
| --- | --- | --- |
| `npm run test:f3-reset-design` | **28 PASS / 0 FAIL / 0 SKIP** | `qa/reset-design.txt` |
| `npm run test:f3-reset` | **46 PASS / 0 FAIL / 0 SKIP** (F15-C1–C6 + F14 carry-forward) | `qa/reset-impl.txt` |
| `npm run test:f3-db-push` | **224 tests / 223 PASS / 0 FAIL / 1 SKIP** | `qa/f3-db-push.txt` |

Skip (environment): local PostgreSQL 17 peer-auth unavailable. Proof helper: `overallOk: true`, three TX scenarios present as `MUST_LOCAL` (`executedTransaction: false`).

---

## Plan blob (item 6)

| Claim | Measured |
| --- | --- |
| 18256 bytes / 267 lines | **18256 bytes / 267 lines** (`git cat-file -s/-p` on blob `8ef4d43e…`) |
| Not 406-byte stub | **Confirmed** (`NOT_STUB_406`) |
| PROPOSED ONLY | Header + status: PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE |
| Bound to functional tip | Document cites `a4fa0832…` |

Copy saved: `qa/PROPOSED_HOSTED_REQUAL_PLAN.from-blob.md`. Plan commit is not in functional tip tree (tip is ancestor of plan commit); blob read from `5ec5958:` as instructed.

---

## Daybreak F14 A/B checklist

| # | Defect | Result | Evidence |
| --- | --- | --- | --- |
| **1** Contradictory inventory + duplicate JSON keys | **CLOSED** | Empty discovered vs `public_tables` / views / `financial_core` / `schema_migrations_rows` → `F13_INVENTORY_CAPTURE_CONTRADICTION` via `reconcileQualificationResetInventoryFacts` / `observedFromQualificationResetCapture`. Qualify-main path HOLD, `applyCalls=0`, `sqlCalls=0`. Duplicate keys → `F13_INVENTORY_CAPTURE_DUPLICATE_KEYS` before parse discard. F15-C1-R01–R06. |
| **2** Altered `memberships_group_id_fkey` endpoints | **CLOSED** | Same name, wrong from/to → `F13_UNEXPECTED_OBJECT_OR_DEPENDENCY`; no SQL. Name-only string deps rejected. F15-C2-R01–R03 / C2-A01. |
| **3** Genuine migration FK identities | **CLOSED** | Allowlist carries catalog FKs incl. `posting_command_payloads_event_id_fkey` + correction composite FKs; eligible leftovers. Same-name altered kind/from/to rejected. F15-C3-R01–R02 / C3-A01. |
| **4** PREFIX/WRONG_PHASE/`committed:true` SUFFIX + EACCES | **CLOSED** | `interpretQualificationResetTransportResult` rejects F14-schema WRONG_PHASE substring; run → `F13_RESET_NOT_COMMITTED` / HOLD, not CLEAN_BASELINE. Complete ordered T0–T7 via `TX_OBSERVATION_SUCCESS_SEQUENCE` (F15 schema). F15-C4-R01–R03. |
| **5** Committed helper three TX | **CLOSED** | `scripts/prove-f3-qualification-reset-local.mjs` schema `f15-qualification-reset-local-proof-v1`; scenarios `TX_SUCCESSFUL_RESET`, `TX_UNEXPECTED_OBJECT_ROLLBACK`, `TX_HISTORY_MISMATCH_ROLLBACK`; uses gated/psql path (not fake committed fields). MUST_LOCAL here. F15-C5-R01. |
| **6** Complete plan from Git blob `5ec5958` | **CLOSED** | See plan blob table above. F15-C6-R01 offline builder also green. |

---

## Carry-forward / also verified

- Wipe still `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`
- F12 functional paths not touched vs F14 baseline
- Framing reject + `proargtypes` canonical identity still present (F14-R01 etc. still in 46)

---

## Findings

- **P0 / P1 HOLD:** none  
- **Environment:** local PG 17 unavailable → proof MUST_LOCAL + harness 1 SKIP (not product)

---

## STOP

**READY FOR CHIEF PASS/HOLD DECISION**

QA: **F15 ACCEPT** — functional tip `a4fa0832420d46f6cdd73b8f5e2ab381029dd2e1`; plan blob `5ec5958` = 18256/267. Offline **28 / 46 / 223(+1 skip)**. Not live hosted reset, wipe, or production auth.
