-- M6 Slice 2: Assembly Lifecycle & Quorum Engine RPCs

BEGIN;

-- 1. Quorum Snapshots & Assembly Roll-Call Schema
CREATE TABLE IF NOT EXISTS public.assembly_quorum_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id uuid NOT NULL REFERENCES public.assemblies(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  eligible_member_count integer NOT NULL CHECK (eligible_member_count > 0),
  quorum_threshold_percent numeric(5,2) NOT NULL DEFAULT 50.00 CHECK (quorum_threshold_percent > 0 AND quorum_threshold_percent <= 100.00),
  required_quorum_count integer NOT NULL CHECK (required_quorum_count > 0),
  snapshotted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assembly_id)
);

CREATE TABLE IF NOT EXISTS public.assembly_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id uuid NOT NULL REFERENCES public.assemblies(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES public.memberships(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('present', 'excused', 'absent', 'proxy')),
  proxy_membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL,
  checked_in_at timestamptz DEFAULT now(),
  recorded_by uuid REFERENCES public.memberships(id) ON DELETE SET NULL,
  UNIQUE (assembly_id, membership_id)
);

ALTER TABLE public.assembly_quorum_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assembly_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Quorum snapshots visible to group members" ON public.assembly_quorum_snapshots FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.group_id = assembly_quorum_snapshots.group_id
        AND m.user_id = auth.uid()
        AND m.membership_status IN ('active', 'suspended')
    )
  );

CREATE POLICY "Attendance visible to group members" ON public.assembly_attendance FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assemblies a JOIN public.memberships m ON a.group_id = m.group_id
      WHERE a.id = assembly_attendance.assembly_id
        AND m.user_id = auth.uid()
        AND m.membership_status IN ('active', 'suspended')
    )
  );

-- Only managed via RPCs, so no direct INSERT/UPDATE/DELETE policies needed for authenticated role

CREATE OR REPLACE FUNCTION public.check_assembly_attendance_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_assembly_status text;
  v_assembly_id uuid;
BEGIN
  v_assembly_id := COALESCE(NEW.assembly_id, OLD.assembly_id);
  SELECT status INTO v_assembly_status FROM public.assemblies WHERE id = v_assembly_id;
  IF v_assembly_status = 'adjourned' THEN
    RAISE EXCEPTION 'ATTENDANCE_IMMUTABLE_AFTER_ADJOURNMENT' USING ERRCODE = '23514';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_immutability_insert ON public.assembly_attendance;
CREATE TRIGGER trg_attendance_immutability_insert
  BEFORE INSERT ON public.assembly_attendance
  FOR EACH ROW EXECUTE FUNCTION public.check_assembly_attendance_immutability();

DROP TRIGGER IF EXISTS trg_attendance_immutability_update ON public.assembly_attendance;
CREATE TRIGGER trg_attendance_immutability_update
  BEFORE UPDATE ON public.assembly_attendance
  FOR EACH ROW EXECUTE FUNCTION public.check_assembly_attendance_immutability();

DROP TRIGGER IF EXISTS trg_attendance_immutability_delete ON public.assembly_attendance;
CREATE TRIGGER trg_attendance_immutability_delete
  BEFORE DELETE ON public.assembly_attendance
  FOR EACH ROW EXECUTE FUNCTION public.check_assembly_attendance_immutability();


-- 2. Canonical Lifecycle RPCs

CREATE OR REPLACE FUNCTION public.call_assembly_to_order(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_group_id uuid := (p_command->>'groupId')::uuid;
  v_assembly_id uuid := (p_command->>'assemblyId')::uuid;
  v_threshold numeric := COALESCE((p_command->>'quorumThresholdPercent')::numeric, 50.00);
  v_assembly_status text;
  v_eligible_count integer;
  v_required_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required');
  END IF;

  IF NOT (public.has_group_permission(v_group_id, 'governance.manage') OR 
          EXISTS (SELECT 1 FROM public.memberships WHERE group_id = v_group_id AND user_id = v_user_id AND role = 'owner')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  -- Lock assembly row
  SELECT status INTO v_assembly_status FROM public.assemblies WHERE id = v_assembly_id AND group_id = v_group_id FOR UPDATE;
  
  IF v_assembly_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'assembly_not_found');
  END IF;
  IF v_assembly_status <> 'draft' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'assembly_already_called_to_order');
  END IF;

  IF v_threshold <= 0 OR v_threshold > 100 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_threshold');
  END IF;

  -- Compute exact eligible active member count (excludes suspended, exited, banned, archived)
  SELECT count(*) INTO v_eligible_count
  FROM public.memberships
  WHERE group_id = v_group_id AND membership_status = 'active';

  IF v_eligible_count = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_eligible_members');
  END IF;

  v_required_count := CEIL(v_eligible_count * (v_threshold / 100.0));

  INSERT INTO public.assembly_quorum_snapshots (assembly_id, group_id, eligible_member_count, quorum_threshold_percent, required_quorum_count)
  VALUES (v_assembly_id, v_group_id, v_eligible_count, v_threshold, v_required_count);

  UPDATE public.assemblies
  SET status = 'called_to_order', convened_at = now(), updated_at = now()
  WHERE id = v_assembly_id;

  RETURN jsonb_build_object(
    'ok', true,
    'eligible_count', v_eligible_count,
    'required_quorum', v_required_count
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.call_assembly_to_order(jsonb) TO authenticated;


CREATE OR REPLACE FUNCTION public.record_assembly_roll_call(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_group_id uuid := (p_command->>'groupId')::uuid;
  v_assembly_id uuid := (p_command->>'assemblyId')::uuid;
  v_records jsonb := p_command->'attendanceRecords';
  v_assembly_status text;
  v_required_quorum integer;
  v_present_count integer;
  v_quorum_achieved boolean;
  v_recorder_id uuid;
  v_rec jsonb;
  v_mem_id uuid;
  v_mem_status text;
  v_proxy_id uuid;
  v_status text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required');
  END IF;

  IF NOT (public.has_group_permission(v_group_id, 'governance.manage') OR 
          EXISTS (SELECT 1 FROM public.memberships WHERE group_id = v_group_id AND user_id = v_user_id AND role = 'owner')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT id INTO v_recorder_id FROM public.memberships WHERE group_id = v_group_id AND user_id = v_user_id LIMIT 1;

  SELECT status INTO v_assembly_status FROM public.assemblies WHERE id = v_assembly_id AND group_id = v_group_id FOR UPDATE;
  IF v_assembly_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'assembly_not_found');
  END IF;
  IF v_assembly_status NOT IN ('called_to_order', 'in_session') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'assembly_not_in_session');
  END IF;

  SELECT required_quorum_count INTO v_required_quorum FROM public.assembly_quorum_snapshots WHERE assembly_id = v_assembly_id;

  FOR v_rec IN SELECT * FROM jsonb_array_elements(v_records)
  LOOP
    v_mem_id := (v_rec->>'membershipId')::uuid;
    v_status := v_rec->>'status';
    v_proxy_id := (v_rec->>'proxyMembershipId')::uuid;

    IF v_status NOT IN ('present', 'excused', 'absent', 'proxy') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
    END IF;

    -- Validate active member
    IF NOT EXISTS (SELECT 1 FROM public.memberships WHERE id = v_mem_id AND group_id = v_group_id AND membership_status = 'active') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'member_not_eligible', 'membershipId', v_mem_id);
    END IF;

    INSERT INTO public.assembly_attendance (assembly_id, membership_id, status, proxy_membership_id, recorded_by, checked_in_at)
    VALUES (v_assembly_id, v_mem_id, v_status, v_proxy_id, v_recorder_id, now())
    ON CONFLICT (assembly_id, membership_id) 
    DO UPDATE SET 
      status = EXCLUDED.status, 
      proxy_membership_id = EXCLUDED.proxy_membership_id, 
      recorded_by = EXCLUDED.recorded_by;
  END LOOP;

  -- Compute live quorum
  SELECT count(*) INTO v_present_count
  FROM public.assembly_attendance
  WHERE assembly_id = v_assembly_id AND status IN ('present', 'proxy');

  v_quorum_achieved := v_present_count >= COALESCE(v_required_quorum, 0);

  IF v_quorum_achieved AND v_assembly_status = 'called_to_order' THEN
    UPDATE public.assemblies SET status = 'in_session', updated_at = now() WHERE id = v_assembly_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'present_count', v_present_count,
    'required_quorum', v_required_quorum,
    'quorum_achieved', v_quorum_achieved
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_assembly_roll_call(jsonb) TO authenticated;


CREATE OR REPLACE FUNCTION public.adjourn_assembly(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_group_id uuid := (p_command->>'groupId')::uuid;
  v_assembly_id uuid := (p_command->>'assemblyId')::uuid;
  v_assembly_status text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required');
  END IF;

  IF NOT (public.has_group_permission(v_group_id, 'governance.manage') OR 
          EXISTS (SELECT 1 FROM public.memberships WHERE group_id = v_group_id AND user_id = v_user_id AND role = 'owner')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT status INTO v_assembly_status FROM public.assemblies WHERE id = v_assembly_id AND group_id = v_group_id FOR UPDATE;
  
  IF v_assembly_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'assembly_not_found');
  END IF;
  IF v_assembly_status NOT IN ('called_to_order', 'in_session') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'assembly_not_in_session');
  END IF;

  UPDATE public.assemblies
  SET status = 'adjourned', adjourned_at = now(), updated_at = now()
  WHERE id = v_assembly_id;

  RETURN jsonb_build_object('ok', true, 'status', 'adjourned');
END;
$$;
GRANT EXECUTE ON FUNCTION public.adjourn_assembly(jsonb) TO authenticated;


CREATE OR REPLACE FUNCTION public.tally_resolution_vote(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_group_id uuid := (p_command->>'groupId')::uuid;
  v_resolution_id uuid := (p_command->>'resolutionId')::uuid;
  v_for integer := COALESCE((p_command->>'votesFor')::integer, 0);
  v_against integer := COALESCE((p_command->>'votesAgainst')::integer, 0);
  v_abstain integer := COALESCE((p_command->>'votesAbstain')::integer, 0);
  v_rule text;
  v_status text;
  v_adopted boolean := false;
  v_total integer := v_for + v_against; -- Customarily abstentions don't count towards the denominator in simple majorities, but we compare vs for+against.
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required');
  END IF;

  IF NOT (public.has_group_permission(v_group_id, 'governance.manage') OR 
          EXISTS (SELECT 1 FROM public.memberships WHERE group_id = v_group_id AND user_id = v_user_id AND role = 'owner')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT threshold_rule, status INTO v_rule, v_status FROM public.resolutions WHERE id = v_resolution_id AND group_id = v_group_id FOR UPDATE;

  IF v_rule IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'resolution_not_found');
  END IF;
  IF v_status = 'withdrawn' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'resolution_withdrawn');
  END IF;

  IF v_rule = 'simple_majority' THEN
    v_adopted := v_for > v_against;
  ELSIF v_rule = 'two_thirds' THEN
    v_adopted := v_for >= ((2.0 / 3.0) * v_total) AND v_for > 0;
  ELSIF v_rule = 'three_fourths' THEN
    v_adopted := v_for >= ((3.0 / 4.0) * v_total) AND v_for > 0;
  ELSIF v_rule = 'unanimous' THEN
    v_adopted := (v_against = 0) AND (v_for > 0);
  END IF;

  UPDATE public.resolutions
  SET votes_for = v_for, votes_against = v_against, votes_abstain = v_abstain,
      status = CASE WHEN v_adopted THEN 'adopted' ELSE 'rejected' END,
      adopted_at = CASE WHEN v_adopted THEN now() ELSE NULL END,
      updated_at = now()
  WHERE id = v_resolution_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', CASE WHEN v_adopted THEN 'adopted' ELSE 'rejected' END,
    'votes_for', v_for,
    'votes_against', v_against,
    'votes_abstain', v_abstain
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.tally_resolution_vote(jsonb) TO authenticated;

COMMIT;
