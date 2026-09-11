import { maskPhoneNumber } from "@/lib/mask-phone";

interface SendSMSParams {
  to: string;
  message: string;
}

/**
 * Private Africa's Talking transport.
 * After Cut 2 this function MUST NOT INSERT into notifications_queue.
 * Callers: trusted drain (and leftover server renderers). Not a browser API.
 * Safe to call fire-and-forget — never throws.
 */
export async function sendSMS({ to, message }: SendSMSParams): Promise<{ sent: boolean; queued: boolean; error?: string }> {
  const apiKey = process.env.AFRICASTALKING_API_KEY;
  const username = process.env.AFRICASTALKING_USERNAME || "villageclaq";

  console.log("[SMS DIAG] sendSMS called", {
    to: maskPhoneNumber(to),
    messageLength: message.length,
    hasApiKey: !!apiKey,
    username,
  });

  if (!apiKey) {
    console.log("[SMS DIAG] AFRICASTALKING_API_KEY not configured — Cut 2 does not queue");
    return { sent: false, queued: false, error: "AFRICASTALKING_API_KEY not configured" };
  }

  try {
    const AfricasTalking = (await import("africastalking")).default;
    const at = AfricasTalking({ apiKey, username });
    const senderId = process.env.AFRICASTALKING_SENDER_ID;
    const smsPayload: { to: string[]; message: string; from?: string } = { to: [to], message };
    if (senderId) smsPayload.from = senderId;

    console.log("[SMS DIAG] Calling Africa's Talking SDK", {
      to: maskPhoneNumber(to),
      senderId: senderId || "(default shortcode)",
      username,
    });
    const response = await at.SMS.send(smsPayload);

    const msgData = (response as Record<string, unknown>)?.SMSMessageData as Record<string, unknown> | undefined;
    const recipients = (msgData?.Recipients as Array<Record<string, unknown>>) || [];
    console.log("[SMS DIAG] Africa's Talking response", {
      message: (msgData?.Message as string) || null,
      recipients: recipients.map((r) => ({
        number: maskPhoneNumber(r.number as string),
        statusCode: r.statusCode,
        status: r.status,
      })),
    });
    const firstStatus = recipients[0]?.statusCode as number | undefined;
    if (firstStatus && firstStatus !== 101) {
      const statusMsg = (recipients[0]?.status as string) || "Unknown status";
      console.warn(`[SMS DIAG] AT returned non-success status ${firstStatus} for ${maskPhoneNumber(to)}: ${statusMsg}`);
    } else {
      console.log("[SMS DIAG] AT success — status 101 (sent to carrier)", { to: maskPhoneNumber(to) });
    }
    return { sent: true, queued: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown SMS error";
    console.error(`[SMS DIAG] Africa's Talking SDK EXCEPTION for ${maskPhoneNumber(to)}:`, msg);
    return { sent: false, queued: false, error: msg };
  }
}
