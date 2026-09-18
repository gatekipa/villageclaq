# F17 local PostgreSQL proof

Classification: **LOCAL_PG_EXECUTED**
Checks: 20  Scenarios: 9  Executed TX: 8
Pass/fail: 29/0

Two-session lock-wait:
- TX_T3_LOCKWAIT_UNAPPROVED_FK_ROLLBACK lockWaitObserved=true mutationPhaseReached=false rollback=null
- TX_T3_LOCKWAIT_RETARGETED_FK_ROLLBACK lockWaitObserved=true mutationPhaseReached=false rollback=null
- TX_T3_APPROVED_SET_SUCCESS commit=true verdict=CLEAN_BASELINE

rolledBack remains null unless rollback is independently observed.

DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT
