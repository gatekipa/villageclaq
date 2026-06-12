import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const sourcePath = new URL("../src/lib/subscription-expiring-producer.ts", import.meta.url);
const cronPath = new URL("../src/app/api/cron/subscription-reminders/route.ts", import.meta.url);
const vercelJsonPath = new URL("../vercel.json", import.meta.url);
const require = createRequire(import.meta.url);

const ids = {
  subscription: "11111111-1111-4111-8111-111111111111",
  cancelledSubscription: "22222222-2222-4222-8222-222222222222",
  expiredSubscription: "33333333-3333-4333-8333-333333333333",
  pastDueSubscription: "44444444-4444-4444-8444-444444444444",
  laggingSubscription: "55555555-5555-4555-8555-555555555555",
  farOutSubscription: "66666666-6666-4666-8666-666666666666",
  endlessSubscription: "77777777-7777-4777-8777-777777777777",
  group: "99999999-9999-4999-8999-999999999999",
  ownerUser: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  adminUser: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  memberUser: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  proxyUser: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  pendingUser: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
};

const ownerPhone = ["+1", "301", "433", "5857"].join("");
const adminPhone = ["+237", "650", "11", "22", "33"].join("");
const REMINDER_DATE = "2026-06-12";
const NEXT_DAY = "2026-06-13";

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
    if (id === "@/lib/notification-prefs") {
      return {
        getEnabledChannels: async () => ({ in_app: true, email: true, sms: true, whatsapp: true, push: false }),
      };
    }
    if (id === "@/lib/whatsapp-templates") {
      return { WA_TEMPLATES: { SUBSCRIPTION_EXPIRING: "villageclaq_subscription_expiring" } };
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

function defaultMemberships() {
  return [
    // Eligible: active owner with an account.
    { id: "mem-owner", group_id: ids.group, user_id: ids.ownerUser, display_name: "Cyril Ndikum", is_proxy: false, phone: null, privacy_settings: {}, membership_status: "active", role: "owner" },
    // Eligible: active admin with an account.
    { id: "mem-admin", group_id: ids.group, user_id: ids.adminUser, display_name: "Brenda Tabi", is_proxy: false, phone: null, privacy_settings: {}, membership_status: "active", role: "admin" },
    // Excluded by role filter.
    { id: "mem-member", group_id: ids.group, user_id: ids.memberUser, display_name: "Regular Member", is_proxy: false, phone: null, privacy_settings: {}, membership_status: "active", role: "member" },
    // Excluded by the is_proxy filter (user_id deliberately non-null so
    // the proxy exclusion is exercised independently of the NULL filter).
    { id: "mem-proxy", group_id: ids.group, user_id: ids.proxyUser, display_name: "Proxy Admin", is_proxy: true, phone: null, privacy_settings: { proxy_phone: ownerPhone }, membership_status: "active", role: "admin" },
    // Excluded by membership_status filter.
    { id: "mem-pending", group_id: ids.group, user_id: ids.pendingUser, display_name: "Pending Admin", is_proxy: false, phone: null, privacy_settings: {}, membership_status: "pending", role: "admin" },
  ];
}

function createMockSupabase(options = {}) {
  const state = {
    subscriptions: {
      [ids.subscription]: { id: ids.subscription, group_id: ids.group, tier: "premium", status: "active", current_period_end: "2026-06-15T00:00:00.000Z" },
      [ids.cancelledSubscription]: { id: ids.cancelledSubscription, group_id: ids.group, tier: "premium", status: "cancelled", current_period_end: "2026-06-15T00:00:00.000Z" },
      [ids.expiredSubscription]: { id: ids.expiredSubscription, group_id: ids.group, tier: "premium", status: "expired", current_period_end: "2026-06-15T00:00:00.000Z" },
      [ids.pastDueSubscription]: { id: ids.pastDueSubscription, group_id: ids.group, tier: "premium", status: "past_due", current_period_end: "2026-06-15T00:00:00.000Z" },
      // Active but the period already ended before the reminder date.
      [ids.laggingSubscription]: { id: ids.laggingSubscription, group_id: ids.group, tier: "premium", status: "active", current_period_end: "2026-06-11T00:00:00.000Z" },
      // Active but beyond reminderDate + 7 days.
      [ids.farOutSubscription]: { id: ids.farOutSubscription, group_id: ids.group, tier: "premium", status: "active", current_period_end: "2026-06-20T00:00:00.000Z" },
      // Active but no period end at all.
      [ids.endlessSubscription]: { id: ids.endlessSubscription, group_id: ids.group, tier: "premium", status: "active", current_period_end: null },
    },
    group: { id: ids.group, name: "Njimafor Diaspora", is_active: true },
    memberships: defaultMemberships(),
    profiles: {
      [ids.ownerUser]: { id: ids.ownerUser, full_name: "Cyril Ndikum", phone: ownerPhone, preferred_locale: "en" },
      [ids.adminUser]: { id: ids.adminUser, full_name: "Brenda Tabi", phone: adminPhone, preferred_locale: "fr" },
    },
    // LIVE queue: inserts append here, and the dedupe pre-check filters
    // against it — so day-bucket reruns are genuinely exercised.
    queueRows: [],
    insertErrorCode: null,
    selectErrorTables: [],
    authPhone: null,
    ...options,
  };
  const calls = [];

  function applyFilters(rows, builder) {
    let out = rows.slice();
    for (const f of builder.filters) out = out.filter((r) => r[f.column] === f.value);
    for (const f of builder.inFilters) out = out.filter((r) => f.values.includes(r[f.column]));
    for (const f of builder.notFilters) {
      if (f.op === "is" && f.value === null) out = out.filter((r) => r[f.column] !== null && r[f.column] !== undefined);
    }
    return out;
  }

  class Builder {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this.inFilters = [];
      this.notFilters = [];
      this.payload = null;
      this.operation = "select";
    }

    select(columns) {
      this.columns = columns;
      calls.push({ op: "select", table: this.table });
      return this;
    }

    insert(payload) {
      this.operation = "insert";
      this.payload = payload;
      calls.push({ op: "insert", table: this.table, payload });
      return this;
    }

    update(payload) {
      this.operation = "update";
      this.payload = payload;
      calls.push({ op: "update", table: this.table, payload });
      return this;
    }

    delete() {
      this.operation = "delete";
      calls.push({ op: "delete", table: this.table });
      return this;
    }

    eq(column, value) {
      this.filters.push({ column, value });
      return this;
    }

    in(column, values) {
      this.inFilters.push({ column, values });
      return this;
    }

    not(column, op, value) {
      this.notFilters.push({ column, op, value });
      return this;
    }

    limit() {
      return this;
    }

    resolveWrite() {
      if (state.insertErrorCode) {
        return { data: null, error: { code: state.insertErrorCode, message: "duplicate key value" } };
      }
      if (this.operation === "insert" && this.table === "notifications_queue") {
        const d = this.payload?.data || {};
        state.queueRows.push({
          channel: this.payload.channel,
          template: this.payload.template,
          subscriptionId: d.subscriptionId,
          reminderDate: d.reminderDate,
          userId: d.userId,
          status: this.payload.status,
        });
      }
      return { data: [{ id: "new-row" }], error: null };
    }

    maybeSingle() {
      if (this.operation !== "select") {
        return Promise.resolve(this.resolveWrite());
      }
      if ((state.selectErrorTables || []).includes(this.table)) {
        return Promise.resolve({ data: null, error: { message: "transient lookup failure" } });
      }
      return Promise.resolve({ data: selectSingle(this.table, this, state, applyFilters), error: null });
    }

    single() {
      return this.maybeSingle();
    }

    then(resolve) {
      if (this.operation !== "select") {
        return Promise.resolve(resolve(this.resolveWrite()));
      }
      if ((state.selectErrorTables || []).includes(this.table)) {
        return Promise.resolve(resolve({ data: null, error: { message: "transient lookup failure" } }));
      }
      if (this.table === "memberships") {
        return Promise.resolve(resolve({ data: applyFilters(state.memberships, this), error: null }));
      }
      return Promise.resolve(resolve({ data: [selectSingle(this.table, this, state, applyFilters)].filter(Boolean), error: null }));
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

function selectSingle(table, builder, state, applyFilters) {
  const filters = builder.filters;
  if (table === "group_subscriptions") {
    return state.subscriptions[filterValue(filters, "id")] || null;
  }
  if (table === "groups") {
    return filterValue(filters, "id") === state.group.id ? state.group : null;
  }
  if (table === "profiles") {
    return state.profiles[filterValue(filters, "id")] || null;
  }
  if (table === "memberships") {
    return applyFilters(state.memberships, builder)[0] || null;
  }
  if (table === "notifications_queue") {
    const channel = filterValue(filters, "channel");
    const template = filterValue(filters, "template");
    const subscriptionId = filterValue(filters, "data->>subscriptionId");
    const reminderDate = filterValue(filters, "data->>reminderDate");
    const userId = filterValue(filters, "data->>userId");
    const match = state.queueRows.find(
      (r) =>
        r.channel === channel &&
        r.template === template &&
        r.subscriptionId === subscriptionId &&
        r.reminderDate === reminderDate &&
        r.userId === userId,
    );
    return match ? { id: "existing-queue", status: match.status || "queued" } : null;
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

function billingWrites(supabase) {
  return supabase.calls.filter(
    (c) => c.table === "group_subscriptions" && ["insert", "update", "delete"].includes(c.op),
  );
}

test("an expiring subscription queues one row PER billing contact with exactly { planName, days }", async () => {
  const { produceSubscriptionExpiringNotification } = loadProducer();
  const supabase = createMockSupabase();
  const logger = createLogger();

  const result = await produceSubscriptionExpiringNotification(supabase, ids.subscription, {
    logger,
    reminderDate: REMINDER_DATE,
  });

  assert.equal(result.status, "queued");
  assert.equal(result.template, "villageclaq_subscription_expiring");
  assert.equal(result.subscriptionId, ids.subscription);
  assert.equal(result.reminderDate, REMINDER_DATE);
  assert.equal(result.daysLeft, 3);
  assert.equal(result.whatsappQueued, 2);
  assert.equal(result.recipients.length, 2);

  const queueInserts = supabase.calls.filter((c) => c.op === "insert" && c.table === "notifications_queue");
  assert.equal(queueInserts.length, 2, "expected one WhatsApp queue insert per billing contact");

  for (const insert of queueInserts) {
    const payload = insert.payload;
    assert.equal(payload.channel, "whatsapp");
    assert.equal(payload.template, "subscription_expiring");
    assert.equal(payload.status, "queued");
    assert.equal(payload.data.whatsappType, "subscription_expiring");
    assert.equal(payload.data.template, "villageclaq_subscription_expiring");
    assert.equal(payload.data.subscriptionId, ids.subscription);
    assert.equal(payload.data.groupId, ids.group);
    assert.equal(payload.data.reminderDate, REMINDER_DATE);
    assert.equal(payload.data.daysLeft, 3);
    assert.equal(payload.data.userId, payload.data.user_id, "dedupe key userId mirrors user_id");
    // buildSubscriptionExpiringParams reads ONLY these two, in this order.
    assert.deepEqual(Object.keys(payload.data.whatsappData), ["planName", "days"]);
    for (const [key, value] of Object.entries(payload.data.whatsappData)) {
      assert.ok(String(value).length > 0, `${key} must be non-empty`);
    }
    assert.equal(payload.data.whatsappData.planName, "premium");
    assert.equal(payload.data.whatsappData.days, "3");
    // The queued recipient is the NORMALIZED digits-only form.
    assert.match(String(payload.data.recipient), /^\d+$/);
  }

  const recipients = queueInserts.map((c) => String(c.payload.data.recipient)).sort();
  assert.deepEqual(recipients, [ownerPhone.replace("+", ""), adminPhone.replace("+", "")].sort());

  // Per-recipient locale: owner en, admin fr.
  const locales = queueInserts.map((c) => c.payload.data.locale).sort();
  assert.deepEqual(locales, ["en", "fr"]);
});

test("eligibility skips: not found, cancelled, expired, past_due, already-expired period, outside window, no period end", async () => {
  const { produceSubscriptionExpiringNotification } = loadProducer();
  const cases = [
    ["88888888-8888-4888-8888-888888888888", "subscription_not_found"],
    [ids.cancelledSubscription, "subscription_not_active"],
    [ids.expiredSubscription, "subscription_not_active"],
    [ids.pastDueSubscription, "subscription_not_active"],
    [ids.laggingSubscription, "subscription_already_expired"],
    [ids.farOutSubscription, "outside_reminder_window"],
    [ids.endlessSubscription, "missing_period_end"],
  ];

  for (const [subscriptionId, reason] of cases) {
    const supabase = createMockSupabase();
    const result = await produceSubscriptionExpiringNotification(supabase, subscriptionId, {
      reminderDate: REMINDER_DATE,
    });
    assert.equal(result.status, "skipped", `${reason} case should skip`);
    assert.equal(result.reason, reason);
    assert.equal(result.whatsappQueued, 0);
    assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
  }
});

test("an inactive group never reminds", async () => {
  const { produceSubscriptionExpiringNotification } = loadProducer();
  const supabase = createMockSupabase({
    group: { id: ids.group, name: "Njimafor Diaspora", is_active: false },
  });

  const result = await produceSubscriptionExpiringNotification(supabase, ids.subscription, {
    reminderDate: REMINDER_DATE,
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "group_inactive");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("recipient filters: member role, proxy, and pending memberships are excluded — only owner + admin queue", async () => {
  const { produceSubscriptionExpiringNotification } = loadProducer();
  const supabase = createMockSupabase();

  const result = await produceSubscriptionExpiringNotification(supabase, ids.subscription, {
    reminderDate: REMINDER_DATE,
  });

  assert.equal(result.whatsappQueued, 2);
  // Array.from re-creates the array in the host realm — the producer runs
  // in a vm context, and cross-realm arrays fail deepStrictEqual.
  const queuedUserIds = Array.from(result.recipients, (r) => r.userId).sort();
  assert.deepEqual(queuedUserIds, [ids.ownerUser, ids.adminUser].sort());
  for (const excluded of [ids.memberUser, ids.proxyUser, ids.pendingUser]) {
    assert.equal(result.recipients.some((r) => r.userId === excluded), false, `${excluded} must be excluded`);
  }
});

test("per-recipient preference gating skips only the opted-out admin and uses subscription_updates", async () => {
  const { produceSubscriptionExpiringNotification } = loadProducer();
  const supabase = createMockSupabase();
  const channelCalls = [];

  const result = await produceSubscriptionExpiringNotification(supabase, ids.subscription, {
    reminderDate: REMINDER_DATE,
    getChannels: async (client, userId, notificationType, groupId) => {
      channelCalls.push({ userId, notificationType, groupId });
      return { in_app: true, email: true, sms: true, whatsapp: userId !== ids.adminUser, push: false };
    },
  });

  assert.equal(result.status, "queued");
  assert.equal(result.whatsappQueued, 1);
  assert.equal(channelCalls.every((c) => c.notificationType === "subscription_updates"), true);
  assert.equal(channelCalls.every((c) => c.groupId === ids.group), true);
  const optedOut = result.recipients.find((r) => r.userId === ids.adminUser);
  assert.equal(optedOut.status, "skipped");
  assert.equal(optedOut.reason, "whatsapp_disabled");
});

test("an admin with no phone skips without blocking the other billing contact", async () => {
  const { produceSubscriptionExpiringNotification } = loadProducer();
  const supabase = createMockSupabase({
    profiles: {
      [ids.ownerUser]: { id: ids.ownerUser, full_name: "Cyril Ndikum", phone: ownerPhone, preferred_locale: "en" },
      [ids.adminUser]: { id: ids.adminUser, full_name: "Brenda Tabi", phone: null, preferred_locale: "fr" },
    },
    authPhone: null,
  });

  const result = await produceSubscriptionExpiringNotification(supabase, ids.subscription, {
    reminderDate: REMINDER_DATE,
  });

  assert.equal(result.whatsappQueued, 1);
  const noPhone = result.recipients.find((r) => r.userId === ids.adminUser);
  assert.equal(noPhone.status, "skipped");
  assert.equal(noPhone.reason, "missing_phone");
});

test("daysLeft countdown: +3 days renders days '3'; same-day expiry renders '0'", async () => {
  const { produceSubscriptionExpiringNotification } = loadProducer();

  // period_end = reminderDate + 3 days
  const threeOut = createMockSupabase();
  const r3 = await produceSubscriptionExpiringNotification(threeOut, ids.subscription, {
    reminderDate: REMINDER_DATE,
  });
  assert.equal(r3.daysLeft, 3);
  const insert3 = threeOut.calls.find((c) => c.op === "insert" && c.table === "notifications_queue");
  assert.equal(insert3.payload.data.whatsappData.days, "3");

  // period_end === reminderDate
  const sameDay = createMockSupabase({
    subscriptions: {
      [ids.subscription]: { id: ids.subscription, group_id: ids.group, tier: "premium", status: "active", current_period_end: `${REMINDER_DATE}T00:00:00.000Z` },
    },
  });
  const r0 = await produceSubscriptionExpiringNotification(sameDay, ids.subscription, {
    reminderDate: REMINDER_DATE,
  });
  assert.equal(r0.status, "queued");
  assert.equal(r0.daysLeft, 0);
  const insert0 = sameDay.calls.find((c) => c.op === "insert" && c.table === "notifications_queue");
  assert.equal(insert0.payload.data.whatsappData.days, "0");
});

test("REGRESSION day bucket: same-day rerun duplicate-skips everyone, queue unchanged; the next day queues again", async () => {
  const { produceSubscriptionExpiringNotification } = loadProducer();
  const supabase = createMockSupabase();

  const first = await produceSubscriptionExpiringNotification(supabase, ids.subscription, {
    reminderDate: REMINDER_DATE,
  });
  assert.equal(first.status, "queued");
  assert.equal(first.whatsappQueued, 2);
  assert.equal(supabase.state.queueRows.length, 2);

  // Same day bucket → every recipient duplicate-skips, no new inserts.
  const rerun = await produceSubscriptionExpiringNotification(supabase, ids.subscription, {
    reminderDate: REMINDER_DATE,
  });
  assert.equal(rerun.status, "skipped");
  assert.equal(rerun.reason, "all_recipients_skipped");
  assert.equal(rerun.whatsappQueued, 0);
  for (const r of rerun.recipients) {
    assert.equal(r.status, "skipped");
    assert.equal(r.reason, "duplicate_whatsapp_reminder");
  }
  assert.equal(supabase.state.queueRows.length, 2, "queue must be unchanged after a same-day rerun");

  // Next day bucket → queues again (countdown cadence preserved).
  const nextDay = await produceSubscriptionExpiringNotification(supabase, ids.subscription, {
    reminderDate: NEXT_DAY,
  });
  assert.equal(nextDay.status, "queued");
  assert.equal(nextDay.whatsappQueued, 2);
  assert.equal(nextDay.daysLeft, 2, "the countdown advances with the day bucket");
  assert.equal(supabase.state.queueRows.length, 4);
});

test("unique-violation race (23505) is treated as a per-recipient duplicate skip", async () => {
  const { produceSubscriptionExpiringNotification } = loadProducer();
  const supabase = createMockSupabase({ insertErrorCode: "23505" });

  const result = await produceSubscriptionExpiringNotification(supabase, ids.subscription, {
    reminderDate: REMINDER_DATE,
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.whatsappQueued, 0);
  for (const r of result.recipients) {
    assert.equal(r.status, "skipped");
    assert.equal(r.reason, "duplicate_whatsapp_reminder");
  }
});

test("transient subscription lookup failures are errors, not silent skips", async () => {
  const { produceSubscriptionExpiringNotification } = loadProducer();
  const supabase = createMockSupabase({ selectErrorTables: ["group_subscriptions"] });

  const result = await produceSubscriptionExpiringNotification(supabase, ids.subscription, {
    reminderDate: REMINDER_DATE,
  });

  assert.equal(result.status, "error");
  assert.equal(result.reason, "subscription_lookup_failed");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("READ-ONLY billing: zero update/insert/delete calls ever hit group_subscriptions", async () => {
  const { produceSubscriptionExpiringNotification } = loadProducer();

  // Happy path AND a rerun AND a skip path — billing stays read-only in all.
  const supabase = createMockSupabase();
  await produceSubscriptionExpiringNotification(supabase, ids.subscription, { reminderDate: REMINDER_DATE });
  await produceSubscriptionExpiringNotification(supabase, ids.subscription, { reminderDate: REMINDER_DATE });
  await produceSubscriptionExpiringNotification(supabase, ids.cancelledSubscription, { reminderDate: REMINDER_DATE });

  assert.equal(billingWrites(supabase).length, 0, "group_subscriptions must never be written");
  // The only group_subscriptions calls are selects.
  const billingCalls = supabase.calls.filter((c) => c.table === "group_subscriptions");
  assert.ok(billingCalls.length > 0, "the subscription must actually be read");
  assert.equal(billingCalls.every((c) => c.op === "select"), true);
});

test("masked logging: full phone numbers never appear in any log output", async () => {
  const { produceSubscriptionExpiringNotification } = loadProducer();
  const supabase = createMockSupabase();
  const logger = createLogger();

  await produceSubscriptionExpiringNotification(supabase, ids.subscription, {
    logger,
    reminderDate: REMINDER_DATE,
  });

  const logText = JSON.stringify(logger.records);
  assert.ok(logger.records.length > 0, "queued recipients must be logged");
  assert.match(logText, /\+130\*{6}857/);
  assert.doesNotMatch(logText, new RegExp(ownerPhone.replace("+", "\\+")));
  assert.doesNotMatch(logText, new RegExp(adminPhone.replace("+", "\\+")));
  // Full UUIDs are never logged either — ids are 8-char prefixes.
  assert.doesNotMatch(logText, new RegExp(ids.subscription));
  assert.doesNotMatch(logText, new RegExp(ids.ownerUser));
});

test("cron no longer dispatches WhatsApp directly and billing state stays locked read-only", () => {
  const source = fs.readFileSync(cronPath, "utf8");

  assert.doesNotMatch(source, /dispatchWhatsApp/);
  assert.match(source, /produceSubscriptionExpiringNotification/);
  // This route never writes anything via the supabase client except the
  // in-app notifications insert — no updates or deletes anywhere.
  assert.doesNotMatch(source, /\.update\(/);
  assert.doesNotMatch(source, /\.delete\(/);
  // Billing read-only stays locked: stripe fields never appear, and the
  // only group_subscriptions touch is the read-only select.
  assert.doesNotMatch(source, /stripe_customer_id|stripe_subscription_id/);
  const billingQueries = source.match(/\.from\("group_subscriptions"\)/g) || [];
  assert.equal(billingQueries.length, 1, "group_subscriptions is queried exactly once — the read-only select");
  assert.match(source, /\.from\("group_subscriptions"\)\s*\.select\(/);
  // Email/SMS/in-app + dedup_key mechanism preserved.
  assert.match(source, /sendEmail\(/);
  assert.match(source, /sendSmsNotification\(/);
  assert.match(source, /template: "subscription-expiring"/);
  assert.match(source, /dedup_key/);
  assert.match(source, /fetchLocaleMap/);
  assert.match(source, /getEnabledChannels\(/);
});

test("cron schedule remains daily at 09:00 UTC", () => {
  const vercel = JSON.parse(fs.readFileSync(vercelJsonPath, "utf8"));
  const entry = (vercel.crons || []).find((c) => c.path === "/api/cron/subscription-reminders");
  assert.ok(entry, "subscription-reminders cron entry must exist");
  assert.equal(entry.schedule, "0 9 * * *");
});
