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
  inventoryFromQuery,
  parseEvidenceOutArg,
  parseJsonish,
  rowsFromQuery,
} from "./lib/f3-db-push-query-parse.mjs";
import {
  PRE_STUB_FLOOR_CLEAN_CHECK_HOLD,
  assertPreStubFloorCleanCheck,
  evaluatePreStubFloorCleanCheck,
} from "./lib/f3-db-push-pre-stub-floor-clean-check.mjs";
import {
  CATALOG_FINGERPRINT_SQL, // structured JSON records; routine ACL identity is schema/object_name/prokind/identity_arguments — never a comma-joined object_identity label. Overrides floor comma-joined query.
  POISON_ABSENT_PROBE_SQL,
  PRODUCTION_HISTORY_LIMITATION_WARNING,
  REPAIR_SAFETY_HOLD,
  assertExpectedFingerprintImmutable,
  assertPrefixCompleteSinglePendingStaging,
  buildIndependentObservedFingerprint,
  expectedFingerprintSha256,
  getFrozenExpectedFingerprint,
  objectProbeSql, // catalog-boundary structured probe identity; to_regprocedure resolves OID only; compare pg_proc identity to frozen descriptor — never to_regprocedure::text vs lookup spelling. Overrides history-inject text compare.
  objectsPresentFromProbe as objectsPresentFromProbeStrict,
  recordPreDbExpectedHashes,
  runRepairSafetyThenMaybeRepair,
  syncIsolatedMigrationsThrough,
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
  };
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
  const keys = Object.keys(row);
  if (keys.length === 0) return false;
  for (const key of keys) {
    if (!/^p\d+$/.test(key)) return false;
    const value = row[key];
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    if (Object.prototype.hasOwnProperty.call(value, "oid")) return false;
  }
  return true;
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
    expectedFingerprintsBeforeDb: recordPreDbExpectedHashes(),
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
    wipe: null,
    cleanup: null,
    floor: null,
    preStubFloorCleanCheck: null,
    preDbPushGates: null,
    cli: null,
    help: null,
    sequence: [],
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
        const inject = runGatedRemoteSqlText(isolated.workdir, `inject-${version}.sql`, injectSql);
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
        const objectsPresent = objectsPresentFromProbe({ ...probe, file });
        const fingerprintBeforeRepair = await runDbQuery({
          bin: cli.bin,
          workdir: isolated.workdir,
          help: queryHelp,
          sql: CATALOG_FINGERPRINT_SQL,
        });
        const catalogObserved = inventoryFromQuery(fingerprintBeforeRepair.stdout);
        const fingerprintObserved = buildIndependentObservedFingerprint(file, catalogObserved);
        assertExpectedFingerprintImmutable(file);
        const fingerprint = {
          expected: getFrozenExpectedFingerprint(file),
          observed: fingerprintObserved,
          expectedSha256BeforeDb: expectedFingerprintSha256(file),
        };
        const classification = classifyDbPushHistoryFailure({
          exitStatus: push.status,
          stdout: push.stdout,
          stderr: push.stderr,
          historyRows: rowsFromQuery(historyAfterFail),
          targetVersion: version,
          objectsPresent,
        });
        const decided = await runRepairSafetyThenMaybeRepair({
          gateInput: {
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
          },
          cleanup: () =>
            runGatedRemoteSqlText(isolated.workdir, `remove-inject-${version}.sql`, REMOVE_HISTORY_INJECT_SQL),
          verifyPoisonAbsent: () =>
            runDbQuery({
              bin: cli.bin,
              workdir: isolated.workdir,
              help: queryHelp,
              sql: POISON_ABSENT_PROBE_SQL,
            }),
          repair: () =>
            runFilenameVersionRepair({
              bin: cli.bin,
              version,
              workdir: isolated.workdir,
              help: repairHelp,
            }),
        });
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
          fingerprintBeforeRepair: fingerprint,
          repair: decided.repair,
          repairAttempted: decided.repairAttempted,
          continuation: decided.continuation,
        };
        if (!decided.repairAuthorized || decided.continuation === false) {
          evidence.sequence.push({
            ...step,
            historyAfterRepair: null,
            fingerprintAfterRepair: null,
            retry: null,
          });
          evidence.status = "HOLD";
          evidence.verdict = FILE_BASED_RUNNER_VERDICTS.HOLD;
          evidence.limitation = decided.repairAuthorized
            ? "HOLD: repair authorized but repair command failed after poison cleanup; no continuation"
            : (decided.gate.hold || REPAIR_SAFETY_HOLD);
          evidence.originalSqlError = decided.gate.originalSqlError;
          break;
        }
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
        const retryStaged = syncIsolatedMigrationsThrough(isolated, file);
        const historyBeforeRetry = await queryHistory();
        const retryPreflight = assertPrefixCompleteSinglePendingStaging({
          workdir: isolated.workdir,
          currentFile: file,
          historyResult: historyBeforeRetry,
          cliVersion: cli.version,
          phase: "retry",
        });
        const retry = runDbPushCandidate({
          bin: cli.bin,
          workdir: isolated.workdir,
          help: pushHelp,
        });
        evidence.sequence.push({
          ...step,
          historyAfterRepair: rowsFromQuery(historyAfterRepair),
          fingerprintAfterRepair: inventoryFromQuery(fingerprintAfterRepair.stdout),
          retryStaged,
          retryPreflight,
          retry,
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
      if (args.sequenceF3 && evidence.sequence.length === F3_FORWARD_FILES.length) {
        evidence.status = FILE_BASED_RUNNER_VERDICTS.QUALIFICATION_PASS;
        evidence.verdict = FILE_BASED_RUNNER_VERDICTS.QUALIFICATION_PASS;
        evidence.claims.dbPush =
          "FILE-BASED RUNNER QUALIFICATION PASS — STUB/LIVE-PIN FLOOR LIMITATION; prior MECHANICS PASS SUPERSEDED; not production PASS; not clean replay PASS; not merge/deploy auth";
        evidence.claims.mechanicsPass = "SUPERSEDED";
        evidence.claims.productionApproval = "NOT CLAIMED";
        evidence.floorLabel = QUALIFICATION_FLOOR_LABEL;
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
