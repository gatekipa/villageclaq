# F22 local PostgreSQL proof

Classification: LOCAL_PG_EXECUTED
Server: 17.11 (Ubuntu 17.11-1.pgdg24.04+2)
Helper: scripts/prove-f3-qualification-reset-local.mjs
Functional tip: f1d30b28830db902962467f801932254997e64c3

- 32 checks / 13 scenarios / 10 executed TX / 45 pass / 0 fail
- Preserve reset: QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1
- Pre-floor gate: QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1 (allowFloor)
- Floor: stub+live-pin installed exact; pre-db-push gates ok
- CLI 2.117.0 db push 00118: F3_DBPUSH_DISPOSABLE_HISTORY_INJECT (SQLSTATE P0001)
- Classification: PRE_COMMIT_OR_ATOMIC_ROLLBACK; repair not spawned
- Remaining HOLD: F22_LOCAL_CLI_ATOMIC_ROLLBACK_REPAIR_REFUSED
- Membership: 264 deptype=e tuples; exact OID sets equal before reset / after reset / after qualification
- F21 00118 F3_ABORT remains a negative test only

DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT
DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN
