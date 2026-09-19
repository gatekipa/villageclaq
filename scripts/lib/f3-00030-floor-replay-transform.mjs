/**
 * Ephemeral 00030 floor-replay transform.
 *
 * Historical disposable floor reconstruction ONLY.
 * NOT a production migration correction.
 * NOT the 00118–00123 candidate runner.
 * Do NOT claim byte-identical historical replay.
 *
 * Repo `supabase/migrations/00030_enterprise_branches_committees.sql`
 * is never modified or rewritten. A workdir copy is transformed,
 * applied, then deleted.
 *
 * Defect (documented in 00048): 00030 calls
 * `unnest(get_user_group_ids())` while 00014 returns SETOF uuid.
 * `unnest()` expects an array. The 14 occurrences are replaced with
 * `get_user_group_ids()` and nothing else.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));

export const FLOOR_00030_FILENAME = "00030_enterprise_branches_committees.sql";
export const UNNEST_CALL = "unnest(get_user_group_ids())";
export const REPLACEMENT_CALL = "get_user_group_ids()";
export const EXPECTED_UNNEST_COUNT = 14;

export const PINNED_ORIGINAL_SHA256 =
  "366ee277f8d659d4194340ebbcb93f4191e0ee64820d391999938596474f669f";
export const PINNED_TRANSFORMED_SHA256 =
  "f4223e8a33f6b9dc367057ca638ae52d795b01a6796325f760db6f63849854e5";

export const TRANSFORM_LABEL =
  "historical disposable floor reconstruction — NOT production migration correction, NOT candidate runner; do NOT claim byte-identical historical replay";

export const TRANSFORM_JUSTIFICATION =
  "00048 documents the historical defect: 00030 uses unnest(get_user_group_ids()) instead of IN (SELECT get_user_group_ids()). 00014 returns SETOF uuid, so unnest(setof) is invalid without a uuid-overload shim. Founder forbids any function shim. Exactly 14 textual replacements of unnest(get_user_group_ids()) → get_user_group_ids(); no other change.";

export const EPHEMERAL_TRANSFORMED_BASENAME = "floor-00030-transformed.sql";

export function sha256Utf8(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function repo00030AbsPath() {
  return path.join(root, "supabase/migrations", FLOOR_00030_FILENAME);
}

export function readOriginal00030() {
  const abs = repo00030AbsPath();
  const bytes = fs.readFileSync(abs);
  const text = bytes.toString("utf8");
  const digest = sha256Utf8(text);
  if (digest !== PINNED_ORIGINAL_SHA256) {
    const err = new Error(
      `HOLD: repo 00030 digest ${digest} !== pinned original ${PINNED_ORIGINAL_SHA256}`,
    );
    err.code = "F3_00030_DIGEST_HOLD";
    throw err;
  }
  return { abs, text, bytes, digest, byteLength: bytes.length };
}

export function countUnnestCalls(text) {
  if (text == null) return 0;
  let count = 0;
  let idx = 0;
  const src = String(text);
  while (true) {
    const found = src.indexOf(UNNEST_CALL, idx);
    if (found < 0) break;
    count += 1;
    idx = found + UNNEST_CALL.length;
  }
  return count;
}

export function stripSqlComments(text) {
  return String(text || "")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, "");
}

export function countExecutableUnnestCalls(text) {
  return countUnnestCalls(stripSqlComments(text));
}

export function transform00030Text(originalText) {
  const count = countUnnestCalls(originalText);
  if (count !== EXPECTED_UNNEST_COUNT) {
    const err = new Error(
      `HOLD: 00030 unnest(get_user_group_ids()) count is ${count}, expected exactly ${EXPECTED_UNNEST_COUNT}`,
    );
    err.code = "F3_00030_COUNT_HOLD";
    throw err;
  }
  const transformed = String(originalText).split(UNNEST_CALL).join(REPLACEMENT_CALL);
  if (countUnnestCalls(transformed) !== 0) {
    const err = new Error("HOLD: transformed 00030 still contains unnest(get_user_group_ids())");
    err.code = "F3_00030_TRANSFORM_HOLD";
    throw err;
  }
  const digest = sha256Utf8(transformed);
  if (digest !== PINNED_TRANSFORMED_SHA256) {
    const err = new Error(
      `HOLD: transformed 00030 digest ${digest} !== pinned ${PINNED_TRANSFORMED_SHA256}`,
    );
    err.code = "F3_00030_TRANSFORM_DIGEST_HOLD";
    throw err;
  }
  if (transformed.split(REPLACEMENT_CALL).length - 1 < EXPECTED_UNNEST_COUNT) {
    const err = new Error("HOLD: transformed 00030 lost get_user_group_ids() calls");
    err.code = "F3_00030_TRANSFORM_HOLD";
    throw err;
  }
  return { text: transformed, digest, count };
}

export function exactUnnestDiff(originalText, transformedText) {
  const origLines = String(originalText).split("\n");
  const nextLines = String(transformedText).split("\n");
  if (origLines.length !== nextLines.length) {
    const err = new Error("HOLD: 00030 transform changed line count; only in-line replacements are allowed");
    err.code = "F3_00030_TRANSFORM_HOLD";
    throw err;
  }
  const hunks = [];
  for (let i = 0; i < origLines.length; i += 1) {
    if (origLines[i] === nextLines[i]) continue;
    if (!origLines[i].includes(UNNEST_CALL) || !nextLines[i].includes(REPLACEMENT_CALL)) {
      const err = new Error(`HOLD: 00030 transform changed non-unnest line ${i + 1}`);
      err.code = "F3_00030_TRANSFORM_HOLD";
      throw err;
    }
    if (origLines[i].split(UNNEST_CALL).join(REPLACEMENT_CALL) !== nextLines[i]) {
      const err = new Error(`HOLD: 00030 line ${i + 1} has a change other than the 14 replacements`);
      err.code = "F3_00030_TRANSFORM_HOLD";
      throw err;
    }
    hunks.push({
      line: i + 1,
      before: origLines[i],
      after: nextLines[i],
    });
  }
  if (hunks.length !== EXPECTED_UNNEST_COUNT) {
    const err = new Error(
      `HOLD: 00030 transform hunk count is ${hunks.length}, expected ${EXPECTED_UNNEST_COUNT}`,
    );
    err.code = "F3_00030_TRANSFORM_HOLD";
    throw err;
  }
  return hunks;
}

export function assertRepo00030Unchanged(beforeDigest) {
  const after = readOriginal00030();
  if (after.digest !== beforeDigest || after.digest !== PINNED_ORIGINAL_SHA256) {
    const err = new Error("HOLD: repo 00030 bytes changed; historical file must stay untouched");
    err.code = "F3_00030_REPO_MUTATION_HOLD";
    throw err;
  }
  return after.digest;
}

/**
 * Write the transformed copy into an isolated workdir. Caller MUST delete
 * the file after apply via `deleteEphemeralTransformed00030`.
 */
export function writeEphemeralTransformed00030(workdir) {
  if (!workdir) throw new Error("HOLD: isolated workdir required for 00030 transform");
  const original = readOriginal00030();
  const transformed = transform00030Text(original.text);
  const hunks = exactUnnestDiff(original.text, transformed.text);
  const dest = path.resolve(workdir, EPHEMERAL_TRANSFORMED_BASENAME);
  if (!dest.startsWith(path.resolve(workdir))) {
    throw new Error("REFUSE: transformed 00030 escaped isolated workdir");
  }
  fs.writeFileSync(dest, transformed.text);
  const writtenDigest = sha256Utf8(fs.readFileSync(dest, "utf8"));
  if (writtenDigest !== PINNED_TRANSFORMED_SHA256) {
    fs.rmSync(dest, { force: true });
    throw new Error("HOLD: written transformed 00030 digest drifted");
  }
  assertRepo00030Unchanged(original.digest);
  return {
    label: TRANSFORM_LABEL,
    justification: TRANSFORM_JUSTIFICATION,
    sourceFile: FLOOR_00030_FILENAME,
    sourceAbs: original.abs,
    destAbs: dest,
    destName: EPHEMERAL_TRANSFORMED_BASENAME,
    originalDigest: original.digest,
    originalByteLength: original.byteLength,
    transformedDigest: transformed.digest,
    transformedByteLength: Buffer.byteLength(transformed.text, "utf8"),
    unnestCount: transformed.count,
    hunks,
    repoUnchanged: true,
    notProductionCorrection: true,
    notCandidateRunner: true,
    byteIdenticalHistoricalReplayClaimed: false,
  };
}

export function deleteEphemeralTransformed00030(destAbs) {
  if (!destAbs) return { deleted: false };
  const abs = path.resolve(destAbs);
  if (path.basename(abs) !== EPHEMERAL_TRANSFORMED_BASENAME) {
    throw new Error("REFUSE: refuse to delete a non-ephemeral 00030 path");
  }
  if (abs === repo00030AbsPath()) {
    throw new Error("REFUSE: refuse to delete repository 00030");
  }
  if (fs.existsSync(abs)) fs.rmSync(abs, { force: true });
  return { deleted: !fs.existsSync(abs), destAbs: abs };
}

export function scanFloorFilesForUnnest(files, { dir } = {}) {
  const migrationsDir = dir || path.join(root, "supabase/migrations");
  const hits = [];
  for (const file of files) {
    const text = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    const count = countExecutableUnnestCalls(text);
    if (count > 0) hits.push({ file, count });
  }
  return hits;
}
