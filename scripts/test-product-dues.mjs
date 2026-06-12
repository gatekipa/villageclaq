import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Static guardrails for the dues/payments UX polish lane. The repo has no
// component test harness, so the headline outcomes are pinned by asserting
// the source encodes them: shared sub-nav adoption, fresh-signed receipt
// URLs on the view side, bare object paths on the write side, and the
// translated-copy fixes (no raw/hardcoded error strings in UI).

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const CONTRIB_DIR = "src/app/[locale]/(dashboard)/dashboard/contributions";
const PAGES = {
  types: `${CONTRIB_DIR}/page.tsx`,
  record: `${CONTRIB_DIR}/record/page.tsx`,
  history: `${CONTRIB_DIR}/history/page.tsx`,
  matrix: `${CONTRIB_DIR}/matrix/page.tsx`,
  unpaid: `${CONTRIB_DIR}/unpaid/page.tsx`,
};
const MY_PAYMENTS = "src/app/[locale]/(dashboard)/dashboard/my-payments/page.tsx";
const PAY_NOW = "src/components/payments/pay-now-dialog.tsx";
const SUB_NAV = "src/components/contributions/sub-nav.tsx";

// ─── Shared sub-nav ─────────────────────────────────────────────────────

test("all five contributions pages import and render <ContributionsSubNav/>", () => {
  for (const [name, rel] of Object.entries(PAGES)) {
    const source = read(rel);
    assert.ok(
      source.includes('from "@/components/contributions/sub-nav"'),
      `${name} page must import the shared sub-nav`,
    );
    assert.ok(
      source.includes(`<ContributionsSubNav active="${name}"`),
      `${name} page must render <ContributionsSubNav active="${name}"/>`,
    );
  }
});

test("the old inline pill nav (subNavItems) is gone from contributions pages", () => {
  for (const [name, rel] of Object.entries(PAGES)) {
    assert.ok(
      !read(rel).includes("subNavItems"),
      `${name} page must not keep the duplicated inline subNavItems array`,
    );
  }
});

test("sub-nav pills are filtered by permissions mirroring each page gate", () => {
  const source = read(SUB_NAV);
  assert.ok(source.includes("usePermissions"), "sub-nav must consult usePermissions()");
  // Each pill's visibility must mirror the destination page's RequirePermission gate.
  assert.ok(
    source.includes('hasAnyPermission("contributions.manage", "finances.view")'),
    "types pill mirrors the types page gate",
  );
  assert.ok(
    source.includes('hasAnyPermission("finances.record", "finances.manage")'),
    "record pill mirrors the record page gate",
  );
  assert.ok(
    source.includes('hasAnyPermission("finances.manage", "finances.view")'),
    "history/matrix/unpaid/finances pills mirror their page gates",
  );
  assert.ok(
    /\.filter\(\(item\) => item\.visible\)/.test(source),
    "invisible pills must be filtered out, not rendered disabled",
  );
});

test("record page access-denied state offers a Back-to-Contributions button", () => {
  const source = read(PAGES.record);
  const denied = source.slice(source.indexOf('t("roles.accessDenied")'));
  assert.ok(
    denied.includes('href="/dashboard/contributions"') &&
      denied.includes('t("contributions.backToContributions")'),
    "access-denied screen must link back to /dashboard/contributions",
  );
});

// ─── Receipt links: fresh signed URLs on view, object paths on write ───

test("history + my-payments resolve fresh signed receipt URLs via storage-urls helpers", () => {
  for (const rel of [PAGES.history, MY_PAYMENTS]) {
    const source = read(rel);
    assert.ok(
      source.includes("@/lib/storage-urls"),
      `${rel} must import from @/lib/storage-urls`,
    );
    assert.ok(
      /signedUrlFor|normaliseObjectPath/.test(source),
      `${rel} must call signedUrlFor()/normaliseObjectPath()`,
    );
    assert.ok(
      !source.includes('href={payment.receiptUrl}') &&
        !source.includes("href={item.receipt_url"),
      `${rel} must not link the stored receipt value directly (it may be an expired signed URL)`,
    );
  }
});

test("record page and pay-now dialog store the bare object path, never a signed URL", () => {
  for (const rel of [PAGES.record, PAY_NOW]) {
    const source = read(rel);
    assert.ok(
      !source.includes("createSignedUrl"),
      `${rel} must not sign URLs at write time — viewers sign on demand`,
    );
  }
  // Write side stores the upload path itself.
  assert.ok(read(PAY_NOW).includes("receiptUrl = path"), "pay-now stores the object path");
  assert.ok(read(PAGES.record).includes("setReceiptUrl(path)"), "record page stores the object path");
  // The old "pending:<filename>" sentinel (which leaked into the DB and the
  // ✓-success button label) is gone.
  assert.ok(
    !read(PAGES.record).includes("pending:"),
    "record page must not use the pending: receipt sentinel",
  );
});

test("failed receipt upload on record page surfaces an error, not the success look", () => {
  const source = read(PAGES.record);
  assert.ok(
    source.includes('setReceiptError(t("contributions.receiptUploadFailed"))'),
    "upload failure must set a translated receipt error",
  );
  assert.ok(
    /\{receiptError\}/.test(source),
    "receiptError must be rendered",
  );
  // The ✓ label may only derive from a stored path, never a failure sentinel.
  assert.ok(
    source.includes('{receiptUrl ? "✓ " + t("contributions.receiptUploaded")'),
    "✓ success label must be gated on a real uploaded path",
  );
});

// ─── Translated copy (no raw/hardcoded errors) ──────────────────────────

test("unpaid success banner uses finances.remindersSentSuccess", () => {
  const source = read(PAGES.unpaid);
  assert.ok(
    source.includes('t("finances.remindersSentSuccess"'),
    "must use the existing finances.* key",
  );
  assert.ok(
    !source.includes('t("contributions.remindersSentSuccess"'),
    "must not reference the nonexistent contributions.* key",
  );
});

test("the hardcoded 'Failed to finalize receipt upload' literal is gone from src/", () => {
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name) && fs.readFileSync(full, "utf8").includes("Failed to finalize receipt upload")) {
        offenders.push(path.relative(root, full));
      }
    }
  };
  walk(path.join(root, "src"));
  assert.deepEqual(offenders, []);
});

test("pay-now dialog never puts raw error messages into UI state", () => {
  const source = read(PAY_NOW);
  assert.ok(
    !/setSubmitError\((?:uploadErr|signErr|\(err as Error\))/.test(source),
    "setSubmitError must only receive translated copy",
  );
  assert.ok(source.includes('setSubmitError(t("uploadFailed"))'), "upload failure uses payNow.uploadFailed");
  assert.ok(source.includes('setSubmitError(t("submitError"))'), "submit failure uses payNow.submitError");
  assert.ok(
    source.includes('console.warn("[PayNow] receipt upload failed:"') &&
      source.includes('console.warn("[PayNow] submit failed:"'),
    "raw errors must still be logged for diagnostics",
  );
});

test("record page surfaces concurrentConflict and refreshes obligations on conflict", () => {
  const source = read(PAGES.record);
  assert.ok(
    source.includes('t("contributions.concurrentConflict")'),
    "translated conflict copy must render",
  );
  const conflictBlock = source.slice(source.indexOf('err.message === "CONCURRENT_PAYMENT_CONFLICT"'));
  assert.ok(
    conflictBlock.slice(0, 600).includes('invalidateQueries({ queryKey: ["obligations", groupId] })'),
    "conflict handler must invalidate the obligations query",
  );
  assert.ok(
    !conflictBlock.slice(0, 600).includes("recordPayment.reset()"),
    "conflict handler must not reset the mutation (that hides the message)",
  );
});

// ─── Dialog copy / formatting / labels ──────────────────────────────────

test("Reopen Period dialog uses its own description key", () => {
  const source = read(PAGES.types);
  const reopenDialog = source.slice(source.indexOf('t("contributions.reopenPeriod")'));
  assert.ok(
    reopenDialog.includes('t("contributions.reopenPeriodDesc")'),
    "reopen dialog must use contributions.reopenPeriodDesc",
  );
  assert.ok(
    !reopenDialog.slice(0, 600).includes('t("contributions.closePeriodDesc")'),
    "reopen dialog must not reuse the Close Period description",
  );
});

test("due dates render via formatDateWithGroupFormat in my-payments and unpaid", () => {
  const myPayments = read(MY_PAYMENTS);
  assert.ok(
    myPayments.includes("formatDateWithGroupFormat(dueDate, groupDateFormat, locale)"),
    "my-payments outstanding card due date must be group-formatted",
  );
  const unpaid = read(PAGES.unpaid);
  assert.ok(
    unpaid.includes("formatDateWithGroupFormat(obl.dueDate, groupDateFormat, locale)"),
    "unpaid expanded obligation rows must group-format the due date",
  );
});

test("matrix legend includes the waived swatch and the cell config renders waived", () => {
  const source = read(PAGES.matrix);
  assert.ok(source.includes('t("contributions.legendWaived")'), "legend must include waived");
  assert.ok(/waived:\s*\{\s*icon:\s*Check/.test(source), "waived cells must render (legend has a real counterpart)");
});

test("types page uses cascade-warning delete copy and surfaces delete errors", () => {
  const source = read(PAGES.types);
  assert.ok(source.includes('t("contributions.deleteTypeConfirmCascade")'));
  assert.ok(source.includes('setDeleteError(t("contributions.deleteTypeFailed"))'));
  assert.ok(/\{deleteError\}/.test(source), "delete error must render in the dialog");
});

test("types page empty-state CTA gates on contributions.manage and Enroll All reports a count", () => {
  const source = read(PAGES.types);
  assert.ok(
    /canManageContributions \?\s*\(\s*<Button onClick=\{\(\) => setShowCreate\(true\)\}/.test(source),
    "empty-state CTA must use the contributions.manage permission, not isAdmin",
  );
  assert.ok(
    source.includes('t("contributions.enrollAllSuccess", { count: enrollSuccessCount })'),
    "Enroll All must show success feedback with the enrolled count",
  );
});

test("bulk record counts failures and shows the recorded/skipped/failed summary", () => {
  const source = read(PAGES.record);
  assert.ok(source.includes("failCount++"), "bulk loop must count per-member failures");
  assert.ok(
    source.includes('t("contributions.bulkResultSummary"') &&
      source.includes("recorded: bulkSuccess") &&
      source.includes("skipped: bulkDupCount") &&
      source.includes("failed: bulkFailCount"),
    "result summary must interpolate recorded/skipped/failed",
  );
});

test("notification bodies interpolate translated method labels, not raw values", () => {
  const payNow = read(PAY_NOW);
  const notifBlock = payNow.slice(payNow.indexOf('t("adminNotifBody"'));
  assert.ok(
    notifBlock.slice(0, 300).includes("method: methodLabels[selectedMethod]"),
    "payNow.adminNotifBody must receive a translated method label",
  );
  const record = read(PAGES.record);
  assert.ok(
    record.includes("method: methodLabel(bulkMethod)"),
    "bulk-record notification body must receive a translated method label",
  );
  assert.ok(
    record.includes('reference: bulkNotes || t("contributions.noReference")'),
    "the raw 'N/A' reference fallback must be translated",
  );
  assert.ok(!record.includes('"N/A"'), "no hardcoded N/A left in record page");
});

test("my-payments methodLabel has explicit online/other branches; history edit select offers other", () => {
  const myPayments = read(MY_PAYMENTS);
  assert.ok(myPayments.includes('if (method === "online") return t("online")'));
  assert.ok(myPayments.includes('return t("other")'));
  const history = read(PAGES.history);
  const editSelect = history.slice(history.indexOf('value="online"'));
  assert.ok(
    editSelect.slice(0, 400).includes('<option value="other">'),
    "history edit dialog method select must include an 'other' option",
  );
});

// ─── Unpaid reminders hardening ─────────────────────────────────────────

test("unpaid send-all shows the eligible-count preview and handles insert errors", () => {
  const source = read(PAGES.unpaid);
  assert.ok(
    source.includes('t("contributions.remindersEligibleNote"') &&
      source.includes("eligible: eligibleMembers.length") &&
      source.includes("total: sorted.length"),
    "confirm dialog must preview 'Will notify {eligible} of {total} members'",
  );
  assert.ok(
    source.includes('setRemindersError(t("contributions.remindersSendFailed"))'),
    "insert failure must surface translated copy",
  );
  assert.ok(
    source.includes('console.warn("[Reminders] bulk insert failed:"') &&
      source.includes('console.warn("[Reminders] insert failed:"'),
    "insert failures must be logged (no silent catch)",
  );
  assert.ok(
    source.includes('t("contributions.proxyReminderUnavailable")'),
    "proxy members must get a disabled-reminder explanation",
  );
});

// ─── Misc UI ────────────────────────────────────────────────────────────

test("record member-search dropdown container is positioned relative", () => {
  const source = read(PAGES.record);
  assert.ok(
    /<div className="relative space-y-2" ref=\{dropdownRef\}>/.test(source),
    "dropdown container must carry 'relative' so the absolute list anchors to it",
  );
});
