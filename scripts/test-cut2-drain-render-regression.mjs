import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const renderPath = new URL("../src/lib/cut2-drain-render.ts", import.meta.url);
const datePath = new URL("../src/lib/cut2-drain-date.ts", import.meta.url);

function transpile(absPath) {
  const source = fs.readFileSync(absPath, "utf8");
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
}

function loadRenderer() {
  const compiled = transpile(renderPath);
  const cjsModule = { exports: {} };
  const localRequire = (id) => {
    if (id === "@/lib/cut2-drain-date") {
      const dateModule = { exports: {} };
      vm.runInNewContext(transpile(datePath), {
        console,
        exports: dateModule.exports,
        module: dateModule,
        require: localRequire,
        process,
      }, { filename: datePath.pathname });
      return dateModule.exports;
    }
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
          hosting_assignment: "hosting_assignment",
          hosting_reminder: "hosting_reminder",
          hosting_swap: "hosting_reminder",
          member_invitation: "member_invitation",
          loan_overdue: "loan_overdue",
          loan_approved: "loan_approved",
          subscription_expiring: "subscription_expiring",
        },
      };
    }
    if (id === "@/lib/notifications/sms-templates") {
      return {
        paymentReceiptSms: () => "sms",
        paymentReminderSms: () => "sms",
        welcomeSms: () => "sms",
        standingChangedSms: ({ newStatus }) => `standing:${newStatus}`,
        hostingAssignmentSms: ({ date }) => `assign:${date}`,
        hostingReminderSms: ({ location, date }) => `loc:${location}:date:${date}`,
        eventReminderSms: ({ location, date, eventName }) => `loc:${location}:date:${date}:name:${eventName}`,
        loanApprovedSms: () => "sms",
        reliefEnrollmentSms: () => "sms",
        reliefClaimApprovedSms: () => "sms",
        reliefClaimDeniedSms: ({ reason }) => `denied:${reason}`,
        remittanceStatusSms: () => "sms",
        fineIssuedSms: ({ reason }) => `fine:${reason}`,
        minutesPublishedSms: () => "sms",
        announcementSms: () => "sms",
        subscriptionExpiringSms: ({ planName, days }) => `sub:${planName}:${days}`,
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
      const eqFilters = [];
      const inFilters = [];
      const ltFilters = [];
      let orderCol = null;
      let orderAsc = true;
      let limitN = null;
      const apply = () => {
        let out = rows.filter((r) => eqFilters.every(([c, v]) => r[c] === v));
        for (const [c, vals] of inFilters) out = out.filter((r) => vals.includes(r[c]));
        for (const [c, v] of ltFilters) out = out.filter((r) => String(r[c]) < String(v));
        if (orderCol) {
          out = [...out].sort((a, b) => {
            const cmp = String(a[orderCol] ?? "").localeCompare(String(b[orderCol] ?? ""));
            return orderAsc ? cmp : -cmp;
          });
        }
        if (limitN != null) out = out.slice(0, limitN);
        return out;
      };
      const api = {
        select() { return api; },
        eq(col, val) { eqFilters.push([col, val]); return api; },
        in(col, vals) { inFilters.push([col, vals]); return api; },
        lt(col, val) { ltFilters.push([col, val]); return api; },
        is() { return api; },
        order(col, opts) { orderCol = col; orderAsc = !opts || opts.ascending !== false; return api; },
        limit(n) { limitN = n; return api; },
        maybeSingle: async () => {
          const matched = apply();
          return { data: matched[0] || null, error: null };
        },
        then(resolve, reject) {
          return Promise.resolve({ data: apply(), error: null }).then(resolve, reject);
        },
      };
      return api;
    },
    auth: { admin: { getUserById: async (id) => ({ data: { user: tables.authUsers?.[id] || null }, error: null }) } },
  };
}

function eventDb(overrides = {}) {
  return mockSupabase({
    events: [{
      id: "e1",
      group_id: "g1",
      title: "AGM",
      starts_at: "2026-07-15T18:00:00Z",
      location: null,
      ...overrides.event,
    }],
    groups: [{ id: "g1", name: "Njimafor Diaspora" }],
    memberships: [{ id: "m1", group_id: "g1", user_id: "u1", display_name: "Jude" }],
    profiles: [{ id: "u1", full_name: "Jude" }],
    authUsers: { u1: { phone: "+237600000001", email: "jude@example.test" } },
  });
}

function hostingDb(assignment = {}) {
  return mockSupabase({
    hosting_assignments: [{ id: "a1", roster_id: "r1", assigned_date: "2030-07-15", ...assignment }],
    hosting_rosters: [{ id: "r1", group_id: "g1" }],
    hosting_swap_requests: [{ id: "s1", from_assignment_id: "a1" }],
    groups: [{ id: "g1", name: "Njimafor Diaspora" }],
    memberships: [{ id: "m1", group_id: "g1", user_id: "u1", display_name: "Jude" }],
    profiles: [{ id: "u1", full_name: "Jude" }],
    authUsers: { u1: { phone: "+237600000001" } },
  });
}

function loanDb(installments, loanExtras = {}) {
  return mockSupabase({
    loans: [{
      id: "loan-1",
      group_id: "g1",
      membership_id: "m1",
      amount_approved: 120000,
      amount_requested: 150000,
      currency: "XAF",
      status: "repaying",
      ...loanExtras,
    }],
    loan_schedule: installments.map((row) => ({ loan_id: "loan-1", ...row })),
    groups: [{ id: "g1", name: "Njimafor Diaspora" }],
    memberships: [{ id: "m1", group_id: "g1", user_id: "u1", display_name: "Jude" }],
    profiles: [{ id: "u1", full_name: "Jude" }],
    authUsers: { u1: { phone: "+237600000001" } },
  });
}

const PRODUCER_INSTALLMENTS = [
  { id: "inst-1", due_date: "2026-05-15", amount_due: 10000, amount_paid: 2500, status: "pending" },
  { id: "inst-2", due_date: "2026-06-01", amount_due: 10000, amount_paid: 0, status: "overdue" },
];

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
  const ev = await renderCut2TrustedRow(eventDb(), {
    channel: "whatsapp",
    template: "event_reminder",
    cut2_provenance_version: 1,
    data: { domain_object_id: "e1", recipient_membership_id: "m1", locale: "en" },
  });
  assert.equal(ev.ok, true);
  assert.equal(ev.data.eventLocation, "location TBA");

  const host = await renderCut2TrustedRow(hostingDb(), {
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

test("event_reminder drain localizes EN/FR date across SMS/EMAIL/WA and keeps location fallback", async () => {
  const { renderCut2TrustedRow, formatTrustedDrainDate } = loadRenderer();
  const expectedEn = formatTrustedDrainDate("2026-07-15T18:00:00Z", "en", "weekday");
  const expectedFr = formatTrustedDrainDate("2026-07-15T18:00:00Z", "fr", "weekday");
  assert.match(expectedEn, /July 15, 2026/);
  assert.match(expectedFr, /15 juillet 2026/);
  assert.doesNotMatch(expectedEn, /2026-07-15/);
  assert.doesNotMatch(expectedFr, /2026-07-15/);

  for (const channel of ["whatsapp", "email", "sms"]) {
    const en = await renderCut2TrustedRow(eventDb(), {
      channel,
      template: "event_reminder",
      cut2_provenance_version: 1,
      data: { domain_object_id: "e1", recipient_membership_id: "m1", locale: "en" },
    });
    assert.equal(en.ok, true, channel);
    if (channel === "sms") {
      assert.match(en.message, new RegExp(expectedEn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(en.message, /location TBA/);
    } else {
      assert.equal(en.data.eventDate, expectedEn);
      assert.equal(en.data.eventLocation, "location TBA");
      assert.equal(en.data.eventTitle, "AGM");
      assert.equal(en.data.groupName, "Njimafor Diaspora");
    }

    const fr = await renderCut2TrustedRow(eventDb(), {
      channel,
      template: "event_reminder",
      cut2_provenance_version: 1,
      data: { domain_object_id: "e1", recipient_membership_id: "m1", locale: "fr" },
    });
    assert.equal(fr.ok, true, channel);
    if (channel === "sms") {
      assert.match(fr.message, new RegExp(expectedFr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(fr.message, /lieu à confirmer/);
    } else {
      assert.equal(fr.data.eventDate, expectedFr);
      assert.equal(fr.data.eventLocation, "lieu à confirmer");
    }
  }
});

test("event_reminder fail-closed when authoritative date is missing", async () => {
  const { renderCut2TrustedRow } = loadRenderer();
  const rendered = await renderCut2TrustedRow(eventDb({ event: { starts_at: null, start_at: null, event_date: null } }), {
    channel: "whatsapp",
    template: "event_reminder",
    cut2_provenance_version: 1,
    data: { domain_object_id: "e1", recipient_membership_id: "m1", locale: "en" },
  });
  assert.equal(rendered.ok, false);
  assert.equal(rendered.error, "cut2_event_date_missing");
});

test("hosting assignment/reminder/swap drain localizes EN/FR dates and location fallback", async () => {
  const { renderCut2TrustedRow, formatTrustedDrainDate } = loadRenderer();
  const expectedEn = formatTrustedDrainDate("2030-07-15", "en", "short");
  const expectedFr = formatTrustedDrainDate("2030-07-15", "fr", "short");
  const rescheduledEn = formatTrustedDrainDate("2030-08-01", "en", "short");
  assert.match(expectedEn, /Jul 15, 2030/);
  assert.match(expectedFr, /juil/i);
  assert.doesNotMatch(expectedEn, /2030-07-15/);

  const assignmentEn = await renderCut2TrustedRow(hostingDb(), {
    channel: "whatsapp",
    template: "hosting_assignment",
    cut2_provenance_version: 1,
    data: { domain_object_id: "a1", recipient_membership_id: "m1", locale: "en" },
  });
  assert.equal(assignmentEn.ok, true);
  assert.equal(assignmentEn.data.hostingDate, expectedEn);
  assert.equal(assignmentEn.data.location, "location TBA");
  assert.equal(assignmentEn.data.groupName, "Njimafor Diaspora");

  const assignmentFr = await renderCut2TrustedRow(hostingDb(), {
    channel: "sms",
    template: "hosting_assignment",
    cut2_provenance_version: 1,
    data: { domain_object_id: "a1", recipient_membership_id: "m1", locale: "fr" },
  });
  assert.equal(assignmentFr.ok, true);
  assert.equal(assignmentFr.message, `assign:${expectedFr}`);

  const reminderEn = await renderCut2TrustedRow(hostingDb(), {
    channel: "sms",
    template: "hosting_reminder",
    cut2_provenance_version: 1,
    data: { domain_object_id: "a1", recipient_membership_id: "m1", locale: "en" },
  });
  assert.equal(reminderEn.ok, true);
  assert.equal(reminderEn.message, `loc:location TBA:date:${expectedEn}`);

  const reminderFr = await renderCut2TrustedRow(hostingDb(), {
    channel: "whatsapp",
    template: "hosting_reminder",
    cut2_provenance_version: 1,
    data: { domain_object_id: "a1", recipient_membership_id: "m1", locale: "fr" },
  });
  assert.equal(reminderFr.ok, true);
  assert.equal(reminderFr.data.hostingDate, expectedFr);
  assert.equal(reminderFr.data.location, "lieu à confirmer");

  const rescheduled = await renderCut2TrustedRow(hostingDb({ assigned_date: "2030-08-01" }), {
    channel: "whatsapp",
    template: "hosting_reminder",
    cut2_provenance_version: 1,
    data: { domain_object_id: "a1", recipient_membership_id: "m1", locale: "en" },
  });
  assert.equal(rescheduled.ok, true);
  assert.equal(rescheduled.data.hostingDate, rescheduledEn);

  const swap = await renderCut2TrustedRow(hostingDb(), {
    channel: "whatsapp",
    template: "hosting_swap",
    cut2_provenance_version: 1,
    data: { domain_object_id: "s1", recipient_membership_id: "m1", locale: "en" },
  });
  assert.equal(swap.ok, true);
  assert.equal(swap.data.hostingDate, expectedEn);
  assert.equal(swap.data.location, "location TBA");
});

test("hosting fail-closed when assigned_date is missing", async () => {
  const { renderCut2TrustedRow } = loadRenderer();
  const rendered = await renderCut2TrustedRow(hostingDb({ assigned_date: null }), {
    channel: "whatsapp",
    template: "hosting_assignment",
    cut2_provenance_version: 1,
    data: { domain_object_id: "a1", recipient_membership_id: "m1", locale: "en" },
  });
  assert.equal(rendered.ok, false);
  assert.equal(rendered.error, "cut2_hosting_date_missing");
});

test("loan_overdue drain quotes earliest outstanding installment amount and localized due date", async () => {
  const { renderCut2TrustedRow, formatTrustedDrainDate } = loadRenderer();
  const expectedEn = formatTrustedDrainDate("2026-05-15", "en", "long");
  const expectedFr = formatTrustedDrainDate("2026-05-15", "fr", "long");
  assert.match(expectedEn, /May 15, 2026/);
  assert.match(expectedFr, /15 mai 2026/);

  const en = await renderCut2TrustedRow(loanDb(PRODUCER_INSTALLMENTS), {
    channel: "whatsapp",
    template: "loan_overdue",
    cut2_provenance_version: 1,
    data: { domain_object_id: "loan-1", recipient_membership_id: "m1", locale: "en", reminderDate: "2026-06-15" },
  });
  assert.equal(en.ok, true);
  assert.equal(en.data.amount, "7,500 XAF");
  assert.equal(en.data.dueDate, expectedEn);
  assert.equal(en.data.groupName, "Njimafor Diaspora");
  assert.notEqual(en.data.amount, "120,000 XAF");
  assert.notEqual(en.data.dueDate, "2026-06-01");

  const fr = await renderCut2TrustedRow(loanDb(PRODUCER_INSTALLMENTS), {
    channel: "whatsapp",
    template: "loan_overdue",
    cut2_provenance_version: 1,
    data: { domain_object_id: "loan-1", recipient_membership_id: "m1", locale: "fr", reminderDate: "2026-06-15" },
  });
  assert.equal(fr.ok, true);
  assert.equal(fr.data.amount, "7,500 XAF");
  assert.equal(fr.data.dueDate, expectedFr);
});

test("loan_overdue excludes paid/settled rows and fail-closes when none outstanding", async () => {
  const { renderCut2TrustedRow } = loadRenderer();
  const settled = await renderCut2TrustedRow(loanDb([
    { id: "inst-3", due_date: "2026-05-15", amount_due: 10000, amount_paid: 10000, status: "partial" },
    { id: "inst-4", due_date: "2026-06-01", amount_due: 5000, amount_paid: 0, status: "paid" },
    { id: "inst-5", due_date: "2026-07-01", amount_due: 5000, amount_paid: 0, status: "pending" },
  ]), {
    channel: "whatsapp",
    template: "loan_overdue",
    cut2_provenance_version: 1,
    data: { domain_object_id: "loan-1", recipient_membership_id: "m1", locale: "en", reminderDate: "2026-06-15" },
  });
  assert.equal(settled.ok, false);
  assert.equal(settled.error, "cut2_loan_overdue_no_outstanding_installment");

  const missingDate = await renderCut2TrustedRow(loanDb(PRODUCER_INSTALLMENTS), {
    channel: "whatsapp",
    template: "loan_overdue",
    cut2_provenance_version: 1,
    data: { domain_object_id: "loan-1", recipient_membership_id: "m1", locale: "en" },
  });
  assert.equal(missingDate.ok, false);
  assert.equal(missingDate.error, "cut2_loan_overdue_reminder_date_missing");
});

test("subscription_expiring countdown uses trusted reminderDate, not drain wall-clock", async () => {
  const { renderCut2TrustedRow, trustedCalendarDaysBetween } = loadRenderer();
  const periodEnd = "2026-06-22T15:47:11.123Z";
  const reminderDate = "2026-06-15";
  const expectedDays = String(trustedCalendarDaysBetween(periodEnd, reminderDate));
  assert.equal(expectedDays, "7");

  const db = mockSupabase({
    group_subscriptions: [{
      id: "sub-1",
      group_id: "g1",
      tier: "pro",
      status: "active",
      current_period_end: periodEnd,
    }],
    groups: [{ id: "g1", name: "Njimafor Diaspora" }],
    memberships: [{ id: "m1", group_id: "g1", user_id: "u1", display_name: "Jude", role: "owner" }],
    profiles: [{ id: "u1", full_name: "Jude" }],
    authUsers: { u1: { phone: "+237600000001" } },
  });

  const first = await renderCut2TrustedRow(db, {
    channel: "whatsapp",
    template: "subscription_expiring",
    cut2_provenance_version: 1,
    data: { domain_object_id: "sub-1", recipient_membership_id: "m1", locale: "en", reminderDate },
  });
  assert.equal(first.ok, true);
  assert.equal(first.data.days, "7");
  assert.equal(first.data.groupName, "Njimafor Diaspora");
  assert.equal(first.data.planName, "pro");

  const laterSameDay = await renderCut2TrustedRow(db, {
    channel: "sms",
    template: "subscription_expiring",
    cut2_provenance_version: 1,
    data: { domain_object_id: "sub-1", recipient_membership_id: "m1", locale: "en", reminderDate },
  });
  assert.equal(laterSameDay.ok, true);
  assert.equal(laterSameDay.message, "sub:pro:7");

  const delayedHour = await renderCut2TrustedRow(db, {
    channel: "whatsapp",
    template: "subscription_expiring",
    cut2_provenance_version: 1,
    data: { domain_object_id: "sub-1", recipient_membership_id: "m1", locale: "fr", reminderDate },
  });
  assert.equal(delayedHour.ok, true);
  assert.equal(delayedHour.data.days, first.data.days);

  const nonMidnight = await renderCut2TrustedRow(mockSupabase({
    group_subscriptions: [{
      id: "sub-1",
      group_id: "g1",
      tier: "starter",
      current_period_end: "2026-06-20T23:15:00.000Z",
    }],
    groups: [{ id: "g1", name: "Njimafor Diaspora" }],
    memberships: [{ id: "m1", group_id: "g1", user_id: "u1", display_name: "Jude" }],
    profiles: [{ id: "u1", full_name: "Jude" }],
    authUsers: { u1: { phone: "+237600000001" } },
  }), {
    channel: "whatsapp",
    template: "subscription_expiring",
    cut2_provenance_version: 1,
    data: { domain_object_id: "sub-1", recipient_membership_id: "m1", locale: "en", reminderDate: "2026-06-15" },
  });
  assert.equal(nonMidnight.ok, true);
  assert.equal(nonMidnight.data.days, "5");
});

test("subscription_expiring fail-closed without trusted reminderDate", async () => {
  const { renderCut2TrustedRow } = loadRenderer();
  const rendered = await renderCut2TrustedRow(mockSupabase({
    group_subscriptions: [{
      id: "sub-1",
      group_id: "g1",
      tier: "pro",
      current_period_end: "2026-06-22T15:47:11.123Z",
    }],
    groups: [{ id: "g1", name: "Njimafor Diaspora" }],
    memberships: [{ id: "m1", group_id: "g1", user_id: "u1", display_name: "Jude" }],
    profiles: [{ id: "u1", full_name: "Jude" }],
    authUsers: { u1: { phone: "+237600000001" } },
  }), {
    channel: "whatsapp",
    template: "subscription_expiring",
    cut2_provenance_version: 1,
    data: { domain_object_id: "sub-1", recipient_membership_id: "m1", locale: "en" },
  });
  assert.equal(rendered.ok, false);
  assert.equal(rendered.error, "cut2_subscription_reminder_date_missing");
});
