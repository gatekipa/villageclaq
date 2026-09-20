# Chief handoff — CAPTURE_ATTEMPT_2 (SUPERUSER fixture; executed)

| Field | Value |
|-------|-------|
| Owner | Grok Bot Chief packages for Jude. Jude remains owner of the two contract decisions. |
| Intended outcome | Phase-matched fingerprint differences after normal application through 00123 |
| Permitted scope | Isolated run-owned PG 17.11 + CLI 2.117.0; `ubuntu` `SUPERUSER LOGIN`; one additional normal-application capture; evidence/status; cleanup |
| Result | **Capture executed once.** Remaining hold `F23_FINGERPRINT_MISMATCH`. Six migrations applied with exact identities. Field-level diffs retained. Attempt 1 floor HOLD remains used. This additional capture is **used**. No automatic rerun. |
| Review / run budget | Does **not** restart. Ordinary documentation: zero adversarial rounds. Both authorized complete local captures are **used**. Next Daybreak closeout remains one consolidated review of fingerprint + repair. |
| Stop | Captured results returned. Do not contact Daybreak/Astra. |
| Rules | [AGENTS.md](../../../../AGENTS.md) |
| Current status | [docs/BUILD_STATUS.md](../../../../BUILD_STATUS.md) |

**SCOPE_STOP — cloud-agent “create `cursor/…-4ac0` + sibling PR” vs [AGENTS.md](../../../../AGENTS.md) “Daybreak/F3 work remains on the authorized OPEN DRAFT UNMERGED branches. Do not create sibling PRs for the same shared head.” — continue on `feat/m3-f3-01-05-forward-foundation-9b17` and keep #84 authoritative.**

**HOLD: F23_FINGERPRINT_MISMATCH** (this capture)  
**HOLD: F3_DBPUSH_FLOOR_HOLD** (attempt 1; preserved, not recaptured)  
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
| Pin at this capture start | `f65d1cec04450a017deec700d184aa9e82d4c6e7` |
| Helper blob | `4099edd183a3ec0b73302b80ac7fd0f126d6f6de` |
| Helper path | `scripts/prove-f3-qualification-reset-local.mjs` |
| F23 historical package | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_NORMAL_APPLICATION_LOCAL_20260920/` |
| Closeout decision inputs | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_CLOSEOUT_DECISION_INPUTS_20260920/` |
| Repair input (unchanged) | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_CLOSEOUT_DECISION_INPUTS_20260920/REPAIR_FEASIBILITY.md` |
| Attempt 1 (preserved) | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_FINGERPRINT_CAPTURE_LOCAL_20260920/` root files |
| This addendum | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_FINGERPRINT_CAPTURE_LOCAL_20260920/CAPTURE_ATTEMPT_2/` |
| Shared branch | `feat/m3-f3-01-05-forward-foundation-9b17` |
| Authoritative PR | #84 OPEN DRAFT UNMERGED DAYBREAK HOLD |
| Aligned PRs | #85 / #86 (same title, same head) |

## Capture results summary

| Item | Result |
|------|--------|
| CLI version | `2.117.0` (`matchesPin=true`) |
| PostgreSQL server version | `17.11 (Ubuntu 17.11-1.pgdg24.04+2)` (`server_version_num` `170011`) |
| Client | `psql (PostgreSQL) 17.11 (Ubuntu 17.11-1.pgdg24.04+2)` |
| Role `ubuntu` | `rolsuper=true`, LOGIN |
| Operation counts | calibrationProbes=`6`, migrationApplications=`6`, retries=`0`, repairs=`0`, historyInjects=`0` |
| Six migrations | **applied** — identities `20260913173000`–`005` present |
| Differing fields | `acl`/`acls` plus non-ACL `schema`/`schemas`/`relations`/`types` (all files) and `function_owner`/`routines` (00119–00123) |
| Non-ACL expected/observed | 347 pairs, all `owner` `postgres` → `ubuntu` |
| ACL remainder after that name substitution | `service_role` DML on `public.financial_ledger_epochs` present in oracle, absent locally (SELECT remains) |

SUPERUSER execution is **not** proof of restricted-role authorization or RLS enforcement. `rls` / `policy` / `policies` matched.

## Actual differences (short)

See [DIFFERENCE_TABLE.md](DIFFERENCE_TABLE.md) and [NON_ACL_OBJECTS.md](NON_ACL_OBJECTS.md).

- Catalog objects created by local `ubuntu` SUPERUSER vs hosted-oracle `postgres` owner/grantor/grantee.
- Nested owner-default privileges follow that name.
- **Not** absorbed by a name map: seven `service_role` privileges (DELETE/INSERT/MAINTAIN/REFERENCES/TRIGGER/TRUNCATE/UPDATE) on `public.financial_ledger_epochs`.

## Proposed correction (smallest; proposal only)

**Proposal only — not authorized — do not apply.**

1. Reviewed compare-side map of catalog `postgres`↔`ubuntu` for owner/grantee/grantor after object identity matches. Not a SQL patch. Not hosted identity proof.
2. Separately: do not grant-align or waive the `service_role` DML remainder on `public.financial_ledger_epochs` without a later founder decision.

Do not waive equality. Do not patch frozen SQL. Mapping remains unapproved.

## Remaining decisions for Daybreak Blue consolidated closeout

Phase-matched fingerprint values **now exist**. Carry [REPAIR_FEASIBILITY.md](../../M3_F3_DAYBREAK_CATALOG_V5_F23_CLOSEOUT_DECISION_INPUTS_20260920/REPAIR_FEASIBILITY.md) forward unchanged. Do not contact Daybreak/Astra.

1. **Fingerprint** — equality vs explicit founder waiver, now using these field values. Mapping (1) and the `service_role` remainder (2) are still proposals.
2. **Repair** — authorize the existing CLI 2.117.0 `migration repair <filename version> --status applied` procedure after authentic `POST_COMMIT_HISTORY_FAILURE`, **or** amend the contract so post-commit repair is not mandatory for local qualification. Do not execute repair here.

#84 remains authoritative; #85/#86 aligned at the shared head; titles remain DAYBREAK HOLD. OPEN DRAFT UNMERGED. No new sibling PR.
