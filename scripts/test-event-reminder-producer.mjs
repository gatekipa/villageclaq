import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const sourcePath = new URL("../src/lib/event-reminder-producer.ts", import.meta.url);
const cronPath = new URL("../src/app/api/cron/event-reminders/route.ts", import.meta.url);
const enMessagesPath = new URL("../messages/en.json", import.meta.url);
const frMessagesPath = new URL("../messages/fr.json", import.meta.url);
const require = createRequire(import.meta.url);

const ids = {
  event: "11111111-1111-4111-8111-111111111111",
  completedEvent: "22222222-2222-4222-8222-222222222222",
  cancelledEvent: "33333333-3333-4333-8333-333333333333",
  pastEvent: "44444444-4444-4444-8444-444444444444",
  noLocationEvent: "55555555-5555-4555-8555-555555555555",
  inactiveGroupEvent: "66666666-6666-4666-8666-666666666666",
  nullStartsEvent: "77777777-7777-4777-8777-777777777777",
  missingEvent: "00000000-0000-4000-8000-000000000000",
  group: "99999999-9999-4999-8999-999999999999",
  inactiveGroup: "88888888-8888-4888-8888-888888888888",
  userA: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  userB: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  userC: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
};

const phoneA = ["+1", "301", "433", "5857"].join("");
const phoneB = ["+237", "650", "44", "55", "66"].join("");
const proxyPhone = ["+237", "699", "11", "22", "33"].join("");

const NOW = "2026-06-12T08:00:00.000Z";
const STARTS_AT = "2026-06-13T17:00:00.000Z";

const EN_FALLBACK = "Location to be announced";
const FR_FALLBACK = "Lieu à confirmer";

let translatorBuildCount = 0;

function loadProducer() {
  const source = fs.readFileSync(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;

  const cjsModule = { exports: {} };
  const localRequire = (id) => {
    if (id === "@/lib/cron-notify-helper") {
      return {
        async buildTranslator(namespace) {
          translatorBuildCount += 1;
          return (locale, key) => {
            if (key === "eventLocationFallback") return locale === "fr" ? FR_FALLBACK : EN_FALLBACK;
            return `[${namespace}.${key}]`;
          };
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
      return { WA_TEMPLATES: { EVENT_REMINDER: "villageclaq_event_reminder_v2" } };
    }
    return require(id);
  };

  vm.runInNewContext(compiled, { console, exports: cjsModule.exports, module: cjsModule, require: localRequire }, { filename: sourcePath.pathname });
  return cjsModule.exports;
}

function baseEvent(overrides = {}) {
  return {
    id: ids.event,
    group_id: ids.group,
    title: "General Assembly",
    title_fr: "Assemblée générale",
    starts_at: STARTS_AT,
    location: "Community Hall",
    status: "upcoming",
    ...overrides,
  };
}

function createMockSupabase(options = {}) {
  const state = {
    events: {
      [ids.event]: baseEvent(),
      [ids.completedEvent]: baseEvent({ id: ids.completedEvent, status: "completed" }),
      [ids.cancelledEvent]: baseEvent({ id: ids.cancelledEvent, status: "cancelled" }),
      [ids.pastEvent]: baseEvent({ id: ids.pastEvent, starts_at: "2026-06-11T17:00:00.000Z" }),
      [ids.noLocationEvent]: baseEvent({ id: ids.noLocationEvent, location: "" }),
      [ids.inactiveGroupEvent]: baseEvent({ id: ids.inactiveGroupEvent, group_id: ids.inactiveGroup }),
      [ids.nullStartsEvent]: baseEvent({ id: ids.nullStartsEvent, starts_at: null }),
    },
    groups: {
      [ids.group]: { id: ids.group, name: "Njimafor Diaspora", is_active: true },
      [ids.inactiveGroup]: { id: ids.inactiveGroup, name: "Dormant Group", is_active: false },
    },
    // Proxy and pending memberships are present so the producer's recipient
    // filters (user_id NOT NULL, is_proxy=false, membership_status=active)
    // are genuinely exercised by the mock's filter emulation.
    memberships: [
      { id: "mem-a", group_id: ids.group, user_id: ids.userA, display_name: "Jude Anyere", is_proxy: false, membership_status: "active", phone: null, privacy_settings: {} },
      { id: "mem-b", group_id: ids.group, user_id: ids.userB, display_name: null, is_proxy: false, membership_status: "active", phone: null, privacy_settings: {} },
      { id: "mem-proxy", group_id: ids.group, user_id: null, display_name: "Mama Ngozi", is_proxy: true, membership_status: "active", phone: null, privacy_settings: { proxy_phone: proxyPhone } },
      { id: "mem-pending", group_id: ids.group, user_id: ids.userC, display_name: "Pending Pete", is_proxy: false, membership_status: "pending", phone: null, privacy_settings: {} },
    ],
    profiles: {
      [ids.userA]: { id: ids.userA, full_name: "Jude Anyere", phone: phoneA, preferred_locale: "en" },
      [ids.userB]: { id: ids.userB, full_name: "Marie Claire", phone: phoneB, preferred_locale: "fr" },
    },
    // queueRows: array of { channel, template, status, data } — inserts append
    // here so a SECOND producer call sees the first call's rows (true
    // rerun-regression coverage, not just fixture seeding).
    queueRows: [],
    insertErrorCode: null,
    selectErrorTables: [],
    authPhone: null,
    ...options,
  };
  const calls = [];

  class Builder {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this.notFilters = [];
      this.operation = "select";
      this.payload = null;
    }

    select() { return this; }

    insert(payload) {
      this.operation = "insert";
      this.payload = payload;
      calls.push({ op: "insert", table: this.table, payload });
      return this;
    }

    eq(column, value) { this.filters.push({ column, value }); return this; }

    not(column, op, value) { this.notFilters.push({ column, op, value }); return this; }

    limit() { return this; }

    resolveInsert() {
      if (state.insertErrorCode) {
        return { data: null, error: { code: state.insertErrorCode, message: "duplicate key value" } };
      }
      if (this.table === "notifications_queue") {
        state.queueRows.push({
          channel: this.payload.channel,
          template: this.payload.template,
          status: this.payload.status,
          data: this.payload.data,
        });
      }
      return { data: [{ id: "new-row" }], error: null };
    }

    maybeSingle() {
      if (this.operation === "insert") return Promise.resolve(this.resolveInsert());
      if ((state.selectErrorTables || []).includes(this.table)) {
        return Promise.resolve({ data: null, error: { message: "transient lookup failure" } });
      }
      return Promise.resolve({ data: selectSingle(this.table, this.filters, state), error: null });
    }

    single() { return this.maybeSingle(); }

    then(resolve, reject) {
      if (this.operation === "insert") {
        return Promise.resolve(this.resolveInsert()).then(resolve, reject);
      }
      if ((state.selectErrorTables || []).includes(this.table)) {
        return Promise.resolve({ data: null, error: { message: "transient lookup failure" } }).then(resolve, reject);
      }
      if (this.table === "memberships") {
        let rows = state.memberships;
        for (const f of this.filters) rows = rows.filter((r) => r[f.column] === f.value);
        for (const nf of this.notFilters) {
          if (nf.op === "is") rows = rows.filter((r) => r[nf.column] !== nf.value);
        }
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      }
      return Promise.resolve({ data: [selectSingle(this.table, this.filters, state)].filter(Boolean), error: null }).then(resolve, reject);
    }
  }

  return {
    calls,
    state,
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

function selectSingle(table, filters, state) {
  if (table === "events") return state.events[filterValue(filters, "id")] || null;
  if (table === "groups") return state.groups[filterValue(filters, "id")] || null;
  if (table === "profiles") return state.profiles[filterValue(filters, "id")] || null;
  if (table === "notifications_queue") {
    const channel = filterValue(filters, "channel");
    const template = filterValue(filters, "template");
    const eventId = filterValue(filters, "data->>eventId");
    const userId = filterValue(filters, "data->>userId");
    const match = state.queueRows.find(
      (r) => r.channel === channel && r.template === template && r.data?.eventId === eventId && r.data?.userId === userId,
    );
    return match ? { id: "existing-queue", status: match.status || "queued" } : null;
  }
  return null;
}

function createLogger() {
  const records = [];
  return { records, log(...args) { records.push(args); }, warn(...args) { records.push(args); } };
}

function expectedEventDate(locale) {
  return new Date(STARTS_AT).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

test("an upcoming event queues one row per eligible member with ordered non-empty variables", async () => {
  const { produceEventReminderNotification } = loadProducer();
  const supabase = createMockSupabase();
  const logger = createLogger();

  const result = await produceEventReminderNotification(supabase, ids.event, { logger, now: NOW });

  assert.equal(result.status, "queued");
  assert.equal(result.template, "villageclaq_event_reminder_v2");
  assert.equal(result.whatsappQueued, 2);
  // Proxy (user_id NULL, is_proxy) and pending memberships never become
  // recipients. (Array.from: the producer's array lives in the vm realm.)
  assert.deepEqual(Array.from(result.recipients, (r) => r.userId).sort(), [ids.userA, ids.userB].sort());

  const queueInserts = supabase.calls.filter((c) => c.op === "insert" && c.table === "notifications_queue");
  assert.equal(queueInserts.length, 2, "expected one WhatsApp queue insert per eligible member");

  for (const insert of queueInserts) {
    const payload = insert.payload;
    assert.equal(payload.channel, "whatsapp");
    assert.equal(payload.template, "event_reminder");
    assert.equal(payload.status, "queued");
    assert.equal(payload.data.whatsappType, "event_reminder");
    assert.equal(payload.data.template, "villageclaq_event_reminder_v2");
    assert.equal(payload.data.eventId, ids.event);
    assert.equal(payload.data.groupId, ids.group);
    assert.ok(payload.data.membershipId, "membershipId must be present");
    // user_id (queue convention) AND camelCase userId (00097 index key) both present.
    assert.ok(payload.data.user_id, "user_id must be present");
    assert.equal(payload.data.userId, payload.data.user_id, "userId must mirror user_id for the 00097 dedupe index");
    assert.deepEqual(
      Object.keys(payload.data.whatsappData),
      ["memberName", "eventTitle", "eventDate", "eventLocation", "groupName"],
    );
    for (const [key, value] of Object.entries(payload.data.whatsappData)) {
      assert.ok(String(value).length > 0, `${key} must be non-empty`);
    }
    assert.equal(payload.data.whatsappData.eventLocation, "Community Hall");
    assert.equal(payload.data.whatsappData.groupName, "Njimafor Diaspora");
    // The queued recipient is the NORMALIZED digits-only form.
    assert.match(String(payload.data.recipient), /^\d+$/);
  }

  // Per-recipient locale: A en, B fr — and the fr recipient gets title_fr +
  // the fr-FR date rendering (same formatting as the legacy email copy).
  const insertA = queueInserts.find((c) => c.payload.data.userId === ids.userA).payload;
  const insertB = queueInserts.find((c) => c.payload.data.userId === ids.userB).payload;
  assert.equal(insertA.data.locale, "en");
  assert.equal(insertA.data.whatsappData.eventTitle, "General Assembly");
  assert.equal(insertA.data.whatsappData.eventDate, expectedEventDate("en"));
  assert.equal(insertB.data.locale, "fr");
  assert.equal(insertB.data.whatsappData.eventTitle, "Assemblée générale");
  assert.equal(insertB.data.whatsappData.eventDate, expectedEventDate("fr"));

  const recipients = queueInserts.map((c) => String(c.payload.data.recipient)).sort();
  assert.deepEqual(recipients, [phoneA.replace("+", ""), phoneB.replace("+", "")].sort());
});

test("REGRESSION: a second producer call queues nothing — every recipient dedupes, queue stays at 2 rows", async () => {
  const { produceEventReminderNotification } = loadProducer();
  const supabase = createMockSupabase();

  const first = await produceEventReminderNotification(supabase, ids.event, { now: NOW });
  assert.equal(first.status, "queued");
  assert.equal(first.whatsappQueued, 2);
  assert.equal(supabase.state.queueRows.length, 2);

  const second = await produceEventReminderNotification(supabase, ids.event, { now: NOW });
  assert.equal(second.status, "skipped");
  assert.equal(second.reason, "all_recipients_skipped");
  assert.equal(second.whatsappQueued, 0);
  for (const r of second.recipients) {
    assert.equal(r.status, "skipped");
    assert.equal(r.reason, "duplicate_whatsapp_event_reminder");
  }

  assert.equal(supabase.state.queueRows.length, 2, "second call must not add queue rows");
  const queueInserts = supabase.calls.filter((c) => c.op === "insert" && c.table === "notifications_queue");
  assert.equal(queueInserts.length, 2, "no insert attempts on the rerun");
});

test("partial dedupe: a pre-existing row for member A (even a failed one) blocks only A", async () => {
  const { produceEventReminderNotification } = loadProducer();
  const supabase = createMockSupabase({
    queueRows: [
      // Failed rows block re-enqueue too — old failures are never retried.
      { channel: "whatsapp", template: "event_reminder", status: "failed", data: { eventId: ids.event, userId: ids.userA } },
    ],
  });

  const result = await produceEventReminderNotification(supabase, ids.event, { now: NOW });

  assert.equal(result.status, "queued");
  assert.equal(result.whatsappQueued, 1);
  const skipped = result.recipients.find((r) => r.userId === ids.userA);
  assert.equal(skipped.status, "skipped");
  assert.equal(skipped.reason, "duplicate_whatsapp_event_reminder");

  const queueInserts = supabase.calls.filter((c) => c.op === "insert" && c.table === "notifications_queue");
  assert.equal(queueInserts.length, 1);
  assert.equal(queueInserts[0].payload.data.userId, ids.userB);
});

test("ineligible events and inactive groups never queue", async () => {
  const { produceEventReminderNotification } = loadProducer();
  const cases = [
    [ids.missingEvent, "event_not_found"],
    [ids.completedEvent, "event_not_upcoming"],
    [ids.cancelledEvent, "event_not_upcoming"],
    [ids.nullStartsEvent, "missing_starts_at"],
    [ids.pastEvent, "event_in_past"],
    [ids.inactiveGroupEvent, "group_inactive"],
  ];

  for (const [eventId, reason] of cases) {
    const supabase = createMockSupabase();
    const result = await produceEventReminderNotification(supabase, eventId, { now: NOW });
    assert.equal(result.status, "skipped", `${reason} case should skip`);
    assert.equal(result.reason, reason);
    assert.equal(result.whatsappQueued, 0);
    assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
  }
});

test("per-recipient preference gating skips only the opted-out member", async () => {
  const { produceEventReminderNotification } = loadProducer();
  const supabase = createMockSupabase();
  const channelCalls = [];

  const result = await produceEventReminderNotification(supabase, ids.event, {
    now: NOW,
    getChannels: async (client, userId, notificationType, groupId) => {
      channelCalls.push({ userId, notificationType, groupId });
      return { in_app: true, email: true, sms: true, whatsapp: userId !== ids.userB, push: false };
    },
  });

  assert.equal(result.status, "queued");
  assert.equal(result.whatsappQueued, 1);
  assert.equal(channelCalls.every((c) => c.notificationType === "event_reminders"), true);
  assert.equal(channelCalls.every((c) => c.groupId === ids.group), true);
  const optedOut = result.recipients.find((r) => r.userId === ids.userB);
  assert.equal(optedOut.status, "skipped");
  assert.equal(optedOut.reason, "whatsapp_disabled");
});

test("missing and invalid recipient phones skip per recipient without blocking the others", async () => {
  const { produceEventReminderNotification } = loadProducer();

  const noPhoneSupabase = createMockSupabase({
    profiles: {
      [ids.userA]: { id: ids.userA, full_name: "Jude Anyere", phone: phoneA, preferred_locale: "en" },
      [ids.userB]: { id: ids.userB, full_name: "Marie Claire", phone: null, preferred_locale: "fr" },
    },
    authPhone: null,
  });
  const noPhone = await produceEventReminderNotification(noPhoneSupabase, ids.event, { now: NOW });
  assert.equal(noPhone.whatsappQueued, 1);
  assert.equal(noPhone.recipients.find((r) => r.userId === ids.userB).reason, "missing_phone");

  const badPhoneSupabase = createMockSupabase({
    profiles: {
      [ids.userA]: { id: ids.userA, full_name: "Jude Anyere", phone: phoneA, preferred_locale: "en" },
      [ids.userB]: { id: ids.userB, full_name: "Marie Claire", phone: "123", preferred_locale: "fr" },
    },
  });
  const badPhone = await produceEventReminderNotification(badPhoneSupabase, ids.event, { now: NOW });
  assert.equal(badPhone.whatsappQueued, 1);
  assert.equal(badPhone.recipients.find((r) => r.userId === ids.userB).reason, "invalid_phone");
});

test("empty event location substitutes the translated non-empty fallback per recipient locale", async () => {
  const { produceEventReminderNotification } = loadProducer();
  const supabase = createMockSupabase();

  const result = await produceEventReminderNotification(supabase, ids.noLocationEvent, { now: NOW });

  assert.equal(result.status, "queued");
  assert.equal(result.whatsappQueued, 2);

  const queueInserts = supabase.calls.filter((c) => c.op === "insert" && c.table === "notifications_queue");
  const insertEn = queueInserts.find((c) => c.payload.data.locale === "en").payload;
  const insertFr = queueInserts.find((c) => c.payload.data.locale === "fr").payload;
  assert.equal(insertEn.data.whatsappData.eventLocation, EN_FALLBACK);
  assert.equal(insertFr.data.whatsappData.eventLocation, FR_FALLBACK);
  for (const insert of queueInserts) {
    assert.ok(String(insert.payload.data.whatsappData.eventLocation).length > 0, "eventLocation must never be empty (Meta rejects blank body params)");
  }
});

test("unique-violation race (23505) is treated as a per-recipient duplicate skip", async () => {
  const { produceEventReminderNotification } = loadProducer();
  const supabase = createMockSupabase({ insertErrorCode: "23505" });

  const result = await produceEventReminderNotification(supabase, ids.event, { now: NOW });

  assert.equal(result.status, "skipped");
  assert.equal(result.whatsappQueued, 0);
  for (const r of result.recipients) {
    assert.equal(r.status, "skipped");
    assert.equal(r.reason, "duplicate_whatsapp_event_reminder");
  }
});

test("transient lookup failures are errors, not silent skips", async () => {
  const { produceEventReminderNotification } = loadProducer();
  const logger = createLogger();

  const cases = [
    ["events", "event_lookup_failed"],
    ["groups", "group_lookup_failed"],
    ["memberships", "recipient_lookup_failed"],
  ];
  for (const [table, reason] of cases) {
    const supabase = createMockSupabase({ selectErrorTables: [table] });
    const result = await produceEventReminderNotification(supabase, ids.event, { now: NOW, logger });
    assert.equal(result.status, "error", `${table} lookup failure must be an error`);
    assert.equal(result.reason, reason);
    assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
  }

  // Per-recipient profile lookup failure: every recipient errors, none queue.
  const supabase = createMockSupabase({ selectErrorTables: ["profiles"] });
  const result = await produceEventReminderNotification(supabase, ids.event, { now: NOW, logger });
  assert.equal(result.status, "error");
  assert.equal(result.reason, "recipient_errors");
  for (const r of result.recipients) {
    assert.equal(r.status, "error");
    assert.equal(r.reason, "profile_lookup_failed");
  }
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("the translator is built once per producer invocation, not per recipient", async () => {
  const { produceEventReminderNotification } = loadProducer();
  const supabase = createMockSupabase();
  translatorBuildCount = 0;

  const result = await produceEventReminderNotification(supabase, ids.event, { now: NOW });
  assert.equal(result.whatsappQueued, 2);
  assert.equal(translatorBuildCount, 1, "buildTranslator must run once per invocation");
});

test("masked logging: the full phone number never appears in producer logs", async () => {
  const { produceEventReminderNotification } = loadProducer();
  const supabase = createMockSupabase();
  const logger = createLogger();

  await produceEventReminderNotification(supabase, ids.event, { now: NOW, logger });

  const logText = JSON.stringify(logger.records);
  assert.match(logText, /\+130\*{6}857/, "masked phone must appear in the queued log");
  assert.doesNotMatch(logText, new RegExp(phoneA.replace("+", "\\+")));
  assert.doesNotMatch(logText, new RegExp(phoneA.replace("+", "")));
  assert.doesNotMatch(logText, new RegExp(phoneB.replace("+", "\\+")));
  assert.doesNotMatch(logText, new RegExp(phoneB.replace("+", "")));
});

test("cron routes WhatsApp through the producer, keeps email/SMS direct, and gates the reminder_sent_at flip", () => {
  const source = fs.readFileSync(cronPath, "utf8");

  // No direct WhatsApp dispatch from the cron — queue-backed producer only.
  assert.doesNotMatch(source, /dispatchWhatsApp/);
  assert.match(source, /produceEventReminderNotification/);

  // Email + SMS paths (including the proxy leftover-phone SMS loop) preserved.
  assert.match(source, /sendEmail\(/);
  assert.match(source, /sendSmsNotification\(/);
  assert.match(source, /template: "event-reminder"/);
  assert.match(source, /for \(const \[, phone\] of phoneMap\)/);
  assert.match(source, /phoneMap\.delete\(/);

  // The reminder_sent_at flip is gated on IS NULL (no unconditional update race).
  assert.match(source, /\.update\(\{ reminder_sent_at:[\s\S]{0,200}?\.is\("reminder_sent_at", null\)/);

  // Producer-driven counters surface in the response.
  assert.match(source, /whatsappQueued/);
  assert.match(source, /whatsappSkipped/);
  assert.match(source, /whatsappFailed/);
});

test("eventLocationFallback exists in the cron namespace of both message bundles", () => {
  const en = JSON.parse(fs.readFileSync(enMessagesPath, "utf8"));
  const fr = JSON.parse(fs.readFileSync(frMessagesPath, "utf8"));
  assert.equal(en.cron?.eventLocationFallback, EN_FALLBACK);
  assert.equal(fr.cron?.eventLocationFallback, FR_FALLBACK);
});

test("REGRESSION: a throwing preference lookup fails open per recipient instead of aborting the batch", async () => {
  const { produceEventReminderNotification } = loadProducer();
  const supabase = createMockSupabase();
  const logger = createLogger();

  const result = await produceEventReminderNotification(supabase, ids.event, {
    now: NOW,
    logger,
    getChannels: async (client, userId) => {
      if (userId === ids.userA) throw new Error("prefs backend down");
      return { in_app: true, email: true, sms: true, whatsapp: true, push: false };
    },
  });

  // userA fails open to default channels (WhatsApp allowed) and userB is
  // completely unaffected — one bad prefs lookup must never strand the
  // rest of the group.
  assert.equal(result.status, "queued");
  assert.equal(result.whatsappQueued, 2);
  assert.match(JSON.stringify(logger.records), /preference lookup failed/);
});
