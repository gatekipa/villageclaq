-- Restore the public read-only verifier required by the mounted account-
-- activation route. The S0/M2 compatibility baseline contains the token table
-- and secure claim writer but not this legacy prerequisite function.

BEGIN;

CREATE OR REPLACE FUNCTION public.verify_claim_token(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_result json;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN
    RETURN pg_catalog.json_build_object('valid',false);
  END IF;

  SELECT pg_catalog.json_build_object(
    'valid',true,
    'membership_id',t.membership_id,
    'member_name',m.display_name,
    'group_name',g.name,
    'group_id',g.id,
    'expires_at',t.expires_at
  )
  INTO v_result
  FROM public.proxy_claim_tokens t
  JOIN public.memberships m ON m.id=t.membership_id
  JOIN public.groups g ON g.id=m.group_id
  WHERE t.token=p_token
    AND t.claimed_at IS NULL
    AND t.expires_at>pg_catalog.now()
    AND m.user_id IS NULL
    AND m.is_proxy IS TRUE
    AND m.membership_status='active'
    AND g.status='active'
    AND g.is_active IS TRUE
  LIMIT 1;

  RETURN pg_catalog.coalesce(
    v_result,
    pg_catalog.json_build_object('valid',false)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_claim_token(text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.verify_claim_token(text) TO anon,authenticated;

COMMIT;
