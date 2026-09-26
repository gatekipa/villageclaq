"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useGroup } from "@/lib/group-context";

const supabase = createClient();

// ============================================================================
// Types & Input Interfaces
// ============================================================================

export interface CreateReliefPlanInput {
  groupId: string;
  requestId: string;
  name: string;
  description?: string;
  coverageAmount: number;
  currency: string;
  waitingPeriodDays?: number;
  participationUnitId?: string;
  participationMode?: "unit" | "subtree" | "organization";
  collectionUnitId?: string;
  collectionMode?: "unit" | "subtree" | "organization";
  reportingUnitId?: string;
  reportingMode?: "unit" | "subtree" | "organization";
}

export interface EnrollMemberInPlanInput {
  groupId: string;
  planId: string;
  membershipId: string;
  enrollmentType?: "full_member" | "relief_only" | "external";
}

export interface SubmitReliefClaimInput {
  groupId: string;
  planId: string;
  claimantMembershipId: string;
  eventType: "death" | "illness" | "wedding" | "childbirth" | "natural_disaster" | "other";
  incidentDate: string; // YYYY-MM-DD
  amountRequested: number;
  currency: string;
  documentUrls?: string[];
}

export interface ReviewReliefClaimInput {
  groupId: string;
  claimGroupId: string;
  claimId: string;
  expectedVersion: number;
  status: "approved" | "rejected";
  amountApproved?: number;
  reviewNotes?: string;
}

export interface DisburseReliefClaimInput {
  groupId: string;
  claimId: string;
  accountId: string;
  fundId: string;
  ownerFundId?: string;
  requestId?: string;
}

// ============================================================================
// Errors
// ============================================================================

export function parseReliefRpcError(error: unknown): string {
  if (!error) return "Unknown Error";
  let str = typeof error === "string" ? error : "";
  if (error instanceof Error) str += error.message;
  if (typeof error === "object" && error !== null) {
    const errObj = error as Record<string, unknown>;
    if ("message" in errObj && typeof errObj.message === "string") str += errObj.message;
    if ("code" in errObj && typeof errObj.code === "string") str += errObj.code;
    try { str += JSON.stringify(error); } catch {}
  }
  
  if (str.includes("staleTenantAborted") || str.includes("STALE_TENANT_ABORT")) return "staleTenantAborted";
  if (str.includes("CLAIM_NOT_APPROVED_FOR_PAYOUT")) return "CLAIM_NOT_APPROVED_FOR_PAYOUT";
  if (str.includes("CURRENCY_MISMATCH")) return "CURRENCY_MISMATCH";
  if (str.includes("NO_ACTIVE_EPOCH")) return "NO_ACTIVE_EPOCH";
  if (str.includes("ACCOUNT_NOT_FOUND_OR_INACTIVE") || str.includes("ACCOUNT_NOT_FOUND_OR_INVALID")) return "ACCOUNT_NOT_FOUND_OR_INACTIVE";
  if (str.includes("WAITING_PERIOD_NOT_MET")) return "WAITING_PERIOD_NOT_MET";
  if (str.includes("CLAIM_PREMATURE_WAITING_PERIOD_NOT_MET")) return "CLAIM_PREMATURE_WAITING_PERIOD_NOT_MET";
  if (str.includes("RELIEF_EXPENSE_ACCOUNT_NOT_CONFIGURED")) return "RELIEF_EXPENSE_ACCOUNT_NOT_CONFIGURED";
  if (str.includes("INSUFFICIENT_ACCOUNT_BALANCE")) return "INSUFFICIENT_ACCOUNT_BALANCE";
  if (str.includes("MEMBER_NOT_ENROLLED_IN_PLAN")) return "MEMBER_NOT_ENROLLED_IN_PLAN";
  if (str.includes("MEMBER_NOT_GOOD_STANDING")) return "MEMBER_NOT_GOOD_STANDING";
  if (str.includes("PAID_CLAIM_IMMUTABLE")) return "Paid claim is immutable.";
  if (str.includes("CLAIM_NOT_FOUND")) return "Claim not found.";
  if (str.includes("UNAUTHORIZED")) return "Unauthorized.";
  if (str.includes("23505") || str.includes("unique_violation")) return "MEMBER_ALREADY_ENROLLED";
  
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) return String((error as Record<string, unknown>).message);
  return "An unexpected error occurred.";
}

// ============================================================================
// Hooks
// ============================================================================

export function useCreateReliefPlan() {
  const queryClient = useQueryClient();
  const { groupId } = useGroup();

  return useMutation({
    mutationFn: async (input: CreateReliefPlanInput) => {
      if (!groupId || input.groupId !== groupId) {
        throw new Error("staleTenantAborted");
      }
      
      const { data, error } = await supabase.rpc("create_relief_plan_with_scope", {
        p_command: {
          request_id: input.requestId,
          group_id: input.groupId,
          name: input.name,
          description: input.description,
          coverage_amount: input.coverageAmount,
          currency: input.currency,
          waiting_period_days: input.waitingPeriodDays ?? 90,
          ...(input.participationUnitId ? {
            participation_unit_id: input.participationUnitId,
            participation_mode: input.participationMode,
            collection_unit_id: input.collectionUnitId ?? input.participationUnitId,
            collection_mode: input.collectionMode ?? input.participationMode,
            reporting_unit_id: input.reportingUnitId ?? input.participationUnitId,
            reporting_mode: input.reportingMode ?? input.participationMode,
          } : {}),
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: ["relief-plans", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["relief-plans-available", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["relief-plan-scopes", input.groupId] });
    },
  });
}

export function useEnrollMemberInPlan() {
  const queryClient = useQueryClient();
  const { groupId } = useGroup();

  return useMutation({
    mutationFn: async (input: EnrollMemberInPlanInput) => {
      if (!groupId || input.groupId !== groupId) {
        throw new Error("staleTenantAborted");
      }

      const { data: availablePlans, error: planError } = await supabase.rpc(
        "list_relief_plans_for_group", { p_group: input.groupId });
      if (planError) throw planError;
      const plan = (availablePlans || []).find((candidate: { id: string }) =>
        candidate.id === input.planId);
      if (!plan) throw new Error("Plan not found");
      const { data: contracted, error: contractError } = await supabase.rpc(
        "relief_plan_is_contracted", { p_plan: input.planId });
      if (contractError) throw contractError;
      if (contracted) {
        const { data, error } = await supabase.rpc("enroll_relief_person", {
          p_command: {
            request_id: crypto.randomUUID(),
            plan_id: input.planId,
            membership_id: input.membershipId,
            group_id: input.groupId,
            enrollment_type: input.enrollmentType ?? "full_member",
          },
        });
        if (error) throw error;
        return { id: (data as { enrollment_id: string }).enrollment_id };
      }
      if (plan.group_id !== input.groupId) {
        throw new Error("Plan not available in this group");
      }

      // 1.5. Check for existing active enrollment
      const { data: existing } = await supabase
        .from("relief_enrollments")
        .select("id")
        .eq("plan_id", input.planId)
        .eq("membership_id", input.membershipId)
        .eq("status", "active")
        .maybeSingle();
      if (existing) throw new Error("MEMBER_ALREADY_ENROLLED");

      // 2. Compute matures_at
      const enrolledAt = new Date();
      const maturesAt = new Date(enrolledAt.getTime() + plan.waiting_period_days * 24 * 60 * 60 * 1000);

      // 3. Insert enrollment
      const { data, error } = await supabase
        .from("relief_enrollments")
        .insert({
          group_id: input.groupId,
          plan_id: input.planId,
          membership_id: input.membershipId,
          enrolled_at: enrolledAt.toISOString(),
          matures_at: maturesAt.toISOString(),
          enrollment_type: input.enrollmentType ?? "full_member",
          is_active: true,
          status: "active",
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') throw new Error("MEMBER_ALREADY_ENROLLED");
        throw error;
      }
      return data;
    },
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: ["relief-enrollments", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["relief-receipt-catalog", input.groupId] });
    },
  });
}

export function useSubmitReliefClaim() {
  const queryClient = useQueryClient();
  const { groupId } = useGroup();

  return useMutation({
    mutationFn: async (input: SubmitReliefClaimInput) => {
      if (!groupId || input.groupId !== groupId) {
        throw new Error("staleTenantAborted");
      }
      const { data: plans, error: planError } = await supabase.rpc(
        "list_relief_plans_for_group", { p_group: input.groupId });
      if (planError) throw planError;
      const plan = (plans || []).find((candidate: { id: string }) =>
        candidate.id === input.planId);
      if (!plan) throw new Error("Plan not available in this group");

      const { data, error } = await supabase
        .from("relief_claims")
        .insert({
          group_id: plan.group_id,
          plan_id: input.planId,
          claimant_membership_id: input.claimantMembershipId,
          membership_id: input.claimantMembershipId,
          event_type: input.eventType,
          incident_date: input.incidentDate,
          amount_requested: input.amountRequested,
          amount: input.amountRequested,
          currency: input.currency,
          document_urls: input.documentUrls || [],
          status: "submitted",
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: ["relief-claims", input.groupId] });
    },
  });
}

export function useReviewReliefClaim() {
  const queryClient = useQueryClient();
  const { groupId } = useGroup();

  return useMutation({
    mutationFn: async (input: ReviewReliefClaimInput) => {
      if (!groupId || input.groupId !== groupId) {
        throw new Error("staleTenantAborted");
      }

      const { data, error } = await supabase.rpc("decide_relief_claim", {
        p_command: {
          group_id: input.claimGroupId,
          claim_id: input.claimId,
          request_id: crypto.randomUUID(),
          expected_version: input.expectedVersion,
          status: input.status,
          ...(input.status === "approved" ? { amount_approved: input.amountApproved } : {}),
          review_notes: input.reviewNotes,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: ["relief-claims", input.groupId] });
    },
  });
}

export function useDisburseReliefClaim() {
  const queryClient = useQueryClient();
  const { groupId } = useGroup();

  return useMutation({
    mutationFn: async (input: DisburseReliefClaimInput) => {
      if (!groupId || input.groupId !== groupId) {
        throw new Error("staleTenantAborted");
      }

      const { data, error } = await supabase.rpc("post_relief_claim_payout", {
        p_command: {
          claim_id: input.claimId,
          account_id: input.accountId,
          fund_id: input.fundId,
          ...(input.ownerFundId ? { owner_fund_id: input.ownerFundId } : {}),
          ...(input.requestId ? { request_id: input.requestId } : {}),
        }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (_, input) => {
      // Comprehensive Cache Invalidation on Disbursement
      queryClient.invalidateQueries({ queryKey: ["relief-claims", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["relief-plans", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["relief-enrollments", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["financial-events", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["financial-accounts", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["cashbook", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["financial-statements", input.groupId] });
    },
  });
}
