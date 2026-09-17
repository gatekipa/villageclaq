# F15 committed-helper local PG proof (framing follow-up)

- Helper: `scripts/prove-f3-qualification-reset-local.mjs` at tip `49a91169fbb53dba149f4e7bbcf3016f988f4922`
- classification: **LOCAL_PG_EXECUTED**
- overallOk: **true** — pass 15 / fail 0 — executedTransactions=**3**
- PostgreSQL 17.11 unix socket as OS `ubuntu`; template1 `storage.buckets` stub
- Docker `f3-reference-pg176` available (17.6 @ 127.0.0.1:55432); not used by committed helper fixture contract

## Scenarios
| id | ok | commit | verdict | phase | code |
| --- | --- | --- | --- | --- | --- |
| UNEXPECTED_OBJECT_BLOCKS_BEFORE_PLAN | true | false | HOLD | — | F13_UNEXPECTED_OBJECT_OR_DEPENDENCY |
| TX_SUCCESSFUL_RESET | true | true | CLEAN_BASELINE | T7_COMMIT | — |
| TX_UNEXPECTED_OBJECT_ROLLBACK | true | false | HOLD | T2_LOCK | F13_RESET_SQL_FAILED |
| TX_HISTORY_MISMATCH_ROLLBACK | true | false | HOLD | T2_LOCK | F13_RESET_SQL_FAILED |

## Framing
Prior HOLD on void `SELECT pg_advisory_xact_lock` blank line under `-At` is **CLOSED**:
- Emitter uses `PERFORM` inside DO (no client row)
- Parser skips protocol-defined whitespace-only lines
- PREFIX / WRONG_PHASE / SUFFIX / EACCES+success still rejected (C4-R01–R03)
- C4-R04 regression PASS

## Wipe
Still rejected: `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`
