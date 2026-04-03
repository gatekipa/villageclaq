import { resend, FROM_EMAIL } from "./resend";
import { welcomeEmail, welcomeSubject } from "./email-templates/welcome";
import { paymentReceiptEmail, paymentReceiptSubject } from "./email-templates/payment-receipt";
import { paymentReminderEmail, paymentReminderSubject } from "./email-templates/payment-reminder";
import { eventReminderEmail, eventReminderSubject } from "./email-templates/event-reminder";
import { minutesPublishedEmail, minutesPublishedSubject } from "./email-templates/minutes-published";
import { invitationEmail, invitationSubject } from "./email-templates/invitation";
import { notificationEmail, notificationSubject } from "./email-templates/notification";

export type EmailTemplate =
  | "welcome"
  | "payment-receipt"
  | "payment-reminder"
  | "event-reminder"
  | "minutes-published"
  | "invitation"
  | "notification";

interface SendEmailParams {
  to: string;
  template: EmailTemplate;
  data: Record<string, unknown>;
  locale?: "en" | "fr";
}

/**
 * Send an email via Resend. NEVER throws — returns success/error.
 * Safe to call from any server-side context without try/catch.
 */
export async function sendEmail({
  to,
  template,
  data,
  locale = "en",
}: SendEmailParams): Promise<{ success: boolean; error?: string }> {
  try {
    if (!process.env.RESEND_API_KEY) {
      return { success: false, error: "RESEND_API_KEY not configured" };
    }

    let html: string;
    let subject: string;

    switch (template) {
      case "welcome":
        html = welcomeEmail(data as unknown as Parameters<typeof welcomeEmail>[0], locale);
        subject = welcomeSubject((data.groupName as string) || "", locale);
        break;

      case "payment-receipt":
        html = paymentReceiptEmail(data as unknown as Parameters<typeof paymentReceiptEmail>[0], locale);
        subject = paymentReceiptSubject((data.amount as string) || "", locale);
        break;

      case "payment-reminder":
        html = paymentReminderEmail(data as unknown as Parameters<typeof paymentReminderEmail>[0], locale);
        subject = paymentReminderSubject(!!data.daysOverdue, locale);
        break;

      case "event-reminder":
        html = eventReminderEmail(data as unknown as Parameters<typeof eventReminderEmail>[0], locale);
        subject = eventReminderSubject((data.eventName as string) || "", locale);
        break;

      case "minutes-published":
        html = minutesPublishedEmail(data as unknown as Parameters<typeof minutesPublishedEmail>[0], locale);
        subject = minutesPublishedSubject((data.meetingTitle as string) || "", locale);
        break;

      case "invitation":
        html = invitationEmail(data as unknown as Parameters<typeof invitationEmail>[0], locale);
        subject = invitationSubject((data.groupName as string) || "", locale);
        break;

      case "notification":
        html = notificationEmail(data as unknown as Parameters<typeof notificationEmail>[0], locale);
        subject = notificationSubject((data.title as string) || "");
        break;

      default:
        return { success: false, error: `Unknown template: ${template}` };
    }

    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });

    if (error) {
      console.warn(`[Email] Failed to send ${template} to ${to}:`, error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.warn(`[Email] Exception sending ${template} to ${to}:`, msg);
    return { success: false, error: msg };
  }
}

/**
 * Send email to multiple recipients. Uses Promise.allSettled so
 * individual failures don't block others.
 */
export async function sendBulkEmail(
  recipients: Array<{ to: string; locale?: "en" | "fr" }>,
  template: EmailTemplate,
  data: Record<string, unknown>
): Promise<{ sent: number; failed: number }> {
  const results = await Promise.allSettled(
    recipients.map((r) =>
      sendEmail({ to: r.to, template, data, locale: r.locale || "en" })
    )
  );

  let sent = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.success) sent++;
    else failed++;
  }

  return { sent, failed };
}
