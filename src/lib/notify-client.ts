/**
 * Client-side notification helper.
 * Sends notifications via API routes (email, SMS, WhatsApp) from client components.
 * All sends are fire-and-forget — never throws, never blocks mutations.
 *
 * PREFERENCE ENFORCEMENT: Every send checks member preferences via getEnabledChannels().
 * The caller's `channels` param is an UPPER BOUND — getEnabledChannels() further restricts
 * based on member settings. In-app is always sent (cannot opt out).
 *
 * DEEP LINKS: Every in-app notification INSERT includes a `link` field in the `data` JSONB.
 *
 * For server-side notifications (cron jobs, server actions), use getEnabledChannels() directly.
 */

import { createClient } from "@/lib/supabase/client";
import { getEnabledChannels, type NotificationTypeKey } from "@/lib/notification-prefs";

// ─── Deep Link Map ─────────────────────────────────────────────────────────

const NOTIFICATION_DEEP_LINKS: Record<string, string> = {
  contribution_received: "/dashboard/my-payments",
  payment: "/dashboard/my-payments",
  payment_reminder: "/dashboard/my-payments",
  event_reminder: "/dashboard/my-events",
  hosting_reminder: "/dashboard/my-hosting",
  hosting_assignment: "/dashboard/my-hosting",
  minutes_published: "/dashboard/minutes",
  relief: "/dashboard/relief/my",
  relief_claim: "/dashboard/relief/my",
  standing: "/dashboard/my-dashboard",
  announcement: "/dashboard/announcements",
  loan: "/dashboard/my-loans",
  fine: "/dashboard/my-fines",
  member_joined: "/dashboard/members",
  new_member: "/dashboard/members",
  system: "/dashboard/notifications",
  remittance: "/dashboard/relief/remittances",
  subscription: "/dashboard/settings/billing",
  election: "/dashboard/elections",
  invitation: "/dashboard/invitations",
};

/** Resolve a deep link for a notification type */
export function getNotificationLink(type: string): string {
  return NOTIFICATION_DEEP_LINKS[type] || "/dashboard/notifications";
}

export interface ClientNotifyParams {
  /** Recipient user ID (for in-app + resolving email/phone) */
  recipientUserId?: string | null;
  /** Recipient phone (E.164 format, for SMS/WhatsApp if known) */
  recipientPhone?: string | null;
  /** Group ID for in-app notifications */
  groupId: string;
  /** In-app notification type (e.g., "system", "announcement", "contribution_received") */
  inAppType?: string;
  /** In-app notification title */
  title: string;
  /** In-app notification body */
  body: string;
  /** Email template — "notification" for generic, or specific template name */
  emailTemplate?: string;
  /** Email/SMS/WhatsApp template data */
  data: Record<string, string>;
  /** SMS template name (e.g., "fine-issued") */
  smsTemplate?: string;
  /** WhatsApp notification type (e.g., "fine_issued") */
  whatsappType?: string;
  /** Locale for bilingual sends */
  locale?: string;
  /** Which channels the CALLER wants to send on (upper bound — prefs further restrict) */
  channels: {
    inApp?: boolean;
    email?: boolean;
    sms?: boolean;
    whatsapp?: boolean;
  };
  /** Notification preference category — used to check member preferences */
  prefType?: NotificationTypeKey;
  /** Override deep link (auto-resolved from inAppType if not set) */
  link?: string;
}

/**
 * Send notifications from client components via API routes.
 * Checks member preferences before each external channel send.
 * In-app is always sent. Each channel is independent. All fire-and-forget.
 */
export async function notifyFromClient(params: ClientNotifyParams): Promise<void> {
  const {
    recipientUserId,
    recipientPhone,
    groupId,
    inAppType = "system",
    title,
    body,
    emailTemplate = "notification",
    data,
    smsTemplate,
    whatsappType,
    locale = "en",
    channels,
    prefType,
    link,
  } = params;

  const supabase = createClient();

  // ─── Check member preferences ─────────────────────────────────────────────
  let enabledEmail = !!channels.email;
  let enabledSms = !!channels.sms;
  let enabledWhatsapp = !!channels.whatsapp;

  if (prefType) {
    try {
      const prefs = await getEnabledChannels(supabase, recipientUserId || null, prefType, groupId);
      enabledEmail = enabledEmail && prefs.email;
      enabledSms = enabledSms && prefs.sms;
      enabledWhatsapp = enabledWhatsapp && prefs.whatsapp;
    } catch { /* on error, send anyway (fail-open) */ }
  }

  // ─── Resolve deep link ────────────────────────────────────────────────────
  const deepLink = link || getNotificationLink(inAppType);

  // Get session token for API calls
  let accessToken: string | null = null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    accessToken = session?.access_token || null;
  } catch { /* best-effort */ }

  // ─── In-App Notification (always sent — cannot opt out) ───────────────────
  if (channels.inApp && recipientUserId) {
    try {
      await supabase.from("notifications").insert({
        user_id: recipientUserId,
        group_id: groupId,
        type: inAppType,
        title,
        body,
        data: { link: deepLink },
        is_read: false,
      });
    } catch { /* best-effort */ }
  }

  if (!accessToken) return; // Can't call API routes without auth

  // ─── Email ────────────────────────────────────────────────────────────────
  if (enabledEmail && (recipientUserId || data.email)) {
    try {
      fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          to: data.email || recipientUserId,
          template: emailTemplate,
          data: { title, body, groupName: data.groupName || "", ...data },
          locale,
        }),
      }).catch(() => {});
    } catch { /* best-effort */ }
  }

  // ─── SMS ──────────────────────────────────────────────────────────────────
  if (enabledSms && smsTemplate && (recipientPhone || recipientUserId)) {
    try {
      fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          to: recipientPhone || recipientUserId,
          template: smsTemplate,
          data,
          locale,
        }),
      }).catch(() => {});
    } catch { /* best-effort */ }
  }

  // ─── WhatsApp ─────────────────────────────────────────────────────────────
  if (enabledWhatsapp && whatsappType && (recipientPhone || recipientUserId)) {
    try {
      fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          to: recipientPhone || recipientUserId,
          type: whatsappType,
          data,
          locale,
        }),
      }).catch(() => {});
    } catch { /* best-effort */ }
  }
}

/**
 * Send bulk notifications from client components.
 * For each recipient, checks preferences and fires enabled channels.
 * All fire-and-forget. Uses batched in-app inserts with deep links.
 */
export async function notifyBulkFromClient(
  recipients: Array<{
    userId?: string | null;
    phone?: string | null;
  }>,
  params: Omit<ClientNotifyParams, "recipientUserId" | "recipientPhone" | "channels"> & {
    channels: ClientNotifyParams["channels"];
  },
): Promise<void> {
  const supabase = createClient();

  let accessToken: string | null = null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    accessToken = session?.access_token || null;
  } catch { /* best-effort */ }

  // ─── Resolve deep link ────────────────────────────────────────────────────
  const deepLink = params.link || getNotificationLink(params.inAppType || "system");

  // ─── Batch In-App (always sent) ──────────────────────────────────────────
  if (params.channels.inApp) {
    try {
      const rows = recipients
        .filter((r) => r.userId)
        .map((r) => ({
          user_id: r.userId!,
          group_id: params.groupId,
          type: params.inAppType || "system",
          title: params.title,
          body: params.body,
          data: { link: deepLink },
          is_read: false,
        }));
      for (let i = 0; i < rows.length; i += 50) {
        await supabase.from("notifications").insert(rows.slice(i, i + 50));
      }
    } catch { /* best-effort */ }
  }

  if (!accessToken) return;

  // ─── Per-recipient external channels (with preference check) ──────────────
  for (const r of recipients) {
    const to = r.phone || r.userId;
    if (!to) continue;

    // Check this member's preferences
    let enabledEmail = !!params.channels.email;
    let enabledSms = !!params.channels.sms;
    let enabledWhatsapp = !!params.channels.whatsapp;

    if (params.prefType) {
      try {
        const prefs = await getEnabledChannels(supabase, r.userId || null, params.prefType, params.groupId);
        enabledEmail = enabledEmail && prefs.email;
        enabledSms = enabledSms && prefs.sms;
        enabledWhatsapp = enabledWhatsapp && prefs.whatsapp;
      } catch { /* fail-open */ }
    }

    if (enabledEmail && r.userId) {
      try {
        fetch("/api/email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            to: r.userId,
            template: params.emailTemplate || "notification",
            data: { title: params.title, body: params.body, groupName: params.data.groupName || "", ...params.data },
            locale: params.locale || "en",
          }),
        }).catch(() => {});
      } catch { /* best-effort */ }
    }

    if (enabledSms && params.smsTemplate) {
      try {
        fetch("/api/sms/send", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            to,
            template: params.smsTemplate,
            data: params.data,
            locale: params.locale || "en",
          }),
        }).catch(() => {});
      } catch { /* best-effort */ }
    }

    // WhatsApp requires a real phone number — sending a UUID forces the
    // API route to resolve it via profiles.phone, which is NULL for most
    // users (profile trigger only sets full_name + avatar_url).
    // Skip WhatsApp entirely when we only have a UUID and no phone.
    const waTo = r.phone || to;
    const hasPhone = !!r.phone; // true = real phone, false = UUID fallback
    if (enabledWhatsapp && params.whatsappType && hasPhone) {
      try {
        fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            to: waTo,
            type: params.whatsappType,
            data: params.data,
            locale: params.locale || "en",
          }),
        }).catch(() => {});
      } catch { /* best-effort */ }
    }
  }
}
