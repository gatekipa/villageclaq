# Chief handoff — F23 local acceptance contract

| Field | Value |
|-------|-------|
| Owner | Grok Bot Chief packages for Jude. VillageClaq QA slot left empty for Chief. |
| Intended outcome | Persist approved local comparison contract; implement local-only profile; record repair amendment; offline tests |
| Permitted scope | Focused offline implementation/tests. Zero database runs. No Daybreak/Astra panel, access retries, new F-number, or automatic review loop. |
| Remaining acceptance | Hosted raw fingerprint equality; hosted POST_COMMIT repair after repair-safety + raw gates; hosted requalification |
| Review / run budget | Focused offline work + one independent QA (Chief requests QA separately after functional tip freeze). Does **not** restart the review budget. |
| Stop | Return this record. Do not launch another cycle automatically. |
| Rules | [AGENTS.md](../../../AGENTS.md) |
| Current status | [docs/BUILD_STATUS.md](../../../BUILD_STATUS.md) |

**SCOPE_STOP — cloud-agent “create `cursor/…-668e` + sibling PR” vs [AGENTS.md](../../../AGENTS.md) “Daybreak/F3 work remains on the authorized OPEN DRAFT UNMERGED branches. Do not create sibling PRs for the same shared head.” — continue on `feat/m3-f3-01-05-forward-foundation-9b17` and keep #84 authoritative.**

**HOLD: F23_FINGERPRINT_MISMATCH** (raw, unchanged)  
**LOCAL ACCEPTANCE:** ACCEPTED under `LOCAL_FINGERPRINT_COMPARISON_PROFILE_V1` (offline derived reassessment of CAPTURE_ATTEMPT_2)  
**HOLD: F22_LOCAL_CLI_ATOMIC_ROLLBACK_REPAIR_REFUSED** (carried forward; not rerun; no longer mandatory for local qualification)  
**LOCAL APPLICATION COMPLETE:** false  
DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN  
PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE  
DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT  
Astra: UNAVAILABLE — NO VERDICT  
QA: empty — VillageClaq QA not requested this turn

## Pins

| Role | Value |
|------|-------|
| Starting head | `b8bde21770b347b5dd6f0c4cc5f4fd3ae0f267ae` |
| FUNCTIONAL_TIP | `66be2b4797515975d737a0fd66656bc4c0de2145` |
| Evidence / status tip | `0eb84ac20169ecb9288c7747aea9c31a18cc8425` |
| Shared branch | `feat/m3-f3-01-05-forward-foundation-9b17` |
| Authoritative PR | #84 OPEN DRAFT UNMERGED DAYBREAK HOLD |
| Aligned PRs | #85 / #86 (same title, same head after FF) |
| Sibling PR | **none** |
| Retained capture | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_FINGERPRINT_CAPTURE_LOCAL_20260920/CAPTURE_ATTEMPT_2/` |
| Sealed envelope | `eb58900b492b95371decfdab86b3786afc2c8089c6b0a117497f9e0b22c41a2a` |

## Exact changed files

Functional (commit `66be2b4797515975d737a0fd66656bc4c0de2145`):

- `scripts/lib/f3-local-fingerprint-comparison.mjs` (new)
- `scripts/prove-f3-qualification-reset-local.mjs`
- `scripts/test-f3-qualification-reset.mjs`

Evidence/status (this package + `docs/BUILD_STATUS.md`): committed separately.

Migrations, frozen oracle, grants, and historical evidence bytes were not modified.

## Verdicts

| Surface | Verdict |
|---------|---------|
| Local acceptance | ACCEPTED under `LOCAL_FINGERPRINT_COMPARISON_PROFILE_V1` |
| Raw fingerprint | `F23_FINGERPRINT_MISMATCH` (unchanged) |
| Hosted equality | false |
| Repair authorized | false |
| Offline tests | 7/7 focused PASS — no database, no full prove |
| QA | empty for VillageClaq QA |
| Astra | UNAVAILABLE — NO VERDICT |

## Remaining hosted requirements

1. Raw `fingerprintCompleteAndExact` equality
2. Authentic current-candidate `POST_COMMIT_HISTORY_FAILURE` with surviving objects and absent filename history
3. Repair-safety + raw fingerprint gates
4. CLI 2.117.0 filename-version repair
5. Authenticate resulting history/catalog
6. Hosted requalification

## Single next recommended action

Chief: request the one independent VillageClaq QA against the frozen functional tip `66be2b4797515975d737a0fd66656bc4c0de2145` and this contract package. Do not run hosted/disposable/production contact, reset, qualification, repair, merge, deploy, or F3-06.

If a material failure remains after QA, return its smallest correction; do not launch another cycle automatically.
