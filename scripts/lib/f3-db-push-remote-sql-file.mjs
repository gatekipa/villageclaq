/**
 * Gated remote multi-statement SQL-file executor for the disposable floor.
 *
 * Repository floor authority (`_f3_apply_current_main_floor.mjs`) applies
 * bootstrap + 00001–00117 via `psql -f`. `supabase db query --file` cannot
 * execute multi-statement SQL (Chief hosted HOLD on tip ca6df98:
 * "cannot insert multiple commands into a prepared statement").
 *
 * This is NOT the 00118–00123 candidate runner. Candidate remains
 * `supabase db push`. Management API apply stays permanently disqualified.
 *
 * Connection: session-mode pooler via child env (PGHOST/PGPORT/PGUSER/
 * PGPASSWORD/PGDATABASE/PGSSLMODE). Never `-p` on argv. Never log URL.
 */
import fs from "node:fs";
import path from "node:path";
import {
  APPROVED_DISPOSABLE_POOLER_HOST,
  APPROVED_DISPOSABLE_POOLER_USER,
} from "./f3-db-push-pins.mjs";
import {
  assertArgvSafe,
  assertDbPushGates,
  sanitizeForLog,
  spawnGatedRemotePsqlSync,
} from "./f3-db-push-target-guard.mjs";

export const DB_QUERY_MULTISTATEMENT_REFUSE =
  "REFUSE: supabase db query cannot execute multi-statement SQL; use gated psql -f";

export const GATED_PSQL_FILE_RENDERED =
  "psql -X -q -v ON_ERROR_STOP=1 -f [FILE] (session-mode pooler via child env; never -p)";

export function sqlRequiresPsqlFile(sql) {
  if (sql == null) return false;
  const stripped = String(sql)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
  if (/\$[A-Za-z_]*\$/.test(stripped)) return true;
  const parts = stripped.split(";").map((s) => s.trim()).filter(Boolean);
  return parts.length > 1;
}

export function refuseDbQueryMultiStatement({ sql, fileAbsPath } = {}) {
  let text = sql == null ? "" : String(sql);
  if (fileAbsPath) {
    const abs = path.resolve(fileAbsPath);
    const base = path.basename(abs);
    if (
      /^(000|0010|0011[0-7])/.test(base) ||
      /^(floor-bootstrap|floor-live-hgp|inject-)/.test(base)
    ) {
      const err = new Error(DB_QUERY_MULTISTATEMENT_REFUSE);
      err.code = "F3_DBPUSH_DB_QUERY_MULTISTATEMENT";
      throw err;
    }
    if (fs.existsSync(abs)) text = fs.readFileSync(abs, "utf8");
  }
  if (sqlRequiresPsqlFile(text)) {
    const err = new Error(DB_QUERY_MULTISTATEMENT_REFUSE);
    err.code = "F3_DBPUSH_DB_QUERY_MULTISTATEMENT";
    throw err;
  }
  return true;
}

export function writeGatedSqlFile(workdir, basename, sql) {
  if (!workdir) throw new Error("isolated workdir is required for gated SQL files");
  const abs = path.resolve(workdir, basename);
  if (!abs.startsWith(path.resolve(workdir))) {
    throw new Error("REFUSE: SQL file escaped isolated workdir");
  }
  fs.writeFileSync(abs, sql);
  return abs;
}

export function runGatedRemoteSqlFile(absPath) {
  assertDbPushGates({ optIn: true });
  const abs = path.resolve(absPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`HOLD: gated SQL file missing: ${path.basename(abs)}`);
  }
  const args = ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", abs];
  assertArgvSafe(args);
  const res = spawnGatedRemotePsqlSync(args);
  return {
    command: GATED_PSQL_FILE_RENDERED,
    file: path.basename(abs),
    status: res.status,
    stdout: sanitizeForLog(res.stdout || ""),
    stderr: sanitizeForLog(res.stderr || ""),
    signal: res.signal || null,
    poolerHost: APPROVED_DISPOSABLE_POOLER_HOST,
    poolerUser: APPROVED_DISPOSABLE_POOLER_USER,
  };
}

export function runGatedRemoteSqlText(workdir, basename, sql) {
  const abs = writeGatedSqlFile(workdir, basename, sql);
  return runGatedRemoteSqlFile(abs);
}
