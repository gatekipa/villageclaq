import assert from "node:assert/strict";
import test from "node:test";
import {
  computeReminderDecisions,
  computeReminderDecisionFor,
} from "../src/lib/money.ts";

// Build 14 — confirmed-only reminder eligibility + amount. Executable proof that
// reminders use the same confirmed basis as Pay-Now/unpaid/matrix: pending and
// rejected payments never suppress or reduce a reminder; confirmed does; waived
// and flexible/excluded types are never reminded.

const TODAY = "2026-06-15";
const o = (id, amount, status, due, type = "t1", member = "m1") => ({
  id, amount, status, due_date: due, membership_id: member, contribution_type_id: type,
});
const p = (amount, status, type = "t1", member = "m1") => ({
  id: "p-" + Math.round(amount), amount, status, membership_id: member, contribution_type_id: type,
});

test("confirmed payment that covers the obligation makes it NOT eligible (nothing to remind)", () => {
  const obls = [o("o1", 1000, "pending", "2026-01-01")];
  const d = computeReminderDecisionFor("o1", obls, [p(1000, "confirmed")], { today: TODAY });
  assert.equal(d.eligible, false);
  assert.equal(d.remaining, 0);
});

test("pending payment does NOT suppress or reduce a reminder", () => {
  const obls = [o("o1", 1000, "partial", "2026-01-01")];
  const d = computeReminderDecisionFor("o1", obls, [p(1000, "pending_confirmation")], { today: TODAY });
  assert.equal(d.eligible, true, "still owes on the confirmed basis");
  assert.equal(d.remaining, 1000, "pending never reduces the reminder amount");
});

test("rejected payment does NOT suppress or reduce a reminder", () => {
  const obls = [o("o1", 1000, "paid", "2026-01-01")];
  const d = computeReminderDecisionFor("o1", obls, [p(1000, "rejected")], { today: TODAY });
  assert.equal(d.eligible, true, "polluted status='paid' but confirmed says still owes");
  assert.equal(d.remaining, 1000);
});

test("confirmed PARTIAL payment reduces the reminder amount (still eligible)", () => {
  const obls = [o("o1", 1000, "pending", "2026-01-01")];
  const d = computeReminderDecisionFor("o1", obls, [p(400, "confirmed")], { today: TODAY });
  assert.equal(d.eligible, true);
  assert.equal(d.remaining, 600);
});

test("waived obligation is never reminded", () => {
  const obls = [o("o1", 1000, "waived", "2026-01-01")];
  const d = computeReminderDecisionFor("o1", obls, [], { today: TODAY });
  assert.equal(d.eligible, false);
  assert.equal(d.isWaived, true);
});

test("flexible contribution type is suppressed (no reminder) unless configured", () => {
  const obls = [o("o1", 1000, "pending", "2026-01-01", "tFlex")];
  const d = computeReminderDecisionFor("o1", obls, [], { today: TODAY, flexibleTypeIds: new Set(["tFlex"]) });
  assert.equal(d.eligible, false);
  assert.equal(d.suppressed, "flexible_or_excluded");
  assert.equal(d.isOpen, true, "still open — but reminders are suppressed for flexible types");
});

test("standing-excluded contribution type is suppressed (no reminder)", () => {
  const obls = [o("o1", 1000, "pending", "2026-01-01", "tExcl")];
  const d = computeReminderDecisionFor("o1", obls, [], { today: TODAY, excludedTypeIds: new Set(["tExcl"]) });
  assert.equal(d.eligible, false);
  assert.equal(d.suppressed, "flexible_or_excluded");
});

test("reminder amount reconciles with the unpaid/Pay-Now basis (oldest-due allocation)", () => {
  const obls = [
    o("oOld", 1000, "pending", "2026-01-01"),
    o("oNew", 1000, "pending", "2026-06-01"),
  ];
  const pays = [p(1500, "confirmed")];
  const map = computeReminderDecisions(obls, pays, { today: TODAY });
  assert.equal(map.get("oOld").eligible, false, "oldest fully covered");
  assert.equal(map.get("oOld").remaining, 0);
  assert.equal(map.get("oNew").eligible, true);
  assert.equal(map.get("oNew").remaining, 500, "remainder owed = same as Pay-Now/unpaid");
});

test("a payment to type A never suppresses a type B reminder (per-type isolation)", () => {
  const obls = [o("oA", 1000, "pending", "2026-01-01", "tA"), o("oB", 1000, "pending", "2026-01-01", "tB")];
  const pays = [p(1000, "confirmed", "tA")];
  const map = computeReminderDecisions(obls, pays, { today: TODAY });
  assert.equal(map.get("oA").eligible, false);
  assert.equal(map.get("oB").eligible, true, "type-A payment must not cover type-B reminder");
  assert.equal(map.get("oB").remaining, 1000);
});
