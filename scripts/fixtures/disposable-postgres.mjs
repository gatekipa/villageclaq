/**
 * Local disposable PostgreSQL 17. Fail-closed before any child process.
 *
 * Accepts ONLY localhost / 127.0.0.1 / ::1 / /var/run/postgresql.
 * Work databases MUST begin with `f3_`.
 * Admin may use local maintenance database `postgres` only to CREATE/DROP `f3_*`.
 * Subprocess env is replaced with a minimal allowlist + isolated HOME.
 * Never inherits SUPABASE_* tokens, service-role keys, DATABASE_URL, or PG*.
 *
 * Not a Management API client. Refuses production ref llbnliixczcqfftxpsmb.
 */
import assert from "node:assert/strict";
import {
  assertLocalAdminConnection,
  assertLocalWorkConnection,
  assertSafeDatabaseName,
  defaultLocalAdminUrl,
  localWorkUrl,
  refuseProduction,
  spawnLocalPsql,
  spawnLocalPsqlSync,
  spawnLocalStdbufPsql,
} from "../lib/f3-local-connection-guard.mjs";

export {
  refuseProduction,
  assertLocalAdminConnection,
  assertLocalWorkConnection,
} from "../lib/f3-local-connection-guard.mjs";

export function adminUrl() {
  const url = process.env.F3_DISPOSABLE_ADMIN_URL || defaultLocalAdminUrl();
  refuseProduction(url);
  assertLocalAdminConnection(url);
  return url;
}

function throwPsqlFailure(res, fallback) {
  const err = new Error(res.stderr || res.stdout || fallback || "psql failed");
  err.stderr = res.stderr;
  err.stdout = res.stdout;
  err.status = res.status;
  throw err;
}

export function psql(url, query, opts = {}) {
  const spec = assertLocalWorkConnection(url);
  const extra = [];
  if (opts.tuplesOnly !== false) extra.push("-At");
  extra.push("-c", query);
  const { result } = spawnLocalPsqlSync(url, extra, { role: spec.role || "work" });
  if (result.status !== 0) throwPsqlFailure(result, "psql failed");
  return (result.stdout || "").trim();
}

export function psqlAdmin(url, query) {
  assertLocalAdminConnection(url);
  const { result } = spawnLocalPsqlSync(url, ["-At", "-c", query], { role: "admin" });
  if (result.status !== 0) throwPsqlFailure(result, "psql admin failed");
  return (result.stdout || "").trim();
}

export function psqlFile(url, absPath) {
  assertLocalWorkConnection(url);
  const { result } = spawnLocalPsqlSync(url, ["-f", absPath], { role: "work" });
  if (result.status !== 0) {
    throw new Error(`${absPath} failed:\n${result.stderr || result.stdout}`);
  }
  return (result.stdout || "").trim();
}

export function createDisposableDatabase(label) {
  const admin = adminUrl();
  const raw = `f3_${String(label || "suite").replace(/[^a-z0-9_]/gi, "_").slice(0, 24)}_${process.pid}_${Date.now().toString(36)}`.toLowerCase();
  const name = assertSafeDatabaseName(raw, { role: "work" });
  const url = localWorkUrl({ database: name, kind: "socket" });
  const tcpUrl = localWorkUrl({ database: name, kind: "tcp" });
  assertLocalWorkConnection(url);
  assertLocalWorkConnection(tcpUrl);
  psqlAdmin(admin, `DROP DATABASE IF EXISTS ${name};`);
  psqlAdmin(admin, `CREATE DATABASE ${name} OWNER ubuntu;`);
  const ver = psql(url, "SHOW server_version_num;");
  assert.match(ver, /^17/, `expected PostgreSQL 17, got ${ver}`);
  return {
    name,
    url,
    tcpUrl,
    close: () => psqlAdmin(admin, `DROP DATABASE IF EXISTS ${name};`),
  };
}

/**
 * Oracle-compatible handle used by F3-04/F3-05 lock tests.
 * { sql, asyncSql, start, stop, openSql }
 */
export function createDisposablePostgres({ name = "f3", label = name } = {}) {
  let db;
  const sql = (query) => psql(db.url, query);
  const asyncSql = (query) =>
    new Promise((resolve, reject) => {
      assertLocalWorkConnection(db.url);
      const child = spawnLocalPsql(db.url, ["-At", "-c", query], { role: "work" });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => {
        stdout += d;
      });
      child.stderr.on("data", (d) => {
        stderr += d;
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0) {
          const err = new Error(stderr || stdout || "psql failed");
          err.stderr = stderr;
          reject(err);
        } else resolve(stdout.trim());
      });
    });
  const openSql = () => {
    assertLocalWorkConnection(db.url);
    return spawnLocalStdbufPsql(db.url, { role: "work" });
  };
  return {
    label,
    sql,
    asyncSql,
    openSql,
    async start() {
      db = createDisposableDatabase(label);
      return db;
    },
    stop() {
      if (db) db.close();
    },
    get url() {
      return db?.url;
    },
  };
}
