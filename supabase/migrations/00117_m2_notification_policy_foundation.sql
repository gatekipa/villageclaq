-- =============================================================================
-- 00117_m2_notification_policy_foundation.sql
-- =============================================================================
-- M2 notification policy foundation — DORMANT SCHEMA ONLY.
--
-- DO NOT APPLY TO PRODUCTION (llbnliixczcqfftxpsmb) from this PR.
-- DO NOT MERGE as a production-apply vehicle.
-- NO REAL SENDS. NO PRODUCER CUTOVER. NO UI. NO QUEUE INSERT. NO ENQUEUE CHANGE.
--
-- Planning authority: PR #81 @ dc35c39a5b94b354c02e3f0f091271e74b8e93e5
-- Base main:          0c147f8e1e7aadbfd14583f6a9bef465c2217fe1
--
-- This is NOT a rename of 20260910120000_notification_policy_schema.sql.
-- That file must never be copied or applied.
--
-- Three tables:
--   notification_policies            — tenant schedule INTENT only
--   notification_policy_triggers     — relative offsets only
--   notification_policy_occurrences  — dormant identity/lifecycle ledger
--
-- Dormant-by-default: enabled DEFAULT false; all channel_* DEFAULT false
--   (especially channel_push). A row existing is not an enablement signal.
-- Domain CHECK: payment | hosting | event. NO announcement.
-- Tenant admin: has_group_permission(group_id, 'settings.manage')
--   (Cut 1 active-membership semantics). Do NOT invent notifications.manage.
--   Do NOT use is_group_member as the exited gate.
-- Occurrences: authenticated SELECT-only. NO authenticated mutation.
--   NO blanket service_role DML. NO SECURITY DEFINER occurrence writer
--   (writers are deferred; not required for this dormant foundation).
-- NO auto rows / backfill / queue mutation / send triggers.
-- NO grants on notifications_queue.
-- NO enqueue_outbound_notification signature/grants/body change.
-- NO Cut 2 helper/renderer/drain privilege changes.
--
-- Live pins (Chief-confirmed production llbnliixczcqfftxpsmb, SELECT-only):
--   has_group_permission def MD5 695368464e97297fbf0f90ce7345162f
--   has_group_permission prosrc MD5 96a296dfd541c7fc75ec68c4da1d92ff
--   enqueue_outbound_notification def MD5 dbdb16cdced6cae9cbdbfb6a6a9f421f
--   enqueue_outbound_notification prosrc MD5 3fa76af51e431ccbd31eb033dcff0b80
-- ACL compared via aclexplode + role resolution; NOT raw ACL text order.
-- Do NOT accept alternate hashes to make a fixture easier.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- A) Preconditions — exact live floor, then snapshot
-- ---------------------------------------------------------------------------
DO $m2_pre$
DECLARE
  v_hgp_count int;
  v_hgp_ident text;
  v_hgp_result text;
  v_hgp_owner text;
  v_hgp_definer boolean;
  v_hgp_cfg text[];
  v_hgp_def_md5 text;
  v_hgp_src_md5 text;
  v_enq_count int;
  v_enq_ident text;
  v_enq_result text;
  v_enq_owner text;
  v_enq_definer boolean;
  v_enq_cfg text[];
  v_enq_def_md5 text;
  v_enq_src_md5 text;
  v_acl_drift bigint;
  v_sr_upd text[];
BEGIN
  IF to_regclass('public.groups') IS NULL THEN
    RAISE EXCEPTION 'M2_ABORT: public.groups missing (00116-era schema required)';
  END IF;
  IF to_regclass('public.memberships') IS NULL THEN
    RAISE EXCEPTION 'M2_ABORT: public.memberships missing (00116-era schema required)';
  END IF;
  IF to_regclass('public.notifications_queue') IS NULL THEN
    RAISE EXCEPTION 'M2_ABORT: public.notifications_queue missing (Cut 2 floor required)';
  END IF;

  IF to_regclass('public.notification_policies') IS NOT NULL
     OR to_regclass('public.notification_policy_triggers') IS NOT NULL
     OR to_regclass('public.notification_policy_occurrences') IS NOT NULL THEN
    RAISE EXCEPTION 'M2_ABORT: policy tables already exist — refuse to collide';
  END IF;

  -- R1–R4 has_group_permission exact live pin
  SELECT count(*) INTO v_hgp_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'has_group_permission';
  IF v_hgp_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'M2_ABORT: has_group_permission overload count=% (expected 1)', v_hgp_count;
  END IF;

  SELECT pg_get_function_identity_arguments(p.oid),
         pg_get_function_result(p.oid),
         pg_get_userbyid(p.proowner),
         p.prosecdef,
         p.proconfig,
         md5(pg_get_functiondef(p.oid)),
         md5(p.prosrc)
    INTO v_hgp_ident, v_hgp_result, v_hgp_owner, v_hgp_definer, v_hgp_cfg,
         v_hgp_def_md5, v_hgp_src_md5
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'has_group_permission';

  IF v_hgp_ident IS DISTINCT FROM 'gid uuid, perm_key text, uid uuid'
     OR v_hgp_result IS DISTINCT FROM 'boolean'
     OR v_hgp_owner IS DISTINCT FROM 'postgres'
     OR v_hgp_definer IS NOT TRUE
     OR v_hgp_cfg IS DISTINCT FROM ARRAY['search_path=""']::text[]
     OR v_hgp_def_md5 IS DISTINCT FROM '695368464e97297fbf0f90ce7345162f'
     OR v_hgp_src_md5 IS DISTINCT FROM '96a296dfd541c7fc75ec68c4da1d92ff' THEN
    RAISE EXCEPTION
      'M2_ABORT: has_group_permission live pin mismatch ident=% result=% owner=% definer=% cfg=% def_md5=% src_md5=%',
      v_hgp_ident, v_hgp_result, v_hgp_owner, v_hgp_definer, v_hgp_cfg,
      v_hgp_def_md5, v_hgp_src_md5;
  END IF;

  SELECT COUNT(*) INTO v_acl_drift FROM (
    (
      SELECT concat_ws('|', role_name, privilege, grantor_name, is_grantable) FROM (
        SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE gr.rolname::text END AS role_name,
               a.privilege_type::text AS privilege,
               go.rolname::text AS grantor_name,
               CASE WHEN a.is_grantable THEN 'true' ELSE 'false' END AS is_grantable
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS a
        LEFT JOIN pg_roles gr ON gr.oid = a.grantee
        LEFT JOIN pg_roles go ON go.oid = a.grantor
        WHERE n.nspname = 'public' AND p.proname = 'has_group_permission'
          AND a.privilege_type = 'EXECUTE'
      ) actual
      EXCEPT
      SELECT concat_ws('|', role_name, privilege, grantor_name, is_grantable) FROM (
        VALUES
          ('authenticated'::text, 'EXECUTE'::text, 'postgres'::text, 'false'::text),
          ('postgres', 'EXECUTE', 'postgres', 'false'),
          ('service_role', 'EXECUTE', 'postgres', 'false')
      ) AS expected(role_name, privilege, grantor_name, is_grantable)
    )
    UNION ALL
    (
      SELECT concat_ws('|', role_name, privilege, grantor_name, is_grantable) FROM (
        VALUES
          ('authenticated'::text, 'EXECUTE'::text, 'postgres'::text, 'false'::text),
          ('postgres', 'EXECUTE', 'postgres', 'false'),
          ('service_role', 'EXECUTE', 'postgres', 'false')
      ) AS expected(role_name, privilege, grantor_name, is_grantable)
      EXCEPT
      SELECT concat_ws('|', role_name, privilege, grantor_name, is_grantable) FROM (
        SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE gr.rolname::text END AS role_name,
               a.privilege_type::text AS privilege,
               go.rolname::text AS grantor_name,
               CASE WHEN a.is_grantable THEN 'true' ELSE 'false' END AS is_grantable
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS a
        LEFT JOIN pg_roles gr ON gr.oid = a.grantee
        LEFT JOIN pg_roles go ON go.oid = a.grantor
        WHERE n.nspname = 'public' AND p.proname = 'has_group_permission'
          AND a.privilege_type = 'EXECUTE'
      ) actual
    )
  ) drift;
  IF v_acl_drift <> 0 THEN
    RAISE EXCEPTION 'M2_ABORT: has_group_permission EXECUTE ACL set mismatch (drift=%)', v_acl_drift;
  END IF;

  -- R5–R8 enqueue_outbound_notification exact live pin
  SELECT count(*) INTO v_enq_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'enqueue_outbound_notification';
  IF v_enq_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'M2_ABORT: enqueue_outbound_notification overload count=% (expected 1)', v_enq_count;
  END IF;

  SELECT pg_get_function_identity_arguments(p.oid),
         pg_get_function_result(p.oid),
         pg_get_userbyid(p.proowner),
         p.prosecdef,
         p.proconfig,
         md5(pg_get_functiondef(p.oid)),
         md5(p.prosrc)
    INTO v_enq_ident, v_enq_result, v_enq_owner, v_enq_definer, v_enq_cfg,
         v_enq_def_md5, v_enq_src_md5
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'enqueue_outbound_notification';

  IF v_enq_ident IS DISTINCT FROM
       'p_notification_type text, p_domain_object_id uuid, p_channel notification_channel, p_recipient_membership_id uuid, p_locale text'
     OR v_enq_result IS DISTINCT FROM 'TABLE(queue_id uuid, result text)'
     OR v_enq_owner IS DISTINCT FROM 'postgres'
     OR v_enq_definer IS NOT TRUE
     OR v_enq_cfg IS DISTINCT FROM ARRAY['search_path=""']::text[]
     OR v_enq_def_md5 IS DISTINCT FROM 'dbdb16cdced6cae9cbdbfb6a6a9f421f'
     OR v_enq_src_md5 IS DISTINCT FROM '3fa76af51e431ccbd31eb033dcff0b80' THEN
    RAISE EXCEPTION
      'M2_ABORT: enqueue_outbound_notification live pin mismatch ident=% result=% owner=% definer=% cfg=% def_md5=% src_md5=%',
      v_enq_ident, v_enq_result, v_enq_owner, v_enq_definer, v_enq_cfg,
      v_enq_def_md5, v_enq_src_md5;
  END IF;

  SELECT COUNT(*) INTO v_acl_drift FROM (
    (
      SELECT concat_ws('|', role_name, privilege, grantor_name, is_grantable) FROM (
        SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE gr.rolname::text END AS role_name,
               a.privilege_type::text AS privilege,
               go.rolname::text AS grantor_name,
               CASE WHEN a.is_grantable THEN 'true' ELSE 'false' END AS is_grantable
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS a
        LEFT JOIN pg_roles gr ON gr.oid = a.grantee
        LEFT JOIN pg_roles go ON go.oid = a.grantor
        WHERE n.nspname = 'public' AND p.proname = 'enqueue_outbound_notification'
          AND a.privilege_type = 'EXECUTE'
      ) actual
      EXCEPT
      SELECT concat_ws('|', role_name, privilege, grantor_name, is_grantable) FROM (
        VALUES
          ('postgres'::text, 'EXECUTE'::text, 'postgres'::text, 'false'::text),
          ('service_role', 'EXECUTE', 'postgres', 'false')
      ) AS expected(role_name, privilege, grantor_name, is_grantable)
    )
    UNION ALL
    (
      SELECT concat_ws('|', role_name, privilege, grantor_name, is_grantable) FROM (
        VALUES
          ('postgres'::text, 'EXECUTE'::text, 'postgres'::text, 'false'::text),
          ('service_role', 'EXECUTE', 'postgres', 'false')
      ) AS expected(role_name, privilege, grantor_name, is_grantable)
      EXCEPT
      SELECT concat_ws('|', role_name, privilege, grantor_name, is_grantable) FROM (
        SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE gr.rolname::text END AS role_name,
               a.privilege_type::text AS privilege,
               go.rolname::text AS grantor_name,
               CASE WHEN a.is_grantable THEN 'true' ELSE 'false' END AS is_grantable
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS a
        LEFT JOIN pg_roles gr ON gr.oid = a.grantee
        LEFT JOIN pg_roles go ON go.oid = a.grantor
        WHERE n.nspname = 'public' AND p.proname = 'enqueue_outbound_notification'
          AND a.privilege_type = 'EXECUTE'
      ) actual
    )
  ) drift;
  IF v_acl_drift <> 0 THEN
    RAISE EXCEPTION 'M2_ABORT: enqueue_outbound_notification EXECUTE ACL set mismatch (drift=%)', v_acl_drift;
  END IF;

  -- R9 queue TABLE ACL exact live set
  SELECT COUNT(*) INTO v_acl_drift FROM (
    (
      SELECT concat_ws('|', role_name, privilege, grantor_name, is_grantable) FROM (
        SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE gr.rolname::text END AS role_name,
               a.privilege_type::text AS privilege,
               go.rolname::text AS grantor_name,
               CASE WHEN a.is_grantable THEN 'true' ELSE 'false' END AS is_grantable
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) AS a
        LEFT JOIN pg_roles gr ON gr.oid = a.grantee
        LEFT JOIN pg_roles go ON go.oid = a.grantor
        WHERE n.nspname = 'public' AND c.relname = 'notifications_queue'
      ) actual
      EXCEPT
      SELECT concat_ws('|', role_name, privilege, grantor_name, is_grantable) FROM (
        VALUES
          ('authenticated'::text, 'SELECT'::text, 'postgres'::text, 'false'::text),
          ('postgres', 'DELETE', 'postgres', 'false'),
          ('postgres', 'INSERT', 'postgres', 'false'),
          ('postgres', 'MAINTAIN', 'postgres', 'false'),
          ('postgres', 'REFERENCES', 'postgres', 'false'),
          ('postgres', 'SELECT', 'postgres', 'false'),
          ('postgres', 'TRIGGER', 'postgres', 'false'),
          ('postgres', 'TRUNCATE', 'postgres', 'false'),
          ('postgres', 'UPDATE', 'postgres', 'false'),
          ('service_role', 'SELECT', 'postgres', 'false')
      ) AS expected(role_name, privilege, grantor_name, is_grantable)
    )
    UNION ALL
    (
      SELECT concat_ws('|', role_name, privilege, grantor_name, is_grantable) FROM (
        VALUES
          ('authenticated'::text, 'SELECT'::text, 'postgres'::text, 'false'::text),
          ('postgres', 'DELETE', 'postgres', 'false'),
          ('postgres', 'INSERT', 'postgres', 'false'),
          ('postgres', 'MAINTAIN', 'postgres', 'false'),
          ('postgres', 'REFERENCES', 'postgres', 'false'),
          ('postgres', 'SELECT', 'postgres', 'false'),
          ('postgres', 'TRIGGER', 'postgres', 'false'),
          ('postgres', 'TRUNCATE', 'postgres', 'false'),
          ('postgres', 'UPDATE', 'postgres', 'false'),
          ('service_role', 'SELECT', 'postgres', 'false')
      ) AS expected(role_name, privilege, grantor_name, is_grantable)
      EXCEPT
      SELECT concat_ws('|', role_name, privilege, grantor_name, is_grantable) FROM (
        SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE gr.rolname::text END AS role_name,
               a.privilege_type::text AS privilege,
               go.rolname::text AS grantor_name,
               CASE WHEN a.is_grantable THEN 'true' ELSE 'false' END AS is_grantable
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) AS a
        LEFT JOIN pg_roles gr ON gr.oid = a.grantee
        LEFT JOIN pg_roles go ON go.oid = a.grantor
        WHERE n.nspname = 'public' AND c.relname = 'notifications_queue'
      ) actual
    )
  ) drift;
  IF v_acl_drift <> 0 THEN
    RAISE EXCEPTION 'M2_ABORT: notifications_queue TABLE ACL set mismatch (drift=%)', v_acl_drift;
  END IF;

  -- R10–R13 exact five column UPDATE attacl rows
  SELECT COUNT(*) INTO v_acl_drift FROM (
    (
      SELECT concat_ws('|', attname, role_name, privilege, grantor_name, is_grantable) FROM (
        SELECT att.attname::text AS attname,
               CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE gr.rolname::text END AS role_name,
               a.privilege_type::text AS privilege,
               go.rolname::text AS grantor_name,
               CASE WHEN a.is_grantable THEN 'true' ELSE 'false' END AS is_grantable
        FROM pg_attribute att
        JOIN pg_class c ON c.oid = att.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN LATERAL aclexplode(att.attacl) AS a ON att.attacl IS NOT NULL
        LEFT JOIN pg_roles gr ON gr.oid = a.grantee
        LEFT JOIN pg_roles go ON go.oid = a.grantor
        WHERE n.nspname = 'public' AND c.relname = 'notifications_queue'
          AND att.attnum > 0 AND NOT att.attisdropped AND att.attacl IS NOT NULL
      ) actual
      EXCEPT
      SELECT concat_ws('|', attname, role_name, privilege, grantor_name, is_grantable) FROM (
        VALUES
          ('attempts'::text, 'service_role'::text, 'UPDATE'::text, 'postgres'::text, 'false'::text),
          ('data', 'service_role', 'UPDATE', 'postgres', 'false'),
          ('error_message', 'service_role', 'UPDATE', 'postgres', 'false'),
          ('sent_at', 'service_role', 'UPDATE', 'postgres', 'false'),
          ('status', 'service_role', 'UPDATE', 'postgres', 'false')
      ) AS expected(attname, role_name, privilege, grantor_name, is_grantable)
    )
    UNION ALL
    (
      SELECT concat_ws('|', attname, role_name, privilege, grantor_name, is_grantable) FROM (
        VALUES
          ('attempts'::text, 'service_role'::text, 'UPDATE'::text, 'postgres'::text, 'false'::text),
          ('data', 'service_role', 'UPDATE', 'postgres', 'false'),
          ('error_message', 'service_role', 'UPDATE', 'postgres', 'false'),
          ('sent_at', 'service_role', 'UPDATE', 'postgres', 'false'),
          ('status', 'service_role', 'UPDATE', 'postgres', 'false')
      ) AS expected(attname, role_name, privilege, grantor_name, is_grantable)
      EXCEPT
      SELECT concat_ws('|', attname, role_name, privilege, grantor_name, is_grantable) FROM (
        SELECT att.attname::text AS attname,
               CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE gr.rolname::text END AS role_name,
               a.privilege_type::text AS privilege,
               go.rolname::text AS grantor_name,
               CASE WHEN a.is_grantable THEN 'true' ELSE 'false' END AS is_grantable
        FROM pg_attribute att
        JOIN pg_class c ON c.oid = att.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN LATERAL aclexplode(att.attacl) AS a ON att.attacl IS NOT NULL
        LEFT JOIN pg_roles gr ON gr.oid = a.grantee
        LEFT JOIN pg_roles go ON go.oid = a.grantor
        WHERE n.nspname = 'public' AND c.relname = 'notifications_queue'
          AND att.attnum > 0 AND NOT att.attisdropped AND att.attacl IS NOT NULL
      ) actual
    )
  ) drift;
  IF v_acl_drift <> 0 THEN
    RAISE EXCEPTION 'M2_ABORT: notifications_queue COLUMN attacl set mismatch (drift=%)', v_acl_drift;
  END IF;

  SELECT array_agg(att.attname::text ORDER BY att.attname)
    INTO v_sr_upd
  FROM pg_attribute att
  JOIN pg_class c ON c.oid = att.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN LATERAL aclexplode(att.attacl) AS a ON att.attacl IS NOT NULL
  LEFT JOIN pg_roles gr ON gr.oid = a.grantee
  WHERE n.nspname = 'public' AND c.relname = 'notifications_queue'
    AND att.attnum > 0 AND NOT att.attisdropped
    AND a.privilege_type = 'UPDATE'
    AND gr.rolname = 'service_role';
  IF v_sr_upd IS DISTINCT FROM ARRAY['attempts','data','error_message','sent_at','status']::text[] THEN
    RAISE EXCEPTION 'M2_ABORT: service_role UPDATE columns=% (expected attempts,data,error_message,sent_at,status)',
      v_sr_upd;
  END IF;
END
$m2_pre$;

-- Snapshot only AFTER qualified pins pass
CREATE TEMP TABLE m2_pre_hgp AS
SELECT
  p.oid,
  pg_get_function_identity_arguments(p.oid) AS identity_args,
  pg_get_function_result(p.oid) AS result_type,
  pg_get_userbyid(p.proowner) AS owner,
  p.prosecdef,
  p.proconfig,
  md5(pg_get_functiondef(p.oid)) AS def_md5,
  md5(p.prosrc) AS src_md5
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'has_group_permission';

CREATE TEMP TABLE m2_pre_hgp_acl AS
SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE gr.rolname::text END AS role_name,
       a.privilege_type::text AS privilege,
       go.rolname::text AS grantor_name,
       CASE WHEN a.is_grantable THEN 'true' ELSE 'false' END AS is_grantable
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS a
LEFT JOIN pg_roles gr ON gr.oid = a.grantee
LEFT JOIN pg_roles go ON go.oid = a.grantor
WHERE n.nspname = 'public' AND p.proname = 'has_group_permission';

CREATE TEMP TABLE m2_pre_enqueue AS
SELECT
  p.oid,
  pg_get_function_identity_arguments(p.oid) AS identity_args,
  pg_get_function_result(p.oid) AS result_type,
  pg_get_userbyid(p.proowner) AS owner,
  p.prosecdef,
  p.proconfig,
  md5(pg_get_functiondef(p.oid)) AS def_md5,
  md5(p.prosrc) AS src_md5
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'enqueue_outbound_notification';

CREATE TEMP TABLE m2_pre_enqueue_acl AS
SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE gr.rolname::text END AS role_name,
       a.privilege_type::text AS privilege,
       go.rolname::text AS grantor_name,
       CASE WHEN a.is_grantable THEN 'true' ELSE 'false' END AS is_grantable
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS a
LEFT JOIN pg_roles gr ON gr.oid = a.grantee
LEFT JOIN pg_roles go ON go.oid = a.grantor
WHERE n.nspname = 'public' AND p.proname = 'enqueue_outbound_notification';

CREATE TEMP TABLE m2_pre_queue_acl AS
SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE gr.rolname::text END AS role_name,
       a.privilege_type::text AS privilege,
       go.rolname::text AS grantor_name,
       CASE WHEN a.is_grantable THEN 'true' ELSE 'false' END AS is_grantable
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) AS a
LEFT JOIN pg_roles gr ON gr.oid = a.grantee
LEFT JOIN pg_roles go ON go.oid = a.grantor
WHERE n.nspname = 'public' AND c.relname = 'notifications_queue';

CREATE TEMP TABLE m2_pre_queue_col_acl AS
SELECT att.attname::text AS attname,
       CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE gr.rolname::text END AS role_name,
       a.privilege_type::text AS privilege,
       go.rolname::text AS grantor_name,
       CASE WHEN a.is_grantable THEN 'true' ELSE 'false' END AS is_grantable
FROM pg_attribute att
JOIN pg_class c ON c.oid = att.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN LATERAL aclexplode(att.attacl) AS a ON att.attacl IS NOT NULL
LEFT JOIN pg_roles gr ON gr.oid = a.grantee
LEFT JOIN pg_roles go ON go.oid = a.grantor
WHERE n.nspname = 'public' AND c.relname = 'notifications_queue'
  AND att.attnum > 0 AND NOT att.attisdropped AND att.attacl IS NOT NULL;

CREATE TEMP TABLE m2_pre_queue_count AS
SELECT count(*)::bigint AS n FROM public.notifications_queue;

-- ---------------------------------------------------------------------------
-- B) IANA timezone helper (SECURITY INVOKER — NOT DEFINER)
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.m2_is_valid_iana_timezone(tz text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT tz IS NOT NULL
     AND btrim(tz) <> ''
     AND EXISTS (
       SELECT 1
       FROM pg_catalog.pg_timezone_names z
       WHERE z.name = tz
     );
$$;

COMMENT ON FUNCTION public.m2_is_valid_iana_timezone(text) IS
  'M2 fail-closed IANA allowlist. SECURITY INVOKER. Not a send path.';

REVOKE ALL ON FUNCTION public.m2_is_valid_iana_timezone(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.m2_is_valid_iana_timezone(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- C) notification_policies — tenant schedule intent only
-- ---------------------------------------------------------------------------
CREATE TABLE public.notification_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  domain text NOT NULL,
  object_id uuid NULL,
  enabled boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'UTC',
  repeat_interval_hours integer NULL,
  max_occurrences integer NULL,
  stop_when_resolved boolean NOT NULL DEFAULT true,
  stop_after_hours integer NULL,
  quiet_start_minute integer NULL,
  quiet_end_minute integer NULL,
  channel_in_app boolean NOT NULL DEFAULT false,
  channel_email boolean NOT NULL DEFAULT false,
  channel_sms boolean NOT NULL DEFAULT false,
  channel_whatsapp boolean NOT NULL DEFAULT false,
  channel_push boolean NOT NULL DEFAULT false,
  created_by uuid NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT notification_policies_domain_check
    CHECK (domain IN ('payment', 'hosting', 'event')),
  CONSTRAINT notification_policies_repeat_interval_positive
    CHECK (repeat_interval_hours IS NULL OR repeat_interval_hours > 0),
  CONSTRAINT notification_policies_max_occurrences_positive
    CHECK (max_occurrences IS NULL OR max_occurrences > 0),
  CONSTRAINT notification_policies_stop_after_positive
    CHECK (stop_after_hours IS NULL OR stop_after_hours > 0),
  CONSTRAINT notification_policies_quiet_start_range
    CHECK (quiet_start_minute IS NULL OR (quiet_start_minute >= 0 AND quiet_start_minute <= 1439)),
  CONSTRAINT notification_policies_quiet_end_range
    CHECK (quiet_end_minute IS NULL OR (quiet_end_minute >= 0 AND quiet_end_minute <= 1439)),
  CONSTRAINT notification_policies_quiet_pair
    CHECK (
      (quiet_start_minute IS NULL AND quiet_end_minute IS NULL)
      OR (quiet_start_minute IS NOT NULL AND quiet_end_minute IS NOT NULL)
    ),
  CONSTRAINT notification_policies_repeat_requires_max
    CHECK (
      repeat_interval_hours IS NULL
      OR max_occurrences IS NOT NULL
    ),
  CONSTRAINT notification_policies_timezone_iana
    CHECK (public.m2_is_valid_iana_timezone(timezone)),
  CONSTRAINT notification_policies_push_denied
    CHECK (channel_push = false),
  CONSTRAINT notification_policies_hosting_email_denied
    CHECK (domain <> 'hosting' OR channel_email = false),
  CONSTRAINT notification_policies_group_domain_object_unique
    UNIQUE NULLS NOT DISTINCT (group_id, domain, object_id)
);

COMMENT ON TABLE public.notification_policies IS
  'M2 dormant tenant schedule INTENT. No recipient/provider/queue fields. enabled DEFAULT false. WRITE/READ: settings.manage via has_group_permission (Cut 1 active). DO NOT APPLY TO PRODUCTION from the M2 draft PR.';
COMMENT ON COLUMN public.notification_policies.object_id IS
  'NULL = group/domain default; non-NULL = per-object override.';
COMMENT ON COLUMN public.notification_policies.domain IS
  'payment | hosting | event. announcement is a Cut 2 type but NOT an M2 policy domain.';
COMMENT ON COLUMN public.notification_policies.enabled IS
  'Dormant-by-default. false until a later opt-in. Row existence is not enablement.';
COMMENT ON COLUMN public.notification_policies.channel_push IS
  'Retained for schema compat. DEFAULT false. CHECK forces false. Cut 2 DENY all 22.';

CREATE INDEX notification_policies_group_domain_idx
  ON public.notification_policies (group_id, domain);

-- ---------------------------------------------------------------------------
-- D) notification_policy_triggers — relative offsets only
-- ---------------------------------------------------------------------------
CREATE TABLE public.notification_policy_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES public.notification_policies(id) ON DELETE CASCADE,
  offset_hours integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_policy_triggers_policy_offset_unique
    UNIQUE (policy_id, offset_hours)
);

COMMENT ON TABLE public.notification_policy_triggers IS
  'Relative trigger offsets (hours) for a policy. Negative = before anchor; positive = after. No send path.';

CREATE INDEX notification_policy_triggers_policy_id_idx
  ON public.notification_policy_triggers (policy_id);

-- ---------------------------------------------------------------------------
-- E) notification_policy_occurrences — dormant identity ledger
-- ---------------------------------------------------------------------------
CREATE TABLE public.notification_policy_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  domain text NOT NULL,
  object_id uuid NOT NULL,
  anchor_at timestamptz NOT NULL,
  trigger_offset_hours integer NOT NULL,
  occurrence_index integer NOT NULL,
  identity_key text NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  eligible_at timestamptz NOT NULL,
  deferred_until timestamptz NULL,
  superseded_by uuid NULL REFERENCES public.notification_policy_occurrences(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT notification_policy_occurrences_domain_check
    CHECK (domain IN ('payment', 'hosting', 'event')),
  CONSTRAINT notification_policy_occurrences_index_nonneg
    CHECK (occurrence_index >= 0),
  CONSTRAINT notification_policy_occurrences_status_check
    CHECK (status IN (
      'scheduled',
      'deferred',
      'sent',
      'skipped',
      'superseded',
      'cancelled',
      'stop_resolved',
      'stop_policy'
    )),
  CONSTRAINT notification_policy_occurrences_identity_unique
    UNIQUE (identity_key),
  CONSTRAINT notification_policy_occurrences_natural_unique
    UNIQUE (group_id, domain, object_id, anchor_at, trigger_offset_hours, occurrence_index)
);

COMMENT ON TABLE public.notification_policy_occurrences IS
  'DORMANT identity/lifecycle ledger. Authenticated SELECT-only. No authenticated writes. No service_role DML grant. Future writers (if any) must be a later least-privilege SECURITY DEFINER ticket — NOT invented here. identity_key = domain:objectId:anchorIso:offset:index. DEFER keeps same identity; reschedule supersedes prior unsent.';
COMMENT ON COLUMN public.notification_policy_occurrences.identity_key IS
  'Stable string: domain:objectId:anchorIso:triggerOffsetHours:occurrenceIndex (see occurrenceIdentity).';

CREATE INDEX notification_policy_occurrences_due_idx
  ON public.notification_policy_occurrences (group_id, domain, status, eligible_at);
CREATE INDEX notification_policy_occurrences_object_idx
  ON public.notification_policy_occurrences (group_id, domain, object_id);

-- ---------------------------------------------------------------------------
-- F) updated_at maintenance — SECURITY INVOKER trigger, NOT DEFINER
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.notification_policy_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notification_policy_set_updated_at() IS
  'M2 updated_at bump. SECURITY INVOKER. Trigger-only. Not a send path. Not SECURITY DEFINER.';

REVOKE ALL ON FUNCTION public.notification_policy_set_updated_at() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notification_policy_set_updated_at() TO authenticated;

CREATE TRIGGER trg_notification_policies_updated_at
  BEFORE UPDATE ON public.notification_policies
  FOR EACH ROW EXECUTE FUNCTION public.notification_policy_set_updated_at();

CREATE TRIGGER trg_notification_policy_triggers_updated_at
  BEFORE UPDATE ON public.notification_policy_triggers
  FOR EACH ROW EXECUTE FUNCTION public.notification_policy_set_updated_at();

CREATE TRIGGER trg_notification_policy_occurrences_updated_at
  BEFORE UPDATE ON public.notification_policy_occurrences
  FOR EACH ROW EXECUTE FUNCTION public.notification_policy_set_updated_at();

-- ---------------------------------------------------------------------------
-- G) RLS: ENABLE + FORCE on all three
-- Permission: settings.manage via has_group_permission (Cut 1 active).
-- Do NOT AND is_group_member (live helper does not exclude exited).
-- ---------------------------------------------------------------------------
ALTER TABLE public.notification_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_policies FORCE ROW LEVEL SECURITY;

ALTER TABLE public.notification_policy_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_policy_triggers FORCE ROW LEVEL SECURITY;

ALTER TABLE public.notification_policy_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_policy_occurrences FORCE ROW LEVEL SECURITY;

CREATE POLICY m2_np_select ON public.notification_policies
  FOR SELECT TO authenticated
  USING (public.has_group_permission(group_id, 'settings.manage'));

CREATE POLICY m2_np_insert ON public.notification_policies
  FOR INSERT TO authenticated
  WITH CHECK (public.has_group_permission(group_id, 'settings.manage'));

CREATE POLICY m2_np_update ON public.notification_policies
  FOR UPDATE TO authenticated
  USING (public.has_group_permission(group_id, 'settings.manage'))
  WITH CHECK (public.has_group_permission(group_id, 'settings.manage'));

CREATE POLICY m2_np_delete ON public.notification_policies
  FOR DELETE TO authenticated
  USING (public.has_group_permission(group_id, 'settings.manage'));

CREATE POLICY m2_npt_select ON public.notification_policy_triggers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.notification_policies p
      WHERE p.id = policy_id
        AND public.has_group_permission(p.group_id, 'settings.manage')
    )
  );

CREATE POLICY m2_npt_insert ON public.notification_policy_triggers
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.notification_policies p
      WHERE p.id = policy_id
        AND public.has_group_permission(p.group_id, 'settings.manage')
    )
  );

CREATE POLICY m2_npt_update ON public.notification_policy_triggers
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.notification_policies p
      WHERE p.id = policy_id
        AND public.has_group_permission(p.group_id, 'settings.manage')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.notification_policies p
      WHERE p.id = policy_id
        AND public.has_group_permission(p.group_id, 'settings.manage')
    )
  );

CREATE POLICY m2_npt_delete ON public.notification_policy_triggers
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.notification_policies p
      WHERE p.id = policy_id
        AND public.has_group_permission(p.group_id, 'settings.manage')
    )
  );

-- Occurrences: authenticated SELECT-only. Intentionally no INSERT/UPDATE/DELETE policies.
CREATE POLICY m2_npo_select ON public.notification_policy_occurrences
  FOR SELECT TO authenticated
  USING (public.has_group_permission(group_id, 'settings.manage'));

COMMENT ON POLICY m2_np_select ON public.notification_policies IS
  'READ requires has_group_permission(group_id, settings.manage). Cut 1 active membership is inside that helper. Ordinary members excluded. notifications.manage is not a key.';
COMMENT ON POLICY m2_npo_select ON public.notification_policy_occurrences IS
  'DORMANT: authenticated SELECT-only. No authenticated mutation policies. No service_role DML grant.';

-- ---------------------------------------------------------------------------
-- H) Grants — least privilege. NO notifications_queue grants.
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.notification_policies FROM PUBLIC, anon, service_role;
REVOKE ALL ON public.notification_policy_triggers FROM PUBLIC, anon, service_role;
REVOKE ALL ON public.notification_policy_occurrences FROM PUBLIC, anon, service_role, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_policies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_policy_triggers TO authenticated;
GRANT SELECT ON public.notification_policy_occurrences TO authenticated;
GRANT SELECT ON public.notification_policies TO service_role;
GRANT SELECT ON public.notification_policy_triggers TO service_role;
GRANT SELECT ON public.notification_policy_occurrences TO service_role;

-- ---------------------------------------------------------------------------
-- I) Postconditions — fail closed
-- ---------------------------------------------------------------------------
DO $m2_post$
DECLARE
  v_enabled_def text;
  v_push_def text;
  v_email_def text;
  v_sms_def text;
  v_wa_def text;
  v_in_app_def text;
  v_force_policies boolean;
  v_force_triggers boolean;
  v_force_occ boolean;
  v_pol_count int;
  v_trig_count int;
  v_occ_count int;
  v_queue_delta bigint;
  v_enqueue_changed int;
  v_queue_acl_changed int;
  v_occ_insert_auth boolean;
  v_occ_update_auth boolean;
  v_occ_delete_auth boolean;
  v_occ_insert_service boolean;
  v_queue_insert_auth boolean;
  v_queue_insert_service boolean;
  v_definer_count int;
  v_announce_ok int;
  v_npo_write_policies int;
BEGIN
  SELECT column_default INTO v_enabled_def
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'notification_policies' AND column_name = 'enabled';
  SELECT column_default INTO v_push_def
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'notification_policies' AND column_name = 'channel_push';
  SELECT column_default INTO v_email_def
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'notification_policies' AND column_name = 'channel_email';
  SELECT column_default INTO v_sms_def
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'notification_policies' AND column_name = 'channel_sms';
  SELECT column_default INTO v_wa_def
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'notification_policies' AND column_name = 'channel_whatsapp';
  SELECT column_default INTO v_in_app_def
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'notification_policies' AND column_name = 'channel_in_app';

  IF v_enabled_def IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'M2_ABORT: enabled DEFAULT is % (expected false)', v_enabled_def;
  END IF;
  IF v_push_def IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'M2_ABORT: channel_push DEFAULT is % (expected false)', v_push_def;
  END IF;
  IF v_email_def IS DISTINCT FROM 'false'
     OR v_sms_def IS DISTINCT FROM 'false'
     OR v_wa_def IS DISTINCT FROM 'false'
     OR v_in_app_def IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'M2_ABORT: channel defaults must be false (email=% sms=% wa=% in_app=%)',
      v_email_def, v_sms_def, v_wa_def, v_in_app_def;
  END IF;

  SELECT relforcerowsecurity INTO v_force_policies
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'notification_policies';
  SELECT relforcerowsecurity INTO v_force_triggers
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'notification_policy_triggers';
  SELECT relforcerowsecurity INTO v_force_occ
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'notification_policy_occurrences';
  IF NOT (v_force_policies AND v_force_triggers AND v_force_occ) THEN
    RAISE EXCEPTION 'M2_ABORT: FORCE RLS required on all three policy tables';
  END IF;

  SELECT count(*) INTO v_pol_count FROM public.notification_policies;
  SELECT count(*) INTO v_trig_count FROM public.notification_policy_triggers;
  SELECT count(*) INTO v_occ_count FROM public.notification_policy_occurrences;
  IF v_pol_count <> 0 OR v_trig_count <> 0 OR v_occ_count <> 0 THEN
    RAISE EXCEPTION 'M2_ABORT: migration inserted policy/trigger/occurrence rows (%, %, %)',
      v_pol_count, v_trig_count, v_occ_count;
  END IF;

  SELECT (SELECT n FROM m2_pre_queue_count) - count(*) INTO v_queue_delta
  FROM public.notifications_queue;
  -- delta of pre - post; expect 0 (and post cannot be higher)
  IF (SELECT n FROM m2_pre_queue_count) IS DISTINCT FROM
       (SELECT count(*) FROM public.notifications_queue) THEN
    RAISE EXCEPTION 'M2_ABORT: notifications_queue row count changed during 00117 (delta pre-post=% )',
      v_queue_delta;
  END IF;

  -- R4 / R8 / R11: fingerprints + ACL unchanged vs snapshot AND vs live pin
  SELECT count(*) INTO v_enqueue_changed
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN m2_pre_hgp pre
  WHERE n.nspname = 'public'
    AND p.proname = 'has_group_permission'
    AND (
      pg_get_function_identity_arguments(p.oid) IS DISTINCT FROM pre.identity_args
      OR pg_get_function_result(p.oid) IS DISTINCT FROM pre.result_type
      OR pg_get_userbyid(p.proowner) IS DISTINCT FROM pre.owner
      OR p.prosecdef IS DISTINCT FROM pre.prosecdef
      OR p.proconfig IS DISTINCT FROM pre.proconfig
      OR md5(pg_get_functiondef(p.oid)) IS DISTINCT FROM pre.def_md5
      OR md5(p.prosrc) IS DISTINCT FROM pre.src_md5
      OR md5(pg_get_functiondef(p.oid)) IS DISTINCT FROM '695368464e97297fbf0f90ce7345162f'
      OR md5(p.prosrc) IS DISTINCT FROM '96a296dfd541c7fc75ec68c4da1d92ff'
    );
  IF v_enqueue_changed <> 0 THEN
    RAISE EXCEPTION 'M2_ABORT: has_group_permission fingerprint changed after 00117 DDL';
  END IF;

  SELECT count(*) INTO v_queue_acl_changed
  FROM (
    (
      SELECT concat_ws('|', role_name, privilege, grantor_name, is_grantable) FROM m2_pre_hgp_acl
      EXCEPT
      SELECT concat_ws('|',
        CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE gr.rolname::text END,
        a.privilege_type::text,
        go.rolname::text,
        CASE WHEN a.is_grantable THEN 'true' ELSE 'false' END)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS a
      LEFT JOIN pg_roles gr ON gr.oid = a.grantee
      LEFT JOIN pg_roles go ON go.oid = a.grantor
      WHERE n.nspname = 'public' AND p.proname = 'has_group_permission'
    )
    UNION ALL
    (
      SELECT concat_ws('|',
        CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE gr.rolname::text END,
        a.privilege_type::text,
        go.rolname::text,
        CASE WHEN a.is_grantable THEN 'true' ELSE 'false' END)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS a
      LEFT JOIN pg_roles gr ON gr.oid = a.grantee
      LEFT JOIN pg_roles go ON go.oid = a.grantor
      WHERE n.nspname = 'public' AND p.proname = 'has_group_permission'
      EXCEPT
      SELECT concat_ws('|', role_name, privilege, grantor_name, is_grantable) FROM m2_pre_hgp_acl
    )
  ) d;
  IF v_queue_acl_changed <> 0 THEN
    RAISE EXCEPTION 'M2_ABORT: has_group_permission ACL changed after 00117 DDL';
  END IF;

  SELECT count(*) INTO v_enqueue_changed
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN m2_pre_enqueue pre
  WHERE n.nspname = 'public'
    AND p.proname = 'enqueue_outbound_notification'
    AND (
      pg_get_function_identity_arguments(p.oid) IS DISTINCT FROM pre.identity_args
      OR pg_get_function_result(p.oid) IS DISTINCT FROM pre.result_type
      OR pg_get_userbyid(p.proowner) IS DISTINCT FROM pre.owner
      OR p.prosecdef IS DISTINCT FROM pre.prosecdef
      OR p.proconfig IS DISTINCT FROM pre.proconfig
      OR md5(pg_get_functiondef(p.oid)) IS DISTINCT FROM pre.def_md5
      OR md5(p.prosrc) IS DISTINCT FROM pre.src_md5
      OR md5(pg_get_functiondef(p.oid)) IS DISTINCT FROM 'dbdb16cdced6cae9cbdbfb6a6a9f421f'
      OR md5(p.prosrc) IS DISTINCT FROM '3fa76af51e431ccbd31eb033dcff0b80'
    );
  IF v_enqueue_changed <> 0 THEN
    RAISE EXCEPTION 'M2_ABORT: enqueue_outbound_notification identity/return/owner/DEFINER/proconfig/body/ACL fingerprint changed';
  END IF;

  SELECT count(*) INTO v_queue_acl_changed
  FROM (
    (
      SELECT concat_ws('|', role_name, privilege, grantor_name, is_grantable) FROM m2_pre_enqueue_acl
      EXCEPT
      SELECT concat_ws('|',
        CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE gr.rolname::text END,
        a.privilege_type::text,
        go.rolname::text,
        CASE WHEN a.is_grantable THEN 'true' ELSE 'false' END)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS a
      LEFT JOIN pg_roles gr ON gr.oid = a.grantee
      LEFT JOIN pg_roles go ON go.oid = a.grantor
      WHERE n.nspname = 'public' AND p.proname = 'enqueue_outbound_notification'
    )
    UNION ALL
    (
      SELECT concat_ws('|',
        CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE gr.rolname::text END,
        a.privilege_type::text,
        go.rolname::text,
        CASE WHEN a.is_grantable THEN 'true' ELSE 'false' END)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS a
      LEFT JOIN pg_roles gr ON gr.oid = a.grantee
      LEFT JOIN pg_roles go ON go.oid = a.grantor
      WHERE n.nspname = 'public' AND p.proname = 'enqueue_outbound_notification'
      EXCEPT
      SELECT concat_ws('|', role_name, privilege, grantor_name, is_grantable) FROM m2_pre_enqueue_acl
    )
  ) d;
  IF v_queue_acl_changed <> 0 THEN
    RAISE EXCEPTION 'M2_ABORT: enqueue_outbound_notification ACL changed after 00117 DDL';
  END IF;

  SELECT count(*) INTO v_queue_acl_changed
  FROM (
    (
      SELECT concat_ws('|', role_name, privilege, grantor_name, is_grantable) FROM m2_pre_queue_acl
      EXCEPT
      SELECT concat_ws('|',
        CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE gr.rolname::text END,
        a.privilege_type::text,
        go.rolname::text,
        CASE WHEN a.is_grantable THEN 'true' ELSE 'false' END)
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) AS a
      LEFT JOIN pg_roles gr ON gr.oid = a.grantee
      LEFT JOIN pg_roles go ON go.oid = a.grantor
      WHERE n.nspname = 'public' AND c.relname = 'notifications_queue'
    )
    UNION ALL
    (
      SELECT concat_ws('|',
        CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE gr.rolname::text END,
        a.privilege_type::text,
        go.rolname::text,
        CASE WHEN a.is_grantable THEN 'true' ELSE 'false' END)
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) AS a
      LEFT JOIN pg_roles gr ON gr.oid = a.grantee
      LEFT JOIN pg_roles go ON go.oid = a.grantor
      WHERE n.nspname = 'public' AND c.relname = 'notifications_queue'
      EXCEPT
      SELECT concat_ws('|', role_name, privilege, grantor_name, is_grantable) FROM m2_pre_queue_acl
    )
  ) d;
  IF v_queue_acl_changed <> 0 THEN
    RAISE EXCEPTION 'M2_ABORT: notifications_queue TABLE ACL changed after 00117 DDL';
  END IF;

  SELECT count(*) INTO v_queue_acl_changed
  FROM (
    (
      SELECT concat_ws('|', attname, role_name, privilege, grantor_name, is_grantable) FROM m2_pre_queue_col_acl
      EXCEPT
      SELECT concat_ws('|',
        att.attname::text,
        CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE gr.rolname::text END,
        a.privilege_type::text,
        go.rolname::text,
        CASE WHEN a.is_grantable THEN 'true' ELSE 'false' END)
      FROM pg_attribute att
      JOIN pg_class c ON c.oid = att.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN LATERAL aclexplode(att.attacl) AS a ON att.attacl IS NOT NULL
      LEFT JOIN pg_roles gr ON gr.oid = a.grantee
      LEFT JOIN pg_roles go ON go.oid = a.grantor
      WHERE n.nspname = 'public' AND c.relname = 'notifications_queue'
        AND att.attnum > 0 AND NOT att.attisdropped AND att.attacl IS NOT NULL
    )
    UNION ALL
    (
      SELECT concat_ws('|',
        att.attname::text,
        CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE gr.rolname::text END,
        a.privilege_type::text,
        go.rolname::text,
        CASE WHEN a.is_grantable THEN 'true' ELSE 'false' END)
      FROM pg_attribute att
      JOIN pg_class c ON c.oid = att.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN LATERAL aclexplode(att.attacl) AS a ON att.attacl IS NOT NULL
      LEFT JOIN pg_roles gr ON gr.oid = a.grantee
      LEFT JOIN pg_roles go ON go.oid = a.grantor
      WHERE n.nspname = 'public' AND c.relname = 'notifications_queue'
        AND att.attnum > 0 AND NOT att.attisdropped AND att.attacl IS NOT NULL
      EXCEPT
      SELECT concat_ws('|', attname, role_name, privilege, grantor_name, is_grantable) FROM m2_pre_queue_col_acl
    )
  ) d;
  IF v_queue_acl_changed <> 0 THEN
    RAISE EXCEPTION 'M2_ABORT: notifications_queue COLUMN attacl changed after 00117 DDL';
  END IF;

  -- R13 post: service_role UPDATE columns exactly the five live columns
  IF (
    SELECT array_agg(att.attname::text ORDER BY att.attname)
    FROM pg_attribute att
    JOIN pg_class c ON c.oid = att.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN LATERAL aclexplode(att.attacl) AS a ON att.attacl IS NOT NULL
    LEFT JOIN pg_roles gr ON gr.oid = a.grantee
    WHERE n.nspname = 'public' AND c.relname = 'notifications_queue'
      AND att.attnum > 0 AND NOT att.attisdropped
      AND a.privilege_type = 'UPDATE'
      AND gr.rolname = 'service_role'
  ) IS DISTINCT FROM ARRAY['attempts','data','error_message','sent_at','status']::text[] THEN
    RAISE EXCEPTION 'M2_ABORT: service_role UPDATE column set drifted after 00117 DDL';
  END IF;

  SELECT has_table_privilege('authenticated', 'public.notification_policy_occurrences', 'INSERT')
    INTO v_occ_insert_auth;
  SELECT has_table_privilege('authenticated', 'public.notification_policy_occurrences', 'UPDATE')
    INTO v_occ_update_auth;
  SELECT has_table_privilege('authenticated', 'public.notification_policy_occurrences', 'DELETE')
    INTO v_occ_delete_auth;
  SELECT has_table_privilege('service_role', 'public.notification_policy_occurrences', 'INSERT')
    INTO v_occ_insert_service;
  IF v_occ_insert_auth OR v_occ_update_auth OR v_occ_delete_auth THEN
    RAISE EXCEPTION 'M2_ABORT: authenticated must not mutate occurrences';
  END IF;
  IF v_occ_insert_service THEN
    RAISE EXCEPTION 'M2_ABORT: service_role must not have occurrences INSERT (no blanket DML)';
  END IF;

  SELECT has_table_privilege('authenticated', 'public.notifications_queue', 'INSERT')
    INTO v_queue_insert_auth;
  SELECT has_table_privilege('service_role', 'public.notifications_queue', 'INSERT')
    INTO v_queue_insert_service;
  IF v_queue_insert_auth OR v_queue_insert_service THEN
    RAISE EXCEPTION 'M2_ABORT: notifications_queue INSERT granted — forbidden';
  END IF;

  SELECT count(*) INTO v_definer_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'm2_is_valid_iana_timezone',
      'notification_policy_set_updated_at'
    )
    AND p.prosecdef = true;
  IF v_definer_count <> 0 THEN
    RAISE EXCEPTION 'M2_ABORT: SECURITY DEFINER function created by 00117 — not authorized';
  END IF;

  SELECT count(*) INTO v_announce_ok
  FROM pg_constraint
  WHERE conrelid = 'public.notification_policies'::regclass
    AND conname = 'notification_policies_domain_check'
    AND pg_get_constraintdef(oid) LIKE '%announcement%';
  IF v_announce_ok <> 0 THEN
    RAISE EXCEPTION 'M2_ABORT: announcement must not appear in policy domain CHECK';
  END IF;

  SELECT count(*) INTO v_npo_write_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'notification_policy_occurrences'
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL');
  IF v_npo_write_policies <> 0 THEN
    RAISE EXCEPTION 'M2_ABORT: occurrences must have SELECT-only RLS (found % write policies)',
      v_npo_write_policies;
  END IF;
END
$m2_post$;

COMMIT;
