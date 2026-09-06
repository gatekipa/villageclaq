"use client";

import { useMemo } from "react";
import { useGroup } from "@/lib/group-context";
import { getMemberName } from "@/lib/get-member-name";
import { computeMoneyFigures, computeObligationStates, isConfirmedPayment, todayKey } from "@/lib/money";
import { useObligations, usePayments } from "@/lib/hooks/use-supabase-query";

export interface RecentPaymentRow {
  id: string;
  name: string;
  typeName: string | null;
  typeNameFr: string | null;
  amount: number;
  recordedAt: string | null;
}
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
  totalExpected: number;
  totalCollected: number;
  outstanding: number;
  unallocatedCredit?: number;
  overdue: { amount: number; memberCount: number };
  pendingConfirmation: { count: number; amount: number };
  membersOwing: number;
  recentPayments: RecentPaymentRow[];
  nextDue: NextDueRow[];
  currency: string;
}

/** Shares complete, authorized query caches with the ledger and financial dashboard. */
export function useMoneyOverview() {
  const { currentGroup } = useGroup();
  const currency = currentGroup?.currency || "XAF";
  const obligations = useObligations();
  const payments = usePayments("all");
  const today = todayKey();
  const data = useMemo<MoneyOverview | undefined>(() => {
    if (!obligations.data || !payments.data) return undefined;
    const figures = computeMoneyFigures(obligations.data, payments.data, { today });
    const states = computeObligationStates(obligations.data, payments.data, { today });
    return {
      totalExpected: figures.expected,
      totalCollected: figures.collected,
      outstanding: figures.outstanding,
      unallocatedCredit: figures.unallocatedCredit,
      overdue: figures.overdue,
      pendingConfirmation: figures.pending,
      membersOwing: figures.membersOwing,
      recentPayments: payments.data.filter((p) => isConfirmedPayment(p.status)).slice(0, 6).map((p) => ({
        id: p.id,
        name: getMemberName(p.membership),
        typeName: p.contribution_type?.name ?? null,
        typeNameFr: p.contribution_type?.name_fr ?? null,
        amount: Number(p.amount),
        recordedAt: p.recorded_at,
      })),
      nextDue: obligations.data
        .filter((o) => states.get(o.id)?.isOpen && o.due_date && o.due_date.slice(0, 10) >= today)
        .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id.localeCompare(b.id))
        .slice(0, 5).map((o) => ({
          id: o.id,
          name: getMemberName(o.membership),
          typeName: o.contribution_type?.name ?? null,
          typeNameFr: o.contribution_type?.name_fr ?? null,
          amount: Number(o.amount),
          remaining: states.get(o.id)!.remaining,
          dueDate: o.due_date,
        })),
      currency,
    };
  }, [obligations.data, payments.data, currency, today]);
  return {
    data,
    isLoading: obligations.isLoading || payments.isLoading,
    isError: obligations.isError || payments.isError,
    refetch: () => Promise.all([obligations.refetch(), payments.refetch()]),
  };
}
