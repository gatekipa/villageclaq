import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const sourcePath = new URL("../src/lib/loan-overdue-producer.ts", import.meta.url);
const cronPath = new URL("../src/app/api/cron/loan-overdue-reminders/route.ts", import.meta.url);
const vercelJsonPath = new URL("../vercel.json", import.meta.url);
const require = createRequire(import.meta.url);

const ids = {
  loan: "11111111-1111-4111-8111-111111111111",
  completedLoan: "22222222-2222-4222-8222-222222222222",
  paidUpLoan: "33333333-3333-4333-8333-333333333333",
  proxyLoan: "44444444-4444-4444-8444-444444444444",
  membership: "66666666-6666-4666-8666-666666666666",
  proxyMembership: "77777777-7777-4777-8777-777777777777",
  user: "88888888-8888-4888-8888-888888888888",
  group: "99999999-9999-4999-8999-999999999999",
};

const fullPhone = ["+1", "301", "433", "5857"].join("");
const proxyPhone = ["+237", "650", "11", "22", "33"].join("");
const REMINDER_DATE = "2026-06-15";

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
    if (id === "@/lib/date-utils") {
      return { getDateLocale: (locale) => (locale === "fr" ? "fr-FR" : "en-US") };
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
      return { WA_TEMPLATES: { LOAN_OVERDUE: "villageclaq_loan_overdue" } };
    }
    return require(id);
  };

  vm.runInNewContext(compiled, { console, exports: cjsModule.exports, module: cjsModule, require: localRequire }, { filename: sourcePath.pathname });
  return cjsModule.exports;
}

function createMockSupabase(options = {}) {
  const state = {
    loans: {
      [ids.loan]: { id: ids.loan, group_id: ids.group, membership_id: ids.membership, currency: "XAF", status: "repaying" },
      [ids.completedLoan]: { id: ids.completedLoan, group_id: ids.group, membership_id: ids.membership, currency: "XAF", status: "completed" },
      [ids.paidUpLoan]: { id: ids.paidUpLoan, group_id: ids.group, membership_id: ids.membership, currency: "XAF", status: "repaying" },
      [ids.proxyLoan]: { id: ids.proxyLoan, group_id: ids.group, membership_id: ids.proxyMembership, currency: "XAF", status: "repaying" },
    },
    // Keyed by loan id. NOTE: the first installment is deliberately status
    // "pending" (NOT "overdue") — nothing server-side ever sets the overdue
    // flag, so eligibility must work without it.
    installments: {
      [ids.loan]: [
        { id: "inst-1", due_date: "2026-05-15", amount_due: 10000, amount_paid: 2500, status: "pending" },
        { id: "inst-2", due_date: "2026-06-01", amount_due: 10000, amount_paid: 0, status: "overdue" },
      ],
      [ids.paidUpLoan]: [
        { id: "inst-3", due_date: "2026-05-15", amount_due: 10000, amount_paid: 10000, status: "partial" },
      ],
      [ids.proxyLoan]: [
        { id: "inst-4", due_date: "2026-06-01", amount_due: 5000, amount_paid: 0, status: "pending" },
      ],
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
    proxyMembership: {
      id: ids.proxyMembership,
      group_id: ids.group,
      user_id: null,
      display_name: "Mama Ngozi",
      is_proxy: true,
      phone: null,
      privacy_settings: { proxy_phone: proxyPhone },
      membership_status: "active",
    },
    profile: { id: ids.user, full_name: "Jude Anyere", phone: fullPhone, preferred_locale: "en" },
    group: { id: ids.group, name: "Njimafor Diaspora", currency: "XAF" },
    existingQueueRows: [], // { loanId, reminderDate }
    insertErrorCode: null,
    authPhone: null,
    ...options,
  };
  const calls = [];

  class Builder {
    constructor(table) { this.table = table; this.filters = []; this.inFilters = []; this.ltFilters = []; this.operation = "select"; }
    select() { return this; }
    insert(payload) { this.operation = "insert"; calls.push({ op: "insert", table: this.table, payload }); return this; }
    eq(column, value) { this.filters.push({ column, value }); return this; }
    in(column, values) { this.inFilters.push({ column, values }); return this; }
    lt(column, value) { this.ltFilters.push({ column, value }); return this; }
    order() { return this; }
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
      if (this.table === "loan_schedule") {
        // Genuinely honors the producer's filters so the no-overdue-flag
        // eligibility and the past-due cutoff are really exercised.
        const loanId = this.filters.find((f) => f.column === "loan_id")?.value;
        const statuses = this.inFilters.find((f) => f.column === "status")?.values || [];
        const dueBefore = this.ltFilters.find((f) => f.column === "due_date")?.value;
        const rows = (state.installments[loanId] || [])
          .filter((row) => statuses.includes(row.status))
          .filter((row) => (dueBefore ? row.due_date < dueBefore : true))
          .sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
        return Promise.resolve(resolve({ data: rows, error: null }));
      }
      return Promise.resolve(resolve({ data: [selectSingle(this.table, this.filters, state)].filter(Boolean), error: null }));
    }
  }

  return {
    calls,
    auth: { admin: { async getUserById() { return { data: { user: state.authPhone ? { phone: state.authPhone } : null }, error: null }; } } },
    from(table) { return new Builder(table); },
  };
}

function filterValue(filters, column) {
  return filters.find((f) => f.column === column)?.value;
}

function selectSingle(table, filters, state) {
  if (table === "loans") return state.loans[filterValue(filters, "id")] || null;
  if (table === "memberships") {
    const requestedId = filterValue(filters, "id");
    if (requestedId === ids.proxyMembership) return state.proxyMembership;
    return state.membership;
  }
  if (table === "profiles") return state.profile;
  if (table === "groups") return state.group;
  if (table === "notifications_queue") {
    if (filterValue(filters, "template") !== "loan_overdue") return null;
    const loanId = filterValue(filters, "data->>loanId");
    const reminderDate = filterValue(filters, "data->>reminderDate");
    const match = state.existingQueueRows.find((r) => r.loanId === loanId && r.reminderDate === reminderDate);
    return match ? { id: "existing-queue", status: "queued" } : null;
  }
  return null;
}

function createLogger() {
  const records = [];
  return { records, log(...args) { records.push(args); }, warn(...args) { records.push(args); } };
}

test("an overdue repaying loan queues exactly one row quoting the EARLIEST overdue installment", async () => {
  const { produceLoanOverdueNotification } = loadProducer();
  const supabase = createMockSupabase();
  const logger = createLogger();

  const result = await produceLoanOverdueNotification(supabase, ids.loan, {
    logger,
    reminderDate: REMINDER_DATE,
  });

  assert.equal(result.status, "queued");
  assert.equal(result.template, "villageclaq_loan_overdue");
  assert.equal(result.reminderDate, REMINDER_DATE);

  const queueInserts = supabase.calls.filter((c) => c.op === "insert" && c.table === "notifications_queue");
  assert.equal(queueInserts.length, 1, "expected exactly one WhatsApp queue insert");

  const payload = queueInserts[0].payload;
  assert.equal(payload.channel, "whatsapp");
  assert.equal(payload.template, "loan_overdue");
  assert.equal(payload.data.whatsappType, "loan_overdue");
  assert.equal(payload.data.loanId, ids.loan);
  assert.equal(payload.data.reminderDate, REMINDER_DATE);
  assert.deepEqual(Object.keys(payload.data.whatsappData), ["memberName", "amount", "dueDate", "groupName"]);
  for (const [key, value] of Object.entries(payload.data.whatsappData)) {
    assert.ok(String(value).length > 0, `${key} must be non-empty`);
  }
  // Earliest installment (2026-05-15, status "pending" — the lazy overdue
  // flag is NOT required) with its outstanding balance: 10,000 - 2,500.
  // The due date renders in the recipient's locale (en-US here).
  assert.equal(payload.data.whatsappData.amount, "7,500 FCFA");
  assert.equal(payload.data.whatsappData.dueDate, "May 15, 2026");
  assert.equal(payload.data.whatsappData.groupName, "Njimafor Diaspora");

  const logText = JSON.stringify(logger.records);
  assert.match(logText, /\+130\*{6}857/);
  assert.doesNotMatch(logText, new RegExp(fullPhone.replace("+", "\\+")));
});

test("recipient's French preferred locale wins over the caller's", async () => {
  const { produceLoanOverdueNotification } = loadProducer();
  const supabase = createMockSupabase({
    profile: { id: ids.user, full_name: "Jude Anyere", phone: fullPhone, preferred_locale: "fr" },
  });

  const result = await produceLoanOverdueNotification(supabase, ids.loan, {
    reminderDate: REMINDER_DATE,
    locale: "en",
  });

  assert.equal(result.status, "queued");
  const payload = supabase.calls.find((c) => c.op === "insert").payload;
  assert.equal(payload.data.locale, "fr");
  // The due date localizes with the recipient's locale too.
  assert.equal(payload.data.whatsappData.dueDate, "15 mai 2026");
});

test("non-repaying loans (completed/defaulted/written off) are never nagged", async () => {
  const { produceLoanOverdueNotification } = loadProducer();
  const supabase = createMockSupabase();

  const result = await produceLoanOverdueNotification(supabase, ids.completedLoan, {
    reminderDate: REMINDER_DATE,
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "loan_not_repaying");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("a loan whose past-due installments are fully paid skips", async () => {
  const { produceLoanOverdueNotification } = loadProducer();
  const supabase = createMockSupabase();

  const result = await produceLoanOverdueNotification(supabase, ids.paidUpLoan, {
    reminderDate: REMINDER_DATE,
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "no_overdue_installment");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("same-day cron rerun does not duplicate", async () => {
  const { produceLoanOverdueNotification } = loadProducer();
  const supabase = createMockSupabase({
    existingQueueRows: [{ loanId: ids.loan, reminderDate: REMINDER_DATE }],
  });

  const result = await produceLoanOverdueNotification(supabase, ids.loan, {
    reminderDate: REMINDER_DATE,
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "duplicate_whatsapp_overdue");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("the next day's run reminds again while the loan stays overdue", async () => {
  const { produceLoanOverdueNotification } = loadProducer();
  const supabase = createMockSupabase({
    existingQueueRows: [{ loanId: ids.loan, reminderDate: REMINDER_DATE }],
  });

  const result = await produceLoanOverdueNotification(supabase, ids.loan, {
    reminderDate: "2026-06-16",
  });

  assert.equal(result.status, "queued");
  const payload = supabase.calls.find((c) => c.op === "insert").payload;
  assert.equal(payload.data.reminderDate, "2026-06-16");
});

test("proxy borrowers are included via proxy_phone", async () => {
  const { produceLoanOverdueNotification } = loadProducer();
  const supabase = createMockSupabase();

  const result = await produceLoanOverdueNotification(supabase, ids.proxyLoan, {
    reminderDate: REMINDER_DATE,
  });

  assert.equal(result.status, "queued");
  const payload = supabase.calls.find((c) => c.op === "insert").payload;
  assert.equal(payload.data.recipient, proxyPhone);
  assert.equal(payload.user_id, null);
});

test("producer gates on loan_updates preferences and skips when WhatsApp disabled", async () => {
  const { produceLoanOverdueNotification } = loadProducer();
  const supabase = createMockSupabase();
  const channelCalls = [];

  const result = await produceLoanOverdueNotification(supabase, ids.loan, {
    reminderDate: REMINDER_DATE,
    getChannels: async (client, userId, notificationType, groupId) => {
      channelCalls.push({ userId, notificationType, groupId });
      return { in_app: true, email: true, sms: true, whatsapp: false, push: false };
    },
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "whatsapp_disabled");
  assert.equal(channelCalls[0].notificationType, "loan_updates");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("missing phone skips safely", async () => {
  const { produceLoanOverdueNotification } = loadProducer();
  const supabase = createMockSupabase({
    profile: { id: ids.user, full_name: "Jude Anyere", phone: null, preferred_locale: "en" },
    authPhone: null,
  });

  const result = await produceLoanOverdueNotification(supabase, ids.loan, {
    reminderDate: REMINDER_DATE,
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "missing_phone");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("unique-violation race (23505) is treated as a duplicate skip", async () => {
  const { produceLoanOverdueNotification } = loadProducer();
  const supabase = createMockSupabase({ insertErrorCode: "23505" });

  const result = await produceLoanOverdueNotification(supabase, ids.loan, {
    reminderDate: REMINDER_DATE,
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "duplicate_whatsapp_overdue");
});

test("the cron is queue-backed, secret-gated, and never requires the lazy overdue flag", () => {
  const cron = fs.readFileSync(cronPath, "utf8");
  assert.match(cron, /Bearer \$\{cronSecret\}/);
  assert.match(cron, /produceLoanOverdueNotification/);
  assert.doesNotMatch(cron, /dispatchWhatsApp/);
  // Eligibility accepts unpaid statuses — never only "overdue".
  assert.match(cron, /\.in\("status", \["pending", "partial", "overdue"\]\)/);
  assert.match(cron, /\.eq\("loans\.status", "repaying"\)/);
  assert.match(cron, /WHATSAPP_BATCH_SIZE = 25/);

  const vercelJson = JSON.parse(fs.readFileSync(vercelJsonPath, "utf8"));
  const crons = vercelJson.crons || [];
  const overdueCron = crons.find((c) => c.path === "/api/cron/loan-overdue-reminders");
  assert.ok(overdueCron, "loan-overdue-reminders cron must be scheduled");
  assert.equal(overdueCron.schedule, "0 10 * * *");
  // Existing schedules untouched.
  assert.equal(crons.find((c) => c.path === "/api/cron/payment-reminders")?.schedule, "0 8 * * *");
  assert.equal(crons.find((c) => c.path === "/api/cron/drain-notification-queue")?.schedule, "*/15 * * * *");
});
