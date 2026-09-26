-- 00193: expose authorized, replay-safe standing recalculation without restoring
-- direct membership standing writes or client-authored audit evidence.

CREATE OR REPLACE FUNCTION public.recalculate_standing_command(
  p_request_id uuid,
  p_group_id uuid,
  p_membership_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_member public.memberships;
  v_bound public.governance_command_receipts;
  v_payload jsonb;
  v_before_calculated public.membership_standing;
  v_before_effective public.membership_standing;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL OR p_request_id IS NULL OR p_group_id IS NULL OR p_membership_id IS NULL THEN
    RAISE EXCEPTION 'STANDING_RECALC_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT (
    public.has_group_permission(p_group_id, 'members.manage')
    OR public.has_group_permission(p_group_id, 'finances.manage')
  ) THEN
    RAISE EXCEPTION 'STANDING_RECALC_NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_member
  FROM public.memberships
  WHERE id = p_membership_id AND group_id = p_group_id
  FOR UPDATE;
  IF v_member.id IS NULL THEN
    RAISE EXCEPTION 'STANDING_MEMBER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_payload := jsonb_build_object(
    'group_id', p_group_id,
    'membership_id', p_membership_id
  );
  v_bound := public.bind_governance_command(
    p_request_id,
    p_group_id,
    'standing.recalculate',
    v_payload
  );
  IF v_bound.result IS NOT NULL THEN
    RETURN v_bound.result;
  END IF;

  v_before_calculated := v_member.calculated_standing;
  v_before_effective := v_member.standing;
  PERFORM public.recalculate_membership_standing(p_membership_id);

  SELECT jsonb_build_object(
    'request_id', p_request_id,
    'membership_id', m.id,
    'calculated_standing', m.calculated_standing,
    'effective_standing', m.standing,
    'changed', (
      m.calculated_standing IS DISTINCT FROM v_before_calculated
      OR m.standing IS DISTINCT FROM v_before_effective
    )
  ) INTO v_result
  FROM public.memberships m
  WHERE m.id = p_membership_id AND m.group_id = p_group_id;

  UPDATE public.governance_command_receipts
  SET result = v_result, completed_at = now()
  WHERE request_id = p_request_id;
  RETURN v_result;
END; $$;

REVOKE ALL ON FUNCTION public.recalculate_standing_command(uuid, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalculate_standing_command(uuid, uuid, uuid)
  TO authenticated;
