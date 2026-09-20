# Independent VillageClaq Grok QA slot — FILLED

| Field | Value |
|------|-------|
| QA identity | VillageClaq QA |
| Reviewed functional SHA | `f1d30b28830db902962467f801932254997e64c3` |
| Evidence tip / PR heads | `6d6bdd7591d738e593bc7290d5f60e4be0de88ec` (package content tip recorded in PINS/handoff: `686269dd3036ef654948d1812902d1b9a141ee3b`) |
| Package | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F22_PRESERVE_BASELINE_QUAL_GATE_LOCAL_20260919/` |
| Scope | F22 preserve-baseline pre-floor gate + local complete sequence HOLD package (NOT LOCAL CANDIDATE READY) |
| Builder claim | HOLD `F22_LOCAL_CLI_ATOMIC_ROLLBACK_REPAIR_REFUSED` — not reset-only success, not LOCAL CANDIDATE READY |
| Ancestry | OK: b7d16544 → 3fe7314 → 964fe843 → a38db9c → f1d30b28 → 686269dd → 6d6bdd75 |
| Workspace | `[SANITIZED_ABS_PATH]/` (repo@functional tip; package extracted via `git archive` from evidence tip) |
| Astra | Both prior delegations failed at service access; no Astra verdict. QA did not contact Daybreak/Astra. |
| Recommended verdict | **F22 HOLD PACKAGE ACCEPT** |
| Verdict label alone | NOT sufficient — see findings per item below and `qa/findings.json` |

## Commands run (QA)

```bash
# Pins / extract
git checkout -f f1d30b28830db902962467f801932254997e64c3
git archive 6d6bdd7591d738e593bc7290d5f60e4be0de88ec \
  docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F22_PRESERVE_BASELINE_QUAL_GATE_LOCAL_20260919 | tar -x

# QA_EXECUTION — unit/design/harness on functional tip
node --test scripts/test-f3-qualification-reset-design.mjs   # 33 pass / 0 fail
node --test scripts/test-f3-qualification-reset.mjs          # 78 pass / 0 fail (incl. F22 pre-floor cases)
node --test scripts/test-f3-db-push-harness.mjs               # 115 pass / 0 fail

# ARTIFACT_INSPECTION — package integrity / membership / LF
python3 … membership OID-set recompute; evidence-index digest verify; pack-scan cross-check
git cat-file blob a38db9c:<F21 indices/plan> | sha256   # raw-Git LF adjudication
git cat-file blob 6d6bdd75:<package files>               # CR=0 for all 35 files

# Local complete prove re-run
# NOT EXECUTED — no local PostgreSQL in this QA environment (no `ubuntu` user / no :5432).
# Package claims LOCAL_PG_EXECUTED / mustLocal=false at builder time; QA records mustLocal re-prove as unavailable.
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
| Raw-Git LF | `[SANITIZED_ABS_PATH]/qa/logs/08_raw_git_lf.txt` |
| Suite log claims | `[SANITIZED_ABS_PATH]/qa/logs/09_suite_log_claims.txt` |
| Ancestry | `[SANITIZED_ABS_PATH]/qa/logs/10_ancestry.txt` |
| PG probe | `[SANITIZED_ABS_PATH]/qa/logs/11_pg_probe.txt` |
| Pack cross-check | `[SANITIZED_ABS_PATH]/qa/logs/13_pack_index_crosscheck.txt` |
| Package COMPLETE_SEQUENCE | `…/pkg/local-pg-proof/COMPLETE_SEQUENCE.json` |
| Package prove-helper.out | `…/pkg/suite-logs/prove-helper.out` |
| Package MEMBERSHIP.json | `…/pkg/local-pg-proof/MEMBERSHIP.json` |

## Findings per required item

### 1) Operational pre-floor gate — `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1`
**Class:** QA_EXECUTION + ARTIFACT_INSPECTION — **ok**

- Functional-tip `scripts/lib/f3-db-push-pre-stub-floor-clean-check.mjs`: `resolvePreFloorQualificationGate` short-circuits historical `evaluatePreStubFloorCleanCheck` / `CLEAN_BASELINE` unchanged; preserve path via `evaluatePreserveBaselinePreFloorGate` requires fresh inventory/membership auth (policy, target, capture); explicitly sets `trustedPreviousResetRecord: false`, `trustedVerdictStringAlone: false`, `strippedUnexpectedObjects: false`.
- `scripts/qualify-f3-db-push-disposable.mjs` wires `resolvePreFloorQualificationGate` before floor; missing verdict → `F21_PRESERVE_BASELINE_VERDICT_REQUIRED`.
- Unit tests F22-*: historical CLEAN_BASELINE unchanged; preserve residuals authenticate gate without becoming CLEAN_BASELINE; stale previous reset-success cannot authenticate; unsupported leftovers HOLD; shared entrypoint reaches floor only when authenticated. **78/78 + 33/33 + 115/115 pass.**

### 2) Complete local qualification claim
**Class:** ARTIFACT_INSPECTION (primary); QA_EXECUTION of unit tests only — **ok** (re-prove blocked)

From `COMPLETE_SEQUENCE.json` / `RESULTS.json` case `F22_COMPLETE_LOCAL_QUALIFICATION` / `prove-helper.out` / `COMMITTED_HELPER_SUMMARY.json`:
- preFloorVerdict `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1`, floorInstalled true, preDbPushGatesOk true
- CLI **2.117.0** db push of `20260913173000` → `F3_DBPUSH_DISPOSABLE_HISTORY_INJECT` (SQLSTATE **P0001**)
- classification.split `PRE_COMMIT_OR_ATOMIC_ROLLBACK`; objectsPresent false; repairAttempted false; **repairCalls=0**; **completeThrough00123=false**
- remainingHold `F22_LOCAL_CLI_ATOMIC_ROLLBACK_REPAIR_REFUSED`; qualifyStatus HOLD
- Builder `mustLocal=false` / `LOCAL_PG_EXECUTED` at package time; **QA could not re-run** `prove-f3-qualification-reset-local.mjs` (no local PG / no `ubuntu` user / no :5432). Recorded honestly — not credited as QA local re-prove.

### 3) Exact OID-bearing btree_gist membership preservation
**Class:** ARTIFACT_INSPECTION (independent recompute) — **ok**

- `MEMBERSHIP.json`: extension=btree_gist, deptype=e, memberCount **264** at beforeReset / afterReset / afterQualification
- Independent recompute of OID-bearing keys `(classid,objid,objsubid,refclassid,refobjid,deptype,extname,identity)`: **set equality** across all three snapshots (n=264). Package comparison flags confirmed.

### 4) Final committed-byte package integrity
**Class:** ARTIFACT_INSPECTION — **ok**

- on-disk files 35; pack-scan 31 files; evidence-index 33 artifacts (adds pack-scan.json + pack-summary.json); exclusions only self index files
- **unindexed=0**; pack-scan ⊆ index; all 33 artifact sha256+bytes match extracted LF bytes; detached `evidence-index.sha256` matches
- Sanitization spot-check: no credential/pg-url/workspace-abs leaks in RESULTS / prove-helper.out; repo-relative `scripts/` paths, migration version/name `20260913173000` / `f3_bounded_financial_epoch_foundation`, and error codes `P0001` / `F3_*` preserved

### 5) Raw-Git LF adjudication vs CRLF hash drift
**Class:** QA_EXECUTION (`git cat-file blob`) — **ok**

- All 35 F22 package blobs at `6d6bdd75`: **CR=0**; extracted disk == git bytes
- At `a38db9c`, independently matched claimed digests (LF):
  - contractIndex `2cfcc004…` → F21 CONTRACT evidence-index.json
  - localIndex `5e709c37…` → F21 LOCAL evidence-index.json
  - planIndex `b543d248…` → F21 PROPOSED_PLAN evidence-index.json
  - proposedPlanBytes `94256d3d…` → F21 PROPOSED_HOSTED_REQUAL_PLAN.md
- No CRLF-copy failures credited as F12/F19 regressions.

## Material open findings
None that undermine HOLD-package integrity or mis-claim LOCAL CANDIDATE READY.

Non-material limitation: QA environment lacked local PostgreSQL, so complete local prove path was not re-executed (artifact-corroborated only).

## Notes
- Do not treat this as LOCAL CANDIDATE READY or hosted authorization.
- Proposed hosted requal plan remains PROPOSED ONLY — NOT AUTHORIZED.
- Floor verbatim: DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT.
