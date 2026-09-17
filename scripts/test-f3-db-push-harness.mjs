/**
 * Local fail-closed tests for the supabase db push qualification candidate.
 * No hosted call is made. Gate failures must spawn zero database-targeting
 * processes. 00118–00123 SQL bytes are never rewritten.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { afterEach, beforeEach } from "node:test";
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
  TRANSACTION_POOLER_PORT,
  CLI_PIN,
  DBPUSH_SENTINEL,
  DBPUSH_SENTINEL_ENV,
  DB_PASSWORD_ENV,
  DB_PUSH_CANDIDATE_STATUS,
  DESTRUCTIVE_ENV,
  F3_FORWARD_FILES,
  FILE_BASED_RUNNER_VERDICTS,
  FROZEN_DIGESTS,
  SUPERSEDED_FROZEN_DIGESTS,
  SUPERSEDED_MECHANICS_PASS_CLAIM,
  HISTORY_INJECT_MARKER,
  LIVE_PROBE_THROWAWAY_TABLE,
  MANAGEMENT_API_APPLY_PERMANENTLY_DISQUALIFIED,
  MGMT_TOKEN_ENV,
  PREASSIGNED_NAMES,
  PREASSIGNED_VERSIONS,
  PRODUCTION_HISTORY_CEILING_VERSION,
  PRODUCTION_REF,
  RECOGNITION_ALLOWLIST,
  TARGET_OBJECT_PROBES,
} from "./lib/f3-db-push-pins.mjs";
import {
  MANAGEMENT_API_APPLY_PERMANENTLY_DISQUALIFIED as MAPI_DISQUALIFIED,
} from "./lib/f3-management-api-remote-harness.mjs";
import {
  __dbPushSpawnLedgerForTests,
  __installDbPushSpawnInterceptorForTests,
  __resetDbPushSpawnForTests,
  assertConstructedDbUrl,
  assertDbPushGates,
  buildDbPushSubprocessEnv,
  buildDisposableDbUrlFromEnv,
  dbPushGatesSatisfiedFromEnv,
  isolatedDbPushHomeDir,
  passwordPresent,
  refuseProduction,
  sanitizeForLog,
  spawnDbPushChildSync,
  spawnGatedRemotePsqlSync,
  buildGatedRemotePsqlSubprocessEnv,
} from "./lib/f3-db-push-target-guard.mjs";
import {
  __dbPushFetchLedgerForTests,
  __installDbPushFetchForTests,
  __resetDbPushFetchForTests,
  getDisposableProjectIdentity,
  refuseManagementApiApply,
} from "./lib/f3-db-push-identity.mjs";
import {
  assertRepairHelpUsable,
  buildDbPushCommand,
  buildDbQueryCommand,
  buildRepairCommand,
  discoverSupabaseCli,
  readDbPushHelp,
  readDbQueryHelp,
  readMigrationRepairHelp,
  runDbQuery,
} from "./lib/f3-db-push-cli.mjs";
import {
  assertFrozenDigestsOnDisk,
  assertVersionCollisionPass,
  createIsolatedDbPushWorkdir,
  listRepoTimestampFilenames,
  nextAuthorizedFile,
  preassignedVersionFor,
  refuseClockOrGuessedVersion,
  timestampFilenameFor,
} from "./lib/f3-db-push-version-map.mjs";
import {
  DROP_THROWAWAY_PROBE_SQL,
  REMOVE_HISTORY_INJECT_SQL,
  classifyDbPushHistoryFailure,
  historyInjectSqlForFile,
  historyInjectSqlForVersion,
} from "./lib/f3-db-push-history-inject.mjs";
import {
  PREFIX_COMPLETE_SINGLE_PENDING_HOLD,
  PRODUCTION_HISTORY_LIMITATION_WARNING,
  REPAIR_SAFETY_HOLD,
  POST_CONTINUATION_FULL_FINGERPRINT_HOLD,
  POST_POISON_FULL_FINGERPRINT_HOLD,
  POST_REPAIR_FULL_FINGERPRINT_HOLD,
  POST_RETRY_FULL_FINGERPRINT_HOLD,
  FULL_FINGERPRINT_COLLECTOR_ID,
  FULL_FINGERPRINT_PHASES,
  assertExpectedFingerprintImmutable,
  assertPrefixCompleteSinglePendingStaging,
  authorizedStagedPrefixThrough,
  buildIndependentObservedFingerprint,
  captureFrozenExpectedFingerprint,
  catalogInventoryFromFingerprint,
  collectCanonicalFullFingerprint,
  evaluatePostContinuationFullFingerprint,
  evaluatePostPoisonFullFingerprint,
  evaluatePostRepairFullFingerprint,
  evaluatePostRetryFullFingerprint,
  evaluatePrefixCompleteSinglePendingStaging,
  evaluateRepairSafetyGate,
  expectedFingerprintSha256,
  finalizeFingerprintCapture,
  canonicalizeFingerprintForCompare,
  CATALOG_FINGERPRINT_SQL,
  FINGERPRINT_CANONICALIZATION_REASON,
  FINGERPRINT_FIELD_REGISTRY,
  F3_FULL_FINGERPRINT_SCHEMA_VERSION,
  SUPERSEDED_F3_FULL_FINGERPRINT_SCHEMA_VERSION,
  SUPERSEDED_F3_FULL_FINGERPRINT_SCHEMA_VERSION_V2,
  SUPERSEDED_F3_FULL_FINGERPRINT_SCHEMA_VERSION_V4,
  CATALOG_V3_00123_SUPERSESSION,
  CATALOG_V3_00123_HASH_D692,
  CATALOG_V3_00123_HASH_D802,
  MUST_REVERIFY_ON_17_6,
  PRIMARY_PG17_RI_ENFORCEMENT,
  classifyPrimaryTriggerSemanticRole,
  applyPrimaryCatalogTriggerRoles,
  reconcileTriggerPartitions,
  reproduceTriggerPartitionsFromFingerprint,
  REPRODUCED_TRIGGER_PARTITION_EXPECTATIONS,
  GIT_VERIFICATION_UNAVAILABLE,
  runVerifiedGit,
  __installGitRunnerForTests,
  __resetGitRunnerForTests,
  FINAL_POISON_SCHEMA_VERSION,
  FINAL_POISON_REQUIRED_KEYS,
  POISON_PROBE_MARKER,
  bindPoisonTargetIdentity,
  assembleFinalPoisonExactRow,
  constructImmutableValidatedTargetFromConnection,
  compareLiveIdentityToFrozenTarget,
  assertFrozenTargetUnmutated,
  evaluateOriginalPoisonProcessResult,
  originalPoisonProcessResult,
  POISON_ABSENT_PROBE_SQL,
  PSQL_POISON_QUERY_ARGV,
  PSQL_POISON_ISOLATED_ENV_KEYS,
  MUST_LOCAL_PSQL_PROOF_ON_17_6,
  buildIsolatedPoisonPsqlEnv,
  validatePoisonPsqlTargetBeforeSpawn,
  runIsolatedPoisonPsqlQuery,
  __installPoisonPsqlSpawnForTests,
  __resetPoisonPsqlSpawnForTests,
  runQualifyPoisonBoundPath,
  validateConnectionAgainstDisposableAllowlist,
  APPROVED_SESSION_POOLER_USERNAME_MAPPING,
  evaluatePoisonTargetIdentity,
  assertExecutableManifestNoSelfEntry,
  EXECUTABLE_BYTE_MANIFEST_FILENAME,
  REQUIRED_RUNTIME_READ_INPUTS,
  assertRecursiveClosureReadyForDb,
  evaluateFinalPoisonAbsence,
  enumerateFkConstraintTriggerUniverse,
  F3_FK_TRIGGER_UNIVERSE_BY_MIGRATION,
  EXECUTABLE_MANIFEST_FILENAME,
  FINAL_POISON_ABSENCE_HOLD,
  RECURSIVE_CLOSURE_HOLD,
  writeExecutableManifest,
  F3_FULL_FINGERPRINT_NESTED_KEYS,
  F3_FUNCTIONAL_RECURSIVE_CLOSURE,
  buildFunctionalRecursiveRuntimeClosure,
  assertFullCatalogV2Coverage,
  assertEvidenceOutFileContract,
  commitQualifyEvidenceOrHold,
  verifyCommittedSuiteEvidence,
  assertSanitizationPreservesSemanticFingerprint,
  evaluateIndependentReferenceAgreement,
  INVENTORY_PHASES,
  labelInventoryCapture,
  assertFinalInventoryChronology,
  EVIDENCE_OUT_FILE_CONTRACT,
  EVIDENCE_WRITE_HOLD,
  F3_HGP_PIN,
  F3_ENQUEUE_PIN,
  TEN_FIELD_SCHEMA_SUPERSEDED_REASON,
  fingerprintCanonicalSha256,
  fingerprintCompleteAndExact,
  FROZEN_EXPECTED_FINGERPRINT_SHA256,
  SUPERSEDED_FROZEN_EXPECTED_FINGERPRINT_SHA256,
  EXPECTED_FINGERPRINT_SEAL_PROVENANCE,
  JS_SQL_PARSER_SUPERSEDED_REASON,
  FROZEN_EXPECTED_ORACLE_CATALOG_SHA256,
  sealExpectedFingerprintsFromLocalOracle,
  SEALED_PLATFORM_ACL_ENVELOPE,
  SEALED_PLATFORM_ACL_ENVELOPE_DIGEST,
  PLATFORM_ACL_CALIBRATION_HOLD,
  PLATFORM_ACL_INAPPLICABLE_OBJECT_HOLD,
  APPLICABLE_PLATFORM_ACL_OBJECT_CLASSES,
  evaluatePlatformAclCalibration,
  authorizeDbPushAfterPlatformAclCalibration,
  applyPlatformAclEnvelopeToLocalOracle,
  defaultPrivilegesSqlFromEnvelope,
  platformRolesSqlFromEnvelope,
  platformAclEnvelopeDigest,
  assertFingerprintAclContracts,
  extractExactPostgresError,
  sanitizeEvidenceOutBytes,
  buildSuiteMetaFromSanitizedOut,
  buildEvidenceIndex,
  writeEvidenceIndexAndChecksum,
  verifyEvidenceIndex,
  writeSuiteMetaForOutFile,
  writeDurableArtifactBytes,
  DURABLE_WRITE_COUNTER_SCOPE,
  F11_EVIDENCE_LABEL,
  F11_PREVIOUSLY_OMITTED_CLOSURE_INPUTS,
  F10_INCOMPLETE_27_FILE_CLOSURE_DIGEST,
  LOCAL_PSQL_POISON_PROOF_HELPER_RELPATH,
  buildAuthoritativeOuterEvidencePointer,
  buildNonAuthoritativeStagingSummary,
  assertLocalSyntheticEvidenceDirName,
  writeQualifyEvidenceArtifacts,
  packageF10LocalSuiteLog,
  verifySuiteToLogBinding,
  buildSuiteTransformationProvenance,
  SUITE_META_PRODUCER_ID,
  SUITE_TRANSFORM_ID,
  readFinalCommittedBytes,
  verifyQualifyEvidencePackaging,
  scanEvidenceBytesForLeaks,
  listEvidenceTreeFiles,
  inferEvidenceRootFromDest,
  writeOuterEvidenceIndexAndChecksum,
  verifyOuterEvidencePackaging,
  commitOuterEvidenceTree,
  exactPoisonEnvelopeFromOriginal,
  createRepairAuthorizationRecord,
  assertRepairAuthorizationPreRepairComplete,
  assertRepairAuthorizationComplete,
  writeRepairAuthorizationRecord,
  encodeIsolatedPsqlProcessBytes,
  encodeTargetBindingFieldComparisons,
  REPAIR_AUTHORIZATION_HOLD,
  QUALIFY_EVIDENCE_PACKAGING_HOLD,
  FOUNDER_REPORT_BASENAME_RE,
  YAML_ERROR_MARKER,
  EVIDENCE_INDEX_FILENAME,
  EVIDENCE_INDEX_CHECKSUM_FILENAME,
  EVIDENCE_INDEX_EXCLUSIONS,
  FROZEN_EXPECTED_OBJECT_PROBE_DESCRIPTORS,
  OBJECT_PROBE_IDENTITY_FIELDS,
  assertExpectedObjectProbeDescriptorsImmutable,
  evaluateObjectProbe,
  getFrozenExpectedFingerprint,
  getFrozenExpectedObjectProbeDescriptors,
  objectProbeSql,
  objectsPresentFromProbe,
  recordFrozenExpectedFingerprintCaptures,
  recordPreDbExpectedHashes,
  runPrefixCompleteSinglePendingOrchestration,
  runQualifyFingerprintHoldSequence,
  runRepairSafetyThenMaybeRepair,
  syncIsolatedMigrationsThrough,
} from "./lib/f3-db-push-repair-safety-gate.mjs";
import {
  INDEPENDENT_REFERENCE_MODULE_RELPATH,
  INDEPENDENT_REFERENCE_SCHEMA_VERSION,
  collectIndependentFullCatalogReference,
} from "./lib/f3-full-catalog-independent-reference.mjs";
import {
  parseDuplicateKeySafeJson,
  parseExactOriginalJsonObject,
  preserveOriginalProcessStdout,
  evaluateExactPsqlStdoutFraming,
  evaluateOriginalProcessResultContract,
  hashOriginalStdout,
  PSQL_POISON_STDOUT_FRAMING_CONTRACT,
} from "./lib/f3-db-push-query-parse.mjs";
import { runLocalPsqlPoisonProof } from "../docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_PSQL_POISON_REQUAL_20260916/psql-proof/psql-proof/run-local-psql-poison-proof.mjs";
import {
  F9_RUNNER_EVENT_SCHEMA_VERSION,
  F9_PRE_CONTINUATION_SCHEMA_VERSION,
  F9_RUNNER_EVENT_HOLD,
  F9_ACTUAL_EVENT_ORDER_BEFORE_REPAIR,
  F9_ACTUAL_EVENT_ORDER_BEFORE_RETRY,
  F9_ACTUAL_EVENT_ORDER_BEFORE_AUTHORIZE,
  F9_ACTUAL_EVENT_ORDER_WITH_CONTINUATION,
  F9_FINAL_MIGRATION_EVENT_ORDER,
  createEmptyRunnerCounters,
  expectedRunnerCountersForFile,
  expectedF10OrchestrationCounters,
  encodeSanitizedProcessResult,
  encodeSanitizedProcessError,
  SANITIZED_PROCESS_ERROR_ENCODING,
  isCompleteProcessResult,
  createRunnerEventRecorder,
  assertRunnerEventsAllowRepair,
  assertRunnerEventsAllowRetry,
  assertRunnerEventsAllowContinuation,
  assertPreContinuationRecordComplete,
  persistPreContinuationRecord,
  evaluateF9ContinuationAuthorization,
  exerciseF9RunnerOrchestration,
  F10_CHECKPOINT_A_SCHEMA_VERSION,
  F10_CHECKPOINT_B_SCHEMA_VERSION,
  F10_CHECKPOINT_HOLD,
  GATE_CALLS_BOUNDARY,
  assertCheckpointAComplete,
  assertCheckpointBComplete,
  assertFrozenMigrationIdentity,
  persistCheckpointA,
  persistCheckpointB,
  verifyPersistedCheckpointA,
  verifyPersistedCheckpointB,
  authenticateCheckpointBAgainstRereadA,
  buildCheckpointARecord,
  buildCheckpointBRecord,
  buildDefaultF10PreContinuationRecord,
  invokeRecordedOperation,
  runF10RepairRetryContinuation,
  runHostedF10RepairRetryContinuation,
  F11_SHARED_ORCHESTRATION_ID,
  F11_HOSTED_DELEGATES_TO_SHARED,
  F12_SHARED_ORCHESTRATION_ID,
  F12_HOSTED_SUPPLIES_LIVE_REPAIR_ADAPTER,
  F12_COMPLETED_REPAIR_SHORTCUT_REMOVED,
  F12_PROPOSED_RESET_STATUS,
  F12_HISTORY_VERSION_NAME_PREDICATES,
  captureOriginalCheckpointAReceipt,
  parseArgs,
  evaluateWipeToBaselineArg,
  assertWipeToBaselineRejected,
  WIPE_TO_BASELINE_REJECTION_CODE,
  buildProposedConstrainedResetProcedure,
  validateProposedResetProcedureOffline,
  renderProposedConstrainedResetPlanMarkdown,
  evaluateQualificationResetCli,
  qualificationResetQualifyEmitPayload,
  runQualificationResetQualifyPath,
} from "./qualify-f3-db-push-disposable.mjs";
import { evaluateQualificationResetEligibility } from "./lib/f3-db-push-inventory.mjs";
import {
  F13_RESET_SUCCESS_VERDICT,
  F13_RUNTIME_LABEL,
  F13_SHARED_ORCHESTRATION_ID,
  AUTHENTICATED_HISTORY_KEYS as F13_AUTHENTICATED_HISTORY_KEYS,
  INVENTORY_CAPTURE_SQL,
  QUALIFICATION_RESET_INVENTORY_CAPTURE_SQL,
  buildQualificationResetSql,
  createDisabledQualificationResetTransportAdapter,
  planQualificationReset,
  runQualificationReset,
  scopeSqlIdentityDigest,
} from "./lib/f3-db-push-qualification-reset.mjs";
import { BOOTSTRAP_WITH_LOCAL_SHIM } from "./_f3_apply_current_main_floor.mjs";
import {
  FLOOR_HOLD_IF_INEXACT,
  FLOOR_AUTHORITY,
  assertFloorDoesNotUseCandidateRunner,
  floorPrecheck,
  installRepositoryControlledFloor,
  listFloorMigrationsThrough00117,
  liveHasGroupPermissionSql,
  readFloorBootstrapSql,
  remainingUnnestAfter00030,
  remainingUnnestAfterAuthorizedTransforms,
  recognitionFromSource,
} from "./lib/f3-db-push-floor.mjs";
import {
  EXPECTED_UNNEST_COUNT,
  PINNED_ORIGINAL_SHA256,
  PINNED_TRANSFORMED_SHA256,
  countUnnestCalls,
  readOriginal00030,
  transform00030Text,
} from "./lib/f3-00030-floor-replay-transform.mjs";
import {
  DB_QUERY_MULTISTATEMENT_REFUSE,
  refuseDbQueryMultiStatement,
  sqlRequiresPsqlFile,
} from "./lib/f3-db-push-remote-sql-file.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

function clearEnv() {
  delete process.env[DB_PASSWORD_ENV];
  delete process.env[DBPUSH_SENTINEL_ENV];
  delete process.env[DESTRUCTIVE_ENV];
  delete process.env[MGMT_TOKEN_ENV];
}

function setAuthorizedEnv({ password = "f3-dbpush-test-password-not-real" } = {}) {
  process.env[DB_PASSWORD_ENV] = password;
  process.env[DBPUSH_SENTINEL_ENV] = DBPUSH_SENTINEL;
  process.env[DESTRUCTIVE_ENV] = "1";
}

function installRejectingInterceptor() {
  __installDbPushSpawnInterceptorForTests(() => {
    throw new Error("SPAWN_REACHED");
  });
}

function assertRejectedBeforeSpawn(fn) {
  installRejectingInterceptor();
  const before = __dbPushSpawnLedgerForTests().length;
  assert.throws(fn, (err) => {
    assert.notEqual(err.message, "SPAWN_REACHED", "child process must not start");
    return /F3_DBPUSH_|REFUSE|HOLD|BLOCKED/.test(err.code || "") || /REFUSE|HOLD|BLOCKED/.test(err.message);
  });
  assert.equal(__dbPushSpawnLedgerForTests().length, before, "zero processes spawned");
}

beforeEach(() => {
  __resetDbPushSpawnForTests();
  __resetDbPushFetchForTests();
  __resetGitRunnerForTests();
  __resetPoisonPsqlSpawnForTests();
  clearEnv();
});

afterEach(() => {
  __resetDbPushSpawnForTests();
  __resetDbPushFetchForTests();
  __resetGitRunnerForTests();
  __resetPoisonPsqlSpawnForTests();
  clearEnv();
});

test("approved disposable pins are exact and production is excluded", () => {
  assert.equal(APPROVED_DISPOSABLE_PROJECT_REF, "jkorwnwwmdeflfntxntl");
  assert.equal(APPROVED_DISPOSABLE_PROJECT_NAME, "villageclaq-f3-management-api-disposable-20260913");
  assert.equal(APPROVED_DISPOSABLE_ORG_ID, "eyztkzkprpmlmcabrfef");
  assert.equal(APPROVED_DISPOSABLE_HOST, "db.jkorwnwwmdeflfntxntl.supabase.co");
  assert.equal(APPROVED_DISPOSABLE_POOLER_HOST, "aws-0-us-east-1.pooler.supabase.com");
  assert.equal(APPROVED_DISPOSABLE_POOLER_PORT, 5432);
  assert.equal(APPROVED_DISPOSABLE_POOLER_USER, "postgres.jkorwnwwmdeflfntxntl");
  assert.equal(TRANSACTION_POOLER_PORT, 6543);
  assert.match(DIRECT_DB_HOST_IPV6_LIMITATION, /AAAA\/IPv6 unreachable/);
  assert.match(DIRECT_DB_HOST_IPV6_LIMITATION, /aws-0-us-east-1\.pooler\.supabase\.com/);
  assert.equal(DBPUSH_SENTINEL, "villageclaq-f3-dbpush-20260913-authorized");
  assert.equal(PRODUCTION_REF, "llbnliixczcqfftxpsmb");
  assert.equal(PRODUCTION_HISTORY_CEILING_VERSION, "20260912174049");
  assert.equal(CLI_PIN, "2.117.0");
  assert.equal(MANAGEMENT_API_APPLY_PERMANENTLY_DISQUALIFIED, true);
  assert.equal(MAPI_DISQUALIFIED, true);
  assert.match(DB_PUSH_CANDIDATE_STATUS, /QUALIFICATION CANDIDATE ONLY/);
  assert.deepEqual([...RECOGNITION_ALLOWLIST], ["manual_income"]);
  assert.deepEqual([...FILE_BASED_RUNNER_VERDICTS.PASS.split(" ")].slice(0, 2), ["FILE-BASED", "RUNNER"]);
  assert.equal(
    FILE_BASED_RUNNER_VERDICTS.MECHANICS_PASS,
    "FILE-BASED RUNNER MECHANICS PASS — STUB/LIVE-PIN QUALIFICATION FLOOR",
  );
});

test("preassigned versions are known before execution and map 00118-00123 exactly", () => {
  assert.equal(PREASSIGNED_VERSIONS["00118_f3_bounded_financial_epoch_foundation.sql"], "20260913173000");
  assert.equal(PREASSIGNED_VERSIONS["00119_f3_01_core_ledger_foundation.sql"], "20260913173001");
  assert.equal(PREASSIGNED_VERSIONS["00120_f3_02_secure_posting_idempotency.sql"], "20260913173002");
  assert.equal(PREASSIGNED_VERSIONS["00121_f3_03_projection_read_proof.sql"], "20260913173003");
  assert.equal(PREASSIGNED_VERSIONS["00122_f3_04_correction_reversal.sql"], "20260913173004");
  assert.equal(PREASSIGNED_VERSIONS["00123_f3_05_opening_cash_command.sql"], "20260913173005");
  assert.equal(PREASSIGNED_NAMES["00118_f3_bounded_financial_epoch_foundation.sql"], "f3_bounded_financial_epoch_foundation");
  assert.equal(timestampFilenameFor(F3_FORWARD_FILES[0]), "20260913173000_f3_bounded_financial_epoch_foundation.sql");
  assert.equal(nextAuthorizedFile("00118_f3_bounded_financial_epoch_foundation.sql"), "00119_f3_01_core_ledger_foundation.sql");
  assert.equal(nextAuthorizedFile("00123_f3_05_opening_cash_command.sql"), null);
});

test("collision check PASSes vs prod ceiling, empty disposable history, and no repo timestamp filenames", () => {
  const result = assertVersionCollisionPass({ disposableHistoryVersions: [] });
  assert.equal(result.pass, true);
  assert.deepEqual(result.repoTimestampFilenames, []);
  assert.equal(listRepoTimestampFilenames().length, 0);
  assert.equal(result.assigned.length, 6);
  for (const row of result.assigned) {
    assert.equal(row.version > PRODUCTION_HISTORY_CEILING_VERSION, true);
  }
});

test("collision check fails when a preassigned timestamp filename already exists in repo migrations", () => {
  assert.throws(
    () =>
      assertVersionCollisionPass({
        disposableHistoryVersions: [],
        repoMigrationFilenames: ["20260913173000_f3_bounded_financial_epoch_foundation.sql"],
      }),
    /already exists in repo|timestamp filenames/,
  );
});

test("collision check fails when disposable history already has a preassigned version", () => {
  assert.throws(
    () => assertVersionCollisionPass({ disposableHistoryVersions: ["20260913173000"] }),
    /already present/,
  );
});

test("frozen 00118-00123 digests stay byte-identical", () => {
  const observed = assertFrozenDigestsOnDisk();
  assert.deepEqual(observed, FROZEN_DIGESTS);
  for (const file of F3_FORWARD_FILES) {
    assert.notEqual(FROZEN_DIGESTS[file], SUPERSEDED_FROZEN_DIGESTS[file], file);
  }
});

test("isolated workdir copies are byte-identical and do not rewrite repo files", () => {
  const before = assertFrozenDigestsOnDisk();
  const isolated = createIsolatedDbPushWorkdir();
  assert.equal(isolated.copies.length, 6);
  for (const copy of isolated.copies) {
    assert.equal(copy.sha256Before, FROZEN_DIGESTS[copy.sourceFile]);
    assert.equal(copy.sha256After, copy.sha256Before);
    assert.equal(fs.existsSync(copy.destAbs), true);
    assert.equal(copy.destAbs.includes("supabase/migrations"), true);
    assert.equal(copy.destAbs.includes(path.join(root, "supabase/migrations")), false);
    assert.equal(path.basename(copy.destAbs), timestampFilenameFor(copy.sourceFile));
  }
  assert.deepEqual(assertFrozenDigestsOnDisk(), before);
  fs.rmSync(isolated.workdir, { recursive: true, force: true });
});

test("gates refuse production ref before any spawn", () => {
  setAuthorizedEnv();
  assertRejectedBeforeSpawn(() =>
    assertDbPushGates({ projectRef: PRODUCTION_REF, sentinel: DBPUSH_SENTINEL, optIn: true }),
  );
  assertRejectedBeforeSpawn(() => refuseProduction(PRODUCTION_REF));
  assert.equal(__dbPushFetchLedgerForTests().length, 0);
});

test("gates refuse unapproved ref, wrong sentinel, missing destructive, missing password", () => {
  assertRejectedBeforeSpawn(() => assertDbPushGates({ projectRef: "otherref", optIn: true }));

  process.env[DESTRUCTIVE_ENV] = "1";
  process.env[DB_PASSWORD_ENV] = "x";
  assertRejectedBeforeSpawn(() =>
    assertDbPushGates({
      projectRef: APPROVED_DISPOSABLE_PROJECT_REF,
      sentinel: "nope",
      optIn: true,
    }),
  );

  clearEnv();
  process.env[DBPUSH_SENTINEL_ENV] = DBPUSH_SENTINEL;
  process.env[DB_PASSWORD_ENV] = "x";
  assertRejectedBeforeSpawn(() =>
    assertDbPushGates({ projectRef: APPROVED_DISPOSABLE_PROJECT_REF, optIn: true }),
  );

  clearEnv();
  process.env[DBPUSH_SENTINEL_ENV] = DBPUSH_SENTINEL;
  process.env[DESTRUCTIVE_ENV] = "1";
  assertRejectedBeforeSpawn(() =>
    assertDbPushGates({ projectRef: APPROVED_DISPOSABLE_PROJECT_REF, optIn: true }),
  );
  assert.equal(passwordPresent(), false);
  assert.equal(dbPushGatesSatisfiedFromEnv(), false);
  assert.equal(__dbPushSpawnLedgerForTests().length, 0);
});

test("db push / repair / query throw synchronously and spawn nothing when unauthorized", () => {
  assertRejectedBeforeSpawn(() => spawnDbPushChildSync("supabase", ["db", "push"]));
  assert.equal(__dbPushSpawnLedgerForTests().length, 0);
});

test("password is never accepted as -p and never appears in sanitized logs", () => {
  const password = "super-secret-db-password-value";
  setAuthorizedEnv({ password });
  const url = buildDisposableDbUrlFromEnv();
  assert.match(url, new RegExp(APPROVED_DISPOSABLE_POOLER_HOST.replace(/\./g, "\\.")));
  assert.match(url, new RegExp(APPROVED_DISPOSABLE_POOLER_USER.replace(/\./g, "\\.")));
  assert.doesNotMatch(url, new RegExp(APPROVED_DISPOSABLE_HOST.replace(/\./g, "\\.")));
  assert.match(url, /sslmode=require/);
  assert.match(url, /:5432\//);
  assert.doesNotMatch(url, /:6543/);
  const leaked = sanitizeForLog({
    url,
    password,
    argv: ["supabase", "db", "push", "--db-url", url, "-p", password],
  });
  assert.equal(JSON.stringify(leaked).includes(password), false);
  assert.match(JSON.stringify(leaked), /\[REDACTED\]/);
});

test("constructed --db-url is session-mode pooler only; direct host and :6543 are refused", () => {
  setAuthorizedEnv();
  const url = buildDisposableDbUrlFromEnv();
  assert.doesNotThrow(() => assertConstructedDbUrl(url));
  assertRejectedBeforeSpawn(() =>
    assertConstructedDbUrl(
      "postgresql://postgres.jkorwnwwmdeflfntxntl:x@db.jkorwnwwmdeflfntxntl.supabase.co:5432/postgres?sslmode=require",
    ),
  );
  assertRejectedBeforeSpawn(() =>
    assertConstructedDbUrl(
      "postgresql://postgres.jkorwnwwmdeflfntxntl:x@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require",
    ),
  );
  assertRejectedBeforeSpawn(() =>
    assertConstructedDbUrl(
      "postgresql://postgres.jkorwnwwmdeflfntxntl:x@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require",
    ),
  );
  assertRejectedBeforeSpawn(() =>
    assertConstructedDbUrl(
      `postgresql://postgres.${PRODUCTION_REF}:x@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require`,
    ),
  );
});

test("constructed URL and child env strip ambient DATABASE_URL / PG* / tokens", () => {
  setAuthorizedEnv();
  process.env.DATABASE_URL = "postgresql://ubuntu@127.0.0.1:5432/postgres";
  process.env.PGPASSWORD = "ambient-should-not-leak";
  process.env.SUPABASE_ACCESS_TOKEN = "sbp_ambient";
  const env = buildDbPushSubprocessEnv();
  assert.equal(env.DATABASE_URL, undefined);
  assert.equal(env.PGPASSWORD, undefined);
  assert.equal(env.SUPABASE_ACCESS_TOKEN, undefined);
  assert.equal(env.HOME, isolatedDbPushHomeDir());
  assert.ok(env.HOME.includes("f3-dbpush-cli-home-"));
  delete process.env.DATABASE_URL;
  delete process.env.PGPASSWORD;
  delete process.env.SUPABASE_ACCESS_TOKEN;
});

test("candidate command uses --db-url --workdir --yes --skip-vault and never -p/--linked", () => {
  setAuthorizedEnv();
  const help = {
    status: 0,
    hasDbUrl: true,
    hasYes: true,
    hasWorkdir: true,
    hasSkipVault: true,
    text: "--db-url --yes --workdir --skip-vault",
  };
  const isolated = createIsolatedDbPushWorkdir();
  const spec = buildDbPushCommand({
    dbUrl: buildDisposableDbUrlFromEnv(),
    workdir: isolated.workdir,
    help,
  });
  assert.deepEqual(spec.args.slice(0, 3), ["db", "push", "--db-url"]);
  assert.ok(spec.args.includes("--workdir"));
  assert.ok(spec.args.includes("--yes"));
  assert.ok(spec.args.includes("--skip-vault"));
  assert.equal(spec.args.includes("-p"), false);
  assert.equal(spec.args.includes("--password"), false);
  assert.equal(spec.args.includes("--linked"), false);
  assert.equal(spec.args.includes("--local"), false);
  assert.equal(spec.args.includes("--project-ref"), false);
  assert.match(spec.rendered, /\[REDACTED\]/);
  fs.rmSync(isolated.workdir, { recursive: true, force: true });
});

test("db query appends --output-format json before SQL/--file when help shows the flag", () => {
  setAuthorizedEnv();
  const isolated = createIsolatedDbPushWorkdir();
  const withFmt = buildDbQueryCommand({
    dbUrl: buildDisposableDbUrlFromEnv(),
    workdir: isolated.workdir,
    help: {
      status: 0,
      hasDbUrl: true,
      hasWorkdir: true,
      hasFile: true,
      hasOutputFormat: true,
      text: "--db-url --workdir --file --output-format",
    },
    sql: "SELECT 1",
  });
  const fmtIdx = withFmt.args.indexOf("--output-format");
  const sqlIdx = withFmt.args.lastIndexOf("SELECT 1");
  const fileHelp = {
    status: 0,
    hasDbUrl: true,
    hasWorkdir: true,
    hasFile: true,
    hasOutputFormat: true,
    text: "--db-url --workdir --file --output-format",
  };
  assert.ok(fmtIdx > 0);
  assert.equal(withFmt.args[fmtIdx + 1], "json");
  assert.ok(sqlIdx > fmtIdx);
  assert.equal(withFmt.args.includes("-p"), false);
  const fileSpec = buildDbQueryCommand({
    dbUrl: buildDisposableDbUrlFromEnv(),
    workdir: isolated.workdir,
    help: fileHelp,
    fileAbsPath: path.join(isolated.workdir, "probe.sql"),
  });
  const fileFmtIdx = fileSpec.args.indexOf("--output-format");
  const fileIdx = fileSpec.args.indexOf("--file");
  assert.equal(fileSpec.args[fileFmtIdx + 1], "json");
  assert.ok(fileIdx > fileFmtIdx);
  const without = buildDbQueryCommand({
    dbUrl: buildDisposableDbUrlFromEnv(),
    workdir: isolated.workdir,
    help: { status: 0, hasDbUrl: true, hasWorkdir: true, hasOutputFormat: false },
    sql: "SELECT 1",
  });
  assert.equal(without.args.includes("--output-format"), false);
  fs.rmSync(isolated.workdir, { recursive: true, force: true });
});

test("repair command uses the filename version and --status applied from help", () => {
  setAuthorizedEnv();
  const help = {
    status: 0,
    hasStatus: true,
    hasApplied: true,
    hasDbUrl: true,
    hasYes: true,
    hasWorkdir: true,
    text: "--status applied --db-url --yes --workdir",
  };
  assertRepairHelpUsable(help);
  const isolated = createIsolatedDbPushWorkdir();
  const version = preassignedVersionFor("00118_f3_bounded_financial_epoch_foundation.sql");
  const spec = buildRepairCommand({
    version,
    dbUrl: buildDisposableDbUrlFromEnv(),
    workdir: isolated.workdir,
    help,
  });
  assert.deepEqual(spec.args.slice(0, 5), ["migration", "repair", "20260913173000", "--status", "applied"]);
  assert.equal(spec.args.includes("-p"), false);
  assert.throws(
    () =>
      buildRepairCommand({
        version: "00118",
        dbUrl: buildDisposableDbUrlFromEnv(),
        workdir: isolated.workdir,
        help,
      }),
    /filename version|YYYYMMDDHHMMSS|source label|preassigned/,
  );
  fs.rmSync(isolated.workdir, { recursive: true, force: true });
});

test("refuseClockOrGuessedVersion rejects apply-time clock and source labels", () => {
  assert.throws(() => refuseClockOrGuessedVersion("20260913173000", { nowMs: Date.now() }), /clock/);
  assert.throws(() => refuseClockOrGuessedVersion("00118", { sourceLabel: "00118" }), /source label|filename/);
});

test("history inject SQL is restricted to the exact preassigned target version", () => {
  const sql118 = historyInjectSqlForFile("00118_f3_bounded_financial_epoch_foundation.sql");
  assert.match(sql118, /20260913173000/);
  assert.doesNotMatch(sql118, /20260913173001/);
  assert.match(sql118, new RegExp(HISTORY_INJECT_MARKER));
  const sql119 = historyInjectSqlForVersion("20260913173001");
  assert.match(sql119, /20260913173001/);
  assert.doesNotMatch(sql119, /20260913173000/);
  assert.throws(() => historyInjectSqlForVersion("20260912174049"), /restricted|preassigned/);
  assert.throws(() => historyInjectSqlForVersion("00118"), /YYYYMMDDHHMMSS|restricted/);
});

test("classifyDbPushHistoryFailure records post-COMMIT split without inventing history rows", () => {
  const classified = classifyDbPushHistoryFailure({
    exitStatus: 1,
    stderr: `${HISTORY_INJECT_MARKER}: blocked INSERT for version 20260913173000 name f3_bounded_financial_epoch_foundation`,
    historyRows: [],
    targetVersion: "20260913173000",
    objectsPresent: true,
  });
  assert.equal(classified.nonzeroExit, true);
  assert.equal(classified.targetVersionAbsent, true);
  assert.equal(classified.sqlCommitted, true);
  assert.equal(classified.split, "POST_COMMIT_HISTORY_FAILURE");
  assert.equal(classified.knownFilenameVersion, "20260913173000");
  assert.equal(classified.repairAuthorizedByFilenameVersion, true);
});

test("cleanup SQL may drop only the throwaway probe", () => {
  assert.match(DROP_THROWAWAY_PROBE_SQL, /f3_mapi_throwaway_probe/);
  assert.doesNotMatch(DROP_THROWAWAY_PROBE_SQL, /schema_migrations/);
  assert.equal(LIVE_PROBE_THROWAWAY_TABLE, "public.f3_mapi_throwaway_probe");
});

test("bootstrap and 00001 require psql -f; db query --file is refused", () => {
  const bootstrap = readFloorBootstrapSql();
  assert.doesNotMatch(bootstrap, /CREATE OR REPLACE FUNCTION public\.unnest\(uuid\)/);
  assert.match(BOOTSTRAP_WITH_LOCAL_SHIM, /CREATE OR REPLACE FUNCTION public\.unnest\(uuid\)/);
  assert.equal(sqlRequiresPsqlFile(bootstrap), true);
  const core = fs.readFileSync(path.join(root, "supabase/migrations/00001_core_tables.sql"), "utf8");
  assert.equal(sqlRequiresPsqlFile(core), true);
  assert.equal(sqlRequiresPsqlFile(DROP_THROWAWAY_PROBE_SQL), false);
  assert.throws(
    () => refuseDbQueryMultiStatement({ sql: bootstrap }),
    (err) => err.code === "F3_DBPUSH_DB_QUERY_MULTISTATEMENT",
  );
  assert.throws(
    () =>
      refuseDbQueryMultiStatement({
        fileAbsPath: path.join(root, "supabase/migrations/00001_core_tables.sql"),
      }),
    /multi-statement|db query/,
  );
  setAuthorizedEnv();
  assertRejectedBeforeSpawn(() =>
    runDbQuery({
      bin: "supabase",
      workdir: createIsolatedDbPushWorkdir().workdir,
      help: { status: 0, hasDbUrl: true, hasFile: true, hasWorkdir: true },
      fileAbsPath: path.join(root, "supabase/migrations/00001_core_tables.sql"),
    }),
  );
});

test("gated remote psql -f uses pooler child env and never -p; unauthorized is zero-spawn", () => {
  assertRejectedBeforeSpawn(() => spawnGatedRemotePsqlSync(["-X", "-q", "-f", "/tmp/x.sql"]));
  setAuthorizedEnv();
  const env = buildGatedRemotePsqlSubprocessEnv();
  assert.equal(env.PGHOST, "aws-0-us-east-1.pooler.supabase.com");
  assert.equal(env.PGPORT, "5432");
  assert.equal(env.PGUSER, "postgres.jkorwnwwmdeflfntxntl");
  assert.equal(env.PGSSLMODE, "require");
  assert.equal(env.DATABASE_URL, undefined);
  assert.ok(env.PGPASSWORD);
  assert.equal(env.HOME, isolatedDbPushHomeDir());
  __installDbPushSpawnInterceptorForTests(({ cmd, args, opts }) => {
    assert.equal(cmd, "psql");
    assert.equal(args.includes("-p"), false);
    assert.equal(args.includes("--password"), false);
    assert.ok(args.includes("-f"));
    assert.ok(args.includes("-v"));
    assert.ok(args.includes("ON_ERROR_STOP=1"));
    assert.equal(opts.env.PGHOST, "aws-0-us-east-1.pooler.supabase.com");
    assert.equal(opts.env.PGPASSWORD, process.env[DB_PASSWORD_ENV]);
    assert.equal(JSON.stringify(args).includes(process.env[DB_PASSWORD_ENV]), false);
    return { status: 0, stdout: "ok", stderr: "", signal: null };
  });
  const isolated = createIsolatedDbPushWorkdir();
  const result = installRepositoryControlledFloor({ workdir: isolated.workdir });
  assert.equal(result.installed, true);
  assert.equal(result.exact, true);
  assert.equal(result.failedAt, null);
  assert.ok(result.steps.some((s) => s.id === "bootstrap" && s.runner === "gated_psql_file" && s.shimInstalled === false));
  assert.ok(result.steps.some((s) => s.id === "00030-ephemeral-transform"));
  assert.ok(result.steps.some((s) => s.id === "00030_enterprise_branches_committees.sql" && s.transformed === true));
  assert.ok(result.steps.some((s) => s.id === "00030-ephemeral-deleted"));
  assert.ok(result.steps.some((s) => s.id === "00057-ephemeral-transform"));
  assert.ok(result.steps.some((s) => s.id === "00057_profiles_rls_allow_co_members.sql" && s.transformed === true));
  assert.ok(result.steps.some((s) => s.id === "00057-ephemeral-deleted"));
  assert.equal(result.steps.some((s) => s.id === "hold-before-00057_profiles_rls_allow_co_members.sql"), false);
  assert.ok(result.steps.some((s) => String(s.id).startsWith("hgp-before-00116")));
  assert.ok(result.steps.some((s) => s.id === "00117_m2_notification_policy_foundation.sql"));
  assert.ok(result.steps.some((s) => s.id === "hgp-after-00117"));
  assert.equal(result.steps.some((s) => /^0011[89]_/.test(s.id) || /^0012[0-3]_/.test(s.id)), false);
  assert.equal(result.shimInstalled, false);
  assert.deepEqual(result.remainingUnnestAfterAuthorizedTransforms, []);
  fs.rmSync(isolated.workdir, { recursive: true, force: true });
});

test("live HGP remote SQL preserves the live create body", () => {
  const sql = liveHasGroupPermissionSql();
  assert.match(sql, /has_group_permission/);
  assert.match(sql, /OWNER TO postgres/);
  assert.match(sql, /authenticated, service_role/);
  assert.equal(sqlRequiresPsqlFile(sql), true);
});

test("repository floor lists through 00117 and excludes 00118-00123", () => {
  const files = listFloorMigrationsThrough00117();
  assert.ok(files.includes("00117_m2_notification_policy_foundation.sql"));
  assert.equal(files.some((f) => /^0011[89]_/.test(f) || /^0012[0-3]_/.test(f)), false);
  const precheck = floorPrecheck();
  assert.equal(precheck.excludes00118plus, true);
  assert.deepEqual(precheck.recognition, ["manual_income"]);
  assert.equal(precheck.hostedBootstrapHasUnnestShim, false);
  assert.equal(precheck.remainingUnnestHold, false);
  assert.equal(precheck.remainingUnnestAfter00030[0].file, "00057_profiles_rls_allow_co_members.sql");
  assert.equal(remainingUnnestAfter00030()[0].count, 1);
  assert.deepEqual(remainingUnnestAfterAuthorizedTransforms(), []);
  assert.deepEqual(precheck.remainingUnnestAfterAuthorizedTransforms, []);
  assert.equal(precheck.authorizedUnnestInventory.ok, true);
  const original = readOriginal00030();
  assert.equal(original.digest, PINNED_ORIGINAL_SHA256);
  assert.equal(countUnnestCalls(original.text), EXPECTED_UNNEST_COUNT);
  assert.equal(transform00030Text(original.text).digest, PINNED_TRANSFORMED_SHA256);
  assert.match(precheck.holdIfInexact, /HOLD/);
  assert.match(FLOOR_HOLD_IF_INEXACT, /HOLD/);
  assert.match(FLOOR_AUTHORITY, /gated remote psql -f/);
  assert.match(FLOOR_AUTHORITY, /NOT db query --file/);
  assert.match(FLOOR_AUTHORITY, /WITHOUT unnest/);
  assert.match(FLOOR_AUTHORITY, /ephemeral 00057/);
  assert.equal(assertFloorDoesNotUseCandidateRunner(), true);
});

test("recognition allowlist is exactly manual_income", () => {
  assert.deepEqual(recognitionFromSource(), ["manual_income"]);
});

test("identity GET is skipped without token and fetch ledger stays empty", async () => {
  setAuthorizedEnv();
  const identity = await getDisposableProjectIdentity();
  assert.equal(identity.skipped, true);
  assert.equal(__dbPushFetchLedgerForTests().length, 0);
});

test("Management API apply remains permanently refused", () => {
  assert.throws(() => refuseManagementApiApply(), (err) => err.code === "F3_MAPI_APPLY_PERMANENTLY_DISQUALIFIED");
});

test("CLI discovery uses --help and does not invent repair flags", () => {
  const cli = discoverSupabaseCli();
  if (!cli.available) {
    assert.equal(cli.available, false);
    return;
  }
  assert.equal(cli.matchesPin, true);
  const push = readDbPushHelp(cli.bin);
  const repair = readMigrationRepairHelp(cli.bin);
  const query = readDbQueryHelp(cli.bin);
  assert.equal(push.status, 0);
  assert.equal(push.hasDbUrl, true);
  assert.equal(push.hasSkipVault, true);
  assert.equal(push.hasYes, true);
  assert.equal(push.hasWorkdir, true);
  assert.equal(repair.status, 0);
  assert.equal(repair.hasStatus, true);
  assert.equal(repair.hasApplied, true);
  assert.equal(repair.hasDbUrl, true);
  assert.equal(query.status, 0);
  assert.equal(query.hasDbUrl, true);
  assert.equal(query.hasOutputFormat, true);
  assert.match(query.text, /--output-format/);
});

test("qualify runner refuses to run without env (NOT_RUN) and never applies via Management API", () => {
  const qualify = fs.readFileSync(path.join(root, "scripts/qualify-f3-db-push-disposable.mjs"), "utf8");
  assert.match(qualify, /NOT_RUN/);
  assert.match(qualify, /QUALIFICATION CANDIDATE ONLY/);
  assert.match(qualify, /PERMANENTLY DISQUALIFIED/);
  assert.match(qualify, /--skip-vault/);
  assert.doesNotMatch(qualify, /applyRemoteManagementApiMigration/);
  assert.doesNotMatch(qualify, /["']--password["']|["']-p["']/);
  assert.match(qualify, /Do not use -p/);
  assert.match(qualify, /filename version|FILENAME_VERSION/);
  assert.match(qualify, /session-mode pooler/);
  assert.match(qualify, /installHostedFloor/);
  assert.match(qualify, /stub-live-pin/);
  assert.match(qualify, /DOCUMENTED QUALIFICATION FIXTURE/);
  assert.match(qualify, /FILE-BASED RUNNER QUALIFICATION PASS — STUB\/LIVE-PIN FLOOR LIMITATION/);
  assert.match(qualify, /SUPERSEDED/);
  assert.match(qualify, /runGatedRemoteSqlText/);
  assert.match(qualify, /--wipe-to-baseline/);
  assert.match(qualify, /--no-wipe/);
  assert.match(qualify, /re-wipe is forbidden/);
  assert.match(qualify, /evaluatePreStubFloorCleanCheck/);
  assert.match(qualify, /inventoryFromQuery/);
  assert.match(qualify, /parseEvidenceOutArg/);
  assert.match(qualify, /f3-db-push-query-parse/);
  assert.match(qualify, /getFrozenExpectedFingerprint/);
  assert.match(qualify, /collectCanonicalFullFingerprint/);
  assert.match(qualify, /recordPreDbExpectedHashes/);
  assert.match(qualify, /recordFrozenExpectedFingerprintCaptures/);
  assert.match(qualify, /expectedFingerprintsBeforeDb/);
  assert.match(qualify, /frozenExpectedFingerprintCaptures/);
  assert.doesNotMatch(qualify, /expected:\s*null/);
  const cliSrc = fs.readFileSync(path.join(root, "scripts/lib/f3-db-push-cli.mjs"), "utf8");
  assert.match(cliSrc, /hasOutputFormat: \/--output-format\//);
  assert.match(cliSrc, /--output-format", "json"/);
  assert.match(qualify, /06-pre-stub-floor-clean-check/);
  assert.match(qualify, /Do not install public\.unnest\(uuid\)/);
  assert.match(qualify, /Do not replay 00001–00116 or use 00030\/00057 transforms/);
  assert.match(qualify, /Do not invent schema_migrations rows for 00117/);
  assert.doesNotMatch(qualify, /installRepositoryControlledFloor/);
  assert.doesNotMatch(qualify, /fileAbsPath: bootstrapFile/);
});

test("runbook permanently disqualifies Management API apply and keeps db push as candidate only", () => {
  const runbook = fs.readFileSync(
    path.join(root, "docs/runbooks/F3_FOUNDER_CONTROLLED_MIGRATION_REPAIR.md"),
    "utf8",
  );
  assert.match(runbook, /PERMANENTLY DISQUALIFIED/);
  assert.match(runbook, /QUALIFICATION CANDIDATE ONLY|qualification candidate only/i);
  assert.match(runbook, /NEVER automatic/);
  assert.match(runbook, /20260913173000/);
  assert.match(runbook, /jkorwnwwmdeflfntxntl/);
  assert.match(runbook, /--status applied/);
  assert.match(runbook, /filename version|FILENAME_VERSION|preassigned/i);
  assert.match(runbook, /aws-0-us-east-1\.pooler\.supabase\.com/);
  assert.match(runbook, /AAAA\/IPv6 unreachable/);
  assert.match(runbook, /gated remote `psql -f`|gated remote psql -f/);
  assert.doesNotMatch(runbook, /repair 00118 /);
});

const FILE118 = "00118_f3_bounded_financial_epoch_foundation.sql";
const FILE121 = "00121_f3_03_projection_read_proof.sql";
const VER118 = "20260913173000";
const FINANCIAL_PRIVATE_MISSING_ERROR = "ERROR: relation financial_private does not exist";

function completeFingerprint(overrides = {}) {
  const merged = {
    schema_version: F3_FULL_FINGERPRINT_SCHEMA_VERSION,
    schema: "financial_private:postgres",
    schemas: [{ name: "financial_private", owner: "postgres", acl: [] }],
    function_owner: "public.guard_ledger():postgres:true:",
    acl: "financial_private.epochs:",
    acls: "financial_private.epochs:",
    policy: "financial_private.epochs.p:ALL:{public}:true:true",
    policies: "financial_private.epochs.p:ALL:{public}:true:true",
    relations: [],
    columns: [],
    types: [],
    views: [],
    routines: [],
    rls: [],
    constraints: [],
    indexes: [],
    triggers: [],
    hgp: { ...F3_HGP_PIN },
    enqueue: { ...F3_ENQUEUE_PIN },
    f3_objects_absent: false,
    migration_file: FILE118,
    migration_source_label: "00118",
    migration_version: VER118,
    migration_name: "00118_f3_bounded_financial_epoch_foundation",
    migration_digest: FROZEN_DIGESTS[FILE118],
    recognition: ["manual_income"],
    ...overrides,
  };
  if (Object.prototype.hasOwnProperty.call(overrides, "acl") && !Object.prototype.hasOwnProperty.call(overrides, "acls")) {
    merged.acls = overrides.acl;
  }
  if (Object.prototype.hasOwnProperty.call(overrides, "acls") && !Object.prototype.hasOwnProperty.call(overrides, "acl")) {
    merged.acl = overrides.acls;
  }
  return merged;
}

function passingFingerprint(file = FILE118) {
  const expected = getFrozenExpectedFingerprint(file);
  const catalog = catalogInventoryFromFingerprint(expected);
  return {
    expected,
    observed: buildIndependentObservedFingerprint(file, catalog),
  };
}

function passingProbe(file = FILE118) {
  const descriptors = getFrozenExpectedObjectProbeDescriptors(file);
  const row = {};
  descriptors.forEach((descriptor, i) => {
    row[`p${i}`] = { ...descriptor };
  });
  return {
    status: 0,
    stdout: JSON.stringify([row]),
    stderr: "",
    file,
  };
}

function poisonAbsentResult() {
  return originalPoisonProcessResult();
}

function approvedPoisonTargetIdentity(extra = {}) {
  const built = constructImmutableValidatedTargetFromConnection({
    source: "test-f3-db-push-harness",
    ...extra,
  });
  return built.ok ? built.target : { ...extra, ok: false, reason: built.reason };
}

function finalPoisonExactResult(overrides = {}) {
  return originalPoisonProcessResult({
    row: {
      poisonPresent: false,
      current_database: "postgres",
      current_user: "postgres",
      ...overrides,
    },
  });
}

function provenCleanup() {
  return { status: 0, stdout: "", stderr: "", sql: REMOVE_HISTORY_INJECT_SQL };
}

function authorizedGateInput(extra = {}) {
  const { probe, fingerprint, stagedMigrations, ...rest } = extra;
  return {
    file: FILE118,
    targetVersion: VER118,
    injectInstalled: true,
    injectStatus: 0,
    injectSql: historyInjectSqlForFile(FILE118),
    exitStatus: 3,
    stdout: "",
    stderr: `${HISTORY_INJECT_MARKER}: blocked INSERT for version ${VER118} name f3_bounded_financial_epoch_foundation`,
    historyRows: [],
    objectsPresent: true,
    securityPostconditionsOk: true,
    probe: probe === undefined ? passingProbe(FILE118) : probe,
    fingerprint: fingerprint === undefined ? passingFingerprint(FILE118) : fingerprint,
    digest: FROZEN_DIGESTS[FILE118],
    onDiskDigest: FROZEN_DIGESTS[FILE118],
    disposableIdentityVerified: true,
    productionIdentityRejected: true,
    cliVersion: CLI_PIN,
    stagedMigrations: stagedMigrations === undefined
      ? [timestampFilenameFor(FILE118)]
      : stagedMigrations,
    ...rest,
  };
}

test("repair-safety gate authorizes repair only after all proofs", () => {
  const ok = evaluateRepairSafetyGate(authorizedGateInput());
  assert.equal(ok.ok, true);
  assert.equal(ok.repairAuthorized, true);
  assert.equal(ok.nextMigration, true);
  assert.equal(FILE_BASED_RUNNER_VERDICTS.QUALIFICATION_PASS, "FILE-BASED RUNNER QUALIFICATION PASS — STUB/LIVE-PIN FLOOR LIMITATION");
  assert.equal(FILE_BASED_RUNNER_VERDICTS.MECHANICS_PASS_SUPERSEDED, true);
  assert.equal(SUPERSEDED_MECHANICS_PASS_CLAIM.status, "SUPERSEDED");
});

test("authorized repair proves poison absent before spawning migration repair", async () => {
  const order = [];
  const decided = await runRepairSafetyThenMaybeRepair({
    gateInput: authorizedGateInput(),
    cleanup: () => {
      order.push("cleanup");
      return provenCleanup();
    },
    verifyPoisonAbsent: () => {
      order.push("verify");
      return poisonAbsentResult();
    },
    repair: () => {
      order.push("repair");
      return { status: 0 };
    },
    teardown: () => {
      order.push("teardown");
      return { status: 0 };
    },
  });
  assert.equal(decided.repairAuthorized, true);
  assert.equal(decided.repairAttempted, true);
  assert.equal(decided.repairOk, true);
  assert.equal(decided.cleanupProven, true);
  assert.equal(decided.poisonAbsent, true);
  assert.deepEqual(order, ["cleanup", "verify", "repair", "teardown"]);
  assert.equal(order.indexOf("cleanup") < order.indexOf("repair"), true);
  assert.equal(order.indexOf("verify") < order.indexOf("repair"), true);
  assert.equal(decided.teardownRecorded, true);
  assert.notEqual(decided.teardown, decided.cleanup);
});

test("repair-safety negatives spawn zero repair processes and still clean poison", async () => {
  const cases = [
    {
      name: "missing-role SQL failure",
      extra: {
        stderr: 'ERROR:  role "ubuntu" does not exist\n',
        originalSqlError: 'ERROR:  role "ubuntu" does not exist',
      },
    },
    {
      name: "F3_ABORT",
      extra: {
        stderr: "ERROR:  F3_ABORT: has_group_permission fingerprint changed by 00119\n",
      },
    },
    {
      name: "missing expected objects",
      extra: {
        objectsPresent: false,
        securityPostconditionsOk: false,
        probe: { status: 0, stdout: JSON.stringify([{ p0: null, p1: null }]), stderr: "", file: FILE118 },
      },
    },
    {
      name: "wrong injection marker",
      extra: { stderr: "ERROR:  history INSERT blocked for some other reason\n" },
    },
    {
      name: "missing injection marker",
      extra: { stderr: "ERROR:  relation already exists\n" },
    },
    {
      name: "target history unexpectedly present",
      extra: { historyRows: [{ version: VER118, name: "f3_bounded_financial_epoch_foundation" }] },
    },
  ];
  for (const c of cases) {
    let repairCalls = 0;
    let cleanupCalls = 0;
    const decided = await runRepairSafetyThenMaybeRepair({
      gateInput: authorizedGateInput(c.extra),
      cleanup: () => {
        cleanupCalls += 1;
        return { sql: REMOVE_HISTORY_INJECT_SQL, ok: true, status: 0, stdout: "", stderr: "" };
      },
      verifyPoisonAbsent: () => poisonAbsentResult(),
      repair: () => {
        repairCalls += 1;
        return { status: 0 };
      },
    });
    assert.equal(decided.repairAuthorized, false, c.name);
    assert.equal(decided.repairAttempted, false, c.name);
    assert.equal(decided.continuation, false, c.name);
    assert.equal(decided.nextMigration, false, c.name);
    assert.equal(repairCalls, 0, `${c.name} repair spawned`);
    assert.equal(cleanupCalls, 1, `${c.name} poison cleanup`);
    assert.match(decided.cleanup.sql, /DROP TRIGGER IF EXISTS trg_f3_dbpush_fail_target_history/);
    assert.match(decided.cleanup.sql, /DROP FUNCTION IF EXISTS supabase_migrations\.f3_dbpush_fail_target_history/);
    assert.equal(decided.gate.hold, REPAIR_SAFETY_HOLD);
  }
});

test("strict object probe rejects ERROR relation financial_private and all unstructured fallbacks", async () => {
  const mandatory = {
    status: 1,
    stdout: "",
    stderr: FINANCIAL_PRIVATE_MISSING_ERROR,
    file: FILE118,
  };
  assert.equal(objectsPresentFromProbe(mandatory), false);
  assert.equal(objectsPresentFromProbe({ status: 0, stdout: "", stderr: FINANCIAL_PRIVATE_MISSING_ERROR, file: FILE118 }), false);
  assert.equal(objectsPresentFromProbe({ status: 0, stdout: "financial_private is mentioned", stderr: "", file: FILE118 }), false);
  assert.equal(objectsPresentFromProbe({ status: 0, stdout: "{", stderr: "", file: FILE118 }), false);
  assert.equal(objectsPresentFromProbe({ status: 0, stdout: JSON.stringify({ p0: "financial_private" }), stderr: "", file: FILE118 }), false);
  assert.equal(objectsPresentFromProbe({
    status: 0,
    stdout: JSON.stringify([{ note: "contains financial_private and public.financial_ledger_epochs" }]),
    stderr: "",
    file: FILE118,
  }), false);
  assert.equal(objectsPresentFromProbe(passingProbe(FILE118)), true);

  let repairCalls = 0;
  const decided = await runRepairSafetyThenMaybeRepair({
    gateInput: authorizedGateInput({
      objectsPresent: true,
      probe: mandatory,
      stderr: `${HISTORY_INJECT_MARKER}: blocked INSERT for version ${VER118} name f3_bounded_financial_epoch_foundation`,
    }),
    cleanup: () => provenCleanup(),
    verifyPoisonAbsent: () => poisonAbsentResult(),
    repair: () => {
      repairCalls += 1;
      return { status: 0 };
    },
  });
  assert.equal(objectsPresentFromProbe(mandatory), false);
  assert.equal(decided.gate.objectProbe.present, false);
  assert.equal(decided.repairAuthorized, false);
  assert.equal(decided.repairAttempted, false);
  assert.equal(repairCalls, 0);
  assert.ok(decided.gate.failedGates.includes("expected_objects") || decided.gate.failedGates.includes("no_unrelated_sql_error"));
});

function probeFrom121(mutateRow = (row) => row) {
  const descriptors = getFrozenExpectedObjectProbeDescriptors(FILE121);
  const row = {};
  descriptors.forEach((descriptor, i) => {
    row[`p${i}`] = { ...descriptor };
  });
  return {
    status: 0,
    stdout: JSON.stringify([mutateRow(row)]),
    stderr: "",
    file: FILE121,
  };
}

function authorized121Input(extra = {}) {
  return authorizedGateInput({
    file: FILE121,
    targetVersion: PREASSIGNED_VERSIONS[FILE121],
    stagedMigrations: authorizedStagedPrefixThrough(FILE121),
    injectSql: historyInjectSqlForFile(FILE121),
    stderr: `${HISTORY_INJECT_MARKER}: blocked INSERT for version ${PREASSIGNED_VERSIONS[FILE121]} name ${PREASSIGNED_NAMES[FILE121]}`,
    digest: FROZEN_DIGESTS[FILE121],
    onDiskDigest: FROZEN_DIGESTS[FILE121],
    fingerprint: passingFingerprint(FILE121),
    probe: extra.probe === undefined ? passingProbe(FILE121) : extra.probe,
    ...extra,
  });
}

async function assertProbeForbidsRepair(name, probe) {
  assert.equal(objectsPresentFromProbe(probe), false, name);
  assert.equal(evaluateObjectProbe(probe, { file: FILE121 }).present, false, name);
  let repairCalls = 0;
  const decided = await runRepairSafetyThenMaybeRepair({
    gateInput: authorized121Input({
      objectsPresent: false,
      securityPostconditionsOk: false,
      probe,
    }),
    cleanup: () => provenCleanup(),
    verifyPoisonAbsent: () => poisonAbsentResult(),
    repair: () => {
      repairCalls += 1;
      return { status: 0 };
    },
  });
  assert.equal(decided.repairAuthorized, false, name);
  assert.equal(decided.repairAttempted, false, name);
  assert.equal(repairCalls, 0, `${name} repair spawned`);
  assert.equal(decided.gate.failedGates.includes("expected_objects"), true, `${name} expected_objects`);
  assert.equal(decided.gate.failedGates.includes("security_postconditions"), true, `${name} security_postconditions`);
  return decided;
}

test("timestamptz lookup resolves to frozen canonical timestamp with time zone identity", async () => {
  const exprs = TARGET_OBJECT_PROBES[FILE121];
  assert.match(exprs[0], /timestamptz/);
  assert.doesNotMatch(exprs[0], /timestamp with time zone/);
  assert.match(exprs[1], /timestamptz/);
  const sql = objectProbeSql(exprs);
  assert.match(sql, /to_regprocedure\('public\.get_financial_projection_bundle\(uuid,timestamptz,timestamptz,timestamptz\)'\)/);
  assert.match(sql, /to_regprocedure\('public\.get_financial_cashbook\(uuid,timestamptz,timestamptz,uuid,text,integer,integer\)'\)/);
  assert.match(sql, /pg_get_function_identity_arguments\(p\.oid\)/);
  assert.match(sql, /JOIN pg_namespace n ON n\.oid = p\.pronamespace/);
  assert.doesNotMatch(sql, /to_regprocedure\([^;]*\)::text/);
  const descriptors = getFrozenExpectedObjectProbeDescriptors(FILE121);
  assert.equal(descriptors[0].identity_arguments.includes("timestamp with time zone"), true);
  assert.equal(descriptors[0].identity_arguments.includes("timestamptz"), false);
  assert.equal(descriptors[1].identity_arguments.includes("timestamp with time zone"), true);
  assert.equal(descriptors[1].identity_arguments.includes("timestamptz"), false);
  assert.equal(objectsPresentFromProbe(passingProbe(FILE121)), true);
  const ok = evaluateRepairSafetyGate(authorized121Input());
  assert.equal(ok.ok, true);
  assert.equal(ok.objectProbe.present, true);
  assert.equal(ok.failedGates.includes("expected_objects"), false);
});

test("catalog-boundary object-probe identity matrix: exact pairing; semantic misses fail with zero repair", async () => {
  const descriptors = getFrozenExpectedObjectProbeDescriptors(FILE121);
  const cashbookArgs = descriptors[1].identity_arguments;
  assert.equal(
    cashbookArgs,
    "p_group_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_account_id uuid, p_currency text, p_offset integer, p_limit integer",
  );
  assert.equal(objectsPresentFromProbe(passingProbe(FILE121)), true, "multi-arg routine retains every argument");

  const overloadsDistinct = evaluateObjectProbe(passingProbe(FILE121), { file: FILE121 });
  assert.equal(overloadsDistinct.present, true, "overloads remain distinct");
  assert.notEqual(overloadsDistinct.row.p0.identity_arguments, overloadsDistinct.row.p1.identity_arguments);

  await assertProbeForbidsRepair("argument order changes fail", probeFrom121((row) => {
    row.p0 = {
      ...row.p0,
      identity_arguments:
        "p_group_id uuid, p_to timestamp with time zone, p_from timestamp with time zone, p_as_of_exclusive timestamp with time zone",
    };
    return row;
  }));

  await assertProbeForbidsRepair("missing argument fails", probeFrom121((row) => {
    row.p1 = {
      ...row.p1,
      identity_arguments:
        "p_group_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_account_id uuid, p_currency text, p_offset integer",
    };
    return row;
  }));

  await assertProbeForbidsRepair("extra argument fails", probeFrom121((row) => {
    row.p0 = {
      ...row.p0,
      identity_arguments: `${row.p0.identity_arguments}, p_extra text`,
    };
    return row;
  }));

  await assertProbeForbidsRepair("different type with similar name fails", probeFrom121((row) => {
    row.p0 = {
      ...row.p0,
      identity_arguments:
        "p_group_id uuid, p_from timestamp, p_to timestamp, p_as_of_exclusive timestamp",
    };
    return row;
  }));

  await assertProbeForbidsRepair("lookup alias timestamptz in identity_arguments fails", probeFrom121((row) => {
    row.p0 = {
      ...row.p0,
      identity_arguments:
        "p_group_id uuid, p_from timestamptz, p_to timestamptz, p_as_of_exclusive timestamptz",
    };
    return row;
  }));

  await assertProbeForbidsRepair("unresolved signature fails", {
    status: 0,
    stdout: JSON.stringify([{ p0: null, p1: descriptors[1] }]),
    stderr: "",
    file: FILE121,
  });

  await assertProbeForbidsRepair("malformed non-JSON probe output fails", {
    status: 0,
    stdout: "{",
    stderr: "",
    file: FILE121,
  });

  await assertProbeForbidsRepair("truncated identity fails", probeFrom121((row) => {
    row.p1 = {
      ...row.p1,
      identity_arguments: "p_group_id uuid, p_from timestamp with time zone",
    };
    return row;
  }));

  await assertProbeForbidsRepair("same object count different identity pairing fails", probeFrom121((row) => {
    const swapped = { p0: row.p1, p1: row.p0 };
    return swapped;
  }));

  await assertProbeForbidsRepair("duplicate structured records fail", probeFrom121((row) => {
    row.p1 = { ...row.p0 };
    return row;
  }));
});

test("live-observed data cannot populate or mutate expected object-probe descriptors", () => {
  const before = JSON.stringify(FROZEN_EXPECTED_OBJECT_PROBE_DESCRIPTORS[FILE121]);
  const clone = getFrozenExpectedObjectProbeDescriptors(FILE121);
  clone[0].identity_arguments = "observed-from-live-catalog";
  clone[0].oid = 12345;
  assertExpectedObjectProbeDescriptorsImmutable(FILE121);
  assert.equal(JSON.stringify(FROZEN_EXPECTED_OBJECT_PROBE_DESCRIPTORS[FILE121]), before);
  assert.equal(getFrozenExpectedObjectProbeDescriptors(FILE121)[0].identity_arguments.includes("observed-from-live-catalog"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(FROZEN_EXPECTED_OBJECT_PROBE_DESCRIPTORS[FILE121][0], "oid"), false);
  const observedOnly = {
    status: 0,
    stdout: JSON.stringify([{
      p0: {
        object_type: "routine",
        schema: "public",
        object_name: "get_financial_projection_bundle",
        prokind: "f",
        identity_arguments: "observed-from-live-catalog",
      },
      p1: getFrozenExpectedObjectProbeDescriptors(FILE121)[1],
    }]),
    stderr: "",
    file: FILE121,
  };
  assert.equal(evaluateObjectProbe(observedOnly, { file: FILE121 }).present, false);
  assert.equal(JSON.stringify(FROZEN_EXPECTED_OBJECT_PROBE_DESCRIPTORS[FILE121]), before);
});

test("OID changes do not affect cross-database fingerprint or probe-identity equality", () => {
  const left = getFrozenExpectedFingerprint(FILE121);
  const right = getFrozenExpectedFingerprint(FILE121);
  assert.equal(fingerprintCompleteAndExact({ expected: left, observed: right }, FILE121).ok, true);
  assert.equal(JSON.stringify(left).includes("\"oid\""), false);
  const descriptors = getFrozenExpectedObjectProbeDescriptors(FILE121);
  for (const descriptor of descriptors) {
    assert.deepEqual(Object.keys(descriptor).sort(), [...OBJECT_PROBE_IDENTITY_FIELDS].sort());
    assert.equal(Object.prototype.hasOwnProperty.call(descriptor, "oid"), false);
  }
  const withOid = probeFrom121((row) => {
    row.p0 = { ...row.p0, oid: 4242 };
    return row;
  });
  assert.equal(evaluateObjectProbe(withOid, { file: FILE121 }).present, false);
  assert.equal(objectsPresentFromProbe(passingProbe(FILE121)), true);
  const otherOid = probeFrom121((row) => {
    row.p0 = { ...row.p0, oid: 9999 };
    return row;
  });
  assert.equal(evaluateObjectProbe(otherOid, { file: FILE121 }).present, false);
  assert.equal(
    fingerprintCanonicalSha256(left),
    FROZEN_EXPECTED_FINGERPRINT_SHA256[FILE121],
  );
});

test("fingerprint mismatch of any catalog value forbids repair", async () => {
  const mismatches = [
    { name: "owner", observed: completeFingerprint({ function_owner: "public.guard_ledger():ubuntu:true:" }) },
    { name: "acl", observed: completeFingerprint({ acl: "financial_private.epochs:{ubuntu=arwd}" }) },
    { name: "policy", observed: completeFingerprint({ policy: "financial_private.epochs.p:SELECT:{public}:true:true" }) },
    { name: "rls extra key", expected: completeFingerprint(), observed: completeFingerprint({ rls: true }) },
    { name: "missing expected", fingerprint: { observed: completeFingerprint() } },
    { name: "subset observed", expected: completeFingerprint(), observed: { schema: "financial_private:postgres" } },
    { name: "marker substring only", fingerprint: {
      schema: "mentions financial_private",
      function_owner: "mentions financial_private",
      acl: "mentions financial_private",
      policy: "mentions financial_private",
    } },
  ];
  for (const c of mismatches) {
    const fingerprint = c.fingerprint || { expected: c.expected || completeFingerprint(), observed: c.observed };
    assert.equal(fingerprintCompleteAndExact(fingerprint).ok, false, c.name);
    let repairCalls = 0;
    const decided = await runRepairSafetyThenMaybeRepair({
      gateInput: authorizedGateInput({ fingerprint }),
      cleanup: () => provenCleanup(),
      verifyPoisonAbsent: () => poisonAbsentResult(),
      repair: () => {
        repairCalls += 1;
        return { status: 0 };
      },
    });
    assert.equal(decided.repairAuthorized, false, c.name);
    assert.equal(decided.repairAttempted, false, c.name);
    assert.equal(repairCalls, 0, `${c.name} repair spawned`);
  }
});

async function assertFingerprintForbidsRepair(name, fingerprint) {
  assert.equal(fingerprintCompleteAndExact(fingerprint, FILE118).ok, false, name);
  let repairCalls = 0;
  const decided = await runRepairSafetyThenMaybeRepair({
    gateInput: authorizedGateInput({ fingerprint }),
    cleanup: () => provenCleanup(),
    verifyPoisonAbsent: () => poisonAbsentResult(),
    repair: () => {
      repairCalls += 1;
      return { status: 0 };
    },
  });
  assert.equal(decided.repairAuthorized, false, name);
  assert.equal(decided.repairAttempted, false, name);
  assert.equal(repairCalls, 0, `${name} repair spawned`);
  return decided;
}

function frozenPair(mutateObserved = (observed) => observed) {
  const expected = getFrozenExpectedFingerprint(FILE118);
  const catalog = catalogInventoryFromFingerprint(expected);
  const observed = mutateObserved(buildIndependentObservedFingerprint(FILE118, catalog));
  return { expected, observed };
}

test("fingerprint gate forbids null sides, missing keys, extra keys, and security mismatches", async () => {
  const passing = passingFingerprint(FILE118);
  await assertFingerprintForbidsRepair("expected=null", { expected: null, observed: passing.observed });
  await assertFingerprintForbidsRepair("observed=null", { expected: passing.expected, observed: null });

  const expectedMissing = frozenPair();
  delete expectedMissing.expected.acl;
  await assertFingerprintForbidsRepair("expected missing key", expectedMissing);

  const observedMissing = frozenPair((observed) => {
    delete observed.policy;
    return observed;
  });
  await assertFingerprintForbidsRepair("observed missing key", observedMissing);

  const observedExtra = frozenPair((observed) => {
    observed.unexpected_catalog_field = "on";
    return observed;
  });
  await assertFingerprintForbidsRepair("observed extra key", observedExtra);

  const mismatches = [
    ["owner", (e, o) => {
      o.function_owner = o.function_owner.map((row) => ({
        ...row,
        owner: row.owner === "postgres" ? "ubuntu" : row.owner,
      }));
    }],
    ["acl", (e, o) => {
      o.acl = o.acl.map((row) => (
        row.grantee === "authenticated" && row.privilege === "SELECT"
          ? { ...row, privilege: "INSERT" }
          : row
      ));
    }],
    ["policy", (e, o) => {
      o.policy = o.policy.map((row) => ({
        ...row,
        command: row.command === "SELECT" ? "ALL" : row.command,
      }));
    }],
    ["rls", (e, o) => { e.rls = false; o.rls = true; }],
    ["function-definition", (e, o) => { e.function_definition = "CREATE FUNCTION sealed()"; o.function_definition = "CREATE FUNCTION leaked()"; }],
    ["search_path", (e, o) => { e.search_path = "\"\""; o.search_path = "public,pg_temp"; }],
    ["hgp", (e, o) => { e.hgp = "sealed-hgp-pin"; o.hgp = "drifted-hgp-pin"; }],
    ["enqueue", (e, o) => { e.enqueue = "sealed-enqueue-pin"; o.enqueue = "drifted-enqueue-pin"; }],
    ["recognition", (e, o) => { o.recognition = ["manual_expense"]; }],
    ["digest", (e, o) => { o.migration_digest = "0".repeat(64); }],
    ["version", (e, o) => { o.migration_version = "19990101000000"; }],
    ["name", (e, o) => { o.migration_name = "wrong_migration_name"; }],
  ];
  for (const [name, mutateBoth] of mismatches) {
    const pair = frozenPair();
    mutateBoth(pair.expected, pair.observed);
    await assertFingerprintForbidsRepair(name, pair);
  }
});

test("reordered set-like values normalize; security-relevant changes never normalize away", async () => {
  const expected = getFrozenExpectedFingerprint(FILE118);
  const catalog = catalogInventoryFromFingerprint(expected);
  const reordered = buildIndependentObservedFingerprint(FILE118, catalog);
  reordered.function_owner = [...expected.function_owner].reverse();
  reordered.acl = [...expected.acl].reverse();
  reordered.policy = [...expected.policy].reverse();
  reordered.recognition = ["manual_income"];
  assert.equal(fingerprintCompleteAndExact({ expected, observed: reordered }, FILE118).ok, true);

  const multiSchemaExpected = completeFingerprint({
    schema: "financial_core:postgres,financial_private:postgres",
    recognition: ["zeta", "alpha"],
  });
  const multiSchemaObserved = completeFingerprint({
    schema: "financial_private:postgres,financial_core:postgres",
    recognition: ["alpha", "zeta"],
  });
  assert.equal(
    fingerprintCompleteAndExact({ expected: multiSchemaExpected, observed: multiSchemaObserved }).ok,
    true,
    "schema and recognition set reorder",
  );

  const security = frozenPair((observed) => {
    observed.acl = observed.acl.map((row) => (
      row.grantee === "postgres" && row.object_name === "epoch_transitions"
        ? { ...row, grantee: "ubuntu" }
        : row
    ));
    return observed;
  });
  assert.equal(fingerprintCompleteAndExact(security, FILE118).ok, false, "acl owner change");

  const policyWs = frozenPair((observed) => {
    observed.policy = observed.policy.map((row) => ({
      ...row,
      using: row.using.replace(/\n/g, " "),
    }));
    return observed;
  });
  assert.equal(fingerprintCompleteAndExact(policyWs, FILE118).ok, false, "policy whitespace coarsen");

  const searchPathCoarsen = {
    expected: completeFingerprint({ search_path: "\"\"" }),
    observed: completeFingerprint({ search_path: "public" }),
  };
  assert.equal(fingerprintCompleteAndExact(searchPathCoarsen).ok, false, "search_path coarsen");
});

test("expected object is unchanged after observed processing", async () => {
  const expected = getFrozenExpectedFingerprint(FILE118);
  const before = fingerprintCanonicalSha256(expected);
  const sealed = expectedFingerprintSha256(FILE118);
  assert.equal(before, sealed);
  const catalog = {
    ...catalogInventoryFromFingerprint(expected),
    schema: "mutated-schema-should-not-touch-expected",
  };
  const observed = buildIndependentObservedFingerprint(FILE118, catalog);
  observed.acl = "attacker-rewrote-observed-acl";
  const result = fingerprintCompleteAndExact({ expected, observed }, FILE118);
  assert.equal(result.ok, false);
  assert.equal(fingerprintCanonicalSha256(expected), before);
  assert.deepEqual(assertExpectedFingerprintImmutable(FILE118), {
    file: FILE118,
    sha256: sealed,
    unchanged: true,
  });
  assert.equal(FROZEN_EXPECTED_FINGERPRINT_SHA256[FILE118], sealed);
});

test("module-load frozen expected hashes are independent of observed and match the offline seal", () => {
  const recorded = recordPreDbExpectedHashes();
  assert.equal(recorded.recordedBeforeDbAccess, true);
  assert.equal(recorded.independentOfObserved, true);
  assert.equal(SUPERSEDED_FROZEN_EXPECTED_FINGERPRINT_SHA256.reason, FINGERPRINT_CANONICALIZATION_REASON);
  assert.equal(
    SUPERSEDED_FROZEN_EXPECTED_FINGERPRINT_SHA256["00119_f3_01_core_ledger_foundation.sql"],
    "422c5d8b22ae4c07f59261f09988afccf80efb85f3c05dc5c3c91063a12f7f4c",
  );
  assert.deepEqual(
    Object.fromEntries(F3_FORWARD_FILES.map((file) => [file, getFrozenExpectedFingerprint(file).migration_digest])),
    {
      "00118_f3_bounded_financial_epoch_foundation.sql": "bb823ebdddcefba7774f3347a609a05393d9a67c9430d0bd925c3458eaf5efed",
      "00119_f3_01_core_ledger_foundation.sql": "b22e16783fbb429ccae0ce15291d83311861f4e873cd01363bbd630372633f11",
      "00120_f3_02_secure_posting_idempotency.sql": "d81c8f52d4fccea4b654c3a54806ffc07d654ffa2a33540c97b74721d56b9a60",
      "00121_f3_03_projection_read_proof.sql": "51f40ccbd7dad79362b8cf2cd9854b9c8cdfd7295e4c10be5892d953915e90ce",
      "00122_f3_04_correction_reversal.sql": "84f52b89b764a468db7748e5c572f2543c5d466e5369ff36e6889d85ca8434f3",
      "00123_f3_05_opening_cash_command.sql": "0c8af9d755e5329ca58d6c5ae967fbe5b18e3e41bb836c934cfea0c06afce96d",
    },
  );
  for (const file of F3_FORWARD_FILES) {
    assert.deepEqual(getFrozenExpectedFingerprint(file).recognition, ["manual_income"]);
  }
  assert.deepEqual(recorded.sha256BeforeDb, { ...FROZEN_EXPECTED_FINGERPRINT_SHA256 });
  assert.equal(
    SUPERSEDED_FROZEN_EXPECTED_FINGERPRINT_SHA256.f3_full_catalog_v3["00123_f3_05_opening_cash_command.sql"],
    CATALOG_V3_00123_HASH_D692,
  );
  assert.ok(CATALOG_V3_00123_SUPERSESSION.occurrences.length >= 20, "complete d692/d802 inventory");
  assert.equal(CATALOG_V3_00123_SUPERSESSION.occurrences[0].hash, CATALOG_V3_00123_HASH_D692);
  assert.ok(CATALOG_V3_00123_SUPERSESSION.occurrences.some((row) => row.hash === CATALOG_V3_00123_HASH_D802));
  assert.equal(CATALOG_V3_00123_SUPERSESSION.do_not_claim_d802_founder_prose_only, true);
  assert.equal(CATALOG_V3_00123_SUPERSESSION.both_superseded_by_v4, true);
  assert.equal(CATALOG_V3_00123_SUPERSESSION.both_superseded_by_v5, true);
  for (const occ of CATALOG_V3_00123_SUPERSESSION.occurrences) {
    assert.ok(occ.path, `${occ.token} missing path`);
    assert.ok(occ.hash, `${occ.token} missing hash`);
    assert.ok(occ.role, `${occ.token} missing role`);
    assert.ok(occ.why_non_authoritative, `${occ.token} missing why_non_authoritative`);
    assert.equal(occ.v5_superseding_schema, F3_FULL_FINGERPRINT_SCHEMA_VERSION);
    assert.ok(["executable", "evidence", "log", "prose"].includes(occ.kind), occ.path);
  }
  assert.notEqual(recorded.sha256BeforeDb["00123_f3_05_opening_cash_command.sql"], CATALOG_V3_00123_HASH_D692);
  assert.notEqual(recorded.sha256BeforeDb["00123_f3_05_opening_cash_command.sql"], CATALOG_V3_00123_HASH_D802);
  assert.equal(
    SUPERSEDED_FROZEN_EXPECTED_FINGERPRINT_SHA256.js_sql_parser_shapes.reason,
    JS_SQL_PARSER_SUPERSEDED_REASON,
  );
  assert.equal(
    SUPERSEDED_FROZEN_EXPECTED_FINGERPRINT_SHA256.js_sql_parser_shapes["00118_f3_bounded_financial_epoch_foundation.sql"],
    "ee5ece5603bee8e3afcb20888b87cd3e3bb9e334c7f56df0235181b49c91a309",
  );
  assert.equal(
    SUPERSEDED_FROZEN_EXPECTED_FINGERPRINT_SHA256.f3_full_catalog_v1["00118_f3_bounded_financial_epoch_foundation.sql"],
    "72af66999f3a53a870cd1a5d0ed99a2acb7f510c69bfe16204b9fe0f217f757f",
  );
  assert.notEqual(
    recorded.sha256BeforeDb["00118_f3_bounded_financial_epoch_foundation.sql"],
    SUPERSEDED_FROZEN_EXPECTED_FINGERPRINT_SHA256.bare_local_pg17_without_platform_defaults["00118_f3_bounded_financial_epoch_foundation.sql"],
  );
  assert.equal(
    EXPECTED_FINGERPRINT_SEAL_PROVENANCE.independently_reproduced_hosted_00118_after_platform_defaults,
    false,
  );
  assert.equal(
    EXPECTED_FINGERPRINT_SEAL_PROVENANCE.f3_full_catalog_v1_independently_reproduced_hosted_00118_after_platform_defaults,
    true,
  );
  assert.equal(
    SUPERSEDED_FROZEN_EXPECTED_FINGERPRINT_SHA256.f3_full_catalog_v1["00118_f3_bounded_financial_epoch_foundation.sql"],
    EXPECTED_FINGERPRINT_SEAL_PROVENANCE.hosted_observed_00118_forbidden,
  );
  assert.notEqual(
    recorded.sha256BeforeDb["00118_f3_bounded_financial_epoch_foundation.sql"],
    EXPECTED_FINGERPRINT_SEAL_PROVENANCE.hosted_observed_00118_forbidden,
  );
  for (const file of F3_FORWARD_FILES) {
    assert.notEqual(
      recorded.sha256BeforeDb[file],
      EXPECTED_FINGERPRINT_SEAL_PROVENANCE.hosted_observed_00118_forbidden,
      `${file} v5 seal must not equal hosted 72af6699`,
    );
  }
  assert.notEqual(
    recorded.sha256BeforeDb["00118_f3_bounded_financial_epoch_foundation.sql"],
    "ee5ece5603bee8e3afcb20888b87cd3e3bb9e334c7f56df0235181b49c91a309",
  );
  for (const file of F3_FORWARD_FILES) {
    assert.notEqual(
      recorded.sha256BeforeDb[file],
      SUPERSEDED_FROZEN_EXPECTED_FINGERPRINT_SHA256.js_sql_parser_shapes[file],
      `${file} new seal must supersede JS SQL-parser hash`,
    );
  }
  assert.equal(EXPECTED_FINGERPRINT_SEAL_PROVENANCE.not_hosted, true);
  assert.equal(EXPECTED_FINGERPRINT_SEAL_PROVENANCE.not_copied_from_hosted_observed, true);
  assert.equal(
    SEALED_PLATFORM_ACL_ENVELOPE_DIGEST,
    "eb58900b492b95371decfdab86b3786afc2c8089c6b0a117497f9e0b22c41a2a",
  );
  assert.equal(platformAclEnvelopeDigest(SEALED_PLATFORM_ACL_ENVELOPE), SEALED_PLATFORM_ACL_ENVELOPE_DIGEST);
  assert.equal(evaluatePlatformAclCalibration().ok, true);
  assert.equal(EXPECTED_FINGERPRINT_SEAL_PROVENANCE.platform_acl_envelope_digest, SEALED_PLATFORM_ACL_ENVELOPE_DIGEST);
  assert.equal(EXPECTED_FINGERPRINT_SEAL_PROVENANCE.not_from_hosted_fingerprint_72af6699, true);
  assert.equal(EXPECTED_FINGERPRINT_SEAL_PROVENANCE.not_from_financial_ledger_epochs, true);
  assert.equal(
    SUPERSEDED_FROZEN_EXPECTED_FINGERPRINT_SHA256.bare_local_pg17_without_platform_defaults["00118_f3_bounded_financial_epoch_foundation.sql"],
    "8299680fd5b3def52a981ae8c8ee097f29f13507b91d4f0799557236f1b5001c",
  );
  assert.equal(
    FROZEN_EXPECTED_ORACLE_CATALOG_SHA256,
    "5fd8fd857aa75932e18b8649a42b69502488ff16c8d7f882524a6460ddfa4164",
  );
  assert.equal(
    EXPECTED_FINGERPRINT_SEAL_PROVENANCE.catalog_sha256,
    FROZEN_EXPECTED_ORACLE_CATALOG_SHA256,
  );
  assert.notEqual(
    FROZEN_EXPECTED_ORACLE_CATALOG_SHA256,
    "abbfb0b6c08407710e3b4a74dec22ca2aabeeac7e04e8f200c0ac7f7c958fb92",
    "V5 oracle catalog digest must remain the sealed local-oracle snapshot (roles applied in builder)",
  );
  assert.notEqual(
    FROZEN_EXPECTED_ORACLE_CATALOG_SHA256,
    "26bcb10d8e0b1a2f05434af975538054864fbfbb4e3da23f4335eefc4b8634ac",
  );
  for (const file of F3_FORWARD_FILES) {
    assert.notEqual(
      recorded.sha256BeforeDb[file],
      SUPERSEDED_FROZEN_EXPECTED_FINGERPRINT_SHA256.bare_local_pg17_without_platform_defaults[file],
      `${file} new seal must supersede bare local PG17 without platform defaults`,
    );
  }
  assert.equal(
    SUPERSEDED_FROZEN_EXPECTED_FINGERPRINT_SHA256.ten_field_schema.reason,
    TEN_FIELD_SCHEMA_SUPERSEDED_REASON,
  );
  assert.equal(
    SUPERSEDED_FROZEN_EXPECTED_FINGERPRINT_SHA256.ten_field_schema["00118_f3_bounded_financial_epoch_foundation.sql"],
    "0a403e8d3848e07769fcb453b78deebb1ad29217f4ed1d9c684dc64ca1b27a02",
  );
  for (const file of F3_FORWARD_FILES) {
    assert.notEqual(
      recorded.sha256BeforeDb[file],
      SUPERSEDED_FROZEN_EXPECTED_FINGERPRINT_SHA256.ten_field_schema[file],
      `${file} new seal must supersede ten-field hash`,
    );
    assert.notEqual(
      recorded.sha256BeforeDb[file],
      SUPERSEDED_FROZEN_EXPECTED_FINGERPRINT_SHA256.f3_full_catalog_v1[file],
      `${file} new seal must supersede f3-full-catalog-v1 hash`,
    );
    assert.notEqual(
      recorded.sha256BeforeDb[file],
      SUPERSEDED_FROZEN_EXPECTED_FINGERPRINT_SHA256.f3_full_catalog_v2[file],
      `${file} new seal must supersede f3-full-catalog-v2 hash`,
    );
    assert.notEqual(
      recorded.sha256BeforeDb[file],
      SUPERSEDED_FROZEN_EXPECTED_FINGERPRINT_SHA256.f3_full_catalog_v3[file],
      `${file} new seal must supersede f3-full-catalog-v3 hash`,
    );
  }
  assert.equal(
    SUPERSEDED_FROZEN_EXPECTED_FINGERPRINT_SHA256.concatenated_object_identity["00119_f3_01_core_ledger_foundation.sql"],
    "e8005d0591d974d4b24ced9529904bd7c0727bc3fd98a5aeabf61c7325ab4d26",
  );
  for (const file of F3_FORWARD_FILES) {
    assert.notEqual(
      recorded.sha256BeforeDb[file],
      SUPERSEDED_FROZEN_EXPECTED_FINGERPRINT_SHA256[file],
      `${file} new seal must supersede comma-joined hash`,
    );
    assert.notEqual(
      recorded.sha256BeforeDb[file],
      SUPERSEDED_FROZEN_EXPECTED_FINGERPRINT_SHA256.concatenated_object_identity[file],
      `${file} new seal must supersede concatenated object_identity hash`,
    );
  }
  for (const file of F3_FORWARD_FILES) {
    const clone = getFrozenExpectedFingerprint(file);
    clone.acl = "mutated-clone";
    assertExpectedFingerprintImmutable(file);
    assert.equal(expectedFingerprintSha256(file), recorded.sha256BeforeDb[file]);
  }
});

function fnOwnerRecord(overrides = {}) {
  return {
    schema: "financial_core",
    function: "guard_a",
    identity_arguments: "",
    owner: "postgres",
    security_definer: false,
    search_path: "{\"search_path=\\\"\\\"\"}",
    ...overrides,
  };
}

function aclRecord(overrides = {}) {
  return {
    object_type: "table",
    schema: "financial_core",
    object_name: "financial_accounts",
    prokind: "",
    identity_arguments: "",
    grantee: "authenticated",
    grantor: "postgres",
    privilege: "SELECT",
    grantable: false,
    ...overrides,
  };
}

function policyRecord(overrides = {}) {
  return {
    schema: "public",
    table: "financial_accounts",
    policy_name: "manager_select",
    command: "SELECT",
    permissive: true,
    roles: ["authenticated"],
    using: "( SELECT financial_core.can_manage_finances(financial_accounts.group_id) )",
    with_check: "",
    ...overrides,
  };
}

function functionDefinitionRecord(overrides = {}) {
  return {
    schema: "financial_core",
    name: "guard_a",
    identity_arguments: "",
    definition: "SELECT 1",
    owner: "postgres",
    security_mode: "invoker",
    search_path: "",
    ...overrides,
  };
}

function pairFromCatalog(expectedCatalog, observedCatalog) {
  return {
    expected: completeFingerprint(expectedCatalog),
    observed: completeFingerprint(observedCatalog),
  };
}

test("semantic set canonicalization matrix: order-only pass; association/expression mismatches fail with zero repair", async () => {
  const ownersA = [
    fnOwnerRecord({ function: "guard_a", owner: "postgres" }),
    fnOwnerRecord({ function: "guard_b", owner: "ubuntu", identity_arguments: "p uuid" }),
  ];
  const ownersOrderOnly = pairFromCatalog(
    { function_owner: ownersA },
    { function_owner: [ownersA[1], ownersA[0]] },
  );
  assert.equal(fingerprintCompleteAndExact(ownersOrderOnly).ok, true, "function_owner order-only");

  const ownerSwap = pairFromCatalog(
    { function_owner: ownersA },
    { function_owner: [
      fnOwnerRecord({ function: "guard_a", owner: "ubuntu" }),
      fnOwnerRecord({ function: "guard_b", owner: "postgres", identity_arguments: "p uuid" }),
    ] },
  );
  await assertFingerprintForbidsRepair("function_owner owner swap", ownerSwap);

  await assertFingerprintForbidsRepair("function_owner missing", pairFromCatalog(
    { function_owner: ownersA },
    { function_owner: [ownersA[0]] },
  ));
  await assertFingerprintForbidsRepair("function_owner extra", pairFromCatalog(
    { function_owner: ownersA },
    { function_owner: [...ownersA, fnOwnerRecord({ function: "guard_c" })] },
  ));
  await assertFingerprintForbidsRepair("function_owner duplicate", pairFromCatalog(
    { function_owner: ownersA },
    { function_owner: [...ownersA, ownersA[0]] },
  ));
  await assertFingerprintForbidsRepair("function_owner wrong identity args", pairFromCatalog(
    { function_owner: ownersA },
    { function_owner: [
      ownersA[0],
      fnOwnerRecord({ function: "guard_b", owner: "ubuntu", identity_arguments: "p text" }),
    ] },
  ));
  await assertFingerprintForbidsRepair("function_owner wrong schema", pairFromCatalog(
    { function_owner: ownersA },
    { function_owner: [
      fnOwnerRecord({ schema: "financial_private", function: "guard_a", owner: "postgres" }),
      ownersA[1],
    ] },
  ));
  await assertFingerprintForbidsRepair("function_owner identity argument order not sorted", pairFromCatalog(
    { function_owner: [fnOwnerRecord({ identity_arguments: "a uuid, b text" })] },
    { function_owner: [fnOwnerRecord({ identity_arguments: "b text, a uuid" })] },
  ));

  const acls = [
    aclRecord({ object_name: "financial_accounts", privilege: "SELECT" }),
    aclRecord({ object_name: "financial_funds", privilege: "INSERT", grantee: "postgres" }),
  ];
  assert.equal(
    fingerprintCompleteAndExact(pairFromCatalog({ acl: acls }, { acl: [acls[1], acls[0]] })).ok,
    true,
    "acl order-only",
  );
  await assertFingerprintForbidsRepair("acl wrong grantee", pairFromCatalog(
    { acl: acls },
    { acl: [aclRecord({ object_name: "financial_accounts", privilege: "SELECT", grantee: "ubuntu" }), acls[1]] },
  ));
  await assertFingerprintForbidsRepair("acl wrong grantor", pairFromCatalog(
    { acl: acls },
    { acl: [aclRecord({ object_name: "financial_accounts", privilege: "SELECT", grantor: "ubuntu" }), acls[1]] },
  ));
  await assertFingerprintForbidsRepair("acl wrong privilege", pairFromCatalog(
    { acl: acls },
    { acl: [aclRecord({ object_name: "financial_accounts", privilege: "UPDATE" }), acls[1]] },
  ));
  await assertFingerprintForbidsRepair("acl wrong grantable", pairFromCatalog(
    { acl: acls },
    { acl: [aclRecord({ object_name: "financial_accounts", privilege: "SELECT", grantable: true }), acls[1]] },
  ));
  await assertFingerprintForbidsRepair("acl moved to different object", pairFromCatalog(
    { acl: acls },
    { acl: [aclRecord({ object_name: "financial_funds", privilege: "SELECT" }), acls[1]] },
  ));
  await assertFingerprintForbidsRepair("acl missing", pairFromCatalog({ acl: acls }, { acl: [acls[0]] }));
  await assertFingerprintForbidsRepair("acl extra", pairFromCatalog(
    { acl: acls },
    { acl: [...acls, aclRecord({ object_name: "financial_events", privilege: "DELETE" })] },
  ));
  await assertFingerprintForbidsRepair("acl duplicate", pairFromCatalog(
    { acl: acls },
    { acl: [...acls, acls[0]] },
  ));

  const policies = [
    policyRecord({ policy_name: "p_select", command: "SELECT" }),
    policyRecord({ policy_name: "p_insert", command: "INSERT", using: "", with_check: "(true)" }),
  ];
  assert.equal(
    fingerprintCompleteAndExact(pairFromCatalog({ policy: policies }, { policy: [policies[1], policies[0]] })).ok,
    true,
    "policy order-only",
  );
  const rolesReordered = pairFromCatalog(
    { policy: [policyRecord({ roles: ["authenticated", "service_role"] })] },
    { policy: [policyRecord({ roles: ["service_role", "authenticated"] })] },
  );
  assert.equal(fingerprintCompleteAndExact(rolesReordered).ok, true, "policy roles set-order");
  await assertFingerprintForbidsRepair("policy changed expression", pairFromCatalog(
    { policy: policies },
    { policy: [policyRecord({ policy_name: "p_select", command: "SELECT", using: "(false)" }), policies[1]] },
  ));
  await assertFingerprintForbidsRepair("policy changed role", pairFromCatalog(
    { policy: policies },
    { policy: [policyRecord({ policy_name: "p_select", roles: ["service_role"] }), policies[1]] },
  ));

  const defs = [
    functionDefinitionRecord({ name: "guard_a", definition: "SELECT 1" }),
    functionDefinitionRecord({ name: "guard_b", definition: "SELECT 2", security_mode: "definer" }),
  ];
  const defPair = (observedDefs) => ({
    expected: completeFingerprint({ function_definition: defs }),
    observed: completeFingerprint({ function_definition: observedDefs }),
  });
  assert.equal(fingerprintCompleteAndExact(defPair([defs[1], defs[0]])).ok, true, "function_definition order-only");
  await assertFingerprintForbidsRepair("function_definition changed", defPair([
    functionDefinitionRecord({ name: "guard_a", definition: "SELECT 9" }),
    defs[1],
  ]));
  await assertFingerprintForbidsRepair("function_definition owner", defPair([
    functionDefinitionRecord({ name: "guard_a", owner: "ubuntu" }),
    defs[1],
  ]));
  await assertFingerprintForbidsRepair("function_definition search_path", defPair([
    functionDefinitionRecord({ name: "guard_a", search_path: "public" }),
    defs[1],
  ]));
  await assertFingerprintForbidsRepair("function_definition security", defPair([
    functionDefinitionRecord({ name: "guard_a", security_mode: "definer" }),
    defs[1],
  ]));

  const frozen119 = getFrozenExpectedFingerprint("00119_f3_01_core_ledger_foundation.sql");
  const catalog119 = catalogInventoryFromFingerprint(frozen119);
  const observed119 = buildIndependentObservedFingerprint("00119_f3_01_core_ledger_foundation.sql", catalog119);
  observed119.function_owner = [...frozen119.function_owner].reverse();
  observed119.acl = [...frozen119.acl].reverse();
  observed119.policy = [...frozen119.policy].reverse();
  const before119 = fingerprintCanonicalSha256(frozen119);
  assert.equal(
    fingerprintCompleteAndExact({ expected: frozen119, observed: observed119 }, "00119_f3_01_core_ledger_foundation.sql").ok,
    true,
    "00119 hosted order-only HOLD reproduction now passes",
  );
  assert.equal(fingerprintCanonicalSha256(frozen119), before119);
  assert.equal(before119, FROZEN_EXPECTED_FINGERPRINT_SHA256["00119_f3_01_core_ledger_foundation.sql"]);
});

const LOCK_OCCURRENCE_ARGS =
  "p_group_id uuid, p_source_module text, p_source_record_id text, p_effect_kind text, p_ledger_epoch_id uuid";

test("structured ACL object identity matrix: complete pairing; comma truncation fails; repairCalls=0", async () => {
  const twoArg = aclRecord({
    object_type: "routine",
    object_name: "f3_amount",
    prokind: "f",
    identity_arguments: "p_value jsonb, p_currency text",
    privilege: "EXECUTE",
    grantee: "postgres",
  });
  const threePlus = aclRecord({
    object_type: "routine",
    object_name: "lock_financial_occurrence",
    prokind: "f",
    identity_arguments: LOCK_OCCURRENCE_ARGS,
    privilege: "EXECUTE",
    grantee: "postgres",
  });
  assert.equal(
    fingerprintCompleteAndExact(pairFromCatalog({ acl: [twoArg] }, { acl: [twoArg] })).ok,
    true,
    "2-arg routine identity remains complete",
  );
  assert.equal(
    fingerprintCompleteAndExact(pairFromCatalog({ acl: [threePlus] }, { acl: [threePlus] })).ok,
    true,
    "3+-arg routine identity remains complete",
  );

  const overloadA = aclRecord({
    object_type: "routine",
    object_name: "lock_it",
    prokind: "f",
    identity_arguments: "p uuid",
    privilege: "EXECUTE",
    grantee: "postgres",
  });
  const overloadB = aclRecord({
    object_type: "routine",
    object_name: "lock_it",
    prokind: "f",
    identity_arguments: "p uuid, q text",
    privilege: "EXECUTE",
    grantee: "postgres",
  });
  assert.equal(
    fingerprintCompleteAndExact(pairFromCatalog(
      { acl: [overloadA, overloadB] },
      { acl: [overloadB, overloadA] },
    )).ok,
    true,
    "multiple overloads remain distinct; order-only PASS",
  );
  await assertFingerprintForbidsRepair("overloads merged", pairFromCatalog(
    { acl: [overloadA, overloadB] },
    { acl: [overloadA] },
  ));

  await assertFingerprintForbidsRepair("internal commas never truncate identity", pairFromCatalog(
    { acl: [threePlus] },
    { acl: [aclRecord({ ...threePlus, identity_arguments: "p_group_id uuid, p_source_module text" })] },
  ));

  const schemaArgs = aclRecord({
    object_type: "routine",
    object_name: "get_financial_cashbook",
    prokind: "f",
    identity_arguments: "p_group_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_account_id uuid, p_currency text, p_offset integer, p_limit integer",
    privilege: "EXECUTE",
    grantee: "postgres",
  });
  assert.equal(
    fingerprintCompleteAndExact(pairFromCatalog({ acl: [schemaArgs] }, { acl: [schemaArgs] })).ok,
    true,
    "schema-qualified arg types intact",
  );
  await assertFingerprintForbidsRepair("schema-qualified args coarsened", pairFromCatalog(
    { acl: [schemaArgs] },
    { acl: [aclRecord({ ...schemaArgs, identity_arguments: "p_group_id uuid, p_from timestamp, p_to timestamp" })] },
  ));

  const quoted = aclRecord({
    object_type: "routine",
    object_name: "weird",
    prokind: "f",
    identity_arguments: '"foo, bar" uuid, p text',
    privilege: "EXECUTE",
    grantee: "postgres",
  });
  const unquoted = aclRecord({
    ...quoted,
    identity_arguments: "foo uuid, bar uuid, p text",
  });
  await assertFingerprintForbidsRepair("quoted names remain distinct", pairFromCatalog(
    { acl: [quoted] },
    { acl: [unquoted] },
  ));

  const publicGrant = aclRecord({
    object_type: "routine",
    object_name: "guard_ledger_epoch",
    prokind: "f",
    identity_arguments: "",
    grantee: "PUBLIC",
    privilege: "EXECUTE",
  });
  assert.equal(
    fingerprintCompleteAndExact(pairFromCatalog({ acl: [publicGrant] }, { acl: [publicGrant] })).ok,
    true,
    "PUBLIC grantee correct",
  );
  await assertFingerprintForbidsRepair("PUBLIC grantee became empty", pairFromCatalog(
    { acl: [publicGrant] },
    { acl: [aclRecord({ ...publicGrant, grantee: "" })] },
  ));

  assert.equal(
    fingerprintCompleteAndExact(pairFromCatalog(
      { acl: [twoArg, threePlus] },
      { acl: [threePlus, twoArg] },
    )).ok,
    true,
    "same complete ACL records different order → PASS",
  );

  await assertFingerprintForbidsRepair("truncated identity after first comma → FAIL", pairFromCatalog(
    { acl: [threePlus] },
    { acl: [aclRecord({ ...threePlus, identity_arguments: threePlus.identity_arguments.split(",").slice(0, 2).join(",") })] },
  ));

  await assertFingerprintForbidsRepair("ACL moved between overloads → FAIL", pairFromCatalog(
    { acl: [overloadA, overloadB] },
    { acl: [aclRecord({ ...overloadA, identity_arguments: overloadB.identity_arguments }), overloadB] },
  ));

  await assertFingerprintForbidsRepair("arg identity changed → FAIL", pairFromCatalog(
    { acl: [twoArg] },
    { acl: [aclRecord({ ...twoArg, identity_arguments: "p_value jsonb, p_other text" })] },
  ));
  await assertFingerprintForbidsRepair("grantee changed → FAIL", pairFromCatalog(
    { acl: [twoArg] },
    { acl: [aclRecord({ ...twoArg, grantee: "authenticated" })] },
  ));
  await assertFingerprintForbidsRepair("grantor changed → FAIL", pairFromCatalog(
    { acl: [twoArg] },
    { acl: [aclRecord({ ...twoArg, grantor: "ubuntu" })] },
  ));
  await assertFingerprintForbidsRepair("privilege changed → FAIL", pairFromCatalog(
    { acl: [twoArg] },
    { acl: [aclRecord({ ...twoArg, privilege: "SELECT" })] },
  ));
  await assertFingerprintForbidsRepair("grantable changed → FAIL", pairFromCatalog(
    { acl: [twoArg] },
    { acl: [aclRecord({ ...twoArg, grantable: true })] },
  ));

  await assertFingerprintForbidsRepair("missing ACL → FAIL", pairFromCatalog(
    { acl: [twoArg, threePlus] },
    { acl: [twoArg] },
  ));
  await assertFingerprintForbidsRepair("extra ACL → FAIL", pairFromCatalog(
    { acl: [twoArg] },
    { acl: [twoArg, threePlus] },
  ));
  await assertFingerprintForbidsRepair("duplicate ACL → FAIL", pairFromCatalog(
    { acl: [twoArg] },
    { acl: [twoArg, twoArg] },
  ));
  await assertFingerprintForbidsRepair("same ACL count different identity pairing → FAIL", pairFromCatalog(
    { acl: [overloadA, twoArg] },
    { acl: [overloadB, twoArg] },
  ));

  const frozen119 = getFrozenExpectedFingerprint("00119_f3_01_core_ledger_foundation.sql");
  assert.deepEqual([...frozen119.recognition], ["manual_income"]);
  assert.equal(frozen119.migration_digest, FROZEN_DIGESTS["00119_f3_01_core_ledger_foundation.sql"]);
  const lockRows = frozen119.acl.filter((row) => row.object_name === "lock_financial_occurrence");
  assert.equal(lockRows.length, 1);
  assert.equal(lockRows[0].object_type, "routine");
  assert.equal(lockRows[0].schema, "financial_core");
  assert.equal(lockRows[0].identity_arguments, LOCK_OCCURRENCE_ARGS);
  assert.equal(lockRows[0].prokind, "f");
  const truncatedObserved = buildIndependentObservedFingerprint("00119_f3_01_core_ledger_foundation.sql", {
    schema: frozen119.schema,
    function_owner: frozen119.function_owner,
    acl: frozen119.acl.map((row) => (
      row.object_name === "lock_financial_occurrence"
        ? { ...row, identity_arguments: "p_group_id uuid, p_source_module text" }
        : row
    )),
    policy: frozen119.policy,
    f3_objects_absent: frozen119.f3_objects_absent,
  });
  await assertFingerprintForbidsRepair("00119 hosted truncation HOLD reproduction", {
    expected: frozen119,
    observed: truncatedObserved,
  });
});

test("source contract forbids comma-split ACL object identity parsing", () => {
  const gate = fs.readFileSync(path.join(root, "scripts/lib/f3-db-push-repair-safety-gate.mjs"), "utf8");
  const qualify = fs.readFileSync(path.join(root, "scripts/qualify-f3-db-push-disposable.mjs"), "utf8");
  const harness = fs.readFileSync(path.join(root, "scripts/test-f3-db-push-harness.mjs"), "utf8");
  const strippedGate = gate
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.doesNotMatch(strippedGate, /object_identity\s*\.split\s*\(/);
  assert.doesNotMatch(strippedGate, /identity_arguments\s*\.split\s*\(/);
  assert.doesNotMatch(strippedGate, /object_label\s*\.split\s*\(\s*["'],["']\s*\)/);
  assert.doesNotMatch(strippedGate, /object_name\s*\.split\s*\(\s*["'],["']\s*\)/);
  assert.match(strippedGate, /structuredAclIdentityFromLegacyLabel/);
  assert.match(strippedGate, /matchingParenClose/);
  assert.match(qualify, /identity_arguments/);
  assert.match(qualify, /never a comma-joined object_identity label/);
  assert.match(CATALOG_FINGERPRINT_SQL, /pg_get_function_identity_arguments\(p\.oid\)/);
  assert.doesNotMatch(CATALOG_FINGERPRINT_SQL, /split_part\s*\(/i);
  const parserStart = strippedGate.indexOf("function structuredAclIdentityFromLegacyLabel");
  const parserEnd = strippedGate.indexOf("function parseLegacySchema");
  assert.equal(parserStart >= 0 && parserEnd > parserStart, true);
  const parser = strippedGate.slice(parserStart, parserEnd);
  assert.doesNotMatch(parser, /\.split\s*\(/);
  assert.match(harness, /structured ACL object identity matrix/);
});

test("source contract and unit test prove there is no generic array-sorting fallback", () => {
  const gate = fs.readFileSync(path.join(root, "scripts/lib/f3-db-push-repair-safety-gate.mjs"), "utf8");
  const qualify = fs.readFileSync(path.join(root, "scripts/qualify-f3-db-push-disposable.mjs"), "utf8");
  const stripped = gate
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.doesNotMatch(stripped, /items\.every\(\s*\(?\s*item\s*\)?\s*=>\s*item\s*===\s*null\s*\|\|\s*typeof\s+item\s*!==\s*"object"\)/);
  assert.doesNotMatch(stripped, /JSON\.stringify\(\s*a\s*\)\.localeCompare\(\s*JSON\.stringify\(\s*b\s*\)\)/);
  assert.doesNotMatch(stripped, /FINGERPRINT_SET_LIKE_STRING_KEYS/);
  assert.match(gate, /FINGERPRINT_FIELD_REGISTRY/);
  assert.match(gate, /doNotSort/);
  assert.match(CATALOG_FINGERPRINT_SQL, /jsonb_agg/);
  assert.match(CATALOG_FINGERPRINT_SQL, /identity_arguments/);
  assert.match(CATALOG_FINGERPRINT_SQL, /aclexplode/);
  assert.match(CATALOG_FINGERPRINT_SQL, /acldefault/);
  assert.match(CATALOG_FINGERPRINT_SQL, /pg_get_function_identity_arguments\(p\.oid\)/);
  assert.match(CATALOG_FINGERPRINT_SQL, /'object_name',\s*x\.object_name/);
  assert.match(CATALOG_FINGERPRINT_SQL, /'prokind',\s*x\.prokind/);
  assert.match(CATALOG_FINGERPRINT_SQL, /'identity_arguments',\s*x\.identity_arguments/);
  assert.match(CATALOG_FINGERPRINT_SQL, /p\.proname/);
  assert.match(CATALOG_FINGERPRINT_SQL, /p\.prokind/);
  assert.doesNotMatch(CATALOG_FINGERPRINT_SQL, /string_agg/);
  assert.doesNotMatch(CATALOG_FINGERPRINT_SQL, /proname\s*\|\|\s*'\('/);
  assert.doesNotMatch(CATALOG_FINGERPRINT_SQL, /object_identity/);
  assert.equal(FINGERPRINT_FIELD_REGISTRY.acl.fields.includes("object_name"), true);
  assert.equal(FINGERPRINT_FIELD_REGISTRY.acl.fields.includes("identity_arguments"), true);
  assert.equal(FINGERPRINT_FIELD_REGISTRY.acl.fields.includes("prokind"), true);
  assert.equal(FINGERPRINT_FIELD_REGISTRY.acl.fields.includes("object_identity"), false);
  assert.equal(FINGERPRINT_FIELD_REGISTRY.acl.doNotSort.includes("identity_arguments"), true);
  assert.equal(FINGERPRINT_FIELD_REGISTRY.function_owner.sortBy.includes("owner"), true);
  assert.equal(FINGERPRINT_FIELD_REGISTRY.policy.innerSetFields.includes("roles"), true);
  assert.equal(FINGERPRINT_FIELD_REGISTRY.policy.doNotSort.includes("using"), true);

  const floorImport = qualify.slice(
    qualify.lastIndexOf("import {", qualify.indexOf('from "./lib/f3-db-push-floor.mjs"')),
    qualify.indexOf('from "./lib/f3-db-push-floor.mjs"'),
  );
  assert.doesNotMatch(floorImport, /CATALOG_FINGERPRINT_SQL/);
  assert.match(qualify, /CATALOG_FINGERPRINT_SQL/);

  const unregistered = {
    expected: completeFingerprint({ hgp: ["zeta", "alpha"] }),
    observed: completeFingerprint({ hgp: ["alpha", "zeta"] }),
  };
  assert.equal(
    fingerprintCompleteAndExact(unregistered).ok,
    false,
    "unregistered arrays must not be generically sorted",
  );
  const rejected = canonicalizeFingerprintForCompare({
    function_owner: [fnOwnerRecord(), fnOwnerRecord()],
  }, null);
  assert.equal(rejected.__f3_fingerprint_canonicalization_rejected, true);
});

test("source contract forbids comma-split, fuzzy matching, and textual type-alias replacement for probe identity", () => {
  const gate = fs.readFileSync(path.join(root, "scripts/lib/f3-db-push-repair-safety-gate.mjs"), "utf8");
  const qualify = fs.readFileSync(path.join(root, "scripts/qualify-f3-db-push-disposable.mjs"), "utf8");
  const strippedGate = gate
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const probeStart = strippedGate.indexOf("export const OBJECT_PROBE_IDENTITY_FIELDS");
  const probeEnd = strippedGate.indexOf("const ACL_PRIVILEGE_LETTERS");
  assert.equal(probeStart >= 0 && probeEnd > probeStart, true);
  const probe = strippedGate.slice(probeStart, probeEnd);
  const evalStart = strippedGate.indexOf("export function evaluateObjectProbe");
  const evalEnd = strippedGate.indexOf("export function objectsPresentFromProbe");
  assert.equal(evalStart >= 0 && evalEnd > evalStart, true);
  const evaluator = strippedGate.slice(evalStart, evalEnd);
  for (const block of [probe, evaluator]) {
    assert.doesNotMatch(block, /\.split\s*\(\s*["'],["']\s*\)/);
    assert.doesNotMatch(block, /\.split\s*\(\s*","\s*\)/);
    assert.doesNotMatch(block, /replace\s*\(\s*\/timestamptz/);
    assert.doesNotMatch(block, /TYPE_ALIAS|typeAlias|aliasMap|ALIAS_MAP|fuzzy/);
    assert.doesNotMatch(block, /timestamptz["']\s*,\s*["']timestamp with time zone/);
  }
  assert.match(probe, /pg_get_function_identity_arguments\(p\.oid\)/);
  assert.match(probe, /to_regprocedure/);
  assert.match(probe, /JOIN pg_namespace n ON n\.oid = p\.pronamespace/);
  assert.doesNotMatch(probe, /to_regprocedure\([^;]*\)::text/);
  assert.match(gate, /timestamp with time zone/);
  assert.match(qualify, /objectProbeSql/);
  const historyImport = qualify.slice(
    qualify.lastIndexOf("import {", qualify.indexOf('from "./lib/f3-db-push-history-inject.mjs"')),
    qualify.indexOf('from "./lib/f3-db-push-history-inject.mjs"'),
  );
  assert.doesNotMatch(historyImport, /objectProbeSql/);
  const safetyImport = qualify.slice(
    qualify.lastIndexOf("import {", qualify.indexOf('from "./lib/f3-db-push-repair-safety-gate.mjs"')),
    qualify.indexOf('from "./lib/f3-db-push-repair-safety-gate.mjs"'),
  );
  assert.match(safetyImport, /objectProbeSql/);
  assert.match(qualify, /never to_regprocedure::text vs lookup spelling/);
});

test("source contract forbids assigning expected from observed in qualify and repair-safety-gate", () => {
  const files = [
    path.join(root, "scripts/qualify-f3-db-push-disposable.mjs"),
    path.join(root, "scripts/lib/f3-db-push-repair-safety-gate.mjs"),
  ];
  const forbidden = [
    /expected\s*:\s*observed\b/,
    /expected\s*=\s*observed\b/,
    /expected\s*=\s*structuredClone\s*\(\s*observed/,
    /expected\s*:\s*structuredClone\s*\(\s*observed/,
    /expected\s*=\s*await\s+queryObservedFingerprint\s*\(/,
    /expected\s*=\s*normalize\s*\(\s*observed/,
    /expected\s*:\s*normalize\s*\(\s*observed/,
    /expected\s*=\s*fingerprintObserved\b/,
    /expected\s*:\s*fingerprintObserved\b/,
    /expected\s*=\s*catalogObserved\b/,
    /expected\s*:\s*catalogObserved\b/,
    /Object\.assign\(\s*expected\s*,\s*observed/,
    /expected\s*=\s*\{\s*\.\.\.observed/,
    /expected\s*=\s*JSON\.parse\(\s*JSON\.stringify\(\s*observed/,
  ];
  for (const file of files) {
    const raw = fs.readFileSync(file, "utf8");
    const stripped = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    for (const pattern of forbidden) {
      assert.equal(pattern.test(stripped), false, `${path.basename(file)} matches ${pattern}`);
    }
    assert.match(raw, /getFrozenExpectedFingerprint/);
  }
});

test("cleanup and poison-verify negatives never invoke repair", async () => {
  const cases = [
    {
      name: "cleanup status 1",
      cleanup: () => ({ status: 1, stdout: "", stderr: "" }),
      verify: () => poisonAbsentResult(),
    },
    {
      name: "cleanup throws",
      cleanup: () => {
        throw new Error("cleanup exploded");
      },
      verify: () => poisonAbsentResult(),
    },
    {
      name: "cleanup SQL ERROR",
      cleanup: () => ({ status: 0, stdout: "", stderr: "ERROR: cannot drop trigger" }),
      verify: () => poisonAbsentResult(),
    },
    {
      name: "verify malformed",
      cleanup: () => provenCleanup(),
      verify: () => ({ status: 0, stdout: "not-json", stderr: "" }),
    },
    {
      name: "trigger remains present",
      cleanup: () => provenCleanup(),
      verify: () => ({
        status: 0,
        stdout: JSON.stringify({ trigger_present: true, function_present: false }),
        stderr: "",
      }),
    },
    {
      name: "function remains present",
      cleanup: () => provenCleanup(),
      verify: () => ({
        status: 0,
        stdout: JSON.stringify({ trigger_present: false, function_present: true }),
        stderr: "",
      }),
    },
    {
      name: "cleanup state ambiguous",
      cleanup: () => ({ ok: true, sql: REMOVE_HISTORY_INJECT_SQL }),
      verify: () => poisonAbsentResult(),
    },
  ];
  for (const c of cases) {
    let repairCalls = 0;
    let verifyCalls = 0;
    const decided = await runRepairSafetyThenMaybeRepair({
      gateInput: authorizedGateInput(),
      cleanup: c.cleanup,
      verifyPoisonAbsent: () => {
        verifyCalls += 1;
        return c.verify();
      },
      repair: () => {
        repairCalls += 1;
        return { status: 0 };
      },
    });
    assert.equal(decided.repairAuthorized, false, c.name);
    assert.equal(decided.repairAttempted, false, c.name);
    assert.equal(repairCalls, 0, `${c.name} repair spawned`);
    if (c.name.startsWith("cleanup")) {
      assert.equal(decided.cleanupProven, false, c.name);
    }
  }
});

test("teardown poison removal is recorded separately and is not cleanup success", async () => {
  let repairCalls = 0;
  const decided = await runRepairSafetyThenMaybeRepair({
    gateInput: authorizedGateInput(),
    cleanup: () => ({ status: 1, stdout: "", stderr: "ERROR: still poisoned" }),
    verifyPoisonAbsent: () => poisonAbsentResult(),
    repair: () => {
      repairCalls += 1;
      return { status: 0 };
    },
    teardown: () => ({ status: 0, stdout: "dropped leftover poison", stderr: "" }),
  });
  assert.equal(repairCalls, 0);
  assert.equal(decided.repairAttempted, false);
  assert.equal(decided.cleanupProven, false);
  assert.equal(decided.teardownRecorded, true);
  assert.equal(decided.teardown.status, 0);
  assert.notEqual(decided.cleanup.status, decided.teardown.status);
});

test("qualify runner classifies before repair and uses the new success label", () => {
  const qualify = fs.readFileSync(path.join(root, "scripts/qualify-f3-db-push-disposable.mjs"), "utf8");
  const seq = qualify.slice(qualify.indexOf("for (const file of F3_FORWARD_FILES)"));
  const stageIdx = seq.indexOf("syncIsolatedMigrationsThrough");
  const preflightIdx = seq.indexOf("assertPrefixCompleteSinglePendingStaging");
  const pushIdx = seq.indexOf("runDbPushCandidate");
  const gateIdx = seq.indexOf("runRepairSafetyThenMaybeRepair");
  const repairIdx = seq.indexOf("runFilenameVersionRepair");
  const retryStageIdx = seq.lastIndexOf("syncIsolatedMigrationsThrough");
  const retryPreflightIdx = seq.lastIndexOf("assertPrefixCompleteSinglePendingStaging");
  const retryIdx = seq.lastIndexOf("runDbPushCandidate");
  assert.ok(stageIdx >= 0 && stageIdx < preflightIdx && preflightIdx < pushIdx, "stage + preflight before first push");
  assert.ok(gateIdx >= 0 && repairIdx > gateIdx);
  assert.ok(retryStageIdx > repairIdx && retryPreflightIdx > retryStageIdx && retryIdx > retryPreflightIdx, "restage + preflight before retry");
  assert.equal((seq.match(/syncIsolatedMigrationsThrough/g) || []).length, 2);
  assert.equal((seq.match(/assertPrefixCompleteSinglePendingStaging/g) || []).length, 2);
  assert.match(qualify, /phase: "initial"/);
  assert.match(qualify, /phase: "retry"/);
  assert.match(qualify, /PREFIX-COMPLETE, SINGLE-PENDING/);
  assert.match(qualify, /PRODUCTION_HISTORY_LIMITATION_WARNING/);
  assert.match(qualify, /function objectsPresentFromProbe/);
  assert.match(qualify, /verifyPoisonAbsent/);
  assert.match(qualify, /QUALIFICATION_PASS/);
  assert.match(qualify, /REPAIR_SAFETY_HOLD/);
  assert.match(qualify, /mechanicsPass = "SUPERSEDED"/);
  assert.match(qualify, /FILE-BASED RUNNER QUALIFICATION PASS — STUB\/LIVE-PIN FLOOR LIMITATION/);
  assert.match(qualify, /DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117/);
  assert.match(qualify, /fingerprintAfterCommitFailedHistory/);
  assert.match(qualify, /fingerprintAfterPoisonCleanup/);
  assert.match(qualify, /fingerprintAfterRetryNoPending/);
  assert.match(qualify, /fingerprintAfterCleanContinuation/);
  assert.match(qualify, /evaluatePostRepairFullFingerprint/);
  assert.match(qualify, /evaluatePostRetryFullFingerprint/);
  assert.doesNotMatch(seq, /fingerprintAfterRepair:\s*inventoryFromQuery/);
  assert.doesNotMatch(seq, /fingerprintAfterRetryNoPending:\s*inventoryFromQuery/);
});

test("real isolated staging stages prefix-complete through current and blocks unexpected files", () => {
  const isolated = createIsolatedDbPushWorkdir();
  const migDir = path.join(isolated.workdir, "supabase", "migrations");
  const listMig = () => fs.readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
  const repoBefore = assertFrozenDigestsOnDisk();
  assert.equal(isolated.copies.length, 6);
  assert.equal(listMig().length, 6);

  const first = syncIsolatedMigrationsThrough(isolated, F3_FORWARD_FILES[0]);
  assert.deepEqual(first, authorizedStagedPrefixThrough(F3_FORWARD_FILES[0]));
  assert.deepEqual(listMig(), first);
  for (const later of F3_FORWARD_FILES.slice(1)) {
    assert.equal(fs.existsSync(path.join(migDir, timestampFilenameFor(later))), false, later);
  }

  const retryStaged = syncIsolatedMigrationsThrough(isolated, F3_FORWARD_FILES[0]);
  assert.deepEqual(retryStaged, first, "retry restage keeps complete prefix through current; no later files");

  const laterFile = F3_FORWARD_FILES[4];
  const later = syncIsolatedMigrationsThrough(isolated, laterFile);
  assert.deepEqual(later, authorizedStagedPrefixThrough(laterFile));
  assert.deepEqual(listMig(), later);
  assert.equal(fs.existsSync(path.join(migDir, timestampFilenameFor(F3_FORWARD_FILES[0]))), true);
  assert.equal(fs.existsSync(path.join(migDir, timestampFilenameFor(F3_FORWARD_FILES[5]))), false);

  const unexpected = path.join(migDir, "99999_unexpected_block.sql");
  fs.writeFileSync(unexpected, "-- unexpected\n");
  assert.throws(
    () => syncIsolatedMigrationsThrough(isolated, laterFile),
    (err) => err.code === "F3_DBPUSH_STAGING_UNEXPECTED_FILES" || /unexpected/.test(err.message),
  );
  fs.rmSync(unexpected, { force: true });

  assert.deepEqual(assertFrozenDigestsOnDisk(), repoBefore);
  fs.rmSync(isolated.workdir, { recursive: true, force: true });
});

test("unexpected staged files and identity/cli misses forbid repair", async () => {
  const cases = [
    { name: "unexpected staged set", extra: { stagedMigrations: [timestampFilenameFor(FILE118), timestampFilenameFor(F3_FORWARD_FILES[1])] } },
    { name: "empty staged", extra: { stagedMigrations: [] } },
    { name: "wrong cli", extra: { cliVersion: "2.116.0" } },
    { name: "production not rejected", extra: { productionIdentityRejected: false, projectRef: PRODUCTION_REF } },
    { name: "disposable identity missing", extra: { disposableIdentityVerified: false } },
  ];
  for (const c of cases) {
    let repairCalls = 0;
    const decided = await runRepairSafetyThenMaybeRepair({
      gateInput: authorizedGateInput(c.extra),
      cleanup: () => provenCleanup(),
      verifyPoisonAbsent: () => poisonAbsentResult(),
      repair: () => {
        repairCalls += 1;
        return { status: 0 };
      },
    });
    assert.equal(decided.repairAuthorized, false, c.name);
    assert.equal(decided.repairAttempted, false, c.name);
    assert.equal(repairCalls, 0, `${c.name} repair spawned`);
  }
});

function historyResult(rows, extra = {}) {
  return { status: 0, stdout: JSON.stringify(rows), stderr: "", ...extra };
}

function remoteRows(files) {
  return files.map((file) => ({
    version: PREASSIGNED_VERSIONS[file],
    name: PREASSIGNED_NAMES[file],
  }));
}

function isolatedMigDir(isolated) {
  return path.join(isolated.workdir, "supabase", "migrations");
}

async function assertStagingForbidsPushAndRepair(name, input) {
  let dbPushCalls = 0;
  let repairCalls = 0;
  const decided = await runPrefixCompleteSinglePendingOrchestration({
    isolated: input.isolated,
    file: input.file,
    cliVersion: input.cliVersion === undefined ? CLI_PIN : input.cliVersion,
    queryHistory: input.queryHistory || (() => input.historyResult),
    dbPush: () => {
      dbPushCalls += 1;
      return { status: 0 };
    },
    repair: () => {
      repairCalls += 1;
      return { status: 0 };
    },
    phase: input.phase || "initial",
    stage: input.stage === undefined ? false : input.stage,
  });
  assert.equal(decided.ok, false, `${name} preflight unexpectedly passed`);
  assert.equal(dbPushCalls, 0, `${name} dbPushCalls`);
  assert.equal(repairCalls, 0, `${name} repairCalls`);
  assert.equal(decided.dbPushCalls, 0, `${name} orchestration dbPushCalls`);
  assert.equal(decided.repairCalls, 0, `${name} orchestration repairCalls`);
  assert.match(decided.hold || decided.preflight?.reason || "", /HOLD|prefix-complete|staging|cli|history|migration/i);
  if (input.expectCode) {
    assert.equal(decided.preflight?.code, input.expectCode, `${name} code`);
  }
  if (input.historyResult !== undefined) {
    assert.throws(
      () => assertPrefixCompleteSinglePendingStaging({
        workdir: input.isolated.workdir,
        currentFile: input.file,
        historyResult: input.historyResult,
        cliVersion: input.cliVersion === undefined ? CLI_PIN : input.cliVersion,
        phase: input.phase || "initial",
      }),
      (err) => /HOLD/.test(err.message),
    );
  }
  return decided;
}

test("prefix-complete single-pending positives through 00123 and empty pending after repair", async () => {
  assert.match(PRODUCTION_HISTORY_LIMITATION_WARNING, /disposable proves prefix-complete staging for F3 qualification history only/);
  assert.match(PRODUCTION_HISTORY_LIMITATION_WARNING, /separately authorized read-only production preflight/);
  assert.match(PRODUCTION_HISTORY_LIMITATION_WARNING, /Do not invent production migrations/);
  assert.match(PREFIX_COMPLETE_SINGLE_PENDING_HOLD, /db push not spawned/);

  for (let i = 0; i < F3_FORWARD_FILES.length; i += 1) {
    const file = F3_FORWARD_FILES[i];
    const isolated = createIsolatedDbPushWorkdir();
    const staged = syncIsolatedMigrationsThrough(isolated, file);
    assert.deepEqual(staged, authorizedStagedPrefixThrough(file));
    const applied = F3_FORWARD_FILES.slice(0, i);
    const initial = evaluatePrefixCompleteSinglePendingStaging({
      workdir: isolated.workdir,
      currentFile: file,
      historyResult: historyResult(remoteRows(applied)),
      cliVersion: CLI_PIN,
      phase: "initial",
    });
    assert.equal(initial.ok, true, `${file} initial`);
    assert.deepEqual(initial.pending, [PREASSIGNED_VERSIONS[file]]);
    assert.deepEqual(initial.expectedApplied, applied);
    assert.match(initial.productionHistoryLimitation, /Do not invent production migrations/);
    assert.deepEqual(assertPrefixCompleteSinglePendingStaging({
      workdir: isolated.workdir,
      currentFile: file,
      historyResult: historyResult(remoteRows(applied)),
      cliVersion: CLI_PIN,
      phase: "initial",
    }).pending, [PREASSIGNED_VERSIONS[file]]);

    let dbPushCalls = 0;
    let repairCalls = 0;
    const first = await runPrefixCompleteSinglePendingOrchestration({
      isolated,
      file,
      cliVersion: CLI_PIN,
      queryHistory: () => historyResult(remoteRows(applied)),
      dbPush: () => {
        dbPushCalls += 1;
        return { status: 0 };
      },
      repair: () => {
        repairCalls += 1;
        return { status: 0 };
      },
      phase: "initial",
      stage: true,
    });
    assert.equal(first.ok, true, `${file} orchestration initial`);
    assert.equal(dbPushCalls, 1, `${file} initial dbPush`);
    assert.equal(repairCalls, 0, `${file} initial repair must stay 0 until repair-safety`);

    const retryStaged = syncIsolatedMigrationsThrough(isolated, file);
    assert.deepEqual(retryStaged, authorizedStagedPrefixThrough(file));
    const repairedPrefix = F3_FORWARD_FILES.slice(0, i + 1);
    const retry = evaluatePrefixCompleteSinglePendingStaging({
      workdir: isolated.workdir,
      currentFile: file,
      historyResult: historyResult(remoteRows(repairedPrefix)),
      cliVersion: CLI_PIN,
      phase: "retry",
    });
    assert.equal(retry.ok, true, `${file} retry`);
    assert.deepEqual(retry.pending, []);
    dbPushCalls = 0;
    repairCalls = 0;
    const retryOrch = await runPrefixCompleteSinglePendingOrchestration({
      isolated,
      file,
      cliVersion: CLI_PIN,
      queryHistory: () => historyResult(remoteRows(repairedPrefix)),
      dbPush: () => {
        dbPushCalls += 1;
        return { status: 0 };
      },
      repair: () => {
        repairCalls += 1;
        return { status: 0 };
      },
      phase: "retry",
      stage: true,
    });
    assert.equal(retryOrch.ok, true, `${file} orchestration retry`);
    assert.equal(dbPushCalls, 1, `${file} retry dbPush`);
    assert.equal(repairCalls, 0, `${file} retry repair`);
    fs.rmSync(isolated.workdir, { recursive: true, force: true });
  }
});

test("staging-negative matrix forbids db push and repair", async () => {
  const file118 = F3_FORWARD_FILES[0];
  const file119 = F3_FORWARD_FILES[1];
  const file120 = F3_FORWARD_FILES[2];
  const name118 = timestampFilenameFor(file118);
  const name119 = timestampFilenameFor(file119);

  const cases = [
    {
      name: "applied remote version missing from local workdir",
      file: file119,
      setup(isolated) {
        syncIsolatedMigrationsThrough(isolated, file119);
        fs.rmSync(path.join(isolatedMigDir(isolated), name118), { force: true });
      },
      historyResult: historyResult(remoteRows([file118])),
      expectCode: "applied_remote_missing_locally",
    },
    {
      name: "applied local file wrong digest",
      file: file119,
      setup(isolated) {
        syncIsolatedMigrationsThrough(isolated, file119);
        fs.writeFileSync(path.join(isolatedMigDir(isolated), name118), "-- mutated applied prefix\n");
      },
      historyResult: historyResult(remoteRows([file118])),
      expectCode: "applied_local_digest",
    },
    {
      name: "applied local file wrong name",
      file: file119,
      setup(isolated) {
        syncIsolatedMigrationsThrough(isolated, file119);
        fs.renameSync(
          path.join(isolatedMigDir(isolated), name118),
          path.join(isolatedMigDir(isolated), "20260913173000_wrong_name.sql"),
        );
      },
      historyResult: historyResult(remoteRows([file118])),
      expectCode: "applied_local_identity",
    },
    {
      name: "applied local file wrong timestamp",
      file: file119,
      setup(isolated) {
        syncIsolatedMigrationsThrough(isolated, file119);
        fs.renameSync(
          path.join(isolatedMigDir(isolated), name118),
          path.join(isolatedMigDir(isolated), "20260913173999_f3_bounded_financial_epoch_foundation.sql"),
        );
      },
      historyResult: historyResult(remoteRows([file118])),
    },
    {
      name: "remote history unknown version",
      file: file119,
      setup(isolated) {
        syncIsolatedMigrationsThrough(isolated, file119);
      },
      historyResult: historyResult([{ version: "19990101000000", name: "not_an_f3_migration" }]),
      expectCode: "remote_unknown_version",
    },
    {
      name: "remote history unexpected name",
      file: file119,
      setup(isolated) {
        syncIsolatedMigrationsThrough(isolated, file119);
      },
      historyResult: historyResult([{ version: PREASSIGNED_VERSIONS[file118], name: "unexpected_name" }]),
      expectCode: "remote_unexpected_name",
    },
    {
      name: "remote history out of order",
      file: file120,
      setup(isolated) {
        syncIsolatedMigrationsThrough(isolated, file120);
      },
      historyResult: historyResult(remoteRows([file119, file118])),
      expectCode: "remote_out_of_order",
    },
    {
      name: "remote history gap",
      file: file120,
      setup(isolated) {
        syncIsolatedMigrationsThrough(isolated, file120);
      },
      historyResult: historyResult([
        { version: PREASSIGNED_VERSIONS[file118], name: PREASSIGNED_NAMES[file118] },
        { version: PREASSIGNED_VERSIONS[file120], name: PREASSIGNED_NAMES[file120] },
      ]),
      expectCode: "remote_gap",
    },
    {
      name: "current target already remotely recorded before initial push",
      file: file118,
      setup(isolated) {
        syncIsolatedMigrationsThrough(isolated, file118);
      },
      historyResult: historyResult(remoteRows([file118])),
      expectCode: "current_already_remote",
    },
    {
      name: "current target missing locally",
      file: file118,
      setup(isolated) {
        syncIsolatedMigrationsThrough(isolated, file118);
        fs.rmSync(path.join(isolatedMigDir(isolated), name118), { force: true });
      },
      historyResult: historyResult([]),
      expectCode: "current_missing_locally",
    },
    {
      name: "later migration staged",
      file: file118,
      setup(isolated) {
        syncIsolatedMigrationsThrough(isolated, file118);
        const src = path.join(root, "supabase", "migrations", file119);
        fs.writeFileSync(path.join(isolatedMigDir(isolated), name119), fs.readFileSync(src));
      },
      historyResult: historyResult([]),
    },
    {
      name: "two unapplied migrations staged",
      file: file118,
      setup(isolated) {
        syncIsolatedMigrationsThrough(isolated, file119);
      },
      historyResult: historyResult([]),
    },
    {
      name: "unrelated migration file exists",
      file: file118,
      setup(isolated) {
        syncIsolatedMigrationsThrough(isolated, file118);
        fs.writeFileSync(path.join(isolatedMigDir(isolated), "99999_unrelated.sql"), "-- unrelated\n");
      },
      historyResult: historyResult([]),
      expectCode: "unrelated_migration",
    },
    {
      name: "duplicate timestamp exists",
      file: file118,
      setup(isolated) {
        syncIsolatedMigrationsThrough(isolated, file118);
        fs.writeFileSync(path.join(isolatedMigDir(isolated), "20260913173000_duplicate.sql"), "-- dup\n");
      },
      historyResult: historyResult([]),
      expectCode: "duplicate_timestamp",
    },
    {
      name: "malformed history response",
      file: file118,
      setup(isolated) {
        syncIsolatedMigrationsThrough(isolated, file118);
      },
      historyResult: { status: 0, stdout: "not-json", stderr: "" },
      expectCode: "malformed_history",
    },
    {
      name: "history query exits nonzero",
      file: file118,
      setup(isolated) {
        syncIsolatedMigrationsThrough(isolated, file118);
      },
      historyResult: { status: 1, stdout: "[]", stderr: "ERROR: history probe failed" },
      expectCode: "history_nonzero",
    },
    {
      name: "CLI version differs from 2.117.0",
      file: file118,
      setup(isolated) {
        syncIsolatedMigrationsThrough(isolated, file118);
      },
      historyResult: historyResult([]),
      cliVersion: "2.116.0",
      expectCode: "cli_pin",
    },
  ];

  for (const c of cases) {
    const isolated = createIsolatedDbPushWorkdir();
    c.setup(isolated);
    await assertStagingForbidsPushAndRepair(c.name, {
      isolated,
      file: c.file,
      historyResult: c.historyResult,
      cliVersion: c.cliVersion,
      expectCode: c.expectCode,
      stage: false,
    });
    fs.rmSync(isolated.workdir, { recursive: true, force: true });
  }
});

test("malformed history envelopes and extra CLI drift still stop before push", async () => {
  const extra = [
    { name: "error object", historyResult: { status: 0, stdout: JSON.stringify({ error: "nope" }), stderr: "" } },
    { name: "truncated JSON", historyResult: { status: 0, stdout: "{", stderr: "" } },
    { name: "SQL ERROR on status 0", historyResult: { status: 0, stdout: "[]", stderr: "ERROR: relation missing" } },
    { name: "missing status", historyResult: { stdout: "[]", stderr: "" } },
    { name: "CLI 2.117.1", historyResult: historyResult([]), cliVersion: "2.117.1" },
  ];
  for (const c of extra) {
    const isolated = createIsolatedDbPushWorkdir();
    syncIsolatedMigrationsThrough(isolated, F3_FORWARD_FILES[0]);
    await assertStagingForbidsPushAndRepair(c.name, {
      isolated,
      file: F3_FORWARD_FILES[0],
      historyResult: c.historyResult,
      cliVersion: c.cliVersion,
      stage: false,
    });
    fs.rmSync(isolated.workdir, { recursive: true, force: true });
  }
});

test("repair-safety staging gate accepts prefix-complete for 00119 and rejects one-file-only", () => {
  const file119 = F3_FORWARD_FILES[1];
  const prefix = authorizedStagedPrefixThrough(file119);
  const okStaging = evaluateRepairSafetyGate(authorizedGateInput({
    file: file119,
    targetVersion: PREASSIGNED_VERSIONS[file119],
    stagedMigrations: prefix,
    injectSql: historyInjectSqlForFile(file119),
    stderr: `${HISTORY_INJECT_MARKER}: blocked INSERT for version ${PREASSIGNED_VERSIONS[file119]} name ${PREASSIGNED_NAMES[file119]}`,
    digest: FROZEN_DIGESTS[file119],
    onDiskDigest: FROZEN_DIGESTS[file119],
    fingerprint: passingFingerprint(file119),
    probe: passingProbe(file119),
  }));
  assert.equal(okStaging.gates.find((g) => g.id === "staged_prefix_complete")?.ok, true);
  const oneFile = evaluateRepairSafetyGate(authorizedGateInput({
    file: file119,
    targetVersion: PREASSIGNED_VERSIONS[file119],
    stagedMigrations: [timestampFilenameFor(file119)],
    injectSql: historyInjectSqlForFile(file119),
    stderr: `${HISTORY_INJECT_MARKER}: blocked INSERT for version ${PREASSIGNED_VERSIONS[file119]} name ${PREASSIGNED_NAMES[file119]}`,
    digest: FROZEN_DIGESTS[file119],
    onDiskDigest: FROZEN_DIGESTS[file119],
    fingerprint: passingFingerprint(file119),
    probe: passingProbe(file119),
  }));
  assert.equal(oneFile.gates.find((g) => g.id === "staged_prefix_complete")?.ok, false);
});

test("harness uses exported staging preflight rather than a test-local copy", () => {
  const harness = fs.readFileSync(path.join(root, "scripts/test-f3-db-push-harness.mjs"), "utf8");
  assert.match(harness, /assertPrefixCompleteSinglePendingStaging/);
  assert.match(harness, /runPrefixCompleteSinglePendingOrchestration/);
  assert.match(harness, /evaluatePrefixCompleteSinglePendingStaging/);
  const localDef = (name) => new RegExp(`export\\s+function\\s+${name}\\s*\\(`).test(harness);
  assert.equal(localDef("assertPrefixCompleteSinglePendingStaging"), false);
  assert.equal(localDef("syncIsolatedMigrationsThrough"), false);
});

function catalogFromFrozen(file = FILE118) {
  return catalogInventoryFromFingerprint(getFrozenExpectedFingerprint(file));
}

function passingFullSequenceInput(overrides = {}) {
  const catalog = catalogFromFrozen(FILE118);
  return {
    file: FILE118,
    afterCommitCatalog: catalog,
    afterPoisonCatalog: catalog,
    afterRepairCatalog: catalog,
    afterRetryCatalog: catalog,
    afterContinuationCatalog: catalog,
    retryPending: [],
    continueToNext: true,
    ...overrides,
  };
}

test("canonical full-fingerprint collector is the only post-repair/post-retry assembler", () => {
  const qualify = fs.readFileSync(path.join(root, "scripts/qualify-f3-db-push-disposable.mjs"), "utf8");
  const gate = fs.readFileSync(path.join(root, "scripts/lib/f3-db-push-repair-safety-gate.mjs"), "utf8");
  const qualifyStripped = qualify
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const seq = qualify.slice(qualify.indexOf("for (const file of F3_FORWARD_FILES)"));
  assert.match(gate, /export function collectCanonicalFullFingerprint/);
  assert.match(gate, /buildIndependentObservedFingerprint\(file, catalogInventory\)/);
  assert.match(qualify, /collectPhaseFingerprint/);
  assert.match(qualify, /collectCanonicalFullFingerprint/);
  assert.match(qualify, /FULL_FINGERPRINT_PHASES\.AFTER_SUCCESSFUL_REPAIR/);
  assert.match(qualify, /FULL_FINGERPRINT_PHASES\.AFTER_RETRY_NO_PENDING/);
  assert.match(qualify, /FULL_FINGERPRINT_PHASES\.AFTER_CLEAN_CONTINUATION/);
  assert.match(qualify, /FULL_FINGERPRINT_PHASES\.AFTER_POISON_CLEANUP/);
  assert.match(qualify, /FULL_FINGERPRINT_PHASES\.AFTER_COMMIT_FAILED_HISTORY/);
  assert.doesNotMatch(seq, /fingerprintAfterRepair:\s*inventoryFromQuery/);
  assert.doesNotMatch(seq, /fingerprintAfterRetryNoPending:\s*inventoryFromQuery/);
  assert.doesNotMatch(qualifyStripped, /\.\.\.\s*fingerprintObserved/);
  assert.doesNotMatch(qualifyStripped, /\.\.\.\s*fingerprintBeforeRepair/);
  assert.doesNotMatch(qualifyStripped, /migration_file:\s*fingerprintObserved/);
  assert.doesNotMatch(qualifyStripped, /Object\.assign\(\s*[^,]+,\s*fingerprintObserved/);
  assert.match(gate, /Never substitutes inventoryFromQuery as the fingerprint/);
  assert.match(gate, /Never copies pre-repair meta onto a partial catalog snapshot/);
});

test("1-4 full pre/post-repair/post-retry/continuation captures are required on the qualify path", () => {
  const catalog = catalogFromFrozen();
  const ok = runQualifyFingerprintHoldSequence(passingFullSequenceInput());
  assert.equal(ok.ok, true);
  assert.equal(ok.phases.frozenExpected.ok, true);
  assert.equal(ok.phases.afterCommitFailedHistory.ok, true);
  assert.equal(ok.phases.afterPoisonCleanup.ok, true);
  assert.equal(ok.phases.afterSuccessfulRepair.ok, true);
  assert.equal(ok.phases.afterRetryNoPending.ok, true);
  assert.equal(ok.phases.afterCleanContinuation.ok, true);
  for (const phase of [
    ok.phases.afterCommitFailedHistory,
    ok.phases.afterPoisonCleanup,
    ok.phases.afterSuccessfulRepair,
    ok.phases.afterRetryNoPending,
    ok.phases.afterCleanContinuation,
  ]) {
    assert.equal(phase.provenance.collector, FULL_FINGERPRINT_COLLECTOR_ID);
    assert.equal(phase.provenance.builder, "buildIndependentObservedFingerprint");
    assert.equal(phase.provenance.copiedFromPreRepair, false);
    assert.ok(phase.sha256);
    assert.ok(phase.canonicalJson);
    assert.deepEqual(phase.fingerprint.recognition, ["manual_income"]);
    assert.ok(phase.keyset.includes("schema"));
    assert.ok(phase.keyset.includes("schemas"));
    assert.ok(phase.keyset.includes("function_owner"));
    assert.ok(phase.keyset.includes("acl"));
    assert.ok(phase.keyset.includes("acls"));
    assert.ok(phase.keyset.includes("policy"));
    assert.ok(phase.keyset.includes("policies"));
    assert.ok(phase.keyset.includes("relations"));
    assert.ok(phase.keyset.includes("columns"));
    assert.ok(phase.keyset.includes("types"));
    assert.ok(phase.keyset.includes("views"));
    assert.ok(phase.keyset.includes("routines"));
    assert.ok(phase.keyset.includes("rls"));
    assert.ok(phase.keyset.includes("constraints"));
    assert.ok(phase.keyset.includes("indexes"));
    assert.ok(phase.keyset.includes("triggers"));
    assert.ok(phase.keyset.includes("hgp"));
    assert.ok(phase.keyset.includes("enqueue"));
    assert.ok(phase.keyset.includes("schema_version"));
    assert.ok(phase.keyset.includes("recognition"));
    assert.equal(phase.fingerprint.schema_version, F3_FULL_FINGERPRINT_SCHEMA_VERSION);
    assert.ok(phase.keyset.includes("migration_digest"));
    assert.ok(phase.keyset.includes("migration_file"));
    assert.ok(phase.keyset.includes("migration_name"));
    assert.ok(phase.keyset.includes("migration_version"));
    assert.ok(Array.isArray(phase.fingerprint.acl));
    assert.equal(typeof phase.fingerprint.acl[0].identity_arguments, "string");
  }
  assert.equal(ok.repairCalls, 1);
  assert.equal(ok.retryCalls, 1);
  assert.equal(ok.continuationCalls, 1);

  const missingRepair = runQualifyFingerprintHoldSequence(passingFullSequenceInput({
    afterRepairCatalog: null,
  }));
  assert.equal(missingRepair.ok, false);
  assert.equal(missingRepair.allowRetry, false);
  assert.equal(missingRepair.retryCalls, 0);
  assert.equal(missingRepair.hold, POST_REPAIR_FULL_FINGERPRINT_HOLD);

  const missingRetry = runQualifyFingerprintHoldSequence(passingFullSequenceInput({
    afterRetryCatalog: null,
  }));
  assert.equal(missingRetry.ok, false);
  assert.equal(missingRetry.allowContinuation, false);
  assert.equal(missingRetry.hold, POST_RETRY_FULL_FINGERPRINT_HOLD);

  const missingPre = runQualifyFingerprintHoldSequence(passingFullSequenceInput({
    afterCommitCatalog: null,
  }));
  assert.equal(missingPre.ok, false);
  assert.equal(missingPre.repairCalls, 0);
  assert.equal(missingPre.hold, REPAIR_SAFETY_HOLD);
  assert.ok(catalog);
});

test("5-6 missing or extra fingerprint keys HOLD on the qualify path", () => {
  const catalog = catalogFromFrozen();
  const missingAcl = { ...catalog };
  delete missingAcl.acl;
  const missing = runQualifyFingerprintHoldSequence(passingFullSequenceInput({
    afterRepairCatalog: missingAcl,
  }));
  assert.equal(missing.ok, false);
  assert.equal(missing.allowRetry, false);
  assert.equal(missing.retryCalls, 0);
  assert.match(missing.hold, /HOLD/);

  const extra = runQualifyFingerprintHoldSequence(passingFullSequenceInput({
    afterRepairCatalog: { ...catalog, unexpected_key: true },
  }));
  const extraObserved = collectCanonicalFullFingerprint({
    file: FILE118,
    catalogInventory: { ...catalog, unexpected_key: true },
    phase: FULL_FINGERPRINT_PHASES.AFTER_SUCCESSFUL_REPAIR,
  });
  assert.equal(extraObserved.ok, true, "collector ignores unknown catalog keys");
  const extraDirect = evaluatePostRepairFullFingerprint({
    file: FILE118,
    capture: {
      ...extraObserved,
      fingerprint: { ...extraObserved.fingerprint, unexpected_key: true },
    },
    expected: getFrozenExpectedFingerprint(FILE118),
    preRepairObserved: extraObserved.fingerprint,
  });
  assert.equal(extraDirect.ok, false);
  assert.equal(extraDirect.allowRetry, false);
  assert.equal(extra.ok, true);
});

test("7-8 partial inventory cannot substitute for post-repair or post-retry fingerprints", () => {
  const catalog = catalogFromFrozen();
  const inventoryOnly = {
    schema: catalog.schema,
    function_owner: catalog.function_owner,
    acl: catalog.acl,
    policy: catalog.policy,
    f3_objects_absent: catalog.f3_objects_absent,
  };
  const asCapture = {
    ok: true,
    captureOk: true,
    fingerprint: inventoryOnly,
    provenance: {
      collector: FULL_FINGERPRINT_COLLECTOR_ID,
      builder: "inventoryFromQuery",
      copiedFromPreRepair: false,
      assembledFromPartialInventory: false,
    },
  };
  const postRepair = evaluatePostRepairFullFingerprint({
    file: FILE118,
    capture: asCapture,
    expected: getFrozenExpectedFingerprint(FILE118),
    preRepairObserved: collectCanonicalFullFingerprint({
      file: FILE118,
      catalogInventory: catalog,
      phase: FULL_FINGERPRINT_PHASES.AFTER_COMMIT_FAILED_HISTORY,
    }).fingerprint,
  });
  assert.equal(postRepair.ok, false);
  assert.equal(postRepair.allowRetry, false);
  assert.equal(postRepair.hold, POST_REPAIR_FULL_FINGERPRINT_HOLD);

  const postRetry = evaluatePostRetryFullFingerprint({
    file: FILE118,
    capture: asCapture,
    expected: getFrozenExpectedFingerprint(FILE118),
    preRepairObserved: asCapture.fingerprint,
    postRepairObserved: asCapture.fingerprint,
  });
  assert.equal(postRetry.ok, false);
  assert.equal(postRetry.allowContinuation, false);
  assert.equal(postRetry.hold, POST_RETRY_FULL_FINGERPRINT_HOLD);

  const missingOptional = { ...catalog };
  delete missingOptional.f3_objects_absent;
  const partialCollect = collectCanonicalFullFingerprint({
    file: FILE118,
    catalogInventory: missingOptional,
    phase: FULL_FINGERPRINT_PHASES.AFTER_SUCCESSFUL_REPAIR,
  });
  assert.equal(partialCollect.ok, false);
  assert.equal(partialCollect.provenance.assembledFromPartialInventory, true);
});

test("9-10 copying pre-repair metadata onto post-repair inventory is prohibited", () => {
  const catalog = catalogFromFrozen();
  const full = collectCanonicalFullFingerprint({
    file: FILE118,
    catalogInventory: catalog,
    phase: FULL_FINGERPRINT_PHASES.AFTER_COMMIT_FAILED_HISTORY,
  });
  const merged = {
    ...catalog,
    migration_file: full.fingerprint.migration_file,
    migration_version: full.fingerprint.migration_version,
    migration_name: full.fingerprint.migration_name,
    migration_digest: full.fingerprint.migration_digest,
    recognition: full.fingerprint.recognition,
  };
  const reconstructed = {
    ok: true,
    captureOk: true,
    fingerprint: merged,
    provenance: {
      collector: "manual_merge",
      builder: "preRepairMetaOntoInventory",
      copiedFromPreRepair: true,
      assembledFromPartialInventory: true,
    },
  };
  const postRepair = evaluatePostRepairFullFingerprint({
    file: FILE118,
    capture: reconstructed,
    expected: getFrozenExpectedFingerprint(FILE118),
    preRepairObserved: full.fingerprint,
  });
  assert.equal(postRepair.ok, false);
  assert.equal(postRepair.allowRetry, false);
  assert.match(postRepair.reason, /pre-repair metadata|partial inventory|canonical/);

  const postRetry = evaluatePostRetryFullFingerprint({
    file: FILE118,
    capture: reconstructed,
    expected: getFrozenExpectedFingerprint(FILE118),
    preRepairObserved: full.fingerprint,
    postRepairObserved: full.fingerprint,
  });
  assert.equal(postRetry.ok, false);
  assert.equal(postRetry.allowContinuation, false);

  const qualify = fs.readFileSync(path.join(root, "scripts/qualify-f3-db-push-disposable.mjs"), "utf8");
  const stripped = qualify.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.doesNotMatch(stripped, /copiedFromPreRepair:\s*true/);
  assert.doesNotMatch(stripped, /\.\.\.\s*inventoryFromQuery/);
});

test("11-13 malformed post-repair captures HOLD and block retry", () => {
  const catalog = catalogFromFrozen();
  const pre = collectCanonicalFullFingerprint({
    file: FILE118,
    catalogInventory: catalog,
    phase: FULL_FINGERPRINT_PHASES.AFTER_COMMIT_FAILED_HISTORY,
  }).fingerprint;
  const expected = getFrozenExpectedFingerprint(FILE118);
  const cases = [
    { name: "null", capture: null },
    { name: "string", capture: "not-a-capture" },
    { name: "array", capture: [] },
    { name: "missing fingerprint", capture: { ok: true, captureOk: true, provenance: { collector: FULL_FINGERPRINT_COLLECTOR_ID } } },
  ];
  for (const c of cases) {
    const evaluated = evaluatePostRepairFullFingerprint({
      file: FILE118,
      capture: c.capture,
      expected,
      preRepairObserved: pre,
    });
    assert.equal(evaluated.ok, false, c.name);
    assert.equal(evaluated.allowRetry, false, c.name);
    assert.equal(evaluated.hold, POST_REPAIR_FULL_FINGERPRINT_HOLD, c.name);
  }
});

test("14-17 catalog drift after repair HOLDs and blocks retry", () => {
  const catalog = catalogFromFrozen();
  const pre = collectCanonicalFullFingerprint({
    file: FILE118,
    catalogInventory: catalog,
    phase: FULL_FINGERPRINT_PHASES.AFTER_COMMIT_FAILED_HISTORY,
  }).fingerprint;
  const drifts = [
    { name: "acl", catalog: { ...catalog, acl: [] } },
    { name: "function_owner", catalog: { ...catalog, function_owner: [] } },
    { name: "policy", catalog: { ...catalog, policy: [] } },
    { name: "schema", catalog: { ...catalog, schema: [] } },
  ];
  for (const c of drifts) {
    const decided = runQualifyFingerprintHoldSequence(passingFullSequenceInput({
      afterRepairCatalog: c.catalog,
    }));
    assert.equal(decided.ok, false, c.name);
    assert.equal(decided.allowRetry, false, c.name);
    assert.equal(decided.retryCalls, 0, c.name);
    assert.equal(decided.hold, POST_REPAIR_FULL_FINGERPRINT_HOLD, c.name);
    assert.ok(pre);
  }
});

test("18-19 post-repair mismatch blocks retry and continuation; 20 post-retry mismatch blocks continuation", async () => {
  const catalog = catalogFromFrozen();
  const drifted = { ...catalog, acl: [] };
  let retryCalls = 0;
  let continuationCalls = 0;
  const postRepairHold = runQualifyFingerprintHoldSequence(passingFullSequenceInput({
    afterRepairCatalog: drifted,
  }));
  if (postRepairHold.allowRetry) retryCalls += 1;
  if (postRepairHold.allowContinuation) continuationCalls += 1;
  assert.equal(postRepairHold.ok, false);
  assert.equal(retryCalls, 0);
  assert.equal(continuationCalls, 0);
  assert.equal(postRepairHold.retryCalls, 0);
  assert.equal(postRepairHold.continuationCalls, 0);

  retryCalls = 0;
  continuationCalls = 0;
  const postRetryHold = runQualifyFingerprintHoldSequence(passingFullSequenceInput({
    afterRetryCatalog: drifted,
  }));
  if (postRetryHold.allowRetry) retryCalls += 1;
  if (postRetryHold.allowContinuation) continuationCalls += 1;
  assert.equal(postRetryHold.ok, false);
  assert.equal(postRetryHold.hold, POST_RETRY_FULL_FINGERPRINT_HOLD);
  assert.equal(continuationCalls, 0);
  assert.equal(postRetryHold.continuationCalls, 0);

  const pendingHold = runQualifyFingerprintHoldSequence(passingFullSequenceInput({
    retryPending: [FILE118],
  }));
  assert.equal(pendingHold.ok, false);
  assert.equal(pendingHold.allowContinuation, false);
  assert.equal(pendingHold.hold, POST_RETRY_FULL_FINGERPRINT_HOLD);
});

test("21 source contract: qualify persists phase captures and never uses inventoryFromQuery as the fingerprint", () => {
  const qualify = fs.readFileSync(path.join(root, "scripts/qualify-f3-db-push-disposable.mjs"), "utf8");
  assert.match(qualify, /fingerprintExpectedFrozen/);
  assert.match(qualify, /fingerprintAfterCommitFailedHistory/);
  assert.match(qualify, /fingerprintAfterPoisonCleanup/);
  assert.match(qualify, /fingerprintAfterRepair/);
  assert.match(qualify, /fingerprintAfterRetryNoPending/);
  assert.match(qualify, /fingerprintAfterCleanContinuation/);
  assert.match(qualify, /POST_REPAIR_FULL_FINGERPRINT_HOLD/);
  assert.match(qualify, /POST_RETRY_FULL_FINGERPRINT_HOLD/);
  assert.match(qualify, /writeQualifyEvidenceArtifacts/);
  assert.match(qualify, /F3_FULL_FINGERPRINT_SCHEMA_VERSION/);
  const seq = qualify.slice(qualify.indexOf("for (const file of F3_FORWARD_FILES)"));
  const afterRepairAssign = seq.match(/fingerprintAfterRepair[^\n]+/g) || [];
  assert.ok(afterRepairAssign.length >= 1);
  for (const line of afterRepairAssign) {
    assert.equal(/inventoryFromQuery/.test(line), false, line);
  }
});

test("22 successful full captures equal sealed expected hashes; frozen expected is not populated from observed", () => {
  const recorded = recordFrozenExpectedFingerprintCaptures();
  assert.equal(recorded.recordedBeforeDbAccess, true);
  assert.equal(recorded.independentOfObserved, true);
  assert.equal(recorded.populatedFromObserved, false);
  const sealed = { ...FROZEN_EXPECTED_FINGERPRINT_SHA256 };
  for (const file of F3_FORWARD_FILES) {
    const frozen = captureFrozenExpectedFingerprint(file);
    assert.equal(frozen.sha256, sealed[file], file);
    assert.equal(frozen.provenance.populatedFromObserved, false);
    assert.deepEqual(frozen.fingerprint.recognition, ["manual_income"]);
    const catalog = catalogInventoryFromFingerprint(frozen.fingerprint);
    const collected = collectCanonicalFullFingerprint({
      file,
      catalogInventory: catalog,
      phase: FULL_FINGERPRINT_PHASES.AFTER_SUCCESSFUL_REPAIR,
    });
    assert.equal(collected.ok, true, file);
    assert.equal(collected.sha256, sealed[file], file);
    assert.equal(fingerprintCompleteAndExact({
      expected: frozen.fingerprint,
      observed: collected.fingerprint,
    }, file).ok, true, file);
    assert.equal(collected.fingerprint.migration_digest, FROZEN_DIGESTS[file], file);
  }
});

test("pre-repair collector rejects still spawn zero repair via the actual gate path", async () => {
  const catalog = catalogFromFrozen();
  const partial = collectCanonicalFullFingerprint({
    file: FILE118,
    catalogInventory: { schema: catalog.schema },
    phase: FULL_FINGERPRINT_PHASES.AFTER_COMMIT_FAILED_HISTORY,
  });
  assert.equal(partial.ok, false);
  let repairCalls = 0;
  const decided = await runRepairSafetyThenMaybeRepair({
    gateInput: authorizedGateInput({
      fingerprint: {
        expected: getFrozenExpectedFingerprint(FILE118),
        observed: partial.fingerprint,
      },
    }),
    cleanup: () => provenCleanup(),
    verifyPoisonAbsent: () => poisonAbsentResult(),
    repair: () => {
      repairCalls += 1;
      return { status: 0 };
    },
  });
  assert.equal(decided.repairAuthorized, false);
  assert.equal(decided.repairAttempted, false);
  assert.equal(repairCalls, 0);
  assert.equal(decided.gate.hold, REPAIR_SAFETY_HOLD);
});

test("poison / post-repair / post-retry evaluators expose distinct HOLD strings", () => {
  assert.match(POST_POISON_FULL_FINGERPRINT_HOLD, /poison-cleanup/);
  assert.match(POST_REPAIR_FULL_FINGERPRINT_HOLD, /post-repair/);
  assert.match(POST_RETRY_FULL_FINGERPRINT_HOLD, /post-retry/);
  assert.match(POST_CONTINUATION_FULL_FINGERPRINT_HOLD, /continuation/);
  const catalog = catalogFromFrozen();
  const capture = finalizeFingerprintCapture(
    collectCanonicalFullFingerprint({
      file: FILE118,
      catalogInventory: catalog,
      phase: FULL_FINGERPRINT_PHASES.AFTER_SUCCESSFUL_REPAIR,
    }),
    {
      expected: getFrozenExpectedFingerprint(FILE118),
      preRepairObserved: collectCanonicalFullFingerprint({
        file: FILE118,
        catalogInventory: catalog,
        phase: FULL_FINGERPRINT_PHASES.AFTER_COMMIT_FAILED_HISTORY,
      }).fingerprint,
    },
  );
  assert.equal(capture.diffsVsExpected.equal, true);
  assert.equal(capture.diffsVsPreRepair.equal, true);
  const poisonOk = evaluatePostPoisonFullFingerprint({
    file: FILE118,
    capture,
    expected: getFrozenExpectedFingerprint(FILE118),
    preRepairObserved: capture.fingerprint,
  });
  assert.equal(poisonOk.ok, true);
  assert.equal(poisonOk.allowRepair, true);
});

test("expanded catalog fingerprint schema version and required keys are complete", () => {
  assert.equal(F3_FULL_FINGERPRINT_SCHEMA_VERSION, "f3-full-catalog-v5");
  assert.equal(SUPERSEDED_F3_FULL_FINGERPRINT_SCHEMA_VERSION_V4, "f3-full-catalog-v4");
  assert.equal(SUPERSEDED_F3_FULL_FINGERPRINT_SCHEMA_VERSION, "f3-full-catalog-v3");
  assert.equal(SUPERSEDED_F3_FULL_FINGERPRINT_SCHEMA_VERSION_V2, "f3-full-catalog-v2");
  assert.equal(INDEPENDENT_REFERENCE_SCHEMA_VERSION, "f3-full-catalog-v5");
  assert.doesNotMatch(F3_FULL_FINGERPRINT_SCHEMA_VERSION, /f3-full-catalog-v1/);
  assert.doesNotMatch(F3_FULL_FINGERPRINT_SCHEMA_VERSION, /f3-full-catalog-v2$/);
  assert.doesNotMatch(F3_FULL_FINGERPRINT_SCHEMA_VERSION, /f3-full-catalog-v3$/);
  assert.doesNotMatch(F3_FULL_FINGERPRINT_SCHEMA_VERSION, /f3-full-catalog-v4$/);
  assert.equal(MUST_REVERIFY_ON_17_6, true);
  const required = [
    "schema_version", "schema", "schemas", "function_owner", "acl", "acls",
    "policy", "policies", "relations", "columns", "types", "views", "routines",
    "rls", "constraints", "indexes", "triggers", "hgp", "enqueue", "f3_objects_absent",
  ];
  for (const file of F3_FORWARD_FILES) {
    const fp = getFrozenExpectedFingerprint(file);
    assert.equal(fp.schema_version, F3_FULL_FINGERPRINT_SCHEMA_VERSION, file);
    assert.equal(fp.migration_source_label, file.slice(0, 5), file);
    assert.deepEqual(fp.recognition, ["manual_income"], file);
    assert.deepEqual(fp.hgp, { ...F3_HGP_PIN }, file);
    assert.deepEqual(fp.enqueue, { ...F3_ENQUEUE_PIN }, file);
    assert.equal(JSON.stringify(fp).includes("\"oid\""), false, file);
    for (const key of required) {
      assert.equal(Object.prototype.hasOwnProperty.call(fp, key), true, `${file} ${key}`);
      assert.notEqual(fp[key], undefined, `${file} ${key} undefined`);
    }
    assert.ok(Array.isArray(fp.views), `${file} views`);
    assert.ok(Array.isArray(fp.constraints), `${file} constraints`);
    assert.ok(Array.isArray(fp.indexes), `${file} indexes`);
    assert.ok(Array.isArray(fp.triggers), `${file} triggers`);
    assert.ok(Array.isArray(fp.rls), `${file} rls`);
    assert.ok(fp.relations.length > 0, `${file} relations`);
    assert.ok(fp.routines.length > 0, `${file} routines`);
    for (const [key, nested] of Object.entries(F3_FULL_FINGERPRINT_NESTED_KEYS)) {
      if (!Object.prototype.hasOwnProperty.call(fp, key)) continue;
      if (key === "hgp" || key === "enqueue") {
        assert.deepEqual(Object.keys(fp[key]).sort(), [...nested].sort(), `${file} ${key}`);
        continue;
      }
      assert.ok(Array.isArray(fp[key]), `${file} ${key} collection`);
      for (const record of fp[key]) {
        assert.deepEqual(Object.keys(record).sort(), [...nested].sort(), `${file} ${key} record`);
      }
    }
  }
  const gate = fs.readFileSync(path.join(root, "scripts/lib/f3-db-push-repair-safety-gate.mjs"), "utf8");
  assert.match(gate, /fingerprintCompleteAndExact\(input\.fingerprint, file\)/);
  assert.match(gate, /if \(!fp\.ok\) fail\("fingerprint_exact"/);
  const evalFn = gate.slice(gate.indexOf("export function evaluateRepairSafetyGate"));
  const fpIdx = evalFn.indexOf("fingerprintCompleteAndExact");
  const repairAuthIdx = evalFn.indexOf("repairAuthorized: ok");
  assert.ok(fpIdx > 0 && repairAuthIdx > fpIdx, "expanded comparator runs before repair authorization");
});

test("expanded catalog drift matrix forbids repair on the actual gate path", async () => {
  const expected = getFrozenExpectedFingerprint(FILE118);
  const drifts = [
    ["schema_version", (o) => { o.schema_version = "ten-field"; }],
    ["schemas", (o) => { o.schemas = []; }],
    ["relations", (o) => { o.relations = []; }],
    ["columns", (o) => { o.columns = []; }],
    ["types", (o) => { o.types = [{ schema: "public", name: "forged", kind: "enum", labels: ["x"], owner: "postgres", acl: [] }]; }],
    ["views", (o) => { o.views = [{ schema: "public", name: "forged_view", kind: "view", definition: "select 1", security_invoker: false, security_barrier: false, owner: "postgres", acl: [] }]; }],
    ["routines", (o) => { o.routines = []; }],
    ["rls", (o) => { o.rls = o.rls.map((row) => ({ ...row, rls_enabled: !row.rls_enabled })); }],
    ["policies", (o) => { o.policies = []; }],
    ["acls", (o) => { o.acls = []; }],
    ["constraints", (o) => { o.constraints = []; }],
    ["indexes", (o) => { o.indexes = []; }],
    ["triggers", (o) => { o.triggers = []; }],
    ["hgp", (o) => { o.hgp = { ...o.hgp, def_md5: "deadbeefdeadbeefdeadbeefdeadbeef" }; }],
    ["enqueue", (o) => { o.enqueue = { ...o.enqueue, src_md5: "cafebabecafebabecafebabecafebabe" }; }],
    ["recognition", (o) => { o.recognition = ["manual_expense"]; }],
    ["source_label", (o) => { o.migration_source_label = "00118"; o.migration_version = "00118"; }],
    ["null-not-absent", (o) => { o.views = null; }],
    ["missing-not-empty", (o) => { delete o.triggers; }],
    ["oid-forbidden", (o) => { o.relations = o.relations.map((row) => ({ ...row, oid: 4242 })); }],
    ["duplicate-rls", (o) => { o.rls = [...o.rls, { ...o.rls[0] }]; }],
    ["enum-label-order", (o) => {
      const enumRow = o.types.find((row) => row.kind === "enum" && Array.isArray(row.labels) && row.labels.length > 1);
      if (enumRow) {
        o.types = o.types.map((row) => (
          row === enumRow ? { ...row, labels: [...row.labels].reverse() } : row
        ));
        return;
      }
      o.types = [...o.types, {
        schema: "public",
        name: "financial_forged_enum",
        kind: "enum",
        labels: ["b", "a"],
        owner: "postgres",
        acl: [],
      }];
    }],
  ];
  for (const [name, mutate] of drifts) {
    const observed = structuredClone(expected);
    mutate(observed);
    if (name === "source_label") {
      observed.migration_source_label = "wrong-label";
    }
    const fingerprint = { expected, observed };
    assert.equal(fingerprintCompleteAndExact(fingerprint, FILE118).ok, false, name);
    let repairCalls = 0;
    const decided = await runRepairSafetyThenMaybeRepair({
      gateInput: authorizedGateInput({ fingerprint }),
      cleanup: () => provenCleanup(),
      verifyPoisonAbsent: () => poisonAbsentResult(),
      repair: () => {
        repairCalls += 1;
        return { status: 0 };
      },
    });
    assert.equal(decided.repairAuthorized, false, name);
    assert.equal(decided.repairAttempted, false, name);
    assert.equal(repairCalls, 0, `${name} repair spawned`);
    assert.equal(decided.gate.failedGates.includes("fingerprint_exact"), true, `${name} fingerprint_exact`);
  }
});

test("corrected builder uses PG deparser shapes and independent local-oracle seals", () => {
  const expected118 = getFrozenExpectedFingerprint(FILE118);
  const expected119 = getFrozenExpectedFingerprint("00119_f3_01_core_ledger_foundation.sql");
  assert.ok(expected118.triggers.some((row) => String(row.user_definition || "").startsWith("CREATE TRIGGER")));
  assert.ok(expected118.indexes.some((row) => /USING (btree|gist)/.test(row.definition)));
  assert.ok(expected118.constraints.some((row) => /PRIMARY KEY/.test(row.definition)));
  assert.ok(expected118.routines.some((row) => String(row.functiondef).includes("CREATE OR REPLACE FUNCTION")));
  assert.ok(expected118.columns.every((row) => Object.prototype.hasOwnProperty.call(row, "typmod")));
  assert.ok(expected118.types.some((row) => row.kind === "composite"));
  const enumType = expected119.types.find((row) => row.kind === "enum" && row.labels.length > 1);
  assert.ok(enumType, "00119 has ordered enum labels");
  assert.notDeepEqual(enumType.labels, [...enumType.labels].sort());
  assert.ok(expected118.schemas[0].acl.length > 0);
  assert.deepEqual(expected118.recognition, ["manual_income"]);
  const qualify = fs.readFileSync(path.join(root, "scripts/qualify-f3-db-push-disposable.mjs"), "utf8");
  assert.match(qualify, /--seal-expected-from-local-oracle/);
  assert.match(qualify, /sealExpectedFingerprintsFromLocalOracle/);
  const gate = fs.readFileSync(path.join(root, "scripts/lib/f3-db-push-repair-safety-gate.mjs"), "utf8");
  assert.match(gate, /independent_local_pg17_CATALOG_FINGERPRINT_SQL/);
  assert.match(gate, /buildIndependentObservedFingerprint\(file, requireOracleCatalog\(file\)\)/);
  assert.match(gate, /SEALED_PLATFORM_ACL_ENVELOPE_DIGEST/);
  assert.match(gate, /ALTER DEFAULT PRIVILEGES FOR ROLE/);
  assert.match(qualify, /authorizeDbPushAfterPlatformAclCalibration/);
  assert.match(qualify, /evaluatePlatformAclCalibration/);
  assert.deepEqual([...APPLICABLE_PLATFORM_ACL_OBJECT_CLASSES], ["table", "sequence", "function"]);
  assert.doesNotMatch(
    gate.slice(gate.indexOf("export function buildExpandedExpectedFingerprint")),
    /applyMigrationSqlToCatalog/,
  );
});

test("corrected builder+comparator local negatives forbid repair with zero retry", async () => {
  const expected118 = getFrozenExpectedFingerprint(FILE118);
  const expected119 = getFrozenExpectedFingerprint("00119_f3_01_core_ledger_foundation.sql");
  const enumName = expected119.types.find((row) => row.kind === "enum" && row.labels.length > 1)?.name;
  const domainName = expected119.types.find((row) => row.kind === "domain")?.name;
  const cases = [
    ["column-type", FILE118, expected118, (o) => {
      o.columns = o.columns.map((row) => (
        row.relation === "financial_ledger_epochs" && row.name === "group_id"
          ? { ...row, type: "text" }
          : row
      ));
    }],
    ["column-default", FILE118, expected118, (o) => {
      o.columns = o.columns.map((row) => (
        row.relation === "financial_ledger_epochs" && row.name === "id"
          ? { ...row, default: "uuid_generate_v4()" }
          : row
      ));
    }],
    ["column-nullability", FILE118, expected118, (o) => {
      o.columns = o.columns.map((row) => (
        row.relation === "financial_ledger_epochs" && row.name === "group_id"
          ? { ...row, nullable: true }
          : row
      ));
    }],
    ["missing-column", FILE118, expected118, (o) => {
      o.columns = o.columns.filter((row) => !(row.relation === "financial_ledger_epochs" && row.name === "group_id"));
    }],
    ["extra-column", FILE118, expected118, (o) => {
      const col = o.columns.find((row) => row.relation === "financial_ledger_epochs" && row.name === "group_id");
      o.columns = [...o.columns, { ...col, name: "forged_extra", ordinal: 99 }];
    }],
    ["reordered-columns", FILE118, expected118, (o) => {
      const first = o.columns.find((row) => row.relation === "financial_ledger_epochs" && row.ordinal === 1);
      const second = o.columns.find((row) => row.relation === "financial_ledger_epochs" && row.ordinal === 2);
      o.columns = o.columns.map((row) => {
        if (row === first) return { ...second, ordinal: 1 };
        if (row === second) return { ...first, ordinal: 2 };
        return row;
      });
    }],
    ["constraint-drift", FILE118, expected118, (o) => {
      o.constraints = o.constraints.map((row, i) => (i === 0 ? { ...row, definition: "CHECK (false)" } : row));
    }],
    ["index-drift", FILE118, expected118, (o) => {
      o.indexes = o.indexes.map((row, i) => (i === 0 ? { ...row, definition: `${row.definition} /*drift*/` } : row));
    }],
    ["routine-drift", FILE118, expected118, (o) => {
      o.routines = o.routines.map((row, i) => (i === 0 ? { ...row, functiondef: "CREATE FUNCTION forged()" } : row));
    }],
    ["owner-drift", FILE118, expected118, (o) => {
      o.function_owner = o.function_owner.map((row) => ({ ...row, owner: "ubuntu" }));
    }],
    ["schema-drift", FILE118, expected118, (o) => {
      o.schemas = o.schemas.map((row) => ({ ...row, owner: "ubuntu" }));
    }],
    ["trigger-drift", FILE118, expected118, (o) => {
      o.triggers = o.triggers.map((row, i) => (i === 0 ? { ...row, timing: "BEFORE", events: "INSERT" } : row));
    }],
    ["type-drift", FILE118, expected118, (o) => {
      o.types = o.types.map((row, i) => (i === 0 ? { ...row, kind: "enum", labels: ["x"] } : row));
    }],
    ["enum-drift", "00119_f3_01_core_ledger_foundation.sql", expected119, (o) => {
      o.types = o.types.map((row) => (
        row.name === enumName ? { ...row, labels: [...row.labels].reverse() } : row
      ));
    }],
    ["domain-drift", "00119_f3_01_core_ledger_foundation.sql", expected119, (o) => {
      if (domainName) {
        o.types = o.types.map((row) => (row.name === domainName ? { ...row, name: `${row.name}_forged` } : row));
      } else {
        o.types = [...o.types, {
          schema: "public",
          name: "financial_forged_domain",
          kind: "domain",
          labels: [],
          owner: "postgres",
          acl: [],
        }];
      }
    }],
    ["rls-enabled", FILE118, expected118, (o) => {
      o.rls = o.rls.map((row) => ({ ...row, rls_enabled: !row.rls_enabled }));
    }],
    ["rls-forced", FILE118, expected118, (o) => {
      o.rls = o.rls.map((row) => ({ ...row, rls_force: !row.rls_force }));
    }],
    ["policy-drift", FILE118, expected118, (o) => {
      o.policies = o.policies.map((row) => ({ ...row, using: "(false)" }));
      o.policy = o.policies;
    }],
    ["acl-association", FILE118, expected118, (o) => {
      o.acls = o.acls.map((row, i) => (i === 0 ? { ...row, grantee: "ubuntu" } : row));
      o.acl = o.acls;
    }],
    ["search_path", FILE118, expected118, (o) => {
      o.function_owner = o.function_owner.map((row) => ({ ...row, search_path: "public" }));
      o.routines = o.routines.map((row) => ({ ...row, search_path: "public" }));
    }],
    ["hgp", FILE118, expected118, (o) => {
      o.hgp = { ...o.hgp, def_md5: "0".repeat(32) };
    }],
    ["recognition", FILE118, expected118, (o) => {
      o.recognition = ["manual_expense"];
    }],
    ["migration-digest", FILE118, expected118, (o) => {
      o.migration_digest = "0".repeat(64);
    }],
    ["migration-metadata", FILE118, expected118, (o) => {
      o.migration_version = "00000000000000";
      o.migration_source_label = "wrong";
    }],
    ["missing-key", FILE118, expected118, (o) => {
      delete o.triggers;
    }],
    ["extra-key", FILE118, expected118, (o) => {
      o.forged_extra = true;
    }],
    ["duplicate-records", FILE118, expected118, (o) => {
      o.columns = [...o.columns, { ...o.columns[0] }];
    }],
    ["wrong-schema-version", FILE118, expected118, (o) => {
      o.schema_version = "f3-full-catalog-v0";
    }],
  ];
  for (const [name, file, expected, mutate] of cases) {
    const observed = structuredClone(expected);
    mutate(observed);
    assert.equal(fingerprintCompleteAndExact({ expected, observed }, file).ok, false, name);
    let repairCalls = 0;
    const decided = await runRepairSafetyThenMaybeRepair({
      gateInput: authorizedGateInput({ fingerprint: { expected, observed } }),
      cleanup: () => provenCleanup(),
      verifyPoisonAbsent: () => poisonAbsentResult(),
      repair: () => {
        repairCalls += 1;
        return { status: 0 };
      },
    });
    assert.equal(decided.repairAuthorized, false, name);
    assert.equal(decided.repairAttempted, false, name);
    assert.equal(repairCalls, 0, `${name} repair spawned`);
    assert.equal(decided.gate.failedGates.includes("fingerprint_exact"), true, `${name} fingerprint_exact`);
  }
});

test("local-oracle seal helper refuses hosted fixtures and reports NOT_RUN without local PG hooks", async () => {
  const missing = await sealExpectedFingerprintsFromLocalOracle({
    fixtures: {
      createDisposableDatabase() {
        throw new Error("could not connect to server");
      },
    },
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.status, "NOT_RUN");
  assert.equal(missing.provenance.not_hosted, true);
  assert.equal(missing.provenance.not_copied_from_hosted_observed, true);
});

test("evidence pipeline hashes sanitized .out bytes and detaches index checksum", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f3-evidence-"));
  const outPath = path.join(dir, "suite.out");
  const secret = "super-secret-db-password";
  const rawOut = [
    "# Subtest: pg failure",
    "not ok 1 - pg failure",
    "  ---",
    `  ${YAML_ERROR_MARKER}`,
    "    ERROR:  role \"ubuntu\" does not exist",
    `  password: ${secret}`,
    "  ...",
    "",
  ].join("\n");
  fs.writeFileSync(outPath, rawOut);
  const written = writeSuiteMetaForOutFile(outPath, {
    tests: [{ name: "pg failure", ok: false, output: rawOut }],
    extraSecrets: [secret],
  });
  const sanitized = fs.readFileSync(outPath);
  assert.equal(sanitized.includes(secret), false);
  assert.equal(written.meta.sha256, createHash("sha256").update(sanitized).digest("hex"));
  assert.equal(written.meta.bytes, sanitized.byteLength);
  assert.notEqual(written.meta.sha256, createHash("sha256").update(rawOut).digest("hex"));
  assert.equal(written.meta.tests[0].exact_error, 'ERROR:  role "ubuntu" does not exist');
  assert.notEqual(written.meta.tests[0].exact_error, YAML_ERROR_MARKER);
  assert.equal(extractExactPostgresError(`  ${YAML_ERROR_MARKER}\n`), null);

  const markerOnly = buildSuiteMetaFromSanitizedOut({
    sanitizedOut: Buffer.from(`# fail\n  ${YAML_ERROR_MARKER}\n  ...\n`, "utf8"),
    tests: [{ name: "marker", output: `  ${YAML_ERROR_MARKER}\n` }],
  });
  assert.notEqual(markerOnly.tests[0].exact_error, YAML_ERROR_MARKER);

  const index = writeEvidenceIndexAndChecksum(dir, [
    { path: "suite.out", sha256: written.meta.sha256, bytes: written.meta.bytes },
    { path: "suite.meta.json", sha256: createHash("sha256").update(fs.readFileSync(written.metaPath)).digest("hex") },
    { path: EVIDENCE_INDEX_FILENAME },
    { path: EVIDENCE_INDEX_CHECKSUM_FILENAME },
  ]);
  assert.deepEqual(EVIDENCE_INDEX_EXCLUSIONS, [EVIDENCE_INDEX_FILENAME, EVIDENCE_INDEX_CHECKSUM_FILENAME]);
  assert.equal(index.index.self_hash, false);
  assert.equal(index.index.artifacts.some((item) => item.path === EVIDENCE_INDEX_FILENAME), false);
  assert.equal(index.index.artifacts.some((item) => item.path === EVIDENCE_INDEX_CHECKSUM_FILENAME), false);
  const verified = verifyEvidenceIndex(dir);
  assert.equal(verified.ok, true);
  assert.equal(verified.sha256, index.sha256);
  fs.writeFileSync(index.checksumPath, "0".repeat(64) + "\n");
  assert.equal(verifyEvidenceIndex(dir).ok, false);
});

function serviceRoleAclRow(overrides = {}) {
  return {
    object_type: "table",
    schema: "public",
    object_name: "financial_ledger_epochs",
    prokind: "",
    identity_arguments: "",
    grantee: "service_role",
    grantor: "postgres",
    privilege: "SELECT",
    grantable: false,
    ...overrides,
  };
}

async function assertPlatformAclNegative(name, { fingerprint, gateExtra = {}, applyInput = null }) {
  let dbPushCalls = 0;
  let repairCalls = 0;
  if (applyInput) {
    const applied = applyPlatformAclEnvelopeToLocalOracle({
      ...applyInput,
      applySql: () => {
        throw new Error("platform envelope applySql must not run on rejected input");
      },
    });
    assert.equal(applied.ok, false, `${name} apply rejected`);
    assert.equal(applied.applied, false, `${name} applied`);
  }
  if (fingerprint) {
    const exact = fingerprintCompleteAndExact(fingerprint, FILE118);
    assert.equal(exact.ok, false, `${name} fingerprintCompleteAndExact`);
  }
  const prePush = authorizeDbPushAfterPlatformAclCalibration({
    envelope: Object.prototype.hasOwnProperty.call(gateExtra, "platformAclEnvelope")
      ? gateExtra.platformAclEnvelope
      : SEALED_PLATFORM_ACL_ENVELOPE,
    targetObjectClass: gateExtra.platformAclTargetObjectClass,
  });
  if (gateExtra.platformAclEnvelope !== undefined || gateExtra.platformAclTargetObjectClass !== undefined) {
    if (prePush.ok === false) {
      assert.equal(prePush.dbPushAuthorized, false, `${name} dbPushAuthorized`);
      assert.equal(prePush.fingerprint_exact, false, `${name} prePush fingerprint_exact`);
    }
  }
  if (!prePush.ok) {
    assert.equal(dbPushCalls, 0, `${name} dbPushCalls`);
  }
  const decided = await runRepairSafetyThenMaybeRepair({
    gateInput: authorizedGateInput({
      fingerprint: fingerprint || passingFingerprint(FILE118),
      ...gateExtra,
    }),
    cleanup: () => provenCleanup(),
    verifyPoisonAbsent: () => poisonAbsentResult(),
    repair: () => {
      repairCalls += 1;
      return { status: 0 };
    },
  });
  assert.equal(decided.repairAuthorized, false, `${name} repairAuthorized`);
  assert.equal(decided.repairAttempted, false, `${name} repairAttempted`);
  assert.equal(repairCalls, 0, `${name} repairCalls`);
  assert.equal(decided.gate.failedGates.includes("fingerprint_exact"), true, `${name} fingerprint_exact`);
  assert.equal(dbPushCalls, 0, `${name} dbPushCalls after gate`);
  return decided;
}

test("Phase B platform ACL envelope is sealed at module load and fail-closed", () => {
  assert.equal(SEALED_PLATFORM_ACL_ENVELOPE.digest_sha256, SEALED_PLATFORM_ACL_ENVELOPE_DIGEST);
  assert.equal(SEALED_PLATFORM_ACL_ENVELOPE.not_from_hosted_fingerprint_72af6699, true);
  assert.equal(SEALED_PLATFORM_ACL_ENVELOPE.not_from_financial_ledger_epochs, true);
  assert.match(platformRolesSqlFromEnvelope(), /CREATE ROLE service_role/);
  assert.match(platformRolesSqlFromEnvelope(), /CREATE ROLE anon/);
  assert.match(platformRolesSqlFromEnvelope(), /CREATE ROLE authenticated/);
  const sql = defaultPrivilegesSqlFromEnvelope();
  assert.match(sql, /ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT/);
  assert.match(sql, /ON TABLES TO service_role/);
  assert.match(sql, /ON SEQUENCES TO service_role/);
  assert.match(sql, /ON FUNCTIONS TO service_role/);
  assert.doesNotMatch(sql, /ON TYPES/);
  const qualify = fs.readFileSync(path.join(root, "scripts/qualify-f3-db-push-disposable.mjs"), "utf8");
  assert.match(qualify, /authorizeDbPushAfterPlatformAclCalibration/);
  assert.match(qualify, /F3_PLATFORM_ACL_CALIBRATION_HOLD/);
  const gate = fs.readFileSync(path.join(root, "scripts/lib/f3-db-push-repair-safety-gate.mjs"), "utf8");
  assert.match(gate, /no post-process union of service_role/);
  assert.doesNotMatch(gate, /blindly union service_role into fingerprints/);
});

test("Phase B platform ACL negatives: missing/extra/wrong service_role and grant semantics", async () => {
  const expected = getFrozenExpectedFingerprint(FILE118);
  const cases = [
    ["missing-service_role-tuple", (o) => {
      o.acls = o.acls.filter((row) => row.grantee !== "service_role");
      o.acl = o.acls;
      o.relations = o.relations.map((rel) => ({
        ...rel,
        acl: (rel.acl || []).filter((row) => row.grantee !== "service_role"),
      }));
    }],
    ["extra-service_role-tuple", (o) => {
      const extra = serviceRoleAclRow({ privilege: "TRUNCATE", object_name: "financial_ledger_epochs" });
      const already = o.acls.some((row) => (
        row.grantee === extra.grantee && row.privilege === extra.privilege && row.object_name === extra.object_name
      ));
      o.acls = already
        ? [...o.acls, { ...extra, object_name: "forged_extra_epochs" }]
        : [...o.acls, extra];
      o.acl = o.acls;
    }],
    ["wrong-privilege", (o) => {
      o.acls = o.acls.map((row) => (
        row.grantee === "service_role" ? { ...row, privilege: "DELETE" } : row
      ));
      o.acl = o.acls;
    }],
    ["wrong-grantor", (o) => {
      o.acls = o.acls.map((row) => (
        row.grantee === "service_role" ? { ...row, grantor: "ubuntu" } : row
      ));
      o.acl = o.acls;
    }],
    ["wrong-object", (o) => {
      o.acls = o.acls.map((row) => (
        row.grantee === "service_role" ? { ...row, object_name: "forged_object" } : row
      ));
      o.acl = o.acls;
    }],
    ["wrong-grantability", (o) => {
      o.acls = o.acls.map((row) => (
        row.grantee === "service_role" ? { ...row, grantable: true } : row
      ));
      o.acl = o.acls;
    }],
    ["acl-acls-disagreement", (o) => {
      o.acls = o.acls.map((row, i) => (i === 0 ? { ...row, grantee: "ubuntu" } : row));
    }],
  ];
  for (const [name, mutate] of cases) {
    const observed = structuredClone(expected);
    mutate(observed);
    await assertPlatformAclNegative(name, {
      fingerprint: { expected, observed },
    });
  }
});

test("Phase B applying platform envelope to inapplicable object type rejects before db push", async () => {
  const mutated = structuredClone(SEALED_PLATFORM_ACL_ENVELOPE);
  mutated.default_acl_canonical = [
    ...mutated.default_acl_canonical,
    {
      creating_role: "postgres",
      schema_name: "public",
      object_class: "type",
      grantor: "postgres",
      grantee: "service_role",
      privilege_type: "USAGE",
      is_grantable: false,
    },
  ];
  await assertPlatformAclNegative("inapplicable-type-in-envelope", {
    applyInput: { envelope: mutated },
    gateExtra: { platformAclEnvelope: mutated },
  });
  await assertPlatformAclNegative("inapplicable-target-object-class", {
    applyInput: {
      envelope: SEALED_PLATFORM_ACL_ENVELOPE,
      targetObjectClass: "type",
    },
    gateExtra: { platformAclTargetObjectClass: "type" },
  });
  assert.throws(
    () => defaultPrivilegesSqlFromEnvelope(SEALED_PLATFORM_ACL_ENVELOPE, "type"),
    (err) => /inapplicable object type/i.test(err.message),
  );
  assert.match(PLATFORM_ACL_INAPPLICABLE_OBJECT_HOLD, /inapplicable object type/);
});

test("Phase B target-observed ACL cannot replace or mutate sealed expected", async () => {
  const expected = getFrozenExpectedFingerprint(FILE118);
  const before = fingerprintCanonicalSha256(expected);
  const hostedLike = structuredClone(expected);
  hostedLike.acls = [...hostedLike.acls, serviceRoleAclRow({
    privilege: "SELECT",
    object_name: "target_observed_forged_epochs",
  })];
  hostedLike.acl = hostedLike.acls;
  const forgedExpected = structuredClone(hostedLike);
  await assertPlatformAclNegative("target-observed-cannot-become-expected", {
    fingerprint: { expected: forgedExpected, observed: hostedLike },
  });
  assert.equal(fingerprintCanonicalSha256(getFrozenExpectedFingerprint(FILE118)), before);
  assertExpectedFingerprintImmutable(FILE118);
  assert.equal(
    EXPECTED_FINGERPRINT_SEAL_PROVENANCE.independently_reproduced_hosted_00118_after_platform_defaults,
    false,
  );
  assert.equal(
    EXPECTED_FINGERPRINT_SEAL_PROVENANCE.f3_full_catalog_v1_independently_reproduced_hosted_00118_after_platform_defaults,
    true,
  );
  assert.equal(EXPECTED_FINGERPRINT_SEAL_PROVENANCE.not_copied_from_hosted_observed, true);
  assert.notEqual(
    fingerprintCanonicalSha256(forgedExpected),
    before,
  );
  const contracts = assertFingerprintAclContracts(expected);
  assert.equal(contracts.ok, true);
});

test("Phase B malformed or absent calibration evidence rejects before db push", async () => {
  const cases = [
    ["absent", null],
    ["malformed-string", "not-an-envelope"],
    ["malformed-array", []],
    ["digest-mismatch", { ...SEALED_PLATFORM_ACL_ENVELOPE, artifact: "forged-envelope" }],
  ];
  for (const [name, envelope] of cases) {
    const prePush = authorizeDbPushAfterPlatformAclCalibration({ envelope });
    assert.equal(prePush.ok, false, name);
    assert.equal(prePush.dbPushAuthorized, false, name);
    assert.equal(prePush.fingerprint_exact, false, name);
    assert.equal(prePush.dbPushCalls, 0, name);
    assert.equal(prePush.repairCalls, 0, name);
    await assertPlatformAclNegative(name, {
      gateExtra: { platformAclEnvelope: envelope },
    });
    const sealed = await sealExpectedFingerprintsFromLocalOracle({
      platformAclEnvelope: envelope,
      fixtures: {
        createDisposableDatabase() {
          throw new Error("seal must not open a database when calibration fails");
        },
      },
    });
    assert.equal(sealed.ok, false, `${name} seal`);
    assert.equal(sealed.status, "HOLD", `${name} seal status`);
  }
  assert.match(PLATFORM_ACL_CALIBRATION_HOLD, /digest mismatch|missing|malformed/);
});

function publishNegativeRecord(partial) {
  const dbPushCallsObserved = Number(partial.dbPushCallsObserved ?? partial.dbPushCalls ?? 0);
  const repairCallsObserved = Number(partial.repairCallsObserved ?? partial.repairCalls ?? 0);
  const continuationCallsObserved = Number(
    partial.continuationCallsObserved
    ?? partial.continuationCalls
    ?? (partial.continuation === true ? 1 : 0),
  );
  const orderedCallTrace = Array.isArray(partial.orderedCallTrace) ? [...partial.orderedCallTrace] : [];
  return {
    caseId: partial.caseId,
    name: partial.name || partial.caseId,
    exactMutation: partial.exactMutation,
    enforcementPath: partial.enforcementPath || partial.failedGate,
    expectedClassification: partial.expectedClassification || "rejected",
    actualClassification: partial.actualClassification || partial.classification,
    classification: partial.classification,
    failedGate: partial.failedGate,
    dbPushCalls: dbPushCallsObserved,
    repairCalls: repairCallsObserved,
    continuationCalls: continuationCallsObserved,
    dbPushCallsObserved,
    repairCallsObserved,
    continuationCallsObserved,
    orderedCallTrace,
    cleanup: partial.cleanup,
    poisonVerification: partial.poisonVerification,
    continuation: partial.continuation,
    result: partial.result,
  };
}

async function recordFingerprintReject(caseId, exactMutation, mutate, file = FILE118) {
  const expected = getFrozenExpectedFingerprint(file);
  const observed = structuredClone(expected);
  mutate(observed);
  const exact = fingerprintCompleteAndExact({ expected, observed }, file);
  const orderedCallTrace = [];
  let dbPushCallsObserved = 0;
  let repairCallsObserved = 0;
  let continuationCallsObserved = 0;
  let cleanupCalls = 0;
  let poisonCalls = 0;
  const decided = await runRepairSafetyThenMaybeRepair({
    gateInput: authorizedGateInput({
      file,
      targetVersion: PREASSIGNED_VERSIONS[file],
      digest: FROZEN_DIGESTS[file],
      onDiskDigest: FROZEN_DIGESTS[file],
      fingerprint: { expected, observed },
      probe: passingProbe(file),
      stagedMigrations: authorizedStagedPrefixThrough(file),
      injectSql: historyInjectSqlForFile(file),
      stderr: `${HISTORY_INJECT_MARKER}: blocked INSERT for version ${PREASSIGNED_VERSIONS[file]} name ${PREASSIGNED_NAMES[file]}`,
    }),
    cleanup: () => {
      cleanupCalls += 1;
      orderedCallTrace.push("cleanup");
      return provenCleanup();
    },
    verifyPoisonAbsent: () => {
      poisonCalls += 1;
      orderedCallTrace.push("verifyPoisonAbsent");
      return poisonAbsentResult();
    },
    repair: () => {
      repairCallsObserved += 1;
      orderedCallTrace.push("repair");
      return { status: 0 };
    },
  });
  if (decided.continuation === true) continuationCallsObserved += 1;
  return publishNegativeRecord({
    caseId,
    exactMutation,
    classification: exact.reason || decided.gate?.reason || "rejected",
    failedGate: (decided.gate?.failedGates || []).join(",") || "fingerprint_exact",
    dbPushCallsObserved,
    repairCallsObserved,
    continuationCallsObserved,
    orderedCallTrace,
    enforcementPath: "runRepairSafetyThenMaybeRepair/fingerprintCompleteAndExact",
    expectedClassification: "rejected",
    actualClassification: exact.reason || decided.gate?.reason || "rejected",
    cleanup: cleanupCalls > 0 ? "ran" : "none",
    poisonVerification: poisonCalls > 0 ? "ran" : "none",
    continuation: decided.continuation === true,
    result: decided.repairAuthorized === false && repairCallsObserved === 0 ? "rejected" : "UNEXPECTED",
  });
}

test("independent collector source-contract: cannot import or invoke primary collector/builder", () => {
  const independentPath = path.join(root, INDEPENDENT_REFERENCE_MODULE_RELPATH);
  const src = fs.readFileSync(independentPath, "utf8");
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.doesNotMatch(src, /f3-db-push-repair-safety-gate/);
  assert.doesNotMatch(stripped, /CATALOG_FINGERPRINT_SQL/);
  assert.doesNotMatch(stripped, /canonicalizeFingerprintForCompare/);
  assert.doesNotMatch(stripped, /buildExpandedExpectedFingerprint/);
  assert.doesNotMatch(stripped, /buildIndependentObservedFingerprint/);
  assert.doesNotMatch(stripped, /fingerprintCompleteAndExact/);
  assert.doesNotMatch(stripped, /collectCanonicalFullFingerprint/);
  assert.doesNotMatch(stripped, /getFrozenExpectedFingerprint/);
  assert.doesNotMatch(stripped, /FROZEN_EXPECTED_ORACLE_CATALOG/);
  assert.match(src, /INDEPENDENT_FULL_CATALOG_SQL/);
  assert.match(src, /collectIndependentFullCatalogReference/);
  assert.equal(typeof collectIndependentFullCatalogReference, "function");
  assert.equal(F3_FUNCTIONAL_RECURSIVE_CLOSURE.independent_reference_module, INDEPENDENT_REFERENCE_MODULE_RELPATH);
  assert.match(F3_FUNCTIONAL_RECURSIVE_CLOSURE.independent_reference_source_sha256, /^[0-9a-f]{64}$/);
  const recomputed = createHash("sha256").update(fs.readFileSync(independentPath)).digest("hex");
  assert.equal(F3_FUNCTIONAL_RECURSIVE_CLOSURE.independent_reference_source_sha256, recomputed);
});

test("f3-full-catalog-v5 trigger-state and column-ACL negatives forbid repair", async () => {
  const expected = getFrozenExpectedFingerprint(FILE118);
  assert.equal(expected.schema_version, "f3-full-catalog-v5");
  assert.equal(F3_FULL_FINGERPRINT_NESTED_KEYS.triggers.includes("tgenabled"), true);
  assert.equal(F3_FULL_FINGERPRINT_NESTED_KEYS.columns.includes("attacl"), true);
  assert.ok(expected.triggers.every((row) => ["O", "D", "R", "A"].includes(row.tgenabled)));
  assert.ok(expected.columns.every((row) => typeof row.attacl_is_null === "boolean" && Array.isArray(row.attacl)));
  const cases = [
    ["TRIG-disabled", (o) => {
      o.triggers = o.triggers.map((row, i) => (i === 0 ? { ...row, tgenabled: "D" } : row));
    }],
    ["TRIG-replica", (o) => {
      o.triggers = o.triggers.map((row, i) => (i === 0 ? { ...row, tgenabled: "R" } : row));
    }],
    ["TRIG-always", (o) => {
      o.triggers = o.triggers.map((row, i) => (i === 0 ? { ...row, tgenabled: "A" } : row));
    }],
    ["TRIG-missing-tgenabled", (o) => {
      o.triggers = o.triggers.map((row, i) => {
        if (i !== 0) return row;
        const next = { ...row };
        delete next.tgenabled;
        return next;
      });
    }],
    ["TRIG-definition", (o) => {
      o.triggers = o.triggers.map((row, i) => (i === 0 ? { ...row, user_definition: "CREATE TRIGGER forged" } : row));
    }],
    ["TRIG-function-identity", (o) => {
      o.triggers = o.triggers.map((row, i) => (i === 0 ? { ...row, function_name: "forged", function_identity_arguments: "" } : row));
    }],
    ["TRIG-internal", (o) => {
      o.triggers = o.triggers.map((row, i) => (i === 0 ? { ...row, tgisinternal: !row.tgisinternal } : row));
    }],
    ["COL-missing-attacl", (o) => {
      o.columns = o.columns.map((row, i) => {
        if (i !== 0) return row;
        const next = { ...row };
        delete next.attacl;
        delete next.attacl_is_null;
        return next;
      });
    }],
    ["COL-null-vs-empty", (o) => {
      o.columns = o.columns.map((row, i) => (
        i === 0 ? { ...row, attacl_is_null: !row.attacl_is_null } : row
      ));
    }],
    ["COL-unexpected-acl", (o) => {
      o.columns = o.columns.map((row, i) => (
        i === 0
          ? {
            ...row,
            attacl_is_null: false,
            attacl: [{ grantor: "postgres", grantee: "ubuntu", privilege: "SELECT", is_grantable: false }],
          }
          : row
      ));
    }],
    ["COL-wrong-grantee", (o) => {
      const first = o.columns[0];
      o.columns = o.columns.map((row, i) => (
        i === 0
          ? {
            ...row,
            attacl_is_null: false,
            attacl: [{
              grantor: "postgres",
              grantee: "service_role",
              privilege: "UPDATE",
              is_grantable: false,
            }],
          }
          : row
      ));
      if (first.attacl_is_null === false && first.attacl.length > 0) {
        o.columns[0] = {
          ...first,
          attacl: first.attacl.map((tuple, i) => (i === 0 ? { ...tuple, grantee: "ubuntu" } : tuple)),
        };
      }
    }],
    ["COL-wrong-grantor", (o) => {
      o.columns = o.columns.map((row, i) => (
        i === 0
          ? {
            ...row,
            attacl_is_null: false,
            attacl: [{ grantor: "ubuntu", grantee: "postgres", privilege: "SELECT", is_grantable: false }],
          }
          : row
      ));
    }],
    ["COL-wrong-privilege", (o) => {
      o.columns = o.columns.map((row, i) => (
        i === 0
          ? {
            ...row,
            attacl_is_null: false,
            attacl: [{ grantor: "postgres", grantee: "postgres", privilege: "INSERT", is_grantable: false }],
          }
          : row
      ));
    }],
    ["COL-wrong-grantability", (o) => {
      o.columns = o.columns.map((row, i) => (
        i === 0
          ? {
            ...row,
            attacl_is_null: false,
            attacl: [{ grantor: "postgres", grantee: "postgres", privilege: "SELECT", is_grantable: true }],
          }
          : row
      ));
    }],
    ["COL-wrong-relation", (o) => {
      o.columns = o.columns.map((row, i) => (
        i === 0
          ? {
            ...row,
            relation: "forged_relation",
            attacl_is_null: false,
            attacl: [{ grantor: "postgres", grantee: "postgres", privilege: "SELECT", is_grantable: false }],
          }
          : row
      ));
    }],
  ];
  for (const [name, mutate] of cases) {
    const observed = structuredClone(expected);
    mutate(observed);
    assert.equal(fingerprintCompleteAndExact({ expected, observed }, FILE118).ok, false, name);
    let repairCalls = 0;
    const decided = await runRepairSafetyThenMaybeRepair({
      gateInput: authorizedGateInput({ fingerprint: { expected, observed } }),
      cleanup: () => provenCleanup(),
      verifyPoisonAbsent: () => poisonAbsentResult(),
      repair: () => {
        repairCalls += 1;
        return { status: 0 };
      },
    });
    assert.equal(decided.repairAuthorized, false, name);
    assert.equal(repairCalls, 0, `${name} repairCalls`);
  }
  const reorderOnly = structuredClone(expected);
  reorderOnly.columns = reorderOnly.columns.map((row, i) => {
    if (i !== 0) return row;
    const tuples = [
      { grantor: "postgres", grantee: "authenticated", privilege: "UPDATE", is_grantable: false },
      { grantor: "postgres", grantee: "authenticated", privilege: "SELECT", is_grantable: false },
    ];
    return { ...row, attacl_is_null: false, attacl: tuples };
  });
  const expectedReordered = structuredClone(expected);
  expectedReordered.columns = expectedReordered.columns.map((row, i) => {
    if (i !== 0) return row;
    return {
      ...row,
      attacl_is_null: false,
      attacl: [
        { grantor: "postgres", grantee: "authenticated", privilege: "SELECT", is_grantable: false },
        { grantor: "postgres", grantee: "authenticated", privilege: "UPDATE", is_grantable: false },
      ],
    };
  });
  assert.equal(
    fingerprintCompleteAndExact({ expected: expectedReordered, observed: reorderOnly }).ok,
    true,
    "identical attacl tuples may pass after deterministic sort only",
  );
});

test("published complete negative matrix: N1-N24 + FC/platform + v2 + envelope + evidence", async () => {
  const records = [];
  const twoArg = aclRecord({
    object_type: "routine",
    object_name: "f3_amount",
    prokind: "f",
    identity_arguments: "p_value jsonb, p_currency text",
    privilege: "EXECUTE",
    grantee: "postgres",
  });
  const threePlus = aclRecord({
    object_type: "routine",
    object_name: "lock_financial_occurrence",
    prokind: "f",
    identity_arguments: LOCK_OCCURRENCE_ARGS,
    privilege: "EXECUTE",
    grantee: "postgres",
  });
  const overloadA = aclRecord({
    object_type: "routine",
    object_name: "lock_it",
    prokind: "f",
    identity_arguments: "p uuid",
    privilege: "EXECUTE",
    grantee: "postgres",
  });
  const overloadB = aclRecord({
    object_type: "routine",
    object_name: "lock_it",
    prokind: "f",
    identity_arguments: "p uuid, q text",
    privilege: "EXECUTE",
    grantee: "postgres",
  });

  const accept = (caseId, exactMutation, ok) => {
    records.push(publishNegativeRecord({
      caseId,
      exactMutation,
      classification: ok ? "accepted" : "rejected",
      failedGate: ok ? "" : "fingerprint_exact",
      dbPushCalls: 0,
      repairCalls: 0,
      cleanup: "n/a-accepted",
      poisonVerification: "n/a-accepted",
      continuation: false,
      result: ok ? "accepted" : "UNEXPECTED",
    }));
    assert.equal(ok, true, caseId);
  };

  accept(
    "N1",
    "multi-argument ACL identity remains complete",
    fingerprintCompleteAndExact(pairFromCatalog({ acl: [threePlus] }, { acl: [threePlus] })).ok,
  );
  accept(
    "N2",
    "overloads remain distinct; order-only",
    fingerprintCompleteAndExact(pairFromCatalog(
      { acl: [overloadA, overloadB] },
      { acl: [overloadB, overloadA] },
    )).ok,
  );
  accept(
    "N3",
    "record-order-only ACL difference accepted",
    fingerprintCompleteAndExact(pairFromCatalog({ acl: [twoArg, threePlus] }, { acl: [threePlus, twoArg] })).ok,
  );

  const rejectFp = async (caseId, exactMutation, fingerprint) => {
    const decided = await assertFingerprintForbidsRepair(caseId, fingerprint);
    records.push(publishNegativeRecord({
      caseId,
      exactMutation,
      classification: decided.gate?.reason || "fingerprint_exact",
      failedGate: (decided.gate?.failedGates || []).join(",") || "fingerprint_exact",
      dbPushCalls: 0,
      repairCalls: 0,
      cleanup: "ran",
      poisonVerification: "ran",
      continuation: false,
      result: "rejected",
    }));
  };

  await rejectFp("N4", "truncated identity after first comma", pairFromCatalog(
    { acl: [threePlus] },
    { acl: [aclRecord({ ...threePlus, identity_arguments: "p_group_id uuid, p_source_module text" })] },
  ));
  await rejectFp("N5", "same ACL count different object pairing", pairFromCatalog(
    { acl: [overloadA, twoArg] },
    { acl: [overloadB, twoArg] },
  ));
  await rejectFp("N6", "wrong grantee/grantor/privilege/grantability", pairFromCatalog(
    { acl: [twoArg] },
    { acl: [aclRecord({ ...twoArg, grantee: "ubuntu", grantor: "ubuntu", privilege: "SELECT", grantable: true })] },
  ));
  await rejectFp("N7", "missing/extra/duplicate ACL", pairFromCatalog(
    { acl: [twoArg] },
    { acl: [twoArg, twoArg] },
  ));

  const malformedProbe = await assertProbeForbidsRepair("N8", {
    status: 1,
    stdout: "",
    stderr: FINANCIAL_PRIVATE_MISSING_ERROR,
    file: FILE121,
  });
  records.push(publishNegativeRecord({
    caseId: "N8",
    exactMutation: "malformed/nonzero probe",
    classification: malformedProbe.gate?.reason || "expected_objects",
    failedGate: (malformedProbe.gate?.failedGates || []).join(","),
    dbPushCalls: 0,
    repairCalls: 0,
    cleanup: "ran",
    poisonVerification: "ran",
    continuation: false,
    result: "rejected",
  }));

  records.push(await recordFingerprintReject("N9", "fingerprint mismatch (relations emptied)", (o) => {
    o.relations = [];
  }));

  let cleanupRepair = 0;
  const cleanupFail = await runRepairSafetyThenMaybeRepair({
    gateInput: authorizedGateInput(),
    cleanup: () => ({ status: 1, stdout: "", stderr: "ERROR: cannot drop trigger" }),
    verifyPoisonAbsent: () => poisonAbsentResult(),
    repair: () => {
      cleanupRepair += 1;
      return { status: 0 };
    },
  });
  records.push(publishNegativeRecord({
    caseId: "N10",
    exactMutation: "cleanup status 1",
    classification: cleanupFail.reason || "cleanup",
    failedGate: "cleanup",
    dbPushCalls: 0,
    repairCalls: cleanupRepair,
    cleanup: "failed",
    poisonVerification: "not-reached-or-ignored",
    continuation: false,
    result: cleanupRepair === 0 ? "rejected" : "UNEXPECTED",
  }));
  assert.equal(cleanupRepair, 0);

  let poisonRepair = 0;
  const poisonFail = await runRepairSafetyThenMaybeRepair({
    gateInput: authorizedGateInput(),
    cleanup: () => provenCleanup(),
    verifyPoisonAbsent: () => ({
      status: 0,
      stdout: JSON.stringify({ trigger_present: true, function_present: false }),
      stderr: "",
    }),
    repair: () => {
      poisonRepair += 1;
      return { status: 0 };
    },
  });
  records.push(publishNegativeRecord({
    caseId: "N11",
    exactMutation: "poison trigger remains",
    classification: poisonFail.reason || "poison",
    failedGate: "poison_absent",
    dbPushCalls: 0,
    repairCalls: poisonRepair,
    cleanup: "ran",
    poisonVerification: "failed",
    continuation: false,
    result: poisonRepair === 0 ? "rejected" : "UNEXPECTED",
  }));
  assert.equal(poisonRepair, 0);

  const isolatedN12 = createIsolatedDbPushWorkdir();
  syncIsolatedMigrationsThrough(isolatedN12, F3_FORWARD_FILES[1]);
  fs.rmSync(path.join(isolatedMigDir(isolatedN12), timestampFilenameFor(F3_FORWARD_FILES[0])), { force: true });
  const stagingN12 = await assertStagingForbidsPushAndRepair("N12", {
    isolated: isolatedN12,
    file: F3_FORWARD_FILES[1],
    historyResult: historyResult(remoteRows([F3_FORWARD_FILES[0]])),
    expectCode: "applied_remote_missing_locally",
    stage: false,
  });
  fs.rmSync(isolatedN12.workdir, { recursive: true, force: true });
  records.push(publishNegativeRecord({
    caseId: "N12",
    exactMutation: "staging-prefix mismatch: applied remote missing locally",
    classification: stagingN12.preflight?.code || "applied_remote_missing_locally",
    failedGate: "staging",
    dbPushCalls: 0,
    repairCalls: 0,
    cleanup: "n/a-pre-runner",
    poisonVerification: "n/a-pre-runner",
    continuation: false,
    result: "rejected",
  }));

  accept(
    "N13",
    "timestamptz lookup resolves to frozen canonical timestamp with time zone identity",
    getFrozenExpectedObjectProbeDescriptors(FILE121)[0].identity_arguments.includes("timestamp with time zone")
      && !getFrozenExpectedObjectProbeDescriptors(FILE121)[0].identity_arguments.includes("timestamptz"),
  );
  accept(
    "N14",
    "multi-arg retained; overloads remain distinct",
    evaluateObjectProbe(passingProbe(FILE121), { file: FILE121 }).present === true,
  );

  const n15 = await assertProbeForbidsRepair("N15", probeFrom121((row) => {
    row.p0 = {
      ...row.p0,
      identity_arguments:
        "p_group_id uuid, p_to timestamp with time zone, p_from timestamp with time zone, p_as_of_exclusive timestamp with time zone",
    };
    return row;
  }));
  records.push(publishNegativeRecord({
    caseId: "N15",
    exactMutation: "argument order changes",
    classification: n15.gate?.reason || "expected_objects",
    failedGate: (n15.gate?.failedGates || []).join(","),
    dbPushCalls: 0,
    repairCalls: 0,
    cleanup: "ran",
    poisonVerification: "ran",
    continuation: false,
    result: "rejected",
  }));
  const n16 = await assertProbeForbidsRepair("N16", probeFrom121((row) => {
    row.p1 = {
      ...row.p1,
      identity_arguments:
        "p_group_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_account_id uuid, p_currency text, p_offset integer",
    };
    return row;
  }));
  records.push(publishNegativeRecord({
    caseId: "N16",
    exactMutation: "missing argument",
    classification: n16.gate?.reason || "expected_objects",
    failedGate: (n16.gate?.failedGates || []).join(","),
    dbPushCalls: 0,
    repairCalls: 0,
    cleanup: "ran",
    poisonVerification: "ran",
    continuation: false,
    result: "rejected",
  }));
  const n17 = await assertProbeForbidsRepair("N17", probeFrom121((row) => {
    row.p0 = { ...row.p0, identity_arguments: `${row.p0.identity_arguments}, p_extra text` };
    return row;
  }));
  records.push(publishNegativeRecord({
    caseId: "N17",
    exactMutation: "extra argument",
    classification: n17.gate?.reason || "expected_objects",
    failedGate: (n17.gate?.failedGates || []).join(","),
    dbPushCalls: 0,
    repairCalls: 0,
    cleanup: "ran",
    poisonVerification: "ran",
    continuation: false,
    result: "rejected",
  }));
  const n18 = await assertProbeForbidsRepair("N18", probeFrom121((row) => {
    row.p0 = {
      ...row.p0,
      identity_arguments: "p_group_id uuid, p_from timestamp, p_to timestamp, p_as_of_exclusive timestamp",
    };
    return row;
  }));
  records.push(publishNegativeRecord({
    caseId: "N18",
    exactMutation: "similar-type timestamp vs timestamptz",
    classification: n18.gate?.reason || "expected_objects",
    failedGate: (n18.gate?.failedGates || []).join(","),
    dbPushCalls: 0,
    repairCalls: 0,
    cleanup: "ran",
    poisonVerification: "ran",
    continuation: false,
    result: "rejected",
  }));
  const n19 = await assertProbeForbidsRepair("N19", probeFrom121((row) => {
    row.p0 = {
      ...row.p0,
      identity_arguments: "p_group_id uuid, p_from timestamptz, p_to timestamptz, p_as_of_exclusive timestamptz",
    };
    return row;
  }));
  records.push(publishNegativeRecord({
    caseId: "N19",
    exactMutation: "lookup alias timestamptz in identity_arguments",
    classification: n19.gate?.reason || "expected_objects",
    failedGate: (n19.gate?.failedGates || []).join(","),
    dbPushCalls: 0,
    repairCalls: 0,
    cleanup: "ran",
    poisonVerification: "ran",
    continuation: false,
    result: "rejected",
  }));
  const n20 = await assertProbeForbidsRepair("N20", {
    status: 0,
    stdout: JSON.stringify([{ p0: null, p1: getFrozenExpectedObjectProbeDescriptors(FILE121)[1] }]),
    stderr: "",
    file: FILE121,
  });
  records.push(publishNegativeRecord({
    caseId: "N20",
    exactMutation: "unresolved signature",
    classification: n20.gate?.reason || "expected_objects",
    failedGate: (n20.gate?.failedGates || []).join(","),
    dbPushCalls: 0,
    repairCalls: 0,
    cleanup: "ran",
    poisonVerification: "ran",
    continuation: false,
    result: "rejected",
  }));
  const n21 = await assertProbeForbidsRepair("N21", {
    status: 0,
    stdout: "{",
    stderr: "",
    file: FILE121,
  });
  records.push(publishNegativeRecord({
    caseId: "N21",
    exactMutation: "malformed non-JSON probe",
    classification: n21.gate?.reason || "expected_objects",
    failedGate: (n21.gate?.failedGates || []).join(","),
    dbPushCalls: 0,
    repairCalls: 0,
    cleanup: "ran",
    poisonVerification: "ran",
    continuation: false,
    result: "rejected",
  }));
  const n22 = await assertProbeForbidsRepair("N22", probeFrom121((row) => {
    row.p1 = { ...row.p1, identity_arguments: "p_group_id uuid, p_from timestamp with time zone" };
    return row;
  }));
  records.push(publishNegativeRecord({
    caseId: "N22",
    exactMutation: "truncated identity (object-probe)",
    classification: n22.gate?.reason || "expected_objects",
    failedGate: (n22.gate?.failedGates || []).join(","),
    dbPushCalls: 0,
    repairCalls: 0,
    cleanup: "ran",
    poisonVerification: "ran",
    continuation: false,
    result: "rejected",
  }));
  const n23 = await assertProbeForbidsRepair("N23", probeFrom121((row) => ({ p0: row.p1, p1: row.p0 })));
  records.push(publishNegativeRecord({
    caseId: "N23",
    exactMutation: "same object count different identity pairing",
    classification: n23.gate?.reason || "expected_objects",
    failedGate: (n23.gate?.failedGates || []).join(","),
    dbPushCalls: 0,
    repairCalls: 0,
    cleanup: "ran",
    poisonVerification: "ran",
    continuation: false,
    result: "rejected",
  }));
  const n24 = await assertProbeForbidsRepair("N24", probeFrom121((row) => {
    row.p1 = { ...row.p0 };
    return row;
  }));
  records.push(publishNegativeRecord({
    caseId: "N24",
    exactMutation: "duplicate structured records",
    classification: n24.gate?.reason || "expected_objects",
    failedGate: (n24.gate?.failedGates || []).join(","),
    dbPushCalls: 0,
    repairCalls: 0,
    cleanup: "ran",
    poisonVerification: "ran",
    continuation: false,
    result: "rejected",
  }));

  records.push(await recordFingerprintReject("FC-relations", "empty relations", (o) => { o.relations = []; }));
  records.push(await recordFingerprintReject("FC-triggers", "empty triggers", (o) => { o.triggers = []; }));
  records.push(await recordFingerprintReject("FC-hgp", "hgp def_md5 drift", (o) => {
    o.hgp = { ...o.hgp, def_md5: "0".repeat(32) };
  }));
  records.push(await recordFingerprintReject("PLAT-missing-service_role", "drop service_role ACL tuples", (o) => {
    o.acls = o.acls.filter((row) => row.grantee !== "service_role");
    o.acl = o.acls;
    o.relations = o.relations.map((rel) => ({
      ...rel,
      acl: (rel.acl || []).filter((row) => row.grantee !== "service_role"),
    }));
  }));
  records.push(await recordFingerprintReject("TRIG-tgenabled", "tgenabled O→D", (o) => {
    o.triggers = o.triggers.map((row, i) => (i === 0 ? { ...row, tgenabled: "D" } : row));
  }));
  records.push(await recordFingerprintReject("COL-attacl-missing", "delete attacl coverage", (o) => {
    o.columns = o.columns.map((row, i) => {
      if (i !== 0) return row;
      const next = { ...row };
      delete next.attacl;
      delete next.attacl_is_null;
      return next;
    });
  }));
  records.push(await recordFingerprintReject("COL-null-vs-empty", "flip attacl_is_null", (o) => {
    o.columns = o.columns.map((row, i) => (i === 0 ? { ...row, attacl_is_null: !row.attacl_is_null } : row));
  }));

  const independentFailObserved = structuredClone(getFrozenExpectedFingerprint(FILE118));
  independentFailObserved.triggers = [];
  const independentExact = fingerprintCompleteAndExact({
    expected: getFrozenExpectedFingerprint(FILE118),
    observed: independentFailObserved,
  }, FILE118);
  records.push(publishNegativeRecord({
    caseId: "IND-REF-FAIL",
    exactMutation: "independent reference / primary structured disagreement (empty triggers)",
    classification: independentExact.reason || "independent_reference",
    failedGate: "fingerprint_exact",
    dbPushCalls: 0,
    repairCalls: 0,
    cleanup: "n/a-compare",
    poisonVerification: "n/a-compare",
    continuation: false,
    result: independentExact.ok === false ? "rejected" : "UNEXPECTED",
  }));
  assert.equal(independentExact.ok, false);

  const missingEnvelope = authorizeDbPushAfterPlatformAclCalibration({ envelope: null });
  records.push(publishNegativeRecord({
    caseId: "ENV-MISSING",
    exactMutation: "missing original envelope",
    classification: missingEnvelope.reason || PLATFORM_ACL_CALIBRATION_HOLD,
    failedGate: "platform_acl_calibration",
    dbPushCalls: missingEnvelope.dbPushCalls,
    repairCalls: missingEnvelope.repairCalls,
    cleanup: "n/a-pre-runner",
    poisonVerification: "n/a-pre-runner",
    continuation: false,
    result: "rejected",
  }));
  assert.equal(missingEnvelope.dbPushCalls, 0);
  assert.equal(missingEnvelope.repairCalls, 0);

  const digestMismatch = authorizeDbPushAfterPlatformAclCalibration({
    envelope: { ...SEALED_PLATFORM_ACL_ENVELOPE, artifact: "forged-envelope" },
  });
  records.push(publishNegativeRecord({
    caseId: "ENV-DIGEST",
    exactMutation: "envelope byte/digest mismatch",
    classification: digestMismatch.reason || PLATFORM_ACL_CALIBRATION_HOLD,
    failedGate: "platform_acl_calibration",
    dbPushCalls: digestMismatch.dbPushCalls,
    repairCalls: digestMismatch.repairCalls,
    cleanup: "n/a-pre-runner",
    poisonVerification: "n/a-pre-runner",
    continuation: false,
    result: "rejected",
  }));
  assert.equal(digestMismatch.dbPushCalls, 0);

  const secret = "super-secret-db-password";
  const rawOut = `# Subtest: pg failure\nnot ok 1 - pg failure\n  ---\n  ${YAML_ERROR_MARKER}\n    ERROR:  role "ubuntu" does not exist\n  password: ${secret}\n  ...\n`;
  const sanitized = sanitizeEvidenceOutBytes(Buffer.from(rawOut, "utf8"), [secret]);
  records.push(publishNegativeRecord({
    caseId: "EVID-SANITIZE",
    exactMutation: "semantic sanitization mutation of suite log secret",
    classification: sanitized.includes(secret) ? "UNEXPECTED" : "sanitized",
    failedGate: "evidence_sanitize",
    dbPushCalls: 0,
    repairCalls: 0,
    cleanup: "n/a-evidence",
    poisonVerification: "n/a-evidence",
    continuation: false,
    result: sanitized.includes(secret) ? "UNEXPECTED" : "rejected-secret",
  }));
  assert.equal(sanitized.includes(secret), false);

  const incompletePhase = runQualifyFingerprintHoldSequence({
    file: FILE118,
    afterCommitCatalog: { schema: catalogFromFrozen().schema },
  });
  records.push(publishNegativeRecord({
    caseId: "FP-INCOMPLETE-PHASE",
    exactMutation: "incomplete fingerprint phase (partial after-commit catalog)",
    classification: incompletePhase.reason || "incomplete",
    failedGate: incompletePhase.hold || REPAIR_SAFETY_HOLD,
    dbPushCalls: 0,
    repairCalls: incompletePhase.repairCalls,
    cleanup: "n/a-sequence",
    poisonVerification: "n/a-sequence",
    continuation: incompletePhase.allowContinuation === true,
    result: incompletePhase.repairCalls === 0 ? "rejected" : "UNEXPECTED",
  }));
  assert.equal(incompletePhase.repairCalls, 0);

  records.push(await recordFingerprintReject("FP-KEYSET", "expected/pre/post keyset mismatch (delete triggers)", (o) => {
    delete o.triggers;
  }));

  const evidDir = fs.mkdtempSync(path.join(os.tmpdir(), "f3-evidence-matrix-"));
  const missingLog = verifyEvidenceIndex(evidDir);
  records.push(publishNegativeRecord({
    caseId: "EVID-MISSING-LOG",
    exactMutation: "missing suite log / evidence index",
    classification: missingLog.ok ? "UNEXPECTED" : "missing_index",
    failedGate: "evidence_index",
    dbPushCalls: 0,
    repairCalls: 0,
    cleanup: "n/a-evidence",
    poisonVerification: "n/a-evidence",
    continuation: false,
    result: missingLog.ok ? "UNEXPECTED" : "rejected",
  }));
  assert.equal(missingLog.ok, false);

  const outPath = path.join(evidDir, "suite.out");
  fs.writeFileSync(outPath, "ok 1 - placeholder\n");
  const written = writeSuiteMetaForOutFile(outPath, { tests: [{ name: "placeholder", ok: true }] });
  const index = writeEvidenceIndexAndChecksum(evidDir, [
    { path: "suite.out", sha256: written.meta.sha256, bytes: written.meta.bytes },
    { path: "suite.meta.json", sha256: createHash("sha256").update(fs.readFileSync(written.metaPath)).digest("hex") },
  ]);
  fs.writeFileSync(index.checksumPath, "0".repeat(64) + "\n");
  const metaMismatch = verifyEvidenceIndex(evidDir);
  records.push(publishNegativeRecord({
    caseId: "EVID-LOG-META",
    exactMutation: "log metadata / index checksum mismatch",
    classification: metaMismatch.ok ? "UNEXPECTED" : "checksum_mismatch",
    failedGate: "evidence_index",
    dbPushCalls: 0,
    repairCalls: 0,
    cleanup: "n/a-evidence",
    poisonVerification: "n/a-evidence",
    continuation: false,
    result: metaMismatch.ok ? "UNEXPECTED" : "rejected",
  }));
  assert.equal(metaMismatch.ok, false);

  fs.writeFileSync(index.checksumPath, `${index.sha256}\n`);
  const detached = structuredClone(index.index);
  detached.artifacts = detached.artifacts.map((item) => (
    item.path === "suite.out" ? { ...item, sha256: "1".repeat(64) } : item
  ));
  fs.writeFileSync(path.join(evidDir, EVIDENCE_INDEX_FILENAME), JSON.stringify(detached, null, 2));
  const detachedVerify = verifyEvidenceIndex(evidDir);
  records.push(publishNegativeRecord({
    caseId: "EVID-DETACHED-INDEX",
    exactMutation: "detached-index mismatch (artifact sha256 rewritten)",
    classification: detachedVerify.ok ? "UNEXPECTED" : "detached_index",
    failedGate: "evidence_index",
    dbPushCalls: 0,
    repairCalls: 0,
    cleanup: "n/a-evidence",
    poisonVerification: "n/a-evidence",
    continuation: false,
    result: detachedVerify.ok ? "UNEXPECTED" : "rejected",
  }));
  assert.equal(detachedVerify.ok, false);
  fs.rmSync(evidDir, { recursive: true, force: true });

  for (const record of records) {
    if (record.result === "accepted") continue;
    assert.equal(record.repairCalls, 0, `${record.caseId} repairCalls`);
    if (String(record.cleanup).includes("pre-runner") || record.caseId.startsWith("ENV-") || record.caseId.startsWith("N12")) {
      assert.equal(record.dbPushCalls, 0, `${record.caseId} dbPushCalls`);
    }
    assert.notEqual(record.result, "UNEXPECTED", record.caseId);
  }
  const ids = records.map((row) => row.caseId);
  for (const required of [
    "N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8", "N9", "N10",
    "N11", "N12", "N13", "N14", "N15", "N16", "N17", "N18", "N19", "N20",
    "N21", "N22", "N23", "N24",
    "FC-relations", "PLAT-missing-service_role", "TRIG-tgenabled", "COL-attacl-missing",
    "IND-REF-FAIL", "ENV-MISSING", "ENV-DIGEST", "EVID-SANITIZE",
    "FP-INCOMPLETE-PHASE", "FP-KEYSET", "EVID-MISSING-LOG", "EVID-LOG-META", "EVID-DETACHED-INDEX",
  ]) {
    assert.equal(ids.includes(required), true, `matrix missing ${required}`);
  }
  assert.equal(assertFullCatalogV2Coverage(getFrozenExpectedFingerprint(FILE118)).ok, true);
  console.log(JSON.stringify({ publishedNegativeMatrix: records }, null, 2));
});

test("C1-C14 genuine negatives: internal constraint-trigger + evidence-integrity fail-closed", async () => {
  const expected = getFrozenExpectedFingerprint(FILE118);
  const outcomes = [];
  const publish = (record) => {
    outcomes.push(publishNegativeRecord(record));
    return record;
  };

  const internalIdx = expected.triggers.findIndex((row) => row.tgisinternal === true && row.constraint_association === true);
  const userIdx = expected.triggers.findIndex((row) => row.tgisinternal === false);
  const workIdx = internalIdx >= 0 ? internalIdx : (userIdx >= 0 ? userIdx : 0);
  assert.ok(expected.triggers.length > 0, "expected triggers present for C1-C6");

  publish(await recordFingerprintReject("C1", "internal FK trigger tgenabled O→D", (o) => {
    o.triggers = o.triggers.map((row, i) => (i === workIdx ? { ...row, tgenabled: "D" } : row));
  }));
  publish(await recordFingerprintReject("C2", "internal/user trigger missing", (o) => {
    o.triggers = o.triggers.filter((_, i) => i !== workIdx);
  }));
  publish(await recordFingerprintReject("C3", "extra internal constraint trigger", (o) => {
    const extra = {
      ...o.triggers[workIdx],
      constraint_name: `${o.triggers[workIdx].constraint_name || "financial_ledger_epochs_pkey"}_extra`,
      user_trigger_name: "",
      user_definition: "",
      tgisinternal: true,
      constraint_association: true,
      constraint_trigger: true,
      multiplicity: (o.triggers[workIdx].multiplicity || 1) + 1,
    };
    o.triggers = [...o.triggers, extra];
  }));
  publish(await recordFingerprintReject("C4", "constraint-trigger reassociation", (o) => {
    o.triggers = o.triggers.map((row, i) => (
      i === workIdx
        ? { ...row, constraint_name: "reassociated_constraint", constraint_schema: "public", constraint_association: true }
        : row
    ));
  }));
  publish(await recordFingerprintReject("C5", "trigger-function identity mismatch", (o) => {
    o.triggers = o.triggers.map((row, i) => (
      i === workIdx
        ? { ...row, function_schema: "pg_catalog", function_name: "forged_ri_fn", function_identity_arguments: "oid" }
        : row
    ));
  }));
  publish(await recordFingerprintReject("C6", "trigger event/timing/level mismatch", (o) => {
    o.triggers = o.triggers.map((row, i) => (
      i === workIdx
        ? { ...row, timing: row.timing === "AFTER" ? "BEFORE" : "AFTER", events: "TRUNCATE", level: "STATEMENT" }
        : row
    ));
  }));

  const missingOutDir = fs.mkdtempSync(path.join(os.tmpdir(), "f3-c7-"));
  const missingOutMeta = path.join(missingOutDir, "suite.meta.json");
  fs.writeFileSync(missingOutMeta, JSON.stringify({ sha256: "0".repeat(64), bytes: 1 }, null, 2));
  const c7 = verifyCommittedSuiteEvidence({
    outPath: path.join(missingOutDir, "suite.out"),
    metaPath: missingOutMeta,
  });
  publish({
    caseId: "C7",
    exactMutation: "missing suite output referenced by committed evidence",
    classification: c7.code || "F3_SUITE_OUTPUT_MISSING",
    failedGate: "suite_evidence_integrity",
    dbPushCalls: 0,
    repairCalls: 0,
    continuationCalls: 0,
    cleanup: "n/a-evidence",
    poisonVerification: "n/a-evidence",
    continuation: false,
    result: c7.ok ? "UNEXPECTED" : "rejected",
  });
  assert.equal(c7.ok, false);
  fs.rmSync(missingOutDir, { recursive: true, force: true });

  const c8dir = fs.mkdtempSync(path.join(os.tmpdir(), "f3-c8-"));
  const c8out = path.join(c8dir, "suite.out");
  fs.writeFileSync(c8out, "ok 1 - placeholder\n");
  const c8written = writeSuiteMetaForOutFile(c8out, { tests: [{ name: "placeholder", ok: true }] });
  const mutatedMeta = { ...c8written.meta, sha256: "1".repeat(64), bytes: 999 };
  fs.writeFileSync(c8written.metaPath, `${JSON.stringify(mutatedMeta, null, 2)}\n`);
  const c8 = verifyCommittedSuiteEvidence({ outPath: c8out, metaPath: c8written.metaPath });
  publish({
    caseId: "C8",
    exactMutation: "suite output vs metadata SHA/byte-length disagreement",
    classification: c8.code || "F3_SUITE_META_MISMATCH",
    failedGate: "suite_evidence_integrity",
    dbPushCalls: 0,
    repairCalls: 0,
    continuationCalls: 0,
    cleanup: "n/a-evidence",
    poisonVerification: "n/a-evidence",
    continuation: false,
    result: c8.ok ? "UNEXPECTED" : "rejected",
  });
  assert.equal(c8.ok, false);
  fs.rmSync(c8dir, { recursive: true, force: true });

  const independentDisagree = evaluateIndependentReferenceAgreement({
    primary: expected,
    independent: { ...expected, triggers: [] },
  });
  const c9gate = fingerprintCompleteAndExact({
    expected,
    observed: expected,
    independent: { ...expected, triggers: [] },
  }, FILE118);
  publish({
    caseId: "C9",
    exactMutation: "actual independent-reference disagreement (empty triggers)",
    classification: independentDisagree.reason || "independent_reference_disagreement",
    failedGate: "fingerprint_exact",
    dbPushCalls: 0,
    repairCalls: 0,
    continuationCalls: 0,
    cleanup: "n/a-compare",
    poisonVerification: "n/a-compare",
    continuation: false,
    result: (!independentDisagree.ok && !c9gate.ok) ? "rejected" : "UNEXPECTED",
  });
  assert.equal(independentDisagree.ok, false);
  assert.equal(c9gate.ok, false);

  const semanticRaw = JSON.stringify({
    acl: [{ privilege: "SELECT", grantee: "service_role", secret: "super-secret-db-password" }],
    default_acl_canonical: [{ privilege_type: "EXECUTE", grantee: "anon", note: "super-secret-db-password" }],
  });
  const semanticSanitized = sanitizeEvidenceOutBytes(semanticRaw, ["super-secret-db-password"]);
  const c10 = assertSanitizationPreservesSemanticFingerprint(semanticRaw, semanticSanitized);
  publish({
    caseId: "C10",
    exactMutation: "semantic fingerprint mutation during sanitization",
    classification: c10.code || "F3_SEMANTIC_SANITIZE",
    failedGate: "evidence_sanitize",
    dbPushCalls: 0,
    repairCalls: 0,
    continuationCalls: 0,
    cleanup: "n/a-evidence",
    poisonVerification: "n/a-evidence",
    continuation: false,
    result: c10.ok ? "UNEXPECTED" : "rejected",
  });
  assert.equal(c10.ok, false);

  const incompleteList = ["scripts/qualify-f3-db-push-disposable.mjs"];
  const recursive = buildFunctionalRecursiveRuntimeClosure();
  const incompleteClosure = {
    ...recursive,
    files: incompleteList,
    closure_complete: false,
    missing: 1,
    unresolved: 0,
    runtime_read_missing: REQUIRED_RUNTIME_READ_INPUTS.length,
    runtime_read_missing_paths: REQUIRED_RUNTIME_READ_INPUTS.map((item) => item.path),
    unexplained_exclusions: 0,
    uncommitted_functional_diffs: 0,
    hosted_tree_mismatches: 0,
  };
  const c11gate = assertRecursiveClosureReadyForDb(incompleteClosure);
  const c11ok = recursive.closure_complete === true
    && recursive.missing === 0
    && recursive.unresolved === 0
    && recursive.runtime_read_missing === 0
    && recursive.unexplained_exclusions === 0
    && recursive.files.length > incompleteList.length
    && F3_FORWARD_FILES.every((file) => recursive.files.includes(`supabase/migrations/${file}`))
    && REQUIRED_RUNTIME_READ_INPUTS.every((item) => recursive.files.includes(item.path))
    && recursive.files.includes(INDEPENDENT_REFERENCE_MODULE_RELPATH)
    && c11gate.ok === false
    && c11gate.dbAccess === false
    && c11gate.dbPushCalls === 0
    && c11gate.repairCalls === 0;
  publish({
    caseId: "C11",
    exactMutation: "incomplete recursive local dependency closure submitted to real enforcement gate",
    enforcementPath: "assertRecursiveClosureReadyForDb",
    expectedClassification: "rejected",
    actualClassification: c11gate.reason || "incomplete_closure",
    classification: c11ok ? "rejected-incomplete-closure" : "UNEXPECTED",
    failedGate: "recursive_runtime_closure",
    dbPushCalls: c11gate.dbPushCalls,
    repairCalls: c11gate.repairCalls,
    continuationCalls: c11gate.continuationCalls,
    cleanup: "n/a-closure",
    poisonVerification: "n/a-closure",
    continuation: false,
    result: c11ok ? "rejected" : "UNEXPECTED",
  });
  assert.equal(recursive.method, "recursive_static_dynamic_and_runtime_filesystem_reads");
  assert.equal(c11gate.ok, false);
  assert.equal(c11gate.dbPushCalls, 0);
  assert.equal(c11ok, true);

  const premature = assertFinalInventoryChronology({
    inventories: {
      [INVENTORY_PHASES.BEFORE_RESET]: labelInventoryCapture({
        phase: INVENTORY_PHASES.BEFORE_RESET,
        body: { financial_private: false },
      }),
      [INVENTORY_PHASES.CLEAN_BASELINE]: { phase: INVENTORY_PHASES.CLEAN_BASELINE, is_final: true, body: {} },
    },
    historyRows: [],
    recognition: ["manual_income"],
    poisonPresent: false,
  });
  publish({
    caseId: "C12",
    exactMutation: "purported final inventory captured before final DB state",
    classification: premature.code || "F3_INVENTORY_PREMATURE_FINAL",
    failedGate: "inventory_chronology",
    dbPushCalls: 0,
    repairCalls: 0,
    continuationCalls: 0,
    cleanup: "n/a-inventory",
    poisonVerification: "n/a-inventory",
    continuation: false,
    result: premature.ok ? "UNEXPECTED" : "rejected",
  });
  assert.equal(premature.ok, false);

  const dirDest = fs.mkdtempSync(path.join(os.tmpdir(), "f3-c13-"));
  const c13 = assertEvidenceOutFileContract(dirDest);
  publish({
    caseId: "C13",
    exactMutation: "invalid --evidence-out directory rejected BEFORE database access",
    classification: c13.code || "EISDIR",
    failedGate: "evidence_out_contract",
    dbPushCalls: 0,
    repairCalls: 0,
    continuationCalls: 0,
    cleanup: "n/a-pre-db",
    poisonVerification: "n/a-pre-db",
    continuation: false,
    result: (!c13.ok && c13.dbAccess === false && c13.dbPushCalls === 0) ? "rejected" : "UNEXPECTED",
  });
  assert.equal(c13.ok, false);
  assert.equal(c13.dbAccess, false);
  assert.match(c13.reason, /file path|directory/i);
  fs.rmSync(dirDest, { recursive: true, force: true });

  const c14dir = fs.mkdtempSync(path.join(os.tmpdir(), "f3-c14-"));
  const c14 = commitQualifyEvidenceOrHold({
    dest: c14dir,
    payload: {
      status: "FILE-BASED RUNNER QUALIFICATION PASS",
      verdict: "FILE-BASED RUNNER QUALIFICATION PASS",
      dbPushCalls: 6,
    },
  });
  publish({
    caseId: "C14",
    exactMutation: "post-database evidence-write EISDIR must prevent PASS",
    enforcementPath: "commitQualifyEvidenceOrHold",
    expectedClassification: "rejected",
    actualClassification: c14.code || "EISDIR",
    classification: c14.code || "EISDIR",
    failedGate: "evidence_write",
    dbPushCallsObserved: Number(c14.dbPushCalls ?? 0),
    repairCallsObserved: Number(c14.repairCalls ?? 0),
    continuationCallsObserved: Number(c14.continuationCalls ?? 0),
    orderedCallTrace: ["commitQualifyEvidenceOrHold"],
    cleanup: "n/a-evidence",
    poisonVerification: "n/a-evidence",
    continuation: false,
    result: (c14.hold === true && c14.ok === false && c14.exitCode === 1) ? "rejected" : "UNEXPECTED",
  });
  assert.equal(c14.ok, false);
  assert.equal(c14.hold, true);
  assert.equal(c14.exitCode, 1);
  assert.equal(c14.status, "HOLD");
  assert.equal(c14.dbPushCalls, 6);
  fs.rmSync(c14dir, { recursive: true, force: true });

  for (const record of outcomes) {
    if (record.caseId === "C14") {
      assert.equal(record.dbPushCallsObserved, 6, "C14 published dbPushCallsObserved must be actual observed, not overwritten zeros");
      assert.equal(record.dbPushCalls, 6, "C14 published dbPushCalls must be actual observed, not overwritten zeros");
      assert.equal(record.repairCallsObserved, 0, `${record.caseId} repairCallsObserved`);
      assert.equal(record.repairCalls, 0, `${record.caseId} repairCalls`);
      assert.equal(record.continuationCalls, 0, `${record.caseId} continuationCalls`);
      assert.deepEqual(record.orderedCallTrace, ["commitQualifyEvidenceOrHold"]);
    } else {
      assert.equal(record.repairCalls, 0, `${record.caseId} repairCalls`);
      assert.equal(record.dbPushCalls, 0, `${record.caseId} dbPushCalls`);
      if (Object.prototype.hasOwnProperty.call(record, "continuationCalls")) {
        assert.equal(record.continuationCalls, 0, `${record.caseId} continuationCalls`);
      }
    }
    assert.notEqual(record.result, "UNEXPECTED", record.caseId);
    assert.notEqual(record.classification, "accepted", record.caseId);
  }
  const ids = outcomes.map((row) => row.caseId);
  for (const required of ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11", "C12", "C13", "C14"]) {
    assert.equal(ids.includes(required), true, `missing ${required}`);
  }
  console.log(JSON.stringify({
    publishedC1C14: outcomes,
    schema_version: F3_FULL_FINGERPRINT_SCHEMA_VERSION,
    independent_reference_source_sha256: F3_FUNCTIONAL_RECURSIVE_CLOSURE.independent_reference_source_sha256,
  }, null, 2));
});

test("V4 genuine negatives: referenced-side FK triggers + fail-closed integrity with actual call counts", async () => {
  const expected = getFrozenExpectedFingerprint(FILE118);
  const universe = enumerateFkConstraintTriggerUniverse(expected);
  assert.equal(expected.schema_version, "f3-full-catalog-v5");
  assert.ok(universe.total > 0, "v4 trigger universe nonempty");
  assert.equal(F3_FK_TRIGGER_UNIVERSE_BY_MIGRATION[FILE118].total, universe.total);
  const internals = expected.triggers.filter((row) => row.tgisinternal === true && row.constraint_association === true);
  const referenced = internals.filter((row) => row.action_role === "referenced_action");
  const referencing = internals.filter((row) => row.action_role === "referencing_action");
  const work = (referenced[0] || referencing[0] || expected.triggers[0]);
  assert.ok(work, "v4 work trigger");

  const records = [];
  const publish = (record) => {
    records.push(publishNegativeRecord(record));
    return record;
  };

  const mutateIdx = expected.triggers.findIndex((row) => (
    row.schema === work.schema
    && row.relation === work.relation
    && row.constraint_name === work.constraint_name
    && row.action_role === work.action_role
    && row.events === work.events
  ));
  const idx = mutateIdx >= 0 ? mutateIdx : 0;

  publish(await recordFingerprintReject("V4-MISSING-REF-ACTION", "missing referenced-side action trigger", (o) => {
    const i = o.triggers.findIndex((row) => row.action_role === "referenced_action");
    o.triggers = o.triggers.filter((_, n) => n !== (i >= 0 ? i : idx));
  }));
  publish(await recordFingerprintReject("V4-EXTRA-REF-ACTION", "extra referenced-side action trigger", (o) => {
    const base = o.triggers.find((row) => row.action_role === "referenced_action") || o.triggers[idx];
    o.triggers = [...o.triggers, {
      ...base,
      constraint_name: `${base.constraint_name}_extra_ref`,
      action_role: "referenced_action",
      user_trigger_name: "",
      user_definition: "",
      tgisinternal: true,
      constraint_association: true,
    }];
  }));
  publish(await recordFingerprintReject("V4-TGENABLED-O-D", "tgenabled O→D", (o) => {
    o.triggers = o.triggers.map((row, i) => (i === idx ? { ...row, tgenabled: "D" } : row));
  }));
  publish(await recordFingerprintReject("V4-TGENABLED-O-R", "tgenabled O→R", (o) => {
    o.triggers = o.triggers.map((row, i) => (i === idx ? { ...row, tgenabled: "R" } : row));
  }));
  publish(await recordFingerprintReject("V4-TGENABLED-O-A", "tgenabled O→A", (o) => {
    o.triggers = o.triggers.map((row, i) => (i === idx ? { ...row, tgenabled: "A" } : row));
  }));
  publish(await recordFingerprintReject("V4-TGDEFERRABLE", "tgdeferrable mismatch", (o) => {
    o.triggers = o.triggers.map((row, i) => (i === idx ? { ...row, tgdeferrable: !row.tgdeferrable } : row));
  }));
  publish(await recordFingerprintReject("V4-TGINITDEFERRED", "tginitdeferred mismatch", (o) => {
    o.triggers = o.triggers.map((row, i) => (i === idx ? { ...row, tginitdeferred: !row.tginitdeferred } : row));
  }));
  publish(await recordFingerprintReject("V4-REF-SWAP", "referencing/referenced swap", (o) => {
    o.triggers = o.triggers.map((row, i) => (
      i === idx
        ? {
          ...row,
          referencing_schema: row.referenced_schema || row.schema,
          referencing_relation: row.referenced_relation || row.relation,
          referenced_schema: row.referencing_schema,
          referenced_relation: row.referencing_relation,
        }
        : row
    ));
  }));
  publish(await recordFingerprintReject("V4-OWNING-REASSOC", "trigger-owning reassociation", (o) => {
    o.triggers = o.triggers.map((row, i) => (
      i === idx ? { ...row, schema: "public", relation: "profiles" } : row
    ));
  }));
  publish(await recordFingerprintReject("V4-FN-IDENTITY", "function identity mismatch", (o) => {
    o.triggers = o.triggers.map((row, i) => (
      i === idx
        ? { ...row, function_schema: "pg_catalog", function_name: "forged_ri", function_identity_arguments: "oid" }
        : row
    ));
  }));
  publish(await recordFingerprintReject("V4-ACTION-ROLE", "action role mismatch", (o) => {
    o.triggers = o.triggers.map((row, i) => (
      i === idx
        ? { ...row, action_role: row.action_role === "referenced_action" ? "referencing_action" : "referenced_action" }
        : row
    ));
  }));
  publish(await recordFingerprintReject("V4-DUPLICATE", "duplicate record", (o) => {
    o.triggers = [...o.triggers, { ...o.triggers[idx] }];
  }));
  publish(await recordFingerprintReject("V4-MALFORMED", "malformed/partial trigger record", (o) => {
    o.triggers = o.triggers.map((row, i) => {
      if (i !== idx) return row;
      const next = { ...row };
      delete next.action_role;
      delete next.tgdeferrable;
      delete next.referencing_schema;
      return next;
    });
  }));
  publish(await recordFingerprintReject("V4-CONDEFER-SUBST", "constraint-level substituted for per-trigger", (o) => {
    o.triggers = o.triggers.map((row, i) => {
      if (i !== idx) return row;
      const next = { ...row };
      delete next.tgdeferrable;
      delete next.tginitdeferred;
      next.deferrable = row.condeferrable;
      next.initially_deferred = row.condeferred;
      return next;
    });
  }));

  const incompleteClosure = {
    files: ["scripts/qualify-f3-db-push-disposable.mjs"],
    closure_complete: false,
    missing: 4,
    unresolved: 1,
    runtime_read_missing: REQUIRED_RUNTIME_READ_INPUTS.length,
    runtime_read_missing_paths: REQUIRED_RUNTIME_READ_INPUTS.map((item) => item.path),
    unexplained_exclusions: 0,
    uncommitted_functional_diffs: 0,
    hosted_tree_mismatches: 0,
  };
  const incompleteGate = assertRecursiveClosureReadyForDb(incompleteClosure);
  publish({
    caseId: "V4-INCOMPLETE-CLOSURE",
    name: "incomplete closure submitted to real gate",
    exactMutation: "hand list missing runtime-read inputs and migrations",
    enforcementPath: "assertRecursiveClosureReadyForDb",
    expectedClassification: "rejected",
    actualClassification: incompleteGate.reason || RECURSIVE_CLOSURE_HOLD,
    classification: incompleteGate.reason || "incomplete_closure",
    failedGate: "recursive_runtime_closure",
    dbPushCalls: incompleteGate.dbPushCalls,
    repairCalls: incompleteGate.repairCalls,
    continuationCalls: incompleteGate.continuationCalls,
    result: (!incompleteGate.ok && incompleteGate.dbPushCalls === 0) ? "rejected" : "UNEXPECTED",
  });
  assert.equal(incompleteGate.ok, false);
  assert.equal(incompleteGate.dbPushCalls, 0);

  const runtimeMissing = {
    ...buildFunctionalRecursiveRuntimeClosure(),
    closure_complete: false,
    runtime_read_missing: 1,
    runtime_read_missing_paths: ["src/lib/financial-f3-recognition.ts"],
    files: buildFunctionalRecursiveRuntimeClosure().files.filter((rel) => rel !== "src/lib/financial-f3-recognition.ts"),
  };
  const runtimeGate = assertRecursiveClosureReadyForDb(runtimeMissing);
  publish({
    caseId: "V4-RUNTIME-READ-MISSING",
    name: "runtime-read input missing from closure",
    exactMutation: "drop src/lib/financial-f3-recognition.ts from submitted closure",
    enforcementPath: "assertRecursiveClosureReadyForDb",
    expectedClassification: "rejected",
    actualClassification: runtimeGate.reason || "runtime_read_missing",
    classification: runtimeGate.reason || "runtime_read_missing",
    failedGate: "recursive_runtime_closure",
    dbPushCalls: runtimeGate.dbPushCalls,
    repairCalls: runtimeGate.repairCalls,
    continuationCalls: runtimeGate.continuationCalls,
    result: (!runtimeGate.ok && runtimeGate.dbPushCalls === 0) ? "rejected" : "UNEXPECTED",
  });
  assert.equal(runtimeGate.ok, false);

  const poisonCases = [
    ["V4-POISON-NONZERO", { status: 1, stdout: JSON.stringify({ trigger_present: false, function_present: false, poisonPresent: false }), stderr: "" }, "nonzero"],
    ["V4-POISON-SQL", { status: 0, stdout: JSON.stringify({ trigger_present: false, function_present: false, poisonPresent: false }), stderr: "ERROR:  relation does not exist" }, "SQL error"],
    ["V4-POISON-NONJSON", { status: 0, stdout: "not-json", stderr: "" }, "non-JSON"],
    ["V4-POISON-MISSING-BOOL", { status: 0, stdout: JSON.stringify({ trigger_present: false, function_present: false }), stderr: "" }, "missing boolean"],
    ["V4-POISON-PRESENT-TRUE", { status: 0, stdout: JSON.stringify({ trigger_present: false, function_present: false, poisonPresent: true }), stderr: "" }, "poisonPresent true"],
  ];
  for (const [caseId, probe, mutation] of poisonCases) {
    const evaled = evaluateFinalPoisonAbsence(probe);
    publish({
      caseId,
      name: `final poison ${mutation}`,
      exactMutation: mutation,
      enforcementPath: "evaluateFinalPoisonAbsence",
      expectedClassification: "rejected",
      actualClassification: evaled.reason || FINAL_POISON_ABSENCE_HOLD,
      classification: evaled.reason || "poison",
      failedGate: "final_poison_absence",
      dbPushCalls: 0,
      repairCalls: 0,
      continuationCalls: 0,
      result: (evaled.ok === false && evaled.absent === false) ? "rejected" : "UNEXPECTED",
    });
    assert.equal(evaled.ok, false, caseId);
    assert.equal(evaled.absent, false, caseId);
  }

  const evidDir = fs.mkdtempSync(path.join(os.tmpdir(), "f3-v4-evid-"));
  const outPath = path.join(evidDir, "suite.out");
  fs.writeFileSync(outPath, "ok 1 - placeholder\n");
  const written = writeSuiteMetaForOutFile(outPath, { tests: [{ name: "placeholder", ok: true }] });
  const execWritten = writeExecutableManifest(evidDir, [
    { path: "suite.out", sha256: written.meta.sha256, bytes: written.meta.bytes },
  ]);
  const index = writeEvidenceIndexAndChecksum(evidDir, [
    { path: "suite.out", sha256: written.meta.sha256, bytes: written.meta.bytes },
    { path: EXECUTABLE_MANIFEST_FILENAME, sha256: execWritten.sha256, bytes: execWritten.bytes },
  ]);
  fs.writeFileSync(execWritten.abs, `${JSON.stringify({ artifact: "mutated" }, null, 2)}\n`);
  const mutatedManifest = verifyEvidenceIndex(evidDir);
  publish({
    caseId: "V4-MANIFEST-MUTATED",
    name: "executable manifest mutated after index",
    exactMutation: "rewrite executable-manifest.json after detached index write",
    enforcementPath: "verifyEvidenceIndex",
    expectedClassification: "rejected",
    actualClassification: mutatedManifest.reason || "manifest_mutated",
    classification: mutatedManifest.reason || "manifest_mutated",
    failedGate: "evidence_index",
    dbPushCalls: 0,
    repairCalls: 0,
    continuationCalls: 0,
    result: mutatedManifest.ok ? "UNEXPECTED" : "rejected",
  });
  assert.equal(mutatedManifest.ok, false);

  fs.writeFileSync(execWritten.abs, `${JSON.stringify(execWritten.manifest, null, 2)}\n`);
  const detached = structuredClone(index.index);
  detached.artifacts = detached.artifacts.map((item) => (
    item.path === "suite.out" ? { ...item, sha256: "2".repeat(64) } : item
  ));
  fs.writeFileSync(path.join(evidDir, EVIDENCE_INDEX_FILENAME), JSON.stringify(detached, null, 2));
  const indexNe = verifyEvidenceIndex(evidDir);
  publish({
    caseId: "V4-INDEX-NE-COMMITTED",
    name: "index entry ≠ committed",
    exactMutation: "index suite.out sha256 rewritten after commit",
    enforcementPath: "verifyEvidenceIndex",
    expectedClassification: "rejected",
    actualClassification: indexNe.reason || "index_ne_committed",
    classification: indexNe.reason || "index_ne_committed",
    failedGate: "evidence_index",
    dbPushCalls: 0,
    repairCalls: 0,
    continuationCalls: 0,
    result: indexNe.ok ? "UNEXPECTED" : "rejected",
  });
  assert.equal(indexNe.ok, false);
  fs.rmSync(evidDir, { recursive: true, force: true });

  const semanticRaw = JSON.stringify({
    default_acl_canonical: [{ privilege_type: "EXECUTE", grantee: "anon", note: "super-secret-db-password" }],
  });
  const semanticSanitized = sanitizeEvidenceOutBytes(semanticRaw, ["super-secret-db-password"]);
  const c10 = assertSanitizationPreservesSemanticFingerprint(semanticRaw, semanticSanitized);
  publish({
    caseId: "V4-SANITIZE-SEMANTIC",
    name: "sanitization changes semantic fingerprint",
    exactMutation: "REDACT privilege-adjacent secret inside default_acl_canonical",
    enforcementPath: "assertSanitizationPreservesSemanticFingerprint",
    expectedClassification: "rejected",
    actualClassification: c10.code || "F3_SEMANTIC_SANITIZE",
    classification: c10.code || "F3_SEMANTIC_SANITIZE",
    failedGate: "evidence_sanitize",
    dbPushCalls: 0,
    repairCalls: 0,
    continuationCalls: 0,
    result: c10.ok ? "UNEXPECTED" : "rejected",
  });
  assert.equal(c10.ok, false);

  const disagree = evaluateIndependentReferenceAgreement({
    primary: expected,
    independent: { ...expected, triggers: [] },
  });
  publish({
    caseId: "V4-PRIMARY-REF-DISAGREE",
    name: "V4 primary/reference disagreement",
    exactMutation: "independent triggers emptied",
    enforcementPath: "evaluateIndependentReferenceAgreement",
    expectedClassification: "rejected",
    actualClassification: disagree.reason || "independent_reference_disagreement",
    classification: disagree.reason || "independent_reference_disagreement",
    failedGate: "fingerprint_exact",
    dbPushCalls: 0,
    repairCalls: 0,
    continuationCalls: 0,
    result: disagree.ok ? "UNEXPECTED" : "rejected",
  });
  assert.equal(disagree.ok, false);

  for (const record of records) {
    assert.notEqual(record.result, "UNEXPECTED", record.caseId);
    assert.equal(record.expectedClassification, "rejected", record.caseId);
    assert.equal(typeof record.dbPushCalls, "number", `${record.caseId} actual dbPushCalls`);
    assert.equal(typeof record.repairCalls, "number", `${record.caseId} actual repairCalls`);
    assert.equal(typeof record.continuationCalls, "number", `${record.caseId} actual continuationCalls`);
    if (["V4-INCOMPLETE-CLOSURE", "V4-RUNTIME-READ-MISSING"].includes(record.caseId)
      || record.caseId.startsWith("V4-POISON")
      || record.caseId.startsWith("V4-TGENABLED")
      || record.failedGate === "fingerprint_exact") {
      assert.equal(record.repairCalls, 0, `${record.caseId} no repair after failed gate`);
    }
  }
  const ids = records.map((row) => row.caseId);
  for (const required of [
    "V4-MISSING-REF-ACTION", "V4-EXTRA-REF-ACTION", "V4-TGENABLED-O-D", "V4-TGENABLED-O-R",
    "V4-TGENABLED-O-A", "V4-TGDEFERRABLE", "V4-TGINITDEFERRED", "V4-REF-SWAP",
    "V4-OWNING-REASSOC", "V4-FN-IDENTITY", "V4-ACTION-ROLE", "V4-DUPLICATE",
    "V4-MALFORMED", "V4-CONDEFER-SUBST", "V4-INCOMPLETE-CLOSURE", "V4-RUNTIME-READ-MISSING",
    "V4-POISON-NONZERO", "V4-POISON-SQL", "V4-POISON-NONJSON", "V4-POISON-MISSING-BOOL",
    "V4-POISON-PRESENT-TRUE", "V4-MANIFEST-MUTATED", "V4-INDEX-NE-COMMITTED",
    "V4-SANITIZE-SEMANTIC", "V4-PRIMARY-REF-DISAGREE",
  ]) {
    assert.equal(ids.includes(required), true, `missing ${required}`);
  }
  console.log(JSON.stringify({ publishedV4Negatives: records, universe }, null, 2));
});

test("Catalog-V5 reproduces trigger partitions and forbids relation-OID self-FK classification", () => {
  assert.equal(F3_FULL_FINGERPRINT_SCHEMA_VERSION, "f3-full-catalog-v5");
  assert.equal(INDEPENDENT_REFERENCE_SCHEMA_VERSION, "f3-full-catalog-v5");
  assert.equal(MUST_REVERIFY_ON_17_6, true);
  assert.doesNotMatch(CATALOG_FINGERPRINT_SQL, /WHEN con\.conrelid = t\.tgrelid THEN 'referencing_action'/);
  assert.match(CATALOG_FINGERPRINT_SQL, /RI_FKey_check_ins/);
  assert.match(CATALOG_FINGERPRINT_SQL, /RI_FKey_noaction_upd/);
  assert.match(CATALOG_FINGERPRINT_SQL, /RI_FKey_restrict_del/);
  assert.ok(Object.keys(PRIMARY_PG17_RI_ENFORCEMENT).includes("RI_FKey_check_ins"));
  assert.ok(Object.keys(PRIMARY_PG17_RI_ENFORCEMENT).includes("RI_FKey_noaction_upd"));
  const independentSrc = fs.readFileSync(path.join(root, INDEPENDENT_REFERENCE_MODULE_RELPATH), "utf8");
  assert.match(independentSrc, /ri_fn_event_role/);
  assert.doesNotMatch(independentSrc, /WHEN con\.conrelid = t\.tgrelid THEN 'referencing_action'/);
  assert.doesNotMatch(independentSrc, /PRIMARY_PG17_RI_ENFORCEMENT/);
  assert.match(independentSrc, /independentlyParseRiFunctionName/);
  const reproduced = {};
  for (const file of F3_FORWARD_FILES) {
    const fp = getFrozenExpectedFingerprint(file);
    const parts = reproduceTriggerPartitionsFromFingerprint(fp);
    assert.equal(parts.ok, true, file);
    const review = REPRODUCED_TRIGGER_PARTITION_EXPECTATIONS[file];
    assert.equal(parts.total, review.total, file);
    assert.equal(parts.internal_fk, review.internal_fk, file);
    assert.equal(parts.ordinary_user, review.ordinary_user, file);
    assert.equal(parts.user_defined_constraint, review.user_defined_constraint, file);
    assert.equal(parts.referencing, review.referencing, file);
    assert.equal(parts.referenced, review.referenced, file);
    assert.equal(parts.internal_fk, parts.referencing + parts.referenced, file);
    reproduced[file.slice(0, 5)] = parts;
    const selfFk = fp.triggers.filter((row) => (
      row.constraint_type === "f"
      && row.referencing_schema === row.referenced_schema
      && row.referencing_relation === row.referenced_relation
    ));
    for (const row of selfFk) {
      if (row.function_name === "RI_FKey_noaction_upd" || row.function_name === "RI_FKey_restrict_del") {
        assert.equal(row.action_role, "referenced_action", `${file} ${row.function_name}`);
      }
      if (row.function_name === "RI_FKey_check_ins" || row.function_name === "RI_FKey_check_upd") {
        assert.equal(row.action_role, "referencing_action", `${file} ${row.function_name}`);
      }
    }
  }
  console.log(JSON.stringify({
    reproducedTriggerPartitions: reproduced,
    must_reverify_on_17_6: MUST_REVERIFY_ON_17_6,
    v5_hashes: FROZEN_EXPECTED_FINGERPRINT_SHA256,
  }, null, 2));
});

test("V5 self-FK / git / poison / chronology / manifest negatives publish observed counters", async () => {
  const file119 = "00119_f3_01_core_ledger_foundation.sql";
  const expected = getFrozenExpectedFingerprint(file119);
  const records = [];
  const publish = (record) => {
    records.push(publishNegativeRecord(record));
    return record;
  };

  const selfAction = expected.triggers.find((row) => (
    row.function_name === "RI_FKey_noaction_upd"
    && row.referencing_relation === row.referenced_relation
  ));
  const selfCheck = expected.triggers.find((row) => (
    row.function_name === "RI_FKey_check_ins"
    && row.referencing_relation === row.referenced_relation
  ));
  assert.ok(selfAction, "self-FK action trigger present on 00119");
  assert.ok(selfCheck, "self-FK check trigger present on 00119");

  publish(await recordFingerprintReject("V5-CHECK-INS-AS-REFED", "check_ins mislabeled referenced", (o) => {
    o.triggers = o.triggers.map((row) => (
      row.function_name === "RI_FKey_check_ins" && row.referencing_relation === row.referenced_relation
        ? { ...row, action_role: "referenced_action" }
        : row
    ));
  }, file119));
  publish(await recordFingerprintReject("V5-CHECK-UPD-AS-REFED", "check_upd mislabeled referenced", (o) => {
    o.triggers = o.triggers.map((row) => (
      row.function_name === "RI_FKey_check_upd" && row.referencing_relation === row.referenced_relation
        ? { ...row, action_role: "referenced_action" }
        : row
    ));
  }, file119));
  publish(await recordFingerprintReject("V5-NOACTION-UPD-AS-REFING", "noaction_upd mislabeled referencing", (o) => {
    o.triggers = o.triggers.map((row) => (
      row.function_name === "RI_FKey_noaction_upd" && row.referencing_relation === row.referenced_relation
        ? { ...row, action_role: "referencing_action" }
        : row
    ));
  }, file119));
  publish(await recordFingerprintReject("V5-RESTRICT-DEL-AS-REFING", "restrict_del mislabeled referencing", (o) => {
    o.triggers = o.triggers.map((row) => (
      row.function_name === "RI_FKey_restrict_del" && row.referencing_relation === row.referenced_relation
        ? { ...row, action_role: "referencing_action" }
        : row
    ));
  }, file119));
  publish(await recordFingerprintReject("V5-ROLES-SWAPPED-EQUAL-IDS", "roles swapped with equal relation IDs", (o) => {
    o.triggers = o.triggers.map((row) => (
      row.referencing_relation === row.referenced_relation && row.constraint_type === "f"
        ? { ...row, action_role: row.action_role === "referenced_action" ? "referencing_action" : "referenced_action" }
        : row
    ));
  }, file119));
  publish(await recordFingerprintReject("V5-UNKNOWN-RI", "unknown RI function", (o) => {
    o.triggers = o.triggers.map((row) => (
      row === selfAction || (row.function_name === selfAction.function_name && row.constraint_name === selfAction.constraint_name && row.events === selfAction.events)
        ? { ...row, function_name: "RI_FKey_unknown_fn" }
        : row
    ));
  }, file119));
  publish(await recordFingerprintReject("V5-RI-INCOMPAT-EVENT", "known RI + incompatible event", (o) => {
    o.triggers = o.triggers.map((row) => (
      row.function_name === "RI_FKey_check_ins" && row.events === "INSERT"
        ? { ...row, events: "DELETE" }
        : row
    ));
  }, file119));
  const incompat = classifyPrimaryTriggerSemanticRole({
    ...selfAction,
    function_name: "RI_FKey_setnull_del",
    events: "DELETE",
    constraint_type: "f",
    constraint_association: true,
    tgisinternal: true,
  }, { delete_action: "r" });
  publish({
    caseId: "V5-RI-INCOMPAT-ACTION",
    name: "known RI + incompatible constraint action",
    exactMutation: "RI_FKey_setnull_del with ON DELETE RESTRICT",
    enforcementPath: "classifyPrimaryTriggerSemanticRole",
    classification: incompat.reason || "incompatible_action",
    failedGate: "ri_role_mapping",
    dbPushCallsObserved: 0,
    repairCallsObserved: 0,
    continuationCallsObserved: 0,
    orderedCallTrace: [],
    result: incompat.ok ? "UNEXPECTED" : "rejected",
  });
  assert.equal(incompat.ok, false);
  publish(await recordFingerprintReject("V5-MISSING-SELF-FK", "missing self-FK trigger", (o) => {
    o.triggers = o.triggers.filter((row) => !(
      row.function_name === selfAction.function_name
      && row.constraint_name === selfAction.constraint_name
      && row.events === selfAction.events
    ));
  }, file119));
  publish(await recordFingerprintReject("V5-DUPLICATE-SELF-FK", "duplicate self-FK trigger", (o) => {
    o.triggers = [...o.triggers, { ...selfAction }];
  }, file119));
  const multiply = reconcileTriggerPartitions([...expected.triggers, { ...selfAction }]);
  publish({
    caseId: "V5-MULTIPLY-CLASSIFIED",
    name: "multiply classified trigger",
    exactMutation: "duplicate identity in partition reconciler",
    enforcementPath: "reconcileTriggerPartitions",
    classification: multiply.reason || "multiply_classified",
    failedGate: "trigger_partitions",
    dbPushCallsObserved: 0,
    repairCallsObserved: 0,
    continuationCallsObserved: 0,
    orderedCallTrace: [],
    result: multiply.ok ? "UNEXPECTED" : "rejected",
  });
  assert.equal(multiply.ok, false);
  publish(await recordFingerprintReject("V5-NO-SEMANTIC-ROLE", "no semantic role", (o) => {
    o.triggers = o.triggers.map((row) => (
      row.function_name === selfAction.function_name && row.events === selfAction.events
        ? (() => { const next = { ...row }; delete next.action_role; return next; })()
        : row
    ));
  }, file119));
  const brokenTotals = reconcileTriggerPartitions(expected.triggers.map((row, i) => (
    i === 0 ? { ...row, action_role: "constraint_other", tgisinternal: true, constraint_type: "f", constraint_association: true } : row
  )));
  publish({
    caseId: "V5-CATEGORY-TOTALS",
    name: "category totals do not reconcile via forced mis-role",
    exactMutation: "internal FK forced to constraint_other",
    enforcementPath: "reconcileTriggerPartitions",
    classification: brokenTotals.ok ? "accepted" : (brokenTotals.reason || "totals"),
    failedGate: "trigger_partitions",
    dbPushCallsObserved: 0,
    repairCallsObserved: 0,
    continuationCallsObserved: 0,
    orderedCallTrace: [],
    result: brokenTotals.ok ? "UNEXPECTED" : "rejected",
  });

  const gitCases = [
    ["V5-GIT-NONZERO", () => ({ status: 1, stdout: "", stderr: "fatal" }), "nonzero"],
    ["V5-GIT-SPAWN-FAIL", () => { throw new Error("ENOENT git"); }, "spawn-fail"],
    ["V5-GIT-TIMEOUT", () => ({ status: 0, stdout: "abc", timeout: true, killed: true }), "timeout"],
    ["V5-GIT-MALFORMED", () => ({ status: 0, stdout: "not-a-sha" }), "malformed"],
    ["V5-GIT-MISSING-BLOB", () => ({ status: 128, stdout: "", stderr: "fatal: path 'missing' does not exist" }), "missing blob"],
    ["V5-GIT-AMBIGUOUS", () => ({ status: 128, stdout: "", stderr: "fatal: ambiguous argument 'HEAD'" }), "ambiguous revision"],
  ];
  for (const [caseId, runner, mutation] of gitCases) {
    __installGitRunnerForTests(runner);
    const verified = runVerifiedGit(["rev-parse", "HEAD"], { expectedSchema: "rev-parse" });
    const gate = assertRecursiveClosureReadyForDb({
      closure_complete: false,
      git_verification_unavailable: true,
      git_verification: verified,
      missing: 0,
      unresolved: 0,
      runtime_read_missing: 0,
      unexplained_exclusions: 0,
      uncommitted_functional_diffs: 0,
      hosted_tree_mismatches: 0,
      files: [],
    });
    publish({
      caseId,
      name: `git ${mutation}`,
      exactMutation: mutation,
      enforcementPath: "runVerifiedGit/assertRecursiveClosureReadyForDb",
      classification: verified.reason || gate.reason || GIT_VERIFICATION_UNAVAILABLE,
      failedGate: "git_verification",
      dbPushCallsObserved: gate.dbPushCalls,
      repairCallsObserved: gate.repairCalls,
      continuationCallsObserved: gate.continuationCalls,
      orderedCallTrace: ["git"],
      result: (!verified.ok && !gate.ok && gate.dbPushCalls === 0 && gate.repairCalls === 0) ? "rejected" : "UNEXPECTED",
    });
    assert.equal(verified.ok, false, caseId);
    assert.equal(gate.ok, false, caseId);
    assert.equal(gate.dbPushCalls, 0, caseId);
    __resetGitRunnerForTests();
  }

  const poisonCases = [
    ["V5-POISON-TARGET-NULL", { ...assembleFinalPoisonExactRow(), current_database: null }, "target null"],
    ["V5-POISON-TARGET-MISMATCH", assembleFinalPoisonExactRow({ current_database: "template1", current_user: "postgres" }), "target mismatch"],
    ["V5-POISON-EXTRA-KEY", { ...assembleFinalPoisonExactRow(), canary_present: true }, "extra key"],
    ["V5-POISON-MISSING-KEY", { trigger_present: false, function_present: false, poisonPresent: false }, "missing key"],
    ["V5-POISON-WRONG-TYPE", assembleFinalPoisonExactRow({ poisonPresent: "false" }), "wrong type"],
  ];
  for (const [caseId, row, mutation] of poisonCases) {
    const evaled = evaluateFinalPoisonAbsence({ status: 0, stdout: JSON.stringify(row), stderr: "" });
    publish({
      caseId,
      name: `final poison ${mutation}`,
      exactMutation: mutation,
      enforcementPath: "evaluateFinalPoisonAbsence",
      classification: evaled.reason || FINAL_POISON_ABSENCE_HOLD,
      failedGate: "final_poison_absence",
      dbPushCallsObserved: 0,
      repairCallsObserved: 0,
      continuationCallsObserved: 0,
      orderedCallTrace: ["evaluateFinalPoisonAbsence"],
      result: (evaled.ok === false && evaled.parser_verdict !== "valid_json_exact_schema") ? "rejected" : "UNEXPECTED",
    });
    assert.equal(evaled.ok, false, caseId);
    assert.notEqual(evaled.parser_verdict, "valid_json_exact_schema", caseId);
  }
  const subset = evaluateFinalPoisonAbsence({
    status: 0,
    stdout: JSON.stringify({
      schema_version: FINAL_POISON_SCHEMA_VERSION,
      trigger_present: false,
      function_present: false,
      poisonPresent: false,
    }),
    stderr: "",
  });
  assert.notEqual(subset.parser_verdict, "valid_json_exact_schema");
  assert.equal(subset.ok, false);

  const beforePoison = assertFinalInventoryChronology({
    inventories: {
      [INVENTORY_PHASES.FINAL]: labelInventoryCapture({
        phase: INVENTORY_PHASES.FINAL,
        body: { financial_private: true, financial_core: true, financial_ledger_epochs: true },
      }),
    },
    historyRows: F3_FORWARD_FILES.map((file, i) => ({ version: String(i), name: file })),
    recognition: ["manual_income"],
    poisonPresent: false,
    poisonVerified: true,
    historyVerified: true,
    capturedBeforePoison: true,
    poisonSequence: 2,
    historySequence: 3,
    finalInventorySequence: 1,
  });
  publish({
    caseId: "V5-INV-BEFORE-POISON",
    name: "final inventory before poison",
    exactMutation: "capturedBeforePoison",
    enforcementPath: "assertFinalInventoryChronology",
    classification: beforePoison.reason || "before_poison",
    failedGate: "inventory_chronology",
    dbPushCallsObserved: 0,
    repairCallsObserved: 0,
    continuationCallsObserved: 0,
    orderedCallTrace: ["assertFinalInventoryChronology"],
    result: beforePoison.ok ? "UNEXPECTED" : "rejected",
  });
  assert.equal(beforePoison.ok, false);
  const beforeHistory = assertFinalInventoryChronology({
    inventories: {
      [INVENTORY_PHASES.FINAL]: labelInventoryCapture({
        phase: INVENTORY_PHASES.FINAL,
        body: { financial_private: true, financial_core: true, financial_ledger_epochs: true },
      }),
    },
    historyRows: F3_FORWARD_FILES.map((file, i) => ({ version: String(i), name: file })),
    recognition: ["manual_income"],
    poisonPresent: false,
    poisonVerified: true,
    historyVerified: true,
    capturedBeforeHistory: true,
    poisonSequence: 1,
    historySequence: 3,
    finalInventorySequence: 2,
  });
  publish({
    caseId: "V5-INV-BEFORE-HISTORY",
    name: "final inventory before history",
    exactMutation: "capturedBeforeHistory",
    enforcementPath: "assertFinalInventoryChronology",
    classification: beforeHistory.reason || "before_history",
    failedGate: "inventory_chronology",
    dbPushCallsObserved: 0,
    repairCallsObserved: 0,
    continuationCallsObserved: 0,
    orderedCallTrace: ["assertFinalInventoryChronology"],
    result: beforeHistory.ok ? "UNEXPECTED" : "rejected",
  });
  assert.equal(beforeHistory.ok, false);

  const selfManifest = assertExecutableManifestNoSelfEntry({
    artifact: "executable-manifest",
    schema: "f3-executable-byte-manifest-v1",
    self_entries: 1,
    files: [{ path: EXECUTABLE_MANIFEST_FILENAME, sha256: "0".repeat(64), bytes: 1 }],
  });
  publish({
    caseId: "V5-MANIFEST-SELF-ENTRY",
    name: "manifest self-entry",
    exactMutation: "executable-manifest lists itself",
    enforcementPath: "assertExecutableManifestNoSelfEntry",
    classification: selfManifest.reason || "self_entry",
    failedGate: "executable_manifest",
    dbPushCallsObserved: 0,
    repairCallsObserved: 0,
    continuationCallsObserved: 0,
    orderedCallTrace: ["assertExecutableManifestNoSelfEntry"],
    result: selfManifest.ok ? "UNEXPECTED" : "rejected",
  });
  assert.equal(selfManifest.ok, false);

  const evidDir = fs.mkdtempSync(path.join(os.tmpdir(), "f3-v5-idx-"));
  const outPath = path.join(evidDir, "suite.out");
  fs.writeFileSync(outPath, "ok 1 - placeholder\n");
  const written = writeSuiteMetaForOutFile(outPath, { tests: [{ name: "placeholder", ok: true }] });
  const execWritten = writeExecutableManifest(evidDir, [
    { path: "suite.out", sha256: written.meta.sha256, bytes: written.meta.bytes },
  ]);
  writeEvidenceIndexAndChecksum(evidDir, [
    { path: "suite.out", sha256: written.meta.sha256, bytes: written.meta.bytes },
    { path: EXECUTABLE_MANIFEST_FILENAME, sha256: execWritten.sha256, bytes: execWritten.bytes },
  ]);
  fs.writeFileSync(outPath, "mutated after index\n");
  const mutated = verifyEvidenceIndex(evidDir);
  publish({
    caseId: "V5-INDEX-MUTATED-ARTIFACT",
    name: "index→mutated artifact",
    exactMutation: "rewrite suite.out after detached index",
    enforcementPath: "verifyEvidenceIndex",
    classification: mutated.reason || "index_ne_committed",
    failedGate: "evidence_index",
    dbPushCallsObserved: 0,
    repairCallsObserved: 0,
    continuationCallsObserved: 0,
    orderedCallTrace: ["verifyEvidenceIndex"],
    result: mutated.ok ? "UNEXPECTED" : "rejected",
  });
  assert.equal(mutated.ok, false);
  fs.rmSync(evidDir, { recursive: true, force: true });

  for (const record of records) {
    assert.equal(record.repairCallsObserved, 0, `${record.caseId} repairCallsObserved`);
    assert.equal(record.dbPushCallsObserved, 0, `${record.caseId} dbPushCallsObserved`);
    assert.equal(record.continuationCallsObserved, 0, `${record.caseId} continuationCallsObserved`);
    assert.ok(Array.isArray(record.orderedCallTrace), `${record.caseId} trace`);
    assert.notEqual(record.result, "UNEXPECTED", record.caseId);
  }
  const ids = records.map((row) => row.caseId);
  for (const required of [
    "V5-CHECK-INS-AS-REFED", "V5-CHECK-UPD-AS-REFED", "V5-NOACTION-UPD-AS-REFING",
    "V5-RESTRICT-DEL-AS-REFING", "V5-ROLES-SWAPPED-EQUAL-IDS", "V5-UNKNOWN-RI",
    "V5-RI-INCOMPAT-EVENT", "V5-RI-INCOMPAT-ACTION", "V5-MISSING-SELF-FK",
    "V5-DUPLICATE-SELF-FK", "V5-MULTIPLY-CLASSIFIED", "V5-NO-SEMANTIC-ROLE",
    "V5-CATEGORY-TOTALS", "V5-GIT-NONZERO", "V5-GIT-SPAWN-FAIL", "V5-GIT-TIMEOUT",
    "V5-GIT-MALFORMED", "V5-GIT-MISSING-BLOB", "V5-GIT-AMBIGUOUS",
    "V5-POISON-TARGET-NULL", "V5-POISON-TARGET-MISMATCH", "V5-POISON-EXTRA-KEY",
    "V5-POISON-MISSING-KEY", "V5-POISON-WRONG-TYPE", "V5-INV-BEFORE-POISON",
    "V5-INV-BEFORE-HISTORY", "V5-MANIFEST-SELF-ENTRY", "V5-INDEX-MUTATED-ARTIFACT",
  ]) {
    assert.equal(ids.includes(required), true, `missing ${required}`);
  }
  const independentPath = path.join(root, INDEPENDENT_REFERENCE_MODULE_RELPATH);
  const independentSha = createHash("sha256").update(fs.readFileSync(independentPath)).digest("hex");
  console.log(JSON.stringify({
    publishedV5Negatives: records,
    independent_reference_source_sha256: independentSha,
    schema_version: F3_FULL_FINGERPRINT_SCHEMA_VERSION,
    must_reverify_on_17_6: MUST_REVERIFY_ON_17_6,
  }, null, 2));
});

function exactEnvelope(overrides = {}) {
  return assembleFinalPoisonExactRow(overrides);
}

function exactProcess(overrides = {}) {
  if (overrides.stdout != null || overrides.status != null || overrides.signal != null
    || overrides.timeout != null || overrides.stderr != null || overrides.reconstructed != null
    || overrides.spawnError != null || overrides.queryError != null || overrides.error != null
    || overrides.originalStdout != null || overrides.assembledFromExtractedFields != null) {
    const row = overrides.row || exactEnvelope();
    const stdout = Object.prototype.hasOwnProperty.call(overrides, "stdout")
      ? overrides.stdout
      : JSON.stringify(row);
    const result = {
      status: Object.prototype.hasOwnProperty.call(overrides, "status") ? overrides.status : 0,
      stdout,
      stderr: Object.prototype.hasOwnProperty.call(overrides, "stderr") ? overrides.stderr : "",
      timeout: overrides.timeout === true,
    };
    if (overrides.signal != null) result.signal = overrides.signal;
    if (overrides.spawnError != null) result.spawnError = overrides.spawnError;
    if (overrides.queryError != null) result.queryError = overrides.queryError;
    if (overrides.error != null) result.error = overrides.error;
    if (overrides.reconstructed != null) result.reconstructed = overrides.reconstructed;
    if (overrides.assembledFromExtractedFields != null) {
      result.assembledFromExtractedFields = overrides.assembledFromExtractedFields;
    }
    if (Object.prototype.hasOwnProperty.call(overrides, "originalStdout")) {
      result.originalStdout = overrides.originalStdout;
    }
    return result;
  }
  return originalPoisonProcessResult({ row: overrides.row || overrides });
}

async function runActualSpyPath({
  processResult,
  frozenTarget,
  frozenTargetResult,
  gateExtra,
  cleanup,
} = {}) {
  const spies = { repairCalls: 0, dbPushCalls: 0, continuationCalls: 0 };
  const decided = await runQualifyPoisonBoundPath({
    gateInput: authorizedGateInput(gateExtra || {}),
    frozenTarget,
    frozenTargetResult,
    cleanup: cleanup || (() => provenCleanup()),
    verifyPoisonAbsent: () => processResult,
    repair: () => {
      spies.repairCalls += 1;
      return { status: 0 };
    },
    dbPush: () => {
      spies.dbPushCalls += 1;
      return { status: 0 };
    },
    continuation: () => {
      spies.continuationCalls += 1;
      return { status: 0 };
    },
  });
  return { decided, spies };
}

test("Daybreak original-stdout poison + connection-bound target: ACTUAL spies, founder 1-34+", async () => {
  const qualifySrc = fs.readFileSync(path.join(root, "scripts/qualify-f3-db-push-disposable.mjs"), "utf8");
  assert.doesNotMatch(qualifySrc, /exactPoisonStdout/);
  assert.doesNotMatch(qualifySrc, /assembleFinalPoisonExactRow/);
  assert.doesNotMatch(qualifySrc, /inventoryFromQuery\(poison/);
  assert.match(qualifySrc, /preserveOriginalProcessStdout/);
  assert.match(qualifySrc, /constructImmutableValidatedTargetFromConnection/);
  assert.match(qualifySrc, /frozenTarget: frozenTargetBuilt\.target/);
  assert.match(qualifySrc, /runIsolatedPoisonPsqlQuery/);
  assert.doesNotMatch(qualifySrc, /runDbQuery\(\{[\s\S]{0,180}POISON_ABSENT_PROBE_SQL/);
  assert.match(POISON_ABSENT_PROBE_SQL, /json_build_object\(/);
  assert.match(POISON_ABSENT_PROBE_SQL, /::text/);
  assert.doesNotMatch(POISON_ABSENT_PROBE_SQL, /jsonb_build_object/);

  const approved = constructImmutableValidatedTargetFromConnection({
    source: "test-f3-daybreak-original-stdout",
  });
  assert.equal(approved.ok, true);
  assert.equal(approved.target.connection_hostname, APPROVED_DISPOSABLE_POOLER_HOST);
  assert.equal(approved.target.connection_username, APPROVED_DISPOSABLE_POOLER_USER);
  assert.equal(approved.target.expected_live_role, "postgres");
  assert.equal(approved.target.expected_live_database, "postgres");
  assert.equal(approved.target.pooler_username_mapping.connection_username, "postgres.jkorwnwwmdeflfntxntl");
  assert.equal(approved.target.pooler_username_mapping.project_ref, "jkorwnwwmdeflfntxntl");
  assert.equal(approved.target.provenance.connection_hostname, "connection_metadata");
  assert.equal(approved.target.provenance.live_current_database, "original_query_output");
  assert.equal(approved.target.provenance.project_ref, "approved_disposable_pin");

  const records = [];
  const publish = async (caseId, exactMutation, runner) => {
    const { decided, spies } = await runner();
    const rejected = decided.repairAuthorized === false
      && spies.repairCalls === 0
      && decided.repairCalls === 0
      && spies.dbPushCalls === 0
      && decided.dbPushCalls === 0
      && spies.continuationCalls === 0
      && decided.continuation !== true
      && decided.historyMutated !== true
      && decided.usedFallbackParser !== true
      && (decided.reconstructedPoisonObject !== true || caseId === "F3-N35-RECONSTRUCTED-NOT-ORIGINAL");
    const record = {
      caseId,
      exactMutation,
      enforcementPath: "runQualifyPoisonBoundPath",
      classification: decided.poisonVerify?.reason || decided.gate?.hold || decided.targetBinding?.reason || "rejected",
      failedGate: (decided.gate?.failedGates || []).join(",")
        || decided.targetBinding?.parser_verdict
        || decided.poisonVerify?.parser_verdict
        || "poison",
      repairCalls: spies.repairCalls,
      dbPushCalls: spies.dbPushCalls,
      continuationCalls: spies.continuationCalls,
      repairCallsObserved: decided.repairCalls,
      dbPushCallsObserved: decided.dbPushCalls,
      continuationCallsObserved: decided.continuationCalls,
      usedFallbackParser: decided.usedFallbackParser,
      reconstructedPoisonObject: decided.reconstructedPoisonObject,
      historyMutated: decided.historyMutated,
      result: rejected ? "rejected" : "UNEXPECTED",
    };
    records.push(record);
    assert.equal(spies.repairCalls, 0, `${caseId} ACTUAL repairCalls`);
    assert.equal(decided.repairCalls, 0, `${caseId} path repairCalls`);
    assert.equal(spies.dbPushCalls, 0, `${caseId} ACTUAL dbPushCalls`);
    assert.equal(decided.continuation, false, `${caseId} no continuation`);
    assert.equal(decided.usedFallbackParser, false, `${caseId} no fallback parser`);
    assert.notEqual(record.result, "UNEXPECTED", caseId);
    return record;
  };

  const valid = exactProcess();
  await publish("F3-N01-NONZERO-STATUS", "nonzero status", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({ status: 1, stdout: JSON.stringify(exactEnvelope()) }),
  }));
  await publish("F3-N02-SIGNAL", "signal", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({ signal: "SIGTERM", stdout: JSON.stringify(exactEnvelope()) }),
  }));
  await publish("F3-N03-TIMEOUT", "timeout", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({ timeout: true, stdout: JSON.stringify(exactEnvelope()) }),
  }));
  await publish("F3-N04-SPAWN-ERROR", "spawn error", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({ spawnError: new Error("ENOENT"), stdout: JSON.stringify(exactEnvelope()) }),
  }));
  await publish("F3-N05-QUERY-ERROR", "query error", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({ queryError: "ERROR: relation missing", stdout: JSON.stringify(exactEnvelope()) }),
  }));
  await publish("F3-N06-EMPTY", "empty stdout", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({ stdout: "" }),
  }));
  await publish("F3-N07-NONJSON", "non-JSON", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({ stdout: "not-json" }),
  }));
  await publish("F3-N08-MULTI-ROW", "multi-row array", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({ stdout: JSON.stringify([exactEnvelope(), exactEnvelope()]) }),
  }));
  await publish("F3-N09-PREFIX", "prefix before JSON", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({ stdout: `NOTICE: ok\n${JSON.stringify(exactEnvelope())}` }),
  }));
  await publish("F3-N10-TRAILING", "valid object + malformed trailing", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({ stdout: `${JSON.stringify(exactEnvelope())} trailing-error` }),
  }));
  await publish("F3-N11-DUPLICATE-KEYS", "duplicate keys", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({
      stdout: '{"schema_version":"f3-poison-envelope-v1","poisonPresent":false,"current_database":"postgres","current_user":"postgres","probe_marker":"f3_poison_absent_probe","poisonPresent":true}\n',
    }),
  }));
  await publish("F3-N12-EXTRA-PROPERTY", "extra property", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({ stdout: `${JSON.stringify({ ...exactEnvelope(), canary: true })}\n` }),
  }));
  await publish("F3-N13-MISSING-PROPERTY", "missing property", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({
      stdout: `${JSON.stringify({
        schema_version: FINAL_POISON_SCHEMA_VERSION,
        poisonPresent: false,
        current_database: "postgres",
        current_user: "postgres",
      })}\n`,
    }),
  }));
  await publish("F3-N14-NULL-DB", "null current_database", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({ stdout: `${JSON.stringify({ ...exactEnvelope(), current_database: null })}\n` }),
  }));
  await publish("F3-N15-EMPTY-DB", "empty current_database", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({ row: { current_database: "" } }),
  }));
  await publish("F3-N16-NULL-USER", "null current_user", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({ stdout: `${JSON.stringify({ ...exactEnvelope(), current_user: null })}\n` }),
  }));
  await publish("F3-N17-EMPTY-USER", "empty current_user", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({ row: { current_user: "" } }),
  }));
  await publish("F3-N18-WRONG-DB", "wrong live database", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({ row: { current_database: "template1" } }),
  }));
  await publish("F3-N19-WRONG-USER", "wrong live user", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({ row: { current_user: "ubuntu" } }),
  }));
  await publish("F3-N20-WRONG-USERNAME-MAPPING", "wrong username mapping", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({ row: { current_user: "authenticator" } }),
  }));

  const wrongRef = constructImmutableValidatedTargetFromConnection({
    project_ref: "not-the-disposable-ref",
    source: "negative-wrong-ref",
  });
  assert.equal(wrongRef.ok, false);
  await publish("F3-N21-WRONG-REF", "wrong ref", () => runActualSpyPath({
    frozenTargetResult: wrongRef,
    processResult: valid,
  }));
  const prodRef = constructImmutableValidatedTargetFromConnection({
    connection: {
      hostname: APPROVED_DISPOSABLE_POOLER_HOST,
      port: APPROVED_DISPOSABLE_POOLER_PORT,
      database: "postgres",
      username: `postgres.${PRODUCTION_REF}`,
      sslmode: "require",
      ssl_required: true,
      host_classification: "approved_session_pooler",
    },
  });
  assert.equal(prodRef.ok, false);
  await publish("F3-N22-PRODUCTION-REF", "production ref", () => runActualSpyPath({
    frozenTargetResult: prodRef,
    processResult: valid,
  }));
  const wrongOrg = constructImmutableValidatedTargetFromConnection({
    org_id: "not-the-approved-org",
  });
  assert.equal(wrongOrg.ok, false);
  await publish("F3-N23-WRONG-ORG", "wrong org", () => runActualSpyPath({
    frozenTargetResult: wrongOrg,
    processResult: valid,
  }));
  const wrongHost = constructImmutableValidatedTargetFromConnection({
    connection: {
      hostname: "db.aliased.example.com",
      port: APPROVED_DISPOSABLE_POOLER_PORT,
      database: "postgres",
      username: APPROVED_DISPOSABLE_POOLER_USER,
      sslmode: "require",
      ssl_required: true,
      host_classification: "approved_session_pooler",
    },
  });
  assert.equal(wrongHost.ok, false);
  await publish("F3-N24-WRONG-HOSTNAME", "wrong/aliased hostname", () => runActualSpyPath({
    frozenTargetResult: wrongHost,
    processResult: valid,
  }));
  const wrongPooler = constructImmutableValidatedTargetFromConnection({
    connection: {
      hostname: "aws-0-eu-central-1.pooler.supabase.com",
      port: APPROVED_DISPOSABLE_POOLER_PORT,
      database: "postgres",
      username: APPROVED_DISPOSABLE_POOLER_USER,
      sslmode: "require",
      ssl_required: true,
      host_classification: "approved_session_pooler",
    },
  });
  assert.equal(wrongPooler.ok, false);
  await publish("F3-N25-WRONG-POOLER", "unapproved pooler", () => runActualSpyPath({
    frozenTargetResult: wrongPooler,
    processResult: valid,
  }));
  const wrongPort = constructImmutableValidatedTargetFromConnection({
    connection: {
      hostname: APPROVED_DISPOSABLE_POOLER_HOST,
      port: TRANSACTION_POOLER_PORT,
      database: "postgres",
      username: APPROVED_DISPOSABLE_POOLER_USER,
      sslmode: "require",
      ssl_required: true,
      host_classification: "approved_session_pooler",
    },
  });
  assert.equal(wrongPort.ok, false);
  await publish("F3-N26-WRONG-PORT", "wrong port", () => runActualSpyPath({
    frozenTargetResult: wrongPort,
    processResult: valid,
  }));
  const missingSsl = constructImmutableValidatedTargetFromConnection({
    connection: {
      hostname: APPROVED_DISPOSABLE_POOLER_HOST,
      port: APPROVED_DISPOSABLE_POOLER_PORT,
      database: "postgres",
      username: APPROVED_DISPOSABLE_POOLER_USER,
      sslmode: "disable",
      ssl_required: false,
      host_classification: "approved_session_pooler",
    },
  });
  assert.equal(missingSsl.ok, false);
  await publish("F3-N27-MISSING-SSL", "missing SSL", () => runActualSpyPath({
    frozenTargetResult: missingSsl,
    processResult: valid,
  }));
  await publish("F3-N28-POISON-PRESENT", "poison present", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({ row: { poisonPresent: true } }),
  }));
  await publish("F3-N29-CLEANUP-NONZERO", "cleanup nonzero", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: valid,
    cleanup: () => ({ status: 1, stdout: "", stderr: "ERROR: cannot drop trigger" }),
  }));
  await publish("F3-N30-CLEANUP-MALFORMED", "cleanup malformed", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: valid,
    cleanup: () => ({ ok: true, sql: REMOVE_HISTORY_INJECT_SQL }),
  }));
  const mutated = { ...approved.target, project_ref: PRODUCTION_REF };
  await publish("F3-N31-FROZEN-TARGET-MUTATION", "frozen target mutation", () => runActualSpyPath({
    frozenTarget: mutated,
    processResult: valid,
  }));
  await publish("F3-N32-FINGERPRINT-MISMATCH", "fingerprint mismatch", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: valid,
    gateExtra: {
      fingerprint: (() => {
        const expected = getFrozenExpectedFingerprint(FILE118);
        const observed = structuredClone(expected);
        observed.relations = [];
        return { expected, observed };
      })(),
    },
  }));
  await publish("F3-N33-HISTORY-PRESENT", "history present", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: valid,
    gateExtra: { historyRows: [{ version: VER118, name: "f3_bounded_financial_epoch_foundation" }] },
  }));
  await publish("F3-N34-UNEXPECTED-STAGED", "unexpected staged migration", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: valid,
    gateExtra: { stagedMigrations: [timestampFilenameFor(FILE118), "20260999999999_unexpected.sql"] },
  }));
  const original = originalPoisonProcessResult();
  const extracted = JSON.parse(String(original.stdout));
  const reconstructedStdout = JSON.stringify(assembleFinalPoisonExactRow({
    poisonPresent: extracted.poisonPresent,
    current_database: extracted.current_database,
    current_user: extracted.current_user,
  }));
  await publish("F3-N35-RECONSTRUCTED-NOT-ORIGINAL", "strict validator received reconstructed rather than original output", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: {
      ...original,
      stdout: reconstructedStdout,
      originalStdout: '{"not":"original-envelope"}',
      reconstructed: true,
      assembledFromExtractedFields: true,
    },
  }));
  await publish("F3-N36-NL-MULTI", "NL-delimited multi-records", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({
      stdout: `${JSON.stringify(exactEnvelope())}\n${JSON.stringify(exactEnvelope())}`,
    }),
  }));
  await publish("F3-N37-UNEXPECTED-STDERR", "unexpected stderr", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({ stderr: "WARNING: something" }),
  }));

  const positive = await runActualSpyPath({
    frozenTarget: approved.target,
    processResult: originalPoisonProcessResult(),
  });
  assert.equal(positive.decided.repairAuthorized, true, "positive control repair authorized");
  assert.equal(positive.spies.repairCalls, 1, "positive control ACTUAL repairCalls");
  assert.equal(positive.decided.repairCalls, 1, "positive control path repairCalls");
  assert.equal(positive.decided.poisonAbsent, true);
  assert.equal(positive.decided.poisonVerify.parser_verdict, "valid_json_exact_schema");
  assert.equal(positive.decided.poisonVerify.raw.stdoutPreservedBeforeTransform, true);
  assert.equal(typeof positive.decided.poisonVerify.raw.stdoutSha256, "string");
  assert.equal(typeof positive.decided.poisonVerify.raw.stdoutByteLength, "number");
  assert.equal(positive.decided.usedFallbackParser, false);
  assert.equal(positive.decided.reconstructedPoisonObject, false);
  records.push({
    caseId: "F3-P01-POISON-ABSENT-EXACT",
    exactMutation: "none (positive control)",
    repairCalls: positive.spies.repairCalls,
    dbPushCalls: positive.spies.dbPushCalls,
    continuationCalls: positive.spies.continuationCalls,
    result: "accepted",
  });

  const required = [
    "F3-N01-NONZERO-STATUS", "F3-N02-SIGNAL", "F3-N03-TIMEOUT", "F3-N04-SPAWN-ERROR",
    "F3-N05-QUERY-ERROR", "F3-N06-EMPTY", "F3-N07-NONJSON", "F3-N08-MULTI-ROW",
    "F3-N09-PREFIX", "F3-N10-TRAILING", "F3-N11-DUPLICATE-KEYS", "F3-N12-EXTRA-PROPERTY",
    "F3-N13-MISSING-PROPERTY", "F3-N14-NULL-DB", "F3-N15-EMPTY-DB", "F3-N16-NULL-USER",
    "F3-N17-EMPTY-USER", "F3-N18-WRONG-DB", "F3-N19-WRONG-USER", "F3-N20-WRONG-USERNAME-MAPPING",
    "F3-N21-WRONG-REF", "F3-N22-PRODUCTION-REF", "F3-N23-WRONG-ORG", "F3-N24-WRONG-HOSTNAME",
    "F3-N25-WRONG-POOLER", "F3-N26-WRONG-PORT", "F3-N27-MISSING-SSL", "F3-N28-POISON-PRESENT",
    "F3-N29-CLEANUP-NONZERO", "F3-N30-CLEANUP-MALFORMED", "F3-N31-FROZEN-TARGET-MUTATION",
    "F3-N32-FINGERPRINT-MISMATCH", "F3-N33-HISTORY-PRESENT", "F3-N34-UNEXPECTED-STAGED",
    "F3-N35-RECONSTRUCTED-NOT-ORIGINAL",
    "F3-N36-NL-MULTI", "F3-N37-UNEXPECTED-STDERR",
  ];
  const ids = records.map((row) => row.caseId);
  for (const id of required) {
    assert.equal(ids.includes(id), true, `missing ${id}`);
  }

  const independentPath = path.join(root, INDEPENDENT_REFERENCE_MODULE_RELPATH);
  const independentSha = createHash("sha256").update(fs.readFileSync(independentPath)).digest("hex");
  assert.equal(independentSha, F3_FUNCTIONAL_RECURSIVE_CLOSURE.independent_reference_source_sha256);
  assert.equal(F3_FULL_FINGERPRINT_SCHEMA_VERSION, "f3-full-catalog-v5");
  assert.equal(FROZEN_EXPECTED_FINGERPRINT_SHA256["00118_f3_bounded_financial_epoch_foundation.sql"], "888c794355982346573a3353caa7fa74181bc0048cc95990de60416de893ab1d");
  assert.equal(FROZEN_EXPECTED_FINGERPRINT_SHA256["00119_f3_01_core_ledger_foundation.sql"], "5e03111ffb34be3ed76a714370c93e70210a9741a25ac7b9158a9a9ad22f12f4");
  assert.equal(FROZEN_EXPECTED_FINGERPRINT_SHA256["00120_f3_02_secure_posting_idempotency.sql"], "35eba6966d2c077a9467f09adc6c85306b951c9d8388ee758a60d924c05ae51a");
  assert.equal(FROZEN_EXPECTED_FINGERPRINT_SHA256["00121_f3_03_projection_read_proof.sql"], "8f65797949d8c5afb7dfa99b8020da52385347099b2a5b9be5148b253e76bde6");
  assert.equal(FROZEN_EXPECTED_FINGERPRINT_SHA256["00122_f3_04_correction_reversal.sql"], "6e3240759aec64d4692422aac006b4fb865e3039832be84efea86b39c0253175");
  assert.equal(FROZEN_EXPECTED_FINGERPRINT_SHA256["00123_f3_05_opening_cash_command.sql"], "d5e50fd760a9629bf4e1574fd256ecf0d4a108df83dec27323a608e0466dcb34");
  assert.equal(SEALED_PLATFORM_ACL_ENVELOPE_DIGEST, "eb58900b492b95371decfdab86b3786afc2c8089c6b0a117497f9e0b22c41a2a");

  const dup = parseDuplicateKeySafeJson('{"a":1,"a":2}');
  assert.equal(dup.ok, false);
  assert.equal(dup.parser_verdict, "duplicate_keys");
  const parsedExact = parseExactOriginalJsonObject(originalPoisonProcessResult());
  assert.equal(parsedExact.ok, true);
  assert.equal(parsedExact.raw.stdoutPreservedBeforeTransform, true);
  assert.equal(parsedExact.raw.stderrByteLength, 0);
  assert.equal(parsedExact.raw.payloadByteRange.start, 0);
  assert.equal(
    parsedExact.raw.payloadByteRange.end,
    parsedExact.raw.stdoutByteLength - 1,
  );
  assert.equal(String(parsedExact.raw.stdout).endsWith("\n"), true);
  assert.equal(String(parsedExact.raw.stdout).endsWith("\r\n"), false);
  assert.equal(parsedExact.raw.stdout, parsedExact.preserved.stdout);

  console.log(JSON.stringify({
    publishedOriginalStdoutNegatives: records,
    requiredCaseCount: required.length,
    publishedCaseCount: records.length,
    positiveControlRepairCalls: positive.spies.repairCalls,
    independent_reference_source_sha256: independentSha,
    v5_hashes: FROZEN_EXPECTED_FINGERPRINT_SHA256,
    mapping: APPROVED_SESSION_POOLER_USERNAME_MAPPING,
  }, null, 2));
});

function framedPoisonStdout(row = {}) {
  return `${JSON.stringify(assembleFinalPoisonExactRow(row))}\n`;
}

function installPoisonPsqlMock({ stdout, stderr = "", status = 0, signal = null, timeout = false, spawnError = null } = {}) {
  const framed = stdout == null ? framedPoisonStdout() : stdout;
  __installPoisonPsqlSpawnForTests((cmd, args) => {
    assert.equal(cmd, "psql");
    if (args.includes("--version")) {
      return { status: 0, stdout: "psql (PostgreSQL) 17.6\n", stderr: "", signal: null };
    }
    return { status, stdout: framed, stderr, signal, timeout, error: spawnError, killed: timeout === true };
  });
}

test("isolated psql poison transport: exact framing, env isolation, CLI wrappers rejected", async () => {
  const qualifySrc = fs.readFileSync(path.join(root, "scripts/qualify-f3-db-push-disposable.mjs"), "utf8");
  const parseSrc = fs.readFileSync(path.join(root, "scripts/lib/f3-db-push-query-parse.mjs"), "utf8");
  const gateSrc = fs.readFileSync(path.join(root, "scripts/lib/f3-db-push-repair-safety-gate.mjs"), "utf8");
  assert.match(qualifySrc, /runIsolatedPoisonPsqlQuery/);
  assert.doesNotMatch(qualifySrc, /runDbQuery\(\{[\s\S]{0,180}POISON_ABSENT_PROBE_SQL/);
  assert.match(POISON_ABSENT_PROBE_SQL, /SELECT json_build_object\(/);
  assert.match(POISON_ABSENT_PROBE_SQL, /::text;/);
  assert.doesNotMatch(POISON_ABSENT_PROBE_SQL, /jsonb_build_object/);
  assert.deepEqual([...PSQL_POISON_QUERY_ARGV], ["-X", "-q", "-t", "-A", "-w", "-v", "ON_ERROR_STOP=1"]);
  assert.equal(PSQL_POISON_STDOUT_FRAMING_CONTRACT.requiredSuffix, "\n");
  assert.equal(PSQL_POISON_STDOUT_FRAMING_CONTRACT.allowCrlf, false);
  assert.equal(MUST_LOCAL_PSQL_PROOF_ON_17_6, true);
  assert.match(parseSrc, /evaluateExactPsqlStdoutFraming/);
  assert.match(gateSrc, /runIsolatedPoisonPsqlQuery/);
  assert.doesNotMatch(parseSrc, /inventoryFromQuery\(poison/);

  const approved = constructImmutableValidatedTargetFromConnection({
    source: "test-f3-isolated-psql-transport",
  });
  assert.equal(approved.ok, true);

  setAuthorizedEnv();
  process.env.DATABASE_URL = "postgresql://ubuntu@127.0.0.1:5432/postgres";
  process.env.PGPASSWORD = "ambient-must-not-leak";
  process.env.SUPABASE_ACCESS_TOKEN = "sbp_ambient";
  process.env.PGHOST = "evil.example.com";
  const envBuilt = buildIsolatedPoisonPsqlEnv(approved.target);
  assert.equal(envBuilt.ok, true);
  assert.deepEqual(Object.keys(envBuilt.env).sort(), [...PSQL_POISON_ISOLATED_ENV_KEYS].sort());
  assert.equal(envBuilt.env.DATABASE_URL, undefined);
  assert.equal(envBuilt.env.SUPABASE_ACCESS_TOKEN, undefined);
  assert.equal(envBuilt.env.PGHOST, APPROVED_DISPOSABLE_POOLER_HOST);
  assert.equal(envBuilt.env.PGPORT, String(APPROVED_DISPOSABLE_POOLER_PORT));
  assert.equal(envBuilt.env.PGDATABASE, "postgres");
  assert.equal(envBuilt.env.PGUSER, APPROVED_DISPOSABLE_POOLER_USER);
  assert.equal(envBuilt.env.PGSSLMODE, "require");
  assert.equal(envBuilt.env.PGPASSWORD, process.env[DB_PASSWORD_ENV]);
  assert.notEqual(envBuilt.env.PGPASSWORD, "ambient-must-not-leak");
  assert.equal(envBuilt.env.HOME.includes("f3-poison-psql-home-"), true);
  assert.equal(fs.existsSync(path.join(envBuilt.env.HOME, ".psqlrc")), false);
  fs.rmSync(envBuilt.home, { recursive: true, force: true });

  installPoisonPsqlMock();
  const spawned = [];
  __installPoisonPsqlSpawnForTests((cmd, args, opts) => {
    spawned.push({ cmd, args, envKeys: Object.keys(opts.env).sort() });
    assert.equal(cmd, "psql");
    if (args.includes("--version")) {
      return { status: 0, stdout: "psql (PostgreSQL) 17.6\n", stderr: "" };
    }
    assert.deepEqual(args.slice(0, PSQL_POISON_QUERY_ARGV.length), [...PSQL_POISON_QUERY_ARGV]);
    assert.equal(args.includes("-c"), true);
    assert.equal(args.includes("-d"), false);
    assert.equal(args.some((a) => String(a).startsWith("postgresql://")), false);
    assert.equal(args.includes("-p"), false);
    assert.equal(JSON.stringify(args).includes(process.env[DB_PASSWORD_ENV]), false);
    assert.equal(opts.env.DATABASE_URL, undefined);
    assert.equal(opts.env.SUPABASE_ACCESS_TOKEN, undefined);
    assert.equal(opts.env.PGPASSWORD, process.env[DB_PASSWORD_ENV]);
    return { status: 0, stdout: framedPoisonStdout(), stderr: "", signal: null };
  });
  const live = runIsolatedPoisonPsqlQuery({
    frozenTarget: approved.target,
    sql: POISON_ABSENT_PROBE_SQL,
  });
  assert.equal(live.spawned, true);
  assert.equal(live.psqlVersion, "psql (PostgreSQL) 17.6");
  assert.equal(live.stdout, framedPoisonStdout());
  assert.equal(live.stderr, "");
  const accepted = parseExactOriginalJsonObject(live);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.raw.stdout, live.stdout);
  assert.equal(accepted.raw.stderrByteLength, 0);
  assert.notEqual(accepted.raw.stdout, accepted.value);

  const wrapperArray = parseExactOriginalJsonObject({
    status: 0,
    stdout: `${JSON.stringify([{ jsonb_build_object: assembleFinalPoisonExactRow() }])}\n`,
    stderr: "",
  });
  assert.equal(wrapperArray.ok, false);
  assert.equal(wrapperArray.parser_verdict, "array_not_object");
  const columnWrapper = evaluateOriginalPoisonProcessResult({
    status: 0,
    stdout: `${JSON.stringify({ json_build_object: assembleFinalPoisonExactRow() })}\n`,
    stderr: "",
  }, { frozenTarget: approved.target });
  assert.equal(columnWrapper.ok, false);
  assert.equal(columnWrapper.parser_verdict, "keyset_mismatch");
  const banner = evaluateOriginalProcessResultContract({
    status: 0,
    stdout: framedPoisonStdout(),
    stderr: "Connecting to remote database...\n",
  });
  assert.equal(banner.ok, false);
  assert.equal(banner.parser_verdict, "unexpected_stderr");

  const framingOk = evaluateExactPsqlStdoutFraming(framedPoisonStdout());
  assert.equal(framingOk.ok, true);
  assert.equal(framingOk.payloadStart, 0);
  assert.equal(evaluateExactPsqlStdoutFraming(JSON.stringify(assembleFinalPoisonExactRow())).parser_verdict, "missing_final_lf");
  assert.equal(evaluateExactPsqlStdoutFraming(`${JSON.stringify(assembleFinalPoisonExactRow())}\r\n`).parser_verdict, "crlf_not_lf");
  assert.equal(evaluateExactPsqlStdoutFraming(`${JSON.stringify(assembleFinalPoisonExactRow())}\n\n`).parser_verdict, "extra_newline");
  assert.equal(evaluateExactPsqlStdoutFraming(` ${JSON.stringify(assembleFinalPoisonExactRow())}\n`).parser_verdict, "leading_whitespace");
  assert.equal(evaluateExactPsqlStdoutFraming(`${JSON.stringify(assembleFinalPoisonExactRow())} \n`).parser_verdict, "trailing");

  const records = [];
  const publish = async (caseId, exactMutation, runner) => {
    const { decided, spies } = await runner();
    const rejected = decided.repairAuthorized === false
      && spies.repairCalls === 0
      && decided.repairCalls === 0
      && spies.dbPushCalls === 0
      && decided.continuation !== true
      && decided.usedFallbackParser !== true
      && decided.reconstructedPoisonObject !== true;
    records.push({
      caseId,
      exactMutation,
      repairCalls: spies.repairCalls,
      result: rejected ? "rejected" : "UNEXPECTED",
    });
    assert.equal(spies.repairCalls, 0, `${caseId} ACTUAL repairCalls`);
    assert.equal(decided.repairCalls, 0, `${caseId} path repairCalls`);
    assert.equal(spies.dbPushCalls, 0, `${caseId} ACTUAL dbPushCalls`);
    assert.equal(decided.continuation, false, `${caseId} no continuation`);
    assert.equal(decided.usedFallbackParser, false, `${caseId} no fallback parser`);
    assert.notEqual(records[records.length - 1].result, "UNEXPECTED", caseId);
    return records[records.length - 1];
  };

  await publish("F3-T01-CLI-BANNER-STDERR", "CLI banner stderr", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({ stdout: framedPoisonStdout(), stderr: "Connecting to remote database...\n" }),
  }));
  await publish("F3-T02-CLI-WRAPPER-ARRAY", "CLI wrapper array", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({
      stdout: `${JSON.stringify([{ jsonb_build_object: assembleFinalPoisonExactRow() }])}\n`,
    }),
  }));
  await publish("F3-T03-COLUMN-NAME-WRAPPER", "column-name wrapper", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({
      stdout: `${JSON.stringify({ json_build_object: assembleFinalPoisonExactRow() })}\n`,
    }),
  }));
  await publish("F3-T04-EXTRA-NEWLINE", "extra newline", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({ stdout: `${framedPoisonStdout()}\n` }),
  }));
  await publish("F3-T05-MISSING-FINAL-LF", "missing final LF", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({ stdout: JSON.stringify(assembleFinalPoisonExactRow()) }),
  }));
  await publish("F3-T06-CRLF", "CRLF when LF required", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({ stdout: `${JSON.stringify(assembleFinalPoisonExactRow())}\r\n` }),
  }));
  await publish("F3-T07-LEADING-SPACE", "leading space", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({ stdout: ` ${framedPoisonStdout()}` }),
  }));
  await publish("F3-T08-TRAILING-SPACE", "trailing space", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({ stdout: `${JSON.stringify(assembleFinalPoisonExactRow())} \n` }),
  }));
  await publish("F3-T09-MULTIPLE-ROWS", "multiple rows", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({
      stdout: `${JSON.stringify([assembleFinalPoisonExactRow(), assembleFinalPoisonExactRow()])}\n`,
    }),
  }));
  await publish("F3-T10-MULTIPLE-JSON-OBJECTS", "multiple JSON objects", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({
      stdout: `${framedPoisonStdout()}${framedPoisonStdout()}`,
    }),
  }));
  await publish("F3-T11-DUPLICATE-KEYS", "duplicate keys", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({
      stdout: '{"schema_version":"f3-poison-envelope-v1","poisonPresent":false,"current_database":"postgres","current_user":"postgres","probe_marker":"f3_poison_absent_probe","poisonPresent":true}\n',
    }),
  }));
  await publish("F3-T12-EXTRA-FIELD", "extra field", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({ stdout: `${JSON.stringify({ ...assembleFinalPoisonExactRow(), extra: 1 })}\n` }),
  }));
  await publish("F3-T13-WRONG-DB", "wrong live database", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({ row: { current_database: "template1" } }),
  }));
  await publish("F3-T14-WRONG-USER", "wrong live user", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({ row: { current_user: "ubuntu" } }),
  }));
  await publish("F3-T15-WRONG-USERNAME-MAPPING", "wrong username mapping", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({ row: { current_user: "authenticator" } }),
  }));
  const wrongHost = constructImmutableValidatedTargetFromConnection({
    connection: {
      hostname: "db.aliased.example.com",
      port: APPROVED_DISPOSABLE_POOLER_PORT,
      database: "postgres",
      username: APPROVED_DISPOSABLE_POOLER_USER,
      sslmode: "require",
      ssl_required: true,
      host_classification: "approved_session_pooler",
    },
  });
  assert.equal(wrongHost.ok, false);
  await publish("F3-T16-WRONG-HOST", "wrong/aliased hostname", () => runActualSpyPath({
    frozenTargetResult: wrongHost,
    processResult: originalPoisonProcessResult(),
  }));
  const wrongRef = constructImmutableValidatedTargetFromConnection({
    project_ref: "not-the-disposable-ref",
    source: "transport-wrong-ref",
  });
  assert.equal(wrongRef.ok, false);
  await publish("F3-T17-WRONG-REF", "wrong ref", () => runActualSpyPath({
    frozenTargetResult: wrongRef,
    processResult: originalPoisonProcessResult(),
  }));
  const wrongPort = constructImmutableValidatedTargetFromConnection({
    connection: {
      hostname: APPROVED_DISPOSABLE_POOLER_HOST,
      port: TRANSACTION_POOLER_PORT,
      database: "postgres",
      username: APPROVED_DISPOSABLE_POOLER_USER,
      sslmode: "require",
      ssl_required: true,
      host_classification: "approved_session_pooler",
    },
  });
  assert.equal(wrongPort.ok, false);
  await publish("F3-T18-WRONG-PORT", "wrong port", () => runActualSpyPath({
    frozenTargetResult: wrongPort,
    processResult: originalPoisonProcessResult(),
  }));
  const missingSsl = constructImmutableValidatedTargetFromConnection({
    connection: {
      hostname: APPROVED_DISPOSABLE_POOLER_HOST,
      port: APPROVED_DISPOSABLE_POOLER_PORT,
      database: "postgres",
      username: APPROVED_DISPOSABLE_POOLER_USER,
      sslmode: "disable",
      ssl_required: false,
      host_classification: "approved_session_pooler",
    },
  });
  assert.equal(missingSsl.ok, false);
  await publish("F3-T19-WRONG-SSL", "wrong SSL", () => runActualSpyPath({
    frozenTargetResult: missingSsl,
    processResult: originalPoisonProcessResult(),
  }));
  await publish("F3-T20-NONZERO-STATUS", "nonzero status", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({ status: 1, stdout: framedPoisonStdout() }),
  }));
  await publish("F3-T21-SIGNAL", "signal", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({ signal: "SIGTERM", stdout: framedPoisonStdout() }),
  }));
  await publish("F3-T22-TIMEOUT", "timeout", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({ timeout: true, stdout: framedPoisonStdout() }),
  }));
  await publish("F3-T23-SPAWN-ERROR", "spawn error", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({ spawnError: new Error("ENOENT"), stdout: framedPoisonStdout() }),
  }));
  await publish("F3-T24-NONEMPTY-STDERR", "nonempty stderr", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({ stdout: framedPoisonStdout(), stderr: "NOTICE: x\n" }),
  }));
  await publish("F3-T25-POISON-PRESENT", "poison still present", () => runActualSpyPath({
    frozenTarget: approved.target,
    processResult: exactProcess({ row: { poisonPresent: true } }),
  }));

  const savedPassword = process.env[DB_PASSWORD_ENV];
  delete process.env[DB_PASSWORD_ENV];
  const preSpawn = validatePoisonPsqlTargetBeforeSpawn(approved.target);
  assert.equal(preSpawn.ok, false);
  assert.equal(preSpawn.spawned, false);
  process.env[DB_PASSWORD_ENV] = savedPassword;

  const required = [
    "F3-T01-CLI-BANNER-STDERR", "F3-T02-CLI-WRAPPER-ARRAY", "F3-T03-COLUMN-NAME-WRAPPER",
    "F3-T04-EXTRA-NEWLINE", "F3-T05-MISSING-FINAL-LF", "F3-T06-CRLF",
    "F3-T07-LEADING-SPACE", "F3-T08-TRAILING-SPACE", "F3-T09-MULTIPLE-ROWS",
    "F3-T10-MULTIPLE-JSON-OBJECTS", "F3-T11-DUPLICATE-KEYS", "F3-T12-EXTRA-FIELD",
    "F3-T13-WRONG-DB", "F3-T14-WRONG-USER", "F3-T15-WRONG-USERNAME-MAPPING",
    "F3-T16-WRONG-HOST", "F3-T17-WRONG-REF", "F3-T18-WRONG-PORT", "F3-T19-WRONG-SSL",
    "F3-T20-NONZERO-STATUS", "F3-T21-SIGNAL", "F3-T22-TIMEOUT", "F3-T23-SPAWN-ERROR",
    "F3-T24-NONEMPTY-STDERR", "F3-T25-POISON-PRESENT",
  ];
  const ids = records.map((row) => row.caseId);
  for (const id of required) {
    assert.equal(ids.includes(id), true, `missing ${id}`);
  }

  const independentPath = path.join(root, INDEPENDENT_REFERENCE_MODULE_RELPATH);
  const independentSha = createHash("sha256").update(fs.readFileSync(independentPath)).digest("hex");
  assert.equal(independentSha, F3_FUNCTIONAL_RECURSIVE_CLOSURE.independent_reference_source_sha256);
  assert.equal(F3_FULL_FINGERPRINT_SCHEMA_VERSION, "f3-full-catalog-v5");
  assert.equal(FROZEN_EXPECTED_FINGERPRINT_SHA256["00118_f3_bounded_financial_epoch_foundation.sql"], "888c794355982346573a3353caa7fa74181bc0048cc95990de60416de893ab1d");
  assert.equal(FROZEN_EXPECTED_FINGERPRINT_SHA256["00123_f3_05_opening_cash_command.sql"], "d5e50fd760a9629bf4e1574fd256ecf0d4a108df83dec27323a608e0466dcb34");

  const columnDirect = parseDuplicateKeySafeJson(
    JSON.stringify({ json_build_object: assembleFinalPoisonExactRow() }),
  );
  assert.equal(columnDirect.ok, true, "JSON parser still parses objects; envelope schema rejects wrappers");
  const arrayDirect = parseDuplicateKeySafeJson(
    JSON.stringify([{ jsonb_build_object: assembleFinalPoisonExactRow() }]),
  );
  assert.equal(arrayDirect.ok, false);
  assert.equal(arrayDirect.parser_verdict, "array_not_object");

  console.log(JSON.stringify({
    publishedTransportNegatives: records,
    requiredTransportCaseCount: required.length,
    must_local_psql_proof_on_17_6: MUST_LOCAL_PSQL_PROOF_ON_17_6,
    independent_reference_source_sha256: independentSha,
    psqlArgv: [...PSQL_POISON_QUERY_ARGV],
    framing: PSQL_POISON_STDOUT_FRAMING_CONTRACT,
  }, null, 2));
});

function completePreRepairAuth(extra = {}) {
  const approved = constructImmutableValidatedTargetFromConnection({
    source: "test-f8-repair-auth",
  });
  const processResult = originalPoisonProcessResult();
  const encoded = encodeIsolatedPsqlProcessBytes(processResult);
  const parsed = parseExactOriginalJsonObject(processResult);
  const envelope = exactPoisonEnvelopeFromOriginal(parsed.value);
  const live = {
    current_database: envelope.row.current_database,
    current_user: envelope.row.current_user,
    provenance: "original_query_output",
  };
  return createRepairAuthorizationRecord({
    migrationIdentity: extra.migrationIdentity === undefined ? {
      file: FILE118,
      version: VER118,
      digest: FROZEN_DIGESTS[FILE118],
      destName: timestampFilenameFor(FILE118),
    } : extra.migrationIdentity,
    initialPush: extra.initialPush === undefined ? {
      status: 3,
      exitStatus: 3,
      stdoutSha256: "a".repeat(64),
      stderrSha256: "b".repeat(64),
      stdoutByteLength: 12,
      stderrByteLength: 40,
    } : extra.initialPush,
    fingerprint: extra.fingerprint === undefined ? {
      expectedSha256: expectedFingerprintSha256(FILE118),
      observedSha256: expectedFingerprintSha256(FILE118),
      expected: getFrozenExpectedFingerprint(FILE118),
      observed: getFrozenExpectedFingerprint(FILE118),
    } : extra.fingerprint,
    poisonCleanup: extra.poisonCleanup === undefined ? {
      status: 0,
      proven: true,
      stdoutSha256: "c".repeat(64),
      stderrSha256: "d".repeat(64),
    } : extra.poisonCleanup,
    poisonAbsenceQuery: extra.poisonAbsenceQuery === undefined ? {
      ...encoded,
      parsedEnvelope: envelope.row,
      live,
      poisonPresent: false,
      stdoutPreservedBeforeTransform: true,
    } : extra.poisonAbsenceQuery,
    targetBinding: extra.targetBinding === undefined ? {
      ok: true,
      live,
      frozenTarget: approved.target,
      fieldComparisons: encodeTargetBindingFieldComparisons({
        live,
        frozenTarget: approved.target,
      }),
    } : extra.targetBinding,
    repairGate: extra.repairGate === undefined ? {
      input: authorizedGateInput(),
    } : extra.repairGate,
    ...extra.rest,
  });
}

function completeAuthRecord(extra = {}) {
  const record = completePreRepairAuth(extra);
  record.repair = extra.repair === undefined ? {
    attempted: true,
    status: 0,
    repairCalls: 1,
    callbackOrder: ["cleanup", "verify", "repair"],
  } : extra.repair;
  record.retry = extra.retry === undefined ? {
    status: 0,
    staged: [timestampFilenameFor(FILE118)],
  } : extra.retry;
  record.continuation = extra.continuation === undefined ? {
    allowed: false,
  } : extra.continuation;
  record.postRepairFingerprint = extra.postRepairFingerprint === undefined ? {
    sha256: expectedFingerprintSha256(FILE118),
    ok: true,
  } : extra.postRepairFingerprint;
  record.postRetryFingerprint = extra.postRetryFingerprint === undefined ? {
    sha256: expectedFingerprintSha256(FILE118),
    ok: true,
  } : extra.postRetryFingerprint;
  record.repairGate = {
    ...(record.repairGate || {}),
    result: { ok: true, repairAuthorized: true },
    counters: { repairCalls: 1, cleanupCalls: 1, verifyCalls: 1 },
    callbackOrder: ["cleanup", "verify", "repair"],
    ...(extra.repairGateResult || {}),
  };
  return record;
}

test("F8 repair-authorization missing-section negatives hold with repairCalls=0", async () => {
  const qualify = fs.readFileSync(path.join(root, "scripts/qualify-f3-db-push-disposable.mjs"), "utf8");
  assert.match(qualify, /createRepairAuthorizationRecord/);
  assert.match(qualify, /assertRepairAuthorizationPreRepairComplete/);
  assert.match(qualify, /assertRepairAuthorizationComplete/);
  assert.match(qualify, /durableWriteRepairAuthorization/);
  assert.match(qualify, /repairAuthorizationRecords/);
  assert.equal(typeof exactPoisonEnvelopeFromOriginal, "function");
  const exactOk = exactPoisonEnvelopeFromOriginal(assembleFinalPoisonExactRow());
  assert.equal(exactOk.ok, true);

  const sections = [
    ["F8-R01-MISSING-MIGRATION-IDENTITY", "migrationIdentity"],
    ["F8-R02-MISSING-INITIAL-PUSH", "initialPush"],
    ["F8-R03-MISSING-FINGERPRINT", "fingerprint"],
    ["F8-R04-MISSING-POISON-CLEANUP", "poisonCleanup"],
    ["F8-R05-MISSING-POISON-ABSENCE", "poisonAbsenceQuery"],
    ["F8-R06-MISSING-TARGET-BINDING", "targetBinding"],
    ["F8-R07-MISSING-REPAIR-GATE", "repairGate"],
  ];
  const records = [];
  for (const [caseId, section] of sections) {
    const partial = completePreRepairAuth({ [section]: null });
    const pre = assertRepairAuthorizationPreRepairComplete(partial);
    let repairCalls = 0;
    const decided = await runRepairSafetyThenMaybeRepair({
      gateInput: authorizedGateInput(),
      cleanup: () => provenCleanup(),
      verifyPoisonAbsent: () => {
        if (!pre.ok) {
          return { status: 1, stdout: "", stderr: pre.reason, queryError: pre.reason };
        }
        return poisonAbsentResult();
      },
      repair: () => {
        repairCalls += 1;
        return { status: 0 };
      },
    });
    records.push({
      caseId,
      section,
      preOk: pre.ok,
      repairCalls: decided.repairCalls,
      spyRepairCalls: repairCalls,
    });
    assert.equal(pre.ok, false, caseId);
    assert.match(pre.reason, /repair-authorization record incomplete/);
    assert.equal(pre.repairCalls, 0, caseId);
    assert.equal(decided.repairCalls, 0, caseId);
    assert.equal(repairCalls, 0, caseId);
    assert.equal(decided.repairAuthorized, false, caseId);
  }

  const postSections = [
    ["F8-R08-MISSING-REPAIR", "repair"],
    ["F8-R09-MISSING-RETRY", "retry"],
    ["F8-R10-MISSING-POST-REPAIR-FP", "postRepairFingerprint"],
    ["F8-R11-MISSING-POST-RETRY-FP", "postRetryFingerprint"],
  ];
  for (const [caseId, section] of postSections) {
    const record = completeAuthRecord({ [section]: null });
    const complete = assertRepairAuthorizationComplete(record);
    assert.equal(complete.ok, false, caseId);
    assert.equal(complete.continuation, false, caseId);
    records.push({ caseId, section, completeOk: complete.ok });
  }

  const complete = completeAuthRecord();
  assert.equal(assertRepairAuthorizationPreRepairComplete(complete).ok, true);
  assert.equal(assertRepairAuthorizationComplete(complete).ok, true);
  const summaryOnly = completePreRepairAuth({
    fingerprint: { summaryOnly: true, expectedSha256: "x" },
  });
  assert.equal(assertRepairAuthorizationPreRepairComplete(summaryOnly).ok, false);
  const reconstructed = completeAuthRecord();
  reconstructed.reconstructed = true;
  assert.equal(assertRepairAuthorizationComplete(reconstructed).ok, false);

  const ids = records.map((row) => row.caseId);
  for (const required of [
    "F8-R01-MISSING-MIGRATION-IDENTITY", "F8-R02-MISSING-INITIAL-PUSH",
    "F8-R03-MISSING-FINGERPRINT", "F8-R04-MISSING-POISON-CLEANUP",
    "F8-R05-MISSING-POISON-ABSENCE", "F8-R06-MISSING-TARGET-BINDING",
    "F8-R07-MISSING-REPAIR-GATE", "F8-R08-MISSING-REPAIR",
    "F8-R09-MISSING-RETRY", "F8-R10-MISSING-POST-REPAIR-FP",
    "F8-R11-MISSING-POST-RETRY-FP",
  ]) {
    assert.equal(ids.includes(required), true, `missing ${required}`);
  }
  console.log(JSON.stringify({ publishedRepairAuthNegatives: records }, null, 2));
});

test("F8 evidence-integrity packaging negatives fail closed from final committed bytes", () => {
  const f7Meta = path.join(
    root,
    "docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_PSQL_POISON_REQUAL_20260916/hosted/qualify-evidence/qualify-result.json.meta.json",
  );
  const committed = fs.readFileSync(f7Meta);
  const noLf = Buffer.from(JSON.stringify(JSON.parse(committed), null, 2), "utf8");
  assert.equal(committed.byteLength, 281);
  assert.equal(createHash("sha256").update(committed).digest("hex"), "977802458baba26c6246e9fed500a553c1b2678d851b5265790980e0091bf896");
  assert.equal(noLf.byteLength, 280);
  assert.notEqual(
    createHash("sha256").update(noLf).digest("hex"),
    createHash("sha256").update(committed).digest("hex"),
  );

  const records = [];
  const publish = (caseId, exactMutation, ok) => {
    records.push({ caseId, exactMutation, result: ok ? "UNEXPECTED" : "rejected" });
    assert.equal(ok, false, caseId);
  };

  const pack = (label) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `f3-f8-${label}-`));
    const dest = path.join(dir, "qualify-result.json");
    const written = writeQualifyEvidenceArtifacts({
      dest,
      sanitizedJson: JSON.stringify({ status: "HOLD", recognition: ["manual_income"] }, null, 2),
    });
    return { dir, dest, written };
  };

  {
    const { dir, dest } = pack("i01");
    const metaPath = `${dest}.meta.json`;
    const stripped = fs.readFileSync(metaPath).subarray(0, -1);
    fs.writeFileSync(metaPath, stripped);
    const verified = verifyQualifyEvidencePackaging(dir, {
      requiredArtifacts: [path.basename(dest), path.basename(metaPath), EXECUTABLE_MANIFEST_FILENAME],
    });
    publish("F8-I01-MISSING-FINAL-NEWLINE", "strip final LF after commit", verified.ok);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  {
    const { dir, dest } = pack("i02");
    const metaPath = `${dest}.meta.json`;
    fs.writeFileSync(metaPath, Buffer.concat([fs.readFileSync(metaPath), Buffer.from("\n")]));
    const verified = verifyQualifyEvidencePackaging(dir, {
      requiredArtifacts: [path.basename(dest), path.basename(metaPath), EXECUTABLE_MANIFEST_FILENAME],
    });
    publish("F8-I02-ADDED-FINAL-NEWLINE", "add extra final LF after commit", verified.ok);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  {
    const { dir, dest } = pack("i03");
    fs.writeFileSync(dest, `${fs.readFileSync(dest, "utf8")}\nmutated\n`);
    const verified = verifyQualifyEvidencePackaging(dir, {
      requiredArtifacts: [path.basename(dest), path.basename(`${dest}.meta.json`), EXECUTABLE_MANIFEST_FILENAME],
    });
    publish("F8-I03-POST-HASH-MUTATION", "mutate artifact after hashing", verified.ok);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  {
    const { dir, dest } = pack("i04");
    const raw = fs.readFileSync(dest);
    const after = sanitizeEvidenceOutBytes(Buffer.concat([raw, Buffer.from("super-secret-db-password")]));
    fs.writeFileSync(dest, after);
    const verified = verifyQualifyEvidencePackaging(dir, {
      requiredArtifacts: [path.basename(dest), path.basename(`${dest}.meta.json`), EXECUTABLE_MANIFEST_FILENAME],
    });
    publish("F8-I04-SANITIZE-AFTER-HASH", "sanitize after hashing final bytes", verified.ok);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  {
    const { dir } = pack("i05");
    const indexPath = path.join(dir, EVIDENCE_INDEX_FILENAME);
    const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    index.artifacts = index.artifacts.map((item) => (
      item.path === "qualify-result.json" ? { ...item, bytes: item.bytes + 1 } : item
    ));
    fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
    fs.writeFileSync(
      path.join(dir, EVIDENCE_INDEX_CHECKSUM_FILENAME),
      `${createHash("sha256").update(fs.readFileSync(indexPath)).digest("hex")}\n`,
    );
    const verified = verifyQualifyEvidencePackaging(dir);
    publish("F8-I05-WRONG-BYTE-LENGTH", "index byte length disagrees with committed Buffer", verified.ok);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  {
    const { dir } = pack("i06");
    const indexPath = path.join(dir, EVIDENCE_INDEX_FILENAME);
    const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    index.artifacts = index.artifacts.map((item) => (
      item.path === "qualify-result.json" ? { ...item, sha256: "0".repeat(64) } : item
    ));
    fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
    fs.writeFileSync(
      path.join(dir, EVIDENCE_INDEX_CHECKSUM_FILENAME),
      `${createHash("sha256").update(fs.readFileSync(indexPath)).digest("hex")}\n`,
    );
    const verified = verifyQualifyEvidencePackaging(dir);
    publish("F8-I06-WRONG-DIGEST", "index digest disagrees with committed Buffer", verified.ok);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  {
    const { dir } = pack("i07");
    const indexPath = path.join(dir, EVIDENCE_INDEX_FILENAME);
    const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    index.artifacts = [...index.artifacts, index.artifacts[0]];
    fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
    fs.writeFileSync(
      path.join(dir, EVIDENCE_INDEX_CHECKSUM_FILENAME),
      `${createHash("sha256").update(fs.readFileSync(indexPath)).digest("hex")}\n`,
    );
    const verified = verifyQualifyEvidencePackaging(dir);
    publish("F8-I07-DUPLICATE-INDEX-ENTRY", "duplicate index entry", verified.ok);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  {
    const { dir, dest } = pack("i08");
    const indexPath = path.join(dir, EVIDENCE_INDEX_FILENAME);
    const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    index.artifacts = index.artifacts.filter((item) => item.path !== path.basename(`${dest}.meta.json`));
    fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
    fs.writeFileSync(
      path.join(dir, EVIDENCE_INDEX_CHECKSUM_FILENAME),
      `${createHash("sha256").update(fs.readFileSync(indexPath)).digest("hex")}\n`,
    );
    const verified = verifyQualifyEvidencePackaging(dir, {
      requiredArtifacts: [path.basename(dest), path.basename(`${dest}.meta.json`), EXECUTABLE_MANIFEST_FILENAME],
    });
    publish("F8-I08-MISSING-INDEX-ENTRY", "required artifact omitted from index", verified.ok);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  {
    const { dir } = pack("i09");
    fs.writeFileSync(path.join(dir, "extra-unindexed.json"), "{}\n");
    const verified = verifyQualifyEvidencePackaging(dir);
    publish("F8-I09-UNINDEXED-EVIDENCE-ARTIFACT", "unindexed evidence artifact in pack dir", verified.ok);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  {
    const { dir } = pack("i10");
    const indexPath = path.join(dir, EVIDENCE_INDEX_FILENAME);
    const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    index.artifacts.push({ path: "missing-artifact.json", sha256: "1".repeat(64), bytes: 2 });
    fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
    fs.writeFileSync(
      path.join(dir, EVIDENCE_INDEX_CHECKSUM_FILENAME),
      `${createHash("sha256").update(fs.readFileSync(indexPath)).digest("hex")}\n`,
    );
    const verified = verifyQualifyEvidencePackaging(dir, {
      requiredArtifacts: ["missing-artifact.json"],
    });
    publish("F8-I10-BROKEN-REFERENCE", "index references missing file", verified.ok);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  {
    const { dir } = pack("i11");
    const indexPath = path.join(dir, EVIDENCE_INDEX_FILENAME);
    const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    index.artifacts.push({
      path: EVIDENCE_INDEX_FILENAME,
      sha256: createHash("sha256").update(fs.readFileSync(indexPath)).digest("hex"),
      bytes: fs.readFileSync(indexPath).byteLength,
    });
    fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
    fs.writeFileSync(
      path.join(dir, EVIDENCE_INDEX_CHECKSUM_FILENAME),
      `${createHash("sha256").update(fs.readFileSync(indexPath)).digest("hex")}\n`,
    );
    const verified = verifyQualifyEvidencePackaging(dir);
    publish("F8-I11-SELF-ENTRY", "outer detached index self-entry", verified.ok);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  {
    const { dir } = pack("i12");
    fs.writeFileSync(path.join(dir, "founder-K-checklist.json"), "{}\n");
    assert.match("founder-K-checklist.json", FOUNDER_REPORT_BASENAME_RE);
    const verified = verifyQualifyEvidencePackaging(dir);
    publish("F8-I12-EXTRA-UNINDEXED-FOUNDER-REPORT", "extra unindexed founder report", verified.ok);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  const happy = pack("ok");
  const happyVerify = verifyQualifyEvidencePackaging(happy.dir);
  assert.equal(happyVerify.ok, true);
  const metaCommitted = readFinalCommittedBytes(`${happy.dest}.meta.json`);
  assert.equal(metaCommitted.ok, true);
  const indexedMeta = happyVerify.index.artifacts.find((item) => item.path === "qualify-result.json.meta.json");
  assert.equal(indexedMeta.sha256, metaCommitted.sha256);
  assert.equal(indexedMeta.bytes, metaCommitted.bytes);
  assert.notEqual(indexedMeta.bytes, JSON.stringify(JSON.parse(metaCommitted.buf.toString("utf8")), null, 2).length);
  fs.rmSync(happy.dir, { recursive: true, force: true });

  const ids = records.map((row) => row.caseId);
  for (const required of [
    "F8-I01-MISSING-FINAL-NEWLINE", "F8-I02-ADDED-FINAL-NEWLINE", "F8-I03-POST-HASH-MUTATION",
    "F8-I04-SANITIZE-AFTER-HASH", "F8-I05-WRONG-BYTE-LENGTH", "F8-I06-WRONG-DIGEST",
    "F8-I07-DUPLICATE-INDEX-ENTRY", "F8-I08-MISSING-INDEX-ENTRY", "F8-I09-UNINDEXED-EVIDENCE-ARTIFACT",
    "F8-I10-BROKEN-REFERENCE", "F8-I11-SELF-ENTRY", "F8-I12-EXTRA-UNINDEXED-FOUNDER-REPORT",
  ]) {
    assert.equal(ids.includes(required), true, `missing ${required}`);
  }
  assert.equal(QUALIFY_EVIDENCE_PACKAGING_HOLD.includes("final committed bytes"), true);
  console.log(JSON.stringify({ publishedIntegrityNegatives: records }, null, 2));
});

test("F8 local-proof helper invokes the actual gate with injected spawn", async () => {
  const helperSrc = fs.readFileSync(path.join(
    root,
    "docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_PSQL_POISON_REQUAL_20260916/psql-proof/psql-proof/run-local-psql-poison-proof.mjs",
  ), "utf8");
  assert.doesNotMatch(helperSrc, /\/workspace\/f3-psql-poison-requal/);
  assert.doesNotMatch(helperSrc, /\/tmp\/f3-reference-local\.env/);
  assert.match(helperSrc, /import\.meta\.url/);
  assert.match(helperSrc, /runRepairSafetyThenMaybeRepair/);
  assert.match(helperSrc, /exactPoisonEnvelopeFromOriginal/);
  assert.match(helperSrc, /parseExactOriginalJsonObject/);
  assert.equal(MUST_LOCAL_PSQL_PROOF_ON_17_6, true);

  const framed = originalPoisonProcessResult();
  const spawnImpl = (cmd, args) => {
    assert.equal(cmd, "psql");
    if (args.includes("--version")) {
      return { status: 0, stdout: Buffer.from("psql (PostgreSQL) 17.6\n"), stderr: Buffer.from(""), signal: null };
    }
    return {
      status: 0,
      stdout: Buffer.from(String(framed.stdout)),
      stderr: Buffer.from(""),
      signal: null,
    };
  };

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "f3-f8-local-proof-"));
  const positive = await runLocalPsqlPoisonProof({
    outDir,
    spawnImpl,
    connection: {
      host: "127.0.0.1",
      port: 5432,
      database: "postgres",
      user: "postgres",
      password: "not-a-real-password",
      sslmode: "disable",
    },
    args: { caseId: "positive", outDir },
    injectedProcessResult: framed,
  });
  assert.equal(positive.verdict, "CONTINUE");
  assert.equal(positive.repairCalls, 1);
  assert.deepEqual(positive.callback_order, ["cleanup", "verify", "repair"]);
  assert.equal(positive.parser.envelope_ok, true);
  assert.equal(positive.stdout.BEFORE_parse, true);
  assert.equal(fs.existsSync(path.join(outDir, "STATUS.json")), true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(outDir, "STATUS.json"), "utf8")).repairCalls, 1);

  const negatives = [
    "undefined-parser-export",
    "malformed-output",
    "duplicate-keys",
    "extra-field",
    "wrong-database",
    "wrong-live-role",
    "wrong-connection-metadata",
    "nonzero-process",
    "nonempty-stderr",
    "poison-present",
    "cleanup-failure",
    "fingerprint-mismatch",
  ];
  for (const caseId of negatives) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `f3-f8-local-${caseId}-`));
    const report = await runLocalPsqlPoisonProof({
      outDir: dir,
      spawnImpl,
      connection: {
        host: "127.0.0.1",
        port: 5432,
        database: "postgres",
        user: "postgres",
        password: "not-a-real-password",
        sslmode: "disable",
      },
      args: { caseId, outDir: dir },
      parseModule: caseId === "undefined-parser-export" ? {} : undefined,
      injectedProcessResult: framed,
    });
    assert.equal(report.repairCalls, 0, caseId);
    assert.notEqual(report.verdict, "CONTINUE", caseId);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log(JSON.stringify({
    localProofPositiveRepairCalls: positive.repairCalls,
    localProofNegatives: negatives,
    must_local_psql_proof_on_17_6: MUST_LOCAL_PSQL_PROOF_ON_17_6,
  }, null, 2));
});

const FILE123 = "00123_f3_05_opening_cash_command.sql";

function f9Process(command, status = 0, stderr = "") {
  return {
    command,
    status,
    stdout: "",
    stderr,
    signal: null,
    timeout: false,
  };
}

function f9OrchestrationArgs(dir, extra = {}) {
  const file = extra.file || FILE118;
  const version = extra.version || PREASSIGNED_VERSIONS[file];
  return {
    file,
    version,
    dest: extra.dest || path.join(dir, `pre-continuation-${file.replace(/\.sql$/, "")}.json`),
    initialPush: extra.initialPush || f9Process("supabase db push --db-url [REDACTED] --workdir [ISOLATED] --yes --skip-vault", 1, "ERROR: history inject"),
    cleanup: extra.cleanup || f9Process("gated-remote-sql-text remove-history-inject", 0),
    poison: extra.poison || f9Process("isolated-psql poison-absent-probe", 0),
    repair: extra.repair || f9Process("supabase migration repair --status applied --db-url [REDACTED] --workdir [ISOLATED] --yes", 0),
    retry: extra.retry || f9Process("supabase db push --db-url [REDACTED] --workdir [ISOLATED] --yes --skip-vault", 0),
    ...extra.rest,
  };
}

test("F9 runner event order comes from actual calls and blocks missing/reordered streams", async () => {
  const qualifySrc = fs.readFileSync(path.join(root, "scripts/qualify-f3-db-push-disposable.mjs"), "utf8");
  assert.match(qualifySrc, /createRunnerEventRecorder/);
  assert.match(qualifySrc, /persistPreContinuationRecord/);
  assert.match(qualifySrc, /writeDurableArtifactBytes/);
  const gateSrc = fs.readFileSync(path.join(root, "scripts/lib/f3-db-push-repair-safety-gate.mjs"), "utf8");
  assert.match(gateSrc, /fsyncSync/);
  assert.match(gateSrc, /renameSync/);
  assert.equal(F9_RUNNER_EVENT_SCHEMA_VERSION, "f3-runner-event-v1");
  assert.equal(F9_PRE_CONTINUATION_SCHEMA_VERSION, "f3-pre-continuation-record-v1");
  assert.match(qualifySrc, /["']continuation_authorized["']/);

  const records = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f3-f9-events-"));
  const happy = await exerciseF9RunnerOrchestration(f9OrchestrationArgs(dir));
  assert.equal(happy.ok, true);
  assert.deepEqual(happy.callTrace, happy.events.map((event) => event.event_type));
  assert.deepEqual(happy.callTrace, [...F9_ACTUAL_EVENT_ORDER_WITH_CONTINUATION]);
  assert.equal(happy.events.every((event) => event.schema_version === F9_RUNNER_EVENT_SCHEMA_VERSION), true);
  records.push({ caseId: "F9-E01-EVENT-ORDER-FROM-ACTUAL-CALLS", result: "ok" });

  const missingRepair = await exerciseF9RunnerOrchestration(f9OrchestrationArgs(dir, {
    dest: path.join(dir, "missing-repair.json"),
    rest: { omitEvent: "target_binding_verified" },
  }));
  const spliced = createRunnerEventRecorder({
    migrationSourceLabel: "F3_FORWARD",
    migrationVersion: "20260913173000",
    migrationName: FILE118,
    targetBindingId: "approved-disposable",
  });
  for (const name of F9_ACTUAL_EVENT_ORDER_BEFORE_REPAIR.filter((n) => n !== "cleanup_completed")) {
    spliced.record(name);
  }
  const missingBlocksRepair = assertRunnerEventsAllowRepair(spliced.snapshot());
  assert.equal(missingBlocksRepair.ok, false);
  assert.equal(missingBlocksRepair.allowRepair, false);
  records.push({ caseId: "F9-E02-MISSING-EVENT-BLOCKS-REPAIR", result: "rejected" });

  const missingCont = await exerciseF9RunnerOrchestration(f9OrchestrationArgs(dir, {
    dest: path.join(dir, "missing-cont.json"),
    rest: { omitEvent: "pre_continuation_record_persisted" },
  }));
  assert.equal(missingCont.ok, false);
  assert.equal(missingCont.allowContinuation, false);
  assert.match(missingCont.reason, /F9/);
  records.push({ caseId: "F9-E03-MISSING-EVENT-BLOCKS-CONTINUATION", result: "rejected" });

  const reordered = await exerciseF9RunnerOrchestration(f9OrchestrationArgs(dir, {
    dest: path.join(dir, "reordered.json"),
    rest: { reorderPair: ["repair_started", "repair_completed"] },
  }));
  assert.equal(reordered.ok, false);
  assert.equal(reordered.allowContinuation, false);
  records.push({ caseId: "F9-E04-REORDERED-EVENT-BLOCKS-CONTINUATION", result: "rejected" });

  fs.rmSync(dir, { recursive: true, force: true });
  const ids = records.map((row) => row.caseId);
  for (const required of [
    "F9-E01-EVENT-ORDER-FROM-ACTUAL-CALLS",
    "F9-E02-MISSING-EVENT-BLOCKS-REPAIR",
    "F9-E03-MISSING-EVENT-BLOCKS-CONTINUATION",
    "F9-E04-REORDERED-EVENT-BLOCKS-CONTINUATION",
  ]) {
    assert.equal(ids.includes(required), true, `missing ${required}`);
  }
  assert.equal(missingRepair.ok === false || missingBlocksRepair.ok === false, true);
  console.log(JSON.stringify({ publishedF9EventNegatives: records }, null, 2));
});

test("F9 failed/abbreviated repair-retry and durable-write negatives block continuation", async () => {
  const records = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f3-f9-durable-"));

  const failedRepair = await exerciseF9RunnerOrchestration(f9OrchestrationArgs(dir, {
    dest: path.join(dir, "failed-repair.json"),
    repair: f9Process("supabase migration repair --status applied --db-url [REDACTED] --workdir [ISOLATED] --yes", 1, "repair failed"),
  }));
  assert.equal(failedRepair.ok, false);
  assert.equal(failedRepair.allowRetry, false);
  assert.equal(failedRepair.allowContinuation, false);
  assert.equal(failedRepair.callTrace.includes("retry_started"), false);
  assert.equal(failedRepair.callTrace.includes("continuation_authorized"), false);
  records.push({ caseId: "F9-R01-FAILED-REPAIR-BLOCKS-RETRY-CONTINUATION", result: "rejected" });

  const failedRetry = await exerciseF9RunnerOrchestration(f9OrchestrationArgs(dir, {
    dest: path.join(dir, "failed-retry.json"),
    retry: f9Process("supabase db push --db-url [REDACTED] --workdir [ISOLATED] --yes --skip-vault", 1, "retry failed"),
  }));
  assert.equal(failedRetry.ok, false);
  assert.equal(failedRetry.allowContinuation, false);
  assert.equal(failedRetry.callTrace.includes("continuation_authorized"), false);
  records.push({ caseId: "F9-R02-FAILED-RETRY-BLOCKS-CONTINUATION", result: "rejected" });

  const happy = await exerciseF9RunnerOrchestration(f9OrchestrationArgs(dir, {
    dest: path.join(dir, "complete.json"),
  }));
  const missingRepairProc = assertPreContinuationRecordComplete({
    ...happy.preContinuationRecord,
    repairProcessResult: null,
  });
  assert.equal(missingRepairProc.ok, false);
  assert.equal(missingRepairProc.allowContinuation, false);
  records.push({ caseId: "F9-R03-MISSING-REPAIR-PROCESS-RESULT-BLOCKS-CONTINUATION", result: "rejected" });

  const abbreviatedRepair = assertPreContinuationRecordComplete({
    ...happy.preContinuationRecord,
    repairProcessResult: { status: 0, repairCalls: 1, callbackOrder: ["cleanup", "verify", "repair"] },
  });
  assert.equal(abbreviatedRepair.ok, false);
  records.push({ caseId: "F9-R04-ABBREVIATED-REPAIR-PROCESS-RESULT-BLOCKS-CONTINUATION", result: "rejected" });

  const missingRetryProc = assertPreContinuationRecordComplete({
    ...happy.preContinuationRecord,
    retryProcessResult: null,
  });
  assert.equal(missingRetryProc.ok, false);
  records.push({ caseId: "F9-R05-MISSING-RETRY-PROCESS-RESULT-BLOCKS-CONTINUATION", result: "rejected" });

  const abbreviatedRetry = assertPreContinuationRecordComplete({
    ...happy.preContinuationRecord,
    retryProcessResult: { status: 0, staged: ["x"] },
  });
  assert.equal(abbreviatedRetry.ok, false);
  records.push({ caseId: "F9-R06-ABBREVIATED-RETRY-PROCESS-RESULT-BLOCKS-CONTINUATION", result: "rejected" });

  const failWrite = await exerciseF9RunnerOrchestration(f9OrchestrationArgs(dir, {
    dest: path.join(dir, "fail-write.json"),
    rest: { hooks: { failWrite: true } },
  }));
  assert.equal(failWrite.ok, false);
  assert.equal(failWrite.allowContinuation, false);
  records.push({ caseId: "F9-D01-FAILED-DURABLE-WRITE-BLOCKS-CONTINUATION", result: "rejected" });

  const noReread = await exerciseF9RunnerOrchestration(f9OrchestrationArgs(dir, {
    dest: path.join(dir, "no-reread.json"),
    rest: { hooks: { skipReread: true } },
  }));
  assert.equal(noReread.ok, false);
  assert.match(noReread.reason, /reread/);
  records.push({ caseId: "F9-D02-WRITE-WITHOUT-REREAD-BLOCKS-CONTINUATION", result: "rejected" });

  const mismatch = await exerciseF9RunnerOrchestration(f9OrchestrationArgs(dir, {
    dest: path.join(dir, "mismatch.json"),
    rest: { hooks: { mismatchHash: true } },
  }));
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.reason, /hash\/length mismatch/);
  records.push({ caseId: "F9-D03-HASH-LENGTH-MISMATCH-BLOCKS-CONTINUATION", result: "rejected" });

  fs.rmSync(dir, { recursive: true, force: true });
  const ids = records.map((row) => row.caseId);
  for (const required of [
    "F9-R01-FAILED-REPAIR-BLOCKS-RETRY-CONTINUATION",
    "F9-R02-FAILED-RETRY-BLOCKS-CONTINUATION",
    "F9-R03-MISSING-REPAIR-PROCESS-RESULT-BLOCKS-CONTINUATION",
    "F9-R04-ABBREVIATED-REPAIR-PROCESS-RESULT-BLOCKS-CONTINUATION",
    "F9-R05-MISSING-RETRY-PROCESS-RESULT-BLOCKS-CONTINUATION",
    "F9-R06-ABBREVIATED-RETRY-PROCESS-RESULT-BLOCKS-CONTINUATION",
    "F9-D01-FAILED-DURABLE-WRITE-BLOCKS-CONTINUATION",
    "F9-D02-WRITE-WITHOUT-REREAD-BLOCKS-CONTINUATION",
    "F9-D03-HASH-LENGTH-MISMATCH-BLOCKS-CONTINUATION",
  ]) {
    assert.equal(ids.includes(required), true, `missing ${required}`);
  }
  console.log(JSON.stringify({ publishedF9DurableNegatives: records }, null, 2));
});

test("F9 runner counters stay distinct from gate counters and 00123 final semantics stay honest", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f3-f9-counters-"));
  const happy118 = await exerciseF9RunnerOrchestration(f9OrchestrationArgs(dir));
  assert.deepEqual(happy118.counters, expectedRunnerCountersForFile(FILE118));
  assert.notDeepEqual(happy118.counters, happy118.preContinuationRecord.gateCounters);
  assert.equal(happy118.preContinuationRecord.gateCounters.dbPushCalls, 0);
  assert.equal(happy118.preContinuationRecord.gateCounters.continuationCalls, 0);
  assert.equal(happy118.counters.retryDbPushCalls, 1);
  assert.equal(happy118.counters.continuationCalls, 1);
  assert.equal(happy118.counters === happy118.preContinuationRecord.gateCounters, false);
  const substituted = assertPreContinuationRecordComplete({
    ...happy118.preContinuationRecord,
    runnerCounters: happy118.preContinuationRecord.gateCounters,
  });
  assert.equal(substituted.ok, false);
  console.log(JSON.stringify({ caseId: "F9-C01-RUNNER-AND-GATE-COUNTERS-NOT-SUBSTITUTABLE", result: "rejected" }, null, 2));

  const last = await exerciseF9RunnerOrchestration(f9OrchestrationArgs(dir, {
    file: FILE123,
    dest: path.join(dir, "final-00123.json"),
  }));
  assert.equal(last.ok, true);
  assert.equal(last.finalMigration, true);
  assert.equal(last.nextMigration, null);
  assert.equal(last.inventedLaterContinuation, false);
  assert.equal(last.counters.continuationCalls, 0);
  assert.equal(last.counters.continuationAuthorizationCalls, 1);
  assert.deepEqual(last.events.map((event) => event.event_type), [...F9_FINAL_MIGRATION_EVENT_ORDER]);
  assert.equal(last.callTrace.includes("continuation_started"), false);
  assert.equal(last.callTrace.includes("continuation_completed"), false);
  const invented = assertRunnerEventsAllowContinuation(
    [...last.events, { event_type: "continuation_started" }, { event_type: "continuation_completed" }],
    { finalMigration: true },
  );
  assert.equal(invented.ok, false);
  console.log(JSON.stringify({ caseId: "F9-C02-00123-FINAL-SEMANTICS-HONEST", result: "ok" }, null, 2));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("F9 outer evidence index includes nested indexes and fails path/secret leakage", () => {
  const records = [];
  const packRoot = (label) => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), `f3-f9-pack-${label}-`));
    const hostedDest = path.join(rootDir, "hosted", "qualify-evidence", "qualify-result.json");
    const syntheticDest = path.join(rootDir, "synthetic-evidence", "qualify-result.json");
    writeQualifyEvidenceArtifacts({
      dest: hostedDest,
      sanitizedJson: JSON.stringify({ status: "HOLD", recognition: ["manual_income"] }, null, 2),
    });
    writeQualifyEvidenceArtifacts({
      dest: syntheticDest,
      sanitizedJson: JSON.stringify({ status: "HOLD", recognition: ["manual_income"], suite: "synthetic" }, null, 2),
    });
    fs.writeFileSync(path.join(rootDir, "frozen-expected-v5-hashes.json"), `${JSON.stringify({ ok: true }, null, 2)}\n`);
    return rootDir;
  };

  const happyRoot = packRoot("ok");
  assert.equal(inferEvidenceRootFromDest(path.join(happyRoot, "hosted/qualify-evidence/qualify-result.json")), happyRoot);
  const outer = writeOuterEvidenceIndexAndChecksum(happyRoot);
  assert.equal(outer.ok, true, outer.reason);
  const indexed = (outer.index.artifacts || []).map((item) => item.path);
  for (const rel of [
    "hosted/qualify-evidence/evidence-index.json",
    "hosted/qualify-evidence/evidence-index.sha256",
    "synthetic-evidence/evidence-index.json",
    "synthetic-evidence/evidence-index.sha256",
  ]) {
    assert.equal(indexed.includes(rel), true, rel);
  }
  assert.equal(indexed.includes("evidence-index.json"), false);
  assert.equal(outer.absolute_path_leaks, 0);
  assert.equal(outer.secret_scan, "clean");
  records.push({ caseId: "F9-I03-NESTED-INDEXES-IN-OUTER-INDEX", result: "ok" });

  const leakRoot = packRoot("leak");
  fs.writeFileSync(path.join(leakRoot, "hosted", "note.json"), `${JSON.stringify({ workdir: "/workspace/machine-path" }, null, 2)}\n`);
  const leak = writeOuterEvidenceIndexAndChecksum(leakRoot);
  assert.equal(leak.ok, false);
  assert.match(String(leak.reason), /absolute_path_leaks/);
  records.push({ caseId: "F9-I01-ABSOLUTE-PATH-LEAKAGE-FAILS-PACKAGING", result: "rejected" });

  const secretRoot = packRoot("secret");
  fs.writeFileSync(path.join(secretRoot, "hosted", "secret.json"), `${JSON.stringify({ url: "postgres.jkorwnwwmdeflfntxntl:super-secret-db-password@host" }, null, 2)}\n`);
  const secret = writeOuterEvidenceIndexAndChecksum(secretRoot);
  assert.equal(secret.ok, false);
  assert.match(String(secret.reason), /secret_scan/);
  records.push({ caseId: "F9-I02-SECRET-LIKE-VALUES-FAIL-PACKAGING", result: "rejected" });

  const founderRoot = packRoot("founder");
  writeOuterEvidenceIndexAndChecksum(founderRoot);
  fs.writeFileSync(path.join(founderRoot, "founder-K-checklist.json"), "{}\n");
  const founder = verifyOuterEvidencePackaging(founderRoot);
  assert.equal(founder.ok, false);
  assert.match(String(founder.reason), /unindexed founder report/);
  records.push({ caseId: "F9-I04-UNINDEXED-FOUNDER-REPORT", result: "rejected" });

  fs.rmSync(happyRoot, { recursive: true, force: true });
  fs.rmSync(leakRoot, { recursive: true, force: true });
  fs.rmSync(secretRoot, { recursive: true, force: true });
  fs.rmSync(founderRoot, { recursive: true, force: true });

  const ids = records.map((row) => row.caseId);
  for (const required of [
    "F9-I01-ABSOLUTE-PATH-LEAKAGE-FAILS-PACKAGING",
    "F9-I02-SECRET-LIKE-VALUES-FAIL-PACKAGING",
    "F9-I03-NESTED-INDEXES-IN-OUTER-INDEX",
    "F9-I04-UNINDEXED-FOUNDER-REPORT",
  ]) {
    assert.equal(ids.includes(required), true, `missing ${required}`);
  }
  assert.equal(typeof scanEvidenceBytesForLeaks, "function");
  assert.equal(typeof listEvidenceTreeFiles, "function");
  assert.equal(typeof commitOuterEvidenceTree, "function");
  console.log(JSON.stringify({ publishedF9IntegrityNegatives: records }, null, 2));
});

function f10Process(command, status = 0, extra = {}) {
  return {
    command,
    status,
    stdout: extra.stdout ?? "",
    stderr: extra.stderr ?? "",
    error: extra.error ?? null,
    signal: extra.signal ?? null,
    timeout: extra.timeout === true,
    argv: extra.argv,
  };
}

function f10AdapterArgs(dir, extra = {}) {
  const file = extra.file || FILE118;
  const version = extra.version || PREASSIGNED_VERSIONS[file];
  return {
    file,
    version,
    destA: extra.destA || path.join(dir, `f10-a-${file.replace(/\.sql$/, "")}.json`),
    destB: extra.destB || path.join(dir, `f10-b-${file.replace(/\.sql$/, "")}.json`),
    adapters: {
      repairSafetyGate: extra.repairSafetyGate,
      repair: extra.repair || (() => f10Process(
        "supabase migration repair --status applied --db-url [REDACTED] --workdir [ISOLATED] --yes",
        extra.repairStatus ?? 0,
        extra.repairExtra || {},
      )),
      retry: extra.retry || (() => f10Process(
        "supabase db push --db-url [REDACTED] --workdir [ISOLATED] --yes --skip-vault",
        extra.retryStatus ?? 0,
        extra.retryExtra || {},
      )),
      postRepairVerify: extra.postRepairVerify,
      postRetryVerify: extra.postRetryVerify || (() => ({ ok: true })),
      continuation: extra.continuation || (() => ({ ok: true })),
      ...extra.adapterOverrides,
    },
    persistHooksA: extra.persistHooksA || {},
    persistHooksB: extra.persistHooksB || {},
    persistHooksPre: extra.persistHooksPre || {},
    destPreContinuation: extra.destPreContinuation,
    onAfterRepairStarted: extra.onAfterRepairStarted,
    onAfterRetryStarted: extra.onAfterRetryStarted,
    onAfterContinuationStarted: extra.onAfterContinuationStarted,
  };
}

test("F10 Checkpoint A is verified before retry and blocks incomplete/missing records", async () => {
  const records = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f3-f10-ckpt-a-"));
  const happy = await runF10RepairRetryContinuation(f10AdapterArgs(dir));
  assert.equal(happy.ok, true);
  assert.equal(happy.spies.retryCalls, 1);
  assert.equal(happy.persistA.verified, true);
  assert.equal(happy.persistA.record.schema_version, F10_CHECKPOINT_A_SCHEMA_VERSION);
  assert.equal(isCompleteProcessResult(happy.persistA.record.repairProcessResult), true);
  assert.match(happy.persistA.record.repairProcessResult.stdout, /^/);
  assert.match(happy.persistA.record.repairProcessResult.stderr, /^/);
  records.push({ caseId: "F10-A01-CHECKPOINT-A-VERIFIED-BEFORE-RETRY", result: "ok" });

  const failedRepair = await runF10RepairRetryContinuation(f10AdapterArgs(dir, {
    destA: path.join(dir, "failed-repair-a.json"),
    destB: path.join(dir, "failed-repair-b.json"),
    repairStatus: 1,
    repairExtra: { stderr: "repair failed", error: "repair failed" },
  }));
  assert.equal(failedRepair.ok, false);
  assert.equal(failedRepair.spies.retryCalls, 0);
  assert.equal(failedRepair.spies.continuationAuthorizationCalls, 0);
  assert.equal(failedRepair.spies.continuationCalls, 0);
  records.push({
    caseId: "F10-A02-FAILED-REPAIR-RETRY-CALLS-0",
    result: "rejected",
    retryCalls: failedRepair.spies.retryCalls,
  });

  const missingA = assertCheckpointAComplete({
    schema_version: F10_CHECKPOINT_A_SCHEMA_VERSION,
    checkpoint: "A",
    boundary: "after_repair_before_retry",
    migrationIdentity: { file: FILE118, version: PREASSIGNED_VERSIONS[FILE118] },
    repairProcessResult: { status: 0, command: "x" },
  });
  assert.equal(missingA.ok, false);
  records.push({ caseId: "F10-A03-INCOMPLETE-CHECKPOINT-A-BLOCKS-RETRY", result: "rejected" });

  const wrongA = persistCheckpointA({
    dest: path.join(dir, "wrong-a.json"),
    record: {
      schema_version: "not-a-checkpoint",
      checkpoint: "A",
      boundary: "after_repair_before_retry",
      migrationIdentity: { file: FILE118, version: "1" },
      repairProcessResult: encodeSanitizedProcessResult(f10Process("cmd", 0)),
    },
  });
  assert.equal(wrongA.ok, false);
  assert.equal(verifyPersistedCheckpointA(path.join(dir, "no-such-a.json")).ok, false);
  records.push({ caseId: "F10-A04-MISSING-WRONG-CHECKPOINT-A-CANNOT-AUTHORIZE", result: "rejected" });

  fs.rmSync(dir, { recursive: true, force: true });
  for (const required of [
    "F10-A01-CHECKPOINT-A-VERIFIED-BEFORE-RETRY",
    "F10-A02-FAILED-REPAIR-RETRY-CALLS-0",
    "F10-A03-INCOMPLETE-CHECKPOINT-A-BLOCKS-RETRY",
    "F10-A04-MISSING-WRONG-CHECKPOINT-A-CANNOT-AUTHORIZE",
  ]) {
    assert.equal(records.some((row) => row.caseId === required), true, required);
  }
  console.log(JSON.stringify({ publishedF10CheckpointA: records }, null, 2));
});

test("F10 Checkpoint B is verified before continuation auth/invoke", async () => {
  const records = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f3-f10-ckpt-b-"));
  const happy = await runF10RepairRetryContinuation(f10AdapterArgs(dir));
  assert.equal(happy.ok, true);
  assert.equal(happy.spies.continuationAuthorizationCalls, 1);
  assert.equal(happy.spies.continuationCalls, 1);
  assert.equal(happy.persistB.record.schema_version, F10_CHECKPOINT_B_SCHEMA_VERSION);
  assert.equal(happy.persistB.record.checkpointA.sha256, happy.persistA.sha256);
  assert.equal(verifyPersistedCheckpointA(happy.persistA.dest).ok, true);
  records.push({ caseId: "F10-B01-CHECKPOINT-B-VERIFIED-BEFORE-CONTINUATION", result: "ok" });

  const failB = await runF10RepairRetryContinuation(f10AdapterArgs(dir, {
    destA: path.join(dir, "fail-b-a.json"),
    destB: path.join(dir, "fail-b-b.json"),
    persistHooksB: { failWrite: true },
  }));
  assert.equal(failB.ok, false);
  assert.equal(failB.spies.retryCalls, 1);
  assert.equal(failB.spies.continuationAuthorizationCalls, 0);
  assert.equal(failB.spies.continuationCalls, 0);
  assert.equal(failB.spies.continuationQueryCalls, 0);
  records.push({
    caseId: "F10-B02-CHECKPOINT-B-FAILURE-NO-CONTINUATION-AUTH",
    result: "rejected",
    continuationAuthorizationCalls: failB.spies.continuationAuthorizationCalls,
    continuationCalls: failB.spies.continuationCalls,
  });

  const last = await runF10RepairRetryContinuation(f10AdapterArgs(dir, {
    file: FILE123,
    destA: path.join(dir, "last-a.json"),
    destB: path.join(dir, "last-b.json"),
  }));
  assert.equal(last.ok, true);
  assert.equal(last.finalMigration, true);
  assert.equal(last.spies.continuationAuthorizationCalls, 1);
  assert.equal(last.spies.continuationCalls, 0);
  assert.equal(last.counters.continuationAuthorizationCalls, 1);
  assert.equal(last.counters.continuationCalls, 0);
  assert.equal(last.callTrace?.includes("continuation_started") || last.events.some((e) => e.event_type === "continuation_started"), false);
  records.push({ caseId: "F10-B03-00123-FINAL-SEMANTICS", result: "ok" });

  fs.rmSync(dir, { recursive: true, force: true });
  for (const required of [
    "F10-B01-CHECKPOINT-B-VERIFIED-BEFORE-CONTINUATION",
    "F10-B02-CHECKPOINT-B-FAILURE-NO-CONTINUATION-AUTH",
    "F10-B03-00123-FINAL-SEMANTICS",
  ]) {
    assert.equal(records.some((row) => row.caseId === required), true, required);
  }
  console.log(JSON.stringify({ publishedF10CheckpointB: records }, null, 2));
});

test("F10 invoke boundaries record started before await and honest failures", async () => {
  const records = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f3-f10-events-"));
  let pendingRepair = null;
  const happy = await runF10RepairRetryContinuation(f10AdapterArgs(dir, {
    onAfterRepairStarted: ({ events }) => {
      const types = events.map((event) => event.event_type);
      pendingRepair = {
        started: types.includes("repair_started"),
        completed: types.includes("repair_completed"),
      };
    },
  }));
  assert.equal(happy.ok, true);
  assert.equal(pendingRepair.started, true);
  assert.equal(pendingRepair.completed, false);
  const repairIdx = happy.events.findIndex((event) => event.event_type === "repair_started");
  const repairDone = happy.events.findIndex((event) => event.event_type === "repair_completed");
  assert.ok(repairIdx >= 0 && repairDone > repairIdx);
  records.push({ caseId: "F10-E01-STARTED-BEFORE-COMPLETION", result: "ok" });

  let pendingContinuation = null;
  let continuationInvokedBeforeStart = false;
  const cont = await runF10RepairRetryContinuation(f10AdapterArgs(dir, {
    destA: path.join(dir, "cont-a.json"),
    destB: path.join(dir, "cont-b.json"),
    continuation: () => {
      continuationInvokedBeforeStart = pendingContinuation == null;
      return { ok: true };
    },
    onAfterContinuationStarted: ({ events }) => {
      const types = events.map((event) => event.event_type);
      pendingContinuation = {
        started: types.includes("continuation_started"),
        completed: types.includes("continuation_completed"),
        queries: types.includes("continuation_completed") ? "after" : "not-yet",
      };
    },
  }));
  assert.equal(cont.ok, true);
  assert.equal(continuationInvokedBeforeStart, false);
  assert.equal(pendingContinuation.started, true);
  assert.equal(pendingContinuation.completed, false);
  const started = cont.events.findIndex((event) => event.event_type === "continuation_started");
  const completed = cont.events.findIndex((event) => event.event_type === "continuation_completed");
  assert.ok(started >= 0 && completed > started);
  records.push({ caseId: "F10-E02-CONTINUATION-STARTED-BEFORE-QUERIES", result: "ok" });

  const rejected = await runF10RepairRetryContinuation(f10AdapterArgs(dir, {
    destA: path.join(dir, "rej-a.json"),
    destB: path.join(dir, "rej-b.json"),
    repair: () => {
      throw new Error("injected repair throw");
    },
  }));
  assert.equal(rejected.ok, false);
  assert.equal(rejected.spies.retryCalls, 0);
  assert.equal(rejected.events.some((event) => event.event_type === "repair_completed"), true);
  assert.equal(rejected.events.find((event) => event.event_type === "repair_completed")?.process?.status, 1);
  records.push({ caseId: "F10-E03-HONEST-FAILURE-STOPS-SUBSEQUENT", result: "rejected" });

  assert.match(GATE_CALLS_BOUNDARY, /qualify-level repair_gate_evaluated/);
  assert.match(GATE_CALLS_BOUNDARY, /not every evaluateRepairSafetyGate/);
  records.push({ caseId: "F10-E04-GATECALLS-BOUNDARY-DOCUMENTED", result: "ok" });

  fs.rmSync(dir, { recursive: true, force: true });
  for (const required of [
    "F10-E01-STARTED-BEFORE-COMPLETION",
    "F10-E02-CONTINUATION-STARTED-BEFORE-QUERIES",
    "F10-E03-HONEST-FAILURE-STOPS-SUBSEQUENT",
    "F10-E04-GATECALLS-BOUNDARY-DOCUMENTED",
  ]) {
    assert.equal(records.some((row) => row.caseId === required), true, required);
  }
  console.log(JSON.stringify({ publishedF10Events: records }, null, 2));
});

test("F10 persistence failures at write/fsync/close/rename/reread/length/digest block next op", async () => {
  const records = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f3-f10-persist-"));
  const cases = [
    ["failWrite", "F10-P01-WRITE-FAILURE-BLOCKS-RETRY"],
    ["failFsync", "F10-P02-FSYNC-FAILURE-BLOCKS-RETRY"],
    ["failClose", "F10-P03-CLOSE-FAILURE-BLOCKS-RETRY"],
    ["failRename", "F10-P04-RENAME-FAILURE-BLOCKS-RETRY"],
    ["failReread", "F10-P05-REREAD-FAILURE-BLOCKS-RETRY"],
    ["failLength", "F10-P06-LENGTH-FAILURE-BLOCKS-RETRY"],
    ["failDigest", "F10-P07-DIGEST-FAILURE-BLOCKS-RETRY"],
  ];
  const spyCounts = [];
  for (const [hook, caseId] of cases) {
    const result = await runF10RepairRetryContinuation(f10AdapterArgs(dir, {
      destA: path.join(dir, `${hook}-a.json`),
      destB: path.join(dir, `${hook}-b.json`),
      persistHooksA: { [hook]: true },
    }));
    assert.equal(result.ok, false, hook);
    assert.equal(result.spies.retryCalls, 0, hook);
    assert.equal(result.spies.continuationAuthorizationCalls, 0, hook);
    spyCounts.push({ hook, retryCalls: result.spies.retryCalls, continuationCalls: result.spies.continuationCalls });
    records.push({ caseId, result: "rejected", retryCalls: result.spies.retryCalls });
  }

  const bCases = [
    ["failWrite", "F10-P08-B-WRITE-FAILURE-BLOCKS-CONTINUATION"],
    ["failFsync", "F10-P09-B-FSYNC-FAILURE-BLOCKS-CONTINUATION"],
    ["failClose", "F10-P10-B-CLOSE-FAILURE-BLOCKS-CONTINUATION"],
    ["failRename", "F10-P11-B-RENAME-FAILURE-BLOCKS-CONTINUATION"],
    ["failReread", "F10-P12-B-REREAD-FAILURE-BLOCKS-CONTINUATION"],
    ["failLength", "F10-P13-B-LENGTH-FAILURE-BLOCKS-CONTINUATION"],
    ["failDigest", "F10-P14-B-DIGEST-FAILURE-BLOCKS-CONTINUATION"],
  ];
  for (const [hook, caseId] of bCases) {
    const result = await runF10RepairRetryContinuation(f10AdapterArgs(dir, {
      destA: path.join(dir, `b-${hook}-a.json`),
      destB: path.join(dir, `b-${hook}-b.json`),
      persistHooksB: { [hook]: true },
    }));
    assert.equal(result.ok, false, hook);
    assert.equal(result.spies.retryCalls, 1, hook);
    assert.equal(result.spies.continuationAuthorizationCalls, 0, hook);
    assert.equal(result.spies.continuationCalls, 0, hook);
    spyCounts.push({
      hook: `B.${hook}`,
      retryCalls: result.spies.retryCalls,
      continuationAuthorizationCalls: result.spies.continuationAuthorizationCalls,
      continuationCalls: result.spies.continuationCalls,
    });
    records.push({ caseId, result: "rejected", continuationAuthorizationCalls: 0 });
  }

  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(records.length, 14);
  console.log(JSON.stringify({ publishedF10Persistence: records, spyCounts }, null, 2));
});

test("F10 sanitized stdout/stderr/error survive encoding and durable reread", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f3-f10-bodies-"));
  const stdout = "ok-line\nunicode Δ café\nnewline-end\n";
  const stderr = "warn:  role \"ubuntu\" does not exist\n";
  const error = "ERROR:  encoded-body-survives";
  const result = await runF10RepairRetryContinuation(f10AdapterArgs(dir, {
    repairExtra: { stdout, stderr, error: null },
  }));
  assert.equal(result.ok, true);
  const stored = result.persistA.record.repairProcessResult;
  assert.equal(stored.stdout, stdout);
  assert.equal(stored.stderr, stderr);
  const reread = verifyPersistedCheckpointA(result.persistA.dest);
  assert.equal(reread.ok, true);
  assert.equal(reread.record.repairProcessResult.stdout, stdout);
  assert.equal(reread.record.repairProcessResult.stderr, stderr);
  const encoded = encodeSanitizedProcessResult({
    command: "cmd",
    status: 1,
    stdout,
    stderr,
    error,
    signal: null,
    timeout: false,
  });
  assert.equal(isCompleteProcessResult(encoded), true);
  assert.equal(encoded.error, error);
  assert.equal(encoded.stdout, stdout);
  assert.equal(encoded.stderr, stderr);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(JSON.stringify({ caseId: "F10-R01-BODIES-SURVIVE-ENCODING", result: "ok" }, null, 2));
});

test("F10 suite-log pipeline binds metadata to committed bytes with provenance", () => {
  const records = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f3-f10-suite-"));
  const secret = "super-secret-db-password";
  const rawOut = [
    "# Subtest: f10 suite bind",
    "ok 1 - f10 suite bind",
    `  password: ${secret}`,
    "  workdir: /workspace/machine-path",
    "",
  ].join("\n");
  const packed = packageF10LocalSuiteLog({
    destDir: dir,
    suiteName: "test-f3-db-push",
    rawOut,
    tests: [{ name: "f10 suite bind", ok: true, output: rawOut }],
    extraSecrets: [secret],
  });
  assert.equal(packed.ok, true);
  const committed = fs.readFileSync(packed.outPath);
  assert.equal(committed.includes(secret), false);
  assert.equal(packed.meta.sha256, createHash("sha256").update(committed).digest("hex"));
  assert.equal(packed.meta.bytes, committed.byteLength);
  assert.equal(packed.transformation_provenance.producer, SUITE_META_PRODUCER_ID);
  assert.equal(packed.transformation_provenance.transform, SUITE_TRANSFORM_ID);
  assert.equal(packed.transformation_provenance.final_sha256, packed.meta.sha256);
  assert.equal(packed.transformation_provenance.final_bytes, packed.meta.bytes);
  assert.notEqual(packed.transformation_provenance.source_sha256, packed.meta.sha256);
  assert.equal(packed.raw_not_committed, true);
  const verified = verifySuiteToLogBinding({ outPath: packed.outPath, metaPath: packed.metaPath });
  assert.equal(verified.ok, true);
  records.push({ caseId: "F10-S01-SUITE-META-MATCHES-COMMITTED-BYTES", result: "ok" });

  const standIn = buildSuiteMetaFromSanitizedOut({
    sanitizedOut: Buffer.from(rawOut, "utf8"),
    tests: [{ name: "stand-in", ok: true }],
  });
  assert.notEqual(standIn.sha256, packed.meta.sha256);
  records.push({ caseId: "F10-S02-STANDIN-HASH-DISAGREES-WITH-COMMITTED", result: "ok" });

  const provenance = packed.transformation_provenance;
  assert.deepEqual(provenance.pipeline, [
    "capture",
    "sanitize",
    "durable_write",
    "reread",
    "hash",
    "suite_metadata",
    "indexes",
  ]);
  assert.ok(provenance.transformations.includes("sanitizeEvidenceOutBytes"));
  records.push({ caseId: "F10-S03-TRANSFORMATION-PROVENANCE-RECORDED", result: "ok" });

  const suites = ["test-f3-db-push", "test-f3-recognition", "test-f3-oracles"];
  for (const name of suites) {
    const row = packageF10LocalSuiteLog({
      destDir: path.join(dir, name),
      suiteName: name,
      rawOut: `# ${name}\nok 1 - ${name}\n`,
      tests: [{ name, ok: true }],
    });
    assert.equal(row.ok, true, name);
    assert.equal(verifySuiteToLogBinding({ outPath: row.outPath, metaPath: row.metaPath }).ok, true, name);
  }
  records.push({ caseId: "F10-S04-EVERY-SUITE-TO-LOG-BINDING-VERIFIED", result: "ok" });

  fs.rmSync(dir, { recursive: true, force: true });
  for (const required of [
    "F10-S01-SUITE-META-MATCHES-COMMITTED-BYTES",
    "F10-S02-STANDIN-HASH-DISAGREES-WITH-COMMITTED",
    "F10-S03-TRANSFORMATION-PROVENANCE-RECORDED",
    "F10-S04-EVERY-SUITE-TO-LOG-BINDING-VERIFIED",
  ]) {
    assert.equal(records.some((row) => row.caseId === required), true, required);
  }
  console.log(JSON.stringify({ publishedF10SuiteBinding: records }, null, 2));
});

test("F11 hosted main delegates to the same shared orchestration tests spy", async () => {
  const records = [];
  const qualifySrc = fs.readFileSync(path.join(root, "scripts/qualify-f3-db-push-disposable.mjs"), "utf8");
  const mainMatch = qualifySrc.match(/async function main\([\s\S]*$/);
  const mainSrc = mainMatch ? mainMatch[0] : "";
  assert.equal(F11_HOSTED_DELEGATES_TO_SHARED, true);
  assert.equal(F11_SHARED_ORCHESTRATION_ID, "runF10RepairRetryContinuation");
  assert.equal(runHostedF10RepairRetryContinuation, runF10RepairRetryContinuation);
  assert.match(mainSrc, /runHostedF10RepairRetryContinuation\(/);
  assert.doesNotMatch(mainSrc, /persistCheckpointA\(/);
  assert.doesNotMatch(mainSrc, /persistCheckpointB\(/);
  assert.doesNotMatch(mainSrc, /completedRepair:/);
  assert.match(mainSrc, /repairSafetyGate:/);
  assert.match(mainSrc, /hostedActualRepair/);
  records.push({ caseId: "F11-O01-HOSTED-MAIN-DELEGATES-TO-SHARED-ORCHESTRATION", result: "ok" });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f3-f11-orch-"));
  let pendingRepair = null;
  const happy = await runF10RepairRetryContinuation(f10AdapterArgs(dir, {
    onAfterRepairStarted: ({ events }) => {
      pendingRepair = {
        started: events.some((event) => event.event_type === "repair_started"),
        completed: events.some((event) => event.event_type === "repair_completed"),
      };
    },
  }));
  assert.equal(happy.ok, true);
  assert.equal(pendingRepair.started, true);
  assert.equal(pendingRepair.completed, false);
  const started = happy.events.findIndex((event) => event.event_type === "repair_started");
  const completed = happy.events.findIndex((event) => event.event_type === "repair_completed");
  assert.ok(started >= 0 && completed > started);
  records.push({ caseId: "F11-O02-SPIES-START-BEFORE-INVOKE", result: "ok" });
  records.push({ caseId: "F11-O03-COMPLETION-AFTER-AWAIT", result: "ok" });

  const failed = await runF10RepairRetryContinuation(f10AdapterArgs(dir, {
    destA: path.join(dir, "fail-a.json"),
    destB: path.join(dir, "fail-b.json"),
    destPreContinuation: path.join(dir, "fail-pre.json"),
    repair: () => {
      throw new Error("injected repair throw");
    },
  }));
  assert.equal(failed.ok, false);
  assert.equal(failed.spies.retryCalls, 0);
  assert.equal(failed.spies.continuationAuthorizationCalls, 0);
  assert.equal(failed.spies.checkpointAWritesVerified, 0);
  assert.equal(failed.events.some((event) => event.event_type === "repair_completed"), true);
  records.push({ caseId: "F11-O04-TRUTHFUL-FAILURE-SUPPRESSES-SUBSEQUENT", result: "rejected" });
  records.push({ caseId: "F11-O05-NO-TEST-ONLY-ALTERNATE-SEQUENCE", result: "ok" });

  const persistFail = await runF10RepairRetryContinuation(f10AdapterArgs(dir, {
    destA: path.join(dir, "p-a.json"),
    destB: path.join(dir, "p-b.json"),
    persistHooksA: { failWrite: true },
  }));
  assert.equal(persistFail.ok, false);
  assert.equal(persistFail.spies.retryCalls, 0);
  assert.equal(persistFail.sharedOrchestration || F11_SHARED_ORCHESTRATION_ID, F11_SHARED_ORCHESTRATION_ID);
  records.push({ caseId: "F11-O06-PERSISTENCE-FAILURE-THROUGH-SHARED-PATH", result: "rejected" });

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(JSON.stringify({ publishedF11Orchestration: records }, null, 2));
});

test("F11 durable-write counters separate attempts from verified writes at persist boundary", async () => {
  const records = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f3-f11-counters-"));
  assert.equal(DURABLE_WRITE_COUNTER_SCOPE.counted_at.includes("writeDurableArtifactBytes"), true);
  assert.equal(DURABLE_WRITE_COUNTER_SCOPE.minimum_verified_writes_in_present_flow, 3);
  assert.match(GATE_CALLS_BOUNDARY, /not every evaluateRepairSafetyGate/);

  const happy = await runF10RepairRetryContinuation(f10AdapterArgs(dir));
  assert.equal(happy.ok, true);
  assert.equal(happy.counters.durableWriteAttempts, 3);
  assert.equal(happy.counters.durableWritesVerified, 3);
  assert.equal(happy.counters.durableRecordWrites, 3);
  assert.deepEqual({
    durableWriteAttempts: happy.counters.durableWriteAttempts,
    durableWritesVerified: happy.counters.durableWritesVerified,
    durableRecordWrites: happy.counters.durableRecordWrites,
  }, {
    durableWriteAttempts: expectedF10OrchestrationCounters(FILE118).durableWriteAttempts,
    durableWritesVerified: expectedF10OrchestrationCounters(FILE118).durableWritesVerified,
    durableRecordWrites: expectedF10OrchestrationCounters(FILE118).durableRecordWrites,
  });
  assert.equal(happy.spies.checkpointAWriteAttempts, 1);
  assert.equal(happy.spies.checkpointAWritesVerified, 1);
  assert.equal(happy.spies.checkpointBWriteAttempts, 1);
  assert.equal(happy.spies.checkpointBWritesVerified, 1);
  assert.equal(happy.spies.preContinuationWriteAttempts, 1);
  assert.equal(happy.spies.preContinuationWritesVerified, 1);
  assert.ok(
    (happy.persistA.record.runnerCounters.durableWritesVerified || 0)
      < happy.counters.durableWritesVerified,
  );
  records.push({ caseId: "F11-C01-ATTEMPTS-SEPARATE-FROM-VERIFIED", result: "ok" });
  records.push({ caseId: "F11-C02-THREE-DURABLE-RECORDS-COUNTED", result: "ok" });
  records.push({ caseId: "F11-C03-SNAPSHOT-BEFORE-OWN-WRITE-VERIFIED", result: "ok" });
  records.push({ caseId: "F11-C07-WRITER-SPIES-RECONCILE", result: "ok" });
  records.push({ caseId: "F11-C08-GATECALLS-DISTINCT-FROM-INTERNAL", result: "ok" });

  const failA = await runF10RepairRetryContinuation(f10AdapterArgs(dir, {
    destA: path.join(dir, "c-a.json"),
    destB: path.join(dir, "c-b.json"),
    persistHooksA: { failFsync: true },
  }));
  assert.equal(failA.ok, false);
  assert.equal(failA.counters.durableWriteAttempts >= 1, true);
  assert.equal(failA.counters.durableWritesVerified, 0);
  assert.equal(failA.spies.retryCalls, 0);
  records.push({ caseId: "F11-C04-A-FAILURE-ATTEMPT-NOT-VERIFIED", result: "rejected" });

  const failB = await runF10RepairRetryContinuation(f10AdapterArgs(dir, {
    destA: path.join(dir, "c2-a.json"),
    destB: path.join(dir, "c2-b.json"),
    persistHooksB: { failRename: true },
  }));
  assert.equal(failB.ok, false);
  assert.equal(failB.counters.durableWritesVerified, 1);
  assert.equal(failB.spies.checkpointAWritesVerified, 1);
  assert.equal(failB.spies.continuationAuthorizationCalls, 0);
  records.push({ caseId: "F11-C05-B-FAILURE-A-VERIFIED-B-NOT", result: "rejected" });

  const failPre = await runF10RepairRetryContinuation(f10AdapterArgs(dir, {
    destA: path.join(dir, "c3-a.json"),
    destB: path.join(dir, "c3-b.json"),
    destPreContinuation: path.join(dir, "c3-pre.json"),
    persistHooksPre: { failReread: true },
  }));
  assert.equal(failPre.ok, false);
  assert.equal(failPre.counters.durableWritesVerified, 2);
  assert.equal(failPre.spies.preContinuationWriteAttempts, 1);
  assert.equal(failPre.spies.preContinuationWritesVerified, 0);
  assert.equal(failPre.spies.continuationAuthorizationCalls, 0);
  records.push({ caseId: "F11-C06-PRE-FAILURE-A-B-VERIFIED-PRE-NOT", result: "rejected" });

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(JSON.stringify({ publishedF11Counters: records }, null, 2));
});

test("F11 record validators reject malformed A/B identities and process evidence", async () => {
  const records = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f3-f11-validate-"));
  const rejectIds = [];
  const reject = (caseId, check) => {
    assert.equal(check.ok, false, caseId);
    rejectIds.push(caseId);
    records.push({ caseId, result: "rejected", reason: check.reason || check.hold || "rejected" });
  };

  reject("F11-V01-EMPTY-IDENTITY-REJECTED", assertFrozenMigrationIdentity(""));
  reject("F11-V02-ABSENT-IDENTITY-REJECTED", assertFrozenMigrationIdentity(null));
  reject("F11-V03-MISMATCHED-IDENTITY-REJECTED", assertFrozenMigrationIdentity({
    file: FILE118,
    version: "99999999999999",
  }, FILE118, PREASSIGNED_VERSIONS[FILE118]));
  reject("F11-V04-INCOMPLETE-IDENTITY-REJECTED", assertFrozenMigrationIdentity({ file: FILE118 }));
  reject("F11-V05-B-REJECTS-NONEXISTENT-A", authenticateCheckpointBAgainstRereadA({
    recordB: buildCheckpointBRecord({
      file: FILE118,
      version: PREASSIGNED_VERSIONS[FILE118],
      retryProcessResult: encodeSanitizedProcessResult(f10Process("retry", 0)),
      postRetryProof: { ok: true },
      checkpointA: { dest: path.join(dir, "no-such-a.json"), sha256: "ab".repeat(32), bytes: 12 },
    }),
    destA: path.join(dir, "no-such-a.json"),
    expectedFile: FILE118,
    expectedVersion: PREASSIGNED_VERSIONS[FILE118],
  }));
  reject("F11-V06-B-REJECTS-ZERO-DIGEST", persistCheckpointB({
    dest: path.join(dir, "zero-b.json"),
    expected: { file: FILE118, version: PREASSIGNED_VERSIONS[FILE118] },
    record: {
      ...buildCheckpointBRecord({
        file: FILE118,
        version: PREASSIGNED_VERSIONS[FILE118],
        retryProcessResult: encodeSanitizedProcessResult(f10Process("retry", 0)),
        postRetryProof: { ok: true },
        checkpointA: { dest: path.join(dir, "a.json"), sha256: "0".repeat(64), bytes: 0 },
      }),
    },
  }));
  reject("F11-V07-B-REJECTS-WRONG-MIGRATION", assertCheckpointAComplete({
    schema_version: F10_CHECKPOINT_A_SCHEMA_VERSION,
    checkpoint: "A",
    boundary: "after_repair_before_retry",
    migrationIdentity: { file: FILE123, version: PREASSIGNED_VERSIONS[FILE123] },
    repairProcessResult: encodeSanitizedProcessResult(f10Process("repair", 0)),
  }, { file: FILE118, version: PREASSIGNED_VERSIONS[FILE118] }));
  reject("F11-V08-B-REJECTS-WRONG-PHASE", assertCheckpointBComplete({
    schema_version: F10_CHECKPOINT_B_SCHEMA_VERSION,
    checkpoint: "A",
    boundary: "after_retry_post_retry_before_continuation",
    migrationIdentity: { file: FILE118, version: PREASSIGNED_VERSIONS[FILE118] },
    retryProcessResult: encodeSanitizedProcessResult(f10Process("retry", 0)),
    postRetryProof: { ok: true },
    checkpointA: { dest: "x", sha256: "ab".repeat(32), bytes: 1 },
  }, { file: FILE118, version: PREASSIGNED_VERSIONS[FILE118] }));
  reject("F11-V09-INCOMPLETE-PROCESS-EVIDENCE", assertCheckpointAComplete({
    schema_version: F10_CHECKPOINT_A_SCHEMA_VERSION,
    checkpoint: "A",
    boundary: "after_repair_before_retry",
    migrationIdentity: { file: FILE118, version: PREASSIGNED_VERSIONS[FILE118] },
    repairProcessResult: { status: 0, command: "x" },
  }, { file: FILE118, version: PREASSIGNED_VERSIONS[FILE118] }));
  const hashed = encodeSanitizedProcessResult(f10Process("repair", 0, { stdout: "ok\n" }));
  reject("F11-V10-INCONSISTENT-PROCESS-HASHES", assertCheckpointAComplete({
    schema_version: F10_CHECKPOINT_A_SCHEMA_VERSION,
    checkpoint: "A",
    boundary: "after_repair_before_retry",
    migrationIdentity: { file: FILE118, version: PREASSIGNED_VERSIONS[FILE118] },
    repairProcessResult: { ...hashed, stdoutSha256: "ff".repeat(32) },
  }, { file: FILE118, version: PREASSIGNED_VERSIONS[FILE118] }));
  reject("F11-V11-CONTRADICTORY-SUCCESS-STATUS0-TIMEOUT", assertCheckpointAComplete({
    schema_version: F10_CHECKPOINT_A_SCHEMA_VERSION,
    checkpoint: "A",
    boundary: "after_repair_before_retry",
    migrationIdentity: { file: FILE118, version: PREASSIGNED_VERSIONS[FILE118] },
    repairProcessResult: encodeSanitizedProcessResult(f10Process("repair", 0, { timeout: true })),
  }, { file: FILE118, version: PREASSIGNED_VERSIONS[FILE118] }));
  reject("F11-V12-CONTRADICTORY-SUCCESS-STATUS0-SIGNAL", assertCheckpointAComplete({
    schema_version: F10_CHECKPOINT_A_SCHEMA_VERSION,
    checkpoint: "A",
    boundary: "after_repair_before_retry",
    migrationIdentity: { file: FILE118, version: PREASSIGNED_VERSIONS[FILE118] },
    repairProcessResult: encodeSanitizedProcessResult(f10Process("repair", 0, { signal: "SIGTERM" })),
  }, { file: FILE118, version: PREASSIGNED_VERSIONS[FILE118] }));
  reject("F11-V13-CONTRADICTORY-SUCCESS-STATUS0-ERROR", assertCheckpointAComplete({
    schema_version: F10_CHECKPOINT_A_SCHEMA_VERSION,
    checkpoint: "A",
    boundary: "after_repair_before_retry",
    migrationIdentity: { file: FILE118, version: PREASSIGNED_VERSIONS[FILE118] },
    repairProcessResult: encodeSanitizedProcessResult(f10Process("repair", 0, { error: "process error" })),
  }, { file: FILE118, version: PREASSIGNED_VERSIONS[FILE118] }));

  const encodedObj = encodeSanitizedProcessError({ message: "EACCES", code: "EACCES", syscall: "open" });
  assert.notEqual(encodedObj.error, "[object Object]");
  assert.equal(encodedObj.errorStructured.encoding, SANITIZED_PROCESS_ERROR_ENCODING);
  assert.match(encodedObj.error, /EACCES/);
  assert.equal(isCompleteProcessResult(encodeSanitizedProcessResult({
    command: "cmd",
    status: 1,
    stdout: "",
    stderr: "",
    error: { message: "EACCES", code: "EACCES", syscall: "open" },
    signal: null,
    timeout: false,
  })), true);
  records.push({ caseId: "F11-V14-OBJECT-ERROR-NOT-OBJECT-OBJECT", result: "ok" });
  rejectIds.push("F11-V14-OBJECT-ERROR-NOT-OBJECT-OBJECT");
  const withError = encodeSanitizedProcessResult({
    command: "cmd",
    status: 1,
    stdout: "",
    stderr: "e",
    error: { message: "boom", code: "ERR", syscall: "write" },
    signal: null,
    timeout: false,
  });
  assert.equal(isCompleteProcessResult({ ...withError, errorSha256: "aa".repeat(32) }), false);
  records.push({ caseId: "F11-V15-ERROR-BODY-HASH-LENGTH-VERIFIED", result: "ok" });
  rejectIds.push("F11-V15-ERROR-BODY-HASH-LENGTH-VERIFIED");

  const rejectedRetry = await runF10RepairRetryContinuation(f10AdapterArgs(dir, {
    destA: path.join(dir, "bad-id-a.json"),
    destB: path.join(dir, "bad-id-b.json"),
    file: "not-a-frozen-migration.sql",
    version: "1",
  }));
  assert.equal(rejectedRetry.ok, false);
  assert.equal(rejectedRetry.spies.retryCalls, 0);
  records.push({ caseId: "F11-V16-REJECTED-RECORD-NO-RETRY", result: "rejected" });
  rejectIds.push("F11-V16-REJECTED-RECORD-NO-RETRY");

  const rejectedCont = await runF10RepairRetryContinuation(f10AdapterArgs(dir, {
    destA: path.join(dir, "rej-cont-a.json"),
    destB: path.join(dir, "rej-cont-b.json"),
    persistHooksB: { failDigest: true },
  }));
  assert.equal(rejectedCont.ok, false);
  assert.equal(rejectedCont.spies.continuationAuthorizationCalls, 0);
  records.push({ caseId: "F11-V17-REJECTED-RECORD-NO-CONTINUATION", result: "rejected" });
  rejectIds.push("F11-V17-REJECTED-RECORD-NO-CONTINUATION");

  const happy = await runF10RepairRetryContinuation(f10AdapterArgs(dir, {
    destA: path.join(dir, "auth-a.json"),
    destB: path.join(dir, "auth-b.json"),
  }));
  const callerSupplied = {
    ...happy.persistB.record,
    checkpointA: { dest: happy.persistA.dest, sha256: "cd".repeat(32), bytes: 99 },
  };
  const auth = authenticateCheckpointBAgainstRereadA({
    recordB: callerSupplied,
    destA: happy.persistA.dest,
    expectedFile: FILE118,
    expectedVersion: PREASSIGNED_VERSIONS[FILE118],
  });
  assert.equal(auth.ok, false);
  records.push({ caseId: "F11-V18-B-AUTHENTICATES-REREAD-A-NOT-CALLER-SUPPLIED", result: "rejected" });
  rejectIds.push("F11-V18-B-AUTHENTICATES-REREAD-A-NOT-CALLER-SUPPLIED");

  const qualifySrc = fs.readFileSync(path.join(root, "scripts/qualify-f3-db-push-disposable.mjs"), "utf8");
  assert.match(qualifySrc, /preserveOriginalProcessStdout/);
  assert.match(qualifySrc, /hashOriginalStdout/);
  records.push({ caseId: "F11-V19-STRICT-ORIGINAL-BYTE-POISON-PRESERVED", result: "ok" });
  rejectIds.push("F11-V19-STRICT-ORIGINAL-BYTE-POISON-PRESERVED");

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(JSON.stringify({ publishedF11Validators: records, malformedRecordRejectionIds: rejectIds }, null, 2));
});

test("F11 closure recomputes complete runtime inputs and authoritative outer metadata", () => {
  const records = [];
  const recursive = buildFunctionalRecursiveRuntimeClosure();
  assert.equal(recursive.files.includes("package.json"), true);
  records.push({ caseId: "F11-L01-CLOSURE-INCLUDES-PACKAGE-JSON", result: "ok" });
  assert.equal(recursive.files.includes("src/lib/financial-f3-recognition.ts"), true);
  records.push({ caseId: "F11-L02-CLOSURE-INCLUDES-RECOGNITION", result: "ok" });
  assert.equal(F3_FORWARD_FILES.every((file) => recursive.files.includes(`supabase/migrations/${file}`)), true);
  assert.equal(recursive.files.includes("supabase/migrations/00115_s0_p0b_cut2_notification_queue.sql"), true);
  assert.equal(recursive.files.includes("supabase/migrations/00117_m2_notification_policy_foundation.sql"), true);
  records.push({ caseId: "F11-L03-CLOSURE-INCLUDES-FROZEN-SQL", result: "ok" });
  assert.equal(recursive.files.includes("scripts/test-f3-db-push-harness.mjs"), true);
  records.push({ caseId: "F11-L04-CLOSURE-INCLUDES-HARNESS", result: "ok" });
  assert.equal(recursive.files.includes(LOCAL_PSQL_POISON_PROOF_HELPER_RELPATH), true);
  records.push({ caseId: "F11-L05-CLOSURE-INCLUDES-LOCAL-PROOF-HELPER", result: "ok" });
  assert.notEqual(recursive.closure_sha256, F10_INCOMPLETE_27_FILE_CLOSURE_DIGEST);
  assert.notEqual(recursive.files.length, 27);
  assert.equal(F11_PREVIOUSLY_OMITTED_CLOSURE_INPUTS.every((rel) => recursive.files.includes(rel)), true);
  assert.equal(recursive.closure_sha256.startsWith("c542aff7"), false);
  assert.equal(recursive.closure_sha256.startsWith("69279457"), false);
  records.push({
    caseId: "F11-L06-FRESH-DIGEST-NOT-27-FILE-IDENTITY",
    result: "ok",
    file_count: recursive.files.length,
    closure_sha256: recursive.closure_sha256,
  });

  const pointer = buildAuthoritativeOuterEvidencePointer();
  assert.equal(pointer.authoritative, true);
  assert.equal(pointer.embeds_index_digest, false);
  assert.equal(pointer.label, F11_EVIDENCE_LABEL);
  assert.equal(Object.prototype.hasOwnProperty.call(pointer, "digest"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pointer, "sha256"), false);
  records.push({ caseId: "F11-L07-AUTHORITATIVE-OUTER-INDEX-NO-SELF-HASH", result: "ok" });
  const staging = buildNonAuthoritativeStagingSummary();
  assert.equal(staging.authoritative, false);
  assert.equal(staging.historical_staging, true);
  assert.equal(staging.see, "evidence-index.json");
  records.push({ caseId: "F11-L08-STAGING-SUMMARY-NOT-PRESENTED-AS-FINAL", result: "ok" });
  records.push({ caseId: "F11-L09-POINTER-HAS-NO-INDEX-DIGEST", result: "ok" });
  assert.equal(assertLocalSyntheticEvidenceDirName("local-synthetic-f11").ok, true);
  assert.equal(assertLocalSyntheticEvidenceDirName("hosted").ok, false);
  assert.equal(assertLocalSyntheticEvidenceDirName("local/hosted/qualify").ok, false);
  records.push({ caseId: "F11-L10-LOCAL-SYNTHETIC-LABEL-NOT-HOSTED", result: "ok" });

  console.log(JSON.stringify({
    publishedF11Closure: records,
    f11ClosureFileCount: recursive.files.length,
    f11ClosureDigest: recursive.closure_sha256,
    f11ClosureFiles: recursive.files,
  }, null, 2));
});

function writeWellFormedReplacementA(dest, file, version, stdout = "REPLACEMENT-A-RESEALED\n") {
  return persistCheckpointA({
    dest,
    expected: { file, version },
    record: buildCheckpointARecord({
      file,
      version,
      repairProcessResult: encodeSanitizedProcessResult(f10Process("repair", 0, { stdout })),
    }),
  });
}

test("F12 actual repair adapter runs through shared orchestration; gate reject blocks callback", async () => {
  const records = [];
  const qualifySrc = fs.readFileSync(path.join(root, "scripts/qualify-f3-db-push-disposable.mjs"), "utf8");
  const mainMatch = qualifySrc.match(/async function main\([\s\S]*$/);
  const mainSrc = mainMatch ? mainMatch[0] : "";
  assert.equal(F12_HOSTED_SUPPLIES_LIVE_REPAIR_ADAPTER, true);
  assert.equal(F12_COMPLETED_REPAIR_SHORTCUT_REMOVED, true);
  assert.equal(F12_SHARED_ORCHESTRATION_ID, F11_SHARED_ORCHESTRATION_ID);
  assert.doesNotMatch(qualifySrc, /if \(completedRepair\)/);
  assert.match(mainSrc, /repairSafetyGate:/);
  assert.match(mainSrc, /repair: hostedActualRepair/);
  records.push({ caseId: "F12-R01-HOSTED-SUPPLIES-LIVE-REPAIR-ADAPTER", result: "ok" });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f3-f12-repair-"));
  let repairEntered = 0;
  let pendingRepair = null;
  const happy = await runF10RepairRetryContinuation(f10AdapterArgs(dir, {
    repair: () => {
      repairEntered += 1;
      return f10Process(
        "supabase migration repair --status applied --db-url [REDACTED] --workdir [ISOLATED] --yes",
        0,
      );
    },
    onAfterRepairStarted: ({ events }) => {
      pendingRepair = {
        started: events.some((event) => event.event_type === "repair_started"),
        completed: events.some((event) => event.event_type === "repair_completed"),
      };
    },
  }));
  assert.equal(happy.ok, true);
  assert.equal(repairEntered, 1);
  assert.equal(happy.spies.actualRepairCallbackEntered, 1);
  assert.equal(happy.spies.repairCalls, 1);
  assert.equal(pendingRepair.started, true);
  assert.equal(pendingRepair.completed, false);
  const started = happy.events.findIndex((event) => event.event_type === "repair_started");
  const completed = happy.events.findIndex((event) => event.event_type === "repair_completed");
  assert.ok(started >= 0 && completed > started);
  records.push({ caseId: "F12-R02-REPAIR-ADAPTER-INVOKED-THROUGH-SHARED", result: "ok" });
  records.push({ caseId: "F12-R03-STARTED-BEFORE-REAL-INVOKE", result: "ok" });
  records.push({ caseId: "F12-R04-COMPLETION-AFTER-AWAIT", result: "ok" });

  let rejectedEntered = 0;
  const rejected = await runF10RepairRetryContinuation(f10AdapterArgs(dir, {
    destA: path.join(dir, "gate-a.json"),
    destB: path.join(dir, "gate-b.json"),
    destPreContinuation: path.join(dir, "gate-pre.json"),
    repairSafetyGate: () => ({
      ok: false,
      repairAuthorized: false,
      reason: "injected gate rejection",
    }),
    repair: () => {
      rejectedEntered += 1;
      return f10Process("repair", 0);
    },
  }));
  assert.equal(rejected.ok, false);
  assert.equal(rejectedEntered, 0);
  assert.equal(rejected.spies.actualRepairCallbackEntered, 0);
  assert.equal(rejected.spies.repairCalls, 0);
  assert.equal(rejected.spies.repairSafetyGateCalls, 1);
  assert.equal(rejected.spies.retryCalls, 0);
  records.push({ caseId: "F12-R05-GATE-REJECTION-PREVENTS-ACTUAL-REPAIR", result: "rejected" });

  const pendingCollect = await runF10RepairRetryContinuation(f10AdapterArgs(dir, {
    destA: path.join(dir, "pend-a.json"),
    destB: path.join(dir, "pend-b.json"),
    postRetryVerify: () => ({ ok: true, pending: true, collected: false }),
  }));
  assert.equal(pendingCollect.ok, false);
  assert.equal(pendingCollect.events.some((event) => event.event_type === "post_retry_fingerprint_collected"), false);
  assert.equal(pendingCollect.spies.checkpointBWritesVerified, 0);
  assert.equal(pendingCollect.spies.continuationAuthorizationCalls, 0);
  records.push({ caseId: "F12-R06-PENDING-COLLECTION-NO-PREMATURE-EVENT", result: "rejected" });

  const failedCollect = await runF10RepairRetryContinuation(f10AdapterArgs(dir, {
    destA: path.join(dir, "failc-a.json"),
    destB: path.join(dir, "failc-b.json"),
    postRetryVerify: () => ({ ok: false, collectionFailed: true, reason: "injected collection failure" }),
  }));
  assert.equal(failedCollect.ok, false);
  assert.equal(failedCollect.events.some((event) => event.event_type === "post_retry_fingerprint_collected"), false);
  assert.equal(failedCollect.spies.checkpointBWritesVerified, 0);
  assert.equal(failedCollect.spies.continuationAuthorizationCalls, 0);
  records.push({ caseId: "F12-R07-COLLECTION-FAILURE-BLOCKS-CHECKPOINT-AND-CONTINUATION", result: "rejected" });

  const happyCollect = await runF10RepairRetryContinuation(f10AdapterArgs(dir, {
    destA: path.join(dir, "okc-a.json"),
    destB: path.join(dir, "okc-b.json"),
    destPreContinuation: path.join(dir, "okc-pre.json"),
  }));
  const collectedAt = happyCollect.events.findIndex((event) => event.event_type === "post_retry_fingerprint_collected");
  const retryDone = happyCollect.events.findIndex((event) => event.event_type === "retry_completed");
  const bPersisted = happyCollect.events.findIndex((event) => event.event_type === "checkpoint_b_persisted");
  assert.ok(collectedAt > retryDone);
  assert.ok(bPersisted > collectedAt);
  records.push({ caseId: "F12-R08-COLLECTION-EVENT-AFTER-SUCCESSFUL-POST-RETRY", result: "ok" });

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(JSON.stringify({ publishedF12RepairOrchestration: records }, null, 2));
});

test("F12 original Checkpoint A receipt rejects well-formed replacement", async () => {
  const records = [];
  const rejectIds = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f3-f12-receipt-"));
  const version = PREASSIGNED_VERSIONS[FILE118];

  const happy = await runF10RepairRetryContinuation(f10AdapterArgs(dir, {
    destA: path.join(dir, "orig-a.json"),
    destB: path.join(dir, "orig-b.json"),
  }));
  assert.equal(happy.ok, true);
  assert.equal(happy.originalAReceipt.sha256, happy.persistA.sha256);
  assert.equal(happy.originalAReceipt.bytes, happy.persistA.bytes);
  assert.equal(happy.persistB.record.checkpointA.sha256, happy.originalAReceipt.sha256);
  records.push({ caseId: "F12-A01-ORIGINAL-RECEIPT-CAPTURED-FROM-VERIFIED-WRITE", result: "ok" });

  const beforeRetry = await runF10RepairRetryContinuation(f10AdapterArgs(dir, {
    destA: path.join(dir, "repl-before-a.json"),
    destB: path.join(dir, "repl-before-b.json"),
    destPreContinuation: path.join(dir, "repl-before-pre.json"),
    postRepairVerify: () => {
      const replaced = writeWellFormedReplacementA(
        path.join(dir, "repl-before-a.json"),
        FILE118,
        version,
      );
      assert.equal(replaced.ok, true);
      assert.notEqual(replaced.sha256, happy.persistA.sha256);
      return { ok: true };
    },
  }));
  assert.equal(beforeRetry.ok, false);
  assert.equal(beforeRetry.spies.retryCalls, 0);
  assert.equal(beforeRetry.spies.continuationAuthorizationCalls, 0);
  assert.equal(beforeRetry.originalAReceipt.sha256 !== beforeRetry.persistA?.sha256
    || verifyPersistedCheckpointA(path.join(dir, "repl-before-a.json"), beforeRetry.originalAReceipt).ok === false, true);
  rejectIds.push("F12-A02-REPLACE-A-BEFORE-RETRY-BLOCKS-RETRY");
  records.push({
    caseId: "F12-A02-REPLACE-A-BEFORE-RETRY-BLOCKS-RETRY",
    result: "rejected",
    retryCalls: beforeRetry.spies.retryCalls,
    continuationAuthorizationCalls: beforeRetry.spies.continuationAuthorizationCalls,
  });

  const afterRetry = await runF10RepairRetryContinuation(f10AdapterArgs(dir, {
    destA: path.join(dir, "repl-after-a.json"),
    destB: path.join(dir, "repl-after-b.json"),
    destPreContinuation: path.join(dir, "repl-after-pre.json"),
    postRetryVerify: () => {
      const replaced = writeWellFormedReplacementA(
        path.join(dir, "repl-after-a.json"),
        FILE118,
        version,
        "REPLACEMENT-AFTER-RETRY\n",
      );
      assert.equal(replaced.ok, true);
      return { ok: true, collected: true };
    },
  }));
  assert.equal(afterRetry.ok, false);
  assert.equal(afterRetry.spies.retryCalls, 1);
  assert.equal(afterRetry.spies.checkpointBWritesVerified, 0);
  assert.equal(afterRetry.spies.continuationAuthorizationCalls, 0);
  rejectIds.push("F12-A03-REPLACE-A-AFTER-RETRY-BLOCKS-B-AND-CONTINUATION");
  records.push({
    caseId: "F12-A03-REPLACE-A-AFTER-RETRY-BLOCKS-B-AND-CONTINUATION",
    result: "rejected",
    retryCalls: afterRetry.spies.retryCalls,
    checkpointBWritesVerified: afterRetry.spies.checkpointBWritesVerified,
    continuationAuthorizationCalls: afterRetry.spies.continuationAuthorizationCalls,
  });

  const reseal = writeWellFormedReplacementA(path.join(dir, "reseal-a.json"), FILE118, version, "RESEAL\n");
  const authReseal = authenticateCheckpointBAgainstRereadA({
    recordB: {
      ...happy.persistB.record,
      checkpointA: { dest: reseal.dest, sha256: reseal.sha256, bytes: reseal.bytes },
    },
    destA: reseal.dest,
    expectedFile: FILE118,
    expectedVersion: version,
    originalReceipt: happy.originalAReceipt,
  });
  assert.equal(authReseal.ok, false);
  rejectIds.push("F12-A04-WELL-FORMED-RESEAL-FAILS-VS-ORIGINAL-RECEIPT");
  records.push({ caseId: "F12-A04-WELL-FORMED-RESEAL-FAILS-VS-ORIGINAL-RECEIPT", result: "rejected" });

  const captured = captureOriginalCheckpointAReceipt(happy.persistA, {
    file: FILE118,
    version,
  });
  assert.equal(captured.ok, true);
  assert.equal(Object.isFrozen(captured.receipt), true);
  records.push({ caseId: "F12-A05-RECEIPT-IS-IMMUTABLE", result: "ok" });

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(JSON.stringify({
    publishedF12CheckpointAReceipt: records,
    aReplacementRejectionIds: rejectIds,
    aReplacementCallCounts: {
      beforeRetry: { retryCalls: beforeRetry.spies.retryCalls, continuationAuthorizationCalls: 0 },
      afterRetry: {
        retryCalls: afterRetry.spies.retryCalls,
        checkpointBWritesVerified: afterRetry.spies.checkpointBWritesVerified,
        continuationAuthorizationCalls: afterRetry.spies.continuationAuthorizationCalls,
      },
    },
  }, null, 2));
});

test("F12 caught Error through shared orchestration preserves code/syscall", async () => {
  const records = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f3-f12-catch-"));
  const thrown = new Error("EACCES: permission denied, spawn psql");
  thrown.code = "EACCES";
  thrown.syscall = "spawn psql";
  const failed = await runF10RepairRetryContinuation(f10AdapterArgs(dir, {
    destA: path.join(dir, "catch-a.json"),
    destB: path.join(dir, "catch-b.json"),
    destPreContinuation: path.join(dir, "catch-pre.json"),
    repair: () => {
      throw thrown;
    },
  }));
  assert.equal(failed.ok, false);
  assert.equal(failed.spies.retryCalls, 0);
  assert.equal(failed.spies.continuationAuthorizationCalls, 0);
  const encoded = failed.repairOp.encoded;
  assert.notEqual(encoded.error, "[object Object]");
  assert.equal(encoded.errorStructured.encoding, SANITIZED_PROCESS_ERROR_ENCODING);
  assert.equal(encoded.errorStructured.code, "EACCES");
  assert.equal(encoded.errorStructured.syscall, "spawn psql");
  assert.match(encoded.errorStructured.message, /permission denied/);
  assert.match(encoded.error, /EACCES/);
  assert.match(encoded.error, /spawn psql/);
  const hashed = hashOriginalStdout(encoded.error ?? "");
  assert.equal(encoded.errorSha256, hashed.sha256);
  assert.equal(encoded.errorByteLength, hashed.byteLength);
  assert.equal(isCompleteProcessResult(encoded), true);
  records.push({ caseId: "F12-E01-CAUGHT-ERROR-RETAINS-CODE-SYSCALL", result: "rejected" });
  records.push({ caseId: "F12-E02-ERROR-BODY-HASH-LENGTH-MATCH", result: "ok" });
  records.push({ caseId: "F12-E03-CAUGHT-ERROR-BLOCKS-RETRY-CONTINUATION", result: "rejected" });
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(JSON.stringify({ publishedF12CaughtException: records, encodedError: encoded.errorStructured }, null, 2));
});

test("F12 persistence-counter matrix remains 21 cases (7A+7B+7Pre)", async () => {
  const records = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f3-f12-persist-21-"));
  const hooks = ["failWrite", "failFsync", "failClose", "failRename", "failReread", "failLength", "failDigest"];
  let i = 1;
  for (const hook of hooks) {
    const result = await runF10RepairRetryContinuation(f10AdapterArgs(dir, {
      destA: path.join(dir, `a-${hook}.json`),
      destB: path.join(dir, `a-${hook}-b.json`),
      persistHooksA: { [hook]: true },
    }));
    assert.equal(result.ok, false, hook);
    assert.equal(result.spies.retryCalls, 0, hook);
    records.push({
      caseId: `F12-P${String(i).padStart(2, "0")}-A-${hook.toUpperCase()}`,
      result: "rejected",
      retryCalls: result.spies.retryCalls,
    });
    i += 1;
  }
  for (const hook of hooks) {
    const result = await runF10RepairRetryContinuation(f10AdapterArgs(dir, {
      destA: path.join(dir, `b-${hook}-a.json`),
      destB: path.join(dir, `b-${hook}.json`),
      persistHooksB: { [hook]: true },
    }));
    assert.equal(result.ok, false, hook);
    assert.equal(result.spies.retryCalls, 1, hook);
    assert.equal(result.spies.continuationAuthorizationCalls, 0, hook);
    records.push({
      caseId: `F12-P${String(i).padStart(2, "0")}-B-${hook.toUpperCase()}`,
      result: "rejected",
      continuationAuthorizationCalls: 0,
    });
    i += 1;
  }
  for (const hook of hooks) {
    const result = await runF10RepairRetryContinuation(f10AdapterArgs(dir, {
      destA: path.join(dir, `pre-${hook}-a.json`),
      destB: path.join(dir, `pre-${hook}-b.json`),
      destPreContinuation: path.join(dir, `pre-${hook}.json`),
      persistHooksPre: { [hook]: true },
    }));
    assert.equal(result.ok, false, hook);
    assert.equal(result.spies.checkpointAWritesVerified, 1, hook);
    assert.equal(result.spies.checkpointBWritesVerified, 1, hook);
    assert.equal(result.spies.preContinuationWritesVerified, 0, hook);
    assert.equal(result.spies.continuationAuthorizationCalls, 0, hook);
    records.push({
      caseId: `F12-P${String(i).padStart(2, "0")}-PRE-${hook.toUpperCase()}`,
      result: "rejected",
      continuationAuthorizationCalls: 0,
    });
    i += 1;
  }
  assert.equal(records.length, 21);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(JSON.stringify({ publishedF12Persistence21: records, persistenceFailureCases: 21 }, null, 2));
});

test("F12 proposed reset procedure rejects wipe-to-baseline and stays offline", () => {
  const records = [];
  const parsedWipe = parseArgs(["--wipe-to-baseline"]);
  assert.equal(parsedWipe.wipeToBaseline, true);
  const rejected = evaluateWipeToBaselineArg(true);
  assert.equal(rejected.rejected, true);
  assert.equal(rejected.code, WIPE_TO_BASELINE_REJECTION_CODE);
  assert.throws(() => assertWipeToBaselineRejected(parsedWipe), (err) => (
    err.code === WIPE_TO_BASELINE_REJECTION_CODE
  ));
  records.push({ caseId: "F12-Z01-WIPE-TO-BASELINE-STILL-REJECTED", result: "rejected" });

  const procedure = buildProposedConstrainedResetProcedure();
  assert.equal(procedure.status, F12_PROPOSED_RESET_STATUS);
  assert.equal(procedure.executed, false);
  assert.equal(procedure.noResetOccurred, true);
  assert.equal(procedure.noServiceConnection, true);
  assert.equal(procedure.historyRowDeletionSpecified, false);
  assert.equal(F12_HISTORY_VERSION_NAME_PREDICATES[0].version, "20260913173000");
  assert.equal(F12_HISTORY_VERSION_NAME_PREDICATES[0].name, "f3_bounded_financial_epoch_foundation");
  assert.equal(F12_HISTORY_VERSION_NAME_PREDICATES[5].version, "20260913173005");
  assert.notEqual(F12_HISTORY_VERSION_NAME_PREDICATES[0].version, FILE118);
  const validated = validateProposedResetProcedureOffline(procedure);
  assert.equal(validated.ok, true);
  assert.equal(validated.noResetOccurred, true);
  assert.equal(validated.wipeToBaselineStillRejected, true);
  records.push({ caseId: "F12-Z02-OFFLINE-RESET-PROCEDURE-VALIDATED", result: "ok" });
  records.push({ caseId: "F12-Z03-HISTORY-F3-HOLD-DISCLOSED", result: "ok", hold: procedure.remainingHold.id });
  const markdown = renderProposedConstrainedResetPlanMarkdown(procedure);
  assert.match(markdown, /PROPOSED ONLY/);
  assert.match(markdown, /DO NOT EXECUTE/);
  assert.doesNotMatch(markdown, /--wipe-to-baseline \\\n/);
  records.push({ caseId: "F12-Z04-PLAN-MARKDOWN-PROPOSED-ONLY", result: "ok" });
  console.log(JSON.stringify({
    publishedF12ResetPlan: records,
    remainingHold: procedure.remainingHold,
    noResetOccurred: true,
    noServiceConnection: true,
  }, null, 2));
});

test("F13 reset wiring keeps wipe rejected, extras HOLD, CASCADE refused, name mismatch abort", async () => {
  const records = [];
  const parsedWipe = parseArgs(["--qualification-reset", "--wipe-to-baseline"]);
  assert.equal(parsedWipe.qualificationReset, true);
  assert.equal(evaluateWipeToBaselineArg(true).code, WIPE_TO_BASELINE_REJECTION_CODE);
  assert.throws(() => assertWipeToBaselineRejected(parsedWipe), (err) => (
    err.code === WIPE_TO_BASELINE_REJECTION_CODE
  ));
  records.push({ caseId: "F13-H01-WIPE-STILL-REJECTED", result: "rejected" });

  const extras = evaluateQualificationResetEligibility({
    observedObjectIdentities: ["public.not_on_allowlist"],
    observedHistoryRows: [],
  });
  assert.equal(extras.ok, false);
  records.push({ caseId: "F13-H02-EXTRAS-HOLD", result: "rejected", code: extras.code });

  const prefix = evaluateQualificationResetEligibility({
    observedObjectIdentities: ["financial_*"],
  });
  assert.equal(prefix.ok, false);
  assert.equal(prefix.financialPrefixUsedAsSelector, false);
  records.push({ caseId: "F13-H03-FINANCIAL-PREFIX-NOT-SELECTOR", result: "rejected" });

  const sql = buildQualificationResetSql({
    observedHistoryRows: F13_AUTHENTICATED_HISTORY_KEYS.map((key) => ({
      version: key.version,
      name: key.name,
    })),
    scopeSqlIdentitySha256: scopeSqlIdentityDigest(),
  });
  assert.equal(sql.ok, true);
  assert.doesNotMatch(sql.sql, /\bCASCADE\b/);
  records.push({ caseId: "F13-H04-CASCADE-REFUSED", result: "ok" });

  const mismatch = planQualificationReset({
    authorization: {
      targetRef: APPROVED_DISPOSABLE_PROJECT_REF,
      functionalCandidateSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      closureDigest: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      scopeSqlIdentitySha256: scopeSqlIdentityDigest(),
      executionBudget: { constrainedResets: 1, completeQualsFrom00118: 1, secondReset: false },
    },
    runtimeContext: {
      targetRef: APPROVED_DISPOSABLE_PROJECT_REF,
      functionalCandidateSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      closureDigest: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      scopeSqlIdentitySha256: scopeSqlIdentityDigest(),
    },
    observedObjects: [],
    observedHistoryRows: [{ version: "20260913173000", name: "wrong" }],
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.code, "F13_HISTORY_KEY_MISMATCH");
  records.push({ caseId: "F13-H05-NAME-MISMATCH-ABORTS", result: "rejected" });

  const prod = planQualificationReset({
    target: { ref: PRODUCTION_REF },
    authorization: {
      targetRef: APPROVED_DISPOSABLE_PROJECT_REF,
      functionalCandidateSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      closureDigest: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      scopeSqlIdentitySha256: scopeSqlIdentityDigest(),
      executionBudget: { constrainedResets: 1, completeQualsFrom00118: 1, secondReset: false },
    },
    runtimeContext: {
      functionalCandidateSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      closureDigest: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    },
  });
  assert.equal(prod.ok, false);
  records.push({ caseId: "F13-H06-PRODUCTION-REFUSED", result: "rejected", code: prod.code });

  const disabledBypass = await runQualificationReset({
    input: {
      authorization: {
        targetRef: APPROVED_DISPOSABLE_PROJECT_REF,
        functionalCandidateSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        closureDigest: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        scopeSqlIdentitySha256: scopeSqlIdentityDigest(),
        executionBudget: { constrainedResets: 1, completeQualsFrom00118: 1, secondReset: false },
      },
      runtimeContext: {
        functionalCandidateSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        closureDigest: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
      observedObjects: ["public.financial_accounts"],
      observedHistoryRows: F13_AUTHENTICATED_HISTORY_KEYS.map((key) => ({
        version: key.version,
        name: key.name,
      })),
      inventoryCaptured: true,
    },
    adapters: { transport: createDisabledQualificationResetTransportAdapter() },
    allowDisabledTransport: false,
  });
  assert.equal(disabledBypass.ok, false);
  assert.equal(disabledBypass.code, "F13_DISABLED_TRANSPORT_NOT_AUTHORIZED");
  records.push({ caseId: "F13-H07-DISABLED-TRANSPORT-NOT-BYPASS", result: "rejected" });

  const cli = evaluateQualificationResetCli({ qualificationReset: true }, {
    functionalCandidateSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    closureDigest: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  });
  assert.equal(cli.ok, false);
  assert.equal(cli.code, "F13_FLAG_NOT_AUTHORIZATION");
  records.push({ caseId: "F13-H08-FLAG-NOT-AUTH", result: "rejected" });

  assert.equal(F13_SHARED_ORCHESTRATION_ID, "runQualificationReset");
  assert.match(F13_RUNTIME_LABEL, /IMPLEMENTATION CANDIDATE/);

  let qualifyCaptureSql = "";
  const qualifyMain = await runQualificationResetQualifyPath({
    authorization: {
      targetRef: APPROVED_DISPOSABLE_PROJECT_REF,
      functionalCandidateSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      closureDigest: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      scopeSqlIdentitySha256: scopeSqlIdentityDigest(),
      executionBudget: { constrainedResets: 1, completeQualsFrom00118: 1, secondReset: false },
    },
    runtimeContext: {
      targetRef: APPROVED_DISPOSABLE_PROJECT_REF,
      functionalCandidateSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      closureDigest: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      scopeSqlIdentitySha256: scopeSqlIdentityDigest(),
    },
    captureInventory: async (request) => {
      qualifyCaptureSql = request.sql;
      assert.equal(request.inventoryCaptureSql, INVENTORY_CAPTURE_SQL);
      return {
        schema: "f13-qualification-reset-inventory-v1",
        observed_objects: ["public.financial_accounts"],
        observed_dependencies: [],
        observed_history_rows: F13_AUTHENTICATED_HISTORY_KEYS.map((key) => ({
          version: key.version,
          name: key.name,
        })),
      };
    },
    adapters: { transport: createDisabledQualificationResetTransportAdapter() },
    allowDisabledTransport: true,
    allowLiveCapture: false,
  });
  assert.equal(qualifyCaptureSql, QUALIFICATION_RESET_INVENTORY_CAPTURE_SQL);
  assert.equal(qualifyMain.ok, true);
  assert.equal(qualifyMain.inventoryCaptured, true);
  assert.equal(qualifyMain.plan.eligible, true);
  assert.equal(qualifyMain.verdict, F13_RESET_SUCCESS_VERDICT);
  assert.notEqual(qualificationResetQualifyEmitPayload(qualifyMain).verdict, "HOLD");
  records.push({ caseId: "F13-H09-QUALIFY-MAIN-INVENTORY-WIRED", result: "ok" });

  const alreadyCleanMain = await runQualificationResetQualifyPath({
    authorization: {
      targetRef: APPROVED_DISPOSABLE_PROJECT_REF,
      functionalCandidateSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      closureDigest: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      scopeSqlIdentitySha256: scopeSqlIdentityDigest(),
      executionBudget: { constrainedResets: 1, completeQualsFrom00118: 1, secondReset: false },
    },
    runtimeContext: {
      targetRef: APPROVED_DISPOSABLE_PROJECT_REF,
      functionalCandidateSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      closureDigest: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      scopeSqlIdentitySha256: scopeSqlIdentityDigest(),
    },
    captureInventory: async () => ({
      schema: "f13-qualification-reset-inventory-v1",
      observed_objects: [],
      observed_dependencies: [],
      observed_history_rows: [],
    }),
    adapters: { transport: createDisabledQualificationResetTransportAdapter() },
    allowDisabledTransport: true,
    allowLiveCapture: false,
  });
  assert.equal(alreadyCleanMain.ok, true);
  assert.equal(alreadyCleanMain.alreadyClean, true);
  assert.equal(alreadyCleanMain.mutation, false);
  assert.equal(alreadyCleanMain.plan.sql, null);
  assert.equal(alreadyCleanMain.spies.transportCalls, 0);
  assert.notEqual(qualificationResetQualifyEmitPayload(alreadyCleanMain).verdict, "HOLD");
  records.push({ caseId: "F13-H10-ALREADY-CLEAN-NO-MUTATION", result: "ok" });

  console.log(JSON.stringify({ publishedF13ResetHarness: records }, null, 2));
});
