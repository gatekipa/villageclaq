/**
 * Client-side notification helper.
 * Sends notifications via API routes (email, SMS, WhatsApp) from client components.
 * All sends are fire-and-forget — never throws, never blocks mutations.
 *
 * For server-side notifications (cron jobs, server actions), use notifyMember() from notify.ts.
 */

import { createClient } from "@/lib/supabase/client";

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
  /** Which channels to send on */
  channels: {
    inApp?: boolean;
    email?: boolean;
    sms?: boolean;
    whatsapp?: boolean;
  };
}

/**
 * Send notifications from client components via API routes.
 * Each channel is independent. All fire-and-forget.
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
  } = params;

  const supabase = createClient();

  // Get session token for API calls
  let accessToken: string | null = null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    accessToken = session?.access_token || null;
  } catch { /* best-effort */ }

  // ─── In-App Notification ──────────────────────────────────────────────────
  if (channels.inApp && recipientUserId) {
    try {
      await supabase.from("notifications").insert({
        user_id: recipientUserId,
        group_id: groupId,
        type: inAppType,
        title,
        body,
        is_read: false,
      });
    } catch { /* best-effort */ }
  }

  if (!accessToken) return; // Can't call API routes without auth

  // ─── Email ────────────────────────────────────────────────────────────────
  if (channels.email && (recipientUserId || data.email)) {
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
  if (channels.sms && smsTemplate && (recipientPhone || recipientUserId)) {
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
  if (channels.whatsapp && whatsappType && (recipientPhone || recipientUserId)) {
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
 * For each recipient, fires all enabled channels.
 * All fire-and-forget. Uses batched in-app inserts.
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

  // ─── Batch In-App ─────────────────────────────────────────────────────────
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
          is_read: false,
        }));
      for (let i = 0; i < rows.length; i += 50) {
        await supabase.from("notifications").insert(rows.slice(i, i + 50));
      }
    } catch { /* best-effort */ }
  }

  if (!accessToken) return;

  // ─── Per-recipient external channels ──────────────────────────────────────
  for (const r of recipients) {
    const to = r.phone || r.userId;
    if (!to) continue;

    if (params.channels.email && r.userId) {
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

    if (params.channels.sms && params.smsTemplate) {
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

    if (params.channels.whatsapp && params.whatsappType) {
      try {
        fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            to,
            type: params.whatsappType,
            data: params.data,
            locale: params.locale || "en",
          }),
        }).catch(() => {});
      } catch { /* best-effort */ }
    }
  }
}
