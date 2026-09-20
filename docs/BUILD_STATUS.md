# Current status — VillageClaq F3 Daybreak qualification

**Status:** DAYBREAK HOLD — HOSTED ATTEMPT_2 STOPPED AT RESET (`F13_RESET_SQL_FAILED`; QUALIFICATION NOT STARTED). Local F24 dependency-order correction proved. Proposed hosted plan rebound to the new candidate. **No third hosted attempt.**  
**Floor (verbatim):** DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT  
**This file is the current remainder record.** Historical packages are linked, not copied.

Working rules: [AGENTS.md](../AGENTS.md). Product conventions: [CLAUDE.md](../CLAUDE.md).  
Approved local comparison contract: [LOCAL_FINGERPRINT_COMPARISON_PROFILE_V1](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_LOCAL_ACCEPTANCE_CONTRACT_20260920/LOCAL_FINGERPRINT_COMPARISON_PROFILE_V1.md).  
Repair amendment: [REPAIR_AMENDMENT.md](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_LOCAL_ACCEPTANCE_CONTRACT_20260920/REPAIR_AMENDMENT.md).  
**Current proposed hosted plan:** [F24 rebound proposed hosted requal plan 2026-09-20](evidence/M3_F3_DAYBREAK_CATALOG_V5_F24_PROPOSED_HOSTED_REQUAL_PLAN_20260920/PROPOSED_HOSTED_REQUAL_PLAN.md) — **PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE.** Bound to functional tip `874d7c63…`. Old ATTEMPT_2 auth cannot authorize these bytes.  
Consumed ATTEMPT_2 plan (bytes preserved, not mutated): [F23 proposed plan](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_PROPOSED_HOSTED_REQUAL_PLAN_20260920/PROPOSED_HOSTED_REQUAL_PLAN.md) SHA-256 `bf9ca7b6c408d72b9f1231f223628a41e77fe275132acf273cd5386dd8c3b138`.  
**ATTEMPT_1 2026-09-20 ET:** reset stopped at missing `psql` (see [HOSTED_REQUAL_20260920](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_HOSTED_REQUAL_20260920/SUMMARY.md)).  
**ATTEMPT_2 (fresh auth; consumed):** readiness READY; one reset → `F13_RESET_SQL_FAILED` (notification RLS policies block `has_group_permission` DROP RESTRICT; CASCADE forbidden); qual **NOT RUN**. See [HOSTED_REQUAL_ATTEMPT_2_20260920](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_HOSTED_REQUAL_ATTEMPT_2_20260920/SUMMARY.md).  
**F24 local correction:** [F24 local proof](evidence/M3_F3_DAYBREAK_CATALOG_V5_F24_DEPENDENCY_ORDER_LOCAL_20260920/SUMMARY.md).

## Authorization (do not collapse these)

| Action | Status |
|--------|--------|
| **Local fingerprint comparison profile `LOCAL_FINGERPRINT_COMPARISON_PROFILE_V1`** | **Approved for local catalog comparison only.** Does **not** authorize repair or hosted equality. |
| **Local post-commit filename-version repair** | **Not mandatory** for local qualification. |
| **Local fingerprint capture attempts 1 and 2** | **Used.** Raw hold `F23_FINGERPRINT_MISMATCH`. Offline profile reassessment is **derived**. |
| **Temporary PGDG PostgreSQL 17 + official CLI 2.117.0 install** | Reused for F24 local proof. Isolated this-run `17/main`. Recipe: [SETUP_RECIPE.md](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_FINGERPRINT_CAPTURE_LOCAL_20260920/SETUP_RECIPE.md). |
| **`ubuntu` `SUPERUSER LOGIN`** | Local-cluster privilege for F24 proof. Not restricted-role authorization or RLS proof. |
| **Hosted reset / hosted qualification (F23 constrained 1+1)** | **ATTEMPT_1 used** (reset only, `psql` absent). **ATTEMPT_2 used** (inventory then `F13_RESET_SQL_FAILED`; qual not run). **No third hosted attempt.** |
| **Merge / deploy / `origin/main` / F3-06 / Daybreak–Astra contact** | **Not authorized.** |

## Authoritative build-plan reference — missing

No repository file is identified as the approved product build plan with explicit acceptance criteria for the remaining F3 outcome. This record does **not** invent one.

Closest linked artifacts (none of these is that missing plan):

| Artifact | Role |
|----------|------|
| [F21 preserve-baseline contract](evidence/M3_F3_DAYBREAK_CATALOG_V5_F21_PRESERVE_BASELINE_CONTRACT_20260919/) | Accepted contract for the preserve-`btree_gist` baseline |
| [F23 local acceptance contract](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_LOCAL_ACCEPTANCE_CONTRACT_20260920/) | Approved local comparison profile + local repair amendment |
| [F24 current proposed hosted requal plan](evidence/M3_F3_DAYBREAK_CATALOG_V5_F24_PROPOSED_HOSTED_REQUAL_PLAN_20260920/PROPOSED_HOSTED_REQUAL_PLAN.md) | **Current.** PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE. Mode `fault-injection`. New candidate. |
| [F23 consumed proposed hosted plan](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_PROPOSED_HOSTED_REQUAL_PLAN_20260920/PROPOSED_HOSTED_REQUAL_PLAN.md) | Historical consumed ATTEMPT_2 plan. Bytes preserved. |
| [F24 local dependency-order proof](evidence/M3_F3_DAYBREAK_CATALOG_V5_F24_DEPENDENCY_ORDER_LOCAL_20260920/) | Local PG17 correction proof |
| [F23 historical package](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_NORMAL_APPLICATION_LOCAL_20260920/) | Authoritative local-application HOLD package |

## Pins

| Role | Value |
|------|-------|
| FUNCTIONAL_TIP | `874d7c63868398ae6779feb0e9cfd9751a8e34c5` |
| Design commit | `cc1557e535c4765b8c16be125431b6aee83f07e1` |
| Pre-correction functional candidate (ATTEMPT_2) | `66be2b4797515975d737a0fd66656bc4c0de2145` |
| F24 local proof evidence tip | `724c7b9f5f751961dfd97c4dd3d00007f9c0cb11` |
| Starting evidence/head for this correction | `afd1257328a7bd5785ab474b66deb30405544224` |
| Runtime closure | `a88f34b378aa683a9e6412b773beaad5fc71490c0bf85ad0384a64b077d3039f` (47) |
| Verification union | `b62c82e56072248cd08c56912d31304c1e31ee997b4613d411724ca90e45e19f` (49) |
| Scope/SQL identity SHA-256 | `efd00f25ec108ba0e8041ae8890905cd347d925a750b77ed083dcccd40ee33a8` |
| F24 proposed-plan SHA-256 | `5b9bf55dab0ff98a2c94b4aa87ceecc481b55fe21ce60945c1f026082a64fd97` (10542 bytes) |
| Consumed ATTEMPT_2 plan SHA-256 | `bf9ca7b6c408d72b9f1231f223628a41e77fe275132acf273cd5386dd8c3b138` |
| Forbidden summary (unchanged; must stay unequal) | `16e4757840aec5f4fb44504fbd33e8480de169553f9a1ccfb180dbde051cb66d` |
| Independent reference | `3742c0396903f3e91a779deec9b62d93a879f134c186f3b4b817a19c6ca99c91` |
| F23 hosted requal evidence tip (ATTEMPT_1 stop) | `1d340b40b318a52abd7f14d5496634ad5d7637ac` |
| F23 hosted requal evidence tip (ATTEMPT_2 stop) | `0ad066c39c171a5f8bc3f5a24f2b1d6265feec93` |
| Starting #84/#85/#86 head for the prior F23 plan | `9a78e2713d59c2656ca749ee63930bceb8d233fb` |
| QA package content | `b71e07ef6f1736438631034d6fe82328998b4c60` |
| QA verdict | VillageClaq QA — F23 LOCAL ACCEPTANCE CONTRACT ACCEPT |
| Authoritative PR | [#84](https://github.com/gatekipa/villageclaq/pull/84) OPEN DRAFT UNMERGED, title DAYBREAK HOLD. Head follows shared branch after push. **Web body historically refused** (ManagePullRequest not-agent-managed; `gh api` 403). Body still described ATTEMPT_1 missing-`psql` at last read. Current remainder is this file + the F24 proposed plan. |
| Aligned PRs | #85 / #86 (same title; other branches still at `afd1257` until Chief FF; same body-update refusal) |
| Non-authoritative | #126 / #127 |
| Shared branch | `feat/m3-f3-01-05-forward-foundation-9b17` |
| Sibling PR | **none** |

## F24 local dependency-order correction

Hypothesis confirmed: ATTEMPT_2 scheduled `has_group_permission` at dropOrder 90 before notification tables 900/910/920 whose owned `m2_np_*` / `m2_npt_*` / `m2_npo_*` policies depend on it. Same class existed for 00117 CHECK/trigger helpers and 00118–00123 financial trigger/policy/CHECK helpers (`currency_scale` included).

Smallest fix: function `dropOrder` only. Table FK order unchanged. `can_view_finances` / `can_manage_finances` stay before `memberships` (1170) and `has_group_permission` (925) because they are `LANGUAGE sql`. Object count 113, 43 FK tuples, RESTRICT only, no `DROP POLICY`/`DROP TRIGGER`/CASCADE. Deletion authority did not expand.

Local this-run PG 17.11 results (`--dependency-order-only`):

| Case | Outcome |
|------|---------|
| Old `DROP FUNCTION … RESTRICT` first | Reproduced ATTEMPT_2 dependency error; commit=false; catalog unchanged on a subsequent connection |
| Corrected `executeSharedReset` | `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1`; confirmed commit; history 6→0; 264 btree_gist members equal |
| Out-of-scope leftover policy table | `F13_UNEXPECTED_OBJECT_OR_DEPENDENCY`; leftover + history=6 durable on a subsequent connection |

Distinctions: mutationAttempts=2, confirmedCommits=1, observedRollbacks=0. Applied SQL identity `ece1a3f2cfa912ae35dbb8b82baeaf61af935e0fb0adce8dd8caee9f7eb50080`.

Offline: design 34/34; F24 reset tests 2/2 (generated SQL + live PG). Fixture is **not** a clean 00001–00117 replay.

## Accepted work and evidence

Local F23 normal application (historical package; HOLD-package integrity accepted; **not** LOCAL APPLICATION COMPLETE):

- Six frozen migrations applied with exact identities: `20260913173000` / `f3_bounded_financial_epoch_foundation` … `20260913173005` / `f3_05_opening_cash_command`
- Membership sets preserved: 264 `deptype=e` tuples
- Fault-injection (separate database): `PRE_COMMIT_OR_ATOMIC_ROLLBACK`; repair-safety gate refused; `repairCalls=0` — **carried forward; not rerun.**
- Independent QA (this local acceptance contract): VillageClaq QA — **F23 LOCAL ACCEPTANCE CONTRACT ACCEPT** (offline only). Not repeated.

Attempt 2 raw capture remains `F23_FINGERPRINT_MISMATCH`. Offline derived reassessment remains **ACCEPTED** under `LOCAL_FINGERPRINT_COMPARISON_PROFILE_V1`.

Evidence: [F24 local proof](evidence/M3_F3_DAYBREAK_CATALOG_V5_F24_DEPENDENCY_ORDER_LOCAL_20260920/), [F23 package](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_NORMAL_APPLICATION_LOCAL_20260920/), [local acceptance contract](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_LOCAL_ACCEPTANCE_CONTRACT_20260920/).

## Operational rule — pre-budget host checks

Future execution handoffs require **connection-free executable checks** on the actual host **before** consuming a database-run budget: `psql --version` (spawnSync from the runner Node/`PATH`), `supabase --version` exactly pinned, PATH includes client bins, evidence destination dirs creatable, and pinned identities (HEAD / **current** plan SHA-256 / closureDigest / scopeSqlIdentitySha256). Record a readiness receipt. Do not start reset/qual if readiness fails.

## Hosted F23 constrained requal ATTEMPT_1 (2026-09-20 ET) — STOPPED (preserved)

| Field | Value |
|-------|-------|
| Outcome | **stopped** (not PASS) |
| Phase | reset |
| Reset exit | `1` / `F13_INVENTORY_CAPTURE_PROCESS_FAILED` |
| Qual | **NOT RUN** |
| Blocker | `psql` client missing on Chief box |
| Package | [HOSTED_REQUAL_20260920](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_HOSTED_REQUAL_20260920/) |

## Hosted F23 constrained requal ATTEMPT_2 (2026-09-20 ET) — STOPPED (preserved)

| Field | Value |
|-------|-------|
| Outcome | **stopped** (not PASS) |
| Readiness | **READY** (psql 17.11 Debian client; supabase 2.117.0; pins match) |
| Reset attempted | **yes** — exit `1` / `F13_RESET_SQL_FAILED` |
| Qualification started | **no** |
| Qualification completed | **no** |
| Functional SHA | `66be2b4797515975d737a0fd66656bc4c0de2145` |
| Plan SHA-256 | `bf9ca7b6c408d72b9f1231f223628a41e77fe275132acf273cd5386dd8c3b138` verified |
| closureDigest | `b276d0cb9b39efd10f67422948b4cf9a6353359c116ab657d379c7c7f467a211` confirmed |
| scopeSqlIdentitySha256 | `d95d96e02a3a1844977d852fa23a64f742b79b5f767984b6a2d4512cbe02632f` confirmed |
| CLI / psql | 2.117.0 / 17.11 (Debian trixie/main client-only) |
| Target | `jkorwnwwmdeflfntxntl` |
| Inventory | captured (objects 299 / deps 43 / history 6); `btree_gist` membership present |
| Mutation / commit | `mutation=false`, `committed=false` — disposable intact |
| Preserve baseline gate | NOT achieved as success (`QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1` not reached) |
| Blocker | RLS policies on `notification_*` block `DROP FUNCTION public.has_group_permission… RESTRICT`; CASCADE forbidden |
| Qual / repairs | NOT RUN / n/a |
| Package | [HOSTED_REQUAL_ATTEMPT_2_20260920](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_HOSTED_REQUAL_ATTEMPT_2_20260920/) |

DAYBREAK HOLD. Do not invent PASS. ATTEMPT_2 budget exhausted. **No third hosted attempt from this work.**

## Incomplete requirements (why they matter)

1. **Hosted raw fingerprint equality** — local profile acceptance and local F24 reset proof do not satisfy hosted equality. QUALIFICATION PASS / `localApplicationComplete` remain false. Frozen SQL must not be patched.
2. **Hosted positive repair** — before promotion beyond DAYBREAK HOLD, a separately authorized hosted qualification must demonstrate current-candidate `POST_COMMIT_HISTORY_FAILURE`, surviving intended objects, absent exact filename history, pass repair-safety and **raw** fingerprint gates, perform CLI 2.117.0 filename-version repair, and authenticate resulting history/catalog state. **Do not execute repair.**
3. **F3-06** — separate and unstarted.

## Local versus hosted / production

| Surface | Status |
|---------|--------|
| Local F24 reset order | Proved on documented qualification fixture (not 00001–00117 replay) |
| Local profile | ACCEPTED under `LOCAL_FINGERPRINT_COMPARISON_PROFILE_V1` (derived from retained capture) |
| Raw local capture | `F23_FINGERPRINT_MISMATCH` unchanged |
| Hosted disposable / production | ATTEMPT_2: disposable `jkorwnwwmdeflfntxntl` inventory captured then reset SQL failed; `committed=false`. Production never contacted. No third attempt. |
| Production | Forever denied from this work |
| Astra | UNAVAILABLE — NO VERDICT |
| QA (F23 contract) | VillageClaq QA — F23 LOCAL ACCEPTANCE CONTRACT ACCEPT (not repeated) |

## Owner, next action, remaining review budget

| Field | Value |
|-------|-------|
| Owner | Jude Anyere — authorize or refuse the **rebound** proposed hosted plan. |
| Next bounded action | Chief FF #84/#85/#86 to the shared-branch tip. Jude decide on new founder-auth for `874d7c63…` / new closure / new scope. Do not run a third hosted attempt under consumed ATTEMPT_1/ATTEMPT_2 budgets. Do not merge, deploy, or start F3-06. Do not contact Daybreak/Astra. |
| Permitted scope | Docs-only rebound plan published. No hosted/disposable/production contact. No merge. No deploy. No F3-06. |
| Remaining acceptance | Hosted raw fingerprint equality; hosted POST_COMMIT repair after raw/repair-safety gates inside one `fault-injection` qual 00118–00123; hosted requalification |
| Review / run budget | Focused local PG17 + affected reset tests used. Documentation pass used. Independent VillageClaq QA already landed (ACCEPT; not repeated). Renaming F-numbers does not restart the budget. |
| Stop | Functional tip `874d7c63…`. Current proposed plan published. No automatic hosted cycle. |

## Exact remaining hosted gate

Separately authorized hosted qualification must: demonstrate current-candidate `POST_COMMIT_HISTORY_FAILURE`; keep surviving intended objects; show absent exact filename history; pass existing repair-safety and **raw** fingerprint gates; perform supported CLI 2.117.0 filename-version repair; authenticate resulting history/catalog state.

Current proposed procedure (not authorized): one constrained preserve reset + one `--verification-mode=fault-injection` qualification 00118–00123 on the **new** candidate. Positive repair proof is inside that qualification. Old ATTEMPT_2 artifact cannot authorize these bytes.

See [current proposed plan](evidence/M3_F3_DAYBREAK_CATALOG_V5_F24_PROPOSED_HOSTED_REQUAL_PLAN_20260920/PROPOSED_HOSTED_REQUAL_PLAN.md).

**PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE.**

## One small nonblocking backlog

- Add a single authoritative build-plan document (location still missing) so later outcomes can cite acceptance criteria without reconstructing them from tests or evidence packages.

DAYBREAK HOLD — HOSTED ATTEMPT_2 STOPPED AT RESET; QUALIFICATION NOT STARTED  
ATTEMPT_1 and ATTEMPT_2 budgets consumed; no third hosted attempt  
DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT
