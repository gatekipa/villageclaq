-- 00196: standing override expiry is evaluated at the point of use. Stored
-- calculated standing remains a cache/display column; consequential election
-- eligibility uses calculated standing plus the currently active override.

CREATE OR REPLACE FUNCTION public.effective_standing_for_authority(
  p_membership_id uuid,
  p_at timestamptz DEFAULT now()
) RETURNS public.membership_standing
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
  SELECT coalesce(public.active_standing_override(m.id,p_at),m.calculated_standing)
  FROM public.memberships m
  WHERE m.id=p_membership_id;
$function$;
ALTER FUNCTION public.effective_standing_for_authority(uuid,timestamptz) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.effective_standing_for_authority(uuid,timestamptz)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.effective_standing_for_authority(uuid,timestamptz)
  TO service_role;

CREATE OR REPLACE FUNCTION public.effective_member_standing(
  p_membership_id uuid,
  p_at timestamptz DEFAULT now()
) RETURNS public.membership_standing
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
  SELECT public.effective_standing_for_authority(m.id,p_at)
  FROM public.memberships m
  WHERE m.id=p_membership_id
    AND (m.user_id=auth.uid() OR public.has_group_permission(m.group_id,'members.manage'));
$function$;
REVOKE ALL ON FUNCTION public.effective_member_standing(uuid,timestamptz)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.effective_member_standing(uuid,timestamptz)
  TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.guard_election_frozen()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_election public.elections%ROWTYPE;
BEGIN
  IF tg_table_name='elections' THEN
    IF tg_op='DELETE' THEN
      RAISE EXCEPTION 'ELECTION_HISTORY_IMMUTABLE';
    END IF;
    IF old.status<>'draft' AND (
       new.title IS DISTINCT FROM old.title OR
       new.title_fr IS DISTINCT FROM old.title_fr OR
       new.description IS DISTINCT FROM old.description OR
       new.description_fr IS DISTINCT FROM old.description_fr OR
       new.election_type IS DISTINCT FROM old.election_type OR
       new.starts_at IS DISTINCT FROM old.starts_at OR
       new.ends_at IS DISTINCT FROM old.ends_at OR
       new.eligibility_rule_version IS DISTINCT FROM old.eligibility_rule_version OR
       new.scope_unit_id IS DISTINCT FROM old.scope_unit_id OR
       new.scope_mode IS DISTINCT FROM old.scope_mode) THEN
      RAISE EXCEPTION 'ELECTION_FROZEN';
    END IF;
    IF old.status IN ('closed','cancelled') AND new.status IS DISTINCT FROM old.status THEN
      RAISE EXCEPTION 'ELECTION_SEALED_REOPEN_PROHIBITED';
    END IF;
    RETURN new;
  END IF;
  SELECT e.* INTO v_election FROM public.elections e
    WHERE e.id=CASE WHEN tg_op='DELETE' THEN old.election_id ELSE new.election_id END;
  IF v_election.status<>'draft' OR v_election.frozen_at IS NOT NULL THEN
    RAISE EXCEPTION 'ELECTION_CHOICES_FROZEN';
  END IF;
  IF tg_op='DELETE' THEN RETURN old; END IF;
  IF tg_table_name='election_candidates' THEN
    IF NOT EXISTS (SELECT 1 FROM public.memberships m
      JOIN public.groups g ON g.id=m.group_id
      JOIN public.organization_units u ON u.group_id=g.id
      JOIN public.organization_units scope ON scope.id=v_election.scope_unit_id
      WHERE m.id=new.membership_id AND m.membership_status='active'
        AND public.effective_standing_for_authority(m.id,now())='good' AND u.organization_id=scope.organization_id
        AND (v_election.scope_mode='organization'
          OR (v_election.scope_mode='unit' AND u.id=scope.id)
          OR (v_election.scope_mode='subtree' AND EXISTS (
            SELECT 1 FROM public.organization_unit_closure c
            WHERE c.ancestor_id=scope.id AND c.descendant_id=u.id)))
        AND (new.position_id IS NULL OR EXISTS (
          SELECT 1 FROM public.group_positions p
          WHERE p.id=new.position_id AND p.group_id=m.group_id))) THEN
      RAISE EXCEPTION 'CANDIDATE_SCOPE_OR_STATUS';
    END IF;
  END IF;
  RETURN new;
END
$$;

CREATE OR REPLACE FUNCTION public.open_election_v2(
  p_election uuid,p_scope_unit uuid,p_scope_mode text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_e public.elections%ROWTYPE; v_scope public.organization_units%ROWTYPE;
  v_org uuid; v_version bigint; v_count int; v_ambiguous int;
BEGIN
  SELECT * INTO v_e FROM public.elections WHERE id=p_election FOR UPDATE;
  IF v_e.id IS NULL THEN RAISE EXCEPTION 'ELECTION_NOT_FOUND'; END IF;
  IF NOT public.has_group_permission(v_e.group_id,'elections.manage')
    THEN RAISE EXCEPTION 'DENY' USING ERRCODE='42501'; END IF;
  IF v_e.status<>'draft' OR v_e.frozen_at IS NOT NULL
    THEN RAISE EXCEPTION 'ELECTION_ALREADY_FROZEN'; END IF;
  SELECT * INTO v_scope FROM public.organization_units WHERE id=p_scope_unit;
  SELECT organization_id INTO v_org FROM public.groups WHERE id=v_e.group_id;
  IF v_scope.id IS NULL OR v_scope.organization_id<>v_org
    OR p_scope_mode NOT IN ('unit','subtree','organization')
    OR (p_scope_mode='unit' AND v_scope.group_id IS DISTINCT FROM v_e.group_id)
    OR (p_scope_mode<>'unit' AND NOT public.has_organization_scope(
       p_scope_unit,p_scope_unit,'elections.manage'))
    THEN RAISE EXCEPTION 'ELECTION_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
  IF v_e.ends_at<=v_e.starts_at OR v_e.ends_at<=now()
    THEN RAISE EXCEPTION 'INVALID_VOTING_WINDOW'; END IF;
  IF (v_e.election_type='officer_election' AND NOT EXISTS (
       SELECT 1 FROM public.election_candidates WHERE election_id=p_election))
     OR (v_e.election_type<>'officer_election' AND NOT EXISTS (
       SELECT 1 FROM public.election_options WHERE election_id=p_election))
    THEN RAISE EXCEPTION 'ELECTION_CHOICES_REQUIRED'; END IF;
  -- Draft scope can change after choices are added. Validate every candidate
  -- against the final constituency before freezing it.
  IF v_e.election_type='officer_election' AND EXISTS (
    SELECT 1 FROM public.election_candidates c WHERE c.election_id=p_election
      AND NOT EXISTS (
        SELECT 1 FROM public.memberships m
        JOIN public.groups g ON g.id=m.group_id
        JOIN public.organization_units u ON u.group_id=g.id
        WHERE m.id=c.membership_id AND m.membership_status='active'
          AND public.effective_standing_for_authority(m.id,now())='good' AND u.organization_id=v_org
          AND (p_scope_mode='organization'
            OR (p_scope_mode='unit' AND u.id=p_scope_unit)
            OR (p_scope_mode='subtree' AND EXISTS (
              SELECT 1 FROM public.organization_unit_closure cl
              WHERE cl.ancestor_id=p_scope_unit AND cl.descendant_id=u.id)))
          AND (c.position_id IS NULL OR EXISTS (
            SELECT 1 FROM public.group_positions pos
            WHERE pos.id=c.position_id AND pos.group_id=m.group_id))))
    THEN RAISE EXCEPTION 'CANDIDATE_SCOPE_OR_STATUS'; END IF;
  -- Broad scopes require a positively verified identity for every eligible
  -- active member. Unknown equivalence is never guessed from a name/email.
  IF p_scope_mode<>'unit' THEN
    SELECT count(*) INTO v_ambiguous FROM public.memberships m
    JOIN public.groups g ON g.id=m.group_id
    JOIN public.organization_units u ON u.group_id=g.id
    LEFT JOIN public.organization_people p
      ON p.organization_id=v_org AND p.user_id=m.user_id
    WHERE g.organization_id=v_org AND m.membership_status='active'
      AND public.effective_standing_for_authority(m.id,now())='good'
      AND (p_scope_mode='organization' OR EXISTS (
        SELECT 1 FROM public.organization_unit_closure c
        WHERE c.ancestor_id=p_scope_unit AND c.descendant_id=u.id))
      AND (p.id IS NULL OR p.identity_verified_at IS NULL);
    IF v_ambiguous>0 THEN RAISE EXCEPTION 'AMBIGUOUS_PERSON_IDENTITY'; END IF;
  END IF;
  SELECT topology_version INTO v_version FROM public.organizations
    WHERE id=v_org FOR SHARE;
  INSERT INTO public.election_electorate
    (election_id,person_id,user_id,membership_id,unit_id,constituency)
  SELECT DISTINCT ON (m.user_id) p_election,
    CASE WHEN p_scope_mode='unit' THEN NULL ELSE p.id END,
    m.user_id,m.id,u.id,u.name
  FROM public.memberships m JOIN public.groups g ON g.id=m.group_id
  JOIN public.organization_units u ON u.group_id=g.id
  LEFT JOIN public.organization_people p
    ON p.organization_id=v_org AND p.user_id=m.user_id
  WHERE g.organization_id=v_org AND m.membership_status='active'
    AND public.effective_standing_for_authority(m.id,now())='good'
    AND (p_scope_mode='organization'
      OR (p_scope_mode='unit' AND u.id=p_scope_unit)
      OR (p_scope_mode='subtree' AND EXISTS (
        SELECT 1 FROM public.organization_unit_closure c
        WHERE c.ancestor_id=p_scope_unit AND c.descendant_id=u.id)))
  ORDER BY m.user_id,m.created_at,m.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count=0 THEN RAISE EXCEPTION 'EMPTY_ELECTORATE'; END IF;
  UPDATE public.elections SET status='open',scope_unit_id=p_scope_unit,
    scope_mode=p_scope_mode,frozen_topology_version=v_version,
    frozen_eligibility_rule_version=eligibility_rule_version,frozen_at=now()
    WHERE id=p_election;
  RETURN jsonb_build_object('ok',true,'eligible_count',v_count,
    'topology_version',v_version);
END
$$;

CREATE OR REPLACE FUNCTION public.cast_ballot(
  p_election_id uuid,p_candidate_id uuid DEFAULT NULL,p_option_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_e public.elections%ROWTYPE; v_voter public.election_electorate%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_e FROM public.elections WHERE id=p_election_id FOR SHARE;
  SELECT * INTO v_voter FROM public.election_electorate
    WHERE election_id=p_election_id AND user_id=auth.uid();
  IF v_e.status<>'open' OR v_e.frozen_at IS NULL
    OR now()<v_e.starts_at OR now()>v_e.ends_at
    THEN RETURN jsonb_build_object('ok',false,'error','election_not_open'); END IF;
  IF v_voter.user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.memberships m
    JOIN public.groups g ON g.id=m.group_id
    JOIN public.organization_units scope ON scope.id=v_e.scope_unit_id
    WHERE m.user_id=auth.uid() AND m.membership_status='active'
      AND public.effective_standing_for_authority(m.id,now())='good' AND g.organization_id=scope.organization_id
      AND (v_e.scope_mode<>'unit' OR m.id=v_voter.membership_id))
    THEN RETURN jsonb_build_object('ok',false,'error','not_eligible'); END IF;
  IF ((p_candidate_id IS NOT NULL)::int+(p_option_id IS NOT NULL)::int)<>1
    OR (p_candidate_id IS NOT NULL AND
      (v_e.election_type<>'officer_election' OR NOT EXISTS (
        SELECT 1 FROM public.election_candidates c
        WHERE c.id=p_candidate_id AND c.election_id=p_election_id)))
    OR (p_option_id IS NOT NULL AND
      (v_e.election_type='officer_election' OR NOT EXISTS (
        SELECT 1 FROM public.election_options o
        WHERE o.id=p_option_id AND o.election_id=p_election_id)))
    THEN RETURN jsonb_build_object('ok',false,'error','invalid_choice'); END IF;
  INSERT INTO public.election_person_vote_claims(election_id,user_id)
    VALUES(p_election_id,auth.uid()) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','already_voted'); END IF;
  INSERT INTO public.election_vote_receipts(election_id,voter_membership_id)
    VALUES(p_election_id,v_voter.membership_id);
  INSERT INTO public.election_ballots(election_id,candidate_id,option_id)
    VALUES(p_election_id,p_candidate_id,p_option_id);
  RETURN jsonb_build_object('ok',true);
END
$$;
REVOKE ALL ON FUNCTION public.open_election_v2(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.open_election_v2(uuid,uuid,text) TO authenticated;

REVOKE ALL ON FUNCTION public.cast_ballot(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cast_ballot(uuid,uuid,uuid) TO authenticated;
