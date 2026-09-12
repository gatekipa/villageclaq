/**
 * M2 notification policy adapter / precedence / channel contracts (Cut 2 adapted).
 * Pure TypeScript only — no DB, no providers, no cron wiring, no sends,
 * no queue INSERT, no enqueue RPC, no network I/O.
 *
 * Effective channel = Cut2Allow AND PolicyAllow AND preference authority.
 * Push is forced DENY. Policy can only REDUCE the Cut 2 floor.
 *
 * Adapters output resolved/unresolved and optional semantic enqueue intent.
 * They never emit raw contact, message body, provider request, or queue rows.
 */

import {
  CUT2_CHANNEL_MATRIX,
  CUT2_NOTIFICATION_TYPES,
  type Cut2NotificationType,
  type Cut2QueueChannel,
} from "./cut2-channel-matrix.ts";
import {
  ANNOUNCEMENT_IS_CUT2_TYPE_NOT_M2_POLICY_DOMAIN,
  DEFAULT_EVENT_POLICY,
  DEFAULT_HOSTING_POLICY,
  FUTURE_PAYMENT_POLICY,
  LEGACY_PAYMENT_CRON_CONTRACT,
  M2_POLICY_DOMAINS,
  isCut2NotificationType,
  type NotificationPolicyConfig,
  type PolicyChannel,
  type PolicyDisposition,
  validatePolicyConfig,
} from "./notification-policy.ts";

void ANNOUNCEMENT_IS_CUT2_TYPE_NOT_M2_POLICY_DOMAIN;
void M2_POLICY_DOMAINS;

// ── Precedence ──────────────────────────────────────────────────────────────

/**
 * Lower rank = weaker. Resolution picks the strongest present valid layer:
 * system_legacy < group_domain < object_override
 */
export const PolicyPrecedence = {
  system_legacy: 0,
  group_domain: 1,
  object_override: 2,
} as const;

export type PolicyPrecedenceLayer = keyof typeof PolicyPrecedence;

export type ResolveEffectivePolicyInput = {
  systemDefault: NotificationPolicyConfig;
  groupPolicy?: unknown | null;
  objectPolicy?: unknown | null;
};

export type ResolveEffectivePolicyResult =
  | {
      ok: true;
      layer: PolicyPrecedenceLayer;
      policy: NotificationPolicyConfig;
    }
  | {
      ok: false;
      errors: string[];
      /** Layer that failed validation when a malformed partial was supplied. */
      rejectedLayer?: PolicyPrecedenceLayer;
    };

/**
 * Resolve effective policy by precedence.
 * Malformed group/object partials are REJECTED (fail closed) — never silently
 * downgraded to a weaker layer. Callers must fix or omit the bad row.
 */
export function resolveEffectivePolicy(
  input: ResolveEffectivePolicyInput,
): ResolveEffectivePolicyResult {
  const systemCheck = validatePolicyConfig(input.systemDefault);
  if (!systemCheck.ok) {
    return {
      ok: false,
      errors: [
        "systemDefault failed validatePolicyConfig",
        ...systemCheck.errors,
      ],
      rejectedLayer: "system_legacy",
    };
  }

  if (input.objectPolicy != null) {
    const objectCheck = validatePolicyConfig(input.objectPolicy);
    if (!objectCheck.ok) {
      return {
        ok: false,
        errors: [
          "object_override failed validatePolicyConfig (fail closed; not falling back)",
          ...objectCheck.errors,
        ],
        rejectedLayer: "object_override",
      };
    }
    return { ok: true, layer: "object_override", policy: objectCheck.config };
  }

  if (input.groupPolicy != null) {
    const groupCheck = validatePolicyConfig(input.groupPolicy);
    if (!groupCheck.ok) {
      return {
        ok: false,
        errors: [
          "group_domain failed validatePolicyConfig (fail closed; not falling back)",
          ...groupCheck.errors,
        ],
        rejectedLayer: "group_domain",
      };
    }
    return { ok: true, layer: "group_domain", policy: groupCheck.config };
  }

  return { ok: true, layer: "system_legacy", policy: systemCheck.config };
}

// ── Channel intersection ────────────────────────────────────────────────────

export type ChannelFlags = Record<PolicyChannel, boolean>;

const POLICY_CHANNEL_KEYS: PolicyChannel[] = [
  "in_app",
  "email",
  "sms",
  "whatsapp",
  "push",
];

export function cut2MatrixAllows(
  notificationType: Cut2NotificationType,
  channel: Cut2QueueChannel | "push",
): boolean {
  if (channel === "push") return false;
  return CUT2_CHANNEL_MATRIX[notificationType][channel] === "ALLOW";
}

/**
 * Effective = Cut2Allow AND PolicyAllow AND preference authority.
 * Push is forced DENY regardless of inputs. Unknown type → fail closed (all false).
 * Never a send path.
 */
export function ChannelIntersection(input: {
  notificationType: Cut2NotificationType | string;
  groupAllowed: ChannelFlags;
  memberPref: ChannelFlags;
  failClosedPrefs: ChannelFlags;
}): ChannelFlags {
  const out: ChannelFlags = {
    in_app: false,
    email: false,
    sms: false,
    whatsapp: false,
    push: false,
  };

  if (!isCut2NotificationType(input.notificationType)) {
    return out;
  }

  const type = input.notificationType;
  out.in_app = Boolean(
    input.groupAllowed.in_app && input.memberPref.in_app && input.failClosedPrefs.in_app,
  );

  for (const ch of ["email", "sms", "whatsapp"] as const) {
    out[ch] = Boolean(
      cut2MatrixAllows(type, ch) &&
        input.groupAllowed[ch] &&
        input.memberPref[ch] &&
        input.failClosedPrefs[ch],
    );
  }

  out.push = false;
  return out;
}

/** Convenience: Trust Cut 1 / live prefs-read error map for a real user. */
export const FAIL_CLOSED_PREFS_ON_ERROR: ChannelFlags = {
  in_app: true,
  email: false,
  sms: false,
  whatsapp: false,
  push: false,
};

export const CUT2_TYPE_COUNT = CUT2_NOTIFICATION_TYPES.length;

export type TrustedEnqueueConsideration = {
  kind: "trusted_enqueue_consideration";
  notificationType: Cut2NotificationType;
  /** Queue channels only. Never push. Never contact / body / provider / queue row. */
  channels: Cut2QueueChannel[];
  occurrenceIdentity?: string;
  resolved: boolean;
};

/**
 * Map an ENQUEUE_ELIGIBLE disposition + intersected channels to semantic
 * enqueue intent. Returns null unless disposition is ENQUEUE_ELIGIBLE.
 * Callers must still go through enqueue_outbound_notification — this helper
 * does not enqueue.
 */
export function toTrustedEnqueueConsideration(input: {
  notificationType: Cut2NotificationType | string;
  disposition: PolicyDisposition;
  channels: ChannelFlags;
  occurrenceIdentity?: string;
  resolved: boolean;
}): TrustedEnqueueConsideration | null {
  if (input.disposition.kind !== "ENQUEUE_ELIGIBLE") return null;
  if (!isCut2NotificationType(input.notificationType)) return null;
  const channels: Cut2QueueChannel[] = [];
  for (const ch of ["whatsapp", "sms", "email"] as const) {
    if (input.channels[ch] && cut2MatrixAllows(input.notificationType, ch)) {
      channels.push(ch);
    }
  }
  return {
    kind: "trusted_enqueue_consideration",
    notificationType: input.notificationType,
    channels,
    occurrenceIdentity: input.occurrenceIdentity,
    resolved: input.resolved,
  };
}

// ── Occurrence supersession ─────────────────────────────────────────────────

export type OccurrenceStatus =
  | "scheduled"
  | "deferred"
  | "sent"
  | "skipped"
  | "superseded"
  | "cancelled"
  | "stop_resolved"
  | "stop_policy";

export type OccurrenceRow = {
  id: string;
  identityKey: string;
  anchorAtIso: string;
  status: OccurrenceStatus;
  eligibleAt: Date | string;
};

export type SupersessionPlan = {
  /** Old FUTURE unsent rows to mark superseded (status → superseded). */
  toSupersede: OccurrenceRow[];
  /** Sent (and other terminal immutable) rows left untouched. */
  immutableKept: OccurrenceRow[];
  /** Already-terminal non-sent (cancelled/stop_*) left as-is. */
  leftAsIs: OccurrenceRow[];
};

const FUTURE_UNSENT: ReadonlySet<OccurrenceStatus> = new Set([
  "scheduled",
  "deferred",
]);

const SENT_IMMUTABLE: ReadonlySet<OccurrenceStatus> = new Set(["sent"]);

/**
 * When an anchor changes (reschedule), mark old FUTURE unsent occurrences as
 * superseded; keep sent immutable. Does not mutate inputs — returns a plan.
 * Does not write the ledger (writers are deferred; no SECURITY DEFINER here).
 */
export function OccurrenceSupersession(input: {
  previousOccurrences: OccurrenceRow[];
  newAnchorAt: Date | string;
  now?: Date;
}): SupersessionPlan {
  const now = input.now ?? new Date();
  const newIso =
    input.newAnchorAt instanceof Date
      ? input.newAnchorAt.toISOString()
      : new Date(input.newAnchorAt).toISOString();

  const toSupersede: OccurrenceRow[] = [];
  const immutableKept: OccurrenceRow[] = [];
  const leftAsIs: OccurrenceRow[] = [];

  for (const row of input.previousOccurrences) {
    if (SENT_IMMUTABLE.has(row.status)) {
      immutableKept.push(row);
      continue;
    }
    if (row.anchorAtIso === newIso) {
      leftAsIs.push(row);
      continue;
    }
    if (FUTURE_UNSENT.has(row.status)) {
      const eligible =
        row.eligibleAt instanceof Date
          ? row.eligibleAt
          : new Date(row.eligibleAt);
      void now;
      void eligible;
      toSupersede.push(row);
      continue;
    }
    leftAsIs.push(row);
  }

  return { toSupersede, immutableKept, leftAsIs };
}

// ── Payment adapter ─────────────────────────────────────────────────────────

export type PaymentEconomicStatus =
  | "confirmed_full"
  | "waived"
  | "partial"
  | "unpaid"
  | "pending_confirmation";

export type PaymentAdapterInput = {
  economicStatus: PaymentEconomicStatus;
  /**
   * Optional: when true and status is pending_confirmation, adapters MAY
   * snooze (defer) rather than treat as unresolved-ready-to-remind.
   */
  snoozeWhilePaymentPending?: boolean;
};

export type PaymentAdapterOutput = {
  resolved: boolean;
  reason:
    | "confirmed_full"
    | "waived"
    | "partial_unresolved"
    | "unpaid_unresolved"
    | "pending_confirmation_unresolved";
  snoozeHint?: boolean;
};

/**
 * Payment resolved rules:
 *   confirmed-full → resolved
 *   waived → resolved
 *   partial → unresolved
 *   unpaid → unresolved
 *   pending_confirmation → unresolved economically
 */
export function PaymentAdapter(input: PaymentAdapterInput): PaymentAdapterOutput {
  switch (input.economicStatus) {
    case "confirmed_full":
      return { resolved: true, reason: "confirmed_full" };
    case "waived":
      return { resolved: true, reason: "waived" };
    case "partial":
      return { resolved: false, reason: "partial_unresolved" };
    case "unpaid":
      return { resolved: false, reason: "unpaid_unresolved" };
    case "pending_confirmation": {
      const out: PaymentAdapterOutput = {
        resolved: false,
        reason: "pending_confirmation_unresolved",
      };
      if (input.snoozeWhilePaymentPending === true) {
        out.snoozeHint = true;
      }
      return out;
    }
    default: {
      const _exhaustive: never = input.economicStatus;
      void _exhaustive;
      return { resolved: false, reason: "unpaid_unresolved" };
    }
  }
}

export type PaymentAdapterInputAlias = PaymentAdapterInput;
export type PaymentAdapterOutputAlias = PaymentAdapterOutput;

// ── Hosting adapter ─────────────────────────────────────────────────────────

export type HostingAssignmentState =
  | "assigned"
  | "completed"
  | "exempt"
  | "cancelled"
  | "swapped_away";

export type HostingAdapterInput = {
  state: HostingAssignmentState;
  newHostObjectId?: string | null;
};

export type HostingAdapterOutput = {
  resolvedForOldHost: boolean;
  reason:
    | "still_assigned"
    | "completed"
    | "exempt"
    | "cancelled"
    | "swapped_away";
  newObjectId?: string;
};

/**
 * Hosting: completed / exempt / cancelled / swapped-away → resolved for old host.
 * New host = new object (new occurrences under new object id).
 */
export function HostingAdapter(input: HostingAdapterInput): HostingAdapterOutput {
  switch (input.state) {
    case "assigned":
      return { resolvedForOldHost: false, reason: "still_assigned" };
    case "completed":
      return { resolvedForOldHost: true, reason: "completed" };
    case "exempt":
      return { resolvedForOldHost: true, reason: "exempt" };
    case "cancelled":
      return { resolvedForOldHost: true, reason: "cancelled" };
    case "swapped_away": {
      const out: HostingAdapterOutput = {
        resolvedForOldHost: true,
        reason: "swapped_away",
      };
      if (input.newHostObjectId) {
        out.newObjectId = input.newHostObjectId;
      }
      return out;
    }
    default: {
      const _exhaustive: never = input.state;
      void _exhaustive;
      return { resolvedForOldHost: false, reason: "still_assigned" };
    }
  }
}

// ── Event adapter ───────────────────────────────────────────────────────────

export type EventLifecycleState =
  | "scheduled"
  | "cancelled"
  | "completed"
  | "rescheduled";

export type EventAdapterInput = {
  state: EventLifecycleState;
  previousStartsAt?: string | Date | null;
  startsAt: string | Date;
};

export type EventAdapterOutput = {
  resolved: boolean;
  reason: "active" | "cancelled" | "completed" | "rescheduled_new_anchor";
  newAnchorAt?: Date;
  anchorChanged?: boolean;
};

/**
 * Event: cancelled / completed → resolved.
 * starts_at reschedule → new anchor (not resolved; supersede old future unsent).
 */
export function EventAdapter(input: EventAdapterInput): EventAdapterOutput {
  if (input.state === "cancelled") {
    return { resolved: true, reason: "cancelled" };
  }
  if (input.state === "completed") {
    return { resolved: true, reason: "completed" };
  }

  const newAnchor =
    input.startsAt instanceof Date ? input.startsAt : new Date(input.startsAt);

  if (input.state === "rescheduled" || input.previousStartsAt != null) {
    const prevIso =
      input.previousStartsAt == null
        ? null
        : input.previousStartsAt instanceof Date
          ? input.previousStartsAt.toISOString()
          : new Date(input.previousStartsAt).toISOString();
    const newIso = newAnchor.toISOString();
    if (prevIso != null && prevIso !== newIso) {
      return {
        resolved: false,
        reason: "rescheduled_new_anchor",
        newAnchorAt: newAnchor,
        anchorChanged: true,
      };
    }
    if (input.state === "rescheduled") {
      return {
        resolved: false,
        reason: "rescheduled_new_anchor",
        newAnchorAt: newAnchor,
        anchorChanged: true,
      };
    }
  }

  return { resolved: false, reason: "active", newAnchorAt: newAnchor };
}

// ── Legacy defaults parity ──────────────────────────────────────────────────

export const LEGACY_DEFAULTS = {
  hosting: DEFAULT_HOSTING_POLICY,
  event: DEFAULT_EVENT_POLICY,
  paymentCron: LEGACY_PAYMENT_CRON_CONTRACT,
  futurePaymentExample: FUTURE_PAYMENT_POLICY,
} as const;

/** Maps domain → foundation default config (payment returns null — use cron contract). */
export function legacyParityPolicyForDomain(
  domain: "payment" | "hosting" | "event",
): NotificationPolicyConfig | null {
  if (domain === "hosting") return DEFAULT_HOSTING_POLICY;
  if (domain === "event") return DEFAULT_EVENT_POLICY;
  return null;
}

export function legacyParityPaymentCron() {
  return LEGACY_PAYMENT_CRON_CONTRACT;
}

export function assertLegacyHostingParity(policy: NotificationPolicyConfig): boolean {
  return (
    policy.triggers.length === 1 &&
    policy.triggers[0].offsetHours === -7 * 24 &&
    policy.maxOccurrences === 1 &&
    policy.repeatIntervalHours == null &&
    policy.enabled === false &&
    policy.channels.push === false
  );
}

export function assertLegacyEventParity(policy: NotificationPolicyConfig): boolean {
  return (
    policy.triggers.length === 1 &&
    policy.triggers[0].offsetHours === -48 &&
    policy.maxOccurrences === 1 &&
    policy.repeatIntervalHours == null &&
    policy.enabled === false &&
    policy.channels.push === false
  );
}

export function assertLegacyPaymentCronParity(): boolean {
  return (
    LEGACY_PAYMENT_CRON_CONTRACT.live === true &&
    LEGACY_PAYMENT_CRON_CONTRACT.kind === "overdue_daily_selection" &&
    LEGACY_PAYMENT_CRON_CONTRACT.notARelativeTriggerOffsetHours === null
  );
}

/**
 * Documentation labels only — not a UI implementation.
 * UI/UX Excellence Track is ACTIVE; M2 foundation does not ship an editor.
 */
export const UI_POLICY_LABELS = {
  domains: {
    payment: "Payment reminders",
    hosting: "Hosting reminders",
    event: "Event reminders",
  },
  layers: {
    system_legacy: "System default",
    group_domain: "Group default",
    object_override: "This item only",
  },
  fields: {
    enabled: "Reminders on",
    timezone: "Time zone",
    triggers: "When to remind",
    repeatIntervalHours: "Repeat every (hours)",
    maxOccurrences: "Maximum reminders",
    stopWhenResolved: "Stop when resolved",
    stopAfterHours: "Stop after (hours from due/start)",
    quietHours: "Quiet hours",
    channels: "Channels allowed by group",
  },
  triggerHints: {
    before: "Before",
    after: "After",
    hours: "hours",
    days: "days",
  },
  channels: {
    in_app: "In-app",
    email: "Email",
    sms: "SMS",
    whatsapp: "WhatsApp",
    push: "Push (denied)",
  },
  permission: {
    key: "settings.manage",
    writeRequires: "settings.manage",
    readRequires: "settings.manage (owner / admin / officers with settings.manage)",
    notInvented: "notifications.manage",
  },
  honesty: {
    noRecurrenceJargon: "Use simple before/after offsets — do not expose calendar recurrence-rule jargon in UI.",
    paymentLegacy:
      "Payment reminders currently run as a daily overdue check until a later cutover.",
    dormantOccurrences: "Occurrence history is not live yet.",
    enqueueEligible:
      "ENQUEUE_ELIGIBLE means a trusted producer may consider enqueue_outbound_notification — never a send.",
  },
} as const;

export type UiPolicyLabels = typeof UI_POLICY_LABELS;

export const POLICY_ADMIN_PERMISSION = {
  key: "settings.manage",
  notInvented: "notifications.manage",
} as const;

/**
 * SQL boolean columns → flags, then AND Cut 2 matrix. Push forced false.
 * Never a send path.
 */
export function channelsFromSqlBooleans(
  row: {
    channel_in_app: boolean;
    channel_email: boolean;
    channel_sms: boolean;
    channel_whatsapp: boolean;
    channel_push?: boolean;
  },
  notificationType: Cut2NotificationType | string,
): ChannelFlags {
  void POLICY_CHANNEL_KEYS;
  const groupAllowed: ChannelFlags = {
    in_app: row.channel_in_app,
    email: row.channel_email,
    sms: row.channel_sms,
    whatsapp: row.channel_whatsapp,
    push: false,
  };
  const allTrue: ChannelFlags = {
    in_app: true,
    email: true,
    sms: true,
    whatsapp: true,
    push: false,
  };
  return ChannelIntersection({
    notificationType,
    groupAllowed,
    memberPref: allTrue,
    failClosedPrefs: allTrue,
  });
}
