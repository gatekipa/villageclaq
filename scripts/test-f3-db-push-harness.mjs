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
  HISTORY_INJECT_MARKER,
  LIVE_PROBE_THROWAWAY_TABLE,
  MANAGEMENT_API_APPLY_PERMANENTLY_DISQUALIFIED,
  MGMT_TOKEN_ENV,
  PREASSIGNED_NAMES,
  PREASSIGNED_VERSIONS,
  PRODUCTION_HISTORY_CEILING_VERSION,
  PRODUCTION_REF,
  RECOGNITION_ALLOWLIST,
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
  classifyDbPushHistoryFailure,
  historyInjectSqlForFile,
  historyInjectSqlForVersion,
} from "./lib/f3-db-push-history-inject.mjs";
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
  assert.match(qualify, /FILE-BASED RUNNER MECHANICS PASS/);
  assert.match(qualify, /runGatedRemoteSqlText/);
  assert.match(qualify, /--wipe-to-baseline/);
  assert.match(qualify, /--no-wipe/);
  assert.match(qualify, /re-wipe is forbidden/);
  assert.match(qualify, /evaluatePreStubFloorCleanCheck/);
  assert.match(qualify, /inventoryFromQuery/);
  assert.match(qualify, /f3-db-push-query-parse/);
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
