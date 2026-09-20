# F23 independent QA provenance

| Field | Value |
|------|-------|
| Reviewer | VillageClaq QA (independent Grok-family; distinct from builder) |
| Functional tip reviewed | `77fd61dbf51652acabec0093d2a8549524b2dd75` |
| Evidence tip reviewed | `c0a6746516b115b9e1db6ce311c4a4fe80113b01` |
| Verdict | F23 HOLD PACKAGE ACCEPT |
| Builder claim corroborated | `F23_FINGERPRINT_MISMATCH`; `migrationsAppliedThrough00123=true`; `completeThrough00123=false` |
| Fingerprint HOLD | must not be credited as application success |
| Suites QA-executed | design 33/33, reset 81/81, harness 116/116 |
| Complete local prove re-run | NOT EXECUTED on QA host (no local PG); check 2 artifact-inspected only |
| Astra | prior F22 service-access failures only; no Astra verdict; Daybreak/Astra not contacted |
| Material findings | none |

This ACCEPT is HOLD-package integrity only. It is **not** LOCAL APPLICATION COMPLETE, **not** LOCAL CANDIDATE READY, and not hosted authorization.
Remaining HOLD: `F23_FINGERPRINT_MISMATCH`. F22 fault-injection HOLD `F22_LOCAL_CLI_ATOMIC_ROLLBACK_REPAIR_REFUSED` remains separate.
