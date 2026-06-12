import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const sourcePath = new URL("../src/lib/member-invitation-producer.ts", import.meta.url);
const routePath = new URL("../src/app/api/invitations/whatsapp-notifications/route.ts", import.meta.url);
const invitationsPagePath = new URL("../src/app/[locale]/(dashboard)/dashboard/invitations/page.tsx", import.meta.url);
const onboardingPagePath = new URL("../src/app/[locale]/(dashboard)/dashboard/onboarding/group/page.tsx", import.meta.url);
const branchesPagePath = new URL("../src/app/[locale]/(dashboard)/dashboard/enterprise/branches/page.tsx", import.meta.url);
const dispatcherPath = new URL("../src/lib/whatsapp-dispatcher.ts", import.meta.url);
const require = createRequire(import.meta.url);

const ids = {
  invitation: "11111111-1111-4111-8111-111111111111",
  acceptedInvitation: "22222222-2222-4222-8222-222222222222",
  expiredInvitation: "33333333-3333-4333-8333-333333333333",
  emailInvitation: "44444444-4444-4444-8444-444444444444",
  claimInvitation: "55555555-5555-4555-8555-555555555555",
  duplicateInvitation: "66666666-6666-4666-8666-666666666666",
  group: "99999999-9999-4999-8999-999999999999",
  claimMembership: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  inviter: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
};

const inviteePhone = ["+1", "301", "433", "5857"].join("");
const SEND_DATE = "2026-06-15";
const FUTURE_EXPIRY = "2030-01-01T00:00:00Z";

function loadProducer() {
  const source = fs.readFileSync(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
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
          if (record.privacy_settings?.proxy_name) return record.privacy_settings.proxy_name;
          return "Member";
        },
      };
    }
    if (id === "@/lib/whatsapp-templates") {
      return { WA_TEMPLATES: { MEMBER_INVITATION: "villageclaq_member_invitation_notice" } };
    }
    return require(id);
  };

  vm.runInNewContext(compiled, {
    console,
    exports: cjsModule.exports,
    module: cjsModule,
    require: localRequire,
    process: { env: {} }, // producer reads NEXT_PUBLIC_APP_URL with a fallback
    Date,
  }, { filename: sourcePath.pathname });
  return cjsModule.exports;
}

function createMockSupabase(options = {}) {
  const state = {
    invitations: {
      [ids.invitation]: { id: ids.invitation, group_id: ids.group, invited_by: ids.inviter, email: null, phone: inviteePhone, status: "pending", expires_at: FUTURE_EXPIRY, claim_membership_id: null },
      [ids.acceptedInvitation]: { id: ids.acceptedInvitation, group_id: ids.group, invited_by: ids.inviter, email: null, phone: inviteePhone, status: "accepted", expires_at: FUTURE_EXPIRY, claim_membership_id: null },
      [ids.expiredInvitation]: { id: ids.expiredInvitation, group_id: ids.group, invited_by: ids.inviter, email: null, phone: inviteePhone, status: "pending", expires_at: "2020-01-01T00:00:00Z", claim_membership_id: null },
      [ids.emailInvitation]: { id: ids.emailInvitation, group_id: ids.group, invited_by: ids.inviter, email: "invitee@example.com", phone: null, status: "pending", expires_at: FUTURE_EXPIRY, claim_membership_id: null },
      [ids.claimInvitation]: { id: ids.claimInvitation, group_id: ids.group, invited_by: ids.inviter, email: null, phone: inviteePhone, status: "pending", expires_at: FUTURE_EXPIRY, claim_membership_id: ids.claimMembership },
      [ids.duplicateInvitation]: { id: ids.duplicateInvitation, group_id: ids.group, invited_by: ids.inviter, email: null, phone: inviteePhone, status: "pending", expires_at: FUTURE_EXPIRY, claim_membership_id: null },
    },
    group: { id: ids.group, name: "Njimafor Diaspora" },
    claimMembership: { id: ids.claimMembership, display_name: "Mama Ngozi", user_id: null, privacy_settings: {} },
    existingQueueRows: [], // { invitationId, sendDate }
    insertErrorCode: null,
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

  return { calls, from(table) { return new Builder(table); } };
}

function filterValue(filters, column) {
  return filters.find((f) => f.column === column)?.value;
}

function selectRow(table, filters, state) {
  if (table === "invitations") return state.invitations[filterValue(filters, "id")] || null;
  if (table === "groups") return state.group;
  if (table === "memberships") return state.claimMembership;
  if (table === "notifications_queue") {
    if (filterValue(filters, "template") !== "member_invitation") return null;
    const invitationId = filterValue(filters, "data->>invitationId");
    const sendDate = filterValue(filters, "data->>sendDate");
    const match = state.existingQueueRows.find((r) => r.invitationId === invitationId && r.sendDate === sendDate);
    return match ? { id: "existing-queue", status: "queued" } : null;
  }
  return null;
}

function createLogger() {
  const records = [];
  return { records, log(...args) { records.push(args); }, warn(...args) { records.push(args); } };
}

test("a pending phone invitation queues exactly one WhatsApp row with ordered non-empty variables", async () => {
  const { produceMemberInvitationNotification } = loadProducer();
  const supabase = createMockSupabase();
  const logger = createLogger();

  const result = await produceMemberInvitationNotification(supabase, ids.invitation, {
    logger,
    sendDate: SEND_DATE,
    locale: "en",
  });

  assert.equal(result.status, "queued");
  assert.equal(result.template, "villageclaq_member_invitation_notice");
  assert.equal(result.sendDate, SEND_DATE);

  const queueInserts = supabase.calls.filter((c) => c.op === "insert" && c.table === "notifications_queue");
  assert.equal(queueInserts.length, 1, "expected exactly one WhatsApp queue insert");

  const payload = queueInserts[0].payload;
  assert.equal(payload.channel, "whatsapp");
  assert.equal(payload.template, "member_invitation");
  assert.equal(payload.user_id, null); // invitee has no account
  assert.equal(payload.data.whatsappType, "member_invitation");
  assert.equal(payload.data.invitationId, ids.invitation);
  assert.equal(payload.data.sendDate, SEND_DATE);
  assert.deepEqual(Object.keys(payload.data.whatsappData), ["inviteeName", "groupName", "invitationLink"]);
  for (const [key, value] of Object.entries(payload.data.whatsappData)) {
    assert.ok(String(value).length > 0, `${key} must be non-empty`);
  }
  assert.equal(payload.data.whatsappData.inviteeName, "Member"); // EN fallback label
  assert.equal(payload.data.whatsappData.groupName, "Njimafor Diaspora");
  // Same destination as the invitation email (rule 12), locale-prefixed.
  assert.equal(payload.data.whatsappData.invitationLink, "https://villageclaq.com/en/login?redirectTo=/dashboard/my-invitations");
  assert.equal(payload.data.recipient, inviteePhone);

  const logText = JSON.stringify(logger.records);
  assert.match(logText, /\+130\*{6}857/);
  assert.doesNotMatch(logText, new RegExp(inviteePhone.replace("+", "\\+")));
});

test("French locale localizes the fallback label and the link prefix", async () => {
  const { produceMemberInvitationNotification } = loadProducer();
  const supabase = createMockSupabase();

  const result = await produceMemberInvitationNotification(supabase, ids.invitation, {
    sendDate: SEND_DATE,
    locale: "fr",
  });

  assert.equal(result.status, "queued");
  const payload = supabase.calls.find((c) => c.op === "insert").payload;
  assert.equal(payload.data.locale, "fr");
  assert.equal(payload.data.whatsappData.inviteeName, "Membre");
  assert.match(payload.data.whatsappData.invitationLink, /\/fr\/login\?redirectTo=/);
});

test("proxy-claim invitations use the claim membership's name for {{1}}", async () => {
  const { produceMemberInvitationNotification } = loadProducer();
  const supabase = createMockSupabase();

  const result = await produceMemberInvitationNotification(supabase, ids.claimInvitation, {
    sendDate: SEND_DATE,
  });

  assert.equal(result.status, "queued");
  const payload = supabase.calls.find((c) => c.op === "insert").payload;
  assert.equal(payload.data.whatsappData.inviteeName, "Mama Ngozi");
});

test("same-day repeated trigger does not duplicate", async () => {
  const { produceMemberInvitationNotification } = loadProducer();
  const supabase = createMockSupabase({
    existingQueueRows: [{ invitationId: ids.duplicateInvitation, sendDate: SEND_DATE }],
  });

  const result = await produceMemberInvitationNotification(supabase, ids.duplicateInvitation, {
    sendDate: SEND_DATE,
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "duplicate_whatsapp_invitation");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("a later-day resend queues again (day bucket supports the resend feature)", async () => {
  const { produceMemberInvitationNotification } = loadProducer();
  const supabase = createMockSupabase({
    existingQueueRows: [{ invitationId: ids.invitation, sendDate: SEND_DATE }],
  });

  const result = await produceMemberInvitationNotification(supabase, ids.invitation, {
    sendDate: "2026-06-18",
  });

  assert.equal(result.status, "queued");
  const payload = supabase.calls.find((c) => c.op === "insert").payload;
  assert.equal(payload.data.sendDate, "2026-06-18");
});

test("non-pending invitations are never messaged", async () => {
  const { produceMemberInvitationNotification } = loadProducer();
  const supabase = createMockSupabase();

  const result = await produceMemberInvitationNotification(supabase, ids.acceptedInvitation, {
    sendDate: SEND_DATE,
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "invitation_not_pending");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("expired invitations are never messaged", async () => {
  const { produceMemberInvitationNotification } = loadProducer();
  const supabase = createMockSupabase();

  const result = await produceMemberInvitationNotification(supabase, ids.expiredInvitation, {
    sendDate: SEND_DATE,
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "invitation_expired");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("email-only invitations skip (no phone to message)", async () => {
  const { produceMemberInvitationNotification } = loadProducer();
  const supabase = createMockSupabase();

  const result = await produceMemberInvitationNotification(supabase, ids.emailInvitation, {
    sendDate: SEND_DATE,
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "missing_phone");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("unique-violation race (23505) is treated as a duplicate skip", async () => {
  const { produceMemberInvitationNotification } = loadProducer();
  const supabase = createMockSupabase({ insertErrorCode: "23505" });

  const result = await produceMemberInvitationNotification(supabase, ids.invitation, {
    sendDate: SEND_DATE,
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "duplicate_whatsapp_invitation");
});

test("the old dead client WhatsApp path is removed and the new wiring is in place", () => {
  const invitationsPage = fs.readFileSync(invitationsPagePath, "utf8");
  // The dead inline send (regex-gated, recipient-guard-blocked) is gone.
  assert.doesNotMatch(invitationsPage, /\/api\/whatsapp\/send/);
  assert.doesNotMatch(invitationsPage, /type:\s*"invitation"/);

  // Phone-carrying invitation flows trigger the producer.
  const onboardingPage = fs.readFileSync(onboardingPagePath, "utf8");
  assert.match(onboardingPage, /requestMemberInvitationWhatsApp/);
  assert.match(onboardingPage, /\.select\("id, phone"\)/);
  const branchesPage = fs.readFileSync(branchesPagePath, "utf8");
  assert.match(branchesPage, /requestMemberInvitationWhatsApp/);

  // Dispatcher uses the NEW type with invitee-first variables; the legacy
  // inviter-keyed type remains untouched for historical rows.
  const dispatcher = fs.readFileSync(dispatcherPath, "utf8");
  assert.match(dispatcher, /case "member_invitation":/);
  assert.match(dispatcher, /inviteeName:\s*d\.inviteeName/);
  assert.match(dispatcher, /member_invitation:\s*WA_TEMPLATES\.MEMBER_INVITATION/);

  const route = fs.readFileSync(routePath, "utf8");
  assert.match(route, /invited_by/);
  assert.match(route, /\.in\("role", \["owner", "admin"\]\)/);
  assert.match(route, /isPlatformStaff/);
});
