"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useGroup } from "@/lib/group-context";
import { logActivity } from "@/lib/audit-log";

// ─── TYPES & INTERFACES ───────────────────────────────────────────────────────

export type FinancialCommandAction = "money_in" | "money_out" | "transfer";

export interface RecordTransactionInput {
  action: FinancialCommandAction;
  groupId: string;
  amount: string; // Exact positive decimal string (no floating point)
  currency?: string;
  occurredAt?: string | Date;
  accountId: string; // Source custody account ID
  destinationAccountId?: string; // Required for transfer, prohibited for money_in/money_out
  categoryId?: string; // Required for money_in (income) / money_out (expense)
  fundId?: string; // Optional: defaults to group's default general fund
  memberId?: string; // Optional member attribution
  projectId?: string; // Optional project attribution
  description?: string; // Required for money_out
  reference?: string; // Optional reference / receipt note
  evidenceIds?: string[]; // Optional UUIDs of linked evidence
  requestId?: string; // Client idempotency UUID
}

export interface RecordTransactionResult {
  decision: "POSTED" | "IDEMPOTENT_RETURN_EXISTING";
  event_id: string;
  ledger_epoch_id: string;
  fingerprint: string;
  new_event_count: number;
  new_posting_count: number;
}

// ─── VALIDATION & ERROR PARSING HELPERS ───────────────────────────────────────

/**
 * Validates whether an amount string is an exact positive decimal string.
 * Strictly rejects exponential formats (e.g. 1e5), negative numbers, and non-numeric chars.
 */
export function isValidDecimalAmount(val: string): boolean {
  if (!val || typeof val !== "string") return false;
  const trimmed = val.trim();
  if (!/^[0-9]+(\.[0-9]+)?$/.test(trimmed)) return false;
  const num = Number(trimmed);
  return !isNaN(num) && num > 0;
}

/**
 * Parses raw Supabase/PostgreSQL RPC errors into standard error codes.
 */
export function parseFinancialRpcError(error: unknown): Error {
  if (!error || typeof error !== "object") {
    return new Error("genericError");
  }

  const rawMessage = (error as { message?: string }).message || "";

  if (rawMessage.includes("CROSS_CURRENCY_TRANSFER")) return new Error("crossCurrencyTransfer");
  if (rawMessage.includes("SAME_ACCOUNT")) return new Error("sameAccountTransfer");
  if (rawMessage.includes("CATEGORY_CLASS_MISMATCH")) return new Error("categoryClassMismatch");
  if (rawMessage.includes("CATEGORY_REQUIRED")) return new Error("categoryRequired");
  if (rawMessage.includes("DESTINATION_REQUIRED")) return new Error("destinationRequired");
  if (rawMessage.includes("DESCRIPTION_REQUIRED")) return new Error("descriptionRequired");
  if (rawMessage.includes("INVALID_AMOUNT")) return new Error("invalidAmount");
  if (rawMessage.includes("AMOUNT_NOT_POSITIVE")) return new Error("amountNotPositive");
  if (rawMessage.includes("AMOUNT_PRECISION")) return new Error("amountPrecision");
  if (rawMessage.includes("EPOCH_NOT_FOUND")) return new Error("noActiveEpoch");
  if (rawMessage.includes("ACCOUNT_EPOCH_INCOMPATIBLE")) return new Error("accountEpochIncompatible");
  if (rawMessage.includes("CONFLICT")) return new Error("conflict");
  if (rawMessage.includes("DENY") || rawMessage.includes("insufficient_privilege")) return new Error("permissionDenied");

  return new Error(rawMessage || "genericError");
}

// ─── MUTATION HOOK ───────────────────────────────────────────────────────────

/**
 * Mutation hook invoking canonical `post_financial_command` via Supabase RPC.
 * - Idempotency guaranteed via durable request_id
 * - Validates tenant boundary: currentGroupId === command.group_id
 * - Formats exact positive decimal strings
 * - Automatically invalidates related ledger and accounts queries on success
 */
export function useRecordTransaction() {
  const queryClient = useQueryClient();
  const { groupId: currentGroupId } = useGroup();

  return useMutation({
    mutationFn: async (input: RecordTransactionInput): Promise<RecordTransactionResult> => {
      // 1. Tenant boundary guard
      if (!currentGroupId || input.groupId !== currentGroupId) {
        throw new Error("staleTenantAborted");
      }

      // 2. Exact decimal amount validation
      const cleanAmount = input.amount.trim();
      if (!isValidDecimalAmount(cleanAmount)) {
        throw new Error("invalidAmount");
      }

      // 3. Action-specific constraints
      if (input.action === "money_out") {
        if (!input.description || input.description.trim().length === 0) {
          throw new Error("descriptionRequired");
        }
      }

      if (input.action === "transfer") {
        if (!input.destinationAccountId) {
          throw new Error("destinationRequired");
        }
        if (input.accountId === input.destinationAccountId) {
          throw new Error("sameAccountTransfer");
        }
      } else {
        // money_in or money_out
        if (!input.categoryId) {
          throw new Error("categoryRequired");
        }
      }

      // 4. Timestamp resolution
      const occurredAtIso = input.occurredAt instanceof Date
        ? input.occurredAt.toISOString()
        : input.occurredAt
        ? new Date(input.occurredAt).toISOString()
        : new Date().toISOString();

      // 5. Durable request_id generation
      const requestId = input.requestId || crypto.randomUUID();

      // 6. Build canonical p_command JSON object
      const p_command: Record<string, unknown> = {
        action: input.action,
        group_id: input.groupId,
        request_id: requestId,
        occurred_at: occurredAtIso,
        amount: cleanAmount,
        account_id: input.accountId,
      };

      if (input.currency) {
        p_command.currency = input.currency.toUpperCase();
      }

      if (input.action === "transfer") {
        p_command.destination_account_id = input.destinationAccountId;
        if (input.fundId) {
          p_command.fund_id = input.fundId;
        }
      } else {
        // money_in / money_out
        p_command.category_id = input.categoryId;
        if (input.fundId) {
          p_command.fund_id = input.fundId;
        }
        if (input.memberId) {
          p_command.member_id = input.memberId;
        }
        if (input.projectId) {
          p_command.project_id = input.projectId;
        }
      }

      if (input.description?.trim()) {
        p_command.description = input.description.trim();
      }

      if (input.reference?.trim() || (input.evidenceIds && input.evidenceIds.length > 0)) {
        p_command.reference_metadata = {
          ...(input.reference?.trim() ? { reference: input.reference.trim() } : {}),
          ...(input.evidenceIds && input.evidenceIds.length > 0 ? { evidence_ids: input.evidenceIds } : {}),
        };
      }

      const supabase = createClient();

      // 7. Invoke authoritative public.post_financial_command RPC
      const { data, error } = await supabase.rpc("post_financial_command", {
        p_command,
      });

      if (error) {
        throw parseFinancialRpcError(error);
      }

      const result = data as RecordTransactionResult;

      // 8. Best-effort audit log
      await logActivity(supabase, {
        groupId: input.groupId,
        action: `financial_transaction.${input.action}`,
        entityType: "financial_event",
        entityId: result.event_id,
        description: `Financial transaction (${input.action}) posted for ${cleanAmount} ${input.currency || ""}`,
        metadata: {
          action: input.action,
          amount: cleanAmount,
          currency: input.currency,
          decision: result.decision,
          requestId,
        },
      });

      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["financial-accounts", variables.groupId] });
      queryClient.invalidateQueries({ queryKey: ["financial-postings", variables.groupId] });
      queryClient.invalidateQueries({ queryKey: ["financial-overview", variables.groupId] });
      queryClient.invalidateQueries({ queryKey: ["account-balance", variables.groupId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats", variables.groupId] });
      queryClient.invalidateQueries({ queryKey: ["money-overview", variables.groupId] });
    },
  });
}
