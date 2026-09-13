/**
 * Remote Management API harness — SEPARATE from local-only helpers.
 *
 * Official contract (do not invent):
 *   POST /v1/projects/{ref}/database/migrations
 *   body accepts ONLY: query (required), name (optional), rollback (optional)
 *   It does NOT accept a caller-selected timestamp/version.
 *   GET  /v1/projects/{ref}/database/migrations  (list)
 *   Docs: https://supabase.com/docs/reference/api/v1-apply-a-migration
 *
 * Founder-authorized disposable ONLY:
 *   ref  jkorwnwwmdeflfntxntl
 *   name villageclaq-f3-management-api-disposable-20260913
 * Production ref `llbnliixczcqfftxpsmb` is never accepted.
 *
 * Token is read ONLY from env VILLAGECLAQ_F3_DISPOSABLE_MGMT_TOKEN.
 * Never hardcode, log, commit, or print the token.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const APPROVED_DISPOSABLE_PROJECT_REF = "jkorwnwwmdeflfntxntl";
export const APPROVED_DISPOSABLE_PROJECT_REFS = Object.freeze([
  APPROVED_DISPOSABLE_PROJECT_REF,
]);
export const APPROVED_DISPOSABLE_PROJECT_NAME =
  "villageclaq-f3-management-api-disposable-20260913";
export const APPROVED_DISPOSABLE_ORG_ID = "eyztkzkprpmlmcabrfef";
export const APPROVED_DISPOSABLE_SENTINEL = "villageclaq-f3-mapi-20260913-authorized";

export const TOKEN_ENV = "VILLAGECLAQ_F3_DISPOSABLE_MGMT_TOKEN";
export const SENTINEL_ENV = "F3_DISPOSABLE_MAPI_SENTINEL";
export const DESTRUCTIVE_ENV = "F3_REMOTE_DESTRUCTIVE_TEST";
export const DESTRUCTIVE_VALUE = "1";

export const PRODUCTION_REF = "llbnliixczcqfftxpsmb";

export const MANAGEMENT_API_BASE = "https://api.supabase.com";
export const MANAGEMENT_API_APPLY_PATH = "/v1/projects/{ref}/database/migrations";
export const MANAGEMENT_API_LIST_PATH = "/v1/projects/{ref}/database/migrations";
export const MANAGEMENT_API_PROJECT_PATH = "/v1/projects/{ref}";
export const MANAGEMENT_API_QUERY_PATH = "/v1/projects/{ref}/database/query";
/** Chief live probe: POST /database/query returned 201 for SQL. */
export const MANAGEMENT_API_APPLY_BODY_FIELDS = Object.freeze(["query", "name", "rollback"]);
export const MANAGEMENT_API_ACCEPTS_CALLER_VERSION = false;

export const REMOTE_MANAGEMENT_API_STATUS =
  "GATED — founder-authorized disposable jkorwnwwmdeflfntxntl only; exact sentinel + destructive opt-in + token + identity required";

export const HOLD_VERSION_UNRECOVERABLE = "HOLD — MANAGEMENT API VERSION UNRECOVERABLE";

const SELECTED_RESPONSE_HEADERS = Object.freeze([
  "content-type",
  "date",
  "retry-after",
  "x-request-id",
  "x-sb-request-id",
  "x-ratelimit-remaining",
  "x-ratelimit-limit",
]);

const fetchLedger = [];
let fetchImpl = globalThis.fetch.bind(globalThis);

export function __installRemoteFetchForTests(fn) {
  fetchImpl = fn;
}

export function __resetRemoteFetchForTests() {
  fetchImpl = globalThis.fetch.bind(globalThis);
  fetchLedger.length = 0;
}

export function __remoteFetchLedgerForTests() {
  return fetchLedger.slice();
}

function reject(code, message, details) {
  const err = new Error(message);
  err.code = code;
  if (details) err.details = details;
  throw err;
}

function refuseProduction(value) {
  if (String(value || "").includes(PRODUCTION_REF)) {
    reject(
      "F3_REMOTE_PRODUCTION_REFUSED",
      "REFUSE: production project ref is never a disposable Management API target",
      { projectRef: PRODUCTION_REF },
    );
  }
}

function readTokenFromEnv() {
  const token = process.env[TOKEN_ENV];
  if (token == null || String(token).trim() === "") return "";
  return String(token);
}

function tokenPresent() {
  return readTokenFromEnv().length > 0;
}

export function historyNameFromFilename(filename) {
  const stem = path.basename(filename).replace(/\.sql$/, "");
  const stripped = stem.replace(/^\d+_/, "");
  if (!stripped || stripped === stem) {
    throw new Error(`cannot derive snake_case history name from ${filename}`);
  }
  return stripped;
}

export function sha256Text(text) {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Redact Authorization, tokens, passwords, and URLs with credentials.
 * Never returns or logs the live token value.
 */
export function sanitizeForLog(value, extraSecrets = []) {
  if (value == null) return value;
  const secrets = extraSecrets.filter(Boolean).map(String);
  const liveToken = readTokenFromEnv();
  if (liveToken) secrets.push(liveToken);

  const redactObject = (obj) => {
    if (obj == null || typeof obj !== "object") return sanitizeString(String(obj), secrets);
    if (Array.isArray(obj)) return obj.map((item) => redactObject(item));
    const out = {};
    for (const [key, val] of Object.entries(obj)) {
      if (/^(authorization|proxy-authorization|x-api-key|apikey|password|passwd|token|secret|access_token|db_pass)$/i.test(key)) {
        out[key] = "[REDACTED]";
        continue;
      }
      if (val && typeof val === "object") {
        out[key] = redactObject(val);
      } else if (typeof val === "boolean" || typeof val === "number") {
        out[key] = val;
      } else {
        out[key] = sanitizeString(val == null ? val : String(val), secrets);
      }
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
    /((?:password|passwd|pwd|secret|token|access_token|authorization)\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s&,;]+)/gi,
    "$1[REDACTED]",
  );
  return s;
}

function selectedHeaders(headers) {
  const out = {};
  if (!headers) return out;
  const get = typeof headers.get === "function" ? (k) => headers.get(k) : (k) => headers[k];
  for (const key of SELECTED_RESPONSE_HEADERS) {
    const val = get.call(headers, key);
    if (val != null && val !== "") out[key] = sanitizeForLog(String(val));
  }
  return out;
}

/**
 * Local fail-closed gates. Synchronous. Never fetches.
 * Requires ALL of: approved ref, exact sentinel, destructive opt-in, token present.
 * Production ref is refused first.
 */
export function assertRemoteManagementApiGates({
  projectRef,
  sentinel,
  optIn,
} = {}) {
  refuseProduction(projectRef);
  refuseProduction(sentinel);
  refuseProduction(process.env[SENTINEL_ENV]);
  refuseProduction(process.env[TOKEN_ENV]);

  const ref = String(projectRef || APPROVED_DISPOSABLE_PROJECT_REF || "");
  refuseProduction(ref);
  if (ref !== APPROVED_DISPOSABLE_PROJECT_REF) {
    reject(
      "F3_REMOTE_MANAGEMENT_API_BLOCKED",
      REMOTE_MANAGEMENT_API_STATUS,
      {
        reason: "unapproved_ref",
        approvedRefs: [...APPROVED_DISPOSABLE_PROJECT_REFS],
        callerRef: projectRef || null,
        implemented: true,
      },
    );
  }

  const expectedSentinel = APPROVED_DISPOSABLE_SENTINEL;
  const callerSentinel = sentinel != null ? String(sentinel) : process.env[SENTINEL_ENV];
  if (callerSentinel !== expectedSentinel) {
    reject(
      "F3_REMOTE_MANAGEMENT_API_BLOCKED",
      REMOTE_MANAGEMENT_API_STATUS,
      {
        reason: "sentinel_mismatch",
        approvedSentinelPresent: true,
        callerSentinelPresent: Boolean(callerSentinel),
        implemented: true,
      },
    );
  }

  const destructive = process.env[DESTRUCTIVE_ENV];
  if (destructive !== DESTRUCTIVE_VALUE) {
    reject(
      "F3_REMOTE_MANAGEMENT_API_BLOCKED",
      REMOTE_MANAGEMENT_API_STATUS,
      {
        reason: "destructive_opt_in_required",
        optIn: Boolean(optIn),
        implemented: true,
      },
    );
  }

  if (optIn === false) {
    reject(
      "F3_REMOTE_MANAGEMENT_API_BLOCKED",
      REMOTE_MANAGEMENT_API_STATUS,
      { reason: "caller_opt_in_false", implemented: true },
    );
  }

  if (!tokenPresent()) {
    reject(
      "F3_REMOTE_MANAGEMENT_API_BLOCKED",
      REMOTE_MANAGEMENT_API_STATUS,
      {
        reason: "token_missing",
        tokenEnv: TOKEN_ENV,
        implemented: true,
      },
    );
  }

  return Object.freeze({
    projectRef: APPROVED_DISPOSABLE_PROJECT_REF,
    implemented: true,
  });
}

export function assertRemoteManagementApiAuthorized(opts = {}) {
  return assertRemoteManagementApiGates(opts);
}

function pathFor(template, ref) {
  return template.replace("{ref}", ref);
}

async function authorizedFetch(pathname, { method, body, projectRef } = {}) {
  const gates = assertRemoteManagementApiGates({ projectRef, optIn: true });
  const token = readTokenFromEnv();
  const url = `${MANAGEMENT_API_BASE}${pathname}`;
  refuseProduction(url);
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const init = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);

  fetchLedger.push({
    method,
    path: pathname,
    projectRef: gates.projectRef,
    bodyFields: body && typeof body === "object" ? Object.keys(body).sort() : [],
  });

  const response = await fetchImpl(url, init);
  let rawText = "";
  try {
    rawText = await response.text();
  } catch {
    rawText = "";
  }
  let parsed = null;
  if (rawText) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = null;
    }
  }
  return {
    ok: response.ok,
    status: response.status,
    headers: selectedHeaders(response.headers),
    bodyText: sanitizeForLog(rawText),
    body: parsed == null ? null : sanitizeForLog(parsed),
    rawParsed: parsed,
  };
}

function captureFrom(method, pathname, requestMeta, response, extra = {}) {
  return {
    method,
    path: pathname,
    projectRef: APPROVED_DISPOSABLE_PROJECT_REF,
    request: sanitizeForLog(requestMeta),
    response: {
      status: response.status,
      headers: response.headers,
      body: response.body,
      bodyText: response.bodyText,
    },
    ...extra,
  };
}

export async function verifyRemoteProjectIdentity({ projectRef } = {}) {
  const gates = assertRemoteManagementApiGates({ projectRef, optIn: true });
  const pathname = pathFor(MANAGEMENT_API_PROJECT_PATH, gates.projectRef);
  const response = await authorizedFetch(pathname, {
    method: "GET",
    projectRef: gates.projectRef,
  });
  const identity = response.rawParsed && typeof response.rawParsed === "object" ? response.rawParsed : {};
  const observedName = identity.name || identity.project_name || "";
  const observedRef = identity.ref || identity.id || "";
  const observedOrg = identity.organization_id || identity.organization_slug || "";

  if (response.status !== 200) {
    reject(
      "F3_REMOTE_IDENTITY_MISMATCH",
      "REFUSE: disposable project identity verification failed (non-200)",
      {
        status: response.status,
        capture: captureFrom("GET", pathname, { bodyFields: [] }, response),
      },
    );
  }
  if (observedRef && observedRef !== APPROVED_DISPOSABLE_PROJECT_REF) {
    reject(
      "F3_REMOTE_IDENTITY_MISMATCH",
      "REFUSE: project ref on identity response does not match approved disposable",
      { observedRef: sanitizeForLog(observedRef) },
    );
  }
  if (observedName !== APPROVED_DISPOSABLE_PROJECT_NAME) {
    reject(
      "F3_REMOTE_IDENTITY_MISMATCH",
      "REFUSE: project name does not match approved disposable identity",
      { observedName: sanitizeForLog(observedName) },
    );
  }
  if (observedOrg && observedOrg !== APPROVED_DISPOSABLE_ORG_ID) {
    reject(
      "F3_REMOTE_IDENTITY_MISMATCH",
      "REFUSE: project organization does not match approved disposable org",
      { observedOrg: sanitizeForLog(observedOrg) },
    );
  }
  return {
    ok: true,
    ref: APPROVED_DISPOSABLE_PROJECT_REF,
    name: APPROVED_DISPOSABLE_PROJECT_NAME,
    organizationId: observedOrg || APPROVED_DISPOSABLE_ORG_ID,
    capture: captureFrom("GET", pathname, { bodyFields: [] }, response, {
      identity: {
        name: APPROVED_DISPOSABLE_PROJECT_NAME,
        ref: APPROVED_DISPOSABLE_PROJECT_REF,
      },
    }),
  };
}

function assertApplyBody({ query, name, rollback, ...rest }) {
  const extra = Object.keys(rest);
  if (extra.length) {
    reject(
      "F3_REMOTE_APPLY_BODY_REJECTED",
      `REFUSE: Management API apply body accepts only ${MANAGEMENT_API_APPLY_BODY_FIELDS.join(", ")}`,
      { extra },
    );
  }
  if ("version" in rest || rest.version != null) {
    reject("F3_REMOTE_APPLY_BODY_REJECTED", "REFUSE: caller version is not an official apply body field");
  }
  if (query == null || String(query) === "") {
    reject("F3_REMOTE_APPLY_BODY_REJECTED", "REFUSE: apply body.query is required");
  }
  const body = { query: String(query) };
  if (name != null) body.name = String(name);
  if (rollback != null) body.rollback = String(rollback);
  return body;
}

async function applyRemoteManagementApiMigrationAuthorized(opts) {
  const identity = await verifyRemoteProjectIdentity({ projectRef: opts.projectRef });
  const body = assertApplyBody({
    query: opts.query,
    name: opts.name,
    rollback: opts.rollback,
  });
  const pathname = pathFor(MANAGEMENT_API_APPLY_PATH, APPROVED_DISPOSABLE_PROJECT_REF);
  const requestMeta = {
    bodyFields: Object.keys(body).sort(),
    name: body.name || null,
    rollbackPresent: body.rollback != null,
    queryBytes: Buffer.byteLength(body.query, "utf8"),
    querySha256: sha256Text(body.query),
    fileStream: Boolean(opts.fileAbsPath),
    callerVersionSent: false,
  };
  const beforeHistory = opts.beforeHistory ?? null;
  const response = await authorizedFetch(pathname, {
    method: "POST",
    body,
    projectRef: APPROVED_DISPOSABLE_PROJECT_REF,
  });
  return {
    ok: response.ok,
    status: response.status,
    body: response.body,
    bodyText: response.bodyText,
    identity,
    capture: captureFrom("POST", pathname, requestMeta, response, {
      beforeHistory,
      afterHistory: opts.afterHistory ?? null,
    }),
  };
}

/**
 * Gate failures throw synchronously (fail-closed, zero fetch).
 * Authorized calls return a Promise.
 */
export function applyRemoteManagementApiMigration(opts = {}) {
  assertRemoteManagementApiGates({
    projectRef: opts.projectRef,
    sentinel: opts.sentinel,
    optIn: opts.optIn,
  });
  if (opts.version != null) {
    reject(
      "F3_REMOTE_APPLY_BODY_REJECTED",
      "REFUSE: caller-selected version is not accepted by Management API apply",
    );
  }
  return applyRemoteManagementApiMigrationAuthorized(opts);
}

export function applyRemoteManagementApiMigrationFromFile({
  fileAbsPath,
  name,
  rollback,
  projectRef,
  sentinel,
  optIn,
  beforeHistory,
} = {}) {
  assertRemoteManagementApiGates({ projectRef, sentinel, optIn });
  if (!fileAbsPath) throw new Error("fileAbsPath is required for file-stream apply");
  const query = fs.readFileSync(fileAbsPath, "utf8");
  const derivedName = name || historyNameFromFilename(fileAbsPath);
  return applyRemoteManagementApiMigration({
    query,
    name: derivedName,
    rollback,
    projectRef,
    sentinel,
    optIn,
    fileAbsPath,
    beforeHistory,
  });
}

async function listRemoteManagementApiMigrationsAuthorized(opts) {
  const identity = opts.skipIdentity
    ? { ok: true, skipped: true }
    : await verifyRemoteProjectIdentity({ projectRef: opts.projectRef });
  const pathname = pathFor(MANAGEMENT_API_LIST_PATH, APPROVED_DISPOSABLE_PROJECT_REF);
  const response = await authorizedFetch(pathname, {
    method: "GET",
    projectRef: APPROVED_DISPOSABLE_PROJECT_REF,
  });
  const rows = Array.isArray(response.rawParsed) ? response.rawParsed : [];
  return {
    ok: response.ok,
    status: response.status,
    rows,
    identity,
    capture: captureFrom("GET", pathname, { bodyFields: [] }, response),
  };
}

export function listRemoteManagementApiMigrations(opts = {}) {
  assertRemoteManagementApiGates({
    projectRef: opts.projectRef,
    sentinel: opts.sentinel,
    optIn: opts.optIn,
  });
  return listRemoteManagementApiMigrationsAuthorized(opts);
}

/**
 * SQL query helper for disposable floor / inject / verify ONLY.
 * This is NOT the production apply runner and must not be used to apply 00118+.
 */
export async function queryRemoteDisposableDatabase({ query, projectRef, skipIdentity } = {}) {
  assertRemoteManagementApiGates({ projectRef, optIn: true });
  refuseProduction(query);
  if (query == null || String(query).trim() === "") {
    throw new Error("query is required");
  }
  if (!skipIdentity) {
    await verifyRemoteProjectIdentity({ projectRef });
  }
  const pathname = pathFor(MANAGEMENT_API_QUERY_PATH, APPROVED_DISPOSABLE_PROJECT_REF);
  const requestMeta = {
    bodyFields: ["query"],
    queryBytes: Buffer.byteLength(String(query), "utf8"),
    querySha256: sha256Text(String(query)),
    notApplyRunner: true,
  };
  const response = await authorizedFetch(pathname, {
    method: "POST",
    body: { query: String(query) },
    projectRef: APPROVED_DISPOSABLE_PROJECT_REF,
  });
  return {
    ok: response.ok,
    status: response.status,
    body: response.body,
    bodyText: response.bodyText,
    rawParsed: response.rawParsed,
    capture: captureFrom("POST", pathname, requestMeta, response),
  };
}

export function remoteGatesSatisfiedFromEnv() {
  try {
    assertRemoteManagementApiGates({
      projectRef: APPROVED_DISPOSABLE_PROJECT_REF,
      sentinel: process.env[SENTINEL_ENV],
      optIn: true,
    });
    return true;
  } catch {
    return false;
  }
}
