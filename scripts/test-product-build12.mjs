import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// ───────────────────────────────────────────────────────────────────────────
// Build 12 — Financial Accuracy Cleanup. Static guardrails proving every
// paid/unpaid/owing/overdue DISPLAY surface is routed through the confirmed-only
// money engine (computeObligationStates), and no longer decides paid/unpaid from
// the polluted obligation.amount_paid column or the trigger-driven status. The
// executable math is covered in test-money.mjs; this asserts the wiring.
// ───────────────────────────────────────────────────────────────────────────

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const MONEY = "src/lib/money.ts";
const HOOKS = "src/lib/hooks/use-supabase-query.ts";
const MONEY_OVERVIEW = "src/lib/hooks/use-money-overview.ts";
const STANDING = "src/lib/calculate-standing.ts";
const UNPAID = "src/app/[locale]/(dashboard)/dashboard/contributions/unpaid/page.tsx";
const MATRIX = "src/app/[locale]/(dashboard)/dashboard/contributions/matrix/page.tsx";
const MY_DASH = "src/app/[locale]/(dashboard)/dashboard/my-dashboard/page.tsx";
const MEMBER = "src/app/[locale]/(dashboard)/dashboard/members/[id]/page.tsx";
const REPORTS = "src/app/[locale]/(dashboard)/dashboard/reports/[reportId]/page.tsx";
const RECORD = "src/app/[locale]/(dashboard)/dashboard/contributions/record/page.tsx";

// ── The canonical engine helper exists and partitions by type ───────────────

test("money.ts computeObligationStates exists and partitions by contribution type", () => {
  const m = read(MONEY);
  assert.ok(/export function computeObligationStates/.test(m), "helper exported");
  assert.ok(/contribution_type_id \|\| "__none__"/.test(m), "partitions obligations + payments by type");
  assert.ok(/allocateConfirmedToObligations\(obls, confirmedPaidByMember\(typePayments\)\)/.test(m), "allocates confirmed-by-member within each type");
});

// ── The uncapped confirmed-payment basis hook ───────────────────────────────

test("useGroupDuesPayments is UNCAPPED + dues-scoped + cache-shared with payments", () => {
  const h = read(HOOKS);
  const start = h.indexOf("export function useGroupDuesPayments");
  assert.ok(start >= 0, "hook exists");
  const body = h.slice(start, start + 900);
  assert.ok(!/\.limit\(/.test(body), "no row cap (must not undercount confirmed money)");
  assert.ok(/\.is\("relief_plan_id", null\)/.test(body), "dues only (relief excluded)");
  assert.ok(/queryKey: \["payments", groupId, "all-dues"\]/.test(body), "key shares the ['payments', groupId] invalidation prefix");
});

// ── Each polluted DISPLAY surface now routes through the engine ──────────────

test("unpaid list: confirmed-only (no amount_paid / status paid-unpaid decision)", () => {
  const s = read(UNPAID);
  assert.ok(/computeObligationStates/.test(s) && /useGroupDuesPayments/.test(s), "routes through engine");
  assert.ok(/if \(!c \|\| !c\.isOpen\) continue/.test(s), "includes a member only when confirmed-open");
  assert.ok(!/Number\(obl\.amount_paid\)/.test(s), "no longer reads polluted amount_paid");
  assert.ok(!/status === "paid" \|\| status === "waived"/.test(s), "no longer filters unpaid by polluted status");
});

test("dues matrix: cell paid/partial/unpaid derived from confirmed payments", () => {
  const s = read(MATRIX);
  assert.ok(/computeObligationStates/.test(s) && /useGroupDuesPayments/.test(s), "routes through engine");
  assert.ok(/c \? c\.confirmedPaid : 0/.test(s), "accumulates confirmed paid, not amount_paid");
  assert.ok(!/const paid = Number\(obl\.amount_paid\)/.test(s), "no longer reads polluted amount_paid for cells");
});

test("standing dues factor: behind = confirmed-open, preserving grace + excluded types", () => {
  const s = read(STANDING);
  assert.ok(/computeObligationStates/.test(s), "routes through engine");
  // Old polluted basis removed:
  assert.ok(!/Number\(o\.amount\) - Number\(o\.amount_paid\)/.test(s), "outstanding no longer from amount_paid");
  assert.ok(!/o\.status !== "pending" &&\s*\n?\s*o\.status !== "partial"/.test(s), "overdue no longer from status");
  // Preserved correct sub-logic:
  assert.ok(/excludedContributionTypeIds/.test(s), "excluded/flexible types still skipped");
  assert.ok(/overdueGraceDays/.test(s), "grace days preserved");
  assert.ok(/c\.isOpen/.test(s), "overdue requires confirmed-open");
});

test("useMoneyOverview: overdue/owing/nextDue derived from confirmed payments", () => {
  const s = read(MONEY_OVERVIEW);
  assert.ok(/computeObligationStates/.test(s), "routes through engine");
  assert.ok(!/const paid = Number\(o\.amount_paid\) \|\| 0/.test(s), "no longer reads polluted amount_paid");
  assert.ok(/c\?\.isOverdue/.test(s), "overdue from computed state");
});

test("member detail YoY status: derived from confirmed payments", () => {
  const s = read(MEMBER);
  assert.ok(/computeObligationStates/.test(s), "routes through engine");
  assert.ok(/yoyStates\.get\(obl\.id as string\)/.test(s), "YoY cells read computed state");
  assert.ok(!/set\(dueYear, \{ status: obl\.status as string \}\)/.test(s), "no longer stores polluted obl.status");
});

test("my-dashboard unpaid obligations: confirmed-only", () => {
  const s = read(MY_DASH);
  assert.ok(/computeObligationStates/.test(s), "routes through engine");
  assert.ok(!/const outstanding = Number\(o\.amount\) - Number\(o\.amount_paid/.test(s), "no longer from amount_paid");
  assert.ok(/c && c\.isOpen/.test(s), "unpaid decided by confirmed-open");
});

test("reports who-hasn't-paid / AR-aging / YoY: confirmed-only via uncapped basis", () => {
  const s = read(REPORTS);
  assert.ok(/useGroupDuesPayments/.test(s) && /reportObligationStates/.test(s), "uses uncapped confirmed basis");
  assert.ok(!/\.filter\(\(o: Record<string, unknown>\) => \(o\.status as string\) !== "paid"\)/.test(s), "report filters no longer on polluted status");
  assert.ok(!/matrixByMember\[name\]\[year\]\.paid \+= Number\(ob\.amount_paid \|\| 0\)/.test(s), "YoY paid no longer from amount_paid");
});

// ── Preserved invariants ─────────────────────────────────────────────────────

test("Build-10 due-date engine + buildObjectReport unchanged (reconciliation anchor)", () => {
  const m = read(MONEY);
  assert.ok(/export function buildObjectReport/.test(m), "canonical per-object report intact");
  assert.ok(/export function computeObligation\(/.test(m), "computeObligation (Build-10 due basis) intact");
});

test("P0 bulk-record receipt guard remains intact", () => {
  const r = read(RECORD);
  assert.ok(/const \[bulkSendReceipts, setBulkSendReceipts\] = useState\(false\)/.test(r), "receipts opt-in default OFF");
  assert.ok(/disabled=\{bulkSubmitting \|\| \(bulkSendReceipts && !bulkReconfirm\)\}/.test(r), "reconfirm gate intact");
});

test("record-payment cascade still WRITES amount_paid (column maintained, not display-read)", () => {
  const h = read(HOOKS);
  assert.ok(/amount_paid: newPaid/.test(h), "the write cascade is untouched — Build 12 only changed DISPLAY reads");
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
  const dormant = ["@/lib/announcement-producer", "@/lib/announcement-delivery-rollup", "@/lib/announcement-delivery-status-mapping"];
  const allowed = new Set(["src/lib/announcement-producer.ts", "src/lib/announcement-delivery-rollup.ts"]);
  const offenders = [];
  for (const f of walk("src")) {
    if (allowed.has(f)) continue;
    for (const m of dormant) if (read(f).includes(m)) offenders.push(`${f} -> ${m}`);
  }
  assert.deepEqual(offenders, [], `producer must stay dormant:\n${offenders.join("\n")}`);
});

test("Build 12 ships NO new migration", () => {
  const migs = fs.readdirSync(path.join(root, "supabase/migrations"));
  // 00108 is Build 15's create-not-apply privacy migration; Build 12 added none.
  assert.ok(!migs.some((f) => /^0010[9]/.test(f) || /^001[1-9]\d/.test(f)), "no migration newer than 00108");
});

test("no NEW send dispatch added to the pure engine / display reroutes", () => {
  // money.ts is a pure engine — it must never dispatch.
  const m = read(MONEY);
  for (const ind of ["/api/whatsapp/send", "/api/sms/send", "/api/email/send", "produceAnnouncementDeliveries", "fetch("]) {
    assert.ok(!m.includes(ind), `money.ts has no I/O (${ind})`);
  }
  // The new uncapped hook is a read-only query.
  const h = read(HOOKS);
  const start = h.indexOf("export function useGroupDuesPayments");
  const body = h.slice(start, start + 900);
  for (const ind of ["/api/whatsapp/send", "/api/sms/send", "/api/email/send", "insert(", "update("]) {
    assert.ok(!body.includes(ind), `useGroupDuesPayments is read-only (${ind})`);
  }
});
