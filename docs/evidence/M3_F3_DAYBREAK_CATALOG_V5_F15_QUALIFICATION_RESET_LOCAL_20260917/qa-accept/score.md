# VillageClaq QA — F15 Framing Follow-up REVIEW ONLY

**Assigned by:** VillageClaq Chief  
**Repo:** `gatekipa/villageclaq`  
**Framing tip:** `49a91169fbb53dba149f4e7bbcf3016f988f4922`  
**Parent F15 ACCEPT:** `a4fa0832420d46f6cdd73b8f5e2ab381029dd2e1` (ancestor OK)  
**Date:** 2026-09-17 (America/New_York)

**Forbidden observed:** no Daybreak/Astra/disposable/production contact.

---

## Verdict: **F15 ACCEPT**

HOLD on parent (void `pg_advisory_xact_lock` blank line under psql `-At` → `F13_TX_OBSERVATION_FRAMING`) is closed. C4-R01–R03 still reject PREFIX/WRONG_PHASE/SUFFIX and EACCES+success. C1–C3/C5–C6 not regressed. Not live hosted reset / wipe / production auth.

---

## Suites (own counts)

| Suite | Result | Log |
| --- | --- | --- |
| `npm run test:f3-reset` | **47 PASS / 0 FAIL / 0 SKIP** (incl. F15-C4-R04) | `qa/reset-impl.txt` |
| `npm run test:f3-reset-design` | **28 PASS / 0 FAIL / 0 SKIP** | `qa/reset-design.txt` |

---

## Fix verification

| Check | Result |
| --- | --- |
| Emitter uses `PERFORM pg_advisory_xact_lock` inside DO | **PASS** — no top-level `SELECT pg_advisory_xact_lock` outside DO |
| Parser skips protocol whitespace-only lines | **PASS** — `isProtocolDefinedTxObservationWhitespaceLine`; blank-only stdout still FRAMING |
| Success path with interspersed blank lines | **PASS** — 8 observations parse; run → `F13_RESET_COMMITTED` / CLEAN_BASELINE |
| C4-R01 PREFIX/WRONG_PHASE | **PASS** (suite + own interpret `committed:false`) |
| C4-R02 EACCES+success | **PASS** (suite) |
| C4-R03 reorder/missing/WRONG_PHASE | **PASS** (suite) |
| C4-R04 advisory blank-line regression | **PASS** (suite) |
| C1–C3 / C5–C6 | **PASS** (all still green in 47) |

Changed vs parent: `f3-db-push-qualification-reset.mjs`, `prove-f3-qualification-reset-local.mjs`, `test-f3-qualification-reset.mjs`, plus plan markdown present on tip.

---

## Findings

- **P0 / P1 HOLD:** none

---

## STOP

**READY FOR CHIEF PASS/HOLD DECISION**

QA: **F15 ACCEPT** — tip `49a91169fbb53dba149f4e7bbcf3016f988f4922`. Offline reset **47/47**, design **28/28**. Not live hosted reset/wipe/prod.
