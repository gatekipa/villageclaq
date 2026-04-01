/**
 * Notification channel preference checker.
 * Reads member-level preferences from profiles.notification_preferences
 * to determine which channels (in_app, email, sms, whatsapp) should fire.
 *
 * Usage in notification senders:
 *   const channels = await getEnabledChannels(supabase, userId, "payment_reminders", groupId);
 *   if (channels.email) { ... send email ... }
 *   if (channels.whatsapp) { ... send whatsapp ... }
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type NotificationChannel = "in_app" | "email" | "sms" | "whatsapp" | "push";

export type NotificationTypeKey =
  | "payment_reminders"
  | "event_reminders"
  | "minutes_published"
  | "relief_updates"
  | "standing_changes"
  | "announcements"
  | "hosting_reminders"
  | "new_member";

/** Default channel states when user has no saved preferences */
const DEFAULT_CHANNELS: Record<NotificationChannel, boolean> = {
  in_app: true,
  email: true,
  sms: false,
  whatsapp: false,
  push: false,
};

/** Default per-type channel matrix */
const DEFAULT_TYPE_PREFS: Record<NotificationTypeKey, Record<NotificationChannel, boolean>> = {
  payment_reminders: { in_app: true, email: true, sms: false, whatsapp: false, push: true },
  event_reminders: { in_app: true, email: true, sms: false, whatsapp: false, push: true },
  minutes_published: { in_app: true, email: true, sms: false, whatsapp: false, push: false },
  relief_updates: { in_app: true, email: true, sms: false, whatsapp: false, push: true },
  standing_changes: { in_app: true, email: true, sms: false, whatsapp: false, push: false },
  announcements: { in_app: true, email: true, sms: false, whatsapp: false, push: true },
  hosting_reminders: { in_app: true, email: true, sms: false, whatsapp: false, push: true },
  new_member: { in_app: true, email: false, sms: false, whatsapp: false, push: false },
};

export interface EnabledChannels {
  in_app: boolean;
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
  push: boolean;
}

/**
 * Fetch the member's notification preferences and return which channels
 * are enabled for a given notification type.
 *
 * Logic:
 * 1. Read profiles.notification_preferences
 * 2. Check global channel toggles (e.g., user disabled email entirely)
 * 3. Check per-type toggles (e.g., user disabled email for payment_reminders)
 * 4. Check muted_groups (if groupId provided and group is muted → only in_app)
 * 5. in_app is always true (cannot be disabled)
 *
 * If userId is null (proxy member), returns defaults with only in_app enabled.
 * NEVER throws — returns defaults on error.
 */
export async function getEnabledChannels(
  supabase: SupabaseClient,
  userId: string | null,
  notificationType: NotificationTypeKey,
  groupId?: string,
): Promise<EnabledChannels> {
  // Proxy members (no user account) only get external channels, not in-app
  if (!userId) {
    return { in_app: false, email: false, sms: false, whatsapp: true, push: false };
  }

  try {
    const { data } = await supabase
      .from("profiles")
      .select("notification_preferences")
      .eq("id", userId)
      .single();

    const prefs = (data?.notification_preferences as Record<string, unknown>) || {};

    // Global channel toggles
    const globalChannels: Record<NotificationChannel, boolean> = {
      ...DEFAULT_CHANNELS,
      ...((prefs.channels as Record<string, boolean>) || {}),
    };
    // in_app is always on
    globalChannels.in_app = true;

    // Per-type toggles
    const savedTypes = (prefs.types as Record<string, Record<string, boolean>>) || {};
    const typePrefs: Record<NotificationChannel, boolean> = {
      ...DEFAULT_TYPE_PREFS[notificationType],
      ...(savedTypes[notificationType] || {}),
    };

    // Combine: channel must be enabled globally AND for this notification type
    const result: EnabledChannels = {
      in_app: true, // always on
      email: globalChannels.email && typePrefs.email,
      sms: globalChannels.sms && typePrefs.sms,
      whatsapp: globalChannels.whatsapp && typePrefs.whatsapp,
      push: globalChannels.push && typePrefs.push,
    };

    // Check muted groups
    if (groupId && Array.isArray(prefs.muted_groups)) {
      const muted = (prefs.muted_groups as string[]).includes(groupId);
      if (muted) {
        // Muted group → only in-app notifications
        return { in_app: true, email: false, sms: false, whatsapp: false, push: false };
      }
    }

    return result;
  } catch {
    // On error, return safe defaults
    return { in_app: true, email: true, sms: false, whatsapp: false, push: false };
  }
}

/**
 * Lightweight check for a single channel — useful in fire-and-forget contexts.
 */
export async function isChannelEnabled(
  supabase: SupabaseClient,
  userId: string | null,
  channel: NotificationChannel,
  notificationType: NotificationTypeKey,
  groupId?: string,
): Promise<boolean> {
  const channels = await getEnabledChannels(supabase, userId, notificationType, groupId);
  return channels[channel];
}
