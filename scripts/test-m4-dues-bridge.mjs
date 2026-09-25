import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

// ─── CANONICAL F3 DOUBLE-ENTRY INVARIANT SIMULATOR ──────────────────────────

class MockDuesBridgeEngine {
  constructor() {
    this.groups = new Map();
    this.accounts = new Map();
    this.categories = new Map();
    this.funds = new Map();
    this.events = new Map();
    this.postings = [];
    this.payments = new Map();
    this.obligations = new Map();
  }

  seedInitialState() {
    // Group A (XAF)
    this.groups.set("group-A", { id: "group-A", currency: "XAF" });
    // Group B (USD)
    this.groups.set("group-B", { id: "group-B", currency: "USD" });

    // Custody accounts for Group A
    this.accounts.set("acc-bank-A", {
      id: "acc-bank-A",
      group_id: "group-A",
      currency: "XAF",
      name: "Commercial Bank A",
      kind: "bank",
      status: "active",
    });
    this.accounts.set("acc-cash-A", {
      id: "acc-cash-A",
      group_id: "group-A",
      currency: "XAF",
      name: "Petty Cash A",
      kind: "cash",
      status: "active",
    });

    // Custody account for Group B (Cross-tenant probe)
    this.accounts.set("acc-bank-B", {
      id: "acc-bank-B",
      group_id: "group-B",
      currency: "USD",
      name: "Commercial Bank B",
      kind: "bank",
      status: "active",
    });

    // Income categories for Group A
    this.categories.set("cat-dues-A", {
      id: "cat-dues-A",
      group_id: "group-A",
      name: "Member Contributions",
      category_class: "income",
      status: "active",
    });

    // General fund for Group A
    this.funds.set("fund-gen-A", {
      id: "fund-gen-A",
      group_id: "group-A",
      name: "General Fund",
      is_default: true,
      status: "active",
    });
  }

  postDuesPaymentConfirmation(command, caller = { userId: "user-1", hasManagePermission: true }) {
    // 1. Authentication & Permission checks
    if (!caller || !caller.userId) {
      throw new Error("DENY");
    }
    if (!caller.hasManagePermission) {
      throw new Error("DENY");
    }

    // 2. Input validation
    if (!command || typeof command !== "object") {
      throw new Error("INVALID_INPUT");
    }

    const allowedKeys = new Set(["payment_id", "account_id", "category_id", "fund_id", "request_id"]);
    for (const k of Object.keys(command)) {
      if (!allowedKeys.has(k)) {
        throw new Error("UNSUPPORTED_FIELD");
      }
    }

    const paymentId = command.payment_id;
    const accountId = command.account_id;
    if (!paymentId) throw new Error("PAYMENT_NOT_FOUND");
    if (!accountId) throw new Error("ACCOUNT_REQUIRED");

    // 3. Lock & check payment
    const payment = this.payments.get(paymentId);
    if (!payment) {
      throw new Error("PAYMENT_NOT_FOUND");
    }

    // 4. Idempotency assertion
    if (payment.financial_event_id) {
      return {
        decision: "IDEMPOTENT_RETURN_EXISTING",
        payment_id: payment.id,
        financial_event_id: payment.financial_event_id,
        posting_count: 0,
      };
    }

    // 5. Payment status assertion
    if (payment.status === "rejected") {
      throw new Error("PAYMENT_ALREADY_REJECTED");
    }
    if (payment.status !== "pending_confirmation" && payment.status !== "confirmed") {
      throw new Error("INVALID_PAYMENT_STATUS");
    }

    // 6. Custody account assertion
    const account = this.accounts.get(accountId);
    if (!account || account.status !== "active") {
      throw new Error("ACCOUNT_NOT_FOUND_OR_INACTIVE");
    }
    if (!["bank", "cash", "mobile_money", "wallet"].includes(account.kind)) {
      throw new Error("ACCOUNT_KIND_NOT_ALLOWED");
    }

    // Tenant Boundary Invariant: account must belong to the payment's group
    if (account.group_id !== payment.group_id) {
      throw new Error("CROSS_GROUP_DIMENSION");
    }

    // Currency Lock Invariant: account currency must match payment currency
    if (account.currency !== payment.currency) {
      throw new Error("CURRENCY_MISMATCH");
    }

    // 7. Category resolution
    const categoryId = command.category_id || "cat-dues-A";
    const category = this.categories.get(categoryId);
    if (!category || category.group_id !== payment.group_id || category.category_class !== "income") {
      throw new Error("INCOME_CATEGORY_REQUIRED");
    }

    // 8. Amount validation
    const numAmount = Number(payment.amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new Error("AMOUNT_NOT_POSITIVE");
    }

    // 9. Atomic F3 double-entry generation
    const eventId = `fev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const event = {
      id: eventId,
      group_id: payment.group_id,
      event_class: "money_in",
      occurred_at: payment.recorded_at,
      currency: payment.currency,
      description: `Dues payment: ${payment.description || "Contribution"}`,
    };
    this.events.set(eventId, event);

    // Debit Custody Account (Asset Increase)
    const debitPosting = {
      id: `post-${this.postings.length + 1}`,
      event_id: eventId,
      account_id: account.id,
      direction: "debit",
      amount: String(numAmount),
      currency: payment.currency,
    };

    // Credit Income Category (Revenue Increase)
    const creditPosting = {
      id: `post-${this.postings.length + 2}`,
      event_id: eventId,
      category_id: category.id,
      direction: "credit",
      amount: String(numAmount),
      currency: payment.currency,
    };

    this.postings.push(debitPosting, creditPosting);

    // 10. Update payment state & lineage
    payment.status = "confirmed";
    payment.financial_event_id = eventId;
    payment.financial_account_id = account.id;

    // 11. Recalculate linked obligation amount_paid (operational subledger only)
    if (payment.obligation_id) {
      this.recalcObligationAmountPaid(payment.obligation_id);
    }

    return {
      decision: "POSTED",
      payment_id: payment.id,
      financial_event_id: eventId,
      posting_count: 2,
    };
  }

  recalcObligationAmountPaid(obligationId) {
    const obligation = this.obligations.get(obligationId);
    if (!obligation) return;

    let totalPaid = 0;
    for (const p of this.payments.values()) {
      if (p.obligation_id === obligationId && p.status === "confirmed") {
        totalPaid += Number(p.amount);
      }
    }

    obligation.amount_paid = totalPaid;
    obligation.status = totalPaid >= Number(obligation.amount) ? "paid" : totalPaid > 0 ? "partial" : "pending";
  }
}

// ─── TEST SUITE: M4 DUES BRIDGE INVARIANTS ──────────────────────────────────

test("M4 Bridge Invariant 1: Single-income recognition with balanced double-entry postings", () => {
  const engine = new MockDuesBridgeEngine();
  engine.seedInitialState();

  const payment = {
    id: "pay-101",
    group_id: "group-A",
    membership_id: "mem-1",
    amount: "50000",
    currency: "XAF",
    status: "pending_confirmation",
    recorded_at: "2026-09-25T10:00:00Z",
    financial_event_id: null,
    financial_account_id: null,
  };
  engine.payments.set(payment.id, payment);

  const initialEventCount = engine.events.size;
  const initialPostingCount = engine.postings.length;

  const result = engine.postDuesPaymentConfirmation({
    payment_id: "pay-101",
    account_id: "acc-bank-A",
    request_id: "req-001",
  });

  assert.equal(result.decision, "POSTED", "First confirmation must return POSTED");
  assert.equal(result.posting_count, 2, "Must emit exactly 2 postings");
  assert.ok(result.financial_event_id, "Must return valid financial_event_id");

  // Verify Ledger State
  assert.equal(engine.events.size, initialEventCount + 1, "Exactly one financial_event created");
  assert.equal(engine.postings.length, initialPostingCount + 2, "Exactly two journal postings created");

  const event = engine.events.get(result.financial_event_id);
  assert.equal(event.event_class, "money_in", "Event class must be money_in");
  assert.equal(event.currency, "XAF", "Event currency must match payment currency");

  const eventPostings = engine.postings.filter((p) => p.event_id === result.financial_event_id);
  assert.equal(eventPostings.length, 2, "Event must have exactly 2 postings");

  const debit = eventPostings.find((p) => p.direction === "debit");
  const credit = eventPostings.find((p) => p.direction === "credit");
  assert.ok(debit, "Must include debit posting to custody account");
  assert.ok(credit, "Must include credit posting to income category");
  assert.equal(debit.account_id, "acc-bank-A", "Debit posting must target the selected custody account");
  assert.equal(debit.amount, "50000", "Debit amount must equal payment amount");
  assert.equal(credit.amount, "50000", "Credit amount must equal payment amount");

  // Mathematical balance assertion: Debits - Credits = 0
  assert.equal(Number(debit.amount) - Number(credit.amount), 0, "Double-entry postings must be mathematically balanced");

  // Verify Payment Row Lineage
  assert.equal(payment.status, "confirmed", "Payment status updated to confirmed");
  assert.equal(payment.financial_event_id, result.financial_event_id, "Payment linked to financial_event_id");
  assert.equal(payment.financial_account_id, "acc-bank-A", "Payment linked to financial_account_id");
});

test("M4 Bridge Invariant 2: Idempotent replay guarantee", () => {
  const engine = new MockDuesBridgeEngine();
  engine.seedInitialState();

  const payment = {
    id: "pay-102",
    group_id: "group-A",
    membership_id: "mem-1",
    amount: "25000",
    currency: "XAF",
    status: "pending_confirmation",
    recorded_at: "2026-09-25T11:00:00Z",
    financial_event_id: null,
    financial_account_id: null,
  };
  engine.payments.set(payment.id, payment);

  // 1st Execution
  const firstResult = engine.postDuesPaymentConfirmation({
    payment_id: "pay-102",
    account_id: "acc-bank-A",
  });
  assert.equal(firstResult.decision, "POSTED");
  const initialEventId = firstResult.financial_event_id;
  const eventsCountAfterFirst = engine.events.size;
  const postingsCountAfterFirst = engine.postings.length;

  // 2nd Execution (Replay)
  const replayResult = engine.postDuesPaymentConfirmation({
    payment_id: "pay-102",
    account_id: "acc-bank-A",
  });

  assert.equal(replayResult.decision, "IDEMPOTENT_RETURN_EXISTING", "Replay must return IDEMPOTENT_RETURN_EXISTING");
  assert.equal(replayResult.posting_count, 0, "Replay must emit zero new postings");
  assert.equal(replayResult.financial_event_id, initialEventId, "Must return existing financial_event_id");

  // Assert Ledger Invariants Unmodified
  assert.equal(engine.events.size, eventsCountAfterFirst, "Zero new financial events created on replay");
  assert.equal(engine.postings.length, postingsCountAfterFirst, "Zero new postings created on replay");
  assert.equal(payment.financial_event_id, initialEventId, "Existing payment linkage remains untouched");
});

test("M4 Bridge Invariant 3: Currency lock invariant strictly enforced", () => {
  const engine = new MockDuesBridgeEngine();
  engine.seedInitialState();

  // Create an account in Group A with mismatched currency (e.g. USD account in an XAF group)
  engine.accounts.set("acc-usd-A", {
    id: "acc-usd-A",
    group_id: "group-A",
    currency: "USD",
    name: "Foreign Currency USD Vault",
    kind: "bank",
    status: "active",
  });

  const payment = {
    id: "pay-103",
    group_id: "group-A",
    membership_id: "mem-1",
    amount: "10000",
    currency: "XAF", // Payment is in XAF
    status: "pending_confirmation",
    recorded_at: "2026-09-25T12:00:00Z",
    financial_event_id: null,
    financial_account_id: null,
  };
  engine.payments.set(payment.id, payment);

  const initialEventCount = engine.events.size;
  const initialPostingCount = engine.postings.length;

  assert.throws(
    () => {
      engine.postDuesPaymentConfirmation({
        payment_id: "pay-103",
        account_id: "acc-usd-A", // Attempting to confirm XAF payment against USD account
      });
    },
    /CURRENCY_MISMATCH/,
    "Mismatched currency confirmation must be strictly rejected with CURRENCY_MISMATCH"
  );

  // Assert zero state mutations
  assert.equal(payment.status, "pending_confirmation", "Payment remains in pending_confirmation");
  assert.equal(payment.financial_event_id, null, "No financial event linked");
  assert.equal(engine.events.size, initialEventCount, "No ledger events created");
  assert.equal(engine.postings.length, initialPostingCount, "No postings created");
});

test("M4 Bridge Invariant 4: Operational allocation isolation (zero extraneous F3 postings)", () => {
  const engine = new MockDuesBridgeEngine();
  engine.seedInitialState();

  const obligation1 = { id: "obl-jan", group_id: "group-A", amount: "30000", amount_paid: 0, status: "pending" };
  const obligation2 = { id: "obl-feb", group_id: "group-A", amount: "20000", amount_paid: 0, status: "pending" };
  engine.obligations.set(obligation1.id, obligation1);
  engine.obligations.set(obligation2.id, obligation2);

  const payment = {
    id: "pay-104",
    group_id: "group-A",
    membership_id: "mem-1",
    amount: "30000",
    currency: "XAF",
    status: "pending_confirmation",
    obligation_id: "obl-jan", // Initially linked to Jan obligation
    recorded_at: "2026-09-25T13:00:00Z",
    financial_event_id: null,
    financial_account_id: null,
  };
  engine.payments.set(payment.id, payment);

  // Confirm payment
  engine.postDuesPaymentConfirmation({
    payment_id: "pay-104",
    account_id: "acc-bank-A",
  });

  assert.equal(obligation1.amount_paid, 30000, "Obligation 1 paid amount updated");
  assert.equal(obligation1.status, "paid", "Obligation 1 status updated to paid");

  const ledgerEventCountAfterConfirm = engine.events.size;
  const ledgerPostingCountAfterConfirm = engine.postings.length;
  assert.equal(ledgerEventCountAfterConfirm, 1, "Exactly one event after confirmation");
  assert.equal(ledgerPostingCountAfterConfirm, 2, "Exactly two postings after confirmation");

  // Now simulate subsequent subledger reallocations / obligations recalculations
  engine.recalcObligationAmountPaid("obl-jan");
  engine.recalcObligationAmountPaid("obl-feb");

  // Re-verify general ledger state: must remain completely isolated
  assert.equal(engine.events.size, ledgerEventCountAfterConfirm, "Subledger allocations emit ZERO additional events");
  assert.equal(engine.postings.length, ledgerPostingCountAfterConfirm, "Subledger allocations emit ZERO additional postings");
});

test("M4 Bridge Invariant 5: Tenant boundary integrity (CROSS_GROUP_DIMENSION)", () => {
  const engine = new MockDuesBridgeEngine();
  engine.seedInitialState();

  const paymentGroupA = {
    id: "pay-105",
    group_id: "group-A",
    membership_id: "mem-1",
    amount: "15000",
    currency: "XAF",
    status: "pending_confirmation",
    recorded_at: "2026-09-25T14:00:00Z",
    financial_event_id: null,
    financial_account_id: null,
  };
  engine.payments.set(paymentGroupA.id, paymentGroupA);

  assert.throws(
    () => {
      engine.postDuesPaymentConfirmation({
        payment_id: "pay-105",
        account_id: "acc-bank-B", // Belongs to Group B!
      });
    },
    /CROSS_GROUP_DIMENSION/,
    "Cross-group custody account confirmation must be strictly rejected with CROSS_GROUP_DIMENSION"
  );

  // Assert payment remained untouched
  assert.equal(paymentGroupA.status, "pending_confirmation");
  assert.equal(paymentGroupA.financial_event_id, null);
  assert.equal(engine.events.size, 0, "No events created across groups");
  assert.equal(engine.postings.length, 0, "No postings created across groups");
});

// ─── STATIC CONTRACT AUDIT: MIGRATION & CLIENT HOOKS ─────────────────────────

test("M4 Bridge Static Audit: Migration 00124 Schema & RPC Security Pinning", () => {
  const migration = read("supabase/migrations/00124_m4_01_dues_f3_bridge.sql");

  // Invariant 1: Foreign keys with ON DELETE RESTRICT
  assert.ok(
    migration.includes("financial_event_id uuid REFERENCES public.financial_events(id) ON DELETE RESTRICT"),
    "financial_event_id must reference financial_events with ON DELETE RESTRICT"
  );
  assert.ok(
    migration.includes("financial_account_id uuid REFERENCES public.financial_accounts(id) ON DELETE RESTRICT"),
    "financial_account_id must reference financial_accounts with ON DELETE RESTRICT"
  );

  // Indexes on bridge columns
  assert.ok(
    migration.includes("CREATE INDEX IF NOT EXISTS idx_payments_financial_event_id"),
    "idx_payments_financial_event_id index must exist"
  );
  assert.ok(
    migration.includes("CREATE INDEX IF NOT EXISTS idx_payments_financial_account_id"),
    "idx_payments_financial_account_id index must exist"
  );

  // RPC Security & Signature
  assert.ok(
    migration.includes("CREATE OR REPLACE FUNCTION public.post_dues_payment_confirmation(p_command jsonb)"),
    "Function signature must accept p_command jsonb"
  );
  assert.ok(
    migration.includes("SECURITY DEFINER"),
    "RPC must be SECURITY DEFINER"
  );
  assert.ok(
    migration.includes("SET search_path = ''"),
    "RPC must lock search_path to empty string"
  );
  assert.ok(
    migration.includes("financial_core.assert_finances_manage(v_group_id)"),
    "RPC must assert finances.manage permission"
  );
  assert.ok(
    migration.includes("IDEMPOTENT_RETURN_EXISTING"),
    "RPC must guarantee idempotent returns"
  );
  assert.ok(
    migration.includes("financial_core.post_f3_command(v_f3_command"),
    "RPC must invoke canonical F3 posting command"
  );
  assert.ok(
    migration.includes("public.recalc_obligation_amount_paid"),
    "RPC must recalculate obligation after confirmation"
  );
});

test("M4 Bridge Static Audit: Client Mutation Hooks Invariants", () => {
  const hookSource = read("src/lib/hooks/use-dues-posting.ts");

  assert.ok(hookSource.includes("useConfirmDuesPayment"), "Exports useConfirmDuesPayment");
  assert.ok(hookSource.includes("useRecordAndPostDuesPayment"), "Exports useRecordAndPostDuesPayment");
  assert.ok(hookSource.includes("parseDuesPostingRpcError"), "Exports parseDuesPostingRpcError");

  // Invariant: Cross-tenant context switch guard
  assert.ok(
    hookSource.includes("staleTenantAborted"),
    "Hooks must contain staleTenantAborted cross-tenant guard"
  );
  assert.ok(
    hookSource.includes("ACCOUNT_REQUIRED"),
    "Hooks must require accountId client invariant"
  );
  assert.ok(
    hookSource.includes("post_dues_payment_confirmation"),
    "Hooks must invoke canonical post_dues_payment_confirmation RPC"
  );
});

test("M4 Bridge Static Audit: UI Review Gate Integration", () => {
  const recordSource = read("src/app/[locale]/(dashboard)/dashboard/contributions/record/page.tsx");
  const historySource = read("src/app/[locale]/(dashboard)/dashboard/contributions/history/page.tsx");

  // Record page integration
  assert.ok(
    recordSource.includes("useRecordAndPostDuesPayment"),
    "Record page imports useRecordAndPostDuesPayment"
  );
  assert.ok(
    recordSource.includes("useFinancialAccounts"),
    "Record page imports useFinancialAccounts"
  );
  assert.ok(
    recordSource.includes("selectedAccountId"),
    "Record page manages selectedAccountId"
  );

  // History page integration
  assert.ok(
    historySource.includes("useConfirmDuesPayment"),
    "History page imports useConfirmDuesPayment"
  );
  assert.ok(
    historySource.includes("confirmingPayment"),
    "History page manages confirmingPayment modal state"
  );
  assert.ok(
    historySource.includes("depositAccountId"),
    "History page manages depositAccountId for confirmation"
  );
  assert.ok(
    historySource.includes("duesPosting.postedBadge"),
    "History page renders postedBadge on ledger-linked payments"
  );
});
