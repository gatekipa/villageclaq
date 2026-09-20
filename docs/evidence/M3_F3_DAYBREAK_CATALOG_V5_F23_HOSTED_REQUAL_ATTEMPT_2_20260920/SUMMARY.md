# F23 HOSTED REQUALIFICATION ATTEMPT_2 — SUMMARY

**Overall: DAYBREAK HOLD — HOSTED REQUALIFICATION ATTEMPT_2 STOPPED AT RESET (NOT PASS)**

Generated: 2026-09-20 04:27:58 ET

| Field | Value |
|-------|-------|
| Outcome | **stopped** |
| Readiness | **READY** (connection-free; see CLIENT_READINESS_RECEIPT) |
| Reset attempted | **yes** (exit **1**) |
| Qualification started | **no** |
| Qualification completed | **no** |
| Reset code | `F13_RESET_SQL_FAILED` |
| Functional SHA (execution) | `66be2b4797515975d737a0fd66656bc4c0de2145` |
| Previous stopped-attempt evidence head (preserved) | `1d340b40b318a52abd7f14d5496634ad5d7637ac` |
| Plan SHA-256 | `bf9ca7b6c408d72b9f1231f223628a41e77fe275132acf273cd5386dd8c3b138` (**verified**) |
| closureDigest | `b276d0cb9b39efd10f67422948b4cf9a6353359c116ab657d379c7c7f467a211` (**confirmed**, count 47) |
| scopeSqlIdentitySha256 | `d95d96e02a3a1844977d852fa23a64f742b79b5f767984b6a2d4512cbe02632f` (**confirmed**) |
| CLI | supabase **2.117.0** |
| psql | **17.11** (Debian 17.11-0+deb13u1) from `http://deb.debian.org/debian` trixie/main — client only |
| Target | `jkorwnwwmdeflfntxntl` only |
| Production | never contacted (`llbnliixczcqfftxpsmb` forbidden) |
| Preserve baseline gate | **NOT achieved** — inventory captured; reset SQL began; apply failed before commit |
| btree_gist | Present in inventory; not dropped; disposable intact (`committed=false`, `mutation=false`) |
| Per-file classifications / repairs | **n/a** (qual not started) |
| HOLD/PASS | **HOLD** (never invent PASS) |

## What ran

1. Connection-free readiness from the same Node/`PATH` environment the runner uses: psql spawnSync OK, supabase 2.117.0 exact, evidence dirs creatable, HEAD pin, plan SHA-256, closureDigest, scopeSqlIdentitySha256 — **READY**. Receipt under ATTEMPT_2 package.
2. Fresh founder auth at `…/ATTEMPT_2/hosted/qualification-reset/FOUNDER_AUTH.json` (not reusing attempt-1 live artifact). No secrets in artifact.
3. Exactly **one** `--qualification-reset` with ATTEMPT_2 founder auth + evidence-out.
4. Inventory capture **succeeded** (objects=299, dependencies=43, history=6). Typed `btree_gist` membership present.
5. Reset apply **failed**: `DROP FUNCTION … has_group_permission … RESTRICT` blocked by RLS policies `m2_np_*` / `m2_npt_*` / `m2_npo_*` on `notification_policies` / `notification_policy_triggers` / `notification_policy_occurrences`. Hint offered CASCADE — **refused** (CASCADE forbidden).
6. Result: `executed=true`, `committed=false`, `mutation=false`, `alreadyClean=false`. Spies: beginObserved=1, mutateAttempted=1, commitAttempted=0, commitConfirmed=0.
7. **Stopped.** Qualification `--no-wipe --prep-floor --sequence-f3 --floor-mode=stub-live-pin --verification-mode=fault-injection` **not run** (reset+gates did not pass).
8. Budget: reset attempts **1/1**; committed resets **0**; quals **0/1**; secondReset **false**. No second reset. No overall qual rerun.

## Blocker

**`F13_RESET_SQL_FAILED`** — unexpected dependency of notification RLS policies on allowlisted `public.has_group_permission(uuid,text,uuid)`. Finite reset SQL uses RESTRICT; CASCADE unauthorized. Stop before qualification. Disposable project left intact.

## Known summary-field inconsistencies

- `qualify-result.json` `label` still says `F19 LOCAL CORRECTION CANDIDATE — AWAITING QA / LOCAL TX PROOF` (stale shared `fail()` label). This run is **F23 hosted ATTEMPT_2 stop at reset SQL failure**, not an F19 local correction. No executable correction authorized.
- Attempt-1 package remains under `…/HOSTED_REQUAL/` (non-ATTEMPT_2) and dated `…/HOSTED_REQUAL_20260920/` — preserved; do not delete.

## Evidence paths

- Live ATTEMPT_2 reset: `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_HOSTED_REQUAL/ATTEMPT_2/hosted/qualification-reset/`
- Qual-from-00118: `…/ATTEMPT_2/hosted/qualify-from-00118/NOT_RUN.json`
- Dated package: `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_HOSTED_REQUAL_ATTEMPT_2_20260920/`
- Attempt-1 artifacts: preserved at prior paths

Floor (verbatim): **DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT**

Do **not** invent PASS. DAYBREAK HOLD pending assessment.
