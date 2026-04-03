import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendWhatsAppMessage, sendWhatsAppText } from "@/lib/send-whatsapp";
import { dispatchWhatsApp, type WhatsAppNotificationType } from "@/lib/whatsapp-dispatcher";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ─── Rate Limiter (in-memory sliding window) ─────────────────────────────────
// Conservative: 50 msg/sec — well under Meta's 80/sec standard tier limit.
// Overflow is queued to notifications_queue for the drain worker.

const RATE_LIMIT_MAX = 50;
const RATE_LIMIT_WINDOW_MS = 1000;
const sendTimestamps: number[] = [];

function acquireRateSlot(): boolean {
  const now = Date.now();
  // Purge timestamps outside the window
  while (sendTimestamps.length > 0 && now - sendTimestamps[0] >= RATE_LIMIT_WINDOW_MS) {
    sendTimestamps.shift();
  }
  if (sendTimestamps.length >= RATE_LIMIT_MAX) {
    return false; // Rate limited
  }
  sendTimestamps.push(now);
  return true;
}

/**
 * Queue a WhatsApp message to notifications_queue for the drain worker.
 * Returns true if queued successfully.
 */
async function queueWhatsAppMessage(
  recipient: string,
  params: Record<string, unknown>,
): Promise<boolean> {
  if (!supabaseServiceKey) return false;
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    await supabase.from("notifications_queue").insert({
      channel: "whatsapp",
      template: (params.type as string) || (params.template as string) || "generic",
      data: {
        recipient,
        whatsappType: params.type || undefined,
        whatsappData: params.data || {},
        template: params.template || undefined,
        language: params.locale || params.language || "en",
        components: params.components || undefined,
        locale: params.locale || params.language || "en",
      },
      status: "queued",
    });
    return true;
  } catch (err) {
    console.warn("[WhatsApp] Failed to queue message:", err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * POST /api/whatsapp/send
 * Send a WhatsApp message via Meta Cloud API.
 * Auth: Bearer token (user JWT) — validates caller is authenticated.
 *
 * Rate limited: 50 messages/second. Overflow queued to notifications_queue.
 *
 * Body options:
 * 1. Template message: { to, type, data, locale }
 *    - type: WhatsAppNotificationType (e.g., "payment_receipt")
 *    - data: Record<string, string> template parameters
 * 2. Direct template: { to, template, language, components }
 * 3. Text message: { to, text } (within 24h window only)
 *
 * "to" can be a phone number OR a user UUID (resolved from profiles).
 */
export async function POST(request: Request) {
  try {
    // Verify caller is authenticated
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(
      supabaseUrl,
      supabaseServiceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await request.json();
    const { to, type, template, language, components, text, data, locale } = body;

    if (!to) {
      return NextResponse.json({ error: "Missing required field: to" }, { status: 400 });
    }

    // Resolve UUID → phone if needed
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let recipientPhone: string = to;

    if (UUID_REGEX.test(to)) {
      if (!supabaseServiceKey) {
        return NextResponse.json(
          { success: false, error: "Service role key not configured" },
          { status: 500 },
        );
      }
      const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
      const { data: profile } = await serviceClient
        .from("profiles")
        .select("phone")
        .eq("id", to)
        .single();

      if (!profile?.phone) {
        return NextResponse.json(
          { success: false, error: "No phone number found for user" },
          { status: 400 },
        );
      }
      recipientPhone = profile.phone;
    }

    // ── Rate limit check ──
    if (!acquireRateSlot()) {
      // Over rate limit — queue for drain worker
      console.warn(`[WhatsApp] Rate limited — queuing message to ${recipientPhone}`);
      const queued = await queueWhatsAppMessage(recipientPhone, body);
      return NextResponse.json({ success: true, queued: true, sent: false, rateLimited: true }, { status: queued ? 202 : 429 });
    }

    // Route 1: Typed dispatch (recommended)
    if (type) {
      const success = await dispatchWhatsApp(
        type as WhatsAppNotificationType,
        recipientPhone,
        locale || language || "en",
        data || {},
      );

      // If Meta returns rate limit error, queue for retry
      if (!success) {
        const queued = await queueWhatsAppMessage(recipientPhone, body);
        if (queued) {
          return NextResponse.json({ success: true, queued: true, sent: false });
        }
      }

      return NextResponse.json({ success });
    }

    // Route 2: Direct template
    if (template) {
      const result = await sendWhatsAppMessage({
        to: recipientPhone,
        template,
        language: language || locale || "en",
        components,
      });

      // If failed, queue for retry
      if (!result.success) {
        const queued = await queueWhatsAppMessage(recipientPhone, body);
        if (queued) {
          return NextResponse.json({ success: true, queued: true, sent: false, error: result.error });
        }
      }

      return NextResponse.json({
        success: result.success,
        messageId: result.messageId,
        error: result.error,
      });
    }

    // Route 3: Text message (24h window)
    if (text) {
      const result = await sendWhatsAppText(recipientPhone, text);
      return NextResponse.json({
        success: result.success,
        messageId: result.messageId,
        error: result.error,
      });
    }

    return NextResponse.json(
      { error: "Must provide type, template, or text" },
      { status: 400 },
    );
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
