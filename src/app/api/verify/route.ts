import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * GET /api/verify?id=<membership_id>
 * Public endpoint — no auth required.
 * Returns limited membership data for QR code verification.
 * Uses service role to bypass RLS.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const membershipId = searchParams.get("id");

  if (!membershipId) {
    return NextResponse.json({ error: "Missing membership ID" }, { status: 400 });
  }

  // Basic UUID validation
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(membershipId)) {
    return NextResponse.json({ error: "Invalid membership ID" }, { status: 400 });
  }

  if (!supabaseServiceKey) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: membership, error } = await supabase
    .from("memberships")
    .select(
      "display_name, standing, role, joined_at, is_proxy, " +
      "profiles:profiles!memberships_user_id_fkey(full_name, display_name, avatar_url), " +
      "groups:groups!memberships_group_id_fkey(name)"
    )
    .eq("id", membershipId)
    .single();

  if (error || !membership) {
    return NextResponse.json({ error: "Membership not found" }, { status: 404 });
  }

  const m = membership as unknown as Record<string, unknown>;
  const profileRaw = m.profiles;
  const groupRaw = m.groups;
  const profile = (Array.isArray(profileRaw) ? profileRaw[0] : profileRaw) as Record<string, unknown> | null;
  const group = (Array.isArray(groupRaw) ? groupRaw[0] : groupRaw) as Record<string, unknown> | null;

  // Public QR verifier response. We deliberately expose only the
  // minimum a door-scanner needs: whether this card represents a real
  // member and whether they are currently in good standing. Role is
  // omitted — it leaks group governance information to anyone who
  // scans a card without adding anything a door-scanner actually
  // needs. Standing is normalised to good/at_risk/suspended so the
  // scanner UI can colour-code without seeing internal enum values.
  const rawStanding = (m.standing as string | null) || "good";
  const standing =
    rawStanding === "good" || rawStanding === "warning" || rawStanding === "suspended" || rawStanding === "banned"
      ? rawStanding
      : "good";
  const verified = standing === "good";
  return NextResponse.json({
    verified,
    memberName:
      m.display_name ||
      profile?.full_name ||
      profile?.display_name ||
      "Member",
    groupName: group?.name || "Group",
    standing,
    joinedAt: m.joined_at,
    avatarUrl: profile?.avatar_url || null,
  });
}
