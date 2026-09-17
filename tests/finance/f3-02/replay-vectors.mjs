import {
  ID, TIME, uuid, moneyIn, moneyOut, transfer, opening, privateOpening,
} from "./vectors.mjs";

const nextEpoch = (c) => {
  c.epochs[0].effective_to = "2026-10-01T00:00:00Z";
  c.epochs.push({
    id: ID.futureEpoch, group_id: ID.group, currency: "XAF",
    effective_from: "2026-10-01T00:00:00Z", effective_to: null,
  });
};
const original = moneyIn();
const same = (name, patch = {}, setup) => ({
  name, original, retry: moneyIn(patch), setup, decision: "IDEMPOTENT_RETURN_EXISTING",
});
const conflict = (name, patch, setup) => ({
  name, original, retry: moneyIn(patch), setup, code: "CONFLICT",
});
export const replayVectors = [
  same("1 same manual request with normalized amount", { amount: "500.0", currency: "usd" }),
  conflict("2 same request changed amount", { amount: "501" }),
  same("3 source occurrence keeps original epoch after transition", {}, nextEpoch),
  conflict("4 source occurrence changed fund", { fund_id: ID.general }),
  conflict("5 source occurrence changed occurred_at", { occurred_at: "2026-09-09T12:00:00Z" }),
  conflict("6a source occurrence changed account", { account_id: ID.cash }),
  conflict("6b source occurrence changed category", { category_id: uuid(399) }),
  { ...same("7 revoked authorization"), setup: (c) => { c.authorized = false; }, decision: undefined, code: "DENY" },
  { name: "omitted default remains bound after default changes",
    original: moneyIn({ fund_id: undefined, currency: undefined }),
    retry: moneyIn({ fund_id: null, currency: null }),
    decision: "IDEMPOTENT_RETURN_EXISTING",
    setup: (c) => {
      c.funds.find((f) => f.id === ID.general).is_default = false;
      c.funds.push({ id: uuid(299), group_id: ID.group, status: "active", is_default: true, is_restricted: false });
      nextEpoch(c);
    } },
  same("explicit original default and omitted currency are equivalent", { amount: "00500.00", currency: null }),
  same("narrative and evidence change is not a new money event", {
    description: "Additional narrative",
    reference_metadata: { reference: "Receipt revised", evidence_ids: [uuid(999)] },
  }),
  same("historical inactive targets allow identical retry", {}, (c) => {
    for (const table of ["accounts", "funds", "categories"]) {
      for (const row of c[table]) row.status = table === "accounts" ? "closed" : "inactive";
    }
    nextEpoch(c);
  }),
  same("retry needs no current target/default/epoch resolution", {}, (c) => {
    c.accounts = []; c.funds = []; c.categories = []; c.epochs = [];
  }),
  same("equivalent instant using offset", { occurred_at: "2026-09-08T08:00:00-04:00" }),
  conflict("one microsecond is economic", { occurred_at: "2026-09-08T12:00:00.000001Z" }),
  conflict("new period is conflict even after epoch changes", { occurred_at: "2026-10-02T00:00:00Z" }, nextEpoch),
  conflict("currency changed on retry", { currency: "EUR" }),
  conflict("request reused for different allowed action", {
    action: "money_out", category_id: ID.venue, description: "Other use",
  }),
  conflict("member attribution changed", { member_id: ID.member }),
  conflict("project attribution changed", { project_id: ID.project }),
  { name: "changed destination on transfer", original: transfer(), retry: transfer({ destination_account_id: uuid(999) }), code: "CONFLICT" },
  { name: "private source replay without manual request across epochs",
    original: opening(), retry: opening({ amount: "10000" }), initialSetup: privateOpening,
    setup: nextEpoch, decision: "IDEMPOTENT_RETURN_EXISTING" },
  { name: "private source changed fund", original: opening(), retry: opening({ fund_id: ID.restricted }),
    initialSetup: privateOpening, code: "CONFLICT" },
  { name: "private provenance identity changed", original: opening(), retry: opening(),
    initialSetup: privateOpening, setup: (c) => { c.opening_occurrence.provenance.id = uuid(899); }, code: "CONFLICT" },
  { name: "description absent on existing expense is not an update", original: moneyOut(),
    retry: moneyOut({ description: null }), decision: "IDEMPOTENT_RETURN_EXISTING" },
  { ...same("two epochs already contain same source must fail closed"),
    setup: (c) => { c.existing.push({ ...c.existing[0], event_id: uuid(999) }); },
    decision: undefined, code: "OCCURRENCE_INTEGRITY" },
  { ...same("corrupt stored fingerprint must fail closed"),
    setup: (c) => { c.existing[0].fingerprint = "0".repeat(64); },
    decision: undefined, code: "OCCURRENCE_INTEGRITY" },
  { name: "duplicate private occurrence in another epoch fails closed", original: opening(), retry: opening(), initialSetup: privateOpening,
    setup: (c) => { c.existing.push({ ...c.existing[0], event_id: uuid(999), payload: { ...c.existing[0].payload, ledger_epoch_id: ID.futureEpoch } }); }, code: "OCCURRENCE_INTEGRITY" },
  { name: "separate request is a new economic occurrence", original,
    retry: moneyIn({ request_id: uuid(699) }), decision: "READY" },
  { name: "request identity is scoped to group", original, retry: moneyIn({
    group_id: ID.otherGroup, account_id: ID.otherBank, fund_id: ID.otherFund,
    category_id: ID.otherCategory, occurred_at: TIME,
  }), decision: "READY" },
];
