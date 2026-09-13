/**
 * Local proof of wipe-to-baseline + no-shim hosted floor path +
 * ephemeral 00030 transform. Not hosted evidence. Not candidate runner.
 *
 * Reports PASS/HOLD. Does not modify repo 00030. Does not apply 00118–00123.
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
import { INVENTORY_CAPTURE_SQL, classifyInventory } from "./lib/f3-db-push-inventory.mjs";
import { remainingUnnestAfter00030 } from "./lib/f3-db-push-floor.mjs";
import { planWipe, proveCleanBaseline } from "./lib/f3-db-push-wipe.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

function parseInventory(text) {
  const s = String(text || "").trim();
  const start = s.search(/[{[]/);
  if (start < 0) return null;
  try {
    return JSON.parse(s.slice(start));
  } catch {
    return s;
  }
}

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

function applyThrough(url, files, { workdir, transform00030, stopBefore }) {
  const steps = [];
  let transform = null;
  for (const file of files) {
    if (stopBefore && file >= stopBefore) break;
    if (/^0011[6-7]_/.test(file)) {
      try {
        installLiveHasGroupPermission(url);
        steps.push({ id: `hgp-before-${file}`, ok: true });
      } catch (err) {
        steps.push({ id: `hgp-before-${file}`, ok: false, error: String(err.message || err) });
        return { ok: false, failedAt: `hgp-before-${file}`, steps, transform };
      }
    }
    let abs = path.join(root, "supabase/migrations", file);
    if (file === FLOOR_00030_FILENAME && transform00030) {
      transform = writeEphemeralTransformed00030(workdir);
      abs = transform.destAbs;
    }
    const applied = applyLocalFile(url, abs, file);
    steps.push({ id: file, ...applied, transformed: file === FLOOR_00030_FILENAME && Boolean(transform00030) });
    if (file === FLOOR_00030_FILENAME && transform) {
      deleteEphemeralTransformed00030(transform.destAbs);
    }
    if (!applied.ok) return { ok: false, failedAt: file, steps, transform };
  }
  return { ok: true, failedAt: null, steps, transform };
}

function main() {
  const remainingUnnest = remainingUnnestAfter00030();
  const evidence = {
    artifact: "M3_F3_LOCAL_TRANSFORMED_FLOOR_PROOF_20260913",
    hosted: "NOT_RUN",
    productionContacted: false,
    repo00030Modified: false,
    shimOnHostedPath: false,
    recognition: ["manual_income"],
    original00030Sha256: PINNED_ORIGINAL_SHA256,
    transformed00030Sha256: PINNED_TRANSFORMED_SHA256,
    remainingUnnestAfter00030: remainingUnnest,
    phases: {},
  };

  const db = createDisposableDatabase("wipe_floor");
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "f3-00030-local-"));
  try {
    psql(db.url, HOSTED_FLOOR_BOOTSTRAP);
    const files = listMainMigrationsThrough00117();
    const through00029 = files.filter((f) => f < FLOOR_00030_FILENAME);

    const pre = applyThrough(db.url, through00029, { workdir, transform00030: false });
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

    const inventoryFailed = parseInventory(psql(db.url, INVENTORY_CAPTURE_SQL, { tuplesOnly: true }));
    const wipePlan = planWipe(inventoryFailed);
    evidence.phases.failedFloorInventory = {
      verdict: wipePlan.classification.verdict,
      failedTables: wipePlan.classification.failedTables.length,
      extraTables: wipePlan.classification.extraTables,
      unnestShim: wipePlan.classification.unnestShim,
      action: wipePlan.action,
    };
    if (wipePlan.action === "HOLD") {
      evidence.verdict = "HOLD";
      evidence.reason = wipePlan.hold || wipePlan.classification.reason;
      throw new Error(evidence.reason);
    }
    if (wipePlan.action === "WIPE") {
      psql(db.url, wipePlan.sql.sql);
    }
    const inventoryAfterWipe = parseInventory(psql(db.url, INVENTORY_CAPTURE_SQL, { tuplesOnly: true }));
    const proved = proveCleanBaseline(inventoryAfterWipe);
    evidence.phases.wipeToBaseline = { ok: true, verdict: proved.classification.verdict };

    psql(db.url, HOSTED_FLOOR_BOOTSTRAP);
    const shimAfterHostedBootstrap = psql(
      db.url,
      "SELECT to_regprocedure('public.unnest(uuid)') IS NOT NULL;",
      { tuplesOnly: true },
    );
    evidence.phases.hostedBootstrap = {
      ok: true,
      unnestUuidShim: shimAfterHostedBootstrap === "t",
    };
    if (shimAfterHostedBootstrap === "t") {
      evidence.verdict = "HOLD";
      evidence.reason = "HOLD: hosted bootstrap installed public.unnest(uuid)";
      throw new Error(evidence.reason);
    }

    const replay = applyThrough(db.url, files, {
      workdir,
      transform00030: true,
      stopBefore: remainingUnnest[0]?.file || null,
    });
    evidence.phases.transformedReplayThroughHold = {
      ok: replay.ok,
      failedAt: replay.failedAt,
      transform: replay.transform
        ? {
            originalDigest: replay.transform.originalDigest,
            transformedDigest: replay.transform.transformedDigest,
            unnestCount: replay.transform.unnestCount,
            repoUnchanged: replay.transform.repoUnchanged,
          }
        : null,
      appliedThrough: replay.steps.filter((s) => s.ok && /\.sql$/.test(s.id)).map((s) => s.id).slice(-3),
      stepCount: replay.steps.length,
    };
    if (!replay.ok) {
      evidence.verdict = "HOLD";
      evidence.reason = `transformed replay failed at ${replay.failedAt}`;
      throw new Error(evidence.reason);
    }

    const probe00057 = remainingUnnest[0]
      ? applyLocalFile(
          db.url,
          path.join(root, "supabase/migrations", remainingUnnest[0].file),
          remainingUnnest[0].file,
        )
      : { ok: true, skipped: true };
    evidence.phases.remainingUnnestProbe = {
      file: remainingUnnest[0]?.file || null,
      count: remainingUnnest[0]?.count || 0,
      ok: probe00057.ok,
      errorSample: probe00057.ok ? null : String(probe00057.error || "").slice(0, 400),
    };

    const reached00117 = replay.ok && remainingUnnest.length === 0;
    evidence.through00117 = reached00117;
    evidence.verdict = reached00117 ? "PASS" : "HOLD";
    evidence.reason = reached00117
      ? "local no-shim transformed replay reached 00117"
      : `HOLD: local transformed 00030 replay is clean through ${FLOOR_00030_FILENAME}; remaining unnest in ${remainingUnnest.map((r) => `${r.file}:${r.count}`).join(", ")} blocks through-00117 without a further authorized transform. Hosted path HOLDs before that file to avoid a second mid-file partial.`;
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

  const outJson = path.join(root, "docs/evidence/M3_F3_LOCAL_TRANSFORMED_FLOOR_PROOF_20260913.json");
  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
  process.exit(evidence.verdict === "PASS" ? 0 : 1);
}

main();
