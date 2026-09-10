import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_EVENT_POLICY,
  DEFAULT_HOSTING_POLICY,
  evaluateDisposition,
  isInQuietHours,
  occurrenceIdentity,
} from "../src/lib/notification-policy.ts";

test("hosting default is 7 days before", () => {
  assert.equal(DEFAULT_HOSTING_POLICY.triggers[0].offsetHours, -7 * 24);
});

test("event default is 48 hours before", () => {
  assert.equal(DEFAULT_EVENT_POLICY.triggers[0].offsetHours, -48);
});

test("occurrence identity is stable", () => {
  assert.equal(occurrenceIdentity("hosting", "a", -168, 0), "hosting:a:-168:0");
});

test("resolved stops", () => {
  const d = evaluateDisposition({
    policy: DEFAULT_HOSTING_POLICY,
    now: new Date("2026-09-10T12:00:00Z"),
    resolved: true,
    channel: "email",
    occurrencesSent: 0,
  });
  assert.equal(d.kind, "STOP_RESOLVED");
});

test("disabled channel skips", () => {
  const policy = {
    ...DEFAULT_HOSTING_POLICY,
    channels: { ...DEFAULT_HOSTING_POLICY.channels, email: false },
  };
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
  const policy = {
    ...DEFAULT_HOSTING_POLICY,
    timezone: "UTC",
    quietHours: { startMinute: 22 * 60, endMinute: 7 * 60 },
  };
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
});
