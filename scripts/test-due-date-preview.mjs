import assert from "node:assert/strict";
import test from "node:test";
import {
  clampDueDay,
  describeDueDay,
  ordinalDay,
} from "../src/lib/due-date-preview.ts";

// Build-9 unit tests for the human due-date preview (Node 22 strips TS types on
// import — real logic under test). Core invariant: the preview mirrors the
// obligation trigger's LEAST(due_day,28) clamp so it never disagrees with the
// dates the system actually generates, and it never fabricates a date for
// one-time / no-due-day types.

// Fixed "now" via LOCAL components (avoids timezone flakiness): 14 Jun 2026.
const NOW = new Date(2026, 5, 14);

test("clampDueDay mirrors LEAST(day,28) + floor at 1", () => {
  assert.equal(clampDueDay(1), 1);
  assert.equal(clampDueDay(28), 28);
  assert.equal(clampDueDay(29), 28);
  assert.equal(clampDueDay(31), 28);
  assert.equal(clampDueDay(0), 1);
  assert.equal(clampDueDay(15.6), 16);
});

test("monthly: upcoming day this month -> daysUntil this month", () => {
  const p = describeDueDay({ dueDay: 15, frequency: "monthly", now: NOW });
  assert.equal(p.kind, "recurring");
  assert.equal(p.period, "month");
  assert.equal(p.clampedDay, 15);
  assert.equal(p.nextDueISO, "2026-06-15");
  assert.equal(p.daysUntil, 1);
});

test("monthly: passed day this month -> next month", () => {
  const p = describeDueDay({ dueDay: 1, frequency: "monthly", now: NOW });
  assert.equal(p.nextDueISO, "2026-07-01");
  assert.equal(p.daysUntil, 17);
});

test("monthly: day 30 clamps to 28", () => {
  const p = describeDueDay({ dueDay: 30, frequency: "monthly", now: NOW });
  assert.equal(p.clampedDay, 28);
  assert.equal(p.nextDueISO, "2026-06-28");
  assert.equal(p.daysUntil, 14);
});

test("monthly: due today -> 0 days", () => {
  const p = describeDueDay({ dueDay: 14, frequency: "monthly", now: NOW });
  assert.equal(p.nextDueISO, "2026-06-14");
  assert.equal(p.daysUntil, 0);
});

test("quarterly/annual: day-of-month label only, no fabricated date", () => {
  const q = describeDueDay({ dueDay: 10, frequency: "quarterly", now: NOW });
  assert.equal(q.kind, "recurring");
  assert.equal(q.period, "quarter");
  assert.equal(q.nextDueISO, null);
  assert.equal(q.daysUntil, null);
  const a = describeDueDay({ dueDay: 10, frequency: "annual", now: NOW });
  assert.equal(a.period, "year");
  assert.equal(a.nextDueISO, null);
});

test("one-time WITHOUT start_date returns 'none' (no fabricated date)", () => {
  assert.equal(describeDueDay({ dueDay: 5, frequency: "one_time", now: NOW }).kind, "none");
  assert.equal(describeDueDay({ dueDay: null, frequency: "monthly", now: NOW }).kind, "none");
  assert.equal(describeDueDay({ dueDay: undefined, frequency: "monthly", now: NOW }).kind, "none");
  assert.equal(describeDueDay({ dueDay: NaN, frequency: "monthly", now: NOW }).kind, "none");
});

test("one-time WITH start_date returns the exact calendar date (Build 10)", () => {
  const future = describeDueDay({ dueDay: null, frequency: "one_time", startDate: "2026-07-15", now: NOW });
  assert.equal(future.kind, "one_time");
  assert.equal(future.dueISO, "2026-07-15");
  assert.equal(future.daysUntil, 31);
  const past = describeDueDay({ dueDay: null, frequency: "one_time", startDate: "2026-06-01", now: NOW });
  assert.equal(past.kind, "one_time");
  assert.equal(past.daysUntil, -13, "past one-time date reports negative days");
});

test("ordinalDay: English suffixes + French", () => {
  assert.equal(ordinalDay(1, "en"), "1st");
  assert.equal(ordinalDay(2, "en"), "2nd");
  assert.equal(ordinalDay(3, "en"), "3rd");
  assert.equal(ordinalDay(4, "en"), "4th");
  assert.equal(ordinalDay(11, "en"), "11th");
  assert.equal(ordinalDay(21, "en"), "21st");
  assert.equal(ordinalDay(22, "en"), "22nd");
  assert.equal(ordinalDay(1, "fr"), "1er");
  assert.equal(ordinalDay(15, "fr"), "15");
});
