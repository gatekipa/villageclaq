// TEST ONLY. Integration of the unchanged frozen economic oracles.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluateOpening } from "./opening-oracle.mjs";
import { context, command, validVectors, negativeVectors, scenarios, ID, TIME, uuid, xaf } from "./opening-vectors.mjs";
import { replayVectors } from "./replay-vectors.mjs";
import { evaluateCommand, canonicalBytes, fingerprint } from "../f3-02/oracle.mjs";
import { moneyIn, moneyOut, transfer } from "../f3-02/vectors.mjs";
import { project, minorUnits } from "../f3-03/projection-oracle.mjs";
import { evaluateCorrection, economicFromPosting } from "../f3-04/correction-oracle.mjs";

const query = {group_id:ID.group,from:"2026-01-01T00:00:00Z",to:"2027-01-01T00:00:00Z"};
const rejects = (fn, code) => assert.throws(fn, e => e.message === code);
function bind(c, r, event_id = ID.event) {
  c.existing.push({event_id,payload:structuredClone(r.payload),fingerprint:r.fingerprint});
  if (!c.provenances.some(p => p.id === r.provenance.id)) c.provenances.push(structuredClone(r.provenance));
}
function set(r,n=1) {
  const id=uuid(1000+n), p=r.payload;
  const event={...p,id,status:"posted",posted_at:"2026-09-10T14:00:00.000000Z",created_by:uuid(950),
    description:r.provenance?.details.source_description ?? "Fixture",
    reference_metadata:r.provenance?.details.reference_metadata ?? {},
    economic_payload_fingerprint:r.fingerprint, economic:economicFromPosting(p),
    reversal_of_event_id:null,replacement_event_id:null};
  const postings=r.postings.map((line,i)=>({...line,id:uuid(10000+n*10+i),event_id:id}));
  event.postings=postings;
  return {event,postings};
}
function snapshot(sets,c=context()) {
  return {snapshot_id:"f3-05-fixture",observed_at:"2026-09-10T14:00:00Z",
    events:sets.map(s=>s.event),postings:sets.flatMap(s=>s.postings),
    display:{accounts:c.accounts,funds:c.funds}};
}
const simple = (rows, key) => rows.map(r=>[r[key],r.amount]);
for (const v of validVectors) test("valid: "+v.name,()=>{
  const c=context();v.setup?.(c);const before=structuredClone(c);
  const r=evaluateOpening(v.input,c), e=v.expected;
  assert.equal(r.decision,"READY");assert.equal(r.new_event_count,1);assert.equal(r.new_posting_count,2);
  assert.equal(r.new_provenance_count,1);assert.equal(r.recognition,"neither");
  assert.equal(r.payload.amount,e.amount);assert.equal(r.payload.currency,e.currency);
  assert.equal(r.payload.source_module,"opening_finance");assert.equal(r.payload.effect_kind,"opening_custody");
  assert.equal(r.payload.request_id,null);
  assert.deepEqual(r.postings.map(p=>[p.control_class,p.amount_signed,p.account_id,p.fund_id]),
    [["custody",e.amount,e.account,e.fund],["opening_position","-"+e.amount,null,e.fund]]);
  for(const p of r.postings) {
    for(const field of ["category_id","category_class","member_id","project_id"]) assert.equal(p[field],null);
    for(const field of ["group_id","ledger_epoch_id","currency","occurred_at","fund_id"]) assert.equal(p[field],r.payload[field]);
  }
  assert.equal(r.postings.reduce((s,p)=>s+minorUnits(p.amount_signed,p.currency),0n),0n);
  const view=project(snapshot([set(r)]),{...query,group_id:r.payload.group_id});
  const zero=e.currency==="XAF"?"0":"0.00";
  assert.deepEqual(view.soa.map(s=>[s.income,s.expense,s.operating_result]),[[zero,zero,zero]]);
  for(const k of ["account_balance","fund_cash","fund_net_position","organization_custody"]) assert.equal(view[k][0].amount,e.amount);
  assert.equal(view.cashbook.length,1);assert.equal(view.cash_movement[0].movement_type,"opening_position");
  assert.equal(view.cashbook[0].source_record_id,v.input.opening_occurrence_id);
  assert.equal(view.cashbook[0].source_module,"opening_finance");assert.equal(view.cashbook[0].request_id,null);
  assert.deepEqual(c,before);
});
for(const v of negativeVectors) test("negative: "+v.name,()=>{
  const c=context();v.setup?.(c);const before=structuredClone(c);
  rejects(()=>evaluateOpening(v.input,c),v.error);assert.deepEqual(c,before);
});
for(const v of replayVectors) test("replay: "+v.name,()=>{
  const c=context(), input=command(), r=evaluateOpening(input,c);bind(c,r);v.setup?.(c);
  const before=structuredClone(c), changed={...input,...v.patch};
  if(v.error) rejects(()=>evaluateOpening(changed,c),v.error);
  else {
    const retry=evaluateOpening(changed,c);
    assert.equal(retry.event_id,ID.event);assert.equal(retry.new_event_count,0);assert.equal(retry.new_posting_count,0);
    assert.equal(retry.new_provenance_count,0);assert.deepEqual(retry.provenance,r.provenance);
  }
  assert.deepEqual(c,before);
});
for(const v of scenarios) test("scenario: "+v.name,()=>{
  const c=context(),sets=[];
  for(const input of v.entries) {
    const r=evaluateOpening(input,c);assert.equal(r.new_provenance_count,sets.length?0:1);
    bind(c,r,uuid(1000+sets.length+1));sets.push(set(r,sets.length+1));
  }
  assert.equal(c.provenances.length,1);
  assert.equal(new Set(sets.map(s=>s.event.source_record_id)).size,v.entries.length);
  const view=project(snapshot(sets,c),query);
  assert.deepEqual(simple(view.account_balance,"account_id"),v.accounts);
  assert.deepEqual(simple(view.fund_cash,"fund_id"),v.funds);
  assert.deepEqual(simple(view.fund_net_position,"fund_id"),v.funds);
  assert.equal(view.organization_custody[0].amount,v.total);
  for(const rows of [view.account_balance,view.fund_cash,view.fund_net_position])
    assert.equal(rows.reduce((a,r)=>a+minorUnits(r.amount,r.currency),0n),minorUnits(v.total,"USD"));
  assert.deepEqual(view.income,[]);assert.deepEqual(view.expense,[]);
  assert.equal(view.soa[0].operating_result,"0.00");
  assert.equal(view.cashbook.length,v.entries.length);
  assert.ok(view.cashbook.every(r=>r.movement_type==="opening_position"));
});
test("archive preserves projections but denies new occurrence",()=>{
  const c=context(),r=evaluateOpening(command(),c);bind(c,r);
  const sets=[set(r)],before=project(snapshot(sets,c),query);
  c.accounts[0].status="inactive";c.funds[0].status="inactive";
  assert.deepEqual(project(snapshot(sets,c),query),before);
  rejects(()=>evaluateOpening(command({opening_occurrence_id:uuid(704)}),c),"ACCOUNT_INACTIVE");
  c.accounts[0].status="active";
  rejects(()=>evaluateOpening(command({opening_occurrence_id:uuid(704)}),c),"FUND_INACTIVE");
});
test("shared provenance new occurrence keeps first committed evidence",()=>{
  const c=context(),r=evaluateOpening(command(),c);bind(c,r);
  const next=evaluateOpening(command({opening_occurrence_id:uuid(702),amount:"2000",
    provenance:{source_description:"Retry must not rewrite worksheet"}}),c);
  assert.equal(next.new_event_count,1);assert.equal(next.new_provenance_count,0);
  assert.deepEqual(next.provenance,r.provenance);
});
test("USD and XAF same group successive epochs remain separate buckets",()=>{
  const c=context(),usd=evaluateOpening(command(),c);
  c.epochs[0].effective_to="2026-09-09T00:00:00Z";
  c.epochs.find(e=>e.id===ID.xafEpoch).group_id=ID.group;
  c.epochs.find(e=>e.id===ID.xafEpoch).effective_from="2026-09-09T00:00:00Z";
  const a=c.accounts.find(a=>a.id===ID.xafBank);a.group_id=ID.group;a.opened_at="2026-09-09T00:00:00Z";
  c.funds.find(f=>f.id===ID.xafFund).group_id=ID.group;
  const x=evaluateOpening(command({...xaf,group_id:ID.group,opening_occurrence_id:uuid(702),
    opening_provenance_id:uuid(802),occurred_at:"2026-09-09T00:00:00Z"}),c);
  const view=project(snapshot([set(usd),set(x,2)]),query);
  assert.deepEqual(simple(view.organization_custody,"currency"),[["USD","10000.00"],["XAF","2500000"]]);
  assert.deepEqual(view.soa.map(s=>[s.currency,s.income,s.expense]),[["USD","0.00","0.00"],["XAF","0","0"]]);
});
test("opening is not operating income in periods before, including or after economic date",()=>{
  const s=snapshot([set(evaluateOpening(command(),context()))]);
  for(const [from,to] of [["2026-01-01","2026-09-08"],["2026-09-08","2026-09-09"],["2026-09-09","2027-01-01"]]) {
    const v=project(s,{...query,from:from+"T00:00:00Z",to:to+"T00:00:00Z"});
    assert.equal(v.soa[0].income,"0.00");assert.equal(v.soa[0].expense,"0.00");assert.equal(v.soa[0].operating_result,"0.00");
  }
});
test("economic time, not posted time, drives balance cutoff and cashbook",()=>{
  const s=snapshot([set(evaluateOpening(command(),context()))]);
  const before=project(s,{...query,as_of_exclusive:TIME});
  assert.equal(before.account_balance.length,0);
  const after=project(s,{...query,as_of_exclusive:"2026-09-08T12:00:00.000001Z"});
  assert.equal(after.account_balance[0].amount,"10000.00");
  assert.equal(after.cashbook[0].occurred_at,TIME);
  assert.notEqual(after.cashbook[0].posted_at,TIME);
});
test("F3-04 correction excludes opening",()=>{
  const s=set(evaluateOpening(command(),context()));
  rejects(()=>evaluateCorrection({group_id:ID.group,correction_request_id:uuid(960),target_event_id:s.event.id,
    intent:"REVERSE",correction_reason:"Opening adjustment"},
    {...context(),events:[s.event],completed:[],manual_occurrences:[]}),"TARGET_NOT_MANUAL");
});
test("ordinary manual channel cannot masquerade as opening",()=>{
  const {request_id,...input}=moneyIn({action:"opening",category_id:null});
  rejects(()=>evaluateCommand(input,context()),"PRIVATE_EFFECT");
});
test("opening occurrence cannot reuse a manual Money In request UUID",()=>{
  const c=context(),r=evaluateCommand(moneyIn({request_id:ID.opening}),c);
  c.existing.push({event_id:ID.event,payload:r.payload,fingerprint:r.fingerprint});
  rejects(()=>evaluateOpening(command(),c),"REQUEST_ID_REUSED");
});
test("minimal north-star composition through unchanged F3-02, F3-04 and F3-03",()=>{
  const c=context(),opening=set(evaluateOpening(command(),c),1);
  const income=evaluateCommand(moneyIn(),c),incomeSet=set(income,2);
  const out=set(evaluateCommand(moneyOut(),c),3),move=set(evaluateCommand(transfer(),c),4);
  const correction=evaluateCorrection({group_id:ID.group,correction_request_id:uuid(960),target_event_id:incomeSet.event.id,
    intent:"CORRECT",correction_reason:"Correct donation amount",replacement:{amount:"450"}},
    {...c,corrected_at:"2026-09-10T15:00:00Z",events:[opening.event,incomeSet.event,out.event,move.event],
      completed:[],manual_occurrences:[{event_id:incomeSet.event.id,payload:income.payload,fingerprint:income.fingerprint}]});
  Object.assign(incomeSet.event,correction.result.target_update);
  const children=[correction.result.reversal,correction.result.replacement].map(event=>({event,postings:event.postings}));
  const view=project(snapshot([opening,incomeSet,out,move,...children]),query);
  assert.deepEqual(simple(view.account_balance,"account_id"),[[ID.bank,"9250.00"],[ID.cash,"1000.00"]]);
  assert.deepEqual(simple(view.fund_cash,"fund_id"),[[ID.general,"10000.00"],[ID.restricted,"250.00"]]);
  assert.equal(view.organization_custody[0].amount,"10250.00");
  assert.deepEqual(view.soa.map(s=>[s.income,s.expense,s.operating_result]),[["450.00","200.00","250.00"]]);
});
const goldens=JSON.parse(readFileSync(new URL("./canonical-golden.json",import.meta.url),"utf8").replace(/^\uFEFF/,""));
for(const g of goldens) test("golden: "+g.name,()=>{
  const r=evaluateOpening(command(g.input),context());
  assert.deepEqual(r.payload,g.payload);assert.equal(r.canonical_bytes,g.canonical_bytes);
  assert.equal(r.fingerprint,g.sha256);
  assert.equal(canonicalBytes(g.payload),g.canonical_bytes);assert.equal(fingerprint(g.payload),g.sha256);
});
test("oracle has no IO, product imports or side-effect interfaces",()=>{
  const code=readFileSync(new URL("./opening-oracle.mjs",import.meta.url),"utf8");
  const imports=[...code.matchAll(/from "([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(imports,["../f3-02/oracle.mjs"]);
  assert.doesNotMatch(code,/\b(?:fetch|process|require|eval)\s*\(|\bimport\s*\(|\b(?:payments|contribution_obligations|payment_obligation_applications|standing|sendEmail|sendSMS)\b/);
  const c=context();c.unrelated={payments:[],contribution_obligations:[],payment_obligation_applications:[],
    standing_history:[],member_balances:[],contribution_types:[],receipts:[],notifications:[]};
  const before=structuredClone(c);evaluateOpening(command(),c);assert.deepEqual(c,before);
});
