# Financial Records + Reporting OS (Build 4)

The reference for how VillageClaq counts money and reports on it. Read this
before touching any finance/report surface.

## The one accounting basis — `src/lib/money.ts`

There is exactly **one** source of truth for money math: `src/lib/money.ts`. It
is pure and unit-tested (`scripts/test-money.mjs`). Every report, statement,
rollup, and overview must compute through it. The authoritative definitions:

| Concept      | Definition |
|--------------|------------|
| Collected    | Σ **CONFIRMED** payments only. `pending_confirmation` and `rejected` never count. |
| Pending      | `payments.status = 'pending_confirmation'` — shown **separately**, never folded into collected. |
| Expected     | Σ `contribution_obligations.amount`, **excluding** `waived`. |
| Waived/excused | Not owed, not collected. |
| Outstanding  | `max(0, expected − collected)`. |
| Overdue      | Past due, not paid/waived, with **confirmed** remaining > 0. |
| Per-obligation paid | Derived from that obligation's **CONFIRMED** payments — **never** from `contribution_obligations.amount_paid`. |

`payments.status` ∈ `{confirmed, pending_confirmation, rejected}` (column default
`confirmed`; null/'' treated as confirmed). Use `isConfirmedPayment()` /
`confirmedPaidByObligation()` / `computeMoneyFigures()` / `buildObjectReport()`.

### Why amount_paid is not trusted

A DB trigger (`on_payment_recorded` → `update_obligation_on_payment`) historically
credited `contribution_obligations.amount_paid` on **any** payment INSERT,
including a member's `pending_confirmation` pay-now, and never reversed on
reject. So `amount_paid` is a polluted column. Build 4 makes the **app** correct
regardless by reading confirmed payments, and `00104` fixes the **DB**.

## Reportable-object model

A "reportable object" today is a **`contribution_types` row** (dues, a one-time
levy like the canonical *Baby Shower*, etc.). Its obligations and payments route
through `payments.obligation_id` / `payments.contribution_type_id`, so it is:

- **Independently reportable** — `/dashboard/contributions/[typeId]/report`
  (expected / contributed / not-contributed / pending / waived members, plus
  confirmed-only totals, member table, print + CSV).
- **Rolled up cleanly** — the same confirmed basis feeds the member statement
  (`my-payments`), the finances collection overview, `useDashboardStats`, and the
  group reports (`reports/[reportId]`). Per-object totals == group rollup totals
  (proven in `scripts/test-money.mjs` "group rollup matches per-object sums").

Relief routes through `payments.relief_plan_id` (excluded from dues figures).

## Migration `00104_payment_confirmation_accounting.sql` — CREATED, NOT APPLIED

Replaces the over-crediting trigger with a **recompute-from-confirmed** trigger
(`on_payment_changed`, fires INSERT/UPDATE/DELETE) and **backfills** every
obligation's `amount_paid` to its confirmed total. Idempotent, self-healing,
preserves `waived`. Apply as a single-file manual execution after the Build 4
deploy is READY (preflight / verification / rollback in the file header). The app
does not depend on it — it only realigns the stored column + member-standing
Rule 1, which reads obligation status.

## Permissions / no-send

- `reports/[reportId]` and the per-object report are gated with
  `RequirePermission anyOf ["reports.view","finances.view","finances.manage"]`.
- **No report/statement/overview view triggers any send or receipt.** Receipts
  fire only on an admin **confirm** via `payment-receipt-producer` (status must be
  `confirmed`). Verified by `scripts/test-product-build4.mjs`.

## Documented follow-ups (NOT in this PR — own design + migration each)

1. **Unified cross-module ledger.** Fines, loan repayments, project
   contributions, savings contributions, and relief remittances each have their
   own table/status semantics and do **not** roll into the dues ledger. A naive
   "group income" from `payments` omits them. Needs either a polymorphic
   `payments.source_type/source_id` or a unifying reporting view that reconciles
   each module to a confirmed-only basis. Each module's status (e.g.
   `fines.status`, `savings_contributions.status`, `project_contributions` has no
   status) must be mapped to confirmed/pending first.
2. **Deeper member-privacy RLS.** At the DB layer, any group member can currently
   `SELECT` peers' `payments`/`contribution_obligations`/`fines` (RLS uses
   `is_group_member`). Build 4 adds an app-level report-detail gate but does not
   change this. Follow-up: finance-permission-aware RLS (e.g. a member sees only
   their own rows unless they hold `finances.view`). Migration sketch: replace the
   broad `USING (is_group_member(group_id))` SELECT policies on `payments` /
   `contribution_obligations` / `fines` with `USING (membership owned by
   auth.uid() OR has_finance_view(group_id))`, behind a new
   `has_finance_view()` SECURITY DEFINER helper. Test against the member
   statement + per-object report before applying.
3. **Cross-module report harmonization.** Once (1) lands, harmonize the 24-report
   engine, finances dashboard, and command center onto the unified ledger so
   fines/loans/projects/savings appear in group income with the same basis.
4. **Event-linked contribution reporting.** Events cannot carry money today (only
   `fines.event_id` links money to an event). The Baby Shower is modeled as a
   one-time `contribution_type`. Follow-up: add a nullable
   `contribution_types.event_id uuid REFERENCES events(id) ON DELETE SET NULL` so
   a contribution can be attached to an event and reported both independently and
   under the event's combined (attendance + money) report.
5. **Export/PDF/report-pack expansion.** Build 4 ships print + CSV for the
   per-object report and a Status-column CSV for history. Follow-up: PDF export
   via `exportPDF()` and a multi-report "board packet" pack, group-scoped.

---

# Financial Accuracy Cleanup — confirmed-only display (Build 12)

Build 4 established the confirmed-only money engine for the reports, finances, and
dashboard. Build 12 finishes the job: every remaining paid/unpaid/owing/overdue
DISPLAY surface that still read the **polluted** `contribution_obligations.amount_paid`
column (over-credited by the trigger on a pending pay-now, never reversed on reject)
or the trigger-driven `obligation.status` is rerouted through the engine. **No
migration, no DB mutation, no write-path change** — the column stays polluted; we
just stop reading it for display.

## The canonical chain (new `money.ts` export)
`computeObligationStates(obligations, payments, {today})` → `Map<obligation_id, ObligationComputed>`.
It partitions obligations + payments **by contribution type**, then within each type
attributes every member's CONFIRMED dues total across their obligations **oldest-due
first** (`confirmedPaidByMember` → `allocateConfirmedToObligations` → `computeObligation`).
Partitioning by type is essential — a confirmed payment to "Annual Dues" must never
cover a "Baby Shower" obligation. A per-type slice reconciles exactly with
`buildObjectReport` (the canonical per-object report). Used by every reroute below so
all numbers tie to one basis. Why the member→allocate chain and not
`confirmedPaidByObligation`: ~98% of dues payments are recorded WITHOUT an
`obligation_id` (only `membership_id` + `contribution_type_id`), so an obligation-keyed
lookup would show almost everything unpaid.

## Uncapped basis (new hook)
`useGroupDuesPayments()` — every dues payment in the group (relief excluded), **no row
cap** (a 50/500-row cap would re-pollute the math), keyed `["payments", groupId,
"all-dues"]` so the existing `["payments", groupId]` payment-mutation invalidation
(prefix) refreshes it. No write-path change.

## Surfaces rerouted (display reads only)
- **Unpaid / who-hasn't-paid list** — member appears iff confirmed-open; outstanding =
  Σ confirmed remaining. Eliminates false reminders to members with only a pending
  submission.
- **Dues matrix** — cell paid/partial/unpaid from confirmed coverage per period; `waived`
  still from status.
- **`calculate-standing` dues factor (highest stakes)** — "behind on dues" = confirmed-
  open AND past due+grace. Preserves `excludedContributionTypeIds` (flexible/optional
  types never mark a member behind), grace days, and waived exclusion. A pending/rejected
  payment can no longer wrongly clear OR suspend a member.
- **`useMoneyOverview`** — overdue / members-owing / next-due now confirmed-derived
  (its `collected`/`outstanding` were already confirmed-only).
- **Member detail** Year-over-Year status, **my-dashboard** unpaid list, **Reports** #1
  (Who Hasn't Paid), #4 (AR Aging), #7 (YoY Dues — paid side).

## `waived` is the only status value still trusted
`obligation.status === "waived"` is admin-set (not trigger-driven), so it remains the
authoritative waived signal everywhere. All `pending`/`partial`/`paid`/`overdue` status
reads for paid/unpaid determination are dropped in favor of the engine.

## Already-correct (NO change — reconciliation anchors)
Per-object report (`buildObjectReport`), finances page stats, my-payments ledger,
Reports #2/#3/#16/#17/#20 (`computeMoneyFigures`), member-detail Financial Summary,
payment-reminder/overdue producers, and the record-payment WRITE cascade (which
legitimately maintains `amount_paid`).

## Deferred WITH reason
- **PayNowDialog `amountDue` prefill** reads `obligation.amount_paid`. The dialog only
  receives an `obligation` prop (no payments), so the correct fix belongs in the parent
  that passes the obligation; the value is user-editable at the moment of payment.
  Member-facing my-payments (the main "what I owe" surface) is already confirmed-correct.
  Deferred to a follow-up that threads confirmed remaining from the parent.
- **`amount_paid` column repair/backfill** — out of scope (DB mutation/migration). B12 is
  display-only; reversing the trigger's pending/rejected over-credits is a separate effort.
- **`computeMoneyFigures` membersOwing/overdue granularity** — uses
  `confirmedPaidByObligation` (obligation-linked only); confirmed-only already (not
  polluted), just coarser than the allocate chain. Not surfaced as a prominent figure;
  left unchanged to avoid touching the finances/dashboard anchor.

## Tests
`test-money.mjs` adds executable `computeObligationStates` cases (confirmed/pending/
rejected, cross-type non-coverage, oldest-due allocation, overdue, waived, buildObjectReport
reconciliation). `test-product-build12.mjs` (15) asserts every surface routes through the
engine and no longer reads `amount_paid`/status for paid-unpaid, plus P0 guard / Build-8
dormancy / no-migration / no-send guards.
