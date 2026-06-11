import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const sourcePath = new URL("../src/lib/standing-change-producer.ts", import.meta.url);
const routePath = new URL("../src/app/api/members/standing-notifications/route.ts", import.meta.url);
const calculateStandingPath = new URL("../src/lib/calculate-standing.ts", import.meta.url);
const dispatcherPath = new URL("../src/lib/whatsapp-dispatcher.ts", import.meta.url);
const require = createRequire(import.meta.url);

const ids = {
  membership: "11111111-1111-4111-8111-111111111111",
  proxyMembership: "22222222-2222-4222-8222-222222222222",
  duplicateMembership: "33333333-3333-4333-8333-333333333333",
  user: "44444444-4444-4444-8444-444444444444",
  group: "55555555-5555-4555-8555-555555555555",
};

const fullPhone = ["+1", "301", "433", "5857"].join("");
const CHANGE_DATE = "2026-06-15";

function loadProducer() {
  const source = fs.readFileSync(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;

  const cjsModule = { exports: {} };
  const localRequire = (id) => {
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
    if (id === "@/lib/get-member-name") {
      return {
        getMemberName(record) {
          if (!record) return "Member";
          if (record.display_name) return record.display_name;
          if (record.profile?.full_name) return record.profile.full_name;
          if (record.privacy_settings?.proxy_name) return record.privacy_settings.proxy_name;
          return "Member";
        },
      };
    }
    if (id === "@/lib/notification-prefs") {
      return {
        getEnabledChannels: async () => ({ in_app: true, email: true, sms: true, whatsapp: true, push: false }),
      };
    }
    if (id === "@/lib/whatsapp-templates") {
      return { WA_TEMPLATES: { STANDING_CHANGED: "villageclaq_standing_changed" } };
    }
    return require(id);
  };

  vm.runInNewContext(compiled, {
    console,
    exports: cjsModule.exports,
    module: cjsModule,
    require: localRequire,
  }, { filename: sourcePath.pathname });
  return cjsModule.exports;
}

function createMockSupabase(options = {}) {
  const state = {
    membership: {
      id: ids.membership,
      group_id: ids.group,
      user_id: ids.user,
      display_name: "Jude Anyere",
      is_proxy: false,
      phone: null,
      privacy_settings: {},
      membership_status: "active",
      standing: "suspended",
    },
    profile: {
      id: ids.user,
      full_name: "Jude Anyere",
      phone: fullPhone,
      preferred_locale: "en",
    },
    group: { id: ids.group, name: "Njimafor Diaspora" },
    // existingQueueRows: array of { membershipId, newStanding, changeDate }.
    existingQueueRows: [],
    authPhone: null,
    ...options,
  };
  const calls = [];

  class Builder {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this.operation = "select";
    }
    select() { return this; }
    insert(payload) { this.operation = "insert"; calls.push({ op: "insert", table: this.table, payload }); return this; }
    eq(column, value) { this.filters.push({ column, value }); return this; }
    limit() { return this; }
    maybeSingle() {
      if (this.operation === "insert") return Promise.resolve({ data: { id: "new-row" }, error: null });
      return Promise.resolve({ data: selectRow(this.table, this.filters, state), error: null });
    }
    single() { return this.maybeSingle(); }
    then(resolve) {
      if (this.operation === "insert") return Promise.resolve(resolve({ data: [{ id: "new-row" }], error: null }));
      return Promise.resolve(resolve({ data: [selectRow(this.table, this.filters, state)].filter(Boolean), error: null }));
    }
  }

  return {
    calls,
    auth: {
      admin: {
        async getUserById(userId) {
          calls.push({ op: "auth.admin.getUserById", userId });
          return { data: { user: state.authPhone ? { phone: state.authPhone } : null }, error: null };
        },
      },
    },
    from(table) { return new Builder(table); },
  };
}

function filterValue(filters, column) {
  return filters.find((f) => f.column === column)?.value;
}

function selectRow(table, filters, state) {
  if (table === "memberships") {
    const requestedId = filterValue(filters, "id");
    if (requestedId === ids.proxyMembership) {
      return { ...state.membership, id: ids.proxyMembership, user_id: null, is_proxy: true };
    }
    if (requestedId === ids.duplicateMembership) return { ...state.membership, id: ids.duplicateMembership };
    return state.membership;
  }
  if (table === "profiles") return state.profile;
  if (table === "groups") return state.group;
  if (table === "notifications_queue") {
    const membershipId = filterValue(filters, "data->>membershipId");
    const newStanding = filterValue(filters, "data->>newStanding");
    const changeDate = filterValue(filters, "data->>changeDate");
    const match = state.existingQueueRows.find(
      (r) => r.membershipId === membershipId && r.newStanding === newStanding && r.changeDate === changeDate,
    );
    return match ? { id: "existing-queue", status: "queued" } : null;
  }
  return null;
}

function createLogger() {
  const records = [];
  return {
    records,
    log(...args) { records.push(args); },
    warn(...args) { records.push(args); },
  };
}

test("a real standing transition queues exactly one WhatsApp row with ordered non-empty variables", async () => {
  const { produceStandingChangeNotification } = loadProducer();
  const supabase = createMockSupabase();
  const logger = createLogger();

  const result = await produceStandingChangeNotification(supabase, ids.membership, {
    logger,
    changeDate: CHANGE_DATE,
  });

  assert.equal(result.status, "queued");
  assert.equal(result.template, "villageclaq_standing_changed");
  assert.equal(result.newStanding, "suspended");
  assert.equal(result.changeDate, CHANGE_DATE);

  const queueInserts = supabase.calls.filter((c) => c.op === "insert" && c.table === "notifications_queue");
  assert.equal(queueInserts.length, 1, "expected exactly one WhatsApp queue insert");

  const payload = queueInserts[0].payload;
  assert.equal(payload.channel, "whatsapp");
  assert.equal(payload.template, "standing_changed");
  assert.equal(payload.data.whatsappType, "standing_changed");
  assert.equal(payload.data.template, "villageclaq_standing_changed");
  assert.equal(payload.data.membershipId, ids.membership);
  assert.equal(payload.data.newStanding, "suspended"); // dedup key = raw enum
  assert.equal(payload.data.changeDate, CHANGE_DATE);
  assert.deepEqual(Object.keys(payload.data.whatsappData), ["memberName", "newStanding", "groupName"]);
  for (const [key, value] of Object.entries(payload.data.whatsappData)) {
    assert.ok(String(value).length > 0, `${key} must be non-empty`);
  }
  assert.equal(payload.data.whatsappData.memberName, "Jude Anyere");
  assert.equal(payload.data.whatsappData.newStanding, "Suspended"); // localized label
  assert.equal(payload.data.whatsappData.groupName, "Njimafor Diaspora");
  assert.equal(payload.data.locale, "en");

  // WhatsApp-only producer — no other table writes.
  assert.equal(supabase.calls.some((c) => c.op === "insert" && c.table !== "notifications_queue"), false);

  const logText = JSON.stringify(logger.records);
  assert.match(logText, /\+130\*{6}857/);
  assert.doesNotMatch(logText, new RegExp(fullPhone.replace("+", "\\+")));
});

test("recipient's French preferred locale wins and localizes the standing label", async () => {
  const { produceStandingChangeNotification } = loadProducer();
  const supabase = createMockSupabase({
    profile: { id: ids.user, full_name: "Jude Anyere", phone: fullPhone, preferred_locale: "fr" },
  });

  const result = await produceStandingChangeNotification(supabase, ids.membership, {
    changeDate: CHANGE_DATE,
    locale: "en",
  });

  assert.equal(result.status, "queued");
  const payload = supabase.calls.find((c) => c.op === "insert" && c.table === "notifications_queue").payload;
  assert.equal(payload.data.locale, "fr");
  assert.equal(payload.data.newStanding, "suspended"); // dedup key stays raw enum
  assert.equal(payload.data.whatsappData.newStanding, "Suspendu"); // FR label
});

test("repeated same-day recalc for the same standing does not duplicate", async () => {
  const { produceStandingChangeNotification } = loadProducer();
  const supabase = createMockSupabase({
    existingQueueRows: [{ membershipId: ids.duplicateMembership, newStanding: "suspended", changeDate: CHANGE_DATE }],
  });

  const result = await produceStandingChangeNotification(supabase, ids.duplicateMembership, {
    changeDate: CHANGE_DATE,
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "duplicate_whatsapp_standing");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("a later transition to a different standing queues again", async () => {
  const { produceStandingChangeNotification } = loadProducer();
  // An existing row for the SAME membership+day but a DIFFERENT standing
  // (good) must not block a new suspended notice.
  const supabase = createMockSupabase({
    existingQueueRows: [{ membershipId: ids.membership, newStanding: "good", changeDate: CHANGE_DATE }],
  });

  const result = await produceStandingChangeNotification(supabase, ids.membership, {
    changeDate: CHANGE_DATE,
  });

  assert.equal(result.status, "queued");
  assert.equal(result.newStanding, "suspended");
  const queueInserts = supabase.calls.filter((c) => c.op === "insert" && c.table === "notifications_queue");
  assert.equal(queueInserts.length, 1);
});

test("next-day recalc of the same standing queues again (different day bucket)", async () => {
  const { produceStandingChangeNotification } = loadProducer();
  const supabase = createMockSupabase({
    existingQueueRows: [{ membershipId: ids.membership, newStanding: "suspended", changeDate: CHANGE_DATE }],
  });

  const result = await produceStandingChangeNotification(supabase, ids.membership, {
    changeDate: "2026-06-16",
  });

  assert.equal(result.status, "queued");
  const payload = supabase.calls.find((c) => c.op === "insert" && c.table === "notifications_queue").payload;
  assert.equal(payload.data.changeDate, "2026-06-16");
});

test("proxy / unclaimed membership is never notified", async () => {
  const { produceStandingChangeNotification } = loadProducer();
  const supabase = createMockSupabase();

  const result = await produceStandingChangeNotification(supabase, ids.proxyMembership, {
    changeDate: CHANGE_DATE,
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "no_user_account");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("producer gates on standing_changes preferences and skips when WhatsApp disabled", async () => {
  const { produceStandingChangeNotification } = loadProducer();
  const supabase = createMockSupabase();
  const channelCalls = [];

  const result = await produceStandingChangeNotification(supabase, ids.membership, {
    changeDate: CHANGE_DATE,
    getChannels: async (client, userId, notificationType, groupId) => {
      channelCalls.push({ userId, notificationType, groupId });
      return { in_app: true, email: true, sms: true, whatsapp: false, push: false };
    },
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "whatsapp_disabled");
  assert.equal(channelCalls[0].notificationType, "standing_changes");
  assert.equal(channelCalls[0].groupId, ids.group);
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("missing phone skips safely", async () => {
  const { produceStandingChangeNotification } = loadProducer();
  const supabase = createMockSupabase({
    profile: { id: ids.user, full_name: "Jude Anyere", phone: null, preferred_locale: "en" },
    authPhone: null,
  });

  const result = await produceStandingChangeNotification(supabase, ids.membership, {
    changeDate: CHANGE_DATE,
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "missing_phone");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("calculate-standing no longer dispatches WhatsApp directly and the dispatcher key matches", () => {
  const standing = fs.readFileSync(calculateStandingPath, "utf8");
  // The old direct WhatsApp send is gone; WhatsApp now goes through the
  // queue-backed producer route.
  assert.doesNotMatch(standing, /\/api\/whatsapp\/send/);
  assert.match(standing, /\/api\/members\/standing-notifications/);
  // In-app/email/SMS behavior preserved (SMS keeps its own newStatus payload).
  assert.match(standing, /\/api\/email\/send/);
  assert.match(standing, /\/api\/sms\/send/);

  // The producer's whatsappData uses the key the dispatcher reads.
  const dispatcher = fs.readFileSync(dispatcherPath, "utf8");
  assert.match(dispatcher, /newStanding:\s*d\.newStanding/);
  const producer = fs.readFileSync(sourcePath, "utf8");
  assert.match(producer, /newStanding:\s*standingDisplay/);
});

test("route authorizes the member, group owner/admin, and platform staff only", () => {
  const source = fs.readFileSync(routePath, "utf8");
  assert.match(source, /memberUserId === user\.id/);
  assert.match(source, /\.in\("role", \["owner", "admin"\]\)/);
  assert.match(source, /membership_status", "active"/);
  assert.match(source, /isPlatformStaff/);
  assert.match(source, /Malformed JSON/);
});
