# Daybreak PASS — STRICT OBJECT-PROBE TYPE CANONICALIZATION hosted requalification

- **Captured:** 9/14/2026, 6:38:29 PM ET
- **Functional SHA:** `7d18aacaa163f9738be16be80489654b048e2150`
- **Hosted verdict:** **PASS**
- **CLI:** 2.117.0 (`<redacted-path>
- **Disposable:** `villageclaq-f3-management-api-disposable-20260913` / `jkorwnwwmdeflfntxntl` / org `eyztkzkprpmlmcabrfef`
- **Production ref forbidden:** `llbnliixczcqfftxpsmb` (never contacted)
- **Tree:** `<redacted-path> (gh tarball extract; tip files not modified)
- **Floor label:** DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT

## Phase 0 — Local gate
- `test:f3-db-push`: 95 tests / 94 pass / **0 fail** / 1 skipped → CONTINUE
- Digests 00118–00123 match frozen; recognition `["manual_income"]`
- Parent compare `780f0922...7d18aac` only 3 authorized files (ahead_by=2)
- FROZEN_EXPECTED_OBJECT_PROBE_DESCRIPTORS use `timestamp with time zone` (no `timestamptz` in identity_arguments)
- Expected fingerprint hashes recomputed=sealed
- Source-contract: structured catalog identity fields; no comma-split identity parser
- Classification-only peer-auth / Cut2 disposable fails on test:f3 / regression / s0-cut2 (not tip regression)
- Sealed before DB: executable-byte-manifest, dependency-closure-manifest
- Evidence: `<redacted-path>

## Phase A — Identity + pre-reset inventory
- Identity match allowlist: ref/name/org **PASS**; not production **PASS**
- ambiguous_objects: **none**
- wipe_candidates attributed to disposable qualification only
- Pre-reset: F3 schemas + history residue present (restart-from-00118 scope)

## Phase B — Reset
- Reset done: **true** (exactly one)
- Post-reset: CLEAN_BASELINE, clean_ok=true, history empty, F3 absent, poison absent
- Project not deleted/paused
- Restart from 00118 — do NOT resume at 00121

## Phase C — Hosted negatives (24 cases; repairCalls=0; staging dbPushCalls=0)
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

- all_staging_dbPushCalls_zero: **True**
- all_repairCalls_zero: **True**

## Phase D — Floor + six migrations
- Floor installed: stub+live-pin; preDbPushGates ok
- Command: `node scripts/qualify-f3-db-push-disposable.mjs --no-wipe --prep-floor --sequence-f3`
- Status: `FILE-BASED RUNNER QUALIFICATION PASS — STUB/LIVE-PIN FLOOR LIMITATION`
- - `00118_f3_bounded_financial_epoch_foundation.sql` (20260913173000): **PASS** fingerprint_exact=True object_probe_present=True repairAttempted=True repair_exit=0 continuation=True failedGates=[]
- `00119_f3_01_core_ledger_foundation.sql` (20260913173001): **PASS** fingerprint_exact=True object_probe_present=True repairAttempted=True repair_exit=0 continuation=True failedGates=[]
- `00120_f3_02_secure_posting_idempotency.sql` (20260913173002): **PASS** fingerprint_exact=True object_probe_present=True repairAttempted=True repair_exit=0 continuation=True failedGates=[]
- `00121_f3_03_projection_read_proof.sql` (20260913173003): **PASS** fingerprint_exact=True object_probe_present=True repairAttempted=True repair_exit=0 continuation=True failedGates=[]
- `00122_f3_04_correction_reversal.sql` (20260913173004): **PASS** fingerprint_exact=True object_probe_present=True repairAttempted=True repair_exit=0 continuation=True failedGates=[]
- `00123_f3_05_opening_cash_command.sql` (20260913173005): **PASS** fingerprint_exact=True object_probe_present=True repairAttempted=True repair_exit=0 continuation=True failedGates=[]

### Expected fingerprint hashes (immutable pre/post)
- `00118_f3_bounded_financial_epoch_foundation.sql`: pre=`0a403e8d3848…` post=`0a403e8d3848…` match=True
- `00119_f3_01_core_ledger_foundation.sql`: pre=`ca6169737186…` post=`ca6169737186…` match=True
- `00120_f3_02_secure_posting_idempotency.sql`: pre=`9c10de93a78f…` post=`9c10de93a78f…` match=True
- `00121_f3_03_projection_read_proof.sql`: pre=`17ebfe3eb6a5…` post=`17ebfe3eb6a5…` match=True
- `00122_f3_04_correction_reversal.sql`: pre=`07675b49e632…` post=`07675b49e632…` match=True
- `00123_f3_05_opening_cash_command.sql`: pre=`5017ff96ad59…` post=`5017ff96ad59…` match=True

## Phase E — Evidence paths
All under `<redacted-path>
- summary.md, executable-byte-manifest.json, dependency-closure-manifest.json
- object-probe-contract.json, expected-descriptor-provenance.json, type-alias-canonicalization.json
- negative-hosted-matrix.json, six-positive-scenarios.json, prefix-staging-manifest.json
- expected-fingerprint-hashes-pre-post.json, cleanup-verification.json
- phase-a-identity.json, phase-a-pre-reset-inventory.json, phase-b-reset.json
- production-history-limitation.json, floor-limitation.json, disposable-final-inventory.json

## Final disposable state
- History: 6 F3 versions 20260913173000–20260913173005
- Schemas: financial_core, financial_private present
- Poison absent: true
- Live 00121 identity_arguments use `timestamp with time zone` (catalog form)

## STOP reason
None — full six-migration QUALIFICATION PASS (stub/live-pin floor limitation; not production PASS).
