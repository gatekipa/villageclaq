import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPostAuthRedirect, logRedirectDecision } from "@/lib/auth-redirect";

/**
 * Validate that a redirect path is safe (relative, no protocol, no double-slash).
 * Prevents open-redirect attacks via the `next` query parameter.
 */
function safePath(raw: string): string {
  // Must start with "/" and must NOT start with "//" (protocol-relative)
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  // Strip any embedded protocol (e.g., "/http://evil.com")
  try {
    const url = new URL(raw, "http://localhost");
    if (url.hostname !== "localhost") return "/dashboard";
  } catch {
    return "/dashboard";
  }
  return raw;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safePath(searchParams.get("next") ?? "/dashboard");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Verify the session is actually established before redirecting.
      // Without this, the redirect may land on the dashboard before the
      // session cookie propagates, causing an empty/zero-data dashboard.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // Session not ready — brief wait for cookie propagation
        await new Promise((r) => setTimeout(r, 500));
      }

      // ── MEMBERSHIP-BASED REDIRECT (single source of truth) ────────────
      // For default /dashboard redirects, determine the correct destination
      // based on membership status. This is the EARLIEST routing decision
      // point and prevents 0-membership users from ever reaching the
      // dashboard shell.
      //
      // If `next` is NOT /dashboard (e.g., user had a specific ?redirectTo),
      // honor that redirect — it may be an invitation accept flow, join code,
      // or other intentional deep link.
      if (next === "/dashboard") {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            // Count active memberships
            const { count: membershipCount } = await supabase
              .from("memberships")
              .select("id", { count: "exact", head: true })
              .eq("user_id", user.id)
              .neq("membership_status", "exited");

            // Count pending invitations (only if 0 memberships — optimization)
            let inviteCount = 0;
            if (!membershipCount || membershipCount === 0) {
              if (user.email) {
                const { count } = await supabase
                  .from("invitations")
                  .select("id", { count: "exact", head: true })
                  .eq("email", user.email)
                  .eq("status", "pending");
                inviteCount = count ?? 0;
              }
            }

            const destination = getPostAuthRedirect(
              membershipCount ?? 0,
              inviteCount
            );

            logRedirectDecision({
              from: "/auth/callback",
              to: destination,
              reason: `membershipCount=${membershipCount ?? 0}, inviteCount=${inviteCount}`,
              membershipsCount: membershipCount ?? 0,
              layer: "callback",
            });

            return NextResponse.redirect(`${origin}${destination}`);
          }
        } catch {
          // Non-critical — fall through to default /dashboard redirect.
          // The dashboard layout guard will catch 0-membership users as a
          // second enforcement layer.
        }
      }

      // Redirect to the intended destination (intl middleware will add locale prefix)
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Return the user to login with an error indicator
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
