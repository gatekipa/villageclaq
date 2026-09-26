-- 00195: hold the effective actor authorization through each authoritative
-- governance/standing command. This closes the lock-wait revocation window:
-- a command either observes the revocation before acquiring these locks and
-- denies, or commits before the revocation can take effect.

CREATE OR REPLACE FUNCTION public.lock_active_group_membership(p_group_id uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_membership_id uuid;
BEGIN
  IF v_actor IS NULL OR p_group_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT m.id
    INTO v_membership_id
  FROM public.memberships m
  WHERE m.group_id = p_group_id AND m.user_id = v_actor
    AND m.membership_status = 'active'
  LIMIT 1
  FOR UPDATE;

  IF v_membership_id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN v_membership_id;
END;
$function$;

ALTER FUNCTION public.lock_active_group_membership(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.lock_active_group_membership(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lock_active_group_membership(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.lock_and_check_group_permission(
  p_group_id uuid,
  p_permission text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_membership_id uuid;
  v_role text;
  v_assignment_count integer;
  v_has_permission boolean;
BEGIN
  v_membership_id := public.lock_active_group_membership(p_group_id);
  IF v_membership_id IS NULL OR nullif(btrim(p_permission), '') IS NULL THEN
    RETURN false;
  END IF;

  SELECT m.role::text INTO v_role
  FROM public.memberships m
  WHERE m.id = v_membership_id;

  -- Lock every row that can remove or narrow this actor's effective grant.
  -- The membership lock also blocks a concurrent assignment insert through
  -- its membership FK, which matters for the admin-with-no-assignments rule.
  PERFORM pa.id
  FROM public.position_assignments pa
  WHERE pa.membership_id = v_membership_id AND pa.ended_at IS NULL
  FOR UPDATE OF pa;

  PERFORM gp.id
  FROM public.group_positions gp
  JOIN public.position_assignments pa ON pa.position_id = gp.id
  WHERE pa.membership_id = v_membership_id AND pa.ended_at IS NULL
  FOR UPDATE OF gp;

  PERFORM pp.id
  FROM public.position_permissions pp
  JOIN public.position_assignments pa ON pa.position_id = pp.position_id
  WHERE pa.membership_id = v_membership_id AND pa.ended_at IS NULL
  FOR UPDATE OF pp;

  IF v_role = 'owner' THEN
    RETURN true;
  END IF;

  SELECT count(*) INTO v_assignment_count
  FROM public.position_assignments pa
  WHERE pa.membership_id = v_membership_id AND pa.ended_at IS NULL;

  IF v_role = 'admin' AND v_assignment_count = 0 THEN
    RETURN true;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.position_assignments pa
    JOIN public.position_permissions pp ON pp.position_id = pa.position_id
    JOIN public.group_positions gp
      ON gp.id = pa.position_id AND gp.group_id = p_group_id
    WHERE pa.membership_id = v_membership_id
      AND pa.ended_at IS NULL
      AND pp.permission = p_permission
  ) INTO v_has_permission;
  RETURN v_has_permission;
END;
$function$;

ALTER FUNCTION public.lock_and_check_group_permission(uuid,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.lock_and_check_group_permission(uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lock_and_check_group_permission(uuid,text)
  TO service_role;

-- Keep the proven command implementations intact behind wrappers. The wrapper
-- owns and holds authorization locks before any implementation can wait on a
-- receipt or domain row, and replays must pass the same current authorization.
ALTER FUNCTION public.execute_minutes_command(uuid,jsonb)
  RENAME TO execute_minutes_command_impl_00192;
REVOKE ALL ON FUNCTION public.execute_minutes_command_impl_00192(uuid,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_minutes_command_impl_00192(uuid,jsonb)
  TO service_role;

CREATE FUNCTION public.execute_minutes_command(p_request_id uuid,p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_group uuid;
BEGIN
  IF jsonb_typeof(p_command) <> 'object' THEN
    RAISE EXCEPTION 'MINUTES_COMMAND_INVALID' USING ERRCODE='22023';
  END IF;
  v_group := nullif(p_command->>'group_id','')::uuid;
  IF NOT public.lock_and_check_group_permission(v_group,'minutes.manage') THEN
    RAISE EXCEPTION 'MINUTES_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  RETURN public.execute_minutes_command_impl_00192(p_request_id,p_command);
END;
$function$;
REVOKE ALL ON FUNCTION public.execute_minutes_command(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.execute_minutes_command(uuid,jsonb) TO authenticated;

ALTER FUNCTION public.execute_governing_document_command(uuid,jsonb)
  RENAME TO execute_governing_document_command_impl_00188;
REVOKE ALL ON FUNCTION public.execute_governing_document_command_impl_00188(uuid,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_governing_document_command_impl_00188(uuid,jsonb)
  TO service_role;

CREATE FUNCTION public.execute_governing_document_command(p_request_id uuid,p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_group uuid; v_action text; v_membership uuid;
BEGIN
  IF jsonb_typeof(p_command) <> 'object' THEN
    RAISE EXCEPTION 'DOCUMENT_COMMAND_INVALID' USING ERRCODE='22023';
  END IF;
  v_group := nullif(p_command->>'group_id','')::uuid;
  v_action := p_command->>'action';
  v_membership := public.lock_active_group_membership(v_group);
  IF v_membership IS NULL THEN
    RAISE EXCEPTION 'DOCUMENT_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  IF v_action NOT IN ('acknowledge','propose_amendment')
     AND NOT (
       public.lock_and_check_group_permission(v_group,'documents.manage')
       OR public.lock_and_check_group_permission(v_group,'governance.manage')
     ) THEN
    RAISE EXCEPTION 'DOCUMENT_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  RETURN public.execute_governing_document_command_impl_00188(p_request_id,p_command);
END;
$function$;
REVOKE ALL ON FUNCTION public.execute_governing_document_command(uuid,jsonb)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.execute_governing_document_command(uuid,jsonb)
  TO authenticated;

ALTER FUNCTION public.execute_standing_decision(uuid,jsonb)
  RENAME TO execute_standing_decision_impl_00189;
REVOKE ALL ON FUNCTION public.execute_standing_decision_impl_00189(uuid,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_standing_decision_impl_00189(uuid,jsonb)
  TO service_role;

CREATE FUNCTION public.execute_standing_decision(p_request_id uuid,p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_group uuid;
BEGIN
  IF jsonb_typeof(p_command) <> 'object' THEN
    RAISE EXCEPTION 'STANDING_COMMAND_INVALID' USING ERRCODE='22023';
  END IF;
  v_group := nullif(p_command->>'group_id','')::uuid;
  IF NOT public.lock_and_check_group_permission(v_group,'members.manage') THEN
    RAISE EXCEPTION 'STANDING_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  RETURN public.execute_standing_decision_impl_00189(p_request_id,p_command);
END;
$function$;
REVOKE ALL ON FUNCTION public.execute_standing_decision(uuid,jsonb)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.execute_standing_decision(uuid,jsonb)
  TO authenticated;

ALTER FUNCTION public.recalculate_standing_command(uuid,uuid,uuid)
  RENAME TO recalculate_standing_command_impl_00193;
REVOKE ALL ON FUNCTION public.recalculate_standing_command_impl_00193(uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_standing_command_impl_00193(uuid,uuid,uuid)
  TO service_role;

CREATE FUNCTION public.recalculate_standing_command(
  p_request_id uuid,
  p_group_id uuid,
  p_membership_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
BEGIN
  IF NOT (
    public.lock_and_check_group_permission(p_group_id,'members.manage')
    OR public.lock_and_check_group_permission(p_group_id,'finances.manage')
  ) THEN
    RAISE EXCEPTION 'STANDING_RECALC_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  RETURN public.recalculate_standing_command_impl_00193(
    p_request_id,p_group_id,p_membership_id
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.recalculate_standing_command(uuid,uuid,uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.recalculate_standing_command(uuid,uuid,uuid)
  TO authenticated;
