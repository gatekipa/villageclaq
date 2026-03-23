"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useGroup } from "@/lib/group-context";

const supabase = createClient();

// ─── Dashboard Stats ───────────────────────────────────────────────────────

export function useDashboardStats() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ["dashboard-stats", groupId],
    queryFn: async () => {
      if (!groupId) return null;

      const [membersRes, eventsRes, obligationsRes, paymentsRes] = await Promise.all([
        supabase.from("memberships").select("id", { count: "exact", head: true }).eq("group_id", groupId),
        supabase.from("events").select("id", { count: "exact", head: true }).eq("group_id", groupId).gte("starts_at", new Date().toISOString()),
        supabase.from("contribution_obligations").select("amount, amount_paid, status").eq("group_id", groupId),
        supabase.from("payments").select("amount").eq("group_id", groupId),
      ]);

      const obligations = obligationsRes.data || [];
      const totalDue = obligations.reduce((sum, o) => sum + Number(o.amount), 0);
      const totalPaid = obligations.reduce((sum, o) => sum + Number(o.amount_paid), 0);
      const outstanding = totalDue - totalPaid;
      const collectionRate = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0;

      return {
        totalMembers: membersRes.count || 0,
        upcomingEvents: eventsRes.count || 0,
        collectionRate,
        outstanding,
        totalCollected: (paymentsRes.data || []).reduce((sum, p) => sum + Number(p.amount), 0),
      };
    },
    enabled: !!groupId,
  });
}

// ─── Members ───────────────────────────────────────────────────────────────

export function useMembers() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ["members", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("memberships")
        .select("id, user_id, role, standing, display_name, joined_at, profiles!inner(id, full_name, avatar_url, phone)")
        .eq("group_id", groupId)
        .order("joined_at", { ascending: true });
      if (error) throw error;
      return (data || []).map((m: Record<string, unknown>) => ({
        ...m,
        profile: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles,
      }));
    },
    enabled: !!groupId,
  });
}

export function useMember(membershipId: string | null) {
  return useQuery({
    queryKey: ["member", membershipId],
    queryFn: async () => {
      if (!membershipId) return null;
      const { data, error } = await supabase
        .from("memberships")
        .select("*, profiles!inner(id, full_name, avatar_url, phone, preferred_locale)")
        .eq("id", membershipId)
        .single();
      if (error) throw error;
      return { ...data, profile: Array.isArray(data.profiles) ? data.profiles[0] : data.profiles };
    },
    enabled: !!membershipId,
  });
}

// ─── Contribution Types ────────────────────────────────────────────────────

export function useContributionTypes() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ["contribution-types", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("contribution_types")
        .select("*")
        .eq("group_id", groupId)
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!groupId,
  });
}

export function useCreateContributionType() {
  const queryClient = useQueryClient();
  const { groupId, user } = useGroup();
  return useMutation({
    mutationFn: async (values: { name: string; name_fr?: string; description?: string; amount: number; currency: string; frequency: string; due_day?: number; enroll_all_members: boolean }) => {
      if (!groupId || !user) throw new Error("No group/user");
      const { data, error } = await supabase.from("contribution_types").insert({
        ...values,
        group_id: groupId,
        created_by: user.id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contribution-types", groupId] });
    },
  });
}

// ─── Obligations ───────────────────────────────────────────────────────────

export function useObligations(filters?: { status?: string; membershipId?: string }) {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ["obligations", groupId, filters],
    queryFn: async () => {
      if (!groupId) return [];
      let q = supabase
        .from("contribution_obligations")
        .select("*, contribution_type:contribution_types!inner(id, name, name_fr), membership:memberships!inner(id, user_id, profiles!inner(id, full_name, avatar_url))")
        .eq("group_id", groupId)
        .order("due_date", { ascending: false });
      if (filters?.status) q = q.eq("status", filters.status);
      if (filters?.membershipId) q = q.eq("membership_id", filters.membershipId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: !!groupId,
  });
}

// ─── Payments ──────────────────────────────────────────────────────────────

export function usePayments(limit = 50) {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ["payments", groupId, limit],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("payments")
        .select("*, membership:memberships!inner(id, user_id, profiles!inner(id, full_name, avatar_url)), contribution_type:contribution_types(id, name, name_fr)")
        .eq("group_id", groupId)
        .order("recorded_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data || [];
    },
    enabled: !!groupId,
  });
}

export function useRecordPayment() {
  const queryClient = useQueryClient();
  const { groupId, user } = useGroup();
  return useMutation({
    mutationFn: async (values: { membership_id: string; obligation_id?: string; contribution_type_id?: string; amount: number; currency: string; payment_method: string; reference_number?: string; notes?: string }) => {
      if (!groupId || !user) throw new Error("No group/user");
      const { data, error } = await supabase.from("payments").insert({
        ...values,
        group_id: groupId,
        recorded_by: user.id,
      }).select().single();
      if (error) throw error;

      // If linked to an obligation, update it
      if (values.obligation_id) {
        const { data: obl } = await supabase.from("contribution_obligations").select("amount, amount_paid").eq("id", values.obligation_id).single();
        if (obl) {
          const newPaid = Number(obl.amount_paid) + values.amount;
          const newStatus = newPaid >= Number(obl.amount) ? "paid" : "partial";
          await supabase.from("contribution_obligations").update({ amount_paid: newPaid, status: newStatus }).eq("id", values.obligation_id);
        }
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments", groupId] });
      queryClient.invalidateQueries({ queryKey: ["obligations", groupId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats", groupId] });
    },
  });
}

// ─── Events ────────────────────────────────────────────────────────────────

export function useEvents() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ["events", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("group_id", groupId)
        .order("starts_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!groupId,
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  const { groupId, user } = useGroup();
  return useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      if (!groupId || !user) throw new Error("No group/user");
      const { data, error } = await supabase.from("events").insert({
        ...values,
        group_id: groupId,
        created_by: user.id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events", groupId] });
    },
  });
}

export function useEventRsvps(eventId: string | null) {
  return useQuery({
    queryKey: ["event-rsvps", eventId],
    queryFn: async () => {
      if (!eventId) return [];
      const { data, error } = await supabase
        .from("event_rsvps")
        .select("*, membership:memberships!inner(id, profiles!inner(id, full_name, avatar_url))")
        .eq("event_id", eventId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!eventId,
  });
}

// ─── Attendance ────────────────────────────────────────────────────────────

export function useEventAttendance(eventId: string | null) {
  return useQuery({
    queryKey: ["event-attendance", eventId],
    queryFn: async () => {
      if (!eventId) return [];
      const { data, error } = await supabase
        .from("event_attendances")
        .select("*, membership:memberships!inner(id, profiles!inner(id, full_name, avatar_url))")
        .eq("event_id", eventId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!eventId,
  });
}

export function useBulkCreateAttendance() {
  const queryClient = useQueryClient();
  const { user } = useGroup();
  return useMutation({
    mutationFn: async (records: { event_id: string; membership_id: string; status: string; checked_in_via?: string }[]) => {
      if (!user) throw new Error("No user");
      const rows = records.map((r) => ({
        ...r,
        checked_in_via: r.checked_in_via || "manual",
        marked_by: user.id,
      }));
      const { data, error } = await supabase
        .from("event_attendances")
        .upsert(rows, { onConflict: "event_id,membership_id" })
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      const eventId = variables[0]?.event_id;
      if (eventId) {
        queryClient.invalidateQueries({ queryKey: ["event-attendance", eventId] });
      }
    },
  });
}

// ─── Hosting ───────────────────────────────────────────────────────────────

export function useHostingRosters() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ["hosting-rosters", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("hosting_rosters")
        .select("*, hosting_assignments(*, membership:memberships!inner(id, profiles!inner(id, full_name, avatar_url)))")
        .eq("group_id", groupId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!groupId,
  });
}

// ─── Meeting Minutes ───────────────────────────────────────────────────────

export function useMeetingMinutes() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ["meeting-minutes", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("meeting_minutes")
        .select("*, event:events(id, title, title_fr, starts_at)")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!groupId,
  });
}

// ─── Relief ────────────────────────────────────────────────────────────────

export function useReliefPlans() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ["relief-plans", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("relief_plans")
        .select("*")
        .eq("group_id", groupId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!groupId,
  });
}

export function useReliefClaims() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ["relief-claims", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("relief_claims")
        .select("*, relief_plan:relief_plans(id, name, name_fr), membership:memberships!inner(id, profiles!inner(id, full_name, avatar_url))")
        .eq("relief_plans.group_id", groupId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!groupId,
  });
}

// ─── Savings Circle ────────────────────────────────────────────────────────

export function useSavingsCycles() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ["savings-cycles", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("savings_cycles")
        .select("*, savings_participants(*, membership:memberships!inner(id, profiles!inner(id, full_name, avatar_url)))")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!groupId,
  });
}

// ─── Elections ─────────────────────────────────────────────────────────────

export function useElections() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ["elections", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("elections")
        .select("*, election_candidates(*, membership:memberships!inner(id, profiles!inner(id, full_name, avatar_url))), election_options(*)")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!groupId,
  });
}

// ─── Documents ─────────────────────────────────────────────────────────────

export function useDocuments() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ["documents", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("documents")
        .select("*, uploader:profiles!documents_uploaded_by_fkey(id, full_name, avatar_url)")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!groupId,
  });
}

// ─── Announcements ─────────────────────────────────────────────────────────

export function useAnnouncements() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ["announcements", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!groupId,
  });
}

// ─── Invitations ───────────────────────────────────────────────────────────

export function useInvitations() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ["invitations", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("invitations")
        .select("*, profile:profiles!invitations_invited_by_fkey(id, full_name)")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!groupId,
  });
}

export function useJoinCodes() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ["join-codes", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("join_codes")
        .select("*")
        .eq("group_id", groupId)
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!groupId,
  });
}

// ─── Notifications ─────────────────────────────────────────────────────────

export function useNotifications(limit = 20) {
  const { user } = useGroup();
  return useQuery({
    queryKey: ["notifications", user?.id, limit],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });
}

export function useUnreadNotificationCount() {
  const { user } = useGroup();
  return useQuery({
    queryKey: ["unread-notifications", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!user,
  });
}

// ─── Family Members ────────────────────────────────────────────────────────

export function useFamilyMembers() {
  const { currentMembership } = useGroup();
  return useQuery({
    queryKey: ["family-members", currentMembership?.id],
    queryFn: async () => {
      if (!currentMembership) return [];
      const { data, error } = await supabase
        .from("family_members")
        .select("*")
        .eq("membership_id", currentMembership.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentMembership,
  });
}

// ─── Group Settings ────────────────────────────────────────────────────────

export function useGroupSettings() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ["group-settings", groupId],
    queryFn: async () => {
      if (!groupId) return null;
      const { data, error } = await supabase
        .from("groups")
        .select("*")
        .eq("id", groupId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!groupId,
  });
}

export function useGroupPositions() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ["group-positions", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("group_positions")
        .select("*, position_assignments(*, membership:memberships!inner(id, profiles!inner(id, full_name, avatar_url))), position_permissions(*)")
        .eq("group_id", groupId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!groupId,
  });
}
