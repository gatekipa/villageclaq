# Three-bypass BEFORE / AFTER (P1-B remediation rehearsal)

**Scope:** local disposable `s0p1b_disposable` only. No production mutation.  
**Implementation SHA:** `eec8cab85cc77be73300af8048364797a25f59ed`  
**Migration:** `supabase/migrations/00114_s0_p0a_cut1_active_authorization.sql`  
**Migration git blob SHA:** `95925d68047d41d501664b1ef2c30c2c0304eae8`  
**Rewrite count:** DROP POLICY 100 / CREATE POLICY 100

## BEFORE (prior HOLD tip `ed2b8df…` / blob `2711e498…`)

| # | Table | Cmd | Policy | Failure mode |
|---|-------|-----|--------|--------------|
| 1 | `feed_reactions` | DELETE | `rls_fr_delete` | Own-membership (`m.user_id = auth.uid()`) **without** `membership_status = 'active'` → inactive members could delete own reactions |
| 2 | `feed_reactions` | UPDATE | `rls_fr_update` | Same own-membership status-blind gate |
| 3 | `hosting_swap_requests` | INSERT | `Members can create swap requests` | `requested_by = auth.uid()` **OR** path without active group gate (collided with rewritten `rls_hsr_insert`) |

Collision matrix prior: `operational_bypasses=3`, `unknown=0` → **HOLD**

## AFTER (revised 00114 on disposable)

| # | Table | Cmd | Policy | Post-fix gate | Actor matrix |
|---|-------|-----|--------|----------------|--------------|
| 1 | `feed_reactions` | DELETE | `rls_fr_delete` | `m.user_id = auth.uid() AND m.membership_status = 'active'` | active ALLOW; pending/suspended/exited/archived/foreign/cross-group DENY |
| 2 | `feed_reactions` | UPDATE | `rls_fr_update` | same active ownership | same |
| 3 | `hosting_swap_requests` | INSERT | `Members can create swap requests` | `requested_by = auth.uid() AND is_active_group_member(hr.group_id)` | active ALLOW; inactive DENY; foreign/cross-group DENY; `requested_by != auth.uid()` DENY |

Companion rewrite: `rls_hsr_insert` uses `get_my_active_group_ids()` + `requested_by = auth.uid()`.

### Results
- Targeted three-bypass actor matrix: **`P1B_THREE_BYPASS_ACTOR_MATRIX_PASS`**
- Authoritative collision rescan: **`operational_bypasses=0`**, **`unknown=0`**, **`status_blind_operational_write_unknowns=0`**
- Three-bypass remaining count: **0**

Log: `/workspace/s0p1b/evidence/remediation/three_bypass_actor_matrix.log`  
Matrix: `/workspace/s0p1b/evidence/remediation/COLLISION_MATRIX.json`
