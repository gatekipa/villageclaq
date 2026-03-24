import { createClient } from "@/lib/supabase/server";

interface SendPushParams {
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
  title: string;
  body: string;
  url?: string;
}

/**
 * Send web push notification via Web Push API.
 * If VAPID keys are not configured, queues the notification in notifications_queue.
 */
export async function sendPush({ subscription, title, body, url }: SendPushParams): Promise<{ sent: boolean; queued: boolean }> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    await queueNotification("push", subscription.endpoint, { title, body, url });
    return { sent: false, queued: true };
  }

  try {
    const webpush = await import("web-push");
    webpush.setVapidDetails("mailto:support@villageclaq.com", publicKey, privateKey);

    await webpush.sendNotification(
      subscription,
      JSON.stringify({ title, body, url: url || "/dashboard" })
    );

    return { sent: true, queued: false };
  } catch {
    await queueNotification("push", subscription.endpoint, { title, body, url });
    return { sent: false, queued: true };
  }
}

async function queueNotification(channel: string, recipient: string, data: Record<string, unknown>) {
  const supabase = await createClient();
  await supabase.from("notifications_queue").insert({
    channel,
    template: "generic",
    data: { recipient, ...data },
    status: "queued",
  });
}
