import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { createAnnouncementAction } from "@/lib/actions/communications";

export function parseCommunicationRpcError(error: unknown): string {
  if (!error) return "unknownError";
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();

  if (msg.includes("unauthorized") || msg.includes("permission denied")) return "UNAUTHORIZED";
  if (msg.includes("invalid_audience")) return "INVALID_AUDIENCE";
  if (msg.includes("invalid_channel")) return "INVALID_CHANNEL";
  if (msg.includes("empty_message")) return "EMPTY_MESSAGE";
  if (msg.includes("stale_tenant") || msg.includes("staletenantaborted")) return "staleTenantAborted";

  return msg;
}

export function useCreateAnnouncement(currentGroupId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      groupId: string;
      title: string;
      titleFr?: string;
      body: string;
      bodyFr?: string;
      audienceType: "all" | "roles" | "specific";
      targetRoles?: string[];
      targetMemberIds?: string[];
      channels: ("in_app" | "email" | "sms" | "whatsapp")[];
      scheduledAt?: string;
      createdBy: string;
      asDraft?: boolean;
    }) => {
      if (input.groupId !== currentGroupId) {
        throw new Error("staleTenantAborted");
      }
      return createAnnouncementAction(input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements", currentGroupId] });
      queryClient.invalidateQueries({ queryKey: ["aggregated-feed", currentGroupId] });
      queryClient.invalidateQueries({ queryKey: ["notifications", currentGroupId] });
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count", currentGroupId] });
    },
  });
}

export function useQueueNotification(currentGroupId: string) {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (input: {
      groupId: string;
      membershipId: string;
      channel: string;
      templateKey: string;
      recipientAddress?: string;
      payload: Record<string, unknown>;
      idempotencyKey: string;
    }) => {
      if (input.groupId !== currentGroupId) {
        throw new Error("staleTenantAborted");
      }

      const { data, error } = await supabase.rpc("queue_transactional_notification", {
        p_command: {
          group_id: input.groupId,
          membership_id: input.membershipId,
          channel: input.channel,
          template_key: input.templateKey,
          recipient_address: input.recipientAddress,
          payload: input.payload,
          idempotency_key: input.idempotencyKey,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications", currentGroupId] });
    },
  });
}
