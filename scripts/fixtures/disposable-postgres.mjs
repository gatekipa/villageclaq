/**
 * Local disposable PostgreSQL 17. No production URL. No Docker required.
 * Refuses llbnliixczcqfftxpsmb. Each suite gets its own database.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";

const PROD = /llbnliixczcqfftxpsmb/i;

export function refuseProduction(url) {
  if (PROD.test(String(url || ""))) {
    throw new Error("REFUSE: disposable URL must not target production.");
  }
}

export function adminUrl() {
  const url =
    process.env.F3_DISPOSABLE_ADMIN_URL ||
    "postgresql://ubuntu@/postgres?host=/var/run/postgresql";
  refuseProduction(url);
  return url;
}

export function psql(url, query, opts = {}) {
  refuseProduction(url);
  const args = ["-d", url, "-X", "-q", "-v", "ON_ERROR_STOP=1"];
  if (opts.tuplesOnly !== false) args.push("-At");
  args.push("-c", query);
  const res = spawnSync("psql", args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || "" },
  });
  if (res.status !== 0) {
    const err = new Error(res.stderr || res.stdout || "psql failed");
    err.stderr = res.stderr;
    err.stdout = res.stdout;
    err.status = res.status;
    throw err;
  }
  return (res.stdout || "").trim();
}

export function psqlFile(url, absPath) {
  refuseProduction(url);
  const res = spawnSync(
    "psql",
    ["-d", url, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", absPath],
    {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || "" },
    },
  );
  if (res.status !== 0) {
    throw new Error(`${absPath} failed:\n${res.stderr || res.stdout}`);
  }
  return (res.stdout || "").trim();
}

export function createDisposableDatabase(label) {
  const admin = adminUrl();
  const name = `f3_${String(label || "suite").replace(/[^a-z0-9_]/gi, "_").slice(0, 24)}_${process.pid}_${Date.now().toString(36)}`;
  const url = `postgresql://ubuntu@/${name}?host=/var/run/postgresql`;
  refuseProduction(url);
  psql(admin, `DROP DATABASE IF EXISTS ${name};`);
  psql(admin, `CREATE DATABASE ${name} OWNER ubuntu;`);
  const ver = psql(url, "SHOW server_version_num;");
  assert.match(ver, /^17/, `expected PostgreSQL 17, got ${ver}`);
  return { name, url, close: () => psql(admin, `DROP DATABASE IF EXISTS ${name};`) };
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
      refuseProduction(db.url);
      const child = spawn("psql", ["-d", db.url, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-At", "-c", query], {
        env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || "" },
      });
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
    refuseProduction(db.url);
    return spawn("stdbuf", ["-oL", "-eL", "psql", "-d", db.url, "-X", "-q", "-v", "ON_ERROR_STOP=1"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || "" },
    });
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
