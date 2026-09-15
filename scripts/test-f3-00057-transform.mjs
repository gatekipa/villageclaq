/**
 * Local unit tests for ephemeral 00057 transform + authorized unnest inventory.
 * No hosted call. Repo 00057 / 00030 bytes must stay unchanged.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_UNNEST_COUNT,
  PINNED_ORIGINAL_SHA256,
  PINNED_TRANSFORMED_SHA256,
  UNNEST_CALL,
  countUnnestCalls,
  readOriginal00030,
  transform00030Text,
} from "./lib/f3-00030-floor-replay-transform.mjs";
import {
  EPHEMERAL_TRANSFORMED_00057_BASENAME,
  EXPECTED_00057_UNNEST_COUNT,
  PINNED_00057_ORIGINAL_SHA256,
  PINNED_00057_TRANSFORMED_SHA256,
  TRANSFORM_00057_LABEL,
  deleteEphemeralTransformed00057,
  exact00057UnnestDiff,
  readOriginal00057,
  repo00057AbsPath,
  transform00057Text,
  writeEphemeralTransformed00057,
} from "./lib/f3-00057-floor-replay-transform.mjs";
import {
  AUTHORIZED_EXECUTABLE_UNNEST,
  assertAuthorizedExecutableUnnestInventory,
  scanFloorExecutableUnnest,
} from "./lib/f3-unnest-floor-scan.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

test("deterministic scan: executable unnest is only 00030=14 and 00057=1", () => {
  const scanned = scanFloorExecutableUnnest();
  assert.deepEqual(
    scanned.executable.map((h) => ({ file: h.file, count: h.count })),
    [
      { file: "00030_enterprise_branches_committees.sql", count: 14 },
      { file: "00057_profiles_rls_allow_co_members.sql", count: 1 },
    ],
  );
  assert.deepEqual(
    scanned.commentOnly.map((h) => h.file),
    ["00048_rls_security_audit_fixes.sql"],
  );
  const inventory = assertAuthorizedExecutableUnnestInventory();
  assert.equal(inventory.ok, true);
  assert.equal(AUTHORIZED_EXECUTABLE_UNNEST["00030_enterprise_branches_committees.sql"], 14);
  assert.equal(AUTHORIZED_EXECUTABLE_UNNEST["00057_profiles_rls_allow_co_members.sql"], 1);
});

test("repo 00057 is pinned and has exactly 1 unnest call", () => {
  const original = readOriginal00057();
  assert.equal(original.digest, PINNED_00057_ORIGINAL_SHA256);
  assert.equal(countUnnestCalls(original.text), EXPECTED_00057_UNNEST_COUNT);
  assert.equal(original.text.includes(UNNEST_CALL), true);
});

test("00057 transform is exactly one replacement and pins the digest", () => {
  const original = readOriginal00057();
  const transformed = transform00057Text(original.text);
  assert.equal(transformed.count, 1);
  assert.equal(transformed.digest, PINNED_00057_TRANSFORMED_SHA256);
  assert.equal(countUnnestCalls(transformed.text), 0);
  const hunks = exact00057UnnestDiff(original.text, transformed.text);
  assert.equal(hunks.length, 1);
  assert.equal(hunks[0].line, 45);
  assert.equal(hunks[0].before.includes(UNNEST_CALL), true);
  assert.equal(hunks[0].after.includes("SELECT get_user_group_ids()"), true);
  assert.equal(hunks[0].after.includes(UNNEST_CALL), false);
  assert.equal(fs.readFileSync(repo00057AbsPath(), "utf8"), original.text);
});

test("wrong 00057 unnest count HOLDs", () => {
  assert.throws(() => transform00057Text("SELECT 1;"), /exactly 1|COUNT/);
  assert.throws(
    () => transform00057Text(`${UNNEST_CALL}\n${UNNEST_CALL}\n`),
    /exactly 1|COUNT/,
  );
});

test("ephemeral 00057 workdir copy is deleted and repo file is untouched", () => {
  const before = readOriginal00057();
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "f3-00057-t-"));
  const record = writeEphemeralTransformed00057(workdir);
  assert.equal(record.originalDigest, PINNED_00057_ORIGINAL_SHA256);
  assert.equal(record.transformedDigest, PINNED_00057_TRANSFORMED_SHA256);
  assert.equal(record.unnestCount, 1);
  assert.match(record.label, /NOT production migration correction/);
  assert.match(TRANSFORM_00057_LABEL, /NOT candidate runner/);
  assert.equal(record.byteIdenticalHistoricalReplayClaimed, false);
  assert.equal(path.basename(record.destAbs), EPHEMERAL_TRANSFORMED_00057_BASENAME);
  assert.equal(fs.existsSync(record.destAbs), true);
  const deleted = deleteEphemeralTransformed00057(record.destAbs);
  assert.equal(deleted.deleted, true);
  assert.equal(fs.existsSync(record.destAbs), false);
  assert.equal(readOriginal00057().digest, before.digest);
  fs.rmSync(workdir, { recursive: true, force: true });
});

test("00030 exact-14 transform remains pinned alongside 00057", () => {
  const original = readOriginal00030();
  assert.equal(original.digest, PINNED_ORIGINAL_SHA256);
  assert.equal(countUnnestCalls(original.text), EXPECTED_UNNEST_COUNT);
  assert.equal(transform00030Text(original.text).digest, PINNED_TRANSFORMED_SHA256);
});

test("00118-00123 and repo 00057 stay frozen after these modules load", () => {
  const original = fs.readFileSync(
    path.join(root, "supabase/migrations/00057_profiles_rls_allow_co_members.sql"),
    "utf8",
  );
  assert.equal(countUnnestCalls(original), 1);
  const f3 = fs.readFileSync(
    path.join(root, "supabase/migrations/00118_f3_bounded_financial_epoch_foundation.sql"),
    "utf8",
  );
  assert.match(f3, /financial_ledger_epochs|financial_private|bounded/);
});
