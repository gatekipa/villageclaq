-- Complete the approved spreadsheet/import and optional account-activation
-- contract without widening table access. XLSX and CSV both bind a stable
-- source row identity. Proxy-claim email remains queue-only and is still
-- subject to founder delivery suppression at the worker boundary.

BEGIN;

DO $do$
DECLARE
  v_sql text;
  v_before text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_sql
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'create_offline_member'
     AND pg_get_function_identity_arguments(p.oid) = 'p_request_id uuid, p_command jsonb';

  IF v_sql IS NULL THEN
    RAISE EXCEPTION 'CREATE_OFFLINE_MEMBER_NOT_FOUND';
  END IF;
  v_before := v_sql;

  v_sql := replace(
    v_sql,
    $$v_source NOT IN ('manual','csv_import')$$,
    $$v_source NOT IN ('manual','csv_import','xlsx_import')$$
  );
  v_sql := replace(
    v_sql,
    $$v_source='csv_import' AND v_source_key IS NULL$$,
    $$v_source IN ('csv_import','xlsx_import') AND v_source_key IS NULL$$
  );

  IF v_sql = v_before
     OR position('xlsx_import' in v_sql) = 0
     OR position($$v_source IN ('csv_import','xlsx_import')$$ in v_sql) = 0 THEN
    RAISE EXCEPTION 'CREATE_OFFLINE_MEMBER_IMPORT_CONTRACT_MISMATCH';
  END IF;

  EXECUTE v_sql;
END;
$do$;

DO $do$
DECLARE
  v_sql text;
  v_before text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_sql
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'cut2_internal_channel_allowed'
     AND pg_get_function_identity_arguments(p.oid) = 'p_type text, p_channel notification_channel';

  IF v_sql IS NULL THEN
    RAISE EXCEPTION 'CUT2_CHANNEL_ALLOWLIST_NOT_FOUND';
  END IF;
  v_before := v_sql;

  v_sql := replace(
    v_sql,
    $$WHEN 'proxy_claim' THEN p_channel IN ('whatsapp'::public.notification_channel, 'sms'::public.notification_channel)$$,
    $$WHEN 'proxy_claim' THEN p_channel IN ('whatsapp'::public.notification_channel, 'sms'::public.notification_channel, 'email'::public.notification_channel)$$
  );

  IF v_sql = v_before
     OR position($$'proxy_claim'$$ in v_sql) = 0
     OR position($$'email'::public.notification_channel$$ in v_sql) = 0 THEN
    RAISE EXCEPTION 'PROXY_CLAIM_EMAIL_ALLOWLIST_CONTRACT_MISMATCH';
  END IF;

  EXECUTE v_sql;
END;
$do$;

COMMENT ON FUNCTION public.create_offline_member(uuid,jsonb) IS
  'Authoritative offline-member creation. Manual, CSV and XLSX sources remain request-bound; file imports require stable source identity.';
COMMENT ON FUNCTION public.cut2_internal_channel_allowed(text,public.notification_channel) IS
  'Private fail-closed notification type/channel allowlist, including explicit proxy-claim email activation invitations.';

COMMIT;
