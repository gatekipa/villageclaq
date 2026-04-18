/**
 * Server-only helper: terminate a user's Supabase auth sessions.
 *
 * Used when a platform admin suspends/archives a regular user OR when
 * a super admin suspends another platform staff member — flipping
 * is_active or banned_until alone does NOT invalidate existing JWTs,
 * so we must explicitly sign the user out globally via the admin API.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY. Fails silently (logs a warning)
 * when the key is missing so the calling route can still complete —
 * the caller should treat session termination as best-effort.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function terminateUserSessions(userId: string): Promise<boolean> {
  if (!supabaseServiceKey) {
    console.warn("[admin-signout] SUPABASE_SERVICE_ROLE_KEY not set — cannot terminate sessions");
    return false;
  }
  try {
    const admin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    // "global" scope = revoke every refresh token for the user. Any
    // still-valid access token will continue until its natural ~1h
    // expiry, but it can no longer refresh — effectively forces
    // re-auth on the next session check.
    const { error } = await admin.auth.admin.signOut(userId, "global");
    if (error) {
      console.warn(`[admin-signout] signOut(${userId}) failed:`, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(
      `[admin-signout] signOut(${userId}) threw:`,
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
