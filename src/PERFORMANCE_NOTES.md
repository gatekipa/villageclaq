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

---

# Africa-First Speed + Low-Bandwidth Pass (Build 11)

Perceived-speed + payload + bundle work for slow mobile data, unstable links,
low-end Android, and older browsers. **No migration. No sends. No production
data mutation.** Every change verified against the locked invariants: tenant
cache isolation (`switchGroup().removeQueries()` + group-scoped keys), Build-4
confirmed-only money basis (money queries stay uncapped), the P0 bulk-receipt
guard, and Build-8 producer dormancy. Audit was an 11-auditor read-only fan-out
(87 findings → 61 actionable-safe) followed by a synthesis safety-filter.

## Shipped (safe, high-leverage)

1. **WS3 — `staleTime` sweep across the query layer** (the dominant win).
   ~22 hooks that fell back to the global 60s now carry explicit, tiered
   `staleTime`: notifications + unread badge stay near-real-time (30s); admin/
   stable config (group settings, positions, join codes, documents, reminder
   rules, family, badges) cache 10–30 min; events/relief/savings/elections/
   attendance/hosting/loans/projects/member 5 min; announcements/activity-feed
   3 min. Money hooks already sat at 5 min (Build 9) and are unchanged. **Safe
   because** every mutation already `invalidateQueries`-es its keys (invalidation
   forces a refetch regardless of `staleTime`), and a group switch still clears
   the whole cache. Net effect: tab-hops and route returns within the window
   reuse cache instead of refetching — the biggest cumulative low-bandwidth win.
2. **WS3 — `useMember` query key now group-scoped** (`["member", id, groupId]`).
   Belt-and-suspenders tenant isolation; prefix-matched invalidations still fire.
3. **WS3 — `select(*)` narrowed** on `useNotifications`, `useAnnouncements`,
   `useFamilyMembers` (consumer-verified column lists; drops only unrendered
   scalar/timestamp columns).
4. **WS2 — dues matrix** drops the unused `privacy_settings` column from its
   memberships fetch (mapped to `MemberRow` via `getMemberName`, never read).
   The obligation money basis is untouched/uncapped.
5. **WS4 — recharts lazy-loaded** via `next/dynamic` (`ssr:false`, skeleton
   fallback) on the finances monthly-trend chart (member-facing) and the
   platform-admin overview + analytics charts. recharts (~74KB gzip) leaves
   those routes' first-paint bundles; the charts live in
   `src/components/charts/*`.
6. **WS4 — `html2canvas` dynamically imported** inside the membership-card
   Download/Share handlers (most members never click), ~80KB off first paint.
7. **WS4/WS5 — record-page autocomplete memoized** (`memberList` +
   `filteredMembers` via `useMemo`), so `getMemberName`/filter don't re-run for
   every member on each keystroke on low-end phones.
8. **WS5 — low-bandwidth UX** is carried by the above: fewer refetches (fewer
   loading flashes), lazy-chart skeletons (no blank heavy-content regions), and
   a more responsive record search; built on the existing app-wide ErrorState +
   retry infrastructure (Build 5/6).
9. **WS6 — guardrail tests** (`scripts/test-product-build11.mjs`, 12 tests):
   staleTime sweep present, group-scoped keys + `removeQueries` intact, money
   basis uncapped (and finances `usePayments(5000)` deliberately NOT capped),
   narrowed selects keep consumed columns, matrix drops privacy_settings, charts
   lazy-loaded, html2canvas lazy, record memoized, P0 guard intact, Build-8
   dormant, no sends introduced, no new migration.

## Deferred WITH reason (NOT in this PR)

- **finances `usePayments(5000)` → 100: UNSAFE — kept at 5000.** The finances
  headline `totalCollected`/`totalOutstanding`/`collectionRate` **sum the
  payments feed** (`finances/page.tsx`), so capping it would under-report
  collected money — a Build-4 violation. Same trap blocks capping reports'
  `usePayments(500)`. The proper fix is a server-side confirmed-only aggregation
  RPC (already deferred above).
- **reports `[reportId]` 11-hook `enabled` gating** — biggest reports first-paint
  win, but needs per-report runtime verification (a wrong gate shows empty data)
  and hook-signature changes. The `staleTime` sweep already caches reports data
  across visits, mitigating repeat-visit cost. Deferred to its own pass.
- **`useEvents`/`useJoinCodes`/`useReminderRules` select-narrowing** — marginal
  payload win (small scalar columns) and the events edit-form may read columns a
  narrow would drop. Deferred.
- **onboarding static-option-array hoist + admin/users search debounce +
  impersonation poll interval** — Tier-4 micro-wins on one-time/admin-only,
  low-frequency routes; deferred to avoid touching sensitive admin code for
  marginal benefit.
- **admin overview/analytics lazy charts: data→bundle waterfall** — the admin
  charts mount only after their data query resolves (`{loading ? <Skeleton/> :
  <Chart/>}`), so the recharts chunk download starts after the data fetch rather
  than in parallel (the finances chart mounts unconditionally and prefetches in
  parallel). Flagged by the adversarial review (MINOR). NOT a regression
  (pre-B11 recharts was in the bundle regardless) and admin-staff-only; kept the
  skeleton gate (cleaner load UX than an empty chart frame). Deferred.

## Adversarial review (10 lenses) outcome

7/10 lenses clean. One MAJOR fixed in-PR: the new `useMembers` 5-min `staleTime`
widened an existing freshness gap — the member-DETAIL standing-override, role-
change, and recalculate handlers mutated `standing`/`role` but did not invalidate
`["members", groupId]`, so the list badge/role could stay stale for the window.
Fixed by adding the `["members", groupId]` invalidation to all three handlers
(`members/[id]/page.tsx`), restoring the invalidation contract the longer
staleTime relies on; guarded by a regression test. One MINOR fixed: the
record-page `bulkFilteredMembers` filter was memoized to match its siblings.
