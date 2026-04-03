/**
 * Unified notification dispatcher (SERVER-SIDE).
 * Sends notifications across channels: in-app, email, SMS, WhatsApp.
 * Each channel is independent — one failure doesn't block others.
 * All sends are best-effort (try/catch wrapped).
 *
 * TODO: This module currently has ZERO callers. All consumers use either:
 *   - `notifyFromClient()` / `notifyBulkFromClient()` from `@/lib/notify-client.ts` (client-side)
 *   - Direct fetch() calls to API routes (being migrated to the above)
 *   - Direct dispatchWhatsApp() calls
 * Refactor remaining direct-fetch consumers to use this module for server-side sends,
 * or consolidate into notify-client.ts. Do NOT delete — the types and architecture are
 * the canonical reference for the notification system.
 *
 * Usage:
 *   await notifyMember({
 *     recipientPhone: "+237677123456",
 *     recipientEmail: "john@example.com",
 *     recipientUserId: "uuid",
 *     groupId: "group-uuid",
 *     type: "payment_receipt",
 *     data: { memberName: "John", amount: "50,000 FCFA", ... },
 *     locale: "en",
 *     channels: { inApp: true, email: true, sms: true, whatsapp: true },
 *   });
 */

import { dispatchWhatsApp, type WhatsAppNotificationType } from "@/lib/whatsapp-dispatcher";

export interface NotifyParams {
  /** Recipient phone (E.164 format) */
  recipientPhone?: string | null;
  /** Recipient email */
  recipientEmail?: string | null;
  /** Recipient user ID for in-app notifications */
  recipientUserId?: string | null;
  /** Group ID for in-app notifications */
  groupId?: string | null;
  /** Notification type — maps to email/sms/whatsapp templates */
  type: WhatsAppNotificationType;
  /** Template data — keys vary by type */
  data: Record<string, string>;
  /** Locale: "en" or "fr" */
  locale?: string;
  /** Which channels to send on */
  channels?: {
    inApp?: boolean;
    email?: boolean;
    sms?: boolean;
    whatsapp?: boolean;
  };
  /** Session access token for authenticated API calls */
  accessToken?: string;
  /** Base URL for constructing links (defaults to window.location.origin on client) */
  baseUrl?: string;
}

interface NotifyResult {
  inApp: boolean;
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
}

/**
 * Send a notification across multiple channels.
 * Each channel is independent and never blocks the others.
 * Returns which channels succeeded.
 */
export async function notifyMember(params: NotifyParams): Promise<NotifyResult> {
  const {
    recipientPhone,
    recipientEmail,
    recipientUserId,
    groupId,
    type,
    data,
    locale = "en",
    channels = {},
    accessToken,
    baseUrl,
  } = params;

  const result: NotifyResult = {
    inApp: false,
    email: false,
    sms: false,
    whatsapp: false,
  };

  const origin = baseUrl || (typeof window !== "undefined" ? window.location.origin : "https://villageclaq.com");

  // ─── In-App Notification ──────────────────────────────────────────────────
  if (channels.inApp && recipientUserId && groupId) {
    try {
      // Dynamic import to avoid circular dependencies with Supabase client
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const notifType = mapTypeToNotificationType(type);
      const { getNotificationLink } = await import("@/lib/notify-client");
      const deepLink = getNotificationLink(notifType);
      await supabase.from("notifications").insert({
        user_id: recipientUserId,
        group_id: groupId,
        type: notifType,
        title: data.title || data.groupName || "",
        body: data.body || data.memberName || "",
        data: { link: deepLink },
      });
      result.inApp = true;
    } catch { /* in-app notification is best-effort */ }
  }

  // ─── Email ────────────────────────────────────────────────────────────────
  if (channels.email && (recipientEmail || recipientUserId) && accessToken) {
    try {
      const emailTemplate = mapTypeToEmailTemplate(type);
      if (emailTemplate) {
        fetch(`${origin}/api/email/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            to: recipientEmail || recipientUserId,
            template: emailTemplate,
            data,
            locale,
          }),
        }).catch(() => {});
        result.email = true; // fire-and-forget
      }
    } catch { /* email is best-effort */ }
  }

  // ─── SMS ──────────────────────────────────────────────────────────────────
  if (channels.sms && recipientPhone && accessToken) {
    try {
      const smsTemplate = mapTypeToSmsTemplate(type);
      if (smsTemplate) {
        fetch(`${origin}/api/sms/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            to: recipientPhone,
            template: smsTemplate,
            data,
            locale,
          }),
        }).catch(() => {});
        result.sms = true; // fire-and-forget
      }
    } catch { /* SMS is best-effort */ }
  }

  // ─── WhatsApp ─────────────────────────────────────────────────────────────
  if (channels.whatsapp && recipientPhone) {
    try {
      const success = await dispatchWhatsApp(type, recipientPhone, locale, data);
      result.whatsapp = success;
    } catch { /* WhatsApp is best-effort */ }
  }

  return result;
}

// ─── Type Mappers ───────────────────────────────────────────────────────────

function mapTypeToNotificationType(type: WhatsAppNotificationType): string {
  const map: Record<string, string> = {
    payment_receipt: "payment",
    payment_reminder: "payment_reminder",
    event_reminder: "event_reminder",
    hosting_reminder: "hosting_reminder",
    minutes_published: "minutes_published",
    relief_claim_approved: "relief",
    relief_claim_denied: "relief",
    announcement: "announcement",
    election_opened: "election",
    invitation: "invitation",
    loan_approved: "loan",
    loan_overdue: "loan",
    fine_issued: "fine",
    standing_changed: "standing",
    welcome: "system",
  };
  return map[type] || "system";
}

function mapTypeToEmailTemplate(type: WhatsAppNotificationType): string | null {
  const map: Record<string, string> = {
    payment_receipt: "payment-receipt",
    payment_reminder: "payment-reminder",
    event_reminder: "event-reminder",
    minutes_published: "minutes-published",
    invitation: "invitation",
    welcome: "welcome",
    // All others use the generic "notification" template
    hosting_reminder: "notification",
    hosting_assignment: "notification",
    relief_claim_approved: "notification",
    relief_claim_denied: "notification",
    announcement: "notification",
    loan_approved: "notification",
    fine_issued: "notification",
    standing_changed: "notification",
    relief_enrollment: "notification",
    remittance_confirmed: "notification",
    remittance_disputed: "notification",
    subscription_expiring: "notification",
  };
  return map[type] || null;
}

function mapTypeToSmsTemplate(type: WhatsAppNotificationType): string | null {
  const map: Record<string, string> = {
    payment_receipt: "payment-receipt",
    payment_reminder: "payment-reminder",
    event_reminder: "event-reminder",
    minutes_published: "minutes-published",
    hosting_reminder: "hosting-reminder",
    standing_changed: "standing-changed",
    welcome: "welcome",
    hosting_assignment: "hosting-assignment",
    relief_enrollment: "relief-enrollment",
    remittance_confirmed: "remittance-status",
    remittance_disputed: "remittance-status",
    subscription_expiring: "subscription-expiring",
    relief_claim_approved: "relief-claim-approved",
    relief_claim_denied: "relief-claim-denied",
    announcement: "announcement",
    loan_approved: "loan-approved",
    fine_issued: "fine-issued",
  };
  return map[type] || null;
}
