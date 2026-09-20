# F22 HOLD package — Independent VillageClaq QA findings

**Reviewer:** VillageClaq QA  
**Functional tip:** `f1d30b28830db902962467f801932254997e64c3`  
**Evidence tip / PR heads:** `6d6bdd7591d738e593bc7290d5f60e4be0de88ec` (PINS package tip: `686269dd…`)  
**Builder claim:** HOLD `F22_LOCAL_CLI_ATOMIC_ROLLBACK_REPAIR_REFUSED` — not reset-only, not LOCAL CANDIDATE READY  
**Ancestry:** OK  
**Recommended verdict:** **F22 HOLD PACKAGE ACCEPT**

## Astra
Both prior delegations failed at service access; no Astra verdict. QA did not contact Daybreak/Astra.

## Checks

| # | Item | Class | ok |
|---|------|-------|----|
| 1 | Pre-floor gate preserve baseline | QA_EXECUTION + ARTIFACT_INSPECTION | yes |
| 2 | Complete local qualification claim | ARTIFACT_INSPECTION (prove re-run blocked) | yes |
| 3 | OID-bearing membership 264 set equality | ARTIFACT_INSPECTION (recomputed) | yes |
| 4 | Package integrity unindexed=0 | ARTIFACT_INSPECTION | yes |
| 5 | Raw-Git LF hash adjudication | QA_EXECUTION | yes |

### Check 1
`resolvePreFloorQualificationGate` authenticates fresh inventory/membership for `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1`; historical `CLEAN_BASELINE` unchanged; no strip/trust-verdict shortcuts. Unit suites: design 33/33, reset 78/78, harness 115/115.

### Check 2
Package sequence: preserve → pre-floor allowFloor → floor → CLI 2.117.0 push 00118 → `PRE_COMMIT_OR_ATOMIC_ROLLBACK` / P0001 inject → repairCalls=0 → completeThrough00123=false. QA could not re-run local prove (no PG); recorded honestly.

### Check 3
Independently recomputed OID-bearing membership sets: beforeReset == afterReset == afterQualification (264).

### Check 4
unindexed=0; pack-scan indexed; evidence-index digests match; sanitization preserves repo-relative paths / migration identities / error codes.

### Check 5
All package blobs LF (CR=0). F21 a38db9c claimed digests independently matched via `git cat-file blob`. No CRLF drift credited as regression.

## Material open findings
None.

## Non-material limitation
Local PostgreSQL unavailable in this QA box — complete prove not re-executed.

## Outputs
- `[SANITIZED_ABS_PATH]/qa/QA_SLOT_FILLED.md`
- `[SANITIZED_ABS_PATH]/qa/findings.json`
- `[SANITIZED_ABS_PATH]/qa/logs/`
