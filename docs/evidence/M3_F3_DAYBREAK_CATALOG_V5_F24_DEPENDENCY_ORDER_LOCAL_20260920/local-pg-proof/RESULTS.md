# F24 local PG17 results

**Server:** 17.11 (Ubuntu 17.11-1.pgdg24.04+2)  
**Helper:** `scripts/prove-f3-qualification-reset-local.mjs --dependency-order-only`  
**Functional tip:** `874d7c63868398ae6779feb0e9cfd9751a8e34c5`  
**failCount:** 0 · **overallOk:** true  
**Hosted / disposable / production contact:** false

Distinctions kept separate: executedTransactions=3, mutationAttempts=2, confirmedCommits=1, observedRollbacks=0.

## F24_OLD_ORDER_REPRODUCES_HGP_POLICY_DEPENDENCY

- Statement: `DROP FUNCTION IF EXISTS public.has_group_permission(uuid,text,uuid) RESTRICT`
- Result: blocked. Code recorded as `F13_RESET_SQL_FAILED`. commit=false.
- ERROR matches ATTEMPT_2: policies `m2_np_select/insert/update/delete`, `m2_npt_*`, `m2_npo_select` depend on the function. HINT names CASCADE. CASCADE not used.
- Subsequent connection: function, notification tables, policyCount=10, history=6, btree_gist present — unchanged from before.

## F24_CORRECTED_RESET_COMMITS_PRESERVE_BASELINE

- Path: inventory capture → `executeSharedReset` (actual generated reset).
- processStatus 0. verdict `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1`.
- confirmedCommit=true. observedRollback=false.
- After: notification/financial objects gone; policyCount=0; historyCount=0 (was 6).
- btree_gist membership sets equal: 264 = 264.
- appliedSqlIdentity: `ece1a3f2cfa912ae35dbb8b82baeaf61af935e0fb0adce8dd8caee9f7eb50080`.

## F24_UNSUPPORTED_DEPENDENT_BLOCKS_DURABLE

- Extra `public.retained_out_of_scope` + policy `leftover_hgp` using `has_group_permission`.
- Eligibility: `F13_UNEXPECTED_OBJECT_OR_DEPENDENCY`. applyCalls=0. commit=false.
- Subsequent connection: leftover table present, policy `leftover_hgp` present, notification objects present, history=6.

Raw JSON: `RESULTS.json`.
