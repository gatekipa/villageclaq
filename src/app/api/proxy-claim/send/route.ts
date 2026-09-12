import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { generateClaimToken } from "@/lib/proxy-claim";
import { enqueueOutboundNotification } from "@/lib/enqueue-outbound-notification";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function dbProxyPhone(membership: {
  phone?: string | null;
  privacy_settings?: Record<string, unknown> | null;
}): string | null {
  const proxy = (membership.privacy_settings?.proxy_phone as string | undefined) || null;
  return proxy || membership.phone || null;
}

/**
 * POST /api/proxy-claim/send
 * ACTIVE owner/admin of the same group only.
 * Target: is_proxy + user_id NULL + active + same group.
 * Contact from memberships only. Enqueue proxy_claim via RPC. No direct provider.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseServiceKey) {
      return NextResponse.json({ error: "Service role key not configured" }, { status: 500 });
    }

    const body = await request.json();
    const { membershipId, email, phone, channels, locale } = body as {
      membershipId: string;
      email?: string;
      phone?: string;
      channels?: string[];
      locale?: string;
    };

    if (!membershipId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const admin = createServiceClient(supabaseUrl, supabaseServiceKey);
    const { data: membership, error: memberErr } = await admin
      .from("memberships")
      .select("id, display_name, user_id, is_proxy, group_id, phone, privacy_settings, membership_status")
      .eq("id", membershipId)
      .maybeSingle();

    if (memberErr || !membership) {
      return NextResponse.json({ error: "Membership not found" }, { status: 404 });
    }

    if (membership.user_id !== null) {
      return NextResponse.json({ error: "Member already has an account" }, { status: 400 });
    }

    if (!membership.is_proxy) {
      return NextResponse.json({ error: "Member is not a proxy member" }, { status: 400 });
    }

    if (membership.membership_status !== "active") {
      return NextResponse.json({ error: "denied", reason: "target_not_active" }, { status: 403 });
    }

    const { data: callerMembership } = await admin
      .from("memberships")
      .select("role, membership_status, group_id")
      .eq("group_id", membership.group_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (
      !callerMembership ||
      callerMembership.group_id !== membership.group_id ||
      callerMembership.membership_status !== "active" ||
      !["owner", "admin"].includes(callerMembership.role)
    ) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const authoritativePhone = dbProxyPhone(membership);
    if (phone && authoritativePhone && phone !== authoritativePhone) {
      // A20: request phone is not authority — use DB.
    }
    if (!authoritativePhone) {
      return NextResponse.json({ error: "denied", reason: "no_db_phone" }, { status: 400 });
    }

    const sendLocale = locale === "fr" || locale === "en" ? locale : null;
    const { claimUrl, expiresAt } = await generateClaimToken(
      membershipId,
      null,
      authoritativePhone,
      user.id,
    );

    const requested = new Set((channels || []).map((c) => String(c)));
    const enqueueChannels = (["whatsapp", "sms"] as const).filter((c) => requested.size === 0 || requested.has(c));

    const results: Record<string, { queued: boolean; result?: string; error?: string }> = {};
    if (requested.has("email")) {
      results.email = { queued: false, result: "denied", error: "proxy_claim_email_deny" };
    }

    for (const channel of enqueueChannels) {
      const enq = await enqueueOutboundNotification(
        {
          notificationType: "proxy_claim",
          domainObjectId: membershipId,
          channel,
          locale: sendLocale,
        },
        admin,
      );
      results[channel] = {
        queued: enq.result === "inserted" || enq.result === "duplicate",
        result: enq.result,
        error: enq.error,
      };
    }

    return NextResponse.json({
      success: true,
      claimUrl,
      expiresAt: expiresAt.toISOString(),
      results,
    });
  } catch (err) {
    console.error("[ProxyClaim:Send] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
