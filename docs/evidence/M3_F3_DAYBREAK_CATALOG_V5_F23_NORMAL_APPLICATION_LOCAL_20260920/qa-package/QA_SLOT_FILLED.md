# Independent VillageClaq Grok QA slot — FILLED

| Field | Value |
|------|-------|
| QA identity | VillageClaq QA |
| Reviewed functional SHA | `77fd61dbf51652acabec0093d2a8549524b2dd75` |
| Evidence tip / PR heads | `c0a6746516b115b9e1db6ce311c4a4fe80113b01` (package content tip recorded in PINS/handoff: `dccaa795c800a2fe0b4f370b6234f875bd2655d9`) |
| Package | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_NORMAL_APPLICATION_LOCAL_20260920/` |
| Scope | F23 normal-application local path through 00123 + separate F22 fault-injection HOLD (NOT LOCAL APPLICATION COMPLETE / NOT LOCAL CANDIDATE READY) |
| Builder claim | HOLD `F23_FINGERPRINT_MISMATCH` — `migrationsAppliedThrough00123=true` (exact six identities) but `completeThrough00123=false` due to hosted-oracle fingerprint ACL/owner ≠ local ubuntu fixture |
| Ancestry | OK: c0a674 → dccaa795 → 77fd61db → ff6c933e → acd3e237 → adb6ade2 → f1833133 → 6d6bdd75 → 686269dd → f1d30b28 |
| Workspace | `[SANITIZED_ABS_PATH]/` (repo@functional tip; package extracted via `git archive` from evidence tip) |
| Astra | Both prior F22 delegation attempts failed at service access; no Astra verdict. QA did not contact Daybreak/Astra. |
| Recommended verdict | **F23 HOLD PACKAGE ACCEPT** |
| Verdict label alone | NOT sufficient — see findings per item below and `qa/findings.json` |
| Reviewed at | 2026-09-20T00:20:28-0400 America/New_York (EDT) |

## Commands run (QA)

```bash
# Pins / extract
git checkout --detach 77fd61dbf51652acabec0093d2a8549524b2dd75
git archive c0a6746516b115b9e1db6ce311c4a4fe80113b01 \
  docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_NORMAL_APPLICATION_LOCAL_20260920 | tar -x

# Ancestry
git merge-base --is-ancestor <each pin> <child>   # all OK through f1d30b28

# QA_EXECUTION — unit/design/harness on functional tip (authorized scope)
node --test scripts/test-f3-qualification-reset-design.mjs   # 33 pass / 0 fail
node --test scripts/test-f3-qualification-reset.mjs          # 81 pass / 0 fail
node --test scripts/test-f3-db-push-harness.mjs               # 116 pass / 0 fail

# ARTIFACT_INSPECTION — mode-split symbols, package claims, membership, integrity, sanitization
node … membership OID-set recompute (both modes)
node … evidence-index digest verify + unindexed=0
rg / code inspection of resolveQualificationVerificationMode + combinedAcceptanceRejected
node … sanitization semantic spot-check on RESULTS / COMPLETE_SEQUENCE / prove-helper / handoff

# Local prove re-run
# NOT EXECUTED — no local PostgreSQL in this QA environment (no `ubuntu` user / no :5432 / no docker/psql).
# Builder package claims LOCAL_PG_EXECUTED / mustLocal=false; QA records mustLocal re-prove as unavailable.
```

## Raw result paths

| Artifact | Path |
|----------|------|
| Filled slot (this file) | `[SANITIZED_ABS_PATH]/qa/QA_SLOT_FILLED.md` |
| Findings JSON | `[SANITIZED_ABS_PATH]/qa/findings.json` |
| Findings MD | `[SANITIZED_ABS_PATH]/qa/findings.md` |
| Design test log | `[SANITIZED_ABS_PATH]/qa/logs/05_test_reset_design.out` |
| Reset unit test log | `[SANITIZED_ABS_PATH]/qa/logs/06_test_reset.out` |
| Harness test log | `[SANITIZED_ABS_PATH]/qa/logs/07_test_harness.out` |
| Membership recompute | `[SANITIZED_ABS_PATH]/qa/logs/02_membership_compare.txt` |
| Evidence-index verify | `[SANITIZED_ABS_PATH]/qa/logs/03_evidence_index_verify.txt` |
| Mode-split symbol search | `[SANITIZED_ABS_PATH]/qa/logs/04_script_symbol_search.txt` |
| Ops fields (F23/F22 cases) | `[SANITIZED_ABS_PATH]/qa/logs/09d_ops_fields.txt` |
| Sanitization spot-check | `[SANITIZED_ABS_PATH]/qa/logs/12_complete_case_and_sanitize.txt` |
| Closure/auth tip match | `[SANITIZED_ABS_PATH]/qa/logs/16c_closure_auth_match.txt` |
| Ancestry | `[SANITIZED_ABS_PATH]/qa/logs/10_ancestry.txt` |
| PG probe | `[SANITIZED_ABS_PATH]/qa/logs/11_pg_probe.txt` |
| Suite vs QA tests | `[SANITIZED_ABS_PATH]/qa/logs/17_suite_vs_qa_tests.txt` |
| Package COMPLETE_SEQUENCE | `…/pkg/local-pg-proof/COMPLETE_SEQUENCE.json` |
| Package prove-helper.out | `…/pkg/suite-logs/prove-helper.out` |
| Package MEMBERSHIP.json | `…/pkg/local-pg-proof/MEMBERSHIP.json` |
| Package REPAIR_COVERAGE | `…/pkg/local-pg-proof/REPAIR_COVERAGE.json` |

## Findings per required item

### 1) Verification-mode split
**Class:** QA_EXECUTION + ARTIFACT_INSPECTION — **ok**

- Functional tip: `QUALIFICATION_VERIFICATION_MODES` = `{fault-injection, normal-application}`; `resolveQualificationVerificationMode` selects before DB ops; unspecified → fault-injection; `hostedAuthority=false`.
- Helper `combinedAcceptanceRejected=true`; note that neither outcome OR-satisfies the other; harness asserts no `completeThrough00123 || documentedAtomicRollbackHold`.
- Package case `F23_OUTCOMES_NOT_COMBINED_OR` ok.
- Unit tests: **33/33 + 81/81 + 116/116** pass (match package suite-logs).

### 2) Normal path operational claim
**Class:** ARTIFACT_INSPECTION (primary); unit tests QA_EXECUTION — **ok** (re-prove blocked)

- preserve → `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1` → floor → CLI **2.117.0** → 00118–00123 applied
- inject absent; `repairs=0` / `historyInjects=0` / `repairCalls=0`
- exact six identities 20260913173000–005 / expected names — all present
- `migrationsAppliedThrough00123=true` **≠** `completeThrough00123=false` (fingerprint inequality → `F23_FINGERPRINT_MISMATCH`)
- Fingerprint HOLD **not** credited as LOCAL APPLICATION COMPLETE
- QA local prove: **NOT_EXECUTED** (no PG / no ubuntu / no :5432)

### 3) Fault-injection path
**Class:** ARTIFACT_INSPECTION — **ok**

- Fresh `f22_fault_inject` DB; mode `fault-injection`
- `PRE_COMMIT_OR_ATOMIC_ROLLBACK`; `repairCalls=0`; Hold `F22_LOCAL_CLI_ATOMIC_ROLLBACK_REPAIR_REFUSED` still authentic
- F22 HOLD PACKAGE ACCEPT inherited as HOLD integrity only — not LOCAL CANDIDATE READY

### 4) Repair coverage matrix honesty
**Class:** ARTIFACT_INSPECTION — **ok**

| Dimension | Statement |
|-----------|-----------|
| Freshly exercised | F22 induced history failure; repair-safety gate refused; repairCalls=0 |
| Inherited accepted evidence | F22 HOLD PACKAGE ACCEPT for `F22_LOCAL_CLI_ATOMIC_ROLLBACK_REPAIR_REFUSED` |
| Unexercised | post-commit filename-version repair after objects remain; hosted SQL-commit / history-INSERT split |
| Mandatory under approved contract | **yes** |
| Promoted not-exercised to PASS | **no** |

### 5) Membership 264 OID set equality + exact history identities
**Class:** ARTIFACT_INSPECTION (independent recompute) — **ok**

- Both modes: 264 deptype=e; beforeReset == afterReset == afterQualification (exact OID-bearing set equality)
- Cross-mode namespaces distinct; countsAloneInsufficient=true
- Normal: six exact version/name identities; fault: zero history rows

### 6) Package integrity / sanitization
**Class:** ARTIFACT_INSPECTION — **ok**

- unindexed=0; 34/34 digests match; evidence-index.sha256 match; pack-scan indexed
- Closures pin functional tip; authorized script executed/worktree sha256 match tip bytes
- Sanitization semantic: secrets/abs paths redacted; repo-relative paths, migration identities, SQLSTATE/error codes, catalog tuples preserved

## Material open findings
None.

Non-material limitation: QA environment lacked local PostgreSQL; complete local prove path not re-executed (artifact-corroborated only).

## Notes
- Do not fabricate QA ACCEPT beyond this HOLD-package acceptance.
- Do not contact Daybreak/Astra from this review.
- Floor: DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT.
- DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN.
