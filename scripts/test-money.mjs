import assert from "node:assert/strict";
import test from "node:test";
import {
  isConfirmedPayment,
  isPendingPayment,
  isRejectedPayment,
  num,
  confirmedPaidByObligation,
  confirmedPaidByType,
  confirmedPaidByMember,
  allocateConfirmedToObligations,
  computeObligation,
  computeObligationStates,
  computeMoneyFigures,
  buildObjectReport,
} from "../src/lib/money.ts";

// Executable unit tests for the Build-4 canonical money engine. These verify
// the ACTUAL math (Node 22.18 strips TS types on import), not just source text.
// Core invariant under test: pending payments NEVER count as collected, waived
// NEVER counts as outstanding, and per-obligation "paid" derives from CONFIRMED
// payments (not the polluted amount_paid column).

const TODAY = "2026-06-13";

test("payment status predicates (null/empty = confirmed)", () => {
  assert.equal(isConfirmedPayment("confirmed"), true);
  assert.equal(isConfirmedPayment(null), true);
  assert.equal(isConfirmedPayment(""), true);
  assert.equal(isConfirmedPayment("pending_confirmation"), false);
  assert.equal(isConfirmedPayment("rejected"), false);
  assert.equal(isPendingPayment("pending_confirmation"), true);
  assert.equal(isRejectedPayment("rejected"), true);
  assert.equal(num("12.5"), 12.5);
  assert.equal(num(null), 0);
  assert.equal(num("abc"), 0);
});

test("confirmedPaidByObligation sums only confirmed, ignores pending/rejected + null obligation", () => {
  const m = confirmedPaidByObligation([
    { amount: 100, status: "confirmed", obligation_id: "o1" },
    { amount: 50, status: "pending_confirmation", obligation_id: "o1" }, // ignored
    { amount: 25, status: "rejected", obligation_id: "o1" }, // ignored
    { amount: 40, status: "confirmed", obligation_id: "o2" },
    { amount: 999, status: "confirmed", obligation_id: null }, // ignored (no obligation)
  ]);
  assert.equal(m.get("o1"), 100);
  assert.equal(m.get("o2"), 40);
  assert.equal(m.size, 2);
});

test("computeObligation derives paid from CONFIRMED payments, not amount_paid", () => {
  // amount_paid column says 100 (polluted by a pending pay-now), but only 0 confirmed.
  const confirmed = confirmedPaidByObligation([
    { amount: 100, status: "pending_confirmation", obligation_id: "o1" },
  ]);
  const c = computeObligation(
    { id: "o1", amount: 100, amount_paid: 100, status: "paid", due_date: "2026-01-01", membership_id: "m1" },
    confirmed,
    TODAY,
  );
  assert.equal(c.confirmedPaid, 0, "pending money must not count as paid");
  assert.equal(c.remaining, 100);
  assert.equal(c.isPaid, false);
  assert.equal(c.isOpen, true);
  assert.equal(c.isOverdue, true, "past-due + unpaid (confirmed) = overdue");
});

test("waived obligation is never outstanding/overdue", () => {
  const c = computeObligation(
    { id: "o1", amount: 100, amount_paid: 0, status: "waived", due_date: "2020-01-01", membership_id: "m1" },
    new Map(),
    TODAY,
  );
  assert.equal(c.isWaived, true);
  assert.equal(c.isOpen, false);
  assert.equal(c.isOverdue, false);
});

test("computeMoneyFigures: pending excluded from collected, waived excluded from expected", () => {
  const obligations = [
    { id: "o1", amount: 100, status: "pending", due_date: "2026-01-01", membership_id: "m1" }, // overdue, unpaid
    { id: "o2", amount: 100, status: "paid", due_date: "2026-01-01", membership_id: "m2" }, // fully confirmed
    { id: "o3", amount: 100, status: "waived", due_date: "2026-01-01", membership_id: "m3" }, // excused
  ];
  const payments = [
    { amount: 100, status: "confirmed", obligation_id: "o2", relief_plan_id: null },
    { amount: 100, status: "pending_confirmation", obligation_id: "o1", relief_plan_id: null }, // pending
    { amount: 500, status: "confirmed", obligation_id: null, relief_plan_id: "r1" }, // relief — excluded from dues
  ];
  const f = computeMoneyFigures(obligations, payments, { today: TODAY });
  assert.equal(f.expected, 200, "waived o3 excluded from expected");
  assert.equal(f.collected, 100, "only the confirmed dues payment counts; pending + relief excluded");
  assert.equal(f.outstanding, 100);
  assert.equal(f.waivedTotal, 100);
  assert.equal(f.pending.count, 1);
  assert.equal(f.pending.amount, 100);
  assert.equal(f.overdue.amount, 100, "o1 is past due with confirmed remaining");
  assert.equal(f.overdue.memberCount, 1);
  assert.equal(f.membersOwing, 1);
});

test("Baby Shower one-time contribution report (canonical end-to-end)", () => {
  // 5 members expected at 1000 each. m1 paid (confirmed, payment carries NO
  // obligation_id — the common record-payment path), m2 partial (confirmed 400),
  // m3 submitted pending, m4 only a rejected payment, m5 waived.
  const obligations = [
    { id: "o1", amount: 1000, status: "paid", due_date: "2026-05-01", membership_id: "m1" },
    { id: "o2", amount: 1000, status: "partial", due_date: "2026-05-01", membership_id: "m2" },
    { id: "o3", amount: 1000, status: "pending", due_date: "2026-05-01", membership_id: "m3" },
    { id: "o4", amount: 1000, status: "pending", due_date: "2026-05-01", membership_id: "m4" },
    { id: "o5", amount: 1000, status: "waived", due_date: "2026-05-01", membership_id: "m5" },
  ];
  // Payments attributed by membership_id; m1's confirmed payment has NO
  // obligation_id (proves the critical fix: it must still count as collected).
  const payments = [
    { amount: 1000, status: "confirmed", membership_id: "m1", contribution_type_id: "t1", obligation_id: null, recorded_at: "2026-04-10" },
    { amount: 400, status: "confirmed", membership_id: "m2", contribution_type_id: "t1", obligation_id: "o2", recorded_at: "2026-04-12" },
    { amount: 1000, status: "pending_confirmation", membership_id: "m3", contribution_type_id: "t1", obligation_id: null, recorded_at: "2026-04-15" },
    { amount: 200, status: "rejected", membership_id: "m4", contribution_type_id: "t1", obligation_id: null, recorded_at: "2026-04-16" },
  ];
  const { rows, totals } = buildObjectReport(obligations, payments, { today: TODAY });

  // one row per member (not per obligation/payment)
  assert.equal(rows.length, 5);
  assert.equal(totals.expectedMembers, 5);
  assert.equal(totals.contributedMembers, 1, "only m1 fully contributed");
  assert.equal(totals.partialMembers, 1, "m2 partial");
  assert.equal(totals.pendingMembers, 1, "m3 has a pending submission, nothing confirmed");
  assert.equal(totals.notContributedMembers, 1, "m4 rejected = nothing confirmed/pending");
  assert.equal(totals.waivedMembers, 1, "m5 excused");

  // money — confirmed only; the obligation-less confirmed payment IS counted
  assert.equal(totals.totalExpected, 4000, "waived m5 excluded");
  assert.equal(totals.totalCollected, 1400, "1000 (no obligation_id) + 400 confirmed; pending + rejected excluded");
  assert.equal(totals.totalPending, 1000, "m3 pending shown separately");
  assert.equal(totals.totalWaived, 1000);
  assert.equal(totals.totalOutstanding, 2600, "4000 expected - 1400 confirmed");
  assert.equal(totals.totalOverdue, 2600, "all open obligations are past due 2026-05-01");

  const m1 = rows.find((r) => r.membershipId === "m1");
  assert.equal(m1.confirmedPaid, 1000, "obligation_id-less confirmed payment counts");
  assert.equal(m1.status, "contributed");
  assert.equal(m1.hasReceiptEligible, true);
  assert.equal(m1.lastConfirmedPaymentAt, "2026-04-10");

  const m3 = rows.find((r) => r.membershipId === "m3");
  assert.equal(m3.confirmedPaid, 0);
  assert.equal(m3.pendingAmount, 1000);
  assert.equal(m3.status, "pending");
});

test("per-member aggregation: multiple obligations of one type yield ONE row", () => {
  // m1 has 4 quarterly obligations of the same type; total expected 4000.
  const obligations = [
    { id: "q1", amount: 1000, status: "paid", due_date: "2026-01-01", membership_id: "m1" },
    { id: "q2", amount: 1000, status: "paid", due_date: "2026-04-01", membership_id: "m1" },
    { id: "q3", amount: 1000, status: "pending", due_date: "2026-07-01", membership_id: "m1" },
    { id: "q4", amount: 1000, status: "pending", due_date: "2026-10-01", membership_id: "m1" },
  ];
  const payments = [
    { amount: 2500, status: "confirmed", membership_id: "m1", contribution_type_id: "t1", obligation_id: null, recorded_at: "2026-02-01" },
  ];
  const { rows, totals } = buildObjectReport(obligations, payments, { today: TODAY });
  assert.equal(rows.length, 1, "one member → one row (not 4)");
  assert.equal(totals.expectedMembers, 1, "member counted once, not per obligation");
  assert.equal(rows[0].expected, 4000);
  assert.equal(rows[0].confirmedPaid, 2500);
  assert.equal(rows[0].remaining, 1500);
  assert.equal(rows[0].status, "partial");
});

test("confirmedPaidByType attributes confirmed payments by contribution_type_id", () => {
  const m = confirmedPaidByType([
    { amount: 1000, status: "confirmed", contribution_type_id: "t1", relief_plan_id: null },
    { amount: 500, status: "confirmed", contribution_type_id: "t1", relief_plan_id: null },
    { amount: 99, status: "pending_confirmation", contribution_type_id: "t1", relief_plan_id: null }, // excluded
    { amount: 700, status: "confirmed", contribution_type_id: "t2", relief_plan_id: null },
    { amount: 800, status: "confirmed", contribution_type_id: "t1", relief_plan_id: "r1" }, // relief excluded
  ]);
  assert.equal(m.get("t1"), 1500);
  assert.equal(m.get("t2"), 700);
});

test("confirmedPaidByMember sums confirmed dues by membership_id (obligation_id irrelevant)", () => {
  const m = confirmedPaidByMember([
    { amount: 1000, status: "confirmed", membership_id: "m1", obligation_id: null, relief_plan_id: null },
    { amount: 500, status: "confirmed", membership_id: "m1", obligation_id: null, relief_plan_id: null },
    { amount: 200, status: "pending_confirmation", membership_id: "m1", relief_plan_id: null }, // excluded
    { amount: 300, status: "confirmed", membership_id: "m2", relief_plan_id: null },
    { amount: 999, status: "confirmed", membership_id: "m1", relief_plan_id: "r1" }, // relief excluded
  ]);
  assert.equal(m.get("m1"), 1500);
  assert.equal(m.get("m2"), 300);
});

test("allocateConfirmedToObligations pours a member's confirmed total oldest-first", () => {
  // member m1 owes 3×1000 (Q1,Q2,Q3) and has confirmed 1500 total (no obligation_id).
  const obligations = [
    { id: "q2", amount: 1000, status: "pending", due_date: "2026-04-01", membership_id: "m1" },
    { id: "q1", amount: 1000, status: "pending", due_date: "2026-01-01", membership_id: "m1" },
    { id: "q3", amount: 1000, status: "pending", due_date: "2026-07-01", membership_id: "m1" },
  ];
  const alloc = allocateConfirmedToObligations(obligations, new Map([["m1", 1500]]));
  assert.equal(alloc.get("q1"), 1000, "oldest fully covered");
  assert.equal(alloc.get("q2"), 500, "next partially covered");
  assert.equal(alloc.get("q3"), 0, "newest uncovered");
  // and computeObligation reads it correctly
  const c1 = computeObligation(obligations[1], alloc, TODAY);
  assert.equal(c1.confirmedPaid, 1000);
  assert.equal(c1.isPaid, true);
});

test("group rollup matches per-object sums (no contradictory totals)", () => {
  const obligations = [
    { id: "o1", amount: 1000, status: "paid", due_date: "2026-05-01", membership_id: "m1", contribution_type_id: "t1" },
    { id: "o2", amount: 1000, status: "partial", due_date: "2026-05-01", membership_id: "m2", contribution_type_id: "t1" },
  ];
  // obligation_id-less payments (the common path) attributed by membership_id
  const payments = [
    { amount: 1000, status: "confirmed", membership_id: "m1", contribution_type_id: "t1", obligation_id: null, relief_plan_id: null },
    { amount: 400, status: "confirmed", membership_id: "m2", contribution_type_id: "t1", obligation_id: null, relief_plan_id: null },
  ];
  const figures = computeMoneyFigures(obligations, payments, { today: TODAY });
  const { totals } = buildObjectReport(obligations, payments, { today: TODAY });
  // The single contribution type's per-object collected/expected/outstanding
  // equals the group rollup (same accounting basis) — even with no obligation_id.
  assert.equal(figures.collected, totals.totalCollected);
  assert.equal(figures.expected, totals.totalExpected);
  assert.equal(figures.outstanding, totals.totalOutstanding);
});

// ── computeObligationStates (Build 12 canonical confirmed-only chain) ────────
// Every paid/unpaid/owing/overdue DISPLAY surface routes through this. It must
// (a) ignore amount_paid/status pollution, (b) NOT let a payment to one type
// cover another type's obligation, (c) allocate oldest-due-first within a type.

const B12_TODAY = "2026-06-13";

test("computeObligationStates: a CONFIRMED payment marks the obligation paid", () => {
  const obls = [{ id: "o1", amount: 1000, status: "pending", due_date: "2026-01-01", membership_id: "m1", contribution_type_id: "t1" }];
  const pays = [{ id: "p1", amount: 1000, status: "confirmed", membership_id: "m1", contribution_type_id: "t1" }];
  const s = computeObligationStates(obls, pays, { today: B12_TODAY });
  assert.equal(s.get("o1").isPaid, true);
  assert.equal(s.get("o1").remaining, 0);
  assert.equal(s.get("o1").isOpen, false);
});

test("computeObligationStates: a PENDING payment does NOT mark paid (even if status='partial')", () => {
  const obls = [{ id: "o1", amount: 1000, status: "partial", due_date: "2026-01-01", membership_id: "m1", contribution_type_id: "t1" }];
  const pays = [{ id: "p1", amount: 1000, status: "pending_confirmation", membership_id: "m1", contribution_type_id: "t1" }];
  const s = computeObligationStates(obls, pays, { today: B12_TODAY });
  assert.equal(s.get("o1").confirmedPaid, 0);
  assert.equal(s.get("o1").isOpen, true);
  assert.equal(s.get("o1").remaining, 1000);
});

test("computeObligationStates: a REJECTED payment does NOT mark paid (even if status='paid')", () => {
  const obls = [{ id: "o1", amount: 1000, status: "paid", due_date: "2026-01-01", membership_id: "m1", contribution_type_id: "t1" }];
  const pays = [{ id: "p1", amount: 1000, status: "rejected", membership_id: "m1", contribution_type_id: "t1" }];
  const s = computeObligationStates(obls, pays, { today: B12_TODAY });
  assert.equal(s.get("o1").confirmedPaid, 0);
  assert.equal(s.get("o1").isOpen, true);
});

test("computeObligationStates: a payment to type A NEVER covers a type B obligation", () => {
  const obls = [
    { id: "oA", amount: 1000, status: "pending", due_date: "2026-01-01", membership_id: "m1", contribution_type_id: "tA" },
    { id: "oB", amount: 1000, status: "pending", due_date: "2026-01-01", membership_id: "m1", contribution_type_id: "tB" },
  ];
  const pays = [{ id: "p1", amount: 1000, status: "confirmed", membership_id: "m1", contribution_type_id: "tA" }];
  const s = computeObligationStates(obls, pays, { today: B12_TODAY });
  assert.equal(s.get("oA").isPaid, true);
  assert.equal(s.get("oB").isOpen, true);
  assert.equal(s.get("oB").confirmedPaid, 0);
});

test("computeObligationStates: confirmed total allocates oldest-due first within a type", () => {
  const obls = [
    { id: "oOld", amount: 1000, status: "pending", due_date: "2026-01-01", membership_id: "m1", contribution_type_id: "t1" },
    { id: "oNew", amount: 1000, status: "pending", due_date: "2026-06-01", membership_id: "m1", contribution_type_id: "t1" },
  ];
  const pays = [{ id: "p1", amount: 1000, status: "confirmed", membership_id: "m1", contribution_type_id: "t1" }];
  const s = computeObligationStates(obls, pays, { today: B12_TODAY });
  assert.equal(s.get("oOld").isPaid, true);
  assert.equal(s.get("oNew").isOpen, true);
});

test("computeObligationStates: overdue = confirmed-open AND past due_date", () => {
  const obls = [
    { id: "oPast", amount: 1000, status: "pending", due_date: "2026-01-01", membership_id: "m1", contribution_type_id: "t1" },
    { id: "oFuture", amount: 1000, status: "pending", due_date: "2026-12-01", membership_id: "m2", contribution_type_id: "t1" },
  ];
  const s = computeObligationStates(obls, [], { today: B12_TODAY });
  assert.equal(s.get("oPast").isOverdue, true);
  assert.equal(s.get("oFuture").isOverdue, false);
});

test("computeObligationStates: a paid-up overdue obligation is NOT overdue", () => {
  const obls = [{ id: "o1", amount: 1000, status: "overdue", due_date: "2026-01-01", membership_id: "m1", contribution_type_id: "t1" }];
  const pays = [{ id: "p1", amount: 1000, status: "confirmed", membership_id: "m1", contribution_type_id: "t1" }];
  const s = computeObligationStates(obls, pays, { today: B12_TODAY });
  assert.equal(s.get("o1").isOverdue, false);
  assert.equal(s.get("o1").isPaid, true);
});

test("computeObligationStates: waived obligation flagged, owes nothing (status='waived' is trusted)", () => {
  const obls = [{ id: "o1", amount: 1000, status: "waived", due_date: "2026-01-01", membership_id: "m1", contribution_type_id: "t1" }];
  const s = computeObligationStates(obls, [], { today: B12_TODAY });
  assert.equal(s.get("o1").isWaived, true);
  assert.equal(s.get("o1").isOpen, false);
  assert.equal(s.get("o1").isOverdue, false);
});

test("computeObligationStates: per-type slice reconciles with buildObjectReport remaining", () => {
  const obls = [
    { id: "o1", amount: 1000, status: "pending", due_date: "2026-01-01", membership_id: "m1", contribution_type_id: "t1" },
    { id: "o2", amount: 1000, status: "pending", due_date: "2026-02-01", membership_id: "m2", contribution_type_id: "t1" },
  ];
  const pays = [{ id: "p1", amount: 600, status: "confirmed", membership_id: "m1", contribution_type_id: "t1" }];
  const s = computeObligationStates(obls, pays, { today: B12_TODAY });
  const remViaStates = s.get("o1").remaining + s.get("o2").remaining;
  const { totals } = buildObjectReport(obls, pays, { today: B12_TODAY });
  assert.equal(remViaStates, totals.totalOutstanding);
});

test("computeObligationStates: a TYPELESS confirmed payment covers the member's oldest open obligation (any type)", () => {
  const obls = [
    { id: "oA", amount: 1000, status: "pending", due_date: "2026-01-01", membership_id: "m1", contribution_type_id: "tA" },
    { id: "oB", amount: 1000, status: "pending", due_date: "2026-06-01", membership_id: "m1", contribution_type_id: "tB" },
  ];
  const pays = [{ id: "p1", amount: 1000, status: "confirmed", membership_id: "m1", contribution_type_id: null }];
  const s = computeObligationStates(obls, pays, { today: B12_TODAY });
  assert.equal(s.get("oA").isPaid, true, "typeless general payment covers the oldest open obligation");
  assert.equal(s.get("oB").isOpen, true);
  assert.equal(s.get("oA").remaining + s.get("oB").remaining, 1000, "reconciles with the flat confirmed sum");
});

test("computeObligationStates: typeless pool never double-credits an already type-covered obligation", () => {
  const obls = [{ id: "oA", amount: 1000, status: "pending", due_date: "2026-01-01", membership_id: "m1", contribution_type_id: "tA" }];
  const pays = [
    { id: "p1", amount: 1000, status: "confirmed", membership_id: "m1", contribution_type_id: "tA" },
    { id: "p2", amount: 500, status: "confirmed", membership_id: "m1", contribution_type_id: null },
  ];
  const s = computeObligationStates(obls, pays, { today: B12_TODAY });
  assert.equal(s.get("oA").confirmedPaid, 1000, "capped at the obligation amount, no double-credit from the typeless pool");
  assert.equal(s.get("oA").isPaid, true);
});

test("computeObligationStates: a PENDING typeless payment does NOT cover anything", () => {
  const obls = [{ id: "oA", amount: 1000, status: "pending", due_date: "2026-01-01", membership_id: "m1", contribution_type_id: "tA" }];
  const pays = [{ id: "p1", amount: 1000, status: "pending_confirmation", membership_id: "m1", contribution_type_id: null }];
  const s = computeObligationStates(obls, pays, { today: B12_TODAY });
  assert.equal(s.get("oA").isOpen, true);
  assert.equal(s.get("oA").confirmedPaid, 0);
});
