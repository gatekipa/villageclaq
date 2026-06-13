"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useGroup } from "@/lib/group-context";
import { getMemberName } from "@/lib/get-member-name";

const supabase = createClient();

/** One reconciled payment row for the "Recent payments" list (confirmed only). */
export interface RecentPaymentRow {
  id: string;
  name: string;
  typeName: string | null;
  typeNameFr: string | null;
  amount: number;
  recordedAt: string | null;
}

/** One upcoming unpaid obligation row for the "Next due" list. */
export interface NextDueRow {
  id: string;
  name: string;
  typeName: string | null;
  typeNameFr: string | null;
  amount: number;
  remaining: number;
  dueDate: string | null;
}

export interface MoneyOverview {
  /** Σ obligation.amount, excluding waived. */
  totalExpected: number;
  /** Σ confirmed dues payments only (relief excluded). */
  totalCollected: number;
  /** expected − collected, clamped at 0. */
  outstanding: number;
  /** Derived overdue: due_date < today, not paid/waived, remaining > 0. */
  overdue: { amount: number; memberCount: number };
  /** Member-submitted money awaiting admin confirm/reject. */
  pendingConfirmation: { count: number; amount: number };
  /** Distinct members with any outstanding (non-paid/non-waived, remaining > 0). */
  membersOwing: number;
  /** Up to 6 most recent confirmed dues payments. */
  recentPayments: RecentPaymentRow[];
  /** Up to 5 upcoming unpaid obligations, soonest due first. */
  nextDue: NextDueRow[];
  /** Group currency for formatAmount. */
  currency: string;
}

type ObligationRow = {
  id: string;
  amount: number | string | null;
  amount_paid: number | string | null;
  status: string | null;
  due_date: string | null;
  membership_id: string | null;
  membership: Record<string, unknown> | null;
  contribution_type: { id: string; name: string | null; name_fr?: string | null } | null;
};

type PaymentRow = {
  id: string;
  amount: number | string | null;
  status: string | null;
  recorded_at: string | null;
  membership: Record<string, unknown> | null;
  contribution_type: { id: string; name: string | null; name_fr?: string | null } | null;
};

/**
 * useMoneyOverview — single reconciled money figure set for the admin
 * "Collection overview" command center.
 *
 * Figures follow the authoritative data model:
 * - totalExpected = Σ obligation.amount, EXCLUDING status='waived'.
 * - totalCollected = Σ payments.amount WHERE relief_plan_id IS NULL AND
 *   status='confirmed' (confirmed-only — pending/rejected never inflate it).
 * - outstanding = max(0, expected − collected).
 * - overdue is DERIVED (no trigger sets it): due_date < today, status NOT IN
 *   (paid, waived), and (amount − amount_paid) > 0.
 * - pendingConfirmation = payments with status='pending_confirmation'
 *   (member-submitted money awaiting admin confirm/reject).
 *
 * THROWS on any query error (never coerces to 0 — a false money figure is
 * worse than an error surface).
 */
export function useMoneyOverview() {
  const { groupId, currentGroup } = useGroup();
  // Extract the currency primitive so the queryFn never closes over an object
  // that changes identity (rule 9).
  const currency = currentGroup?.currency || "XAF";

  return useQuery<MoneyOverview>({
    queryKey: ["money-overview", groupId],
    enabled: !!groupId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!groupId) {
        // enabled guards this, but keep the type contract honest.
        return {
          totalExpected: 0,
          totalCollected: 0,
          outstanding: 0,
          overdue: { amount: 0, memberCount: 0 },
          pendingConfirmation: { count: 0, amount: 0 },
          membersOwing: 0,
          recentPayments: [],
          nextDue: [],
          currency,
        };
      }

      const [oblRes, payRes] = await Promise.all([
        supabase
          .from("contribution_obligations")
          .select(
            "id, amount, amount_paid, status, due_date, membership_id, contribution_type:contribution_types(id, name, name_fr), membership:memberships!inner(id, user_id, display_name, is_proxy, profiles!memberships_user_id_fkey(id, full_name, avatar_url))"
          )
          .eq("group_id", groupId)
          .order("due_date", { ascending: true }),
        supabase
          .from("payments")
          .select(
            "id, amount, status, recorded_at, membership:memberships!inner(id, user_id, display_name, is_proxy, profiles!memberships_user_id_fkey(id, full_name, avatar_url)), contribution_type:contribution_types(id, name, name_fr)"
          )
          .eq("group_id", groupId)
          .is("relief_plan_id", null)
          .order("recorded_at", { ascending: false }),
      ]);

      if (oblRes.error) {
        console.warn("[MoneyOverview] obligations query failed:", oblRes.error.message);
        throw oblRes.error;
      }
      if (payRes.error) {
        console.warn("[MoneyOverview] payments query failed:", payRes.error.message);
        throw payRes.error;
      }

      const obligations = (oblRes.data || []) as unknown as ObligationRow[];
      const payments = (payRes.data || []) as unknown as PaymentRow[];

      // ── Expected: Σ amount, excluding waived ──────────────────────────────
      let totalExpected = 0;
      // ── Overdue (derived) + members owing ─────────────────────────────────
      // Compare on the calendar DATE, not a timestamp: due_date is a DATE
      // (UTC midnight), so a same-day obligation must not read as overdue for
      // an admin in a negative-UTC (diaspora) timezone. today = local YYYY-MM-DD.
      const now = new Date();
      const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

      let overdueAmount = 0;
      const overdueMembers = new Set<string>();
      const owingMembers = new Set<string>();
      const nextDueCandidates: NextDueRow[] = [];

      for (const o of obligations) {
        const status = o.status || "pending";
        if (status === "waived") continue;

        const amount = Number(o.amount) || 0;
        totalExpected += amount;

        const paid = Number(o.amount_paid) || 0;
        const remaining = amount - paid;
        const isOpen = status !== "paid" && remaining > 0;
        const memberKey = o.membership_id || o.id;

        if (isOpen) {
          owingMembers.add(memberKey);
        }

        // Derived overdue: past due, not paid/waived, money still remaining.
        // Date-only string compare ("2026-06-13" < todayKey) avoids the
        // timezone boundary that would flag a today-due item as overdue.
        const dueKey = o.due_date ? String(o.due_date).slice(0, 10) : null;
        if (isOpen && dueKey && dueKey < todayKey) {
          overdueAmount += remaining;
          overdueMembers.add(memberKey);
        }

        // Next-due candidates: upcoming unpaid obligations (due today or later).
        if (isOpen && dueKey && dueKey >= todayKey) {
          nextDueCandidates.push({
            id: o.id,
            name: getMemberName(o.membership as Record<string, unknown>),
            typeName: o.contribution_type?.name ?? null,
            typeNameFr: o.contribution_type?.name_fr ?? null,
            amount,
            remaining,
            dueDate: o.due_date,
          });
        }
      }

      // ── Collected: confirmed dues payments only ───────────────────────────
      // payments.status defaults to 'confirmed'; treat null/empty as confirmed
      // to match the column default, but exclude pending/rejected.
      let totalCollected = 0;
      let pendingCount = 0;
      let pendingAmount = 0;
      const recentPayments: RecentPaymentRow[] = [];

      for (const p of payments) {
        const status = p.status || "confirmed";
        const amount = Number(p.amount) || 0;

        if (status === "pending_confirmation") {
          pendingCount += 1;
          pendingAmount += amount;
          continue;
        }
        if (status === "rejected") continue;

        // Confirmed (or default) dues payment.
        totalCollected += amount;
        if (recentPayments.length < 6) {
          recentPayments.push({
            id: p.id,
            name: getMemberName(p.membership as Record<string, unknown>),
            typeName: p.contribution_type?.name ?? null,
            typeNameFr: p.contribution_type?.name_fr ?? null,
            amount,
            recordedAt: p.recorded_at,
          });
        }
      }

      const outstanding = Math.max(0, totalExpected - totalCollected);

      // Obligations are ordered by due_date asc, so the first 5 upcoming
      // candidates are already the soonest due.
      const nextDue = nextDueCandidates.slice(0, 5);

      return {
        totalExpected,
        totalCollected,
        outstanding,
        overdue: { amount: overdueAmount, memberCount: overdueMembers.size },
        pendingConfirmation: { count: pendingCount, amount: pendingAmount },
        membersOwing: owingMembers.size,
        recentPayments,
        nextDue,
        currency,
      };
    },
  });
}
