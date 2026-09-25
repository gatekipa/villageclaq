"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useGroup } from "@/lib/group-context";
import { logActivity } from "@/lib/audit-log";
import { isValidDecimalAmount } from "@/lib/hooks/use-record-transaction";

// ─── TYPES & INTERFACES ───────────────────────────────────────────────────────

export type CorrectionIntent = "REVERSE" | "CORRECT";

export interface ReplacementReferenceMetadata {
  reference?: string;
  evidence_ids?: string[];
}

export interface ReplacementTransactionInput {
  action: "money_in" | "money_out" | "transfer";
  amount: string; // Exact positive decimal string
  currency: string;
  occurredAt: string | Date;
  accountId: string;
  destinationAccountId?: string;
  fundId: string;
  categoryId?: string;
  memberId?: string | null;
  projectId?: string | null;
  description?: string | null;
  referenceMetadata?: ReplacementReferenceMetadata;
}

export interface CorrectTransactionInput {
  groupId: string;
  targetEventId: string;
  intent: CorrectionIntent;
  correctionReason: string;
  replacement?: ReplacementTransactionInput;
  correctionRequestId?: string; // Optional client-supplied UUID idempotency token
}

export interface CorrectionResultPayload {
  target_event_id: string;
  status: "reversed" | "corrected";
  reversal_event_id: string;
  replacement_event_id: string | null;
  correction_request_id: string;
  correction_actor: string;
  correction_reason: string;
  corrected_at: string;
}

export interface CorrectionResult {
  decision: "REVERSED" | "CORRECTED" | "IDEMPOTENT_RETURN_EXISTING";
  result: CorrectionResultPayload;
  fingerprint: string;
  new_event_count: number;
  new_posting_count: number;
}

// ─── VALIDATION & ERROR PARSING HELPERS ───────────────────────────────────────

/**
 * Validates the correction audit narrative:
 * Must be 3 to 1000 characters and free of ASCII/Unicode control characters.
 */
export function validateCorrectionReason(reason: string): { valid: boolean; errorKey?: string } {
  if (!reason || typeof reason !== "string") {
    return { valid: false, errorKey: "reasonRequired" };
  }
  const trimmed = reason.trim();
  if (trimmed.length < 3 || trimmed.length > 1000) {
    return { valid: false, errorKey: "reasonLength" };
  }
  // Disallow ASCII control characters, DEL, Unicode C1 controls, zero-width space, and BOM
  if (/[\u0001-\u001F\u007F-\u009F\u200B\uFEFF]/.test(trimmed)) {
    return { valid: false, errorKey: "invalidReason" };
  }
  return { valid: true };
}

/**
 * Maps PostgreSQL exceptions from `correct_financial_event` into localized error keys.
 */
export function parseCorrectionRpcError(error: unknown): Error {
  if (!error || typeof error !== "object") {
    return new Error("genericError");
  }

  const rawMessage = (error as { message?: string }).message || "";

  if (rawMessage.includes("REASON_LENGTH")) return new Error("reasonLength");
  if (rawMessage.includes("INVALID_REASON")) return new Error("invalidReason");
  if (rawMessage.includes("REASON_REQUIRED")) return new Error("reasonRequired");
  if (rawMessage.includes("TARGET_ALREADY_CORRECTED")) return new Error("targetAlreadyCorrected");
  if (rawMessage.includes("TARGET_NOT_MANUAL")) return new Error("targetNotManual");
  if (rawMessage.includes("REVERSAL_TARGET_PROHIBITED")) return new Error("reversalTargetProhibited");
  if (rawMessage.includes("TARGET_NOT_FOUND")) return new Error("targetNotFound");
  if (rawMessage.includes("CROSS_EPOCH_REPLACEMENT")) return new Error("crossEpochReplacement");
  if (rawMessage.includes("CROSS_CURRENCY_REPLACEMENT")) return new Error("crossCurrencyReplacement");
  if (rawMessage.includes("ACTION_CHANGE_PROHIBITED")) return new Error("actionChangeProhibited");
  if (rawMessage.includes("DESCRIPTION_REQUIRED")) return new Error("descriptionRequired");
  if (rawMessage.includes("ACCOUNT_REQUIRED")) return new Error("accountRequired");
  if (rawMessage.includes("FUND_REQUIRED")) return new Error("fundRequired");
  if (rawMessage.includes("CATEGORY_REQUIRED")) return new Error("categoryRequired");
  if (rawMessage.includes("DESTINATION_REQUIRED")) return new Error("destinationRequired");
  if (rawMessage.includes("SAME_ACCOUNT")) return new Error("sameAccount");
  if (rawMessage.includes("CONFLICT")) return new Error("conflict");
  if (rawMessage.includes("DENY") || rawMessage.includes("insufficient_privilege")) return new Error("permissionDenied");

  return new Error(rawMessage || "genericError");
}

// ─── MUTATION HOOK ───────────────────────────────────────────────────────────

/**
 * Mutation hook for executing transaction reversals or corrections via `correct_financial_event`.
 * - Asserts tenant boundary: input.groupId === currentGroupId
 * - Validates reason constraints (3-1000 chars, no control chars)
 * - Generates idempotent client request token
 * - Invalidates projection bundle, cashbook, account balance and stats caches on success
 */
export function useCorrectTransaction() {
  const queryClient = useQueryClient();
  const { groupId: currentGroupId } = useGroup();

  return useMutation({
    mutationFn: async (input: CorrectTransactionInput): Promise<CorrectionResult> => {
      // 1. Tenant boundary assertion
      if (!currentGroupId || input.groupId !== currentGroupId) {
        throw new Error("staleTenantAborted");
      }

      // 2. Reason validation
      const reasonValidation = validateCorrectionReason(input.correctionReason);
      if (!reasonValidation.valid) {
        throw new Error(reasonValidation.errorKey || "reasonLength");
      }
      const cleanReason = input.correctionReason.trim();

      // 3. Intent & Replacement validation
      if (input.intent !== "REVERSE" && input.intent !== "CORRECT") {
        throw new Error("genericError");
      }

      if (input.intent === "REVERSE" && input.replacement) {
        throw new Error("genericError");
      }

      let replacementPayload: Record<string, unknown> | undefined = undefined;

      if (input.intent === "CORRECT") {
        if (!input.replacement) {
          throw new Error("genericError");
        }

        const rep = input.replacement;
        if (!rep.accountId) throw new Error("accountRequired");
        if (!rep.fundId) throw new Error("fundRequired");
        if (!isValidDecimalAmount(rep.amount)) throw new Error("invalidAmount");

        if (rep.action === "transfer") {
          if (!rep.destinationAccountId) throw new Error("destinationRequired");
          if (rep.accountId === rep.destinationAccountId) throw new Error("sameAccount");
        } else {
          if (!rep.categoryId) throw new Error("categoryRequired");
        }

        if (rep.action === "money_out") {
          if (!rep.description || rep.description.trim().length === 0) {
            throw new Error("descriptionRequired");
          }
        }

        const occurredIso = rep.occurredAt instanceof Date
          ? rep.occurredAt.toISOString()
          : rep.occurredAt
          ? new Date(rep.occurredAt).toISOString()
          : new Date().toISOString();

        replacementPayload = {
          action: rep.action,
          amount: rep.amount.trim(),
          currency: rep.currency.toUpperCase(),
          occurred_at: occurredIso,
          account_id: rep.accountId,
          fund_id: rep.fundId,
        };

        if (rep.action === "transfer") {
          replacementPayload.destination_account_id = rep.destinationAccountId;
        } else {
          replacementPayload.category_id = rep.categoryId;
        }

        if (rep.memberId) replacementPayload.member_id = rep.memberId;
        if (rep.projectId) replacementPayload.project_id = rep.projectId;
        if (rep.description) replacementPayload.description = rep.description.trim();
        if (rep.referenceMetadata) {
          replacementPayload.reference_metadata = rep.referenceMetadata;
        }
      }

      // 4. Generate client idempotency request UUID
      const requestId = input.correctionRequestId || crypto.randomUUID();

      // 5. Construct canonical p_command JSON object
      const p_command: Record<string, unknown> = {
        group_id: input.groupId,
        correction_request_id: requestId,
        target_event_id: input.targetEventId,
        intent: input.intent,
        correction_reason: cleanReason,
      };

      if (input.intent === "CORRECT" && replacementPayload) {
        p_command.replacement = replacementPayload;
      }

      // 6. Execute canonical Supabase RPC
      const supabase = createClient();
      const { data, error } = await supabase.rpc("correct_financial_event", {
        p_command,
      });

      if (error) {
        console.error("[useCorrectTransaction] RPC failed:", error.message);
        throw parseCorrectionRpcError(error);
      }

      const result = data as unknown as CorrectionResult;

      // 7. Audit activity log
      await logActivity(supabase, {
        groupId: input.groupId,
        action: input.intent === "REVERSE" ? "financial_transaction.reversed" : "financial_transaction.corrected",
        entityType: "financial_event",
        entityId: input.targetEventId,
        description: `Financial transaction ${input.intent === "REVERSE" ? "reversed" : "corrected"}: ${cleanReason}`,
        metadata: {
          decision: result.decision,
          reversal_event_id: result.result?.reversal_event_id,
          replacement_event_id: result.result?.replacement_event_id,
          correction_reason: cleanReason,
        },
      });

      return result;
    },
    onSuccess: (_, variables) => {
      // Invalidate projection bundle and cashbook queries
      queryClient.invalidateQueries({
        queryKey: ["financial-projection-bundle", variables.groupId],
      });
      queryClient.invalidateQueries({
        queryKey: ["financial-cashbook", variables.groupId],
      });
      queryClient.invalidateQueries({
        queryKey: ["financial-accounts", variables.groupId],
      });
      queryClient.invalidateQueries({
        queryKey: ["financial-overview", variables.groupId],
      });
      queryClient.invalidateQueries({
        queryKey: ["fine-stats-finance", variables.groupId],
      });
      queryClient.invalidateQueries({
        queryKey: ["loan-stats-finance", variables.groupId],
      });
    },
  });
}
