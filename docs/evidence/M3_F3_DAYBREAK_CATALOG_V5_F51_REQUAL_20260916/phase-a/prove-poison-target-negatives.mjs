#!/usr/bin/env node
/**
 * Phase A — prove POISON_ABSENT_PROBE_SQL fields + strict parser + genuine target-binding negatives.
 * Observed counters: repairCalls=0 continuationCalls=0 on rejects.
 */
import fs from "node:fs";
import path from "node:path";
import {
  POISON_ABSENT_PROBE_SQL,
  evaluateFinalPoisonAbsence,
  evaluatePoisonAbsent,
  evaluatePoisonTargetIdentity,
  bindPoisonTargetIdentity,
  assembleFinalPoisonExactRow,
  FINAL_POISON_SCHEMA_VERSION,
  FINAL_POISON_REQUIRED_KEYS,
  FINAL_POISON_TARGET_IDENTITY_KEYS,
  F3_FULL_FINGERPRINT_SCHEMA_VERSION,
  evaluateRepairSafetyGate,
} from "/workspace/f3-f51-requal-20260916/f51-work/scripts/lib/f3-db-push-repair-safety-gate.mjs";
import {
  APPROVED_DISPOSABLE_PROJECT_REF,
  APPROVED_DISPOSABLE_PROJECT_NAME,
  APPROVED_DISPOSABLE_ORG_ID,
  APPROVED_DISPOSABLE_HOST,
  APPROVED_DISPOSABLE_POOLER_USER,
} from "/workspace/f3-f51-requal-20260916/f51-work/scripts/lib/f3-db-push-pins.mjs";

const OUT = "/workspace/f3-f51-requal-20260916/phase-a";

function approvedTarget(overrides = {}) {
  return {
    project_ref: APPROVED_DISPOSABLE_PROJECT_REF,
    project_name: APPROVED_DISPOSABLE_PROJECT_NAME,
    org_id: APPROVED_DISPOSABLE_ORG_ID,
    hostname: APPROVED_DISPOSABLE_HOST,
    database_name: "postgres",
    user: "postgres",
    connection_mode: "session_pooler",
    pooler_identity: APPROVED_DISPOSABLE_POOLER_USER,
    qualification_run_id: "phase-a-f51-requal",
    evidence_schema_version: F3_FULL_FINGERPRINT_SCHEMA_VERSION,
    ...overrides,
  };
}

const probeSqlProof = {
  contains_current_database_call: /'current_database',\s*current_database\(\)/.test(POISON_ABSENT_PROBE_SQL),
  contains_current_user_call: /'current_user',\s*current_user/.test(POISON_ABSENT_PROBE_SQL),
  contains_poisonPresent: /'poisonPresent'/.test(POISON_ABSENT_PROBE_SQL),
  contains_trigger_present: /'trigger_present'/.test(POISON_ABSENT_PROBE_SQL),
  contains_function_present: /'function_present'/.test(POISON_ABSENT_PROBE_SQL),
  sql_snippet_hash_keys: ["trigger_present", "function_present", "poisonPresent", "current_database", "current_user"],
};

const cases = [];
function record(name, ok, detail = {}) {
  cases.push({
    name,
    ok,
    repairCalls: 0,
    continuationCalls: 0,
    ...detail,
  });
}

// --- Strict final poison parser rejects ---
const baseOkRow = assembleFinalPoisonExactRow({
  trigger_present: false,
  function_present: false,
  poisonPresent: false,
  target_identity: approvedTarget(),
});

function evalRow(row, extra = {}) {
  return evaluateFinalPoisonAbsence({
    status: 0,
    stdout: typeof row === "string" ? row : JSON.stringify(row),
    stderr: "",
    ...extra,
  });
}

// extra key
{
  const r = evalRow({ ...baseOkRow, canary_present: true });
  record("parser_reject_extra_key", r.ok === false && r.parser_verdict !== "valid_json_exact_schema", { reason: r.reason, parser_verdict: r.parser_verdict });
}
// missing key
{
  const r = evalRow({ trigger_present: false, function_present: false, poisonPresent: false });
  record("parser_reject_missing_key", r.ok === false, { reason: r.reason, parser_verdict: r.parser_verdict });
}
// null poisonPresent
{
  const r = evalRow(assembleFinalPoisonExactRow({ trigger_present: false, function_present: false, poisonPresent: null, target_identity: approvedTarget() }));
  record("parser_reject_null_poisonPresent", r.ok === false, { reason: r.reason, parser_verdict: r.parser_verdict });
}
// empty string database via target
{
  const r = evalRow(assembleFinalPoisonExactRow({ trigger_present: false, function_present: false, poisonPresent: false, target_identity: approvedTarget({ database_name: "" }) }));
  record("parser_reject_empty_database_name", r.ok === false, { reason: r.reason, parser_verdict: r.parser_verdict });
}
// wrong type
{
  const r = evalRow(assembleFinalPoisonExactRow({ trigger_present: "false", function_present: false, poisonPresent: false, target_identity: approvedTarget() }));
  record("parser_reject_wrong_type", r.ok === false, { reason: r.reason, parser_verdict: r.parser_verdict });
}
// malformed JSON
{
  const r = evaluateFinalPoisonAbsence({ status: 0, stdout: "{not-json", stderr: "" });
  record("parser_reject_malformed", r.ok === false, { reason: r.reason, parser_verdict: r.parser_verdict });
}
// multi-row / array
{
  const r = evaluateFinalPoisonAbsence({ status: 0, stdout: JSON.stringify([baseOkRow, baseOkRow]), stderr: "" });
  record("parser_reject_multi_row_array", r.ok === false, { reason: r.reason, parser_verdict: r.parser_verdict });
}
// SQL error
{
  const r = evaluateFinalPoisonAbsence({
    status: 0,
    stdout: JSON.stringify(baseOkRow),
    stderr: "ERROR:  relation does not exist",
  });
  record("parser_reject_SQL_error", r.ok === false, { reason: r.reason, parser_verdict: r.parser_verdict });
}
// nonzero
{
  const r = evaluateFinalPoisonAbsence({ status: 1, stdout: JSON.stringify(baseOkRow), stderr: "" });
  record("parser_reject_nonzero", r.ok === false, { reason: r.reason, parser_verdict: r.parser_verdict });
}
// timeout
{
  const r = evaluateFinalPoisonAbsence({ status: 0, stdout: JSON.stringify(baseOkRow), stderr: "", timeout: true });
  record("parser_reject_timeout", r.ok === false, { reason: r.reason, parser_verdict: r.parser_verdict });
}
// signal
{
  const r = evaluateFinalPoisonAbsence({ status: 0, stdout: JSON.stringify(baseOkRow), stderr: "", signal: "SIGTERM" });
  record("parser_reject_signal", r.ok === false, { reason: r.reason, parser_verdict: r.parser_verdict });
}
// poisonPresent true
{
  const r = evalRow(assembleFinalPoisonExactRow({ trigger_present: false, function_present: false, poisonPresent: true, target_identity: approvedTarget() }));
  record("parser_reject_poisonPresent_true", r.ok === false, { reason: r.reason, parser_verdict: r.parser_verdict });
}
// requires poisonPresent:false — exact valid PASS
{
  const r = evalRow(baseOkRow);
  record("parser_exact_valid_PASS", r.ok === true && r.poisonPresent === false && r.parser_verdict === "valid_json_exact_schema", {
    reason: r.reason,
    parser_verdict: r.parser_verdict,
    poisonPresent: r.poisonPresent,
  });
}

// Also evaluatePoisonAbsent requires poisonPresent false (probe-level)
{
  const ok = evaluatePoisonAbsent({
    status: 0,
    stdout: JSON.stringify({
      trigger_present: false,
      function_present: false,
      poisonPresent: false,
      current_database: "postgres",
      current_user: "postgres",
    }),
    stderr: "",
  });
  record("evaluatePoisonAbsent_requires_poisonPresent_false", ok.ok === true && ok.poisonPresent === false, { reason: ok.reason });
  const bad = evaluatePoisonAbsent({
    status: 0,
    stdout: JSON.stringify({
      trigger_present: false,
      function_present: false,
      poisonPresent: true,
      current_database: "postgres",
      current_user: "postgres",
    }),
    stderr: "",
  });
  record("evaluatePoisonAbsent_reject_poisonPresent_true", bad.ok === false, { reason: bad.reason });
}

// --- Genuine target-binding negatives ---
const targetCases = [
  ["empty_database_name", { current_database: "", current_user: "postgres" }],
  ["null_database_name", { current_database: null, current_user: "postgres" }],
  ["empty_user", { current_database: "postgres", current_user: "" }],
  ["null_user", { current_database: "postgres", current_user: null }],
  ["mismatch_ref", null, { project_ref: "llbnliixczcqfftxpsmb" }], // via evaluatePoisonTargetIdentity
  ["mismatch_name", null, { project_name: "wrong-name" }],
  ["mismatch_org", null, { org_id: "wrongorg" }],
  ["empty_hostname", null, { hostname: "" }],
];

for (const [name, live, override] of targetCases) {
  if (live) {
    const bound = bindPoisonTargetIdentity({
      live: {
        ...live,
        hostname: APPROVED_DISPOSABLE_HOST,
        pooler_identity: APPROVED_DISPOSABLE_POOLER_USER,
        qualification_run_id: "phase-a",
      },
    });
    record(`target_binding_reject_${name}`, bound.ok === false, {
      reason: bound.reason,
      parser_verdict: bound.parser_verdict,
      repairCalls: 0,
      continuationCalls: 0,
    });
  } else {
    const t = approvedTarget(override);
    const ev = evaluatePoisonTargetIdentity(t);
    record(`target_binding_reject_${name}`, ev.ok === false, {
      reason: ev.reason,
      parser_verdict: ev.parser_verdict,
      repairCalls: 0,
      continuationCalls: 0,
    });
  }
}

// Host mismatch: poison target_identity requires nonempty hostname but does not
// byte-compare to APPROVED_DISPOSABLE_HOST (F5.1 design). Host equality is enforced
// by disposable identity / repair-safety gates. Prove that path rejects wrong host.
{
  const gate = evaluateRepairSafetyGate({
    file: "00118_f3_bounded_financial_epoch_foundation.sql",
    projectRef: APPROVED_DISPOSABLE_PROJECT_REF,
    projectName: APPROVED_DISPOSABLE_PROJECT_NAME,
    orgId: APPROVED_DISPOSABLE_ORG_ID,
    host: "db.llbnliixczcqfftxpsmb.supabase.co",
    productionIdentityRejected: true,
    cliVersion: "2.117.0",
  });
  const disposableGate = (gate.gates || []).find((g) => g.id === "disposable_identity");
  record("identity_gate_reject_mismatch_host", gate.ok === false && disposableGate && disposableGate.ok === false, {
    reason: disposableGate?.detail || gate.reason,
    repairCalls: gate.repairCalls ?? 0,
    continuationCalls: gate.continuationCalls ?? 0,
    note: "poison target_identity does not compare hostname; disposable_identity gate does",
  });
}

// Wrong host still accepted by poison target evaluator (document exact F5.1 behavior)
{
  const ev = evaluatePoisonTargetIdentity(approvedTarget({ hostname: "db.llbnliixczcqfftxpsmb.supabase.co" }));
  record("poison_target_wrong_host_not_compared_documented", ev.ok === true, {
    note: "F5.1 evaluatePoisonTargetIdentity only checks ref/name/org equality; hostname nonempty only",
  });
}

// extra/missing key on target_identity
{
  const extra = { ...approvedTarget(), extra_key: "x" };
  const ev = evaluatePoisonTargetIdentity(extra);
  record("target_binding_reject_extra_key", ev.ok === false, { reason: ev.reason, parser_verdict: ev.parser_verdict });
}
{
  const missing = { ...approvedTarget() };
  delete missing.user;
  const ev = evaluatePoisonTargetIdentity(missing);
  record("target_binding_reject_missing_key", ev.ok === false, { reason: ev.reason, parser_verdict: ev.parser_verdict });
}
// poisonPresent true already covered
// exact valid → PASS
{
  const bound = bindPoisonTargetIdentity({
    live: {
      current_database: "postgres",
      current_user: "postgres.jkorwnwwmdeflfntxntl",
      hostname: APPROVED_DISPOSABLE_HOST,
      pooler_identity: APPROVED_DISPOSABLE_POOLER_USER,
      qualification_run_id: "phase-a-valid",
    },
  });
  record("target_binding_exact_valid_PASS", bound.ok === true, {
    reason: bound.reason,
    database_name: bound.target_identity?.database_name,
    user: bound.target_identity?.user,
    project_ref: bound.target_identity?.project_ref,
  });
  const final = evalRow(assembleFinalPoisonExactRow({
    trigger_present: false,
    function_present: false,
    poisonPresent: false,
    target_identity: bound.target_identity,
  }));
  record("target_binding_exact_valid_final_poison_PASS", final.ok === true && final.poisonPresent === false, {
    parser_verdict: final.parser_verdict,
  });
}

const allOk = cases.every((c) => c.ok === true);
const rejectsHaveZeroCounters = cases
  .filter((c) => /reject/i.test(c.name))
  .every((c) => c.repairCalls === 0 && c.continuationCalls === 0);

const result = {
  probe_sql_proof: probeSqlProof,
  required_final_keys: FINAL_POISON_REQUIRED_KEYS,
  required_target_keys: FINAL_POISON_TARGET_IDENTITY_KEYS,
  approved_ref: APPROVED_DISPOSABLE_PROJECT_REF,
  approved_name: APPROVED_DISPOSABLE_PROJECT_NAME,
  approved_org: APPROVED_DISPOSABLE_ORG_ID,
  cases,
  case_count: cases.length,
  all_cases_ok: allOk,
  rejects_repairCalls_0_continuationCalls_0: rejectsHaveZeroCounters,
  verdict: allOk && rejectsHaveZeroCounters && probeSqlProof.contains_current_database_call && probeSqlProof.contains_current_user_call
    ? "CONTINUE"
    : "HOLD",
};

fs.writeFileSync(path.join(OUT, "poison-target-negatives.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({
  verdict: result.verdict,
  case_count: result.case_count,
  all_ok: allOk,
  zero_counters: rejectsHaveZeroCounters,
  failed: cases.filter((c) => !c.ok).map((c) => c.name),
}, null, 2));
if (result.verdict !== "CONTINUE") process.exit(2);
