import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_EVENT_POLICY,
  DEFAULT_HOSTING_POLICY,
  DEFAULT_PAYMENT_COMPAT_NOTE,
  FUTURE_PAYMENT_POLICY,
  LEGACY_PAYMENT_CRON_CONTRACT,
  PAYMENT_LEGACY_COMPAT,
  evaluateDisposition,
  generateScheduledOccurrences,
  isInQuietHours,
  occurrenceIdentity,
  validatePolicyConfig,
} from "../src/lib/notification-policy.ts";

const HOUR = 60 * 60 * 1000;

function basePolicy(overrides = {}) {
  return {
    enabled: true,
    timezone: "UTC",
    anchor: "event_starts_at",
    triggers: [{ offsetHours: -48 }],
    repeatIntervalHours: null,
    maxOccurrences: 1,
    stopWhenResolved: true,
    stopAfterHours: null,
    quietHours: null,
    channels: { in_app: true, email: true, sms: true, whatsapp: true, push: true },
    ...overrides,
  };
}

// ── Defaults ──────────────────────────────────────────────────────────────

test("hosting default is 7 days before, maxOccurrences 1, no repeat", () => {
  assert.equal(DEFAULT_HOSTING_POLICY.triggers[0].offsetHours, -7 * 24);
  assert.equal(DEFAULT_HOSTING_POLICY.maxOccurrences, 1);
  assert.equal(DEFAULT_HOSTING_POLICY.repeatIntervalHours, null);
  assert.equal(validatePolicyConfig(DEFAULT_HOSTING_POLICY).ok, true);
});

test("event default is 48 hours before, maxOccurrences 1", () => {
  assert.equal(DEFAULT_EVENT_POLICY.triggers[0].offsetHours, -48);
  assert.equal(DEFAULT_EVENT_POLICY.maxOccurrences, 1);
  assert.equal(validatePolicyConfig(DEFAULT_EVENT_POLICY).ok, true);
});

test("payment compat contract docs object exists and does not pretend +24h live", () => {
  assert.equal(typeof DEFAULT_PAYMENT_COMPAT_NOTE, "string");
  assert.equal(PAYMENT_LEGACY_COMPAT, DEFAULT_PAYMENT_COMPAT_NOTE);
  assert.equal(LEGACY_PAYMENT_CRON_CONTRACT.live, true);
  assert.equal(LEGACY_PAYMENT_CRON_CONTRACT.kind, "overdue_daily_selection");
  assert.equal(LEGACY_PAYMENT_CRON_CONTRACT.notARelativeTriggerOffsetHours, null);
  assert.match(LEGACY_PAYMENT_CRON_CONTRACT.cadence, /NOT a \+24h/i);
  assert.equal(FUTURE_PAYMENT_POLICY.__label, "NOT_LIVE_WIRED_EXAMPLE");
  assert.ok(!("live" in FUTURE_PAYMENT_POLICY) || FUTURE_PAYMENT_POLICY.live !== true);
  // Live contract must not claim a +24 relative trigger.
  assert.notEqual(LEGACY_PAYMENT_CRON_CONTRACT.notARelativeTriggerOffsetHours, 24);
});

// ── Identity ──────────────────────────────────────────────────────────────

test("stable identity unchanged for same inputs", () => {
  const anchor = new Date("2026-10-01T15:00:00.000Z");
  const a = occurrenceIdentity({
    domain: "event",
    objectId: "evt-1",
    anchorAt: anchor,
    triggerOffsetHours: -48,
    occurrenceIndex: 0,
  });
  const b = occurrenceIdentity({
    domain: "event",
    objectId: "evt-1",
    anchorAt: "2026-10-01T15:00:00.000Z",
    triggerOffsetHours: -48,
    occurrenceIndex: 0,
  });
  assert.equal(a, b);
  assert.equal(a, "event:evt-1:2026-10-01T15:00:00.000Z:-48:0");
});

test("identity changes after reschedule (anchor change)", () => {
  const before = occurrenceIdentity({
    domain: "event",
    objectId: "evt-1",
    anchorAt: new Date("2026-10-01T15:00:00.000Z"),
    triggerOffsetHours: -48,
    occurrenceIndex: 0,
  });
  const after = occurrenceIdentity({
    domain: "event",
    objectId: "evt-1",
    anchorAt: new Date("2026-10-02T15:00:00.000Z"),
    triggerOffsetHours: -48,
    occurrenceIndex: 0,
  });
  assert.notEqual(before, after);
  assert.match(after, /2026-10-02T15:00:00\.000Z/);
});

test("identity includes anchorIso component", () => {
  const id = occurrenceIdentity({
    domain: "hosting",
    objectId: "h1",
    anchorAt: new Date("2026-09-10T00:00:00.000Z"),
    triggerOffsetHours: -168,
    occurrenceIndex: 0,
  });
  assert.ok(id.includes("2026-09-10T00:00:00.000Z"));
  assert.ok(id.includes("hosting"));
  assert.ok(id.includes("h1"));
});

// ── generateScheduledOccurrences ──────────────────────────────────────────

test("multiple trigger offsets ordered chronologically", () => {
  const anchorAt = new Date("2026-10-10T12:00:00.000Z");
  const policy = basePolicy({
    triggers: [
      { offsetHours: -24 },
      { offsetHours: -336 },
      { offsetHours: -2 },
      { offsetHours: -48 },
      { offsetHours: -168 },
    ],
    maxOccurrences: 1,
  });
  const occ = generateScheduledOccurrences({
    policy,
    objectId: "e1",
    domain: "event",
    anchorAt,
  });
  assert.equal(occ.length, 5);
  const offsets = occ.map((o) => o.triggerOffsetHours);
  assert.deepEqual(offsets, [-336, -168, -48, -24, -2]);
  for (let i = 1; i < occ.length; i += 1) {
    assert.ok(occ[i].eligibleAt.getTime() >= occ[i - 1].eligibleAt.getTime());
  }
});

test("repeat cadence generates index 0..maxOccurrences-1", () => {
  const anchorAt = new Date("2026-09-01T00:00:00.000Z");
  const policy = basePolicy({
    triggers: [{ offsetHours: 0 }],
    repeatIntervalHours: 24,
    maxOccurrences: 3,
  });
  const occ = generateScheduledOccurrences({
    policy,
    objectId: "p1",
    domain: "payment",
    anchorAt,
  });
  assert.equal(occ.length, 3);
  assert.deepEqual(
    occ.map((o) => o.occurrenceIndex),
    [0, 1, 2],
  );
  assert.equal(occ[0].eligibleAt.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(occ[1].eligibleAt.toISOString(), "2026-09-02T00:00:00.000Z");
  assert.equal(occ[2].eligibleAt.toISOString(), "2026-09-03T00:00:00.000Z");
});

test("maxOccurrences without repeat generates only index 0 per trigger", () => {
  const anchorAt = new Date("2026-09-01T00:00:00.000Z");
  const policy = basePolicy({
    triggers: [{ offsetHours: -48 }, { offsetHours: -24 }],
    repeatIntervalHours: null,
    maxOccurrences: 5,
  });
  const occ = generateScheduledOccurrences({
    policy,
    objectId: "e1",
    domain: "event",
    anchorAt,
  });
  assert.equal(occ.length, 2);
  assert.ok(occ.every((o) => o.occurrenceIndex === 0));
});

test("stopAfterHours relative to anchor truncates occurrences", () => {
  const anchorAt = new Date("2026-09-01T00:00:00.000Z");
  const policy = basePolicy({
    triggers: [{ offsetHours: 0 }],
    repeatIntervalHours: 24,
    maxOccurrences: 10,
    stopAfterHours: 48, // eligibleAt <= anchor+48h
  });
  const occ = generateScheduledOccurrences({
    policy,
    objectId: "p1",
    domain: "payment",
    anchorAt,
  });
  // indices 0,1,2 at 0h/24h/48h — 48h is not > stop, so included; 72h dropped
  assert.equal(occ.length, 3);
  assert.ok(occ.every((o) => o.eligibleAt.getTime() <= anchorAt.getTime() + 48 * HOUR));
  assert.equal(occ[2].eligibleAt.toISOString(), "2026-09-03T00:00:00.000Z");
});

test("generated occurrences carry full identity and fields", () => {
  const anchorAt = new Date("2026-09-10T18:00:00.000Z");
  const occ = generateScheduledOccurrences({
    policy: DEFAULT_EVENT_POLICY,
    objectId: "evt-9",
    domain: "event",
    anchorAt,
  });
  assert.equal(occ.length, 1);
  assert.equal(occ[0].domain, "event");
  assert.equal(occ[0].objectId, "evt-9");
  assert.equal(occ[0].anchorAtIso, "2026-09-10T18:00:00.000Z");
  assert.equal(occ[0].triggerOffsetHours, -48);
  assert.equal(occ[0].occurrenceIndex, 0);
  assert.equal(occ[0].eligibleAt.toISOString(), "2026-09-08T18:00:00.000Z");
  assert.equal(
    occ[0].identity,
    occurrenceIdentity({
      domain: "event",
      objectId: "evt-9",
      anchorAt,
      triggerOffsetHours: -48,
      occurrenceIndex: 0,
    }),
  );
});

// ── validatePolicyConfig ──────────────────────────────────────────────────

test("valid IANA timezone accepted", () => {
  const r = validatePolicyConfig(basePolicy({ timezone: "America/New_York" }));
  assert.equal(r.ok, true);
});

test("invalid timezone rejected (never silent SEND_NOW)", () => {
  const r = validatePolicyConfig(basePolicy({ timezone: "Not/A_Real_Zone" }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /timezone/i.test(e)));
  const d = evaluateDisposition({
    policy: basePolicy({ timezone: "Not/A_Real_Zone" }),
    now: new Date("2026-09-10T12:00:00Z"),
    resolved: false,
    channel: "email",
    occurrencesSent: 0,
  });
  assert.equal(d.kind, "INVALID_POLICY");
  assert.notEqual(d.kind, "SEND_NOW");
});

test("duplicate offsets rejected", () => {
  const r = validatePolicyConfig(
    basePolicy({
      triggers: [{ offsetHours: -24 }, { offsetHours: -48 }, { offsetHours: -24 }],
    }),
  );
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /duplicate/i.test(e)));
});

test("non-finite trigger offsets rejected", () => {
  const r = validatePolicyConfig(
    basePolicy({ triggers: [{ offsetHours: Number.NaN }] }),
  );
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /finite/i.test(e)));

  const r2 = validatePolicyConfig(
    basePolicy({ triggers: [{ offsetHours: Number.POSITIVE_INFINITY }] }),
  );
  assert.equal(r2.ok, false);
});

test("negative maxOccurrences rejected", () => {
  const r = validatePolicyConfig(basePolicy({ maxOccurrences: -1 }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /maxOccurrences/i.test(e)));
});

test("zero / non-integer maxOccurrences rejected", () => {
  assert.equal(validatePolicyConfig(basePolicy({ maxOccurrences: 0 })).ok, false);
  assert.equal(validatePolicyConfig(basePolicy({ maxOccurrences: 1.5 })).ok, false);
});

test("zero / non-finite / negative repeatIntervalHours rejected", () => {
  assert.equal(validatePolicyConfig(basePolicy({ repeatIntervalHours: 0, maxOccurrences: 2 })).ok, false);
  assert.equal(
    validatePolicyConfig(basePolicy({ repeatIntervalHours: -5, maxOccurrences: 2 })).ok,
    false,
  );
  assert.equal(
    validatePolicyConfig(
      basePolicy({ repeatIntervalHours: Number.NaN, maxOccurrences: 2 }),
    ).ok,
    false,
  );
});

test("repeat without maxOccurrences fails validation (prevent infinite fan-out)", () => {
  const r = validatePolicyConfig(
    basePolicy({ repeatIntervalHours: 24, maxOccurrences: null }),
  );
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /maxOccurrences/i.test(e)));
});

test("stopAfterHours <= 0 or non-finite rejected", () => {
  assert.equal(validatePolicyConfig(basePolicy({ stopAfterHours: 0 })).ok, false);
  assert.equal(validatePolicyConfig(basePolicy({ stopAfterHours: -10 })).ok, false);
  assert.equal(validatePolicyConfig(basePolicy({ stopAfterHours: Number.NaN })).ok, false);
});

test("quiet-hour minutes outside 0..1439 or non-integers rejected", () => {
  assert.equal(
    validatePolicyConfig(basePolicy({ quietHours: { startMinute: -1, endMinute: 60 } })).ok,
    false,
  );
  assert.equal(
    validatePolicyConfig(basePolicy({ quietHours: { startMinute: 0, endMinute: 1440 } })).ok,
    false,
  );
  assert.equal(
    validatePolicyConfig(basePolicy({ quietHours: { startMinute: 1.5, endMinute: 60 } })).ok,
    false,
  );
});

test("empty / invalid channels object rejected", () => {
  assert.equal(validatePolicyConfig(basePolicy({ channels: {} })).ok, false);
  assert.equal(validatePolicyConfig(basePolicy({ channels: null })).ok, false);
  assert.equal(
    validatePolicyConfig(
      basePolicy({
        channels: { in_app: true, email: true, sms: true, whatsapp: true /* missing push */ },
      }),
    ).ok,
    false,
  );
});

// ── evaluateDisposition ───────────────────────────────────────────────────

test("resolved stops with STOP_RESOLVED", () => {
  const d = evaluateDisposition({
    policy: DEFAULT_HOSTING_POLICY,
    now: new Date("2026-09-10T12:00:00Z"),
    resolved: true,
    channel: "email",
    occurrencesSent: 0,
  });
  assert.equal(d.kind, "STOP_RESOLVED");
});

test("disabled policy stops with STOP_POLICY", () => {
  const d = evaluateDisposition({
    policy: basePolicy({ enabled: false }),
    now: new Date("2026-09-10T12:00:00Z"),
    resolved: false,
    channel: "email",
    occurrencesSent: 0,
  });
  assert.equal(d.kind, "STOP_POLICY");
});

test("disabled channel skips", () => {
  const policy = basePolicy({
    channels: { in_app: true, email: false, sms: true, whatsapp: true, push: true },
  });
  const d = evaluateDisposition({
    policy,
    now: new Date("2026-09-10T12:00:00Z"),
    resolved: false,
    channel: "email",
    occurrencesSent: 0,
  });
  assert.equal(d.kind, "SKIP_CHANNEL_DISABLED");
});

test("quiet hours defer instead of send", () => {
  const policy = basePolicy({
    timezone: "UTC",
    quietHours: { startMinute: 22 * 60, endMinute: 7 * 60 },
  });
  const now = new Date("2026-09-10T23:00:00Z");
  assert.equal(isInQuietHours(now, policy.quietHours, "UTC"), true);
  const d = evaluateDisposition({
    policy,
    now,
    resolved: false,
    channel: "whatsapp",
    occurrencesSent: 0,
  });
  assert.equal(d.kind, "DEFER_UNTIL");
  assert.ok(d.until instanceof Date);
});

test("defer keeps same identity (caller must not mint a new occurrence)", () => {
  const anchor = new Date("2026-10-01T12:00:00.000Z");
  const identity = occurrenceIdentity({
    domain: "event",
    objectId: "e1",
    anchorAt: anchor,
    triggerOffsetHours: -48,
    occurrenceIndex: 0,
  });
  const policy = basePolicy({
    quietHours: { startMinute: 22 * 60, endMinute: 7 * 60 },
  });
  const d = evaluateDisposition({
    policy,
    now: new Date("2026-09-10T23:30:00Z"),
    resolved: false,
    channel: "email",
    occurrenceIdentity: identity,
    occurrencesSentForIdentity: 0,
  });
  assert.equal(d.kind, "DEFER_UNTIL");
  // Re-evaluate later still uses the same identity string — identity is caller-owned.
  const identityAgain = occurrenceIdentity({
    domain: "event",
    objectId: "e1",
    anchorAt: anchor,
    triggerOffsetHours: -48,
    occurrenceIndex: 0,
  });
  assert.equal(identityAgain, identity);
});

test("SEND_NOW outside quiet hours", () => {
  const policy = basePolicy({
    timezone: "UTC",
    quietHours: { startMinute: 22 * 60, endMinute: 7 * 60 },
  });
  const now = new Date("2026-09-10T15:00:00Z"); // 15:00 UTC — outside overnight quiet
  assert.equal(isInQuietHours(now, policy.quietHours, "UTC"), false);
  const d = evaluateDisposition({
    policy,
    now,
    resolved: false,
    channel: "email",
    occurrencesSent: 0,
  });
  assert.equal(d.kind, "SEND_NOW");
});

test("overnight quiet window wraps midnight", () => {
  const quiet = { startMinute: 22 * 60, endMinute: 7 * 60 };
  assert.equal(isInQuietHours(new Date("2026-09-10T23:00:00Z"), quiet, "UTC"), true);
  assert.equal(isInQuietHours(new Date("2026-09-10T06:59:00Z"), quiet, "UTC"), true);
  assert.equal(isInQuietHours(new Date("2026-09-10T07:00:00Z"), quiet, "UTC"), false);
  assert.equal(isInQuietHours(new Date("2026-09-10T12:00:00Z"), quiet, "UTC"), false);
});

test("same-day quiet window", () => {
  const quiet = { startMinute: 12 * 60, endMinute: 14 * 60 }; // 12:00–14:00
  assert.equal(isInQuietHours(new Date("2026-09-10T12:00:00Z"), quiet, "UTC"), true);
  assert.equal(isInQuietHours(new Date("2026-09-10T13:59:00Z"), quiet, "UTC"), true);
  assert.equal(isInQuietHours(new Date("2026-09-10T14:00:00Z"), quiet, "UTC"), false);
  assert.equal(isInQuietHours(new Date("2026-09-10T11:59:00Z"), quiet, "UTC"), false);
});

test("exact quiet start is inclusive", () => {
  const quiet = { startMinute: 22 * 60, endMinute: 7 * 60 };
  assert.equal(isInQuietHours(new Date("2026-09-10T22:00:00Z"), quiet, "UTC"), true);
});

test("exact quiet end is exclusive", () => {
  const quiet = { startMinute: 22 * 60, endMinute: 7 * 60 };
  assert.equal(isInQuietHours(new Date("2026-09-10T07:00:00Z"), quiet, "UTC"), false);
  const sameDay = { startMinute: 9 * 60, endMinute: 17 * 60 };
  assert.equal(isInQuietHours(new Date("2026-09-10T17:00:00Z"), sameDay, "UTC"), false);
});

test("maxOccurrences reached stops policy for that identity", () => {
  const d = evaluateDisposition({
    policy: basePolicy({ maxOccurrences: 1 }),
    now: new Date("2026-09-10T12:00:00Z"),
    resolved: false,
    channel: "email",
    occurrencesSentForIdentity: 1,
  });
  assert.equal(d.kind, "STOP_POLICY");
});

test("INVALID_POLICY when config fails validation", () => {
  const d = evaluateDisposition({
    policy: basePolicy({ triggers: [{ offsetHours: Number.NaN }] }),
    now: new Date("2026-09-10T12:00:00Z"),
    resolved: false,
    channel: "email",
    occurrencesSent: 0,
  });
  assert.equal(d.kind, "INVALID_POLICY");
  assert.ok(Array.isArray(d.errors) && d.errors.length > 0);
});
