-- S0-013: production S0/M2 exposes uuid-ossp v5 in extensions, while the
-- frozen F3 00122 migration calls public.uuid_generate_v5. Install only the
-- deterministic adapter needed by that immutable migration.
DO $pre$
BEGIN
  IF to_regprocedure('extensions.uuid_generate_v5(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'S0_UUID_V5_ABORT: extensions.uuid_generate_v5 missing';
  END IF;
  IF to_regprocedure('public.uuid_generate_v5(uuid,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'S0_UUID_V5_ABORT: public.uuid_generate_v5 already exists';
  END IF;
  IF to_regprocedure('financial_core.f3_correction_child_id(uuid,uuid,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'S0_UUID_V5_ABORT: 00122 was already applied';
  END IF;
END
$pre$;

CREATE FUNCTION public.uuid_generate_v5(namespace uuid, name text)
RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT extensions.uuid_generate_v5(namespace, name);
$$;
REVOKE ALL ON FUNCTION public.uuid_generate_v5(uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.uuid_generate_v5(uuid,text) TO postgres;
