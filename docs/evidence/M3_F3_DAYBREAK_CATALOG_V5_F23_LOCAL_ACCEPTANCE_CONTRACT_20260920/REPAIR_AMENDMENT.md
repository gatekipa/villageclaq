# Local repair amendment — F23

**This amendment authorizes no repair execution.**  
PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE remains the hosted procedure.

## Local qualification

Post-commit filename-version repair is **not** a mandatory acceptance criterion for **local** qualification.

Local qualification must retain fail-closed refusal when target objects are absent or the observed failure is atomic / pre-commit:

- `repairCalls=0`
- no promotion of that failed application to success
- `promotedNotExercisedToPass=false`

Authenticated local refusal evidence is carried forward. It is **not** rerun merely because this wording changed.

Historical repair evidence proves feasibility only.

## Hosted requirement before leaving DAYBREAK HOLD

A separately authorized **hosted** qualification must still demonstrate:

1. Current-candidate `POST_COMMIT_HISTORY_FAILURE`
2. Surviving intended objects
3. Absent exact filename history
4. Existing repair-safety gate pass
5. Existing **raw** fingerprint gate pass (`fingerprintCompleteAndExact`)
6. Supported CLI 2.117.0 filename-version repair
7. Authentication of the resulting history and catalog state

Carry [REPAIR_FEASIBILITY.md](../M3_F3_DAYBREAK_CATALOG_V5_F23_CLOSEOUT_DECISION_INPUTS_20260920/REPAIR_FEASIBILITY.md) forward as feasibility only.

DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN
