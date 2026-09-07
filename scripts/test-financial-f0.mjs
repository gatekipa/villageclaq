import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { bucketCurrencyAmounts, currencyBucketsToRecord, formatCurrencyBuckets } from "../src/lib/currency-buckets.ts";
import { allocatePaymentApplications, computeMoneyFigures, computeMoneyFiguresByCurrency } from "../src/lib/money.ts";
import { applyPaymentCommand, resolveActiveLedgerEpoch } from "../src/lib/payment-command.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const epoch = (id, currency, group = "g1") => ({ id, group_id: group, currency, effective_from: "2026-01-01", effective_to: null });
const obligation = (id, currency, epochId, amount = 100, member = "m1", type = `type-${epochId}`) => ({
  id, group_id: "g1", currency, ledger_epoch_id: epochId, amount, membership_id: member,
  contribution_type_id: type, due_date: "2026-01-01", status: "pending",
});
const payment = (id, currency, epochId, amount = 100, member = "m1", type = `type-${epochId}`) => ({
  id, group_id: "g1", currency, ledger_epoch_id: epochId, amount, membership_id: member,
  contribution_type_id: type, recorded_at: "2026-02-01", status: "confirmed",
});

function clientFixture({ epochs = [], types = [], obligations = [], tableError = null, rpc } = {}) {
  const tables = { financial_ledger_epochs: epochs, contribution_types: types, contribution_obligations: obligations };
  return {
    from(table) {
      let filters = [];
      const query = {
        select() { return query; },
        eq(column, value) { filters.push((row) => row[column] === value); return query; },
        is(column, value) { filters.push((row) => row[column] === value); return query; },
        limit(count) {
          if (tableError && table === "financial_ledger_epochs") return Promise.resolve({ data: null, error: tableError });
          return Promise.resolve({ data: (tables[table] || []).filter((row) => filters.every((fn) => fn(row))).slice(0, count), error: null });
        },
        maybeSingle() {
          const rows = (tables[table] || []).filter((row) => filters.every((fn) => fn(row)));
          return Promise.resolve({ data: rows.length === 1 ? rows[0] : null, error: rows.length > 1 ? { message: "ambiguous" } : null });
        },
      };
      return query;
    },
    rpc: rpc || (async () => ({ data: { payment: { id: "payment-new" }, appliedTo: [], creditRemaining: 0, replayed: false }, error: null })),
  };
}

test("USD, EUR, XAF and NGN parent amounts remain deterministic native buckets", () => {
  const rows = [
    { currency: "XAF", amount: 250000 }, { currency: "USD", amount: 1200 },
    { currency: "EUR", amount: 900 }, { currency: "NGN", amount: 500000 },
  ];
  const buckets = bucketCurrencyAmounts(rows, (row) => row.amount, (row) => row.currency);
  assert.deepEqual(buckets.map((item) => item.currency), ["EUR", "NGN", "USD", "XAF"]);
  assert.deepEqual(currencyBucketsToRecord(buckets), { EUR: 900, NGN: 500000, USD: 1200, XAF: 250000 });
  assert.deepEqual(formatCurrencyBuckets(buckets), ["€900.00", "₦500,000.00", "$1,200.00", "250,000 FCFA"]);
});

test("historical XAF epoch and current USD epoch report separately", () => {
  const figures = computeMoneyFiguresByCurrency(
    [obligation("old", "XAF", "epoch-xaf", 50000), obligation("new", "USD", "epoch-usd", 100)],
    [payment("paid-old", "XAF", "epoch-xaf", 50000), payment("paid-new", "USD", "epoch-usd", 40)],
  );
  assert.deepEqual(figures.map(({ currency, collected, outstanding }) => ({ currency, collected, outstanding })), [
    { currency: "USD", collected: 40, outstanding: 60 },
    { currency: "XAF", collected: 50000, outstanding: 0 },
  ]);
  assert.throws(() => computeMoneyFigures(
    [obligation("old", "XAF", "epoch-xaf")], [payment("new", "USD", "epoch-usd")],
  ), /FINANCIAL_CURRENCY_BUCKET_REQUIRED/);
});

test("same-currency repeated epochs do not cross-allocate", () => {
  const obligations = [obligation("old", "USD", "epoch-1"), obligation("new", "USD", "epoch-2")];
  const applications = allocatePaymentApplications(obligations, [payment("p", "USD", "epoch-2", 100)]);
  assert.deepEqual(applications, [{ paymentIndex: 0, obligationId: "new", amount: 100 }]);
  assert.equal(computeMoneyFiguresByCurrency(obligations, [payment("p", "USD", "epoch-2", 100)])[0].outstanding, 100);
});

test("USD payment and credit cannot satisfy XAF debt", () => {
  const xafDebt = obligation("xaf", "XAF", "epoch-xaf", 50000);
  const usdCredit = payment("usd", "USD", "epoch-usd", 100);
  assert.deepEqual(allocatePaymentApplications([xafDebt], [usdCredit]), []);
  const figures = computeMoneyFiguresByCurrency([xafDebt], [usdCredit]);
  assert.equal(figures.find((item) => item.currency === "XAF").outstanding, 50000);
  assert.equal(figures.find((item) => item.currency === "USD").unallocatedCredit, 100);
});

test("mixed scoped and unresolved legacy rows fail closed", () => {
  const legacy = { ...obligation("legacy", "XAF", null), ledger_epoch_id: null };
  assert.throws(() => computeMoneyFiguresByCurrency([legacy, obligation("scoped", "USD", "epoch-usd")], []),
    /FINANCIAL_LEGACY_RESOLUTION_REQUIRED/);
});

test("old DB plus new app fails before any payment RPC", async () => {
  let called = false;
  const client = clientFixture({ tableError: { message: "relation missing" }, rpc: async () => { called = true; } });
  await assert.rejects(() => applyPaymentCommand(client, {
    groupId: "g1", requestId: "req", action: "record", values: { membership_id: "m1", amount: 10, currency: "USD" },
  }), /FINANCIAL_LEDGER_EPOCH_UNAVAILABLE/);
  assert.equal(called, false);
});

test("Phase A/new app accepts active-epoch typed payment", async () => {
  let call;
  const client = clientFixture({
    epochs: [epoch("epoch-usd", "USD")],
    types: [{ id: "type-usd", group_id: "g1", currency: " usd ", ledger_epoch_id: "epoch-usd" }],
    rpc: async (name, args) => { call = { name, args }; return { data: { payment: { id: "p" }, appliedTo: [], creditRemaining: 0, replayed: false }, error: null }; },
  });
  await applyPaymentCommand(client, { groupId: "g1", requestId: "req", action: "record", values: {
    membership_id: "m1", contribution_type_id: "type-usd", amount: 10, currency: "USD",
  } });
  assert.equal(call.name, "apply_payment_command");
});

test("Phase A/new app rejects historical type attribution before RPC", async () => {
  let called = false;
  const client = clientFixture({
    epochs: [epoch("epoch-usd", "USD")],
    types: [{ id: "type-xaf", group_id: "g1", currency: "XAF", ledger_epoch_id: "epoch-xaf" }],
    rpc: async () => { called = true; },
  });
  await assert.rejects(() => applyPaymentCommand(client, { groupId: "g1", requestId: "req", action: "record", values: {
    membership_id: "m1", contribution_type_id: "type-xaf", amount: 10, currency: "USD",
  } }), /PAYMENT_ATTRIBUTION_INVALID/);
  assert.equal(called, false);
});

test("missing or ambiguous active epochs fail closed", async () => {
  await assert.rejects(() => resolveActiveLedgerEpoch(clientFixture(), "g1"), /ACTIVE_LEDGER_EPOCH_REQUIRED/);
  await assert.rejects(() => resolveActiveLedgerEpoch(clientFixture({ epochs: [epoch("a", "USD"), epoch("b", "USD")] }), "g1"),
    /ACTIVE_LEDGER_EPOCH_REQUIRED/);
});

test("active epoch currency is normalized and never accepted from command input", async () => {
  assert.equal((await resolveActiveLedgerEpoch(clientFixture({ epochs: [epoch("e", " usd ")] }), "g1")).currency, "USD");
  await assert.rejects(() => applyPaymentCommand(clientFixture({ epochs: [epoch("e", "USD")] }), {
    groupId: "g1", requestId: "req", action: "record", values: { membership_id: "m1", amount: 10, currency: "XAF" },
  }), /CURRENCY_MISMATCH/);
});

test("app write paths resolve and persist active ledger epoch", () => {
  const hooks = read("src/lib/hooks/use-supabase-query.ts");
  const members = read("src/app/[locale]/(dashboard)/dashboard/members/page.tsx");
  const contributions = read("src/app/[locale]/(dashboard)/dashboard/contributions/page.tsx");
  assert.match(hooks, /resolveActiveLedgerEpoch/);
  assert.match(hooks, /ledger_epoch_id: epoch\.id/);
  assert.match(members, /ledger_epoch_id: epoch\.id/);
  assert.match(contributions, /ledger_epoch_id: epoch\.id/);
});

test("parent relief rollup and report 24 bucket native branch currencies", () => {
  const rollup = read("src/app/[locale]/(dashboard)/dashboard/enterprise/relief-rollup/page.tsx");
  const reports = read("src/app/[locale]/(dashboard)/dashboard/reports/[reportId]/page.tsx");
  assert.match(rollup, /bucketCurrencyAmounts/);
  assert.match(rollup, /branch_currency/);
  assert.match(reports, /fedTotalCollected = bucketCurrencyAmounts/);
  assert.match(reports, /fedTotalRemitted = bucketCurrencyAmounts/);
});

test("CSV/PDF and AI contexts preserve currency buckets", () => {
  const reports = read("src/app/[locale]/(dashboard)/dashboard/reports/[reportId]/page.tsx");
  assert.match(reports, /Currency: bucket\.currency, Collected: bucket\.collected/);
  assert.match(reports, /Currency: bucket\.currency, Collected: formatAmount/);
  assert.match(reports, /moneyByCurrency: ctx\.moneyByCurrency/);
  assert.match(reports, /currency: "NATIVE_CURRENCY_BUCKETS"/);
});

test("historical member, payment-history and contribution views use row-native currency", () => {
  const history = read("src/app/[locale]/(dashboard)/dashboard/contributions/history/page.tsx");
  const member = read("src/app/[locale]/(dashboard)/dashboard/members/[id]/page.tsx");
  const report = read("src/app/[locale]/(dashboard)/dashboard/contributions/[typeId]/report/page.tsx");
  assert.match(history, /formatAmount\(payment\.amount, payment\.currency\)/);
  assert.match(member, /computeMoneyFiguresByCurrency/);
  assert.match(member, /totalPaidByCurrency/);
  assert.match(report, /type\?\.currency/);
});

test("cross-currency transfer UI forces fresh destination standing", () => {
  const transfers = read("src/app/[locale]/(dashboard)/dashboard/enterprise/transfers/page.tsx");
  assert.match(transfers, /p_carry_over_standing: isCrossCurrencyTransfer \? false : createCarryOver/);
  assert.match(transfers, /disabled=\{isCrossCurrencyTransfer\}/);
  assert.match(transfers, /bucketCurrencyAmounts/);
});

test("Phase A hardens both member-transfer RPC stages at the authoritative epoch boundary", () => {
  const sql = read("supabase/migrations/20260906140228_financial_ledger_epochs_expand.sql");
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.request_member_transfer[\s\S]*CREATE OR REPLACE FUNCTION public\.execute_member_transfer/);
  assert.match(sql, /cross_currency_standing_not_allowed/);
  assert.match(sql, /FROM public\.financial_ledger_epochs e[\s\S]*e\.effective_to IS NULL[\s\S]*FOR SHARE/);
  assert.match(sql, /FROM public\.member_transfers mt[\s\S]*FOR UPDATE/);
  assert.match(sql, /m\.membership_status = 'active'/);
  assert.match(sql, /SET search_path = ''/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.request_member_transfer[\s\S]*FROM PUBLIC, anon/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.execute_member_transfer[\s\S]*FROM PUBLIC, anon/);
});

test("Phase B enforces epoch-aware writes and blocks old incompatible payment clients", () => {
  const sql = read("supabase/migrations/20260906140229_financial_payment_integrity.sql");
  assert.match(sql, /ALTER COLUMN ledger_epoch_id SET NOT NULL/);
  assert.match(sql, /ledger_epoch_id=epoch AND currency=code/);
  assert.match(sql, /PAYMENT_ATTRIBUTION_INVALID/);
  assert.match(sql, /FINANCIAL_LEGACY_RESOLUTION_REQUIRED/);
});
