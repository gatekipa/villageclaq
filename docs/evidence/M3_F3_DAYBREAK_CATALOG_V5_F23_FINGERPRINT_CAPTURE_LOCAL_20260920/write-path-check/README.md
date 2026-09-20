# In-memory write-path check — not a capture

`node --check` plus a direct import of `retainFingerprintFieldDiffs` / `retainQualifyFingerprintDiffs` from `scripts/prove-f3-qualification-reset-local.mjs`.

- Syntax/import: pass
- `--fingerprint-diff-out` equivalent `writeFileSync` of `secretsRemoved(JSON.stringify(...))`: pass
- Frozen expected fingerprint import for `00118_f3_bounded_financial_epoch_foundation.sql`: pass (`frozenOracleImportOk`)
- Synthetic owner/ACL rows below are **invented for the write-path test**. They are **not** F23 phase-matched observations.

Do not use this file as the fingerprint comparison.
