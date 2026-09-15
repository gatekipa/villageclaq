// Direct unit proofs for the F3 SoA income allowlist.
// Isolated from posting SQL. No production URL. No enqueue.
import assert from "node:assert/strict";
import test from "node:test";
import {
  F3_CONTRACT_VERSION,
  F3_RECOGNIZED_SOA_INCOME_EFFECT_KINDS,
  isRecognizedSoaIncome,
} from "../../../src/lib/financial-f3-recognition.ts";
import { evaluateCommand, EFFECTS } from "../f3-02/oracle.mjs";
import { fixtureContext, moneyIn, moneyOut, transfer, opening, privateOpening, ID } from "../f3-02/vectors.mjs";
import { evaluateCorrection, economicFromPosting } from "../f3-04/correction-oracle.mjs";
import { context as correctionContext, command as correctionCommand, ID as CID, JAN, ORIGINAL_ACTOR, uuid as correctionUuid } from "../f3-04/correction-vectors.mjs";

const MATRIX = [
  { input: "manual_income", expected: true },
  { input: "manual_expense", expected: false },
  { input: "account_transfer", expected: false },
  { input: "opening_custody", expected: false },
  { input: "correction_reversal", expected: false },
  { input: "correction_replacement", expected: false },
  { input: "dues_allocation", expected: false },
  { input: "loan_principal_repayment", expected: false },
  { input: "relief_remittance", expected: false },
  { input: "future_income_v2", expected: false },
  { input: "pending", expected: false },
  { input: "rejected", expected: false },
  { input: "voided", expected: false },
  { input: "relief_misapplied", expected: false },
  { input: "dues_assessment", expected: false },
  { input: "opening_arrears", expected: false },
  { input: "refundable_deposit", expected: false },
  { input: "njangi_contribution", expected: false },
  { input: "unconfirmed", expected: false },
  { input: "", expected: false },
  { input: " ", expected: false },
  { input: "   ", expected: false },
  { input: "\t", expected: false },
  { input: "\n", expected: false },
  { input: " \t\n ", expected: false },
  { input: "manual_income ", expected: false },
  { input: " manual_income", expected: false },
  { input: "manual_income\n", expected: false },
  { input: "MANUAL_INCOME", expected: false },
  { input: "Manual_Income", expected: false },
  { input: "manual-income", expected: false },
  { input: "manual_income\0", expected: false },
  { input: "not_a_real_effect", expected: false },
  { input: "arbitrary_unknown", expected: false },
];

test("allowlist is exactly manual_income", () => {
  assert.deepEqual([...F3_RECOGNIZED_SOA_INCOME_EFFECT_KINDS], ["manual_income"]);
  assert.equal(F3_RECOGNIZED_SOA_INCOME_EFFECT_KINDS.length, 1);
  assert.equal(F3_CONTRACT_VERSION, "f3-posting-v1");
});

for (const row of MATRIX) {
  test("isRecognizedSoaIncome(" + JSON.stringify(row.input) + ") → " + row.expected, () => {
    assert.equal(isRecognizedSoaIncome(row.input), row.expected);
  });
}

test("malformed non-strings fail closed", () => {
  for (const value of [undefined, null, 0, 1, true, false, {}, [], Symbol("manual_income")]) {
    assert.equal(isRecognizedSoaIncome(value), false, String(value));
  }
});

test("F3-02 oracle effect kinds bind to the allowlist", () => {
  assert.equal(EFFECTS.money_in.effect_kind, "manual_income");
  assert.equal(EFFECTS.money_in.recognition, "operating_income");
  assert.equal(isRecognizedSoaIncome(EFFECTS.money_in.effect_kind), true);
  assert.equal(isRecognizedSoaIncome(EFFECTS.money_out.effect_kind), false);
  assert.equal(isRecognizedSoaIncome(EFFECTS.transfer.effect_kind), false);
  assert.equal(isRecognizedSoaIncome(EFFECTS.opening.effect_kind), false);
});

test("posted F3-02 commands: only money_in is recognized SoA income", () => {
  const income = evaluateCommand(moneyIn(), fixtureContext());
  assert.equal(income.recognition, "operating_income");
  assert.equal(isRecognizedSoaIncome(income.payload.effect_kind), true);

  const expense = evaluateCommand(moneyOut(), fixtureContext());
  assert.equal(expense.recognition, "operating_expense");
  assert.equal(isRecognizedSoaIncome(expense.payload.effect_kind), false);

  const xfer = evaluateCommand(transfer(), fixtureContext());
  assert.equal(xfer.recognition, "neither");
  assert.equal(isRecognizedSoaIncome(xfer.payload.effect_kind), false);

  const ctx = fixtureContext();
  privateOpening(ctx);
  const open = evaluateCommand(opening(), ctx);
  assert.equal(open.recognition, "neither");
  assert.equal(isRecognizedSoaIncome(open.payload.effect_kind), false);
});

test("identical money_in retry keeps allowlisted effect_kind and does not invent income", () => {
  const context = fixtureContext();
  const original = evaluateCommand(moneyIn(), context);
  context.existing = [{
    event_id: ID.event, payload: original.payload, fingerprint: original.fingerprint,
  }];
  const retry = evaluateCommand(moneyIn(), context);
  assert.equal(retry.decision, "IDEMPOTENT_RETURN_EXISTING");
  assert.equal(retry.new_event_count, 0);
  assert.equal(Object.hasOwn(retry, "recognition"), false);
  assert.equal(isRecognizedSoaIncome(original.payload.effect_kind), true);
  assert.equal(isRecognizedSoaIncome("future_income_v2"), false);
});

test("F3-04 reversal/replacement are not SoA income; identical retry keeps that claim", () => {
  const c = correctionContext();
  const original = evaluateCommand(moneyIn({ occurred_at: JAN }), c);
  const p = original.payload;
  const target = {
    id: CID.event, group_id: p.group_id, ledger_epoch_id: p.ledger_epoch_id, currency: p.currency,
    event_class: p.event_class, effect_kind: p.effect_kind, source_module: p.source_module,
    source_record_id: p.source_record_id, request_id: p.request_id,
    economic: economicFromPosting(p), economic_payload_fingerprint: original.fingerprint,
    occurred_at: p.occurred_at, posted_at: JAN, created_at: JAN, created_by: ORIGINAL_ACTOR,
    status: "posted", reversal_of_event_id: null, replacement_event_id: null,
    correction_reason: null, corrected_at: null, description: "Original narrative",
    reference_metadata: { reference: "Original reference" },
    postings: original.postings.map((row, i) => ({ ...row, id: correctionUuid(2001 + i), event_id: CID.event })),
  };
  c.events = [target];
  c.manual_occurrences = [{ event_id: target.id, payload: p, fingerprint: original.fingerprint }];
  const cmd = correctionCommand({ replacement: { amount: "450" } });
  const plan = evaluateCorrection(cmd, c);
  assert.equal(isRecognizedSoaIncome(target.effect_kind), true);
  assert.equal(plan.result.reversal.effect_kind, "correction_reversal");
  assert.equal(isRecognizedSoaIncome(plan.result.reversal.effect_kind), false);
  assert.equal(plan.result.replacement.effect_kind, "correction_replacement");
  assert.equal(isRecognizedSoaIncome(plan.result.replacement.effect_kind), false);

  const next = structuredClone(c);
  Object.assign(next.events.find((e) => e.id === plan.result.target_event_id), plan.result.target_update);
  next.events.push(structuredClone(plan.result.reversal), structuredClone(plan.result.replacement));
  next.completed.push({
    payload: plan.payload, fingerprint: plan.fingerprint,
    target_snapshot: plan.target_snapshot, result: structuredClone(plan.result),
  });
  const retry = evaluateCorrection(cmd, next);
  assert.equal(retry.decision, "IDEMPOTENT_RETURN_EXISTING");
  assert.equal(retry.new_event_count, 0);
  assert.equal(isRecognizedSoaIncome(retry.result.reversal.effect_kind), false);
  assert.equal(isRecognizedSoaIncome(retry.result.replacement.effect_kind), false);
  assert.equal(isRecognizedSoaIncome(target.effect_kind), true);
});
