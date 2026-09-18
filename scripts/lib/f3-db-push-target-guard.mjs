/**
 * Mandatory targeting controls for the db push qualification candidate.
 *
 * Exact disposable ref / name / org / host only. Production and every
 * other ref are refused first. Sentinel + destructive opt-in + password
 * required before any child process that can reach a database.
 *
 * --db-url is built in-process from env as the Chief-proven session-mode
 * pooler URL (direct db.{ref}.supabase.co:5432 is IPv6-unreachable).
 * Never `-p` / `--password` on argv. Never echo the URL. Isolated HOME +
 * CLI config. Ambient DATABASE_URL / PG* / tokens stripped from the child env.
 *
 * Gate failures are synchronous and spawn nothing.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  APPROVED_DISPOSABLE_DATABASE,
  APPROVED_DISPOSABLE_HOST,
  APPROVED_DISPOSABLE_ORG_ID,
  APPROVED_DISPOSABLE_POOLER_HOST,
  APPROVED_DISPOSABLE_POOLER_PORT,
  APPROVED_DISPOSABLE_POOLER_USER,
  APPROVED_DISPOSABLE_PROJECT_NAME,
  APPROVED_DISPOSABLE_PROJECT_REF,
  DIRECT_DB_HOST_IPV6_LIMITATION,
  TRANSACTION_POOLER_PORT,
  DBPUSH_SENTINEL,
  DBPUSH_SENTINEL_ENV,
  DB_PASSWORD_ENV,
  DB_PUSH_CANDIDATE_STATUS,
  DESTRUCTIVE_ENV,
  DESTRUCTIVE_VALUE,
  MGMT_TOKEN_ENV,
  PRODUCTION_REF,
} from "./f3-db-push-pins.mjs";

export const DBPUSH_GATE_REJECT = "F3_DBPUSH_TARGET_REJECT";
export const DBPUSH_PRODUCTION_REFUSED = "F3_DBPUSH_PRODUCTION_REFUSED";

const PROD = /llbnliixczcqfftxpsmb/i;

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
  "VILLAGECLAQ_F3_DISPOSABLE_DB_PASSWORD",
  "VILLAGECLAQ_F3_DISPOSABLE_MGMT_TOKEN",
  "F3_DISPOSABLE_DB_URL",
]);

const FORBIDDEN_ENV_PREFIX = ["SUPABASE_", "PGSERVICE", "POSTGRES_", "DATABASE_", "DIRECT_"];
const FORBIDDEN_ENV_SUBSTRING = ["SERVICE_ROLE", "SECRET_KEY", "ACCESS_TOKEN", "PROJECT_REF"];

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
]);

let isolatedHomeDir = "";
let spawnSyncImpl = spawnSync;
let spawnImpl = spawn;
const spawnLedger = [];

export function isolatedDbPushHomeDir() {
  if (!isolatedHomeDir) {
    isolatedHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), "f3-dbpush-cli-home-"));
    fs.mkdirSync(path.join(isolatedHomeDir, ".supabase"), { recursive: true });
    fs.mkdirSync(path.join(isolatedHomeDir, ".config"), { recursive: true });
    fs.mkdirSync(path.join(isolatedHomeDir, ".cache"), { recursive: true });
    fs.writeFileSync(path.join(isolatedHomeDir, ".pgpass"), "", { mode: 0o600 });
    fs.writeFileSync(
      path.join(isolatedHomeDir, ".supabase", "README"),
      "VillageClaq isolated db-push CLI home. No inherited credentials.\n",
    );
  }
  return isolatedHomeDir;
}

export function __resetDbPushSpawnForTests() {
  spawnSyncImpl = spawnSync;
  spawnImpl = spawn;
  spawnLedger.length = 0;
  isolatedHomeDir = "";
}

export function __installDbPushSpawnInterceptorForTests(fn) {
  spawnSyncImpl = (cmd, args, opts) => fn({ kind: "sync", cmd, args, opts });
  spawnImpl = (cmd, args, opts) => fn({ kind: "async", cmd, args, opts });
}

export function __dbPushSpawnLedgerForTests() {
  return spawnLedger.slice();
}

function reject(code, message, details) {
  const err = new Error(message);
  err.code = code;
  if (details) err.details = details;
  throw err;
}

export function refuseProduction(value) {
  if (PROD.test(String(value || ""))) {
    reject(
      DBPUSH_PRODUCTION_REFUSED,
      "REFUSE: production project ref is never a db push target",
      { projectRef: PRODUCTION_REF },
    );
  }
}

function readPasswordFromEnv() {
  const password = process.env[DB_PASSWORD_ENV];
  if (password == null || String(password).trim() === "") return "";
  return String(password);
}

function readTokenFromEnv() {
  const token = process.env[MGMT_TOKEN_ENV];
  if (token == null || String(token).trim() === "") return "";
  return String(token);
}

export function passwordPresent() {
  return readPasswordFromEnv().length > 0;
}

export function tokenPresent() {
  return readTokenFromEnv().length > 0;
}

export function sanitizeForLog(value, extraSecrets = []) {
  if (value == null) return value;
  const secrets = extraSecrets.filter(Boolean).map(String);
  const livePassword = readPasswordFromEnv();
  const liveToken = readTokenFromEnv();
  if (livePassword) secrets.push(livePassword);
  if (liveToken) secrets.push(liveToken);
  try {
    const constructed = peekConstructedUrlForSanitize();
    if (constructed) secrets.push(constructed);
  } catch {
    // ignore
  }

  const redactObject = (obj) => {
    if (obj == null || typeof obj !== "object") return sanitizeString(String(obj), secrets);
    if (Array.isArray(obj)) return obj.map((item) => redactObject(item));
    const out = {};
    for (const [key, val] of Object.entries(obj)) {
      if (
        /^(authorization|proxy-authorization|x-api-key|apikey|password|passwd|token|secret|access_token|db_pass|db-url|db_url)$/i.test(
          key,
        )
      ) {
        out[key] = "[REDACTED]";
        continue;
      }
      if (val && typeof val === "object") out[key] = redactObject(val);
      else if (typeof val === "boolean" || typeof val === "number") out[key] = val;
      else out[key] = sanitizeString(val == null ? val : String(val), secrets);
    }
    return out;
  };
  if (typeof value === "object") return redactObject(value);
  return sanitizeString(String(value), secrets);
}

function sanitizeString(text, secrets) {
  if (text == null) return text;
  let s = String(text);
  for (const secret of secrets) {
    if (secret && s.includes(secret)) s = s.split(secret).join("[REDACTED]");
  }
  s = s.replace(/:\/\/([^/@\s]+):([^@/\s]+)@/g, "://[REDACTED]:[REDACTED]@");
  s = s.replace(/(?:bearer\s+)?(?:sbp_|sb_secret_|sb_publishable_)[A-Za-z0-9._-]+/gi, "[REDACTED]");
  s = s.replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]+/g, "[REDACTED]");
  s = s.replace(
    /((?:password|passwd|pwd|secret|token|access_token|authorization|db-url|db_url)\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s&,;]+)/gi,
    "$1[REDACTED]",
  );
  return s;
}

let lastConstructedUrl = "";
function peekConstructedUrlForSanitize() {
  return lastConstructedUrl;
}

export function assertExactDisposableIdentity({
  ref = APPROVED_DISPOSABLE_PROJECT_REF,
  name = APPROVED_DISPOSABLE_PROJECT_NAME,
  org = APPROVED_DISPOSABLE_ORG_ID,
  host = APPROVED_DISPOSABLE_HOST,
} = {}) {
  refuseProduction(ref);
  refuseProduction(name);
  refuseProduction(org);
  refuseProduction(host);
  if (String(ref) !== APPROVED_DISPOSABLE_PROJECT_REF) {
    reject(DBPUSH_GATE_REJECT, DB_PUSH_CANDIDATE_STATUS, {
      reason: "unapproved_ref",
      callerRef: ref || null,
    });
  }
  if (String(name) !== APPROVED_DISPOSABLE_PROJECT_NAME) {
    reject(DBPUSH_GATE_REJECT, DB_PUSH_CANDIDATE_STATUS, { reason: "unapproved_name" });
  }
  if (org && String(org) !== APPROVED_DISPOSABLE_ORG_ID) {
    reject(DBPUSH_GATE_REJECT, DB_PUSH_CANDIDATE_STATUS, { reason: "unapproved_org" });
  }
  if (String(host) !== APPROVED_DISPOSABLE_HOST) {
    reject(DBPUSH_GATE_REJECT, DB_PUSH_CANDIDATE_STATUS, { reason: "unapproved_host" });
  }
  return Object.freeze({
    ref: APPROVED_DISPOSABLE_PROJECT_REF,
    name: APPROVED_DISPOSABLE_PROJECT_NAME,
    org: APPROVED_DISPOSABLE_ORG_ID,
    host: APPROVED_DISPOSABLE_HOST,
  });
}

/**
 * Local fail-closed gates. Synchronous. Never fetches. Never spawns.
 */
export function assertDbPushGates({
  projectRef = APPROVED_DISPOSABLE_PROJECT_REF,
  sentinel,
  optIn,
  requirePassword = true,
} = {}) {
  refuseProduction(projectRef);
  refuseProduction(sentinel);
  refuseProduction(process.env[DBPUSH_SENTINEL_ENV]);
  refuseProduction(process.env[DB_PASSWORD_ENV]);
  refuseProduction(process.env[MGMT_TOKEN_ENV]);

  assertExactDisposableIdentity({ ref: projectRef });

  const callerSentinel = sentinel != null ? String(sentinel) : process.env[DBPUSH_SENTINEL_ENV];
  if (callerSentinel !== DBPUSH_SENTINEL) {
    reject(DBPUSH_GATE_REJECT, DB_PUSH_CANDIDATE_STATUS, {
      reason: "sentinel_mismatch",
      callerSentinelPresent: Boolean(callerSentinel),
    });
  }

  if (process.env[DESTRUCTIVE_ENV] !== DESTRUCTIVE_VALUE) {
    reject(DBPUSH_GATE_REJECT, DB_PUSH_CANDIDATE_STATUS, {
      reason: "destructive_opt_in_required",
      optIn: Boolean(optIn),
    });
  }
  if (optIn === false) {
    reject(DBPUSH_GATE_REJECT, DB_PUSH_CANDIDATE_STATUS, { reason: "caller_opt_in_false" });
  }
  if (requirePassword && !passwordPresent()) {
    reject(DBPUSH_GATE_REJECT, DB_PUSH_CANDIDATE_STATUS, {
      reason: "password_missing",
      passwordEnv: DB_PASSWORD_ENV,
    });
  }
  return Object.freeze({
    projectRef: APPROVED_DISPOSABLE_PROJECT_REF,
    host: APPROVED_DISPOSABLE_HOST,
    implemented: true,
  });
}

export function dbPushGatesSatisfiedFromEnv() {
  try {
    assertDbPushGates({
      projectRef: APPROVED_DISPOSABLE_PROJECT_REF,
      sentinel: process.env[DBPUSH_SENTINEL_ENV],
      optIn: true,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Build the disposable --db-url in-process. Never logs. Never uses `-p`.
 * Session-mode pooler only (Chief live preflight). Direct host is an
 * identity pin, not the candidate connection host.
 */
export function buildDisposableDbUrlFromEnv() {
  assertDbPushGates({ optIn: true });
  const password = readPasswordFromEnv();
  refuseProduction(password);
  if (/[\r\n]/.test(password)) {
    reject(DBPUSH_GATE_REJECT, "REFUSE: password contains a newline", { reason: "malformed_password" });
  }
  const encoded = encodeURIComponent(password);
  const url =
    `postgresql://${APPROVED_DISPOSABLE_POOLER_USER}:${encoded}` +
    `@${APPROVED_DISPOSABLE_POOLER_HOST}:${APPROVED_DISPOSABLE_POOLER_PORT}` +
    `/${APPROVED_DISPOSABLE_DATABASE}?sslmode=require`;
  refuseProduction(url);
  assertConstructedDbUrl(url);
  lastConstructedUrl = url;
  return url;
}

export function assertConstructedDbUrl(url) {
  refuseProduction(url);
  if (typeof url !== "string" || !url.startsWith("postgresql://")) {
    reject(DBPUSH_GATE_REJECT, "REFUSE: db-url must be a postgresql URL");
  }
  if (url.includes(`:${TRANSACTION_POOLER_PORT}`)) {
    reject(DBPUSH_GATE_REJECT, "REFUSE: transaction pooler :6543 is never a db push target");
  }
  if (url.includes(APPROVED_DISPOSABLE_HOST)) {
    reject(DBPUSH_GATE_REJECT, `REFUSE: direct disposable DB host is not the candidate --db-url (${DIRECT_DB_HOST_IPV6_LIMITATION})`);
  }
  if (!url.includes(APPROVED_DISPOSABLE_POOLER_HOST)) {
    reject(DBPUSH_GATE_REJECT, "REFUSE: db-url host is not the approved disposable session-mode pooler");
  }
  if (!url.includes(`${APPROVED_DISPOSABLE_POOLER_HOST}:${APPROVED_DISPOSABLE_POOLER_PORT}`)) {
    reject(DBPUSH_GATE_REJECT, "REFUSE: db-url must use session-mode pooler port 5432");
  }
  if (!url.includes(`${APPROVED_DISPOSABLE_POOLER_USER}@`) && !url.includes(`${APPROVED_DISPOSABLE_POOLER_USER}:`)) {
    reject(DBPUSH_GATE_REJECT, "REFUSE: db-url user must be postgres.{approved-disposable-ref}");
  }
  if (!url.includes(APPROVED_DISPOSABLE_PROJECT_REF)) {
    reject(DBPUSH_GATE_REJECT, "REFUSE: db-url does not target the approved disposable ref");
  }
  if (/pooler/i.test(url) && !url.includes(APPROVED_DISPOSABLE_POOLER_HOST)) {
    reject(DBPUSH_GATE_REJECT, "REFUSE: unapproved pooler host");
  }
  if (url.includes(PRODUCTION_REF)) {
    reject(DBPUSH_PRODUCTION_REFUSED, "REFUSE: production ref in db-url");
  }
  if (!/[?&]sslmode=require(?:&|$)/.test(url)) {
    reject(DBPUSH_GATE_REJECT, "REFUSE: db-url must set sslmode=require");
  }
  return url;
}

export function isForbiddenEnvKey(key) {
  const k = String(key || "");
  if (FORBIDDEN_ENV_EXACT.has(k)) return true;
  if (FORBIDDEN_ENV_PREFIX.some((p) => k === p || k.startsWith(p))) return true;
  if (FORBIDDEN_ENV_SUBSTRING.some((s) => k.includes(s))) return true;
  return false;
}

export function buildDbPushSubprocessEnv() {
  const env = {};
  for (const key of ALLOWED_INHERITED_ENV) {
    if (process.env[key] != null && process.env[key] !== "") env[key] = process.env[key];
  }
  const home = isolatedDbPushHomeDir();
  env.HOME = home;
  env.XDG_CONFIG_HOME = path.join(home, ".config");
  env.XDG_CACHE_HOME = path.join(home, ".cache");
  env.XDG_DATA_HOME = path.join(home, ".local", "share");
  env.XDG_STATE_HOME = path.join(home, ".local", "state");
  for (const key of Object.keys(env)) {
    if (isForbiddenEnvKey(key)) delete env[key];
  }
  return env;
}

export function assertEnvSanitized(env) {
  for (const key of Object.keys(env || {})) {
    if (isForbiddenEnvKey(key)) {
      reject(DBPUSH_GATE_REJECT, `subprocess env leaked forbidden key ${key}`);
    }
    const value = String(env[key] ?? "");
    refuseProduction(value);
  }
  if (env.HOME !== isolatedDbPushHomeDir()) {
    reject(DBPUSH_GATE_REJECT, "subprocess HOME is not the isolated db-push CLI directory");
  }
}

export function assertArgvSafe(args) {
  const list = [...(args || [])];
  for (let i = 0; i < list.length; i += 1) {
    const arg = String(list[i]);
    if (arg === "-p" || arg === "--password") {
      reject(DBPUSH_GATE_REJECT, "REFUSE: password must never appear on argv as -p/--password");
    }
    if (arg === "--linked" || arg === "--local") {
      reject(DBPUSH_GATE_REJECT, "REFUSE: --linked/--local are not the db push candidate targeting mode");
    }
    if (arg === "--project-ref") {
      reject(DBPUSH_GATE_REJECT, "REFUSE: --project-ref is not used; targeting is --db-url only");
    }
    refuseProduction(arg);
  }
  return list;
}

function recordAndSpawnSync(cmd, args, opts) {
  spawnLedger.push({ kind: "sync", cmd, args: [...(args || [])] });
  return spawnSyncImpl(cmd, args, opts);
}

export function spawnDbPushChildSync(cmd, args, { requirePassword = true } = {}) {
  assertDbPushGates({ optIn: true, requirePassword });
  const safeArgs = assertArgvSafe(args);
  const env = buildDbPushSubprocessEnv();
  assertEnvSanitized(env);
  return recordAndSpawnSync(cmd, safeArgs, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    env,
  });
}

const GATED_PSQL_ENV_KEYS = Object.freeze([
  "PGHOST",
  "PGPORT",
  "PGUSER",
  "PGPASSWORD",
  "PGDATABASE",
  "PGSSLMODE",
]);

/**
 * Child env for gated remote `psql -f` (floor / multi-statement only).
 * Password lives in PGPASSWORD only. Never DATABASE_URL. Never `-p` on argv
 * (`-p` is also psql's port flag — port is PGPORT in env).
 */
export function buildGatedRemotePsqlSubprocessEnv() {
  assertDbPushGates({ optIn: true });
  const url = buildDisposableDbUrlFromEnv();
  assertConstructedDbUrl(url);
  const env = buildDbPushSubprocessEnv();
  const password = readPasswordFromEnv();
  env.PGHOST = APPROVED_DISPOSABLE_POOLER_HOST;
  env.PGPORT = String(APPROVED_DISPOSABLE_POOLER_PORT);
  env.PGUSER = APPROVED_DISPOSABLE_POOLER_USER;
  env.PGDATABASE = APPROVED_DISPOSABLE_DATABASE;
  env.PGPASSWORD = password;
  env.PGSSLMODE = "require";
  assertGatedRemotePsqlEnv(env);
  return env;
}

export function assertGatedRemotePsqlEnv(env) {
  if (!env || env.HOME !== isolatedDbPushHomeDir()) {
    reject(DBPUSH_GATE_REJECT, "subprocess HOME is not the isolated db-push CLI directory");
  }
  if (env.DATABASE_URL || env.DIRECT_URL || env.POSTGRES_URL || env.PGURL) {
    reject(DBPUSH_GATE_REJECT, "REFUSE: gated psql child must not receive DATABASE_URL/PGURL");
  }
  if (env.PGHOST !== APPROVED_DISPOSABLE_POOLER_HOST) {
    reject(DBPUSH_GATE_REJECT, "REFUSE: gated psql PGHOST is not the approved session-mode pooler");
  }
  if (env.PGPORT !== String(APPROVED_DISPOSABLE_POOLER_PORT)) {
    reject(DBPUSH_GATE_REJECT, "REFUSE: gated psql PGPORT must be session-mode 5432");
  }
  if (env.PGUSER !== APPROVED_DISPOSABLE_POOLER_USER) {
    reject(DBPUSH_GATE_REJECT, "REFUSE: gated psql PGUSER must be postgres.{approved-ref}");
  }
  if (env.PGDATABASE !== APPROVED_DISPOSABLE_DATABASE) {
    reject(DBPUSH_GATE_REJECT, "REFUSE: gated psql PGDATABASE must be postgres");
  }
  if (env.PGSSLMODE !== "require") {
    reject(DBPUSH_GATE_REJECT, "REFUSE: gated psql PGSSLMODE must be require");
  }
  if (!env.PGPASSWORD) {
    reject(DBPUSH_GATE_REJECT, "REFUSE: gated psql PGPASSWORD missing");
  }
  refuseProduction(env.PGHOST);
  refuseProduction(env.PGUSER);
  refuseProduction(env.PGPASSWORD);
  for (const key of Object.keys(env)) {
    if (GATED_PSQL_ENV_KEYS.includes(key)) continue;
    if (isForbiddenEnvKey(key)) {
      reject(DBPUSH_GATE_REJECT, `subprocess env leaked forbidden key ${key}`);
    }
    refuseProduction(String(env[key] ?? ""));
  }
}

export function spawnGatedRemotePsqlSync(args) {
  assertDbPushGates({ optIn: true });
  const safeArgs = assertArgvSafe(args);
  if (safeArgs.some((a) => String(a) === "-d" || String(a).startsWith("postgresql://"))) {
    reject(DBPUSH_GATE_REJECT, "REFUSE: gated psql must not take a URL on argv");
  }
  const env = buildGatedRemotePsqlSubprocessEnv();
  return recordAndSpawnSync("psql", safeArgs, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    env,
  });
}

export function spawnDbPushHelpSync(cmd, args) {
  const env = buildDbPushSubprocessEnv();
  assertEnvSanitized(env);
  const safeArgs = [...(args || [])];
  if (safeArgs.some((a) => a === "-p" || a === "--password" || a === "--db-url")) {
    reject(DBPUSH_GATE_REJECT, "REFUSE: help discovery must not receive credentials");
  }
  return recordAndSpawnSync(cmd, safeArgs, {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    env,
  });
}

export function readMgmtTokenFromEnv() {
  return readTokenFromEnv();
}
