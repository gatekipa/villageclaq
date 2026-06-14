/* DORMANT — Build 8 "prepared, not cutover". This reader is written and tested
 * but is NOT imported by any component/route yet. It is the evidence-backed
 * counts source the FUTURE history UI will bind to (replacing the Build-7
 * derived "published"/"published + sent" labels) once 00106 + 00107 are applied
 * and the producer/drain/webhook are live-wired. Until then the UI keeps the
 * Build-7 honest labels. See docs/announcements-whatsapp-strategy.md.
 *
 * Privacy: the return shape is COUNTS ONLY. No provider_message_id, no phone,
 * no member identity ever leaves this function — those columns are never
 * selected.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnnouncementChannel } from "@/lib/announcement-producer";
import type { AnnouncementDeliveryStatus } from "@/lib/announcement-delivery-status-mapping";

export type ChannelDeliveryRollup = {
  in_app_published: number;
  queued: number;
  sent_to_provider: number;
  delivered: number;
  read: number;
  failed: number;
  blocked_by_policy: number;
  unavailable: number;
  skipped: number;
  total: number;
};

export type AnnouncementDeliveryRollup = Record<AnnouncementChannel, ChannelDeliveryRollup>;

function emptyChannelRollup(): ChannelDeliveryRollup {
  return {
    in_app_published: 0,
    queued: 0,
    sent_to_provider: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    blocked_by_policy: 0,
    unavailable: 0,
    skipped: 0,
    total: 0,
  };
}

/** Fold one delivery status into a channel rollup. Pure + exported for tests. */
export function foldDeliveryStatus(
  rollup: ChannelDeliveryRollup,
  status: AnnouncementDeliveryStatus,
  count: number,
): void {
  rollup.total += count;
  switch (status) {
    case "in_app_published":
      rollup.in_app_published += count;
      break;
    case "queued":
      rollup.queued += count;
      break;
    case "sent":
    case "sent_to_provider":
      rollup.sent_to_provider += count;
      break;
    case "delivered":
      rollup.delivered += count;
      break;
    case "read":
      rollup.read += count;
      break;
    case "failed":
      rollup.failed += count;
      break;
    case "blocked_by_policy":
      rollup.blocked_by_policy += count;
      break;
    case "unavailable":
      rollup.unavailable += count;
      break;
    case "skipped_no_recipient":
    case "skipped_channel_disabled":
      rollup.skipped += count;
      break;
    default:
      // "pending" and any unknown: count in total only.
      break;
  }
}

function emptyRollup(): AnnouncementDeliveryRollup {
  return {
    in_app: emptyChannelRollup(),
    email: emptyChannelRollup(),
    sms: emptyChannelRollup(),
    whatsapp: emptyChannelRollup(),
  };
}

/**
 * Read the evidence-backed per-channel delivery rollup for one announcement,
 * group-scoped. Returns COUNTS only. Safe to render the moment per-recipient
 * rows exist — `delivered`/`failed` are only ever non-zero when a provider
 * webhook proved them (the producer never writes those states).
 */
export async function getAnnouncementDeliveryRollup(
  supabase: SupabaseClient,
  announcementId: string,
  groupId: string,
): Promise<AnnouncementDeliveryRollup> {
  const rollup = emptyRollup();
  if (!announcementId || !groupId) return rollup;

  const { data, error } = await supabase
    .from("announcement_deliveries")
    .select("channel,status")
    .eq("announcement_id", announcementId)
    .eq("group_id", groupId);

  if (error || !data) return rollup;

  for (const row of data as Array<{ channel: AnnouncementChannel; status: AnnouncementDeliveryStatus }>) {
    if (!rollup[row.channel]) continue;
    foldDeliveryStatus(rollup[row.channel], row.status, 1);
  }
  return rollup;
}
