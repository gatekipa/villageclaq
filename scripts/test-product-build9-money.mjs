import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// ───────────────────────────────────────────────────────────────────────────
// Build 9 — Financial Workflow Clarity + Contribution Setup Polish. Static
// guardrails pinning: one clear record action + honest single-record receipt
// copy; the P0 bulk-receipt guard intact; standing impact wired through the
// EXISTING per-type exclusion list (no new schema); human due-date preview; and
// confirmed-only accounting preserved through the perf changes.
// ───────────────────────────────────────────────────────────────────────────

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const RECORD = "src/app/[locale]/(dashboard)/dashboard/contributions/record/page.tsx";
const TYPES = "src/app/[locale]/(dashboard)/dashboard/contributions/page.tsx";
const HOOKS = "src/lib/hooks/use-supabase-query.ts";
const STANDING_EXCL = "src/lib/standing-exclusion.ts";
const DUE = "src/lib/due-date-preview.ts";

const record = read(RECORD);
const types = read(TYPES);
const hooks = read(HOOKS);
const en = JSON.parse(read("messages/en.json"));
const fr = JSON.parse(read("messages/fr.json"));

// ── WS1: one clear primary record action + clear secondary ──────────────────

test("record page has a clear primary 'Record payment' + secondary 'Record another'", () => {
  assert.ok(/t\("contributions\.recordPayment"\)/.test(record), "primary uses recordPayment");
  assert.ok(/t\("contributions\.recordAnother"\)/.test(record), "secondary uses recordAnother");
  assert.ok(!/t\("contributions\.saveAndNext"\)/.test(record), "old 'Save & Next' label removed from buttons");
  assert.ok(!/t\("contributions\.savePayment"\)/.test(record), "old 'Save Payment' label removed from buttons");
  // secondary keeps type+method (handleSave(true)) + an explanatory hint
  assert.ok(/onClick=\{\(\) => handleSave\(true\)\}[\s\S]{0,200}recordAnother/.test(record), "secondary calls handleSave(true)");
  assert.ok(/recordAnotherHint/.test(record), "secondary has the keep-type-and-method hint");
});

// ── WS1: honest single-record receipt copy (single-record DOES send) ────────

test("single-record honestly discloses that recording sends a receipt", () => {
  assert.ok(/recordSendsReceiptNote/.test(record), "form shows recordSendsReceiptNote");
  assert.ok(/receiptSentNote/.test(record), "success toast shows receiptSentNote");
  // the misleading review-only 'nothing sends' notice is gone from this form
  assert.ok(!/SendReviewNotice/.test(record), "misleading SendReviewNotice removed from record form");
});

// ── P0 bulk-receipt guard remains intact (untouched) ────────────────────────

test("P0 bulk-record receipt guard is fully intact", () => {
  assert.ok(/const \[bulkSendReceipts, setBulkSendReceipts\] = useState\(false\)/.test(record), "receipts opt-in default OFF");
  assert.ok(/if \(sendReceipts && paidPayments\.length > 0 && groupId\)/.test(record), "receipts gated on opt-in");
  assert.ok(/disabled=\{bulkSubmitting \|\| \(bulkSendReceipts && !bulkReconfirm\)\}/.test(record), "second reconfirm gate");
  assert.ok(!/onClick=\{handleBulkSave\}/.test(record), "no direct bulk-save path");
});

// ── WS3: standing impact wired via the EXISTING exclusion list (no new schema)

test("contribution type form wires standing impact through the existing exclusion list", () => {
  assert.ok(/setContributionStandingExclusion/.test(types), "type form uses the shared standing-exclusion writer");
  assert.ok(/countsTowardStanding/.test(types), "type form has the 'counts toward standing' toggle");
  const excl = read(STANDING_EXCL);
  // the helper manages ONLY excluded_contribution_type_ids on group settings — no new DB column/table
  assert.ok(/excludedContributionTypeIds/.test(excl) && /standing_rules/.test(excl), "helper edits standing_rules.excluded_contribution_type_ids");
  assert.ok(!/contribution_types/.test(excl), "helper does not touch a contribution_types column (no schema change)");
  assert.ok(!/affects_standing|counts_toward_standing/.test(types), "no new per-type DB column referenced");
});

// ── No migration in this build ──────────────────────────────────────────────

test("Build 9 ships NO migration (no 00108)", () => {
  const migs = fs.readdirSync(path.join(root, "supabase/migrations"));
  assert.ok(!migs.some((f) => /^00108/.test(f)), "no 00108 migration file created");
});

// ── WS2: human due-date preview (display-only over due_day) ──────────────────

test("contribution type form shows a human due-date preview over the existing due_day", () => {
  assert.ok(/describeDueDay/.test(types) && /cardDueLabel/.test(types), "type card + form use the human due-date helpers");
  assert.ok(/oneTimeDueDateNote/.test(types), "one-time types get an honest note, not a fabricated date");
  const due = read(DUE);
  // preview mirrors the trigger clamp and never fabricates a date for one-time
  assert.ok(/Math\.min\(28/.test(due), "clamp mirrors LEAST(due_day,28)");
  assert.ok(/frequency === "one_time"[\s\S]{0,40}return \{ kind: "none" \}/.test(due), "one-time -> no fabricated date");
});

// ── WS4: perf without breaking confirmed-only accounting ────────────────────

test("perf staleTime added without dropping the confirmed-only money basis", () => {
  // useDashboardStats still selects status + relief_plan_id (Build-4 basis) AND has staleTime
  assert.ok(/select\("amount, status, obligation_id, relief_plan_id"\)/.test(hooks), "dashboard stats keep status + relief_plan_id");
  assert.ok(/\.is\("relief_plan_id", null\)/.test(hooks), "dues views still exclude relief payments");
  assert.ok(/computeMoneyFigures/.test(hooks), "still uses the confirmed-only money engine");
  // staleTime present on the contribution/payment read hooks
  const stale = (hooks.match(/staleTime: 5 \* 60 \* 1000/g) || []).length;
  assert.ok(stale >= 5, `staleTime added to the contribution/payment hooks (found ${stale})`);
});

// ── i18n parity ─────────────────────────────────────────────────────────────

test("new Build-9 i18n keys exist with EN/FR parity", () => {
  const keys = [
    "recordAnother", "recordAnotherHint", "recordSendsReceiptNote", "receiptSentNote",
    "countsTowardStanding", "countsTowardStandingHint", "dueDayHelp", "oneTimeDueDateNote",
    "dueDateFlexible", "duePreviewMonthly", "duePreviewRecurring", "duePeriod_quarter",
    "duePeriod_year", "cardDueMonthly", "cardDueRecurring",
  ];
  for (const k of keys) {
    assert.ok(en.contributions?.[k], `en.contributions.${k} exists`);
    assert.ok(fr.contributions?.[k], `fr.contributions.${k} exists`);
  }
  // placeholder parity on the interpolated previews
  for (const k of ["duePreviewMonthly"]) {
    for (const p of ["{day}", "{date}", "{days}"]) {
      assert.ok(en.contributions[k].includes(p) && fr.contributions[k].includes(p), `${k} keeps ${p} in both locales`);
    }
  }
});
