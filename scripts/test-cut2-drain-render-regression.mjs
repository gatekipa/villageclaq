import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const renderPath = new URL("../src/lib/cut2-drain-render.ts", import.meta.url);

function loadRenderer() {
  const source = fs.readFileSync(renderPath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const cjsModule = { exports: {} };
  const localRequire = (id) => {
    if (id === "@/lib/currencies") {
      return { formatAmount: (amount, currency) => `${Number(amount).toLocaleString("en-US")} ${currency}` };
    }
    if (id === "@/lib/get-member-name") {
      return {
        getMemberName(record) {
          if (!record) return "Member";
          if (record.display_name) return record.display_name;
          return "Member";
        },
      };
    }
    if (id === "@/lib/cut2-channel-matrix") {
      return {
        CUT2_EMAIL_TEMPLATE: {
          welcome: "welcome",
          payment_receipt: "payment-receipt",
          payment_reminder: "payment-reminder",
          event_reminder: "event-reminder",
          minutes_published: "minutes-published",
          member_invitation: "invitation",
        },
        CUT2_WA_DISPATCH_TYPE: {
          payment_receipt: "payment_receipt",
          fine_issued: "fine_issued",
          standing_changed: "standing_changed",
          event_reminder: "event_reminder",
          hosting_reminder: "hosting_reminder",
          member_invitation: "member_invitation",
        },
      };
    }
    if (id === "@/lib/notifications/sms-templates") {
      return {
        paymentReceiptSms: () => "sms",
        paymentReminderSms: () => "sms",
        welcomeSms: () => "sms",
        standingChangedSms: ({ newStatus }) => `standing:${newStatus}`,
        hostingAssignmentSms: () => "sms",
        hostingReminderSms: ({ location }) => `loc:${location}`,
        eventReminderSms: ({ location }) => `loc:${location}`,
        loanApprovedSms: () => "sms",
        reliefEnrollmentSms: () => "sms",
        reliefClaimApprovedSms: () => "sms",
        reliefClaimDeniedSms: ({ reason }) => `denied:${reason}`,
        remittanceStatusSms: () => "sms",
        fineIssuedSms: ({ reason }) => `fine:${reason}`,
        minutesPublishedSms: () => "sms",
        announcementSms: () => "sms",
        subscriptionExpiringSms: () => "sms",
        proxyClaimSms: () => "sms",
      };
    }
    return require(id);
  };
  vm.runInNewContext(compiled, {
    console,
    exports: cjsModule.exports,
    module: cjsModule,
    require: localRequire,
    process,
  }, { filename: renderPath.pathname });
  return cjsModule.exports;
}

function mockSupabase(tables) {
  return {
    from(table) {
      const rows = tables[table] || [];
      const filters = [];
      const api = {
        select() { return api; },
        eq(col, val) { filters.push([col, val]); return api; },
        is() { return api; },
        order() { return api; },
        limit() { return api; },
        maybeSingle: async () => {
          const row = rows.find((r) => filters.every(([c, v]) => r[c] === v)) || rows[0] || null;
          return { data: row, error: null };
        },
      };
      return api;
    },
    auth: { admin: { getUserById: async (id) => ({ data: { user: tables.authUsers?.[id] || null }, error: null }) } },
  };
}

test("invitation drain uses invitations.email and locale-prefixed accept URL", async () => {
  const { renderCut2TrustedRow } = loadRenderer();
  const supabase = mockSupabase({
    invitations: [{
      id: "inv-1",
      group_id: "g1",
      email: "invitee@example.test",
      phone: null,
      invited_by: "u1",
      claim_membership_id: null,
    }],
    groups: [{ id: "g1", name: "Njimafor Diaspora", group_type: "alumni" }],
    profiles: [{ id: "u1", full_name: "Jude Anyere" }],
  });
  const rendered = await renderCut2TrustedRow(supabase, {
    channel: "email",
    template: "member_invitation",
    cut2_provenance_version: 1,
    data: { domain_object_id: "inv-1", locale: "fr" },
  });
  assert.equal(rendered.ok, true);
  assert.equal(rendered.to, "invitee@example.test");
  assert.equal(rendered.template, "invitation");
  assert.equal(rendered.data.inviteeName, "Membre");
  assert.match(rendered.data.acceptUrl, /\/fr\/login\?redirectTo=\/dashboard\/my-invitations/);
  assert.equal(rendered.data.locale, "fr");
});

test("fine drain falls back reason and FR standing label is localized", async () => {
  const { renderCut2TrustedRow } = loadRenderer();
  const fineDb = mockSupabase({
    fines: [{ id: "f1", group_id: "g1", amount: 1000, currency: "XAF", reason: null }],
    groups: [{ id: "g1", name: "Njimafor Diaspora" }],
    memberships: [{ id: "m1", group_id: "g1", user_id: "u1", display_name: "Jude", is_proxy: false, standing: "suspended" }],
    profiles: [{ id: "u1", full_name: "Jude", preferred_locale: "fr" }],
    authUsers: { u1: { email: "jude@example.test", phone: "+237600000001" } },
  });
  const fine = await renderCut2TrustedRow(fineDb, {
    channel: "whatsapp",
    template: "fine_issued",
    cut2_provenance_version: 1,
    data: { domain_object_id: "f1", recipient_membership_id: "m1", locale: "fr" },
  });
  assert.equal(fine.ok, true);
  assert.equal(fine.data.reason, "amende");
  assert.equal(fine.data.locale, "fr");

  const standingDb = mockSupabase({
    memberships: [{ id: "m1", group_id: "g1", user_id: "u1", display_name: "Jude", standing: "suspended" }],
    groups: [{ id: "g1", name: "Njimafor Diaspora" }],
    profiles: [{ id: "u1", full_name: "Jude", preferred_locale: "fr" }],
    authUsers: { u1: { phone: "+237600000001" } },
  });
  const standing = await renderCut2TrustedRow(standingDb, {
    channel: "whatsapp",
    template: "standing_changed",
    cut2_provenance_version: 1,
    data: { domain_object_id: "m1", recipient_membership_id: "m1", locale: "fr" },
  });
  assert.equal(standing.ok, true);
  assert.equal(standing.data.newStanding, "suspendu");
});

test("event and hosting location fallbacks are non-blank", async () => {
  const { renderCut2TrustedRow } = loadRenderer();
  const ev = await renderCut2TrustedRow(mockSupabase({
    events: [{ id: "e1", group_id: "g1", title: "AGM", starts_at: "2026-07-15T18:00:00Z" }],
    groups: [{ id: "g1", name: "Njimafor Diaspora" }],
    memberships: [{ id: "m1", group_id: "g1", user_id: "u1", display_name: "Jude" }],
    profiles: [{ id: "u1", full_name: "Jude" }],
    authUsers: { u1: { phone: "+237600000001" } },
  }), {
    channel: "whatsapp",
    template: "event_reminder",
    cut2_provenance_version: 1,
    data: { domain_object_id: "e1", recipient_membership_id: "m1", locale: "en" },
  });
  assert.equal(ev.ok, true);
  assert.equal(ev.data.eventLocation, "location TBA");

  const host = await renderCut2TrustedRow(mockSupabase({
    hosting_assignments: [{ id: "a1", roster_id: "r1", assigned_date: "2030-07-15" }],
    hosting_rosters: [{ id: "r1", group_id: "g1" }],
    groups: [{ id: "g1", name: "Njimafor Diaspora" }],
    memberships: [{ id: "m1", group_id: "g1", user_id: "u1", display_name: "Jude" }],
    profiles: [{ id: "u1", full_name: "Jude" }],
    authUsers: { u1: { phone: "+237600000001" } },
  }), {
    channel: "whatsapp",
    template: "hosting_reminder",
    cut2_provenance_version: 1,
    data: { domain_object_id: "a1", recipient_membership_id: "m1", locale: "fr" },
  });
  assert.equal(host.ok, true);
  assert.equal(host.data.location, "lieu à confirmer");
});

test("proxy membership email is empty; invitation email uses invitations.email", async () => {
  const { renderCut2TrustedRow } = loadRenderer();
  const proxy = await renderCut2TrustedRow(mockSupabase({
    memberships: [{ id: "m1", group_id: "g1", user_id: null, is_proxy: true, display_name: "Mama Ngozi", privacy_settings: { proxy_phone: "+237650112233" } }],
    groups: [{ id: "g1", name: "Njimafor Diaspora" }],
    payments: [{ id: "p1", group_id: "g1", membership_id: "m1", amount: 1000, currency: "XAF", payment_date: "2026-06-15" }],
  }), {
    channel: "email",
    template: "payment_receipt",
    cut2_provenance_version: 1,
    data: { domain_object_id: "p1", recipient_membership_id: "m1", locale: "en" },
  });
  assert.equal(proxy.ok, false);
  assert.equal(proxy.error, "cut2_contact_reload_empty");
});
