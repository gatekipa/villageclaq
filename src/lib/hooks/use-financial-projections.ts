"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// ─── TYPES & INTERFACES ───────────────────────────────────────────────────────

export interface AccountBalanceProjection {
  group_id: string;
  account_id: string;
  account_name: string;
  account_kind: string;
  account_status: string;
  currency: string;
  amount: string; // Exact unlocalized decimal string (e.g. "1500.00" or "2500000")
}

export interface FundCashProjection {
  group_id: string;
  fund_id: string;
  fund_name: string;
  fund_is_restricted: boolean;
  fund_status: string;
  currency: string;
  amount: string;
}

export interface FundNetPositionProjection {
  group_id: string;
  fund_id: string;
  fund_name: string;
  fund_is_restricted: boolean;
  fund_status: string;
  currency: string;
  amount: string;
}

export interface OrganizationCustodyProjection {
  group_id: string;
  currency: string;
  amount: string;
}

export interface ActivityLineProjection {
  group_id: string;
  currency: string;
  category_id: string;
  category_name: string;
  category_class: "income" | "expense";
  category_status: string;
  fund_id: string;
  fund_name: string;
  fund_is_restricted: boolean;
  fund_status: string;
  member_id: string | null;
  member_name: string | null;
  member_visibility: "visible" | "not_present";
  project_id: string | null;
  project_name: string | null;
  project_visibility: "visible" | "not_present";
  amount: string;
}

export interface StatementOfActivitySummary {
  group_id: string;
  currency: string;
  income: string;
  expense: string;
  operating_result: string;
}

export interface CategoryContextItem {
  category_id: string;
  category_name: string;
  category_class: string;
  category_status: string;
  fund_id: string;
  fund_name: string;
  fund_is_restricted: boolean;
  fund_status: string;
  member_id: string | null;
  member_name: string | null;
  project_id: string | null;
  project_name: string | null;
}

export interface CashMovementRow {
  posting_id: string;
  event_id: string;
  group_id: string;
  occurred_at: string;
  account_id: string;
  account_name: string;
  fund_id: string;
  fund_name: string;
  currency: string;
  amount_signed: string;
  movement_type: string;
  direction: "cash_in" | "cash_out";
  counterpart_control_classes: string[];
  category_contexts: CategoryContextItem[];
  member_id: string | null;
  project_id: string | null;
  event_class: string;
  effect_kind: string;
  source_module: string | null;
  source_record_id: string | null;
  status: string;
}

export interface CashbookRow {
  posting_id: string;
  event_id: string;
  group_id: string;
  ledger_epoch_id: string;
  occurred_at: string;
  posted_at: string;
  account_id: string;
  account_name: string;
  account_kind: string;
  account_status: string;
  fund_id: string;
  fund_name: string;
  fund_is_restricted: boolean;
  fund_status: string;
  currency: string;
  amount_signed: string;
  running_balance: string;
  event_class: string;
  effect_kind: string;
  movement_type: string;
  direction: "cash_in" | "cash_out";
  counterpart_control_classes: string[];
  category_contexts: CategoryContextItem[];
  member_id: string | null;
  member_name: string | null;
  member_visibility: "visible" | "not_present";
  project_id: string | null;
  project_name: string | null;
  project_visibility: "visible" | "not_present";
  source_module: string | null;
  source_record_id: string | null;
  status: string;
  audit_visibility: "visible" | "redacted";
  request_id: string | null;
  created_by: string | null;
  description: string | null;
  reference: string | null;
  reversal_of_event_id: string | null;
  replacement_event_id: string | null;
  corrected_at: string | null;
  correction_reason: string | null;
}

export interface FinancialProjectionBundle {
  contract_version: string;
  group_id: string;
  effective_from: string;
  effective_to: string;
  as_of_exclusive: string | null;
  observed_at: string;
  read_identity: string;
  read_identity_reusable: boolean;
  snapshot_consistency: string;
  continuation_semantics: string;
  currency_buckets: string[];
  account_balances: AccountBalanceProjection[];
  fund_cash: FundCashProjection[];
  fund_net_positions: FundNetPositionProjection[];
  organization_custody: OrganizationCustodyProjection[];
  income_activity: ActivityLineProjection[];
  expense_activity: ActivityLineProjection[];
  soa_lite: StatementOfActivitySummary[];
  cash_movement: CashMovementRow[];
  cashbook: CashbookRow[];
}

export interface PaginatedCashbookResult {
  contract_version: string;
  group_id: string;
  account_id: string;
  currency: string;
  effective_from: string;
  effective_to: string;
  as_of_exclusive: string | null;
  observed_at: string;
  read_identity: string;
  read_identity_reusable: boolean;
  snapshot_consistency: string;
  continuation_semantics: string;
  offset: number;
  limit: number;
  total_period_rows: number;
  opening_balance: string | null;
  rows: CashbookRow[];
}

export interface ProjectionBundleQueryParams {
  from: string | Date;
  to: string | Date;
  asOfExclusive?: string | Date | null;
}

export interface CashbookQueryParams {
  from: string | Date;
  to: string | Date;
  accountId: string;
  currency: string;
  offset?: number;
  limit?: number;
}

// ─── QUERY HOOKS ─────────────────────────────────────────────────────────────

function toIsoString(date: string | Date): string {
  if (date instanceof Date) {
    return date.toISOString();
  }
  return new Date(date).toISOString();
}

/**
 * Queries the canonical double-entry financial projection bundle.
 * Returns account balances, fund allocations, Statement of Activity, and cashbook rows.
 */
export function useFinancialProjectionBundle(
  groupId: string | null,
  params: ProjectionBundleQueryParams
) {
  const fromIso = params.from ? toIsoString(params.from) : "";
  const toIso = params.to ? toIsoString(params.to) : "";
  const asOfIso = params.asOfExclusive ? toIsoString(params.asOfExclusive) : null;

  return useQuery({
    queryKey: ["financial-projection-bundle", groupId, fromIso, toIso, asOfIso],
    queryFn: async (): Promise<FinancialProjectionBundle> => {
      if (!groupId || !fromIso || !toIso) {
        throw new Error("Missing required projection query parameters");
      }

      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_financial_projection_bundle", {
        p_group_id: groupId,
        p_from: fromIso,
        p_to: toIso,
        ...(asOfIso ? { p_as_of_exclusive: asOfIso } : {}),
      });

      if (error) {
        console.error("[useFinancialProjectionBundle] RPC failed:", error.message);
        throw error;
      }

      return data as unknown as FinancialProjectionBundle;
    },
    enabled: !!groupId && !!params.from && !!params.to,
    staleTime: 60 * 1000,
  });
}

/**
 * Queries the paginated canonical cashbook register for a specific custody account and currency.
 */
export function useFinancialCashbook(
  groupId: string | null,
  params: CashbookQueryParams
) {
  const fromIso = params.from ? toIsoString(params.from) : "";
  const toIso = params.to ? toIsoString(params.to) : "";
  const currencyUpper = params.currency ? params.currency.toUpperCase() : "";
  const offset = params.offset ?? 0;
  const limit = params.limit ?? 100;

  return useQuery({
    queryKey: [
      "financial-cashbook",
      groupId,
      fromIso,
      toIso,
      params.accountId,
      currencyUpper,
      offset,
      limit,
    ],
    queryFn: async (): Promise<PaginatedCashbookResult> => {
      if (!groupId || !fromIso || !toIso || !params.accountId || !currencyUpper) {
        throw new Error("Missing required cashbook query parameters");
      }

      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_financial_cashbook", {
        p_group_id: groupId,
        p_from: fromIso,
        p_to: toIso,
        p_account_id: params.accountId,
        p_currency: currencyUpper,
        p_offset: offset,
        p_limit: limit,
      });

      if (error) {
        console.error("[useFinancialCashbook] RPC failed:", error.message);
        throw error;
      }

      return data as unknown as PaginatedCashbookResult;
    },
    enabled: !!groupId && !!params.from && !!params.to && !!params.accountId && !!params.currency,
    staleTime: 60 * 1000,
  });
}

// ─── PERIOD PRESET HELPERS ───────────────────────────────────────────────────

export type DatePeriodPreset =
  | "this_month"
  | "last_month"
  | "this_year"
  | "all_time"
  | "custom";

export function getDateRangeForPreset(preset: DatePeriodPreset): { from: string; to: string } {
  const now = new Date();

  switch (preset) {
    case "this_month": {
      const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
      const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
      return { from: from.toISOString(), to: to.toISOString() };
    }
    case "last_month": {
      const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0, 0));
      const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
      return { from: from.toISOString(), to: to.toISOString() };
    }
    case "this_year": {
      const from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
      const to = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1, 0, 0, 0, 0));
      return { from: from.toISOString(), to: to.toISOString() };
    }
    case "all_time":
    default: {
      const from = new Date(Date.UTC(2020, 0, 1, 0, 0, 0, 0));
      const to = new Date(Date.UTC(now.getUTCFullYear() + 2, 0, 1, 0, 0, 0, 0));
      return { from: from.toISOString(), to: to.toISOString() };
    }
  }
}
