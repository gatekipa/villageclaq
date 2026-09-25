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
  name: string;
  description?: string;
  coverageAmount: number;
  currency: string;
  waitingPeriodDays?: number;
}

export interface EnrollMemberInPlanInput {
  groupId: string;
  planId: string;
  membershipId: string;
}

export interface SubmitReliefClaimInput {
  groupId: string;
  planId: string;
  claimantMembershipId: string;
  incidentDate: string; // YYYY-MM-DD
  amountRequested: number;
  currency: string;
  documentUrls?: string[];
}

export interface ReviewReliefClaimInput {
  groupId: string;
  claimId: string;
  status: "approved" | "rejected";
  amountApproved?: number;
  reviewNotes?: string;
}

export interface DisburseReliefClaimInput {
  groupId: string;
  claimId: string;
  accountId: string;
  requestId?: string;
}

// ============================================================================
// Errors
// ============================================================================

export function parseReliefRpcError(error: unknown): string {
  if (!error) return "Unknown Error";
  const str = typeof error === "string" ? error : JSON.stringify(error);
  if (str.includes("staleTenantAborted") || str.includes("STALE_TENANT_ABORT")) return "staleTenantAborted";
  if (str.includes("CLAIM_NOT_APPROVED_FOR_PAYOUT")) return "CLAIM_NOT_APPROVED_FOR_PAYOUT";
  if (str.includes("CURRENCY_MISMATCH")) return "CURRENCY_MISMATCH";
  if (str.includes("NO_ACTIVE_EPOCH")) return "NO_ACTIVE_EPOCH";
  if (str.includes("ACCOUNT_NOT_FOUND_OR_INACTIVE") || str.includes("ACCOUNT_NOT_FOUND_OR_INVALID")) return "ACCOUNT_NOT_FOUND_OR_INACTIVE";
  if (str.includes("WAITING_PERIOD_NOT_MET")) return "WAITING_PERIOD_NOT_MET";
  if (str.includes("MEMBER_NOT_GOOD_STANDING")) return "MEMBER_NOT_GOOD_STANDING";
  if (str.includes("PAID_CLAIM_IMMUTABLE")) return "Paid claim is immutable.";
  if (str.includes("CLAIM_NOT_FOUND")) return "Claim not found.";
  if (str.includes("UNAUTHORIZED")) return "Unauthorized.";
  
  if (error instanceof Error) return error.message;
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
      
      const { data, error } = await supabase
        .from("relief_plans")
        .insert({
          group_id: input.groupId,
          name: input.name,
          description: input.description,
          coverage_amount: input.coverageAmount,
          currency: input.currency,
          waiting_period_days: input.waitingPeriodDays ?? 90,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: ["relief-plans", input.groupId] });
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

      // 1. Fetch the plan to get the waiting_period_days
      const { data: plan, error: planError } = await supabase
        .from("relief_plans")
        .select("waiting_period_days")
        .eq("id", input.planId)
        .eq("group_id", input.groupId)
        .single();
        
      if (planError || !plan) throw planError || new Error("Plan not found");

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
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: ["relief-enrollments", input.groupId] });
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

      const { data, error } = await supabase
        .from("relief_claims")
        .insert({
          group_id: input.groupId,
          plan_id: input.planId,
          claimant_membership_id: input.claimantMembershipId,
          incident_date: input.incidentDate,
          amount_requested: input.amountRequested,
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

      // We need the current user's membership ID for reviewed_by.
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user) throw new Error("Auth required");

      const { data: memberData, error: memberError } = await supabase
        .from("memberships")
        .select("id")
        .eq("group_id", input.groupId)
        .eq("user_id", userData.user.id)
        .single();
      
      if (memberError || !memberData) throw new Error("Membership not found for reviewer");

      const { data, error } = await supabase
        .from("relief_claims")
        .update({
          status: input.status,
          amount_approved: input.amountApproved,
          review_notes: input.reviewNotes,
          reviewed_by: memberData.id,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.claimId)
        .eq("group_id", input.groupId)
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
          request_id: input.requestId,
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
