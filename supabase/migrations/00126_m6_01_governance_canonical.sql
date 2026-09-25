-- M6 Slice 1: Core Governance Schema, Immutable Ledgers & Sealed Ballots

DO $m6_pre$
DECLARE
  v_hgp_count int;
  v_hgp_ident text;
  v_hgp_result text;
  v_hgp_owner text;
  v_hgp_definer boolean;
  v_hgp_cfg text[];
  v_hgp_def_md5 text;
  v_hgp_src_md5 text;
BEGIN
  -- 1. Verify has_group_permission pin (from M5)
  SELECT count(*) INTO v_hgp_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'has_group_permission';
  IF v_hgp_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'M6_ABORT: has_group_permission overload count=% (expected 1)', v_hgp_count;
  END IF;

  SELECT pg_get_function_identity_arguments(p.oid),
         pg_get_function_result(p.oid),
         pg_get_userbyid(p.proowner),
         p.prosecdef,
         p.proconfig,
         md5(pg_get_functiondef(p.oid)),
         md5(p.prosrc)
    INTO v_hgp_ident, v_hgp_result, v_hgp_owner, v_hgp_definer, v_hgp_cfg,
         v_hgp_def_md5, v_hgp_src_md5
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'has_group_permission';

  IF v_hgp_ident IS DISTINCT FROM 'gid uuid, perm_key text, uid uuid'
     OR v_hgp_result IS DISTINCT FROM 'boolean'
     OR v_hgp_owner IS DISTINCT FROM 'postgres'
     OR v_hgp_definer IS NOT TRUE
     OR v_hgp_cfg IS DISTINCT FROM ARRAY['search_path=""']::text[]
     OR v_hgp_def_md5 IS DISTINCT FROM '695368464e97297fbf0f90ce7345162f'
     OR v_hgp_src_md5 IS DISTINCT FROM '96a296dfd541c7fc75ec68c4da1d92ff' THEN
    RAISE EXCEPTION
      'M6_ABORT: has_group_permission pin mismatch ident=% result=% owner=% definer=% cfg=% def_md5=% src_md5=%',
      v_hgp_ident, v_hgp_result, v_hgp_owner, v_hgp_definer, v_hgp_cfg,
      v_hgp_def_md5, v_hgp_src_md5;
  END IF;

  -- 2. Ensure migration 00125 (M5 RBAC) is present
  IF to_regprocedure('public.create_group_invitation(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'M6_ABORT: create_group_invitation missing — apply 00125 first';
  END IF;

END
$m6_pre$;

BEGIN;

-- 2. Canonical Assemblies Table (public.assemblies)
CREATE TABLE IF NOT EXISTS public.assemblies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  title text NOT NULL,
  assembly_type text NOT NULL CHECK (assembly_type IN ('agm', 'general_assembly', 'extraordinary_assembly', 'committee')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'called_to_order', 'in_session', 'adjourned', 'archived')),
  scheduled_at timestamptz NOT NULL,
  convened_at timestamptz,
  adjourned_at timestamptz,
  location text,
  presided_by uuid REFERENCES public.memberships(id) ON DELETE SET NULL,
  recorded_by uuid REFERENCES public.memberships(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assemblies_group_status ON public.assemblies(group_id, status);
CREATE INDEX IF NOT EXISTS idx_assemblies_group_scheduled ON public.assemblies(group_id, scheduled_at);

ALTER TABLE public.assemblies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Assemblies visible to group members" ON public.assemblies FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.group_id = assemblies.group_id
        AND m.user_id = auth.uid()
        AND m.membership_status IN ('active', 'suspended')
    )
  );

CREATE POLICY "Assemblies manageable by governance admins" ON public.assemblies FOR INSERT TO authenticated
  WITH CHECK (
    public.has_group_permission(group_id, 'governance.manage') OR 
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.group_id = assemblies.group_id
        AND m.user_id = auth.uid()
        AND m.role = 'owner'
    )
  );

CREATE POLICY "Assemblies updatable by governance admins" ON public.assemblies FOR UPDATE TO authenticated
  USING (
    public.has_group_permission(group_id, 'governance.manage') OR 
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.group_id = assemblies.group_id
        AND m.user_id = auth.uid()
        AND m.role = 'owner'
    )
  )
  WITH CHECK (
    public.has_group_permission(group_id, 'governance.manage') OR 
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.group_id = assemblies.group_id
        AND m.user_id = auth.uid()
        AND m.role = 'owner'
    )
  );

-- Hard deletes prohibited on assemblies
CREATE OR REPLACE FUNCTION public.prevent_assembly_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'ASSEMBLY_HARD_DELETE_PROHIBITED' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_assembly_delete ON public.assemblies;
CREATE TRIGGER trg_prevent_assembly_delete
  BEFORE DELETE ON public.assemblies
  FOR EACH ROW EXECUTE FUNCTION public.prevent_assembly_hard_delete();

-- 3. Canonical Immutable Resolutions Table (public.resolutions)
CREATE TABLE IF NOT EXISTS public.resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  assembly_id uuid REFERENCES public.assemblies(id) ON DELETE RESTRICT,
  resolution_number text NOT NULL,
  title text NOT NULL,
  prose text NOT NULL,
  proposer_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL,
  seconder_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL,
  threshold_rule text NOT NULL DEFAULT 'simple_majority' CHECK (threshold_rule IN ('simple_majority', 'two_thirds', 'three_fourths', 'unanimous')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'tabled', 'adopted', 'rejected', 'withdrawn')),
  votes_for integer DEFAULT 0,
  votes_against integer DEFAULT 0,
  votes_abstain integer DEFAULT 0,
  adopted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (group_id, resolution_number)
);

ALTER TABLE public.resolutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Resolutions visible to group members" ON public.resolutions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.group_id = resolutions.group_id
        AND m.user_id = auth.uid()
        AND m.membership_status IN ('active', 'suspended')
    )
  );

CREATE POLICY "Resolutions manageable by governance admins" ON public.resolutions FOR INSERT TO authenticated
  WITH CHECK (
    public.has_group_permission(group_id, 'governance.manage') OR 
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.group_id = resolutions.group_id
        AND m.user_id = auth.uid()
        AND m.role = 'owner'
    )
  );

CREATE POLICY "Resolutions updatable by governance admins" ON public.resolutions FOR UPDATE TO authenticated
  USING (
    public.has_group_permission(group_id, 'governance.manage') OR 
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.group_id = resolutions.group_id
        AND m.user_id = auth.uid()
        AND m.role = 'owner'
    )
  )
  WITH CHECK (
    public.has_group_permission(group_id, 'governance.manage') OR 
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.group_id = resolutions.group_id
        AND m.user_id = auth.uid()
        AND m.role = 'owner'
    )
  );

CREATE OR REPLACE FUNCTION public.check_resolution_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_assembly_status text;
BEGIN
  IF OLD.assembly_id IS NOT NULL THEN
    SELECT status INTO v_assembly_status FROM public.assemblies WHERE id = OLD.assembly_id;
    IF v_assembly_status = 'adjourned' THEN
      RAISE EXCEPTION 'RESOLUTION_IMMUTABLE_AFTER_ADJOURNMENT' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_resolution_immutability_update ON public.resolutions;
CREATE TRIGGER trg_resolution_immutability_update
  BEFORE UPDATE ON public.resolutions
  FOR EACH ROW EXECUTE FUNCTION public.check_resolution_immutability();

DROP TRIGGER IF EXISTS trg_resolution_immutability_delete ON public.resolutions;
CREATE TRIGGER trg_resolution_immutability_delete
  BEFORE DELETE ON public.resolutions
  FOR EACH ROW EXECUTE FUNCTION public.check_resolution_immutability();


-- 4. Ballot Box Seal & State Machine Protection
CREATE OR REPLACE FUNCTION public.prevent_election_reopen()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.status = 'closed' AND NEW.status <> 'closed' THEN
    RAISE EXCEPTION 'ELECTION_SEALED_REOPEN_PROHIBITED' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_election_reopen ON public.elections;
CREATE TRIGGER trg_prevent_election_reopen
  BEFORE UPDATE ON public.elections
  FOR EACH ROW EXECUTE FUNCTION public.prevent_election_reopen();


CREATE OR REPLACE FUNCTION public.check_election_accepting_votes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_election_status text;
BEGIN
  SELECT status INTO v_election_status FROM public.elections WHERE id = NEW.election_id;
  IF v_election_status <> 'open' THEN
    RAISE EXCEPTION 'ELECTION_NOT_ACCEPTING_VOTES' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_ballot_election_open ON public.election_ballots;
CREATE TRIGGER trg_check_ballot_election_open
  BEFORE INSERT ON public.election_ballots
  FOR EACH ROW EXECUTE FUNCTION public.check_election_accepting_votes();

DROP TRIGGER IF EXISTS trg_check_receipt_election_open ON public.election_vote_receipts;
CREATE TRIGGER trg_check_receipt_election_open
  BEFORE INSERT ON public.election_vote_receipts
  FOR EACH ROW EXECUTE FUNCTION public.check_election_accepting_votes();


CREATE OR REPLACE FUNCTION public.prevent_ballot_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'BALLOTS_IMMUTABLE' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_ballot_update ON public.election_ballots;
CREATE TRIGGER trg_prevent_ballot_update
  BEFORE UPDATE ON public.election_ballots
  FOR EACH ROW EXECUTE FUNCTION public.prevent_ballot_mutation();

DROP TRIGGER IF EXISTS trg_prevent_ballot_delete ON public.election_ballots;
CREATE TRIGGER trg_prevent_ballot_delete
  BEFORE DELETE ON public.election_ballots
  FOR EACH ROW EXECUTE FUNCTION public.prevent_ballot_mutation();

DROP TRIGGER IF EXISTS trg_prevent_receipt_update ON public.election_vote_receipts;
CREATE TRIGGER trg_prevent_receipt_update
  BEFORE UPDATE ON public.election_vote_receipts
  FOR EACH ROW EXECUTE FUNCTION public.prevent_ballot_mutation();

DROP TRIGGER IF EXISTS trg_prevent_receipt_delete ON public.election_vote_receipts;
CREATE TRIGGER trg_prevent_receipt_delete
  BEFORE DELETE ON public.election_vote_receipts
  FOR EACH ROW EXECUTE FUNCTION public.prevent_ballot_mutation();


-- 5. Fortify cast_ballot RPC
CREATE OR REPLACE FUNCTION public.cast_ballot(
  p_election_id uuid,
  p_candidate_id uuid DEFAULT NULL,
  p_option_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_membership_id uuid;
  v_standing text;
  v_election_group uuid;
  v_election_type text;
  v_election_status text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_inserted boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required', 'status', 'auth_required', 'message', 'Authentication required');
  END IF;

  IF ((p_candidate_id IS NOT NULL)::int + (p_option_id IS NOT NULL)::int) <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_choice', 'status', 'invalid_choice', 'message', 'Invalid choice');
  END IF;

  SELECT group_id, election_type::text, status::text, starts_at, ends_at
    INTO v_election_group, v_election_type, v_election_status, v_starts_at, v_ends_at
  FROM elections
  WHERE id = p_election_id;

  IF v_election_group IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'election_not_found', 'status', 'election_not_found', 'message', 'Election not found');
  END IF;

  IF v_election_status <> 'open' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'election_not_open', 'status', 'election_not_open', 'message', 'Election is not open');
  END IF;

  IF now() < v_starts_at OR now() > v_ends_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_within_voting_period', 'status', 'not_within_voting_period', 'message', 'Not within voting period');
  END IF;

  SELECT id, standing::text
    INTO v_membership_id, v_standing
  FROM memberships
  WHERE group_id = v_election_group
    AND user_id = v_user_id
  LIMIT 1;

  IF v_membership_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_member', 'status', 'not_a_member', 'message', 'User is not a member of the group');
  END IF;

  IF v_standing <> 'good' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_in_good_standing', 'status', 'not_in_good_standing', 'message', 'Member is not in good standing');
  END IF;

  IF p_candidate_id IS NOT NULL THEN
    IF v_election_type <> 'officer_election' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'candidate_not_allowed_for_type', 'status', 'candidate_not_allowed_for_type', 'message', 'Candidate not allowed for this election type');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM election_candidates
      WHERE id = p_candidate_id AND election_id = p_election_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_candidate', 'status', 'invalid_candidate', 'message', 'Invalid candidate');
    END IF;
  ELSE
    IF v_election_type NOT IN ('poll','motion') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'option_not_allowed_for_type', 'status', 'option_not_allowed_for_type', 'message', 'Option not allowed for this election type');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM election_options
      WHERE id = p_option_id AND election_id = p_election_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_option', 'status', 'invalid_option', 'message', 'Invalid option');
    END IF;
  END IF;

  -- Use ON CONFLICT DO NOTHING to gracefully handle concurrent voting race conditions
  WITH ins AS (
    INSERT INTO election_vote_receipts (election_id, voter_membership_id)
    VALUES (p_election_id, v_membership_id)
    ON CONFLICT (election_id, voter_membership_id) DO NOTHING
    RETURNING id
  )
  SELECT EXISTS(SELECT 1 FROM ins) INTO v_inserted;

  IF NOT v_inserted THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_voted', 'status', 'already_voted', 'message', 'Ballot already submitted');
  END IF;

  INSERT INTO election_ballots (election_id, candidate_id, option_id)
  VALUES (p_election_id, p_candidate_id, p_option_id);

  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMIT;
