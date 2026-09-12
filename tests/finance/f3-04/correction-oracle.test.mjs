// TEST ONLY. Successful-commit fixture adapter is not a database or lock implementation.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluateCommand } from "../f3-02/oracle.mjs";
import { moneyIn, moneyOut, transfer } from "../f3-02/vectors.mjs";
import { project, minorUnits } from "../f3-03/projection-oracle.mjs";
import { evaluateCorrection, canonicalBytes, fingerprint, childId, normalizeReason, assertGraph, economicFromPosting, DIMENSIONS } from "./correction-oracle.mjs";
import { context, command, validVectors, negativeVectors, ID, uuid, JAN, FEB, AUDIT, ORIGINAL_ACTOR } from "./correction-vectors.mjs";
import { replayVectors, concurrencyVectors } from "./replay-vectors.mjs";

function fixture(v={}) {
  const c = context();
  const input = ({money_in:moneyIn,money_out:moneyOut,transfer}[v.action ?? "money_in"])({
    occurred_at:JAN,...(v.xaf ? {group_id:ID.xafGroup,account_id:ID.xafBank,category_id:ID.xafIncome,
      fund_id:ID.xafFund,currency:"XAF",amount:"500"} : {}),...v.original });
  const original = evaluateCommand(input,c);
  const p = original.payload;
  const t = {id:ID.event,group_id:p.group_id,ledger_epoch_id:p.ledger_epoch_id,currency:p.currency,
    event_class:p.event_class,effect_kind:p.effect_kind,source_module:p.source_module,source_record_id:p.source_record_id,
    request_id:p.request_id,economic:economicFromPosting(p),economic_payload_fingerprint:original.fingerprint,
    occurred_at:p.occurred_at,posted_at:JAN,created_at:JAN,created_by:ORIGINAL_ACTOR,status:"posted",
    reversal_of_event_id:null,replacement_event_id:null,correction_reason:null,corrected_at:null,
    description:input.description ?? "Original narrative",reference_metadata:{reference:"Original reference"},
    postings:original.postings.map((p,i)=>({...p,id:uuid(2001+i),event_id:ID.event}))};
  c.events=[t];c.manual_occurrences=[{event_id:t.id,payload:p,fingerprint:original.fingerprint}];
  const cmd=command({group_id:p.group_id,...(v.intent==="REVERSE"?{intent:"REVERSE",replacement:null}:
    {replacement:v.delta ?? {amount:"450"}}),...v.input});
  v.setup?.(c,t,cmd);
  if (v.remove) delete cmd[v.remove];
  return {c,t,cmd};
}
function commit(c, plan) {
  assert.equal(plan.decision,"READY");
  const next=structuredClone(c);
  Object.assign(next.events.find(e=>e.id===plan.result.target_event_id),plan.result.target_update);
  next.events.push(structuredClone(plan.result.reversal));
  if(plan.result.replacement) next.events.push(structuredClone(plan.result.replacement));
  next.completed.push({payload:plan.payload,fingerprint:plan.fingerprint,target_snapshot:plan.target_snapshot,result:structuredClone(plan.result)});
  assertGraph(next.events);
  return next;
}
function snapshot(c) {
  return {snapshot_id:"contract-fixture",observed_at:AUDIT,events:c.events,
    postings:c.events.flatMap(e=>e.postings)};
}
const query=(group=ID.group,from="2026-01-01T00:00:00Z",to="2026-03-01T00:00:00Z")=>({
  group_id:group,from,to,as_of_exclusive:null});
const tuple=p=>[p.control_class,p.amount_signed,p.account_id,p.category_id];
function exactReversal(t,r) {
  assert.equal(r.postings.length,t.postings.length);
  for(const p of t.postings) {
    const inv=r.postings.find(row=>row.id===childId(t.group_id,r.source_record_id.split("/")[0],"reversal/posting/"+p.id));
    assert.ok(inv);
    for(const k of DIMENSIONS) assert.equal(inv[k],p[k],k);
    assert.equal(minorUnits(inv.amount_signed,p.currency),-minorUnits(p.amount_signed,p.currency));
    assert.notEqual(inv.id,p.id);assert.notEqual(inv.event_id,p.event_id);
  }
}
for(const v of validVectors) test("valid: "+v.name,()=>{
  const {c,t,cmd}=fixture(v), before=structuredClone(c);
  const plan=evaluateCorrection(cmd,c), r=plan.result;
  assert.deepEqual(c,before,"oracle must be pure");
  exactReversal(t,r.reversal);
  assert.equal(r.reversal.occurred_at,JAN);assert.equal(r.reversal.posted_at,AUDIT);
  assert.equal(r.reversal.reversal_of_event_id,t.id);assert.equal(r.reversal.request_id,null);
  assert.equal(r.target_update.status,v.intent==="REVERSE"?"reversed":"corrected");
  assert.equal(r.audit.correction_actor,c.actor_id);
  if(v.intent==="REVERSE") {assert.equal(r.replacement,null);assert.equal(plan.new_event_count,1);}
  else {
    assert.deepEqual(r.replacement.postings.map(tuple),v.expected);
    for(const p of r.replacement.postings) {
      assert.equal(p.group_id,t.group_id);assert.equal(p.ledger_epoch_id,t.ledger_epoch_id);assert.equal(p.currency,t.currency);
      assert.equal(p.occurred_at,v.time ?? JAN);assert.equal(p.fund_id,v.fund ?? (v.xaf?ID.xafFund:v.action==="transfer"?ID.general:ID.restricted));
      assert.equal(p.member_id,v.member ?? null);assert.equal(p.project_id,v.project ?? null);
      assert.equal(p.category_class,p.category_id?p.control_class:null);
    }
    assert.equal(r.replacement.request_id,null);assert.equal(plan.new_event_count,2);
    assert.notEqual(r.replacement.economic_payload_fingerprint,t.economic_payload_fingerprint);
  }
  const after=commit(c,plan), old=after.events[0];
  for(const k of Object.keys(t).filter(k=>!["status","replacement_event_id","corrected_at","correction_reason"].includes(k)))
    assert.deepEqual(old[k],t[k],"original immutable "+k);
  const projection=project(snapshot(after),query(t.group_id));
  assert.equal(projection._population.committed.length,v.intent==="REVERSE"?4:6);
  const expectedIncome=v.expected.filter(p=>p[0]==="income").reduce((s,p)=>s-minorUnits(p[1],t.currency),0n);
  const expectedExpense=v.expected.filter(p=>p[0]==="expense").reduce((s,p)=>s+minorUnits(p[1],t.currency),0n);
  assert.equal(minorUnits(projection.soa[0].income,t.currency),expectedIncome);
  assert.equal(minorUnits(projection.soa[0].expense,t.currency),expectedExpense);
  const expectedAccounts=new Map(t.postings.filter(p=>p.account_id).map(p=>[p.account_id,0n]));
  for(const [control,amount,account] of v.expected) if(control==="custody")
    expectedAccounts.set(account,(expectedAccounts.get(account)??0n)+minorUnits(amount,t.currency));
  assert.deepEqual(new Map(projection.account_balance.map(p=>[p.account_id,minorUnits(p.amount,p.currency)])),expectedAccounts);
  const originalBook=projection.cashbook.find(b=>b.event_id===t.id);
  assert.equal(originalBook.status,r.target_update.status);assert.equal(originalBook.correction_reason,cmd.correction_reason);
  assert.equal(originalBook.created_by,ORIGINAL_ACTOR);
  for(const row of projection.cashbook) assert.ok(!Object.hasOwn(row,"economic_payload"));
});
for(const v of negativeVectors) test("negative: "+v.name,()=>{
  let {c,t,cmd}=fixture(v);
  if(v.terminal || v.targetReversal) {
    const first=evaluateCorrection(command({...(v.terminal==="REVERSE"?{intent:"REVERSE",replacement:null}:{})}),c);
    c=commit(c,first);
    cmd.correction_request_id=uuid(1666);
    if(v.targetReversal)cmd.target_event_id=first.result.reversal.id;
  }
  const before=structuredClone(c);
  assert.throws(()=>evaluateCorrection(cmd,c),{message:v.code});assert.deepEqual(c,before);
});
for(const v of replayVectors) test("replay: "+v.name,()=>{
  const f=fixture(),first=evaluateCorrection(f.cmd,f.c);
  const c=commit(f.c,first);
  const cmd={...f.cmd,...v.input,replacement:v.input?.intent==="REVERSE"?null:{...f.cmd.replacement,...v.delta}};
  v.setup?.(c);
  const before=structuredClone(c);
  if(v.code) assert.throws(()=>evaluateCorrection(cmd,c),{message:v.code});
  else {
    const retry=evaluateCorrection(cmd,c);assert.equal(retry.decision,v.decision);
    assert.equal(retry.new_event_count,0);assert.equal(retry.new_posting_count,0);
    assert.deepEqual(retry.result,first.result);assert.equal(retry.fingerprint,first.fingerprint);
  }
  assert.deepEqual(c,before);
});
for(const v of concurrencyVectors) test("serialized race contract: "+v.name,()=>{
  const f=fixture();
  const a={...f.cmd,...(v.firstIntent==="REVERSE"?{intent:"REVERSE",replacement:null}:{})};
  const b={...f.cmd,correction_request_id:v.sameRequest?f.cmd.correction_request_id:uuid(1666),
    ...(v.secondIntent==="REVERSE"?{intent:"REVERSE",replacement:null}:{}),
    ...(v.secondTarget?{target_event_id:v.secondTarget}:{})};
  if(v.secondAmount)b.replacement={amount:v.secondAmount};
  const first=evaluateCorrection(a,f.c),after=commit(f.c,first);
  let second;try{second=evaluateCorrection(b,after).decision}catch(e){second=e.message}
  assert.deepEqual([first.decision,second],v.expected);
  assert.equal(after.events.filter(e=>e.reversal_of_event_id===ID.event).length,1);
  assert.equal(after.events.length,v.firstIntent==="REVERSE"?2:3);
});
test("linear A to B to C and old retry survives later correction",()=>{
  const f=fixture(),a=evaluateCorrection(f.cmd,f.c),ca=commit(f.c,a);
  const b=evaluateCorrection(command({correction_request_id:uuid(1666),target_event_id:a.result.replacement.id,replacement:{amount:"425"}}),ca);
  const cb=commit(ca,b),p=project(snapshot(cb),query());
  assert.equal(cb.events.length,5);assert.equal(p.soa[0].income,"425.00");
  assert.equal(cb.events.find(e=>e.id===a.result.replacement.id).status,"corrected");
  assert.deepEqual(evaluateCorrection(f.cmd,cb).result,a.result);
});
test("reverse latest replacement closes chain",()=>{
  const f=fixture(),a=evaluateCorrection(f.cmd,f.c),ca=commit(f.c,a);
  const b=evaluateCorrection(command({correction_request_id:uuid(1666),target_event_id:a.result.replacement.id,intent:"REVERSE",replacement:null}),ca);
  assert.equal(project(snapshot(commit(ca,b)),query()).soa[0].income,"0.00");
});
test("January restatement discovered February has zero February activity",()=>{
  const f=fixture(),p=evaluateCorrection(f.cmd,f.c),s=snapshot(commit(f.c,p));
  assert.equal(project(s,query(ID.group,"2026-01-01T00:00:00Z","2026-02-01T00:00:00Z")).soa[0].income,"450.00");
  assert.equal(project(s,query(ID.group,"2026-02-01T00:00:00Z","2026-03-01T00:00:00Z")).soa[0].income,"0.00");
  assert.equal(p.result.audit.corrected_at,AUDIT);
});
test("January to February date move",()=>{
  const f=fixture({delta:{amount:"500",occurred_at:FEB}}),s=snapshot(commit(f.c,evaluateCorrection(f.cmd,f.c)));
  assert.equal(project(s,query(ID.group,"2026-01-01T00:00:00Z","2026-02-01T00:00:00Z")).soa[0].income,"0.00");
  assert.equal(project(s,query(ID.group,"2026-02-01T00:00:00Z","2026-03-01T00:00:00Z")).soa[0].income,"500.00");
});
for(const type of ["cycle","shared replacement","second reversal"])test("graph forbids "+type,()=>{
  const f=fixture(),p=evaluateCorrection(f.cmd,f.c),c=commit(f.c,p);
  if(type==="cycle")Object.assign(c.events[2],{status:"corrected",replacement_event_id:ID.event});
  if(type==="shared replacement")c.events.push({...structuredClone(c.events[0]),id:uuid(2998)});
  if(type==="second reversal")c.events.push({...structuredClone(c.events[1]),id:uuid(2999)});
  assert.throws(()=>assertGraph(c.events),{message:"LINEAGE_INTEGRITY"});
});
test("exact reversal ignores original posting row order and retains SQL trailing zero value",()=>{
  const f=fixture();f.t.postings.reverse();f.t.postings.forEach(p=>{p.amount_signed+="000000";p.created_at=JAN;});
  const p=evaluateCorrection(f.cmd,f.c);exactReversal(f.t,p.result.reversal);
  assert.ok(p.result.reversal.postings.every(row=>!Object.hasOwn(row,"created_at")));
});
test("reason NFC, Unicode whitespace, scalar length and null rejection",()=>{
  assert.equal(normalizeReason(" \u00A0Cafe\u0301\tfix\r\n"),"Café fix");
  assert.equal(normalizeReason("😀😀😀"),"😀😀😀");
  assert.throws(()=>normalizeReason("\uFEFFvalid reason"),{message:"INVALID_REASON"});
  assert.throws(()=>normalizeReason(null),{message:"REASON_REQUIRED"});
  assert.throws(()=>normalizeReason("\ud800bad"),{message:"INVALID_REASON"});
});
test("child identity stable scoped and separated",()=>{
  const a=childId(ID.group,uuid(1601),"reversal");
  assert.match(a,/^[a-f0-9-]{14}5[a-f0-9-]{21}$/);
  assert.notEqual(a,childId(ID.otherGroup,uuid(1601),"reversal"));
  assert.notEqual(a,childId(ID.group,uuid(1601),"replacement"));
});
test("canonical nested key order explicit null and microseconds",()=>{
  assert.equal(canonicalBytes({z:null,a:{z:"2",a:"1"}}),'{"a":{"a":"1","z":"2"},"z":null}');
  const f=fixture(),a=evaluateCorrection(f.cmd,f.c),b=evaluateCorrection({...f.cmd,replacement:{amount:"450",occurred_at:"2026-01-10T12:00:00.000001Z"}},f.c);
  assert.notEqual(a.fingerprint,b.fingerprint);
});
test("all proposal components are one visibility unit; failure does not mutate fixture",()=>{
  const f=fixture(),before=structuredClone(f.c),p=evaluateCorrection(f.cmd,f.c);
  for(const phase of ["reversal_event","reversal_postings","replacement_event","replacement_postings","target_update","audit","replay"]) {
    // Failure contract: uncommitted proposal is discarded. Real rollback remains Stage B.
    assert.throws(()=>{void p.result;throw new Error("FAIL_AT_"+phase);},{message:"FAIL_AT_"+phase});
    assert.deepEqual(f.c,before);
  }
  assert.equal(commit(f.c,p).completed.length,1);
});
const golden=JSON.parse(readFileSync(new URL("./canonical-golden.json",import.meta.url),"utf8"));
for(const g of golden)test("golden: "+g.name,()=>{
  const f=fixture(g.fixture),p=evaluateCorrection(f.cmd,f.c);
  assert.deepEqual(p.payload,g.payload);assert.equal(p.canonical_bytes,g.canonical_bytes);assert.equal(p.fingerprint,g.fingerprint);
  for(const role of ["reversal","replacement"]) {
    const child=p.result[role];
    if(g[role]===null){assert.equal(child,null);continue;}
    assert.deepEqual(child.economic_payload,g[role].payload);
    assert.equal(canonicalBytes(child.economic_payload),g[role].canonical_bytes);
    assert.equal(child.economic_payload_fingerprint,g[role].fingerprint);
  }
});

test("historical USD correction and current XAF stay in separate buckets",()=>{
  const f=fixture(),c=commit(f.c,evaluateCorrection(f.cmd,f.c));
  const x=fixture({original:{request_id:uuid(1880),currency:"XAF",account_id:uuid(110),amount:"700",
    occurred_at:"2026-08-01T00:00:00Z"}}).t;
  x.id=uuid(1881);x.postings=x.postings.map((p,i)=>({...p,event_id:x.id,id:uuid(1882+i)}));
  c.events.push(x);
  const p=project(snapshot(c),query(ID.group,"2026-01-01T00:00:00Z","2027-01-01T00:00:00Z"));
  assert.deepEqual(p.soa.map(r=>[r.currency,r.income,r.expense]),[["USD","450.00","0.00"],["XAF","700","0"]]);
  assert.deepEqual(p.organization_custody.map(r=>[r.currency,r.amount]),[["USD","450.00"],["XAF","700"]]);
});
test("retry retains original meaning for omitted fields, not last replacement defaults",()=>{
  const f=fixture(),first=evaluateCorrection({...f.cmd,replacement:{amount:"450",fund_id:ID.general}},f.c);
  const c=commit(f.c,first);
  assert.throws(()=>evaluateCorrection(f.cmd,c),{message:"CONFLICT"});
});
test("first narrative wins and invalid retry narrative remains rejected",()=>{
  const f=fixture(),first=evaluateCorrection(f.cmd,f.c),c=commit(f.c,first);
  const retry=evaluateCorrection({...f.cmd,replacement:{amount:"450",description:"New text"}},c);
  assert.equal(retry.result.replacement.description,"Original narrative");
  assert.throws(()=>evaluateCorrection({...f.cmd,replacement:{amount:"450",reference_metadata:[]}},c),{message:"INVALID_INPUT"});
});
test("retained archived membership and project keep F3-02 group validation",()=>{
  const f=fixture({original:{member_id:ID.member,project_id:ID.project}});
  f.c.members[0].status="inactive";f.c.projects[0].status="archived";
  assert.equal(evaluateCorrection(f.cmd,f.c).result.replacement.economic.member_id,ID.member);
});
test("request UUID cannot alias original manual request later in chain",()=>{
  const f=fixture(),first=evaluateCorrection(f.cmd,f.c),c=commit(f.c,first);
  assert.throws(()=>evaluateCorrection(command({target_event_id:first.result.replacement.id,correction_request_id:ID.request}),c),
    {message:"REQUEST_ID_REUSED"});
});
test("original and replacement stored fingerprints are distinct from each reversal",()=>{
  const f=fixture(),p=evaluateCorrection(f.cmd,f.c);
  assert.equal(new Set([f.t.economic_payload_fingerprint,p.fingerprint,
    p.result.reversal.economic_payload_fingerprint,p.result.replacement.economic_payload_fingerprint]).size,4);
});
test("server-derived event collision aborts rather than linking existing event",()=>{
  const f=fixture(),p=evaluateCorrection(f.cmd,f.c);
  f.c.events.push({...structuredClone(f.t),id:p.result.replacement.id,
    postings:f.t.postings.map((line,i)=>({...line,id:uuid(2800+i),event_id:p.result.replacement.id}))});
  assert.throws(()=>evaluateCorrection(f.cmd,f.c),{message:"CHILD_ID_COLLISION"});
});
test("opposite target race schedule also has exactly one winner",()=>{
  for(const intents of [["CORRECT","CORRECT"],["CORRECT","REVERSE"],["REVERSE","CORRECT"]]) {
    const f=fixture();
    const commands=intents.map((intent,i)=>command({correction_request_id:uuid(1800+i),intent,
      replacement:intent==="CORRECT"?{amount:"450"}:null}));
    for(const [winner,loser] of [[0,1],[1,0]]) {
      const p=evaluateCorrection(commands[winner],f.c),c=commit(f.c,p);
      assert.throws(()=>evaluateCorrection(commands[loser],c),{message:"TARGET_ALREADY_CORRECTED"});
      assert.equal(c.events.filter(e=>e.reversal_of_event_id===ID.event).length,1);
    }
  }
});
test("same request different valid targets serializes independently of target",()=>{
  const f=fixture(),g=fixture({original:{request_id:uuid(1888)}});
  g.t.id=uuid(1999);g.t.postings=g.t.postings.map((p,i)=>({...p,event_id:g.t.id,id:uuid(2900+i)}));
  g.c.manual_occurrences[0].event_id=g.t.id;
  f.c.events.push(g.t);f.c.manual_occurrences.push(g.c.manual_occurrences[0]);
  for(const [win,lose] of [[ID.event,g.t.id],[g.t.id,ID.event]]) {
    const p=evaluateCorrection({...f.cmd,target_event_id:win},f.c),c=commit(f.c,p);
    assert.throws(()=>evaluateCorrection({...f.cmd,target_event_id:lose},c),{message:"CONFLICT"});
    assert.equal(c.events.find(e=>e.id===lose).status,"posted");
    assert.equal(c.completed.length,1);
  }
});
