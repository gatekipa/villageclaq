/**
 * Resolves the display name for a member, handling both proxy and real members.
 *
 * Proxy members (user_id=NULL): name is in memberships.display_name
 * Real members: name is in profiles.full_name or profiles.display_name
 * Fallback chain: membership.display_name → profile.full_name → profile.display_name
 *   → nested membership → privacy_settings.proxy_name → profile.email prefix → "Member"
 *
 * Works with various data shapes returned by Supabase queries:
 * - Direct membership record: { display_name, profile: { full_name } }
 * - Nested membership: { membership: { display_name, profiles: { full_name } } }
 * - Obligation/payment record: { membership: { display_name, profiles: { full_name } } }
 */
export function getMemberName(record: Record<string, unknown> | null | undefined): string {
  if (!record) return "Member";

  // Direct display_name on the record (memberships.display_name)
  const directName = record.display_name as string | undefined;
  if (directName && directName.trim()) return directName.trim();

  // Profile data (profiles.full_name or profiles.display_name)
  const profile = (record.profile || record.profiles) as Record<string, unknown> | undefined;
  if (profile) {
    const p = Array.isArray(profile) ? profile[0] : profile;
    if (p) {
      const fullName = (p as Record<string, unknown>).full_name as string | undefined;
      if (fullName && fullName.trim()) return fullName.trim();
      const displayName = (p as Record<string, unknown>).display_name as string | undefined;
      if (displayName && displayName.trim()) return displayName.trim();
      // Email prefix fallback — "john@example.com" → "john"
      const email = (p as Record<string, unknown>).email as string | undefined;
      if (email && email.includes("@")) return email.split("@")[0];
    }
  }

  // Nested membership (e.g., obligation.membership or payment.membership)
  const membership = record.membership as Record<string, unknown> | undefined;
  if (membership) {
    const mName = membership.display_name as string | undefined;
    if (mName && mName.trim()) return mName.trim();

    const mProfile = (membership.profile || membership.profiles) as Record<string, unknown> | undefined;
    if (mProfile) {
      const mp = Array.isArray(mProfile) ? mProfile[0] : mProfile;
      if (mp) {
        const fullName = (mp as Record<string, unknown>).full_name as string | undefined;
        if (fullName && fullName.trim()) return fullName.trim();
        const displayName = (mp as Record<string, unknown>).display_name as string | undefined;
        if (displayName && displayName.trim()) return displayName.trim();
        const email = (mp as Record<string, unknown>).email as string | undefined;
        if (email && email.includes("@")) return email.split("@")[0];
      }
    }
  }

  // Privacy settings fallback for proxy members
  const privacy = record.privacy_settings as Record<string, unknown> | undefined;
  if (privacy?.proxy_name) return privacy.proxy_name as string;

  return "Member";
}
