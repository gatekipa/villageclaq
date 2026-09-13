/**
 * Founder-authorized disposable qualifier for supabase db push (CLI 2.117.0).
 *
 * QUALIFICATION CANDIDATE ONLY. Not production approval.
 * Management API POST /database/migrations {query,name} is permanently
 * disqualified and is never called here.
 *
 * NEVER targets production. NEVER prints the DB password or constructed URL.
 * Requires exact disposable ref/host + sentinel + destructive opt-in + password.
 *
 * If env is absent: exit 2 NOT_RUN with a Chief runbook (no child process
 * that can reach a database).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  APPROVED_DISPOSABLE_HOST,
  APPROVED_DISPOSABLE_ORG_ID,
  APPROVED_DISPOSABLE_PROJECT_NAME,
  APPROVED_DISPOSABLE_PROJECT_REF,
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
  writeIsolatedSqlFile,
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
  objectProbeSql,
} from "./lib/f3-db-push-history-inject.mjs";
import {
  CATALOG_FINGERPRINT_SQL,
  FLOOR_AUTHORITY,
  FLOOR_HOLD_IF_INEXACT,
  floorFileAbsPath,
  floorPrecheck,
  listFloorMigrationsThrough00117,
  readFloorBootstrapSql,
  recognitionFromSource,
} from "./lib/f3-db-push-floor.mjs";

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
      "node scripts/qualify-f3-db-push-disposable.mjs --prep-floor --sequence-f3",
    ],
    candidateCommand:
      "supabase db push --db-url <in-process URL> --workdir <isolated> --yes --skip-vault",
    repairCommand:
      "supabase migration repair <FILENAME_VERSION> --status applied --db-url <in-process URL> --workdir <isolated> --yes",
    managementApiApply: MANAGEMENT_API_APPLY_DISQUALIFICATION,
    versionsKnownBeforeExecution: PREASSIGNED_VERSIONS,
    recognition: [...RECOGNITION_ALLOWLIST],
    floor: FLOOR_AUTHORITY,
    holdIfFloorInexact: FLOOR_HOLD_IF_INEXACT,
    bans: [
      `Do not target ${PRODUCTION_REF}`,
      "Do not delete or pause the disposable project",
      "Do not rename or rewrite 00118–00123 SQL bytes",
      "Do not use -p / --password on argv",
      "Do not echo the db-url",
      "Do not POST /database/migrations",
      "Do not claim production approval",
      "Do not auto-repair; founder auth required for any production apply/repair",
    ],
  };
}

function parseArgs(argv) {
  return {
    prepFloor: argv.includes("--prep-floor"),
    sequenceF3: argv.includes("--sequence-f3"),
    skipCleanup: argv.includes("--skip-cleanup"),
    evidenceOut: (() => {
      const idx = argv.indexOf("--evidence-out");
      return idx >= 0 ? argv[idx + 1] : null;
    })(),
  };
}

function parseJsonish(text) {
  if (text == null) return null;
  const s = String(text).trim();
  const start = s.search(/[\[{]/);
  if (start < 0) return s;
  try {
    return JSON.parse(s.slice(start));
  } catch {
    return s;
  }
}

function rowsFromQuery(result) {
  const parsed = parseJsonish(result?.stdout);
  if (Array.isArray(parsed)) {
    if (parsed.length && parsed[0] && typeof parsed[0] === "object" && parsed[0].json_agg) {
      return Array.isArray(parsed[0].json_agg) ? parsed[0].json_agg : parseJsonish(parsed[0].json_agg) || [];
    }
    if (parsed.length && parsed[0] && typeof parsed[0] === "object" && parsed[0].jsonb_build_object) {
      return parsed[0].jsonb_build_object;
    }
    return parsed;
  }
  if (parsed && typeof parsed === "object") return parsed;
  return [];
}

function objectsPresentFromProbe(result) {
  const text = `${result?.stdout || ""}\n${result?.stderr || ""}`;
  if (/\bNULL\b/.test(text) && !/\bfinancial_|\bpost_financial|\bcorrect_financial/.test(text)) {
    return false;
  }
  if (/\((f3_|financial_)/i.test(text)) return true;
  if (/financial_private|financial_core|financial_ledger_epochs|financial_accounts|post_financial_command|correct_financial_event|post_financial_opening_cash/.test(text)) {
    return /[a-z0-9_]+\.[a-z0-9_]+/.test(text) && !/\(NULL\)/.test(text);
  }
  return /t\b/.test(text) && !/\bf\b/.test(text);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!dbPushGatesSatisfiedFromEnv()) {
    const payload = chiefRunbook();
    console.log(JSON.stringify(payload, null, 2));
    if (args.evidenceOut) {
      fs.mkdirSync(path.dirname(path.resolve(root, args.evidenceOut)), { recursive: true });
      fs.writeFileSync(path.resolve(root, args.evidenceOut), JSON.stringify(payload, null, 2));
    }
    process.exit(2);
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
    managementApiApply: MANAGEMENT_API_APPLY_DISQUALIFICATION,
    projectRef: APPROVED_DISPOSABLE_PROJECT_REF,
    host: APPROVED_DISPOSABLE_HOST,
    recognition: recognitionFromSource(),
    frozenDigests: assertFrozenDigestsOnDisk(),
    versionsKnownBeforeExecution: { ...PREASSIGNED_VERSIONS },
    collision: null,
    identity: null,
    inventoryBefore: null,
    cleanup: null,
    floor: null,
    cli: null,
    help: null,
    sequence: [],
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
    evidence.inventoryBefore = { status: inventory.status, body: parseJsonish(inventory.stdout) };
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

    const precheck = floorPrecheck();
    evidence.floor = { precheck, authority: FLOOR_AUTHORITY, installed: false };
    if (args.prepFloor) {
      const steps = [];
      const bootstrapFile = writeIsolatedSqlFile(isolated.workdir, "floor-bootstrap.sql", readFloorBootstrapSql());
      const boot = await runDbQuery({
        bin: cli.bin,
        workdir: isolated.workdir,
        help: queryHelp,
        fileAbsPath: bootstrapFile,
      });
      steps.push({ id: "bootstrap", status: boot.status, stdout: boot.stdout, stderr: boot.stderr });
      let floorOk = boot.status === 0;
      for (const file of listFloorMigrationsThrough00117()) {
        const applied = await runDbQuery({
          bin: cli.bin,
          workdir: isolated.workdir,
          help: queryHelp,
          fileAbsPath: floorFileAbsPath(file),
        });
        const already = /already exists|duplicate_object|duplicate_function/i.test(`${applied.stdout}\n${applied.stderr}`);
        const ok = applied.status === 0 || already;
        steps.push({ id: file, status: applied.status, ok, already });
        if (!ok) {
          floorOk = false;
          break;
        }
      }
      const fingerprint = await runDbQuery({
        bin: cli.bin,
        workdir: isolated.workdir,
        help: queryHelp,
        sql: CATALOG_FINGERPRINT_SQL,
      });
      evidence.floor = {
        ...evidence.floor,
        installed: floorOk,
        exact: floorOk,
        steps,
        fingerprint: { status: fingerprint.status, body: parseJsonish(fingerprint.stdout) },
      };
      if (!floorOk) {
        evidence.status = "HOLD";
        evidence.verdict = FILE_BASED_RUNNER_VERDICTS.HOLD;
        evidence.limitation = FLOOR_HOLD_IF_INEXACT;
        throw Object.assign(new Error(FLOOR_HOLD_IF_INEXACT), { code: "F3_DBPUSH_FLOOR_HOLD" });
      }
    } else {
      evidence.floor.skipped = true;
      evidence.floor.note = "Pass --prep-floor to install repository-controlled 00001–00117 floor.";
    }

    if (args.sequenceF3) {
      for (const file of F3_FORWARD_FILES) {
        const version = preassignedVersionFor(file);
        const injectSql = historyInjectSqlForFile(file);
        const injectFile = writeIsolatedSqlFile(isolated.workdir, `inject-${version}.sql`, injectSql);
        const inject = await runDbQuery({
          bin: cli.bin,
          workdir: isolated.workdir,
          help: queryHelp,
          fileAbsPath: injectFile,
        });
        const push = runDbPushCandidate({
          bin: cli.bin,
          workdir: isolated.workdir,
          help: pushHelp,
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
        const objectsPresent = objectsPresentFromProbe(probe);
        const classification = classifyDbPushHistoryFailure({
          exitStatus: push.status,
          stdout: push.stdout,
          stderr: push.stderr,
          historyRows: rowsFromQuery(historyAfterFail),
          targetVersion: version,
          objectsPresent,
        });
        await runDbQuery({
          bin: cli.bin,
          workdir: isolated.workdir,
          help: queryHelp,
          sql: REMOVE_HISTORY_INJECT_SQL,
        });
        const fingerprintBeforeRepair = await runDbQuery({
          bin: cli.bin,
          workdir: isolated.workdir,
          help: queryHelp,
          sql: CATALOG_FINGERPRINT_SQL,
        });
        const repair = runFilenameVersionRepair({
          bin: cli.bin,
          version,
          workdir: isolated.workdir,
          help: repairHelp,
        });
        const historyAfterRepair = await runDbQuery({
          bin: cli.bin,
          workdir: isolated.workdir,
          help: queryHelp,
          sql: READ_SCHEMA_MIGRATIONS_SQL,
        });
        const fingerprintAfterRepair = await runDbQuery({
          bin: cli.bin,
          workdir: isolated.workdir,
          help: queryHelp,
          sql: CATALOG_FINGERPRINT_SQL,
        });
        const retry = runDbPushCandidate({
          bin: cli.bin,
          workdir: isolated.workdir,
          help: pushHelp,
        });
        evidence.sequence.push({
          file,
          destName: timestampFilenameFor(file),
          version,
          digest: FROZEN_DIGESTS[file],
          inject: { status: inject.status },
          push,
          classification,
          objectsPresent,
          historyAfterFail: rowsFromQuery(historyAfterFail),
          fingerprintBeforeRepair: parseJsonish(fingerprintBeforeRepair.stdout),
          repair,
          historyAfterRepair: rowsFromQuery(historyAfterRepair),
          fingerprintAfterRepair: parseJsonish(fingerprintAfterRepair.stdout),
          retry,
        });
        if (!classification.nonzeroExit || !classification.targetVersionAbsent) {
          evidence.status = "HOLD";
          evidence.verdict = FILE_BASED_RUNNER_VERDICTS.HOLD;
          evidence.limitation = `HOLD: ${file} did not prove history-failure + absent version`;
          break;
        }
      }
    }

    if (evidence.status === "RUNNING") {
      const listedAfter = await runMigrationList({
        bin: cli.bin,
        workdir: isolated.workdir,
        help: listHelp,
      });
      evidence.migrationListAfter = listedAfter;
      if (args.sequenceF3 && evidence.sequence.length === F3_FORWARD_FILES.length) {
        evidence.status = "OBSERVED — hosted db push sequence recorded";
        evidence.verdict = FILE_BASED_RUNNER_VERDICTS.PASS;
        evidence.claims.dbPush = "QUALIFICATION CANDIDATE — hosted sequence observed; Daybreak approval still required";
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

  const json = JSON.stringify(sanitizeForLog(evidence), null, 2);
  console.log(json);
  if (args.evidenceOut) {
    fs.mkdirSync(path.dirname(path.resolve(root, args.evidenceOut)), { recursive: true });
    fs.writeFileSync(path.resolve(root, args.evidenceOut), json);
  }
  if (String(evidence.verdict) === FILE_BASED_RUNNER_VERDICTS.BLOCKED || evidence.status === "NOT_RUN") {
    process.exit(2);
  }
  if (String(evidence.status).startsWith("HOLD") || evidence.status === "ERROR" || evidence.verdict === FILE_BASED_RUNNER_VERDICTS.HOLD) {
    process.exit(1);
  }
  process.exit(0);
}

await main();
