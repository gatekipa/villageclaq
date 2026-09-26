"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useGroup } from "@/lib/group-context";

// ─── TYPES & INTERFACES ───────────────────────────────────────────────────────

export interface DuesPostingResult {
  decision: "POSTED" | "IDEMPOTENT_RETURN_EXISTING";
  payment_id: string;
  financial_event_id: string;
  posting_count: number;
}

export interface ConfirmDuesPaymentInput {
  groupId: string;
  paymentId: string;
  accountId: string;
  accountCurrency?: string;
  expectedCurrency?: string;
  categoryId?: string | null;
  fundId?: string | null;
  requestId?: string; // Optional client-supplied UUID idempotency token
  cashClass?: "non_refundable" | "refundable" | "conditional";
}

export interface RecordAndPostDuesPaymentInput {
  groupId: string;
  membershipId: string;
  amount: number | string;
  currency: string;
  paymentMethod: string;
  accountId: string; // Custody account receiving payment
  accountCurrency?: string;
  contributionTypeId?: string | null;
  obligationId?: string | null;
  referenceNumber?: string | null;
  receiptUrl?: string | null;
  notes?: string | null;
  paymentDate?: string | null;
  categoryId?: string | null;
  fundId?: string | null;
  requestId?: string;
  cashClass?: "non_refundable" | "refundable" | "conditional";
}

export interface RecordAndPostDuesPaymentResult {
  payment: Record<string, unknown>;
  posting: DuesPostingResult;
}

export interface DuesRecordIntent {
  request_id: string;
  payment_id: string;
  status: "prepared" | "posted";
  created_at: string;
  command: {
    amount: string;
    currency: string;
    membership_id: string;
    cash_class: string;
  };
}

// ─── ERROR PARSER ─────────────────────────────────────────────────────────────

/**
 * Maps PostgreSQL exceptions and RPC rejections from `post_dues_payment_confirmation`
 * into standard localization error keys.
 */
export function parseDuesPostingRpcError(error: unknown): Error {
  if (!error || typeof error !== "object") {
    return new Error("GENERIC_ERROR");
  }

  const rawMessage = (error as { message?: string }).message || "";

  if (rawMessage.includes("PAYMENT_NOT_FOUND")) return new Error("PAYMENT_NOT_FOUND");
  if (rawMessage.includes("PAYMENT_ALREADY_REJECTED")) return new Error("PAYMENT_ALREADY_REJECTED");
  if (rawMessage.includes("INVALID_PAYMENT_STATUS")) return new Error("INVALID_PAYMENT_STATUS");
  if (rawMessage.includes("ACCOUNT_NOT_FOUND") || rawMessage.includes("ACCOUNT_INACTIVE") || rawMessage.includes("ACCOUNT_NOT_FOUND_OR_INACTIVE")) return new Error("ACCOUNT_NOT_FOUND_OR_INACTIVE");
  if (rawMessage.includes("ACCOUNT_KIND_NOT_ALLOWED") || rawMessage.includes("ACCOUNT_KIND_INVALID")) return new Error("ACCOUNT_KIND_INVALID");
  if (rawMessage.includes("CROSS_GROUP_DIMENSION")) return new Error("CROSS_GROUP_DIMENSION");
  if (rawMessage.includes("CURRENCY_MISMATCH")) return new Error("CURRENCY_MISMATCH");
  if (rawMessage.includes("AMOUNT_PRECISION")) return new Error("AMOUNT_PRECISION");
  if (rawMessage.includes("INCOME_CATEGORY_REQUIRED")) return new Error("INCOME_CATEGORY_REQUIRED");
  if (rawMessage.includes("EPOCH_NOT_FOUND") || rawMessage.includes("NO_ACTIVE_EPOCH")) return new Error("NO_ACTIVE_EPOCH");
  if (rawMessage.includes("ACCOUNT_REQUIRED")) return new Error("ACCOUNT_REQUIRED");
  if (rawMessage.includes("AMOUNT_NOT_POSITIVE")) return new Error("AMOUNT_NOT_POSITIVE");
  if (rawMessage.includes("INVALID_AMOUNT")) return new Error("INVALID_AMOUNT");
  if (rawMessage.includes("OCCURRENCE_INTEGRITY")) return new Error("RECEIPT_VOUCHER_CONFLICT");
  if (rawMessage.includes("DENY") || rawMessage.includes("42501")) return new Error("DENY");
  if (rawMessage.includes("CONFLICT") || rawMessage.includes("REQUEST_ID_REUSED")) return new Error("CONFLICT");
  if (rawMessage.includes("staleTenantAborted")) return new Error("staleTenantAborted");

  return new Error(rawMessage || "GENERIC_ERROR");
}

// ─── MUTATION HOOKS ───────────────────────────────────────────────────────────

/**
 * Hook to confirm a member-submitted or pending dues payment and atomically post
 * a double-entry cash receipt into the canonical F3 general ledger.
 */
export function useConfirmDuesPayment() {
  const queryClient = useQueryClient();
  const { groupId: currentGroupId } = useGroup();

  return useMutation<DuesPostingResult, Error, ConfirmDuesPaymentInput>({
    mutationFn: async (input: ConfirmDuesPaymentInput) => {
      // 1. Cross-tenant context switch guard
      if (input.groupId !== currentGroupId) {
        throw new Error("staleTenantAborted");
      }

      // 2. Client invariants
      if (!input.accountId || input.accountId.trim() === "") {
        throw new Error("ACCOUNT_REQUIRED");
      }
      if (!input.paymentId || input.paymentId.trim() === "") {
        throw new Error("PAYMENT_NOT_FOUND");
      }
      if (input.expectedCurrency && input.accountCurrency && input.expectedCurrency !== input.accountCurrency) {
        throw new Error("CURRENCY_MISMATCH");
      }

      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("DENY");
      }

      // 3. Invoke atomic bridge RPC
      const { data, error } = await supabase.rpc("post_dues_payment_confirmation", {
        p_command: {
          payment_id: input.paymentId,
          account_id: input.accountId,
          category_id: input.categoryId || null,
          fund_id: input.fundId || null,
          cash_class: input.cashClass || "non_refundable",
        },
      });

      if (error) {
        throw parseDuesPostingRpcError(error);
      }

      const result = data as DuesPostingResult;

      return result;
    },
    onSuccess: (_, input) => {
      // Dues & dashboard queries
      queryClient.invalidateQueries({ queryKey: ["payments", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["contribution-obligations", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["obligations", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["matrix-data", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["money-overview", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["my-payments", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["member-payments"] });
      queryClient.invalidateQueries({ queryKey: ["member-obligations"] });

      // Ledger queries
      queryClient.invalidateQueries({ queryKey: ["financial-projection-bundle", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["financial-cashbook", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["financial-accounts", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["account-balance", input.groupId] });
    },
  });
}

/**
 * Hook for direct admin recording: inserts payment record and atomically executes
 * canonical F3 posting via `post_dues_payment_confirmation`.
 */
export function useRecordAndPostDuesPayment() {
  const queryClient = useQueryClient();
  const { groupId: currentGroupId } = useGroup();

  return useMutation<RecordAndPostDuesPaymentResult, Error, RecordAndPostDuesPaymentInput>({
    mutationFn: async (input: RecordAndPostDuesPaymentInput) => {
      // 1. Cross-tenant context switch guard
      if (input.groupId !== currentGroupId) {
        throw new Error("staleTenantAborted");
      }

      // 2. Client invariants
      if (!input.accountId || input.accountId.trim() === "") {
        throw new Error("ACCOUNT_REQUIRED");
      }
      if (input.accountCurrency && input.accountCurrency !== input.currency) {
        throw new Error("CURRENCY_MISMATCH");
      }

      const exactAmount = String(input.amount);
      if (!/^\d+(?:\.\d{1,2})?$/.test(exactAmount) || /^0+(?:\.0{1,2})?$/.test(exactAmount)) {
        throw new Error("AMOUNT_NOT_POSITIVE");
      }

      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("DENY");
      }

      const requestId = input.requestId || crypto.randomUUID();
      const command = {
        request_id: requestId,
        group_id: input.groupId,
        membership_id: input.membershipId,
        contribution_type_id: input.contributionTypeId || null,
        obligation_id: input.obligationId || null,
        amount: exactAmount,
        currency: input.currency,
        payment_method: input.paymentMethod,
        reference_number: input.referenceNumber || null,
        receipt_url: input.receiptUrl || null,
        notes: input.notes || null,
        recorded_at: input.paymentDate
          ? `${input.paymentDate}T${new Date().toISOString().split("T")[1]}`
          : new Date().toISOString(),
        cash_class: input.cashClass || "non_refundable",
        account_id: input.accountId,
        category_id: input.categoryId || null,
        fund_id: input.fundId || null,
      };
      const { error: prepareError } = await supabase.rpc("prepare_dues_record_intent", {
        p_command: command,
      });
      if (prepareError) throw parseDuesPostingRpcError(prepareError);
      const { data: postingData, error: rpcError } = await supabase.rpc("post_dues_record_intent", {
        p_request: requestId,
      });
      if (rpcError) throw parseDuesPostingRpcError(rpcError);
      const posting = postingData as DuesPostingResult;

      return {
        payment: { id: posting.payment_id },
        posting,
      };
    },
    onSuccess: (_, input) => {
      // Dues & dashboard queries
      queryClient.invalidateQueries({ queryKey: ["payments", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["contribution-obligations", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["obligations", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["matrix-data", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["money-overview", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["my-payments", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["member-payments"] });
      queryClient.invalidateQueries({ queryKey: ["member-obligations"] });

      // Ledger queries
      queryClient.invalidateQueries({ queryKey: ["financial-projection-bundle", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["financial-cashbook", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["financial-accounts", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["account-balance", input.groupId] });
    },
  });
}

export function useDuesRecordIntents(groupId: string | null, enabled: boolean) {
  return useQuery<DuesRecordIntent[]>({
    queryKey: ["dues-record-intents", groupId],
    enabled: enabled && !!groupId,
    queryFn: async () => {
      const { data, error } = await createClient().rpc("list_dues_record_intents", {
        p_group: groupId,
      });
      if (error) throw parseDuesPostingRpcError(error);
      return (data || []) as DuesRecordIntent[];
    },
  });
}

export function useRetryDuesRecordIntent(groupId: string | null) {
  const queryClient = useQueryClient();
  const { groupId: currentGroupId } = useGroup();
  return useMutation<DuesPostingResult, Error, string>({
    mutationFn: async (requestId) => {
      if (!groupId || groupId !== currentGroupId) throw new Error("staleTenantAborted");
      const { data, error } = await createClient().rpc("post_dues_record_intent", {
        p_request: requestId,
      });
      if (error) throw parseDuesPostingRpcError(error);
      return data as DuesPostingResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dues-record-intents", groupId] });
      queryClient.invalidateQueries({ queryKey: ["payments", groupId] });
      queryClient.invalidateQueries({ queryKey: ["financial-projection-bundle", groupId] });
      queryClient.invalidateQueries({ queryKey: ["financial-cashbook", groupId] });
    },
  });
}
