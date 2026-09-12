/**
 * M2 notification policy evaluator (post-S0 / Cut 2 adapted).
 * Pure functions only — no Supabase, no queue INSERT, no enqueue RPC,
 * no provider, no env secrets, no network I/O.
 *
 * ENQUEUE_ELIGIBLE (formerly SEND_NOW) means ONLY:
 *   "policy/schedule eligible for a trusted producer to consider
 *    enqueue_outbound_notification".
 * It NEVER means send, queue INSERT, provider call, or drain.
 *
 * Quiet hours return DEFER_UNTIL with the SAME occurrence identity; callers must not
 * mark reminders sent when deferred, and must not mint a new occurrence for the defer.
 *
 * Quiet-hour window semantics (documented contract):
 * - Exact quiet start is INCLUSIVE (minute == startMinute → inside quiet hours).
 * - Exact quiet end is EXCLUSIVE (minute == endMinute → outside quiet hours).
 * - Overnight windows (startMinute > endMinute) wrap midnight.
 * - startMinute === endMinute → empty window (never quiet).
 *
 * stopAfterHours is relative to the ANCHOR timestamp (domain-agnostic): no generated
 * occurrence may have eligibleAt > anchorAt + stopAfterHours.
 *
 * Dormant-by-default: enabled false; all channel flags false (especially push).
 * A row existing is not an enablement signal.
 *
 * Push: retained on the config shape for SQL column compat. Default false.
 * Evaluator hard-DENY. No test may show push eligibility.
 */

import {
  CUT2_CHANNEL_MATRIX,
  CUT2_NOTIFICATION_TYPES,
  type Cut2NotificationType,
  type Cut2QueueChannel,
} from "./cut2-channel-matrix.ts";

export type PolicyDisposition =
  | { kind: "ENQUEUE_ELIGIBLE" }
  | { kind: "DEFER_UNTIL"; until: Date }
  | { kind: "STOP_RESOLVED" }
  | { kind: "STOP_POLICY" }
  | { kind: "SKIP_CHANNEL_DISABLED" }
  | { kind: "INVALID_POLICY"; errors: string[] };

/**
 * Frozen boundary: ENQUEUE_ELIGIBLE is not a send API.
 * Historical name SEND_NOW is retired to prevent provider-call misread.
 */
export const POLICY_DISPOSITION_BOUNDARY = {
  enqueueEligibleKind: "ENQUEUE_ELIGIBLE",
  retiredSendNowKind: "SEND_NOW",
  meaning:
    "policy/schedule eligible for a trusted producer to consider enqueue_outbound_notification",
  never: [
    "provider send",
    "notifications_queue INSERT",
    "enqueue RPC call from this module",
    "WhatsApp / SMS / email / push dispatch",
  ],
} as const;

export type PolicyAnchorKind = "payment_due" | "hosting_assigned" | "event_starts_at";

/** Push retained for SQL column compat only — never a sendable channel. */
export type PolicyChannel = "in_app" | "email" | "sms" | "whatsapp" | "push";

export type M2PolicyDomain = "payment" | "hosting" | "event";

export const M2_POLICY_DOMAINS: readonly M2PolicyDomain[] = ["payment", "hosting", "event"];

/** Announcement is a Cut 2 type but NOT an M2 policy domain. */
export const ANNOUNCEMENT_IS_CUT2_TYPE_NOT_M2_POLICY_DOMAIN = true;

export interface RelativeTrigger {
  /** Negative = before anchor; positive = after. Unit: hours. */
  offsetHours: number;
}

export interface QuietHours {
  /** Minutes from local midnight in policy.timezone; integer in 0..1439. */
  startMinute: number;
  /** Minutes from local midnight; integer in 0..1439. End is exclusive. */
  endMinute: number;
}

export interface NotificationPolicyConfig {
  enabled: boolean;
  timezone: string;
  anchor: PolicyAnchorKind;
  triggers: RelativeTrigger[];
  /** When set, must be finite and > 0. Requires maxOccurrences (validation fails otherwise). */
  repeatIntervalHours: number | null;
  /** When set, must be a positive integer. Required when repeatIntervalHours is set. */
  maxOccurrences: number | null;
  stopWhenResolved: boolean;
  /** Relative to ANCHOR (not "now"). Finite and > 0 when set. */
  stopAfterHours: number | null;
  quietHours?: QuietHours | null;
  channels: Record<PolicyChannel, boolean>;
}

export interface ScheduledOccurrence {
  identity: string;
  domain: string;
  objectId: string;
  anchorAtIso: string;
  triggerOffsetHours: number;
  occurrenceIndex: number;
  eligibleAt: Date;
}

export type ValidatePolicyResult =
  | { ok: true; config: NotificationPolicyConfig }
  | { ok: false; errors: string[] };

const CHANNEL_KEYS: PolicyChannel[] = ["in_app", "email", "sms", "whatsapp", "push"];

const MS_PER_HOUR = 60 * 60 * 1000;

/** Dormant channel floor — no channel is on because a default object exists. */
export const DORMANT_CHANNELS: Record<PolicyChannel, boolean> = {
  in_app: false,
  email: false,
  sms: false,
  whatsapp: false,
  push: false,
};

export const ANCHOR_TO_CUT2_TYPE: Record<PolicyAnchorKind, Cut2NotificationType> = {
  payment_due: "payment_reminder",
  hosting_assigned: "hosting_assignment",
  event_starts_at: "event_reminder",
};

export const ANCHOR_TO_DOMAIN: Record<PolicyAnchorKind, M2PolicyDomain> = {
  payment_due: "payment",
  hosting_assigned: "hosting",
  event_starts_at: "event",
};

export function isCut2NotificationType(value: string): value is Cut2NotificationType {
  return (CUT2_NOTIFICATION_TYPES as readonly string[]).includes(value);
}

export function isCut2QueueChannelAllowed(
  notificationType: Cut2NotificationType,
  channel: Cut2QueueChannel | "push",
): boolean {
  if (channel === "push") return false;
  return CUT2_CHANNEL_MATRIX[notificationType][channel] === "ALLOW";
}

/** Hosting default: 7 days before assignment/hosting date, one-shot. Dormant. */
export const DEFAULT_HOSTING_POLICY: NotificationPolicyConfig = {
  enabled: false,
  timezone: "UTC",
  anchor: "hosting_assigned",
  triggers: [{ offsetHours: -7 * 24 }],
  repeatIntervalHours: null,
  maxOccurrences: 1,
  stopWhenResolved: true,
  stopAfterHours: null,
  quietHours: null,
  channels: { ...DORMANT_CHANNELS },
};

/** Event default: 48 hours before starts_at, one-shot. Dormant. */
export const DEFAULT_EVENT_POLICY: NotificationPolicyConfig = {
  enabled: false,
  timezone: "UTC",
  anchor: "event_starts_at",
  triggers: [{ offsetHours: -48 }],
  repeatIntervalHours: null,
  maxOccurrences: 1,
  stopWhenResolved: true,
  stopAfterHours: null,
  quietHours: null,
  channels: { ...DORMANT_CHANNELS },
};

/**
 * Honesty note: the live payment reminder cron is NOT a +24h relative trigger policy.
 * Do not treat any example +24h offset as the live payment contract.
 */
export const DEFAULT_PAYMENT_COMPAT_NOTE =
  "Live payment reminders are overdue-daily selection (due_date < today UTC) with " +
  "per-obligation-per-UTC-day idempotency. They are NOT a policy +24h trigger. " +
  "See LEGACY_PAYMENT_CRON_CONTRACT. FUTURE_PAYMENT_POLICY is an example only and is NOT live-wired.";

/**
 * Documented live payment cron contract (read-only description).
 * Selection: obligations with due_date before today (UTC day), remindable statuses.
 * Idempotency: one send attempt bucket per obligation per UTC day (reminderDate YYYY-MM-DD).
 * Cadence: daily cron (e.g. 08:00 UTC), not a relative +24h offset from due_date.
 */
export const LEGACY_PAYMENT_CRON_CONTRACT = {
  live: true as const,
  kind: "overdue_daily_selection" as const,
  selection: "due_date < today (UTC calendar day); remindable statuses (pending/partial/overdue)",
  idempotency: "per-obligation-per-UTC-day (reminderDate bucket)",
  cadence: "daily cron sweep — NOT a +24h relative trigger from due_date",
  notARelativeTriggerOffsetHours: null as null,
  note: DEFAULT_PAYMENT_COMPAT_NOTE,
} as const;

/**
 * Example future payment policy shape for later PC-PAYMENT migration.
 * LABEL: NOT live-wired — do not wire producers/crons to this.
 * Channels and enabled are dormant so this object cannot be misread as live.
 */
export const FUTURE_PAYMENT_POLICY: NotificationPolicyConfig & {
  __label: "NOT_LIVE_WIRED_EXAMPLE";
} = {
  __label: "NOT_LIVE_WIRED_EXAMPLE",
  enabled: false,
  timezone: "UTC",
  anchor: "payment_due",
  // Example only — NOT the live cron contract.
  triggers: [{ offsetHours: 24 }],
  repeatIntervalHours: 24,
  maxOccurrences: 14,
  stopWhenResolved: true,
  stopAfterHours: 24 * 30,
  quietHours: null,
  channels: { ...DORMANT_CHANNELS },
};

/** Alias kept for discoverability; same honesty string as DEFAULT_PAYMENT_COMPAT_NOTE. */
export const PAYMENT_LEGACY_COMPAT = DEFAULT_PAYMENT_COMPAT_NOTE;

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function isValidIanaTimeZone(tz: string): boolean {
  if (typeof tz !== "string" || tz.trim() === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return true;
  } catch (err) {
    if (err instanceof RangeError) return false;
    return false;
  }
}

function toAnchorIso(anchorAt: Date | string): string {
  if (anchorAt instanceof Date) {
    if (Number.isNaN(anchorAt.getTime())) {
      throw new RangeError("anchorAt Date is invalid");
    }
    return anchorAt.toISOString();
  }
  const d = new Date(anchorAt);
  if (Number.isNaN(d.getTime())) {
    throw new RangeError("anchorAt string is not a valid timestamp");
  }
  return d.toISOString();
}

/**
 * Occurrence identity MUST include the anchor timestamp so a reschedule
 * (anchor change) yields a new identity and does not collide with prior sends.
 * Format: domain:objectId:anchorIso:triggerOffsetHours:occurrenceIndex
 */
export function occurrenceIdentity(input: {
  domain: string;
  objectId: string;
  anchorAt: Date | string;
  triggerOffsetHours: number;
  occurrenceIndex: number;
}): string {
  const anchorIso = toAnchorIso(input.anchorAt);
  return `${input.domain}:${input.objectId}:${anchorIso}:${input.triggerOffsetHours}:${input.occurrenceIndex}`;
}

function cut2DeniedPolicyChannels(anchor: PolicyAnchorKind): PolicyChannel[] {
  const type = ANCHOR_TO_CUT2_TYPE[anchor];
  const denied: PolicyChannel[] = ["push"];
  const row = CUT2_CHANNEL_MATRIX[type];
  for (const ch of ["email", "sms", "whatsapp"] as const) {
    if (row[ch] === "DENY") denied.push(ch);
  }
  return denied;
}

/**
 * Validate policy config. Invalid timezone must NEVER silently become ENQUEUE_ELIGIBLE —
 * callers must treat { ok:false } / INVALID_POLICY as hard stop.
 * Cut 2 DENY combinations (push always; hosting email; etc.) are rejected at write/validate.
 */
export function validatePolicyConfig(config: unknown): ValidatePolicyResult {
  const errors: string[] = [];

  if (config == null || typeof config !== "object") {
    return { ok: false, errors: ["config must be a non-null object"] };
  }

  const c = config as Partial<NotificationPolicyConfig>;

  if (typeof c.enabled !== "boolean") {
    errors.push("enabled must be a boolean");
  }

  if (typeof c.timezone !== "string" || !isValidIanaTimeZone(c.timezone)) {
    errors.push("timezone must be a valid IANA time zone");
  }

  const anchors: PolicyAnchorKind[] = ["payment_due", "hosting_assigned", "event_starts_at"];
  if (!anchors.includes(c.anchor as PolicyAnchorKind)) {
    errors.push("anchor must be payment_due | hosting_assigned | event_starts_at");
  }

  if (!Array.isArray(c.triggers) || c.triggers.length === 0) {
    errors.push("triggers must be a non-empty array");
  } else {
    const seen = new Set<number>();
    for (let i = 0; i < c.triggers.length; i += 1) {
      const t = c.triggers[i];
      if (t == null || typeof t !== "object") {
        errors.push(`triggers[${i}] must be an object`);
        continue;
      }
      const offset = (t as RelativeTrigger).offsetHours;
      if (!isFiniteNumber(offset)) {
        errors.push(`triggers[${i}].offsetHours must be a finite number`);
        continue;
      }
      if (seen.has(offset)) {
        errors.push(`duplicate trigger offsetHours: ${offset}`);
      }
      seen.add(offset);
    }
  }

  if (c.repeatIntervalHours != null) {
    if (!isFiniteNumber(c.repeatIntervalHours) || c.repeatIntervalHours <= 0) {
      errors.push("repeatIntervalHours must be finite and > 0 when set");
    }
    if (c.maxOccurrences == null) {
      errors.push(
        "maxOccurrences is required when repeatIntervalHours is set (prevents infinite fan-out)",
      );
    }
  }

  if (c.maxOccurrences != null) {
    if (
      typeof c.maxOccurrences !== "number" ||
      !Number.isInteger(c.maxOccurrences) ||
      c.maxOccurrences <= 0
    ) {
      errors.push("maxOccurrences must be a positive integer when set");
    }
  }

  if (c.stopAfterHours != null) {
    if (!isFiniteNumber(c.stopAfterHours) || c.stopAfterHours <= 0) {
      errors.push("stopAfterHours must be finite and > 0 when set");
    }
  }

  if (typeof c.stopWhenResolved !== "boolean") {
    errors.push("stopWhenResolved must be a boolean");
  }

  if (c.quietHours != null) {
    if (typeof c.quietHours !== "object") {
      errors.push("quietHours must be an object or null");
    } else {
      const { startMinute, endMinute } = c.quietHours as QuietHours;
      for (const [name, value] of [
        ["startMinute", startMinute],
        ["endMinute", endMinute],
      ] as const) {
        if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 1439) {
          errors.push(`quietHours.${name} must be an integer in 0..1439`);
        }
      }
    }
  }

  if (c.channels == null || typeof c.channels !== "object" || Array.isArray(c.channels)) {
    errors.push("channels must be a non-empty object with channel booleans");
  } else {
    const keys = Object.keys(c.channels);
    if (keys.length === 0) {
      errors.push("channels must be a non-empty object");
    }
    for (const key of CHANNEL_KEYS) {
      if (typeof (c.channels as Record<string, unknown>)[key] !== "boolean") {
        errors.push(`channels.${key} must be a boolean`);
      }
    }
    if ((c.channels as Record<string, unknown>).push === true) {
      errors.push("channels.push must be false (Cut 2 DENY all 22; push is not sendable)");
    }
    if (anchors.includes(c.anchor as PolicyAnchorKind)) {
      const denied = cut2DeniedPolicyChannels(c.anchor as PolicyAnchorKind);
      for (const ch of denied) {
        if (ch === "push") continue;
        if ((c.channels as Record<string, unknown>)[ch] === true) {
          errors.push(
            `channels.${ch} denied by Cut 2 matrix for anchor ${c.anchor} (policy may only REDUCE)`,
          );
        }
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, config: config as NotificationPolicyConfig };
}

function minutesOfDay(d: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  let hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  if (hour === 24) hour = 0;
  return hour * 60 + minute;
}

/**
 * Quiet-hours window may wrap midnight.
 * Exact start inclusive; exact end exclusive.
 */
export function isInQuietHours(
  now: Date,
  quiet: QuietHours,
  timeZone: string,
): boolean {
  const m = minutesOfDay(now, timeZone);
  if (quiet.startMinute === quiet.endMinute) return false;
  if (quiet.startMinute < quiet.endMinute) {
    return m >= quiet.startMinute && m < quiet.endMinute;
  }
  return m >= quiet.startMinute || m < quiet.endMinute;
}

export function nextQuietHoursEnd(
  now: Date,
  quiet: QuietHours,
  timeZone: string,
): Date {
  let cursor = new Date(now.getTime());
  for (let i = 0; i < 24 * 60; i += 1) {
    if (!isInQuietHours(cursor, quiet, timeZone)) return cursor;
    cursor = new Date(cursor.getTime() + 60_000);
  }
  return new Date(now.getTime() + 60 * 60_000);
}

/**
 * Generate scheduled occurrences from relative triggers (+ optional repeat cadence).
 *
 * - Multiple trigger offsets supported, sorted ascending.
 * - If repeatIntervalHours set: for each trigger, occurrenceIndex 0..maxOccurrences-1
 *   (or until stop horizon) at eligibleAt = anchorAt + offset + index * repeat.
 * - If maxOccurrences set without repeat: one-shot index 0 per trigger.
 * - If neither repeat nor maxOccurrences: one-shot index 0 per trigger.
 * - stopAfterHours: relative to ANCHOR; drop any occurrence with
 *   eligibleAt > anchorAt + stopAfterHours.
 * - `now` is accepted for API completeness; this generator does not filter by now.
 * Does not enqueue, insert queue rows, or call providers.
 */
export function generateScheduledOccurrences(input: {
  policy: NotificationPolicyConfig;
  objectId: string;
  domain: string;
  anchorAt: Date;
  now?: Date;
}): ScheduledOccurrence[] {
  void input.now;
  const validated = validatePolicyConfig(input.policy);
  if (!validated.ok) return [];

  const policy = validated.config;
  if (!(input.anchorAt instanceof Date) || Number.isNaN(input.anchorAt.getTime())) {
    return [];
  }

  const anchorMs = input.anchorAt.getTime();
  const anchorAtIso = input.anchorAt.toISOString();
  const stopMs =
    policy.stopAfterHours != null ? anchorMs + policy.stopAfterHours * MS_PER_HOUR : null;

  const offsets = policy.triggers
    .map((t) => t.offsetHours)
    .slice()
    .sort((a, b) => a - b);

  const hasRepeat = policy.repeatIntervalHours != null;
  const maxIdxExclusive = hasRepeat
    ? (policy.maxOccurrences as number)
    : policy.maxOccurrences != null
      ? 1
      : 1;

  const out: ScheduledOccurrence[] = [];

  for (const offsetHours of offsets) {
    for (let occurrenceIndex = 0; occurrenceIndex < maxIdxExclusive; occurrenceIndex += 1) {
      const eligibleMs =
        anchorMs +
        offsetHours * MS_PER_HOUR +
        (hasRepeat ? occurrenceIndex * (policy.repeatIntervalHours as number) * MS_PER_HOUR : 0);

      if (stopMs != null && eligibleMs > stopMs) {
        break;
      }

      const eligibleAt = new Date(eligibleMs);
      out.push({
        identity: occurrenceIdentity({
          domain: input.domain,
          objectId: input.objectId,
          anchorAt: input.anchorAt,
          triggerOffsetHours: offsetHours,
          occurrenceIndex,
        }),
        domain: input.domain,
        objectId: input.objectId,
        anchorAtIso,
        triggerOffsetHours: offsetHours,
        occurrenceIndex,
        eligibleAt,
      });
    }
  }

  out.sort((a, b) => {
    const dt = a.eligibleAt.getTime() - b.eligibleAt.getTime();
    if (dt !== 0) return dt;
    if (a.triggerOffsetHours !== b.triggerOffsetHours) {
      return a.triggerOffsetHours - b.triggerOffsetHours;
    }
    return a.occurrenceIndex - b.occurrenceIndex;
  });

  return out;
}

function channelDeniedByCut2(
  policy: NotificationPolicyConfig,
  channel: PolicyChannel,
  notificationType?: Cut2NotificationType,
): boolean {
  if (channel === "push") return true;
  if (channel === "in_app") return false;
  const type = notificationType ?? ANCHOR_TO_CUT2_TYPE[policy.anchor];
  if (!isCut2NotificationType(type)) return true;
  return !isCut2QueueChannelAllowed(type, channel);
}

/**
 * Evaluate disposition for a single occurrence identity / channel.
 * Invalid policy → INVALID_POLICY (never ENQUEUE_ELIGIBLE).
 * Quiet defer preserves the same occurrenceIdentity (caller must not create a new one).
 * Push is hard-DENIED. Cut 2 type×channel DENY is an upper bound.
 *
 * ENQUEUE_ELIGIBLE is not a send, queue INSERT, or provider call.
 */
export function evaluateDisposition(input: {
  policy: NotificationPolicyConfig;
  now: Date;
  resolved: boolean;
  channel: PolicyChannel;
  occurrenceIdentity?: string;
  /** Count of successful sends already recorded for this occurrence identity. */
  occurrencesSent?: number;
  occurrencesSentForIdentity?: number;
  /** Cut 2 type. When omitted, inferred from policy.anchor (M2 domains only). */
  notificationType?: Cut2NotificationType;
}): PolicyDisposition {
  void input.occurrenceIdentity;

  const validated = validatePolicyConfig(input.policy);
  if (!validated.ok) {
    return { kind: "INVALID_POLICY", errors: validated.errors };
  }

  const policy = validated.config;
  const sent = input.occurrencesSentForIdentity ?? input.occurrencesSent ?? 0;

  if (!policy.enabled) return { kind: "STOP_POLICY" };
  if (policy.stopWhenResolved && input.resolved) return { kind: "STOP_RESOLVED" };

  if (policy.maxOccurrences != null && sent >= policy.maxOccurrences) {
    return { kind: "STOP_POLICY" };
  }

  if (input.channel === "push" || channelDeniedByCut2(policy, input.channel, input.notificationType)) {
    return { kind: "SKIP_CHANNEL_DISABLED" };
  }

  if (!policy.channels[input.channel]) return { kind: "SKIP_CHANNEL_DISABLED" };

  if (policy.quietHours && isInQuietHours(input.now, policy.quietHours, policy.timezone)) {
    return {
      kind: "DEFER_UNTIL",
      until: nextQuietHoursEnd(input.now, policy.quietHours, policy.timezone),
    };
  }

  return { kind: "ENQUEUE_ELIGIBLE" };
}
