-- Canonical M9 / E-001–E-011. The receipt and choice stores remain separate.
-- A frozen person-level electorate, rather than current descendant membership,
-- governs every vote. Only an explicitly published aggregate is client-visible.
ALTER TABLE public.elections
  ADD COLUMN IF NOT EXISTS scope_unit_id uuid REFERENCES public.organization_units(id),
  ADD COLUMN IF NOT EXISTS scope_mode text NOT NULL DEFAULT 'unit'
    CHECK (scope_mode IN ('unit','subtree','organization')),
  ADD COLUMN IF NOT EXISTS frozen_topology_version bigint,
  ADD COLUMN IF NOT EXISTS eligibility_rule_version text NOT NULL
    DEFAULT 'E2-v1-active-good',
  ADD COLUMN IF NOT EXISTS frozen_eligibility_rule_version text,
  ADD COLUMN IF NOT EXISTS frozen_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_by uuid REFERENCES public.profiles(id);

UPDATE public.elections e SET scope_unit_id=u.id
FROM public.organization_units u WHERE u.group_id=e.group_id
  AND e.scope_unit_id IS NULL;

CREATE OR REPLACE FUNCTION public.default_election_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF new.status<>'draft' OR new.frozen_at IS NOT NULL
    OR new.published_at IS NOT NULL OR new.published_by IS NOT NULL
    THEN RAISE EXCEPTION 'ELECTION_MUST_START_DRAFT'; END IF;
  IF new.scope_unit_id IS NULL THEN
    SELECT id INTO new.scope_unit_id FROM public.organization_units
      WHERE group_id=new.group_id;
  END IF;
  IF new.scope_unit_id IS NULL THEN RAISE EXCEPTION 'ELECTION_SCOPE_MISSING'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organization_units u
    JOIN public.groups g ON g.organization_id=u.organization_id
    WHERE u.id=new.scope_unit_id AND g.id=new.group_id)
    THEN RAISE EXCEPTION 'ELECTION_SCOPE_TENANT'; END IF;
  IF new.scope_mode<>'unit' AND NOT public.has_organization_scope(
    new.scope_unit_id,new.scope_unit_id,'elections.manage')
    THEN RAISE EXCEPTION 'ELECTION_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
  RETURN new;
END
$$;
CREATE TRIGGER default_election_scope BEFORE INSERT ON public.elections
  FOR EACH ROW EXECUTE FUNCTION public.default_election_scope();

CREATE TABLE public.election_electorate (
  election_id uuid NOT NULL REFERENCES public.elections(id) ON DELETE RESTRICT,
  person_id uuid REFERENCES public.organization_people(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  membership_id uuid NOT NULL REFERENCES public.memberships(id) ON DELETE RESTRICT,
  unit_id uuid NOT NULL REFERENCES public.organization_units(id) ON DELETE RESTRICT,
  constituency text NOT NULL,
  eligibility_rule text NOT NULL DEFAULT 'active_good_v1',
  snapshotted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(election_id,user_id),
  UNIQUE(election_id,membership_id)
);
CREATE UNIQUE INDEX election_electorate_one_person
  ON public.election_electorate(election_id,person_id)
  WHERE person_id IS NOT NULL;
CREATE TABLE public.election_person_vote_claims (
  election_id uuid NOT NULL REFERENCES public.elections(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(election_id,user_id)
);
ALTER TABLE public.election_electorate ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.election_person_vote_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.election_electorate,public.election_person_vote_claims
  FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.election_electorate TO authenticated;
CREATE POLICY electorate_own ON public.election_electorate FOR SELECT
  TO authenticated USING (user_id=auth.uid());
CREATE POLICY frozen_voter_election_select ON public.elections FOR SELECT
  TO authenticated USING (EXISTS (
    SELECT 1 FROM public.election_electorate x
    WHERE x.election_id=elections.id AND x.user_id=auth.uid()));
CREATE POLICY frozen_voter_candidate_select ON public.election_candidates FOR SELECT
  TO authenticated USING (EXISTS (
    SELECT 1 FROM public.election_electorate x
    WHERE x.election_id=election_candidates.election_id
      AND x.user_id=auth.uid()));
CREATE POLICY frozen_voter_option_select ON public.election_options FOR SELECT
  TO authenticated USING (EXISTS (
    SELECT 1 FROM public.election_electorate x
    WHERE x.election_id=election_options.election_id
      AND x.user_id=auth.uid()));

-- The old policies exposed every raw choice after close or cancellation.
DROP POLICY IF EXISTS eb_select_after_close ON public.election_ballots;
REVOKE ALL ON public.election_ballots FROM PUBLIC,anon,authenticated;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER
  ON public.election_vote_receipts FROM PUBLIC,anon,authenticated;
REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER
  ON public.elections FROM PUBLIC,anon,authenticated;
REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER
  ON public.election_candidates,public.election_options FROM PUBLIC,anon,authenticated;
GRANT DELETE ON public.election_candidates,public.election_options TO authenticated;

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
        AND m.standing='good' AND u.organization_id=scope.organization_id
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
CREATE TRIGGER election_frozen_update BEFORE UPDATE OR DELETE ON public.elections
  FOR EACH ROW EXECUTE FUNCTION public.guard_election_frozen();
CREATE TRIGGER candidate_frozen_write BEFORE INSERT OR UPDATE OR DELETE
  ON public.election_candidates FOR EACH ROW EXECUTE FUNCTION public.guard_election_frozen();
CREATE TRIGGER option_frozen_write BEFORE INSERT OR UPDATE OR DELETE
  ON public.election_options FOR EACH ROW EXECUTE FUNCTION public.guard_election_frozen();

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
          AND m.standing='good' AND u.organization_id=v_org
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
      AND m.standing='good'
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
    AND m.standing='good'
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
REVOKE ALL ON FUNCTION public.open_election_v2(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.open_election_v2(uuid,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.configure_election_scope_v2(
  p_election uuid,p_scope_unit uuid,p_scope_mode text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_e public.elections%ROWTYPE; v_scope public.organization_units%ROWTYPE;
  v_org uuid;
BEGIN
  SELECT * INTO v_e FROM public.elections WHERE id=p_election FOR UPDATE;
  SELECT * INTO v_scope FROM public.organization_units WHERE id=p_scope_unit;
  SELECT organization_id INTO v_org FROM public.groups WHERE id=v_e.group_id;
  IF v_e.id IS NULL OR v_e.status<>'draft' OR v_scope.id IS NULL
    OR v_scope.organization_id<>v_org
    OR NOT public.has_group_permission(v_e.group_id,'elections.manage')
    OR p_scope_mode NOT IN ('unit','subtree','organization')
    OR (p_scope_mode='unit' AND v_scope.group_id IS DISTINCT FROM v_e.group_id)
    OR (p_scope_mode<>'unit' AND NOT public.has_organization_scope(
      p_scope_unit,p_scope_unit,'elections.manage'))
    THEN RAISE EXCEPTION 'ELECTION_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
  UPDATE public.elections SET scope_unit_id=p_scope_unit,
    scope_mode=p_scope_mode WHERE id=p_election;
END
$$;
REVOKE ALL ON FUNCTION public.configure_election_scope_v2(uuid,uuid,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.configure_election_scope_v2(uuid,uuid,text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.update_election_draft_v2(
  p_election uuid,p_payload jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_e public.elections%ROWTYPE; v_start timestamptz; v_end timestamptz;
BEGIN
  SELECT * INTO v_e FROM public.elections WHERE id=p_election FOR UPDATE;
  IF v_e.id IS NULL OR v_e.status<>'draft' OR
    NOT public.has_group_permission(v_e.group_id,'elections.manage')
    THEN RAISE EXCEPTION 'ELECTION_DRAFT_DENIED' USING ERRCODE='42501'; END IF;
  v_start := (p_payload->>'starts_at')::timestamptz;
  v_end := (p_payload->>'ends_at')::timestamptz;
  IF nullif(trim(p_payload->>'title'),'') IS NULL OR v_start IS NULL
    OR v_end IS NULL OR v_end<=v_start OR v_end<=now()
    THEN RAISE EXCEPTION 'INVALID_ELECTION_DRAFT'; END IF;
  UPDATE public.elections SET
    title=trim(p_payload->>'title'),title_fr=nullif(trim(p_payload->>'title_fr'),''),
    description=nullif(trim(p_payload->>'description'),''),
    description_fr=nullif(trim(p_payload->>'description_fr'),''),
    election_type=(p_payload->>'election_type')::public.election_type,
    starts_at=v_start,ends_at=v_end WHERE id=p_election;
END
$$;
REVOKE ALL ON FUNCTION public.update_election_draft_v2(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_election_draft_v2(uuid,jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.verify_organization_person(
  p_person uuid,p_grant_unit uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_person public.organization_people%ROWTYPE;
  v_root uuid;
BEGIN
  SELECT * INTO v_person FROM public.organization_people WHERE id=p_person FOR UPDATE;
  SELECT id INTO v_root FROM public.organization_units
    WHERE organization_id=v_person.organization_id AND parent_id IS NULL;
  IF v_person.id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organization_units u WHERE u.id=p_grant_unit
      AND u.organization_id=v_person.organization_id)
    OR NOT public.has_organization_scope(p_grant_unit,v_root,'elections.manage')
    THEN RAISE EXCEPTION 'IDENTITY_VERIFICATION_DENIED' USING ERRCODE='42501'; END IF;
  UPDATE public.organization_people SET identity_verified_at=now(),
    identity_verified_by=auth.uid() WHERE id=p_person;
END
$$;
REVOKE ALL ON FUNCTION public.verify_organization_person(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.verify_organization_person(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_organization_people(p_grant_unit uuid)
RETURNS TABLE(person_id uuid,user_id uuid,display_name text,
  verified_at timestamptz,active_memberships bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_root uuid; v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.organization_units
    WHERE id=p_grant_unit;
  SELECT id INTO v_root FROM public.organization_units
    WHERE organization_id=v_org AND parent_id IS NULL;
  IF v_root IS NULL OR NOT public.has_organization_scope(
    p_grant_unit,v_root,'elections.manage')
    THEN RAISE EXCEPTION 'IDENTITY_LIST_DENIED' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT p.id,p.user_id,profile.full_name,p.identity_verified_at,
    (SELECT count(*) FROM public.memberships m JOIN public.groups g
      ON g.id=m.group_id WHERE g.organization_id=v_org
        AND m.user_id=p.user_id AND m.membership_status='active')
  FROM public.organization_people p JOIN public.profiles profile
    ON profile.id=p.user_id
  WHERE p.organization_id=v_org ORDER BY profile.full_name,p.id;
END
$$;
REVOKE ALL ON FUNCTION public.list_organization_people(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_organization_people(uuid) TO authenticated;

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
      AND m.standing='good' AND g.organization_id=scope.organization_id
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
REVOKE ALL ON FUNCTION public.cast_ballot(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cast_ballot(uuid,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_election_vote_status(p_election uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS (SELECT 1 FROM public.election_person_vote_claims
    WHERE election_id=p_election AND user_id=auth.uid());
$$;
REVOKE ALL ON FUNCTION public.get_election_vote_status(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_election_vote_status(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.transition_election_v2(
  p_election uuid,p_status text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_e public.elections%ROWTYPE;
BEGIN
  SELECT * INTO v_e FROM public.elections WHERE id=p_election FOR UPDATE;
  IF v_e.id IS NULL OR NOT public.has_group_permission(v_e.group_id,'elections.manage')
    THEN RAISE EXCEPTION 'DENY' USING ERRCODE='42501'; END IF;
  IF p_status NOT IN ('closed','cancelled') OR
    (v_e.status<>'open' AND NOT (v_e.status='draft' AND p_status='cancelled'))
    THEN RAISE EXCEPTION 'ELECTION_TRANSITION_DENIED'; END IF;
  UPDATE public.elections SET status=p_status::public.election_status WHERE id=p_election;
  RETURN jsonb_build_object('ok',true,'status',p_status);
END
$$;
REVOKE ALL ON FUNCTION public.transition_election_v2(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.transition_election_v2(uuid,text) TO authenticated;

REVOKE ALL ON FUNCTION public.finalize_election(uuid)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.publish_election_results(p_election uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_e public.elections%ROWTYPE; v_finalization jsonb;
BEGIN
  SELECT * INTO v_e FROM public.elections WHERE id=p_election FOR UPDATE;
  IF v_e.id IS NULL OR NOT public.has_group_permission(v_e.group_id,'elections.manage')
    THEN RAISE EXCEPTION 'DENY' USING ERRCODE='42501'; END IF;
  IF v_e.status<>'closed' THEN RAISE EXCEPTION 'RESULTS_NOT_PUBLISHABLE'; END IF;
  IF v_e.published_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok',true,'decision','ALREADY_PUBLISHED');
  END IF;
  UPDATE public.elections SET published_at=coalesce(published_at,now()),
    published_by=coalesce(published_by,auth.uid()) WHERE id=p_election;
  IF v_e.election_type='officer_election' THEN
    v_finalization:=public.finalize_election(p_election);
    IF NOT coalesce((v_finalization->>'ok')::boolean,false)
      AND coalesce(v_finalization->>'error','') NOT IN
        ('tied','no_position_linked','no_votes')
      THEN RAISE EXCEPTION 'ELECTION_FINALIZATION_FAILED: %',v_finalization; END IF;
  END IF;
  RETURN jsonb_build_object('ok',true,'decision','PUBLISHED',
    'finalization',v_finalization);
END
$$;
REVOKE ALL ON FUNCTION public.publish_election_results(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.publish_election_results(uuid) TO authenticated;

-- Officer assignment is a publication effect; finalization before approval
-- would disclose the winner through positions even if aggregates were hidden.
CREATE OR REPLACE FUNCTION public.guard_election_assignment_publication()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF new.election_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.elections e WHERE e.id=new.election_id
      AND e.status='closed' AND e.published_at IS NOT NULL)
    THEN RAISE EXCEPTION 'ELECTION_RESULT_UNPUBLISHED'; END IF;
  RETURN new;
END
$$;
CREATE TRIGGER election_assignment_requires_publication
  BEFORE INSERT OR UPDATE OF election_id ON public.position_assignments
  FOR EACH ROW EXECUTE FUNCTION public.guard_election_assignment_publication();

CREATE OR REPLACE FUNCTION public.get_published_election_results(p_election uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_e public.elections%ROWTYPE; v_rows jsonb;
BEGIN
  SELECT * INTO v_e FROM public.elections WHERE id=p_election;
  IF v_e.id IS NULL OR v_e.status<>'closed' OR v_e.published_at IS NULL
    OR NOT EXISTS (SELECT 1 FROM public.election_electorate x
      WHERE x.election_id=p_election AND x.user_id=auth.uid())
    OR NOT EXISTS (SELECT 1 FROM public.memberships m
      JOIN public.groups g ON g.id=m.group_id
      JOIN public.organization_units u ON u.id=v_e.scope_unit_id
      WHERE m.user_id=auth.uid() AND m.membership_status='active'
        AND g.organization_id=u.organization_id)
    THEN RETURN '[]'::jsonb; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('candidate_id',candidate_id,
    'option_id',option_id,'count',n)), '[]'::jsonb) INTO v_rows
  FROM (SELECT candidate_id,option_id,count(*) n FROM public.election_ballots
    WHERE election_id=p_election GROUP BY candidate_id,option_id) counts;
  RETURN v_rows;
END
$$;
REVOKE ALL ON FUNCTION public.get_published_election_results(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_published_election_results(uuid) TO authenticated;
