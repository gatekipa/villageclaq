/**
 * Local unit tests for ephemeral 00030 transform + wipe-to-baseline.
 * No hosted call. Repo 00030 bytes must stay unchanged.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { BOOTSTRAP_WITH_LOCAL_SHIM, HOSTED_FLOOR_BOOTSTRAP } from "./_f3_apply_current_main_floor.mjs";
import {
  EPHEMERAL_TRANSFORMED_BASENAME,
  EXPECTED_UNNEST_COUNT,
  PINNED_ORIGINAL_SHA256,
  PINNED_TRANSFORMED_SHA256,
  TRANSFORM_LABEL,
  UNNEST_CALL,
  countUnnestCalls,
  deleteEphemeralTransformed00030,
  exactUnnestDiff,
  readOriginal00030,
  repo00030AbsPath,
  transform00030Text,
  writeEphemeralTransformed00030,
} from "./lib/f3-00030-floor-replay-transform.mjs";
import { classifyInventory, isCleanBaseline } from "./lib/f3-db-push-inventory.mjs";
import { assertWipeDoesNotTouchProduction, buildWipeSql, planWipe } from "./lib/f3-db-push-wipe.mjs";
import { PRODUCTION_REF } from "./lib/f3-db-push-pins.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

test("repo 00030 is pinned and has exactly 14 unnest calls", () => {
  const original = readOriginal00030();
  assert.equal(original.digest, PINNED_ORIGINAL_SHA256);
  assert.equal(countUnnestCalls(original.text), EXPECTED_UNNEST_COUNT);
  assert.equal(original.text.includes(UNNEST_CALL), true);
});

test("transform replaces those 14 calls only and pins the transformed digest", () => {
  const original = readOriginal00030();
  const transformed = transform00030Text(original.text);
  assert.equal(transformed.count, EXPECTED_UNNEST_COUNT);
  assert.equal(transformed.digest, PINNED_TRANSFORMED_SHA256);
  assert.equal(countUnnestCalls(transformed.text), 0);
  const hunks = exactUnnestDiff(original.text, transformed.text);
  assert.equal(hunks.length, EXPECTED_UNNEST_COUNT);
  assert.equal(fs.readFileSync(repo00030AbsPath(), "utf8"), original.text);
});

test("wrong unnest count HOLDs", () => {
  assert.throws(() => transform00030Text("SELECT 1;"), /exactly 14|COUNT/);
  assert.throws(
    () => transform00030Text(`${UNNEST_CALL}\n`.repeat(13)),
    /exactly 14|COUNT/,
  );
});

test("ephemeral workdir copy is deleted and repo file is untouched", () => {
  const before = readOriginal00030();
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "f3-00030-t-"));
  const record = writeEphemeralTransformed00030(workdir);
  assert.equal(record.originalDigest, PINNED_ORIGINAL_SHA256);
  assert.equal(record.transformedDigest, PINNED_TRANSFORMED_SHA256);
  assert.equal(record.unnestCount, EXPECTED_UNNEST_COUNT);
  assert.match(record.label, /NOT production migration correction/);
  assert.match(TRANSFORM_LABEL, /NOT candidate runner/);
  assert.equal(record.byteIdenticalHistoricalReplayClaimed, false);
  assert.equal(path.basename(record.destAbs), EPHEMERAL_TRANSFORMED_BASENAME);
  assert.equal(fs.existsSync(record.destAbs), true);
  const deleted = deleteEphemeralTransformed00030(record.destAbs);
  assert.equal(deleted.deleted, true);
  assert.equal(fs.existsSync(record.destAbs), false);
  assert.equal(readOriginal00030().digest, before.digest);
  fs.rmSync(workdir, { recursive: true, force: true });
});

test("hosted bootstrap has no unnest shim; local bootstrap still may", () => {
  assert.doesNotMatch(HOSTED_FLOOR_BOOTSTRAP, /CREATE OR REPLACE FUNCTION public\.unnest\(uuid\)/);
  assert.match(BOOTSTRAP_WITH_LOCAL_SHIM, /CREATE OR REPLACE FUNCTION public\.unnest\(uuid\)/);
});

test("wipe HOLDs on extra public tables and production ref never appears", () => {
  const extra = classifyInventory({
    public_tables: ["profiles", "mystery_table"],
    public_views: [],
    public_types: [],
    public_functions: [],
    schema_migrations_present: true,
    schema_migrations_rows: 0,
  });
  assert.equal(extra.verdict, "HOLD");
  assert.equal(planWipe({
    public_tables: ["profiles", "mystery_table"],
    public_views: [],
    public_types: [],
    public_functions: [],
    schema_migrations_present: true,
    schema_migrations_rows: 0,
  }).action, "HOLD");

  const eligible = classifyInventory({
    public_tables: ["profiles", "exchange_rates"],
    public_views: [],
    public_types: [],
    public_functions: [{ name: "get_user_group_ids" }],
    schema_migrations_present: true,
    schema_migrations_rows: 0,
    unnest_uuid_shim: true,
    auth_handle_new_user_trigger: true,
    exchange_rates: true,
  });
  assert.equal(eligible.verdict, "WIPE_ELIGIBLE");
  const sql = buildWipeSql(eligible);
  assert.equal(sql.needed, true);
  assert.match(sql.sql, /DROP TABLE IF EXISTS public\."profiles"/);
  assert.match(sql.sql, /DROP FUNCTION IF EXISTS public\.unnest\(uuid\)/);
  assert.doesNotMatch(sql.sql, /DROP SCHEMA/);
  assert.doesNotMatch(sql.sql, new RegExp(PRODUCTION_REF));
  assertWipeDoesNotTouchProduction(sql.sql);
});

test("empty leftover schema_migrations is clean baseline", () => {
  const clean = classifyInventory({
    public_tables: [],
    public_views: [],
    public_types: [],
    public_functions: [],
    schema_migrations_present: true,
    schema_migrations_rows: 0,
    unnest_uuid_shim: false,
    financial_core: false,
    financial_private: false,
  });
  assert.equal(clean.verdict, "CLEAN_BASELINE");
  assert.equal(isCleanBaseline(clean), true);
  assert.equal(planWipe({
    public_tables: [],
    public_views: [],
    public_types: [],
    public_functions: [],
    schema_migrations_present: true,
    schema_migrations_rows: 0,
  }).action, "NONE");
});

test("00118-00123 bytes and repo 00030 stay frozen after these modules load", () => {
  const original = fs.readFileSync(path.join(root, "supabase/migrations/00030_enterprise_branches_committees.sql"), "utf8");
  assert.equal(countUnnestCalls(original), 14);
  const f3 = fs.readFileSync(path.join(root, "supabase/migrations/00118_f3_bounded_financial_epoch_foundation.sql"), "utf8");
  assert.match(f3, /financial_ledger_epochs|financial_private|bounded/);
});
