import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// ───────────────────────────────────────────────────────────────────────────
// Build 15 — Member Privacy + Financial Report Access Hardening guardrails.
// Static assertions (the gates are React pages / SQL policy; we assert the
// structural invariants that, if regressed, would re-open the holes):
//   - member-detail [id] page has a PAGE-LEVEL permission gate (self OR
//     members/finances view), and the sensitive data hooks live inside the
//     GATED content component so they never mount for an unauthorized viewer;
//   - my-payments stays self-scoped (no URL-param membership);
//   - report-detail + finances pages keep their RequirePermission gate;
//   - migration 00108 exists, is CREATE-NOT-APPLY, scoped to the financial core;
//   - confirmed-only financial correctness is preserved (no amount_paid revert);
//   - P0 bulk-receipt guard intact; Build-8 producer dormant; reminder
//     producer/cron files retain their Build-14 structure (untouched);
//   - no new send/receipt/reminder calls were introduced in changed files.
// ───────────────────────────────────────────────────────────────────────────

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const MEMBER_DETAIL = "src/app/[locale]/(dashboard)/dashboard/members/[id]/page.tsx";
const MY_PAYMENTS = "src/app/[locale]/(dashboard)/dashboard/my-payments/page.tsx";
const REPORT_DETAIL = "src/app/[locale]/(dashboard)/dashboard/reports/[reportId]/page.tsx";
const FINANCES = "src/app/[locale]/(dashboard)/dashboard/finances/page.tsx";
const RECORD = "src/app/[locale]/(dashboard)/dashboard/contributions/record/page.tsx";
const PRODUCER = "src/lib/payment-reminder-producer.ts";
const CRON = "src/app/api/cron/payment-reminders/route.ts";
const MIGRATION = "supabase/migrations/00108_member_privacy_hardening.sql";

// ── Member-detail page-level privacy gate (the core fix) ────────────────────

test("member-detail: default export is a thin GATE wrapper, not the data component", () => {
  const s = read(MEMBER_DETAIL);
  assert.ok(/export default function MemberDetailPage\(\) \{/.test(s), "MemberDetailPage is the default export");
  // The big data component was renamed to MemberDetailContent (gated, not default).
  assert.ok(/\nfunction MemberDetailContent\(\) \{/.test(s), "data component renamed to MemberDetailContent");
  // The wrapper waits for group + permissions to resolve (no Access-Denied flash for self).
  assert.ok(/if \(groupLoading \|\| permsLoading\) return <DashboardSkeleton \/>;/.test(s), "wrapper waits for load");
});

test("member-detail: self-view allowed, otherwise gated by members/finances view permission", () => {
  const s = read(MEMBER_DETAIL);
  // Self (member viewing their own detail) renders directly.
  assert.ok(/currentMembership\?\.id && currentMembership\.id === membershipId/.test(s), "self-view check present");
  // Everyone else must hold a members/finances view permission.
  assert.ok(/<RequirePermission anyOf=\{\["members\.manage", "finances\.view", "finances\.manage"\]\}>/.test(s), "RequirePermission gate present");
});

test("member-detail: sensitive data hooks live INSIDE the gated content (never fetch for unauthorized)", () => {
  const s = read(MEMBER_DETAIL);
  const wrapperStart = s.indexOf("export default function MemberDetailPage()");
  const contentStart = s.indexOf("function MemberDetailContent()");
  assert.ok(wrapperStart >= 0 && contentStart > wrapperStart, "wrapper precedes content");
  const wrapperBody = s.slice(wrapperStart, contentStart);
  // The wrapper must NOT itself fetch payments/obligations — those queries belong
  // to MemberDetailContent, which only mounts when the gate passes.
  assert.ok(!/useMemberPayments\(|useMemberObligations\(|from\("payments"\)/.test(wrapperBody), "wrapper does not fetch sensitive data");
  // The hooks are defined/used in the gated content half.
  assert.ok(/useMemberPayments\(/.test(s.slice(contentStart)) || /from\("payments"\)/.test(s.slice(contentStart)), "data hooks live in gated content");
});

// ── Membership-card peer deep-link gate (review finding) ────────────────────

test("membership-card: viewing a PEER's card (?memberId=) is gated behind members.manage", () => {
  const s = read("src/app/[locale]/(dashboard)/dashboard/membership-card/page.tsx");
  // Self vs other, and the other-view permission.
  assert.ok(/const isOwnCard = !targetMemberId \|\| targetMemberId === currentMembership\?\.id;/.test(s), "self-card check present");
  assert.ok(/const canViewOther = hasPermission\("members\.manage"\);/.test(s), "peer view requires members.manage");
  // The target fetch is disabled unless allowed → no peer data fetched for an unauthorized viewer.
  assert.ok(/const allowTargetFetch = !!targetMemberId && !isOwnCard && canViewOther;/.test(s), "fetch gate computed");
  assert.ok(/useTargetMember\(allowTargetFetch \? targetMemberId : null\)/.test(s), "target fetch gated (null when not allowed)");
  // Unauthorized peer deep-link is blocked with AccessDenied.
  assert.ok(/if \(targetMemberId && !isOwnCard && !canViewOther\) \{[\s\S]{0,260}<AccessDenied \/>/.test(s), "peer deep-link blocked");
});

// ── Self-service stays self-scoped; existing report gates not weakened ──────

test("my-payments stays self-scoped (no URL-param membership)", () => {
  const s = read(MY_PAYMENTS);
  assert.ok(/currentMembership\?\.id/.test(s), "scopes to currentMembership.id");
  assert.ok(!/useParams\(\)/.test(s), "does not read a membership id from the URL");
});

test("report-detail + finances pages keep their RequirePermission gate (not weakened)", () => {
  assert.ok(/<RequirePermission[\s\S]{0,80}(reports\.view|finances\.view|finances\.manage)/.test(read(REPORT_DETAIL)), "report detail gated");
  assert.ok(/<RequirePermission[\s\S]{0,80}finances\.(view|manage)/.test(read(FINANCES)), "finances dashboard gated");
});

// ── Create-not-apply RLS migration ─────────────────────────────────────────

test("migration 00108 exists, is CREATE-NOT-APPLY, scoped to payments + obligations", () => {
  const s = read(MIGRATION);
  assert.ok(/CREATE-NOT-APPLY/.test(s), "migration is marked create-not-apply");
  assert.ok(/DO NOT RUN THIS IN PRODUCTION/.test(s), "explicit do-not-apply warning");
  assert.ok(/CREATE OR REPLACE FUNCTION public\.can_view_member_financial/.test(s), "permission-aware helper defined");
  assert.ok(/DROP POLICY IF EXISTS rls_pay_select ON public\.payments;/.test(s), "tightens payments SELECT");
  assert.ok(/DROP POLICY IF EXISTS rls_co_select ON public\.contribution_obligations;/.test(s), "tightens obligations SELECT");
  // own data OR admin/owner OR finance position permission — matches usePermissions.
  assert.ok(/m\.user_id = auth\.uid\(\)/.test(s) && /is_group_admin_or_owner/.test(s) && /'finances\.view', 'finances\.manage', 'members\.manage'/.test(s), "own-or-officer logic");
  // Exited memberships excluded (matches 00061 pattern; stale officer assignment cannot replay access).
  assert.ok((s.match(/membership_status != 'exited'/g) || []).length >= 2, "exited-member check on own + officer clauses");
  // SELECT-only: write policies are NOT dropped here (Pay Now / record must keep working).
  assert.ok(!/DROP POLICY IF EXISTS rls_pay_insert/.test(s) && !/DROP POLICY IF EXISTS rls_co_insert/.test(s), "write policies untouched");
});

test("Build 15 ships exactly ONE new migration (00108) and does not apply it", () => {
  const migs = fs.readdirSync(path.join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql"));
  const newer = migs.filter((f) => /^001(09|[1-9]\d)/.test(f) || /^0010[9]/.test(f));
  assert.deepEqual(newer, [], "no migration newer than 00108");
  assert.ok(migs.includes("00108_member_privacy_hardening.sql"), "00108 present");
});

// ── Financial correctness preserved (no amount_paid revert) ─────────────────

test("confirmed-only money engine is intact (no amount_paid-based decision reintroduced)", () => {
  const m = read("src/lib/money.ts");
  assert.ok(/export function isConfirmedPayment\(/.test(m), "isConfirmedPayment intact");
  assert.ok(/export function computeObligationStates\(/.test(m), "computeObligationStates intact");
  // The member-detail YoY/standing rendering must still flow through the
  // confirmed-only engine (Build 12) — Build 15 only adds the access gate.
  const md = read(MEMBER_DETAIL);
  assert.ok(/computeObligationStates\(/.test(md), "member-detail still uses the confirmed money engine");
});

// ── Locked invariants ───────────────────────────────────────────────────────

test("P0 bulk-record receipt guard remains intact", () => {
  const r = read(RECORD);
  assert.ok(/const \[bulkSendReceipts, setBulkSendReceipts\] = useState\(false\)/.test(r), "receipts opt-in default OFF");
  assert.ok(/disabled=\{bulkSubmitting \|\| \(bulkSendReceipts && !bulkReconfirm\)\}/.test(r), "reconfirm gate intact");
});

test("reminder producer + cron retain their Build-14 structure (untouched by Build 15)", () => {
  assert.ok(/confirmedBasis\?: boolean/.test(read(PRODUCER)) && /options\.dryRun/.test(read(PRODUCER)), "producer Build-14 shape intact");
  assert.ok(/PAYMENT_REMINDER_CONFIRMED_BASIS === "true"/.test(read(CRON)) && /wouldWhatsapp/.test(read(CRON)), "cron Build-14 shape intact");
});

test("Build-8 announcement producer remains dormant (no live import in src)", () => {
  function walk(dir) {
    const out = [];
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) out.push(...walk(rel));
      else if (/\.tsx?$/.test(e.name)) out.push(rel);
    }
    return out;
  }
  const dormant = ["@/lib/announcement-producer", "@/lib/announcement-delivery-rollup"];
  const allowed = new Set(["src/lib/announcement-producer.ts", "src/lib/announcement-delivery-rollup.ts"]);
  const offenders = [];
  for (const f of walk("src")) {
    if (allowed.has(f)) continue;
    for (const m of dormant) if (read(f).includes(m)) offenders.push(`${f} -> ${m}`);
  }
  assert.deepEqual(offenders, [], `producer must stay dormant:\n${offenders.join("\n")}`);
});

test("member-detail change introduces no new send/receipt/reminder call", () => {
  const md = read(MEMBER_DETAIL);
  assert.ok(!/sendEmail\(|sendSmsNotification\(|produce\w*Notification\(|notifications_queue/.test(md), "no messaging path added to member detail");
});
