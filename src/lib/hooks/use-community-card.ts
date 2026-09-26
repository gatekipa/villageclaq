import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type CardType = 'membership_card' | 'election_success' | 'milestone_achievement';

export function useCommunityCard(currentGroupId: string) {
  const queryClient = useQueryClient();
  const supabase = createClient();

  const issueCard = useMutation({
    mutationFn: async (input: { groupId: string; cardType: CardType }) => {
      if (input.groupId !== currentGroupId) {
        throw new Error("staleTenantAborted");
      }
      const { data, error } = await supabase.rpc("issue_member_share_card", {
        p_group_id: input.groupId,
        p_card_type: input.cardType
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community_cards", currentGroupId] });
    }
  });

  const revokeCard = useMutation({
    mutationFn: async (input: { groupId: string; cardId: string }) => {
      if (input.groupId !== currentGroupId) {
        throw new Error("staleTenantAborted");
      }
      const { error } = await supabase.rpc("revoke_share_card", {
        p_group_id: input.groupId,
        p_card_id: input.cardId
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community_cards", currentGroupId] });
    }
  });

  const useMemberActiveCards = () => {
    return useQuery({
      queryKey: ["community_cards", currentGroupId],
      queryFn: async () => {
        const { data, error } = await supabase
          .from("community_share_cards")
          .select("*")
          .eq("group_id", currentGroupId)
          .eq("revoked", false);
        if (error) throw error;
        return data;
      }
    });
  };

  return { issueCard, revokeCard, useMemberActiveCards };
}

export function usePublicCardVerification(shareToken: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["public_card_verification", shareToken],
    queryFn: async () => {
      if (!shareToken) return null;
      const { data, error } = await supabase.rpc("verify_public_share_token", {
        p_token: shareToken
      });
      if (error) throw error;
      return data;
    },
    enabled: !!shareToken,
    staleTime: 1000 * 60 * 5
  });
}
