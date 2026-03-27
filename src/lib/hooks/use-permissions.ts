"use client";

import { useQuery } from "@tanstack/react-query";
import { useGroup } from "@/lib/group-context";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

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
      // If owner or admin, no need to query — they have all permissions
      if (isOwner || isAdmin) return [];

      // Get all positions assigned to this member (active assignments only)
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

      // Return unique permission strings
      return [...new Set(permissions.map((p) => p.permission))];
    },
    enabled: !!groupId && !!membershipId && !isOwner && !isAdmin,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  /**
   * Check if the current user has a specific permission.
   * Maps simplified permission keys to the dot-notation used in position_permissions table.
   * Owner and admin always return true.
   */
  function hasPermission(permissionKey: string): boolean {
    if (isOwner || isAdmin) return true;
    if (isLoading) return false;

    // Map simplified keys to dot-notation permission strings
    const permissionMap: Record<string, string[]> = {
      manage_members: ["members.manage"],
      invite_members: ["members.manage"],
      manage_events: ["events.manage"],
      manage_attendance: ["events.manage"],
      record_payments: ["contributions.manage", "finances.manage"],
      manage_finances: ["finances.manage"],
      manage_contributions: ["contributions.manage"],
      view_reports: ["finances.view", "contributions.view"],
      export_data: ["finances.manage"],
      manage_relief: ["finances.manage"],
      send_notifications: ["settings.manage"],
      manage_announcements: ["settings.manage"],
      manage_roles: ["settings.manage"],
      manage_settings: ["settings.manage"],
      manage_disputes: ["settings.manage"],
      manage_documents: ["settings.manage"],
      manage_elections: ["settings.manage"],
      manage_savings: ["finances.manage"],
      manage_hosting: ["events.manage"],
      manage_minutes: ["events.manage"],
    };

    const mappedPermissions = permissionMap[permissionKey];
    if (!mappedPermissions) {
      // If the key is already in dot-notation, check directly
      return userPermissions.includes(permissionKey);
    }

    // Return true if any of the mapped permissions are granted
    return mappedPermissions.some((p) => userPermissions.includes(p));
  }

  return { isOwner, isAdmin, hasPermission, isLoading, userPermissions };
}
