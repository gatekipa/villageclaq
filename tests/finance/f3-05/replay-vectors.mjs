import { ID, TIME, uuid } from "./opening-vectors.mjs";
export const replayVectors = [
 {name:"identical",patch:{}},
 {name:"normalized amount",patch:{amount:"010000"}},
 {name:"equivalent timestamp",patch:{occurred_at:"2026-09-08T08:00:00-04:00"}},
 {name:"narrative first wins",patch:{provenance:{source_description:"Changed text"}}},
 {name:"evidence first wins",patch:{provenance:{source_description:"Changed text",source_at:TIME,reference_metadata:{reference:"NEW",evidence_ids:[uuid(851)]}}}},
 {name:"archive after post",patch:{},setup:c => {c.accounts[0].status="closed";c.accounts[0].closed_at=TIME;c.funds[0].status="inactive";}},
 {name:"another authorized actor",patch:{},setup:c => {c.actor_id=uuid(951);c.recorded_at="2026-09-11T00:00:00Z";}},
 {name:"new epoch does not rebind",patch:{},setup:c => {c.epochs[0].effective_to="2026-09-09T00:00:00Z";}},
 ...[
  ["amount",{amount:"10001"}],["fund",{fund_id:ID.restricted}],["account",{account_id:ID.cash}],
  ["date",{occurred_at:"2026-09-09T12:00:00Z"}],["currency",{currency:"EUR"}],
  ["provenance",{opening_provenance_id:uuid(802)}],
 ].map(([name,patch]) => ({name:"changed "+name,patch,error:"CONFLICT"})),
 {name:"revoked before retry",patch:{},error:"DENY",setup:c => c.authorized=false},
 {name:"revoked while waiting",patch:{},error:"DENY",setup:c => c.authorized_after_locks=false},
 {name:"lost provenance binding",patch:{},error:"PROVENANCE_INTEGRITY",setup:c => c.provenances=[]},
 {name:"corrupt economic binding",patch:{},error:"OCCURRENCE_INTEGRITY",setup:c => c.existing[0].fingerprint="bad"},
 {name:"duplicate occurrence",patch:{},error:"OCCURRENCE_INTEGRITY",setup:c => c.existing.push(structuredClone(c.existing[0]))},
];
