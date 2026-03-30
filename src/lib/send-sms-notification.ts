import { sendSMS } from "@/lib/notifications/sms-sender";
import { isAfricanPhoneNumber } from "@/lib/is-african-phone";
import {
  paymentReminderSms,
  eventReminderSms,
  paymentReceiptSms,
  welcomeSms,
  minutesPublishedSms,
  paymentPendingSms,
} from "@/lib/notifications/sms-templates";

// ─── Template Types ─────────────────────────────────────────────────────────

export type SmsTemplate =
  | "payment-reminder"
  | "event-reminder"
  | "payment-receipt"
  | "welcome"
  | "minutes-published"
  | "payment-pending";

interface SendSmsNotificationParams {
  to: string; // E.164 phone number
  template: SmsTemplate;
  data: Record<string, unknown>;
  locale?: "en" | "fr";
}

/**
 * Send a template-based SMS notification via Africa's Talking.
 * - Only sends to African phone numbers (isAfricanPhoneNumber filter)
 * - Never throws — safe for fire-and-forget usage
 * - Returns { sent, skipped, error } for logging
 */
export async function sendSmsNotification({
  to,
  template,
  data,
  locale = "en",
}: SendSmsNotificationParams): Promise<{ sent: boolean; skipped: boolean; error?: string }> {
  // Only send to African numbers
  if (!isAfricanPhoneNumber(to)) {
    return { sent: false, skipped: true, error: "Non-African phone number" };
  }

  try {
    const message = buildMessage(template, data, locale);
    if (!message) {
      return { sent: false, skipped: true, error: `Unknown template: ${template}` };
    }

    const result = await sendSMS({ to, message });
    return { sent: result.sent, skipped: false, error: result.error };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.warn(`[SMS:Notification] Failed ${template} to ${to}:`, msg);
    return { sent: false, skipped: false, error: msg };
  }
}

/**
 * Send SMS to multiple recipients. Uses Promise.allSettled so
 * individual failures don't block others.
 */
export async function sendBulkSmsNotification(
  recipients: Array<{ to: string; locale?: "en" | "fr" }>,
  template: SmsTemplate,
  data: Record<string, unknown>
): Promise<{ sent: number; failed: number; skipped: number }> {
  const results = await Promise.allSettled(
    recipients.map((r) =>
      sendSmsNotification({ to: r.to, template, data, locale: r.locale || "en" })
    )
  );

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const r of results) {
    if (r.status === "fulfilled") {
      if (r.value.sent) sent++;
      else if (r.value.skipped) skipped++;
      else failed++;
    } else {
      failed++;
    }
  }

  return { sent, failed, skipped };
}

// ─── Message Builder ────────────────────────────────────────────────────────

function buildMessage(
  template: SmsTemplate,
  data: Record<string, unknown>,
  locale: "en" | "fr"
): string | null {
  switch (template) {
    case "payment-reminder":
      return paymentReminderSms({
        groupName: (data.groupName as string) || "",
        amount: (data.amount as string) || "",
        type: (data.contributionType as string) || (data.type as string) || "",
        locale,
      });

    case "event-reminder":
      return eventReminderSms({
        groupName: (data.groupName as string) || "",
        eventName: (data.eventName as string) || "",
        date: (data.eventDate as string) || (data.date as string) || "",
        location: (data.eventLocation as string) || (data.location as string) || "",
        locale,
      });

    case "payment-receipt":
      return paymentReceiptSms({
        groupName: (data.groupName as string) || "",
        amount: (data.amount as string) || "",
        type: (data.contributionType as string) || (data.type as string) || "",
        locale,
      });

    case "welcome":
      return welcomeSms({
        groupName: (data.groupName as string) || "",
        memberName: (data.memberName as string) || "",
        locale,
      });

    case "minutes-published":
      return minutesPublishedSms({
        groupName: (data.groupName as string) || "",
        meetingTitle: (data.meetingTitle as string) || "",
        locale,
      });

    case "payment-pending":
      return paymentPendingSms({
        groupName: (data.groupName as string) || "",
        memberName: (data.memberName as string) || "",
        amount: (data.amount as string) || "",
        locale,
      });

    default:
      return null;
  }
}
