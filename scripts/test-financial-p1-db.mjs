import assert from "node:assert/strict";
import test, { before } from "node:test";
import { readFileSync } from "node:fs";
import { execFile, execFileSync } from "node:child_process";
import { computeMoneyFigures, computeObligationStates, allocatePaymentApplications } from "../src/lib/money.ts";

const container = "villageclaq-p1-isolated";
const epochMigration = "supabase/migrations/20260906140228_financial_ledger_epochs_expand.sql";
const migration = "supabase/migrations/20260906140229_financial_payment_integrity.sql";
const standingMigration = "supabase/migrations/20260908043912_standing_confirmed_basis_parity.sql";
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
function sql(query, actor) {
  const auth = actor ? `SET ROLE authenticated; SET request.jwt.claim.sub='${actor}';` : "";
  return execFileSync("docker", ["exec","-i",container,"psql","-X","-U","postgres","-v","ON_ERROR_STOP=1","-Atq"],
    { input: auth + query, encoding:"utf8", stdio:["pipe","pipe","pipe"] }).trim();
}
function asyncSql(query) {
  return new Promise((resolve,reject) => {
    execFile("docker",["exec",container,"psql","-X","-U","postgres","-v","ON_ERROR_STOP=1","-Atq","-c",query],
      { encoding:"utf8" },(error,out,err)=>error ? reject(new Error(err || error.message)) : resolve(out.trim()));
  });
}
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const group=id(1), group2=id(2), group3=id(3), group4=id(4);
const officer=id(101), member=id(102), peer=id(103), outsider=id(104);
const pendingOfficer=id(105), suspendedOfficer=id(106), archivedOfficer=id(107), exitedOfficer=id(108);
const mid=id(11), peerMid=id(12), otherMid=id(13), lifecycleTarget=id(14), type=id(21), type2=id(22), otherType=id(23), oid=id(31), oid2=id(32);
const internalOrg=id(940), customerConflictOrg=id(941);
const internalGroup=id(942), customerConflictGroup=id(943);
const platformSuper=id(944), inactivePlatformSuper=id(945), internalMember=id(946), customerConflictMember=id(947);
const internalTypeUsd=id(948), internalTypeXaf=id(949), customerTypeUsd=id(950), customerTypeXaf=id(951);
const val = (amount, extras={}) => ({membership_id:mid,contribution_type_id:type,amount,currency:"USD",payment_method:"cash",...extras});
const literal = value => "'" + JSON.stringify(value).replaceAll("'","''") + "'::jsonb";
function query(key,action,values={},payment=null,version=null,reason=null,gid=group) {
  return `SELECT public.apply_payment_command('${gid}','${id(key)}','${action}',${literal(values)},${payment?"'"+payment+"'":"NULL"},${version??"NULL"},${reason?"'"+reason.replaceAll("'","''")+"'":"NULL"});`;
}
function command(key,action,values={},payment=null,version=null,reason=null,actor=officer,gid=group) {
  return JSON.parse(sql(query(key,action,values,payment,version,reason,gid),actor));
}
function requestTransfer(memberId,sourceGroupId,destGroupId,carryOver,actorId) {
  return JSON.parse(sql(`SELECT public.request_member_transfer(
    '${memberId}','${sourceGroupId}','${destGroupId}',NULL,${carryOver ? "true" : "false"})`,actorId));
}
function executeTransfer(transferId,actorId) {
  return JSON.parse(sql(`SELECT public.execute_member_transfer('${transferId}')`,actorId));
}
function approveTransfer(transferId) {
  sql(`UPDATE member_transfers SET status='approved',approved_by_dest='${transferAdmin}' WHERE id='${transferId}'`);
}
function count(table) {
  const scope=table==="payments"?` WHERE group_id='${group}'`:"";
  return Number(sql(`SELECT count(*) FROM ${table}${scope}`));
}
function reconcile(expectedPaid,expectedDue,standing) {
  const obls=JSON.parse(sql(`SELECT jsonb_agg(o) FROM contribution_obligations o WHERE membership_id='${mid}'`));
  const pays=JSON.parse(sql(`SELECT COALESCE(jsonb_agg(p),'[]') FROM payments p WHERE membership_id='${mid}'`));
  const figures=computeMoneyFigures(obls,pays);
  const states=computeObligationStates(obls,pays);
  assert.equal(figures.collected,expectedPaid); assert.equal(figures.outstanding,expectedDue);
  for(const o of obls) assert.equal(Number(o.amount_paid),states.get(o.id).confirmedPaid);
  assert.equal(sql(`SELECT standing FROM memberships WHERE id='${mid}'`),standing);
  assert.equal(sql(`SELECT compute_member_standing('${mid}')`),standing);
}
before(() => {
  const info=JSON.parse(execFileSync("docker",["inspect",container],{encoding:"utf8"}))[0];
  assert.equal(info.Config.Labels["villageclaq.test"],"p1-isolated");
  assert.equal(info.HostConfig.NetworkMode,"none"); assert.deepEqual(info.HostConfig.PortBindings,{});
  assert.equal(info.Mounts.some(m=>m.Type==="bind"),false);
  // Only this dedicated, network-isolated synthetic database may be reset.
  sql("DROP SCHEMA IF EXISTS financial_private CASCADE; DROP SCHEMA IF EXISTS storage CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP ROLE IF EXISTS authenticated; DROP ROLE IF EXISTS anon; DROP ROLE IF EXISTS service_role;");
  sql(read("scripts/fixtures/financial-p1.sql"));
  const money=read("supabase/migrations/00002_money_tables.sql");
  // Explicit schema definitions only, not a historical migration runner.
  sql(money.slice(money.indexOf("CREATE TYPE contribution_frequency"),money.indexOf("CREATE TRIGGER update_contribution_types")));
  sql("ALTER TYPE payment_method ADD VALUE 'other'; ALTER TABLE payments ADD COLUMN status text NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','pending_confirmation','rejected')), ADD COLUMN payment_date date DEFAULT CURRENT_DATE, ADD COLUMN relief_plan_id uuid; CREATE TABLE payment_obligation_applications(payment_id uuid REFERENCES payments(id) ON DELETE CASCADE,obligation_id uuid REFERENCES contribution_obligations(id) ON DELETE CASCADE,amount_applied numeric,applied_at timestamptz DEFAULT now(),PRIMARY KEY(payment_id,obligation_id));");
  for(const [path,name] of [
    ["supabase/migrations/00072_meeting_minutes_rls_fixes.sql","has_group_permission"],
    ["supabase/migrations/00102_tenant_isolation_hardening.sql","is_group_admin_or_owner"],
    ["supabase/migrations/00108_member_privacy_hardening.sql","can_view_member_financial"],
    ["supabase/migrations/00098_membership_status_lifecycle.sql","prevent_membership_self_escalation"],
    ["supabase/migrations/00101_standing_factors_and_history.sql","compute_member_standing"],
    ["supabase/migrations/00101_standing_factors_and_history.sql","recalculate_membership_standing"]]) {
    const source=read(path),start=source.indexOf("CREATE OR REPLACE FUNCTION public."+name+"(");
    assert.ok(start>=0); sql(source.slice(start,source.indexOf("$$;",start)+3));
  }
  const adminSource=read("supabase/migrations/00061_batch3_fixes.sql");
  const adminStart=adminSource.indexOf("CREATE OR REPLACE FUNCTION public.is_group_admin(");
  const adminEnd=adminSource.indexOf("$$ LANGUAGE sql SECURITY DEFINER STABLE;",adminStart);
  sql(adminSource.slice(adminStart,adminEnd+"$$ LANGUAGE sql SECURITY DEFINER STABLE;".length));
  sql("CREATE TRIGGER prevent_membership_self_escalation BEFORE UPDATE ON memberships FOR EACH ROW EXECUTE FUNCTION prevent_membership_self_escalation();");
  sql(`INSERT INTO profiles VALUES('${officer}'),('${member}'),('${peer}'),('${outsider}'),
      ('${pendingOfficer}'),('${suspendedOfficer}'),('${archivedOfficer}'),('${exitedOfficer}');
    INSERT INTO groups(id,currency,settings) VALUES('${group}','USD','{}'),('${group2}','XAF','{}'),
      ('${group3}','EUR','{}'),('${group4}','NGN','{}');
    INSERT INTO memberships(id,group_id,user_id,role) VALUES('${id(10)}','${group}','${officer}','owner'),
    ('${mid}','${group}','${member}','member'),('${peerMid}','${group}','${peer}','member'),('${otherMid}','${group2}','${outsider}','owner');
    INSERT INTO memberships(id,group_id,user_id,role,membership_status) VALUES
      ('${id(15)}','${group}','${pendingOfficer}','owner','pending_approval'),
      ('${id(16)}','${group}','${suspendedOfficer}','owner','suspended'),
      ('${id(17)}','${group}','${archivedOfficer}','owner','archived'),
      ('${id(18)}','${group}','${exitedOfficer}','owner','exited');
    INSERT INTO memberships(id,group_id,role) VALUES('${lifecycleTarget}','${group}','member');
    INSERT INTO memberships(id,group_id,role)
      SELECT ('00000000-0000-4000-8001-'||lpad(n::text,12,'0'))::uuid,'${group3}','member'
      FROM generate_series(1,105) n;
    INSERT INTO contribution_types(id,group_id,name,amount,currency) VALUES
      ('${type}','${group}','Dues',100,'USD'),('${type2}','${group}','Purpose',100,'USD'),
      ('${otherType}','${group2}','Dues',100,'XAF'),('${id(24)}','${group3}','Scale dues',100,'EUR'),
      ('${id(25)}','${group4}','Branch dues',100,'NGN');
    INSERT INTO contribution_obligations(id,group_id,membership_id,contribution_type_id,amount,currency,due_date) VALUES
    ('${oid}','${group}','${mid}','${type}',100,'USD',CURRENT_DATE-10),
    ('${id(33)}','${group}','${peerMid}','${type}',100,'USD',CURRENT_DATE-10),
    ('${id(34)}','${group2}','${otherMid}','${otherType}',100,'XAF',CURRENT_DATE-10);
    INSERT INTO contribution_obligations(id,group_id,membership_id,contribution_type_id,amount,currency,due_date)
      SELECT ('00000000-0000-4000-8002-'||lpad(n::text,12,'0'))::uuid,'${group3}',
        ('00000000-0000-4000-8001-'||lpad((((n-1)%105)+1)::text,12,'0'))::uuid,
        '${id(24)}',100,'EUR',CURRENT_DATE-30-((n-1)/105)::int
      FROM generate_series(1,457) n;
    INSERT INTO payments(id,group_id,membership_id,amount,currency,payment_method,status,payment_date,recorded_by)
      SELECT ('00000000-0000-4000-8003-'||lpad(n::text,12,'0'))::uuid,'${group3}',
        ('00000000-0000-4000-8001-'||lpad(n::text,12,'0'))::uuid,
        10+n,'EUR','cash','confirmed',CURRENT_DATE-5,'${officer}'
      FROM generate_series(1,7) n;
    INSERT INTO payments(id,group_id,membership_id,contribution_type_id,amount,currency,payment_method,status,payment_date,recorded_by)
      SELECT ('00000000-0000-4000-8004-'||lpad(n::text,12,'0'))::uuid,'${group3}',
        ('00000000-0000-4000-8001-'||lpad((((n-1)/2)+1)::text,12,'0'))::uuid,
        '${id(24)}',20+((n-1)/2),'EUR','cash','confirmed',CURRENT_DATE-4,'${officer}'
      FROM generate_series(1,26) n;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;`);
  sql(`ALTER TABLE payments ENABLE ROW LEVEL SECURITY; ALTER TABLE contribution_types ENABLE ROW LEVEL SECURITY;
    ALTER TABLE contribution_obligations ENABLE ROW LEVEL SECURITY;
    CREATE POLICY baseline_payment_read ON payments FOR SELECT TO authenticated USING(can_view_member_financial(membership_id,group_id));
    CREATE POLICY baseline_type_read ON contribution_types FOR SELECT TO authenticated
      USING(EXISTS(SELECT 1 FROM memberships m WHERE m.group_id=contribution_types.group_id AND m.user_id=auth.uid()));
    CREATE POLICY baseline_type_insert ON contribution_types FOR INSERT TO authenticated
      WITH CHECK(EXISTS(SELECT 1 FROM memberships m WHERE m.group_id=contribution_types.group_id AND m.user_id=auth.uid() AND m.role IN('owner','admin')));
    CREATE POLICY baseline_type_update ON contribution_types FOR UPDATE TO authenticated
      USING(EXISTS(SELECT 1 FROM memberships m WHERE m.group_id=contribution_types.group_id AND m.user_id=auth.uid() AND m.role IN('owner','admin')));
    CREATE POLICY baseline_type_delete ON contribution_types FOR DELETE TO authenticated
      USING(EXISTS(SELECT 1 FROM memberships m WHERE m.group_id=contribution_types.group_id AND m.user_id=auth.uid() AND m.role IN('owner','admin')));
    CREATE POLICY baseline_obligation_read ON contribution_obligations FOR SELECT TO authenticated USING(can_view_member_financial(membership_id,group_id));
    CREATE POLICY baseline_obligation_insert ON contribution_obligations FOR INSERT TO authenticated
      WITH CHECK(is_group_admin(group_id) OR has_group_permission(group_id,'contributions.manage') OR has_group_permission(group_id,'finances.record'));
    CREATE POLICY baseline_obligation_update ON contribution_obligations FOR UPDATE TO authenticated
      USING(is_group_admin(group_id) OR has_group_permission(group_id,'contributions.manage') OR has_group_permission(group_id,'finances.record'));
    CREATE POLICY baseline_payment_insert ON payments FOR INSERT TO authenticated WITH CHECK(true);
    CREATE POLICY baseline_payment_update ON payments FOR UPDATE TO authenticated USING(true) WITH CHECK(true);
    CREATE POLICY baseline_payment_delete ON payments FOR DELETE TO authenticated USING(true);`);

  // Two identical mixed-currency shapes: one trusted internal tenant and one
  // ordinary customer. Classification, never naming or data shape, controls
  // only whether the release gate treats the conflict as blocking.
  sql(`INSERT INTO organizations(id,name) VALUES
      ('${internalOrg}','Internal fixture organization'),
      ('${customerConflictOrg}','METACU-shaped customer fixture');
    INSERT INTO profiles(id) VALUES
      ('${platformSuper}'),('${inactivePlatformSuper}'),('${internalMember}'),('${customerConflictMember}');
    INSERT INTO platform_staff(user_id,role,is_active) VALUES
      ('${platformSuper}','super_admin',true),('${inactivePlatformSuper}','super_admin',false);
    INSERT INTO groups(id,organization_id,name,currency,settings) VALUES
      ('${internalGroup}','${internalOrg}','Internal QA fixture','USD','{}'),
      ('${customerConflictGroup}','${customerConflictOrg}','METACU Edit','USD','{}');
    INSERT INTO memberships(id,group_id,user_id,role) VALUES
      ('${id(952)}','${internalGroup}','${internalMember}','owner'),
      ('${id(953)}','${customerConflictGroup}','${customerConflictMember}','owner');
    INSERT INTO contribution_types(id,group_id,name,amount,currency) VALUES
      ('${internalTypeUsd}','${internalGroup}','Current dues',100,'USD'),
      ('${internalTypeXaf}','${internalGroup}','Historical dues',50000,'XAF'),
      ('${customerTypeUsd}','${customerConflictGroup}','Current dues',100,'USD'),
      ('${customerTypeXaf}','${customerConflictGroup}','Historical dues',50000,'XAF');
    INSERT INTO contribution_obligations(id,group_id,membership_id,contribution_type_id,amount,currency,due_date) VALUES
      ('${id(954)}','${internalGroup}','${id(952)}','${internalTypeUsd}',100,'USD',CURRENT_DATE-10),
      ('${id(955)}','${internalGroup}','${id(952)}','${internalTypeXaf}',50000,'XAF',CURRENT_DATE-30),
      ('${id(956)}','${customerConflictGroup}','${id(953)}','${customerTypeUsd}',100,'USD',CURRENT_DATE-10),
      ('${id(957)}','${customerConflictGroup}','${id(953)}','${customerTypeXaf}',50000,'XAF',CURRENT_DATE-30);`);
  sql(read(epochMigration));
  assert.equal(sql(`SELECT count(*) FROM financial_private.classified_ledger_epoch_conflicts
    WHERE group_id='${internalGroup}' AND migration_classification='customer_blocking'`),"4");
  assert.equal(sql(`SELECT count(*) FROM financial_private.classified_ledger_epoch_conflicts
    WHERE group_id='${customerConflictGroup}' AND migration_classification='customer_blocking'`),"4");
  assert.throws(()=>sql(read(migration)),/FINANCIAL_LEGACY_RESOLUTION_REQUIRED/);
  sql(`SELECT public.set_internal_financial_tenant(
    '${internalOrg}',true,'qa','Synthetic internal migration fixture')`,platformSuper);
  assert.equal(sql(`SELECT count(*) FROM financial_private.classified_ledger_epoch_conflicts
    WHERE group_id='${internalGroup}' AND migration_classification='internal_nonblocking'`),"4");
  assert.equal(sql(`SELECT count(*) FROM financial_private.classified_ledger_epoch_conflicts
    WHERE group_id='${customerConflictGroup}' AND migration_classification='customer_blocking'`),"4");
  // Resolve only the synthetic customer fixture so Phase B can be exercised.
  // The internal conflict rows remain untouched and observable.
  sql(`DELETE FROM contribution_obligations WHERE group_id='${customerConflictGroup}';
    DELETE FROM contribution_types WHERE group_id='${customerConflictGroup}';
    UPDATE financial_private.ledger_epoch_conflicts
      SET resolution_status='approved',resolution_note='Synthetic fixture removed after gate assertion',
          resolved_by='${platformSuper}',resolved_at=now()
      WHERE group_id='${customerConflictGroup}';`);
  sql(read(migration));
  sql(read(standingMigration));
});

let first, second;
test("Phase A keeps internal conflicts visible while Phase B excludes only trusted designations",()=>{
  assert.equal(sql(`SELECT count(*) FROM financial_private.current_ledger_epoch_conflicts
    WHERE group_id='${internalGroup}'`),"4");
  assert.equal(sql(`SELECT count(*) FROM financial_private.classified_ledger_epoch_conflicts
    WHERE group_id='${internalGroup}' AND migration_classification='internal_nonblocking'`),"4");
  assert.equal(sql(`SELECT count(*) FROM contribution_types
    WHERE group_id='${internalGroup}' AND ledger_epoch_id IS NULL`),"2");
  assert.equal(sql(`SELECT count(*) FROM contribution_obligations
    WHERE group_id='${internalGroup}' AND ledger_epoch_id IS NULL`),"2");
  assert.equal(sql(`SELECT count(*) FROM financial_ledger_epochs
    WHERE group_id IN ('${group}','${group2}','${group3}','${group4}')
      AND effective_to IS NULL`),"4");
});
test("customer, cross-tenant, anonymous and inactive actors cannot designate internal tenants",()=>{
  for(const actor of [officer,outsider,internalMember,customerConflictMember,inactivePlatformSuper]) {
    assert.throws(()=>sql(`SELECT public.set_internal_financial_tenant(
      '${customerConflictOrg}',true,'test','Unauthorized designation attempt')`,actor),
      /PLATFORM_SUPER_ADMIN_REQUIRED/);
  }
  assert.equal(sql(`SELECT has_function_privilege('anon',
    'public.set_internal_financial_tenant(uuid,boolean,text,text)','EXECUTE')`),"f");
  assert.throws(()=>sql(`SET ROLE anon; SELECT public.set_internal_financial_tenant(
    '${customerConflictOrg}',true,'test','Anonymous designation attempt')`),/permission denied/);
  assert.throws(()=>sql(`SELECT count(*) FROM financial_private.internal_financial_tenants`,officer),/permission denied/);
  assert.throws(()=>sql(`SELECT public.set_internal_financial_tenant(
    '${id(999999)}',true,'test','Forged organization identifier')`,platformSuper),/ORGANIZATION_NOT_FOUND/);
  assert.throws(()=>sql(`SELECT public.set_internal_financial_tenant(
    '${customerConflictOrg}',NULL,'test','Invalid designation state')`,platformSuper),/INVALID_DESIGNATION_STATE/);
  assert.equal(sql(`SELECT count(*) FROM financial_private.internal_financial_tenants
    WHERE organization_id='${customerConflictOrg}'`),"0");
});
test("removing trusted designation makes identical conflicts blocking again",()=>{
  sql(`SELECT public.set_internal_financial_tenant(
    '${internalOrg}',false,NULL,'End synthetic QA designation')`,platformSuper);
  assert.equal(sql(`SELECT count(*) FROM financial_private.classified_ledger_epoch_conflicts
    WHERE group_id='${internalGroup}' AND migration_classification='customer_blocking'`),"4");
  sql(`SELECT public.set_internal_financial_tenant(
    '${internalOrg}',true,'qa','Restore synthetic QA designation')`,platformSuper);
  assert.equal(sql(`SELECT count(*) FROM platform_audit_logs
    WHERE target_id='${internalOrg}' AND action LIKE 'financial.internal_tenant.%'`),"3");
});
test("internal classification is not a general accounting bypass",()=>{
  assert.throws(()=>sql(`INSERT INTO contribution_types(id,group_id,name,amount,currency)
    VALUES('${id(958)}','${internalGroup}','Post-enforcement row',1,'USD')`,internalMember),
    /ACTIVE_LEDGER_EPOCH_REQUIRED/);
});
test("migration backfill reconciles clean customer assessments without inventing payments",()=>{
  assert.equal(count("payments"),0);
  assert.equal(count("financial_private.reconciliations"),0);
  assert.equal(sql(`SELECT count(*) FROM payments WHERE contribution_type_id IS NULL AND obligation_id IS NULL`),"7");
  assert.equal(sql(`SELECT count(*) FROM (SELECT membership_id,amount,payment_date FROM payments
    WHERE id::text LIKE '00000000-0000-4000-8004-%'
    GROUP BY membership_id,amount,payment_date HAVING count(*)=2) clusters`),"13");
  assert.equal(sql(`SELECT standing FROM memberships WHERE id='${mid}'`),"suspended");
});

test("active authorized officer can mutate contribution types and obligations",()=>{
  const lifecycleType=id(601), lifecycleObligation=id(602);
  sql(`INSERT INTO contribution_types(id,group_id,name,amount,currency)
    VALUES('${lifecycleType}','${group}','Lifecycle test',25,'USD')`,officer);
  assert.equal(sql(`WITH changed AS(UPDATE contribution_types SET amount=30 WHERE id='${lifecycleType}' RETURNING 1) SELECT count(*) FROM changed`,officer),"1");
  sql(`INSERT INTO contribution_obligations(id,group_id,membership_id,contribution_type_id,amount,currency,due_date)
    VALUES('${lifecycleObligation}','${group}','${lifecycleTarget}','${lifecycleType}',30,'USD',CURRENT_DATE+10)`,officer);
  assert.equal(sql(`WITH changed AS(UPDATE contribution_obligations SET amount=35 WHERE id='${lifecycleObligation}' RETURNING 1) SELECT count(*) FROM changed`,officer),"1");
  sql(`DELETE FROM contribution_obligations WHERE id='${lifecycleObligation}'`);
  assert.equal(sql(`WITH gone AS(DELETE FROM contribution_types WHERE id='${lifecycleType}' RETURNING 1) SELECT count(*) FROM gone`,officer),"1");
  assert.equal(sql(`SELECT standing FROM memberships WHERE id='${lifecycleTarget}'`),"good");
});
test("inactive, ordinary and cross-group actors cannot mutate financial definitions or trigger reconciliation",()=>{
  const deniedActors=[
    ["pending",pendingOfficer],
    ["suspended",suspendedOfficer],
    ["archived",archivedOfficer],
    ["exited",exitedOfficer],
    ["ordinary",peer],
    ["cross-group",outsider],
  ];
  const snapshot=()=>JSON.parse(sql(`SELECT jsonb_build_object(
    'types',(SELECT count(*) FROM contribution_types),
    'obligations',(SELECT count(*) FROM contribution_obligations),
    'amountPaid',(SELECT amount_paid FROM contribution_obligations WHERE id='${oid}'),
    'standing',(SELECT standing FROM memberships WHERE id='${mid}'),
    'applications',(SELECT count(*) FROM payment_obligation_applications))`));
  deniedActors.forEach(([label,actor],index)=>{
    const before=snapshot(), deniedType=id(610+index), deniedObligation=id(620+index);
    assert.throws(()=>sql(`INSERT INTO contribution_types(id,group_id,name,amount,currency)
      VALUES('${deniedType}','${group}','Denied ${label}',10,'USD')`,actor),/row-level security policy/);
    assert.equal(sql(`WITH changed AS(UPDATE contribution_types SET amount=amount+1 WHERE id='${type}' RETURNING 1) SELECT count(*) FROM changed`,actor),"0");
    assert.equal(sql(`WITH gone AS(DELETE FROM contribution_types WHERE id='${type2}' RETURNING 1) SELECT count(*) FROM gone`,actor),"0");
    assert.throws(()=>sql(`INSERT INTO contribution_obligations(id,group_id,membership_id,contribution_type_id,amount,currency,due_date)
      VALUES('${deniedObligation}','${group}','${mid}','${type}',10,'USD',CURRENT_DATE-1)`,actor),/row-level security policy/);
    assert.equal(sql(`WITH changed AS(UPDATE contribution_obligations SET amount=amount+1 WHERE id='${oid}' RETURNING 1) SELECT count(*) FROM changed`,actor),"0");
    assert.deepEqual(snapshot(),before,`${label} denial must not change financial state`);
  });
});
test("record 40 atomically updates applications, balance, standing and evidence",()=>{
  first=command(201,"record",val(40)); assert.equal(first.appliedTo.length,1);
  reconcile(40,60,"suspended"); assert.equal(count("financial_private.payment_commands"),1);
});
test("same key / timeout retry returns one payment and one accounting effect",()=>{
  const again=command(201,"record",val(40)); assert.equal(again.payment.id,first.payment.id);
  assert.equal(again.replayed,true); assert.equal(count("payments"),1); reconcile(40,60,"suspended");
});
test("reusing a key with changed input fails closed",()=>{
  assert.throws(()=>command(201,"record",val(41)),/IDEMPOTENCY_KEY_CONFLICT/);
  assert.equal(count("payments"),1);
});
test("completion 40 + 60 reconciles reports and persisted standing",()=>{
  second=command(202,"record",val(60)); reconcile(100,0,"good");
});
test("correction 60 to 20 reverses current effect while preserving before/after/actor/reason",()=>{
  const corrected=command(203,"correct",{amount:20},second.payment.id,1,"Corrected transcription");
  assert.equal(corrected.payment.financial_version,2); reconcile(60,40,"suspended");
  const history=JSON.parse(sql(`SELECT payment_command_history('${second.payment.id}')`,member));
  assert.equal(history.length,2); assert.equal(history[1].before.amount,60); assert.equal(history[1].after.amount,20);
  assert.equal(history[1].actorId,officer); assert.equal(history[1].reason,"Corrected transcription");
});
test("stale competing correction is rejected",()=>{
  assert.throws(()=>command(204,"correct",{amount:30},second.payment.id,1,"Stale correction"),/PAYMENT_VERSION_CONFLICT/);
  reconcile(60,40,"suspended");
});
test("void preserves financial evidence and removes only the valid accounting effect",()=>{
  command(205,"void",{},first.payment.id,1,"Duplicate offline entry"); reconcile(20,80,"suspended");
  assert.equal(count("payments"),2); assert.equal(sql(`SELECT status FROM payments WHERE id='${first.payment.id}'`),"rejected");
});
test("direct updates/deletes/inserts and forged command setting cannot bypass the RPC",()=>{
  for(const q of [`DELETE FROM payments WHERE id='${first.payment.id}'`,
    `UPDATE payments SET amount=10 WHERE id='${second.payment.id}'`,
    `SET villageclaq.payment_command='${id(203)}'; UPDATE payments SET amount=10 WHERE id='${second.payment.id}'`,
    `INSERT INTO payments(group_id,membership_id,amount,currency,recorded_by) VALUES('${group}','${mid}',1,'USD','${officer}')`])
    assert.throws(()=>sql(q,officer),/PAYMENT_(COMMAND_REQUIRED|HISTORY_IMMUTABLE)/);
});
test("pending submission is not collected, confirmation transitions atomically",()=>{
  const pending=command(206,"submit",val(80,{obligation_id:oid}),null,null,null,member);
  reconcile(20,80,"suspended");
  command(207,"confirm",{},pending.payment.id,1); reconcile(100,0,"good");
});
test("member cannot record/confirm or inspect a peer's history",()=>{
  assert.throws(()=>command(208,"record",val(1),null,null,null,member),/PAYMENT_NOT_AUTHORIZED/);
  assert.throws(()=>sql(`SELECT payment_command_history('${second.payment.id}')`,peer),/PAYMENT_NOT_AUTHORIZED/);
});
test("cross-group/member/obligation/currency input is rejected without writes",()=>{
  const n=count("payments");
  for(const values of [val(5,{membership_id:otherMid}),val(5,{obligation_id:id(33)}),val(5,{contribution_type_id:otherType}),val(5,{currency:"XAF"})])
    assert.throws(()=>command(209,"record",values),/PAYMENT_NOT_AUTHORIZED|PAYMENT_ATTRIBUTION_INVALID|CURRENCY_MISMATCH/);
  assert.equal(count("payments"),n);
});
test("general funds cover remaining obligations once, oldest first, without affecting peers",()=>{
  sql(`INSERT INTO contribution_obligations(id,group_id,membership_id,contribution_type_id,amount,currency,due_date)
    VALUES('${oid2}','${group}','${mid}','${type2}',100,'USD',CURRENT_DATE-5)`);
  const general=command(210,"record",val(130,{contribution_type_id:null}));
  assert.equal(general.appliedTo[0].obligationId,oid2); assert.equal(general.appliedTo[0].amountApplied,100);
  assert.equal(general.creditRemaining,30); reconcile(230,0,"good");
  assert.equal(sql(`SELECT amount_paid FROM contribution_obligations WHERE id='${id(33)}'`),"0.00");
  assert.equal(sql(`SELECT amount_paid FROM contribution_obligations WHERE id='${id(34)}'`),"0.00");
});
test("concurrent same-key commands have exactly one accounting effect",async()=>{
  const q=`SET ROLE authenticated; SET request.jwt.claim.sub='${officer}';`+query(211,"record",val(7));
  const rows=await Promise.all([asyncSql(q),asyncSql(q),asyncSql(q)]);
  assert.equal(new Set(rows.map(r=>JSON.parse(r).payment.id)).size,1);
  assert.equal(sql(`SELECT count(*) FROM financial_private.payment_commands WHERE request_id='${id(211)}'`),"1");
});
test("concurrent different requests serialize allocation without over-credit",async()=>{
  const prefix=`SET ROLE authenticated; SET request.jwt.claim.sub='${officer}';`;
  await Promise.all([asyncSql(prefix+query(212,"record",val(10))),asyncSql(prefix+query(213,"record",val(15)))]);
  reconcile(262,0,"good");
  assert.equal(sql(`SELECT amount_paid FROM contribution_obligations WHERE id='${oid}'`),"100.00");
});
test("failure after payment INSERT rolls back payment, application, command and standing",()=>{
  sql("CREATE FUNCTION public.p1_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'INJECTED_FAILURE'; END $$; CREATE TRIGGER zz_p1_fail AFTER INSERT ON payments FOR EACH ROW EXECUTE FUNCTION p1_fail();");
  const n=count("payments"),audit=count("financial_private.payment_commands"),apps=count("payment_obligation_applications");
  assert.throws(()=>command(214,"record",val(19)),/INJECTED_FAILURE/);
  assert.equal(count("payments"),n); assert.equal(count("financial_private.payment_commands"),audit);
  assert.equal(count("payment_obligation_applications"),apps); reconcile(262,0,"good");
  sql("DROP TRIGGER zz_p1_fail ON payments; DROP FUNCTION p1_fail();");
});
test("currency changes cannot rewrite existing ledger units",()=>{
  assert.throws(()=>sql(`UPDATE groups SET currency='XAF' WHERE id='${group}'`),/CURRENCY_TRANSITION_COMMAND_REQUIRED/);
  assert.throws(()=>sql(`UPDATE contribution_types SET currency='XAF' WHERE id='${type}'`),/ASSESSMENT_ATTRIBUTION_IMMUTABLE/);
});
test("assessment waiver/unwaiver recomputes applications and standing",()=>{
  sql(`UPDATE contribution_obligations SET status='waived' WHERE id='${oid2}'`);
  assert.equal(sql(`SELECT amount_paid FROM contribution_obligations WHERE id='${oid2}'`),"0.00");
  sql(`UPDATE contribution_obligations SET status='pending' WHERE id='${oid2}'`); reconcile(262,0,"good");
});
test("current and legacy receipt records allow owner/officer, deny peers/other groups/anon",()=>{
  const current=`${group}/synthetic.pdf`,legacy="legacy-fixture.pdf";
  sql(`INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES('receipts','${current}','${officer}'),('receipts','${legacy}','${officer}')`);
  const p=command(215,"record",val(1,{receipt_url:current}));
  // Synthetic pre-migration legacy linkage, injected only into this disposable fixture.
  sql(`ALTER TABLE payments DISABLE TRIGGER financial_payment_guard;
    UPDATE payments SET receipt_url='https://fixture.invalid/storage/v1/object/public/receipts/${legacy}' WHERE id='${first.payment.id}';
    ALTER TABLE payments ENABLE TRIGGER financial_payment_guard;`);
  for(const name of [current,legacy]) {
    for(const actor of [member,officer]) assert.equal(sql(`SELECT count(*) FROM storage.objects WHERE name='${name}'`,actor),"1");
    for(const actor of [peer,outsider]) assert.equal(sql(`SELECT count(*) FROM storage.objects WHERE name='${name}'`,actor),"0");
    assert.equal(sql(`SET ROLE anon; SELECT count(*) FROM storage.objects WHERE name='${name}'`),"0");
    assert.equal(sql(`WITH gone AS(DELETE FROM storage.objects WHERE name='${name}' RETURNING 1) SELECT count(*) FROM gone`,officer),"0");
  }
  assert.throws(()=>command(216,"record",val(1,{receipt_url:current,membership_id:peerMid})),/RECEIPT_ATTACHMENT_NOT_AUTHORIZED/);
  assert.equal(p.payment.receipt_url,current);
});
test("backfill/converged application rows match deterministic per-payment evidence",()=>{
  const obls=JSON.parse(sql(`SELECT jsonb_agg(o) FROM contribution_obligations o WHERE membership_id='${mid}'`));
  const pays=JSON.parse(sql(`SELECT jsonb_agg(p) FROM payments p WHERE membership_id='${mid}'`));
  const expected=allocatePaymentApplications(obls,pays).map(a=>[pays[a.paymentIndex].id,a.obligationId,a.amount]).sort();
  const actual=JSON.parse(sql(`SELECT COALESCE(jsonb_agg(jsonb_build_array(a.payment_id,a.obligation_id,a.amount_applied)),'[]')
    FROM payment_obligation_applications a JOIN payments p ON p.id=a.payment_id WHERE p.membership_id='${mid}'`)).sort();
  assert.deepEqual(actual,expected); assert.equal(count("financial_private.reconciliations"),0);
});
test("excluded types do not let general funds be spent again on standing-relevant debts",()=>{
  sql(`UPDATE groups SET settings=jsonb_build_object('standing_rules',jsonb_build_object('excluded_contribution_type_ids',jsonb_build_array('${type}'))) WHERE id='${group}';
    INSERT INTO contribution_obligations(id,group_id,membership_id,contribution_type_id,amount,currency,due_date)
    VALUES('${id(35)}','${group}','${peerMid}','${type2}',50,'USD',CURRENT_DATE-5)`);
  command(218,"record",val(100,{membership_id:peerMid,contribution_type_id:null}));
  assert.equal(sql(`SELECT amount_paid FROM contribution_obligations WHERE id='${id(33)}'`),"100.00");
  assert.equal(sql(`SELECT amount_paid FROM contribution_obligations WHERE id='${id(35)}'`),"0.00");
  assert.equal(sql(`SELECT standing FROM memberships WHERE id='${peerMid}'`),"suspended");
});
test("rejected pending funds leave collections and standing unchanged",()=>{
  const pending=command(219,"submit",val(50,{membership_id:peerMid,contribution_type_id:type2}),null,null,null,peer);
  command(220,"reject",{},pending.payment.id,1,"Evidence not confirmed");
  assert.equal(sql(`SELECT amount_paid FROM contribution_obligations WHERE id='${id(35)}'`),"0.00");
  assert.equal(sql(`SELECT standing FROM memberships WHERE id='${peerMid}'`),"suspended");
  command(221,"record",val(50,{membership_id:peerMid,contribution_type_id:type2}));
  assert.equal(sql(`SELECT standing FROM memberships WHERE id='${peerMid}'`),"good");
});
test("zero-value overdue assessments do not suspend a fully current member",()=>{
  sql(`INSERT INTO contribution_obligations(id,group_id,membership_id,contribution_type_id,amount,currency,due_date)
    VALUES('${id(36)}','${group}','${peerMid}','${type2}',0,'USD',CURRENT_DATE-20)`);
  assert.equal(sql(`SELECT standing FROM memberships WHERE id='${peerMid}'`),"good");
});
test("mandatory standing audit failure rolls the financial action back",()=>{
  sql(`INSERT INTO contribution_obligations(id,group_id,membership_id,contribution_type_id,amount,currency,due_date)
    VALUES('${id(37)}','${group}','${peerMid}','${type2}',20,'USD',CURRENT_DATE-2);
    CREATE FUNCTION p1_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'AUDIT_FAILURE'; END $$;
    CREATE TRIGGER p1_audit_fail BEFORE INSERT ON group_audit_logs FOR EACH ROW EXECUTE FUNCTION p1_audit_fail();`);
  const n=count("payments");
  assert.throws(()=>command(222,"record",val(20,{membership_id:peerMid,contribution_type_id:type2})),/AUDIT_FAILURE/);
  assert.equal(count("payments"),n); assert.equal(sql(`SELECT standing FROM memberships WHERE id='${peerMid}'`),"suspended");
  sql("DROP TRIGGER p1_audit_fail ON group_audit_logs; DROP FUNCTION p1_audit_fail();");
});
test("invalid receipt metadata cannot leave a new payment or command",()=>{
  const n=count("payments"),keys=count("financial_private.payment_commands");
  assert.throws(()=>command(223,"record",val(1,{receipt_url:"missing-evidence.pdf"})),/RECEIPT_ATTACHMENT_NOT_AUTHORIZED/);
  assert.equal(count("payments"),n); assert.equal(count("financial_private.payment_commands"),keys);
});
test("blank correction reason is rejected without losing the original record",()=>{
  assert.throws(()=>command(224,"void",{},second.payment.id,2,""),/PAYMENT_CORRECTION_REASON_REQUIRED/);
  assert.equal(sql(`SELECT amount FROM payments WHERE id='${second.payment.id}'`),"20.00");
});
test("relief confirmation and void keep relief separate from dues and update standing atomically",()=>{
  const plan=id(301);
  sql(`INSERT INTO relief_plans(id,group_id,contribution_frequency,contribution_amount) VALUES('${plan}','${group}','monthly',10);
    INSERT INTO relief_enrollments(membership_id,plan_id,contribution_status) VALUES('${mid}','${plan}','behind')`);
  const paid=command(225,"record",val(10,{contribution_type_id:null,relief_plan_id:plan}));
  assert.equal(sql(`SELECT contribution_status FROM relief_enrollments WHERE plan_id='${plan}'`),"up_to_date");
  assert.equal(sql(`SELECT count(*) FROM payment_obligation_applications WHERE payment_id='${paid.payment.id}'`),"0");
  reconcile(263,0,"good");
  command(226,"void",{},paid.payment.id,1,"Wrong relief amount");
  assert.equal(sql(`SELECT contribution_status FROM relief_enrollments WHERE plan_id='${plan}'`),"behind");
  reconcile(263,0,"warning");
  assert.throws(()=>command(227,"record",val(10,{membership_id:otherMid,contribution_type_id:null,relief_plan_id:plan,currency:"XAF"}),null,null,null,outsider,group2),/PAYMENT_ATTRIBUTION_INVALID/);
});
test("quarterly relief keeps earlier-quarter funds and preserves administrative suspension",()=>{
  const plan=id(301);
  sql(`UPDATE relief_plans SET contribution_frequency='quarterly' WHERE id='${plan}'`);
  const paid=command(228,"record",val(10,{contribution_type_id:null,relief_plan_id:plan}));
  sql(`ALTER TABLE payments DISABLE TRIGGER financial_payment_guard;
    UPDATE payments SET created_at=date_trunc('quarter',CURRENT_DATE) WHERE id='${paid.payment.id}';
    ALTER TABLE payments ENABLE TRIGGER financial_payment_guard;`);
  assert.equal(sql(`SELECT contribution_status FROM relief_enrollments WHERE plan_id='${plan}'`),"up_to_date");
  sql(`UPDATE relief_enrollments SET contribution_status='suspended' WHERE plan_id='${plan}'`);
  command(229,"void",{},paid.payment.id,1,"Duplicate relief payment");
  assert.equal(sql(`SELECT contribution_status FROM relief_enrollments WHERE plan_id='${plan}'`),"suspended");
});
test("shared-bucket fine-dispute evidence remains owner/officer-readable and cannot be replaced",()=>{
  const name=`dispute-docs/${group}/${mid}/synthetic.pdf`;
  sql(`INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES('receipts','${name}','${member}')`,member);
  sql(`INSERT INTO disputes(group_id,filed_by,supporting_docs) VALUES('${group}','${mid}',
    jsonb_build_array('https://fixture.invalid/storage/v1/object/sign/receipts/${name}?token=synthetic'))`);
  for(const actor of [member,officer]) assert.equal(sql(`SELECT count(*) FROM storage.objects WHERE name='${name}'`,actor),"1");
  for(const actor of [peer,outsider]) assert.equal(sql(`SELECT count(*) FROM storage.objects WHERE name='${name}'`,actor),"0");
  assert.equal(sql(`WITH gone AS(DELETE FROM storage.objects WHERE name='${name}' RETURNING 1) SELECT count(*) FROM gone`,member),"0");
});
test("URL-encoded legacy receipt keys resolve to the same private object",()=>{
  const name="legacy fixture.pdf";
  sql(`INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES('receipts','${name}','${officer}');
    ALTER TABLE payments DISABLE TRIGGER financial_payment_guard;
    UPDATE payments SET receipt_url='https://fixture.invalid/storage/v1/object/sign/receipts/legacy%20fixture.pdf?token=synthetic' WHERE id='${first.payment.id}';
    ALTER TABLE payments ENABLE TRIGGER financial_payment_guard;`);
  for(const actor of [member,officer]) assert.equal(sql(`SELECT count(*) FROM storage.objects WHERE name='${name}'`,actor),"1");
  for(const actor of [peer,outsider]) assert.equal(sql(`SELECT count(*) FROM storage.objects WHERE name='${name}'`,actor),"0");
  assert.equal(sql("SELECT financial_private.receipt_path('https://fixture.invalid/storage/v1/object/sign/receipts/legacy%20fixture.pdf?token=synthetic')"),name);
});
test("existing financial SELECT policy plus active-reader overlay isolates members and groups",()=>{
  assert.ok(Number(sql("SELECT count(*) FROM payments",member))>0);
  assert.equal(sql(`SELECT count(*) FROM payments WHERE membership_id='${mid}'`,peer),"0");
  assert.equal(sql(`SELECT count(*) FROM payments WHERE group_id='${group}'`,outsider),"0");
  assert.equal(sql(`SELECT count(*) FROM contribution_obligations WHERE membership_id='${peerMid}'`,member),"0");
  assert.ok(Number(sql("SELECT count(*) FROM payments",officer))>Number(sql("SELECT count(*) FROM payments",member)));
});
test("unattached evidence cannot be removed or overwritten during financial attachment",()=>{
  const name=`${group}/synthetic-orphan.pdf`;
  sql(`INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES('receipts','${name}','${member}')`,member);
  assert.equal(sql(`WITH gone AS(DELETE FROM storage.objects WHERE name='${name}' RETURNING 1) SELECT count(*) FROM gone`,member),"0");
  assert.equal(sql(`WITH changed AS(UPDATE storage.objects SET owner_id='${officer}' WHERE name='${name}' RETURNING 1) SELECT count(*) FROM changed`,member),"0");
});
test("exited member and exited officer cannot access or issue commands",()=>{
  sql(`UPDATE memberships SET membership_status='exited' WHERE user_id IN ('${member}','${officer}')`);
  for(const actor of [member,officer]) assert.equal(sql("SELECT count(*) FROM storage.objects",actor),"0");
  for(const actor of [member,officer]) {
    assert.equal(sql("SELECT count(*) FROM payments",actor),"0");
    assert.equal(sql("SELECT count(*) FROM contribution_obligations",actor),"0");
  }
  assert.throws(()=>command(217,"record",val(1)),/PAYMENT_NOT_AUTHORIZED/);
});
test("private command records and helpers are not executable/readable by API roles",()=>{
  assert.throws(()=>sql("SELECT * FROM financial_private.payment_commands",member),/permission denied/);
  assert.throws(()=>sql(`SELECT financial_private.reconcile_member('${group}','${mid}')`,member),/permission denied/);
  assert.throws(()=>sql(`SELECT financial_private.transition_ledger_epoch('${group}','EUR',now(),'forged','${member}')`,member),/permission denied/);
});

test("removing an assessment without payment history also reconciles standing",()=>{
  const fresh=id(41),assessment=id(42);
  sql(`INSERT INTO memberships(id,group_id,is_proxy) VALUES('${fresh}','${group}',false);
    INSERT INTO contribution_obligations(id,group_id,membership_id,contribution_type_id,amount,currency,due_date)
      VALUES('${assessment}','${group}','${fresh}','${type2}',100,'USD',CURRENT_DATE-5)`);
  assert.equal(sql(`SELECT standing FROM memberships WHERE id='${fresh}'`),"suspended");
  sql(`DELETE FROM contribution_obligations WHERE id='${assessment}'`);
  assert.equal(sql(`SELECT standing FROM memberships WHERE id='${fresh}'`),"good");
});

test("finance-position officer can settle their own debt without weakening self-edit freezes",()=>{
  const position=id(501);
  sql(`INSERT INTO position_assignments(membership_id,position_id) VALUES('${peerMid}','${position}');
    INSERT INTO position_permissions(position_id,permission) VALUES('${position}','finances.manage')`);
  command(230,"record",val(20,{membership_id:peerMid,contribution_type_id:type2}),null,null,null,peer);
  assert.equal(sql(`SELECT standing FROM memberships WHERE id='${peerMid}'`),"good");
  for(const edit of ["standing='banned'","role='owner'","membership_status='archived'"]) {
    assert.throws(()=>sql(`UPDATE memberships SET ${edit} WHERE id='${peerMid}'`,peer),/requires_admin/);
  }
  assert.throws(()=>sql(`SET villageclaq.payment_command='${id(230)}'; UPDATE memberships SET standing='banned' WHERE id='${peerMid}'`,peer),/standing_change_requires_admin/);
});

test("dated currency transition preserves XAF history and isolates later USD payments and credit",()=>{
  const historical=command(240,"record",{
    membership_id:otherMid,contribution_type_id:otherType,amount:40,currency:"XAF",payment_method:"cash"
  },null,null,null,outsider,group2);
  const oldEpoch=historical.payment.ledger_epoch_id;
  assert.throws(()=>sql(`SELECT financial_private.transition_ledger_epoch(
    '${group2}','USD',clock_timestamp()+interval '1 day','Premature transition','${outsider}')`),/INVALID_LEDGER_TRANSITION/);
  const transitionAt=sql("SELECT clock_timestamp()");
  const newEpoch=sql(`SELECT financial_private.transition_ledger_epoch(
    '${group2}','USD','${transitionAt}','Approved synthetic ledger transition','${outsider}')`);
  assert.notEqual(newEpoch,oldEpoch);
  assert.equal(sql(`SELECT currency||':'||(effective_to IS NOT NULL)::text
    FROM financial_ledger_epochs WHERE id='${oldEpoch}'`),"XAF:true");
  assert.equal(sql(`SELECT currency FROM financial_ledger_epochs WHERE id='${newEpoch}' AND effective_to IS NULL`),"USD");
  assert.equal(sql(`SELECT currency FROM payments WHERE id='${historical.payment.id}'`),"XAF");

  const usdType=id(701);
  sql(`INSERT INTO contribution_types(id,group_id,name,amount,currency)
    VALUES('${usdType}','${group2}','Post-transition dues',40,'USD')`,outsider);
  const current=command(241,"record",{
    membership_id:otherMid,contribution_type_id:usdType,amount:40,currency:"USD",payment_method:"cash"
  },null,null,null,outsider,group2);
  const credit=command(242,"record",{
    membership_id:otherMid,contribution_type_id:null,amount:10,currency:"USD",payment_method:"cash"
  },null,null,null,outsider,group2);
  assert.equal(current.payment.ledger_epoch_id,newEpoch);
  assert.equal(credit.payment.ledger_epoch_id,newEpoch);
  assert.deepEqual(credit.appliedTo,[]);
  assert.equal(sql(`SELECT amount_paid FROM contribution_obligations WHERE id='${id(34)}'`),"40.00");
  assert.equal(sql(`SELECT count(*) FROM payment_obligation_applications a
    JOIN contribution_obligations o ON o.id=a.obligation_id
    WHERE a.payment_id IN ('${current.payment.id}','${credit.payment.id}') AND o.ledger_epoch_id='${oldEpoch}'`),"0");
  assert.equal(sql(`SELECT count(*) FROM financial_private.current_ledger_epoch_conflicts WHERE group_id='${group2}'`),"0");
  assert.throws(()=>command(243,"record",{
    membership_id:otherMid,contribution_type_id:null,amount:1,currency:"XAF",payment_method:"cash"
  },null,null,null,outsider,group2),/CURRENCY_MISMATCH/);
  assert.throws(()=>sql(`UPDATE financial_ledger_epochs SET effective_to=effective_to+interval '1 day'
    WHERE id='${oldEpoch}'`),/LEDGER_EPOCH_IMMUTABLE/);
});

const transferOrg=id(800), unrelatedOrg=id(801);
const transferUsdSource=id(810), transferUsdDest=id(811), transferEurDest=id(812);
const transferXafSource=id(813), transferNgnDest=id(814), transferShiftDest=id(815);
const transferHistoricalSource=id(816), transferUnrelatedDest=id(817);
const transferAdmin=id(820), transferAdmin2=id(821), transferOrdinary=id(822);
const transferPending=id(823), transferSuspended=id(824), transferArchived=id(825), transferExited=id(826);
const transferCrossGroupAdmin=id(827), transferStaff=id(828);
const transferSameMember=id(830), transferCrossMember=id(831), transferXafMember=id(832);
const transferEurMember=id(833), transferToctouMember=id(834), transferHistoricalMember=id(835);
const transferConcurrentMember=id(836), transferInactiveMember=id(837), transferStaffMember=id(838);
const transferSameMid=id(850), transferCrossMid=id(851), transferXafMid=id(852);
const transferEurMid=id(853), transferToctouMid=id(854), transferHistoricalMid=id(855);
const transferConcurrentMid=id(856), transferInactiveMid=id(857), transferStaffMid=id(858);
let crossTransferId, xafTransferId, eurTransferId;

test("member-transfer fixture has isolated organizations and authoritative active epochs",()=>{
  sql(`INSERT INTO organizations(id,name) VALUES
      ('${transferOrg}','Synthetic transfer organization'),
      ('${unrelatedOrg}','Unrelated synthetic organization');
    INSERT INTO groups(id,organization_id,currency) VALUES
      ('${transferUsdSource}','${transferOrg}','USD'),
      ('${transferUsdDest}','${transferOrg}','USD'),
      ('${transferEurDest}','${transferOrg}','EUR'),
      ('${transferXafSource}','${transferOrg}','XAF'),
      ('${transferNgnDest}','${transferOrg}','NGN'),
      ('${transferShiftDest}','${transferOrg}','USD'),
      ('${transferHistoricalSource}','${transferOrg}','XAF'),
      ('${transferUnrelatedDest}','${unrelatedOrg}','USD');
    INSERT INTO profiles(id) VALUES
      ('${transferAdmin}'),('${transferAdmin2}'),('${transferOrdinary}'),
      ('${transferPending}'),('${transferSuspended}'),('${transferArchived}'),('${transferExited}'),
      ('${transferCrossGroupAdmin}'),('${transferStaff}'),
      ('${transferSameMember}'),('${transferCrossMember}'),('${transferXafMember}'),
      ('${transferEurMember}'),('${transferToctouMember}'),('${transferHistoricalMember}'),
      ('${transferConcurrentMember}'),('${transferInactiveMember}'),('${transferStaffMember}');
    INSERT INTO platform_staff(user_id,is_active) VALUES('${transferStaff}',true);
    INSERT INTO memberships(id,group_id,user_id,role,membership_status) VALUES
      ('${id(840)}','${transferUsdSource}','${transferAdmin}','owner','active'),
      ('${id(841)}','${transferUsdSource}','${transferAdmin2}','admin','active'),
      ('${id(842)}','${transferEurDest}','${transferAdmin}','owner','active'),
      ('${id(843)}','${transferXafSource}','${transferAdmin}','owner','active'),
      ('${id(844)}','${transferNgnDest}','${transferAdmin}','owner','active'),
      ('${id(845)}','${transferHistoricalSource}','${transferAdmin}','owner','active'),
      ('${id(846)}','${transferUsdSource}','${transferOrdinary}','member','active'),
      ('${id(847)}','${transferUsdSource}','${transferPending}','owner','pending_approval'),
      ('${id(848)}','${transferUsdSource}','${transferSuspended}','owner','suspended'),
      ('${id(849)}','${transferUsdSource}','${transferArchived}','owner','archived'),
      ('${id(859)}','${transferUsdSource}','${transferExited}','owner','exited'),
      ('${id(860)}','${transferUnrelatedDest}','${transferCrossGroupAdmin}','owner','active'),
      ('${transferSameMid}','${transferUsdSource}','${transferSameMember}','member','active'),
      ('${transferCrossMid}','${transferUsdSource}','${transferCrossMember}','member','active'),
      ('${transferXafMid}','${transferXafSource}','${transferXafMember}','member','active'),
      ('${transferEurMid}','${transferEurDest}','${transferEurMember}','member','active'),
      ('${transferToctouMid}','${transferUsdSource}','${transferToctouMember}','member','active'),
      ('${transferHistoricalMid}','${transferHistoricalSource}','${transferHistoricalMember}','member','active'),
      ('${transferConcurrentMid}','${transferUsdSource}','${transferConcurrentMember}','member','active'),
      ('${transferInactiveMid}','${transferUsdSource}','${transferInactiveMember}','member','active'),
      ('${transferStaffMid}','${transferUsdSource}','${transferStaffMember}','member','active');
    INSERT INTO financial_ledger_epochs(group_id,currency,effective_from,source_kind,source_reference,approval_note)
    SELECT id,currency,clock_timestamp()-interval '30 days','cutover','transfer-f0-test','Synthetic transfer test epoch'
    FROM groups WHERE id IN (
      '${transferUsdSource}','${transferUsdDest}','${transferEurDest}','${transferXafSource}',
      '${transferNgnDest}','${transferShiftDest}','${transferHistoricalSource}','${transferUnrelatedDest}');`);
  assert.equal(sql(`SELECT count(*) FROM financial_ledger_epochs WHERE group_id IN (
    '${transferUsdSource}','${transferUsdDest}','${transferEurDest}','${transferXafSource}',
    '${transferNgnDest}','${transferShiftDest}','${transferHistoricalSource}','${transferUnrelatedDest}')
    AND effective_to IS NULL`),"8");
});

test("request RPC blocks incompatible standing carry-over for USD/EUR, XAF/USD and EUR/NGN",()=>{
  for(const [memberId,source,dest] of [
    [transferCrossMember,transferUsdSource,transferEurDest],
    [transferXafMember,transferXafSource,transferUsdDest],
    [transferEurMember,transferEurDest,transferNgnDest],
  ]) {
    assert.deepEqual(requestTransfer(memberId,source,dest,true,transferAdmin),{
      ok:false,error:"cross_currency_standing_not_allowed",
    });
  }
  const cross=requestTransfer(transferCrossMember,transferUsdSource,transferEurDest,false,transferAdmin);
  const xaf=requestTransfer(transferXafMember,transferXafSource,transferUsdDest,false,transferAdmin);
  const eur=requestTransfer(transferEurMember,transferEurDest,transferNgnDest,false,transferAdmin);
  assert.equal(cross.ok,true); assert.equal(xaf.ok,true); assert.equal(eur.ok,true);
  crossTransferId=cross.transfer_id; xafTransferId=xaf.transfer_id; eurTransferId=eur.transfer_id;
  assert.equal(sql(`SELECT bool_and(NOT carry_over_standing) FROM member_transfers
    WHERE id IN ('${crossTransferId}','${xafTransferId}','${eurTransferId}')`),"t");
});

test("cross-currency execution creates fresh destination standing and preserves source debt, credit and history",()=>{
  const typeA=id(870), typeB=id(871), obligationA=id(872), obligationB=id(873);
  sql(`INSERT INTO contribution_types(id,group_id,name,amount,currency) VALUES
      ('${typeA}','${transferUsdSource}','Synthetic dues A',100,'USD'),
      ('${typeB}','${transferUsdSource}','Synthetic dues B',50,'USD');
    INSERT INTO contribution_obligations(id,group_id,membership_id,contribution_type_id,amount,currency,due_date) VALUES
      ('${obligationA}','${transferUsdSource}','${transferCrossMid}','${typeA}',100,'USD',CURRENT_DATE-30),
      ('${obligationB}','${transferUsdSource}','${transferCrossMid}','${typeB}',50,'USD',CURRENT_DATE-20);`);
  const payment=command(874,"record",{
    membership_id:transferCrossMid,contribution_type_id:typeA,amount:120,currency:"USD",payment_method:"cash"
  },null,null,null,transferAdmin,transferUsdSource).payment;
  assert.equal(sql(`SELECT COALESCE(sum(amount_applied),0) FROM payment_obligation_applications
    WHERE payment_id='${payment.id}'`),"100.00");
  approveTransfer(crossTransferId);
  const result=executeTransfer(crossTransferId,transferAdmin);
  assert.equal(result.ok,true); assert.equal(result.dest_standing,"good");
  assert.equal(sql(`SELECT standing||':'||membership_status FROM memberships WHERE id='${transferCrossMid}'`),"suspended:exited");
  assert.equal(sql(`SELECT standing FROM memberships WHERE id='${result.new_membership_id}'`),"good");
  assert.equal(sql(`SELECT count(*) FROM contribution_obligations WHERE membership_id='${transferCrossMid}'
    AND group_id='${transferUsdSource}' AND currency='USD'`),"2");
  assert.equal(sql(`SELECT count(*) FROM payments WHERE id='${payment.id}' AND membership_id='${transferCrossMid}'
    AND group_id='${transferUsdSource}' AND currency='USD'`),"1");
  assert.equal(sql(`SELECT count(*) FROM contribution_obligations WHERE membership_id='${result.new_membership_id}'`),"0");
  assert.equal(sql(`SELECT count(*) FROM payments WHERE membership_id='${result.new_membership_id}'`),"0");
});

test("same-currency transfer preserves the authorized standing contract without moving money rows",()=>{
  sql(`UPDATE memberships SET standing='warning' WHERE id='${transferSameMid}'`);
  const requested=requestTransfer(transferSameMember,transferUsdSource,transferUsdDest,true,transferAdmin);
  assert.equal(requested.ok,true); approveTransfer(requested.transfer_id);
  const result=executeTransfer(requested.transfer_id,transferAdmin);
  assert.equal(result.ok,true); assert.equal(result.dest_standing,"warning");
  assert.equal(sql(`SELECT standing||':'||membership_status FROM memberships WHERE id='${transferSameMid}'`),"warning:exited");
  assert.equal(sql(`SELECT standing||':'||membership_status FROM memberships WHERE id='${result.new_membership_id}'`),"warning:active");
});

test("historical XAF epoch remains native when current USD standing moves to a USD destination",()=>{
  const historicalType=id(875), historicalObligation=id(876);
  sql(`INSERT INTO contribution_types(id,group_id,name,amount,currency)
      VALUES('${historicalType}','${transferHistoricalSource}','Historical XAF dues',50000,'XAF');
    INSERT INTO contribution_obligations(id,group_id,membership_id,contribution_type_id,amount,currency,due_date)
      VALUES('${historicalObligation}','${transferHistoricalSource}','${transferHistoricalMid}',
        '${historicalType}',50000,'XAF',CURRENT_DATE-60);`);
  const historicalPayment=command(877,"record",{
    membership_id:transferHistoricalMid,contribution_type_id:historicalType,
    amount:50000,currency:"XAF",payment_method:"cash"
  },null,null,null,transferAdmin,transferHistoricalSource).payment;
  const oldEpoch=historicalPayment.ledger_epoch_id;
  const transitionAt=sql("SELECT clock_timestamp()");
  sql(`SELECT financial_private.transition_ledger_epoch('${transferHistoricalSource}','USD',
    '${transitionAt}','Synthetic transfer epoch transition','${transferAdmin}')`);
  const requested=requestTransfer(transferHistoricalMember,transferHistoricalSource,transferUsdDest,true,transferAdmin);
  assert.equal(requested.ok,true); approveTransfer(requested.transfer_id);
  const result=executeTransfer(requested.transfer_id,transferAdmin);
  assert.equal(result.ok,true);
  assert.equal(sql(`SELECT currency||':'||(effective_to IS NOT NULL)::text FROM financial_ledger_epochs
    WHERE id='${oldEpoch}'`),"XAF:true");
  assert.equal(sql(`SELECT currency FROM payments WHERE id='${historicalPayment.id}'
    AND membership_id='${transferHistoricalMid}'`),"XAF");
  assert.equal(sql(`SELECT count(*) FROM payments WHERE membership_id='${result.new_membership_id}'`),"0");
});

test("execution revalidates destination epoch after request and fails closed on USD to EUR TOCTOU",()=>{
  const requested=requestTransfer(transferToctouMember,transferUsdSource,transferShiftDest,true,transferAdmin);
  assert.equal(requested.ok,true); approveTransfer(requested.transfer_id);
  const transitionAt=sql("SELECT clock_timestamp()");
  sql(`SELECT financial_private.transition_ledger_epoch('${transferShiftDest}','EUR',
    '${transitionAt}','Synthetic TOCTOU transition','${transferAdmin}')`);
  assert.deepEqual(executeTransfer(requested.transfer_id,transferAdmin),{
    ok:false,error:"cross_currency_standing_not_allowed",
  });
  assert.equal(sql(`SELECT membership_status FROM memberships WHERE id='${transferToctouMid}'`),"active");
  assert.equal(sql(`SELECT status FROM member_transfers WHERE id='${requested.transfer_id}'`),"approved");
});

test("inactive officers, ordinary members and cross-group admins cannot request or execute",()=>{
  const approved=requestTransfer(transferInactiveMember,transferUsdSource,transferUsdDest,false,transferAdmin);
  assert.equal(approved.ok,true); approveTransfer(approved.transfer_id);
  for(const actor of [transferOrdinary,transferPending,transferSuspended,transferArchived,transferExited,transferCrossGroupAdmin]) {
    assert.equal(requestTransfer(transferInactiveMember,transferUsdSource,transferEurDest,false,actor).error,"not_authorized");
    assert.deepEqual(executeTransfer(approved.transfer_id,actor),{ok:false,error:"not_authorized"});
  }
  sql(`UPDATE memberships SET membership_status='exited' WHERE id='${transferInactiveMid}'`);
  assert.deepEqual(executeTransfer(approved.transfer_id,transferAdmin),{ok:false,error:"source_membership_missing"});
});

test("unrelated organizations are rejected at request and execution boundaries",()=>{
  assert.deepEqual(requestTransfer(transferStaffMember,transferUsdSource,transferUnrelatedDest,false,transferAdmin),{
    ok:false,error:"groups_not_related",
  });
  const transferId=id(878);
  sql(`INSERT INTO member_transfers(id,member_id,source_group_id,dest_group_id,status,requested_by,carry_over_standing)
    VALUES('${transferId}','${transferStaffMember}','${transferUsdSource}','${transferUnrelatedDest}',
      'approved','${transferAdmin}',false)`);
  assert.deepEqual(executeTransfer(transferId,transferAdmin),{ok:false,error:"groups_not_related"});
});

test("two concurrent admins produce exactly one destination membership and one completion",async()=>{
  const requested=requestTransfer(transferConcurrentMember,transferUsdSource,transferUsdDest,false,transferAdmin);
  assert.equal(requested.ok,true); approveTransfer(requested.transfer_id);
  const invoke=actor=>asyncSql(`SET ROLE authenticated; SET request.jwt.claim.sub='${actor}';
    SELECT public.execute_member_transfer('${requested.transfer_id}');`);
  const results=(await Promise.all([invoke(transferAdmin),invoke(transferAdmin2)])).map(JSON.parse);
  assert.equal(results.filter(result=>result.ok).length,1);
  assert.equal(results.filter(result=>result.error==="transfer_not_approved").length,1);
  assert.equal(sql(`SELECT count(*) FROM memberships WHERE group_id='${transferUsdDest}'
    AND user_id='${transferConcurrentMember}' AND membership_status='active'`),"1");
  assert.equal(sql(`SELECT count(*) FROM member_transfers WHERE id='${requested.transfer_id}'
    AND status='completed' AND completed_at IS NOT NULL`),"1");
});

test("cancelled, rejected, completed and stale-source transfers cannot execute twice or out of state",()=>{
  const completed=sql(`SELECT id FROM member_transfers WHERE member_id='${transferSameMember}' AND status='completed'`);
  assert.deepEqual(executeTransfer(completed,transferAdmin),{ok:false,error:"transfer_not_approved"});
  for(const [offset,status] of [[879,"cancelled"],[880,"rejected"]]) {
    const transferId=id(offset);
    sql(`INSERT INTO member_transfers(id,member_id,source_group_id,dest_group_id,status,requested_by,carry_over_standing)
      VALUES('${transferId}','${transferStaffMember}','${transferUsdSource}','${transferUsdDest}',
        '${status}','${transferAdmin}',false)`);
    assert.deepEqual(executeTransfer(transferId,transferAdmin),{ok:false,error:"transfer_not_approved"});
  }
});

test("active platform staff remains authorized without weakening RPC grants",()=>{
  const requested=requestTransfer(transferStaffMember,transferUsdSource,transferUsdDest,false,transferStaffMember);
  assert.equal(requested.ok,true); approveTransfer(requested.transfer_id);
  assert.equal(executeTransfer(requested.transfer_id,transferStaff).ok,true);
  assert.equal(sql(`SELECT has_function_privilege('anon','public.request_member_transfer(uuid,uuid,uuid,text,boolean)','EXECUTE')`),"f");
  assert.equal(sql(`SELECT has_function_privilege('anon','public.execute_member_transfer(uuid)','EXECUTE')`),"f");
  assert.equal(sql(`SELECT has_function_privilege('authenticated','public.request_member_transfer(uuid,uuid,uuid,text,boolean)','EXECUTE')`),"t");
  assert.equal(sql(`SELECT has_function_privilege('authenticated','public.execute_member_transfer(uuid)','EXECUTE')`),"t");
  assert.equal(sql(`SELECT bool_and(p.prosecdef AND p.proconfig @> ARRAY['search_path=""'])
    FROM pg_proc p WHERE p.oid IN (
      'public.request_member_transfer(uuid,uuid,uuid,text,boolean)'::regprocedure,
      'public.execute_member_transfer(uuid)'::regprocedure)`),"t");
});

const parityGroup=id(700000), parityGroup2=id(700001);
const parityEpoch=id(700010), parityOldEpoch=id(700011), parityEpoch2=id(700012);
const parityType=id(700020), parityType2=id(700021), parityExcludedType=id(700022);
const parityOldType=id(700023), parityOtherType=id(700024), parityRelief=id(700030);
const parityMid=n=>id(700100+n), parityUser=n=>id(710000+n), parityObl=n=>id(730000+n);
const parityRules=excluded=>({
  enabled:true,
  overdue_grace_days:0,
  excluded_contribution_type_ids:excluded,
  factors:{dues:true,meetingAttendance:false,eventAttendance:false,relief:false,
    hosting:false,fines:false,loans:false,disputes:false,customActivity:false},
});
function parityCommand(key,gid,actorId,action,values={},paymentId=null,version=null,reason=null) {
  return JSON.parse(sql(query(key,action,values,paymentId,version,reason,gid),actorId));
}
function parityObligation(n,mid,typeId=parityType,epochId=parityEpoch,currency="USD",amount=100,gid=parityGroup) {
  sql(`INSERT INTO contribution_obligations(id,group_id,membership_id,contribution_type_id,
    ledger_epoch_id,amount,currency,due_date) VALUES('${parityObl(n)}','${gid}','${mid}',
    '${typeId}','${epochId}',${amount},'${currency}',CURRENT_DATE-30)`);
  return parityObl(n);
}
function parityRecord(key,mid,amount=100,typeId=parityType,extras={},gid=parityGroup,actorId=officer) {
  const values={membership_id:mid,amount,currency:extras.currency||"USD",payment_method:"cash",
    ...(typeId?{contribution_type_id:typeId}:{}),...extras};
  return parityCommand(key,gid,actorId,"record",values);
}
function tsParityStanding(mid,excluded=[]) {
  const member=JSON.parse(sql(`SELECT to_jsonb(m) FROM memberships m WHERE id='${mid}'`));
  if(member.is_proxy || !["active","pending_approval"].includes(member.membership_status)) return member.standing;
  const obligations=JSON.parse(sql(`SELECT COALESCE(jsonb_agg(o ORDER BY o.id),'[]')
    FROM contribution_obligations o WHERE o.group_id='${member.group_id}' AND o.membership_id='${mid}'`));
  const payments=JSON.parse(sql(`SELECT COALESCE(jsonb_agg(p ORDER BY p.id),'[]')
    FROM payments p WHERE p.group_id='${member.group_id}' AND p.membership_id='${mid}'
      AND p.relief_plan_id IS NULL`));
  const states=computeObligationStates(obligations,payments,{today:sql("SELECT CURRENT_DATE")});
  const excludedSet=new Set(excluded);
  const duesFail=obligations.some(o=>!excludedSet.has(o.contribution_type_id)
    && states.get(o.id)?.isOverdue);
  return duesFail?"suspended":"good";
}
function sqlParityStanding(mid,excluded=[]) {
  return sql(`SELECT public.compute_member_standing('${mid}',${literal(parityRules(excluded))})`);
}

test("18-case TypeScript to SQL golden standing matrix uses confirmed-basis attribution",()=>{
  sql(`INSERT INTO groups(id,currency,settings) VALUES
      ('${parityGroup}','USD','{}'),('${parityGroup2}','USD','{}');
    INSERT INTO profiles(id)
      SELECT ('00000000-0000-4000-8000-'||lpad((710000+n)::text,12,'0'))::uuid
      FROM generate_series(1,21) n;
    INSERT INTO memberships(id,group_id,user_id,role) VALUES
      ('${id(700090)}','${parityGroup}','${officer}','owner'),
      ('${id(700091)}','${parityGroup2}','${outsider}','owner');
    INSERT INTO memberships(id,group_id,user_id,role)
      SELECT ('00000000-0000-4000-8000-'||lpad((700100+n)::text,12,'0'))::uuid,
        '${parityGroup}',('00000000-0000-4000-8000-'||lpad((710000+n)::text,12,'0'))::uuid,'member'
      FROM generate_series(1,18) n WHERE n <> 16;
    INSERT INTO memberships(id,group_id,user_id,role)
      VALUES('${parityMid(16)}','${parityGroup2}','${parityUser(15)}','member');
    INSERT INTO memberships(id,group_id,user_id,role,standing,is_proxy)
      VALUES('${parityMid(19)}','${parityGroup}',NULL,'member','warning',true);
    INSERT INTO memberships(id,group_id,user_id,role,standing,membership_status)
      VALUES('${parityMid(20)}','${parityGroup}','${parityUser(20)}','member','banned','exited');
    INSERT INTO memberships(id,group_id,user_id,role)
      VALUES('${parityMid(21)}','${parityGroup}','${parityUser(21)}','member');
    INSERT INTO financial_ledger_epochs(id,group_id,currency,effective_from,effective_to,source_kind,approval_note)
      VALUES('${parityOldEpoch}','${parityGroup}','XAF','2025-01-01','2026-01-01','cutover','Synthetic old epoch'),
        ('${parityEpoch}','${parityGroup}','USD','2026-01-01',NULL,'cutover','Synthetic active epoch'),
        ('${parityEpoch2}','${parityGroup2}','USD','2026-01-01',NULL,'cutover','Synthetic active epoch');
    INSERT INTO contribution_types(id,group_id,name,amount,currency,ledger_epoch_id) VALUES
      ('${parityType}','${parityGroup}','Parity dues A',100,'USD','${parityEpoch}'),
      ('${parityType2}','${parityGroup}','Parity dues B',100,'USD','${parityEpoch}'),
      ('${parityExcludedType}','${parityGroup}','Excluded parity dues',100,'USD','${parityEpoch}'),
      ('${parityOldType}','${parityGroup}','Historical parity dues',1000,'XAF','${parityOldEpoch}'),
      ('${parityOtherType}','${parityGroup2}','Other group dues',100,'USD','${parityEpoch2}');
    INSERT INTO relief_plans(id,group_id,is_active,contribution_frequency,contribution_amount)
      VALUES('${parityRelief}','${parityGroup}',true,'monthly',100)`);

  parityObligation(1,parityMid(1));
  parityObligation(2,parityMid(2)); parityRecord(720002,parityMid(2));
  parityObligation(3,parityMid(3));
  parityCommand(720003,parityGroup,officer,"submit",{membership_id:parityMid(3),contribution_type_id:parityType,
    amount:100,currency:"USD",payment_method:"cash"});
  parityObligation(4,parityMid(4));
  const rejected=parityCommand(720004,parityGroup,officer,"submit",{membership_id:parityMid(4),
    contribution_type_id:parityType,amount:100,currency:"USD",payment_method:"cash"});
  parityCommand(720005,parityGroup,officer,"reject",{},rejected.payment.id,rejected.payment.financial_version,"Synthetic rejection");
  parityObligation(5,parityMid(5));
  parityObligation(6,parityMid(6)); parityRecord(720006,parityMid(6),40);
  parityObligation(7,parityMid(7)); parityRecord(720007,parityMid(7));
  const waived=parityObligation(8,parityMid(8)); sql(`UPDATE contribution_obligations SET status='waived' WHERE id='${waived}'`);
  parityObligation(9,parityMid(9),parityExcludedType);
  parityObligation(10,parityMid(10)); parityRecord(720010,parityMid(10),40);
  parityObligation(11,parityMid(11)); parityObligation(111,parityMid(11),parityType2);
  parityRecord(720011,parityMid(11),150);
  parityObligation(12,parityMid(12)); parityObligation(112,parityMid(12),parityType2);
  parityRecord(720012,parityMid(12),150); parityRecord(720013,parityMid(12),100,null);
  parityObligation(13,parityMid(13)); parityRecord(720014,parityMid(14));
  parityObligation(15,parityMid(15));
  parityRecord(720015,parityMid(16),100,parityOtherType,{},parityGroup2,outsider);
  parityObligation(17,parityMid(17),parityOldType,parityOldEpoch,"XAF",1000);
  parityRecord(720017,parityMid(17),100,parityType);
  parityObligation(18,parityMid(18));
  parityRecord(720018,parityMid(18),100,null,{relief_plan_id:parityRelief});

  // Simulate the pre-F0 cached-column pollution that the standing function must
  // ignore.  The isolated superuser disables user triggers only for this test.
  sql(`ALTER TABLE contribution_obligations DISABLE TRIGGER USER;
    UPDATE contribution_obligations SET amount_paid=100,status='paid' WHERE id='${parityObl(5)}';
    UPDATE contribution_obligations SET amount_paid=100,status='paid' WHERE id='${parityObl(6)}';
    UPDATE contribution_obligations SET amount_paid=0,status='pending' WHERE id='${parityObl(7)}';
    ALTER TABLE contribution_obligations ENABLE TRIGGER USER;`);

  const matrix=[
    ["A overdue/no payment",parityMid(1),[],"suspended"],
    ["B confirmed full",parityMid(2),[],"good"],
    ["C pending",parityMid(3),[],"suspended"],
    ["D rejected",parityMid(4),[],"suspended"],
    ["E polluted paid cache",parityMid(5),[],"suspended"],
    ["F polluted paid cache with confirmed debt",parityMid(6),[],"suspended"],
    ["G stale-low cache with confirmed full",parityMid(7),[],"good"],
    ["H waived",parityMid(8),[],"good"],
    ["I excluded type",parityMid(9),[parityExcludedType],"good"],
    ["J confirmed partial",parityMid(10),[],"suspended"],
    ["K1 typed overpayment cannot hide other type",parityMid(11),[],"suspended"],
    ["K2 general credit follows typed allocation",parityMid(12),[],"good"],
    ["L no cross-member credit",parityMid(13),[],"suspended"],
    ["M no cross-group credit",parityMid(15),[],"suspended"],
    ["N no cross-currency/epoch credit",parityMid(17),[],"suspended"],
    ["O relief does not satisfy dues",parityMid(18),[],"suspended"],
    ["P1 proxy guard",parityMid(19),[],"warning"],
    ["P2 inactive guard",parityMid(20),[],"banned"],
  ];
  for(const [label,mid,excluded,expected] of matrix) {
    assert.equal(tsParityStanding(mid,excluded),expected,`${label}: TypeScript`);
    assert.equal(sqlParityStanding(mid,excluded),expected,`${label}: SQL`);
  }
  assert.equal(matrix.length,18);
});

test("standing triggers converge confirmed, rejected, corrected, voided and waived state once",()=>{
  const mid=parityMid(21), oid=parityObligation(21,mid);
  const baseline=Number(sql(`SELECT count(*) FROM group_audit_logs
    WHERE entity_id='${mid}' AND action='member.standing_recalculated'`));
  assert.equal(sql(`SELECT standing FROM memberships WHERE id='${mid}'`),"suspended");

  const pending=parityCommand(721001,parityGroup,officer,"submit",{membership_id:mid,
    contribution_type_id:parityType,amount:100,currency:"USD",payment_method:"cash"});
  parityCommand(721002,parityGroup,officer,"reject",{},pending.payment.id,pending.payment.financial_version,"Synthetic rejection");
  assert.equal(sql(`SELECT standing FROM memberships WHERE id='${mid}'`),"suspended");

  let current=parityRecord(721003,mid).payment;
  assert.equal(sql(`SELECT standing FROM memberships WHERE id='${mid}'`),"good");
  current=parityCommand(721004,parityGroup,officer,"correct",{amount:40},current.id,current.financial_version,"Synthetic correction").payment;
  assert.equal(sql(`SELECT standing FROM memberships WHERE id='${mid}'`),"suspended");
  current=parityCommand(721005,parityGroup,officer,"correct",{amount:100},current.id,current.financial_version,"Synthetic restoration").payment;
  assert.equal(sql(`SELECT standing FROM memberships WHERE id='${mid}'`),"good");
  parityCommand(721006,parityGroup,officer,"void",{},current.id,current.financial_version,"Synthetic void");
  assert.equal(sql(`SELECT standing FROM memberships WHERE id='${mid}'`),"suspended");
  sql(`UPDATE contribution_obligations SET status='waived' WHERE id='${oid}'`);
  assert.equal(sql(`SELECT standing FROM memberships WHERE id='${mid}'`),"good");

  assert.equal(Number(sql(`SELECT count(*) FROM group_audit_logs
    WHERE entity_id='${mid}' AND action='member.standing_recalculated'`))-baseline,5);
  assert.equal(Number(sql(`SELECT count(*) FROM group_audit_logs
    WHERE entity_id='${mid}' AND action='member.standing_recalculated'
      AND details->>'source'='financial_transaction'`))-baseline,5);
  assert.doesNotMatch(read(standingMigration),/notifications|notification_queue|standing_change_producer/);
});

test("standing RPC surface rejects anonymous, cross-group and inactive callers",()=>{
  assert.equal(sql(`SELECT has_function_privilege('anon',
    'public.compute_member_standing(uuid,jsonb)','EXECUTE')`),"f");
  assert.equal(sql(`SELECT has_function_privilege('anon',
    'public.recalculate_membership_standing(uuid)','EXECUTE')`),"f");
  assert.throws(()=>sql(`SELECT public.compute_member_standing('${parityMid(1)}')`,outsider),/permission denied/);
  assert.throws(()=>sql(`SELECT public.compute_member_standing('${parityMid(19)}')`,outsider),/permission denied/);
  assert.throws(()=>sql(`SELECT public.compute_member_standing('${parityMid(20)}')`,outsider),/permission denied/);
  assert.throws(()=>sql(`SELECT public.recalculate_membership_standing('${parityMid(1)}')`,outsider),/permission denied/);
  assert.throws(()=>sql(`SELECT public.compute_member_standing('${parityMid(1)}')`,parityUser(20)),/permission denied/);
  assert.equal(sql(`SELECT public.compute_member_standing('${parityMid(1)}')`,parityUser(13)),"suspended");
  assert.equal(sql(`SELECT p.prosecdef AND p.provolatile='s' AND p.proconfig @> ARRAY['search_path=""']
    FROM pg_proc p WHERE p.oid='public.compute_member_standing(uuid,jsonb)'::regprocedure`),"t");
});
