# F23 HOLD package — Independent VillageClaq QA findings

**Reviewer:** VillageClaq QA  
**Functional tip:** `77fd61dbf51652acabec0093d2a8549524b2dd75`  
**Evidence tip / PR heads:** `c0a6746516b115b9e1db6ce311c4a4fe80113b01` (PINS package content tip: `dccaa795c800a2fe0b4f370b6234f875bd2655d9`)  
**Package:** `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_NORMAL_APPLICATION_LOCAL_20260920/`  
**Builder claim:** HOLD `F23_FINGERPRINT_MISMATCH` — `migrationsAppliedThrough00123=true` (exact six identities) but `completeThrough00123=false`; **NOT** LOCAL APPLICATION COMPLETE; **NOT** LOCAL CANDIDATE READY  
**Ancestry:** OK (`c0a674` → `dccaa795` → `77fd61db` → … → `f1d30b28`)  
**Recommended verdict:** **F23 HOLD PACKAGE ACCEPT**  
**Reviewed at:** 2026-09-20T00:20:28-0400 America/New_York (EDT)

## Astra
Both prior F22 Astra delegations failed at service access; no Astra verdict. QA did not contact Daybreak/Astra.

## Checks

| # | Item | Class | ok |
|---|------|-------|----|
| 1 | Verification-mode split (normal vs fault-injection; OR acceptance removed) | QA_EXECUTION + ARTIFACT_INSPECTION | yes |
| 2 | Normal path operational claim through 00123; fingerprint HOLD not application success | ARTIFACT_INSPECTION (prove re-run blocked) | yes |
| 3 | Fault-injection fresh F22 PRE_COMMIT_OR_ATOMIC_ROLLBACK; repairCalls=0 | ARTIFACT_INSPECTION | yes |
| 4 | Repair coverage matrix honesty | ARTIFACT_INSPECTION | yes |
| 5 | Membership 264 OID set equality + exact history identities | ARTIFACT_INSPECTION (recomputed) | yes |
| 6 | Package integrity unindexed=0; sanitization semantic | ARTIFACT_INSPECTION | yes |

### Check 1 — Verification-mode split
`resolveQualificationVerificationMode` records mode before DB ops; unspecified defaults to `fault-injection`; `hostedAuthority=false`. Helper sets `combinedAcceptanceRejected=true` and no longer OR-accepts via `completeThrough00123 || documentedAtomicRollbackHold`. Case `F23_OUTCOMES_NOT_COMBINED_OR` ok. Harness asserts absence of OR acceptance. Unit suites on functional tip: design **33/33**, reset **81/81**, harness **116/116** (matches package suite-logs).

### Check 2 — Normal path operational claim
From `COMPLETE_SEQUENCE.json` / `RESULTS.json` case `F23_NORMAL_APPLICATION_LOCAL_QUALIFICATION` / prove logs: preserve → pre-floor `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1` → floor → CLI **2.117.0** apply 00118–00123; inject absent (`historyInjects=0`); `operationCounts.repairs=0` / `repairCalls=0`; exact six history identities present; `migrationsAppliedThrough00123=true`; `completeThrough00123=false`; remainingHold `F23_FINGERPRINT_MISMATCH` (fingerprints not canonically equal). Fingerprint HOLD **not** credited as application success / LOCAL APPLICATION COMPLETE. **QA could not re-run** `prove-f3-qualification-reset-local.mjs` (no local PG / no `ubuntu` / no :5432) — recorded honestly.

### Check 3 — Fault-injection path
Fresh `f22_fault_inject` DB (not F23 DB). Mode `fault-injection`. Split `PRE_COMMIT_OR_ATOMIC_ROLLBACK`; `repairCalls=0`; historyAfter=0; objectsPresent=false; remainingHold `F22_LOCAL_CLI_ATOMIC_ROLLBACK_REPAIR_REFUSED` preserved as authenticated negative. F22 HOLD PACKAGE ACCEPT inherited as HOLD-package integrity only.

### Check 4 — Repair coverage matrix
Freshly exercised: F22 refuse (repairCalls=0). Inherited: F22 HOLD PACKAGE ACCEPT. Unexercised: post-commit filename-version repair / hosted split. Mandatory under approved contract: **yes**. Promoted not-exercised to PASS: **no**.

### Check 5 — Membership + history identities
Independent recompute of OID-bearing keys `(classid,objid,objsubid,refclassid,refobjid,deptype,extname,identity)`: **264** deptype=e tuples; beforeReset == afterReset == afterQualification for **both** faultInjection and normalApplication modes; cross-mode OID namespaces distinct (separate DBs). Normal path: exact six version/name identities; fault path: zero history rows. Counts alone insufficient (flag true).

### Check 6 — Package integrity / sanitization
on-disk (excl. index meta) **34** = evidence-index artifacts **34**; **unindexed=0**; all digests match; detached `evidence-index.sha256` matches; pack-scan digest-free and indexed. Closure `functionalTip` and authorized-script `worktreeSha256`/`executedByteSha256` match tip bytes (`crlfDetected=false`). Sanitization: no pg-url/JWT/credential leaks in key artifacts; preserves repo-relative scripts, migration identities, SQLSTATE/error codes, catalog hints; run-owned DB redaction observed.

## Material open findings
None that undermine HOLD-package integrity or mis-claim LOCAL APPLICATION COMPLETE / LOCAL CANDIDATE READY.

Non-material limitation: QA host lacked local PostgreSQL; prove paths artifact-corroborated only.

## Notes
- Do not treat fingerprint HOLD as application success.
- Do not treat this as LOCAL CANDIDATE READY or hosted authorization.
- Proposed hosted requal plan remains PROPOSED ONLY — NOT AUTHORIZED.
- Floor verbatim: DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT.
- DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN.
