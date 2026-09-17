# Daybreak HOLD — PREFIX-COMPLETE SINGLE-PENDING hosted requalification

- **Captured:** 2026-09-14 11:57:58 ET
- **Functional SHA:** `104a5b514c35b5a3bee6526578f7bccc3575dfb3`
- **Hosted verdict:** **HOLD**
- **CLI:** 2.117.0 (`[CLI_BIN]`)
- **Disposable:** `villageclaq-f3-management-api-disposable-20260913` / `jkorwnwwmdeflfntxntl` / org `eyztkzkprpmlmcabrfef`
- **Production ref forbidden:** `llbnliixczcqfftxpsmb` (never contacted)
- **Tree:** `[ISOLATED_TREE] (gh tarball extract; tip files not modified)

## Phase 0 — Local gate
- `test:f3-db-push`: 86 tests / 85 pass / **0 fail** / 1 skipped → CONTINUE
- Digests 00118–00123 match frozen; recognition `["manual_income"]`
- Parent `934b94d9...104a5b51` only 3 authorized files
- Classification-only peer-auth fails on test:f3 / regression / s0-cut2 (not tip regression)
- Evidence: `/workspace/f3-daybreak-hold/evidence/local-suites-104a5b51.json`

## Phase A — Identity + pre-reset inventory
- Identity match allowlist: ref/name/org **PASS**; not production **PASS**
- ambiguous_objects: **none**
- wipe_candidates: 41
- Pre-reset: stub floor tables present; F3 schemas/history already absent

## Phase B — Reset
- Reset done: **True**
- Post-reset: CLEAN_BASELINE, pre-stub-floor clean_ok=True, history empty, F3 absent, poison absent
- Project not deleted/paused

## Phase C — Hosted negatives (10 cases via tip modules)
| ID | Title | dbPushCalls | repairCalls | code/gates |
|----|-------|-------------|-------------|------------|
| N1 | Missing applied-prefix file | 0 | 0 | applied_remote_missing_locally |
| N2 | Altered applied-prefix digest | 0 | 0 | applied_local_digest |
| N3 | Multiple pending migrations | 0 | 0 | later_migration_staged |
| N4 | Later migration staged | 0 | 0 | later_migration_staged |
| N5 | Remote/local prefix mismatch | 0 | 0 | remote_unexpected_name |
| N6 | Malformed/nonzero history response | 0 | 0 | history_nonzero |
| N7 | Malformed object probe | 0 | 0 | expected_objects,security_postconditions |
| N8 | Fingerprint mismatch | 0 | 0 | fingerprint_exact |
| N9 | Cleanup failure | 0 | 0 | cleanup/poison hold |
| N10 | Poison-remains verification failure | 0 | 0 | cleanup/poison hold |

- all_staging_dbPushCalls_zero: **True**
- all_repairCalls_zero: **True**
- Modules: assertPrefixCompleteSinglePendingStaging, syncIsolatedMigrationsThrough, runPrefixCompleteSinglePendingOrchestration, runRepairSafetyThenMaybeRepair, evaluateObjectProbe, getFrozenExpectedFingerprint

## Phase D — Floor + six migrations
- Floor installed: stub+live-pin; preDbPushGates ok
- expectedFingerprintsBeforeDb recordedBeforeDbAccess=true; hashes match frozen seals; unchanged post-compare
- Command: `node scripts/qualify-f3-db-push-disposable.mjs --no-wipe --prep-floor --sequence-f3`
- **00118 PASS:** prefix-complete staging; inject fail; repair once; retry pending empty; continuation=true
- **STOP at 00119** / `20260913173001`
- Prefix-complete staging for 00119 **ok** (staged 118+119; pending=[119]) — prior Daybreak staging HOLD is cleared
- failedGates: `['fingerprint_exact']`
- Root cause: frozen expected `function_owner` order ≠ live catalog-observed order (same members)
- Per founder rule: **STOP**; tip not patched; no silent rerun

### Per-migration
- `00118_f3_bounded_financial_epoch_foundation.sql` (20260913173000): **PASS** prefix_pending=['20260913173000'] staged_count=1 fingerprint_exact=True repairAttempted=True continuation=True failedGates=[]
- `00119_f3_01_core_ledger_foundation.sql` (20260913173001): **HOLD** prefix_pending=['20260913173001'] staged_count=2 fingerprint_exact=False repairAttempted=False continuation=False failedGates=['fingerprint_exact']
- `00120_*`–`00123_*`: **NOT RUN** (stopped earlier)

### Expected hash pre/post
- unchanged after compare: **True**
- matches frozen sealed: **True**

## Phase E — Artifacts
- `executable-byte-manifest.json` (entries=22)
- `dependency-closure-manifest.json` (zero_mismatch=True)
- `negative-hosted-matrix.json`
- `six-positive-scenarios.json` (+ raw)
- `prefix-staging-manifest.json`
- `expected-fingerprint-hashes-pre-post.json`
- `cleanup-verification.json` (poison_absent=True, f3_absent=True, floor tables preserved)
- `phase-a-identity.json`, `phase-a-pre-reset-inventory.json`
- `phase-b-reset.json`, `phase-b-reset.sql`
- `phase-d-failure-classification.json`
- `production-history-limitation.json`
- `summary.md` (this file)

## STOP reason
Hosted qualification **HOLD** at **00119**: PREFIX-COMPLETE SINGLE-PENDING staging succeeds through 00119, and 00118 repair+retry+continuation pass, but repair-safety `fingerprint_exact` fails because frozen expected `function_owner` canonical string order differs from live observed catalog order. Tip not modified.
