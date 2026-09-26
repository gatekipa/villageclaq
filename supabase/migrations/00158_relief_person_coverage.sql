-- R-004: newly contracted Relief coverage belongs to an organization person
-- and a plan. Membership rows remain operational responsibility projections.
-- Legacy enrollments are not guessed into contracts; R-012 must reconcile them.
BEGIN;
CREATE TABLE public.relief_coverage_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.relief_plans(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  person_id uuid NOT NULL,
  current_membership_id uuid REFERENCES public.memberships(id) ON DELETE RESTRICT,
  coverage_started_at timestamptz NOT NULL,
  matures_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('active','suspended_out_of_scope')),
  enrollment_type text NOT NULL CHECK
    (enrollment_type IN ('full_member','relief_only','external')),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL UNIQUE,
  command_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (plan_id,person_id),
  FOREIGN KEY (person_id,organization_id)
    REFERENCES public.organization_people(id,organization_id) ON DELETE RESTRICT,
  CHECK (matures_at>=coverage_started_at),
  CHECK ((status='active')=(current_membership_id IS NOT NULL))
);
CREATE INDEX relief_coverage_current_membership
  ON public.relief_coverage_contracts(current_membership_id)
  WHERE current_membership_id IS NOT NULL;
ALTER TABLE public.relief_coverage_contracts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.relief_coverage_contracts
  FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE public.relief_coverage_responsibilities (
  contract_id uuid NOT NULL REFERENCES public.relief_coverage_contracts(id)
    ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version>0),
  membership_id uuid NOT NULL REFERENCES public.memberships(id)
    ON DELETE RESTRICT,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE RESTRICT,
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (reason IN ('enrollment','transfer')),
  PRIMARY KEY (contract_id,version),
  CHECK (effective_to IS NULL OR effective_to>=effective_from)
);
CREATE UNIQUE INDEX relief_coverage_one_current_responsibility
  ON public.relief_coverage_responsibilities(contract_id)
  WHERE effective_to IS NULL;
ALTER TABLE public.relief_coverage_responsibilities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.relief_coverage_responsibilities
  FROM PUBLIC,anon,authenticated,service_role;

-- Existing permissive enrollment policies remain for uncontracted plans.
-- Restrictive policies prevent their OR-combination from bypassing the new
-- server command on a contracted plan.
CREATE OR REPLACE FUNCTION public.relief_plan_is_contracted(p_plan uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS (SELECT 1 FROM public.relief_plan_scope_versions s
    WHERE s.plan_id=p_plan AND s.effective_to IS NULL);
$$;
REVOKE ALL ON FUNCTION public.relief_plan_is_contracted(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.relief_plan_is_contracted(uuid)
  TO authenticated;
CREATE POLICY relief_contract_enrollment_insert_gate
  ON public.relief_enrollments AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT public.relief_plan_is_contracted(relief_enrollments.plan_id));
CREATE POLICY relief_contract_enrollment_update_gate
  ON public.relief_enrollments AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT public.relief_plan_is_contracted(relief_enrollments.plan_id))
  WITH CHECK (NOT public.relief_plan_is_contracted(relief_enrollments.plan_id));
CREATE POLICY relief_contract_enrollment_delete_gate
  ON public.relief_enrollments AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT public.relief_plan_is_contracted(relief_enrollments.plan_id));

CREATE OR REPLACE FUNCTION public.enroll_relief_person(p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=auth.uid(); v_request uuid; v_plan public.relief_plans%ROWTYPE;
  v_scope public.relief_plan_scope_versions%ROWTYPE;
  v_member public.memberships%ROWTYPE; v_group public.groups%ROWTYPE;
  v_person uuid; v_unit uuid; v_topology bigint; v_type text;
  v_payload jsonb; v_existing public.relief_coverage_contracts%ROWTYPE;
  v_coverage uuid; v_enrollment uuid; v_now timestamptz:=transaction_timestamp();
BEGIN
  IF v_actor IS NULL OR pg_catalog.jsonb_typeof(p_command) IS DISTINCT FROM 'object'
     OR p_command->>'request_id' IS NULL OR p_command->>'plan_id' IS NULL
     OR p_command->>'membership_id' IS NULL OR p_command->>'group_id' IS NULL
  THEN RAISE EXCEPTION 'INVALID_RELIEF_ENROLLMENT'; END IF;
  v_request:=(p_command->>'request_id')::uuid;
  v_type:=coalesce(p_command->>'enrollment_type','full_member');
  IF v_type NOT IN ('full_member','relief_only','external')
  THEN RAISE EXCEPTION 'INVALID_RELIEF_ENROLLMENT_TYPE'; END IF;
  SELECT * INTO v_plan FROM public.relief_plans
    WHERE id=(p_command->>'plan_id')::uuid FOR SHARE;
  SELECT * INTO v_member FROM public.memberships
    WHERE id=(p_command->>'membership_id')::uuid FOR SHARE;
  IF v_plan.id IS NULL OR v_member.id IS NULL OR v_member.membership_status<>'active'
     OR v_member.group_id IS DISTINCT FROM (p_command->>'group_id')::uuid
     OR NOT v_plan.is_active OR v_plan.status<>'active'
     OR v_plan.waiting_period_days IS NULL OR v_plan.waiting_period_days<0
  THEN RAISE EXCEPTION 'RELIEF_ENROLLMENT_DIMENSION_CONFLICT'; END IF;
  IF NOT public.has_group_permission(v_member.group_id,'relief.manage',v_actor)
  THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_scope FROM public.relief_plan_scope_versions
    WHERE plan_id=v_plan.id AND effective_to IS NULL FOR SHARE;
  IF v_scope.id IS NULL THEN RAISE EXCEPTION 'RELIEF_PLAN_SCOPE_REQUIRED'; END IF;
  SELECT * INTO v_group FROM public.groups WHERE id=v_member.group_id FOR SHARE;
  SELECT id INTO v_unit FROM public.organization_units
    WHERE group_id=v_group.id AND archived_at IS NULL;
  SELECT topology_version INTO v_topology FROM public.organizations
    WHERE id=v_scope.organization_id FOR SHARE;
  SELECT id INTO v_person FROM public.organization_people
    WHERE organization_id=v_scope.organization_id AND user_id=v_member.user_id
    FOR UPDATE;
  IF v_group.organization_id IS DISTINCT FROM v_scope.organization_id
     OR v_topology IS DISTINCT FROM v_scope.topology_version
     OR v_unit IS NULL OR v_person IS NULL
     OR NOT EXISTS (SELECT 1 FROM financial_core.relief_plan_scope_membership sm
       WHERE sm.scope_id=v_scope.id AND sm.unit_id=v_unit
         AND sm.purpose='participation')
  THEN RAISE EXCEPTION 'RELIEF_ENROLLMENT_OUT_OF_SCOPE' USING ERRCODE='42501'; END IF;
  v_payload:=pg_catalog.jsonb_build_object('plan_id',v_plan.id,
    'membership_id',v_member.id,'group_id',v_member.group_id,
    'person_id',v_person,'enrollment_type',v_type);
  SELECT * INTO v_existing FROM public.relief_coverage_contracts
    WHERE request_id=v_request OR (plan_id=v_plan.id AND person_id=v_person)
    ORDER BY (request_id=v_request) DESC LIMIT 1 FOR UPDATE;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.request_id=v_request AND
       (v_existing.created_by<>v_actor OR v_existing.command_payload<>v_payload)
    THEN RAISE EXCEPTION 'RELIEF_ENROLLMENT_IDENTITY_CONFLICT'; END IF;
    IF v_existing.plan_id<>v_plan.id OR v_existing.person_id<>v_person
       OR v_existing.current_membership_id IS DISTINCT FROM v_member.id
       OR v_existing.enrollment_type<>v_type OR v_existing.status<>'active'
    THEN RAISE EXCEPTION 'PERSON_ALREADY_COVERED'; END IF;
    SELECT id INTO v_enrollment FROM public.relief_enrollments
      WHERE plan_id=v_plan.id AND membership_id=v_member.id;
    RETURN pg_catalog.jsonb_build_object('decision','recovered',
      'coverage_id',v_existing.id,'enrollment_id',v_enrollment,
      'matures_at',v_existing.matures_at,'version',v_existing.version);
  END IF;
  IF EXISTS (SELECT 1 FROM public.relief_enrollments e
      JOIN public.memberships m ON m.id=e.membership_id
      WHERE e.plan_id=v_plan.id AND m.user_id=v_member.user_id)
  THEN RAISE EXCEPTION 'LEGACY_COVERAGE_RECONCILIATION_REQUIRED'; END IF;
  INSERT INTO public.relief_coverage_contracts
    (plan_id,organization_id,person_id,current_membership_id,
     coverage_started_at,matures_at,status,enrollment_type,created_by,
     request_id,command_payload)
  VALUES (v_plan.id,v_scope.organization_id,v_person,v_member.id,
    v_now,v_now+make_interval(days=>v_plan.waiting_period_days),
    'active',v_type,v_actor,v_request,v_payload)
  RETURNING id INTO v_coverage;
  INSERT INTO public.relief_coverage_responsibilities
    (contract_id,version,membership_id,group_id,effective_from,actor_id,reason)
  VALUES (v_coverage,1,v_member.id,v_member.group_id,v_now,v_actor,'enrollment');
  INSERT INTO public.relief_enrollments
    (plan_id,membership_id,group_id,collecting_group_id,
     enrolled_at,matures_at,eligible_date,enrollment_type,status,is_active)
  VALUES (v_plan.id,v_member.id,v_member.group_id,v_member.group_id,
    v_now,v_now+make_interval(days=>v_plan.waiting_period_days),
    (v_now+make_interval(days=>v_plan.waiting_period_days))::date,
    v_type,'active',true)
  RETURNING id INTO v_enrollment;
  RETURN pg_catalog.jsonb_build_object('decision','posted',
    'coverage_id',v_coverage,'enrollment_id',v_enrollment,
    'matures_at',v_now+make_interval(days=>v_plan.waiting_period_days),
    'version',1);
END
$$;
REVOKE ALL ON FUNCTION public.enroll_relief_person(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.enroll_relief_person(jsonb) TO authenticated;
COMMIT;
