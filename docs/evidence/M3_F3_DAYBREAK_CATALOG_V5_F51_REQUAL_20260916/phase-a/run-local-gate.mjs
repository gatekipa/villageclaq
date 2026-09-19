#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const WORK = "/workspace/f3-f51-requal-20260916/f51-work";
const OUT = "/workspace/f3-f51-requal-20260916/phase-a";
const LOGS = path.join(OUT, "logs/suites");
fs.mkdirSync(LOGS, { recursive: true });

const PATH_WITH_CLI = `/workspace/f3-dbpush-qual/bin:${process.env.PATH || ""}`;
const F51 = "55995cf0ab5f89dd0b59775eb99a7f63a5e0d5b1";

const SUITES = [
  { name: "test-f3-recognition", cmd: ["npm", "run", "test:f3-recognition"] },
  { name: "test-f3-db-push", cmd: ["npm", "run", "test:f3-db-push"] },
  { name: "test-f3-local-safety", cmd: ["npm", "run", "test:f3-local-safety"] },
  { name: "test-f3-mapi-harness", cmd: ["npm", "run", "test:f3-mapi-harness"] },
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
  if (name === "test-s0-cut2" && exit !== 0) return "ENV_DEPENDENT_FAIL";
  if (exit === 0 && counts.fail === 0 && counts.skipped > 0) return "PASS_WITH_SKIPS";
  if (exit === 0 && (counts.fail === 0 || counts.fail == null)) return "PASS";
  if (exit !== 0) return "FAIL";
  return "UNKNOWN";
}

// Git / worktree / HEAD
const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: WORK, encoding: "utf8" }).stdout.trim();
const porcelain = spawnSync("git", ["status", "--porcelain"], { cwd: WORK, encoding: "utf8" }).stdout;
const functionalDirty = porcelain
  .split("\n")
  .filter(Boolean)
  .filter((l) => !l.includes("supabase/.temp") && !l.includes("next-env.d.ts") && !l.includes("tsconfig.tsbuildinfo") && !l.includes("node_modules"));

const cliVer = spawnSync("/workspace/f3-dbpush-qual/bin/supabase", ["--version"], { encoding: "utf8" }).stdout.trim();

// no #96-100 dependency: F5.1 parent chain does not require those PR tips as authority
const logOneline = spawnSync("git", ["log", "--oneline", "-5", "HEAD"], { cwd: WORK, encoding: "utf8" }).stdout;
const mentions96100 = /#9[6-9]\b|#100\b/.test(logOneline);

const metas = {};
const envBase = {
  ...process.env,
  PATH: PATH_WITH_CLI,
  CI: "1",
  FORCE_COLOR: "0",
};
// Reject ambient DATABASE_URL/PG* for local gate
delete envBase.DATABASE_URL;
for (const k of Object.keys(envBase)) {
  if (/^PG/i.test(k)) delete envBase[k];
}

for (const suite of SUITES) {
  console.log(`RUNNING ${suite.name}...`);
  const r = spawnSync(suite.cmd[0], suite.cmd.slice(1), {
    cwd: WORK,
    env: envBase,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  fs.writeFileSync(path.join(LOGS, `${suite.name}.out`), out);
  const sha = createHash("sha256").update(out).digest("hex");
  const counts = parseTap(out);
  if (suite.name === "next-build" || suite.name === "tsc-noEmit") {
    counts.tests = null;
    counts.pass = r.status === 0 ? 1 : 0;
    counts.fail = r.status === 0 ? 0 : 1;
    counts.skipped = 0;
  }
  const classification = classify(suite.name, r.status ?? 1, counts);
  metas[suite.name] = {
    exit: r.status,
    classification,
    counts,
    sha256: sha,
    bytes: Buffer.byteLength(out),
  };
  fs.writeFileSync(path.join(LOGS, `${suite.name}.meta.json`), JSON.stringify(metas[suite.name], null, 2) + "\n");
  console.log(`DONE ${suite.name} exit=${r.status} class=${classification}`);
}

const requiredPass = ["test-f3-db-push", "test-f3-recognition", "tsc-noEmit", "next-build"];
const requiredOk = requiredPass.every((n) => {
  const m = metas[n];
  return m && (m.classification === "PASS" || m.classification === "PASS_WITH_SKIPS");
});

const result = {
  head,
  head_is_F51: head === F51,
  clean_worktree_functional: functionalDirty.length === 0,
  porcelain: porcelain.trim(),
  functional_dirty_lines: functionalDirty,
  cli_version: cliVer,
  cli_ok: cliVer === "2.117.0",
  no_pr96_100_as_authority: !mentions96100,
  suites: metas,
  required_suites_ok: requiredOk,
  verdict: head === F51 && functionalDirty.length === 0 && cliVer === "2.117.0" && requiredOk
    ? "CONTINUE"
    : "HOLD",
};

fs.writeFileSync(path.join(OUT, "local-gate.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ verdict: result.verdict, head, cli: cliVer, requiredOk, dirty: functionalDirty.length }, null, 2));
if (result.verdict !== "CONTINUE") process.exit(2);
