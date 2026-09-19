# F19 finding closure — process-record integrity and thrown acceptance

**Supersedes** F18 LOCAL CANDIDATE READY for qualification-reset local candidate status.
Historical F18 evidence at `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F18_QUALIFICATION_RESET_LOCAL_20260918/` is preserved and **not rewritten**.
Authenticated F18 cloud reviewer `bc-49cebacf-a8b4-5f38-9609-95ffe86d6adf` is **INHERITED** when cited for F19.

## Status
- Local: **LOCAL CANDIDATE READY** — independent QA **F19 ACCEPT**
- Overall: **DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN**
- Functional tip: `dfbeb11b49f7e9b061a4c700e0335d125ac669e2` (unchanged)
- QA package commit: `c44f7fc20e93ca29e3010bfbdae8b0812f6cdf6a`
- Reviewer: `bc-8c2797cf-e789-5ab9-afd1-ff9a47a05cfa`
- Classification: `MUST_LOCAL` (psql not present). F18 LOCAL_PG_EXECUTED concurrency proof is **INHERITED** and was **not re-run**.
- Starting ref: `1a4534c33bb80df273067354710582b9acc062ad`
- F18 functional pin: `ca2c0d536037da8c7f55627ac1694cacb932d1d7` (INHERITED)

## A / B closure

| Finding | F18 defect | F19 closure | Status |
| --- | --- | --- | --- |
| A final process-record integrity | `processEvidence()` changed streams after packaged hashes; `record()` dropped `thrown` | helper completes path+secret sanitization before packaged identities; runner does not mutate after package; `record()` preserves `thrown` with status/signal/timeout/structured-error; recovered bodies match packaged hashes/lengths; originals stay pre-sanitization | **F19 ACCEPT** |
| B thrown:true success path | otherwise valid committed record with only `thrown:true` → interpretedCommitted=true, processFailed=false, attestation.ok=true, finalization.ok=true | processErrorPresent, processFailed, interpretation, attestation, and finalization reject `thrown:true`; status 0 / T7 / CLEAN_BASELINE cannot override; `rolledBack` stays null where unproven | **F19 ACCEPT** |

## Wipe
Still rejected: `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`

## Closures (functional tip bytes)
- Runtime `F19_QUALIFICATION_RESET_RUNTIME_CLOSURE`: `8d4885d6148e7dfca99e4abdb62db6be27479731cc33e680cc36437347b6fdfe` (count 45)
- Verification union `F19_QUALIFICATION_RESET_VERIFICATION_UNION`: `524a294a0202af3601db17b34a7ad72a77adaaa4cbd2e7a460089b6a4de024fa` (count 48)
- F18 runtime cited-not-expected: `c6ecf620e41dbbce340e2207b2b9b793c8df750c703d245363139b497526a392`
- F18 union cited-not-expected: `b9a9e6b7ad95f6e5935d05bb6c41bdabe543f0f88a086bc6b28fcb07dd03be78`
- F17 runtime cited-not-expected: `0db1c600c620c0e406038fa3ebc5c4d7df6104bce64545ef9e16a63a6237c741`
- Independent-ref SHA-256: `3742c0396903f3e91a779deec9b62d93a879f134c186f3b4b817a19c6ca99c91`
- ≠ forbidden summary `16e4757840aec5f4fb44504fbd33e8480de169553f9a1ccfb180dbde051cb66d`

## Floor
DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT
