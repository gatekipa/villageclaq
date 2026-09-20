# F22 finding closure

## Connected
The qualification entrypoint no longer requires historical CLEAN_BASELINE before floor preparation when policy `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1` is authenticated from a fresh current-database capture with typed membership.

- `evaluatePreStubFloorCleanCheck` historical default is unchanged
- `resolvePreFloorQualificationGate` short-circuits CLEAN_BASELINE, then the preserve path
- Previous reset-success records cannot authenticate current database
- `qualificationResetQualifyEmitPayload` fails closed with `F21_PRESERVE_BASELINE_VERDICT_REQUIRED` when verdict is missing
- Unrelated leftovers and name-only gbt_* objects still HOLD
- Wipe / 43 dependency tuples / constrained history / target guards remain intact

## Remaining HOLD
`F22_LOCAL_CLI_ATOMIC_ROLLBACK_REPAIR_REFUSED`

Local CLI 2.117.0 `db push` of 00118 against run-owned PostgreSQL treated the induced `F3_DBPUSH_DISPOSABLE_HISTORY_INJECT` (SQLSTATE P0001) as a single-transaction rollback (`PRE_COMMIT_OR_ATOMIC_ROLLBACK`). The repair-safety gate correctly refused repair because objects were not present. Migrations 00119–00123 were not started.

This is not reset-only success. Gate + floor + first real CLI push were exercised. Complete qualification through 00123 is not claimed.

## Not done
Hosted requalification, disposable contact, production, merge, F3-06, QA ACCEPT, Astra verdict.
