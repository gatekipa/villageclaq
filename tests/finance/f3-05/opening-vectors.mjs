// Literal fixtures/expectations. No oracle imports.
import { fixtureContext, ID, TIME, uuid } from "../f3-02/vectors.mjs";
export { ID, TIME, uuid };
export const ACTOR = uuid(950);
export function context() {
  const c = fixtureContext();
  c.authorized_after_locks = true; c.actor_id = ACTOR; c.recorded_at = "2026-09-10T14:00:00Z";
  c.provenances = [];
  c.accounts.forEach(a => { a.kind = [ID.cash,ID.xafCash].includes(a.id) ? "cash" : "bank"; a.closed_at = null; });
  return c;
}
export const command = (patch = {}) => ({ group_id:ID.group, opening_occurrence_id:ID.opening,
  opening_provenance_id:ID.provenance, provenance:{source_description:"Opening bank statement",
    source_at:"2026-09-01T00:00:00Z", reference_metadata:{reference:"STMT-001",evidence_ids:[uuid(850)]}},
  account_id:ID.bank, fund_id:ID.general, amount:"10000.00", occurred_at:TIME, ...patch });
export const xaf = {group_id:ID.xafGroup,account_id:ID.xafBank,fund_id:ID.xafFund,currency:"XAF",amount:"2500000"};
const v = (name, patch, amount, account = ID.bank, fund = ID.general, currency = "USD") =>
  ({name,input:command(patch),expected:{amount,account,fund,currency}});
export const validVectors = [
  v("USD Bank General",{},"10000.00"),
  v("USD Cash General",{account_id:ID.cash},"10000.00",ID.cash),
  v("USD restricted",{fund_id:ID.restricted,amount:"2000"},"2000.00",ID.bank,ID.restricted),
  v("XAF bank",xaf,"2500000",ID.xafBank,ID.xafFund,"XAF"),
  v("XAF cash",{...xaf,account_id:ID.xafCash},"2500000",ID.xafCash,ID.xafFund,"XAF"),
  v("explicit nondefault fund",{fund_id:ID.restricted},"10000.00",ID.bank,ID.restricted),
  v("derived currency",{},"10000.00"),
  v("bounded lowercase assertion",{currency:"usd"},"10000.00"),
  v("minimum USD",{amount:"0.01"},"0.01"),
  v("minimum XAF",{...xaf,amount:"1"},"1",ID.xafBank,ID.xafFund,"XAF"),
  v("beyond float precision",{amount:"9007199254740993.01"},"9007199254740993.01"),
  v("numeric upper limit",{amount:"9999999999999999999999.99"},"9999999999999999999999.99"),
  v("leading zero normalization",{amount:"00010000"},"10000.00"),
  v("timestamp offset",{occurred_at:"2026-09-08T08:00:00-04:00"},"10000.00"),
  v("microsecond time",{occurred_at:"2026-09-08T12:00:00.123456Z"},"10000.00"),
  v("minimal provenance",{provenance:{source_description:"Physical cash count"}},"10000.00"),
  v("independent occurrence",{opening_occurrence_id:uuid(702)},"10000.00"),
  v("account opened exactly at opening",{},"10000.00"),
  v("epoch starts exactly at opening",{},"10000.00"),
];
validVectors[17].setup = c => { c.accounts[0].opened_at = TIME; };
validVectors[18].setup = c => { c.epochs[0].effective_from = TIME; };
const n = (name, patch, error, setup) => ({name,input:command(patch),error,setup});
export const negativeVectors = [
  n("zero",{amount:"0"},"AMOUNT_NOT_POSITIVE"),
  n("negative",{amount:"-1"},"AMOUNT_NOT_POSITIVE"),
  n("fractional XAF",{...xaf,amount:"1.1"},"AMOUNT_PRECISION"),
  n("XAF decimal zero",{...xaf,amount:"1.0"},"AMOUNT_PRECISION"),
  n("invalid decimal",{amount:"1e4"},"INVALID_AMOUNT"),
  n("JS number",{amount:10000},"INVALID_AMOUNT"),
  n("overflow",{amount:"10000000000000000000000"},"AMOUNT_RANGE"),
  n("USD precision",{amount:"1.001"},"AMOUNT_PRECISION"),
  n("cross-group account",{account_id:ID.otherBank},"CROSS_GROUP_DIMENSION"),
  n("cross-group fund",{fund_id:ID.otherFund},"CROSS_GROUP_DIMENSION"),
  n("cross-group provenance",{},"CROSS_GROUP_PROVENANCE",c => c.provenances.push({id:ID.provenance,group_id:ID.otherGroup})),
  n("inactive account",{},"ACCOUNT_INACTIVE",c => c.accounts[0].status="inactive"),
  n("closed account",{},"ACCOUNT_INACTIVE",c => c.accounts[0].status="closed"),
  n("closed timestamp with active status",{},"ACCOUNT_CLOSED",c => c.accounts[0].closed_at=TIME),
  n("inactive fund",{},"FUND_INACTIVE",c => c.funds[0].status="inactive"),
  ...["category_id","member_id","project_id","contribution_type_id","dues_obligation_id",
    "payment_id","request_id","action","source_module","source_record_id","effect_kind",
    "ledger_epoch_id","created_by","recorded_at","postings","destination_account_id"].map(k =>
    n("deny caller field "+k,{[k]:null},"UNSUPPORTED_FIELD")),
  n("no epoch",{},"EPOCH_NOT_FOUND",c => c.epochs=[]),
  n("overlap",{},"EPOCH_AMBIGUOUS",c => c.epochs.push({...c.epochs[0],id:uuid(25)})),
  n("epoch exclusive end",{},"EPOCH_NOT_FOUND",c => c.epochs[0].effective_to=TIME),
  n("cross-group opened epoch",{},"ACCOUNT_EPOCH_INCOMPATIBLE",c => c.accounts[0].opened_ledger_epoch_id=ID.otherEpoch),
  n("account not yet opened",{},"ACCOUNT_EPOCH_INCOMPATIBLE",c => c.accounts[0].opened_at="2026-10-01T00:00:00Z"),
  n("wrong epoch currency",{},"EPOCH_CURRENCY_MISMATCH",c => c.epochs[0].currency="XAF"),
  n("wrong asserted currency",{currency:"XAF"},"CURRENCY_MISMATCH"),
  n("null currency",{currency:null},"UNSUPPORTED_CURRENCY"),
  n("invalid date",{occurred_at:"2026-02-30T00:00:00Z"},"INVALID_OCCURRED_AT"),
  n("missing provenance",{provenance:undefined},"INVALID_INPUT"),
  n("null provenance",{provenance:null},"INVALID_INPUT"),
  n("empty provenance",{provenance:{}},"INVALID_PROVENANCE"),
  n("blank provenance",{provenance:{source_description:"  "}},"INVALID_PROVENANCE"),
  n("oversized provenance",{provenance:{source_description:"x".repeat(1001)}},"INVALID_PROVENANCE"),
  n("spoof provenance group",{provenance:{source_description:"statement",group_id:ID.otherGroup}},"UNSUPPORTED_FIELD"),
  n("spoof provenance actor",{provenance:{source_description:"statement",recorded_by:ACTOR}},"UNSUPPORTED_FIELD"),
  n("invalid provenance UUID",{opening_provenance_id:"invalid"},"INVALID_UUID"),
  n("invalid occurrence UUID",{opening_occurrence_id:"invalid"},"INVALID_UUID"),
  n("invalid evidence",{provenance:{source_description:"statement",reference_metadata:{evidence_ids:["bad"]}}},"INVALID_UUID"),
  n("too many evidence references",{provenance:{source_description:"statement",reference_metadata:{evidence_ids:Array(21).fill(uuid(850))}}},"INVALID_PROVENANCE"),
  n("invalid source date",{provenance:{source_description:"statement",source_at:"yesterday"}},"INVALID_OCCURRED_AT"),
  n("missing fund",{fund_id:null},"INVALID_UUID"),
  n("missing account",{account_id:uuid(9999)},"ACCOUNT_NOT_FOUND"),
  n("nonexistent fund",{fund_id:uuid(9999)},"FUND_NOT_FOUND"),
  ...["mobile_money","wallet","other","receivable"].map(kind =>
    n("kind "+kind,{},"ACCOUNT_KIND_NOT_ALLOWED",c => c.accounts[0].kind=kind)),
  n("unauthorized",{},"DENY",c => c.authorized=false),
  n("authority revoked after wait",{},"DENY",c => c.authorized_after_locks=false),
  n("duplicate provenance rows",{},"PROVENANCE_INTEGRITY",c => c.provenances=[{id:ID.provenance},{id:ID.provenance}]),
];
export const scenarios = [
 {name:"General foundation",entries:[command()],accounts:[[ID.bank,"10000.00"]],funds:[[ID.general,"10000.00"]],total:"10000.00"},
 {name:"Restricted split",entries:[command({amount:"8000"}),command({amount:"2000",fund_id:ID.restricted,opening_occurrence_id:uuid(702)})],
  accounts:[[ID.bank,"10000.00"]],funds:[[ID.general,"8000.00"],[ID.restricted,"2000.00"]],total:"10000.00"},
 {name:"Bank plus Cash",entries:[command({amount:"9000"}),command({amount:"1000",account_id:ID.cash,opening_occurrence_id:uuid(702)})],
  accounts:[[ID.bank,"9000.00"],[ID.cash,"1000.00"]],funds:[[ID.general,"10000.00"]],total:"10000.00"},
 {name:"Shared statement three occurrences",entries:[command({amount:"8000"}),command({amount:"2000",fund_id:ID.restricted,opening_occurrence_id:uuid(702)}),
  command({amount:"1000",account_id:ID.cash,opening_occurrence_id:uuid(703)})],
  accounts:[[ID.bank,"10000.00"],[ID.cash,"1000.00"]],funds:[[ID.general,"9000.00"],[ID.restricted,"2000.00"]],total:"11000.00"},
];
