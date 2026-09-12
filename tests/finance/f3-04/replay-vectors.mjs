// Replay mutations and decisions independent of the correction oracle.
import { ID, RID, uuid } from "./correction-vectors.mjs";
export const replayVectors = [
  {name:"tampered saved child",setup:c=>{c.completed[0].result.reversal.postings[0].amount_signed="-499.00";},code:"REPLAY_INTEGRITY"},
  {name:"changed action conflicts",delta:{action:"money_out"},code:"CONFLICT"},
  {name:"changed currency conflicts",delta:{currency:"XAF",amount:"450"},code:"CONFLICT"},
  {name:"identical completed retry",decision:"IDEMPOTENT_RETURN_EXISTING"},
  {name:"equivalent decimal",delta:{amount:"0450.0"},decision:"IDEMPOTENT_RETURN_EXISTING"},
  {name:"equivalent UTC",delta:{occurred_at:"2026-01-10T07:00:00-05:00"},decision:"IDEMPOTENT_RETURN_EXISTING"},
  {name:"equivalent UUID case",input:{correction_request_id:RID.toUpperCase()},decision:"IDEMPOTENT_RETURN_EXISTING"},
  {name:"normalized reason",input:{correction_reason:"  Correct\trecorded\namount  "},decision:"IDEMPOTENT_RETURN_EXISTING"},
  {name:"narrative excluded",delta:{description:"Changed on retry",reference_metadata:{reference:"Another"}},
    decision:"IDEMPOTENT_RETURN_EXISTING"},
  {name:"retry after archive and defaults change",setup:c=>{
    c.accounts.forEach(a=>{a.status="closed";});c.funds.forEach(f=>{f.status="inactive";f.is_default=false;});
    c.categories.forEach(a=>{a.status="archived";});
  },decision:"IDEMPOTENT_RETURN_EXISTING"},
  {name:"retry without current catalogs",setup:c=>{c.accounts=[];c.funds=[];c.categories=[];c.epochs=[];c.members=[];c.projects=[];},
    decision:"IDEMPOTENT_RETURN_EXISTING"},
  {name:"retry actor changed but authorized",setup:c=>{c.actor_id=uuid(1777);},decision:"IDEMPOTENT_RETURN_EXISTING"},
  {name:"changed amount conflicts",delta:{amount:"451"},code:"CONFLICT"},
  {name:"changed reason conflicts",input:{correction_reason:"Different reason"},code:"CONFLICT"},
  {name:"changed date conflicts",delta:{occurred_at:"2026-01-11T12:00:00Z"},code:"CONFLICT"},
  {name:"changed account conflicts",delta:{account_id:ID.cash},code:"CONFLICT"},
  {name:"changed fund conflicts",delta:{fund_id:ID.general},code:"CONFLICT"},
  {name:"changed category conflicts",delta:{category_id:uuid(310)},code:"CONFLICT"},
  {name:"changed member conflicts",delta:{member_id:ID.member},code:"CONFLICT"},
  {name:"changed project conflicts",delta:{project_id:ID.project},code:"CONFLICT"},
  {name:"changed target conflicts",input:{target_event_id:uuid(1999)},code:"CONFLICT"},
  {name:"changed intent conflicts",input:{intent:"REVERSE",replacement:null},code:"CONFLICT"},
  {name:"unauthorized retry",setup:c=>{c.authorized=false;},code:"DENY"},
  {name:"permission revoked at lock retry",setup:c=>{c.authorized_after_locks=false;},code:"DENY"},
  {name:"tampered replay binding",setup:c=>{c.completed[0].fingerprint="0".repeat(64);},code:"REPLAY_INTEGRITY"},
  {name:"duplicate request binding",setup:c=>{c.completed.push(structuredClone(c.completed[0]));},code:"REPLAY_INTEGRITY"},
];
export const concurrencyVectors = [
  {name:"same request same payload",sameRequest:true,expected:["READY","IDEMPOTENT_RETURN_EXISTING"]},
  {name:"same request different payload",sameRequest:true,secondAmount:"449",expected:["READY","CONFLICT"]},
  {name:"same target different requests",expected:["READY","TARGET_ALREADY_CORRECTED"]},
  {name:"same target correct versus reverse",secondIntent:"REVERSE",expected:["READY","TARGET_ALREADY_CORRECTED"]},
  {name:"same target reverse versus correct",firstIntent:"REVERSE",expected:["READY","TARGET_ALREADY_CORRECTED"]},
  {name:"same request different target",sameRequest:true,secondTarget:uuid(1999),expected:["READY","CONFLICT"]},
];
