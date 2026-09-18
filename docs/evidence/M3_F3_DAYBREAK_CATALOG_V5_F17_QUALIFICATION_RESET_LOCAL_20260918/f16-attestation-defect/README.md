# F16 process-evidence attestation defect (historical; not rewritten)

F16 `LOCAL CANDIDATE READY` is superseded by independent Daybreak A HOLD / B HOLD and by this packaging defect.

- Historical package `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F16_QUALIFICATION_RESET_LOCAL_20260917` is preserved byte-for-byte.
- F16 `pack-summary.json` claimed `pathLeaks: 0`.
- Independent scan of F16 `local-pg-proof/TX_SUCCESS_RAW.json` finds pathLeaks=1 (absolute temp workdir paths in stderr).
- F16 helper `processEvidence` dropped signal/timeout/structured error and did not retain original-stream hashes/lengths.
- F17 captures the raw process result before transform, preserves exit/signal/timeout/termination/structured error, and records separate original vs packaged stream hashes/lengths.
- Transformed evidence never claims original-byte equality and is never reconstructed from summaries.
