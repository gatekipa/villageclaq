/**
 * Client-side in-app notification helper.
 * External email/SMS/WhatsApp go through domain *-notifications routes
 * and the trusted drain. This helper must not call provider relays.
 *
 * In-app is always sent (cannot opt out). External channels are enqueued
 * by domain producers, not this helper.
 *
 * DEEP LINKS: Every in-app notification INSERT includes a `link` field in the `data` JSONB.
 *
 * For server-side notifications (cron jobs, server actions), use getEnabledChannels() directly.
 */

import { createClient } from "@/lib/supabase/client";
import type { NotificationTypeKey } from "@/lib/notification-prefs";

// ─── Deep Link Map ─────────────────────────────────────────────────────────

const NOTIFICATION_DEEP_LINKS: Record<string, string> = {
  contribution_received: "/dashboard/my-payments",
  payment: "/dashboard/my-payments",
  payment_reminder: "/dashboard/my-payments",
  event_reminder: "/dashboard/my-events",
  hosting_reminder: "/dashboard/my-hosting",
  hosting_assignment: "/dashboard/my-hosting",
  minutes_published: "/dashboard/minutes",
  meeting_minutes: "/dashboard/minutes",
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
  /** Locale for bilingual sends (fallback — per-recipient locale wins if localize() is provided) */
  locale?: string;
  /**
   * Optional per-recipient localization callback. When provided, every
   * recipient's notification title/body/data/locale is computed from
   * their own preferred_locale (via member_locale RPC) rather than
   * using the publisher's locale for everyone. Crons use this too.
   *
   *   localize: (locale) => ({
   *     title: locale === "fr" ? "Annonce" : "Announcement",
   *     body:  locale === "fr" ? "…" : "…",
   *     data:  { title, body },  // optional — merged over base data
   *   })
   *
   * If omitted, the static title/body/data/locale are used for all
   * recipients (pre-refactor behaviour).
   */
  localize?: (locale: "en" | "fr") => { title: string; body: string; data?: Record<string, string> };
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
  const deepLink = link || getNotificationLink(inAppType);

  // External channels are domain-route + drain only. This helper keeps
  // in-app inserts. Pref/template/phone args remain accepted for callers.
  void channels.email;
  void channels.sms;
  void channels.whatsapp;
  void emailTemplate;
  void smsTemplate;
  void whatsappType;
  void recipientPhone;
  void prefType;

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
    } catch (err) { console.warn("[Notify:InApp] Insert failed:", err instanceof Error ? err.message : err); }
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
  const deepLink = params.link || getNotificationLink(params.inAppType || "system");

  // ─── Resolve per-recipient locale (G6) ───────────────────────────────────
  // When params.localize is provided, look up each recipient's
  // preferred_locale via the member_locale SECURITY DEFINER RPC and use
  // it to render that recipient's title/body/data. Falls back to
  // params.locale (publisher's locale) for rows with no user_id.
  const recipientLocales = new Map<string, "en" | "fr">();
  if (params.localize) {
    const uids = Array.from(new Set(recipients.map((r) => r.userId).filter(Boolean) as string[]));
    await Promise.all(
      uids.map(async (uid) => {
        try {
          const { data } = await supabase.rpc("member_locale", { p_user_id: uid });
          const loc = (typeof data === "string" ? data : "en") as string;
          recipientLocales.set(uid, loc === "fr" ? "fr" : "en");
        } catch {
          recipientLocales.set(uid, "en");
        }
      }),
    );
  }
  const fallbackLocale: "en" | "fr" = (params.locale === "fr" ? "fr" : "en");
  const renderFor = (userId: string | null | undefined) => {
    const loc: "en" | "fr" = userId ? (recipientLocales.get(userId) || fallbackLocale) : fallbackLocale;
    if (params.localize) {
      const out = params.localize(loc);
      return {
        locale: loc,
        title: out.title,
        body: out.body,
        data: { ...params.data, ...(out.data || {}) },
      };
    }
    return { locale: loc, title: params.title, body: params.body, data: params.data };
  };

  // ─── Batch In-App (always sent) ──────────────────────────────────────────
  if (params.channels.inApp) {
    try {
      const rows = recipients
        .filter((r) => r.userId)
        .map((r) => {
          const rendered = renderFor(r.userId);
          return {
            user_id: r.userId!,
            group_id: params.groupId,
            type: params.inAppType || "system",
            title: rendered.title,
            body: rendered.body,
            data: { link: deepLink },
            is_read: false,
          };
        });
      for (let i = 0; i < rows.length; i += 50) {
        await supabase.from("notifications").insert(rows.slice(i, i + 50));
      }
    } catch (err) { console.warn("[NotifyBulk:InApp] Batch insert failed:", err instanceof Error ? err.message : err); }
  }

  void params.channels.email;
  void params.channels.sms;
  void params.channels.whatsapp;
  void params.prefType;
  void params.emailTemplate;
}
