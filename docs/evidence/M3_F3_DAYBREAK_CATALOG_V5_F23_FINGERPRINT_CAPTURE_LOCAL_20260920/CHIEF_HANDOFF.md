# Chief handoff — authorized local fingerprint capture

**Current (CAPTURE_ATTEMPT_2):** [CAPTURE_ATTEMPT_2/CHIEF_HANDOFF.md](CAPTURE_ATTEMPT_2/CHIEF_HANDOFF.md) — SUPERUSER fixture; six applies; `F23_FINGERPRINT_MISMATCH` with field-level diffs. Both authorized captures are **used**.

The remainder of this file is the **unchanged attempt 1** floor-HOLD record.

---

# Attempt 1 — CREATEDB-only floor HOLD (executed; preserved)

| Field | Value |
|-------|-------|
| Owner | Grok Bot Chief packages for Jude. Jude remains owner of the two contract decisions. |
| Intended outcome | Actual phase-matched fingerprint differences sufficient to decide the smallest fixture correction |
| Permitted scope | Temporary local PG17 + CLI 2.117.0 setup (Jude-authorized for this task only) + one normal local capture + evidence/status + cleanup |
| Result | **Capture executed once.** Remaining hold `F3_DBPUSH_FLOOR_HOLD`. Six migrations **not** applied. No phase-matched catalog diffs. One authorized complete capture is **used**. No automatic rerun. |
| Review / run budget | One complete local capture — **used**. No automatic rerun. Ordinary documentation: zero adversarial rounds. Next Daybreak closeout remains one consolidated review of fingerprint + repair **after** field-level diffs exist or Jude changes the requirement. |
| Stop | Captured results returned. Do not contact Daybreak/Astra. |
| Rules | [AGENTS.md](../../../AGENTS.md) |
| Current status | [docs/BUILD_STATUS.md](../../../BUILD_STATUS.md) |

**HOLD: F3_DBPUSH_FLOOR_HOLD** (this capture)  
**HOLD: F23_FINGERPRINT_MISMATCH** (inherited historical F23; **not recaptured**)  
**HOLD: F22_LOCAL_CLI_ATOMIC_ROLLBACK_REPAIR_REFUSED** (mandatory positive repair still unexercised)  
**LOCAL APPLICATION COMPLETE:** false  
DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN  
PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE  
DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT

## Full commit pins

| Role | SHA / value |
|------|-------------|
| FUNCTIONAL_TIP | `77fd61dbf51652acabec0093d2a8549524b2dd75` |
| Retention-helper commit | `8346c856b7ddbb75b7e4dbaf57a42fc14e6d8f78` |
| Pin at capture start | `122dccf4a1c9966adca67e79ca10507b929dfde2` |
| Helper blob at that checkout | `4099edd183a3ec0b73302b80ac7fd0f126d6f6de` |
| Helper path | `scripts/prove-f3-qualification-reset-local.mjs` |
| Helper blob after this addendum | still `4099edd183a3ec0b73302b80ac7fd0f126d6f6de` (executable unchanged) |
| F23 historical package | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_NORMAL_APPLICATION_LOCAL_20260920/` |
| Closeout decision inputs | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_CLOSEOUT_DECISION_INPUTS_20260920/` |
| Repair input (linked, not re-run) | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_CLOSEOUT_DECISION_INPUTS_20260920/REPAIR_FEASIBILITY.md` |
| This addendum | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_FINGERPRINT_CAPTURE_LOCAL_20260920/` |
| Shared branch | `feat/m3-f3-01-05-forward-foundation-9b17` |
| Authoritative PR | #84 OPEN DRAFT UNMERGED DAYBREAK HOLD |
| Aligned PRs | #85 / #86 (same title, same head) |

## Capture results summary

| Item | Result |
|------|--------|
| Pre-DB syntax/import | pass (helper blob unchanged; `node --check` + ESM import + frozen oracle import reused/reconfirmed) |
| In-memory `--fingerprint-diff-out` write path | pass (synthetic only; [write-path-check/](write-path-check/)) |
| CLI version | `2.117.0` (`matchesPin=true`) |
| PostgreSQL server version | `17.11 (Ubuntu 17.11-1.pgdg24.04+2)` (`server_version_num` `170011`) |
| Client | `psql (PostgreSQL) 17.11 (Ubuntu 17.11-1.pgdg24.04+2)` |
| Operation counts | calibrationProbes=`null`, migrationApplications=`0`, retries=`0`, repairs=`0`, historyInjects=`0` |
| Six migrations | **not applied** — all six identities missing |
| Differing fields | **none observed** (sequence empty) |
| Expected/observed ACL/owner tuples | **not compared** — apply not started; see [DIFFERENCE_TABLE.md](DIFFERENCE_TABLE.md) |
| Six credited F23 applies | unchanged historical credit; this run did not retry them |

**This is not an environment-blocker record.** The authorized command completed against local PG 17 + CLI 2.117.0. The useful result is `F3_DBPUSH_FLOOR_HOLD`.

## Proposed correction (smallest)

**Proposal only — not authorized — do not apply.**

Not a fingerprint map. Recreate local `ubuntu` as `SUPERUSER LOGIN` (F18 documented recipe) so the committed stub-core floor can `CREATE ROLE anon/authenticated/service_role`. This host used `CREATEDB` only. Security: SUPERUSER is a local-cluster privilege for the documented floor; it is not hosted identity proof and must not hide GRANT/REVOKE, SECURITY DEFINER owner, or RLS drift. Details: [DIFFERENCE_TABLE.md](DIFFERENCE_TABLE.md).

Do not waive equality. Do not patch frozen SQL.

## Remaining decisions for Daybreak Blue consolidated closeout

Phase-matched fingerprint values **still do not exist**. Do not start the consolidated fingerprint+repair closeout on this addendum’s empty `files` array. Do not contact Daybreak/Astra.

1. **Fingerprint** — equality vs explicit founder waiver, using a future capture only after a founder-authorized fixture-privilege decision. This addendum does not supply field values.
2. **Repair** — authorize the existing CLI 2.117.0 `migration repair <filename version> --status applied` procedure after authentic `POST_COMMIT_HISTORY_FAILURE`, **or** amend the contract so post-commit repair is not mandatory for local qualification. Input: [REPAIR_FEASIBILITY.md](../M3_F3_DAYBREAK_CATALOG_V5_F23_CLOSEOUT_DECISION_INPUTS_20260920/REPAIR_FEASIBILITY.md). Do not execute repair here.

#84 remains authoritative; #85/#86 aligned at the shared head; titles remain DAYBREAK HOLD. OPEN DRAFT UNMERGED. No new sibling PR.
