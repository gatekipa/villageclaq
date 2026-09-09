// Disposable PostgreSQL 17 proof only. No URL, Supabase client, network, or production writes.
import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { installPrerequisites, migrationChain } from "./fixtures/financial-f3-posting-prerequisites.mjs";
import { ID, T, QUERY, id, event, snapshot, foundation, correction, xaf, combine, validVectors }
  from "../tests/finance/f3-03/projection-vectors.mjs";

const label = "f3-projection";
const container = `villageclaq-f3-projection-${process.pid}-${Date.now()}`;
const image = "postgres:17-alpine";
const migration = "20260909022633_f3_projection_read_proof.sql";
const viewer = id(9001), manager = id(9002), ordinary = id(9003), inactive = id(9004);
const otherViewer = id(9005), otherGroup = id(999001);
const viewerMembership = id(9101), managerMembership = id(9102), ordinaryMembership = id(9103);
const inactiveMembership = id(9104), otherMembership = id(9105);
const positionView = id(9201), positionManage = id(9202), positionOther = id(9203);
const q = (value) => value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
const json = (value) => `${q(JSON.stringify(value))}::jsonb`;
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const docker = (args, options = {}) => execFileSync("docker", args, {
  encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024, ...options,
}).trim();
const sql = (query) => docker([
  "exec", "-i", container, "psql", "-X", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq",
], { input: query });
function failure(query) {
  try { sql(query); } catch (error) { return String(error.stderr || error.message); }
  assert.fail("Expected SQL rejection");
}
const reset = () => sql(`TRUNCATE public.position_assignments, public.position_permissions,
  financial_core.posting_command_payloads, public.financial_postings, public.financial_events,
  public.financial_accounts, public.financial_funds, public.financial_categories,
  public.financial_ledger_epochs, public.projects, public.memberships, public.groups,
  public.profiles CASCADE;`);
const nameById = new Map(Object.entries(ID).map(([name, value]) => [value, name]));
const short = (value) => value == null ? null : (nameById.get(value) || value);
const postingRef = (value) => {
  const n = Number(value.slice(-12));
  return `${Math.floor((n - 10000) / 10)}:${n % 10}`;
};
const timestamp = (value) => new Date(value).getTime();

function epochRows(source) {
  const byGroup = new Map();
  for (const e of source.events) {
    const group = byGroup.get(e.group_id) || new Map();
    const row = group.get(e.ledger_epoch_id) || {
      id: e.ledger_epoch_id, group_id: e.group_id, currency: e.currency, times: [],
    };
    assert.equal(row.currency, e.currency);
    row.times.push(timestamp(e.occurred_at));
    group.set(e.ledger_epoch_id, row);
    byGroup.set(e.group_id, group);
  }
  const rows = [];
  for (const group of byGroup.values()) {
    const ordered = [...group.values()].sort((a, b) => Math.min(...a.times) - Math.min(...b.times));
    for (let i = 0; i < ordered.length; i += 1) {
      const current = ordered[i];
      current.effective_from = i === 0 ? "2020-01-01T00:00:00Z"
        : new Date(Math.min(...current.times)).toISOString();
      current.effective_to = i + 1 < ordered.length
        ? new Date(Math.min(...ordered[i + 1].times)).toISOString() : null;
      rows.push(current);
    }
  }
  return rows;
}

function seedVector(source, queryGroup) {
  reset();
  const epochs = epochRows(source);
  const groups = new Set([queryGroup, otherGroup, ...source.events.map((e) => e.group_id)]);
  const lastCurrency = new Map();
  for (const epoch of epochs) lastCurrency.set(epoch.group_id, epoch.currency);
  let setup = "BEGIN;";
  for (const group of groups) {
    setup += `INSERT INTO public.groups(id,currency,name) VALUES(${q(group)},${q(lastCurrency.get(group) || "USD")},${q(`Group ${short(group)}`)});`;
  }
  for (const [profile, display] of [
    [viewer, "Finance Viewer"], [manager, "Finance Manager"], [ordinary, "Ordinary Member"],
    [inactive, "Inactive Officer"], [otherViewer, "Other Finance Viewer"], [ID.actor, "Fixture Actor"],
  ]) setup += `INSERT INTO public.profiles(id,display_name,full_name) VALUES(${q(profile)},${q(display)},${q(display)}) ON CONFLICT DO NOTHING;`;
  setup += `INSERT INTO public.memberships(id,group_id,user_id,display_name) VALUES
    (${q(viewerMembership)},${q(queryGroup)},${q(viewer)},'Finance Viewer'),
    (${q(managerMembership)},${q(queryGroup)},${q(manager)},'Finance Manager'),
    (${q(ordinaryMembership)},${q(queryGroup)},${q(ordinary)},'Ordinary Member'),
    (${q(inactiveMembership)},${q(queryGroup)},${q(inactive)},'Inactive Officer'),
    (${q(otherMembership)},${q(otherGroup)},${q(otherViewer)},'Other Finance Viewer');
    UPDATE public.memberships SET membership_status='suspended' WHERE id=${q(inactiveMembership)};
    INSERT INTO public.position_assignments(membership_id,position_id) VALUES
      (${q(viewerMembership)},${q(positionView)}),(${q(managerMembership)},${q(positionManage)}),
      (${q(inactiveMembership)},${q(positionView)}),(${q(otherMembership)},${q(positionOther)});
    INSERT INTO public.position_permissions(position_id,permission) VALUES
      (${q(positionView)},'finances.view'),(${q(positionManage)},'finances.manage'),
      (${q(positionOther)},'finances.view');`;

  const memberGroups = new Map();
  for (const p of source.postings) if (p.member_id) memberGroups.set(p.member_id, p.group_id);
  let memberIndex = 0;
  for (const [membership, group] of memberGroups) {
    if ([viewerMembership, managerMembership, ordinaryMembership, inactiveMembership, otherMembership].includes(membership)) continue;
    const user = id(9300 + memberIndex++);
    const display = `Member ${short(membership)}`;
    setup += `INSERT INTO public.profiles(id,display_name,full_name) VALUES(${q(user)},${q(display)},${q(display)});
      INSERT INTO public.memberships(id,group_id,user_id,display_name) VALUES(${q(membership)},${q(group)},${q(user)},${q(display)});`;
  }
  const projectGroups = new Map();
  for (const p of source.postings) if (p.project_id) projectGroups.set(p.project_id, p.group_id);
  for (const [project, group] of projectGroups) setup += `INSERT INTO public.projects(id,group_id,name) VALUES(${q(project)},${q(group)},${q(`Project ${short(project)}`)});`;
  for (const e of epochs) setup += `INSERT INTO public.financial_ledger_epochs
    (id,group_id,currency,effective_from,effective_to,source_kind,approval_note)
    VALUES(${q(e.id)},${q(e.group_id)},${q(e.currency)},${q(e.effective_from)},${q(e.effective_to)},'cutover','Disposable projection fixture');`;

  const accounts = new Map();
  const funds = new Map();
  const categories = new Map();
  for (const p of source.postings) {
    if (p.account_id) accounts.set(`${p.group_id}|${p.account_id}|${p.currency}`, p);
    funds.set(`${p.group_id}|${p.fund_id}`, p);
    if (p.category_id) categories.set(`${p.group_id}|${p.category_id}|${p.category_class}`, p);
  }
  for (const p of accounts.values()) {
    const opened = epochs.find((e) => e.group_id === p.group_id && e.currency === p.currency);
    setup += `INSERT INTO public.financial_accounts
      (id,group_id,opened_ledger_epoch_id,currency,name,kind,opened_at)
      VALUES(${q(p.account_id)},${q(p.group_id)},${q(opened.id)},${q(p.currency)},${q(short(p.account_id))},${q(short(p.account_id).toLowerCase().includes("cash") ? "cash" : "bank")},${q(opened.effective_from)});`;
  }
  for (const p of funds.values()) setup += `INSERT INTO public.financial_funds(id,group_id,name,is_restricted)
    VALUES(${q(p.fund_id)},${q(p.group_id)},${q(short(p.fund_id))},${short(p.fund_id).toLowerCase().includes("restricted")});`;
  for (const p of categories.values()) setup += `INSERT INTO public.financial_categories(id,group_id,name,category_class)
    VALUES(${q(p.category_id)},${q(p.group_id)},${q(short(p.category_id))},${q(p.category_class)});`;
  sql(`${setup}COMMIT;`);

  let facts = "BEGIN; SET CONSTRAINTS ALL DEFERRED;";
  for (const e of source.events) facts += `INSERT INTO public.financial_events
    (id,group_id,ledger_epoch_id,currency,event_class,source_module,source_record_id,effect_kind,
      request_id,economic_payload_fingerprint,occurred_at,posted_at,created_by,description,
      reference_metadata,status,reversal_of_event_id,replacement_event_id,corrected_at,correction_reason)
    VALUES(${q(e.id)},${q(e.group_id)},${q(e.ledger_epoch_id)},${q(e.currency)},${q(e.event_class)},
      ${q(e.source_module)},${q(e.source_record_id)},${q(e.effect_kind)},${q(e.request_id)},
      ${q(e.economic_payload_fingerprint)},${q(e.occurred_at)},${q(e.posted_at)},${q(e.created_by)},
      ${q(e.description)},${json(e.reference_metadata)},${q(e.status)},${q(e.reversal_of_event_id)},
      ${q(e.replacement_event_id)},${q(e.corrected_at)},${q(e.correction_reason)});`;
  for (const p of source.postings) facts += `INSERT INTO public.financial_postings
    (id,event_id,group_id,ledger_epoch_id,currency,occurred_at,amount_signed,control_class,
      account_id,fund_id,category_id,category_class,member_id,project_id)
    VALUES(${q(p.id)},${q(p.event_id)},${q(p.group_id)},${q(p.ledger_epoch_id)},${q(p.currency)},
      ${q(p.occurred_at)},${q(p.amount_signed)},${q(p.control_class)},${q(p.account_id)},${q(p.fund_id)},
      ${q(p.category_id)},${q(p.category_class)},${q(p.member_id)},${q(p.project_id)});`;
  sql(`${facts}COMMIT;`);

  for (const a of source.display?.accounts || []) {
    if (a.status === "inactive" || a.status === "closed")
      sql(`UPDATE public.financial_accounts SET status='inactive' WHERE id=${q(a.id)};`);
    if (a.status === "closed") sql(`UPDATE public.financial_accounts SET status='closed' WHERE id=${q(a.id)};`);
  }
  for (const f of source.display?.funds || []) if (f.status === "inactive")
    sql(`UPDATE public.financial_funds SET status='inactive' WHERE id=${q(f.id)};`);
  for (const c of source.display?.categories || []) if (c.status === "inactive")
    sql(`UPDATE public.financial_categories SET status='inactive' WHERE id=${q(c.id)};`);
}

function bundle(actor, query = QUERY, role = "authenticated") {
  const statement = `SET ROLE ${role}; SET request.jwt.claim.sub=${q(actor)};
    SELECT public.get_financial_projection_bundle(${q(query.group_id)},${q(query.from)},${q(query.to)},${q(query.as_of_exclusive)});`;
  return JSON.parse(sql(statement));
}
function bundleFailure(actor, query = QUERY, role = "authenticated") {
  return failure(`SET ROLE ${role}; SET request.jwt.claim.sub=${q(actor)};
    SELECT public.get_financial_projection_bundle(${q(query.group_id)},${q(query.from)},${q(query.to)},${q(query.as_of_exclusive)});`);
}
function cashbook(actor, options = {}) {
  const o = { group_id: ID.group, from: T.in, to: QUERY.to, account_id: ID.bank,
    currency: "USD", offset: 0, limit: 100, ...options };
  return JSON.parse(sql(`SET ROLE authenticated; SET request.jwt.claim.sub=${q(actor)};
    SELECT public.get_financial_cashbook(${q(o.group_id)},${q(o.from)},${q(o.to)},
      ${q(o.account_id)},${q(o.currency)},${o.offset},${o.limit});`));
}
const amountBy = (rows, field, value) => rows.find((row) => row[field] === value)?.amount;
function compact(result) {
  return {
    accounts: result.account_balances.map((r) => [short(r.account_id), r.currency, r.amount]),
    funds: result.fund_cash.map((r) => [short(r.fund_id), r.currency, r.amount]),
    position: result.fund_net_positions.map((r) => [short(r.fund_id), r.currency, r.amount]),
    org: result.organization_custody.map((r) => [r.currency, r.amount]),
    income: result.income_activity.map((r) => [r.currency, short(r.category_id), r.category_class,
      short(r.fund_id), short(r.member_id), short(r.project_id), r.amount]),
    expense: result.expense_activity.map((r) => [r.currency, short(r.category_id), r.category_class,
      short(r.fund_id), short(r.member_id), short(r.project_id), r.amount]),
    soa: result.soa_lite.map((r) => [r.currency, r.income, r.expense, r.operating_result]),
    book: result.cashbook.map((r) => [postingRef(r.posting_id), r.currency, short(r.account_id),
      short(r.fund_id), short(r.member_id), short(r.project_id), r.amount_signed, r.running_balance,
      r.movement_type, r.category_contexts.map((c) => short(c.category_id)), r.counterpart_control_classes]),
  };
}
const expectedCompact = (expected) => ({
  accounts: expected.accounts.map((r) => r.slice(0, 3)),
  funds: expected.funds.map((r) => r.slice(0, 3)),
  position: expected.position.map((r) => r.slice(0, 3)),
  org: expected.org.map((r) => r.slice(0, 2)),
  income: expected.income.map((r) => r.slice(0, 7)),
  expense: expected.expense.map((r) => r.slice(0, 7)),
  soa: expected.soa.map((r) => r.slice(0, 4)),
  book: expected.book,
});

before(async () => {
  docker(["run", "--rm", "-d", "--name", container, "--network", "none",
    "--label", `villageclaq.test=${label}`, "-e", "POSTGRES_HOST_AUTH_METHOD=trust",
    "-e", "POSTGRES_INITDB_ARGS=--no-sync", image]);
  let ready = false;
  for (let i = 0; i < 40; i += 1) {
    try { docker(["exec", container, "pg_isready", "-U", "postgres"]); ready = true; break; }
    catch { await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
  assert.ok(ready);
  const info = JSON.parse(docker(["inspect", container]))[0];
  assert.equal(info.Config.Labels["villageclaq.test"], label);
  assert.equal(info.HostConfig.NetworkMode, "none");
  assert.deepEqual(info.HostConfig.PortBindings, {});
  assert.equal(info.Mounts.some((mount) => mount.Type === "bind"), false);
  installPrerequisites(sql);
  sql("ALTER TABLE public.profiles ADD COLUMN display_name text, ADD COLUMN full_name text;");
  sql(read(`supabase/migrations/${migration}`));
});
after(() => {
  try {
    const info = JSON.parse(docker(["inspect", container]))[0];
    assert.equal(info.Config.Labels["villageclaq.test"], label);
    docker(["rm", "-f", container]);
  } catch { /* the container never touched a network or bind mount */ }
});

test("A. authorization and raw truth boundary", () => {
  seedVector(foundation(), ID.group);
  assert.equal(bundle(viewer).contract_version, "f3-projection-v1");
  assert.equal(bundle(manager).contract_version, "f3-projection-v1");
  for (const actor of [ordinary, inactive, otherViewer]) assert.match(bundleFailure(actor), /DENY/);
  assert.match(bundleFailure(viewer, QUERY, "anon"), /permission denied/);
  assert.match(failure(`SET ROLE authenticated; SET request.jwt.claim.sub=${q(viewer)};
    SELECT * FROM public.financial_events;`), /permission denied/);
});
test("B. tenant isolation", () => {
  seedVector(combine(foundation(), xaf()), ID.group);
  const result = bundle(viewer);
  assert.deepEqual(result.currency_buckets, ["USD"]);
  assert.equal(JSON.stringify(result).includes(ID.xafBank), false);
  assert.equal(JSON.stringify(result).includes(ID.xafRestricted), false);
});
test("C. account balances", () => {
  seedVector(foundation(), ID.group); const result = bundle(viewer);
  assert.equal(amountBy(result.account_balances, "account_id", ID.bank), "9300.00");
  assert.equal(amountBy(result.account_balances, "account_id", ID.cash), "1000.00");
});
test("D. fund cash uses custody only", () => {
  seedVector(foundation(), ID.group); const result = bundle(viewer);
  assert.equal(amountBy(result.fund_cash, "fund_id", ID.general), "10000.00");
  assert.equal(amountBy(result.fund_cash, "fund_id", ID.restricted), "300.00");
});
test("E. fund net position controls", () => {
  seedVector(foundation(), ID.group); const result = bundle(viewer);
  assert.equal(amountBy(result.fund_net_positions, "fund_id", ID.general), "10000.00");
  assert.equal(amountBy(result.fund_net_positions, "fund_id", ID.restricted), "300.00");
});
test("F. income activity", () => {
  seedVector(foundation(), ID.group); assert.equal(bundle(viewer).income_activity[0].amount, "500.00");
});
test("G. expense activity", () => {
  seedVector(foundation(), ID.group); assert.equal(bundle(viewer).expense_activity[0].amount, "200.00");
});
test("H. SoA-lite", () => {
  seedVector(foundation(), ID.group); assert.deepEqual(bundle(viewer).soa_lite.map((r) =>
    [r.currency, r.income, r.expense, r.operating_result]), [["USD", "500.00", "200.00", "300.00"]]);
});
test("I. cash movement classification", () => {
  seedVector(foundation(), ID.group); const types = bundle(viewer).cash_movement.map((r) => r.movement_type);
  assert.deepEqual(types, ["opening_position", "operating_income", "operating_expense",
    "internal_account_transfer", "internal_account_transfer"]);
});
test("J. cashbook custody grain and safe fields", () => {
  seedVector(foundation(), ID.group); const rows = bundle(viewer).cashbook;
  assert.equal(rows.length, 5); assert.equal(new Set(rows.map((r) => r.posting_id)).size, 5);
  assert.equal(JSON.stringify(rows).includes("economic_payload_fingerprint"), false);
  assert.equal(JSON.stringify(rows).includes("internal_secret"), false);
});
test("K. running balance has exact stable order", () => {
  const tied = foundation(); tied.events.forEach((e) => { e.occurred_at = T.in; });
  tied.postings.forEach((p) => { p.occurred_at = T.in; }); tied.events.reverse(); tied.postings.reverse();
  seedVector(tied, ID.group); const rows = bundle(viewer).cashbook;
  assert.deepEqual(rows.map((r) => postingRef(r.posting_id)), ["1:0", "2:0", "3:0", "4:0", "4:1"]);
  assert.deepEqual(rows.filter((r) => r.account_id === ID.bank).map((r) => r.running_balance),
    ["10000.00", "10500.00", "10300.00", "9300.00"]);
});
test("L. page opening balance includes prior history", () => {
  seedVector(foundation(), ID.group); const page = cashbook(viewer, { offset: 1, limit: 2 });
  assert.equal(page.total_period_rows, 3); assert.equal(page.opening_balance, "10500.00");
  assert.deepEqual(page.rows.map((r) => r.running_balance), ["10300.00", "9300.00"]);
  const empty = cashbook(viewer, { offset: 9, limit: 2 });
  assert.deepEqual(empty.rows, []); assert.equal(empty.opening_balance, null);
});
test("M. period boundaries are half-open", () => {
  const s = snapshot(
    event(31, "income", "1.00", { time: "2026-08-31T23:59:59.999999Z" }),
    event(32, "income", "2.00", { time: T.in }),
    event(33, "income", "3.00", { time: "2026-09-01T23:59:59.999999Z" }),
    event(34, "income", "4.00", { time: T.out }));
  seedVector(s, ID.group); const result = bundle(viewer, { ...QUERY, from: T.in, to: T.out, as_of_exclusive: T.out });
  assert.equal(result.income_activity[0].amount, "5.00");
  assert.deepEqual(result.cashbook.map((r) => r.amount_signed), ["2.00", "3.00"]);
});
test("N. balance cutoff is exclusive and independent", () => {
  const s = snapshot(event(31, "income", "1.00", { time: "2026-08-31T23:59:59.999999Z" }),
    event(32, "income", "2.00", { time: T.in }));
  seedVector(s, ID.group); const result = bundle(viewer, {
    ...QUERY, from: T.in, as_of_exclusive: T.in,
  });
  assert.equal(result.account_balances[0].amount, "1.00");
  assert.equal(result.income_activity[0].amount, "2.00");
});
test("O. currencies remain separate buckets", () => {
  const source = combine(foundation(), xaf(ID.group, true));
  seedVector(source, ID.group); const result = bundle(viewer, { ...QUERY, from: "2025-01-01T00:00:00Z" });
  assert.deepEqual(result.currency_buckets, ["USD", "XAF"]);
  assert.deepEqual(result.organization_custody.map((r) => [r.currency, r.amount]),
    [["USD", "10300.00"], ["XAF", "2500000"]]);
});
test("P. corrected originals remain arithmetic truth", () => {
  seedVector(correction(), ID.group); const result = bundle(viewer);
  assert.equal(amountBy(result.account_balances, "account_id", ID.bank), "9250.00");
  assert.equal(result.income_activity[0].amount, "450.00");
  assert.equal(result.soa_lite[0].operating_result, "250.00");
});
test("Q. opening affects custody, not operating result", () => {
  seedVector(foundation(), ID.group); const result = bundle(viewer);
  assert.equal(result.cash_movement[0].movement_type, "opening_position");
  assert.equal(result.soa_lite[0].operating_result, "300.00");
});
test("R. receivable conserves fund net position", () => {
  const source = foundation(), extra = event(41, "receivable", "1000.00", { fund: "general" });
  source.events.push(extra.event); source.postings.push(...extra.postings);
  seedVector(source, ID.group); const result = bundle(viewer);
  assert.equal(amountBy(result.fund_cash, "fund_id", ID.general), "9000.00");
  assert.equal(amountBy(result.fund_net_positions, "fund_id", ID.general), "10000.00");
  assert.equal(result.soa_lite[0].operating_result, "300.00");
  assert.equal(result.cash_movement.find((r) => r.event_id === extra.event.id).movement_type, "receivable_movement");
});
test("S. liability conserves fund net position", () => {
  const source = foundation(), extra = event(42, "liability", "100.00", { fund: "general" });
  source.events.push(extra.event); source.postings.push(...extra.postings);
  seedVector(source, ID.group); const result = bundle(viewer);
  assert.equal(amountBy(result.fund_cash, "fund_id", ID.general), "10100.00");
  assert.equal(amountBy(result.fund_net_positions, "fund_id", ID.general), "10000.00");
  assert.equal(result.soa_lite[0].income, "500.00");
  assert.equal(result.cash_movement.find((r) => r.event_id === extra.event.id).movement_type, "liability_movement");
});
test("T. inactive and archived labels retain history", () => {
  seedVector(foundation(), ID.group);
  sql(`UPDATE public.financial_accounts SET status='inactive' WHERE id=${q(ID.bank)};
    UPDATE public.financial_accounts SET status='closed' WHERE id=${q(ID.bank)};
    UPDATE public.financial_funds SET status='inactive' WHERE id=${q(ID.restricted)};
    UPDATE public.financial_categories SET status='inactive' WHERE id=${q(ID.donation)};`);
  const result = bundle(viewer);
  assert.equal(result.account_balances.find((r) => r.account_id === ID.bank).account_status, "closed");
  assert.equal(result.fund_cash.find((r) => r.fund_id === ID.restricted).fund_status, "inactive");
  assert.equal(result.income_activity[0].category_status, "inactive");
});
test("U. labels are readable through projections but mutation remains manage-only", () => {
  seedVector(foundation(), ID.group); const result = bundle(viewer);
  assert.equal(result.account_balances.find((r) => r.account_id === ID.bank).account_name, "bank");
  assert.equal(sql(`SET ROLE authenticated; SET request.jwt.claim.sub=${q(viewer)};
    SELECT count(*) FROM public.financial_accounts;`), "0");
  assert.match(failure(`SET ROLE authenticated; SET request.jwt.claim.sub=${q(viewer)};
    INSERT INTO public.financial_funds(group_id,name) VALUES(${q(ID.group)},'Forbidden');`), /row-level security/);
  assert.equal(sql(`SET ROLE authenticated; SET request.jwt.claim.sub=${q(viewer)};
    UPDATE public.financial_funds SET name='Forbidden' RETURNING id;`), "");
  assert.equal(sql(`SET ROLE authenticated; SET request.jwt.claim.sub=${q(manager)};
    UPDATE public.financial_funds SET name='Manager Rename' WHERE id=${q(ID.general)} RETURNING name;`), "Manager Rename");
});
test("V. exact money transport is decimal text", () => {
  const source = snapshot(event(51, "income", "9007199254740993.01"), event(52, "income", "0.01"));
  seedVector(source, ID.group); const result = bundle(viewer);
  assert.equal(result.account_balances[0].amount, "9007199254740993.02");
  assert.equal(typeof result.account_balances[0].amount, "string");
  seedVector(xaf(), ID.xafGroup); const x = bundle(viewer, { ...QUERY, group_id: ID.xafGroup });
  assert.equal(x.organization_custody[0].amount, "2500000"); assert.doesNotMatch(x.organization_custody[0].amount, /\./);
});
test("W. bundle snapshot identity is explicit and fail-closed for continuation", () => {
  seedVector(foundation(), ID.group); const first = bundle(viewer), second = bundle(viewer);
  assert.equal(first.snapshot_consistency, "single_statement");
  assert.equal(first.read_identity_reusable, false);
  assert.equal(first.continuation_semantics, "restart_with_new_read_identity");
  assert.notEqual(first.read_identity, second.read_identity);
  assert.ok(first.observed_at); assert.deepEqual(first.currency_buckets, ["USD"]);
});
test("X. all unchanged Astra valid vectors match database projections", () => {
  assert.equal(validVectors.length, 35);
  for (const vector of validVectors) {
    seedVector(vector.snapshot, vector.query.group_id);
    assert.deepEqual(compact(bundle(viewer, vector.query)), expectedCompact(vector.expected), vector.name);
    if (vector.page) {
      const page = cashbook(viewer, { group_id: vector.query.group_id, from: vector.query.from,
        to: vector.query.to, account_id: vector.page.account_id, currency: vector.page.currency,
        offset: vector.page.offset, limit: vector.page.limit });
      assert.equal(page.opening_balance, vector.page.opening, vector.name);
      assert.equal(page.total_period_rows, vector.page.total, vector.name);
    }
  }
});
test("Y. catalog, grants, migration order, and representative plans", () => {
  seedVector(foundation(), ID.group);
  assert.equal(migrationChain.length, 5);
  assert.equal(sql(`SELECT string_agg(name,',' ORDER BY name) FROM (VALUES
    ('20260906140228'),('20260906140229'),('20260908043912'),('20260908154824'),
    ('20260908215831'),('20260909022633')) v(name);`),
  "20260906140228,20260906140229,20260908043912,20260908154824,20260908215831,20260909022633");
  for (const signature of [
    "public.get_financial_projection_bundle(uuid,timestamptz,timestamptz,timestamptz)",
    "public.get_financial_cashbook(uuid,timestamptz,timestamptz,uuid,text,integer,integer)",
  ]) {
    assert.equal(sql(`SELECT prosecdef AND provolatile='s' AND proconfig=ARRAY['search_path=""']
      FROM pg_catalog.pg_proc WHERE oid=${q(signature)}::regprocedure;`), "t");
    assert.equal(sql(`SELECT has_function_privilege('authenticated',${q(signature)},'EXECUTE');`), "t");
    assert.equal(sql(`SELECT has_function_privilege('anon',${q(signature)},'EXECUTE');`), "f");
  }
  for (const table of ["financial_events", "financial_postings"])
    assert.equal(sql(`SELECT has_table_privilege('authenticated','public.${table}','SELECT');`), "f");
  assert.equal(sql(`SELECT count(*) FROM pg_catalog.pg_indexes WHERE schemaname='public'
    AND indexname LIKE 'financial_postings_%' AND indexname<>'financial_postings_pkey'`), "5");
  const plans = [
    `SELECT sum(amount_signed) FROM public.financial_postings
      WHERE group_id=${q(ID.group)} AND account_id=${q(ID.bank)} AND control_class='custody'
        AND occurred_at<'2026-10-01T00:00:00Z'`,
    `SELECT sum(amount_signed) FROM public.financial_postings
      WHERE group_id=${q(ID.group)} AND fund_id=${q(ID.restricted)} AND control_class='custody'
        AND occurred_at<'2026-10-01T00:00:00Z'`,
    `SELECT sum(amount_signed) FROM public.financial_postings
      WHERE group_id=${q(ID.group)} AND category_id=${q(ID.donation)} AND control_class='income'
        AND occurred_at>='2026-01-01T00:00:00Z' AND occurred_at<'2026-10-01T00:00:00Z'`,
    `SELECT * FROM financial_core.projection_cashbook_rows(${q(ID.group)},false)
      WHERE account_id=${q(ID.bank)} AND currency='USD'
      ORDER BY occurred_at,event_id,posting_id LIMIT 100`,
  ].map((query) => sql(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${query};`));
  assert.equal(plans.length, 4);
  for (const plan of plans) assert.match(plan, /Plan/);
});
