import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const sourcePath = new URL("../src/lib/loan-approved-producer.ts", import.meta.url);
const routePath = new URL("../src/app/api/loans/approval-notifications/route.ts", import.meta.url);
const loansPagePath = new URL("../src/app/[locale]/(dashboard)/dashboard/loans/page.tsx", import.meta.url);
const require = createRequire(import.meta.url);

const ids = {
  loan: "11111111-1111-4111-8111-111111111111",
  pendingLoan: "22222222-2222-4222-8222-222222222222",
  duplicateLoan: "33333333-3333-4333-8333-333333333333",
  proxyLoan: "44444444-4444-4444-8444-444444444444",
  membership: "66666666-6666-4666-8666-666666666666",
  proxyMembership: "77777777-7777-4777-8777-777777777777",
  user: "88888888-8888-4888-8888-888888888888",
  group: "99999999-9999-4999-8999-999999999999",
};

const fullPhone = ["+1", "301", "433", "5857"].join("");
const proxyPhone = ["+237", "650", "11", "22", "33"].join("");

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
      return { WA_TEMPLATES: { LOAN_APPROVED: "villageclaq_loan_approved" } };
    }
    return require(id);
  };

  vm.runInNewContext(compiled, { console, exports: cjsModule.exports, module: cjsModule, require: localRequire }, { filename: sourcePath.pathname });
  return cjsModule.exports;
}

function createMockSupabase(options = {}) {
  const state = {
    loan: {
      id: ids.loan,
      group_id: ids.group,
      membership_id: ids.membership,
      amount_requested: 50000,
      amount_approved: 40000,
      currency: "XAF",
      status: "approved",
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
    existingQueueRows: [], // { loanId }
    insertErrorCode: null,
    authPhone: null,
    ...options,
  };
  const calls = [];

  class Builder {
    constructor(table) { this.table = table; this.filters = []; this.operation = "select"; }
    select() { return this; }
    insert(payload) { this.operation = "insert"; calls.push({ op: "insert", table: this.table, payload }); return this; }
    eq(column, value) { this.filters.push({ column, value }); return this; }
    limit() { return this; }
    maybeSingle() {
      if (this.operation === "insert") {
        if (state.insertErrorCode) return Promise.resolve({ data: null, error: { code: state.insertErrorCode, message: "duplicate key value" } });
        return Promise.resolve({ data: { id: "new-row" }, error: null });
      }
      return Promise.resolve({ data: selectRow(this.table, this.filters, state), error: null });
    }
    single() { return this.maybeSingle(); }
    then(resolve) {
      if (this.operation === "insert") {
        if (state.insertErrorCode) return Promise.resolve(resolve({ data: null, error: { code: state.insertErrorCode, message: "duplicate key value" } }));
        return Promise.resolve(resolve({ data: [{ id: "new-row" }], error: null }));
      }
      return Promise.resolve(resolve({ data: [selectRow(this.table, this.filters, state)].filter(Boolean), error: null }));
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

function selectRow(table, filters, state) {
  if (table === "loans") {
    const requestedId = filterValue(filters, "id");
    if (requestedId === ids.pendingLoan) return { ...state.loan, id: ids.pendingLoan, status: "pending" };
    if (requestedId === ids.duplicateLoan) return { ...state.loan, id: ids.duplicateLoan };
    if (requestedId === ids.proxyLoan) return { ...state.loan, id: ids.proxyLoan, membership_id: ids.proxyMembership };
    if (requestedId === state.loan.id) return state.loan;
    return null;
  }
  if (table === "memberships") {
    const requestedId = filterValue(filters, "id");
    if (requestedId === ids.proxyMembership) return state.proxyMembership;
    return state.membership;
  }
  if (table === "profiles") return state.profile;
  if (table === "groups") return state.group;
  if (table === "notifications_queue") {
    // Honors the template filter too, so a drift in the dedup pre-check's
    // template key would fail these tests.
    if (filterValue(filters, "template") !== "loan_approved") return null;
    const loanId = filterValue(filters, "data->>loanId");
    const match = state.existingQueueRows.find((r) => r.loanId === loanId);
    return match ? { id: "existing-queue", status: "queued" } : null;
  }
  return null;
}

function createLogger() {
  const records = [];
  return { records, log(...args) { records.push(args); }, warn(...args) { records.push(args); } };
}

test("an approved loan queues exactly one WhatsApp row with ordered non-empty variables", async () => {
  const { produceLoanApprovedNotification } = loadProducer();
  const supabase = createMockSupabase();
  const logger = createLogger();

  const result = await produceLoanApprovedNotification(supabase, ids.loan, { logger });

  assert.equal(result.status, "queued");
  assert.equal(result.template, "villageclaq_loan_approved");

  const queueInserts = supabase.calls.filter((c) => c.op === "insert" && c.table === "notifications_queue");
  assert.equal(queueInserts.length, 1, "expected exactly one WhatsApp queue insert");

  const payload = queueInserts[0].payload;
  assert.equal(payload.channel, "whatsapp");
  assert.equal(payload.template, "loan_approved");
  assert.equal(payload.data.whatsappType, "loan_approved");
  assert.equal(payload.data.loanId, ids.loan);
  assert.deepEqual(Object.keys(payload.data.whatsappData), ["memberName", "amount", "groupName"]);
  for (const [key, value] of Object.entries(payload.data.whatsappData)) {
    assert.ok(String(value).length > 0, `${key} must be non-empty`);
  }
  // Borrower only; amount is the APPROVED amount, not the requested one.
  assert.equal(payload.data.whatsappData.amount, "40,000 FCFA");
  assert.equal(payload.data.whatsappData.groupName, "Njimafor Diaspora");
  assert.equal(payload.data.recipient, fullPhone);

  const logText = JSON.stringify(logger.records);
  assert.match(logText, /\+130\*{6}857/);
  assert.doesNotMatch(logText, new RegExp(fullPhone.replace("+", "\\+")));
});

test("recipient's French preferred locale wins over the caller's", async () => {
  const { produceLoanApprovedNotification } = loadProducer();
  const supabase = createMockSupabase({
    profile: { id: ids.user, full_name: "Jude Anyere", phone: fullPhone, preferred_locale: "fr" },
  });

  const result = await produceLoanApprovedNotification(supabase, ids.loan, { locale: "en" });
  assert.equal(result.status, "queued");
  const payload = supabase.calls.find((c) => c.op === "insert").payload;
  assert.equal(payload.data.locale, "fr");
});

test("a loan that is not approved (stale trigger after denial) skips", async () => {
  const { produceLoanApprovedNotification } = loadProducer();
  const supabase = createMockSupabase();

  const result = await produceLoanApprovedNotification(supabase, ids.pendingLoan, {});
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "loan_not_approved");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("repeated trigger for the same loan does not duplicate", async () => {
  const { produceLoanApprovedNotification } = loadProducer();
  const supabase = createMockSupabase({ existingQueueRows: [{ loanId: ids.duplicateLoan }] });

  const result = await produceLoanApprovedNotification(supabase, ids.duplicateLoan, {});
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "duplicate_whatsapp_loan");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("unique-violation race (23505) is treated as a duplicate skip", async () => {
  const { produceLoanApprovedNotification } = loadProducer();
  const supabase = createMockSupabase({ insertErrorCode: "23505" });

  const result = await produceLoanApprovedNotification(supabase, ids.loan, {});
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "duplicate_whatsapp_loan");
});

test("proxy borrowers are included via proxy_phone (matches the old client path)", async () => {
  const { produceLoanApprovedNotification } = loadProducer();
  const supabase = createMockSupabase();

  const result = await produceLoanApprovedNotification(supabase, ids.proxyLoan, {});
  assert.equal(result.status, "queued");
  const payload = supabase.calls.find((c) => c.op === "insert").payload;
  assert.equal(payload.data.recipient, proxyPhone);
  assert.equal(payload.user_id, null);
});

test("producer gates on loan_updates preferences and skips when WhatsApp disabled", async () => {
  const { produceLoanApprovedNotification } = loadProducer();
  const supabase = createMockSupabase();
  const channelCalls = [];

  const result = await produceLoanApprovedNotification(supabase, ids.loan, {
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
  const { produceLoanApprovedNotification } = loadProducer();
  const supabase = createMockSupabase({
    profile: { id: ids.user, full_name: "Jude Anyere", phone: null, preferred_locale: "en" },
    authPhone: null,
  });

  const result = await produceLoanApprovedNotification(supabase, ids.loan, {});
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "missing_phone");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("a zero/missing amount yields no blank variables — skipped safely", async () => {
  const { produceLoanApprovedNotification } = loadProducer();
  const supabase = createMockSupabase({
    loan: { id: ids.loan, group_id: ids.group, membership_id: ids.membership, amount_requested: null, amount_approved: null, currency: "XAF", status: "approved" },
  });

  const result = await produceLoanApprovedNotification(supabase, ids.loan, {});
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "missing_template_data");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("loans page routes WhatsApp through the producer for both approve and quick-loan flows", () => {
  const page = fs.readFileSync(loansPagePath, "utf8");
  assert.doesNotMatch(page, /whatsappType:\s*"loan_approved"/);
  assert.match(page, /requestLoanApprovedWhatsApp/);
  // Approval UPDATE carries a status precondition so concurrent approvals no-op.
  assert.match(page, /\.eq\("status", "pending"\)/);
  // Quick loan captures the new loan id for the producer.
  assert.match(page, /\.select\("id"\)\.single\(\)/);
  assert.match(page, /whatsapp:\s*false/);
  assert.match(page, /inApp:\s*false/);

  const route = fs.readFileSync(routePath, "utf8");
  assert.match(route, /\.in\("role", \["owner", "admin"\]\)/);
  assert.match(route, /isPlatformStaff/);
});
