import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const sourcePath = new URL("../src/lib/welcome-producer.ts", import.meta.url);
const notifyWelcomePath = new URL("../src/lib/notify-welcome.ts", import.meta.url);
const welcomeRoutePath = new URL("../src/app/api/members/welcome-notifications/route.ts", import.meta.url);
const myInvitationsPath = new URL("../src/app/[locale]/(dashboard)/dashboard/my-invitations/page.tsx", import.meta.url);
const claimPagePath = new URL("../src/app/[locale]/claim/[token]/page.tsx", import.meta.url);
const joinClientPath = new URL("../src/app/[locale]/join/[code]/join-client.tsx", import.meta.url);
const joinDialogPath = new URL("../src/components/ui/join-by-code-dialog.tsx", import.meta.url);
const require = createRequire(import.meta.url);

const ids = {
  membership: "11111111-1111-4111-8111-111111111111",
  proxyMembership: "22222222-2222-4222-8222-222222222222",
  pendingMembership: "33333333-3333-4333-8333-333333333333",
  duplicateMembership: "44444444-4444-4444-8444-444444444444",
  user: "55555555-5555-4555-8555-555555555555",
  group: "66666666-6666-4666-8666-666666666666",
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
      return { WA_TEMPLATES: { WELCOME: "villageclaq_member_joined" } };
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

function selectRow(table, filters, state) {
  if (table === "memberships") {
    const requestedId = filters.find((filter) => filter.column === "id")?.value;
    if (requestedId === ids.proxyMembership) {
      return {
        ...state.membership,
        id: ids.proxyMembership,
        user_id: null,
        is_proxy: true,
        privacy_settings: { proxy_name: "Proxy Member", proxy_phone: fullPhone },
      };
    }
    if (requestedId === ids.pendingMembership) {
      return { ...state.membership, id: ids.pendingMembership, membership_status: "pending_approval" };
    }
    if (requestedId === ids.duplicateMembership) {
      return { ...state.membership, id: ids.duplicateMembership };
    }
    if (requestedId === state.membership.id) return state.membership;
    return null;
  }
  if (table === "profiles") return state.profile;
  if (table === "groups") return state.group;
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

test("active membership produces exactly one server-side WhatsApp welcome queue row", async () => {
  const { produceWelcomeNotifications } = loadProducer();
  const supabase = createMockSupabase();
  const logger = createLogger();

  const result = await produceWelcomeNotifications(supabase, ids.membership, {
    logger,
    getChannels: async () => ({ in_app: true, email: true, sms: true, whatsapp: true, push: false }),
  });

  assert.equal(result.status, "queued");
  assert.equal(result.template, "villageclaq_member_joined");
  assert.equal(result.whatsappQueued, true);

  const queueInserts = supabase.calls.filter((call) => call.op === "insert" && call.table === "notifications_queue");
  assert.equal(queueInserts.length, 1, "expected exactly one WhatsApp queue insert");

  const queueInsert = queueInserts[0];
  assert.equal(queueInsert.payload.channel, "whatsapp");
  assert.equal(queueInsert.payload.template, "welcome");
  assert.equal(queueInsert.payload.status, "queued");
  assert.equal(queueInsert.payload.user_id, ids.user);
  assert.equal(queueInsert.payload.data.whatsappType, "welcome");
  assert.equal(queueInsert.payload.data.template, "villageclaq_member_joined");
  assert.equal(queueInsert.payload.data.membershipId, ids.membership);
  assert.equal(queueInsert.payload.data.groupId, ids.group);
  assert.equal(queueInsert.payload.data.recipient, fullPhone);
  assert.equal(queueInsert.payload.data.locale, "en");

  // The producer must never write to other tables (welcome is WhatsApp-only).
  assert.equal(supabase.calls.some((call) => call.op === "insert" && call.table !== "notifications_queue"), false);

  const logText = JSON.stringify(logger.records);
  assert.match(logText, /\+130\*{6}857/);
  assert.doesNotMatch(logText, new RegExp(fullPhone.replace("+", "\\+")));
});

test("welcome template variables stay ordered memberName then groupName", async () => {
  const { produceWelcomeNotifications } = loadProducer();
  const supabase = createMockSupabase();

  const result = await produceWelcomeNotifications(supabase, ids.membership);

  assert.equal(result.status, "queued");
  const queueInsert = supabase.calls.find((call) => call.op === "insert" && call.table === "notifications_queue");
  assert.deepEqual(Object.keys(queueInsert.payload.data.whatsappData), ["memberName", "groupName"]);
  assert.equal(queueInsert.payload.data.whatsappData.memberName, "Jude Anyere");
  assert.equal(queueInsert.payload.data.whatsappData.groupName, "Njimafor Diaspora");
});

test("welcome producer gates on new_member notification preferences", async () => {
  const { produceWelcomeNotifications } = loadProducer();
  const supabase = createMockSupabase();
  const channelCalls = [];

  const result = await produceWelcomeNotifications(supabase, ids.membership, {
    getChannels: async (client, userId, notificationType, groupId) => {
      channelCalls.push({ userId, notificationType, groupId });
      return { in_app: true, email: true, sms: true, whatsapp: true, push: false };
    },
  });

  assert.equal(result.status, "queued");
  assert.equal(channelCalls.length, 1);
  assert.equal(channelCalls[0].notificationType, "new_member");
  assert.equal(channelCalls[0].userId, ids.user);
  assert.equal(channelCalls[0].groupId, ids.group);
});

test("WhatsApp disabled by preference skips the welcome queue entirely", async () => {
  const { produceWelcomeNotifications } = loadProducer();
  const supabase = createMockSupabase();

  const result = await produceWelcomeNotifications(supabase, ids.membership, {
    getChannels: async () => ({ in_app: true, email: true, sms: true, whatsapp: false, push: false }),
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "whatsapp_disabled");
  assert.equal(supabase.calls.some((call) => call.op === "insert"), false);
});

test("missing phone skips the welcome queue", async () => {
  const { produceWelcomeNotifications } = loadProducer();
  const supabase = createMockSupabase({
    profile: {
      id: ids.user,
      full_name: "Jude Anyere",
      phone: null,
      preferred_locale: "en",
    },
    authPhone: null,
  });

  const result = await produceWelcomeNotifications(supabase, ids.membership);

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "missing_phone");
  assert.ok(supabase.calls.find((call) => call.op === "auth.admin.getUserById" && call.userId === ids.user));
  assert.equal(supabase.calls.some((call) => call.op === "insert"), false);
});

test("invalid phone skips the welcome queue without logging the raw value", async () => {
  const { produceWelcomeNotifications } = loadProducer();
  const rawInvalidPhone = "12345";
  const supabase = createMockSupabase({
    profile: {
      id: ids.user,
      full_name: "Jude Anyere",
      phone: rawInvalidPhone,
      preferred_locale: "en",
    },
  });
  const logger = createLogger();

  const result = await produceWelcomeNotifications(supabase, ids.membership, { logger });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "invalid_phone");
  assert.equal(supabase.calls.some((call) => call.op === "insert"), false);
  const logText = JSON.stringify(logger.records);
  assert.doesNotMatch(logText, new RegExp(rawInvalidPhone));
});

test("unclaimed proxy membership (no user account) never receives a welcome", async () => {
  const { produceWelcomeNotifications } = loadProducer();
  const supabase = createMockSupabase();

  const result = await produceWelcomeNotifications(supabase, ids.proxyMembership);

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "no_user_account");
  assert.equal(supabase.calls.some((call) => call.op === "insert"), false);
});

test("pending_approval membership does not produce a welcome", async () => {
  const { produceWelcomeNotifications } = loadProducer();
  const supabase = createMockSupabase();

  const result = await produceWelcomeNotifications(supabase, ids.pendingMembership);

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "membership_not_active");
  assert.equal(supabase.calls.some((call) => call.op === "insert"), false);
});

test("existing queue row prevents duplicate welcome for the same membership", async () => {
  const { produceWelcomeNotifications } = loadProducer();
  const supabase = createMockSupabase({
    existingQueue: {
      id: "existing-queue",
      data: { membershipId: ids.duplicateMembership },
      status: "queued",
    },
  });

  const result = await produceWelcomeNotifications(supabase, ids.duplicateMembership);

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "duplicate_whatsapp_welcome");
  assert.equal(supabase.calls.some((call) => call.op === "insert"), false);
});

test("French preferred locale flows into the queued payload", async () => {
  const { produceWelcomeNotifications } = loadProducer();
  const supabase = createMockSupabase({
    profile: {
      id: ids.user,
      full_name: "Jude Anyere",
      phone: fullPhone,
      preferred_locale: "fr",
    },
  });

  const result = await produceWelcomeNotifications(supabase, ids.membership);

  assert.equal(result.status, "queued");
  const queueInsert = supabase.calls.find((call) => call.op === "insert" && call.table === "notifications_queue");
  assert.equal(queueInsert.payload.data.locale, "fr");
});

test("join flows call the welcome producer route, not a direct WhatsApp send", () => {
  const notifyWelcome = fs.readFileSync(notifyWelcomePath, "utf8");
  assert.match(notifyWelcome, /\/api\/members\/welcome-notifications/);
  assert.doesNotMatch(notifyWelcome, /\/api\/whatsapp\/send/);

  for (const pagePath of [myInvitationsPath, claimPagePath, joinClientPath, joinDialogPath]) {
    const source = fs.readFileSync(pagePath, "utf8");
    assert.match(source, /requestWelcomeWhatsApp/, `${pagePath.pathname} should request the WhatsApp welcome`);
  }

  // Invitation acceptance must not welcome users who were already members.
  const myInvitations = fs.readFileSync(myInvitationsPath, "utf8");
  assert.match(myInvitations, /already_member/);
});

test("welcome notification route returns 400 for malformed JSON and authorizes the member", () => {
  const source = fs.readFileSync(welcomeRoutePath, "utf8");

  assert.match(source, /Malformed JSON/);
  assert.match(source, /status:\s*400/);
  assert.match(source, /await request\.json\(\)/);
  assert.match(source, /isPlatformStaff/);
  assert.match(source, /memberUserId !== user\.id/);
});
