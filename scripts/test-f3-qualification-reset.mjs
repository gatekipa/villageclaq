/**
 * F13 Phase 2 qualification-reset local tests.
 * Transport-disabled adapters + operation spies. No hosted/disposable contact.
 * Exercises the same runQualificationReset orchestration as qualify main.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  APPROVED_DISPOSABLE_PROJECT_REF,
  PRODUCTION_REF,
} from "./lib/f3-db-push-pins.mjs";
import {
  QUALIFICATION_RESET_INVENTORY_PSQL_ARGV,
  QUALIFICATION_RESET_INVENTORY_SCHEMA,
  buildQualificationResetInventoryPsqlCommand,
  completeCaptureBody,
  evaluateQualificationResetEligibility,
  observedFromQualificationResetCapture,
  parseQualificationResetInventoryProcessResult,
} from "./lib/f3-db-push-inventory.mjs";
import {
  AUTHENTICATED_HISTORY_KEYS,
  F13_WIPE_REJECTION_CODE,
  canonicalizeFunctionIdentity,
  functionIdentitiesEqual,
  scopeSqlIdentityDigest,
  validateNoBroadCascade,
  validateHistorySqlPredicate,
  validateObjectAllowlist,
} from "./lib/f3-db-push-qualification-reset-design.mjs";
import {
  F13_F14_RUNTIME_CLOSURE_LABEL,
  F13_F14_VERIFICATION_UNION_LABEL,
  F13_INVENTORY_CAPTURE_REQUIRED,
  F13_RESET_ALREADY_CLEAN_VERDICT,
  F13_RESET_SUCCESS_VERDICT,
  F13_RUNTIME_LABEL,
  F13_SHARED_ORCHESTRATION_ID,
  F13_SUMMARY_FILE_HASH_FORBIDDEN,
  F14_RUNTIME_LABEL,
  INVENTORY_CAPTURE_SQL,
  QUALIFICATION_RESET_APPLY_PSQL_ARGV,
  QUALIFICATION_RESET_INVENTORY_CAPTURE_SQL,
  QUALIFICATION_RESET_LOCAL_PROOF_HELPER_RELPATH,
  bindFounderAuthorizationArtifact,
  buildQualificationResetSql,
  createDisabledQualificationResetTransportAdapter,
  createQualificationResetRecorder,
  evaluateQualificationResetArgv,
  interpretQualificationResetTransportResult,
  loadFounderAuthorizationArtifact,
  planQualificationReset,
  publishQualificationResetClosures,
  runQualificationReset,
} from "./lib/f3-db-push-qualification-reset.mjs";
import {
  FILE_BASED_RUNNER_VERDICTS,
} from "./lib/f3-db-push-pins.mjs";
import {
  F14_PROPOSED_RESET_COMMAND,
  WIPE_TO_BASELINE_REJECTION_CODE,
  assertWipeToBaselineRejected,
  buildProposedQualificationResetHostedPlan,
  evaluateQualificationResetCli,
  evaluateWipeToBaselineArg,
  parseArgs,
  qualificationResetQualifyEmitPayload,
  qualificationResetRuntimeContext,
  runHostedQualificationReset,
  runQualificationResetQualifyPath,
  validateProposedQualificationResetHostedPlanOffline,
} from "./qualify-f3-db-push-disposable.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
/** Synthetic bindings are negative-test inputs only — not runtime identity. */
const CANDIDATE_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CLOSURE_DIGEST = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function runtimeContext(overrides = {}) {
  return {
    repoRoot: ROOT,
    targetRef: APPROVED_DISPOSABLE_PROJECT_REF,
    functionalCandidateSha: CANDIDATE_SHA,
    closureDigest: CLOSURE_DIGEST,
    scopeSqlIdentitySha256: scopeSqlIdentityDigest(),
    syntheticBinding: true,
    bindingRole: "negative-test-input",
    notSummaryFileHash: true,
    forbiddenSummaryHash: F13_SUMMARY_FILE_HASH_FORBIDDEN,
    ...overrides,
  };
}

function validArtifact(overrides = {}) {
  return {
    targetRef: APPROVED_DISPOSABLE_PROJECT_REF,
    functionalCandidateSha: CANDIDATE_SHA,
    closureDigest: CLOSURE_DIGEST,
    scopeSqlIdentitySha256: scopeSqlIdentityDigest(),
    executionBudget: {
      constrainedResets: 1,
      completeQualsFrom00118: 1,
      secondReset: false,
    },
    ...overrides,
  };
}

function authenticatedHistory() {
  return AUTHENTICATED_HISTORY_KEYS.map((key) => ({ version: key.version, name: key.name }));
}

function makeArtifactDir() {
  const dir = fs.mkdtempSync(path.join(ROOT, "scripts", "f13-reset-artifact-"));
  return dir;
}

function writeArtifact(dir, name, body) {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, typeof body === "string" ? body : `${JSON.stringify(body, null, 2)}\n`);
  return path.relative(ROOT, filePath).replaceAll("\\", "/");
}

function planInput(overrides = {}) {
  return {
    authorization: validArtifact(),
    runtimeContext: runtimeContext(),
    observedObjects: ["public.financial_accounts"],
    observedDependencies: [],
    observedHistoryRows: authenticatedHistory(),
    inventoryCaptured: true,
    captureComplete: true,
    ...overrides,
  };
}

function leftoverCaptureBody(overrides = {}) {
  const leftover = overrides.discovered_objects
    ?? overrides.observed_objects
    ?? ["public.financial_accounts"];
  return completeCaptureBody({
    inventory: {
      public_tables: ["financial_accounts"],
      schema_migrations_present: true,
      schema_migrations_rows: AUTHENTICATED_HISTORY_KEYS.length,
      ...(overrides.inventory || {}),
    },
    discovered_objects: leftover,
    observed_objects: leftover,
    observed_history_rows: authenticatedHistory(),
    ...overrides,
  });
}

function emptyCaptureBody(overrides = {}) {
  return completeCaptureBody({
    inventory: {
      schema_migrations_present: true,
      schema_migrations_rows: 0,
      ...(overrides.inventory || {}),
    },
    discovered_objects: [],
    observed_objects: [],
    observed_history_rows: [],
    ...overrides,
  });
}

async function runQualifyMainPath({
  captureBody,
  captureInventory,
  disabledScript = {},
  allowDisabledTransport = true,
} = {}) {
  let captureRequest = null;
  const capture = captureInventory || (async (request) => {
    captureRequest = request;
    return captureBody;
  });
  const recorder = createQualificationResetRecorder();
  const result = await runQualificationResetQualifyPath({
    authorization: validArtifact(),
    runtimeContext: runtimeContext(),
    target: { ref: APPROVED_DISPOSABLE_PROJECT_REF },
    captureInventory: capture,
    adapters: {
      transport: createDisabledQualificationResetTransportAdapter(disabledScript),
    },
    allowDisabledTransport,
    allowLiveCapture: false,
    recorder,
  });
  return {
    result,
    recorder,
    captureRequest,
    emit: qualificationResetQualifyEmitPayload(result),
  };
}

async function runResetCase(overrides = {}) {
  const recorder = createQualificationResetRecorder();
  const transport = createDisabledQualificationResetTransportAdapter(overrides.disabledScript || {});
  let invokeEntered = false;
  const wrapped = {
    ...transport,
    execute(payload) {
      invokeEntered = true;
      const started = recorder.events.some((event) => event.type === "qualification_reset_started");
      assert.equal(started, true, "start-before-invoke");
      return transport.execute(payload);
    },
  };
  const result = await runQualificationReset({
    input: planInput(overrides.input || {}),
    adapters: { transport: wrapped },
    recorder,
    allowDisabledTransport: true,
    onAfterStarted: overrides.onAfterStarted,
  });
  if (result.ok === false && result.spies.planCalls && !result.spies.startedBeforeInvoke) {
    return { result, recorder, invokeEntered };
  }
  assert.equal(result.spies.startedBeforeInvoke, true);
  if (invokeEntered) {
    assert.equal(result.spies.completedAfterAwait, true);
    assert.equal(result.spies.sqlCalls > 0, true);
  }
  return { result, recorder, invokeEntered };
}

test("F13-R00 wipe flag remains unconditionally rejected with reset argv", () => {
  const parsed = parseArgs(["--qualification-reset", "--wipe-to-baseline"]);
  assert.equal(parsed.wipeToBaseline, true);
  assert.equal(parsed.qualificationReset, true);
  const rejected = evaluateWipeToBaselineArg(true);
  assert.equal(rejected.code, WIPE_TO_BASELINE_REJECTION_CODE);
  assert.equal(WIPE_TO_BASELINE_REJECTION_CODE, F13_WIPE_REJECTION_CODE);
  assert.throws(() => assertWipeToBaselineRejected(parsed), (err) => (
    err.code === WIPE_TO_BASELINE_REJECTION_CODE
  ));
  const cli = evaluateQualificationResetCli(parsed, runtimeContext());
  assert.equal(cli.ok, false);
  assert.equal(cli.code, F13_WIPE_REJECTION_CODE);
});

test("F13-R01 missing and malformed founder auth fail closed", () => {
  const dir = makeArtifactDir();
  try {
    const missing = evaluateQualificationResetArgv(["--qualification-reset"], runtimeContext());
    assert.equal(missing.ok, false);
    assert.equal(missing.code, "F13_FLAG_NOT_AUTHORIZATION");

    const absent = evaluateQualificationResetArgv([
      "--qualification-reset",
      `--founder-authorization-artifact=${path.relative(ROOT, path.join(dir, "missing.json")).replaceAll("\\", "/")}`,
    ], runtimeContext());
    assert.equal(absent.ok, false);
    assert.equal(absent.code, "F13_FOUNDER_AUTH_MISSING");

    const malformedRel = writeArtifact(dir, "malformed.json", "{not-json");
    const malformed = evaluateQualificationResetArgv([
      "--qualification-reset",
      `--founder-authorization-artifact=${malformedRel}`,
    ], runtimeContext());
    assert.equal(malformed.ok, false);
    assert.equal(malformed.code, "F13_FOUNDER_AUTH_MALFORMED");

    const incompleteRel = writeArtifact(dir, "incomplete.json", { targetRef: APPROVED_DISPOSABLE_PROJECT_REF });
    const incomplete = evaluateQualificationResetArgv([
      "--qualification-reset",
      `--founder-authorization-artifact=${incompleteRel}`,
    ], runtimeContext());
    assert.equal(incomplete.ok, false);
    assert.equal(incomplete.code, "F13_FOUNDER_AUTH_INCOMPLETE");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("F13-R02 stale and mismatched founder auth fail closed", () => {
  const dir = makeArtifactDir();
  try {
    const staleRel = writeArtifact(dir, "stale.json", validArtifact({
      functionalCandidateSha: "ffffffffffffffffffffffffffffffffffffffff",
    }));
    const stale = evaluateQualificationResetArgv([
      "--qualification-reset",
      `--founder-authorization-artifact=${staleRel}`,
    ], runtimeContext());
    assert.equal(stale.ok, false);
    assert.equal(stale.code, "F13_FOUNDER_AUTH_STALE");

    const mismatchRel = writeArtifact(dir, "mismatch.json", validArtifact({
      scopeSqlIdentitySha256: "0".repeat(64),
    }));
    const mismatch = evaluateQualificationResetArgv([
      "--qualification-reset",
      `--founder-authorization-artifact=${mismatchRel}`,
    ], runtimeContext());
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.code, "F13_FOUNDER_AUTH_MISMATCH");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("F13-R03 wrong and production targets are refused", () => {
  const wrong = bindFounderAuthorizationArtifact(validArtifact({
    targetRef: "not-the-disposable-ref",
  }), runtimeContext());
  assert.equal(wrong.ok, false);
  assert.equal(wrong.code, "F13_FOUNDER_AUTH_TARGET");

  const prod = bindFounderAuthorizationArtifact(validArtifact({
    targetRef: PRODUCTION_REF,
  }), runtimeContext({ targetRef: PRODUCTION_REF }));
  assert.equal(prod.ok, false);
  assert.match(String(prod.code), /PRODUCTION/);

  const planned = planQualificationReset(planInput({
    target: { ref: PRODUCTION_REF },
  }));
  assert.equal(planned.ok, false);
  assert.match(String(planned.code), /PRODUCTION|WRONG_TARGET/);
});

test("F13-R04 invalid flags, artifact path, and SQL digest fail closed", () => {
  const combo = evaluateQualificationResetArgv([
    "--qualification-reset",
    "--prep-floor",
    "--founder-authorization-artifact=docs/unused.json",
  ], runtimeContext());
  assert.equal(combo.ok, false);
  assert.equal(combo.code, "F13_INVALID_FLAG_COMBINATION");

  const escaped = loadFounderAuthorizationArtifact("../outside.json", { repoRoot: ROOT });
  assert.equal(escaped.ok, false);
  assert.equal(escaped.code, "F13_AUTH_ARTIFACT_PATH");

  const abs = loadFounderAuthorizationArtifact("/tmp/secret.json", { repoRoot: ROOT });
  assert.equal(abs.ok, false);

  const plan = planQualificationReset(planInput());
  assert.equal(plan.ok, true);
  const digest = planQualificationReset(planInput({
    sqlText: "BEGIN; DROP TABLE public.financial_accounts RESTRICT; COMMIT;",
  }));
  assert.equal(digest.ok, false);
  assert.equal(digest.code, "F13_SQL_DIGEST_MISMATCH");
});

test("F13-R05 unexpected objects and deps block eligibility and plan", () => {
  const prefix = evaluateQualificationResetEligibility({
    observedObjectIdentities: ["financial_*"],
    observedHistoryRows: authenticatedHistory(),
  });
  assert.equal(prefix.ok, false);
  assert.equal(prefix.eligible, false);
  assert.match(prefix.reason, /prefix/);

  const extra = planQualificationReset(planInput({
    observedObjects: ["public.not_on_allowlist"],
  }));
  assert.equal(extra.ok, false);
  assert.equal(extra.code, "F13_UNEXPECTED_OBJECT_OR_DEPENDENCY");

  const dep = planQualificationReset(planInput({
    observedDependencies: ["unexpected_fkey"],
  }));
  assert.equal(dep.ok, false);
});

test("F13-R06 wrong/missing/extra/null/empty history abort the whole plan", () => {
  const wrong = planQualificationReset(planInput({
    observedHistoryRows: AUTHENTICATED_HISTORY_KEYS.map((key, i) => ({
      version: key.version,
      name: i === 1 ? "wrong_name" : key.name,
    })),
  }));
  assert.equal(wrong.ok, false);
  assert.equal(wrong.code, "F13_HISTORY_KEY_MISMATCH");

  const empty = planQualificationReset(planInput({
    observedHistoryRows: [{ version: "20260913173000", name: "" }],
  }));
  assert.equal(empty.ok, false);

  const nul = planQualificationReset(planInput({
    observedHistoryRows: [{ version: "20260913173000", name: null }],
  }));
  assert.equal(nul.ok, false);

  const extra = planQualificationReset(planInput({
    observedHistoryRows: [
      ...authenticatedHistory(),
      { version: "19990101000000", name: "not_preassigned" },
    ],
  }));
  assert.equal(extra.ok, false);
});

test("F13-R07 emitted SQL is RESTRICT-only with exact version+name deletes", () => {
  const sql = buildQualificationResetSql({
    observedHistoryRows: authenticatedHistory(),
    scopeSqlIdentitySha256: scopeSqlIdentityDigest(),
  });
  assert.equal(sql.ok, true);
  assert.equal(validateNoBroadCascade(sql.sql).ok, true);
  assert.equal(validateHistorySqlPredicate(sql.sql).ok, true);
  assert.doesNotMatch(sql.sql, /\bCASCADE\b/i);
  assert.doesNotMatch(sql.sql, /name\s+IS\s+NULL/i);
  assert.doesNotMatch(sql.sql, /financial_\*/);
  assert.match(sql.sql, /BEGIN ISOLATION LEVEL SERIALIZABLE/);
  assert.match(sql.sql, /DROP TABLE IF EXISTS public\.financial_accounts RESTRICT/);
  assert.match(sql.sql, /version = '20260913173000' AND name = 'f3_bounded_financial_epoch_foundation'/);
  assert.match(sql.sql, /COMMIT;/);
  assert.match(sql.sql, /lock_timeout/);
});

test("F13-R08 state change between plan and TX validation aborts without commit", async () => {
  const { result } = await runResetCase({
    input: {
      inventoryAtTx: {
        observedObjects: ["public.financial_events"],
        observedDependencies: [],
        observedHistoryRows: authenticatedHistory(),
      },
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "F13_STATE_CHANGED_BEFORE_TX");
  assert.equal(result.committed, false);
  assert.equal(result.spies.committedEffects, 0);
  assert.equal(result.spies.replayCalls, 0);
});

test("F13-R09 failure before mutation counts no committed effects", async () => {
  const { result } = await runResetCase({
    disabledScript: { failAt: "before_mutation" },
  });
  assert.equal(result.ok, false);
  assert.equal(result.spies.transportCalls, 1);
  assert.equal(result.spies.sqlCalls, 1);
  assert.equal(result.spies.committedEffects, 0);
  assert.equal(result.spies.mutateAttempted, 0);
  assert.equal(result.spies.replayCalls, 0);
});

test("F13-R10 failure after begin does not claim success or infer rollback", async () => {
  const { result } = await runResetCase({
    disabledScript: { failAt: "after_begin" },
  });
  assert.equal(result.ok, false);
  assert.equal(result.spies.beginObserved, 1);
  assert.equal(result.spies.rollbackObserved, 0);
  assert.equal(result.spies.committedEffects, 0);
  assert.equal(result.rolledBack, null);
  assert.notEqual(result.verdict, F13_RESET_SUCCESS_VERDICT);
});

test("F13-R11 incorrect affected-row and failed final baseline do not claim commit", async () => {
  const affected = await runResetCase({ disabledScript: { failAt: "affected_row" } });
  assert.equal(affected.result.ok, false);
  assert.equal(affected.result.spies.mutateAttempted, 1);
  assert.equal(affected.result.spies.rollbackObserved, 0);
  assert.equal(affected.result.rolledBack, null);
  assert.equal(affected.result.spies.committedEffects, 0);

  const final = await runResetCase({ disabledScript: { failAt: "final" } });
  assert.equal(final.result.ok, false);
  assert.match(String(final.result.code), /FINAL_BASELINE/);
  assert.equal(final.result.spies.committedEffects, 0);
  assert.equal(final.result.rolledBack, null);
});

test("F13-R12 uncertain commit is labeled and never auto-replayed", async () => {
  const { result } = await runResetCase({
    disabledScript: { failAt: "uncertain_commit" },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "UNCERTAIN_COMMIT");
  assert.equal(result.automaticReplay, false);
  assert.equal(result.rolledBack, null);
  assert.equal(result.spies.replayCalls, 0);
  assert.equal(result.spies.commitAttempted, 1);
  assert.equal(result.spies.committedEffects, 0);
});

test("F13-R13 successful authorized synthetic execution uses the real planner", async () => {
  let sawStartedBeforeInvoke = false;
  const { result, recorder, invokeEntered } = await runResetCase({
    onAfterStarted: ({ pendingStarted, completed, events }) => {
      sawStartedBeforeInvoke = pendingStarted === true && completed === false;
      assert.equal(events.some((event) => event.type === "qualification_reset_started"), true);
    },
  });
  assert.equal(invokeEntered, true);
  assert.equal(sawStartedBeforeInvoke, true);
  assert.equal(result.ok, true);
  assert.equal(result.committed, true);
  assert.equal(result.verdict, F13_RESET_SUCCESS_VERDICT);
  assert.notEqual(result.verdict, FILE_BASED_RUNNER_VERDICTS.HOLD);
  assert.equal(result.sharedOrchestration, F13_SHARED_ORCHESTRATION_ID);
  assert.equal(result.label, F13_RUNTIME_LABEL);
  assert.equal(result.label, F14_RUNTIME_LABEL);
  assert.equal(result.spies.sqlCalls, 1);
  assert.equal(result.spies.committedEffects, 1);
  assert.equal(result.spies.replayCalls, 0);
  assert.equal(result.transportInterpretation.committed, true);
  assert.equal(result.plan.sqlSha256.length, 64);
  assert.doesNotMatch(result.plan.sql, /\bCASCADE\b/);
  assert.equal(recorder.events.at(-1).type, "qualification_reset_completed");
});

test("F13-R14 disabled transport is not a production bypass", async () => {
  const result = await runQualificationReset({
    input: planInput(),
    adapters: { transport: createDisabledQualificationResetTransportAdapter() },
    allowDisabledTransport: false,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "F13_DISABLED_TRANSPORT_NOT_AUTHORIZED");
  assert.equal(result.spies.transportCalls, 0);
});

test("F13-R15 valid artifact plus matching runtime context is accepted", () => {
  const dir = makeArtifactDir();
  try {
    const rel = writeArtifact(dir, "ok.json", validArtifact());
    const cli = evaluateQualificationResetArgv([
      "--no-wipe",
      "--qualification-reset",
      `--founder-authorization-artifact=${rel}`,
    ], runtimeContext());
    assert.equal(cli.ok, true);
    assert.equal(cli.authorizationArtifactSatisfied, true);
    assert.equal(cli.authorization.targetRef, APPROVED_DISPOSABLE_PROJECT_REF);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("F13-R16 qualify runtime context helper stays disposable-bound", () => {
  const ctx = qualificationResetRuntimeContext({
    functionalCandidateSha: CANDIDATE_SHA,
    closureDigest: CLOSURE_DIGEST,
    syntheticBinding: true,
    bindingRole: "negative-test-input",
  });
  assert.equal(ctx.targetRef, APPROVED_DISPOSABLE_PROJECT_REF);
  assert.equal(ctx.scopeSqlIdentitySha256, scopeSqlIdentityDigest());
  assert.notEqual(ctx.targetRef, PRODUCTION_REF);
  assert.equal(ctx.bindingRole, "negative-test-input");
  assert.equal(ctx.syntheticBinding, true);
  assert.notEqual(ctx.closureDigest, F13_SUMMARY_FILE_HASH_FORBIDDEN);
});

test("F13-R17 hardcoded empty inventory is refused until capture is wired", () => {
  const uncaptured = planQualificationReset(planInput({
    observedObjects: [],
    observedDependencies: [],
    observedHistoryRows: [],
    inventoryCaptured: false,
  }));
  assert.equal(uncaptured.ok, false);
  assert.equal(uncaptured.code, F13_INVENTORY_CAPTURE_REQUIRED);
  assert.equal(uncaptured.sql, undefined);
  assert.notEqual(uncaptured.verdict, F13_RESET_SUCCESS_VERDICT);

  const capturedClean = planQualificationReset(planInput({
    observedObjects: [],
    observedDependencies: [],
    observedHistoryRows: [],
    inventoryCaptured: true,
    captureComplete: true,
  }));
  assert.equal(capturedClean.ok, true);
  assert.equal(capturedClean.alreadyClean, true);
  assert.equal(capturedClean.eligible, false);
  assert.equal(capturedClean.sql, null);
  assert.equal(capturedClean.mutation, false);
  assert.equal(capturedClean.verdict, F13_RESET_ALREADY_CLEAN_VERDICT);
});

test("F13-R18 leftover emit requires eligible===true; alreadyClean is no-mutation", () => {
  const leftover = planQualificationReset(planInput());
  assert.equal(leftover.ok, true);
  assert.equal(leftover.eligible, true);
  assert.equal(leftover.alreadyClean, false);
  assert.equal(typeof leftover.sql, "string");
  assert.match(leftover.sql, /DROP TABLE IF EXISTS public\.financial_accounts RESTRICT/);

  const extra = planQualificationReset(planInput({
    observedObjects: ["public.not_on_allowlist"],
    inventoryCaptured: true,
  }));
  assert.equal(extra.ok, false);
  assert.notEqual(extra.eligible, true);
  assert.equal(extra.sql, undefined);
});

test("F13-R19 qualify-main path wires INVENTORY_CAPTURE_SQL before plan/emit", async () => {
  assert.equal(runHostedQualificationReset, runQualificationResetQualifyPath);
  let capturedSql = "";
  let capturedInventorySql = "";
  let captureRequest = null;
  const { result, emit } = await runQualifyMainPath({
    captureInventory: async (request) => {
      captureRequest = request;
      capturedSql = request.sql;
      capturedInventorySql = request.inventoryCaptureSql;
      return leftoverCaptureBody();
    },
  });
  assert.equal(result.inventoryCaptured, true);
  assert.equal(result.captureSqlWired, true);
  assert.equal(capturedSql, QUALIFICATION_RESET_INVENTORY_CAPTURE_SQL);
  assert.equal(capturedInventorySql, INVENTORY_CAPTURE_SQL);
  assert.match(capturedSql, /INVENTORY_CAPTURE_SQL/);
  assert.deepEqual(result.observedFromCapture.observedObjects, ["public.financial_accounts"]);
  assert.equal(result.observedFromCapture.observedHistoryRows.length, AUTHENTICATED_HISTORY_KEYS.length);
  assert.notDeepEqual(result.observedFromCapture.observedObjects, []);
  assert.equal(result.plan.eligible, true);
  assert.equal(typeof result.plan.sql, "string");
  assert.match(result.plan.sql, /DROP TABLE IF EXISTS public\.financial_accounts RESTRICT/);
  assert.equal(result.ok, true);
  assert.equal(result.verdict, F13_RESET_SUCCESS_VERDICT);
  assert.notEqual(result.verdict, FILE_BASED_RUNNER_VERDICTS.HOLD);
  assert.equal(emit.verdict, F13_RESET_SUCCESS_VERDICT);
  assert.notEqual(emit.verdict, FILE_BASED_RUNNER_VERDICTS.HOLD);
  assert.equal(emit.ok, true);
  assert.equal(captureRequest.inventoryCaptureSqlArtifact.includes("INVENTORY_CAPTURE_SQL"), true);
});

test("F13-R20 qualify-main empty capture is alreadyClean no-mutation; missing capture is refused", async () => {
  const clean = await runQualifyMainPath({ captureBody: emptyCaptureBody() });
  assert.equal(clean.result.ok, true);
  assert.equal(clean.result.alreadyClean, true);
  assert.equal(clean.result.executed, false);
  assert.equal(clean.result.committed, false);
  assert.equal(clean.result.mutation, false);
  assert.equal(clean.result.spies.transportCalls, 0);
  assert.equal(clean.result.spies.applyCalls, 0);
  assert.equal(clean.result.plan.sql, null);
  assert.equal(clean.result.verdict, F13_RESET_ALREADY_CLEAN_VERDICT);
  assert.notEqual(clean.result.verdict, FILE_BASED_RUNNER_VERDICTS.HOLD);
  assert.equal(clean.emit.verdict, F13_RESET_ALREADY_CLEAN_VERDICT);
  assert.notEqual(clean.emit.verdict, FILE_BASED_RUNNER_VERDICTS.HOLD);

  const missing = await runQualifyMainPath({
    captureInventory: async () => null,
  });
  assert.equal(missing.result.ok, false);
  assert.equal(missing.result.code, F13_INVENTORY_CAPTURE_REQUIRED);
  assert.equal(missing.result.inventoryCaptured, false);
  assert.equal(missing.emit.verdict, FILE_BASED_RUNNER_VERDICTS.HOLD);
  assert.equal(missing.result.spies.transportCalls || 0, 0);

  const unwired = await runQualificationResetQualifyPath({
    authorization: validArtifact(),
    runtimeContext: runtimeContext(),
    allowLiveCapture: false,
    allowDisabledTransport: true,
  });
  assert.equal(unwired.ok, false);
  assert.equal(unwired.code, F13_INVENTORY_CAPTURE_REQUIRED);
  assert.equal(qualificationResetQualifyEmitPayload(unwired).verdict, FILE_BASED_RUNNER_VERDICTS.HOLD);
});

test("F13-R21 qualify-main leftover path requires eligible===true; extras HOLD with no DROP", async () => {
  const extra = await runQualifyMainPath({
    captureBody: leftoverCaptureBody({
      observed_objects: ["public.not_on_allowlist"],
    }),
  });
  assert.equal(extra.result.ok, false);
  assert.notEqual(extra.result.eligible, true);
  assert.equal(extra.result.code, "F13_UNEXPECTED_OBJECT_OR_DEPENDENCY");
  assert.equal(extra.result.spies.transportCalls || 0, 0);
  assert.equal(extra.emit.verdict, FILE_BASED_RUNNER_VERDICTS.HOLD);
  assert.equal(extra.emit.ok, false);

  const leftover = await runQualifyMainPath({ captureBody: leftoverCaptureBody() });
  assert.equal(leftover.result.ok, true);
  assert.equal(leftover.result.plan.eligible, true);
  assert.equal(leftover.result.executed, true);
  assert.equal(leftover.result.committed, true);
  assert.equal(leftover.result.verdict, F13_RESET_SUCCESS_VERDICT);
  assert.notEqual(leftover.emit.verdict, FILE_BASED_RUNNER_VERDICTS.HOLD);
  assert.equal(leftover.emit.verdict, "CLEAN_BASELINE");
  assert.equal(leftover.result.spies.captureCalls, 1);
  assert.equal(leftover.result.spies.applyCalls, 1);
});

function inventoryProcess(stdout, extra = {}) {
  return parseQualificationResetInventoryProcessResult({
    status: extra.status ?? 0,
    stdout,
    stderr: extra.stderr ?? "",
    signal: extra.signal ?? null,
    timeout: extra.timeout === true,
    argv: extra.argv || [...QUALIFICATION_RESET_INVENTORY_PSQL_ARGV, "-f", "[FILE]"],
  });
}

test("F14-R01 inventory parser rejects aligned framing and never defaults malformed to empty", () => {
  const command = buildQualificationResetInventoryPsqlCommand({
    sqlFile: "/tmp/f14-inventory.sql",
    isolatedHome: "/tmp/f14-psql-home",
  });
  assert.deepEqual(command.argv.slice(0, 7), [...QUALIFICATION_RESET_INVENTORY_PSQL_ARGV]);
  assert.equal(command.ignoreUserPsqlrc, true);
  assert.equal(command.tuplesOnlyUnaligned, true);
  assert.equal(command.readOnlyCapture, true);

  const aligned = inventoryProcess(
    "     jsonb_build_object\n-------------------------\n {\"schema\":\"f13-qualification-reset-inventory-v1\"}\n(1 row)\n",
  );
  assert.equal(aligned.ok, false);
  assert.equal(aligned.code, "F13_INVENTORY_CAPTURE_FRAMING");

  const malformedJs = inventoryProcess("{schema:anything}");
  assert.equal(malformedJs.ok, false);
  assert.equal(malformedJs.code, "F13_INVENTORY_CAPTURE_MALFORMED");
  assert.notEqual(malformedJs.alreadyClean, true);

  const wrongSchema = inventoryProcess(JSON.stringify({ schema: "anything" }));
  assert.equal(wrongSchema.ok, false);
  assert.equal(wrongSchema.code, "F13_INVENTORY_SCHEMA_MISMATCH");

  const missingFields = inventoryProcess(JSON.stringify({
    schema: QUALIFICATION_RESET_INVENTORY_SCHEMA,
    schema_version: 1,
  }));
  assert.equal(missingFields.ok, false);
  assert.equal(missingFields.code, "F13_INVENTORY_CAPTURE_INCOMPLETE");

  const wrongTypes = inventoryProcess(JSON.stringify(completeCaptureBody({
    discovered_objects: "not-an-array",
  })));
  assert.equal(wrongTypes.ok, false);
  assert.equal(wrongTypes.code, "F13_INVENTORY_CAPTURE_MALFORMED");

  const emptyOut = inventoryProcess("");
  assert.equal(emptyOut.ok, false);
  assert.equal(emptyOut.code, "F13_INVENTORY_CAPTURE_INCOMPLETE");

  const truncated = inventoryProcess('{"schema":"f13-qualification-reset-inventory-v1","schema_version":1');
  assert.equal(truncated.ok, false);
  assert.equal(truncated.code, "F13_INVENTORY_CAPTURE_MALFORMED");

  const failed = inventoryProcess("ERROR:  syntax error\n", { status: 1, stderr: "ERROR:  syntax error" });
  assert.equal(failed.ok, false);
  assert.equal(failed.code, "F13_INVENTORY_CAPTURE_PROCESS_FAILED");

  const noticeThenJson = inventoryProcess(`NOTICE: hello\n${JSON.stringify(emptyCaptureBody())}\n`);
  assert.equal(noticeThenJson.ok, false);
  assert.equal(noticeThenJson.code, "F13_INVENTORY_CAPTURE_FRAMING");

  const completeEmpty = inventoryProcess(`${JSON.stringify(emptyCaptureBody())}\n`);
  assert.equal(completeEmpty.ok, true);
  assert.equal(completeEmpty.body.capture_complete, true);
});

test("F14-R02 unexpected objects/deps stay in discovered universe and block apply", () => {
  const hidden = leftoverCaptureBody({
    discovered_objects: ["public.financial_accounts", "public.unexpected_view"],
    observed_objects: ["public.financial_accounts"],
  });
  const incomplete = observedFromQualificationResetCapture(hidden);
  assert.equal(incomplete.ok, false);
  assert.equal(incomplete.code, "F13_INVENTORY_CAPTURE_INCOMPLETE");

  const view = evaluateQualificationResetEligibility({
    observedObjectIdentities: ["public.financial_accounts", "public.unexpected_view"],
    observedDependencies: [],
    observedHistoryRows: authenticatedHistory(),
    inventoryCaptured: true,
    captureComplete: true,
  });
  assert.equal(view.ok, false);
  assert.equal(view.eligible, false);
  assert.equal(view.code, "F13_UNEXPECTED_OBJECT_OR_DEPENDENCY");

  const dep = planQualificationReset(planInput({
    observedObjects: ["public.financial_accounts"],
    observedDependencies: ["unexpected_view_dep"],
  }));
  assert.equal(dep.ok, false);
  assert.notEqual(dep.eligible, true);

  const noEvidence = evaluateQualificationResetEligibility({
    observedObjectIdentities: [],
    observedDependencies: [],
    observedHistoryRows: [],
    inventoryCaptured: true,
    captureComplete: false,
  });
  assert.equal(noEvidence.alreadyClean, false);
  assert.equal(noEvidence.code, F13_INVENTORY_CAPTURE_REQUIRED);
});

test("F14-R03 catalog-backed function identities canonicalize named args without stripping", () => {
  const named = "public.post_financial_opening_cash(p_command jsonb)";
  const catalog = canonicalizeFunctionIdentity(named);
  assert.equal(catalog, "public.post_financial_opening_cash(jsonb)");
  assert.equal(functionIdentitiesEqual(named, "public.post_financial_opening_cash(jsonb)"), true);
  assert.equal(
    functionIdentitiesEqual(
      "public.get_financial_cashbook(p_group uuid, p_from timestamp with time zone, p_to timestamptz, p_fund uuid, p_kind text, p_limit integer, p_offset integer)",
      "public.get_financial_cashbook(uuid,timestamp with time zone,timestamp with time zone,uuid,text,integer,integer)",
    ),
    true,
  );
  assert.equal(
    canonicalizeFunctionIdentity("public.notification_policy_set_updated_at()"),
    "public.notification_policy_set_updated_at()",
  );
  assert.equal(
    canonicalizeFunctionIdentity("public.enqueue_outbound_notification(text,uuid,public.notification_channel,uuid,text)"),
    "public.enqueue_outbound_notification(text,uuid,notification_channel,uuid,text)",
  );
  assert.equal(canonicalizeFunctionIdentity("financial_core.demo(text[])"), "financial_core.demo(text[])");
  assert.equal(canonicalizeFunctionIdentity("financial_core.demo(text ARRAY)"), "financial_core.demo(text[])");
  assert.equal(canonicalizeFunctionIdentity("financial_core.demo(p_ids text ARRAY)"), "financial_core.demo(text[])");
  const allowed = validateObjectAllowlist([
    "public.post_financial_opening_cash(p_command jsonb)",
    "public.notification_policy_set_updated_at()",
    "public.enqueue_outbound_notification(text, uuid, notification_channel, uuid, text)",
  ], []);
  assert.equal(allowed.ok, true);
  const extraFn = validateObjectAllowlist(["public.zero_arg_probe()"], []);
  assert.equal(extraFn.ok, false);
});

test("F14-R04 real transport contract: status0, SQL fail, truncate, COMMIT loss, timeout, ECONNRESET", async () => {
  const statusOnly = interpretQualificationResetTransportResult({
    status: 0,
    stdout: "COMMIT\n",
    stderr: "",
    argv: [...QUALIFICATION_RESET_APPLY_PSQL_ARGV, "-f", "[FILE]"],
  });
  assert.equal(statusOnly.committed, false);
  assert.equal(statusOnly.fabricatedFromExitAlone, false);
  assert.equal(statusOnly.rolledBack, null);

  const statusOnlyRun = await runResetCase({ disabledScript: { failAt: "success_status_only" } });
  assert.equal(statusOnlyRun.result.ok, false);
  assert.equal(statusOnlyRun.result.code, "F13_RESET_NOT_COMMITTED");
  assert.notEqual(statusOnlyRun.result.verdict, F13_RESET_SUCCESS_VERDICT);
  assert.equal(statusOnlyRun.result.spies.replayCalls, 0);

  const sqlFail = await runResetCase({ disabledScript: { failAt: "sql_failure" } });
  assert.equal(sqlFail.result.ok, false);
  assert.equal(sqlFail.result.code, "F13_RESET_SQL_FAILED");
  assert.equal(sqlFail.result.rolledBack, null);
  assert.match(String(sqlFail.result.processResult.stderr), /syntax error/);

  const truncated = await runResetCase({ disabledScript: { failAt: "truncated" } });
  assert.equal(truncated.result.ok, false);
  assert.equal(truncated.result.uncertainCommit, true);
  assert.equal(truncated.result.code, "UNCERTAIN_COMMIT");
  assert.equal(truncated.result.rolledBack, null);
  assert.equal(truncated.result.spies.replayCalls, 0);

  const lost = await runResetCase({ disabledScript: { failAt: "uncertain_commit" } });
  assert.equal(lost.result.code, "UNCERTAIN_COMMIT");
  assert.equal(lost.result.rolledBack, null);
  assert.notEqual(lost.result.code, "F13_RESET_SQL_FAILED");

  const timeout = await runResetCase({ disabledScript: { failAt: "timeout" } });
  assert.equal(timeout.result.code, "UNCERTAIN_COMMIT");
  assert.equal(timeout.result.rolledBack, null);
  assert.equal(timeout.result.automaticReplay, false);

  const reset = await runResetCase({ disabledScript: { failAt: "throw_econnreset" } });
  assert.equal(reset.result.ok, false);
  assert.notEqual(reset.result.rolledBack, true);
  assert.equal(reset.result.rolledBack, null);
  assert.equal(reset.result.spies.replayCalls, 0);
  assert.match(String(reset.result.processResult.structuredError?.code || reset.result.code), /ECONNRESET|SQL_FAILED/);

  const observedRollback = await runResetCase({ disabledScript: { failAt: "rollback_observed" } });
  assert.equal(observedRollback.result.ok, false);
  assert.equal(observedRollback.result.rolledBack, true);
  assert.equal(observedRollback.result.spies.rollbackObserved, 1);
  assert.equal(observedRollback.result.committed, false);
});

test("F14-R05 committed local proof helper reports wipe rejection and MUST_LOCAL honestly", async () => {
  const { proveQualificationResetLocal } = await import("./prove-f3-qualification-reset-local.mjs");
  const proof = await proveQualificationResetLocal();
  assert.equal(proof.schema, "f14-qualification-reset-local-proof-v1");
  assert.equal(proof.hostedIdentityProof, false);
  assert.equal(proof.disposableContact, false);
  assert.equal(proof.wipeRejectionCode, F13_WIPE_REJECTION_CODE);
  assert.equal(proof.overallOk, true);
  assert.ok(proof.distinctions.checks > 0);
  assert.ok(proof.cases.some((row) => row.id === "WIPE_STILL_REJECTED" && row.ok === true));
  if (proof.localPg.available !== true) {
    assert.equal(proof.mustLocal, true);
    assert.equal(proof.localPg.classification, "MUST_LOCAL");
  }
});

test("F14-R06 runtime closure is entrypoint digest, not summary-file hash", () => {
  const closures = publishQualificationResetClosures();
  assert.equal(closures.runtime.label, F13_F14_RUNTIME_CLOSURE_LABEL);
  assert.equal(closures.completeVerificationUnion.label, F13_F14_VERIFICATION_UNION_LABEL);
  assert.notEqual(closures.runtime.label, closures.completeVerificationUnion.label);
  assert.notEqual(closures.runtime.sha256, F13_SUMMARY_FILE_HASH_FORBIDDEN);
  assert.notEqual(closures.completeVerificationUnion.sha256, F13_SUMMARY_FILE_HASH_FORBIDDEN);
  assert.equal(closures.runtime.entrypoint, "scripts/qualify-f3-db-push-disposable.mjs");
  assert.equal(closures.completeVerificationUnion.proofHelperIncluded, true);
  assert.ok(closures.completeVerificationUnion.files.includes(QUALIFICATION_RESET_LOCAL_PROOF_HELPER_RELPATH));
  assert.equal(closures.crlf.normalizedForPass, false);
  assert.equal(closures.identities.gitBlob, "gitBlobSha1");
  assert.equal(closures.identities.workingTree, "worktreeSha256");
  assert.equal(closures.identities.executedByte, "executedByteSha256");
  assert.equal(closures.f13BaselineCitedNotExpected.runtime.sha256, "51c4a98fe2f249978dad09451b1a5e4a88617b833f66cafb6252870e6be7ed6d");
  assert.equal(closures.f13BaselineCitedNotExpected.union.sha256, "a317ff4f2008e15579e39769f1ed0b151f612a23e5ed444db238cae39c7387fe");
  assert.equal(closures.f13BaselineCitedNotExpected.runtime.notExpectedF14, true);
  const publishedCtx = qualificationResetRuntimeContext();
  assert.equal(publishedCtx.closureDigest, closures.runtime.sha256);
  assert.notEqual(publishedCtx.closureDigest, F13_SUMMARY_FILE_HASH_FORBIDDEN);
});

test("F14-R07 proposed hosted plan is complete, offline, and unauthorized", () => {
  const plan = buildProposedQualificationResetHostedPlan();
  assert.match(plan.status, /PROPOSED ONLY/);
  assert.equal(plan.authorized, false);
  assert.equal(plan.executed, false);
  assert.equal(plan.commands.reset[0], "node");
  assert.equal(plan.commands.reset[1], F14_PROPOSED_RESET_COMMAND);
  assert.ok(plan.commands.reset.includes("--qualification-reset"));
  assert.ok(plan.commands.completeQualFrom00118.includes("--no-wipe"));
  assert.ok(plan.commands.completeQualFrom00118.includes("--prep-floor"));
  assert.ok(plan.commands.completeQualFrom00118.includes("--sequence-f3"));
  assert.equal(plan.budget.constrainedResets, 1);
  assert.equal(plan.budget.completeQualsFrom00118, 1);
  assert.equal(plan.budget.secondReset, false);
  assert.equal(plan.uncertainOutcomeNoReplay, true);
  assert.equal(plan.stopOnUnexpected, true);
  const offline = validateProposedQualificationResetHostedPlanOffline(plan);
  assert.equal(offline.ok, true);
  assert.equal(offline.noResetOccurred, true);
  assert.equal(offline.transportsDisabled, true);
  assert.equal(offline.wipeToBaselineStillRejected, true);
});
