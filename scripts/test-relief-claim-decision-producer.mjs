import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const sourcePath = new URL("../src/lib/relief-claim-decision-producer.ts", import.meta.url);
const routePath = new URL("../src/app/api/relief/claim-notifications/route.ts", import.meta.url);
const claimsPagePath = new URL("../src/app/[locale]/(dashboard)/dashboard/relief/claims/page.tsx", import.meta.url);
const plansPagePath = new URL("../src/app/[locale]/(dashboard)/dashboard/relief/plans/page.tsx", import.meta.url);
const require = createRequire(import.meta.url);

const ids = {
  approvedClaim: "11111111-1111-4111-8111-111111111111",
  deniedClaim: "22222222-2222-4222-8222-222222222222",
  submittedClaim: "33333333-3333-4333-8333-333333333333",
  reasonlessDenied: "44444444-4444-4444-8444-444444444444",
  proxyClaim: "55555555-5555-4555-8555-555555555555",
  membership: "66666666-6666-4666-8666-666666666666",
  proxyMembership: "77777777-7777-4777-8777-777777777777",
  user: "88888888-8888-4888-8888-888888888888",
  group: "99999999-9999-4999-8999-999999999999",
  plan: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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
      return {
        WA_TEMPLATES: {
          RELIEF_CLAIM_APPROVED: "villageclaq_relief_claim_approved",
          RELIEF_CLAIM_DENIED: "villageclaq_relief_claim_denied",
        },
      };
    }
    return require(id);
  };

  vm.runInNewContext(compiled, { console, exports: cjsModule.exports, module: cjsModule, require: localRequire }, { filename: sourcePath.pathname });
  return cjsModule.exports;
}

function createMockSupabase(options = {}) {
  const state = {
    claims: {
      [ids.approvedClaim]: { id: ids.approvedClaim, plan_id: ids.plan, membership_id: ids.membership, amount: 75000, status: "approved", review_notes: "Documents verified" },
      [ids.deniedClaim]: { id: ids.deniedClaim, plan_id: ids.plan, membership_id: ids.membership, amount: 75000, status: "denied", review_notes: "Insufficient documentation" },
      [ids.submittedClaim]: { id: ids.submittedClaim, plan_id: ids.plan, membership_id: ids.membership, amount: 75000, status: "submitted", review_notes: null },
      [ids.reasonlessDenied]: { id: ids.reasonlessDenied, plan_id: ids.plan, membership_id: ids.membership, amount: 75000, status: "denied", review_notes: null },
      [ids.proxyClaim]: { id: ids.proxyClaim, plan_id: ids.plan, membership_id: ids.proxyMembership, amount: 10000, status: "approved", review_notes: null },
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
    plan: { id: ids.plan, group_id: ids.group, name: "Bereavement Fund", name_fr: "Fonds de deuil" },
    existingQueueRows: [], // { claimId, template }
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
  if (table === "relief_claims") {
    return state.claims[filterValue(filters, "id")] || null;
  }
  if (table === "relief_plans") return state.plan;
  if (table === "memberships") {
    const requestedId = filterValue(filters, "id");
    if (requestedId === ids.proxyMembership) return state.proxyMembership;
    return state.membership;
  }
  if (table === "profiles") return state.profile;
  if (table === "groups") return state.group;
  if (table === "notifications_queue") {
    // Honors BOTH the decision-template filter and the claimId filter, so
    // the per-(claim, decision) key is genuinely exercised.
    const template = filterValue(filters, "template");
    const claimId = filterValue(filters, "data->>claimId");
    const match = state.existingQueueRows.find((r) => r.claimId === claimId && r.template === template);
    return match ? { id: "existing-queue", status: "queued" } : null;
  }
  return null;
}

function createLogger() {
  const records = [];
  return { records, log(...args) { records.push(args); }, warn(...args) { records.push(args); } };
}

test("an approved claim queues exactly one WhatsApp row with ordered non-empty variables", async () => {
  const { produceReliefClaimDecisionNotification } = loadProducer();
  const supabase = createMockSupabase();
  const logger = createLogger();

  const result = await produceReliefClaimDecisionNotification(supabase, ids.approvedClaim, { logger });

  assert.equal(result.status, "queued");
  assert.equal(result.decision, "approved");
  assert.equal(result.template, "villageclaq_relief_claim_approved");

  const queueInserts = supabase.calls.filter((c) => c.op === "insert" && c.table === "notifications_queue");
  assert.equal(queueInserts.length, 1, "expected exactly one WhatsApp queue insert");

  const payload = queueInserts[0].payload;
  assert.equal(payload.template, "relief_claim_approved");
  assert.equal(payload.data.whatsappType, "relief_claim_approved");
  assert.equal(payload.data.claimId, ids.approvedClaim);
  assert.equal(payload.data.decision, "approved");
  assert.deepEqual(Object.keys(payload.data.whatsappData), ["memberName", "claimType", "amount", "groupName"]);
  for (const [key, value] of Object.entries(payload.data.whatsappData)) {
    assert.ok(String(value).length > 0, `${key} must be non-empty`);
  }
  assert.equal(payload.data.whatsappData.claimType, "Bereavement Fund");
  assert.equal(payload.data.whatsappData.amount, "75,000 FCFA");
  assert.equal(payload.data.recipient, fullPhone);

  const logText = JSON.stringify(logger.records);
  assert.match(logText, /\+130\*{6}857/);
  assert.doesNotMatch(logText, new RegExp(fullPhone.replace("+", "\\+")));
});

test("a denied claim queues the denied template with the review reason", async () => {
  const { produceReliefClaimDecisionNotification } = loadProducer();
  const supabase = createMockSupabase();

  const result = await produceReliefClaimDecisionNotification(supabase, ids.deniedClaim, {});

  assert.equal(result.status, "queued");
  assert.equal(result.decision, "denied");
  assert.equal(result.template, "villageclaq_relief_claim_denied");

  const payload = supabase.calls.find((c) => c.op === "insert").payload;
  assert.equal(payload.template, "relief_claim_denied");
  assert.deepEqual(Object.keys(payload.data.whatsappData), ["memberName", "claimType", "reason", "groupName"]);
  assert.equal(payload.data.whatsappData.reason, "Insufficient documentation");
});

test("recipient's French preferred locale wins and localizes the plan name", async () => {
  const { produceReliefClaimDecisionNotification } = loadProducer();
  const supabase = createMockSupabase({
    profile: { id: ids.user, full_name: "Jude Anyere", phone: fullPhone, preferred_locale: "fr" },
  });

  const result = await produceReliefClaimDecisionNotification(supabase, ids.approvedClaim, { locale: "en" });
  assert.equal(result.status, "queued");
  const payload = supabase.calls.find((c) => c.op === "insert").payload;
  assert.equal(payload.data.locale, "fr");
  assert.equal(payload.data.whatsappData.claimType, "Fonds de deuil");
});

test("an undecided claim skips", async () => {
  const { produceReliefClaimDecisionNotification } = loadProducer();
  const supabase = createMockSupabase();

  const result = await produceReliefClaimDecisionNotification(supabase, ids.submittedClaim, {});
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "claim_not_decided");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("a denied claim with an empty review reason skips rather than sending a blank variable", async () => {
  const { produceReliefClaimDecisionNotification } = loadProducer();
  const supabase = createMockSupabase();

  const result = await produceReliefClaimDecisionNotification(supabase, ids.reasonlessDenied, {});
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "missing_template_data");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("repeated trigger for the same decision does not duplicate", async () => {
  const { produceReliefClaimDecisionNotification } = loadProducer();
  const supabase = createMockSupabase({
    existingQueueRows: [{ claimId: ids.approvedClaim, template: "relief_claim_approved" }],
  });

  const result = await produceReliefClaimDecisionNotification(supabase, ids.approvedClaim, {});
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "duplicate_whatsapp_claim_decision");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("a genuine reversal still notifies: an approved row does not block the denied notice", async () => {
  const { produceReliefClaimDecisionNotification } = loadProducer();
  // The claim is NOW denied, but an old approved-notice row exists.
  const supabase = createMockSupabase({
    existingQueueRows: [{ claimId: ids.deniedClaim, template: "relief_claim_approved" }],
  });

  const result = await produceReliefClaimDecisionNotification(supabase, ids.deniedClaim, {});
  assert.equal(result.status, "queued");
  assert.equal(result.decision, "denied");
  const payload = supabase.calls.find((c) => c.op === "insert").payload;
  assert.equal(payload.template, "relief_claim_denied");
});

test("unique-violation race (23505) is treated as a duplicate skip", async () => {
  const { produceReliefClaimDecisionNotification } = loadProducer();
  const supabase = createMockSupabase({ insertErrorCode: "23505" });

  const result = await produceReliefClaimDecisionNotification(supabase, ids.approvedClaim, {});
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "duplicate_whatsapp_claim_decision");
});

test("proxy claimants are included via proxy_phone (matches the old client path)", async () => {
  const { produceReliefClaimDecisionNotification } = loadProducer();
  const supabase = createMockSupabase();

  const result = await produceReliefClaimDecisionNotification(supabase, ids.proxyClaim, {});
  assert.equal(result.status, "queued");
  const payload = supabase.calls.find((c) => c.op === "insert").payload;
  assert.equal(payload.data.recipient, proxyPhone);
  assert.equal(payload.user_id, null);
});

test("producer gates on relief_updates preferences and skips when WhatsApp disabled", async () => {
  const { produceReliefClaimDecisionNotification } = loadProducer();
  const supabase = createMockSupabase();
  const channelCalls = [];

  const result = await produceReliefClaimDecisionNotification(supabase, ids.approvedClaim, {
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
  const { produceReliefClaimDecisionNotification } = loadProducer();
  const supabase = createMockSupabase({
    profile: { id: ids.user, full_name: "Jude Anyere", phone: null, preferred_locale: "en" },
    authPhone: null,
  });

  const result = await produceReliefClaimDecisionNotification(supabase, ids.approvedClaim, {});
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "missing_phone");
  assert.equal(supabase.calls.some((c) => c.op === "insert"), false);
});

test("both admin surfaces route WhatsApp through the producer", () => {
  const claimsPage = fs.readFileSync(claimsPagePath, "utf8");
  assert.doesNotMatch(claimsPage, /whatsappType:\s*"relief_claim_approved"/);
  assert.doesNotMatch(claimsPage, /whatsappType:\s*"relief_claim_denied"/);
  assert.match(claimsPage, /requestReliefClaimDecisionWhatsApp/);
  assert.match(claimsPage, /whatsapp:\s*false/);
  assert.match(claimsPage, /inApp:\s*false/);

  // The plans page previously decided claims silently — it now triggers the
  // producer too.
  const plansPage = fs.readFileSync(plansPagePath, "utf8");
  assert.match(plansPage, /requestReliefClaimDecisionWhatsApp/);

  const route = fs.readFileSync(routePath, "utf8");
  assert.match(route, /relief_plans/);
  assert.match(route, /\.in\("role", \["owner", "admin"\]\)/);
  assert.match(route, /isPlatformStaff/);
});
