import type { SupabaseClient } from "@supabase/supabase-js";

export interface MemberDispatchContact {
  membershipId: string;
  userId: string | null;
  phone: string;
  displayName: string;
  locale: "en" | "fr";
  isProxy: boolean;
  role: string | null;
  standing: string | null;
}

type MembershipContactRow = {
  id: string;
  user_id: string | null;
  display_name: string | null;
  is_proxy: boolean | null;
  privacy_settings: Record<string, unknown> | null;
  membership_status?: string | null;
  role?: string | null;
  standing?: string | null;
  profiles:
    | {
        full_name?: string | null;
        phone?: string | null;
        preferred_locale?: string | null;
      }
    | Array<{
        full_name?: string | null;
        phone?: string | null;
        preferred_locale?: string | null;
      }>
    | null;
};

function firstProfile(row: MembershipContactRow) {
  return Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
}

function locale(value: string | null | undefined): "en" | "fr" {
  return value === "fr" ? "fr" : "en";
}

async function fetchAuthPhones(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<Map<string, string>> {
  const phones = new Map<string, string>();
  for (const userId of Array.from(new Set(userIds))) {
    try {
      const {
        data: { user },
      } = await supabase.auth.admin.getUserById(userId);
      if (user?.phone) phones.set(userId, user.phone);
    } catch {
      // Best-effort fallback only. profiles.phone should be the primary source.
    }
  }
  return phones;
}

/**
 * Server-only contact resolver for cron dispatch routes.
 *
 * `get_member_phones()` is intentionally admin-gated for browser callers.
 * Cron routes use a service-role Supabase client, so they resolve the same
 * data directly without weakening that RPC.
 */
export async function fetchMemberDispatchContacts(
  supabase: SupabaseClient,
  groupId: string,
): Promise<MemberDispatchContact[]> {
  const { data, error } = await supabase
    .from("memberships")
    .select(`
      id,
      user_id,
      display_name,
      is_proxy,
      privacy_settings,
      membership_status,
      role,
      standing,
      profiles:profiles!memberships_user_id_fkey(
        full_name,
        phone,
        preferred_locale
      )
    `)
    .eq("group_id", groupId);

  if (error) {
    throw new Error(`member contact lookup failed: ${error.message}`);
  }

  const rows = ((data || []) as unknown as MembershipContactRow[]).filter(
    (row) => row.membership_status !== "exited",
  );

  const authFallbackIds = rows
    .filter((row) => row.user_id && !row.is_proxy && !firstProfile(row)?.phone)
    .map((row) => row.user_id as string);
  const authPhones = await fetchAuthPhones(supabase, authFallbackIds);

  const contacts: MemberDispatchContact[] = [];
  for (const row of rows) {
    const profile = firstProfile(row);
    const isProxy = row.is_proxy === true;
    const phone = isProxy
      ? ((row.privacy_settings?.proxy_phone as string | undefined) || null)
      : (profile?.phone || (row.user_id ? authPhones.get(row.user_id) : null) || null);

    if (!phone) continue;

    contacts.push({
      membershipId: row.id,
      userId: row.user_id,
      phone,
      displayName: row.display_name || profile?.full_name || "Member",
      locale: locale(profile?.preferred_locale),
      isProxy,
      role: row.role || null,
      standing: row.standing || null,
    });
  }

  return contacts;
}
