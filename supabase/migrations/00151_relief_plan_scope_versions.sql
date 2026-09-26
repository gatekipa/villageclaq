-- R-002/R-003: explicit, versioned Relief ownership and authority contract.
-- Existing S0/M2 plans receive no guessed economic owner or effective scope;
-- R-012 must reconcile and activate those contracts explicitly.
BEGIN;
CREATE TABLE public.relief_plan_scope_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.relief_plans(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version>0),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  owning_unit_id uuid NOT NULL REFERENCES public.organization_units(id) ON DELETE RESTRICT,
  financial_owner_group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE RESTRICT,
  participation_unit_id uuid NOT NULL REFERENCES public.organization_units(id) ON DELETE RESTRICT,
  participation_mode text NOT NULL CHECK (participation_mode IN ('unit','subtree','organization')),
  collection_unit_id uuid NOT NULL REFERENCES public.organization_units(id) ON DELETE RESTRICT,
  collection_mode text NOT NULL CHECK (collection_mode IN ('unit','subtree','organization')),
  review_unit_id uuid NOT NULL REFERENCES public.organization_units(id) ON DELETE RESTRICT,
  payout_unit_id uuid NOT NULL REFERENCES public.organization_units(id) ON DELETE RESTRICT,
  reporting_unit_id uuid NOT NULL REFERENCES public.organization_units(id) ON DELETE RESTRICT,
  reporting_mode text NOT NULL CHECK (reporting_mode IN ('unit','subtree','organization')),
  topology_version bigint NOT NULL,
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  authorized_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL UNIQUE,
  command_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (plan_id,version),
  CHECK (effective_to IS NULL OR effective_to>effective_from)
);
CREATE UNIQUE INDEX relief_plan_one_current_scope
  ON public.relief_plan_scope_versions(plan_id)
  WHERE effective_to IS NULL;
CREATE INDEX relief_plan_scope_by_organization
  ON public.relief_plan_scope_versions(organization_id,plan_id);
ALTER TABLE public.relief_plan_scope_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.relief_plan_scope_versions
  FROM PUBLIC,anon,authenticated;

CREATE TABLE financial_core.relief_plan_scope_membership (
  scope_id uuid NOT NULL REFERENCES public.relief_plan_scope_versions(id)
    ON DELETE RESTRICT,
  unit_id uuid NOT NULL REFERENCES public.organization_units(id)
    ON DELETE RESTRICT,
  purpose text NOT NULL CHECK (purpose IN
    ('participation','collection','reporting')),
  PRIMARY KEY (scope_id,unit_id,purpose)
);
ALTER TABLE financial_core.relief_plan_scope_membership
  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON financial_core.relief_plan_scope_membership
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION financial_core.relief_unit_in_scope(
  p_root uuid,p_mode text,p_target uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_units root
    JOIN public.organization_units target
      ON target.id=p_target AND target.organization_id=root.organization_id
    WHERE root.id=p_root AND root.archived_at IS NULL
      AND target.archived_at IS NULL
      AND (p_mode='organization'
        OR (p_mode='unit' AND target.id=root.id)
        OR (p_mode='subtree' AND EXISTS (
          SELECT 1 FROM public.organization_unit_closure c
          WHERE c.ancestor_id=root.id AND c.descendant_id=target.id)))
  );
$$;
REVOKE ALL ON FUNCTION financial_core.relief_unit_in_scope(uuid,text,uuid)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.configure_relief_plan_scope(p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_plan public.relief_plans%ROWTYPE;
  v_owner public.groups%ROWTYPE;
  v_existing public.relief_plan_scope_versions%ROWTYPE;
  v_previous public.relief_plan_scope_versions%ROWTYPE;
  v_actor uuid:=auth.uid(); v_request uuid; v_expected integer;
  v_own uuid; v_part uuid; v_collect uuid; v_review uuid;
  v_payout uuid; v_report uuid; v_part_mode text;
  v_collect_mode text; v_report_mode text; v_payload jsonb;
  v_version integer; v_now timestamptz:=clock_timestamp();
  v_unit record; v_owner_unit uuid;
  v_topology bigint; v_scope_id uuid;
BEGIN
  IF v_actor IS NULL OR pg_catalog.jsonb_typeof(p_command) IS DISTINCT FROM 'object'
     OR p_command->>'plan_id' IS NULL
     OR p_command->>'request_id' IS NULL
     OR p_command->>'expected_version' IS NULL
     OR p_command->>'owning_unit_id' IS NULL
     OR p_command->>'financial_owner_group_id' IS NULL
     OR p_command->>'participation_unit_id' IS NULL
     OR p_command->>'participation_mode' IS NULL
     OR p_command->>'collection_unit_id' IS NULL
     OR p_command->>'collection_mode' IS NULL
     OR p_command->>'review_unit_id' IS NULL
     OR p_command->>'payout_unit_id' IS NULL
     OR p_command->>'reporting_unit_id' IS NULL
     OR p_command->>'reporting_mode' IS NULL
  THEN RAISE EXCEPTION 'INVALID_RELIEF_SCOPE_COMMAND'; END IF;
  v_request:=(p_command->>'request_id')::uuid;
  v_expected:=(p_command->>'expected_version')::integer;
  v_own:=(p_command->>'owning_unit_id')::uuid;
  v_part:=(p_command->>'participation_unit_id')::uuid;
  v_collect:=(p_command->>'collection_unit_id')::uuid;
  v_review:=(p_command->>'review_unit_id')::uuid;
  v_payout:=(p_command->>'payout_unit_id')::uuid;
  v_report:=(p_command->>'reporting_unit_id')::uuid;
  v_part_mode:=p_command->>'participation_mode';
  v_collect_mode:=p_command->>'collection_mode';
  v_report_mode:=p_command->>'reporting_mode';
  IF v_expected<0 OR v_part_mode NOT IN ('unit','subtree','organization')
     OR v_collect_mode NOT IN ('unit','subtree','organization')
     OR v_report_mode NOT IN ('unit','subtree','organization')
  THEN RAISE EXCEPTION 'INVALID_RELIEF_SCOPE_COMMAND'; END IF;
  SELECT * INTO v_plan FROM public.relief_plans
    WHERE id=(p_command->>'plan_id')::uuid FOR UPDATE;
  IF v_plan.id IS NULL THEN RAISE EXCEPTION 'RELIEF_PLAN_NOT_FOUND'; END IF;
  SELECT * INTO v_owner FROM public.groups
    WHERE id=(p_command->>'financial_owner_group_id')::uuid FOR SHARE;
  -- Existing F3 Relief commands post to plan.group_id. A distinct owner
  -- requires the later R-006 owner-ledger adapter, never a silent redirection.
  IF v_owner.id IS NULL OR v_owner.id<>v_plan.group_id
     OR v_owner.organization_id IS NULL
     OR v_owner.currency IS DISTINCT FROM coalesce(v_plan.currency,v_owner.currency)
  THEN RAISE EXCEPTION 'RELIEF_FINANCIAL_OWNER_CONFLICT'; END IF;
  SELECT topology_version INTO v_topology FROM public.organizations
    WHERE id=v_owner.organization_id FOR SHARE;
  SELECT id INTO v_owner_unit FROM public.organization_units
    WHERE group_id=v_owner.id AND archived_at IS NULL;
  IF NOT public.has_group_permission(v_owner.id,'relief.manage',v_actor)
     OR (NOT public.has_any_organization_scope(v_own,'hierarchy.manage')
       AND NOT (v_own=v_owner_unit AND v_part=v_owner_unit
         AND v_collect=v_owner_unit AND v_review=v_owner_unit
         AND v_payout=v_owner_unit AND v_report=v_owner_unit
         AND v_part_mode='unit' AND v_collect_mode='unit'
         AND v_report_mode='unit'))
  THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  IF NOT v_plan.shared_from_org AND
     (v_part<>v_owner_unit OR v_part_mode<>'unit'
       OR v_collect<>v_owner_unit OR v_collect_mode<>'unit'
       OR v_review<>v_owner_unit OR v_payout<>v_owner_unit)
  THEN RAISE EXCEPTION 'RELIEF_SCOPE_EXPANSION_REQUIRES_NEW_PLAN'; END IF;
  FOR v_unit IN SELECT id,organization_id,group_id,archived_at
      FROM public.organization_units
      WHERE id IN (v_own,v_part,v_collect,v_review,v_payout,v_report)
  LOOP
    IF v_unit.organization_id<>v_owner.organization_id
       OR v_unit.archived_at IS NOT NULL
    THEN RAISE EXCEPTION 'RELIEF_SCOPE_CROSS_ORGANIZATION'; END IF;
  END LOOP;
  IF (SELECT count(DISTINCT id) FROM public.organization_units
      WHERE id IN (v_own,v_part,v_collect,v_review,v_payout,v_report))<>
     (SELECT count(DISTINCT id) FROM (VALUES
       (v_own),(v_part),(v_collect),(v_review),(v_payout),(v_report)) x(id))
     OR NOT EXISTS (SELECT 1 FROM public.organization_units u
       WHERE u.group_id=v_owner.id AND u.organization_id=v_owner.organization_id
         AND u.archived_at IS NULL)
     OR NOT financial_core.relief_unit_in_scope(v_part,v_part_mode,v_collect)
     OR NOT EXISTS (SELECT 1 FROM public.organization_units u
       WHERE u.id=v_review AND u.group_id IS NOT NULL)
     OR NOT EXISTS (SELECT 1 FROM public.organization_units u
       WHERE u.id=v_payout AND u.group_id IS NOT NULL)
     OR (v_part_mode='organization' AND EXISTS (
       SELECT 1 FROM public.organization_units u
       WHERE u.id=v_part AND u.parent_id IS NOT NULL))
     OR (v_collect_mode='organization' AND EXISTS (
       SELECT 1 FROM public.organization_units u
       WHERE u.id=v_collect AND u.parent_id IS NOT NULL))
     OR (v_report_mode='organization' AND EXISTS (
       SELECT 1 FROM public.organization_units u
       WHERE u.id=v_report AND u.parent_id IS NOT NULL))
  THEN RAISE EXCEPTION 'RELIEF_SCOPE_DIMENSION_CONFLICT'; END IF;
  v_payload:=pg_catalog.jsonb_build_object('plan_id',v_plan.id,
    'owning_unit_id',v_own,'financial_owner_group_id',v_owner.id,
    'participation_unit_id',v_part,'participation_mode',v_part_mode,
    'collection_unit_id',v_collect,'collection_mode',v_collect_mode,
    'review_unit_id',v_review,'payout_unit_id',v_payout,
    'reporting_unit_id',v_report,'reporting_mode',v_report_mode,
    'expected_version',v_expected);
  SELECT * INTO v_previous FROM public.relief_plan_scope_versions
    WHERE request_id=v_request;
  IF v_previous.id IS NOT NULL THEN
    IF v_previous.plan_id<>v_plan.id
       OR v_previous.authorized_by<>v_actor
       OR v_previous.command_payload<>v_payload
    THEN RAISE EXCEPTION 'RELIEF_SCOPE_IDENTITY_CONFLICT'; END IF;
    RETURN pg_catalog.jsonb_build_object('scope_id',v_previous.id,
      'version',v_previous.version,'decision','recovered');
  END IF;
  SELECT * INTO v_existing FROM public.relief_plan_scope_versions
    WHERE plan_id=v_plan.id AND effective_to IS NULL FOR UPDATE;
  IF coalesce(v_existing.version,0)<>v_expected
  THEN RAISE EXCEPTION 'RELIEF_SCOPE_VERSION_CONFLICT'; END IF;
  IF v_existing.id IS NOT NULL THEN
    IF v_now<=v_existing.effective_from THEN
      v_now:=v_existing.effective_from+interval '1 microsecond';
    END IF;
    UPDATE public.relief_plan_scope_versions SET effective_to=v_now
      WHERE id=v_existing.id;
  END IF;
  v_version:=v_expected+1;
  INSERT INTO public.relief_plan_scope_versions
    (plan_id,version,organization_id,owning_unit_id,
     financial_owner_group_id,participation_unit_id,participation_mode,
     collection_unit_id,collection_mode,review_unit_id,payout_unit_id,
     reporting_unit_id,reporting_mode,topology_version,
     effective_from,authorized_by,
     request_id,command_payload)
  VALUES (v_plan.id,v_version,v_owner.organization_id,v_own,v_owner.id,
    v_part,v_part_mode,v_collect,v_collect_mode,v_review,v_payout,
    v_report,v_report_mode,v_topology,v_now,v_actor,v_request,v_payload)
  RETURNING id INTO v_scope_id;
  INSERT INTO financial_core.relief_plan_scope_membership
    (scope_id,unit_id,purpose)
  SELECT v_scope_id,u.id,scope_kind.purpose
  FROM public.organization_units u
  CROSS JOIN (VALUES
    ('participation',v_part,v_part_mode),
    ('collection',v_collect,v_collect_mode),
    ('reporting',v_report,v_report_mode))
    scope_kind(purpose,root_id,scope_mode)
  WHERE u.organization_id=v_owner.organization_id
    AND u.archived_at IS NULL
    AND financial_core.relief_unit_in_scope(
      scope_kind.root_id,scope_kind.scope_mode,u.id);
  RETURN pg_catalog.jsonb_build_object('scope_id',v_scope_id,
    'version',v_version,'decision','posted');
END
$$;
REVOKE ALL ON FUNCTION public.configure_relief_plan_scope(jsonb)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.configure_relief_plan_scope(jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_relief_plan_scope(p_plan uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_scope public.relief_plan_scope_versions%ROWTYPE;
  v_actor uuid:=auth.uid(); v_organization uuid; v_current_topology bigint;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT g.organization_id INTO v_organization
  FROM public.relief_plans p JOIN public.groups g ON g.id=p.group_id
  WHERE p.id=p_plan;
  IF v_organization IS NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.memberships m
      JOIN public.groups g ON g.id=m.group_id
      WHERE g.organization_id=v_organization
        AND m.user_id=v_actor AND m.membership_status='active')
  THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO v_scope FROM public.relief_plan_scope_versions
    WHERE plan_id=p_plan AND effective_to IS NULL;
  IF v_scope.id IS NULL THEN RETURN NULL; END IF;
  SELECT topology_version INTO v_current_topology FROM public.organizations
    WHERE id=v_scope.organization_id;
  RETURN pg_catalog.jsonb_build_object('plan_id',v_scope.plan_id,
    'version',v_scope.version,'organization_id',v_scope.organization_id,
    'owning_unit_id',v_scope.owning_unit_id,
    'financial_owner_group_id',v_scope.financial_owner_group_id,
    'participation_unit_id',v_scope.participation_unit_id,
    'participation_mode',v_scope.participation_mode,
    'collection_unit_id',v_scope.collection_unit_id,
    'collection_mode',v_scope.collection_mode,
    'review_unit_id',v_scope.review_unit_id,
    'payout_unit_id',v_scope.payout_unit_id,
    'reporting_unit_id',v_scope.reporting_unit_id,
    'reporting_mode',v_scope.reporting_mode,
    'topology_version',v_scope.topology_version,
    'topology_stale',v_current_topology IS DISTINCT FROM v_scope.topology_version,
    'effective_from',v_scope.effective_from);
END
$$;
REVOKE ALL ON FUNCTION public.get_relief_plan_scope(uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_relief_plan_scope(uuid)
  TO authenticated;
COMMIT;
