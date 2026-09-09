// Independent fixture catalog and literal expected results. No oracle imports.
export const id = (n) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
export const ID = Object.freeze({ group: id(1), other: id(2), xafGroup: id(3), epoch: id(21),
  xafEpoch: id(22), laterEpoch: id(23), bank: id(101), cash: id(102), xafBank: id(104), xafCash: id(105),
  general: id(201), restricted: id(202), xafGeneral: id(204), xafRestricted: id(205),
  donation: id(301), venue: id(302), xafDonation: id(304), xafVenue: id(305),
  member: id(401), member2: id(402), project: id(501), project2: id(502), actor: id(601) });
export const T = Object.freeze({ start: "2026-01-01T00:00:00.000000Z", in: "2026-09-01T00:00:00.000000Z",
  out: "2026-09-02T00:00:00.000000Z", transfer: "2026-09-03T00:00:00.000000Z",
  end: "2026-10-01T00:00:00.000000Z", observed: "2026-11-01T00:00:00.000000Z" });
export const QUERY = Object.freeze({ group_id: ID.group, from: T.start, to: T.end, as_of_exclusive: T.end });
export const eventId = (n) => id(1000 + n);
export const postingId = (ref) => { const [event, leg] = ref.split(":").map(Number); return id(10000 + event * 10 + leg); };
export const refs = (...events) => events.flatMap((n) => [`${n}:0`, `${n}:1`]);
const negate = (amount) => amount.startsWith("-") ? amount.slice(1) : "-" + amount;

export function event(n, type, amount, options = {}) {
  const group_id = options.group_id ?? ID.group;
  const currency = options.currency ?? "USD";
  const occurred_at = options.time ?? T.in;
  const ledger_epoch_id = options.epoch ?? ID.epoch;
  const fund_id = ID[options.fund ?? "restricted"];
  const member_id = options.member ? ID[options.member] : null;
  const project_id = options.project ? ID[options.project] : null;
  const account = ID[options.account ?? "bank"];
  const category = ID[options.category ?? (type === "expense" ? "venue" : "donation")];
  const e = { id: eventId(n), group_id, currency, ledger_epoch_id, occurred_at,
    posted_at: options.posted_at ?? T.observed, created_by: ID.actor,
    event_class: { income: "money_in", expense: "money_out", transfer: "transfer", opening: "opening_adjustment",
      receivable: "money_out", liability: "money_in" }[type],
    effect_kind: { income: "manual_income", expense: "manual_expense", transfer: "account_transfer",
      opening: "opening_custody", receivable: "fixture_receivable", liability: "fixture_liability" }[type],
    status: "posted", source_module: "stage_a_fixture", source_record_id: `occurrence-${n}`, request_id: id(2000 + n),
    description: `Fixture ${n}`, reference_metadata: { reference: `REF-${n}`, internal_secret: "DO NOT RETURN" },
    economic_payload_fingerprint: "f".repeat(64), canonical_payload: { private: "DO NOT RETURN" },
    reversal_of_event_id: null, replacement_event_id: null, corrected_at: null, correction_reason: null,
    ...options.audit };
  const leg = (control_class, amount_signed, account_id = null, category_id = null) => ({
    control_class, amount_signed, account_id, category_id, category_class: category_id ? control_class : null,
  });
  const lines = options.lines ?? {
    income: [leg("custody", amount, account), leg("income", negate(amount), null, category)],
    expense: [leg("custody", negate(amount), account), leg("expense", amount, null, category)],
    transfer: [leg("custody", negate(amount), account), leg("custody", amount, ID[options.destination ?? "cash"])],
    opening: [leg("custody", amount, account), leg("opening_position", negate(amount))],
    receivable: [leg("custody", negate(amount), account), leg("receivable", amount)],
    liability: [leg("custody", amount, account), leg("liability", negate(amount))],
  }[type];
  return { event: e, postings: lines.map((line, i) => ({ id: postingId(`${n}:${i}`), event_id: e.id,
    group_id, ledger_epoch_id, currency, occurred_at, fund_id, member_id, project_id, ...line })) };
}
export function snapshot(...sets) {
  return { snapshot_id: "fixture-snapshot-1", observed_at: T.observed,
    events: sets.map((s) => s.event), postings: sets.flatMap((s) => s.postings),
    // Lifecycle/display fixtures are deliberately separate from monetary facts.
    display: { accounts: [{ id: ID.bank, name: "Bank", status: "active" }, { id: ID.cash, name: "Cash", status: "active" }],
      funds: [{ id: ID.general, name: "General", status: "active" }, { id: ID.restricted, name: "Restricted", status: "active" }],
      categories: [{ id: ID.donation, name: "Donation", category_class: "income", status: "active" },
        { id: ID.venue, name: "Venue", category_class: "expense", status: "active" }] } };
}
export const foundation = () => snapshot(event(1, "opening", "10000.00", { fund: "general", time: T.start }),
  event(2, "income", "500.00"), event(3, "expense", "200.00", { time: T.out }),
  event(4, "transfer", "1000.00", { fund: "general", time: T.transfer }));
export const correction = () => {
  const s = foundation();
  Object.assign(s.events[1], { status: "corrected", replacement_event_id: eventId(6), corrected_at: T.observed, correction_reason: "Correct 500 to 450" });
  const reversal = event(5, "income", "-500.00", { audit: { reversal_of_event_id: eventId(2) } });
  const replacement = event(6, "income", "450.00");
  s.events.push(reversal.event, replacement.event); s.postings.push(...reversal.postings, ...replacement.postings);
  return s;
};
export const xaf = (group_id = ID.xafGroup, historical = false) => {
  const o = { group_id, currency: "XAF", epoch: ID.xafEpoch, account: "xafBank", fund: "xafGeneral" };
  const time = (t) => historical ? t.replace("2026", "2025") : t;
  return snapshot(event(11, "opening", "2000000", { ...o, time: time(T.start) }),
    event(12, "income", "600000", { ...o, fund: "xafRestricted", category: "xafDonation", time: time(T.in) }),
    event(13, "expense", "100000", { ...o, fund: "xafRestricted", category: "xafVenue", time: time(T.out) }),
    event(14, "transfer", "400000", { ...o, destination: "xafCash", time: time(T.transfer) }));
};
export function combine(...snapshots) {
  return { ...snapshots[0], events: snapshots.flatMap((s) => s.events), postings: snapshots.flatMap((s) => s.postings) };
}

// Tuple formats are documented in README. Amounts and contributing posting IDs
// below are literal expectations, never obtained by running the oracle.
const usd = (dimension, amount, population) => [dimension, "USD", amount, population];
const inc = (amount, population, fund = "restricted", member = null, project = null) =>
  ["USD", "donation", "income", fund, member, project, amount, population];
const exp = (amount, population) => ["USD", "venue", "expense", "restricted", null, null, amount, population];
export const book = (ref, amount, running, o = {}) => [ref, o.currency ?? "USD", o.account ?? "bank", o.fund ?? "restricted",
  o.member ?? null, o.project ?? null, amount, running, o.type ?? "operating_income",
  o.categories ?? ["donation"], o.controls ?? ["income"]];
const openBook = (ref, amount, running, fund = "general") => book(ref, amount, running, { fund, type: "opening_position", categories: [], controls: ["opening_position"] });
const outBook = (ref, amount, running) => book(ref, amount, running, { type: "operating_expense", categories: ["venue"], controls: ["expense"] });
const transferBook = (ref, account, amount, running) => book(ref, amount, running, { account, fund: "general", type: "internal_account_transfer", categories: [], controls: [] });
const gold = ({ accounts = [], funds = [], position = funds, org = [], income = [], expense = [], soa = [], book: b = [],
  included = [], balances = included, activity = included }) => ({ accounts, funds, position, org, income, expense, soa, book: b, included, balances, activity });
export const FOUNDATION = gold({
  accounts: [usd("bank", "9300.00", ["1:0", "2:0", "3:0", "4:0"]), usd("cash", "1000.00", ["4:1"])],
  funds: [usd("general", "10000.00", ["1:0", "4:0", "4:1"]), usd("restricted", "300.00", ["2:0", "3:0"])],
  org: [["USD", "10300.00", ["1:0", "2:0", "3:0", "4:0", "4:1"]]],
  income: [inc("500.00", ["2:1"])], expense: [exp("200.00", ["3:1"])], soa: [["USD", "500.00", "200.00", "300.00", ["2:1", "3:1"]]],
  book: [openBook("1:0", "10000.00", "10000.00"), book("2:0", "500.00", "10500.00"),
    outBook("3:0", "-200.00", "10300.00"), transferBook("4:0", "bank", "-1000.00", "9300.00"), transferBook("4:1", "cash", "1000.00", "1000.00")],
  included: refs(1, 2, 3, 4),
});
export const CORRECTION = gold({
  accounts: [usd("bank", "9250.00", ["1:0", "2:0", "3:0", "4:0", "5:0", "6:0"]), usd("cash", "1000.00", ["4:1"])],
  funds: [usd("general", "10000.00", ["1:0", "4:0", "4:1"]), usd("restricted", "250.00", ["2:0", "3:0", "5:0", "6:0"])],
  org: [["USD", "10250.00", ["1:0", "2:0", "3:0", "4:0", "4:1", "5:0", "6:0"]]],
  income: [inc("450.00", ["2:1", "5:1", "6:1"])], expense: [exp("200.00", ["3:1"])], soa: [["USD", "450.00", "200.00", "250.00", ["2:1", "3:1", "5:1", "6:1"]]],
  book: [openBook("1:0", "10000.00", "10000.00"), book("2:0", "500.00", "10500.00"), book("5:0", "-500.00", "10000.00"),
    book("6:0", "450.00", "10450.00"), outBook("3:0", "-200.00", "10250.00"),
    transferBook("4:0", "bank", "-1000.00", "9250.00"), transferBook("4:1", "cash", "1000.00", "1000.00")],
  included: refs(1, 2, 3, 4, 5, 6),
});
const xbook = (ref, amount, running, fund, type, categories, controls, account = "xafBank") =>
  book(ref, amount, running, { currency: "XAF", account, fund, type, categories, controls });
export const XAF = gold({
  accounts: [["xafBank", "XAF", "2100000", ["11:0", "12:0", "13:0", "14:0"]], ["xafCash", "XAF", "400000", ["14:1"]]],
  funds: [["xafGeneral", "XAF", "2000000", ["11:0", "14:0", "14:1"]], ["xafRestricted", "XAF", "500000", ["12:0", "13:0"]]],
  org: [["XAF", "2500000", ["11:0", "12:0", "13:0", "14:0", "14:1"]]],
  income: [["XAF", "xafDonation", "income", "xafRestricted", null, null, "600000", ["12:1"]]],
  expense: [["XAF", "xafVenue", "expense", "xafRestricted", null, null, "100000", ["13:1"]]],
  soa: [["XAF", "600000", "100000", "500000", ["12:1", "13:1"]]],
  book: [xbook("11:0", "2000000", "2000000", "xafGeneral", "opening_position", [], ["opening_position"]),
    xbook("12:0", "600000", "2600000", "xafRestricted", "operating_income", ["xafDonation"], ["income"]),
    xbook("13:0", "-100000", "2500000", "xafRestricted", "operating_expense", ["xafVenue"], ["expense"]),
    xbook("14:0", "-400000", "2100000", "xafGeneral", "internal_account_transfer", [], []),
    xbook("14:1", "400000", "400000", "xafGeneral", "internal_account_transfer", [], [], "xafCash")], included: refs(11, 12, 13, 14),
});

const single = (name, set, expected, query = QUERY) => ({ name, snapshot: snapshot(set), query, expected });
const oneCash = (amount, type = "income", fund = "restricted") => gold({
  accounts: [usd("bank", amount, ["1:0"])], funds: [usd(fund, amount, ["1:0"])], org: [["USD", amount, ["1:0"]]],
  income: type === "income" ? [inc(amount, ["1:1"], fund)] : [],
  soa: [["USD", type === "income" ? amount : "0.00", "0.00", type === "income" ? amount : "0.00", type === "income" ? ["1:1"] : []]],
  book: [type === "opening" ? openBook("1:0", amount, amount, fund) : book("1:0", amount, amount, { fund })], included: refs(1),
});
export const validVectors = [
  single("opening / General", event(1, "opening", "10000.00", { fund: "general", time: T.start }), oneCash("10000.00", "opening", "general")),
  single("Money In / restricted", event(1, "income", "500.00"), oneCash("500.00")),
  single("Money Out / restricted", event(1, "expense", "200.00"), gold({ accounts: [usd("bank", "-200.00", ["1:0"])],
    funds: [usd("restricted", "-200.00", ["1:0"])], org: [["USD", "-200.00", ["1:0"]]], expense: [exp("200.00", ["1:1"])],
    soa: [["USD", "0.00", "200.00", "-200.00", ["1:1"]]], book: [outBook("1:0", "-200.00", "-200.00")], included: refs(1) })),
  single("Transfer / General", event(1, "transfer", "1000.00", { fund: "general" }), gold({
    accounts: [usd("bank", "-1000.00", ["1:0"]), usd("cash", "1000.00", ["1:1"])], funds: [usd("general", "0.00", refs(1))],
    org: [["USD", "0.00", refs(1)]], soa: [["USD", "0.00", "0.00", "0.00", []]],
    book: [transferBook("1:0", "bank", "-1000.00", "-1000.00"), transferBook("1:1", "cash", "1000.00", "1000.00")], included: refs(1) })),
  single("Money In / General", event(1, "income", "500.00", { fund: "general" }), oneCash("500.00", "income", "general")),
  single("opening / restricted", event(1, "opening", "500.00"), oneCash("500.00", "opening")),
  ...[
    ["receivable disbursement", "receivable", "1000.00", "-1000.00", "receivable_movement"],
    ["receivable repayment", "receivable", "-200.00", "200.00", "receivable_movement"],
    ["liability receipt", "liability", "100.00", "100.00", "liability_movement"],
    ["liability payout", "liability", "-100.00", "-100.00", "liability_movement"],
  ].map(([name, type, input, cash, movement]) => single(name, event(1, type, input, { fund: "general" }), gold({
    accounts: [usd("bank", cash, ["1:0"])], funds: [usd("general", cash, ["1:0"])], position: [usd("general", "0.00", refs(1))],
    org: [["USD", cash, ["1:0"]]], soa: [["USD", "0.00", "0.00", "0.00", []]],
    book: [book("1:0", cash, cash, { fund: "general", type: movement, controls: [type], categories: [] })], included: refs(1) }))),
  { name: "USD foundation", snapshot: foundation(), query: QUERY, expected: FOUNDATION },
  { name: "correction extension / include corrected original", snapshot: correction(), query: QUERY, expected: CORRECTION },
];
const isolated = correction();
isolated.events = isolated.events.filter((e) => [eventId(2), eventId(5), eventId(6)].includes(e.id));
isolated.postings = isolated.postings.filter((p) => isolated.events.some((e) => e.id === p.event_id));
validVectors.push({ name: "isolated original + exact reversal + replacement", snapshot: isolated, query: QUERY, expected: gold({
  accounts: [usd("bank", "450.00", ["2:0", "5:0", "6:0"])], funds: [usd("restricted", "450.00", ["2:0", "5:0", "6:0"])],
  org: [["USD", "450.00", ["2:0", "5:0", "6:0"]]], income: [inc("450.00", ["2:1", "5:1", "6:1"])],
  soa: [["USD", "450.00", "0.00", "450.00", ["2:1", "5:1", "6:1"]]],
  book: [book("2:0", "500.00", "500.00"), book("5:0", "-500.00", "0.00"), book("6:0", "450.00", "450.00")], included: refs(2, 5, 6) }) });
for (const status of ["inactive", "closed"]) {
  const s = foundation(); s.display.accounts[0].status = status;
  validVectors.push({ name: `${status} account history`, snapshot: s, query: QUERY, expected: FOUNDATION });
}
const archived = foundation();
archived.display.funds[1].status = "inactive"; archived.display.categories.forEach((c) => { c.status = "inactive"; });
validVectors.push({ name: "archived fund/category history", snapshot: archived, query: QUERY, expected: FOUNDATION });
validVectors.push({ name: "independent XAF foundation", snapshot: xaf(), query: { ...QUERY, group_id: ID.xafGroup }, expected: XAF });
const combinedGold = Object.fromEntries(Object.keys(FOUNDATION).map((k) => [k, [...FOUNDATION[k], ...XAF[k]]]));
combinedGold.book = [...XAF.book, ...FOUNDATION.book];
validVectors.push({ name: "one group historical USD/XAF buckets", snapshot: combine(foundation(), xaf(ID.group, true)),
  query: { ...QUERY, from: "2025-01-01T00:00:00Z" }, expected: combinedGold });
validVectors.push({ name: "other group excluded without cross-tenant netting", snapshot: combine(foundation(), xaf()), query: QUERY, expected: FOUNDATION });
const tied = foundation();
tied.events.forEach((e) => { e.occurred_at = T.in; }); tied.postings.forEach((p) => { p.occurred_at = T.in; });
tied.events.reverse(); tied.postings.reverse();
validVectors.push({ name: "equal-time event UUID order independent of storage order", snapshot: tied, query: QUERY, expected: FOUNDATION });
const mixed = event(7, "income", "10.00", { lines: [
  { control_class: "custody", amount_signed: "10.00", account_id: ID.bank, category_id: null, category_class: null },
  { control_class: "custody", amount_signed: "-3.00", account_id: ID.bank, category_id: null, category_class: null },
  { control_class: "income", amount_signed: "-10.00", account_id: null, category_id: ID.donation, category_class: "income" },
  { control_class: "expense", amount_signed: "3.00", account_id: null, category_id: ID.venue, category_class: "expense" },
] });
const mixedSnapshot = snapshot(mixed); mixedSnapshot.postings.reverse();
validVectors.push({ name: "equal event/time posting UUID tie / mixed context without duplication", snapshot: mixedSnapshot, query: QUERY, expected: gold({
  accounts: [usd("bank", "7.00", ["7:0", "7:1"])], funds: [usd("restricted", "7.00", ["7:0", "7:1"])], org: [["USD", "7.00", ["7:0", "7:1"]]],
  income: [inc("10.00", ["7:2"])], expense: [exp("3.00", ["7:3"])], soa: [["USD", "10.00", "3.00", "7.00", ["7:2", "7:3"]]],
  book: [book("7:0", "10.00", "10.00", { type: "mixed_non_custody", categories: ["donation", "venue"], controls: ["expense", "income"] }),
    book("7:1", "-3.00", "7.00", { type: "mixed_non_custody", categories: ["donation", "venue"], controls: ["expense", "income"] })],
  included: ["7:0", "7:1", "7:2", "7:3"] }) });
validVectors.push({ name: "paginated running balance retains pre-period and pre-page history", snapshot: foundation(),
  query: { ...QUERY, from: T.in }, expected: { ...FOUNDATION, book: FOUNDATION.book.slice(1), activity: refs(2, 3, 4) },
  page: { account_id: ID.bank, currency: "USD", offset: 1, limit: 2, opening: "10500.00", ids: ["3:0", "4:0"], running: ["10300.00", "9300.00"], total: 3 } });
const boundaries = snapshot(event(1, "income", "1.00", { time: "2026-08-31T23:59:59.999999Z" }), event(2, "income", "2.00"),
  event(3, "income", "3.00", { time: "2026-09-01T23:59:59.999999Z" }), event(4, "income", "4.00", { time: T.out }));
const boundaryGold = gold({ accounts: [usd("bank", "6.00", ["1:0", "2:0", "3:0"])], funds: [usd("restricted", "6.00", ["1:0", "2:0", "3:0"])],
  org: [["USD", "6.00", ["1:0", "2:0", "3:0"]]], income: [inc("5.00", ["2:1", "3:1"])], soa: [["USD", "5.00", "0.00", "5.00", ["2:1", "3:1"]]],
  book: [book("2:0", "2.00", "3.00"), book("3:0", "3.00", "6.00")], included: refs(1, 2, 3, 4), balances: refs(1, 2, 3), activity: refs(2, 3) });
validVectors.push({ name: "half-open period / microsecond boundary", snapshot: boundaries, query: { ...QUERY, from: T.in, to: T.out, as_of_exclusive: T.out }, expected: boundaryGold });
validVectors.push({ name: "exclusive as-of independent of activity period", snapshot: boundaries, query: { ...QUERY, from: T.in, to: T.out, as_of_exclusive: T.in },
  expected: { ...boundaryGold, accounts: [usd("bank", "1.00", ["1:0"])], funds: [usd("restricted", "1.00", ["1:0"])],
    position: [usd("restricted", "1.00", ["1:0"])], org: [["USD", "1.00", ["1:0"]]], balances: refs(1) } });
validVectors.push({ name: "timezone equivalent boundaries", snapshot: boundaries,
  query: { ...QUERY, from: "2026-08-31T20:00:00-04:00", to: "2026-09-02T01:00:00+01:00", as_of_exclusive: T.out }, expected: boundaryGold });
for (const type of ["income", "expense"]) {
  const s = snapshot(event(1, type, "500.00", { time: T.start, audit: { status: "reversed", corrected_at: T.observed, correction_reason: "Exact reversal" } }),
    event(2, type, "-500.00", { audit: { reversal_of_event_id: eventId(1) } }));
  const cash = type === "income" ? "-500.00" : "500.00";
  validVectors.push({ name: `${type} reversal-only period / negative activity`, snapshot: s, query: { ...QUERY, from: T.in }, expected: gold({
    accounts: [usd("bank", "0.00", ["1:0", "2:0"])], funds: [usd("restricted", "0.00", ["1:0", "2:0"])], org: [["USD", "0.00", ["1:0", "2:0"]]],
    income: type === "income" ? [inc("-500.00", ["2:1"])] : [], expense: type === "expense" ? [exp("-500.00", ["2:1"])] : [],
    soa: [["USD", type === "income" ? "-500.00" : "0.00", type === "expense" ? "-500.00" : "0.00", type === "income" ? "-500.00" : "500.00", ["2:1"]]],
    book: [type === "income" ? book("2:0", cash, "0.00") : outBook("2:0", cash, "0.00")], included: refs(1, 2), activity: refs(2) }) });
}
validVectors.push({ name: "member/project/null attribution stays distinct", snapshot: snapshot(
  event(1, "income", "50.00", { member: "member", project: "project" }), event(2, "income", "70.00", { member: "member2", project: "project2" }), event(3, "income", "20.00")),
  query: QUERY, expected: gold({ accounts: [usd("bank", "140.00", ["1:0", "2:0", "3:0"])], funds: [usd("restricted", "140.00", ["1:0", "2:0", "3:0"])],
    org: [["USD", "140.00", ["1:0", "2:0", "3:0"]]], income: [inc("50.00", ["1:1"], "restricted", "member", "project"), inc("70.00", ["2:1"], "restricted", "member2", "project2"), inc("20.00", ["3:1"])],
    soa: [["USD", "140.00", "0.00", "140.00", ["1:1", "2:1", "3:1"]]],
    book: [book("1:0", "50.00", "50.00", { member: "member", project: "project" }), book("2:0", "70.00", "120.00", { member: "member2", project: "project2" }), book("3:0", "20.00", "140.00")], included: refs(1, 2, 3) }) });
for (const [name, a, b, first, total] of [
  ["beyond JS safe integer", "9007199254740993.01", "0.01", "9007199254740993.01", "9007199254740993.02"],
  ["numeric(30,8) text / exact decimal addition", "0.10000000", "0.20000000", "0.10", "0.30"],
]) validVectors.push({ name, snapshot: snapshot(event(1, "income", a), event(2, "income", b)), query: QUERY, expected: gold({
  accounts: [usd("bank", total, ["1:0", "2:0"])], funds: [usd("restricted", total, ["1:0", "2:0"])], org: [["USD", total, ["1:0", "2:0"]]],
  income: [inc(total, ["1:1", "2:1"])], soa: [["USD", total, "0.00", total, ["1:1", "2:1"]]],
  book: [book("1:0", first, first), book("2:0", name.startsWith("beyond") ? "0.01" : "0.20", total)], included: refs(1, 2) }) });
validVectors.push({ name: "same-currency epochs aggregate without relabeling", snapshot: snapshot(event(1, "income", "500.00"),
  event(2, "income", "500.00", { epoch: ID.laterEpoch, time: T.out })), query: QUERY, expected: gold({
  accounts: [usd("bank", "1000.00", ["1:0", "2:0"])], funds: [usd("restricted", "1000.00", ["1:0", "2:0"])], org: [["USD", "1000.00", ["1:0", "2:0"]]],
  income: [inc("1000.00", ["1:1", "2:1"])], soa: [["USD", "1000.00", "0.00", "1000.00", ["1:1", "2:1"]]], book: [book("1:0", "500.00", "500.00"), book("2:0", "500.00", "1000.00")], included: refs(1, 2) }) });
validVectors.push({ name: "empty ledger has no invented currency", snapshot: snapshot(), query: QUERY, expected: gold({}) });
const noActivity = oneCash("10000.00", "opening", "general");
validVectors.push({ name: "no period activity / historical opening retained", snapshot: snapshot(event(1, "opening", "10000.00", { fund: "general", time: T.start })),
  query: { ...QUERY, from: T.in }, expected: { ...noActivity, book: [], activity: [] } });
validVectors.push({ name: "unbounded as-of includes all visible committed history", snapshot: foundation(), query: { ...QUERY, as_of_exclusive: null }, expected: FOUNDATION });
validVectors.push({ name: "expense/liability/transfer share half-open period boundaries", snapshot: snapshot(
  event(1, "opening", "10000.00", { fund: "general", time: T.start }), event(2, "expense", "200.00"),
  event(3, "liability", "50.00", { time: "2026-09-01T23:59:59.999999Z" }), event(4, "transfer", "1000.00", { fund: "general", time: T.out })),
  query: { ...QUERY, from: T.in, to: T.out, as_of_exclusive: T.out }, expected: gold({
    accounts: [usd("bank", "9850.00", ["1:0", "2:0", "3:0"])],
    funds: [usd("general", "10000.00", ["1:0"]), usd("restricted", "-150.00", ["2:0", "3:0"])],
    position: [usd("general", "10000.00", ["1:0"]), usd("restricted", "-200.00", ["2:0", "3:0", "3:1"])],
    org: [["USD", "9850.00", ["1:0", "2:0", "3:0"]]], expense: [exp("200.00", ["2:1"])], soa: [["USD", "0.00", "200.00", "-200.00", ["2:1"]]],
    book: [outBook("2:0", "-200.00", "9800.00"), book("3:0", "50.00", "9850.00", { type: "liability_movement", categories: [], controls: ["liability"] })],
    included: refs(1, 2, 3, 4), balances: refs(1, 2, 3), activity: refs(2, 3),
  }) });

export const antiPatternNames = [
  "all fund postings as fund cash", "positive cash equals income", "transfer equals income/expense", "loan principal equals expense",
  "liability receipt equals income", "opening equals income", "exclude corrected original", "combine USD/XAF",
  "page-local running balance starts at zero", "hide archived account history", "amount_paid as organization income",
  "payments.amount as central truth", "exclude reversed original", "absolute-value income reversal", "filter period before running window",
  "configuration inner join suppresses ledger rows", "posted_at used as effective date", "join category context multiplies custody",
];
