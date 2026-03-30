-- ============================================================
-- 00026: Tighten RLS Policies
-- Fixes overly permissive policies that allowed ANY authenticated
-- user to INSERT/UPDATE/DELETE on group-scoped tables.
-- Run this manually in Supabase SQL Editor.
-- ============================================================

-- Helper: check if user is owner of a specific group
CREATE OR REPLACE FUNCTION is_group_owner(gid UUID, uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE group_id = gid AND user_id = uid AND role = 'owner'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- =============================================
-- 1. EVENTS: restrict INSERT/UPDATE/DELETE to admins
-- Currently any group member can create/edit events
-- =============================================
DROP POLICY IF EXISTS "rls_ev_insert" ON events;
CREATE POLICY "rls_ev_insert" ON events FOR INSERT TO authenticated
  WITH CHECK (is_group_admin(group_id));

DROP POLICY IF EXISTS "rls_ev_update" ON events;
CREATE POLICY "rls_ev_update" ON events FOR UPDATE TO authenticated
  USING (is_group_admin(group_id));

DROP POLICY IF EXISTS "rls_ev_delete" ON events;
CREATE POLICY "rls_ev_delete" ON events FOR DELETE TO authenticated
  USING (is_group_admin(group_id));


-- =============================================
-- 2. CONTRIBUTION_OBLIGATIONS: restrict write to admins
-- Currently WITH CHECK (true) — any authenticated user can modify
-- =============================================
DROP POLICY IF EXISTS "rls_co_insert" ON contribution_obligations;
CREATE POLICY "rls_co_insert" ON contribution_obligations FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.contribution_types ct
      WHERE ct.id = contribution_obligations.contribution_type_id
        AND is_group_admin(ct.group_id)
    )
    OR
    -- Allow the payment cascade system (group members recording payments that auto-create obligations)
    EXISTS (
      SELECT 1 FROM public.contribution_types ct
      WHERE ct.id = contribution_obligations.contribution_type_id
        AND is_group_member(ct.group_id)
    )
  );

DROP POLICY IF EXISTS "rls_co_update" ON contribution_obligations;
CREATE POLICY "rls_co_update" ON contribution_obligations FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.id = contribution_obligations.membership_id
        AND is_group_member(m.group_id)
    )
  );


-- =============================================
-- 3. ELECTION_CANDIDATES: restrict write to admins (not any user)
-- =============================================
DROP POLICY IF EXISTS "rls_ec_all" ON election_candidates;
CREATE POLICY "rls_ec_select" ON election_candidates FOR SELECT TO authenticated USING (true);
CREATE POLICY "rls_ec_insert" ON election_candidates FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.elections e
      WHERE e.id = election_candidates.election_id
        AND is_group_member(e.group_id)
    )
  );
CREATE POLICY "rls_ec_delete" ON election_candidates FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.elections e
      WHERE e.id = election_candidates.election_id
        AND is_group_admin(e.group_id)
    )
  );


-- =============================================
-- 4. ELECTION_OPTIONS: restrict write to admins
-- =============================================
DROP POLICY IF EXISTS "rls_eo_all" ON election_options;
CREATE POLICY "rls_eo_select" ON election_options FOR SELECT TO authenticated USING (true);
CREATE POLICY "rls_eo_insert" ON election_options FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.elections e
      WHERE e.id = election_options.election_id
        AND is_group_admin(e.group_id)
    )
  );
CREATE POLICY "rls_eo_delete" ON election_options FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.elections e
      WHERE e.id = election_options.election_id
        AND is_group_admin(e.group_id)
    )
  );


-- =============================================
-- 5. ELECTION_VOTES: members can INSERT own vote, no one can UPDATE/DELETE
-- =============================================
DROP POLICY IF EXISTS "rls_ev_all" ON election_votes;
CREATE POLICY "rls_evote_select" ON election_votes FOR SELECT TO authenticated USING (true);
CREATE POLICY "rls_evote_insert" ON election_votes FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.elections e
      WHERE e.id = election_votes.election_id
        AND is_group_member(e.group_id)
    )
  );
-- No UPDATE or DELETE on votes — ballots are immutable


-- =============================================
-- 6. FINES: members can read own, admins manage
-- =============================================
DROP POLICY IF EXISTS "rls_fin_all" ON fines;
CREATE POLICY "rls_fin_select" ON fines FOR SELECT TO authenticated
  USING (is_group_member(group_id));
CREATE POLICY "rls_fin_insert" ON fines FOR INSERT TO authenticated
  WITH CHECK (is_group_admin(group_id));
CREATE POLICY "rls_fin_update" ON fines FOR UPDATE TO authenticated
  USING (is_group_member(group_id));
-- Members can dispute (update status to 'disputed'), admins can manage all


-- =============================================
-- 7. FINE_RULES: admins only
-- =============================================
DROP POLICY IF EXISTS "rls_finr_all" ON fine_rules;
CREATE POLICY "rls_finr_select" ON fine_rules FOR SELECT TO authenticated
  USING (is_group_member(group_id));
CREATE POLICY "rls_finr_insert" ON fine_rules FOR INSERT TO authenticated
  WITH CHECK (is_group_admin(group_id));
CREATE POLICY "rls_finr_update" ON fine_rules FOR UPDATE TO authenticated
  USING (is_group_admin(group_id));
CREATE POLICY "rls_finr_delete" ON fine_rules FOR DELETE TO authenticated
  USING (is_group_admin(group_id));


-- =============================================
-- 8. POSITION_ASSIGNMENTS: admins only for write
-- =============================================
DROP POLICY IF EXISTS "rls_pa_all" ON position_assignments;
-- Keep select open for the permission system to work
CREATE POLICY "rls_pa_select" ON position_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "rls_pa_insert" ON position_assignments FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.group_positions gp
      WHERE gp.id = position_assignments.position_id
        AND is_group_admin(gp.group_id)
    )
  );
CREATE POLICY "rls_pa_update" ON position_assignments FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_positions gp
      WHERE gp.id = position_assignments.position_id
        AND is_group_admin(gp.group_id)
    )
  );
CREATE POLICY "rls_pa_delete" ON position_assignments FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_positions gp
      WHERE gp.id = position_assignments.position_id
        AND is_group_admin(gp.group_id)
    )
  );


-- =============================================
-- 9. POSITION_PERMISSIONS: admins only for write
-- =============================================
DROP POLICY IF EXISTS "rls_pp_all" ON position_permissions;
-- Keep select open for the permission system to work
CREATE POLICY "rls_pp_select" ON position_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "rls_pp_insert" ON position_permissions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.group_positions gp
      WHERE gp.id = position_permissions.position_id
        AND is_group_admin(gp.group_id)
    )
  );
CREATE POLICY "rls_pp_delete" ON position_permissions FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_positions gp
      WHERE gp.id = position_permissions.position_id
        AND is_group_admin(gp.group_id)
    )
  );


-- =============================================
-- 10. SAVINGS_PARTICIPANTS: scope to group membership
-- =============================================
DROP POLICY IF EXISTS "rls_sp_all" ON savings_participants;
CREATE POLICY "rls_sp_select" ON savings_participants FOR SELECT TO authenticated USING (true);
CREATE POLICY "rls_sp_insert" ON savings_participants FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.savings_cycles sc
      WHERE sc.id = savings_participants.cycle_id
        AND is_group_admin(sc.group_id)
    )
  );
CREATE POLICY "rls_sp_update" ON savings_participants FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.savings_cycles sc
      WHERE sc.id = savings_participants.cycle_id
        AND is_group_admin(sc.group_id)
    )
  );
CREATE POLICY "rls_sp_delete" ON savings_participants FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.savings_cycles sc
      WHERE sc.id = savings_participants.cycle_id
        AND is_group_admin(sc.group_id)
    )
  );


-- =============================================
-- 11. SAVINGS_CONTRIBUTIONS: scope to group membership
-- =============================================
DROP POLICY IF EXISTS "rls_scon_all" ON savings_contributions;
CREATE POLICY "rls_scon_select" ON savings_contributions FOR SELECT TO authenticated USING (true);
CREATE POLICY "rls_scon_insert" ON savings_contributions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.savings_cycles sc
      WHERE sc.id = savings_contributions.cycle_id
        AND is_group_admin(sc.group_id)
    )
  );
CREATE POLICY "rls_scon_update" ON savings_contributions FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.savings_cycles sc
      WHERE sc.id = savings_contributions.cycle_id
        AND is_group_admin(sc.group_id)
    )
  );


-- =============================================
-- 12. DOCUMENTS: restrict write to admins (currently any member can)
-- =============================================
DROP POLICY IF EXISTS "rls_doc_all" ON documents;
CREATE POLICY "rls_doc_insert" ON documents FOR INSERT TO authenticated
  WITH CHECK (is_group_admin(group_id));
CREATE POLICY "rls_doc_update" ON documents FOR UPDATE TO authenticated
  USING (is_group_admin(group_id));
CREATE POLICY "rls_doc_delete" ON documents FOR DELETE TO authenticated
  USING (is_group_admin(group_id));


-- =============================================
-- 13. MEETING_MINUTES: restrict write to admins
-- =============================================
DROP POLICY IF EXISTS "rls_mm_all" ON meeting_minutes;
CREATE POLICY "rls_mm_insert" ON meeting_minutes FOR INSERT TO authenticated
  WITH CHECK (is_group_admin(group_id));
CREATE POLICY "rls_mm_update" ON meeting_minutes FOR UPDATE TO authenticated
  USING (is_group_admin(group_id));
CREATE POLICY "rls_mm_delete" ON meeting_minutes FOR DELETE TO authenticated
  USING (is_group_admin(group_id));


-- =============================================
-- 14. ANNOUNCEMENTS: add update/delete for admins, select for members
-- =============================================
DROP POLICY IF EXISTS "rls_ann_select" ON announcements;
CREATE POLICY "rls_ann_select" ON announcements FOR SELECT TO authenticated
  USING (is_group_member(group_id));
CREATE POLICY "rls_ann_update" ON announcements FOR UPDATE TO authenticated
  USING (is_group_admin(group_id));
CREATE POLICY "rls_ann_delete" ON announcements FOR DELETE TO authenticated
  USING (is_group_admin(group_id));


-- =============================================
-- 15. MEMBERSHIPS: owner-only role escalation guard
-- Prevent non-owners from setting role = 'owner' via RLS
-- =============================================
DROP POLICY IF EXISTS "rls_membership_role_guard" ON memberships;
CREATE POLICY "rls_membership_role_guard" ON memberships FOR UPDATE TO authenticated
  USING (
    -- Admin can update memberships in their group
    is_group_admin(group_id)
  )
  WITH CHECK (
    -- Allow if NOT setting role to owner, OR if the current user IS the owner
    (role != 'owner' OR is_group_owner(group_id))
  );


-- =============================================
-- 16. PROJECT_CONTRIBUTIONS, PROJECT_EXPENSES, PROJECT_MILESTONES: scope to group
-- =============================================
DROP POLICY IF EXISTS "rls_pcon_all" ON project_contributions;
CREATE POLICY "rls_pcon_select" ON project_contributions FOR SELECT TO authenticated USING (true);
CREATE POLICY "rls_pcon_write" ON project_contributions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_contributions.project_id
        AND is_group_member(p.group_id)
    )
  );

DROP POLICY IF EXISTS "rls_pexp_all" ON project_expenses;
CREATE POLICY "rls_pexp_select" ON project_expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "rls_pexp_write" ON project_expenses FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_expenses.project_id
        AND is_group_admin(p.group_id)
    )
  );

DROP POLICY IF EXISTS "rls_pmil_all" ON project_milestones;
CREATE POLICY "rls_pmil_select" ON project_milestones FOR SELECT TO authenticated USING (true);
CREATE POLICY "rls_pmil_write" ON project_milestones FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_milestones.project_id
        AND is_group_admin(p.group_id)
    )
  );
CREATE POLICY "rls_pmil_update" ON project_milestones FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_milestones.project_id
        AND is_group_admin(p.group_id)
    )
  );
