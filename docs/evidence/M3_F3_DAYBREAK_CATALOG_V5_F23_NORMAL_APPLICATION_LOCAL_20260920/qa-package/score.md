# F23 independent QA — HOLD package review

**Verdict: F23 HOLD PACKAGE ACCEPT**

**Reviewer:** VillageClaq QA (independent)  
**Date:** 2026-09-20 (America/New_York)

| Pin | Value |
| --- | --- |
| Functional tip | `77fd61dbf51652acabec0093d2a8549524b2dd75` |
| Evidence tip / PR heads | `c0a6746516b115b9e1db6ce311c4a4fe80113b01` |
| Package content tip (PINS) | `dccaa795c800a2fe0b4f370b6234f875bd2655d9` |
| Package | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_NORMAL_APPLICATION_LOCAL_20260920/` |
| QA_SLOT filled | `[SANITIZED_ABS_PATH]/qa/QA_SLOT_FILLED.md` |
| Findings | `[SANITIZED_ABS_PATH]/qa/findings.json` |
| This score | `[SANITIZED_ABS_PATH]/qa/score.md` |

**Builder claim corroborated:** HOLD `F23_FINGERPRINT_MISMATCH` — `migrationsAppliedThrough00123=true` (exact six identities) but `completeThrough00123=false` / `localApplicationComplete=false`. **Not** LOCAL APPLICATION COMPLETE. **Not** LOCAL CANDIDATE READY. Fingerprint HOLD is **not** credited as application success.

**Floor:** DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT  
**Status:** DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN  

No merge. No hosted/disposable. No Daybreak/Astra. Astra: prior F22 service-access failures only — no Astra verdict.

## Checks
| # | Result | Class | Summary |
|---|--------|-------|---------|
| 1 Mode split | **PASS** | QA_EXECUTION + ARTIFACT | normal-application vs fault-injection separate; combined OR acceptance removed; suites 33/33 · 81/81 · 116/116 |
| 2 Normal path | **PASS** | ARTIFACT_INSPECTION | preserve→gate→floor→CLI 2.117.0→00118–00123; inject absent; repairs=0; fingerprint HOLD. Prove re-run NOT_EXECUTED (no local PG) |
| 3 Fault-injection | **PASS** | ARTIFACT_INSPECTION | Fresh F22 `PRE_COMMIT_OR_ATOMIC_ROLLBACK`; repairCalls=0; F22 HOLD preserved as authenticated negative |
| 4 Repair matrix | **PASS** | ARTIFACT_INSPECTION | unexercised not promoted to PASS; mandatory=yes |
| 5 Membership + history | **PASS** | ARTIFACT (recompute) | 264 OID sets equal (both modes); exact six history identities on normal path |
| 6 Package integrity | **PASS** | ARTIFACT | unindexed=0; digests match; sanitization semantic |

## Material findings
None.

## Non-material limitation
Complete local prove re-run unavailable on this QA host (no ubuntu/PG). Live TX claims artifact-corroborated only.

## READY FOR CHIEF PASS/HOLD DECISION
