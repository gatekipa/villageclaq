"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useGroup } from "@/lib/group-context";
import { logActivity } from "@/lib/audit-log";
import { isValidDecimalAmount } from "@/lib/hooks/use-record-transaction";

// ─── TYPES & INTERFACES ───────────────────────────────────────────────────────

export interface OpeningProvenanceInput {
  sourceDescription: string;
  sourceAt?: string | Date | null;
  reference?: string | null;
  evidenceIds?: string[];
}

export interface PostOpeningBalanceInput {
  groupId: string;
  accountId: string;
  fundId: string;
  amount: string; // Exact positive decimal string (no floating-point coercion)
  currency?: string;
  occurredAt: string | Date;
  provenance: OpeningProvenanceInput;
  openingOccurrenceId?: string; // Optional client-supplied UUID idempotency token
  openingProvenanceId?: string; // Optional client-supplied UUID provenance token
}

export interface OpeningBalanceResult {
  decision: "POSTED" | "IDEMPOTENT_RETURN_EXISTING";
  event_id: string;
  ledger_epoch_id: string;
  fingerprint: string;
  new_event_count: number;
  new_posting_count: number;
}

export interface AccountOpeningBalanceStatus {
  hasOpeningBalance: boolean;
  openingEventId?: string | null;
  openingAmount?: string | null;
  openingOccurredAt?: string | null;
  totalPostingsCount: number;
  canSetOpeningBalance: boolean;
}

// ─── VALIDATION & ERROR PARSING HELPERS ───────────────────────────────────────

/**
 * Validates the provenance source narrative:
 * Must be 3 to 1000 characters and free of ASCII/Unicode control characters.
 */
export function validateOpeningProvenanceDescription(desc: string): {
  valid: boolean;
  errorKey?: string;
} {
  if (!desc || typeof desc !== "string") {
    return { valid: false, errorKey: "PROVENANCE_REQUIRED" };
  }
  const trimmed = desc.trim();
  if (trimmed.length < 3 || trimmed.length > 1000) {
    return { valid: false, errorKey: "PROVENANCE_REQUIRED" };
  }
  // Disallow control characters and zero-width/BOM entities
  if (/[\u0001-\u001F\u007F-\u009F\u200B\uFEFF]/.test(trimmed)) {
    return { valid: false, errorKey: "PROVENANCE_REQUIRED" };
  }
  return { valid: true };
}

/**
 * Maps PostgreSQL exceptions and RPC rejections from `post_financial_opening_cash`
 * into standard localization error keys.
 */
export function parseOpeningBalanceRpcError(error: unknown): Error {
  if (!error || typeof error !== "object") {
    return new Error("GENERIC_ERROR");
  }

  const rawMessage = (error as { message?: string }).message || "";

  if (rawMessage.includes("ACCOUNT_KIND_NOT_ALLOWED")) return new Error("ACCOUNT_KIND_NOT_ALLOWED");
  if (rawMessage.includes("ACCOUNT_INACTIVE")) return new Error("ACCOUNT_INACTIVE");
  if (rawMessage.includes("ACCOUNT_NOT_FOUND")) return new Error("ACCOUNT_INACTIVE");
  if (rawMessage.includes("ACCOUNT_EPOCH_INCOMPATIBLE")) return new Error("DATE_BEFORE_ACCOUNT_OPENED");
  if (rawMessage.includes("FUND_REQUIRED") || rawMessage.includes("FUND_NOT_FOUND")) return new Error("FUND_REQUIRED");
  if (rawMessage.includes("FUND_INACTIVE")) return new Error("FUND_INACTIVE");
  if (rawMessage.includes("INVALID_PROVENANCE") || rawMessage.includes("PROVENANCE_REQUIRED")) return new Error("PROVENANCE_REQUIRED");
  if (rawMessage.includes("OPENING_BALANCE_ALREADY_SET")) return new Error("OPENING_BALANCE_ALREADY_SET");
  if (rawMessage.includes("AMOUNT_NOT_POSITIVE")) return new Error("AMOUNT_NOT_POSITIVE");
  if (rawMessage.includes("INVALID_AMOUNT")) return new Error("INVALID_AMOUNT");
  if (rawMessage.includes("EPOCH_NOT_FOUND")) return new Error("NO_ACTIVE_EPOCH");
  if (rawMessage.includes("EPOCH_AMBIGUOUS")) return new Error("EPOCH_AMBIGUOUS");
  if (rawMessage.includes("DENY") || rawMessage.includes("42501")) return new Error("DENY");
  if (rawMessage.includes("CONFLICT") || rawMessage.includes("REQUEST_ID_REUSED")) return new Error("CONFLICT");
  if (rawMessage.includes("staleTenantAborted")) return new Error("staleTenantAborted");

  return new Error(rawMessage || "GENERIC_ERROR");
}

// ─── QUERY HOOKS ─────────────────────────────────────────────────────────────

/**
 * Preflight check inspecting whether a custody account has already established
 * an opening cash balance or historical postings.
 */
export function useAccountOpeningBalanceStatus(
  groupId: string | null,
  accountId: string | null
) {
  return useQuery({
    queryKey: ["account-opening-status", groupId, accountId],
    queryFn: async (): Promise<AccountOpeningBalanceStatus> => {
      if (!groupId || !accountId) {
        return {
          hasOpeningBalance: false,
          totalPostingsCount: 0,
          canSetOpeningBalance: false,
        };
      }

      const supabase = createClient();

      // Query postings for this custody account
      const { data: postings, error: postErr } = await supabase
        .from("financial_postings")
        .select("id, event_id, amount_signed, occurred_at")
        .eq("group_id", groupId)
        .eq("account_id", accountId);

      if (postErr) {
        console.error("[useAccountOpeningBalanceStatus] Postings query failed:", postErr.message);
        throw postErr;
      }

      const totalPostingsCount = postings?.length ?? 0;
      if (totalPostingsCount === 0) {
        return {
          hasOpeningBalance: false,
          totalPostingsCount: 0,
          canSetOpeningBalance: true,
        };
      }

      // Check if any associated event is an opening balance event (effect_kind = 'opening_custody')
      const eventIds = Array.from(new Set(postings.map((p) => p.event_id)));
      const { data: openingEvents, error: evErr } = await supabase
        .from("financial_events")
        .select("id, occurred_at")
        .eq("group_id", groupId)
        .in("id", eventIds)
        .eq("effect_kind", "opening_custody");

      if (evErr) {
        console.error("[useAccountOpeningBalanceStatus] Events query failed:", evErr.message);
        throw evErr;
      }

      if (openingEvents && openingEvents.length > 0) {
        const openingEv = openingEvents[0];
        const matchPosting = postings.find((p) => p.event_id === openingEv.id);
        return {
          hasOpeningBalance: true,
          openingEventId: openingEv.id,
          openingAmount: matchPosting?.amount_signed != null ? String(matchPosting.amount_signed) : null,
          openingOccurredAt: openingEv.occurred_at,
          totalPostingsCount,
          canSetOpeningBalance: false,
        };
      }

      return {
        hasOpeningBalance: false,
        totalPostingsCount,
        canSetOpeningBalance: true,
      };
    },
    enabled: !!groupId && !!accountId,
    staleTime: 30 * 1000,
  });
}

// ─── MUTATION HOOK ───────────────────────────────────────────────────────────

/**
 * Mutation hook invoking `public.post_financial_opening_cash(jsonb)`
 * with full tenant boundary isolation, client UUID idempotency tokens,
 * exact decimal validation, and automatic cache invalidation.
 */
export function usePostOpeningBalance() {
  const queryClient = useQueryClient();
  const { groupId: currentGroupId } = useGroup();

  return useMutation({
    mutationFn: async (input: PostOpeningBalanceInput): Promise<OpeningBalanceResult> => {
      // 1. Tenant boundary guard
      if (input.groupId !== currentGroupId) {
        throw new Error("staleTenantAborted");
      }

      // 2. Exact decimal validation (no floating-point coercions)
      if (!isValidDecimalAmount(input.amount)) {
        throw new Error("INVALID_AMOUNT");
      }

      // 3. Provenance description validation
      const descValidation = validateOpeningProvenanceDescription(
        input.provenance.sourceDescription
      );
      if (!descValidation.valid) {
        throw new Error(descValidation.errorKey || "PROVENANCE_REQUIRED");
      }

      // 4. Token generation (idempotency and provenance identity)
      const occurrenceId = input.openingOccurrenceId || crypto.randomUUID();
      const provenanceId = input.openingProvenanceId || crypto.randomUUID();

      // 5. Construct reference metadata
      const referenceMetadata: Record<string, unknown> = {};
      if (input.provenance.reference?.trim()) {
        referenceMetadata.reference = input.provenance.reference.trim();
      }
      if (input.provenance.evidenceIds && input.provenance.evidenceIds.length > 0) {
        referenceMetadata.evidence_ids = input.provenance.evidenceIds;
      }

      // 6. Build strict provenance container
      const provenancePayload: Record<string, unknown> = {
        source_description: input.provenance.sourceDescription.trim(),
      };
      if (input.provenance.sourceAt) {
        provenancePayload.source_at = new Date(input.provenance.sourceAt).toISOString();
      }
      if (Object.keys(referenceMetadata).length > 0) {
        provenancePayload.reference_metadata = referenceMetadata;
      }

      // 7. Assemble strict p_command matching 00123_f3_05_opening_cash_command.sql
      const pCommand: Record<string, unknown> = {
        group_id: input.groupId,
        opening_occurrence_id: occurrenceId,
        opening_provenance_id: provenanceId,
        account_id: input.accountId,
        fund_id: input.fundId,
        amount: input.amount.trim(),
        occurred_at: new Date(input.occurredAt).toISOString(),
        provenance: provenancePayload,
      };

      if (input.currency) {
        pCommand.currency = input.currency.trim().toUpperCase();
      }

      // 8. Execute dedicated RPC
      const supabase = createClient();
      const { data, error } = await supabase.rpc("post_financial_opening_cash", {
        p_command: pCommand,
      });

      if (error) {
        console.error("[usePostOpeningBalance] RPC failed:", error.message);
        throw parseOpeningBalanceRpcError(error);
      }

      const result = data as OpeningBalanceResult;

      // 9. Activity audit logging
      await logActivity(supabase, {
        groupId: input.groupId,
        action: "finances.opening_balance_set",
        entityType: "financial_event",
        entityId: result.event_id,
        metadata: {
          event_id: result.event_id,
          account_id: input.accountId,
          fund_id: input.fundId,
          amount: input.amount,
          decision: result.decision,
        },
      });

      return result;
    },
    onSuccess: (_data, variables) => {
      // Invalidate relevant caches on success
      queryClient.invalidateQueries({
        queryKey: ["financial-accounts", variables.groupId],
      });
      queryClient.invalidateQueries({
        queryKey: ["financial-projection-bundle", variables.groupId],
      });
      queryClient.invalidateQueries({
        queryKey: ["financial-cashbook", variables.groupId],
      });
      queryClient.invalidateQueries({
        queryKey: ["account-balance", variables.groupId],
      });
      queryClient.invalidateQueries({
        queryKey: ["account-opening-status", variables.groupId],
      });
      queryClient.invalidateQueries({
        queryKey: ["financial-account-balance-preflight", variables.groupId],
      });
    },
  });
}
