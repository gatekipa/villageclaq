# F23 authorized local fingerprint capture — 2026-09-20

Addendum only. Historical F23 package is unchanged:

`docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_NORMAL_APPLICATION_LOCAL_20260920/`

## Attempts

| Attempt | Result | Path |
|---------|--------|------|
| 1 (preserved) | `F3_DBPUSH_FLOOR_HOLD`; CREATEDB-only `ubuntu`; six applies not started; `files: []` | package root files below |
| 2 (appended) | `F23_FINGERPRINT_MISMATCH`; `ubuntu` `SUPERUSER LOGIN`; six applies; field diffs retained | [CAPTURE_ATTEMPT_2/](CAPTURE_ATTEMPT_2/) |

Current handoff: [CAPTURE_ATTEMPT_2/CHIEF_HANDOFF.md](CAPTURE_ATTEMPT_2/CHIEF_HANDOFF.md).

### Attempt 1 files (do not overwrite)

| File | Role |
|------|------|
| [CHIEF_HANDOFF.md](CHIEF_HANDOFF.md) | Attempt 1 record; pointer to attempt 2 at top |
| [CAPTURE_PROVENANCE.md](CAPTURE_PROVENANCE.md) | Checkout, helper blob, CREATEDB-only role, one prove run |
| [DIFFERENCE_TABLE.md](DIFFERENCE_TABLE.md) | `F3_DBPUSH_FLOOR_HOLD`; no field diffs |
| [fingerprint-diff.json](fingerprint-diff.json) | `files: []` because sequence empty |
| [helper-summary.json](helper-summary.json) | Sanitized prove extract (membership tuples omitted) |
| [SETUP_RECIPE.md](SETUP_RECIPE.md) | PG17 + CLI 2.117.0 + **verified SUPERUSER LOGIN prerequisite** |
| [CLEANUP.md](CLEANUP.md) | Attempt 1 cleanup plus appended attempt 2 note |
| [write-path-check/](write-path-check/) | In-memory write-path only — not F23 observed values |

Repair input (linked, not re-executed): [REPAIR_FEASIBILITY.md](../M3_F3_DAYBREAK_CATALOG_V5_F23_CLOSEOUT_DECISION_INPUTS_20260920/REPAIR_FEASIBILITY.md).

**HOLD: F23_FINGERPRINT_MISMATCH** (attempt 2)  
**HOLD: F3_DBPUSH_FLOOR_HOLD** (attempt 1; preserved)  
DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN  
DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT
