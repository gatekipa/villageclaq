-- 00198: mirror has_group_permission's active-row selection when historical
-- duplicate membership rows exist in an imported compatibility baseline.

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

  SELECT m.id INTO v_membership_id
  FROM public.memberships m
  WHERE m.group_id = p_group_id
    AND m.user_id = v_actor
    AND m.membership_status = 'active'
  LIMIT 1
  FOR UPDATE;

  RETURN v_membership_id;
END;
$function$;

ALTER FUNCTION public.lock_active_group_membership(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.lock_active_group_membership(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lock_active_group_membership(uuid) TO service_role;
