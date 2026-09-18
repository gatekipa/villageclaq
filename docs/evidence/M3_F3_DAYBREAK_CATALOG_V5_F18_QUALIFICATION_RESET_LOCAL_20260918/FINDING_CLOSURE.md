# F18 finding closure — F17 A HOLD / B HOLD local correction

**Supersedes** F17 LOCAL CANDIDATE READY for qualification-reset local candidate status.
Historical F17 evidence at `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F17_QUALIFICATION_RESET_LOCAL_20260918/` is preserved and **not rewritten**.

## Status
- Local: **LOCAL CANDIDATE READY** — independent QA **F18 ACCEPT**
- Overall: **DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN**
- Functional tip: `ca2c0d536037da8c7f55627ac1694cacb932d1d7` (unchanged)
- QA package commit: `e85a7a537275596d54c5ccb6bd632bb6f12c0e4e`
- Reviewer: `bc-49cebacf-a8b4-5f38-9609-95ffe86d6adf`
- Classification: `LOCAL_PG_EXECUTED` on PostgreSQL 17.11
- Starting ref: `3fcbcbc438ccc90faf7e87d06ba0d270e3d17598`
- F17 functional pin: `83b9f79483f3ba53f4f8cd60016450ff38a723b4`

## A / B / C / D closure

| Finding | F17 defect | F18 closure | Status |
| --- | --- | --- | --- |
| A unbound lock-wait waiter | granted holder + any ungranted waiter accepted without proving waiter is the reset worker | reset backend pid from the same connection executing generated SQL; bound to spawned process + execution id; HOLDER_COMMITTED + holder result + catalog change + worker-bound acquisition required; negatives cannot PASS | CLOSED locally |
| B process provenance | runner encode/sanitize then helper re-package lost Error/EACCES/syscall, timedOut true→false, labeled sanitized hash original | one contract captures original hashes/lengths and termination/error at the pre-encode boundary; helper validates already-encoded records; E2E runner→helper→serialize→reread→parser | CLOSED locally |
| C success-reparse attestations | TX_SUCCESS_REPARSE interpretedCommitted:false despite T7 + CLEAN_BASELINE | explicit adapter maps processStatus→status; missing status is not success; attestations from finalized reread; inconsistent attestations fail finalization | CLOSED locally |
| D authentic QA on authoritative head | F17 cited QA dir missing / #84 presented sibling QA as authoritative | Complete independent QA package on the same functional tip at `qa-package/` (commit `e85a7a53`); reviewer `bc-49cebacf-a8b4-5f38-9609-95ffe86d6adf`; outer index covers the full tree | **F18 ACCEPT** |

## Two-session T3 proofs (committed helper, real local PG 17.11)
- Unapproved FK: reset backend 29511 / process 29138; holder committed; backend-bound proof true; mutationPhaseReached=false; rolledBack=null
- Retargeted FK: reset backend 29933 / process 29560; holder committed; backend-bound proof true; mutationPhaseReached=false; rolledBack=null
- Unchanged approved set still T7 CLEAN_BASELINE and reparses committed

## Wipe
Still rejected: `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`

## Closures (tip bytes)
- Runtime `F18_QUALIFICATION_RESET_RUNTIME_CLOSURE`: `c6ecf620e41dbbce340e2207b2b9b793c8df750c703d245363139b497526a392` (count 45)
- Verification union `F18_QUALIFICATION_RESET_VERIFICATION_UNION`: `b9a9e6b7ad95f6e5935d05bb6c41bdabe543f0f88a086bc6b28fcb07dd03be78` (count 48)
- Independent-ref SHA-256: `3742c0396903f3e91a779deec9b62d93a879f134c186f3b4b817a19c6ca99c91`
- F17 baselines cited-not-expected: runtime `0db1c600c620c0e406038fa3ebc5c4d7df6104bce64545ef9e16a63a6237c741` union `d3fd2eb52a2adc2a1f963a54955b888b2d3e8eadea0283894c4a51f5effc41cb`
- ≠ forbidden summary `16e4757840aec5f4fb44504fbd33e8480de169553f9a1ccfb180dbde051cb66d`

## Floor
DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT
