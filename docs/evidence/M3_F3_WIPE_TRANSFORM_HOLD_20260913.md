# M3 F3 wipe + 00030 transform — HOLD — 2026-09-13

**OVERALL VERDICT: HOLD**

Do **not** convert to PASS.  
Do **not** claim FILE-BASED RUNNER QUALIFICATION PASS.  
Do **not** claim production approval.  
Do **not** claim hosted db push PASS.  
Do **not** re-floor the disposable.  
**NO ASTRA / DAYBREAK CONTACT.**

Prior 00030 hosted floor HOLD artifacts remain (`M3_F3_DB_PUSH_CANDIDATE_QUALIFICATION_20260913`). They record the PARTIAL floor that wipe removed. This file is current status.

PR **#84** OPEN DRAFT (authoritative). Companion **#85** OPEN DRAFT; trees identical.

## Chief results packaged

1. **02 pre-wipe inventory** — preserved (`M3_F3_02_PRE_WIPE_INVENTORY_20260913`)
2. **03 wipe** — **SUCCESS**; `jkorwnwwmdeflfntxntl` restored to **CLEAN baseline** (`M3_F3_03_WIPE_SUCCESS_BASELINE_20260913`)
3. **Local 00030 exact-14 transform** — orig `366ee277f8d659d4194340ebbcb93f4191e0ee64820d391999938596474f669f` → transformed `f4223e8a33f6b9dc367057ca638ae52d795b01a6796325f760db6f63849854e5`; count 14; 00030 alone **PASS** without shim
4. **Full local floor through 00117** — **HOLD** at `00057_profiles_rls_allow_co_members.sql` (`unnest(get_user_group_ids())` count=1 outside authorized 00030 transform)
5. **Hosted floor / db-push** — **NOT STARTED** (local proof required first; failed)
6. Disposable **remains CLEAN** after wipe — do not re-floor
7. **No shim** created; repo **00030** and **00118–00123** unmodified

Need **new founder auth** for an ephemeral transform of 00057 (and any other remaining unnest sites) the same way. No further replay exceptions without that auth.

## Pins

| Pin | Value |
|-----|-------|
| Base main | `d83d13d4fe9915a0d1ff149ce29a53ad708c9853` |
| PR #83 (unchanged) | `a293f5958b31548ccec7591b653eff2857ae9a90` |
| Prior hosted functional (00030 HOLD) | `164f57949df774586155b007bf8a6c067ded4874` |
| Prior evidence / tip | `79bdf1dd55fef7ddd0dcaa2162795a801ed4e741` / `18bb1c740a2b6e6e5e70c573e944d88dea03da5b` |
| Recognition | exactly `["manual_income"]` |
| Frozen 00118–00123 | unchanged |

## Frozen digests (UNCHANGED)

| File | SHA-256 |
|------|---------|
| `00118_f3_bounded_financial_epoch_foundation.sql` | `517774fd883ecc8c8ba7d2e287c7245a1289b21623c839f594b0801611968f3c` |
| `00119_f3_01_core_ledger_foundation.sql` | `9b09a733ed848e2a88a894db0815bd0f33f86335b58f7c9cd58845b6607d785d` |
| `00120_f3_02_secure_posting_idempotency.sql` | `4b870418ea15160a7aec0e6df707d9c8a3afc435f2d8bd1c861e0af7c47eb505` |
| `00121_f3_03_projection_read_proof.sql` | `568ae0b15b1b6e6c0a7effd9e9b5644a294cc22d76dbbf0e6714a28888825cf5` |
| `00122_f3_04_correction_reversal.sql` | `fd2c6e8729d1c7983421804b5f028edd16170c9f9056c8db2f3994f4dff8bdf9` |
| `00123_f3_05_opening_cash_command.sql` | `848b7cbe7e4e20e2e284d88f9954be0be8ffdfe4fc6d7c649e536d0c09aab699` |

Preassigned versions remain `20260913173000`–`20260913173005`.

## Claims

| Claim | Status |
|-------|--------|
| Production apply / approval | **NOT CLAIMED** |
| Management API apply | **PERMANENTLY DISQUALIFIED** |
| `db push` | **QUALIFICATION CANDIDATE ONLY** — **NOT STARTED** |
| Hosted floor | **NOT STARTED** |
| Wipe | **SUCCESS** (CLEAN baseline; do not re-floor) |
| Local 00030 transform | **PASS** (00030 alone) |
| Local through 00117 | **HOLD** at 00057 |
| FILE-BASED RUNNER QUALIFICATION PASS | **NOT CLAIMED** |

## Chief-ready 22-field HOLD report

1. `verdict` = **HOLD** (do not convert to PASS)
2. `functional_sha` = `a0d60f1a3c3ad6fa57629f5cd7c0d544c80c962a`
3. `evidence_sha` = `6b9cb05cea817c7d34db43ae71812bfec5b1a7d7`
4. `tip_sha` = `cb50e1fcedede4c7459f928103673d1596749b05`
5. `starting_ref` = `18bb1c740a2b6e6e5e70c573e944d88dea03da5b`
6. `prior_functional` = `164f57949df774586155b007bf8a6c067ded4874`
7. `prior_evidence` = `79bdf1dd55fef7ddd0dcaa2162795a801ed4e741`
8. `pr84` = **OPEN DRAFT UNMERGED** (authoritative)
9. `pr85` = **OPEN DRAFT UNMERGED** (companion; tree-identical; do not close)
10. `pr83` = `a293f5958b31548ccec7591b653eff2857ae9a90` unchanged
11. `production_contacted` = **false** (`llbnliixczcqfftxpsmb`)
12. `disposable_ref` = `jkorwnwwmdeflfntxntl`
13. `disposable_state` = **CLEAN baseline** (03 wipe SUCCESS)
14. `pre_wipe_inventory` = **PRESERVED** (02-*)
15. `local_00030_transform` = **PASS** orig `366ee277…669f` → `f4223e8a…54e5`; count 14; no shim
16. `local_through_00117` = **HOLD** at `00057_profiles_rls_allow_co_members.sql` (unnest count=1)
17. `hosted_floor_db_push` = **NOT STARTED**
18. `shim_created` = **false**; repo 00030 / 00118–00123 **unmodified**
19. `recognition` = exactly `["manual_income"]`
20. `founder_auth_needed` = ephemeral 00057 (and any other remaining unnest sites) — no further replay exceptions without new auth
21. `local_harness` = transform/wipe/db-push unit tests **37/37** on this revision; combined `test:f3` not re-run as PASS override
22. `merge_deploy` = **DO NOT MERGE / DO NOT DEPLOY**; do not re-floor; no Astra/Daybreak contact
