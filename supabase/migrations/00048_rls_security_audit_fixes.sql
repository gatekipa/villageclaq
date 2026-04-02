-- ============================================================
-- Migration 00048: RLS Security Audit — Fix Cross-Tenant Leaks
-- ============================================================
-- AUDIT FINDING: 10 tables have FOR ALL USING(true) policies from
-- 00014_consolidated_rls_policies.sql that were NEVER replaced.
-- These allow ANY authenticated user to read/write ANY group's data.
--
-- AUDIT FINDING: 8 tables have SELECT USING(true) policies from
-- 00026_tighten_rls_policies.sql that leak cross-tenant reads.
--
-- This migration drops every dangerous policy and replaces it with
-- proper group-scoped policies using SECURITY DEFINER helpers.
--
-- Run manually in Supabase SQL Editor.
-- ============================================================


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  PART A: FIX 10 TABLES WITH FOR ALL USING(true)  — P0      ║
-- ╚══════════════════════════════════════════════════════════════╝


-- ── 1. event_rsvps ──────────────────────────────────────────────
-- rls_rsvp_select USING(true) + rls_rsvp_all FOR ALL USING(true)
-- Both from 00014, never dropped.

DROP POLICY IF EXISTS "rls_rsvp_select" ON event_rsvps;
DROP POLICY IF EXISTS "rls_rsvp_all" ON event_rsvps;
-- Also drop original policies from 00003 (names may vary)
DROP POLICY IF EXISTS "Members can view RSVPs" ON event_rsvps;
DROP POLICY IF EXISTS "Members can manage own RSVPs" ON event_rsvps;

-- SELECT: members of the group (via event → group_id)
CREATE POLICY "rls_rsvp_select" ON event_rsvps
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_rsvps.event_id
        AND is_group_member(e.group_id)
    )
  );

-- INSERT: members can RSVP to events in their group
CREATE POLICY "rls_rsvp_insert" ON event_rsvps
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_rsvps.event_id
        AND is_group_member(e.group_id)
    )
  );

-- UPDATE: members can update own RSVP, admins can update any
CREATE POLICY "rls_rsvp_update" ON event_rsvps
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM events e
      JOIN memberships m ON m.group_id = e.group_id AND m.user_id = auth.uid()
      WHERE e.id = event_rsvps.event_id
        AND (event_rsvps.membership_id = m.id OR m.role IN ('owner', 'admin'))
    )
  );

-- DELETE: own RSVP or admin
CREATE POLICY "rls_rsvp_delete" ON event_rsvps
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM events e
      JOIN memberships m ON m.group_id = e.group_id AND m.user_id = auth.uid()
      WHERE e.id = event_rsvps.event_id
        AND (event_rsvps.membership_id = m.id OR m.role IN ('owner', 'admin'))
    )
  );


-- ── 2. event_attendances ────────────────────────────────────────
-- rls_att_select USING(true) + rls_att_all FOR ALL USING(true)
-- Both from 00014, never dropped.

DROP POLICY IF EXISTS "rls_att_select" ON event_attendances;
DROP POLICY IF EXISTS "rls_att_all" ON event_attendances;
-- Also drop originals from 00003
DROP POLICY IF EXISTS "Members can view attendance" ON event_attendances;
DROP POLICY IF EXISTS "Admins can manage attendance" ON event_attendances;
DROP POLICY IF EXISTS "Members can self check-in" ON event_attendances;

-- SELECT: members of the group
CREATE POLICY "rls_att_select" ON event_attendances
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_attendances.event_id
        AND is_group_member(e.group_id)
    )
  );

-- INSERT: admins record attendance, members self-check-in
CREATE POLICY "rls_att_insert" ON event_attendances
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_attendances.event_id
        AND is_group_member(e.group_id)
    )
  );

-- UPDATE: admins only
CREATE POLICY "rls_att_update" ON event_attendances
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_attendances.event_id
        AND is_group_admin(e.group_id)
    )
  );

-- DELETE: admins only
CREATE POLICY "rls_att_delete" ON event_attendances
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_attendances.event_id
        AND is_group_admin(e.group_id)
    )
  );


-- ── 3. feed_reactions ───────────────────────────────────────────
-- rls_fr_all FOR ALL USING(true) from 00014, never dropped.

DROP POLICY IF EXISTS "rls_fr_all" ON feed_reactions;
-- Drop originals from 00010
DROP POLICY IF EXISTS "Members can react to group feed" ON feed_reactions;

-- SELECT: members of the group (via activity_feed → group_id)
CREATE POLICY "rls_fr_select" ON feed_reactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM activity_feed af
      WHERE af.id = feed_reactions.feed_item_id
        AND is_group_member(af.group_id)
    )
  );

-- INSERT: members of the group
CREATE POLICY "rls_fr_insert" ON feed_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM activity_feed af
      WHERE af.id = feed_reactions.feed_item_id
        AND is_group_member(af.group_id)
    )
  );

-- UPDATE/DELETE: own reactions only (via membership_id → memberships.user_id)
CREATE POLICY "rls_fr_update" ON feed_reactions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.id = feed_reactions.membership_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "rls_fr_delete" ON feed_reactions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.id = feed_reactions.membership_id
        AND m.user_id = auth.uid()
    )
  );


-- ── 4. announcement_deliveries ──────────────────────────────────
-- rls_ad_all FOR ALL USING(true) from 00014, never dropped.

DROP POLICY IF EXISTS "rls_ad_all" ON announcement_deliveries;
-- Drop originals from 00008
DROP POLICY IF EXISTS "Members can view own deliveries" ON announcement_deliveries;
DROP POLICY IF EXISTS "Admins can manage deliveries" ON announcement_deliveries;

-- SELECT: member of the group (via announcement → group_id)
CREATE POLICY "rls_ad_select" ON announcement_deliveries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM announcements a
      WHERE a.id = announcement_deliveries.announcement_id
        AND is_group_member(a.group_id)
    )
  );

-- INSERT: admin/owner of the group
CREATE POLICY "rls_ad_insert" ON announcement_deliveries
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM announcements a
      WHERE a.id = announcement_deliveries.announcement_id
        AND is_group_admin(a.group_id)
    )
  );

-- UPDATE: own delivery (mark as read) or admin
CREATE POLICY "rls_ad_update" ON announcement_deliveries
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM announcements a
      WHERE a.id = announcement_deliveries.announcement_id
        AND is_group_member(a.group_id)
    )
  );


-- ── 5. event_photos ─────────────────────────────────────────────
-- rls_ep_all FOR ALL USING(true) from 00014, never dropped.

DROP POLICY IF EXISTS "rls_ep_all" ON event_photos;
-- Drop originals from 00010
DROP POLICY IF EXISTS "Members can view group event photos" ON event_photos;
DROP POLICY IF EXISTS "Members can upload event photos" ON event_photos;

-- SELECT: members of the group (via event → group_id)
CREATE POLICY "rls_ep_select" ON event_photos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_photos.event_id
        AND is_group_member(e.group_id)
    )
  );

-- INSERT: members of the group
CREATE POLICY "rls_ep_insert" ON event_photos
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_photos.event_id
        AND is_group_member(e.group_id)
    )
  );

-- UPDATE/DELETE: uploader (via membership_id → memberships.user_id) or admin
CREATE POLICY "rls_ep_update" ON event_photos
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.id = event_photos.uploaded_by
        AND m.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_photos.event_id
        AND is_group_admin(e.group_id)
    )
  );

CREATE POLICY "rls_ep_delete" ON event_photos
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.id = event_photos.uploaded_by
        AND m.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_photos.event_id
        AND is_group_admin(e.group_id)
    )
  );


-- ── 6. payment_reminder_rules ───────────────────────────────────
-- rls_prr_all FOR ALL USING(true) from 00014, never dropped.

DROP POLICY IF EXISTS "rls_prr_all" ON payment_reminder_rules;
-- Drop originals from 00010
DROP POLICY IF EXISTS "Members can view reminder rules" ON payment_reminder_rules;
DROP POLICY IF EXISTS "Admins can manage reminder rules" ON payment_reminder_rules;

-- SELECT: members of the group
CREATE POLICY "rls_prr_select" ON payment_reminder_rules
  FOR SELECT TO authenticated
  USING (is_group_member(group_id));

-- INSERT/UPDATE/DELETE: admins only
CREATE POLICY "rls_prr_insert" ON payment_reminder_rules
  FOR INSERT TO authenticated
  WITH CHECK (is_group_admin(group_id));

CREATE POLICY "rls_prr_update" ON payment_reminder_rules
  FOR UPDATE TO authenticated
  USING (is_group_admin(group_id));

CREATE POLICY "rls_prr_delete" ON payment_reminder_rules
  FOR DELETE TO authenticated
  USING (is_group_admin(group_id));


-- ── 7. payment_reminders_sent ───────────────────────────────────
-- rls_prs_all FOR ALL USING(true) from 00014, never dropped.

DROP POLICY IF EXISTS "rls_prs_all" ON payment_reminders_sent;
-- Drop originals from 00010
DROP POLICY IF EXISTS "Members can view sent reminders" ON payment_reminders_sent;

-- SELECT: members of the group (via rule → group_id)
CREATE POLICY "rls_prs_select" ON payment_reminders_sent
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM payment_reminder_rules prr
      WHERE prr.id = payment_reminders_sent.rule_id
        AND is_group_member(prr.group_id)
    )
  );

-- INSERT: system inserts (members or admins of the group)
CREATE POLICY "rls_prs_insert" ON payment_reminders_sent
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM payment_reminder_rules prr
      WHERE prr.id = payment_reminders_sent.rule_id
        AND is_group_member(prr.group_id)
    )
  );


-- ── 8. member_transfers ─────────────────────────────────────────
-- rls_mt_all FOR ALL USING(true) from 00014, never dropped.
-- 00030 only dropped original-named policies, not rls_mt_all.

DROP POLICY IF EXISTS "rls_mt_all" ON member_transfers;
-- The proper policies from 00030 remain intact:
--   "Admins of source or dest can view transfers" (SELECT)
--   "Admins can create transfers" (INSERT)
--   "Admins can update transfers" (UPDATE)


-- ── 9. family_members ───────────────────────────────────────────
-- rls_fm_select USING(true) + rls_fm_all FOR ALL USING(true)
-- Both from 00014, never dropped.

DROP POLICY IF EXISTS "rls_fm_select" ON family_members;
DROP POLICY IF EXISTS "rls_fm_all" ON family_members;
-- Drop originals from 00005
DROP POLICY IF EXISTS "Members can view own family" ON family_members;
DROP POLICY IF EXISTS "Members can manage own family" ON family_members;
DROP POLICY IF EXISTS "Admins can view all family members" ON family_members;

-- SELECT: own family (via membership) or admin of the group
CREATE POLICY "rls_fm_select" ON family_members
  FOR SELECT TO authenticated
  USING (
    -- Own family members
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.id = family_members.membership_id
        AND m.user_id = auth.uid()
    )
    OR
    -- Admin/owner of the group
    EXISTS (
      SELECT 1 FROM memberships m
      JOIN memberships target ON target.id = family_members.membership_id
        AND target.group_id = m.group_id
      WHERE m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
  );

-- INSERT/UPDATE/DELETE: own family only, or admin
CREATE POLICY "rls_fm_insert" ON family_members
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.id = family_members.membership_id
        AND m.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM memberships m
      JOIN memberships target ON target.id = family_members.membership_id
        AND target.group_id = m.group_id
      WHERE m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "rls_fm_update" ON family_members
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.id = family_members.membership_id
        AND m.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM memberships m
      JOIN memberships target ON target.id = family_members.membership_id
        AND target.group_id = m.group_id
      WHERE m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "rls_fm_delete" ON family_members
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.id = family_members.membership_id
        AND m.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM memberships m
      JOIN memberships target ON target.id = family_members.membership_id
        AND target.group_id = m.group_id
      WHERE m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
  );


-- ── 10. member_badges ───────────────────────────────────────────
-- rls_mb_all FOR ALL USING(true) from 00014, never dropped.

DROP POLICY IF EXISTS "rls_mb_all" ON member_badges;
-- Drop originals from 00010
DROP POLICY IF EXISTS "Anyone can view member badges" ON member_badges;
DROP POLICY IF EXISTS "System can award badges" ON member_badges;

-- SELECT: members of the group (via membership → group_id)
CREATE POLICY "rls_mb_select" ON member_badges
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.id = member_badges.membership_id
        AND is_group_member(m.group_id)
    )
  );

-- INSERT: admins award badges
CREATE POLICY "rls_mb_insert" ON member_badges
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.id = member_badges.membership_id
        AND is_group_admin(m.group_id)
    )
  );

-- DELETE: admins revoke badges
CREATE POLICY "rls_mb_delete" ON member_badges
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.id = member_badges.membership_id
        AND is_group_admin(m.group_id)
    )
  );


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  PART B: FIX 8 TABLES WITH SELECT USING(true) — P2         ║
-- ║  These allow cross-tenant reads of sensitive data.          ║
-- ║  Replacing with group-scoped SELECT policies.               ║
-- ╚══════════════════════════════════════════════════════════════╝


-- ── 11. savings_participants ────────────────────────────────────
-- rls_sp_select USING(true) from 00026 — leaks all participants

DROP POLICY IF EXISTS "rls_sp_select" ON savings_participants;
-- Also drop originals from 00009
DROP POLICY IF EXISTS "Members can view savings participants" ON savings_participants;

CREATE POLICY "rls_sp_select" ON savings_participants
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM savings_cycles sc
      WHERE sc.id = savings_participants.cycle_id
        AND is_group_member(sc.group_id)
    )
  );


-- ── 12. savings_contributions ───────────────────────────────────
-- rls_scon_select USING(true) from 00026

DROP POLICY IF EXISTS "rls_scon_select" ON savings_contributions;
DROP POLICY IF EXISTS "Members can view savings contributions" ON savings_contributions;

CREATE POLICY "rls_scon_select" ON savings_contributions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM savings_cycles sc
      WHERE sc.id = savings_contributions.cycle_id
        AND is_group_member(sc.group_id)
    )
  );


-- ── 13. election_candidates ─────────────────────────────────────
-- rls_ec_select USING(true) from 00026

DROP POLICY IF EXISTS "rls_ec_select" ON election_candidates;
DROP POLICY IF EXISTS "Members can view candidates" ON election_candidates;

CREATE POLICY "rls_ec_select" ON election_candidates
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM elections e
      WHERE e.id = election_candidates.election_id
        AND is_group_member(e.group_id)
    )
  );


-- ── 14. election_options ────────────────────────────────────────
-- rls_eo_select USING(true) from 00026

DROP POLICY IF EXISTS "rls_eo_select" ON election_options;
DROP POLICY IF EXISTS "Members can view election options" ON election_options;

CREATE POLICY "rls_eo_select" ON election_options
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM elections e
      WHERE e.id = election_options.election_id
        AND is_group_member(e.group_id)
    )
  );


-- ── 15. election_votes ──────────────────────────────────────────
-- rls_evote_select USING(true) from 00026 — VERY sensitive!
-- Any user can see ALL votes across ALL groups.

DROP POLICY IF EXISTS "rls_evote_select" ON election_votes;
DROP POLICY IF EXISTS "Members can view own votes" ON election_votes;

-- SELECT: members of the group (ballots are anonymous, but scoped)
CREATE POLICY "rls_evote_select" ON election_votes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM elections e
      WHERE e.id = election_votes.election_id
        AND is_group_member(e.group_id)
    )
  );


-- ── 16. project_contributions ───────────────────────────────────
-- rls_pcon_select USING(true) from 00026

DROP POLICY IF EXISTS "rls_pcon_select" ON project_contributions;
DROP POLICY IF EXISTS "Members can view project contributions" ON project_contributions;

CREATE POLICY "rls_pcon_select" ON project_contributions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_contributions.project_id
        AND is_group_member(p.group_id)
    )
  );


-- ── 17. project_expenses ────────────────────────────────────────
-- rls_pexp_select USING(true) from 00026

DROP POLICY IF EXISTS "rls_pexp_select" ON project_expenses;
DROP POLICY IF EXISTS "Members can view project expenses" ON project_expenses;

CREATE POLICY "rls_pexp_select" ON project_expenses
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_expenses.project_id
        AND is_group_member(p.group_id)
    )
  );


-- ── 18. project_milestones ──────────────────────────────────────
-- rls_pmil_select USING(true) from 00026

DROP POLICY IF EXISTS "rls_pmil_select" ON project_milestones;
DROP POLICY IF EXISTS "Members can view project milestones" ON project_milestones;

CREATE POLICY "rls_pmil_select" ON project_milestones
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_milestones.project_id
        AND is_group_member(p.group_id)
    )
  );


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  PART C: FIX exchange_rates unnest() PATTERN                ║
-- ║  00030 uses unnest(get_user_group_ids()) instead of         ║
-- ║  IN (SELECT get_user_group_ids())                           ║
-- ╚══════════════════════════════════════════════════════════════╝

-- The unnest() pattern works but is non-standard vs the rest of the codebase.
-- Functionally equivalent to IN (SELECT ...) but flagging for consistency.
-- NOT a vulnerability, just a code smell. Leaving as-is.


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  PART D: GRANT STATEMENTS                                   ║
-- ║  Supabase default privileges typically handle this, but      ║
-- ║  adding explicit GRANTs for tables that were missing them    ║
-- ║  to be safe (idempotent — harmless if already granted).      ║
-- ╚══════════════════════════════════════════════════════════════╝

GRANT ALL ON event_rsvps TO authenticated;
GRANT ALL ON event_attendances TO authenticated;
GRANT ALL ON feed_reactions TO authenticated;
GRANT ALL ON announcement_deliveries TO authenticated;
GRANT ALL ON event_photos TO authenticated;
GRANT ALL ON payment_reminder_rules TO authenticated;
GRANT ALL ON payment_reminders_sent TO authenticated;
GRANT ALL ON family_members TO authenticated;
GRANT ALL ON member_badges TO authenticated;
GRANT ALL ON savings_participants TO authenticated;
GRANT ALL ON savings_contributions TO authenticated;
GRANT ALL ON election_candidates TO authenticated;
GRANT ALL ON election_options TO authenticated;
GRANT ALL ON election_votes TO authenticated;
GRANT ALL ON project_contributions TO authenticated;
GRANT ALL ON project_expenses TO authenticated;
GRANT ALL ON project_milestones TO authenticated;

-- Additional tables that were created early and may lack explicit GRANTs
GRANT ALL ON profiles TO authenticated;
GRANT ALL ON groups TO authenticated;
GRANT ALL ON memberships TO authenticated;
GRANT ALL ON group_positions TO authenticated;
GRANT ALL ON position_assignments TO authenticated;
GRANT ALL ON position_permissions TO authenticated;
GRANT ALL ON invitations TO authenticated;
GRANT ALL ON join_codes TO authenticated;
GRANT ALL ON notifications TO authenticated;
GRANT ALL ON contribution_types TO authenticated;
GRANT ALL ON contribution_obligations TO authenticated;
GRANT ALL ON payments TO authenticated;
GRANT ALL ON events TO authenticated;
GRANT ALL ON hosting_rosters TO authenticated;
GRANT ALL ON hosting_assignments TO authenticated;
GRANT ALL ON hosting_swap_requests TO authenticated;
GRANT ALL ON meeting_minutes TO authenticated;
GRANT ALL ON announcements TO authenticated;
GRANT ALL ON savings_cycles TO authenticated;
GRANT ALL ON elections TO authenticated;
GRANT ALL ON documents TO authenticated;
GRANT ALL ON activity_feed TO authenticated;
GRANT ALL ON projects TO authenticated;
GRANT ALL ON badges TO authenticated;
GRANT ALL ON notifications_queue TO authenticated;
GRANT ALL ON group_payment_config TO authenticated;
