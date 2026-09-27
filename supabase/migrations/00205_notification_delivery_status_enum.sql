-- Founder qualification FA-08: a provider failure must settle the claimed row.
-- The queue status column is an enum, so the local status variable must retain
-- that type instead of relying on an invalid text assignment.

BEGIN;

CREATE OR REPLACE FUNCTION public.settle_notification_delivery(p_command jsonb)
RETURNS jsonb
SECURITY DEFINER
SET search_path = ''
LANGUAGE plpgsql
AS $$
DECLARE
  v_notification_id uuid;
  v_worker_id text;
  v_success boolean;
  v_provider_message_id text;
  v_error_message text;
  v_row record;
  v_new_status public.notification_queue_status;
BEGIN
  v_notification_id := (p_command->>'notification_id')::uuid;
  v_worker_id := p_command->>'worker_id';
  v_success := (p_command->>'success')::boolean;
  v_provider_message_id := p_command->>'provider_message_id';
  v_error_message := p_command->>'error_message';

  SELECT * INTO v_row
  FROM public.notifications_queue
  WHERE id = v_notification_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_row.locked_by IS DISTINCT FROM v_worker_id THEN
    RAISE EXCEPTION 'LEASE_EXPIRED_OR_STOLEN';
  END IF;

  IF v_success THEN
    v_new_status := 'sent';
    UPDATE public.notifications_queue
    SET status = v_new_status,
        provider_message_id = v_provider_message_id,
        locked_at = NULL,
        locked_by = NULL,
        sent_at = now(),
        error_message = NULL
    WHERE id = v_notification_id;
  ELSIF v_row.attempts >= v_row.max_attempts THEN
    v_new_status := 'dead_letter';
    UPDATE public.notifications_queue
    SET status = v_new_status,
        error_message = v_error_message,
        locked_at = NULL,
        locked_by = NULL
    WHERE id = v_notification_id;
  ELSE
    v_new_status := 'failed';
    UPDATE public.notifications_queue
    SET status = v_new_status,
        error_message = v_error_message,
        next_retry_at = now() + (pg_catalog.power(2, v_row.attempts) * interval '30 seconds'),
        locked_at = NULL,
        locked_by = NULL
    WHERE id = v_notification_id;
  END IF;

  RETURN pg_catalog.jsonb_build_object('settled', true, 'status', v_new_status);
END;
$$;

REVOKE ALL ON FUNCTION public.settle_notification_delivery(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_notification_delivery(jsonb) TO service_role;

COMMIT;