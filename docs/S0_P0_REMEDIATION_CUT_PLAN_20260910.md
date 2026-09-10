# S0 — Confirmed P0 Remediation Cut Plan + Cut 1 Contract Freeze

**Date:** 2026-09-10  
**Status:** PLANNING FREEZE — CUT 1 DEPENDENCIES CLEARED — DO NOT IMPLEMENT  
**Overall recommended verdict:** **PASS — CUT 1 DEPENDENCIES CLEARED; READY FOR DAYBREAK SECURITY REVIEW**  
**Daybreak handoff:** **READY FOR REVIEW** (see §21) — implement remains **FORBIDDEN** until Daybreak **PASS**  
**Production mutation:** ZERO  
**Historical migrations modified:** NO  
**Messages sent:** ZERO  
**This artifact implements:** nothing (docs only)  
**Cut 1 clearance evidence:** `docs/evidence/S0_CUT1_LIVE_POLICY_FUNCTION_INVENTORY_20260910.json` (live prod `llbnliixczcqfftxpsmb`, read-only 2026-09-10)

---

## 1. Authority pins

Cite exactly. Do not substitute nearby SHAs, deploys, or project refs.

| Pin | Exact value |
|-----|-------------|
| Master PRD V1 PR #71 hard-freeze SHA | `050be86c9df3455c66b27bb5853eb786228b4009` |
| Production main | `0559b758bc53df3ec8081e361ffd022c1f19be43` |
| Production Vercel deploy | `dpl_36vZUWy3XZb8QXmNU8c2kJLrxFEH` |
| Supabase prod | `llbnliixczcqfftxpsmb` |
| S0-A PR #72 SHA | `97388b34037589a21eae66e3a5a1668f71e3bb55` — `docs/S0_A_PRODUCTION_TRUTH_SNAPSHOT_20260910.md` **PASS** |
| S0-B PR #73 SHA | `e1df73fd7536511fd2c062ab575eac9916fe86c7` — `docs/S0_B_RECOVERY_PRESERVATION_RESTORE_PROOF_20260910.md` **PASS** |
| S0-C PR #74 SHA | `d214197c93001141bae600b2ba0ee837e11890b7` — `docs/S0_C_MIGRATION_BASELINE_REPLAY_20260910.md` + `docs/evidence/S0_C_MIGRATION_MANIFEST_20260910.json` **PASS** |
| S0-C approved baseline | Production baseline + **forward-only** only (strategy A; optional later bootstrap pack B; reject squash/rewrite C) |
| S0-C production schema fingerprint (2026-09-10) | `0c39479e0b595fe5e1652169855abb96` |
| F0 (unapplied) | `99e17e2b4f4dc16753843f1e115312e70a8ae8ca` |
| F3 integration tip (unapplied) | `c7b4cd535d7125737eab2ec0fad27cae9432e8c3` |
| PR #69 (do not merge/apply) | `a8cdeaa98e6bb9e3a6cccaf815aa4ae4441b59a7` |
| PR #70 (do not merge/apply) | `0f258726c9328ee0204f7b5dee9efceebe7265b9` |
| Planning branch (this artifact) | `planning/s0-p0-remediation-cuts-20260910` from production main `0559b758bc53df3ec8081e361ffd022c1f19be43` |
| Cut 1 live catalog (read-only 2026-09-10) | Prod `llbnliixczcqfftxpsmb`: `public_policy_count=375`; `helper_policy_count=145`. See §24 addendum + `docs/evidence/S0_CUT1_LIVE_POLICY_FUNCTION_INVENTORY_20260910.json` |

S0-A / S0-B / S0-C artifacts are **not** on production main `0559b758…`. They were read from the pinned PR SHAs above. This planning file must not copy those artifacts into the tree.

---

## 2. Confirmed P0 evidence (S0-A only — do not invent)

Source: S0-A `97388b34037589a21eae66e3a5a1668f71e3bb55` §3, §4, §9, §20. No new P0s are declared here.

### P0-A — Production helpers are status-blind

Live production helpers (S0-A §3):

| Function | SECURITY DEFINER | search_path | Status filter |
|----------|------------------|-------------|---------------|
| `is_group_member` | YES | unset | **NONE** |
| `is_group_admin` | YES | unset | **NONE** |
| `is_group_admin_or_owner` | YES | `public` | **NONE** |
| `has_group_permission` | YES | `public` | **NONE** |
| `get_user_group_ids` | YES | unset | **NONE** |

S0-A: exited / suspended / pending_approval / archived may still pass.

**Repo vs production drift (00061):**  
`supabase/migrations/00061_batch3_fixes.sql` intended `membership_status != 'exited'` on `is_group_member`, `is_group_admin`, `is_group_admin_or_owner`, and `is_group_owner`. Production helpers remain status-blind (S0-A). S0-C also records that `00061` cannot apply cleanly on a blank replay because it renames `is_group_admin_or_owner`'s input parameter (`gid` vs `p_group_id`) — `CREATE OR REPLACE FUNCTION` rejects `42P13`. **Do not apply 00061. Do not treat 00061 as live.**

**Vocabulary / CHECK (verify against S0-A, not stale docs):**

- `docs/membership-status-vocabulary.md` (2026-06-13) says the live CHECK is only `('active','pending_approval')` unless later applied, and that 00061's widening was never applied.
- S0-A (2026-09-10) **CONFIRMED** live vocabulary: `active | pending_approval | exited | suspended | archived`.
- S0-B clone/prod aggregates: 225 active, 0 pending_approval, **1 exited**, 0 suspended, 0 archived (226 memberships).
- `00098_membership_status_lifecycle.sql` is **not** in the production migration log (S0-A / S0-C). **Do not treat unapplied 00098 as live.**

Cut 1 must assume the five-value vocabulary exists in production (S0-A) and that helpers do **not** filter any of those values.

### P0-B — `notifications_queue` INSERT fail-open

S0-A §4 / §20: policy `Authenticated users can queue notifications`  
`WITH CHECK (auth.uid() IS NOT NULL)` — no tenant / producer gate.

Repo origin: `supabase/migrations/00012_notification_queue.sql`.  
SELECT/UPDATE limited to `is_platform_staff()` (`Staff can view notification queue`, `Staff can update notification queue`, plus `Platform staff can view all notifications_queue` from 00070).  
Queue row count (S0-B): 2306. **No real sends in this planning task.**

### P0-C — Storage INSERT fail-open on NULL path parse

S0-A §9 / §20:

- Buckets: `avatars` (public), `group-documents` (private), `receipts` (private).
- INSERT policies allow the write when `storage_path_group_id(name) IS NULL`.
- SELECT is stronger (v2 helper). Repo `00112_storage_select_policy_hardening.sql` is **not** in the production migration log.
- Write-side policy names from 00078 / storage audit: `receipts_insert_group`, `receipts_update_group`, `receipts_delete_group`, `gdocs_insert_group`, `gdocs_update_group`, `gdocs_delete_group`.
- 00078 used `storage.path_group_id`; live audit / S0-A name the helper `storage_path_group_id`. Treat live name as `storage_path_group_id` (S0-A). SELECT v2: `storage_path_group_id_v2` (00112, **not live**).

---

## 3. Remediation order

Default unless disposable-rehearsal evidence forces a change. Independent cuts. **One new forward-only migration per cut. S0-C forward-only. Never edit `00001`–`00113`.**

| Cut | P0 | Objective | Depends on |
|-----|----|-----------|------------|
| **Cut 1** | P0-A | Membership / auth boundary: operational authority requires **active** membership; do **not** globally redefine `is_group_member` to active-only | S0-A/B/C PASS; this plan PASS; Daybreak PASS; disposable rehearsal inventory |
| **Cut 2** | P0-B | `notifications_queue` INSERT lockdown (tenant + producer / service-role). Bounded planning only. No real sends | Cut 1 helpers frozen so Cut 2 does not encode status-blind membership |
| **Cut 3** | P0-C | Storage write/delete fail-open closure: NULL / invalid / foreign group-id **DENY**. Private SELECT unchanged or stronger | Cut 1 active-member primitive available for write checks; do not apply 00112 as-is |

Do **not** start Cut 2 or Cut 3 implementation in this planning PR. Do **not** implement Cut 1 in this PR.

---

## 4. Dependency graph

```
S0-A PASS ──┐
S0-B PASS ──┼──► this plan (Cut contracts) ──► Daybreak PASS/HOLD
S0-C PASS ──┘         │
                      ├── Daybreak READY FOR REVIEW (2026-09-10 catalog)
                      │         implement FORBIDDEN until Daybreak PASS
                      ▼
              Cut 1 forward-only migration (later; not this PR)
                      │
                      ├── Cut 2 queue INSERT lockdown (later)
                      └── Cut 3 storage write/delete DENY (later)
                                │
                                ▼
              PR #70 requalification (S0-C §11) — after P0 cuts
              F0 / F3 apply — after S0 exit; F3 must not become weaker
```

**Hard edges**

- Cut 2 must not call status-blind `is_group_member` / `get_user_group_ids` as its only producer gate.
- Cut 3 write checks must use an **active** membership primitive (S0-C security contract F4), not status-blind `is_group_member` alone.
- F3 `financial_core.can_manage_finances` (unapplied tip `c7b4cd535d7125737eab2ec0fad27cae9432e8c3`) already requires `membership_status = 'active'` **AND** `has_group_permission(..., 'finances.manage')`. Cut 1 must make that conjunction **safer or unchanged, never weaker**.
- PR #69 / #70 / #71 / F0 / F3: **no merge, no apply**.
- Historical journal `00001`–`00113`: **immutable**.

**Soft edges (closed 2026-09-10 by live catalog — see §5.7 / §24)**

- Live `pg_policies` / `pg_proc` inventory: **CLOSED** — `public_policy_count=375`, `helper_policy_count=145` (read-only prod 2026-09-10).
- Duplicate permissive policies that OR with helper-based policies (00109 class): **CLOSED** — memberships UPDATE collision **NOT PRESENT**; remaining inline-role WRITE policies enumerated as Cut 1 **REWRITE** (not helpers-only REPLACE).
- Inline `memberships` EXISTS clauses that never call the five helpers: **CLOSED** as Cut 1 **REWRITE** scope (§7.6 / §24 neutralize table).
- Phase 10 disposable behavioral rehearsal: **DEFERRED** (catalog sufficient for dependency clearance; still required before implement).

---

## 5. Helper caller / semantics matrix

Classification vocabulary (use only these labels):

| Label | Meaning |
|-------|---------|
| **ACTIVE-ONLY OPERATIONAL AUTHORITY** | Writes, admin RPCs, permission grants, officer actions |
| **ACTIVE-ONLY PRIVILEGED READ** | Peer / group-wide sensitive read (phones, finance of others, drafts, roster contacts) |
| **SELF/HISTORICAL READ ALLOWED** | Caller reading their own row or an already-qualified personal artifact |
| **PENDING WORKFLOW ALLOWED** | `pending_approval` join / approval interstitial paths |
| **EXITED/ARCHIVED PERSONAL HISTORY ALLOWED** | Own past membership / own receipts / own vote receipt — **only if a dedicated contract exists** |
| **SERVICE/SYSTEM ONLY** | `auth.uid()` NULL / service_role / cron DEFINER early-exit |
| **PUBLIC SAFE BY DESIGN** | Intentionally unauthenticated or public-bucket |
| **UNKNOWN — FAIL CLOSED UNTIL QUALIFIED** | Cannot prove live policy/function text |

**Production vs repo 00061 drift (applies to every row):** production = **status-blind**. Repo 00061 = `!= 'exited'` only (still allows pending_approval / suspended / archived). Cut 1 operational gates must be **`= 'active'`**, not 00061's weaker `!= 'exited'`.

### 5.1 `is_group_member(gid, uid DEFAULT auth.uid())`

Production body (S0-A + repo `00014_consolidated_rls_policies.sql`): EXISTS membership for `(group_id, user_id)` — **no status**.

| Caller (repo; live = UNCONFIRMED unless S0-A named it) | Cmd | Classification | Cut 1 action |
|--------------------------------------------------------|-----|----------------|--------------|
| `mm_select` (`00072`, **applied**) | SELECT | published minutes = group visibility; drafts gated by `has_group_permission` | **Leave `is_group_member`**. Drafts inherit permission tightening. **SEPARATE HISTORICAL ACCESS CONTRACT REQUIRED** for exited/archived reading published minutes |
| `ann_select` (`00074`, **applied**) uses `is_announcement_visible` + `has_group_permission`, not `is_group_member` directly | SELECT | visibility | See `is_announcement_visible` |
| `eb_select_after_close` (`00073`, **applied**) | SELECT | closed-ballot read | **UNKNOWN** whether exited members should see tallies — fail-closed for **ops**; leave helper; do not invent access |
| `rls_pay_insert` (`00075`, **applied**) | INSERT | **ACTIVE-ONLY OPERATIONAL AUTHORITY** (self pending_confirmation payment) | **MIGRATE** to `is_active_group_member` |
| `rls_att_insert` (`00048`) | INSERT | **ACTIVE-ONLY OPERATIONAL AUTHORITY** (attendance / self check-in) | **MIGRATE** if live |
| `rls_fr_insert` (`00048`) | INSERT | **ACTIVE-ONLY OPERATIONAL AUTHORITY** | **MIGRATE** if live |
| `rls_pcon_write` (`00026`) | INSERT | **ACTIVE-ONLY OPERATIONAL AUTHORITY** | **MIGRATE** if live |
| `rls_evote_insert` (`00026`) | INSERT | legacy `election_votes` | **REMOVED from Cut 1** — live `election_votes_exists=false`, `rls_evote_insert_exists=false`. Superseded by `election_vote_receipts` + `election_ballots` + `cast_ballot` |
| `rls_ct_select` / events / documents / constitution SELECT (`00014`/`00026`/`00060`) | SELECT | group visibility | **Leave**. **SEPARATE HISTORICAL ACCESS CONTRACT REQUIRED** |
| `rls_fin_select` / `rls_fin_update` (`00026`) | SELECT/UPDATE | privileged + dispute write | SELECT = **SEPARATE CONTRACT**; UPDATE dispute = **ACTIVE-ONLY OPERATIONAL** if live — **UNKNOWN** |
| `rls_pay_select` | SELECT | **replaced** by `can_view_member_financial` (`00108` **applied** per S0-A log) | Not a live `is_group_member` caller if 00108+00109 held |
| Storage `receipts_*` / `gdocs_*` INSERT/UPDATE (`00078`, **applied**) | INSERT/UPDATE | **ACTIVE-ONLY OPERATIONAL** + P0-C fail-open | **Cut 3**, not Cut 1 |
| App TS | — | Comments only (`members/page.tsx`, `reports/...`) | No client helper call |

**Do not** `CREATE OR REPLACE` `is_group_member` to active-only. That would collapse visibility, pending workflow, and undefined historical read into one deny.

### 5.2 `is_group_admin(gid, uid DEFAULT auth.uid())`

Production: role IN (`owner`,`admin`) — **no status**. Repo 00061 added `!= 'exited'` only (not live).

| Caller | Cmd | Classification | Cut 1 action |
|--------|-----|----------------|--------------|
| `prevent_membership_self_escalation` (`00075`, **applied**) | TRIGGER | **ACTIVE-ONLY OPERATIONAL AUTHORITY** | **Inherits** REPLACE. Exited/suspended admin must **not** self-bypass |
| `rls_notif_insert` (`00075`) | INSERT | **ACTIVE-ONLY OPERATIONAL** | Inherits |
| `rls_co_insert` / `rls_co_update` (`00075`) | INSERT/UPDATE | **ACTIVE-ONLY OPERATIONAL** | Inherits (also `has_group_permission`) |
| `rls_ev_insert/update/delete` (`00026`) | W | **ACTIVE-ONLY OPERATIONAL** | Inherits if live |
| `rls_ct_insert/update` (`00014`/`00026`) | W | **ACTIVE-ONLY OPERATIONAL** | Inherits if live |
| Hosting / fine_rules / positions / savings admin policies (`00026`/`00037`/`00048`) | W | **ACTIVE-ONLY OPERATIONAL** | Inherits if live |
| `get_member_phones` / `get_membership_phones_for_dispatch` / `get_roster_with_contacts` (`00081`, **applied**) | RPC | **ACTIVE-ONLY PRIVILEGED READ** | Inherits |
| `preview_standing_changes` / `apply_standing_rules` (`00080`, **applied**) | RPC | **ACTIVE-ONLY OPERATIONAL** | Inherits |
| `request_member_transfer` / `execute_member_transfer` / `approve_member_transfer` / `deny_member_transfer` / `cancel_member_transfer` (`00082`, **applied**) | RPC | **ACTIVE-ONLY OPERATIONAL** | Inherits |
| `poa_select_admin` (`00079`, **applied**) | SELECT | **ACTIVE-ONLY PRIVILEGED READ** | Inherits |
| Storage DELETE `receipts_delete_group` / `gdocs_delete_group` | DELETE | **ACTIVE-ONLY OPERATIONAL** + P0-C | Cut 3 inherits admin helper; still must close NULL fail-open |
| `00113` agentic intents / `00101` standing history | — | **Not in production log** | Out of Cut 1 live scope |
| `00098` / `00092` triggers | TRIGGER | **Not applied** | Do not implement here |

Admin/owner **role string alone must not** override inactive membership. Cut 1 REPLACE enforces that.

### 5.3 `is_group_admin_or_owner(p_group_id uuid)`

Production signature is `p_group_id` with `search_path = public` (S0-A). Repo latest applied-shape match: `00059_settings_fixes.sql` (plpgsql DEFINER). Do **not** replace using 00061's `gid` parameter name.

| Caller | Cmd | Classification | Cut 1 action |
|--------|-----|----------------|--------------|
| `"Group owners/admins can update"` on `groups` (`00059`) | UPDATE | **ACTIVE-ONLY OPERATIONAL** | Inherits |
| `"Members can leave or admins can remove members"` on `memberships` (`00040`; S0-A DELETE highlight) | DELETE | Self-leave = **SELF**; admin-remove = **ACTIVE-ONLY OPERATIONAL** | Inherits admin branch. Self `user_id = auth.uid()` stays |
| `"Group admins can delete payments"` / `"Group admins can update payments"` (`00040`) | UPDATE/DELETE | **ACTIVE-ONLY OPERATIONAL** | Inherits |
| `can_view_member_financial` (`00108`, **applied** per S0-A) | SELECT helper | Privileged finance read uses this helper (status-blind today) | Inherits → **ACTIVE-ONLY PRIVILEGED READ**. Own-row clause already `membership_status != 'exited'` (not active-only) — **SELF/HISTORICAL** remains on that clause |
| `00102` REPLACE of this function | — | **Not in production log**; body is also status-blind | Do not apply 00102 |

### 5.4 `has_group_permission(gid, perm_key, uid DEFAULT auth.uid())`

Created `00072` (**applied**). Body (repo = live shape unless later replaced; S0-A says **no status filter**):

1. Load membership by `(group_id, user_id)` — no status; `LIMIT 1`.
2. `role = 'owner'` → **true** (inactive owner still wins today).
3. `role = 'admin'` and zero open `position_assignments` → **true**.
4. Else EXISTS `position_assignments` ⋈ `position_permissions` on `perm_key` with `ended_at IS NULL`.
5. **No join** proving `group_positions.group_id = memberships.group_id`.

`GRANT EXECUTE … TO authenticated, anon` (`00072`) — Cut 1 must **REVOKE anon** (S0-C F2).

| Caller | Cmd | Classification | Cut 1 action |
|--------|-----|----------------|--------------|
| `mm_insert/update/delete` (`00072`) | W | **ACTIVE-ONLY OPERATIONAL** | Inherits |
| `ann_insert/update/delete` + manager branch of `ann_select` (`00074`) | W/R | W = operational; manager SELECT = **ACTIVE-ONLY PRIVILEGED READ** | Inherits |
| `pct_manage` on `proxy_claim_tokens` (`00075`) | ALL | **ACTIVE-ONLY OPERATIONAL** | Inherits |
| `rls_notif_insert` permission OR-list (`00075`) | INSERT | **ACTIVE-ONLY OPERATIONAL** | Inherits |
| `rls_co_insert/update` permission OR-list (`00075`) | W | **ACTIVE-ONLY OPERATIONAL** | Inherits |
| `ec_manage_*` (`00073`) | W | **ACTIVE-ONLY OPERATIONAL** | Inherits |
| `finalize_election` (`00078`, **applied**) | RPC | **ACTIVE-ONLY OPERATIONAL** | Inherits |
| F3 `financial_core.can_manage_finances` / `can_view_finances` | — | **Not present** (S0-A) | Compatibility: Cut 1 must not make `has_group_permission` return true for inactive members |
| `00113` agentic intents | — | Not in prod log | Out of live scope |

### 5.5 `get_user_group_ids(uid DEFAULT auth.uid())`

Production: `SELECT group_id FROM memberships WHERE user_id = uid` — **no status** (`00014`). Vocabulary doc already flagged this residual.

| Caller | Cmd | Classification | Cut 1 action |
|--------|-----|----------------|--------------|
| Memberships SELECT (S0-A: self / `get_user_group_ids` / platform staff) | SELECT | Self = **SELF/HISTORICAL**; group roster via helper = **SEPARATE HISTORICAL ACCESS CONTRACT REQUIRED** | **Do not** make helper active-only |
| `"Profiles readable by self and co-members"` (`00057`) | SELECT | Co-member profile visibility | **Leave** helper. Self `id = auth.uid()` stays. Historical co-member visibility **UNDEFINED** |
| `get_relief_branch_summary` (`00111`, **applied**) | RPC/view | Org-boundary privileged aggregate via `get_user_group_ids()` | **SEPARATE RELIEF PHASE** — **UNAFFECTED** by Cut 1 admin helper REPLACE. Do **not** redefine `get_user_group_ids`. Leave this function in Cut 1 |
| Proxy INSERT — live name **`Admins can add proxy members`** (B2 CLOSED 2026-09-10) | INSERT | **ACTIVE-ONLY OPERATIONAL** | **REWRITE** — `get_user_group_ids(auth.uid())` is status-blind. Must gate to active operational authority |
| `committees` / `committee_members` / `sub_group_transfers` / `member_transfers` (`00030`) | SELECT + ALL/INSERT | SELECT = visibility; ALL/INSERT = **ACTIVE-ONLY OPERATIONAL** (plus inline role checks) | Visibility: leave. Writes: migrate to active helper **if live** — **UNKNOWN** |
| `loan_configs_select` (`00032`) | SELECT | config visibility | Leave or privileged-read — **UNKNOWN** |
| `fine_types_select` (`00033`) / `disputes_*` | R/W | mixed | Writes = operational **if live** |
| `group_subscriptions` / `group_payment_config` SELECT | SELECT | visibility / billing | **UNKNOWN** |
| Hosting SELECT (`00037`/`00052`) | SELECT | visibility | Leave |
| `00035` audit_log INSERT | INSERT | **ACTIVE-ONLY OPERATIONAL** | **MIGRATE** if live |
| `00102` / `00113` | — | Not in prod log | Out of live scope |

**00030 `unnest(get_user_group_ids())`:** helper returns `SETOF uuid`, not `uuid[]`. 00048 already flags this as a typing landmine. Rehearsal must record whether live policies still use `unnest`.

### 5.6 Adjacent live DEFINER paths that do **not** use the five helpers (still P0-A-adjacent)

These are **not** “all membership policies.” They are named because helper REPLACE **does not close them**.

| Object | Evidence | Classification | Cut 1 |
|--------|----------|----------------|-------|
| `create_proxy_member` (live 2026-09-10; `00103` **not** in prod log) | `role IN ('owner','admin','moderator')`; **NO status**; DEFINER; `search_path` unset | **ACTIVE-ONLY OPERATIONAL AUTHORITY** | **REPLACE** in Cut 1: keep live officer-role gate (including **moderator**); add `membership_status = 'active'`. Do **not** import unconfirmed 00103 extras. Do **not** treat repo `00015` any-member body as live |
| `cast_ballot` (`00073`, **applied**) | Membership lookup; standing=`good`; **no** `membership_status='active'` (S0-A P1 #5) | Voting = operational | **NOT IN CUT 1** (P1). Must not regress |
| `is_announcement_visible` (`00074`) | Membership lookup; no status | Visibility | **Leave**. SEPARATE CONTRACT |
| `is_group_owner` (`00026`; 00061 status filter **not** live) | role=`owner` only | **ACTIVE-ONLY OPERATIONAL** (used by `rls_membership_role_guard` WITH CHECK) | **REPLACE** with `membership_status = 'active'` |
| Inline `EXISTS (memberships … role IN ('owner','admin'))` on `loan_configs_*`, `loans_*`, `fine_types_admin`, `00001` memberships/positions policies, `00030` committee ALL | No helper, no status | **ACTIVE-ONLY OPERATIONAL** | **Cannot close via helper REPLACE.** B3 CLOSED: memberships UPDATE collision absent. Remaining live names **REWRITE** (§24.7). `"Group owners/admins can update memberships"` **NOT PRESENT** |
| `"Group owners/admins can update memberships"` (`00001`) **OR** `rls_membership_role_guard` (`00026`) | Classic 00109 neutralization | **B3 CLOSED** — suspect **"Group owners/admins can update memberships" NOT PRESENT**. Live memberships UPDATE = `memberships_update_own` + `rls_membership_role_guard` | Helpers-only REPLACE does **not** close remaining inline-role WRITE policies — those names **REWRITE** (§7.6 / §24) |

### 5.7 HOLD blockers from this matrix — **CLOSED** (2026-09-10 live catalog)

Source: read-only prod `llbnliixczcqfftxpsmb` 2026-09-10. Counts only; no PII. Evidence: `docs/evidence/S0_CUT1_LIVE_POLICY_FUNCTION_INVENTORY_20260910.json`. Full names and rewrite table: §24.

| # | Prior blocker | Disposition |
|---|---------------|-------------|
| B1 | No exhaustive live `pg_policies` / helper-caller dump | **CLOSED** — `public_policy_count=375`; `helper_policy_count=145`. `is_active_group_member` / `get_user_active_group_ids` **absent** (Cut 1 CREATE). Live CHECK `memberships_membership_status_check` = `active\|pending_approval\|exited\|suspended\|archived` |
| B2 | Proxy INSERT policy using `get_user_group_ids` unnamed | **CLOSED** — exact live policy **`Admins can add proxy members`** on `memberships` INSERT, roles `{public}`, `WITH CHECK ((is_proxy = true) AND (proxy_manager_id = auth.uid()) AND (group_id IN (SELECT get_user_group_ids(auth.uid()))))`. Cut 1 **MUST REWRITE** to active operational authority |
| B3 | Duplicate permissive memberships UPDATE (00109 class) | **CLOSED** — suspect `"Group owners/admins can update memberships"` is **NOT PRESENT**. Live UPDATE = `memberships_update_own` + `rls_membership_role_guard`. Remaining inline-role WRITE policies **NEUTRALIZE** a helpers-only REPLACE → Cut 1 **REWRITE** (add active gate). Full name list in §24 |
| B4 | `get_relief_branch_summary` HQ path UNKNOWN | **CLOSED — SEPARATE RELIEF PHASE**. Org boundary is `get_user_group_ids()` (unchanged). **UNAFFECTED** by Cut 1 admin helper REPLACE. Do not redefine `get_user_group_ids` |
| B5 | `rls_evote_insert` / `election_votes` UNKNOWN | **CLOSED — NOT PRESENT**. `election_votes_exists=false`; `rls_evote_insert_exists=false`. Superseded by `election_vote_receipts` + `election_ballots` + `cast_ballot`. **REMOVED from Cut 1** |

**Position gap (confirmed live):** no same-group constraint on `position_assignments`. Cut 1 `has_group_permission` REPLACE **must** `JOIN group_positions gp ON gp.id = pa.position_id AND gp.group_id = gid`. Optional same-group trigger (§7.7).

Dependency clearance does **not** authorize implement. Daybreak security review still required. Phase 10 disposable behavioral rehearsal is **DEFERRED** (catalog sufficient for this flip).

---

## 6. Cut 1 exact contract

**Objective:** Close P0-A for **operational authority** and **privileged reads that already use admin/permission helpers**, without inventing a global historical-visibility model and without weakening F3.

### 6.1 New primitives

```
is_active_group_member(gid uuid, uid uuid DEFAULT auth.uid())
  → true iff auth/uid is non-null
     AND EXISTS membership (group_id = gid AND user_id = uid
                            AND membership_status = 'active')

get_user_active_group_ids(uid uuid DEFAULT auth.uid())
  → SETOF uuid
  → group_id from memberships where user_id = uid
     AND membership_status = 'active'
```

Both: `SECURITY DEFINER`, `STABLE`, `SET search_path = ''` (S0-C pin 1; prefer empty), `REVOKE ALL FROM PUBLIC, anon` then `GRANT EXECUTE` to `authenticated` only (and `service_role` only if a named caller requires it — default **no**).

### 6.2 Replaced primitives (same signatures as production)

| Function | Production signature to keep | New semantic |
|----------|------------------------------|--------------|
| `is_group_admin` | `(gid uuid, uid uuid DEFAULT auth.uid())` | EXISTS membership group+user **and** `role IN ('owner','admin')` **and** `membership_status = 'active'` |
| `is_group_admin_or_owner` | `(p_group_id uuid)` — **not** `gid` | Same as admin check; `user_id = auth.uid()`; **active** |
| `is_group_owner` | `(gid uuid, uid uuid DEFAULT auth.uid())` | role=`owner` **and** `membership_status = 'active'` |
| `has_group_permission` | `(gid uuid, perm_key text, uid uuid DEFAULT auth.uid())` | Membership row must be **active**. Owner/admin bypass **only** if that membership is **active**. Position path: `memberships` → `position_assignments` (`ended_at IS NULL`) → `group_positions` → `position_permissions` with **`group_positions.group_id = memberships.group_id = gid`**. Inactive membership ⇒ false even if role string is owner/admin |

Admin/owner role string **must not** override inactive membership.

### 6.3 Explicitly unchanged in Cut 1

- `is_group_member` — remains the **visibility / existence** helper (status-blind in production). Operational callers that today use it for **WRITE** must be migrated to `is_active_group_member` **only when the live policy is named** (§7).
- `get_user_group_ids` — remains the **visibility tenant-set** helper. Operational / privileged-read callers migrate to `get_user_active_group_ids` only when named and qualified.
- `is_announcement_visible` — visibility; not rewritten.
- `can_view_member_financial` — not rewritten; privileged branch inherits `is_group_admin_or_owner`. Own-row `!= 'exited'` stays (personal finance history). **Do not** invent archived/exited **peer** finance access.
- `cast_ballot` — P1; out of Cut 1. Live: `standing = 'good'` only; **no** `membership_status`. Must not regress.
- `election_votes` / `rls_evote_insert` — **REMOVED** (NOT PRESENT).
- `00098` / `00092` / `00061` — not applied, not edited, not smuggled in.
- Storage policies — Cut 3.
- `notifications_queue` — Cut 2.
- F0/F3/PR#69/#70/#71 — not merged, not applied.

### 6.4 Same-group position integrity (Cut 1 required for `has_group_permission`)

Actor → **active** membership → `position_assignments` (open) → `group_positions` → **same `group_id`** → `position_permissions.permission = perm_key`.

Cross-tenant position assignment (possible today: two FKs, no composite; S0-A same-group composites **MISSING**) must **not** grant permission.

Optional extra: table constraint on `position_assignments` (§7). If omitted in Cut 1, the helper join is still mandatory.

### 6.5 Loud preconditions (migration, later)

Abort (`RAISE`) unless:

- Project is **not** assumed production by the planner; apply target is disposable or founder-authorized prod **later**.
- `pg_get_functiondef` for the five helpers matches S0-A status-blind expectation (no `membership_status` predicate).
- `is_group_admin_or_owner` argument name is `p_group_id` (not `gid`).
- Live fingerprint compared to S0-C `0c39479e0b595fe5e1652169855abb96` is recorded (MATCH or explicit DRIFT accept).
- Live `pg_policies` dump for helper write/RPC callers is **subset of** §7 allowlist **or** the migration aborts on extras.

### 6.6 Postconditions

- `is_group_admin` / `is_group_admin_or_owner` / `is_group_owner` / `has_group_permission` reject pending_approval, suspended, exited, archived.
- `is_group_member` / `get_user_group_ids` definitions **unchanged** (hash/body check).
- New helpers exist with pinned `search_path` and revoked PUBLIC/anon.
- F3 snippet compatibility: `has_group_permission` on an inactive member is **false** (F3's extra `= 'active'` AND remains redundant-safe, never weaker).
- No 00001–00113 file bytes changed.

---

## 7. Exact object scope

**Forbidden phrasing:** “all membership policies,” “all RLS,” “harden helpers everywhere.”

### 7.1 Functions — CREATE (Cut 1)

| Schema | Name | Signature |
|--------|------|-----------|
| `public` | `is_active_group_member` | `(gid uuid, uid uuid DEFAULT auth.uid())` |
| `public` | `get_user_active_group_ids` | `(uid uuid DEFAULT auth.uid())` |

### 7.2 Functions — REPLACE (Cut 1)

| Schema | Name | Signature (must match live) |
|--------|------|-----------------------------|
| `public` | `is_group_admin` | `(gid uuid, uid uuid DEFAULT auth.uid())` |
| `public` | `is_group_admin_or_owner` | `(p_group_id uuid)` |
| `public` | `is_group_owner` | `(gid uuid, uid uuid DEFAULT auth.uid())` |
| `public` | `has_group_permission` | `(gid uuid, perm_key text, uid uuid DEFAULT auth.uid())` |
| `public` | `create_proxy_member` | live signature from prod catalog (officer `role IN ('owner','admin','moderator')`; **no** status; DEFINER; `search_path` unset). Preserve moderator. Add `membership_status = 'active'`. Do **not** apply `00103` as-is |

### 7.3 Functions — DO NOT TOUCH in Cut 1

`is_group_member`, `get_user_group_ids`, `is_announcement_visible`, `can_view_member_financial`, `cast_ballot`, `prevent_membership_self_escalation` (inherits), `get_member_phones`, `get_membership_phones_for_dispatch`, `get_roster_with_contacts`, `preview_standing_changes`, `apply_standing_rules`, `finalize_election`, transfer RPCs (`00082`), `create_owner_membership`, `accept_invitation`, `join_group_via_code`, `claim_proxy_membership`, all `financial_core.*` (absent), `00113` / `00101` / `00102` / `00103` objects.

`get_relief_branch_summary`: **LEAVE** — **SEPARATE RELIEF PHASE** (B4 CLOSED). Org boundary via unchanged `get_user_group_ids()`. UNAFFECTED by Cut 1 admin REPLACE.

### 7.4 Policies — REWRITE in Cut 1 (`is_group_member` / member-write helper → `is_active_group_member`)

Live-confirmed helper WRITE policies (do **not** rewrite SELECT visibility):

| Policy | Table | Command |
|--------|-------|---------|
| `rls_pay_insert` | `payments` | INSERT |
| `rls_att_insert` | `event_attendances` | INSERT |
| `rls_fr_insert` | `feed_reactions` | INSERT |
| `rls_pcon_write` | `project_contributions` | INSERT |
| `rls_rsvp_insert` | `event_rsvps` | INSERT |
| `rls_ep_insert` | `event_photos` | INSERT |
| `rls_amend_insert` | `constitution_amendments` | INSERT |
| `rls_prs_insert` | `payment_reminders_sent` | INSERT |
| `rls_af_all` | `activity_feed` | ALL (write path) |
| `rls_fin_update` | `fines` | UPDATE |
| `rls_ad_update` | `announcement_deliveries` | UPDATE |
| `rls_hsr_insert` | `hosting_swap_requests` | INSERT |
| `disputes_insert` | `disputes` | INSERT |
| `Users can create disputes` / `Users can update disputes` / `Users can delete disputes` | `disputes` | I/U/D |
| `member_insert_audit_logs` | `group_audit_logs` | INSERT |
| `Admins can add proxy members` | `memberships` | INSERT |

**REMOVED:** `rls_evote_insert` / `election_votes` — **NOT PRESENT**.

**Do not rewrite** SELECT policies that only use `is_group_member` / `get_user_group_ids` for visibility. **Keep** `memberships_insert_pending`.

### 7.5 Policies — REWRITE in Cut 1 (`get_user_group_ids` WRITE / privileged)

| Policy / object | Table / fn | Why |
|-----------------|------------|-----|
| **`Admins can add proxy members`** (B2 CLOSED) | `memberships` INSERT | Status-blind `get_user_group_ids(auth.uid())` — **MUST REWRITE** to active operational authority |
| `"Users can create transfers"` | `sub_group_transfers` | INSERT |
| `"Admins can manage committees"` / `"Admins can manage committee members"` / `"Admins can update transfers"` / `transfers_delete` | listed tables | ALL/UPDATE/INSERT — inline role + helper; add active gate |
| `member_insert_audit_logs` | `group_audit_logs` | INSERT |
| `get_relief_branch_summary` | function | **LEAVE** — SEPARATE RELIEF PHASE (B4). Do not migrate to `get_user_active_group_ids` in Cut 1 |

### 7.6 Policies — inherit REPLACE vs NEUTRALIZE REWRITE (finalized)

**Inherit REPLACE** (no DROP/CREATE; helper body change is enough) when the **only** gate is `is_group_admin` / `is_group_admin_or_owner` / `is_group_owner` / `has_group_permission`:

`mm_insert`, `mm_update`, `mm_delete`, `ann_insert`, `ann_update`, `ann_delete`, manager branch of `ann_select` / `mm_select`, `pct_manage`, `rls_notif_insert`, `rls_co_insert`, `rls_co_update`, `ec_manage_insert`, `ec_manage_update`, `Group owners/admins can update` (`groups`), `Members can leave or admins can remove members` (admin branch), `Group admins can delete payments`, `Group admins can update payments`, `poa_select_admin`, `rls_membership_role_guard`, plus any other live policy whose **only** gate is those four helpers.

`can_view_member_financial` is **not rewritten**; privileged branch **benefits** from admin REPLACE. Own-row `!= 'exited'` stays.

**B3 collision:** `"Group owners/admins can update memberships"` is **NOT PRESENT**. Live memberships UPDATE = `memberships_update_own` + `rls_membership_role_guard`.

**NEUTRALIZES if helpers-only REPLACE** — Cut 1 **MUST REWRITE** (add an active operational gate) for the live inline-role / status-blind WRITE names enumerated in **§24 neutralize table**. Pattern families (non-exhaustive here; **full names in §24**):

payments (`Group admins and treasurers can record payments`); fines (`Admin manage fines`, `fine_types_admin`); `event_attendances` (`Group admins can manage attendance`); `position_assignments` (`Group owners/admins can manage assignments`); hosting assignments/rosters (`Group admins can manage *`); elections / election_options (`Admins can manage *`); documents (`Admins can manage documents`); projects / milestones / expenses (`Admin manage *`); `savings_*` (`Admins can manage *`); relief plans/enrollments/claims/payouts/remittances admin+member **write**; contribution types/obligations (`Group admins *`); `payment_reminder_rules` (`Admin manage reminder rules`); constitutions/amendments admin write; activity_feed (`Members insert feed`, `Admin update feed`); feed_reactions (`Members react`); events (`Group admins can create/update/delete`); invitations (`Group admins *`); `group_payment_config` / `group_subscriptions` admin write; `loan_configs_*` / `loans_*` / `loan_repayments_*` / `loan_schedule_*` writes; `loan_requests_v1`; `disputes_admin`; committees / committee_members admin manage; `sub_group_transfers` create/update; `transfers_delete`; `HQ admins can manage exchange rates`; `family_members` `rls_fm_*` writes; event_photos (`Members upload photos`); project_contributions (`Members contribute to projects`); plus §7.4 helper-write names.

### 7.7 Constraints / indexes (optional, named)

| Object | Intent |
|--------|--------|
| **NEW** `position_assignments_membership_position_same_group` (CHECK via trigger or constraint trigger; Postgres CHECK cannot subquery) | `memberships.group_id` of `membership_id` = `group_positions.group_id` of `position_id` |
| Do **not** drop `memberships_membership_status_check` | Live five-value set (S0-A). Do not revert to two-value or three-value 00061 CHECK |
| Do **not** apply 00061's `idx_memberships_status_user` unless rehearsal wants it — optional, not required to close P0-A |

### 7.8 Grants / revokes (Cut 1)

- `REVOKE ALL ON FUNCTION` each new/replaced function `FROM PUBLIC, anon`.
- `GRANT EXECUTE` to `authenticated` only unless a named service caller is proven.
- `has_group_permission`: revoke the `00072` **anon** execute grant.
- Do not GRANT/REVOKE table `TRUNCATE` in Cut 1 (S0-A P1 #6 — separate).

### 7.9 Out of Cut 1 object scope (explicit)

Storage policies (`receipts_*_group`, `gdocs_*_group`, avatars, 00112).  
`notifications_queue` policies.  
`00098` CHECK/trigger.  
F3 ledger policies.  
PR #70 `notification_policies`.  
`00112`, `00113`, `00106`, `00107`.  
`election_votes` / `rls_evote_insert` (**NOT PRESENT** — removed from Cut 1).  
`get_relief_branch_summary` / Relief HQ (**SEPARATE PHASE**).  
`is_group_member` / `get_user_group_ids` bodies.  
`memberships_insert_pending`.  
`cast_ballot` (P1).  
SELECT visibility policies that only use `is_group_member` / `get_user_group_ids`.

---

## 8. Before / after behavior

| Actor | Before (prod S0-A) | After Cut 1 (intended) |
|-------|--------------------|------------------------|
| Active member | Member visibility + member writes that use `is_group_member` | Visibility unchanged. Member **writes** on §7.4 policies require active (already true for this actor) |
| Active owner/admin / permission holder | Full operational authority | Unchanged |
| `pending_approval` | Helpers true (status-blind). App interstitial. DB may still SELECT via `is_group_member` / `get_user_group_ids` and pass admin helpers if role were elevated (should not be) | Admin/permission/owner helpers **false**. `is_group_member` still true (visibility). Pending INSERT path `memberships_insert_pending` unchanged. **PENDING WORKFLOW ALLOWED** |
| `suspended` owner/admin | Helpers true → can admin peers, phones RPCs, obligations, announcements, minutes, transfers | Helpers **false**. Privileged reads via those helpers **false**. Own-row financial via `can_view_member_financial` own clause (`!= exited`) still possible |
| `exited` (1 row in prod S0-B) | Helpers true if role still owner/admin (role never cleared — vocabulary doc). Can still pass admin RPCs / RLS | Admin/permission **false**. `is_group_member` still true → **group-wide SELECT still possible** until historical contract. That residual is **accepted for Cut 1** and marked SEPARATE CONTRACT — **not** silently closed |
| `archived` | Same as status-blind | Same as suspended for ops helpers (deny). Personal history **not invented** |
| Dual-group user (active A, exited B) | `get_user_group_ids` returns A and B; admin of B still works | `get_user_group_ids` still A and B (unchanged). `is_group_admin(B)` **false**. `get_user_active_group_ids` returns A only |
| Cross-tenant | Should already deny via group_id mismatch | Must remain deny. Position cross-tenant grant closed in `has_group_permission` |
| Service role / `auth.uid()` NULL | DEFINER triggers skip (`00075`); RPCs raise or skip | Unchanged **SERVICE/SYSTEM ONLY**. Helpers with NULL uid return false |
| Anon | Table grants exist (S0-A); RLS intended gate. `has_group_permission` executable by anon (`00072`) | Anon execute revoked on touched functions. Anon still **DENY** on authenticated policies |
| F3 (unapplied) | N/A | `has_group_permission` false for inactive ⇒ `can_manage_finances` stays false |

---

## 9. Status matrix

Official values (S0-A live): `active`, `pending_approval`, `exited`, `suspended`, `archived`.  
`"pending"` is **not** a DB value (vocabulary doc).

| Status | `is_group_member` (unchanged) | `is_active_group_member` | `is_group_admin` / `_or_owner` / `is_group_owner` | `has_group_permission` | `get_user_group_ids` (unchanged) | `get_user_active_group_ids` |
|--------|-------------------------------|--------------------------|---------------------------------------------------|------------------------|----------------------------------|-----------------------------|
| `active` | true if row exists | true | true if role/perm matches | true if chain matches | includes group | includes group |
| `pending_approval` | true | **false** | **false** | **false** | includes group | **excludes** |
| `exited` | true | **false** | **false** | **false** | includes group | **excludes** |
| `suspended` | true | **false** | **false** | **false** | includes group | **excludes** |
| `archived` | true | **false** | **false** | **false** | includes group | **excludes** |
| no row | false | false | false | false | omitted | omitted |

Role `owner`/`admin` on a non-active row: **false** for all operational helpers.

---

## 10. Same-group position integrity

Required chain for `has_group_permission` after Cut 1:

```
auth.uid()
  → memberships.user_id = uid
  → memberships.group_id = gid
  → memberships.membership_status = 'active'
  → position_assignments.membership_id = memberships.id
  → position_assignments.ended_at IS NULL
  → group_positions.id = position_assignments.position_id
  → group_positions.group_id = gid          -- SAME TENANT
  → position_permissions.position_id = group_positions.id
  → position_permissions.permission = perm_key
```

Owner/admin short-circuit runs **only after** the active membership row for `(gid, uid)` is found. It must **not** read a membership in group B to authorize group A.

Optional constraint trigger: reject `position_assignments` insert/update when membership.group_id ≠ position.group_id.

S0-A: same-group composites **MISSING** for attendance, loans, fines, election candidates/positions, savings. Those constraints are **not** Cut 1 unless listed in §7.7.

---

## 11. F0 / F3 impact

| Track | Pin | Cut 1 rule |
|-------|-----|------------|
| F0 | `99e17e2b4f4dc16753843f1e115312e70a8ae8ca` | **Do not apply.** Ledger epoch relations **NOT PRESENT** (S0-A). No Cut 1 dependency |
| F3 | `c7b4cd535d7125737eab2ec0fad27cae9432e8c3` | **Do not apply.** Preserve semantic freeze |

F3 `financial_core.can_manage_finances` (foundation file `20260908154824_f3_core_ledger_foundation.sql`):

```
auth.uid() IS NOT NULL
AND EXISTS (memberships m WHERE m.group_id = p_group_id
            AND m.user_id = auth.uid()
            AND m.membership_status = 'active')
AND public.has_group_permission(p_group_id, 'finances.manage', auth.uid())
```

`can_view_finances` uses the same active EXISTS plus `finances.view` OR `finances.manage`.

**Compatibility**

- Today `has_group_permission` can be true for an inactive owner. F3 still denies via its own active EXISTS — **safe if F3 were applied first**.
- After Cut 1, `has_group_permission` is also false for inactive — **stricter AND, never weaker**.
- Cut 1 must **not** make `has_group_permission` ignore its `uid` argument or treat owner without active membership as true.
- Cut 1 must **not** create `financial_core` objects.
- Future F3 apply remains production-baseline + forward-only (S0-C). Prefer a bounded compatibility/precondition migration over editing frozen F3 files.

---

## 12. Service / system behavior

| Caller | Cut 1 |
|--------|-------|
| `auth.uid()` NULL (service_role, many triggers) | `00075` self-escalation trigger already early-returns. Helpers return false for NULL uid. **Do not** add `auth.uid()` checks that break service-role DEFINER writes that currently rely on NULL skip |
| Cron / producers | Must keep working via service_role (RLS bypass) or existing DEFINER. **No notification sends** in planning or Cut 1 apply |
| `GRANT … TO service_role` on new helpers | Only if rehearsal names a non-bypass caller. Default: authenticated only |
| Platform staff (`is_platform_staff`) | Unchanged. Staff policies are **not** rewritten in Cut 1 |
| Africa's Talking / WhatsApp / Resend | **ZERO messages.** Cut 1 is authz SQL only |

---

## 13. Historical access preservation

**Do not invent** a broad historical access model in Cut 1.

| Path | Cut 1 stance |
|------|----------------|
| Own membership row (`user_id = auth.uid()`) | **SELF/HISTORICAL READ ALLOWED** — keep existing self clauses |
| Own payments/obligations via `can_view_member_financial` own clause (`!= 'exited'`) | **Preserved** (pending/suspended/archived can still read own money rows; exited already excluded by 00108) |
| Own election vote receipt (`evr_select_own`) | **Preserved** (membership_id + user_id; no helper) |
| Group-wide SELECT via `is_group_member` / `get_user_group_ids` for exited/archived | **UNDEFINED.** Mark **SEPARATE HISTORICAL ACCESS CONTRACT REQUIRED.** Cut 1 **fails closed for ops** but **leaves** these helpers unchanged — residual P0-A visibility leak **accepted** until that contract |
| Peer finance / phones / claim tokens | Must become **deny** for inactive via helper REPLACE / `create_proxy_member` |
| Published minutes / announcements / closed ballots for exited members | **UNDEFINED** — leave `is_group_member`; do not add new allow rules |

A later historical-access cut may introduce `is_visible_group_member` or status-aware SELECT policies. That is **not** Cut 1.

---

## 14. Behavioral test matrix

Legend: **A** = ALLOW · **D** = DENY · **N** = NOT IN CUT SCOPE (must not regress; do not require change).  
Commands: R/I/U/Del/RPC.

Rehearsal actors: unauthenticated, `anon`, authenticated with **no** membership, active member, active owner, active admin (role, no positions), active permission-holder (non-admin role + same-group position), `pending_approval`, `suspended` (including suspended **owner**), `exited` (including exited **owner** — prod has 1 exited), `archived`, dual-group (active A + exited-admin B), cross-tenant (member of A acting on B), stale JWT (valid user, membership changed under them), direct RPC/PostgREST, service_role.

| Surface | UNAUTH | ANON | Active member | Active owner/admin | Active perm | Pending | Suspended owner | Exited owner | Archived | Dual-group B=exited admin | Cross-tenant | Stale session | Direct RPC | Service role |
|---------|--------|------|---------------|--------------------|-------------|---------|-----------------|--------------|----------|---------------------------|--------------|---------------|------------|--------------|
| `is_group_admin(G)` / `_or_owner` / `has_group_permission` | D | D | D unless perm/admin | A | A if key matches + same group | D | D | D | D | D on B; A on A if active admin | D | D if membership no longer active | D if helper false | N (bypass RLS; helper still false if uid null) |
| `is_group_member(G)` | D | D | A | A | A | A | A | A | A | A on A and B | D | A if row exists | A if row | N |
| `is_active_group_member(G)` | D | D | A | A | A | D | D | D | D | A on A; D on B | D | D if not active | per status | N |
| `groups` UPDATE | D | D | D | A | D unless also admin helper | D | D | D | D | D on B | D | D | D | N |
| `memberships` DELETE self | D | D | A (self) | A self | A self | A self | A self | A self | A self | A self | D | A self if uid matches | N | N |
| `memberships` DELETE other | D | D | D | A | D | D | D | D | D | D on B | D | D | D | N |
| `rls_pay_insert` (after migrate) | D | D | A (own pending_confirmation) | A if also member-active path | A if policy allows | D | D | D | D | D on B | D | D | D | N |
| `rls_co_insert/update` | D | D | D | A | A if finances/contributions perm | D | D | D | D | D on B | D | D | D | N |
| `mm_insert` / `ann_insert` | D | D | D | A if perm/admin/owner | A | D | D | D | D | D on B | D | D | D | N |
| `pct_manage` | D | D | D | A if members.manage | A | D | D | D | D | D on B | D | D | D | N |
| `get_member_phones` / roster contacts | D | D | D | A | D (admin helper, not perm) | D | D | D | D | D on B | D | D | D | N |
| Transfer RPCs `00082` | D | D | self-request paths per existing body | A | D unless admin helper | D | D | D | D | D on B | D | D | D | N |
| `create_proxy_member` | D | D | D (after Cut 1; today A if any member) | A | A if members.manage | D | D | D | D | D on B | D | D | D | N |
| `cast_ballot` | N | N | N | N | N | N | N | N | N | N | N | N | N | N |
| `notifications_queue` INSERT | N | N | N | N | N | N | N | N | N | N | N | N | N | N |
| Storage INSERT NULL path | N | N | N | N | N | N | N | N | N | N | N | N | N | N |
| Own payment SELECT (`can_view_member_financial` own) | D | D | A | A | A | A | A | D (00108 `!= exited`) | A | A own | D | A if own clause | N | N |
| Peer payment SELECT (admin helper path) | D | D | D | A | A if finances.* | D | D | D | D | D on B | D | D | D | N |

Stale session: JWT valid, membership status flipped to exited/suspended under the user → operational helpers **D**.

---

## 15. Regression matrix

Must remain true after Cut 1:

| # | Check |
|---|--------|
| R1 | Active owner can still update `groups`, manage minutes/announcements with permission, record obligations |
| R2 | Active treasurer (`finances.record` / `finances.manage`) still passes `has_group_permission` **only** via same-group position |
| R3 | Active plain member can still SELECT published minutes / sent announcements / own membership / own finance rows |
| R4 | `memberships_insert_pending` still allows pending self-insert (00076) |
| R5 | `create_owner_membership` / `accept_invitation` / `join_group_via_code` still work (DEFINER; not rewritten) |
| R6 | Self leave DELETE (`user_id = auth.uid()`) still works for active **and** for leaving (do not require active on the self-leave clause) |
| R7 | `can_view_member_financial` own-row for pending/suspended **unchanged** |
| R8 | `evr_select_own` unchanged |
| R9 | `cast_ballot` unchanged (P1 residual remains documented) |
| R10 | Service-role cron / queue drain **authorization** unchanged; **no messages sent** during test |
| R11 | F3 unapplied; no `financial_*` tables created |
| R12 | `is_group_member` / `get_user_group_ids` pg_proc body hash unchanged |
| R13 | 00001–00113 file hashes unchanged |
| R14 | Dual-group: active group A operations still ALLOW |
| R15 | Cross-tenant still DENY |
| R16 | HQ relief rollup: **no silent zeroing** without an explicit qualified change to `get_relief_branch_summary` |
| R17 | 00108+00109 peer-finance deny for plain members still holds |
| R18 | Proxy **claim** (`claim_proxy_membership` / token flow) still works for the claimant (service/definer) |

---

## 16. Disposable rehearsal plan (never production)

**Forbidden:** apply to `llbnliixczcqfftxpsmb`. No in-place restore (S0-B). No real outbound messages.

**Allowed targets**

1. **S0-C style disposable Postgres** using production **baseline pack** (strategy A+B), **not** naive `00001`…`00113` replay (S0-C blank replay = FAIL).
2. **Isolated restore-derived project** in the S0-B pattern (`Restore to new project`; temp ref ≠ `llbnliixczcqfftxpsmb`). S0-B dest `fwosdtxdtwtqgvtejmkr` was **deleted** after proof — spin a **new** isolated restore if a data-shaped rehearsal is required.
3. Local Supabase only if extensions live in `extensions` and roles `anon`/`authenticated`/`service_role` exist.

**Rehearsal steps (Cut 1)**

1. Record temp project ref; assert ≠ `llbnliixczcqfftxpsmb`.
2. Dump `pg_proc` for the five helpers + `is_group_owner` + `create_proxy_member` + `has_group_permission` grants.
3. Dump `pg_policies` where `qual`/`with_check` matches `is_group_member|is_group_admin|is_group_admin_or_owner|has_group_permission|get_user_group_ids|is_group_owner`.
4. Diff dump vs §7 allowlist → extras = **HOLD** (do not improvise drops).
5. Apply **one** forward-only Cut 1 migration in a transaction; loud preconditions.
6. Execute §14 / §15 as SQL under `authenticated` SET ROLE / JWT claims — counts and booleans only (no PII).
7. Confirm `is_group_member` / `get_user_group_ids` bodies unchanged.
8. Neutralize outbound (`pg_cron`/`pg_net`/http) as S0-B documented.
9. Destroy temp project only after evidence committed; re-check prod still `ACTIVE_HEALTHY`.

**Phase 10 — disposable behavioral rehearsal: DEFERRED.**  
The 2026-09-10 live catalog (`public_policy_count=375`, `helper_policy_count=145`, named helpers, B2–B5 closures) is **sufficient** to close §5.7 dependency blockers and flip this plan to **READY FOR DAYBREAK SECURITY REVIEW**. Phase 10 SQL behavioral matrix (§14 / §15) remains required **before implement**, on a disposable target only — it does **not** block Daybreak review. Catalog ≠ apply.

**Never** use rehearsal as production apply.

---

## 17. Migration design rules

S0-C production forward-migration contract + security pins 1–10 and F1–F6:

1. **ONE** new forward-only file (timestamped). Never edit `00001`–`00113`. Never “apply everything pending.”
2. Single transaction (S0-C F3).
3. Loud preconditions (`RAISE` on unexpected helper signatures, missing tables, extra write policies, fingerprint DRIFT without explicit accept).
4. `SET search_path = ''` on DEFINER (pin 1); qualify `public.` / `auth.`.
5. After each FUNCTION: `REVOKE ALL FROM PUBLIC, anon` then minimal GRANT (F2).
6. Auth-before-disclosure in DEFINER bodies (F1).
7. Write-path remediations use **active-membership** primitive (F4) — `is_active_group_member` / tightened admin/permission helpers, not status-blind `is_group_member` alone.
8. Do not ENABLE/FORCE RLS changes except where a named policy replace requires it. No opportunistic FORCE on unrelated tables (F5 only if Cut 1 touches a client table that denies owner bypass — **not expected**).
9. Postconditions: helper status predicates, grant state, `is_group_member` unchanged, no PII in evidence (F6).
10. Same-tenant join in `has_group_permission` (pin 5).
11. Destructive DDL: none expected. If constraint trigger is added, recovery design = S0-B isolated restore (already proven).
12. Do not encode 00061 `!= 'exited'` as the operational predicate.
13. Do not rename `is_group_admin_or_owner(p_group_id)` to `gid`.

---

## 18. Forward-recovery plan

If Cut 1 misbehaves after a future authorized apply:

| Option | Allowed? |
|--------|----------|
| Forward-fix migration tightening/loosening a **named** helper or policy | **YES** (preferred) |
| Restore production to re-open status-blind operational authority | **NEVER** |
| In-place rewind of production | **FORBIDDEN** without new founder auth (S0-B tree) |
| Isolated restore to inspect | **YES** (S0-B pattern) |
| Re-apply 00061 / 00098 / 00102 as “fix” | **NO** |

Known residual after Cut 1 (not a restore trigger): exited members may still **SELECT** group-visible rows via unchanged `is_group_member` / `get_user_group_ids`. That is an accepted Cut 1 gap pending the historical-access contract — **not** a reason to revert operational gates.

---

## 19. Cut 2 contract (bounded planning only — no real sends)

**P0-B:** policy `Authenticated users can queue notifications` on `public.notifications_queue`  
`WITH CHECK (auth.uid() IS NOT NULL)`.

**Cut 2 intent (later migration; not this PR)**

- DROP/REPLACE that INSERT policy.
- INSERT allowed only for:
  - **SERVICE/SYSTEM ONLY** (service_role / `auth.uid()` NULL DEFINER producers that already write the queue), **or**
  - a **named** producer gate: authenticated caller **and** active membership in a tenant that appears in `data` **and** a permission/key allowlist — exact predicate **UNKNOWN until producer inventory** (PR #70 schema is CREATE-NOT-APPLY and **not** live; `to_regclass('public.notification_policies')` = NULL per S0-A).
- SELECT/UPDATE stay `is_platform_staff()` (or equivalent). Do not widen SELECT.
- Do **not** send WhatsApp/SMS/email to prove the lock.
- Do **not** apply `00097` or PR #70 as Cut 2.
- Drain cron (`drain-notification-queue`) must keep `isAfricanPhoneNumber()` re-validation (existing compliance rule) — **out of Cut 2 SQL** but must not regress.
- Prefer depending on Cut 1 active helpers rather than status-blind `is_group_member`.
- Independent cut; one forward-only file.

**Cut 2 Daybreak:** cannot PASS until producer INSERT call-sites are listed (app + cron + DEFINER) on disposable evidence. **Not started.**

---

## 20. Cut 3 contract (bounded)

**P0-C:** storage INSERT fail-open when `storage_path_group_id(name) IS NULL`. SELECT stronger (v2); `00112` **not** in prod log.

**Cut 3 intent (later; not this PR)**

| Parse result | INSERT | UPDATE | DELETE |
|--------------|--------|--------|--------|
| NULL / invalid UUID / non-group path | **DENY** | **DENY** | **DENY** |
| Valid UUID, caller not active member of that group | **DENY** | **DENY** | **DENY** |
| Valid UUID, active member, receipts/gdocs write | ALLOW (member write) | ALLOW if today allowed | DENY unless active admin (keep admin-delete) |
| Foreign / other-tenant UUID | **DENY** | **DENY** | **DENY** |
| `avatars` own-uid prefix | unchanged (not group-path fail-open) | unchanged | unchanged |

Private **SELECT** (`receipts` / `group-documents`): **unchanged or stronger**. Do not re-introduce `"Anyone can view receipts"` / `"Anyone can view group documents"`. Do **not** apply 00112 as-is (it still fail-opens SELECT when v2 parse is NULL). Cut 3 may introduce a v2 parser **and** deny NULL on **writes**; SELECT NULL policy is a separate qualification (`projects/{projectId}/…` is a known non-group path — **UNKNOWN** whether those objects exist; fail-closed on write; SELECT must be explicitly qualified, default DENY).

Use `is_active_group_member` / `is_group_admin` (post-Cut 1) for group-scoped writes/deletes (S0-C F4).

---

## 21. Daybreak handoff contract

**Daybreak handoff: READY FOR REVIEW.**  
Implement Cut 1 remains **FORBIDDEN** until Daybreak issues **PASS**. This planning flip is docs/evidence only.

| Gate | Result |
|------|--------|
| Authority pins exact | PASS |
| P0s limited to S0-A A/B/C | PASS |
| Cut order 1→2→3 | PASS |
| Cut 1 helper contract (active ops; do not globalize `is_group_member`) | PASS (design) |
| Exact object scope (functions) | PASS — finalized §7.1–7.3 / §24 |
| Exact object scope (policies) | PASS — B2 named; B3 collision absent; neutralize + helper-write REWRITE lists finalized §7.4–7.6 / §24 |
| Critical operational callers classified | PASS — §5.7 CLOSED |
| F3 never weaker | PASS (design) |
| Historical access not invented | PASS |
| Relief HQ | PASS as **SEPARATE PHASE** (B4) — leave `get_relief_branch_summary` / `get_user_group_ids` |
| Election legacy | PASS as **REMOVED** (B5) — `election_votes` / `rls_evote_insert` NOT PRESENT |
| Phase 10 disposable behavioral | **DEFERRED** — catalog sufficient for review; required before implement |
| No implement / no prod apply in this PR | PASS |

**Implement is forbidden** until Daybreak security review **PASS**. A Daybreak PASS still does **not** authorize production apply without a separate founder-authorized apply step.

Prior flip criteria (now met by the 2026-09-10 live catalog + this addendum):

1. Live helper-matching `pg_policies` + `pg_proc` catalog (`375` / `145`).
2. WRITE / RPC / privileged-read extras named and classified (§24).
3. Duplicate permissive memberships UPDATE confirmed **absent**; remaining inline-role writes added to §7.6 / §24 REWRITE list.
4. Proxy INSERT policy name recorded (`Admins can add proxy members`).
5. `get_relief_branch_summary` HQ path classified as SEPARATE RELIEF PHASE.

---

## 22. Non-goals

- No application code, UI, i18n, or env/provider changes.
- No SQL remediation migration in this PR.
- No production apply / MCP write / dashboard SQL.
- No F0 / F3 / PR #69 / #70 / #71 merge or apply.
- No member, payment, storage, or queue row mutation.
- No real SMS / WhatsApp / email / push.
- No PITR enablement.
- No rewrite of `00001`–`00113`.
- No global `is_group_member` → active-only.
- No invented historical peer visibility.
- No `cast_ballot` active-status fix (P1).
- No 00098 lifecycle / self-freeze apply.
- No 00112 apply-as-written.
- No notification_policies / agentic_action_intents.
- No TRUNCATE grant cleanup (P1).
- No service-worker cache work (P1).
- No implementing Cut 1 / 2 / 3.

---

## 23. STOP rules

Stop and HOLD (do not improvise) if any of the following occur:

1. Pressure to implement Cut 1/2/3 in this branch or against production.
2. Request to apply or merge F0, F3, PR #69, #70, or #71.
3. Request to edit `00001`–`00113` or “just run 00061.”
4. Request to redefine `is_group_member` or `get_user_group_ids` to active-only globally.
5. Request to restore/rewind production or re-introduce status-blind operational helpers.
6. Live rehearsal discovers extra WRITE/RPC helper callers not in §7 — **do not drop them ad hoc**.
7. Duplicate permissive policy would leave an exited admin able to write after helper REPLACE.
8. Any plan change that makes F3 `can_manage_finances` weaker than `active AND has_group_permission`.
9. Any message send, member/payment/storage mutation, or prod SQL write.
10. Treating `00098`, `00112`, `00102`, `00103`, or PR #70 as live.
11. Inventing historical access rules to “make exited members work.”
12. Using 00061's `!= 'exited'` as the operational predicate.
13. Renaming `is_group_admin_or_owner(p_group_id)` in a way that 42P13-fails REPLACE.
14. Daybreak starting implementation before Daybreak security review **PASS**, or any implement while this document still forbids it.

---

## Planning verdict (this artifact)

| Item | Value |
|------|-------|
| Overall recommended verdict | **PASS — CUT 1 DEPENDENCIES CLEARED; READY FOR DAYBREAK SECURITY REVIEW** |
| Daybreak implement Cut 1 | **FORBIDDEN** until Daybreak **PASS** |
| Why PASS (dependencies) | Live catalog closed B1–B5: 375 public / 145 helper policies; proxy INSERT named; memberships UPDATE collision absent; relief HQ separate phase; `election_votes` not present; neutralize REWRITE list finalized |
| What remains forbidden | Cut 1/2/3 migration authorship and apply; any prod SQL write; Phase 10 is deferred but still required before implement |
| What is frozen | Pins; P0 trio; order Cut1→2→3; active-only operational helper contract; F3 compatibility; migration rules; Cut 2/3 bounded contracts; STOP rules; §7 / §24 object lists |
| Prod apply | ZERO |
| Historical migrations modified | NO |
| Mutations / messages | ZERO |

**Next authorized step (not automatic):** Daybreak security review of this contract + inventory. Implement remains forbidden until Daybreak **PASS**. Phase 10 disposable behavioral rehearsal stays deferred until then.

---

## 24. CUT 1 DEPENDENCY CLEARANCE ADDENDUM

**Date:** 2026-09-10  
**Source:** live production Supabase `llbnliixczcqfftxpsmb`, **read-only** catalog  
**Companion evidence:** `docs/evidence/S0_CUT1_LIVE_POLICY_FUNCTION_INVENTORY_20260910.json`  
**Production mutation:** ZERO  
**Remediation migration in this PR:** NONE  
**App code in this PR:** NONE  
**Phase 10 disposable behavioral:** **DEFERRED** (catalog sufficient for dependency clearance)

### 24.1 Overall flip

| Item | Value |
|------|-------|
| Prior verdict (tip `8d621b6baecf432dfc2ea7adfc6c8763725fb81b`) | **HOLD** |
| This addendum | **PASS — CUT 1 DEPENDENCIES CLEARED; READY FOR DAYBREAK SECURITY REVIEW** |
| Implement | **FORBIDDEN** until Daybreak **PASS** |
| Catalog | `public_policy_count=375`; `helper_policy_count=145` |
| New helpers present? | `is_active_group_member` **absent**; `get_user_active_group_ids` **absent** |
| Live CHECK | `memberships_membership_status_check` = `active \| pending_approval \| exited \| suspended \| archived` |

Do **not** redefine `is_group_member` or `get_user_group_ids` globally. Leave SELECT visibility helpers unchanged. Keep `memberships_insert_pending`.

### 24.2 Live helper / adjacent-function semantics (sanitized)

| Function | Live semantic (2026-09-10) | Cut 1 |
|----------|----------------------------|-------|
| `is_group_member` | `EXISTS` `memberships` by `group_id`+`user_id`; **NO status**; DEFINER; `search_path` unset | **UNCHANGED** |
| `get_user_group_ids` | `SELECT group_id FROM memberships WHERE user_id = uid`; **NO status** | **UNCHANGED** |
| `is_group_admin` | role check only; **NO status** | **REPLACE** — add `membership_status = 'active'` |
| `is_group_admin_or_owner(p_group_id)` | role check only; **NO status** | **REPLACE** — add active; keep `p_group_id` |
| `is_group_owner` | role check only; **NO status** | **REPLACE** — add active |
| `has_group_permission` | membership by group+user; owner → true; admin → true if 0 open `position_assignments`; else `pa` → `pp` on `membership_id`; **NO** `membership_status`; **NO** `gp.group_id = gid` join | **REPLACE** — require active + `JOIN group_positions gp ON gp.id = pa.position_id AND gp.group_id = gid` |
| `create_proxy_member` | `role IN ('owner','admin','moderator')`; **NO status**; DEFINER; `search_path` unset | **REPLACE** — keep moderator; add active. Do not apply `00103` as-is |
| `get_relief_branch_summary` | org boundary via `get_user_group_ids()` | **SEPARATE RELIEF PHASE** / **UNAFFECTED** by Cut 1 admin REPLACE |
| `cast_ballot` | `standing = 'good'` only; **NO** `membership_status` | **P1 — out of Cut 1** |
| `can_view_member_financial` | own `!= 'exited'` **OR** `is_group_admin_or_owner` **OR** position perms `!= 'exited'` | **UNCHANGED** body; privileged branch **benefits** from admin REPLACE |
| `is_active_group_member` / `get_user_active_group_ids` | **absent** | **CREATE** |

### 24.3 Blocker matrix (B1–B5)

| ID | Status | Finding |
|----|--------|---------|
| B1 | **CLOSED** | Exhaustive live counts: 375 public policies, 145 helper-matching. New active primitives absent. Five-value CHECK confirmed |
| B2 | **CLOSED** | Exact proxy INSERT named below. Cut 1 **MUST REWRITE** |
| B3 | **CLOSED** | `"Group owners/admins can update memberships"` **NOT PRESENT**. Live UPDATE = `memberships_update_own` + `rls_membership_role_guard`. Helpers-only REPLACE is **insufficient** for the neutralize list — those names **REWRITE** |
| B4 | **CLOSED** | Relief HQ = **SEPARATE PHASE**. Leave `get_relief_branch_summary` |
| B5 | **CLOSED** | `election_votes` / `rls_evote_insert` **NOT PRESENT**. Superseded by `election_vote_receipts` + `election_ballots` + `cast_ballot`. **REMOVED from Cut 1** |

### 24.4 B2 — exact live proxy INSERT

| Field | Live value |
|-------|------------|
| Table | `memberships` |
| Policy | **`Admins can add proxy members`** |
| Command | INSERT |
| Roles | `{public}` |
| `WITH CHECK` | `((is_proxy = true) AND (proxy_manager_id = auth.uid()) AND (group_id IN ( SELECT get_user_group_ids(auth.uid()))))` |
| Cut 1 | **REWRITE** to active operational authority. Helpers-only REPLACE of admin functions does **not** close this (it never calls them) |

### 24.5 Position gap

No same-group constraint on `position_assignments` (two FKs, no composite / no trigger proving `memberships.group_id` = `group_positions.group_id`).

Cut 1 `has_group_permission` REPLACE **must** include:

```
JOIN public.group_positions gp
  ON gp.id = pa.position_id
 AND gp.group_id = gid
```

Optional: constraint trigger `position_assignments_membership_position_same_group` (§7.7).

### 24.6 Final Cut 1 object set

| Action | Objects |
|--------|---------|
| **CREATE** | `is_active_group_member(gid uuid, uid uuid DEFAULT auth.uid())`; `get_user_active_group_ids(uid uuid DEFAULT auth.uid())` |
| **REPLACE** | `is_group_admin`; `is_group_admin_or_owner`; `is_group_owner`; `has_group_permission` (active + same-group `gp` join); `create_proxy_member` (active + keep `owner/admin/moderator`) |
| **REWRITE** | All §24.7 NEUTRALIZE names **plus** §24.8 named member-write helper policies |
| **OPTIONAL** | `position_assignments` same-group trigger |
| **UNCHANGED** | `is_group_member`; `get_user_group_ids`; SELECT visibility policies; `memberships_insert_pending`; `can_view_member_financial` body; `cast_ballot`; `get_relief_branch_summary` |
| **REMOVED** | `election_votes` / `rls_evote_insert` |

### 24.7 Neutralize table — inline-role / status-blind WRITE (helpers-only REPLACE is insufficient)

Cut 1 **MUST REWRITE** each live name below (add an **active** operational gate). SELECT-only siblings are **out of rewrite** unless listed. Names are the live policy identifiers from the 2026-09-10 catalog pattern list, expanded to exact strings.

| Table | Policy name | Why neutralize |
|-------|-------------|----------------|
| `payments` | `Group admins and treasurers can record payments` | inline treasurer/admin; no status |
| `fines` | `Admin manage fines` | inline admin role |
| `fine_types` | `fine_types_admin` | inline admin role |
| `event_attendances` | `Group admins can manage attendance` | inline admin role |
| `position_assignments` | `Group owners/admins can manage assignments` | inline admin role; no same-group constraint |
| `hosting_rosters` | `Group admins can manage hosting rosters` | inline admin role |
| `hosting_assignments` | `Group admins can manage hosting assignments` | inline admin role |
| `elections` | `Admins can manage elections` | inline admin role |
| `election_options` | `Admins can manage options` | inline admin role |
| `documents` | `Admins can manage documents` | inline admin role |
| `projects` | `Admin manage projects` | inline admin role |
| `project_milestones` | `Admin manage milestones` | inline admin role |
| `project_expenses` | `Admin manage expenses` | inline admin role |
| `savings_cycles` | `Admins can manage savings cycles` | inline admin role |
| `savings_participants` | `Admins can manage participants` | inline admin role |
| `savings_contributions` | `Admins can manage contributions` | inline admin role |
| `relief_plans` | `Group admins can manage relief plans` | admin write; inline role |
| `relief_enrollments` | `Admins can manage enrollments` | admin write |
| `relief_enrollments` | `relief_enrollments_insert` | admin write |
| `relief_enrollments` | `relief_enrollments_update` | admin write |
| `relief_enrollments` | `relief_enrollments_delete` | admin write |
| `relief_claims` | `Members can submit claims` | member write; no status |
| `relief_claims` | `Admins can manage claims` | admin write |
| `relief_claims` | `relief_claims_insert` | member write |
| `relief_claims` | `relief_claims_update` | admin write |
| `relief_claims` | `relief_claims_delete` | admin write |
| `relief_payouts` | `Admins can manage payouts` | admin write |
| `relief_payouts` | `relief_payouts_insert` | admin write |
| `relief_payouts` | `relief_payouts_update` | admin write |
| `relief_payouts` | `relief_payouts_delete` | admin write |
| `relief_remittances` | `relief_remittances_insert` | admin/member write |
| `relief_remittances` | `relief_remittances_update` | admin/member write |
| `contribution_types` | `Group admins can manage contribution types` | inline admin |
| `contribution_types` | `Group admins can update contribution types` | inline admin |
| `contribution_types` | `Group admins can delete contribution types` | inline admin |
| `contribution_obligations` | `Group admins can manage obligations` | inline admin |
| `contribution_obligations` | `Group admins can update obligations` | inline admin |
| `payment_reminder_rules` | `Admin manage reminder rules` | inline admin |
| `group_constitutions` | `Admins can manage constitutions` / live `rls_const_insert` | admin write (rewrite if inline; inherit if helper-only) |
| `group_constitutions` | `rls_const_update` | admin write |
| `group_constitutions` | `rls_const_delete` | admin write |
| `constitution_amendments` | `Admins can manage amendments` / live `rls_amend_update` | admin write |
| `constitution_amendments` | `rls_amend_delete` | admin write |
| `activity_feed` | `Members insert feed` | member write |
| `activity_feed` | `Admin update feed` | admin write |
| `feed_reactions` | `Members react` | member write |
| `events` | `Group admins can create events` | inline admin |
| `events` | `Group admins can update events` | inline admin |
| `events` | `Group admins can delete events` | inline admin |
| `invitations` | `Group admins can create invitations` | inline admin |
| `invitations` | `Group admins can update invitations` | inline admin |
| `invitations` | `Group admins can delete invitations` | inline admin |
| `group_payment_config` | `Group admins can manage payment config` | inline admin |
| `group_subscriptions` | `Admins can manage subscription` | inline admin |
| `loan_configs` | `loan_configs_insert` | inline admin |
| `loan_configs` | `loan_configs_update` | inline admin |
| `loan_configs` | `loan_configs_delete` | inline admin |
| `loans` | `loans_insert` | member/admin write; no status |
| `loans` | `loans_update` | inline admin |
| `loans` | `loans_delete` | inline admin |
| `loan_repayments` | `loan_repayments_insert` | inline admin |
| `loan_repayments` | `loan_repayments_update` | inline admin |
| `loan_repayments` | `loan_repayments_delete` | inline admin |
| `loan_schedule` | `loan_schedule_insert` | inline admin |
| `loan_schedule` | `loan_schedule_update` | inline admin |
| `loan_schedule` | `loan_schedule_delete` | inline admin |
| `loan_requests_v1` | live write policies on `loan_requests_v1` (`rls_lr_all` / `Members request loans` / `Admin manage loans` if attached) | legacy write; no status |
| `disputes` | `disputes_admin` | inline admin |
| `committees` | `Admins can manage committees` | inline admin |
| `committee_members` | `Admins can manage committee members` | inline admin |
| `sub_group_transfers` | `Users can create transfers` | member write + `get_user_group_ids` |
| `sub_group_transfers` | `Admins can update transfers` | inline admin |
| `member_transfers` | `transfers_delete` | write |
| `exchange_rates` | `HQ admins can manage exchange rates` | HQ admin write |
| `family_members` | `rls_fm_insert` | write (`rls_fm_select` unchanged) |
| `family_members` | `rls_fm_update` | write |
| `family_members` | `rls_fm_delete` | write |
| `event_photos` | `Members upload photos` | member write |
| `project_contributions` | `Members contribute to projects` | member write |

If a named row is absent at apply time, the migration **skips that name** (loud `NOTICE`) and does **not** improvise a substitute. Extras not in this table or §24.8 remain **STOP** (§23.6).

### 24.8 Named member-write helper policies (REWRITE)

| Table | Policy name | Command |
|-------|-------------|---------|
| `payments` | `rls_pay_insert` | INSERT |
| `event_attendances` | `rls_att_insert` | INSERT |
| `feed_reactions` | `rls_fr_insert` | INSERT |
| `project_contributions` | `rls_pcon_write` | INSERT |
| `event_rsvps` | `rls_rsvp_insert` | INSERT |
| `event_photos` | `rls_ep_insert` | INSERT |
| `constitution_amendments` | `rls_amend_insert` | INSERT |
| `payment_reminders_sent` | `rls_prs_insert` | INSERT |
| `activity_feed` | `rls_af_all` | ALL (write path) |
| `fines` | `rls_fin_update` | UPDATE |
| `announcement_deliveries` | `rls_ad_update` | UPDATE |
| `disputes` | `Users can create disputes` | INSERT |
| `disputes` | `Users can update disputes` | UPDATE |
| `disputes` | `Users can delete disputes` | DELETE |
| `disputes` | `disputes_insert` | INSERT |
| `group_audit_logs` | `member_insert_audit_logs` | INSERT |
| `memberships` | `Admins can add proxy members` | INSERT |
| `hosting_swap_requests` | `rls_hsr_insert` | INSERT |

**Not rewritten:** SELECT visibility via `is_group_member` / `get_user_group_ids`.  
**Kept:** `memberships_insert_pending`.  
**Removed from this list:** `rls_evote_insert`.

### 24.9 Election / relief disposition

| Object | Live | Cut 1 |
|--------|------|-------|
| `election_votes` | **NOT PRESENT** | **REMOVED** |
| `rls_evote_insert` | **NOT PRESENT** | **REMOVED** |
| `election_vote_receipts` | present (superseding) | leave (`evr_select_own` historical) |
| `election_ballots` | present (superseding) | leave |
| `cast_ballot` | `standing=good` only | **P1 out of Cut 1** |
| `get_relief_branch_summary` | org via `get_user_group_ids()` | **SEPARATE RELIEF PHASE** — leave |
| Relief admin/member **write** policies | present (named in §24.7) | **REWRITE** (local write authority). HQ rollup function itself is not rewritten |

### 24.10 Phase 10

Disposable behavioral rehearsal (§14 / §15 / §16) is **DEFERRED**. The live catalog is sufficient to close §5.7 and hand Daybreak a reviewable contract. Phase 10 remains mandatory **before implement**, on a disposable target, never on `llbnliixczcqfftxpsmb`.
