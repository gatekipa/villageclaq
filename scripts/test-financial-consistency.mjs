import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { computeMoneyFigures, computeObligationStates, buildObjectReport, matchesLedgerFilters, isConfirmedPayment } from "../src/lib/money.ts";
import { readAllPages } from "../src/lib/read-all-pages.ts";
import { formatDateWithGroupFormat } from "../src/lib/format.ts";
import { isFinancialQuery, invalidateFinancialQueries } from "../src/lib/financial-query-keys.ts";

const today = "2026-09-06";
test("database calendar dates survive western and eastern timezones", () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ["America/New_York", "America/Los_Angeles", "Africa/Douala", "Pacific/Auckland"]) {
      process.env.TZ = zone;
      assert.equal(formatDateWithGroupFormat("2026-12-01", "YYYY-MM-DD"), "2026-12-01");
      assert.equal(formatDateWithGroupFormat("2026-12-01", "DD/MM/YYYY", "fr"), "01/12/2026");
    }
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
});
const obligation = (id = "o1", member = "m1", type = "t1", amount = 100, due = "2026-09-01") =>
  ({ id, membership_id: member, contribution_type_id: type, amount, due_date: due, status: "pending" });
const payment = (amount, status = "confirmed", member = "m1", type = "t1", id = "p1") =>
  ({ id, amount, status, membership_id: member, contribution_type_id: type, recorded_at: "2026-09-02" });
function reconcile(obls, pays, expected) {
  const figures = computeMoneyFigures(obls, pays, { today });
  const states = computeObligationStates(obls, pays, { today });
  const report = buildObjectReport(obls, pays, { today });
  assert.equal(figures.collected, expected.collected);
  assert.equal(figures.outstanding, expected.outstanding);
  assert.equal(report.totals.totalCollected, figures.collected);
  assert.equal(report.totals.totalOutstanding, figures.outstanding);
  assert.equal(report.totals.totalOverdue, figures.overdue.amount);
  assert.equal([...states.values()].reduce((s, r) => s + r.remaining, 0), figures.outstanding);
  return { figures, states, report };
}
test("full / partial / two installments reconcile group, statement and contribution", () => {
  for (const amounts of [[100], [40], [40, 60]]) {
    const collected = amounts.reduce((a, b) => a + b, 0);
    const result = reconcile([obligation()], amounts.map((n, i) => payment(n, "confirmed", "m1", "t1", `p${i}`)),
      { collected, outstanding: 100 - collected });
    assert.equal(result.report.rows[0].status, collected === 100 ? "contributed" : "partial");
  }
});
test("rejection/correction restores balances without deleting historical evidence", () => {
  const original = payment(100);
  reconcile([obligation()], [original], { collected: 100, outstanding: 0 });
  reconcile([obligation()], [{ ...original, status: "rejected" }], { collected: 0, outstanding: 100 });
  reconcile([obligation()], [{ ...original, amount: 40 }], { collected: 40, outstanding: 60 });
  assert.equal(original.amount, 100);
  assert.equal(original.status, "confirmed");
  assert.equal(isConfirmedPayment("voided"), false);
  assert.equal(isConfirmedPayment("unexpected"), false);
});
test("pending/waived/empty histories never create collection or debt", () => {
  const result = reconcile([obligation(), { ...obligation("o2", "m2"), status: "waived" }], [payment(40, "pending_confirmation")],
    { collected: 0, outstanding: 100 });
  assert.deepEqual(result.figures.pending, { count: 1, amount: 40 });
  assert.equal(result.figures.waivedTotal, 100);
  reconcile([], [], { collected: 0, outstanding: 0 });
});
test("same-day is not overdue; only the unpaid past-due portion ages", () => {
  const obls = [obligation(), obligation("o2", "m1", "t1", 100, "2026-10-01")];
  const paidOld = reconcile(obls, [payment(100)], { collected: 100, outstanding: 100 });
  assert.equal(paidOld.figures.overdue.amount, 0);
  assert.equal(paidOld.report.rows[0].isOverdue, false);
  const partialOld = reconcile(obls, [payment(40)], { collected: 40, outstanding: 160 });
  assert.equal(partialOld.figures.overdue.amount, 60);
  assert.equal(computeMoneyFigures([obligation("today", "m1", "t1", 100, today)], [], { today }).overdue.amount, 0);
});
test("overpayment cannot hide another member or contribution's debt", () => {
  for (const other of [obligation("o2", "m2"), obligation("o2", "m1", "t2")]) {
    const { figures } = reconcile([obligation(), other], [payment(200)], { collected: 200, outstanding: 100 });
    assert.equal(figures.unallocatedCredit, 100);
    assert.equal(figures.overdue.memberCount, 1);
  }
});
test("multiple members/types reconcile independently", () => {
  const obls = [obligation(), obligation("o2", "m2"), obligation("o3", "m1", "t2")];
  const pays = [payment(40), payment(100, "confirmed", "m2"), payment(20, "confirmed", "m1", "t2")];
  const { figures } = reconcile(obls, pays, { collected: 160, outstanding: 140 });
  const perType = ["t1", "t2"].map((type) => computeMoneyFigures(obls.filter(o => o.contribution_type_id === type), pays.filter(p => p.contribution_type_id === type), { today }));
  assert.equal(perType.reduce((s, r) => s + r.outstanding, 0), figures.outstanding);
});
test("legacy linked payment attribution works and mismatched member fails closed", () => {
  const obls = [obligation()];
  const legacy = { amount: 100, obligation_id: "o1", status: "confirmed" };
  reconcile(obls, [legacy], { collected: 100, outstanding: 0 });
  assert.throws(
    () => computeObligationStates(obls, [{ ...legacy, membership_id: "someone-else" }], { today }),
    /PAYMENT_ATTRIBUTION_INVALID/,
  );
});
test("same-date allocation is deterministic regardless of query order", () => {
  const obls = [obligation("b"), obligation("a")];
  for (const type of ["t1", null]) {
    const pays = [payment(40, "confirmed", "m1", type)];
    const forward = computeObligationStates(obls, pays, { today });
    const reverse = computeObligationStates([...obls].reverse(), pays, { today });
    assert.equal(forward.get("a").confirmedPaid, 40);
    for (const o of obls) assert.deepEqual(forward.get(o.id), reverse.get(o.id));
  }
});

test("cent precision never leaves phantom debt after full payment", () => {
  const result = reconcile([obligation("o1", "m1", "t1", 0.8)], [payment(0.1), payment(0.7)], { collected: 0.8, outstanding: 0 });
  assert.equal(result.states.get("o1").isOpen, false);
});
test("archive/exit flags do not erase historical assessments and payments", () => {
  const obls = [{ ...obligation(), contribution_is_active: false, membership_status: "exited" }];
  reconcile(obls, [payment(40)], { collected: 40, outstanding: 60 });
});
test("two similarly named groups remain isolated at the scoped query boundary", () => {
  const groups = [
    { id: "A", obligations: [obligation()], payments: [payment(100)] },
    { id: "B", obligations: [obligation("o2", "m2")], payments: [] },
  ];
  const a = reconcile(groups[0].obligations, groups[0].payments, { collected: 100, outstanding: 0 });
  const b = reconcile(groups[1].obligations, groups[1].payments, { collected: 0, outstanding: 100 });
  assert.notEqual(a.figures.collected, b.figures.collected);
  assert.equal(isFinancialQuery(["payments", "B", "all"], "A", "m1"), false);
  assert.equal(isFinancialQuery(["member-standing", "m2", "B"], "A", "m1"), false);
});
test("period/method/type filters are inclusive and agree with exported row totals", () => {
  const rows = [
    { recordedAt: "2026-08-31T23:59:59Z", paymentMethod: "cash", contributionTypeId: "t1", amount: 10 },
    { recordedAt: "2026-09-01T00:00:00Z", paymentMethod: "cash", contributionTypeId: "t1", amount: 40 },
    { recordedAt: "2026-09-30T23:59:59Z", paymentMethod: "cash", contributionTypeId: "t1", amount: 60 },
    { recordedAt: "2026-09-02", paymentMethod: "online", contributionTypeId: "t2", amount: 20 },
  ];
  const filtered = rows.filter(r => matchesLedgerFilters(r, { from: "2026-09-01", to: "2026-09-30", method: "cash", contributionTypeId: "t1" }));
  assert.equal(filtered.length, 2);
  assert.equal(filtered.reduce((s, r) => s + r.amount, 0), 100);
  assert.equal(matchesLedgerFilters(rows[0], { from: "2026-09-30", to: "2026-09-01" }), false);
});
test("pagination reads beyond server caps and fails closed on partial responses", async () => {
  const input = Array.from({ length: 1205 }, (_, id) => ({ id }));
  const output = await readAllPages(async (from, to) => ({ data: input.slice(from, Math.min(to + 1, from + 100)), error: null }));
  assert.deepEqual(output, input);
  await assert.rejects(readAllPages(async (from) => from ? { data: null, error: { message: "sensitive backend detail" } } : { data: input.slice(0, 100), error: null }),
    { message: "Financial records could not be loaded completely." });
});
test("payment invalidation covers statement/report/standing caches, never sends", async () => {
  const keys = [["payments", "A"], ["object-report", "A", "t1"], ["money-overview", "A"], ["member-standing-detailed", "m1", "A"], ["my-payments-full", "m1"], ["member-detail", "m1"]];
  let invalidated = [];
  await invalidateFinancialQueries({ invalidateQueries: async ({ predicate }) => { invalidated = keys.filter(queryKey => predicate({ queryKey })); } }, "A", "m1");
  assert.deepEqual(invalidated, keys);
});
test("source boundaries: no member-wide allocation in self-service; no balance-writing dashboard sync", () => {
  const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
  const member = read("../src/app/[locale]/(dashboard)/dashboard/my-payments/page.tsx");
  const finances = read("../src/app/[locale]/(dashboard)/dashboard/finances/page.tsx");
  assert.match(member, /usePayments\("all", currentMembership\?\.id \?\? null\)/);
  assert.doesNotMatch(member, /allocateConfirmedToObligations/);
  const refresh = finances.slice(finances.indexOf("async function handleSyncPayments"), finances.indexOf("const subNavItems"));
  assert.doesNotMatch(refresh, /\.update\(|\.insert\(|\.delete\(/);
});
