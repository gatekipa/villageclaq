# F24 local dependency-order correction — summary

**DAYBREAK HOLD — HOSTED ATTEMPT_2 STOPPED AT RESET; QUALIFICATION NOT STARTED**  
**Floor (verbatim):** DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT

## What was demonstrated on ATTEMPT_2 (preserved)

Hosted reset at functional candidate `66be2b4797515975d737a0fd66656bc4c0de2145` emitted  
`DROP FUNCTION public.has_group_permission(uuid,text,uuid) RESTRICT` while RLS policies `m2_np_*` / `m2_npt_*` / `m2_npo_*` on `notification_policies` / `notification_policy_triggers` / `notification_policy_occurrences` still depended on that function. CASCADE is forbidden. Inventory had been captured. `committed=false`. Code `F13_RESET_SQL_FAILED`. Qualification was not started.

Original package (bytes not rewritten): `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_HOSTED_REQUAL_ATTEMPT_2_20260920/`.  
Consumed plan bytes: `bf9ca7b6c408d72b9f1231f223628a41e77fe275132acf273cd5386dd8c3b138`.

## Hypothesis

Verified. `has_group_permission` was scheduled at dropOrder **90**, before the notification tables at **900 / 910 / 920**. Table-owned policies are removed only when their tables drop. The same class existed for 00117 CHECK/trigger helpers and 00118–00123 financial trigger/policy/CHECK helpers.

## Local result (this package)

Isolated this-run PostgreSQL **17.11** (`Ubuntu 17.11-1.pgdg24.04+2`). Fixture from pinned migration DDL plus retained catalog evidence, not a test list copied from the implementation.

| Case | Result | Mutation | Commit |
|------|--------|----------|--------|
| `F24_OLD_ORDER_REPRODUCES_HGP_POLICY_DEPENDENCY` | `F13_RESET_SQL_FAILED` — same ATTEMPT_2 DETAIL/HINT shape | attempted (focused `DROP FUNCTION … RESTRICT`) | false |
| `F24_CORRECTED_RESET_COMMITS_PRESERVE_BASELINE` | `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1` via actual `executeSharedReset` | attempted | **true** (1 confirmed commit) |
| `F24_UNSUPPORTED_DEPENDENT_BLOCKS_DURABLE` | `F13_UNEXPECTED_OBJECT_OR_DEPENDENCY` | not applied | false; leftover table+policy and history=6 on a subsequent connection |

Distinctions: executedTransactions=3, mutationAttempts=2, confirmedCommits=1, observedRollbacks=0.

btree_gist membership: 264 `deptype=e` tuples equal before/after the corrected commit. History went 6 → 0 on the corrected path only.

Offline: design 34/34 including F24-D01 (pinned DDL parser). Generated-SQL + live F24 reset tests 2/2.

## What did not change

Object allowlist still **113** (112 destructive + `ext.btree_gist` preserve). Dependency allowlist still **43**. History predicates unchanged. No `DROP POLICY` / `DROP TRIGGER` statements. No CASCADE. Wipe still `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`. Table FK dropOrders unchanged.

## Hosted

No hosted execution. ATTEMPT_1 (missing `psql`) and ATTEMPT_2 (`F13_RESET_SQL_FAILED`) budgets remain consumed. This package does not authorize a third attempt. Old founder-auth identities cannot authorize the new bytes.

Rebound proposed plan (separate package): `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F24_PROPOSED_HOSTED_REQUAL_PLAN_20260920/`.
