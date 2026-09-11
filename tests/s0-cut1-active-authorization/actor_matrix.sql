-- Cut 1 actor matrix against the disposable fixture + 00114 migration.
-- Expect: script completes without exception. Failures RAISE.

CREATE OR REPLACE FUNCTION public.cut1_set_actor(p_uid uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
END;
$$;

CREATE OR REPLACE FUNCTION public.cut1_assert(p_ok boolean, p_msg text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT COALESCE(p_ok, false) THEN
    RAISE EXCEPTION 'CUT1_TEST_FAIL: %', p_msg;
  END IF;
END;
$$;

DO $matrix$
DECLARE
  g1 uuid := '00000000-0000-0000-0000-000000000001';
  g2 uuid := '00000000-0000-0000-0000-000000000002';
  u_owner uuid := '00000000-0000-0000-0000-000000000011';
  u_admin uuid := '00000000-0000-0000-0000-000000000012';
  u_mod uuid := '00000000-0000-0000-0000-000000000013';
  u_member uuid := '00000000-0000-0000-0000-000000000014';
  u_pending uuid := '00000000-0000-0000-0000-000000000015';
  u_suspended uuid := '00000000-0000-0000-0000-000000000016';
  u_exited uuid := '00000000-0000-0000-0000-000000000017';
  u_archived uuid := '00000000-0000-0000-0000-000000000018';
  u_other uuid := '00000000-0000-0000-0000-000000000019';
  m_owner uuid := '00000000-0000-0000-0000-000000000021';
  m_admin uuid := '00000000-0000-0000-0000-000000000022';
  m_mod uuid := '00000000-0000-0000-0000-000000000023';
  m_member uuid := '00000000-0000-0000-0000-000000000024';
  m_pending uuid := '00000000-0000-0000-0000-000000000025';
  m_suspended uuid := '00000000-0000-0000-0000-000000000026';
  pos1 uuid := '00000000-0000-0000-0000-000000000031';
  pos2 uuid := '00000000-0000-0000-0000-000000000032';
  v_proxy uuid;
  v_caught boolean;
  v_rows int;
  v_pred text;
  u_foreign uuid := '00000000-0000-0000-0000-00000000001a';
  feed_g1 uuid := '00000000-0000-0000-0000-000000000041';
  feed_g2 uuid := '00000000-0000-0000-0000-000000000042';
  r_member uuid := '00000000-0000-0000-0000-000000000051';
  r_pending uuid := '00000000-0000-0000-0000-000000000052';
  r_suspended uuid := '00000000-0000-0000-0000-000000000053';
  r_exited uuid := '00000000-0000-0000-0000-000000000054';
  r_archived uuid := '00000000-0000-0000-0000-000000000055';
  r_other uuid := '00000000-0000-0000-0000-000000000056';
  roster_g1 uuid := '00000000-0000-0000-0000-000000000061';
  roster_g2 uuid := '00000000-0000-0000-0000-000000000062';
  ha_g1 uuid := '00000000-0000-0000-0000-000000000071';
  ha_g2 uuid := '00000000-0000-0000-0000-000000000072';
BEGIN
  INSERT INTO public.groups (id) VALUES (g1), (g2)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.memberships (id, user_id, group_id, role, membership_status)
  VALUES
    (m_owner, u_owner, g1, 'owner', 'active'),
    (m_admin, u_admin, g1, 'admin', 'active'),
    (m_mod, u_mod, g1, 'moderator', 'active'),
    (m_member, u_member, g1, 'member', 'active'),
    (m_pending, u_pending, g1, 'owner', 'pending_approval'),
    (m_suspended, u_suspended, g1, 'admin', 'suspended'),
    ('00000000-0000-0000-0000-000000000027', u_exited, g1, 'moderator', 'exited'),
    ('00000000-0000-0000-0000-000000000028', u_archived, g1, 'admin', 'archived'),
    ('00000000-0000-0000-0000-000000000029', u_other, g2, 'owner', 'active')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.group_positions (id, group_id) VALUES (pos1, g1), (pos2, g2)
  ON CONFLICT (id) DO NOTHING;

  -- Active owner / admin / moderator ALLOW proxy
  PERFORM public.cut1_set_actor(u_owner);
  v_proxy := public.create_proxy_member(g1, 'Proxy Owner');
  PERFORM public.cut1_assert(v_proxy IS NOT NULL, 'active owner create_proxy_member');

  PERFORM public.cut1_set_actor(u_admin);
  v_proxy := public.create_proxy_member(g1, 'Proxy Admin');
  PERFORM public.cut1_assert(v_proxy IS NOT NULL, 'active admin create_proxy_member');

  PERFORM public.cut1_set_actor(u_mod);
  v_proxy := public.create_proxy_member(g1, 'Proxy Mod');
  PERFORM public.cut1_assert(v_proxy IS NOT NULL, 'active moderator create_proxy_member');

  -- pending / suspended / exited / archived DENY
  FOREACH v_proxy IN ARRAY ARRAY[u_pending, u_suspended, u_exited, u_archived, u_member]
  LOOP
    PERFORM public.cut1_set_actor(v_proxy);
    v_caught := false;
    BEGIN
      PERFORM public.create_proxy_member(g1, 'should fail');
    EXCEPTION WHEN OTHERS THEN
      v_caught := true;
    END;
    PERFORM public.cut1_assert(v_caught, 'inactive/member create_proxy_member must DENY');
  END LOOP;

  -- helpers: active vs inactive
  PERFORM public.cut1_set_actor(u_owner);
  PERFORM public.cut1_assert(public.is_active_group_member(g1), 'active owner is_active');
  PERFORM public.cut1_assert(public.is_group_admin(g1), 'active owner is_group_admin');
  PERFORM public.cut1_assert(g1 IN (SELECT public.get_my_active_group_ids()), 'active ids include g1');

  PERFORM public.cut1_set_actor(u_pending);
  PERFORM public.cut1_assert(NOT public.is_active_group_member(g1), 'pending not active member');
  PERFORM public.cut1_assert(NOT public.is_group_admin(g1), 'pending owner is_group_admin DENY');
  PERFORM public.cut1_assert(public.is_group_member(g1), 'pending still is_group_member (unchanged visibility)');

  PERFORM public.cut1_set_actor(u_suspended);
  PERFORM public.cut1_assert(NOT public.is_group_admin(g1), 'suspended admin DENY');
  PERFORM public.cut1_assert(NOT public.has_group_permission(g1, 'finances.record'), 'suspended admin perm DENY');

  -- arbitrary uid probe DENY
  PERFORM public.cut1_set_actor(u_member);
  PERFORM public.cut1_assert(
    NOT public.has_group_permission(g1, 'finances.record', u_owner),
    'member cannot probe owner uid'
  );
  PERFORM public.cut1_assert(
    NOT public.is_group_admin(g1, u_owner),
    'member cannot probe is_group_admin(uid)'
  );

  -- has_group_permission live fallback
  -- active admin, no open assignment → full bypass
  PERFORM public.cut1_set_actor(u_admin);
  PERFORM public.cut1_assert(
    public.has_group_permission(g1, 'does.not.exist'),
    'active admin zero assignments full bypass'
  );
  -- owner always true if active
  PERFORM public.cut1_set_actor(u_owner);
  PERFORM public.cut1_assert(public.has_group_permission(g1, 'anything'), 'active owner always true');

  -- admin with open assignment lacking perm_key → DENY
  INSERT INTO public.position_assignments (membership_id, position_id)
  VALUES (m_admin, pos1);
  PERFORM public.cut1_set_actor(u_admin);
  PERFORM public.cut1_assert(
    NOT public.has_group_permission(g1, 'does.not.exist'),
    'admin with open assignment lacking perm DENY'
  );
  INSERT INTO public.position_permissions (position_id, permission)
  VALUES (pos1, 'finances.record');
  PERFORM public.cut1_assert(
    public.has_group_permission(g1, 'finances.record'),
    'admin with matching perm ALLOW'
  );
  -- closed assignment counts toward open=0
  UPDATE public.position_assignments SET ended_at = now()
  WHERE membership_id = m_admin AND position_id = pos1;
  PERFORM public.cut1_assert(
    public.has_group_permission(g1, 'does.not.exist'),
    'closed assignment restores admin bypass'
  );

  -- cross-group position REJECT
  v_caught := false;
  BEGIN
    INSERT INTO public.position_assignments (membership_id, position_id)
    VALUES (m_owner, pos2);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  PERFORM public.cut1_assert(v_caught, 'cross-group position assignment REJECT');

  -- payments: active officer ALLOW / inactive DENY
  PERFORM public.cut1_set_actor(u_admin);
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', u_admin::text, true);
  INSERT INTO public.payments (group_id, status, recorded_by, membership_id)
  VALUES (g1, 'recorded', u_admin, m_member);
  RESET ROLE;
  PERFORM public.cut1_set_actor(u_admin);

  PERFORM public.cut1_set_actor(u_suspended);
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', u_suspended::text, true);
  v_caught := false;
  BEGIN
    INSERT INTO public.payments (group_id, status, recorded_by, membership_id)
    VALUES (g1, 'recorded', u_suspended, m_member);
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_caught := true;
  WHEN OTHERS THEN
    -- RLS deny often surfaces as 42501 or 0 rows; INSERT as table owner with FORCE RLS
    v_caught := true;
  END;
  RESET ROLE;
  PERFORM public.cut1_assert(v_caught, 'inactive officer payment INSERT DENY');

  -- rls_pay_insert: active member pending_confirmation ALLOW
  PERFORM public.cut1_set_actor(u_member);
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', u_member::text, true);
  INSERT INTO public.payments (group_id, status, recorded_by, membership_id)
  VALUES (g1, 'pending_confirmation', u_member, m_member);
  RESET ROLE;

  -- Post-apply predicate: the three P1-B OR-bypass policies carry an active gate.
  SELECT qual INTO v_pred FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'feed_reactions' AND policyname = 'rls_fr_delete';
  PERFORM public.cut1_assert(
    v_pred ~ 'membership_status' AND v_pred ~ 'active' AND v_pred ~ 'auth.uid',
    'rls_fr_delete predicate has active ownership gate'
  );
  SELECT qual INTO v_pred FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'feed_reactions' AND policyname = 'rls_fr_update';
  PERFORM public.cut1_assert(
    v_pred ~ 'membership_status' AND v_pred ~ 'active' AND v_pred ~ 'auth.uid',
    'rls_fr_update predicate has active ownership gate'
  );
  SELECT with_check INTO v_pred FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'hosting_swap_requests'
     AND policyname = 'Members can create swap requests';
  PERFORM public.cut1_assert(
    v_pred ~ 'requested_by' AND v_pred ~ 'auth.uid'
      AND v_pred ~ 'is_active_group_member' AND v_pred ~ 'from_assignment_id',
    'Members can create swap requests has requested_by + active group gate'
  );

  -- Seed feed + hosting rows as table owner (bypasses RLS).
  INSERT INTO public.activity_feed (id, group_id) VALUES (feed_g1, g1), (feed_g2, g2)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.feed_reactions (id, feed_item_id, membership_id) VALUES
    (r_member, feed_g1, m_member),
    (r_pending, feed_g1, m_pending),
    (r_suspended, feed_g1, m_suspended),
    (r_exited, feed_g1, '00000000-0000-0000-0000-000000000027'),
    (r_archived, feed_g1, '00000000-0000-0000-0000-000000000028'),
    (r_other, feed_g2, '00000000-0000-0000-0000-000000000029')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.hosting_rosters (id, group_id) VALUES (roster_g1, g1), (roster_g2, g2)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.hosting_assignments (id, roster_id) VALUES (ha_g1, roster_g1), (ha_g2, roster_g2)
  ON CONFLICT (id) DO NOTHING;

  -- feed_reactions UPDATE/DELETE: active owner ALLOW
  PERFORM public.cut1_set_actor(u_member);
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', u_member::text, true);
  UPDATE public.feed_reactions SET feed_item_id = feed_item_id WHERE id = r_member;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RESET ROLE;
  PERFORM public.cut1_assert(v_rows = 1, 'active member UPDATE own reaction ALLOW');

  PERFORM public.cut1_set_actor(u_member);
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', u_member::text, true);
  DELETE FROM public.feed_reactions WHERE id = r_member;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RESET ROLE;
  PERFORM public.cut1_assert(v_rows = 1, 'active member DELETE own reaction ALLOW');
  INSERT INTO public.feed_reactions (id, feed_item_id, membership_id)
  VALUES (r_member, feed_g1, m_member);

  -- pending / suspended / exited / archived own-row DENY
  FOREACH v_proxy IN ARRAY ARRAY[u_pending, u_suspended, u_exited, u_archived]
  LOOP
    PERFORM public.cut1_set_actor(v_proxy);
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', v_proxy::text, true);
    UPDATE public.feed_reactions SET feed_item_id = feed_item_id
     WHERE membership_id IN (
       SELECT id FROM public.memberships WHERE user_id = v_proxy
     );
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RESET ROLE;
    PERFORM public.cut1_assert(v_rows = 0, 'inactive UPDATE own reaction DENY');

    PERFORM public.cut1_set_actor(v_proxy);
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', v_proxy::text, true);
    DELETE FROM public.feed_reactions
     WHERE membership_id IN (
       SELECT id FROM public.memberships WHERE user_id = v_proxy
     );
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RESET ROLE;
    PERFORM public.cut1_assert(v_rows = 0, 'inactive DELETE own reaction DENY');
  END LOOP;

  -- foreign (no membership) DENY
  PERFORM public.cut1_set_actor(u_foreign);
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', u_foreign::text, true);
  UPDATE public.feed_reactions SET feed_item_id = feed_item_id WHERE id = r_member;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RESET ROLE;
  PERFORM public.cut1_assert(v_rows = 0, 'foreign UPDATE reaction DENY');

  PERFORM public.cut1_set_actor(u_foreign);
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', u_foreign::text, true);
  DELETE FROM public.feed_reactions WHERE id = r_member;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RESET ROLE;
  PERFORM public.cut1_assert(v_rows = 0, 'foreign DELETE reaction DENY');

  -- cross-group (active in g2 only) DENY on g1 reaction
  PERFORM public.cut1_set_actor(u_other);
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', u_other::text, true);
  UPDATE public.feed_reactions SET feed_item_id = feed_item_id WHERE id = r_member;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RESET ROLE;
  PERFORM public.cut1_assert(v_rows = 0, 'cross-group UPDATE reaction DENY');

  PERFORM public.cut1_set_actor(u_other);
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', u_other::text, true);
  DELETE FROM public.feed_reactions WHERE id = r_member;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RESET ROLE;
  PERFORM public.cut1_assert(v_rows = 0, 'cross-group DELETE reaction DENY');

  -- hosting_swap_requests INSERT: active member requested_by=self ALLOW
  PERFORM public.cut1_set_actor(u_member);
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', u_member::text, true);
  INSERT INTO public.hosting_swap_requests (requested_by, from_assignment_id)
  VALUES (u_member, ha_g1);
  RESET ROLE;

  -- pending / suspended / exited / archived DENY
  FOREACH v_proxy IN ARRAY ARRAY[u_pending, u_suspended, u_exited, u_archived]
  LOOP
    PERFORM public.cut1_set_actor(v_proxy);
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', v_proxy::text, true);
    v_caught := false;
    BEGIN
      INSERT INTO public.hosting_swap_requests (requested_by, from_assignment_id)
      VALUES (v_proxy, ha_g1);
    EXCEPTION WHEN OTHERS THEN
      v_caught := true;
    END;
    RESET ROLE;
    PERFORM public.cut1_assert(v_caught, 'inactive swap INSERT DENY');
  END LOOP;

  -- foreign DENY
  PERFORM public.cut1_set_actor(u_foreign);
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', u_foreign::text, true);
  v_caught := false;
  BEGIN
    INSERT INTO public.hosting_swap_requests (requested_by, from_assignment_id)
    VALUES (u_foreign, ha_g1);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  RESET ROLE;
  PERFORM public.cut1_assert(v_caught, 'foreign swap INSERT DENY');

  -- cross-group: g2 actor on g1 assignment DENY; g1 actor on g2 assignment DENY
  PERFORM public.cut1_set_actor(u_other);
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', u_other::text, true);
  v_caught := false;
  BEGIN
    INSERT INTO public.hosting_swap_requests (requested_by, from_assignment_id)
    VALUES (u_other, ha_g1);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  RESET ROLE;
  PERFORM public.cut1_assert(v_caught, 'cross-group swap INSERT (g2 on g1) DENY');

  PERFORM public.cut1_set_actor(u_member);
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', u_member::text, true);
  v_caught := false;
  BEGIN
    INSERT INTO public.hosting_swap_requests (requested_by, from_assignment_id)
    VALUES (u_member, ha_g2);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  RESET ROLE;
  PERFORM public.cut1_assert(v_caught, 'cross-group swap INSERT (g1 on g2) DENY');

  -- requested_by != auth.uid() DENY
  PERFORM public.cut1_set_actor(u_member);
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', u_member::text, true);
  v_caught := false;
  BEGIN
    INSERT INTO public.hosting_swap_requests (requested_by, from_assignment_id)
    VALUES (u_owner, ha_g1);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  RESET ROLE;
  PERFORM public.cut1_assert(v_caught, 'swap requested_by!=auth.uid DENY');

  RAISE NOTICE 'CUT1_ACTOR_MATRIX_PASS';
END;
$matrix$;
