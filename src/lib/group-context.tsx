"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";

export interface GroupMembership {
  id: string; // membership id
  group_id: string;
  role: "owner" | "admin" | "moderator" | "member";
  standing: "good" | "warning" | "suspended" | "banned";
  display_name: string | null;
  joined_at: string;
  privacy_settings: Record<string, boolean> | null;
  group: {
    id: string;
    name: string;
    group_type: string;
    currency: string;
    locale: string;
    logo_url: string | null;
    settings: Record<string, unknown>;
    is_active: boolean;
    created_by: string | null;
  };
}

export interface UserProfile {
  id: string;
  full_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  preferred_locale: string;
  preferred_theme: string;
}

interface GroupContextValue {
  /** Current user profile */
  user: UserProfile | null;
  /** All group memberships for the current user */
  memberships: GroupMembership[];
  /** Currently selected group's membership */
  currentMembership: GroupMembership | null;
  /** Shortcut: current group data */
  currentGroup: GroupMembership["group"] | null;
  /** Shortcut: current group ID */
  groupId: string | null;
  /** Whether user is admin/owner in current group */
  isAdmin: boolean;
  /** Whether user is a platform staff member */
  isPlatformStaff: boolean;
  /** Platform staff role if applicable */
  platformRole: string | null;
  /** Loading state */
  loading: boolean;
  /** Switch to a different group */
  switchGroup: (groupId: string) => void;
  /** Refetch memberships (e.g., after creating a group) */
  refresh: () => Promise<void>;
}

const GroupContext = createContext<GroupContextValue>({
  user: null,
  memberships: [],
  currentMembership: null,
  currentGroup: null,
  groupId: null,
  isAdmin: false,
  isPlatformStaff: false,
  platformRole: null,
  loading: true,
  switchGroup: () => {},
  refresh: async () => {},
});

const STORAGE_KEY = "villageclaq_current_group";

export function GroupProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [memberships, setMemberships] = useState<GroupMembership[]>([]);
  const [currentGroupId, setCurrentGroupId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPlatformStaff, setIsPlatformStaff] = useState(false);
  const [platformRole, setPlatformRole] = useState<string | null>(null);
  const searchParams = useSearchParams();

  const fetchData = useCallback(async () => {
    try {
      const supabase = createClient();

      // Get current auth user
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        setLoading(false);
        return;
      }

      // Fetch profile — if it doesn't exist (trigger failed), create it
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, display_name, avatar_url, phone, preferred_locale, preferred_theme")
        .eq("id", authUser.id)
        .maybeSingle();

      if (profileError) {
        // Profile query failed — still set loading false so UI can show
        setLoading(false);
        return;
      }

      if (!profile) {
        // Profile doesn't exist — handle_new_user trigger may have failed
        // Create profile as fallback
        const { data: newProfile } = await supabase
          .from("profiles")
          .insert({ id: authUser.id, full_name: "" })
          .select("id, full_name, display_name, avatar_url, phone, preferred_locale, preferred_theme")
          .single();
        if (newProfile) {
          setUser(newProfile as UserProfile);
        }
      } else {
        setUser(profile as UserProfile);
      }

      // Check if user is platform staff
      const { data: staffRecord } = await supabase
        .from("platform_staff")
        .select("id, role")
        .eq("user_id", authUser.id)
        .eq("is_active", true)
        .maybeSingle();
      if (staffRecord) {
        setIsPlatformStaff(true);
        setPlatformRole(staffRecord.role);
      }

      // Fetch all memberships with group data
      const { data: membershipData } = await supabase
        .from("memberships")
        .select(`
          id, group_id, role, standing, display_name, joined_at, privacy_settings,
          group:groups!inner(id, name, group_type, currency, locale, logo_url, settings, is_active, created_by)
        `)
        .eq("user_id", authUser.id)
        .order("joined_at", { ascending: false });

      if (membershipData) {
        const normalized = membershipData.map((m: Record<string, unknown>) => ({
          ...m,
          group: Array.isArray(m.group) ? m.group[0] : m.group,
        })) as GroupMembership[];
        setMemberships(normalized);

        const urlGroupId = searchParams.get("group");
        const storedGroupId = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
        const targetGroupId = urlGroupId || storedGroupId || normalized[0]?.group_id || null;

        const valid = normalized.find((m) => m.group_id === targetGroupId);
        setCurrentGroupId(valid ? targetGroupId : normalized[0]?.group_id || null);
      }
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Persist current group selection
  useEffect(() => {
    if (currentGroupId && typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, currentGroupId);
    }
  }, [currentGroupId]);

  const switchGroup = useCallback((groupId: string) => {
    setCurrentGroupId(groupId);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchData();
  }, [fetchData]);

  const currentMembership = memberships.find((m) => m.group_id === currentGroupId) || null;
  const currentGroup = currentMembership?.group || null;
  const isAdmin = currentMembership?.role === "owner" || currentMembership?.role === "admin";

  return (
    <GroupContext.Provider
      value={{
        user,
        memberships,
        currentMembership,
        currentGroup,
        groupId: currentGroupId,
        isAdmin,
        isPlatformStaff,
        platformRole,
        loading,
        switchGroup,
        refresh,
      }}
    >
      {children}
    </GroupContext.Provider>
  );
}

export function useGroup() {
  return useContext(GroupContext);
}
