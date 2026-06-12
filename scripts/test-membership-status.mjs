import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Guardrails for the membership_status vocabulary and the 00098 lifecycle
// migration (CHECK widening + hardened self-edit freeze). Decision record:
// docs/membership-status-vocabulary.md. These are static guarantees — the
// repo has no live-DB SQL harness, so trigger behavior is pinned by
// asserting the migration encodes it (clause presence AND ordering).

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

// The official five-value vocabulary. Adding a sixth status requires
// updating docs/membership-status-vocabulary.md, the 00098 successor
// migration, the group-context union, AND this list — by design.
const OFFICIAL_STATUSES = ["active", "pending_approval", "exited", "suspended", "archived"];

const MIGRATION = "supabase/migrations/00098_membership_status_lifecycle.sql";
const SUPERSEDED = "supabase/migrations/00092_membership_status_self_freeze.sql";

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) yield full;
  }
}

test("every membership_status literal under src/ is in the official vocabulary", () => {
  // Catches: .eq("membership_status", X), { membership_status: "X" },
  // membership_status === "X" / !== "X", .neq("membership_status", X),
  // and the TS union in group-context.
  const patterns = [
    /\.(?:eq|neq)\(\s*["']membership_status["']\s*,\s*["']([a-z_]+)["']/g,
    /membership_status["']?\s*:\s*["']([a-z_]+)["']/g,
    /membership_status\s*(?:===|!==)\s*["']([a-z_]+)["']/g,
    /\.in\(\s*["']membership_status["']\s*,\s*\[([^\]]*)\]/g,
  ];
  const offenders = [];
  for (const file of walk(path.join(root, "src"))) {
    const source = fs.readFileSync(file, "utf8");
    if (!source.includes("membership_status")) continue;
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        const captured = match[1].includes("'") || match[1].includes('"')
          ? [...match[1].matchAll(/["']([a-z_]+)["']/g)].map((m) => m[1])
          : [match[1]];
        for (const value of captured) {
          if (!OFFICIAL_STATUSES.includes(value)) {
            offenders.push(`${path.relative(root, file)}: "${value}"`);
          }
        }
      }
    }
    // The TS union literals (membership_status: "a" | "b" | ...) — capture
    // the union line and check each quoted member.
    const unionMatch = source.match(/membership_status:\s*((?:"[a-z_]+"\s*\|\s*)+"[a-z_]+")/);
    if (unionMatch) {
      for (const m of unionMatch[1].matchAll(/"([a-z_]+)"/g)) {
        if (!OFFICIAL_STATUSES.includes(m[1])) {
          offenders.push(`${path.relative(root, file)} (type union): "${m[1]}"`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [], `unofficial membership_status literals found:\n${offenders.join("\n")}`);
});

test("the client TS union carries the full official vocabulary", () => {
  const source = read("src/lib/group-context.tsx");
  for (const status of OFFICIAL_STATUSES) {
    assert.ok(
      new RegExp(`membership_status:[^;]*"${status}"`).test(source),
      `group-context union must include "${status}"`,
    );
  }
});

test("00098 widens the CHECK to exactly the official vocabulary, with a preflight", () => {
  const sql = read(MIGRATION);
  assert.match(sql, /DROP CONSTRAINT IF EXISTS memberships_membership_status_check/);
  const checkMatch = sql.match(/ADD CONSTRAINT memberships_membership_status_check\s+CHECK \(membership_status IN\s*\(([^)]+)\)\)/);
  assert.ok(checkMatch, "00098 must ADD the named CHECK constraint");
  const values = [...checkMatch[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(values.sort(), [...OFFICIAL_STATUSES].sort(), "CHECK set must equal the official vocabulary");
  // Preflight: abort if any row sits outside the new set (non-destructive).
  assert.match(sql, /preflight failed/);
  assert.doesNotMatch(sql, /\bDELETE\s+FROM\b/i, "00098 must not delete data");
  assert.doesNotMatch(sql, /UPDATE\s+(public\.)?memberships\s+SET/i, "00098 must not rewrite rows");
});

test("00098 encodes the hardened self-edit freeze: status frozen BEFORE the admin bypass, exited carve-out, others-row and service-role exits", () => {
  const sql = read(MIGRATION);
  // Service-role / background writes bypass (crons, producers, webhooks).
  assert.match(sql, /IF v_caller IS NULL THEN\s*RETURN NEW;/);
  // Admin edits to OTHER members' rows early-return (approve/suspend/transfer flows).
  assert.match(sql, /IF OLD\.user_id IS DISTINCT FROM v_caller THEN\s*RETURN NEW;/);
  // The self-exit carve-out is the only permitted self status change.
  assert.match(sql, /NEW\.membership_status IS DISTINCT FROM OLD\.membership_status\s*\n?\s*AND NEW\.membership_status <> 'exited'/);
  assert.match(sql, /membership_status_change_requires_admin/);
  // ORDERING: the status freeze must appear BEFORE is_group_admin is
  // consulted — that hoisting is what closes the suspended-admin residual
  // and the unsuspend self-block caveat.
  const statusFreezeAt = sql.indexOf("membership_status_change_requires_admin");
  const adminBypassAt = sql.indexOf("v_is_admin := is_group_admin");
  assert.ok(statusFreezeAt > 0 && adminBypassAt > 0, "both clauses must exist");
  assert.ok(statusFreezeAt < adminBypassAt, "membership_status freeze must run BEFORE the admin bypass");
  // The remaining 00075 freezes are preserved.
  for (const err of ["role_change_requires_admin", "standing_change_requires_admin", "group_id_change_not_allowed", "user_id_change_not_allowed", "is_proxy_change_requires_admin", "proxy_manager_change_requires_admin"]) {
    assert.ok(sql.includes(err), `00098 must preserve the ${err} freeze`);
  }
  assert.match(sql, /CREATE TRIGGER prevent_membership_self_escalation/);
});

test("00092 is marked SUPERSEDED and both files carry the do-not-apply pairing", () => {
  const superseded = read(SUPERSEDED);
  assert.match(superseded, /SUPERSEDED \(2026-06-13\) — DO NOT APPLY THIS MIGRATION/);
  assert.match(superseded, /00098_membership_status_lifecycle\.sql/);
  const sql = read(MIGRATION);
  assert.match(sql, /SUPERSEDES 00092_membership_status_self_freeze\.sql — DO NOT APPLY 00092/);
});

test("app status-transition flows write only official transitions", () => {
  // Leave-group (the only legitimate SELF status write) -> 'exited'.
  const myProfile = read("src/app/[locale]/(dashboard)/dashboard/my-profile/page.tsx");
  const selfWrites = [...myProfile.matchAll(/membership_status:\s*["']([a-z_]+)["']/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(selfWrites)], ["exited"], "my-profile must only ever self-write 'exited'");

  // Admin approve flows -> 'active' (on OTHER members' rows).
  for (const file of [
    "src/app/[locale]/(dashboard)/dashboard/members/page.tsx",
    "src/app/[locale]/(dashboard)/dashboard/settings/page.tsx",
  ]) {
    const source = read(file);
    const writes = [...source.matchAll(/update\(\s*\{\s*membership_status:\s*["']([a-z_]+)["']/g)].map((m) => m[1]);
    for (const value of writes) {
      assert.equal(value, "active", `${file} status writes must be the approve transition to 'active'`);
    }
  }
});

test("the decision record exists with the binding sections", () => {
  const doc = read("docs/membership-status-vocabulary.md");
  for (const status of OFFICIAL_STATUSES) {
    assert.ok(doc.includes(`\`${status}\``), `vocabulary doc must define ${status}`);
  }
  assert.match(doc, /SUPERSEDED — Option C/);
  assert.match(doc, /Never apply 00092/);
  assert.match(doc, /Production migration sequence/);
});
