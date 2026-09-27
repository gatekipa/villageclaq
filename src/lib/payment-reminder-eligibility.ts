export type PaymentReminderMode = "due_date_only" | "overdue_daily" | "stopped";

export type PaymentReminderSettings = {
  mode: PaymentReminderMode;
  timezone: string;
  stoppedContributionTypeIds: string[];
};

export type PaymentReminderEligibilityInput = {
  dueDate: string | null | undefined;
  contributionTypeId?: string | null;
  obligationStatus?: string | null;
  membershipStatus?: string | null;
  userId?: string | null;
  isProxy?: boolean | null;
  confirmedRemaining: number;
  at?: Date;
};

export type PaymentReminderEligibility = {
  eligible: boolean;
  reason:
    | "eligible"
    | "invalid_due_date"
    | "membership_not_active"
    | "recipient_unavailable"
    | "obligation_waived"
    | "obligation_settled_confirmed"
    | "reminders_stopped"
    | "contribution_reminders_stopped"
    | "before_due_date"
    | "after_due_date_default";
  localDate: string;
  mode: PaymentReminderMode;
  timezone: string;
};

const MODES = new Set<PaymentReminderMode>(["due_date_only", "overdue_daily", "stopped"]);

export function isValidIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function paymentReminderSettingsFromGroup(
  groupSettings: Record<string, unknown> | null | undefined,
): PaymentReminderSettings {
  const raw = groupSettings?.payment_reminders;
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const rawMode = String(value.mode || "due_date_only") as PaymentReminderMode;
  const rawTimezone = String(value.timezone || "UTC");
  const ids = Array.isArray(value.stopped_contribution_type_ids)
    ? value.stopped_contribution_type_ids.filter((id): id is string => typeof id === "string")
    : [];

  return {
    mode: MODES.has(rawMode) ? rawMode : "due_date_only",
    timezone: isValidIanaTimezone(rawTimezone) ? rawTimezone : "UTC",
    stoppedContributionTypeIds: Array.from(new Set(ids)),
  };
}

export function localCalendarDate(at: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function evaluatePaymentReminderEligibility(
  input: PaymentReminderEligibilityInput,
  settings: PaymentReminderSettings,
): PaymentReminderEligibility {
  const localDate = localCalendarDate(input.at || new Date(), settings.timezone);
  const base = { localDate, mode: settings.mode, timezone: settings.timezone };
  const dueDate = String(input.dueDate || "").slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { ...base, eligible: false, reason: "invalid_due_date" };
  if (input.membershipStatus && input.membershipStatus !== "active") return { ...base, eligible: false, reason: "membership_not_active" };
  if (!input.userId || input.isProxy) return { ...base, eligible: false, reason: "recipient_unavailable" };
  if (input.obligationStatus === "waived") return { ...base, eligible: false, reason: "obligation_waived" };
  if (input.obligationStatus === "paid") return { ...base, eligible: false, reason: "obligation_settled_confirmed" };
  if (!(input.confirmedRemaining > 0)) return { ...base, eligible: false, reason: "obligation_settled_confirmed" };
  if (settings.mode === "stopped") return { ...base, eligible: false, reason: "reminders_stopped" };
  if (input.contributionTypeId && settings.stoppedContributionTypeIds.includes(input.contributionTypeId)) {
    return { ...base, eligible: false, reason: "contribution_reminders_stopped" };
  }
  if (localDate < dueDate) return { ...base, eligible: false, reason: "before_due_date" };
  if (settings.mode === "due_date_only" && localDate > dueDate) {
    return { ...base, eligible: false, reason: "after_due_date_default" };
  }
  return { ...base, eligible: true, reason: "eligible" };
}
