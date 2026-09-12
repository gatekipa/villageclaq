// Independent commands and literal expected outcomes. No correction-oracle imports.
import { fixtureContext, ID, uuid } from "../f3-02/vectors.mjs";
export { ID, uuid };
export const JAN = "2026-01-10T12:00:00.000000Z";
export const FEB = "2026-02-05T12:00:00.000000Z";
export const AUDIT = "2026-02-20T18:30:00.000000Z";
export const RID = uuid(1601), ACTOR = uuid(1701), ORIGINAL_ACTOR = uuid(1702);
export function context() {
  const c = fixtureContext();
  c.epochs[0].effective_to = "2026-07-01T00:00:00Z";
  c.epochs.push({id:ID.futureEpoch,group_id:ID.group,currency:"XAF",effective_from:"2026-07-01T00:00:00Z",effective_to:null});
  c.accounts.push({id:uuid(110),group_id:ID.group,currency:"XAF",status:"active",opened_at:"2026-07-01T00:00:00Z",opened_ledger_epoch_id:ID.futureEpoch},
    {...c.accounts[0],id:uuid(111)});
  c.categories.push({id:uuid(310),group_id:ID.group,category_class:"income",status:"active"});
  return {...c,authorized_after_locks:true,actor_id:ACTOR,corrected_at:AUDIT,events:[],manual_occurrences:[],completed:[]};
}
export const command = (patch={}) => ({group_id:ID.group,correction_request_id:RID,
  target_event_id:ID.event,intent:"CORRECT",correction_reason:"Correct recorded amount",replacement:{amount:"450"},...patch});
const leg = (control, amount, account=null, category=null) => [control,amount,account,category];
export const IN450 = [leg("custody","450.00",ID.bank),leg("income","-450.00",null,ID.donation)];
export const validVectors = [
  {name:"Money In 500 to 450",expected:IN450},
  {name:"Money Out 200 to 175",action:"money_out",delta:{amount:"175"},
    expected:[leg("expense","175.00",null,ID.venue),leg("custody","-175.00",ID.bank)]},
  {name:"Transfer 1000 to 900",action:"transfer",delta:{amount:"900"},
    expected:[leg("custody","-900.00",ID.bank),leg("custody","900.00",ID.cash)]},
  ...["money_in","money_out","transfer"].map(action=>({name:action+" REVERSE",action,intent:"REVERSE",expected:[]})),
  {name:"change fund",delta:{amount:"450",fund_id:ID.general},fund:ID.general,expected:IN450},
  {name:"change category",delta:{amount:"450",category_id:uuid(310)},
    expected:[leg("custody","450.00",ID.bank),leg("income","-450.00",null,uuid(310))]},
  {name:"change account",delta:{amount:"450",account_id:ID.cash},
    expected:[leg("custody","450.00",ID.cash),leg("income","-450.00",null,ID.donation)]},
  {name:"change transfer destination",action:"transfer",delta:{amount:"900",destination_account_id:uuid(111)},
    expected:[leg("custody","-900.00",ID.bank),leg("custody","900.00",uuid(111))]},
  {name:"change transfer source",action:"transfer",delta:{amount:"900",account_id:uuid(111)},
    expected:[leg("custody","-900.00",uuid(111)),leg("custody","900.00",ID.cash)]},
  {name:"move date within January",delta:{amount:"450",occurred_at:"2026-01-15T12:00:00Z"},
    time:"2026-01-15T12:00:00.000000Z",expected:IN450},
  {name:"move date January to February",delta:{amount:"500",occurred_at:FEB},time:FEB,
    expected:[leg("custody","500.00",ID.bank),leg("income","-500.00",null,ID.donation)]},
  {name:"add member",delta:{amount:"450",member_id:ID.member},member:ID.member,expected:IN450},
  {name:"add project",delta:{amount:"450",project_id:ID.project},project:ID.project,expected:IN450},
  {name:"clear attribution",original:{member_id:ID.member,project_id:ID.project},
    delta:{amount:"450",member_id:null,project_id:null},expected:IN450},
  {name:"retain attribution",original:{member_id:ID.member,project_id:ID.project},
    member:ID.member,project:ID.project,expected:IN450},
  {name:"retained archived account category fund",setup:c=>{
    c.accounts[0].status="closed";c.categories[0].status="archived";c.funds[1].status="inactive";
  },expected:IN450},
  {name:"retained archived transfer endpoints",action:"transfer",delta:{amount:"900"},
    setup:c=>{c.accounts[0].status="closed";c.accounts[1].status="inactive";},
    expected:[leg("custody","-900.00",ID.bank),leg("custody","900.00",ID.cash)]},
  {name:"new default never replaces omitted fund",setup:c=>{c.funds[0].is_default=false;c.funds[1].is_default=true;},
    expected:IN450},
  {name:"explicit historical archived same ID",delta:{amount:"450",account_id:ID.bank,category_id:ID.donation},
    setup:c=>{c.accounts[0].status="closed";c.categories[0].status="archived";},expected:IN450},
  {name:"description and reference snapshot",delta:{amount:"450",description:"Correct narrative",
    reference_metadata:{reference:"Invoice B",evidence_ids:[uuid(1901)]}},expected:IN450},
  {name:"microsecond date normalization",delta:{amount:"450",occurred_at:"2026-01-10T07:00:00.123456-05:00"},
    time:"2026-01-10T12:00:00.123456Z",expected:IN450},
  {name:"money beyond Number precision",delta:{amount:"9007199254740993.01"},
    expected:[leg("custody","9007199254740993.01",ID.bank),leg("income","-9007199254740993.01",null,ID.donation)]},
  {name:"XAF integer correction",xaf:true,delta:{amount:"450"},expected:
    [leg("custody","450",ID.xafBank),leg("income","-450",null,ID.xafIncome)]},
  {name:"XAF exact reverse",xaf:true,intent:"REVERSE",expected:[]},
  {name:"metadata only restatement",delta:{description:"Correct receipt reference"},
    expected:[leg("custody","500.00",ID.bank),leg("income","-500.00",null,ID.donation)]},
  {name:"reverse with no current configuration",intent:"REVERSE",setup:c=>{
    c.epochs=[];c.accounts=[];c.funds=[];c.categories=[];c.members=[];c.projects=[];
  },expected:[]},
];
const neg = (name,delta,code,extra={}) => ({name,delta,code,...extra});
export const negativeVectors = [
  ...[null,""," ","\t\n","ab","x".repeat(1001),42].map((reason,i)=>({
    name:"invalid reason "+i,input:{correction_reason:reason},code:typeof reason!=="string"?"REASON_REQUIRED":"REASON_LENGTH"})),
  {name:"absent reason",remove:"correction_reason",code:"REASON_REQUIRED"},
  {name:"NUL reason",input:{correction_reason:"bad\0reason"},code:"INVALID_REASON"},
  {name:"invisible reason",input:{correction_reason:"\u200B\u200B\u200B"},code:"INVALID_REASON"},
  {name:"invalid target",input:{target_event_id:uuid(9999)},code:"TARGET_NOT_FOUND"},
  {name:"cross group target",input:{group_id:ID.otherGroup},code:"TARGET_NOT_FOUND"},
  {name:"unbound manual UUID",setup:c=>{c.manual_occurrences=[];},code:"TARGET_NOT_MANUAL"},
  ...["dues","fines","loans","njangi","relief","projects","opening_finance","importer","cutover","future_subledger"].map(source=>({
    name:"non-manual "+source,setup:(c,t)=>{t.source_module=source;},code:"TARGET_NOT_MANUAL"})),
  {name:"opening event class",setup:(c,t)=>{t.event_class="opening_adjustment";},code:"TARGET_NOT_MANUAL"},
  {name:"corrected stale target",terminal:"CORRECT",code:"TARGET_ALREADY_CORRECTED"},
  {name:"reversed stale target",terminal:"REVERSE",code:"TARGET_ALREADY_CORRECTED"},
  {name:"reversal target",targetReversal:true,code:"REVERSAL_TARGET_PROHIBITED"},
  neg("zero amount",{amount:"0"},"AMOUNT_NOT_POSITIVE"),
  neg("negative amount",{amount:"-5"},"AMOUNT_NOT_POSITIVE"),
  neg("Number amount",{amount:450},"INVALID_AMOUNT"),
  neg("exponent amount",{amount:"4.5e2"},"INVALID_AMOUNT"),
  neg("precision amount",{amount:"450.001"},"AMOUNT_PRECISION"),
  neg("overflow amount",{amount:"10000000000000000000000"},"AMOUNT_RANGE"),
  neg("null amount",{amount:null},"INVALID_AMOUNT"),
  neg("wrong category class",{category_id:ID.venue},"CATEGORY_CLASS_MISMATCH"),
  neg("missing income category",{category_id:null},"CATEGORY_REQUIRED"),
  neg("invalid account",{account_id:uuid(9999)},"ACCOUNT_NOT_FOUND"),
  neg("null account",{account_id:null},"ACCOUNT_REQUIRED"),
  neg("cross group account",{account_id:ID.otherBank},"CROSS_GROUP_DIMENSION"),
  neg("cross group fund",{fund_id:ID.otherFund},"CROSS_GROUP_DIMENSION"),
  neg("null fund",{fund_id:null},"FUND_REQUIRED"),
  neg("invalid fund",{fund_id:uuid(9999)},"FUND_NOT_FOUND"),
  neg("cross group member",{member_id:ID.otherMember},"CROSS_GROUP_DIMENSION"),
  neg("cross group project",{project_id:ID.otherProject},"CROSS_GROUP_DIMENSION"),
  neg("different currency assertion",{currency:"XAF"},"CROSS_CURRENCY_REPLACEMENT"),
  neg("different currency account",{account_id:uuid(110)},"CROSS_CURRENCY_REPLACEMENT"),
  neg("date outside epochs",{occurred_at:"2025-12-31T00:00:00Z"},"EPOCH_NOT_FOUND"),
  neg("cross epoch XAF date",{occurred_at:"2026-07-01T00:00:00Z"},"CROSS_EPOCH_REPLACEMENT"),
  neg("cross epoch same currency",{occurred_at:"2026-07-01T00:00:00Z"},"CROSS_EPOCH_REPLACEMENT",
    {setup:c=>{c.epochs.at(-1).currency="USD";}}),
  neg("invalid calendar",{occurred_at:"2026-02-30T00:00:00Z"},"INVALID_OCCURRED_AT"),
  neg("local date",{occurred_at:"2026-01-10"},"INVALID_OCCURRED_AT"),
  neg("new archived account",{account_id:ID.cash},"ACCOUNT_INACTIVE",{setup:c=>{c.accounts[1].status="closed";}}),
  neg("new archived category",{category_id:uuid(310)},"CATEGORY_INACTIVE",{setup:c=>{c.categories.at(-1).status="archived";}}),
  neg("new archived fund",{fund_id:ID.general},"FUND_INACTIVE",{setup:c=>{c.funds[0].status="inactive";}}),
  neg("retained missing account",{},"ACCOUNT_NOT_FOUND",{setup:c=>{c.accounts=c.accounts.filter(a=>a.id!==ID.bank);}}),
  neg("account not open at corrected date",{account_id:ID.cash},"ACCOUNT_EPOCH_INCOMPATIBLE",
    {setup:c=>{c.accounts[1].opened_at="2026-02-01T00:00:00Z";}}),
  ...[["money_in","money_out"],["money_in","transfer"],["transfer","money_out"]].map(([action,to])=>
    neg(action+" to "+to,{action:to},"ACTION_CHANGE_PROHIBITED",{action})),
  neg("transfer category",{category_id:ID.donation},"CATEGORY_PROHIBITED",{action:"transfer"}),
  neg("transfer attribution",{member_id:ID.member},"ATTRIBUTION_PROHIBITED",{action:"transfer"}),
  neg("same transfer endpoints",{destination_account_id:ID.bank},"SAME_ACCOUNT",{action:"transfer"}),
  neg("missing transfer destination",{destination_account_id:null},"DESTINATION_REQUIRED",{action:"transfer"}),
  neg("expense blank description",{description:" "},"DESCRIPTION_REQUIRED",{action:"money_out"}),
  neg("bad metadata",{reference_metadata:[]},"INVALID_INPUT"),
  {name:"unauthorized",setup:c=>{c.authorized=false;},code:"DENY"},
  {name:"revoked while waiting",setup:c=>{c.authorized_after_locks=false;},code:"DENY"},
  {name:"actor missing",setup:c=>{c.actor_id=null;},code:"DENY"},
  {name:"request UUID invalid",input:{correction_request_id:"not-a-uuid"},code:"INVALID_UUID"},
  {name:"reuse manual request",input:{correction_request_id:ID.request},code:"REQUEST_ID_REUSED"},
  {name:"invalid intent",input:{intent:"EDIT"},code:"INVALID_INTENT"},
  {name:"correct missing replacement",remove:"replacement",code:"REPLACEMENT_REQUIRED"},
  {name:"reverse with replacement",input:{intent:"REVERSE"},code:"REPLACEMENT_PROHIBITED"},
  ...["source_module","source_record_id","effect_kind","category_class","postings","created_by","status",
    "ledger_epoch_id","fingerprint","replacement_event_id"].map(field=>neg("caller authority "+field,{[field]:null},"UNSUPPORTED_FIELD")),
];
