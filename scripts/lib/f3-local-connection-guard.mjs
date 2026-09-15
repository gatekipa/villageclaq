/**
 * Fail-closed local disposable Postgres / CLI subprocess guard.
 *
 * LOCAL ONLY. Not a Management API client. Never targets production.
 * Validates every restriction BEFORE any child process is spawned.
 *
 * Allowed targets:
 *   - loopback hosts: localhost, 127.0.0.1, ::1
 *   - approved Unix socket: /var/run/postgresql
 * Work databases MUST begin with `f3_`.
 * Admin connections may use maintenance database `postgres` only to
 * CREATE/DROP `f3_*` databases on an approved local target.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const PRODUCTION_REF = "llbnliixczcqfftxpsmb";
export const APPROVED_UNIX_SOCKET = "/var/run/postgresql";
export const APPROVED_LOOPBACK_HOSTS = Object.freeze(["localhost", "127.0.0.1", "::1"]);
export const WORK_DB_PREFIX = "f3_";
export const ADMIN_MAINTENANCE_DB = "postgres";
export const POOLER_PORT = 6543;

const PROD = /llbnliixczcqfftxpsmb/i;
const FORBIDDEN_HOST_RE =
  /supabase\.(co|com)|pooler|aws-|neon\.tech|amazonaws|azure|gcp|railway|render\.com|fly\.io|db\.|host\.docker\.internal|nip\.io|sslip\.io/i;

const FORBIDDEN_ENV_EXACT = new Set([
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_URL",
  "SUPABASE_PROJECT_REF",
  "SUPABASE_DB_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "DATABASE_URL",
  "DIRECT_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "PGHOST",
  "PGHOSTADDR",
  "PGPORT",
  "PGDATABASE",
  "PGUSER",
  "PGPASSWORD",
  "PGPASSFILE",
  "PGSERVICE",
  "PGSERVICEFILE",
  "PGSSLMODE",
  "PGCHANNELBINDING",
  "PGOPTIONS",
  "PGAPPNAME",
  "PGREQUIREPEER",
  "PGREQUIRESSL",
  "PGSSLROOTCERT",
  "PGSSLCERT",
  "PGSSLKEY",
  "PGKRBSRVNAME",
  "PGGSSLIB",
  "PGCONNECT_TIMEOUT",
  "PGREALM",
]);

const FORBIDDEN_ENV_PREFIX = [
  "SUPABASE_",
  "PGSERVICE",
  "POSTGRES_",
  "DATABASE_",
  "DIRECT_",
];

const FORBIDDEN_ENV_SUBSTRING = [
  "SERVICE_ROLE",
  "SECRET_KEY",
  "ACCESS_TOKEN",
  "PROJECT_REF",
];

const ALLOWED_INHERITED_ENV = new Set([
  "PATH",
  "PATHEXT",
  "LANG",
  "LANGUAGE",
  "LC_ALL",
  "LC_CTYPE",
  "LC_MESSAGES",
  "TZ",
  "TMPDIR",
  "TEMP",
  "TMP",
  "TERM",
  "USER",
  "LOGNAME",
  "SHELL",
  "HOME",
]);

const ALLOWED_QUERY_KEYS = new Set(["host", "port"]);

export const LOCAL_CONNECTION_REJECT = "F3_LOCAL_CONNECTION_REJECT";

let isolatedHomeDir = "";
let spawnSyncImpl = spawnSync;
let spawnImpl = spawn;
const spawnLedger = [];

export function isolatedCliHomeDir() {
  if (!isolatedHomeDir) {
    isolatedHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), "f3-local-cli-home-"));
    fs.mkdirSync(path.join(isolatedHomeDir, ".supabase"), { recursive: true });
    fs.mkdirSync(path.join(isolatedHomeDir, ".config"), { recursive: true });
    fs.writeFileSync(path.join(isolatedHomeDir, ".pgpass"), "", { mode: 0o600 });
    fs.writeFileSync(
      path.join(isolatedHomeDir, ".supabase", "README"),
      "VillageClaq isolated local CLI home. No inherited credentials.\n",
    );
  }
  return isolatedHomeDir;
}

export function __resetLocalSpawnForTests() {
  spawnSyncImpl = spawnSync;
  spawnImpl = spawn;
  spawnLedger.length = 0;
}

export function __installLocalSpawnInterceptorForTests(fn) {
  spawnSyncImpl = (cmd, args, opts) => fn({ kind: "sync", cmd, args, opts });
  spawnImpl = (cmd, args, opts) => fn({ kind: "async", cmd, args, opts });
}

export function __localSpawnLedgerForTests() {
  return spawnLedger.slice();
}

function reject(reason) {
  const err = new Error(`${LOCAL_CONNECTION_REJECT}: ${reason}`);
  err.code = LOCAL_CONNECTION_REJECT;
  err.reason = reason;
  throw err;
}

function decodeHost(raw) {
  try {
    return decodeURIComponent(String(raw || "")).trim();
  } catch {
    reject("malformed host encoding");
  }
}

function normalizeHost(host) {
  const h = decodeHost(host).replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "0.0.0.0" || h === "::" || h === "::ffff:127.0.0.1") {
    reject(`host ${h} is not an approved loopback target`);
  }
  return h;
}

function isApprovedLoopback(host) {
  return APPROVED_LOOPBACK_HOSTS.includes(normalizeHost(host));
}

function isApprovedSocket(host) {
  return decodeHost(host) === APPROVED_UNIX_SOCKET;
}

function looksLikeIp(host) {
  const h = normalizeHost(host);
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true;
  if (h.includes(":")) return true;
  return false;
}

function assertHostAllowed(host) {
  if (!host) reject("missing host");
  const raw = decodeHost(host);
  const n = normalizeHost(host);
  if (PROD.test(raw) || PROD.test(n)) reject("production project ref in host");
  if (FORBIDDEN_HOST_RE.test(raw) || FORBIDDEN_HOST_RE.test(n)) {
    reject(`remote/pooler/alias host rejected: ${raw}`);
  }
  if (isApprovedSocket(raw)) return { kind: "socket", host: APPROVED_UNIX_SOCKET };
  if (isApprovedLoopback(raw)) return { kind: "loopback", host: n };
  if (looksLikeIp(raw) && !isApprovedLoopback(raw)) {
    reject(`non-loopback IP rejected: ${raw}`);
  }
  reject(`unapproved host/DNS alias rejected: ${raw}`);
}

function assertPortAllowed(port, { required = false } = {}) {
  if (port == null || port === "") {
    if (required) reject("missing port");
    return 5432;
  }
  const n = Number(port);
  if (!Number.isInteger(n) || n < 1 || n > 65535) reject(`malformed port: ${port}`);
  if (n === POOLER_PORT) reject("pooler port 6543 rejected");
  return n;
}

export function assertSafeDatabaseName(name, { role }) {
  const db = String(name || "");
  if (!db) reject("missing database name");
  if (PROD.test(db)) reject("production project ref in database name");
  if (!/^[a-z0-9_]+$/.test(db)) reject(`malformed database name: ${db}`);
  if (role === "admin") {
    if (db !== ADMIN_MAINTENANCE_DB) {
      reject(`admin connection must use maintenance database ${ADMIN_MAINTENANCE_DB}, got ${db}`);
    }
    return db;
  }
  if (!db.startsWith(WORK_DB_PREFIX) || db === WORK_DB_PREFIX) {
    reject(`work database name must begin with ${WORK_DB_PREFIX} plus a suffix, got ${db}`);
  }
  if (db.length > 63) reject("database name exceeds 63 characters");
  return db;
}

export function assertSafeRoleName(role) {
  const user = String(role || "");
  if (!user) reject("missing user");
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(user)) reject(`malformed user: ${user}`);
  return user;
}

function pathnameDatabase(pathname) {
  if (!pathname || pathname === "/") return "";
  return decodeURIComponent(pathname.replace(/^\//, ""));
}

function parseLibpqSocketUrl(url) {
  const match = /^(postgres(?:ql)?):\/\/(?:([^:@/]*)(?::([^@/]*))?@)?\/([^?]*)(\?.*)?$/i.exec(url);
  if (!match) return null;
  const search = new URLSearchParams((match[5] || "").replace(/^\?/, ""));
  return {
    protocol: `${match[1].toLowerCase()}:`,
    username: match[2] || "",
    password: match[3] || "",
    pathname: `/${match[4] || ""}`,
    hostname: "",
    port: "",
    searchParams: search,
  };
}

export function parseLocalConnectionUrl(raw, { role = "work" } = {}) {
  if (raw == null || typeof raw !== "string" || !raw.trim()) {
    reject("missing or empty connection URL");
  }
  const url = raw.trim();
  if (PROD.test(url)) reject("production project ref in connection URL");
  if (/\s/.test(url) && !url.startsWith("postgresql://") && !url.startsWith("postgres://")) {
    reject("malformed connection URL");
  }
  let parsed = parseLibpqSocketUrl(url);
  if (!parsed) {
    try {
      const whatwg = new URL(url);
      parsed = {
        protocol: whatwg.protocol,
        username: whatwg.username,
        password: whatwg.password,
        pathname: whatwg.pathname,
        hostname: whatwg.hostname,
        port: whatwg.port,
        searchParams: whatwg.searchParams,
      };
    } catch {
      reject("malformed connection URL");
    }
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    reject(`unsupported scheme: ${parsed.protocol}`);
  }
  if (parsed.username === "" && parsed.password) {
    reject("malformed userinfo");
  }
  const queryKeys = [...parsed.searchParams.keys()];
  for (const key of queryKeys) {
    if (!ALLOWED_QUERY_KEYS.has(key.toLowerCase())) {
      reject(`unsafe query override rejected: ${key}`);
    }
  }
  const queryHost = parsed.searchParams.get("host");
  const urlHost = parsed.hostname;
  let target;
  if (queryHost && urlHost) {
    reject("ambiguous host: URL hostname and ?host= both set");
  } else if (queryHost) {
    target = assertHostAllowed(queryHost);
  } else if (urlHost) {
    target = assertHostAllowed(urlHost);
  } else {
    reject("missing host (no hostname and no approved Unix socket)");
  }
  const queryPort = parsed.searchParams.get("port");
  const urlPort = parsed.port;
  if (queryPort && urlPort && String(queryPort) !== String(urlPort)) {
    reject("ambiguous port: URL port and ?port= disagree");
  }
  const port = assertPortAllowed(queryPort || urlPort || (target.kind === "socket" ? 5432 : parsed.port));
  const database = assertSafeDatabaseName(pathnameDatabase(parsed.pathname), { role });
  const user = assertSafeRoleName(decodeURIComponent(parsed.username || "ubuntu"));
  const password = decodeURIComponent(parsed.password || "");
  return Object.freeze({
    role,
    kind: target.kind,
    host: target.host,
    port,
    database,
    user,
    password,
    source: url,
  });
}

export function refuseProduction(value) {
  if (PROD.test(String(value || ""))) {
    reject("disposable URL must not target production");
  }
}

export function assertLocalWorkConnection(url) {
  return parseLocalConnectionUrl(url, { role: "work" });
}

export function assertLocalAdminConnection(url) {
  return parseLocalConnectionUrl(url, { role: "admin" });
}

export function assertLocalConnection(url, { role = "work" } = {}) {
  return parseLocalConnectionUrl(url, { role });
}

export function canonicalPsqlArgs(spec) {
  return ["-h", spec.host, "-p", String(spec.port), "-U", spec.user, "-d", spec.database];
}

export function buildLocalSubprocessEnv(spec) {
  const env = {};
  for (const key of ALLOWED_INHERITED_ENV) {
    if (key === "HOME") continue;
    if (process.env[key] != null && process.env[key] !== "") {
      env[key] = process.env[key];
    }
  }
  env.HOME = isolatedCliHomeDir();
  if (spec) {
    env.PGHOST = spec.host;
    env.PGPORT = String(spec.port);
    env.PGDATABASE = spec.database;
    env.PGUSER = spec.user;
    if (spec.password) env.PGPASSWORD = spec.password;
  }
  for (const key of Object.keys(env)) {
    if (isForbiddenEnvKey(key) && !["PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD"].includes(key)) {
      delete env[key];
    }
  }
  return env;
}

export function isForbiddenEnvKey(key) {
  const k = String(key || "");
  if (FORBIDDEN_ENV_EXACT.has(k)) return true;
  if (FORBIDDEN_ENV_PREFIX.some((p) => k === p || k.startsWith(p))) return true;
  if (FORBIDDEN_ENV_SUBSTRING.some((s) => k.includes(s))) return true;
  return false;
}

export function assertEnvSanitized(env) {
  for (const key of Object.keys(env || {})) {
    if (isForbiddenEnvKey(key) && !["PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD"].includes(key)) {
      reject(`subprocess env leaked forbidden key ${key}`);
    }
    const value = String(env[key] ?? "");
    if (PROD.test(value) && key !== "PGPASSWORD") {
      reject(`subprocess env ${key} contains production ref`);
    }
  }
  if (env.HOME !== isolatedCliHomeDir()) {
    reject("subprocess HOME is not the isolated local CLI directory");
  }
}

function recordAndSpawnSync(cmd, args, opts) {
  spawnLedger.push({ kind: "sync", cmd, args: [...(args || [])] });
  return spawnSyncImpl(cmd, args, opts);
}

function recordAndSpawn(cmd, args, opts) {
  spawnLedger.push({ kind: "async", cmd, args: [...(args || [])] });
  return spawnImpl(cmd, args, opts);
}

export function spawnLocalPsqlSync(url, extraArgs, { role = "work" } = {}) {
  const spec = assertLocalConnection(url, { role });
  const env = buildLocalSubprocessEnv(spec);
  assertEnvSanitized(env);
  const args = [...canonicalPsqlArgs(spec), "-X", "-q", "-v", "ON_ERROR_STOP=1", ...extraArgs];
  return {
    spec,
    result: recordAndSpawnSync("psql", args, {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      env,
    }),
  };
}

export function spawnLocalPsql(url, extraArgs, { role = "work" } = {}) {
  const spec = assertLocalConnection(url, { role });
  const env = buildLocalSubprocessEnv(spec);
  assertEnvSanitized(env);
  const args = [...canonicalPsqlArgs(spec), "-X", "-q", "-v", "ON_ERROR_STOP=1", ...extraArgs];
  return recordAndSpawn("psql", args, { env });
}

export function spawnLocalStdbufPsql(url, { role = "work" } = {}) {
  const spec = assertLocalConnection(url, { role });
  const env = buildLocalSubprocessEnv(spec);
  assertEnvSanitized(env);
  const args = ["-oL", "-eL", "psql", ...canonicalPsqlArgs(spec), "-X", "-q", "-v", "ON_ERROR_STOP=1"];
  return recordAndSpawn("stdbuf", args, {
    stdio: ["pipe", "pipe", "pipe"],
    env,
  });
}

export function spawnLocalCliSync(cmd, args, { url, role = "work" } = {}) {
  const spec = url ? assertLocalConnection(url, { role }) : null;
  const env = buildLocalSubprocessEnv(spec);
  assertEnvSanitized(env);
  return recordAndSpawnSync(cmd, args, {
    encoding: "utf8",
    env,
  });
}

export function defaultLocalAdminUrl() {
  return `postgresql://ubuntu@/${ADMIN_MAINTENANCE_DB}?host=${APPROVED_UNIX_SOCKET}`;
}

/** Local-only TCP password for disposable CLI tools that cannot use peer auth. Never used remotely. */
export const LOCAL_TCP_PASSWORD = "f3_local_disposable";

export function localWorkUrl({ database, kind = "socket" }) {
  assertSafeDatabaseName(database, { role: "work" });
  if (kind === "tcp") {
    return `postgresql://ubuntu:${encodeURIComponent(LOCAL_TCP_PASSWORD)}@127.0.0.1:5432/${database}`;
  }
  return `postgresql://ubuntu@/${database}?host=${APPROVED_UNIX_SOCKET}`;
}
