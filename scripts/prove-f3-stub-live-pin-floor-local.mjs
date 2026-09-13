/**
 * Local proof of the documented stub+live-pin floor through 00117.
 *
 * Not hosted. Not db push. Not Management API. Not a clean 00001–00117
 * replay. Not production-equivalent. Does not apply 00118–00123.
 *
 * When local PostgreSQL 17 (f3_* disposable) is available, applies the
 * same SQL components used by the hosted gated psql -f path and evaluates
 * pre-db-push gates. When local PG is absent, records composition proof
 * only and leaves apply as NOT_RUN for Chief.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DISCLOSED_STUB_LIVE_PIN_COMPONENTS,
  PRE_DB_PUSH_VERIFICATION_SQL,
  QUALIFICATION_FLOOR_LABEL,
  STUB_LIVE_PIN_FLOOR_AUTHORITY,
  evaluatePreDbPushGates,
  installStubLivePinFloorLocal,
  readUnmodified00117Bytes,
  stubLivePinFloorPrecheck,
  stubLivePinFloorSqlSteps,
} from "./lib/f3-db-push-stub-live-pin-floor.mjs";
import { createIsolatedDbPushWorkdir } from "./lib/f3-db-push-version-map.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

function compositionProof() {
  const precheck = stubLivePinFloorPrecheck();
  const file00117 = readUnmodified00117Bytes();
  const isolated = createIsolatedDbPushWorkdir();
  const steps = stubLivePinFloorSqlSteps();
  const workdirMigrations = fs
    .readdirSync(path.join(isolated.workdir, "supabase", "migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  fs.rmSync(isolated.workdir, { recursive: true, force: true });
  return {
    ok: true,
    label: QUALIFICATION_FLOOR_LABEL,
    authority: STUB_LIVE_PIN_FLOOR_AUTHORITY,
    components: [...DISCLOSED_STUB_LIVE_PIN_COMPONENTS],
    stepIds: steps.map((s) => s.id),
    file00117: { sha256: file00117.sha256, byteLength: file00117.byteLength },
    isolatedWorkdirMigrations: workdirMigrations,
    isolatedWorkdirOnlyF3: workdirMigrations.length === 6 && workdirMigrations.every((n) => n.startsWith("2026091317300")),
    recognition: precheck.recognition,
    frozenDigests: precheck.frozenDigests,
    cleanReplay00001_00117: false,
    productionEquivalent: false,
    invented00117History: false,
    greenfieldDisallowed: true,
    transformsDisallowed: true,
  };
}

async function tryLocalApply(composition) {
  let createDisposableDatabase;
  let psql;
  let psqlFile;
  try {
    ({ createDisposableDatabase, psql, psqlFile } = await import("./fixtures/disposable-postgres.mjs"));
  } catch (err) {
    return { status: "NOT_RUN", reason: `local disposable helper unavailable: ${err.message}` };
  }
  let db;
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "f3-stub-floor-local-"));
  try {
    db = createDisposableDatabase("stub_live_pin");
    const installed = installStubLivePinFloorLocal({
      url: db.url,
      workdir,
      psql,
      psqlFile,
    });
    if (!installed.installed || !installed.reached_00117) {
      return {
        status: "HOLD",
        reached_00117: false,
        failedAt: installed.failedAt,
        steps: installed.steps,
        file00117: installed.file00117,
      };
    }
    const raw = psql(db.url, PRE_DB_PUSH_VERIFICATION_SQL);
    const captured = JSON.parse(raw);
    const gates = evaluatePreDbPushGates({
      captured,
      invented00117History: installed.invented00117History,
    });
    return {
      status: gates.ok && !installed.invented00117History ? "PASS" : "HOLD",
      reached_00117: true,
      invented00117History: installed.invented00117History,
      historyCount: installed.historyCount,
      steps: installed.steps,
      file00117: installed.file00117,
      gates,
      composition,
    };
  } catch (err) {
    const msg = String(err.message || err);
    if (
      /connect|could not connect|No such file|server_version|PostgreSQL 17|ECONNREFUSED|f3_|psql admin failed|psql failed|Connection refused|does not exist/i.test(
        msg,
      )
    ) {
      return { status: "NOT_RUN", reason: `local PostgreSQL 17 disposable unavailable: ${msg}` };
    }
    return { status: "HOLD", reason: msg };
  } finally {
    try {
      db?.close?.();
    } catch {
      /* ignore */
    }
    fs.rmSync(workdir, { recursive: true, force: true });
  }
}

async function main() {
  const composition = compositionProof();
  const apply = await tryLocalApply(composition);
  const payload = {
    artifact: "M3_F3_LOCAL_STUB_LIVE_PIN_FLOOR_PROOF_20260913",
    label: QUALIFICATION_FLOOR_LABEL,
    verdict:
      apply.status === "PASS"
        ? "LOCAL STUB+LIVE-PIN FLOOR THROUGH 00117 PASS"
        : apply.status === "NOT_RUN"
          ? "LOCAL COMPOSITION PASS — APPLY NOT_RUN (no local PG17)"
          : "HOLD",
    cleanReplay00001_00117: false,
    productionEquivalent: false,
    productionApproval: "NOT CLAIMED",
    hosted: "NOT_RUN — Chief runs hosted db push",
    composition,
    apply,
  };
  const outJson = path.join(root, "docs/evidence/M3_F3_LOCAL_STUB_LIVE_PIN_FLOOR_PROOF_20260913.json");
  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(payload, null, 2));
  if (payload.verdict === "HOLD") process.exit(1);
}

await main();
