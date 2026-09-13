/**
 * Local fail-closed tests for the gated Management API harness.
 * No hosted call is made unless a test installs a fetch interceptor.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { afterEach, beforeEach } from "node:test";
import { fileURLToPath } from "node:url";
import {
  APPROVED_DISPOSABLE_ORG_ID,
  APPROVED_DISPOSABLE_PROJECT_NAME,
  APPROVED_DISPOSABLE_PROJECT_REF,
  APPROVED_DISPOSABLE_PROJECT_REFS,
  APPROVED_DISPOSABLE_SENTINEL,
  DESTRUCTIVE_ENV,
  HOLD_VERSION_UNRECOVERABLE,
  MANAGEMENT_API_ACCEPTS_CALLER_VERSION,
  MANAGEMENT_API_APPLY_BODY_FIELDS,
  PRODUCTION_REF,
  REMOTE_MANAGEMENT_API_STATUS,
  SENTINEL_ENV,
  TOKEN_ENV,
  __installRemoteFetchForTests,
  __remoteFetchLedgerForTests,
  __resetRemoteFetchForTests,
  applyRemoteManagementApiMigration,
  applyRemoteManagementApiMigrationFromFile,
  assertRemoteManagementApiAuthorized,
  assertRemoteManagementApiGates,
  historyNameFromFilename,
  listRemoteManagementApiMigrations,
  remoteGatesSatisfiedFromEnv,
  sanitizeForLog,
  sha256Text,
  verifyRemoteProjectIdentity,
} from "./lib/f3-management-api-remote-harness.mjs";
import {
  DISCLOSED_FLOOR_COMPONENTS,
  FLOOR_LIMITATION,
  FROZEN_DIGESTS,
  assertFrozenDigestsOnDisk,
} from "./lib/f3-management-api-disposable-floor.mjs";
import {
  HISTORY_INJECT_MARKER,
  parseIdentityFromAuthoritativeText,
  recoverServerGeneratedIdentity,
  refuseClockOrGuessedVersion,
} from "./lib/f3-management-api-history-inject.mjs";
import {
  createAuthorizedRepairLookup,
  discoverSupabaseCli,
  nextAuthorizedFile,
  readMigrationRepairHelp,
} from "./lib/f3-management-api-repair-continuation.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

function clearRemoteEnv() {
  delete process.env[TOKEN_ENV];
  delete process.env[SENTINEL_ENV];
  delete process.env[DESTRUCTIVE_ENV];
  delete process.env.F3_DISPOSABLE_DB_URL;
}

function setAuthorizedEnv({ token = "sbp_test_token_not_real" } = {}) {
  process.env[TOKEN_ENV] = token;
  process.env[SENTINEL_ENV] = APPROVED_DISPOSABLE_SENTINEL;
  process.env[DESTRUCTIVE_ENV] = "1";
}

function jsonResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(key) {
        return headers[key.toLowerCase()] || headers[key] || null;
      },
    },
    async text() {
      return typeof body === "string" ? body : JSON.stringify(body);
    },
  };
}

beforeEach(() => {
  __resetRemoteFetchForTests();
  clearRemoteEnv();
});

afterEach(() => {
  __resetRemoteFetchForTests();
  clearRemoteEnv();
});

test("approved disposable pins are exact and production is excluded", () => {
  assert.deepEqual([...APPROVED_DISPOSABLE_PROJECT_REFS], ["jkorwnwwmdeflfntxntl"]);
  assert.equal(APPROVED_DISPOSABLE_PROJECT_NAME, "villageclaq-f3-management-api-disposable-20260913");
  assert.equal(APPROVED_DISPOSABLE_SENTINEL, "villageclaq-f3-mapi-20260913-authorized");
  assert.equal(APPROVED_DISPOSABLE_ORG_ID, "eyztkzkprpmlmcabrfef");
  assert.equal(PRODUCTION_REF, "llbnliixczcqfftxpsmb");
  assert.equal(MANAGEMENT_API_ACCEPTS_CALLER_VERSION, false);
  assert.deepEqual([...MANAGEMENT_API_APPLY_BODY_FIELDS], ["query", "name", "rollback"]);
  assert.match(REMOTE_MANAGEMENT_API_STATUS, /jkorwnwwmdeflfntxntl/);
  assert.doesNotMatch(REMOTE_MANAGEMENT_API_STATUS, /llbnliixczcqfftxpsmb/);
});

test("gates refuse production ref before any fetch", () => {
  setAuthorizedEnv();
  assert.throws(
    () =>
      assertRemoteManagementApiGates({
        projectRef: PRODUCTION_REF,
        sentinel: APPROVED_DISPOSABLE_SENTINEL,
        optIn: true,
      }),
    (err) => err.code === "F3_REMOTE_PRODUCTION_REFUSED",
  );
  assert.equal(__remoteFetchLedgerForTests().length, 0);
});

test("gates refuse unapproved ref, wrong sentinel, missing destructive, missing token", () => {
  assert.throws(() => assertRemoteManagementApiAuthorized({ projectRef: "some-disposable", optIn: true }), (err) => {
    assert.equal(err.code, "F3_REMOTE_MANAGEMENT_API_BLOCKED");
    return true;
  });

  process.env[DESTRUCTIVE_ENV] = "1";
  process.env[TOKEN_ENV] = "sbp_x";
  assert.throws(
    () =>
      assertRemoteManagementApiGates({
        projectRef: APPROVED_DISPOSABLE_PROJECT_REF,
        sentinel: "nope",
        optIn: true,
      }),
    (err) => err.code === "F3_REMOTE_MANAGEMENT_API_BLOCKED" && err.details.reason === "sentinel_mismatch",
  );

  clearRemoteEnv();
  process.env[SENTINEL_ENV] = APPROVED_DISPOSABLE_SENTINEL;
  process.env[TOKEN_ENV] = "sbp_x";
  assert.throws(
    () => assertRemoteManagementApiGates({ projectRef: APPROVED_DISPOSABLE_PROJECT_REF, optIn: true }),
    (err) => err.details.reason === "destructive_opt_in_required",
  );

  clearRemoteEnv();
  process.env[SENTINEL_ENV] = APPROVED_DISPOSABLE_SENTINEL;
  process.env[DESTRUCTIVE_ENV] = "1";
  assert.throws(
    () => assertRemoteManagementApiGates({ projectRef: APPROVED_DISPOSABLE_PROJECT_REF, optIn: true }),
    (err) => err.details.reason === "token_missing",
  );
  assert.equal(__remoteFetchLedgerForTests().length, 0);
  assert.equal(remoteGatesSatisfiedFromEnv(), false);
});

test("apply and list throw synchronously and fetch nothing when unauthorized", () => {
  assert.throws(() => applyRemoteManagementApiMigration(), (err) => err.code === "F3_REMOTE_MANAGEMENT_API_BLOCKED");
  assert.throws(() => listRemoteManagementApiMigrations(), (err) => err.code === "F3_REMOTE_MANAGEMENT_API_BLOCKED");
  assert.equal(__remoteFetchLedgerForTests().length, 0);
});

test("token is never accepted as a caller argument and never appears in sanitized logs", () => {
  const token = "sbp_super_secret_token_value";
  setAuthorizedEnv({ token });
  const leaked = sanitizeForLog({
    Authorization: `Bearer ${token}`,
    url: `postgresql://user:${token}@db.jkorwnwwmdeflfntxntl.supabase.co:5432/postgres`,
    note: `header Bearer ${token}`,
  });
  assert.equal(JSON.stringify(leaked).includes(token), false);
  assert.match(JSON.stringify(leaked), /\[REDACTED\]/);
});

test("identity verification requires matching name and refuses org/ref drift", async () => {
  setAuthorizedEnv();
  const calls = [];
  __installRemoteFetchForTests(async (url) => {
    calls.push(url);
    return jsonResponse(200, {
      ref: APPROVED_DISPOSABLE_PROJECT_REF,
      name: "wrong-name",
      organization_id: APPROVED_DISPOSABLE_ORG_ID,
    });
  });
  await assert.rejects(() => verifyRemoteProjectIdentity(), (err) => err.code === "F3_REMOTE_IDENTITY_MISMATCH");
  assert.equal(calls.length, 1);
  assert.match(calls[0], /\/v1\/projects\/jkorwnwwmdeflfntxntl$/);
});

test("file-stream apply POSTs only query/name and captures sanitized metadata", async () => {
  setAuthorizedEnv();
  const tmp = path.join(os.tmpdir(), `f3-mapi-probe-${process.pid}.sql`);
  const sql = "SELECT 1;\nCOMMIT;\n";
  fs.writeFileSync(tmp, sql);
  const seen = [];
  __installRemoteFetchForTests(async (url, init) => {
    seen.push({ url, method: init.method, body: init.body, headers: init.headers });
    if (init.method === "GET" && /\/projects\/jkorwnwwmdeflfntxntl$/.test(url)) {
      return jsonResponse(200, {
        ref: APPROVED_DISPOSABLE_PROJECT_REF,
        name: APPROVED_DISPOSABLE_PROJECT_NAME,
        organization_id: APPROVED_DISPOSABLE_ORG_ID,
      });
    }
    return jsonResponse(200, {}, { "content-type": "application/json", "x-request-id": "req-1" });
  });
  const result = await applyRemoteManagementApiMigrationFromFile({
    fileAbsPath: tmp,
    name: "f3_mapi_probe",
    optIn: true,
  });
  fs.unlinkSync(tmp);
  assert.equal(result.ok, true);
  assert.equal(result.capture.request.callerVersionSent, false);
  assert.deepEqual(result.capture.request.bodyFields, ["name", "query"]);
  assert.equal(result.capture.request.querySha256, sha256Text(sql));
  assert.equal(result.capture.request.name, "f3_mapi_probe");
  const post = seen.find((row) => row.method === "POST");
  assert.ok(post);
  const posted = JSON.parse(post.body);
  assert.deepEqual(Object.keys(posted).sort(), ["name", "query"]);
  assert.equal(posted.version, undefined);
  assert.equal(JSON.stringify(result).includes("sbp_test_token_not_real"), false);
  assert.equal(post.headers.Authorization.includes("sbp_test_token_not_real"), true);
  assert.equal(result.capture.response.headers["x-request-id"], "req-1");
});

test("apply rejects caller version field", async () => {
  setAuthorizedEnv();
  assert.throws(
    () =>
      applyRemoteManagementApiMigration({
        query: "SELECT 1",
        name: "x",
        version: "20260913120000",
        optIn: true,
      }),
    (err) => err.code === "F3_REMOTE_APPLY_BODY_REJECTED",
  );
  assert.equal(__remoteFetchLedgerForTests().length, 0);
});

test("list captures before/after rows from interceptor", async () => {
  setAuthorizedEnv();
  __installRemoteFetchForTests(async (url, init) => {
    if (init.method === "GET" && /\/projects\/jkorwnwwmdeflfntxntl$/.test(url)) {
      return jsonResponse(200, {
        ref: APPROVED_DISPOSABLE_PROJECT_REF,
        name: APPROVED_DISPOSABLE_PROJECT_NAME,
        organization_id: APPROVED_DISPOSABLE_ORG_ID,
      });
    }
    return jsonResponse(200, [{ version: "20260912174049", name: "m2_notification_policy_foundation" }]);
  });
  const listed = await listRemoteManagementApiMigrations({ optIn: true });
  assert.equal(listed.ok, true);
  assert.equal(listed.rows[0].version, "20260912174049");
  assert.equal(listed.capture.response.status, 200);
});

test("version recovery uses response / list / schema only and HOLDs when absent", () => {
  const fromResponse = recoverServerGeneratedIdentity({
    applyResponse: {
      bodyText: `${HISTORY_INJECT_MARKER} version=20260913181200 name=f3_mapi_history_inject_probe`,
    },
    listBefore: [],
    listAfter: [],
    schemaRows: [],
  });
  assert.equal(fromResponse.ok, true);
  assert.equal(fromResponse.version, "20260913181200");
  assert.equal(fromResponse.name, "f3_mapi_history_inject_probe");
  assert.deepEqual(fromResponse.sources, ["response"]);

  const fromList = recoverServerGeneratedIdentity({
    applyResponse: { bodyText: "500" },
    listBefore: [{ version: "20260912174049", name: "m2_notification_policy_foundation" }],
    listAfter: [
      { version: "20260912174049", name: "m2_notification_policy_foundation" },
      { version: "20260913181201", name: "f3_bounded_financial_epoch_foundation" },
    ],
    schemaRows: [
      { version: "20260912174049", name: "m2_notification_policy_foundation" },
      { version: "20260913181201", name: "f3_bounded_financial_epoch_foundation" },
    ],
  });
  assert.equal(fromList.ok, true);
  assert.equal(fromList.version, "20260913181201");
  assert.ok(fromList.sources.includes("list_migrations"));

  const hold = recoverServerGeneratedIdentity({
    applyResponse: { bodyText: "failed to apply database migration" },
    listBefore: [],
    listAfter: [],
    schemaRows: [],
  });
  assert.equal(hold.ok, false);
  assert.equal(hold.hold, HOLD_VERSION_UNRECOVERABLE);

  const disagree = recoverServerGeneratedIdentity({
    applyResponse: {
      bodyText: `${HISTORY_INJECT_MARKER} version=20260913180000 name=one`,
    },
    listBefore: [],
    listAfter: [{ version: "20260913180001", name: "two" }],
    schemaRows: [],
  });
  assert.equal(disagree.ok, false);
  assert.equal(disagree.hold, HOLD_VERSION_UNRECOVERABLE);
  assert.equal(disagree.reason, "authoritative_artifacts_disagree");
});

test("parseIdentityFromAuthoritativeText does not accept a bare 14-digit clock", () => {
  assert.equal(parseIdentityFromAuthoritativeText("applied at 20260913125959"), null);
  assert.equal(parseIdentityFromAuthoritativeText("nearest 20260913125958"), null);
});

test("refuseClockOrGuessedVersion rejects apply-time clock usage", () => {
  assert.throws(() => refuseClockOrGuessedVersion("20260913120000", { nowMs: Date.now() }), /apply-time clock/);
});

test("repair lookup writes exact authorized bytes under recovered timestamp name", () => {
  const file = "00118_f3_bounded_financial_epoch_foundation.sql";
  const sqlBytes = fs.readFileSync(path.join(root, "supabase/migrations", file), "utf8");
  const { lookup, digest } = createAuthorizedRepairLookup({
    version: "20260913181200",
    name: historyNameFromFilename(file),
    sqlBytes,
    digest: FROZEN_DIGESTS[file],
  });
  assert.equal(path.basename(lookup), "20260913181200_f3_bounded_financial_epoch_foundation.sql");
  assert.equal(sha256Text(fs.readFileSync(lookup, "utf8")), FROZEN_DIGESTS[file]);
  assert.equal(digest, FROZEN_DIGESTS[file]);
  fs.rmSync(path.dirname(path.dirname(lookup)), { recursive: true, force: true });
});

test("repair lookup refuses a non-authoritative version", () => {
  assert.throws(
    () =>
      createAuthorizedRepairLookup({
        version: "00118",
        name: "f3_bounded_financial_epoch_foundation",
        sqlBytes: "SELECT 1;\n",
      }),
    /UNRECOVERABLE/,
  );
});

test("frozen 00118-00123 digests stay byte-identical", () => {
  const observed = assertFrozenDigestsOnDisk();
  assert.deepEqual(observed, FROZEN_DIGESTS);
});

test("floor limitation discloses that 00001-00117 is not a clean replay", () => {
  assert.match(FLOOR_LIMITATION, /NOT a clean 00001–00117 replay/);
  assert.deepEqual([...DISCLOSED_FLOOR_COMPONENTS], [
    "prerequisite_stub",
    "live_hgp_enqueue_queue_pins",
    "real_00117",
    "frozen_00118_00123_bytes_not_installed_by_floor",
  ]);
});

test("VillageClaq continuation order is sequential 00118-00123", () => {
  assert.equal(nextAuthorizedFile("00118_f3_bounded_financial_epoch_foundation.sql"), "00119_f3_01_core_ledger_foundation.sql");
  assert.equal(nextAuthorizedFile("00123_f3_05_opening_cash_command.sql"), null);
  assert.equal(historyNameFromFilename("00120_f3_02_secure_posting_idempotency.sql"), "f3_02_secure_posting_idempotency");
});

test("CLI discovery uses --help and does not invent repair flags", () => {
  const cli = discoverSupabaseCli();
  if (!cli.available) {
    assert.equal(cli.available, false);
    return;
  }
  const help = readMigrationRepairHelp();
  assert.equal(help.status, 0);
  assert.equal(help.hasStatus, true);
  assert.equal(help.hasApplied, true);
  assert.equal(help.hasDbUrl, true);
});

test("qualify runner and floor prep refuse to run without env (NOT_RUN)", () => {
  const qualify = fs.readFileSync(path.join(root, "scripts/qualify-f3-management-api-disposable.mjs"), "utf8");
  const prep = fs.readFileSync(path.join(root, "scripts/prep-f3-disposable-management-api-floor.mjs"), "utf8");
  assert.match(qualify, /NOT_RUN/);
  assert.match(qualify, /HOLD — MANAGEMENT API VERSION UNRECOVERABLE/);
  assert.match(qualify, /Do not claim custom skip|NOT CLAIMED/);
  assert.match(prep, /NOT_RUN/);
  assert.match(prep + qualify, /NOT a clean 00001–00117 replay/);
});

test("runbook and evidence withdraw overclaims and keep production ban", () => {
  const runbook = fs.readFileSync(
    path.join(root, "docs/runbooks/F3_FOUNDER_CONTROLLED_MIGRATION_REPAIR.md"),
    "utf8",
  );
  assert.match(runbook, /NEVER automatic/);
  assert.match(runbook, /HOLD — MANAGEMENT API VERSION UNRECOVERABLE|UNRECOVERABLE/);
  assert.match(runbook, /jkorwnwwmdeflfntxntl/);
  assert.match(runbook, /apply-time clock/);
  assert.doesNotMatch(runbook, /repair 00118 /);
});
