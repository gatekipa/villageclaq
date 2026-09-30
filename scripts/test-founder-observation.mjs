import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/lib/money.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { computeObligationStates, computeDuesStatusTotals, buildObjectReport } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);

const old = { id: "old", membership_id: "m", contribution_type_id: "dues", amount: 10, status: "pending", due_date: "2025-12-31" };
const current = { ...old, id: "current", due_date: "2026-09-30" };
const payment = (id, amount, obligation_id) => ({ id, membership_id: "m", contribution_type_id: "dues", amount, status: "confirmed", obligation_id, recorded_at: "2026-09-30T12:00:00Z" });

test("an explicit September partial and separate settlement do not silently cover December", () => {
  const first = computeObligationStates([old, current], [payment("p4", 4, "current")], { today: "2026-09-30" });
  assert.equal(first.get("old").remaining, 10);
  assert.equal(first.get("current").confirmedPaid, 4);
  assert.equal(first.get("current").remaining, 6);
  const settled = computeObligationStates([old, current], [payment("p4", 4, "current"), payment("p6", 6, "current")], { today: "2026-09-30" });
  assert.equal(settled.get("current").remaining, 0);
  assert.equal(settled.get("old").remaining, 10);
  const dues = computeDuesStatusTotals([old, current], [payment("p4", 4, "current"), payment("p6", 6, "current")], "2026-09-30");
  assert.equal(dues.outstanding, 10);
  assert.equal(dues.overdue.amount, 10);
});

test("unlinked payment keeps the approved oldest-due-first rule", () => {
  const state = computeObligationStates([old, current], [payment("legacy", 4, null)], { today: "2026-09-30" });
  assert.equal(state.get("old").remaining, 6);
  assert.equal(state.get("current").remaining, 10);
});

test("due today is outstanding but not overdue; overdue starts next group-calendar day", () => {
  const today = computeDuesStatusTotals([current], [], "2026-09-30");
  assert.equal(today.outstanding, 10);
  assert.equal(today.dueToday, 10);
  assert.equal(today.overdue.amount, 0);
  const tomorrow = computeDuesStatusTotals([current], [], "2026-10-01");
  assert.equal(tomorrow.overdue.amount, 10);
});

test("report overdue total counts only the uncovered past period", () => {
  const report = buildObjectReport([old, current], [payment("p4", 4, "current")], { today: "2026-09-30" });
  assert.equal(report.totals.totalOutstanding, 16);
  assert.equal(report.totals.totalOverdue, 10);
});


test("a linked, fully paid type report has no false overdue balance", () => {
  const report = buildObjectReport([current], [payment("p4", 4, "current"), payment("p6", 6, "current")], { today: "2026-10-01" });
  assert.equal(report.totals.totalOutstanding, 0);
  assert.equal(report.totals.totalOverdue, 0);
  assert.equal(report.rows[0].status, "contributed");
});

test("affected report routes await complete dues and retain the type link", () => {
  const reports = fs.readFileSync(new URL("../src/app/[locale]/(dashboard)/dashboard/reports/[reportId]/page.tsx", import.meta.url), "utf8");
  const typeReport = fs.readFileSync(new URL("../src/app/[locale]/(dashboard)/dashboard/contributions/[typeId]/report/page.tsx", import.meta.url), "utf8");
  assert.match(reports, /duesPaymentsLoading/);
  assert.match(reports, /duesPaymentsError/);
  assert.match(typeReport, /membership_id, contribution_type_id, amount/);
  assert.match(typeReport, /fetchAllRows\(\(from, to\) => supabase/g);
});
