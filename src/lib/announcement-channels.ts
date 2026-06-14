/**
 * Announcement channel-availability + delivery-status TRUTH MODEL (Build 7).
 *
 * Single source of truth the announcement composer, send-confirm dialog, and
 * history UI all reuse so the app never claims more than it can prove:
 *   - which channels are available / limited / category-restricted,
 *   - what an announcement's status honestly is given ONLY the facts we persist
 *     today (`sent_at`, `scheduled_at`, `channels`).
 *
 * Honesty principles encoded here:
 *   - In-app is the safe, always-on channel: an in-app notification is an atomic
 *     DB insert, so it is provably delivered in-app.
 *   - Email / SMS / WhatsApp are dispatched best-effort (fire-and-forget); the
 *     provider accepting a message (returning an id) is NOT proof of delivery,
 *     and we persist no per-recipient delivery state today. So we NEVER render
 *     "delivered" / "sent to provider" for them — only "published + sent
 *     (best-effort, not delivery-confirmed)".
 *   - WhatsApp announcements use villageclaq_announcement_v2, a MARKETING-
 *     categorized template that Meta does NOT deliver to US (+1) numbers
 *     (error 131049, silent at send time). VillageClaq's diaspora is largely
 *     US-based, so WhatsApp is flagged category-restricted and never presented
 *     as guaranteed. See docs/announcements-whatsapp-strategy.md.
 *
 * This module is PURE (no I/O, no imports) so it is unit-testable in isolation
 * and can never accidentally send anything. It returns i18n KEYS (under the
 * `communications` namespace), never user-facing strings.
 *
 * The WhatsApp category fact below mirrors TEMPLATE_METADATA.ANNOUNCEMENT in
 * src/lib/whatsapp-templates.ts; scripts/test-product-announcement-honesty.mjs
 * pins the two consistent so they cannot drift.
 */

export type AnnouncementChannelKey = "in_app" | "email" | "sms" | "whatsapp";

export type ChannelAvailability =
  /** in_app: cannot be turned off; always delivered in-app. */
  | "always_on"
  /** email: selectable, best-effort, delivery not confirmed. */
  | "available"
  /** sms: selectable but only reaches African numbers. */
  | "limited"
  /** whatsapp announcement: MARKETING template, not delivered to US (+1). */
  | "category_restricted";

export interface AnnouncementChannelDescriptor {
  key: AnnouncementChannelKey;
  availability: ChannelAvailability;
  /** false only for in_app (forced on). */
  selectable: boolean;
  /** false for every external channel — acceptance != delivery, none persisted. */
  deliveryConfirmable: boolean;
  /** show an amber/red caution affordance. */
  warn: boolean;
  /** i18n key (communications namespace) explaining the limitation, or null. */
  reasonKey: string | null;
}

/**
 * WhatsApp announcements are category-restricted (MARKETING / US-blocked).
 * Mirrors whatsapp-templates.ts `TEMPLATE_METADATA.ANNOUNCEMENT.usBlocked`.
 */
export const ANNOUNCEMENT_WHATSAPP_CATEGORY_RESTRICTED = true;

export function isWhatsAppCategoryRestricted(): boolean {
  return ANNOUNCEMENT_WHATSAPP_CATEGORY_RESTRICTED;
}

/**
 * The four announcement channels with their honest availability. Static today:
 * we persist no per-recipient country, so we state CATEGORY-level truth
 * ("WhatsApp does not reach US numbers") and never fabricate per-audience
 * counts.
 */
export function getAnnouncementChannelDescriptors(): AnnouncementChannelDescriptor[] {
  return [
    {
      key: "in_app",
      availability: "always_on",
      selectable: false,
      deliveryConfirmable: true,
      warn: false,
      reasonKey: "channelReasonInAppAlwaysOn",
    },
    {
      key: "email",
      availability: "available",
      selectable: true,
      deliveryConfirmable: false,
      warn: false,
      reasonKey: "channelReasonEmailBestEffort",
    },
    {
      key: "sms",
      availability: "limited",
      selectable: true,
      deliveryConfirmable: false,
      warn: false,
      reasonKey: "channelReasonSmsAfricaOnly",
    },
    {
      key: "whatsapp",
      availability: isWhatsAppCategoryRestricted() ? "category_restricted" : "available",
      selectable: true,
      deliveryConfirmable: false,
      warn: isWhatsAppCategoryRestricted(),
      reasonKey: "channelReasonWhatsappUsBlocked",
    },
  ];
}

export function getAnnouncementChannelDescriptor(
  key: AnnouncementChannelKey,
): AnnouncementChannelDescriptor {
  // The list is exhaustive over AnnouncementChannelKey, so find never returns
  // undefined for a valid key; the non-null assertion is safe.
  return getAnnouncementChannelDescriptors().find((d) => d.key === key)!;
}

/** Whether a selected channel set includes any external (non-in-app) channel. */
export function hasExternalChannel(channels: readonly string[]): boolean {
  return channels.some((c) => c === "email" || c === "sms" || c === "whatsapp");
}

export type AnnouncementStatus =
  | "draft"
  | "scheduled"
  | "published"
  | "published_external";

/**
 * Derive the honest status from ONLY the facts we persist. Never returns
 * "delivered"/"failed"/"sent-to-provider" — those require per-recipient
 * tracking that does not exist yet (deferred announcement_deliveries writer).
 *   - no sent_at, no scheduled_at      -> draft
 *   - scheduled_at, no sent_at         -> scheduled
 *   - sent_at, in-app only             -> published (provably delivered in-app)
 *   - sent_at, any external channel    -> published_external (in-app published;
 *                                          external best-effort, not confirmed)
 */
export function deriveAnnouncementStatus(row: {
  sent_at?: string | null;
  scheduled_at?: string | null;
  channels?: unknown;
}): AnnouncementStatus {
  const sentAt = row.sent_at ?? null;
  const scheduledAt = row.scheduled_at ?? null;
  if (!sentAt) return scheduledAt ? "scheduled" : "draft";
  const channels = Array.isArray(row.channels) ? (row.channels as string[]) : [];
  return hasExternalChannel(channels) ? "published_external" : "published";
}

/** i18n key (communications namespace) for a status badge label. */
export function announcementStatusLabelKey(status: AnnouncementStatus): string {
  switch (status) {
    case "draft":
      return "draft";
    case "scheduled":
      return "scheduled";
    case "published":
      return "statusPublished";
    case "published_external":
      return "statusPublishedExternal";
  }
}

/** Audit-log action for an announcement create/send, honest about the state. */
export function announcementAuditAction(opts: {
  asDraft: boolean;
  scheduledForLater: boolean;
}): "announcement.created" | "announcement.scheduled" | "announcement.sent" {
  if (opts.asDraft) return "announcement.created";
  if (opts.scheduledForLater) return "announcement.scheduled";
  return "announcement.sent";
}
