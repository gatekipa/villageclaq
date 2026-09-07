import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { computeMoneyFiguresByCurrency } from "../src/lib/money.ts";

const read = path => readFileSync(new URL("../"+path,import.meta.url),"utf8");
const packageSql=read("scripts/legacy-xaf-remediation.sql");
const phaseA=read("supabase/migrations/20260906140228_financial_ledger_epochs_expand.sql");
const phaseB=read("supabase/migrations/20260906140229_financial_payment_integrity.sql");

test("package is exact, transaction-wrapped, fail-closed and non-destructive",()=>{
  assert.match(packageSql,/BEGIN;[\s\S]*COMMIT;/);
  assert.match(packageSql,/eaf89185-3dc0-4d92-8d4d-97bc976a211e/);
  assert.match(packageSql,/40dbed40-fadb-4e85-9e45-dc7ea8b5a731/);
  assert.match(packageSql,/ACTIVE_GROUP_ADMIN_REQUIRED/);
  assert.match(packageSql,/REMEDIATION_MUST_PRECEDE_PHASE_B/);
  assert.match(packageSql,/EXPECTED_CONFLICT_INVENTORY_MISMATCH/);
  assert.doesNotMatch(packageSql,/\bDELETE\s+FROM\s+public\.(payments|contribution_obligations|contribution_types)/i);
});

test("payments, obligations and test type use existing terminal semantics",()=>{
  assert.match(packageSql,/UPDATE public\.payments SET status='rejected'/);
  assert.match(packageSql,/SET status='waived',waived_by=v_actor,waived_at=v_at/);
  assert.match(packageSql,/UPDATE public\.contribution_types SET is_active=false/);
  assert.match(packageSql,/md5\(receipt_url\)/);
  assert.match(packageSql,/recalculate_membership_standing/);
});

test("Phase A inventory excludes only registered rows in safe terminal states",()=>{
  assert.match(phaseA,/CREATE TABLE financial_private\.legacy_financial_neutralizations/);
  assert.match(phaseA,/FORCE ROW LEVEL SECURITY/);
  assert.match(phaseA,/n\.record_type='contribution_type'[\s\S]*t\.is_active=false/);
  assert.match(phaseA,/n\.record_type='obligation'[\s\S]*o\.status='waived'/);
  assert.match(phaseA,/n\.record_type='payment'[\s\S]*p\.status='rejected'/);
});

test("Phase B scopes legitimate USD while retaining neutralized XAF without an epoch",()=>{
  assert.match(phaseB,/current-currency rows only/);
  assert.match(phaseB,/UNSCOPED_AUTHORITATIVE_FINANCIAL_ROW/);
  assert.match(phaseB,/guard_neutralized_legacy_evidence/);
  assert.doesNotMatch(phaseB,/ALTER COLUMN ledger_epoch_id SET NOT NULL/);
  assert.match(phaseB,/FOREIGN KEY\(ledger_epoch_id,group_id,currency\)/);
});

test("authoritative money scope ignores waived and rejected historical evidence",()=>{
  const obligations=[
    {id:"legacy-o",group_id:"g",membership_id:"m",amount:100000,currency:"XAF",status:"waived",ledger_epoch_id:null},
    {id:"usd-o",group_id:"g",membership_id:"m",amount:100,currency:"USD",status:"pending",ledger_epoch_id:"usd-e"},
  ];
  const payments=[
    {id:"legacy-p",group_id:"g",membership_id:"m",amount:82000,currency:"XAF",status:"rejected",ledger_epoch_id:null},
  ];
  assert.deepEqual(computeMoneyFiguresByCurrency(obligations,payments),[{
    currency:"USD",expected:100,collected:0,outstanding:100,unallocatedCredit:0,waivedTotal:0,
    pending:{count:0,amount:0},overdue:{amount:0,memberCount:0},membersOwing:1,
  }]);
});
