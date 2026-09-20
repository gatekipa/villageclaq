# F23 local PostgreSQL proof

Classification: LOCAL_PG_EXECUTED
Server: 17.11 (Ubuntu 17.11-1.pgdg24.04+2)
Helper: scripts/prove-f3-qualification-reset-local.mjs
Functional tip: 77fd61dbf51652acabec0093d2a8549524b2dd75

- 33 checks / 14 scenarios / 11 executed TX / 47 pass / 0 fail
- Combined acceptance (`completeThrough00123 OR documentedAtomicRollbackHold`) rejected

## Normal application (fresh f23_normal_app)

- Mode recorded before DB ops: `normal-application` (hostedAuthority=false)
- Preserve reset → authenticated pre-floor → stub+live-pin floor
- Failure-injection objects absent
- CLI 2.117.0 applied frozen 00118–00123
- Exact history identities: 20260913173000–005 / expected names — all six present
- operationCounts: calibrationProbes=6, migrationApplications=6, retries=0, repairs=0, historyInjects=0
- QUALIFICATION PASS withheld: hosted-oracle fingerprint ACL/owner ≠ local ubuntu fixture
- Remaining HOLD: F23_FINGERPRINT_MISMATCH
- localApplicationComplete: false
- migrationsAppliedThrough00123: true

## Fault injection (fresh f22_fault_inject; not an F23 retry)

- Mode: `fault-injection` (default)
- Induced history inject: F3_DBPUSH_DISPOSABLE_HISTORY_INJECT SQLSTATE P0001
- Split: PRE_COMMIT_OR_ATOMIC_ROLLBACK; repairCalls=0 (correct)
- Remaining HOLD: F22_LOCAL_CLI_ATOMIC_ROLLBACK_REPAIR_REFUSED (re-executed; still authentic)
- 00119–00123 not started on this path

## Membership

- Fault-injection: 264 deptype=e tuples; exact OID sets equal before reset / after reset / after qualification
- Normal application: 264 deptype=e tuples; exact OID sets equal before reset / after reset / after qualification
- Distinct OID namespaces (separate databases). Counts alone insufficient.

DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT
DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN
