import assert from "node:assert/strict";
import test, { before } from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { computeMoneyFigures, computeObligationStates, allocatePaymentApplications } from "../src/lib/money.ts";

const container = "villageclaq-p1-isolated";
const migration = "supabase/migrations/20260906140229_financial_payment_integrity.sql";
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
function sql(query, actor) {
  const auth = actor ? `SET ROLE authenticated; SET request.jwt.claim.sub='${actor}';` : "";
  return execFileSync("docker", ["exec","-i",container,"psql","-X","-U","postgres","-v","ON_ERROR_STOP=1","-Atq"],
    { input: auth + query, encoding:"utf8", stdio:["pipe","pipe","pipe"] }).trim();
}
function asyncSql(query) {
  return new Promise((resolve,reject) => {
    const child = spawn("docker",["exec","-i",container,"psql","-X","-U","postgres","-v","ON_ERROR_STOP=1","-Atq"]);
    let out="",err=""; child.stdout.on("data",d=>out+=d); child.stderr.on("data",d=>err+=d);
    child.on("error",reject); child.on("exit",code=>code===0?resolve(out.trim()):reject(new Error(err)));
    child.stdin.end(query);
  });
}
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const group=id(1), group2=id(2), officer=id(101), member=id(102), peer=id(103), outsider=id(104);
const mid=id(11), peerMid=id(12), otherMid=id(13), type=id(21), type2=id(22), otherType=id(23), oid=id(31), oid2=id(32);
const val = (amount, extras={}) => ({membership_id:mid,contribution_type_id:type,amount,currency:"USD",payment_method:"cash",...extras});
const literal = value => "'" + JSON.stringify(value).replaceAll("'","''") + "'::jsonb";
function query(key,action,values={},payment=null,version=null,reason=null,gid=group) {
  return `SELECT public.apply_payment_command('${gid}','${id(key)}','${action}',${literal(values)},${payment?"'"+payment+"'":"NULL"},${version??"NULL"},${reason?"'"+reason.replaceAll("'","''")+"'":"NULL"});`;
}
function command(key,action,values={},payment=null,version=null,reason=null,actor=officer,gid=group) {
  return JSON.parse(sql(query(key,action,values,payment,version,reason,gid),actor));
}
function count(table) {return Number(sql(`SELECT count(*) FROM ${table}`));}
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
  sql(`INSERT INTO profiles VALUES('${officer}'),('${member}'),('${peer}'),('${outsider}');
    INSERT INTO groups VALUES('${group}','USD','{}'),('${group2}','XAF','{}');
    INSERT INTO memberships(id,group_id,user_id,role) VALUES('${id(10)}','${group}','${officer}','owner'),
    ('${mid}','${group}','${member}','member'),('${peerMid}','${group}','${peer}','member'),('${otherMid}','${group2}','${outsider}','owner');
    INSERT INTO contribution_types(id,group_id,name,amount,currency) VALUES('${type}','${group}','Dues',100,'USD'),('${type2}','${group}','Purpose',100,'USD'),('${otherType}','${group2}','Dues',100,'XAF');
    INSERT INTO contribution_obligations(id,group_id,membership_id,contribution_type_id,amount,currency,due_date) VALUES
    ('${oid}','${group}','${mid}','${type}',100,'USD',CURRENT_DATE-10),
    ('${id(33)}','${group}','${peerMid}','${type}',100,'USD',CURRENT_DATE-10),
    ('${id(34)}','${group2}','${otherMid}','${otherType}',100,'XAF',CURRENT_DATE-10);
    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;`);
  sql(`ALTER TABLE payments ENABLE ROW LEVEL SECURITY; ALTER TABLE contribution_obligations ENABLE ROW LEVEL SECURITY;
    CREATE POLICY baseline_payment_read ON payments FOR SELECT TO authenticated USING(can_view_member_financial(membership_id,group_id));
    CREATE POLICY baseline_obligation_read ON contribution_obligations FOR SELECT TO authenticated USING(can_view_member_financial(membership_id,group_id));
    CREATE POLICY baseline_payment_insert ON payments FOR INSERT TO authenticated WITH CHECK(true);
    CREATE POLICY baseline_payment_update ON payments FOR UPDATE TO authenticated USING(true) WITH CHECK(true);
    CREATE POLICY baseline_payment_delete ON payments FOR DELETE TO authenticated USING(true);`);
  sql(read(migration));
});

let first, second;
test("migration backfill reconciles existing assessments without inventing payments",()=>{
  assert.equal(count("payments"),0);
  assert.equal(count("financial_private.reconciliations"),0);
  assert.equal(sql(`SELECT standing FROM memberships WHERE id='${mid}'`),"suspended");
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
  assert.throws(()=>sql(`UPDATE groups SET currency='XAF' WHERE id='${group}'`),/CURRENCY_HISTORY_IMMUTABLE/);
  assert.throws(()=>sql(`UPDATE contribution_types SET currency='XAF' WHERE id='${type}'`),/CURRENCY_MISMATCH/);
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
