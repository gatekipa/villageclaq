import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// ───────────────────────────────────────────────────────────────────────────
// Build 10 — True Contribution Due-Date Calendar + Schedule Engine. Static
// guardrails: one-time gets a real calendar date (start_date); both client
// enroll paths use the schedule engine (no Dec-31 hardcode); flexible types are
// auto-excluded from standing; NO migration; P0 guard + Build-8 dormancy intact.
// ───────────────────────────────────────────────────────────────────────────

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const TYPES = "src/app/[locale]/(dashboard)/dashboard/contributions/page.tsx";
const MEMBERS = "src/app/[locale]/(dashboard)/dashboard/members/page.tsx";
const ENGINE = "src/lib/contribution-schedule.ts";
const PREVIEW = "src/lib/due-date-preview.ts";
const RECORD = "src/app/[locale]/(dashboard)/dashboard/contributions/record/page.tsx";

const types = read(TYPES);
const members = read(MEMBERS);
const engine = read(ENGINE);
const en = JSON.parse(read("messages/en.json"));
const fr = JSON.parse(read("messages/fr.json"));

// ── Engine exists + mirrors the trigger ─────────────────────────────────────

test("schedule engine exists, is pure, and mirrors the trigger clamp + base-month rule", () => {
  assert.ok(/export function computeObligationDueDate/.test(engine), "engine entry exists");
  assert.ok(/Math\.min\(28/.test(engine), "clamp mirrors LEAST(due_day,28)");
  // pure: no supabase / network imports
  assert.ok(!/from "@\/lib\/(supabase|send|notify)/.test(engine), "engine has no I/O imports");
  assert.ok(!/import .* from "@\//.test(engine), "engine is self-contained (directly testable)");
});

// ── Both client enroll paths use the engine — NO Dec-31 hardcode ────────────

test("client enroll paths no longer hardcode Dec 31; they use the schedule engine", () => {
  for (const [name, src] of [["contributions", types], ["members", members]]) {
    assert.ok(!/-12-31/.test(src), `${name} enroll no longer hardcodes Dec 31`);
    assert.ok(/computeObligationDueDate/.test(src), `${name} enroll uses computeObligationDueDate`);
    assert.ok(/due_date: sched\.dueISO/.test(src), `${name} writes the computed due_date`);
    assert.ok(/period_label: sched\.periodLabel/.test(src), `${name} writes the computed period_label`);
  }
  // dedupe by computed due_date, not the buggy period_label=year key
  assert.ok(/\.eq\("due_date", sched\.dueISO\)/.test(types), "contributions dedupes by computed due_date");
  assert.ok(/contribution_type_id\}\|\$\{String\(e\.due_date\)/.test(members), "members dedupes by (type, due_date)");
});

// ── One-time gets a true calendar due date (start_date), no new column ──────

test("one-time contributions get a real calendar date via start_date (no migration)", () => {
  assert.ok(/id="dueDate"[\s\S]{0,120}type="date"/.test(types), "one-time create form has a date picker");
  assert.ok(/id="edit-dueDate"[\s\S]{0,120}type="date"/.test(types), "one-time edit form has a date picker");
  assert.ok(/start_date: formFrequency === "one_time" && formStartDate/.test(types), "create persists start_date for one-time");
  assert.ok(/oneTimeDueDateRequired/.test(types), "one-time requires a due date (no accidental today-date)");
  // the preview shows the exact one-time date
  assert.ok(/kind: "one_time"/.test(read(PREVIEW)), "preview supports the one-time exact-date case");
});

// ── No migration in this build ──────────────────────────────────────────────

test("Build 10 ships NO migration (nothing newer than 00110)", () => {
  const migs = fs.readdirSync(path.join(root, "supabase/migrations"));
  // 00108 + 00109 are Build 15's privacy migrations (applied); Build 10 added none.
  assert.ok(!migs.some((f) => /^\d{5}_/.test(f) && Number(f.slice(0, 5)) > 110), "no migration newer than 00110");
});

// ── Flexible auto-excluded from standing ────────────────────────────────────

test("flexible (variable-amount) types are auto-excluded from standing on BOTH create and edit", () => {
  // The predicate must appear in BOTH the create and edit standing-write paths,
  // so toggling is_flexible on during an edit also excludes the type (regression
  // guard for the edit-path gap the adversarial review caught).
  const matches = (types.match(/!formCountsTowardStanding \|\| formIsFlexible/g) || []).length;
  assert.ok(matches >= 2, `flexible auto-exclusion present in create + edit paths (found ${matches})`);
  assert.ok(/setContributionStandingExclusion/.test(types), "uses the existing exclusion writer (no new schema)");
});

// ── P0 guard intact + Build-8 producer dormant ──────────────────────────────

test("P0 bulk-record receipt guard remains intact", () => {
  const r = read(RECORD);
  assert.ok(/const \[bulkSendReceipts, setBulkSendReceipts\] = useState\(false\)/.test(r), "receipts opt-in default OFF");
  assert.ok(/disabled=\{bulkSubmitting \|\| \(bulkSendReceipts && !bulkReconfirm\)\}/.test(r), "reconfirm gate intact");
  assert.ok(!/onClick=\{handleBulkSave\}/.test(r), "no direct-save path");
});

test("Build-8 announcement producer remains dormant (no live import anywhere in src)", () => {
  function walk(dir) {
    const out = [];
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) out.push(...walk(rel));
      else if (/\.tsx?$/.test(e.name)) out.push(rel);
    }
    return out;
  }
  const dormant = ["@/lib/announcement-producer", "@/lib/announcement-delivery-rollup", "@/lib/announcement-delivery-status-mapping"];
  const allowed = new Set(["src/lib/announcement-producer.ts", "src/lib/announcement-delivery-rollup.ts"]);
  const offenders = [];
  for (const f of walk("src")) {
    if (allowed.has(f)) continue;
    const src = read(f);
    for (const m of dormant) if (src.includes(m)) offenders.push(`${f} -> ${m}`);
  }
  assert.deepEqual(offenders, [], `producer must stay dormant:\n${offenders.join("\n")}`);
});

// ── i18n parity ─────────────────────────────────────────────────────────────

test("new Build-10 i18n keys exist with EN/FR parity", () => {
  const keys = [
    "dueDateLabel", "duePreviewOneTime", "duePreviewOneTimePast",
    "oneTimeDueDatePrompt", "oneTimeDueDateRequired", "cardDueOneTime", "editScheduleNote",
  ];
  for (const k of keys) {
    assert.ok(en.contributions?.[k], `en.contributions.${k} exists`);
    assert.ok(fr.contributions?.[k], `fr.contributions.${k} exists`);
  }
  for (const p of ["{date}", "{days}"]) {
    assert.ok(en.contributions.duePreviewOneTime.includes(p) && fr.contributions.duePreviewOneTime.includes(p), `duePreviewOneTime keeps ${p}`);
  }
});
