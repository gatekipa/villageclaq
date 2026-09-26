import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export function useOrganizationPublicProfile(currentGroupId: string) {
  const queryClient = useQueryClient();
  const supabase = createClient();

  const fetchProfile = useQuery({
    queryKey: ["public_profile", currentGroupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_public_profiles")
        .select("*")
        .eq("group_id", currentGroupId)
        .single();
      if (error && error.code !== "PGRST116") throw error;
      return data || null;
    }
  });

  const updateProfile = useMutation({
    mutationFn: async (input: { 
      groupId: string, slug: string, visibility: string, 
      displayName: string, description: string, 
      allowRequests: boolean, socialLinks: any 
    }) => {
      if (input.groupId !== currentGroupId) {
        throw new Error("staleTenantAborted");
      }
      const { data, error } = await supabase.rpc("configure_public_profile", {
        p_group_id: input.groupId,
        p_slug: input.slug,
        p_visibility: input.visibility,
        p_display_name: input.displayName,
        p_description: input.description,
        p_allow_requests: input.allowRequests,
        p_social_links: input.socialLinks || {}
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["public_profile", currentGroupId] });
    }
  });

  return { fetchProfile, updateProfile };
}

export function usePublicOrganizationView(slug: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["public_org_view", slug],
    queryFn: async () => {
      if (!slug) return null;
      const { data, error } = await supabase.rpc("get_public_organization_profile", {
        p_slug: slug
      });
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000
  });
}

export function useMembershipRequestSubmission() {
  const supabase = createClient();
  return useMutation({
    mutationFn: async (input: { slug: string, fullName: string, email: string, phone: string, message: string }) => {
      if (!input.email.includes("@")) throw new Error("INVALID_EMAIL");
      if (input.message.length > 2000) throw new Error("MESSAGE_TOO_LONG");
      
      const { data, error } = await supabase.rpc("submit_public_membership_request", {
        p_slug: input.slug,
        p_full_name: input.fullName.trim(),
        p_email: input.email.trim(),
        p_phone: input.phone ? input.phone.trim() : "",
        p_message: input.message.trim()
      });
      if (error) throw error;
      return data;
    }
  });
}
