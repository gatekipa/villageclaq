-- ==============================================================================
-- M11 Slice 1: Schema & Transactional Outbox Hardening
-- ==============================================================================

-- 1. Preflight Safety Checks
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'has_group_permission') THEN
    RAISE EXCEPTION 'M11 Preflight Failed: public.has_group_permission missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'groups') THEN
    RAISE EXCEPTION 'M11 Preflight Failed: public.groups missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'memberships') THEN
    RAISE EXCEPTION 'M11 Preflight Failed: public.memberships missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'notifications_queue') THEN
    RAISE EXCEPTION 'M11 Preflight Failed: public.notifications_queue missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_financial_statement') THEN
    RAISE EXCEPTION 'M11 Preflight Failed: Preceding migration 00131 missing';
  END IF;
END $$;

BEGIN;

-- 2. Outbox Schema Fortification
ALTER TABLE public.notifications_queue
  ADD COLUMN group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  ADD COLUMN membership_id UUID REFERENCES public.memberships(id) ON DELETE SET NULL,
  ADD COLUMN idempotency_key TEXT,
  ADD COLUMN locked_at TIMESTAMPTZ,
  ADD COLUMN locked_by TEXT,
  ADD COLUMN max_attempts INT NOT NULL DEFAULT 3,
  ADD COLUMN next_retry_at TIMESTAMPTZ,
  ADD COLUMN provider_message_id TEXT;

-- Preserve the baseline enum, queued state, attempts, and error_message
-- because existing outbound producers and workers still use those contracts.

ALTER TABLE public.notifications_queue ADD CONSTRAINT uq_notifications_queue_idempotency UNIQUE (group_id, idempotency_key);

CREATE INDEX idx_notifications_queue_claim ON public.notifications_queue(status, next_retry_at, locked_at);
CREATE INDEX idx_notifications_queue_tenant ON public.notifications_queue(group_id, status);


-- 3. Canonical Transactional Outbox RPCs

-- queue_transactional_notification
CREATE OR REPLACE FUNCTION public.queue_transactional_notification(p_command jsonb)
RETURNS jsonb
SECURITY DEFINER SET search_path = ''
LANGUAGE plpgsql
AS $$
DECLARE
  v_group_id UUID;
  v_membership_id UUID;
  v_channel TEXT;
  v_template_key TEXT;
  v_recipient_address TEXT;
  v_payload JSONB;
  v_idempotency_key TEXT;
  v_queue_id UUID;
  v_user_id UUID;
  v_existing public.notifications_queue%ROWTYPE;
BEGIN
  v_group_id := (p_command->>'group_id')::UUID;
  v_membership_id := (p_command->>'membership_id')::UUID;
  v_channel := p_command->>'channel';
  v_template_key := p_command->>'template_key';
  v_recipient_address := p_command->>'recipient_address';
  v_payload := COALESCE(p_command->'payload', '{}'::jsonb);
  v_idempotency_key := p_command->>'idempotency_key';

  IF v_group_id IS NULL OR v_membership_id IS NULL OR v_channel IS NULL
     OR v_template_key IS NULL OR v_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'MISSING_REQUIRED_FIELDS';
  END IF;
  IF coalesce(auth.jwt()->>'role','') <> 'service_role'
     AND NOT public.has_group_permission(v_group_id,'announcements.manage',auth.uid())
  THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  SELECT m.user_id INTO v_user_id FROM public.memberships m
  WHERE m.id=v_membership_id AND m.group_id=v_group_id
    AND m.membership_status='active';
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'INVALID_RECIPIENT'; END IF;

  INSERT INTO public.notifications_queue (
    group_id,
    user_id,
    membership_id,
    channel,
    template,
    data,
    status,
    idempotency_key
  ) VALUES (
    v_group_id,
    v_user_id,
    v_membership_id,
    v_channel::public.notification_channel,
    v_template_key,
    v_payload || jsonb_build_object('recipient', v_recipient_address),
    'pending',
    v_idempotency_key
  )
  ON CONFLICT (group_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_queue_id;

  IF v_queue_id IS NULL THEN
    SELECT * INTO v_existing FROM public.notifications_queue
    WHERE group_id=v_group_id AND idempotency_key=v_idempotency_key;
    IF v_existing.membership_id IS DISTINCT FROM v_membership_id
       OR v_existing.channel::text IS DISTINCT FROM v_channel
       OR v_existing.template IS DISTINCT FROM v_template_key
       OR v_existing.data IS DISTINCT FROM
         (v_payload || pg_catalog.jsonb_build_object('recipient',v_recipient_address))
    THEN RAISE EXCEPTION 'NOTIFICATION_IDENTITY_CONFLICT'; END IF;
    v_queue_id:=v_existing.id;
    RETURN jsonb_build_object('queued', false, 'idempotent_replay', true, 'queue_id', v_queue_id);
  END IF;

  RETURN jsonb_build_object('queued', true, 'idempotent_replay', false, 'queue_id', v_queue_id);
END;
$$;


-- claim_notification_batch
CREATE OR REPLACE FUNCTION public.claim_notification_batch(p_command jsonb)
RETURNS jsonb
SECURITY DEFINER SET search_path = ''
LANGUAGE plpgsql
AS $$
DECLARE
  v_batch_size INT;
  v_worker_id TEXT;
  v_claimed jsonb;
BEGIN
  v_batch_size := COALESCE((p_command->>'batch_size')::INT, 25);
  v_worker_id := p_command->>'worker_id';

  IF v_worker_id IS NULL THEN
    RAISE EXCEPTION 'WORKER_ID_REQUIRED';
  END IF;

  WITH claimed AS (
    SELECT id
    FROM public.notifications_queue
    WHERE (status IN ('queued','pending','failed') AND (next_retry_at IS NULL OR next_retry_at <= now()))
       OR (status = 'processing' AND locked_at < now() - INTERVAL '5 minutes')
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT v_batch_size
  ),
  updated AS (
    UPDATE public.notifications_queue q
    SET status = 'processing',
        locked_at = now(),
        locked_by = v_worker_id,
        attempts = attempts + 1
    FROM claimed c
    WHERE q.id = c.id
    RETURNING q.*
  )
  SELECT jsonb_agg(to_jsonb(u.*)) INTO v_claimed
  FROM updated u;

  RETURN COALESCE(v_claimed, '[]'::jsonb);
END;
$$;

-- settle_notification_delivery
CREATE OR REPLACE FUNCTION public.settle_notification_delivery(p_command jsonb)
RETURNS jsonb
SECURITY DEFINER SET search_path = ''
LANGUAGE plpgsql
AS $$
DECLARE
  v_notification_id UUID;
  v_worker_id TEXT;
  v_success BOOLEAN;
  v_provider_message_id TEXT;
  v_error_message TEXT;
  v_row RECORD;
  v_new_status TEXT;
BEGIN
  v_notification_id := (p_command->>'notification_id')::UUID;
  v_worker_id := p_command->>'worker_id';
  v_success := (p_command->>'success')::BOOLEAN;
  v_provider_message_id := p_command->>'provider_message_id';
  v_error_message := p_command->>'error_message';

  SELECT * INTO v_row FROM public.notifications_queue WHERE id = v_notification_id FOR UPDATE;

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
  ELSE
    IF v_row.attempts >= v_row.max_attempts THEN
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
          next_retry_at = now() + (POWER(2, v_row.attempts) * INTERVAL '30 seconds'),
          locked_at = NULL,
          locked_by = NULL
      WHERE id = v_notification_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('settled', true, 'status', v_new_status);
END;
$$;
REVOKE ALL ON FUNCTION public.queue_transactional_notification(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.queue_transactional_notification(jsonb) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.claim_notification_batch(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_batch(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.settle_notification_delivery(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.settle_notification_delivery(jsonb) TO service_role;
COMMIT;
