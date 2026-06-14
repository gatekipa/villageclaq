# Build 6 — Fortune-500 App-Wide UX Polish

A **safe, visual/spacing/copy-only** pass. No data-fetching, auth, redirect,
notification, migration, or provider-config changes. Every shipped edit is
`risk: safe`. The high-leverage work is **systemic** (a few shared primitives
that lift every page at once); targeted route fixes cover the highest-value
financial-trust and mobile-overflow surfaces. The long tail of subjective
cosmetic tweaks is deferred (see backlog) rather than shipped unverified.

## Method

App-wide read-only UX audit across 10 route clusters (member-home/money,
contributions+record, reports+finances, members, events/elections,
invites/onboarding, launch/platform-admin, shared UI/layout, settings/misc,
i18n parity), classified per route, then synthesized into a safe worklist with
every item annotated by the invariant it must not break.

## Shipped

### Systemic (app-wide lift)
- **`PageContainer` primitive** (`src/components/ui/page-container.tsx`) — the
  single source of dashboard content width: `mx-auto w-full max-w-[1600px]`
  with a `fluid` opt-out. Adopted once inside the dashboard `<main>` **and** the
  platform-admin `<main>`, so every workspace page is consistently capped and
  centered (modern SaaS feel on ultra-wide displays) instead of each page
  hand-rolling its own width. Adds **no** second scroll container; the existing
  `p-4 lg:p-6` + `overflow-x-hidden` padding is preserved. Below 1600px every
  page is unchanged (full width).
- **Destructive-confirm seriousness** (`confirm-dialog.tsx`) — destructive
  confirmations now render an `AlertTriangle` badge + emphasized title. The
  `destructive` button-variant behavior is unchanged. App-wide via the shared
  `useConfirmDialog({ destructive: true })`.
- **Responsive empty/error padding** (`page-skeleton.tsx`) — `EmptyState` /
  `ErrorState` vertical padding is now `py-10 md:py-14 lg:py-16` (less wasted
  space on mobile, same generous feel on desktop).

### Financial trust
- **`my-payments`** — the obligation progress bar now renders for **every**
  obligation (0% for fully-unpaid, partial fill otherwise) so each card feels
  complete; the "X of Y paid" line stays gated on partial. The waived/excused
  section is restyled emerald/positive (`CheckCircle2`, `bg-emerald-50/50`) to
  signal "you don't owe this" instead of a muted, ambiguous grey. Money still
  rendered via `formatAmount` (Rule 6).

### Mobile / table overflow
- **`contributions/history`** — table cell padding `px-3 sm:px-4` to relieve
  horizontal-scroll pressure at 375px (secondary columns already collapse via
  `hidden sm:table-cell`).
- **`contributions/matrix`** — sticky member column `min-w-[140px] sm:min-w-[180px]`
  and data columns `min-w-[60px] sm:min-w-[70px]` so the matrix fits more on
  narrow screens; sticky positioning + `truncate` preserved.
- **`finances`** — monthly-trend chart height `h-[220px] sm:h-[280px]` (shorter
  on phones).

### Tests
- `scripts/test-product-build6.mjs` — 7 guardrails pinning the primitives and
  re-asserting the **P0 bulk-record receipt guard** and **Build-4 confirmed-only
  money basis** are untouched.

## Invariants preserved (verified)
- **P0 bulk-record receipt guard** — `contributions/record/page.tsx` is NOT in
  this diff; the guard (default-OFF receipts, second money-received reconfirm,
  no direct-save) is re-pinned by the Build 6 + P0 tests.
- **Build-4 confirmed-only accounting** — per-object report's confirmed-vs-pending
  distinction and `pendingNote` left intact.
- **Build-2 tenant isolation / Build-3 admin safeguards** — purely presentational;
  no query, scoping, auth, or admin-action code touched.
- **Rule 1 (no hardcoded strings)** — no copy was changed, so no new i18n keys;
  EN/FR parity unaffected.

## Deferred (intentionally not shipped in this pass)
Subjective or structural items that need device-level visual verification or
touch flagged surfaces — tracked as follow-ups:
- DialogFooter negative-margin refactor (app-wide blast radius).
- Table sticky-first-column / mobile card-fallback redesign.
- Sidebar responsive width (`w-64` → `lg:w-56 xl:w-64`) — needs tablet testing.
- Per-route cosmetic micro-tweaks (events/elections/settings/documents/feedback/
  help spacing, dashboard CardHeader `pb-2`→`pb-3`, quick-actions grid).
- Copy reorders (my-payments urgency phrase, my-invitations explainer merge) —
  current copy is clear, not misleading, so out of the "fix misleading copy
  only" rule.
- `announcements` nested-scroll consolidation — structural dialog change.

## FLAG-ONLY (must not change in a UX pass — behavior)
- `my-profile` Leave-Group button copy / confirmation wiring (`risk: behavior`).
- `impersonation-banner` "End support session" confirmation dialog (behavior).
- Anything affecting onboarding redirect timing (Rule 10) or notification
  channel selection (Rule 11).
