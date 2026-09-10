/**
 * Shared notification policy evaluator (Product Consistency foundation).
 * Pure functions only — no DB, no providers, no sends.
 * Quiet hours return DEFER_UNTIL; callers must not mark reminders sent when deferred.
 */

export type PolicyDisposition =
  | { kind: "SEND_NOW" }
  | { kind: "DEFER_UNTIL"; until: Date }
  | { kind: "STOP_RESOLVED" }
  | { kind: "STOP_POLICY" }
  | { kind: "SKIP_CHANNEL_DISABLED" };

export type PolicyAnchorKind = "payment_due" | "hosting_assigned" | "event_starts_at";

export interface RelativeTrigger {
  /** Negative = before anchor; positive = after. Unit: hours. */
  offsetHours: number;
}

export interface NotificationPolicyConfig {
  enabled: boolean;
  timezone: string;
  anchor: PolicyAnchorKind;
  triggers: RelativeTrigger[];
  repeatIntervalHours: number | null;
  maxOccurrences: number | null;
  stopWhenResolved: boolean;
  stopAfterHours: number | null;
  quietHours?: { startMinute: number; endMinute: number } | null;
  channels: { in_app: boolean; email: boolean; sms: boolean; whatsapp: boolean; push: boolean };
}

/** Backwards-compatible defaults matching live behavior as of main ba479fb… */
export const DEFAULT_PAYMENT_POLICY: NotificationPolicyConfig = {
  enabled: true,
  timezone: "UTC",
  anchor: "payment_due",
  triggers: [{ offsetHours: 24 }], // overdue path remains cron-owned until PC-PAYMENT migrates
  repeatIntervalHours: 24,
  maxOccurrences: null,
  stopWhenResolved: true,
  stopAfterHours: null,
  quietHours: null,
  channels: { in_app: true, email: true, sms: true, whatsapp: true, push: true },
};

export const DEFAULT_HOSTING_POLICY: NotificationPolicyConfig = {
  enabled: true,
  timezone: "UTC",
  anchor: "hosting_assigned",
  triggers: [{ offsetHours: -7 * 24 }],
  repeatIntervalHours: null,
  maxOccurrences: 1,
  stopWhenResolved: true,
  stopAfterHours: null,
  quietHours: null,
  channels: { in_app: true, email: true, sms: true, whatsapp: true, push: true },
};

export const DEFAULT_EVENT_POLICY: NotificationPolicyConfig = {
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
};

export function occurrenceIdentity(
  domain: string,
  objectId: string,
  triggerOffsetHours: number,
  occurrenceIndex: number,
): string {
  return `${domain}:${objectId}:${triggerOffsetHours}:${occurrenceIndex}`;
}

function minutesOfDay(d: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

/** Quiet-hours window may wrap midnight. Returns whether `now` is inside the window. */
export function isInQuietHours(
  now: Date,
  quiet: { startMinute: number; endMinute: number },
  timeZone: string,
): boolean {
  const m = minutesOfDay(now, timeZone);
  if (quiet.startMinute === quiet.endMinute) return false;
  if (quiet.startMinute < quiet.endMinute) return m >= quiet.startMinute && m < quiet.endMinute;
  return m >= quiet.startMinute || m < quiet.endMinute;
}

export function nextQuietHoursEnd(
  now: Date,
  quiet: { startMinute: number; endMinute: number },
  timeZone: string,
): Date {
  // Approximate: advance minute-by-minute until outside window (bounded).
  let cursor = new Date(now.getTime());
  for (let i = 0; i < 24 * 60; i += 1) {
    if (!isInQuietHours(cursor, quiet, timeZone)) return cursor;
    cursor = new Date(cursor.getTime() + 60_000);
  }
  return new Date(now.getTime() + 60 * 60_000);
}

export function evaluateDisposition(input: {
  policy: NotificationPolicyConfig;
  now: Date;
  resolved: boolean;
  channel: keyof NotificationPolicyConfig["channels"];
  occurrencesSent: number;
}): PolicyDisposition {
  const { policy, now, resolved, channel, occurrencesSent } = input;
  if (!policy.enabled) return { kind: "STOP_POLICY" };
  if (policy.stopWhenResolved && resolved) return { kind: "STOP_RESOLVED" };
  if (policy.maxOccurrences != null && occurrencesSent >= policy.maxOccurrences) {
    return { kind: "STOP_POLICY" };
  }
  if (!policy.channels[channel]) return { kind: "SKIP_CHANNEL_DISABLED" };
  if (policy.quietHours && isInQuietHours(now, policy.quietHours, policy.timezone)) {
    return { kind: "DEFER_UNTIL", until: nextQuietHoursEnd(now, policy.quietHours, policy.timezone) };
  }
  return { kind: "SEND_NOW" };
}
