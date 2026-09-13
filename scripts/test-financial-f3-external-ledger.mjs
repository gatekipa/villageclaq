/**
 * LOCAL NON-API post-COMMIT / pre-external-history failure + CLI repair
 * proofs for 00118–00123. Disposable PostgreSQL 17 only. No production URL.
 *
 * Runner: local two-phase simulation (SQL COMMIT, then external
 * schema_migrations INSERT). NOT Management API equivalent. Not db push.
 * Not the 14/14 in-transaction inject suite.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createDisposableDatabase, psql } from "./fixtures/disposable-postgres.mjs";
import {
  F3_FORWARD_CHAIN,
  STUB_CORE_SQL,
  installLiveHasGroupPermission,
} from "./fixtures/f3-forward-prerequisites.mjs";
import {
  HISTORY_VERSION_FORMAT,
  HISTORICAL_PRODUCTION_APPLY_RUNNER,
  LOCAL_TWO_PHASE_SIMULATION,
  S0_M2_PRODUCTION_HISTORY,
  allocateMonotonicVersions,
  applyLocalTwoPhaseHistorySimulation,
  createRepairWorkdir,
  ensureHostedHistoryTable,
  historyHasVersion,
  historyNameFromFilename,
  installTargetVersionInsertTrigger,
  readCliHelp,
  readHostedHistory,
  removeTargetVersionInsertTrigger,
  repairHistoryApplied,
  requireSupabaseCli,
} from "./lib/f3-local-two-phase-history-simulation.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const MIGRATIONS = path.join(root, "supabase/migrations");
const RECOGNITION_SRC = path.join(root, "src/lib/financial-f3-recognition.ts");

export const FROZEN_DIGESTS = {
  "00118_f3_bounded_financial_epoch_foundation.sql":
    "517774fd883ecc8c8ba7d2e287c7245a1289b21623c839f594b0801611968f3c",
  "00119_f3_01_core_ledger_foundation.sql":
    "9b09a733ed848e2a88a894db0815bd0f33f86335b58f7c9cd58845b6607d785d",
  "00120_f3_02_secure_posting_idempotency.sql":
    "4b870418ea15160a7aec0e6df707d9c8a3afc435f2d8bd1c861e0af7c47eb505",
  "00121_f3_03_projection_read_proof.sql":
    "568ae0b15b1b6e6c0a7effd9e9b5644a294cc22d76dbbf0e6714a28888825cf5",
  "00122_f3_04_correction_reversal.sql":
    "fd2c6e8729d1c7983421804b5f028edd16170c9f9056c8db2f3994f4dff8bdf9",
  "00123_f3_05_opening_cash_command.sql":
    "848b7cbe7e4e20e2e284d88f9954be0be8ffdfe4fc6d7c649e536d0c09aab699",
};

const TARGET_PRESENT_SQL = {
  "00118_f3_bounded_financial_epoch_foundation.sql": [
    "to_regnamespace('financial_private')",
    "to_regclass('public.financial_ledger_epochs')",
  ],
  "00119_f3_01_core_ledger_foundation.sql": [
    "to_regnamespace('financial_core')",
    "to_regclass('public.financial_accounts')",
    "to_regclass('public.financial_events')",
    "to_regclass('public.financial_postings')",
    "to_regtype('public.financial_event_class')",
  ],
  "00120_f3_02_secure_posting_idempotency.sql": [
    "to_regprocedure('public.post_financial_command(jsonb)')",
  ],
  "00121_f3_03_projection_read_proof.sql": [
    "to_regprocedure('public.get_financial_projection_bundle(uuid,timestamptz,timestamptz,timestamptz)')",
    "to_regprocedure('public.get_financial_cashbook(uuid,timestamptz,timestamptz,uuid,text,integer,integer)')",
  ],
  "00122_f3_04_correction_reversal.sql": [
    "to_regprocedure('public.correct_financial_event(jsonb)')",
  ],
  "00123_f3_05_opening_cash_command.sql": [
    "to_regprocedure('public.post_financial_opening_cash(jsonb)')",
  ],
};

const CATALOG_SQL = `
SELECT jsonb_build_object(
  'schema', (
    SELECT coalesce(string_agg(nspname || ':' || pg_get_userbyid(nspowner), ',' ORDER BY nspname), '')
    FROM pg_namespace WHERE nspname IN ('financial_core','financial_private')
  ),
  'relations', (
    SELECT coalesce(string_agg(
      n.nspname || '.' || c.relname || ':' || c.relkind::text || ':' || pg_get_userbyid(c.relowner) ||
      ':rls=' || c.relrowsecurity::text,
      ',' ORDER BY 1), '')
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r','v','m','S')
      AND (n.nspname IN ('financial_core','financial_private')
           OR (n.nspname = 'public' AND c.relname LIKE 'financial_%'))
  ),
  'types', (
    SELECT coalesce(string_agg(n.nspname || '.' || t.typname || ':' || pg_get_userbyid(t.typowner), ',' ORDER BY 1), '')
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname LIKE 'financial_%'
  ),
  'function_def', (
    SELECT coalesce(string_agg(
      n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || '):' ||
      pg_get_userbyid(p.proowner) || ':' || p.prosecdef::text || ':' ||
      coalesce(p.proconfig::text, '') || ':' || md5(pg_get_functiondef(p.oid)),
      ',' ORDER BY 1), '')
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public','financial_core','financial_private')
      AND (n.nspname LIKE 'financial_%' OR p.proname ~ 'financial|f3_|guard_ledger')
  ),
  'acl', (
    SELECT coalesce(string_agg(part, ',' ORDER BY part), '') FROM (
      SELECT n.nspname || '.' || c.relname || ':' || coalesce(c.relacl::text, '') AS part
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r'
        AND (n.nspname IN ('financial_core','financial_private')
             OR (n.nspname = 'public' AND c.relname LIKE 'financial_%'))
      UNION ALL
      SELECT n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || '):' ||
             coalesce(p.proacl::text, '')
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname IN ('public','financial_core','financial_private')
        AND (n.nspname LIKE 'financial_%' OR p.proname ~ 'financial|f3_|guard_ledger')
    ) a
  ),
  'policy', (
    SELECT coalesce(string_agg(
      schemaname || '.' || tablename || '.' || policyname || ':' || cmd || ':' ||
      coalesce(roles::text, '') || ':' || coalesce(qual, '') || ':' || coalesce(with_check, ''),
      ',' ORDER BY 1), '')
    FROM pg_policies
    WHERE schemaname IN ('public','financial_core','financial_private')
      AND (tablename LIKE 'financial_%' OR schemaname LIKE 'financial_%')
  )
)::text
`;

function readMigration(name) {
  return fs.readFileSync(path.join(MIGRATIONS, name), "utf8");
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function catalogFingerprint(url) {
  const json = psql(url, CATALOG_SQL);
  return { json, md5: createHash("md5").update(json).digest("hex"), parsed: JSON.parse(json) };
}

function assertTargetsPresent(url, name) {
  for (const expr of TARGET_PRESENT_SQL[name]) {
    assert.equal(psql(url, `SELECT ${expr} IS NULL`), "f", `${name} missing ${expr}`);
  }
}

function assertSuccessfulSecurity(url) {
  const drift = psql(
    url,
    `SELECT coalesce(string_agg(n.nspname||'.'||p.proname||':'||pg_get_userbyid(p.proowner), ',' ORDER BY 1), '')
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.prosecdef
       AND n.nspname IN ('public','financial_core','financial_private')
       AND p.proname NOT IN ('has_group_permission','enqueue_outbound_notification')
       AND (pg_get_userbyid(p.proowner) IS DISTINCT FROM 'postgres'
            OR p.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[])`,
  );
  assert.equal(drift, "");
  const rlsOff = psql(
    url,
    `SELECT coalesce(string_agg(n.nspname||'.'||c.relname, ','), '')
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r'
       AND n.nspname IN ('public','financial_private','financial_core')
       AND c.relname LIKE 'financial_%'
       AND NOT c.relrowsecurity`,
  );
  assert.equal(rlsOff, "");
  const hgp = psql(
    url,
    `SELECT count(*) || ':' || md5(pg_get_functiondef(p.oid)) || ':' || md5(p.prosrc)
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'has_group_permission'
     GROUP BY p.oid`,
  );
  assert.equal(hgp, "1:695368464e97297fbf0f90ce7345162f:96a296dfd541c7fc75ec68c4da1d92ff");
  for (const fn of [
    "public.post_financial_command(jsonb)",
    "public.correct_financial_event(jsonb)",
    "public.post_financial_opening_cash(jsonb)",
  ]) {
    if (psql(url, `SELECT to_regprocedure('${fn}') IS NOT NULL`) === "t") {
      assert.equal(psql(url, `SELECT has_function_privilege('authenticated','${fn}','EXECUTE')`), "t");
      assert.equal(psql(url, `SELECT has_function_privilege('anon','${fn}','EXECUTE')`), "f");
      assert.equal(psql(url, `SELECT has_function_privilege('service_role','${fn}','EXECUTE')`), "f");
    }
  }
}

function assertRecognitionInvariant() {
  const src = fs.readFileSync(RECOGNITION_SRC, "utf8");
  assert.match(src, /export const F3_RECOGNIZED_SOA_INCOME_EFFECT_KINDS = \["manual_income"\] as const/);
}

function applyExact(url, file, version, extra = {}) {
  return applyLocalTwoPhaseHistorySimulation({
    url,
    fileAbsPath: path.join(MIGRATIONS, file),
    version,
    name: historyNameFromFilename(file),
    ...extra,
  });
}

function withFloor(throughIndex, versions, fn) {
  const db = createDisposableDatabase("xled");
  try {
    psql(db.url, STUB_CORE_SQL);
    installLiveHasGroupPermission(db.url);
    ensureHostedHistoryTable(db.url);
    for (let i = 0; i <= throughIndex; i += 1) {
      if (i < 0) break;
      const file = F3_FORWARD_CHAIN[i];
      const result = applyExact(db.url, file, versions[file]);
      assert.equal(result.skipped, false);
      assert.equal(result.phase, "applied");
    }
    return fn(db);
  } finally {
    db.close();
  }
}

function runPostCommitPreLedger(file) {
  assertRecognitionInvariant();
  const idx = F3_FORWARD_CHAIN.indexOf(file);
  assert.ok(idx >= 0, file);
  const versions = allocateMonotonicVersions(F3_FORWARD_CHAIN);
  const version = versions[file];
  const name = historyNameFromFilename(file);
  const bytes = readMigration(file);
  assert.equal(sha256(bytes), FROZEN_DIGESTS[file], `${file} digest drifted`);
  assert.match(version, /^\d{14}$/);

  return withFloor(idx - 1, versions, (db) => {
    const preCatalog = catalogFingerprint(db.url);
    const preHistory = readHostedHistory(db.url);
    assert.equal(historyHasVersion(db.url, version), false);

    installTargetVersionInsertTrigger(db.url, version);
    let failed;
    try {
      applyExact(db.url, file, version);
      throw new Error("expected external history insert to fail");
    } catch (err) {
      if (/expected external/.test(err.message)) throw err;
      failed = err;
    }
    assert.equal(failed.phase, "external_history", failed.message);
    assert.equal(failed.committedSql, true);
    assert.notEqual(failed.status, 0);
    assert.match(String(failed.message), /F3_EXTERNAL_LEDGER_INJECT|EXTERNAL_HISTORY_INSERT_FAILED/);
    assert.equal(historyHasVersion(db.url, version), false, `${file} version leaked into history`);
    assert.equal(readHostedHistory(db.url), preHistory);
    assertTargetsPresent(db.url, file);
    assertSuccessfulSecurity(db.url);
    const committedCatalog = catalogFingerprint(db.url);
    assert.notEqual(committedCatalog.md5, preCatalog.md5, `${file} SQL COMMIT must change catalog`);

    removeTargetVersionInsertTrigger(db.url);
    assert.equal(sha256(readMigration(file)), FROZEN_DIGESTS[file]);
    assert.equal(catalogFingerprint(db.url).md5, committedCatalog.md5, "removing trigger must not drift catalog");

    const { workdir, lookup } = createRepairWorkdir({ version, name, sqlBytes: bytes });
    assert.equal(sha256(fs.readFileSync(lookup, "utf8")), FROZEN_DIGESTS[file]);
    const repair = repairHistoryApplied({ version, dbUrl: db.tcpUrl, workdir });
    assert.equal(repair.status, 0, `${repair.command}\n${repair.stderr}\n${repair.stdout}`);
    assert.match(repair.command, new RegExp(`migration repair ${version} --status applied --db-url `));
    assert.equal(historyHasVersion(db.url, version), true);
    const recorded = psql(
      db.url,
      `SELECT version || ':' || name FROM supabase_migrations.schema_migrations WHERE version = '${version}'`,
    );
    assert.equal(recorded, `${version}:${name}`);
    assert.equal(catalogFingerprint(db.url).md5, committedCatalog.md5, "repair must not drift catalog");
    assertSuccessfulSecurity(db.url);
    assertRecognitionInvariant();

    const again = applyExact(db.url, file, version, {
      skipIfPresent: true,
    });
    assert.equal(again.skipped, true);
    assert.equal(again.phase, "local_helper_skip_already_recorded");
    assert.equal(again.managementApiEquivalent, false);
    assert.equal(catalogFingerprint(db.url).md5, committedCatalog.md5, "local helper skip must not rerun SQL");

    const nextFile = F3_FORWARD_CHAIN[idx + 1];
    if (nextFile) {
      const next = applyExact(db.url, nextFile, versions[nextFile]);
      assert.equal(next.skipped, false);
      assert.equal(next.phase, "applied");
      assertTargetsPresent(db.url, nextFile);
      assert.equal(historyHasVersion(db.url, versions[nextFile]), true);
      assertSuccessfulSecurity(db.url);
    } else {
      const followVersion = allocateMonotonicVersions(["follow.sql"], Date.now() + 60_000)["follow.sql"];
      const followName = "f3_external_ledger_followon_probe";
      const followSql = "SELECT 1;\n";
      const tmp = path.join(workdir, "supabase", "migrations", `${followVersion}_${followName}.sql`);
      fs.writeFileSync(tmp, followSql);
      const follow = applyLocalTwoPhaseHistorySimulation({
        url: db.url,
        fileAbsPath: tmp,
        version: followVersion,
        name: followName,
      });
      assert.equal(follow.phase, "applied");
      assert.equal(historyHasVersion(db.url, followVersion), true);
      assert.equal(catalogFingerprint(db.url).md5, committedCatalog.md5, "follow-on SELECT 1 must not drift F3 catalog");
      assertSuccessfulSecurity(db.url);
    }

    fs.rmSync(workdir, { recursive: true, force: true });
    return {
      file,
      version,
      name,
      repairCommand: repair.command,
      committedMd5: committedCatalog.md5,
    };
  });
}

test("runner pin: historical Management API vs local NON-API simulation; CLI repair syntax from --help", () => {
  const cliVersion = requireSupabaseCli();
  assert.match(cliVersion, /2\.\d+\.\d+/);
  const repairHelp = readCliHelp(["migration", "repair", "--help"]);
  assert.equal(repairHelp.status, 0, repairHelp.text);
  assert.match(repairHelp.text, /--status/);
  assert.match(repairHelp.text, /applied/);
  assert.match(repairHelp.text, /--db-url/);
  assert.match(repairHelp.text, /\[<version\.\.\.>\]|version/);
  const pushHelp = readCliHelp(["db", "push", "--help"]);
  assert.match(pushHelp.text, /Push new migrations/);
  assert.equal(HISTORICAL_PRODUCTION_APPLY_RUNNER.includes("Management API"), true);
  assert.match(LOCAL_TWO_PHASE_SIMULATION, /NOT Management API/);
  assert.equal(HISTORY_VERSION_FORMAT, "YYYYMMDDHHMMSS");
  for (const row of S0_M2_PRODUCTION_HISTORY) {
    assert.match(row.version, /^\d{14}$/);
    assert.equal(row.source_label === row.version, false);
    assert.equal(historyNameFromFilename(row.file), row.name);
  }
  assert.equal(
    historyNameFromFilename("00118_f3_bounded_financial_epoch_foundation.sql"),
    "f3_bounded_financial_epoch_foundation",
  );
});

test("frozen 00118-00123 digests are byte-identical; 14/14 suite is pre-commit only", () => {
  for (const [name, digest] of Object.entries(FROZEN_DIGESTS)) {
    assert.equal(sha256(readMigration(name)), digest, name);
  }
  const atomicity = fs.readFileSync(path.join(root, "scripts/test-financial-f3-migration-atomicity.mjs"), "utf8");
  assert.match(atomicity, /SQL pre-commit rollback/);
  assert.match(atomicity, /NOT CLI-equivalent/);
  const prereq = fs.readFileSync(path.join(root, "scripts/fixtures/f3-forward-prerequisites.mjs"), "utf8");
  assert.match(prereq, /NOT a CLI equivalent/);
});

test("00118 post-commit / pre-ledger failure then founder CLI repair", () => {
  runPostCommitPreLedger("00118_f3_bounded_financial_epoch_foundation.sql");
});

test("00119 post-commit / pre-ledger failure then founder CLI repair", () => {
  runPostCommitPreLedger("00119_f3_01_core_ledger_foundation.sql");
});

test("00120 post-commit / pre-ledger failure then founder CLI repair", () => {
  runPostCommitPreLedger("00120_f3_02_secure_posting_idempotency.sql");
});

test("00121 post-commit / pre-ledger failure then founder CLI repair", () => {
  runPostCommitPreLedger("00121_f3_03_projection_read_proof.sql");
});

test("00122 post-commit / pre-ledger failure then founder CLI repair", () => {
  runPostCommitPreLedger("00122_f3_04_correction_reversal.sql");
});

test("00123 post-commit / pre-ledger failure then founder CLI repair", () => {
  runPostCommitPreLedger("00123_f3_05_opening_cash_command.sql");
});

test("founder repair runbook forbids automatic repair and requires timestamp version", () => {
  const runbook = fs.readFileSync(
    path.join(root, "docs/runbooks/F3_FOUNDER_CONTROLLED_MIGRATION_REPAIR.md"),
    "utf8",
  );
  assert.match(runbook, /NEVER automatic/);
  assert.match(runbook, /migration repair/);
  assert.match(runbook, /--status applied/);
  assert.match(runbook, /YYYYMMDDHHMMSS/);
  assert.doesNotMatch(runbook, /repair 00118 /);
  assert.match(runbook, /HOLD/);
  assert.match(runbook, /NOT FOR PRODUCTION USE/);
  assert.match(runbook, /UNRECOVERABLE/);
  assert.match(runbook, /withdrawn/i);
  assert.match(runbook, /apply-time clock/);
  assert.match(runbook, /NOT proven/);
  const supersededLedger = fs.readFileSync(
    path.join(root, "docs/evidence/M3_F3_EXTERNAL_LEDGER_REMEDIATION_20260913.md"),
    "utf8",
  );
  assert.match(supersededLedger, /SUPERSEDED — DO NOT READ AS CURRENT/);
  assert.match(supersededLedger, /WITHDRAWN/);
  assert.match(supersededLedger, /BLOCKED/);
});
