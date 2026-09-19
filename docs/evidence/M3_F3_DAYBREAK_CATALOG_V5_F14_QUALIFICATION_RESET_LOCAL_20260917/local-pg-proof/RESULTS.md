# F14 local task-owned PG qualification-reset proof

Tip: `2d502a028b0d01808a871fb1d48d051813591ed2`
Parent: `137f1c825455c10bd7d974d3de7dcbdc610c9619`
DB: `f3_f14_qual_reset_local_20260917` @ 127.0.0.1:55432 (f3-reference-pg176)
Floor: DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT

Committed helper: **MUST_LOCAL** (socket peer as ubuntu). Expanded proof: docker TCP + real psql + tip orchestration.

| Case | OK | kind | capture | reset | phase | commit | rollback | replay | notes |
|---|---|---|---|---|---|---|---|---|---|
| SETUP_FLOOR_STUBS_AND_RESET | PASS | setup |  |  |  |  |  | false | storage.buckets empty stub + supabase_migrations |
| RUNTIME_AND_UNION_CLOSURES_NOT_SUMMARY | PASS | check |  |  |  |  |  | false |  |
| WIPE_STILL_REJECTED | PASS | check |  |  |  | false |  | false | F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH |
| P0_INVENTORY_CAPTURE_REQUIRED | PASS | check | missing | not-attempted |  | false |  | false | F13_INVENTORY_CAPTURE_REQUIRED |
| LIVE_CAPTURE_EMPTY_UNIVERSE | PASS | scenario | complete-empty |  |  | false |  | false | real psql inventory capture |
| FUNCTION_IDENTITY_SURFACE | PASS | scenario | complete-with-fns |  |  | false |  | false |  |
| OBJECT_KINDS_DEPS_HISTORY_CAPTURE | PASS | scenario | complete-universe |  |  | false |  | false |  |
| UNEXPECTED_SENTINEL_BLOCKS | PASS | check | synthetic-unexpected |  |  | false |  | false | F13_UNEXPECTED_OBJECT_OR_DEPENDENCY |
| P1_ALREADY_CLEAN_ELIGIBILITY | PASS | scenario | complete-empty | 0 |  | false |  | false | CLEAN_BASELINE |
| P2_CLEAN_BASELINE_NO_MUTATION | PASS | scenario | complete-empty | 0 |  | false |  | false | F13_RESET_ALREADY_CLEAN |
| P1_LEFTOVER_ELIGIBLE | PASS | scenario | fixture-observed |  |  |  |  | false |  |
| EMITTED_SQL_RESTRICT_NO_CASCADE | PASS | check |  |  |  |  |  | false |  |
| SUCCESS_LEFTOVER_CLEAN_BASELINE | PASS | executed-tx | fixture-observed | 1 | T7_COMMIT | true | false | false | F13_RESET_COMMITTED |
| ROLLBACK_EXTRAS_HOLD_OFFLINE | PASS | check | synthetic |  |  | false |  | false | F13_UNEXPECTED_OBJECT_OR_DEPENDENCY |
| TX_ROLLBACK_UNEXPECTED_OBJECT | PASS | executed-tx | fixture | 1 | TX_FAILED | false | true | false | F13_RESET_SQL_FAILED |
| TX_ROLLBACK_HISTORY_MISMATCH | PASS | executed-tx | fixture | 1 | TX_FAILED | false | true | false | F13_RESET_SQL_FAILED |
| FAILURE_BEFORE_MUTATION_NO_EFFECTS | PASS | scenario | fixture | 1 |  | false |  | false | F13_FAILURE_BEFORE_MUTATION |
| PROCESS_UNCERTAINTY_REPLAY_SUPPRESSED | PASS | scenario | fixture | 1 | T7_COMMIT | false |  | false | UNCERTAIN_COMMIT |

**pass=18 fail=0 overallOk=true**

checks=6 scenarios=9 executedTransactions=3

Local status: **LOCAL CANDIDATE READY**
Overall: **DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN**
