# PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE

**Status:** PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE
**Audience:** Chief / Daybreak (evidence commit later). LOCAL_SYNTHETIC staging. Directory name does not imply hosted execution.
**This agent did not obtain credentials, probe disposable `jkorwnwwmdeflfntxntl`, contact production `llbnliixczcqfftxpsmb`, run a reset, or execute any part of this plan.**

## Wipe flag (unchanged rejection)

`--wipe-to-baseline` remains unconditionally rejected (`F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`). Do not enable, weaken, or bypass.

## Bound identities (fill after functional freeze)

- Functional tip: `1ec0e4da782ed7715a543be23f79bc0f10a28af2`
- Closure digest: `08c2d46d7ff0d7e80d4df30342ca804cd7f1ddc408951491f77d5bb92ce1157b`
- CLI pin: `2.117.0`
- History version/name predicates (not source-label timestamp keys):
  - `20260913173000` / `f3_bounded_financial_epoch_foundation` ← 00118_f3_bounded_financial_epoch_foundation.sql
  - `20260913173001` / `f3_01_core_ledger_foundation` ← 00119_f3_01_core_ledger_foundation.sql
  - `20260913173002` / `f3_02_secure_posting_idempotency` ← 00120_f3_02_secure_posting_idempotency.sql
  - `20260913173003` / `f3_03_projection_read_proof` ← 00121_f3_03_projection_read_proof.sql
  - `20260913173004` / `f3_04_correction_reversal` ← 00122_f3_04_correction_reversal.sql
  - `20260913173005` / `f3_05_opening_cash_command` ← 00123_f3_05_opening_cash_command.sql

## Supported procedure

1. Confirm target is disposable identity above. Reject production immediately.
2. Read-only inventory via existing `INVENTORY_CAPTURE_SQL` + `supabase db query --output-format json` (placeholders only).
3. Offline `classifyInventory` / `planWipe`:
   - CLEAN_BASELINE → no mutation.
   - WIPE_ELIGIBLE → apply `buildWipeSql` via gated `psql -f` (NOT `--wipe-to-baseline`). Failed-floor catalogs only; managed schemas preserved; never drop `storage.buckets`.
   - HOLD (history rows > 0 or financial_* present) → STOP. See remaining HOLD below.
4. `proveCleanBaseline` / `evaluatePreStubFloorCleanCheck`.
5. Exactly one qualify: `node scripts/qualify-f3-db-push-disposable.mjs --no-wipe --prep-floor --sequence-f3`.
6. Apply/repair remain separate CLI 2.117.0 commands. Stop on first unexpected failure. No silent patch. No second reset.

## Remaining HOLD

F12-RESET-HOLD-HISTORY-OR-F3-OBJECTS: Pinned wipe library HOLDs when schema_migrations_rows>0 or financial_* objects are present. No authorized DELETE FROM supabase_migrations.schema_migrations WHERE version/name IN (preassigned 20260913173000–005 / PREASSIGNED_NAMES) exists in pinned source. Do not invent that SQL. Do not use --wipe-to-baseline.

## Commands (placeholders — DO NOT EXECUTE)

```bash
git rev-parse HEAD  # must equal bound functional tip
# DO NOT: node scripts/qualify-f3-db-push-disposable.mjs --wipe-to-baseline  → HOLD F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH
# 1) Read-only inventory via existing INVENTORY_CAPTURE_SQL + db query transport (placeholders only)
# 2) Offline classifyInventory / planWipe. CLEAN_BASELINE → no mutation. WIPE_ELIGIBLE → gated psql -f of buildWipeSql. HOLD → STOP.
# 3) proveCleanBaseline / evaluatePreStubFloorCleanCheck
node scripts/qualify-f3-db-push-disposable.mjs --no-wipe --prep-floor --sequence-f3 --evidence-out docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F12_LOCAL_SYNTHETIC_STAGING_20260917/local-synthetic/qualify-evidence/qualify-result.json
```

Offline validation recorded: noResetOccurred=true noServiceConnection=true.


---

## F12 frozen functional identity (Chief binding — do not requalify a different tip)

| Field | Value |
| --- | --- |
| Functional tip | `1ec0e4da782ed7715a543be23f79bc0f10a28af2` |
| F12 implementation parent | `e872b5e5d3d199bc13685eb6ec94ee1248dbecde` |
| Start (F11 evidence head) | `f55fd39611ee8a7106280c60ec84c1d05f38a5e5` |
| F11 functional | `a67125309cc31ac33e601f0165cf906fb5806230` |
| Intermediate (preserved) | `773b5c61e9862dbe66863a9030c4a9884e0bcc25` |
| Main (not F12 authority) | `d83d13d4fe9915a0d1ff149ce29a53ad708c9853` |
| PR #83 | `a293f5958b31548ccec7591b653eff2857ae9a90` |
| Draft unused PR | #107 at `1ec0e4da…` (not authority; do not retitle #84/#85/#86) |

Ancestry (no rewrite): `1ec0e4d` → `e872b5e` → `f55fd39` → `a671253` → `773b5c6` …

## Fresh F12 runtime-closure identity (recomputed from tip bytes — not F11)

| Field | Value |
| --- | --- |
| File count | 43 |
| Closure digest | `08c2d46d7ff0d7e80d4df30342ca804cd7f1ddc408951491f77d5bb92ce1157b` |
| Independent-ref sha256 (frozen) | `3742c0396903f3e91a779deec9b62d93a879f134c186f3b4b817a19c6ca99c91` |
| Recognition allowlist | exactly `["manual_income"]` |
| 3-file allowlist manifest | `76a8383a75616118642d0f39b7c83bd1ddebe2839a25ff1a5d092ceced1fe6c2` |
| CLI pin | `2.117.0` |

Do **not** reuse F11 closure identity `42 / ecfd265d…` as the F12 identity.

### Allowed functional files vs `f55fd39` (exactly 3)

| File | SHA-256 | bytes |
| --- | --- | --- |
| `scripts/qualify-f3-db-push-disposable.mjs` | `3116906451a3d08c481548583a60be1efbef1cffa760a8b3fdd6846992526299` | 148611 |
| `scripts/test-f3-db-push-harness.mjs` | `a507653ff237c1223d596358ce61f00cfe1588e49739d51ad6588b1d42aeb4ba` | 380897 |
| `scripts/lib/f3-db-push-repair-safety-gate.mjs` | `405e1c5a672c30895ca2089c1eb078605551a2725699672bb51dfd7c43f205df` | 2039958 |

## Offline compatibility proof (this packaging run)

- `noResetOccurred=true`
- `noServiceConnection=true`
- `transportsDisabled=true`
- `wipeToBaselineStillRejected=true` (`F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`)
- Remaining HOLD disclosed: **`F12-RESET-HOLD-HISTORY-OR-F3-OBJECTS`**

## Honest remaining HOLD (do not invent missing DELETE)

**`F12-RESET-HOLD-HISTORY-OR-F3-OBJECTS`**: pinned wipe HOLDs when `schema_migrations_rows>0` or `financial_*` present. No authorized `DELETE FROM supabase_migrations.schema_migrations WHERE version/name IN (20260913173000–005 / PREASSIGNED_NAMES)` exists in pinned source. Proposed plan discloses this; do not invent that SQL. Do not enable `--wipe-to-baseline`.

## Absolute bans (unchanged)

- NO disposable `jkorwnwwmdeflfntxntl` access/probe/reset in this packaging
- NO hosted qualification
- NO production `llbnliixczcqfftxpsmb`
- Do not contact Daybreak/Astra
- Do not edit historical F9/F10/F11 evidence packages
- Do not execute this plan without separate founder authorization

## Verbatim floor limitation

**DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT**
