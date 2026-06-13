import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Static guardrails for Product Sprint D — the standing operating system:
// a configurable per-factor model, side-effect-free read hooks, an explicit
// admin recalculation, an auditable manual override, a four-value badge, and a
// hard no-send rule on passive render. Style matches the other product suites:
// read sources as text, assert clause presence/absence. No React harness exists.
//
// Tolerance note: where the exact wording belongs to another agent, these
// assertions key off STABLE tokens ("resolveStandingRules", "updateDb: false",
// "factors[", "serializeStandingRules", "standing_overridden") via includes()/
// loose regex, never on prose the other agents may phrase differently.

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const present = (rel) => fs.existsSync(path.join(root, rel));

const RULES = "src/lib/standing-rules.ts";
const CALC = "src/lib/calculate-standing.ts";
const HOOK = "src/lib/hooks/use-member-standing.ts";
const TAB = "src/components/settings/standing-rules-tab.tsx";
const BADGE = "src/components/standing-badge.tsx";
const MEMBERS = "src/app/[locale]/(dashboard)/dashboard/members/page.tsx";
const MEMBER_DETAIL = "src/app/[locale]/(dashboard)/dashboard/members/[id]/page.tsx";

const rules = read(RULES);
const calc = read(CALC);
const hook = read(HOOK);
const tab = read(TAB);
const badge = present(BADGE) ? read(BADGE) : "";
const members = read(MEMBERS);
const memberDetail = read(MEMBER_DETAIL);
const en = JSON.parse(read("messages/en.json"));
const fr = JSON.parse(read("messages/fr.json"));

// The shared contract's canonical factor list. Kept in lock-step with
// STANDING_FACTOR_KEYS in standing-rules.ts (asserted below). If a new factor
// is added there, it MUST be added here too — that is the guardrail.
const EXPECTED_FACTOR_KEYS = [
  "dues",
  "meetingAttendance",
  "eventAttendance",
  "relief",
  "hosting",
  "fines",
  "loans",
  "disputes",
  "customActivity",
];

// ---------------------------------------------------------------------------
// 1. standing-rules.ts — the shared configurable model
// ---------------------------------------------------------------------------

test("DEFAULT_STANDING_FACTORS: random items OFF (fines/loans/event/custom), core ON", () => {
  // A random fine, loan, casual event, or activity must not auto-damage
  // standing unless the group opts in.
  assert.match(rules, /fines:\s*false/);
  assert.match(rules, /loans:\s*false/);
  assert.match(rules, /eventAttendance:\s*false/);
  assert.match(rules, /customActivity:\s*false/);
  // Core obligations + formal meetings stay on by default.
  assert.match(rules, /dues:\s*true/);
  assert.match(rules, /meetingAttendance:\s*true/);
  assert.match(rules, /relief:\s*true/);
  assert.match(rules, /hosting:\s*true/);
  assert.match(rules, /disputes:\s*true/);
});

test("STANDING_FACTOR_KEYS lists exactly the contract factors (incl. meeting/event/custom)", () => {
  for (const key of EXPECTED_FACTOR_KEYS) {
    assert.ok(rules.includes(`"${key}"`), `STANDING_FACTOR_KEYS must include "${key}"`);
    assert.ok(rules.includes(`| "${key}"`), `StandingFactorKey union must include "${key}"`);
  }
  // The old single "attendance" factor must be gone (split into meeting/event).
  assert.ok(!/\|\s*"attendance"/.test(rules), "the single 'attendance' factor key must be split out");
});

test("meeting/event attendance split: separable factors with safe event default", () => {
  // Both attendance factors are real, separately togglable factor keys.
  assert.ok(rules.includes('"meetingAttendance"') && rules.includes('"eventAttendance"'));
  // The engine scopes each to the right event types.
  assert.ok(calc.includes('"meeting"') && calc.includes('"agm"'), "meetings = event_type meeting/agm");
  assert.ok(calc.includes("event_type"), "engine reads events.event_type to split attendance");
  assert.ok(calc.includes("rules.factors.meetingAttendance") && calc.includes("rules.factors.eventAttendance"));
  // Legacy single 'attendance' flag still resolves (back-compat).
  assert.ok(rules.includes("rawFactors.attendance"), "resolveStandingRules keeps attendance back-compat");
});

test("custom activities are an inert, gated slot (no silent standing impact)", () => {
  // The factor is gated in the engine even though it has no data source yet,
  // so a future activity type cannot bypass the toggle model.
  assert.ok(calc.includes("rules.factors.customActivity"), "customActivity is gated in the engine");
  // Default OFF (asserted above) means a random/custom activity never damages
  // standing unless a group explicitly turns it on.
});

test("resolveStandingRules reads excluded_contribution_type_ids and per-factor flags", () => {
  assert.ok(rules.includes("resolveStandingRules"), "exports resolveStandingRules");
  assert.ok(rules.includes("excluded_contribution_type_ids"), "reads the exclusion list");
  assert.ok(rules.includes("raw.factors") || rules.includes(".factors"), "reads the factors map");
  // Reads from the groups.settings.standing_rules JSONB.
  assert.ok(rules.includes("standing_rules"), "reads groups.settings.standing_rules");
  // Resilient: never throws on bad input (falls back to defaults).
  assert.ok(rules.includes("DEFAULT_STANDING_FACTORS") || rules.includes("DEFAULT_STANDING_RULES"));
});

test("serializeStandingRules round-trips to the snake_case JSONB shape", () => {
  assert.ok(rules.includes("serializeStandingRules"), "exports serializeStandingRules");
  for (const k of [
    "attendance_threshold_percent",
    "missed_hosting_threshold",
    "overdue_grace_days",
    "attendance_lookback_months",
    "excluded_contribution_type_ids",
  ]) {
    assert.ok(rules.includes(k), `serialized shape carries ${k}`);
  }
  assert.ok(rules.includes("factors:"), "serialized shape carries factors");
});

// ---------------------------------------------------------------------------
// 2. calculate-standing.ts — every rule gated behind the configurable model
// ---------------------------------------------------------------------------

test("calculate-standing imports and uses the shared rules resolver", () => {
  assert.ok(calc.includes("resolveStandingRules"), "imports resolveStandingRules");
  // The resolved rules object drives the engine.
  assert.ok(calc.includes("resolveStandingRules("), "calls resolveStandingRules(...)");
});

test("each factor rule is gated behind rules.factors[...] (toggle-aware)", () => {
  // Toggle-model: a rule only contributes when its factor is enabled.
  assert.ok(calc.includes("rules.factors["), "rules are gated via rules.factors[...]");
  // Spot-check the factors that default OFF must be explicitly gated, so a
  // random fine/loan cannot damage standing unless the group opts in.
  for (const key of ["fines", "loans"]) {
    assert.ok(
      calc.includes(`rules.factors["${key}"]`) || calc.includes(`rules.factors.${key}`),
      `${key} rule must be gated behind its factor flag`,
    );
  }
});

test("the SQL engine (migration 00101) gates EVERY factor — TS/SQL parity guardrail", () => {
  // The TS engine and the SQL engine must honour the same factor model. This
  // fails CI if a factor is added to the contract but not taught to the SQL
  // compute function, preventing silent TS/SQL drift.
  const sql = read("supabase/migrations/00101_standing_factors_and_history.sql");
  for (const key of EXPECTED_FACTOR_KEYS) {
    assert.ok(sql.includes(`'${key}'`), `00101 must read the ${key} factor from the JSONB`);
  }
  // The meeting/event split is scoped by event_type in SQL (NULL-safe).
  assert.ok(sql.includes("event_type") && sql.includes("'meeting','agm'"), "SQL splits attendance by event_type");
  assert.ok(sql.includes("v_f_custom"), "SQL declares + gates the custom-activity switch");
});

test("attendance threshold comes from rules, not a hardcoded 60 in the rule", () => {
  assert.ok(calc.includes("rules.attendanceThresholdPercent"), "uses rules.attendanceThresholdPercent");
  // The old module-level `const ATTENDANCE_THRESHOLD = 60` rule constant must
  // no longer drive the pass/fail comparison.
  assert.ok(
    !/rate\s*>=\s*ATTENDANCE_THRESHOLD/.test(calc) && !/rate\s*>=\s*60\b/.test(calc),
    "attendance pass/fail must not compare against a hardcoded 60",
  );
});

test("hosting uses rules.missedHostingThreshold (not 'any miss fails')", () => {
  assert.ok(calc.includes("rules.missedHostingThreshold"), "uses rules.missedHostingThreshold");
});

test("dues honor rules.overdueGraceDays and skip excluded contribution types", () => {
  assert.ok(calc.includes("rules.overdueGraceDays"), "applies the overdue grace days");
  assert.ok(calc.includes("excludedContributionTypeIds"), "skips excluded contribution types");
  // To exclude by type, the obligation query must select the type id.
  assert.ok(calc.includes("contribution_type_id"), "selects contribution_type_id for exclusion");
});

test("proxy / membership_status guard is present (don't flag proxies or inactive)", () => {
  assert.ok(
    calc.includes("is_proxy") || calc.includes("membership_status"),
    "calculate-standing guards on proxy / membership_status",
  );
});

// ---------------------------------------------------------------------------
// 3. use-member-standing.ts — read = read (no write, no notify on render)
// ---------------------------------------------------------------------------

test("read hooks call calculateStanding with updateDb:false (no write-on-render)", () => {
  assert.ok(hook.includes("updateDb: false"), "read hooks pass updateDb: false");
});

test("a separate recalculate hook owns the updateDb:true write path", () => {
  assert.ok(/useRecalculate\w*/.test(hook), "a useRecalculate* hook exists");
  assert.ok(hook.includes("updateDb: true"), "the recalculate hook uses updateDb: true");
});

test("the read hooks dispatch NO standing notification (no send tokens)", () => {
  assert.ok(
    !/notifyFromClient|standing-notifications|produceStandingChange/.test(hook),
    "read hooks must not reference any standing send path",
  );
});

// ---------------------------------------------------------------------------
// 4. standing-rules-tab.tsx — per-factor toggles, factor-preserving persistence
// ---------------------------------------------------------------------------

test("settings tab renders a per-factor toggle for every STANDING_FACTOR_KEY", () => {
  // It must iterate the shared key list (so a new factor auto-appears) OR
  // render an explicit toggle per factor.
  const iteratesShared = tab.includes("STANDING_FACTOR_KEYS");
  for (const key of EXPECTED_FACTOR_KEYS) {
    assert.ok(
      iteratesShared || tab.includes(`"${key}"`),
      `tab surfaces the ${key} factor toggle (inline or via STANDING_FACTOR_KEYS)`,
    );
  }
  // A toggle control is present.
  assert.ok(tab.includes("Switch") || tab.includes("Checkbox"), "uses a toggle control");
});

test("settings tab persists factors + exclusions via serializeStandingRules", () => {
  assert.ok(tab.includes("serializeStandingRules"), "persists via serializeStandingRules");
  // Must NOT save through apply_standing_rules, which drops factors/exclusions.
  assert.ok(
    !tab.includes('rpc("apply_standing_rules"'),
    "factors/exclusions must not be saved through apply_standing_rules (it drops them)",
  );
});

// ---------------------------------------------------------------------------
// 5. standing-badge.tsx — one badge, all four standing values
// ---------------------------------------------------------------------------

test("standing-badge.tsx exists and handles all four standing values", () => {
  assert.ok(badge.length > 0, "standing-badge.tsx must exist");
  for (const value of ["good", "warning", "suspended", "banned"]) {
    assert.ok(badge.includes(`"${value}"`) || badge.includes(`'${value}'`), `badge handles ${value}`);
  }
});

test("members list uses StandingBadge and does not hide standing on mobile", () => {
  assert.ok(members.includes("StandingBadge"), "members page renders StandingBadge");
  // The standing column/cell must not be gated behind a 'hidden sm:' wrapper.
  assert.ok(
    !/hidden\s+sm:[^"']*StandingBadge/.test(members) &&
      !/<StandingBadge[^>]*className="[^"']*\bhidden\b/.test(members),
    "standing must not be hidden behind 'hidden sm:'",
  );
});

// ---------------------------------------------------------------------------
// 6. members/[id] — auditable override, admin-gated (member cannot self-edit)
// ---------------------------------------------------------------------------

test("override requires a non-empty reason before it can run", () => {
  // The override handler must guard on a present reason.
  assert.ok(
    /overrideReason\.trim\(\)/.test(memberDetail) || /!\s*overrideReason/.test(memberDetail),
    "override is blocked without a reason",
  );
});

test("override writes a logActivity audit with the reason (standing_overridden)", () => {
  assert.ok(memberDetail.includes("logActivity"), "override calls logActivity");
  assert.ok(memberDetail.includes("standing_overridden"), "audit action is standing_overridden");
  assert.ok(memberDetail.includes("overrideReason"), "the reason is carried into the audit");
});

test("members detail override path is admin-gated (no member-self standing edit)", () => {
  // No path lets a member update their own standing; only admin-gated controls.
  assert.ok(
    memberDetail.includes("canManageMembers") ||
      memberDetail.includes("hasPermission") ||
      memberDetail.includes("isAdmin"),
    "override path is admin-gated",
  );
});

// ---------------------------------------------------------------------------
// 7. NO-SEND guard — passive UI surfaces never reference a send path
// ---------------------------------------------------------------------------

test("read hooks, settings tab, and badge reference NO send path", () => {
  for (const [name, src] of [
    ["use-member-standing", hook],
    ["standing-rules-tab", tab],
    ["standing-badge", badge],
  ]) {
    assert.ok(!/notifyFromClient/.test(src), `${name} must not call notifyFromClient`);
    assert.ok(!/standing-notifications/.test(src), `${name} must not call the standing-notifications route`);
    assert.ok(!/produceStandingChange/.test(src), `${name} must not call the standing change producer`);
  }
});

// ---------------------------------------------------------------------------
// 8. i18n — new standing factor copy exists in BOTH bundles, real French
// ---------------------------------------------------------------------------

test("each STANDING_FACTOR_KEY has a settings label string in BOTH bundles", () => {
  // Tolerant: the exact key name belongs to another agent, so we scan the
  // serialized settings namespace for a per-factor label token rather than a
  // precise key path. Each factor key must surface as a labelled key suffix
  // (e.g. standingFactorDues / factorDues / Factor_dues) in both bundles.
  const enSettings = JSON.stringify(en.settings || {});
  const frSettings = JSON.stringify(fr.settings || {});
  for (const key of EXPECTED_FACTOR_KEYS) {
    const Cap = key.charAt(0).toUpperCase() + key.slice(1);
    const hasLabel = (s) =>
      s.includes(`Factor${Cap}`) ||
      s.includes(`factor${Cap}`) ||
      s.includes(`Factor_${key}`) ||
      s.includes(`standingFactor${Cap}`);
    assert.ok(hasLabel(enSettings), `EN settings has a label for the ${key} factor`);
    assert.ok(hasLabel(frSettings), `FR settings has a label for the ${key} factor`);
  }
});

test("the standing namespace is structurally identical across en/fr", () => {
  // Whatever new standing keys land, both bundles must carry the same leaves.
  const leafPaths = (obj, prefix = "") =>
    Object.entries(obj).flatMap(([k, v]) =>
      v && typeof v === "object" ? leafPaths(v, `${prefix}${k}.`) : [`${prefix}${k}`]);
  assert.ok(en.standing && fr.standing, "both bundles have a standing namespace");
  assert.deepEqual(leafPaths(en.standing).sort(), leafPaths(fr.standing).sort());
});

test("FR standing/settings copy is real French, not copied English", () => {
  // The shared standing breakdown header differs between locales.
  assert.notEqual(en.standing.standingBreakdown, fr.standing.standingBreakdown);
  // And French carries accents somewhere in the settings standing copy.
  const frSettings = JSON.stringify(fr.settings || {});
  assert.match(frSettings, /[éèàçûôîâ]/);
});

// ---------------------------------------------------------------------------
// 9. GUARDRAIL — a future factor cannot silently bypass the toggle model
// ---------------------------------------------------------------------------

test("every factor the engine gates on appears in STANDING_FACTOR_KEYS", () => {
  // Pull every rules.factors["x"] / rules.factors.x reference out of the engine
  // and assert each one is a declared, toggleable factor key. This is the
  // guardrail: a new standing factor must be added to the shared key list (and
  // EXPECTED_FACTOR_KEYS here) — it cannot be wired into the engine alone and
  // thereby bypass the per-group toggle model.
  const used = new Set();
  for (const match of calc.matchAll(/rules\.factors\[\s*["']([a-zA-Z_]+)["']\s*\]/g)) {
    used.add(match[1]);
  }
  for (const match of calc.matchAll(/rules\.factors\.([a-zA-Z_]+)/g)) {
    used.add(match[1]);
  }
  assert.ok(used.size > 0, "engine must gate at least one rule on rules.factors");
  for (const key of used) {
    assert.ok(
      EXPECTED_FACTOR_KEYS.includes(key),
      `factor "${key}" is gated in the engine but missing from STANDING_FACTOR_KEYS`,
    );
  }
});

test("StandingFactorKey union stays in lock-step with EXPECTED_FACTOR_KEYS", () => {
  // If a new factor is added to the contract, this list must be updated too —
  // the failure message tells the next author exactly what to do.
  for (const key of EXPECTED_FACTOR_KEYS) {
    assert.ok(rules.includes(`"${key}"`), `contract dropped factor "${key}"`);
  }
  // Catch a factor added to the contract union but not mirrored here.
  const declared = [...rules.matchAll(/\|\s*"([a-z]+)"/g)].map((x) => x[1]);
  for (const key of declared) {
    assert.ok(
      EXPECTED_FACTOR_KEYS.includes(key),
      `StandingFactorKey "${key}" not mirrored in EXPECTED_FACTOR_KEYS — update this suite`,
    );
  }
});
