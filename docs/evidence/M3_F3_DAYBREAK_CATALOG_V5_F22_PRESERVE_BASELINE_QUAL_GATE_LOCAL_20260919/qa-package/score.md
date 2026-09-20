# F22 independent QA — HOLD package review

**Verdict: F22 HOLD PACKAGE ACCEPT**

**Reviewer:** VillageClaq QA (independent)  
**Date:** 2026-09-19 (America/New_York)

| Pin | Value |
| --- | --- |
| Functional tip | `f1d30b28830db902962467f801932254997e64c3` |
| Evidence tip / PR heads | `6d6bdd7591d738e593bc7290d5f60e4be0de88ec` |
| Package content tip (PINS) | `686269dd3036ef654948d1812902d1b9a141ee3b` |
| Package | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F22_PRESERVE_BASELINE_QUAL_GATE_LOCAL_20260919/` |
| QA_SLOT filled | `[SANITIZED_ABS_PATH]/qa/QA_SLOT_FILLED.md` |
| Findings | `[SANITIZED_ABS_PATH]/qa/findings.json` |
| This score | `[SANITIZED_ABS_PATH]/qa/score.md` |

**Builder claim corroborated:** HOLD `F22_LOCAL_CLI_ATOMIC_ROLLBACK_REPAIR_REFUSED` — **not** reset-only success, **not** LOCAL CANDIDATE READY.

**Floor:** DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT  
**Status:** DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN  

No merge. No hosted/disposable. No Daybreak/Astra contact. Astra: both prior delegations failed at service access — recorded; no Astra verdict.

## Checks
| # | Result | Class | Summary |
|---|--------|-------|---------|
| 1 Pre-floor gate | **PASS** | QA_EXECUTION + ARTIFACT | Fresh inventory/membership auth; CLEAN_BASELINE unchanged; no strip/trust shortcuts; suites 33/33 · 78/78 · 115/115 |
| 2 Complete local qual | **PASS** | ARTIFACT_INSPECTION | Preserve → gate → floor → CLI 2.117.0 → stop @00118 `PRE_COMMIT_OR_ATOMIC_ROLLBACK`; repairCalls=0; completeThrough00123=false. **QA prove re-run unavailable** (no local PG / no ubuntu on this host) |
| 3 Membership 264 | **PASS** | ARTIFACT (recompute) | OID-bearing set equality before/after reset/after qual (n=264) |
| 4 Package integrity | **PASS** | ARTIFACT | unindexed=0; pack-scan indexed; digests match; sanitization keeps paths/migration names/error codes |
| 5 Raw-Git LF | **PASS** | QA_EXECUTION | Package CR=0; a38db9c claimed digests matched from authoritative LF blobs |

## Material findings
None.

## Non-material limitation
Complete local prove path not re-executed on this QA host (artifact-corroborated only for check 2 live TX).

## READY FOR CHIEF PASS/HOLD DECISION
