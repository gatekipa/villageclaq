import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Guardrails for the cron candidate-query bounds (W4). PostgREST silently
// caps un-limited selects at its max-rows default (1000) with no audit
// trail — every reminder cron must therefore carry explicit, deterministic,
// AUDITED bounds: a stable ordering, a named-constant .limit()/.range(),
// a ceiling console.warn, and a ceiling-hit flag in the response JSON.
// The warns and comments must be HONEST about what a ceiling hit means per
// route — three different regimes exist:
//   - events: genuinely self-paginating (reminder_sent_at flips candidates
//     out), so "deferred to the next run" is true;
//   - subscriptions: the date window slides, so deferral is eventually true;
//   - payment/loan obligations and hosting groups: candidates never leave
//     candidacy by being processed — a plain limit means STARVATION beyond
//     the cut, so hosting paginates groups to exhaustion and payment/loan
//     must say "not processed this run / will starve", never "deferred
//     safely". Idempotency only prevents DUPLICATES on re-selection; it
//     does not advance any cursor.
// These are static guarantees in the style of test-membership-status.mjs.

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const PAYMENT = "src/app/api/cron/payment-reminders/route.ts";
const LOAN = "src/app/api/cron/loan-overdue-reminders/route.ts";
const EVENT = "src/app/api/cron/event-reminders/route.ts";
const HOSTING = "src/app/api/cron/hosting-reminders/route.ts";
const SUBSCRIPTION = "src/app/api/cron/subscription-reminders/route.ts";

// Already-bounded consumers that must STAY bounded (asserted, not modified):
const ANNOUNCEMENTS = "src/app/api/cron/send-scheduled-announcements/route.ts";
const DRAIN = "src/app/api/cron/drain-notification-queue/route.ts";

// Every ceiling warn line contains one of these markers (per-route wording
// differs deliberately — see the honesty taxonomy above).
const WARN_MARKERS = ["ceiling reached", "page cap reached"];

test("payment-reminders: candidate query is ordered, ceiling-limited, warned, and flagged", () => {
  const source = read(PAYMENT);

  assert.match(source, /const CANDIDATE_CEILING = 500;/);

  // Ordering + limit sit ON the candidate query (after the status/due_date
  // filters) — order by due_date then id for a deterministic, stable cut.
  assert.match(
    source,
    /\.in\("status", \["pending", "partial", "overdue"\]\)\s*\.lt\("due_date", now\.toISOString\(\)\.split\("T"\)\[0\]\)\s*\.order\("due_date", \{ ascending: true \}\)\s*\.order\("id", \{ ascending: true \}\)\s*\.limit\(CANDIDATE_CEILING\);/,
    "candidate query must chain order(due_date), order(id), limit(CANDIDATE_CEILING)",
  );

  // Audited: masked one-liner warn + response flag. The warn carries no
  // phone numbers, emails, or raw ids — only the ceiling number.
  // HONEST wording: overdue obligations never leave candidacy by being
  // processed, so the warn must say "not processed / will starve" — a
  // "safely deferred" claim here would be false (deterministic starvation
  // past the ceiling under sustained backlog).
  assert.match(source, /\[Cron:PaymentReminders\] candidate ceiling reached \(\$\{CANDIDATE_CEILING\}\) — obligations beyond the ceiling are NOT processed this run and will starve under a sustained backlog \(see ceilingHit\)/);
  assert.doesNotMatch(source, /remainder deferred to the next run/);
  assert.match(source, /if \(obligations\.length >= CANDIDATE_CEILING\)/);
  assert.match(source, /ceilingHit = true;/);
  // Flag surfaces in the response JSON (camelCase — this route's key style).
  assert.match(source, /whatsappFailed,\s*ceilingHit,/);
});

test("loan-overdue-reminders: candidate query is ordered, ceiling-limited, warned, and flagged", () => {
  const source = read(LOAN);

  assert.match(source, /const CANDIDATE_CEILING = 500;/);
  assert.match(
    source,
    /\.in\("status", \["pending", "partial", "overdue"\]\)\s*\.lt\("due_date", reminderDate\)\s*\.eq\("loans\.status", "repaying"\)\s*\.order\("due_date", \{ ascending: true \}\)\s*\.order\("id", \{ ascending: true \}\)\s*\.limit\(CANDIDATE_CEILING\);/,
    "candidate query must chain order(due_date), order(id), limit(CANDIDATE_CEILING)",
  );
  // HONEST wording (same starvation regime as payment-reminders), plus the
  // installment-vs-loan unit mismatch must be documented.
  assert.match(source, /\[LoanOverdueCron\] candidate ceiling reached \(\$\{CANDIDATE_CEILING\}\) — installments beyond the ceiling are NOT processed this run and will starve under a sustained backlog \(see ceilingHit\)/);
  assert.doesNotMatch(source, /remainder deferred to the next run/);
  assert.match(source, /counts INSTALLMENT rows/);
  assert.match(source, /candidateRows\.length >= CANDIDATE_CEILING/);
  assert.match(source, /ceilingHit = true;/);
  assert.match(source, /whatsappFailed,\s*ceilingHit,/);
});

test("event-reminders: candidate query is ordered, ceiling-limited (200), warned, flagged — and documented as naturally self-paginating", () => {
  const source = read(EVENT);

  assert.match(source, /const CANDIDATE_CEILING = 200;/);
  assert.match(
    source,
    /\.is\("reminder_sent_at", null\)\s*\.order\("starts_at", \{ ascending: true \}\)\s*\.order\("id", \{ ascending: true \}\)\s*\.limit\(CANDIDATE_CEILING\);/,
    "candidate query must chain order(starts_at), order(id), limit(CANDIDATE_CEILING)",
  );
  assert.match(source, /\[Cron:EventReminders\] candidate ceiling reached \(\$\{CANDIDATE_CEILING\}\) — remainder deferred to the next run/);
  assert.match(source, /if \(events\.length >= CANDIDATE_CEILING\)/);
  assert.match(source, /whatsappFailed,\s*ceilingHit,/);

  // This route self-paginates naturally: processed events flip
  // reminder_sent_at and drop out of candidacy — the comment must say so,
  // because that property is what makes the 200 ceiling deferral-safe.
  assert.match(source, /flips reminder_sent_at/);
  assert.match(source, /drops out of candidacy/);
});

test("hosting-reminders: BOTH candidate queries are ordered + ceiling-limited, with per-occurrence masked warns and one response flag", () => {
  const source = read(HOSTING);

  assert.match(source, /const GROUP_CANDIDATE_CEILING = 500;/);
  assert.match(source, /const MAX_GROUP_PAGES = 10;/);
  assert.match(source, /const ASSIGNMENT_CANDIDATE_CEILING = 200;/);

  // Active-groups query: groups never leave candidacy by being processed,
  // so a plain LIMIT would permanently exclude (not defer) groups beyond
  // the cut. The route must PAGINATE to exhaustion with .range(), with the
  // page cap as a runaway backstop only.
  assert.match(
    source,
    /for \(let page = 0; page < MAX_GROUP_PAGES; page\+\+\)/,
    "groups must be fetched in a pagination loop, not a single limited select",
  );
  assert.match(
    source,
    /\.eq\("is_active", true\)\s*\.order\("id", \{ ascending: true \}\)\s*\.range\(from, from \+ GROUP_CANDIDATE_CEILING - 1\);/,
    "groups query must chain order(id), range(from, from + GROUP_CANDIDATE_CEILING - 1)",
  );
  assert.match(source, /if \(!groupPage \|\| groupPage\.length < GROUP_CANDIDATE_CEILING\) break;/);

  // Per-group assignments query: order by assigned_date then id, 200 cap.
  assert.match(
    source,
    /\.order\("assigned_date", \{ ascending: true \}\)\s*\.order\("id", \{ ascending: true \}\)\s*\.limit\(ASSIGNMENT_CANDIDATE_CEILING\);/,
    "assignments query must chain order(assigned_date), order(id), limit(ASSIGNMENT_CANDIDATE_CEILING)",
  );

  // Warn per occurrence; the per-group warn masks the group id to 8 chars
  // via the route's shortId() helper — never the raw uuid. HONEST wording:
  // exhausting the page cap SKIPS groups; assignment saturation gives
  // reduced notice as the window slides (not duplicate-safe "deferral").
  assert.match(source, /\[Cron:HostingReminders\] group page cap reached \(\$\{MAX_GROUP_PAGES\} x \$\{GROUP_CANDIDATE_CEILING\}\) — active groups beyond the cap are SKIPPED this run \(see ceiling_hit\)/);
  assert.match(source, /\[Cron:HostingReminders\] assignment candidate ceiling reached \(\$\{ASSIGNMENT_CANDIDATE_CEILING\}\) for group \$\{shortId\(groupId\)\} — later assignments get reduced notice while the window slides \(see ceiling_hit\)/);
  assert.doesNotMatch(source, /remainder deferred to the next run/);

  // One shared flag is fine — but it must be set on BOTH ceiling paths and
  // surface in the response using this route's snake_case key style.
  const flagAssignments = source.match(/ceilingHit = true;/g) || [];
  assert.equal(flagAssignments.length, 2, "both ceiling checks must set the shared flag");
  assert.match(source, /ceiling_hit: ceilingHit,/);
});

test("subscription-reminders: candidate query is ordered, ceiling-limited, warned, and flagged", () => {
  const source = read(SUBSCRIPTION);

  assert.match(source, /const CANDIDATE_CEILING = 500;/);
  assert.match(
    source,
    /\.gte\("current_period_end", todayStr\)\s*\.lte\("current_period_end", futureStr\)\s*\.order\("current_period_end", \{ ascending: true \}\)\s*\.order\("id", \{ ascending: true \}\)\s*\.limit\(CANDIDATE_CEILING\);/,
    "candidate query must chain order(current_period_end), order(id), limit(CANDIDATE_CEILING)",
  );
  assert.match(source, /\[Cron:SubscriptionReminders\] candidate ceiling reached \(\$\{CANDIDATE_CEILING\}\) — remainder deferred to the next run/);
  assert.match(source, /if \(expiring\.length >= CANDIDATE_CEILING\)/);
  assert.match(source, /whatsappFailed,\s*ceilingHit,/);
});

test("every ceiling route documents WHY — with per-route HONEST semantics", () => {
  for (const rel of [PAYMENT, LOAN, EVENT, HOSTING, SUBSCRIPTION]) {
    const source = read(rel);
    assert.ok(source.includes("PostgREST silently caps"), `${rel} must explain the PostgREST silent-truncation rationale`);
  }
  // Starvation-regime routes must carry the honesty note and must NOT claim
  // deferral safety; keyset pagination is named as the upgrade path.
  for (const rel of [PAYMENT, LOAN]) {
    const source = read(rel);
    assert.ok(source.includes("HONESTY NOTE"), `${rel} must carry the starvation honesty note`);
    assert.ok(!source.includes("Deferral is safe"), `${rel} must not claim deferral is safe — its candidates never leave candidacy`);
    assert.ok(/[Kk]eyset pagination/.test(source), `${rel} must name keyset pagination as the upgrade path at scale`);
  }
  // Hosting paginates groups to exhaustion; the page cap is a runaway
  // backstop and the assignment ceiling documents the reduced-notice
  // sliding-window behavior.
  {
    const source = read(HOSTING);
    assert.ok(source.includes("runaway backstop"), `${HOSTING} must document the page cap as a runaway backstop`);
    assert.ok(source.includes("reduced notice"), `${HOSTING} must document the assignment reduced-notice behavior`);
    assert.ok(!source.includes("Deferral is safe"), `${HOSTING} must not blanket-claim deferral safety`);
  }
  // Genuinely deferral-safe routes keep saying so.
  for (const rel of [EVENT, SUBSCRIPTION]) {
    const source = read(rel);
    assert.ok(source.includes("Deferral is safe"), `${rel} is genuinely deferral-safe (self-paginating / sliding window) and must say so`);
  }
});

test("ceiling warns are masked one-liners — no template literals leaking phones, emails, or unmasked ids", () => {
  for (const rel of [PAYMENT, LOAN, EVENT, HOSTING, SUBSCRIPTION]) {
    const source = read(rel);
    const warnLines = source
      .split("\n")
      .filter((line) => WARN_MARKERS.some((marker) => line.includes(marker)));
    assert.ok(warnLines.length >= 1, `${rel} must warn when its ceiling is reached`);
    for (const line of warnLines) {
      // The only interpolations allowed in a ceiling warn are the named
      // bound constants and the 8-char-masked shortId(...) helper.
      const interpolations = [...line.matchAll(/\$\{([^}]+)\}/g)].map((m) => m[1]);
      for (const expr of interpolations) {
        assert.ok(
          /^[A-Z_]*(CEILING|PAGES)$/.test(expr.trim()) || /^shortId\(/.test(expr.trim()),
          `${rel} ceiling warn may only interpolate bound constants or shortId(...): found \${${expr}}`,
        );
      }
    }
  }
});

test("already-bounded consumers stay bounded: scheduled announcements .limit(50), queue drain BATCH_SIZE", () => {
  // send-scheduled-announcements is allowlisted/deferred per
  // docs/announcements-whatsapp-strategy.md — asserted here, never modified.
  const announcements = read(ANNOUNCEMENTS);
  assert.ok(announcements.includes(".limit(50)"), "scheduled announcements candidate query must keep its .limit(50)");

  // The queue drain's batch bound is its own ceiling — it must keep both
  // the named constant and the .limit() that consumes it.
  const drain = read(DRAIN);
  assert.match(drain, /const BATCH_SIZE = 50;/);
  assert.ok(drain.includes(".limit(BATCH_SIZE)"), "queue drain must keep .limit(BATCH_SIZE)");
});
