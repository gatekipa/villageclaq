/* DORMANT — Build 8 "prepared, not cutover". This producer is written and
 * unit-tested but is NOT imported by any route, cron, composer, drain, or
 * webhook. It MUST NOT be live-wired until migrations 00106 + 00107 are applied
 * (the `announcement_deliveries` unique index + the new delivery_status enum
 * values + columns it writes do not exist in production yet, so a live call
 * would throw). See docs/announcements-whatsapp-strategy.md (Build 8 cutover
 * checklist). It performs NO sends itself — it only writes durable
 * announcement_deliveries rows and notifications_queue work rows; the existing
 * drain is what would later send the queued rows. */

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatPhoneForWhatsApp } from "@/lib/format-phone-whatsapp";
import { isAfricanPhoneNumber } from "@/lib/is-african-phone";
import { maskPhoneNumber } from "@/lib/mask-phone";
import { getEnabledChannels, type EnabledChannels } from "@/lib/notification-prefs";
import { WA_TEMPLATES } from "@/lib/whatsapp-templates";
import { isWhatsAppCategoryRestricted } from "@/lib/announcement-channels";
import type { AnnouncementDeliveryStatus } from "@/lib/announcement-delivery-status-mapping";

type Logger = Pick<Console, "log" | "warn">;
type Locale = "en" | "fr";

/** The four announcement channels, in deterministic order. */
const ANNOUNCEMENT_CHANNELS = ["in_app", "email", "sms", "whatsapp"] as const;
export type AnnouncementChannel = (typeof ANNOUNCEMENT_CHANNELS)[number];

/** Channels that flow through notifications_queue + the drain (NOT in_app). */
const EXTERNAL_CHANNELS = new Set<AnnouncementChannel>(["email", "sms", "whatsapp"]);

type AnnouncementRow = {
  id: string;
  group_id: string;
  title: string | null;
  title_fr: string | null;
  content: string | null;
  content_fr: string | null;
  channels: unknown;
  audience: Record<string, unknown> | null;
  sent_at: string | null;
};

type ProfileEmbed = { full_name: string | null; phone: string | null; preferred_locale: string | null };

type MembershipRow = {
  id: string;
  user_id: string | null;
  role: string | null;
  display_name: string | null;
  is_proxy: boolean | null;
  standing: string | null;
  privacy_settings: Record<string, unknown> | null;
  // Supabase types an embedded to-one relation as an array; normalize via
  // firstProfile().
  profiles?: ProfileEmbed | ProfileEmbed[] | null;
};

/** Supabase returns the embedded profiles relation as an array — take the first. */
function firstProfile(m: MembershipRow): ProfileEmbed | null {
  const p = m.profiles;
  if (Array.isArray(p)) return p[0] ?? null;
  return p ?? null;
}

export type PerChannelTally = {
  in_app_published: number;
  queued: number;
  skipped_channel_disabled: number;
  skipped_no_recipient: number;
  unavailable: number;
  blocked_by_policy: number;
  duplicate: number;
};

export type AnnouncementProducerResult = {
  status: "produced" | "skipped" | "error";
  reason?: string;
  announcementId: string;
  recipientCount: number;
  deliveryRowsCreated: number;
  queueRowsCreated: number;
  perChannel: Record<AnnouncementChannel, PerChannelTally>;
};

export type AnnouncementProducerOptions = {
  locale?: string;
  logger?: Logger;
  getChannels?: (
    supabase: SupabaseClient,
    userId: string | null,
    notificationType: "announcements",
    groupId?: string,
  ) => Promise<EnabledChannels>;
};

function shortId(id: string | null | undefined): string {
  return id ? `${id.slice(0, 8)}...` : "(missing)";
}

function asLocale(value: string | null | undefined): Locale {
  return value === "fr" ? "fr" : "en";
}

function emptyTally(): PerChannelTally {
  return {
    in_app_published: 0,
    queued: 0,
    skipped_channel_disabled: 0,
    skipped_no_recipient: 0,
    unavailable: 0,
    blocked_by_policy: 0,
    duplicate: 0,
  };
}

/**
 * Pure classification: given a channel, the recipient's enabled channels, and
 * their resolved phone, decide the honest delivery status and whether the row
 * should be enqueued for actual sending. This NEVER returns a "sent"/"delivered"
 * state — those only ever come from provider evidence later.
 */
export function classifyChannelForRecipient(
  channel: AnnouncementChannel,
  enabled: EnabledChannels,
  phone: string | null,
): { status: AnnouncementDeliveryStatus; enqueue: boolean } {
  if (channel === "in_app") {
    // In-app is always-on and is an atomic DB insert → provably published.
    // Terminal; never enqueued (no provider involved).
    return { status: "in_app_published", enqueue: false };
  }

  if (channel === "email") {
    if (!enabled.email) return { status: "skipped_channel_disabled", enqueue: false };
    // Email needs no phone; an address is resolved at drain time. Best-effort.
    return { status: "queued", enqueue: true };
  }

  if (channel === "sms") {
    if (!enabled.sms) return { status: "skipped_channel_disabled", enqueue: false };
    if (!phone) return { status: "skipped_no_recipient", enqueue: false };
    // SMS (Africa's Talking) only reaches African numbers — others are
    // unavailable, never silently "sent".
    if (!isAfricanPhoneNumber(phone)) return { status: "unavailable", enqueue: false };
    return { status: "queued", enqueue: true };
  }

  // whatsapp
  if (!enabled.whatsapp) return { status: "skipped_channel_disabled", enqueue: false };
  if (!phone || !formatPhoneForWhatsApp(phone)) {
    return { status: "skipped_no_recipient", enqueue: false };
  }
  // The announcement template is MARKETING/US-blocked. We still enqueue (the
  // 131049 webhook later maps a US recipient to blocked_by_policy — honest, not
  // a false "sent"). isWhatsAppCategoryRestricted() is referenced so the policy
  // stays sourced from the Build-7 truth model; per-recipient US pre-blocking is
  // a documented optional enhancement (FLAG-ONLY), not done here.
  void isWhatsAppCategoryRestricted();
  return { status: "queued", enqueue: true };
}

function resolvePhone(m: MembershipRow): string | null {
  const proxyPhone = (m.privacy_settings?.proxy_phone as string | undefined) || null;
  return firstProfile(m)?.phone || proxyPhone || null;
}

/**
 * Produce per-recipient × per-channel announcement_deliveries rows (the honest
 * delivery ledger) plus notifications_queue work rows for enabled external
 * channels. Idempotent: the (announcement_id, membership_id, channel) unique
 * index (migration 00106) makes a re-run a no-op (23505 → counted as duplicate).
 *
 * In-app rows are terminal `in_app_published` with NO queue row. External rows
 * are `queued` (+ a queue row) only when the recipient's channel is enabled and
 * a recipient identifier exists; otherwise an honest skip/unavailable row is
 * recorded with NO send.
 */
export async function produceAnnouncementDeliveries(
  supabase: SupabaseClient,
  announcementId: string,
  options: AnnouncementProducerOptions = {},
): Promise<AnnouncementProducerResult> {
  const logger = options.logger || console;
  const getChannels = options.getChannels || getEnabledChannels;
  const perChannel = {
    in_app: emptyTally(),
    email: emptyTally(),
    sms: emptyTally(),
    whatsapp: emptyTally(),
  } as Record<AnnouncementChannel, PerChannelTally>;
  const base: AnnouncementProducerResult = {
    status: "produced",
    announcementId,
    recipientCount: 0,
    deliveryRowsCreated: 0,
    queueRowsCreated: 0,
    perChannel,
  };

  if (!announcementId) {
    return { ...base, status: "skipped", reason: "missing_announcement_id" };
  }

  const { data: announcement, error: annErr } = await supabase
    .from("announcements")
    .select("id,group_id,title,title_fr,content,content_fr,channels,audience,sent_at")
    .eq("id", announcementId)
    .maybeSingle<AnnouncementRow>();

  if (annErr) {
    logger.warn("[AnnouncementProducer] announcement lookup failed", { announcementId: shortId(announcementId), error: annErr.message });
    return { ...base, status: "error", reason: "announcement_lookup_failed" };
  }
  if (!announcement) {
    return { ...base, status: "skipped", reason: "announcement_not_found" };
  }

  const groupId = announcement.group_id;
  const selectedChannels = (Array.isArray(announcement.channels) ? announcement.channels : [])
    .filter((c): c is AnnouncementChannel => (ANNOUNCEMENT_CHANNELS as readonly string[]).includes(c as string));
  if (selectedChannels.length === 0) {
    return { ...base, status: "skipped", reason: "no_channels_selected" };
  }

  // Resolve recipients from the audience JSONB, mirroring the existing dispatch:
  // group-scoped, exclude proxies (user_id NULL) and banned members.
  const audience = (announcement.audience as Record<string, unknown>) || { type: "all" };
  const audienceType = (audience.type as string) || "all";
  let query = supabase
    .from("memberships")
    .select("id,user_id,role,display_name,is_proxy,standing,privacy_settings,profiles:profiles!memberships_user_id_fkey(full_name,phone,preferred_locale)")
    .eq("group_id", groupId);
  if (audienceType === "roles") {
    const roles = Array.isArray(audience.roles) ? (audience.roles as string[]) : [];
    if (roles.length === 0) return { ...base, status: "skipped", reason: "no_recipients" };
    query = query.in("role", roles);
  } else if (audienceType === "members") {
    const members = Array.isArray(audience.members) ? (audience.members as string[]) : [];
    if (members.length === 0) return { ...base, status: "skipped", reason: "no_recipients" };
    query = query.in("id", members);
  }

  const { data: rows, error: memberErr } = await query;
  if (memberErr) {
    logger.warn("[AnnouncementProducer] recipient lookup failed", { announcementId: shortId(announcementId), error: memberErr.message });
    return { ...base, status: "error", reason: "recipient_lookup_failed" };
  }

  const recipients = ((rows || []) as MembershipRow[]).filter(
    (m) => m.user_id && m.standing !== "banned",
  );
  if (recipients.length === 0) {
    return { ...base, status: "skipped", reason: "no_recipients" };
  }
  base.recipientCount = recipients.length;

  const groupName = await resolveGroupName(supabase, groupId);

  for (const m of recipients) {
    const userId = m.user_id as string;
    const enabled = await getChannels(supabase, userId, "announcements", groupId);
    const phone = resolvePhone(m);
    const profile = firstProfile(m);
    const locale = asLocale(options.locale || profile?.preferred_locale);

    for (const channel of selectedChannels) {
      const { status, enqueue } = classifyChannelForRecipient(channel, enabled, phone);

      // Idempotency: the (announcement_id, membership_id, channel) unique index
      // (00106) is the anchor. Check-before-insert + catch 23505, exactly like
      // the welcome/payment-receipt producers.
      const { data: existing } = await supabase
        .from("announcement_deliveries")
        .select("id")
        .eq("announcement_id", announcementId)
        .eq("membership_id", m.id)
        .eq("channel", channel)
        .limit(1)
        .maybeSingle();
      if (existing) {
        perChannel[channel].duplicate++;
        continue;
      }

      const nowIso = new Date().toISOString();
      const { error: insertErr } = await supabase.from("announcement_deliveries").insert({
        announcement_id: announcementId,
        group_id: groupId,
        membership_id: m.id,
        channel,
        status,
        queued_at: status === "queued" ? nowIso : null,
        sent_at: status === "in_app_published" ? nowIso : null,
      });
      if (insertErr) {
        if (insertErr.code === "23505") {
          perChannel[channel].duplicate++;
          continue;
        }
        logger.warn("[AnnouncementProducer] delivery row insert failed", {
          announcementId: shortId(announcementId),
          membershipId: shortId(m.id),
          channel,
          error: insertErr.message,
        });
        return { ...base, status: "error", reason: "delivery_insert_failed" };
      }
      base.deliveryRowsCreated++;
      tally(perChannel[channel], status);

      // Only enqueue external work rows for genuinely sendable channels. Skips,
      // blocks and in-app are recorded as delivery rows but NEVER enqueued.
      if (enqueue && EXTERNAL_CHANNELS.has(channel)) {
        const queueChannel = channel; // email | sms | whatsapp
        const { error: queueErr } = await supabase.from("notifications_queue").insert({
          user_id: userId,
          channel: queueChannel,
          template: "announcement",
          status: "queued",
          data: {
            announcementId,
            membershipId: m.id,
            groupId,
            channel,
            recipient: phone,
            user_id: userId,
            whatsappType: "announcement",
            template: WA_TEMPLATES.ANNOUNCEMENT,
            whatsappData: { groupName, title: announcement.title || "", body: (announcement.content || "").slice(0, 200) },
            locale,
            // webhook-match key — populated by the drain when the provider
            // returns a message id; never rendered in any customer UI.
            providerMessageId: null,
          },
        });
        if (queueErr) {
          logger.warn("[AnnouncementProducer] queue insert failed", {
            announcementId: shortId(announcementId),
            membershipId: shortId(m.id),
            channel,
            recipient: maskPhoneNumber(phone || ""),
            error: queueErr.message,
          });
        } else {
          base.queueRowsCreated++;
        }
      }
    }
  }

  logger.log("[AnnouncementProducer] produced announcement deliveries", {
    announcementId: shortId(announcementId),
    recipientCount: base.recipientCount,
    deliveryRowsCreated: base.deliveryRowsCreated,
    queueRowsCreated: base.queueRowsCreated,
  });
  return base;
}

function tally(t: PerChannelTally, status: AnnouncementDeliveryStatus): void {
  switch (status) {
    case "in_app_published":
      t.in_app_published++;
      break;
    case "queued":
      t.queued++;
      break;
    case "skipped_channel_disabled":
      t.skipped_channel_disabled++;
      break;
    case "skipped_no_recipient":
      t.skipped_no_recipient++;
      break;
    case "unavailable":
      t.unavailable++;
      break;
    case "blocked_by_policy":
      t.blocked_by_policy++;
      break;
    default:
      break;
  }
}

async function resolveGroupName(supabase: SupabaseClient, groupId: string): Promise<string> {
  const { data } = await supabase.from("groups").select("name").eq("id", groupId).maybeSingle<{ name: string | null }>();
  return data?.name || "";
}
