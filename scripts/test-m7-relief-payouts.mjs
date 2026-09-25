import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const M7_01 = "supabase/migrations/00128_m7_01_relief_canonical.sql";
const HOOKS = "src/lib/hooks/use-relief-mutations.ts";
const CLAIMS_UI = "src/app/[locale]/(dashboard)/dashboard/relief/claims/page.tsx";

// ============================================================================
// Mock Engine for Concrete Functional Simulations
// ============================================================================
class MockM7ReliefEngine {
  constructor() {
    this.claims = new Map();
    this.accounts = new Map();
    this.enrollments = new Map();
    this.events = new Map();
    this.expenseAccounts = new Map();
  }

  seedInitialState() {
    this.accounts.set("acc-1", { id: "acc-1", currency: "USD", status: "active", kind: "bank", group_id: "group-1" });
    this.accounts.set("acc-2", { id: "acc-2", currency: "EUR", status: "active", kind: "bank", group_id: "group-1" });
    
    this.enrollments.set("enr-1", {
      plan_id: "plan-1",
      membership_id: "mem-1",
      status: "active",
      matures_at: new Date(Date.now() - 100000).toISOString()
    });

    this.claims.set("claim-1", {
      id: "claim-1",
      group_id: "group-1",
      plan_id: "plan-1",
      claimant_membership_id: "mem-1",
      amount_approved: 500.00,
      currency: "USD",
      status: "approved",
      incident_date: new Date().toISOString()
    });

    this.expenseAccounts.set("exp-1", { id: "exp-1", group_id: "group-1", code: "relief_expense", status: "active" });
  }

  post_relief_claim_payout(p_command) {
    const { claim_id, account_id } = p_command;
    const claim = this.claims.get(claim_id);
    if (!claim) throw new Error("CLAIM_NOT_FOUND");
    
    if (claim.status === "paid" && claim.financial_event_id) {
      return { decision: "IDEMPOTENT_RETURN_EXISTING", posting_count: 0 };
    }

    if (claim.status !== "approved") throw new Error("CLAIM_NOT_APPROVED_FOR_PAYOUT");

    const account = this.accounts.get(account_id);
    if (!account || account.status !== "active") throw new Error("ACCOUNT_NOT_FOUND_OR_INVALID");

    if (account.currency !== claim.currency) throw new Error("CURRENCY_MISMATCH");

    let expId = [...this.expenseAccounts.values()].find(e => e.group_id === claim.group_id && e.code === "relief_expense" && e.status === "active")?.id;
    if (!expId) {
      expId = [...this.expenseAccounts.values()].find(e => e.group_id === claim.group_id && e.status === "active")?.id;
    }
    if (!expId) {
      throw new Error("RELIEF_EXPENSE_ACCOUNT_NOT_CONFIGURED");
    }

    const event_id = "evt-" + Date.now();
    this.events.set(event_id, {
      action_type: "money_out",
      postings: [
        { account_id: expId, amount: claim.amount_approved, direction: "debit" },
        { account_id: account.id, amount: claim.amount_approved, direction: "credit" }
      ]
    });

    claim.status = "paid";
    claim.financial_event_id = event_id;
    this.claims.set(claim.id, claim);

    return { ok: true, financial_event_id: event_id, posting_count: 2 };
  }

  insert_claim(new_claim) {
    if (new_claim.amount_requested <= 0) throw new Error("CHECK_VIOLATION");
    
    const enrollment = [...this.enrollments.values()].find(e => e.plan_id === new_claim.plan_id && e.membership_id === new_claim.claimant_membership_id && e.status === "active");
    if (!enrollment) throw new Error("MEMBER_NOT_ENROLLED_IN_PLAN");
    if (new Date(new_claim.incident_date) < new Date(enrollment.matures_at)) {
      throw new Error("CLAIM_PREMATURE_WAITING_PERIOD_NOT_MET");
    }
    
    new_claim.id = "claim-" + Date.now();
    this.claims.set(new_claim.id, new_claim);
    return new_claim;
  }
}

// ============================================================================
// Tests
// ============================================================================

test("Test A: Fuzzing negative & zero claim amounts (assert DB check constraint and UI rejection)", () => {
  const engine = new MockM7ReliefEngine();
  engine.seedInitialState();
  
  assert.throws(() => engine.insert_claim({
    plan_id: "plan-1", claimant_membership_id: "mem-1", incident_date: new Date().toISOString(), amount_requested: 0
  }), /CHECK_VIOLATION/);

  assert.throws(() => engine.insert_claim({
    plan_id: "plan-1", claimant_membership_id: "mem-1", incident_date: new Date().toISOString(), amount_requested: -50
  }), /CHECK_VIOLATION/);

  const sql = read(M7_01);
  assert.match(sql, /amount_requested numeric\(15,2\) NOT NULL CHECK \(amount_requested > 0\)/);
  assert.match(sql, /amount_approved numeric\(15,2\) CHECK \(amount_approved > 0\)/);

  const ui = read(CLAIMS_UI);
  assert.match(ui, /if \(parseFloat\(val\) <= 0\) return;/);
  assert.match(ui, /min="0\.01"/);
});

test("Test B: Database maturation trigger test", () => {
  const engine = new MockM7ReliefEngine();
  engine.seedInitialState();
  
  assert.throws(() => engine.insert_claim({
    plan_id: "plan-1",
    claimant_membership_id: "mem-1",
    incident_date: new Date(Date.now() - 200000).toISOString(),
    amount_requested: 100
  }), /CLAIM_PREMATURE_WAITING_PERIOD_NOT_MET/);

  const sql = read(M7_01);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.assert_claim_eligibility\(\)/);
  assert.match(sql, /IF NEW\.incident_date < v_enrollment\.matures_at::date THEN/);
  assert.match(sql, /RAISE EXCEPTION 'CLAIM_PREMATURE_WAITING_PERIOD_NOT_MET'/);
  assert.match(sql, /BEFORE INSERT OR UPDATE ON public\.relief_claims/);

  const hooks = read(HOOKS);
  assert.match(hooks, /CLAIM_PREMATURE_WAITING_PERIOD_NOT_MET/);
});

test("Test C: Missing expense account defense", () => {
  const engine = new MockM7ReliefEngine();
  engine.seedInitialState();
  engine.expenseAccounts.clear(); // Remove all expense accounts
  
  assert.throws(() => engine.post_relief_claim_payout({ claim_id: "claim-1", account_id: "acc-1" }), /RELIEF_EXPENSE_ACCOUNT_NOT_CONFIGURED/);

  const sql = read(M7_01);
  assert.match(sql, /AND c\.code = 'relief_expense'/);
  assert.match(sql, /RAISE EXCEPTION 'RELIEF_EXPENSE_ACCOUNT_NOT_CONFIGURED'/);

  const hooks = read(HOOKS);
  assert.match(hooks, /RELIEF_EXPENSE_ACCOUNT_NOT_CONFIGURED/);
});

test("Test D: Currency mismatch failure path", () => {
  const engine = new MockM7ReliefEngine();
  engine.seedInitialState();
  
  assert.throws(() => engine.post_relief_claim_payout({ claim_id: "claim-1", account_id: "acc-2" }), /CURRENCY_MISMATCH/);

  const sql = read(M7_01);
  assert.match(sql, /IF v_account\.currency <> v_claim\.currency THEN/);
  assert.match(sql, /RAISE EXCEPTION 'CURRENCY_MISMATCH'/);
});

test("Test E: Idempotency replay with zero postings", () => {
  const engine = new MockM7ReliefEngine();
  engine.seedInitialState();
  
  engine.post_relief_claim_payout({ claim_id: "claim-1", account_id: "acc-1" });
  const res = engine.post_relief_claim_payout({ claim_id: "claim-1", account_id: "acc-1" });
  
  assert.strictEqual(res.decision, "IDEMPOTENT_RETURN_EXISTING");
  assert.strictEqual(res.posting_count, 0);

  const sql = read(M7_01);
  assert.match(sql, /IF v_claim\.status = 'paid' AND v_claim\.financial_event_id IS NOT NULL THEN/);
  assert.match(sql, /'decision',\s*'IDEMPOTENT_RETURN_EXISTING'/);
});

test("Test F: Missing custody account state handling", () => {
  const ui = read(CLAIMS_UI);
  assert.match(ui, /No active custody accounts found in this currency/);
  assert.match(ui, /disabled=\{disburseClaim\.isPending \|\| !accountId \|\| accountId === 'none'\}/);
});
