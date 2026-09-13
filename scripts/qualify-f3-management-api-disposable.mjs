/**
 * Founder-authorized disposable Management API runner-fidelity qualifier.
 *
 * NEVER targets production. NEVER prints or logs the token.
 * Requires exact approved ref + sentinel + destructive opt-in + token + identity.
 *
 * If env is absent: exit 2 NOT_RUN with a Chief runbook (no network).
 * If a post-COMMIT history identity cannot be recovered from response /
 * list_migrations / schema_migrations: HOLD — MANAGEMENT API VERSION UNRECOVERABLE.
 * Do not claim custom skip unless a live re-POST observation records it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  APPROVED_DISPOSABLE_PROJECT_NAME,
  APPROVED_DISPOSABLE_PROJECT_REF,
  APPROVED_DISPOSABLE_SENTINEL,
  DESTRUCTIVE_ENV,
  HOLD_VERSION_UNRECOVERABLE,
  REMOTE_MANAGEMENT_API_STATUS,
  SENTINEL_ENV,
  TOKEN_ENV,
  applyRemoteManagementApiMigration,
  applyRemoteManagementApiMigrationFromFile,
  listRemoteManagementApiMigrations,
  remoteGatesSatisfiedFromEnv,
  sanitizeForLog,
  verifyRemoteProjectIdentity,
} from "./lib/f3-management-api-remote-harness.mjs";
import {
  F3_FORWARD_FILES,
  FLOOR_LIMITATION,
  FROZEN_DIGESTS,
  assertFrozenDigestsOnDisk,
  installDisclosedDisposableFloor,
} from "./lib/f3-management-api-disposable-floor.mjs";
import {
  HISTORY_INJECT_MARKER,
  PROBE_NAME,
  PROBE_SQL,
  installHistoryInject,
  readRemoteSchemaMigrations,
  recoverServerGeneratedIdentity,
  removeHistoryInject,
  responseLooksLikeInjectFailure,
} from "./lib/f3-management-api-history-inject.mjs";
import {
  DISPOSABLE_DB_URL_ENV,
  continueVillageClaqManagementApiOrchestration,
  createAuthorizedRepairLookup,
  discoverSupabaseCli,
  readAuthorizedSqlBytes,
  readMigrationRepairHelp,
  repairPreparedButNotRun,
  runDiscoveredRepair,
} from "./lib/f3-management-api-repair-continuation.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

function chiefRunbook() {
  return {
    status: "NOT_RUN",
    reason: REMOTE_MANAGEMENT_API_STATUS,
    project: {
      name: APPROVED_DISPOSABLE_PROJECT_NAME,
      ref: APPROVED_DISPOSABLE_PROJECT_REF,
    },
    env: {
      [TOKEN_ENV]: "required (never print)",
      [SENTINEL_ENV]: APPROVED_DISPOSABLE_SENTINEL,
      [DESTRUCTIVE_ENV]: "1",
      [DISPOSABLE_DB_URL_ENV]: "optional; required only to execute CLI repair",
    },
    commands: [
      `export ${SENTINEL_ENV}=${APPROVED_DISPOSABLE_SENTINEL}`,
      `export ${DESTRUCTIVE_ENV}=1`,
      `export ${TOKEN_ENV}='<token from founder vault; do not commit>'`,
      "node scripts/prep-f3-disposable-management-api-floor.mjs",
      "node scripts/qualify-f3-management-api-disposable.mjs --prep-floor --inject-probe --apply-f3",
    ],
    limitation: FLOOR_LIMITATION,
    holdIfUnrecoverable: "HOLD — MANAGEMENT API VERSION UNRECOVERABLE",
    bans: [
      "Do not target llbnliixczcqfftxpsmb",
      "Do not delete or pause the disposable project",
      "Do not guess / clock / nearest-match a history version",
      "Do not change 00118–00123 SQL bytes",
      "Do not claim custom skip unless observed",
    ],
  };
}

function parseArgs(argv) {
  return {
    prepFloor: argv.includes("--prep-floor"),
    injectProbe: argv.includes("--inject-probe") || !argv.includes("--no-inject"),
    applyF3: argv.includes("--apply-f3"),
    injectOn00118: argv.includes("--inject-on-00118"),
    evidenceOut: (() => {
      const idx = argv.indexOf("--evidence-out");
      return idx >= 0 ? argv[idx + 1] : null;
    })(),
  };
}

function publicApply(result) {
  if (!result) return null;
  return {
    ok: result.ok,
    status: result.status,
    body: result.body,
    capture: result.capture,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!remoteGatesSatisfiedFromEnv()) {
    const payload = chiefRunbook();
    console.log(JSON.stringify(payload, null, 2));
    if (args.evidenceOut) {
      fs.mkdirSync(path.dirname(args.evidenceOut), { recursive: true });
      fs.writeFileSync(args.evidenceOut, JSON.stringify(payload, null, 2));
    }
    process.exit(2);
  }

  const evidence = {
    status: "RUNNING",
    projectRef: APPROVED_DISPOSABLE_PROJECT_REF,
    limitation: FLOOR_LIMITATION,
    frozenDigests: assertFrozenDigestsOnDisk(),
    identity: null,
    floor: null,
    probe: null,
    recovery: null,
    repair: null,
    continuation: [],
    f3Applies: [],
    claims: {
      managementApiCustomSkip: "NOT CLAIMED — not observed in this runner unless a re-POST result is recorded below",
      applyTimeClock: "FORBIDDEN / NOT USED",
      cleanReplay00001_00117: false,
    },
    cleanupRecommendation:
      "Leave disposable project jkorwnwwmdeflfntxntl in place. Do not delete or pause. Founder may later reset schema or retire the project after evidence is accepted.",
  };

  try {
    evidence.identity = await verifyRemoteProjectIdentity();
    const list0 = await listRemoteManagementApiMigrations({ skipIdentity: true });
    evidence.historyBefore = list0.rows;

    if (args.prepFloor) {
      evidence.floor = await installDisclosedDisposableFloor({ apply00117: true });
    } else {
      evidence.floor = {
        skipped: true,
        limitation: FLOOR_LIMITATION,
        note: "Pass --prep-floor to install the disclosed stub+pins+00117 floor.",
      };
    }

    if (args.injectProbe) {
      const listBefore = await listRemoteManagementApiMigrations({ skipIdentity: true });
      const installed = await installHistoryInject();
      const applyProbe = await applyRemoteManagementApiMigration({
        query: PROBE_SQL,
        name: PROBE_NAME,
        optIn: true,
        beforeHistory: listBefore.rows,
      });
      const listAfter = await listRemoteManagementApiMigrations({ skipIdentity: true });
      applyProbe.capture.afterHistory = listAfter.rows;
      const schema = await readRemoteSchemaMigrations();
      const recovery = recoverServerGeneratedIdentity({
        applyResponse: applyProbe,
        listBefore: listBefore.rows,
        listAfter: listAfter.rows,
        schemaRows: schema.rows,
      });
      await removeHistoryInject();
      evidence.probe = {
        injectInstalled: installed.ok,
        apply: publicApply(applyProbe),
        injectFailureObserved: responseLooksLikeInjectFailure(applyProbe),
        marker: HISTORY_INJECT_MARKER,
        listBefore: listBefore.rows,
        listAfter: listAfter.rows,
        schemaRows: schema.rows,
      };
      evidence.recovery = recovery;
      if (!recovery.ok) {
        evidence.status = HOLD_VERSION_UNRECOVERABLE;
        evidence.repair = { skipped: true, reason: HOLD_VERSION_UNRECOVERABLE };
      } else {
        const cli = discoverSupabaseCli();
        const help = cli.available ? readMigrationRepairHelp() : { status: 1, text: "supabase CLI not available" };
        const probeBytes = `-- recovered probe SQL bytes for lookup only\n${PROBE_SQL}`;
        const lookup = createAuthorizedRepairLookup({
          version: recovery.version,
          name: recovery.name || PROBE_NAME,
          sqlBytes: probeBytes,
        });
        evidence.repair = {
          cli,
          help: {
            status: help.status,
            hasStatus: help.hasStatus,
            hasApplied: help.hasApplied,
            hasDbUrl: help.hasDbUrl,
            hasYes: help.hasYes,
            hasWorkdir: help.hasWorkdir,
          },
          lookup: { path: lookup.lookup, digest: lookup.digest },
          recoveredVersion: recovery.version,
          recoveredName: recovery.name,
        };
        if (!process.env[DISPOSABLE_DB_URL_ENV]) {
          evidence.repair.execution = repairPreparedButNotRun({
            version: recovery.version,
            name: recovery.name,
            lookup: lookup.lookup,
            help,
          });
        } else {
          evidence.repair.execution = runDiscoveredRepair({
            version: recovery.version,
            dbUrl: process.env[DISPOSABLE_DB_URL_ENV],
            workdir: lookup.workdir,
            help,
          });
        }
      }
    }

    if (args.applyF3 && evidence.status !== HOLD_VERSION_UNRECOVERABLE) {
      if (args.injectOn00118) {
        const file = F3_FORWARD_FILES[0];
        const listBefore = await listRemoteManagementApiMigrations({ skipIdentity: true });
        await installHistoryInject();
        const { abs } = readAuthorizedSqlBytes(file);
        const apply = await applyRemoteManagementApiMigrationFromFile({
          fileAbsPath: abs,
          optIn: true,
          beforeHistory: listBefore.rows,
        });
        const listAfter = await listRemoteManagementApiMigrations({ skipIdentity: true });
        apply.capture.afterHistory = listAfter.rows;
        const schema = await readRemoteSchemaMigrations();
        const recovery = recoverServerGeneratedIdentity({
          applyResponse: apply,
          listBefore: listBefore.rows,
          listAfter: listAfter.rows,
          schemaRows: schema.rows,
        });
        await removeHistoryInject();
        evidence.f3Applies.push({
          file,
          digest: FROZEN_DIGESTS[file],
          inject: true,
          apply: publicApply(apply),
          recovery,
        });
        if (!recovery.ok) {
          evidence.status = HOLD_VERSION_UNRECOVERABLE;
        } else {
          const cli = discoverSupabaseCli();
          const help = cli.available ? readMigrationRepairHelp() : { status: 1, text: "supabase CLI not available" };
          const { sqlBytes, digest } = readAuthorizedSqlBytes(file);
          const lookup = createAuthorizedRepairLookup({
            version: recovery.version,
            name: recovery.name,
            sqlBytes,
            digest,
          });
          evidence.repair = evidence.repair || {};
          evidence.repair.f300118 = {
            version: recovery.version,
            name: recovery.name,
            lookup: lookup.lookup,
            digest,
            help: { status: help.status, hasStatus: help.hasStatus, hasApplied: help.hasApplied, hasDbUrl: help.hasDbUrl },
            execution: process.env[DISPOSABLE_DB_URL_ENV]
              ? runDiscoveredRepair({
                  version: recovery.version,
                  dbUrl: process.env[DISPOSABLE_DB_URL_ENV],
                  workdir: lookup.workdir,
                  help,
                })
              : repairPreparedButNotRun({
                  version: recovery.version,
                  name: recovery.name,
                  lookup: lookup.lookup,
                  help,
                }),
          };
        }
      }

      if (evidence.status !== HOLD_VERSION_UNRECOVERABLE) {
        for (const file of F3_FORWARD_FILES) {
          if (args.injectOn00118 && file === F3_FORWARD_FILES[0]) continue;
          const listBefore = await listRemoteManagementApiMigrations({ skipIdentity: true });
          const continued = await continueVillageClaqManagementApiOrchestration({
            nextFile: file,
            listBefore: listBefore.rows,
          });
          evidence.continuation.push({
            file,
            digest: FROZEN_DIGESTS[file],
            advanced: continued.advanced,
            observedCustomSkip: continued.observedCustomSkip,
            apply: publicApply(continued.apply),
          });
          evidence.f3Applies.push({
            file,
            digest: FROZEN_DIGESTS[file],
            inject: false,
            apply: publicApply(continued.apply),
          });
          if (!continued.advanced) {
            evidence.status = "HOLD — sequential apply stopped after unsuccessful file";
            evidence.sequentialLimitation =
              "Only files applied before this stop have runner-faithful Management API evidence. Do not claim all six succeeded.";
            break;
          }
        }
      }
    }

    if (evidence.status === "RUNNING") {
      const appliedOk = evidence.f3Applies.filter((row) => row.apply?.ok).length;
      evidence.status =
        evidence.recovery && !evidence.recovery.ok
          ? HOLD_VERSION_UNRECOVERABLE
          : args.applyF3 && appliedOk === 0
            ? "GATED_SCAFFOLDING_READY — no successful 00118–00123 apply observed"
            : args.applyF3 && appliedOk < F3_FORWARD_FILES.length
              ? "PARTIAL — not all six files advanced"
              : args.applyF3
                ? "OBSERVED — sequential Management API applies recorded"
                : "GATED_SCAFFOLDING_READY";
    }
  } catch (err) {
    evidence.status = err.code || "ERROR";
    evidence.error = sanitizeForLog(err.message);
    evidence.errorCode = err.code || null;
  }

  const json = JSON.stringify(sanitizeForLog(evidence), null, 2);
  console.log(json);
  if (args.evidenceOut) {
    fs.mkdirSync(path.dirname(path.resolve(root, args.evidenceOut)), { recursive: true });
    fs.writeFileSync(path.resolve(root, args.evidenceOut), json);
  }
  if (String(evidence.status).startsWith("HOLD") || evidence.status === "ERROR") process.exit(1);
  if (evidence.status === "NOT_RUN") process.exit(2);
  process.exit(0);
}

await main();
