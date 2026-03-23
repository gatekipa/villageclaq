import { createClient } from '@/lib/supabase/server';

// ─── Enums ───────────────────────────────────────────────────────────────────

export enum NotificationType {
  PAYMENT_REMINDERS = 'payment_reminders',
  EVENT_REMINDERS = 'event_reminders',
  MINUTES_PUBLISHED = 'minutes_published',
  RELIEF_UPDATES = 'relief_updates',
  STANDING_CHANGES = 'standing_changes',
  ANNOUNCEMENTS = 'announcements',
  HOSTING_REMINDERS = 'hosting_reminders',
  NEW_MEMBER = 'new_member',
}

export enum NotificationChannel {
  IN_APP = 'in_app',
  EMAIL = 'email',
  SMS = 'sms',
  WHATSAPP = 'whatsapp',
  PUSH = 'push',
}

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface SendNotificationParams {
  userId: string;
  groupId: string;
  type: NotificationType;
  title: string;
  titleFr: string;
  body: string;
  bodyFr: string;
  data?: Record<string, unknown>;
  channels?: NotificationChannel[];
}

interface NotificationPreferences {
  email_enabled: boolean;
  sms_enabled: boolean;
  whatsapp_enabled: boolean;
  push_enabled: boolean;
  quiet_hours_start: string | null; // HH:mm format
  quiet_hours_end: string | null;   // HH:mm format
  muted_groups: string[];           // array of group UUIDs
  disabled_types: string[];         // array of NotificationType values
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  email_enabled: true,
  sms_enabled: false,
  whatsapp_enabled: false,
  push_enabled: false,
  quiet_hours_start: null,
  quiet_hours_end: null,
  muted_groups: [],
  disabled_types: [],
};

// ─── Quiet Hours Check ──────────────────────────────────────────────────────

function isInQuietHours(
  start: string | null,
  end: string | null
): boolean {
  if (!start || !end) return false;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  // Handle overnight quiet hours (e.g., 22:00 - 07:00)
  if (startMinutes > endMinutes) {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

// ─── Channel Senders (stubs) ────────────────────────────────────────────────

async function sendEmail(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  // TODO: Integrate with email provider (Resend, SendGrid, etc.)
  // 1. Fetch user's email from profiles table
  // 2. Select the appropriate email template from email-templates.ts
  // 3. Send via email API
  // Stub: email integration pending (Resend/SendGrid)
  void [userId, title, body, data];
}

async function sendSms(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  // TODO: Integrate with SMS provider (Twilio, Africa's Talking, etc.)
  // 1. Fetch user's phone number from profiles table
  // 2. Select the appropriate SMS template from sms-templates.ts
  // 3. Send via SMS API
  // Stub: SMS integration pending (Africa's Talking/Twilio)
  void [userId, title, body, data];
}

async function sendWhatsApp(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  // TODO: Integrate with WhatsApp Business API
  // 1. Fetch user's WhatsApp number from profiles table
  // 2. Build message from whatsapp-templates.ts
  // 3. Send via WhatsApp Business API
  // Stub: WhatsApp Business API integration pending
  void [userId, title, body, data];
}

async function sendPush(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  // TODO: Integrate with push notification service (Firebase FCM, OneSignal, etc.)
  // 1. Fetch user's device tokens from push_subscriptions table
  // 2. Build push payload
  // 3. Send via push API
  // Stub: push notification integration pending (FCM/OneSignal)
  void [userId, title, body, data];
}

// ─── Channel Dispatcher ─────────────────────────────────────────────────────

const CHANNEL_SENDERS: Record<
  NotificationChannel,
  (userId: string, title: string, body: string, data?: Record<string, unknown>) => Promise<void>
> = {
  [NotificationChannel.IN_APP]: async () => {
    /* handled separately — always write to DB */
  },
  [NotificationChannel.EMAIL]: sendEmail,
  [NotificationChannel.SMS]: sendSms,
  [NotificationChannel.WHATSAPP]: sendWhatsApp,
  [NotificationChannel.PUSH]: sendPush,
};

// ─── Main Function ──────────────────────────────────────────────────────────

export async function sendNotification(
  params: SendNotificationParams
): Promise<{ success: boolean; skippedReason?: string }> {
  const {
    userId,
    groupId,
    type,
    title,
    titleFr,
    body,
    bodyFr,
    data,
    channels,
  } = params;

  const supabase = await createClient();

  // 1. Fetch user notification preferences
  const { data: profile } = await supabase
    .from('profiles')
    .select('notification_preferences, preferred_locale')
    .eq('id', userId)
    .single();

  const preferences: NotificationPreferences = profile?.notification_preferences
    ? { ...DEFAULT_PREFERENCES, ...profile.notification_preferences }
    : DEFAULT_PREFERENCES;

  const locale: string = profile?.preferred_locale ?? 'en';

  // 2. Check if notification type is disabled by user
  if (preferences.disabled_types.includes(type)) {
    return { success: false, skippedReason: 'notification_type_disabled' };
  }

  // 3. Check if group is muted
  if (preferences.muted_groups.includes(groupId)) {
    return { success: false, skippedReason: 'group_muted' };
  }

  // 4. Check quiet hours
  if (isInQuietHours(preferences.quiet_hours_start, preferences.quiet_hours_end)) {
    // TODO: Queue notification for delivery after quiet hours end
    return { success: false, skippedReason: 'quiet_hours' };
  }

  // 5. Resolve title and body based on user locale
  const localizedTitle = locale === 'fr' ? titleFr : title;
  const localizedBody = locale === 'fr' ? bodyFr : body;

  // 6. Always create an in-app notification record
  const { error: insertError } = await supabase.from('notifications').insert({
    user_id: userId,
    group_id: groupId,
    type,
    title: localizedTitle,
    body: localizedBody,
    data: data ?? {},
    is_read: false,
  });

  if (insertError) {
    console.error('[Notification] Failed to insert in-app notification:', insertError);
  }

  // 7. Determine which channels to send through
  const requestedChannels = channels ?? [
    NotificationChannel.IN_APP,
    NotificationChannel.EMAIL,
    NotificationChannel.PUSH,
  ];

  // 8. Send through each enabled channel
  const channelPromises = requestedChannels
    .filter((channel) => {
      if (channel === NotificationChannel.IN_APP) return false; // already handled above
      if (channel === NotificationChannel.EMAIL && !preferences.email_enabled) return false;
      if (channel === NotificationChannel.SMS && !preferences.sms_enabled) return false;
      if (channel === NotificationChannel.WHATSAPP && !preferences.whatsapp_enabled) return false;
      if (channel === NotificationChannel.PUSH && !preferences.push_enabled) return false;
      return true;
    })
    .map((channel) =>
      CHANNEL_SENDERS[channel](userId, localizedTitle, localizedBody, data).catch((err) => {
        console.error(`[Notification:${channel}] Failed for user ${userId}:`, err);
      })
    );

  await Promise.allSettled(channelPromises);

  return { success: true };
}

// ─── Batch Sender ───────────────────────────────────────────────────────────

export async function sendBulkNotification(
  userIds: string[],
  params: Omit<SendNotificationParams, 'userId'>
): Promise<void> {
  const results = await Promise.allSettled(
    userIds.map((userId) => sendNotification({ ...params, userId }))
  );

  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length > 0) {
    console.error(`[Notification:Bulk] ${failures.length}/${userIds.length} failed`);
  }
}
