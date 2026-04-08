"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";

export interface GroupMembership {
  id: string; // membership id
  group_id: string;
  role: "owner" | "admin" | "moderator" | "member";
  standing: "good" | "warning" | "suspended" | "banned";
  membership_status: "active" | "pending_approval" | "exited";
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
    organization_id: string | null;
    group_level: "standalone" | "hq" | "branch";
    sharing_controls: Record<string, boolean> | null;
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
  const queryClient = useQueryClient();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [memberships, setMemberships] = useState<GroupMembership[]>([]);
  const [currentGroupId, setCurrentGroupId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPlatformStaff, setIsPlatformStaff] = useState(false);
  const [platformRole, setPlatformRole] = useState<string | null>(null);
  const searchParams = useSearchParams();

  // Track whether initial load is complete to prevent double-fetch on auth state change
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  // Guard against concurrent fetches that cause flickering during auth transitions
  const fetchInProgress = useRef(false);

  const fetchData = useCallback(async () => {
    // Prevent overlapping fetches (e.g., TOKEN_REFRESHED firing while initial load runs)
    if (fetchInProgress.current) return;
    fetchInProgress.current = true;

    try {
      const supabase = createClient();

      // Get current auth user
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        setLoading(false);
        // DON'T set initialLoadDone — a real SIGNED_IN event may arrive shortly
        // (e.g., email confirmation callback still processing the auth code)
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
        setInitialLoadDone(true);
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
          id, group_id, role, standing, membership_status, display_name, joined_at, privacy_settings,
          group:groups!inner(id, name, group_type, currency, locale, logo_url, settings, is_active, created_by, organization_id, group_level, sharing_controls)
        `)
        .eq("user_id", authUser.id)
        .neq("membership_status", "exited")
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

      setInitialLoadDone(true);
    } finally {
      setLoading(false);
      fetchInProgress.current = false;
    }
  }, [searchParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Listen for auth state changes (logout, token refresh, session expiry)
  // Skip SIGNED_IN if initial load already completed AND we have a user —
  // Supabase fires SIGNED_IN on page load when it detects the session cookie,
  // causing a redundant double-fetch that triggers re-renders and visible "flicker".
  // BUT: if initial load found no user (e.g., email confirmation redirect still
  // processing), we MUST process the SIGNED_IN event to pick up the new session.
  useEffect(() => {
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setUser(null);
        setMemberships([]);
        setCurrentGroupId(null);
        setIsPlatformStaff(false);
        setPlatformRole(null);
        setInitialLoadDone(false);
      } else if (event === "TOKEN_REFRESHED") {
        // Only refetch on token refresh if we already have a user.
        // Prevents redundant fetches during auth state settling.
        if (initialLoadDone) {
          fetchData();
        }
      } else if (event === "SIGNED_IN") {
        // Fetch if: (a) initial load hasn't completed, or (b) we don't have a user
        // yet (email confirmation redirect: initial fetch found no user because the
        // auth code hadn't been exchanged yet, now SIGNED_IN fires with a valid session)
        if (!initialLoadDone) {
          fetchData();
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [fetchData, initialLoadDone]);

  // Persist current group selection
  useEffect(() => {
    if (currentGroupId && typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, currentGroupId);
    }
  }, [currentGroupId]);

  const switchGroup = useCallback((groupId: string) => {
    setCurrentGroupId((prev) => {
      if (prev && prev !== groupId) {
        // Clear all cached query data so stale data from the previous group
        // is never shown while new group data loads.
        queryClient.removeQueries();
      }
      return groupId;
    });
  }, [queryClient]);

  const refresh = useCallback(async () => {
    // Do NOT set loading=true here — that causes DashboardGuard to unmount the
    // entire layout (Sidebar + Header + children) and replace it with a full-screen
    // spinner, then remount everything when loading=false. This is the primary
    // cause of the "flickering" bug. Refetches happen silently; only the initial
    // load (loading default = true) shows the spinner.
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
