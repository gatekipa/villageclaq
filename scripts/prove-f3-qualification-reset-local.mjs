/**
 * F14 local PostgreSQL proof helper for qualification-reset.
 *
 * Fresh task-owned f3_* database only. Preserves other DBs/containers.
 * NOT hosted identity proof. NOT disposable. NOT production.
 * If this VM has no local PostgreSQL 17, reports MUST_LOCAL honestly.
 *
 * Local endpoint routing: when hosted gated-psql env is absent, this
 * helper (and the unit harness) may use a process-shaped adapter that
 * still returns {status,stdout,stderr} only. That substitution is
 * confined to this helper / test harness and is not a runtime bypass.
 */
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  F14_RUNTIME_LABEL,
  QUALIFICATION_RESET_APPLY_PSQL_ARGV,
  QUALIFICATION_RESET_LOCAL_PROOF_HELPER_RELPATH,
  buildQualificationResetSql,
  createDisabledQualificationResetTransportAdapter,
  interpretQualificationResetTransportResult,
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
    const db = mod.createDisposableDatabase("f14_qual_reset");
    return { ok: true, db };
  } catch (err) {
    return { ok: false, reason: String(err?.message || err) };
  }
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
    sqlFile: path.join(os.tmpdir(), "f14-inventory.sql"),
    isolatedHome: path.join(os.tmpdir(), "f14-psql-home"),
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
    stdout: JSON.stringify({ schema: "f14-qualification-reset-tx-observation-v1", phase: "T7_COMMIT", event: "commit_attempted" }) + "\n",
    stderr: "connection to server was lost during COMMIT 08006",
  });
  checks.push(record("COMMIT_CONNECTION_LOSS_UNCERTAIN", "check", {
    ok: lost.uncertainCommit === true && lost.rolledBack === null && lost.committed === false,
    commit: false,
    rollback: null,
    replay: false,
    observedPhase: "T7_COMMIT",
  }));

  const closures = publishQualificationResetClosures();
  checks.push(record("RUNTIME_CLOSURE_NOT_SUMMARY", "check", {
    ok: closures.runtime.sha256 !== "16e4757840aec5f4fb44504fbd33e8480de169553f9a1ccfb180dbde051cb66d"
      && closures.completeVerificationUnion.proofHelperIncluded === true
      && closures.runtime.label === "F14_QUALIFICATION_RESET_RUNTIME_CLOSURE",
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

async function runHarnessSubstitutionScenarios() {
  const scenarios = [];
  const leftover = await runQualificationReset({
    input: {
      authorization: syntheticAuth(),
      runtimeContext: syntheticRuntime(),
      observedObjects: ["public.financial_accounts"],
      observedDependencies: [],
      observedHistoryRows: AUTHENTICATED_HISTORY_KEYS.map((key) => ({ version: key.version, name: key.name })),
      inventoryCaptured: true,
      captureComplete: true,
    },
    adapters: { transport: createDisabledQualificationResetTransportAdapter() },
    allowDisabledTransport: true,
  });
  scenarios.push(record("HARNESS_ELIGIBLE_LEFTOVER_COMMIT_OBS", "scenario", {
    ok: leftover.ok === true && leftover.committed === true,
    resetApply: leftover.spies?.applyCalls ?? 0,
    capture: "harness-substitution",
    commit: leftover.committed === true,
    rollback: leftover.rolledBack ?? null,
    replay: leftover.spies?.replayCalls === 1,
    observedPhase: leftover.transportInterpretation?.phaseReached ?? null,
    sql: leftover.plan?.sql != null,
    verdict: leftover.verdict,
    note: "disabled adapter confined to helper/harness; not hosted identity proof",
  }));

  const clean = await runQualificationReset({
    input: {
      authorization: syntheticAuth(),
      runtimeContext: syntheticRuntime(),
      observedObjects: [],
      observedDependencies: [],
      observedHistoryRows: [],
      inventoryCaptured: true,
      captureComplete: true,
    },
    adapters: { transport: createDisabledQualificationResetTransportAdapter() },
    allowDisabledTransport: true,
  });
  scenarios.push(record("HARNESS_CLEAN_NO_MUTATION", "scenario", {
    ok: clean.ok === true && clean.alreadyClean === true && (clean.spies?.applyCalls || 0) === 0,
    resetApply: clean.spies?.applyCalls ?? 0,
    commit: false,
    replay: false,
    verdict: clean.verdict,
    note: "alreadyClean does not consume reset budget",
  }));

  const uncertain = await runQualificationReset({
    input: {
      authorization: syntheticAuth(),
      runtimeContext: syntheticRuntime(),
      observedObjects: ["public.financial_accounts"],
      observedDependencies: [],
      observedHistoryRows: AUTHENTICATED_HISTORY_KEYS.map((key) => ({ version: key.version, name: key.name })),
      inventoryCaptured: true,
      captureComplete: true,
    },
    adapters: { transport: createDisabledQualificationResetTransportAdapter({ failAt: "uncertain_commit" }) },
    allowDisabledTransport: true,
  });
  scenarios.push(record("HARNESS_UNCERTAIN_NO_REPLAY", "scenario", {
    ok: uncertain.code === "UNCERTAIN_COMMIT" && uncertain.automaticReplay === false && uncertain.rolledBack === null,
    resetApply: uncertain.spies?.applyCalls ?? 0,
    commit: false,
    rollback: null,
    replay: uncertain.spies?.replayCalls === 1,
    observedPhase: "T7_COMMIT",
    code: uncertain.code,
  }));

  return scenarios;
}

async function runLocalPgScenarios() {
  const created = await maybeCreateLocalDb();
  if (!created.ok) {
    return {
      available: false,
      reason: created.reason,
      scenarios: [],
    };
  }
  const { db } = created;
  const scenarios = [];
  try {
    const { psql } = await import("./fixtures/disposable-postgres.mjs");
    psql(db.url, "CREATE SCHEMA IF NOT EXISTS supabase_migrations;");
    psql(db.url, `CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
      version text PRIMARY KEY,
      name text
    );`);
    const emptyOut = psql(db.url, QUALIFICATION_RESET_INVENTORY_CAPTURE_SQL);
    const emptyParsed = parseQualificationResetInventoryProcessResult({
      status: 0,
      stdout: `${emptyOut}\n`,
      stderr: "",
    });
    scenarios.push(record("CLEAN_NO_MUTATION", "scenario", {
      ok: emptyParsed.ok === true,
      capture: emptyParsed.ok ? "complete-empty" : emptyParsed.code,
      resetApply: "not-attempted",
      commit: false,
      replay: false,
      executedTransaction: false,
      verdict: emptyParsed.ok ? "CLEAN_BASELINE" : null,
    }));

    psql(db.url, "CREATE TABLE public.financial_accounts (id uuid PRIMARY KEY);");
    psql(db.url, `CREATE FUNCTION public.post_financial_opening_cash(p_command jsonb)
      RETURNS void LANGUAGE sql AS $$ SELECT 1; $$;`);
    psql(db.url, `CREATE FUNCTION public.zero_arg_probe()
      RETURNS void LANGUAGE sql AS $$ SELECT 1; $$;`);
    psql(db.url, "CREATE VIEW public.unexpected_view AS SELECT 1 AS n;");
    const leftoverOut = psql(db.url, QUALIFICATION_RESET_INVENTORY_CAPTURE_SQL);
    const leftoverParsed = parseQualificationResetInventoryProcessResult({
      status: 0,
      stdout: `${leftoverOut}\n`,
      stderr: "",
    });
    const identities = leftoverParsed.ok
      ? leftoverParsed.body.discovered_objects.map((row) => row.identity)
      : [];
    scenarios.push(record("ALLOWED_FUNCTION_SURFACE_AND_UNEXPECTED", "scenario", {
      ok: leftoverParsed.ok === true
        && identities.some((id) => canonicalizeFunctionIdentity(id) === "public.post_financial_opening_cash(jsonb)")
        && identities.some((id) => id === "public.unexpected_view"),
      capture: leftoverParsed.ok ? "complete-universe" : leftoverParsed.code,
      sql: leftoverParsed.ok,
      executedTransaction: false,
    }));

    const sql = buildQualificationResetSql({
      observedHistoryRows: AUTHENTICATED_HISTORY_KEYS.map((key) => ({ version: key.version, name: key.name })),
      scopeSqlIdentitySha256: scopeSqlIdentityDigest(),
    });
    scenarios.push(record("EMITTED_SQL_CANONICAL_AND_RESTRICT", "scenario", {
      ok: sql.ok === true
        && sql.sql.includes("format_type")
        && !/\bCASCADE\b/i.test(sql.sql)
        && sql.sql.includes("commit_attempted"),
      sql: sql.ok,
      replay: false,
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
  const harness = await runHarnessSubstitutionScenarios();
  const pgProbe = tryLocalPg();
  const pg = pgProbe.status === 0
    ? await runLocalPgScenarios()
    : { available: false, reason: "psql binary not present", scenarios: [] };

  const cases = [...checks, ...harness, ...pg.scenarios];
  const mustLocal = pg.available !== true;
  const failCount = cases.filter((row) => row.ok !== true).length;
  return {
    schema: "f14-qualification-reset-local-proof-v1",
    label: F14_RUNTIME_LABEL,
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
