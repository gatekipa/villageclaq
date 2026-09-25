import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// ============================================================================
// Interfaces
// ============================================================================

export interface ManageEventInput {
  groupId: string;
  eventId?: string;
  payload: {
    title: string;
    description?: string;
    location?: string;
    event_type: "meeting" | "social" | "fundraiser" | "agm" | "emergency" | "other";
    starts_at: string;
    ends_at?: string;
    capacity?: number;
    status?: "upcoming" | "in_progress" | "completed" | "cancelled";
  };
}

export interface DeleteEventInput {
  groupId: string;
  eventId: string;
}

export interface RecordAttendanceInput {
  groupId: string;
  eventId: string;
  membershipId: string;
  status: "present" | "absent" | "excused" | "late";
  checkinMethod?: "manual" | "qr" | "pin";
}

export interface RecordRsvpInput {
  groupId: string;
  eventId: string;
  membershipId: string;
  response: 'yes' | 'no' | 'maybe';
}

export interface PostTicketPurchaseInput {
  groupId: string;
  eventId: string;
  tierId: string;
  membershipId: string;
  accountId: string;
}

export interface EventMutationResponse {
  ok: boolean;
  event_id?: string;
  purchase_id?: string;
}

// ============================================================================
// Error Parser
// ============================================================================

export function parseEventRpcError(error: unknown): string {
  let msg = "";
  if (error instanceof Error) {
    msg = error.message;
  } else if (typeof error === "object" && error !== null) {
    const err = error as Record<string, unknown>;
    msg = String(err.message || err.details || err.hint || JSON.stringify(err));
  } else {
    msg = String(error);
  }

  if (msg.includes("UNAUTHORIZED")) return "UNAUTHORIZED";
  if (msg.includes("EVENT_NOT_FOUND")) return "EVENT_NOT_FOUND";
  if (msg.includes("TIER_NOT_FOUND")) return "TIER_NOT_FOUND";
  if (msg.includes("MEMBER_NOT_FOUND")) return "MEMBER_NOT_FOUND";
  if (msg.includes("TIER_SALES_CLOSED")) return "TIER_SALES_CLOSED";
  if (msg.includes("TIER_SOLD_OUT")) return "TIER_SOLD_OUT";
  if (msg.includes("EVENT_AT_CAPACITY")) return "EVENT_AT_CAPACITY";
  if (msg.includes("EVENT_TICKET_INCOME_ACCOUNT_NOT_CONFIGURED")) return "EVENT_TICKET_INCOME_ACCOUNT_NOT_CONFIGURED";
  if (msg.includes("ACCOUNT_NOT_FOUND_OR_INACTIVE")) return "ACCOUNT_NOT_FOUND_OR_INACTIVE";
  if (msg.includes("staleTenantAborted")) return "staleTenantAborted";
  
  return msg;
}

// ============================================================================
// Hooks
// ============================================================================

export function useManageEvent(currentGroupId: string) {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation<EventMutationResponse, Error, ManageEventInput>({
    mutationFn: async (input) => {
      if (input.groupId !== currentGroupId) {
        throw new Error("staleTenantAborted");
      }
      const { data, error } = await supabase.rpc("manage_event", {
        p_group_id: input.groupId,
        p_payload: input.payload,
        p_event_id: input.eventId || null,
      });
      if (error) throw new Error(parseEventRpcError(error));
      return data as EventMutationResponse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events", currentGroupId] });
    },
  });
}

export function useDeleteEvent(currentGroupId: string) {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation<EventMutationResponse, Error, DeleteEventInput>({
    mutationFn: async (input) => {
      if (input.groupId !== currentGroupId) {
        throw new Error("staleTenantAborted");
      }
      const { data, error } = await supabase.rpc("delete_event", {
        p_group_id: input.groupId,
        p_event_id: input.eventId,
      });
      if (error) throw new Error(parseEventRpcError(error));
      return data as EventMutationResponse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events", currentGroupId] });
    },
  });
}

export function useRecordAttendance(currentGroupId: string) {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation<EventMutationResponse, Error, RecordAttendanceInput>({
    mutationFn: async (input) => {
      if (input.groupId !== currentGroupId) {
        throw new Error("staleTenantAborted");
      }
      const { data, error } = await supabase.rpc("record_event_attendance", {
        p_event_id: input.eventId,
        p_membership_id: input.membershipId,
        p_group_id: input.groupId,
        p_status: input.status,
        p_checkin_method: input.checkinMethod || "manual",
      });
      if (error) throw new Error(parseEventRpcError(error));
      return data as EventMutationResponse;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["event_attendances", variables.eventId] });
      queryClient.invalidateQueries({ queryKey: ["events", currentGroupId] });
    },
  });
}

export function useRecordRsvp(currentGroupId: string) {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation<EventMutationResponse, Error, RecordRsvpInput>({
    mutationFn: async (input) => {
      if (input.groupId !== currentGroupId) {
        throw new Error("staleTenantAborted");
      }
      const { data, error } = await supabase.rpc("record_event_rsvp", {
        p_event_id: input.eventId,
        p_membership_id: input.membershipId,
        p_group_id: input.groupId,
        p_response: input.response,
      });
      if (error) throw new Error(parseEventRpcError(error));
      return data as EventMutationResponse;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["my-rsvps"] });
      queryClient.invalidateQueries({ queryKey: ["rsvp-counts"] });
      queryClient.invalidateQueries({ queryKey: ["events", currentGroupId] });
    },
  });
}

export function usePostTicketPurchase(currentGroupId: string) {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation<EventMutationResponse, Error, PostTicketPurchaseInput>({
    mutationFn: async (input) => {
      if (input.groupId !== currentGroupId) {
        throw new Error("staleTenantAborted");
      }
      const { data, error } = await supabase.rpc("post_ticket_purchase", {
        p_event_id: input.eventId,
        p_tier_id: input.tierId,
        p_membership_id: input.membershipId,
        p_account_id: input.accountId,
        p_group_id: input.groupId,
      });
      if (error) throw new Error(parseEventRpcError(error));
      return data as EventMutationResponse;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["ticket_purchases", variables.eventId] });
      queryClient.invalidateQueries({ queryKey: ["ticket_tiers", variables.eventId] });
      queryClient.invalidateQueries({ queryKey: ["events", currentGroupId] });
    },
  });
}
