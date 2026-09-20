# Current status — VillageClaq F3 Daybreak qualification

**Status:** DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN  
**Floor (verbatim):** DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT  
**This file is the current remainder record.** Historical packages are linked, not copied.

Working rules: [AGENTS.md](../AGENTS.md). Product conventions: [CLAUDE.md](../CLAUDE.md).  
F23 closeout decision inputs: [docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_CLOSEOUT_DECISION_INPUTS_20260920/CHIEF_HANDOFF.md](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_CLOSEOUT_DECISION_INPUTS_20260920/CHIEF_HANDOFF.md).  
Authorized local-capture record: [docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_FINGERPRINT_CAPTURE_LOCAL_20260920/CAPTURE_ATTEMPT_2/CHIEF_HANDOFF.md](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_FINGERPRINT_CAPTURE_LOCAL_20260920/CAPTURE_ATTEMPT_2/CHIEF_HANDOFF.md).

## Authorization (do not collapse these)

| Action | Status |
|--------|--------|
| **Local fingerprint capture attempt 1** (CREATEDB-only `ubuntu`; one normal-application prove) | **Used.** Remaining hold `F3_DBPUSH_FLOOR_HOLD`. Six migrations not applied. Empty `files`. |
| **Local fingerprint capture attempt 2** (one additional prove; `ubuntu` `SUPERUSER LOGIN`) | **Used.** Remaining hold `F23_FINGERPRINT_MISMATCH`. Six migrations applied. Field-level diffs retained. **No automatic rerun.** |
| **Temporary PGDG PostgreSQL 17 + official CLI 2.117.0 install** | **Authorized for this fixture restore.** Isolated this-run `17/main`; cluster stopped and dropped after capture. Recipe: [SETUP_RECIPE.md](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_FINGERPRINT_CAPTURE_LOCAL_20260920/SETUP_RECIPE.md). |
| **`ubuntu` `SUPERUSER LOGIN`** | **Authorized for attempt 2 only** (F18 recipe). Local-cluster privilege. Not restricted-role authorization or RLS proof. |
| **Fingerprint mapping or waiver** | **Not approved.** Do not align roles, alter grants, normalize differences, or change fingerprint acceptance. |
| **Hosted reset / hosted qualification / hosted or local repair experiments** | **Not authorized.** PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE. |
| **Merge / deploy / `origin/main` / F3-06 / Daybreak–Astra contact** | **Not authorized.** |

Owner remains **Jude Anyere** for the two contract decisions (fingerprint alignment vs mandatory equality; authorize existing CLI repair **or** amend the contract). Phase-matched fingerprint values **now exist** in [CAPTURE_ATTEMPT_2](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_FINGERPRINT_CAPTURE_LOCAL_20260920/CAPTURE_ATTEMPT_2/). Carry [REPAIR_FEASIBILITY.md](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_CLOSEOUT_DECISION_INPUTS_20260920/REPAIR_FEASIBILITY.md) forward unchanged — do not run repair experiments or amend the repair requirement here.

## Authoritative build-plan reference — missing

No repository file is identified as the approved product build plan with explicit acceptance criteria for the remaining F3 outcome. This record does **not** invent one and does **not** reconstruct a roadmap from tests.

Closest linked artifacts (none of these is that missing plan):

| Artifact | Role |
|----------|------|
| [F21 preserve-baseline contract](evidence/M3_F3_DAYBREAK_CATALOG_V5_F21_PRESERVE_BASELINE_CONTRACT_20260919/) | Accepted contract for the preserve-`btree_gist` baseline |
| [F23 proposed hosted requal plan](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_NORMAL_APPLICATION_LOCAL_20260920/PROPOSED_HOSTED_REQUAL_PLAN.md) | **PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE** |
| [F23 historical package](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_NORMAL_APPLICATION_LOCAL_20260920/) | Authoritative local-application HOLD package |
| [F23 capture 2026-09-20](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_FINGERPRINT_CAPTURE_LOCAL_20260920/) | Attempt 1 floor HOLD (preserved) + attempt 2 field diffs |

## Pins

| Role | Value |
|------|-------|
| FUNCTIONAL_TIP | `77fd61dbf51652acabec0093d2a8549524b2dd75` |
| F23 evidence / prior #84 head | `a41549e9f5463f02993be6e5e72ee8bde4852d80` |
| Process/status closeout | `98c8c3d2d2164defef95b715e8f3258bad4e819d` |
| Fingerprint-retention executable | `8346c856b7ddbb75b7e4dbaf57a42fc14e6d8f78` |
| Documentation/evidence head at attempt 2 start | `f65d1cec04450a017deec700d184aa9e82d4c6e7` |
| Helper blob (unchanged) | `4099edd183a3ec0b73302b80ac7fd0f126d6f6de` (`scripts/prove-f3-qualification-reset-local.mjs`) |
| Authoritative PR | [#84](https://github.com/gatekipa/villageclaq/pull/84) OPEN DRAFT UNMERGED, title DAYBREAK HOLD |
| Aligned PRs | #85 / #86 (same title, same head) |
| Non-authoritative | #126 / #127 |
| Shared branch | `feat/m3-f3-01-05-forward-foundation-9b17` |

## Accepted work and evidence

Local F23 normal application (historical package; HOLD-package integrity accepted; **not** LOCAL APPLICATION COMPLETE):

- Six frozen migrations applied with exact identities: `20260913173000` / `f3_bounded_financial_epoch_foundation` … `20260913173005` / `f3_05_opening_cash_command`
- `operationCounts`: calibrationProbes=6, migrationApplications=6, retries=0, repairs=0, historyInjects=0
- Membership sets preserved: 264 `deptype=e` tuples; exact OID-bearing sets equal before reset / after reset / after qualification (counts alone insufficient)
- Fault-injection (separate database): `PRE_COMMIT_OR_ATOMIC_ROLLBACK`; repair-safety gate refused; `repairCalls=0` — correct atomic-rollback repair refusal (`F22_LOCAL_CLI_ATOMIC_ROLLBACK_REPAIR_REFUSED`)
- Independent QA: VillageClaq QA — **F23 HOLD PACKAGE ACCEPT** (HOLD-package integrity only)
- Combined `completeThrough00123 OR documentedAtomicRollbackHold` acceptance remains rejected
- Six earlier successful migration applications remain credited.

Attempt 1 (same helper blob; CREATEDB-only `ubuntu`):

- Preserve-reset + pre-floor `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1`
- `F3_DBPUSH_FLOOR_HOLD`; `floorInstalled=false`; `dbPushCalls=0`; `migrationApplications=0`
- `files=[]` because `qualify.sequence` was empty — observed empty set, not equality

Attempt 2 (same helper blob; `ubuntu` `SUPERUSER LOGIN`):

- Preserve-reset + pre-floor `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1`
- Floor installed; pre-db-push gates ok
- Six identities applied; `operationCounts` calibrationProbes=6, migrationApplications=6, retries=0, repairs=0, historyInjects=0
- Membership 264 exact-set preserved
- `F23_FINGERPRINT_MISMATCH`; 347 non-ACL pairs are owner `postgres`→`ubuntu`; ACL remainder is `service_role` DML on `public.financial_ledger_epochs`

Evidence: [F23 package](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_NORMAL_APPLICATION_LOCAL_20260920/), [F22 package](evidence/M3_F3_DAYBREAK_CATALOG_V5_F22_PRESERVE_BASELINE_QUAL_GATE_LOCAL_20260919/), [capture package](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_FINGERPRINT_CAPTURE_LOCAL_20260920/), [attempt 2](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_FINGERPRINT_CAPTURE_LOCAL_20260920/CAPTURE_ATTEMPT_2/).

## Incomplete requirements (why they matter)

1. **Fingerprint qualification** — recaptured as `F23_FINGERPRINT_MISMATCH` with field values. QUALIFICATION PASS / `localApplicationComplete` remain false. Frozen SQL must not be patched to manufacture a match. Mapping and the `service_role` DML remainder are **proposals only**. See [attempt 2 DIFFERENCE_TABLE](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_FINGERPRINT_CAPTURE_LOCAL_20260920/CAPTURE_ATTEMPT_2/DIFFERENCE_TABLE.md).
2. **Mandatory positive repair** — post-commit filename-version repair after objects remain is unexercised. Local current inject was classified atomic rollback and correctly refused repair. The approved CLI path can still produce the committed-objects / missing-history state (in-file `COMMIT` then CLI history `INSERT`). See [repair feasibility](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_CLOSEOUT_DECISION_INPUTS_20260920/REPAIR_FEASIBILITY.md). **Do not re-execute repair.**
3. **F3-06** — separate and unstarted.

## Local versus hosted / production

| Surface | Status |
|---------|--------|
| Prior F23 prove host | PostgreSQL 17.11 + CLI 2.117.0; six applies credited; field diffs not retained; `ubuntu` was SUPERUSER (F18 recipe) |
| Attempt 1 host (`bld-20260920-f00b54bc-98db-45ae-b093-2c8e3399ff71`) | Temporary PGDG 17.11 + CLI 2.117.0. `ubuntu` `LOGIN CREATEDB` only. `F3_DBPUSH_FLOOR_HOLD`. Cluster dropped. |
| Attempt 2 host (same environment / new VM) | Packages reinstalled. Isolated this-run `17/main`. `ubuntu` `SUPERUSER LOGIN`. One prove: `F23_FINGERPRINT_MISMATCH` after six applies. Cluster dropped. |
| Hosted disposable / production | **Not contacted.** DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN |
| Production | Forever denied from this work |

## Owner, next action, remaining review budget

| Field | Value |
|-------|-------|
| Owner | Jude Anyere — two remaining contract decisions (fingerprint alignment; positive-repair authorization or amendment). Field-level diffs exist; mapping/waiver still not approved. |
| Next bounded action | Review attempt-2 differences (owner `postgres`↔`ubuntu` plus `service_role` DML remainder on `public.financial_ledger_epochs`). Do not rerun capture. Do not execute mapping or grants. |
| Permitted scope | Review this executed-capture addendum plus closeout decision inputs. No hosted/disposable/production contact. No merge. No deploy. No F3-06. No automatic further capture. |
| Remaining acceptance | Fingerprint equality or an explicit founder waiver; authentic post-commit repair or an explicit founder amendment |
| Review / run budget | Ordinary documentation: **zero** adversarial rounds. Both authorized complete local captures are **used**. Next Daybreak closeout of the two remaining issues is one risky-work round against the existing budget — renaming F-numbers does not restart it. |
| Stop | Captured results returned. No further prove. No Daybreak/Astra contact. |

## Smallest proposed fixture correction (not applied)

1. Reviewed compare-side map of catalog `postgres`↔`ubuntu` for owner/grantee/grantor after object identity matches. Local SUPERUSER is not hosted identity proof and is not a fingerprint waiver.
2. Mapping (1) does **not** absorb `service_role` DELETE/INSERT/MAINTAIN/REFERENCES/TRIGGER/TRUNCATE/UPDATE on `public.financial_ledger_epochs`. Do not grant-align that remainder.

**PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE.**

## One small nonblocking backlog

- Add a single authoritative build-plan document (location still missing) so later outcomes can cite acceptance criteria without reconstructing them from tests or evidence packages.

DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN  
Any future execution procedure remains: PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE  
DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT
