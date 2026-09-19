# EXPANDED CATALOG FINGERPRINT hosted requalification — **HOLD**

- **Captured:** 9/14/2026, 9:23:16 PM ET
- **Functional SHA:** `ebd4c20bcf72500b77ea24bd7269094f3dc13b3e`
- **Hosted verdict:** **HOLD**
- **CLI:** 2.117.0 (`<redacted-path>
- **Disposable:** `villageclaq-f3-management-api-disposable-20260913` / `jkorwnwwmdeflfntxntl` / org `eyztkzkprpmlmcabrfef`
- **Production ref forbidden:** `llbnliixczcqfftxpsmb` (never contacted)
- **Tree:** `<redacted-path> (gh tarball extract; tip files not modified)
- **Floor label:** DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT
- **Schema version:** `f3-full-catalog-v1`
- **Recognition:** `["manual_income"]`

## Pre-hosted gate
- Recursive runtime closure: missing=0 unresolved=0 unexplained_exclusions=0 uncommitted_diffs=0 → closure_complete=True
- `npm run test:f3-db-push`: 109 pass / **0 fail** / 1 skipped → CONTINUE
- Digests 00118–00123 match frozen; module-load sealed hashes pass
- Parent compare `9c60e415...ebd4c20` only 3 authorized files
- Suite logs: `suite-logs-ebd4c20/` with sanitized meta (sha256 of sanitized .out); exact_error policy real PG text
- Evidence-pipeline fixtures exercised in harness (0 fail)

## New sealed expected hashes (before DB)
- `00118_f3_bounded_financial_epoch_foundation.sql`: `ee5ece5603bee8e3afcb20888b87cd3e3bb9e334c7f56df0235181b49c91a309`
- `00119_f3_01_core_ledger_foundation.sql`: `7ec7ba2f5e05f244939cc123266fda1efb330eb68ca389fc571f1b4df93aa419`
- `00120_f3_02_secure_posting_idempotency.sql`: `6ee99d881bcf972f86a4a5e9c8932d491fc6b6e02daf34c99947fe1dca8b9e41`
- `00121_f3_03_projection_read_proof.sql`: `22ec40e5979ae30947e139c77983ba793b914d5f5df9a2009234b0caf1172599`
- `00122_f3_04_correction_reversal.sql`: `f66af826fb10ad4d5e2c3a8d3c6ba282d8e29fdd316fee6b6d4e9434faa62e92`
- `00123_f3_05_opening_cash_command.sql`: `96696f7105843e1288e71d218d55607da47ec240516aa32f9d5b725bca665d3f`

## Phase A — Identity + pre-reset inventory
- Identity match allowlist: ref/name/org **PASS**; not production **PASS**
- Pre-reset: F3 schemas + floor residue + six history rows present (restart-from-00118)
- Post-reset ambiguous_objects: **none**

## Phase B — Qualification reset (founder-authorized; NOT wipe-to-baseline)
- Reset done: **True** (exactly one)
- Post-reset: CLEAN_BASELINE, clean_ok=True, history empty, F3 absent, poison absent
- assertWipeDoesNotTouchProduction **not** used

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

- all_repairCalls_zero: **None**
- all_staging_dbPushCalls_zero: **None**
- fingerprint_capture_rejected: None

## Phase D — Floor + six migrations — **HOLD at 00118**
- Floor installed: stub+live-pin; preDbPushGates recorded
- Command: `node scripts/qualify-f3-db-push-disposable.mjs --no-wipe --prep-floor --sequence-f3`
- Status: `HOLD` / limitation: `HOLD: repair-safety gate failed; poison cleaned; repair not spawned; no continuation`
- `00118_f3_bounded_financial_epoch_foundation.sql`: **HOLD** fingerprint_exact=false repairAttempted=False failedGates=['fingerprint_exact']
  - frozen expected: sha256=`ee5ece5603bee8e3afcb20888b87cd3e3bb9e334c7f56df0235181b49c91a309` ok
  - post-commit/pre-repair: sha256=`72af66999f3a53a870cd1a5d0ed99a2acb7f510c69bfe16204b9fe0f217f757f` ok
  - post-poison-cleanup: sha256=`72af66999f3a53a870cd1a5d0ed99a2acb7f510c69bfe16204b9fe0f217f757f` ok
  - post-repair: **missing** (STOP)
  - post-retry: **missing** (STOP)
  - post-continuation: **missing** (STOP)
- Drift changedKeys: `['columns', 'constraints', 'indexes', 'routines', 'schemas', 'triggers', 'types']`
- Sealed vs live: `ee5ece5603bee8e3afcb20888b87cd3e3bb9e334c7f56df0235181b49c91a309` ≠ `72af66999f3a53a870cd1a5d0ed99a2acb7f510c69bfe16204b9fe0f217f757f`
- No silent rerun. Migrations 00119–00123 **not executed**.

### Observed canonicalization mismatches (live PG vs offline expected builder)
- columns: collation null vs `"default"`; default literal quoting
- constraints: pg_get_constraintdef formatting / EXCLUDE USING gist rendering
- indexes: exclusion-index presence + `USING btree` explicit form
- schemas: owner ACL empty vs postgres CREATE/USAGE
- routines: `CREATE FUNCTION` vs `CREATE OR REPLACE FUNCTION`; search_path rendering
- triggers: function_identity / timing_events shape
- types: live includes table composite row types; expected empty

## Phase E — Evidence paths
All under `<redacted-path>
- summary.md, executable-byte-manifest.json, dependency-closure-manifest.json, dependency-exclusion-manifest.json
- negative-hosted-matrix.json, six-positive-scenarios.json (+ raw retained), prefix-staging-manifest.json
- expected-fingerprint-hashes-pre-post.json, expected-fingerprint-hashes-recomputed.json
- schema-definition-f3-full-catalog-v1.json, expected-descriptor-provenance.json
- cleanup-verification.json, sanitization-manifest.json
- phase-a-identity.json, phase-a-pre-reset-inventory.json, phase-b-reset.json/.sql
- production-history-limitation.json, floor-limitation.json, disposable-final-inventory.json
- suite-logs-ebd4c20/ + test-f3-failure-classification-ebd4c20.json
- evidence-index.json **without self-entry** + detached evidence-index.sha256 (39 artifacts)
- Full phase fingerprints retained (not redacted_summary)

## Final disposable state
- History rows: 0
- financial_core=False financial_private=True
- Poison absent: **True** (Phase D poisonCleanupOnly=true; final recheck)
- Project left in place (not deleted/paused)

## STOP reason
HOLD — expanded `f3-full-catalog-v1` sealed expected fingerprint for 00118 does not equal live post-commit observed catalog (fingerprint_exact). Repair not spawned; no continuation; no silent rerun.
