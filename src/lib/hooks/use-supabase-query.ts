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
        supabase.from("payments").select("amount").eq("group_id", groupId).is("relief_plan_id", null), // Exclude relief payments
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
        .select("id, user_id, role, standing, display_name, joined_at, is_proxy, proxy_manager_id, privacy_settings, membership_status, profiles!memberships_user_id_fkey(id, full_name, avatar_url, phone)")
        .eq("group_id", groupId)
        .order("joined_at", { ascending: true });
      if (error) {
        console.warn("[Members] Query failed:", error.message);
        return [];
      }
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
        .select("*, profiles!memberships_user_id_fkey(id, full_name, avatar_url, phone, preferred_locale)")
        .eq("id", membershipId)
        .single();
      if (error) { console.warn("[Query] failed:", error.message); return null; }
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
      if (error) { console.warn("[Query] failed:", error.message); return []; }
      return data || [];
    },
    enabled: !!groupId,
  });
}

export function useAllContributionTypes() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ["all-contribution-types", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("contribution_types")
        .select("*")
        .eq("group_id", groupId)
        .order("is_active", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) { console.warn("[Query] failed:", error.message); return []; }
      return data || [];
    },
    enabled: !!groupId,
  });
}

export function useCreateContributionType() {
  const queryClient = useQueryClient();
  const { groupId, user } = useGroup();
  return useMutation({
    mutationFn: async (values: { name: string; name_fr?: string; description?: string; amount: number; currency: string; frequency: string; due_day?: number; enroll_all_members: boolean; is_flexible?: boolean }) => {
      if (!groupId || !user) throw new Error("No group/user");
      const { data, error } = await supabase.from("contribution_types").insert({
        ...values,
        group_id: groupId,
        created_by: user.id,
      }).select().single();
      if (error) throw error;
      // Audit log
      try {
        const { logActivity } = await import("@/lib/audit-log");
        await logActivity(supabase, {
          groupId,
          action: "contribution_type.created",
          entityType: "payment",
          entityId: data.id,
          description: `Contribution type "${values.name}" created (${values.frequency}, ${values.amount} ${values.currency})`,
          metadata: { name: values.name, amount: values.amount, currency: values.currency, frequency: values.frequency },
        });
      } catch { /* best-effort */ }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contribution-types", groupId] });
      queryClient.invalidateQueries({ queryKey: ["obligations", groupId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats", groupId] });
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
        .select("*, contribution_type:contribution_types!inner(id, name, name_fr), membership:memberships!inner(id, user_id, display_name, is_proxy, standing, profiles!memberships_user_id_fkey(id, full_name, avatar_url))")
        .eq("group_id", groupId)
        .order("due_date", { ascending: false });
      if (filters?.status) q = q.eq("status", filters.status);
      if (filters?.membershipId) q = q.eq("membership_id", filters.membershipId);
      const { data, error } = await q;
      if (error) { console.warn("[Query] failed:", error.message); return []; }
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
        .select("*, membership:memberships!inner(id, user_id, display_name, is_proxy, profiles!memberships_user_id_fkey(id, full_name, avatar_url)), contribution_type:contribution_types(id, name, name_fr)")
        .eq("group_id", groupId)
        .is("relief_plan_id", null) // Exclude relief payments from dues views
        .order("recorded_at", { ascending: false })
        .limit(limit);
      if (error) { console.warn("[Query] failed:", error.message); return []; }
      return data || [];
    },
    enabled: !!groupId,
  });
}

/** Shape returned by useRecordPayment for cascade/duplicate info */
export interface PaymentCascadeResult {
  payment: Record<string, unknown>;
  /** Each obligation touched by this payment, in order of application */
  appliedTo: { obligationId: string; typeName: string; amountApplied: number }[];
  /** Any remaining credit after all obligations are satisfied */
  creditRemaining: number;
}

/**
 * Check if a duplicate payment already exists for the same member/type/amount/date.
 * Returns the matching payment or null.
 */
export async function checkDuplicatePayment(
  groupId: string,
  membershipId: string,
  contributionTypeId: string | undefined,
  amount: number,
  paymentDate: string, // ISO date string YYYY-MM-DD
): Promise<Record<string, unknown> | null> {
  // payment_date is stored as recorded_at (TIMESTAMPTZ); match on the same calendar day
  const dayStart = `${paymentDate}T00:00:00.000Z`;
  const dayEnd = `${paymentDate}T23:59:59.999Z`;

  let query = supabase
    .from("payments")
    .select("id, amount, recorded_at, contribution_type:contribution_types(name)")
    .eq("group_id", groupId)
    .eq("membership_id", membershipId)
    .eq("amount", amount)
    .gte("recorded_at", dayStart)
    .lte("recorded_at", dayEnd);

  if (contributionTypeId) {
    query = query.eq("contribution_type_id", contributionTypeId);
  }

  const { data } = await query.limit(1).maybeSingle();
  return data as Record<string, unknown> | null;
}

export function useRecordPayment() {
  const queryClient = useQueryClient();
  const { groupId, user } = useGroup();
  return useMutation({
    mutationFn: async (values: {
      membership_id: string;
      obligation_id?: string;
      contribution_type_id?: string;
      amount: number;
      currency: string;
      payment_method: string;
      reference_number?: string;
      receipt_url?: string;
      notes?: string;
      /** ISO date string for the actual payment date (defaults to today) */
      payment_date?: string;
      /** Set to true to bypass duplicate warning (user confirmed "Record Anyway") */
      skipDuplicateCheck?: boolean;
      /** Optional: link payment to a relief plan (federated relief) */
      relief_plan_id?: string;
    }): Promise<PaymentCascadeResult> => {
      if (!groupId || !user) throw new Error("No group/user");

      // Validate amount — must be positive
      if (!values.amount || values.amount <= 0) throw new Error("Amount must be greater than zero");

      // ─── Step 0: Duplicate check (unless bypassed) ─────────────────────
      if (!values.skipDuplicateCheck && values.contribution_type_id) {
        const today = new Date().toISOString().slice(0, 10);
        const dup = await checkDuplicatePayment(
          groupId,
          values.membership_id,
          values.contribution_type_id,
          values.amount,
          today,
        );
        if (dup) {
          // Throw a special error the UI can catch to show the duplicate dialog
          const err = new Error("DUPLICATE_PAYMENT_DETECTED");
          (err as unknown as Record<string, unknown>).duplicatePayment = dup;
          throw err;
        }
      }

      // ─── Step 1: Insert payment record ─────────────────────────────────
      // IMPORTANT: Do NOT pass obligation_id to avoid double-update from DB trigger
      const insertPayload: Record<string, unknown> = {
        membership_id: values.membership_id,
        contribution_type_id: values.contribution_type_id || null,
        amount: values.amount,
        currency: values.currency,
        payment_method: values.payment_method,
        reference_number: values.reference_number || null,
        receipt_url: values.receipt_url || null,
        notes: values.notes || null,
        group_id: groupId,
        recorded_by: user.id,
        ...(values.payment_date ? { payment_date: values.payment_date, recorded_at: `${values.payment_date}T${new Date().toISOString().split("T")[1]}` } : {}),
        ...(values.relief_plan_id ? { relief_plan_id: values.relief_plan_id } : {}),
      };

      const { data, error } = await supabase.from("payments").insert(insertPayload).select().single();
      if (error) throw error;

      // ─── Step 2: Cascade payment across obligations ────────────────────
      const appliedTo: PaymentCascadeResult["appliedTo"] = [];
      let remaining = values.amount;

      // Find the first obligation (FIFO by due_date) for this member + type
      let oblId = values.obligation_id;
      if (!oblId && values.contribution_type_id && values.membership_id) {
        const { data: matchedObl } = await supabase
          .from("contribution_obligations")
          .select("id")
          .eq("membership_id", values.membership_id)
          .eq("contribution_type_id", values.contribution_type_id)
          .eq("group_id", groupId)
          .in("status", ["pending", "partial", "overdue"])
          .order("due_date", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (matchedObl) oblId = matchedObl.id;
      }

      if (oblId) {
        // Apply to the first obligation
        const { data: obl } = await supabase
          .from("contribution_obligations")
          .select("amount, amount_paid, contribution_type:contribution_types(name)")
          .eq("id", oblId)
          .single();

        if (obl) {
          const amountDue = Number(obl.amount);
          const currentPaid = Number(obl.amount_paid);
          const gap = Math.max(0, amountDue - currentPaid);
          const applied = Math.min(remaining, gap > 0 ? gap : remaining);

          // If gap is 0 (already paid), the full payment is excess
          if (gap > 0) {
            const newPaid = currentPaid + applied;
            const newStatus = newPaid >= amountDue ? "paid" : "partial";
            // CAS: include current amount_paid in WHERE to detect concurrent updates
            const { data: casData } = await supabase.from("contribution_obligations").update({ amount_paid: newPaid, status: newStatus }).eq("id", oblId).eq("amount_paid", currentPaid).select("id");
            if (!casData || casData.length === 0) throw new Error("CONCURRENT_PAYMENT_CONFLICT");
            const typeName = ((Array.isArray(obl.contribution_type) ? obl.contribution_type[0] : obl.contribution_type) as Record<string, unknown> | null)?.name as string || "";
            appliedTo.push({ obligationId: oblId, typeName, amountApplied: applied });
            remaining -= applied;
          }
        }

        // ─── Cascade: apply remainder to next unpaid obligations ─────────
        // Loop while there's remaining money and more unpaid obligations exist
        while (remaining > 0) {
          // Find the NEXT unpaid obligation for this member in this group
          // (any contribution type — cascades across all dues)
          const alreadyAppliedIds = appliedTo.map((a) => a.obligationId);
          let nextQuery = supabase
            .from("contribution_obligations")
            .select("id, amount, amount_paid, contribution_type:contribution_types(name)")
            .eq("membership_id", values.membership_id)
            .eq("group_id", groupId)
            .in("status", ["pending", "partial", "overdue"])
            .order("due_date", { ascending: true })
            .order("created_at", { ascending: true })
            .limit(1);

          // Exclude already-applied obligations
          if (alreadyAppliedIds.length > 0) {
            // Use .not('id', 'in', ...) to skip obligations we already touched
            nextQuery = nextQuery.not("id", "in", `(${alreadyAppliedIds.join(",")})`);
          }

          const { data: nextObl } = await nextQuery.maybeSingle();
          if (!nextObl) break; // No more unpaid obligations — remainder becomes credit

          const nextDue = Number(nextObl.amount);
          const nextCurrentPaid = Number(nextObl.amount_paid);
          const nextGap = Math.max(0, nextDue - nextCurrentPaid);
          if (nextGap <= 0) break; // Shouldn't happen (status filter), but safety

          const nextApplied = Math.min(remaining, nextGap);
          const nextNewPaid = nextCurrentPaid + nextApplied;
          const nextStatus = nextNewPaid >= nextDue ? "paid" : "partial";

          // CAS: include current amount_paid in WHERE to detect concurrent updates
          const { data: nextCasData } = await supabase.from("contribution_obligations").update({
            amount_paid: nextNewPaid,
            status: nextStatus,
          }).eq("id", nextObl.id).eq("amount_paid", nextCurrentPaid).select("id");
          if (!nextCasData || nextCasData.length === 0) throw new Error("CONCURRENT_PAYMENT_CONFLICT");

          const nextTypeName = ((Array.isArray(nextObl.contribution_type) ? nextObl.contribution_type[0] : nextObl.contribution_type) as Record<string, unknown> | null)?.name as string || "";
          appliedTo.push({ obligationId: nextObl.id as string, typeName: nextTypeName, amountApplied: nextApplied });
          remaining -= nextApplied;
        }
      } else if (values.contribution_type_id && values.membership_id) {
        // No obligation exists — create one and mark it paid/partial
        const { data: contribType } = await supabase
          .from("contribution_types")
          .select("amount, currency, name")
          .eq("id", values.contribution_type_id)
          .single();

        const amountDue = Number(contribType?.amount) || values.amount;
        const amountPaid = values.amount;
        const currentYear = new Date().getFullYear();

        await supabase.from("contribution_obligations").insert({
          group_id: groupId,
          membership_id: values.membership_id,
          contribution_type_id: values.contribution_type_id,
          amount: amountDue,
          amount_paid: Math.min(amountPaid, amountDue),
          currency: contribType?.currency || values.currency || "XAF",
          status: amountPaid >= amountDue ? "paid" : "partial",
          period_label: String(currentYear),
          due_date: new Date(currentYear, 11, 31).toISOString(),
        });

        const appliedAmount = Math.min(amountPaid, amountDue);
        appliedTo.push({
          obligationId: "new",
          typeName: (contribType?.name as string) || "",
          amountApplied: appliedAmount,
        });
        remaining = Math.max(0, amountPaid - amountDue);

        // If the new obligation was overpaid, cascade the remainder
        if (remaining > 0) {
          // Find next unpaid obligations for this member
          const { data: nextObls } = await supabase
            .from("contribution_obligations")
            .select("id, amount, amount_paid, contribution_type:contribution_types(name)")
            .eq("membership_id", values.membership_id)
            .eq("group_id", groupId)
            .in("status", ["pending", "partial", "overdue"])
            .order("due_date", { ascending: true })
            .order("created_at", { ascending: true })
            .limit(10);

          for (const nextObl of (nextObls || [])) {
            if (remaining <= 0) break;
            const nextDue = Number(nextObl.amount);
            const nextPaid = Number(nextObl.amount_paid);
            const nextGap = Math.max(0, nextDue - nextPaid);
            if (nextGap <= 0) continue;

            const nextApplied = Math.min(remaining, nextGap);
            // CAS: include current amount_paid in WHERE to detect concurrent updates
            const { data: casData3 } = await supabase.from("contribution_obligations").update({
              amount_paid: nextPaid + nextApplied,
              status: (nextPaid + nextApplied) >= nextDue ? "paid" : "partial",
            }).eq("id", nextObl.id).eq("amount_paid", nextPaid).select("id");
            if (!casData3 || casData3.length === 0) throw new Error("CONCURRENT_PAYMENT_CONFLICT");

            const nextTypeName = ((Array.isArray(nextObl.contribution_type) ? nextObl.contribution_type[0] : nextObl.contribution_type) as Record<string, unknown> | null)?.name as string || "";
            appliedTo.push({ obligationId: nextObl.id as string, typeName: nextTypeName, amountApplied: nextApplied });
            remaining -= nextApplied;
          }
        }
      }

      // ─── Step 3: Standing DB writeback ─────────────────────────────────
      // Recalculate standing for the affected member and persist to DB
      try {
        const { calculateStanding } = await import("@/lib/calculate-standing");
        await calculateStanding(values.membership_id, groupId, {
          updateDb: true,
          currency: values.currency,
        });
      } catch {
        // Non-critical — standing will recalculate on next view
      }

      // ─── Step 4: Audit log ──────────────────────────────────────────
      try {
        const { logActivity } = await import("@/lib/audit-log");
        await logActivity(supabase, {
          groupId,
          action: "payment.recorded",
          entityType: "payment",
          entityId: data.id as string,
          description: `Payment of ${values.amount} ${values.currency || "XAF"} recorded`,
          metadata: { amount: values.amount, currency: values.currency, membership_id: values.membership_id },
        });
      } catch { /* best-effort */ }

      return { payment: data as Record<string, unknown>, appliedTo, creditRemaining: remaining };
    },
    onSuccess: (_data, variables) => {
      // Invalidate ALL financial queries so every page shows fresh data
      queryClient.invalidateQueries({ queryKey: ["payments", groupId] });
      queryClient.invalidateQueries({ queryKey: ["obligations", groupId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats", groupId] });
      queryClient.invalidateQueries({ queryKey: ["matrix-data", groupId] });
      queryClient.invalidateQueries({ queryKey: ["contribution-types", groupId] });
      queryClient.invalidateQueries({ queryKey: ["aggregated-feed", groupId] });
      queryClient.invalidateQueries({ queryKey: ["member-payments"] });
      queryClient.invalidateQueries({ queryKey: ["member-obligations"] });
      // Invalidate member list (standing badges) and member detail
      queryClient.invalidateQueries({ queryKey: ["members", groupId] });
      // Invalidate standing cache so it recalculates on next view
      if (variables.membership_id) {
        queryClient.invalidateQueries({ queryKey: ["member-standing", variables.membership_id, groupId] });
        queryClient.invalidateQueries({ queryKey: ["member", variables.membership_id] });
      }
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
      if (error) { console.warn("[Query] failed:", error.message); return []; }
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
      try {
        const { logActivity } = await import("@/lib/audit-log");
        await logActivity(supabase, {
          groupId,
          action: "event.created",
          entityType: "event",
          entityId: data.id as string,
          description: `Event "${values.title || ""}" created`,
          metadata: { title: values.title },
        });
      } catch { /* best-effort */ }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events", groupId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats", groupId] });
      queryClient.invalidateQueries({ queryKey: ["aggregated-feed", groupId] });
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
        .select("*, membership:memberships!inner(id, profiles!memberships_user_id_fkey(id, full_name, avatar_url))")
        .eq("event_id", eventId);
      if (error) { console.warn("[Query] failed:", error.message); return []; }
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
        .select("*, membership:memberships!inner(id, profiles!memberships_user_id_fkey(id, full_name, avatar_url))")
        .eq("event_id", eventId);
      if (error) { console.warn("[Query] failed:", error.message); return []; }
      return data || [];
    },
    enabled: !!eventId,
  });
}

export function useBulkCreateAttendance() {
  const queryClient = useQueryClient();
  const { user, groupId } = useGroup();
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
      // Invalidate aggregate attendance and dashboard stats
      queryClient.invalidateQueries({ queryKey: ["all-event-attendances", groupId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats", groupId] });
      // Invalidate standing cache for all affected members
      for (const v of variables) {
        if (v.membership_id) {
          queryClient.invalidateQueries({ queryKey: ["member-standing", v.membership_id, groupId] });
        }
      }
    },
  });
}

export function useAllEventAttendances() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ["all-event-attendances", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("event_attendances")
        .select("*, event:events!inner(id, title, title_fr, starts_at, group_id), membership:memberships!inner(id, display_name, is_proxy, profiles!memberships_user_id_fkey(id, full_name, avatar_url))")
        .eq("event.group_id", groupId);
      if (error) { console.warn("[Query] failed:", error.message); return []; }
      return data || [];
    },
    enabled: !!groupId,
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
        .select("*, hosting_assignments(*, membership:memberships!inner(id, display_name, is_proxy, profiles!memberships_user_id_fkey(id, full_name, avatar_url)))")
        .eq("group_id", groupId);
      if (error) { console.warn("[Query] failed:", error.message); return []; }
      return data || [];
    },
    enabled: !!groupId,
  });
}

// ─── Hosting Mutations ────────────────────────────────────────────────────

export function useCreateHostingRoster() {
  const queryClient = useQueryClient();
  const { groupId, user } = useGroup();
  return useMutation({
    mutationFn: async (values: { name: string; name_fr?: string; rotation_type: string }) => {
      if (!groupId || !user) throw new Error("No group/user");
      const { data, error } = await supabase.from("hosting_rosters").insert({
        ...values,
        group_id: groupId,
        is_active: true,
        created_by: user.id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hosting-rosters", groupId] });
    },
  });
}

// ─── Meeting Minutes ───────────────────────────────────────────────────────

export function useCreateMeetingMinutes() {
  const queryClient = useQueryClient();
  const { groupId, user } = useGroup();
  return useMutation({
    mutationFn: async (values: { event_id: string; title: string; content_json: unknown; status: string; published_at?: string; published_by?: string }) => {
      if (!groupId || !user) throw new Error("No group/user");
      const { data, error } = await supabase.from("meeting_minutes").insert({
        ...values,
        group_id: groupId,
        created_by: user.id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meeting-minutes", groupId] });
      queryClient.invalidateQueries({ queryKey: ["aggregated-feed", groupId] });
    },
  });
}

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
      if (error) { console.warn("[Query] failed:", error.message); return []; }
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
      if (error) { console.warn("[Query] failed:", error.message); return []; }
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
        .select("*, relief_plan:relief_plans!inner(id, name, name_fr, group_id), membership:memberships!inner(id, user_id, display_name, is_proxy, privacy_settings, profiles!memberships_user_id_fkey(id, full_name, avatar_url, phone))")
        .eq("relief_plan.group_id", groupId)
        .order("created_at", { ascending: false });
      if (error) { console.warn("[Query] failed:", error.message); return []; }
      return data || [];
    },
    enabled: !!groupId,
  });
}

// ─── Relief Mutations ─────────────────────────────────────────────────────

export function useCreateReliefPlan() {
  const queryClient = useQueryClient();
  const { groupId, user } = useGroup();
  return useMutation({
    mutationFn: async (values: { name: string; name_fr?: string; description?: string; description_fr?: string; qualifying_events?: string[]; contribution_amount: number; contribution_frequency: string; payout_rules?: Record<string, number>; waiting_period_days?: number; auto_enroll?: boolean }) => {
      if (!groupId || !user) throw new Error("No group/user");
      const { data, error } = await supabase.from("relief_plans").insert({
        ...values,
        group_id: groupId,
        is_active: true,
        created_by: user.id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["relief-plans", groupId] });
    },
  });
}

// ─── Savings Circle ────────────────────────────────────────────────────────

export function useCreateSavingsCycle() {
  const queryClient = useQueryClient();
  const { groupId, user } = useGroup();
  return useMutation({
    mutationFn: async (values: { name: string; name_fr?: string; amount: number; currency?: string; frequency: string; total_rounds: number; rotation_type: string; start_date: string }) => {
      if (!groupId || !user) throw new Error("No group/user");
      const { data, error } = await supabase.from("savings_cycles").insert({
        ...values,
        group_id: groupId,
        status: "active",
        current_round: 1,
        created_by: user.id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["savings-cycles", groupId] });
    },
  });
}

export function useSavingsCycles() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ["savings-cycles", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("savings_cycles")
        .select("*, savings_participants(*, membership:memberships!inner(id, display_name, is_proxy, privacy_settings, profiles!memberships_user_id_fkey(id, full_name, avatar_url))), savings_contributions(id, membership_id, round_number, amount, status)")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false });
      if (error) { console.warn("[Query] failed:", error.message); return []; }
      return data || [];
    },
    enabled: !!groupId,
  });
}

// ─── Elections ─────────────────────────────────────────────────────────────

export function useCreateElection() {
  const queryClient = useQueryClient();
  const { groupId, user } = useGroup();
  return useMutation({
    mutationFn: async (values: { title: string; title_fr?: string; description?: string; description_fr?: string; election_type: string; starts_at: string; ends_at: string }) => {
      if (!groupId || !user) throw new Error("No group/user");
      const { data, error } = await supabase.from("elections").insert({
        ...values,
        group_id: groupId,
        status: "draft",
        created_by: user.id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["elections", groupId] });
    },
  });
}

export function useElections() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ["elections", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("elections")
        .select("*, election_candidates(*, membership:memberships!inner(id, display_name, is_proxy, privacy_settings, profiles!memberships_user_id_fkey(id, full_name, avatar_url))), election_options(*)")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false });
      if (error) { console.warn("[Query] failed:", error.message); return []; }
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
      if (error) { console.warn("[Query] failed:", error.message); return []; }
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
      if (error) { console.warn("[Query] failed:", error.message); return []; }
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
      if (error) { console.warn("[Query] failed:", error.message); return []; }
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
      if (error) { console.warn("[Query] failed:", error.message); return []; }
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
      if (error) {
        console.warn("[Notifications] Query failed:", error.message);
        return [];
      }
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
      if (error) {
        console.warn("[UnreadNotifications] Query failed:", error.message);
        return 0;
      }
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
      if (error) { console.warn("[Query] failed:", error.message); return []; }
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
      if (error) { console.warn("[Query] failed:", error.message); return null; }
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
        .select("*, position_assignments(*, membership:memberships!inner(id, profiles!memberships_user_id_fkey(id, full_name, avatar_url))), position_permissions(*)")
        .eq("group_id", groupId)
        .order("sort_order", { ascending: true });
      if (error) { console.warn("[Query] failed:", error.message); return []; }
      return data || [];
    },
    enabled: !!groupId,
  });
}

// ─── Activity Feed ─────────────────────────────────────────────────────────

export function useActivityFeed(limit = 30) {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ["activity-feed", groupId, limit],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("activity_feed")
        .select("*, actor:memberships!activity_feed_actor_membership_id_fkey(id, profiles!memberships_user_id_fkey(id, full_name, avatar_url)), reactions:feed_reactions(id, membership_id, reaction)")
        .eq("group_id", groupId)
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) {
        console.warn("[ActivityFeed] Query failed:", error.message);
        return [];
      }
      return data || [];
    },
    enabled: !!groupId,
  });
}

export function useAddFeedReaction() {
  const queryClient = useQueryClient();
  const { groupId, currentMembership } = useGroup();
  return useMutation({
    mutationFn: async ({ feedItemId, reaction }: { feedItemId: string; reaction: string }) => {
      if (!currentMembership) throw new Error("No membership");
      const { error } = await supabase.from("feed_reactions").upsert({
        feed_item_id: feedItemId,
        membership_id: currentMembership.id,
        reaction,
      }, { onConflict: "feed_item_id,membership_id,reaction" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity-feed", groupId] });
    },
  });
}

// ─── Loans ─────────────────────────────────────────────────────────────────

export function useLoans() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ["loans", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("loan_requests")
        .select("*, membership:memberships!inner(id, profiles!memberships_user_id_fkey(id, full_name, avatar_url)), repayments:loan_repayments(*)")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false });
      if (error) { console.warn("[Query] failed:", error.message); return []; }
      return data || [];
    },
    enabled: !!groupId,
  });
}

// ─── Projects ──────────────────────────────────────────────────────────────

export function useProjects() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ["projects", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("projects")
        .select("*, contributions:project_contributions(id, membership_id, amount, payment_method, reference, paid_at), expenses:project_expenses(id, description, amount, receipt_url, approved_by, spent_at), milestones:project_milestones(*)")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false });
      if (error) { console.warn("[Query] failed:", error.message); return []; }
      return data || [];
    },
    enabled: !!groupId,
  });
}

// ─── Badges ────────────────────────────────────────────────────────────────

export function useBadges() {
  return useQuery({
    queryKey: ["badges"],
    queryFn: async () => {
      const { data, error } = await supabase.from("badges").select("*").order("name");
      if (error) { console.warn("[Query] failed:", error.message); return []; }
      return data || [];
    },
  });
}

export function useMemberBadges(membershipId?: string | null) {
  return useQuery({
    queryKey: ["member-badges", membershipId],
    queryFn: async () => {
      if (!membershipId) return [];
      const { data, error } = await supabase
        .from("member_badges")
        .select("*, badge:badges(*)")
        .eq("membership_id", membershipId)
        .order("earned_at", { ascending: false });
      if (error) { console.warn("[Query] failed:", error.message); return []; }
      return data || [];
    },
    enabled: !!membershipId,
  });
}

// ─── Event Photos ──────────────────────────────────────────────────────────

export function useEventPhotos(eventId?: string | null) {
  return useQuery({
    queryKey: ["event-photos", eventId],
    queryFn: async () => {
      if (!eventId) return [];
      const { data, error } = await supabase
        .from("event_photos")
        .select("*, uploader:memberships!inner(id, profiles!memberships_user_id_fkey(id, full_name, avatar_url))")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false });
      if (error) { console.warn("[Query] failed:", error.message); return []; }
      return data || [];
    },
    enabled: !!eventId,
  });
}

// ─── Payment Reminder Rules ────────────────────────────────────────────────

export function usePaymentReminderRules() {
  const { groupId } = useGroup();
  return useQuery({
    queryKey: ["reminder-rules", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase.from("payment_reminder_rules").select("*").eq("group_id", groupId).order("days_after_due");
      if (error) { console.warn("[Query] failed:", error.message); return []; }
      return data || [];
    },
    enabled: !!groupId,
  });
}
