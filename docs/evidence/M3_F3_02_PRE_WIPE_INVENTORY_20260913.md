# M3 F3 02 — pre-wipe inventory (preserved)

**Status: PRESERVED.** Do not convert to PASS. Do not delete.

Chief captured this inventory on disposable `jkorwnwwmdeflfntxntl` **before** the founder-authorized wipe. It is the failed-floor / PARTIAL state from hosted tip `164f579` (`F3_DBPUSH_FLOOR_HOLD` at `00030_enterprise_branches_committees.sql`).

This artifact keeps that capture. It is **not** current disposable state. Current state is **03 wipe SUCCESS / CLEAN baseline**.

## Source pins

| Item | Value |
|------|-------|
| Disposable ref | `jkorwnwwmdeflfntxntl` only |
| Production | `llbnliixczcqfftxpsmb` — not contacted |
| Hosted functional tip that created the partial | `164f57949df774586155b007bf8a6c067ded4874` |
| Prior evidence of the partial | `79bdf1dd55fef7ddd0dcaa2162795a801ed4e741` / tip `18bb1c740a2b6e6e5e70c573e944d88dea03da5b` |
| Recognition | exactly `["manual_income"]` |

## Preserved Chief / prior HOLD facts (do not re-query as current)

From `M3_F3_DB_PUSH_CANDIDATE_QUALIFICATION_20260913` (leave that HOLD file unchanged):

- Floor runner: gated `psql -f` (not candidate; not db push; not Management API apply)
- Applied through **00029**; **failedAt `00030_enterprise_branches_committees.sql`** (psql status=3)
- 00031–00117 not applied; 00118–00123 **NOT RUN**
- ~71 public tables
- `schema_migrations` rows = 0
- Management API GET migrations `[]`
- `exchange_rates` present; org/group 00030 columns present
- `committees.budget_allocation` absent
- `get_user_group_ids` is `SETOF uuid` vs `unnest()` in 00030 policies

Do **not** treat this inventory as a reason to re-floor. Wipe already succeeded (03).
