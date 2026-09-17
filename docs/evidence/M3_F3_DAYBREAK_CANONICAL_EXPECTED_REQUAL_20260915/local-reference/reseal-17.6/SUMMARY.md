# F3 reseal SUMMARY (PG 17.6 independent local oracle)

## Verdict: **READY_TO_FF**

## Pins
- Tip: `41055f2f0a66626c1fb3719b3b20e6fcdde9025c` (PR #95 / cursor/daybreak-hold-canonical-expected-a6f5)
- Baseline compare: `ebd4c20bcf72500b77ea24bd7269094f3dc13b3e`
- Exactly 3 files differ tip↔baseline:
  - `scripts/lib/f3-db-push-repair-safety-gate.mjs`
  - `scripts/qualify-f3-db-push-disposable.mjs`
  - `scripts/test-f3-db-push-harness.mjs`

## Oracle
- Container: `f3-reference-pg176` (postgres:17.6)
- Listen: `127.0.0.1:55432` only (host PG 17.11 on :5432 deliberately avoided)
- Seal DB: `f3_reference_seal_20260915` (fresh `f3_reference_*` on same container)
- Preexisting `f3_reference_oracle_20260915` left at floor+00117 (untouched by seal drop/create of sibling DB)
- PG proof: `reseal-17.6/pg-proof.json`

## Six expected hashes (canonical sha256)
| file | hash |
|------|------|
| `00118_f3_bounded_financial_epoch_foundation.sql` | `8299680fd5b3def52a981ae8c8ee097f29f13507b91d4f0799557236f1b5001c` |
| `00119_f3_01_core_ledger_foundation.sql` | `0ee6c447ac89510f381abd30908b7fb5ba304537e60c577d6eedcc7835a7ed43` |
| `00120_f3_02_secure_posting_idempotency.sql` | `13234a1e57a8c181da1a356ba1f236efc919efb6edb642062239499ff10d0ce9` |
| `00121_f3_03_projection_read_proof.sql` | `b1693eda6e5e3944db092d800e037e366c9fd8e18723db962493b502c539cb30` |
| `00122_f3_04_correction_reversal.sql` | `9add78f222edc0f933512f726f08ed92feed94432b9a9234c32e6952a1dfc00c` |
| `00123_f3_05_opening_cash_command.sql` | `0234d2bf2374c8a681d186b8d77364b4b4db02eac76cebf786173d4a835f9547` |

## 17.6 vs cloud-agent 17.11
All six **identical** after independent recompute on 17.6 (not copied):
- `00118_f3_bounded_financial_epoch_foundation.sql`: identical=True
- `00119_f3_01_core_ledger_foundation.sql`: identical=True
- `00120_f3_02_secure_posting_idempotency.sql`: identical=True
- `00121_f3_03_projection_read_proof.sql`: identical=True
- `00122_f3_04_correction_reversal.sql`: identical=True
- `00123_f3_05_opening_cash_command.sql`: identical=True

## Builder ≡ reference
All six `equal=true` (offline `getFrozenExpectedFingerprint` / embedded oracle catalog builder vs independent live `CATALOG_FINGERPRINT_SQL` collector on 17.6).
Seal-helper hashes also equal the second independent verify DB for all six.

## Not-hosted proof
- 00118 local hash ≠ forbidden hosted `72af66999f3a53a870cd1a5d0ed99a2acb7f510c69bfe16204b9fe0f217f757f`
- Recomputed via `sealExpectedFingerprintsFromLocalOracle` + independent second-DB collector
- See `reseal-17.6/not-hosted-proof.json`

## Digests
Unchanged / verified match STATUS pins: `True`

## Recognition
`["manual_income"]` on builder and reference for all six: `True`

## Tests (`npm run test:f3-db-push`)
- tests=113 pass=112 fail=0 skipped=1
- exit_ok=True
- See `reseal-17.6/local-suites.json`

## Resealed tip files
No content mutation required (17.6 seals == tip embedded seals). Copies mirrored under `resealed-tip/scripts/...` for convenience.

## Blockers
None

## Isolation
- No hosted disposable / production contact
- Env sanitized (no DATABASE_URL / SUPABASE_* for seal process)
- Credentials only from `/tmp/f3-reference-local.env` (mode 600; never printed)
