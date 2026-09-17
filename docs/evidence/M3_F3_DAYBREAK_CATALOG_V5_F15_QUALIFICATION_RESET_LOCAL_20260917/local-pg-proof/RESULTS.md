# F15 local committed-helper qualification-reset proof

Tip: `a4fa0832420d46f6cdd73b8f5e2ab381029dd2e1`
Plan commit: `5ec5958ea6d6b60c7046e1c96b53636bd5ffe81d`
Parent F14 evidence: `437f27c2721bf7710746468a2cef9a52e1c4651a`
PG: local PostgreSQL 17.11 via unix socket as OS user `ubuntu` (committed fixture); template1 storage.buckets stub
Floor: DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT

classification: **LOCAL_PG_EXECUTED** mustLocal=False
overallOk=False pass=12 fail=1
distinctions: {'checks': 9, 'scenarios': 4, 'executedTransactions': 3}

| Case | OK | kind | execTX | commit | rollback | code | verdict | note |
|---|---|---|---|---|---|---|---|---|
| WIPE_STILL_REJECTED | PASS | check | False | None | None | F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH |  |  |
| INVENTORY_PSQL_ARGV_MACHINE_READABLE | PASS | check | False | None | None |  |  |  |
| ALIGNED_FRAMING_REJECTED | PASS | check | False | None | None | F13_INVENTORY_CAPTURE_FRAMING |  |  |
| FUNCTION_IDENTITY_NAMED_ARGS | PASS | check | False | None | None |  |  |  |
| UNEXPECTED_OBJECT_BLOCKS | PASS | check | False | None | None | F13_UNEXPECTED_OBJECT_OR_DEPENDENCY |  |  |
| STATUS0_WITHOUT_COMMIT_OBS | PASS | check | False | False | None |  |  |  |
| COMMIT_CONNECTION_LOSS_UNCERTAIN | PASS | check | False | False | None |  |  |  |
| RUNTIME_CLOSURE_NOT_SUMMARY | PASS | check | False | None | None |  |  |  |
| PROPOSED_HOSTED_PLAN_OFFLINE | PASS | check | False | None | None |  |  |  |
| UNEXPECTED_OBJECT_BLOCKS_BEFORE_PLAN | PASS | scenario | False | False | None | F13_UNEXPECTED_OBJECT_OR_DEPENDENCY | HOLD | unexpected object present at capture blocks planning; no apply |
| TX_SUCCESSFUL_RESET | FAIL | scenario | True | False | None |  | HOLD | shared runQualificationReset + local-fixture psql + generated SQL |
| TX_UNEXPECTED_OBJECT_ROLLBACK | PASS | scenario | True | False | None | F13_RESET_SQL_FAILED | HOLD | object introduced after capture is TX-revalidated; sentinel preserved |
| TX_HISTORY_MISMATCH_ROLLBACK | PASS | scenario | True | False | None | F13_RESET_SQL_FAILED | HOLD | history mismatch after capture rolls back; mutated history retained |

## Exact HOLD
`TX_SUCCESSFUL_RESET` — observation framing blank line from void `pg_advisory_xact_lock` SELECT under `-At` → `F13_TX_OBSERVATION_FRAMING` / `F13_RESET_NOT_COMMITTED`. Physical commit observed out-of-band (accounts gone, history 0) but committed-helper overallOk requires interpreter-confirmed commit.

Pre-plan unexpected (blocks apply) vs post-capture TX revalidation: distinguished via `UNEXPECTED_OBJECT_BLOCKS_BEFORE_PLAN` vs `TX_UNEXPECTED_OBJECT_ROLLBACK`.

Local status: **HOLD — TX_SUCCESSFUL_RESET OBSERVATION FRAMING** (not LOCAL CANDIDATE READY)
Overall: **DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN**
