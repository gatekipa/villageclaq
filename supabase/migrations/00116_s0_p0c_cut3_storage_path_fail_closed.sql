-- S0 Cut 3 — P0-C storage path fail-closed boundary
--
-- Planning contract tip (must be ancestor): b85d4164b9b10c87597e34de74b527a12bc571af
-- File: 00116_s0_p0c_cut3_storage_path_fail_closed.sql
-- PRODUCTION APPLY NOT AUTHORIZED from this PR.
-- Do not apply to llbnliixczcqfftxpsmb. Do not merge. Do not deploy.
-- Phase A (future, separately authorized): apply this exact file while the
-- production U02 caller still emits UUID-first. APP-FIRST is FORBIDDEN.
-- Phase B (future, after Phase A PASS): deploy U02 finance-record caller only.
--
-- Single transaction. Any CUT3_ABORT rolls back. COMMIT only if postconditions pass.
-- Does not edit 00001–00115. Does not create 00117. Does not touch Cut 2 /
-- notifications_queue. Does not DROP v1/v2. Does not alter avatars.
--
-- Storage schema: production apply (future Phase A only) is Dashboard SQL Editor
-- as postgres / supabase_admin — same class as 00112. Do not use MCP
-- apply_migration against production. Disposable qualification runs as
-- postgres (superuser) on a local database; storage.objects DDL/policy
-- replace requires that elevated role.

BEGIN;

DO $cut3_pre$
DECLARE
  v_found boolean := false;
  v_ns text;
  v_sql text;
  v_md5 text;
  v_owner name;
  v_definer boolean;
  v_cfg text[];
  v_using text;
  v_check text;
  v_cmd char;
  v_perm boolean;
  v_roles text[];
  v_n int;
  v_attnotnull boolean;
  v_typname text;
  r record;
  v_expected_using text;
  v_expected_check text;
  v_grant_n int;
BEGIN
  -- 1. Cut 2 exact pair (not count-only)
  FOR v_ns IN
    SELECT n.nspname
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relname = 'schema_migrations'
       AND c.relkind IN ('r', 'p')
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = v_ns AND table_name = 'schema_migrations' AND column_name = 'name'
    ) THEN
      v_sql := format(
        'SELECT EXISTS (SELECT 1 FROM %I.schema_migrations WHERE version::text = %L AND name = %L)',
        v_ns,
        '20260912033612',
        's0_p0b_cut2_notification_queue'
      );
      BEGIN
        EXECUTE v_sql INTO v_found;
      EXCEPTION WHEN OTHERS THEN
        v_found := false;
      END;
      EXIT WHEN v_found;
    END IF;
  END LOOP;
  IF NOT v_found THEN
    RAISE EXCEPTION 'CUT3_ABORT: Cut 2 pin missing or drifted (expected version=20260912033612 name=s0_p0b_cut2_notification_queue)';
  END IF;

  -- 2. Private buckets
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'receipts' AND public IS FALSE
  ) THEN
    RAISE EXCEPTION 'CUT3_ABORT: receipts bucket missing or public<>false';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'group-documents' AND public IS FALSE
  ) THEN
    RAISE EXCEPTION 'CUT3_ABORT: group-documents bucket missing or public<>false';
  END IF;

  -- 3. Exact eight live policies
  FOR r IN
    SELECT * FROM (VALUES
      ('gdocs_select_group'::name, 'r'::char,
       '((bucket_id = ''group-documents''::text) AND ((storage_path_group_id_v2(name) IS NULL) OR is_group_member(storage_path_group_id_v2(name))))'::text,
       NULL::text),
      ('gdocs_insert_group', 'a',
       NULL,
       '((bucket_id = ''group-documents''::text) AND (((storage_path_group_id(name) IS NOT NULL) AND is_group_member(storage_path_group_id(name))) OR (storage_path_group_id(name) IS NULL)))'),
      ('gdocs_update_group', 'w',
       '((bucket_id = ''group-documents''::text) AND ((storage_path_group_id(name) IS NULL) OR is_group_member(storage_path_group_id(name))))',
       NULL),
      ('gdocs_delete_group', 'd',
       '((bucket_id = ''group-documents''::text) AND ((storage_path_group_id(name) IS NULL) OR is_group_admin(storage_path_group_id(name))))',
       NULL),
      ('receipts_select_group', 'r',
       '((bucket_id = ''receipts''::text) AND ((storage_path_group_id_v2(name) IS NULL) OR is_group_member(storage_path_group_id_v2(name))))',
       NULL),
      ('receipts_insert_group', 'a',
       NULL,
       '((bucket_id = ''receipts''::text) AND (((storage_path_group_id(name) IS NOT NULL) AND is_group_member(storage_path_group_id(name))) OR (storage_path_group_id(name) IS NULL)))'),
      ('receipts_update_group', 'w',
       '((bucket_id = ''receipts''::text) AND ((storage_path_group_id(name) IS NULL) OR is_group_member(storage_path_group_id(name))))',
       NULL),
      ('receipts_delete_group', 'd',
       '((bucket_id = ''receipts''::text) AND ((storage_path_group_id(name) IS NULL) OR is_group_admin(storage_path_group_id(name))))',
       NULL)
    ) AS t(polname, cmd, using_expr, check_expr)
  LOOP
    SELECT p.polcmd, p.polpermissive,
           ARRAY(SELECT rolname FROM pg_roles WHERE oid = ANY(p.polroles) ORDER BY 1),
           pg_get_expr(p.polqual, p.polrelid),
           pg_get_expr(p.polwithcheck, p.polrelid)
      INTO v_cmd, v_perm, v_roles, v_using, v_check
      FROM pg_policy p
     WHERE p.polrelid = 'storage.objects'::regclass
       AND p.polname = r.polname;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CUT3_ABORT: missing policy %', r.polname;
    END IF;
    IF v_cmd IS DISTINCT FROM r.cmd THEN
      RAISE EXCEPTION 'CUT3_ABORT: policy % cmd drift', r.polname;
    END IF;
    IF v_perm IS NOT TRUE THEN
      RAISE EXCEPTION 'CUT3_ABORT: policy % is not PERMISSIVE', r.polname;
    END IF;
    IF v_roles IS DISTINCT FROM ARRAY['authenticated']::text[] THEN
      RAISE EXCEPTION 'CUT3_ABORT: policy % roles drift: %', r.polname, v_roles;
    END IF;
    IF v_using IS DISTINCT FROM r.using_expr THEN
      RAISE EXCEPTION 'CUT3_ABORT: policy % using_expr drift: %', r.polname, v_using;
    END IF;
    IF v_check IS DISTINCT FROM r.check_expr THEN
      RAISE EXCEPTION 'CUT3_ABORT: policy % with_check_expr drift: %', r.polname, v_check;
    END IF;
  END LOOP;

  -- 4. v1 / v2 fingerprints — exact live abort hashes ONLY.
  -- Alternate disposable serializations (5b535da3… / 756c2202…) are NOT accepted.
  -- Disposable fixtures must reproduce these exact md5(pg_get_functiondef) values
  -- before this unmodified file is applied.
  --
  -- proconfig normalization (exact; no COALESCE of NULL↔empty):
  --   * NULL                 = no SET clause (v1, v2, is_group_member)
  --   * ARRAY['search_path=""'] = SET search_path TO '' (15-char element)
  --   * ARRAY[]::text[] and ARRAY['search_path='] are distinct and rejected
  SELECT md5(pg_get_functiondef(p.oid)), pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig
    INTO v_md5, v_owner, v_definer, v_cfg
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'storage_path_group_id'
     AND pg_get_function_identity_arguments(p.oid) = 'p_name text';
  IF v_md5 IS DISTINCT FROM 'fb6155e6e3c996ad857208f717d981a8' THEN
    RAISE EXCEPTION 'CUT3_ABORT: storage_path_group_id md5 drift: %', v_md5;
  END IF;
  IF v_owner IS DISTINCT FROM 'postgres' OR v_definer IS NOT FALSE OR v_cfg IS NOT NULL THEN
    RAISE EXCEPTION 'CUT3_ABORT: storage_path_group_id owner/definer/proconfig drift';
  END IF;

  SELECT md5(pg_get_functiondef(p.oid)), pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig
    INTO v_md5, v_owner, v_definer, v_cfg
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'storage_path_group_id_v2'
     AND pg_get_function_identity_arguments(p.oid) = 'p_name text';
  IF v_md5 IS DISTINCT FROM '585e7bd017f5623aacf87407b1b11524' THEN
    RAISE EXCEPTION 'CUT3_ABORT: storage_path_group_id_v2 md5 drift: %', v_md5;
  END IF;
  IF v_owner IS DISTINCT FROM 'postgres' OR v_definer IS NOT FALSE OR v_cfg IS NOT NULL THEN
    RAISE EXCEPTION 'CUT3_ABORT: storage_path_group_id_v2 owner/definer/proconfig drift';
  END IF;

  -- 5. Auth helpers
  SELECT md5(pg_get_functiondef(p.oid)), pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig
    INTO v_md5, v_owner, v_definer, v_cfg
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'is_active_group_member'
     AND pg_get_function_identity_arguments(p.oid) = 'gid uuid';
  IF v_md5 IS DISTINCT FROM '26c12399120587df3d066dd7819bdf5e' THEN
    RAISE EXCEPTION 'CUT3_ABORT: is_active_group_member md5 drift: %', v_md5;
  END IF;
  IF v_owner IS DISTINCT FROM 'postgres' OR v_definer IS NOT TRUE
     OR v_cfg IS DISTINCT FROM ARRAY['search_path=""']::text[] THEN
    RAISE EXCEPTION 'CUT3_ABORT: is_active_group_member owner/definer/proconfig drift';
  END IF;

  SELECT md5(pg_get_functiondef(p.oid)), pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig
    INTO v_md5, v_owner, v_definer, v_cfg
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'is_group_member'
     AND pg_get_function_identity_arguments(p.oid) = 'gid uuid, uid uuid';
  IF v_md5 IS DISTINCT FROM '4b1bbd54719c129ef12f0ebc53463686' THEN
    RAISE EXCEPTION 'CUT3_ABORT: is_group_member md5 drift: %', v_md5;
  END IF;
  IF v_owner IS DISTINCT FROM 'postgres' OR v_definer IS NOT TRUE OR v_cfg IS NOT NULL THEN
    RAISE EXCEPTION 'CUT3_ABORT: is_group_member owner/definer/proconfig drift';
  END IF;

  SELECT md5(pg_get_functiondef(p.oid)), pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig
    INTO v_md5, v_owner, v_definer, v_cfg
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'is_group_admin'
     AND pg_get_function_identity_arguments(p.oid) = 'gid uuid, uid uuid';
  IF v_md5 IS DISTINCT FROM 'd4090a33af3a873873223416c204c913' THEN
    RAISE EXCEPTION 'CUT3_ABORT: is_group_admin md5 drift: %', v_md5;
  END IF;
  IF v_owner IS DISTINCT FROM 'postgres' OR v_definer IS NOT TRUE
     OR v_cfg IS DISTINCT FROM ARRAY['search_path=""']::text[] THEN
    RAISE EXCEPTION 'CUT3_ABORT: is_group_admin owner/definer/proconfig drift';
  END IF;

  SELECT md5(pg_get_functiondef(p.oid)), pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig
    INTO v_md5, v_owner, v_definer, v_cfg
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'has_group_permission'
     AND pg_get_function_identity_arguments(p.oid) = 'gid uuid, perm_key text, uid uuid';
  IF v_md5 IS DISTINCT FROM '695368464e97297fbf0f90ce7345162f' THEN
    RAISE EXCEPTION 'CUT3_ABORT: has_group_permission md5 drift: %', v_md5;
  END IF;
  IF v_owner IS DISTINCT FROM 'postgres' OR v_definer IS NOT TRUE
     OR v_cfg IS DISTINCT FROM ARRAY['search_path=""']::text[] THEN
    RAISE EXCEPTION 'CUT3_ABORT: has_group_permission owner/definer/proconfig drift';
  END IF;

  -- 5b. Exact EXECUTE ACL set equality (PUBLIC/anon/authenticated/service_role/postgres).
  -- Normalization: aclexplode(COALESCE(proacl, acldefault('f', proowner)))
  -- → (proname, COALESCE(rolname,'PUBLIC'), privilege_type) compared both EXCEPT directions.
  IF EXISTS (
    WITH expected(fn, role_name, privilege) AS (
      VALUES
        ('storage_path_group_id', 'PUBLIC', 'EXECUTE'),
        ('storage_path_group_id', 'postgres', 'EXECUTE'),
        ('storage_path_group_id', 'anon', 'EXECUTE'),
        ('storage_path_group_id', 'authenticated', 'EXECUTE'),
        ('storage_path_group_id', 'service_role', 'EXECUTE'),
        ('storage_path_group_id_v2', 'PUBLIC', 'EXECUTE'),
        ('storage_path_group_id_v2', 'postgres', 'EXECUTE'),
        ('storage_path_group_id_v2', 'anon', 'EXECUTE'),
        ('storage_path_group_id_v2', 'authenticated', 'EXECUTE'),
        ('storage_path_group_id_v2', 'service_role', 'EXECUTE'),
        ('is_group_member', 'PUBLIC', 'EXECUTE'),
        ('is_group_member', 'postgres', 'EXECUTE'),
        ('is_group_member', 'anon', 'EXECUTE'),
        ('is_group_member', 'authenticated', 'EXECUTE'),
        ('is_group_member', 'service_role', 'EXECUTE'),
        ('is_active_group_member', 'postgres', 'EXECUTE'),
        ('is_active_group_member', 'authenticated', 'EXECUTE'),
        ('is_active_group_member', 'service_role', 'EXECUTE'),
        ('is_group_admin', 'postgres', 'EXECUTE'),
        ('is_group_admin', 'authenticated', 'EXECUTE'),
        ('is_group_admin', 'service_role', 'EXECUTE'),
        ('has_group_permission', 'postgres', 'EXECUTE'),
        ('has_group_permission', 'authenticated', 'EXECUTE'),
        ('has_group_permission', 'service_role', 'EXECUTE')
    ),
    actual(fn, role_name, privilege) AS (
      SELECT p.proname,
             COALESCE(gr.rolname, 'PUBLIC'),
             a.privilege_type
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS a
        LEFT JOIN pg_roles gr ON gr.oid = a.grantee
       WHERE n.nspname = 'public'
         AND (
           (p.proname = 'storage_path_group_id' AND pg_get_function_identity_arguments(p.oid) = 'p_name text')
           OR (p.proname = 'storage_path_group_id_v2' AND pg_get_function_identity_arguments(p.oid) = 'p_name text')
           OR (p.proname = 'is_active_group_member' AND pg_get_function_identity_arguments(p.oid) = 'gid uuid')
           OR (p.proname = 'is_group_member' AND pg_get_function_identity_arguments(p.oid) = 'gid uuid, uid uuid')
           OR (p.proname = 'is_group_admin' AND pg_get_function_identity_arguments(p.oid) = 'gid uuid, uid uuid')
           OR (p.proname = 'has_group_permission' AND pg_get_function_identity_arguments(p.oid) = 'gid uuid, perm_key text, uid uuid')
         )
         AND a.privilege_type = 'EXECUTE'
    )
    SELECT 1 FROM (
      SELECT * FROM actual EXCEPT SELECT * FROM expected
      UNION ALL
      SELECT * FROM expected EXCEPT SELECT * FROM actual
    ) drift
  ) THEN
    RAISE EXCEPTION 'CUT3_ABORT: live helper EXECUTE ACL set mismatch';
  END IF;

  -- 6. New helpers must be absent under ANY signature (not only text,text).
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('storage_group_documents_authorized', 'storage_receipts_authorized')
  ) THEN
    RAISE EXCEPTION 'CUT3_ABORT: unexpected existing overload of storage_*_authorized';
  END IF;

  -- 7. projects.id + projects.group_id uuid NOT NULL
  SELECT a.attnotnull, t.typname
    INTO v_attnotnull, v_typname
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_type t ON t.oid = a.atttypid
   WHERE n.nspname = 'public' AND c.relname = 'projects' AND a.attname = 'id' AND a.attnum > 0 AND NOT a.attisdropped;
  IF v_typname IS DISTINCT FROM 'uuid' OR v_attnotnull IS NOT TRUE THEN
    RAISE EXCEPTION 'CUT3_ABORT: projects.id is not uuid NOT NULL';
  END IF;
  SELECT a.attnotnull, t.typname
    INTO v_attnotnull, v_typname
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_type t ON t.oid = a.atttypid
   WHERE n.nspname = 'public' AND c.relname = 'projects' AND a.attname = 'group_id' AND a.attnum > 0 AND NOT a.attisdropped;
  IF v_typname IS DISTINCT FROM 'uuid' OR v_attnotnull IS NOT TRUE THEN
    RAISE EXCEPTION 'CUT3_ABORT: projects.group_id is not uuid NOT NULL';
  END IF;
  -- PRIMARY KEY must exist and key columns must be exactly (id). NOT NULL is not enough.
  IF NOT EXISTS (
    SELECT 1
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'projects'
       AND i.indisprimary
       AND (
         SELECT array_agg(a.attname::text ORDER BY x.ord)
           FROM unnest(i.indkey) WITH ORDINALITY AS x(attnum, ord)
           JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = x.attnum
       ) = ARRAY['id']::text[]
  ) THEN
    RAISE EXCEPTION 'CUT3_ABORT: projects PRIMARY KEY is not exactly (id)';
  END IF;

  -- 8. Avatars write policies still uid-first
  SELECT COUNT(*) INTO v_n
    FROM pg_policy p
   WHERE p.polrelid = 'storage.objects'::regclass
     AND p.polname IN ('avatars_insert_own', 'avatars_update_own', 'avatars_delete_own')
     AND COALESCE(pg_get_expr(p.polqual, p.polrelid), '') || ' ' || COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '')
         ~ 'foldername'
     AND COALESCE(pg_get_expr(p.polqual, p.polrelid), '') || ' ' || COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '')
         ~ 'auth\.uid';
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'CUT3_ABORT: avatars uid-first write policies drifted (found % matching)', v_n;
  END IF;

  -- 9. storage.objects role_table_grants exact set equality (not count-only).
  -- actual EXCEPT expected = empty AND expected EXCEPT actual = empty.
  IF EXISTS (
    WITH expected(grantee, privilege_type, is_grantable) AS (
      VALUES
        ('anon', 'INSERT', 'NO'), ('anon', 'SELECT', 'NO'), ('anon', 'UPDATE', 'NO'),
        ('anon', 'DELETE', 'NO'), ('anon', 'REFERENCES', 'NO'), ('anon', 'TRIGGER', 'NO'),
        ('anon', 'TRUNCATE', 'NO'),
        ('authenticated', 'INSERT', 'NO'), ('authenticated', 'SELECT', 'NO'),
        ('authenticated', 'UPDATE', 'NO'), ('authenticated', 'DELETE', 'NO'),
        ('authenticated', 'REFERENCES', 'NO'), ('authenticated', 'TRIGGER', 'NO'),
        ('authenticated', 'TRUNCATE', 'NO'),
        ('service_role', 'INSERT', 'NO'), ('service_role', 'SELECT', 'NO'),
        ('service_role', 'UPDATE', 'NO'), ('service_role', 'DELETE', 'NO'),
        ('service_role', 'REFERENCES', 'NO'), ('service_role', 'TRIGGER', 'NO'),
        ('service_role', 'TRUNCATE', 'NO'),
        ('postgres', 'INSERT', 'YES'), ('postgres', 'SELECT', 'YES'),
        ('postgres', 'UPDATE', 'YES'), ('postgres', 'DELETE', 'YES'),
        ('postgres', 'REFERENCES', 'YES'), ('postgres', 'TRIGGER', 'YES'),
        ('postgres', 'TRUNCATE', 'YES')
    ),
    actual(grantee, privilege_type, is_grantable) AS (
      SELECT g.grantee, g.privilege_type, g.is_grantable
        FROM information_schema.role_table_grants g
       WHERE g.table_schema = 'storage' AND g.table_name = 'objects'
    )
    SELECT 1 FROM (
      SELECT * FROM actual EXCEPT SELECT * FROM expected
      UNION ALL
      SELECT * FROM expected EXCEPT SELECT * FROM actual
    ) drift
  ) THEN
    RAISE EXCEPTION 'CUT3_ABORT: storage.objects role_table_grants set mismatch';
  END IF;
END
$cut3_pre$;

CREATE OR REPLACE FUNCTION public.storage_group_documents_authorized(p_name text, p_operation text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_parts text[];
  v_n int;
  v_prefix text;
  v_gid uuid;
  v_mid uuid;
  v_pid uuid;
  uuid_re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
  IF p_operation IS NULL OR p_operation NOT IN ('select', 'insert', 'update', 'delete') THEN
    RETURN false;
  END IF;
  IF p_name IS NULL OR p_name = '' THEN
    RETURN false;
  END IF;
  IF position(E'\\' IN p_name) > 0 THEN
    RETURN false;
  END IF;
  IF p_name ~ '%2[Ff]' OR p_name ~ '%5[Cc]' OR p_name ~ '%2[Ee]' THEN
    RETURN false;
  END IF;
  IF p_name ~ E'[\u2215\u2044\uFF0F\u2571\u29F8\u29F9]' THEN
    RETURN false;
  END IF;
  IF left(p_name, 1) = '/' OR right(p_name, 1) = '/' OR position('//' IN p_name) > 0 THEN
    RETURN false;
  END IF;

  v_parts := string_to_array(p_name, '/');
  v_n := COALESCE(array_length(v_parts, 1), 0);
  IF v_n < 2 THEN
    RETURN false;
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(v_parts) AS s(seg)
    WHERE s.seg IS NULL OR s.seg = '' OR s.seg = '.' OR s.seg = '..'
  ) THEN
    RETURN false;
  END IF;

  -- UUID-first gdocs (U04): {groupId}/{file}
  IF v_n = 2 AND v_parts[1] ~ uuid_re THEN
    v_gid := v_parts[1]::uuid;
    IF p_operation = 'select' THEN
      RETURN public.is_group_member(v_gid);
    ELSIF p_operation IN ('insert', 'update') THEN
      RETURN public.has_group_permission(v_gid, 'documents.manage');
    ELSIF p_operation = 'delete' THEN
      RETURN public.is_group_admin(v_gid);
    END IF;
    RETURN false;
  END IF;

  v_prefix := v_parts[1];

  IF v_prefix IN ('minutes', 'constitutions', 'logos') THEN
    IF v_n <> 3 OR v_parts[2] !~ uuid_re THEN
      RETURN false;
    END IF;
    v_gid := v_parts[2]::uuid;
    IF v_prefix = 'logos' THEN
      IF p_operation = 'select' THEN
        RETURN public.is_group_member(v_gid);
      END IF;
      RETURN false;
    ELSIF v_prefix = 'minutes' THEN
      IF p_operation = 'select' THEN
        RETURN public.is_group_member(v_gid);
      ELSIF p_operation IN ('insert', 'update') THEN
        RETURN public.has_group_permission(v_gid, 'minutes.manage');
      ELSIF p_operation = 'delete' THEN
        RETURN public.is_group_admin(v_gid);
      END IF;
    ELSIF v_prefix = 'constitutions' THEN
      IF p_operation = 'select' THEN
        RETURN public.is_group_member(v_gid);
      ELSIF p_operation IN ('insert', 'update', 'delete') THEN
        RETURN public.is_group_admin(v_gid);
      END IF;
    END IF;
    RETURN false;
  END IF;

  IF v_prefix = 'relief-claims' THEN
    IF v_n <> 4 OR v_parts[2] !~ uuid_re OR v_parts[3] !~ uuid_re THEN
      RETURN false;
    END IF;
    v_gid := v_parts[2]::uuid;
    v_mid := v_parts[3]::uuid;
    IF p_operation = 'delete' THEN
      RETURN public.is_group_admin(v_gid);
    END IF;
    RETURN EXISTS (
      SELECT 1
        FROM public.memberships m
       WHERE m.id = v_mid
         AND m.user_id = auth.uid()
         AND m.group_id = v_gid
         AND (p_operation = 'select' OR m.membership_status = 'active')
    );
  END IF;

  IF v_prefix = 'projects' THEN
    IF v_n <> 3 OR v_parts[2] !~ uuid_re THEN
      RETURN false;
    END IF;
    v_pid := v_parts[2]::uuid;
    SELECT p.group_id INTO v_gid
      FROM public.projects p
     WHERE p.id = v_pid;
    IF v_gid IS NULL THEN
      RETURN false;
    END IF;
    IF p_operation = 'select' THEN
      RETURN public.is_group_member(v_gid);
    ELSIF p_operation IN ('insert', 'update', 'delete') THEN
      RETURN public.is_group_admin(v_gid);
    END IF;
    RETURN false;
  END IF;

  RETURN false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.storage_receipts_authorized(p_name text, p_operation text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_parts text[];
  v_n int;
  v_prefix text;
  v_gid uuid;
  v_mid uuid;
  uuid_re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
  IF p_operation IS NULL OR p_operation NOT IN ('select', 'insert', 'update', 'delete') THEN
    RETURN false;
  END IF;
  IF p_name IS NULL OR p_name = '' THEN
    RETURN false;
  END IF;
  IF position(E'\\' IN p_name) > 0 THEN
    RETURN false;
  END IF;
  IF p_name ~ '%2[Ff]' OR p_name ~ '%5[Cc]' OR p_name ~ '%2[Ee]' THEN
    RETURN false;
  END IF;
  IF p_name ~ E'[\u2215\u2044\uFF0F\u2571\u29F8\u29F9]' THEN
    RETURN false;
  END IF;
  IF left(p_name, 1) = '/' OR right(p_name, 1) = '/' OR position('//' IN p_name) > 0 THEN
    RETURN false;
  END IF;

  v_parts := string_to_array(p_name, '/');
  v_n := COALESCE(array_length(v_parts, 1), 0);
  IF v_n < 2 THEN
    RETURN false;
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(v_parts) AS s(seg)
    WHERE s.seg IS NULL OR s.seg = '' OR s.seg = '.' OR s.seg = '..'
  ) THEN
    RETURN false;
  END IF;

  -- UUID-first receipts (U01 KEEP / historical): {groupId}/{file}
  IF v_n = 2 AND v_parts[1] ~ uuid_re THEN
    v_gid := v_parts[1]::uuid;
    IF p_operation = 'select' THEN
      RETURN public.is_group_member(v_gid);
    ELSIF p_operation IN ('insert', 'update') THEN
      RETURN public.is_active_group_member(v_gid);
    ELSIF p_operation = 'delete' THEN
      RETURN public.is_group_admin(v_gid);
    END IF;
    RETURN false;
  END IF;

  v_prefix := v_parts[1];

  IF v_prefix = 'finance-record' THEN
    IF v_n <> 3 OR v_parts[2] !~ uuid_re THEN
      RETURN false;
    END IF;
    v_gid := v_parts[2]::uuid;
    IF p_operation = 'select' THEN
      RETURN public.is_group_member(v_gid);
    ELSIF p_operation IN ('insert', 'update') THEN
      RETURN public.has_group_permission(v_gid, 'finances.record')
          OR public.has_group_permission(v_gid, 'finances.manage');
    ELSIF p_operation = 'delete' THEN
      RETURN public.is_group_admin(v_gid);
    END IF;
    RETURN false;
  END IF;

  IF v_prefix = 'dispute-docs' THEN
    IF v_n <> 4 OR v_parts[2] !~ uuid_re OR v_parts[3] !~ uuid_re THEN
      RETURN false;
    END IF;
    v_gid := v_parts[2]::uuid;
    v_mid := v_parts[3]::uuid;
    IF p_operation = 'delete' THEN
      RETURN public.is_group_admin(v_gid);
    END IF;
    RETURN EXISTS (
      SELECT 1
        FROM public.memberships m
       WHERE m.id = v_mid
         AND m.user_id = auth.uid()
         AND m.group_id = v_gid
         AND (p_operation = 'select' OR m.membership_status = 'active')
    );
  END IF;

  RETURN false;
END;
$function$;

ALTER FUNCTION public.storage_group_documents_authorized(text, text) OWNER TO postgres;
ALTER FUNCTION public.storage_receipts_authorized(text, text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.storage_group_documents_authorized(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.storage_group_documents_authorized(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.storage_group_documents_authorized(text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.storage_group_documents_authorized(text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.storage_receipts_authorized(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.storage_receipts_authorized(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.storage_receipts_authorized(text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.storage_receipts_authorized(text, text) TO authenticated;

DROP POLICY IF EXISTS "gdocs_select_group" ON storage.objects;
CREATE POLICY "gdocs_select_group" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'group-documents'
    AND public.storage_group_documents_authorized(name, 'select')
  );

DROP POLICY IF EXISTS "gdocs_insert_group" ON storage.objects;
CREATE POLICY "gdocs_insert_group" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'group-documents'
    AND public.storage_group_documents_authorized(name, 'insert')
  );

DROP POLICY IF EXISTS "gdocs_update_group" ON storage.objects;
CREATE POLICY "gdocs_update_group" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'group-documents'
    AND public.storage_group_documents_authorized(name, 'update')
  )
  WITH CHECK (
    bucket_id = 'group-documents'
    AND public.storage_group_documents_authorized(name, 'update')
  );

DROP POLICY IF EXISTS "gdocs_delete_group" ON storage.objects;
CREATE POLICY "gdocs_delete_group" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'group-documents'
    AND public.storage_group_documents_authorized(name, 'delete')
  );

DROP POLICY IF EXISTS "receipts_select_group" ON storage.objects;
CREATE POLICY "receipts_select_group" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'receipts'
    AND public.storage_receipts_authorized(name, 'select')
  );

DROP POLICY IF EXISTS "receipts_insert_group" ON storage.objects;
CREATE POLICY "receipts_insert_group" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND public.storage_receipts_authorized(name, 'insert')
  );

DROP POLICY IF EXISTS "receipts_update_group" ON storage.objects;
CREATE POLICY "receipts_update_group" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND public.storage_receipts_authorized(name, 'update')
  )
  WITH CHECK (
    bucket_id = 'receipts'
    AND public.storage_receipts_authorized(name, 'update')
  );

DROP POLICY IF EXISTS "receipts_delete_group" ON storage.objects;
CREATE POLICY "receipts_delete_group" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND public.storage_receipts_authorized(name, 'delete')
  );

DO $cut3_post$
DECLARE
  v_md5 text;
  v_owner name;
  v_definer boolean;
  v_cfg text[];
  v_using text;
  v_check text;
  v_n int;
  v_exec_auth boolean;
  v_exec_anon boolean;
  v_exec_sr boolean;
BEGIN
  SELECT COUNT(*) INTO v_n
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('storage_group_documents_authorized', 'storage_receipts_authorized');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'CUT3_ABORT: unexpected new-helper overload count % (expected 2)', v_n;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('storage_group_documents_authorized', 'storage_receipts_authorized')
      AND pg_get_function_identity_arguments(p.oid) IS DISTINCT FROM 'p_name text, p_operation text'
  ) THEN
    RAISE EXCEPTION 'CUT3_ABORT: unexpected new-helper signature (only p_name text, p_operation text allowed)';
  END IF;

  SELECT md5(pg_get_functiondef(p.oid)), pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig
    INTO v_md5, v_owner, v_definer, v_cfg
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'storage_group_documents_authorized'
     AND pg_get_function_identity_arguments(p.oid) = 'p_name text, p_operation text';
  IF v_owner IS DISTINCT FROM 'postgres' OR v_definer IS NOT TRUE
     OR v_cfg IS DISTINCT FROM ARRAY['search_path=""']::text[] THEN
    RAISE EXCEPTION 'CUT3_ABORT: storage_group_documents_authorized postcondition owner/definer/proconfig failed';
  END IF;

  SELECT md5(pg_get_functiondef(p.oid)), pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig
    INTO v_md5, v_owner, v_definer, v_cfg
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'storage_receipts_authorized'
     AND pg_get_function_identity_arguments(p.oid) = 'p_name text, p_operation text';
  IF v_owner IS DISTINCT FROM 'postgres' OR v_definer IS NOT TRUE
     OR v_cfg IS DISTINCT FROM ARRAY['search_path=""']::text[] THEN
    RAISE EXCEPTION 'CUT3_ABORT: storage_receipts_authorized postcondition owner/definer/proconfig failed';
  END IF;

  v_exec_auth := has_function_privilege('authenticated', 'public.storage_group_documents_authorized(text,text)', 'EXECUTE')
             AND has_function_privilege('authenticated', 'public.storage_receipts_authorized(text,text)', 'EXECUTE');
  v_exec_anon := has_function_privilege('anon', 'public.storage_group_documents_authorized(text,text)', 'EXECUTE')
              OR has_function_privilege('anon', 'public.storage_receipts_authorized(text,text)', 'EXECUTE');
  v_exec_sr := has_function_privilege('service_role', 'public.storage_group_documents_authorized(text,text)', 'EXECUTE')
            OR has_function_privilege('service_role', 'public.storage_receipts_authorized(text,text)', 'EXECUTE');
  IF v_exec_auth IS NOT TRUE OR v_exec_anon IS NOT FALSE OR v_exec_sr IS NOT FALSE THEN
    RAISE EXCEPTION 'CUT3_ABORT: helper EXECUTE grants postcondition failed (auth=% anon=% service_role=%)', v_exec_auth, v_exec_anon, v_exec_sr;
  END IF;

  IF EXISTS (
    WITH expected(fn, role_name, privilege) AS (
      VALUES
        ('storage_group_documents_authorized', 'postgres', 'EXECUTE'),
        ('storage_group_documents_authorized', 'authenticated', 'EXECUTE'),
        ('storage_receipts_authorized', 'postgres', 'EXECUTE'),
        ('storage_receipts_authorized', 'authenticated', 'EXECUTE')
    ),
    actual(fn, role_name, privilege) AS (
      SELECT p.proname,
             COALESCE(gr.rolname, 'PUBLIC'),
             a.privilege_type
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS a
        LEFT JOIN pg_roles gr ON gr.oid = a.grantee
       WHERE n.nspname = 'public'
         AND p.proname IN ('storage_group_documents_authorized', 'storage_receipts_authorized')
         AND pg_get_function_identity_arguments(p.oid) = 'p_name text, p_operation text'
         AND a.privilege_type = 'EXECUTE'
    )
    SELECT 1 FROM (
      SELECT * FROM actual EXCEPT SELECT * FROM expected
      UNION ALL
      SELECT * FROM expected EXCEPT SELECT * FROM actual
    ) drift
  ) THEN
    RAISE EXCEPTION 'CUT3_ABORT: new helper EXECUTE ACL set mismatch';
  END IF;

  SELECT COUNT(*) INTO v_n
    FROM pg_policy p
   WHERE p.polrelid = 'storage.objects'::regclass
     AND p.polname IN (
       'gdocs_select_group','gdocs_insert_group','gdocs_update_group','gdocs_delete_group',
       'receipts_select_group','receipts_insert_group','receipts_update_group','receipts_delete_group'
     );
  IF v_n <> 8 THEN
    RAISE EXCEPTION 'CUT3_ABORT: expected 8 replaced policies, found %', v_n;
  END IF;

  -- SELECT: helper + bucket, no IS NULL, no v1/v2
  SELECT pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)
    INTO v_using, v_check
    FROM pg_policy WHERE polrelid = 'storage.objects'::regclass AND polname = 'gdocs_select_group';
  IF v_using IS NULL OR v_using !~ 'storage_group_documents_authorized' OR v_using !~ 'group-documents'
     OR v_using ~ 'storage_path_group_id' OR v_using ~ 'IS NULL' OR v_check IS NOT NULL THEN
    RAISE EXCEPTION 'CUT3_ABORT: gdocs_select_group postcondition failed: % / %', v_using, v_check;
  END IF;
  SELECT pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)
    INTO v_using, v_check
    FROM pg_policy WHERE polrelid = 'storage.objects'::regclass AND polname = 'receipts_select_group';
  IF v_using IS NULL OR v_using !~ 'storage_receipts_authorized' OR v_using !~ 'receipts'
     OR v_using ~ 'storage_path_group_id' OR v_using ~ 'IS NULL' OR v_check IS NOT NULL THEN
    RAISE EXCEPTION 'CUT3_ABORT: receipts_select_group postcondition failed: % / %', v_using, v_check;
  END IF;

  -- INSERT
  SELECT pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)
    INTO v_using, v_check
    FROM pg_policy WHERE polrelid = 'storage.objects'::regclass AND polname = 'gdocs_insert_group';
  IF v_using IS NOT NULL OR v_check IS NULL OR v_check !~ 'storage_group_documents_authorized' OR v_check ~ 'storage_path_group_id' OR v_check ~ 'IS NULL' THEN
    RAISE EXCEPTION 'CUT3_ABORT: gdocs_insert_group postcondition failed: % / %', v_using, v_check;
  END IF;
  SELECT pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)
    INTO v_using, v_check
    FROM pg_policy WHERE polrelid = 'storage.objects'::regclass AND polname = 'receipts_insert_group';
  IF v_using IS NOT NULL OR v_check IS NULL OR v_check !~ 'storage_receipts_authorized' OR v_check ~ 'storage_path_group_id' OR v_check ~ 'IS NULL' THEN
    RAISE EXCEPTION 'CUT3_ABORT: receipts_insert_group postcondition failed: % / %', v_using, v_check;
  END IF;

  -- UPDATE both USING + WITH CHECK
  SELECT pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)
    INTO v_using, v_check
    FROM pg_policy WHERE polrelid = 'storage.objects'::regclass AND polname = 'gdocs_update_group';
  IF v_using IS NULL OR v_check IS NULL
     OR v_using !~ 'storage_group_documents_authorized' OR v_check !~ 'storage_group_documents_authorized'
     OR v_using ~ 'storage_path_group_id' OR v_check ~ 'storage_path_group_id'
     OR v_using ~ 'IS NULL' OR v_check ~ 'IS NULL' THEN
    RAISE EXCEPTION 'CUT3_ABORT: gdocs_update_group postcondition failed: % / %', v_using, v_check;
  END IF;
  SELECT pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)
    INTO v_using, v_check
    FROM pg_policy WHERE polrelid = 'storage.objects'::regclass AND polname = 'receipts_update_group';
  IF v_using IS NULL OR v_check IS NULL
     OR v_using !~ 'storage_receipts_authorized' OR v_check !~ 'storage_receipts_authorized'
     OR v_using ~ 'storage_path_group_id' OR v_check ~ 'storage_path_group_id'
     OR v_using ~ 'IS NULL' OR v_check ~ 'IS NULL' THEN
    RAISE EXCEPTION 'CUT3_ABORT: receipts_update_group postcondition failed: % / %', v_using, v_check;
  END IF;

  -- DELETE
  SELECT pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)
    INTO v_using, v_check
    FROM pg_policy WHERE polrelid = 'storage.objects'::regclass AND polname = 'gdocs_delete_group';
  IF v_using IS NULL OR v_check IS NOT NULL OR v_using !~ 'storage_group_documents_authorized' OR v_using ~ 'storage_path_group_id' OR v_using ~ 'IS NULL' THEN
    RAISE EXCEPTION 'CUT3_ABORT: gdocs_delete_group postcondition failed: % / %', v_using, v_check;
  END IF;
  SELECT pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)
    INTO v_using, v_check
    FROM pg_policy WHERE polrelid = 'storage.objects'::regclass AND polname = 'receipts_delete_group';
  IF v_using IS NULL OR v_check IS NOT NULL OR v_using !~ 'storage_receipts_authorized' OR v_using ~ 'storage_path_group_id' OR v_using ~ 'IS NULL' THEN
    RAISE EXCEPTION 'CUT3_ABORT: receipts_delete_group postcondition failed: % / %', v_using, v_check;
  END IF;

  -- v1/v2 kept, same md5, removed from policy authority
  SELECT md5(pg_get_functiondef('public.storage_path_group_id(text)'::regprocedure)) INTO v_md5;
  IF v_md5 IS DISTINCT FROM 'fb6155e6e3c996ad857208f717d981a8' THEN
    RAISE EXCEPTION 'CUT3_ABORT: v1 md5 changed after replace: %', v_md5;
  END IF;
  SELECT md5(pg_get_functiondef('public.storage_path_group_id_v2(text)'::regprocedure)) INTO v_md5;
  IF v_md5 IS DISTINCT FROM '585e7bd017f5623aacf87407b1b11524' THEN
    RAISE EXCEPTION 'CUT3_ABORT: v2 md5 changed after replace: %', v_md5;
  END IF;
  SELECT COUNT(*) INTO v_n
    FROM pg_policy p
   WHERE p.polrelid = 'storage.objects'::regclass
     AND p.polname IN (
       'gdocs_select_group','gdocs_insert_group','gdocs_update_group','gdocs_delete_group',
       'receipts_select_group','receipts_insert_group','receipts_update_group','receipts_delete_group'
     )
     AND (
       COALESCE(pg_get_expr(p.polqual, p.polrelid), '') ~ 'storage_path_group_id'
       OR COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '') ~ 'storage_path_group_id'
     );
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'CUT3_ABORT: v1/v2 remain in replaced policy authority';
  END IF;

  -- Avatars untouched
  SELECT COUNT(*) INTO v_n
    FROM pg_policy p
   WHERE p.polrelid = 'storage.objects'::regclass
     AND p.polname IN ('avatars_insert_own', 'avatars_update_own', 'avatars_delete_own');
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'CUT3_ABORT: avatars write policies missing after replace';
  END IF;

  -- Fail-closed samples (no auth.uid ⇒ DENY; unknown grammar DENY; invalid op DENY)
  IF public.storage_receipts_authorized('garbage/foo', 'select') IS DISTINCT FROM false
     OR public.storage_group_documents_authorized('garbage/foo', 'select') IS DISTINCT FROM false
     OR public.storage_receipts_authorized(NULL, 'select') IS DISTINCT FROM false
     OR public.storage_receipts_authorized('11111111-1111-4111-8111-111111111111/x.pdf', 'upsert') IS DISTINCT FROM false
     OR public.storage_receipts_authorized('finance-record/11111111-1111-4111-8111-111111111111/x.pdf', 'select') IS DISTINCT FROM false
  THEN
    RAISE EXCEPTION 'CUT3_ABORT: helper fail-closed sample postcondition failed';
  END IF;
END
$cut3_post$;

COMMIT;
