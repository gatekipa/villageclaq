import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const sourcePath = new URL("../src/lib/payment-receipt-producer.ts", import.meta.url);
const recordPagePath = new URL("../src/app/[locale]/(dashboard)/dashboard/contributions/record/page.tsx", import.meta.url);
const receiptRoutePath = new URL("../src/app/api/payments/receipt-notifications/route.ts", import.meta.url);
const payNowDialogPath = new URL("../src/components/payments/pay-now-dialog.tsx", import.meta.url);
const historyPagePath = new URL("../src/app/[locale]/(dashboard)/dashboard/contributions/history/page.tsx", import.meta.url);
const require = createRequire(import.meta.url);

const ids = {
  payment: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
  duplicatePayment: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
  pendingPayment: "cccccccc-cccc-4ccc-cccc-cccccccccccc",
  paynowPayment: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  mismatchPayment: "dddddddd-dddd-4ddd-dddd-dddddddddddd",
  membership: "11111111-1111-4111-8111-111111111111",
  mismatchMembership: "22222222-2222-4222-8222-222222222222",
  user: "33333333-3333-4333-8333-333333333333",
  group: "44444444-4444-4444-8444-444444444444",
  otherGroup: "55555555-5555-4555-8555-555555555555",
  contributionType: "66666666-6666-4666-8666-666666666666",
};

const fullPhone = ["+1", "301", "433", "5857"].join("");

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
      return { formatAmount: (amount, currency) => `${currency} ${Number(amount).toFixed(2)}` };
    }
    if (id === "@/lib/mask-phone") {
      return {
        maskPhoneNumber(phone) {
          const digits = String(phone || "").replace(/\D/g, "");
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
      return { WA_TEMPLATES: { PAYMENT_RECEIPT: "villageclaq_payment_receipt_v2" } };
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
    payment: {
      id: ids.payment,
      status: "confirmed",
      group_id: ids.group,
      membership_id: ids.membership,
      contribution_type_id: ids.contributionType,
      amount: "25.00",
      currency: "USD",
      payment_method: "cash",
      reference_number: null,
      payment_date: "2026-06-08",
      recorded_at: "2026-06-08T16:08:30.542Z",
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
    contributionType: { id: ids.contributionType, name: "testing", name_fr: "testing" },
    existingNotification: null,
    existingQueue: null,
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
        return Promise.resolve({ data: { id: "new-row" }, error: null });
      }
      return Promise.resolve({ data: selectRow(this.table, this.filters, state), error: null });
    }

    single() {
      return this.maybeSingle();
    }

    then(resolve) {
      if (this.operation === "insert") {
        return Promise.resolve(resolve({ data: [{ id: "new-row" }], error: null }));
      }
      return Promise.resolve(resolve({ data: selectRows(this.table, this.filters, state), error: null }));
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

function hasFilter(filters, column, value) {
  return filters.some((filter) => filter.column === column && filter.value === value);
}

function selectRow(table, filters, state) {
  if (table === "payments") {
    const requestedId = filters.find((filter) => filter.column === "id")?.value;
    if (requestedId === ids.pendingPayment) return { ...state.payment, id: ids.pendingPayment, status: "pending" };
    if (requestedId === ids.paynowPayment) return { ...state.payment, id: ids.paynowPayment, status: "pending_confirmation" };
    if (requestedId === ids.mismatchPayment) return { ...state.payment, id: ids.mismatchPayment, membership_id: ids.mismatchMembership };
    if (requestedId === ids.duplicatePayment) return { ...state.payment, id: ids.duplicatePayment };
    if (requestedId === state.payment.id) return state.payment;
    return null;
  }
  if (table === "memberships") {
    if (hasFilter(filters, "id", ids.mismatchMembership)) {
      return { ...state.membership, id: ids.mismatchMembership, group_id: ids.otherGroup };
    }
    return state.membership;
  }
  if (table === "profiles") return state.profile;
  if (table === "groups") return state.group;
  if (table === "contribution_types") return state.contributionType;
  if (table === "notifications") return state.existingNotification;
  if (table === "notifications_queue") return state.existingQueue;
  return null;
}

function selectRows(table, filters, state) {
  const row = selectRow(table, filters, state);
  return row ? [row] : [];
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

test("confirmed payment produces an in-app receipt and server-side WhatsApp queue event", async () => {
  const { producePaymentReceiptNotifications } = loadProducer();
  const supabase = createMockSupabase();
  const logger = createLogger();

  const result = await producePaymentReceiptNotifications(supabase, ids.payment, {
    logger,
    getChannels: async () => ({ in_app: true, email: true, sms: true, whatsapp: true, push: false }),
  });

  assert.equal(result.status, "queued");
  assert.equal(result.template, "villageclaq_payment_receipt_v2");

  const notificationInsert = supabase.calls.find((call) => call.op === "insert" && call.table === "notifications");
  assert.ok(notificationInsert, "expected in-app receipt insert");
  assert.equal(notificationInsert.payload.type, "contribution_received");
  assert.equal(notificationInsert.payload.dedup_key, `payment_receipt:${ids.payment}`);

  const queueInsert = supabase.calls.find((call) => call.op === "insert" && call.table === "notifications_queue");
  assert.ok(queueInsert, "expected WhatsApp queue insert");
  assert.equal(queueInsert.payload.channel, "whatsapp");
  assert.equal(queueInsert.payload.template, "payment_receipt");
  assert.equal(queueInsert.payload.data.whatsappType, "payment_receipt");
  assert.equal(queueInsert.payload.data.template, "villageclaq_payment_receipt_v2");
  assert.equal(queueInsert.payload.data.paymentId, ids.payment);
  assert.equal(queueInsert.payload.data.whatsappData.groupName, "Njimafor Diaspora");

  const logText = JSON.stringify(logger.records);
  assert.match(logText, /\+130\*{6}857/);
  assert.doesNotMatch(logText, new RegExp(fullPhone.replace("+", "\\+")));
});

test("pending payment does not produce a payment receipt", async () => {
  const { producePaymentReceiptNotifications } = loadProducer();
  const supabase = createMockSupabase();

  const result = await producePaymentReceiptNotifications(supabase, ids.pendingPayment);

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "payment_not_confirmed");
  assert.equal(supabase.calls.filter((call) => call.op === "insert").length, 0);
});

test("WhatsApp preferences disabled still preserves in-app receipt but skips WhatsApp queue", async () => {
  const { producePaymentReceiptNotifications } = loadProducer();
  const supabase = createMockSupabase();

  const result = await producePaymentReceiptNotifications(supabase, ids.payment, {
    getChannels: async () => ({ in_app: true, email: true, sms: true, whatsapp: false, push: false }),
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "whatsapp_disabled");
  assert.ok(supabase.calls.find((call) => call.op === "insert" && call.table === "notifications"));
  assert.equal(supabase.calls.some((call) => call.op === "insert" && call.table === "notifications_queue"), false);
});

test("real-member receipts fall back to auth phone when profile phone is missing", async () => {
  const { producePaymentReceiptNotifications } = loadProducer();
  const supabase = createMockSupabase({
    profile: {
      id: ids.user,
      full_name: "Jude Anyere",
      phone: null,
      preferred_locale: "en",
    },
    authPhone: fullPhone,
  });

  const result = await producePaymentReceiptNotifications(supabase, ids.payment, {
    getChannels: async () => ({ in_app: true, email: true, sms: true, whatsapp: true, push: false }),
  });

  assert.equal(result.status, "queued");
  assert.ok(supabase.calls.find((call) => call.op === "auth.admin.getUserById" && call.userId === ids.user));

  const queueInsert = supabase.calls.find((call) => call.op === "insert" && call.table === "notifications_queue");
  assert.equal(queueInsert.payload.data.recipient, fullPhone);
});

test("WhatsApp receipt data uses shared member-name fallback for proxy members", async () => {
  const { producePaymentReceiptNotifications } = loadProducer();
  const supabase = createMockSupabase({
    membership: {
      id: ids.membership,
      group_id: ids.group,
      user_id: null,
      display_name: null,
      is_proxy: true,
      phone: null,
      privacy_settings: { proxy_name: "Proxy Member", proxy_phone: fullPhone },
      membership_status: "active",
    },
    profile: null,
  });

  const result = await producePaymentReceiptNotifications(supabase, ids.payment);

  assert.equal(result.status, "queued");
  const queueInsert = supabase.calls.find((call) => call.op === "insert" && call.table === "notifications_queue");
  assert.equal(queueInsert.payload.data.whatsappData.memberName, "Proxy Member");
});

test("existing queue event prevents duplicate receipt production for same payment", async () => {
  const { producePaymentReceiptNotifications } = loadProducer();
  const supabase = createMockSupabase({
    existingQueue: {
      id: "existing-queue",
      data: { paymentId: ids.duplicatePayment },
      status: "queued",
    },
  });

  const result = await producePaymentReceiptNotifications(supabase, ids.duplicatePayment);

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "duplicate_whatsapp_receipt");
  assert.equal(supabase.calls.some((call) => call.op === "insert" && call.table === "notifications_queue"), false);
});

test("mismatched payment membership and group is skipped", async () => {
  const { producePaymentReceiptNotifications } = loadProducer();
  const supabase = createMockSupabase();

  const result = await producePaymentReceiptNotifications(supabase, ids.mismatchPayment);

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "payment_membership_group_mismatch");
  assert.equal(supabase.calls.some((call) => call.op === "insert"), false);
});

test("record payment page no longer calls the WhatsApp send route directly", () => {
  const source = fs.readFileSync(recordPagePath, "utf8");

  assert.match(source, /\/api\/payments\/receipt-notifications/);
  assert.doesNotMatch(source, /\/api\/whatsapp\/send/);
});

test("receipt notification route returns 400 for malformed JSON", () => {
  const source = fs.readFileSync(receiptRoutePath, "utf8");

  assert.match(source, /Malformed JSON/);
  assert.match(source, /status:\s*400/);
  assert.match(source, /await request\.json\(\)/);
});

test("pay-now pending_confirmation payment never produces a receipt", async () => {
  const { producePaymentReceiptNotifications } = loadProducer();
  const supabase = createMockSupabase();

  const result = await producePaymentReceiptNotifications(supabase, ids.paynowPayment);

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "payment_not_confirmed");
  assert.equal(supabase.calls.filter((call) => call.op === "insert").length, 0);
});

test("pay-now dialog no longer sends WhatsApp receipts client-side", () => {
  const source = fs.readFileSync(payNowDialogPath, "utf8");

  assert.doesNotMatch(source, /whatsappType:\s*"payment_receipt"/);
  assert.match(source, /whatsapp:\s*false/);
  // Existing in-app/email/SMS submission behavior is preserved.
  assert.match(source, /inApp:\s*true/);
  assert.match(source, /email:\s*true/);
  assert.match(source, /sms:\s*true/);
});

test("payment confirmation triggers the server-side receipt producer exactly once, never on reject", () => {
  const source = fs.readFileSync(historyPagePath, "utf8");

  const occurrences = source.split("/api/payments/receipt-notifications").length - 1;
  assert.equal(occurrences, 1, "expected exactly one receipt producer call site");

  const callIndex = source.indexOf("/api/payments/receipt-notifications");
  const confirmIndex = source.indexOf("function handleConfirmPayment");
  const rejectIndex = source.indexOf("function handleRejectPayment");
  assert.ok(confirmIndex !== -1 && rejectIndex !== -1 && confirmIndex < rejectIndex);
  assert.ok(callIndex > confirmIndex && callIndex < rejectIndex, "producer call must live in handleConfirmPayment only");
});

test("receipt route authorizes the recorder, group owner/admin, and platform staff only", () => {
  const source = fs.readFileSync(receiptRoutePath, "utf8");

  assert.match(source, /recordedBy === user\.id/);
  assert.match(source, /\.in\("role", \["owner", "admin"\]\)/);
  assert.match(source, /membership_status", "active"/);
  assert.match(source, /isPlatformStaff/);
});
