# Daybreak HOLD — Independent-fingerprint hosted requalification

- **Captured:** 2026-09-14 11:28:53 ET
- **Functional SHA:** `71d5a14e38d13c0a2993b086a3fc754af2678c86`
- **Hosted verdict:** **HOLD**
- **CLI:** 2.117.0 (`[CLI_BIN]`)
- **Disposable:** `villageclaq-f3-management-api-disposable-20260913` / `jkorwnwwmdeflfntxntl` / org `eyztkzkprpmlmcabrfef`
- **Production ref forbidden:** `llbnliixczcqfftxpsmb` (never contacted)
- **Tree:** `[ISOLATED_TREE] (gh tarball extract; tip files not modified)

## Phase 0 — Local gate
- `test:f3-db-push`: 81 tests / 80 pass / **0 fail** / 1 skipped → CONTINUE
- Digests 00118–00123 match frozen; recognition `["manual_income"]`
- Parent `55886d54...71d5a14e` only 3 authorized files
- Classification-only peer-auth fails on test:f3 / regression / s0-cut2 (not tip regression)
- Evidence: `/workspace/f3-daybreak-hold/evidence/local-suites-71d5a14e.json`

## Phase A — Identity + pre-reset inventory
- Identity match allowlist: ref/name/org **PASS**; not production **PASS**
- ambiguous_objects: **none** (qualification-reset ownership; empty F3 history allowed after prior STOP)
- wipe_candidates: 41
- Pre-reset: stub floor tables present; F3 schemas/history already absent

## Phase B — Reset
- Reset done: **yes**
- Post-reset: CLEAN_BASELINE, pre-stub-floor clean_ok=true, history empty, F3 absent
- Project not deleted/paused

## Phase C — Hosted negatives (7 cases via tip modules)
| Case | Title | repairCalls |
|------|-------|-------------|
| N1 | Malformed/non-JSON object-probe | 0 |
| N2 | Nonzero/query-error object probe | 0 |
| N3 | Exact fingerprint mismatch | 0 |
| N4 | Expected fingerprint absent (expected null) | 0 |
| N5 | Cleanup status 1 | 0 |
| N6 | Cleanup succeeds but poison remains | 0 |
| N7 | Unexpected or multiple staged migrations | 0 |

- all_repairCalls_zero: **True**
- Modules: runRepairSafetyThenMaybeRepair, syncIsolatedMigrationsThrough, evaluateObjectProbe, getFrozenExpectedFingerprint, fingerprintCompleteAndExact

## Phase D — Floor + six migrations
- Floor installed: stub+live-pin (**PASS**); preDbPushGates ok
- expectedFingerprintsBeforeDb recordedBeforeDbAccess=true; hashes match frozen seals
- Command: `node scripts/qualify-f3-db-push-disposable.mjs --no-wipe --prep-floor --sequence-f3`
- **00118 PASS:** objectsPresent=true; fingerprint_exact ok; repair once; retry skip (up to date); continuation=true
- **STOP at 00119** / `20260913173001`
- failedGates: `['target_inject_marker', 'expected_objects', 'security_postconditions', 'fingerprint_exact']`
- Root cause: tip `syncIsolatedMigrationsThrough` stages exactly one file; remote still has 20260913173000 → CLI remote/local mismatch before 00119 apply; repair not spawned
- Per founder rule: **STOP**; tip not patched; no silent rerun

### Per-migration
- `00118_f3_bounded_financial_epoch_foundation.sql` (20260913173000): **PASS** repairAttempted=True continuation=True failedGates=[]
- `00119_f3_01_core_ledger_foundation.sql` (20260913173001): **HOLD** objectsPresent=False repairAttempted=False failedGates=['target_inject_marker', 'expected_objects', 'security_postconditions', 'fingerprint_exact']
- `00120_*`–`00123_*`: **NOT RUN** (stopped earlier)

### Expected hash pre/post (00118)
- before DB: `a1538e7d2d451c198350535128ece77cbe54ad31cd11d6d902f7efc0ece231c5`
- matches frozen sealed: **yes**
- unchanged after compare: **yes** (immutable frozen constant)

## Phase E — Artifacts
- `executable-byte-manifest.json` (entries=23)
- `dependency-closure-manifest.json` (zero_mismatch=True)
- `negative-hosted-matrix.json`
- `six-positive-scenarios.json` (+ raw)
- `expected-fingerprint-hashes-pre-post.json`
- `cleanup-verification.json` (poison_absent=True, f3_absent=True, floor tables preserved)
- `phase-a-identity.json`, `phase-a-pre-reset-inventory.json`
- `phase-b-reset.json`, `phase-b-reset.sql`
- `phase-d-failure-classification.json`
- `summary.md` (this file)

## STOP reason
Hosted qualification **HOLD** at **00119**: independent frozen expected fingerprints succeed on **00118** (repair+retry+continuation), but exact-one isolated staging leaves prior applied version absent locally, so CLI 2.117.0 blocks subsequent pushes. Tip not modified.
