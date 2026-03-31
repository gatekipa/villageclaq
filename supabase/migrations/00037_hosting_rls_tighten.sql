-- ============================================================
-- 00037: Tighten Hosting RLS Policies
-- Replace permissive USING(true) on hosting_assignments and
-- hosting_swap_requests with proper group-scoped policies.
-- ============================================================

-- ── hosting_assignments ──────────────────────────────────────

-- Drop old permissive policies
DROP POLICY IF EXISTS "rls_ha_select" ON hosting_assignments;
DROP POLICY IF EXISTS "rls_ha_all"    ON hosting_assignments;

-- SELECT: any authenticated member whose group owns the roster
CREATE POLICY "rls_ha_select" ON hosting_assignments
  FOR SELECT TO authenticated
  USING (
    roster_id IN (
      SELECT id FROM hosting_rosters
      WHERE group_id IN (SELECT get_user_group_ids())
    )
  );

-- INSERT: group admins only
CREATE POLICY "rls_ha_insert" ON hosting_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    roster_id IN (
      SELECT id FROM hosting_rosters
      WHERE is_group_admin(group_id)
    )
  );

-- UPDATE: group admins only
CREATE POLICY "rls_ha_update" ON hosting_assignments
  FOR UPDATE TO authenticated
  USING (
    roster_id IN (
      SELECT id FROM hosting_rosters
      WHERE is_group_admin(group_id)
    )
  );

-- DELETE: group admins only
CREATE POLICY "rls_ha_delete" ON hosting_assignments
  FOR DELETE TO authenticated
  USING (
    roster_id IN (
      SELECT id FROM hosting_rosters
      WHERE is_group_admin(group_id)
    )
  );

-- ── hosting_swap_requests ────────────────────────────────────

DROP POLICY IF EXISTS "rls_hsr_all" ON hosting_swap_requests;

-- SELECT: members of the group that owns the roster
CREATE POLICY "rls_hsr_select" ON hosting_swap_requests
  FOR SELECT TO authenticated
  USING (
    from_assignment_id IN (
      SELECT ha.id FROM hosting_assignments ha
      JOIN hosting_rosters hr ON hr.id = ha.roster_id
      WHERE hr.group_id IN (SELECT get_user_group_ids())
    )
  );

-- INSERT: group admins (swaps are admin-initiated)
CREATE POLICY "rls_hsr_insert" ON hosting_swap_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    from_assignment_id IN (
      SELECT ha.id FROM hosting_assignments ha
      JOIN hosting_rosters hr ON hr.id = ha.roster_id
      WHERE is_group_admin(hr.group_id)
    )
  );

-- UPDATE: group admins only (for approving/rejecting)
CREATE POLICY "rls_hsr_update" ON hosting_swap_requests
  FOR UPDATE TO authenticated
  USING (
    from_assignment_id IN (
      SELECT ha.id FROM hosting_assignments ha
      JOIN hosting_rosters hr ON hr.id = ha.roster_id
      WHERE is_group_admin(hr.group_id)
    )
  );
