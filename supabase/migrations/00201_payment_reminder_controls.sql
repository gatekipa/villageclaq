-- Founder-approved bounded amendment to M2-007 (FQ-08): reminders default
-- to the group-local due date, overdue reminders require explicit opt-in,
-- and an administrator can stop all reminders or one contribution type.

BEGIN;

CREATE OR REPLACE FUNCTION public.update_payment_reminder_settings(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_group_id uuid;
  v_mode text;
  v_timezone text;
  v_stopped jsonb;
  v_invalid_count integer;
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_command IS NULL OR pg_catalog.jsonb_typeof(p_command) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;

  v_group_id := NULLIF(trim(p_command->>'group_id'), '')::uuid;
  v_mode := COALESCE(NULLIF(trim(p_command->>'mode'), ''), 'due_date_only');
  v_timezone := COALESCE(NULLIF(trim(p_command->>'timezone'), ''), 'UTC');
  v_stopped := COALESCE(p_command->'stopped_contribution_type_ids', '[]'::jsonb);

  IF v_group_id IS NULL THEN RAISE EXCEPTION 'GROUP_ID_REQUIRED'; END IF;
  IF v_mode NOT IN ('due_date_only', 'overdue_daily', 'stopped') THEN
    RAISE EXCEPTION 'INVALID_REMINDER_MODE';
  END IF;
  IF pg_catalog.jsonb_typeof(v_stopped) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'INVALID_STOPPED_CONTRIBUTIONS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = v_timezone) THEN
    RAISE EXCEPTION 'INVALID_TIMEZONE';
  END IF;
  IF NOT public.has_group_permission(v_group_id, 'settings.manage', v_actor) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: settings.manage permission required'
      USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_invalid_count
  FROM pg_catalog.jsonb_array_elements_text(v_stopped) item
  LEFT JOIN public.contribution_types ct
    ON ct.id = item.value::uuid AND ct.group_id = v_group_id
  WHERE ct.id IS NULL;
  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'CROSS_GROUP_OR_UNKNOWN_CONTRIBUTION';
  END IF;

  SELECT COALESCE(g.settings, '{}'::jsonb) INTO v_old
  FROM public.groups g
  WHERE g.id = v_group_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GROUP_NOT_FOUND'; END IF;

  v_new := pg_catalog.jsonb_build_object(
    'mode', v_mode,
    'timezone', v_timezone,
    'stopped_contribution_type_ids', v_stopped
  );

  UPDATE public.groups
  SET settings = pg_catalog.jsonb_set(v_old, '{payment_reminders}', v_new, true),
      updated_at = now()
  WHERE id = v_group_id;

  INSERT INTO public.group_audit_logs (
    group_id, actor_id, action, entity_type, entity_id, details
  ) VALUES (
    v_group_id,
    v_actor,
    'payment_reminder_settings.updated',
    'group',
    v_group_id,
    pg_catalog.jsonb_build_object(
      'previous', v_old->'payment_reminders',
      'current', v_new,
      'requirement', 'FQ-08-founder-amendment'
    )
  );

  RETURN pg_catalog.jsonb_build_object('ok', true, 'group_id', v_group_id, 'settings', v_new);
END;
$$;

CREATE OR REPLACE FUNCTION public.skip_notification_delivery(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_worker text;
  v_reason text;
  v_row public.notifications_queue%ROWTYPE;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  v_id := NULLIF(trim(p_command->>'notification_id'), '')::uuid;
  v_worker := NULLIF(trim(p_command->>'worker_id'), '');
  v_reason := COALESCE(NULLIF(trim(p_command->>'reason'), ''), 'delivery_no_longer_eligible');
  IF v_id IS NULL OR v_worker IS NULL THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;

  SELECT * INTO v_row
  FROM public.notifications_queue
  WHERE id = v_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_row.locked_by IS DISTINCT FROM v_worker OR v_row.status::text <> 'processing' THEN
    RAISE EXCEPTION 'LEASE_EXPIRED_OR_STOLEN';
  END IF;

  UPDATE public.notifications_queue
  SET status = 'dead_letter',
      error_message = 'SKIPPED:' || left(v_reason, 400),
      next_retry_at = NULL,
      locked_at = NULL,
      locked_by = NULL,
      sent_at = NULL
  WHERE id = v_id;

  RETURN pg_catalog.jsonb_build_object('skipped', true, 'status', 'dead_letter', 'reason', v_reason);
END;
$$;

REVOKE ALL ON FUNCTION public.update_payment_reminder_settings(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_payment_reminder_settings(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.skip_notification_delivery(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.skip_notification_delivery(jsonb) TO service_role;

COMMIT;
