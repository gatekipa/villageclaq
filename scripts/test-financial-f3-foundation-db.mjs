import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { execFile, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const image = "postgres:17-alpine";
const container = `villageclaq-f3-foundation-${process.pid}-${Date.now()}`;
const migrationPath = new URL(
  "./supabase/migrations/00114_f3_core_ledger_foundation.sql",
  new URL("file:///C:/Users/nanye/Documents/villageclaq/"),
);
const migration = () => readFileSync(migrationPath, "utf8");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const fingerprint = "a".repeat(64);

const groupA = id(1), groupB = id(2), groupXaf = id(3), internalGroup = id(4);
const orgA = id(11), orgB = id(12), orgXaf = id(13), internalOrg = id(14);
const epochA = id(21), epochAOld = id(22), epochAXaf = id(23);
const epochB = id(24), epochXaf = id(25), epochInternal = id(26);
const manager = id(101), member = id(102), inactive = id(103);
const viewer = id(104), outsider = id(105);
const managerMid = id(201), memberMid = id(202), inactiveMid = id(203);
const viewerMid = id(204), outsiderMid = id(205), internalMid = id(206);
const managePosition = id(301), viewPosition = id(302), outsiderPosition = id(303);
const accountA = id(401), accountB = id(402), accountAXaf = id(403);
const accountXaf = id(404), accountInternal = id(405);
const fundA = id(501), fundB = id(502), fundXaf = id(503);
const fundInternal = id(504), restrictedA = id(505);
const incomeA = id(601), expenseA = id(602), incomeB = id(603);
const incomeXaf = id(604), incomeInternal = id(605);
const projectA = id(701), projectB = id(702);

function docker(args, options = {}) {
  return execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    ...options,
  }).trim();
}

function sql(query, { role, actor } = {}) {
  const prefix = [
    role ? `SET ROLE ${role};` : "",
    actor ? `SET request.jwt.claim.sub = '${actor}';` : "",
  ].join("");
  return docker(
    ["exec", "-i", container, "psql", "-X", "-U", "postgres",
      "-v", "ON_ERROR_STOP=1", "-Atq"],
    { input: prefix + query },
  );
}

function sqlFailure(query, { role, actor } = {}) {
  try {
    sql(query, { role, actor });
  } catch (error) {
    return String(error.stderr || error.message);
  }
  assert.fail("expected SQL statement to fail");
}

function asyncSql(query) {
  return new Promise((resolve, reject) => {
    execFile(
      "docker",
      ["exec", container, "psql", "-X", "-U", "postgres",
        "-v", "ON_ERROR_STOP=1", "-Atq", "-c", query],
      { encoding: "utf8" },
      (error, stdout, stderr) => error
        ? reject(new Error(stderr || error.message))
        : resolve(stdout.trim()),
    );
  });
}

function eventInsert({
  eventId,
  groupId = groupA,
  epochId = epochA,
  currency = "USD",
  source = `source-${eventId}`,
  effect = "collection",
  requestId = null,
  occurredAt = "2026-09-08T12:00:00Z",
  eventClass = "money_in",
  reversalOf = null,
}) {
  return `INSERT INTO public.financial_events(
    id,group_id,ledger_epoch_id,currency,event_class,source_module,
    source_record_id,effect_kind,request_id,economic_payload_fingerprint,
    occurred_at,reversal_of_event_id)
  VALUES('${eventId}','${groupId}','${epochId}','${currency}','${eventClass}',
    'test_fixture','${source}','${effect}',${requestId ? `'${requestId}'` : "NULL"},
    '${fingerprint}','${occurredAt}',${reversalOf ? `'${reversalOf}'` : "NULL"});`;
}

function postingInsert({
  postingId,
  eventId,
  amount,
  control = "custody",
  groupId = groupA,
  epochId = epochA,
  currency = "USD",
  occurredAt = "2026-09-08T12:00:00Z",
  accountId = accountA,
  fundId = fundA,
  categoryId = null,
  categoryClass = null,
  memberId = null,
  projectId = null,
}) {
  return `INSERT INTO public.financial_postings(
    id,event_id,group_id,ledger_epoch_id,currency,occurred_at,amount_signed,
    control_class,account_id,fund_id,category_id,category_class,member_id,project_id)
  VALUES('${postingId}','${eventId}','${groupId}','${epochId}','${currency}',
    '${occurredAt}',${amount},'${control}',${accountId ? `'${accountId}'` : "NULL"},
    '${fundId}',${categoryId ? `'${categoryId}'` : "NULL"},
    ${categoryClass ? `'${categoryClass}'` : "NULL"},
    ${memberId ? `'${memberId}'` : "NULL"},${projectId ? `'${projectId}'` : "NULL"});`;
}

function balancedEvent({
  eventId,
  postingBase,
  amount = "10.00",
  groupId = groupA,
  epochId = epochA,
  currency = "USD",
  accountId = accountA,
  fundId = fundA,
  categoryId = incomeA,
  source,
  requestId,
  reversalOf,
  occurredAt = "2026-09-08T12:00:00Z",
}) {
  return `BEGIN;
    ${eventInsert({ eventId, groupId, epochId, currency, source, requestId, reversalOf, occurredAt })}
    ${postingInsert({ postingId: id(postingBase), eventId, amount, groupId, epochId,
      currency, accountId, fundId, occurredAt })}
    ${postingInsert({ postingId: id(postingBase + 1), eventId, amount: `-${amount}`,
      control: "income", groupId, epochId, currency, accountId: null, fundId,
      categoryId, categoryClass: "income", occurredAt })}
    COMMIT;`;
}

const setup = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SET search_path = '' AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $$;
  GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

  CREATE TABLE public.profiles(id uuid PRIMARY KEY);
  CREATE TABLE public.organizations(id uuid PRIMARY KEY, name text NOT NULL);
  CREATE TABLE public.groups(
    id uuid PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id),
    name text NOT NULL,
    currency text NOT NULL
  );
  CREATE TABLE public.memberships(
    id uuid PRIMARY KEY,
    user_id uuid REFERENCES public.profiles(id),
    group_id uuid NOT NULL REFERENCES public.groups(id),
    role text NOT NULL DEFAULT 'member',
    membership_status text NOT NULL DEFAULT 'active'
  );
  CREATE TABLE public.group_positions(
    id uuid PRIMARY KEY,
    group_id uuid NOT NULL REFERENCES public.groups(id),
    title text NOT NULL
  );
  CREATE TABLE public.position_assignments(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    position_id uuid NOT NULL REFERENCES public.group_positions(id),
    membership_id uuid NOT NULL REFERENCES public.memberships(id),
    ended_at timestamptz
  );
  CREATE TABLE public.position_permissions(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    position_id uuid NOT NULL REFERENCES public.group_positions(id),
    permission text NOT NULL
  );
  CREATE TABLE public.projects(
    id uuid PRIMARY KEY,
    group_id uuid NOT NULL REFERENCES public.groups(id),
    name text NOT NULL
  );
  CREATE TABLE public.financial_ledger_epochs(
    id uuid PRIMARY KEY,
    group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE RESTRICT,
    currency text NOT NULL,
    effective_from timestamptz NOT NULL,
    effective_to timestamptz,
    CONSTRAINT financial_ledger_epoch_scope UNIQUE(id,group_id,currency)
  );
  CREATE SCHEMA financial_private;
  REVOKE ALL ON SCHEMA financial_private FROM PUBLIC, anon, authenticated;
  CREATE TABLE financial_private.internal_financial_tenants(
    organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),
    tenant_kind text NOT NULL
  );
  REVOKE ALL ON financial_private.internal_financial_tenants
    FROM PUBLIC, anon, authenticated, service_role;

  CREATE FUNCTION public.has_group_permission(
    gid uuid, perm_key text, uid uuid DEFAULT auth.uid()
  ) RETURNS boolean
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
  DECLARE mid uuid; member_role text; assignment_count integer;
  BEGIN
    SELECT m.id,m.role INTO mid,member_role FROM public.memberships m
      WHERE m.group_id=gid AND m.user_id=uid LIMIT 1;
    IF mid IS NULL THEN RETURN false; END IF;
    IF member_role='owner' THEN RETURN true; END IF;
    SELECT count(*) INTO assignment_count FROM public.position_assignments pa
      WHERE pa.membership_id=mid AND pa.ended_at IS NULL;
    IF member_role='admin' AND assignment_count=0 THEN RETURN true; END IF;
    RETURN EXISTS(
      SELECT 1 FROM public.position_assignments pa
      JOIN public.position_permissions pp ON pp.position_id=pa.position_id
      WHERE pa.membership_id=mid AND pa.ended_at IS NULL
        AND pp.permission=perm_key
    );
  END;
  $$;
  GRANT EXECUTE ON FUNCTION public.has_group_permission(uuid,text,uuid)
    TO anon,authenticated;

  INSERT INTO public.organizations VALUES
    ('${orgA}','A'),('${orgB}','B'),('${orgXaf}','XAF'),('${internalOrg}','Internal');
  INSERT INTO public.groups VALUES
    ('${groupA}','${orgA}','Group A','USD'),
    ('${groupB}','${orgB}','Group B','USD'),
    ('${groupXaf}','${orgXaf}','Group XAF','XAF'),
    ('${internalGroup}','${internalOrg}','Internal QA','USD');
  INSERT INTO public.profiles VALUES
    ('${manager}'),('${member}'),('${inactive}'),('${viewer}'),('${outsider}');
  INSERT INTO public.memberships VALUES
    ('${managerMid}','${manager}','${groupA}','member','active'),
    ('${memberMid}','${member}','${groupA}','member','active'),
    ('${inactiveMid}','${inactive}','${groupA}','member','suspended'),
    ('${viewerMid}','${viewer}','${groupA}','member','active'),
    ('${outsiderMid}','${outsider}','${groupB}','member','active'),
    ('${internalMid}','${manager}','${internalGroup}','member','active');
  INSERT INTO public.group_positions VALUES
    ('${managePosition}','${groupA}','Treasurer'),
    ('${viewPosition}','${groupA}','Auditor'),
    ('${outsiderPosition}','${groupB}','Treasurer');
  INSERT INTO public.position_assignments(position_id,membership_id) VALUES
    ('${managePosition}','${managerMid}'),
    ('${managePosition}','${inactiveMid}'),
    ('${viewPosition}','${viewerMid}'),
    ('${outsiderPosition}','${outsiderMid}');
  INSERT INTO public.position_permissions(position_id,permission) VALUES
    ('${managePosition}','finances.manage'),
    ('${viewPosition}','finances.view'),
    ('${outsiderPosition}','finances.manage');
  INSERT INTO public.projects VALUES
    ('${projectA}','${groupA}','A project'),('${projectB}','${groupB}','B project');
  INSERT INTO public.financial_ledger_epochs VALUES
    ('${epochA}','${groupA}','USD','2026-01-01',NULL),
    ('${epochAOld}','${groupA}','USD','2025-01-01','2026-01-01'),
    ('${epochAXaf}','${groupA}','XAF','2024-01-01','2025-01-01'),
    ('${epochB}','${groupB}','USD','2026-01-01',NULL),
    ('${epochXaf}','${groupXaf}','XAF','2026-01-01',NULL),
    ('${epochInternal}','${internalGroup}','USD','2026-01-01',NULL);
  INSERT INTO financial_private.internal_financial_tenants VALUES('${internalOrg}','qa');
`;

before(async () => {
  docker(["run", "--rm", "-d", "--name", container, "--network", "none",
    "--label", "villageclaq.test=f3-foundation", "-e", "POSTGRES_HOST_AUTH_METHOD=trust", image]);
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      docker(["exec", container, "pg_isready", "-U", "postgres"]);
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  assert.equal(ready, true, "disposable PostgreSQL did not become ready");
  const info = JSON.parse(docker(["inspect", container]))[0];
  assert.equal(info.Config.Labels["villageclaq.test"], "f3-foundation");
  assert.equal(info.HostConfig.NetworkMode, "none");
  assert.deepEqual(info.HostConfig.PortBindings, {});
  assert.equal(info.Mounts.some((mount) => mount.Type === "bind"), false);
  sql(setup);
  sql(migration());
  sql(`
    INSERT INTO public.financial_accounts(id,group_id,opened_ledger_epoch_id,currency,name,kind) VALUES
      ('${accountA}','${groupA}','${epochA}','USD','A Bank','bank'),
      ('${accountB}','${groupB}','${epochB}','USD','B Bank','bank'),
      ('${accountAXaf}','${groupA}','${epochAXaf}','XAF','A Historical XAF','cash'),
      ('${accountXaf}','${groupXaf}','${epochXaf}','XAF','XAF Cash','cash'),
      ('${accountInternal}','${internalGroup}','${epochInternal}','USD','QA Bank','bank');
    INSERT INTO public.financial_funds(id,group_id,name,is_restricted,is_default) VALUES
      ('${fundA}','${groupA}','General',false,true),
      ('${restrictedA}','${groupA}','Restricted',true,false),
      ('${fundB}','${groupB}','General',false,true),
      ('${fundXaf}','${groupXaf}','General',false,true),
      ('${fundInternal}','${internalGroup}','General',false,true);
    INSERT INTO public.financial_categories(id,group_id,name,category_class,is_system) VALUES
      ('${incomeA}','${groupA}','Donations','income',true),
      ('${expenseA}','${groupA}','Operations','expense',true),
      ('${incomeB}','${groupB}','Donations','income',true),
      ('${incomeXaf}','${groupXaf}','Donations','income',true),
      ('${incomeInternal}','${internalGroup}','Donations','income',true);
  `);
});

after(() => {
  try {
    const info = JSON.parse(docker(["inspect", container]))[0];
    if (info.Config.Labels["villageclaq.test"] === "f3-foundation") {
      docker(["rm", "-f", container]);
    }
  } catch {
    // Docker --rm may already have removed the isolated container.
  }
});

test("A. migration applies cleanly in fresh disposable PostgreSQL", () => {
  assert.equal(sql(`SELECT count(*) FROM pg_class WHERE relname IN
    ('financial_accounts','financial_funds','financial_categories','financial_events','financial_postings')`), "5");
  assert.equal(sql(`SELECT count(*) FROM pg_trigger WHERE tgname IN
    ('financial_events_balance_guard','financial_postings_balance_guard')`), "2");
});

test("B. authenticated clients cannot insert financial events", () => {
  const error = sqlFailure(eventInsert({ eventId: id(801) }), { role: "authenticated", actor: manager });
  assert.match(error, /permission denied for table financial_events/);
});

test("C. authenticated clients cannot insert postings", () => {
  const error = sqlFailure(postingInsert({ postingId: id(802), eventId: id(899), amount: 10 }),
    { role: "authenticated", actor: manager });
  assert.match(error, /permission denied for table financial_postings/);
});

test("D. authenticated clients cannot update posted economic meaning", () => {
  sql(balancedEvent({ eventId: id(810), postingBase: 811, source: "rls-update" }));
  const error = sqlFailure(`UPDATE financial_events SET occurred_at=occurred_at+interval '1 day'
    WHERE id='${id(810)}'`, { role: "authenticated", actor: manager });
  assert.match(error, /permission denied for table financial_events/);
});

test("E. authenticated clients cannot delete posted truth", () => {
  for (const [table, predicate] of [
    ["financial_postings", `event_id='${id(810)}'`],
    ["financial_events", `id='${id(810)}'`],
  ]) {
    const error = sqlFailure(`DELETE FROM ${table} WHERE ${predicate}`,
      { role: "authenticated", actor: manager });
    assert.match(error, new RegExp(`permission denied for table ${table}`));
  }
});

test("F. anon cannot mutate financial or configuration tables", () => {
  const truth = sqlFailure(eventInsert({ eventId: id(820) }), { role: "anon" });
  const config = sqlFailure(`INSERT INTO financial_funds(group_id,name) VALUES('${groupA}','Anon')`,
    { role: "anon" });
  assert.match(truth, /permission denied/);
  assert.match(config, /permission denied/);
});

test("G. inactive officers fail the financial mutation authorization helper", () => {
  const error = sqlFailure(`SELECT financial_core.assert_finances_manage('${groupA}')`,
    { role: "authenticated", actor: inactive });
  assert.match(error, /ACTIVE_FINANCES_MANAGE_REQUIRED/);
});

test("H. active members without finances.manage fail authorization", () => {
  const error = sqlFailure(`SELECT financial_core.assert_finances_manage('${groupA}')`,
    { role: "authenticated", actor: member });
  assert.match(error, /ACTIVE_FINANCES_MANAGE_REQUIRED/);
});

test("I. active finances.manage callers pass authorization", () => {
  assert.equal(sql(`SELECT financial_core.assert_finances_manage('${groupA}')`,
    { role: "authenticated", actor: manager }), manager);
});

test("J. cross-group account references are rejected", () => {
  const eventId = id(830);
  const error = sqlFailure(`BEGIN;${eventInsert({ eventId, source: "cross-account" })}
    ${postingInsert({ postingId: id(831), eventId, amount: 10, accountId: accountB })}COMMIT;`);
  assert.match(error, /financial_postings_account_scope/);
});

test("K. cross-group fund references are rejected", () => {
  const eventId = id(840);
  const error = sqlFailure(`BEGIN;${eventInsert({ eventId, source: "cross-fund" })}
    ${postingInsert({ postingId: id(841), eventId, amount: 10, fundId: fundB })}COMMIT;`);
  assert.match(error, /financial_postings_fund_scope/);
});

test("L. cross-group category references are rejected", () => {
  const eventId = id(850);
  const error = sqlFailure(`BEGIN;${eventInsert({ eventId, source: "cross-category" })}
    ${postingInsert({ postingId: id(851), eventId, amount: 10 })}
    ${postingInsert({ postingId: id(852), eventId, amount: -10, control: "income",
      accountId: null, categoryId: incomeB, categoryClass: "income" })}COMMIT;`);
  assert.match(error, /financial_postings_category_scope/);
});

test("M. account and event currency mismatch is rejected", () => {
  const eventId = id(860);
  const error = sqlFailure(`BEGIN;${eventInsert({ eventId, source: "account-currency" })}
    ${postingInsert({ postingId: id(861), eventId, amount: 10, accountId: accountAXaf })}COMMIT;`);
  assert.match(error, /financial_postings_account_scope/);
});

test("N. event and epoch currency mismatch is rejected", () => {
  const error = sqlFailure(eventInsert({
    eventId: id(870), currency: "XAF", epochId: epochA, source: "epoch-currency",
  }));
  assert.match(error, /financial_events_epoch_scope/);
});

test("O. account currency cannot change in place", () => {
  const error = sqlFailure(`UPDATE financial_accounts SET currency='XAF' WHERE id='${accountA}'`);
  assert.match(error, /FINANCIAL_ACCOUNT_IDENTITY_IMMUTABLE/);
});

test("P. duplicate source-effect-epoch identity is rejected", () => {
  sql(balancedEvent({ eventId: id(880), postingBase: 881, source: "natural-key" }));
  const error = sqlFailure(balancedEvent({
    eventId: id(883), postingBase: 884, source: "natural-key",
  }));
  assert.match(error, /financial_events_source_identity/);
  assert.equal(sql(`SELECT count(*) FROM financial_events WHERE source_record_id='natural-key'`), "1");
});

test("Q. manual request identity is stable across epoch changes", () => {
  const requestId = id(890);
  sql(balancedEvent({ eventId: id(891), postingBase: 892, source: "manual-one", requestId }));
  const error = sqlFailure(balancedEvent({
    eventId: id(894), postingBase: 895, source: "manual-two", requestId, epochId: epochAOld,
    occurredAt: "2025-09-08T12:00:00Z",
  }));
  assert.match(error, /financial_events_manual_request/);
});

test("R. an empty posted event is rejected at commit", () => {
  const eventId = id(900);
  const error = sqlFailure(`BEGIN;${eventInsert({ eventId, source: "empty" })}COMMIT;`);
  assert.match(error, /POSTED_FINANCIAL_EVENT_REQUIRES_POSTINGS/);
  assert.equal(sql(`SELECT count(*) FROM financial_events WHERE id='${eventId}'`), "0");
});

test("S. an unbalanced posted event is rejected", () => {
  const eventId = id(910);
  const error = sqlFailure(`BEGIN;${eventInsert({ eventId, source: "unbalanced" })}
    ${postingInsert({ postingId: id(911), eventId, amount: 10 })}
    ${postingInsert({ postingId: id(912), eventId, amount: -9, control: "income",
      accountId: null, categoryId: incomeA, categoryClass: "income" })}COMMIT;`);
  assert.match(error, /POSTED_FINANCIAL_EVENT_UNBALANCED/);
});

test("T. a balanced posted event is accepted under privileged context", () => {
  sql(balancedEvent({ eventId: id(920), postingBase: 921, source: "balanced" }));
  assert.equal(sql(`SELECT count(*) FROM financial_postings WHERE event_id='${id(920)}'`), "2");
  assert.equal(sql(`SELECT sum(amount_signed) FROM financial_postings WHERE event_id='${id(920)}'`), "0.00000000");
});

test("U. failed posting sets roll back event and all postings", () => {
  const eventId = id(930);
  const error = sqlFailure(`BEGIN;${eventInsert({ eventId, source: "partial" })}
    ${postingInsert({ postingId: id(931), eventId, amount: 10 })}COMMIT;`);
  assert.match(error, /POSTED_FINANCIAL_EVENT_UNBALANCED/);
  assert.equal(sql(`SELECT count(*) FROM financial_events WHERE id='${eventId}'`), "0");
  assert.equal(sql(`SELECT count(*) FROM financial_postings WHERE event_id='${eventId}'`), "0");
});

test("V. posted event and posting economic fields are structurally immutable", () => {
  assert.match(sqlFailure(`UPDATE financial_events SET currency='EUR' WHERE id='${id(920)}'`),
    /POSTED_FINANCIAL_EVENT_IMMUTABLE/);
  assert.match(sqlFailure(`UPDATE financial_postings SET amount_signed=11 WHERE id='${id(921)}'`),
    /POSTED_FINANCIAL_POSTING_IMMUTABLE/);
  assert.match(sqlFailure(`DELETE FROM financial_postings WHERE id='${id(921)}'`),
    /POSTED_FINANCIAL_POSTING_IMMUTABLE/);
});

test("W. internal test-tenant designation provides no runtime bypass", () => {
  const eventId = id(940);
  const error = sqlFailure(`BEGIN;${eventInsert({
    eventId, groupId: internalGroup, epochId: epochInternal, source: "internal-unbalanced",
  })}${postingInsert({
    postingId: id(941), eventId, amount: 10, groupId: internalGroup,
    epochId: epochInternal, accountId: accountInternal, fundId: fundInternal,
  })}COMMIT;`);
  assert.match(error, /POSTED_FINANCIAL_EVENT_UNBALANCED/);
  assert.equal(sql(`SELECT count(*) FROM financial_events WHERE id='${eventId}'`), "0");
});

test("X. configuration RLS is manager-only and group-scoped", () => {
  assert.equal(sql(`SELECT count(*) FROM financial_accounts`,
    { role: "authenticated", actor: manager }), "2");
  assert.equal(sql(`SELECT count(*) FROM financial_accounts WHERE group_id='${groupB}'`,
    { role: "authenticated", actor: manager }), "0");
  assert.equal(sql(`SELECT count(*) FROM financial_accounts`,
    { role: "authenticated", actor: member }), "0");
  assert.equal(sql(`SELECT count(*) FROM financial_accounts`,
    { role: "authenticated", actor: inactive }), "0");
  sql(`INSERT INTO financial_funds(id,group_id,name) VALUES('${id(950)}','${groupA}','Manager Fund')`,
    { role: "authenticated", actor: manager });
  assert.equal(sql(`UPDATE financial_funds SET name='Manager Fund Renamed' WHERE id='${id(950)}'
    RETURNING name`, { role: "authenticated", actor: manager }), "Manager Fund Renamed");
  assert.match(sqlFailure(`INSERT INTO financial_funds(id,group_id,name)
    VALUES('${id(951)}','${groupB}','Forged Fund')`,
    { role: "authenticated", actor: manager }), /row-level security/);
});

test("financial occurrence dates must fall inside the bound ledger epoch", () => {
  const error = sqlFailure(eventInsert({
    eventId: id(952), source: "wrong-epoch-date", occurredAt: "2025-09-08T12:00:00Z",
  }));
  assert.match(error, /FINANCIAL_EVENT_OUTSIDE_LEDGER_EPOCH/);
});

test("raw financial truth reads enforce the P1-F officer/member boundary", () => {
  sql(balancedEvent({
    eventId: id(953), postingBase: 954, source: "group-b-read",
    groupId: groupB, epochId: epochB, accountId: accountB,
    fundId: fundB, categoryId: incomeB,
  }));
  assert.ok(Number(sql(`SELECT count(*) FROM financial_events`,
    { role: "authenticated", actor: viewer })) > 0);
  assert.equal(sql(`SELECT count(*) FROM financial_events WHERE group_id='${groupB}'`,
    { role: "authenticated", actor: viewer }), "0");
  assert.equal(sql(`SELECT count(*) FROM financial_events`,
    { role: "authenticated", actor: member }), "0");
  assert.equal(sql(`SELECT count(*) FROM financial_events WHERE group_id='${groupB}'`,
    { role: "authenticated", actor: outsider }), "1");
});

test("catalog audit confirms forced RLS, pinned definers, and denied truth DML", () => {
  assert.equal(sql(`SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public'
      AND c.relname IN ('financial_accounts','financial_funds','financial_categories',
        'financial_events','financial_postings')
      AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)`), "0");
  assert.equal(sql(`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='financial_core' AND p.prosecdef
      AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig,ARRAY[]::text[])) setting
        WHERE setting='search_path=""')`), "0");
  for (const role of ["anon", "authenticated", "service_role"]) {
    for (const privilege of ["INSERT", "UPDATE", "DELETE"]) {
      assert.equal(sql(`SELECT has_table_privilege('${role}','public.financial_events','${privilege}')`), "f");
      assert.equal(sql(`SELECT has_table_privilege('${role}','public.financial_postings','${privilege}')`), "f");
    }
  }
});

test("exact precision rejects fractional XAF and accepts integer XAF", () => {
  const badEvent = id(960);
  const bad = sqlFailure(`BEGIN;${eventInsert({
    eventId: badEvent, groupId: groupXaf, epochId: epochXaf, currency: "XAF", source: "xaf-fraction",
  })}${postingInsert({
    postingId: id(961), eventId: badEvent, amount: "1.50", groupId: groupXaf,
    epochId: epochXaf, currency: "XAF", accountId: accountXaf, fundId: fundXaf,
  })}COMMIT;`);
  assert.match(bad, /financial_postings_amount_precision/);
  sql(balancedEvent({
    eventId: id(962), postingBase: 963, amount: "100", groupId: groupXaf,
    epochId: epochXaf, currency: "XAF", accountId: accountXaf,
    fundId: fundXaf, categoryId: incomeXaf, source: "xaf-integer",
  }));
  assert.equal(sql(`SELECT sum(amount_signed) FROM financial_postings WHERE event_id='${id(962)}'`), "0.00000000");
});

test("income and expense postings require matching category classes", () => {
  const eventId = id(970);
  const error = sqlFailure(`BEGIN;${eventInsert({ eventId, source: "category-class" })}
    ${postingInsert({ postingId: id(971), eventId, amount: 10 })}
    ${postingInsert({ postingId: id(972), eventId, amount: -10, control: "income",
      accountId: null, categoryId: expenseA, categoryClass: "expense" })}COMMIT;`);
  assert.match(error, /financial_postings_category_shape/);
});

test("posting event date and scope are structurally shared", () => {
  const eventId = id(980);
  const error = sqlFailure(`BEGIN;${eventInsert({ eventId, source: "date-scope" })}
    ${postingInsert({ postingId: id(981), eventId, amount: 10,
      occurredAt: "2026-09-09T12:00:00Z" })}
    ${postingInsert({ postingId: id(982), eventId, amount: -10, control: "income",
      accountId: null, categoryId: incomeA, categoryClass: "income",
      occurredAt: "2026-09-09T12:00:00Z" })}COMMIT;`);
  assert.match(error, /financial_postings_event_scope/);
});

test("member and project dimensions cannot cross tenants", () => {
  const memberEvent = id(990);
  assert.match(sqlFailure(`BEGIN;${eventInsert({ eventId: memberEvent, source: "member-scope" })}
    ${postingInsert({ postingId: id(991), eventId: memberEvent, amount: 10,
      memberId: outsiderMid })}COMMIT;`), /financial_postings_member_scope/);
  const projectEvent = id(992);
  assert.match(sqlFailure(`BEGIN;${eventInsert({ eventId: projectEvent, source: "project-scope" })}
    ${postingInsert({ postingId: id(993), eventId: projectEvent, amount: 10,
      projectId: projectB })}COMMIT;`), /financial_postings_project_scope/);
});

test("pre-insert occurrence lock serializes before an event row exists", async () => {
  const lock = `SELECT financial_core.lock_financial_occurrence(
    '${groupA}','test_fixture','not-yet-inserted','collection','${epochA}');`;
  const first = asyncSql(`BEGIN;${lock}SELECT pg_sleep(1.2);COMMIT;`);
  await new Promise((resolve) => setTimeout(resolve, 150));
  const started = Date.now();
  sql(`BEGIN;${lock}COMMIT;`);
  const waited = Date.now() - started;
  await first;
  assert.ok(waited >= 700, `second tuple lock waited only ${waited}ms`);
  assert.equal(sql(`SELECT count(*) FROM financial_events WHERE source_record_id='not-yet-inserted'`), "0");
});

test("correction links are same-tenant and allow at most one reversal", () => {
  const original = id(1000), reversal = id(1003);
  sql(balancedEvent({ eventId: original, postingBase: 1001, source: "original" }));
  sql(balancedEvent({
    eventId: reversal, postingBase: 1004, source: "reversal-one", reversalOf: original,
  }));
  assert.match(sqlFailure(balancedEvent({
    eventId: id(1006), postingBase: 1007, source: "reversal-two", reversalOf: original,
  })), /financial_events_one_reversal/);
  const cross = id(1009);
  assert.match(sqlFailure(eventInsert({
    eventId: cross, groupId: groupB, epochId: epochB, source: "reversal-cross",
    reversalOf: original,
  })), /financial_events_reversal_scope/);
});

test("service_role has read access but no direct financial truth DML", () => {
  assert.equal(sql(`SELECT count(*) FROM financial_events`, { role: "service_role" }) !== "", true);
  assert.match(sqlFailure(eventInsert({ eventId: id(1010), source: "service-direct" }),
    { role: "service_role" }), /permission denied for table financial_events/);
});

test("custody balances remain derived and fixed controls are not configurable rows", () => {
  assert.equal(sql(`SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='financial_accounts'
      AND column_name IN ('balance','current_balance','opening_balance')`), "0");
  assert.equal(sql(`SELECT enum_range(NULL::financial_control_class)::text`),
    "{custody,income,expense,opening_position,receivable,liability}");
});
