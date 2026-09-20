/**
 * F13 Phase 2 qualification-reset local tests.
 * Transport-disabled adapters + operation spies. No hosted/disposable contact.
 * Exercises the same runQualificationReset orchestration as qualify main.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  APPROVED_DISPOSABLE_PROJECT_REF,
  PRODUCTION_REF,
} from "./lib/f3-db-push-pins.mjs";
import {
  BASELINE_AFFECTING_INVENTORY_FIELDS,
  FAILED_FLOOR_STORAGE_BUCKETS,
  FAILED_FLOOR_STORAGE_POLICY_NAMES,
  QUALIFICATION_RESET_INVENTORY_PSQL_ARGV,
  QUALIFICATION_RESET_INVENTORY_SCHEMA,
  F21_QUALIFICATION_RESET_INVENTORY_SCHEMA,
  buildQualificationResetInventoryPsqlCommand,
  classifyInventory,
  completeCaptureBody,
  emptyQualificationResetInventoryObject,
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
  F13_F15_RUNTIME_CLOSURE_LABEL,
  F13_F15_VERIFICATION_UNION_LABEL,
  F13_F16_RUNTIME_CLOSURE_LABEL,
  F13_F16_VERIFICATION_UNION_LABEL,
  F13_F17_RUNTIME_CLOSURE_LABEL,
  F13_F17_VERIFICATION_UNION_LABEL,
  F13_F18_RUNTIME_CLOSURE_LABEL,
  F13_F18_VERIFICATION_UNION_LABEL,
  F13_F19_RUNTIME_CLOSURE_LABEL,
  F13_F19_VERIFICATION_UNION_LABEL,
  F16_BASELINE_RUNTIME_CLOSURE,
  F16_BASELINE_VERIFICATION_UNION,
  F16_HISTORICAL_RUNTIME_CLOSURE_LABEL,
  F17_BASELINE_RUNTIME_CLOSURE,
  F17_BASELINE_VERIFICATION_UNION,
  F17_HISTORICAL_RUNTIME_CLOSURE_LABEL,
  F18_BASELINE_RUNTIME_CLOSURE,
  F18_BASELINE_VERIFICATION_UNION,
  F18_HISTORICAL_RUNTIME_CLOSURE_LABEL,
  PROCESS_EVIDENCE_CONTRACT,
  PROCESS_EVIDENCE_SANITIZATION_RULES,
  QUALIFICATION_RESET_ISOLATION_LEVEL,
  QUALIFICATION_RESET_LOCK_ORDER,
  adaptStoredProcessRecordToParserInput,
  attestQualificationResetReparse,
  classifyProcessEvidenceShape,
  evaluateBackendBoundLockProof,
  finalizeQualificationResetAttestations,
  packageQualificationResetProcessEvidence,
  parseBoundResetObservationLine,
  scanEvidenceValueForLeaks,
  F15_BASELINE_RUNTIME_CLOSURE,
  F13_INVENTORY_CAPTURE_REQUIRED,
  F13_RESET_ALREADY_CLEAN_VERDICT,
  F13_RESET_SUCCESS_VERDICT,
  F21_RESET_ALREADY_CLEAN_VERDICT,
  F21_RESET_SUCCESS_VERDICT,
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
  parseQualificationResetTxObservationStdout,
  planQualificationReset,
  publishQualificationResetClosures,
  runQualificationReset,
  TX_OBSERVATION_SCHEMA,
  TX_OBSERVATION_SUCCESS_SEQUENCE,
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
  QUALIFICATION_VERIFICATION_MODES,
  qualificationResetQualifyEmitPayload,
  qualificationResetRuntimeContext,
  resolveQualificationVerificationMode,
  runHostedQualificationReset,
  runQualificationResetQualifyPath,
  runQualifyDisposablePath,
  validateProposedQualificationResetHostedPlanOffline,
  verifyExactForwardHistoryIdentities,
} from "./qualify-f3-db-push-disposable.mjs";
import {
  evaluatePreserveBaselinePreFloorGate,
  evaluatePreStubFloorCleanCheck,
  passingPreStubFloorCleanInventory,
  resolvePreFloorQualificationGate,
  F21_PRESERVE_BASELINE_FRESH_CAPTURE_REQUIRED,
  F21_PRESERVE_BASELINE_POLICY_UNSUPPORTED,
  F21_PRESERVE_BASELINE_TARGET_REJECTED,
} from "./lib/f3-db-push-pre-stub-floor-clean-check.mjs";
import {
  F21_AUTHORIZED_EXTENSION_IDENTITY,
  F21_QUALIFICATION_RESET_MEMBERSHIP_SCHEMA,
} from "./lib/f3-db-push-qualification-reset-design.mjs";
import { processEvidence, record } from "./prove-f3-qualification-reset-local.mjs";

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
  assert.match(sql.sql, /BEGIN ISOLATION LEVEL READ COMMITTED/);
  assert.doesNotMatch(sql.sql, /BEGIN ISOLATION LEVEL SERIALIZABLE/);
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
  assert.equal(result.verdict, F21_RESET_SUCCESS_VERDICT);
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

  const capturedWithoutFacts = planQualificationReset(planInput({
    observedObjects: [],
    observedDependencies: [],
    observedHistoryRows: [],
    inventoryCaptured: true,
    captureComplete: true,
  }));
  assert.equal(capturedWithoutFacts.ok, false);
  assert.notEqual(capturedWithoutFacts.alreadyClean, true);
  assert.notEqual(capturedWithoutFacts.verdict, F13_RESET_ALREADY_CLEAN_VERDICT);

  const capturedClean = planQualificationReset(planInput({
    observedObjects: [],
    observedDependencies: [],
    observedHistoryRows: [],
    inventory: emptyQualificationResetInventoryObject(),
    inventoryCaptured: true,
    captureComplete: true,
  }));
  assert.equal(capturedClean.ok, true);
  assert.equal(capturedClean.alreadyClean, true);
  assert.equal(capturedClean.eligible, false);
  assert.equal(capturedClean.sql, null);
  assert.equal(capturedClean.mutation, false);
  assert.equal(capturedClean.verdict, F21_RESET_ALREADY_CLEAN_VERDICT);
});

test("F13-R18 leftover emit requires eligible===true; alreadyClean is no-mutation", () => {
  const leftover = planQualificationReset(planInput());
  assert.equal(leftover.ok, true);
  assert.equal(leftover.eligible, true);
  assert.equal(leftover.alreadyClean, false);
  assert.equal(typeof leftover.sql, "string");
  assert.match(leftover.sql, /DROP TABLE IF EXISTS public\.financial_accounts RESTRICT/);
  assert.doesNotMatch(leftover.sql, /DROP EXTENSION/i);
  assert.doesNotMatch(leftover.sql, /ALTER EXTENSION/i);
  assert.doesNotMatch(leftover.sql, /\bCASCADE\b/i);

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
  assert.equal(result.observedFromCapture.observedObjects.length, 1);
  assert.equal(result.observedFromCapture.observedObjects[0].identity, "public.financial_accounts");
  assert.equal(result.observedFromCapture.observedHistoryRows.length, AUTHENTICATED_HISTORY_KEYS.length);
  assert.notDeepEqual(result.observedFromCapture.observedObjects, []);
  assert.equal(result.plan.eligible, true);
  assert.equal(typeof result.plan.sql, "string");
  assert.match(result.plan.sql, /DROP TABLE IF EXISTS public\.financial_accounts RESTRICT/);
  assert.equal(result.ok, true);
  assert.equal(result.verdict, F21_RESET_SUCCESS_VERDICT);
  assert.notEqual(result.verdict, FILE_BASED_RUNNER_VERDICTS.HOLD);
  assert.equal(emit.verdict, F21_RESET_SUCCESS_VERDICT);
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
  assert.equal(clean.result.verdict, F21_RESET_ALREADY_CLEAN_VERDICT);
  assert.notEqual(clean.result.verdict, FILE_BASED_RUNNER_VERDICTS.HOLD);
  assert.equal(clean.emit.verdict, F21_RESET_ALREADY_CLEAN_VERDICT);
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
      inventory: {
        public_tables: ["not_on_allowlist"],
        schema_migrations_rows: AUTHENTICATED_HISTORY_KEYS.length,
      },
      discovered_objects: ["public.not_on_allowlist"],
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
  assert.equal(leftover.result.verdict, F21_RESET_SUCCESS_VERDICT);
  assert.notEqual(leftover.emit.verdict, FILE_BASED_RUNNER_VERDICTS.HOLD);
  assert.equal(leftover.emit.verdict, F21_RESET_SUCCESS_VERDICT);
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
    schema: F21_QUALIFICATION_RESET_INVENTORY_SCHEMA,
    schema_version: 1,
  }));
  assert.equal(missingFields.ok, false);
  assert.equal(missingFields.code, "F13_INVENTORY_CAPTURE_INCOMPLETE");

  const staleF13 = inventoryProcess(JSON.stringify({
    schema: QUALIFICATION_RESET_INVENTORY_SCHEMA,
    schema_version: 1,
  }));
  assert.equal(staleF13.ok, false);
  assert.equal(staleF13.code, "F21_MEMBERSHIP_SCHEMA_STALE");

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
  assert.equal(proof.schema, "f18-qualification-reset-local-proof-v1");
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
  assert.equal(closures.runtime.label, F13_F15_RUNTIME_CLOSURE_LABEL);
  assert.equal(closures.completeVerificationUnion.label, F13_F15_VERIFICATION_UNION_LABEL);
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
  assert.equal(closures.f14BaselineCitedNotExpected.runtime.sha256, "f6205869b233eaccf375b299112f7b9c352d58c6f2659471e06d2ca7a241e31d");
  assert.equal(closures.f14BaselineCitedNotExpected.union.sha256, "f6ff6e42b4b5ec14b1a67fe88377d7deafe5f12f2c2c35c834e7c763711e7caa");
  assert.equal(closures.f14BaselineCitedNotExpected.runtime.notExpectedF15, true);
  assert.equal(closures.runtime.label, F13_F16_RUNTIME_CLOSURE_LABEL);
  assert.equal(closures.completeVerificationUnion.label, F13_F16_VERIFICATION_UNION_LABEL);
  assert.equal(closures.runtime.label, F13_F17_RUNTIME_CLOSURE_LABEL);
  assert.equal(closures.completeVerificationUnion.label, F13_F17_VERIFICATION_UNION_LABEL);
  assert.equal(closures.runtime.label, F13_F18_RUNTIME_CLOSURE_LABEL);
  assert.equal(closures.completeVerificationUnion.label, F13_F18_VERIFICATION_UNION_LABEL);
  assert.equal(closures.runtime.label, F13_F19_RUNTIME_CLOSURE_LABEL);
  assert.equal(closures.completeVerificationUnion.label, F13_F19_VERIFICATION_UNION_LABEL);
  assert.equal(closures.f15BaselineCitedNotExpected.runtime.sha256, F15_BASELINE_RUNTIME_CLOSURE.sha256);
  assert.equal(closures.f15BaselineCitedNotExpected.runtime.notExpectedF16, true);
  assert.equal(closures.f16BaselineCitedNotExpected.runtime.sha256, F16_BASELINE_RUNTIME_CLOSURE.sha256);
  assert.equal(closures.f16BaselineCitedNotExpected.runtime.notExpectedF17, true);
  assert.equal(closures.f16BaselineCitedNotExpected.runtime.historicalLabel, F16_HISTORICAL_RUNTIME_CLOSURE_LABEL);
  assert.equal(closures.f17BaselineCitedNotExpected.runtime.sha256, F17_BASELINE_RUNTIME_CLOSURE.sha256);
  assert.equal(closures.f17BaselineCitedNotExpected.union.sha256, F17_BASELINE_VERIFICATION_UNION.sha256);
  assert.equal(closures.f17BaselineCitedNotExpected.runtime.notExpectedF18, true);
  assert.equal(closures.f17BaselineCitedNotExpected.runtime.historicalLabel, F17_HISTORICAL_RUNTIME_CLOSURE_LABEL);
  assert.equal(closures.f18BaselineCitedNotExpected.runtime.sha256, F18_BASELINE_RUNTIME_CLOSURE.sha256);
  assert.equal(closures.f18BaselineCitedNotExpected.union.sha256, F18_BASELINE_VERIFICATION_UNION.sha256);
  assert.equal(closures.f18BaselineCitedNotExpected.runtime.notExpectedF19, true);
  assert.equal(closures.f18BaselineCitedNotExpected.runtime.historicalLabel, F18_HISTORICAL_RUNTIME_CLOSURE_LABEL);
  assert.notEqual(closures.runtime.sha256, F16_BASELINE_RUNTIME_CLOSURE.sha256);
  assert.notEqual(closures.completeVerificationUnion.sha256, F16_BASELINE_VERIFICATION_UNION.sha256);
  assert.notEqual(closures.runtime.sha256, F17_BASELINE_RUNTIME_CLOSURE.sha256);
  assert.notEqual(closures.completeVerificationUnion.sha256, F17_BASELINE_VERIFICATION_UNION.sha256);
  assert.notEqual(closures.runtime.sha256, F18_BASELINE_RUNTIME_CLOSURE.sha256);
  assert.notEqual(closures.completeVerificationUnion.sha256, F18_BASELINE_VERIFICATION_UNION.sha256);
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

function contradictoryEmptyUniverse(inventoryOverrides) {
  return completeCaptureBody({
    inventory: {
      schema_migrations_present: true,
      schema_migrations_rows: 0,
      ...inventoryOverrides,
    },
    discovered_objects: [],
    discovered_dependencies: [],
    observed_objects: [],
    observed_dependencies: [],
    observed_history_rows: [],
  });
}

const GENUINE_POSTING_EVENT_FK = Object.freeze({
  kind: "foreign_key",
  identity: "posting_command_payloads_event_id_fkey",
  from: "financial_core.posting_command_payloads",
  to: "public.financial_events",
});
const GENUINE_CORRECTION_TARGET_FK = Object.freeze({
  kind: "foreign_key",
  identity: "correction_command_payloads_target_event_id_group_id_fkey",
  from: "financial_core.correction_command_payloads",
  to: "public.financial_events",
});
const GENUINE_CORRECTION_REVERSAL_FK = Object.freeze({
  kind: "foreign_key",
  identity: "correction_command_payloads_reversal_event_id_group_id_fkey",
  from: "financial_core.correction_command_payloads",
  to: "public.financial_events",
});
const GENUINE_CORRECTION_REPLACEMENT_FK = Object.freeze({
  kind: "foreign_key",
  identity: "correction_command_payloads_replacement_event_id_group_id_fkey",
  from: "financial_core.correction_command_payloads",
  to: "public.financial_events",
});
const MEMBERSHIPS_GROUP_FK = Object.freeze({
  kind: "foreign_key",
  identity: "memberships_group_id_fkey",
  from: "public.memberships",
  to: "public.groups",
});

test("F15-C1-R01 empty discovered vs inventory.public_tables cannot be CLEAN_BASELINE", async () => {
  // F14-repro: observedFromQualificationResetCapture / qualify path treated
  // empty discovered/observed/history as alreadyClean even when
  // inventory.public_tables=["financial_accounts"].
  const body = contradictoryEmptyUniverse({ public_tables: ["financial_accounts"] });
  const observed = observedFromQualificationResetCapture(body);
  assert.equal(observed.ok, false);
  assert.notEqual(observed.alreadyClean, true);
  assert.match(String(observed.code), /INVENTORY|CONTRADICT/);

  const { result, emit } = await runQualifyMainPath({ captureBody: body });
  assert.equal(result.ok, false);
  assert.notEqual(result.alreadyClean, true);
  assert.notEqual(result.verdict, F13_RESET_ALREADY_CLEAN_VERDICT);
  assert.equal(result.spies.captureCalls, 1);
  assert.equal(result.spies.applyCalls || 0, 0);
  assert.equal(result.spies.sqlCalls || 0, 0);
  assert.equal(emit.verdict, FILE_BASED_RUNNER_VERDICTS.HOLD);
});

test("F15-C1-R02 empty discovered vs inventory.public_views cannot be CLEAN_BASELINE", async () => {
  const body = contradictoryEmptyUniverse({ public_views: ["unexpected_view"] });
  const observed = observedFromQualificationResetCapture(body);
  assert.equal(observed.ok, false);
  assert.notEqual(observed.alreadyClean, true);
  const { result } = await runQualifyMainPath({ captureBody: body });
  assert.equal(result.ok, false);
  assert.notEqual(result.alreadyClean, true);
  assert.equal(result.spies.applyCalls || 0, 0);
  assert.equal(result.verdict, FILE_BASED_RUNNER_VERDICTS.HOLD);
});

test("F15-C1-R03 empty discovered vs inventory.financial_core cannot be CLEAN_BASELINE", async () => {
  const body = contradictoryEmptyUniverse({ financial_core: true });
  const observed = observedFromQualificationResetCapture(body);
  assert.equal(observed.ok, false);
  assert.notEqual(observed.alreadyClean, true);
  const { result } = await runQualifyMainPath({ captureBody: body });
  assert.equal(result.ok, false);
  assert.notEqual(result.alreadyClean, true);
  assert.equal(result.spies.applyCalls || 0, 0);
});

test("F15-C1-R04 empty history vs inventory.schema_migrations_rows=6 cannot be CLEAN_BASELINE", async () => {
  const body = contradictoryEmptyUniverse({ schema_migrations_rows: 6 });
  const observed = observedFromQualificationResetCapture(body);
  assert.equal(observed.ok, false);
  assert.notEqual(observed.alreadyClean, true);
  const { result } = await runQualifyMainPath({ captureBody: body });
  assert.equal(result.ok, false);
  assert.notEqual(result.alreadyClean, true);
  assert.equal(result.spies.applyCalls || 0, 0);
});

test("F15-C1-R05 combined inventory contradictions HOLD with zero apply/SQL", async () => {
  const body = contradictoryEmptyUniverse({
    public_tables: ["financial_accounts"],
    public_views: ["unexpected_view"],
    financial_core: true,
    schema_migrations_rows: 6,
  });
  const observed = observedFromQualificationResetCapture(body);
  assert.equal(observed.ok, false);
  const { result } = await runQualifyMainPath({ captureBody: body });
  assert.equal(result.ok, false);
  assert.notEqual(result.alreadyClean, true);
  assert.equal(result.verdict, FILE_BASED_RUNNER_VERDICTS.HOLD);
  assert.equal(result.spies.captureCalls, 1);
  assert.equal(result.spies.applyCalls || 0, 0);
  assert.equal(result.spies.sqlCalls || 0, 0);
  assert.equal(result.plan?.sql, undefined);
});

test("F15-C1-R06 duplicate JSON member names are rejected at the raw boundary", () => {
  // F14-repro: JSON.parse keeps the later discovered_objects:[] and can hide
  // an earlier unexpected table. Duplicate keys must fail before parse discard.
  const empty = emptyCaptureBody();
  const populated = JSON.stringify([{ kind: "table", identity: "public.financial_accounts" }]);
  const raw = `${JSON.stringify(empty).slice(0, -1)},"discovered_objects":${populated},"discovered_objects":[]}`;
  assert.match(raw, /"discovered_objects":\[\{"kind":"table"/);
  assert.match(raw, /"discovered_objects":\[\]/);
  const parsedJs = JSON.parse(raw);
  assert.deepEqual(parsedJs.discovered_objects, []);

  const process = inventoryProcess(`${raw}\n`);
  assert.equal(process.ok, false);
  assert.match(String(process.code), /DUPLICATE|MALFORMED|CAPTURE/);
  assert.notEqual(process.alreadyClean, true);
  assert.notEqual(process.inventoryCaptured, true);
});

test("F15-C1-R07 genuine complete matching inventories remain usable", async () => {
  const clean = await runQualifyMainPath({ captureBody: emptyCaptureBody() });
  assert.equal(clean.result.ok, true);
  assert.equal(clean.result.alreadyClean, true);
  assert.equal(clean.result.spies.applyCalls || 0, 0);

  const leftover = leftoverCaptureBody();
  const observed = observedFromQualificationResetCapture(leftover);
  assert.equal(observed.ok, true);
  assert.equal(observed.observedObjects.length, 1);
  assert.equal(observed.observedObjects[0].identity, "public.financial_accounts");
  assert.equal(observed.inventory.public_tables.includes("financial_accounts"), true);
});

test("F15-C2-R01 same-name FK with altered endpoints is rejected before apply", async () => {
  // F14-repro: identityFromDiscovered / validateObjectAllowlist reduced deps
  // to constraint name, so memberships_group_id_fkey from financial_accounts
  // → groups was authorized by name.
  const altered = {
    kind: "foreign_key",
    identity: "memberships_group_id_fkey",
    from: "public.financial_accounts",
    to: "public.groups",
  };
  const planned = planQualificationReset(planInput({
    observedObjects: ["public.financial_accounts"],
    observedDependencies: [altered],
  }));
  assert.equal(planned.ok, false);
  assert.equal(planned.code, "F13_UNEXPECTED_OBJECT_OR_DEPENDENCY");
  assert.equal(planned.sql, undefined);
  assert.notEqual(planned.eligible, true);

  const { result } = await runQualifyMainPath({
    captureBody: leftoverCaptureBody({
      discovered_dependencies: [altered],
      observed_dependencies: [altered],
    }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "F13_UNEXPECTED_OBJECT_OR_DEPENDENCY");
  assert.equal(result.spies.applyCalls || 0, 0);
});

test("F15-C2-R02 name-only dependency strings are not a fallback identity", () => {
  const namedOnly = planQualificationReset(planInput({
    observedObjects: ["public.financial_accounts"],
    observedDependencies: ["memberships_group_id_fkey"],
  }));
  assert.equal(namedOnly.ok, false);
  assert.equal(namedOnly.code, "F13_UNEXPECTED_OBJECT_OR_DEPENDENCY");
});

test("F15-C2-R03 complete matching dependency tuples are retained through plan", () => {
  const planned = planQualificationReset(planInput({
    observedObjects: ["public.financial_accounts", "public.memberships", "public.groups"],
    observedDependencies: [MEMBERSHIPS_GROUP_FK],
  }));
  assert.equal(planned.ok, true);
  assert.equal(planned.eligible, true);
  assert.equal(planned.observed.dependencies.length, 1);
  assert.equal(typeof planned.observed.dependencies[0], "object");
  assert.equal(planned.observed.dependencies[0].identity, MEMBERSHIPS_GROUP_FK.identity);
  assert.equal(planned.observed.dependencies[0].from, MEMBERSHIPS_GROUP_FK.from);
  assert.equal(planned.observed.dependencies[0].to, MEMBERSHIPS_GROUP_FK.to);
  assert.equal(planned.observed.dependencies[0].kind, MEMBERSHIPS_GROUP_FK.kind);
});

test("F15-C3-R01 genuine migration-created financial FKs are eligible leftovers", async () => {
  // F14-repro: allowlist used descriptive aggregates, so catalog names
  // posting_command_payloads_event_id_fkey and the three correction
  // composite FKs were rejected as unexpected.
  const deps = [
    GENUINE_POSTING_EVENT_FK,
    GENUINE_CORRECTION_TARGET_FK,
    GENUINE_CORRECTION_REVERSAL_FK,
    GENUINE_CORRECTION_REPLACEMENT_FK,
  ];
  const objects = [
    "financial_core.posting_command_payloads",
    "financial_core.correction_command_payloads",
    "public.financial_events",
  ];
  const allowed = validateObjectAllowlist(objects, deps);
  assert.equal(allowed.ok, true);

  const planned = planQualificationReset(planInput({
    observedObjects: objects,
    observedDependencies: deps,
  }));
  assert.equal(planned.ok, true);
  assert.equal(planned.eligible, true);

  const { result } = await runQualifyMainPath({
    captureBody: leftoverCaptureBody({
      inventory: {
        public_tables: ["financial_events"],
        financial_core: true,
        schema_migrations_rows: AUTHENTICATED_HISTORY_KEYS.length,
      },
      discovered_objects: objects,
      observed_objects: objects,
      discovered_dependencies: deps,
      observed_dependencies: deps,
    }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.plan.eligible, true);
  assert.equal(result.verdict, F21_RESET_SUCCESS_VERDICT);
});

test("F15-C3-R02 same catalog name with altered kind/source/target is rejected", () => {
  const alteredKind = {
    ...GENUINE_POSTING_EVENT_FK,
    kind: "index",
  };
  const alteredFrom = {
    ...GENUINE_POSTING_EVENT_FK,
    from: "public.financial_accounts",
  };
  const alteredTo = {
    ...GENUINE_POSTING_EVENT_FK,
    to: "public.groups",
  };
  assert.equal(validateObjectAllowlist(["public.financial_accounts"], [alteredKind]).ok, false);
  assert.equal(validateObjectAllowlist(["public.financial_accounts"], [alteredFrom]).ok, false);
  assert.equal(validateObjectAllowlist(["public.financial_accounts"], [alteredTo]).ok, false);
  assert.equal(validateObjectAllowlist(["public.financial_accounts"], [{
    identity: "posting_command_payloads.event_id -> public.financial_events.id",
    kind: "foreign_key",
    from: "financial_core.posting_command_payloads",
    to: "public.financial_events",
  }]).ok, false);
});

test("F15-C4-R01 PREFIX+WRONG_PHASE committed+SUFFIX status0 is not CLEAN_BASELINE", async () => {
  // F14-repro: regex substring match accepted
  // PREFIX {schema:f14-qualification-reset-tx-observation-v1,phase:WRONG_PHASE,event:committed,committed:true} SUFFIX
  // with status 0 as F13_RESET_COMMITTED.
  const f14Payload = JSON.stringify({
    schema: "f14-qualification-reset-tx-observation-v1",
    phase: "WRONG_PHASE",
    event: "committed",
    committed: true,
  });
  const interpreted = interpretQualificationResetTransportResult({
    status: 0,
    stdout: `PREFIX ${f14Payload} SUFFIX\n`,
    stderr: "",
    argv: [...QUALIFICATION_RESET_APPLY_PSQL_ARGV, "-f", "[FILE]"],
  });
  assert.equal(interpreted.committed, false);
  assert.notEqual(interpreted.observed.committed, true);

  const recorder = createQualificationResetRecorder();
  const result = await runQualificationReset({
    input: planInput(),
    adapters: {
      transport: {
        kind: "f14-repro-prefix-wrong-phase",
        disabled: true,
        execute() {
          return {
            argv: [...QUALIFICATION_RESET_APPLY_PSQL_ARGV, "-f", "[FILE]"],
            status: 0,
            stdout: `PREFIX ${f14Payload} SUFFIX\n`,
            stderr: "",
            error: null,
            signal: null,
            timeout: false,
          };
        },
      },
    },
    recorder,
    allowDisabledTransport: true,
  });
  assert.equal(result.ok, false);
  assert.notEqual(result.code, "F13_RESET_COMMITTED");
  assert.notEqual(result.verdict, F13_RESET_SUCCESS_VERDICT);
  assert.equal(result.committed, false);
  assert.equal(result.spies.committedEffects, 0);
  assert.equal(result.spies.replayCalls, 0);
});

test("F15-C4-R02 PREFIX committed observation plus EACCES is not success", async () => {
  const f14Payload = JSON.stringify({
    schema: "f14-qualification-reset-tx-observation-v1",
    phase: "WRONG_PHASE",
    event: "committed",
    committed: true,
  });
  const eacces = new Error("EACCES: permission denied");
  eacces.code = "EACCES";
  const interpreted = interpretQualificationResetTransportResult({
    status: 0,
    stdout: `PREFIX ${f14Payload} SUFFIX\n`,
    stderr: "psql: permission denied",
    error: eacces,
    argv: [...QUALIFICATION_RESET_APPLY_PSQL_ARGV, "-f", "[FILE]"],
  });
  assert.equal(interpreted.committed, false);
  assert.equal(interpreted.processResult.structuredError?.code, "EACCES");

  const recorder = createQualificationResetRecorder();
  const result = await runQualificationReset({
    input: planInput(),
    adapters: {
      transport: {
        kind: "f14-repro-prefix-eacces",
        disabled: true,
        execute() {
          return {
            argv: [...QUALIFICATION_RESET_APPLY_PSQL_ARGV, "-f", "[FILE]"],
            status: 0,
            stdout: `PREFIX ${f14Payload} SUFFIX\n`,
            stderr: "psql: permission denied",
            error: eacces,
            signal: null,
            timeout: false,
          };
        },
      },
    },
    recorder,
    allowDisabledTransport: true,
  });
  assert.equal(result.ok, false);
  assert.notEqual(result.verdict, F13_RESET_SUCCESS_VERDICT);
  assert.equal(result.committed, false);
  assert.equal(result.spies.replayCalls, 0);
});

function f15SuccessObservationStdout({ leadingVoidSelectBlank = false } = {}) {
  const records = TX_OBSERVATION_SUCCESS_SEQUENCE.map((row) => (
    JSON.stringify({ schema: TX_OBSERVATION_SCHEMA, ...row })
  ));
  const body = `${records.join("\n")}\n`;
  // psql -At emits an empty field for SELECT pg_advisory_xact_lock(...)::void
  return leadingVoidSelectBlank ? `\n${body}` : body;
}

test("F15-C4-R04 advisory-lock void SELECT blank line must not break success observation framing", async () => {
  // Chief HOLD on a4fa0832: void pg_advisory_xact_lock under psql -At prints a
  // blank line that F15 treated as F13_TX_OBSERVATION_FRAMING, so the success
  // TX never recorded commit even when physical state was CLEAN.
  const voidThenComplete = f15SuccessObservationStdout({ leadingVoidSelectBlank: true });
  assert.equal(voidThenComplete.startsWith("\n{"), true);
  assert.match(voidThenComplete, /^$/m);

  const parsed = parseQualificationResetTxObservationStdout(voidThenComplete);
  assert.equal(parsed.ok, true, parsed.reason || parsed.code);
  assert.equal(parsed.observations.length, TX_OBSERVATION_SUCCESS_SEQUENCE.length);
  assert.equal(parsed.code, undefined);

  const interpreted = interpretQualificationResetTransportResult({
    status: 0,
    stdout: voidThenComplete,
    stderr: "",
    argv: [...QUALIFICATION_RESET_APPLY_PSQL_ARGV, "-f", "[FILE]"],
  });
  assert.equal(interpreted.observed.framingOk, true);
  assert.equal(interpreted.committed, true);
  assert.equal(interpreted.observed.observations.at(-1)?.event, "committed");

  const recorder = createQualificationResetRecorder();
  const result = await runQualificationReset({
    input: planInput(),
    adapters: {
      transport: {
        kind: "advisory-lock-void-select-stdout",
        disabled: true,
        execute() {
          return {
            argv: [...QUALIFICATION_RESET_APPLY_PSQL_ARGV, "-f", "[FILE]"],
            status: 0,
            stdout: voidThenComplete,
            stderr: "",
            error: null,
            signal: null,
            timeout: false,
          };
        },
      },
    },
    recorder,
    allowDisabledTransport: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.committed, true);
  assert.equal(result.verdict, F21_RESET_SUCCESS_VERDICT);
  assert.equal(result.code, "F13_RESET_COMMITTED");
  assert.equal(result.spies.replayCalls, 0);

  const sql = buildQualificationResetSql({
    observedHistoryRows: authenticatedHistory(),
    scopeSqlIdentitySha256: scopeSqlIdentityDigest(),
  });
  assert.equal(sql.ok, true);
  assert.match(sql.sql, /PERFORM\s+pg_advisory_xact_lock\s*\(/);
  const withoutDoBlocks = sql.sql.replace(/DO \$[A-Za-z0-9_]+\$[\s\S]*?\$[A-Za-z0-9_]+\$;/g, "");
  assert.doesNotMatch(withoutDoBlocks, /SELECT\s+pg_advisory_xact_lock\s*\(/);

  const prefixStillRejected = interpretQualificationResetTransportResult({
    status: 0,
    stdout: `PREFIX ${JSON.stringify({
      schema: "f14-qualification-reset-tx-observation-v1",
      phase: "WRONG_PHASE",
      event: "committed",
      committed: true,
    })} SUFFIX\n`,
    stderr: "",
  });
  assert.equal(prefixStillRejected.committed, false);
});

test("F15-C4-R03 new protocol still rejects equivalent WRONG_PHASE / missing / reorder mutations", async () => {
  const { TX_OBSERVATION_SCHEMA } = await import("./lib/f3-db-push-qualification-reset.mjs");
  assert.notEqual(TX_OBSERVATION_SCHEMA, "f14-qualification-reset-tx-observation-v1");
  assert.match(TX_OBSERVATION_SCHEMA, /f15-qualification-reset-tx-observation/);

  const wrongPhase = JSON.stringify({
    schema: TX_OBSERVATION_SCHEMA,
    phase: "WRONG_PHASE",
    event: "committed",
    committed: true,
  });
  const wrong = interpretQualificationResetTransportResult({
    status: 0,
    stdout: `${wrongPhase}\n`,
    stderr: "",
  });
  assert.equal(wrong.committed, false);

  const reordered = interpretQualificationResetTransportResult({
    status: 0,
    stdout: [
      JSON.stringify({ schema: TX_OBSERVATION_SCHEMA, phase: "T7_COMMIT", event: "committed", committed: true }),
      JSON.stringify({ schema: TX_OBSERVATION_SCHEMA, phase: "T1_BEGIN", event: "began" }),
      JSON.stringify({ schema: TX_OBSERVATION_SCHEMA, phase: "T7_COMMIT", event: "commit_attempted" }),
    ].join("\n") + "\n",
    stderr: "",
  });
  assert.equal(reordered.committed, false);

  const missingBegin = interpretQualificationResetTransportResult({
    status: 0,
    stdout: [
      JSON.stringify({ schema: TX_OBSERVATION_SCHEMA, phase: "T7_COMMIT", event: "commit_attempted" }),
      JSON.stringify({ schema: TX_OBSERVATION_SCHEMA, phase: "T7_COMMIT", event: "committed", committed: true }),
    ].join("\n") + "\n",
    stderr: "",
  });
  assert.equal(missingBegin.committed, false);
});

test("F15-C5-R01 committed helper records three real TX scenarios or MUST_LOCAL", async () => {
  const { proveQualificationResetLocal } = await import("./prove-f3-qualification-reset-local.mjs");
  const proof = await proveQualificationResetLocal();
  assert.equal(proof.hostedIdentityProof, false);
  assert.equal(proof.disposableContact, false);
  assert.equal(proof.wipeRejectionCode, F13_WIPE_REJECTION_CODE);
  const required = [
    "TX_SUCCESSFUL_RESET",
    "TX_UNEXPECTED_OBJECT_ROLLBACK",
    "TX_HISTORY_MISMATCH_ROLLBACK",
    "TX_T3_UNAPPROVED_FK_ROLLBACK",
    "TX_T3_RETARGETED_FK_ROLLBACK",
    "TX_T3_APPROVED_SET_SUCCESS",
    "TX_T3_LOCKWAIT_UNAPPROVED_FK_ROLLBACK",
    "TX_T3_LOCKWAIT_RETARGETED_FK_ROLLBACK",
  ];
  for (const id of required) {
    assert.ok(proof.cases.some((row) => row.id === id), `missing ${id}`);
  }
  assert.ok(proof.cases.some((row) => row.id === "UNEXPECTED_OBJECT_BLOCKS_BEFORE_PLAN"));
  assert.ok(proof.cases.some((row) => row.id === "WIPE_STILL_REJECTED" && row.ok === true));
  if (proof.localPg.available !== true) {
    assert.equal(proof.mustLocal, true);
    assert.equal(proof.localPg.classification, "MUST_LOCAL");
    for (const id of required) {
      const row = proof.cases.find((item) => item.id === id);
      assert.equal(row.ok, true);
      assert.equal(row.executedTransaction, false);
      assert.match(String(row.note || row.code || ""), /MUST_LOCAL/);
    }
  } else {
    assert.equal(proof.distinctions.executedTransactions >= 8, true);
    for (const id of required) {
      const row = proof.cases.find((item) => item.id === id);
      assert.equal(row.ok, true);
      assert.equal(row.executedTransaction, true);
    }
  }
});

test("F15-C6-R01 hosted plan builder emits complete unauthorized candidate plan", async () => {
  const qualify = await import("./qualify-f3-db-push-disposable.mjs");
  assert.equal(typeof qualify.renderProposedQualificationResetHostedPlanMarkdown, "function");
  const plan = qualify.buildProposedQualificationResetHostedPlan();
  assert.match(plan.status, /PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE/);
  assert.equal(plan.authorized, false);
  assert.equal(plan.executed, false);
  assert.equal(plan.target.accept, APPROVED_DISPOSABLE_PROJECT_REF);
  assert.ok(plan.target.reject.includes(PRODUCTION_REF));
  assert.ok(Array.isArray(plan.commands.reset));
  assert.ok(plan.commands.reset.includes("--qualification-reset"));
  assert.ok(plan.commands.completeQualFrom00118.includes("--no-wipe"));
  assert.ok(plan.commands.completeQualFrom00118.includes("--sequence-f3"));
  assert.ok(plan.objectScopeCount > 0);
  assert.ok(plan.dependencyScopeCount > 0);
  assert.equal(plan.historyKeyCount, AUTHENTICATED_HISTORY_KEYS.length);
  assert.ok(plan.scopeSqlIdentitySha256);
  assert.notEqual(plan.runtimeClosure.sha256, plan.verificationUnion.sha256);
  assert.notEqual(plan.runtimeClosure.label, plan.verificationUnion.label);
  assert.equal(plan.cliPin, "2.117.0");
  assert.equal(plan.applyRepairSeparation, true);
  assert.equal(plan.managementApiApply, false);
  const markdown = qualify.renderProposedQualificationResetHostedPlanMarkdown(plan);
  assert.ok(markdown.split("\n").length > 40);
  assert.match(markdown, /PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE/);
  assert.match(markdown, /jkorwnwwmdeflfntxntl/);
  assert.match(markdown, /llbnliixczcqfftxpsmb/);
  assert.doesNotMatch(markdown, /postgresql:\/\//);
  assert.match(markdown, /2\.117\.0/);
  assert.match(markdown, /Management API apply/);
});

test("F16-A01 empty discovery plus auth/unnest/unexpected storage cannot be CLEAN_BASELINE", async () => {
  const cases = [
    { auth_handle_new_user_trigger: true },
    { unnest_uuid_shim: true },
    { storage_policies: ["unexpected_access_policy"] },
    { storage_buckets: ["unexpected_secret_bucket"] },
  ];
  for (const inventoryOverrides of cases) {
    const body = contradictoryEmptyUniverse(inventoryOverrides);
    const observed = observedFromQualificationResetCapture(body);
    if (inventoryOverrides.unnest_uuid_shim === true) {
      assert.equal(observed.ok, false);
    }
    const { result, emit } = await runQualifyMainPath({ captureBody: body });
    assert.equal(result.ok, false, JSON.stringify(inventoryOverrides));
    assert.notEqual(result.alreadyClean, true);
    assert.notEqual(result.verdict, F13_RESET_ALREADY_CLEAN_VERDICT);
    assert.equal(result.spies.captureCalls, 1);
    assert.equal(result.spies.applyCalls || 0, 0);
    assert.equal(result.spies.sqlCalls || 0, 0);
    assert.equal(result.spies.transportCalls || 0, 0);
    assert.equal(emit.verdict, FILE_BASED_RUNNER_VERDICTS.HOLD);
    assert.notEqual(result.wipeRouted, true);
    assert.notEqual(result.code, "F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH");
  }
});

test("F16-A02 baseline-affecting inventory matrix is table-driven and fail-closed", async () => {
  const fields = BASELINE_AFFECTING_INVENTORY_FIELDS.filter((row) => row.dirtyBlocksCleanBaseline);
  assert.ok(fields.length >= 15);
  assert.ok(fields.some((row) => row.field === "auth_handle_new_user_trigger" && row.holdWithoutDeletion === true));
  assert.ok(fields.some((row) => row.field === "unnest_uuid_shim" && row.wipeRouted === false));
  assert.ok(fields.some((row) => row.field === "storage_policies" && row.namedFloorResidualAllowed === true));

  const dirtyByField = {
    public_tables: ["financial_accounts"],
    public_views: ["unexpected_view"],
    public_types: ["mystery_enum"],
    public_functions: [{ name: "mystery_fn", identity: "public.mystery_fn()" }],
    unnest_uuid_shim: true,
    auth_handle_new_user_trigger: true,
    schema_migrations_present: "not-boolean",
    schema_migrations_rows: 6,
    financial_private: true,
    financial_core: true,
    financial_ledger_epochs: true,
    exchange_rates: true,
    organizations_base_country: true,
    groups_group_level: true,
    committees_budget_allocation: true,
    storage_policies: ["unexpected_access_policy"],
    storage_buckets: ["unexpected_secret_bucket"],
  };

  for (const row of fields) {
    const dirty = Object.prototype.hasOwnProperty.call(dirtyByField, row.field)
      ? { [row.field]: dirtyByField[row.field] }
      : null;
    assert.ok(dirty, row.field);
    const body = contradictoryEmptyUniverse(dirty);
    const parsed = observedFromQualificationResetCapture(body);
    const eligibility = evaluateQualificationResetEligibility({
      observedObjectIdentities: parsed.ok ? parsed.observedObjects : [],
      observedDependencies: parsed.ok ? parsed.observedDependencies : [],
      observedHistoryRows: parsed.ok ? parsed.observedHistoryRows : [],
      inventory: body.inventory,
      inventoryCaptured: true,
      captureComplete: true,
    });
    if (row.field === "schema_migrations_present") {
      assert.equal(parsed.ok, false);
      continue;
    }
    assert.notEqual(eligibility.alreadyClean, true, row.field);
    assert.notEqual(eligibility.verdict, F13_RESET_ALREADY_CLEAN_VERDICT, row.field);
    const { result } = await runQualifyMainPath({ captureBody: body });
    assert.equal(result.ok, false, row.field);
    assert.equal(result.spies.captureCalls, 1, row.field);
    assert.equal(result.spies.applyCalls || 0, 0, row.field);
    assert.equal(result.spies.sqlCalls || 0, 0, row.field);
  }
});

test("F16-A03 genuine already-clean and approved leftovers still reach supported paths", async () => {
  const clean = await runQualifyMainPath({ captureBody: emptyCaptureBody() });
  assert.equal(clean.result.ok, true);
  assert.equal(clean.result.alreadyClean, true);
  assert.equal(clean.result.spies.applyCalls || 0, 0);
  assert.equal(clean.result.spies.sqlCalls || 0, 0);
  assert.equal(clean.result.verdict, F21_RESET_ALREADY_CLEAN_VERDICT);

  const leftover = await runQualifyMainPath({
    captureBody: leftoverCaptureBody({
      inventory: {
        public_tables: ["financial_accounts"],
        schema_migrations_rows: AUTHENTICATED_HISTORY_KEYS.length,
        storage_policies: [...FAILED_FLOOR_STORAGE_POLICY_NAMES],
      },
    }),
  });
  assert.equal(leftover.result.ok, true);
  assert.equal(leftover.result.plan.eligible, true);
  assert.equal(leftover.result.spies.captureCalls, 1);
  assert.equal(leftover.result.spies.applyCalls, 1);
  assert.equal(leftover.result.verdict, F21_RESET_SUCCESS_VERDICT);

  const leftoverPlusAuth = await runQualifyMainPath({
    captureBody: leftoverCaptureBody({
      inventory: {
        public_tables: ["financial_accounts"],
        schema_migrations_rows: AUTHENTICATED_HISTORY_KEYS.length,
        auth_handle_new_user_trigger: true,
      },
    }),
  });
  assert.equal(leftoverPlusAuth.result.ok, false);
  assert.equal(leftoverPlusAuth.result.eligible, false);
  assert.equal(leftoverPlusAuth.result.spies.applyCalls || 0, 0);
  assert.equal(leftoverPlusAuth.emit.verdict, FILE_BASED_RUNNER_VERDICTS.HOLD);
});

test("F16-B01 generated T3 SQL queries live catalog tuples and captured starting state", () => {
  const planned = planQualificationReset(planInput({
    observedObjects: ["public.financial_accounts", "public.memberships", "public.groups"],
    observedDependencies: [MEMBERSHIPS_GROUP_FK],
  }));
  assert.equal(planned.ok, true);
  assert.match(planned.sql, /live catalog dependency tuples after lock/);
  assert.match(planned.sql, /foreign_key\|memberships_group_id_fkey\|public\.memberships\|public\.groups/);
  assert.match(planned.sql, /FINITE_DEPENDENCY_ALLOWLIST/);
  assert.match(planned.sql, /IS DISTINCT FROM/);
  assert.match(planned.sql, /missing captured approved dependency/);
  assert.doesNotMatch(planned.sql, /\bCASCADE\b/i);

  const emptyExpected = buildQualificationResetSql({
    observedHistoryRows: authenticatedHistory(),
    observedDependencies: [],
    scopeSqlIdentitySha256: scopeSqlIdentityDigest(),
  });
  assert.equal(emptyExpected.ok, true);
  assert.match(emptyExpected.sql, /ARRAY\[\]::text\[\]/);
});

test("F17-A01 unexpected storage_buckets alone cannot be CLEAN_BASELINE", async () => {
  const body = contradictoryEmptyUniverse({ storage_buckets: ["unexpected_secret_bucket"] });
  const { result, emit } = await runQualifyMainPath({ captureBody: body });
  assert.equal(result.ok, false);
  assert.notEqual(result.alreadyClean, true);
  assert.notEqual(result.verdict, F13_RESET_ALREADY_CLEAN_VERDICT);
  assert.equal(result.spies.captureCalls, 1);
  assert.equal(result.spies.applyCalls || 0, 0);
  assert.equal(result.spies.sqlCalls || 0, 0);
  assert.equal(result.spies.transportCalls || 0, 0);
  assert.equal(emit.verdict, FILE_BASED_RUNNER_VERDICTS.HOLD);
  assert.notEqual(result.wipeRouted, true);
});

test("F17-A02 unexpected bucket plus valid baseline buckets still HOLD", async () => {
  const body = contradictoryEmptyUniverse({
    storage_buckets: [...FAILED_FLOOR_STORAGE_BUCKETS, "unexpected_secret_bucket"],
  });
  const { result } = await runQualifyMainPath({ captureBody: body });
  assert.equal(result.ok, false);
  assert.notEqual(result.alreadyClean, true);
  assert.equal(result.spies.applyCalls || 0, 0);
  assert.equal(result.spies.sqlCalls || 0, 0);
  assert.equal(result.spies.transportCalls || 0, 0);
});

test("F17-A03 supported clean and named residual buckets still CLEAN_BASELINE", async () => {
  const empty = await runQualifyMainPath({ captureBody: emptyCaptureBody() });
  assert.equal(empty.result.ok, true);
  assert.equal(empty.result.alreadyClean, true);
  assert.equal(empty.result.spies.applyCalls || 0, 0);
  assert.equal(empty.result.verdict, F21_RESET_ALREADY_CLEAN_VERDICT);

  const residuals = await runQualifyMainPath({
    captureBody: emptyCaptureBody({
      inventory: { storage_buckets: [...FAILED_FLOOR_STORAGE_BUCKETS] },
    }),
  });
  assert.equal(residuals.result.ok, true);
  assert.equal(residuals.result.alreadyClean, true);
  assert.equal(residuals.result.spies.applyCalls || 0, 0);
  assert.equal(residuals.result.verdict, F21_RESET_ALREADY_CLEAN_VERDICT);
});

test("F17-A04 leftover plus unexpected bucket HOLDs; leftover plus named buckets stays eligible", async () => {
  const leftoverPlusUnexpected = await runQualifyMainPath({
    captureBody: leftoverCaptureBody({
      inventory: {
        public_tables: ["financial_accounts"],
        schema_migrations_rows: AUTHENTICATED_HISTORY_KEYS.length,
        storage_buckets: ["unexpected_secret_bucket"],
      },
    }),
  });
  assert.equal(leftoverPlusUnexpected.result.ok, false);
  assert.equal(leftoverPlusUnexpected.result.eligible, false);
  assert.equal(leftoverPlusUnexpected.result.spies.applyCalls || 0, 0);
  assert.equal(leftoverPlusUnexpected.emit.verdict, FILE_BASED_RUNNER_VERDICTS.HOLD);

  const leftoverNamed = await runQualifyMainPath({
    captureBody: leftoverCaptureBody({
      inventory: {
        public_tables: ["financial_accounts"],
        schema_migrations_rows: AUTHENTICATED_HISTORY_KEYS.length,
        storage_buckets: [...FAILED_FLOOR_STORAGE_BUCKETS],
        storage_policies: [...FAILED_FLOOR_STORAGE_POLICY_NAMES],
      },
    }),
  });
  assert.equal(leftoverNamed.result.ok, true);
  assert.equal(leftoverNamed.result.plan.eligible, true);
  assert.equal(leftoverNamed.result.spies.applyCalls, 1);
});

test("F17-A05 malformed and contradictory storage_buckets fail closed", async () => {
  const malformed = await runQualifyMainPath({
    captureBody: contradictoryEmptyUniverse({ storage_buckets: "unexpected_secret_bucket" }),
  });
  assert.equal(malformed.result.ok, false);
  assert.notEqual(malformed.result.alreadyClean, true);
  assert.equal(malformed.result.spies.applyCalls || 0, 0);

  const missing = evaluateQualificationResetEligibility({
    observedObjectIdentities: [],
    observedDependencies: [],
    observedHistoryRows: [],
    inventory: (() => {
      const inv = emptyQualificationResetInventoryObject();
      delete inv.storage_buckets;
      return inv;
    })(),
    inventoryCaptured: true,
    captureComplete: true,
  });
  assert.notEqual(missing.alreadyClean, true);
  assert.equal(missing.verdict, "HOLD");

  const field = BASELINE_AFFECTING_INVENTORY_FIELDS.find((row) => row.field === "storage_buckets");
  assert.equal(field.dirtyBlocksCleanBaseline, true);
  assert.equal(field.classifier, true);
  assert.equal(field.holdWithoutDeletion, true);
  assert.equal(field.wipeRouted, false);
  assert.equal(field.nonDeletedIsNotNonBlocking, true);
  const omitted = BASELINE_AFFECTING_INVENTORY_FIELDS.filter((row) => row.dirtyBlocksCleanBaseline !== true);
  assert.deepEqual(omitted.map((row) => row.field), []);
});

test("F17-B01 isolation is READ COMMITTED and lock order is documented", () => {
  assert.equal(QUALIFICATION_RESET_ISOLATION_LEVEL, "READ COMMITTED");
  assert.equal(QUALIFICATION_RESET_LOCK_ORDER.serializableSnapshotBeforeLockInsufficient, true);
  const sql = buildQualificationResetSql({
    observedHistoryRows: authenticatedHistory(),
    observedDependencies: [MEMBERSHIPS_GROUP_FK],
    scopeSqlIdentitySha256: scopeSqlIdentityDigest(),
  });
  assert.equal(sql.ok, true);
  assert.match(sql.sql, /BEGIN ISOLATION LEVEL READ COMMITTED/);
  assert.doesNotMatch(sql.sql, /BEGIN ISOLATION LEVEL SERIALIZABLE/);
  assert.match(sql.sql, /SET LOCAL application_name = 'f13_qualification_reset'/);
  assert.match(sql.sql, /F18_RESET_BACKEND pid=%/);
  assert.match(sql.sql, /pg_backend_pid\(\)/);
  assert.match(sql.sql, /json_build_object\(/);
  assert.match(sql.sql, /PERFORM\s+pg_advisory_xact_lock/);
  assert.match(sql.sql, /LOCK TABLE supabase_migrations\.schema_migrations IN SHARE ROW EXCLUSIVE MODE/);
  assert.match(sql.sql, /live catalog dependency tuples after lock/);
  const t1 = sql.sql.indexOf("BEGIN ISOLATION LEVEL READ COMMITTED");
  const adv = sql.sql.indexOf("pg_advisory_xact_lock");
  const lock = sql.sql.indexOf("LOCK TABLE supabase_migrations.schema_migrations");
  const t3 = sql.sql.indexOf("live catalog dependency tuples after lock");
  assert.ok(t1 >= 0 && adv > t1 && lock > adv && t3 > lock);
});

test("F17-B02 two-session lock-wait scenarios are recorded or MUST_LOCAL", async () => {
  const { proveQualificationResetLocal } = await import("./prove-f3-qualification-reset-local.mjs");
  const proof = await proveQualificationResetLocal();
  const required = [
    "TX_T3_LOCKWAIT_UNAPPROVED_FK_ROLLBACK",
    "TX_T3_LOCKWAIT_RETARGETED_FK_ROLLBACK",
  ];
  for (const id of required) {
    const row = proof.cases.find((item) => item.id === id);
    assert.ok(row, `missing ${id}`);
    if (proof.localPg.available !== true) {
      assert.equal(row.executedTransaction, false);
      assert.match(String(row.note || row.code || ""), /MUST_LOCAL/);
    } else {
      assert.equal(row.ok, true);
      assert.equal(row.executedTransaction, true);
      assert.equal(row.lockWaitObserved, true);
      assert.equal(row.mutationPhaseReached, false);
      assert.notEqual(row.commit, true);
      assert.equal(row.rollback, null);
      assert.ok(row.interleaving?.t1ReachedThenWaited === true);
      assert.ok(Number.isInteger(row.interleaving?.resetBackendPid));
      assert.ok(Number.isInteger(row.interleaving?.resetProcessId));
      assert.equal(row.interleaving?.resetBackendPid, row.backendBoundLock?.observation?.resetBackendPid);
      assert.equal(row.backendBoundLock?.proof?.ok, true);
      assert.equal(row.holderCommitted, true);
      assert.equal(row.holderResult?.ok, true);
      assert.equal(row.interleaving?.inferredFromAnyWaiter, false);
      assert.ok(row.preResetCommittedDrift);
    }
  }
});

test("F17-C01 process evidence packaging preserves failure metadata and stream hashes", () => {
  const successRaw = {
    status: 0,
    signal: null,
    timeout: false,
    stdout: `${JSON.stringify({ schema: TX_OBSERVATION_SCHEMA, phase: "T7_COMMIT", event: "committed", committed: true })}\n`,
    stderr: "",
    argv: [...QUALIFICATION_RESET_APPLY_PSQL_ARGV, "-f", "/tmp/f17-qual-reset-abc/file.sql"],
  };
  const success = packageQualificationResetProcessEvidence(successRaw, { workdir: "/tmp/f17-qual-reset-abc" });
  assert.equal(success.status, 0);
  assert.equal(success.signal, null);
  assert.equal(success.timeout, false);
  assert.equal(success.streams.originalByteEqual, false);
  assert.equal(success.streams.reconstructedFromSummary, false);
  assert.equal(success.streams.originalStdoutByteLength, Buffer.byteLength(successRaw.stdout, "utf8"));
  assert.notEqual(success.argv.join(" "), successRaw.argv.join(" "));
  assert.doesNotMatch(JSON.stringify(success), /\/tmp\/f17-qual-reset-abc/);
  assert.equal(scanEvidenceValueForLeaks(success).pathLeaks, 0);

  const failedRaw = {
    status: 1,
    signal: null,
    timeout: false,
    stdout: "",
    stderr: "psql:/tmp/f17-qual-reset-abc/file.sql:12: ERROR: boom\n",
    error: { code: "EACCES", name: "Error", syscall: "open", message: "open '/tmp/f17-qual-reset-abc/file.sql'" },
    argv: ["psql", "-f", "/tmp/f17-qual-reset-abc/file.sql"],
  };
  const failed = packageQualificationResetProcessEvidence(failedRaw, { workdir: "/tmp/f17-qual-reset-abc" });
  assert.equal(failed.status, 1);
  assert.equal(failed.structuredError.code, "EACCES");
  assert.equal(failed.structuredError.syscall, "open");
  assert.match(failed.structuredError.message, /\[REDACTED_PATH\]/);
  assert.doesNotMatch(failed.stderr, /\/tmp\/f17-qual-reset-abc/);
  assert.notEqual(failed.status, 0);
  const reparsed = JSON.parse(JSON.stringify(failed));
  assert.equal(reparsed.status, 1);
  assert.equal(reparsed.structuredError.code, "EACCES");
  assert.notEqual(reparsed.status, 0);

  const timeoutRaw = {
    status: null,
    signal: "SIGTERM",
    timeout: true,
    timedOut: true,
    stdout: "",
    stderr: "killed after timeout at /tmp/f17-qual-reset-abc/file.sql\n",
  };
  const timed = packageQualificationResetProcessEvidence(timeoutRaw, { workdir: "/tmp/f17-qual-reset-abc" });
  assert.equal(timed.status, null);
  assert.equal(timed.signal, "SIGTERM");
  assert.equal(timed.timeout, true);
  assert.equal(timed.timedOut, true);
  assert.notEqual(timed.status, 0);
  assert.equal(PROCESS_EVIDENCE_SANITIZATION_RULES.neverClaimsOriginalByteEqualityAfterTransform, true);
});

function observationLine(phase, event, extra = {}) {
  return `${JSON.stringify({ schema: TX_OBSERVATION_SCHEMA, phase, event, ...extra })}\n`;
}

function successObservationStdout() {
  return TX_OBSERVATION_SUCCESS_SEQUENCE.map((row) => observationLine(row.phase, row.event, row.committed === true ? { committed: true } : {})).join("");
}

async function runProcessEvidenceE2E(rawTransportResult) {
  const { createHash } = await import("node:crypto");
  const sha = (text) => createHash("sha256").update(String(text ?? ""), "utf8").digest("hex");
  const originalStdout = rawTransportResult.stdout ?? "";
  const originalStderr = rawTransportResult.stderr ?? "";
  const originalStdoutSha256 = sha(originalStdout);
  const originalStderrSha256 = sha(originalStderr);
  const recorder = createQualificationResetRecorder();
  const result = await runQualificationReset({
    input: planInput(),
    adapters: {
      transport: {
        kind: "e2e-process-evidence",
        disabled: false,
        execute() {
          return rawTransportResult;
        },
      },
    },
    recorder,
    allowDisabledTransport: false,
  });
  const packaged = packageQualificationResetProcessEvidence(result.processResult);
  const serialized = JSON.stringify(packaged);
  const reread = JSON.parse(serialized);
  const adapted = adaptStoredProcessRecordToParserInput(reread);
  const interpreted = adapted.ok
    ? interpretQualificationResetTransportResult(adapted.processResult)
    : null;
  return {
    result,
    packaged,
    reread,
    adapted,
    interpreted,
    originalStdoutSha256,
    originalStderrSha256,
    originalStdoutByteLength: Buffer.byteLength(originalStdout, "utf8"),
    originalStderrByteLength: Buffer.byteLength(originalStderr, "utf8"),
  };
}

test("F18-A01 backend-bound lock proof negatives cannot PASS", () => {
  const valid = {
    resetProcessId: 11,
    resetBackendPid: 22,
    resetExecutionId: "f18-exec-0123456789ab",
    holderBackendPid: 33,
    datname: "f3_lock_proof",
    relation: "public.memberships",
    holderLock: { pid: 33, mode: "AccessExclusiveLock", granted: true, relation: "public.memberships" },
    waiterLock: { pid: 22, mode: "AccessExclusiveLock", granted: false, relation: "public.memberships" },
    resetWaitOnHolder: { waiterPid: 22, holderPid: 33, blockedByHolder: true },
    holderCommitted: true,
    holderResult: { ok: true },
    committedCatalogChange: true,
    lockAcquisitionByResetBackend: {
      resetBackendPid: 22,
      relation: "public.memberships",
      granted: true,
      t2LockedSameBackend: true,
      afterHolderCommit: true,
    },
    t3RejectionFromSameReset: { sameResetExecution: true, rejected: true, mutationPhaseReached: false },
    appliedSqlIdentity: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    postconditionsComplete: true,
  };
  assert.equal(evaluateBackendBoundLockProof(valid).ok, true);
  assert.equal(evaluateBackendBoundLockProof({
    ...valid,
    waiterLock: { ...valid.waiterLock, pid: 99 },
    inferredFromAnyWaiter: true,
  }).ok, false);
  assert.equal(evaluateBackendBoundLockProof({
    ...valid,
    relation: "public.groups",
  }).ok, false);
  assert.equal(evaluateBackendBoundLockProof({
    ...valid,
    holderCommitted: false,
    holderResult: { ok: false },
  }).ok, false);
  assert.equal(evaluateBackendBoundLockProof({
    ...valid,
    lockAcquisitionByResetBackend: {
      resetBackendPid: 22,
      relation: "public.memberships",
      granted: false,
      t2LockedSameBackend: false,
      afterHolderCommit: true,
    },
  }).ok, false);
  assert.equal(evaluateBackendBoundLockProof({
    ...valid,
    inferredFromApplicationNameAlone: true,
  }).ok, false);
  const notice = parseBoundResetObservationLine("NOTICE:  F18_RESET_BACKEND pid=4242 datname=f3_demo app=f13_qualification_reset");
  assert.equal(notice.backendPid, 4242);
  assert.equal(notice.datname, "f3_demo");
});

test("F18-B01 runner-helper-serialize-reread-parser preserves provenance E2E", async () => {
  const success = await runProcessEvidenceE2E({
    status: 0,
    signal: null,
    timeout: false,
    timedOut: false,
    stdout: successObservationStdout(),
    stderr: "",
    argv: [...QUALIFICATION_RESET_APPLY_PSQL_ARGV, "-f", "[FILE]"],
  });
  assert.equal(success.packaged.rejected, undefined);
  assert.equal(success.reread.streams.capturedBeforeEncode, true);
  assert.equal(success.reread.streams.originalStdoutSha256, success.originalStdoutSha256);
  assert.equal(success.reread.streams.originalStdoutByteLength, success.originalStdoutByteLength);
  assert.equal(success.adapted.ok, true);
  assert.equal(success.interpreted.committed, true);
  assert.equal(success.result.verdict, F21_RESET_SUCCESS_VERDICT);

  const eaccesErr = new Error("open '/tmp/f18-qual-reset-xyz/file.sql'");
  eaccesErr.name = "Error";
  eaccesErr.code = "EACCES";
  eaccesErr.syscall = "open";
  const failed = await runProcessEvidenceE2E({
    status: 1,
    signal: null,
    timeout: false,
    timedOut: false,
    stdout: "",
    stderr: "psql:/tmp/f18-qual-reset-xyz/file.sql:12: ERROR: boom\n",
    error: eaccesErr,
    argv: ["psql", "-f", "/tmp/f18-qual-reset-xyz/file.sql"],
  });
  assert.equal(failed.reread.status, 1);
  assert.equal(failed.reread.structuredError.code, "EACCES");
  assert.equal(failed.reread.structuredError.syscall, "open");
  assert.equal(failed.reread.structuredError.name, "Error");
  assert.match(failed.reread.structuredError.message, /\[REDACTED_PATH\]|open/);
  assert.equal(failed.reread.streams.originalStderrSha256, failed.originalStderrSha256);
  assert.notEqual(failed.reread.streams.packagedStderrSha256, failed.originalStderrSha256);
  assert.equal(failed.interpreted.committed, false);
  assert.notEqual(failed.result.verdict, "CLEAN_BASELINE");

  const timed = await runProcessEvidenceE2E({
    status: null,
    signal: "SIGTERM",
    timeout: true,
    timedOut: true,
    stdout: observationLine("T1_BEGIN", "began") + observationLine("T7_COMMIT", "commit_attempted"),
    stderr: "killed after timeout at /tmp/f18-qual-reset-xyz/file.sql\n",
  });
  assert.equal(timed.reread.timeout, true);
  assert.equal(timed.reread.timedOut, true);
  assert.equal(timed.reread.signal, "SIGTERM");
  assert.notEqual(timed.reread.status, 0);
  assert.equal(timed.interpreted.committed, false);

  const sanitized = await runProcessEvidenceE2E({
    status: 1,
    stdout: "",
    stderr: "psql:/tmp/f18-qual-reset-xyz/file.sql:1: ERROR: F13_UNEXPECTED_OBJECT_OR_DEPENDENCY\n",
    error: { code: "F13_RESET_SQL_FAILED", message: "see /tmp/f18-qual-reset-xyz/file.sql" },
  });
  assert.equal(sanitized.reread.streams.originalStderrSha256, sanitized.originalStderrSha256);
  assert.notEqual(sanitized.reread.streams.packagedStderrSha256, sanitized.originalStderrSha256);
  assert.doesNotMatch(sanitized.reread.stderr, /\/tmp\/f18-qual-reset-xyz/);

  const double = packageQualificationResetProcessEvidence({
    schema: PROCESS_EVIDENCE_CONTRACT.schema,
    processResult: { schema: PROCESS_EVIDENCE_CONTRACT.schema, streams: { capturedBeforeEncode: true } },
    streams: {
      capturedBeforeEncode: true,
      originalStdoutSha256: "a".repeat(64),
      originalStderrSha256: "b".repeat(64),
      originalStdoutByteLength: 0,
      originalStderrByteLength: 0,
    },
  });
  assert.equal(double.rejected, true);
  assert.equal(double.code, "F18_PROCESS_EVIDENCE_DOUBLE_ENCODED");
  assert.equal(classifyProcessEvidenceShape({ schema: PROCESS_EVIDENCE_CONTRACT.schema }).kind, "ambiguous");
  assert.equal(PROCESS_EVIDENCE_CONTRACT.neverRecomputeOriginalFromTransformed, true);
});

test("F18-C01 success records reparse committed; failures stay rejected", async () => {
  const successRaw = {
    status: 0,
    processStatus: 0,
    stdout: successObservationStdout(),
    stderr: "",
    signal: null,
    timeout: false,
    timedOut: false,
  };
  const successAttest = attestQualificationResetReparse(successRaw, {
    verdict: F21_RESET_SUCCESS_VERDICT,
    scenarioOk: true,
  });
  assert.equal(successAttest.interpretedCommitted, true);
  assert.equal(successAttest.t7CommittedTrue, true);
  assert.equal(successAttest.ok, true);

  const storedProcessStatusOnly = {
    processStatus: 0,
    stdout: successObservationStdout(),
    stderr: "",
    timeout: false,
  };
  const mapped = adaptStoredProcessRecordToParserInput(storedProcessStatusOnly);
  assert.equal(mapped.ok, true);
  assert.equal(mapped.mappedProcessStatusToStatus, true);
  const mappedInterp = interpretQualificationResetTransportResult(mapped.processResult);
  assert.equal(mappedInterp.committed, true);

  const missing = adaptStoredProcessRecordToParserInput({
    stdout: successObservationStdout(),
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "F18_STORED_PROCESS_RECORD_STATUS_MISSING");
  const missingAttest = attestQualificationResetReparse({
    stdout: successObservationStdout(),
  }, { verdict: "CLEAN_BASELINE", scenarioOk: true });
  assert.equal(missingAttest.ok, false);
  assert.equal(missingAttest.interpretedCommitted, false);

  const failedRaw = {
    status: 1,
    processStatus: 1,
    stdout: observationLine("T1_BEGIN", "began") + observationLine("T2_LOCK", "locked"),
    stderr: "ERROR: F13_UNEXPECTED_OBJECT_OR_DEPENDENCY",
    timeout: false,
  };
  const failedAttest = attestQualificationResetReparse(failedRaw, {
    verdict: "HOLD",
    scenarioOk: false,
  });
  assert.equal(failedAttest.interpretedCommitted, false);
  assert.equal(failedAttest.ok, true);
  assert.equal(failedAttest.genuineFailure, true);

  const inconsistent = finalizeQualificationResetAttestations([
    successAttest,
    { ok: false, consistent: false, interpretedCommitted: false, interpretedVerdictPath: "CLEAN_BASELINE" },
  ]);
  assert.equal(inconsistent.ok, false);
  assert.equal(inconsistent.code, "F18_ATTESTATION_INCONSISTENT");
  const finalized = finalizeQualificationResetAttestations([successAttest, failedAttest]);
  assert.equal(finalized.ok, true);
});

function sha256Text(text) {
  return createHash("sha256").update(String(text ?? ""), "utf8").digest("hex");
}

function assertRecoveredStreamIdentities(reread, originalStdout, originalStderr) {
  const recoveredStdout = String(reread.stdout ?? "");
  const recoveredStderr = String(reread.stderr ?? "");
  assert.equal(reread.streams.originalStdoutSha256, sha256Text(originalStdout));
  assert.equal(reread.streams.originalStderrSha256, sha256Text(originalStderr));
  assert.equal(reread.streams.originalStdoutByteLength, Buffer.byteLength(String(originalStdout ?? ""), "utf8"));
  assert.equal(reread.streams.originalStderrByteLength, Buffer.byteLength(String(originalStderr ?? ""), "utf8"));
  assert.equal(reread.streams.packagedStdoutSha256, sha256Text(recoveredStdout));
  assert.equal(reread.streams.packagedStderrSha256, sha256Text(recoveredStderr));
  assert.equal(reread.streams.packagedStdoutByteLength, Buffer.byteLength(recoveredStdout, "utf8"));
  assert.equal(reread.streams.packagedStderrByteLength, Buffer.byteLength(recoveredStderr, "utf8"));
  assert.notEqual(reread.streams.originalStdoutSha256, undefined);
  assert.equal(reread.streams.capturedBeforeEncode, true);
}

function serializeAndRereadFromRunner(resetResult, extra = {}) {
  const evidence = processEvidence(resetResult);
  const stored = record(extra.id || "F19_BOUNDARY", extra.kind || "scenario", {
    ok: extra.ok,
    verdict: extra.verdict ?? resetResult?.verdict ?? null,
    ...evidence,
  });
  const serialized = JSON.stringify(stored);
  const reread = JSON.parse(serialized);
  const adapted = adaptStoredProcessRecordToParserInput(reread);
  const interpreted = adapted.ok
    ? interpretQualificationResetTransportResult(adapted.processResult)
    : null;
  const attestation = attestQualificationResetReparse(reread, {
    verdict: extra.verdict ?? resetResult?.verdict ?? null,
    scenarioOk: extra.ok,
  });
  const finalization = finalizeQualificationResetAttestations([attestation]);
  return {
    evidence,
    stored,
    serialized,
    reread,
    adapted,
    interpreted,
    attestation,
    finalization,
  };
}

test("F19-A01 real thrown EACCES survives runner-helper-serialize-reread and cannot finalize success", async () => {
  const deniedDir = fs.mkdtempSync(path.join(os.tmpdir(), "f19-eacces-"));
  const deniedBin = path.join(deniedDir, "denied-psql");
  fs.writeFileSync(deniedBin, "#!/bin/sh\nexit 0\n");
  fs.chmodSync(deniedBin, 0);
  const spawned = spawnSync(deniedBin, ["-X", "-q"], { encoding: "utf8" });
  assert.ok(spawned.error, "spawn must throw EACCES against the non-executable helper");
  assert.equal(spawned.error.code, "EACCES");
  assert.match(String(spawned.error.syscall || ""), /spawn/);
  assert.match(String(spawned.error.message || ""), /EACCES|permission denied/i);

  let thrownMessage = "";
  const reset = await runQualificationReset({
    input: planInput(),
    adapters: {
      transport: {
        kind: "f19-real-eacces",
        disabled: false,
        execute() {
          const again = spawnSync(deniedBin, ["-X", "-q"], { encoding: "utf8" });
          if (again.error) {
            thrownMessage = String(again.error.message || again.error);
            throw again.error;
          }
          return again;
        },
      },
    },
    recorder: createQualificationResetRecorder(),
    allowDisabledTransport: false,
  });
  fs.rmSync(deniedDir, { recursive: true, force: true });

  assert.equal(reset.ok, false);
  assert.notEqual(reset.verdict, "CLEAN_BASELINE");
  const originalStdout = "";
  const originalStderr = thrownMessage || String(spawned.error.message || "");
  const boundary = serializeAndRereadFromRunner(reset, {
    id: "F19_THROWN_EACCES",
    ok: false,
    verdict: reset.verdict,
  });
  assert.equal(boundary.reread.thrown, true);
  assert.equal(boundary.stored.thrown, true);
  assert.equal(boundary.reread.status, null);
  assert.equal(boundary.reread.structuredError?.code, "EACCES");
  assert.match(String(boundary.reread.structuredError?.syscall || ""), /spawn/);
  assert.match(String(boundary.reread.structuredError?.message || ""), /EACCES|permission denied/i);
  assert.equal(boundary.interpreted.attempted.processErrorPresent, true);
  assert.equal(boundary.interpreted.committed, false);
  assert.equal(boundary.interpreted.rolledBack, null);
  assert.equal(boundary.attestation.processFailed, true);
  assert.equal(boundary.attestation.interpretedCommitted, false);
  const successClaim = attestQualificationResetReparse(boundary.reread, {
    verdict: "CLEAN_BASELINE",
    scenarioOk: true,
  });
  assert.equal(successClaim.processFailed, true);
  assert.equal(successClaim.interpretedCommitted, false);
  assert.equal(successClaim.genuineSuccess, false);
  assert.equal(successClaim.ok, false);
  assert.equal(finalizeQualificationResetAttestations([successClaim]).ok, false);
  assertRecoveredStreamIdentities(boundary.reread, originalStdout, originalStderr);
  assert.equal(scanEvidenceValueForLeaks(boundary.reread).pathLeaks, 0);
});

test("F19-A02 path redaction preserves original identities and matches recovered sanitized bodies", async () => {
  const workdir = path.join(os.tmpdir(), "f19-qual-reset-redact");
  const rawStderr = `psql:${workdir}/file.sql:12: ERROR: boom DATABASE_URL=postgresql://example.invalid/db\n`;
  const rawStdout = "";
  const reset = await runQualificationReset({
    input: planInput(),
    adapters: {
      transport: {
        kind: "f19-path-redact",
        disabled: false,
        execute() {
          return {
            status: 1,
            stdout: rawStdout,
            stderr: rawStderr,
            signal: null,
            timeout: false,
            timedOut: false,
            thrown: false,
            argv: [...QUALIFICATION_RESET_APPLY_PSQL_ARGV, "-f", `${workdir}/file.sql`],
          };
        },
      },
    },
    recorder: createQualificationResetRecorder(),
    allowDisabledTransport: false,
  });
  const boundary = serializeAndRereadFromRunner(reset, {
    id: "F19_PATH_REDACT",
    ok: false,
    verdict: reset.verdict,
  });
  assert.equal(boundary.reread.thrown, false);
  assert.doesNotMatch(boundary.reread.stderr, /\/tmp\/f19-qual-reset-redact|DATABASE_URL|postgresql:\/\//);
  assert.match(boundary.reread.stderr, /\[REDACTED_PATH\]|\[REDACTED\]/);
  assert.notEqual(boundary.reread.streams.originalStderrSha256, boundary.reread.streams.packagedStderrSha256);
  assertRecoveredStreamIdentities(boundary.reread, rawStdout, rawStderr);
  assert.equal(boundary.reread.streams.originalStderrSha256, sha256Text(rawStderr));
  assert.equal(boundary.reread.streams.packagedStderrSha256, sha256Text(boundary.reread.stderr));
  assert.equal(scanEvidenceValueForLeaks(boundary.reread).pathLeaks, 0);
  assert.equal(scanEvidenceValueForLeaks(boundary.reread).secrets, 0);
});

test("F19-B01 thrown:true alone cannot authorize interpretation, attestation, or finalization", () => {
  const thrownOnly = {
    status: 0,
    processStatus: 0,
    stdout: successObservationStdout(),
    stderr: "",
    signal: null,
    timeout: false,
    timedOut: false,
    thrown: true,
  };
  const interpreted = interpretQualificationResetTransportResult(thrownOnly);
  const attestation = attestQualificationResetReparse(thrownOnly, {
    verdict: "CLEAN_BASELINE",
    scenarioOk: true,
  });
  const finalization = finalizeQualificationResetAttestations([attestation]);
  assert.equal(interpreted.attempted.thrown, true);
  assert.equal(interpreted.attempted.processErrorPresent, true);
  assert.equal(interpreted.committed, false);
  assert.equal(interpreted.rolledBack, null);
  assert.equal(attestation.processFailed, true);
  assert.equal(attestation.interpretedCommitted, false);
  assert.equal(attestation.ok, false);
  assert.equal(attestation.genuineSuccess, false);
  assert.equal(finalization.ok, false);

  const evidence = processEvidence({
    processResult: thrownOnly,
    verdict: "CLEAN_BASELINE",
    ok: true,
  });
  const stored = record("F19_THROWN_ONLY", "scenario", {
    ok: true,
    verdict: "CLEAN_BASELINE",
    ...evidence,
  });
  const reread = JSON.parse(JSON.stringify(stored));
  assert.equal(reread.thrown, true);
  const rereadAttest = attestQualificationResetReparse(reread, {
    verdict: "CLEAN_BASELINE",
    scenarioOk: true,
  });
  assert.equal(rereadAttest.ok, false);
  assert.equal(rereadAttest.processFailed, true);
  assert.equal(finalizeQualificationResetAttestations([rereadAttest]).ok, false);
});

test("F19-B02 unchanged valid success still reparses committed F21 preserve baseline", async () => {
  const success = await runProcessEvidenceE2E({
    status: 0,
    signal: null,
    timeout: false,
    timedOut: false,
    thrown: false,
    stdout: successObservationStdout(),
    stderr: "",
    argv: [...QUALIFICATION_RESET_APPLY_PSQL_ARGV, "-f", "[FILE]"],
  });
  const boundary = serializeAndRereadFromRunner(success.result, {
    id: "F19_SUCCESS",
    ok: true,
    verdict: F21_RESET_SUCCESS_VERDICT,
  });
  assert.equal(success.result.verdict, F21_RESET_SUCCESS_VERDICT);
  assert.equal(success.interpreted.committed, true);
  assert.equal(boundary.reread.thrown, false);
  assert.equal(boundary.interpreted.committed, true);
  assert.equal(boundary.attestation.interpretedCommitted, true);
  assert.equal(boundary.attestation.processFailed, false);
  assert.equal(boundary.attestation.ok, true);
  assert.equal(boundary.attestation.t7CommittedTrue, true);
  assert.equal(boundary.finalization.ok, true);
  assertRecoveredStreamIdentities(
    boundary.reread,
    successObservationStdout(),
    "",
  );
});

test("F21-C8 classifyInventory CLEAN_BASELINE is not relaxed by preserve residuals", () => {
  const classification = classifyInventory(emptyQualificationResetInventoryObject({
    public_functions: [{ name: "gbt_text_consistent", identity: "public.gbt_text_consistent(internal,text,smallint,oid,internal)" }],
  }));
  assert.notEqual(classification.verdict, "CLEAN_BASELINE");
  assert.ok(classification.extraFunctions.includes("gbt_text_consistent"));
});

test("F21 emit payload fails closed when verdict is missing", () => {
  const missing = qualificationResetQualifyEmitPayload({
    ok: true,
    alreadyClean: true,
    executed: false,
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.verdict, FILE_BASED_RUNNER_VERDICTS.HOLD);
  assert.equal(missing.code, "F21_PRESERVE_BASELINE_VERDICT_REQUIRED");

  const cleanBaselineFallback = qualificationResetQualifyEmitPayload({
    ok: true,
    verdict: F13_RESET_SUCCESS_VERDICT,
    alreadyClean: true,
  });
  assert.equal(cleanBaselineFallback.ok, false);
  assert.equal(cleanBaselineFallback.verdict, FILE_BASED_RUNNER_VERDICTS.HOLD);

  const preserve = qualificationResetQualifyEmitPayload({
    ok: true,
    verdict: F21_RESET_SUCCESS_VERDICT,
    alreadyClean: true,
  });
  assert.equal(preserve.ok, true);
  assert.equal(preserve.verdict, F21_RESET_SUCCESS_VERDICT);
});

test("F21 generated SQL preserves extension and rejects CASCADE", () => {
  const planned = planQualificationReset(planInput());
  assert.equal(planned.ok, true);
  assert.doesNotMatch(planned.sql, /DROP EXTENSION/i);
  assert.doesNotMatch(planned.sql, /ALTER EXTENSION/i);
  assert.doesNotMatch(planned.sql, /\bCASCADE\b/i);
  assert.match(planned.sql, /deptype = 'e'/);
  assert.match(planned.sql, /f21-btree-gist-extension-preserve-scoped-v1/);
  assert.doesNotMatch(planned.sql, /btree_gist still present/);
});

test("F21 wipe remains forbidden for stub-live-pin auth", () => {
  const wiped = planQualificationReset(planInput({ wipeToBaseline: true }));
  assert.equal(wiped.ok, false);
  assert.equal(wiped.code, F13_WIPE_REJECTION_CODE);
});

function validF21Membership(overrides = {}) {
  return {
    schema: F21_QUALIFICATION_RESET_MEMBERSHIP_SCHEMA,
    schemaVersion: 1,
    kind: "function",
    identity: "public.gbt_text_consistent(internal,text,smallint,oid,internal)",
    classid: 1255,
    objid: 424242,
    objsubid: 0,
    refclassid: 3079,
    refobjid: 989898,
    extname: F21_AUTHORIZED_EXTENSION_IDENTITY,
    deptype: "e",
    ...overrides,
  };
}

function preserveMemberObjects() {
  return [
    { kind: "extension", identity: "btree_gist" },
    {
      kind: "function",
      identity: "public.gbt_text_consistent(internal,text,smallint,oid,internal)",
      membership: validF21Membership(),
    },
  ];
}

function preserveInventory() {
  return emptyQualificationResetInventoryObject({
    public_functions: [{
      name: "gbt_text_consistent",
      identity: "public.gbt_text_consistent(internal,text,smallint,oid,internal)",
    }],
  });
}

function preserveObservedCapture(overrides = {}) {
  const objects = overrides.discovered_objects || preserveMemberObjects();
  return observedFromQualificationResetCapture(completeCaptureBody({
    inventory: preserveInventory(),
    discovered_objects: objects,
    observed_objects: objects,
    observed_history_rows: [],
    ...overrides,
  }));
}

const DISPOSABLE_TARGET = {
  ref: APPROVED_DISPOSABLE_PROJECT_REF,
  project_ref: APPROVED_DISPOSABLE_PROJECT_REF,
};

test("F22 historical CLEAN_BASELINE pre-floor behavior is unchanged", () => {
  const historical = evaluatePreStubFloorCleanCheck({
    inventory: passingPreStubFloorCleanInventory(),
    historyRows: [],
    listMigrations: [],
  });
  assert.equal(historical.clean_ok, true);
  assert.equal(historical.classification_verdict, "CLEAN_BASELINE");
  const resolved = resolvePreFloorQualificationGate({
    policy: F21_RESET_SUCCESS_VERDICT,
    target: DISPOSABLE_TARGET,
    inventory: passingPreStubFloorCleanInventory(),
    historyRows: [],
    listMigrations: [],
    previousResetResult: { ok: true, verdict: F21_RESET_SUCCESS_VERDICT },
  });
  assert.equal(resolved.allowFloor, true);
  assert.equal(resolved.verdict, "CLEAN_BASELINE");
  assert.equal(resolved.cleanBaseline, true);
  assert.equal(resolved.preserveBaseline, false);
});

test("F22 preserve residuals are not CLEAN_BASELINE but authenticate the preserve pre-floor gate", () => {
  const historical = evaluatePreStubFloorCleanCheck({
    inventory: preserveInventory(),
    historyRows: [],
    listMigrations: [],
  });
  assert.equal(historical.clean_ok, false);
  assert.notEqual(historical.classification_verdict, "CLEAN_BASELINE");
  const observed = preserveObservedCapture();
  assert.equal(observed.ok, true);
  const gate = evaluatePreserveBaselinePreFloorGate({
    policy: F21_RESET_SUCCESS_VERDICT,
    target: DISPOSABLE_TARGET,
    capture: observed,
    inventory: preserveInventory(),
    inventoryCaptured: true,
    captureComplete: true,
  });
  assert.equal(gate.ok, true);
  assert.equal(gate.allowFloor, true);
  assert.equal(gate.verdict, F21_RESET_SUCCESS_VERDICT);
  assert.equal(gate.cleanBaseline, false);
  assert.notEqual(gate.classificationVerdict, "CLEAN_BASELINE");
});

test("F22 previous reset-success record cannot authenticate current database", () => {
  const gate = evaluatePreserveBaselinePreFloorGate({
    policy: F21_RESET_SUCCESS_VERDICT,
    target: DISPOSABLE_TARGET,
    previousResetResult: { ok: true, verdict: F21_RESET_SUCCESS_VERDICT, alreadyClean: true },
    inventoryCaptured: false,
    captureComplete: false,
  });
  assert.equal(gate.ok, false);
  assert.equal(gate.allowFloor, false);
  assert.equal(gate.code, F21_PRESERVE_BASELINE_FRESH_CAPTURE_REQUIRED);
  assert.equal(gate.trustedPreviousResetRecord, false);
});

test("F22 unsupported policy, production target, and unauthenticated leftovers HOLD", () => {
  const observed = preserveObservedCapture();
  const badPolicy = evaluatePreserveBaselinePreFloorGate({
    policy: "CLEAN_BASELINE",
    target: DISPOSABLE_TARGET,
    capture: observed,
    inventoryCaptured: true,
    captureComplete: true,
  });
  assert.equal(badPolicy.code, F21_PRESERVE_BASELINE_POLICY_UNSUPPORTED);

  const prod = evaluatePreserveBaselinePreFloorGate({
    policy: F21_RESET_SUCCESS_VERDICT,
    target: { ref: PRODUCTION_REF },
    capture: observed,
    inventoryCaptured: true,
    captureComplete: true,
  });
  assert.equal(prod.code, F21_PRESERVE_BASELINE_TARGET_REJECTED);

  const nameOnly = resolvePreFloorQualificationGate({
    policy: F21_RESET_SUCCESS_VERDICT,
    target: DISPOSABLE_TARGET,
    inventory: preserveInventory(),
    capture: observedFromQualificationResetCapture(completeCaptureBody({
      inventory: preserveInventory(),
      discovered_objects: [{
        kind: "function",
        identity: "public.gbt_text_consistent(internal,text,smallint,oid,internal)",
      }],
      observed_objects: [{
        kind: "function",
        identity: "public.gbt_text_consistent(internal,text,smallint,oid,internal)",
      }],
    })),
    inventoryCaptured: true,
    captureComplete: true,
  });
  assert.equal(nameOnly.allowFloor, false);

  const leftover = resolvePreFloorQualificationGate({
    policy: F21_RESET_SUCCESS_VERDICT,
    target: DISPOSABLE_TARGET,
    inventory: emptyQualificationResetInventoryObject({ public_views: ["unexpected_view"] }),
    capture: observedFromQualificationResetCapture(completeCaptureBody({
      inventory: emptyQualificationResetInventoryObject({ public_views: ["unexpected_view"] }),
      discovered_objects: [{ kind: "view", identity: "public.unexpected_view" }],
      observed_objects: [{ kind: "view", identity: "public.unexpected_view" }],
    })),
    inventoryCaptured: true,
    captureComplete: true,
  });
  assert.equal(leftover.allowFloor, false);
  assert.equal(leftover.strippedUnexpectedObjects, false);
});

function mockQualifyAdapters({ query, floor } = {}) {
  const calls = { floor: 0, dbPush: 0, repair: 0, sequence: 0 };
  return {
    calls,
    adapters: {
      kind: "local-fixture",
      localFixtureRoutingOnly: true,
      notProductionBypass: true,
      notHostedIdentityProof: true,
      substitutedInterfaces: [],
      discoverCli: () => ({ available: false, matchesPin: false, version: null, bin: null }),
      identity: async () => ({ projectRef: APPROVED_DISPOSABLE_PROJECT_REF, localFixture: true }),
      listMigrationsViaGet: async () => ({ rows: [] }),
      constructTarget: () => ({
        ok: true,
        target: {
          project_ref: APPROVED_DISPOSABLE_PROJECT_REF,
          localFixture: true,
          localFixtureRoutingOnly: true,
          notProductionBypass: true,
        },
      }),
      query: query || (async () => ({ status: 0, stdout: JSON.stringify(passingPreStubFloorCleanInventory()), stderr: "" })),
      installFloor: floor || ((input) => {
        calls.floor += 1;
        return { installed: true, exact: true, invented00117History: false, transforms: [], components: [], file00117: {}, isolatedMigrations: [] };
      }),
      gatedSql: () => ({ status: 0, stdout: "", stderr: "" }),
      dbPush: () => {
        calls.dbPush += 1;
        calls.sequence += 1;
        return { status: 1, stdout: "", stderr: "not-reached" };
      },
      repair: () => {
        calls.repair += 1;
        return { status: 1, stdout: "", stderr: "not-reached" };
      },
      list: () => ({ status: 0, stdout: "", stderr: "" }),
      poisonQuery: () => ({ status: 0, stdout: JSON.stringify({ poison: false }), stderr: "" }),
    },
  };
}

test("F22 shared entrypoint: authenticated preserve baseline reaches floor preparation", async () => {
  const body = completeCaptureBody({
    inventory: preserveInventory(),
    discovered_objects: preserveMemberObjects(),
    observed_objects: preserveMemberObjects(),
  });
  const { adapters, calls } = mockQualifyAdapters({
    query: async ({ sql } = {}) => {
      if (String(sql).includes("f21-qualification-reset-inventory-v1")) {
        return { status: 0, stdout: JSON.stringify(body), stderr: "" };
      }
      return { status: 0, stdout: JSON.stringify(preserveInventory()), stderr: "" };
    },
  });
  const evidence = await runQualifyDisposablePath({
    args: { prepFloor: true, sequenceF3: false, noWipe: true },
    adapters,
    skipCliPin: true,
    calls,
  });
  assert.equal(evidence.preFloorQualificationGate?.allowFloor, true);
  assert.equal(evidence.preFloorQualificationGate?.verdict, F21_RESET_SUCCESS_VERDICT);
  assert.ok((calls.floor || 0) >= 1);
  assert.equal(calls.dbPush || 0, 0);
});

test("F22 shared entrypoint: historical CLEAN_BASELINE still reaches floor", async () => {
  const clean = passingPreStubFloorCleanInventory();
  const { adapters, calls } = mockQualifyAdapters({
    query: async () => ({ status: 0, stdout: JSON.stringify(clean), stderr: "" }),
  });
  const evidence = await runQualifyDisposablePath({
    args: { prepFloor: true, sequenceF3: false, noWipe: true },
    adapters,
    skipCliPin: true,
    calls,
  });
  assert.equal(evidence.preStubFloorCleanCheck?.clean_ok, true);
  assert.equal(evidence.preFloorQualificationGate?.verdict, "CLEAN_BASELINE");
  assert.ok((calls.floor || 0) >= 1);
});

test("F22 shared entrypoint: invalid preservation evidence blocks floor and migration", async () => {
  const dirty = emptyQualificationResetInventoryObject({ public_views: ["unexpected_view"] });
  const body = completeCaptureBody({
    inventory: dirty,
    discovered_objects: [{ kind: "view", identity: "public.unexpected_view" }],
    observed_objects: [{ kind: "view", identity: "public.unexpected_view" }],
  });
  const { adapters, calls } = mockQualifyAdapters({
    query: async ({ sql } = {}) => {
      if (String(sql).includes("f21-qualification-reset-inventory-v1")) {
        return { status: 0, stdout: JSON.stringify(body), stderr: "" };
      }
      return { status: 0, stdout: JSON.stringify(dirty), stderr: "" };
    },
  });
  const evidence = await runQualifyDisposablePath({
    args: { prepFloor: true, sequenceF3: true, noWipe: true },
    adapters,
    skipCliPin: true,
    calls,
  });
  assert.equal(evidence.preFloorQualificationGate?.allowFloor, false);
  assert.equal(calls.floor || 0, 0);
  assert.equal(calls.dbPush || 0, 0);
  assert.equal(calls.repair || 0, 0);
});

test("F23 verification mode is recorded before database operations", async () => {
  const parsed = parseArgs(["--no-wipe", "--prep-floor", "--sequence-f3", "--verification-mode=normal-application"]);
  assert.equal(parsed.verificationMode, QUALIFICATION_VERIFICATION_MODES.NORMAL_APPLICATION);
  const resolved = resolveQualificationVerificationMode(parsed);
  assert.equal(resolved.ok, true);
  assert.equal(resolved.selectedBeforeDatabaseOperations, true);
  assert.equal(resolved.hostedAuthority, false);
  const unknown = resolveQualificationVerificationMode({ verificationMode: "hosted-force" });
  assert.equal(unknown.ok, false);
  let queryCalls = 0;
  const { adapters, calls } = mockQualifyAdapters({
    query: async () => {
      queryCalls += 1;
      return { status: 0, stdout: JSON.stringify(passingPreStubFloorCleanInventory()), stderr: "" };
    },
  });
  const evidence = await runQualifyDisposablePath({
    args: { prepFloor: true, sequenceF3: false, noWipe: true, verificationMode: "not-a-mode" },
    adapters,
    skipCliPin: true,
    calls,
  });
  assert.equal(evidence.verificationMode?.ok, false);
  assert.equal(evidence.verificationMode?.selectedBeforeDatabaseOperations, true);
  assert.equal(queryCalls, 0);
  assert.equal(calls.floor || 0, 0);
  assert.equal(calls.dbPush || 0, 0);
  assert.match(String(evidence.limitation || evidence.error || ""), /unknown qualification verification mode/);
});

test("F23 exact history identities reject count-only matches", () => {
  const expected = [
    { version: "20260913173000", name: "f3_bounded_financial_epoch_foundation" },
    { version: "20260913173001", name: "f3_01_core_ledger_foundation" },
    { version: "20260913173002", name: "f3_02_secure_posting_idempotency" },
    { version: "20260913173003", name: "f3_03_projection_read_proof" },
    { version: "20260913173004", name: "f3_04_correction_reversal" },
    { version: "20260913173005", name: "f3_05_opening_cash_command" },
  ];
  const ok = verifyExactForwardHistoryIdentities(expected, "00123_f3_05_opening_cash_command.sql");
  assert.equal(ok.ok, true);
  assert.equal(ok.expectedCount, 6);
  const countOnly = verifyExactForwardHistoryIdentities(
    expected.map((row, i) => ({ version: row.version, name: `wrong_${i}` })),
    "00123_f3_05_opening_cash_command.sql",
  );
  assert.equal(countOnly.ok, false);
  assert.ok(countOnly.missing.length > 0);
});

test("F22 missing process evidence cannot produce qualification success", () => {
  const missing = qualificationResetQualifyEmitPayload({
    ok: true,
    alreadyClean: true,
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "F21_PRESERVE_BASELINE_VERDICT_REQUIRED");
  assert.notEqual(missing.verdict, F21_RESET_SUCCESS_VERDICT);
  const stale = evaluatePreserveBaselinePreFloorGate({
    policy: F21_RESET_SUCCESS_VERDICT,
    target: DISPOSABLE_TARGET,
    previousResetResult: { ok: true, verdict: F21_RESET_SUCCESS_VERDICT },
  });
  assert.equal(stale.allowFloor, false);
  assert.notEqual(stale.verdict, F21_RESET_SUCCESS_VERDICT);
});


