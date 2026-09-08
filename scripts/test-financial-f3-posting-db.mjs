// Isolated PostgreSQL 17 only. No connection URL, Supabase client, or environment credentials.
import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { execFile, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { installPrerequisites, migrationChain } from "./fixtures/financial-f3-posting-prerequisites.mjs";
import { ID, uuid, fixtureContext, moneyIn, moneyOut, transfer, opening, privateOpening,
  validVectors, negativeVectors } from "../tests/finance/f3-02/vectors.mjs";
import { replayVectors } from "../tests/finance/f3-02/replay-vectors.mjs";
import { evaluateCommand } from "../tests/finance/f3-02/oracle.mjs";

const label = "f3-posting";
const container = "villageclaq-f3-posting-" + process.pid + "-" + Date.now();
const image = "postgres:17-alpine";
const actor = (group = ID.group) => group === ID.group ? uuid(9001) : group === ID.otherGroup ? uuid(9002) : uuid(9003);
const ordinary = uuid(9004);
const q = (v) => v == null ? "NULL" : "'" + String(v).replaceAll("'", "''") + "'";
const json = (v) => q(JSON.stringify(v)) + "::jsonb";
const docker = (args, options = {}) => execFileSync("docker", args, {
  encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 8 * 1024 * 1024, ...options,
}).trim();
function sql(query) {
  return docker(["exec", "-i", container, "psql", "-X", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"], { input: query });
}
function failure(query) {
  try { sql(query); } catch (error) { return String(error.stderr || error.message); }
  assert.fail("Expected SQL rejection");
}
const asyncSql = (query) => new Promise((resolve, reject) => {
  execFile("docker", ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"],
    { encoding: "utf8" }, (err, out, stderr) => err ? reject(new Error(stderr || err.message)) : resolve(out.trim()))
    .stdin.end(query);
});
const counts = () => JSON.parse(sql("SELECT jsonb_build_array((SELECT count(*) FROM public.financial_events),(SELECT count(*) FROM public.financial_postings),(SELECT count(*) FROM financial_core.posting_command_payloads));"));
function seed(context = fixtureContext()) {
  const c = structuredClone(context);
  // Legal SQL counterparts for currency-mismatch vectors: custody's immutable
  // opened-epoch FK needs a historical epoch in its own currency.
  for (const a of c.accounts) {
    const original = c.epochs.find((e) => e.id === a.opened_ledger_epoch_id);
    if (original?.group_id === a.group_id && original.currency !== a.currency) {
      let older = c.epochs.find((e) => e.group_id === a.group_id && e.currency === a.currency);
      if (!older) {
        older = { id: uuid(6000+c.epochs.length), group_id:a.group_id,currency:a.currency,
          effective_from:"2025-01-01T00:00:00Z",effective_to:"2026-01-01T00:00:00Z" };
        c.epochs.push(older);
      }
      a.opened_ledger_epoch_id=older.id;
    }
  }
  let query = "BEGIN; TRUNCATE public.position_assignments, public.position_permissions, public.groups, public.profiles CASCADE;";
  for (const g of [ID.group,ID.otherGroup,ID.xafGroup]) {
    const code = c.epochs.find((e) => e.group_id===g && e.effective_to===null)?.currency || (g===ID.xafGroup?"XAF":"USD");
    query += "INSERT INTO public.groups(id,currency) VALUES("+q(g)+","+q(code)+");";
    query += "INSERT INTO public.profiles(id) VALUES("+q(actor(g))+");";
    query += "INSERT INTO public.memberships(id,group_id,user_id,role) VALUES("+q(uuid(9100+Number(g.slice(-1))))+","+q(g)+","+q(actor(g))+",'member');";
    query += "INSERT INTO public.position_assignments(membership_id,position_id) VALUES("+q(uuid(9100+Number(g.slice(-1))))+","+q(uuid(9200+Number(g.slice(-1))))+");";
    query += "INSERT INTO public.position_permissions(position_id,permission) VALUES("+q(uuid(9200+Number(g.slice(-1))))+",'finances.manage');";
  }
  query += "INSERT INTO public.profiles(id) VALUES("+q(ordinary)+"); INSERT INTO public.memberships(id,group_id,user_id) VALUES("+q(uuid(9104))+","+q(ID.group)+","+q(ordinary)+");";
  for (const m of c.members) query += "INSERT INTO public.memberships(id,group_id) VALUES("+q(m.id)+","+q(m.group_id)+");";
  for (const p of c.projects) query += "INSERT INTO public.projects(id,group_id,name) VALUES("+q(p.id)+","+q(p.group_id)+","+q(p.id)+");";
  for (const e of c.epochs) query += "INSERT INTO public.financial_ledger_epochs(id,group_id,currency,effective_from,effective_to,source_kind,approval_note) VALUES("+[e.id,e.group_id,e.currency,e.effective_from,e.effective_to,"cutover","Disposable synthetic fixture"].map(q).join(",")+");";
  for (const a of c.accounts) {
    query += "INSERT INTO public.financial_accounts(id,group_id,opened_ledger_epoch_id,currency,name,kind,opened_at) VALUES("+[a.id,a.group_id,a.opened_ledger_epoch_id,a.currency,a.id,"bank",a.opened_at].map(q).join(",")+");";
    if(a.status!=="active") query += "UPDATE public.financial_accounts SET status='inactive' WHERE id="+q(a.id)+";";
    if(a.status==="closed") query += "UPDATE public.financial_accounts SET status='closed' WHERE id="+q(a.id)+";";
  }
  for (const f of c.funds) {
    query += "INSERT INTO public.financial_funds(id,group_id,name,is_default,is_restricted) VALUES("+[f.id,f.group_id,f.id].map(q).join(",")+","+Boolean(f.is_default)+","+Boolean(f.is_restricted)+");";
    if(f.status!=="active") query += "UPDATE public.financial_funds SET status='inactive' WHERE id="+q(f.id)+";";
  }
  for(const cat of c.categories) {
    query += "INSERT INTO public.financial_categories(id,group_id,name,category_class) VALUES("+[cat.id,cat.group_id,cat.id,cat.category_class].map(q).join(",")+");";
    if(cat.status!=="active") query += "UPDATE public.financial_categories SET status='inactive' WHERE id="+q(cat.id)+";";
  }
  sql(query+"COMMIT;");
}
function query(input, context = fixtureContext(), options = {}) {
  const internal = context.channel !== "manual";
  const role = options.role || (internal ? "postgres" : "authenticated");
  const who = options.actor || (context.authorized ? actor(input.group_id) : ordinary);
  const call = internal
    ? "financial_core.post_f3_command("+json(input)+","+json(context.opening_occurrence || {})+")"
    : "public.post_financial_command("+json(input)+")";
  return "SET ROLE "+role+"; SET request.jwt.claim.sub="+q(who)+"; SELECT "+call+";";
}
const command = (input, context, options) => JSON.parse(sql(query(input, context, options)));
before(async () => {
  docker(["run","--rm","-d","--name",container,"--network","none","--label","villageclaq.test="+label,
    "-e","POSTGRES_HOST_AUTH_METHOD=trust","-e","POSTGRES_INITDB_ARGS=--no-sync",image]);
  let ready=false;
  for(let i=0;i<40;i++) {
    try { docker(["exec",container,"pg_isready","-U","postgres"]); ready=true; break; }
    catch { await new Promise((r)=>setTimeout(r,250)); }
  }
  assert.ok(ready);
  const info=JSON.parse(docker(["inspect",container]))[0];
  assert.equal(info.Config.Labels["villageclaq.test"],label);
  assert.equal(info.HostConfig.NetworkMode,"none");
  assert.deepEqual(info.HostConfig.PortBindings,{});
  assert.equal(info.Mounts.some((m)=>m.Type==="bind"),false);
  installPrerequisites(sql);
});
after(() => {
  const info=JSON.parse(docker(["inspect",container]))[0];
  assert.equal(info.Config.Labels["villageclaq.test"],label);
  docker(["rm","-f",container]);
});
test("A. prerequisite chain and public posting smoke", () => {
  assert.equal(sql("SHOW server_version_num;").slice(0,2),"17");
  assert.equal(migrationChain.length,5);
  seed();
  const result=command(moneyIn(),fixtureContext());
  assert.equal(result.decision,"POSTED");
  assert.deepEqual(counts(),[1,2,1]);
});

function normalizedRows(eventId) {
  const rows=JSON.parse(sql("SELECT jsonb_agg(jsonb_build_object("+
    "'group_id',group_id,'ledger_epoch_id',ledger_epoch_id,'currency',currency,"+
    "'occurred_at',to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'),"+
    "'amount_signed',amount_signed::text,'control_class',control_class,'account_id',account_id,"+
    "'fund_id',fund_id,'category_id',category_id,'category_class',category_class,"+
    "'member_id',member_id,'project_id',project_id)) FROM public.financial_postings WHERE event_id="+q(eventId)));
  for(const r of rows) {
    const [whole,frac=""]=r.amount_signed.split(".");
    const scale=r.currency==="XAF"?0:2;
    assert.match(frac.slice(scale),/^0*$/);
    r.amount_signed=whole+(scale?"."+frac.slice(0,scale).padEnd(scale,"0"):"");
  }
  return rows;
}
function assertRows(result, vector) {
  const rows=normalizedRows(result.event_id);
  const order=(r)=>r.control_class+"|"+r.account_id+"|"+r.amount_signed;
  assert.deepEqual(rows.sort((a,b)=>order(a).localeCompare(order(b))),
    structuredClone(vector.expected.postings).sort((a,b)=>order(a).localeCompare(order(b))));
  assert.equal(rows.length,2);
  assert.equal(rows.reduce((sum,r)=>sum+BigInt(r.amount_signed.replace(".","")),0n),0n);
}
for(const v of validVectors) {
  test("economic parity: "+v.name,()=>{
    const c=fixtureContext(); v.setup?.(c); seed(c);
    const result=command(v.input,c);
    assert.equal(result.decision,"POSTED");
    assertRows(result,v);
    const expected=evaluateCommand(v.input,c);
    assert.deepEqual(JSON.parse(sql("SELECT canonical_payload FROM financial_core.posting_command_payloads WHERE event_id="+q(result.event_id))),expected.payload);
    assert.equal(result.fingerprint,expected.fingerprint);
    assert.deepEqual(counts(),[1,2,1]);
    assert.equal(sql("SELECT created_by::text||'|'||status::text FROM public.financial_events"),actor(v.input.group_id)+"|posted");
  });
}
const structuralNegatives=new Map([
  ["ambiguous default",/financial_funds_one_default/],
  ["overlapping epoch snapshot",/financial_ledger_epoch_no_overlap/],
  ["account opened in other tenant epoch",/financial_accounts_epoch_scope/],
]);
for(const v of negativeVectors) {
  test("negative parity: "+v.name,()=>{
    const c=fixtureContext(); v.setup?.(c);
    if(structuralNegatives.has(v.name)) {
      // These invalid oracle snapshots cannot exist under real F3/F0 constraints.
      // Prove the stronger native guard instead of disabling it to stage a test.
      seed(); const beforeCounts=counts();
      assert.throws(()=>seed(c),(e)=>structuralNegatives.get(v.name).test(String(e.stderr||e.message)));
      assert.deepEqual(counts(),beforeCounts);
      return;
    }
    seed(c);
    const error=failure(query(v.input,c));
    assert.match(error,new RegExp("\\b"+v.code+"\\b"));
    assert.deepEqual(counts(),[0,0,0]);
  });
}
const golden=JSON.parse(readFileSync(new URL("../tests/finance/f3-02/canonical-golden.json",import.meta.url),"utf8"));
for(const v of golden) {
  test("golden SQL UTF-8 bytes and SHA-256: "+v.name,()=>{
    seed(); const c=fixtureContext(); if(v.input.action==="opening") privateOpening(c);
    const result=command(v.input,c);
    const actual=JSON.parse(sql("SELECT jsonb_build_object('payload',canonical_payload,'bytes',financial_core.f3_canonical(canonical_payload),'sha256',financial_core.f3_fingerprint(canonical_payload)) FROM financial_core.posting_command_payloads WHERE event_id="+q(result.event_id)));
    assert.deepEqual(actual,{payload:v.payload,bytes:v.canonical_bytes,sha256:v.sha256});
    assert.equal(result.fingerprint,v.sha256);
  });
}
function transitionEpoch() {
  // Real transition proof in the disposable DB, after the fixture's noon event
  // and before the wall clock. Future-active epochs from pure snapshots are not
  // physically legal under Phase A, so this equivalent boundary is used.
  sql("BEGIN; INSERT INTO financial_private.epoch_transitions(transaction_id,group_id) VALUES(txid_current(),"+q(ID.group)+");"+
    "UPDATE public.financial_ledger_epochs SET effective_to='2026-09-08T13:00:00Z' WHERE id="+q(ID.epoch)+";"+
    "INSERT INTO public.financial_ledger_epochs(id,group_id,currency,effective_from,source_kind,approval_note) VALUES("+
    q(ID.futureEpoch)+","+q(ID.group)+",'XAF','2026-09-08T13:00:00Z','currency_transition','Disposable test transition');"+
    "UPDATE public.groups SET currency='XAF' WHERE id="+q(ID.group)+"; COMMIT;");
}
function archiveTargets() {
  sql("UPDATE public.financial_funds SET is_default=false WHERE group_id="+q(ID.group)+";"+
    "UPDATE public.financial_accounts SET status='inactive' WHERE group_id="+q(ID.group)+";"+
    "UPDATE public.financial_accounts SET status='closed' WHERE group_id="+q(ID.group)+";"+
    "UPDATE public.financial_funds SET status='inactive' WHERE group_id="+q(ID.group)+";"+
    "UPDATE public.financial_categories SET status='inactive' WHERE group_id="+q(ID.group)+";");
}
const history = () => sql("SELECT jsonb_build_object('events',(SELECT jsonb_agg(e ORDER BY e.id) FROM public.financial_events e),"+
  "'postings',(SELECT jsonb_agg(p ORDER BY p.id) FROM public.financial_postings p),"+
  "'payloads',(SELECT jsonb_agg(c ORDER BY c.event_id) FROM financial_core.posting_command_payloads c));");
for(const v of replayVectors) {
  test("replay parity: "+v.name,()=>{
    const c=fixtureContext(); v.initialSetup?.(c); seed(c);
    const result=command(v.original,c);
    const prior=history();
    const expected=evaluateCommand(v.original,c);
    c.existing=[{event_id:result.event_id,payload:expected.payload,fingerprint:expected.fingerprint}];
    v.setup?.(c); // pure source/provenance changes are passed only to the private path
    if(v.name==="7 revoked authorization") sql("DELETE FROM public.position_permissions WHERE position_id="+q(uuid(9201)));
    if(v.name.includes("after transition") || v.name.includes("across epochs") ||
        v.name==="new period is conflict even after epoch changes") transitionEpoch();
    if(v.name==="omitted default remains bound after default changes") {
      sql("UPDATE public.financial_funds SET is_default=false WHERE id="+q(ID.general)+";"+
        "INSERT INTO public.financial_funds(id,group_id,name,is_default) VALUES("+q(uuid(299))+","+q(ID.group)+",'New General',true);");
      transitionEpoch();
    }
    if(v.name==="historical inactive targets allow identical retry" ||
        v.name==="retry needs no current target/default/epoch resolution") archiveTargets();
    if(v.name==="two epochs already contain same source must fail closed" ||
        v.name==="duplicate private occurrence in another epoch fails closed") {
      transitionEpoch();
      const error=failure("INSERT INTO public.financial_events(group_id,ledger_epoch_id,currency,event_class,source_module,source_record_id,effect_kind,request_id,economic_payload_fingerprint,occurred_at) "+
        "SELECT group_id,"+q(ID.futureEpoch)+",'XAF',event_class,source_module,source_record_id,effect_kind,NULL,economic_payload_fingerprint,'2026-09-08T13:30:00Z' FROM public.financial_events;");
      assert.match(error,/financial_events_occurrence_across_epochs/);
      assert.equal(history(),prior);
      return;
    }
    if(v.name==="corrupt stored fingerprint must fail closed") {
      assert.match(failure("UPDATE public.financial_events SET economic_payload_fingerprint=repeat('0',64)"),/POSTED_FINANCIAL_EVENT_IMMUTABLE/);
      assert.match(failure("UPDATE financial_core.posting_command_payloads SET canonical_payload='{}'"),/POSTING_COMMAND_PAYLOAD_IMMUTABLE/);
      assert.equal(history(),prior);
      return;
    }
    const before=counts();
    // Revocation is real DB state, not the oracle's authorization boolean.
    c.authorized=true;
    if(v.code) {
      assert.match(failure(query(v.retry,c)),new RegExp("\\b"+v.code+"\\b"));
      assert.deepEqual(counts(),before);
      assert.equal(history(),prior);
    } else {
      const replay=command(v.retry,c);
      if(v.decision==="READY") {
        assert.equal(replay.decision,"POSTED");
        assert.notEqual(replay.event_id,result.event_id);
        assert.deepEqual(counts(),[2,4,2]);
      } else {
        assert.equal(replay.decision,"IDEMPOTENT_RETURN_EXISTING");
        assert.equal(replay.event_id,result.event_id);
        assert.equal(replay.ledger_epoch_id,result.ledger_epoch_id);
        assert.equal(replay.fingerprint,result.fingerprint);
        assert.equal(replay.new_event_count,0); assert.equal(replay.new_posting_count,0);
        assert.deepEqual(counts(),before); assert.equal(history(),prior);
      }
    }
  });
}
test("A/H. minimum RPC grants, definer settings, and private helpers",()=>{
  seed();
  assert.equal(sql("SELECT prosecdef AND proconfig=ARRAY['search_path=\"\"'] FROM pg_catalog.pg_proc WHERE oid='public.post_financial_command(jsonb)'::regprocedure"),"t");
  for(const role of ["anon","service_role"]) {
    assert.equal(sql("SELECT has_function_privilege("+q(role)+",'public.post_financial_command(jsonb)','EXECUTE')"),"f");
    assert.match(failure(query(moneyIn(),fixtureContext(),{role})),/permission denied/);
  }
  assert.equal(sql("SELECT has_function_privilege('authenticated','public.post_financial_command(jsonb)','EXECUTE')"),"t");
  assert.equal(sql("SELECT count(*) FROM pg_catalog.pg_proc p CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE p.oid='public.post_financial_command(jsonb)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE'"),"0");
  assert.match(failure("SET ROLE authenticated; SELECT financial_core.post_f3_command("+json(opening())+",'{}')"),/permission denied/);
  assert.match(failure(query(opening(),fixtureContext())),/PRIVATE_EFFECT/);
});
test("A/O. unauthorized actors cannot post, retry, or disclose conflicts",()=>{
  seed(); const result=command(moneyIn(),fixtureContext()); const prior=history();
  for(const who of [ordinary,actor(ID.otherGroup)]) {
    assert.match(failure(query(moneyIn(),fixtureContext(),{actor:who})),/\bDENY\b/);
    assert.match(failure(query(moneyIn({amount:"999"}),fixtureContext(),{actor:who})),/\bDENY\b/);
  }
  sql("UPDATE public.memberships SET membership_status='suspended' WHERE user_id="+q(actor()));
  for(const input of [moneyIn(),moneyIn({amount:"999",account_id:ID.otherBank})]) {
    const error=failure(query(input,fixtureContext()));
    assert.match(error,/\bDENY\b/); assert.equal(error.includes(result.event_id),false);
  }
  assert.equal(history(),prior);
});
test("T. authenticated raw DML and private payload access stay denied",()=>{
  seed(); command(moneyIn(),fixtureContext()); const prior=history();
  for(const table of ["public.financial_events","public.financial_postings"]) {
    for(const statement of [
      "INSERT INTO "+table+" SELECT * FROM "+table,
      "UPDATE "+table+" SET currency='USD'",
      "DELETE FROM "+table,
    ]) assert.match(failure("SET ROLE authenticated; SET request.jwt.claim.sub="+q(actor())+"; "+statement),/permission denied/);
  }
  assert.match(failure("SET ROLE authenticated; SELECT * FROM financial_core.posting_command_payloads"),/permission denied/);
  assert.equal(sql("SET ROLE authenticated; SET request.jwt.claim.sub="+q(actor(ID.otherGroup))+"; SELECT count(*) FROM public.financial_events"),"0");
  assert.equal(history(),prior);
});
test("I. closed posting set rejects privileged late pair and public append attempts",()=>{
  seed(); const result=command(moneyIn(),fixtureContext()); const prior=history();
  assert.match(failure("INSERT INTO public.financial_postings(event_id,group_id,ledger_epoch_id,currency,occurred_at,amount_signed,control_class,account_id,fund_id,category_id,category_class) "+
    "SELECT event_id,group_id,ledger_epoch_id,currency,occurred_at,amount_signed,control_class,account_id,fund_id,category_id,category_class FROM public.financial_postings WHERE event_id="+q(result.event_id)),/POSTING_SET_CLOSED/);
  assert.match(failure(query(moneyIn({postings:[]}),fixtureContext())),/UNSUPPORTED_FIELD/);
  assert.equal(history(),prior);
});
test("J. forced second-line failure rolls back event, postings, and payload",()=>{
  seed();
  sql("CREATE FUNCTION public.fixture_fail_second_line() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.control_class='income' THEN RAISE EXCEPTION 'FIXTURE_SECOND_LINE_FAILURE'; END IF; RETURN NEW; END; $$;"+
    "CREATE TRIGGER fixture_fail_second_line BEFORE INSERT ON public.financial_postings FOR EACH ROW EXECUTE FUNCTION public.fixture_fail_second_line();");
  assert.match(failure(query(moneyIn(),fixtureContext())),/FIXTURE_SECOND_LINE_FAILURE/);
  assert.deepEqual(counts(),[0,0,0]);
  sql("DROP TRIGGER fixture_fail_second_line ON public.financial_postings; DROP FUNCTION public.fixture_fail_second_line();");
  assert.equal(sql("SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgname IN ('financial_events_balance_guard','financial_postings_balance_guard') AND tgenabled='O'"),"2");
  command(moneyIn(),fixtureContext()); assert.deepEqual(counts(),[1,2,1]);
});
test("K. concurrent identical manual requests commit exactly once",async()=>{
  seed(); const results=await Promise.all(Array.from({length:8},()=>asyncSql(query(moneyIn(),fixtureContext())).then(JSON.parse)));
  assert.equal(new Set(results.map((r)=>r.event_id)).size,1);
  assert.equal(results.filter((r)=>r.decision==="POSTED").length,1);
  assert.equal(results.filter((r)=>r.decision==="IDEMPOTENT_RETURN_EXISTING").length,7);
  assert.deepEqual(counts(),[1,2,1]);
});
test("L. concurrent same request with changed action conflicts",async()=>{
  seed();
  const results=await Promise.allSettled([moneyIn(),moneyOut()].map((input)=>asyncSql(query(input,fixtureContext()))));
  assert.equal(results.filter((r)=>r.status==="fulfilled").length,1);
  const rejected=results.find((r)=>r.status==="rejected");
  assert.match(rejected.reason.message,/\bCONFLICT\b/);
  assert.deepEqual(counts(),[1,2,1]);
});
test("M. concurrent private source occurrence commits exactly once without request ID",async()=>{
  seed(); const c=fixtureContext(); privateOpening(c);
  const results=await Promise.all(Array.from({length:4},()=>asyncSql(query(opening(),c)).then(JSON.parse)));
  assert.equal(new Set(results.map((r)=>r.event_id)).size,1);
  assert.deepEqual(counts(),[1,2,1]);
});
test("G. opposing transfers use consistent account locking order",async()=>{
  seed();
  const inputs=[transfer({request_id:uuid(660)}),transfer({request_id:uuid(661),account_id:ID.cash,destination_account_id:ID.bank})];
  const results=await Promise.all(inputs.map((input)=>asyncSql(query(input,fixtureContext()))));
  assert.equal(results.length,2); assert.deepEqual(counts(),[2,4,2]);
  assert.equal(sql("SELECT sum(amount_signed)::text FROM public.financial_postings WHERE account_id="+q(ID.bank)),"0.00000000");
});
test("S. built-in schema-qualified SHA-256 is available",()=>{
  assert.equal(sql("SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to('abc','UTF8')),'hex')"),"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
test("F0 isolation: no payments, obligations, transfers, or standing changes",()=>{
  seed();
  const before=sql("SELECT jsonb_agg(m ORDER BY m.id) FROM public.memberships m");
  command(moneyIn({member_id:ID.member,project_id:ID.project}),fixtureContext());
  command(moneyOut({request_id:uuid(670)}),fixtureContext());
  command(transfer({request_id:uuid(671)}),fixtureContext());
  assert.equal(sql("SELECT jsonb_build_array((SELECT count(*) FROM public.payments),(SELECT count(*) FROM public.contribution_obligations),(SELECT count(*) FROM public.member_transfers))"),"[0, 0, 0]");
  assert.equal(sql("SELECT jsonb_agg(m ORDER BY m.id) FROM public.memberships m"),before);
});

function holdIdentity(input) {
  let release;
  const ready = new Promise((resolve, reject) => {
    let output = "";
    const child = execFile("docker", ["exec","-i",container,"psql","-X","-U","postgres","-v","ON_ERROR_STOP=1","-Atq"],
      {encoding:"utf8"}, (error, _out, stderr) => {
        clearTimeout(timer);
        if(error) reject(new Error(stderr || error.message));
      });
    const timer=setTimeout(()=>{ child.stdin.end("ROLLBACK;"); reject(new Error("Identity holder did not become ready")); },15000);
    child.stdout.on("data",(data)=>{
      output+=data;
      if(output.includes("F3_LOCK_READY")) { clearTimeout(timer); resolve(); }
    });
    release=()=>new Promise((resolve,reject)=>{
      child.once("close",(code)=>code===0?resolve():reject(new Error("Identity holder failed")));
      child.stdin.end("COMMIT;");
    });
    child.stdin.write("BEGIN; SELECT financial_core.lock_f3_identity("+
      [input.group_id,input.request_id,"manual_finance",input.request_id,"manual_income"].map(q).join(",")+
      "); SELECT 'F3_LOCK_READY';\n");
  });
  return {ready,release:()=>release()};
}
test("O. authorization is rechecked after a retry waits on its identity lock",async()=>{
  seed(); const input=moneyIn(); command(input,fixtureContext()); const prior=history();
  const holder=holdIdentity(input); await holder.ready;
  let pending; let released=false;
  try {
    pending=asyncSql(query(input,fixtureContext())).then(
      (value)=>({value}), (error)=>({error}));
    let waiting=false;
    for(let i=0;i<30;i++) {
      if(sql("SELECT count(*) FROM pg_catalog.pg_locks WHERE locktype='advisory' AND NOT granted")!=="0") {
        waiting=true; break;
      }
      await new Promise((resolve)=>setTimeout(resolve,50));
    }
    assert.ok(waiting,"Retry must actually wait on the request identity lock");
    sql("DELETE FROM public.position_permissions WHERE position_id="+q(uuid(9201)));
    await holder.release(); released=true;
    const result=await pending;
    assert.match(result.error?.message || "",/\bDENY\b/);
    assert.equal(history(),prior); assert.deepEqual(counts(),[1,2,1]);
  } finally {
    if(!released) await holder.release();
    if(pending) await pending;
  }
});
test("M. an existing foundation event without a command snapshot fails closed",()=>{
  seed();
  const input=moneyIn(); const expected=evaluateCommand(input,fixtureContext());
  // Simulate a pre-command foundation fixture through the privileged test owner.
  sql("BEGIN; INSERT INTO public.financial_events(id,group_id,ledger_epoch_id,currency,event_class,"+
    "source_module,source_record_id,effect_kind,request_id,economic_payload_fingerprint,occurred_at) VALUES("+
    [uuid(9801),ID.group,ID.epoch,"USD","money_in","manual_finance",input.request_id,"manual_income",
      input.request_id,expected.fingerprint,input.occurred_at].map(q).join(",")+");"+
    "INSERT INTO public.financial_postings(event_id,group_id,ledger_epoch_id,currency,occurred_at,"+
    "amount_signed,control_class,account_id,fund_id,category_id,category_class) VALUES("+
    [uuid(9801),ID.group,ID.epoch,"USD",input.occurred_at,"500","custody",input.account_id,input.fund_id,null,null].map(q).join(",")+"),("+
    [uuid(9801),ID.group,ID.epoch,"USD",input.occurred_at,"-500","income",null,input.fund_id,input.category_id,"income"].map(q).join(",")+"); COMMIT;");
  const prior=history();
  assert.match(failure(query(input,fixtureContext())),/OCCURRENCE_INTEGRITY/);
  assert.equal(history(),prior); assert.deepEqual(counts(),[1,2,0]);
});
