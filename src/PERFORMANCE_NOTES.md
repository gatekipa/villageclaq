# Performance + Slowness Program (Build 5)

What was measured, what shipped, and what's deferred. At the time of this build
the dataset is small (≈122 payments / 649 obligations / 24 groups / 223
memberships), so query slowness is **not yet user-visible** — the wins here are
payload/round-trip reductions that help now, plus a **forward-looking** index
migration that keeps the hot paths index-only as groups scale.

## Route audit classification (6-lens read-only audit, live EXPLAIN)

53 areas: 12 fast/launch-ready, 14 over-fetching, 12 missing-index,
5 client-compute, 3 repeated-query, 2 render-issue, 2 large-payload,
2 architectural-followup, 1 needs-polish.

**Confirmed safe (no action):** tenant cache isolation is intact —
`switchGroup()` does a full `queryClient.removeQueries()` on every switch, every
group-scoped TanStack key includes `groupId` (no cross-group pollution), and
`group-context.tsx` is exemplary on rule-9 deps. Group switcher / My Groups read
from the single shared `useGroup()` context (no repeated queries).

## Shipped in this PR (safe, high-impact)

1. **Dashboard over-fetch** — the home page fetched the **entire** `events`
   table (`select *`) and the **entire** `meeting_minutes` table (`select *`,
   including the heavy rich-text body) just to render one "next event" and one
   "recent minutes" card. Replaced with dedicated single-row hooks
   `useNextEvent()` (soonest upcoming, 4 columns) and `useLatestMinutes()` (1 row,
   body excluded). Removes two unbounded full-table reads + client filter/reduce
   from the hottest route.
2. **`/api/admin/query` hard row cap** — the admin query route bypasses RLS and
   applied a limit only when the caller supplied one, so an unbounded spec
   returned the **entire** table. Now every query is clamped
   (`min(limit ?? 1000, 10000)`); `count:"exact"` still returns the exact total.
3. **Dead query removed** — finances `useLoanStats` fired a no-op overdue-count
   query (`.in("loan_id", … ? [] : [""])`, result never used) before the real
   join query. Deleted the wasted round-trip.
4. **Index migration `00105` (created, NOT applied)** — see below.

## Migration `00105_performance_indexes.sql` — CREATED, NOT APPLIED

Eight additive indexes for the hottest paths (each with preflight/rollback/
verification in the file header). Highlights:
- `payments(group_id, contribution_type_id) WHERE relief_plan_id IS NULL` — the
  Build-4 per-type collection path (`payments.contribution_type_id` was
  **unindexed**).
- `payments(group_id, recorded_at DESC)` — dashboard recent payments / history.
- `payments(membership_id, contribution_type_id, recorded_at)` — duplicate-check
  on every payment insert + per-member drill-downs.
- `payments(obligation_id, status)` — the 00104 recompute trigger's confirmed-sum.
- `contribution_obligations(group_id, status, due_date)` — group money rollup.
- `notifications_queue(status, created_at) WHERE status='queued'` — drain cron.
- `group_audit_logs(entity_id, created_at DESC)` — member history.
- `memberships(is_proxy) WHERE is_proxy = true` — proxy lookups.

Purely additive; the app is already correct and adequately fast without it.

## Deferred follow-ups (documented, not in this PR)

These are real but either higher-risk or only matter at scale; doing them safely
needs their own design/test pass:

1. **Server-side money aggregation RPC** — `useDashboardStats` + finances pull
   every obligation + payment row to compute 3 scalar headline numbers
   client-side. Move to a `SECURITY DEFINER` RPC returning
   expected/collected/outstanding using the SAME confirmed-only rules (money.ts)
   — must not change the Build-4 accounting basis.
2. **`reports/[reportId]` hook gating** — all ~11 shared data hooks fire
   unconditionally at mount for every one of the 24 reports. Gate each with
   `enabled` keyed off which report needs it (the loan/fed/roster/ballot queries
   already do this). High value, but the 2300-line monolith needs careful
   per-report data-dependency mapping.
3. **`MoneyOverview` dedupe on finances** — `<MoneyOverview>` self-fetches
   obligations+payments that the finances page already fetched. Pass its `data`
   prop (requires routing the page's stats through `useMoneyOverview`).
4. **Admin list server-side pagination** — `/admin/users` and `/admin/overview`
   fetch whole tables (profiles, memberships ×2) then paginate/aggregate
   client-side. Move pagination/search/aggregation server-side (RPC).
5. **Dashboard loading decoupling** — render the headline stats as soon as
   `useDashboardStats` resolves with per-section skeletons, instead of one
   union `isLoading` gate.
