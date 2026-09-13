/**
 * Local proof of wipe-to-baseline + no-shim hosted floor path +
 * ephemeral 00030 + ephemeral 00057 transforms. Not hosted evidence.
 * Not candidate runner.
 *
 * Reports PASS/HOLD. Does not modify repo 00030 / 00057.
 * Does not apply 00118–00123.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HOSTED_FLOOR_BOOTSTRAP, listMainMigrationsThrough00117 } from "./_f3_apply_current_main_floor.mjs";
import { installLiveHasGroupPermission } from "./fixtures/f3-forward-prerequisites.mjs";
import { createDisposableDatabase, psql, psqlFile } from "./fixtures/disposable-postgres.mjs";
import {
  FLOOR_00030_FILENAME,
  PINNED_ORIGINAL_SHA256,
  PINNED_TRANSFORMED_SHA256,
  deleteEphemeralTransformed00030,
  writeEphemeralTransformed00030,
} from "./lib/f3-00030-floor-replay-transform.mjs";
import {
  FLOOR_00057_FILENAME,
  PINNED_00057_ORIGINAL_SHA256,
  PINNED_00057_TRANSFORMED_SHA256,
  deleteEphemeralTransformed00057,
  writeEphemeralTransformed00057,
} from "./lib/f3-00057-floor-replay-transform.mjs";
import { remainingUnnestAfter00030, remainingUnnestAfterAuthorizedTransforms } from "./lib/f3-db-push-floor.mjs";
import { assertAuthorizedExecutableUnnestInventory } from "./lib/f3-unnest-floor-scan.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

const TRANSFORM_WRITERS = {
  [FLOOR_00030_FILENAME]: writeEphemeralTransformed00030,
  [FLOOR_00057_FILENAME]: writeEphemeralTransformed00057,
};
const TRANSFORM_DELETERS = {
  [FLOOR_00030_FILENAME]: deleteEphemeralTransformed00030,
  [FLOOR_00057_FILENAME]: deleteEphemeralTransformed00057,
};

function applyLocalFile(url, absPath, name) {
  try {
    psqlFile(url, absPath);
    return { ok: true, name };
  } catch (err) {
    const msg = String(err.message || err);
    if (/already exists|duplicate_object|duplicate_function/i.test(msg)) {
      return { ok: true, name, already: true };
    }
    return { ok: false, name, error: msg };
  }
}

function applyThrough(url, files, { workdir, transformFiles = [], stopBefore }) {
  const steps = [];
  const transforms = {};
  for (const file of files) {
    if (stopBefore && file >= stopBefore) break;
    if (/^0011[6-7]_/.test(file)) {
      try {
        installLiveHasGroupPermission(url);
        steps.push({ id: `hgp-before-${file}`, ok: true });
      } catch (err) {
        steps.push({ id: `hgp-before-${file}`, ok: false, error: String(err.message || err) });
        return { ok: false, failedAt: `hgp-before-${file}`, steps, transforms };
      }
    }
    let abs = path.join(root, "supabase/migrations", file);
    if (transformFiles.includes(file)) {
      const writer = TRANSFORM_WRITERS[file];
      transforms[file] = writer(workdir);
      abs = transforms[file].destAbs;
    }
    const applied = applyLocalFile(url, abs, file);
    steps.push({
      id: file,
      ...applied,
      transformed: transformFiles.includes(file),
    });
    if (transformFiles.includes(file) && transforms[file]) {
      TRANSFORM_DELETERS[file](transforms[file].destAbs);
    }
    if (!applied.ok) return { ok: false, failedAt: file, steps, transforms };
  }
  return { ok: true, failedAt: null, steps, transforms };
}

function summarizeTransform(record) {
  if (!record) return null;
  return {
    originalDigest: record.originalDigest,
    transformedDigest: record.transformedDigest,
    unnestCount: record.unnestCount,
    hunks: record.hunks,
    repoUnchanged: record.repoUnchanged,
  };
}

function main() {
  const remainingUnnest = remainingUnnestAfter00030();
  const unauthorizedUnnest = remainingUnnestAfterAuthorizedTransforms();
  const inventory = assertAuthorizedExecutableUnnestInventory();
  const evidence = {
    artifact: "M3_F3_LOCAL_TRANSFORMED_FLOOR_PROOF_00057_20260913",
    hosted: "NOT_RUN",
    productionContacted: false,
    repo00030Modified: false,
    repo00057Modified: false,
    shimOnHostedPath: false,
    recognition: ["manual_income"],
    original00030Sha256: PINNED_ORIGINAL_SHA256,
    transformed00030Sha256: PINNED_TRANSFORMED_SHA256,
    original00057Sha256: PINNED_00057_ORIGINAL_SHA256,
    transformed00057Sha256: PINNED_00057_TRANSFORMED_SHA256,
    remainingUnnestAfter00030: remainingUnnest,
    remainingUnnestAfterAuthorizedTransforms: unauthorizedUnnest,
    authorizedUnnestInventory: inventory,
    phases: {},
  };

  let db = createDisposableDatabase("wipe_floor");
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "f3-00057-local-"));
  try {
    if (unauthorizedUnnest.length > 0) {
      evidence.verdict = "HOLD";
      evidence.reason = `HOLD: unauthorized executable unnest after 00030+00057: ${unauthorizedUnnest
        .map((r) => `${r.file}:${r.count}`)
        .join(", ")}`;
      throw new Error(evidence.reason);
    }

    psql(db.url, HOSTED_FLOOR_BOOTSTRAP);
    const files = listMainMigrationsThrough00117();
    const through00029 = files.filter((f) => f < FLOOR_00030_FILENAME);
    const through00056 = files.filter((f) => f < FLOOR_00057_FILENAME);
    const from00057 = files.filter((f) => f >= FLOOR_00057_FILENAME);

    const pre = applyThrough(db.url, through00029, { workdir, transformFiles: [] });
    evidence.phases.apply00001_00029 = { ok: pre.ok, failedAt: pre.failedAt, stepCount: pre.steps.length };
    if (!pre.ok) {
      evidence.verdict = "HOLD";
      evidence.reason = `00001–00029 failed at ${pre.failedAt}`;
      throw new Error(evidence.reason);
    }

    const original00030 = applyLocalFile(
      db.url,
      path.join(root, "supabase/migrations", FLOOR_00030_FILENAME),
      FLOOR_00030_FILENAME,
    );
    evidence.phases.original00030WithoutShim = {
      ok: original00030.ok,
      expectedFail: true,
      errorSample: original00030.ok ? null : String(original00030.error).slice(0, 400),
    };
    if (original00030.ok) {
      evidence.verdict = "HOLD";
      evidence.reason = "HOLD: original 00030 applied without shim; historical defect not reproduced";
      throw new Error(evidence.reason);
    }

    // Hosted wipe already SUCCESS. Local wipe catalog extras are not a 00057
    // defect — recreate a clean work DB instead of --wipe-to-baseline.
    db.close();
    db = createDisposableDatabase("replay_floor");
    psql(db.url, HOSTED_FLOOR_BOOTSTRAP);
    const shimAfterHostedBootstrap = psql(
      db.url,
      "SELECT to_regprocedure('public.unnest(uuid)') IS NOT NULL;",
      { tuplesOnly: true },
    );
    evidence.phases.hostedBootstrap = {
      ok: true,
      unnestUuidShim: shimAfterHostedBootstrap === "t",
      localWipeSkipped: true,
      note: "recreated clean local f3_* work DB; hosted disposable remains CLEAN and is not wiped",
    };
    if (shimAfterHostedBootstrap === "t") {
      evidence.verdict = "HOLD";
      evidence.reason = "HOLD: hosted bootstrap installed public.unnest(uuid)";
      throw new Error(evidence.reason);
    }

    const replayTo56 = applyThrough(db.url, through00056, {
      workdir,
      transformFiles: [FLOOR_00030_FILENAME],
    });
    evidence.phases.transformedReplayThrough00056 = {
      ok: replayTo56.ok,
      failedAt: replayTo56.failedAt,
      transform00030: summarizeTransform(replayTo56.transforms[FLOOR_00030_FILENAME]),
      appliedThrough: replayTo56.steps.filter((s) => s.ok && /\.sql$/.test(s.id)).map((s) => s.id).slice(-3),
      stepCount: replayTo56.steps.length,
    };
    if (!replayTo56.ok) {
      evidence.verdict = "HOLD";
      evidence.reason = `transformed 00030 replay failed at ${replayTo56.failedAt}`;
      throw new Error(evidence.reason);
    }

    const probe00057 = applyLocalFile(
      db.url,
      path.join(root, "supabase/migrations", FLOOR_00057_FILENAME),
      FLOOR_00057_FILENAME,
    );
    evidence.phases.original00057WithoutShim = {
      file: FLOOR_00057_FILENAME,
      count: 1,
      ok: probe00057.ok,
      expectedFail: true,
      errorSample: probe00057.ok ? null : String(probe00057.error || "").slice(0, 800),
    };
    if (probe00057.ok) {
      evidence.verdict = "HOLD";
      evidence.reason = "HOLD: original 00057 applied without shim; historical defect not reproduced";
      throw new Error(evidence.reason);
    }

    const replayRest = applyThrough(db.url, from00057, {
      workdir,
      transformFiles: [FLOOR_00057_FILENAME],
    });
    const failedRest = replayRest.steps.find((s) => s.id === replayRest.failedAt) || {};
    evidence.phases.transformedReplay00057Through00117 = {
      ok: replayRest.ok,
      failedAt: replayRest.failedAt,
      errorSample: replayRest.ok ? null : String(failedRest.error || "").slice(0, 800),
      transform00057: summarizeTransform(replayRest.transforms[FLOOR_00057_FILENAME]),
      appliedThrough: replayRest.steps.filter((s) => s.ok && /\.sql$/.test(s.id)).map((s) => s.id).slice(-3),
      stepCount: replayRest.steps.length,
    };
    if (!replayRest.ok) {
      evidence.verdict = "HOLD";
      evidence.reason = `HOLD: transformed 00057 applied; later floor file failed at ${replayRest.failedAt}`;
      throw new Error(evidence.reason);
    }

    try {
      installLiveHasGroupPermission(db.url);
      evidence.phases.hgpAfter00117 = { ok: true };
    } catch (err) {
      evidence.verdict = "HOLD";
      evidence.reason = `hgp-after-00117 failed: ${String(err.message || err)}`;
      throw new Error(evidence.reason);
    }

    const reached00117 = replayRest.ok && unauthorizedUnnest.length === 0;
    evidence.through00117 = reached00117;
    evidence.verdict = reached00117 ? "PASS" : "HOLD";
    evidence.reason = reached00117
      ? "local no-shim transformed 00030+00057 replay reached 00117"
      : `HOLD: remaining unauthorized unnest ${unauthorizedUnnest.map((r) => `${r.file}:${r.count}`).join(", ")}`;
  } catch (err) {
    if (!evidence.verdict) evidence.verdict = "HOLD";
    if (!evidence.reason) evidence.reason = String(err.message || err);
    evidence.error = String(err.message || err).slice(0, 800);
  } finally {
    try {
      fs.rmSync(workdir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    db.close();
  }

  const outJson = path.join(root, "docs/evidence/M3_F3_LOCAL_TRANSFORMED_FLOOR_PROOF_00057_20260913.json");
  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
  process.exit(evidence.verdict === "PASS" ? 0 : 1);
}

main();
