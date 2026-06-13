import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Static guardrails for the Events page product-sprint changes:
// reminder transparency, the datetime-local timezone fix, upcoming/past
// filter semantics, friendly errors (no raw Supabase text in the UI),
// FR title display, and the past-edit guard. Style matches
// scripts/test-membership-status.mjs — read files as text, assert clause
// presence/absence.

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const PAGE = "src/app/[locale]/(dashboard)/dashboard/events/page.tsx";
const page = read(PAGE);

// ---------------------------------------------------------------------------
// 1. Edit timezone bug (headline): datetime-local prefills must be LOCAL.
// ---------------------------------------------------------------------------

test("toDatetimeLocal helper exists and pads with local date parts", () => {
  assert.match(page, /function toDatetimeLocal\(date: Date\)/);
  assert.match(page, /getFullYear\(\)/);
  assert.match(page, /getMonth\(\) \+ 1/);
  // The helper must be used for BOTH the edit prefill and repeat-last-meeting.
  const uses = page.match(/toDatetimeLocal\(/g) || [];
  assert.ok(uses.length >= 5, `expected >=5 toDatetimeLocal references (definition + 4 call sites), got ${uses.length}`);
});

test("no datetime-local prefill goes through toISOString().slice (UTC shift bug)", () => {
  // Strip comments first — the toDatetimeLocal doc comment legitimately
  // names the anti-pattern; only executable code must be free of it.
  const code = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /toISOString\(\)\.slice\(0,\s*16\)/, "toISOString().slice(0, 16) renders UTC into a local input — must use toDatetimeLocal");
});

// ---------------------------------------------------------------------------
// 2. Upcoming/past filter semantics.
// ---------------------------------------------------------------------------

test("upcoming filter = starts_at >= now AND not cancelled; past = starts_at < now", () => {
  assert.match(page, /filter === "upcoming"\) return \(e\.starts_at as string\) >= now && e\.status !== "cancelled"/);
  assert.match(page, /filter === "past"\) return \(e\.starts_at as string\) < now;/);
  // Nothing ever writes status "completed" — the predicate must not rely on it.
  assert.doesNotMatch(page, /e\.status === "completed"/);
  assert.doesNotMatch(page, /e\.status === "upcoming"/);
});

test("default sort is date ascending (soonest first) for the default upcoming filter", () => {
  assert.match(page, /useState<"asc" \| "desc">\("asc"\)/);
  // Filter buttons reset the date-sort default: upcoming -> asc, past -> desc.
  assert.match(page, /setFilter\("upcoming"\);\s*\n\s*\/\/[^\n]*\n\s*if \(sortField === "date"\) setSortDir\("asc"\);/);
  assert.match(page, /setFilter\("past"\);\s*\n\s*\/\/[^\n]*\n\s*if \(sortField === "date"\) setSortDir\("desc"\);/);
});

test("filteredEvents memo computes now inside the body and keeps it out of deps (rule 9)", () => {
  const memoMatch = page.match(/const filteredEvents = useMemo\(\(\) => \{([\s\S]*?)\}, \[([^\]]*)\]\);/);
  assert.ok(memoMatch, "filteredEvents useMemo must exist");
  assert.match(memoMatch[1], /const now = new Date\(\)\.toISOString\(\);/, "now must be computed inside the memo body");
  assert.doesNotMatch(memoMatch[2], /\bnow\b/, "now must NOT appear in the memo deps");
});

// ---------------------------------------------------------------------------
// 3. Reminder transparency.
// ---------------------------------------------------------------------------

test("create/edit dialog carries the automatic-reminder hint", () => {
  assert.match(page, /\{t\("reminderHint"\)\}/);
});

test("event cards show the reminder-sent badge keyed on reminder_sent_at", () => {
  assert.match(page, /event\.reminder_sent_at \?/);
  assert.match(page, /\{t\("reminderSent"\)\}/);
});

// ---------------------------------------------------------------------------
// 4. Location optional clarity.
// ---------------------------------------------------------------------------

test("location label is marked optional and carries the fallback microcopy", () => {
  assert.match(page, /\{t\("location"\)\}[\s\S]{0,200}?\(\{tc\("optional"\)\}\)/);
  assert.match(page, /\{t\("locationHint"\)\}/);
});

// ---------------------------------------------------------------------------
// 5. Friendly errors — no raw Supabase/Postgres text in the UI.
// ---------------------------------------------------------------------------

test("no showError site passes raw err.message; raw errors are console.warn'd", () => {
  assert.doesNotMatch(page, /showError\(\(err as Error\)\.message/);
  assert.doesNotMatch(page, /showError\([^)]*\.message/);
  assert.match(page, /console\.warn\("\[Events\] create failed:", err\)/);
  assert.match(page, /console\.warn\("\[Events\] update failed:", err\)/);
  assert.match(page, /console\.warn\("\[Events\] cancel failed:", err\)/);
  assert.match(page, /console\.warn\("\[Events\] delete failed:", err\)/);
  assert.match(page, /console\.warn\("\[Events\] RSVP update failed:", err\)/);
  // Generic translated copy replaces the raw message at every action site.
  const actionFailedUses = page.match(/showError\(t\("actionFailed"\)\)/g) || [];
  assert.ok(actionFailedUses.length >= 4, `expected >=4 showError(t("actionFailed")) sites, got ${actionFailedUses.length}`);
});

test("ErrorState no longer receives the raw load error message", () => {
  assert.doesNotMatch(page, /<ErrorState message=/);
  assert.match(page, /console\.warn\("\[Events\] load failed:", error\)/);
});

test("no empty catch blocks remain (rule 11)", () => {
  // The best-effort cancellation-notification catch must log.
  assert.doesNotMatch(page, /catch \{ \/\* best-effort/);
  assert.match(page, /console\.warn\("\[Events\] cancellation notification insert failed:", notifErr\)/);
});

// ---------------------------------------------------------------------------
// 6. Member empty state branches on events.manage.
// ---------------------------------------------------------------------------

test("no-events description branches for members without events.manage", () => {
  assert.match(page, /hasPermission\("events\.manage"\)\s*\n?\s*\? t\("noEventsDesc"\)\s*\n?\s*: t\("noEventsMemberDesc"\)/);
});

// ---------------------------------------------------------------------------
// 7. FR title display.
// ---------------------------------------------------------------------------

test("displayTitle helper prefers title_fr for FR locale and is used in cards and calendar chips", () => {
  assert.match(page, /const displayTitle = \(event: Record<string, unknown>\) =>/);
  assert.match(page, /locale === "fr"/);
  assert.match(page, /<h3 className="font-semibold">\{displayTitle\(event\)\}<\/h3>/);
  assert.match(page, /\{timeStr\}<\/span>\{" "\}\{displayTitle\(event\)\}/);
  // The old raw renders are gone.
  assert.doesNotMatch(page, /<h3 className="font-semibold">\{event\.title as string\}<\/h3>/);
});

// ---------------------------------------------------------------------------
// 8. Recurring hint honesty.
// ---------------------------------------------------------------------------

test("recurring toggle uses the manual-semantics hint", () => {
  assert.match(page, /\{t\("recurringHintManual"\)\}/);
  assert.doesNotMatch(page, /\{t\("recurringHint"\)\}/, "old recurringHint copy overpromised automation");
});

// ---------------------------------------------------------------------------
// 9. Past-edit guard only fires when starts_at changed.
// ---------------------------------------------------------------------------

test("edit guard compares against the original starts_at before blocking past dates", () => {
  assert.match(page, /const \[editOriginalStartsAt, setEditOriginalStartsAt\] = useState<string \| null>\(null\)/);
  assert.match(page, /setEditOriginalStartsAt\(localStartsAt\)/);
  assert.match(page, /const startsAtChanged = formStartsAt !== editOriginalStartsAt;/);
  assert.match(page, /if \(startsAtChanged && new Date\(formStartsAt\) < new Date\(\)\)/);
  // The create path still blocks past dates unconditionally.
  assert.match(page, /if \(new Date\(formStartsAt\) < new Date\(\)\) \{\s*\n\s*showError\(t\("pastDateError"\)\)/);
});

// ---------------------------------------------------------------------------
// 10. Header action row wraps at 375px.
// ---------------------------------------------------------------------------

test("admin header action row allows wrapping on narrow screens", () => {
  const headerMatch = page.match(/hasPermission\("events\.manage"\) && \(\s*\n\s*<div className="([^"]+)">\s*\n\s*<Button variant="outline" onClick=\{handleRepeatLastMeeting\}/);
  assert.ok(headerMatch, "header action row must exist");
  assert.ok(headerMatch[1].includes("flex-wrap"), "header action row must include flex-wrap");
});

// ---------------------------------------------------------------------------
// 11. i18n — existing keys reused must be present in BOTH bundles; new keys
// are requested via i18nKeysNeeded, so only their t() references are pinned.
// ---------------------------------------------------------------------------

test("reused existing i18n keys are present in both bundles", () => {
  const en = JSON.parse(read("messages/en.json"));
  const fr = JSON.parse(read("messages/fr.json"));
  for (const bundle of [en, fr]) {
    assert.ok(bundle.common.optional, "common.optional must exist");
    assert.ok(bundle.events.rsvpFailed, "events.rsvpFailed must exist");
    assert.ok(bundle.events.pastDateError, "events.pastDateError must exist");
    assert.ok(bundle.events.noEventsDesc, "events.noEventsDesc must exist");
    assert.ok(bundle.common.errorTitle, "common.errorTitle must exist (ErrorState fallback)");
    assert.ok(bundle.common.errorDesc, "common.errorDesc must exist (ErrorState fallback)");
  }
});

test("new sprint keys landed in BOTH bundles (no runtime missing-message regressions)", () => {
  const en = JSON.parse(read("messages/en.json"));
  const fr = JSON.parse(read("messages/fr.json"));
  for (const bundle of [en, fr]) {
    for (const key of ["reminderHint", "reminderSent", "locationHint", "actionFailed", "noEventsMemberDesc", "recurringHintManual"]) {
      assert.equal(typeof bundle.events?.[key], "string", `events.${key} must exist in both bundles`);
      assert.ok(bundle.events[key].length > 0, `events.${key} must be non-empty`);
    }
  }
});

test("requested new keys are referenced through t() in the page (no hardcoded strings)", () => {
  for (const key of ["reminderHint", "reminderSent", "locationHint", "actionFailed", "noEventsMemberDesc", "recurringHintManual"]) {
    assert.ok(page.includes(`t("${key}")`), `page must reference t("${key}")`);
  }
  // None of the new EN copy is hardcoded in the page.
  assert.doesNotMatch(page, /Reminder sent|reminded automatically|Location to be announced|check back soon/);
});
