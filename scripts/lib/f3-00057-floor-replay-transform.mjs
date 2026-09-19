/**
 * Ephemeral 00057 floor-replay transform.
 *
 * Historical disposable floor reconstruction ONLY.
 * NOT a production migration correction.
 * NOT the 00118–00123 candidate runner.
 * Do NOT claim byte-identical historical replay.
 *
 * Repo `supabase/migrations/00057_profiles_rls_allow_co_members.sql`
 * is never modified or rewritten. A workdir copy is transformed,
 * applied, then deleted.
 *
 * Same historical defect as 00030 (documented in 00048): 00057 calls
 * `unnest(get_user_group_ids())` while 00014 returns SETOF uuid.
 * Exactly one occurrence is replaced with `get_user_group_ids()`
 * and nothing else. No shim.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  REPLACEMENT_CALL,
  UNNEST_CALL,
  countUnnestCalls,
  sha256Utf8,
} from "./f3-00030-floor-replay-transform.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));

export const FLOOR_00057_FILENAME = "00057_profiles_rls_allow_co_members.sql";
export const EXPECTED_00057_UNNEST_COUNT = 1;

export const PINNED_00057_ORIGINAL_SHA256 =
  "85355a3808b6aa14362d0017272d5e1f3a82ed2e0179e717248a2d6b0d721cdc";
export const PINNED_00057_TRANSFORMED_SHA256 =
  "2a3c468537539bd45b0b285ece4e7bfe5204b898c9148345e1b88a43554dcf4d";

export const TRANSFORM_00057_LABEL =
  "historical disposable floor reconstruction — NOT production migration correction, NOT candidate runner; do NOT claim byte-identical historical replay";

export const TRANSFORM_00057_JUSTIFICATION =
  "00048 documents the historical defect: unnest(get_user_group_ids()) instead of IN (SELECT get_user_group_ids()). 00014 returns SETOF uuid, so unnest(setof) is invalid without a uuid-overload shim. Founder forbids any function shim. Exactly 1 textual replacement of unnest(get_user_group_ids()) → get_user_group_ids() in 00057; no other change.";

export const EPHEMERAL_TRANSFORMED_00057_BASENAME = "floor-00057-transformed.sql";

export function repo00057AbsPath() {
  return path.join(root, "supabase/migrations", FLOOR_00057_FILENAME);
}

export function readOriginal00057() {
  const abs = repo00057AbsPath();
  const bytes = fs.readFileSync(abs);
  const text = bytes.toString("utf8");
  const digest = sha256Utf8(text);
  if (digest !== PINNED_00057_ORIGINAL_SHA256) {
    const err = new Error(
      `HOLD: repo 00057 digest ${digest} !== pinned original ${PINNED_00057_ORIGINAL_SHA256}`,
    );
    err.code = "F3_00057_DIGEST_HOLD";
    throw err;
  }
  return { abs, text, bytes, digest, byteLength: bytes.length };
}

export function transform00057Text(originalText) {
  const count = countUnnestCalls(originalText);
  if (count !== EXPECTED_00057_UNNEST_COUNT) {
    const err = new Error(
      `HOLD: 00057 unnest(get_user_group_ids()) count is ${count}, expected exactly ${EXPECTED_00057_UNNEST_COUNT}`,
    );
    err.code = "F3_00057_COUNT_HOLD";
    throw err;
  }
  const transformed = String(originalText).split(UNNEST_CALL).join(REPLACEMENT_CALL);
  if (countUnnestCalls(transformed) !== 0) {
    const err = new Error("HOLD: transformed 00057 still contains unnest(get_user_group_ids())");
    err.code = "F3_00057_TRANSFORM_HOLD";
    throw err;
  }
  const digest = sha256Utf8(transformed);
  if (digest !== PINNED_00057_TRANSFORMED_SHA256) {
    const err = new Error(
      `HOLD: transformed 00057 digest ${digest} !== pinned ${PINNED_00057_TRANSFORMED_SHA256}`,
    );
    err.code = "F3_00057_TRANSFORM_DIGEST_HOLD";
    throw err;
  }
  if (transformed.split(REPLACEMENT_CALL).length - 1 < EXPECTED_00057_UNNEST_COUNT) {
    const err = new Error("HOLD: transformed 00057 lost get_user_group_ids() calls");
    err.code = "F3_00057_TRANSFORM_HOLD";
    throw err;
  }
  return { text: transformed, digest, count };
}

export function exact00057UnnestDiff(originalText, transformedText) {
  const origLines = String(originalText).split("\n");
  const nextLines = String(transformedText).split("\n");
  if (origLines.length !== nextLines.length) {
    const err = new Error("HOLD: 00057 transform changed line count; only in-line replacements are allowed");
    err.code = "F3_00057_TRANSFORM_HOLD";
    throw err;
  }
  const hunks = [];
  for (let i = 0; i < origLines.length; i += 1) {
    if (origLines[i] === nextLines[i]) continue;
    if (!origLines[i].includes(UNNEST_CALL) || !nextLines[i].includes(REPLACEMENT_CALL)) {
      const err = new Error(`HOLD: 00057 transform changed non-unnest line ${i + 1}`);
      err.code = "F3_00057_TRANSFORM_HOLD";
      throw err;
    }
    if (origLines[i].split(UNNEST_CALL).join(REPLACEMENT_CALL) !== nextLines[i]) {
      const err = new Error(`HOLD: 00057 line ${i + 1} has a change other than the single replacement`);
      err.code = "F3_00057_TRANSFORM_HOLD";
      throw err;
    }
    hunks.push({
      line: i + 1,
      before: origLines[i],
      after: nextLines[i],
    });
  }
  if (hunks.length !== EXPECTED_00057_UNNEST_COUNT) {
    const err = new Error(
      `HOLD: 00057 transform hunk count is ${hunks.length}, expected ${EXPECTED_00057_UNNEST_COUNT}`,
    );
    err.code = "F3_00057_TRANSFORM_HOLD";
    throw err;
  }
  return hunks;
}

export function assertRepo00057Unchanged(beforeDigest) {
  const after = readOriginal00057();
  if (after.digest !== beforeDigest || after.digest !== PINNED_00057_ORIGINAL_SHA256) {
    const err = new Error("HOLD: repo 00057 bytes changed; historical file must stay untouched");
    err.code = "F3_00057_REPO_MUTATION_HOLD";
    throw err;
  }
  return after.digest;
}

/**
 * Write the transformed copy into an isolated workdir. Caller MUST delete
 * the file after apply via `deleteEphemeralTransformed00057`.
 */
export function writeEphemeralTransformed00057(workdir) {
  if (!workdir) throw new Error("HOLD: isolated workdir required for 00057 transform");
  const original = readOriginal00057();
  const transformed = transform00057Text(original.text);
  const hunks = exact00057UnnestDiff(original.text, transformed.text);
  const dest = path.resolve(workdir, EPHEMERAL_TRANSFORMED_00057_BASENAME);
  if (!dest.startsWith(path.resolve(workdir))) {
    throw new Error("REFUSE: transformed 00057 escaped isolated workdir");
  }
  fs.writeFileSync(dest, transformed.text);
  const writtenDigest = sha256Utf8(fs.readFileSync(dest, "utf8"));
  if (writtenDigest !== PINNED_00057_TRANSFORMED_SHA256) {
    fs.rmSync(dest, { force: true });
    throw new Error("HOLD: written transformed 00057 digest drifted");
  }
  assertRepo00057Unchanged(original.digest);
  return {
    label: TRANSFORM_00057_LABEL,
    justification: TRANSFORM_00057_JUSTIFICATION,
    sourceFile: FLOOR_00057_FILENAME,
    sourceAbs: original.abs,
    destAbs: dest,
    destName: EPHEMERAL_TRANSFORMED_00057_BASENAME,
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

export function deleteEphemeralTransformed00057(destAbs) {
  if (!destAbs) return { deleted: false };
  const abs = path.resolve(destAbs);
  if (path.basename(abs) !== EPHEMERAL_TRANSFORMED_00057_BASENAME) {
    throw new Error("REFUSE: refuse to delete a non-ephemeral 00057 path");
  }
  if (abs === repo00057AbsPath()) {
    throw new Error("REFUSE: refuse to delete repository 00057");
  }
  if (fs.existsSync(abs)) fs.rmSync(abs, { force: true });
  return { deleted: !fs.existsSync(abs), destAbs: abs };
}
