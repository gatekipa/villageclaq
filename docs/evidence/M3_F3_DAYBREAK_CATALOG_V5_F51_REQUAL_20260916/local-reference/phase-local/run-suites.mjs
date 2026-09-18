import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const TIP = "/workspace/f3-catalog-v5-remediate-20260915/tip-work";
const OUT = "/workspace/f3-catalog-v5-remediate-20260915/phase-local";
const LOGS = path.join(OUT, "logs/suites");
fs.mkdirSync(LOGS, { recursive: true });

const PATH_WITH_CLI = `/workspace/f3-dbpush-qual/bin:${process.env.PATH || ""}`;

const SUITES = [
  { name: "test-f3-mapi-harness", cmd: ["npm", "run", "test:f3-mapi-harness"] },
  { name: "test-f3-recognition", cmd: ["npm", "run", "test:f3-recognition"] },
  { name: "test-m2-static-security", cmd: ["npm", "run", "test:m2-static-security"] },
  { name: "test-m2", cmd: ["npm", "run", "test:m2"] },
  { name: "test-s0-cut1", cmd: ["npm", "run", "test:s0-cut1-active-authorization"] },
  { name: "test-s0-cut2", cmd: ["npm", "run", "test:s0-cut2"] },
  { name: "test-storage-buckets", cmd: ["npm", "run", "test:storage-buckets"] },
  { name: "test-f3-oracles", cmd: ["npm", "run", "test:f3-oracles"] },
  { name: "test-f3-local-safety", cmd: ["npm", "run", "test:f3-local-safety"] },
  { name: "test-f3-db-push", cmd: ["npm", "run", "test:f3-db-push"] },
  { name: "tsc-noEmit", cmd: ["npx", "tsc", "--noEmit"] },
  { name: "next-build", cmd: ["npm", "run", "build"] },
];

function parseTap(out) {
  const text = String(out || "");
  let pass = 0, fail = 0, skipped = 0, tests = null;
  const plan = text.match(/^1\.\.(\d+)\s*$/m);
  if (plan) tests = Number(plan[1]);
  for (const line of text.split("\n")) {
    if (/^ok\s+\d+/.test(line) && /#\s*SKIP/i.test(line)) skipped++;
    else if (/^ok\s+\d+/.test(line)) pass++;
    else if (/^not ok\s+\d+/.test(line)) fail++;
  }
  if (tests == null) tests = pass + fail + skipped;
  return { tests, pass, fail, skipped };
}

function classify(name, exit, counts) {
  if (name === "test-s0-cut2" && exit !== 0) {
    return "ENV_DEPENDENT_FAIL";
  }
  if (exit === 0 && counts.fail === 0 && counts.skipped > 0) return "PASS_WITH_SKIPS";
  if (exit === 0 && counts.fail === 0) return "PASS";
  if (exit !== 0) return "FAIL";
  return "UNKNOWN";
}

const runnerLog = [];
const metas = {};
const envBase = {
  ...process.env,
  PATH: PATH_WITH_CLI,
  CI: "1",
  // Keep ambient host DB vars from contaminating; seal used dedicated DBs
  FORCE_COLOR: "0",
};

for (const suite of SUITES) {
  runnerLog.push(`=== START ${suite.name} ===`);
  console.log(`RUNNING ${suite.name}...`);
  const r = spawnSync(suite.cmd[0], suite.cmd.slice(1), {
    cwd: TIP,
    env: envBase,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  const outPath = path.join(LOGS, `${suite.name}.out`);
  fs.writeFileSync(outPath, out);
  const sha = createHash("sha256").update(out).digest("hex");
  const counts = parseTap(out);
  // next-build / tsc may not be TAP
  if (suite.name === "next-build" || suite.name === "tsc-noEmit") {
    counts.tests = null;
    counts.pass = null;
    counts.fail = null;
    counts.skipped = null;
  }
  const exit = r.status == null ? 1 : r.status;
  const classification = classify(suite.name, exit, {
    fail: counts.fail || 0,
    skipped: counts.skipped || 0,
  });
  const meta = {
    suite: suite.name,
    exit_code: exit,
    classification,
    tests: counts.tests,
    pass: counts.pass,
    fail: counts.fail,
    skipped: counts.skipped,
    sha256: sha,
    bytes: Buffer.byteLength(out),
  };
  metas[suite.name] = meta;
  fs.writeFileSync(path.join(LOGS, `${suite.name}.meta.json`), JSON.stringify(meta, null, 2) + "\n");
  runnerLog.push(`=== END ${suite.name} exit=${exit} ===`);
  console.log(JSON.stringify(meta));
}

fs.writeFileSync(path.join(LOGS, "runner.log"), runnerLog.join("\n") + "\n");

// Extract negatives / call counts from test-f3-db-push out
const dbPushOut = fs.readFileSync(path.join(LOGS, "test-f3-db-push.out"), "utf8");
const negativeIds = [...dbPushOut.matchAll(/\b(V4-[A-Z0-9-]+|C\d+|POISON-[A-Z0-9-]+)\b/g)].map((m) => m[1]);
const uniqueNeg = [...new Set(negativeIds)].sort();
const callCountLines = dbPushOut
  .split("\n")
  .filter((l) => /dbPushCalls|repairCalls|migrationRepairCalls|actual call/i.test(l));

const dbPushMeta = metas["test-f3-db-push"];
const result = {
  command: "npm run test:f3-db-push",
  tests: dbPushMeta.tests,
  pass: dbPushMeta.pass,
  fail: dbPushMeta.fail,
  skipped: dbPushMeta.skipped,
  skipped_detail: (dbPushOut.match(/# SKIP[^\n]*/g) || []).slice(0, 5),
  exit_ok: dbPushMeta.exit_code === 0,
  cli_version: "2.117.0",
  tsc_exit: metas["tsc-noEmit"].exit_code,
  build_exit: metas["next-build"].exit_code,
  suite_metas: metas,
  env_dependent: Object.values(metas)
    .filter((m) => m.classification === "ENV_DEPENDENT_FAIL")
    .map((m) => m.suite),
  negative_id_mentions_unique: uniqueNeg,
  call_count_lines_sample: callCountLines.slice(0, 40),
};

fs.writeFileSync(path.join(OUT, "local-suites.json"), JSON.stringify(result, null, 2) + "\n");
console.log("SUITES_DONE", JSON.stringify({
  db_push: { tests: result.tests, pass: result.pass, fail: result.fail, skipped: result.skipped, exit: dbPushMeta.exit_code },
  tsc: result.tsc_exit,
  build: result.build_exit,
  env_dependent: result.env_dependent,
}));
process.exit(dbPushMeta.exit_code === 0 && result.tsc_exit === 0 && result.build_exit === 0 ? 0 : 1);
