import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// ============================================================================
// Interfaces
// ============================================================================
export interface DisburseLoanInput {
  loanId: string;
  accountId: string;
  groupId: string;
  disbursedAt?: string;
}

export interface DisburseLoanResponse {
  decision: string;
  loan_id: string;
  event_id?: string;
  schedule_count?: number;
}

export interface RecordLoanRepaymentInput {
  loanId: string;
  accountId: string;
  amount: number;
  groupId: string;
  paymentMethod?: string;
  notes?: string;
  referenceNumber?: string;
  requestId?: string;
}

export interface RecordLoanRepaymentResponse {
  decision: string;
  loan_id: string;
  event_id?: string;
  applied?: number;
}

export interface ApproveLoanInput {
  loanId: string;
  groupId: string;
  notes?: string;
  amountApproved?: number;
  interestRate?: number;
  totalRepayable?: number;
}

// ============================================================================
// Error Parser
// ============================================================================
export function parseLoanRpcError(error: unknown): string {
  let msg = "";
  if (error instanceof Error) {
    msg = error.message;
  } else if (typeof error === "object" && error !== null) {
    const err = error as Record<string, unknown>;
    msg = String(err.message || err.details || err.hint || JSON.stringify(err));
  } else {
    msg = String(error);
  }

  if (msg.includes("CANNOT_GUARANTEE_OWN_LOAN")) return "CANNOT_GUARANTEE_OWN_LOAN";
  if (msg.includes("GUARANTOR_NOT_IN_GOOD_STANDING")) return "GUARANTOR_NOT_IN_GOOD_STANDING";
  if (msg.includes("GUARANTOR_HAS_DEFAULTED_LOANS")) return "GUARANTOR_HAS_DEFAULTED_LOANS";
  if (msg.includes("GUARANTOR_NOT_ACTIVE")) return "GUARANTOR_NOT_ACTIVE";
  if (msg.includes("LOAN_NOT_APPROVED_FOR_DISBURSEMENT")) return "LOAN_NOT_APPROVED_FOR_DISBURSEMENT";
  if (msg.includes("LOANS_RECEIVABLE_ACCOUNT_NOT_CONFIGURED")) return "LOANS_RECEIVABLE_ACCOUNT_NOT_CONFIGURED";
  if (msg.includes("LOAN_INTEREST_INCOME_ACCOUNT_NOT_CONFIGURED")) return "LOAN_INTEREST_INCOME_ACCOUNT_NOT_CONFIGURED";
  if (msg.includes("LOAN_NOT_IN_REPAYMENT")) return "LOAN_NOT_IN_REPAYMENT";
  if (msg.includes("REPAYMENT_EXCEEDS_OUTSTANDING_BALANCE")) return "REPAYMENT_EXCEEDS_OUTSTANDING_BALANCE";
  if (msg.includes("CURRENCY_MISMATCH")) return "CURRENCY_MISMATCH";
  if (msg.includes("INVALID_AMOUNT")) return "INVALID_AMOUNT";
  if (msg.includes("ACCOUNT_NOT_FOUND_OR_INACTIVE")) return "ACCOUNT_NOT_FOUND_OR_INACTIVE";
  if (msg.includes("UNAUTHORIZED")) return "UNAUTHORIZED";
  if (msg.includes("staleTenantAborted")) return "staleTenantAborted";
  return msg;
}

// ============================================================================
// Hooks
// ============================================================================

export function useDisburseLoan(currentGroupId: string) {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation<DisburseLoanResponse, Error, DisburseLoanInput>({
    mutationFn: async (input) => {
      if (input.groupId !== currentGroupId) {
        throw new Error("staleTenantAborted");
      }
      const { data, error } = await supabase.rpc("post_loan_disbursement", {
        p_command: {
          loan_id: input.loanId,
          account_id: input.accountId,
          disbursed_at: input.disbursedAt,
        },
      });
      if (error) throw new Error(parseLoanRpcError(error));
      return data as DisburseLoanResponse;
    },
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: ["loans", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["loans-admin", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["loan-schedule", input.loanId] });
      queryClient.invalidateQueries({ queryKey: ["loan-schedule", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["financial-events", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["financial-accounts", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["cashbook", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["financial-statements", input.groupId] });
    },
  });
}

export function useRecordLoanRepayment(currentGroupId: string) {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation<RecordLoanRepaymentResponse, Error, RecordLoanRepaymentInput>({
    mutationFn: async (input) => {
      if (input.groupId !== currentGroupId) {
        throw new Error("staleTenantAborted");
      }
      if (input.amount <= 0) {
        throw new Error("INVALID_AMOUNT");
      }
      const { data: prepared, error: prepareError } = await supabase.rpc("prepare_loan_repayment", {
        p_command: {
          loan_id: input.loanId,
          account_id: input.accountId,
          amount: input.amount,
          payment_method: input.paymentMethod,
          notes: input.notes,
          reference_number: input.referenceNumber,
          request_id: input.requestId ?? crypto.randomUUID(),
        },
      });
      if (prepareError) throw new Error(parseLoanRpcError(prepareError));
      const repaymentId = prepared?.repayment_id;
      if (typeof repaymentId !== "string") throw new Error("REPAYMENT_PREPARATION_FAILED");
      const { data, error } = await supabase.rpc("post_loan_repayment", {
        p_command: { repayment_id: repaymentId },
      });
      if (error) throw new Error(parseLoanRpcError(error));
      return data as RecordLoanRepaymentResponse;
    },
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: ["loans", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["loans-admin", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["loan-schedule", input.loanId] });
      queryClient.invalidateQueries({ queryKey: ["loan-schedule", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["loan-repayments", input.loanId] });
      queryClient.invalidateQueries({ queryKey: ["loan-repayments", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["financial-events", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["financial-accounts", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["cashbook", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["financial-statements", input.groupId] });
    },
  });
}

export function useApproveLoan(currentGroupId: string) {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation<void, Error, ApproveLoanInput>({
    mutationFn: async (input) => {
      if (input.groupId !== currentGroupId) {
        throw new Error("staleTenantAborted");
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("UNAUTHORIZED");

      const { error } = await supabase.from("loans")
        .update({
          status: "approved",
          amount_approved: input.amountApproved,
          interest_rate: input.interestRate,
          total_repayable: input.totalRepayable,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_notes: input.notes || null,
        })
        .eq("id", input.loanId)
        .eq("group_id", input.groupId);

      if (error) throw new Error(parseLoanRpcError(error));
    },
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: ["loans", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["loans-admin", input.groupId] });
    },
  });
}
