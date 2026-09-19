# F17 finding closure — Daybreak F16 A HOLD / B HOLD local correction

**Supersedes** F16 LOCAL CANDIDATE READY for qualification-reset local candidate status.
Historical F16 evidence at `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F16_QUALIFICATION_RESET_LOCAL_20260917/` is preserved and **not rewritten**.

## Status
- Local: **LOCAL CANDIDATE READY**
- Overall: **DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN**
- Functional tip: `83b9f79483f3ba53f4f8cd60016450ff38a723b4`
- Starting ref: `10d2d578c18e372e633a033b31c2e515cd535a8b`
- F16 functional pin: `b74c6854869acf0e826446ea0488c42469621a3b`

## A / B / C / D closure

| Finding | F16 defect | F17 closure | Status |
| --- | --- | --- | --- |
| A unexpected storage_buckets false CLEAN_BASELINE | captured `storage_buckets:["unexpected_secret_bucket"]` returned CLEAN_BASELINE / F13_RESET_ALREADY_CLEAN because `dirtyBlocksCleanBaseline` was false | every captured non-allowlisted / malformed / missing bucket prevents alreadyClean; permitted identities from FAILED_FLOOR_STORAGE_BUCKETS only; HOLD without deletion or wipe | CLOSED locally |
| B snapshot-before-lock | SERIALIZABLE snapshot assigned at T1/advisory before T2 relation locks; existing tests injected drift before reset start | READ COMMITTED; T3 live catalog exact (kind,identity,from,to) vs captured approved set AND 37-tuple contract; two-session lock-wait T3 reject before mutation | CLOSED locally |
| C process evidence / package attestation | F16 RAW JSON contained absolute temp paths while pack-summary claimed pathLeaks:0; sanitizer dropped signal/timeout/structured error and original-stream hashes | capture-before-transform; original vs packaged hashes/lengths; failure cannot become success; F16 historical unchanged | CLOSED locally |
| D portability + QA provenance | Windows destAbs used a forward-slash substring; QA 228/1/1 | canonicalManifestPath; Builder Linux authenticated separately from historical Windows QA; F17 parallel cloud QA unavailable | CLOSED locally |

## Inventory matrix
See `inventory-matrix/BASELINE_AFFECTING_FIELDS.json`. `dirtyBlocksCleanBaseline !== true` omitted fields: none. Named residual buckets remain allowed. Unexpected buckets HOLD.

## Two-session T3 proofs (committed helper, real local PG 17.11)
- Holder ACCESS EXCLUSIVE on leftover relation; reset reaches T1 then waits; waiter pids observed; other session commits drift; T3 rejects; mutationPhaseReached=false; rolledBack=null
- New unapproved FK between allowlisted tables retained
- Approved identity retargeted to unapproved endpoint retained
- Unchanged approved set still T7 CLEAN_BASELINE

## Op counts (executed TX)
See `local-pg-proof/RESULTS.json`. Capture 1 + transport/apply/sql 1 per executed reset. Rollback cases do not reach T4. Lock-wait cases do not reach mutation.

## Wipe
Still rejected: `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`

## Closures (tip bytes)
- Runtime `F17_QUALIFICATION_RESET_RUNTIME_CLOSURE`: `0db1c600c620c0e406038fa3ebc5c4d7df6104bce64545ef9e16a63a6237c741` (count 45)
- Verification union `F17_QUALIFICATION_RESET_VERIFICATION_UNION`: `d3fd2eb52a2adc2a1f963a54955b888b2d3e8eadea0283894c4a51f5effc41cb` (count 48)
- Independent-ref SHA-256: `3742c0396903f3e91a779deec9b62d93a879f134c186f3b4b817a19c6ca99c91`
- F16 baselines cited-not-expected: runtime `1ca2a1ceddca278889c7ea92fc10e6a59150e06c5b4f13d4426b293fda29ee78` union `989c6c99ead2b84190486b856d7e04a1e76824f870f3bbf9438935808c8fb7ff`
- ≠ forbidden summary `16e4757840aec5f4fb44504fbd33e8480de169553f9a1ccfb180dbde051cb66d`

## Floor
DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT
