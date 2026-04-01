import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendWhatsAppMessage, sendWhatsAppText } from "@/lib/send-whatsapp";
import { dispatchWhatsApp, type WhatsAppNotificationType } from "@/lib/whatsapp-dispatcher";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * POST /api/whatsapp/send
 * Send a WhatsApp message via Meta Cloud API.
 * Auth: Bearer token (user JWT) — validates caller is authenticated.
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

    // Route 1: Typed dispatch (recommended)
    if (type) {
      const success = await dispatchWhatsApp(
        type as WhatsAppNotificationType,
        recipientPhone,
        locale || language || "en",
        data || {},
      );
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
