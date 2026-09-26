// Run only against an isolated local F3 stub + audit stub + 00137 migration.
// F3_QUAL_WORK_URL must be a guarded f3_* loopback PostgreSQL 17 database.
import assert from 'node:assert/strict';
import { psql } from '../../../scripts/fixtures/disposable-postgres.mjs';
import { assertLocalWorkConnection, spawnLocalPsql } from '../../../scripts/lib/f3-local-connection-guard.mjs';

const url = process.env.F3_QUAL_WORK_URL;
assertLocalWorkConnection(url);
const sql = (query) => psql(url, query);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const group = id(1), otherGroup = id(2), actor = id(9001), otherActor = id(9002);
const sameGroupOfficer = id(9003), ordinary = id(9004);
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const command = (request, patch = {}) => ({
  action: 'money_in', group_id: group, request_id: id(request),
  occurred_at: '2026-09-08T12:00:00Z', amount: '500.00', currency: 'USD',
  account_id: id(101), fund_id: id(201), category_id: id(301), ...patch,
});
const json = (value) => `${quote(JSON.stringify(value))}::jsonb`;
const as = (who, query) => `SET ROLE authenticated; SET request.jwt.claim.sub=${quote(who)}; ${query}`;
function call(who, name, args) {
  return JSON.parse(sql(as(who, `SELECT public.${name}(${args});`)));
}
function fails(who, name, args, pattern) {
  try { call(who, name, args); }
  catch (error) { assert.match(String(error.stderr || error.message), pattern); return; }
  assert.fail(`expected ${name} to fail: ${pattern}`);
}
function count(table, condition = 'true') {
  return Number(sql(`SELECT count(*) FROM ${table} WHERE ${condition};`));
}
function asyncCall(who, name, args) {
  return new Promise((resolve, reject) => {
    const child = spawnLocalPsql(url, ['-At', '-c', as(who, `SELECT public.${name}(${args});`)], { role: 'work' });
    let output = '', error = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { error += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(JSON.parse(output.trim())) : reject(new Error(error || output)));
  });
}

assert.equal(count('public.financial_events'), 0, 'fixture must begin without financial events');
sql(`
  INSERT INTO public.groups(id,currency) VALUES ('${group}','USD'),('${otherGroup}','USD');
  INSERT INTO public.profiles(id) VALUES ('${actor}'),('${otherActor}'),('${sameGroupOfficer}'),('${ordinary}');
  INSERT INTO public.memberships(id,group_id,user_id,role) VALUES
    ('${id(9101)}','${group}','${actor}','member'),
    ('${id(9102)}','${otherGroup}','${otherActor}','member'),
    ('${id(9103)}','${group}','${sameGroupOfficer}','member'),
    ('${id(9104)}','${group}','${ordinary}','member');
  INSERT INTO public.group_positions(id,group_id,title) VALUES
    ('${id(9201)}','${group}','Treasurer'),('${id(9202)}','${otherGroup}','Treasurer'),
    ('${id(9203)}','${group}','Treasurer');
  INSERT INTO public.position_assignments(membership_id,position_id) VALUES
    ('${id(9101)}','${id(9201)}'),('${id(9102)}','${id(9202)}'),('${id(9103)}','${id(9203)}');
  INSERT INTO public.position_permissions(position_id,permission) VALUES
    ('${id(9201)}','finances.manage'),('${id(9202)}','finances.manage'),
    ('${id(9203)}','finances.manage');
  INSERT INTO public.financial_ledger_epochs
    (id,group_id,currency,effective_from,source_kind,approval_note) VALUES
    ('${id(21)}','${group}','USD','2026-01-01T00:00:00Z','cutover','Isolated qualification fixture');
  INSERT INTO public.financial_accounts
    (id,group_id,opened_ledger_epoch_id,currency,name,kind,opened_at) VALUES
    ('${id(101)}','${group}','${id(21)}','USD','Fixture bank','bank','2026-01-01T00:00:00Z');
  INSERT INTO public.financial_funds(id,group_id,name,is_default) VALUES
    ('${id(201)}','${group}','General',true);
  INSERT INTO public.financial_categories(id,group_id,name,category_class) VALUES
    ('${id(301)}','${group}','Donation','income');
`);

const first = command(601);
assert.equal(call(actor, 'prepare_manual_financial_intent', json(first)).status, 'prepared');
const initial = call(actor, 'post_manual_financial_intent', `${quote(first.request_id)}::uuid,${json(first)}`);
assert.equal(initial.decision, 'POSTED');
const retry = call(actor, 'post_manual_financial_intent', `${quote(first.request_id)}::uuid,${json(first)}`);
assert.equal(retry.decision, 'IDEMPOTENT_RETURN_EXISTING');
assert.equal(retry.event_id, initial.event_id);
assert.equal(count('public.financial_events'), 1);
assert.equal(count('public.financial_postings'), 2);
assert.equal(count('public.group_audit_logs', "action='financial_event.posted'"), 1);
console.log('PASS lost-response same-intent recovery: one event, two postings, one trusted audit');

const second = command(602);
assert.equal(call(actor, 'prepare_manual_financial_intent', json(second)).status, 'prepared');
const deliberate = call(actor, 'post_manual_financial_intent', `${quote(second.request_id)}::uuid,${json(second)}`);
assert.equal(deliberate.decision, 'POSTED');
assert.notEqual(deliberate.event_id, initial.event_id);
assert.equal(count('public.financial_events'), 2);
console.log('PASS deliberate second identical transaction: distinct intent posts separately');

const changed = command(601, { amount: '600.00' });
fails(actor, 'prepare_manual_financial_intent', json(changed), /CONFLICT/);
fails(actor, 'post_manual_financial_intent', `${quote(first.request_id)}::uuid,${json(changed)}`, /CONFLICT/);
assert.equal(count('public.financial_events'), 2);
console.log('PASS changed material payload under same identity conflicts');

const pending = command(603);
call(actor, 'prepare_manual_financial_intent', json(pending));
assert.equal(call(actor, 'list_manual_financial_intents', `${quote(group)}::uuid,0`).length, 3);
assert.deepEqual(call(sameGroupOfficer, 'list_manual_financial_intents', `${quote(group)}::uuid,0`), []);
fails(sameGroupOfficer, 'post_manual_financial_intent', `${quote(pending.request_id)}::uuid,${json(pending)}`, /DENY/);
fails(otherActor, 'list_manual_financial_intents', `${quote(group)}::uuid,0`, /DENY|ACTIVE_FINANCES_MANAGE_REQUIRED/);
fails(otherActor, 'post_manual_financial_intent', `${quote(pending.request_id)}::uuid,${json(pending)}`, /DENY|ACTIVE_FINANCES_MANAGE_REQUIRED/);
fails(ordinary, 'post_manual_financial_intent', `${quote(pending.request_id)}::uuid,${json(pending)}`, /DENY|ACTIVE_FINANCES_MANAGE_REQUIRED/);
sql(`DELETE FROM public.position_permissions WHERE position_id='${id(9201)}';`);
fails(actor, 'list_manual_financial_intents', `${quote(group)}::uuid,0`, /DENY|ACTIVE_FINANCES_MANAGE_REQUIRED/);
fails(actor, 'post_manual_financial_intent', `${quote(pending.request_id)}::uuid,${json(pending)}`, /DENY|ACTIVE_FINANCES_MANAGE_REQUIRED/);
sql(`INSERT INTO public.position_permissions(position_id,permission) VALUES ('${id(9201)}','finances.manage');`);
console.log('PASS actor, tenant, and replay-time revocation boundaries');

const blocked = command(606);
call(actor, 'prepare_manual_financial_intent', json(blocked));
const locker = new Promise((resolve, reject) => {
  const child = spawnLocalPsql(url, ['-At', '-c', `BEGIN;
    SELECT request_id FROM financial_core.manual_financial_intents
      WHERE request_id='${blocked.request_id}' FOR UPDATE;
    SELECT pg_sleep(4); COMMIT;`], { role: 'work' });
  let error = '';
  child.stderr.on('data', (chunk) => { error += chunk; });
  child.on('error', reject);
  child.on('close', (code) => code === 0 ? resolve() : reject(new Error(error)));
});
await new Promise((resolve) => setTimeout(resolve, 250));
const waitingReplay = asyncCall(actor, 'post_manual_financial_intent',
  `${quote(blocked.request_id)}::uuid,${json(blocked)}`).then(
  () => assert.fail('revoked waiting actor posted'),
  (error) => assert.match(String(error), /ACTIVE_FINANCES_MANAGE_REQUIRED|DENY/),
);
let sawWait = false;
for (let attempt = 0; attempt < 25; attempt++) {
  if (Number(sql(`SELECT count(*) FROM pg_stat_activity a
    WHERE a.query LIKE '%post_manual_financial_intent%'
      AND pg_catalog.cardinality(pg_catalog.pg_blocking_pids(a.pid))>0;`)) > 0) {
    sawWait = true;
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
}
assert.ok(sawWait, 'replay must be observed waiting on the intent lock');
sql(`DELETE FROM public.position_permissions WHERE position_id='${id(9201)}';`);
await Promise.all([locker, waitingReplay]);
assert.equal(count('public.financial_events'), 2);
sql(`INSERT INTO public.position_permissions(position_id,permission) VALUES ('${id(9201)}','finances.manage');`);
console.log('PASS authority revoked during intent-lock wait: denied after wait, no event');

fails(otherActor, 'record_client_activity', `${quote(group)}::uuid,'financial_event.posted',NULL,NULL,NULL,'{}'::jsonb`, /DENY/);
sql(as(ordinary, `SELECT public.record_client_activity(${quote(group)}::uuid,'financial_event.posted',NULL,NULL,NULL,'{}'::jsonb);`));
assert.equal(count('public.group_audit_logs', "action='client_activity'"), 1);
assert.equal(count('public.group_audit_logs', "action='financial_event.posted'"), 2);
fails(actor, 'post_financial_command', json(command(699)), /permission denied/i);
try {
  sql(as(actor, `INSERT INTO public.group_audit_logs(group_id,actor_id,action)
    VALUES ('${group}','${actor}','financial_event.posted');`));
  assert.fail('direct audit forgery was accepted');
} catch (error) {
  assert.match(String(error.stderr || error.message), /permission denied/i);
}
console.log('PASS direct consequential audit forgery and legacy posting bypass denied');

const auditFailure = command(604);
call(actor, 'prepare_manual_financial_intent', json(auditFailure));
sql(`
  CREATE FUNCTION public.qualification_reject_financial_audit() RETURNS trigger
  LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.action='financial_event.posted' THEN RAISE EXCEPTION 'INJECTED_AUDIT_FAILURE'; END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER qualification_reject_financial_audit BEFORE INSERT ON public.group_audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.qualification_reject_financial_audit();
`);
fails(actor, 'post_manual_financial_intent', `${quote(auditFailure.request_id)}::uuid,${json(auditFailure)}`, /INJECTED_AUDIT_FAILURE/);
assert.equal(count('public.financial_events'), 2);
assert.equal(count('public.financial_postings'), 4);
assert.equal(count('public.group_audit_logs', "action='financial_event.posted'"), 2);
assert.equal(count('financial_core.manual_financial_intents', `request_id='${auditFailure.request_id}' AND posted_event_id IS NULL`), 1);
sql('DROP TRIGGER qualification_reject_financial_audit ON public.group_audit_logs; DROP FUNCTION public.qualification_reject_financial_audit();');
assert.equal(call(actor, 'post_manual_financial_intent', `${quote(auditFailure.request_id)}::uuid,${json(auditFailure)}`).decision, 'POSTED');
assert.equal(count('public.financial_events'), 3);
console.log('PASS injected audit failure rolls back financial effect; retry succeeds');

const concurrent = command(605);
call(actor, 'prepare_manual_financial_intent', json(concurrent));
const both = await Promise.all([
  asyncCall(actor, 'post_manual_financial_intent', `${quote(concurrent.request_id)}::uuid,${json(concurrent)}`),
  asyncCall(actor, 'post_manual_financial_intent', `${quote(concurrent.request_id)}::uuid,${json(concurrent)}`),
]);
assert.deepEqual(both.map((x) => x.decision).sort(), ['IDEMPOTENT_RETURN_EXISTING', 'POSTED']);
assert.equal(both[0].event_id, both[1].event_id);
assert.equal(count('public.financial_events'), 4);
assert.equal(count('public.financial_postings'), 8);
assert.equal(count('public.group_audit_logs', "action='financial_event.posted'"), 4);
console.log('PASS concurrent retries: one effect and one trusted success audit');

// A bridge-style event inserted by a trusted database writer uses the same
// trigger. This exercises non-manual financial audit coverage in this fixture.
sql(`
  DO $$ DECLARE v_event uuid; BEGIN
    INSERT INTO public.financial_events
      (group_id,ledger_epoch_id,currency,event_class,source_module,source_record_id,
       effect_kind,request_id,economic_payload_fingerprint,occurred_at,created_by,description)
    SELECT group_id,ledger_epoch_id,currency,event_class,'qualification_bridge','bridge-occurrence-1',
      'bridge_income',NULL,economic_payload_fingerprint,occurred_at,created_by,'Fixture bridge event'
    FROM public.financial_events WHERE id='${initial.event_id}' RETURNING id INTO v_event;
    INSERT INTO public.financial_postings
      (event_id,group_id,ledger_epoch_id,currency,occurred_at,amount_signed,
       control_class,account_id,fund_id,category_id,category_class,member_id,project_id)
    SELECT v_event,group_id,ledger_epoch_id,currency,occurred_at,amount_signed,
      control_class,account_id,fund_id,category_id,category_class,member_id,project_id
    FROM public.financial_postings WHERE event_id='${initial.event_id}';
    IF NOT EXISTS (
      SELECT 1 FROM financial_core.financial_event_audit_links l
      JOIN public.group_audit_logs a ON a.id=l.audit_id
      WHERE l.event_id=v_event AND a.action='financial_event.posted'
        AND a.details->>'provenance'='financial_event_trigger'
    ) THEN RAISE EXCEPTION 'MISSING_BRIDGE_AUDIT'; END IF;
  END $$;
`);
assert.equal(count('public.financial_events'), 5);
assert.equal(count('public.group_audit_logs', "action='financial_event.posted'"), 5);
console.log('PASS bridge-style financial event receives one atomic server audit');

console.log('PASS isolated F3 stub regression complete');
