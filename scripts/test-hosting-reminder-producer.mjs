import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const sourcePath = new URL("../src/lib/hosting-reminder-producer.ts", import.meta.url);
const cronPath = new URL("../src/app/api/cron/hosting-reminders/route.ts", import.meta.url);
const require = createRequire(import.meta.url);

const ids = {
  assignment: "11111111-1111-4111-8111-111111111111",
  completedAssignment: "22222222-2222-4222-8222-222222222222",
  pastAssignment: "33333333-3333-4333-8333-333333333333",
  unknownAssignment: "44444444-4444-4444-8444-444444444444",
  roster: "55555555-5555-4555-8555-555555555555",
  membership: "66666666-6666-4666-8666-666666666666",
  user: "77777777-7777-4777-8777-777777777777",
  group: "88888888-8888-4888-8888-888888888888",
};

const fullPhone = ["+1", "301", "433", "5857"].join("");
const TODAY = "2026-06-15";
const futureDate = "2030-07-15";

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
      return { WA_TEMPLATES: { HOSTING_REMINDER: "villageclaq_hosting_reminder" } };
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
    assignment: {
      id: ids.assignment,
      roster_id: ids.roster,
      membership_id: ids.membership,
      assigned_date: futureDate,
      status: "upcoming",
    },
    roster: { id: ids.roster, group_id: ids.group, is_active: true },
    group: { id: ids.group, name: "Njimafor Diaspora", is_active: true },
    membership: {
      id: ids.membership,
      group_id: ids.group,
      user_id: ids.user,
      display_name: "Jude Anyere",
      is_proxy: false,
      phone: null,
      privacy_settings: {},
      membership_status: "active",
    },
    profile: {
      id: ids.user,
      full_name: "Jude Anyere",
      phone: fullPhone,
      preferred_locale: "en",
    },
    // queueRows: in-memory notifications_queue. The mock honors the
    // producer's (data->>assignmentId, data->>assignedDate) filters AND
    // appends on insert, so calling the producer twice genuinely exercises
    // the dedupe — this is the regression proof for the legacy cron's
    // broken body-LIKE dedup that re-sent daily.
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
      this.payload = null;
      this.operation = "select";
    }

    select(columns) {
      this.columns = columns;
      return this;
    }

    insert(payload) {
      this.operation = "insert";
      this.payload = payload;
      calls.push({ op: "insert", table: this.table, payload });
      return this;
    }

    eq(column, value) {
      this.filters.push({ column, value });
      return this;
    }

    limit() {
      return this;
    }

    maybeSingle() {
      if (this.operation === "insert") {
        return this.resolveInsert();
      }
      if ((state.selectErrorTables || []).includes(this.table)) {
        return Promise.resolve({ data: null, error: { message: "transient lookup failure" } });
      }
      return Promise.resolve({ data: selectRow(this.table, this.filters, state), error: null });
    }

    single() {
      return this.maybeSingle();
    }

    resolveInsert() {
      if (state.insertErrorCode) {
        return Promise.resolve({ data: null, error: { code: state.insertErrorCode, message: "duplicate key value" } });
      }
      if (this.table === "notifications_queue") {
        state.queueRows.push({
          assignmentId: this.payload.data?.assignmentId,
          assignedDate: this.payload.data?.assignedDate,
          status: this.payload.status || "queued",
        });
      }
      return Promise.resolve({ data: { id: "new-row" }, error: null });
    }

    then(resolve) {
      if (this.operation === "insert") {
        return this.resolveInsert().then(resolve);
      }
      return Promise.resolve(resolve({ data: [selectRow(this.table, this.filters, state)].filter(Boolean), error: null }));
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
    from(table) {
      return new Builder(table);
    },
  };
}

function filterValue(filters, column) {
  return filters.find((f) => f.column === column)?.value;
}

function selectRow(table, filters, state) {
  if (table === "hosting_assignments") {
    const requestedId = filterValue(filters, "id");
    if (requestedId === ids.completedAssignment) return { ...state.assignment, id: ids.completedAssignment, status: "completed" };
    if (requestedId === ids.pastAssignment) return { ...state.assignment, id: ids.pastAssignment, assigned_date: "2020-01-01" };
    if (requestedId === state.assignment.id) return state.assignment;
    return null;
  }
  if (table === "hosting_rosters") return state.roster;
  if (table === "groups") return state.group;
  if (table === "memberships") return state.membership;
  if (table === "profiles") return state.profile;
  if (table === "notifications_queue") {
    const assignmentId = filterValue(filters, "data->>assignmentId");
    const assignedDate = filterValue(filters, "data->>assignedDate");
    const match = state.queueRows.find(
      (r) => r.assignmentId === assignmentId && r.assignedDate === assignedDate,
    );
    return match ? { id: "existing-queue", status: match.status } : null;
  }
  return null;
}

function createLogger() {
  const records = [];
  return {
    records,
    log(...args) {
      records.push(args);
    },
    warn(...args) {
      records.push(args);
    },
  };
}

test("upcoming assignment queues exactly one WhatsApp reminder with the exact row shape", async () => {
  const { produceHostingReminderNotification } = loadProducer();
  const supabase = createMockSupabase();
  const logger = createLogger();

  const result = await produceHostingReminderNotification(supabase, ids.assignment, {
    logger,
    todayDate: TODAY,
  });

  assert.equal(result.status, "queued");
  assert.equal(result.template, "villageclaq_hosting_reminder");
  assert.equal(result.assignedDate, futureDate);
  assert.equal(result.whatsappQueued, true);

  const queueInserts = supabase.calls.filter((c) => c.op === "insert" && c.table === "notifications_queue");
  assert.equal(queueInserts.length, 1, "expected exactly one WhatsApp queue insert");

  const payload = queueInserts[0].payload;
  assert.equal(payload.user_id, ids.user);
  assert.equal(payload.channel, "whatsapp");
  assert.equal(payload.template, "hosting_reminder");
  assert.equal(payload.status, "queued");
  assert.equal(payload.data.whatsappType, "hosting_reminder");
  assert.equal(payload.data.template, "villageclaq_hosting_reminder");
  assert.equal(payload.data.assignmentId, ids.assignment);
  assert.equal(payload.data.rosterId, ids.roster);
  assert.equal(payload.data.membershipId, ids.membership);
  assert.equal(payload.data.groupId, ids.group);
  // Dedup key material is the raw ISO date; the DISPLAY date is formatted.
  assert.equal(payload.data.assignedDate, futureDate);
  assert.equal(payload.data.whatsappData.hostingDate, "Jul 15, 2030");
  assert.deepEqual(Object.keys(payload.data.whatsappData), ["memberName", "hostingDate", "groupName"]);
  for (const [key, value] of Object.entries(payload.data.whatsappData)) {
    assert.ok(String(value).length > 0, `${key} must be non-empty`);
  }
  assert.equal(payload.data.whatsappData.memberName, "Jude Anyere");
  assert.equal(payload.data.whatsappData.groupName, "Njimafor Diaspora");
  assert.equal(payload.data.locale, "en");

  // WhatsApp-only producer — no other table writes.
  assert.equal(supabase.calls.some((c) => c.op === "insert" && c.table !== "notifications_queue"), false);

  // Masked logging: the masked form appears, the full phone never does.
  const logText = JSON.stringify(logger.records);
  assert.match(logText, /\+130\*{6}857/);
  assert.doesNotMatch(logText, new RegExp(fullPhone.replace("+", "\\+")));
});

test("REGRESSION: same assignment produced twice enqueues exactly one row", async () => {
  const { produceHostingReminderNotification } = loadProducer();
  const supabase = createMockSupabase();

  const first = await produceHostingReminderNotification(supabase, ids.assignment, { todayDate: TODAY });
  assert.equal(first.status, "queued");

  // The legacy cron's body-LIKE dedup never matched, so every daily run
  // re-sent. The producer's (assignmentId, assignedDate) dedupe must block.
  const second = await produceHostingReminderNotification(supabase, ids.assignment, { todayDate: TODAY });
  assert.equal(second.status, "skipped");
  assert.equal(second.reason, "duplicate_whatsapp_reminder");

  assert.equal(supabase.state.queueRows.length, 1, "queue must hold exactly one row after a rerun");
});

test("existing FAILED queue row still blocks re-enqueue (old failures are never retried)", async () => {
  const { produceHostingReminderNotification } = loadProducer();
  const supabase = createMockSupabase({
    queueRows: [{ assignmentId: ids.assignment, assignedDate: futureDate, status: "failed" }],
  });

  const result = await produceHostingReminderNotification(supabase, ids.assignment, { todayDate: TODAY });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "duplicate_whatsapp_reminder");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("unique-violation race (23505) is treated as a duplicate skip", async () => {
  const { produceHostingReminderNotification } = loadProducer();
  const supabase = createMockSupabase({ insertErrorCode: "23505" });

  const result = await produceHostingReminderNotification(supabase, ids.assignment, { todayDate: TODAY });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "duplicate_whatsapp_reminder");
});

test("rescheduled assignment (new assigned_date) legitimately re-reminds", async () => {
  const { produceHostingReminderNotification } = loadProducer();
  const supabase = createMockSupabase({
    // Reminder already sent for the OLD scheduled date.
    queueRows: [{ assignmentId: ids.assignment, assignedDate: "2030-07-01", status: "sent" }],
  });

  const result = await produceHostingReminderNotification(supabase, ids.assignment, { todayDate: TODAY });

  assert.equal(result.status, "queued");
  assert.equal(supabase.state.queueRows.length, 2, "new scheduled date must produce a new row");
  const newRow = supabase.state.queueRows.find((r) => r.assignedDate === futureDate);
  assert.ok(newRow, "queued row must carry the new ISO assigned_date");
});

test("ineligible assignments are skipped with precise reasons", async () => {
  const { produceHostingReminderNotification } = loadProducer();
  const cases = [
    [ids.unknownAssignment, {}, "assignment_not_found"],
    [ids.completedAssignment, {}, "assignment_not_upcoming"],
    [ids.pastAssignment, {}, "assignment_in_past"],
    [ids.assignment, { roster: { id: ids.roster, group_id: ids.group, is_active: false } }, "roster_inactive"],
    [ids.assignment, { group: { id: ids.group, name: "Njimafor Diaspora", is_active: false } }, "group_inactive"],
    [
      ids.assignment,
      {
        membership: {
          id: ids.membership,
          group_id: ids.group,
          user_id: ids.user,
          display_name: "Jude Anyere",
          is_proxy: false,
          phone: null,
          privacy_settings: {},
          membership_status: "exited",
        },
      },
      "membership_not_active",
    ],
    [
      ids.assignment,
      { profile: { id: ids.user, full_name: "Jude Anyere", phone: null, preferred_locale: "en" } },
      "missing_phone",
    ],
    [
      ids.assignment,
      { profile: { id: ids.user, full_name: "Jude Anyere", phone: "12", preferred_locale: "en" } },
      "invalid_phone",
    ],
    [
      ids.assignment,
      { group: { id: ids.group, name: "", is_active: true } },
      "missing_template_data",
    ],
  ];

  for (const [assignmentId, overrides, reason] of cases) {
    const supabase = createMockSupabase(overrides);
    const result = await produceHostingReminderNotification(supabase, assignmentId, { todayDate: TODAY });
    assert.equal(result.status, "skipped", `${reason} case should skip`);
    assert.equal(result.reason, reason);
    assert.equal(supabase.calls.some((c) => c.op === "insert"), false, `${reason} case must not insert`);
  }
});

test("producer gates real users on hosting_reminders preferences and skips when WhatsApp disabled", async () => {
  const { produceHostingReminderNotification } = loadProducer();
  const supabase = createMockSupabase();
  const channelCalls = [];

  const result = await produceHostingReminderNotification(supabase, ids.assignment, {
    todayDate: TODAY,
    getChannels: async (client, userId, notificationType, groupId) => {
      channelCalls.push({ userId, notificationType, groupId });
      return { in_app: true, email: true, sms: true, whatsapp: false, push: false };
    },
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "whatsapp_disabled");
  assert.equal(channelCalls[0].notificationType, "hosting_reminders");
  assert.equal(channelCalls[0].groupId, ids.group);
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("proxy member is queued via proxy phone with null user_id and no prefs lookup", async () => {
  const { produceHostingReminderNotification } = loadProducer();
  const supabase = createMockSupabase({
    membership: {
      id: ids.membership,
      group_id: ids.group,
      user_id: null,
      display_name: null,
      is_proxy: true,
      phone: null,
      privacy_settings: { proxy_name: "Papa Mbarga", proxy_phone: fullPhone },
      membership_status: "active",
    },
    profile: null,
  });
  const channelCalls = [];

  const result = await produceHostingReminderNotification(supabase, ids.assignment, {
    todayDate: TODAY,
    getChannels: async (client, userId, notificationType, groupId) => {
      channelCalls.push({ userId, notificationType, groupId });
      return { in_app: true, email: true, sms: true, whatsapp: true, push: false };
    },
  });

  assert.equal(result.status, "queued");
  // Proxies have no user account — fail-open, no preference lookup.
  assert.equal(channelCalls.length, 0, "proxy path must not query preferences");

  const payload = supabase.calls.find((c) => c.op === "insert" && c.table === "notifications_queue").payload;
  assert.equal(payload.user_id, null);
  assert.equal(payload.data.user_id, null);
  assert.equal(payload.data.whatsappData.memberName, "Papa Mbarga");
  assert.equal(payload.data.assignedDate, futureDate);
});

test("recipient's French preferred locale wins and formats the display date in French", async () => {
  const { produceHostingReminderNotification } = loadProducer();
  const supabase = createMockSupabase({
    profile: { id: ids.user, full_name: "Jude Anyere", phone: fullPhone, preferred_locale: "fr" },
  });

  const result = await produceHostingReminderNotification(supabase, ids.assignment, {
    todayDate: TODAY,
    locale: "en",
  });

  assert.equal(result.status, "queued");
  const payload = supabase.calls.find((c) => c.op === "insert" && c.table === "notifications_queue").payload;
  assert.equal(payload.data.locale, "fr");
  assert.match(payload.data.whatsappData.hostingDate, /juil/i);
  // The dedup material stays the raw ISO date regardless of locale.
  assert.equal(payload.data.assignedDate, futureDate);
});

test("transient roster lookup failure is an error, not a silent skip", async () => {
  const { produceHostingReminderNotification } = loadProducer();
  const supabase = createMockSupabase({ selectErrorTables: ["hosting_rosters"] });
  const logger = createLogger();

  const result = await produceHostingReminderNotification(supabase, ids.assignment, {
    todayDate: TODAY,
    logger,
  });

  assert.equal(result.status, "error");
  assert.equal(result.reason, "roster_lookup_failed");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("cron route queues WhatsApp via the producer and never inserts an invalid notification type", () => {
  const source = fs.readFileSync(cronPath, "utf8");

  // No direct provider sends from the cron.
  assert.doesNotMatch(source, /dispatchWhatsApp/);
  assert.match(source, /produceHostingReminderNotification/);

  // Bug 1 regression: the in-app insert must use the valid "system" enum
  // value — the invalid enum literal must be gone.
  assert.equal(source.includes('type: "hosting_reminder"'), false, "invalid notification_type enum value must not be inserted");
  assert.ok(source.includes('type: "system"'), "in-app insert must use the valid system enum value");

  // Bug 2 regression: the locale-fragile body-LIKE dedup is gone, replaced
  // by an explicit dedup_key check.
  assert.equal(source.includes('.like("body"'), false, "body-LIKE dedup must be removed");
  assert.match(source, /dedup_key/);

  // Email and SMS paths are preserved.
  assert.match(source, /sendEmail\(/);
  assert.match(source, /sendSmsNotification\(/);
  assert.match(source, /template: "hosting-reminder"/);
});
