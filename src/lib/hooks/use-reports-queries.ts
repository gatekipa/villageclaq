import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// --- Interfaces ---

export interface FinancialStatementOptions {
  statementType: "trial_balance" | "balance_sheet" | "income_statement";
  currency: string;
  asOfDate?: string;
  startDate?: string;
  endDate?: string;
}

export interface TrialBalanceAccount {
  account_id: string | null;
  account_name: string;
  account_code: string | null;
  account_class: string;
  total_debit: number;
  total_credit: number;
  net_balance: number;
}

export interface TrialBalanceResult {
  accounts: TrialBalanceAccount[];
  total_debit: number;
  total_credit: number;
  is_balanced: boolean;
  generated_at: string;
  currency: string;
}

export interface StatementAccount {
  account_name: string;
  net_balance: number;
}

export interface BalanceSheetResult {
  assets: StatementAccount[];
  liabilities: StatementAccount[];
  equity: StatementAccount[];
  total_assets: number;
  total_liabilities_equity: number;
  is_balanced: boolean;
  generated_at: string;
  as_of_date: string;
  currency: string;
}

export interface IncomeStatementResult {
  revenues: StatementAccount[];
  expenses: StatementAccount[];
  total_revenue: number;
  total_expenses: number;
  net_income: number;
  generated_at: string;
  start_date?: string;
  end_date: string;
  currency: string;
}

export type AnyFinancialStatementResult = TrialBalanceResult | BalanceSheetResult | IncomeStatementResult;

export interface MemberStatementOptions {
  currency: string;
  startDate?: string;
  endDate?: string;
}

export interface MemberTransaction {
  event_id: string;
  source_module: string;
  description: string;
  occurred_at: string;
  amount: number;
}

export interface MemberContributionResult {
  membership_id: string;
  currency: string;
  transactions: MemberTransaction[];
  total_contributed: number;
  generated_at: string;
  start_date?: string;
  end_date: string;
}

const supabase = createClient();

// --- Error Parser ---

export function parseReportRpcError(error: unknown): string {
  if (!error) return "unknownError";
  const msg = typeof error === "object" && error !== null && "message" in error 
    ? String(error.message) 
    : String(error);

  if (msg.includes("INVALID_CURRENCY")) return "reports.errors.INVALID_CURRENCY";
  if (msg.includes("INVALID_STATEMENT_TYPE")) return "reports.errors.INVALID_STATEMENT_TYPE";
  if (msg.includes("UNAUTHORIZED")) return "reports.errors.UNAUTHORIZED";
  if (msg.includes("staleTenantAborted")) return "reports.errors.staleTenantAborted";
  
  return msg;
}

// --- Hooks ---

export function useFinancialStatement(groupId: string, options: FinancialStatementOptions) {
  return useQuery<AnyFinancialStatementResult, Error>({
    queryKey: ["financial-statement", groupId, options.statementType, options.currency, options.asOfDate, options.startDate, options.endDate],
    queryFn: async () => {
      if (!groupId) throw new Error("staleTenantAborted");
      if (!options.currency) throw new Error("INVALID_CURRENCY");

      const command = {
        group_id: groupId,
        statement_type: options.statementType,
        currency: options.currency,
        as_of_date: options.asOfDate,
        start_date: options.startDate,
        end_date: options.endDate,
      };

      const { data, error } = await supabase.rpc("get_financial_statement", { p_command: command });
      
      if (error) {
        throw new Error(parseReportRpcError(error));
      }
      
      return data as AnyFinancialStatementResult;
    },
    enabled: !!groupId && !!options.currency && !!options.statementType,
  });
}

export function useMemberContributionStatement(groupId: string, membershipId: string, options: MemberStatementOptions) {
  return useQuery<MemberContributionResult, Error>({
    queryKey: ["member-contribution-statement", groupId, membershipId, options.currency, options.startDate, options.endDate],
    queryFn: async () => {
      if (!groupId || !membershipId) throw new Error("staleTenantAborted");
      if (!options.currency) throw new Error("INVALID_CURRENCY");

      const command = {
        group_id: groupId,
        membership_id: membershipId,
        currency: options.currency,
        start_date: options.startDate,
        end_date: options.endDate,
      };

      const { data, error } = await supabase.rpc("get_member_contribution_statement", { p_command: command });
      
      if (error) {
        throw new Error(parseReportRpcError(error));
      }
      
      return data as MemberContributionResult;
    },
    enabled: !!groupId && !!membershipId && !!options.currency,
  });
}
