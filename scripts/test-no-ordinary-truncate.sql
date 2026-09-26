-- SEC-005: effective grant and direct-operation check on the real catalog.
BEGIN;
DO $test$
DECLARE v_count bigint;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p')
    AND (has_table_privilege('anon',c.oid,'TRUNCATE')
      OR has_table_privilege('authenticated',c.oid,'TRUNCATE'));
  IF v_count<>0 THEN RAISE EXCEPTION 'ORDINARY_TRUNCATE_GRANTS_REMAIN: %',v_count; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_default_acl d
    JOIN pg_roles owner ON owner.oid=d.defaclrole
    JOIN pg_namespace n ON n.oid=d.defaclnamespace
    CROSS JOIN LATERAL aclexplode(d.defaclacl) privilege
    LEFT JOIN pg_roles grantee ON grantee.oid=privilege.grantee
    WHERE owner.rolname='postgres' AND n.nspname='public'
      AND d.defaclobjtype='r' AND privilege.privilege_type='TRUNCATE'
      AND (privilege.grantee=0 OR grantee.rolname IN ('anon','authenticated'))
  ) THEN RAISE EXCEPTION 'POSTGRES_DEFAULT_TRUNCATE_REMAINS'; END IF;
END
$test$;
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    EXECUTE 'TRUNCATE TABLE public.faqs';
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'ORDINARY_TRUNCATE_EXECUTED'; END IF;
  RAISE NOTICE 'ORDINARY_TRUNCATE_DENIED: zero public table grants, safe postgres defaults, direct command denied';
END
$test$;
RESET ROLE;
ROLLBACK;
