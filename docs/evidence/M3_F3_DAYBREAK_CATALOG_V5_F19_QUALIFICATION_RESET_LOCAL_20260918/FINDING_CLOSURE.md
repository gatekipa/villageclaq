# F19 finding closure — process-record integrity and thrown acceptance

**Supersedes** F18 LOCAL CANDIDATE READY for qualification-reset local candidate status.
Historical F18 evidence at `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F18_QUALIFICATION_RESET_LOCAL_20260918/` is preserved and **not rewritten**.
Authenticated F18 cloud reviewer `bc-49cebacf-a8b4-5f38-9609-95ffe86d6adf` is **INHERITED** when cited for F19.

## Status
- Local: **HOLD — QA PENDING** after functional freeze
- Overall: **DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN**
- Functional tip: `dfbeb11b49f7e9b061a4c700e0335d125ac669e2`
- Starting ref: `1a4534c33bb80df273067354710582b9acc062ad`
- F18 functional pin: `ca2c0d536037da8c7f55627ac1694cacb932d1d7` (INHERITED)
- F12 functional pin: `1ec0e4da782ed7715a543be23f79bc0f10a28af2`
- Classification: `MUST_LOCAL` (psql not present on this builder). F18 LOCAL_PG_EXECUTED concurrency proof is **INHERITED** and was **not re-run**.

## A / B closure

| Finding | F18 defect | F19 closure | Status |
| --- | --- | --- | --- |
| A final process-record integrity | `processEvidence()` changed streams after packaged hashes; `record()` dropped `thrown` | helper completes path+secret sanitization before packaged identities; runner does not mutate after package; `record()` preserves `thrown` with status/signal/timeout/structured-error; recovered bodies match packaged hashes/lengths; originals stay pre-sanitization | CLOSED locally; QA pending |
| B thrown:true success path | otherwise valid committed record with only `thrown:true` → interpretedCommitted=true, processFailed=false, attestation.ok=true, finalization.ok=true | processErrorPresent, processFailed, interpretation, attestation, and finalization reject `thrown:true`; status 0 / T7 / CLEAN_BASELINE cannot override; `rolledBack` stays null where unproven | CLOSED locally; QA pending |

## VillageClaq “242 pass + 1 skip”
No distinct authentic execution record for a VillageClaq “242 pass + 1 skip” claim was supplied. That claim is **not** part of F19 acceptance. Historical packages are unchanged. This builder’s authentic combined gate is recorded in `suite-logs/`.

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
