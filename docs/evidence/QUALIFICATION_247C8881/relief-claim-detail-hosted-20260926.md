# R-011 hosted claim-detail role probe — 2026-09-26

**Executor:** Daybreak Blue. **Code candidate:** `cda9a947d77f05ee078ab2058c1a137f9bbf07cb`. **Environment:** authorized isolated Supabase branch `nisipxbuvndobyxqqglf` after migration history through `00178`; no production write.

The existing rollback-only `scripts/test-relief-claim-detail-scope.sql` was executed on the isolated branch with its psql expected-value placeholder set to `false`, the required post-00146 result. Its fictional fixture inserts five actors and a private claim, then uses `SET LOCAL ROLE authenticated` and JWT subjects to assert:

- suspended admin cannot SELECT the claim;
- unrelated platform support cannot SELECT it;
- active reviewer can SELECT and make an authorized review decision;
- claimant can SELECT own detail;
- unrelated group admin cannot SELECT it.

The hosted SQL call completed without exception. The connector returned only one of the script's SELECT results and did not expose the DO-block notices, so this is a **whole-script success/rollback result**, not a per-step transcript. A separate read found zero fixture users after execution, confirming rollback. The role expectations are anchored in R-011 and the effective policy repair, not inferred from a source regex.

**Remaining:** default/aggregate visibility, owner-payer path, all-role browser read matrix, and current scope after topology or membership changes. R-011 stays open under VC-04.
