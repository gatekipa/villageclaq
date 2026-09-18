/**
 * LOCAL NON-API two-phase history simulation.
 *
 * This is NOT the Management API. It does NOT prove Management API
 * equivalence. Caller-generated timestamps are a local test fixture only.
 * Custom skip-if-present is a VillageClaq helper, NOT API continuation.
 *
 * Historical production apply (S0/M2, documented separately):
 *   Cut 1–3: Management API FILE-STREAMED POST
 *            `/v1/projects/{ref}/database/migrations`
 *            official body: { query, name?, rollback? } — no caller version.
 *   M2 00117: connected Supabase apply_migration MCP (small SQL only).
 *
 * This module:
 *   1) file-streams exact SQL (psql -f; migration COMMIT happens here)
 *   2) separately INSERTs into a local schema_migrations table
 *
 * Never targets production. Never wraps history insert inside the
 * migration transaction. Never claims skip/timestamp behavior is API.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assertLocalWorkConnection,
  spawnLocalCliSync,
} from "./f3-local-connection-guard.mjs";
import { refuseProduction, psql, psqlFile } from "../fixtures/disposable-postgres.mjs";

/** Historical production runner pin from S0/M2 evidence. Not this module. */
export const HISTORICAL_PRODUCTION_APPLY_RUNNER =
  "Management API FILE-STREAMED POST /v1/projects/{ref}/database/migrations";

/** @deprecated overstated name — this module is a local NON-API simulation. */
export const PRODUCTION_APPLY_RUNNER = HISTORICAL_PRODUCTION_APPLY_RUNNER;

export const LOCAL_TWO_PHASE_SIMULATION =
  "LOCAL NON-API two-phase simulation (psql -f then external INSERT). NOT Management API equivalent.";

export const HISTORY_VERSION_FORMAT = "YYYYMMDDHHMMSS";

export const S0_M2_PRODUCTION_HISTORY = Object.freeze([
  {
    source_label: "00114",
    file: "00114_s0_p0a_cut1_active_authorization.sql",
    version: "20260911183755",
    name: "s0_p0a_cut1_active_authorization",
    runner: "Management API FILE-STREAMED POST",
    observed_via: "supabase_migrations.schema_migrations after success",
  },
  {
    source_label: "00115",
    file: "00115_s0_p0b_cut2_notification_queue.sql",
    version: "20260912033612",
    name: "s0_p0b_cut2_notification_queue",
    runner: "Management API FILE-STREAMED POST",
    observed_via: "supabase_migrations.schema_migrations after success",
  },
  {
    source_label: "00116",
    file: "00116_s0_p0c_cut3_storage_path_fail_closed.sql",
    version: "20260912134123",
    name: "s0_p0c_cut3_storage_path_fail_closed",
    runner: "Management API FILE-STREAMED POST",
    observed_via: "supabase_migrations.schema_migrations after success",
  },
  {
    source_label: "00117",
    file: "00117_m2_notification_policy_foundation.sql",
    version: "20260912174049",
    name: "m2_notification_policy_foundation",
    runner: "connected Supabase apply_migration MCP (small SQL only)",
    observed_via: "supabase_migrations.schema_migrations after success",
  },
]);

export const HOSTED_HISTORY_SQL = `
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  name text,
  statements text[]
);
`;

export function historyNameFromFilename(filename) {
  const stem = path.basename(filename).replace(/\.sql$/, "");
  const stripped = stem.replace(/^\d+_/, "");
  if (!stripped || stripped === stem) {
    throw new Error(`cannot derive snake_case history name from ${filename}`);
  }
  return stripped;
}

/**
 * LOCAL TEST FIXTURE ONLY. Not a Management API version.
 * Do not use as repaired production identity. Do not treat as apply-time-clock recovery.
 */
export function utcTimestampVersion(ms = Date.now()) {
  const d = new Date(ms);
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return (
    String(d.getUTCFullYear()) +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds())
  );
}

/**
 * LOCAL TEST FIXTURE ONLY. Allocates monotonic caller-generated timestamps
 * for disposable two-phase simulation. NOT server-generated Management API versions.
 */
export function allocateMonotonicVersions(files, baseMs = Date.now()) {
  const out = {};
  files.forEach((file, i) => {
    out[file] = utcTimestampVersion(baseMs + i * 1000);
  });
  return out;
}

function lit(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function ensureHostedHistoryTable(url) {
  assertLocalWorkConnection(url);
  refuseProduction(url);
  psql(url, HOSTED_HISTORY_SQL);
}

export function historyHasVersion(url, version) {
  assertLocalWorkConnection(url);
  refuseProduction(url);
  return (
    psql(
      url,
      `SELECT EXISTS (
         SELECT 1 FROM supabase_migrations.schema_migrations
         WHERE version = ${lit(version)}
       )`,
    ) === "t"
  );
}

export function historyHasName(url, name) {
  assertLocalWorkConnection(url);
  refuseProduction(url);
  return (
    psql(
      url,
      `SELECT EXISTS (
         SELECT 1 FROM supabase_migrations.schema_migrations
         WHERE name = ${lit(name)}
       )`,
    ) === "t"
  );
}

export function readHostedHistory(url) {
  assertLocalWorkConnection(url);
  refuseProduction(url);
  return psql(
    url,
    `SELECT coalesce(
       string_agg(version || ':' || coalesce(name, ''), ',' ORDER BY version),
       ''
     )
     FROM supabase_migrations.schema_migrations`,
  );
}

export function installTargetVersionInsertTrigger(url, version) {
  assertLocalWorkConnection(url);
  refuseProduction(url);
  psql(
    url,
    `
CREATE OR REPLACE FUNCTION supabase_migrations.f3_fail_target_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.version = ${lit(version)} THEN
    RAISE EXCEPTION 'F3_EXTERNAL_LEDGER_INJECT: history insert blocked for version %', NEW.version;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_f3_fail_target_history ON supabase_migrations.schema_migrations;
CREATE TRIGGER trg_f3_fail_target_history
BEFORE INSERT ON supabase_migrations.schema_migrations
FOR EACH ROW
EXECUTE FUNCTION supabase_migrations.f3_fail_target_history();
`,
  );
}

export function removeTargetVersionInsertTrigger(url) {
  assertLocalWorkConnection(url);
  refuseProduction(url);
  psql(
    url,
    `
DROP TRIGGER IF EXISTS trg_f3_fail_target_history ON supabase_migrations.schema_migrations;
DROP FUNCTION IF EXISTS supabase_migrations.f3_fail_target_history();
`,
  );
}

/**
 * LOCAL NON-API two-phase simulation: SQL file apply, then external history INSERT.
 *
 * `skipIfPresent` is a VillageClaq local helper. It is NOT Management API
 * continuation and defaults to false. Callers that want the helper must
 * opt in explicitly and must not present it as API behavior.
 *
 * `version` is a caller-supplied local fixture, NOT a Management API
 * caller-selected timestamp (the API does not accept one).
 */
export function applyLocalTwoPhaseHistorySimulation({
  url,
  fileAbsPath,
  version,
  name,
  skipIfPresent = false,
}) {
  assertLocalWorkConnection(url);
  refuseProduction(url);
  if (!/^\d{14}$/.test(version)) {
    throw new Error(`local simulation version must be ${HISTORY_VERSION_FORMAT}, got ${version}`);
  }
  if (skipIfPresent && historyHasVersion(url, version)) {
    return {
      status: 0,
      skipped: true,
      version,
      name,
      phase: "local_helper_skip_already_recorded",
      simulation: true,
      managementApiEquivalent: false,
    };
  }
  try {
    psqlFile(url, fileAbsPath);
  } catch (err) {
    err.phase = "sql_file_stream";
    throw err;
  }
  try {
    psql(
      url,
      `INSERT INTO supabase_migrations.schema_migrations(version, name)
       VALUES (${lit(version)}, ${lit(name)});`,
    );
  } catch (err) {
    const e = new Error(
      `EXTERNAL_HISTORY_INSERT_FAILED version=${version} name=${name}: ${err.message}`,
    );
    e.phase = "external_history";
    e.status = err.status || 1;
    e.version = version;
    e.name = name;
    e.committedSql = true;
    e.cause = err;
    throw e;
  }
  return {
    status: 0,
    skipped: false,
    version,
    name,
    phase: "applied",
    simulation: true,
    managementApiEquivalent: false,
  };
}

/** @deprecated name implied Management API equivalence. Local simulation only. */
export function applyFileStreamThenExternalHistory(opts) {
  return applyLocalTwoPhaseHistorySimulation(opts);
}

export function createRepairWorkdir({ version, name, sqlBytes }) {
  if (!/^\d{14}$/.test(version)) {
    throw new Error(`repair lookup file requires timestamp version, got ${version}`);
  }
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "f3-repair-wd-"));
  const migDir = path.join(workdir, "supabase", "migrations");
  fs.mkdirSync(migDir, { recursive: true });
  fs.writeFileSync(
    path.join(workdir, "supabase", "config.toml"),
    `project_id = "f3-disposable-repair-workdir"\n`,
  );
  const lookup = path.join(migDir, `${version}_${name}.sql`);
  fs.writeFileSync(lookup, sqlBytes);
  return { workdir, lookup };
}

/**
 * Founder-controlled CLI repair against a validated LOCAL disposable URL.
 * NEVER call this automatically in production.
 * Syntax taken from `supabase migration repair --help` on CLI 2.117.0:
 *   supabase migration repair [flags] [<version...>]
 *   --status applied|reverted
 *   --db-url <percent-encoded connection string>
 */
export function repairHistoryApplied({ version, dbUrl, workdir }) {
  const spec = assertLocalWorkConnection(dbUrl);
  refuseProduction(dbUrl);
  if (!/^\d{14}$/.test(version)) {
    throw new Error(`repair version must be ${HISTORY_VERSION_FORMAT}, got ${version}`);
  }
  const args = [
    "migration",
    "repair",
    version,
    "--status",
    "applied",
    "--db-url",
    dbUrl,
    "--workdir",
    workdir,
    "--yes",
  ];
  const res = spawnLocalCliSync("supabase", args, { url: spec.source, role: "work" });
  return {
    command: ["supabase", ...args].join(" "),
    status: res.status,
    stdout: res.stdout || "",
    stderr: res.stderr || "",
  };
}

export function requireSupabaseCli() {
  const ver = spawnLocalCliSync("supabase", ["--version"]);
  if (ver.status !== 0) {
    throw new Error("supabase CLI is required for founder repair proofs");
  }
  return (ver.stdout || ver.stderr || "").trim();
}

export function readCliHelp(subcommand) {
  const res = spawnLocalCliSync("supabase", subcommand);
  return {
    status: res.status,
    text: `${res.stdout || ""}\n${res.stderr || ""}`,
  };
}
