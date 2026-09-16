/**
 * Founder-authorized disposable qualifier for supabase db push (CLI 2.117.0).
 *
 * Hosted default floor: stub+live-pin (replaces greenfield).
 * Label: DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117
 * REPLAY AND NOT PRODUCTION-EQUIVALENT.
 *
 * QUALIFICATION CANDIDATE ONLY. Not production approval.
 * Management API POST /database/migrations {query,name} is permanently
 * disqualified and is never called here.
 *
 * NEVER targets production. NEVER prints the DB password or constructed URL.
 * Requires exact disposable ref/name/org/host identity + sentinel +
 * destructive opt-in + password. --db-url is the session-mode pooler
 * form (direct IPv6 host is unreachable; see DIRECT_DB_HOST_IPV6_LIMITATION).
 *
 * If env is absent: exit 2 NOT_RUN with a Chief runbook (no child process
 * that can reach a database).
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  APPROVED_DISPOSABLE_HOST,
  APPROVED_DISPOSABLE_ORG_ID,
  APPROVED_DISPOSABLE_POOLER_HOST,
  APPROVED_DISPOSABLE_POOLER_PORT,
  APPROVED_DISPOSABLE_POOLER_USER,
  APPROVED_DISPOSABLE_PROJECT_NAME,
  APPROVED_DISPOSABLE_PROJECT_REF,
  DIRECT_DB_HOST_IPV6_LIMITATION,
  CLI_PIN,
  DBPUSH_SENTINEL,
  DBPUSH_SENTINEL_ENV,
  DB_PASSWORD_ENV,
  DB_PUSH_CANDIDATE_STATUS,
  DESTRUCTIVE_ENV,
  F3_FORWARD_FILES,
  FILE_BASED_RUNNER_VERDICTS,
  FROZEN_DIGESTS,
  LIVE_PROBE_THROWAWAY_TABLE,
  MANAGEMENT_API_APPLY_DISQUALIFICATION,
  MANAGEMENT_API_APPLY_PERMANENTLY_DISQUALIFIED,
  MGMT_TOKEN_ENV,
  PREASSIGNED_VERSIONS,
  PRODUCTION_REF,
  RECOGNITION_ALLOWLIST,
  TARGET_OBJECT_PROBES,
} from "./lib/f3-db-push-pins.mjs";
import {
  assertDbPushGates,
  dbPushGatesSatisfiedFromEnv,
  sanitizeForLog,
} from "./lib/f3-db-push-target-guard.mjs";
import {
  getDisposableProjectIdentity,
  listDisposableMigrationsViaGet,
  refuseManagementApiApply,
} from "./lib/f3-db-push-identity.mjs";
import {
  assertDbPushHelpUsable,
  assertRepairHelpUsable,
  discoverSupabaseCli,
  readDbPushHelp,
  readDbQueryHelp,
  readMigrationListHelp,
  readMigrationRepairHelp,
  runDbPushCandidate,
  runDbQuery,
  runFilenameVersionRepair,
  runMigrationList,
} from "./lib/f3-db-push-cli.mjs";
import {
  assertVersionCollisionPass,
  assertFrozenDigestsOnDisk,
  createIsolatedDbPushWorkdir,
  preassignedVersionFor,
  timestampFilenameFor,
} from "./lib/f3-db-push-version-map.mjs";
import {
  DROP_THROWAWAY_PROBE_SQL,
  INVENTORY_SQL,
  READ_SCHEMA_MIGRATIONS_COLUMNS_SQL,
  READ_SCHEMA_MIGRATIONS_SQL,
  REMOVE_HISTORY_INJECT_SQL,
  classifyDbPushHistoryFailure,
  historyInjectSqlForFile,
} from "./lib/f3-db-push-history-inject.mjs";
import {
  hostedFloorPrecheck,
  installHostedFloor,
  recognitionFromSource,
} from "./lib/f3-db-push-floor.mjs";
import {
  GREENFIELD_DISALLOWED_FOR_THIS_AUTH,
  HOSTED_DEFAULT_FLOOR_MODE,
  PRE_DB_PUSH_VERIFICATION_SQL,
  QUALIFICATION_FLOOR_LABEL,
  STUB_LIVE_PIN_FLOOR_AUTHORITY,
  STUB_LIVE_PIN_FLOOR_HOLD,
  evaluatePreDbPushGates,
  resolveHostedFloorMode,
} from "./lib/f3-db-push-stub-live-pin-floor.mjs";
import { runGatedRemoteSqlText } from "./lib/f3-db-push-remote-sql-file.mjs";
import { INVENTORY_CAPTURE_SQL } from "./lib/f3-db-push-inventory.mjs";
import {
  hashOriginalStdout,
  inventoryFromQuery,
  parseEvidenceOutArg,
  parseExactOriginalJsonObject,
  parseJsonish,
  preserveOriginalProcessStdout,
  rowsFromQuery,
} from "./lib/f3-db-push-query-parse.mjs";
import {
  PRE_STUB_FLOOR_CLEAN_CHECK_HOLD,
  assertPreStubFloorCleanCheck,
  evaluatePreStubFloorCleanCheck,
} from "./lib/f3-db-push-pre-stub-floor-clean-check.mjs";
import {
  CATALOG_FINGERPRINT_SQL, // structured JSON records; routine ACL identity is schema/object_name/prokind/identity_arguments — never a comma-joined object_identity label. Overrides floor comma-joined query.
  FULL_FINGERPRINT_PHASES,
  POISON_ABSENT_PROBE_SQL,
  POST_CONTINUATION_FULL_FINGERPRINT_HOLD,
  POST_POISON_FULL_FINGERPRINT_HOLD,
  POST_REPAIR_FULL_FINGERPRINT_HOLD,
  POST_RETRY_FULL_FINGERPRINT_HOLD,
  PRODUCTION_HISTORY_LIMITATION_WARNING,
  REPAIR_SAFETY_HOLD,
  assertExpectedFingerprintImmutable,
  assertPrefixCompleteSinglePendingStaging,
  captureFrozenExpectedFingerprint,
  collectCanonicalFullFingerprint,
  evaluatePostContinuationFullFingerprint,
  evaluatePostPoisonFullFingerprint,
  evaluatePostRepairFullFingerprint,
  evaluatePostRetryFullFingerprint,
  expectedFingerprintSha256,
  finalizeFingerprintCapture,
  getFrozenExpectedFingerprint,
  objectProbeSql, // catalog-boundary structured probe identity; to_regprocedure resolves OID only; compare pg_proc identity to frozen descriptor — never to_regprocedure::text vs lookup spelling. Overrides history-inject text compare.
  objectsPresentFromProbe as objectsPresentFromProbeStrict,
  recordFrozenExpectedFingerprintCaptures,
  recordPreDbExpectedHashes,
  runRepairSafetyThenMaybeRepair,
  sealExpectedFingerprintsFromLocalOracle,
  syncIsolatedMigrationsThrough,
  writeQualifyEvidenceArtifacts,
  F3_FULL_FINGERPRINT_SCHEMA_VERSION,
  EXPECTED_FINGERPRINT_SEAL_PROVENANCE,
  F3_FUNCTIONAL_RECURSIVE_CLOSURE,
  SEALED_PLATFORM_ACL_ENVELOPE_DIGEST,
  evaluatePlatformAclCalibration,
  authorizeDbPushAfterPlatformAclCalibration,
  PLATFORM_ACL_CALIBRATION_HOLD,
  assertEvidenceOutFileContract,
  commitQualifyEvidenceOrHold,
  EVIDENCE_OUT_FILE_CONTRACT,
  EVIDENCE_WRITE_HOLD,
  INVENTORY_PHASES,
  labelInventoryCapture,
  assertFinalInventoryChronology,
  assertRecursiveClosureReadyForDb,
  evaluateFinalPoisonAbsence,
  FINAL_POISON_ABSENCE_HOLD,
  RECURSIVE_CLOSURE_HOLD,
  MUST_REVERIFY_ON_17_6,
  CATALOG_V3_00123_SUPERSESSION,
  GIT_VERIFICATION_UNAVAILABLE,
  constructImmutableValidatedTargetFromConnection,
  IMMUTABLE_TARGET_HOLD,
  runIsolatedPoisonPsqlQuery,
  PSQL_POISON_QUERY_ARGV,
  MUST_LOCAL_PSQL_PROOF_ON_17_6,
  exactPoisonEnvelopeFromOriginal,
  evaluateOriginalPoisonProcessResult,
  fingerprintCanonicalSha256,
  createRepairAuthorizationRecord,
  assertRepairAuthorizationPreRepairComplete,
  assertRepairAuthorizationComplete,
  writeRepairAuthorizationRecord,
  encodeIsolatedPsqlProcessBytes,
  encodeTargetBindingFieldComparisons,
  REPAIR_AUTHORIZATION_HOLD,
  evaluateRepairSafetyGate,
  commitOuterEvidenceTree,
  inferEvidenceRootFromDest,
  writeDurableArtifactBytes,
} from "./lib/f3-db-push-repair-safety-gate.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

function chiefRunbook() {
  return {
    status: "NOT_RUN",
    verdict: FILE_BASED_RUNNER_VERDICTS.BLOCKED,
    reason: DB_PUSH_CANDIDATE_STATUS,
    hosted: "BLOCKED — VILLAGECLAQ_F3_DISPOSABLE_DB_PASSWORD absent in this environment",
    do_not_invent_hosted_pass: true,
    project: {
      name: APPROVED_DISPOSABLE_PROJECT_NAME,
      ref: APPROVED_DISPOSABLE_PROJECT_REF,
      org: APPROVED_DISPOSABLE_ORG_ID,
      host: APPROVED_DISPOSABLE_HOST,
      poolerHost: APPROVED_DISPOSABLE_POOLER_HOST,
      poolerPort: APPROVED_DISPOSABLE_POOLER_PORT,
      poolerUser: APPROVED_DISPOSABLE_POOLER_USER,
      directHostLimitation: DIRECT_DB_HOST_IPV6_LIMITATION,
    },
    cli: CLI_PIN,
    env: {
      [DB_PASSWORD_ENV]: "required (never print)",
      [DBPUSH_SENTINEL_ENV]: DBPUSH_SENTINEL,
      [DESTRUCTIVE_ENV]: "1",
      [MGMT_TOKEN_ENV]: "optional; identity GET / migrations GET only",
    },
    commands: [
      `export ${DBPUSH_SENTINEL_ENV}=${DBPUSH_SENTINEL}`,
      `export ${DESTRUCTIVE_ENV}=1`,
      `export ${DB_PASSWORD_ENV}='<password from founder vault; do not commit>'`,
      `# optional: export ${MGMT_TOKEN_ENV}='<mgmt token; GET/query only>'`,
      "STOP: Chief clean-check PASS on jkorwnwwmdeflfntxntl (06-pre-stub-floor-clean-check). Do not re-wipe.",
      "Hosted default floor is stub+live-pin (DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT).",
      "node scripts/qualify-f3-db-push-disposable.mjs --no-wipe --prep-floor --sequence-f3",
      "# equivalent (hosted default): --floor-mode=stub-live-pin",
    ],
    candidateCommand:
      "supabase db push --db-url <in-process session-mode pooler URL> --workdir <isolated> --yes --skip-vault",
    repairCommand:
      "supabase migration repair <FILENAME_VERSION> --status applied --db-url <in-process URL> --workdir <isolated> --yes",
    managementApiApply: MANAGEMENT_API_APPLY_DISQUALIFICATION,
    versionsKnownBeforeExecution: PREASSIGNED_VERSIONS,
    recognition: [...RECOGNITION_ALLOWLIST],
    stagingInvariant: "PREFIX-COMPLETE, SINGLE-PENDING",
    productionHistoryLimitation: PRODUCTION_HISTORY_LIMITATION_WARNING,
    floor: STUB_LIVE_PIN_FLOOR_AUTHORITY,
    floorLabel: QUALIFICATION_FLOOR_LABEL,
    floorMode: HOSTED_DEFAULT_FLOOR_MODE,
    holdIfFloorInexact: STUB_LIVE_PIN_FLOOR_HOLD,
    bans: [
      `Do not target ${PRODUCTION_REF}`,
      "Do not delete or pause the disposable project",
      "Do not rename or rewrite 00118–00123 SQL bytes",
      "Do not use -p / --password on argv",
      "Do not echo the db-url",
      "db-url is session-mode pooler aws-0-us-east-1.pooler.supabase.com:5432 user postgres.{ref}; direct db.{ref}.supabase.co:5432 is IPv6-unreachable",
      "Do not POST /database/migrations",
      "Do not claim production approval",
      "Do not auto-repair; founder auth required for any production apply/repair",
      "Do not install public.unnest(uuid) shim on hosted floor",
      "Do not replay 00001–00116 or use 00030/00057 transforms",
      "Do not --wipe-to-baseline; disposable stays CLEAN; --no-wipe is required",
      "Do not invent schema_migrations rows for 00117",
      "Isolated db-push workdir uses PREFIX-COMPLETE, SINGLE-PENDING staging for F3 qualification history only",
      PRODUCTION_HISTORY_LIMITATION_WARNING,
      "Greenfield floor mode is disallowed for this auth",
      `Success label only: ${FILE_BASED_RUNNER_VERDICTS.MECHANICS_PASS}`,
    ],
  };
}

function parseFloorMode(argv) {
  const eq = argv.find((a) => a.startsWith("--floor-mode="));
  if (eq) return eq.slice("--floor-mode=".length);
  const idx = argv.indexOf("--floor-mode");
  if (idx >= 0) return argv[idx + 1];
  if (argv.includes("--greenfield")) return "greenfield";
  return HOSTED_DEFAULT_FLOOR_MODE;
}

function parseArgs(argv) {
  return {
    prepFloor: argv.includes("--prep-floor"),
    sequenceF3: argv.includes("--sequence-f3"),
    wipeToBaseline: argv.includes("--wipe-to-baseline"),
    noWipe: argv.includes("--no-wipe") || !argv.includes("--wipe-to-baseline"),
    skipCleanup: argv.includes("--skip-cleanup"),
    floorMode: parseFloorMode(argv),
    evidenceOut: parseEvidenceOutArg(argv),
    sealFromLocalOracle: argv.includes("--seal-expected-from-local-oracle"),
  };
}

function collectPhaseFingerprint(file, queryResult, phase) {
  const catalog =
    queryResult && queryResult.status === 0
      ? inventoryFromQuery(queryResult.stdout)
      : null;
  return collectCanonicalFullFingerprint({
    file,
    catalogInventory: catalog,
    phase,
    queryStatus: queryResult?.status ?? null,
  });
}

function objectsPresentFromProbe(result) {
  // CLI 2.117.0 --output-format json may be either:
  //   [{ p0: ..., p1: ... }]  (workdir db query path)
  //   { advisory, rows: [...], warning } (some envelopes)
  // Strict structured parse only. No substring / marker success fallback.
  // pN values must be catalog-boundary objects, never to_reg*::text strings.
  if (objectsPresentFromProbeStrict(result) !== true) return false;
  const stdout = String(result?.stdout || "");
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return false;
  }
  const row = Array.isArray(parsed)
    ? parsed[0]
    : Array.isArray(parsed?.rows)
      ? parsed.rows[0]
      : null;
  if (!row || typeof row !== "object") return false;
  const vals = Object.values(row);
  if (vals.length === 0) return false;
  const present = (v) => v !== null && v !== undefined && v !== false && v !== "f" && v !== "";
  if (!vals.every(present)) return false;
  // Catalog-boundary: pN must be structured objects, never to_reg*::text.
  for (const value of vals) {
    if (typeof value !== "object" || Array.isArray(value)) return false;
    if (Object.prototype.hasOwnProperty.call(value, "oid")) return false;
  }
  return true;
}

export const F9_RUNNER_EVENT_SCHEMA_VERSION = "f3-runner-event-v1";
export const F9_PRE_CONTINUATION_SCHEMA_VERSION = "f3-pre-continuation-record-v1";
export const F9_RUNNER_EVENT_HOLD =
  "HOLD: F9 runner event/durable-pre-continuation record incomplete; no repair again; no continuation; no next migration";
export const F10_CHECKPOINT_A_SCHEMA_VERSION = "f3-f10-checkpoint-a-v1";
export const F10_CHECKPOINT_B_SCHEMA_VERSION = "f3-f10-checkpoint-b-v1";
export const F10_CHECKPOINT_HOLD =
  "HOLD: F10 complete durable checkpoint missing or unverified; no repair again; no retry; no continuation; no next migration";

/**
 * gateCalls measures only the qualify-level repair_gate_evaluated boundary:
 * one increment immediately around the runner's evaluateRepairSafetyGate call
 * per migration file. It does NOT count internal evaluateRepairSafetyGate
 * invocations inside runRepairSafetyThenMaybeRepair.
 */
export const GATE_CALLS_BOUNDARY =
  "qualify-level repair_gate_evaluated (not every evaluateRepairSafetyGate)";

export const F9_REQUIRED_EVENT_TYPES = Object.freeze([
  "initial_db_push_started",
  "initial_db_push_completed",
  "post_commit_history_failure_classified",
  "fingerprint_collected",
  "cleanup_started",
  "cleanup_completed",
  "poison_probe_started",
  "poison_probe_completed",
  "target_binding_verified",
  "repair_gate_evaluated",
  "repair_started",
  "repair_completed",
  "pre_continuation_record_persisted",
  "retry_started",
  "retry_completed",
  "post_retry_fingerprint_collected",
  "continuation_authorized",
  "continuation_started",
  "continuation_completed",
]);

/** Actual execution order recorded at call boundaries — not synthesized afterward. */
export const F9_ACTUAL_EVENT_ORDER_BEFORE_REPAIR = Object.freeze([
  "initial_db_push_started",
  "initial_db_push_completed",
  "post_commit_history_failure_classified",
  "fingerprint_collected",
  "repair_gate_evaluated",
  "cleanup_started",
  "cleanup_completed",
  "poison_probe_started",
  "poison_probe_completed",
  "target_binding_verified",
]);

export const F9_ACTUAL_EVENT_ORDER_BEFORE_RETRY = Object.freeze([
  ...F9_ACTUAL_EVENT_ORDER_BEFORE_REPAIR,
  "repair_started",
  "repair_completed",
]);

export const F9_ACTUAL_EVENT_ORDER_BEFORE_AUTHORIZE = Object.freeze([
  ...F9_ACTUAL_EVENT_ORDER_BEFORE_RETRY,
  "retry_started",
  "retry_completed",
  "post_retry_fingerprint_collected",
  "pre_continuation_record_persisted",
]);

export const F9_ACTUAL_EVENT_ORDER_BEFORE_CONTINUATION = Object.freeze([
  ...F9_ACTUAL_EVENT_ORDER_BEFORE_AUTHORIZE,
  "continuation_authorized",
]);

export const F9_ACTUAL_EVENT_ORDER_WITH_CONTINUATION = Object.freeze([
  ...F9_ACTUAL_EVENT_ORDER_BEFORE_CONTINUATION,
  "continuation_started",
  "continuation_completed",
]);

export const F9_FINAL_MIGRATION_EVENT_ORDER = Object.freeze([
  ...F9_ACTUAL_EVENT_ORDER_BEFORE_CONTINUATION,
]);

export function createEmptyRunnerCounters() {
  return {
    initialDbPushCalls: 0,
    gateCalls: 0,
    cleanupCalls: 0,
    poisonProbeCalls: 0,
    repairCalls: 0,
    retryDbPushCalls: 0,
    continuationAuthorizationCalls: 0,
    continuationCalls: 0,
    durableRecordWrites: 0,
  };
}

export function expectedRunnerCountersForFile(file) {
  const isLast = file === F3_FORWARD_FILES[F3_FORWARD_FILES.length - 1];
  return {
    initialDbPushCalls: 1,
    gateCalls: 1,
    cleanupCalls: 1,
    poisonProbeCalls: 1,
    repairCalls: 1,
    retryDbPushCalls: 1,
    continuationAuthorizationCalls: 1,
    continuationCalls: isLast ? 0 : 1,
    durableRecordWrites: 1,
  };
}

function sha256Utf8Qualify(text) {
  return createHash("sha256").update(String(text ?? ""), "utf8").digest("hex");
}

export function encodeSanitizedProcessResult(result = {}) {
  const commandIdentity = result.commandIdentity
    ?? result.command_identity
    ?? result.command
    ?? result.rendered
    ?? (Array.isArray(result.argv) ? result.argv.join(" ") : null);
  const argv = Array.isArray(result.argv)
    ? result.argv.map((item) => String(sanitizeForLog(String(item ?? "")) ?? ""))
    : null;
  const stdoutBody = String(sanitizeForLog(String(result.stdout ?? result.originalStdout ?? "")) ?? "");
  const stderrBody = String(sanitizeForLog(String(result.stderr ?? "")) ?? "");
  const errorRaw = result.error ?? result.err ?? result.message ?? null;
  const errorBody = errorRaw == null ? null : String(sanitizeForLog(String(errorRaw)) ?? "");
  const hashedOut = hashOriginalStdout(stdoutBody);
  const hashedErr = hashOriginalStdout(stderrBody);
  const hashedError = hashOriginalStdout(errorBody ?? "");
  return {
    commandIdentity: commandIdentity == null ? null : String(sanitizeForLog(String(commandIdentity)) ?? ""),
    argv,
    status: result.status ?? null,
    signal: result.signal ?? null,
    timeout: result.timeout === true,
    stdout: stdoutBody,
    stderr: stderrBody,
    error: errorBody,
    stdoutByteLength: hashedOut.byteLength,
    stderrByteLength: hashedErr.byteLength,
    errorByteLength: errorBody == null ? 0 : hashedError.byteLength,
    stdoutSha256: hashedOut.sha256,
    stderrSha256: hashedErr.sha256,
    errorSha256: errorBody == null ? hashedError.sha256 : hashedError.sha256,
  };
}

export function isCompleteProcessResult(result) {
  if (result == null || typeof result !== "object" || Array.isArray(result)) return false;
  if (result.summaryOnly === true || result.abbreviated === true || result.reconstructed === true) {
    return false;
  }
  const command = result.commandIdentity ?? result.command_identity ?? result.command ?? result.rendered;
  if (command == null || String(command).trim() === "") return false;
  if (result.status == null || typeof result.status !== "number") return false;
  if (!Object.prototype.hasOwnProperty.call(result, "stdout") || typeof result.stdout !== "string") return false;
  if (!Object.prototype.hasOwnProperty.call(result, "stderr") || typeof result.stderr !== "string") return false;
  if (!Object.prototype.hasOwnProperty.call(result, "error")) return false;
  const outSha = result.stdoutSha256 ?? result.stdout_sha256;
  const errSha = result.stderrSha256 ?? result.stderr_sha256;
  const outLen = result.stdoutByteLength ?? result.stdout_byte_length;
  const errLen = result.stderrByteLength ?? result.stderr_byte_length;
  if (typeof outSha !== "string" || !/^[0-9a-f]{64}$/i.test(outSha)) return false;
  if (typeof errSha !== "string" || !/^[0-9a-f]{64}$/i.test(errSha)) return false;
  if (typeof outLen !== "number" || typeof errLen !== "number") return false;
  const outHashed = hashOriginalStdout(result.stdout);
  const errHashed = hashOriginalStdout(result.stderr);
  if (outHashed.sha256 !== outSha || outHashed.byteLength !== outLen) return false;
  if (errHashed.sha256 !== errSha || errHashed.byteLength !== errLen) return false;
  if (!Object.prototype.hasOwnProperty.call(result, "signal") && result.signal !== null) {
    if (result.signal === undefined) return false;
  }
  if (result.timeout === undefined) return false;
  return true;
}

function eventTypesOf(events) {
  return (Array.isArray(events) ? events : []).map((event) => event?.event_type || event?.eventType || event);
}

function isExactEventOrder(events, required) {
  const types = eventTypesOf(events);
  if (types.length !== required.length) return false;
  return required.every((name, i) => types[i] === name);
}

function isEventSubsequence(events, required) {
  const types = eventTypesOf(events);
  let i = 0;
  for (const name of types) {
    if (name === required[i]) i += 1;
    if (i === required.length) return true;
  }
  return i === required.length;
}

function eventsHaveReorderOrDuplicate(events, required) {
  const types = eventTypesOf(events).filter((name) => required.includes(name));
  const seen = new Set();
  let lastIdx = -1;
  for (const name of types) {
    if (seen.has(name)) return true;
    const idx = required.indexOf(name);
    if (idx < lastIdx) return true;
    seen.add(name);
    lastIdx = idx;
  }
  return false;
}

export function createRunnerEventRecorder({
  migrationSourceLabel = "F3_FORWARD",
  migrationVersion = null,
  migrationName = null,
  targetBindingId = null,
} = {}) {
  const events = [];
  let sequence = 0;
  return {
    schema_version: F9_RUNNER_EVENT_SCHEMA_VERSION,
    events,
    record(eventType, extra = {}) {
      sequence += 1;
      const process = extra.process
        || (extra.processResult ? encodeSanitizedProcessResult(extra.processResult) : null);
      const event = {
        schema_version: F9_RUNNER_EVENT_SCHEMA_VERSION,
        migration_source_label: migrationSourceLabel,
        timestamp_migration_version: migrationVersion,
        timestamp_migration_name: migrationName,
        sequence,
        utc_timestamp: extra.utc_timestamp || new Date().toISOString(),
        phase: extra.phase || eventType,
        event_type: eventType,
        command_identity: extra.command_identity ?? extra.commandIdentity ?? process?.commandIdentity ?? null,
        process,
        target_binding_id: extra.target_binding_id ?? extra.targetBindingId ?? targetBindingId,
        runner_counters: { ...(extra.runner_counters || extra.counters || {}) },
      };
      events.push(event);
      return event;
    },
    snapshot() {
      return events.map((event) => ({ ...event, runner_counters: { ...event.runner_counters } }));
    },
  };
}

export function assertRunnerEventsAllowRepair(events) {
  if (!isEventSubsequence(events, F9_ACTUAL_EVENT_ORDER_BEFORE_REPAIR)
    || eventsHaveReorderOrDuplicate(events, F9_ACTUAL_EVENT_ORDER_BEFORE_REPAIR)) {
    return {
      ok: false,
      allowRepair: false,
      allowRetry: false,
      allowContinuation: false,
      hold: F9_RUNNER_EVENT_HOLD,
      reason: `${F9_RUNNER_EVENT_HOLD}: missing or reordered events before repair`,
    };
  }
  return { ok: true, allowRepair: true };
}

export function assertRunnerEventsAllowRetry(events) {
  const pre = assertRunnerEventsAllowRepair(events);
  if (!pre.ok) return { ...pre, allowRetry: false };
  if (!isEventSubsequence(events, F9_ACTUAL_EVENT_ORDER_BEFORE_RETRY)
    || eventsHaveReorderOrDuplicate(events, F9_ACTUAL_EVENT_ORDER_BEFORE_RETRY)) {
    return {
      ok: false,
      allowRepair: true,
      allowRetry: false,
      allowContinuation: false,
      hold: F9_RUNNER_EVENT_HOLD,
      reason: `${F9_RUNNER_EVENT_HOLD}: missing or reordered events before retry`,
    };
  }
  return { ok: true, allowRepair: true, allowRetry: true };
}

export function assertRunnerEventsAllowAuthorize(events) {
  const required = F9_ACTUAL_EVENT_ORDER_BEFORE_AUTHORIZE;
  if (!isEventSubsequence(events, required) || eventsHaveReorderOrDuplicate(events, required)) {
    return {
      ok: false,
      allowContinuation: false,
      continuationAuthorized: false,
      hold: F9_RUNNER_EVENT_HOLD,
      reason: `${F9_RUNNER_EVENT_HOLD}: missing or reordered events before continuation authorization`,
    };
  }
  return { ok: true };
}

export function assertRunnerEventsAllowContinuation(events, { finalMigration = false } = {}) {
  const pre = assertRunnerEventsAllowAuthorize(events);
  if (!pre.ok) return pre;
  const required = F9_ACTUAL_EVENT_ORDER_BEFORE_CONTINUATION;
  const types = eventTypesOf(events);
  if (finalMigration) {
    if (types.includes("continuation_started") || types.includes("continuation_completed")) {
      return {
        ok: false,
        allowContinuation: false,
        hold: F9_RUNNER_EVENT_HOLD,
        reason: `${F9_RUNNER_EVENT_HOLD}: 00123 final semantics must not invent a later migration continuation`,
      };
    }
    if (!types.includes("continuation_authorized")) {
      return {
        ok: false,
        allowContinuation: false,
        hold: F9_RUNNER_EVENT_HOLD,
        reason: `${F9_RUNNER_EVENT_HOLD}: continuation_authorized missing for final migration`,
      };
    }
    return { ok: true, allowContinuation: false, finalMigration: true, inventedLaterContinuation: false };
  }
  if (!isEventSubsequence(events, required) || eventsHaveReorderOrDuplicate(events, required)) {
    return {
      ok: false,
      allowContinuation: false,
      hold: F9_RUNNER_EVENT_HOLD,
      reason: `${F9_RUNNER_EVENT_HOLD}: missing or reordered events before continuation`,
    };
  }
  return { ok: true, allowContinuation: true, finalMigration: false };
}

export function assertPreContinuationRecordComplete(record) {
  const fail = (reason) => ({
    ok: false,
    hold: F9_RUNNER_EVENT_HOLD,
    allowContinuation: false,
    reason: `${F9_RUNNER_EVENT_HOLD}: ${reason}`,
  });
  if (record == null || typeof record !== "object" || Array.isArray(record)) {
    return fail("record missing");
  }
  if (record.schema_version !== F9_PRE_CONTINUATION_SCHEMA_VERSION) {
    return fail("schema_version");
  }
  if (!isCompleteProcessResult(record.repairProcessResult)) {
    return fail("missing/abbreviated repair process result");
  }
  if (!isCompleteProcessResult(record.retryProcessResult)) {
    return fail("missing/abbreviated retry process result");
  }
  if (record.repairProcessResult?.status !== 0) {
    return fail("failed repair blocks retry+continuation");
  }
  if (record.retryProcessResult?.status !== 0) {
    return fail("failed retry blocks continuation");
  }
  const poison = record.poisonProcessResult || record.originalPoison;
  if (poison == null || typeof poison !== "object") {
    return fail("original poison stdout/stderr metadata+binding missing");
  }
  if (!record.targetBinding || typeof record.targetBinding !== "object") {
    return fail("poison target-binding missing");
  }
  if (!record.runnerCounters || typeof record.runnerCounters !== "object") {
    return fail("runner-level counters missing");
  }
  const gateCounters = record.gateCounters || record.repairGateCounters || null;
  if (gateCounters && record.runnerCounters === gateCounters) {
    return fail("runner-level and gate-level counters cannot be substituted");
  }
  if (Array.isArray(record.callbackOrder) && !Array.isArray(record.eventStream)) {
    return fail("callbackOrder is not an actual event trace");
  }
  if (!Array.isArray(record.eventStream) || record.eventStream.length === 0) {
    return fail("actual event stream missing");
  }
  const auth = record.repairAuthorization
    ? assertRepairAuthorizationComplete(record.repairAuthorization)
    : { ok: true };
  if (auth.ok === false) {
    return fail(auth.reason || "repair-authorization incomplete");
  }
  return { ok: true, record };
}

export function persistPreContinuationRecord({
  dest,
  record,
  hooks = {},
} = {}) {
  const complete = assertPreContinuationRecordComplete(record);
  if (!complete.ok) {
    return { ...complete, written: false, continuationAuthorized: false };
  }
  if (!dest) {
    return {
      ok: false,
      hold: F9_RUNNER_EVENT_HOLD,
      reason: `${F9_RUNNER_EVENT_HOLD}: durable dest missing`,
      written: false,
      continuationAuthorized: false,
    };
  }
  const abs = path.resolve(dest);
  if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
    return {
      ok: false,
      hold: F9_RUNNER_EVENT_HOLD,
      reason: `${F9_RUNNER_EVENT_HOLD}: durable dest must be a file path`,
      written: false,
      continuationAuthorized: false,
    };
  }
  const sanitized = sanitizeForLog(record);
  const body = Buffer.from(`${JSON.stringify(sanitized, null, 2)}\n`, "utf8");
  const tmp = `${abs}.tmp`;
  try {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    if (hooks.failWrite === true) {
      throw new Error("injected durable write failure");
    }
    const fd = fs.openSync(tmp, "w");
    fs.writeSync(fd, body);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    if (hooks.failFlush === true) {
      throw new Error("injected durable flush failure");
    }
    fs.renameSync(tmp, abs);
    if (hooks.skipReread === true) {
      return {
        ok: false,
        hold: F9_RUNNER_EVENT_HOLD,
        reason: `${F9_RUNNER_EVENT_HOLD}: successful write without reread verification`,
        written: true,
        verified: false,
        continuationAuthorized: false,
      };
    }
    const reread = hooks.rereadBytes ? hooks.rereadBytes(abs) : fs.readFileSync(abs);
    if (!Buffer.isBuffer(reread) || reread.byteLength === 0) {
      return {
        ok: false,
        hold: F9_RUNNER_EVENT_HOLD,
        reason: `${F9_RUNNER_EVENT_HOLD}: durable reread failed`,
        written: true,
        verified: false,
        continuationAuthorized: false,
      };
    }
    const sha256 = createHash("sha256").update(reread).digest("hex");
    const bytes = reread.byteLength;
    const expectedSha = createHash("sha256").update(body).digest("hex");
    if (hooks.mismatchHash === true || sha256 !== expectedSha || bytes !== body.byteLength) {
      return {
        ok: false,
        hold: F9_RUNNER_EVENT_HOLD,
        reason: `${F9_RUNNER_EVENT_HOLD}: hash/length mismatch after reread`,
        written: true,
        verified: false,
        continuationAuthorized: false,
        expected: { sha256: expectedSha, bytes: body.byteLength },
        actual: { sha256, bytes },
      };
    }
    return {
      ok: true,
      written: true,
      verified: true,
      dest: abs,
      sha256,
      bytes,
      record: sanitized,
      continuationAuthorized: false,
    };
  } catch (err) {
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { /* leftover tmp is not a continue */ }
    return {
      ok: false,
      hold: F9_RUNNER_EVENT_HOLD,
      reason: `${F9_RUNNER_EVENT_HOLD}: ${err?.message || err}`,
      written: false,
      continuationAuthorized: false,
    };
  }
}

export function evaluateF9ContinuationAuthorization({
  events,
  record,
  persistResult,
  file,
} = {}) {
  const isLast = file === F3_FORWARD_FILES[F3_FORWARD_FILES.length - 1];
  const complete = assertPreContinuationRecordComplete(record);
  if (!complete.ok) return { ...complete, continuationAuthorized: false };
  if (!persistResult?.ok || persistResult.verified !== true) {
    return {
      ok: false,
      hold: F9_RUNNER_EVENT_HOLD,
      reason: persistResult?.reason || `${F9_RUNNER_EVENT_HOLD}: durable write not verified`,
      continuationAuthorized: false,
      allowContinuation: false,
    };
  }
  const order = assertRunnerEventsAllowAuthorize(events);
  if (!order.ok) return { ...order, continuationAuthorized: false };
  const types = eventTypesOf(events);
  if (isLast && (types.includes("continuation_started") || types.includes("continuation_completed"))) {
    return {
      ok: false,
      hold: F9_RUNNER_EVENT_HOLD,
      reason: `${F9_RUNNER_EVENT_HOLD}: 00123 final semantics must not invent a later migration continuation`,
      continuationAuthorized: false,
      allowContinuation: false,
      inventedLaterContinuation: true,
    };
  }
  return {
    ok: true,
    continuationAuthorized: true,
    allowContinuation: isLast ? false : true,
    finalMigration: isLast,
    nextMigration: isLast ? null : true,
    inventedLaterContinuation: false,
  };
}

export function assertCheckpointAComplete(record) {
  const fail = (reason) => ({
    ok: false,
    hold: F10_CHECKPOINT_HOLD,
    allowRetry: false,
    allowContinuation: false,
    reason: `${F10_CHECKPOINT_HOLD}: ${reason}`,
  });
  if (record == null || typeof record !== "object" || Array.isArray(record)) {
    return fail("checkpoint A missing");
  }
  if (record.schema_version !== F10_CHECKPOINT_A_SCHEMA_VERSION) {
    return fail("checkpoint A schema_version");
  }
  if (record.checkpoint !== "A" || record.boundary !== "after_repair_before_retry") {
    return fail("checkpoint A boundary");
  }
  if (!record.migrationIdentity || typeof record.migrationIdentity !== "object") {
    return fail("checkpoint A migration identity");
  }
  if (!isCompleteProcessResult(record.repairProcessResult)) {
    return fail("checkpoint A missing/incomplete sanitized repair command+process");
  }
  if (record.repairProcessResult.status !== 0) {
    return fail("failed repair cannot persist as Checkpoint A for retry");
  }
  return { ok: true, record };
}

export function assertCheckpointBComplete(record) {
  const fail = (reason) => ({
    ok: false,
    hold: F10_CHECKPOINT_HOLD,
    allowContinuation: false,
    continuationAuthorized: false,
    reason: `${F10_CHECKPOINT_HOLD}: ${reason}`,
  });
  if (record == null || typeof record !== "object" || Array.isArray(record)) {
    return fail("checkpoint B missing");
  }
  if (record.schema_version !== F10_CHECKPOINT_B_SCHEMA_VERSION) {
    return fail("checkpoint B schema_version");
  }
  if (record.checkpoint !== "B" || record.boundary !== "after_retry_post_retry_before_continuation") {
    return fail("checkpoint B boundary");
  }
  if (!isCompleteProcessResult(record.retryProcessResult)) {
    return fail("checkpoint B missing/incomplete sanitized retry command+process");
  }
  if (record.retryProcessResult.status !== 0) {
    return fail("failed retry cannot persist as Checkpoint B for continuation");
  }
  if (!record.postRetryProof || record.postRetryProof.ok !== true) {
    return fail("checkpoint B missing post-retry proof");
  }
  const link = record.checkpointA;
  if (!link || typeof link !== "object") {
    return fail("checkpoint B missing authenticated link to A");
  }
  if (typeof link.sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(link.sha256)) {
    return fail("checkpoint B link to A missing sha256");
  }
  if (typeof link.bytes !== "number" || !link.dest) {
    return fail("checkpoint B link to A missing dest/bytes");
  }
  return { ok: true, record };
}

export function persistF10Checkpoint({ dest, record, hooks = {}, assertComplete } = {}) {
  const complete = assertComplete(record);
  if (!complete.ok) {
    return { ...complete, written: false, verified: false };
  }
  if (!dest) {
    return {
      ok: false,
      hold: F10_CHECKPOINT_HOLD,
      reason: `${F10_CHECKPOINT_HOLD}: durable dest missing`,
      written: false,
      verified: false,
    };
  }
  const abs = path.resolve(dest);
  const sanitized = sanitizeForLog(record);
  const body = Buffer.from(`${JSON.stringify(sanitized, null, 2)}\n`, "utf8");
  const durable = writeDurableArtifactBytes(abs, body, hooks);
  if (!durable.ok || durable.verified !== true) {
    return {
      ok: false,
      hold: F10_CHECKPOINT_HOLD,
      reason: durable.reason || `${F10_CHECKPOINT_HOLD}: durable write not verified`,
      written: durable.written === true,
      verified: false,
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(durable.buf.toString("utf8"));
  } catch {
    return {
      ok: false,
      hold: F10_CHECKPOINT_HOLD,
      reason: `${F10_CHECKPOINT_HOLD}: durable reread is not JSON`,
      written: true,
      verified: false,
    };
  }
  const rereadComplete = assertComplete(parsed);
  if (!rereadComplete.ok) {
    return { ...rereadComplete, written: true, verified: false };
  }
  return {
    ok: true,
    written: true,
    verified: true,
    dest: abs,
    sha256: durable.sha256,
    bytes: durable.bytes,
    record: parsed,
  };
}

export function persistCheckpointA({ dest, record, hooks = {} } = {}) {
  return persistF10Checkpoint({ dest, record, hooks, assertComplete: assertCheckpointAComplete });
}

export function persistCheckpointB({ dest, record, hooks = {} } = {}) {
  return persistF10Checkpoint({ dest, record, hooks, assertComplete: assertCheckpointBComplete });
}

export function verifyPersistedCheckpoint({ dest, assertComplete, expectedLink = null } = {}) {
  if (!dest || !fs.existsSync(dest)) {
    return {
      ok: false,
      hold: F10_CHECKPOINT_HOLD,
      reason: `${F10_CHECKPOINT_HOLD}: persisted checkpoint missing`,
      verified: false,
    };
  }
  let buf;
  try {
    buf = fs.readFileSync(dest);
  } catch (err) {
    return {
      ok: false,
      hold: F10_CHECKPOINT_HOLD,
      reason: `${F10_CHECKPOINT_HOLD}: ${err?.message || err}`,
      verified: false,
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(buf.toString("utf8"));
  } catch {
    return {
      ok: false,
      hold: F10_CHECKPOINT_HOLD,
      reason: `${F10_CHECKPOINT_HOLD}: persisted checkpoint is not JSON`,
      verified: false,
    };
  }
  const complete = assertComplete(parsed);
  if (!complete.ok) return { ...complete, verified: false };
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const bytes = buf.byteLength;
  if (expectedLink) {
    if (expectedLink.sha256 && expectedLink.sha256 !== sha256) {
      return {
        ok: false,
        hold: F10_CHECKPOINT_HOLD,
        reason: `${F10_CHECKPOINT_HOLD}: checkpoint digest does not match authenticated link`,
        verified: false,
      };
    }
    if (expectedLink.bytes != null && expectedLink.bytes !== bytes) {
      return {
        ok: false,
        hold: F10_CHECKPOINT_HOLD,
        reason: `${F10_CHECKPOINT_HOLD}: checkpoint byte-length does not match authenticated link`,
        verified: false,
      };
    }
  }
  return {
    ok: true,
    verified: true,
    dest: path.resolve(dest),
    sha256,
    bytes,
    record: parsed,
  };
}

export function verifyPersistedCheckpointA(dest, expectedLink = null) {
  return verifyPersistedCheckpoint({ dest, assertComplete: assertCheckpointAComplete, expectedLink });
}

export function verifyPersistedCheckpointB(dest, expectedLink = null) {
  return verifyPersistedCheckpoint({ dest, assertComplete: assertCheckpointBComplete, expectedLink });
}

export function buildCheckpointARecord({
  file,
  version,
  migrationSourceLabel = "F3_FORWARD",
  repairProcessResult,
  eventStream = [],
  runnerCounters = {},
} = {}) {
  return {
    schema_version: F10_CHECKPOINT_A_SCHEMA_VERSION,
    checkpoint: "A",
    boundary: "after_repair_before_retry",
    migrationIdentity: { file, version, sourceLabel: migrationSourceLabel },
    repairProcessResult: encodeSanitizedProcessResult(repairProcessResult),
    eventStream,
    runnerCounters: { ...runnerCounters },
  };
}

export function buildCheckpointBRecord({
  file,
  version,
  migrationSourceLabel = "F3_FORWARD",
  retryProcessResult,
  postRetryProof,
  checkpointA,
  eventStream = [],
  runnerCounters = {},
} = {}) {
  return {
    schema_version: F10_CHECKPOINT_B_SCHEMA_VERSION,
    checkpoint: "B",
    boundary: "after_retry_post_retry_before_continuation",
    migrationIdentity: { file, version, sourceLabel: migrationSourceLabel },
    retryProcessResult: encodeSanitizedProcessResult(retryProcessResult),
    postRetryProof: postRetryProof || { ok: false },
    checkpointA: checkpointA
      ? { dest: checkpointA.dest, sha256: checkpointA.sha256, bytes: checkpointA.bytes }
      : null,
    eventStream,
    runnerCounters: { ...runnerCounters },
  };
}

export async function invokeRecordedOperation({
  recorder,
  counters,
  counterKey = null,
  eventPrefix,
  phase,
  commandIdentity,
  invoke,
  onAfterStarted = null,
} = {}) {
  if (counterKey) counters[counterKey] += 1;
  recorder.record(`${eventPrefix}_started`, {
    phase,
    commandIdentity,
  });
  if (typeof onAfterStarted === "function") {
    await onAfterStarted({
      eventPrefix,
      pendingStarted: true,
      completed: false,
      events: recorder.snapshot(),
    });
  }
  let result;
  let thrown = null;
  try {
    result = await Promise.resolve(invoke());
  } catch (err) {
    thrown = err;
    result = {
      commandIdentity,
      status: 1,
      stdout: "",
      stderr: String(err?.message || err),
      error: String(err?.message || err),
      signal: null,
      timeout: false,
    };
  }
  const processResult = {
    commandIdentity: result?.commandIdentity ?? result?.command ?? commandIdentity,
    argv: result?.argv,
    status: result?.status ?? 1,
    stdout: result?.stdout ?? "",
    stderr: result?.stderr ?? "",
    error: result?.error ?? (thrown ? String(thrown.message || thrown) : null),
    signal: result?.signal ?? null,
    timeout: result?.timeout === true,
  };
  recorder.record(`${eventPrefix}_completed`, {
    phase,
    processResult,
  });
  return {
    result,
    processResult,
    encoded: encodeSanitizedProcessResult(processResult),
    thrown,
    ok: thrown == null && processResult.status === 0,
    failed: thrown != null || processResult.status !== 0,
  };
}

/**
 * Shared F10 orchestration: same path qualify uses for repair → A → retry →
 * post-retry → B → continuation. Tests drive this via adapters/spies; it does
 * not invent a trace from prepared results.
 */
export async function runF10RepairRetryContinuation({
  file,
  version,
  destA,
  destB,
  migrationSourceLabel = "F3_FORWARD",
  recorder = null,
  counters = null,
  adapters = {},
  persistHooksA = {},
  persistHooksB = {},
  onAfterRepairStarted = null,
  onAfterRetryStarted = null,
  onAfterContinuationStarted = null,
  completedRepair = null,
} = {}) {
  const runnerCounters = counters || createEmptyRunnerCounters();
  const eventRecorder = recorder || createRunnerEventRecorder({
    migrationSourceLabel,
    migrationVersion: version,
    migrationName: file,
  });
  const spies = {
    repairCalls: 0,
    retryCalls: 0,
    continuationAuthorizationCalls: 0,
    continuationCalls: 0,
    continuationQueryCalls: 0,
    checkpointAWrites: 0,
    checkpointBWrites: 0,
  };
  const isLast = file === F3_FORWARD_FILES[F3_FORWARD_FILES.length - 1];
  const fail = (reason, extra = {}) => ({
    ok: false,
    allowRetry: extra.allowRetry === true,
    allowContinuation: false,
    continuationAuthorized: false,
    reason,
    hold: extra.hold || F10_CHECKPOINT_HOLD,
    events: eventRecorder.snapshot(),
    counters: runnerCounters,
    spies,
    inventedLaterContinuation: false,
    finalMigration: isLast,
    nextMigration: null,
    ...extra,
  });

  const repairFn = adapters.repair;
  let repairOp;
  if (completedRepair) {
    const processResult = {
      commandIdentity: completedRepair.commandIdentity
        ?? completedRepair.command
        ?? adapters.repairCommand
        ?? "supabase migration repair --status applied --db-url [REDACTED] --workdir [ISOLATED] --yes",
      argv: completedRepair.argv,
      status: completedRepair.status ?? 1,
      stdout: completedRepair.stdout ?? "",
      stderr: completedRepair.stderr ?? "",
      error: completedRepair.error ?? null,
      signal: completedRepair.signal ?? null,
      timeout: completedRepair.timeout === true,
    };
    repairOp = {
      result: completedRepair,
      processResult,
      encoded: encodeSanitizedProcessResult(processResult),
      thrown: null,
      ok: processResult.status === 0,
      failed: processResult.status !== 0,
    };
    spies.repairCalls += 1;
  } else {
    if (typeof repairFn !== "function") {
      return fail(`${F10_CHECKPOINT_HOLD}: repair adapter missing`);
    }
    repairOp = await invokeRecordedOperation({
      recorder: eventRecorder,
      counters: runnerCounters,
      counterKey: "repairCalls",
      eventPrefix: "repair",
      phase: "repair",
      commandIdentity: adapters.repairCommand
        || "supabase migration repair --status applied --db-url [REDACTED] --workdir [ISOLATED] --yes",
      invoke: () => {
        spies.repairCalls += 1;
        return repairFn();
      },
      onAfterStarted: onAfterRepairStarted,
    });
  }
  if (!repairOp.ok) {
    return fail(
      `${F10_CHECKPOINT_HOLD}: failed repair blocks retry+continuation`,
      { allowRetry: false, repairOp, spies },
    );
  }

  const checkpointARecord = buildCheckpointARecord({
    file,
    version,
    migrationSourceLabel,
    repairProcessResult: repairOp.processResult,
    eventStream: eventRecorder.snapshot(),
    runnerCounters,
  });
  spies.checkpointAWrites += 1;
  const persistedA = persistCheckpointA({
    dest: destA,
    record: checkpointARecord,
    hooks: persistHooksA,
  });
  if (!persistedA.ok || persistedA.verified !== true) {
    return fail(persistedA.reason || `${F10_CHECKPOINT_HOLD}: Checkpoint A not verified`, {
      persistA: persistedA,
      repairOp,
    });
  }
  eventRecorder.record("checkpoint_a_persisted", {
    phase: "checkpoint_a",
    process: {
      commandIdentity: "atomic-checkpoint-a-write",
      status: 0,
      signal: null,
      timeout: false,
      stdoutByteLength: persistedA.bytes,
      stderrByteLength: 0,
      stdoutSha256: persistedA.sha256,
      stderrSha256: sha256Utf8Qualify(""),
    },
  });

  const verifiedA = verifyPersistedCheckpointA(destA, {
    sha256: persistedA.sha256,
    bytes: persistedA.bytes,
  });
  if (!verifiedA.ok) {
    return fail(verifiedA.reason || `${F10_CHECKPOINT_HOLD}: Checkpoint A reread failed before retry`, {
      persistA: persistedA,
      verifiedA,
      repairOp,
    });
  }

  const postRepair = typeof adapters.postRepairVerify === "function"
    ? await Promise.resolve(adapters.postRepairVerify(repairOp))
    : { ok: true };
  if (postRepair?.ok === false) {
    return fail(postRepair.reason || `${F10_CHECKPOINT_HOLD}: post-repair verification failed`, {
      persistA: persistedA,
      repairOp,
      postRepair,
    });
  }

  const retryFn = adapters.retry;
  if (typeof retryFn !== "function") {
    return fail(`${F10_CHECKPOINT_HOLD}: retry adapter missing`, { persistA: persistedA });
  }
  const retryOp = await invokeRecordedOperation({
    recorder: eventRecorder,
    counters: runnerCounters,
    counterKey: "retryDbPushCalls",
    eventPrefix: "retry",
    phase: "retry",
    commandIdentity: adapters.retryCommand
      || "supabase db push --db-url [REDACTED] --workdir [ISOLATED] --yes --skip-vault",
    invoke: () => {
      spies.retryCalls += 1;
      return retryFn();
    },
    onAfterStarted: onAfterRetryStarted,
  });
  if (!retryOp.ok) {
    return fail(
      `${F10_CHECKPOINT_HOLD}: failed retry blocks continuation`,
      { allowRetry: true, persistA: persistedA, repairOp, retryOp },
    );
  }
  eventRecorder.record("post_retry_fingerprint_collected", { phase: "post_retry_fingerprint" });

  const postRetry = typeof adapters.postRetryVerify === "function"
    ? await Promise.resolve(adapters.postRetryVerify(retryOp))
    : { ok: true };
  if (postRetry?.ok === false) {
    return fail(postRetry.reason || `${F10_CHECKPOINT_HOLD}: post-retry verification failed`, {
      persistA: persistedA,
      repairOp,
      retryOp,
      postRetry,
    });
  }

  const checkpointBRecord = buildCheckpointBRecord({
    file,
    version,
    migrationSourceLabel,
    retryProcessResult: retryOp.processResult,
    postRetryProof: { ok: true, ...(postRetry || {}) },
    checkpointA: persistedA,
    eventStream: eventRecorder.snapshot(),
    runnerCounters,
  });
  spies.checkpointBWrites += 1;
  const persistedB = persistCheckpointB({
    dest: destB,
    record: checkpointBRecord,
    hooks: persistHooksB,
  });
  if (!persistedB.ok || persistedB.verified !== true) {
    return fail(persistedB.reason || `${F10_CHECKPOINT_HOLD}: Checkpoint B not verified`, {
      persistA: persistedA,
      persistB: persistedB,
      repairOp,
      retryOp,
    });
  }
  const stillA = verifyPersistedCheckpointA(destA, {
    sha256: persistedA.sha256,
    bytes: persistedA.bytes,
  });
  if (!stillA.ok) {
    return fail(`${F10_CHECKPOINT_HOLD}: later write disguised Checkpoint A`, {
      persistA: persistedA,
      persistB: persistedB,
    });
  }
  const verifiedB = verifyPersistedCheckpointB(destB, {
    sha256: persistedB.sha256,
    bytes: persistedB.bytes,
  });
  if (!verifiedB.ok) {
    return fail(verifiedB.reason || `${F10_CHECKPOINT_HOLD}: Checkpoint B reread failed before continuation`, {
      persistA: persistedA,
      persistB: persistedB,
      verifiedB,
    });
  }
  eventRecorder.record("checkpoint_b_persisted", {
    phase: "checkpoint_b",
    process: {
      commandIdentity: "atomic-checkpoint-b-write",
      status: 0,
      signal: null,
      timeout: false,
      stdoutByteLength: persistedB.bytes,
      stderrByteLength: 0,
      stdoutSha256: persistedB.sha256,
      stderrSha256: sha256Utf8Qualify(""),
    },
  });

  spies.continuationAuthorizationCalls += 1;
  runnerCounters.continuationAuthorizationCalls += 1;
  eventRecorder.record("continuation_authorized", { phase: "continuation_authorized" });

  let continuationResult = null;
  if (!isLast) {
    runnerCounters.continuationCalls += 1;
    spies.continuationCalls += 1;
    eventRecorder.record("continuation_started", { phase: "continuation" });
    if (typeof onAfterContinuationStarted === "function") {
      await onAfterContinuationStarted({
        pendingStarted: true,
        completed: false,
        events: eventRecorder.snapshot(),
      });
    }
    if (typeof adapters.continuation === "function") {
      spies.continuationQueryCalls += 1;
      continuationResult = await Promise.resolve(adapters.continuation());
      if (continuationResult?.ok === false) {
        eventRecorder.record("continuation_completed", {
          phase: "continuation",
          processResult: {
            commandIdentity: "continuation-query-validate",
            status: 1,
            stdout: "",
            stderr: continuationResult.reason || "continuation failed",
            error: continuationResult.reason || "continuation failed",
            signal: null,
            timeout: false,
          },
        });
        return fail(continuationResult.reason || `${F10_CHECKPOINT_HOLD}: continuation queries/validation failed`, {
          persistA: persistedA,
          persistB: persistedB,
          continuationResult,
          allowRetry: true,
        });
      }
    }
    eventRecorder.record("continuation_completed", { phase: "continuation" });
  }

  return {
    ok: true,
    allowRetry: true,
    allowContinuation: !isLast,
    continuationAuthorized: true,
    finalMigration: isLast,
    nextMigration: isLast ? null : true,
    inventedLaterContinuation: false,
    events: eventRecorder.snapshot(),
    counters: runnerCounters,
    spies,
    persistA: persistedA,
    persistB: persistedB,
    repairOp,
    retryOp,
    continuationResult,
    expectedCounters: expectedRunnerCountersForFile(file),
  };
}

function f10CheckpointDestFor(evidenceOut, file, version, kind) {
  if (!evidenceOut) return null;
  const absOut = path.resolve(root, evidenceOut);
  return path.join(
    path.dirname(absOut),
    `f10-checkpoint-${kind}-${version}-${String(file).replace(/\.sql$/, "")}.json`,
  );
}

function preContinuationDestFor(evidenceOut, file, version) {
  if (!evidenceOut) return null;
  const absOut = path.resolve(root, evidenceOut);
  return path.join(
    path.dirname(absOut),
    `pre-continuation-${version}-${String(file).replace(/\.sql$/, "")}.json`,
  );
}

function durableWriteRepairAuthorization(evidence, record, evidenceOut, extras = {}) {
  const complete = writeRepairAuthorizationRecord({ record });
  if (!complete.ok) return { ...complete, continuationAuthorized: false };
  evidence.repairAuthorizationRecords = Array.isArray(evidence.repairAuthorizationRecords)
    ? evidence.repairAuthorizationRecords
    : [];
  record.writtenBeforeNextMigration = true;
  const f9Record = extras.preContinuationRecord || null;
  const dest = extras.dest || preContinuationDestFor(evidenceOut, record?.migrationIdentity?.file, record?.migrationIdentity?.version);
  if (!f9Record) {
    return {
      ok: false,
      hold: F9_RUNNER_EVENT_HOLD,
      reason: `${F9_RUNNER_EVENT_HOLD}: pre-continuation record missing complete repair/retry process result`,
      written: false,
      continuationAuthorized: false,
    };
  }
  const persisted = persistPreContinuationRecord({ dest, record: f9Record });
  if (!persisted.ok) return persisted;
  evidence.repairAuthorizationRecords.push(record);
  evidence.preContinuationRecords = Array.isArray(evidence.preContinuationRecords)
    ? evidence.preContinuationRecords
    : [];
  evidence.preContinuationRecords.push({
    dest: persisted.dest,
    sha256: persisted.sha256,
    bytes: persisted.bytes,
    file: record?.migrationIdentity?.file,
  });
  return { ...persisted, record };
}

export async function exerciseF9RunnerOrchestration({
  file,
  version,
  dest,
  migrationSourceLabel = "F3_FORWARD",
  targetBindingId = "approved-disposable",
  initialPush,
  cleanup,
  poison,
  repair,
  retry,
  poisonBinding = { ok: true, live: { current_database: "postgres" } },
  hooks = {},
  omitEvent = null,
  reorderPair = null,
  skipPersist = false,
} = {}) {
  const counters = createEmptyRunnerCounters();
  const recorder = createRunnerEventRecorder({
    migrationSourceLabel,
    migrationVersion: version,
    migrationName: file,
    targetBindingId,
  });
  const callTrace = [];
  const mark = (eventType, extra) => {
    callTrace.push(eventType);
    return recorder.record(eventType, { ...extra, counters: { ...counters } });
  };
  const isLast = file === F3_FORWARD_FILES[F3_FORWARD_FILES.length - 1];

  counters.initialDbPushCalls += 1;
  mark("initial_db_push_started", { processResult: initialPush, phase: "initial_db_push" });
  mark("initial_db_push_completed", { processResult: initialPush, phase: "initial_db_push" });
  mark("post_commit_history_failure_classified", { phase: "classify" });
  mark("fingerprint_collected", { phase: "fingerprint" });

  counters.gateCalls += 1;
  mark("repair_gate_evaluated", { phase: "repair_gate" });

  counters.cleanupCalls += 1;
  mark("cleanup_started", { processResult: cleanup, phase: "cleanup" });
  mark("cleanup_completed", { processResult: cleanup, phase: "cleanup" });

  counters.poisonProbeCalls += 1;
  mark("poison_probe_started", { processResult: poison, phase: "poison_probe" });
  mark("poison_probe_completed", { processResult: poison, phase: "poison_probe" });
  mark("target_binding_verified", { phase: "target_binding" });

  const allowRepair = assertRunnerEventsAllowRepair(recorder.snapshot());
  if (!allowRepair.ok || hooks.failRepair === true || (repair && repair.status !== 0)) {
    if (hooks.failRepair === true || (repair && repair.status !== 0)) {
      counters.repairCalls += 1;
      mark("repair_started", { processResult: repair, phase: "repair" });
      mark("repair_completed", { processResult: repair, phase: "repair" });
    }
    return {
      ok: false,
      allowRepair: false,
      allowRetry: false,
      allowContinuation: false,
      reason: allowRepair.reason || `${F9_RUNNER_EVENT_HOLD}: failed repair blocks retry+continuation`,
      events: recorder.snapshot(),
      callTrace,
      counters,
      inventedLaterContinuation: false,
    };
  }

  counters.repairCalls += 1;
  mark("repair_started", { processResult: repair, phase: "repair" });
  mark("repair_completed", { processResult: repair, phase: "repair" });

  const allowRetry = assertRunnerEventsAllowRetry(recorder.snapshot());
  if (!allowRetry.ok || hooks.failRetry === true || (retry && retry.status !== 0)) {
    if (hooks.failRetry === true || (retry && retry.status !== 0)) {
      counters.retryDbPushCalls += 1;
      mark("retry_started", { processResult: retry, phase: "retry" });
      mark("retry_completed", { processResult: retry, phase: "retry" });
    }
    return {
      ok: false,
      allowRepair: true,
      allowRetry: false,
      allowContinuation: false,
      reason: allowRetry.reason || `${F9_RUNNER_EVENT_HOLD}: failed retry blocks continuation`,
      events: recorder.snapshot(),
      callTrace,
      counters,
      inventedLaterContinuation: false,
    };
  }

  counters.retryDbPushCalls += 1;
  mark("retry_started", { processResult: retry, phase: "retry" });
  mark("retry_completed", { processResult: retry, phase: "retry" });
  mark("post_retry_fingerprint_collected", { phase: "post_retry_fingerprint" });

  const repairProcessResult = encodeSanitizedProcessResult(repair);
  const retryProcessResult = encodeSanitizedProcessResult(retry);
  const poisonProcessResult = encodeSanitizedProcessResult(poison);
  const preContinuationRecord = {
    schema_version: F9_PRE_CONTINUATION_SCHEMA_VERSION,
    migrationIdentity: { file, version, sourceLabel: migrationSourceLabel },
    repairProcessResult,
    retryProcessResult,
    poisonProcessResult,
    originalPoison: poisonProcessResult,
    targetBinding: poisonBinding,
    runnerCounters: { ...counters },
    gateCounters: { repairCalls: 1, cleanupCalls: 1, verifyCalls: 1, dbPushCalls: 0, continuationCalls: 0 },
    eventStream: recorder.snapshot(),
    finalMigration: isLast,
    nextMigration: isLast ? null : true,
    inventedLaterContinuation: false,
  };

  let persistResult;
  if (skipPersist) {
    persistResult = { ok: false, verified: false, reason: `${F9_RUNNER_EVENT_HOLD}: durable dest missing` };
  } else {
    persistResult = persistPreContinuationRecord({
      dest,
      record: preContinuationRecord,
      hooks,
    });
  }
  if (!persistResult.ok) {
    return {
      ok: false,
      allowRepair: true,
      allowRetry: true,
      allowContinuation: false,
      continuationAuthorized: false,
      reason: persistResult.reason,
      events: recorder.snapshot(),
      callTrace,
      counters,
      persistResult,
      preContinuationRecord,
      inventedLaterContinuation: false,
    };
  }
  counters.durableRecordWrites += 1;
  mark("pre_continuation_record_persisted", {
    phase: "pre_continuation",
    process: {
      commandIdentity: "atomic-pre-continuation-write",
      status: 0,
      signal: null,
      timeout: false,
      stdoutByteLength: persistResult.bytes,
      stderrByteLength: 0,
      stdoutSha256: persistResult.sha256,
      stderrSha256: sha256Utf8Qualify(""),
    },
  });

  let eventsForAuth = recorder.snapshot();
  if (omitEvent) {
    eventsForAuth = eventsForAuth.filter((event) => event.event_type !== omitEvent);
  }
  if (reorderPair && Array.isArray(reorderPair) && reorderPair.length === 2) {
    const copy = eventsForAuth.map((event) => ({ ...event }));
    const a = copy.findIndex((event) => event.event_type === reorderPair[0]);
    const b = copy.findIndex((event) => event.event_type === reorderPair[1]);
    if (a >= 0 && b >= 0) {
      const tmp = copy[a];
      copy[a] = copy[b];
      copy[b] = tmp;
    }
    eventsForAuth = copy;
  }

  const authorized = evaluateF9ContinuationAuthorization({
    events: eventsForAuth,
    record: { ...preContinuationRecord, eventStream: eventsForAuth },
    persistResult,
    file,
  });
  if (!authorized.ok || authorized.continuationAuthorized !== true) {
    return {
      ok: false,
      allowContinuation: false,
      continuationAuthorized: false,
      reason: authorized.reason,
      events: eventsForAuth,
      callTrace,
      counters,
      persistResult,
      preContinuationRecord,
      inventedLaterContinuation: false,
    };
  }

  counters.continuationAuthorizationCalls += 1;
  mark("continuation_authorized", {
    phase: "continuation_authorized",
    counters: { ...counters },
  });

  if (!isLast) {
    counters.continuationCalls += 1;
    mark("continuation_started", { phase: "continuation" });
    mark("continuation_completed", { phase: "continuation" });
  }

  return {
    ok: true,
    allowRepair: true,
    allowRetry: true,
    allowContinuation: !isLast,
    continuationAuthorized: true,
    finalMigration: isLast,
    nextMigration: isLast ? null : true,
    inventedLaterContinuation: false,
    events: recorder.snapshot(),
    callTrace,
    counters,
    persistResult,
    preContinuationRecord,
    expectedCounters: expectedRunnerCountersForFile(file),
  };
}

function commitNestedThenOuterEvidence(evidenceOut, payload) {
  const dest = path.resolve(root, evidenceOut);
  const written = commitQualifyEvidenceOrHold({ dest, payload });
  if (!written.ok) return written;
  const evidenceRoot = inferEvidenceRootFromDest(dest);
  if (!evidenceRoot) return written;
  const outer = commitOuterEvidenceTree(evidenceRoot);
  if (!outer.ok) {
    return {
      ok: false,
      hold: true,
      status: "HOLD",
      verdict: "HOLD",
      reason: `${EVIDENCE_WRITE_HOLD}: ${outer.reason || "outer evidence index failed"}`,
      exitCode: 1,
    };
  }
  return { ...written, outer };
}

function emitAndExit(payload, { evidenceOut = null, exitCode = 1 } = {}) {
  const json = JSON.stringify(sanitizeForLog(payload), null, 2);
  console.log(json);
  if (evidenceOut) {
    const written = commitNestedThenOuterEvidence(evidenceOut, json);
    if (!written.ok) {
      const hold = {
        ...payload,
        status: "HOLD",
        verdict: FILE_BASED_RUNNER_VERDICTS.HOLD,
        ok: false,
        reason: written.reason || EVIDENCE_WRITE_HOLD,
        evidenceWrite: written,
        fingerprint_exact: false,
      };
      console.log(JSON.stringify(sanitizeForLog(hold), null, 2));
      process.exit(written.exitCode || 1);
    }
  }
  process.exit(exitCode);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const evidenceOutGate = assertEvidenceOutFileContract(
    args.evidenceOut ? path.resolve(root, args.evidenceOut) : null,
  );
  if (!evidenceOutGate.ok) {
    emitAndExit({
      status: "HOLD",
      verdict: FILE_BASED_RUNNER_VERDICTS.HOLD,
      ok: false,
      reason: evidenceOutGate.reason || EVIDENCE_OUT_FILE_CONTRACT,
      evidenceOutGate,
      productionContacted: false,
      dbAccess: false,
      dbPushCalls: 0,
      repairCalls: 0,
      continuationCalls: 0,
      fingerprint_exact: false,
      failedGate: "evidence_out_contract",
    }, { evidenceOut: null, exitCode: 1 });
  }
  const recursiveClosureGate = assertRecursiveClosureReadyForDb(F3_FUNCTIONAL_RECURSIVE_CLOSURE);
  if (!recursiveClosureGate.ok) {
    emitAndExit({
      status: "HOLD",
      verdict: FILE_BASED_RUNNER_VERDICTS.HOLD,
      ok: false,
      reason: recursiveClosureGate.reason || RECURSIVE_CLOSURE_HOLD,
      recursiveClosureGate,
      recursiveRuntimeClosure: F3_FUNCTIONAL_RECURSIVE_CLOSURE,
      productionContacted: false,
      dbAccess: false,
      dbPushCalls: 0,
      repairCalls: 0,
      continuationCalls: 0,
      fingerprint_exact: false,
      failedGate: recursiveClosureGate.failedGate || "recursive_runtime_closure",
      git_verification_unavailable: recursiveClosureGate.code === "GIT_VERIFICATION_UNAVAILABLE",
    }, { evidenceOut: args.evidenceOut, exitCode: 1 });
  }
  const platformAclCalibration = authorizeDbPushAfterPlatformAclCalibration();
  if (!platformAclCalibration.ok) {
    emitAndExit({
      status: "HOLD",
      verdict: FILE_BASED_RUNNER_VERDICTS.HOLD,
      ok: false,
      mode: args.sealFromLocalOracle ? "seal-expected-from-local-oracle" : "qualify",
      reason: platformAclCalibration.reason || PLATFORM_ACL_CALIBRATION_HOLD,
      platformAclCalibration,
      sealedPlatformAclEnvelopeDigest: SEALED_PLATFORM_ACL_ENVELOPE_DIGEST,
      productionContacted: false,
      dbAccess: false,
      dbPushCalls: 0,
      repairCalls: 0,
      fingerprint_exact: false,
    }, { evidenceOut: args.evidenceOut, exitCode: 1 });
  }
  if (args.sealFromLocalOracle) {
    const sealed = await sealExpectedFingerprintsFromLocalOracle();
    const payload = {
      mode: "seal-expected-from-local-oracle",
      productionContacted: false,
      hostedDisposableContacted: false,
      provenance: sealed.provenance || { ...EXPECTED_FINGERPRINT_SEAL_PROVENANCE },
      ok: sealed.ok === true,
      status: sealed.status,
      reason: sealed.reason || null,
      hashes: sealed.hashes || null,
      recognition: sealed.recognition || [...RECOGNITION_ALLOWLIST],
      schema_version: F3_FULL_FINGERPRINT_SCHEMA_VERSION,
      sealedPlatformAclEnvelopeDigest: SEALED_PLATFORM_ACL_ENVELOPE_DIGEST,
      platformAclCalibration,
      independentAgrees: sealed.independentAgrees === true,
      stageComparisons: sealed.stageComparisons || null,
      primaryStructured: sealed.primaryStructured || null,
      independentStructured: sealed.independentStructured || null,
      independentReferenceModule: F3_FUNCTIONAL_RECURSIVE_CLOSURE.independent_reference_module,
      independentReferenceSourceSha256: F3_FUNCTIONAL_RECURSIVE_CLOSURE.independent_reference_source_sha256,
      recursiveClosureSha256: F3_FUNCTIONAL_RECURSIVE_CLOSURE.closure_sha256,
      serverVersion: sealed.serverVersion || null,
      mustReverifyOn176: sealed.mustReverifyOn176 === true,
    };
    emitAndExit(payload, {
      evidenceOut: args.evidenceOut,
      exitCode: sealed.ok === true ? 0 : sealed.status === "NOT_RUN" ? 2 : 1,
    });
  }
  if (!dbPushGatesSatisfiedFromEnv()) {
    emitAndExit(chiefRunbook(), { evidenceOut: args.evidenceOut, exitCode: 2 });
  }

  assertDbPushGates({ optIn: true });
  if (!MANAGEMENT_API_APPLY_PERMANENTLY_DISQUALIFIED) {
    refuseManagementApiApply();
  }

  const evidence = {
    status: "RUNNING",
    verdict: FILE_BASED_RUNNER_VERDICTS.HOLD,
    candidateOnly: true,
    productionApproved: false,
    expectedFingerprintsBeforeDb: recordPreDbExpectedHashes(),
    frozenExpectedFingerprintCaptures: recordFrozenExpectedFingerprintCaptures(),
    sealedPlatformAclEnvelopeDigest: SEALED_PLATFORM_ACL_ENVELOPE_DIGEST,
    platformAclCalibration,
    managementApiApply: MANAGEMENT_API_APPLY_DISQUALIFICATION,
    projectRef: APPROVED_DISPOSABLE_PROJECT_REF,
    host: APPROVED_DISPOSABLE_HOST,
    recognition: recognitionFromSource(),
    frozenDigests: assertFrozenDigestsOnDisk(),
    versionsKnownBeforeExecution: { ...PREASSIGNED_VERSIONS },
    collision: null,
    identity: null,
    inventoryBefore: null,
    inventoryCapture: null,
    inventories: {
      [INVENTORY_PHASES.BEFORE_RESET]: null,
      [INVENTORY_PHASES.CLEAN_BASELINE]: null,
      [INVENTORY_PHASES.AFTER_FLOOR]: null,
      [INVENTORY_PHASES.AFTER_FAILED_HISTORY]: {},
      [INVENTORY_PHASES.AFTER_REPAIR]: {},
      [INVENTORY_PHASES.AFTER_RETRY]: {},
      [INVENTORY_PHASES.AFTER_CONTINUATION]: {},
      [INVENTORY_PHASES.FINAL]: null,
    },
    inventoryChronology: {
      do_not_call_pre_floor_final: true,
      final_label: INVENTORY_PHASES.FINAL,
    },
    wipe: null,
    cleanup: null,
    floor: null,
    preStubFloorCleanCheck: null,
    preDbPushGates: null,
    cli: null,
    help: null,
    sequence: [],
    repairAuthorizationRecords: [],
    preContinuationRecords: [],
    runnerCountersByFile: {},
    runnerEventStreams: {},
    runnerCounters: createEmptyRunnerCounters(),
    stagingInvariant: "PREFIX-COMPLETE, SINGLE-PENDING",
    productionHistoryLimitation: PRODUCTION_HISTORY_LIMITATION_WARNING,
    claims: {
      productionApproval: "NOT CLAIMED",
      managementApiApply: "PERMANENTLY DISQUALIFIED",
      dbPush: "QUALIFICATION CANDIDATE ONLY",
      applyTimeClock: "FORBIDDEN / NOT USED",
      automaticRepair: "FORBIDDEN",
    },
    cleanupRecommendation:
      "Leave disposable project jkorwnwwmdeflfntxntl in place. Do not delete or pause. Throwaway probe may be dropped; do not drop supabase_migrations unless CLI docs require init.",
  };

  try {
    const cli = discoverSupabaseCli();
    evidence.cli = sanitizeForLog(cli);
    if (!cli.available || !cli.matchesPin) {
      evidence.status = "HOLD";
      evidence.verdict = FILE_BASED_RUNNER_VERDICTS.HOLD;
      evidence.limitation = `Supabase CLI ${CLI_PIN} is required; observed ${cli.version || "unavailable"}`;
      throw Object.assign(new Error(evidence.limitation), { code: "F3_DBPUSH_CLI_PIN" });
    }

    const pushHelp = readDbPushHelp(cli.bin);
    const repairHelp = readMigrationRepairHelp(cli.bin);
    const listHelp = readMigrationListHelp(cli.bin);
    const queryHelp = readDbQueryHelp(cli.bin);
    assertDbPushHelpUsable(pushHelp);
    assertRepairHelpUsable(repairHelp);
    evidence.help = {
      dbPush: { status: pushHelp.status, hasDbUrl: pushHelp.hasDbUrl, hasSkipVault: pushHelp.hasSkipVault, hasYes: pushHelp.hasYes, hasWorkdir: pushHelp.hasWorkdir },
      repair: { status: repairHelp.status, hasStatus: repairHelp.hasStatus, hasApplied: repairHelp.hasApplied, hasDbUrl: repairHelp.hasDbUrl },
      list: { status: listHelp.status, hasDbUrl: listHelp.hasDbUrl },
      query: { status: queryHelp.status, hasDbUrl: queryHelp.hasDbUrl, hasFile: queryHelp.hasFile },
    };

    evidence.identity = await getDisposableProjectIdentity();
    const listed = await listDisposableMigrationsViaGet();
    evidence.historyGet = listed;

    const isolated = createIsolatedDbPushWorkdir();
    const frozenTargetBuilt = constructImmutableValidatedTargetFromConnection({
      source: "qualify-f3-db-push-disposable",
    });
    if (!frozenTargetBuilt.ok) {
      evidence.status = "HOLD";
      evidence.verdict = FILE_BASED_RUNNER_VERDICTS.HOLD;
      evidence.limitation = frozenTargetBuilt.reason || IMMUTABLE_TARGET_HOLD;
      evidence.frozenTarget = { ok: false, reason: frozenTargetBuilt.reason };
      throw Object.assign(new Error(evidence.limitation), { code: "F3_DBPUSH_TARGET_BINDING" });
    }
    evidence.frozenTarget = {
      ok: true,
      target: frozenTargetBuilt.target,
      provenance: frozenTargetBuilt.target.provenance,
      pooler_username_mapping: frozenTargetBuilt.target.pooler_username_mapping,
    };
    evidence.isolatedWorkdir = {
      created: true,
      copyCount: isolated.copies.length,
      copies: isolated.copies.map((c) => ({
        sourceFile: c.sourceFile,
        destName: c.destName,
        version: c.version,
        name: c.name,
        byteLength: c.byteLength,
        sha256Before: c.sha256Before,
        sha256After: c.sha256After,
      })),
      repoDigestsUnchanged: isolated.repoDigestsUnchanged,
    };

    const historyPre = await runDbQuery({
      bin: cli.bin,
      workdir: isolated.workdir,
      help: queryHelp,
      sql: READ_SCHEMA_MIGRATIONS_SQL,
    });
    const historyRows = rowsFromQuery(historyPre);
    evidence.historyPreflight = {
      status: historyPre.status,
      rows: Array.isArray(historyRows) ? historyRows : [],
    };
    evidence.collision = assertVersionCollisionPass({
      disposableHistoryVersions: (Array.isArray(historyRows) ? historyRows : []).map((r) => r.version),
    });

    const inventory = await runDbQuery({
      bin: cli.bin,
      workdir: isolated.workdir,
      help: queryHelp,
      sql: INVENTORY_SQL,
    });
    evidence.inventoryBefore = { status: inventory.status, body: inventoryFromQuery(inventory.stdout) };
    evidence.inventories[INVENTORY_PHASES.BEFORE_RESET] = labelInventoryCapture({
      phase: INVENTORY_PHASES.BEFORE_RESET,
      body: inventoryFromQuery(inventory.stdout),
    });
    const columns = await runDbQuery({
      bin: cli.bin,
      workdir: isolated.workdir,
      help: queryHelp,
      sql: READ_SCHEMA_MIGRATIONS_COLUMNS_SQL,
    });
    evidence.schemaMigrationsColumns = { status: columns.status, body: parseJsonish(columns.stdout) };

    if (!args.skipCleanup) {
      evidence.cleanup = await runDbQuery({
        bin: cli.bin,
        workdir: isolated.workdir,
        help: queryHelp,
        sql: DROP_THROWAWAY_PROBE_SQL,
      });
      evidence.cleanup.dropped = LIVE_PROBE_THROWAWAY_TABLE;
    }

    const captured = await runDbQuery({
      bin: cli.bin,
      workdir: isolated.workdir,
      help: queryHelp,
      sql: INVENTORY_CAPTURE_SQL,
    });
    evidence.inventoryCapture = { status: captured.status, body: inventoryFromQuery(captured.stdout) };
    evidence.inventories[INVENTORY_PHASES.CLEAN_BASELINE] = labelInventoryCapture({
      phase: INVENTORY_PHASES.CLEAN_BASELINE,
      body: inventoryFromQuery(captured.stdout),
    });
    let floorMode;
    try {
      floorMode = resolveHostedFloorMode(args.floorMode);
    } catch (err) {
      evidence.status = "HOLD";
      evidence.verdict = FILE_BASED_RUNNER_VERDICTS.HOLD;
      evidence.limitation = err.message || GREENFIELD_DISALLOWED_FOR_THIS_AUTH;
      throw Object.assign(new Error(evidence.limitation), { code: err.code || "F3_DBPUSH_GREENFIELD_DISALLOWED" });
    }

    if (args.wipeToBaseline) {
      evidence.status = "HOLD";
      evidence.verdict = FILE_BASED_RUNNER_VERDICTS.HOLD;
      throw Object.assign(new Error("HOLD: re-wipe is forbidden for this founder auth; disposable stays CLEAN"), {
        code: "F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH",
      });
    }

    const historyForClean = Array.isArray(historyRows) ? historyRows : [];
    const listedMigrations = Array.isArray(listed?.rows)
      ? listed.rows
      : Array.isArray(listed)
        ? listed
        : [];
    const cleanCheck = evaluatePreStubFloorCleanCheck({
      inventory: inventoryFromQuery(captured.stdout),
      historyRows: historyForClean,
      listMigrations: listedMigrations,
    });
    evidence.preStubFloorCleanCheck = cleanCheck;
    evidence.wipe = {
      skipped: true,
      noWipe: true,
      do_not_wipe: true,
      cleanCheck,
      note: "Chief 06 clean-check is the pre-floor pin. Do not re-wipe. Do not replay 00001–00116. Leftover FAILED_FLOOR_STORAGE_POLICY_NAMES + avatars/group-documents/receipts are residual cleanup (narrow DROP), not --wipe-to-baseline.",
    };
    if (!cleanCheck.clean_ok) {
      evidence.status = "HOLD";
      evidence.verdict = FILE_BASED_RUNNER_VERDICTS.HOLD;
      evidence.limitation = cleanCheck.hold || PRE_STUB_FLOOR_CLEAN_CHECK_HOLD;
      throw Object.assign(new Error(evidence.limitation), { code: "F3_PRE_STUB_FLOOR_CLEAN_CHECK_HOLD" });
    }
    assertPreStubFloorCleanCheck(cleanCheck);

    const precheck = hostedFloorPrecheck(floorMode);
    evidence.floor = {
      precheck,
      authority: STUB_LIVE_PIN_FLOOR_AUTHORITY,
      label: QUALIFICATION_FLOOR_LABEL,
      mode: floorMode,
      installed: false,
    };
    if (args.prepFloor) {
      const installed = installHostedFloor({ workdir: isolated.workdir, mode: floorMode });
      const fingerprint = await runDbQuery({
        bin: cli.bin,
        workdir: isolated.workdir,
        help: queryHelp,
        sql: CATALOG_FINGERPRINT_SQL,
      });
      const gateQuery = await runDbQuery({
        bin: cli.bin,
        workdir: isolated.workdir,
        help: queryHelp,
        sql: PRE_DB_PUSH_VERIFICATION_SQL,
      });
      const capturedGates = inventoryFromQuery(gateQuery.stdout);
      const gates = evaluatePreDbPushGates({
        captured: capturedGates,
        isolatedWorkdir: isolated.workdir,
        invented00117History: Boolean(installed.invented00117History),
      });
      evidence.preDbPushGates = gates;
      evidence.floor = {
        ...evidence.floor,
        installed: installed.installed,
        exact: installed.exact,
        runner: "gated_psql_file",
        shimInstalled: false,
        transforms: installed.transforms,
        components: installed.components,
        cleanReplay00001_00117: false,
        productionEquivalent: false,
        invented00117History: false,
        file00117: installed.file00117,
        isolatedMigrations: installed.isolatedMigrations,
        hold: installed.hold || null,
        steps: installed.steps,
        failedAt: installed.failedAt,
        fingerprint: { status: fingerprint.status, body: inventoryFromQuery(fingerprint.stdout) },
        gateQuery: { status: gateQuery.status },
      };
      const afterFloorInv = await runDbQuery({
        bin: cli.bin,
        workdir: isolated.workdir,
        help: queryHelp,
        sql: INVENTORY_CAPTURE_SQL,
      });
      evidence.inventories[INVENTORY_PHASES.AFTER_FLOOR] = labelInventoryCapture({
        phase: INVENTORY_PHASES.AFTER_FLOOR,
        body: inventoryFromQuery(afterFloorInv.stdout),
      });
      if (!installed.installed || !installed.exact) {
        evidence.status = "HOLD";
        evidence.verdict = FILE_BASED_RUNNER_VERDICTS.HOLD;
        evidence.limitation = installed.hold || STUB_LIVE_PIN_FLOOR_HOLD;
        throw Object.assign(new Error(installed.hold || STUB_LIVE_PIN_FLOOR_HOLD), { code: "F3_DBPUSH_FLOOR_HOLD" });
      }
      if (!gates.ok) {
        evidence.status = "HOLD";
        evidence.verdict = FILE_BASED_RUNNER_VERDICTS.HOLD;
        evidence.limitation = gates.hold || STUB_LIVE_PIN_FLOOR_HOLD;
        throw Object.assign(new Error(gates.hold || STUB_LIVE_PIN_FLOOR_HOLD), {
          code: "F3_DBPUSH_PRE_PUSH_GATE_HOLD",
        });
      }
    } else {
      evidence.floor.skipped = true;
      evidence.floor.note =
        "Pass --no-wipe --prep-floor to install the documented stub+live-pin floor (00117 via gated psql -f). Greenfield is disallowed.";
    }

    if (args.sequenceF3) {
      if (!args.prepFloor || !evidence.preDbPushGates?.ok) {
        evidence.status = "HOLD";
        evidence.verdict = FILE_BASED_RUNNER_VERDICTS.HOLD;
        evidence.limitation = "HOLD: db push is refused until stub+live-pin floor and pre-db-push gates pass";
        throw Object.assign(new Error(evidence.limitation), { code: "F3_DBPUSH_PRE_PUSH_GATE_HOLD" });
      }
      if (!evidence.expectedFingerprintsBeforeDb?.recordedBeforeDbAccess) {
        evidence.expectedFingerprintsBeforeDb = recordPreDbExpectedHashes();
      }
      for (const file of F3_FORWARD_FILES) {
        const version = preassignedVersionFor(file);
        const runnerCounters = createEmptyRunnerCounters();
        const recorder = createRunnerEventRecorder({
          migrationSourceLabel: "F3_FORWARD",
          migrationVersion: version,
          migrationName: file,
          targetBindingId: evidence.frozenTarget?.target?.project_ref
            || APPROVED_DISPOSABLE_PROJECT_REF,
        });
        const recordRunnerEvent = (eventType, extra = {}) => recorder.record(eventType, {
          ...extra,
          counters: { ...runnerCounters },
        });
        const queryHistory = () =>
          runDbQuery({
            bin: cli.bin,
            workdir: isolated.workdir,
            help: queryHelp,
            sql: READ_SCHEMA_MIGRATIONS_SQL,
          });
        // PREFIX-COMPLETE, SINGLE-PENDING: stage through current, then
        // independently preflight before the first db push.
        const staged = syncIsolatedMigrationsThrough(isolated, file);
        const historyBeforePush = await queryHistory();
        const stagingPreflight = assertPrefixCompleteSinglePendingStaging({
          workdir: isolated.workdir,
          currentFile: file,
          historyResult: historyBeforePush,
          cliVersion: cli.version,
          phase: "initial",
        });
        const injectSql = historyInjectSqlForFile(file);
        const prePushCalibration = evaluatePlatformAclCalibration();
        if (!prePushCalibration.ok) {
          evidence.status = "HOLD";
          evidence.verdict = FILE_BASED_RUNNER_VERDICTS.HOLD;
          evidence.limitation = prePushCalibration.reason || PLATFORM_ACL_CALIBRATION_HOLD;
          evidence.platformAclCalibration = prePushCalibration;
          throw Object.assign(new Error(evidence.limitation), { code: "F3_PLATFORM_ACL_CALIBRATION_HOLD" });
        }
        const inject = runGatedRemoteSqlText(isolated.workdir, `inject-${version}.sql`, injectSql);
        runnerCounters.initialDbPushCalls += 1;
        recordRunnerEvent("initial_db_push_started", {
          phase: "initial_db_push",
          commandIdentity: "supabase db push --db-url [REDACTED] --workdir [ISOLATED] --yes --skip-vault",
        });
        const push = runDbPushCandidate({
          bin: cli.bin,
          workdir: isolated.workdir,
          help: pushHelp,
        });
        recordRunnerEvent("initial_db_push_completed", {
          phase: "initial_db_push",
          processResult: push,
        });
        const historyAfterFail = await runDbQuery({
          bin: cli.bin,
          workdir: isolated.workdir,
          help: queryHelp,
          sql: READ_SCHEMA_MIGRATIONS_SQL,
        });
        const probe = await runDbQuery({
          bin: cli.bin,
          workdir: isolated.workdir,
          help: queryHelp,
          sql: objectProbeSql(TARGET_OBJECT_PROBES[file]),
        });
        const objectsPresent = objectsPresentFromProbe({ ...probe, file });
        const fingerprintBeforeRepairQuery = await runDbQuery({
          bin: cli.bin,
          workdir: isolated.workdir,
          help: queryHelp,
          sql: CATALOG_FINGERPRINT_SQL,
        });
        const fingerprintExpectedFrozen = evidence.frozenExpectedFingerprintCaptures?.captures?.[file]
          || captureFrozenExpectedFingerprint(file);
        const expectedFingerprint = getFrozenExpectedFingerprint(file);
        const fingerprintAfterCommitFailedHistory = finalizeFingerprintCapture(
          collectPhaseFingerprint(
            file,
            fingerprintBeforeRepairQuery,
            FULL_FINGERPRINT_PHASES.AFTER_COMMIT_FAILED_HISTORY,
          ),
          { expected: expectedFingerprint },
        );
        const fingerprintObserved = fingerprintAfterCommitFailedHistory.fingerprint;
        const afterFailedHistoryInv = await runDbQuery({
          bin: cli.bin,
          workdir: isolated.workdir,
          help: queryHelp,
          sql: INVENTORY_CAPTURE_SQL,
        });
        evidence.inventories[INVENTORY_PHASES.AFTER_FAILED_HISTORY][file] = labelInventoryCapture({
          phase: INVENTORY_PHASES.AFTER_FAILED_HISTORY,
          file,
          body: inventoryFromQuery(afterFailedHistoryInv.stdout),
        });
        assertExpectedFingerprintImmutable(file);
        const fingerprint = {
          expected: expectedFingerprint,
          observed: fingerprintObserved,
          expectedSha256BeforeDb: expectedFingerprintSha256(file),
        };
        let fingerprintAfterPoisonCleanup = null;
        let poisonFingerprintEval = null;
        const classification = classifyDbPushHistoryFailure({
          exitStatus: push.status,
          stdout: push.stdout,
          stderr: push.stderr,
          historyRows: rowsFromQuery(historyAfterFail),
          targetVersion: version,
          objectsPresent,
        });
        recordRunnerEvent("post_commit_history_failure_classified", { phase: "classify" });
        recordRunnerEvent("fingerprint_collected", { phase: "fingerprint" });
        const hashedPushOut = hashOriginalStdout(push.stdout ?? "");
        const hashedPushErr = hashOriginalStdout(push.stderr ?? "");
        const gateInput = {
          file,
          targetVersion: version,
          injectInstalled: inject.status === 0,
          injectStatus: inject.status,
          injectSql,
          exitStatus: push.status,
          stdout: push.stdout,
          stderr: push.stderr,
          historyRows: rowsFromQuery(historyAfterFail),
          objectsPresent,
          probe: { ...probe, file },
          securityPostconditionsOk: objectsPresent === true && fingerprintObserved && typeof fingerprintObserved === "object",
          fingerprint,
          digest: FROZEN_DIGESTS[file],
          onDiskDigest: FROZEN_DIGESTS[file],
          originalSqlError: `${push.stderr || ""}\n${push.stdout || ""}`.trim() || null,
          disposableIdentityVerified:
            evidence.projectRef === APPROVED_DISPOSABLE_PROJECT_REF &&
            evidence.host === APPROVED_DISPOSABLE_HOST,
          productionIdentityRejected: evidence.projectRef !== PRODUCTION_REF,
          cliVersion: cli.version,
          projectRef: evidence.projectRef,
          host: evidence.host,
          stagedMigrations: staged,
        };
        const authRecord = createRepairAuthorizationRecord({
          migrationIdentity: {
            file,
            version,
            digest: FROZEN_DIGESTS[file],
            destName: timestampFilenameFor(file),
          },
          initialPush: {
            status: push.status,
            exitStatus: push.status,
            stdoutSha256: hashedPushOut.sha256,
            stderrSha256: hashedPushErr.sha256,
            stdoutByteLength: hashedPushOut.byteLength,
            stderrByteLength: hashedPushErr.byteLength,
            classification,
          },
          fingerprint: {
            expectedSha256: expectedFingerprintSha256(file),
            observedSha256: fingerprintCanonicalSha256(fingerprintObserved),
            expected: expectedFingerprint,
            observed: fingerprintObserved,
            fingerprintAfterCommitFailedHistory,
          },
          repairGate: { input: gateInput },
        });
        // gateCalls: qualify-level repair_gate_evaluated only (GATE_CALLS_BOUNDARY).
        runnerCounters.gateCalls += 1;
        evaluateRepairSafetyGate(gateInput);
        recordRunnerEvent("repair_gate_evaluated", { phase: "repair_gate" });
        const decided = await runRepairSafetyThenMaybeRepair({
          gateInput,
          frozenTarget: frozenTargetBuilt.target,
          cleanup: () => {
            runnerCounters.cleanupCalls += 1;
            recordRunnerEvent("cleanup_started", { phase: "cleanup" });
            const cleanupResult = runGatedRemoteSqlText(
              isolated.workdir,
              `remove-inject-${version}.sql`,
              REMOVE_HISTORY_INJECT_SQL,
            );
            recordRunnerEvent("cleanup_completed", {
              phase: "cleanup",
              processResult: {
                ...cleanupResult,
                command: "gated-remote-sql-text remove-history-inject",
              },
            });
            const encodedCleanup = encodeIsolatedPsqlProcessBytes(cleanupResult);
            authRecord.poisonCleanup = {
              status: cleanupResult.status,
              proven: cleanupResult.status === 0,
              stdoutSha256: encodedCleanup.stdoutSha256,
              stderrSha256: encodedCleanup.stderrSha256,
              stdoutByteLength: encodedCleanup.stdoutByteLength,
              stderrByteLength: encodedCleanup.stderrByteLength,
              stdoutBase64: encodedCleanup.stdoutBase64,
              stderrBase64: encodedCleanup.stderrBase64,
            };
            return cleanupResult;
          },
          verifyPoisonAbsent: async () => {
            runnerCounters.poisonProbeCalls += 1;
            recordRunnerEvent("poison_probe_started", { phase: "poison_probe" });
            const poisonProbe = runIsolatedPoisonPsqlQuery({
              frozenTarget: frozenTargetBuilt.target,
              sql: POISON_ABSENT_PROBE_SQL,
            });
            const preserved = preserveOriginalProcessStdout(poisonProbe);
            const processResult = preserved.ok ? preserved.preserved : poisonProbe;
            const hashedBeforeParse = hashOriginalStdout(
              processResult.originalStdout ?? processResult.stdout ?? "",
            );
            const parsed = parseExactOriginalJsonObject(processResult);
            const evaluated = evaluateOriginalPoisonProcessResult(processResult, {
              frozenTarget: frozenTargetBuilt.target,
            });
            const encoded = encodeIsolatedPsqlProcessBytes(processResult);
            const envelope = parsed.ok
              ? exactPoisonEnvelopeFromOriginal(parsed.value)
              : { ok: false, row: null };
            authRecord.poisonAbsenceQuery = {
              ...encoded,
              stdoutSha256: hashedBeforeParse.sha256,
              stdoutByteLength: hashedBeforeParse.byteLength,
              parsedEnvelope: envelope.ok ? envelope.row : null,
              live: evaluated.live || (envelope.ok ? {
                current_database: envelope.row.current_database,
                current_user: envelope.row.current_user,
                provenance: "original_query_output",
              } : null),
              poisonPresent: evaluated.poisonPresent,
              stdoutPreservedBeforeTransform: parsed.raw?.stdoutPreservedBeforeTransform === true
                || preserved.ok === true,
              payloadByteRange: parsed.raw?.payloadByteRange || encoded.payloadByteRange,
              framingLfByteRange: parsed.raw?.framingLfByteRange || encoded.framingLfByteRange,
            };
            authRecord.targetBinding = {
              ok: evaluated.ok === true,
              live: evaluated.live || null,
              frozenTarget: frozenTargetBuilt.target,
              fieldComparisons: encodeTargetBindingFieldComparisons({
                live: evaluated.live || {},
                frozenTarget: frozenTargetBuilt.target,
              }),
            };
            recordRunnerEvent("poison_probe_completed", {
              phase: "poison_probe",
              processResult: {
                ...processResult,
                command: "isolated-psql poison-absent-probe",
              },
            });
            recordRunnerEvent("target_binding_verified", { phase: "target_binding" });
            const pre = assertRepairAuthorizationPreRepairComplete(authRecord);
            if (!pre.ok) {
              authRecord.hold = pre;
              return {
                status: 1,
                stdout: "",
                stderr: pre.reason,
                queryError: pre.reason,
              };
            }
            return processResult;
          },
          repair: async () => {
            const poisonQuery = await runDbQuery({
              bin: cli.bin,
              workdir: isolated.workdir,
              help: queryHelp,
              sql: CATALOG_FINGERPRINT_SQL,
            });
            fingerprintAfterPoisonCleanup = finalizeFingerprintCapture(
              collectPhaseFingerprint(
                file,
                poisonQuery,
                FULL_FINGERPRINT_PHASES.AFTER_POISON_CLEANUP,
              ),
              { expected: expectedFingerprint, preRepairObserved: fingerprintObserved },
            );
            poisonFingerprintEval = evaluatePostPoisonFullFingerprint({
              file,
              capture: fingerprintAfterPoisonCleanup,
              expected: expectedFingerprint,
              preRepairObserved: fingerprintObserved,
            });
            if (!poisonFingerprintEval.ok) {
              return {
                status: 1,
                stdout: "",
                stderr: poisonFingerprintEval.hold || POST_POISON_FULL_FINGERPRINT_HOLD,
              };
            }
            const allowRepair = assertRunnerEventsAllowRepair(recorder.snapshot());
            if (!allowRepair.ok) {
              authRecord.hold = allowRepair;
              return {
                status: 1,
                stdout: "",
                stderr: allowRepair.reason,
              };
            }
            runnerCounters.repairCalls += 1;
            recordRunnerEvent("repair_started", {
              phase: "repair",
              commandIdentity: "supabase migration repair --status applied --db-url [REDACTED] --workdir [ISOLATED] --yes",
            });
            const repairResult = runFilenameVersionRepair({
              bin: cli.bin,
              version,
              workdir: isolated.workdir,
              help: repairHelp,
            });
            recordRunnerEvent("repair_completed", {
              phase: "repair",
              processResult: repairResult,
            });
            return repairResult;
          },
        });
        const callbackOrder = [
          decided.cleanupCalls > 0 ? "cleanup" : null,
          decided.verifyCalls > 0 ? "verify" : null,
          decided.repairCalls > 0 ? "repair" : null,
        ].filter(Boolean);
        authRecord.repairGate = {
          ...(authRecord.repairGate || {}),
          input: gateInput,
          result: decided.gate,
          counters: {
            repairCalls: decided.repairCalls,
            cleanupCalls: decided.cleanupCalls,
            verifyCalls: decided.verifyCalls,
            dbPushCalls: decided.dbPushCalls,
            continuationCalls: decided.continuationCalls,
          },
          callbackOrder,
        };
        authRecord.repair = {
          attempted: decided.repairAttempted === true,
          status: decided.repair?.status ?? null,
          repairCalls: decided.repairCalls,
          callbackOrder,
        };
        if (authRecord.hold) {
          evidence.status = "HOLD";
          evidence.verdict = FILE_BASED_RUNNER_VERDICTS.HOLD;
          evidence.limitation = authRecord.hold.reason || REPAIR_AUTHORIZATION_HOLD;
          evidence.repairAuthorizationRecords.push({
            ...authRecord,
            writtenBeforeNextMigration: false,
          });
          evidence.runnerEventStreams[file] = recorder.snapshot();
          evidence.runnerCountersByFile[file] = { ...runnerCounters };
          break;
        }
        if (fingerprintAfterPoisonCleanup == null && decided.cleanupProven) {
          const poisonQuery = await runDbQuery({
            bin: cli.bin,
            workdir: isolated.workdir,
            help: queryHelp,
            sql: CATALOG_FINGERPRINT_SQL,
          });
          fingerprintAfterPoisonCleanup = finalizeFingerprintCapture(
            collectPhaseFingerprint(
              file,
              poisonQuery,
              FULL_FINGERPRINT_PHASES.AFTER_POISON_CLEANUP,
            ),
            { expected: expectedFingerprint, preRepairObserved: fingerprintObserved },
          );
        }
        const step = {
          file,
          destName: timestampFilenameFor(file),
          version,
          digest: FROZEN_DIGESTS[file],
          staged,
          stagingPreflight,
          inject: { status: inject.status },
          push,
          classification,
          repairSafety: decided.gate,
          objectsPresent,
          historyAfterFail: rowsFromQuery(historyAfterFail),
          fingerprintExpectedFrozen,
          fingerprintAfterCommitFailedHistory,
          fingerprintBeforeRepair: fingerprint,
          fingerprintAfterPoisonCleanup,
          poisonFingerprintEval,
          repair: decided.repair,
          repairAttempted: decided.repairAttempted,
          continuation: decided.continuation,
        };
        const holdSequence = (limitation, extra = {}) => {
          evidence.sequence.push({
            ...step,
            historyAfterRepair: extra.historyAfterRepair ?? null,
            fingerprintAfterRepair: extra.fingerprintAfterRepair ?? null,
            fingerprintAfterRetryNoPending: extra.fingerprintAfterRetryNoPending ?? null,
            fingerprintAfterCleanContinuation: extra.fingerprintAfterCleanContinuation ?? null,
            retry: extra.retry ?? null,
            retryStaged: extra.retryStaged ?? null,
            retryPreflight: extra.retryPreflight ?? null,
            postRepairFingerprintEval: extra.postRepairFingerprintEval ?? null,
            postRetryFingerprintEval: extra.postRetryFingerprintEval ?? null,
            postContinuationFingerprintEval: extra.postContinuationFingerprintEval ?? null,
          });
          evidence.status = "HOLD";
          evidence.verdict = FILE_BASED_RUNNER_VERDICTS.HOLD;
          evidence.limitation = limitation;
          evidence.originalSqlError = decided.gate.originalSqlError;
        };
        if (poisonFingerprintEval && !poisonFingerprintEval.ok) {
          holdSequence(poisonFingerprintEval.hold || POST_POISON_FULL_FINGERPRINT_HOLD);
          break;
        }
        if (!decided.repairAuthorized || decided.continuation === false) {
          holdSequence(
            decided.repairAuthorized
              ? "HOLD: repair authorized but repair command failed after poison cleanup; no continuation"
              : (decided.gate.hold || REPAIR_SAFETY_HOLD),
          );
          break;
        }
        const historyAfterRepair = await runDbQuery({
          bin: cli.bin,
          workdir: isolated.workdir,
          help: queryHelp,
          sql: READ_SCHEMA_MIGRATIONS_SQL,
        });
        const fingerprintAfterRepairQuery = await runDbQuery({
          bin: cli.bin,
          workdir: isolated.workdir,
          help: queryHelp,
          sql: CATALOG_FINGERPRINT_SQL,
        });
        const fingerprintAfterRepair = finalizeFingerprintCapture(
          collectPhaseFingerprint(
            file,
            fingerprintAfterRepairQuery,
            FULL_FINGERPRINT_PHASES.AFTER_SUCCESSFUL_REPAIR,
          ),
          { expected: expectedFingerprint, preRepairObserved: fingerprintObserved },
        );
        const postRepairFingerprintEval = evaluatePostRepairFullFingerprint({
          file,
          capture: fingerprintAfterRepair,
          expected: expectedFingerprint,
          preRepairObserved: fingerprintObserved,
        });
        const afterRepairInv = await runDbQuery({
          bin: cli.bin,
          workdir: isolated.workdir,
          help: queryHelp,
          sql: INVENTORY_CAPTURE_SQL,
        });
        evidence.inventories[INVENTORY_PHASES.AFTER_REPAIR][file] = labelInventoryCapture({
          phase: INVENTORY_PHASES.AFTER_REPAIR,
          file,
          body: inventoryFromQuery(afterRepairInv.stdout),
        });
        if (!postRepairFingerprintEval.ok) {
          holdSequence(postRepairFingerprintEval.hold || POST_REPAIR_FULL_FINGERPRINT_HOLD, {
            historyAfterRepair: rowsFromQuery(historyAfterRepair),
            fingerprintAfterRepair,
            postRepairFingerprintEval,
          });
          break;
        }
        const destA = f10CheckpointDestFor(args.evidenceOut, file, version, "a")
          || path.join(isolated.workdir, `f10-checkpoint-a-${version}-${String(file).replace(/\.sql$/, "")}.json`);
        const destB = f10CheckpointDestFor(args.evidenceOut, file, version, "b")
          || path.join(isolated.workdir, `f10-checkpoint-b-${version}-${String(file).replace(/\.sql$/, "")}.json`);
        const persistA = persistCheckpointA({
          dest: destA,
          record: buildCheckpointARecord({
            file,
            version,
            repairProcessResult: {
              command: "supabase migration repair --status applied --db-url [REDACTED] --workdir [ISOLATED] --yes",
              ...(decided.repair || {}),
            },
            eventStream: recorder.snapshot(),
            runnerCounters,
          }),
        });
        if (!persistA.ok || persistA.verified !== true) {
          holdSequence(persistA.reason || F10_CHECKPOINT_HOLD, {
            historyAfterRepair: rowsFromQuery(historyAfterRepair),
            fingerprintAfterRepair,
            postRepairFingerprintEval,
          });
          evidence.runnerEventStreams[file] = recorder.snapshot();
          evidence.runnerCountersByFile[file] = { ...runnerCounters };
          break;
        }
        recordRunnerEvent("checkpoint_a_persisted", {
          phase: "checkpoint_a",
          process: {
            commandIdentity: "atomic-checkpoint-a-write",
            status: 0,
            signal: null,
            timeout: false,
            stdoutByteLength: persistA.bytes,
            stderrByteLength: 0,
            stdoutSha256: persistA.sha256,
            stderrSha256: sha256Utf8Qualify(""),
          },
        });
        const verifiedABeforeRetry = verifyPersistedCheckpointA(destA, {
          sha256: persistA.sha256,
          bytes: persistA.bytes,
        });
        if (!verifiedABeforeRetry.ok) {
          holdSequence(verifiedABeforeRetry.reason || F10_CHECKPOINT_HOLD, {
            historyAfterRepair: rowsFromQuery(historyAfterRepair),
            fingerprintAfterRepair,
            postRepairFingerprintEval,
          });
          evidence.runnerEventStreams[file] = recorder.snapshot();
          evidence.runnerCountersByFile[file] = { ...runnerCounters };
          break;
        }
        const retryStaged = syncIsolatedMigrationsThrough(isolated, file);
        const historyBeforeRetry = await queryHistory();
        const retryPreflight = assertPrefixCompleteSinglePendingStaging({
          workdir: isolated.workdir,
          currentFile: file,
          historyResult: historyBeforeRetry,
          cliVersion: cli.version,
          phase: "retry",
        });
        const allowRetry = assertRunnerEventsAllowRetry(recorder.snapshot());
        if (!allowRetry.ok) {
          holdSequence(allowRetry.reason, {
            historyAfterRepair: rowsFromQuery(historyAfterRepair),
            fingerprintAfterRepair,
            postRepairFingerprintEval,
          });
          evidence.runnerEventStreams[file] = recorder.snapshot();
          evidence.runnerCountersByFile[file] = { ...runnerCounters };
          break;
        }
        runnerCounters.retryDbPushCalls += 1;
        recordRunnerEvent("retry_started", {
          phase: "retry",
          commandIdentity: "supabase db push --db-url [REDACTED] --workdir [ISOLATED] --yes --skip-vault",
        });
        const retry = runDbPushCandidate({
          bin: cli.bin,
          workdir: isolated.workdir,
          help: pushHelp,
        });
        recordRunnerEvent("retry_completed", {
          phase: "retry",
          processResult: retry,
        });
        const fingerprintAfterRetryQuery = await runDbQuery({
          bin: cli.bin,
          workdir: isolated.workdir,
          help: queryHelp,
          sql: CATALOG_FINGERPRINT_SQL,
        });
        const fingerprintAfterRetryNoPending = finalizeFingerprintCapture(
          collectPhaseFingerprint(
            file,
            fingerprintAfterRetryQuery,
            FULL_FINGERPRINT_PHASES.AFTER_RETRY_NO_PENDING,
          ),
          {
            expected: expectedFingerprint,
            preRepairObserved: fingerprintObserved,
            postRepairObserved: fingerprintAfterRepair.fingerprint,
          },
        );
        const postRetryFingerprintEval = evaluatePostRetryFullFingerprint({
          file,
          capture: fingerprintAfterRetryNoPending,
          expected: expectedFingerprint,
          preRepairObserved: fingerprintObserved,
          postRepairObserved: fingerprintAfterRepair.fingerprint,
        });
        const afterRetryInv = await runDbQuery({
          bin: cli.bin,
          workdir: isolated.workdir,
          help: queryHelp,
          sql: INVENTORY_CAPTURE_SQL,
        });
        evidence.inventories[INVENTORY_PHASES.AFTER_RETRY][file] = labelInventoryCapture({
          phase: INVENTORY_PHASES.AFTER_RETRY,
          file,
          body: inventoryFromQuery(afterRetryInv.stdout),
        });
        const retryPending = Array.isArray(retryPreflight?.pending) ? retryPreflight.pending : [];
        if (!postRetryFingerprintEval.ok || retryPending.length > 0) {
          holdSequence(
            retryPending.length > 0
              ? POST_RETRY_FULL_FINGERPRINT_HOLD
              : (postRetryFingerprintEval.hold || POST_RETRY_FULL_FINGERPRINT_HOLD),
            {
              historyAfterRepair: rowsFromQuery(historyAfterRepair),
              fingerprintAfterRepair,
              fingerprintAfterRetryNoPending,
              postRepairFingerprintEval,
              postRetryFingerprintEval,
              retryStaged,
              retryPreflight,
              retry,
            },
          );
          evidence.runnerEventStreams[file] = recorder.snapshot();
          evidence.runnerCountersByFile[file] = { ...runnerCounters };
          break;
        }
        recordRunnerEvent("post_retry_fingerprint_collected", { phase: "post_retry_fingerprint" });
        const persistB = persistCheckpointB({
          dest: destB,
          record: buildCheckpointBRecord({
            file,
            version,
            retryProcessResult: {
              command: "supabase db push --db-url [REDACTED] --workdir [ISOLATED] --yes --skip-vault",
              ...retry,
            },
            postRetryProof: {
              ok: true,
              fingerprint: postRetryFingerprintEval,
              pending: retryPending,
            },
            checkpointA: persistA,
            eventStream: recorder.snapshot(),
            runnerCounters,
          }),
        });
        if (!persistB.ok || persistB.verified !== true) {
          holdSequence(persistB.reason || F10_CHECKPOINT_HOLD, {
            historyAfterRepair: rowsFromQuery(historyAfterRepair),
            fingerprintAfterRepair,
            fingerprintAfterRetryNoPending,
            postRepairFingerprintEval,
            postRetryFingerprintEval,
            retryStaged,
            retryPreflight,
            retry,
          });
          evidence.runnerEventStreams[file] = recorder.snapshot();
          evidence.runnerCountersByFile[file] = { ...runnerCounters };
          break;
        }
        const stillA = verifyPersistedCheckpointA(destA, {
          sha256: persistA.sha256,
          bytes: persistA.bytes,
        });
        const verifiedB = verifyPersistedCheckpointB(destB, {
          sha256: persistB.sha256,
          bytes: persistB.bytes,
        });
        if (!stillA.ok || !verifiedB.ok) {
          holdSequence(
            stillA.reason || verifiedB.reason || F10_CHECKPOINT_HOLD,
            {
              historyAfterRepair: rowsFromQuery(historyAfterRepair),
              fingerprintAfterRepair,
              fingerprintAfterRetryNoPending,
              postRepairFingerprintEval,
              postRetryFingerprintEval,
              retryStaged,
              retryPreflight,
              retry,
            },
          );
          evidence.runnerEventStreams[file] = recorder.snapshot();
          evidence.runnerCountersByFile[file] = { ...runnerCounters };
          break;
        }
        recordRunnerEvent("checkpoint_b_persisted", {
          phase: "checkpoint_b",
          process: {
            commandIdentity: "atomic-checkpoint-b-write",
            status: 0,
            signal: null,
            timeout: false,
            stdoutByteLength: persistB.bytes,
            stderrByteLength: 0,
            stdoutSha256: persistB.sha256,
            stderrSha256: sha256Utf8Qualify(""),
          },
        });
        const isLastFile = file === F3_FORWARD_FILES[F3_FORWARD_FILES.length - 1];
        let fingerprintAfterCleanContinuation = null;
        let postContinuationFingerprintEval = null;
        authRecord.retry = {
          status: retry.status,
          staged: retryStaged,
          preflight: retryPreflight,
        };
        authRecord.continuation = {
          allowed: false,
          reason: isLastFile ? "last-file" : "pending-durable-authorize",
        };
        authRecord.postRepairFingerprint = {
          sha256: fingerprintAfterRepair?.sha256 ?? null,
          ok: postRepairFingerprintEval?.ok === true,
          capture: fingerprintAfterRepair,
          eval: postRepairFingerprintEval,
        };
        authRecord.postRetryFingerprint = {
          sha256: fingerprintAfterRetryNoPending?.sha256 ?? null,
          ok: postRetryFingerprintEval?.ok === true,
          capture: fingerprintAfterRetryNoPending,
          eval: postRetryFingerprintEval,
        };
        const repairProcessResult = encodeSanitizedProcessResult(decided.repair || {});
        const retryProcessResult = encodeSanitizedProcessResult(retry);
        const poisonProcessResult = encodeSanitizedProcessResult({
          command: "isolated-psql poison-absent-probe",
          status: authRecord.poisonAbsenceQuery?.status ?? 0,
          signal: authRecord.poisonAbsenceQuery?.signal ?? null,
          timeout: authRecord.poisonAbsenceQuery?.timeout === true,
          stdout: "",
          stderr: "",
          error: null,
        });
        const preContinuationRecord = {
          schema_version: F9_PRE_CONTINUATION_SCHEMA_VERSION,
          migrationIdentity: { file, version, sourceLabel: "F3_FORWARD", destName: timestampFilenameFor(file) },
          repairProcessResult,
          retryProcessResult,
          poisonProcessResult,
          originalPoison: {
            ...poisonProcessResult,
            metadata: authRecord.poisonAbsenceQuery || null,
          },
          targetBinding: authRecord.targetBinding,
          runnerCounters: { ...runnerCounters },
          gateCounters: {
            repairCalls: decided.repairCalls,
            cleanupCalls: decided.cleanupCalls,
            verifyCalls: decided.verifyCalls,
            dbPushCalls: decided.dbPushCalls,
            continuationCalls: decided.continuationCalls,
          },
          eventStream: recorder.snapshot(),
          repairAuthorization: authRecord,
          finalMigration: isLastFile,
          nextMigration: isLastFile ? null : true,
          inventedLaterContinuation: false,
        };
        const persisted = durableWriteRepairAuthorization(evidence, authRecord, args.evidenceOut, {
          preContinuationRecord,
        });
        if (!persisted.ok) {
          holdSequence(persisted.reason || F9_RUNNER_EVENT_HOLD, {
            historyAfterRepair: rowsFromQuery(historyAfterRepair),
            fingerprintAfterRepair,
            fingerprintAfterRetryNoPending,
            postRepairFingerprintEval,
            postRetryFingerprintEval,
            retryStaged,
            retryPreflight,
            retry,
            repairAuthorization: authRecord,
          });
          evidence.runnerEventStreams[file] = recorder.snapshot();
          evidence.runnerCountersByFile[file] = { ...runnerCounters };
          break;
        }
        runnerCounters.durableRecordWrites += 1;
        recordRunnerEvent("pre_continuation_record_persisted", {
          phase: "pre_continuation",
          process: {
            commandIdentity: "atomic-pre-continuation-write",
            status: 0,
            signal: null,
            timeout: false,
            stdoutByteLength: persisted.bytes ?? 0,
            stderrByteLength: 0,
            stdoutSha256: persisted.sha256 || sha256Utf8Qualify(""),
            stderrSha256: sha256Utf8Qualify(""),
          },
        });
        const authorized = evaluateF9ContinuationAuthorization({
          events: recorder.snapshot(),
          record: { ...preContinuationRecord, eventStream: recorder.snapshot() },
          persistResult: persisted,
          file,
        });
        if (!authorized.ok || authorized.continuationAuthorized !== true) {
          holdSequence(authorized.reason || F9_RUNNER_EVENT_HOLD, {
            historyAfterRepair: rowsFromQuery(historyAfterRepair),
            fingerprintAfterRepair,
            fingerprintAfterRetryNoPending,
            postRepairFingerprintEval,
            postRetryFingerprintEval,
            retryStaged,
            retryPreflight,
            retry,
            repairAuthorization: authRecord,
          });
          evidence.runnerEventStreams[file] = recorder.snapshot();
          evidence.runnerCountersByFile[file] = { ...runnerCounters };
          break;
        }
        runnerCounters.continuationAuthorizationCalls += 1;
        recordRunnerEvent("continuation_authorized", { phase: "continuation_authorized" });
        authRecord.continuation = {
          allowed: isLastFile ? false : true,
          reason: isLastFile ? "last-file" : null,
          finalMigration: isLastFile,
          inventedLaterContinuation: false,
        };
        if (!isLastFile) {
          runnerCounters.continuationCalls += 1;
          recordRunnerEvent("continuation_started", { phase: "continuation" });
          const continuationQuery = await runDbQuery({
            bin: cli.bin,
            workdir: isolated.workdir,
            help: queryHelp,
            sql: CATALOG_FINGERPRINT_SQL,
          });
          fingerprintAfterCleanContinuation = finalizeFingerprintCapture(
            collectPhaseFingerprint(
              file,
              continuationQuery,
              FULL_FINGERPRINT_PHASES.AFTER_CLEAN_CONTINUATION,
            ),
            {
              expected: expectedFingerprint,
              preRepairObserved: fingerprintObserved,
              postRepairObserved: fingerprintAfterRepair.fingerprint,
            },
          );
          postContinuationFingerprintEval = evaluatePostContinuationFullFingerprint({
            file,
            capture: fingerprintAfterCleanContinuation,
            expected: expectedFingerprint,
            preRepairObserved: fingerprintObserved,
            postRepairObserved: fingerprintAfterRepair.fingerprint,
          });
          const afterContInv = await runDbQuery({
            bin: cli.bin,
            workdir: isolated.workdir,
            help: queryHelp,
            sql: INVENTORY_CAPTURE_SQL,
          });
          evidence.inventories[INVENTORY_PHASES.AFTER_CONTINUATION][file] = labelInventoryCapture({
            phase: INVENTORY_PHASES.AFTER_CONTINUATION,
            file,
            body: inventoryFromQuery(afterContInv.stdout),
          });
          if (!postContinuationFingerprintEval.ok) {
            holdSequence(postContinuationFingerprintEval.hold || POST_CONTINUATION_FULL_FINGERPRINT_HOLD, {
              historyAfterRepair: rowsFromQuery(historyAfterRepair),
              fingerprintAfterRepair,
              fingerprintAfterRetryNoPending,
              fingerprintAfterCleanContinuation,
              postRepairFingerprintEval,
              postRetryFingerprintEval,
              postContinuationFingerprintEval,
              retryStaged,
              retryPreflight,
              retry,
            });
            break;
          }
          recordRunnerEvent("continuation_completed", { phase: "continuation" });
        }
        evidence.runnerEventStreams[file] = recorder.snapshot();
        evidence.runnerCountersByFile[file] = { ...runnerCounters };
        evidence.runnerCounters = Object.fromEntries(
          Object.keys(runnerCounters).map((key) => [
            key,
            (evidence.runnerCounters?.[key] || 0) + runnerCounters[key],
          ]),
        );
        evidence.sequence.push({
          ...step,
          historyAfterRepair: rowsFromQuery(historyAfterRepair),
          fingerprintAfterRepair,
          fingerprintAfterRetryNoPending,
          fingerprintAfterCleanContinuation,
          postRepairFingerprintEval,
          postRetryFingerprintEval,
          postContinuationFingerprintEval,
          retryStaged,
          retryPreflight,
          retry,
          repairAuthorization: authRecord,
          runnerCounters: { ...runnerCounters },
          runnerEvents: recorder.snapshot(),
          preContinuation: {
            dest: persisted.dest,
            sha256: persisted.sha256,
            bytes: persisted.bytes,
            finalMigration: isLastFile,
            inventedLaterContinuation: false,
          },
          f10Checkpoints: {
            A: { dest: persistA.dest, sha256: persistA.sha256, bytes: persistA.bytes },
            B: { dest: persistB.dest, sha256: persistB.sha256, bytes: persistB.bytes },
          },
        });
      }
    }

    if (evidence.status === "RUNNING") {
      const listedAfter = await runMigrationList({
        bin: cli.bin,
        workdir: isolated.workdir,
        help: listHelp,
      });
      evidence.migrationListAfter = listedAfter;
      let chronologySeq = 0;
      const poisonFinal = runIsolatedPoisonPsqlQuery({
        frozenTarget: frozenTargetBuilt.target,
        sql: POISON_ABSENT_PROBE_SQL,
      });
      evidence.poisonPsqlTransport = {
        argv: poisonFinal.argv || [...PSQL_POISON_QUERY_ARGV],
        psqlVersion: poisonFinal.psqlVersion || null,
        envKeys: poisonFinal.envKeys || null,
        transport: poisonFinal.transport || "isolated-psql",
        must_local_psql_proof_on_17_6: MUST_LOCAL_PSQL_PROOF_ON_17_6,
      };
      const poisonSeq = chronologySeq += 1;
      const preservedPoison = preserveOriginalProcessStdout(poisonFinal);
      evidence.finalPoisonProbe = evaluateFinalPoisonAbsence(
        preservedPoison.ok ? preservedPoison.preserved : poisonFinal,
        { frozenTarget: frozenTargetBuilt.target },
      );
      if (args.sequenceF3 && evidence.sequence.length === F3_FORWARD_FILES.length) {
        if (!evidence.finalPoisonProbe?.ok || evidence.finalPoisonProbe.poisonPresent !== false) {
          evidence.status = "HOLD";
          evidence.verdict = FILE_BASED_RUNNER_VERDICTS.HOLD;
          evidence.limitation = evidence.finalPoisonProbe?.reason || FINAL_POISON_ABSENCE_HOLD;
          evidence.claims.dbPush = FINAL_POISON_ABSENCE_HOLD;
        } else {
        const historyFinal = await runDbQuery({
          bin: cli.bin,
          workdir: isolated.workdir,
          help: queryHelp,
          sql: READ_SCHEMA_MIGRATIONS_SQL,
        });
        const historySeq = chronologySeq += 1;
        const historyRows = rowsFromQuery(historyFinal);
        const historyVerified = Array.isArray(historyRows) && historyRows.length === F3_FORWARD_FILES.length;
        if (!historyVerified) {
          evidence.status = "HOLD";
          evidence.verdict = FILE_BASED_RUNNER_VERDICTS.HOLD;
          evidence.limitation = `HOLD: FINAL inventory history must contain six rows, saw ${Array.isArray(historyRows) ? historyRows.length : 0}`;
        } else {
        const finalInv = await runDbQuery({
          bin: cli.bin,
          workdir: isolated.workdir,
          help: queryHelp,
          sql: INVENTORY_CAPTURE_SQL,
        });
        const finalSeq = chronologySeq += 1;
        evidence.inventories[INVENTORY_PHASES.FINAL] = labelInventoryCapture({
          phase: INVENTORY_PHASES.FINAL,
          body: inventoryFromQuery(finalInv.stdout),
        });
        evidence.finalInventoryChronology = assertFinalInventoryChronology({
          inventories: evidence.inventories,
          historyRows,
          recognition: evidence.recognition,
          poisonPresent: evidence.finalPoisonProbe.poisonPresent,
          poisonVerified: evidence.finalPoisonProbe.ok === true && evidence.finalPoisonProbe.poisonPresent === false,
          historyVerified: true,
          poisonSequence: poisonSeq,
          historySequence: historySeq,
          finalInventorySequence: finalSeq,
        });
        if (!evidence.finalInventoryChronology?.ok) {
          evidence.status = "HOLD";
          evidence.verdict = FILE_BASED_RUNNER_VERDICTS.HOLD;
          evidence.limitation = evidence.finalInventoryChronology?.reason || "HOLD: FINAL inventory chronology failed";
        } else {
          evidence.status = FILE_BASED_RUNNER_VERDICTS.QUALIFICATION_PASS;
          evidence.verdict = FILE_BASED_RUNNER_VERDICTS.QUALIFICATION_PASS;
          evidence.claims.dbPush =
            "FILE-BASED RUNNER QUALIFICATION PASS — STUB/LIVE-PIN FLOOR LIMITATION; prior MECHANICS PASS SUPERSEDED; not production PASS; not clean replay PASS; not merge/deploy auth";
          evidence.claims.mechanicsPass = "SUPERSEDED";
          evidence.claims.productionApproval = "NOT CLAIMED";
          evidence.floorLabel = QUALIFICATION_FLOOR_LABEL;
        }
        }
        }
      } else if (!args.sequenceF3) {
        evidence.status = "GATED_SCAFFOLDING_READY — hosted sequence not requested";
        evidence.verdict = FILE_BASED_RUNNER_VERDICTS.HOLD;
      }
    }
  } catch (err) {
    evidence.status = String(evidence.status || "ERROR").startsWith("HOLD") ? evidence.status : err.code || "ERROR";
    evidence.error = sanitizeForLog(err.message);
    evidence.errorCode = err.code || null;
    if (!evidence.verdict) evidence.verdict = FILE_BASED_RUNNER_VERDICTS.HOLD;
  }

  evidence.fingerprintSchemaVersion = F3_FULL_FINGERPRINT_SCHEMA_VERSION;
  evidence.mustReverifyOn176 = MUST_REVERIFY_ON_17_6 === true;
  evidence.catalogV3_00123Supersession = CATALOG_V3_00123_SUPERSESSION;
  evidence.recursiveRuntimeClosure = {
    sha256: F3_FUNCTIONAL_RECURSIVE_CLOSURE.closure_sha256,
    missing: F3_FUNCTIONAL_RECURSIVE_CLOSURE.missing,
    unresolved: F3_FUNCTIONAL_RECURSIVE_CLOSURE.unresolved,
    runtime_read_missing: F3_FUNCTIONAL_RECURSIVE_CLOSURE.runtime_read_missing,
    unexplained_exclusions: F3_FUNCTIONAL_RECURSIVE_CLOSURE.unexplained_exclusions,
    uncommitted_functional_diffs: F3_FUNCTIONAL_RECURSIVE_CLOSURE.uncommitted_functional_diffs,
    hosted_tree_mismatches: F3_FUNCTIONAL_RECURSIVE_CLOSURE.hosted_tree_mismatches,
    closure_complete: F3_FUNCTIONAL_RECURSIVE_CLOSURE.closure_complete,
    independent_reference_source_sha256: F3_FUNCTIONAL_RECURSIVE_CLOSURE.independent_reference_source_sha256,
    required_runtime_read_inputs: F3_FUNCTIONAL_RECURSIVE_CLOSURE.required_runtime_read_inputs,
  };
  const json = JSON.stringify(sanitizeForLog(evidence), null, 2);
  console.log(json);
  if (args.evidenceOut) {
    const written = commitNestedThenOuterEvidence(args.evidenceOut, json);
    if (!written.ok) {
      evidence.status = "HOLD";
      evidence.verdict = FILE_BASED_RUNNER_VERDICTS.HOLD;
      evidence.ok = false;
      evidence.reason = written.reason || EVIDENCE_WRITE_HOLD;
      evidence.evidenceWrite = written;
      evidence.fingerprint_exact = false;
      console.log(JSON.stringify(sanitizeForLog({
        status: "HOLD",
        verdict: FILE_BASED_RUNNER_VERDICTS.HOLD,
        reason: written.reason || EVIDENCE_WRITE_HOLD,
        evidenceWrite: written,
      }), null, 2));
      process.exit(1);
    }
  }
  if (String(evidence.verdict) === FILE_BASED_RUNNER_VERDICTS.BLOCKED || evidence.status === "NOT_RUN") {
    process.exit(2);
  }
  if (String(evidence.status).startsWith("HOLD") || evidence.status === "ERROR" || evidence.verdict === FILE_BASED_RUNNER_VERDICTS.HOLD) {
    process.exit(1);
  }
  process.exit(0);
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  await main();
}
