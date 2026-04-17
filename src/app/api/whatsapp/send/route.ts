import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendWhatsAppMessage, sendWhatsAppText } from "@/lib/send-whatsapp";
import { dispatchWhatsApp, type WhatsAppNotificationType } from "@/lib/whatsapp-dispatcher";
import { whatsappRateLimit } from "@/lib/api-rate-limit";
import { callerCanMessageTarget, isPlatformStaff } from "@/lib/api-recipient-guard";

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
      console.log("[WA-ROUTE] 401 — missing or invalid Authorization header");
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

    // Per-user rate limit: 50 WhatsApp messages/hour
    const rl = whatsappRateLimit(user.id);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "rate_limited", retryAfterMs: rl.retryAfterMs },
        { status: 429 },
      );
    }

    const body = await request.json();
    const { to, type, template, language, components, text, data, locale } = body;

    // Recipient authorisation: must share a group with target (or be staff).
    if (supabaseServiceKey && to) {
      const adminClient = createClient(supabaseUrl, supabaseServiceKey);
      const callerIsStaff = await isPlatformStaff(adminClient, user.id);
      if (!callerIsStaff) {
        const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const target = UUID.test(to) ? { userId: to as string } : { phone: to as string };
        const allowed = await callerCanMessageTarget(adminClient, user.id, target);
        if (!allowed.allowed) {
          return NextResponse.json(
            { error: "forbidden_recipient", reason: allowed.reason },
            { status: 403 },
          );
        }
      }
    }

    console.log("[WA-ROUTE] to:", to, "type:", type || template || "(text)", "isUUID:", /^[0-9a-f]{8}-/i.test(to || ""));

    if (!to) {
      console.log("[WA-ROUTE] 400 — missing 'to' field");
      return NextResponse.json({ error: "Missing required field: to" }, { status: 400 });
    }

    // Resolve UUID → phone if needed
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let recipientPhone: string = to;

    if (UUID_REGEX.test(to)) {
      if (!supabaseServiceKey) {
        console.log("[WA-ROUTE] 500 — SUPABASE_SERVICE_ROLE_KEY not configured");
        return NextResponse.json(
          { success: false, error: "Service role key not configured" },
          { status: 500 },
        );
      }
      const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

      // 1. Check profiles.phone
      const { data: profile } = await serviceClient
        .from("profiles")
        .select("phone")
        .eq("id", to)
        .single();

      let resolvedPhone = profile?.phone || null;

      // 2. Fallback: check memberships.privacy_settings.proxy_phone
      if (!resolvedPhone) {
        console.log("[WA-ROUTE] profiles.phone is NULL for", to.slice(0, 8), "— checking memberships");
        const { data: memberRows } = await serviceClient
          .from("memberships")
          .select("privacy_settings")
          .eq("user_id", to)
          .limit(5);
        if (memberRows) {
          for (const row of memberRows) {
            const ps = row.privacy_settings as Record<string, unknown> | null;
            const pp = ps?.proxy_phone as string | undefined;
            if (pp) { resolvedPhone = pp; break; }
          }
        }
      }

      // 3. Fallback: check auth.users.phone (for phone-auth signups)
      if (!resolvedPhone) {
        try {
          const { data: { user: authUser } } = await serviceClient.auth.admin.getUserById(to);
          if (authUser?.phone) resolvedPhone = authUser.phone;
        } catch { /* best-effort */ }
      }

      if (!resolvedPhone) {
        console.log("[WA-ROUTE] 400 — UUID", to.slice(0, 8), "has no phone in profiles, memberships, or auth");
        return NextResponse.json(
          { success: false, error: "No phone number found for user" },
          { status: 400 },
        );
      }
      recipientPhone = resolvedPhone;
      console.log("[WA-ROUTE] Resolved UUID to phone:", recipientPhone.slice(0, 6) + "***");
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

    console.log("[WA-ROUTE] 400 — no type, template, or text provided");
    return NextResponse.json(
      { error: "Must provide type, template, or text" },
      { status: 400 },
    );
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
