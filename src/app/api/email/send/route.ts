import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail, type EmailTemplate } from "@/lib/send-email";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    // Verify caller is authenticated via Authorization header
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");

    // Auth client — uses caller's JWT to verify identity
    const supabase = createClient(supabaseUrl, supabaseServiceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await request.json();
    const { to, template, data, locale } = body;

    if (!to || !template) {
      return NextResponse.json(
        { error: "Missing required fields: to, template" },
        { status: 400 }
      );
    }

    // Resolve recipient: if "to" is a UUID, look up the email via RPC
    let recipientEmail: string = to;

    if (UUID_REGEX.test(to)) {
      if (!supabaseServiceKey) {
        return NextResponse.json(
          { success: false, error: "Service role key not configured — cannot resolve user email" },
          { status: 500 }
        );
      }

      // Service role client — bypasses RLS to read auth.users email
      const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
      const { data: emailData, error: rpcError } = await serviceClient
        .rpc("get_user_email", { p_user_id: to });

      if (rpcError || !emailData) {
        return NextResponse.json(
          { success: false, error: `Could not resolve email for user ${to}` },
          { status: 400 }
        );
      }

      recipientEmail = emailData as string;
    }

    const result = await sendEmail({
      to: recipientEmail,
      template: template as EmailTemplate,
      data: data || {},
      locale: locale || "en",
    });

    if (result.success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
