/**
 * money.ts — VillageClaq canonical financial engine (Build 4).
 *
 * THE single source of truth for "how money is counted" across every report,
 * statement, rollup, and overview. Pure, deterministic, framework-free → unit
 * testable and reusable on server or client.
 *
 * WHY THIS EXISTS
 * --------------
 * The app historically computed "collected"/"outstanding" at least four
 * inconsistent ways, so the Launch Command Center, finances headline, the
 * matrix, useDashboardStats, and the 24-report engine could all disagree. Two
 * defects drove the divergence:
 *   1. A DB trigger over-credits contribution_obligations.amount_paid when a
 *      PENDING pay-now payment is inserted (and never reverses on reject), so
 *      amount_paid is a polluted basis.
 *   2. Several read paths sum payments with NO status filter, counting
 *      pending_confirmation and even rejected payments as collected.
 *
 * THE RULE (authoritative accounting definitions):
 *   - Collected  = Σ CONFIRMED payments only (pending/rejected never count).
 *   - Pending    = payments with status='pending_confirmation' (shown SEPARATELY).
 *   - Expected   = Σ obligation.amount, EXCLUDING waived.
 *   - Waived     = not owed, not collected.
 *   - Outstanding= max(0, expected − collected).
 *   - Overdue    = past due, not paid/waived, with confirmed remaining > 0.
 *   - Per-obligation "paid" is derived from that obligation's CONFIRMED
 *     payments — NOT from the amount_paid column — so figures are correct both
 *     before and after the trigger/backfill migration (00104) is applied.
 *
 * payments.status values: 'confirmed' | 'pending_confirmation' | 'rejected'
 * (column default 'confirmed'; null/'' is treated as confirmed to match it).
 */

export type PaymentStatusish = string | null | undefined;

/** Numeric coercion that never returns NaN. */
export function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * A payment counts as collected money only when CONFIRMED. The column default
 * is 'confirmed', so a null/empty status is treated as confirmed; everything
 * that is explicitly 'pending_confirmation' or 'rejected' is excluded.
 */
export function isConfirmedPayment(status: PaymentStatusish): boolean {
  return status !== "pending_confirmation" && status !== "rejected";
}

/** Member-submitted money awaiting an admin confirm/reject decision. */
export function isPendingPayment(status: PaymentStatusish): boolean {
  return status === "pending_confirmation";
}

export function isRejectedPayment(status: PaymentStatusish): boolean {
  return status === "rejected";
}

// ── Minimal row shapes (subset of the DB columns the reports actually read) ──

export interface MoneyPayment {
  id?: string | null;
  amount: number | string | null;
  status?: PaymentStatusish;
  settlement_status?: string | null;
  obligation_id?: string | null;
  contribution_type_id?: string | null;
  relief_plan_id?: string | null;
  membership_id?: string | null;
  recorded_at?: string | null;
}

export interface MoneyObligation {
  id: string;
  amount: number | string | null;
  amount_paid?: number | string | null; // present but NEVER trusted for "paid"
  status?: string | null; // pending | partial | paid | overdue | waived
  due_date?: string | null;
  membership_id?: string | null;
  contribution_type_id?: string | null;
}

/**
 * Local calendar date key (YYYY-MM-DD). due_date is a DATE at UTC midnight, so
 * comparing on the date string (not a timestamp) prevents a same-day obligation
 * reading as overdue for an admin in a negative-UTC (diaspora) timezone.
 * `now` is injectable for deterministic tests.
 */
export function dateKey(d: string | Date): string {
  if (typeof d === "string") return d.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function todayKey(now: Date = new Date()): string {
  return dateKey(now);
}

/**
 * Add `days` calendar days to a date-only key and return a new YYYY-MM-DD key.
 * Arithmetic runs in UTC on the date-only value so it never drifts by a
 * timezone offset (the bug date-key comparison exists to avoid). Used for
 * grace-day overdue checks that must match the money engine's date semantics.
 */
export function addDaysToDateKey(key: string, days: number): string {
  const d = new Date(`${key.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Is a payment a DUES payment (i.e. not a relief contribution)? */
export function isDuesPayment(p: MoneyPayment): boolean {
  return p.relief_plan_id == null;
}

/** A posted receipt later reversed/refunded remains in history but no longer covers dues. */
export function isCollectedDuesPayment(p: MoneyPayment): boolean {
  return isDuesPayment(p) && isConfirmedPayment(p.status)
    && p.settlement_status !== "refunded" && p.settlement_status !== "reversed";
}

/**
 * Map obligation_id → Σ CONFIRMED payment amount applied to it. This is the
 * trustworthy per-obligation "paid", independent of the polluted amount_paid
 * column. Only payments carrying an obligation_id contribute.
 *
 * NOTE: most dues payments are recorded WITHOUT an obligation_id (the admin
 * record-payment path deliberately omits it to avoid the over-credit trigger),
 * so for per-TYPE / per-MEMBER collection use confirmedPaidByType /
 * confirmedPaidByMember instead — keying on obligation_id alone would miss the
 * ~98% of payments that carry only contribution_type_id + membership_id.
 */
export function confirmedPaidByObligation(payments: MoneyPayment[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of payments) {
    if (!p.obligation_id) continue;
    if (!isCollectedDuesPayment(p)) continue;
    map.set(p.obligation_id, (map.get(p.obligation_id) || 0) + num(p.amount));
  }
  return map;
}

/**
 * Allocate each member's CONFIRMED payment total across their obligations,
 * oldest due-date first, capped at each obligation's amount. Returns a
 * Map<obligation_id, allocatedPaid> shaped exactly like confirmedPaidByObligation
 * so it drops into computeObligation(). Use this for a per-OBLIGATION member
 * statement when payments carry no obligation_id (the common case) — it shows a
 * sensible "which obligations are covered" view from the member's confirmed
 * total, instead of falsely showing every obligation unpaid. Waived obligations
 * absorb nothing.
 */
export function allocateConfirmedToObligations(
  obligations: MoneyObligation[],
  confirmedByMember: Map<string, number>,
): Map<string, number> {
  const byMember = new Map<string, MoneyObligation[]>();
  for (const o of obligations) {
    const mid = o.membership_id || o.id;
    if (!byMember.has(mid)) byMember.set(mid, []);
    byMember.get(mid)!.push(o);
  }
  const allocated = new Map<string, number>();
  for (const [mid, obls] of byMember) {
    let pool = confirmedByMember.get(mid) || 0;
    const sorted = [...obls].sort((a, b) => {
      const da = a.due_date ? dateKey(a.due_date) : "9999-12-31";
      const db = b.due_date ? dateKey(b.due_date) : "9999-12-31";
      return da < db ? -1 : da > db ? 1 : 0;
    });
    for (const o of sorted) {
      if (o.status === "waived") continue;
      const give = Math.max(0, Math.min(pool, num(o.amount)));
      allocated.set(o.id, give); // explicit 0 once the pool is exhausted
      pool -= give;
    }
  }
  return allocated;
}

/**
 * Map membership_id → Σ CONFIRMED dues payment amount. Use for per-MEMBER
 * outstanding/paid (member statement, top-overdue lists). This is the correct
 * basis when a member's payments are recorded without an obligation_id (the
 * common admin record-payment path) — keying on obligation_id would miss them
 * and over-state what the member still owes.
 */
export function confirmedPaidByMember(payments: MoneyPayment[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of payments) {
    if (!isDuesPayment(p)) continue;
    if (!p.membership_id) continue;
    if (!isCollectedDuesPayment(p)) continue;
    map.set(p.membership_id, (map.get(p.membership_id) || 0) + num(p.amount));
  }
  return map;
}

/**
 * Map contribution_type_id → Σ CONFIRMED dues payment amount. Use for per-type
 * "collected" (e.g. the Collection-by-Type panel) so payments recorded without
 * an obligation_id (the common case) are still counted. Relief payments and
 * payments with no contribution_type_id are skipped.
 */
export function confirmedPaidByType(payments: MoneyPayment[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of payments) {
    if (!isDuesPayment(p)) continue;
    if (!p.contribution_type_id) continue;
    if (!isCollectedDuesPayment(p)) continue;
    map.set(p.contribution_type_id, (map.get(p.contribution_type_id) || 0) + num(p.amount));
  }
  return map;
}

export interface ObligationComputed {
  id: string;
  expected: number;
  /** confirmed paid for THIS obligation (from confirmed payments, not amount_paid) */
  confirmedPaid: number;
  remaining: number;
  isWaived: boolean;
  isPaid: boolean;
  /** open = not waived, not fully paid, confirmed remaining > 0 */
  isOpen: boolean;
  isOverdue: boolean;
}

/** Per-obligation derived state on the confirmed basis. */
export function computeObligation(
  o: MoneyObligation,
  confirmedByObl: Map<string, number>,
  today: string,
): ObligationComputed {
  const isWaived = o.status === "waived";
  const expected = num(o.amount);
  const confirmedPaid = confirmedByObl.get(o.id) || 0;
  const remaining = Math.max(0, expected - confirmedPaid);
  const isPaid = !isWaived && expected > 0 && confirmedPaid >= expected;
  const isOpen = !isWaived && !isPaid && remaining > 0;
  const dueK = o.due_date ? dateKey(o.due_date) : null;
  const isOverdue = isOpen && !!dueK && dueK < today;
  return { id: o.id, expected, confirmedPaid, remaining, isWaived, isPaid, isOpen, isOverdue };
}

/**
 * THE canonical confirmed-only per-obligation state map (Build 12). Every
 * paid/unpaid/owing/overdue DISPLAY surface (unpaid list, dues matrix, member
 * detail, standing, money overview, reports) must route through this instead of
 * reading the polluted obligation.amount_paid / obligation.status columns.
 *
 * It partitions obligations + payments BY contribution type, then within each
 * type attributes every member's CONFIRMED dues total across that member's
 * obligations of that type (oldest-due first), and computes per-obligation state.
 * Partitioning by type is essential: a confirmed payment to "Annual Dues" must
 * NEVER cover a member's "Baby Shower" obligation. This mirrors buildObjectReport
 * exactly, so a per-type slice of this map reconciles with that report's rows.
 *
 * Pass a CONSISTENT scope: whole-group (all dues obligations + all dues payments)
 * OR a single type's obligations + payments — either is correct because the
 * partition is internal. Pending/rejected payments never count; waived
 * obligations are still computed (computeObligation marks isWaived) so callers
 * can read state.isWaived rather than the (also-trigger-driven) status column.
 * A confirmed payment with NO contribution_type_id (a general dues payment — the
 * admin record path can emit one) is pooled per member and spread across that
 * member's open obligations oldest-due first, so it reduces what the member owes
 * and reconciles with computeMoneyFigures.collected instead of stranding.
 */
export function computeObligationStates(
  obligations: MoneyObligation[],
  payments: MoneyPayment[],
  opts: { today?: string } = {},
): Map<string, ObligationComputed> {
  const today = opts.today || todayKey();

  // Partition obligations by contribution type.
  const oblByType = new Map<string, MoneyObligation[]>();
  for (const o of obligations) {
    const k = o.contribution_type_id || "__none__";
    if (!oblByType.has(k)) oblByType.set(k, []);
    oblByType.get(k)!.push(o);
  }

  // Explicitly linked receipts settle their selected period first. Older
  // unlinked receipts retain the approved oldest-due-first allocation rule.
  const allocated = new Map<string, number>();
  const obligationById = new Map(obligations.map(o => [o.id, o]));
  const unlinkedTyped = new Map<string, Map<string, number>>();
  const typelessByMember = new Map<string, number>();
  for (const p of payments) {
    if (!isCollectedDuesPayment(p) || !p.membership_id) continue;
    const amount = num(p.amount);
    if (p.obligation_id) {
      const target = obligationById.get(p.obligation_id);
      if (!target || target.status === "waived" || target.membership_id !== p.membership_id ||
          (p.contribution_type_id && p.contribution_type_id !== target.contribution_type_id)) continue;
      const already = allocated.get(target.id) || 0;
      allocated.set(target.id, Math.min(num(target.amount), already + amount));
      continue;
    }
    if (p.contribution_type_id) {
      if (!unlinkedTyped.has(p.contribution_type_id)) unlinkedTyped.set(p.contribution_type_id, new Map());
      const byMember = unlinkedTyped.get(p.contribution_type_id)!;
      byMember.set(p.membership_id, (byMember.get(p.membership_id) || 0) + amount);
    } else {
      typelessByMember.set(p.membership_id, (typelessByMember.get(p.membership_id) || 0) + amount);
    }
  }

  // Unlinked payments of a named contribution cover that member's oldest open
  // obligation of the same type, after any explicit period allocations.
  for (const [typeKey, obls] of oblByType) {
    const byMember = unlinkedTyped.get(typeKey);
    if (!byMember) continue;
    for (const [mid, poolTotal] of byMember) {
      let pool = poolTotal;
      const sorted = obls.filter(o => o.membership_id === mid && o.status !== "waived")
        .sort((left, right) => {
          const da = left.due_date ? dateKey(left.due_date) : "9999-12-31";
          const db = right.due_date ? dateKey(right.due_date) : "9999-12-31";
          return da < db ? -1 : da > db ? 1 : 0;
        });
      for (const o of sorted) {
        const already = allocated.get(o.id) || 0;
        const give = Math.min(pool, Math.max(0, num(o.amount) - already));
        if (give > 0) allocated.set(o.id, already + give);
        pool -= give;
        if (pool <= 0) break;
      }
    }
  }

  // Phase 2: spread each member's TYPELESS confirmed pool across their remaining
  // open obligations (any type, oldest-due first, capped at each obligation's
  // gap), so a general payment reduces what the member owes instead of stranding.
  if (typelessByMember.size > 0) {
    const oblByMember = new Map<string, MoneyObligation[]>();
    for (const o of obligations) {
      const mid = o.membership_id || o.id;
      if (!oblByMember.has(mid)) oblByMember.set(mid, []);
      oblByMember.get(mid)!.push(o);
    }
    for (const [mid, poolTotal] of typelessByMember) {
      let pool = poolTotal;
      if (pool <= 0) continue;
      const sorted = (oblByMember.get(mid) || [])
        .filter((o) => o.status !== "waived")
        .sort((a, b) => {
          const da = a.due_date ? dateKey(a.due_date) : "9999-12-31";
          const db = b.due_date ? dateKey(b.due_date) : "9999-12-31";
          return da < db ? -1 : da > db ? 1 : 0;
        });
      for (const o of sorted) {
        const already = allocated.get(o.id) || 0;
        const gap = Math.max(0, num(o.amount) - already);
        const give = Math.max(0, Math.min(pool, gap));
        if (give > 0) allocated.set(o.id, already + give);
        pool -= give;
        if (pool <= 0) break;
      }
    }
  }

  const out = new Map<string, ObligationComputed>();
  for (const o of obligations) out.set(o.id, computeObligation(o, allocated, today));
  return out;
}

export interface MoneyFigures {
  /** Σ obligation.amount, excluding waived. */
  expected: number;
  /** Σ confirmed dues payments (relief excluded). */
  collected: number;
  /** max(0, expected − collected). */
  outstanding: number;
  /** Σ amounts of obligations explicitly waived. */
  waivedTotal: number;
  pending: { count: number; amount: number };
  overdue: { amount: number; memberCount: number };
  /** distinct members with an open obligation. */
  membersOwing: number;
}

/**
 * Canonical group figure set from a group's obligations + dues payments.
 * `collected` sums ALL confirmed dues payments (obligation-linked or not);
 * overdue and member counts use the same type/member allocation as the dues
 * drill-down, including receipts linked through payment applications rather
 * than payments.obligation_id.
 */
export function computeMoneyFigures(
  obligations: MoneyObligation[],
  payments: MoneyPayment[],
  opts: { today?: string } = {},
): MoneyFigures {
  const today = opts.today || todayKey();
  const states = computeObligationStates(obligations, payments, { today });

  let expected = 0;
  let waivedTotal = 0;
  let overdueAmount = 0;
  const overdueMembers = new Set<string>();
  const owingMembers = new Set<string>();

  for (const o of obligations) {
    if (o.status === "waived") {
      waivedTotal += num(o.amount);
      continue;
    }
    const c = states.get(o.id)!;
    expected += c.expected;
    const memberKey = o.membership_id || o.id;
    if (c.isOpen) owingMembers.add(memberKey);
    if (c.isOverdue) {
      overdueAmount += c.remaining;
      overdueMembers.add(memberKey);
    }
  }

  let collected = 0;
  let pendingCount = 0;
  let pendingAmount = 0;
  for (const p of payments) {
    if (!isDuesPayment(p)) continue;
    if (isPendingPayment(p.status)) {
      pendingCount += 1;
      pendingAmount += num(p.amount);
      continue;
    }
    if (isRejectedPayment(p.status) || !isCollectedDuesPayment(p)) continue;
    collected += num(p.amount);
  }

  return {
    expected,
    collected,
    outstanding: Math.max(0, expected - collected),
    waivedTotal,
    pending: { count: pendingCount, amount: pendingAmount },
    overdue: { amount: overdueAmount, memberCount: overdueMembers.size },
    membersOwing: owingMembers.size,
  };
}

// ── Dues status for the dashboard card and its unpaid drill-down (FQ-11) ─────

export interface DuesStatusTotals {
  /** Σ confirmed remaining on open, non-waived obligations, whatever their due date. */
  outstanding: number;
  /** The part of `outstanding` whose due date is before `today`. */
  overdue: { amount: number; memberCount: number };
  /** The part of `outstanding` due exactly on `today` (not yet overdue). */
  dueToday: number;
  /** Distinct members with an open obligation. */
  membersOwing: number;
}

/**
 * Outstanding vs overdue on the per-obligation confirmed basis (Build 12
 * computeObligationStates). The dashboard card and the unpaid drill-down both
 * use this, so their totals agree; overdue only counts obligations whose due
 * date is strictly before `today` (pass groupTodayKey from
 * payment-reminder-eligibility for the group's calendar).
 */
export function computeDuesStatusTotals(
  obligations: MoneyObligation[],
  payments: MoneyPayment[],
  today: string,
): DuesStatusTotals {
  const states = computeObligationStates(obligations, payments, { today });
  let outstanding = 0;
  let overdueAmount = 0;
  let dueToday = 0;
  const owing = new Set<string>();
  const overdueMembers = new Set<string>();
  for (const o of obligations) {
    if (o.status === "waived") continue;
    const c = states.get(o.id);
    if (!c || !c.isOpen) continue;
    const memberKey = o.membership_id || o.id;
    outstanding += c.remaining;
    owing.add(memberKey);
    if (c.isOverdue) {
      overdueAmount += c.remaining;
      overdueMembers.add(memberKey);
    } else if (o.due_date && dateKey(o.due_date) === today) {
      dueToday += c.remaining;
    }
  }
  return {
    outstanding,
    overdue: { amount: overdueAmount, memberCount: overdueMembers.size },
    dueToday,
    membersOwing: owing.size,
  };
}

// ── Per-object (single contribution type) report participation ───────────────

export type ParticipationStatus =
  | "contributed" // fully paid via confirmed payments
  | "partial" // some confirmed payment but not full
  | "pending" // has a pending_confirmation submission, no full confirmed cover
  | "not_contributed" // open, nothing confirmed/pending
  | "waived"; // excused

export interface MemberParticipation {
  membershipId: string;
  expected: number;
  confirmedPaid: number;
  remaining: number;
  pendingAmount: number;
  status: ParticipationStatus;
  isOverdue: boolean;
  lastConfirmedPaymentAt: string | null;
  hasReceiptEligible: boolean; // a confirmed payment exists → a receipt can be issued
}

export interface ObjectReportTotals {
  expectedMembers: number;
  contributedMembers: number;
  partialMembers: number;
  pendingMembers: number;
  notContributedMembers: number;
  waivedMembers: number;
  totalExpected: number;
  totalCollected: number; // confirmed only
  totalPending: number;
  totalWaived: number;
  totalOutstanding: number;
  totalOverdue: number;
}

/**
 * Build the PER-MEMBER participation rows + totals for ONE reportable object
 * (a contribution type). One row per distinct member, even when a member has
 * several obligations of the same type (recurring/multi-period).
 *
 * Payment attribution is by membership_id, NOT obligation_id: most dues
 * payments are recorded without an obligation_id but carry contribution_type_id
 * + membership_id. The caller must pass `payments` already scoped to this
 * contribution type (by contribution_type_id and/or its obligations'
 * obligation_id), group-scoped. Pending money is tracked separately and NEVER
 * folded into collected; waived is excluded from expected/outstanding.
 *
 * totalCollected = Σ confirmed payments for the type (reconciles with the group
 * rollup's per-type slice); a member who paid but has no obligation row still
 * appears.
 */
export function buildObjectReport(
  obligations: MoneyObligation[],
  payments: MoneyPayment[],
  opts: { today?: string } = {},
): { rows: MemberParticipation[]; totals: ObjectReportTotals } {
  const today = opts.today || todayKey();

  // Obligations grouped by member.
  const oblByMember = new Map<string, MoneyObligation[]>();
  for (const o of obligations) {
    const mid = o.membership_id || o.id;
    if (!oblByMember.has(mid)) oblByMember.set(mid, []);
    oblByMember.get(mid)!.push(o);
  }

  // Confirmed / pending money + last confirmed date, attributed by member.
  const confirmedByMember = new Map<string, number>();
  const pendingByMember = new Map<string, number>();
  const lastConfirmedByMember = new Map<string, string | null>();
  for (const p of payments) {
    const mid = p.membership_id;
    if (!mid) continue;
    if (isPendingPayment(p.status)) {
      pendingByMember.set(mid, (pendingByMember.get(mid) || 0) + num(p.amount));
    } else if (isCollectedDuesPayment(p)) {
      confirmedByMember.set(mid, (confirmedByMember.get(mid) || 0) + num(p.amount));
      const prev = lastConfirmedByMember.get(mid) || null;
      const at = p.recorded_at || null;
      if (at && (!prev || at > prev)) lastConfirmedByMember.set(mid, at);
    }
  }

  // Universe of members: anyone enrolled (obligation) OR who paid.
  const memberIds = new Set<string>([
    ...oblByMember.keys(),
    ...confirmedByMember.keys(),
    ...pendingByMember.keys(),
  ]);

  const rows: MemberParticipation[] = [];
  const totals: ObjectReportTotals = {
    expectedMembers: 0,
    contributedMembers: 0,
    partialMembers: 0,
    pendingMembers: 0,
    notContributedMembers: 0,
    waivedMembers: 0,
    totalExpected: 0,
    totalCollected: 0,
    totalPending: 0,
    totalWaived: 0,
    totalOutstanding: 0,
    totalOverdue: 0,
  };

  for (const mid of memberIds) {
    const obls = oblByMember.get(mid) || [];
    const nonWaived = obls.filter((o) => o.status !== "waived");
    const allWaived = obls.length > 0 && nonWaived.length === 0;

    const expected = nonWaived.reduce((s, o) => s + num(o.amount), 0);
    const confirmedPaid = confirmedByMember.get(mid) || 0;
    const pendingAmount = pendingByMember.get(mid) || 0;
    const remaining = Math.max(0, expected - confirmedPaid);
    const lastConfirmedPaymentAt = lastConfirmedByMember.get(mid) || null;

    const memberStates = computeObligationStates(obls, payments.filter(p => p.membership_id === mid), { today });
    const overdueRemaining = nonWaived.reduce((sum, o) => {
      const state = memberStates.get(o.id);
      return sum + (state?.isOverdue ? state.remaining : 0);
    }, 0);
    const isOverdue = overdueRemaining > 0;

    let status: ParticipationStatus;
    if (allWaived) status = "waived";
    else if (expected > 0 && confirmedPaid >= expected) status = "contributed";
    else if (confirmedPaid > 0) status = "partial";
    else if (pendingAmount > 0) status = "pending";
    else status = "not_contributed";

    rows.push({
      membershipId: mid,
      expected,
      confirmedPaid,
      remaining,
      pendingAmount,
      status,
      isOverdue,
      lastConfirmedPaymentAt,
      hasReceiptEligible: confirmedPaid > 0,
    });

    // Collected + pending reconcile with Σ confirmed/pending payments for the
    // type (counted for every member, even the rare waived-but-paid case).
    totals.totalCollected += confirmedPaid;
    totals.totalPending += pendingAmount;
    totals.expectedMembers += 1;

    if (allWaived) {
      totals.waivedMembers += 1;
      totals.totalWaived += obls.reduce((s, o) => s + num(o.amount), 0);
      continue; // waived: not expected, not outstanding
    }
    totals.totalExpected += expected;
    totals.totalOutstanding += remaining;
    totals.totalOverdue += overdueRemaining;

    if (status === "contributed") totals.contributedMembers += 1;
    else if (status === "partial") totals.partialMembers += 1;
    else if (status === "pending") totals.pendingMembers += 1;
    else totals.notContributedMembers += 1;
  }

  return { rows, totals };
}

// ── Confirmed-only reminder eligibility + amount (Build 14) ─────────────────
// Payment/contribution REMINDERS must use the SAME confirmed basis as the unpaid
// list, matrix, per-object report, and Pay-Now — never the polluted amount_paid
// column or trigger-driven status. These helpers are the single source of
// "should we remind this obligation, and for how much", so a reminder can never
// disagree with what a member sees they owe. Pure: they only COMPUTE — never
// send, queue, or mutate. Callers gate the live flip behind a flag + dry-run.

export type ReminderSuppressedReason = "flexible_or_excluded";

export interface ReminderDecision {
  obligationId: string;
  /** Confirmed-only: open (not waived, not fully covered by confirmed payments). */
  isOpen: boolean;
  /** Confirmed-only remaining the reminder should show — matches Pay-Now/unpaid/matrix. */
  remaining: number;
  isWaived: boolean;
  /** Set when a flexible/excluded contribution type means we suppress the reminder. */
  suppressed: ReminderSuppressedReason | null;
  /**
   * The send decision: remind iff confirmed-open AND not suppressed. Waived and
   * fully-confirmed-paid obligations are never eligible (computeObligation marks
   * them not-open); flexible/optional + standing-excluded types are suppressed.
   */
  eligible: boolean;
}

export interface ReminderDecisionOptions {
  today?: string;
  /** contribution_type_ids that are flexible (variable-amount) — suppress reminders. */
  flexibleTypeIds?: Set<string>;
  /** contribution_type_ids excluded from standing (groups.settings.standing_rules) — suppress. */
  excludedTypeIds?: Set<string>;
}

/**
 * Per-obligation confirmed-only reminder decisions. Routes through
 * computeObligationStates (confirmed payments allocated oldest-due first, per
 * type), then layers reminder-policy suppression for flexible / standing-excluded
 * types. Pending/rejected payments never count; waived obligations are never open.
 */
export function computeReminderDecisions(
  obligations: MoneyObligation[],
  payments: MoneyPayment[],
  opts: ReminderDecisionOptions = {},
): Map<string, ReminderDecision> {
  const states = computeObligationStates(obligations, payments, { today: opts.today });
  const flexible = opts.flexibleTypeIds || new Set<string>();
  const excluded = opts.excludedTypeIds || new Set<string>();

  const out = new Map<string, ReminderDecision>();
  for (const o of obligations) {
    const c = states.get(o.id);
    const isOpen = !!c && c.isOpen;
    const isWaived = !!c && c.isWaived;
    const remaining = c ? c.remaining : 0;
    const typeId = o.contribution_type_id || "";
    const suppressed: ReminderSuppressedReason | null =
      typeId && (flexible.has(typeId) || excluded.has(typeId)) ? "flexible_or_excluded" : null;
    const eligible = isOpen && !suppressed;
    out.set(o.id, { obligationId: o.id, isOpen, remaining, isWaived, suppressed, eligible });
  }
  return out;
}

/**
 * Single-obligation convenience for the WhatsApp producer (one obligation at a
 * time): pass the member's same-type obligations + confirmed payments (oldest-due
 * allocation needs the siblings) and read the decision for the target obligation.
 */
export function computeReminderDecisionFor(
  obligationId: string,
  obligations: MoneyObligation[],
  payments: MoneyPayment[],
  opts: ReminderDecisionOptions = {},
): ReminderDecision | null {
  return computeReminderDecisions(obligations, payments, opts).get(obligationId) || null;
}
