"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useGroup } from "@/lib/group-context";

const supabase = createClient();

// ============================================================================
// Types & Input Interfaces
// ============================================================================

export type MembershipRole = "admin" | "moderator" | "member";
export type MembershipLifecycleStatus = "active" | "suspended" | "exited" | "archived";

export interface CreateGroupInvitationInput {
  groupId: string;
  email?: string | null;
  phone?: string | null;
  role?: MembershipRole;
  expiresInDays?: number;
}

export interface CreateGroupInvitationResult {
  ok: boolean;
  invitation_id: string;
  token: string;
  group_id: string;
  role: string;
  is_existing: boolean;
  expires_at: string;
}

export interface UpdateMembershipRoleInput {
  groupId: string;
  membershipId: string;
  newRole: MembershipRole;
}

export interface UpdateMembershipRoleResult {
  ok: boolean;
  membership_id: string;
  group_id: string;
  old_role: string;
  new_role: string;
}

export interface TransferGroupOwnershipInput {
  groupId: string;
  newOwnerMembershipId: string;
}

export interface TransferGroupOwnershipResult {
  ok: boolean;
  status: string;
  group_id: string;
  previous_owner_membership_id: string;
  new_owner_membership_id: string;
  previous_owner_user_id: string;
  new_owner_user_id: string;
}

export interface SetMembershipLifecycleStatusInput {
  groupId: string;
  membershipId: string;
  newStatus: MembershipLifecycleStatus;
  reason?: string;
}

export interface SetMembershipLifecycleStatusResult {
  ok: boolean;
  membership_id: string;
  group_id: string;
  old_status: string;
  new_status: string;
  reason?: string;
  unchanged?: boolean;
}

export interface UpdateMemberDisplayNameInput {
  groupId: string;
  membershipId: string;
  displayName: string;
}

export interface UpdateMemberDisplayNameResult {
  ok: boolean;
  membership_id: string;
  group_id: string;
  display_name: string;
}

// ============================================================================
// Error Parser
// ============================================================================

export const MEMBERSHIP_RPC_ERROR_KEYS = [
  "MEMBERSHIP_HARD_DELETE_PROHIBITED",
  "OWNER_INVITATION_PROHIBITED",
  "INSUFFICIENT_INVITE_PRIVILEGE",
  "SOLE_OWNER_DEMOTION_PROHIBITED",
  "SOLE_OWNER_STATUS_LOCK",
  "TRANSFER_TO_SELF_PROHIBITED",
  "TARGET_NOT_ACTIVE_MEMBER",
  "staleTenantAborted",
  "GENERIC_ERROR",
] as const;

export type MembershipRpcErrorKey = (typeof MEMBERSHIP_RPC_ERROR_KEYS)[number];

export function parseMembershipRpcError(error: unknown): MembershipRpcErrorKey {
  if (!error) return "GENERIC_ERROR";

  const msg = typeof error === "string" 
    ? error 
    : (error as { message?: string })?.message || String(error);

  if (msg.includes("MEMBERSHIP_HARD_DELETE_PROHIBITED")) return "MEMBERSHIP_HARD_DELETE_PROHIBITED";
  if (msg.includes("CANNOT_INVITE_AS_OWNER") || msg.includes("OWNER_INVITATION_PROHIBITED")) return "OWNER_INVITATION_PROHIBITED";
  if (msg.includes("PRIVILEGE_ELEVATION_DENIED") || msg.includes("INSUFFICIENT_INVITE_PRIVILEGE")) return "INSUFFICIENT_INVITE_PRIVILEGE";
  if (msg.includes("SOLE_OWNER_DEMOTION_PROHIBITED")) return "SOLE_OWNER_DEMOTION_PROHIBITED";
  if (msg.includes("SOLE_OWNER_STATUS_LOCK")) return "SOLE_OWNER_STATUS_LOCK";
  if (msg.includes("CANNOT_TRANSFER_TO_SELF") || msg.includes("TRANSFER_TO_SELF_PROHIBITED")) return "TRANSFER_TO_SELF_PROHIBITED";
  if (msg.includes("TARGET_MUST_BE_ACTIVE") || msg.includes("TARGET_NOT_ACTIVE_MEMBER")) return "TARGET_NOT_ACTIVE_MEMBER";
  if (msg.includes("staleTenantAborted") || msg.includes("STALE_TENANT_ABORTED")) return "staleTenantAborted";

  return "GENERIC_ERROR";
}

// ============================================================================
// Domain Invalidation Helper
// ============================================================================

function invalidateMembershipDomains(queryClient: ReturnType<typeof useQueryClient>, groupId: string) {
  queryClient.invalidateQueries({ queryKey: ["members", groupId] });
  queryClient.invalidateQueries({ queryKey: ["memberships", groupId] });
  queryClient.invalidateQueries({ queryKey: ["invitations", groupId] });
  queryClient.invalidateQueries({ queryKey: ["group-permissions", groupId] });
  queryClient.invalidateQueries({ queryKey: ["current-membership", groupId] });
  queryClient.invalidateQueries({ queryKey: ["user-permissions", groupId] });
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Creates a new invitation for a group with tenant isolation and role privilege caps.
 */
export function useCreateGroupInvitation() {
  const queryClient = useQueryClient();
  const { groupId: currentGroupId } = useGroup();

  return useMutation<CreateGroupInvitationResult, Error, CreateGroupInvitationInput>({
    mutationFn: async (input) => {
      if (!currentGroupId || input.groupId !== currentGroupId) {
        throw new Error("staleTenantAborted");
      }

      const { data, error } = await supabase.rpc("create_group_invitation", {
        p_command: {
          group_id: input.groupId,
          email: input.email || undefined,
          phone: input.phone || undefined,
          role: input.role || "member",
          expires_in_days: input.expiresInDays || 7,
        },
      });

      if (error) throw error;
      const res = data as CreateGroupInvitationResult;
      if (!res?.ok) throw new Error("GENERIC_ERROR");
      return res;
    },
    onSuccess: (_, input) => {
      invalidateMembershipDomains(queryClient, input.groupId);
    },
  });
}

/**
 * Updates a member's role (admin, moderator, member) with sole owner protection.
 */
export function useUpdateMembershipRole() {
  const queryClient = useQueryClient();
  const { groupId: currentGroupId } = useGroup();

  return useMutation<UpdateMembershipRoleResult, Error, UpdateMembershipRoleInput>({
    mutationFn: async (input) => {
      if (!currentGroupId || input.groupId !== currentGroupId) {
        throw new Error("staleTenantAborted");
      }

      const { data, error } = await supabase.rpc("update_membership_role", {
        p_command: {
          membership_id: input.membershipId,
          new_role: input.newRole,
        },
      });

      if (error) throw error;
      const res = data as UpdateMembershipRoleResult;
      if (!res?.ok) throw new Error("GENERIC_ERROR");
      return res;
    },
    onSuccess: (_, input) => {
      invalidateMembershipDomains(queryClient, input.groupId);
    },
  });
}

/**
 * Atomically transfers group ownership from caller to target active member.
 */
export function useTransferGroupOwnership() {
  const queryClient = useQueryClient();
  const { groupId: currentGroupId } = useGroup();

  return useMutation<TransferGroupOwnershipResult, Error, TransferGroupOwnershipInput>({
    mutationFn: async (input) => {
      if (!currentGroupId || input.groupId !== currentGroupId) {
        throw new Error("staleTenantAborted");
      }

      const { data, error } = await supabase.rpc("transfer_group_ownership", {
        p_command: {
          group_id: input.groupId,
          new_owner_membership_id: input.newOwnerMembershipId,
        },
      });

      if (error) throw error;
      const res = data as TransferGroupOwnershipResult;
      if (!res?.ok && res?.status !== "success") throw new Error("GENERIC_ERROR");
      return res;
    },
    onSuccess: (_, input) => {
      invalidateMembershipDomains(queryClient, input.groupId);
    },
  });
}

/**
 * Sets membership lifecycle status (active, suspended, exited, archived).
 */
export function useSetMembershipLifecycleStatus() {
  const queryClient = useQueryClient();
  const { groupId: currentGroupId } = useGroup();

  return useMutation<SetMembershipLifecycleStatusResult, Error, SetMembershipLifecycleStatusInput>({
    mutationFn: async (input) => {
      if (!currentGroupId || input.groupId !== currentGroupId) {
        throw new Error("staleTenantAborted");
      }

      const { data, error } = await supabase.rpc("set_membership_lifecycle_status", {
        p_command: {
          membership_id: input.membershipId,
          new_status: input.newStatus,
          reason: input.reason || undefined,
        },
      });

      if (error) throw error;
      const res = data as SetMembershipLifecycleStatusResult;
      if (!res?.ok) throw new Error("GENERIC_ERROR");
      return res;
    },
    onSuccess: (_, input) => {
      invalidateMembershipDomains(queryClient, input.groupId);
    },
  });
}

/**
 * Updates a member's group-scoped display name without mutating global profile.
 */
export function useUpdateMemberDisplayName() {
  const queryClient = useQueryClient();
  const { groupId: currentGroupId } = useGroup();

  return useMutation<UpdateMemberDisplayNameResult, Error, UpdateMemberDisplayNameInput>({
    mutationFn: async (input) => {
      if (!currentGroupId || input.groupId !== currentGroupId) {
        throw new Error("staleTenantAborted");
      }

      const { data, error } = await supabase.rpc("update_member_display_name", {
        p_command: {
          membership_id: input.membershipId,
          display_name: input.displayName.trim(),
        },
      });

      if (error) throw error;
      const res = data as UpdateMemberDisplayNameResult;
      if (!res?.ok) throw new Error("GENERIC_ERROR");
      return res;
    },
    onSuccess: (_, input) => {
      invalidateMembershipDomains(queryClient, input.groupId);
    },
  });
}
