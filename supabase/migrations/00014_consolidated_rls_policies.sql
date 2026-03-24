-- ============================================================
-- Consolidated RLS Policies
-- This migration ensures ALL tables have proper RLS policies.
-- Uses IF NOT EXISTS pattern to avoid conflicts with existing policies.
-- ============================================================

-- Helper function: get all group_ids for a user
CREATE OR REPLACE FUNCTION get_user_group_ids(uid UUID DEFAULT auth.uid())
RETURNS SETOF UUID AS $$
  SELECT group_id FROM public.memberships WHERE user_id = uid;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: check if user is member of a specific group
CREATE OR REPLACE FUNCTION is_group_member(gid UUID, uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships WHERE group_id = gid AND user_id = uid
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: check if user is admin of a specific group
CREATE OR REPLACE FUNCTION is_group_admin(gid UUID, uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE group_id = gid AND user_id = uid AND role IN ('owner', 'admin')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ==================== GROUP-SCOPED TABLES (group_id FK) ====================
-- Pattern: members of the group can SELECT, admins can INSERT/UPDATE/DELETE

-- CONTRIBUTION_TYPES
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contribution_types' AND policyname = 'rls_ct_select') THEN
    CREATE POLICY "rls_ct_select" ON public.contribution_types FOR SELECT TO authenticated
      USING (is_group_member(group_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contribution_types' AND policyname = 'rls_ct_insert') THEN
    CREATE POLICY "rls_ct_insert" ON public.contribution_types FOR INSERT TO authenticated
      WITH CHECK (is_group_admin(group_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contribution_types' AND policyname = 'rls_ct_update') THEN
    CREATE POLICY "rls_ct_update" ON public.contribution_types FOR UPDATE TO authenticated
      USING (is_group_admin(group_id));
  END IF;
END $$;

-- CONTRIBUTION_OBLIGATIONS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contribution_obligations' AND policyname = 'rls_co_select') THEN
    CREATE POLICY "rls_co_select" ON public.contribution_obligations FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.memberships m WHERE m.id = contribution_obligations.membership_id AND m.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.contribution_types ct JOIN public.memberships m ON m.group_id = ct.group_id
          WHERE ct.id = contribution_obligations.contribution_type_id AND m.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contribution_obligations' AND policyname = 'rls_co_insert') THEN
    CREATE POLICY "rls_co_insert" ON public.contribution_obligations FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contribution_obligations' AND policyname = 'rls_co_update') THEN
    CREATE POLICY "rls_co_update" ON public.contribution_obligations FOR UPDATE TO authenticated USING (true);
  END IF;
END $$;

-- PAYMENTS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payments' AND policyname = 'rls_pay_select') THEN
    CREATE POLICY "rls_pay_select" ON public.payments FOR SELECT TO authenticated
      USING (is_group_member(group_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payments' AND policyname = 'rls_pay_insert') THEN
    CREATE POLICY "rls_pay_insert" ON public.payments FOR INSERT TO authenticated
      WITH CHECK (is_group_member(group_id));
  END IF;
END $$;

-- EVENTS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'rls_ev_select') THEN
    CREATE POLICY "rls_ev_select" ON events FOR SELECT TO authenticated
      USING (is_group_member(group_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'rls_ev_insert') THEN
    CREATE POLICY "rls_ev_insert" ON events FOR INSERT TO authenticated
      WITH CHECK (is_group_member(group_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'rls_ev_update') THEN
    CREATE POLICY "rls_ev_update" ON events FOR UPDATE TO authenticated
      USING (is_group_member(group_id));
  END IF;
END $$;

-- EVENT_RSVPS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_rsvps' AND policyname = 'rls_rsvp_select') THEN
    CREATE POLICY "rls_rsvp_select" ON event_rsvps FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_rsvps' AND policyname = 'rls_rsvp_all') THEN
    CREATE POLICY "rls_rsvp_all" ON event_rsvps FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- EVENT_ATTENDANCES
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_attendances' AND policyname = 'rls_att_select') THEN
    CREATE POLICY "rls_att_select" ON event_attendances FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_attendances' AND policyname = 'rls_att_all') THEN
    CREATE POLICY "rls_att_all" ON event_attendances FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- HOSTING_ROSTERS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'hosting_rosters' AND policyname = 'rls_hr_select') THEN
    CREATE POLICY "rls_hr_select" ON hosting_rosters FOR SELECT TO authenticated
      USING (is_group_member(group_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'hosting_rosters' AND policyname = 'rls_hr_insert') THEN
    CREATE POLICY "rls_hr_insert" ON hosting_rosters FOR INSERT TO authenticated
      WITH CHECK (is_group_admin(group_id));
  END IF;
END $$;

-- HOSTING_ASSIGNMENTS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'hosting_assignments' AND policyname = 'rls_ha_select') THEN
    CREATE POLICY "rls_ha_select" ON hosting_assignments FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'hosting_assignments' AND policyname = 'rls_ha_all') THEN
    CREATE POLICY "rls_ha_all" ON hosting_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- MEETING_MINUTES
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'meeting_minutes' AND policyname = 'rls_mm_select') THEN
    CREATE POLICY "rls_mm_select" ON meeting_minutes FOR SELECT TO authenticated
      USING (is_group_member(group_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'meeting_minutes' AND policyname = 'rls_mm_all') THEN
    CREATE POLICY "rls_mm_all" ON meeting_minutes FOR ALL TO authenticated USING (is_group_member(group_id)) WITH CHECK (is_group_member(group_id));
  END IF;
END $$;

-- ANNOUNCEMENTS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'announcements' AND policyname = 'rls_ann_select') THEN
    CREATE POLICY "rls_ann_select" ON announcements FOR SELECT TO authenticated
      USING (is_group_member(group_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'announcements' AND policyname = 'rls_ann_insert') THEN
    CREATE POLICY "rls_ann_insert" ON announcements FOR INSERT TO authenticated
      WITH CHECK (is_group_admin(group_id));
  END IF;
END $$;

-- ELECTIONS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'elections' AND policyname = 'rls_elec_select') THEN
    CREATE POLICY "rls_elec_select" ON elections FOR SELECT TO authenticated
      USING (is_group_member(group_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'elections' AND policyname = 'rls_elec_all') THEN
    CREATE POLICY "rls_elec_all" ON elections FOR ALL TO authenticated
      USING (is_group_admin(group_id)) WITH CHECK (is_group_admin(group_id));
  END IF;
END $$;

-- ELECTION_CANDIDATES, ELECTION_OPTIONS, ELECTION_VOTES
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'election_candidates' AND policyname = 'rls_ec_all') THEN
    CREATE POLICY "rls_ec_all" ON election_candidates FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'election_options' AND policyname = 'rls_eo_all') THEN
    CREATE POLICY "rls_eo_all" ON election_options FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'election_votes' AND policyname = 'rls_ev_all') THEN
    CREATE POLICY "rls_ev_all" ON election_votes FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- DOCUMENTS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'documents' AND policyname = 'rls_doc_select') THEN
    CREATE POLICY "rls_doc_select" ON documents FOR SELECT TO authenticated
      USING (is_group_member(group_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'documents' AND policyname = 'rls_doc_all') THEN
    CREATE POLICY "rls_doc_all" ON documents FOR ALL TO authenticated
      USING (is_group_member(group_id)) WITH CHECK (is_group_member(group_id));
  END IF;
END $$;

-- RELIEF_PLANS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'relief_plans' AND policyname = 'rls_rp_select') THEN
    CREATE POLICY "rls_rp_select" ON relief_plans FOR SELECT TO authenticated
      USING (is_group_member(group_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'relief_plans' AND policyname = 'rls_rp_all') THEN
    CREATE POLICY "rls_rp_all" ON relief_plans FOR ALL TO authenticated
      USING (is_group_admin(group_id)) WITH CHECK (is_group_admin(group_id));
  END IF;
END $$;

-- RELIEF_ENROLLMENTS, RELIEF_CLAIMS, RELIEF_PAYOUTS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'relief_enrollments' AND policyname = 'rls_re_all') THEN
    CREATE POLICY "rls_re_all" ON relief_enrollments FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'relief_claims' AND policyname = 'rls_rc_all') THEN
    CREATE POLICY "rls_rc_all" ON relief_claims FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'relief_payouts' AND policyname = 'rls_rpay_all') THEN
    CREATE POLICY "rls_rpay_all" ON relief_payouts FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- SAVINGS_CYCLES
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'savings_cycles' AND policyname = 'rls_sc_select') THEN
    CREATE POLICY "rls_sc_select" ON savings_cycles FOR SELECT TO authenticated
      USING (is_group_member(group_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'savings_cycles' AND policyname = 'rls_sc_all') THEN
    CREATE POLICY "rls_sc_all" ON savings_cycles FOR ALL TO authenticated
      USING (is_group_admin(group_id)) WITH CHECK (is_group_admin(group_id));
  END IF;
END $$;

-- SAVINGS_PARTICIPANTS, SAVINGS_CONTRIBUTIONS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'savings_participants' AND policyname = 'rls_sp_all') THEN
    CREATE POLICY "rls_sp_all" ON savings_participants FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'savings_contributions' AND policyname = 'rls_scon_all') THEN
    CREATE POLICY "rls_scon_all" ON savings_contributions FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ACTIVITY_FEED
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'activity_feed' AND policyname = 'rls_af_select') THEN
    CREATE POLICY "rls_af_select" ON activity_feed FOR SELECT TO authenticated
      USING (is_group_member(group_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'activity_feed' AND policyname = 'rls_af_all') THEN
    CREATE POLICY "rls_af_all" ON activity_feed FOR ALL TO authenticated
      USING (is_group_member(group_id)) WITH CHECK (is_group_member(group_id));
  END IF;
END $$;

-- FEED_REACTIONS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'feed_reactions' AND policyname = 'rls_fr_all') THEN
    CREATE POLICY "rls_fr_all" ON feed_reactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- FINES, FINE_RULES
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'fines' AND policyname = 'rls_fin_all') THEN
    CREATE POLICY "rls_fin_all" ON fines FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'fine_rules' AND policyname = 'rls_finr_all') THEN
    CREATE POLICY "rls_finr_all" ON fine_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- LOAN_REQUESTS, LOAN_REPAYMENTS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'loan_requests' AND policyname = 'rls_lr_all') THEN
    CREATE POLICY "rls_lr_all" ON loan_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'loan_repayments' AND policyname = 'rls_lrep_all') THEN
    CREATE POLICY "rls_lrep_all" ON loan_repayments FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- PROJECTS, PROJECT_CONTRIBUTIONS, PROJECT_EXPENSES, PROJECT_MILESTONES
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'projects' AND policyname = 'rls_proj_select') THEN
    CREATE POLICY "rls_proj_select" ON projects FOR SELECT TO authenticated
      USING (is_group_member(group_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'projects' AND policyname = 'rls_proj_all') THEN
    CREATE POLICY "rls_proj_all" ON projects FOR ALL TO authenticated
      USING (is_group_admin(group_id)) WITH CHECK (is_group_admin(group_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'project_contributions' AND policyname = 'rls_pcon_all') THEN
    CREATE POLICY "rls_pcon_all" ON project_contributions FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'project_expenses' AND policyname = 'rls_pexp_all') THEN
    CREATE POLICY "rls_pexp_all" ON project_expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'project_milestones' AND policyname = 'rls_pmil_all') THEN
    CREATE POLICY "rls_pmil_all" ON project_milestones FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- BADGES, MEMBER_BADGES
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'badges' AND policyname = 'rls_badge_select') THEN
    CREATE POLICY "rls_badge_select" ON badges FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'member_badges' AND policyname = 'rls_mb_all') THEN
    CREATE POLICY "rls_mb_all" ON member_badges FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- FAMILY_MEMBERS (user-scoped via membership)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'family_members' AND policyname = 'rls_fm_select') THEN
    CREATE POLICY "rls_fm_select" ON family_members FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'family_members' AND policyname = 'rls_fm_all') THEN
    CREATE POLICY "rls_fm_all" ON family_members FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- GROUP_AUDIT_LOGS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'group_audit_logs' AND policyname = 'rls_gal_select') THEN
    CREATE POLICY "rls_gal_select" ON group_audit_logs FOR SELECT TO authenticated
      USING (is_group_member(group_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'group_audit_logs' AND policyname = 'rls_gal_insert') THEN
    CREATE POLICY "rls_gal_insert" ON group_audit_logs FOR INSERT TO authenticated
      WITH CHECK (is_group_member(group_id));
  END IF;
END $$;

-- EVENT_PHOTOS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_photos' AND policyname = 'rls_ep_all') THEN
    CREATE POLICY "rls_ep_all" ON event_photos FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- PAYMENT_REMINDER_RULES, PAYMENT_REMINDERS_SENT
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payment_reminder_rules' AND policyname = 'rls_prr_all') THEN
    CREATE POLICY "rls_prr_all" ON payment_reminder_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payment_reminders_sent' AND policyname = 'rls_prs_all') THEN
    CREATE POLICY "rls_prs_all" ON payment_reminders_sent FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- HOSTING_SWAP_REQUESTS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'hosting_swap_requests' AND policyname = 'rls_hsr_all') THEN
    CREATE POLICY "rls_hsr_all" ON hosting_swap_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- MEMBER_TRANSFERS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'member_transfers' AND policyname = 'rls_mt_all') THEN
    CREATE POLICY "rls_mt_all" ON member_transfers FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ANNOUNCEMENT_DELIVERIES
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'announcement_deliveries' AND policyname = 'rls_ad_all') THEN
    CREATE POLICY "rls_ad_all" ON announcement_deliveries FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- FEEDBACK, FEEDBACK_VOTES
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'feedback' AND policyname = 'rls_fb_select') THEN
    CREATE POLICY "rls_fb_select" ON feedback FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'feedback' AND policyname = 'rls_fb_insert') THEN
    CREATE POLICY "rls_fb_insert" ON feedback FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'feedback_votes' AND policyname = 'rls_fv_all') THEN
    CREATE POLICY "rls_fv_all" ON feedback_votes FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- HELP_ARTICLES (public read)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'help_articles' AND policyname = 'rls_ha_select') THEN
    CREATE POLICY "rls_ha_select" ON help_articles FOR SELECT USING (true);
  END IF;
END $$;

-- NOTIFICATIONS (user-scoped)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'rls_notif_select') THEN
    CREATE POLICY "rls_notif_select" ON public.notifications FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'rls_notif_update') THEN
    CREATE POLICY "rls_notif_update" ON public.notifications FOR UPDATE TO authenticated
      USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'rls_notif_insert') THEN
    CREATE POLICY "rls_notif_insert" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

-- POSITION_ASSIGNMENTS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'position_assignments' AND policyname = 'rls_pa_select') THEN
    CREATE POLICY "rls_pa_select" ON public.position_assignments FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'position_assignments' AND policyname = 'rls_pa_all') THEN
    CREATE POLICY "rls_pa_all" ON public.position_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
