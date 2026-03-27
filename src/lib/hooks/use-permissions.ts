"use client";

import { useQuery } from "@tanstack/react-query";
import { useGroup } from "@/lib/group-context";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

/**
 * All permission keys used in the system.
 * These are stored as-is in the position_permissions table.
 * The Roles page toggles map 1:1 to these keys.
 */
export const ALL_PERMISSION_KEYS = [
  "members.manage",
  "members.invite",
  "events.manage",
  "attendance.manage",
  "finances.record",
  "finances.manage",
  "finances.view",
  "contributions.manage",
  "reports.view",
  "reports.export",
  "relief.manage",
  "notifications.send",
  "announcements.manage",
  "roles.manage",
  "settings.manage",
  "disputes.manage",
  "documents.manage",
  "elections.manage",
  "savings.manage",
  "hosting.manage",
  "minutes.manage",
] as const;

export type PermissionKey = (typeof ALL_PERMISSION_KEYS)[number];

/**
 * Hook that checks position-based permissions for the current user.
 * Owner/admin always have all permissions.
 * Regular members get permissions from their assigned positions via position_permissions table.
 */
export function usePermissions() {
  const { currentMembership, groupId, isAdmin } = useGroup();
  const membershipId = currentMembership?.id;
  const isOwner = currentMembership?.role === "owner";

  const { data: userPermissions = [], isLoading } = useQuery({
    queryKey: ["user-permissions", groupId, membershipId],
    queryFn: async () => {
      if (!groupId || !membershipId) return [];
      if (isOwner || isAdmin) return [];

      // Get all active position assignments for this member
      const { data: assignments, error: aErr } = await supabase
        .from("position_assignments")
        .select("position_id")
        .eq("membership_id", membershipId)
        .is("ended_at", null);

      if (aErr || !assignments || assignments.length === 0) return [];

      const positionIds = assignments.map((a) => a.position_id);

      // Get all permissions for those positions
      const { data: permissions, error: pErr } = await supabase
        .from("position_permissions")
        .select("permission")
        .in("position_id", positionIds);

      if (pErr || !permissions) return [];

      return [...new Set(permissions.map((p) => p.permission))];
    },
    enabled: !!groupId && !!membershipId && !isOwner && !isAdmin,
    staleTime: 5 * 60 * 1000,
  });

  /**
   * Check if the current user has a specific permission.
   * Accepts dot-notation keys like "members.manage", "finances.record".
   * Owner and admin always return true.
   */
  function hasPermission(permissionKey: string): boolean {
    if (isOwner || isAdmin) return true;
    if (isLoading) return false;
    return userPermissions.includes(permissionKey);
  }

  /**
   * Check if user has ANY of the listed permissions.
   */
  function hasAnyPermission(...keys: string[]): boolean {
    if (isOwner || isAdmin) return true;
    if (isLoading) return false;
    return keys.some((k) => userPermissions.includes(k));
  }

  return { isOwner, isAdmin, hasPermission, hasAnyPermission, isLoading, userPermissions };
}
