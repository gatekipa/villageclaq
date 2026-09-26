import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export function useGroupReferral(currentGroupId: string) {
  const queryClient = useQueryClient();
  const supabase = createClient();

  const generateReferral = useMutation({
    mutationFn: async (input: { groupId: string; targetOrgType?: string }) => {
      if (input.groupId !== currentGroupId) {
        throw new Error("staleTenantAborted");
      }
      const { data, error } = await supabase.rpc("generate_group_referral_link", {
        p_group_id: input.groupId,
        p_target_org_type: input.targetOrgType || null
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization_referrals", currentGroupId] });
    }
  });

  const ownReferrals = useQuery({
    queryKey: ["organization_referrals", currentGroupId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_own_group_referrals", {
        p_group_id: currentGroupId,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as Array<{
        id: string; status: string; created_at: string; expires_at: string;
      }>;
    },
    enabled: !!currentGroupId,
  });

  const revokeReferral = useMutation({
    mutationFn: async (input: { groupId: string; referralId: string }) => {
      if (input.groupId !== currentGroupId) throw new Error("staleTenantAborted");
      const { error } = await supabase.rpc("revoke_group_referral_by_id", {
        p_referral_id: input.referralId,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({
      queryKey: ["organization_referrals", currentGroupId],
    }),
  });

  return { generateReferral, ownReferrals, revokeReferral };
}

export function useReferralIngress() {
  const supabase = createClient();

  const claimReferral = useMutation({
    mutationFn: async (input: { token: string; newGroupId: string }) => {
      if (!input.token || input.token.trim() === '') {
        throw new Error("INVALID_TOKEN");
      }
      const { data, error } = await supabase.rpc("claim_group_referral", {
        p_token: input.token,
        p_new_group_id: input.newGroupId
      });
      if (error) throw error;
      return data;
    }
  });

  const storeToken = (token: string) => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("villageclaq_ref_token", token);
    }
  };

  const retrieveToken = (): string | null => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("villageclaq_ref_token");
    }
    return null;
  };

  const clearToken = () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("villageclaq_ref_token");
    }
  };

  return { claimReferral, storeToken, retrieveToken, clearToken };
}
