import { createClient } from "@/lib/supabase/server";

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

/**
 * Send email via Resend API.
 * If RESEND_API_KEY is not configured, queues the email in notifications_queue.
 */
export async function sendEmail({ to, subject, html }: SendEmailParams): Promise<{ sent: boolean; queued: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    await queueNotification("email", to, { subject, html });
    return { sent: false, queued: true };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: "VillageClaq <noreply@villageclaq.com>",
      to,
      subject,
      html,
    });
    return { sent: true, queued: false };
  } catch {
    await queueNotification("email", to, { subject, html });
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
