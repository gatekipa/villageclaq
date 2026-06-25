import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { fileURLToPath } from "node:url";
import * as moneyEngine from "../src/lib/money.ts";

// ───────────────────────────────────────────────────────────────────────────
// Build 14 — Send-Aware Reminder Producer Accuracy. Verifies the producer's
// CONFIRMED-BASIS path + DRY-RUN posture: pending/rejected never suppress a
// reminder, confirmed covers/suppresses correctly, waived + flexible/excluded
// types are never reminded, and dryRun creates NO queue row. Plus static
// guardrails that the default (legacy) path is unchanged, no migration ships,
// the P0 guard + Build-8 dormancy hold, and old failed rows are never retried.
// (The confirmed decision MATH is proven in test-reminder-basis.mjs.)
// ───────────────────────────────────────────────────────────────────────────

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const require = createRequire(import.meta.url);

const PRODUCER = "src/lib/payment-reminder-producer.ts";
const CRON = "src/app/api/cron/payment-reminders/route.ts";
const RECORD = "src/app/[locale]/(dashboard)/dashboard/contributions/record/page.tsx";
const DRAIN = "src/app/api/cron/drain-notification-queue/route.ts";

const ids = {
  obligation: "11111111-1111-4111-8111-111111111111",
  membership: "77777777-7777-4777-8777-777777777777",
  user: "88888888-8888-4888-8888-888888888888",
  group: "99999999-9999-4999-8999-999999999999",
  type: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};
const PHONE = "+13014335857";
const REMINDER_DATE = "2026-06-15";

function loadProducerWithRequire() {
  const compiled = ts.transpileModule(read(PRODUCER), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const cjs = { exports: {} };
  const localRequire = (id) => {
    if (id === "@/lib/currencies") return { formatAmount: (a, c) => `${Number(a).toLocaleString("en-US")} ${c}` };
    if (id === "@/lib/format-phone-whatsapp") return { formatPhoneForWhatsApp: (p) => { if (!p) return null; const c = String(p).replace(/\D/g, ""); return c.length >= 7 && c.length <= 15 ? c : null; } };
    if (id === "@/lib/mask-phone") return { maskPhoneNumber: () => "+***" };
    if (id === "@/lib/get-member-name") return { getMemberName: (r) => r?.display_name || r?.profile?.full_name || "Member" };
    if (id === "@/lib/notification-prefs") return { getEnabledChannels: async () => ({ in_app: true, email: true, sms: true, whatsapp: true, push: false }) };
    if (id === "@/lib/whatsapp-templates") return { WA_TEMPLATES: { PAYMENT_REMINDER: "villageclaq_payment_reminder_v2" } };
    if (id === "@/lib/money") return moneyEngine;
    return require(id);
  };
  vm.runInNewContext(compiled, { console, exports: cjs.exports, module: cjs, require: localRequire }, { filename: "producer.ts" });
  return cjs.exports;
}

// Mock Supabase supporting BOTH legacy single-obligation lookups and the
// confirmed-basis multi-fetch (same-type obligations, payments, type, group).
function createMock(opts = {}) {
  const obligation = {
    id: ids.obligation, contribution_type_id: ids.type, membership_id: ids.membership,
    group_id: ids.group, amount: "1000", amount_paid: opts.amount_paid ?? "0",
    currency: "XAF", due_date: "2026-06-01", status: opts.status ?? "pending",
  };
  const state = {
    obligation,
    obligationsForMember: opts.obligationsForMember || [
      { id: ids.obligation, amount: "1000", status: obligation.status, due_date: "2026-06-01", membership_id: ids.membership, contribution_type_id: ids.type },
    ],
    payments: opts.payments || [],
    membership: { id: ids.membership, group_id: ids.group, user_id: ids.user, display_name: "Jude", is_proxy: false, phone: PHONE, privacy_settings: {}, membership_status: "active" },
    profile: { id: ids.user, full_name: "Jude", phone: PHONE, preferred_locale: "en" },
    group: { id: ids.group, name: "Njanga", settings: opts.groupSettings || {} },
    contributionType: { id: ids.type, name: "Dues", name_fr: "Cotisation", is_flexible: opts.is_flexible ?? false },
    existingQueueRows: opts.existingQueueRows || [],
  };
  const inserts = [];
  class B {
    constructor(t) { this.t = t; this.f = []; this.op = "select"; }
    select(c) { this.c = c; return this; }
    insert(p) { this.op = "insert"; inserts.push({ table: this.t, payload: p }); return this; }
    eq(col, val) { this.f.push({ col, val }); return this; }
    is() { return this; }
    in() { return this; }
    lt() { return this; }
    neq() { return this; }
    order() { return this; }
    limit() { return this; }
    maybeSingle() { return Promise.resolve({ data: this.op === "insert" ? { id: "new" } : rowFor(this.t, this.f, state, "single"), error: null }); }
    single() { return this.maybeSingle(); }
    then(res) {
      if (this.op === "insert") return Promise.resolve(res({ data: [{ id: "new" }], error: null }));
      return Promise.resolve(res({ data: rowFor(this.t, this.f, state, "array"), error: null }));
    }
  }
  return {
    inserts,
    auth: { admin: { async getUserById() { return { data: { user: null }, error: null }; } } },
    from(t) { return new B(t); },
  };
}

function fval(f, col) { return f.find((x) => x.col === col)?.val; }

function rowFor(table, f, state, mode) {
  if (table === "contribution_obligations") {
    // Legacy single lookup is by id; confirmed same-type query is by membership_id.
    if (fval(f, "id")) return mode === "array" ? [state.obligation] : state.obligation;
    if (fval(f, "membership_id")) return mode === "array" ? state.obligationsForMember : state.obligationsForMember[0];
    return mode === "array" ? [] : null;
  }
  if (table === "payments") return mode === "array" ? state.payments : (state.payments[0] || null);
  if (table === "memberships") return mode === "array" ? [state.membership] : state.membership;
  if (table === "profiles") return mode === "array" ? [state.profile] : state.profile;
  if (table === "groups") return mode === "array" ? [state.group] : state.group;
  if (table === "contribution_types") return mode === "array" ? [state.contributionType] : state.contributionType;
  if (table === "notifications_queue") {
    const oid = fval(f, "data->>obligationId"); const rd = fval(f, "data->>reminderDate");
    const m = state.existingQueueRows.find((r) => r.obligationId === oid && r.reminderDate === rd);
    return m ? (mode === "array" ? [{ id: "existing", status: "queued" }] : { id: "existing", status: "queued" }) : (mode === "array" ? [] : null);
  }
  return mode === "array" ? [] : null;
}

const producer = loadProducerWithRequire();
const run = (mock, options) => producer.producePaymentReminderNotification(mock, ids.obligation, { reminderDate: REMINDER_DATE, ...options });
const pay = (amount, status) => ({ id: "p" + amount, amount, status, obligation_id: null, contribution_type_id: ids.type, membership_id: ids.membership, relief_plan_id: null });

// ── Confirmed-basis eligibility (producer integration) ──────────────────────

test("confirmedBasis: a PENDING payment does NOT suppress the reminder (still queued)", async () => {
  const mock = createMock({ status: "partial", amount_paid: "1000", payments: [pay("1000", "pending_confirmation")] });
  const r = await run(mock, { confirmedBasis: true });
  assert.equal(r.status, "queued", "pending money never marks confirmed-paid → still reminded");
  assert.equal(mock.inserts.length, 1);
});

test("confirmedBasis: a REJECTED payment does NOT suppress the reminder", async () => {
  const mock = createMock({ status: "paid", amount_paid: "1000", payments: [pay("1000", "rejected")] });
  const r = await run(mock, { confirmedBasis: true });
  assert.equal(r.status, "queued", "polluted status='paid' but confirmed says owes → reminded");
});

test("confirmedBasis: a CONFIRMED payment that covers the obligation skips the reminder", async () => {
  const mock = createMock({ status: "pending", payments: [pay("1000", "confirmed")] });
  const r = await run(mock, { confirmedBasis: true });
  assert.equal(r.status, "skipped");
  assert.equal(r.reason, "obligation_settled_confirmed");
  assert.equal(mock.inserts.length, 0, "no queue row for a settled obligation");
});

test("confirmedBasis: a WAIVED obligation is never reminded", async () => {
  const mock = createMock({ status: "waived", obligationsForMember: [{ id: ids.obligation, amount: "1000", status: "waived", due_date: "2026-06-01", membership_id: ids.membership, contribution_type_id: ids.type }] });
  const r = await run(mock, { confirmedBasis: true });
  assert.equal(r.status, "skipped");
  assert.equal(mock.inserts.length, 0);
});

test("confirmedBasis: a FLEXIBLE contribution type is never reminded", async () => {
  const mock = createMock({ status: "pending", is_flexible: true, payments: [] });
  const r = await run(mock, { confirmedBasis: true });
  assert.equal(r.status, "skipped");
  assert.equal(r.reason, "flexible_or_excluded");
  assert.equal(mock.inserts.length, 0);
});

test("confirmedBasis: a standing-EXCLUDED contribution type is never reminded", async () => {
  const mock = createMock({ status: "pending", payments: [], groupSettings: { standing_rules: { excluded_contribution_type_ids: [ids.type] } } });
  const r = await run(mock, { confirmedBasis: true });
  assert.equal(r.status, "skipped");
  assert.equal(r.reason, "flexible_or_excluded");
});

test("confirmedBasis: a typeless payment spreads across the member's OTHER-type obligations (not over-credited)", async () => {
  // Member owes Type A (older, 1000) + Type B = target (newer, 1000); one
  // type-less confirmed payment of 1500. Oldest-due-first: A fully covered, B
  // left owing 500. The producer must fetch ALL the member's obligations (not
  // just Type B) so the engine spreads the pool correctly — a same-type-only
  // fetch would credit the whole 1500 to B and wrongly suppress the reminder.
  const otherType = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const mock = createMock({
    status: "pending",
    obligationsForMember: [
      { id: "older-A", amount: "1000", status: "pending", due_date: "2026-01-01", membership_id: ids.membership, contribution_type_id: otherType },
      { id: ids.obligation, amount: "1000", status: "pending", due_date: "2026-05-01", membership_id: ids.membership, contribution_type_id: ids.type },
    ],
    payments: [{ id: "pTypeless", amount: "1500", status: "confirmed", obligation_id: null, contribution_type_id: null, membership_id: ids.membership, relief_plan_id: null }],
  });
  const r = await run(mock, { confirmedBasis: true, dryRun: true });
  assert.equal(r.status, "queued", "Type B still owes 500 → eligible");
  assert.equal(r.confirmedRemaining, 500, "typeless 1500 covers older Type A (1000) first, leaving 500 on B — NOT 0");
  assert.equal(mock.inserts.length, 0);
});

// ── Dry-run posture: computes the decision but inserts NOTHING ───────────────

test("dryRun (confirmedBasis): would queue but creates NO queue row", async () => {
  const mock = createMock({ status: "pending", payments: [pay("400", "confirmed")] });
  const r = await run(mock, { confirmedBasis: true, dryRun: true });
  assert.equal(r.status, "queued");
  assert.equal(r.dryRun, true);
  assert.equal(r.whatsappQueued, false);
  assert.equal(r.confirmedRemaining, 600, "preview reports the confirmed remaining");
  assert.equal(mock.inserts.length, 0, "DRY RUN must not insert a queue row");
});

test("dryRun (legacy basis): would queue but creates NO queue row", async () => {
  const mock = createMock({ status: "pending", amount_paid: "0" });
  const r = await run(mock, { dryRun: true });
  assert.equal(r.dryRun, true);
  assert.equal(mock.inserts.length, 0, "DRY RUN must not insert even on the legacy basis");
});

// ── Legacy default path is byte-for-byte unchanged (no confirmedBasis) ──────

test("default (legacy) basis still queues a pending obligation and reads amount_paid", async () => {
  const mock = createMock({ status: "pending", amount_paid: "0" });
  const r = await run(mock, {});
  assert.equal(r.status, "queued");
  assert.equal(mock.inserts.length, 1);
});

// ── Static guardrails ────────────────────────────────────────────────────────

test("producer: confirmedBasis + dryRun are flag-gated; legacy default unchanged", () => {
  const s = read(PRODUCER);
  assert.ok(/confirmedBasis\?: boolean/.test(s) && /dryRun\?: boolean/.test(s), "options added");
  assert.ok(/const confirmedBasis = options\.confirmedBasis === true/.test(s), "confirmedBasis defaults false");
  assert.ok(/computeReminderDecisionFor\(/.test(s) || /computeConfirmedReminderDecision\(/.test(s), "routes through the money engine");
  // legacy gate still present (only used when !confirmedBasis):
  assert.ok(/REMINDABLE_STATUSES\.has\(obligation\.status\)/.test(s), "legacy status gate preserved");
  assert.ok(/Number\(obligation\.amount\) - Number\(obligation\.amount_paid \|\| 0\)/.test(s), "legacy amount preserved");
  // dry-run never inserts:
  assert.ok(/if \(options\.dryRun\)[\s\S]{0,400}whatsappQueued: false/.test(s), "dryRun returns before the insert");
  // day-bucket idempotency unchanged (existence check still blocks re-enqueue):
  assert.ok(/if \(existingQueue\)/.test(s), "day-bucket idempotency preserved");
});

test("producer: confirmed-basis fetch is member+group scoped (all types) — typeless allocation correct", () => {
  const s = read(PRODUCER);
  const helper = s.slice(s.indexOf("async function computeConfirmedReminderDecision"));
  const oblFetch = helper.slice(helper.indexOf('.from("contribution_obligations")'), helper.indexOf('.from("payments")'));
  // obligations fetched for the member+group across ALL types (no type filter) so
  // the engine's typeless pool spreads correctly (review finding #1).
  assert.ok(/\.eq\("membership_id", obligation\.membership_id\)/.test(oblFetch) && /\.eq\("group_id", obligation\.group_id\)/.test(oblFetch), "obligations scoped member+group");
  assert.ok(!/\.eq\("contribution_type_id"/.test(oblFetch), "obligations NOT filtered to a single type");
  // payments carry the defensive group_id filter (review finding #3).
  const payFetch = helper.slice(helper.indexOf('.from("payments")'), helper.indexOf('.from("contribution_types")'));
  assert.ok(/\.eq\("membership_id", obligation\.membership_id\)\s*\.eq\("group_id", obligation\.group_id\)\s*\.is\("relief_plan_id", null\)/.test(payFetch), "payments scoped member+group, dues-only");
});

test("cron: confirmed basis + dry-run gated; default selection/amount unchanged", () => {
  const s = read(CRON);
  assert.ok(/PAYMENT_REMINDER_CONFIRMED_BASIS === "true"/.test(s), "env flag, default OFF");
  assert.ok(/const dryRun = new URL\(request\.url\)\.searchParams\.get\("dryRun"\) === "true"/.test(s), "?dryRun=true");
  assert.ok(/computeReminderDecisions\(/.test(s), "confirmed decisions computed");
  // legacy selection + amount preserved (used when !useConfirmed):
  assert.ok(/\.in\("status", \["pending", "partial", "overdue"\]\)/.test(s), "legacy status filter preserved");
  assert.ok(/Number\(o\.amount\) - Number\(o\.amount_paid \|\| 0\)/.test(s), "legacy amount preserved");
  // dry-run suppresses real sends:
  assert.ok(/if \(dryRun\) \{\s*\n\s*wouldEmail\+\+/.test(s), "dry-run counts email instead of sending");
  assert.ok(/if \(dryRun\) \{\s*\n\s*wouldSms\+\+/.test(s), "dry-run counts SMS instead of sending");
  // confirmed payments fetch carries the defensive group_id filter (finding #4).
  assert.ok(/\.in\("membership_id", membershipIds\)\s*\n\s*\/\/[^\n]*\n\s*\.in\("group_id", candidateGroupIds\)/.test(s), "cron payments scoped by group");
  // confirmed-basis data fetch fails loud, not silent (mitigated finding / rule 11).
  assert.ok(/if \(paysRes\.error \|\| groupsRes\.error\)/.test(s), "confirmed fetch error handled");
  // dry-run WhatsApp previews are counted as wouldWhatsapp, never as queued (finding #2).
  assert.ok(/let wouldWhatsapp = 0;/.test(s), "wouldWhatsapp counter exists");
  assert.ok(/r\.value\.status === "queued" && r\.value\.dryRun\) \{[\s\S]{0,320}wouldWhatsapp\+\+/.test(s), "dry-run queued previews counted as wouldWhatsapp");
  assert.ok(/\n\s*wouldWhatsapp,/.test(s), "wouldWhatsapp surfaced in the response");
});

test("cron: proxy memberships are excluded BEFORE the candidate ceiling (both branches); JS filter retained", () => {
  const s = read(CRON);
  // DB-level proxy pre-filter frees the 500-row ceiling for real members — on
  // BOTH the legacy and confirmed candidate-query branches.
  const proxyFilter = s.match(/\.not\("membership\.user_id", "is", null\)\s*\.not\("membership\.is_proxy", "is", true\)/g) || [];
  assert.equal(proxyFilter.length, 2, "proxy pre-filter must be on both candidate-query branches");
  // The filter sits before the row cap on each branch.
  assert.ok(/\.not\("membership\.is_proxy", "is", true\)[\s\S]*?\.limit\(CANDIDATE_CEILING\)/.test(s), "proxy filter precedes the ceiling");
  // Real-member behavior is unchanged: the post-fetch realObligations filter is
  // retained as defense-in-depth (DB filter is a pure optimization, same semantics).
  assert.ok(/const realObligations = obligations\.filter/.test(s), "realObligations JS filter retained");
  assert.ok(/m\.user_id && !m\.is_proxy/.test(s), "JS filter still requires a real, non-proxy membership");
});

test("drain cron retries ONLY queued rows — old failed reminder rows are never retried", () => {
  const d = read(DRAIN);
  assert.ok(/\.eq\("status", "queued"\)/.test(d), "drain selects only status='queued'");
  assert.ok(!/\.eq\("status", "failed"\)/.test(d), "drain never re-fetches failed rows");
});

test("P0 bulk-record receipt guard remains intact", () => {
  const r = read(RECORD);
  assert.ok(/const \[bulkSendReceipts, setBulkSendReceipts\] = useState\(false\)/.test(r), "receipts opt-in default OFF");
  assert.ok(/disabled=\{bulkSubmitting \|\| \(bulkSendReceipts && !bulkReconfirm\)\}/.test(r), "reconfirm gate intact");
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
  for (const fpath of walk("src")) {
    if (allowed.has(fpath)) continue;
    for (const m of dormant) if (read(fpath).includes(m)) offenders.push(`${fpath} -> ${m}`);
  }
  assert.deepEqual(offenders, [], `producer must stay dormant:\n${offenders.join("\n")}`);
});

test("Build 14 ships NO new migration", () => {
  const migs = fs.readdirSync(path.join(root, "supabase/migrations"));
  // 00108 + 00109 are Build 15's privacy migrations (applied); Build 14 added none.
  assert.ok(!migs.some((f) => /^\d{5}_/.test(f) && Number(f.slice(0, 5)) > 109), "no migration newer than 00109");
});
