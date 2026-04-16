/**
 * Single source of truth for post-auth redirect decisions.
 *
 * **Why this exists:**
 * The app had a recurring bug where 0-membership users landed on a stateless
 * dashboard instead of onboarding. The root cause was scattered inline redirect
 * logic across auth callback, dashboard layout, and GroupProvider — each making
 * independent routing decisions that could race or disagree.
 *
 * ALL membership-based post-auth redirect decisions MUST go through this module.
 * Do NOT add inline `if (memberships.length === 0) redirect(...)` logic elsewhere.
 *
 * See: src/ONBOARDING_REDIRECT_AUDIT.md
 */

/** Paths that 0-membership users are allowed to visit without being bounced to onboarding */
export const ZERO_MEMBERSHIP_ALLOWED_PATHS = [
  "/dashboard/onboarding",
  "/dashboard/my-invitations",
  "/dashboard/settings",
] as const;

/**
 * Determines the correct post-auth redirect path based on membership status.
 *
 * @param membershipCount  Number of active (non-exited) memberships for the user
 * @param pendingInviteCount  Number of pending invitations for the user's email
 * @returns The path to redirect to (without locale prefix — intl middleware adds it)
 */
export function getPostAuthRedirect(
  membershipCount: number,
  pendingInviteCount: number
): string {
  if (membershipCount > 0) {
    return "/dashboard";
  }

  if (pendingInviteCount > 0) {
    return "/dashboard/my-invitations";
  }

  return "/dashboard/onboarding/group";
}

/**
 * Checks whether a given pathname is safe for a 0-membership user.
 * If not, they should be redirected to onboarding.
 *
 * @param pathname  The current pathname (without locale prefix)
 * @returns true if the path is allowed for 0-membership users
 */
export function isZeroMembershipAllowedPath(pathname: string): boolean {
  return ZERO_MEMBERSHIP_ALLOWED_PATHS.some((p) => pathname.includes(p));
}

/**
 * Log a redirect decision in development.
 * In production, this is a no-op.
 */
export function logRedirectDecision(detail: {
  from: string;
  to: string;
  reason: string;
  membershipsCount: number;
  layer: "callback" | "middleware" | "layout-guard" | "provider";
}): void {
  if (process.env.NODE_ENV === "development") {
    console.log("[AUTH-REDIRECT]", detail);
  }
}
