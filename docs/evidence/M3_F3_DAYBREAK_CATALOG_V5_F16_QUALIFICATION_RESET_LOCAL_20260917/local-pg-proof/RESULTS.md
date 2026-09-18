# F16 committed helper — local PG results

Classification: **LOCAL_PG_EXECUTED**
overallOk: **true** — pass 24 / fail 0
checks: 17 · scenarios: 7 · executedTransactions: **6**

## Preserved F15 TX
- UNEXPECTED_OBJECT_BLOCKS_BEFORE_PLAN — HOLD, no apply
- TX_SUCCESSFUL_RESET — T7_COMMIT / CLEAN_BASELINE / status 0
- TX_UNEXPECTED_OBJECT_ROLLBACK — T2_LOCK / HOLD / mutationPhaseReached=false
- TX_HISTORY_MISMATCH_ROLLBACK — T2_LOCK / HOLD / mutationPhaseReached=false

## F16 T3 TX
- TX_T3_UNAPPROVED_FK_ROLLBACK — T2_LOCK / HOLD / injected unapproved FK retained
- TX_T3_RETARGETED_FK_ROLLBACK — T2_LOCK / HOLD / retargeted endpoint retained
- TX_T3_APPROVED_SET_SUCCESS — T7_COMMIT / CLEAN_BASELINE

## Reparse
Independent reread of TX_SUCCESSFUL_RESET stdout through the strict parser proves T7 `committed=true` and CLEAN_BASELINE. Observation markers are records inside one SERIALIZABLE TX.

## Wipe
`F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`

Floor: DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT
