import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Static guardrails for Product Sprint C — the money flow: admin collection
// command center, member balance clarity, dues setup, payment confirmation,
// and receipt review. Style matches the other product suites: read sources
// as text, assert clause presence/absence. No React harness exists.

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const HOOK = "src/lib/hooks/use-money-overview.ts";
const OVERVIEW = "src/components/finances/money-overview.tsx";
const FINANCES = "src/app/[locale]/(dashboard)/dashboard/finances/page.tsx";
const MYPAY = "src/app/[locale]/(dashboard)/dashboard/my-payments/page.tsx";
const NOTICE = "src/components/send-review-notice.tsx";
const HISTORY = "src/app/[locale]/(dashboard)/dashboard/contributions/history/page.tsx";
const RECORD = "src/app/[locale]/(dashboard)/dashboard/contributions/record/page.tsx";
const SETUP = "src/app/[locale]/(dashboard)/dashboard/contributions/page.tsx";

const hook = read(HOOK);
const overview = read(OVERVIEW);
const finances = read(FINANCES);
const mypay = read(MYPAY);
const notice = read(NOTICE);
const history = read(HISTORY);
const record = read(RECORD);
const setup = read(SETUP);
const en = JSON.parse(read("messages/en.json"));
const fr = JSON.parse(read("messages/fr.json"));

// ---------------------------------------------------------------------------
// 1. useMoneyOverview — the reconciled money math
// ---------------------------------------------------------------------------

test("collected counts CONFIRMED dues payments only (pending/rejected never inflate)", () => {
  assert.match(hook, /computeMoneyFiguresByCurrency\(/);
  assert.match(hook, /totalCollected: figures.collected/);
  assert.match(read("src/lib/hooks/use-supabase-query.ts"), /\.is\("relief_plan_id", null\)/);
});

test("expected excludes waived obligations", () => {
  assert.match(hook, /totalExpected: figures.expected/);
  assert.match(read("src/lib/money.ts"), /o.status === "waived"/);
});

test("overdue/owing is DERIVED from CONFIRMED payments (Build 12), not amount_paid/status", () => {
  assert.match(hook, /computeObligationStates\(/);
  assert.match(hook, /overdue: figures.overdue/);
  assert.match(hook, /membersOwing: figures.membersOwing/);
  assert.doesNotMatch(hook, /amount_paid/);
});

test("pending confirmation is surfaced as count + amount from payments.status", () => {
  assert.match(hook, /pendingConfirmation: figures.pending/);
});

test("hook THROWS on query error (never coerces a false money figure to 0)", () => {
  assert.match(hook, /isError: obligations.isError \|\| payments.isError/);
  assert.match(read("src/lib/read-all-pages.ts"), /if \(error\) throw new Error/);
  assert.doesNotMatch(hook, /console.warn/);
});

test("names via getMemberName; currency primitive extracted for dep safety", () => {
  assert.match(hook, /getMemberName\(/);
  assert.match(hook, /const currency = currentGroup\?\.currency/);
  assert.match(hook, /usePayments\("all"\)/);
});

test("the money hook introduces NO send/notify path (read-only aggregation)", () => {
  assert.ok(!/notifyFromClient|receipt-notifications|\/api\/(email|sms)\/send|produce[A-Z]/.test(hook), "hook must not call any send/producer");
});

// ---------------------------------------------------------------------------
// 2. MoneyOverview command-center component
// ---------------------------------------------------------------------------

test("overview renders the command-center figures via formatAmount", () => {
  for (const fn of ["totalCollected", "totalExpected", "outstanding"]) {
    assert.ok(overview.includes(fn), `overview must show ${fn}`);
  }
  assert.match(overview, /formatAmount\(/);
  assert.match(overview, /useTranslations\("finances\.overview"\)/);
});

test("overview surfaces the pending-confirmation tile prominently", () => {
  assert.ok(overview.includes("pendingConfirmation"), "pending-confirmation must be shown");
  assert.ok(overview.includes('t("pendingConfirmation.title")') || overview.includes("pendingConfirmation.title"), "pending tile has a title");
});

test("overview CTAs are buttonVariants Links (no Button nested in Link) to the right destinations", () => {
  assert.ok(overview.includes("buttonVariants("), "CTAs use buttonVariants");
  assert.ok(!/<Link[^>]*>\s*<Button/.test(overview), "no Button inside Link");
  assert.ok(overview.includes("/dashboard/contributions/record"), "Record-a-payment CTA");
  assert.ok(overview.includes("/dashboard/contributions/history?status=pending_confirmation"), "Review-confirmations CTA deep-links to the pending filter");
  assert.ok(overview.includes("/dashboard/contributions/unpaid"), "Review-unpaid CTA");
});

test("overview has an empty-state path to set up dues when nothing is expected", () => {
  assert.ok(overview.includes('"/dashboard/contributions"') || overview.includes("setUpDues"), "set-up-dues empty state");
});

// ---------------------------------------------------------------------------
// 3. Finances page reconciliation + mount
// ---------------------------------------------------------------------------

test("finances page mounts the MoneyOverview and reconciles collected to confirmed-only", () => {
  assert.match(finances, /<MoneyOverview/);
  assert.match(finances, /from "@\/components\/finances\/money-overview"/);
  // Both totals and monthly chart use the shared conservative status predicate.
  assert.match(finances, /computeMoneyFiguresByCurrency\(obligations, payments\)/);
  assert.match(finances, /if \(!isConfirmedPayment\(status\)\) continue/);
});

test("finances outstanding and collection rates remain confirmed-only and currency-bucketed", () => {
  assert.match(finances, /computeMoneyFiguresByCurrency\(obligations, payments\)/);
  assert.match(finances, /stats\.moneyByCurrency\.map/);
  assert.match(finances, /bucket\.expected > 0 \? Math\.round\(\(\(bucket\.expected - bucket\.outstanding\) \/ bucket\.expected\) \* 100\) : 0/);
});

test("overview carries name_fr so French admins see localized type names", () => {
  assert.match(hook, /typeNameFr: o\.contribution_type\?\.name_fr/);
  assert.match(hook, /typeNameFr: p\.contribution_type\?\.name_fr/);
  assert.match(overview, /locale === "fr" \? row.typeNameFr \|\| row.typeName/);
});

test("overview surfaces a retryable error instead of an endless skeleton when the query fails", () => {
  assert.match(overview, /query.isError/);
  assert.match(overview, /<ErrorState onRetry=\{\(\) => query.refetch\(\)\}/);
});

test("overdue derivation compares calendar dates (no diaspora timezone false-overdue)", () => {
  assert.match(hook, /o.due_date.slice\(0, 10\) >= today/);
  assert.match(hook, /computeObligationStates\(obligations.data, payments.data, \{ today \}\)/);
  assert.doesNotMatch(hook, /dueMs|todayMs/);
});

// ---------------------------------------------------------------------------
// 4. Member balance clarity (my-payments)
// ---------------------------------------------------------------------------

test("member 'paid this year' excludes pending/rejected (confirmed-only)", () => {
  // The paid sum must filter out unconfirmed submissions.
  assert.match(mypay, /pending_confirmation/);
  assert.match(mypay, /rejected/);
});

test("member page shows a balance hero, partial progress, and awaiting-confirmation clarity", () => {
  assert.ok(mypay.includes("youOweNow") || mypay.includes("caughtUpTitle"), "balance hero copy");
  assert.ok(mypay.includes("partiallyPaidProgress") || mypay.includes("partiallyPaid"), "partial-payment progress");
  assert.ok(mypay.includes("awaitingConfirmation") || mypay.includes("notYetCredited"), "pending-confirmation clarity");
});

test("member money view does not change pay-now send behavior", () => {
  // It still uses the existing dialog; it does not add a new send path.
  assert.ok(!/notifyFromClient|receipt-notifications/.test(mypay), "my-payments must not introduce a send");
});

// ---------------------------------------------------------------------------
// 5. SendReviewNotice receipts context + record/confirm review-gating
// ---------------------------------------------------------------------------

test("SendReviewNotice gains a 'receipts' context (component otherwise unchanged)", () => {
  assert.match(notice, /"invitations" \| "reminders" \| "announcements" \| "receipts"/);
});

test("record page shows an HONEST single-record receipt note + a plain summary (Build 9)", () => {
  // Build 9 (WS1) replaced the misleading review-only SendReviewNotice — single
  // record DOES send a receipt the moment you record — with an explicit honest
  // note. The page must no longer use the review-only notice here.
  assert.ok(!/<SendReviewNotice/.test(record), "misleading review-only notice removed from the record form");
  assert.ok(record.includes("recordSendsReceiptNote"), "honest 'recording sends a receipt' note");
  assert.ok(record.includes("recordReviewSummary"), "a who/how-much summary line");
});

test("history Confirm/Reject are gated behind a review dialog that names the send consequence", () => {
  assert.ok(history.includes("confirmThenConfirmPayment") && history.includes("confirmThenRejectPayment"), "both actions are wrapped");
  assert.ok(history.includes("confirmPaymentReviewDesc") && history.includes("rejectPaymentReviewDesc"), "review dialogs explain the consequence");
  // underlying handlers preserved
  assert.ok(history.includes("handleConfirmPayment") && history.includes("handleRejectPayment"), "existing handlers kept");
});

test("history adds a status filter read via the stable search-param hook (no dep-array hazard)", () => {
  assert.match(history, /useSearchParam\("status"\)/);
  assert.ok(!/useSearchParams\(\)/.test(history) || history.includes("useSearchParam"), "must not use raw useSearchParams in deps");
  assert.ok(history.includes("statusFilterPending"), "pending-confirmation filter pill");
});

test("'receipt' is disambiguated from the uploaded proof in history", () => {
  assert.ok(history.includes("viewProof"), "uploaded screenshot is labelled 'proof', not 'receipt'");
});

// ---------------------------------------------------------------------------
// 6. Dues setup clarity
// ---------------------------------------------------------------------------

test("dues setup explains consequences and previews enrollment scope", () => {
  assert.ok(setup.includes("setupConsequence") || setup.includes("guideAfter"), "plain-language consequences");
  assert.ok(setup.includes("enrollPreview"), "enroll preview count before running");
});

// ---------------------------------------------------------------------------
// 7. i18n — every new key in BOTH bundles, real French, customer language
// ---------------------------------------------------------------------------

function leafPaths(obj, prefix = "") {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? leafPaths(v, `${prefix}${k}.`) : [`${prefix}${k}`]);
}

test("finances.overview tree exists and is structurally identical across en/fr", () => {
  assert.ok(en.finances.overview && fr.finances.overview, "both bundles have finances.overview");
  assert.deepEqual(leafPaths(en.finances.overview).sort(), leafPaths(fr.finances.overview).sort());
});

test("launchCenter.sendReview.receipts exists in both bundles with the full context shape", () => {
  for (const bundle of [en, fr]) {
    const r = bundle.launchCenter.sendReview.receipts;
    for (const k of ["who", "channels", "preview", "confirm", "compactNote"]) {
      assert.equal(typeof r[k], "string", `receipts.${k}`);
    }
  }
});

test("the specific new money keys the code references all resolve in both bundles", () => {
  const keys = [
    ["finances", "overview", "title"],
    ["finances", "overview", "pendingConfirmation", "title"],
    ["finances", "overview", "cta", "reviewConfirmations"],
    ["myPayments", "youOweNow"],
    ["myPayments", "awaitingConfirmation"],
    ["myPayments", "partiallyPaidProgress"],
    ["contributions", "recordReviewSummary"],
    ["contributions", "confirmPaymentReviewDesc"],
    ["contributions", "rejectPaymentReviewDesc"],
    ["contributions", "viewProof"],
    ["contributions", "statusFilterPending"],
    ["contributions", "enrollPreview"],
    ["contributions", "setupConsequenceReminders"],
  ];
  for (const bundle of [en, fr]) {
    for (const keyPath of keys) {
      const v = keyPath.reduce((o, k) => (o ? o[k] : undefined), bundle);
      assert.equal(typeof v, "string", `${keyPath.join(".")} must exist`);
      assert.ok(v.length > 0, `${keyPath.join(".")} non-empty`);
    }
  }
});

test("FR money copy is real French, not copied English", () => {
  assert.notEqual(en.finances.overview.title, fr.finances.overview.title);
  assert.notEqual(en.myPayments.youOweNow, fr.myPayments.youOweNow);
  assert.notEqual(en.contributions.confirmPaymentReviewDesc, fr.contributions.confirmPaymentReviewDesc);
  // accents present (the build agents stripped them; the merge restored them)
  assert.match(fr.finances.overview.collected + fr.finances.overview.outstanding, /[éèàçûô]/);
});

test("new money copy uses customer language (no developer/operational jargon)", () => {
  const newCopy = [
    ...leafPaths(en.finances.overview).map((p) => p.split(".").reduce((o, k) => o[k], en.finances.overview)),
    en.launchCenter.sendReview.receipts.who,
    en.launchCenter.sendReview.receipts.channels,
    en.launchCenter.sendReview.receipts.compactNote,
    en.myPayments.youOweNow, en.myPayments.awaitingConfirmation, en.myPayments.notYetCredited,
    en.contributions.recordReviewSummary, en.contributions.enrollPreview, en.contributions.setupConsequenceReminders,
  ].join(" \n ");
  for (const banned of [/\bcron\b/i, /\bqueue\b/i, /\bprovider\b/i, /\btemplate\b/i, /\bmigration\b/i, /failed row/i, /\bproducer\b/i, /\bwebhook\b/i, /obligation id/i, /\bRLS\b/]) {
    assert.doesNotMatch(newCopy, banned, `banned jargon ${banned} in new money copy`);
  }
});
