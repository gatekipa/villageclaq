#!/usr/bin/env node
/**
 * Phase A — re-prove E4→F5→F5.1→E5 ancestry and F5→F5.1 scope = poison probe SQL only.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const OUT = "/workspace/f3-f51-requal-20260916/phase-a";
const REPO = "/workspace/f3-catalog-v5-remediate-20260915/tip-work";
const PINS = {
  main: "d83d13d4fe9915a0d1ff149ce29a53ad708c9853",
  pr83: "a293f5958b31548ccec7591b653eff2857ae9a90",
  E4: "11c99b9579360ed9ccad2a527db0162b7d8e884f",
  F5: "228549412cf3b7a3cfa3a1c6c6bdee553a1c0a65",
  F51: "55995cf0ab5f89dd0b59775eb99a7f63a5e0d5b1",
  E5: "3e8e1ce8620784ee88b50feec4e67e479fd7dfa3",
};
const SEALED = {
  "00118_f3_bounded_financial_epoch_foundation.sql": "888c794355982346573a3353caa7fa74181bc0048cc95990de60416de893ab1d",
  "00119_f3_01_core_ledger_foundation.sql": "5e03111ffb34be3ed76a714370c93e70210a9741a25ac7b9158a9a9ad22f12f4",
  "00120_f3_02_secure_posting_idempotency.sql": "35eba6966d2c077a9467f09adc6c85306b951c9d8388ee758a60d924c05ae51a",
  "00121_f3_03_projection_read_proof.sql": "8f65797949d8c5afb7dfa99b8020da52385347099b2a5b9be5148b253e76bde6",
  "00122_f3_04_correction_reversal.sql": "6e3240759aec64d4692422aac006b4fb865e3039832be84efea86b39c0253175",
  "00123_f3_05_opening_cash_command.sql": "d5e50fd760a9629bf4e1574fd256ecf0d4a108df83dec27323a608e0466dcb34",
};
const CRITICAL = [
  "scripts/lib/f3-full-catalog-independent-reference.mjs",
  "scripts/qualify-f3-db-push-disposable.mjs",
  "scripts/test-f3-db-push-harness.mjs",
  "scripts/lib/f3-db-push-floor.mjs",
  "scripts/lib/f3-db-push-identity.mjs",
  "scripts/lib/f3-db-push-inventory.mjs",
  "scripts/lib/f3-db-push-stub-live-pin-floor.mjs",
  "scripts/lib/f3-db-push-target-guard.mjs",
  "scripts/lib/f3-db-push-cli.mjs",
  "scripts/lib/f3-management-api-disposable-floor.mjs",
  "scripts/lib/f3-db-push-pins.mjs",
  "scripts/lib/f3-db-push-wipe.mjs",
  "scripts/lib/f3-db-push-history-inject.mjs",
  "scripts/lib/f3-db-push-pre-stub-floor-clean-check.mjs",
  "scripts/lib/f3-db-push-remote-sql-file.mjs",
  "scripts/lib/f3-db-push-query-parse.mjs",
  "scripts/lib/f3-db-push-version-map.mjs",
  "scripts/test-f3-stub-live-pin-floor.mjs",
  "scripts/test-f3-acl-portability.mjs",
  "scripts/test-f3-00030-transform-wipe.mjs",
  "scripts/test-f3-00057-transform.mjs",
];

function git(args) {
  const r = spawnSync("git", args, { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} => ${r.status}: ${r.stderr}`);
  return r.stdout.trim();
}

function write(name, obj) {
  const p = path.join(OUT, name);
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n");
  return p;
}

const parents = {
  F5_parent: git(["rev-parse", `${PINS.F5}^`]),
  F51_parent: git(["rev-parse", `${PINS.F51}^`]),
  E5_parent: git(["rev-parse", `${PINS.E5}^`]),
};
const ancestry = {
  E4_is_parent_of_F5: parents.F5_parent === PINS.E4,
  F5_is_parent_of_F51: parents.F51_parent === PINS.F5,
  F51_is_parent_of_E5: parents.E5_parent === PINS.F51,
  E4_ancestor_F5: spawnSync("git", ["merge-base", "--is-ancestor", PINS.E4, PINS.F5], { cwd: REPO }).status === 0,
  F5_ancestor_F51: spawnSync("git", ["merge-base", "--is-ancestor", PINS.F5, PINS.F51], { cwd: REPO }).status === 0,
  F51_ancestor_E5: spawnSync("git", ["merge-base", "--is-ancestor", PINS.F51, PINS.E5], { cwd: REPO }).status === 0,
  main_pin_ok: git(["rev-parse", "origin/main"]) === PINS.main,
  pr83_ok: git(["rev-parse", PINS.pr83]) === PINS.pr83,
};

const nameStatus = git(["diff", "--name-status", PINS.F5, PINS.F51]).split("\n").filter(Boolean);
const fullDiff = git(["diff", PINS.F5, PINS.F51]);
const scopeOk =
  nameStatus.length === 1 &&
  nameStatus[0] === "M\tscripts/lib/f3-db-push-repair-safety-gate.mjs" &&
  fullDiff.includes("'current_database', current_database()") &&
  fullDiff.includes("'current_user', current_user") &&
  !fullDiff.includes("diff --git") || (fullDiff.match(/^diff --git/gm) || []).length === 1;

const criticalIdentical = {};
for (const p of CRITICAL) {
  const a = git(["rev-parse", `${PINS.F5}:${p}`]);
  const b = git(["rev-parse", `${PINS.F51}:${p}`]);
  criticalIdentical[p] = { F5: a, F51: b, identical: a === b };
}
const allCriticalIdentical = Object.values(criticalIdentical).every((x) => x.identical);

const migIdentical = {};
for (const f of Object.keys(SEALED)) {
  const a = git(["rev-parse", `${PINS.F5}:supabase/migrations/${f}`]);
  const b = git(["rev-parse", `${PINS.F51}:supabase/migrations/${f}`]);
  migIdentical[f] = { identical: a === b, blob: b };
}

const F51_WORK = "/workspace/f3-f51-requal-20260916/f51-work";
const sealedEmbedded = JSON.parse(fs.readFileSync(path.join(OUT, "sealed-v5-hashes.json"), "utf8"));
const sealedCheck = sealedEmbedded.compare;
const sealedUnchanged = sealedEmbedded.all_match === true;

const probeSql = fs.readFileSync(path.join(F51_WORK, "scripts/lib/f3-db-push-repair-safety-gate.mjs"), "utf8");
const probeHasDb = /'current_database',\s*current_database\(\)/.test(probeSql);
const probeHasUser = /'current_user',\s*current_user/.test(probeSql);
const probeHasPoison = /'poisonPresent'/.test(probeSql);

const result = {
  pins: PINS,
  parents,
  ancestry,
  ancestry_exact_E4_F5_F51_E5: Object.values(ancestry).every(Boolean),
  f5_to_f51: {
    name_status: nameStatus,
    file_count: nameStatus.length,
    only_poison_sql_file: scopeOk && nameStatus.length === 1,
    diff_stat: git(["diff", "--stat", PINS.F5, PINS.F51]),
    diff_contains_current_database: fullDiff.includes("current_database"),
    diff_contains_current_user: fullDiff.includes("current_user"),
    full_diff: fullDiff,
  },
  critical_paths_identical: allCriticalIdentical,
  criticalIdentical,
  migrations_identical_F5_F51: Object.values(migIdentical).every((x) => x.identical),
  migIdentical,
  sealed_V5_hashes_unchanged_vs_F51_tree: sealedUnchanged,
  sealedCheck,
  probe_sql: {
    has_current_database: probeHasDb,
    has_current_user: probeHasUser,
    has_poisonPresent: probeHasPoison,
  },
  verdict:
    Object.values(ancestry).every(Boolean) &&
    nameStatus.length === 1 &&
    allCriticalIdentical &&
    sealedUnchanged &&
    probeHasDb &&
    probeHasUser
      ? "CONTINUE"
      : "HOLD",
};
write("ancestry-and-scope.json", result);
console.log(JSON.stringify({ verdict: result.verdict, file_count: nameStatus.length, sealed: sealedUnchanged, ancestry: result.ancestry_exact_E4_F5_F51_E5 }, null, 2));
if (result.verdict !== "CONTINUE") process.exit(2);
