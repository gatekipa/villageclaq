// Independent, literal economic expectations. No oracle/production imports.
export const uuid = (n) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
export const ID = Object.freeze({
  group: uuid(1), otherGroup: uuid(2), xafGroup: uuid(3),
  epoch: uuid(21), otherEpoch: uuid(22), xafEpoch: uuid(23), futureEpoch: uuid(24),
  bank: uuid(101), cash: uuid(102), otherBank: uuid(103), xafBank: uuid(104), xafCash: uuid(105),
  general: uuid(201), restricted: uuid(202), otherFund: uuid(203), xafFund: uuid(204),
  donation: uuid(301), venue: uuid(302), otherCategory: uuid(303),
  xafIncome: uuid(304), xafExpense: uuid(305),
  member: uuid(401), otherMember: uuid(402), project: uuid(501), otherProject: uuid(502),
  request: uuid(601), opening: uuid(701), provenance: uuid(801), event: uuid(901),
});
export const TIME = "2026-09-08T12:00:00.000000Z";
const start = "2026-01-01T00:00:00Z";
export function fixtureContext() {
  const account = (id, group_id, opened_ledger_epoch_id, currency) => ({
    id, group_id, opened_ledger_epoch_id, currency, status: "active", opened_at: start,
  });
  const fund = (id, group_id, is_default = false, is_restricted = false) => ({
    id, group_id, is_default, is_restricted, status: "active",
  });
  const category = (id, group_id, category_class) => ({ id, group_id, category_class, status: "active" });
  return {
    authorized: true, channel: "manual", existing: [],
    epochs: [
      { id: ID.epoch, group_id: ID.group, currency: "USD", effective_from: start, effective_to: null },
      { id: ID.otherEpoch, group_id: ID.otherGroup, currency: "USD", effective_from: start, effective_to: null },
      { id: ID.xafEpoch, group_id: ID.xafGroup, currency: "XAF", effective_from: start, effective_to: null },
    ],
    accounts: [
      account(ID.bank, ID.group, ID.epoch, "USD"), account(ID.cash, ID.group, ID.epoch, "USD"),
      account(ID.otherBank, ID.otherGroup, ID.otherEpoch, "USD"),
      account(ID.xafBank, ID.xafGroup, ID.xafEpoch, "XAF"), account(ID.xafCash, ID.xafGroup, ID.xafEpoch, "XAF"),
    ],
    funds: [
      fund(ID.general, ID.group, true), fund(ID.restricted, ID.group, false, true),
      fund(ID.otherFund, ID.otherGroup, true), fund(ID.xafFund, ID.xafGroup, true),
    ],
    categories: [
      category(ID.donation, ID.group, "income"), category(ID.venue, ID.group, "expense"),
      category(ID.otherCategory, ID.otherGroup, "income"),
      category(ID.xafIncome, ID.xafGroup, "income"), category(ID.xafExpense, ID.xafGroup, "expense"),
    ],
    members: [{ id: ID.member, group_id: ID.group }, { id: ID.otherMember, group_id: ID.otherGroup }],
    projects: [{ id: ID.project, group_id: ID.group }, { id: ID.otherProject, group_id: ID.otherGroup }],
  };
}
export const moneyIn = (patch = {}) => ({
  action: "money_in", group_id: ID.group, request_id: ID.request, occurred_at: TIME,
  amount: "500.00", currency: "USD", account_id: ID.bank, fund_id: ID.restricted,
  category_id: ID.donation, ...patch,
});
export const moneyOut = (patch = {}) => moneyIn({
  action: "money_out", amount: "200.00", category_id: ID.venue, description: "Venue rental", ...patch,
});
export const transfer = (patch = {}) => moneyIn({
  action: "transfer", amount: "1000.00", destination_account_id: ID.cash,
  fund_id: ID.general, category_id: null, ...patch,
});
export const opening = (patch = {}) => moneyIn({
  action: "opening", request_id: null, amount: "10000.00", fund_id: ID.general, category_id: null, ...patch,
});
export function privateOpening(context) {
  context.channel = "opening_internal";
  context.opening_occurrence = { group_id: ID.group, occurrence_id: ID.opening,
    provenance: { id: ID.provenance, group_id: ID.group } };
}
const leg = (control_class, amount_signed, account_id = null, category_id = null) => ({
  control_class, amount_signed, account_id, category_id,
  category_class: category_id ? control_class : null,
});
// Fill shared dimensions from explicit expected data, not from the command or oracle.
const expected = (legs, fund, soa_income, soa_expense, cash, options = {}) => ({
  postings: legs.map((line) => ({
    ...line, group_id: options.group || ID.group, ledger_epoch_id: options.epoch || ID.epoch,
    currency: options.currency || "USD", occurred_at: options.time || TIME, fund_id: fund,
    member_id: options.member || null, project_id: options.project || null,
  })),
  soa_income, soa_expense, cash,
});
const xaf = { group: ID.xafGroup, epoch: ID.xafEpoch, currency: "XAF" };
const xafInput = {
  group_id: ID.xafGroup, currency: "XAF", account_id: ID.xafBank, fund_id: ID.xafFund,
};
export const validVectors = [
  { name: "USD restricted donation", input: moneyIn(), recognition: "operating_income",
    expected: expected([leg("custody", "500.00", ID.bank), leg("income", "-500.00", null, ID.donation)], ID.restricted, "500.00", "0.00", "500.00") },
  { name: "USD restricted venue", input: moneyOut(), recognition: "operating_expense",
    expected: expected([leg("expense", "200.00", null, ID.venue), leg("custody", "-200.00", ID.bank)], ID.restricted, "0.00", "200.00", "-200.00") },
  { name: "USD General transfer", input: transfer(), recognition: "neither",
    expected: expected([leg("custody", "-1000.00", ID.bank), leg("custody", "1000.00", ID.cash)], ID.general, "0.00", "0.00", "0.00") },
  { name: "USD General opening", input: opening(), setup: privateOpening, recognition: "neither",
    expected: expected([leg("custody", "10000.00", ID.bank), leg("opening_position", "-10000.00")], ID.general, "0.00", "0.00", "10000.00") },
  { name: "USD resolved General and account currency", input: moneyIn({ fund_id: undefined, currency: undefined }), recognition: "operating_income",
    expected: expected([leg("custody", "500.00", ID.bank), leg("income", "-500.00", null, ID.donation)], ID.general, "500.00", "0.00", "500.00") },
  { name: "USD income with member and project", input: moneyIn({ member_id: ID.member, project_id: ID.project }), recognition: "operating_income",
    expected: expected([leg("custody", "500.00", ID.bank), leg("income", "-500.00", null, ID.donation)], ID.restricted, "500.00", "0.00", "500.00", { member: ID.member, project: ID.project }) },
  { name: "USD expense with member and project", input: moneyOut({ member_id: ID.member, project_id: ID.project }), recognition: "operating_expense",
    expected: expected([leg("expense", "200.00", null, ID.venue), leg("custody", "-200.00", ID.bank)], ID.restricted, "0.00", "200.00", "-200.00", { member: ID.member, project: ID.project }) },
  { name: "USD exact minimum and lowercase currency", input: moneyIn({ amount: "0.01", currency: "usd" }), recognition: "operating_income",
    expected: expected([leg("custody", "0.01", ID.bank), leg("income", "-0.01", null, ID.donation)], ID.restricted, "0.01", "0.00", "0.01") },
  { name: "USD beyond JS safe integer", input: moneyIn({ amount: "9007199254740993.01" }), recognition: "operating_income",
    expected: expected([leg("custody", "9007199254740993.01", ID.bank), leg("income", "-9007199254740993.01", null, ID.donation)], ID.restricted, "9007199254740993.01", "0.00", "9007199254740993.01") },
  { name: "USD storage upper bound", input: moneyIn({ amount: "9999999999999999999999.99" }), recognition: "operating_income",
    expected: expected([leg("custody", "9999999999999999999999.99", ID.bank), leg("income", "-9999999999999999999999.99", null, ID.donation)], ID.restricted, "9999999999999999999999.99", "0.00", "9999999999999999999999.99") },
  { name: "XAF income", input: moneyIn({ ...xafInput, amount: "500", category_id: ID.xafIncome }), recognition: "operating_income",
    expected: expected([leg("custody", "500", ID.xafBank), leg("income", "-500", null, ID.xafIncome)], ID.xafFund, "500", "0", "500", xaf) },
  { name: "XAF expense", input: moneyOut({ ...xafInput, amount: "200", category_id: ID.xafExpense }), recognition: "operating_expense",
    expected: expected([leg("expense", "200", null, ID.xafExpense), leg("custody", "-200", ID.xafBank)], ID.xafFund, "0", "200", "-200", xaf) },
  { name: "XAF transfer", input: transfer({ ...xafInput, amount: "1000", destination_account_id: ID.xafCash }), recognition: "neither",
    expected: expected([leg("custody", "-1000", ID.xafBank), leg("custody", "1000", ID.xafCash)], ID.xafFund, "0", "0", "0", xaf) },
  { name: "XAF opening", input: opening({ ...xafInput, amount: "10000" }), setup: (c) => {
    privateOpening(c); c.opening_occurrence.group_id = ID.xafGroup; c.opening_occurrence.provenance.group_id = ID.xafGroup;
  }, recognition: "neither",
    expected: expected([leg("custody", "10000", ID.xafBank), leg("opening_position", "-10000")], ID.xafFund, "0", "0", "10000", xaf) },
  { name: "microsecond timestamp with timezone offset", input: moneyIn({ occurred_at: "2026-09-08T08:00:00.123456-04:00" }), recognition: "operating_income",
    expected: expected([leg("custody", "500.00", ID.bank), leg("income", "-500.00", null, ID.donation)], ID.restricted, "500.00", "0.00", "500.00", { time: "2026-09-08T12:00:00.123456Z" }) },
  { name: "epoch inclusive start", input: moneyIn({ occurred_at: start }), recognition: "operating_income",
    expected: expected([leg("custody", "500.00", ID.bank), leg("income", "-500.00", null, ID.donation)], ID.restricted, "500.00", "0.00", "500.00", { time: "2026-01-01T00:00:00.000000Z" }) },
];
const neg = (name, input, code, setup) => ({ name, input, code, setup });
const edit = (table, id, patch) => (c) => Object.assign(c[table].find((row) => row.id === id), patch);
export const negativeVectors = [
  neg("zero", moneyIn({ amount: "0.00" }), "AMOUNT_NOT_POSITIVE"),
  neg("negative", moneyIn({ amount: "-1" }), "AMOUNT_NOT_POSITIVE"),
  neg("NaN text", moneyIn({ amount: "NaN" }), "INVALID_AMOUNT"),
  neg("infinity text", moneyIn({ amount: "Infinity" }), "INVALID_AMOUNT"),
  neg("numeric input", moneyIn({ amount: 500 }), "INVALID_AMOUNT"),
  neg("scientific notation", moneyIn({ amount: "5e2" }), "INVALID_AMOUNT"),
  neg("localized amount", moneyIn({ amount: "1,000.00" }), "INVALID_AMOUNT"),
  neg("amount whitespace", moneyIn({ amount: " 500.00" }), "INVALID_AMOUNT"),
  neg("amount trailing newline", moneyIn({ amount: "500\n" }), "INVALID_AMOUNT"),
  neg("signed positive", moneyIn({ amount: "+500" }), "INVALID_AMOUNT"),
  neg("excess USD precision", moneyIn({ amount: "0.001" }), "AMOUNT_PRECISION"),
  neg("excess trailing zero precision", moneyIn({ amount: "500.000" }), "AMOUNT_PRECISION"),
  neg("storage overflow", moneyIn({ amount: "10000000000000000000000" }), "AMOUNT_RANGE"),
  neg("fractional XAF", moneyIn({ ...xafInput, amount: "500.5", category_id: ID.xafIncome }), "AMOUNT_PRECISION"),
  neg("XAF decimal notation", moneyIn({ ...xafInput, amount: "500.0", category_id: ID.xafIncome }), "AMOUNT_PRECISION"),
  neg("income category required", moneyIn({ category_id: null }), "CATEGORY_REQUIRED"),
  neg("income expense category", moneyIn({ category_id: ID.venue }), "CATEGORY_CLASS_MISMATCH"),
  neg("expense category required", moneyOut({ category_id: undefined }), "CATEGORY_REQUIRED"),
  neg("expense income category", moneyOut({ category_id: ID.donation }), "CATEGORY_CLASS_MISMATCH"),
  neg("expense description required", moneyOut({ description: " " }), "DESCRIPTION_REQUIRED"),
  neg("transfer category", transfer({ category_id: ID.donation }), "CATEGORY_PROHIBITED"),
  neg("opening category", opening({ category_id: ID.donation }), "CATEGORY_PROHIBITED", privateOpening),
  neg("transfer same account", transfer({ destination_account_id: ID.bank }), "SAME_ACCOUNT"),
  neg("transfer missing destination", transfer({ destination_account_id: null }), "DESTINATION_REQUIRED"),
  neg("transfer cross currency", transfer(), "CROSS_CURRENCY_TRANSFER", edit("accounts", ID.cash, { currency: "XAF" })),
  neg("transfer cross group destination", transfer({ destination_account_id: ID.otherBank }), "CROSS_GROUP_DIMENSION"),
  neg("transfer inactive destination", transfer(), "ACCOUNT_INACTIVE", edit("accounts", ID.cash, { status: "inactive" })),
  neg("transfer closed source", transfer(), "ACCOUNT_INACTIVE", edit("accounts", ID.bank, { status: "closed" })),
  neg("transfer zero amount", transfer({ amount: "0" }), "AMOUNT_NOT_POSITIVE"),
  neg("transfer missing fund", transfer({ fund_id: null }), "FUND_REQUIRED"),
  neg("transfer nonexistent fund", transfer({ fund_id: uuid(999) }), "FUND_NOT_FOUND"),
  neg("cross group account", moneyIn({ account_id: ID.otherBank }), "CROSS_GROUP_DIMENSION"),
  neg("cross group fund", moneyIn({ fund_id: ID.otherFund }), "CROSS_GROUP_DIMENSION"),
  neg("cross group category", moneyIn({ category_id: ID.otherCategory }), "CROSS_GROUP_DIMENSION"),
  neg("cross group member", moneyIn({ member_id: ID.otherMember }), "CROSS_GROUP_DIMENSION"),
  neg("cross group project", moneyIn({ project_id: ID.otherProject }), "CROSS_GROUP_DIMENSION"),
  neg("inactive account", moneyIn(), "ACCOUNT_INACTIVE", edit("accounts", ID.bank, { status: "inactive" })),
  neg("inactive fund", moneyIn(), "FUND_INACTIVE", edit("funds", ID.restricted, { status: "inactive" })),
  neg("inactive category", moneyIn(), "CATEGORY_INACTIVE", edit("categories", ID.donation, { status: "inactive" })),
  neg("nonexistent account", moneyIn({ account_id: uuid(999) }), "ACCOUNT_NOT_FOUND"),
  neg("nonexistent category", moneyIn({ category_id: uuid(999) }), "CATEGORY_NOT_FOUND"),
  neg("nonexistent member", moneyIn({ member_id: uuid(999) }), "MEMBER_NOT_FOUND"),
  neg("nonexistent project", moneyIn({ project_id: uuid(999) }), "PROJECT_NOT_FOUND"),
  neg("missing default", moneyIn({ fund_id: null }), "DEFAULT_FUND_UNRESOLVED", edit("funds", ID.general, { is_default: false })),
  neg("ambiguous default", moneyIn({ fund_id: null }), "DEFAULT_FUND_UNRESOLVED", edit("funds", ID.restricted, { is_default: true, is_restricted: false })),
  neg("outside epoch", moneyIn({ occurred_at: "2025-12-31T23:59:59.999999Z" }), "EPOCH_NOT_FOUND"),
  neg("epoch exclusive end", moneyIn(), "EPOCH_NOT_FOUND", edit("epochs", ID.epoch, { effective_to: TIME })),
  neg("overlapping epoch snapshot", moneyIn(), "EPOCH_AMBIGUOUS", (c) => c.epochs.push({ ...c.epochs[0], id: ID.futureEpoch })),
  neg("epoch currency mismatch", moneyIn(), "EPOCH_CURRENCY_MISMATCH", edit("epochs", ID.epoch, { currency: "XAF" })),
  neg("account opened in other tenant epoch", moneyIn(), "ACCOUNT_EPOCH_INCOMPATIBLE", edit("accounts", ID.bank, { opened_ledger_epoch_id: ID.otherEpoch })),
  neg("destination not yet opened", transfer(), "ACCOUNT_EPOCH_INCOMPATIBLE", edit("accounts", ID.cash, { opened_at: "2026-09-09T00:00:00Z" })),
  neg("invalid calendar date", moneyIn({ occurred_at: "2026-02-30T12:00:00Z" }), "INVALID_OCCURRED_AT"),
  neg("date without timezone", moneyIn({ occurred_at: "2026-09-08T12:00:00" }), "INVALID_OCCURRED_AT"),
  neg("timestamp excess precision", moneyIn({ occurred_at: "2026-09-08T12:00:00.1234567Z" }), "INVALID_OCCURRED_AT"),
  neg("leap second", moneyIn({ occurred_at: "2026-09-08T12:00:60Z" }), "INVALID_OCCURRED_AT"),
  neg("unknown timezone offset", moneyIn({ occurred_at: "2026-09-08T12:00:00-00:00" }), "INVALID_OCCURRED_AT"),
  neg("invalid offset", moneyIn({ occurred_at: "2026-09-08T12:00:00+14:01" }), "INVALID_OCCURRED_AT"),
  neg("unsupported currency", moneyIn({ currency: "BTC" }), "UNSUPPORTED_CURRENCY"),
  neg("currency whitespace", moneyIn({ currency: " USD" }), "UNSUPPORTED_CURRENCY"),
  neg("display currency is not authority", moneyIn({ currency: "XAF" }), "CURRENCY_MISMATCH"),
  neg("arbitrary effect action", moneyIn({ action: "loan_principal" }), "EFFECT_NOT_ALLOWED"),
  neg("public opening forbidden", opening(), "PRIVATE_EFFECT"),
  neg("missing opening provenance", opening(), "OPENING_PROVENANCE_REQUIRED", (c) => { c.channel = "opening_internal"; }),
  neg("cross group opening occurrence", opening(), "CROSS_GROUP_SOURCE", (c) => { privateOpening(c); c.opening_occurrence.group_id = ID.otherGroup; }),
  neg("cross group opening provenance", opening(), "CROSS_GROUP_SOURCE", (c) => { privateOpening(c); c.opening_occurrence.provenance.group_id = ID.otherGroup; }),
  neg("opening request prohibited", opening({ request_id: ID.request }), "FIELD_PROHIBITED", privateOpening),
  neg("opening fund required", opening({ fund_id: null }), "FUND_REQUIRED", privateOpening),
  neg("opening member prohibited", opening({ member_id: ID.member }), "ATTRIBUTION_PROHIBITED", privateOpening),
  neg("transfer project prohibited", transfer({ project_id: ID.project }), "ATTRIBUTION_PROHIBITED"),
  neg("income destination prohibited", moneyIn({ destination_account_id: ID.cash }), "FIELD_PROHIBITED"),
  neg("manual request required", moneyIn({ request_id: null }), "REQUEST_ID_REQUIRED"),
  neg("array cannot select action", moneyIn({ action: ["money_in"] }), "EFFECT_NOT_ALLOWED"),
  neg("UUID trailing newline", moneyIn({ account_id: ID.bank + "\n" }), "INVALID_UUID"),
  neg("timestamp trailing newline", moneyIn({ occurred_at: TIME + "\n" }), "INVALID_OCCURRED_AT"),
  neg("invalid UUID", moneyIn({ account_id: "bank" }), "INVALID_UUID"),
  neg("invalid evidence metadata", moneyIn({ reference_metadata: { arbitrary: 1 } }), "INVALID_METADATA"),
  neg("wrong trusted channel", moneyIn(), "SOURCE_NOT_ALLOWED", (c) => { c.channel = "dues"; }),
  neg("unauthorized", moneyIn(), "DENY", (c) => { c.authorized = false; }),
  ...["effect_kind", "source_module", "source_record_id", "ledger_epoch_id", "postings",
    "control_class", "amount_signed", "recognized_income", "recognized_expense", "created_by",
    "status", "economic_payload_fingerprint", "destination_fund_id", "category_class",
    "event_class", "opening_provenance_id", "ui_locale"].map((field) =>
      neg("caller authority forbidden: " + field, moneyIn({ [field]: "dues" }), "UNSUPPORTED_FIELD")),
];

// Future capabilities only: no command/action entries and no subledger writes.
export const capabilityVectors = [
  { name: "loan principal disbursement", expected: expected([
    leg("receivable", "1000.00"), leg("custody", "-1000.00", ID.bank),
  ], ID.general, "0.00", "0.00", "-1000.00") },
  { name: "loan principal repayment", expected: expected([
    leg("custody", "200.00", ID.bank), leg("receivable", "-200.00"),
  ], ID.general, "0.00", "0.00", "200.00") },
  { name: "member savings held", expected: expected([
    leg("custody", "100.00", ID.bank), leg("liability", "-100.00"),
  ], ID.general, "0.00", "0.00", "100.00") },
];
