// TEST / CONTRACT ONLY. No application imports, IO, SQL, auth, or persistence.
// Production consumers must use Daybreak's database-owned projections.
import { CURRENCY_SCALE, normalizeTimestamp, uuid } from "../f3-02/oracle.mjs";

export const VERSION = "f3-projection-v1";
export const GRAINS = Object.freeze({
  account_balance: "group/account/currency",
  fund_cash: "group/fund/currency",
  fund_net_position: "group/fund/currency",
  organization_custody: "group/currency",
  income: "group/period/currency/category/fund/member/project",
  expense: "group/period/currency/category/fund/member/project",
  soa: "group/period/currency",
  cash_movement: "group/custody-posting",
  cashbook: "group/custody-posting",
});
const CONTROLS = ["custody", "income", "expense", "opening_position", "receivable", "liability"];
const POSITION = ["custody", "receivable", "liability"];
const ACTIVITY_DIMS = ["group_id", "currency", "category_id", "category_class", "fund_id", "member_id", "project_id"];
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const key = (row, fields) => JSON.stringify(fields.map((field) => row[field]));
const sum = (rows) => rows.reduce((total, row) => total + row.minor, 0n);
const fail = (code) => { throw new Error(code); };

// PostgreSQL numeric(30,8) text may include insignificant trailing zeroes.
// Unlike command amounts, stored amounts are signed, and 500.00000000 USD is valid.
export function minorUnits(value, currency) {
  if (!Object.hasOwn(CURRENCY_SCALE, currency)) fail("UNSUPPORTED_CURRENCY");
  const scale = CURRENCY_SCALE[currency];
  if (typeof value !== "string" || value.length > 64 ||
      !/^-?[0-9]+(?:\.[0-9]+)?$/.test(value) || value !== value.trim()) fail("EXACT_AMOUNT_REQUIRED");
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  if (fraction.slice(scale).replace(/0/g, "")) fail("AMOUNT_PRECISION");
  const units = BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.slice(0, scale).padEnd(scale, "0") || "0");
  return negative ? -units : units;
}
export function decimal(units, currency) {
  const scale = CURRENCY_SCALE[currency];
  if (typeof units !== "bigint" || scale === undefined) fail("EXACT_AMOUNT_REQUIRED");
  const digits = (units < 0n ? -units : units).toString().padStart(scale + 1, "0");
  return (units < 0n ? "-" : "") + (scale ? digits.slice(0, -scale) + "." + digits.slice(-scale) : digits);
}
const ids = (rows) => rows.map((p) => p.id).sort(compare);

function readQuery(query) {
  if (Object.keys(query).some((k) => !["group_id", "from", "to", "as_of_exclusive"].includes(k))) fail("UNSUPPORTED_QUERY_FIELD");
  const q = { group_id: uuid(query.group_id), from: normalizeTimestamp(query.from),
    to: normalizeTimestamp(query.to), as_of_exclusive: query.as_of_exclusive == null ? null : normalizeTimestamp(query.as_of_exclusive) };
  if (q.from >= q.to) fail("INVALID_PERIOD");
  return q;
}

// A supplied snapshot is an already committed, closed ledger population.
// It is NOT an RPC input or a client assertion that something is committed.
function readSnapshot(snapshot, group) {
  if (typeof snapshot.snapshot_id !== "string" || !snapshot.snapshot_id) fail("SNAPSHOT_REQUIRED");
  normalizeTimestamp(snapshot.observed_at);
  const events = new Map();
  for (const e of snapshot.events) {
    if (events.has(e.id)) fail("DUPLICATE_EVENT");
    uuid(e.id); uuid(e.group_id);
    if (!["posted", "corrected", "reversed"].includes(e.status)) fail("NON_COMMITTED_STATE");
    events.set(e.id, { ...e, occurred_at: normalizeTimestamp(e.occurred_at), posted_at: normalizeTimestamp(e.posted_at) });
  }
  const seen = new Set();
  const all = snapshot.postings.map((p) => {
    uuid(p.id); uuid(p.event_id); uuid(p.group_id); uuid(p.ledger_epoch_id); uuid(p.fund_id);
    for (const dimension of ["account_id", "category_id", "member_id", "project_id"]) if (p[dimension] !== null) uuid(p[dimension]);
    if (seen.has(p.id)) fail("DUPLICATE_POSTING");
    seen.add(p.id);
    const event = events.get(p.event_id);
    if (!event) fail("ORPHAN_POSTING");
    const row = { ...p, occurred_at: normalizeTimestamp(p.occurred_at), minor: minorUnits(p.amount_signed, p.currency), event };
    if (["group_id", "ledger_epoch_id", "currency", "occurred_at"].some((k) => row[k] !== event[k])) fail("EVENT_SCOPE_MISMATCH");
    if (!CONTROLS.includes(p.control_class)) fail("UNKNOWN_CONTROL");
    if (row.minor === 0n) fail("ZERO_POSTING");
    if ((p.control_class === "custody") !== (p.account_id !== null)) fail("CUSTODY_SHAPE");
    const economic = ["income", "expense"].includes(p.control_class);
    if (economic ? (!p.category_id || p.category_class !== p.control_class) : (p.category_id !== null || p.category_class !== null)) fail("CATEGORY_SHAPE");
    return row;
  });
  for (const event of events.values()) {
    const lines = all.filter((p) => p.event_id === event.id);
    if (!lines.length || sum(lines) !== 0n) fail("INCOMPLETE_OR_UNBALANCED_EVENT");
  }
  // Tenant selection is mathematics only. It proves no authorization/RLS behavior.
  return all.filter((p) => p.group_id === group);
}

function aggregate(rows, fields, sign = 1n) {
  const groups = new Map();
  for (const p of rows) {
    const k = key(p, fields);
    if (!groups.has(k)) groups.set(k, { dimensions: Object.fromEntries(fields.map((f) => [f, p[f]])), lines: [] });
    groups.get(k).lines.push(p);
  }
  return [...groups.values()].map(({ dimensions, lines }) => ({ ...dimensions,
    amount: decimal(sign * sum(lines), dimensions.currency), _posting_ids: ids(lines),
  })).sort((a, b) => compare(key(a, fields), key(b, fields)));
}

function contextFor(posting, population) {
  const peers = population.filter((p) => p.event_id === posting.event_id);
  const controls = [...new Set(peers.filter((p) => p.control_class !== "custody").map((p) => p.control_class))].sort(compare);
  let movement_type;
  if (controls.length === 0) {
    // A pure custody event is only called an account transfer when every fund
    // is preserved. Future reallocations must not silently inherit this name.
    const funds = aggregate(peers, ["group_id", "fund_id", "currency"]);
    movement_type = new Set(peers.map((p) => p.account_id)).size > 1 &&
      funds.every((f) => minorUnits(f.amount, f.currency) === 0n) ? "internal_account_transfer" : "unclassified_custody";
  } else if (controls.length > 1) movement_type = "mixed_non_custody";
  else movement_type = { income: "operating_income", expense: "operating_expense",
    opening_position: "opening_position", receivable: "receivable_movement", liability: "liability_movement" }[controls[0]];
  const categoryContexts = new Map();
  for (const p of peers.filter((p) => p.category_id)) {
    const fields = ["category_id", "category_class", "fund_id", "member_id", "project_id"];
    categoryContexts.set(key(p, fields), Object.fromEntries(fields.map((f) => [f, p[f]])));
  }
  return { movement_type, control_classes: controls,
    // Event context, not an allocation of this custody amount to every category.
    category_contexts: [...categoryContexts.entries()].sort(([a], [b]) => compare(a, b)).map(([, v]) => v) };
}

function cashRows(population) {
  const running = new Map();
  return population.filter((p) => p.control_class === "custody")
    .sort((a, b) => compare(a.occurred_at, b.occurred_at) || compare(a.event_id, b.event_id) || compare(a.id, b.id))
    .map((p) => {
      const account = key(p, ["group_id", "account_id", "currency"]);
      running.set(account, (running.get(account) || 0n) + p.minor);
      const e = p.event;
      return { group_id: p.group_id, ledger_epoch_id: p.ledger_epoch_id, event_id: p.event_id, posting_id: p.id,
        occurred_at: p.occurred_at, posted_at: e.posted_at, account_id: p.account_id, fund_id: p.fund_id,
        currency: p.currency, amount_signed: decimal(p.minor, p.currency), member_id: p.member_id, project_id: p.project_id,
        event_class: e.event_class, effect_kind: e.effect_kind, ...contextFor(p, population),
        direction: p.minor > 0n ? "cash_in" : "cash_out", running_balance: decimal(running.get(account), p.currency),
        source_module: e.source_module, source_record_id: e.source_record_id,
        request_id: e.request_id, created_by: e.created_by, status: e.status,
        description: e.description, reference: e.reference_metadata?.reference ?? null,
        reversal_of_event_id: e.reversal_of_event_id ?? null, replacement_event_id: e.replacement_event_id ?? null,
        corrected_at: e.corrected_at ?? null, correction_reason: e.correction_reason ?? null };
    });
}

export function project(snapshot, query) {
  const q = readQuery(query);
  const committed = readSnapshot(snapshot, q.group_id);
  const balances = committed.filter((p) => q.as_of_exclusive === null || p.occurred_at < q.as_of_exclusive);
  // Period and balance cutoff are independent explicit query axes.
  const inPeriod = (p) => q.from <= p.occurred_at && p.occurred_at < q.to;
  const activity = committed.filter(inPeriod);
  const custody = balances.filter((p) => p.control_class === "custody");
  const income = aggregate(activity.filter((p) => p.control_class === "income"), ACTIVITY_DIMS, -1n);
  const expense = aggregate(activity.filter((p) => p.control_class === "expense"), ACTIVITY_DIMS);
  // A currency present anywhere in this committed group snapshot receives a
  // zero SoA row even when no operating postings fall in the requested period.
  const soa = [...new Set(committed.map((p) => p.currency))].sort(compare).map((currency) => {
    const lines = activity.filter((p) => p.currency === currency);
    const inLines = lines.filter((p) => p.control_class === "income");
    const outLines = lines.filter((p) => p.control_class === "expense");
    const i = -sum(inLines), x = sum(outLines);
    return { group_id: q.group_id, currency, income: decimal(i, currency), expense: decimal(x, currency),
      operating_result: decimal(i - x, currency), _posting_ids: ids([...inLines, ...outLines]) };
  });
  // Window over ALL account history first; only then period filter or paginate.
  const cashbook = cashRows(committed).filter(inPeriod);
  return { contract_version: VERSION, grains: GRAINS, snapshot_id: snapshot.snapshot_id,
    observed_at: normalizeTimestamp(snapshot.observed_at), query: q,
    account_balance: aggregate(custody, ["group_id", "account_id", "currency"]),
    fund_cash: aggregate(custody, ["group_id", "fund_id", "currency"]),
    fund_net_position: aggregate(balances.filter((p) => POSITION.includes(p.control_class)), ["group_id", "fund_id", "currency"]),
    organization_custody: aggregate(custody, ["group_id", "currency"]), income, expense, soa,
    cash_movement: cashbook.map(({ running_balance, ...row }) => row), cashbook,
    _population: { committed: ids(committed), balances: ids(balances), activity: ids(activity) } };
}

export function cashbookPage(result, { account_id, currency, offset = 0, limit, snapshot_id }) {
  if (snapshot_id !== result.snapshot_id) fail("SNAPSHOT_MISMATCH");
  uuid(account_id);
  if (!Object.hasOwn(CURRENCY_SCALE, currency)) fail("UNSUPPORTED_CURRENCY");
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1) fail("INVALID_PAGE");
  const all = result.cashbook.filter((r) => r.account_id === account_id && r.currency === currency);
  const rows = all.slice(offset, offset + limit);
  const first = rows[0];
  return { snapshot_id, account_id, currency, offset, limit, total_rows: all.length,
    opening_balance: first ? decimal(minorUnits(first.running_balance, currency) - minorUnits(first.amount_signed, currency), currency) : null,
    rows };
}
