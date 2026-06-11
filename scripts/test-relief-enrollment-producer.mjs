import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const sourcePath = new URL("../src/lib/relief-enrollment-producer.ts", import.meta.url);
const routePath = new URL("../src/app/api/relief/enrollment-notifications/route.ts", import.meta.url);
const enrollmentPagePath = new URL("../src/app/[locale]/(dashboard)/dashboard/relief/enrollment/page.tsx", import.meta.url);
const plansPagePath = new URL("../src/app/[locale]/(dashboard)/dashboard/relief/plans/page.tsx", import.meta.url);
const require = createRequire(import.meta.url);

const ids = {
  enrollment: "11111111-1111-4111-8111-111111111111",
  inactiveEnrollment: "22222222-2222-4222-8222-222222222222",
  duplicateEnrollment: "33333333-3333-4333-8333-333333333333",
  mismatchEnrollment: "44444444-4444-4444-8444-444444444444",
  plan: "55555555-5555-4555-8555-555555555555",
  membership: "66666666-6666-4666-8666-666666666666",
  mismatchMembership: "77777777-7777-4777-8777-777777777777",
  user: "88888888-8888-4888-8888-888888888888",
  group: "99999999-9999-4999-8999-999999999999",
  otherGroup: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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
      return { WA_TEMPLATES: { RELIEF_ENROLLMENT: "villageclaq_relief_enrollment" } };
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
    enrollment: {
      id: ids.enrollment,
      plan_id: ids.plan,
      membership_id: ids.membership,
      is_active: true,
    },
    plan: {
      id: ids.plan,
      group_id: ids.group,
      name: "Funeral Fund",
      name_fr: "Caisse funéraire",
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

function selectRow(table, filters, state) {
  if (table === "relief_enrollments") {
    const requestedId = filters.find((f) => f.column === "id")?.value;
    if (requestedId === ids.inactiveEnrollment) return { ...state.enrollment, id: ids.inactiveEnrollment, is_active: false };
    if (requestedId === ids.duplicateEnrollment) return { ...state.enrollment, id: ids.duplicateEnrollment };
    if (requestedId === ids.mismatchEnrollment) return { ...state.enrollment, id: ids.mismatchEnrollment, membership_id: ids.mismatchMembership };
    if (requestedId === state.enrollment.id) return state.enrollment;
    return null;
  }
  if (table === "relief_plans") return state.plan;
  if (table === "memberships") {
    const requestedId = filters.find((f) => f.column === "id")?.value;
    if (requestedId === ids.mismatchMembership) return { ...state.membership, id: ids.mismatchMembership, group_id: ids.otherGroup };
    return state.membership;
  }
  if (table === "profiles") return state.profile;
  if (table === "groups") return state.group;
  if (table === "notifications_queue") return state.existingQueue;
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

test("active enrollment queues exactly one WhatsApp row with non-empty variables", async () => {
  const { produceReliefEnrollmentNotifications } = loadProducer();
  const supabase = createMockSupabase();
  const logger = createLogger();

  const result = await produceReliefEnrollmentNotifications(supabase, ids.enrollment, { logger });

  assert.equal(result.status, "queued");
  assert.equal(result.template, "villageclaq_relief_enrollment");

  const queueInserts = supabase.calls.filter((c) => c.op === "insert" && c.table === "notifications_queue");
  assert.equal(queueInserts.length, 1, "expected exactly one WhatsApp queue insert");

  const payload = queueInserts[0].payload;
  assert.equal(payload.channel, "whatsapp");
  assert.equal(payload.template, "relief_enrollment");
  assert.equal(payload.data.whatsappType, "relief_enrollment");
  assert.equal(payload.data.template, "villageclaq_relief_enrollment");
  assert.equal(payload.data.enrollmentId, ids.enrollment);
  assert.equal(payload.data.groupId, ids.group);
  assert.deepEqual(Object.keys(payload.data.whatsappData), ["memberName", "planName", "groupName"]);
  assert.ok(payload.data.whatsappData.memberName.length > 0, "memberName must be non-empty");
  assert.ok(payload.data.whatsappData.planName.length > 0, "planName must be non-empty");
  assert.ok(payload.data.whatsappData.groupName.length > 0, "groupName must be non-empty");
  assert.equal(payload.data.whatsappData.memberName, "Jude Anyere");
  assert.equal(payload.data.whatsappData.planName, "Funeral Fund");
  assert.equal(payload.data.locale, "en");

  // WhatsApp-only producer — no other table writes.
  assert.equal(supabase.calls.some((c) => c.op === "insert" && c.table !== "notifications_queue"), false);

  const logText = JSON.stringify(logger.records);
  assert.match(logText, /\+130\*{6}857/);
  assert.doesNotMatch(logText, new RegExp(fullPhone.replace("+", "\\+")));
});

test("recipient's French preferred locale wins over the admin's locale", async () => {
  const { produceReliefEnrollmentNotifications } = loadProducer();
  const supabase = createMockSupabase({
    profile: { id: ids.user, full_name: "Jude Anyere", phone: fullPhone, preferred_locale: "fr" },
  });

  // options.locale is the enrolling ADMIN's UI locale — the recipient wins.
  const result = await produceReliefEnrollmentNotifications(supabase, ids.enrollment, { locale: "en" });

  assert.equal(result.status, "queued");
  const payload = supabase.calls.find((c) => c.op === "insert" && c.table === "notifications_queue").payload;
  assert.equal(payload.data.locale, "fr");
  assert.equal(payload.data.whatsappData.planName, "Caisse funéraire");
});

test("non-active membership never receives an enrollment notice", async () => {
  const { produceReliefEnrollmentNotifications } = loadProducer();
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

  const result = await produceReliefEnrollmentNotifications(supabase, ids.enrollment);

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "membership_not_active");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("producer gates on relief_updates preferences and skips when WhatsApp disabled", async () => {
  const { produceReliefEnrollmentNotifications } = loadProducer();
  const supabase = createMockSupabase();
  const channelCalls = [];

  const result = await produceReliefEnrollmentNotifications(supabase, ids.enrollment, {
    getChannels: async (client, userId, notificationType, groupId) => {
      channelCalls.push({ userId, notificationType, groupId });
      return { in_app: true, email: true, sms: true, whatsapp: false, push: false };
    },
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "whatsapp_disabled");
  assert.equal(channelCalls[0].notificationType, "relief_updates");
  assert.equal(channelCalls[0].groupId, ids.group);
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("missing phone skips safely", async () => {
  const { produceReliefEnrollmentNotifications } = loadProducer();
  const supabase = createMockSupabase({
    profile: { id: ids.user, full_name: "Jude Anyere", phone: null, preferred_locale: "en" },
    authPhone: null,
  });

  const result = await produceReliefEnrollmentNotifications(supabase, ids.enrollment);

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "missing_phone");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("proxy member is queued via proxy phone", async () => {
  const { produceReliefEnrollmentNotifications } = loadProducer();
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

  const result = await produceReliefEnrollmentNotifications(supabase, ids.enrollment);

  assert.equal(result.status, "queued");
  const payload = supabase.calls.find((c) => c.op === "insert" && c.table === "notifications_queue").payload;
  assert.equal(payload.data.whatsappData.memberName, "Mama Ngozi");
  assert.equal(payload.user_id, null);
});

test("inactive enrollment does not produce", async () => {
  const { produceReliefEnrollmentNotifications } = loadProducer();
  const supabase = createMockSupabase();

  const result = await produceReliefEnrollmentNotifications(supabase, ids.inactiveEnrollment);

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "enrollment_inactive");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("membership/plan group mismatch is skipped", async () => {
  const { produceReliefEnrollmentNotifications } = loadProducer();
  const supabase = createMockSupabase();

  const result = await produceReliefEnrollmentNotifications(supabase, ids.mismatchEnrollment);

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "enrollment_membership_group_mismatch");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("existing queue row prevents duplicate enrollment notice", async () => {
  const { produceReliefEnrollmentNotifications } = loadProducer();
  const supabase = createMockSupabase({
    existingQueue: { id: "existing", data: { enrollmentId: ids.duplicateEnrollment }, status: "queued" },
  });

  const result = await produceReliefEnrollmentNotifications(supabase, ids.duplicateEnrollment);

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "duplicate_whatsapp_enrollment");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("client paths route WhatsApp through the producer, never directly", () => {
  const enrollmentPage = fs.readFileSync(enrollmentPagePath, "utf8");
  assert.doesNotMatch(enrollmentPage, /whatsappType:\s*"relief_enrollment"/);
  assert.match(enrollmentPage, /requestReliefEnrollmentWhatsApp/);
  assert.match(enrollmentPage, /whatsapp:\s*false/);
  // In-app/email/SMS submission behavior preserved.
  assert.match(enrollmentPage, /inApp:\s*true/);
  assert.match(enrollmentPage, /email:\s*true/);
  assert.match(enrollmentPage, /sms:\s*true/);

  const plansPage = fs.readFileSync(plansPagePath, "utf8");
  const triggerCount = plansPage.split("requestReliefEnrollmentWhatsApp(").length - 1;
  assert.ok(triggerCount >= 2, "auto-enroll and bulk-enroll paths must both trigger the producer");
  assert.doesNotMatch(plansPage, /whatsappType:\s*"relief_enrollment"/);
});

test("route authorizes group owners/admins and bounds the batch", () => {
  const source = fs.readFileSync(routePath, "utf8");
  assert.match(source, /Malformed JSON/);
  assert.match(source, /\.in\("role", \["owner", "admin"\]\)/);
  assert.match(source, /membership_status", "active"/);
  assert.match(source, /isPlatformStaff/);
  assert.match(source, /MAX_BATCH/);
});
