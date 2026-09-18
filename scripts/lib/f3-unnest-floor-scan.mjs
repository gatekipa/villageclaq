/**
 * Deterministic executable-unnest inventory for the 00001–00117 floor.
 *
 * Authorized executable `unnest(get_user_group_ids())` sites:
 *   00030 — exactly 14
 *   00057 — exactly 1
 * 00048 comment-only is OK (zero executable).
 * Any additional executable site → HOLD.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listMainMigrationsThrough00117 } from "../_f3_apply_current_main_floor.mjs";
import {
  FLOOR_00030_FILENAME,
  UNNEST_CALL,
  countExecutableUnnestCalls,
  countUnnestCalls,
} from "./f3-00030-floor-replay-transform.mjs";
import { FLOOR_00057_FILENAME } from "./f3-00057-floor-replay-transform.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));

export const AUTHORIZED_EXECUTABLE_UNNEST = Object.freeze({
  [FLOOR_00030_FILENAME]: 14,
  [FLOOR_00057_FILENAME]: 1,
});

export const COMMENT_ONLY_UNNEST_OK = Object.freeze(["00048_rls_security_audit_fixes.sql"]);

export function scanFloorExecutableUnnest({ dir } = {}) {
  const migrationsDir = dir || path.join(root, "supabase/migrations");
  const files = listMainMigrationsThrough00117();
  const executable = [];
  const commentOnly = [];
  for (const file of files) {
    const text = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    const raw = countUnnestCalls(text);
    const exec = countExecutableUnnestCalls(text);
    if (exec > 0) executable.push({ file, count: exec, raw });
    else if (raw > 0) commentOnly.push({ file, raw, count: 0 });
  }
  return { files, executable, commentOnly, needle: UNNEST_CALL };
}

export function assertAuthorizedExecutableUnnestInventory({ dir } = {}) {
  const scanned = scanFloorExecutableUnnest({ dir });
  const extra = scanned.executable.filter((hit) => AUTHORIZED_EXECUTABLE_UNNEST[hit.file] == null);
  if (extra.length > 0) {
    const err = new Error(
      `HOLD: additional executable unnest(get_user_group_ids()) outside 00030+00057: ${extra
        .map((h) => `${h.file}:${h.count}`)
        .join(", ")}`,
    );
    err.code = "F3_UNNEST_INVENTORY_HOLD";
    err.extra = extra;
    throw err;
  }
  for (const [file, expected] of Object.entries(AUTHORIZED_EXECUTABLE_UNNEST)) {
    const hit = scanned.executable.find((row) => row.file === file);
    if (!hit || hit.count !== expected) {
      const err = new Error(
        `HOLD: ${file} executable unnest count is ${hit?.count ?? 0}, expected exactly ${expected}`,
      );
      err.code = "F3_UNNEST_INVENTORY_HOLD";
      throw err;
    }
  }
  const unexpectedComments = scanned.commentOnly.filter(
    (row) => !COMMENT_ONLY_UNNEST_OK.includes(row.file),
  );
  if (unexpectedComments.length > 0) {
    const err = new Error(
      `HOLD: unexpected comment-only unnest(get_user_group_ids()) in ${unexpectedComments
        .map((h) => h.file)
        .join(", ")}`,
    );
    err.code = "F3_UNNEST_INVENTORY_HOLD";
    throw err;
  }
  return {
    ok: true,
    executable: scanned.executable,
    commentOnly: scanned.commentOnly,
    authorized: { ...AUTHORIZED_EXECUTABLE_UNNEST },
  };
}

export function remainingUnnestAfterAuthorizedTransforms(files) {
  return (files || []).filter((file) => AUTHORIZED_EXECUTABLE_UNNEST[file] == null);
}
