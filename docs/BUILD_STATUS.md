# Current status — VillageClaq F3 Daybreak qualification

**Status:** DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN  
**Floor (verbatim):** DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT  
**This file is the current remainder record.** Historical packages are linked, not copied.

Working rules: [AGENTS.md](../AGENTS.md). Product conventions: [CLAUDE.md](../CLAUDE.md).  
Approved local comparison contract: [LOCAL_FINGERPRINT_COMPARISON_PROFILE_V1](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_LOCAL_ACCEPTANCE_CONTRACT_20260920/LOCAL_FINGERPRINT_COMPARISON_PROFILE_V1.md).  
Repair amendment: [REPAIR_AMENDMENT.md](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_LOCAL_ACCEPTANCE_CONTRACT_20260920/REPAIR_AMENDMENT.md).  
Authorized local-capture record: [docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_FINGERPRINT_CAPTURE_LOCAL_20260920/CAPTURE_ATTEMPT_2/CHIEF_HANDOFF.md](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_FINGERPRINT_CAPTURE_LOCAL_20260920/CAPTURE_ATTEMPT_2/CHIEF_HANDOFF.md).

## Authorization (do not collapse these)

| Action | Status |
|--------|--------|
| **Local fingerprint comparison profile `LOCAL_FINGERPRINT_COMPARISON_PROFILE_V1`** | **Approved for local catalog comparison only.** Oracle `postgres` → local `ubuntu` in owner, grantor, and owner-self grantee only. Seven non-grantable `service_role` omissions on exactly `public.financial_ledger_epochs`, bound to sealed envelope `eb58900b492b95371decfdab86b3786afc2c8089c6b0a117497f9e0b22c41a2a`. Does **not** map `authenticated` or `service_role`. Does **not** authorize repair or hosted equality. |
| **Local post-commit filename-version repair** | **Not mandatory** for local qualification. Atomic/pre-commit refusal remains fail-closed (`repairCalls=0`). Historical refusal not rerun. |
| **Local fingerprint capture attempt 1** (CREATEDB-only `ubuntu`; one normal-application prove) | **Used.** Remaining hold `F3_DBPUSH_FLOOR_HOLD`. Six migrations not applied. Empty `files`. |
| **Local fingerprint capture attempt 2** (one additional prove; `ubuntu` `SUPERUSER LOGIN`) | **Used.** Remaining raw hold `F23_FINGERPRINT_MISMATCH`. Six migrations applied. Field-level diffs retained. Offline profile reassessment is **derived**, not a fresh PostgreSQL execution. |
| **Temporary PGDG PostgreSQL 17 + official CLI 2.117.0 install** | **Authorized for this fixture restore.** Isolated this-run `17/main`; cluster stopped and dropped after capture. Recipe: [SETUP_RECIPE.md](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_FINGERPRINT_CAPTURE_LOCAL_20260920/SETUP_RECIPE.md). |
| **`ubuntu` `SUPERUSER LOGIN`** | **Authorized for attempt 2 only** (F18 recipe). Local-cluster privilege. Not restricted-role authorization or RLS proof. |
| **Hosted reset / hosted qualification / hosted or local repair experiments** | **Not authorized.** PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE. |
| **Merge / deploy / `origin/main` / F3-06 / Daybreak–Astra contact** | **Not authorized.** |

## Authoritative build-plan reference — missing

No repository file is identified as the approved product build plan with explicit acceptance criteria for the remaining F3 outcome. This record does **not** invent one and does **not** reconstruct a roadmap from tests.

Closest linked artifacts (none of these is that missing plan):

| Artifact | Role |
|----------|------|
| [F21 preserve-baseline contract](evidence/M3_F3_DAYBREAK_CATALOG_V5_F21_PRESERVE_BASELINE_CONTRACT_20260919/) | Accepted contract for the preserve-`btree_gist` baseline |
| [F23 local acceptance contract](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_LOCAL_ACCEPTANCE_CONTRACT_20260920/) | Approved local comparison profile + local repair amendment |
| [F23 proposed hosted requal plan](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_NORMAL_APPLICATION_LOCAL_20260920/PROPOSED_HOSTED_REQUAL_PLAN.md) | **PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE** |
| [F23 historical package](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_NORMAL_APPLICATION_LOCAL_20260920/) | Authoritative local-application HOLD package |
| [F23 capture 2026-09-20](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_FINGERPRINT_CAPTURE_LOCAL_20260920/) | Attempt 1 floor HOLD (preserved) + attempt 2 field diffs |

## Pins

| Role | Value |
|------|-------|
| FUNCTIONAL_TIP | `66be2b4797515975d737a0fd66656bc4c0de2145` |
| Start of this contract implementation | `b8bde21770b347b5dd6f0c4cc5f4fd3ae0f267ae` |
| F23 evidence / prior #84 head before this work | `a41549e9f5463f02993be6e5e72ee8bde4852d80` |
| Process/status closeout | `98c8c3d2d2164defef95b715e8f3258bad4e819d` |
| Fingerprint-retention executable | `8346c856b7ddbb75b7e4dbaf57a42fc14e6d8f78` |
| Helper blob at capture | `4099edd183a3ec0b73302b80ac7fd0f126d6f6de` |
| Authoritative PR | [#84](https://github.com/gatekipa/villageclaq/pull/84) OPEN DRAFT UNMERGED, title DAYBREAK HOLD |
| Aligned PRs | #85 / #86 (same title, same head) |
| Non-authoritative | #126 / #127 |
| Shared branch | `feat/m3-f3-01-05-forward-foundation-9b17` |

## Accepted work and evidence

Local F23 normal application (historical package; HOLD-package integrity accepted; **not** LOCAL APPLICATION COMPLETE):

- Six frozen migrations applied with exact identities: `20260913173000` / `f3_bounded_financial_epoch_foundation` … `20260913173005` / `f3_05_opening_cash_command`
- `operationCounts`: calibrationProbes=6, migrationApplications=6, retries=0, repairs=0, historyInjects=0
- Membership sets preserved: 264 `deptype=e` tuples; exact OID-bearing sets equal before reset / after reset / after qualification (counts alone insufficient)
- Fault-injection (separate database): `PRE_COMMIT_OR_ATOMIC_ROLLBACK`; repair-safety gate refused; `repairCalls=0` — correct atomic-rollback repair refusal (`F22_LOCAL_CLI_ATOMIC_ROLLBACK_REPAIR_REFUSED`). **Carried forward; not rerun.**
- Independent QA: VillageClaq QA — **F23 HOLD PACKAGE ACCEPT** (HOLD-package integrity only). This contract's QA slot is **empty**.
- Combined `completeThrough00123 OR documentedAtomicRollbackHold` acceptance remains rejected
- Six earlier successful migration applications remain credited.

Attempt 2 raw capture remains `F23_FINGERPRINT_MISMATCH`. Offline derived reassessment of that capture is **ACCEPTED** under `LOCAL_FINGERPRINT_COMPARISON_PROFILE_V1`. Raw identities and the original mismatch are preserved.

Focused offline tests: 7/7 PASS (`node --test --test-name-pattern='F23 local|F23 hosted' scripts/test-f3-qualification-reset.mjs`). No database transport. No full prove.

Evidence: [F23 package](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_NORMAL_APPLICATION_LOCAL_20260920/), [F22 package](evidence/M3_F3_DAYBREAK_CATALOG_V5_F22_PRESERVE_BASELINE_QUAL_GATE_LOCAL_20260919/), [capture package](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_FINGERPRINT_CAPTURE_LOCAL_20260920/), [attempt 2](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_FINGERPRINT_CAPTURE_LOCAL_20260920/CAPTURE_ATTEMPT_2/), [local acceptance contract](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_LOCAL_ACCEPTANCE_CONTRACT_20260920/).

## Incomplete requirements (why they matter)

1. **Hosted raw fingerprint equality** — local profile acceptance does not satisfy hosted equality. QUALIFICATION PASS / `localApplicationComplete` remain false. Frozen SQL must not be patched. See [attempt 2 DIFFERENCE_TABLE](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_FINGERPRINT_CAPTURE_LOCAL_20260920/CAPTURE_ATTEMPT_2/DIFFERENCE_TABLE.md).
2. **Hosted positive repair** — post-commit filename-version repair is not mandatory for local qualification. Before promotion beyond DAYBREAK HOLD, a separately authorized hosted qualification must demonstrate current-candidate `POST_COMMIT_HISTORY_FAILURE`, surviving intended objects, absent exact filename history, pass repair-safety and **raw** fingerprint gates, perform CLI 2.117.0 filename-version repair, and authenticate resulting history/catalog state. See [repair amendment](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_LOCAL_ACCEPTANCE_CONTRACT_20260920/REPAIR_AMENDMENT.md). **Do not execute repair.**
3. **F3-06** — separate and unstarted.

## Local versus hosted / production

| Surface | Status |
|---------|--------|
| Local profile | ACCEPTED under `LOCAL_FINGERPRINT_COMPARISON_PROFILE_V1` (derived from retained capture) |
| Raw local capture | `F23_FINGERPRINT_MISMATCH` unchanged |
| Hosted disposable / production | **Not contacted.** DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN |
| Production | Forever denied from this work |
| Astra | UNAVAILABLE — NO VERDICT |

## Owner, next action, remaining review budget

| Field | Value |
|-------|-------|
| Owner | Jude Anyere / Chief — request the one independent VillageClaq QA against functional tip `66be2b4797515975d737a0fd66656bc4c0de2145`. Hosted requalification remains a separate authorization. |
| Next bounded action | Independent VillageClaq QA of this local contract + implementation. Do not run hosted contact, repair, merge, deploy, or F3-06. |
| Permitted scope | Review this contract package and functional tip. No hosted/disposable/production contact. No merge. No deploy. No F3-06. |
| Remaining acceptance | Hosted raw fingerprint equality; hosted POST_COMMIT repair after raw/repair-safety gates; hosted requalification |
| Review / run budget | Focused offline work used. One independent QA remains for Chief to request. Renaming F-numbers does not restart the budget. |
| Stop | Functional tip frozen. QA slot empty. No automatic further cycle. |

## Exact remaining hosted gate

Separately authorized hosted qualification must: demonstrate current-candidate `POST_COMMIT_HISTORY_FAILURE`; keep surviving intended objects; show absent exact filename history; pass existing repair-safety and **raw** fingerprint gates; perform supported CLI 2.117.0 filename-version repair; authenticate resulting history/catalog state.

**PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE.**

## One small nonblocking backlog

- Add a single authoritative build-plan document (location still missing) so later outcomes can cite acceptance criteria without reconstructing them from tests or evidence packages.

DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN  
Any future execution procedure remains: PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE  
DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT
