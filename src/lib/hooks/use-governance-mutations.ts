"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useGroup } from "@/lib/group-context";

const supabase = createClient();

// ============================================================================
// Types & Input Interfaces
// ============================================================================

export interface CallAssemblyToOrderInput {
  groupId: string;
  assemblyId: string;
  quorumThresholdPercent?: number;
}

export interface CallAssemblyToOrderResult {
  ok: boolean;
  eligible_count: number;
  required_quorum: number;
  error?: string;
}

export interface AttendanceRecord {
  membershipId: string;
  status: "present" | "excused" | "absent" | "proxy";
  proxyMembershipId?: string | null;
}

export interface RecordAssemblyRollCallInput {
  groupId: string;
  assemblyId: string;
  attendanceRecords: AttendanceRecord[];
}

export interface RecordAssemblyRollCallResult {
  ok: boolean;
  present_count: number;
  required_quorum: number;
  quorum_achieved: boolean;
  error?: string;
}

export interface AdjournAssemblyInput {
  groupId: string;
  assemblyId: string;
}

export interface AdjournAssemblyResult {
  ok: boolean;
  status: string;
  error?: string;
}

export interface TallyResolutionVoteInput {
  groupId: string;
  resolutionId: string;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
}

export interface TallyResolutionVoteResult {
  ok: boolean;
  status: string;
  votes_for: number;
  votes_against: number;
  votes_abstain: number;
  error?: string;
}

// ============================================================================
// Hooks
// ============================================================================

export function useCallAssemblyToOrder() {
  const queryClient = useQueryClient();
  const { groupId } = useGroup();

  return useMutation({
    mutationFn: async (input: CallAssemblyToOrderInput) => {
      if (!groupId || input.groupId !== groupId) {
        throw new Error("STALE_TENANT_ABORT: active context does not match requested tenant.");
      }
      const { data, error } = await supabase.rpc("call_assembly_to_order", {
        p_command: input,
      });
      if (error) throw error;
      const result = data as CallAssemblyToOrderResult;
      if (!result.ok) throw new Error(result.error || "UNKNOWN_ERROR");
      return result;
    },
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: ["assemblies", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["assembly-quorum-snapshot", input.assemblyId] });
      queryClient.invalidateQueries({ queryKey: ["events", input.groupId] });
    },
  });
}

export function useRecordAssemblyRollCall() {
  const queryClient = useQueryClient();
  const { groupId } = useGroup();

  return useMutation({
    mutationFn: async (input: RecordAssemblyRollCallInput) => {
      if (!groupId || input.groupId !== groupId) {
        throw new Error("STALE_TENANT_ABORT: active context does not match requested tenant.");
      }
      const { data, error } = await supabase.rpc("record_assembly_roll_call", {
        p_command: input,
      });
      if (error) throw error;
      const result = data as RecordAssemblyRollCallResult;
      if (!result.ok) throw new Error(result.error || "UNKNOWN_ERROR");
      return result;
    },
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: ["assemblies", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["assembly-attendance", input.assemblyId] });
    },
  });
}

export function useAdjournAssembly() {
  const queryClient = useQueryClient();
  const { groupId } = useGroup();

  return useMutation({
    mutationFn: async (input: AdjournAssemblyInput) => {
      if (!groupId || input.groupId !== groupId) {
        throw new Error("STALE_TENANT_ABORT: active context does not match requested tenant.");
      }
      const { data, error } = await supabase.rpc("adjourn_assembly", {
        p_command: input,
      });
      if (error) throw error;
      const result = data as AdjournAssemblyResult;
      if (!result.ok) throw new Error(result.error || "UNKNOWN_ERROR");
      return result;
    },
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: ["assemblies", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["resolutions", input.groupId] });
      queryClient.invalidateQueries({ queryKey: ["assembly-attendance", input.assemblyId] });
    },
  });
}

export function useTallyResolutionVote() {
  const queryClient = useQueryClient();
  const { groupId } = useGroup();

  return useMutation({
    mutationFn: async (input: TallyResolutionVoteInput) => {
      if (!groupId || input.groupId !== groupId) {
        throw new Error("STALE_TENANT_ABORT: active context does not match requested tenant.");
      }
      const { data, error } = await supabase.rpc("tally_resolution_vote", {
        p_command: input,
      });
      if (error) throw error;
      const result = data as TallyResolutionVoteResult;
      if (!result.ok) throw new Error(result.error || "UNKNOWN_ERROR");
      return result;
    },
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: ["resolutions", input.groupId] });
    },
  });
}
