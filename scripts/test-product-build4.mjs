import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Static guardrails for Build-4 — Financial Records + Reporting OS. The actual
// money MATH is verified executably in scripts/test-money.mjs; this file pins
// the product wiring: every finance surface reads the confirmed-only basis via
// money.ts, the report-detail route is permission-gated, reject self-heals, the
// per-object report exists, the 00104 migration is correct, and report views
// never trigger a send/receipt.

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const present = (rel) => fs.existsSync(path.join(root, rel));

const MONEY = "src/lib/money.ts";
const DASH_HOOK = "src/lib/hooks/use-supabase-query.ts";
const FINANCES = "src/app/[locale]/(dashboard)/dashboard/finances/page.tsx";
const HISTORY = "src/app/[locale]/(dashboard)/dashboard/contributions/history/page.tsx";
const MEMBER_DETAIL = "src/app/[locale]/(dashboard)/dashboard/members/[id]/page.tsx";
const REPORTS_DETAIL = "src/app/[locale]/(dashboard)/dashboard/reports/[reportId]/page.tsx";
const MY_PAYMENTS = "src/app/[locale]/(dashboard)/dashboard/my-payments/page.tsx";
const OBJECT_REPORT = "src/app/[locale]/(dashboard)/dashboard/contributions/[typeId]/report/page.tsx";
const MIGRATION = "supabase/migrations/00104_payment_confirmation_accounting.sql";

const money = read(MONEY);
const dashHook = read(DASH_HOOK);
const finances = read(FINANCES);
const history = read(HISTORY);
const memberDetail = read(MEMBER_DETAIL);
const reportsDetail = read(REPORTS_DETAIL);
const myPayments = read(MY_PAYMENTS);
const objectReport = read(OBJECT_REPORT);
const migration = read(MIGRATION);
const en = JSON.parse(read("messages/en.json"));
const fr = JSON.parse(read("messages/fr.json"));

// ── 1. money.ts is the single engine, confirmed-only ────────────────────────

test("money.ts encodes the confirmed-only basis", () => {
  assert.ok(present(MONEY), "money.ts exists");
  assert.ok(/function isConfirmedPayment/.test(money), "exposes isConfirmedPayment");
  assert.ok(/'pending_confirmation'/.test(money) && /'rejected'/.test(money), "knows the non-collected statuses");
  assert.ok(/function buildObjectReport/.test(money), "exposes buildObjectReport");
  assert.ok(/function computeMoneyFigures/.test(money), "exposes computeMoneyFigures");
  // per-obligation paid derives from confirmed payments, NOT amount_paid
  assert.ok(/confirmedPaidByObligation/.test(money), "derives paid from confirmed payments");
});

// ── 2. Consumers read through money.ts ──────────────────────────────────────

test("useDashboardStats uses the confirmed-only engine, not amount_paid sums", () => {
  assert.ok(dashHook.includes("computeMoneyFigures"), "uses computeMoneyFigures");
  // it must no longer reduce obligations.amount_paid for totalPaid
  assert.ok(
    !/reduce\(\(sum, o\) => sum \+ Number\(o\.amount_paid\)\)/.test(dashHook),
    "no longer sums the polluted amount_paid column",
  );
});

test("finances dashboard computes per-type collected from confirmed payments by type/member", () => {
  // per-type collected by contribution_type_id; per-member outstanding by membership_id
  // (NOT obligation_id, which most dues payments lack).
  assert.ok(finances.includes("confirmedPaidByType"), "per-type collected by contribution_type_id");
  assert.ok(finances.includes("confirmedPaidByMember"), "per-member outstanding by membership_id");
  assert.ok(finances.includes("isConfirmedPayment"), "sync filters to confirmed");
});

test("members/[id] financial summary uses confirmed basis", () => {
  assert.ok(
    memberDetail.includes("isConfirmedPayment") || memberDetail.includes("computeMoneyFigures"),
    "member statement totals are confirmed-only",
  );
});

test("my-payments derives remaining from the member's confirmed total (handles obligation-less payments)", () => {
  assert.ok(
    myPayments.includes("allocateConfirmedToObligations") && myPayments.includes("confirmedPaidByMember"),
    "remaining derives from the member's confirmed total, allocated across obligations",
  );
});

// ── 3. Reject self-heals the obligation (the never-reversing trigger bug) ────

test("payment reject recomputes obligation amount_paid from confirmed", () => {
  assert.ok(history.includes("handleRejectPayment"), "reject handler present");
  assert.ok(history.includes("isConfirmedPayment"), "reject recomputes from confirmed payments");
  // reject must write amount_paid (the self-heal), not just flip status
  const rejectIdx = history.indexOf("handleRejectPayment");
  const after = history.slice(rejectIdx, rejectIdx + 1600);
  assert.ok(/amount_paid/.test(after), "reject updates the obligation's amount_paid");
});

test("history CSV export includes a Status column (pending never silently collected)", () => {
  assert.ok(history.includes("csvStatus"), "CSV adds a Status column");
  assert.ok(history.includes("exportCSV"), "uses the shared escaping exportCSV helper");
});

// ── 4. Report-detail route is permission-gated (was an open-export hole) ─────

test("reports/[reportId] detail route is permission gated", () => {
  assert.ok(reportsDetail.includes("RequirePermission"), "wraps content in RequirePermission");
  assert.ok(
    /anyOf=\{\["reports\.view"/.test(reportsDetail),
    "gates on reports.view (matches the list page)",
  );
});

test("reports/[reportId] financial reports use the confirmed engine", () => {
  assert.ok(
    reportsDetail.includes("computeMoneyFigures") || reportsDetail.includes("isConfirmedPayment"),
    "financial reports compute collected confirmed-only",
  );
});

// ── 5. Per-object (Baby Shower) report exists + gated + send-safe ───────────

test("per-object contribution report exists, gated, and uses buildObjectReport", () => {
  assert.ok(present(OBJECT_REPORT), "per-object report route exists");
  assert.ok(objectReport.includes("buildObjectReport"), "uses the money engine");
  assert.ok(objectReport.includes("RequirePermission"), "permission gated");
  assert.ok(objectReport.includes("exportCSV") && objectReport.includes("window.print"), "print + CSV export");
});

// ── 6. No-send guarantee on report/finance/statement views ──────────────────

test("report + finance + statement views never import a send/receipt path", () => {
  const sendMarkers = /payment-receipt-producer|requestWelcomeWhatsApp|requestMemberInvitationWhatsApp|notify-money-path|receipt-notifications|produce[A-Za-z]*Notification/;
  for (const [name, src] of [
    ["object-report", objectReport],
    ["reports-detail", reportsDetail],
    ["finances", finances],
    ["my-payments", myPayments],
  ]) {
    assert.ok(!sendMarkers.test(src), `${name} must not import a send/receipt path`);
  }
});

// ── 7. Migration 00104 — recompute trigger + backfill, confirmed-gated ──────

test("migration 00104 replaces the trigger with a confirmed recompute + backfill", () => {
  assert.ok(present(MIGRATION), "migration exists");
  assert.ok(/recalc_obligation_amount_paid/.test(migration), "adds a recompute helper");
  assert.ok(
    /status NOT IN \('pending_confirmation', 'rejected'\)/.test(migration),
    "sums confirmed payments only",
  );
  assert.ok(/DROP TRIGGER IF EXISTS on_payment_recorded/.test(migration), "drops the AFTER-INSERT-only trigger");
  assert.ok(/CREATE TRIGGER on_payment_changed/.test(migration), "creates the INSERT/UPDATE/DELETE trigger");
  // one-time backfill heals historical pollution
  assert.ok(/UPDATE contribution_obligations/.test(migration) && /confirmed_sum/.test(migration), "backfills amount_paid");
  // preserves waived
  assert.ok(/'waived'/.test(migration), "never overrides a waiver");
});

// ── 8. i18n parity for Build-4 keys ─────────────────────────────────────────

test("Build-4 report + statement keys present in both locales", () => {
  const reportKeys = [
    "viewReport", "totalCollected", "totalOutstanding", "totalPending", "totalWaived",
    "status_contributed", "status_pending", "status_not_contributed", "status_waived",
    "pendingNote", "basisNote",
  ];
  for (const k of reportKeys) {
    assert.ok(en.contributions.report[k], `en contributions.report.${k}`);
    assert.ok(fr.contributions.report[k], `fr contributions.report.${k}`);
  }
  for (const k of ["objectSubtotal", "objectRemaining", "waivedTitle", "excused"]) {
    assert.ok(en.myPayments[k] && fr.myPayments[k], `myPayments.${k} in both locales`);
  }
  assert.ok(en.contributions.csvStatus && fr.contributions.csvStatus, "contributions.csvStatus");
  assert.ok(en.reports.pendingConfirmationTotal && fr.reports.pendingConfirmationTotal, "reports.pendingConfirmationTotal");
});
