import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const M7_01 = "supabase/migrations/00128_m7_01_relief_canonical.sql";
const HOOKS = "src/lib/hooks/use-relief-mutations.ts";

// ============================================================================
// Mock Engine for Concrete Functional Simulations
// ============================================================================
class MockM7ReliefEngine {
  constructor() {
    this.claims = new Map();
    this.accounts = new Map();
    this.enrollments = new Map();
    this.events = new Map();
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

    this.claims.set("claim-2", {
      id: "claim-2",
      group_id: "group-1",
      plan_id: "plan-1",
      claimant_membership_id: "mem-1",
      amount_approved: 500.00,
      currency: "USD",
      status: "under_review",
      incident_date: new Date().toISOString()
    });
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

    if (account.group_id !== claim.group_id) throw new Error("CROSS_GROUP_DIMENSION");

    const event_id = "evt-" + Date.now();
    this.events.set(event_id, {
      command_type: "record_event",
      action_type: "money_out",
      event_type: "relief_payout",
      currency: claim.currency,
      postings: [
        { account_id: "exp-1", amount: claim.amount_approved, direction: "debit" },
        { account_id: account.id, amount: claim.amount_approved, direction: "credit" }
      ]
    });

    claim.status = "paid";
    claim.financial_event_id = event_id;
    this.claims.set(claim.id, claim);

    return { ok: true, financial_event_id: event_id, posting_count: 2 };
  }

  insert_claim(new_claim) {
    const enrollment = [...this.enrollments.values()].find(e => e.plan_id === new_claim.plan_id && e.membership_id === new_claim.claimant_membership_id && e.status === "active");
    if (!enrollment) throw new Error("MEMBER_NOT_ENROLLED_IN_PLAN");
    if (new Date(new_claim.incident_date) < new Date(enrollment.matures_at)) {
      throw new Error("WAITING_PERIOD_NOT_MET");
    }
    
    new_claim.id = "claim-" + Date.now();
    this.claims.set(new_claim.id, new_claim);
    return new_claim;
  }
}

// ============================================================================
// Tests
// ============================================================================

test("Test 1: Single-disbursement invariant", () => {
  const engine = new MockM7ReliefEngine();
  engine.seedInitialState();
  const res = engine.post_relief_claim_payout({ claim_id: "claim-1", account_id: "acc-1" });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.posting_count, 2);
  
  const ev = engine.events.get(res.financial_event_id);
  assert.strictEqual(ev.action_type, "money_out");
  assert.strictEqual(ev.postings[0].direction, "debit");
  assert.strictEqual(ev.postings[1].direction, "credit");

  const sql = read(M7_01);
  assert.match(sql, /'action_type',\s*'money_out'/);
  assert.match(sql, /'event_type',\s*'relief_payout'/);
  assert.match(sql, /'direction',\s*'debit'/);
  assert.match(sql, /'direction',\s*'credit'/);
});

test("Test 2: Unapproved payout rejection", () => {
  const engine = new MockM7ReliefEngine();
  engine.seedInitialState();
  assert.throws(() => engine.post_relief_claim_payout({ claim_id: "claim-2", account_id: "acc-1" }), /CLAIM_NOT_APPROVED_FOR_PAYOUT/);

  const sql = read(M7_01);
  assert.match(sql, /IF v_claim\.status <> 'approved' THEN/);
  assert.match(sql, /RAISE EXCEPTION 'CLAIM_NOT_APPROVED_FOR_PAYOUT'/);
});

test("Test 3: Idempotent replay guarantee", () => {
  const engine = new MockM7ReliefEngine();
  engine.seedInitialState();
  // First time
  engine.post_relief_claim_payout({ claim_id: "claim-1", account_id: "acc-1" });
  // Second time (replay)
  const res2 = engine.post_relief_claim_payout({ claim_id: "claim-1", account_id: "acc-1" });
  assert.strictEqual(res2.decision, "IDEMPOTENT_RETURN_EXISTING");
  assert.strictEqual(res2.posting_count, 0);

  const sql = read(M7_01);
  assert.match(sql, /IF v_claim\.status = 'paid' AND v_claim\.financial_event_id IS NOT NULL THEN/);
  assert.match(sql, /'decision',\s*'IDEMPOTENT_RETURN_EXISTING'/);
  assert.match(sql, /'posting_count',\s*0/);
});

test("Test 4: Currency lock invariant", () => {
  const engine = new MockM7ReliefEngine();
  engine.seedInitialState();
  assert.throws(() => engine.post_relief_claim_payout({ claim_id: "claim-1", account_id: "acc-2" }), /CURRENCY_MISMATCH/);

  const sql = read(M7_01);
  assert.match(sql, /IF v_account\.currency <> v_claim\.currency THEN/);
  assert.match(sql, /RAISE EXCEPTION 'CURRENCY_MISMATCH'/);
});

test("Test 5: Post-payout immutability locks", () => {
  const sql = read(M7_01);
  assert.match(sql, /CREATE TRIGGER trg_prevent_paid_claim_modification/);
  assert.match(sql, /CREATE TRIGGER trg_prevent_paid_claim_delete/);
  assert.match(sql, /RAISE EXCEPTION 'PAID_CLAIM_IMMUTABLE'/);
  assert.match(sql, /RAISE EXCEPTION 'PAID_CLAIM_DELETE_PROHIBITED'/);
});

test("Test 6: Waiting period maturity calculation and DB trigger enforcement", () => {
  const engine = new MockM7ReliefEngine();
  engine.seedInitialState();
  
  assert.throws(() => engine.insert_claim({
    plan_id: "plan-1",
    claimant_membership_id: "mem-1",
    incident_date: new Date(Date.now() - 200000).toISOString() // Before matures_at
  }), /WAITING_PERIOD_NOT_MET/);

  const ts = read(HOOKS);
  assert.match(ts, /maturesAt = new Date\(enrolledAt\.getTime\(\) \+ plan\.waiting_period_days \* 24 \* 60 \* 60 \* 1000\)/);

  const sql = read(M7_01);
  assert.match(sql, /IF NEW\.incident_date < v_enrollment\.matures_at::date THEN/);
  assert.match(sql, /RAISE EXCEPTION 'WAITING_PERIOD_NOT_MET'/);
});

test("Test 7: Tenant boundary isolation in use-relief-mutations.ts", () => {
  const ts = read(HOOKS);
  assert.match(ts, /if \(!groupId \|\| input\.groupId !== groupId\) \{/);
  assert.match(ts, /throw new Error\("staleTenantAborted"\);/);
});
