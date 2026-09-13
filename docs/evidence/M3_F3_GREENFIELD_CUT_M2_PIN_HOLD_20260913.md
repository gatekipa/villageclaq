# M3 F3 Chief local HOLD — greenfield Cut/M2 pins — 2026-09-13

**OVERALL VERDICT: HOLD**

Do **not** convert to PASS.  
Do **not** claim FILE-BASED RUNNER QUALIFICATION PASS.  
Do **not** claim production approval.  
Do **not** claim hosted db push PASS.  
Do **not** re-wipe or re-floor the disposable.  
**HOSTED STOPPED.**  
**NO ASTRA / DAYBREAK CONTACT.**

This supersedes the earlier local-prove first-fail at `00061` as **current status**. 00061 remains a documented historical greenfield blocker; after unnest is fixed, Chief’s through-00117 HOLD is the Cut/M2 production-pin path (00114–00117).

## Chief local result

1. Deterministic scan **PASS** — executable `unnest(get_user_group_ids())` only 00030 (14) + 00057 (1); 00048 comment-only.
2. 00030 transform **PASS** — `366ee277f8d659d4194340ebbcb93f4191e0ee64820d391999938596474f669f` → `f4223e8a33f6b9dc367057ca638ae52d795b01a6796325f760db6f63849854e5` (exactly 14).
3. 00057 transform **PASS** — `85355a3808b6aa14362d0017272d5e1f3a82ed2e0179e717248a2d6b0d721cdc` → `2a3c468537539bd45b0b285ece4e7bfe5204b898c9148345e1b88a43554dcf4d` (exactly 1).
4. Both transforms **applied**. No shim. Repo 00030 / 00057 / 00118–00123 **untouched**.
5. Full floor through 00117 **HOLD** — `reached_00117=false`. Greenfield fails Cut/M2 production pins after unnest is fixed:
   - `00114` CUT1 helper fingerprint drift
   - `00115` / `00116` `schema_migrations` pins
   - `00117` enqueue overload
6. Matches documented greenfield **NOT CLEAN** / stub+live-pin disposable floor path (`M3_F3_POST_S0_REGRESSION_*`, runbook “Disclosed floor limitation”).
7. Partial proofs **OK**: no `unnest(uuid)` shim; `exchange_rates` policies; `committees.budget_allocation`; F3 objects absent; recognition exactly `["manual_income"]`.
8. Disposable `jkorwnwwmdeflfntxntl` remains **CLEAN baseline** — do not re-floor / do not re-wipe.
9. Hosted floor / six-file `db push` **NOT STARTED**.

Need **new founder auth** if they want the documented stub+live-pin disposable floor path instead of pure greenfield `00001`–`00117`. No further replay exceptions without that auth.

## Pins

| Pin | Value |
|-----|-------|
| Functional SHA | `9cd4971387fae68fb52f308b43e2e0c245b028c4` |
| Harness SHA | `28fbe711c03cbb15152253010e4d79f26ccb21f5` |
| Prior functional | `a0d60f1a3c3ad6fa57629f5cd7c0d544c80c962a` |
| Prior evidence / tip | `6b9cb05cea817c7d34db43ae71812bfec5b1a7d7` / `79e60d9212fcd99f93cc3db0b11c8084316838a7` |
| PR #83 | `a293f5958b31548ccec7591b653eff2857ae9a90` unchanged |
| Main | `d83d13d4fe9915a0d1ff149ce29a53ad708c9853` |
| Disposable | `jkorwnwwmdeflfntxntl` CLEAN |
| Recognition | exactly `["manual_income"]` |

## Claims

| Claim | Status |
|-------|--------|
| Production apply / approval | **NOT CLAIMED** |
| Management API apply | **PERMANENTLY DISQUALIFIED** |
| `db push` | **QUALIFICATION CANDIDATE ONLY** — **NOT STARTED** |
| Hosted floor | **NOT STARTED** (stopped) |
| Wipe / re-floor | **FORBIDDEN** — CLEAN baseline |
| Local 00030 + 00057 transforms | **PASS** |
| Local through 00117 | **HOLD** — greenfield Cut/M2 pins; `reached_00117=false` |
| FILE-BASED RUNNER QUALIFICATION PASS | **NOT CLAIMED** |

## Chief-ready 22-field HOLD report

1. `verdict` = **HOLD**
2. `functional_sha` = `9cd4971387fae68fb52f308b43e2e0c245b028c4`
3. `evidence_sha` = `28cbe2ab9f3254f1970f11b7776de4241c0099b1`
4. `tip_sha` = *(filled after tip commit)*
5. `starting_ref` = `79e60d9212fcd99f93cc3db0b11c8084316838a7`
6. `prior_functional` = `a0d60f1a3c3ad6fa57629f5cd7c0d544c80c962a`
7. `prior_evidence` = `6b9cb05cea817c7d34db43ae71812bfec5b1a7d7`
8. `pr84` = **OPEN DRAFT UNMERGED** (authoritative)
9. `pr85` / `pr86` = **OPEN DRAFT UNMERGED** (companions; tree-identical)
10. `pr83` = `a293f5958b31548ccec7591b653eff2857ae9a90` unchanged
11. `production_contacted` = **false** (`llbnliixczcqfftxpsmb`)
12. `disposable_ref` = `jkorwnwwmdeflfntxntl`
13. `disposable_state` = **CLEAN baseline** — do not re-floor
14. `unnest_inventory` = 00030=14, 00057=1, 00048 comment-only
15. `local_00030_transform` = **PASS** `366ee277…669f` → `f4223e8a…54e5`
16. `local_00057_transform` = **PASS** `85355a38…1cdc` → `2a3c4685…cf4d`
17. `local_through_00117` = **HOLD**; `reached_00117=false`; 00114 CUT1 helper fingerprint drift; 00115/00116 `schema_migrations` pins; 00117 enqueue overload
18. `hosted_floor_db_push` = **NOT STARTED**
19. `shim_created` = **false**; repo 00030 / 00057 / 00118–00123 **unmodified**
20. `recognition` = exactly `["manual_income"]`
21. `founder_auth_needed` = stub+live-pin / documented disposable floor path instead of pure greenfield `00001`–`00117`
22. `merge_deploy` = **DO NOT MERGE / DO NOT DEPLOY**; do not re-wipe; no Astra/Daybreak contact
