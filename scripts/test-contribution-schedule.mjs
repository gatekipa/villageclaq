import assert from "node:assert/strict";
import test from "node:test";
import {
  clampDueDay,
  computeObligationDueDate,
  todayISO,
  daysBetweenISO,
} from "../src/lib/contribution-schedule.ts";
import { clampDueDay as previewClamp } from "../src/lib/due-date-preview.ts";

// Build-10 unit tests for the schedule ENGINE (Node 22 strips TS types on import
// — real logic under test). CORE INVARIANT: computeObligationDueDate produces the
// SAME due_date + period_label the DB trigger generate_obligations_for_type()
// would (migration 00002:107-118), so client-enrolled obligations agree with
// trigger-generated ones. It uses the BASE month (no forward rollover) exactly
// like the trigger, and is timezone-safe.

const BASE = "2026-06-14"; // a fixed base date (today) for determinism

test("clampDueDay mirrors LEAST(day,28) and is identical to the preview clamp", () => {
  assert.equal(clampDueDay(31), 28);
  assert.equal(clampDueDay(29), 28);
  assert.equal(clampDueDay(0), 1);
  assert.equal(clampDueDay(15), 15);
  // parity: the engine clamp and the preview clamp must never drift
  for (const d of [1, 5, 15, 28, 29, 31]) {
    assert.equal(clampDueDay(d), previewClamp(d), `clamp parity for ${d}`);
  }
});

test("monthly: uses BASE month + clamped day (no rollover, trigger parity)", () => {
  const r = computeObligationDueDate({ frequency: "monthly", dueDay: 15, baseDate: BASE });
  assert.equal(r.dueISO, "2026-06-15");
  assert.equal(r.periodLabel, "June 2026");
  assert.equal(r.daysUntil, 1);
});

test("monthly: due_day=31 clamps to the 28th", () => {
  const r = computeObligationDueDate({ frequency: "monthly", dueDay: 31, baseDate: BASE });
  assert.equal(r.dueISO, "2026-06-28");
  assert.equal(r.periodLabel, "June 2026");
});

test("monthly: a day already past in the base month is NOT rolled forward (trigger parity)", () => {
  const r = computeObligationDueDate({ frequency: "monthly", dueDay: 1, baseDate: BASE });
  assert.equal(r.dueISO, "2026-06-01", "trigger uses the base month, even if past");
  assert.equal(r.daysUntil, -13);
});

test("one-time: start_date IS the exact due date (no due_day)", () => {
  const r = computeObligationDueDate({ frequency: "one_time", startDate: "2026-07-15", baseDate: BASE });
  assert.equal(r.dueISO, "2026-07-15");
  assert.equal(r.periodLabel, "2026-07-15", "one_time period label is the ISO date (trigger to_char YYYY-MM-DD)");
  assert.equal(r.daysUntil, 31);
});

test("one-time with start_date + due_day clamps the day within start_date's month (trigger parity)", () => {
  const r = computeObligationDueDate({ frequency: "one_time", startDate: "2026-07-15", dueDay: 5, baseDate: BASE });
  assert.equal(r.dueISO, "2026-07-05");
});

test("quarterly / annual period labels", () => {
  const q = computeObligationDueDate({ frequency: "quarterly", dueDay: 10, baseDate: BASE });
  assert.equal(q.dueISO, "2026-06-10");
  assert.equal(q.periodLabel, "Q2 2026"); // June is Q2
  const a = computeObligationDueDate({ frequency: "annual", dueDay: 1, baseDate: BASE });
  assert.equal(a.dueISO, "2026-06-01");
  assert.equal(a.periodLabel, "2026");
});

test("no due_day, no start_date: due = base date (trigger COALESCE(start_date,today))", () => {
  const r = computeObligationDueDate({ frequency: "monthly", baseDate: BASE });
  assert.equal(r.dueISO, "2026-06-14");
  assert.equal(r.periodLabel, "June 2026");
});

test("daysBetweenISO is timezone-safe and signed", () => {
  assert.equal(daysBetweenISO("2026-06-14", "2026-06-15"), 1);
  assert.equal(daysBetweenISO("2026-06-14", "2026-06-14"), 0);
  assert.equal(daysBetweenISO("2026-06-14", "2026-06-01"), -13);
  assert.equal(daysBetweenISO("2026-06-14", "2026-07-14"), 30);
});

test("todayISO returns local YYYY-MM-DD", () => {
  assert.equal(todayISO(new Date(2026, 5, 14)), "2026-06-14");
  assert.match(todayISO(), /^\d{4}-\d{2}-\d{2}$/);
});
