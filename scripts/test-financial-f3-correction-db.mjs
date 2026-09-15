// Disposable PostgreSQL 17 only. No remote URL, Supabase client, bind mount, or network.
import assert from "node:assert/strict";
import test,{before,after}from"node:test";
import{readFileSync}from"node:fs";
import{createDisposablePostgres}from"./fixtures/disposable-postgres.mjs";
import{installF3StubFloor}from"./fixtures/f3-forward-prerequisites.mjs";
import{ID,uuid,fixtureContext,moneyIn,moneyOut,transfer}from"../tests/finance/f3-02/vectors.mjs";
const label="f3-correction",db=createDisposablePostgres({name:label,label}),sql=db.sql,asyncSql=db.asyncSql;
const actor=(g=ID.group)=>g===ID.group?uuid(9001):g===ID.otherGroup?uuid(9002):uuid(9003),ordinary=uuid(9004);
const q=(v)=>v==null?"NULL":"'"+String(v).replaceAll("'","''")+"'",json=(v)=>q(JSON.stringify(v))+"::jsonb";
const fail=(s)=>{try{sql(s);}catch(e){return String(e.stderr||e.message)}assert.fail("expected rejection")};
const read=(p)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const call=(fn,p,who=actor(p.group_id),role="authenticated")=>"SET ROLE "+role+";SET request.jwt.claim.sub="+q(who)+";SELECT "+fn+"("+json(p)+");";
const post=(p)=>JSON.parse(sql(call("public.post_financial_command",p)));
const correct=(p,who=actor(p.group_id))=>JSON.parse(sql(call("public.correct_financial_event",p,who)));
const counts=()=>JSON.parse(sql("SELECT jsonb_build_array((SELECT count(*)FROM public.financial_events),(SELECT count(*)FROM public.financial_postings),(SELECT count(*)FROM financial_core.correction_command_payloads));"));
const history=()=>sql("SELECT jsonb_build_object('e',(SELECT jsonb_agg(e ORDER BY id)FROM public.financial_events e),'p',(SELECT jsonb_agg(p ORDER BY id)FROM public.financial_postings p),'c',(SELECT jsonb_agg(c ORDER BY correction_request_id)FROM financial_core.correction_command_payloads c));");
function seed(){
 const c=structuredClone(fixtureContext());
 for(const a of c.accounts){const o=c.epochs.find(e=>e.id===a.opened_ledger_epoch_id);if(o?.group_id===a.group_id&&o.currency!==a.currency){
  let x=c.epochs.find(e=>e.group_id===a.group_id&&e.currency===a.currency);if(!x){x={id:uuid(6000+c.epochs.length),group_id:a.group_id,currency:a.currency,effective_from:"2025-01-01T00:00:00Z",effective_to:"2026-01-01T00:00:00Z"};c.epochs.push(x)}a.opened_ledger_epoch_id=x.id}}
 let s="BEGIN;TRUNCATE public.position_assignments,public.position_permissions,public.groups,public.profiles CASCADE;";
 for(const g of[ID.group,ID.otherGroup,ID.xafGroup]){const code=c.epochs.find(e=>e.group_id===g&&e.effective_to===null)?.currency||(g===ID.xafGroup?"XAF":"USD");
  const m=uuid(9100+Number(g.slice(-1))),p=uuid(9200+Number(g.slice(-1)));
  s+="INSERT INTO public.groups(id,currency)VALUES("+q(g)+","+q(code)+");INSERT INTO public.profiles(id)VALUES("+q(actor(g))+");";
  s+="INSERT INTO public.memberships(id,group_id,user_id,role)VALUES("+q(m)+","+q(g)+","+q(actor(g))+",'member');";
  s+="INSERT INTO public.group_positions(id,group_id,title)VALUES("+q(p)+","+q(g)+",'Treasurer');";
  s+="INSERT INTO public.position_assignments(membership_id,position_id)VALUES("+q(m)+","+q(p)+");INSERT INTO public.position_permissions(position_id,permission)VALUES("+q(p)+",'finances.manage');"}
 s+="INSERT INTO public.profiles(id)VALUES("+q(ordinary)+");INSERT INTO public.memberships(id,group_id,user_id)VALUES("+q(uuid(9104))+","+q(ID.group)+","+q(ordinary)+");";
 for(const m of c.members)s+="INSERT INTO public.memberships(id,group_id)VALUES("+q(m.id)+","+q(m.group_id)+");";
 for(const p of c.projects)s+="INSERT INTO public.projects(id,group_id,name)VALUES("+q(p.id)+","+q(p.group_id)+","+q(p.id)+");";
 for(const e of c.epochs)s+="INSERT INTO public.financial_ledger_epochs(id,group_id,currency,effective_from,effective_to,source_kind,approval_note)VALUES("+[e.id,e.group_id,e.currency,e.effective_from,e.effective_to,"cutover","Disposable"].map(q).join(",")+");";
 for(const a of c.accounts){s+="INSERT INTO public.financial_accounts(id,group_id,opened_ledger_epoch_id,currency,name,kind,opened_at)VALUES("+[a.id,a.group_id,a.opened_ledger_epoch_id,a.currency,a.id,"bank",a.opened_at].map(q).join(",")+");";
  if(a.status!=="active")s+="UPDATE public.financial_accounts SET status='inactive'WHERE id="+q(a.id)+";";if(a.status==="closed")s+="UPDATE public.financial_accounts SET status='closed'WHERE id="+q(a.id)+";"}
 for(const f of c.funds){s+="INSERT INTO public.financial_funds(id,group_id,name,is_default,is_restricted)VALUES("+[f.id,f.group_id,f.id].map(q).join(",")+","+Boolean(f.is_default)+","+Boolean(f.is_restricted)+");";if(f.status!=="active")s+="UPDATE public.financial_funds SET status='inactive'WHERE id="+q(f.id)+";"}
 for(const x of c.categories){s+="INSERT INTO public.financial_categories(id,group_id,name,category_class)VALUES("+[x.id,x.group_id,x.id,x.category_class].map(q).join(",")+");";if(x.status!=="active")s+="UPDATE public.financial_categories SET status='inactive'WHERE id="+q(x.id)+";"}
 sql(s+"COMMIT;");
}
const original=(kind="in")=>post(kind==="out"?moneyOut():kind==="transfer"?transfer():moneyIn());
const command=(id,extra={})=>({group_id:ID.group,correction_request_id:uuid(1601),target_event_id:id,
 intent:"CORRECT",correction_reason:"Correct recorded amount",replacement:{amount:"450.00"},...extra});
const tamper=(statement)=>sql("SET session_replication_role=replica;"+statement+";SET session_replication_role=origin;");
const pristine=(eventId,before)=>{assert.equal(history(),before);assert.equal(sql("SELECT status::text||'|'||COALESCE(replacement_event_id::text,'')||'|'||COALESCE(corrected_at::text,'')||'|'||COALESCE(correction_reason,'') FROM public.financial_events WHERE id="+q(eventId)),"posted|||")};
function holdCorrectionLock(kind,value){
 let release;const key=kind==="request"?"f3-correction-request":"f3-correction-target";
 const ready=new Promise((resolve,reject)=>{let output="";
  const child=db.openSql();
  child.once("error",reject);child.once("close",code=>{if(code!==0)reject(new Error("lock holder failed"))});
  child.stdout.on("data",d=>{output+=d;if(output.includes("LOCK_READY"))resolve()});
  release=()=>new Promise((resolve,reject)=>{child.once("close",c=>c===0?resolve():reject(new Error("lock holder failed")));child.stdin.end("COMMIT;")});
  child.stdin.write("BEGIN;SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(pg_catalog.jsonb_build_array("+
   q(key)+","+q(ID.group)+","+q(value)+")::text,0));SELECT 'LOCK_READY';\n");
 });return{ready,release:()=>release()};
}
before(async()=>{await db.start();
 installF3StubFloor(db.url,{through:"00122_f3_04_correction_reversal.sql"});});
after(()=>db.stop());
test("A-D auth, hiding, provenance, reason",()=>{seed();const e=original();assert.match(fail(call("public.correct_financial_event",command(e.event_id),ordinary)),/DENY/);
 assert.match(fail(call("public.correct_financial_event",{...command(e.event_id),group_id:ID.otherGroup},actor(ID.otherGroup))),/TARGET_NOT_FOUND/);
 assert.match(fail(call("public.correct_financial_event",{...command(e.event_id),correction_reason:null})),/REASON_REQUIRED/);});
for(const[kind,name,amount]of[["in","E Money In CORRECT","450.00"],["out","F Money Out CORRECT","175.00"],["transfer","G Transfer CORRECT","900.00"]])
 test(name,()=>{seed();const e=original(kind),r=correct(command(e.event_id,{replacement:{amount}}));assert.equal(r.decision,"CORRECTED");assert.deepEqual(counts(),[3,6,1])});
for(const[kind,name]of[["in","H Money In REVERSE"],["out","I Money Out REVERSE"],["transfer","J Transfer REVERSE"]])
 test(name,()=>{seed();const e=original(kind),r=correct(command(e.event_id,{intent:"REVERSE",replacement:null}));assert.equal(r.decision,"REVERSED");assert.deepEqual(counts(),[2,4,1])});
test("K-L exact reversal and archived dimensions",()=>{seed();const e=original();sql("UPDATE public.financial_funds SET is_default=false;UPDATE public.financial_accounts SET status='inactive';UPDATE public.financial_accounts SET status='closed';UPDATE public.financial_funds SET status='inactive';UPDATE public.financial_categories SET status='inactive';");
 const r=correct(command(e.event_id));assert.equal(sql("SELECT count(*)FROM public.financial_postings a JOIN public.financial_postings b ON b.event_id="+q(r.result.reversal_event_id)+" AND b.amount_signed=-a.amount_signed AND b.account_id IS NOT DISTINCT FROM a.account_id AND b.fund_id=a.fund_id AND b.category_id IS NOT DISTINCT FROM a.category_id WHERE a.event_id="+q(e.event_id)),"2")});
test("M-P date, epoch, currency, action",()=>{seed();let e=original();assert.equal(correct(command(e.event_id,{replacement:{occurred_at:"2026-02-05T12:00:00Z"}})).decision,"CORRECTED");
 seed();e=original();assert.match(fail(call("public.correct_financial_event",command(e.event_id,{replacement:{currency:"XAF"}}))),/CROSS_CURRENCY_REPLACEMENT/);
 assert.match(fail(call("public.correct_financial_event",command(e.event_id,{replacement:{action:"money_out"}}))),/ACTION_CHANGE_PROHIBITED/);});
test("Q-R replay and conflict",()=>{seed();const e=original(),c=command(e.event_id);correct(c);const h=history(),r=correct(c);assert.equal(r.decision,"IDEMPOTENT_RETURN_EXISTING");assert.equal(history(),h);
 assert.match(fail(call("public.correct_financial_event",command(e.event_id,{replacement:{amount:"449.00"}}))),/CONFLICT/)});
test("S-T target races",async()=>{seed();const e=original(),a=command(e.event_id),b=command(e.event_id,{correction_request_id:uuid(1602),intent:"REVERSE",replacement:null});
 const rs=await Promise.allSettled([a,b].map(c=>asyncSql(call("public.correct_financial_event",c))));assert.equal(rs.filter(x=>x.status==="fulfilled").length,1);assert.match(rs.find(x=>x.status==="rejected").reason.message,/TARGET_ALREADY_CORRECTED/)});
test("U-V grants and deterministic IDs",()=>{seed();assert.equal(sql("SELECT has_function_privilege('authenticated','public.correct_financial_event(jsonb)','EXECUTE')"),"t");
 for(const role of["anon","service_role"])assert.equal(sql("SELECT has_function_privilege("+q(role)+",'public.correct_financial_event(jsonb)','EXECUTE')"),"f");
 const e=original(),r=correct(command(e.event_id));assert.equal(r.result.reversal_event_id,sql("SELECT financial_core.f3_correction_child_id("+q(ID.group)+","+q(uuid(1601))+",'reversal')"))});
test("W-Z collisions, uniqueness, reversal target",()=>{seed();const e=original(),r=correct(command(e.event_id));
 assert.equal(sql("SELECT count(*)FROM public.financial_events WHERE reversal_of_event_id="+q(e.event_id)),"1");
 assert.equal(sql("SELECT count(*)FROM public.financial_events WHERE replacement_event_id="+q(r.result.replacement_event_id)),"1");
 assert.match(fail(call("public.correct_financial_event",command(r.result.reversal_event_id,{correction_request_id:uuid(1602)}))),/REVERSAL_TARGET_PROHIBITED/)});
test("AA second correction",()=>{seed();const e=original(),a=correct(command(e.event_id));const b=correct(command(a.result.replacement_event_id,{correction_request_id:uuid(1602),replacement:{amount:"425.00"}}));assert.equal(b.decision,"CORRECTED");assert.deepEqual(counts(),[5,10,2])});
test("P1 full original posting snapshot integrity",()=>{
 const cases=[
  e=>"DELETE FROM financial_core.posting_command_payloads WHERE event_id="+q(e.event_id),
  e=>"UPDATE financial_core.posting_command_payloads SET canonical_payload=jsonb_set(canonical_payload,'{amount}','\"499.00\"') WHERE event_id="+q(e.event_id),
  e=>"UPDATE public.financial_events SET economic_payload_fingerprint=repeat('0',64) WHERE id="+q(e.event_id),
  e=>"UPDATE public.financial_events SET source_record_id="+q(uuid(7777))+" WHERE id="+q(e.event_id),
  e=>"UPDATE public.financial_events SET effect_kind='manual_expense' WHERE id="+q(e.event_id),
  e=>"DELETE FROM public.financial_postings WHERE id=(SELECT id FROM public.financial_postings WHERE event_id="+q(e.event_id)+" LIMIT 1)",
  e=>"UPDATE public.financial_postings SET amount_signed=amount_signed+1 WHERE id=(SELECT id FROM public.financial_postings WHERE event_id="+q(e.event_id)+" LIMIT 1)",
  e=>"UPDATE public.financial_postings SET fund_id="+q(ID.general)+" WHERE id=(SELECT id FROM public.financial_postings WHERE event_id="+q(e.event_id)+" LIMIT 1)"
 ];
 for(const mutate of cases){seed();const e=original();tamper(mutate(e));assert.match(fail(call("public.correct_financial_event",command(e.event_id))),/TARGET_NOT_MANUAL/)}
});
test("P1 replacement eligibility requires immutable private proof",()=>{seed();const e=original(),a=correct(command(e.event_id));
 tamper("DELETE FROM financial_core.correction_command_payloads WHERE replacement_event_id="+q(a.result.replacement_event_id));
 assert.match(fail(call("public.correct_financial_event",command(a.result.replacement_event_id,{correction_request_id:uuid(1602)}))),/TARGET_NOT_MANUAL/)});
for(const kind of["request","target"])test("P1 "+kind+" lock wait rechecks revoked authorization",async()=>{
 seed();const e=original(),c=command(e.event_id),holder=holdCorrectionLock(kind,kind==="request"?c.correction_request_id:c.target_event_id);await holder.ready;
 const prior=history();const pending=asyncSql(call("public.correct_financial_event",c)).then(v=>({v}),error=>({error}));
 let waiting=false;for(let i=0;i<50;i++){if(sql("SELECT count(*) FROM pg_catalog.pg_locks WHERE locktype='advisory' AND NOT granted")!=="0"){waiting=true;break}await new Promise(r=>setTimeout(r,50))}
 assert.ok(waiting);sql("UPDATE public.memberships SET membership_status='suspended' WHERE user_id="+q(actor()));
 await holder.release();const outcome=await pending;assert.match(outcome.error?.message||"",/DENY/);pristine(e.event_id,prior);
});
test("P1 CORRECT rollback at three intermediate points",()=>{
 const injections=[
  ["public.financial_events","BEFORE INSERT","NEW.effect_kind='correction_replacement'"],
  ["public.financial_postings","BEFORE INSERT","NEW.id=financial_core.f3_correction_child_id("+q(ID.group)+","+q(uuid(1601))+",'replacement/posting/2')"],
  ["public.financial_events","AFTER UPDATE","OLD.status='posted' AND NEW.status='corrected'"]
 ];
 for(let i=0;i<injections.length;i++){seed();const e=original(),prior=history(),[table,timing,predicate]=injections[i],fn="public.rollback_"+i;
  sql("CREATE FUNCTION "+fn+"()RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF "+predicate+" THEN RAISE EXCEPTION 'FORCED_ROLLBACK_"+i+"';END IF;RETURN NEW;END$$;CREATE TRIGGER rollback_"+i+" "+timing+" ON "+table+" FOR EACH ROW EXECUTE FUNCTION "+fn+"();");
  assert.match(fail(call("public.correct_financial_event",command(e.event_id))),new RegExp("FORCED_ROLLBACK_"+i));pristine(e.event_id,prior);
  sql("DROP TRIGGER rollback_"+i+" ON "+table+";DROP FUNCTION "+fn+"();")}
});
test("P1 REVERSE rollback after reversal creation",()=>{seed();const e=original(),prior=history();
 sql("CREATE FUNCTION public.rollback_reverse()RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.replacement_event_id IS NULL THEN RAISE EXCEPTION 'FORCED_REVERSE_ROLLBACK';END IF;RETURN NEW;END$$;CREATE TRIGGER rollback_reverse BEFORE INSERT ON financial_core.correction_command_payloads FOR EACH ROW EXECUTE FUNCTION public.rollback_reverse();");
 assert.match(fail(call("public.correct_financial_event",command(e.event_id,{intent:"REVERSE",replacement:null}))),/FORCED_REVERSE_ROLLBACK/);pristine(e.event_id,prior);
 sql("DROP TRIGGER rollback_reverse ON financial_core.correction_command_payloads;DROP FUNCTION public.rollback_reverse()");
});
test("AB atomic rollback",()=>{seed();const e=original();sql("CREATE FUNCTION public.fail_correction()RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.effect_kind='correction_replacement'THEN RAISE EXCEPTION 'FORCED_ROLLBACK';END IF;RETURN NEW;END$$;CREATE TRIGGER fail_correction BEFORE INSERT ON public.financial_events FOR EACH ROW EXECUTE FUNCTION public.fail_correction();");
 const h=history();assert.match(fail(call("public.correct_financial_event",command(e.event_id))),/FORCED_ROLLBACK/);assert.equal(history(),h);sql("DROP TRIGGER fail_correction ON public.financial_events;DROP FUNCTION public.fail_correction()")});
test("AC-AD projection and canonical SHA",()=>{seed();const e=original();correct(command(e.event_id));assert.equal(sql("SELECT sum(amount_signed)::text FROM public.financial_postings WHERE control_class='income'"),"-450.00000000");
 assert.equal(sql("SELECT financial_core.f3_correction_fingerprint(pg_catalog.jsonb_build_object('b',2,'a',1))"),"43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777")});
test("AE raw DML protected",()=>{seed();const e=original();correct(command(e.event_id));const h=history();assert.match(fail("SET ROLE authenticated;UPDATE public.financial_events SET status='reversed'"),/permission denied/);assert.match(fail("SET ROLE authenticated;SELECT * FROM financial_core.correction_command_payloads"),/permission denied/);assert.equal(history(),h)});
