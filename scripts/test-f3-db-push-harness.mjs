/**
 * Local fail-closed tests for the supabase db push qualification candidate.
 * No hosted call is made. Gate failures must spawn zero database-targeting
 * processes. 00118–00123 SQL bytes are never rewritten.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
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
  fingerprintCanonicalSha256,
  fingerprintCompleteAndExact,
  FROZEN_EXPECTED_FINGERPRINT_SHA256,
  SUPERSEDED_FROZEN_EXPECTED_FINGERPRINT_SHA256,
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
  clearEnv();
});

afterEach(() => {
  __resetDbPushSpawnForTests();
  __resetDbPushFetchForTests();
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
  return {
    schema: "financial_private:postgres",
    function_owner: "public.guard_ledger():postgres:true:",
    acl: "financial_private.epochs:",
    policy: "financial_private.epochs.p:ALL:{public}:true:true",
    f3_objects_absent: false,
    ...overrides,
  };
}

function passingFingerprint(file = FILE118) {
  const expected = getFrozenExpectedFingerprint(file);
  const catalog = {
    schema: expected.schema,
    function_owner: expected.function_owner,
    acl: expected.acl,
    policy: expected.policy,
    f3_objects_absent: expected.f3_objects_absent,
  };
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
  return {
    status: 0,
    stdout: JSON.stringify({ trigger_present: false, function_present: false }),
    stderr: "",
  };
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
  const catalog = {
    schema: expected.schema,
    function_owner: expected.function_owner,
    acl: expected.acl,
    policy: expected.policy,
    f3_objects_absent: expected.f3_objects_absent,
  };
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
    observed.rls = "on";
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
  const catalog = {
    schema: expected.schema,
    function_owner: expected.function_owner,
    acl: expected.acl,
    policy: expected.policy,
    f3_objects_absent: expected.f3_objects_absent,
  };
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
    schema: "mutated-schema-should-not-touch-expected",
    function_owner: expected.function_owner,
    acl: expected.acl,
    policy: expected.policy,
    f3_objects_absent: false,
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
  assert.deepEqual(recorded.sha256BeforeDb, {
    "00118_f3_bounded_financial_epoch_foundation.sql": "0a403e8d3848e07769fcb453b78deebb1ad29217f4ed1d9c684dc64ca1b27a02",
    "00119_f3_01_core_ledger_foundation.sql": "ca61697371861b6a8b59b6be2505bacdc1491446410941ca4f4e3f89a5b1bbdf",
    "00120_f3_02_secure_posting_idempotency.sql": "9c10de93a78f837d84d9b9232c94e0bdb731c9e748763ca53f80349ad0b37161",
    "00121_f3_03_projection_read_proof.sql": "17ebfe3eb6a503056940b58965a86f88b2cad91bea4720c12ac4b9797e7f25af",
    "00122_f3_04_correction_reversal.sql": "07675b49e6321dff9bebfcd5c245e8fb56a97937b823d896032b008427439f16",
    "00123_f3_05_opening_cash_command.sql": "5017ff96ad59c6ca42c93719dfc92f3137ccb591f00bf1acf6bfbefcdf7ba965",
  });
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
  const observed119 = buildIndependentObservedFingerprint("00119_f3_01_core_ledger_foundation.sql", {
    schema: frozen119.schema,
    function_owner: [...frozen119.function_owner].reverse(),
    acl: [...frozen119.acl].reverse(),
    policy: [...frozen119.policy].reverse(),
    f3_objects_absent: frozen119.f3_objects_absent,
  });
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
    assert.ok(phase.keyset.includes("function_owner"));
    assert.ok(phase.keyset.includes("acl"));
    assert.ok(phase.keyset.includes("policy"));
    assert.ok(phase.keyset.includes("recognition"));
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
  const sealed = {
    "00118_f3_bounded_financial_epoch_foundation.sql": "0a403e8d3848e07769fcb453b78deebb1ad29217f4ed1d9c684dc64ca1b27a02",
    "00119_f3_01_core_ledger_foundation.sql": "ca61697371861b6a8b59b6be2505bacdc1491446410941ca4f4e3f89a5b1bbdf",
    "00120_f3_02_secure_posting_idempotency.sql": "9c10de93a78f837d84d9b9232c94e0bdb731c9e748763ca53f80349ad0b37161",
    "00121_f3_03_projection_read_proof.sql": "17ebfe3eb6a503056940b58965a86f88b2cad91bea4720c12ac4b9797e7f25af",
    "00122_f3_04_correction_reversal.sql": "07675b49e6321dff9bebfcd5c245e8fb56a97937b823d896032b008427439f16",
    "00123_f3_05_opening_cash_command.sql": "5017ff96ad59c6ca42c93719dfc92f3137ccb591f00bf1acf6bfbefcdf7ba965",
  };
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
