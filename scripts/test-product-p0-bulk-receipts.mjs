import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// ───────────────────────────────────────────────────────────────────────────
// P0 hotfix guardrails — false "payment received" WhatsApp blast.
//
// Root cause: the bulk-record tool listed ALL members (select-all available)
// and, on save, immediately created confirmed payments AND auto-fired a
// "payment received" receipt on WhatsApp + email + SMS + in-app — with no
// confirmation. A bulk record could therefore tell members who never paid that
// their payment was received.
//
// Fix (UI/client behaviour only — no Meta/provider/template config change):
//  • Saving now opens a MANDATORY confirmation dialog (count / contribution
//    object / total / whether receipts go out / how many receipts).
//  • Receipts are OPT-IN: a checkbox defaulting OFF.
//  • OFF  → payments are recorded, NO "payment received" message on any channel.
//  • ON   → a SECOND "money was actually received" checkbox must be ticked
//           before the receipt notifications fire.
//
// These tests pin every one of those behaviours against the real source so the
// guard cannot silently regress. They are static (read source as text) — they
// never send anything.
// ───────────────────────────────────────────────────────────────────────────

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const RECORD_PAGE = "src/app/[locale]/(dashboard)/dashboard/contributions/record/page.tsx";
const RECEIPT_PRODUCER = "src/lib/payment-receipt-producer.ts";
const RECEIPT_ROUTE = "src/app/api/payments/receipt-notifications/route.ts";
const WA_TEMPLATES = "src/lib/whatsapp-templates.ts";
const EN = "messages/en.json";
const FR = "messages/fr.json";

const page = read(RECORD_PAGE);
const producer = read(RECEIPT_PRODUCER);
const route = read(RECEIPT_ROUTE);
const templates = read(WA_TEMPLATES);
const en = JSON.parse(read(EN));
const fr = JSON.parse(read(FR));

// Slice helper so assertions are scoped to handleBulkSave, not the whole file.
const bulkSaveBody = (() => {
  const start = page.indexOf("async function handleBulkSave");
  assert.ok(start !== -1, "handleBulkSave exists");
  // the function ends at the standalone `}` that precedes `if (isLoading)`.
  const end = page.indexOf("if (isLoading)", start);
  return page.slice(start, end === -1 ? undefined : end);
})();

// ── 1. Bulk save default does NOT send receipts ─────────────────────────────

test("bulk save is gated by an explicit sendReceipts flag (default OFF)", () => {
  // The function takes the flag — receipts are never unconditional.
  assert.ok(
    /async function handleBulkSave\(sendReceipts: boolean\)/.test(page),
    "handleBulkSave takes a sendReceipts boolean",
  );
  // BOTH the server-side receipt producer call AND the email/SMS/in-app
  // notifyFromClient block live inside the single `if (sendReceipts && ...)`.
  assert.ok(
    /if \(sendReceipts && paidPayments\.length > 0 && groupId\)/.test(bulkSaveBody),
    "the entire notification block is gated on sendReceipts",
  );
  // The receipt producer + the diaspora notifier must BOTH sit inside that gate.
  const gateStart = bulkSaveBody.indexOf("if (sendReceipts && paidPayments.length > 0 && groupId)");
  const gateRegion = bulkSaveBody.slice(gateStart, bulkSaveBody.indexOf("setBulkSuccess(successCount)", gateStart));
  assert.ok(/produceServerSideReceiptNotifications/.test(gateRegion), "receipt producer call is inside the gate");
  assert.ok(/notifyFromClient/.test(gateRegion), "email/SMS notifier is inside the gate");
  // The opt-in checkbox state defaults to false.
  assert.ok(
    /const \[bulkSendReceipts, setBulkSendReceipts\] = useState\(false\)/.test(page),
    "bulkSendReceipts state defaults to false",
  );
});

test("the Record button opens a confirmation dialog, never sends directly", () => {
  // The bulk-dialog footer button must NOT call handleBulkSave directly.
  assert.ok(
    !/onClick=\{handleBulkSave\}/.test(page),
    "footer Record button no longer calls handleBulkSave directly",
  );
  // It opens the confirmation dialog with receipts reset OFF.
  assert.ok(
    /setBulkSendReceipts\(false\); setBulkReconfirm\(false\); setBulkConfirmOpen\(true\)/.test(page),
    "footer Record button opens the confirm dialog with receipts default OFF",
  );
  // The confirmation dialog actually invokes the save with the chosen flag.
  assert.ok(
    /onClick=\{\(\) => handleBulkSave\(bulkSendReceipts\)\}/.test(page),
    "confirm dialog calls handleBulkSave(bulkSendReceipts)",
  );
});

// ── 2. Opt-in sends ONLY to selected, successfully-paid members ─────────────

test("receipts are produced only for members with a real payment row", () => {
  // paidPayments is built solely from successful recordPayment results that
  // returned a payment id — never from the expected/selected member list.
  assert.ok(
    /const paidPayments: Array<\{ memberId: string; paymentId: string \}> = \[\]/.test(bulkSaveBody),
    "paidPayments accumulator exists",
  );
  assert.ok(
    /if \(typeof paymentId === "string"\) \{\s*paidPayments\.push/.test(bulkSaveBody),
    "only payments with a returned id are pushed to paidPayments",
  );
  // The producer call iterates paidPayments (payment-row driven), not bulkSelected.
  assert.ok(
    /paidPayments\.map\(\(\{ paymentId \}\) => produceServerSideReceiptNotifications\(paymentId\)\)/.test(bulkSaveBody),
    "receipts are produced per payment id, not per selected member",
  );
});

// ── 3. Unpaid / unselected members never receive a receipt ──────────────────

test("the bulk loop only touches selected members and only receipts the paid", () => {
  // Payments are recorded only for members in bulkSelected.
  assert.ok(/for \(const memberId of bulkSelected\)/.test(bulkSaveBody), "loop iterates bulkSelected only");
  // A failed payment increments failCount and is NOT pushed to paidPayments,
  // so it can never be receipted.
  assert.ok(/failCount\+\+/.test(bulkSaveBody), "failed payments are counted, not receipted");
  // Duplicates are skipped (continue) before any payment/receipt is created.
  assert.ok(/dupCount\+\+;\s*continue;/.test(bulkSaveBody), "duplicate payments are skipped, not receipted");
});

// ── 4. Pending / rejected payments do not trigger receipts (central guard) ──

test("payment-receipt-producer still refuses non-confirmed payments", () => {
  assert.ok(
    /payment\.status !== "confirmed"/.test(producer),
    "producer gates on confirmed status",
  );
  assert.ok(
    /payment_not_confirmed/.test(producer),
    "producer returns a skipped reason for non-confirmed payments",
  );
  // group + membership match invariant preserved.
  assert.ok(
    /membership\.group_id !== payment\.group_id/.test(producer),
    "producer enforces group match between membership and payment",
  );
});

// ── 5. Individual confirmed-payment receipt path is untouched ───────────────

test("individual receipt path still produces a payment_receipt", () => {
  assert.ok(/template: "payment_receipt"/.test(producer), "producer still queues payment_receipt");
  assert.ok(
    /producePaymentReceiptNotifications/.test(route),
    "receipt-notifications route still calls the producer",
  );
});

// ── 6. No Meta / provider / template config change ──────────────────────────

test("WhatsApp template identifiers are unchanged", () => {
  assert.ok(
    /PAYMENT_RECEIPT:\s*"villageclaq_payment_receipt_v2"/.test(templates),
    "PAYMENT_RECEIPT template name unchanged",
  );
  assert.ok(
    /PAYMENT_REMINDER:\s*"villageclaq_payment_reminder_v2"/.test(templates),
    "PAYMENT_REMINDER template name unchanged",
  );
});

// ── 7. Confirmation is mandatory; opt-in needs a second confirmation ────────

test("confirm dialog requires re-confirmation before receipts can fire", () => {
  // The confirm/save button is disabled until the second checkbox is ticked
  // whenever receipts are enabled.
  assert.ok(
    /disabled=\{bulkSubmitting \|\| \(bulkSendReceipts && !bulkReconfirm\)\}/.test(page),
    "save is blocked while receipts are ON but re-confirmation is unticked",
  );
  // The re-confirmation checkbox drives bulkReconfirm.
  assert.ok(
    /onChange=\{\(e\) => setBulkReconfirm\(e\.target\.checked\)\}/.test(page),
    "the second checkbox sets bulkReconfirm",
  );
  // Unchecking receipts also clears the re-confirmation (can't be stuck true).
  assert.ok(
    /if \(!e\.target\.checked\) setBulkReconfirm\(false\)/.test(page),
    "turning receipts OFF resets the re-confirmation",
  );
});

// ── i18n parity for the new confirmation copy ───────────────────────────────

test("new bulk-confirm i18n keys exist with EN/FR parity", () => {
  const keys = [
    "bulkConfirmTitle",
    "bulkConfirmSummary",
    "bulkConfirmMembers",
    "bulkConfirmTotal",
    "bulkSendReceiptsLabel",
    "bulkSendReceiptsHint",
    "bulkReceiptsWillQueue",
    "bulkReceiptsNoneWillSend",
    "bulkReconfirmLabel",
    "bulkConfirmRecord",
  ];
  for (const k of keys) {
    assert.ok(en.contributions?.[k], `en.contributions.${k} exists`);
    assert.ok(fr.contributions?.[k], `fr.contributions.${k} exists`);
  }
  // placeholder parity on the two interpolated strings
  assert.ok(
    en.contributions.bulkConfirmSummary.includes("{count}") &&
      en.contributions.bulkConfirmSummary.includes("{type}"),
    "en bulkConfirmSummary keeps {count} and {type}",
  );
  assert.ok(
    fr.contributions.bulkConfirmSummary.includes("{count}") &&
      fr.contributions.bulkConfirmSummary.includes("{type}"),
    "fr bulkConfirmSummary keeps {count} and {type}",
  );
  assert.ok(
    en.contributions.bulkReceiptsWillQueue.includes("{count}") &&
      fr.contributions.bulkReceiptsWillQueue.includes("{count}"),
    "bulkReceiptsWillQueue keeps {count} in both locales",
  );
});
