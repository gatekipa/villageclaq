import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { computeMoneyFigures, computeObligationStates, buildObjectReport, confirmedPaidByType,
  assertFinancialScope, todayKey, allocatePaymentApplications } from "../src/lib/money.ts";
import { applyPaymentCommand, paymentRequestId, acknowledgePaymentRequest } from "../src/lib/payment-command.ts";
import { uploadPaymentEvidence } from "../src/lib/payment-evidence.ts";
import { normaliseObjectPath, signedUrlFor } from "../src/lib/storage-urls.ts";
const read = path => readFileSync(new URL("../" + path, import.meta.url),"utf8");
const o=(id,type,member="m1",amount=100,due="2026-01-01")=>({
  id,group_id:"g1",currency:"USD",contribution_type_id:type,membership_id:member,amount,due_date:due,status:"pending",
});
const p=(id,amount,type=null,member="m1")=>({
  id,group_id:"g1",currency:"USD",contribution_type_id:type,membership_id:member,amount,status:"confirmed",recorded_at:"2026-02-01",
});
const obls=[o("o1","t1"),o("o2","t2","m1",100,"2026-01-02")];
const pays=[p("p1",80,"t1"),p("p2",50)];
test("type reports allocate general funds once before slicing",()=>{
  const a=buildObjectReport(obls,pays,{contributionTypeId:"t1"});
  const b=buildObjectReport(obls,pays,{contributionTypeId:"t2"});
  assert.equal(a.totals.totalCollected,100); assert.equal(a.totals.totalOutstanding,0);
  assert.equal(b.totals.totalCollected,30); assert.equal(b.totals.totalOutstanding,70);
  const group=computeMoneyFigures(obls,pays);
  assert.equal(a.totals.totalCollected+b.totals.totalCollected,group.collected);
  assert.equal(a.totals.totalOutstanding+b.totals.totalOutstanding,group.outstanding);
});
test("collection-by-type rollup agrees with independently sliced reports",()=>{
  const totals=confirmedPaidByType(pays,obls);
  assert.equal(totals.get("t1"),100); assert.equal(totals.get("t2"),30);
});
test("general unallocated credit is explicit and cannot offset another member",()=>{
  const result=computeMoneyFigures([...obls,o("peer","t1","m2")],[p("general",250)]);
  assert.equal(result.collected,250); assert.equal(result.outstanding,100); assert.equal(result.unallocatedCredit,50);
  assert.equal(result.expected,result.collected-result.unallocatedCredit+result.outstanding);
});
test("pending general money is not falsely assigned to individual contributions",()=>{
  const pending={...p("pending",100),status:"pending_confirmation"};
  assert.equal(computeMoneyFigures(obls,[pending]).pending.amount,100);
  for(const type of ["t1","t2"]) assert.equal(buildObjectReport(obls,[pending],{contributionTypeId:type}).totals.totalPending,0);
});
test("equal due dates have stable id tie-breaks independent of input order",()=>{
  const a=o("a","t1"),b=o("b","t1");
  assert.deepEqual(allocatePaymentApplications([b,a],[p("g",100)]),[{paymentIndex:0,obligationId:"a",amount:100}]);
});
test("legacy obligation links recover missing member/type without changing order",()=>{
  const payment={...p("linked",30),membership_id:null,obligation_id:"o1"};
  assert.equal(computeObligationStates(obls,[payment]).get("o1").confirmedPaid,30);
});
test("mixed group inputs cannot share a financial aggregate",()=>{
  assert.throws(()=>computeMoneyFigures(obls,[{...p("other",5),group_id:"g2"}]),/FINANCIAL_SCOPE_REQUIRES_REVIEW/);
});
test("mixed currencies cannot share a financial aggregate",()=>{
  assert.throws(()=>computeMoneyFigures(obls,[{...p("other",50000),currency:"XAF"}]),/FINANCIAL_SCOPE_REQUIRES_REVIEW/);
});
test("a mismatched display currency fails explicitly",()=>{
  assert.throws(()=>assertFinancialScope(obls,pays,"XAF"),/FINANCIAL_SCOPE_REQUIRES_REVIEW/);
});
test("same-currency cents reconcile without fractional residue",()=>{
  const amounts=[p("a",0.1),p("b",0.2)];
  assert.equal(computeMoneyFigures([o("c","t1","m1",0.3)],amounts).outstanding,0);
});
test("UTC financial cutoff is independent of the officer browser timezone",()=>{
  const prior=process.env.TZ;
  try {
    for(const tz of ["Pacific/Honolulu","Pacific/Auckland","America/New_York"]) {
      process.env.TZ=tz; assert.equal(todayKey(new Date("2026-09-07T00:01:00Z")),"2026-09-07");
    }
  } finally { if(prior===undefined) delete process.env.TZ; else process.env.TZ=prior; }
});
test("allocation does not mutate source records",()=>{
  const before=JSON.stringify([obls,pays]);
  computeObligationStates(Object.freeze([...obls]),Object.freeze([...pays]));
  assert.equal(JSON.stringify([obls,pays]),before);
});
test("uncertain requests retain identity and acknowledged new operations get a new key",()=>{
  const scope="synthetic-record";
  const first=paymentRequestId(scope); assert.equal(paymentRequestId(scope),first);
  acknowledgePaymentRequest(scope); assert.notEqual(paymentRequestId(scope),first);
});
test("different actor/group/member scopes do not share request identities",()=>{
  assert.notEqual(paymentRequestId("g1:u1:m1"),paymentRequestId("g2:u2:m2"));
});
test("RPC arguments contain explicit identity, version and correction reason only",async()=>{
  let call;
  const client={rpc:async(name,args)=>{call={name,args};return {data:{payment:{id:"p"},appliedTo:[],creditRemaining:0,replayed:false},error:null};}};
  await applyPaymentCommand(client,{groupId:"g1",requestId:"key",action:"correct",paymentId:"p",expectedVersion:2,reason:"Wrong amount",values:{amount:40}});
  assert.equal(call.name,"apply_payment_command"); assert.equal(call.args.p_expected_version,2);
  assert.equal(call.args.p_reason,"Wrong amount"); assert.deepEqual(call.args.p_values,{amount:40});
});
test("database errors do not expose raw private diagnostics",async()=>{
  const client={rpc:async()=>({error:{message:"Private database diagnostic"},data:null})};
  await assert.rejects(()=>applyPaymentCommand(client,{groupId:"g",requestId:"k",action:"record"}),/^Error: PAYMENT_COMMAND_FAILED$/);
});
test("uncertain RPC failure does not clear the request key",async()=>{
  const key=paymentRequestId("timeout");
  const client={rpc:async()=>{throw new Error("Connection unavailable");}};
  await assert.rejects(()=>applyPaymentCommand(client,{groupId:"g",requestId:key,action:"record"}));
  assert.equal(paymentRequestId("timeout"),key);
});
test("receipt upload retry uses same immutable content path and never upsert",async()=>{
  const paths=[]; let count=0;
  const client={storage:{from:()=>({
    upload:async(path,_file,options)=>{assert.equal(options,undefined);paths.push(path);return {error:count++?{statusCode:"409"}:null};},
    list:async(_folder,{search})=>({data:[{name:search}],error:null}),
  })}};
  const file=new File(["synthetic evidence"],"private-original-name.pdf",{type:"application/pdf"});
  const first=await uploadPaymentEvidence(client,"g","r",file);
  assert.equal(await uploadPaymentEvidence(client,"g","r",file),first);
  assert.equal(paths[0],paths[1]); assert.ok(!first.includes(file.name));
});
test("existing receipt collision is not trusted without RLS-visible evidence",async()=>{
  const client={storage:{from:()=>({upload:async()=>({error:{statusCode:"409"}}),list:async()=>({data:[],error:null})})}};
  await assert.rejects(()=>uploadPaymentEvidence(client,"g","r",new File(["x"],"x.pdf")),/RECEIPT_UPLOAD_FAILED/);
});
test("all supported payment-write UI paths use the atomic command",()=>{
  const hooks=read("src/lib/hooks/use-supabase-query.ts");
  const record=hooks.slice(hooks.indexOf("export function useRecordPayment"),hooks.indexOf("export function useEvents"));
  assert.ok(record.includes("await applyPaymentCommand")); assert.ok(!record.includes('.from("payments").insert'));
  assert.ok(!record.includes('.from("contribution_obligations")'));
  for(const file of ["src/components/payments/pay-now-dialog.tsx","src/app/[locale]/(dashboard)/dashboard/contributions/history/page.tsx"]) {
    const source=read(file); assert.ok(source.includes("await applyPaymentCommand"));
    assert.ok(!/\.from\("payments"\)\s*\.(insert|update|delete)\(/.test(source));
  }
});
test("standing and matrix allocate over all obligations before exclusions/type slices",()=>{
  const standing=read("src/lib/calculate-standing.ts");
  assert.match(standing,/computeObligationStates\(\s*obligations as/);
  const matrix=read("src/app/[locale]/(dashboard)/dashboard/contributions/matrix/page.tsx");
  assert.match(matrix,/computeObligationStates\(\s*matrixData.obligations as/);
});
test("void requires a reason and never destroys a payment row",()=>{
  const source=read("src/app/[locale]/(dashboard)/dashboard/contributions/history/page.tsx");
  const body=source.slice(source.indexOf("async function handleDeletePayment"),source.indexOf("  if (isLoading)"));
  assert.ok(body.includes('action: "void"')); assert.ok(body.includes("correctionReason.trim()"));
  assert.ok(!body.includes(".delete()")); assert.ok(source.includes('htmlFor="payment-void-reason"'));
});

test("legacy signed/public receipt URLs normalize UTF-8 paths without bearer query strings",()=>{
  for(const mode of ["public","sign","authenticated"]) {
    assert.equal(normaliseObjectPath("receipts",`https://fixture.invalid/storage/v1/object/${mode}/receipts/legacy%20fixture.pdf?token=synthetic`),"legacy fixture.pdf");
  }
  assert.equal(normaliseObjectPath("receipts","group/literal%20file.pdf"),"group/literal%20file.pdf");
  assert.equal(normaliseObjectPath("receipts","https://fixture.invalid/unknown"),"");
});
test("unknown legacy URLs never reach the signing endpoint",async()=>{
  const client={storage:{from:()=>{throw new Error("Unexpected signing attempt");}}};
  assert.equal(await signedUrlFor(client,"receipts","https://fixture.invalid/unknown"),null);
});
