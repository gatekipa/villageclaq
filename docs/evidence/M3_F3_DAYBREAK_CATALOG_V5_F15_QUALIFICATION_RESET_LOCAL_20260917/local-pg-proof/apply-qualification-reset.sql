-- F13 qualification-reset generated from FINITE_OBJECT_ALLOWLIST
-- scopeSqlIdentitySha256 8b91a29cd3178e40d2ef5d79b6c585c1f7e2e615bd3967935546b68f2f9f8a0e
-- RESTRICT only. Generated from the finite allowlist; unexpected leftovers block.
-- T0_BIND completed client-side (candidate SHA, disposable pins, founder artifact, production refuse).
-- T1_BEGIN
BEGIN ISOLATION LEVEL SERIALIZABLE;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
SELECT pg_advisory_xact_lock(-1953389924, -753430976);
SELECT '{"schema":"f15-qualification-reset-tx-observation-v1","phase":"T1_BEGIN","event":"began"}'::text;
-- T2_LOCK
DO $f13_lock$
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'F13_HISTORY_RELATION_MISSING';
  END IF;
  EXECUTE 'LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE';
  IF to_regclass('financial_core.opening_provenances') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE financial_core.opening_provenances IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('financial_core.correction_command_payloads') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE financial_core.correction_command_payloads IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('financial_core.posting_command_payloads') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE financial_core.posting_command_payloads IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.financial_postings') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.financial_postings IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.financial_events') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.financial_events IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.financial_categories') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.financial_categories IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.financial_funds') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.financial_funds IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.financial_accounts') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.financial_accounts IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.financial_ledger_epochs') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.financial_ledger_epochs IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('financial_private.internal_financial_tenants') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE financial_private.internal_financial_tenants IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('financial_private.epoch_transitions') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE financial_private.epoch_transitions IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.notification_policy_triggers') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.notification_policy_triggers IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.notification_policy_occurrences') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.notification_policy_occurrences IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.notification_policies') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.notification_policies IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.position_assignments') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.position_assignments IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.position_permissions') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.position_permissions IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.group_positions') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.group_positions IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.hosting_swap_requests') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.hosting_swap_requests IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.hosting_assignments') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.hosting_assignments IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.hosting_rosters') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.hosting_rosters IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.payment_obligation_applications') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.payment_obligation_applications IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.payments') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.payments IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.contribution_obligations') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.contribution_obligations IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.relief_remittances') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.relief_remittances IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.relief_claims') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.relief_claims IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.relief_enrollments') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.relief_enrollments IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.relief_plans') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.relief_plans IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.fines') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.fines IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.member_transfers') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.member_transfers IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.invitations') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.invitations IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.elections') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.elections IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.events') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.events IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.meeting_minutes') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.meeting_minutes IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.announcements') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.announcements IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.notifications_queue') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.notifications_queue IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.loans') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.loans IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.projects') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.projects IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.group_subscriptions') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.group_subscriptions IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.memberships') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.memberships IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.groups') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.groups IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.profiles') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.profiles IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.organizations') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.organizations IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.__f3_acl_platform_canary_20260915') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.__f3_acl_platform_canary_20260915 IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.__f3_acl_platform_canary_20260915_id_seq') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.__f3_acl_platform_canary_20260915_id_seq IN ACCESS EXCLUSIVE MODE';
  END IF;
END
$f13_lock$;
SELECT '{"schema":"f15-qualification-reset-tx-observation-v1","phase":"T2_LOCK","event":"locked"}'::text;
-- T3_REVALIDATE
DO $f13_revalidate$
DECLARE
  extra text;
  hist_count integer;
  hist_name text;
BEGIN
  SELECT n.nspname || '.' || c.relname INTO extra
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('financial_core', 'financial_private', 'public')
    AND c.relkind IN ('r', 'S')
    AND (n.nspname || '.' || c.relname) <> ALL (ARRAY['financial_core.opening_provenances', 'financial_core.correction_command_payloads', 'financial_core.posting_command_payloads', 'public.financial_postings', 'public.financial_events', 'public.financial_categories', 'public.financial_funds', 'public.financial_accounts', 'public.financial_ledger_epochs', 'financial_private.internal_financial_tenants', 'financial_private.epoch_transitions', 'public.notification_policy_triggers', 'public.notification_policy_occurrences', 'public.notification_policies', 'public.position_assignments', 'public.position_permissions', 'public.group_positions', 'public.hosting_swap_requests', 'public.hosting_assignments', 'public.hosting_rosters', 'public.payment_obligation_applications', 'public.payments', 'public.contribution_obligations', 'public.relief_remittances', 'public.relief_claims', 'public.relief_enrollments', 'public.relief_plans', 'public.fines', 'public.member_transfers', 'public.invitations', 'public.elections', 'public.events', 'public.meeting_minutes', 'public.announcements', 'public.notifications_queue', 'public.loans', 'public.projects', 'public.group_subscriptions', 'public.memberships', 'public.groups', 'public.profiles', 'public.organizations', 'public.__f3_acl_platform_canary_20260915', 'public.__f3_acl_platform_canary_20260915_id_seq'])
  LIMIT 1;
  IF extra IS NOT NULL THEN
    RAISE EXCEPTION 'F13_UNEXPECTED_OBJECT_OR_DEPENDENCY: %', extra;
  END IF;
  SELECT n.nspname || '.' || c.relname INTO extra
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('financial_core', 'financial_private', 'public')
    AND c.relkind = 'v'
  LIMIT 1;
  IF extra IS NOT NULL THEN
    RAISE EXCEPTION 'F13_UNEXPECTED_OBJECT_OR_DEPENDENCY: %', extra;
  END IF;
  SELECT (n.nspname || '.' || p.proname || '(' || COALESCE((
    SELECT string_agg(pg_catalog.format_type(u.typoid, NULL), ',' ORDER BY u.ord)
    FROM unnest(p.proargtypes) WITH ORDINALITY AS u(typoid, ord)
  ), '') || ')') INTO extra
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('financial_core', 'financial_private', 'public')
    AND (n.nspname || '.' || p.proname || '(' || COALESCE((
    SELECT string_agg(pg_catalog.format_type(u.typoid, NULL), ',' ORDER BY u.ord)
    FROM unnest(p.proargtypes) WITH ORDINALITY AS u(typoid, ord)
  ), '') || ')') <> ALL (ARRAY['public.post_financial_opening_cash(jsonb)', 'public.get_financial_cashbook(uuid,timestamp with time zone,timestamp with time zone,uuid,text,integer,integer)', 'public.get_financial_projection_bundle(uuid,timestamp with time zone,timestamp with time zone,timestamp with time zone)', 'public.post_financial_command(jsonb)', 'public.correct_financial_event(jsonb)', 'public.enqueue_outbound_notification(text,uuid,notification_channel,uuid,text)', 'public.execute_member_transfer(jsonb)', 'public.request_member_transfer(jsonb)', 'public.has_group_permission(uuid,text,uuid)', 'public.compute_member_standing(uuid)', 'public.m2_is_valid_iana_timezone(text)', 'public.notification_policy_set_updated_at()', 'public.uuid_generate_v5(uuid,text)', 'financial_core.post_f3_opening_cash(jsonb)', 'financial_core.f3_opening_safe_text(text,integer,boolean)', 'financial_core.guard_f3_opening_provenance()', 'financial_core.correct_f3_command(jsonb)', 'financial_core.check_f3_correction_closure()', 'financial_core.guard_f3_correction_lineage()', 'financial_core.assert_f3_correction_postings(uuid,jsonb)', 'financial_core.resolve_f3_correction_replacement(jsonb,jsonb,boolean)', 'financial_core.f3_correction_posting_json(uuid,uuid,uuid,uuid,text,timestamp with time zone,numeric,financial_control_class,uuid,uuid,uuid,financial_category_class,uuid,uuid)', 'financial_core.f3_correction_child_id(uuid,uuid,text)', 'financial_core.f3_correction_reason(jsonb)', 'financial_core.f3_correction_signed_amount(numeric,text)', 'financial_core.f3_correction_timestamp(timestamp with time zone)', 'financial_core.f3_correction_fingerprint(jsonb)', 'financial_core.f3_correction_canonical(jsonb)', 'financial_core.guard_f3_correction_payload()', 'financial_core.projection_cashbook_rows(uuid,boolean)', 'financial_core.format_projection_amount(numeric,text)', 'financial_core.post_f3_command(jsonb,jsonb)', 'financial_core.lock_f3_identity(uuid,uuid,text,text,text)', 'financial_core.check_f3_posting_closure()', 'financial_core.guard_f3_posting_closure()', 'financial_core.guard_f3_payload()', 'financial_core.f3_fingerprint(jsonb)', 'financial_core.f3_canonical(jsonb)', 'financial_core.f3_trim(text)', 'financial_core.f3_timestamp(jsonb)', 'financial_core.f3_amount(jsonb,text)', 'financial_core.f3_currency(jsonb)', 'financial_core.f3_uuid(jsonb,boolean)', 'financial_core.lock_financial_occurrence(uuid,text,text,text,uuid)', 'financial_core.assert_finances_manage(uuid)', 'financial_core.can_view_finances(uuid)', 'financial_core.can_manage_finances(uuid)', 'financial_core.check_event_balance_from_posting()', 'financial_core.check_event_balance_from_event()', 'financial_core.assert_financial_event_balanced(uuid)', 'financial_core.guard_financial_posting_history()', 'financial_core.guard_financial_event_history()', 'financial_core.guard_financial_event_epoch()', 'financial_core.guard_financial_category()', 'financial_core.guard_financial_fund()', 'financial_core.guard_financial_account()', 'financial_core.currency_scale(text)', 'financial_private.guard_ledger_epoch()'])
  LIMIT 1;
  IF extra IS NOT NULL THEN
    RAISE EXCEPTION 'F13_UNEXPECTED_OBJECT_OR_DEPENDENCY: %', extra;
  END IF;
  SELECT n.nspname || '.' || t.typname INTO extra
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname IN ('financial_core', 'financial_private', 'public')
    AND t.typtype IN ('e', 'c')
    AND NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.reltype = t.oid AND c.relkind = 'r')
    AND (n.nspname || '.' || t.typname) <> ALL (ARRAY['public.financial_account_kind', 'public.financial_account_status', 'public.financial_category_class', 'public.financial_config_status', 'public.financial_control_class', 'public.financial_event_class', 'public.financial_event_status', 'public.notification_channel'])
  LIMIT 1;
  IF extra IS NOT NULL THEN
    RAISE EXCEPTION 'F13_UNEXPECTED_OBJECT_OR_DEPENDENCY: %', extra;
  END IF;
  SELECT con.conname INTO extra
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace
  JOIN pg_class frel ON frel.oid = con.confrelid
  JOIN pg_namespace fn ON fn.oid = frel.relnamespace
  WHERE con.contype = 'f'
    AND (
      ((n.nspname || '.' || rel.relname) = ANY (ARRAY['financial_core.opening_provenances', 'financial_core.correction_command_payloads', 'financial_core.posting_command_payloads', 'public.financial_postings', 'public.financial_events', 'public.financial_categories', 'public.financial_funds', 'public.financial_accounts', 'public.financial_ledger_epochs', 'financial_private.internal_financial_tenants', 'financial_private.epoch_transitions', 'public.notification_policy_triggers', 'public.notification_policy_occurrences', 'public.notification_policies', 'public.position_assignments', 'public.position_permissions', 'public.group_positions', 'public.hosting_swap_requests', 'public.hosting_assignments', 'public.hosting_rosters', 'public.payment_obligation_applications', 'public.payments', 'public.contribution_obligations', 'public.relief_remittances', 'public.relief_claims', 'public.relief_enrollments', 'public.relief_plans', 'public.fines', 'public.member_transfers', 'public.invitations', 'public.elections', 'public.events', 'public.meeting_minutes', 'public.announcements', 'public.notifications_queue', 'public.loans', 'public.projects', 'public.group_subscriptions', 'public.memberships', 'public.groups', 'public.profiles', 'public.organizations', 'public.__f3_acl_platform_canary_20260915', 'public.__f3_acl_platform_canary_20260915_id_seq']))
      IS DISTINCT FROM
      ((fn.nspname || '.' || frel.relname) = ANY (ARRAY['financial_core.opening_provenances', 'financial_core.correction_command_payloads', 'financial_core.posting_command_payloads', 'public.financial_postings', 'public.financial_events', 'public.financial_categories', 'public.financial_funds', 'public.financial_accounts', 'public.financial_ledger_epochs', 'financial_private.internal_financial_tenants', 'financial_private.epoch_transitions', 'public.notification_policy_triggers', 'public.notification_policy_occurrences', 'public.notification_policies', 'public.position_assignments', 'public.position_permissions', 'public.group_positions', 'public.hosting_swap_requests', 'public.hosting_assignments', 'public.hosting_rosters', 'public.payment_obligation_applications', 'public.payments', 'public.contribution_obligations', 'public.relief_remittances', 'public.relief_claims', 'public.relief_enrollments', 'public.relief_plans', 'public.fines', 'public.member_transfers', 'public.invitations', 'public.elections', 'public.events', 'public.meeting_minutes', 'public.announcements', 'public.notifications_queue', 'public.loans', 'public.projects', 'public.group_subscriptions', 'public.memberships', 'public.groups', 'public.profiles', 'public.organizations', 'public.__f3_acl_platform_canary_20260915', 'public.__f3_acl_platform_canary_20260915_id_seq']))
    )
  LIMIT 1;
  IF extra IS NOT NULL THEN
    RAISE EXCEPTION 'F13_UNEXPECTED_OBJECT_OR_DEPENDENCY: %', extra;
  END IF;
  SELECT version INTO extra FROM supabase_migrations.schema_migrations
  WHERE version <> ALL (ARRAY['20260913173000', '20260913173001', '20260913173002', '20260913173003', '20260913173004', '20260913173005'])
  LIMIT 1;
  IF extra IS NOT NULL THEN
    RAISE EXCEPTION 'F13_HISTORY_KEY_MISMATCH: extra version %', extra;
  END IF;
  SELECT count(*), min(name) INTO hist_count, hist_name
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260913173000';
  IF hist_count > 1 THEN
    RAISE EXCEPTION 'F13_HISTORY_KEY_MISMATCH: duplicate version %', '20260913173000';
  END IF;
  IF hist_count <> 1 OR hist_name IS DISTINCT FROM 'f3_bounded_financial_epoch_foundation' THEN
    RAISE EXCEPTION 'F13_HISTORY_KEY_MISMATCH: version % name %', '20260913173000', coalesce(hist_name, '<null>');
  END IF;
  SELECT count(*), min(name) INTO hist_count, hist_name
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260913173001';
  IF hist_count > 1 THEN
    RAISE EXCEPTION 'F13_HISTORY_KEY_MISMATCH: duplicate version %', '20260913173001';
  END IF;
  IF hist_count <> 1 OR hist_name IS DISTINCT FROM 'f3_01_core_ledger_foundation' THEN
    RAISE EXCEPTION 'F13_HISTORY_KEY_MISMATCH: version % name %', '20260913173001', coalesce(hist_name, '<null>');
  END IF;
  SELECT count(*), min(name) INTO hist_count, hist_name
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260913173002';
  IF hist_count > 1 THEN
    RAISE EXCEPTION 'F13_HISTORY_KEY_MISMATCH: duplicate version %', '20260913173002';
  END IF;
  IF hist_count <> 1 OR hist_name IS DISTINCT FROM 'f3_02_secure_posting_idempotency' THEN
    RAISE EXCEPTION 'F13_HISTORY_KEY_MISMATCH: version % name %', '20260913173002', coalesce(hist_name, '<null>');
  END IF;
  SELECT count(*), min(name) INTO hist_count, hist_name
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260913173003';
  IF hist_count > 1 THEN
    RAISE EXCEPTION 'F13_HISTORY_KEY_MISMATCH: duplicate version %', '20260913173003';
  END IF;
  IF hist_count <> 1 OR hist_name IS DISTINCT FROM 'f3_03_projection_read_proof' THEN
    RAISE EXCEPTION 'F13_HISTORY_KEY_MISMATCH: version % name %', '20260913173003', coalesce(hist_name, '<null>');
  END IF;
  SELECT count(*), min(name) INTO hist_count, hist_name
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260913173004';
  IF hist_count > 1 THEN
    RAISE EXCEPTION 'F13_HISTORY_KEY_MISMATCH: duplicate version %', '20260913173004';
  END IF;
  IF hist_count <> 1 OR hist_name IS DISTINCT FROM 'f3_04_correction_reversal' THEN
    RAISE EXCEPTION 'F13_HISTORY_KEY_MISMATCH: version % name %', '20260913173004', coalesce(hist_name, '<null>');
  END IF;
  SELECT count(*), min(name) INTO hist_count, hist_name
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260913173005';
  IF hist_count > 1 THEN
    RAISE EXCEPTION 'F13_HISTORY_KEY_MISMATCH: duplicate version %', '20260913173005';
  END IF;
  IF hist_count <> 1 OR hist_name IS DISTINCT FROM 'f3_05_opening_cash_command' THEN
    RAISE EXCEPTION 'F13_HISTORY_KEY_MISMATCH: version % name %', '20260913173005', coalesce(hist_name, '<null>');
  END IF;
END
$f13_revalidate$;
SELECT '{"schema":"f15-qualification-reset-tx-observation-v1","phase":"T3_REVALIDATE","event":"revalidated"}'::text;
-- T4_MUTATE / T5_AFFECTED
SELECT '{"schema":"f15-qualification-reset-tx-observation-v1","phase":"T4_MUTATE","event":"mutate_attempted"}'::text;
DO $f13_mutate$
DECLARE
  deleted_count integer;
  deleted_name text;
  deleted_version text;
BEGIN
  EXECUTE 'DROP FUNCTION IF EXISTS public.post_financial_opening_cash(jsonb) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS public.get_financial_cashbook(uuid,timestamp with time zone,timestamp with time zone,uuid,text,integer,integer) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS public.get_financial_projection_bundle(uuid,timestamp with time zone,timestamp with time zone,timestamp with time zone) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS public.post_financial_command(jsonb) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS public.correct_financial_event(jsonb) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS public.enqueue_outbound_notification(text,uuid,notification_channel,uuid,text) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS public.execute_member_transfer(jsonb) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS public.request_member_transfer(jsonb) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS public.has_group_permission(uuid,text,uuid) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS public.compute_member_standing(uuid) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS public.m2_is_valid_iana_timezone(text) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS public.notification_policy_set_updated_at() RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS public.uuid_generate_v5(uuid,text) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.post_f3_opening_cash(jsonb) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.f3_opening_safe_text(text,integer,boolean) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.guard_f3_opening_provenance() RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.correct_f3_command(jsonb) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.check_f3_correction_closure() RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.guard_f3_correction_lineage() RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.assert_f3_correction_postings(uuid,jsonb) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.resolve_f3_correction_replacement(jsonb,jsonb,boolean) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.f3_correction_posting_json(uuid,uuid,uuid,uuid,text,timestamp with time zone,numeric,financial_control_class,uuid,uuid,uuid,financial_category_class,uuid,uuid) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.f3_correction_child_id(uuid,uuid,text) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.f3_correction_reason(jsonb) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.f3_correction_signed_amount(numeric,text) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.f3_correction_timestamp(timestamp with time zone) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.f3_correction_fingerprint(jsonb) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.f3_correction_canonical(jsonb) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.guard_f3_correction_payload() RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.projection_cashbook_rows(uuid,boolean) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.format_projection_amount(numeric,text) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.post_f3_command(jsonb,jsonb) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.lock_f3_identity(uuid,uuid,text,text,text) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.check_f3_posting_closure() RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.guard_f3_posting_closure() RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.guard_f3_payload() RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.f3_fingerprint(jsonb) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.f3_canonical(jsonb) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.f3_trim(text) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.f3_timestamp(jsonb) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.f3_amount(jsonb,text) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.f3_currency(jsonb) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.f3_uuid(jsonb,boolean) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.lock_financial_occurrence(uuid,text,text,text,uuid) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.assert_finances_manage(uuid) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.can_view_finances(uuid) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.can_manage_finances(uuid) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.check_event_balance_from_posting() RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.check_event_balance_from_event() RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.assert_financial_event_balanced(uuid) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.guard_financial_posting_history() RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.guard_financial_event_history() RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.guard_financial_event_epoch() RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.guard_financial_category() RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.guard_financial_fund() RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.guard_financial_account() RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_core.currency_scale(text) RESTRICT;';
  EXECUTE 'DROP FUNCTION IF EXISTS financial_private.guard_ledger_epoch() RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS financial_core.opening_provenances RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS financial_core.correction_command_payloads RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS financial_core.posting_command_payloads RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.financial_postings RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.financial_events RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.financial_categories RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.financial_funds RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.financial_accounts RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.financial_ledger_epochs RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS financial_private.internal_financial_tenants RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS financial_private.epoch_transitions RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.notification_policy_triggers RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.notification_policy_occurrences RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.notification_policies RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.position_assignments RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.position_permissions RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.group_positions RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.hosting_swap_requests RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.hosting_assignments RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.hosting_rosters RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.payment_obligation_applications RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.payments RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.contribution_obligations RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.relief_remittances RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.relief_claims RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.relief_enrollments RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.relief_plans RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.fines RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.member_transfers RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.invitations RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.elections RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.events RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.meeting_minutes RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.announcements RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.notifications_queue RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.loans RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.projects RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.group_subscriptions RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.memberships RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.groups RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.profiles RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.organizations RESTRICT;';
  EXECUTE 'DROP TABLE IF EXISTS public.__f3_acl_platform_canary_20260915 RESTRICT;';
  EXECUTE 'DROP SEQUENCE IF EXISTS public.__f3_acl_platform_canary_20260915_id_seq RESTRICT;';
  EXECUTE 'DROP TYPE IF EXISTS public.financial_account_kind RESTRICT;';
  EXECUTE 'DROP TYPE IF EXISTS public.financial_account_status RESTRICT;';
  EXECUTE 'DROP TYPE IF EXISTS public.financial_category_class RESTRICT;';
  EXECUTE 'DROP TYPE IF EXISTS public.financial_config_status RESTRICT;';
  EXECUTE 'DROP TYPE IF EXISTS public.financial_control_class RESTRICT;';
  EXECUTE 'DROP TYPE IF EXISTS public.financial_event_class RESTRICT;';
  EXECUTE 'DROP TYPE IF EXISTS public.financial_event_status RESTRICT;';
  EXECUTE 'DROP TYPE IF EXISTS public.notification_channel RESTRICT;';
  IF to_regnamespace('financial_core') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'financial_core'
    ) OR EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'financial_core'
    ) OR EXISTS (
      SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'financial_core' AND t.typtype IN ('e', 'c')
        AND NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.reltype = t.oid AND c.relkind = 'r')
    ) THEN
      RAISE EXCEPTION 'F13_SCHEMA_NOT_EMPTY: %', 'financial_core';
    END IF;
    EXECUTE 'DROP SCHEMA IF EXISTS financial_core RESTRICT';
  END IF;
  IF to_regnamespace('financial_private') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'financial_private'
    ) OR EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'financial_private'
    ) OR EXISTS (
      SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'financial_private' AND t.typtype IN ('e', 'c')
        AND NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.reltype = t.oid AND c.relkind = 'r')
    ) THEN
      RAISE EXCEPTION 'F13_SCHEMA_NOT_EMPTY: %', 'financial_private';
    END IF;
    EXECUTE 'DROP SCHEMA IF EXISTS financial_private RESTRICT';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'btree_gist') THEN
    IF EXISTS (
      SELECT 1
      FROM pg_depend d
      JOIN pg_extension e ON e.oid = d.refobjid
      WHERE e.extname = 'btree_gist'
        AND d.deptype = 'n'
    ) THEN
      RAISE EXCEPTION 'F13_UNEXPECTED_OBJECT_OR_DEPENDENCY: leftover dependents of %', 'btree_gist';
    END IF;
    EXECUTE 'DROP EXTENSION IF EXISTS btree_gist RESTRICT';
  END IF;
  deleted_version := NULL;
  deleted_name := NULL;
  deleted_count := 0;
  DELETE FROM supabase_migrations.schema_migrations
  WHERE version = '20260913173000' AND name = 'f3_bounded_financial_epoch_foundation'
  RETURNING version, name INTO deleted_version, deleted_name;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  IF deleted_count <> 1 OR deleted_version IS DISTINCT FROM '20260913173000' OR deleted_name IS DISTINCT FROM 'f3_bounded_financial_epoch_foundation' THEN
    RAISE EXCEPTION 'F13_AFFECTED_ROW_MISMATCH: % %', '20260913173000', coalesce(deleted_name, '<null>');
  END IF;
  deleted_version := NULL;
  deleted_name := NULL;
  deleted_count := 0;
  DELETE FROM supabase_migrations.schema_migrations
  WHERE version = '20260913173001' AND name = 'f3_01_core_ledger_foundation'
  RETURNING version, name INTO deleted_version, deleted_name;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  IF deleted_count <> 1 OR deleted_version IS DISTINCT FROM '20260913173001' OR deleted_name IS DISTINCT FROM 'f3_01_core_ledger_foundation' THEN
    RAISE EXCEPTION 'F13_AFFECTED_ROW_MISMATCH: % %', '20260913173001', coalesce(deleted_name, '<null>');
  END IF;
  deleted_version := NULL;
  deleted_name := NULL;
  deleted_count := 0;
  DELETE FROM supabase_migrations.schema_migrations
  WHERE version = '20260913173002' AND name = 'f3_02_secure_posting_idempotency'
  RETURNING version, name INTO deleted_version, deleted_name;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  IF deleted_count <> 1 OR deleted_version IS DISTINCT FROM '20260913173002' OR deleted_name IS DISTINCT FROM 'f3_02_secure_posting_idempotency' THEN
    RAISE EXCEPTION 'F13_AFFECTED_ROW_MISMATCH: % %', '20260913173002', coalesce(deleted_name, '<null>');
  END IF;
  deleted_version := NULL;
  deleted_name := NULL;
  deleted_count := 0;
  DELETE FROM supabase_migrations.schema_migrations
  WHERE version = '20260913173003' AND name = 'f3_03_projection_read_proof'
  RETURNING version, name INTO deleted_version, deleted_name;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  IF deleted_count <> 1 OR deleted_version IS DISTINCT FROM '20260913173003' OR deleted_name IS DISTINCT FROM 'f3_03_projection_read_proof' THEN
    RAISE EXCEPTION 'F13_AFFECTED_ROW_MISMATCH: % %', '20260913173003', coalesce(deleted_name, '<null>');
  END IF;
  deleted_version := NULL;
  deleted_name := NULL;
  deleted_count := 0;
  DELETE FROM supabase_migrations.schema_migrations
  WHERE version = '20260913173004' AND name = 'f3_04_correction_reversal'
  RETURNING version, name INTO deleted_version, deleted_name;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  IF deleted_count <> 1 OR deleted_version IS DISTINCT FROM '20260913173004' OR deleted_name IS DISTINCT FROM 'f3_04_correction_reversal' THEN
    RAISE EXCEPTION 'F13_AFFECTED_ROW_MISMATCH: % %', '20260913173004', coalesce(deleted_name, '<null>');
  END IF;
  deleted_version := NULL;
  deleted_name := NULL;
  deleted_count := 0;
  DELETE FROM supabase_migrations.schema_migrations
  WHERE version = '20260913173005' AND name = 'f3_05_opening_cash_command'
  RETURNING version, name INTO deleted_version, deleted_name;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  IF deleted_count <> 1 OR deleted_version IS DISTINCT FROM '20260913173005' OR deleted_name IS DISTINCT FROM 'f3_05_opening_cash_command' THEN
    RAISE EXCEPTION 'F13_AFFECTED_ROW_MISMATCH: % %', '20260913173005', coalesce(deleted_name, '<null>');
  END IF;
END
$f13_mutate$;
SELECT '{"schema":"f15-qualification-reset-tx-observation-v1","phase":"T5_AFFECTED","event":"affected_checked"}'::text;
-- T6_FINAL
DO $f13_final$
DECLARE
  leftover text;
BEGIN
  IF to_regprocedure('public.post_financial_opening_cash(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.post_financial_opening_cash(jsonb)';
  END IF;
  IF to_regprocedure('public.get_financial_cashbook(uuid,timestamp with time zone,timestamp with time zone,uuid,text,integer,integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.get_financial_cashbook(uuid,timestamp with time zone,timestamp with time zone,uuid,text,integer,integer)';
  END IF;
  IF to_regprocedure('public.get_financial_projection_bundle(uuid,timestamp with time zone,timestamp with time zone,timestamp with time zone)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.get_financial_projection_bundle(uuid,timestamp with time zone,timestamp with time zone,timestamp with time zone)';
  END IF;
  IF to_regprocedure('public.post_financial_command(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.post_financial_command(jsonb)';
  END IF;
  IF to_regprocedure('public.correct_financial_event(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.correct_financial_event(jsonb)';
  END IF;
  IF to_regprocedure('public.enqueue_outbound_notification(text,uuid,notification_channel,uuid,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.enqueue_outbound_notification(text,uuid,notification_channel,uuid,text)';
  END IF;
  IF to_regprocedure('public.execute_member_transfer(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.execute_member_transfer(jsonb)';
  END IF;
  IF to_regprocedure('public.request_member_transfer(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.request_member_transfer(jsonb)';
  END IF;
  IF to_regprocedure('public.has_group_permission(uuid,text,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.has_group_permission(uuid,text,uuid)';
  END IF;
  IF to_regprocedure('public.compute_member_standing(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.compute_member_standing(uuid)';
  END IF;
  IF to_regprocedure('public.m2_is_valid_iana_timezone(text)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.m2_is_valid_iana_timezone(text)';
  END IF;
  IF to_regprocedure('public.notification_policy_set_updated_at()') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.notification_policy_set_updated_at()';
  END IF;
  IF to_regprocedure('public.uuid_generate_v5(uuid,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.uuid_generate_v5(uuid,text)';
  END IF;
  IF to_regprocedure('financial_core.post_f3_opening_cash(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.post_f3_opening_cash(jsonb)';
  END IF;
  IF to_regprocedure('financial_core.f3_opening_safe_text(text,integer,boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.f3_opening_safe_text(text,integer,boolean)';
  END IF;
  IF to_regprocedure('financial_core.guard_f3_opening_provenance()') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.guard_f3_opening_provenance()';
  END IF;
  IF to_regprocedure('financial_core.correct_f3_command(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.correct_f3_command(jsonb)';
  END IF;
  IF to_regprocedure('financial_core.check_f3_correction_closure()') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.check_f3_correction_closure()';
  END IF;
  IF to_regprocedure('financial_core.guard_f3_correction_lineage()') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.guard_f3_correction_lineage()';
  END IF;
  IF to_regprocedure('financial_core.assert_f3_correction_postings(uuid,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.assert_f3_correction_postings(uuid,jsonb)';
  END IF;
  IF to_regprocedure('financial_core.resolve_f3_correction_replacement(jsonb,jsonb,boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.resolve_f3_correction_replacement(jsonb,jsonb,boolean)';
  END IF;
  IF to_regprocedure('financial_core.f3_correction_posting_json(uuid,uuid,uuid,uuid,text,timestamp with time zone,numeric,financial_control_class,uuid,uuid,uuid,financial_category_class,uuid,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.f3_correction_posting_json(uuid,uuid,uuid,uuid,text,timestamp with time zone,numeric,financial_control_class,uuid,uuid,uuid,financial_category_class,uuid,uuid)';
  END IF;
  IF to_regprocedure('financial_core.f3_correction_child_id(uuid,uuid,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.f3_correction_child_id(uuid,uuid,text)';
  END IF;
  IF to_regprocedure('financial_core.f3_correction_reason(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.f3_correction_reason(jsonb)';
  END IF;
  IF to_regprocedure('financial_core.f3_correction_signed_amount(numeric,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.f3_correction_signed_amount(numeric,text)';
  END IF;
  IF to_regprocedure('financial_core.f3_correction_timestamp(timestamp with time zone)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.f3_correction_timestamp(timestamp with time zone)';
  END IF;
  IF to_regprocedure('financial_core.f3_correction_fingerprint(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.f3_correction_fingerprint(jsonb)';
  END IF;
  IF to_regprocedure('financial_core.f3_correction_canonical(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.f3_correction_canonical(jsonb)';
  END IF;
  IF to_regprocedure('financial_core.guard_f3_correction_payload()') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.guard_f3_correction_payload()';
  END IF;
  IF to_regprocedure('financial_core.projection_cashbook_rows(uuid,boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.projection_cashbook_rows(uuid,boolean)';
  END IF;
  IF to_regprocedure('financial_core.format_projection_amount(numeric,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.format_projection_amount(numeric,text)';
  END IF;
  IF to_regprocedure('financial_core.post_f3_command(jsonb,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.post_f3_command(jsonb,jsonb)';
  END IF;
  IF to_regprocedure('financial_core.lock_f3_identity(uuid,uuid,text,text,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.lock_f3_identity(uuid,uuid,text,text,text)';
  END IF;
  IF to_regprocedure('financial_core.check_f3_posting_closure()') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.check_f3_posting_closure()';
  END IF;
  IF to_regprocedure('financial_core.guard_f3_posting_closure()') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.guard_f3_posting_closure()';
  END IF;
  IF to_regprocedure('financial_core.guard_f3_payload()') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.guard_f3_payload()';
  END IF;
  IF to_regprocedure('financial_core.f3_fingerprint(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.f3_fingerprint(jsonb)';
  END IF;
  IF to_regprocedure('financial_core.f3_canonical(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.f3_canonical(jsonb)';
  END IF;
  IF to_regprocedure('financial_core.f3_trim(text)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.f3_trim(text)';
  END IF;
  IF to_regprocedure('financial_core.f3_timestamp(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.f3_timestamp(jsonb)';
  END IF;
  IF to_regprocedure('financial_core.f3_amount(jsonb,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.f3_amount(jsonb,text)';
  END IF;
  IF to_regprocedure('financial_core.f3_currency(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.f3_currency(jsonb)';
  END IF;
  IF to_regprocedure('financial_core.f3_uuid(jsonb,boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.f3_uuid(jsonb,boolean)';
  END IF;
  IF to_regprocedure('financial_core.lock_financial_occurrence(uuid,text,text,text,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.lock_financial_occurrence(uuid,text,text,text,uuid)';
  END IF;
  IF to_regprocedure('financial_core.assert_finances_manage(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.assert_finances_manage(uuid)';
  END IF;
  IF to_regprocedure('financial_core.can_view_finances(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.can_view_finances(uuid)';
  END IF;
  IF to_regprocedure('financial_core.can_manage_finances(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.can_manage_finances(uuid)';
  END IF;
  IF to_regprocedure('financial_core.check_event_balance_from_posting()') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.check_event_balance_from_posting()';
  END IF;
  IF to_regprocedure('financial_core.check_event_balance_from_event()') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.check_event_balance_from_event()';
  END IF;
  IF to_regprocedure('financial_core.assert_financial_event_balanced(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.assert_financial_event_balanced(uuid)';
  END IF;
  IF to_regprocedure('financial_core.guard_financial_posting_history()') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.guard_financial_posting_history()';
  END IF;
  IF to_regprocedure('financial_core.guard_financial_event_history()') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.guard_financial_event_history()';
  END IF;
  IF to_regprocedure('financial_core.guard_financial_event_epoch()') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.guard_financial_event_epoch()';
  END IF;
  IF to_regprocedure('financial_core.guard_financial_category()') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.guard_financial_category()';
  END IF;
  IF to_regprocedure('financial_core.guard_financial_fund()') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.guard_financial_fund()';
  END IF;
  IF to_regprocedure('financial_core.guard_financial_account()') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.guard_financial_account()';
  END IF;
  IF to_regprocedure('financial_core.currency_scale(text)') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.currency_scale(text)';
  END IF;
  IF to_regprocedure('financial_private.guard_ledger_epoch()') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_private.guard_ledger_epoch()';
  END IF;
  IF to_regclass('financial_core.opening_provenances') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.opening_provenances';
  END IF;
  IF to_regclass('financial_core.correction_command_payloads') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.correction_command_payloads';
  END IF;
  IF to_regclass('financial_core.posting_command_payloads') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core.posting_command_payloads';
  END IF;
  IF to_regclass('public.financial_postings') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.financial_postings';
  END IF;
  IF to_regclass('public.financial_events') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.financial_events';
  END IF;
  IF to_regclass('public.financial_categories') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.financial_categories';
  END IF;
  IF to_regclass('public.financial_funds') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.financial_funds';
  END IF;
  IF to_regclass('public.financial_accounts') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.financial_accounts';
  END IF;
  IF to_regclass('public.financial_ledger_epochs') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.financial_ledger_epochs';
  END IF;
  IF to_regclass('financial_private.internal_financial_tenants') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_private.internal_financial_tenants';
  END IF;
  IF to_regclass('financial_private.epoch_transitions') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_private.epoch_transitions';
  END IF;
  IF to_regclass('public.notification_policy_triggers') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.notification_policy_triggers';
  END IF;
  IF to_regclass('public.notification_policy_occurrences') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.notification_policy_occurrences';
  END IF;
  IF to_regclass('public.notification_policies') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.notification_policies';
  END IF;
  IF to_regclass('public.position_assignments') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.position_assignments';
  END IF;
  IF to_regclass('public.position_permissions') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.position_permissions';
  END IF;
  IF to_regclass('public.group_positions') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.group_positions';
  END IF;
  IF to_regclass('public.hosting_swap_requests') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.hosting_swap_requests';
  END IF;
  IF to_regclass('public.hosting_assignments') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.hosting_assignments';
  END IF;
  IF to_regclass('public.hosting_rosters') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.hosting_rosters';
  END IF;
  IF to_regclass('public.payment_obligation_applications') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.payment_obligation_applications';
  END IF;
  IF to_regclass('public.payments') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.payments';
  END IF;
  IF to_regclass('public.contribution_obligations') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.contribution_obligations';
  END IF;
  IF to_regclass('public.relief_remittances') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.relief_remittances';
  END IF;
  IF to_regclass('public.relief_claims') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.relief_claims';
  END IF;
  IF to_regclass('public.relief_enrollments') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.relief_enrollments';
  END IF;
  IF to_regclass('public.relief_plans') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.relief_plans';
  END IF;
  IF to_regclass('public.fines') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.fines';
  END IF;
  IF to_regclass('public.member_transfers') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.member_transfers';
  END IF;
  IF to_regclass('public.invitations') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.invitations';
  END IF;
  IF to_regclass('public.elections') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.elections';
  END IF;
  IF to_regclass('public.events') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.events';
  END IF;
  IF to_regclass('public.meeting_minutes') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.meeting_minutes';
  END IF;
  IF to_regclass('public.announcements') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.announcements';
  END IF;
  IF to_regclass('public.notifications_queue') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.notifications_queue';
  END IF;
  IF to_regclass('public.loans') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.loans';
  END IF;
  IF to_regclass('public.projects') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.projects';
  END IF;
  IF to_regclass('public.group_subscriptions') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.group_subscriptions';
  END IF;
  IF to_regclass('public.memberships') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.memberships';
  END IF;
  IF to_regclass('public.groups') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.groups';
  END IF;
  IF to_regclass('public.profiles') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.profiles';
  END IF;
  IF to_regclass('public.organizations') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.organizations';
  END IF;
  IF to_regclass('public.__f3_acl_platform_canary_20260915') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.__f3_acl_platform_canary_20260915';
  END IF;
  IF to_regclass('public.__f3_acl_platform_canary_20260915_id_seq') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.__f3_acl_platform_canary_20260915_id_seq';
  END IF;
  IF to_regtype('public.financial_account_kind') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.financial_account_kind';
  END IF;
  IF to_regtype('public.financial_account_status') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.financial_account_status';
  END IF;
  IF to_regtype('public.financial_category_class') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.financial_category_class';
  END IF;
  IF to_regtype('public.financial_config_status') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.financial_config_status';
  END IF;
  IF to_regtype('public.financial_control_class') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.financial_control_class';
  END IF;
  IF to_regtype('public.financial_event_class') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.financial_event_class';
  END IF;
  IF to_regtype('public.financial_event_status') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.financial_event_status';
  END IF;
  IF to_regtype('public.notification_channel') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'public.notification_channel';
  END IF;
  IF to_regnamespace('financial_core') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_core';
  END IF;
  IF to_regnamespace('financial_private') IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'financial_private';
  END IF;
  IF NULLIF((SELECT extname FROM pg_extension WHERE extname = 'btree_gist'), NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: % still present', 'btree_gist';
  END IF;
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260913173000') THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: history % still present', '20260913173000';
  END IF;
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260913173001') THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: history % still present', '20260913173001';
  END IF;
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260913173002') THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: history % still present', '20260913173002';
  END IF;
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260913173003') THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: history % still present', '20260913173003';
  END IF;
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260913173004') THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: history % still present', '20260913173004';
  END IF;
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260913173005') THEN
    RAISE EXCEPTION 'F13_FINAL_BASELINE_FAILED: history % still present', '20260913173005';
  END IF;
  leftover := NULL;
END
$f13_final$;
SELECT '{"schema":"f15-qualification-reset-tx-observation-v1","phase":"T6_FINAL","event":"final_ok"}'::text;
-- T7_COMMIT
SELECT '{"schema":"f15-qualification-reset-tx-observation-v1","phase":"T7_COMMIT","event":"commit_attempted"}'::text;
COMMIT;
SELECT '{"schema":"f15-qualification-reset-tx-observation-v1","phase":"T7_COMMIT","event":"committed","committed":true}'::text;
