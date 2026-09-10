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

  RAISE NOTICE 'CUT1_ACTOR_MATRIX_PASS';
END;
$matrix$;
