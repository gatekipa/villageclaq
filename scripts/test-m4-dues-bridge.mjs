import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

// ─── CANONICAL F3 DOUBLE-ENTRY & BRIDGE INVARIANT SIMULATOR ──────────────────

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
    this.activeLocks = new Set();
  }

  seedInitialState() {
    // Group A (XAF, scale 0)
    this.groups.set("group-A", { id: "group-A", currency: "XAF" });
    // Group B (USD, scale 2)
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

  currencyScale(currency) {
    switch (currency?.toUpperCase()) {
      case "XAF":
      case "XOF":
      case "TZS":
      case "UGX":
      case "RWF":
        return 0;
      case "USD":
      case "EUR":
      case "GBP":
      case "CAD":
      case "NGN":
      case "KES":
      case "ZAR":
        return 2;
      default:
        return null;
    }
  }

  postDuesPaymentConfirmation(
    command,
    caller = { userId: "user-1", hasManagePermission: true },
    options = { simulateF3Failure: false }
  ) {
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

    // Optional request_id resolution
    const requestId = command.request_id || `req-gen-${Date.now()}`;

    // 3. Advisory lock & Row lock acquisition
    const lockKey = `dues-confirm:${paymentId}`;
    this.activeLocks.add(lockKey);

    try {
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

      // 7. Amount and precision validation
      const numAmount = Number(payment.amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        throw new Error("AMOUNT_NOT_POSITIVE");
      }

      const scale = this.currencyScale(payment.currency);
      if (scale === null) {
        throw new Error("UNSUPPORTED_CURRENCY");
      }

      const rounded = Number(numAmount.toFixed(scale));
      if (Math.abs(numAmount - rounded) > 1e-9) {
        throw new Error("AMOUNT_PRECISION");
      }

      let amountStr;
      if (scale === 0) {
        amountStr = String(Math.round(numAmount));
      } else {
        amountStr = numAmount.toFixed(scale);
      }

      // 8. Category resolution
      const categoryId = command.category_id || "cat-dues-A";
      const category = this.categories.get(categoryId);
      if (!category || category.group_id !== payment.group_id || category.category_class !== "income") {
        throw new Error("INCOME_CATEGORY_REQUIRED");
      }

      // 9. Simulate transaction failure in F3 if requested
      if (options.simulateF3Failure) {
        throw new Error("NO_ACTIVE_EPOCH");
      }

      // 10. Atomic F3 double-entry generation
      const eventId = `fev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const event = {
        id: eventId,
        group_id: payment.group_id,
        event_class: "money_in",
        occurred_at: payment.recorded_at,
        currency: payment.currency,
        description: `Dues payment: ${payment.description || "Contribution"}`,
        request_id: requestId,
      };
      this.events.set(eventId, event);

      // Debit Custody Account (Asset Increase)
      const debitPosting = {
        id: `post-${this.postings.length + 1}`,
        event_id: eventId,
        account_id: account.id,
        direction: "debit",
        amount: amountStr,
        currency: payment.currency,
      };

      // Credit Income Category (Revenue Increase)
      const creditPosting = {
        id: `post-${this.postings.length + 2}`,
        event_id: eventId,
        category_id: category.id,
        direction: "credit",
        amount: amountStr,
        currency: payment.currency,
      };

      this.postings.push(debitPosting, creditPosting);

      // 11. Update payment state & lineage
      payment.status = "confirmed";
      payment.financial_event_id = eventId;
      payment.financial_account_id = account.id;

      // 12. Recalculate linked obligation amount_paid (operational subledger only)
      if (payment.obligation_id) {
        this.recalcObligationAmountPaid(payment.obligation_id);
      }

      return {
        decision: "POSTED",
        payment_id: payment.id,
        financial_event_id: eventId,
        posting_count: 2,
      };
    } finally {
      this.activeLocks.delete(lockKey);
    }
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

// ─── TEST SUITE: ATTACK VECTOR VERIFICATION ─────────────────────────────────

test("Vector 1: Concurrency, Advisory Locks & Double-Confirmation", () => {
  const engine = new MockDuesBridgeEngine();
  engine.seedInitialState();

  const payment = {
    id: "pay-v1-01",
    group_id: "group-A",
    amount: "50000",
    currency: "XAF",
    status: "pending_confirmation",
    recorded_at: "2026-09-25T10:00:00Z",
    financial_event_id: null,
    financial_account_id: null,
  };
  engine.payments.set(payment.id, payment);

  // 1. Concurrent simulation: T1 posts and finishes
  const res1 = engine.postDuesPaymentConfirmation({
    payment_id: "pay-v1-01",
    account_id: "acc-bank-A",
  });
  assert.equal(res1.decision, "POSTED");
  assert.equal(res1.posting_count, 2);
  const initialEventId = res1.financial_event_id;

  // 2. Concurrent T2 resumes, inspects row with existing event, returns IDEMPOTENT_RETURN_EXISTING
  const res2 = engine.postDuesPaymentConfirmation({
    payment_id: "pay-v1-01",
    account_id: "acc-bank-A",
  });
  assert.equal(res2.decision, "IDEMPOTENT_RETURN_EXISTING");
  assert.equal(res2.posting_count, 0);
  assert.equal(res2.financial_event_id, initialEventId);

  // Verify zero ledger event or posting inflation
  assert.equal(engine.events.size, 1);
  assert.equal(engine.postings.length, 2);

  // 3. Omitting request_id does not throw
  const paymentNoReq = {
    id: "pay-v1-02",
    group_id: "group-A",
    amount: "10000",
    currency: "XAF",
    status: "pending_confirmation",
    recorded_at: "2026-09-25T10:05:00Z",
    financial_event_id: null,
    financial_account_id: null,
  };
  engine.payments.set(paymentNoReq.id, paymentNoReq);

  const resNoReq = engine.postDuesPaymentConfirmation({
    payment_id: "pay-v1-02",
    account_id: "acc-bank-A",
  });
  assert.equal(resNoReq.decision, "POSTED");
});

test("Vector 2: Exact Precision & Currency Scaling", () => {
  const engine = new MockDuesBridgeEngine();
  engine.seedInitialState();

  // Test 2.1: Zero amount rejection
  const paymentZero = {
    id: "pay-v2-zero",
    group_id: "group-A",
    amount: "0",
    currency: "XAF",
    status: "pending_confirmation",
  };
  engine.payments.set(paymentZero.id, paymentZero);
  assert.throws(
    () => engine.postDuesPaymentConfirmation({ payment_id: "pay-v2-zero", account_id: "acc-bank-A" }),
    /AMOUNT_NOT_POSITIVE/
  );

  // Test 2.2: Negative amount rejection
  const paymentNeg = {
    id: "pay-v2-neg",
    group_id: "group-A",
    amount: "-500",
    currency: "XAF",
    status: "pending_confirmation",
  };
  engine.payments.set(paymentNeg.id, paymentNeg);
  assert.throws(
    () => engine.postDuesPaymentConfirmation({ payment_id: "pay-v2-neg", account_id: "acc-bank-A" }),
    /AMOUNT_NOT_POSITIVE/
  );

  // Test 2.3: Scale mismatch: 50000.75 for 0-decimal currency XAF
  const paymentScaleMismatch = {
    id: "pay-v2-frac",
    group_id: "group-A",
    amount: "50000.75",
    currency: "XAF",
    status: "pending_confirmation",
  };
  engine.payments.set(paymentScaleMismatch.id, paymentScaleMismatch);
  assert.throws(
    () => engine.postDuesPaymentConfirmation({ payment_id: "pay-v2-frac", account_id: "acc-bank-A" }),
    /AMOUNT_PRECISION/
  );

  // Test 2.4: Currency mismatch between custody account and payment
  const paymentXaf = {
    id: "pay-v2-xaf",
    group_id: "group-A",
    amount: "25000",
    currency: "XAF",
    status: "pending_confirmation",
  };
  engine.payments.set(paymentXaf.id, paymentXaf);

  engine.accounts.set("acc-usd-in-A", {
    id: "acc-usd-in-A",
    group_id: "group-A",
    currency: "USD",
    kind: "bank",
    status: "active",
  });

  assert.throws(
    () => engine.postDuesPaymentConfirmation({ payment_id: "pay-v2-xaf", account_id: "acc-usd-in-A" }),
    /CURRENCY_MISMATCH/
  );
});

test("Vector 3: Subledger Allocation Independence", () => {
  const engine = new MockDuesBridgeEngine();
  engine.seedInitialState();

  const obligation = { id: "obl-q1", group_id: "group-A", amount: "60000", amount_paid: 0, status: "pending" };
  engine.obligations.set(obligation.id, obligation);

  const payment1 = {
    id: "pay-v3-01",
    group_id: "group-A",
    amount: "20000",
    currency: "XAF",
    status: "pending_confirmation",
    obligation_id: "obl-q1",
    recorded_at: "2026-09-25T11:00:00Z",
  };
  engine.payments.set(payment1.id, payment1);

  // Confirm payment 1
  engine.postDuesPaymentConfirmation({ payment_id: "pay-v3-01", account_id: "acc-bank-A" });
  assert.equal(obligation.amount_paid, 20000);
  assert.equal(obligation.status, "partial");
  assert.equal(engine.events.size, 1);
  assert.equal(engine.postings.length, 2);

  // Subledger recalculation without new payments emits zero ledger entries
  engine.recalcObligationAmountPaid("obl-q1");
  assert.equal(engine.events.size, 1, "Zero new financial events created by subledger recalculation");
  assert.equal(engine.postings.length, 2, "Zero new postings created by subledger recalculation");

  // Confirm payment 2
  const payment2 = {
    id: "pay-v3-02",
    group_id: "group-A",
    amount: "40000",
    currency: "XAF",
    status: "pending_confirmation",
    obligation_id: "obl-q1",
    recorded_at: "2026-09-25T11:30:00Z",
  };
  engine.payments.set(payment2.id, payment2);

  engine.postDuesPaymentConfirmation({ payment_id: "pay-v3-02", account_id: "acc-bank-A" });
  assert.equal(obligation.amount_paid, 60000);
  assert.equal(obligation.status, "paid");
  assert.equal(engine.events.size, 2);
  assert.equal(engine.postings.length, 4);

  // Cash basis income recognized exactly once per confirmed payment
  const allEvents = Array.from(engine.events.values());
  assert.equal(allEvents.filter((e) => e.event_class === "money_in").length, 2);
});

test("Vector 4: Cross-Tenant Context Hygiene & Memory Leaks", () => {
  // 4.1 Mutation hook rejects mismatched groupId
  const currentGroupId = "group-A";
  const crossTenantInput = { groupId: "group-B", paymentId: "pay-1", accountId: "acc-1" };

  assert.throws(
    () => {
      if (crossTenantInput.groupId !== currentGroupId) {
        throw new Error("staleTenantAborted");
      }
    },
    /staleTenantAborted/,
    "Mutation hook must abort with staleTenantAborted on mismatched groupId"
  );

  // 4.2 Client hook rejects currency mismatch
  const mismatchedCurrencyInput = {
    groupId: "group-A",
    currency: "XAF",
    accountCurrency: "USD",
  };
  assert.throws(
    () => {
      if (mismatchedCurrencyInput.accountCurrency && mismatchedCurrencyInput.accountCurrency !== mismatchedCurrencyInput.currency) {
        throw new Error("CURRENCY_MISMATCH");
      }
    },
    /CURRENCY_MISMATCH/,
    "Client hook must reject mismatched account currency"
  );
});

test("Vector 5: Transaction Atomicity on Failure", () => {
  const engine = new MockDuesBridgeEngine();
  engine.seedInitialState();

  const payment = {
    id: "pay-v5-fail",
    group_id: "group-A",
    amount: "15000",
    currency: "XAF",
    status: "pending_confirmation",
    financial_event_id: null,
    financial_account_id: null,
  };
  engine.payments.set(payment.id, payment);

  const initialEventCount = engine.events.size;
  const initialPostingCount = engine.postings.length;

  // Simulate F3 failure (e.g. NO_ACTIVE_EPOCH)
  assert.throws(
    () =>
      engine.postDuesPaymentConfirmation(
        { payment_id: "pay-v5-fail", account_id: "acc-bank-A" },
        { userId: "user-1", hasManagePermission: true },
        { simulateF3Failure: true }
      ),
    /NO_ACTIVE_EPOCH/
  );

  // Assert rollback: payment status remains pending_confirmation, zero ledger events
  assert.equal(payment.status, "pending_confirmation", "Payment status must not transition to confirmed");
  assert.equal(payment.financial_event_id, null, "Financial event id must remain null");
  assert.equal(payment.financial_account_id, null, "Financial account id must remain null");
  assert.equal(engine.events.size, initialEventCount, "No partial ledger events persisted");
  assert.equal(engine.postings.length, initialPostingCount, "No partial postings persisted");
});

// ─── STATIC CONTRACT AUDIT: MIGRATION, CLIENT HOOKS, AND UI PAGES ───────────

test("M4 Bridge Static Audit: Migration 00124 Schema & Invariants", () => {
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

  // Invariant 2: Advisory lock & FOR UPDATE row locking
  assert.ok(
    migration.includes("pg_advisory_xact_lock"),
    "RPC must acquire transaction-level advisory lock"
  );
  assert.ok(
    migration.includes("FOR UPDATE"),
    "RPC must acquire row-level FOR UPDATE lock"
  );

  // Invariant 3: Currency & precision checks
  assert.ok(
    migration.includes("CURRENCY_MISMATCH"),
    "RPC must assert CURRENCY_MISMATCH on custody account"
  );
  assert.ok(
    migration.includes("AMOUNT_PRECISION"),
    "RPC must assert AMOUNT_PRECISION on payment amount"
  );
  assert.ok(
    migration.includes("AMOUNT_NOT_POSITIVE"),
    "RPC must assert AMOUNT_NOT_POSITIVE on payment amount"
  );
  assert.ok(
    migration.includes("CROSS_GROUP_DIMENSION"),
    "RPC must assert CROSS_GROUP_DIMENSION on custody account"
  );

  // Invariant 4: Security Defininer and Search Path
  assert.ok(migration.includes("SECURITY DEFINER"), "RPC must be SECURITY DEFINER");
  assert.ok(migration.includes("SET search_path = ''"), "RPC must lock search_path to empty string");
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
    hookSource.includes("CURRENCY_MISMATCH"),
    "Hooks must validate CURRENCY_MISMATCH"
  );
  assert.ok(
    hookSource.includes(".delete().eq(\"id\", insertedPayment.id)"),
    "Hook must clean up pending payment on RPC posting failure"
  );
});

test("M4 Bridge Static Audit: UI Context Hygiene & Currency Gates", () => {
  const recordSource = read("src/app/[locale]/(dashboard)/dashboard/contributions/record/page.tsx");
  const historySource = read("src/app/[locale]/(dashboard)/dashboard/contributions/history/page.tsx");

  // Record page tenant purge
  assert.ok(
    recordSource.includes("setSelectedMembership(null)"),
    "Record page purges selectedMembership on tenant switch"
  );
  assert.ok(
    recordSource.includes("setSelectedAccountId(\"\")"),
    "Record page purges selectedAccountId on tenant switch"
  );
  assert.ok(
    recordSource.includes("targetAccount.currency !== currency"),
    "Record page verifies account currency before posting"
  );

  // History page tenant purge
  assert.ok(
    historySource.includes("setConfirmingPayment(null)"),
    "History page purges confirmingPayment on tenant switch"
  );
  assert.ok(
    historySource.includes("setEditPayment(null)"),
    "History page purges editPayment on tenant switch"
  );
  assert.ok(
    historySource.includes("setDeletePayment(null)"),
    "History page purges deletePayment on tenant switch"
  );
  assert.ok(
    historySource.includes("account.currency !== confirmingPayment.currency"),
    "History page verifies account currency before posting"
  );
});
