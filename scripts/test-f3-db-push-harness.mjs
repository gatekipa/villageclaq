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
  REPAIR_SAFETY_HOLD,
  assertExpectedFingerprintImmutable,
  buildIndependentObservedFingerprint,
  evaluateRepairSafetyGate,
  expectedFingerprintSha256,
  fingerprintCanonicalSha256,
  fingerprintCompleteAndExact,
  FROZEN_EXPECTED_FINGERPRINT_SHA256,
  getFrozenExpectedFingerprint,
  objectsPresentFromProbe,
  recordPreDbExpectedHashes,
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
  assert.match(qualify, /buildIndependentObservedFingerprint/);
  assert.match(qualify, /recordPreDbExpectedHashes/);
  assert.match(qualify, /expectedFingerprintsBeforeDb/);
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
  const exprs = TARGET_OBJECT_PROBES[file] || [];
  const row = {};
  exprs.forEach((expr, i) => {
    const quoted = String(expr).match(/'([^']+)'/);
    row[`p${i}`] = quoted ? quoted[1] : null;
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
    ["owner", (e, o) => { o.function_owner = o.function_owner.replace("postgres", "ubuntu"); }],
    ["acl", (e, o) => { o.acl = o.acl.replace("authenticated=r/postgres", "authenticated=arwd/postgres"); }],
    ["policy", (e, o) => { o.policy = o.policy.replace("SELECT", "ALL"); }],
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
  reordered.schema = ` ${expected.schema} `;
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
    observed.acl = observed.acl.replace("postgres=arwdDxtm/postgres", "ubuntu=arwdDxtm/postgres");
    return observed;
  });
  assert.equal(fingerprintCompleteAndExact(security, FILE118).ok, false, "acl owner change");

  const policyWs = frozenPair((observed) => {
    observed.policy = observed.policy.replace(/\n/g, " ");
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
  assert.deepEqual(recorded.sha256BeforeDb, {
    "00118_f3_bounded_financial_epoch_foundation.sql": "a1538e7d2d451c198350535128ece77cbe54ad31cd11d6d902f7efc0ece231c5",
    "00119_f3_01_core_ledger_foundation.sql": "422c5d8b22ae4c07f59261f09988afccf80efb85f3c05dc5c3c91063a12f7f4c",
    "00120_f3_02_secure_posting_idempotency.sql": "1f5433b99ee60148fe708c51e576ce50cf082e8279e32057aa8e0e1a2e450610",
    "00121_f3_03_projection_read_proof.sql": "6705f7bb63cf18eda2b22bace9ff69c2c915207238f760437eccf08441e95c3c",
    "00122_f3_04_correction_reversal.sql": "e84cf051957897be0434d6b2fb71a3f4317228080d994110ec4470b8cb97b9ee",
    "00123_f3_05_opening_cash_command.sql": "3ff28c4c5f3f31c05014febd2c4e25158b597048f5e1e3bc7ea23a1d7ef40b66",
  });
  for (const file of F3_FORWARD_FILES) {
    const clone = getFrozenExpectedFingerprint(file);
    clone.acl = "mutated-clone";
    assertExpectedFingerprintImmutable(file);
    assert.equal(expectedFingerprintSha256(file), recorded.sha256BeforeDb[file]);
  }
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
  const pushIdx = seq.indexOf("runDbPushCandidate");
  const gateIdx = seq.indexOf("runRepairSafetyThenMaybeRepair");
  const repairIdx = seq.indexOf("runFilenameVersionRepair");
  const retryIdx = seq.lastIndexOf("runDbPushCandidate");
  assert.ok(stageIdx >= 0 && stageIdx < pushIdx, "stage current file before first push");
  assert.ok(gateIdx >= 0 && repairIdx > gateIdx);
  assert.ok(retryIdx > repairIdx, "retry push after repair");
  // Sealed hosted-run: stage once per loop iteration (no second sync before retry).
  assert.equal((seq.match(/syncIsolatedMigrationsThrough/g) || []).length, 1);
  assert.match(qualify, /syncIsolatedMigrationsThrough/);
  assert.match(qualify, /function objectsPresentFromProbe/);
  assert.match(qualify, /verifyPoisonAbsent/);
  assert.match(qualify, /QUALIFICATION_PASS/);
  assert.match(qualify, /REPAIR_SAFETY_HOLD/);
  assert.match(qualify, /mechanicsPass = "SUPERSEDED"/);
  assert.match(qualify, /FILE-BASED RUNNER QUALIFICATION PASS — STUB\/LIVE-PIN FLOOR LIMITATION/);
  assert.match(qualify, /DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117/);
});

test("real isolated staging stages exactly one intended file and blocks unexpected files", () => {
  const isolated = createIsolatedDbPushWorkdir();
  const migDir = path.join(isolated.workdir, "supabase", "migrations");
  const listMig = () => fs.readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
  const repoBefore = assertFrozenDigestsOnDisk();
  assert.equal(isolated.copies.length, 6);
  assert.equal(listMig().length, 6);

  const first = syncIsolatedMigrationsThrough(isolated, F3_FORWARD_FILES[0]);
  assert.deepEqual(first, [timestampFilenameFor(F3_FORWARD_FILES[0])]);
  assert.deepEqual(listMig(), first);
  for (const later of F3_FORWARD_FILES.slice(1)) {
    assert.equal(fs.existsSync(path.join(migDir, timestampFilenameFor(later))), false, later);
  }

  const retryStaged = listMig();
  assert.deepEqual(retryStaged, first, "retry inspects the same staged workdir; no cascade files appear");

  const laterFile = F3_FORWARD_FILES[4];
  const later = syncIsolatedMigrationsThrough(isolated, laterFile);
  assert.deepEqual(later, [timestampFilenameFor(laterFile)]);
  assert.deepEqual(listMig(), later);
  assert.equal(fs.existsSync(path.join(migDir, first[0])), false);

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
