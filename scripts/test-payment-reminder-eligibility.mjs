import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/lib/payment-reminder-eligibility.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
new Function("exports", "module", compiled)(loaded.exports, loaded);
const {
  evaluatePaymentReminderEligibility,
  localCalendarDate,
  paymentReminderSettingsFromGroup,
} = loaded.exports;

const base = {
  dueDate: "2026-09-30",
  contributionTypeId: "type-a",
  obligationStatus: "pending",
  membershipStatus: "active",
  userId: "user-a",
  isProxy: false,
  confirmedRemaining: 1000,
};

test("default sends only on the group-local due date", () => {
  const settings = paymentReminderSettingsFromGroup({ payment_reminders: { timezone: "Africa/Douala" } });
  assert.equal(evaluatePaymentReminderEligibility({ ...base, at: new Date("2026-09-29T12:00:00Z") }, settings).reason, "before_due_date");
  assert.equal(evaluatePaymentReminderEligibility({ ...base, at: new Date("2026-09-30T12:00:00Z") }, settings).eligible, true);
  assert.equal(evaluatePaymentReminderEligibility({ ...base, at: new Date("2026-10-01T12:00:00Z") }, settings).reason, "after_due_date_default");
});

test("group timezone controls the calendar boundary in both UTC directions", () => {
  assert.equal(localCalendarDate(new Date("2026-09-30T00:30:00Z"), "America/Los_Angeles"), "2026-09-29");
  assert.equal(localCalendarDate(new Date("2026-09-29T12:30:00Z"), "Pacific/Kiritimati"), "2026-09-30");
});

test("overdue mode, global stop, and per-contribution stop are explicit", () => {
  const overdue = paymentReminderSettingsFromGroup({ payment_reminders: { mode: "overdue_daily", timezone: "UTC" } });
  assert.equal(evaluatePaymentReminderEligibility({ ...base, at: new Date("2026-10-01T01:00:00Z") }, overdue).eligible, true);
  const stopped = paymentReminderSettingsFromGroup({ payment_reminders: { mode: "stopped", timezone: "UTC" } });
  assert.equal(evaluatePaymentReminderEligibility({ ...base, at: new Date("2026-09-30T01:00:00Z") }, stopped).reason, "reminders_stopped");
  const typeStopped = paymentReminderSettingsFromGroup({ payment_reminders: { timezone: "UTC", stopped_contribution_type_ids: ["type-a"] } });
  assert.equal(evaluatePaymentReminderEligibility({ ...base, at: new Date("2026-09-30T01:00:00Z") }, typeStopped).reason, "contribution_reminders_stopped");
});

test("paid, waived, revoked, proxy, and missing recipients never receive demands", () => {
  const settings = paymentReminderSettingsFromGroup({ payment_reminders: { timezone: "UTC" } });
  const at = new Date("2026-09-30T12:00:00Z");
  assert.equal(evaluatePaymentReminderEligibility({ ...base, confirmedRemaining: 0, at }, settings).reason, "obligation_settled_confirmed");
  assert.equal(evaluatePaymentReminderEligibility({ ...base, obligationStatus: "waived", at }, settings).reason, "obligation_waived");
  assert.equal(evaluatePaymentReminderEligibility({ ...base, membershipStatus: "suspended", at }, settings).reason, "membership_not_active");
  assert.equal(evaluatePaymentReminderEligibility({ ...base, isProxy: true, at }, settings).reason, "recipient_unavailable");
  assert.equal(evaluatePaymentReminderEligibility({ ...base, userId: null, at }, settings).reason, "recipient_unavailable");
});

test("DST transitions still produce one stable local calendar day", () => {
  assert.equal(localCalendarDate(new Date("2026-11-01T05:30:00Z"), "America/New_York"), "2026-11-01");
  assert.equal(localCalendarDate(new Date("2026-11-01T06:30:00Z"), "America/New_York"), "2026-11-01");
});
