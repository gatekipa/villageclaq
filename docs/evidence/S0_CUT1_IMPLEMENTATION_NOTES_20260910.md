# S0 Cut 1 implementation notes (2026-09-10)

**Contract SHA:** `5263f160943374676362b3983f39ac510a7930a2`  
**Base:** `0559b758bc53df3ec8081e361ffd022c1f19be43`  
**Migration:** `supabase/migrations/00114_s0_p0a_cut1_active_authorization.sql`  
**PRODUCTION APPLY NOT AUTHORIZED**

**P1-A (2026-09-10 requal):** Cut 1 SECURITY DEFINER functions use `SET search_path TO ''` (bodies `public.`-qualified). Postcondition asserts `proconfig` empty search_path, not `public`.

**P1-B OR-bypass remediations (2026-09-11):** Three remaining permissive-OR writes now DROP+CREATE in `00114` (no carve-out). Live predicates are `cut1_expect_policy` preconditions (drift → `CUT1_ABORT`). Historical `00001`–`00113` untouched. PRODUCTION APPLY NOT AUTHORIZED.

| Policy | Live predicate | After Cut 1 |
|--------|----------------|-------------|
| `feed_reactions.rls_fr_delete` / `rls_fr_update` | own `membership_id` + `auth.uid()` | same + `m.membership_status = 'active'` (authenticated, not admin-only) |
| `hosting_swap_requests.Members can create swap requests` | `requested_by = auth.uid()` | same + ACTIVE membership via `from_assignment_id` → `hosting_assignments` → `hosting_rosters.group_id` + `is_active_group_member` |

DROP+CREATE count: **100** (23 helper-matching + 74 §24.7 neutralize + 3 P1-B OR-bypass).

## Disposable method

1. Generate fixture + migration (already committed):
   - `tests/s0-cut1-active-authorization/generate_fixture.py`
   - `tests/s0-cut1-active-authorization/generate_cut1_sql.py`
2. Run `tests/s0-cut1-active-authorization/run.sh` (local postgres; installs `postgresql` if missing).
3. Static asserts: `npm run test:s0-cut1-active-authorization`.

Schema-from-repo probe (2026-09-10, local PG 16): `00001_core_tables.sql` fails immediately (`schema "auth" does not exist`). Full 375-policy catalog rehearsal on a prod-shaped dump remains **HOLD**.

## Test results (disposable)

- Static: `node --test scripts/test-s0-cut1-active-authorization.mjs` → **PASS** (includes P1-B trio + 100 DROP+CREATE)
- Harness: `./tests/s0-cut1-active-authorization/run.sh` → **CUT1_DISPOSABLE_PASS** / **CUT1_ACTOR_MATRIX_PASS**
  - Migration preconditions + postconditions committed
  - Active owner/admin/moderator proxy ALLOW; pending/suspended/exited/archived/member DENY
  - uid probe DENY; cross-group position REJECT
  - Payment active officer ALLOW / inactive DENY
  - `rls_pay_insert` active member `pending_confirmation` ALLOW
  - `feed_reactions` UPDATE/DELETE: active owner ALLOW; pending/suspended/exited/archived/foreign/cross-group DENY
  - `hosting_swap_requests` member INSERT: active `requested_by=auth.uid()` ALLOW; inactive/foreign/cross-group/`requested_by!=auth.uid` DENY

## Live name mappings

- §24.7 `Group admins can manage payment config` → live `Admins can insert/update/delete payment config`
- §24.7 `rls_lr_all` → **NOT PRESENT**; live `Members request loans` + `Admin manage loans` on `loan_requests_v1`
- Helper-only `rls_const_*` / `rls_amend_update|delete` inherit REPLACE (asserted, not DROP+CREATE)

## Helper fingerprints (live `prosrc` md5)

| Function | md5 |
|----------|-----|
| `is_group_member` | `b91a35aadb657fa2cd2c99e9313ca0f1` |
| `get_user_group_ids` | `a9865ade7502badcd2b92a74429ac1d9` |
| `is_group_admin` | `a606b2986f998e8cd6ec9f6f488f6172` |
| `is_group_admin_or_owner` | `44e3246f8dab340bf65a9766c70baac2` |
| `is_group_owner` | `b57b416768d1af85bd50f07bcb9c733f` |
| `has_group_permission` | `9948d97decfc42d3159a34d3f04934b9` |
| `create_proxy_member` | `10ab1a40d56ab1cc96fc3e59d23cd503` |
