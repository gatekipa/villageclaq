# VillageClaq QA — F14 LOCAL Correction REVIEW ONLY

**Assigned by:** VillageClaq Chief  
**Repo:** `gatekipa/villageclaq`  
**F14 tip:** `2d502a028b0d01808a871fb1d48d051813591ed2`  
**Parent F13 evidence:** `137f1c825455c10bd7d974d3de7dcbdc610c9619` (ancestor OK)  
**Accepted F12 functional (preserved):** `1ec0e4da782ed7715a543be23f79bc0f10a28af2`  
**Draft PR #110:** unused as authority  
**Date:** 2026-09-17 (America/New_York)

**Forbidden observed:** no Daybreak/Astra/disposable/production contact; no product-code edits by QA.

---

## Verdict: **F14 ACCEPT**

Seven Daybreak F13 defects reproduced as regressions and verified closed on the real inventory/plan/transport/closure/plan paths (not green helpers alone). Not live hosted reset / wipe / production authorization. Chief parallel local PG may continue; this environment reports `MUST_LOCAL` (no local PG 17).

---

## Suites (own counts)

| Suite | Result | Log |
| --- | --- | --- |
| `npm run test:f3-reset-design` | **26 PASS / 0 FAIL / 0 SKIP** (incl. F14-A01–A02) | `qa/reset-design.txt` |
| `npm run test:f3-reset` | **29 PASS / 0 FAIL / 0 SKIP** (incl. F14-R01–R07) | `qa/reset-impl.txt` |
| `npm run test:f3-db-push` | **205 tests / 204 PASS / 0 FAIL / 1 SKIP** | `qa/f3-db-push.txt` |

Skip (environment): optional-role REVOKE — local PostgreSQL 17 peer-auth unavailable. Proof helper: `overallOk: true`, `mustLocal: true`, `localPg.available: false`, `classification: MUST_LOCAL`.

---

## Daybreak seven-defect checklist

| # | Defect | Result | Evidence |
| --- | --- | --- | --- |
| **1** Inventory framing / schema / empty | **CLOSED** | `parseQualificationResetInventoryProcessResult` rejects aligned/headed (`F13_INVENTORY_CAPTURE_FRAMING`), empty stdout (`…_INCOMPLETE`), `{schema:anything}` / incomplete (`…_SCHEMA_MISMATCH` / malformed). `QUALIFICATION_RESET_INVENTORY_PSQL_ARGV` includes `-X -q -t -A`. alreadyClean requires `inventoryCaptured` + `captureComplete` (eligibility HOLD without). F14-R01. |
| **2** Preserve unexpected objects/deps | **CLOSED** | Capture SQL emits `discovered_objects` / `discovered_dependencies`; `observedFromQualificationResetCapture` requires observed_* == discovered_* or `F13_INVENTORY_CAPTURE_INCOMPLETE`. Hiding unexpected blocked (own probe + F14-R02). |
| **3** Canonical function identity (`proargtypes`) | **CLOSED** | Shared `CANONICAL_FUNCTION_IDENTITY_SQL` (design) used in inventory capture SQL and TX revalidate emit (`qualification-reset.mjs` ~693+). F14-A01/A02, F14-R03. |
| **4** Transport-result contract | **CLOSED** | `interpretQualificationResetTransportResult`: status0+COMMIT text alone → `committed:false`, not fabricated. Cases: `success_status_only` → `F13_RESET_NOT_COMMITTED` / HOLD; truncate/uncertain/timeout → `UNCERTAIN_COMMIT`, `rolledBack:null`, no replay, verdict ≠ CLEAN_BASELINE; rollback only when observed. F14-R04 (+ R10–R12). |
| **5** Local proof helper committed | **CLOSED** | `scripts/prove-f3-qualification-reset-local.mjs` + `prove:f3-qualification-reset-local`. Schema `f14-qualification-reset-local-proof-v1`; wipe still `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`; `hostedIdentityProof:false`; `disposableContact:false`; `overallOk:true`; MUST_LOCAL when PG absent. F14-R05. |
| **6** Closure runtime vs union | **CLOSED** | `publishQualificationResetClosures()`: labels `F14_QUALIFICATION_RESET_RUNTIME_CLOSURE` vs `F14_QUALIFICATION_RESET_VERIFICATION_UNION`; digests distinct; neither equals `F13_SUMMARY_FILE_HASH_FORBIDDEN`; union includes proof helper; runtime ctx `closureDigest` = runtime sha. F14-R06. |
| **7** Proposed hosted plan (PROPOSED ONLY) | **CLOSED** | `buildProposedQualificationResetHostedPlan` / `validateProposedQualificationResetHostedPlanOffline`: status PROPOSED ONLY, `authorized:false`, `executed:false`, reset+qual argv complete, wipe still rejected, transports disabled, noResetOccurred. F14-R07. |

---

## Also verified

- Wipe still `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`
- F12 functional paths not touched in tip diff vs parent
- Tip files: package.json, inventory/reset/design libs, prove helper, qualify, harness, design+reset tests (9 files)

---

## Findings

- **P0 / P1 HOLD:** none  
- **Environment:** local PG 17 unavailable here → proof MUST_LOCAL + harness 1 SKIP (not product)

---

## STOP

**READY FOR CHIEF PASS/HOLD DECISION**

QA: **F14 ACCEPT** — tip `2d502a028b0d01808a871fb1d48d051813591ed2`. Offline **26 / 29 / 204(+1 skip)**. Not live hosted reset, wipe, or production auth.
