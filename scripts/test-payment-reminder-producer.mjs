import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const sourcePath = new URL("../src/lib/payment-reminder-producer.ts", import.meta.url);
const cronPath = new URL("../src/app/api/cron/payment-reminders/route.ts", import.meta.url);
const vercelJsonPath = new URL("../vercel.json", import.meta.url);
const require = createRequire(import.meta.url);

const ids = {
  obligation: "11111111-1111-4111-8111-111111111111",
  typelessObligation: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  paidObligation: "22222222-2222-4222-8222-222222222222",
  waivedObligation: "33333333-3333-4333-8333-333333333333",
  futureObligation: "44444444-4444-4444-8444-444444444444",
  settledObligation: "55555555-5555-4555-8555-555555555555",
  duplicateObligation: "66666666-6666-4666-8666-666666666666",
  membership: "77777777-7777-4777-8777-777777777777",
  user: "88888888-8888-4888-8888-888888888888",
  group: "99999999-9999-4999-8999-999999999999",
  contributionType: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};

const fullPhone = ["+1", "301", "433", "5857"].join("");
const REMINDER_DATE = "2026-06-15";

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
    if (id === "@/lib/currencies") {
      return { formatAmount: (amount, currency) => `${Number(amount).toLocaleString("en-US")} ${currency}` };
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
      return { WA_TEMPLATES: { PAYMENT_REMINDER: "villageclaq_payment_reminder_v2" } };
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
    obligation: {
      id: ids.obligation,
      contribution_type_id: ids.contributionType,
      membership_id: ids.membership,
      group_id: ids.group,
      amount: "5000",
      amount_paid: "1000",
      currency: "XAF",
      due_date: "2026-06-01",
      status: "pending",
    },
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
    group: { id: ids.group, name: "Njimafor Diaspora" },
    contributionType: { id: ids.contributionType, name: "Monthly Dues", name_fr: "Cotisation mensuelle" },
    // existingQueueRows: array of { obligationId, reminderDate } — the mock
    // honors the producer's day-bucket filters, so the dedupe logic is
    // genuinely exercised (same-day blocks, different day does not).
    existingQueueRows: [],
    insertErrorCode: null,
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
        if (state.insertErrorCode) {
          return Promise.resolve({ data: null, error: { code: state.insertErrorCode, message: "duplicate key value" } });
        }
        return Promise.resolve({ data: { id: "new-row" }, error: null });
      }
      return Promise.resolve({ data: selectRow(this.table, this.filters, state), error: null });
    }

    single() {
      return this.maybeSingle();
    }

    then(resolve) {
      if (this.operation === "insert") {
        if (state.insertErrorCode) {
          return Promise.resolve(resolve({ data: null, error: { code: state.insertErrorCode, message: "duplicate key value" } }));
        }
        return Promise.resolve(resolve({ data: [{ id: "new-row" }], error: null }));
      }
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
    from(table) {
      return new Builder(table);
    },
  };
}

function filterValue(filters, column) {
  return filters.find((f) => f.column === column)?.value;
}

function selectRow(table, filters, state) {
  if (table === "contribution_obligations") {
    const requestedId = filterValue(filters, "id");
    if (requestedId === ids.paidObligation) return { ...state.obligation, id: ids.paidObligation, status: "paid" };
    if (requestedId === ids.waivedObligation) return { ...state.obligation, id: ids.waivedObligation, status: "waived" };
    if (requestedId === ids.futureObligation) return { ...state.obligation, id: ids.futureObligation, due_date: "2030-01-01" };
    if (requestedId === ids.settledObligation) return { ...state.obligation, id: ids.settledObligation, amount: "1000", amount_paid: "1000" };
    if (requestedId === ids.duplicateObligation) return { ...state.obligation, id: ids.duplicateObligation };
    if (requestedId === ids.typelessObligation) return { ...state.obligation, id: ids.typelessObligation, contribution_type_id: null };
    if (requestedId === state.obligation.id) return state.obligation;
    return null;
  }
  if (table === "memberships") return state.membership;
  if (table === "profiles") return state.profile;
  if (table === "groups") return state.group;
  if (table === "contribution_types") return state.contributionType;
  if (table === "notifications_queue") {
    const obligationId = filterValue(filters, "data->>obligationId");
    const reminderDate = filterValue(filters, "data->>reminderDate");
    const match = state.existingQueueRows.find(
      (r) => r.obligationId === obligationId && r.reminderDate === reminderDate,
    );
    return match ? { id: "existing-queue", status: "queued" } : null;
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

test("overdue obligation queues exactly one WhatsApp reminder with non-empty ordered variables", async () => {
  const { producePaymentReminderNotification } = loadProducer();
  const supabase = createMockSupabase();
  const logger = createLogger();

  const result = await producePaymentReminderNotification(supabase, ids.obligation, {
    logger,
    reminderDate: REMINDER_DATE,
  });

  assert.equal(result.status, "queued");
  assert.equal(result.template, "villageclaq_payment_reminder_v2");
  assert.equal(result.reminderDate, REMINDER_DATE);

  const queueInserts = supabase.calls.filter((c) => c.op === "insert" && c.table === "notifications_queue");
  assert.equal(queueInserts.length, 1, "expected exactly one WhatsApp queue insert");

  const payload = queueInserts[0].payload;
  assert.equal(payload.channel, "whatsapp");
  assert.equal(payload.template, "payment_reminder");
  assert.equal(payload.data.whatsappType, "payment_reminder");
  assert.equal(payload.data.template, "villageclaq_payment_reminder_v2");
  assert.equal(payload.data.obligationId, ids.obligation);
  assert.equal(payload.data.reminderDate, REMINDER_DATE);
  assert.deepEqual(
    Object.keys(payload.data.whatsappData),
    ["memberName", "amount", "contributionType", "dueDate", "groupName"],
  );
  for (const [key, value] of Object.entries(payload.data.whatsappData)) {
    assert.ok(String(value).length > 0, `${key} must be non-empty`);
  }
  assert.equal(payload.data.whatsappData.memberName, "Jude Anyere");
  assert.equal(payload.data.whatsappData.amount, "4,000 XAF");
  assert.equal(payload.data.whatsappData.contributionType, "Monthly Dues");
  assert.equal(payload.data.whatsappData.dueDate, "2026-06-01");
  assert.equal(payload.data.locale, "en");

  // WhatsApp-only producer — no other table writes.
  assert.equal(supabase.calls.some((c) => c.op === "insert" && c.table !== "notifications_queue"), false);

  const logText = JSON.stringify(logger.records);
  assert.match(logText, /\+130\*{6}857/);
  assert.doesNotMatch(logText, new RegExp(fullPhone.replace("+", "\\+")));
});

test("recipient's French preferred locale wins and picks name_fr", async () => {
  const { producePaymentReminderNotification } = loadProducer();
  const supabase = createMockSupabase({
    profile: { id: ids.user, full_name: "Jude Anyere", phone: fullPhone, preferred_locale: "fr" },
  });

  const result = await producePaymentReminderNotification(supabase, ids.obligation, {
    reminderDate: REMINDER_DATE,
    locale: "en",
  });

  assert.equal(result.status, "queued");
  const payload = supabase.calls.find((c) => c.op === "insert" && c.table === "notifications_queue").payload;
  assert.equal(payload.data.locale, "fr");
  assert.equal(payload.data.whatsappData.contributionType, "Cotisation mensuelle");
});

test("paid, waived, future, and settled obligations are never reminded", async () => {
  const { producePaymentReminderNotification } = loadProducer();
  const cases = [
    [ids.paidObligation, "obligation_not_remindable"],
    [ids.waivedObligation, "obligation_not_remindable"],
    [ids.futureObligation, "obligation_not_due"],
    [ids.settledObligation, "obligation_settled"],
  ];

  for (const [obligationId, reason] of cases) {
    const supabase = createMockSupabase();
    const result = await producePaymentReminderNotification(supabase, obligationId, {
      reminderDate: REMINDER_DATE,
    });
    assert.equal(result.status, "skipped", `${reason} case should skip`);
    assert.equal(result.reason, reason);
    assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
  }
});

test("proxy membership is never reminded (cron parity)", async () => {
  const { producePaymentReminderNotification } = loadProducer();
  const supabase = createMockSupabase({
    membership: {
      id: ids.membership,
      group_id: ids.group,
      user_id: null,
      display_name: null,
      is_proxy: true,
      phone: null,
      privacy_settings: { proxy_name: "Mama Ngozi", proxy_phone: fullPhone },
      membership_status: "active",
    },
    profile: null,
  });

  const result = await producePaymentReminderNotification(supabase, ids.obligation, {
    reminderDate: REMINDER_DATE,
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "proxy_membership");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("non-active membership is never reminded", async () => {
  const { producePaymentReminderNotification } = loadProducer();
  const supabase = createMockSupabase({
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
  });

  const result = await producePaymentReminderNotification(supabase, ids.obligation, {
    reminderDate: REMINDER_DATE,
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "membership_not_active");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("producer gates on payment_reminders preferences and skips when WhatsApp disabled", async () => {
  const { producePaymentReminderNotification } = loadProducer();
  const supabase = createMockSupabase();
  const channelCalls = [];

  const result = await producePaymentReminderNotification(supabase, ids.obligation, {
    reminderDate: REMINDER_DATE,
    getChannels: async (client, userId, notificationType, groupId) => {
      channelCalls.push({ userId, notificationType, groupId });
      return { in_app: true, email: true, sms: true, whatsapp: false, push: false };
    },
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "whatsapp_disabled");
  assert.equal(channelCalls[0].notificationType, "payment_reminders");
  assert.equal(channelCalls[0].groupId, ids.group);
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("missing phone skips safely", async () => {
  const { producePaymentReminderNotification } = loadProducer();
  const supabase = createMockSupabase({
    profile: { id: ids.user, full_name: "Jude Anyere", phone: null, preferred_locale: "en" },
    authPhone: null,
  });

  const result = await producePaymentReminderNotification(supabase, ids.obligation, {
    reminderDate: REMINDER_DATE,
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "missing_phone");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("same-day rerun is blocked; the next day reminds again", async () => {
  const { producePaymentReminderNotification } = loadProducer();
  const supabase = createMockSupabase({
    existingQueueRows: [{ obligationId: ids.duplicateObligation, reminderDate: REMINDER_DATE }],
  });

  // Same day bucket → duplicate skip.
  const sameDay = await producePaymentReminderNotification(supabase, ids.duplicateObligation, {
    reminderDate: REMINDER_DATE,
  });
  assert.equal(sameDay.status, "skipped");
  assert.equal(sameDay.reason, "duplicate_whatsapp_reminder");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);

  // Next day bucket → queues again (daily cadence preserved).
  const nextDay = await producePaymentReminderNotification(supabase, ids.duplicateObligation, {
    reminderDate: "2026-06-16",
  });
  assert.equal(nextDay.status, "queued");
  const queueInserts = supabase.calls.filter((c) => c.op === "insert" && c.table === "notifications_queue");
  assert.equal(queueInserts.length, 1);
  assert.equal(queueInserts[0].payload.data.reminderDate, "2026-06-16");
});

test("missing contribution type yields no blank variables — skipped safely", async () => {
  const { producePaymentReminderNotification } = loadProducer();
  const supabase = createMockSupabase();

  const result = await producePaymentReminderNotification(supabase, ids.typelessObligation, {
    reminderDate: REMINDER_DATE,
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "missing_template_data");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("unique-violation race (23505) is treated as a duplicate skip", async () => {
  const { producePaymentReminderNotification } = loadProducer();
  const supabase = createMockSupabase({ insertErrorCode: "23505" });

  const result = await producePaymentReminderNotification(supabase, ids.obligation, {
    reminderDate: REMINDER_DATE,
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "duplicate_whatsapp_reminder");
});

test("cron no longer dispatches WhatsApp directly and keeps email/SMS untouched", () => {
  const source = fs.readFileSync(cronPath, "utf8");

  assert.doesNotMatch(source, /dispatchWhatsAppWithResult/);
  assert.doesNotMatch(source, /dispatchWhatsApp\(/);
  assert.match(source, /producePaymentReminderNotification/);
  // Email and SMS paths are preserved.
  assert.match(source, /sendEmail\(/);
  assert.match(source, /sendSmsNotification\(/);
  assert.match(source, /template: "payment-reminder"/);
});

test("cron schedule remains daily at 08:00 UTC", () => {
  const vercel = JSON.parse(fs.readFileSync(vercelJsonPath, "utf8"));
  const entry = (vercel.crons || []).find((c) => c.path === "/api/cron/payment-reminders");
  assert.ok(entry, "payment-reminders cron entry must exist");
  assert.equal(entry.schedule, "0 8 * * *");
});
