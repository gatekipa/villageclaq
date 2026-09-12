/**
 * Pure contract tests for notification-policy-contracts (no DB).
 * Run with:
 *   node --experimental-strip-types --test scripts/test-notification-policy.mjs scripts/test-notification-policy-contracts.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_EVENT_POLICY,
  DEFAULT_HOSTING_POLICY,
  FUTURE_PAYMENT_POLICY,
  LEGACY_PAYMENT_CRON_CONTRACT,
  validatePolicyConfig,
} from "../src/lib/notification-policy.ts";
import {
  ChannelIntersection,
  EventAdapter,
  FAIL_CLOSED_PREFS_ON_ERROR,
  HostingAdapter,
  LEGACY_DEFAULTS,
  OccurrenceSupersession,
  PaymentAdapter,
  PolicyPrecedence,
  UI_POLICY_LABELS,
  assertLegacyEventParity,
  assertLegacyHostingParity,
  assertLegacyPaymentCronParity,
  channelsFromSqlBooleans,
  legacyParityPaymentCron,
  legacyParityPolicyForDomain,
  resolveEffectivePolicy,
} from "../src/lib/notification-policy-contracts.ts";

const ALL_ON = {
  in_app: true,
  email: true,
  sms: true,
  whatsapp: true,
  push: true,
};

function cloneHosting(overrides = {}) {
  return {
    ...DEFAULT_HOSTING_POLICY,
    channels: { ...DEFAULT_HOSTING_POLICY.channels },
    triggers: DEFAULT_HOSTING_POLICY.triggers.map((t) => ({ ...t })),
    ...overrides,
  };
}

// ── Precedence ──────────────────────────────────────────────────────────────

test("PolicyPrecedence order: system_legacy < group_domain < object_override", () => {
  assert.ok(PolicyPrecedence.system_legacy < PolicyPrecedence.group_domain);
  assert.ok(PolicyPrecedence.group_domain < PolicyPrecedence.object_override);
});

test("resolveEffectivePolicy uses system_legacy when no group/object", () => {
  const r = resolveEffectivePolicy({ systemDefault: DEFAULT_HOSTING_POLICY });
  assert.equal(r.ok, true);
  assert.equal(r.layer, "system_legacy");
  assert.equal(r.policy.triggers[0].offsetHours, -7 * 24);
});

test("resolveEffectivePolicy prefers group_domain over system", () => {
  const group = cloneHosting({
    triggers: [{ offsetHours: -72 }],
    maxOccurrences: 1,
  });
  const r = resolveEffectivePolicy({
    systemDefault: DEFAULT_HOSTING_POLICY,
    groupPolicy: group,
  });
  assert.equal(r.ok, true);
  assert.equal(r.layer, "group_domain");
  assert.equal(r.policy.triggers[0].offsetHours, -72);
});

test("resolveEffectivePolicy prefers object_override over group", () => {
  const group = cloneHosting({ triggers: [{ offsetHours: -72 }] });
  const object = cloneHosting({
    anchor: "event_starts_at",
    triggers: [{ offsetHours: -24 }],
  });
  const r = resolveEffectivePolicy({
    systemDefault: DEFAULT_EVENT_POLICY,
    groupPolicy: group,
    objectPolicy: object,
  });
  assert.equal(r.ok, true);
  assert.equal(r.layer, "object_override");
  assert.equal(r.policy.triggers[0].offsetHours, -24);
});

test("resolveEffectivePolicy rejects malformed object_override (fail closed)", () => {
  const r = resolveEffectivePolicy({
    systemDefault: DEFAULT_EVENT_POLICY,
    groupPolicy: DEFAULT_EVENT_POLICY,
    objectPolicy: { enabled: true, timezone: "Not/AZone" },
  });
  assert.equal(r.ok, false);
  assert.equal(r.rejectedLayer, "object_override");
  assert.ok(r.errors.some((e) => /object_override|timezone/i.test(e)));
});

test("resolveEffectivePolicy rejects malformed group_domain (fail closed)", () => {
  const r = resolveEffectivePolicy({
    systemDefault: DEFAULT_HOSTING_POLICY,
    groupPolicy: {
      enabled: true,
      timezone: "UTC",
      anchor: "hosting_assigned",
      triggers: [{ offsetHours: -24 }],
      repeatIntervalHours: 24,
      maxOccurrences: null, // invalid: repeat without max
      stopWhenResolved: true,
      stopAfterHours: null,
      channels: ALL_ON,
    },
  });
  assert.equal(r.ok, false);
  assert.equal(r.rejectedLayer, "group_domain");
});

test("resolveEffectivePolicy rejects malformed systemDefault", () => {
  const r = resolveEffectivePolicy({
    systemDefault: { enabled: "yes" },
  });
  assert.equal(r.ok, false);
  assert.equal(r.rejectedLayer, "system_legacy");
});

// ── Channel intersection ────────────────────────────────────────────────────

test("ChannelIntersection is AND of group, member, failClosed", () => {
  const result = ChannelIntersection({
    groupAllowed: { ...ALL_ON, sms: false },
    memberPref: { ...ALL_ON, email: false },
    failClosedPrefs: { ...ALL_ON },
  });
  assert.equal(result.in_app, true);
  assert.equal(result.email, false);
  assert.equal(result.sms, false);
  assert.equal(result.whatsapp, true);
  assert.equal(result.push, true);
});

test("ChannelIntersection fail-closed prefs kill external channels", () => {
  const result = ChannelIntersection({
    groupAllowed: ALL_ON,
    memberPref: ALL_ON,
    failClosedPrefs: FAIL_CLOSED_PREFS_ON_ERROR,
  });
  assert.equal(result.in_app, true);
  assert.equal(result.email, false);
  assert.equal(result.sms, false);
  assert.equal(result.whatsapp, false);
  assert.equal(result.push, false);
});

test("ChannelIntersection all false when group disables all external", () => {
  const group = {
    in_app: true,
    email: false,
    sms: false,
    whatsapp: false,
    push: false,
  };
  const result = ChannelIntersection({
    groupAllowed: group,
    memberPref: ALL_ON,
    failClosedPrefs: ALL_ON,
  });
  assert.deepEqual(result, group);
});

test("FAIL_CLOSED_PREFS_ON_ERROR keeps only in_app", () => {
  assert.equal(FAIL_CLOSED_PREFS_ON_ERROR.in_app, true);
  assert.equal(FAIL_CLOSED_PREFS_ON_ERROR.email, false);
  assert.equal(FAIL_CLOSED_PREFS_ON_ERROR.whatsapp, false);
});

// ── Occurrence supersession ─────────────────────────────────────────────────

test("OccurrenceSupersession marks future unsent as superseded on anchor change", () => {
  const plan = OccurrenceSupersession({
    newAnchorAt: "2026-11-01T18:00:00.000Z",
    previousOccurrences: [
      {
        id: "a",
        identityKey: "event:1:2026-10-01T18:00:00.000Z:-48:0",
        anchorAtIso: "2026-10-01T18:00:00.000Z",
        status: "scheduled",
        eligibleAt: "2026-09-29T18:00:00.000Z",
      },
      {
        id: "b",
        identityKey: "event:1:2026-10-01T18:00:00.000Z:-24:0",
        anchorAtIso: "2026-10-01T18:00:00.000Z",
        status: "deferred",
        eligibleAt: "2026-09-30T18:00:00.000Z",
      },
    ],
  });
  assert.equal(plan.toSupersede.length, 2);
  assert.equal(plan.immutableKept.length, 0);
});

test("OccurrenceSupersession keeps sent immutable", () => {
  const plan = OccurrenceSupersession({
    newAnchorAt: "2026-11-01T18:00:00.000Z",
    previousOccurrences: [
      {
        id: "sent-1",
        identityKey: "event:1:2026-10-01T18:00:00.000Z:-48:0",
        anchorAtIso: "2026-10-01T18:00:00.000Z",
        status: "sent",
        eligibleAt: "2026-09-29T18:00:00.000Z",
      },
      {
        id: "fut",
        identityKey: "event:1:2026-10-01T18:00:00.000Z:-2:0",
        anchorAtIso: "2026-10-01T18:00:00.000Z",
        status: "scheduled",
        eligibleAt: "2026-10-01T16:00:00.000Z",
      },
    ],
  });
  assert.equal(plan.immutableKept.length, 1);
  assert.equal(plan.immutableKept[0].id, "sent-1");
  assert.equal(plan.toSupersede.length, 1);
  assert.equal(plan.toSupersede[0].id, "fut");
});

test("OccurrenceSupersession leaves rows alone when anchor unchanged", () => {
  const iso = "2026-10-01T18:00:00.000Z";
  const plan = OccurrenceSupersession({
    newAnchorAt: iso,
    previousOccurrences: [
      {
        id: "same",
        identityKey: `event:1:${iso}:-48:0`,
        anchorAtIso: iso,
        status: "scheduled",
        eligibleAt: "2026-09-29T18:00:00.000Z",
      },
    ],
  });
  assert.equal(plan.toSupersede.length, 0);
  assert.equal(plan.leftAsIs.length, 1);
});

test("OccurrenceSupersession leaves cancelled/stop_resolved as-is", () => {
  const plan = OccurrenceSupersession({
    newAnchorAt: "2026-12-01T00:00:00.000Z",
    previousOccurrences: [
      {
        id: "c",
        identityKey: "event:1:old:-48:0",
        anchorAtIso: "2026-10-01T00:00:00.000Z",
        status: "cancelled",
        eligibleAt: "2026-09-29T00:00:00.000Z",
      },
      {
        id: "s",
        identityKey: "event:1:old:-24:0",
        anchorAtIso: "2026-10-01T00:00:00.000Z",
        status: "stop_resolved",
        eligibleAt: "2026-09-30T00:00:00.000Z",
      },
    ],
  });
  assert.equal(plan.toSupersede.length, 0);
  assert.equal(plan.leftAsIs.length, 2);
});

// ── Payment adapter ─────────────────────────────────────────────────────────

test("PaymentAdapter confirmed_full → resolved", () => {
  const o = PaymentAdapter({ economicStatus: "confirmed_full" });
  assert.equal(o.resolved, true);
  assert.equal(o.reason, "confirmed_full");
});

test("PaymentAdapter waived → resolved", () => {
  const o = PaymentAdapter({ economicStatus: "waived" });
  assert.equal(o.resolved, true);
  assert.equal(o.reason, "waived");
});

test("PaymentAdapter partial → unresolved", () => {
  const o = PaymentAdapter({ economicStatus: "partial" });
  assert.equal(o.resolved, false);
  assert.equal(o.reason, "partial_unresolved");
});

test("PaymentAdapter unpaid → unresolved", () => {
  const o = PaymentAdapter({ economicStatus: "unpaid" });
  assert.equal(o.resolved, false);
});

test("PaymentAdapter pending_confirmation → unresolved economically", () => {
  const o = PaymentAdapter({ economicStatus: "pending_confirmation" });
  assert.equal(o.resolved, false);
  assert.equal(o.reason, "pending_confirmation_unresolved");
  assert.equal(o.snoozeHint, undefined);
});

test("PaymentAdapter pending + snoozeWhilePaymentPending sets snoozeHint only", () => {
  const o = PaymentAdapter({
    economicStatus: "pending_confirmation",
    snoozeWhilePaymentPending: true,
  });
  assert.equal(o.resolved, false);
  assert.equal(o.snoozeHint, true);
});

// ── Hosting adapter ─────────────────────────────────────────────────────────

test("HostingAdapter assigned stays unresolved", () => {
  const o = HostingAdapter({ state: "assigned" });
  assert.equal(o.resolvedForOldHost, false);
});

test("HostingAdapter completed/exempt/cancelled resolve old host", () => {
  assert.equal(HostingAdapter({ state: "completed" }).resolvedForOldHost, true);
  assert.equal(HostingAdapter({ state: "exempt" }).resolvedForOldHost, true);
  assert.equal(HostingAdapter({ state: "cancelled" }).resolvedForOldHost, true);
});

test("HostingAdapter swapped_away resolves old host and returns new object", () => {
  const o = HostingAdapter({
    state: "swapped_away",
    newHostObjectId: "host-assignment-new",
  });
  assert.equal(o.resolvedForOldHost, true);
  assert.equal(o.reason, "swapped_away");
  assert.equal(o.newObjectId, "host-assignment-new");
});

// ── Event adapter ───────────────────────────────────────────────────────────

test("EventAdapter cancelled → resolved", () => {
  const o = EventAdapter({
    state: "cancelled",
    startsAt: "2026-10-01T15:00:00.000Z",
  });
  assert.equal(o.resolved, true);
  assert.equal(o.reason, "cancelled");
});

test("EventAdapter completed → resolved", () => {
  const o = EventAdapter({
    state: "completed",
    startsAt: "2026-10-01T15:00:00.000Z",
  });
  assert.equal(o.resolved, true);
  assert.equal(o.reason, "completed");
});

test("EventAdapter reschedule yields new anchor (not resolved)", () => {
  const o = EventAdapter({
    state: "rescheduled",
    previousStartsAt: "2026-10-01T15:00:00.000Z",
    startsAt: "2026-10-08T15:00:00.000Z",
  });
  assert.equal(o.resolved, false);
  assert.equal(o.reason, "rescheduled_new_anchor");
  assert.equal(o.anchorChanged, true);
  assert.equal(o.newAnchorAt.toISOString(), "2026-10-08T15:00:00.000Z");
});

test("EventAdapter scheduled with changed previousStartsAt is reschedule", () => {
  const o = EventAdapter({
    state: "scheduled",
    previousStartsAt: "2026-10-01T15:00:00.000Z",
    startsAt: "2026-10-02T15:00:00.000Z",
  });
  assert.equal(o.anchorChanged, true);
  assert.equal(o.resolved, false);
});

test("EventAdapter active scheduled without previous is active", () => {
  const o = EventAdapter({
    state: "scheduled",
    startsAt: "2026-10-01T15:00:00.000Z",
  });
  assert.equal(o.resolved, false);
  assert.equal(o.reason, "active");
});

// ── Legacy parity ───────────────────────────────────────────────────────────

test("LEGACY_DEFAULTS hosting/event match foundation defaults", () => {
  assert.equal(LEGACY_DEFAULTS.hosting, DEFAULT_HOSTING_POLICY);
  assert.equal(LEGACY_DEFAULTS.event, DEFAULT_EVENT_POLICY);
  assert.equal(LEGACY_DEFAULTS.paymentCron, LEGACY_PAYMENT_CRON_CONTRACT);
  assert.equal(LEGACY_DEFAULTS.futurePaymentExample, FUTURE_PAYMENT_POLICY);
});

test("legacyParityPolicyForDomain hosting/event/payment", () => {
  assert.equal(legacyParityPolicyForDomain("hosting"), DEFAULT_HOSTING_POLICY);
  assert.equal(legacyParityPolicyForDomain("event"), DEFAULT_EVENT_POLICY);
  assert.equal(legacyParityPolicyForDomain("payment"), null);
});

test("assertLegacyHostingParity / EventParity / PaymentCronParity", () => {
  assert.equal(assertLegacyHostingParity(DEFAULT_HOSTING_POLICY), true);
  assert.equal(assertLegacyEventParity(DEFAULT_EVENT_POLICY), true);
  assert.equal(assertLegacyPaymentCronParity(), true);
  assert.equal(legacyParityPaymentCron().kind, "overdue_daily_selection");
});

test("legacy payment cron is NOT a +24h relative trigger", () => {
  assert.equal(LEGACY_PAYMENT_CRON_CONTRACT.notARelativeTriggerOffsetHours, null);
  assert.notEqual(FUTURE_PAYMENT_POLICY.__label, undefined);
  assert.equal(FUTURE_PAYMENT_POLICY.__label, "NOT_LIVE_WIRED_EXAMPLE");
});

// ── UI + helpers ────────────────────────────────────────────────────────────

test("UI_POLICY_LABELS has no RRULE jargon and documents settings.manage", () => {
  const blob = JSON.stringify(UI_POLICY_LABELS);
  assert.equal(/rrule/i.test(blob), false);
  assert.equal(UI_POLICY_LABELS.permission.key, "settings.manage");
  assert.equal(UI_POLICY_LABELS.permission.notInvented, "notifications.manage");
  assert.ok(UI_POLICY_LABELS.honesty.noRecurrenceJargon.length > 10);
});

test("channelsFromSqlBooleans maps SQL columns to PolicyChannel flags", () => {
  const flags = channelsFromSqlBooleans({
    channel_in_app: true,
    channel_email: false,
    channel_sms: true,
    channel_whatsapp: false,
    channel_push: true,
  });
  assert.deepEqual(flags, {
    in_app: true,
    email: false,
    sms: true,
    whatsapp: false,
    push: true,
  });
});

test("malformed partial with empty triggers fail closed via resolveEffectivePolicy", () => {
  const bad = {
    ...DEFAULT_EVENT_POLICY,
    triggers: [],
  };
  const r = resolveEffectivePolicy({
    systemDefault: DEFAULT_EVENT_POLICY,
    groupPolicy: bad,
  });
  assert.equal(r.ok, false);
  assert.equal(r.rejectedLayer, "group_domain");
});

test("validatePolicyConfig still required for object layer success path", () => {
  const object = cloneHosting({
    anchor: "event_starts_at",
    triggers: [{ offsetHours: -12 }],
  });
  assert.equal(validatePolicyConfig(object).ok, true);
  const r = resolveEffectivePolicy({
    systemDefault: DEFAULT_EVENT_POLICY,
    objectPolicy: object,
  });
  assert.equal(r.ok, true);
  assert.equal(r.layer, "object_override");
});

test("reschedule + supersession integration: sent kept, future superseded", () => {
  const prev = "2026-10-01T12:00:00.000Z";
  const next = "2026-10-15T12:00:00.000Z";
  const adapter = EventAdapter({
    state: "rescheduled",
    previousStartsAt: prev,
    startsAt: next,
  });
  assert.equal(adapter.anchorChanged, true);
  const plan = OccurrenceSupersession({
    newAnchorAt: adapter.newAnchorAt,
    previousOccurrences: [
      {
        id: "1",
        identityKey: `event:e1:${prev}:-48:0`,
        anchorAtIso: prev,
        status: "sent",
        eligibleAt: "2026-09-29T12:00:00.000Z",
      },
      {
        id: "2",
        identityKey: `event:e1:${prev}:-2:0`,
        anchorAtIso: prev,
        status: "scheduled",
        eligibleAt: "2026-10-01T10:00:00.000Z",
      },
    ],
  });
  assert.equal(plan.immutableKept.map((x) => x.id).join(","), "1");
  assert.equal(plan.toSupersede.map((x) => x.id).join(","), "2");
});
