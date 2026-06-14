import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Build-9 unit tests for the shared per-type standing-exclusion writer. Verifies
// the read-merge-write only flips ONE type id's membership in
// excluded_contribution_type_ids, no-ops when unchanged, and never touches any
// other settings key — so the type form and the Settings → Standing tab stay
// one source of truth. Uses the ts-transpile + vm harness with @/lib/standing-rules
// stubbed to the same JSONB shape + a fake Supabase. No DB, no network.

const sourcePath = new URL("../src/lib/standing-exclusion.ts", import.meta.url);
const require = createRequire(import.meta.url);

function load() {
  const compiled = ts.transpileModule(fs.readFileSync(sourcePath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  const localRequire = (id) => {
    if (id === "@/lib/standing-rules") {
      return {
        // Minimal shape-faithful stubs of the real resolve/serialize.
        resolveStandingRules(settings) {
          const raw = (settings && settings.standing_rules) || {};
          const excl = Array.isArray(raw.excluded_contribution_type_ids)
            ? raw.excluded_contribution_type_ids.filter((v) => typeof v === "string")
            : [];
          return { enabled: true, excludedContributionTypeIds: excl, factors: {} };
        },
        serializeStandingRules(rules) {
          return { enabled: rules.enabled, excluded_contribution_type_ids: [...rules.excludedContributionTypeIds] };
        },
      };
    }
    return require(id);
  };
  vm.runInNewContext(compiled, { console, exports: mod.exports, module: mod, require: localRequire }, { filename: sourcePath.pathname });
  return mod.exports;
}

const lib = load();
const GROUP = "g-1";
const TYPE = "t-1";

function fakeSupabase(initialSettings) {
  const state = { settings: initialSettings };
  const writes = [];
  class B {
    constructor(table) { this.table = table; this.op = "select"; this.payload = null; }
    select() { return this; }
    update(p) { this.op = "update"; this.payload = p; return this; }
    eq() { return this; }
    single() { return Promise.resolve({ data: { settings: state.settings }, error: null }); }
    then(resolve) {
      if (this.op === "update") { state.settings = this.payload.settings; writes.push(this.payload.settings); return Promise.resolve(resolve({ error: null })); }
      return Promise.resolve(resolve({ data: null, error: null }));
    }
  }
  return { state, writes, from: (t) => new B(t) };
}

test("isContributionExcluded reflects the stored list", () => {
  assert.equal(lib.isContributionExcluded({ standing_rules: { excluded_contribution_type_ids: [TYPE] } }, TYPE), true);
  assert.equal(lib.isContributionExcluded({ standing_rules: { excluded_contribution_type_ids: [] } }, TYPE), false);
  assert.equal(lib.isContributionExcluded(null, TYPE), false);
});

test("setting excluded=true adds the id once; writes only the standing_rules key", async () => {
  const sb = fakeSupabase({ other_setting: 42, standing_rules: { excluded_contribution_type_ids: [] } });
  const result = await lib.setContributionStandingExclusion(sb, GROUP, TYPE, true);
  // arrays cross the vm realm boundary — compare by value, not reference.
  assert.equal(JSON.stringify(result), JSON.stringify([TYPE]));
  assert.equal(sb.writes.length, 1);
  // preserves unrelated settings (read-merge-write, last-write-wins on full blob)
  assert.equal(sb.state.settings.other_setting, 42);
  assert.equal(JSON.stringify(sb.state.settings.standing_rules.excluded_contribution_type_ids), JSON.stringify([TYPE]));
});

test("setting excluded=false removes the id", async () => {
  const sb = fakeSupabase({ standing_rules: { excluded_contribution_type_ids: [TYPE, "t-2"] } });
  const result = await lib.setContributionStandingExclusion(sb, GROUP, TYPE, false);
  assert.equal(JSON.stringify(result), JSON.stringify(["t-2"]));
  assert.equal(JSON.stringify(sb.state.settings.standing_rules.excluded_contribution_type_ids), JSON.stringify(["t-2"]));
});

test("no-op when already in the desired state -> no write", async () => {
  const already = fakeSupabase({ standing_rules: { excluded_contribution_type_ids: [TYPE] } });
  await lib.setContributionStandingExclusion(already, GROUP, TYPE, true); // already excluded
  assert.equal(already.writes.length, 0, "no write when already excluded");

  const notThere = fakeSupabase({ standing_rules: { excluded_contribution_type_ids: [] } });
  await lib.setContributionStandingExclusion(notThere, GROUP, TYPE, false); // already counts
  assert.equal(notThere.writes.length, 0, "no write when already counting");
});

test("standingExclusionQueryKeys matches the Settings tab's invalidation set", () => {
  const keys = lib.standingExclusionQueryKeys(GROUP);
  const flat = keys.map((k) => k.join("|"));
  assert.ok(flat.includes(`group-settings|${GROUP}`));
  assert.ok(flat.includes("group-settings"));
  assert.ok(flat.includes(`members|${GROUP}`));
  assert.ok(flat.includes("member-standing"));
});
