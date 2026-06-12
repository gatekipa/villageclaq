import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const sourcePath = new URL("../src/lib/remittance-decision-producer.ts", import.meta.url);
const routePath = new URL("../src/app/api/relief/remittance-notifications/route.ts", import.meta.url);
const remittancesPagePath = new URL("../src/app/[locale]/(dashboard)/dashboard/relief/remittances/page.tsx", import.meta.url);
const dispatcherPath = new URL("../src/lib/whatsapp-dispatcher.ts", import.meta.url);
const require = createRequire(import.meta.url);

const ids = {
  confirmedRemittance: "11111111-1111-4111-8111-111111111111",
  disputedRemittance: "22222222-2222-4222-8222-222222222222",
  pendingRemittance: "33333333-3333-4333-8333-333333333333",
  branchGroup: "99999999-9999-4999-8999-999999999999",
  plan: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  adminA: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  adminB: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
};

const phoneA = ["+1", "301", "433", "5857"].join("");
const phoneB = ["+237", "650", "44", "55", "66"].join("");

function loadProducer() {
  const source = fs.readFileSync(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;

  const cjsModule = { exports: {} };
  const localRequire = (id) => {
    if (id === "@/lib/currencies") {
      return {
        formatAmount(amount, currency) {
          const n = Number(amount || 0);
          if (currency === "XAF" || currency === "XOF") return `${n.toLocaleString("en-US")} FCFA`;
          return `${currency} ${n.toLocaleString("en-US")}`;
        },
      };
    }
    if (id === "@/lib/format-phone-whatsapp") {
      return {
        formatPhoneForWhatsApp(phone) {
          if (!phone) return null;
          let cleaned = String(phone).replace(/[\s\-()]/g, "");
          if (cleaned.startsWith("+")) cleaned = cleaned.slice(1);
          cleaned = cleaned.replace(/\D/g, "");
          if (cleaned.length < 7 || cleaned.length > 15) return null;
          return cleaned;
        },
      };
    }
    if (id === "@/lib/mask-phone") {
      return {
        maskPhoneNumber(phone) {
          const digits = String(phone || "").replace(/\D/g, "");
          if (!digits) return "(missing)";
          return `${String(phone || "").startsWith("+") ? "+" : ""}${digits.slice(0, 3)}******${digits.slice(-3)}`;
        },
      };
    }
    if (id === "@/lib/notification-prefs") {
      return {
        getEnabledChannels: async () => ({ in_app: true, email: true, sms: true, whatsapp: true, push: false }),
      };
    }
    if (id === "@/lib/whatsapp-templates") {
      return {
        WA_TEMPLATES: {
          REMITTANCE_CONFIRMED: "villageclaq_remittance_confirmed",
          REMITTANCE_DISPUTED: "villageclaq_remittance_disputed",
        },
      };
    }
    return require(id);
  };

  vm.runInNewContext(compiled, { console, exports: cjsModule.exports, module: cjsModule, require: localRequire }, { filename: sourcePath.pathname });
  return cjsModule.exports;
}

function createMockSupabase(options = {}) {
  const state = {
    remittances: {
      [ids.confirmedRemittance]: { id: ids.confirmedRemittance, branch_group_id: ids.branchGroup, relief_plan_id: ids.plan, amount: 250000, currency: "XAF", status: "confirmed" },
      [ids.disputedRemittance]: { id: ids.disputedRemittance, branch_group_id: ids.branchGroup, relief_plan_id: ids.plan, amount: 90000, currency: "XAF", status: "disputed" },
      [ids.pendingRemittance]: { id: ids.pendingRemittance, branch_group_id: ids.branchGroup, relief_plan_id: ids.plan, amount: 10000, currency: "XAF", status: "pending" },
    },
    group: { id: ids.branchGroup, name: "Bamenda Branch" },
    // Two active branch admins with accounts (proxy admins are filtered by
    // the producer's user_id NOT NULL query and never reach the mock).
    admins: [
      { id: "mem-a", user_id: ids.adminA, membership_status: "active" },
      { id: "mem-b", user_id: ids.adminB, membership_status: "active" },
    ],
    profiles: {
      [ids.adminA]: { id: ids.adminA, phone: phoneA, preferred_locale: "en" },
      [ids.adminB]: { id: ids.adminB, phone: phoneB, preferred_locale: "fr" },
    },
    existingQueueRows: [], // { remittanceId, recipientUserId, template }
    insertErrorCode: null,
    ...options,
  };
  const calls = [];

  class Builder {
    constructor(table) { this.table = table; this.filters = []; this.inFilters = []; this.notFilters = []; this.operation = "select"; }
    select() { return this; }
    insert(payload) { this.operation = "insert"; calls.push({ op: "insert", table: this.table, payload }); return this; }
    eq(column, value) { this.filters.push({ column, value }); return this; }
    in(column, values) { this.inFilters.push({ column, values }); return this; }
    not(column, op, value) { this.notFilters.push({ column, op, value }); return this; }
    limit() { return this; }
    maybeSingle() {
      if (this.operation === "insert") {
        if (state.insertErrorCode) return Promise.resolve({ data: null, error: { code: state.insertErrorCode, message: "duplicate key value" } });
        return Promise.resolve({ data: { id: "new-row" }, error: null });
      }
      return Promise.resolve({ data: selectSingle(this.table, this.filters, state), error: null });
    }
    single() { return this.maybeSingle(); }
    then(resolve) {
      if (this.operation === "insert") {
        if (state.insertErrorCode) return Promise.resolve(resolve({ data: null, error: { code: state.insertErrorCode, message: "duplicate key value" } }));
        return Promise.resolve(resolve({ data: [{ id: "new-row" }], error: null }));
      }
      if (this.table === "memberships") {
        return Promise.resolve(resolve({ data: state.admins, error: null }));
      }
      return Promise.resolve(resolve({ data: [selectSingle(this.table, this.filters, state)].filter(Boolean), error: null }));
    }
  }

  return {
    calls,
    auth: { admin: { async getUserById() { return { data: { user: null }, error: null }; } } },
    from(table) { return new Builder(table); },
  };
}

function filterValue(filters, column) {
  return filters.find((f) => f.column === column)?.value;
}

function selectSingle(table, filters, state) {
  if (table === "relief_remittances") return state.remittances[filterValue(filters, "id")] || null;
  if (table === "groups") return state.group;
  if (table === "profiles") return state.profiles[filterValue(filters, "id")] || null;
  if (table === "notifications_queue") {
    const template = filterValue(filters, "template");
    const remittanceId = filterValue(filters, "data->>remittanceId");
    const recipientUserId = filterValue(filters, "data->>recipientUserId");
    const match = state.existingQueueRows.find(
      (r) => r.remittanceId === remittanceId && r.recipientUserId === recipientUserId && r.template === template,
    );
    return match ? { id: "existing-queue", status: "queued" } : null;
  }
  return null;
}

function createLogger() {
  const records = [];
  return { records, log(...args) { records.push(args); }, warn(...args) { records.push(args); } };
}

test("a confirmed remittance queues one row PER branch admin with ordered non-empty variables", async () => {
  const { produceRemittanceDecisionNotifications } = loadProducer();
  const supabase = createMockSupabase();
  const logger = createLogger();

  const result = await produceRemittanceDecisionNotifications(supabase, ids.confirmedRemittance, { logger });

  assert.equal(result.status, "queued");
  assert.equal(result.decision, "confirmed");
  assert.equal(result.template, "villageclaq_remittance_confirmed");
  assert.equal(result.whatsappQueued, 2);

  const queueInserts = supabase.calls.filter((c) => c.op === "insert" && c.table === "notifications_queue");
  assert.equal(queueInserts.length, 2, "expected one WhatsApp queue insert per branch admin");

  for (const insert of queueInserts) {
    const payload = insert.payload;
    assert.equal(payload.channel, "whatsapp");
    assert.equal(payload.template, "remittance_confirmed");
    assert.equal(payload.data.whatsappType, "remittance_confirmed");
    assert.equal(payload.data.remittanceId, ids.confirmedRemittance);
    assert.ok(payload.data.recipientUserId, "recipientUserId must be present for idempotency");
    assert.deepEqual(Object.keys(payload.data.whatsappData), ["amount", "groupName"]);
    for (const [key, value] of Object.entries(payload.data.whatsappData)) {
      assert.ok(String(value).length > 0, `${key} must be non-empty`);
    }
    assert.equal(payload.data.whatsappData.amount, "250,000 FCFA");
    assert.equal(payload.data.whatsappData.groupName, "Bamenda Branch");
    // The queued recipient is the NORMALIZED digits-only form, never the
    // raw profile value.
    assert.match(String(payload.data.recipient), /^\d+$/);
  }
  const recipients = queueInserts.map((c) => String(c.payload.data.recipient)).sort();
  assert.deepEqual(recipients, [phoneA.replace("+", ""), phoneB.replace("+", "")].sort());

  // Per-recipient locale: admin A en, admin B fr.
  const locales = queueInserts.map((c) => c.payload.data.locale).sort();
  assert.deepEqual(locales, ["en", "fr"]);

  const logText = JSON.stringify(logger.records);
  assert.match(logText, /\+130\*{6}857/);
  assert.doesNotMatch(logText, new RegExp(phoneA.replace("+", "\\+")));
  assert.doesNotMatch(logText, new RegExp(phoneB.replace("+", "\\+")));
});

test("a disputed remittance uses the disputed template", async () => {
  const { produceRemittanceDecisionNotifications } = loadProducer();
  const supabase = createMockSupabase();

  const result = await produceRemittanceDecisionNotifications(supabase, ids.disputedRemittance, {});
  assert.equal(result.status, "queued");
  assert.equal(result.template, "villageclaq_remittance_disputed");
  const payload = supabase.calls.find((c) => c.op === "insert").payload;
  assert.equal(payload.template, "remittance_disputed");
  assert.equal(payload.data.whatsappData.amount, "90,000 FCFA");
});

test("a pending remittance never notifies", async () => {
  const { produceRemittanceDecisionNotifications } = loadProducer();
  const supabase = createMockSupabase();

  const result = await produceRemittanceDecisionNotifications(supabase, ids.pendingRemittance, {});
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "remittance_not_decided");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("a rerun dedupes per recipient (one admin already queued, the other still queues)", async () => {
  const { produceRemittanceDecisionNotifications } = loadProducer();
  const supabase = createMockSupabase({
    existingQueueRows: [
      { remittanceId: ids.confirmedRemittance, recipientUserId: ids.adminA, template: "remittance_confirmed" },
    ],
  });

  const result = await produceRemittanceDecisionNotifications(supabase, ids.confirmedRemittance, {});
  assert.equal(result.status, "queued");
  assert.equal(result.whatsappQueued, 1);
  const skipped = result.recipients.find((r) => r.userId === ids.adminA);
  assert.equal(skipped.status, "skipped");
  assert.equal(skipped.reason, "duplicate_whatsapp_remittance");
});

test("a full rerun for the same decision skips everyone", async () => {
  const { produceRemittanceDecisionNotifications } = loadProducer();
  const supabase = createMockSupabase({
    existingQueueRows: [
      { remittanceId: ids.confirmedRemittance, recipientUserId: ids.adminA, template: "remittance_confirmed" },
      { remittanceId: ids.confirmedRemittance, recipientUserId: ids.adminB, template: "remittance_confirmed" },
    ],
  });

  const result = await produceRemittanceDecisionNotifications(supabase, ids.confirmedRemittance, {});
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "all_recipients_skipped");
  assert.equal(result.whatsappQueued, 0);
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("a genuine reversal still notifies: confirmed rows do not block the disputed notice", async () => {
  const { produceRemittanceDecisionNotifications } = loadProducer();
  const supabase = createMockSupabase({
    existingQueueRows: [
      { remittanceId: ids.disputedRemittance, recipientUserId: ids.adminA, template: "remittance_confirmed" },
      { remittanceId: ids.disputedRemittance, recipientUserId: ids.adminB, template: "remittance_confirmed" },
    ],
  });

  const result = await produceRemittanceDecisionNotifications(supabase, ids.disputedRemittance, {});
  assert.equal(result.status, "queued");
  assert.equal(result.whatsappQueued, 2);
});

test("unique-violation race (23505) is treated as a per-recipient duplicate skip", async () => {
  const { produceRemittanceDecisionNotifications } = loadProducer();
  const supabase = createMockSupabase({ insertErrorCode: "23505" });

  const result = await produceRemittanceDecisionNotifications(supabase, ids.confirmedRemittance, {});
  assert.equal(result.status, "skipped");
  assert.equal(result.whatsappQueued, 0);
  for (const r of result.recipients) {
    assert.equal(r.reason, "duplicate_whatsapp_remittance");
  }
});

test("per-recipient preference gating skips only the opted-out admin", async () => {
  const { produceRemittanceDecisionNotifications } = loadProducer();
  const supabase = createMockSupabase();
  const channelCalls = [];

  const result = await produceRemittanceDecisionNotifications(supabase, ids.confirmedRemittance, {
    getChannels: async (client, userId, notificationType, groupId) => {
      channelCalls.push({ userId, notificationType, groupId });
      return { in_app: true, email: true, sms: true, whatsapp: userId !== ids.adminB, push: false };
    },
  });

  assert.equal(result.whatsappQueued, 1);
  assert.equal(channelCalls.every((c) => c.notificationType === "relief_updates"), true);
  assert.equal(channelCalls.every((c) => c.groupId === ids.branchGroup), true);
  const optedOut = result.recipients.find((r) => r.userId === ids.adminB);
  assert.equal(optedOut.reason, "whatsapp_disabled");
});

test("an admin with no phone skips without blocking the others", async () => {
  const { produceRemittanceDecisionNotifications } = loadProducer();
  const supabase = createMockSupabase({
    profiles: {
      [ids.adminA]: { id: ids.adminA, phone: phoneA, preferred_locale: "en" },
      [ids.adminB]: { id: ids.adminB, phone: null, preferred_locale: "fr" },
    },
  });

  const result = await produceRemittanceDecisionNotifications(supabase, ids.confirmedRemittance, {});
  assert.equal(result.whatsappQueued, 1);
  const noPhone = result.recipients.find((r) => r.userId === ids.adminB);
  assert.equal(noPhone.reason, "missing_phone");
});

test("a zero amount yields no blank variables — skipped safely before any recipient work", async () => {
  const { produceRemittanceDecisionNotifications } = loadProducer();
  const supabase = createMockSupabase({
    remittances: {
      [ids.confirmedRemittance]: { id: ids.confirmedRemittance, branch_group_id: ids.branchGroup, relief_plan_id: ids.plan, amount: 0, currency: "XAF", status: "confirmed" },
    },
  });

  const result = await produceRemittanceDecisionNotifications(supabase, ids.confirmedRemittance, {});
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "missing_template_data");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("the remittances page routes WhatsApp through the producer with a status precondition", () => {
  const page = fs.readFileSync(remittancesPagePath, "utf8");
  assert.doesNotMatch(page, /whatsappType:\s*(waType|"remittance_)/);
  assert.match(page, /requestRemittanceDecisionWhatsApp/);
  assert.match(page, /\.eq\("status", "pending"\)/);
  assert.match(page, /remittanceAlreadyDecided/);
  assert.match(page, /whatsapp:\s*false/);
  // Email/SMS payload keeps the fields the SMS template reads.
  assert.match(page, /data:\s*\{ groupName: branchName, amount: amt, status: newStatus \}/);

  const dispatcher = fs.readFileSync(dispatcherPath, "utf8");
  assert.match(dispatcher, /case "remittance_confirmed":/);
  assert.match(dispatcher, /case "remittance_disputed":/);

  const route = fs.readFileSync(routePath, "utf8");
  assert.match(route, /branch_group_id/);
  assert.match(route, /groups\.group_level", "hq"/);
  assert.match(route, /\.in\("role", \["owner", "admin"\]\)/);
  assert.match(route, /isPlatformStaff/);
});
