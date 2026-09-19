# Daybreak HOLD — Hosted requalification evidence

- **Captured:** 2026-09-14 00:30:22 ET
- **Functional SHA:** `b45042d8c9927a72fa1fddf9e6be27b96ee56919`
- **Hosted verdict:** **HOLD**
- **CLI:** 2.117.0 (`/workspace/f3-dbpush-qual/bin/supabase`)
- **Disposable:** `villageclaq-f3-management-api-disposable-20260913` / `jkorwnwwmdeflfntxntl` / org `eyztkzkprpmlmcabrfef`
- **Production ref forbidden:** `llbnliixczcqfftxpsmb` (never contacted)
- **Tree:** `[ISOLATED_TREE] (gh tarball extract; tip files not modified)

## Phase A — Identity + pre-reset inventory
- Identity match allowlist: ref/name/org **PASS**; not production **PASS**
- ambiguous_objects: **none** (qualification-reset ownership)
- wipe_candidates: 67 (all disposable-qualification-owned)
- Pre-reset: 6 F3 history rows + financial_core/financial_private + stub floor tables present

## Phase B — Reset
- Reset done: **yes**
- Post-reset: CLEAN_BASELINE, pre-stub-floor clean_ok=true, history empty
- Project not deleted/paused

## Phase C — Hosted negatives
All six cases exercised tip `runRepairSafetyThenMaybeRepair` / `syncIsolatedMigrationsThrough` / `evaluateObjectProbe`.

| Case | Title | repairCalls |
|------|-------|-------------|
| N1 | Malformed/non-JSON object-probe | 0 |
| N2 | Nonzero/query-error object probe | 0 |
| N3 | Exact fingerprint mismatch | 0 |
| N4 | Cleanup status 1 | 0 |
| N5 | Cleanup succeeds but poison remains | 0 |
| N6 | Unexpected or multiple staged migrations | 0 |

- all_repairCalls_zero: **True**
- final poison absent: **True**

## Phase D — Floor + six migrations
- Floor installed: stub+live-pin (**PASS**); preDbPushGates ok
- Command: `node scripts/qualify-f3-db-push-disposable.mjs --no-wipe --prep-floor --sequence-f3`
- STOP at **00118** / `20260913173000`
- failedGates: `['fingerprint_exact']`
- Root cause: tip qualify wires `fingerprint.expected = null`; gate requires expected object → `fingerprint_exact` fails; repair not spawned
- Per founder rule: **STOP**; no repair on partial evidence; tip tree not patched

### Per-migration
- `00118_f3_bounded_financial_epoch_foundation.sql` (20260913173000): **HOLD** objectsPresent=True repairAttempted=False failedGates=['fingerprint_exact']
- `00119_*`: **NOT RUN** (stopped earlier)
- `00120_*`: **NOT RUN** (stopped earlier)
- `00121_*`: **NOT RUN** (stopped earlier)
- `00122_*`: **NOT RUN** (stopped earlier)
- `00123_*`: **NOT RUN** (stopped earlier)

### Exact repair command (authorized path; not reached on 00118)
`supabase migration repair <FILENAME_VERSION> --status applied --db-url [REDACTED] --workdir [ISOLATED] --yes`
CLI version: **2.117.0**

## Phase E — Artifacts
- `executable-byte-manifest.json` (entries=22)
- `dependency-closure-manifest.json` (zero_mismatch=True)
- `negative-hosted-matrix.json`
- `six-positive-scenarios.json` (+ raw)
- `cleanup-verification.json` (poison_absent=True, f3_absent=True)
- `phase-a-identity.json`, `phase-a-pre-reset-inventory.json`
- `phase-b-reset.json`, `phase-b-reset.sql`
- `phase-d-failure-classification.json`
- `summary.md` (this file)

## STOP reason
Hosted qualification **HOLD** because functional tip `b45042d8` qualify entrypoint fails `fingerprint_exact` on the first migration (expected fingerprint never populated). Negatives and floor install succeeded; six-positive sequence did not complete.
