import test from "node:test";
import assert from "node:assert/strict";
import { project, cashbookPage, decimal, minorUnits } from "./projection-oracle.mjs";
import { normalizeTimestamp, evaluateCommand } from "../f3-02/oracle.mjs";
import { validVectors as postingVectors, fixtureContext } from "../f3-02/vectors.mjs";
import { ID, T, QUERY, eventId, postingId, event, snapshot, foundation, correction, xaf, combine,
  validVectors, antiPatternNames } from "./projection-vectors.mjs";

const names = new Map(Object.entries(ID).map(([name, value]) => [value, name]));
const name = (value) => value === null ? null : names.get(value) ?? value;
const ref = (value) => { const n = Number(value.slice(-12)) - 10000; return `${Math.floor(n / 10)}:${n % 10}`; };
const ordered = (rows) => rows.toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), "en"));
const population = (ids) => ids.map(ref).sort();
const rows = (source, dims) => ordered(source.map((r) => [...dims.map((d) => name(r[d])), r.amount, population(r._posting_ids)]));
const bookRow = (r) => [ref(r.posting_id), r.currency, name(r.account_id), name(r.fund_id), name(r.member_id), name(r.project_id),
  r.amount_signed, r.running_balance, r.movement_type, r.category_contexts.map((c) => name(c.category_id)), r.control_classes];
function compact(result) {
  return { accounts: rows(result.account_balance, ["account_id", "currency"]), funds: rows(result.fund_cash, ["fund_id", "currency"]),
    position: rows(result.fund_net_position, ["fund_id", "currency"]), org: rows(result.organization_custody, ["currency"]),
    income: rows(result.income, ["currency", "category_id", "category_class", "fund_id", "member_id", "project_id"]),
    expense: rows(result.expense, ["currency", "category_id", "category_class", "fund_id", "member_id", "project_id"]),
    soa: ordered(result.soa.map((r) => [r.currency, r.income, r.expense, r.operating_result, population(r._posting_ids)])),
    book: result.cashbook.map(bookRow), included: population(result._population.committed),
    balances: population(result._population.balances), activity: population(result._population.activity) };
}
function expected(golden) {
  const result = structuredClone(golden);
  for (const k of ["accounts", "funds", "position", "org", "income", "expense", "soa"]) {
    result[k].forEach((row) => row.at(-1).sort()); result[k] = ordered(result[k]);
  }
  for (const k of ["included", "balances", "activity"]) result[k].sort();
  return result;
}
// Independent minor-unit checker for the two fixture currencies. Never Number money.
function units(text, currency) {
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = (negative ? text.slice(1) : text).split(".");
  const value = currency === "XAF" ? BigInt(whole) : BigInt(whole) * 100n + BigInt(fraction.slice(0, 2).padEnd(2, "0"));
  return negative ? -value : value;
}
const sum = (rows, field = "amount_signed") => rows.reduce((s, r) => s + units(r[field], r.currency), 0n);
const amount = (result, projection, dimension, value) => result[projection].find((r) => r[dimension] === value).amount;
const run = (s = foundation(), q = QUERY) => project(s, q);
const income = (s) => run(s).soa[0].income;

for (const vector of validVectors) test(`valid: ${vector.name}`, () => {
  const original = structuredClone(vector.snapshot);
  const r = project(vector.snapshot, vector.query);
  assert.deepEqual(compact(r), expected(vector.expected)); // ALL projections, exact grains/dimensions/populations/amounts
  assert.deepEqual(vector.snapshot, original, "oracle must not modify its snapshot");
  assert.equal(r.contract_version, "f3-projection-v1");
  assert.deepEqual(r.grains, {
    account_balance: "group/account/currency", fund_cash: "group/fund/currency", fund_net_position: "group/fund/currency",
    organization_custody: "group/currency", income: "group/period/currency/category/fund/member/project",
    expense: "group/period/currency/category/fund/member/project", soa: "group/period/currency",
    cash_movement: "group/custody-posting", cashbook: "group/custody-posting",
  });
  assert.deepEqual(r.query, { group_id: vector.query.group_id, from: normalizeTimestamp(vector.query.from),
    to: normalizeTimestamp(vector.query.to), as_of_exclusive: vector.query.as_of_exclusive == null ? null : normalizeTimestamp(vector.query.as_of_exclusive) });
  assert.equal(r.snapshot_id, vector.snapshot.snapshot_id);
  assert.equal(r.observed_at, normalizeTimestamp(vector.snapshot.observed_at));
  for (const projection of ["account_balance", "fund_cash", "fund_net_position", "organization_custody", "income", "expense", "soa"]) {
    for (const row of r[projection]) {
      assert.equal(row.group_id, vector.query.group_id);
      assert.ok(["USD", "XAF"].includes(row.currency));
    }
  }
  // One custody posting -> one cash movement row; enrichment cannot fan out.
  assert.deepEqual(r.cash_movement, r.cashbook.map(({ running_balance, ...row }) => row));
  assert.equal(new Set(r.cashbook.map((row) => row.posting_id)).size, r.cashbook.length);
  for (const row of r.cashbook) {
    const p = vector.snapshot.postings.find((p) => p.id === row.posting_id);
    const e = vector.snapshot.events.find((e) => e.id === p.event_id);
    for (const field of ["group_id", "ledger_epoch_id", "account_id", "fund_id", "currency", "member_id", "project_id"]) assert.equal(row[field], p[field]);
    for (const field of ["event_class", "effect_kind", "source_module", "source_record_id", "request_id", "created_by", "status", "description"]) assert.equal(row[field], e[field]);
    for (const field of ["reversal_of_event_id", "replacement_event_id", "corrected_at", "correction_reason"]) assert.equal(row[field], e[field] ?? null);
    assert.equal(row.event_id, e.id); assert.equal(row.occurred_at, normalizeTimestamp(p.occurred_at));
    assert.equal(row.posted_at, normalizeTimestamp(e.posted_at)); assert.equal(row.reference, e.reference_metadata.reference);
    assert.equal(row.direction, units(row.amount_signed, row.currency) > 0n ? "cash_in" : "cash_out");
    assert.ok(row.occurred_at >= r.query.from && row.occurred_at < r.query.to);
    for (const context of row.category_contexts) {
      const economic = vector.snapshot.postings.find((p) => p.event_id === row.event_id && p.category_id === context.category_id);
      for (const field of ["category_class", "fund_id", "member_id", "project_id"]) assert.equal(context[field], economic[field]);
    }
  }
  // Reconcile independently in each currency, including zero and negative results.
  for (const total of r.organization_custody) {
    const currency = total.currency;
    const raw = vector.snapshot.postings.filter((p) => p.group_id === vector.query.group_id && p.currency === currency &&
      p.control_class === "custody" && (r.query.as_of_exclusive === null || normalizeTimestamp(p.occurred_at) < r.query.as_of_exclusive));
    assert.equal(sum(raw), units(total.amount, currency));
    assert.equal(sum(r.account_balance.filter((a) => a.currency === currency), "amount"), units(total.amount, currency));
    assert.equal(sum(r.fund_cash.filter((f) => f.currency === currency), "amount"), units(total.amount, currency));
  }
  for (const soa of r.soa) assert.equal(units(soa.income, soa.currency) - units(soa.expense, soa.currency), units(soa.operating_result, soa.currency));
  if (vector.page) {
    const p = cashbookPage(r, { ...vector.page, snapshot_id: r.snapshot_id });
    assert.equal(p.currency, vector.page.currency); assert.equal(p.account_id, vector.page.account_id);
    assert.equal(p.opening_balance, vector.page.opening); assert.equal(p.total_rows, vector.page.total);
    assert.deepEqual(p.rows.map((r) => ref(r.posting_id)), vector.page.ids);
    assert.deepEqual(p.rows.map((r) => r.running_balance), vector.page.running);
  }
});

const antiPatterns = [
  () => { const s = snapshot(event(1, "income", "500.00")); assert.equal(sum(s.postings), 0n);
    assert.equal(amount(run(s), "fund_cash", "fund_id", ID.restricted), "500.00"); },
  () => { const s = foundation(); assert.equal(sum(s.postings.filter((p) => p.control_class === "custody" && units(p.amount_signed, p.currency) > 0n)), 1150000n);
    assert.equal(income(s), "500.00"); },
  () => { const s = snapshot(event(1, "transfer", "1000.00", { fund: "general" }));
    assert.equal(sum(s.postings.filter((p) => units(p.amount_signed, p.currency) > 0n)), 100000n);
    assert.deepEqual(run(s).soa.map(({ income, expense }) => [income, expense]), [["0.00", "0.00"]]); },
  () => { const s = snapshot(event(1, "receivable", "1000.00")); assert.equal(-sum(s.postings.filter((p) => p.control_class === "custody")), 100000n);
    assert.equal(run(s).soa[0].expense, "0.00"); },
  () => { const s = snapshot(event(1, "liability", "100.00")); assert.equal(sum(s.postings.filter((p) => p.control_class === "custody")), 10000n); assert.equal(income(s), "0.00"); },
  () => { const s = snapshot(event(1, "opening", "10000.00")); assert.equal(sum(s.postings.filter((p) => p.control_class === "custody")), 1000000n); assert.equal(income(s), "0.00"); },
  () => { const s = correction(); const wrong = s.postings.filter((p) => p.control_class === "income" && s.events.find((e) => e.id === p.event_id).status === "posted");
    assert.equal(-sum(wrong), -5000n); assert.equal(income(s), "450.00"); },
  () => { const r = run(combine(foundation(), xaf(ID.group, true)), { ...QUERY, from: "2025-01-01T00:00:00Z" });
    const wrong = r.organization_custody.reduce((n, row) => n + BigInt(row.amount.split(".")[0]), 0n);
    assert.equal(wrong, 2510300n); assert.deepEqual(r.organization_custody.map((r) => [r.currency, r.amount]), [["USD", "10300.00"], ["XAF", "2500000"]]); },
  () => { const r = run(); const p = cashbookPage(r, { snapshot_id: r.snapshot_id, account_id: ID.bank, currency: "USD", offset: 2, limit: 2 });
    assert.equal(sum(p.rows), -120000n); assert.equal(p.rows.at(-1).running_balance, "9300.00"); assert.equal(p.opening_balance, "10500.00"); },
  () => { const s = foundation(); s.display.accounts[0].status = "closed";
    const visible = new Set(s.display.accounts.filter((a) => a.status === "active").map((a) => a.id));
    assert.equal(sum(s.postings.filter((p) => visible.has(p.account_id))), 100000n); assert.equal(run(s).organization_custody[0].amount, "10300.00"); },
  () => { const s = foundation(); s.obligations = [{ amount_paid: "99999.00" }]; assert.equal(units(s.obligations[0].amount_paid, "USD"), 9999900n);
    assert.equal(income(s), "500.00"); assert.deepEqual(run(s), run(foundation())); },
  () => { const s = foundation(); s.payments = [{ amount: "99999.00", status: "confirmed" }]; assert.equal(units(s.payments[0].amount, "USD"), 9999900n);
    assert.deepEqual(run(s), run(foundation())); },
  () => { const s = snapshot(event(1, "income", "500.00", { audit: { status: "reversed", corrected_at: T.observed, correction_reason: "Exact reversal" } }),
    event(2, "income", "-500.00", { audit: { reversal_of_event_id: eventId(1) } }));
    assert.equal(-sum(s.postings.filter((p) => p.control_class === "income" && p.event_id !== eventId(1))), -50000n); assert.equal(income(s), "0.00"); },
  () => { const v = validVectors.find((v) => v.name === "income reversal-only period / negative activity"); const r = run(v.snapshot, v.query);
    const wrong = units(r.income[0].amount, "USD") * -1n; assert.equal(wrong, 50000n); assert.equal(r.soa[0].income, "-500.00"); },
  () => { const r = run(foundation(), { ...QUERY, from: T.in }); assert.equal(sum(r.cashbook.filter((r) => r.account_id === ID.bank)), -70000n);
    assert.equal(r.cashbook.filter((r) => r.account_id === ID.bank).at(-1).running_balance, "9300.00"); },
  () => { const s = foundation(); const readerConfigurationRows = []; const wrong = s.postings.filter((p) => readerConfigurationRows.some((a) => a.id === p.account_id));
    assert.equal(sum(wrong), 0n); assert.equal(run(s).organization_custody[0].amount, "10300.00"); },
  () => { const s = foundation(); const wrong = s.postings.filter((p) => p.control_class === "income" && s.events.find((e) => e.id === p.event_id).posted_at < QUERY.to);
    assert.equal(-sum(wrong), 0n); assert.equal(income(s), "500.00"); },
  () => { const v = validVectors.find((v) => v.name.startsWith("equal event/time")); const r = run(v.snapshot);
    const wrong = r.cash_movement.flatMap((r) => r.category_contexts.map(() => r)); assert.equal(sum(wrong), 1400n);
    assert.equal(sum(r.cash_movement), 700n); assert.equal(r.cash_movement.length, 2); },
];
assert.equal(antiPatterns.length, antiPatternNames.length);
antiPatternNames.forEach((name, i) => test(`anti-pattern: ${name}`, antiPatterns[i]));

const invalid = (name, change, error) => ({ name, change, error });
const negativeVectors = [
  invalid("JSON number amount", (s) => { s.postings[0].amount_signed = 10000; }, "EXACT_AMOUNT_REQUIRED"),
  invalid("fractional XAF", (s) => { s.events.forEach((e) => { e.currency = "XAF"; }); s.postings.forEach((p) => { p.currency = "XAF"; }); s.postings[0].amount_signed = "1.5"; }, "AMOUNT_PRECISION"),
  invalid("unsupported currency", (s) => { s.postings[0].currency = "BTC"; }, "UNSUPPORTED_CURRENCY"),
  invalid("exponent notation", (s) => { s.postings[0].amount_signed = "1e4"; }, "EXACT_AMOUNT_REQUIRED"),
  invalid("partial posting set", (s) => { s.postings.pop(); }, "INCOMPLETE_OR_UNBALANCED_EVENT"),
  invalid("event with no postings", (s) => { s.postings = s.postings.filter((p) => p.event_id !== eventId(1)); }, "INCOMPLETE_OR_UNBALANCED_EVENT"),
  invalid("duplicate posting", (s) => { s.postings.push(s.postings[0]); }, "DUPLICATE_POSTING"),
  invalid("duplicate event", (s) => { s.events.push(s.events[0]); }, "DUPLICATE_EVENT"),
  invalid("orphan posting", (s) => { s.events.shift(); }, "ORPHAN_POSTING"),
  invalid("wrong tenant tuple", (s) => { s.postings[0].group_id = ID.other; }, "EVENT_SCOPE_MISMATCH"),
  invalid("wrong epoch tuple", (s) => { s.postings[0].ledger_epoch_id = ID.laterEpoch; }, "EVENT_SCOPE_MISMATCH"),
  invalid("wrong effective date tuple", (s) => { s.postings[0].occurred_at = T.in; }, "EVENT_SCOPE_MISMATCH"),
  invalid("drafts are not committed fixtures", (s) => { s.events[0].status = "draft"; }, "NON_COMMITTED_STATE"),
  invalid("unknown control", (s) => { s.postings[0].control_class = "payments"; }, "UNKNOWN_CONTROL"),
  invalid("zero posting", (s) => { s.postings[0].amount_signed = "0.00"; }, "ZERO_POSTING"),
  invalid("custody requires account", (s) => { s.postings[0].account_id = null; }, "CUSTODY_SHAPE"),
  invalid("income category class mismatch", (s) => { s.postings[3].category_class = "expense"; }, "CATEGORY_SHAPE"),
  invalid("snapshot identity required", (s) => { s.snapshot_id = ""; }, "SNAPSHOT_REQUIRED"),
];
for (const v of negativeVectors) test(`negative: ${v.name}`, () => {
  const s = foundation(); v.change(s); assert.throws(() => run(s), { message: v.error });
});

test("query boundaries and unsupported status/dimension shortcuts reject explicitly", () => {
  assert.throws(() => run(foundation(), { ...QUERY, from: T.end }), /INVALID_PERIOD/);
  assert.throws(() => run(foundation(), { ...QUERY, from: "2026-02-30T00:00:00Z" }), /INVALID_OCCURRED_AT/);
  assert.throws(() => run(foundation(), { ...QUERY, to: "2026-10-01" }), /INVALID_OCCURRED_AT/);
  assert.throws(() => run(foundation(), { ...QUERY, status: "posted" }), /UNSUPPORTED_QUERY_FIELD/);
  assert.throws(() => run(foundation(), { ...QUERY, fund_id: ID.restricted }), /UNSUPPORTED_QUERY_FIELD/);
});
test("page validates account/currency/offset and binds snapshot", () => {
  const r = run(); const p = { account_id: ID.bank, currency: "USD", offset: 0, limit: 2, snapshot_id: r.snapshot_id };
  assert.throws(() => cashbookPage(r, { ...p, snapshot_id: "different" }), /SNAPSHOT_MISMATCH/);
  for (const offset of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => cashbookPage(r, { ...p, offset }), /INVALID_PAGE/);
  assert.throws(() => cashbookPage(r, { ...p, limit: 0 }), /INVALID_PAGE/);
  assert.throws(() => cashbookPage(r, { ...p, currency: "BTC" }), /UNSUPPORTED_CURRENCY/);
  const empty = cashbookPage(r, { ...p, offset: 99 }); assert.deepEqual(empty.rows, []); assert.equal(empty.opening_balance, null);
});
test("snapshot consistency: backdated later commit changes every current measure together", () => {
  const before = foundation(); const after = combine(before, snapshot(event(8, "income", "50.00")));
  after.snapshot_id = "fixture-snapshot-2";
  const a = run(before), b = run(after);
  assert.equal(a.organization_custody[0].amount, "10300.00"); assert.equal(b.organization_custody[0].amount, "10350.00");
  assert.equal(amount(b, "account_balance", "account_id", ID.bank), "9350.00");
  assert.equal(amount(b, "fund_cash", "fund_id", ID.restricted), "350.00"); assert.equal(b.soa[0].income, "550.00");
  assert.throws(() => cashbookPage(b, { account_id: ID.bank, currency: "USD", offset: 1, limit: 2, snapshot_id: a.snapshot_id }), /SNAPSHOT_MISMATCH/);
  assert.deepEqual(run(before), a, "fixed snapshot remains reproducible even with identical occurred_at cutoffs");
});
test("cashbook returns an audit allow-list without replay or metadata secrets", () => {
  const r = run(correction());
  const required = ["group_id", "ledger_epoch_id", "event_id", "posting_id", "occurred_at", "posted_at", "account_id", "fund_id", "currency",
    "amount_signed", "member_id", "project_id", "event_class", "effect_kind", "movement_type", "control_classes", "category_contexts", "direction",
    "running_balance", "source_module", "source_record_id", "request_id", "created_by", "status", "description", "reference", "reversal_of_event_id",
    "replacement_event_id", "corrected_at", "correction_reason"].sort();
  for (const row of r.cashbook) assert.deepEqual(Object.keys(row).sort(), required);
  assert.equal(JSON.stringify(r).includes("DO NOT RETURN"), false);
  assert.equal(r.cashbook.find((r) => r.event_id === eventId(2)).replacement_event_id, eventId(6));
  assert.equal(r.cashbook.find((r) => r.event_id === eventId(5)).reversal_of_event_id, eventId(2));
});
test("F3-02 ordinary templates feed the same projection math", () => {
  for (const vector of postingVectors.filter((v) => ["money_in", "money_out", "transfer"].includes(v.input.action))) {
    const context = fixtureContext(); vector.setup?.(context);
    const result = evaluateCommand(vector.input, context);
    const e = event(90, vector.input.action === "money_in" ? "income" : vector.input.action === "money_out" ? "expense" : "transfer", "1.00");
    // Use actual F3-02 event payload and complete posting set, not new projection templates.
    const payload = result.payload;
    Object.assign(e.event, { group_id: payload.group_id, currency: payload.currency, ledger_epoch_id: payload.ledger_epoch_id,
      occurred_at: payload.occurred_at, event_class: payload.event_class, effect_kind: payload.effect_kind });
    e.postings = result.postings.map((p, i) => ({ ...p, id: postingId(`90:${i}`), event_id: e.event.id }));
    const r = run(snapshot(e), { ...QUERY, group_id: payload.group_id });
    assert.equal(r.organization_custody[0].amount, vector.expected.cash);
    assert.equal(r.soa[0].income, vector.expected.soa_income); assert.equal(r.soa[0].expense, vector.expected.soa_expense);
  }
});
test("all supported currency scales preserve signed exact strings", () => {
  for (const currency of ["XAF", "XOF", "TZS", "UGX", "RWF"]) assert.equal(decimal(minorUnits("-100.00000000", currency), currency), "-100");
  for (const currency of ["NGN", "GHS", "KES", "ZAR", "ETB", "CDF", "USD", "EUR", "GBP", "CAD", "CHF", "AUD", "AED"]) {
    assert.equal(decimal(minorUnits("-9007199254740993.01000000", currency), currency), "-9007199254740993.01");
  }
  assert.equal(decimal(0n, "USD"), "0.00"); assert.equal(decimal(0n, "XAF"), "0");
});
test("zero-net historical accounts/funds remain rows and posted_at never removes them", () => {
  const s = snapshot(event(1, "income", "500.00"), event(2, "income", "-500.00"));
  const r = run(s); assert.equal(r.account_balance.length, 1); assert.equal(r.account_balance[0].amount, "0.00");
  assert.equal(r.fund_cash[0].amount, "0.00"); assert.equal(r.income[0].amount, "0.00"); assert.equal(r.cashbook.length, 2);
});
test("position is assets plus signed liabilities, separate from cash held", () => {
  const r = run(combine(foundation(), snapshot(event(8, "receivable", "1000.00", { fund: "general" }), event(9, "liability", "100.00", { fund: "general" }))));
  assert.equal(r.organization_custody[0].amount, "9400.00");
  assert.equal(amount(r, "fund_cash", "fund_id", ID.general), "9100.00");
  assert.equal(amount(r, "fund_net_position", "fund_id", ID.general), "10000.00");
  assert.equal(r.soa[0].operating_result, "300.00");
});
test("fixture catalog counts are explicit", () => {
  assert.equal(validVectors.length, 35); assert.equal(antiPatternNames.length, 18); assert.equal(negativeVectors.length, 18);
});
