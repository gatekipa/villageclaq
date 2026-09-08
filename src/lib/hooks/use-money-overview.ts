"use client";

import { useMemo } from "react";
import { useGroup } from "@/lib/group-context";
import { getMemberName } from "@/lib/get-member-name";
import { computeMoneyFiguresByCurrency, computeObligationStates, isConfirmedPayment, todayKey, type CurrencyMoneyFigures } from "@/lib/money";
import { useObligations, usePayments } from "@/lib/hooks/use-supabase-query";

export interface RecentPaymentRow {
  id: string;
  name: string;
  typeName: string | null;
  typeNameFr: string | null;
  amount: number;
  currency: string;
  recordedAt: string | null;
}
export interface NextDueRow {
  id: string;
  name: string;
  typeName: string | null;
  typeNameFr: string | null;
  amount: number;
  remaining: number;
  currency: string;
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
  moneyByCurrency?: CurrencyMoneyFigures[];
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
    const moneyByCurrency = computeMoneyFiguresByCurrency(obligations.data, payments.data, { today });
    const figures = moneyByCurrency.find((bucket) => bucket.currency === currency) || {
      expected: 0, collected: 0, outstanding: 0, unallocatedCredit: 0,
      overdue: { amount: 0, memberCount: 0 }, pending: { count: 0, amount: 0 }, membersOwing: 0,
    };
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
        currency: p.currency || currency,
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
          currency: o.currency || currency,
          dueDate: o.due_date,
        })),
      currency,
      moneyByCurrency,
    };
  }, [obligations.data, payments.data, currency, today]);
  return {
    data,
    isLoading: obligations.isLoading || payments.isLoading,
    isError: obligations.isError || payments.isError,
    refetch: () => Promise.all([obligations.refetch(), payments.refetch()]),
  };
}
