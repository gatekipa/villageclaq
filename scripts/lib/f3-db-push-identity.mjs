/**
 * Read-only disposable identity + history preflight.
 *
 * Management API GET /v1/projects/{ref} and GET /database/migrations
 * only. POST /database/migrations is permanently disqualified and is
 * never called from this module.
 *
 * Token is optional. When absent, identity GET is skipped and the
 * qualifier relies on the constructed --db-url host/ref plus SQL
 * history preflight.
 */
import {
  APPROVED_DISPOSABLE_ORG_ID,
  APPROVED_DISPOSABLE_PROJECT_NAME,
  APPROVED_DISPOSABLE_PROJECT_REF,
  MANAGEMENT_API_APPLY_PERMANENTLY_DISQUALIFIED,
  PRODUCTION_REF,
} from "./f3-db-push-pins.mjs";
import {
  assertDbPushGates,
  readMgmtTokenFromEnv,
  refuseProduction,
  sanitizeForLog,
  tokenPresent,
} from "./f3-db-push-target-guard.mjs";

const MANAGEMENT_API_BASE = "https://api.supabase.com";

let fetchImpl = globalThis.fetch.bind(globalThis);
const fetchLedger = [];

export function __installDbPushFetchForTests(fn) {
  fetchImpl = fn;
}

export function __resetDbPushFetchForTests() {
  fetchImpl = globalThis.fetch.bind(globalThis);
  fetchLedger.length = 0;
}

export function __dbPushFetchLedgerForTests() {
  return fetchLedger.slice();
}

function reject(code, message, details) {
  const err = new Error(message);
  err.code = code;
  if (details) err.details = details;
  throw err;
}

async function authorizedGet(pathname) {
  if (!MANAGEMENT_API_APPLY_PERMANENTLY_DISQUALIFIED) {
    throw new Error("REFUSE: Management API apply must remain permanently disqualified");
  }
  assertDbPushGates({ optIn: true, requirePassword: false });
  if (!tokenPresent()) {
    reject("F3_DBPUSH_TOKEN_MISSING", "identity GET requires optional mgmt token");
  }
  refuseProduction(pathname);
  const token = readMgmtTokenFromEnv();
  const url = `${MANAGEMENT_API_BASE}${pathname}`;
  refuseProduction(url);
  if (/\/database\/migrations$/i.test(pathname) === false && !/\/v1\/projects\/[^/]+$/.test(pathname)) {
    reject("F3_DBPUSH_IDENTITY_PATH_REJECT", "REFUSE: only project GET and migrations GET are allowed");
  }
  if (/POST|PUT|PATCH|DELETE/i.test(pathname)) {
    reject("F3_DBPUSH_IDENTITY_PATH_REJECT", "REFUSE: mutating Management API paths are forbidden");
  }
  fetchLedger.push({ method: "GET", path: pathname });
  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
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
    body: parsed == null ? null : sanitizeForLog(parsed),
    bodyText: sanitizeForLog(rawText),
    rawParsed: parsed,
  };
}

export async function getDisposableProjectIdentity() {
  assertDbPushGates({ optIn: true, requirePassword: false });
  if (!tokenPresent()) {
    return {
      skipped: true,
      reason: "token_missing",
      ref: APPROVED_DISPOSABLE_PROJECT_REF,
      name: APPROVED_DISPOSABLE_PROJECT_NAME,
      note: "Identity GET skipped. Host/ref still enforced by constructed --db-url.",
    };
  }
  const pathname = `/v1/projects/${APPROVED_DISPOSABLE_PROJECT_REF}`;
  const response = await authorizedGet(pathname);
  const identity = response.rawParsed && typeof response.rawParsed === "object" ? response.rawParsed : {};
  const observedName = identity.name || identity.project_name || "";
  const observedRef = identity.ref || identity.id || "";
  const observedOrg = identity.organization_id || identity.organization_slug || "";
  if (response.status !== 200) {
    reject("F3_DBPUSH_IDENTITY_MISMATCH", "REFUSE: disposable identity GET was not 200", {
      status: response.status,
    });
  }
  if (observedRef && observedRef !== APPROVED_DISPOSABLE_PROJECT_REF) {
    reject("F3_DBPUSH_IDENTITY_MISMATCH", "REFUSE: identity ref does not match approved disposable");
  }
  if (observedName !== APPROVED_DISPOSABLE_PROJECT_NAME) {
    reject("F3_DBPUSH_IDENTITY_MISMATCH", "REFUSE: identity name does not match approved disposable");
  }
  if (observedOrg && observedOrg !== APPROVED_DISPOSABLE_ORG_ID) {
    reject("F3_DBPUSH_IDENTITY_MISMATCH", "REFUSE: identity org does not match approved disposable");
  }
  if (String(observedRef).includes(PRODUCTION_REF) || String(observedName).includes(PRODUCTION_REF)) {
    reject("F3_DBPUSH_PRODUCTION_REFUSED", "REFUSE: identity response referenced production");
  }
  return {
    skipped: false,
    ok: true,
    ref: APPROVED_DISPOSABLE_PROJECT_REF,
    name: APPROVED_DISPOSABLE_PROJECT_NAME,
    organizationId: observedOrg || APPROVED_DISPOSABLE_ORG_ID,
    status: response.status,
    capture: sanitizeForLog({
      method: "GET",
      path: pathname,
      status: response.status,
    }),
  };
}

export async function listDisposableMigrationsViaGet() {
  assertDbPushGates({ optIn: true, requirePassword: false });
  if (!tokenPresent()) {
    return { skipped: true, reason: "token_missing", rows: null };
  }
  const pathname = `/v1/projects/${APPROVED_DISPOSABLE_PROJECT_REF}/database/migrations`;
  const response = await authorizedGet(pathname);
  const rows = Array.isArray(response.rawParsed) ? response.rawParsed : [];
  return {
    skipped: false,
    ok: response.ok,
    status: response.status,
    rows: rows.map((row) => ({
      version: row.version != null ? String(row.version) : "",
      name: row.name != null ? String(row.name) : "",
    })),
  };
}

export function refuseManagementApiApply() {
  const err = new Error(
    "REFUSE: Management API POST /database/migrations {query,name} is permanently disqualified",
  );
  err.code = "F3_MAPI_APPLY_PERMANENTLY_DISQUALIFIED";
  throw err;
}
