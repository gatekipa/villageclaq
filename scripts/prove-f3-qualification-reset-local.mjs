/**
 * F15 local PostgreSQL proof helper for qualification-reset.
 *
 * Fresh task-owned f3_* database only. Preserves other DBs/containers.
 * NOT hosted identity proof. NOT disposable. NOT production.
 * If this VM has no local PostgreSQL, reports MUST_LOCAL honestly.
 *
 * Three real local TX scenarios execute generated reset SQL through
 * shared runQualificationReset + the local-fixture psql adapter + the
 * actual process-result parser. Disabled adapter is not DB execution.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { APPROVED_DISPOSABLE_PROJECT_REF } from "./lib/f3-db-push-pins.mjs";
import {
  AUTHENTICATED_HISTORY_KEYS,
  CANONICAL_FUNCTION_IDENTITY_SQL,
  F13_WIPE_REJECTION_CODE,
  canonicalizeFunctionIdentity,
  scopeSqlIdentityDigest,
} from "./lib/f3-db-push-qualification-reset-design.mjs";
import {
  QUALIFICATION_RESET_INVENTORY_CAPTURE_SQL,
  buildQualificationResetInventoryPsqlCommand,
  completeCaptureBody,
  evaluateQualificationResetEligibility,
  parseQualificationResetInventoryProcessResult,
} from "./lib/f3-db-push-inventory.mjs";
import {
  F15_RUNTIME_LABEL,
  QUALIFICATION_RESET_APPLY_PSQL_ARGV,
  QUALIFICATION_RESET_LOCAL_PROOF_HELPER_RELPATH,
  TX_OBSERVATION_SCHEMA,
  TX_OBSERVATION_SUCCESS_SEQUENCE,
  buildQualificationResetSql,
  createLocalFixtureQualificationResetTransportAdapter,
  interpretQualificationResetTransportResult,
  parseQualificationResetTxObservationStdout,
  publishQualificationResetClosures,
  runQualificationReset,
} from "./lib/f3-db-push-qualification-reset.mjs";
import {
  evaluateWipeToBaselineArg,
  validateProposedQualificationResetHostedPlanOffline,
} from "./qualify-f3-db-push-disposable.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const HELPER_RELPATH = QUALIFICATION_RESET_LOCAL_PROOF_HELPER_RELPATH;

function record(id, kind, extra = {}) {
  return {
    id,
    kind,
    ok: extra.ok !== false,
    capture: extra.capture ?? null,
    resetApply: extra.resetApply ?? null,
    sql: extra.sql ?? null,
    observedPhase: extra.observedPhase ?? null,
    commit: extra.commit ?? null,
    rollback: extra.rollback ?? null,
    replay: extra.replay ?? false,
    code: extra.code ?? null,
    verdict: extra.verdict ?? null,
    executedTransaction: extra.executedTransaction === true,
    note: extra.note ?? null,
  };
}

export { completeCaptureBody };

function tryLocalPg() {
  try {
    return spawnSync("psql", ["--version"], { encoding: "utf8", timeout: 3000 });
  } catch {
    return { status: 1, stdout: "", stderr: "psql missing" };
  }
}

async function maybeCreateLocalDb() {
  try {
    const mod = await import("./fixtures/disposable-postgres.mjs");
    const db = mod.createDisposableDatabase("f15_qual_reset");
    return { ok: true, db, mod };
  } catch (err) {
    return { ok: false, reason: String(err?.message || err) };
  }
}

function mustLocalRecord(id, kind = "scenario") {
  return record(id, kind, {
    ok: true,
    executedTransaction: false,
    code: "MUST_LOCAL",
    note: "MUST_LOCAL: local PostgreSQL is not available in this environment",
    capture: "not-run",
    resetApply: "not-run",
    replay: false,
  });
}

function runOfflineChecks() {
  const checks = [];
  const wipe = evaluateWipeToBaselineArg(true);
  checks.push(record("WIPE_STILL_REJECTED", "check", {
    ok: wipe.code === F13_WIPE_REJECTION_CODE,
    code: wipe.code,
    replay: false,
  }));

  const cmd = buildQualificationResetInventoryPsqlCommand({
    sqlFile: path.join(os.tmpdir(), "f15-inventory.sql"),
    isolatedHome: path.join(os.tmpdir(), "f15-psql-home"),
  });
  checks.push(record("INVENTORY_PSQL_ARGV_MACHINE_READABLE", "check", {
    ok: cmd.argv.slice(0, 7).join(" ") === "-X -q -t -A -w -v ON_ERROR_STOP=1",
    sql: QUALIFICATION_RESET_INVENTORY_CAPTURE_SQL.includes("discovered_objects"),
  }));

  const aligned = parseQualificationResetInventoryProcessResult({
    status: 0,
    stdout: "     jsonb_build_object\n-------------------------\n {\"schema\":\"f13-qualification-reset-inventory-v1\"}\n(1 row)\n",
    stderr: "",
    signal: null,
    timeout: false,
  });
  checks.push(record("ALIGNED_FRAMING_REJECTED", "check", {
    ok: aligned.ok === false && aligned.code === "F13_INVENTORY_CAPTURE_FRAMING",
    code: aligned.code,
    capture: "rejected",
  }));

  const named = canonicalizeFunctionIdentity("public.post_financial_opening_cash(p_command jsonb)");
  checks.push(record("FUNCTION_IDENTITY_NAMED_ARGS", "check", {
    ok: named === "public.post_financial_opening_cash(jsonb)",
    sql: CANONICAL_FUNCTION_IDENTITY_SQL.includes("format_type"),
  }));

  const unexpected = evaluateQualificationResetEligibility({
    observedObjectIdentities: ["public.not_allowlisted_extra"],
    observedDependencies: [],
    observedHistoryRows: [],
    inventoryCaptured: true,
    captureComplete: true,
  });
  checks.push(record("UNEXPECTED_OBJECT_BLOCKS", "check", {
    ok: unexpected.eligible !== true && unexpected.code === "F13_UNEXPECTED_OBJECT_OR_DEPENDENCY",
    code: unexpected.code,
  }));

  const statusOnly = interpretQualificationResetTransportResult({
    status: 0,
    stdout: "COMMIT\n",
    stderr: "",
    argv: [...QUALIFICATION_RESET_APPLY_PSQL_ARGV, "-f", "[FILE]"],
  });
  checks.push(record("STATUS0_WITHOUT_COMMIT_OBS", "check", {
    ok: statusOnly.committed !== true,
    commit: false,
    observedPhase: statusOnly.phaseReached,
  }));

  const lost = interpretQualificationResetTransportResult({
    status: 1,
    stdout: `${JSON.stringify({ schema: "f15-qualification-reset-tx-observation-v1", phase: "T7_COMMIT", event: "commit_attempted" })}\n`,
    stderr: "connection to server was lost during COMMIT 08006",
  });
  checks.push(record("COMMIT_CONNECTION_LOSS_UNCERTAIN", "check", {
    ok: lost.uncertainCommit === true && lost.rolledBack === null && lost.committed === false,
    commit: false,
    rollback: null,
    replay: false,
    observedPhase: "T7_COMMIT",
  }));

  const generated = buildQualificationResetSql({
    observedHistoryRows: AUTHENTICATED_HISTORY_KEYS.map((key) => ({
      version: key.version,
      name: key.name,
    })),
    scopeSqlIdentitySha256: scopeSqlIdentityDigest(),
  });
  const withoutDoBlocks = String(generated.sql || "").replace(/DO \$[A-Za-z0-9_]+\$[\s\S]*?\$[A-Za-z0-9_]+\$;/g, "");
  checks.push(record("ADVISORY_LOCK_NO_VOID_SELECT", "check", {
    ok: generated.ok === true
      && /PERFORM\s+pg_advisory_xact_lock\s*\(/.test(generated.sql)
      && !/SELECT\s+pg_advisory_xact_lock\s*\(/.test(withoutDoBlocks),
    sql: generated.ok === true,
  }));

  const voidThenComplete = `\n${TX_OBSERVATION_SUCCESS_SEQUENCE.map((row) => (
    JSON.stringify({ schema: TX_OBSERVATION_SCHEMA, ...row })
  )).join("\n")}\n`;
  const framed = parseQualificationResetTxObservationStdout(voidThenComplete);
  const framedInterp = interpretQualificationResetTransportResult({
    status: 0,
    stdout: voidThenComplete,
    stderr: "",
    argv: [...QUALIFICATION_RESET_APPLY_PSQL_ARGV, "-f", "[FILE]"],
  });
  const prefixHold = interpretQualificationResetTransportResult({
    status: 0,
    stdout: `PREFIX ${JSON.stringify({
      schema: "f14-qualification-reset-tx-observation-v1",
      phase: "WRONG_PHASE",
      event: "committed",
      committed: true,
    })} SUFFIX\n`,
    stderr: "",
  });
  checks.push(record("ADVISORY_LOCK_VOID_SELECT_FRAMING", "check", {
    ok: framed.ok === true
      && framed.observations.length === TX_OBSERVATION_SUCCESS_SEQUENCE.length
      && framedInterp.committed === true
      && prefixHold.committed !== true,
    commit: framedInterp.committed === true,
    observedPhase: framedInterp.phaseReached,
    note: "protocol-defined whitespace from void SELECT is ignored; PREFIX/SUFFIX still rejected",
  }));

  const closures = publishQualificationResetClosures();
  checks.push(record("RUNTIME_CLOSURE_NOT_SUMMARY", "check", {
    ok: closures.runtime.sha256 !== "16e4757840aec5f4fb44504fbd33e8480de169553f9a1ccfb180dbde051cb66d"
      && closures.completeVerificationUnion.proofHelperIncluded === true
      && closures.runtime.label === "F15_QUALIFICATION_RESET_RUNTIME_CLOSURE"
      && closures.f14BaselineCitedNotExpected.runtime.sha256 === "f6205869b233eaccf375b299112f7b9c352d58c6f2659471e06d2ca7a241e31d",
  }));

  const plan = validateProposedQualificationResetHostedPlanOffline();
  checks.push(record("PROPOSED_HOSTED_PLAN_OFFLINE", "check", {
    ok: plan.ok === true && plan.transportsDisabled === true,
    replay: false,
  }));

  return checks;
}

function syntheticAuth() {
  return {
    targetRef: APPROVED_DISPOSABLE_PROJECT_REF,
    functionalCandidateSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    closureDigest: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    scopeSqlIdentitySha256: scopeSqlIdentityDigest(),
    executionBudget: { constrainedResets: 1, completeQualsFrom00118: 1, secondReset: false },
  };
}

function syntheticRuntime() {
  return {
    targetRef: APPROVED_DISPOSABLE_PROJECT_REF,
    functionalCandidateSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    closureDigest: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    scopeSqlIdentitySha256: scopeSqlIdentityDigest(),
    syntheticBinding: true,
    bindingRole: "negative-test-input",
  };
}

function authenticatedHistory() {
  return AUTHENTICATED_HISTORY_KEYS.map((key) => ({ version: key.version, name: key.name }));
}

function captureViaLocalPsql(psql, url) {
  const stdout = `${psql(url, QUALIFICATION_RESET_INVENTORY_CAPTURE_SQL)}\n`;
  return parseQualificationResetInventoryProcessResult({
    status: 0,
    stdout,
    stderr: "",
    signal: null,
    timeout: false,
  });
}

function seedHistory(psql, url) {
  for (const key of AUTHENTICATED_HISTORY_KEYS) {
    psql(url, `INSERT INTO supabase_migrations.schema_migrations(version, name) VALUES ('${key.version}', '${key.name}');`);
  }
}

function seedEligibleLeftover(psql, url) {
  psql(url, "CREATE TABLE public.financial_accounts (id uuid PRIMARY KEY);");
  psql(url, `CREATE FUNCTION public.post_financial_opening_cash(p_command jsonb)
    RETURNS void LANGUAGE sql AS $$ SELECT 1; $$;`);
  seedHistory(psql, url);
}

async function executeSharedReset(db, observed) {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "f15-qual-reset-"));
  try {
    const result = await runQualificationReset({
      input: {
        authorization: syntheticAuth(),
        runtimeContext: syntheticRuntime(),
        observedObjects: observed.observedObjects,
        observedDependencies: observed.observedDependencies,
        observedHistoryRows: observed.observedHistoryRows,
        inventory: observed.inventory,
        inventoryCaptured: true,
        captureComplete: true,
        workdir,
      },
      adapters: {
        transport: createLocalFixtureQualificationResetTransportAdapter({
          url: db.url,
          workdir,
        }),
        workdir,
      },
      allowDisabledTransport: false,
    });
    return result;
  } finally {
    fs.rmSync(workdir, { recursive: true, force: true });
  }
}

async function runLocalPgScenarios() {
  const created = await maybeCreateLocalDb();
  if (!created.ok) {
    return {
      available: false,
      reason: created.reason,
      scenarios: [
        mustLocalRecord("UNEXPECTED_OBJECT_BLOCKS_BEFORE_PLAN"),
        mustLocalRecord("TX_SUCCESSFUL_RESET"),
        mustLocalRecord("TX_UNEXPECTED_OBJECT_ROLLBACK"),
        mustLocalRecord("TX_HISTORY_MISMATCH_ROLLBACK"),
      ],
    };
  }
  const { db } = created;
  const { psql } = created.mod;
  const scenarios = [];
  try {
    psql(db.url, "CREATE SCHEMA IF NOT EXISTS supabase_migrations;");
    psql(db.url, `CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
      version text PRIMARY KEY,
      name text
    );`);

    seedEligibleLeftover(psql, db.url);
    psql(db.url, "CREATE VIEW public.unexpected_view AS SELECT 1 AS n;");
    const beforePlanCapture = captureViaLocalPsql(psql, db.url);
    const beforePlanObserved = beforePlanCapture.ok
      ? (await import("./lib/f3-db-push-inventory.mjs")).observedFromQualificationResetCapture(beforePlanCapture.body)
      : beforePlanCapture;
    const beforePlan = beforePlanObserved.ok
      ? evaluateQualificationResetEligibility({
        observedObjectIdentities: beforePlanObserved.observedObjects,
        observedDependencies: beforePlanObserved.observedDependencies,
        observedHistoryRows: beforePlanObserved.observedHistoryRows,
        inventory: beforePlanObserved.inventory,
        inventoryCaptured: true,
        captureComplete: true,
      })
      : beforePlanObserved;
    scenarios.push(record("UNEXPECTED_OBJECT_BLOCKS_BEFORE_PLAN", "scenario", {
      ok: beforePlan.ok === false
        && beforePlan.code === "F13_UNEXPECTED_OBJECT_OR_DEPENDENCY"
        && beforePlan.eligible !== true,
      capture: "complete-universe-with-sentinel",
      resetApply: "not-attempted",
      commit: false,
      replay: false,
      executedTransaction: false,
      code: beforePlan.code,
      verdict: "HOLD",
      note: "unexpected object present at capture blocks planning; no apply",
    }));
    psql(db.url, "DROP VIEW public.unexpected_view;");

    const successCapture = captureViaLocalPsql(psql, db.url);
    const successObserved = successCapture.ok
      ? (await import("./lib/f3-db-push-inventory.mjs")).observedFromQualificationResetCapture(successCapture.body)
      : successCapture;
    const success = successObserved.ok ? await executeSharedReset(db, successObserved) : successObserved;
    const accountsGone = psql(db.url, "SELECT to_regclass('public.financial_accounts') IS NULL;");
    const historyGone = psql(db.url, "SELECT count(*)::text FROM supabase_migrations.schema_migrations;");
    scenarios.push(record("TX_SUCCESSFUL_RESET", "scenario", {
      ok: success.ok === true
        && success.committed === true
        && success.verdict === "CLEAN_BASELINE"
        && String(accountsGone).includes("t")
        && String(historyGone) === "0",
      capture: "eligible-leftover",
      resetApply: success.spies?.applyCalls ?? 0,
      sql: success.plan?.sql != null,
      commit: success.committed === true,
      rollback: success.rolledBack ?? null,
      replay: success.spies?.replayCalls === 1,
      observedPhase: success.transportInterpretation?.phaseReached ?? null,
      verdict: success.verdict,
      executedTransaction: true,
      note: "shared runQualificationReset + local-fixture psql + generated SQL",
    }));

    seedEligibleLeftover(psql, db.url);
    const afterCaptureBase = captureViaLocalPsql(psql, db.url);
    const afterCaptureObserved = afterCaptureBase.ok
      ? (await import("./lib/f3-db-push-inventory.mjs")).observedFromQualificationResetCapture(afterCaptureBase.body)
      : afterCaptureBase;
    psql(db.url, "CREATE VIEW public.unexpected_view AS SELECT 1 AS n;");
    const unexpectedTx = afterCaptureObserved.ok
      ? await executeSharedReset(db, afterCaptureObserved)
      : afterCaptureObserved;
    const sentinel = psql(db.url, "SELECT to_regclass('public.unexpected_view') IS NOT NULL;");
    const accountsKept = psql(db.url, "SELECT to_regclass('public.financial_accounts') IS NOT NULL;");
    scenarios.push(record("TX_UNEXPECTED_OBJECT_ROLLBACK", "scenario", {
      ok: unexpectedTx.ok === false
        && unexpectedTx.committed !== true
        && String(sentinel).includes("t")
        && String(accountsKept).includes("t"),
      capture: "eligible-then-sentinel-after-capture",
      resetApply: unexpectedTx.spies?.applyCalls ?? 0,
      sql: unexpectedTx.plan?.sql != null,
      commit: false,
      rollback: unexpectedTx.rolledBack ?? null,
      replay: unexpectedTx.spies?.replayCalls === 1,
      observedPhase: unexpectedTx.transportInterpretation?.phaseReached ?? null,
      code: unexpectedTx.code,
      verdict: unexpectedTx.verdict || "HOLD",
      executedTransaction: true,
      note: "object introduced after capture is TX-revalidated; sentinel preserved",
    }));
    psql(db.url, "DROP VIEW IF EXISTS public.unexpected_view;");

    const historyCapture = captureViaLocalPsql(psql, db.url);
    const historyObserved = historyCapture.ok
      ? (await import("./lib/f3-db-push-inventory.mjs")).observedFromQualificationResetCapture(historyCapture.body)
      : historyCapture;
    psql(db.url, `UPDATE supabase_migrations.schema_migrations
      SET name = 'wrong_source_label'
      WHERE version = '${AUTHENTICATED_HISTORY_KEYS[0].version}';`);
    const historyTx = historyObserved.ok
      ? await executeSharedReset(db, historyObserved)
      : historyObserved;
    const retainedName = psql(db.url, `SELECT name FROM supabase_migrations.schema_migrations
      WHERE version = '${AUTHENTICATED_HISTORY_KEYS[0].version}';`);
    const retainedCount = psql(db.url, "SELECT count(*)::text FROM supabase_migrations.schema_migrations;");
    scenarios.push(record("TX_HISTORY_MISMATCH_ROLLBACK", "scenario", {
      ok: historyTx.ok === false
        && historyTx.committed !== true
        && String(retainedName).includes("wrong_source_label")
        && String(retainedCount) === String(AUTHENTICATED_HISTORY_KEYS.length),
      capture: "eligible-then-history-mutated-after-capture",
      resetApply: historyTx.spies?.applyCalls ?? 0,
      sql: historyTx.plan?.sql != null,
      commit: false,
      rollback: historyTx.rolledBack ?? null,
      replay: historyTx.spies?.replayCalls === 1,
      observedPhase: historyTx.transportInterpretation?.phaseReached ?? null,
      code: historyTx.code,
      verdict: historyTx.verdict || "HOLD",
      executedTransaction: true,
      note: "history mismatch after capture rolls back; mutated history retained",
    }));
  } finally {
    try {
      db.close();
    } catch {
      // preserve other DBs even if this close fails
    }
  }
  return { available: true, scenarios };
}

export async function proveQualificationResetLocal() {
  const checks = runOfflineChecks();
  const pgProbe = tryLocalPg();
  const pg = pgProbe.status === 0
    ? await runLocalPgScenarios()
    : {
      available: false,
      reason: "psql binary not present",
      scenarios: [
        mustLocalRecord("UNEXPECTED_OBJECT_BLOCKS_BEFORE_PLAN"),
        mustLocalRecord("TX_SUCCESSFUL_RESET"),
        mustLocalRecord("TX_UNEXPECTED_OBJECT_ROLLBACK"),
        mustLocalRecord("TX_HISTORY_MISMATCH_ROLLBACK"),
      ],
    };

  const cases = [...checks, ...pg.scenarios];
  const mustLocal = pg.available !== true;
  const failCount = cases.filter((row) => row.ok !== true).length;
  return {
    schema: "f15-qualification-reset-local-proof-v1",
    label: F15_RUNTIME_LABEL,
    helper: HELPER_RELPATH,
    hostedIdentityProof: false,
    disposableContact: false,
    productionContact: false,
    wipeRejectionCode: F13_WIPE_REJECTION_CODE,
    mustLocal,
    localPg: {
      available: pg.available === true,
      reason: pg.available ? null : (pg.reason || "MUST_LOCAL"),
      classification: pg.available ? "LOCAL_PG_EXECUTED" : "MUST_LOCAL",
    },
    distinctions: {
      checks: cases.filter((row) => row.kind === "check").length,
      scenarios: cases.filter((row) => row.kind === "scenario").length,
      executedTransactions: cases.filter((row) => row.executedTransaction === true).length,
    },
    cases,
    passCount: cases.filter((row) => row.ok === true).length,
    failCount,
    overallOk: failCount === 0,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  proveQualificationResetLocal().then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.overallOk ? 0 : 1);
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
