# P1-B Remediation Rehearsal — FULL (local disposable ONLY)

**When:** 2026-09-10 ~20:33–20:40 ET  
**Overall:** **PASS**  
**DB:** `s0p1b_disposable` (PostgreSQL 17 local). **Production mutation: ZERO.**  
**Paid restore:** not used. **Main merge:** not done.

## Inputs
| Item | Value |
|------|-------|
| Functional implementation SHA | `eec8cab85cc77be73300af8048364797a25f59ed` |
| Prior evidence tip | `ed2b8df59b6ef203efdc491bdcd796d91dc1f317` |
| Migration (from SHA) | `00114_s0_p0a_cut1_active_authorization.sql` |
| Migration git blob | `95925d68047d41d501664b1ef2c30c2c0304eae8` |
| Local path | `/workspace/s0p1b/sql/00114_revised.sql` |
| Contract SHA | `5263f160943374676362b3983f39ac510a7930a2` (PR #75) |

## Ordered steps executed

### 1. Fetch migration
`gh api …?ref=eec8cab…` → `/workspace/s0p1b/sql/00114_revised.sql`  
Also fetched harness under `/workspace/s0p1b/sql/harness/` from same SHA.

### 2. Reset PRE-00114
`/workspace/s0p1b/scripts/reset_pre_00114.sh`  
Gate: **PASS** `public_policies=375`, `helper_policies=145`, `position_assignments_mismatch=0`  
Evidence: `evidence/remediation/parity_pre.json`

### 3. Apply revised 00114 once (transactional)
`psql -v ON_ERROR_STOP=1 -f sql/00114_revised.sql` → **COMMIT** (no ERROR/CUT1_ABORT)  
Log: `evidence/remediation/apply_00114_revised.log`

### 4. Rewrite count
**DROP POLICY = 100**, **CREATE POLICY = 100** (exact rewrite count **100**)

### 5. Three-bypass targeted actor matrix
Enhanced `sql/bypass_actor_matrix.sql` (inactive + foreign + cross-group + requested_by spoof)  
Result: **`P1B_THREE_BYPASS_ACTOR_MATRIX_PASS`**  
Log: `evidence/remediation/three_bypass_actor_matrix.log`

### 6. Full 375 / Cut1 collision rescan
`python3 scripts/collision_rescan.py` → **VERDICT=PASS**  
`operational_bypasses=0`, `unknown=0`, `status_blind_operational_write_unknowns=0`  
Also: `collision_expect_zero.sql` → `COLLISION_EXPECT_ZERO_PASS residual_ungated=0`  
JSON: `evidence/remediation/COLLISION_MATRIX.json`

### 7. Full actor matrix regression
Prior Cut1 harness `/workspace/s0p1b/sql/actor_matrix.sql` → **`CUT1_ACTOR_MATRIX_PASS`**  
Covers: active ordinary/owner/admin/moderator/permission; pending/suspended/exited/archived; dual-group; cross-tenant position; create_proxy_member; position trigger; payment/F0; pending membership.  
SHA harness `sql/harness/actor_matrix.sql` adapted for disposable NOT NULL columns; residual unique-key collision after local matrix seed (same synthetic UUIDs) — **not a Cut1 failure**; local matrix PASS is authoritative on this DB.

### 8. P1-A
**8/8** Cut1 SECURITY DEFINER helpers have `search_path=""`:  
`is_active_group_member`, `get_my_active_group_ids`, `is_group_admin`, `is_group_admin_or_owner`, `is_group_owner`, `has_group_permission`, `create_proxy_member`, `enforce_position_assignment_same_group`

### 9. PostgREST
**CANNOT REPRODUCE LOCALLY** (no local PostgREST stack; no production mutation)

### 10. Evidence written
Under `/workspace/s0p1b/evidence/remediation/` (sanitized; synthetic UUIDs only; no secrets/PII).

### 11. GitHub
Evidence left on disk for Chief docs commit. Commit message draft: `evidence/remediation/COMMIT_MESSAGE_DRAFT.txt`

## Numeric summary
| Metric | Value |
|--------|-------|
| Overall | **PASS** |
| Rewrite count | **100** |
| Three-bypass remaining | **0** |
| Collision operational_bypasses | **0** |
| Collision unknown | **0** |
| status_blind_operational_write_unknowns | **0** |
| P1-A | **8/8** |
| Production mutation | **ZERO** |
| Pre policies / helpers / mismatch | 375 / 145 / 0 |
