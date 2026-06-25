import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Backend Audit Remediation — Batch A (code-only safety fixes):
//   1. Standing overdue date comparison -> timezone-stable date-key compare.
//   2. Subscription-reminder dedup -> written independently of the in_app pref.
//   3. Logging / rule-11 -> safe catches + masked phone logs.
// Repo test style: read sources as text + assert clauses; a behavioural mirror
// for the date math. No sends are made.

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const MONEY = read("src/lib/money.ts");
const STANDING = read("src/lib/calculate-standing.ts");
const SUBS = read("src/app/api/cron/subscription-reminders/route.ts");
const EMAIL = read("src/app/api/email/send/route.ts");
const RECEIPT = read("src/lib/payment-receipt-producer.ts");
const SMS = read("src/app/api/sms/send/route.ts");

// ── (1) Standing overdue date comparison ───────────────────────────────────

test("money.ts adds a UTC-safe addDaysToDateKey helper", () => {
  assert.match(MONEY, /export function addDaysToDateKey\(key: string, days: number\): string/);
  assert.match(MONEY, /T00:00:00Z/, "parses date-only at UTC midnight");
  assert.match(MONEY, /setUTCDate\(d\.getUTCDate\(\) \+ days\)/, "UTC day arithmetic");
  assert.match(MONEY, /toISOString\(\)\.slice\(0, 10\)/, "returns YYYY-MM-DD");
});

test("calculate-standing imports the money date helpers", () => {
  assert.match(STANDING, /import \{[^}]*\bdateKey\b[^}]*\btodayKey\b[^}]*\baddDaysToDateKey\b[^}]*\} from "@\/lib\/money"/s);
});

test("standing dues overdue uses date-key comparison, NOT Date-vs-now", () => {
  // The bug: `new Date(due_date)` (UTC midnight) compared to local `now`.
  assert.doesNotMatch(STANDING, /dueWithGrace\s*<\s*now/, "old tz-unsafe compare removed");
  assert.doesNotMatch(STANDING, /dueWithGrace\.setDate\(/, "old Date mutation removed");
  assert.match(STANDING, /const today = todayKey\(\);/, "today is a date key");
  assert.match(STANDING, /addDaysToDateKey\(dateKey\(o\.due_date as string\), rules\.overdueGraceDays\)/, "grace added on the date key");
  assert.match(STANDING, /dueWithGraceKey < today/, "string date-key comparison");
  assert.match(STANDING, /if \(!o\.due_date\) return false;/, "no due_date => never overdue");
});

test("standing preserves excluded/flexible, waived, and confirmed-only logic", () => {
  assert.match(STANDING, /const excluded = new Set\(rules\.excludedContributionTypeIds\)/, "excluded types still dropped");
  assert.match(STANDING, /excluded\.has\(o\.contribution_type_id as string\)/, "relevant filters excluded types");
  assert.match(STANDING, /computeObligationStates\(/, "confirmed-only engine still used");
  assert.match(STANDING, /\.filter\(\(o\) => \(o\.status as string\) !== "waived"\)/, "waived still excluded from outstanding");
});

// Behavioural mirror of money.ts date helpers (logic asserted identical above).
const dateKey = (d) => (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10));
function addDaysToDateKey(key, days) {
  const d = new Date(`${key.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
// Overdue predicate mirroring the standing dues check.
const isOverdue = (dueDate, graceDays, today) =>
  !!dueDate && addDaysToDateKey(dateKey(dueDate), graceDays) < today;

test("same-day obligation is NOT overdue (the timezone bug)", () => {
  // Due today, 0 grace, today = same date → not overdue regardless of timezone.
  assert.equal(isOverdue("2026-06-25", 0, "2026-06-25"), false);
  // Even with a date-only string that previously parsed as UTC-midnight.
  assert.equal(isOverdue("2026-01-01", 0, "2026-01-01"), false);
});

test("yesterday obligation IS overdue; grace window respected", () => {
  assert.equal(isOverdue("2026-06-24", 0, "2026-06-25"), true);
  // due 3 days ago + 5 grace => grace ends in the future => not overdue.
  assert.equal(isOverdue("2026-06-22", 5, "2026-06-25"), false);
  // due 10 days ago + 5 grace => grace ended => overdue.
  assert.equal(isOverdue("2026-06-15", 5, "2026-06-25"), true);
  // grace boundary exactly today => not yet overdue (key == today, not <).
  assert.equal(isOverdue("2026-06-20", 5, "2026-06-25"), false);
});

test("addDaysToDateKey is timezone-stable across month/year boundaries", () => {
  assert.equal(addDaysToDateKey("2026-06-30", 1), "2026-07-01");
  assert.equal(addDaysToDateKey("2026-12-31", 1), "2027-01-01");
  assert.equal(addDaysToDateKey("2026-06-25", 0), "2026-06-25"); // no drift
  assert.equal(addDaysToDateKey("2026-03-01", -1), "2026-02-28");
});

// ── (2) Subscription-reminder dedup independent of in_app ───────────────────

test("subscription dedup is written even when in_app is disabled", () => {
  assert.match(SUBS, /let inAppDeduped = false;/, "tracks whether in-app wrote the marker");
  assert.match(SUBS, /inAppDeduped = true;/, "set after a successful in-app insert");
  // Fallback marker, gated on NOT having an in-app dedup row.
  assert.match(SUBS, /if \(!inAppDeduped && adminUserIds\.length > 0\)/, "fallback when no in-app marker");
  const fallback = SUBS.slice(SUBS.indexOf("if (!inAppDeduped"), SUBS.indexOf("} catch (err) {\n        failed++"));
  assert.match(fallback, /\.from\("notifications"\)\.insert\(/, "fallback writes a notifications row");
  assert.match(fallback, /dedup_key: dedupKey/, "fallback carries the dedup_key");
  assert.match(fallback, /is_read: true/, "silent ledger row (no badge)");
  assert.match(fallback, /dedup_marker: true/, "flagged as a non-user-facing marker");
});

test("subscription dedup fallback sends nothing (DB insert only)", () => {
  const fallback = SUBS.slice(SUBS.indexOf("if (!inAppDeduped"), SUBS.indexOf("} catch (err) {\n        failed++"));
  assert.doesNotMatch(fallback, /sendEmail|sendSmsNotification|sendWhatsapp|dispatch/i, "no send in the dedup fallback");
});

test("subscription pre-loop dedup CHECK is preserved (no resend when marker exists)", () => {
  assert.match(SUBS, /\.eq\("dedup_key", dedupKey\)/, "dedup check by key");
  assert.match(SUBS, /if \(existing && existing\.length > 0\) continue;/, "skip group if already reminded");
});

// ── (3) Logging / rule-11 ───────────────────────────────────────────────────

test("/api/email/send no longer has an empty catch and logs safely", () => {
  assert.doesNotMatch(EMAIL, /\}\s*catch\s*\{\s*\n\s*return NextResponse/, "no empty catch");
  assert.match(EMAIL, /catch \(err\) \{[\s\S]*console\.warn\("\[Email\] \/api\/email\/send internal error:"/);
  // The console.warn statement itself must log only the error message, never
  // the recipient email or payload (the surrounding comment may mention them).
  const warnLine = EMAIL.split("\n").find((l) => l.includes('console.warn("[Email] /api/email/send internal error:'));
  assert.ok(warnLine, "email error warn line present");
  assert.doesNotMatch(warnLine, /recipientEmail|to:|\bdata\b/, "no recipient/payload in the error log");
});

test("payment-receipt-producer phone-lookup catch logs and fails safe", () => {
  assert.doesNotMatch(RECEIPT, /\} catch \{\s*\n\s*return null;/, "no empty catch in resolveRecipientPhone");
  assert.match(RECEIPT, /catch \(err\) \{[\s\S]*console\.warn\("\[PaymentReceipt\] auth phone lookup failed:"[\s\S]*return null;/);
});

test("/api/sms/send masks recipient phone in every log (no raw phone)", () => {
  assert.match(SMS, /import \{ maskPhoneNumber \} from "@\/lib\/mask-phone"/);
  assert.match(SMS, /function maskRecipient\(/, "recipient mask helper");
  // No console line emits a raw phone/recipient value.
  const consoleLines = SMS.split("\n").filter((l) => /console\.(log|warn|error)/.test(l));
  for (const line of consoleLines) {
    assert.doesNotMatch(line, /\bphone: recipientPhone\b/, `raw recipientPhone logged: ${line.trim()}`);
    assert.doesNotMatch(line, /\bphone: profile\??\.phone\b/, `raw profile phone logged: ${line.trim()}`);
    assert.doesNotMatch(line, /\bto: recipientPhone\b/, `raw recipientPhone in 'to' logged: ${line.trim()}`);
    assert.doesNotMatch(line, /received request", \{ to,/, `raw 'to' logged: ${line.trim()}`);
  }
});

test("no raw phone/email/secret patterns added to the changed log lines", () => {
  for (const [name, src] of [["sms", SMS], ["email", EMAIL], ["receipt", RECEIPT], ["subs", SUBS]]) {
    // crude E.164-ish raw number in a log string
    const logs = src.split("\n").filter((l) => /console\.(log|warn|error)/.test(l));
    for (const l of logs) {
      assert.doesNotMatch(l, /\+\d{7,}/, `${name}: raw E.164 number in a log: ${l.trim()}`);
      // Secret VALUE patterns (not env-var NAME mentions like "SERVICE_ROLE_KEY
      // not configured", which are legitimate diagnostics).
      assert.doesNotMatch(l, /sk_live_|sk_test_|-----BEGIN|Bearer\s+[A-Za-z0-9._-]{12,}/i, `${name}: secret value in a log`);
    }
  }
});

// ── (4) Guard / lockdown preservation ───────────────────────────────────────

test("P0 bulk-receipt confirmed-only guard remains intact", () => {
  assert.match(RECEIPT, /payment\.status !== "confirmed"/, "receipt producer still confirmed-only");
  assert.ok(fs.existsSync(path.join(root, "scripts/test-product-p0-bulk-receipts.mjs")), "P0 suite present");
});

test("Build 8 announcement producer remains dormant (no live route import)", () => {
  const apiDir = path.join(root, "src/app");
  function walk(dir) {
    let hit = false;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) hit = walk(p) || hit;
      else if (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) {
        if (/from "@\/lib\/announcement-producer"/.test(fs.readFileSync(p, "utf8"))) hit = true;
      }
    }
    return hit;
  }
  assert.equal(walk(apiDir), false, "announcement-producer is not imported by any app route");
});

test("/api/admin/query embed lockdown remains intact", () => {
  const route = read("src/app/api/admin/query/route.ts");
  assert.match(route, /import \{ validateSelect, isAllowedColumn \} from "@\/lib\/admin-query-config"/);
  assert.match(route, /validateSelect\(q\.table, q\.select\)/);
  assert.ok(fs.existsSync(path.join(root, "scripts/test-admin-query-security.mjs")), "admin-query suite present");
});
