# Daybreak PASS — FULL FINGERPRINT COLLECTOR hosted requalification

- **Captured:** 9/14/2026, 6:01:42 PM ET
- **Functional SHA:** `c59afad411a07838688aeb5583ab179683f25a7f`
- **Hosted verdict:** **PASS**
- **CLI:** 2.117.0 (`<redacted-path>
- **Disposable:** `villageclaq-f3-management-api-disposable-20260913` / `jkorwnwwmdeflfntxntl` / org `eyztkzkprpmlmcabrfef`
- **Production ref forbidden:** `llbnliixczcqfftxpsmb` (never contacted)
- **Tree:** `<redacted-path> (gh tarball extract; tip files not modified)
- **Floor label:** DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT

## Phase 0 — Local gate
- `test:f3-db-push`: 106 pass / **0 fail** / 1 skipped → CONTINUE
- Digests 00118–00123 match frozen; recognition `["manual_income"]`
- Parent compare only authorized tip files (repair-safety-gate / qualify / harness)
- `collectCanonicalFullFingerprint` required on qualify path; full phase captures sealed
- Evidence: `<redacted-path>

## Phase A — Identity + pre-reset inventory
- Identity match allowlist: ref/name/org **PASS**; not production **PASS**
- ambiguous_objects: **none**
- Pre-reset: F3 schemas + six history rows present (restart-from-00118 scope)

## Phase B — Qualification reset (founder-authorized; NOT wipe-to-baseline)
- Reset done: **True** (exactly one)
- Post-reset: CLEAN_BASELINE, clean_ok=True, history empty, F3 absent, poison absent
- Project not deleted/paused
- assertWipeDoesNotTouchProduction **not** used (baseline wipe guard forbids DROP SCHEMA; qualification reset authorizes financial_core/financial_private only)

## Phase C — Hosted negatives (N1–N24 + FC1–FC4; repairCalls=0; staging dbPushCalls=0)
| ID | Title | dbPushCalls | repairCalls | result |
|----|-------|-------------|-------------|--------|
| N1 | Multi-argument ACL identity remains complete | 0 | 0 | accepted |
| N2 | Overloads remain distinct | 0 | 0 | accepted |
| N3 | Record-order-only ACL difference accepted | 0 | 0 | accepted |
| N4 | Truncated identity rejected | 0 | 0 | rejected |
| N5 | Same ACL count different object pairing rejected | 0 | 0 | rejected |
| N6 | Wrong grantee/grantor/privilege/grantability rejected | 0 | 0 | rejected |
| N7 | Missing/extra/duplicate ACL rejected | 0 | 0 | rejected |
| N8 | Malformed/nonzero probe rejected | 0 | 0 | rejected |
| N9 | Fingerprint mismatch rejected | 0 | 0 | rejected |
| N10 | Cleanup failure rejected | 0 | 0 | rejected |
| N11 | Poison remains rejected | 0 | 0 | rejected |
| N12 | Staging-prefix mismatch rejected | 0 | 0 | rejected |
| N13 | timestamptz lookup resolves to frozen canonical timestamp with time zone identity | 0 | 0 | accepted |
| N14 | Multi-arg retained; overloads remain distinct | 0 | 0 | accepted |
| N15 | Argument order changes rejected | 0 | 0 | rejected |
| N16 | Missing argument rejected | 0 | 0 | rejected |
| N17 | Extra argument rejected | 0 | 0 | rejected |
| N18 | Similar-type (timestamp vs timestamptz) rejected | 0 | 0 | rejected |
| N19 | lookup alias timestamptz in identity_arguments rejected | 0 | 0 | rejected |
| N20 | Unresolved signature rejected | 0 | 0 | rejected |
| N21 | Malformed non-JSON probe rejected | 0 | 0 | rejected |
| N22 | Truncated identity rejected (object-probe) | 0 | 0 | rejected |
| N23 | Same object count different identity pairing rejected | 0 | 0 | rejected |
| N24 | Duplicate structured records rejected | 0 | 0 | rejected |
| FC1 | Partial inventory cannot substitute for post-repair fingerprint | 0 | 0 | rejected |
| FC2 | Missing required fingerprint key HOLD | 0 | 0 | rejected |
| FC3 | Metadata-merge (pre-repair meta onto inventory) prohibited | 0 | 0 | rejected |
| FC4 | Partial inventory cannot substitute for post-retry fingerprint | 0 | 0 | rejected |

- all_repairCalls_zero: **True**
- all_staging_dbPushCalls_zero: **True**
- fingerprint_capture_rejected: ['FC1', 'FC2', 'FC3', 'FC4']

## Phase D — Floor + six migrations
- Floor installed: stub+live-pin; preDbPushGates ok
- Command: `node scripts/qualify-f3-db-push-disposable.mjs --no-wipe --prep-floor --sequence-f3`
- Status: `FILE-BASED RUNNER QUALIFICATION PASS — STUB/LIVE-PIN FLOOR LIMITATION`
- `00118_f3_bounded_financial_epoch_foundation.sql` (20260913173000): **PASS** fingerprint_exact=True repairAttempted=True repair_exit=0 continuation=True failedGates=[]
  - fingerprintExpectedFrozen: sha256=`0a403e8d3848e07769fcb453b78deebb1ad29217f4ed1d9c684dc64ca1b27a02` ok
  - fingerprintAfterCommitFailedHistory: sha256=`0a403e8d3848e07769fcb453b78deebb1ad29217f4ed1d9c684dc64ca1b27a02` ok
  - fingerprintAfterPoisonCleanup: sha256=`0a403e8d3848e07769fcb453b78deebb1ad29217f4ed1d9c684dc64ca1b27a02` ok
  - fingerprintAfterRepair: sha256=`0a403e8d3848e07769fcb453b78deebb1ad29217f4ed1d9c684dc64ca1b27a02` ok
  - fingerprintAfterRetryNoPending: sha256=`0a403e8d3848e07769fcb453b78deebb1ad29217f4ed1d9c684dc64ca1b27a02` ok
  - fingerprintAfterCleanContinuation: sha256=`0a403e8d3848e07769fcb453b78deebb1ad29217f4ed1d9c684dc64ca1b27a02` ok
- `00119_f3_01_core_ledger_foundation.sql` (20260913173001): **PASS** fingerprint_exact=True repairAttempted=True repair_exit=0 continuation=True failedGates=[]
  - fingerprintExpectedFrozen: sha256=`ca61697371861b6a8b59b6be2505bacdc1491446410941ca4f4e3f89a5b1bbdf` ok
  - fingerprintAfterCommitFailedHistory: sha256=`ca61697371861b6a8b59b6be2505bacdc1491446410941ca4f4e3f89a5b1bbdf` ok
  - fingerprintAfterPoisonCleanup: sha256=`ca61697371861b6a8b59b6be2505bacdc1491446410941ca4f4e3f89a5b1bbdf` ok
  - fingerprintAfterRepair: sha256=`ca61697371861b6a8b59b6be2505bacdc1491446410941ca4f4e3f89a5b1bbdf` ok
  - fingerprintAfterRetryNoPending: sha256=`ca61697371861b6a8b59b6be2505bacdc1491446410941ca4f4e3f89a5b1bbdf` ok
  - fingerprintAfterCleanContinuation: sha256=`ca61697371861b6a8b59b6be2505bacdc1491446410941ca4f4e3f89a5b1bbdf` ok
- `00120_f3_02_secure_posting_idempotency.sql` (20260913173002): **PASS** fingerprint_exact=True repairAttempted=True repair_exit=0 continuation=True failedGates=[]
  - fingerprintExpectedFrozen: sha256=`9c10de93a78f837d84d9b9232c94e0bdb731c9e748763ca53f80349ad0b37161` ok
  - fingerprintAfterCommitFailedHistory: sha256=`9c10de93a78f837d84d9b9232c94e0bdb731c9e748763ca53f80349ad0b37161` ok
  - fingerprintAfterPoisonCleanup: sha256=`9c10de93a78f837d84d9b9232c94e0bdb731c9e748763ca53f80349ad0b37161` ok
  - fingerprintAfterRepair: sha256=`9c10de93a78f837d84d9b9232c94e0bdb731c9e748763ca53f80349ad0b37161` ok
  - fingerprintAfterRetryNoPending: sha256=`9c10de93a78f837d84d9b9232c94e0bdb731c9e748763ca53f80349ad0b37161` ok
  - fingerprintAfterCleanContinuation: sha256=`9c10de93a78f837d84d9b9232c94e0bdb731c9e748763ca53f80349ad0b37161` ok
- `00121_f3_03_projection_read_proof.sql` (20260913173003): **PASS** fingerprint_exact=True repairAttempted=True repair_exit=0 continuation=True failedGates=[]
  - fingerprintExpectedFrozen: sha256=`17ebfe3eb6a503056940b58965a86f88b2cad91bea4720c12ac4b9797e7f25af` ok
  - fingerprintAfterCommitFailedHistory: sha256=`17ebfe3eb6a503056940b58965a86f88b2cad91bea4720c12ac4b9797e7f25af` ok
  - fingerprintAfterPoisonCleanup: sha256=`17ebfe3eb6a503056940b58965a86f88b2cad91bea4720c12ac4b9797e7f25af` ok
  - fingerprintAfterRepair: sha256=`17ebfe3eb6a503056940b58965a86f88b2cad91bea4720c12ac4b9797e7f25af` ok
  - fingerprintAfterRetryNoPending: sha256=`17ebfe3eb6a503056940b58965a86f88b2cad91bea4720c12ac4b9797e7f25af` ok
  - fingerprintAfterCleanContinuation: sha256=`17ebfe3eb6a503056940b58965a86f88b2cad91bea4720c12ac4b9797e7f25af` ok
- `00122_f3_04_correction_reversal.sql` (20260913173004): **PASS** fingerprint_exact=True repairAttempted=True repair_exit=0 continuation=True failedGates=[]
  - fingerprintExpectedFrozen: sha256=`07675b49e6321dff9bebfcd5c245e8fb56a97937b823d896032b008427439f16` ok
  - fingerprintAfterCommitFailedHistory: sha256=`07675b49e6321dff9bebfcd5c245e8fb56a97937b823d896032b008427439f16` ok
  - fingerprintAfterPoisonCleanup: sha256=`07675b49e6321dff9bebfcd5c245e8fb56a97937b823d896032b008427439f16` ok
  - fingerprintAfterRepair: sha256=`07675b49e6321dff9bebfcd5c245e8fb56a97937b823d896032b008427439f16` ok
  - fingerprintAfterRetryNoPending: sha256=`07675b49e6321dff9bebfcd5c245e8fb56a97937b823d896032b008427439f16` ok
  - fingerprintAfterCleanContinuation: sha256=`07675b49e6321dff9bebfcd5c245e8fb56a97937b823d896032b008427439f16` ok
- `00123_f3_05_opening_cash_command.sql` (20260913173005): **PASS** fingerprint_exact=True repairAttempted=True repair_exit=0 continuation=True failedGates=[]
  - fingerprintExpectedFrozen: sha256=`5017ff96ad59c6ca42c93719dfc92f3137ccb591f00bf1acf6bfbefcdf7ba965` ok
  - fingerprintAfterCommitFailedHistory: sha256=`5017ff96ad59c6ca42c93719dfc92f3137ccb591f00bf1acf6bfbefcdf7ba965` ok
  - fingerprintAfterPoisonCleanup: sha256=`5017ff96ad59c6ca42c93719dfc92f3137ccb591f00bf1acf6bfbefcdf7ba965` ok
  - fingerprintAfterRepair: sha256=`5017ff96ad59c6ca42c93719dfc92f3137ccb591f00bf1acf6bfbefcdf7ba965` ok
  - fingerprintAfterRetryNoPending: sha256=`5017ff96ad59c6ca42c93719dfc92f3137ccb591f00bf1acf6bfbefcdf7ba965` ok
  - fingerprintAfterCleanContinuation: omitted (final migration; not distinct)

### Expected fingerprint hashes (immutable pre/post)
- `00118_f3_bounded_financial_epoch_foundation.sql`: pre=`0a403e8d3848e07769fcb453b78deebb1ad29217f4ed1d9c684dc64ca1b27a02` post=`0a403e8d3848e07769fcb453b78deebb1ad29217f4ed1d9c684dc64ca1b27a02` match=True
- `00119_f3_01_core_ledger_foundation.sql`: pre=`ca61697371861b6a8b59b6be2505bacdc1491446410941ca4f4e3f89a5b1bbdf` post=`ca61697371861b6a8b59b6be2505bacdc1491446410941ca4f4e3f89a5b1bbdf` match=True
- `00120_f3_02_secure_posting_idempotency.sql`: pre=`9c10de93a78f837d84d9b9232c94e0bdb731c9e748763ca53f80349ad0b37161` post=`9c10de93a78f837d84d9b9232c94e0bdb731c9e748763ca53f80349ad0b37161` match=True
- `00121_f3_03_projection_read_proof.sql`: pre=`17ebfe3eb6a503056940b58965a86f88b2cad91bea4720c12ac4b9797e7f25af` post=`17ebfe3eb6a503056940b58965a86f88b2cad91bea4720c12ac4b9797e7f25af` match=True
- `00122_f3_04_correction_reversal.sql`: pre=`07675b49e6321dff9bebfcd5c245e8fb56a97937b823d896032b008427439f16` post=`07675b49e6321dff9bebfcd5c245e8fb56a97937b823d896032b008427439f16` match=True
- `00123_f3_05_opening_cash_command.sql`: pre=`5017ff96ad59c6ca42c93719dfc92f3137ccb591f00bf1acf6bfbefcdf7ba965` post=`5017ff96ad59c6ca42c93719dfc92f3137ccb591f00bf1acf6bfbefcdf7ba965` match=True

## Phase E — Evidence paths
All under `<redacted-path>
- summary.md, executable-byte-manifest.json, dependency-closure-manifest.json
- negative-hosted-matrix.json, six-positive-scenarios.json (+ raw), prefix-staging-manifest.json
- expected-fingerprint-hashes-pre-post.json, cleanup-verification.json, sanitization-manifest.json
- phase-a-identity.json, phase-a-pre-reset-inventory.json, phase-b-reset.json/.sql
- production-history-limitation.json, floor-limitation.json, disposable-final-inventory.json
- Full phase fingerprints retained (not redacted_summary)

## Final disposable state
- History: 6 F3 versions 20260913173000–20260913173005
- Schemas: financial_core, financial_private present
- Poison absent: true

## STOP reason
None — full six-migration QUALIFICATION PASS (stub/live-pin floor limitation; not production PASS).
