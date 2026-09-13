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
  installStubLivePinFloor,
  passingPreDbPushFixture,
  readUnmodified00117Bytes,
  resolveHostedFloorMode,
  stubLivePinFloorPrecheck,
  stubLivePinFloorSqlSteps,
} from "./lib/f3-db-push-stub-live-pin-floor.mjs";
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

test("floor SQL steps are the seven disclosed components and reuse repo fixtures", () => {
  const steps = stubLivePinFloorSqlSteps();
  assert.deepEqual(
    steps.map((s) => s.id),
    [
      "prerequisite_stub",
      "regression_slice",
      "cut2_queue_slice",
      "live_has_group_permission_cut3",
      "enqueue_outbound_notification_00115_extract",
      "remote_floor_ownership_and_acl",
    ],
  );
  assert.equal(steps[0].sql, STUB_CORE_SQL);
  assert.equal(steps[1].sql, REGRESSION_SLICE_SQL);
  assert.equal(steps[2].sql, CUT2_QUEUE_SLICE_SQL);
  assert.equal(steps[3].sql, extractHasGroupPermissionCreateSql());
  assert.equal(steps[4].sql, extractEnqueueCreateSql());
  assert.equal(steps[5].sql, remoteFloorOwnershipAndAclSql());
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
      "regression_slice",
      "cut2_queue_slice",
      "live_has_group_permission_cut3",
      "enqueue_outbound_notification_00115_extract",
      "remote_floor_ownership_and_acl",
      "unmodified_00117_gated_psql",
    ],
  );
  assert.ok(result.steps.every((s) => s.runner === "gated_psql_file"));
  assert.ok(applied.includes(FILE_00117));
  assert.equal(applied.some((n) => /00030|00057|00001/.test(n)), false);
  const mig = fs.readdirSync(path.join(isolated.workdir, "supabase", "migrations"));
  assert.equal(mig.includes(FILE_00117), false);
  assert.ok(fs.existsSync(path.join(isolated.workdir, "floor-sql", FILE_00117)));
  fs.rmSync(isolated.workdir, { recursive: true, force: true });
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

test("success verdict is mechanics-pass only and frozen F3 digests stay pinned", () => {
  assert.equal(
    FILE_BASED_RUNNER_VERDICTS.MECHANICS_PASS,
    "FILE-BASED RUNNER MECHANICS PASS — STUB/LIVE-PIN QUALIFICATION FLOOR",
  );
  assert.notEqual(FILE_BASED_RUNNER_VERDICTS.MECHANICS_PASS, FILE_BASED_RUNNER_VERDICTS.PASS);
  const precheck = stubLivePinFloorPrecheck();
  assert.deepEqual(precheck.frozenDigests, FROZEN_DIGESTS);
  assert.deepEqual(precheck.recognition, ["manual_income"]);
});
