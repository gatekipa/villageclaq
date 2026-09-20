/**
 * F17 local PostgreSQL proof helper for qualification-reset.
 *
 * Fresh task-owned f3_* database only. Preserves other DBs/containers.
 * NOT hosted identity proof. NOT disposable. NOT production.
 * If this VM has no local PostgreSQL, reports MUST_LOCAL honestly.
 *
 * Preserved F15/F16/F17 TX scenarios plus F18 backend-bound lock-wait
 * T3 proofs execute generated reset SQL through shared runQualificationReset
 * + the local-fixture psql adapter + the actual process-result parser.
 * Disabled adapter is not DB execution.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import {
  APPROVED_DISPOSABLE_PROJECT_REF,
  FILE_BASED_RUNNER_VERDICTS,
  F3_FORWARD_FILES,
} from "./lib/f3-db-push-pins.mjs";
import {
  AUTHENTICATED_HISTORY_KEYS,
  CANONICAL_FUNCTION_IDENTITY_SQL,
  F13_WIPE_REJECTION_CODE,
  F21_UNEXPECTED_MEMBERSHIP_OVERLAP,
  F21_MEMBERSHIP_SCHEMA_STALE,
  canonicalizeFunctionIdentity,
  scopeSqlIdentityDigest,
  validateObjectAllowlist,
} from "./lib/f3-db-push-qualification-reset-design.mjs";
import {
  FAILED_FLOOR_STORAGE_BUCKETS,
  FAILED_FLOOR_STORAGE_POLICY_NAMES,
  QUALIFICATION_RESET_INVENTORY_CAPTURE_SQL,
  buildQualificationResetInventoryPsqlCommand,
  completeCaptureBody,
  emptyQualificationResetInventoryObject,
  evaluateQualificationResetEligibility,
  parseQualificationResetInventoryProcessResult,
  observedFromQualificationResetCapture,
} from "./lib/f3-db-push-inventory.mjs";
import {
  evaluatePreStubFloorCleanCheck,
  evaluatePreserveBaselinePreFloorGate,
  passingPreStubFloorCleanInventory,
  resolvePreFloorQualificationGate,
  F21_PRESERVE_BASELINE_FRESH_CAPTURE_REQUIRED,
} from "./lib/f3-db-push-pre-stub-floor-clean-check.mjs";
import {
  F19_RUNTIME_LABEL,
  F16_BASELINE_RUNTIME_CLOSURE,
  F17_BASELINE_RUNTIME_CLOSURE,
  F18_BASELINE_RUNTIME_CLOSURE,
  QUALIFICATION_RESET_APPLY_PSQL_ARGV,
  QUALIFICATION_RESET_ISOLATION_LEVEL,
  QUALIFICATION_RESET_LOCK_ORDER,
  packageQualificationResetProcessEvidence,
  QUALIFICATION_RESET_LOCAL_PROOF_HELPER_RELPATH,
  TX_OBSERVATION_SCHEMA,
  TX_OBSERVATION_SUCCESS_SEQUENCE,
  adaptStoredProcessRecordToParserInput,
  attestQualificationResetReparse,
  bindFounderAuthorizationArtifact,
  buildQualificationResetSql,
  createLocalFixtureQualificationResetTransportAdapter,
  evaluateBackendBoundLockProof,
  interpretQualificationResetTransportResult,
  parseBoundResetObservationLine,
  parseQualificationResetTxObservationStdout,
  publishQualificationResetClosures,
  runQualificationReset,
} from "./lib/f3-db-push-qualification-reset.mjs";
import {
  QUALIFICATION_VERIFICATION_MODES,
  createLocalFixtureQualifyAdapters,
  evaluateWipeToBaselineArg,
  runQualifyDisposablePath,
  validateProposedQualificationResetHostedPlanOffline,
  verifyExactForwardHistoryIdentities,
} from "./qualify-f3-db-push-disposable.mjs";
import {
  canonicalizeFingerprintForCompare,
  expectedFingerprintSha256,
  fingerprintCanonicalSha256,
  getFrozenExpectedFingerprint,
} from "./lib/f3-db-push-repair-safety-gate.mjs";
import {
  F23_FINGERPRINT_MISMATCH,
  LOCAL_FINGERPRINT_COMPARISON_PROFILE_V1,
  LOCAL_REPAIR_AMENDMENT,
  reportLocalFingerprintQualification,
  reportLocalFingerprintQualificationFromQualify,
  reportRetainedCaptureLocalAcceptance,
} from "./lib/f3-local-fingerprint-comparison.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const HELPER_RELPATH = QUALIFICATION_RESET_LOCAL_PROOF_HELPER_RELPATH;

const SECRET_NEEDLES = Object.freeze([
  "DATABASE_URL",
  "DISPOSABLE_DB_URL",
  "VILLAGECLAQ_F3_DISPOSABLE_DB_PASSWORD",
  "PGPASSWORD",
  "postgresql://",
  "postgres://",
  "pgbouncer",
]);

function secretsRemoved(value) {
  let text = value == null ? "" : String(value);
  for (const needle of SECRET_NEEDLES) {
    if (!text.includes(needle)) continue;
    text = text.split(needle).join("[REDACTED]");
  }
  return text;
}

function processEvidence(result, { captureCalls = 1 } = {}) {
  const raw = result?.processResult || result?.transportInterpretation?.processResult || {};
  const packaged = packageQualificationResetProcessEvidence(raw);
  return {
    processStatus: Number.isInteger(packaged.status) ? packaged.status : null,
    status: Number.isInteger(packaged.status) ? packaged.status : null,
    signal: packaged.signal ?? null,
    timeout: packaged.timeout === true,
    timedOut: packaged.timedOut === true,
    thrown: packaged.thrown === true,
    structuredError: packaged.structuredError,
    stdout: packaged.stdout || "",
    stderr: packaged.stderr || "",
    streams: packaged.streams,
    processEvidenceRejected: packaged.rejected === true,
    captureCalls,
    transportCalls: result?.spies?.transportCalls ?? 0,
    applyCalls: result?.spies?.applyCalls ?? 0,
    sqlCalls: result?.spies?.sqlCalls ?? 0,
    mutationPhaseReached: result?.transportInterpretation?.observed?.mutateAttempted === true
      || result?.spies?.mutateAttempted > 0,
    appliedSqlIdentity: result?.plan?.sqlSha256 || result?.plan?.sha256 || null,
  };
}

function record(id, kind, extra = {}) {
  const base = {
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
    captureCalls: extra.captureCalls ?? null,
    transportCalls: extra.transportCalls ?? null,
    applyCalls: extra.applyCalls ?? extra.resetApply ?? null,
    sqlCalls: extra.sqlCalls ?? extra.sql ?? null,
    mutationPhaseReached: extra.mutationPhaseReached ?? false,
    processStatus: extra.processStatus ?? null,
    signal: extra.signal ?? null,
    timeout: extra.timeout ?? null,
    thrown: extra.thrown === true,
    structuredError: extra.structuredError ?? null,
    streams: extra.streams ?? null,
    stdout: extra.stdout ?? null,
    stderr: extra.stderr ?? null,
    lockWaitObserved: extra.lockWaitObserved ?? null,
    lockSamples: extra.lockSamples ?? null,
    preResetCommittedDrift: extra.preResetCommittedDrift ?? null,
    interleaving: extra.interleaving ?? null,
    backendBoundLock: extra.backendBoundLock ?? null,
    holderCommitted: extra.holderCommitted ?? null,
    holderResult: extra.holderResult ?? null,
    timedOut: extra.timedOut ?? null,
    status: extra.status ?? extra.processStatus ?? null,
    appliedSqlIdentity: extra.appliedSqlIdentity ?? null,
    reparseAttestation: extra.reparseAttestation ?? null,
  };
  const passthrough = {};
  for (const [key, value] of Object.entries(extra)) {
    if (key === "ok" || Object.prototype.hasOwnProperty.call(base, key)) continue;
    passthrough[key] = value;
  }
  return { ...base, ...passthrough };
}

function stableJson(value) {
  return JSON.stringify(value === undefined ? null : value);
}

function recordIdentityKey(record) {
  if (record == null || typeof record !== "object") return stableJson(record);
  const keys = Object.keys(record).sort();
  return stableJson(Object.fromEntries(keys.map((key) => [key, record[key]])));
}

export function retainFingerprintFieldDiffs(expected, observed) {
  const left = expected == null ? expected : canonicalizeFingerprintForCompare(expected);
  const right = observed == null ? observed : canonicalizeFingerprintForCompare(observed);
  const keys = [...new Set([
    ...Object.keys(left && typeof left === "object" && !Array.isArray(left) ? left : {}),
    ...Object.keys(right && typeof right === "object" && !Array.isArray(right) ? right : {}),
  ])].sort();
  const diffs = [];
  for (const field of keys) {
    const ev = left?.[field];
    const ov = right?.[field];
    if (stableJson(ev) === stableJson(ov)) continue;
    if (Array.isArray(ev) || Array.isArray(ov)) {
      const expectedRows = Array.isArray(ev) ? ev : [];
      const observedRows = Array.isArray(ov) ? ov : [];
      const expectedMap = new Map(expectedRows.map((row) => [recordIdentityKey(row), row]));
      const observedMap = new Map(observedRows.map((row) => [recordIdentityKey(row), row]));
      const onlyInExpected = [];
      const onlyInObserved = [];
      for (const [key, row] of expectedMap) {
        if (!observedMap.has(key)) onlyInExpected.push(row);
      }
      for (const [key, row] of observedMap) {
        if (!expectedMap.has(key)) onlyInObserved.push(row);
      }
      diffs.push({
        field,
        kind: "record_set",
        expectedCount: expectedRows.length,
        observedCount: observedRows.length,
        onlyInExpectedCount: onlyInExpected.length,
        onlyInObservedCount: onlyInObserved.length,
        onlyInExpected,
        onlyInObserved,
      });
      continue;
    }
    diffs.push({
      field,
      kind: "value",
      expected: ev ?? null,
      observed: ov ?? null,
    });
  }
  return diffs;
}

export function retainQualifyFingerprintDiffs(qualify) {
  const steps = Array.isArray(qualify?.sequence) ? qualify.sequence : [];
  const files = [];
  const pairs = [];
  for (const step of steps) {
    const file = step?.file;
    if (!file) continue;
    const captured = step.fingerprintAfterApply;
    const observed = captured?.fingerprint && typeof captured.fingerprint === "object"
      ? captured.fingerprint
      : (captured && typeof captured === "object" && captured.schema_version ? captured : null);
    let expected = null;
    try {
      expected = getFrozenExpectedFingerprint(file);
    } catch {
      expected = null;
    }
    let expectedSha256 = null;
    let observedSha256 = null;
    try {
      expectedSha256 = expected ? fingerprintCanonicalSha256(expected) : expectedFingerprintSha256(file);
    } catch {
      expectedSha256 = null;
    }
    try {
      observedSha256 = observed ? fingerprintCanonicalSha256(observed) : null;
    } catch {
      observedSha256 = null;
    }
    files.push({
      file,
      phase: captured?.phase || "after_successful_normal_application",
      expectedSha256,
      observedSha256,
      exactOk: step.fingerprintExact?.ok === true,
      exactReason: step.fingerprintExact?.reason || null,
      observedRetained: observed != null,
      diffs: expected && observed ? retainFingerprintFieldDiffs(expected, observed) : [],
    });
    if (expected && observed) {
      pairs.push({ file, expected, observed, expectedSha256, observedSha256 });
    }
  }
  const localReport = pairs.length > 0
    ? reportLocalFingerprintQualification(pairs, {
      source: "live-qualify-retention",
      derived: false,
      notFreshPostgreSQLExecution: false,
    })
    : null;
  return {
    schema: "f23-fingerprint-field-diff-v1",
    compareUnchanged: true,
    fingerprintAcceptanceUnchanged: true,
    rawComparator: "fingerprintCompleteAndExact",
    localComparisonProfile: LOCAL_FINGERPRINT_COMPARISON_PROFILE_V1,
    rawEquality: localReport?.rawEquality || {
      ok: files.length > 0 && files.every((row) => row.exactOk === true),
      code: files.some((row) => row.exactOk !== true) ? F23_FINGERPRINT_MISMATCH : null,
    },
    localAcceptance: localReport?.localAcceptance || null,
    hostedOutstanding: localReport?.hostedOutstanding || null,
    repairAuthorized: false,
    hostedEquality: false,
    localReport,
    files,
  };
}

function parseHelperArgs(argv = process.argv.slice(2)) {
  const outIdx = argv.indexOf("--fingerprint-diff-out");
  return {
    normalApplicationOnly: argv.includes("--normal-application-only"),
    fingerprintDiffOut: outIdx >= 0 ? argv[outIdx + 1] : (process.env.F23_FINGERPRINT_DIFF_OUT || null),
  };
}

export { completeCaptureBody, processEvidence, record, secretsRemoved };

export function reportF23LocalFingerprintAcceptanceFromQualify(qualify, options = {}) {
  return reportLocalFingerprintQualificationFromQualify(qualify, options);
}

export function reportF23RetainedCaptureLocalAcceptance(root, options = {}) {
  return reportRetainedCaptureLocalAcceptance(root, options);
}

export function qualifySequenceFromDerivedFingerprints(derivedFiles) {
  return {
    sequence: (derivedFiles || []).map((row) => ({
      file: row.file,
      fingerprintAfterApply: {
        phase: "after_successful_normal_application",
        fingerprint: row.observed,
      },
      fingerprintExact: {
        ok: false,
        reason: "fingerprint expected and observed are not canonically equal",
      },
    })),
  };
}

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
  checks.push(record("F23_OUTCOMES_NOT_COMBINED_OR", "check", {
    ok: true,
    note: "completeThrough00123 and documentedAtomicRollbackHold are separately reported; neither OR-satisfies the other",
    completeThrough00123: null,
    documentedAtomicRollbackHold: null,
    combinedAcceptanceRejected: true,
  }));

  const retainedLocal = reportRetainedCaptureLocalAcceptance();
  checks.push(record("F23_LOCAL_FINGERPRINT_PROFILE_V1_RETAINED_CAPTURE", "check", {
    ok: retainedLocal.recordedCanonicalDigestsMatch === true
      && retainedLocal.localAcceptance?.ok === true
      && retainedLocal.rawEquality?.ok === false
      && retainedLocal.rawEquality?.code === F23_FINGERPRINT_MISMATCH
      && retainedLocal.repairAuthorized === false
      && retainedLocal.hostedEquality === false
      && retainedLocal.derived === true,
    profile: LOCAL_FINGERPRINT_COMPARISON_PROFILE_V1,
    rawEquality: retainedLocal.rawEquality,
    localAcceptance: retainedLocal.localAcceptance,
    hostedOutstanding: retainedLocal.hostedOutstanding,
    recordedCanonicalDigestsMatch: retainedLocal.recordedCanonicalDigestsMatch,
    derived: true,
    notFreshPostgreSQLExecution: true,
    note: "Offline reassessment of retained CAPTURE_ATTEMPT_2. Derived fingerprints labeled derived. Not a fresh PostgreSQL execution.",
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

  const authHold = evaluateQualificationResetEligibility({
    observedObjectIdentities: [],
    observedDependencies: [],
    observedHistoryRows: [],
    inventory: emptyQualificationResetInventoryObject({ auth_handle_new_user_trigger: true }),
    inventoryCaptured: true,
    captureComplete: true,
  });
  checks.push(record("CLEAN_BASELINE_AUTH_TRIGGER_HOLD", "check", {
    ok: authHold.alreadyClean !== true && authHold.verdict === "HOLD" && authHold.wipeRouted !== true,
    code: authHold.code,
    verdict: authHold.verdict,
  }));
  const unnestHold = evaluateQualificationResetEligibility({
    observedObjectIdentities: [],
    observedDependencies: [],
    observedHistoryRows: [],
    inventory: emptyQualificationResetInventoryObject({ unnest_uuid_shim: true }),
    inventoryCaptured: true,
    captureComplete: true,
  });
  checks.push(record("CLEAN_BASELINE_UNNEST_HOLD", "check", {
    ok: unnestHold.alreadyClean !== true && unnestHold.verdict === "HOLD" && unnestHold.wipeRouted !== true,
    code: unnestHold.code,
    verdict: unnestHold.verdict,
  }));
  const storageHold = evaluateQualificationResetEligibility({
    observedObjectIdentities: [],
    observedDependencies: [],
    observedHistoryRows: [],
    inventory: emptyQualificationResetInventoryObject({ storage_policies: ["unexpected_access_policy"] }),
    inventoryCaptured: true,
    captureComplete: true,
  });
  checks.push(record("CLEAN_BASELINE_UNEXPECTED_STORAGE_HOLD", "check", {
    ok: storageHold.alreadyClean !== true && storageHold.verdict === "HOLD" && storageHold.wipeRouted !== true,
    code: storageHold.code,
    verdict: storageHold.verdict,
  }));
  const bucketHold = evaluateQualificationResetEligibility({
    observedObjectIdentities: [],
    observedDependencies: [],
    observedHistoryRows: [],
    inventory: emptyQualificationResetInventoryObject({ storage_buckets: ["unexpected_secret_bucket"] }),
    inventoryCaptured: true,
    captureComplete: true,
  });
  checks.push(record("CLEAN_BASELINE_UNEXPECTED_BUCKET_HOLD", "check", {
    ok: bucketHold.alreadyClean !== true && bucketHold.verdict === "HOLD" && bucketHold.wipeRouted !== true,
    code: bucketHold.code,
    verdict: bucketHold.verdict,
  }));
  const bucketPlusNamed = evaluateQualificationResetEligibility({
    observedObjectIdentities: [],
    observedDependencies: [],
    observedHistoryRows: [],
    inventory: emptyQualificationResetInventoryObject({
      storage_buckets: [...FAILED_FLOOR_STORAGE_BUCKETS, "unexpected_secret_bucket"],
    }),
    inventoryCaptured: true,
    captureComplete: true,
  });
  checks.push(record("CLEAN_BASELINE_UNEXPECTED_PLUS_NAMED_BUCKET_HOLD", "check", {
    ok: bucketPlusNamed.alreadyClean !== true && bucketPlusNamed.verdict === "HOLD",
    code: bucketPlusNamed.code,
    verdict: bucketPlusNamed.verdict,
  }));
  const genuineClean = evaluateQualificationResetEligibility({
    observedObjectIdentities: [],
    observedDependencies: [],
    observedHistoryRows: [],
    inventory: emptyQualificationResetInventoryObject(),
    inventoryCaptured: true,
    captureComplete: true,
  });
  checks.push(record("GENUINE_CLEAN_STILL_CLEAN", "check", {
    ok: genuineClean.ok === true && genuineClean.alreadyClean === true && genuineClean.verdict === "QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1",
    verdict: genuineClean.verdict,
  }));
  const nameOnlyGbt = evaluateQualificationResetEligibility({
    observedObjectIdentities: ["public.gbt_text_consistent(internal,text,smallint,oid,internal)"],
    observedDependencies: [],
    observedHistoryRows: [],
    inventoryCaptured: true,
    captureComplete: true,
  });
  checks.push(record("F21_NAME_ONLY_GBT_HOLD", "check", {
    ok: nameOnlyGbt.ok === false && nameOnlyGbt.code === "F13_UNEXPECTED_OBJECT_OR_DEPENDENCY",
    code: nameOnlyGbt.code,
  }));
  const sixFkOk = evaluateQualificationResetEligibility({
    observedObjectIdentities: [
      "public.group_positions",
      "public.groups",
      "public.organizations",
      "public.memberships",
      "public.profiles",
      "public.notification_policy_occurrences",
      "public.position_assignments",
      "public.position_permissions",
    ],
    observedDependencies: [
      { kind: "foreign_key", identity: "group_positions_group_id_fkey", from: "public.group_positions", to: "public.groups" },
      { kind: "foreign_key", identity: "groups_organization_id_fkey", from: "public.groups", to: "public.organizations" },
      { kind: "foreign_key", identity: "memberships_user_id_fkey", from: "public.memberships", to: "public.profiles" },
      { kind: "foreign_key", identity: "notification_policy_occurrences_superseded_by_fkey", from: "public.notification_policy_occurrences", to: "public.notification_policy_occurrences" },
      { kind: "foreign_key", identity: "position_assignments_position_id_fkey", from: "public.position_assignments", to: "public.group_positions" },
      { kind: "foreign_key", identity: "position_permissions_position_id_fkey", from: "public.position_permissions", to: "public.group_positions" },
    ],
    observedHistoryRows: AUTHENTICATED_HISTORY_KEYS.map((key) => ({ version: key.version, name: key.name })),
    inventory: emptyQualificationResetInventoryObject({
      public_tables: [
        "group_positions",
        "groups",
        "organizations",
        "memberships",
        "profiles",
        "notification_policy_occurrences",
        "position_assignments",
        "position_permissions",
      ],
      schema_migrations_rows: AUTHENTICATED_HISTORY_KEYS.length,
    }),
    inventoryCaptured: true,
    captureComplete: true,
  });
  checks.push(record("F21_SIX_HISTORICAL_FKS_OK", "check", {
    ok: sixFkOk.ok === true && sixFkOk.eligible === true,
    verdict: sixFkOk.verdict,
  }));
  const alteredFk = evaluateQualificationResetEligibility({
    observedObjectIdentities: ["public.group_positions", "public.groups"],
    observedDependencies: [{
      kind: "foreign_key",
      identity: "group_positions_group_id_fkey",
      from: "public.group_positions",
      to: "public.profiles",
    }],
    observedHistoryRows: [],
    inventoryCaptured: true,
    captureComplete: true,
  });
  checks.push(record("F21_ALTERED_FK_HOLD", "check", {
    ok: alteredFk.ok === false && alteredFk.code === "F13_UNEXPECTED_OBJECT_OR_DEPENDENCY",
    code: alteredFk.code,
  }));
  const overlap = validateObjectAllowlist([{
    kind: "table",
    identity: "public.financial_accounts",
    membership: {
      schema: "f21-qualification-reset-membership-v1",
      schemaVersion: 1,
      kind: "table",
      identity: "public.financial_accounts",
      classid: 1259,
      objid: 999001,
      objsubid: 0,
      refclassid: 3079,
      refobjid: 999002,
      extname: "btree_gist",
      deptype: "e",
    },
  }], []);
  checks.push(record("F21_UNEXPECTED_MEMBERSHIP_OVERLAP_HOLD", "check", {
    ok: overlap.ok === false && overlap.code === F21_UNEXPECTED_MEMBERSHIP_OVERLAP,
    code: overlap.code,
  }));
  const staleEnvelope = parseQualificationResetInventoryProcessResult({
    status: 0,
    stdout: `${JSON.stringify({
      schema: "f13-qualification-reset-inventory-v1",
      schema_version: 1,
      inventory_capture_sql: "scripts/lib/f3-db-push-inventory.mjs INVENTORY_CAPTURE_SQL",
      capture_complete: true,
      inventory: emptyQualificationResetInventoryObject(),
      discovered_objects: [],
      discovered_dependencies: [],
      observed_objects: [],
      observed_dependencies: [],
      observed_history_rows: [],
    })}\n`,
    stderr: "",
    signal: null,
    timeout: false,
  });
  checks.push(record("F21_STALE_INVENTORY_SCHEMA_HOLD", "check", {
    ok: staleEnvelope.ok === false && staleEnvelope.code === F21_MEMBERSHIP_SCHEMA_STALE,
    code: staleEnvelope.code,
  }));
  const staleAuth = bindFounderAuthorizationArtifact({
    targetRef: APPROVED_DISPOSABLE_PROJECT_REF,
    functionalCandidateSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    closureDigest: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    scopeSqlIdentitySha256: "0".repeat(64),
    executionBudget: { constrainedResets: 1, completeQualsFrom00118: 1, secondReset: false },
  }, {
    targetRef: APPROVED_DISPOSABLE_PROJECT_REF,
    functionalCandidateSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    closureDigest: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    scopeSqlIdentitySha256: scopeSqlIdentityDigest(),
    syntheticBinding: true,
    bindingRole: "negative-test-input",
  });
  checks.push(record("F21_STALE_SCOPE_DIGEST_HOLD", "check", {
    ok: staleAuth.ok === false && staleAuth.code === "F13_FOUNDER_AUTH_MISMATCH",
    code: staleAuth.code,
  }));
  const historicalClean = evaluatePreStubFloorCleanCheck({
    inventory: passingPreStubFloorCleanInventory(),
    historyRows: [],
    listMigrations: [],
  });
  const historicalResolved = resolvePreFloorQualificationGate({
    policy: "QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1",
    target: { project_ref: APPROVED_DISPOSABLE_PROJECT_REF },
    inventory: passingPreStubFloorCleanInventory(),
    historyRows: [],
    listMigrations: [],
  });
  checks.push(record("F22_CLEAN_BASELINE_PRE_FLOOR_UNCHANGED", "check", {
    ok: historicalClean.clean_ok === true
      && historicalClean.classification_verdict === "CLEAN_BASELINE"
      && historicalResolved.allowFloor === true
      && historicalResolved.verdict === "CLEAN_BASELINE",
  }));
  const staleReset = evaluatePreserveBaselinePreFloorGate({
    policy: "QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1",
    target: { project_ref: APPROVED_DISPOSABLE_PROJECT_REF },
    previousResetResult: { ok: true, verdict: "QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1" },
  });
  checks.push(record("F22_STALE_RESET_RECORD_CANNOT_AUTHENTICATE", "check", {
    ok: staleReset.allowFloor !== true && staleReset.code === F21_PRESERVE_BASELINE_FRESH_CAPTURE_REQUIRED,
    code: staleReset.code,
  }));
  const leftoverNamedStorage = evaluateQualificationResetEligibility({
    observedObjectIdentities: ["public.financial_accounts"],
    observedDependencies: [],
    observedHistoryRows: AUTHENTICATED_HISTORY_KEYS.map((key) => ({ version: key.version, name: key.name })),
    inventory: emptyQualificationResetInventoryObject({
      public_tables: ["financial_accounts"],
      schema_migrations_rows: AUTHENTICATED_HISTORY_KEYS.length,
      storage_policies: [...FAILED_FLOOR_STORAGE_POLICY_NAMES],
    }),
    inventoryCaptured: true,
    captureComplete: true,
  });
  checks.push(record("ELIGIBLE_LEFTOVER_NAMED_STORAGE", "check", {
    ok: leftoverNamedStorage.ok === true && leftoverNamedStorage.eligible === true,
    verdict: leftoverNamedStorage.verdict,
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
    observedDependencies: [{
      kind: "foreign_key",
      identity: "memberships_group_id_fkey",
      from: "public.memberships",
      to: "public.groups",
    }],
    scopeSqlIdentitySha256: scopeSqlIdentityDigest(),
  });
  const withoutDoBlocks = String(generated.sql || "").replace(/DO \$[A-Za-z0-9_]+\$[\s\S]*?\$[A-Za-z0-9_]+\$;/g, "");
  checks.push(record("ADVISORY_LOCK_NO_VOID_SELECT", "check", {
    ok: generated.ok === true
      && /PERFORM\s+pg_advisory_xact_lock\s*\(/.test(generated.sql)
      && !/SELECT\s+pg_advisory_xact_lock\s*\(/.test(withoutDoBlocks),
    sql: generated.ok === true,
  }));
  checks.push(record("T1_SQL_BOUND_BACKEND_IDENTITY", "check", {
    ok: generated.ok === true
      && /F18_RESET_BACKEND pid=%/.test(generated.sql)
      && /F18_RESET_LOCK_ACQUIRED pid=%/.test(generated.sql)
      && /pg_backend_pid\(\)/.test(generated.sql)
      && /json_build_object\(/.test(generated.sql),
    sql: generated.ok === true,
  }));
  checks.push(record("T3_SQL_LIVE_CATALOG_TUPLES", "check", {
    ok: generated.ok === true
      && /live catalog dependency tuples after lock/.test(generated.sql)
      && /foreign_key\|memberships_group_id_fkey\|public\.memberships\|public\.groups/.test(generated.sql)
      && /IS DISTINCT FROM/.test(generated.sql)
      && /FINITE_DEPENDENCY_ALLOWLIST/.test(generated.sql),
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
      && closures.runtime.label === "F19_QUALIFICATION_RESET_RUNTIME_CLOSURE"
      && closures.f14BaselineCitedNotExpected.runtime.sha256 === "f6205869b233eaccf375b299112f7b9c352d58c6f2659471e06d2ca7a241e31d"
      && closures.f15BaselineCitedNotExpected.runtime.sha256 === "949e68359e55870050e53ef3f93ec8179fc7a5e1587a908044e0ab26cfdbbb92"
      && closures.f16BaselineCitedNotExpected.runtime.sha256 === F16_BASELINE_RUNTIME_CLOSURE.sha256
      && closures.f16BaselineCitedNotExpected.runtime.notExpectedF17 === true
      && closures.f17BaselineCitedNotExpected.runtime.sha256 === F17_BASELINE_RUNTIME_CLOSURE.sha256
      && closures.f17BaselineCitedNotExpected.runtime.notExpectedF18 === true
      && closures.f18BaselineCitedNotExpected.runtime.sha256 === F18_BASELINE_RUNTIME_CLOSURE.sha256
      && closures.f18BaselineCitedNotExpected.runtime.notExpectedF19 === true
      && closures.runtime.sha256 !== F16_BASELINE_RUNTIME_CLOSURE.sha256
      && closures.runtime.sha256 !== F17_BASELINE_RUNTIME_CLOSURE.sha256
      && closures.runtime.sha256 !== F18_BASELINE_RUNTIME_CLOSURE.sha256,
  }));
  checks.push(record("READ_COMMITTED_LOCK_ORDER_DOCUMENTED", "check", {
    ok: QUALIFICATION_RESET_ISOLATION_LEVEL === "READ COMMITTED"
      && QUALIFICATION_RESET_LOCK_ORDER.serializableSnapshotBeforeLockInsufficient === true
      && generated.ok === true
      && /BEGIN ISOLATION LEVEL READ COMMITTED/.test(generated.sql)
      && !/BEGIN ISOLATION LEVEL SERIALIZABLE/.test(generated.sql),
    sql: generated.ok === true,
  }));

  const plan = validateProposedQualificationResetHostedPlanOffline();
  checks.push(record("PROPOSED_HOSTED_PLAN_OFFLINE", "check", {
    ok: plan.ok === true && plan.transportsDisabled === true,
    replay: false,
  }));

  const validLockObservation = {
    resetProcessId: 11,
    resetBackendPid: 22,
    resetExecutionId: "f18-exec-0123456789ab",
    holderBackendPid: 33,
    datname: "f3_lock_proof",
    relation: "public.financial_accounts",
    holderLock: { pid: 33, mode: "AccessExclusiveLock", granted: true, relation: "public.financial_accounts" },
    waiterLock: { pid: 22, mode: "AccessExclusiveLock", granted: false, relation: "public.financial_accounts" },
    resetWaitOnHolder: { waiterPid: 22, holderPid: 33, blockedByHolder: true },
    holderCommitted: true,
    holderResult: { ok: true },
    committedCatalogChange: true,
    lockAcquisitionByResetBackend: {
      resetBackendPid: 22,
      relation: "public.financial_accounts",
      granted: true,
      t2LockedSameBackend: true,
      afterHolderCommit: true,
    },
    t3RejectionFromSameReset: { sameResetExecution: true, rejected: true, mutationPhaseReached: false },
    appliedSqlIdentity: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    postconditionsComplete: true,
  };
  const lockOk = evaluateBackendBoundLockProof(validLockObservation);
  checks.push(record("BACKEND_BOUND_LOCK_PROOF_POSITIVE", "check", {
    ok: lockOk.ok === true,
    code: lockOk.code,
  }));
  const unrelatedWaiter = evaluateBackendBoundLockProof({
    ...validLockObservation,
    waiterLock: { ...validLockObservation.waiterLock, pid: 99 },
    inferredFromAnyWaiter: true,
  });
  const mismatchedBackend = evaluateBackendBoundLockProof({
    ...validLockObservation,
    lockAcquisitionByResetBackend: {
      ...validLockObservation.lockAcquisitionByResetBackend,
      resetBackendPid: 99,
    },
  });
  const missingCommit = evaluateBackendBoundLockProof({
    ...validLockObservation,
    holderCommitted: false,
    holderResult: { ok: false },
  });
  const missingAcquisition = evaluateBackendBoundLockProof({
    ...validLockObservation,
    lockAcquisitionByResetBackend: {
      resetBackendPid: 22,
      relation: "public.financial_accounts",
      granted: false,
      t2LockedSameBackend: false,
      afterHolderCommit: true,
    },
  });
  checks.push(record("BACKEND_BOUND_LOCK_PROOF_NEGATIVES", "check", {
    ok: unrelatedWaiter.ok !== true
      && mismatchedBackend.ok !== true
      && missingCommit.ok !== true
      && missingAcquisition.ok !== true
      && unrelatedWaiter.code != null
      && missingCommit.code === "F18_LOCK_PROOF_HOLDER_COMMIT_MISSING"
      && missingAcquisition.code === "F18_LOCK_PROOF_ACQUISITION_MISSING",
    note: "unrelated waiter, mismatched backend, missing commit, missing acquisition cannot PASS",
  }));

  const missingStatus = adaptStoredProcessRecordToParserInput({
    stdout: JSON.stringify({ schema: TX_OBSERVATION_SCHEMA, phase: "T7_COMMIT", event: "committed", committed: true }),
  });
  checks.push(record("STORED_PROCESS_STATUS_NOT_DEFAULTED", "check", {
    ok: missingStatus.ok === false && missingStatus.code === "F18_STORED_PROCESS_RECORD_STATUS_MISSING",
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
  psql(url, "DROP TABLE IF EXISTS public.financial_accounts RESTRICT;");
  psql(url, "DROP FUNCTION IF EXISTS public.post_financial_opening_cash(jsonb) RESTRICT;");
  psql(url, "DELETE FROM supabase_migrations.schema_migrations;");
  psql(url, "CREATE TABLE public.financial_accounts (id uuid PRIMARY KEY);");
  psql(url, `CREATE FUNCTION public.post_financial_opening_cash(p_command jsonb)
    RETURNS void LANGUAGE sql AS $$ SELECT 1; $$;`);
  seedHistory(psql, url);
}

function seedApprovedDependencyState(psql, url) {
  psql(url, "CREATE TABLE public.groups (id uuid PRIMARY KEY);");
  psql(url, "CREATE TABLE public.profiles (id uuid PRIMARY KEY);");
  psql(url, `CREATE TABLE public.memberships (
    id uuid PRIMARY KEY,
    group_id uuid NOT NULL REFERENCES public.groups(id)
  );`);
  psql(url, "CREATE TABLE public.financial_accounts (id uuid PRIMARY KEY);");
  psql(url, `CREATE FUNCTION public.post_financial_opening_cash(p_command jsonb)
    RETURNS void LANGUAGE sql AS $$ SELECT 1; $$;`);
  seedHistory(psql, url);
}

function dropApprovedDependencyState(psql, url) {
  psql(url, "DROP TABLE IF EXISTS public.financial_accounts RESTRICT;");
  psql(url, "DROP TABLE IF EXISTS public.memberships RESTRICT;");
  psql(url, "DROP TABLE IF EXISTS public.groups RESTRICT;");
  psql(url, "DROP TABLE IF EXISTS public.profiles RESTRICT;");
  psql(url, "DROP FUNCTION IF EXISTS public.post_financial_opening_cash(jsonb) RESTRICT;");
  psql(url, "DELETE FROM supabase_migrations.schema_migrations;");
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function snapshotExtensionMembership(psql, url) {
  const raw = psql(url, `SELECT coalesce(jsonb_agg(row ORDER BY row->>'classid', row->>'objid', row->>'objsubid', row->>'identity'), '[]'::jsonb)::text
    FROM (
      SELECT jsonb_build_object(
        'classid', d.classid::bigint,
        'objid', d.objid::bigint,
        'objsubid', d.objsubid,
        'refclassid', d.refclassid::bigint,
        'refobjid', d.refobjid::bigint,
        'extname', e.extname,
        'deptype', d.deptype,
        'identity', CASE
          WHEN d.classid = 'pg_proc'::regclass THEN ${CANONICAL_FUNCTION_IDENTITY_SQL}
          WHEN d.classid = 'pg_class'::regclass THEN nc.nspname || '.' || c.relname
          WHEN d.classid = 'pg_type'::regclass THEN nt.nspname || '.' || t.typname
          ELSE d.objid::text
        END
      ) AS row
      FROM pg_depend d
      JOIN pg_extension e ON e.oid = d.refobjid
      LEFT JOIN pg_proc p ON d.classid = 'pg_proc'::regclass AND p.oid = d.objid
      LEFT JOIN pg_namespace n ON n.oid = p.pronamespace
      LEFT JOIN pg_class c ON d.classid = 'pg_class'::regclass AND c.oid = d.objid
      LEFT JOIN pg_namespace nc ON nc.oid = c.relnamespace
      LEFT JOIN pg_type t ON d.classid = 'pg_type'::regclass AND t.oid = d.objid
      LEFT JOIN pg_namespace nt ON nt.oid = t.typnamespace
      WHERE e.extname = 'btree_gist' AND d.deptype = 'e'
    ) s`);
  let tuples = [];
  try {
    tuples = JSON.parse(raw || "[]");
  } catch {
    tuples = [];
  }
  if (!Array.isArray(tuples)) tuples = [];
  const identities = tuples.map((row) => String(row.identity || "")).sort();
  return {
    extensionPresent: String(psql(url, "SELECT extname FROM pg_extension WHERE extname = 'btree_gist';")).includes("btree_gist"),
    memberCount: tuples.length,
    identities,
    tuples,
    identitySet: identities.join("\n"),
    oidSet: tuples.map((row) => `${row.classid}:${row.objid}:${row.objsubid}:${row.refobjid}:${row.deptype}:${row.identity}`).sort().join("\n"),
  };
}

function membershipSetsEqual(before, after) {
  return before?.oidSet === after?.oidSet
    && before?.identitySet === after?.identitySet
    && before?.memberCount === after?.memberCount
    && before?.memberCount > 0
    && Array.isArray(before?.tuples)
    && before.tuples.length === after.tuples.length;
}

async function runSharedLocalQualificationSequence({
  created,
  psql,
  verificationMode,
  scenarioId,
  dbLabel,
}) {
  const db = created.mod.createDisposableDatabase(dbLabel);
  try {
    psql(db.url, "CREATE SCHEMA IF NOT EXISTS supabase_migrations;");
    psql(db.url, `CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
      version text PRIMARY KEY,
      name text
    );`);
    psql(db.url, "CREATE SCHEMA IF NOT EXISTS storage;");
    psql(db.url, "CREATE TABLE IF NOT EXISTS storage.buckets (id text PRIMARY KEY);");
    psql(db.url, "CREATE EXTENSION IF NOT EXISTS btree_gist;");
    const membershipBeforeReset = snapshotExtensionMembership(psql, db.url);
    seedEligibleLeftover(psql, db.url);
    const capture = captureViaLocalPsql(psql, db.url);
    const observed = capture.ok
      ? observedFromQualificationResetCapture(capture.body)
      : capture;
    const reset = observed.ok ? await executeSharedReset(db, observed) : observed;
    const membershipAfterReset = snapshotExtensionMembership(psql, db.url);
    const afterResetCapture = captureViaLocalPsql(psql, db.url);
    const afterResetObserved = afterResetCapture.ok
      ? observedFromQualificationResetCapture(afterResetCapture.body)
      : afterResetCapture;
    const preFloor = afterResetObserved.ok
      ? resolvePreFloorQualificationGate({
        policy: "QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1",
        target: {
          project_ref: APPROVED_DISPOSABLE_PROJECT_REF,
          localFixture: true,
          localFixtureRoutingOnly: true,
          notProductionBypass: true,
        },
        inventory: afterResetObserved.inventory,
        historyRows: afterResetObserved.observedHistoryRows,
        listMigrations: [],
        capture: afterResetObserved,
        inventoryCaptured: true,
        captureComplete: true,
      })
      : afterResetObserved;
    const calls = { floor: 0, dbPush: 0, repair: 0, sequence: 0 };
    const adapters = createLocalFixtureQualifyAdapters({
      url: db.tcpUrl || db.url,
      psql,
      psqlFile: created.mod.psqlFile,
      calls,
    });
    let qualify = { status: "NOT_RUN", verdict: "HOLD" };
    if (preFloor.allowFloor === true && reset.ok === true) {
      try {
        qualify = await runQualifyDisposablePath({
          args: {
            prepFloor: true,
            sequenceF3: true,
            noWipe: true,
            skipCleanup: true,
            floorMode: "stub-live-pin",
            verificationMode,
          },
          adapters,
          skipCliPin: false,
          calls,
        });
      } catch (err) {
        qualify = {
          status: "HOLD",
          verdict: "HOLD",
          error: String(err?.message || err),
          errorCode: err?.code || null,
        };
      }
    }
    const membershipAfterQual = snapshotExtensionMembership(psql, db.url);
    const historyRaw = psql(db.url, `SELECT CASE
      WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL THEN '[]'::text
      ELSE coalesce((
        SELECT jsonb_agg(jsonb_build_object('version', version::text, 'name', name) ORDER BY version)::text
        FROM supabase_migrations.schema_migrations
      ), '[]')
    END`);
    let historyRows = [];
    try {
      historyRows = JSON.parse(historyRaw || "[]");
    } catch {
      historyRows = [];
    }
    if (!Array.isArray(historyRows)) historyRows = [];
    const historyIdentities = verifyExactForwardHistoryIdentities(
      historyRows,
      F3_FORWARD_FILES[F3_FORWARD_FILES.length - 1],
    );
    const firstStep = Array.isArray(qualify.sequence) ? qualify.sequence[0] : null;
    const classification = firstStep?.classification || {};
    const migrationsAppliedThrough00123 = historyIdentities.ok === true
      && historyRows.length === F3_FORWARD_FILES.length
      && Array.isArray(qualify.sequence)
      && qualify.sequence.length === F3_FORWARD_FILES.length;
    const completeThrough00123 = String(qualify.verdict || "").includes("QUALIFICATION PASS")
      && migrationsAppliedThrough00123
      && qualify.verificationMode?.mode === QUALIFICATION_VERIFICATION_MODES.NORMAL_APPLICATION
      && qualify.normalApplicationFingerprintsExact === true
      && (calls.repair || qualify.calls?.repair || 0) === 0
      && qualify.repairExercised !== true;
    const documentedAtomicRollbackHold = preFloor.allowFloor === true
      && qualify.floor?.installed === true
      && qualify.preDbPushGates?.ok === true
      && classification.split === "PRE_COMMIT_OR_ATOMIC_ROLLBACK"
      && classification.historyFailed === true
      && classification.repairAuthorizedByFilenameVersion === false
      && (calls.repair || qualify.calls?.repair || 0) === 0
      && (calls.dbPush || qualify.calls?.dbPush || 0) >= 1
      && /repair-safety gate failed/i.test(String(qualify.limitation || qualify.error || ""));
    const sharedOk = reset.ok === true
      && reset.verdict === "QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1"
      && preFloor.allowFloor === true
      && preFloor.verdict === "QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1"
      && membershipSetsEqual(membershipBeforeReset, membershipAfterReset)
      && membershipSetsEqual(membershipAfterReset, membershipAfterQual);
    const faultInjectionSafetyPass = sharedOk && documentedAtomicRollbackHold === true;
    const localApplicationComplete = sharedOk && completeThrough00123 === true;
    const authenticatedNormalHold = verificationMode === QUALIFICATION_VERIFICATION_MODES.NORMAL_APPLICATION
      && sharedOk
      && qualify.verificationMode?.mode === QUALIFICATION_VERIFICATION_MODES.NORMAL_APPLICATION
      && (calls.repair || qualify.calls?.repair || 0) === 0
      && qualify.repairExercised !== true
      && completeThrough00123 !== true
      && Boolean(qualify.errorCode || qualify.limitation || qualify.error);
    const pass = verificationMode === QUALIFICATION_VERIFICATION_MODES.NORMAL_APPLICATION
      ? (localApplicationComplete || authenticatedNormalHold)
      : faultInjectionSafetyPass;
    const remainingHold = verificationMode === QUALIFICATION_VERIFICATION_MODES.NORMAL_APPLICATION
      ? (localApplicationComplete ? null : (qualify.errorCode || qualify.limitation || qualify.error || "F23_NORMAL_APPLICATION_INCOMPLETE"))
      : "F22_LOCAL_CLI_ATOMIC_ROLLBACK_REPAIR_REFUSED";
    return record(scenarioId, "scenario", {
      ok: pass,
      capture: verificationMode === QUALIFICATION_VERIFICATION_MODES.NORMAL_APPLICATION
        ? "preserve-reset-then-shared-qualify-normal-application-00118-00123"
        : "preserve-reset-then-shared-qualify-fault-injection-00118",
      resetApply: reset.spies?.applyCalls ?? 0,
      commit: reset.committed === true,
      verdict: qualify.verdict || reset.verdict,
      preFloorVerdict: preFloor.verdict || null,
      qualifyStatus: qualify.status || null,
      qualifyError: qualify.error || qualify.limitation || null,
      qualifyErrorCode: qualify.errorCode || null,
      verificationMode,
      verificationModeRecorded: qualify.verificationMode || null,
      completeThrough00123,
      migrationsAppliedThrough00123,
      documentedAtomicRollbackHold,
      localApplicationComplete,
      faultInjectionSafetyPass,
      remainingHold,
      classification,
      objectsPresent: firstStep?.objectsPresent ?? null,
      repairAttempted: firstStep?.repairAttempted === true,
      repairExercised: qualify.repairExercised === true || firstStep?.repairExercised === true,
      floorInstalled: qualify.floor?.installed === true,
      preDbPushGatesOk: qualify.preDbPushGates?.ok === true,
      sequenceLength: Array.isArray(qualify.sequence) ? qualify.sequence.length : 0,
      historyAfter: historyRows.length,
      historyIdentities,
      expectedHistory: F3_FORWARD_FILES.length,
      operationCounts: qualify.operationCounts || {
        calibrationProbes: null,
        migrationApplications: calls.dbPush || qualify.calls?.dbPush || 0,
        retries: 0,
        repairs: calls.repair || qualify.calls?.repair || 0,
        historyInjects: verificationMode === QUALIFICATION_VERIFICATION_MODES.FAULT_INJECTION ? 1 : 0,
      },
      floorCalls: calls.floor || qualify.calls?.floor || 0,
      dbPushCalls: calls.dbPush || qualify.calls?.dbPush || 0,
      repairCalls: calls.repair || qualify.calls?.repair || 0,
      fingerprintRetention: verificationMode === QUALIFICATION_VERIFICATION_MODES.NORMAL_APPLICATION
        ? retainQualifyFingerprintDiffs(qualify)
        : null,
      fingerprintReport: verificationMode === QUALIFICATION_VERIFICATION_MODES.NORMAL_APPLICATION
        ? reportLocalFingerprintQualificationFromQualify(qualify, {
          source: "f23-normal-application-live-sequence",
        })
        : null,
      executedTransaction: true,
      substitutedInterfaces: adapters.substitutedInterfaces,
      hostedIdentityProof: false,
      membership: {
        beforeReset: {
          extensionPresent: membershipBeforeReset.extensionPresent,
          memberCount: membershipBeforeReset.memberCount,
          identities: membershipBeforeReset.identities,
          tuples: membershipBeforeReset.tuples,
        },
        afterReset: {
          extensionPresent: membershipAfterReset.extensionPresent,
          memberCount: membershipAfterReset.memberCount,
          identities: membershipAfterReset.identities,
          tuples: membershipAfterReset.tuples,
        },
        afterQualification: {
          extensionPresent: membershipAfterQual.extensionPresent,
          memberCount: membershipAfterQual.memberCount,
          identities: membershipAfterQual.identities,
          tuples: membershipAfterQual.tuples,
        },
        exactSetEqualBeforeAfterReset: membershipSetsEqual(membershipBeforeReset, membershipAfterReset),
        exactSetEqualAfterResetAfterQual: membershipSetsEqual(membershipAfterReset, membershipAfterQual),
        countsAloneInsufficient: true,
      },
      note: "DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT",
    });
  } finally {
    try {
      db.close();
    } catch {
      // preserve other DBs
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function queryBoundLockState(psql, url, relation, holderPid, resetBackendPid) {
  const raw = psql(url, `
    SELECT json_build_object(
      'datname', current_database(),
      'relation', ${sqlLiteral(relation)},
      'holder', (
        SELECT json_build_object(
          'pid', l.pid,
          'mode', l.mode,
          'granted', l.granted,
          'locktype', l.locktype,
          'relation', ${sqlLiteral(relation)}
        )
        FROM pg_locks l
        WHERE l.pid = ${Number(holderPid)}
          AND l.granted
          AND l.relation = ${sqlLiteral(relation)}::regclass
        LIMIT 1
      ),
      'resetWaiter', (
        SELECT json_build_object(
          'pid', l.pid,
          'mode', l.mode,
          'granted', l.granted,
          'locktype', l.locktype,
          'relation', ${sqlLiteral(relation)},
          'blockedByHolder', ${Number(holderPid)} = ANY (pg_blocking_pids(l.pid))
        )
        FROM pg_locks l
        WHERE l.pid = ${Number(resetBackendPid)}
          AND NOT l.granted
          AND l.relation = ${sqlLiteral(relation)}::regclass
        LIMIT 1
      ),
      'resetGranted', (
        SELECT json_build_object(
          'pid', l.pid,
          'mode', l.mode,
          'granted', l.granted,
          'locktype', l.locktype,
          'relation', ${sqlLiteral(relation)}
        )
        FROM pg_locks l
        WHERE l.pid = ${Number(resetBackendPid)}
          AND l.granted
          AND l.relation = ${sqlLiteral(relation)}::regclass
        LIMIT 1
      )
    );
  `);
  return JSON.parse(String(raw));
}

async function waitForCondition(probe, timeoutMs = 4000) {
  const started = Date.now();
  const samples = [];
  while (Date.now() - started < timeoutMs) {
    const state = probe();
    samples.push({ atMs: Date.now() - started, ...state });
    if (state?.matched === true) {
      return { matched: true, state, samples };
    }
    await sleep(20);
  }
  return { matched: false, state: samples.at(-1) || null, samples };
}

function readJsonIfPresent(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function startHolderLock(url, relation) {
  const { spawnLocalPsql } = await import("./lib/f3-local-connection-guard.mjs");
  const child = spawnLocalPsql(url, ["-At"]);
  let out = "";
  child.stdout?.on("data", (chunk) => {
    out += String(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    out += String(chunk);
  });
  const send = (sql) => child.stdin.write(`${sql}\n`);
  send("BEGIN;");
  send("SET lock_timeout = '30s';");
  send("SET idle_in_transaction_session_timeout = '60s';");
  send(`LOCK TABLE ${relation} IN ACCESS EXCLUSIVE MODE;`);
  send("SELECT pg_backend_pid();");
  const started = Date.now();
  let holderPid = null;
  while (Date.now() - started < 2000) {
    const tokens = out.trim().split(/\s+/).filter(Boolean);
    const last = tokens.at(-1);
    if (/^\d+$/.test(last)) {
      holderPid = Number(last);
      break;
    }
    await sleep(20);
  }
  if (!Number.isInteger(holderPid)) {
    throw new Error(`holder pid not observed: ${out.slice(-400)}`);
  }
  return {
    child,
    holderPid,
    send,
    output: () => out,
    async close() {
      try {
        send("ROLLBACK;");
      } catch {
        // holder teardown
      }
      try {
        child.stdin.end();
      } catch {
        // holder teardown
      }
      child.kill("SIGTERM");
    },
  };
}

function spawnSharedResetWorker(db, observed, { executionId } = {}) {
  const payloadDir = fs.mkdtempSync(path.join(os.tmpdir(), "f18-reset-worker-"));
  const payloadPath = path.join(payloadDir, "payload.json");
  const resultPath = path.join(payloadDir, "result.json");
  const identityPath = path.join(payloadDir, "reset-backend.json");
  const acquiredPath = path.join(payloadDir, "lock-acquired.json");
  const resolvedExecutionId = executionId || `f18_reset_${process.pid}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  fs.writeFileSync(payloadPath, `${JSON.stringify({
    url: db.url,
    observed,
    resultPath,
    identityPath,
    acquiredPath,
    executionId: resolvedExecutionId,
  })}\n`);
  const child = spawn(process.execPath, [path.join(ROOT, HELPER_RELPATH), "--shared-reset-worker", payloadPath], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdoutChunks = [];
  const stderrChunks = [];
  child.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
  child.stderr.on("data", (chunk) => stderrChunks.push(chunk));
  const done = new Promise((resolve) => {
    child.on("close", (status, signal) => {
      let result = null;
      try {
        result = JSON.parse(fs.readFileSync(resultPath, "utf8"));
      } catch {
        result = null;
      }
      resolve({
        status,
        signal: signal || null,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        result,
        payloadDir,
        identity: readJsonIfPresent(identityPath),
        acquired: readJsonIfPresent(acquiredPath),
        executionId: resolvedExecutionId,
      });
    });
  });
  return {
    child,
    done,
    payloadDir,
    identityPath,
    acquiredPath,
    executionId: resolvedExecutionId,
    processId: child.pid,
  };
}

async function runLockWaitDriftScenario({
  psql,
  db,
  id,
  driftSql,
  relation,
  retainQuery,
  retainNeedle,
  note,
}) {
  dropApprovedDependencyState(psql, db.url);
  seedApprovedDependencyState(psql, db.url);
  const capture = captureViaLocalPsql(psql, db.url);
  const observed = capture.ok
    ? (await import("./lib/f3-db-push-inventory.mjs")).observedFromQualificationResetCapture(capture.body)
    : capture;
  if (!observed.ok) {
    return record(id, "scenario", {
      ok: false,
      executedTransaction: false,
      code: observed.code,
      note: "capture failed before lock-wait scenario",
    });
  }
  const holder = await startHolderLock(db.url, relation);
  const worker = spawnSharedResetWorker(db, observed);
  const identityWait = await waitForCondition(() => {
    const identity = readJsonIfPresent(worker.identityPath);
    const backendPid = Number(identity?.backendPid);
    return {
      matched: Number.isInteger(backendPid) && backendPid > 0 && identity.workerPid === worker.processId,
      identity,
    };
  });
  const resetIdentity = identityWait.state?.identity || null;
  const resetBackendPid = Number(resetIdentity?.backendPid);
  const wait = Number.isInteger(resetBackendPid)
    ? await waitForCondition(() => {
      const state = queryBoundLockState(psql, db.url, relation, holder.holderPid, resetBackendPid);
      const waiter = state.resetWaiter;
      return {
        matched: Boolean(
          state.holder?.granted === true
          && waiter?.pid === resetBackendPid
          && waiter?.granted === false
          && waiter?.blockedByHolder === true
          && waiter?.relation === relation
          && state.datname,
        ),
        ...state,
      };
    })
    : { matched: false, state: null, samples: [] };
  const interleaving = {
    t1ReachedThenWaited: identityWait.matched === true && wait.matched === true,
    resetProcessId: worker.processId,
    resetBackendPid: Number.isInteger(resetBackendPid) ? resetBackendPid : null,
    resetExecutionId: worker.executionId,
    holderBackendPid: holder.holderPid,
    datname: wait.state?.datname || resetIdentity?.datname || null,
    relation,
    holderLock: wait.state?.holder || null,
    waiterLock: wait.state?.resetWaiter || null,
    isolation: QUALIFICATION_RESET_ISOLATION_LEVEL,
    inferredFromAnyWaiter: false,
    inferredFromApplicationNameAlone: false,
    inferredFromEventTypeAlone: false,
  };
  if (identityWait.matched !== true || wait.matched !== true) {
    await holder.close();
    const finished = await worker.done;
    fs.rmSync(worker.payloadDir, { recursive: true, force: true });
    return record(id, "scenario", {
      ok: false,
      executedTransaction: true,
      lockWaitObserved: false,
      lockSamples: [...identityWait.samples, ...wait.samples],
      interleaving,
      note: "reset backend identity from the same SQL connection was not bound before holder commit",
      processStatus: finished.status,
      stdout: finished.stdout,
      stderr: finished.stderr,
    });
  }
  for (const stmt of driftSql) {
    holder.send(stmt);
  }
  holder.send("COMMIT;");
  holder.send("SELECT 'HOLDER_COMMITTED';");
  const commitWait = await waitForCondition(() => ({
    matched: String(holder.output()).includes("HOLDER_COMMITTED"),
  }));
  const committedDrift = (() => {
    try {
      return String(psql(db.url, retainQuery));
    } catch (err) {
      return String(err?.message || err);
    }
  })();
  const holderCommitted = commitWait.matched === true;
  const catalogChanged = String(committedDrift).includes(retainNeedle);
  const acquisitionWait = await waitForCondition(() => {
    const acquired = readJsonIfPresent(worker.acquiredPath);
    const live = queryBoundLockState(psql, db.url, relation, holder.holderPid, resetBackendPid);
    const t2Same = acquired?.backendPid === resetBackendPid && acquired?.phase === "T2_LOCK" && acquired?.event === "locked";
    const granted = live.resetGranted?.pid === resetBackendPid && live.resetGranted?.granted === true;
    return {
      matched: t2Same === true || granted === true,
      acquired,
      live,
      t2Same,
      granted,
    };
  });
  const finished = await worker.done;
  await holder.close();
  const reset = finished.result || {};
  const evidence = processEvidence(reset);
  const retained = String(psql(db.url, retainQuery));
  const accountsKept = psql(db.url, "SELECT to_regclass('public.financial_accounts') IS NOT NULL;");
  fs.rmSync(worker.payloadDir, { recursive: true, force: true });
  const t2Obs = (reset.transportInterpretation?.observed?.observations || [])
    .find((row) => row.phase === "T2_LOCK" && row.event === "locked");
  const t3Rejected = reset.ok === false
    && reset.committed !== true
    && evidence.mutationPhaseReached !== true
    && (reset.transportInterpretation?.phaseReached === "T2_LOCK"
      || String(reset.code || "").includes("UNEXPECTED")
      || String(reset.transportInterpretation?.observed?.framingCode || "").length >= 0);
  const appliedSqlIdentity = evidence.appliedSqlIdentity
    || reset.plan?.sqlSha256
    || reset.plan?.sha256
    || null;
  const backendBound = {
    resetProcessId: worker.processId,
    resetBackendPid,
    resetExecutionId: worker.executionId,
    holderBackendPid: holder.holderPid,
    datname: wait.state.datname,
    relation,
    holderLock: wait.state.holder,
    waiterLock: wait.state.resetWaiter,
    resetWaitOnHolder: {
      waiterPid: resetBackendPid,
      holderPid: holder.holderPid,
      blockedByHolder: wait.state.resetWaiter?.blockedByHolder === true,
    },
    holderCommitted,
    holderResult: { ok: holderCommitted && catalogChanged },
    committedCatalogChange: catalogChanged,
    lockAcquisitionByResetBackend: {
      resetBackendPid,
      relation,
      granted: acquisitionWait.state?.granted === true,
      t2LockedSameBackend: t2Obs?.backendPid === resetBackendPid || acquisitionWait.state?.t2Same === true,
      afterHolderCommit: holderCommitted === true,
    },
    t3RejectionFromSameReset: {
      sameResetExecution: finished.identity?.executionId === worker.executionId
        || finished.identity?.backendPid === resetBackendPid
        || t2Obs?.backendPid === resetBackendPid,
      rejected: reset.ok === false && reset.committed !== true,
      mutationPhaseReached: evidence.mutationPhaseReached === true,
      code: reset.code || null,
    },
    appliedSqlIdentity,
    postconditionsComplete: String(retained).includes(retainNeedle)
      && String(accountsKept).includes("t")
      && catalogChanged,
    inferredFromAnyWaiter: false,
    inferredFromApplicationNameAlone: false,
    inferredFromEventTypeAlone: false,
  };
  const lockProof = evaluateBackendBoundLockProof(backendBound);
  const reparseAttestation = attestQualificationResetReparse({
    ...evidence,
    processStatus: evidence.processStatus,
    status: evidence.status,
    verdict: reset.verdict || "HOLD",
  }, {
    verdict: reset.verdict || "HOLD",
    scenarioOk: false,
  });
  return record(id, "scenario", {
    ok: reset.ok === false
      && reset.committed !== true
      && evidence.mutationPhaseReached !== true
      && lockProof.ok === true
      && holderCommitted === true
      && catalogChanged
      && String(retained).includes(retainNeedle)
      && String(accountsKept).includes("t"),
    capture: "approved-set-then-lock-wait-then-externally-committed-drift",
    resetApply: reset.spies?.applyCalls ?? 0,
    sql: true,
    commit: false,
    rollback: reset.rolledBack ?? null,
    replay: reset.spies?.replayCalls === 1,
    observedPhase: reset.transportInterpretation?.phaseReached ?? null,
    code: reset.code,
    verdict: reset.verdict || "HOLD",
    executedTransaction: true,
    lockWaitObserved: true,
    lockSamples: [...identityWait.samples, ...wait.samples, ...acquisitionWait.samples],
    interleaving,
    backendBoundLock: { observation: backendBound, proof: lockProof },
    holderCommitted,
    holderResult: backendBound.holderResult,
    preResetCommittedDrift: {
      retained: String(retained),
      observedAfterHolderCommit: String(committedDrift),
    },
    reparseAttestation,
    note,
    ...evidence,
  });
}

export { executeSharedReset };

async function executeSharedReset(db, observed, {
  onStdoutLine = null,
  streamObservations = false,
} = {}) {
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
          onStdoutLine,
          streamObservations,
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

async function runLocalPgScenarios({ normalApplicationOnly = false } = {}) {
  const created = await maybeCreateLocalDb();
  if (!created.ok) {
    return {
      available: false,
      reason: created.reason,
      serverVersion: null,
      scenarios: [
        mustLocalRecord("UNEXPECTED_OBJECT_BLOCKS_BEFORE_PLAN"),
        mustLocalRecord("TX_SUCCESSFUL_RESET"),
        mustLocalRecord("TX_UNEXPECTED_OBJECT_ROLLBACK"),
        mustLocalRecord("TX_HISTORY_MISMATCH_ROLLBACK"),
        mustLocalRecord("TX_T3_UNAPPROVED_FK_ROLLBACK"),
        mustLocalRecord("TX_T3_RETARGETED_FK_ROLLBACK"),
        mustLocalRecord("TX_T3_APPROVED_SET_SUCCESS"),
        mustLocalRecord("F21_TX_PRESERVE_EXTENSION_AND_MEMBERS"),
        mustLocalRecord("F21_NAME_ONLY_OR_UNRELATED_LEFTOVER_HOLD"),
        mustLocalRecord("F21_LOCAL_QUAL_FROM_00118_PREINSTALLED_INDUCED_HOLD"),
        mustLocalRecord("F22_COMPLETE_LOCAL_QUALIFICATION"),
        mustLocalRecord("F23_NORMAL_APPLICATION_LOCAL_QUALIFICATION"),
        mustLocalRecord("TX_T3_LOCKWAIT_UNAPPROVED_FK_ROLLBACK"),
        mustLocalRecord("TX_T3_LOCKWAIT_RETARGETED_FK_ROLLBACK"),
      ],
    };
  }
  const { db } = created;
  const { psql } = created.mod;
  const scenarios = [];
  let serverVersion = null;
  try {
    serverVersion = String(psql(db.url, "SHOW server_version;")).trim();
    if (normalApplicationOnly) {
      scenarios.push(await runSharedLocalQualificationSequence({
        created,
        psql,
        verificationMode: QUALIFICATION_VERIFICATION_MODES.NORMAL_APPLICATION,
        scenarioId: "F23_NORMAL_APPLICATION_LOCAL_QUALIFICATION",
        dbLabel: "f23_normal_app",
      }));
      return { available: true, scenarios, serverVersion };
    }
    psql(db.url, "CREATE SCHEMA IF NOT EXISTS supabase_migrations;");
    psql(db.url, `CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
      version text PRIMARY KEY,
      name text
    );`);
    // Bare local PG has no Storage API catalog. Capture SQL references
    // storage.buckets in a CASE branch that PostgreSQL still parses.
    // Stub only — not a wipe target and not a deletion expansion.
    psql(db.url, "CREATE SCHEMA IF NOT EXISTS storage;");
    psql(db.url, "CREATE TABLE IF NOT EXISTS storage.buckets (id text PRIMARY KEY);");

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
    const successEvidence = processEvidence(success);
    const successAttestation = attestQualificationResetReparse({
      ...successEvidence,
      processStatus: successEvidence.processStatus,
      status: successEvidence.status,
    }, { verdict: success.verdict, scenarioOk: success.ok === true });
    scenarios.push(record("TX_SUCCESSFUL_RESET", "scenario", {
      ok: success.ok === true
        && success.committed === true
        && success.verdict === "QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1"
        && successAttestation.interpretedCommitted === true
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
      reparseAttestation: successAttestation,
      ...successEvidence,
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
    const unexpectedEvidence = processEvidence(unexpectedTx);
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
      ...unexpectedEvidence,
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
    const historyEvidence = processEvidence(historyTx);
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
      ...historyEvidence,
    }));

    dropApprovedDependencyState(psql, db.url);
    seedApprovedDependencyState(psql, db.url);
    const t3BaseCapture = captureViaLocalPsql(psql, db.url);
    const t3BaseObserved = t3BaseCapture.ok
      ? (await import("./lib/f3-db-push-inventory.mjs")).observedFromQualificationResetCapture(t3BaseCapture.body)
      : t3BaseCapture;
    psql(db.url, "ALTER TABLE public.financial_accounts ADD COLUMN group_id uuid;");
    psql(db.url, `ALTER TABLE public.financial_accounts
      ADD CONSTRAINT unapproved_accounts_groups_fkey
      FOREIGN KEY (group_id) REFERENCES public.groups(id);`);
    const t3Unapproved = t3BaseObserved.ok
      ? await executeSharedReset(db, t3BaseObserved)
      : t3BaseObserved;
    const t3UnapprovedEvidence = processEvidence(t3Unapproved);
    const unapprovedKept = psql(db.url, `SELECT conname FROM pg_constraint
      WHERE conname = 'unapproved_accounts_groups_fkey';`);
    const t3AccountsKept = psql(db.url, "SELECT to_regclass('public.financial_accounts') IS NOT NULL;");
    const t3MembershipsKept = psql(db.url, "SELECT to_regclass('public.memberships') IS NOT NULL;");
    scenarios.push(record("TX_T3_UNAPPROVED_FK_ROLLBACK", "scenario", {
      ok: t3Unapproved.ok === false
        && t3Unapproved.committed !== true
        && t3UnapprovedEvidence.mutationPhaseReached !== true
        && String(unapprovedKept).includes("unapproved_accounts_groups_fkey")
        && String(t3AccountsKept).includes("t")
        && String(t3MembershipsKept).includes("t"),
      capture: "approved-set-then-unapproved-fk-after-capture-before-lock",
      resetApply: t3Unapproved.spies?.applyCalls ?? 0,
      sql: t3Unapproved.plan?.sql != null,
      commit: false,
      rollback: t3Unapproved.rolledBack ?? null,
      replay: t3Unapproved.spies?.replayCalls === 1,
      observedPhase: t3Unapproved.transportInterpretation?.phaseReached ?? null,
      code: t3Unapproved.code,
      verdict: t3Unapproved.verdict || "HOLD",
      executedTransaction: true,
      note: "unapproved FK between allowlisted tables after capture is T3-rejected; injected change retained",
      ...t3UnapprovedEvidence,
    }));
    psql(db.url, "ALTER TABLE public.financial_accounts DROP CONSTRAINT IF EXISTS unapproved_accounts_groups_fkey;");
    psql(db.url, "ALTER TABLE public.financial_accounts DROP COLUMN IF EXISTS group_id;");

    const t3RetargetCapture = captureViaLocalPsql(psql, db.url);
    const t3RetargetObserved = t3RetargetCapture.ok
      ? (await import("./lib/f3-db-push-inventory.mjs")).observedFromQualificationResetCapture(t3RetargetCapture.body)
      : t3RetargetCapture;
    psql(db.url, "ALTER TABLE public.memberships DROP CONSTRAINT memberships_group_id_fkey;");
    psql(db.url, `ALTER TABLE public.memberships
      ADD CONSTRAINT memberships_group_id_fkey
      FOREIGN KEY (group_id) REFERENCES public.profiles(id);`);
    const t3Retarget = t3RetargetObserved.ok
      ? await executeSharedReset(db, t3RetargetObserved)
      : t3RetargetObserved;
    const t3RetargetEvidence = processEvidence(t3Retarget);
    const retargetTo = psql(db.url, `SELECT fn.nspname || '.' || frel.relname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = rel.relnamespace
      JOIN pg_class frel ON frel.oid = con.confrelid
      JOIN pg_namespace fn ON fn.oid = frel.relnamespace
      WHERE con.conname = 'memberships_group_id_fkey';`);
    const retargetMembershipsKept = psql(db.url, "SELECT to_regclass('public.memberships') IS NOT NULL;");
    scenarios.push(record("TX_T3_RETARGETED_FK_ROLLBACK", "scenario", {
      ok: t3Retarget.ok === false
        && t3Retarget.committed !== true
        && t3RetargetEvidence.mutationPhaseReached !== true
        && String(retargetTo).includes("public.profiles")
        && String(retargetMembershipsKept).includes("t"),
      capture: "approved-identity-then-retargeted-after-capture-before-lock",
      resetApply: t3Retarget.spies?.applyCalls ?? 0,
      sql: t3Retarget.plan?.sql != null,
      commit: false,
      rollback: t3Retarget.rolledBack ?? null,
      replay: t3Retarget.spies?.replayCalls === 1,
      observedPhase: t3Retarget.transportInterpretation?.phaseReached ?? null,
      code: t3Retarget.code,
      verdict: t3Retarget.verdict || "HOLD",
      executedTransaction: true,
      note: "approved FK identity retargeted after capture is T3-rejected; retarget retained",
      ...t3RetargetEvidence,
    }));
    psql(db.url, "ALTER TABLE public.memberships DROP CONSTRAINT IF EXISTS memberships_group_id_fkey;");
    psql(db.url, `ALTER TABLE public.memberships
      ADD CONSTRAINT memberships_group_id_fkey
      FOREIGN KEY (group_id) REFERENCES public.groups(id);`);

    const t3SuccessCapture = captureViaLocalPsql(psql, db.url);
    const t3SuccessObserved = t3SuccessCapture.ok
      ? (await import("./lib/f3-db-push-inventory.mjs")).observedFromQualificationResetCapture(t3SuccessCapture.body)
      : t3SuccessCapture;
    const t3Success = t3SuccessObserved.ok
      ? await executeSharedReset(db, t3SuccessObserved)
      : t3SuccessObserved;
    const t3SuccessEvidence = processEvidence(t3Success);
    const t3SuccessAttestation = attestQualificationResetReparse({
      ...t3SuccessEvidence,
      processStatus: t3SuccessEvidence.processStatus,
      status: t3SuccessEvidence.status,
    }, { verdict: t3Success.verdict, scenarioOk: t3Success.ok === true });
    const t3AccountsGone = psql(db.url, "SELECT to_regclass('public.financial_accounts') IS NULL;");
    const t3MembershipsGone = psql(db.url, "SELECT to_regclass('public.memberships') IS NULL;");
    const t3HistoryGone = psql(db.url, "SELECT count(*)::text FROM supabase_migrations.schema_migrations;");
    scenarios.push(record("TX_T3_APPROVED_SET_SUCCESS", "scenario", {
      ok: t3Success.ok === true
        && t3Success.committed === true
        && t3Success.verdict === "QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1"
        && t3SuccessAttestation.interpretedCommitted === true
        && String(t3AccountsGone).includes("t")
        && String(t3MembershipsGone).includes("t")
        && String(t3HistoryGone) === "0",
      capture: "unchanged-approved-dependency-set",
      resetApply: t3Success.spies?.applyCalls ?? 0,
      sql: t3Success.plan?.sql != null,
      commit: t3Success.committed === true,
      rollback: t3Success.rolledBack ?? null,
      replay: t3Success.spies?.replayCalls === 1,
      observedPhase: t3Success.transportInterpretation?.phaseReached ?? null,
      verdict: t3Success.verdict,
      executedTransaction: true,
      note: "unchanged approved dependency set commits QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1",
      reparseAttestation: t3SuccessAttestation,
      ...t3SuccessEvidence,
    }));

    dropApprovedDependencyState(psql, db.url);
    psql(db.url, "CREATE EXTENSION IF NOT EXISTS btree_gist;");
    const extBefore = psql(db.url, "SELECT extname FROM pg_extension WHERE extname = 'btree_gist';");
    const membersBefore = psql(db.url, `SELECT count(*)::text FROM pg_depend d
      JOIN pg_extension e ON e.oid = d.refobjid
      WHERE e.extname = 'btree_gist' AND d.deptype = 'e';`);
    seedEligibleLeftover(psql, db.url);
    const preserveCapture = captureViaLocalPsql(psql, db.url);
    const preserveObserved = preserveCapture.ok
      ? (await import("./lib/f3-db-push-inventory.mjs")).observedFromQualificationResetCapture(preserveCapture.body)
      : preserveCapture;
    const typedMembers = Array.isArray(preserveObserved.observedObjects)
      ? preserveObserved.observedObjects.filter((row) => row?.membership?.deptype === "e")
      : [];
    const preserveReset = preserveObserved.ok ? await executeSharedReset(db, preserveObserved) : preserveObserved;
    const extAfter = psql(db.url, "SELECT extname FROM pg_extension WHERE extname = 'btree_gist';");
    const membersAfter = psql(db.url, `SELECT count(*)::text FROM pg_depend d
      JOIN pg_extension e ON e.oid = d.refobjid
      WHERE e.extname = 'btree_gist' AND d.deptype = 'e';`);
    const accountsGonePreserve = psql(db.url, "SELECT to_regclass('public.financial_accounts') IS NULL;");
    const historyGonePreserve = psql(db.url, "SELECT count(*)::text FROM supabase_migrations.schema_migrations;");
    const preserveEvidence = processEvidence(preserveReset);
    scenarios.push(record("F21_TX_PRESERVE_EXTENSION_AND_MEMBERS", "scenario", {
      ok: preserveReset.ok === true
        && preserveReset.committed === true
        && preserveReset.verdict === "QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1"
        && String(extBefore).includes("btree_gist")
        && String(extAfter).includes("btree_gist")
        && String(membersBefore) === String(membersAfter)
        && Number(membersAfter) > 0
        && typedMembers.length > 0
        && String(accountsGonePreserve).includes("t")
        && String(historyGonePreserve) === "0",
      capture: "preinstalled-btree_gist-plus-eligible-leftover",
      resetApply: preserveReset.spies?.applyCalls ?? 0,
      sql: preserveReset.plan?.sql != null,
      commit: preserveReset.committed === true,
      verdict: preserveReset.verdict,
      executedTransaction: true,
      note: "reset preserves btree_gist and authenticated members; only approved leftovers/history change",
      catalogBefore: { extension: extBefore, memberCount: membersBefore, typedMembers: typedMembers.length },
      catalogAfter: { extension: extAfter, memberCount: membersAfter },
      ...preserveEvidence,
    }));

    psql(db.url, `CREATE FUNCTION public.gbt_forged_nameonly() RETURNS void LANGUAGE sql AS $$ SELECT 1; $$;`);
    const forgedCapture = captureViaLocalPsql(psql, db.url);
    const forgedObserved = forgedCapture.ok
      ? (await import("./lib/f3-db-push-inventory.mjs")).observedFromQualificationResetCapture(forgedCapture.body)
      : forgedCapture;
    const forgedElig = forgedObserved.ok
      ? evaluateQualificationResetEligibility({
        observedObjectIdentities: forgedObserved.observedObjects,
        observedDependencies: forgedObserved.observedDependencies,
        observedHistoryRows: forgedObserved.observedHistoryRows,
        inventory: forgedObserved.inventory,
        inventoryCaptured: true,
        captureComplete: true,
      })
      : forgedObserved;
    scenarios.push(record("F21_NAME_ONLY_OR_UNRELATED_LEFTOVER_HOLD", "scenario", {
      ok: forgedElig.ok === false && forgedElig.code === "F13_UNEXPECTED_OBJECT_OR_DEPENDENCY",
      capture: "unrelated-gbt-name-without-membership",
      code: forgedElig.code,
      verdict: "HOLD",
      executedTransaction: false,
      note: "name-only/unrelated leftover is unexpected; extension members are not a prefix allowlist",
    }));
    psql(db.url, "DROP FUNCTION IF EXISTS public.gbt_forged_nameonly() RESTRICT;");

    let induced00118 = "";
    try {
      const sql00118 = fs.readFileSync(path.join(ROOT, "supabase/migrations/00118_f3_bounded_financial_epoch_foundation.sql"), "utf8");
      psql(db.url, sql00118);
      induced00118 = "UNEXPECTED_APPLY";
    } catch (err) {
      induced00118 = String(err?.message || err);
    }
    const extAfter00118 = psql(db.url, "SELECT extname FROM pg_extension WHERE extname = 'btree_gist';");
    scenarios.push(record("F21_LOCAL_QUAL_FROM_00118_PREINSTALLED_INDUCED_HOLD", "scenario", {
      ok: /F3_ABORT/.test(induced00118) && String(extAfter00118).includes("btree_gist"),
      capture: "preinstalled-extension-then-00118",
      code: "F3_ABORT",
      verdict: "HOLD",
      executedTransaction: false,
      note: "DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT",
      inducedFailure: induced00118.slice(0, 400),
      catalogAfter: { extension: extAfter00118 },
    }));

    scenarios.push(await runSharedLocalQualificationSequence({
      created,
      psql,
      verificationMode: QUALIFICATION_VERIFICATION_MODES.FAULT_INJECTION,
      scenarioId: "F22_COMPLETE_LOCAL_QUALIFICATION",
      dbLabel: "f22_fault_inject",
    }));
    scenarios.push(await runSharedLocalQualificationSequence({
      created,
      psql,
      verificationMode: QUALIFICATION_VERIFICATION_MODES.NORMAL_APPLICATION,
      scenarioId: "F23_NORMAL_APPLICATION_LOCAL_QUALIFICATION",
      dbLabel: "f23_normal_app",
    }));

    scenarios.push(await runLockWaitDriftScenario({
      psql,
      db,
      id: "TX_T3_LOCKWAIT_UNAPPROVED_FK_ROLLBACK",
      relation: "public.financial_accounts",
      driftSql: [
        "ALTER TABLE public.financial_accounts ADD COLUMN group_id uuid;",
        `ALTER TABLE public.financial_accounts
          ADD CONSTRAINT unapproved_accounts_groups_fkey
          FOREIGN KEY (group_id) REFERENCES public.groups(id);`,
      ],
      retainQuery: "SELECT conname FROM pg_constraint WHERE conname = 'unapproved_accounts_groups_fkey';",
      retainNeedle: "unapproved_accounts_groups_fkey",
      note: "holder kept required lock; reset reached T1 and waited; drift committed; T3 rejected before mutation",
    }));
    scenarios.push(await runLockWaitDriftScenario({
      psql,
      db,
      id: "TX_T3_LOCKWAIT_RETARGETED_FK_ROLLBACK",
      relation: "public.memberships",
      driftSql: [
        "ALTER TABLE public.memberships DROP CONSTRAINT memberships_group_id_fkey;",
        `ALTER TABLE public.memberships
          ADD CONSTRAINT memberships_group_id_fkey
          FOREIGN KEY (group_id) REFERENCES public.profiles(id);`,
      ],
      retainQuery: `SELECT fn.nspname || '.' || frel.relname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = rel.relnamespace
        JOIN pg_class frel ON frel.oid = con.confrelid
        JOIN pg_namespace fn ON fn.oid = frel.relnamespace
        WHERE con.conname = 'memberships_group_id_fkey';`,
      retainNeedle: "public.profiles",
      note: "holder kept memberships lock; reset waited; approved identity retargeted; T3 rejected before mutation",
    }));
  } finally {
    try {
      db.close();
    } catch {
      // preserve other DBs even if this close fails
    }
  }
  return { available: true, scenarios, serverVersion };
}

export async function proveQualificationResetLocal(options = {}) {
  const helperArgs = { ...parseHelperArgs(), ...options };
  const checks = runOfflineChecks();
  const pgProbe = tryLocalPg();
  const pg = pgProbe.status === 0
    ? await runLocalPgScenarios({
      normalApplicationOnly: helperArgs.normalApplicationOnly === true,
    })
    : {
      available: false,
      reason: "psql binary not present",
      serverVersion: null,
      scenarios: [
        mustLocalRecord("UNEXPECTED_OBJECT_BLOCKS_BEFORE_PLAN"),
        mustLocalRecord("TX_SUCCESSFUL_RESET"),
        mustLocalRecord("TX_UNEXPECTED_OBJECT_ROLLBACK"),
        mustLocalRecord("TX_HISTORY_MISMATCH_ROLLBACK"),
        mustLocalRecord("TX_T3_UNAPPROVED_FK_ROLLBACK"),
        mustLocalRecord("TX_T3_RETARGETED_FK_ROLLBACK"),
        mustLocalRecord("TX_T3_APPROVED_SET_SUCCESS"),
        mustLocalRecord("F21_TX_PRESERVE_EXTENSION_AND_MEMBERS"),
        mustLocalRecord("F21_NAME_ONLY_OR_UNRELATED_LEFTOVER_HOLD"),
        mustLocalRecord("F21_LOCAL_QUAL_FROM_00118_PREINSTALLED_INDUCED_HOLD"),
        mustLocalRecord("F22_COMPLETE_LOCAL_QUALIFICATION"),
        mustLocalRecord("F23_NORMAL_APPLICATION_LOCAL_QUALIFICATION"),
        mustLocalRecord("TX_T3_LOCKWAIT_UNAPPROVED_FK_ROLLBACK"),
        mustLocalRecord("TX_T3_LOCKWAIT_RETARGETED_FK_ROLLBACK"),
      ],
    };

  const cases = [...checks, ...pg.scenarios];
  const mustLocal = pg.available !== true;
  const failCount = cases.filter((row) => row.ok !== true).length;
  const f22 = cases.find((row) => row.id === "F22_COMPLETE_LOCAL_QUALIFICATION") || {};
  const f23 = cases.find((row) => row.id === "F23_NORMAL_APPLICATION_LOCAL_QUALIFICATION") || {};
  const completeThrough00123 = f23.completeThrough00123 === true;
  const documentedAtomicRollbackHold = f22.documentedAtomicRollbackHold === true;
  const localApplicationComplete = f23.localApplicationComplete === true && completeThrough00123 === true;
  return {
    schema: "f18-qualification-reset-local-proof-v1",
    label: F19_RUNTIME_LABEL,
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
      serverVersion: pg.serverVersion || null,
    },
    distinctions: {
      checks: cases.filter((row) => row.kind === "check").length,
      scenarios: cases.filter((row) => row.kind === "scenario").length,
      executedTransactions: cases.filter((row) => row.executedTransaction === true).length,
    },
    completeThrough00123,
    migrationsAppliedThrough00123: f23.migrationsAppliedThrough00123 === true,
    documentedAtomicRollbackHold,
    localApplicationComplete,
    faultInjectionSafetyPass: documentedAtomicRollbackHold,
    applicationRemainingHold: localApplicationComplete ? null : (f23.remainingHold || null),
    faultInjectionHold: "F22_LOCAL_CLI_ATOMIC_ROLLBACK_REPAIR_REFUSED",
    remainingHold: localApplicationComplete ? null : (f23.remainingHold || f22.remainingHold || null),
    combinedAcceptanceRejected: true,
    fingerprintRetention: f23.fingerprintRetention || null,
    rawFingerprintEquality: f23.fingerprintReport?.rawEquality
      || f23.fingerprintRetention?.rawEquality
      || { ok: false, code: F23_FINGERPRINT_MISMATCH },
    localFingerprintAcceptance: f23.fingerprintReport?.localAcceptance
      || f23.fingerprintRetention?.localAcceptance
      || null,
    localComparisonProfile: LOCAL_FINGERPRINT_COMPARISON_PROFILE_V1,
    hostedOutstanding: f23.fingerprintReport?.hostedOutstanding
      || f23.fingerprintRetention?.hostedOutstanding
      || null,
    fingerprintReport: f23.fingerprintReport || null,
    retainedCaptureLocalReport: cases.find((row) => row.id === "F23_LOCAL_FINGERPRINT_PROFILE_V1_RETAINED_CAPTURE") || null,
    repairCoverage: {
      freshlyExercised: documentedAtomicRollbackHold
        ? "F22 fault-injection: induced history failure classified PRE_COMMIT_OR_ATOMIC_ROLLBACK; repair-safety gate refused repair; repairCalls=0"
        : "fault-injection path did not authenticate the documented atomic-rollback refuse",
      inheritedAcceptedEvidence: "F22 HOLD PACKAGE ACCEPT for F22_LOCAL_CLI_ATOMIC_ROLLBACK_REPAIR_REFUSED as historical authenticated negative test",
      unexercised: "post-commit filename-version repair after objects remain; hosted split where SQL commits and history INSERT fails",
      mandatoryUnderApprovedContract: false,
      localPostCommitFilenameVersionRepairMandatory: LOCAL_REPAIR_AMENDMENT.localPostCommitFilenameVersionRepairMandatory,
      hostedPostCommitFilenameVersionRepairMandatory: LOCAL_REPAIR_AMENDMENT.hostedPostCommitFilenameVersionRepairMandatory,
      failClosedWhenObjectsAbsentOrAtomicPreCommit: true,
      repairCallsRequiredOnAtomicOrAbsent: 0,
      promotedNotExercisedToPass: false,
      authorizeRepairExecution: false,
      reexecutedLocalRefusal: false,
      historicalRepairEvidence: LOCAL_REPAIR_AMENDMENT.historicalRepairEvidence,
      remainingHostedRequirement: "Before promotion beyond DAYBREAK HOLD, separately authorized hosted qualification must demonstrate current-candidate POST_COMMIT_HISTORY_FAILURE, surviving intended objects, absent exact filename history, pass repair-safety and raw fingerprint gates, perform CLI 2.117.0 filename-version repair, and authenticate resulting history/catalog state.",
    },
    cases,
    passCount: cases.filter((row) => row.ok === true).length,
    failCount,
    overallOk: failCount === 0,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const workerIdx = process.argv.indexOf("--shared-reset-worker");
  if (workerIdx >= 0) {
    const payloadPath = process.argv[workerIdx + 1];
    const payload = JSON.parse(fs.readFileSync(payloadPath, "utf8"));
    const writeBound = (filePath, observation) => {
      if (!filePath || !observation) return;
      fs.writeFileSync(filePath, `${JSON.stringify({
        ...observation,
        executionId: payload.executionId,
        workerPid: process.pid,
        writtenAt: new Date().toISOString(),
      })}\n`);
    };
    executeSharedReset({ url: payload.url }, payload.observed, {
      streamObservations: true,
      onStdoutLine(line) {
        const observation = parseBoundResetObservationLine(line);
        if (!observation) return;
        if (observation.phase === "T1_BEGIN" && observation.event === "began" && Number.isInteger(observation.backendPid)) {
          writeBound(payload.identityPath, observation);
        }
        if (observation.phase === "T2_LOCK" && observation.event === "locked" && Number.isInteger(observation.backendPid)) {
          writeBound(payload.acquiredPath, observation);
        }
      },
    }).then((result) => {
      const rawProcess = result.processResult || result.transportInterpretation?.processResult || {};
      fs.writeFileSync(payload.resultPath, `${JSON.stringify({
        ok: result.ok,
        committed: result.committed,
        rolledBack: result.rolledBack ?? null,
        verdict: result.verdict,
        code: result.code,
        spies: result.spies,
        plan: {
          sqlSha256: result.plan?.sqlSha256 || result.plan?.sha256 || null,
        },
        transportInterpretation: {
          phaseReached: result.transportInterpretation?.phaseReached ?? null,
          observed: result.transportInterpretation?.observed ?? null,
        },
        processResult: rawProcess,
      })}\n`);
      process.exit(0);
    }).catch((err) => {
      fs.writeFileSync(payload.resultPath, `${JSON.stringify({
        ok: false,
        committed: false,
        rolledBack: null,
        code: err?.code || "F18_SHARED_RESET_WORKER_FAILED",
        reason: String(err?.message || err),
      })}\n`);
      process.exit(1);
    });
  } else {
    proveQualificationResetLocal().then((result) => {
      const helperArgs = parseHelperArgs();
      if (helperArgs.fingerprintDiffOut) {
        const payload = secretsRemoved(JSON.stringify({
          schema: "f23-fingerprint-field-diff-v1",
          capturedAt: new Date().toISOString(),
          helper: HELPER_RELPATH,
          remainingHold: result.applicationRemainingHold || result.remainingHold || null,
          retention: result.fingerprintRetention || null,
        }, null, 2));
        fs.writeFileSync(helperArgs.fingerprintDiffOut, `${payload}\n`);
      }
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.overallOk ? 0 : 1);
    }).catch((err) => {
      console.error(err);
      process.exit(1);
    });
  }
}
