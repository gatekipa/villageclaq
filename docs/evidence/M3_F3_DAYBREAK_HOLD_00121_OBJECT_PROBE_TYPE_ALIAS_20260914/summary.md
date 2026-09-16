# Daybreak HOLD — STRUCTURED ACL OBJECT IDENTITY hosted requalification

- **Captured:** 9/14/2026, 12:58:27 PM ET
- **Functional SHA:** `1ff551ec2b885d21c6afa009dd530b5c1b6b4315`
- **Hosted verdict:** **HOLD**
- **CLI:** 2.117.0 (`<redacted-path>
- **Disposable:** `villageclaq-f3-management-api-disposable-20260913` / `jkorwnwwmdeflfntxntl` / org `eyztkzkprpmlmcabrfef`
- **Production ref forbidden:** `llbnliixczcqfftxpsmb` (never contacted)
- **Tree:** `<redacted-path> (gh tarball extract; tip files not modified)

## Phase 0 — Local gate
- `test:f3-db-push`: 90 tests / 89 pass / **0 fail** / 1 skipped → CONTINUE
- Digests 00118–00123 match frozen; recognition `["manual_income"]`
- Parent `f9689b76...1ff551ec` only 3 authorized files
- New expected fingerprint hashes match `FROZEN_EXPECTED_FINGERPRINT_SHA256` (recomputed=sealed)
- Source-contract: no comma-split identity parser; identity via schema/object_name/prokind/identity_arguments
- Classification-only peer-auth / Cut2 disposable fails on test:f3 / regression / s0-cut2 (not tip regression)
- Evidence: `<redacted-path>

## Phase A — Identity + pre-reset inventory
- Identity match allowlist: ref/name/org **PASS**; not production **PASS**
- ambiguous_objects: **none**
- wipe_candidates attributed to disposable qualification
- Pre-reset: F3 schemas + history residue present (restart-from-00118 scope)

## Phase B — Reset
- Reset done: **true** (financial_core/financial_private DROP SCHEMA authorized for qualification reset only)
- Post-reset: CLEAN_BASELINE, clean_ok=true, history empty, F3 absent, poison absent
- Project not deleted/paused
- Restart from 00118 (includes repaired 00118 + 00119 residue scope)

## Phase C — Hosted negatives (12 cases via tip modules)
| ID | Title | dbPushCalls | repairCalls | result |
|----|-------|-------------|-------------|--------|
| N1 | Multi-argument ACL identity remains complete | 0 | 0 | accepted fingerprint_exact=true |
| N2 | Overloads remain distinct | 0 | 0 | accepted order-only; merge rejects without repair |
| N3 | Record-order-only ACL difference accepted | 0 | 0 | accepted fingerprint_exact=true |
| N4 | Truncated identity rejected | 0 | 0 | rejected fingerprint_exact |
| N5 | Same ACL count different object pairing rejected | 0 | 0 | rejected |
| N6 | Wrong grantee/grantor/privilege/grantability rejected | 0 | 0 | rejected |
| N7 | Missing/extra/duplicate ACL rejected | 0 | 0 | rejected |
| N8 | Malformed/nonzero probe rejected | 0 | 0 | rejected expected_objects/security_postconditions |
| N9 | Fingerprint mismatch rejected | 0 | 0 | rejected |
| N10 | Cleanup failure rejected | 0 | 0 | rejected |
| N11 | Poison remains rejected | 0 | 0 | rejected |
| N12 | Staging-prefix mismatch rejected | 0 | 0 | rejected applied_remote_missing_locally |

- all_staging_dbPushCalls_zero: **True**
- all_repairCalls_zero: **True**

## Phase D — Floor + six migrations
- Floor installed: stub+live-pin; preDbPushGates ok
- expectedFingerprintsBeforeDb recordedBeforeDbAccess=true; hashes match **new** frozen seals
- Command: `node scripts/qualify-f3-db-push-disposable.mjs --no-wipe --prep-floor --sequence-f3`
- **00118 PASS:** prefix-complete; inject fail; repair once; retry pending empty; continuation=true; fingerprint_exact=true
- **00119 PASS:** same; **multi-arg `lock_financial_occurrence` identity_arguments complete (no comma truncation)**; fingerprint_exact=true
- **00120 PASS:** same; fingerprint_exact=true
- **STOP at 00121** / `20260913173003`
- Prefix-complete staging for 00121 **ok** (staged 118–121; pending=[121])
- failedGates: `['expected_objects', 'security_postconditions']`
- **fingerprint_exact=true** on 00121 (ACL structured identity OK)
- Root cause: object probe `to_regprocedure::text` returns `timestamp with time zone` while `TARGET_OBJECT_PROBES` allows only `timestamptz` alias → `p0 is not an exact structured identity` despite routines existing
- Per founder rule: **STOP**; tip not patched; no silent rerun

### Per-migration
- `00118_f3_bounded_financial_epoch_foundation.sql` (20260913173000): PASS prefix_pending=['20260913173000'] staged_count=1 fingerprint_exact=True repairAttempted=True continuation=True failedGates=[]
- `00119_f3_01_core_ledger_foundation.sql` (20260913173001): PASS prefix_pending=['20260913173001'] staged_count=2 fingerprint_exact=True repairAttempted=True continuation=True failedGates=[]
- `00120_f3_02_secure_posting_idempotency.sql` (20260913173002): PASS prefix_pending=['20260913173002'] staged_count=3 fingerprint_exact=True repairAttempted=True continuation=True failedGates=[]
- `00121_f3_03_projection_read_proof.sql` (20260913173003): HOLD prefix_pending=['20260913173003'] staged_count=4 fingerprint_exact=True repairAttempted=False continuation=False failedGates=['expected_objects', 'security_postconditions']
- `00122_*`–`00123_*`: **NOT RUN** (stopped earlier)

### Expected hash pre/post (superseded → new)
- unchanged after compare: **true**
- matches frozen sealed (new): **true**
- 00118: `07ce0b41…` + `a1538e7d…` → `0a403e8d…`
- 00119: `e8005d05…` + `422c5d8b…` → `ca616973…`
- 00120–00123: new seals `9c10de93…` / `17ebfe3e…` / `07675b49…` / `5017ff96…`

## Phase E — Artifacts
- `executable-byte-manifest.json`
- `dependency-closure-manifest.json`
- `structured-acl-query-schema.json`
- `multi-arg-overload-identity-proof.json`
- `negative-hosted-matrix.json`
- `six-positive-scenarios.json` (+ raw)
- `prefix-staging-manifest.json`
- `expected-fingerprint-hashes-pre-post.json`
- `canonicalization-field-registry.json`
- `cleanup-verification.json`
- `phase-a-identity.json`, `phase-a-pre-reset-inventory.json`
- `phase-b-reset.json`, `phase-b-reset.sql`
- `phase-d-failure-classification.json`
- `production-history-limitation.json`, `floor-limitation.json`
- `summary.md` (this file)

## Proof no truncation
- Hosted 00119 observed ACL `lock_financial_occurrence.identity_arguments` = full 5-arg string (4 commas)
- Phase C N1/N4 prove complete identity accepted and truncated identity rejected
- fingerprint_exact true for 00118–00121

## STOP reason
HOLD at 00121: object-probe identity alias mismatch (`timestamptz` vs `timestamp with time zone`), not ACL truncation. Structured ACL object identity requalification advanced past prior 00119 truncation HOLD; remaining defect is probe allowlist aliasing.
