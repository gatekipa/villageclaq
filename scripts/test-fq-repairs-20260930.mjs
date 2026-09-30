import assert from "node:assert/strict";
import test from "node:test";
import { checkExactAmount } from "../src/lib/exact-amount.ts";
import { CURRENCIES } from "../src/lib/currencies.ts";
import { computeDuesStatusTotals } from "../src/lib/money.ts";
import { groupTodayKey } from "../src/lib/payment-reminder-eligibility.ts";
import { computeObligationDueDate } from "../src/lib/contribution-schedule.ts";
import { fetchAllRows } from "../src/lib/fetch-all-rows.ts";

// FQ-09/FQ-10/FQ-11 repair tests (Node >= 22.6 strips TS types on import).
// Independent anchors:
//  - Ledger precision: live financial_core.currency_scale on the isolated
//    candidate (2026-09-30) — 0 for XAF/XOF/TZS/UGX/RWF, 2 for the other 13.
//  - Group calendar and due semantics: approved FQ-08 reminder rules
//    (payment-reminder-eligibility: group timezone, default UTC; before due /
//    due today / after due).
//  - Confirmed-only outstanding: Build-12 computeObligationStates contract.
//  - Due-day schedule: dates produced by the repaired live trigger
//    generate_obligations_for_type() in rolled-back probes (2026-09-30).
//  - Row paging: PostgREST returns at most the API "Max rows" setting per
//    request (Supabase default 1000) and truncates silently; Content-Range /
//    count=exact reports the full total.

const LEDGER_SCALE = {
  XAF: 0, XOF: 0, TZS: 0, UGX: 0, RWF: 0,
  NGN: 2, GHS: 2, KES: 2, ZAR: 2, ETB: 2, CDF: 2,
  USD: 2, EUR: 2, GBP: 2, CAD: 2, CHF: 2, AUD: 2, AED: 2,
};

test("offered currencies match the ledger's precision table exactly", () => {
  const offered = Object.fromEntries(CURRENCIES.map((c) => [c.code, c.decimals]));
  assert.deepEqual(offered, LEDGER_SCALE);
});

test("FQ-10: zero-decimal amounts accept trailing zeros and reject real fractions", () => {
  assert.equal(checkExactAmount("5000", 0), "OK");
  assert.equal(checkExactAmount("5000.00", 0), "OK");
  assert.equal(checkExactAmount(" 25000 ", 0), "OK");
  assert.equal(checkExactAmount("5000.5", 0), "AMOUNT_PRECISION");
  assert.equal(checkExactAmount("5000.05", 0), "AMOUNT_PRECISION");
});

test("FQ-10: two-decimal amounts keep cents and reject a third significant digit", () => {
  assert.equal(checkExactAmount("12.30", 2), "OK");
  assert.equal(checkExactAmount("12.3", 2), "OK");
  assert.equal(checkExactAmount("0.1", 2), "OK");
  assert.equal(checkExactAmount("12.340", 2), "OK");
  assert.equal(checkExactAmount("12.345", 2), "AMOUNT_PRECISION");
});

test("FQ-10: non-positive or malformed amounts are refused before any request", () => {
  for (const bad of ["0", "0.00", "", "-5", "5e3", "1,000", "abc", "12."]) {
    assert.equal(checkExactAmount(bad, 2), "AMOUNT_NOT_POSITIVE", bad);
  }
});

test("FQ-11: group today follows the reminder timezone, defaulting to UTC", () => {
  const lateUtc = new Date("2026-09-30T23:30:00Z");
  assert.equal(groupTodayKey(null, lateUtc), "2026-09-30");
  assert.equal(groupTodayKey({ payment_reminders: { timezone: "Africa/Douala" } }, lateUtc), "2026-10-01");
  assert.equal(groupTodayKey({ payment_reminders: { timezone: "America/New_York" } }, lateUtc), "2026-09-30");
  assert.equal(groupTodayKey({ payment_reminders: { timezone: "Not/AZone" } }, lateUtc), "2026-09-30");
});

const TYPE = "t-dues";
const obligation = (id, member, amount, due, status = "pending") => ({
  id, membership_id: member, contribution_type_id: TYPE, amount, due_date: due, status,
});
const confirmed = (id, member, amount, recorded) => ({
  id, membership_id: member, contribution_type_id: TYPE, amount, status: "confirmed", recorded_at: recorded,
});

test("FQ-11: future, due-today, past-due, partial, paid and waived obligations", () => {
  const today = "2026-09-30";
  const obligations = [
    obligation("future", "m-future", 25000, "2026-12-15"),
    obligation("today", "m-today", 5000, "2026-09-30"),
    obligation("late", "m-late", 5000, "2026-09-05"),
    obligation("partial", "m-partial", 5000, "2026-09-05"),
    obligation("paid", "m-paid", 5000, "2026-09-05"),
    obligation("waived", "m-waived", 5000, "2026-09-05", "waived"),
  ];
  const payments = [
    confirmed("p1", "m-partial", 2000, "2026-09-10T10:00:00Z"),
    confirmed("p2", "m-paid", 5000, "2026-09-10T10:00:00Z"),
    // Pending submissions never reduce what is owed (Build-12 confirmed-only).
    { id: "p3", membership_id: "m-late", contribution_type_id: TYPE, amount: 5000, status: "pending_confirmation" },
  ];
  const totals = computeDuesStatusTotals(obligations, payments, today);
  assert.equal(totals.outstanding, 25000 + 5000 + 5000 + 3000);
  assert.deepEqual(totals.overdue, { amount: 5000 + 3000, memberCount: 2 });
  assert.equal(totals.dueToday, 5000);
  assert.equal(totals.membersOwing, 4);
});

test("FQ-11: nothing is overdue when every open obligation is due today or later", () => {
  // The demo-group shape that FQ-11 mislabelled: 14 members, monthly dues due
  // today and a future levy, nothing paid.
  const obligations = [];
  for (let i = 0; i < 14; i += 1) {
    obligations.push({ ...obligation(`m${i}`, `member-${i}`, 5000, "2026-09-30"), contribution_type_id: "monthly" });
    obligations.push({ ...obligation(`l${i}`, `member-${i}`, 25000, "2026-12-15"), contribution_type_id: "levy" });
  }
  const totals = computeDuesStatusTotals(obligations, [], "2026-09-30");
  assert.equal(totals.outstanding, 420000);
  assert.deepEqual(totals.overdue, { amount: 0, memberCount: 0 });
  assert.equal(totals.dueToday, 70000);
});

test("FQ-11: the same obligation is due today in UTC but overdue in Douala after local midnight", () => {
  const obligations = [obligation("o", "m", 5000, "2026-09-30")];
  const at = new Date("2026-09-30T23:30:00Z");
  const utc = computeDuesStatusTotals(obligations, [], groupTodayKey(null, at));
  const douala = computeDuesStatusTotals(obligations, [], groupTodayKey({ payment_reminders: { timezone: "Africa/Douala" } }, at));
  assert.deepEqual([utc.overdue.amount, utc.dueToday], [0, 5000]);
  assert.deepEqual([douala.overdue.amount, douala.dueToday], [5000, 0]);
});

test("FQ-09: client schedule engine matches the repaired trigger's due dates", () => {
  const cases = [
    ["monthly", 15, "2026-10-01", "2026-10-15"],
    ["monthly", 31, "2026-11-01", "2026-11-28"],
    ["monthly", 30, "2027-02-01", "2027-02-28"],
    ["monthly", 29, "2028-02-01", "2028-02-28"],
    ["monthly", 28, "2028-02-10", "2028-02-28"],
    ["quarterly", 31, "2026-10-10", "2026-10-28"],
    ["annual", 5, "2027-01-20", "2027-01-05"],
    ["one_time", 20, "2026-12-01", "2026-12-20"],
  ];
  for (const [frequency, dueDay, startDate, expected] of cases) {
    const r = computeObligationDueDate({ frequency, dueDay, startDate, baseDate: "2026-09-30" });
    assert.equal(r.dueISO, expected, `${frequency} day ${dueDay} from ${startDate}`);
  }
  // No start date: the base (creation) month, no forward rollover.
  assert.equal(computeObligationDueDate({ frequency: "monthly", dueDay: 10, baseDate: "2026-09-30" }).dueISO, "2026-09-10");
});

// A fake PostgREST endpoint: `cap` rows per response at most, total in `count`.
const pagedSource = (rows, cap, { withCount = true, failAtFrom = -1 } = {}) => {
  const calls = [];
  const fetchPage = (from, to) => {
    calls.push([from, to]);
    if (from === failAtFrom) return Promise.resolve({ data: null, error: { message: "boom" }, count: null });
    const end = Math.min(to + 1, from + cap, rows.length);
    return Promise.resolve({ data: rows.slice(from, end), error: null, count: withCount ? rows.length : null });
  };
  return { fetchPage, calls };
};
const ids = (n) => Array.from({ length: n }, (_, i) => ({ id: i }));

test("FQ-11: money reads page past the 1000-row cap so both screens see every row", async () => {
  const source = ids(2345);
  const { fetchPage, calls } = pagedSource(source, 1000);
  const { data, error } = await fetchAllRows(fetchPage);
  assert.equal(error, null);
  assert.deepEqual(data.map((r) => r.id), source.map((r) => r.id));
  assert.deepEqual(calls, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test("FQ-11: paging stays complete when the server caps pages below the page size", async () => {
  const source = ids(1234);
  const { fetchPage, calls } = pagedSource(source, 500);
  const { data } = await fetchAllRows(fetchPage);
  assert.equal(data.length, 1234);
  assert.deepEqual(calls.map(([from]) => from), [0, 500, 1000]);
});

test("FQ-11: small groups need one request; a failed page is reported, not treated as complete", async () => {
  const small = pagedSource(ids(7), 1000);
  assert.equal((await fetchAllRows(small.fetchPage)).data.length, 7);
  assert.equal(small.calls.length, 1);
  const noCount = pagedSource(ids(7), 1000, { withCount: false });
  assert.equal((await fetchAllRows(noCount.fetchPage)).data.length, 7);
  const failing = pagedSource(ids(2500), 1000, { failAtFrom: 1000 });
  const result = await fetchAllRows(failing.fetchPage);
  assert.deepEqual(result.error, { message: "boom" });
});
