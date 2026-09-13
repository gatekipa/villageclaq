/**
 * Disposable equivalent of the VillageClaq S0/M2 PRODUCTION apply runner.
 *
 * Production runner (do not invent another):
 *   Management API FILE-STREAMED POST
 *   `/v1/projects/{ref}/database/migrations`
 *   body: { query: <exact SQL bytes>, name: <snake_case> }
 *   MCP apply_migration is DISQUALIFIED for large F3 SQL (Cut 1 precedent).
 *   `supabase db push` is NOT the production apply runner.
 *
 * S0/M2 mapping precedent (source label ≠ history version):
 *   00114 → 20260911183755 / s0_p0a_cut1_active_authorization
 *   00115 → 20260912033612 / s0_p0b_cut2_notification_queue
 *   00116 → 20260912134123 / s0_p0c_cut3_storage_path_fail_closed
 *   00117 → 20260912174049 / m2_notification_policy_foundation
 *     (M2 used connected apply_migration MCP; F3 files are large → Cut 1–3
 *      Management API file-stream is the expected production path)
 *
 * History identifier format: 14-digit UTC timestamp `YYYYMMDDHHMMSS`
 * plus snake_case name = filename after stripping leading `\d+_`.
 *
 * Ordering that MUST be preserved:
 *   migration final COMMIT → external history INSERT → (optional injected failure)
 *
 * This module never targets production. Never wraps history insert inside
 * the migration transaction.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { refuseProduction, psql, psqlFile } from "../fixtures/disposable-postgres.mjs";

export const PRODUCTION_APPLY_RUNNER =
  "Management API FILE-STREAMED POST /v1/projects/{ref}/database/migrations";

export const HISTORY_VERSION_FORMAT = "YYYYMMDDHHMMSS";

export const S0_M2_PRODUCTION_HISTORY = Object.freeze([
  {
    source_label: "00114",
    file: "00114_s0_p0a_cut1_active_authorization.sql",
    version: "20260911183755",
    name: "s0_p0a_cut1_active_authorization",
    runner: "Management API FILE-STREAMED POST",
  },
  {
    source_label: "00115",
    file: "00115_s0_p0b_cut2_notification_queue.sql",
    version: "20260912033612",
    name: "s0_p0b_cut2_notification_queue",
    runner: "Management API FILE-STREAMED POST",
  },
  {
    source_label: "00116",
    file: "00116_s0_p0c_cut3_storage_path_fail_closed.sql",
    version: "20260912134123",
    name: "s0_p0c_cut3_storage_path_fail_closed",
    runner: "Management API FILE-STREAMED POST",
  },
  {
    source_label: "00117",
    file: "00117_m2_notification_policy_foundation.sql",
    version: "20260912174049",
    name: "m2_notification_policy_foundation",
    runner: "connected Supabase apply_migration MCP (small SQL only)",
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
  refuseProduction(url);
  psql(url, HOSTED_HISTORY_SQL);
}

export function historyHasVersion(url, version) {
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

export function readHostedHistory(url) {
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
 * Faithful disposable equivalent of Management API file-stream apply:
 * 1) file-stream exact SQL (psql -f; migration COMMIT happens here)
 * 2) external INSERT into schema_migrations (separate statement)
 */
export function applyFileStreamThenExternalHistory({
  url,
  fileAbsPath,
  version,
  name,
  skipIfPresent = true,
}) {
  refuseProduction(url);
  if (!/^\d{14}$/.test(version)) {
    throw new Error(`history version must be ${HISTORY_VERSION_FORMAT}, got ${version}`);
  }
  if (skipIfPresent && historyHasVersion(url, version)) {
    return { status: 0, skipped: true, version, name, phase: "skip_already_recorded" };
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
  return { status: 0, skipped: false, version, name, phase: "applied" };
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
 * Founder-controlled CLI repair. NEVER call this automatically in production.
 * Syntax taken from `supabase migration repair --help` on CLI 2.117.0:
 *   supabase migration repair [flags] [<version...>]
 *   --status applied|reverted
 *   --db-url <percent-encoded connection string>
 */
export function repairHistoryApplied({ version, dbUrl, workdir }) {
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
  const res = spawnSync("supabase", args, {
    encoding: "utf8",
    env: { ...process.env },
  });
  return {
    command: ["supabase", ...args].join(" "),
    status: res.status,
    stdout: res.stdout || "",
    stderr: res.stderr || "",
  };
}

export function requireSupabaseCli() {
  const ver = spawnSync("supabase", ["--version"], { encoding: "utf8" });
  if (ver.status !== 0) {
    throw new Error("supabase CLI is required for founder repair proofs");
  }
  return (ver.stdout || ver.stderr || "").trim();
}

export function readCliHelp(subcommand) {
  const res = spawnSync("supabase", subcommand, { encoding: "utf8" });
  return {
    status: res.status,
    text: `${res.stdout || ""}\n${res.stderr || ""}`,
  };
}
