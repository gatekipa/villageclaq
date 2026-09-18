// TEST / CONTRACT ONLY. Never import into application code or use to write money.
// Daybreak's database RPC is the sole future posting authority.
import { createHash } from "node:crypto";

export const VERSION = "f3-posting-v1";
export const CURRENCY_SCALE = Object.freeze({
  XAF: 0, XOF: 0, TZS: 0, UGX: 0, RWF: 0,
  NGN: 2, GHS: 2, KES: 2, ZAR: 2, ETB: 2, CDF: 2,
  USD: 2, EUR: 2, GBP: 2, CAD: 2, CHF: 2, AUD: 2, AED: 2,
});
export const EFFECTS = Object.freeze({
  money_in: { effect_kind: "manual_income", event_class: "money_in", recognition: "operating_income" },
  money_out: { effect_kind: "manual_expense", event_class: "money_out", recognition: "operating_expense" },
  transfer: { effect_kind: "account_transfer", event_class: "transfer", recognition: "neither" },
  opening: { effect_kind: "opening_custody", event_class: "opening_adjustment", recognition: "neither" },
});
for (const effect of Object.values(EFFECTS)) Object.freeze(effect);

export class SemanticError extends Error {
  constructor(code) { super(code); this.name = "SemanticError"; this.code = code; }
}
const fail = (code) => { throw new SemanticError(code); };
const present = (value) => value !== undefined && value !== null;
const plain = (value) => value !== null && typeof value === "object" &&
  !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
function onlyKeys(object, allowed, code = "UNSUPPORTED_FIELD") {
  if (!plain(object)) fail("INVALID_INPUT");
  if (Object.keys(object).some((key) => !allowed.includes(key))) fail(code);
}
export function uuid(value) {
  if (typeof value !== "string" || value.length !== 36 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) fail("INVALID_UUID");
  return value.toLowerCase();
}
function currency(value) {
  if (typeof value !== "string" || !/^[a-z]{3}$/i.test(value) ||
      !Object.hasOwn(CURRENCY_SCALE, value.toUpperCase())) fail("UNSUPPORTED_CURRENCY");
  return value.toUpperCase();
}
export function normalizeAmount(value, code) {
  const scale = CURRENCY_SCALE[currency(code)];
  if (typeof value !== "string" || value.length > 64 || value !== value.trim() ||
      !/^-?[0-9]+(?:\.[0-9]+)?$/.test(value)) fail("INVALID_AMOUNT");
  if (value.startsWith("-")) fail("AMOUNT_NOT_POSITIVE");
  const [integer, fraction = ""] = value.split(".");
  if (fraction.length > scale) fail("AMOUNT_PRECISION");
  const whole = integer.replace(/^0+(?=\d)/, "");
  if (whole.length > 22) fail("AMOUNT_RANGE"); // financial_postings numeric(30,8)
  const minor = BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, "0") || "0");
  if (minor <= 0n) fail("AMOUNT_NOT_POSITIVE");
  return scale === 0 ? whole : whole + "." + fraction.padEnd(scale, "0");
}

// Date arithmetic is used only for calendar/offset validation, never money.
// Preserve PostgreSQL's six fractional digits; never round to JS milliseconds.
export function normalizeTimestamp(value) {
  if (typeof value !== "string") fail("INVALID_OCCURRED_AT");
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!m || m[0] !== value) fail("INVALID_OCCURRED_AT");
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || hour > 23 ||
      minute > 59 || second > 59 || m[8] === "-00:00") fail("INVALID_OCCURRED_AT");
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day) fail("INVALID_OCCURRED_AT");
  let offset = 0;
  if (m[8] !== "Z") {
    const oh = Number(m[8].slice(1, 3)), om = Number(m[8].slice(4, 6));
    if (oh > 14 || om > 59 || (oh === 14 && om !== 0)) fail("INVALID_OCCURRED_AT");
    offset = (oh * 60 + om) * (m[8][0] === "+" ? 1 : -1);
  }
  const utc = new Date(date.getTime() - offset * 60000);
  if (utc.getUTCFullYear() < 1 || utc.getUTCFullYear() > 9999) fail("INVALID_OCCURRED_AT");
  return utc.toISOString().slice(0, 19) + "." + (m[7] || "").padEnd(6, "0") + "Z";
}
function metadata(input) {
  if (present(input.description) && typeof input.description !== "string") fail("INVALID_METADATA");
  if (!present(input.reference_metadata)) return;
  onlyKeys(input.reference_metadata, ["reference", "evidence_ids"], "INVALID_METADATA");
  const { reference, evidence_ids } = input.reference_metadata;
  if (present(reference) && typeof reference !== "string") fail("INVALID_METADATA");
  if (present(evidence_ids)) {
    if (!Array.isArray(evidence_ids)) fail("INVALID_METADATA");
    for (const id of evidence_ids) uuid(id);
  }
}
function identity(input, context) {
  onlyKeys(input, [
    "action", "group_id", "request_id", "occurred_at", "amount", "currency",
    "account_id", "destination_account_id", "fund_id", "category_id", "member_id",
    "project_id", "description", "reference_metadata",
  ]);
  if (typeof input.action !== "string" || !Object.hasOwn(EFFECTS, input.action)) fail("EFFECT_NOT_ALLOWED");
  const spec = EFFECTS[input.action];
  const group_id = uuid(input.group_id);
  if (input.action === "opening") {
    if (context.channel !== "opening_internal") fail("PRIVATE_EFFECT");
    if (present(input.request_id)) fail("FIELD_PROHIBITED");
    const opening = context.opening_occurrence;
    if (!opening?.provenance) fail("OPENING_PROVENANCE_REQUIRED");
    if (opening.group_id !== group_id || opening.provenance.group_id !== group_id) fail("CROSS_GROUP_SOURCE");
    return {
      group_id, ...spec, request_id: null, source_module: "opening_finance",
      source_record_id: uuid(opening.occurrence_id),
      opening_provenance_id: uuid(opening.provenance.id),
    };
  }
  if (context.channel !== "manual") fail("SOURCE_NOT_ALLOWED");
  if (!present(input.request_id)) fail("REQUEST_ID_REQUIRED");
  const request_id = uuid(input.request_id);
  return {
    group_id, ...spec, request_id, source_module: "manual_finance",
    source_record_id: request_id, opening_provenance_id: null,
  };
}
function fields(input) {
  metadata(input);
  const f = { account_id: uuid(input.account_id), occurred_at: normalizeTimestamp(input.occurred_at) };
  for (const key of ["destination_account_id", "fund_id", "category_id", "member_id", "project_id"]) {
    f[key] = present(input[key]) ? uuid(input[key]) : null;
  }
  if (input.action === "transfer") {
    if (!f.destination_account_id) fail("DESTINATION_REQUIRED");
    if (f.account_id === f.destination_account_id) fail("SAME_ACCOUNT");
  } else if (f.destination_account_id) fail("FIELD_PROHIBITED");
  const operating = input.action === "money_in" || input.action === "money_out";
  if (operating && !f.category_id) fail("CATEGORY_REQUIRED");
  if (!operating && f.category_id) fail("CATEGORY_PROHIBITED");
  if (!operating && (f.member_id || f.project_id)) fail("ATTRIBUTION_PROHIBITED");
  if (!operating && !f.fund_id) fail("FUND_REQUIRED");
  return f;
}
function target(records, id, group, kind, active = false) {
  const row = records.find((record) => record.id === id);
  if (!row) fail(kind + "_NOT_FOUND");
  if (row.group_id !== group) fail("CROSS_GROUP_DIMENSION");
  if (active && row.status !== "active") fail(kind + "_INACTIVE");
  return row;
}
function resolveNew(input, id, f, context) {
  const account = target(context.accounts, f.account_id, id.group_id, "ACCOUNT", true);
  const code = currency(account.currency);
  if (present(input.currency) && currency(input.currency) !== code) fail("CURRENCY_MISMATCH");
  const epochs = context.epochs.filter((epoch) => epoch.group_id === id.group_id &&
    f.occurred_at >= normalizeTimestamp(epoch.effective_from) &&
    (!epoch.effective_to || f.occurred_at < normalizeTimestamp(epoch.effective_to)));
  if (epochs.length !== 1) fail(epochs.length ? "EPOCH_AMBIGUOUS" : "EPOCH_NOT_FOUND");
  const epoch = epochs[0];
  if (epoch.currency !== code) fail("EPOCH_CURRENCY_MISMATCH");
  function compatible(row) {
    const opened = context.epochs.find((e) => e.id === row.opened_ledger_epoch_id);
    if (!opened || opened.group_id !== id.group_id || opened.currency !== code ||
        normalizeTimestamp(opened.effective_from) > f.occurred_at ||
        normalizeTimestamp(row.opened_at) > f.occurred_at) fail("ACCOUNT_EPOCH_INCOMPATIBLE");
  }
  compatible(account);
  if (f.destination_account_id) {
    const destination = target(context.accounts, f.destination_account_id, id.group_id, "ACCOUNT", true);
    if (destination.currency !== code) fail("CROSS_CURRENCY_TRANSFER");
    compatible(destination);
  }
  let fund_id = f.fund_id;
  if (!fund_id) {
    const defaults = context.funds.filter((fund) => fund.group_id === id.group_id &&
      fund.is_default && fund.status === "active" && !fund.is_restricted);
    if (defaults.length !== 1) fail("DEFAULT_FUND_UNRESOLVED");
    fund_id = defaults[0].id;
  }
  target(context.funds, fund_id, id.group_id, "FUND", true);
  if (f.category_id) {
    const category = target(context.categories, f.category_id, id.group_id, "CATEGORY", true);
    const required = input.action === "money_in" ? "income" : "expense";
    if (category.category_class !== required) fail("CATEGORY_CLASS_MISMATCH");
  }
  if (f.member_id) target(context.members, f.member_id, id.group_id, "MEMBER");
  if (f.project_id) target(context.projects, f.project_id, id.group_id, "PROJECT");
  if (input.action === "money_out" && (!input.description || !input.description.trim())) fail("DESCRIPTION_REQUIRED");
  return { currency: code, ledger_epoch_id: epoch.id, fund_id };
}
function payload(input, id, f, resolved) {
  // Exact field set; recognition is derived and cannot be caller-supplied.
  return {
    contract_version: VERSION,
    group_id: id.group_id, ledger_epoch_id: resolved.ledger_epoch_id,
    event_class: id.event_class, effect_kind: id.effect_kind,
    currency: resolved.currency, amount: normalizeAmount(input.amount, resolved.currency),
    occurred_at: f.occurred_at, source_module: id.source_module,
    source_record_id: id.source_record_id, request_id: id.request_id,
    account_id: f.account_id, destination_account_id: f.destination_account_id,
    fund_id: resolved.fund_id, category_id: f.category_id,
    member_id: f.member_id, project_id: f.project_id,
    opening_provenance_id: id.opening_provenance_id,
  };
}
export function canonicalBytes(payload) {
  return JSON.stringify(Object.fromEntries(Object.keys(payload).sort().map((key) => [key, payload[key]])));
}
export function fingerprint(payload) {
  return createHash("sha256").update(canonicalBytes(payload), "utf8").digest("hex");
}
function postingSet(p) {
  const line = (control_class, amount_signed, account_id = null, category_id = null) => ({
    group_id: p.group_id, ledger_epoch_id: p.ledger_epoch_id, currency: p.currency,
    occurred_at: p.occurred_at, amount_signed, control_class, account_id, fund_id: p.fund_id,
    category_id, category_class: category_id ? control_class : null,
    member_id: p.member_id, project_id: p.project_id,
  });
  switch (p.effect_kind) {
    case "manual_income": return [
      line("custody", p.amount, p.account_id), line("income", "-" + p.amount, null, p.category_id),
    ];
    case "manual_expense": return [
      line("expense", p.amount, null, p.category_id), line("custody", "-" + p.amount, p.account_id),
    ];
    case "account_transfer": return [
      line("custody", "-" + p.amount, p.account_id), line("custody", p.amount, p.destination_account_id),
    ];
    case "opening_custody": return [
      line("custody", p.amount, p.account_id), line("opening_position", "-" + p.amount),
    ];
    default: fail("EFFECT_NOT_ALLOWED");
  }
}

// Pure decision over an explicit trusted fixture snapshot. No writes, SQL,
// network, lock implementation, event IDs generated, or mutable in-memory ledger.
export function evaluateCommand(input, context) {
  if (context.authorized !== true) fail("DENY"); // before sensitive lookup/return
  const id = identity(input, context);
  const existing = context.existing || [];
  const requests = id.request_id ? existing.filter((e) =>
    e.payload.group_id === id.group_id && e.payload.request_id === id.request_id) : [];
  const occurrences = existing.filter((e) => e.payload.group_id === id.group_id &&
    e.payload.source_module === id.source_module && e.payload.source_record_id === id.source_record_id &&
    e.payload.effect_kind === id.effect_kind); // deliberately NO epoch
  if (requests.length > 1 || occurrences.length > 1 ||
      (requests[0] && occurrences[0] && requests[0].event_id !== occurrences[0].event_id)) fail("OCCURRENCE_INTEGRITY");
  const bound = requests[0] || occurrences[0];
  const f = fields(input);
  if (bound) {
    const p = payload(input, id, f, {
      ledger_epoch_id: bound.payload.ledger_epoch_id,
      currency: present(input.currency) ? currency(input.currency) : bound.payload.currency,
      fund_id: f.fund_id || bound.payload.fund_id,
    });
    // Compare bytes as well as the digest; a malformed pre-existing binding fails closed.
    if (bound.payload.contract_version !== VERSION ||
        bound.fingerprint !== fingerprint(bound.payload)) fail("OCCURRENCE_INTEGRITY");
    if (canonicalBytes(p) !== canonicalBytes(bound.payload)) fail("CONFLICT");
    return {
      decision: "IDEMPOTENT_RETURN_EXISTING", event_id: bound.event_id,
      ledger_epoch_id: bound.payload.ledger_epoch_id, fingerprint: bound.fingerprint,
      new_event_count: 0, new_posting_count: 0,
    };
  }
  const p = payload(input, id, f, resolveNew(input, id, f, context));
  return {
    decision: "READY", payload: p, fingerprint: fingerprint(p), canonical_bytes: canonicalBytes(p),
    recognition: id.recognition, postings: postingSet(p),
    new_event_count: 1, new_posting_count: 2,
  };
}
