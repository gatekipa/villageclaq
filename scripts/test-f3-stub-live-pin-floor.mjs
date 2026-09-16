/**
 * Unit tests for the documented stub+live-pin db-push floor.
 * No hosted call. 00118–00123 SQL bytes are never rewritten.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { afterEach, beforeEach } from "node:test";
import { fileURLToPath } from "node:url";
import {
  LIVE_ENQ_DEF_MD5,
  LIVE_HGP_DEF_MD5,
  extractEnqueueCreateSql,
  extractHasGroupPermissionCreateSql,
} from "./_m2_apply_disposable_floor.mjs";
import {
  CUT2_QUEUE_SLICE_SQL,
  REGRESSION_SLICE_SQL,
  STUB_CORE_SQL,
} from "./fixtures/f3-forward-prerequisites.mjs";
import { remoteFloorOwnershipAndAclSql } from "./lib/f3-management-api-disposable-floor.mjs";
import {
  DB_PASSWORD_ENV,
  DBPUSH_SENTINEL,
  DBPUSH_SENTINEL_ENV,
  DESTRUCTIVE_ENV,
  FILE_BASED_RUNNER_VERDICTS,
  FROZEN_DIGESTS,
} from "./lib/f3-db-push-pins.mjs";
import {
  __installDbPushSpawnInterceptorForTests,
  __resetDbPushSpawnForTests,
} from "./lib/f3-db-push-target-guard.mjs";
import { createIsolatedDbPushWorkdir } from "./lib/f3-db-push-version-map.mjs";
import { installHostedFloor } from "./lib/f3-db-push-floor.mjs";
import {
  DISCLOSED_STUB_LIVE_PIN_COMPONENTS,
  FILE_00117,
  FLOOR_MODES,
  GREENFIELD_DISALLOWED_FOR_THIS_AUTH,
  HOSTED_DEFAULT_FLOOR_MODE,
  QUALIFICATION_FLOOR_LABEL,
  STUB_LIVE_PIN_FLOOR_AUTHORITY,
  assertFloorDoesNotUseDisqualifiedRunners,
  assertIsolatedWorkdirOnlyF3Forward,
  assertStubFloorDoesNotReplayOrTransform,
  evaluatePreDbPushGates,
  extractPsqlErrorLines,
  floorApplyOk,
  installStubLivePinFloor,
  passingPreDbPushFixture,
  readUnmodified00117Bytes,
  resolveHostedFloorMode,
  stubLivePinFloorPrecheck,
  stubLivePinFloorSqlSteps,
  PUBLIC_UUID_GENERATE_V5_WRAPPER_SQL,
} from "./lib/f3-db-push-stub-live-pin-floor.mjs";
import {
  FAILED_FLOOR_STORAGE_BUCKETS,
  FAILED_FLOOR_STORAGE_POLICY_NAMES,
  classifyInventory,
  isCleanBaseline,
} from "./lib/f3-db-push-inventory.mjs";
import {
  coerceJsonValue,
  inventoryFromQuery,
  inventoryFromQueryStdout,
  parseEvidenceOutArg,
  parseJsonish,
  rowsFromQuery,
  unwrapCliRowsEnvelope,
} from "./lib/f3-db-push-query-parse.mjs";
import {
  CHIEF_06_PRE_STUB_FLOOR_CLEAN_CHECK,
  PRE_STUB_FLOOR_CLEAN_CHECK_HOLD,
  assertPreStubFloorCleanCheck,
  evaluatePreStubFloorCleanCheck,
  matchesChief06CleanCheck,
  passingPreStubFloorCleanInventory,
} from "./lib/f3-db-push-pre-stub-floor-clean-check.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

function setAuthorizedEnv() {
  process.env[DB_PASSWORD_ENV] = "f3-dbpush-test-password-not-real";
  process.env[DBPUSH_SENTINEL_ENV] = DBPUSH_SENTINEL;
  process.env[DESTRUCTIVE_ENV] = "1";
}

function clearEnv() {
  delete process.env[DB_PASSWORD_ENV];
  delete process.env[DBPUSH_SENTINEL_ENV];
  delete process.env[DESTRUCTIVE_ENV];
}

beforeEach(() => {
  __resetDbPushSpawnForTests();
  clearEnv();
});

afterEach(() => {
  __resetDbPushSpawnForTests();
  clearEnv();
});

test("required qualification floor label is exact", () => {
  assert.equal(
    QUALIFICATION_FLOOR_LABEL,
    "DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT",
  );
  assert.match(STUB_LIVE_PIN_FLOOR_AUTHORITY, /gated disposable psql -f/);
  assert.match(STUB_LIVE_PIN_FLOOR_AUTHORITY, /NOT 00001–00116 replay/);
  assert.match(STUB_LIVE_PIN_FLOOR_AUTHORITY, /NOT 00030\/00057/);
  assert.match(STUB_LIVE_PIN_FLOOR_AUTHORITY, /Do not invent 00117 history/);
  assert.deepEqual([...DISCLOSED_STUB_LIVE_PIN_COMPONENTS], [
    "STUB_CORE_SQL",
    "public_uuid_generate_v5_wrapper",
    "REGRESSION_SLICE_SQL",
    "CUT2_QUEUE_SLICE_SQL",
    "live_has_group_permission_cut3",
    "enqueue_outbound_notification_00115_extract",
    "remoteFloorOwnershipAndAclSql",
    "unmodified_00117_gated_psql",
  ]);
});

test("hosted default floor mode is stub-live-pin and greenfield is refused", () => {
  assert.equal(HOSTED_DEFAULT_FLOOR_MODE, FLOOR_MODES.STUB_LIVE_PIN);
  assert.equal(resolveHostedFloorMode(), FLOOR_MODES.STUB_LIVE_PIN);
  assert.equal(resolveHostedFloorMode("stub-live-pin"), FLOOR_MODES.STUB_LIVE_PIN);
  assert.throws(() => resolveHostedFloorMode("greenfield"), (err) => {
    assert.equal(err.code, "F3_DBPUSH_GREENFIELD_DISALLOWED");
    assert.equal(err.message, GREENFIELD_DISALLOWED_FOR_THIS_AUTH);
    return true;
  });
  assert.throws(() => installHostedFloor({ workdir: "/tmp", mode: "greenfield" }), /greenfield/);
});

test("floor SQL steps are the disclosed components and reuse repo fixtures", () => {
  const steps = stubLivePinFloorSqlSteps();
  assert.deepEqual(
    steps.map((s) => s.id),
    [
      "prerequisite_stub",
      "public_uuid_generate_v5_wrapper",
      "regression_slice",
      "cut2_queue_slice",
      "live_has_group_permission_cut3",
      "enqueue_outbound_notification_00115_extract",
      "remote_floor_ownership_and_acl",
    ],
  );
  assert.equal(steps[0].sql, STUB_CORE_SQL);
  assert.equal(steps[1].sql, PUBLIC_UUID_GENERATE_V5_WRAPPER_SQL);
  assert.equal(steps[2].sql, REGRESSION_SLICE_SQL);
  assert.equal(steps[3].sql, CUT2_QUEUE_SLICE_SQL);
  assert.equal(steps[4].sql, extractHasGroupPermissionCreateSql());
  assert.equal(steps[5].sql, extractEnqueueCreateSql());
  assert.equal(steps[6].sql, remoteFloorOwnershipAndAclSql());
  assert.equal(assertStubFloorDoesNotReplayOrTransform(), true);
  assert.equal(assertFloorDoesNotUseDisqualifiedRunners(), true);
});

test("live pins come from Cut 3 hex and 00115 extract; 00117 bytes stay unmodified", () => {
  const hgp = extractHasGroupPermissionCreateSql();
  const enq = extractEnqueueCreateSql();
  const hex = JSON.parse(fs.readFileSync(path.join(root, "scripts/_cut3_live_functiondef_hex.json"), "utf8"));
  const decoded = Buffer.from(hex.functions["public.has_group_permission"].hex, "hex").toString("utf8");
  assert.ok(hgp.startsWith(decoded.replace(/\s+$/, "")));
  assert.equal(hex.functions["public.has_group_permission"].md5, LIVE_HGP_DEF_MD5);
  assert.match(enq, /CREATE OR REPLACE FUNCTION public\.enqueue_outbound_notification\(/);
  const src115 = fs.readFileSync(
    path.join(root, "supabase/migrations/00115_s0_p0b_cut2_notification_queue.sql"),
    "utf8",
  );
  assert.ok(src115.includes(enq.slice(0, 80)));
  const file00117 = readUnmodified00117Bytes();
  assert.equal(file00117.byteLength, fs.statSync(path.join(root, "supabase/migrations", FILE_00117)).size);
  assert.doesNotMatch(file00117.text, /schema_migrations/);
  assert.equal(LIVE_ENQ_DEF_MD5, "dbdb16cdced6cae9cbdbfb6a6a9f421f");
});

test("isolated db-push workdir stays 00118-00123 only", () => {
  const isolated = createIsolatedDbPushWorkdir();
  const listed = assertIsolatedWorkdirOnlyF3Forward(isolated.workdir);
  assert.equal(listed.names.length, 6);
  assert.equal(listed.names[0], "20260913173000_f3_bounded_financial_epoch_foundation.sql");
  assert.equal(listed.names.some((n) => n.includes("00117")), false);
  fs.rmSync(isolated.workdir, { recursive: true, force: true });
});

test("pre-db-push gates pass the fixture and HOLD on any miss", () => {
  const isolated = createIsolatedDbPushWorkdir();
  const ok = evaluatePreDbPushGates({
    captured: passingPreDbPushFixture(),
    isolatedWorkdir: isolated.workdir,
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.cleanReplay00001_00117, false);
  assert.equal(ok.productionEquivalent, false);
  const bad = evaluatePreDbPushGates({
    captured: { ...passingPreDbPushFixture(), history_rows: [{ version: "00117", name: "m2_notification_policy_foundation" }] },
    isolatedWorkdir: isolated.workdir,
  });
  assert.equal(bad.ok, false);
  assert.ok(bad.gates.some((g) => g.id === "history_empty" && g.ok === false));
  const drift = evaluatePreDbPushGates({
    captured: { ...passingPreDbPushFixture(), hgp: { ...passingPreDbPushFixture().hgp, def_md5: "deadbeef" } },
    isolatedWorkdir: isolated.workdir,
  });
  assert.equal(drift.ok, false);
  fs.rmSync(isolated.workdir, { recursive: true, force: true });
});

test("gated stub+live-pin install uses psql -f for all floor SQL and never writes 00117 into migrations", () => {
  setAuthorizedEnv();
  const applied = [];
  __installDbPushSpawnInterceptorForTests(({ cmd, args }) => {
    assert.equal(cmd, "psql");
    assert.ok(args.includes("-f"));
    assert.equal(args.includes("-p"), false);
    applied.push(path.basename(args[args.indexOf("-f") + 1]));
    return { status: 0, stdout: "ok", stderr: "", signal: null };
  });
  const isolated = createIsolatedDbPushWorkdir();
  const result = installStubLivePinFloor({ workdir: isolated.workdir });
  assert.equal(result.installed, true);
  assert.equal(result.exact, true);
  assert.equal(result.label, QUALIFICATION_FLOOR_LABEL);
  assert.equal(result.cleanReplay00001_00117, false);
  assert.equal(result.productionEquivalent, false);
  assert.equal(result.invented00117History, false);
  assert.equal(result.transforms["00030"], false);
  assert.equal(result.transforms["00057"], false);
  assert.deepEqual(
    result.steps.map((s) => s.id),
    [
      "prerequisite_stub",
      "public_uuid_generate_v5_wrapper",
      "regression_slice",
      "cut2_queue_slice",
      "live_has_group_permission_cut3",
      "enqueue_outbound_notification_00115_extract",
      "remote_floor_ownership_and_acl",
      "unmodified_00117_gated_psql",
    ],
  );
  assert.ok(result.steps.every((s) => s.runner === "gated_psql_file"));
  assert.ok(result.steps.every((s) => typeof s.stderrTail === "string"));
  assert.ok(result.steps.every((s) => Array.isArray(s.errors)));
  assert.ok(applied.includes(FILE_00117));
  assert.equal(applied.some((n) => /00030|00057|00001/.test(n)), false);
  const mig = fs.readdirSync(path.join(isolated.workdir, "supabase", "migrations"));
  assert.equal(mig.includes(FILE_00117), false);
  assert.ok(fs.existsSync(path.join(isolated.workdir, "floor-sql", FILE_00117)));
  fs.rmSync(isolated.workdir, { recursive: true, force: true });
});

function inventoryJson(extra = {}) {
  return JSON.stringify({
    ...passingPreStubFloorCleanInventory(),
    storage_policies: [],
    storage_buckets: [],
    ...extra,
  });
}

function boxTableStdout(jsonText) {
  const inner = jsonText.replace(/\n/g, " ");
  return [
    "┌────────────────────────────────────────────────────────────────┐",
    "│                      jsonb_build_object                        │",
    "├────────────────────────────────────────────────────────────────┤",
    `│ ${inner} │`,
    "└────────────────────────────────────────────────────────────────┘",
    "(1 row)",
  ].join("\n");
}

function prettyBoxTableStdout(obj) {
  const pretty = JSON.stringify(obj, null, 2);
  const lines = [
    "╭──────────────────────────────────────────╮",
    "│           jsonb_build_object             │",
    "├──────────────────────────────────────────┤",
  ];
  for (const line of pretty.split("\n")) {
    lines.push(`│ ${line} │`);
  }
  lines.push("╰──────────────────────────────────────────╯");
  lines.push("(1 row)");
  return lines.join("\n");
}

test("parseJsonish extracts JSON from supabase db query table/text stdout", () => {
  const payload = {
    ...passingPreStubFloorCleanInventory(),
    storage_policies: [...FAILED_FLOOR_STORAGE_POLICY_NAMES],
    storage_buckets: [...FAILED_FLOOR_STORAGE_BUCKETS],
  };
  const raw = inventoryJson(payload);
  const boxed = boxTableStdout(raw);
  const parsedBoxed = parseJsonish(boxed);
  assert.equal(typeof parsedBoxed, "object");
  assert.ok(!Array.isArray(parsedBoxed));
  assert.deepEqual(parsedBoxed.public_tables, []);
  assert.equal(parsedBoxed.schema_migrations_rows, 0);
  assert.equal(parsedBoxed.financial_core, false);
  assert.equal(parsedBoxed.storage_policies.length, 10);
  assert.deepEqual(inventoryFromQueryStdout(boxed).storage_buckets, [...FAILED_FLOOR_STORAGE_BUCKETS]);

  const pretty = prettyBoxTableStdout(payload);
  const parsedPretty = parseJsonish(pretty);
  assert.equal(typeof parsedPretty, "object");
  assert.deepEqual(parsedPretty.public_tables, []);
  assert.equal(inventoryFromQueryStdout(pretty).schema_migrations_present, true);

  const psql = `   jsonb_build_object    \n-------------------------\n ${raw}\n(1 row)\n`;
  assert.equal(inventoryFromQueryStdout(psql).schema_migrations_rows, 0);

  const naiveWouldFail = boxed;
  assert.notEqual(typeof naiveWouldFail, "object");
  const start = naiveWouldFail.search(/[\[{]/);
  assert.throws(() => JSON.parse(naiveWouldFail.slice(start)));

  const envelope = {
    rows: [{ jsonb_build_object: payload }],
  };
  const fromEnvelope = inventoryFromQuery(JSON.stringify(envelope));
  assert.equal(typeof fromEnvelope, "object");
  assert.deepEqual(fromEnvelope.public_tables, []);
  assert.equal(fromEnvelope.schema_migrations_present, true);
  assert.equal(fromEnvelope.storage_policies.length, 10);
  const asTopLevelArray = [payload];
  assert.deepEqual(unwrapCliRowsEnvelope(asTopLevelArray), asTopLevelArray);
  assert.deepEqual(unwrapCliRowsEnvelope(envelope), envelope.rows);
  const fromTopLevelArray = inventoryFromQuery(JSON.stringify(asTopLevelArray));
  assert.deepEqual(fromTopLevelArray.public_tables, []);
  assert.equal(fromTopLevelArray.schema_migrations_present, true);
  const cleanFromEnvelope = evaluatePreStubFloorCleanCheck({ inventory: envelope });
  assert.equal(cleanFromEnvelope.clean_ok, true);
  assert.equal(cleanFromEnvelope.public_tables, 0);
});

test("coerceJsonValue peels double-encoded jsonb_build_object strings up to 3 times", () => {
  const payload = passingPreStubFloorCleanInventory();
  const once = JSON.stringify(payload);
  assert.equal(typeof coerceJsonValue(once), "object");
  assert.deepEqual(coerceJsonValue(once).public_tables, []);
  assert.equal(coerceJsonValue(once).schema_migrations_present, true);
  assert.deepEqual(coerceJsonValue(payload), payload);
  assert.equal(coerceJsonValue("not-json"), "not-json");
  let layered = once;
  for (let i = 0; i < 2; i += 1) layered = JSON.stringify(layered);
  // Layered quotes start with `"`, not `{` — coerce stops; CLI field is `{...}`.
  assert.equal(typeof coerceJsonValue(layered), "string");

  const capturedBody = {
    rows: [{ jsonb_build_object: once }],
  };
  const fromStringField = inventoryFromQuery(JSON.stringify(capturedBody));
  assert.equal(typeof fromStringField, "object");
  assert.notEqual(typeof fromStringField, "string");
  assert.equal(fromStringField.schema_migrations_present, true);
  assert.deepEqual(fromStringField.public_tables, []);

  const fromParsedEnvelope = inventoryFromQuery(capturedBody);
  assert.equal(fromParsedEnvelope.schema_migrations_rows, 0);

  const check = evaluatePreStubFloorCleanCheck({ inventory: capturedBody });
  assert.equal(check.clean_ok, true);
  assert.equal(check.classification_verdict, "CLEAN_BASELINE");
  assert.deepEqual(check.residuals, []);
  assert.equal(isCleanBaseline(classifyInventory(fromStringField)), true);
});

test("parseEvidenceOutArg accepts equals and space forms", () => {
  assert.equal(parseEvidenceOutArg(["--evidence-out=docs/out.json"]), "docs/out.json");
  assert.equal(parseEvidenceOutArg(["--evidence-out", "docs/out.json"]), "docs/out.json");
  assert.equal(parseEvidenceOutArg(["--no-wipe"]), null);
});

test("Chief 06 pre-stub-floor clean-check PASSes empty post-wipe inventory and HOLDs residuals without wipe", () => {
  const pass = evaluatePreStubFloorCleanCheck({
    inventory: passingPreStubFloorCleanInventory(),
    historyRows: [],
    listMigrations: [],
  });
  assert.equal(pass.clean_ok, true);
  assert.deepEqual(pass.residuals, []);
  assert.equal(pass.public_tables, 0);
  assert.deepEqual(pass.migrations, []);
  assert.equal(pass.schema_migrations_rows, 0);
  assert.equal(pass.f3_absent, true);
  assert.equal(pass.matches_post_wipe_baseline, true);
  assert.equal(pass.do_not_wipe, true);
  assert.equal(matchesChief06CleanCheck(pass), true);
  assert.equal(CHIEF_06_PRE_STUB_FLOOR_CLEAN_CHECK.clean_ok, true);
  assert.equal(assertPreStubFloorCleanCheck(pass), pass);
  assert.match(pass.label, /NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT/);

  const dirty = evaluatePreStubFloorCleanCheck({
    inventory: {
      ...passingPreStubFloorCleanInventory(),
      public_tables: ["profiles"],
      financial_core: true,
      schema_migrations_rows: 2,
    },
    historyRows: [{ version: "00117", name: "m2_notification_policy_foundation" }],
    listMigrations: [{ version: "20260912174049", name: "m2_notification_policy_foundation" }],
  });
  assert.equal(dirty.clean_ok, false);
  assert.equal(dirty.do_not_wipe, true);
  assert.ok(dirty.residuals.length > 0);
  assert.equal(dirty.hold, PRE_STUB_FLOOR_CLEAN_CHECK_HOLD);
  assert.throws(() => assertPreStubFloorCleanCheck(dirty), (err) => err.code === "F3_PRE_STUB_FLOOR_CLEAN_CHECK_HOLD");
});

test("pre-stub clean-check accepts leftover floor storage policies/buckets or zero of them", () => {
  const without = evaluatePreStubFloorCleanCheck({
    inventory: {
      ...passingPreStubFloorCleanInventory(),
      storage_policies: [],
      storage_buckets: [],
    },
  });
  assert.equal(without.clean_ok, true);
  assert.deepEqual(without.residuals, []);
  assert.deepEqual(without.residual_cleanup.storage_policies, []);
  assert.equal(without.residual_cleanup.blocking, false);
  assert.equal(
    isCleanBaseline(classifyInventory({
      ...passingPreStubFloorCleanInventory(),
      storage_policies: [],
      storage_buckets: [],
    })),
    true,
  );

  const withLeftovers = {
    ...passingPreStubFloorCleanInventory(),
    storage_policies: [...FAILED_FLOOR_STORAGE_POLICY_NAMES],
    storage_buckets: [...FAILED_FLOOR_STORAGE_BUCKETS],
  };
  const classification = classifyInventory(withLeftovers);
  assert.equal(classification.verdict, "CLEAN_BASELINE");
  assert.equal(isCleanBaseline(classification), true);
  assert.equal(classification.incompleteWipeStoragePolicies.length, 10);
  assert.deepEqual(classification.incompleteWipeBuckets, [...FAILED_FLOOR_STORAGE_BUCKETS]);

  const withPolicies = evaluatePreStubFloorCleanCheck({ inventory: withLeftovers });
  assert.equal(withPolicies.clean_ok, true);
  assert.deepEqual(withPolicies.residuals, []);
  assert.equal(withPolicies.residual_cleanup.storage_policies.length, 10);
  assert.deepEqual(withPolicies.residual_cleanup.storage_buckets, [...FAILED_FLOOR_STORAGE_BUCKETS]);
  assert.equal(withPolicies.residual_cleanup.blocking, false);
  assert.equal(withPolicies.residual_cleanup.wipe_to_baseline, false);
  assert.equal(matchesChief06CleanCheck(withPolicies), true);

  const fromTable = evaluatePreStubFloorCleanCheck({
    inventory: boxTableStdout(inventoryJson(withLeftovers)),
  });
  assert.equal(fromTable.clean_ok, true);
  assert.equal(typeof fromTable.residuals, "object");
  assert.equal(fromTable.public_tables, 0);

  const extraPolicy = evaluatePreStubFloorCleanCheck({
    inventory: {
      ...passingPreStubFloorCleanInventory(),
      storage_policies: ["mystery policy"],
    },
  });
  assert.equal(extraPolicy.clean_ok, false);
  assert.equal(extraPolicy.do_not_wipe, true);
});

test("public rowsFromQuery treats top-level JSON array rows like envelope.rows", () => {
  const presentRow = { p0: "financial_private", p1: "public.financial_ledger_epochs" };
  assert.deepEqual(rowsFromQuery({ stdout: JSON.stringify([presentRow]) }), [presentRow]);
  assert.deepEqual(rowsFromQuery({ stdout: JSON.stringify({ rows: [presentRow] }) }), [presentRow]);
  assert.deepEqual(rowsFromQuery({ stdout: JSON.stringify([{ p0: null, p1: null }]) }), [{ p0: null, p1: null }]);
  // Sealed qualify embeds objectsPresentFromProbe (not exported): array + rows envelopes.
  const qualify = fs.readFileSync(path.join(root, "scripts/qualify-f3-db-push-disposable.mjs"), "utf8");
  assert.match(qualify, /function objectsPresentFromProbe\(result\)/);
  assert.match(qualify, /Array\.isArray\(parsed\)/);
  assert.match(qualify, /Array\.isArray\(parsed\?\.rows\)/);
  assert.match(qualify, /vals\.every\(present\)/);
});

test("STUB_CORE_SQL creates auth.uid/auth.jwt only when missing and soft-fails auth GRANTs", () => {
  assert.doesNotMatch(STUB_CORE_SQL, /^\s*CREATE OR REPLACE FUNCTION auth\.uid\s*\(/m);
  assert.doesNotMatch(STUB_CORE_SQL, /^\s*CREATE OR REPLACE FUNCTION auth\.jwt\s*\(/m);
  assert.doesNotMatch(STUB_CORE_SQL, /CREATE OR REPLACE FUNCTION auth\.(uid|jwt)\s*\(/);
  assert.match(STUB_CORE_SQL, /DO \$auth_stub\$/);
  assert.match(STUB_CORE_SQL, /\$auth_stub\$;/);
  assert.match(STUB_CORE_SQL, /to_regprocedure\('auth\.uid\(\)'\) IS NULL/);
  assert.match(STUB_CORE_SQL, /to_regprocedure\('auth\.jwt\(\)'\) IS NULL/);
  assert.match(STUB_CORE_SQL, /WHEN insufficient_privilege THEN NULL/);
  assert.match(STUB_CORE_SQL, /SQLERRM ILIKE '%permission denied%'/);
  assert.match(STUB_CORE_SQL, /GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role/);
  assert.match(STUB_CORE_SQL, /CREATE TABLE public\.payments /);
  assert.match(STUB_CORE_SQL, /CREATE FUNCTION auth\.uid\(\)/);
  assert.match(STUB_CORE_SQL, /CREATE FUNCTION auth\.jwt\(\)/);
  assert.doesNotMatch(STUB_CORE_SQL, /CREATE OR REPLACE FUNCTION public\.uuid_generate_v5/);
  assert.match(PUBLIC_UUID_GENERATE_V5_WRAPPER_SQL, /CREATE OR REPLACE FUNCTION public\.uuid_generate_v5\(namespace uuid, name text\)/);
  assert.match(PUBLIC_UUID_GENERATE_V5_WRAPPER_SQL, /SELECT extensions\.uuid_generate_v5\(namespace, name\)/);
  assert.match(PUBLIC_UUID_GENERATE_V5_WRAPPER_SQL, /CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions/);
  assert.ok(DISCLOSED_STUB_LIVE_PIN_COMPONENTS.includes("public_uuid_generate_v5_wrapper"));
  assert.doesNotMatch(STUB_CORE_SQL, /CREATE ROLE ubuntu/i);
});

test("floorApplyOk uses ERROR lines only; NOTICE already-exists cannot mask a real ERROR", () => {
  assert.deepEqual(floorApplyOk({ status: 0, stdout: "NOTICE:  extension \"pgcrypto\" already exists, skipping\n", stderr: "" }), {
    ok: true,
    already: false,
    errors: [],
    errorLines: [],
  });

  const mixed = {
    status: 3,
    stdout: "NOTICE:  extension \"pgcrypto\" already exists, skipping\n",
    stderr: 'psql:floor-stub-core.sql:45: ERROR:  permission denied for schema auth\n',
  };
  const mixedOk = floorApplyOk(mixed);
  assert.equal(mixedOk.ok, false);
  assert.equal(mixedOk.already, false);
  assert.equal(mixedOk.errors.length, 1);
  assert.equal(mixedOk.errorLines.length, 1);
  assert.match(mixedOk.errors[0], /permission denied for schema auth/);
  assert.deepEqual(
    extractPsqlErrorLines(`${mixed.stdout}\n${mixed.stderr}`),
    mixedOk.errors,
  );

  const allDup = floorApplyOk({
    status: 3,
    stdout: "",
    stderr: 'ERROR:  relation "profiles" already exists\nERROR:  duplicate_function\n',
  });
  assert.equal(allDup.ok, true);
  assert.equal(allDup.already, true);
  assert.equal(allDup.errors.length, 2);

  const mixedDupAndReal = floorApplyOk({
    status: 3,
    stdout: 'ERROR:  relation "profiles" already exists\n',
    stderr: "ERROR:  permission denied for schema auth\n",
  });
  assert.equal(mixedDupAndReal.ok, false);
  assert.equal(mixedDupAndReal.already, false);

  const noticeOnlyNonzero = floorApplyOk({
    status: 3,
    stdout: 'NOTICE:  extension "pgcrypto" already exists, skipping\n',
    stderr: "",
  });
  assert.equal(noticeOnlyNonzero.ok, false);
  assert.equal(noticeOnlyNonzero.already, false);
  assert.deepEqual(noticeOnlyNonzero.errors, []);
  assert.deepEqual(noticeOnlyNonzero.errorLines, []);
});

test("NOTICE already-exists plus auth ERROR fails stub floor and records stderrTail", () => {
  setAuthorizedEnv();
  __installDbPushSpawnInterceptorForTests(({ cmd, args }) => {
    assert.equal(cmd, "psql");
    const file = path.basename(args[args.indexOf("-f") + 1]);
    if (file === "floor-stub-core.sql") {
      return {
        status: 3,
        stdout: 'NOTICE:  extension "pgcrypto" already exists, skipping\n',
        stderr: "ERROR:  permission denied for schema auth\n",
        signal: null,
      };
    }
    return { status: 0, stdout: "ok", stderr: "", signal: null };
  });
  const isolated = createIsolatedDbPushWorkdir();
  const result = installStubLivePinFloor({ workdir: isolated.workdir });
  assert.equal(result.installed, false);
  assert.equal(result.failedAt, "prerequisite_stub");
  assert.equal(result.steps.length, 1);
  assert.equal(result.steps[0].ok, false);
  assert.equal(result.steps[0].already, false);
  assert.equal(result.steps[0].status, 3);
  assert.match(result.steps[0].stderrTail, /permission denied for schema auth/);
  assert.equal(result.steps[0].errors.length, 1);
  assert.match(result.steps[0].errors[0], /permission denied for schema auth/);
  fs.rmSync(isolated.workdir, { recursive: true, force: true });
});

test("success verdict is qualification-pass with superseded mechanics-pass and frozen F3 digests stay pinned", () => {
  assert.equal(
    FILE_BASED_RUNNER_VERDICTS.QUALIFICATION_PASS,
    "FILE-BASED RUNNER QUALIFICATION PASS — STUB/LIVE-PIN FLOOR LIMITATION",
  );
  assert.equal(
    FILE_BASED_RUNNER_VERDICTS.MECHANICS_PASS,
    "FILE-BASED RUNNER MECHANICS PASS — STUB/LIVE-PIN QUALIFICATION FLOOR",
  );
  assert.equal(FILE_BASED_RUNNER_VERDICTS.MECHANICS_PASS_SUPERSEDED, true);
  assert.notEqual(FILE_BASED_RUNNER_VERDICTS.QUALIFICATION_PASS, FILE_BASED_RUNNER_VERDICTS.PASS);
  const precheck = stubLivePinFloorPrecheck();
  assert.deepEqual(precheck.frozenDigests, FROZEN_DIGESTS);
  assert.deepEqual(precheck.recognition, ["manual_income"]);
});
