/**
 * Announcement delivery-status model + provider→delivery mapping (Build 8).
 *
 * DORMANT — Build 8 is "prepared, not cutover". This module is pure (no I/O,
 * never sends anything) and is NOT imported by any route/cron/component/webhook
 * yet. It is the evidence-grounded status vocabulary the announcement producer
 * (src/lib/announcement-producer.ts) and the future webhook/drain wiring will
 * use ONCE migrations 00106 + 00107 are applied. See
 * docs/announcements-whatsapp-strategy.md (Build 8 cutover checklist).
 *
 * Honesty rule: a status is only ever set when the system can PROVE it.
 *   - in_app_published : the in-app notification row was inserted (atomic DB
 *                        proof). Terminal; no webhook ever changes it.
 *   - queued           : a notifications_queue row exists (work enqueued). NOT sent.
 *   - sent_to_provider : the drain got a provider message id (Meta accepted).
 *                        Acceptance is NOT delivery.
 *   - delivered / read : a provider webhook confirmed delivery/read.
 *   - failed           : a provider/queue failure (non-131049).
 *   - blocked_by_policy: Meta error 131049 (MARKETING template not delivered to
 *                        US +1 numbers) — mapped specifically, never generic
 *                        "failed", so admins see the real reason.
 *   - unavailable / skipped_* : producer-time classification (no recipient,
 *                        channel disabled) — never enqueued, never "sent".
 */

export type AnnouncementDeliveryStatus =
  // pre-existing delivery_status enum values (00008)
  | "pending"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  // values added by migration 00107 (create-not-apply)
  | "queued"
  | "sent_to_provider"
  | "in_app_published"
  | "blocked_by_policy"
  | "unavailable"
  | "skipped_no_recipient"
  | "skipped_channel_disabled";

/** Meta error code: MARKETING-category template not delivered to US (+1). */
export const WHATSAPP_US_MARKETING_BLOCK_CODE = "131049";

/**
 * Map a WhatsApp provider/webhook status (+ optional error code) to an
 * announcement delivery status. Pure — proves nothing it isn't told.
 *   - 131049            -> blocked_by_policy (US MARKETING block; specific reason)
 *   - "sent"            -> sent_to_provider  (accepted, NOT delivered)
 *   - "delivered"       -> delivered
 *   - "read"            -> read
 *   - "failed"          -> failed
 *   - anything else     -> unavailable       (never silently "delivered")
 */
export function mapWhatsAppStatusToDeliveryStatus(
  providerStatus: string | null | undefined,
  errorCode?: string | number | null,
): AnnouncementDeliveryStatus {
  if (errorCode != null && String(errorCode) === WHATSAPP_US_MARKETING_BLOCK_CODE) {
    return "blocked_by_policy";
  }
  switch (providerStatus) {
    case "sent":
      return "sent_to_provider";
    case "delivered":
      return "delivered";
    case "read":
      return "read";
    case "failed":
      return "failed";
    default:
      return "unavailable";
  }
}

const TERMINAL_STATUSES = new Set<AnnouncementDeliveryStatus>([
  "delivered",
  "read",
  "failed",
  "blocked_by_policy",
  "unavailable",
  "skipped_no_recipient",
  "skipped_channel_disabled",
  "in_app_published",
]);

/** A status that no further event will change. */
export function deliveryStatusIsTerminal(status: AnnouncementDeliveryStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/** Statuses that may ONLY be set from provider/webhook evidence (never derived). */
export function deliveryStatusRequiresProviderEvidence(status: AnnouncementDeliveryStatus): boolean {
  return (
    status === "delivered" ||
    status === "read" ||
    status === "failed" ||
    status === "blocked_by_policy"
  );
}

/** A successful, evidence-backed delivery (for honest "delivered" counts). */
export function deliveryStatusIsDelivered(status: AnnouncementDeliveryStatus): boolean {
  return status === "delivered" || status === "read";
}
