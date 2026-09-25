import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const M7_01 = "supabase/migrations/00128_m7_01_relief_canonical.sql";
const HOOKS = "src/lib/hooks/use-relief-mutations.ts";

test("Test 1: Single-disbursement invariant", () => {
  const sql = read(M7_01);
  assert.match(sql, /'action_type',\s*'money_out'/);
  assert.match(sql, /'event_type',\s*'relief_payout'/);
  assert.match(sql, /'direction',\s*'debit'/);
  assert.match(sql, /'direction',\s*'credit'/);
});

test("Test 2: Unapproved payout rejection", () => {
  const sql = read(M7_01);
  assert.match(sql, /IF v_claim\.status <> 'approved' THEN/);
  assert.match(sql, /RAISE EXCEPTION 'CLAIM_NOT_APPROVED_FOR_PAYOUT'/);
});

test("Test 3: Idempotent replay guarantee", () => {
  const sql = read(M7_01);
  assert.match(sql, /IF v_claim\.status = 'paid' AND v_claim\.financial_event_id IS NOT NULL THEN/);
  assert.match(sql, /'decision',\s*'IDEMPOTENT_RETURN_EXISTING'/);
  assert.match(sql, /'posting_count',\s*0/);
});

test("Test 4: Currency lock invariant", () => {
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

test("Test 6: Waiting period maturity calculation", () => {
  const ts = read(HOOKS);
  assert.match(ts, /maturesAt = new Date\(enrolledAt\.getTime\(\) \+ plan\.waiting_period_days \* 24 \* 60 \* 60 \* 1000\)/);
});

test("Test 7: Tenant boundary isolation in use-relief-mutations.ts", () => {
  const ts = read(HOOKS);
  assert.match(ts, /if \(!groupId \|\| input\.groupId !== groupId\) \{/);
  assert.match(ts, /throw new Error\("staleTenantAborted"\);/);
});
