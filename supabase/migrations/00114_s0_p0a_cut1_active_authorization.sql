-- S0 Cut 1 — P0-A active membership / authorization boundary
--
-- Contract SHA: 5263f160943374676362b3983f39ac510a7930a2 (PR #75 docs, §25 wins)
-- Base:         0559b758bc53df3ec8081e361ffd022c1f19be43
-- PRODUCTION APPLY NOT AUTHORIZED — draft / disposable rehearsal only
--
-- One forward-only migration. Does not edit 00001–00113 or F0/F3.
-- All-or-nothing: missing expected policy OR security-relevant predicate
-- drift → RAISE EXCEPTION (not NOTICE+skip).
--
-- Out of scope: notifications_queue, storage, F0/F3 apply, PR70, election_votes,
-- is_group_member / get_user_group_ids bodies.

BEGIN;

CREATE OR REPLACE FUNCTION public.cut1_norm(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(regexp_replace(COALESCE(p, ''), '\s+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.cut1_expect_helper(
  p_name text,
  p_args text,
  p_src_md5 text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_oid oid;
  v_md5 text;
  v_src text;
BEGIN
  SELECT p.oid, p.prosrc
    INTO v_oid, v_src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = p_name
    AND pg_get_function_identity_arguments(p.oid) = p_args;
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'CUT1_ABORT: missing expected helper %.%(%)',
      'public', p_name, p_args;
  END IF;
  v_md5 := md5(v_src);
  IF v_md5 IS DISTINCT FROM p_src_md5 THEN
    RAISE EXCEPTION 'CUT1_ABORT: helper body fingerprint drift on %(%) got % expected %',
      p_name, p_args, v_md5, p_src_md5;
  END IF;
  IF p_name IN ('is_group_member', 'get_user_group_ids', 'is_group_admin',
                'is_group_admin_or_owner', 'is_group_owner', 'has_group_permission',
                'create_proxy_member')
     AND v_src ~* 'membership_status' THEN
    RAISE EXCEPTION 'CUT1_ABORT: helper % already contains membership_status (not the frozen status-blind live body)',
      p_name;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.cut1_expect_policy(
  p_table text,
  p_name text,
  p_cmd text,
  p_qual_norm text,
  p_check_norm text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_qual text;
  v_check text;
  v_cmd text;
BEGIN
  SELECT qual, with_check, cmd
    INTO v_qual, v_check, v_cmd
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = p_table
    AND policyname = p_name;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CUT1_ABORT: missing expected policy %.%', p_table, p_name;
  END IF;
  IF v_cmd IS DISTINCT FROM p_cmd THEN
    RAISE EXCEPTION 'CUT1_ABORT: command drift on %.% got % expected %',
      p_table, p_name, v_cmd, p_cmd;
  END IF;
  IF public.cut1_norm(v_qual) IS DISTINCT FROM COALESCE(p_qual_norm, '') THEN
    RAISE EXCEPTION 'CUT1_ABORT: security-relevant predicate drift (USING) on %.%',
      p_table, p_name;
  END IF;
  IF public.cut1_norm(v_check) IS DISTINCT FROM COALESCE(p_check_norm, '') THEN
    RAISE EXCEPTION 'CUT1_ABORT: security-relevant predicate drift (WITH CHECK) on %.%',
      p_table, p_name;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Loud preconditions (helpers + expected policies)
-- ---------------------------------------------------------------------------
DO $cut1_pre$
DECLARE
  v_mismatch int;
BEGIN
  PERFORM public.cut1_expect_helper('is_group_member', 'gid uuid, uid uuid', 'b91a35aadb657fa2cd2c99e9313ca0f1');
  PERFORM public.cut1_expect_helper('get_user_group_ids', 'uid uuid', 'a9865ade7502badcd2b92a74429ac1d9');
  PERFORM public.cut1_expect_helper('is_group_admin', 'gid uuid, uid uuid', 'a606b2986f998e8cd6ec9f6f488f6172');
  PERFORM public.cut1_expect_helper('is_group_admin_or_owner', 'p_group_id uuid', '44e3246f8dab340bf65a9766c70baac2');
  PERFORM public.cut1_expect_helper('is_group_owner', 'gid uuid, uid uuid', 'b57b416768d1af85bd50f07bcb9c733f');
  PERFORM public.cut1_expect_helper('has_group_permission', 'gid uuid, perm_key text, uid uuid', '9948d97decfc42d3159a34d3f04934b9');
  PERFORM public.cut1_expect_helper('create_proxy_member', 'p_group_id uuid, p_display_name text, p_phone text, p_role text', '10ab1a40d56ab1cc96fc3e59d23cd503');

  SELECT count(*) INTO v_mismatch
  FROM public.position_assignments pa
  JOIN public.memberships m ON m.id = pa.membership_id
  JOIN public.group_positions gp ON gp.id = pa.position_id
  WHERE m.group_id IS DISTINCT FROM gp.group_id;
  IF v_mismatch <> 0 THEN
    RAISE EXCEPTION 'CUT1_ABORT: position_assignments mismatch_count=% (snapshot was 0; no auto-repair)',
      v_mismatch;
  END IF;


  PERFORM public.cut1_expect_policy(
    $t$activity_feed$t$,
    $n$rls_af_all$n$,
    $c$ALL$c$,
    $q$is_group_member(group_id)$q$,
    $w$is_group_member(group_id)$w$
  );

  PERFORM public.cut1_expect_policy(
    $t$announcement_deliveries$t$,
    $n$rls_ad_update$n$,
    $c$UPDATE$c$,
    $q$(EXISTS ( SELECT 1 FROM announcements a WHERE ((a.id = announcement_deliveries.announcement_id) AND is_group_member(a.group_id))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$committee_members$t$,
    $n$Admins can manage committee members$n$,
    $c$ALL$c$,
    $q$(committee_id IN ( SELECT c.id FROM committees c WHERE ((c.group_id IN ( SELECT get_user_group_ids() AS get_user_group_ids)) AND (EXISTS ( SELECT 1 FROM memberships m WHERE ((m.user_id = auth.uid()) AND (m.group_id = c.group_id) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$committees$t$,
    $n$Admins can manage committees$n$,
    $c$ALL$c$,
    $q$((group_id IN ( SELECT get_user_group_ids() AS get_user_group_ids)) AND (EXISTS ( SELECT 1 FROM memberships m WHERE ((m.user_id = auth.uid()) AND (m.group_id = committees.group_id) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$constitution_amendments$t$,
    $n$rls_amend_insert$n$,
    $c$INSERT$c$,
    NULL,
    $w$is_group_member(group_id)$w$
  );

  PERFORM public.cut1_expect_policy(
    $t$disputes$t$,
    $n$Users can create disputes in their groups$n$,
    $c$INSERT$c$,
    NULL,
    $w$(group_id IN ( SELECT get_user_group_ids() AS get_user_group_ids))$w$
  );

  PERFORM public.cut1_expect_policy(
    $t$disputes$t$,
    $n$Users can delete disputes in their groups$n$,
    $c$DELETE$c$,
    $q$(group_id IN ( SELECT get_user_group_ids() AS get_user_group_ids))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$disputes$t$,
    $n$Users can update disputes in their groups$n$,
    $c$UPDATE$c$,
    $q$(group_id IN ( SELECT get_user_group_ids() AS get_user_group_ids))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$disputes$t$,
    $n$disputes_insert$n$,
    $c$INSERT$c$,
    NULL,
    $w$(group_id IN ( SELECT get_user_group_ids() AS get_user_group_ids))$w$
  );

  PERFORM public.cut1_expect_policy(
    $t$event_attendances$t$,
    $n$rls_att_insert$n$,
    $c$INSERT$c$,
    NULL,
    $w$(EXISTS ( SELECT 1 FROM events e WHERE ((e.id = event_attendances.event_id) AND is_group_member(e.group_id))))$w$
  );

  PERFORM public.cut1_expect_policy(
    $t$event_photos$t$,
    $n$rls_ep_insert$n$,
    $c$INSERT$c$,
    NULL,
    $w$(EXISTS ( SELECT 1 FROM events e WHERE ((e.id = event_photos.event_id) AND is_group_member(e.group_id))))$w$
  );

  PERFORM public.cut1_expect_policy(
    $t$event_rsvps$t$,
    $n$rls_rsvp_insert$n$,
    $c$INSERT$c$,
    NULL,
    $w$(EXISTS ( SELECT 1 FROM events e WHERE ((e.id = event_rsvps.event_id) AND is_group_member(e.group_id))))$w$
  );

  PERFORM public.cut1_expect_policy(
    $t$exchange_rates$t$,
    $n$HQ admins can manage exchange rates$n$,
    $c$ALL$c$,
    $q$(organization_id IN ( SELECT o.id FROM (organizations o JOIN groups g ON ((g.id = o.hq_group_id))) WHERE ((g.id IN ( SELECT get_user_group_ids() AS get_user_group_ids)) AND (EXISTS ( SELECT 1 FROM memberships m WHERE ((m.user_id = auth.uid()) AND (m.group_id = g.id) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$feed_reactions$t$,
    $n$rls_fr_insert$n$,
    $c$INSERT$c$,
    NULL,
    $w$(EXISTS ( SELECT 1 FROM activity_feed af WHERE ((af.id = feed_reactions.feed_item_id) AND is_group_member(af.group_id))))$w$
  );

  PERFORM public.cut1_expect_policy(
    $t$fines$t$,
    $n$rls_fin_update$n$,
    $c$UPDATE$c$,
    $q$is_group_member(group_id)$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$group_audit_logs$t$,
    $n$member_insert_audit_logs$n$,
    $c$INSERT$c$,
    NULL,
    $w$(group_id IN ( SELECT get_user_group_ids() AS get_user_group_ids))$w$
  );

  PERFORM public.cut1_expect_policy(
    $t$hosting_swap_requests$t$,
    $n$rls_hsr_insert$n$,
    $c$INSERT$c$,
    NULL,
    $w$((requested_by = auth.uid()) AND (from_assignment_id IN ( SELECT ha.id FROM (hosting_assignments ha JOIN hosting_rosters hr ON ((hr.id = ha.roster_id))) WHERE (hr.group_id IN ( SELECT get_user_group_ids() AS get_user_group_ids)))))$w$
  );

  PERFORM public.cut1_expect_policy(
    $t$memberships$t$,
    $n$Admins can add proxy members$n$,
    $c$INSERT$c$,
    NULL,
    $w$((is_proxy = true) AND (proxy_manager_id = auth.uid()) AND (group_id IN ( SELECT get_user_group_ids(auth.uid()) AS get_user_group_ids)))$w$
  );

  PERFORM public.cut1_expect_policy(
    $t$payment_reminders_sent$t$,
    $n$rls_prs_insert$n$,
    $c$INSERT$c$,
    NULL,
    $w$(EXISTS ( SELECT 1 FROM payment_reminder_rules prr WHERE ((prr.id = payment_reminders_sent.rule_id) AND is_group_member(prr.group_id))))$w$
  );

  PERFORM public.cut1_expect_policy(
    $t$payments$t$,
    $n$rls_pay_insert$n$,
    $c$INSERT$c$,
    NULL,
    $w$(is_group_member(group_id) AND (status = 'pending_confirmation'::text) AND (recorded_by = auth.uid()) AND (EXISTS ( SELECT 1 FROM memberships m WHERE ((m.id = payments.membership_id) AND (m.user_id = auth.uid())))))$w$
  );

  PERFORM public.cut1_expect_policy(
    $t$project_contributions$t$,
    $n$rls_pcon_write$n$,
    $c$INSERT$c$,
    NULL,
    $w$(EXISTS ( SELECT 1 FROM projects p WHERE ((p.id = project_contributions.project_id) AND is_group_member(p.group_id))))$w$
  );

  PERFORM public.cut1_expect_policy(
    $t$sub_group_transfers$t$,
    $n$Admins can update transfers$n$,
    $c$UPDATE$c$,
    $q$((group_id IN ( SELECT get_user_group_ids() AS get_user_group_ids)) AND (EXISTS ( SELECT 1 FROM memberships m WHERE ((m.user_id = auth.uid()) AND (m.group_id = sub_group_transfers.group_id) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$sub_group_transfers$t$,
    $n$Users can create transfers$n$,
    $c$INSERT$c$,
    NULL,
    $w$(group_id IN ( SELECT get_user_group_ids() AS get_user_group_ids))$w$
  );

  PERFORM public.cut1_expect_policy(
    $t$activity_feed$t$,
    $n$Admin update feed$n$,
    $c$UPDATE$c$,
    $q$(EXISTS ( SELECT 1 FROM memberships WHERE ((memberships.group_id = activity_feed.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$activity_feed$t$,
    $n$Members insert feed$n$,
    $c$INSERT$c$,
    NULL,
    $w$(EXISTS ( SELECT 1 FROM memberships WHERE ((memberships.group_id = activity_feed.group_id) AND (memberships.user_id = auth.uid()))))$w$
  );

  PERFORM public.cut1_expect_policy(
    $t$constitution_amendments$t$,
    $n$Admins can manage amendments$n$,
    $c$ALL$c$,
    $q$(group_id IN ( SELECT memberships.group_id FROM memberships WHERE ((memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$contribution_obligations$t$,
    $n$Group admins can manage obligations$n$,
    $c$INSERT$c$,
    NULL,
    $w$(EXISTS ( SELECT 1 FROM memberships WHERE ((memberships.group_id = contribution_obligations.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))$w$
  );

  PERFORM public.cut1_expect_policy(
    $t$contribution_obligations$t$,
    $n$Group admins can update obligations$n$,
    $c$UPDATE$c$,
    $q$(EXISTS ( SELECT 1 FROM memberships WHERE ((memberships.group_id = contribution_obligations.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$contribution_types$t$,
    $n$Group admins can delete contribution types$n$,
    $c$DELETE$c$,
    $q$(EXISTS ( SELECT 1 FROM memberships WHERE ((memberships.group_id = contribution_types.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$contribution_types$t$,
    $n$Group admins can manage contribution types$n$,
    $c$INSERT$c$,
    NULL,
    $w$(EXISTS ( SELECT 1 FROM memberships WHERE ((memberships.group_id = contribution_types.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))$w$
  );

  PERFORM public.cut1_expect_policy(
    $t$contribution_types$t$,
    $n$Group admins can update contribution types$n$,
    $c$UPDATE$c$,
    $q$(EXISTS ( SELECT 1 FROM memberships WHERE ((memberships.group_id = contribution_types.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$disputes$t$,
    $n$disputes_admin$n$,
    $c$ALL$c$,
    $q$(EXISTS ( SELECT 1 FROM memberships WHERE ((memberships.group_id = disputes.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$documents$t$,
    $n$Admins can manage documents$n$,
    $c$ALL$c$,
    $q$(EXISTS ( SELECT 1 FROM memberships WHERE ((memberships.group_id = documents.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role, 'moderator'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$election_options$t$,
    $n$Admins can manage options$n$,
    $c$ALL$c$,
    $q$(EXISTS ( SELECT 1 FROM (elections e JOIN memberships m ON ((m.group_id = e.group_id))) WHERE ((e.id = election_options.election_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role, 'moderator'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$elections$t$,
    $n$Admins can manage elections$n$,
    $c$ALL$c$,
    $q$(EXISTS ( SELECT 1 FROM memberships WHERE ((memberships.group_id = elections.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role, 'moderator'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$event_attendances$t$,
    $n$Group admins can manage attendance$n$,
    $c$ALL$c$,
    $q$(EXISTS ( SELECT 1 FROM (events JOIN memberships ON ((memberships.group_id = events.group_id))) WHERE ((events.id = event_attendances.event_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$event_photos$t$,
    $n$Members upload photos$n$,
    $c$INSERT$c$,
    NULL,
    $w$(EXISTS ( SELECT 1 FROM (events e JOIN memberships m ON ((m.group_id = e.group_id))) WHERE ((e.id = event_photos.event_id) AND (m.user_id = auth.uid()))))$w$
  );

  PERFORM public.cut1_expect_policy(
    $t$events$t$,
    $n$Group admins can create events$n$,
    $c$INSERT$c$,
    NULL,
    $w$(EXISTS ( SELECT 1 FROM memberships WHERE ((memberships.group_id = events.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))$w$
  );

  PERFORM public.cut1_expect_policy(
    $t$events$t$,
    $n$Group admins can delete events$n$,
    $c$DELETE$c$,
    $q$(EXISTS ( SELECT 1 FROM memberships WHERE ((memberships.group_id = events.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$events$t$,
    $n$Group admins can update events$n$,
    $c$UPDATE$c$,
    $q$(EXISTS ( SELECT 1 FROM memberships WHERE ((memberships.group_id = events.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$family_members$t$,
    $n$rls_fm_delete$n$,
    $c$DELETE$c$,
    $q$((EXISTS ( SELECT 1 FROM memberships m WHERE ((m.id = family_members.membership_id) AND (m.user_id = auth.uid())))) OR (EXISTS ( SELECT 1 FROM (memberships m JOIN memberships target ON (((target.id = family_members.membership_id) AND (target.group_id = m.group_id)))) WHERE ((m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$family_members$t$,
    $n$rls_fm_insert$n$,
    $c$INSERT$c$,
    NULL,
    $w$((EXISTS ( SELECT 1 FROM memberships m WHERE ((m.id = family_members.membership_id) AND (m.user_id = auth.uid())))) OR (EXISTS ( SELECT 1 FROM (memberships m JOIN memberships target ON (((target.id = family_members.membership_id) AND (target.group_id = m.group_id)))) WHERE ((m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))))$w$
  );

  PERFORM public.cut1_expect_policy(
    $t$family_members$t$,
    $n$rls_fm_update$n$,
    $c$UPDATE$c$,
    $q$((EXISTS ( SELECT 1 FROM memberships m WHERE ((m.id = family_members.membership_id) AND (m.user_id = auth.uid())))) OR (EXISTS ( SELECT 1 FROM (memberships m JOIN memberships target ON (((target.id = family_members.membership_id) AND (target.group_id = m.group_id)))) WHERE ((m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$feed_reactions$t$,
    $n$Members react$n$,
    $c$ALL$c$,
    $q$(EXISTS ( SELECT 1 FROM (activity_feed af JOIN memberships m ON ((m.group_id = af.group_id))) WHERE ((af.id = feed_reactions.feed_item_id) AND (m.user_id = auth.uid()))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$fine_types$t$,
    $n$fine_types_admin$n$,
    $c$ALL$c$,
    $q$(EXISTS ( SELECT 1 FROM memberships WHERE ((memberships.group_id = fine_types.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$fines$t$,
    $n$Admin manage fines$n$,
    $c$ALL$c$,
    $q$(EXISTS ( SELECT 1 FROM memberships WHERE ((memberships.group_id = fines.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$group_constitutions$t$,
    $n$Admins can manage constitutions$n$,
    $c$ALL$c$,
    $q$(group_id IN ( SELECT memberships.group_id FROM memberships WHERE ((memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$group_subscriptions$t$,
    $n$Admins can manage subscription$n$,
    $c$ALL$c$,
    $q$(EXISTS ( SELECT 1 FROM memberships WHERE ((memberships.group_id = group_subscriptions.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$hosting_assignments$t$,
    $n$Group admins can manage hosting assignments$n$,
    $c$ALL$c$,
    $q$(EXISTS ( SELECT 1 FROM (hosting_rosters JOIN memberships ON ((memberships.group_id = hosting_rosters.group_id))) WHERE ((hosting_rosters.id = hosting_assignments.roster_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$hosting_rosters$t$,
    $n$Group admins can manage hosting rosters$n$,
    $c$ALL$c$,
    $q$(EXISTS ( SELECT 1 FROM memberships WHERE ((memberships.group_id = hosting_rosters.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$invitations$t$,
    $n$Group admins can create invitations$n$,
    $c$INSERT$c$,
    NULL,
    $w$(EXISTS ( SELECT 1 FROM memberships WHERE ((memberships.group_id = invitations.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'moderator'::membership_role])))))$w$
  );

  PERFORM public.cut1_expect_policy(
    $t$invitations$t$,
    $n$Group admins can delete invitations$n$,
    $c$DELETE$c$,
    $q$(EXISTS ( SELECT 1 FROM memberships WHERE ((memberships.group_id = invitations.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'moderator'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$invitations$t$,
    $n$Group admins can update invitations$n$,
    $c$UPDATE$c$,
    $q$(EXISTS ( SELECT 1 FROM memberships WHERE ((memberships.group_id = invitations.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'moderator'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$loan_configs$t$,
    $n$loan_configs_delete$n$,
    $c$DELETE$c$,
    $q$(EXISTS ( SELECT 1 FROM memberships m WHERE ((m.group_id = loan_configs.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$loan_configs$t$,
    $n$loan_configs_insert$n$,
    $c$INSERT$c$,
    NULL,
    $w$(EXISTS ( SELECT 1 FROM memberships m WHERE ((m.group_id = loan_configs.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))$w$
  );

  PERFORM public.cut1_expect_policy(
    $t$loan_configs$t$,
    $n$loan_configs_update$n$,
    $c$UPDATE$c$,
    $q$(EXISTS ( SELECT 1 FROM memberships m WHERE ((m.group_id = loan_configs.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$loan_repayments$t$,
    $n$loan_repayments_delete$n$,
    $c$DELETE$c$,
    $q$(EXISTS ( SELECT 1 FROM (loans l JOIN memberships m ON (((m.group_id = l.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role]))))) WHERE (l.id = loan_repayments.loan_id)))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$loan_repayments$t$,
    $n$loan_repayments_insert$n$,
    $c$INSERT$c$,
    NULL,
    $w$(EXISTS ( SELECT 1 FROM (loans l JOIN memberships m ON (((m.group_id = l.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role]))))) WHERE (l.id = loan_repayments.loan_id)))$w$
  );

  PERFORM public.cut1_expect_policy(
    $t$loan_repayments$t$,
    $n$loan_repayments_update$n$,
    $c$UPDATE$c$,
    $q$(EXISTS ( SELECT 1 FROM (loans l JOIN memberships m ON (((m.group_id = l.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role]))))) WHERE (l.id = loan_repayments.loan_id)))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$loan_requests_v1$t$,
    $n$Admin manage loans$n$,
    $c$UPDATE$c$,
    $q$(EXISTS ( SELECT 1 FROM memberships WHERE ((memberships.group_id = loan_requests_v1.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$loan_requests_v1$t$,
    $n$Members request loans$n$,
    $c$INSERT$c$,
    NULL,
    $w$(EXISTS ( SELECT 1 FROM memberships WHERE ((memberships.group_id = loan_requests_v1.group_id) AND (memberships.user_id = auth.uid()))))$w$
  );

  PERFORM public.cut1_expect_policy(
    $t$loan_schedule$t$,
    $n$loan_schedule_delete$n$,
    $c$DELETE$c$,
    $q$(EXISTS ( SELECT 1 FROM (loans l JOIN memberships m ON (((m.group_id = l.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role]))))) WHERE (l.id = loan_schedule.loan_id)))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$loan_schedule$t$,
    $n$loan_schedule_insert$n$,
    $c$INSERT$c$,
    NULL,
    $w$(EXISTS ( SELECT 1 FROM (loans l JOIN memberships m ON (((m.group_id = l.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role]))))) WHERE (l.id = loan_schedule.loan_id)))$w$
  );

  PERFORM public.cut1_expect_policy(
    $t$loan_schedule$t$,
    $n$loan_schedule_update$n$,
    $c$UPDATE$c$,
    $q$(EXISTS ( SELECT 1 FROM (loans l JOIN memberships m ON (((m.group_id = l.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role]))))) WHERE (l.id = loan_schedule.loan_id)))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$loans$t$,
    $n$loans_delete$n$,
    $c$DELETE$c$,
    $q$(EXISTS ( SELECT 1 FROM memberships m WHERE ((m.group_id = loans.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$loans$t$,
    $n$loans_insert$n$,
    $c$INSERT$c$,
    NULL,
    $w$(EXISTS ( SELECT 1 FROM memberships m WHERE ((m.group_id = loans.group_id) AND (m.user_id = auth.uid()))))$w$
  );

  PERFORM public.cut1_expect_policy(
    $t$loans$t$,
    $n$loans_update$n$,
    $c$UPDATE$c$,
    $q$(EXISTS ( SELECT 1 FROM memberships m WHERE ((m.group_id = loans.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$member_transfers$t$,
    $n$transfers_delete$n$,
    $c$DELETE$c$,
    $q$((status = ANY (ARRAY['requested'::transfer_status, 'rejected'::transfer_status, 'cancelled'::transfer_status])) AND (EXISTS ( SELECT 1 FROM memberships m WHERE ((m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])) AND (m.group_id = member_transfers.source_group_id)))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$payment_reminder_rules$t$,
    $n$Admin manage reminder rules$n$,
    $c$ALL$c$,
    $q$(EXISTS ( SELECT 1 FROM memberships WHERE ((memberships.group_id = payment_reminder_rules.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$payments$t$,
    $n$Group admins and treasurers can record payments$n$,
    $c$INSERT$c$,
    NULL,
    $w$(EXISTS ( SELECT 1 FROM memberships WHERE ((memberships.group_id = payments.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))$w$
  );

  PERFORM public.cut1_expect_policy(
    $t$position_assignments$t$,
    $n$Group owners/admins can manage assignments$n$,
    $c$ALL$c$,
    $q$(EXISTS ( SELECT 1 FROM (group_positions gp JOIN memberships m ON ((m.group_id = gp.group_id))) WHERE ((gp.id = position_assignments.position_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$project_contributions$t$,
    $n$Members contribute to projects$n$,
    $c$INSERT$c$,
    NULL,
    $w$(EXISTS ( SELECT 1 FROM (projects p JOIN memberships m ON ((m.group_id = p.group_id))) WHERE ((p.id = project_contributions.project_id) AND (m.user_id = auth.uid()))))$w$
  );

  PERFORM public.cut1_expect_policy(
    $t$project_expenses$t$,
    $n$Admin manage expenses$n$,
    $c$ALL$c$,
    $q$(EXISTS ( SELECT 1 FROM (projects p JOIN memberships m ON ((m.group_id = p.group_id))) WHERE ((p.id = project_expenses.project_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$project_milestones$t$,
    $n$Admin manage milestones$n$,
    $c$ALL$c$,
    $q$(EXISTS ( SELECT 1 FROM (projects p JOIN memberships m ON ((m.group_id = p.group_id))) WHERE ((p.id = project_milestones.project_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$projects$t$,
    $n$Admin manage projects$n$,
    $c$ALL$c$,
    $q$(EXISTS ( SELECT 1 FROM memberships WHERE ((memberships.group_id = projects.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$relief_claims$t$,
    $n$Admins can manage claims$n$,
    $c$ALL$c$,
    $q$(EXISTS ( SELECT 1 FROM (relief_plans JOIN memberships ON ((memberships.group_id = relief_plans.group_id))) WHERE ((relief_plans.id = relief_claims.plan_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$relief_claims$t$,
    $n$Members can submit claims$n$,
    $c$INSERT$c$,
    NULL,
    $w$(EXISTS ( SELECT 1 FROM memberships WHERE ((memberships.id = relief_claims.membership_id) AND (memberships.user_id = auth.uid()))))$w$
  );

  PERFORM public.cut1_expect_policy(
    $t$relief_claims$t$,
    $n$relief_claims_delete$n$,
    $c$DELETE$c$,
    $q$(EXISTS ( SELECT 1 FROM (relief_plans rp JOIN memberships m ON (((m.group_id = rp.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role]))))) WHERE (rp.id = relief_claims.plan_id)))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$relief_claims$t$,
    $n$relief_claims_insert$n$,
    $c$INSERT$c$,
    NULL,
    $w$(EXISTS ( SELECT 1 FROM memberships m WHERE ((m.id = relief_claims.membership_id) AND (m.user_id = auth.uid()))))$w$
  );

  PERFORM public.cut1_expect_policy(
    $t$relief_claims$t$,
    $n$relief_claims_update$n$,
    $c$UPDATE$c$,
    $q$(EXISTS ( SELECT 1 FROM (relief_plans rp JOIN memberships m ON (((m.group_id = rp.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role]))))) WHERE (rp.id = relief_claims.plan_id)))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$relief_enrollments$t$,
    $n$Admins can manage enrollments$n$,
    $c$ALL$c$,
    $q$(EXISTS ( SELECT 1 FROM (relief_plans JOIN memberships ON ((memberships.group_id = relief_plans.group_id))) WHERE ((relief_plans.id = relief_enrollments.plan_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$relief_enrollments$t$,
    $n$relief_enrollments_delete$n$,
    $c$DELETE$c$,
    $q$(EXISTS ( SELECT 1 FROM (relief_plans rp JOIN memberships m ON (((m.group_id = rp.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role]))))) WHERE (rp.id = relief_enrollments.plan_id)))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$relief_enrollments$t$,
    $n$relief_enrollments_insert$n$,
    $c$INSERT$c$,
    NULL,
    $w$(EXISTS ( SELECT 1 FROM (relief_plans rp JOIN memberships m ON (((m.group_id = rp.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role]))))) WHERE (rp.id = relief_enrollments.plan_id)))$w$
  );

  PERFORM public.cut1_expect_policy(
    $t$relief_enrollments$t$,
    $n$relief_enrollments_update$n$,
    $c$UPDATE$c$,
    $q$(EXISTS ( SELECT 1 FROM (relief_plans rp JOIN memberships m ON (((m.group_id = rp.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role]))))) WHERE (rp.id = relief_enrollments.plan_id)))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$relief_payouts$t$,
    $n$Admins can manage payouts$n$,
    $c$ALL$c$,
    $q$(EXISTS ( SELECT 1 FROM ((relief_claims JOIN relief_plans ON ((relief_plans.id = relief_claims.plan_id))) JOIN memberships ON ((memberships.group_id = relief_plans.group_id))) WHERE ((relief_claims.id = relief_payouts.claim_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$relief_payouts$t$,
    $n$relief_payouts_delete$n$,
    $c$DELETE$c$,
    $q$(EXISTS ( SELECT 1 FROM ((relief_claims rc JOIN relief_plans rp ON ((rp.id = rc.plan_id))) JOIN memberships m ON (((m.group_id = rp.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role]))))) WHERE (rc.id = relief_payouts.claim_id)))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$relief_payouts$t$,
    $n$relief_payouts_insert$n$,
    $c$INSERT$c$,
    NULL,
    $w$(EXISTS ( SELECT 1 FROM ((relief_claims rc JOIN relief_plans rp ON ((rp.id = rc.plan_id))) JOIN memberships m ON (((m.group_id = rp.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role]))))) WHERE (rc.id = relief_payouts.claim_id)))$w$
  );

  PERFORM public.cut1_expect_policy(
    $t$relief_payouts$t$,
    $n$relief_payouts_update$n$,
    $c$UPDATE$c$,
    $q$(EXISTS ( SELECT 1 FROM ((relief_claims rc JOIN relief_plans rp ON ((rp.id = rc.plan_id))) JOIN memberships m ON (((m.group_id = rp.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role]))))) WHERE (rc.id = relief_payouts.claim_id)))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$relief_plans$t$,
    $n$Group admins can manage relief plans$n$,
    $c$ALL$c$,
    $q$(EXISTS ( SELECT 1 FROM memberships WHERE ((memberships.group_id = relief_plans.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$relief_remittances$t$,
    $n$relief_remittances_insert$n$,
    $c$INSERT$c$,
    NULL,
    $w$(EXISTS ( SELECT 1 FROM memberships m WHERE ((m.user_id = auth.uid()) AND (m.group_id = relief_remittances.branch_group_id) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))$w$
  );

  PERFORM public.cut1_expect_policy(
    $t$relief_remittances$t$,
    $n$relief_remittances_update$n$,
    $c$UPDATE$c$,
    $q$((EXISTS ( SELECT 1 FROM memberships m WHERE ((m.user_id = auth.uid()) AND (m.group_id = relief_remittances.branch_group_id) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role]))))) OR (EXISTS ( SELECT 1 FROM ((memberships m JOIN groups g_hq ON (((g_hq.id = m.group_id) AND (g_hq.group_level = 'hq'::text)))) JOIN groups g_branch ON (((g_branch.organization_id = g_hq.organization_id) AND (g_branch.organization_id IS NOT NULL)))) WHERE ((m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])) AND (g_branch.id = relief_remittances.branch_group_id)))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$savings_contributions$t$,
    $n$Admins can manage contributions$n$,
    $c$ALL$c$,
    $q$(EXISTS ( SELECT 1 FROM (savings_cycles sc JOIN memberships m ON ((m.group_id = sc.group_id))) WHERE ((sc.id = savings_contributions.cycle_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role, 'moderator'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$savings_cycles$t$,
    $n$Admins can manage savings cycles$n$,
    $c$ALL$c$,
    $q$(EXISTS ( SELECT 1 FROM memberships WHERE ((memberships.group_id = savings_cycles.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role, 'moderator'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$savings_participants$t$,
    $n$Admins can manage participants$n$,
    $c$ALL$c$,
    $q$(EXISTS ( SELECT 1 FROM (savings_cycles sc JOIN memberships m ON ((m.group_id = sc.group_id))) WHERE ((sc.id = savings_participants.cycle_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role, 'moderator'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$group_payment_config$t$,
    $n$Admins can delete payment config$n$,
    $c$DELETE$c$,
    $q$(group_id IN ( SELECT memberships.group_id FROM memberships WHERE ((memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$group_payment_config$t$,
    $n$Admins can insert payment config$n$,
    $c$INSERT$c$,
    NULL,
    $w$(group_id IN ( SELECT memberships.group_id FROM memberships WHERE ((memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))$w$
  );

  PERFORM public.cut1_expect_policy(
    $t$group_payment_config$t$,
    $n$Admins can update payment config$n$,
    $c$UPDATE$c$,
    $q$(group_id IN ( SELECT memberships.group_id FROM memberships WHERE ((memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$group_constitutions$t$,
    $n$rls_const_insert$n$,
    $c$INSERT$c$,
    NULL,
    $w$is_group_admin(group_id)$w$
  );

  PERFORM public.cut1_expect_policy(
    $t$group_constitutions$t$,
    $n$rls_const_update$n$,
    $c$UPDATE$c$,
    $q$is_group_admin(group_id)$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$group_constitutions$t$,
    $n$rls_const_delete$n$,
    $c$DELETE$c$,
    $q$is_group_admin(group_id)$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$constitution_amendments$t$,
    $n$rls_amend_update$n$,
    $c$UPDATE$c$,
    $q$is_group_admin(group_id)$q$,
    NULL
  );

  PERFORM public.cut1_expect_policy(
    $t$constitution_amendments$t$,
    $n$rls_amend_delete$n$,
    $c$DELETE$c$,
    $q$is_group_admin(group_id)$q$,
    NULL
  );
END;
$cut1_pre$;


-- ---------------------------------------------------------------------------
-- CREATE current-actor active helpers (R1)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_active_group_member(gid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.memberships m
       WHERE m.group_id = gid
         AND m.user_id = auth.uid()
         AND m.membership_status = 'active'
     );
$$;

CREATE OR REPLACE FUNCTION public.get_my_active_group_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT m.group_id
  FROM public.memberships m
  WHERE m.user_id = auth.uid()
    AND m.membership_status = 'active';
$$;

REVOKE ALL ON FUNCTION public.is_active_group_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_active_group_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_group_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_active_group_ids() TO authenticated;

-- ---------------------------------------------------------------------------
-- REPLACE operational helpers (preserve live signatures)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_group_admin(gid uuid, uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT (auth.uid() IS NULL OR uid IS NULL OR uid = auth.uid())
     AND EXISTS (
       SELECT 1
       FROM public.memberships
       WHERE group_id = gid
         AND user_id = uid
         AND role IN ('owner', 'admin')
         AND membership_status = 'active'
     );
$$;

CREATE OR REPLACE FUNCTION public.is_group_admin_or_owner(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships
    WHERE group_id = p_group_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
      AND membership_status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_group_owner(gid uuid, uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT (auth.uid() IS NULL OR uid IS NULL OR uid = auth.uid())
     AND EXISTS (
       SELECT 1
       FROM public.memberships
       WHERE group_id = gid
         AND user_id = uid
         AND role = 'owner'
         AND membership_status = 'active'
     );
$$;

-- LIVE fallback preserved: (1) membership (now ACTIVE) (2) owner → true
-- (3) count open position_assignments (4) admin AND count=0 → true
-- (5) else open assignment perm_key AND same-group group_positions join.
-- Authenticated callers cannot probe another uid.
CREATE OR REPLACE FUNCTION public.has_group_permission(
  gid uuid,
  perm_key text,
  uid uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_membership_id uuid;
  v_role text;
  v_assignment_count int;
  v_has_perm boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND uid IS NOT NULL AND uid IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  SELECT m.id, m.role::text
    INTO v_membership_id, v_role
  FROM public.memberships m
  WHERE m.group_id = gid
    AND m.user_id = uid
    AND m.membership_status = 'active'
  LIMIT 1;

  IF v_membership_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_role = 'owner' THEN
    RETURN true;
  END IF;

  SELECT COUNT(*) INTO v_assignment_count
  FROM public.position_assignments
  WHERE membership_id = v_membership_id AND ended_at IS NULL;

  IF v_role = 'admin' AND v_assignment_count = 0 THEN
    RETURN true;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.position_assignments pa
    JOIN public.position_permissions pp ON pp.position_id = pa.position_id
    JOIN public.group_positions gp
      ON gp.id = pa.position_id
     AND gp.group_id = gid
    WHERE pa.membership_id = v_membership_id
      AND pa.ended_at IS NULL
      AND pp.permission = perm_key
  ) INTO v_has_perm;

  RETURN v_has_perm;
END;
$$;

-- LIVE body preserved except ACTIVE on the officer gate + pinned search_path.
-- Do not add members.manage. Keep live proxy-role whitelist (already in prod).
CREATE OR REPLACE FUNCTION public.create_proxy_member(
  p_group_id uuid,
  p_display_name text,
  p_phone text DEFAULT NULL,
  p_role text DEFAULT 'member'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_membership_id uuid;
  caller_id uuid;
BEGIN
  caller_id := auth.uid();

  IF NOT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE group_id = p_group_id
      AND user_id = caller_id
      AND role IN ('owner', 'admin', 'moderator')
      AND membership_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Not authorized to create proxy members in this group';
  END IF;

  IF COALESCE(p_role, 'member') NOT IN ('member', 'moderator') THEN
    RAISE EXCEPTION 'invalid_proxy_role';
  END IF;

  new_membership_id := gen_random_uuid();

  INSERT INTO public.memberships (
    id, user_id, group_id, display_name, role, standing,
    is_proxy, proxy_manager_id, joined_at, privacy_settings
  ) VALUES (
    new_membership_id,
    NULL,
    p_group_id,
    p_display_name,
    COALESCE(p_role, 'member')::membership_role,
    'good'::membership_standing,
    true,
    caller_id,
    now(),
    jsonb_build_object(
      'proxy_phone', COALESCE(p_phone, ''),
      'proxy_name', p_display_name,
      'show_phone', false,
      'show_email', false
    )
  );

  RETURN new_membership_id;
END;
$$;

REVOKE ALL ON FUNCTION public.is_group_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_group_admin_or_owner(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_group_owner(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_group_permission(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_proxy_member(uuid, text, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_group_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_admin_or_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_group_permission(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_proxy_member(uuid, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- REQUIRED same-group position assignment trigger (R4)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_position_assignment_same_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_m_group uuid;
  v_p_group uuid;
BEGIN
  SELECT m.group_id INTO v_m_group
  FROM public.memberships m
  WHERE m.id = NEW.membership_id;

  SELECT gp.group_id INTO v_p_group
  FROM public.group_positions gp
  WHERE gp.id = NEW.position_id;

  IF v_m_group IS NULL OR v_p_group IS NULL
     OR v_m_group IS DISTINCT FROM v_p_group THEN
    RAISE EXCEPTION 'CUT1_POSITION_GROUP_MISMATCH: membership.group_id (%) IS DISTINCT FROM group_positions.group_id (%)',
      v_m_group, v_p_group;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_position_assignments_same_group ON public.position_assignments;
CREATE TRIGGER trg_position_assignments_same_group
  BEFORE INSERT OR UPDATE OF membership_id, position_id
  ON public.position_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_position_assignment_same_group();

-- ---------------------------------------------------------------------------
-- REWRITE policies (23 helper-matching + §24.7 neutralize)
-- ---------------------------------------------------------------------------

-- [rewrite23] activity_feed.rls_af_all ALL
DROP POLICY IF EXISTS $pn$rls_af_all$pn$ ON public.activity_feed;
CREATE POLICY $pn$rls_af_all$pn$ ON public.activity_feed
  FOR ALL
  TO authenticated
  USING (is_active_group_member(group_id))
  WITH CHECK (is_active_group_member(group_id));

-- [rewrite23] announcement_deliveries.rls_ad_update UPDATE
DROP POLICY IF EXISTS $pn$rls_ad_update$pn$ ON public.announcement_deliveries;
CREATE POLICY $pn$rls_ad_update$pn$ ON public.announcement_deliveries
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM announcements a
  WHERE ((a.id = announcement_deliveries.announcement_id) AND is_active_group_member(a.group_id)))));

-- [rewrite23] committee_members.Admins can manage committee members ALL
DROP POLICY IF EXISTS $pn$Admins can manage committee members$pn$ ON public.committee_members;
CREATE POLICY $pn$Admins can manage committee members$pn$ ON public.committee_members
  FOR ALL
  TO public
  USING ((committee_id IN ( SELECT c.id
   FROM committees c
  WHERE ((c.group_id IN ( SELECT get_my_active_group_ids() AS get_user_group_ids)) AND (EXISTS ( SELECT 1
           FROM memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.membership_status = 'active'::text) AND (m.group_id = c.group_id) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))))));

-- [rewrite23] committees.Admins can manage committees ALL
DROP POLICY IF EXISTS $pn$Admins can manage committees$pn$ ON public.committees;
CREATE POLICY $pn$Admins can manage committees$pn$ ON public.committees
  FOR ALL
  TO public
  USING (((group_id IN ( SELECT get_my_active_group_ids() AS get_user_group_ids)) AND (EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.membership_status = 'active'::text) AND (m.group_id = committees.group_id) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))));

-- [rewrite23] constitution_amendments.rls_amend_insert INSERT
DROP POLICY IF EXISTS $pn$rls_amend_insert$pn$ ON public.constitution_amendments;
CREATE POLICY $pn$rls_amend_insert$pn$ ON public.constitution_amendments
  FOR INSERT
  TO authenticated
  WITH CHECK (is_active_group_member(group_id));

-- [rewrite23] disputes.Users can create disputes in their groups INSERT
DROP POLICY IF EXISTS $pn$Users can create disputes in their groups$pn$ ON public.disputes;
CREATE POLICY $pn$Users can create disputes in their groups$pn$ ON public.disputes
  FOR INSERT
  TO public
  WITH CHECK ((group_id IN ( SELECT get_my_active_group_ids() AS get_user_group_ids)));

-- [rewrite23] disputes.Users can delete disputes in their groups DELETE
DROP POLICY IF EXISTS $pn$Users can delete disputes in their groups$pn$ ON public.disputes;
CREATE POLICY $pn$Users can delete disputes in their groups$pn$ ON public.disputes
  FOR DELETE
  TO public
  USING ((group_id IN ( SELECT get_my_active_group_ids() AS get_user_group_ids)));

-- [rewrite23] disputes.Users can update disputes in their groups UPDATE
DROP POLICY IF EXISTS $pn$Users can update disputes in their groups$pn$ ON public.disputes;
CREATE POLICY $pn$Users can update disputes in their groups$pn$ ON public.disputes
  FOR UPDATE
  TO public
  USING ((group_id IN ( SELECT get_my_active_group_ids() AS get_user_group_ids)));

-- [rewrite23] disputes.disputes_insert INSERT
DROP POLICY IF EXISTS $pn$disputes_insert$pn$ ON public.disputes;
CREATE POLICY $pn$disputes_insert$pn$ ON public.disputes
  FOR INSERT
  TO public
  WITH CHECK ((group_id IN ( SELECT get_my_active_group_ids() AS get_user_group_ids)));

-- [rewrite23] event_attendances.rls_att_insert INSERT
DROP POLICY IF EXISTS $pn$rls_att_insert$pn$ ON public.event_attendances;
CREATE POLICY $pn$rls_att_insert$pn$ ON public.event_attendances
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = event_attendances.event_id) AND is_active_group_member(e.group_id)))));

-- [rewrite23] event_photos.rls_ep_insert INSERT
DROP POLICY IF EXISTS $pn$rls_ep_insert$pn$ ON public.event_photos;
CREATE POLICY $pn$rls_ep_insert$pn$ ON public.event_photos
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = event_photos.event_id) AND is_active_group_member(e.group_id)))));

-- [rewrite23] event_rsvps.rls_rsvp_insert INSERT
DROP POLICY IF EXISTS $pn$rls_rsvp_insert$pn$ ON public.event_rsvps;
CREATE POLICY $pn$rls_rsvp_insert$pn$ ON public.event_rsvps
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = event_rsvps.event_id) AND is_active_group_member(e.group_id)))));

-- [rewrite23] exchange_rates.HQ admins can manage exchange rates ALL
DROP POLICY IF EXISTS $pn$HQ admins can manage exchange rates$pn$ ON public.exchange_rates;
CREATE POLICY $pn$HQ admins can manage exchange rates$pn$ ON public.exchange_rates
  FOR ALL
  TO public
  USING ((organization_id IN ( SELECT o.id
   FROM (organizations o
     JOIN groups g ON ((g.id = o.hq_group_id)))
  WHERE ((g.id IN ( SELECT get_my_active_group_ids() AS get_user_group_ids)) AND (EXISTS ( SELECT 1
           FROM memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.membership_status = 'active'::text) AND (m.group_id = g.id) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))))));

-- [rewrite23] feed_reactions.rls_fr_insert INSERT
DROP POLICY IF EXISTS $pn$rls_fr_insert$pn$ ON public.feed_reactions;
CREATE POLICY $pn$rls_fr_insert$pn$ ON public.feed_reactions
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM activity_feed af
  WHERE ((af.id = feed_reactions.feed_item_id) AND is_active_group_member(af.group_id)))));

-- [rewrite23] fines.rls_fin_update UPDATE
DROP POLICY IF EXISTS $pn$rls_fin_update$pn$ ON public.fines;
CREATE POLICY $pn$rls_fin_update$pn$ ON public.fines
  FOR UPDATE
  TO authenticated
  USING (is_active_group_member(group_id));

-- [rewrite23] group_audit_logs.member_insert_audit_logs INSERT
DROP POLICY IF EXISTS $pn$member_insert_audit_logs$pn$ ON public.group_audit_logs;
CREATE POLICY $pn$member_insert_audit_logs$pn$ ON public.group_audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK ((group_id IN ( SELECT get_my_active_group_ids() AS get_user_group_ids)));

-- [rewrite23] hosting_swap_requests.rls_hsr_insert INSERT
DROP POLICY IF EXISTS $pn$rls_hsr_insert$pn$ ON public.hosting_swap_requests;
CREATE POLICY $pn$rls_hsr_insert$pn$ ON public.hosting_swap_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (((requested_by = auth.uid()) AND (from_assignment_id IN ( SELECT ha.id
   FROM (hosting_assignments ha
     JOIN hosting_rosters hr ON ((hr.id = ha.roster_id)))
  WHERE (hr.group_id IN ( SELECT get_my_active_group_ids() AS get_user_group_ids))))));

-- [rewrite23] memberships.Admins can add proxy members INSERT
DROP POLICY IF EXISTS $pn$Admins can add proxy members$pn$ ON public.memberships;
CREATE POLICY $pn$Admins can add proxy members$pn$ ON public.memberships
  FOR INSERT
  TO public
  WITH CHECK (((is_proxy = true) AND (proxy_manager_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.group_id = memberships.group_id) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'moderator'::membership_role])) AND (m.membership_status = 'active'::text))))));

-- [rewrite23] payment_reminders_sent.rls_prs_insert INSERT
DROP POLICY IF EXISTS $pn$rls_prs_insert$pn$ ON public.payment_reminders_sent;
CREATE POLICY $pn$rls_prs_insert$pn$ ON public.payment_reminders_sent
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM payment_reminder_rules prr
  WHERE ((prr.id = payment_reminders_sent.rule_id) AND is_active_group_member(prr.group_id)))));

-- [rewrite23] payments.rls_pay_insert INSERT
DROP POLICY IF EXISTS $pn$rls_pay_insert$pn$ ON public.payments;
CREATE POLICY $pn$rls_pay_insert$pn$ ON public.payments
  FOR INSERT
  TO authenticated
  WITH CHECK ((is_active_group_member(group_id) AND (status = 'pending_confirmation'::text) AND (recorded_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.id = payments.membership_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text))))));

-- [rewrite23] project_contributions.rls_pcon_write INSERT
DROP POLICY IF EXISTS $pn$rls_pcon_write$pn$ ON public.project_contributions;
CREATE POLICY $pn$rls_pcon_write$pn$ ON public.project_contributions
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = project_contributions.project_id) AND is_active_group_member(p.group_id)))));

-- [rewrite23] sub_group_transfers.Admins can update transfers UPDATE
DROP POLICY IF EXISTS $pn$Admins can update transfers$pn$ ON public.sub_group_transfers;
CREATE POLICY $pn$Admins can update transfers$pn$ ON public.sub_group_transfers
  FOR UPDATE
  TO public
  USING (((group_id IN ( SELECT get_my_active_group_ids() AS get_user_group_ids)) AND (EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.membership_status = 'active'::text) AND (m.group_id = sub_group_transfers.group_id) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))));

-- [rewrite23] sub_group_transfers.Users can create transfers INSERT
DROP POLICY IF EXISTS $pn$Users can create transfers$pn$ ON public.sub_group_transfers;
CREATE POLICY $pn$Users can create transfers$pn$ ON public.sub_group_transfers
  FOR INSERT
  TO public
  WITH CHECK ((group_id IN ( SELECT get_my_active_group_ids() AS get_user_group_ids)));

-- [neutralize] activity_feed.Admin update feed UPDATE
DROP POLICY IF EXISTS $pn$Admin update feed$pn$ ON public.activity_feed;
CREATE POLICY $pn$Admin update feed$pn$ ON public.activity_feed
  FOR UPDATE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = activity_feed.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

-- [neutralize] activity_feed.Members insert feed INSERT
DROP POLICY IF EXISTS $pn$Members insert feed$pn$ ON public.activity_feed;
CREATE POLICY $pn$Members insert feed$pn$ ON public.activity_feed
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = activity_feed.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text)))));

-- [neutralize] constitution_amendments.Admins can manage amendments ALL
DROP POLICY IF EXISTS $pn$Admins can manage amendments$pn$ ON public.constitution_amendments;
CREATE POLICY $pn$Admins can manage amendments$pn$ ON public.constitution_amendments
  FOR ALL
  TO public
  USING ((group_id IN ( SELECT memberships.group_id
   FROM memberships
  WHERE ((memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

-- [neutralize] contribution_obligations.Group admins can manage obligations INSERT
DROP POLICY IF EXISTS $pn$Group admins can manage obligations$pn$ ON public.contribution_obligations;
CREATE POLICY $pn$Group admins can manage obligations$pn$ ON public.contribution_obligations
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = contribution_obligations.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

-- [neutralize] contribution_obligations.Group admins can update obligations UPDATE
DROP POLICY IF EXISTS $pn$Group admins can update obligations$pn$ ON public.contribution_obligations;
CREATE POLICY $pn$Group admins can update obligations$pn$ ON public.contribution_obligations
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = contribution_obligations.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

-- [neutralize] contribution_types.Group admins can delete contribution types DELETE
DROP POLICY IF EXISTS $pn$Group admins can delete contribution types$pn$ ON public.contribution_types;
CREATE POLICY $pn$Group admins can delete contribution types$pn$ ON public.contribution_types
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = contribution_types.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

-- [neutralize] contribution_types.Group admins can manage contribution types INSERT
DROP POLICY IF EXISTS $pn$Group admins can manage contribution types$pn$ ON public.contribution_types;
CREATE POLICY $pn$Group admins can manage contribution types$pn$ ON public.contribution_types
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = contribution_types.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

-- [neutralize] contribution_types.Group admins can update contribution types UPDATE
DROP POLICY IF EXISTS $pn$Group admins can update contribution types$pn$ ON public.contribution_types;
CREATE POLICY $pn$Group admins can update contribution types$pn$ ON public.contribution_types
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = contribution_types.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

-- [neutralize] disputes.disputes_admin ALL
DROP POLICY IF EXISTS $pn$disputes_admin$pn$ ON public.disputes;
CREATE POLICY $pn$disputes_admin$pn$ ON public.disputes
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = disputes.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

-- [neutralize] documents.Admins can manage documents ALL
DROP POLICY IF EXISTS $pn$Admins can manage documents$pn$ ON public.documents;
CREATE POLICY $pn$Admins can manage documents$pn$ ON public.documents
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = documents.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text) AND (memberships.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role, 'moderator'::membership_role]))))));

-- [neutralize] election_options.Admins can manage options ALL
DROP POLICY IF EXISTS $pn$Admins can manage options$pn$ ON public.election_options;
CREATE POLICY $pn$Admins can manage options$pn$ ON public.election_options
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (elections e
     JOIN memberships m ON ((m.group_id = e.group_id)))
  WHERE ((e.id = election_options.election_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role, 'moderator'::membership_role]))))));

-- [neutralize] elections.Admins can manage elections ALL
DROP POLICY IF EXISTS $pn$Admins can manage elections$pn$ ON public.elections;
CREATE POLICY $pn$Admins can manage elections$pn$ ON public.elections
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = elections.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text) AND (memberships.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role, 'moderator'::membership_role]))))));

-- [neutralize] event_attendances.Group admins can manage attendance ALL
DROP POLICY IF EXISTS $pn$Group admins can manage attendance$pn$ ON public.event_attendances;
CREATE POLICY $pn$Group admins can manage attendance$pn$ ON public.event_attendances
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (events
     JOIN memberships ON ((memberships.group_id = events.group_id)))
  WHERE ((events.id = event_attendances.event_id) AND (memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

-- [neutralize] event_photos.Members upload photos INSERT
DROP POLICY IF EXISTS $pn$Members upload photos$pn$ ON public.event_photos;
CREATE POLICY $pn$Members upload photos$pn$ ON public.event_photos
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (events e
     JOIN memberships m ON ((m.group_id = e.group_id)))
  WHERE ((e.id = event_photos.event_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text)))));

-- [neutralize] events.Group admins can create events INSERT
DROP POLICY IF EXISTS $pn$Group admins can create events$pn$ ON public.events;
CREATE POLICY $pn$Group admins can create events$pn$ ON public.events
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = events.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

-- [neutralize] events.Group admins can delete events DELETE
DROP POLICY IF EXISTS $pn$Group admins can delete events$pn$ ON public.events;
CREATE POLICY $pn$Group admins can delete events$pn$ ON public.events
  FOR DELETE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = events.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

-- [neutralize] events.Group admins can update events UPDATE
DROP POLICY IF EXISTS $pn$Group admins can update events$pn$ ON public.events;
CREATE POLICY $pn$Group admins can update events$pn$ ON public.events
  FOR UPDATE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = events.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

-- [neutralize] family_members.rls_fm_delete DELETE
DROP POLICY IF EXISTS $pn$rls_fm_delete$pn$ ON public.family_members;
CREATE POLICY $pn$rls_fm_delete$pn$ ON public.family_members
  FOR DELETE
  TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.id = family_members.membership_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text)))) OR (EXISTS ( SELECT 1
   FROM (memberships m
     JOIN memberships target ON (((target.id = family_members.membership_id) AND (target.group_id = m.group_id))))
  WHERE ((m.user_id = auth.uid()) AND (m.membership_status = 'active'::text) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))));

-- [neutralize] family_members.rls_fm_insert INSERT
DROP POLICY IF EXISTS $pn$rls_fm_insert$pn$ ON public.family_members;
CREATE POLICY $pn$rls_fm_insert$pn$ ON public.family_members
  FOR INSERT
  TO authenticated
  WITH CHECK (((EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.id = family_members.membership_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text)))) OR (EXISTS ( SELECT 1
   FROM (memberships m
     JOIN memberships target ON (((target.id = family_members.membership_id) AND (target.group_id = m.group_id))))
  WHERE ((m.user_id = auth.uid()) AND (m.membership_status = 'active'::text) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))));

-- [neutralize] family_members.rls_fm_update UPDATE
DROP POLICY IF EXISTS $pn$rls_fm_update$pn$ ON public.family_members;
CREATE POLICY $pn$rls_fm_update$pn$ ON public.family_members
  FOR UPDATE
  TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.id = family_members.membership_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text)))) OR (EXISTS ( SELECT 1
   FROM (memberships m
     JOIN memberships target ON (((target.id = family_members.membership_id) AND (target.group_id = m.group_id))))
  WHERE ((m.user_id = auth.uid()) AND (m.membership_status = 'active'::text) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))));

-- [neutralize] feed_reactions.Members react ALL
DROP POLICY IF EXISTS $pn$Members react$pn$ ON public.feed_reactions;
CREATE POLICY $pn$Members react$pn$ ON public.feed_reactions
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (activity_feed af
     JOIN memberships m ON ((m.group_id = af.group_id)))
  WHERE ((af.id = feed_reactions.feed_item_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text)))));

-- [neutralize] fine_types.fine_types_admin ALL
DROP POLICY IF EXISTS $pn$fine_types_admin$pn$ ON public.fine_types;
CREATE POLICY $pn$fine_types_admin$pn$ ON public.fine_types
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = fine_types.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

-- [neutralize] fines.Admin manage fines ALL
DROP POLICY IF EXISTS $pn$Admin manage fines$pn$ ON public.fines;
CREATE POLICY $pn$Admin manage fines$pn$ ON public.fines
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = fines.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

-- [neutralize] group_constitutions.Admins can manage constitutions ALL
DROP POLICY IF EXISTS $pn$Admins can manage constitutions$pn$ ON public.group_constitutions;
CREATE POLICY $pn$Admins can manage constitutions$pn$ ON public.group_constitutions
  FOR ALL
  TO public
  USING ((group_id IN ( SELECT memberships.group_id
   FROM memberships
  WHERE ((memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

-- [neutralize] group_subscriptions.Admins can manage subscription ALL
DROP POLICY IF EXISTS $pn$Admins can manage subscription$pn$ ON public.group_subscriptions;
CREATE POLICY $pn$Admins can manage subscription$pn$ ON public.group_subscriptions
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = group_subscriptions.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

-- [neutralize] hosting_assignments.Group admins can manage hosting assignments ALL
DROP POLICY IF EXISTS $pn$Group admins can manage hosting assignments$pn$ ON public.hosting_assignments;
CREATE POLICY $pn$Group admins can manage hosting assignments$pn$ ON public.hosting_assignments
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (hosting_rosters
     JOIN memberships ON ((memberships.group_id = hosting_rosters.group_id)))
  WHERE ((hosting_rosters.id = hosting_assignments.roster_id) AND (memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

-- [neutralize] hosting_rosters.Group admins can manage hosting rosters ALL
DROP POLICY IF EXISTS $pn$Group admins can manage hosting rosters$pn$ ON public.hosting_rosters;
CREATE POLICY $pn$Group admins can manage hosting rosters$pn$ ON public.hosting_rosters
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = hosting_rosters.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

-- [neutralize] invitations.Group admins can create invitations INSERT
DROP POLICY IF EXISTS $pn$Group admins can create invitations$pn$ ON public.invitations;
CREATE POLICY $pn$Group admins can create invitations$pn$ ON public.invitations
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = invitations.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'moderator'::membership_role]))))));

-- [neutralize] invitations.Group admins can delete invitations DELETE
DROP POLICY IF EXISTS $pn$Group admins can delete invitations$pn$ ON public.invitations;
CREATE POLICY $pn$Group admins can delete invitations$pn$ ON public.invitations
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = invitations.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'moderator'::membership_role]))))));

-- [neutralize] invitations.Group admins can update invitations UPDATE
DROP POLICY IF EXISTS $pn$Group admins can update invitations$pn$ ON public.invitations;
CREATE POLICY $pn$Group admins can update invitations$pn$ ON public.invitations
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = invitations.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'moderator'::membership_role]))))));

-- [neutralize] loan_configs.loan_configs_delete DELETE
DROP POLICY IF EXISTS $pn$loan_configs_delete$pn$ ON public.loan_configs;
CREATE POLICY $pn$loan_configs_delete$pn$ ON public.loan_configs
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.group_id = loan_configs.group_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role]))))));

-- [neutralize] loan_configs.loan_configs_insert INSERT
DROP POLICY IF EXISTS $pn$loan_configs_insert$pn$ ON public.loan_configs;
CREATE POLICY $pn$loan_configs_insert$pn$ ON public.loan_configs
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.group_id = loan_configs.group_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role]))))));

-- [neutralize] loan_configs.loan_configs_update UPDATE
DROP POLICY IF EXISTS $pn$loan_configs_update$pn$ ON public.loan_configs;
CREATE POLICY $pn$loan_configs_update$pn$ ON public.loan_configs
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.group_id = loan_configs.group_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role]))))));

-- [neutralize] loan_repayments.loan_repayments_delete DELETE
DROP POLICY IF EXISTS $pn$loan_repayments_delete$pn$ ON public.loan_repayments;
CREATE POLICY $pn$loan_repayments_delete$pn$ ON public.loan_repayments
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (loans l
     JOIN memberships m ON (((m.group_id = l.group_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))
  WHERE (l.id = loan_repayments.loan_id))));

-- [neutralize] loan_repayments.loan_repayments_insert INSERT
DROP POLICY IF EXISTS $pn$loan_repayments_insert$pn$ ON public.loan_repayments;
CREATE POLICY $pn$loan_repayments_insert$pn$ ON public.loan_repayments
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (loans l
     JOIN memberships m ON (((m.group_id = l.group_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))
  WHERE (l.id = loan_repayments.loan_id))));

-- [neutralize] loan_repayments.loan_repayments_update UPDATE
DROP POLICY IF EXISTS $pn$loan_repayments_update$pn$ ON public.loan_repayments;
CREATE POLICY $pn$loan_repayments_update$pn$ ON public.loan_repayments
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (loans l
     JOIN memberships m ON (((m.group_id = l.group_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))
  WHERE (l.id = loan_repayments.loan_id))));

-- [neutralize] loan_requests_v1.Admin manage loans UPDATE
DROP POLICY IF EXISTS $pn$Admin manage loans$pn$ ON public.loan_requests_v1;
CREATE POLICY $pn$Admin manage loans$pn$ ON public.loan_requests_v1
  FOR UPDATE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = loan_requests_v1.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

-- [neutralize] loan_requests_v1.Members request loans INSERT
DROP POLICY IF EXISTS $pn$Members request loans$pn$ ON public.loan_requests_v1;
CREATE POLICY $pn$Members request loans$pn$ ON public.loan_requests_v1
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = loan_requests_v1.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text)))));

-- [neutralize] loan_schedule.loan_schedule_delete DELETE
DROP POLICY IF EXISTS $pn$loan_schedule_delete$pn$ ON public.loan_schedule;
CREATE POLICY $pn$loan_schedule_delete$pn$ ON public.loan_schedule
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (loans l
     JOIN memberships m ON (((m.group_id = l.group_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))
  WHERE (l.id = loan_schedule.loan_id))));

-- [neutralize] loan_schedule.loan_schedule_insert INSERT
DROP POLICY IF EXISTS $pn$loan_schedule_insert$pn$ ON public.loan_schedule;
CREATE POLICY $pn$loan_schedule_insert$pn$ ON public.loan_schedule
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (loans l
     JOIN memberships m ON (((m.group_id = l.group_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))
  WHERE (l.id = loan_schedule.loan_id))));

-- [neutralize] loan_schedule.loan_schedule_update UPDATE
DROP POLICY IF EXISTS $pn$loan_schedule_update$pn$ ON public.loan_schedule;
CREATE POLICY $pn$loan_schedule_update$pn$ ON public.loan_schedule
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (loans l
     JOIN memberships m ON (((m.group_id = l.group_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))
  WHERE (l.id = loan_schedule.loan_id))));

-- [neutralize] loans.loans_delete DELETE
DROP POLICY IF EXISTS $pn$loans_delete$pn$ ON public.loans;
CREATE POLICY $pn$loans_delete$pn$ ON public.loans
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.group_id = loans.group_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role]))))));

-- [neutralize] loans.loans_insert INSERT
DROP POLICY IF EXISTS $pn$loans_insert$pn$ ON public.loans;
CREATE POLICY $pn$loans_insert$pn$ ON public.loans
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.group_id = loans.group_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text)))));

-- [neutralize] loans.loans_update UPDATE
DROP POLICY IF EXISTS $pn$loans_update$pn$ ON public.loans;
CREATE POLICY $pn$loans_update$pn$ ON public.loans
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.group_id = loans.group_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role]))))));

-- [neutralize] member_transfers.transfers_delete DELETE
DROP POLICY IF EXISTS $pn$transfers_delete$pn$ ON public.member_transfers;
CREATE POLICY $pn$transfers_delete$pn$ ON public.member_transfers
  FOR DELETE
  TO authenticated
  USING (((status = ANY (ARRAY['requested'::transfer_status, 'rejected'::transfer_status, 'cancelled'::transfer_status])) AND (EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.membership_status = 'active'::text) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])) AND (m.group_id = member_transfers.source_group_id))))));

-- [neutralize] payment_reminder_rules.Admin manage reminder rules ALL
DROP POLICY IF EXISTS $pn$Admin manage reminder rules$pn$ ON public.payment_reminder_rules;
CREATE POLICY $pn$Admin manage reminder rules$pn$ ON public.payment_reminder_rules
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = payment_reminder_rules.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

-- [neutralize] payments.Group admins and treasurers can record payments INSERT
DROP POLICY IF EXISTS $pn$Group admins and treasurers can record payments$pn$ ON public.payments;
CREATE POLICY $pn$Group admins and treasurers can record payments$pn$ ON public.payments
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = payments.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

-- [neutralize] position_assignments.Group owners/admins can manage assignments ALL
DROP POLICY IF EXISTS $pn$Group owners/admins can manage assignments$pn$ ON public.position_assignments;
CREATE POLICY $pn$Group owners/admins can manage assignments$pn$ ON public.position_assignments
  FOR ALL
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (group_positions gp
     JOIN memberships m ON ((m.group_id = gp.group_id)))
  WHERE ((gp.id = position_assignments.position_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

-- [neutralize] project_contributions.Members contribute to projects INSERT
DROP POLICY IF EXISTS $pn$Members contribute to projects$pn$ ON public.project_contributions;
CREATE POLICY $pn$Members contribute to projects$pn$ ON public.project_contributions
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (projects p
     JOIN memberships m ON ((m.group_id = p.group_id)))
  WHERE ((p.id = project_contributions.project_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text)))));

-- [neutralize] project_expenses.Admin manage expenses ALL
DROP POLICY IF EXISTS $pn$Admin manage expenses$pn$ ON public.project_expenses;
CREATE POLICY $pn$Admin manage expenses$pn$ ON public.project_expenses
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (projects p
     JOIN memberships m ON ((m.group_id = p.group_id)))
  WHERE ((p.id = project_expenses.project_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

-- [neutralize] project_milestones.Admin manage milestones ALL
DROP POLICY IF EXISTS $pn$Admin manage milestones$pn$ ON public.project_milestones;
CREATE POLICY $pn$Admin manage milestones$pn$ ON public.project_milestones
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (projects p
     JOIN memberships m ON ((m.group_id = p.group_id)))
  WHERE ((p.id = project_milestones.project_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

-- [neutralize] projects.Admin manage projects ALL
DROP POLICY IF EXISTS $pn$Admin manage projects$pn$ ON public.projects;
CREATE POLICY $pn$Admin manage projects$pn$ ON public.projects
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = projects.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

-- [neutralize] relief_claims.Admins can manage claims ALL
DROP POLICY IF EXISTS $pn$Admins can manage claims$pn$ ON public.relief_claims;
CREATE POLICY $pn$Admins can manage claims$pn$ ON public.relief_claims
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (relief_plans
     JOIN memberships ON ((memberships.group_id = relief_plans.group_id)))
  WHERE ((relief_plans.id = relief_claims.plan_id) AND (memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

-- [neutralize] relief_claims.Members can submit claims INSERT
DROP POLICY IF EXISTS $pn$Members can submit claims$pn$ ON public.relief_claims;
CREATE POLICY $pn$Members can submit claims$pn$ ON public.relief_claims
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.id = relief_claims.membership_id) AND (memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text)))));

-- [neutralize] relief_claims.relief_claims_delete DELETE
DROP POLICY IF EXISTS $pn$relief_claims_delete$pn$ ON public.relief_claims;
CREATE POLICY $pn$relief_claims_delete$pn$ ON public.relief_claims
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (relief_plans rp
     JOIN memberships m ON (((m.group_id = rp.group_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))
  WHERE (rp.id = relief_claims.plan_id))));

-- [neutralize] relief_claims.relief_claims_insert INSERT
DROP POLICY IF EXISTS $pn$relief_claims_insert$pn$ ON public.relief_claims;
CREATE POLICY $pn$relief_claims_insert$pn$ ON public.relief_claims
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.id = relief_claims.membership_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text)))));

-- [neutralize] relief_claims.relief_claims_update UPDATE
DROP POLICY IF EXISTS $pn$relief_claims_update$pn$ ON public.relief_claims;
CREATE POLICY $pn$relief_claims_update$pn$ ON public.relief_claims
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (relief_plans rp
     JOIN memberships m ON (((m.group_id = rp.group_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))
  WHERE (rp.id = relief_claims.plan_id))));

-- [neutralize] relief_enrollments.Admins can manage enrollments ALL
DROP POLICY IF EXISTS $pn$Admins can manage enrollments$pn$ ON public.relief_enrollments;
CREATE POLICY $pn$Admins can manage enrollments$pn$ ON public.relief_enrollments
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (relief_plans
     JOIN memberships ON ((memberships.group_id = relief_plans.group_id)))
  WHERE ((relief_plans.id = relief_enrollments.plan_id) AND (memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

-- [neutralize] relief_enrollments.relief_enrollments_delete DELETE
DROP POLICY IF EXISTS $pn$relief_enrollments_delete$pn$ ON public.relief_enrollments;
CREATE POLICY $pn$relief_enrollments_delete$pn$ ON public.relief_enrollments
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (relief_plans rp
     JOIN memberships m ON (((m.group_id = rp.group_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))
  WHERE (rp.id = relief_enrollments.plan_id))));

-- [neutralize] relief_enrollments.relief_enrollments_insert INSERT
DROP POLICY IF EXISTS $pn$relief_enrollments_insert$pn$ ON public.relief_enrollments;
CREATE POLICY $pn$relief_enrollments_insert$pn$ ON public.relief_enrollments
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (relief_plans rp
     JOIN memberships m ON (((m.group_id = rp.group_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))
  WHERE (rp.id = relief_enrollments.plan_id))));

-- [neutralize] relief_enrollments.relief_enrollments_update UPDATE
DROP POLICY IF EXISTS $pn$relief_enrollments_update$pn$ ON public.relief_enrollments;
CREATE POLICY $pn$relief_enrollments_update$pn$ ON public.relief_enrollments
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (relief_plans rp
     JOIN memberships m ON (((m.group_id = rp.group_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))
  WHERE (rp.id = relief_enrollments.plan_id))));

-- [neutralize] relief_payouts.Admins can manage payouts ALL
DROP POLICY IF EXISTS $pn$Admins can manage payouts$pn$ ON public.relief_payouts;
CREATE POLICY $pn$Admins can manage payouts$pn$ ON public.relief_payouts
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM ((relief_claims
     JOIN relief_plans ON ((relief_plans.id = relief_claims.plan_id)))
     JOIN memberships ON ((memberships.group_id = relief_plans.group_id)))
  WHERE ((relief_claims.id = relief_payouts.claim_id) AND (memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

-- [neutralize] relief_payouts.relief_payouts_delete DELETE
DROP POLICY IF EXISTS $pn$relief_payouts_delete$pn$ ON public.relief_payouts;
CREATE POLICY $pn$relief_payouts_delete$pn$ ON public.relief_payouts
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM ((relief_claims rc
     JOIN relief_plans rp ON ((rp.id = rc.plan_id)))
     JOIN memberships m ON (((m.group_id = rp.group_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))
  WHERE (rc.id = relief_payouts.claim_id))));

-- [neutralize] relief_payouts.relief_payouts_insert INSERT
DROP POLICY IF EXISTS $pn$relief_payouts_insert$pn$ ON public.relief_payouts;
CREATE POLICY $pn$relief_payouts_insert$pn$ ON public.relief_payouts
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM ((relief_claims rc
     JOIN relief_plans rp ON ((rp.id = rc.plan_id)))
     JOIN memberships m ON (((m.group_id = rp.group_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))
  WHERE (rc.id = relief_payouts.claim_id))));

-- [neutralize] relief_payouts.relief_payouts_update UPDATE
DROP POLICY IF EXISTS $pn$relief_payouts_update$pn$ ON public.relief_payouts;
CREATE POLICY $pn$relief_payouts_update$pn$ ON public.relief_payouts
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM ((relief_claims rc
     JOIN relief_plans rp ON ((rp.id = rc.plan_id)))
     JOIN memberships m ON (((m.group_id = rp.group_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))
  WHERE (rc.id = relief_payouts.claim_id))));

-- [neutralize] relief_plans.Group admins can manage relief plans ALL
DROP POLICY IF EXISTS $pn$Group admins can manage relief plans$pn$ ON public.relief_plans;
CREATE POLICY $pn$Group admins can manage relief plans$pn$ ON public.relief_plans
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = relief_plans.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

-- [neutralize] relief_remittances.relief_remittances_insert INSERT
DROP POLICY IF EXISTS $pn$relief_remittances_insert$pn$ ON public.relief_remittances;
CREATE POLICY $pn$relief_remittances_insert$pn$ ON public.relief_remittances
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.membership_status = 'active'::text) AND (m.group_id = relief_remittances.branch_group_id) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role]))))));

-- [neutralize] relief_remittances.relief_remittances_update UPDATE
DROP POLICY IF EXISTS $pn$relief_remittances_update$pn$ ON public.relief_remittances;
CREATE POLICY $pn$relief_remittances_update$pn$ ON public.relief_remittances
  FOR UPDATE
  TO public
  USING (((EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.membership_status = 'active'::text) AND (m.group_id = relief_remittances.branch_group_id) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role]))))) OR (EXISTS ( SELECT 1
   FROM ((memberships m
     JOIN groups g_hq ON (((g_hq.id = m.group_id) AND (g_hq.group_level = 'hq'::text))))
     JOIN groups g_branch ON (((g_branch.organization_id = g_hq.organization_id) AND (g_branch.organization_id IS NOT NULL))))
  WHERE ((m.user_id = auth.uid()) AND (m.membership_status = 'active'::text) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])) AND (g_branch.id = relief_remittances.branch_group_id))))));

-- [neutralize] savings_contributions.Admins can manage contributions ALL
DROP POLICY IF EXISTS $pn$Admins can manage contributions$pn$ ON public.savings_contributions;
CREATE POLICY $pn$Admins can manage contributions$pn$ ON public.savings_contributions
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (savings_cycles sc
     JOIN memberships m ON ((m.group_id = sc.group_id)))
  WHERE ((sc.id = savings_contributions.cycle_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role, 'moderator'::membership_role]))))));

-- [neutralize] savings_cycles.Admins can manage savings cycles ALL
DROP POLICY IF EXISTS $pn$Admins can manage savings cycles$pn$ ON public.savings_cycles;
CREATE POLICY $pn$Admins can manage savings cycles$pn$ ON public.savings_cycles
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = savings_cycles.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text) AND (memberships.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role, 'moderator'::membership_role]))))));

-- [neutralize] savings_participants.Admins can manage participants ALL
DROP POLICY IF EXISTS $pn$Admins can manage participants$pn$ ON public.savings_participants;
CREATE POLICY $pn$Admins can manage participants$pn$ ON public.savings_participants
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (savings_cycles sc
     JOIN memberships m ON ((m.group_id = sc.group_id)))
  WHERE ((sc.id = savings_participants.cycle_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role, 'moderator'::membership_role]))))));

-- [neutralize] group_payment_config.Admins can delete payment config DELETE
DROP POLICY IF EXISTS $pn$Admins can delete payment config$pn$ ON public.group_payment_config;
CREATE POLICY $pn$Admins can delete payment config$pn$ ON public.group_payment_config
  FOR DELETE
  TO public
  USING ((group_id IN ( SELECT memberships.group_id
   FROM memberships
  WHERE ((memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text) AND (memberships.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role]))))));

-- [neutralize] group_payment_config.Admins can insert payment config INSERT
DROP POLICY IF EXISTS $pn$Admins can insert payment config$pn$ ON public.group_payment_config;
CREATE POLICY $pn$Admins can insert payment config$pn$ ON public.group_payment_config
  FOR INSERT
  TO public
  WITH CHECK ((group_id IN ( SELECT memberships.group_id
   FROM memberships
  WHERE ((memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text) AND (memberships.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role]))))));

-- [neutralize] group_payment_config.Admins can update payment config UPDATE
DROP POLICY IF EXISTS $pn$Admins can update payment config$pn$ ON public.group_payment_config;
CREATE POLICY $pn$Admins can update payment config$pn$ ON public.group_payment_config
  FOR UPDATE
  TO public
  USING ((group_id IN ( SELECT memberships.group_id
   FROM memberships
  WHERE ((memberships.user_id = auth.uid()) AND (memberships.membership_status = 'active'::text) AND (memberships.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role]))))));


-- ---------------------------------------------------------------------------
-- Postconditions
-- ---------------------------------------------------------------------------
DO $cut1_post$
DECLARE
  v_src text;
  v_md5 text;
  v_mismatch int;
  v_ok boolean;
BEGIN
  IF to_regprocedure('public.is_active_group_member(uuid)') IS NULL THEN
    RAISE EXCEPTION 'CUT1_ABORT_POST: is_active_group_member missing';
  END IF;
  IF to_regprocedure('public.get_my_active_group_ids()') IS NULL THEN
    RAISE EXCEPTION 'CUT1_ABORT_POST: get_my_active_group_ids missing';
  END IF;
  IF to_regprocedure('public.enforce_position_assignment_same_group()') IS NULL THEN
    RAISE EXCEPTION 'CUT1_ABORT_POST: enforce_position_assignment_same_group missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'position_assignments'
      AND t.tgname = 'trg_position_assignments_same_group'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'CUT1_ABORT_POST: trg_position_assignments_same_group missing';
  END IF;

  SELECT p.prosrc INTO v_src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'is_group_member'
    AND pg_get_function_identity_arguments(p.oid) = 'gid uuid, uid uuid';
  IF md5(v_src) IS DISTINCT FROM 'b91a35aadb657fa2cd2c99e9313ca0f1' THEN
    RAISE EXCEPTION 'CUT1_ABORT_POST: is_group_member body changed';
  END IF;

  SELECT p.prosrc INTO v_src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_user_group_ids'
    AND pg_get_function_identity_arguments(p.oid) = 'uid uuid';
  IF md5(v_src) IS DISTINCT FROM 'a9865ade7502badcd2b92a74429ac1d9' THEN
    RAISE EXCEPTION 'CUT1_ABORT_POST: get_user_group_ids body changed';
  END IF;

  -- New / replaced helpers must mention active (except visibility helpers already checked).
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_active_group_member'
      AND p.prosrc ~ 'membership_status'
  ) THEN
    RAISE EXCEPTION 'CUT1_ABORT_POST: is_active_group_member missing status predicate';
  END IF;

  -- Grants: authenticated yes; anon / PUBLIC no on new helpers.
  SELECT
    has_function_privilege('authenticated', 'public.is_active_group_member(uuid)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.get_my_active_group_ids()', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.is_active_group_member(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.get_my_active_group_ids()', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.has_group_permission(uuid, text, uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.create_proxy_member(uuid, text, text, text)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.has_group_permission(uuid, text, uuid)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.create_proxy_member(uuid, text, text, text)', 'EXECUTE')
    INTO v_ok;
  IF NOT COALESCE(v_ok, false) THEN
    RAISE EXCEPTION 'CUT1_ABORT_POST: grant mismatch on Cut 1 helpers';
  END IF;

  -- No arbitrary-subject active helper granted to authenticated/anon.
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) e ON true
    JOIN pg_roles r ON r.oid = e.grantee
    WHERE n.nspname = 'public'
      AND p.proname IN ('is_active_group_member', 'get_my_active_group_ids',
                        'get_user_active_group_ids', 'is_active_member_of')
      AND pg_get_function_identity_arguments(p.oid) ~* 'uid'
      AND r.rolname IN ('authenticated', 'anon', 'PUBLIC')
  ) THEN
    RAISE EXCEPTION 'CUT1_ABORT_POST: arbitrary-subject active helper granted to authenticated/anon';
  END IF;

  SELECT count(*) INTO v_mismatch
  FROM public.position_assignments pa
  JOIN public.memberships m ON m.id = pa.membership_id
  JOIN public.group_positions gp ON gp.id = pa.position_id
  WHERE m.group_id IS DISTINCT FROM gp.group_id;
  IF v_mismatch <> 0 THEN
    RAISE EXCEPTION 'CUT1_ABORT_POST: position_assignments mismatch_count=% (expected 0)', v_mismatch;
  END IF;
END;
$cut1_post$;

DROP FUNCTION public.cut1_expect_helper(text, text, text);
DROP FUNCTION public.cut1_expect_policy(text, text, text, text, text);
DROP FUNCTION public.cut1_norm(text);

COMMIT;

