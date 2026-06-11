import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const sourcePath = new URL("../src/lib/hosting-assignment-producer.ts", import.meta.url);
const routePath = new URL("../src/app/api/hosting/assignment-notifications/route.ts", import.meta.url);
const hostingPagePath = new URL("../src/app/[locale]/(dashboard)/dashboard/hosting/page.tsx", import.meta.url);
const templatesPath = new URL("../src/lib/whatsapp-templates.ts", import.meta.url);
const require = createRequire(import.meta.url);

const ids = {
  assignment: "11111111-1111-4111-8111-111111111111",
  completedAssignment: "22222222-2222-4222-8222-222222222222",
  pastAssignment: "33333333-3333-4333-8333-333333333333",
  duplicateAssignment: "44444444-4444-4444-8444-444444444444",
  roster: "55555555-5555-4555-8555-555555555555",
  membership: "66666666-6666-4666-8666-666666666666",
  user: "77777777-7777-4777-8777-777777777777",
  group: "88888888-8888-4888-8888-888888888888",
};

const fullPhone = ["+1", "301", "433", "5857"].join("");
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
      return { WA_TEMPLATES: { HOSTING_ASSIGNMENT: "villageclaq_hosting_reminder" } };
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
    roster: { id: ids.roster, group_id: ids.group },
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
  if (table === "hosting_assignments") {
    const requestedId = filters.find((f) => f.column === "id")?.value;
    if (requestedId === ids.completedAssignment) return { ...state.assignment, id: ids.completedAssignment, status: "completed" };
    if (requestedId === ids.pastAssignment) return { ...state.assignment, id: ids.pastAssignment, assigned_date: "2020-01-01" };
    if (requestedId === ids.duplicateAssignment) return { ...state.assignment, id: ids.duplicateAssignment };
    if (requestedId === state.assignment.id) return state.assignment;
    return null;
  }
  if (table === "hosting_rosters") return state.roster;
  if (table === "memberships") return state.membership;
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

test("upcoming assignment queues exactly one WhatsApp row with non-empty variables", async () => {
  const { produceHostingAssignmentNotifications } = loadProducer();
  const supabase = createMockSupabase();
  const logger = createLogger();

  const result = await produceHostingAssignmentNotifications(supabase, ids.assignment, { logger });

  assert.equal(result.status, "queued");
  assert.equal(result.template, "villageclaq_hosting_reminder");

  const queueInserts = supabase.calls.filter((c) => c.op === "insert" && c.table === "notifications_queue");
  assert.equal(queueInserts.length, 1, "expected exactly one WhatsApp queue insert");

  const payload = queueInserts[0].payload;
  assert.equal(payload.channel, "whatsapp");
  assert.equal(payload.template, "hosting_assignment");
  assert.equal(payload.data.whatsappType, "hosting_assignment");
  assert.equal(payload.data.template, "villageclaq_hosting_reminder");
  assert.equal(payload.data.assignmentId, ids.assignment);
  assert.deepEqual(Object.keys(payload.data.whatsappData), ["memberName", "hostingDate", "groupName"]);
  assert.ok(payload.data.whatsappData.memberName.length > 0, "memberName must be non-empty");
  assert.ok(payload.data.whatsappData.hostingDate.length > 0, "hostingDate must be non-empty");
  assert.ok(payload.data.whatsappData.groupName.length > 0, "groupName must be non-empty");
  assert.equal(payload.data.whatsappData.hostingDate, "Jul 15, 2030");
  assert.equal(payload.data.locale, "en");

  // WhatsApp-only producer — no other table writes.
  assert.equal(supabase.calls.some((c) => c.op === "insert" && c.table !== "notifications_queue"), false);

  const logText = JSON.stringify(logger.records);
  assert.match(logText, /\+130\*{6}857/);
  assert.doesNotMatch(logText, new RegExp(fullPhone.replace("+", "\\+")));
});

test("recipient's French preferred locale wins over the admin's locale", async () => {
  const { produceHostingAssignmentNotifications } = loadProducer();
  const supabase = createMockSupabase({
    profile: { id: ids.user, full_name: "Jude Anyere", phone: fullPhone, preferred_locale: "fr" },
  });

  // options.locale is the assigning ADMIN's UI locale — the recipient wins.
  const result = await produceHostingAssignmentNotifications(supabase, ids.assignment, { locale: "en" });

  assert.equal(result.status, "queued");
  const payload = supabase.calls.find((c) => c.op === "insert" && c.table === "notifications_queue").payload;
  assert.equal(payload.data.locale, "fr");
  assert.match(payload.data.whatsappData.hostingDate, /juil/i);
});

test("non-active membership never receives an assignment notice", async () => {
  const { produceHostingAssignmentNotifications } = loadProducer();
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

  const result = await produceHostingAssignmentNotifications(supabase, ids.assignment);

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "membership_not_active");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("producer gates on hosting_reminders preferences and skips when WhatsApp disabled", async () => {
  const { produceHostingAssignmentNotifications } = loadProducer();
  const supabase = createMockSupabase();
  const channelCalls = [];

  const result = await produceHostingAssignmentNotifications(supabase, ids.assignment, {
    getChannels: async (client, userId, notificationType, groupId) => {
      channelCalls.push({ userId, notificationType, groupId });
      return { in_app: true, email: true, sms: true, whatsapp: false, push: false };
    },
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "whatsapp_disabled");
  assert.equal(channelCalls[0].notificationType, "hosting_reminders");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("missing phone skips safely", async () => {
  const { produceHostingAssignmentNotifications } = loadProducer();
  const supabase = createMockSupabase({
    profile: { id: ids.user, full_name: "Jude Anyere", phone: null, preferred_locale: "en" },
    authPhone: null,
  });

  const result = await produceHostingAssignmentNotifications(supabase, ids.assignment);

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "missing_phone");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("proxy member is queued via proxy phone", async () => {
  const { produceHostingAssignmentNotifications } = loadProducer();
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

  const result = await produceHostingAssignmentNotifications(supabase, ids.assignment);

  assert.equal(result.status, "queued");
  const payload = supabase.calls.find((c) => c.op === "insert" && c.table === "notifications_queue").payload;
  assert.equal(payload.data.whatsappData.memberName, "Papa Mbarga");
  assert.equal(payload.user_id, null);
});

test("non-upcoming assignment does not produce", async () => {
  const { produceHostingAssignmentNotifications } = loadProducer();
  const supabase = createMockSupabase();

  const result = await produceHostingAssignmentNotifications(supabase, ids.completedAssignment);

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "assignment_not_upcoming");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("past-dated assignment does not produce", async () => {
  const { produceHostingAssignmentNotifications } = loadProducer();
  const supabase = createMockSupabase();

  const result = await produceHostingAssignmentNotifications(supabase, ids.pastAssignment);

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "assignment_in_past");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("existing queue row prevents duplicate assignment notice", async () => {
  const { produceHostingAssignmentNotifications } = loadProducer();
  const supabase = createMockSupabase({
    existingQueue: { id: "existing", data: { assignmentId: ids.duplicateAssignment }, status: "queued" },
  });

  const result = await produceHostingAssignmentNotifications(supabase, ids.duplicateAssignment);

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "duplicate_whatsapp_assignment");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("hosting_assignment maps to the approved villageclaq_hosting_reminder template", () => {
  const templates = fs.readFileSync(templatesPath, "utf8");
  assert.match(templates, /HOSTING_ASSIGNMENT:\s*"villageclaq_hosting_reminder"/);
  // The dedicated hosting reminder mapping is unchanged.
  assert.match(templates, /HOSTING_REMINDER:\s*"villageclaq_hosting_reminder"/);
});

test("hosting page routes WhatsApp through the producer, never directly", () => {
  const source = fs.readFileSync(hostingPagePath, "utf8");
  assert.doesNotMatch(source, /whatsappType:\s*"hosting_assignment"/);
  const triggerCount = source.split("requestHostingAssignmentWhatsApp(").length - 1;
  assert.ok(triggerCount >= 2, "publish and assign-dialog paths must both trigger the producer");
  // The swap-flow hosting_reminder sends are intentionally untouched.
  assert.match(source, /whatsappType:\s*"hosting_reminder"/);
});

test("route authorizes group owners/admins and bounds the batch", () => {
  const source = fs.readFileSync(routePath, "utf8");
  assert.match(source, /Malformed JSON/);
  assert.match(source, /\.in\("role", \["owner", "admin"\]\)/);
  assert.match(source, /membership_status", "active"/);
  assert.match(source, /isPlatformStaff/);
  assert.match(source, /MAX_BATCH/);
});
