# S0 Cut 1 — disposable authorization harness

Contract SHA: `5263f160943374676362b3983f39ac510a7930a2`  
Migration: `supabase/migrations/00114_s0_p0a_cut1_active_authorization.sql`  
**PRODUCTION APPLY NOT AUTHORIZED.**

## What this covers

Minimal-schema fixture that recreates:

- Live status-blind helper bodies (exact `prosrc` fingerprints from prod 2026-09-10)
- The 23 helper-matching REWRITE policies from the evidence inventory
- §24.7 inline-role neutralize policies (live predicates)
- Inherit-only helper policies (`rls_const_*`, `rls_amend_update/delete`)

Then applies `00114` (loud preconditions + helpers + trigger + rewrites, including
the three P1-B OR-bypass policies) and runs an executable actor matrix:

| Case | Expected |
|------|----------|
| Active owner / admin / moderator `create_proxy_member` | ALLOW |
| Pending / suspended / exited / archived / ordinary member | DENY |
| Arbitrary uid probe (`has_group_permission` / `is_group_admin`) | DENY |
| Cross-group `position_assignments` | REJECT |
| Active admin, zero open assignments | permission bypass preserved |
| Active admin, open assignment lacking `perm_key` | DENY |
| Closed assignment | counts toward open=0 (bypass restored) |
| Payment INSERT active officer | ALLOW |
| Payment INSERT inactive officer | DENY |
| `rls_pay_insert` active member `pending_confirmation` | ALLOW |
| `feed_reactions` UPDATE/DELETE own row, active member | ALLOW |
| `feed_reactions` UPDATE/DELETE own row, pending/suspended/exited/archived | DENY |
| `feed_reactions` UPDATE/DELETE, foreign / cross-group | DENY |
| `hosting_swap_requests` INSERT active member `requested_by=auth.uid()` | ALLOW |
| `hosting_swap_requests` INSERT pending/suspended/exited/archived / foreign / cross-group | DENY |
| `hosting_swap_requests` INSERT `requested_by != auth.uid()` | DENY |

## How to run

```bash
# Local postgres (script installs postgresql if missing)
./tests/s0-cut1-active-authorization/run.sh

# Or after fixture+migration already generated:
python3 tests/s0-cut1-active-authorization/generate_fixture.py
python3 tests/s0-cut1-active-authorization/generate_cut1_sql.py
./tests/s0-cut1-active-authorization/run.sh
```

Static contract asserts (no database):

```bash
node --test scripts/test-s0-cut1-active-authorization.mjs
```

## Schema-from-repo attempt

Applying `00001`–`00113` to a bare postgres fails without the Supabase `auth` schema
(`auth.users`, `auth.uid`, storage, etc.). A full prod-equivalent disposable
requires a paid PITR / schema dump of `llbnliixczcqfftxpsmb`, which this cloud
environment does not have and which is **not authorized**.

**HOLD residual:** full 375-policy catalog rehearsal on a prod-shaped disposable
(schema-only dump or founder-authorized branch DB). This harness covers Cut 1
objects (helpers, trigger, 23 REWRITE + §24.7 neutralize + 3 P1-B OR-bypass + inherit asserts).

## Name mappings (live vs §24.7 pattern)

| §24.7 name | Live name(s) used |
|------------|-------------------|
| `Group admins can manage payment config` | `Admins can insert/update/delete payment config` |
| `rls_lr_all` | **NOT PRESENT** — live writes are `Members request loans` + `Admin manage loans` on `loan_requests_v1` |
| `Admins can manage constitutions` / `rls_const_insert` | inline ALL rewritten; `rls_const_*` inherit REPLACE |
