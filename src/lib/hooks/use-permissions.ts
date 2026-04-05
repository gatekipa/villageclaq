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
 * Owner always has all permissions.
 * Admin gets all permissions UNLESS they have specific position assignments
 * (e.g. Treasurer with role=admin should only get treasurer permissions).
 * Regular members get permissions from their assigned positions via position_permissions table.
 */
export function usePermissions() {
  const { currentMembership, groupId, isAdmin } = useGroup();
  const membershipId = currentMembership?.id;
  const isOwner = currentMembership?.role === "owner";

  const { data: permissionsData = { permissions: [], hasAssignments: false }, isLoading } = useQuery({
    queryKey: ["user-permissions", groupId, membershipId],
    queryFn: async () => {
      if (!groupId || !membershipId) return { permissions: [], hasAssignments: false };
      if (isOwner) return { permissions: [], hasAssignments: false }; // Owner bypasses everything — no need to fetch

      // Get all active position assignments for this member (admins included)
      const { data: assignments, error: aErr } = await supabase
        .from("position_assignments")
        .select("position_id")
        .eq("membership_id", membershipId)
        .is("ended_at", null);

      if (aErr || !assignments || assignments.length === 0) return { permissions: [], hasAssignments: false };

      // Assignments exist — user is position-scoped regardless of permission count
      const positionIds = assignments.map((a) => a.position_id);

      // Get all permissions for those positions
      const { data: permissions, error: pErr } = await supabase
        .from("position_permissions")
        .select("permission")
        .in("position_id", positionIds);

      if (pErr || !permissions) return { permissions: [], hasAssignments: true };

      return {
        permissions: [...new Set(permissions.map((p) => p.permission))],
        hasAssignments: true,
      };
    },
    enabled: !!groupId && !!membershipId && !isOwner,
    staleTime: 5 * 60 * 1000,
  });

  const positionPermissions = permissionsData.permissions;
  // hasPositionAssignments is true when the member holds any position assignment,
  // regardless of whether that position has permissions configured — fixes Bug #411
  // where a Treasurer with 0 permissions was incorrectly treated as a general admin.
  const hasPositionAssignments = permissionsData.hasAssignments;

  // Effective permissions:
  // - Owner: full bypass
  // - Admin WITH position assignments: use those position permissions (Treasurer, Secretary, etc.)
  // - Admin WITHOUT position assignments: full access (general admin)
  // - Member/Moderator WITH position assignments: use those permissions
  // - Member/Moderator WITHOUT position assignments: no special access
  const userPermissions = positionPermissions;

  /**
   * Check if the current user has a specific permission.
   * Owner always returns true.
   * Admin with position assignments: checks position permissions.
   * Admin without position assignments: returns true (general admin).
   */
  function hasPermission(permissionKey: string): boolean {
    if (isOwner) return true;
    if (isLoading) return false;
    // Admin without specific position assignments → full access (backward compatible)
    if (isAdmin && !hasPositionAssignments) return true;
    // Admin WITH position assignments OR regular member → check position permissions
    return userPermissions.includes(permissionKey);
  }

  /**
   * Check if user has ANY of the listed permissions.
   */
  function hasAnyPermission(...keys: string[]): boolean {
    if (isOwner) return true;
    if (isLoading) return false;
    if (isAdmin && !hasPositionAssignments) return true;
    return keys.some((k) => userPermissions.includes(k));
  }

  return { isOwner, isAdmin, hasPermission, hasAnyPermission, isLoading, userPermissions };
}
