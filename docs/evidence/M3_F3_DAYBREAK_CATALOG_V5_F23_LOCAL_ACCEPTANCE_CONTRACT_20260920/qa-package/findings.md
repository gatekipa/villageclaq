# VillageClaq QA — F23 local acceptance contract

**Identity:** VillageClaq QA  
**Completed:** 2026-09-20 03:17:00 EDT  
**Recommended verdict:** `F23 LOCAL ACCEPTANCE CONTRACT ACCEPT`

## Pins

| Role | SHA / value |
|------|-------------|
| Repo | gatekipa/villageclaq |
| Functional tip | `66be2b4797515975d737a0fd66656bc4c0de2145` |
| Evidence / #84/#85/#86 head | `b71f6fa37ac27dd559d9af09aa5fb0f3d9e74367` |
| Package evidenceTip in PINS | `0eb84ac20169ecb9288c7747aea9c31a18cc8425` |
| Package | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_LOCAL_ACCEPTANCE_CONTRACT_20260920/` |
| Profile | `LOCAL_FINGERPRINT_COMPARISON_PROFILE_V1` |
| Sealed envelope | `eb58900b492b95371decfdab86b3786afc2c8089c6b0a117497f9e0b22c41a2a` |
| Workspace | `/workspace/villageclaq-f23-contract-b71f6fa3/` |

## Constraints

OFFLINE ONLY — zero DB runs. No Daybreak/Astra/hosted/disposable/prod contact. No product-code mutation. No merge. No repair execution.  
Astra: **UNAVAILABLE — NO VERDICT** (recorded; not contacted).

## Checks

| # | Result | Name |
|---|--------|------|
| 1 | PASS | Versioned local comparison contract matches approval (creator remap, seven bound omissions, reject-else, preserve security surfaces) |
| 2 | PASS | Executable limited to prove-local / test / profile lib; hosted qualifier + gate do not import local profile |
| 3 | PASS | Reporting separates raw / local / hosted; raw `F23_FINGERPRINT_MISMATCH` preserved |
| 4 | PASS | Repair amendment (local not mandatory; fail-closed retained; hosted still required; no execution) |
| 5 | PASS | Offline tests 7/7 and 10/10 on functional tip; derived fingerprints labeled |

## Material open findings

None.

## Offline test re-run

- Focused (`F23 local|F23 hosted`): **7/7 PASS** — `qa/logs/offline-test-rerun.stdout.txt`
- Extended (+ mode/probe/history): **10/10 PASS** — `qa/logs/offline-test-rerun-10.stdout.txt`
- Derived retained-capture reassessment: raw HOLD + local ACCEPTED — `qa/logs/derived-fingerprint-reassessment.json`
- Matches `pkg/OFFLINE_TEST_RESULT.md`

## Rationale

Contract implementation and package docs agree. Shared strict comparator remains the raw/hosted gate; local profile never sets `repairAuthorized` or `hostedEquality`. Hosted requalification remains DAYBREAK HOLD and is outside this local-acceptance-contract verdict.

## Provenance

See `qa/logs/provenance.txt` and `qa/findings.json#attributableProvenance`.
