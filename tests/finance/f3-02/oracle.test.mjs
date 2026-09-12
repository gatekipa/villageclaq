import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { evaluateCommand, SemanticError, CURRENCY_SCALE, EFFECTS, VERSION,
  canonicalBytes, fingerprint, normalizeAmount, normalizeTimestamp, uuid as canonicalUuid } from "./oracle.mjs";
import { ID, uuid, fixtureContext, moneyIn, transfer, opening, privateOpening,
  validVectors, negativeVectors, capabilityVectors } from "./vectors.mjs";
import { replayVectors } from "./replay-vectors.mjs";

const golden = JSON.parse(readFileSync(new URL("./canonical-golden.json", import.meta.url), "utf8"));
// Independent test arithmetic: literal decimal expectations -> BigInt minor units.
// There is no shared runtime money module or production import.
const units = (amount) => BigInt(amount.replace(".", ""));
function decimal(amount, scale) {
  const negative = amount < 0n;
  const digits = (negative ? -amount : amount).toString().padStart(scale + 1, "0");
  return (negative ? "-" : "") + (scale ? digits.slice(0, -scale) + "." + digits.slice(-scale) : digits);
}
function effects(postings) {
  const scale = postings[0].currency === "XAF" ? 0 : 2;
  assert.equal(new Set(postings.map((p) => p.currency)).size, 1);
  const sum = (kind) => postings.filter((p) => p.control_class === kind)
    .reduce((total, p) => total + units(p.amount_signed), 0n);
  return {
    soa_income: decimal(-sum("income"), scale), soa_expense: decimal(sum("expense"), scale),
    cash: decimal(sum("custody"), scale),
  };
}
function assertEconomicSet(actual, expected) {
  assert.equal(actual.length, 2);
  assert.deepEqual(actual, expected.postings); // all signs/classes/dimensions and order
  assert.equal(actual.reduce((total, p) => total + units(p.amount_signed), 0n), 0n);
  assert.equal(new Set(actual.map((p) => p.fund_id)).size, 1);
  assert.deepEqual(effects(actual), {
    soa_income: expected.soa_income, soa_expense: expected.soa_expense, cash: expected.cash,
  });
}
function checkError(fn, code) {
  assert.throws(fn, (error) => error instanceof SemanticError && error.code === code);
}
for (const vector of validVectors) {
  test("valid: " + vector.name, () => {
    const context = fixtureContext(); vector.setup?.(context);
    const snapshot = structuredClone({ input: vector.input, context });
    const result = evaluateCommand(vector.input, context);
    assert.equal(result.decision, "READY");
    assert.equal(result.new_event_count, 1); assert.equal(result.new_posting_count, 2);
    assert.equal(result.recognition, vector.recognition);
    assertEconomicSet(result.postings, vector.expected);
    assert.deepEqual({ input: vector.input, context }, snapshot);
    assert.deepEqual(evaluateCommand(vector.input, context), result);
  });
}
for (const vector of negativeVectors) {
  test("negative: " + vector.name, () => {
    const context = fixtureContext(); vector.setup?.(context);
    const snapshot = structuredClone(context);
    checkError(() => evaluateCommand(vector.input, context), vector.code);
    assert.deepEqual(context, snapshot);
  });
}
for (const vector of replayVectors) {
  test("replay: " + vector.name, () => {
    const context = fixtureContext(); vector.initialSetup?.(context);
    const original = evaluateCommand(vector.original, context);
    context.existing = [{
      event_id: ID.event, payload: original.payload, fingerprint: original.fingerprint,
    }];
    vector.setup?.(context);
    const snapshot = structuredClone(context);
    if (vector.code) {
      checkError(() => evaluateCommand(vector.retry, context), vector.code);
    } else {
      const result = evaluateCommand(vector.retry, context);
      assert.equal(result.decision, vector.decision);
      if (result.decision === "IDEMPOTENT_RETURN_EXISTING") {
        assert.equal(result.event_id, ID.event);
        assert.equal(result.ledger_epoch_id, original.payload.ledger_epoch_id);
        assert.equal(result.fingerprint, original.fingerprint);
        assert.equal(result.new_event_count, 0); assert.equal(result.new_posting_count, 0);
        assert.equal(Object.hasOwn(result, "postings"), false);
      } else {
        assert.equal(result.new_event_count, 1); assert.equal(result.postings.length, 2);
      }
    }
    assert.deepEqual(context, snapshot);
  });
}
for (const vector of validVectors.slice(0, 4)) {
  test("recognition: " + vector.name, () => {
    const context = fixtureContext(); vector.setup?.(context);
    const result = evaluateCommand(vector.input, context);
    assert.equal(result.recognition, vector.recognition);
    assert.deepEqual(effects(result.postings), {
      soa_income: vector.expected.soa_income, soa_expense: vector.expected.soa_expense, cash: vector.expected.cash,
    });
    assert.equal(result.postings.some((p) => ["receivable", "liability"].includes(p.control_class)), false);
  });
}
for (const vector of capabilityVectors) {
  test("recognition capability only: " + vector.name, () => {
    assertEconomicSet(vector.expected.postings, vector.expected);
    assert.equal(effects(vector.expected.postings).soa_income, "0.00");
    assert.equal(effects(vector.expected.postings).soa_expense, "0.00");
    assert.equal(Object.values(EFFECTS).some((e) => e.effect_kind === vector.name), false);
  });
}
for (const vector of golden) {
  test("canonical golden: " + vector.name, () => {
    const context = fixtureContext();
    if (vector.input.action === "opening") privateOpening(context);
    const result = evaluateCommand(vector.input, context);
    assert.deepEqual(result.payload, vector.payload);
    assert.equal(result.canonical_bytes, vector.canonical_bytes);
    assert.equal(result.fingerprint, vector.sha256);
    assert.equal(fingerprint(Object.fromEntries(Object.entries(vector.payload).reverse())), vector.sha256);
  });
}
test("canonical equivalent decimal representations and optional nulls", () => {
  const baseline = evaluateCommand(moneyIn(), fixtureContext());
  for (const amount of ["500", "500.0", "500.00", "00500.00"]) {
    const input = moneyIn({ amount, member_id: null, project_id: undefined, destination_account_id: null });
    assert.equal(evaluateCommand(input, fixtureContext()).fingerprint, baseline.fingerprint);
  }
});
test("canonical UUIDs use lowercase in complete economic payload", () => {
  const group = "abcdefab-abcd-4abc-8abc-abcdefabcdef";
  const request = "abcdefab-abcd-4abc-8abc-abcdefabcdea";
  const context = fixtureContext();
  for (const table of ["epochs", "accounts", "funds", "categories"]) {
    for (const row of context[table]) if (row.group_id === ID.group) row.group_id = group;
  }
  const lower = evaluateCommand(moneyIn({ group_id: group, request_id: request }), context);
  const upper = evaluateCommand(moneyIn({ group_id: group.toUpperCase(), request_id: request.toUpperCase() }), context);
  assert.deepEqual(upper, lower);
  assert.equal(upper.payload.source_record_id, request);
  assert.equal(canonicalUuid(request.toUpperCase()), request);
});
test("all canonical economic fields affect the fingerprint", () => {
  const p = golden[0].payload;
  for (const field of Object.keys(p)) {
    assert.notEqual(fingerprint({ ...p, [field]: p[field] === null ? ID.member : p[field] + "x" }), golden[0].sha256, field);
  }
  assert.equal(Object.keys(p).length, 18);
  assert.equal(p.contract_version, VERSION);
  assert.equal(canonicalBytes(p), golden[0].canonical_bytes);
});
test("non-economic narrative/reference/evidence do not change fingerprint", () => {
  const base = evaluateCommand(moneyIn(), fixtureContext());
  const changed = evaluateCommand(moneyIn({
    description: "A donation with more explanation",
    reference_metadata: { reference: "Paper receipt 25", evidence_ids: [uuid(777)] },
  }), fixtureContext());
  assert.deepEqual(changed.payload, base.payload);
  assert.equal(changed.fingerprint, base.fingerprint);
});
test("resolved General fund matches explicit General fund", () => {
  const implicit = evaluateCommand(moneyIn({ fund_id: undefined, currency: null }), fixtureContext());
  const explicit = evaluateCommand(moneyIn({ fund_id: ID.general }), fixtureContext());
  assert.equal(implicit.fingerprint, explicit.fingerprint);
  assert.equal(implicit.payload.fund_id, ID.general);
});
test("timestamps preserve microseconds and calendar instants", () => {
  assert.equal(normalizeTimestamp("2024-02-29T01:30:00.123456+01:30"), "2024-02-29T00:00:00.123456Z");
  assert.equal(normalizeTimestamp("2026-01-01T00:30:00+01:00"), "2025-12-31T23:30:00.000000Z");
  assert.equal(normalizeTimestamp("0001-01-01T00:00:00Z"), "0001-01-01T00:00:00.000000Z");
  for (const value of ["2025-02-29T00:00:00Z", "0000-01-01T00:00:00Z", "2026-09-08T24:00:00Z"]) {
    checkError(() => normalizeTimestamp(value), "INVALID_OCCURRED_AT");
  }
});
test("supported precision catalog matches frozen F3-01 SQL", () => {
  const sql = readFileSync(new URL("../../../supabase/migrations/00119_f3_01_core_ledger_foundation.sql", import.meta.url), "utf8");
  const catalog = Object.fromEntries([...sql.matchAll(/WHEN '([A-Z]{3})' THEN ([02])/g)]
    .map((m) => [m[1], Number(m[2])]));
  assert.deepEqual(CURRENCY_SCALE, catalog);
  for (const [code, scale] of Object.entries(catalog)) {
    assert.equal(normalizeAmount("500", code), scale === 0 ? "500" : "500.00");
    checkError(() => normalizeAmount(scale === 0 ? "500.1" : "500.001", code), "AMOUNT_PRECISION");
  }
});
test("new backdated occurrence uses its period even after currency transition", () => {
  const context = fixtureContext();
  context.epochs[0].effective_to = "2026-10-01T00:00:00Z";
  context.epochs.push({ id: ID.futureEpoch, group_id: ID.group, currency: "XAF",
    effective_from: "2026-10-01T00:00:00Z", effective_to: null });
  assert.equal(evaluateCommand(moneyIn(), context).payload.ledger_epoch_id, ID.epoch);
  checkError(() => evaluateCommand(moneyIn({ occurred_at: "2026-10-01T00:00:00Z" }), context), "EPOCH_CURRENCY_MISMATCH");
});
test("same-currency older account may serve a later compatible epoch", () => {
  const context = fixtureContext();
  context.epochs[0].effective_to = "2026-09-01T00:00:00Z";
  context.epochs.push({ id: ID.futureEpoch, group_id: ID.group, currency: "USD",
    effective_from: "2026-09-01T00:00:00Z", effective_to: null });
  assert.equal(evaluateCommand(transfer(), context).payload.ledger_epoch_id, ID.futureEpoch);
});
test("closure detects third lines and later balanced pairs", () => {
  const vector = validVectors[0], result = evaluateCommand(vector.input, fixtureContext());
  assert.throws(() => assertEconomicSet([...result.postings, result.postings[0]], vector.expected));
  assert.throws(() => assertEconomicSet([...result.postings, ...result.postings], vector.expected));
  checkError(() => evaluateCommand({ ...vector.input, postings: result.postings }, fixtureContext()), "UNSUPPORTED_FIELD");
});
test("USD foundation before correction: Bank 9300 Cash 1000 Total 10300 Income 500 Expense 200", () => {
  const postings = [3, 0, 1, 2].flatMap((index) => {
    const vector = validVectors[index], context = fixtureContext(); vector.setup?.(context);
    return evaluateCommand(vector.input, context).postings;
  });
  const sumAccount = (account) => decimal(postings.filter((p) => p.account_id === account)
    .reduce((sum, p) => sum + units(p.amount_signed), 0n), 2);
  const sumFundCash = (fund) => decimal(postings.filter((p) => p.control_class === "custody" && p.fund_id === fund)
    .reduce((sum, p) => sum + units(p.amount_signed), 0n), 2);
  assert.equal(sumAccount(ID.bank), "9300.00");
  assert.equal(sumAccount(ID.cash), "1000.00");
  assert.deepEqual(effects(postings), { cash: "10300.00", soa_income: "500.00", soa_expense: "200.00" });
  assert.equal(sumFundCash(ID.general), "10000.00");
  assert.equal(sumFundCash(ID.restricted), "300.00");
  assert.equal(postings.length, 8);
});
function openingAllocationFixture(total, amounts) {
  // Test-only assertion on a proposed allocation, not an opening command/workflow.
  if (amounts.reduce((sum, amount) => sum + units(amount), 0n) !== units(total)) {
    throw new Error("OPENING_ALLOCATION_TOTAL_MISMATCH");
  }
}
test("opening allocation: 8000 General plus 2000 Restricted is 10000 custody, zero SoA", () => {
  openingAllocationFixture("10000.00", ["8000.00", "2000.00"]);
  const postings = ["8000.00", "2000.00"].flatMap((amount, i) => {
    const context = fixtureContext(); privateOpening(context);
    context.opening_occurrence.occurrence_id = uuid(710 + i);
    return evaluateCommand(opening({ amount, fund_id: i ? ID.restricted : ID.general }), context).postings;
  });
  assert.equal(postings.length, 4);
  assert.deepEqual(effects(postings), { cash: "10000.00", soa_income: "0.00", soa_expense: "0.00" });
  assert.equal(postings.filter((p) => p.control_class === "custody" && p.fund_id === ID.general)[0].amount_signed, "8000.00");
  assert.equal(postings.filter((p) => p.control_class === "custody" && p.fund_id === ID.restricted)[0].amount_signed, "2000.00");
});
test("opening allocation: full 10000 plus 2000 attribution would duplicate custody", () => {
  assert.throws(() => openingAllocationFixture("10000.00", ["10000.00", "2000.00"]), {
    message: "OPENING_ALLOCATION_TOTAL_MISMATCH",
  });
});
test("authorization denial precedes any historical lookup", () => {
  const context = fixtureContext(); context.authorized = false;
  Object.defineProperty(context, "existing", { get() { assert.fail("sensitive history was accessed"); } });
  checkError(() => evaluateCommand(moneyIn(), context), "DENY");
});
test("initial effect vocabulary is exactly the bounded server template set", () => {
  assert.deepEqual(Object.values(EFFECTS).map((e) => e.effect_kind), [
    "manual_income", "manual_expense", "account_transfer", "opening_custody",
  ]);
  for (const action of ["dues", "fines", "loans", "relief", "projects", "njangi", "refund", "adjustment"]) {
    checkError(() => evaluateCommand(moneyIn({ action }), fixtureContext()), "EFFECT_NOT_ALLOWED");
  }
});
test("fixture counts for serialized handoff", (t) => {
  t.diagnostic(JSON.stringify({
    valid: validVectors.length, negative: negativeVectors.length, replay: replayVectors.length,
    recognition: 4 + capabilityVectors.length, canonical_golden: golden.length,
  }));
});
