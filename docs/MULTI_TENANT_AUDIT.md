# Multi-Tenant Isolation Audit (Build 2)

**Date:** 2026-06-13
**Scope:** Static code + RLS/migration audit of the "one account, many groups"
model — how the app keeps each group's data, views, and member-facing balances
separated, and where a multi-group member could be confused or a cross-tenant
read could leak. Internal developer document: provider/queue/RLS/migration terms
are used deliberately here. Customer-facing copy stays in plain language
("group", "switch group", "Headquarters", "Branch").

> **No sends and no data mutations were added in this build.** The in-PR changes
> are UI clarity (per-group labels, switcher affordances, a "My groups" view) and
> a data-isolation guard on the member-detail view. The one server-side
> isolation fix (a cross-tenant view leak) is delivered as migration **00102**,
> which is authored and tracked separately and is **NOT applied by this PR**.

---

## 1. Executive summary

VillageClaq is multi-tenant by `group_id`. A user signs up once (`profiles`),
and the `memberships` junction links them to many groups, each with its own
role, standing, and `display_name`. The active group is held in
`GroupProvider` (`src/lib/group-context.tsx`) and every data hook is scoped to
`groupId`.

Isolation is **largely solid at the data layer**: almost every group-scoped hook
in `src/lib/hooks/use-supabase-query.ts` already (a) includes `groupId` in its
TanStack `queryKey` and (b) filters the query by `group_id`, and `switchGroup()`
calls `queryClient.removeQueries()` so no previous-group data survives a switch.

This build closed the remaining gaps:

- **One HIGH server-side leak** (cross-tenant relief view) — fixed by migration
  00102 (not applied here).
- **One member-detail isolation gap** (detail sub-queries scoped only by
  membership id, not the active group) — fixed in-PR with an active-group guard.
- **Several clarity gaps** for multi-group members (no HQ/branch indicator, no
  per-group balance/standing label, no consolidated "My groups" view, join/accept
  not switching into the joined group) — fixed in-PR.

---

## 2. Classification table

| Surface | Mechanism | Status | Notes |
|---|---|---|---|
| **Active-group context** | `GroupProvider` → `useGroup()` | OK | Single source of truth: `groupId`, `currentMembership`, `currentGroup`, `memberships`, `isAdmin`. URL `?group=` / localStorage / first membership resolve the active group. |
| **Group switcher** | `switchGroup(groupId)` | OK + improved | Calls `queryClient.removeQueries()` on a real switch (anti-stale). This build added an HQ/Branch badge, search, and a one-vs-many empty state. |
| **Data isolation (hooks)** | `queryKey` includes `groupId` + `.eq("group_id", groupId)` | OK (guardrailed) | Verified for `useMembers`, `useObligations`, `usePayments`, `useEvents`, `useInvitations`, `useDashboardStats`, `useContributionTypes`, `useAnnouncements`, `useReliefPlans`, and more. Relation-scoped variants (e.g. `.eq("relief_plan.group_id", groupId)`) covered. |
| **Member detail isolation** | `members/[id]` sub-queries | FIXED in-PR | Previously scoped only by `membershipId`. An admin co-membered in another group could open a member belonging to that other group. Now guards: the loaded member's `group_id` must equal the active `groupId`, else a "wrong group" empty state. |
| **RLS (row level)** | Postgres policies + `get_user_group_ids()` | OK, with 1 leak fixed in 00102 | Most tables are correctly group-scoped via the `SECURITY DEFINER` helper. One owner-privilege VIEW bypassed RLS (see §3). |
| **Branch ↔ HQ** | `groups.group_level` (`standalone`/`hq`/`branch`), `organization_id` | OK + surfaced | `group_level` now drives the shared `GroupTypeBadge`. Cross-branch oversight is intentional for HQ but must stay org-bounded (00102). |
| **Roles** | `memberships.role` + `position_permissions` | OK + surfaced | Role is now shown to the member in the switcher and "My groups" so they understand their standing per group. `position_assignments`/`position_permissions` keep `USING(true)` by design (org-chart metadata, see §4). |

---

## 3. Cross-tenant view leak (HIGH) — fixed by migration 00102 (NOT applied)

**Finding.** `relief_branch_summary` (introduced in migration 00045) is a VIEW
created **without** `security_invoker` and `GRANT`ed to `authenticated`. It
therefore runs with the view owner's privileges and **bypasses RLS** on
`relief_plans` / `relief_enrollments` / `payments` / `relief_remittances`. Any
logged-in user could `SELECT * FROM relief_branch_summary` and read **every**
organization's branch financials (enrolled counts, collected-this-month,
total-remitted). Confirmed live: `pg_class.reloptions IS NULL` for the view.

**Fix (migration 00102).** Keep the aggregate's owner-privilege cross-branch
visibility (HQ oversight legitimately needs to see branches the HQ admin is not a
direct member of), but add an explicit **caller-organization boundary** in the
view body using `get_user_group_ids()` (which reads `auth.uid()`, so it is
caller-aware even inside an owner-run view). A branch summary row is now visible
only when its collecting branch belongs to an organization the caller is part of.

Migration 00102 also: drops the orphaned permissive `USING(true)` policies on the
deprecated `loan_requests_v1` / `loan_repayments_v1` tables (the live app uses the
renamed `loan_requests` / `loan_repayments`), and pins `search_path = public` on
the `is_group_admin_or_owner` definer function.

> **00102 is authored and tracked by the orchestrator and is NOT applied by this
> PR.** It is `CREATE OR REPLACE` / `ALTER` / `DROP POLICY` only — no table
> changes, no data writes, re-runnable — and is independent of the application
> code in this PR. It can be applied manually any time after the Build 2 deploy
> is ready. Preflight/verification/rollback queries are in the migration header.

---

## 4. In-PR fixes (UI + member-detail guard)

1. **Member-detail active-group guard.** `members/[id]` now compares the loaded
   member's `group_id` to the active `groupId` and shows a localized "wrong
   group" empty state (`members.wrongGroupTitle` / `members.wrongGroupDesc`)
   instead of rendering a member from another group. Customer-facing copy only —
   no raw ids.

2. **Group switcher clarity.** Added the shared `GroupTypeBadge` (HQ/Branch),
   a search box, and a one-vs-many empty state so a member belonging to a branch
   *and* its HQ can tell them apart. Role is surfaced per group.

3. **"My groups" consolidated view** (`dashboard/my-groups`). Lists every
   membership with group name, type badge, role, and current/pending markers;
   each card can `switchGroup()` into that group. No raw UUIDs rendered.

4. **Per-group balance/standing labels.** A multi-group member could misread one
   group's balance (`my-payments`) or standing/dashboard headline
   (`my-dashboard`) as a global figure. Both pages now show a subtle muted
   "In {group}" line (`myPayments.inGroup` / `myDashboard.inGroup`), **gated on
   `useGroup().memberships.length > 1`** so single-group members see nothing.
   This is a **labeling-only** change — no data query was re-scoped; the pages
   keep using the already-group-scoped hooks.

5. **Join → land in the joined group.** Join-by-code (`join-by-code-dialog`) and
   invitation-accept (`my-invitations`) now `switchGroup()` to the newly joined
   group, so an existing multi-group user lands in the **new** group instead of
   their previously active one.

---

## 5. Data-isolation guardrail

The regression guard for isolation lives in `scripts/test-product-multitenant.mjs`
(static, `node --test`). It asserts:

- `group-context` exposes `switchGroup` and calls `queryClient.removeQueries()`
  on switch (the anti-stale guarantee).
- The major group-scoped hooks in `use-supabase-query.ts` each include `groupId`
  in their `queryKey` **and** filter by `group_id`. **If a new group-scoped hook
  is added without both, this fails** — preventing a silent isolation leak.
- The switcher and "My groups" render `GroupTypeBadge` / read `group_level`, list
  memberships, and call `switchGroup`, with no raw group UUID printed as visible
  text.
- `members/[id]` guards on the active group (group comparison + wrong-group copy).
- `my-payments` / `my-dashboard` show the per-group label gated on
  `memberships.length > 1`, and did **not** re-scope any query.
- Join-by-code and my-invitations call `switchGroup` after a join/accept.
- i18n: `groupType.*`, the new `myPayments.inGroup` / `myDashboard.inGroup`,
  `myGroups.*`, and the members wrong-group keys exist in **both** bundles, with
  real French.

The suite keys off **stable tokens** (`switchGroup`, `removeQueries`,
`group_level`, `GroupTypeBadge`, `groupId`) via `includes()`/loose regex so it
tolerates wording chosen by sibling work and only fails on real isolation/clarity
regressions.

---

## 6. Documented follow-ups (NOT changed)

These need their own tested redesign and are intentionally out of scope here:

- **`relief_remittances_select` within-org over-share.** The 00045 policy lets
  any member of any group in the same organization read branch remitted amounts.
  This is **within-org over-share, not cross-tenant** (00102 closes the
  cross-tenant view leak but does not touch this policy). Tightening to admins
  risks breaking the legitimate branch/HQ remittance view — redesign + test
  separately.
- **`position_assignments` / `position_permissions` keep `USING(true)`**
  (migration 00026) by design for the client-side permission resolver. This is
  org-chart metadata (no PII, no financial data). Revisit only with a resolver
  redesign.
