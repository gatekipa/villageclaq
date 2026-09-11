-- S0 Cut 2 — P0-B notification queue trusted-enqueue boundary
--
-- Frozen contract tip: 5c3c1cce458cd13f9525eb21c6366f8877d3c51d (PR #77 Daybreak PASS)
-- PRODUCTION APPLY NOT AUTHORIZED
-- 00115 PRODUCTION APPLY NOT AUTHORIZED
-- NO REAL SENDS. Disposable/local qualification only.
--
-- Single transaction. Any CUT2_ABORT rolls back. COMMIT only if postconditions pass.
-- Does not edit 00001–00114. Does not create 00116.

BEGIN;

DO $cut2_pre$
DECLARE
  v_indexdef text;
  v_labels text[];
  v_found boolean := false;
  v_ns text;
  v_sql text;
  v_pol_check text;
  v_pol_using text;
  v_has_insert_anon boolean;
  v_has_insert_auth boolean;
  v_has_insert_sr boolean;
  v_col record;
  v_n int;
BEGIN
  -- schema_migrations.version = 20260911183755 (Cut 1) in any schema_migrations table
  FOR v_ns IN
    SELECT n.nspname
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relname = 'schema_migrations'
       AND c.relkind IN ('r', 'p')
  LOOP
    v_sql := format(
      'SELECT EXISTS (SELECT 1 FROM %I.schema_migrations WHERE version::text = %L)',
      v_ns,
      '20260911183755'
    );
    BEGIN
      EXECUTE v_sql INTO v_found;
    EXCEPTION WHEN OTHERS THEN
      v_found := false;
    END;
    EXIT WHEN v_found;
  END LOOP;
  IF NOT v_found THEN
    RAISE EXCEPTION 'CUT2_ABORT: schema_migrations.version 20260911183755 missing';
  END IF;

  IF to_regclass('public.notifications_queue') IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT: public.notifications_queue missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'notifications_queue'
       AND column_name = 'group_id'
  ) THEN
    RAISE EXCEPTION 'CUT2_ABORT: notifications_queue.group_id present';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'notifications_queue'
       AND column_name = 'cut2_provenance_version'
  ) THEN
    RAISE EXCEPTION 'CUT2_ABORT: cut2_provenance_version already exists';
  END IF;

  IF to_regclass('public.notification_policies') IS NOT NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT: notification_policies present';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'enqueue_outbound_notification'
  ) THEN
    RAISE EXCEPTION 'CUT2_ABORT: enqueue_outbound_notification already exists';
  END IF;

  SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder)
    INTO v_labels
    FROM pg_catalog.pg_enum e
    JOIN pg_catalog.pg_type t ON t.oid = e.enumtypid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
   WHERE n.nspname = 'public'
     AND t.typname = 'notification_queue_status';
  IF v_labels IS DISTINCT FROM ARRAY['queued', 'sent', 'failed']::text[] THEN
    RAISE EXCEPTION 'CUT2_ABORT: notification_queue_status vocab drift: %', v_labels;
  END IF;

  -- Worker-required shape (live inventory columns)
  SELECT count(*) INTO v_n
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'notifications_queue'
     AND column_name IN (
       'id', 'user_id', 'channel', 'template', 'data', 'status',
       'error_message', 'attempts', 'created_at', 'sent_at'
     );
  IF v_n <> 10 THEN
    RAISE EXCEPTION 'CUT2_ABORT: notifications_queue worker-required shape missing columns (found %)', v_n;
  END IF;

  -- Unsafe INSERT policy exact fingerprint
  SELECT pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid)
    INTO v_pol_check
    FROM pg_catalog.pg_policy pol
    JOIN pg_catalog.pg_class c ON c.oid = pol.polrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname = 'notifications_queue'
     AND pol.polname = 'Authenticated users can queue notifications'
     AND pol.polcmd = 'a';
  IF v_pol_check IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT: INSERT policy Authenticated users can queue notifications missing';
  END IF;
  IF v_pol_check NOT IN ('(auth.uid() IS NOT NULL)', 'auth.uid() IS NOT NULL', '(uid() IS NOT NULL)')
     AND position('auth.uid()' in v_pol_check) = 0 THEN
    RAISE EXCEPTION 'CUT2_ABORT: INSERT policy WITH CHECK fingerprint drift: %', v_pol_check;
  END IF;

  -- Staff UPDATE policy exact fingerprint
  SELECT pg_catalog.pg_get_expr(pol.polqual, pol.polrelid)
    INTO v_pol_using
    FROM pg_catalog.pg_policy pol
    JOIN pg_catalog.pg_class c ON c.oid = pol.polrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname = 'notifications_queue'
     AND pol.polname = 'Staff can update notification queue'
     AND pol.polcmd = 'w';
  IF v_pol_using IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT: UPDATE policy Staff can update notification queue missing';
  END IF;
  IF v_pol_using NOT IN ('is_platform_staff()', '(is_platform_staff())')
     AND position('is_platform_staff()' in v_pol_using) = 0 THEN
    RAISE EXCEPTION 'CUT2_ABORT: staff UPDATE policy fingerprint drift: %', v_pol_using;
  END IF;

  -- Live table INSERT grants present before revoke
  SELECT has_table_privilege('anon', 'public.notifications_queue', 'INSERT') INTO v_has_insert_anon;
  SELECT has_table_privilege('authenticated', 'public.notifications_queue', 'INSERT') INTO v_has_insert_auth;
  SELECT has_table_privilege('service_role', 'public.notifications_queue', 'INSERT') INTO v_has_insert_sr;
  IF NOT (v_has_insert_anon AND v_has_insert_auth AND v_has_insert_sr) THEN
    RAISE EXCEPTION 'CUT2_ABORT: expected live INSERT grants on anon/authenticated/service_role missing';
  END IF;


  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_created';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT: missing reviewed queue idx_notifications_queue_created';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE INDEX idx_notifications_queue_created ON public.notifications_queue USING btree (created_at DESC)' THEN
    RAISE EXCEPTION 'CUT2_ABORT: reviewed queue indexdef drift for idx_notifications_queue_created';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_queued';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT: missing reviewed queue idx_notifications_queue_queued';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE INDEX idx_notifications_queue_queued ON public.notifications_queue USING btree (status, created_at) WHERE (status = ''queued''::notification_queue_status)' THEN
    RAISE EXCEPTION 'CUT2_ABORT: reviewed queue indexdef drift for idx_notifications_queue_queued';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_status';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT: missing reviewed queue idx_notifications_queue_status';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE INDEX idx_notifications_queue_status ON public.notifications_queue USING btree (status)' THEN
    RAISE EXCEPTION 'CUT2_ABORT: reviewed queue indexdef drift for idx_notifications_queue_status';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_user';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT: missing reviewed queue idx_notifications_queue_user';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE INDEX idx_notifications_queue_user ON public.notifications_queue USING btree (user_id)' THEN
    RAISE EXCEPTION 'CUT2_ABORT: reviewed queue indexdef drift for idx_notifications_queue_user';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'notifications_queue_pkey';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT: missing reviewed queue notifications_queue_pkey';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX notifications_queue_pkey ON public.notifications_queue USING btree (id)' THEN
    RAISE EXCEPTION 'CUT2_ABORT: reviewed queue indexdef drift for notifications_queue_pkey';
  END IF;


  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_whatsapp_claim_approved_unique';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT: missing WhatsApp unique idx_notifications_queue_whatsapp_claim_approved_unique';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_claim_approved_unique ON public.notifications_queue USING btree (((data ->> ''claimId''::text))) WHERE ((channel = ''whatsapp''::notification_channel) AND (template = ''relief_claim_approved''::text) AND (data ? ''claimId''::text) AND ((data ->> ''claimId''::text) IS NOT NULL))' THEN
    RAISE EXCEPTION 'CUT2_ABORT: WhatsApp unique indexdef drift for idx_notifications_queue_whatsapp_claim_approved_unique';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_whatsapp_claim_denied_unique';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT: missing WhatsApp unique idx_notifications_queue_whatsapp_claim_denied_unique';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_claim_denied_unique ON public.notifications_queue USING btree (((data ->> ''claimId''::text))) WHERE ((channel = ''whatsapp''::notification_channel) AND (template = ''relief_claim_denied''::text) AND (data ? ''claimId''::text) AND ((data ->> ''claimId''::text) IS NOT NULL))' THEN
    RAISE EXCEPTION 'CUT2_ABORT: WhatsApp unique indexdef drift for idx_notifications_queue_whatsapp_claim_denied_unique';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_whatsapp_event_reminder_unique';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT: missing WhatsApp unique idx_notifications_queue_whatsapp_event_reminder_unique';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_event_reminder_unique ON public.notifications_queue USING btree (((data ->> ''eventId''::text)), ((data ->> ''userId''::text))) WHERE ((channel = ''whatsapp''::notification_channel) AND (template = ''event_reminder''::text) AND (data ? ''eventId''::text) AND (data ? ''userId''::text) AND ((data ->> ''eventId''::text) IS NOT NULL) AND ((data ->> ''userId''::text) IS NOT NULL))' THEN
    RAISE EXCEPTION 'CUT2_ABORT: WhatsApp unique indexdef drift for idx_notifications_queue_whatsapp_event_reminder_unique';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_whatsapp_fine_issued_unique';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT: missing WhatsApp unique idx_notifications_queue_whatsapp_fine_issued_unique';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_fine_issued_unique ON public.notifications_queue USING btree (((data ->> ''fineId''::text))) WHERE ((channel = ''whatsapp''::notification_channel) AND (template = ''fine_issued''::text) AND (data ? ''fineId''::text) AND ((data ->> ''fineId''::text) IS NOT NULL))' THEN
    RAISE EXCEPTION 'CUT2_ABORT: WhatsApp unique indexdef drift for idx_notifications_queue_whatsapp_fine_issued_unique';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_whatsapp_hosting_assignment_unique';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT: missing WhatsApp unique idx_notifications_queue_whatsapp_hosting_assignment_unique';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_hosting_assignment_unique ON public.notifications_queue USING btree (((data ->> ''assignmentId''::text))) WHERE ((channel = ''whatsapp''::notification_channel) AND (template = ''hosting_assignment''::text) AND (data ? ''assignmentId''::text) AND ((data ->> ''assignmentId''::text) IS NOT NULL))' THEN
    RAISE EXCEPTION 'CUT2_ABORT: WhatsApp unique indexdef drift for idx_notifications_queue_whatsapp_hosting_assignment_unique';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_whatsapp_hosting_reminder_unique';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT: missing WhatsApp unique idx_notifications_queue_whatsapp_hosting_reminder_unique';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_hosting_reminder_unique ON public.notifications_queue USING btree (((data ->> ''assignmentId''::text)), ((data ->> ''assignedDate''::text))) WHERE ((channel = ''whatsapp''::notification_channel) AND (template = ''hosting_reminder''::text) AND (data ? ''assignmentId''::text) AND (data ? ''assignedDate''::text) AND ((data ->> ''assignmentId''::text) IS NOT NULL) AND ((data ->> ''assignedDate''::text) IS NOT NULL))' THEN
    RAISE EXCEPTION 'CUT2_ABORT: WhatsApp unique indexdef drift for idx_notifications_queue_whatsapp_hosting_reminder_unique';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_whatsapp_loan_approved_unique';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT: missing WhatsApp unique idx_notifications_queue_whatsapp_loan_approved_unique';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_loan_approved_unique ON public.notifications_queue USING btree (((data ->> ''loanId''::text))) WHERE ((channel = ''whatsapp''::notification_channel) AND (template = ''loan_approved''::text) AND (data ? ''loanId''::text) AND ((data ->> ''loanId''::text) IS NOT NULL))' THEN
    RAISE EXCEPTION 'CUT2_ABORT: WhatsApp unique indexdef drift for idx_notifications_queue_whatsapp_loan_approved_unique';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_whatsapp_loan_overdue_unique';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT: missing WhatsApp unique idx_notifications_queue_whatsapp_loan_overdue_unique';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_loan_overdue_unique ON public.notifications_queue USING btree (((data ->> ''loanId''::text)), ((data ->> ''reminderDate''::text))) WHERE ((channel = ''whatsapp''::notification_channel) AND (template = ''loan_overdue''::text) AND (data ? ''loanId''::text) AND (data ? ''reminderDate''::text) AND ((data ->> ''loanId''::text) IS NOT NULL) AND ((data ->> ''reminderDate''::text) IS NOT NULL))' THEN
    RAISE EXCEPTION 'CUT2_ABORT: WhatsApp unique indexdef drift for idx_notifications_queue_whatsapp_loan_overdue_unique';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_whatsapp_member_invitation_unique';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT: missing WhatsApp unique idx_notifications_queue_whatsapp_member_invitation_unique';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_member_invitation_unique ON public.notifications_queue USING btree (((data ->> ''invitationId''::text)), ((data ->> ''sendDate''::text))) WHERE ((channel = ''whatsapp''::notification_channel) AND (template = ''member_invitation''::text) AND (data ? ''invitationId''::text) AND (data ? ''sendDate''::text) AND ((data ->> ''invitationId''::text) IS NOT NULL) AND ((data ->> ''sendDate''::text) IS NOT NULL))' THEN
    RAISE EXCEPTION 'CUT2_ABORT: WhatsApp unique indexdef drift for idx_notifications_queue_whatsapp_member_invitation_unique';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_whatsapp_payment_receipt_unique';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT: missing WhatsApp unique idx_notifications_queue_whatsapp_payment_receipt_unique';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_payment_receipt_unique ON public.notifications_queue USING btree (((data ->> ''paymentId''::text))) WHERE ((channel = ''whatsapp''::notification_channel) AND (template = ''payment_receipt''::text) AND (data ? ''paymentId''::text))' THEN
    RAISE EXCEPTION 'CUT2_ABORT: WhatsApp unique indexdef drift for idx_notifications_queue_whatsapp_payment_receipt_unique';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_whatsapp_payment_reminder_unique';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT: missing WhatsApp unique idx_notifications_queue_whatsapp_payment_reminder_unique';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_payment_reminder_unique ON public.notifications_queue USING btree (((data ->> ''obligationId''::text)), ((data ->> ''reminderDate''::text))) WHERE ((channel = ''whatsapp''::notification_channel) AND (template = ''payment_reminder''::text) AND (data ? ''obligationId''::text) AND (data ? ''reminderDate''::text) AND ((data ->> ''obligationId''::text) IS NOT NULL) AND ((data ->> ''reminderDate''::text) IS NOT NULL))' THEN
    RAISE EXCEPTION 'CUT2_ABORT: WhatsApp unique indexdef drift for idx_notifications_queue_whatsapp_payment_reminder_unique';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_whatsapp_relief_enrollment_unique';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT: missing WhatsApp unique idx_notifications_queue_whatsapp_relief_enrollment_unique';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_relief_enrollment_unique ON public.notifications_queue USING btree (((data ->> ''enrollmentId''::text))) WHERE ((channel = ''whatsapp''::notification_channel) AND (template = ''relief_enrollment''::text) AND (data ? ''enrollmentId''::text) AND ((data ->> ''enrollmentId''::text) IS NOT NULL))' THEN
    RAISE EXCEPTION 'CUT2_ABORT: WhatsApp unique indexdef drift for idx_notifications_queue_whatsapp_relief_enrollment_unique';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_whatsapp_remittance_confirmed_unique';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT: missing WhatsApp unique idx_notifications_queue_whatsapp_remittance_confirmed_unique';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_remittance_confirmed_unique ON public.notifications_queue USING btree (((data ->> ''remittanceId''::text)), ((data ->> ''recipientUserId''::text))) WHERE ((channel = ''whatsapp''::notification_channel) AND (template = ''remittance_confirmed''::text) AND (data ? ''remittanceId''::text) AND (data ? ''recipientUserId''::text) AND ((data ->> ''remittanceId''::text) IS NOT NULL) AND ((data ->> ''recipientUserId''::text) IS NOT NULL))' THEN
    RAISE EXCEPTION 'CUT2_ABORT: WhatsApp unique indexdef drift for idx_notifications_queue_whatsapp_remittance_confirmed_unique';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_whatsapp_remittance_disputed_unique';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT: missing WhatsApp unique idx_notifications_queue_whatsapp_remittance_disputed_unique';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_remittance_disputed_unique ON public.notifications_queue USING btree (((data ->> ''remittanceId''::text)), ((data ->> ''recipientUserId''::text))) WHERE ((channel = ''whatsapp''::notification_channel) AND (template = ''remittance_disputed''::text) AND (data ? ''remittanceId''::text) AND (data ? ''recipientUserId''::text) AND ((data ->> ''remittanceId''::text) IS NOT NULL) AND ((data ->> ''recipientUserId''::text) IS NOT NULL))' THEN
    RAISE EXCEPTION 'CUT2_ABORT: WhatsApp unique indexdef drift for idx_notifications_queue_whatsapp_remittance_disputed_unique';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_whatsapp_standing_changed_unique';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT: missing WhatsApp unique idx_notifications_queue_whatsapp_standing_changed_unique';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_standing_changed_unique ON public.notifications_queue USING btree (((data ->> ''membershipId''::text)), ((data ->> ''newStanding''::text)), ((data ->> ''changeDate''::text))) WHERE ((channel = ''whatsapp''::notification_channel) AND (template = ''standing_changed''::text) AND (data ? ''membershipId''::text) AND (data ? ''newStanding''::text) AND (data ? ''changeDate''::text) AND ((data ->> ''membershipId''::text) IS NOT NULL) AND ((data ->> ''newStanding''::text) IS NOT NULL) AND ((data ->> ''changeDate''::text) IS NOT NULL))' THEN
    RAISE EXCEPTION 'CUT2_ABORT: WhatsApp unique indexdef drift for idx_notifications_queue_whatsapp_standing_changed_unique';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_whatsapp_subscription_expiring_unique';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT: missing WhatsApp unique idx_notifications_queue_whatsapp_subscription_expiring_unique';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_subscription_expiring_unique ON public.notifications_queue USING btree (((data ->> ''subscriptionId''::text)), ((data ->> ''reminderDate''::text)), ((data ->> ''userId''::text))) WHERE ((channel = ''whatsapp''::notification_channel) AND (template = ''subscription_expiring''::text) AND (data ? ''subscriptionId''::text) AND (data ? ''reminderDate''::text) AND (data ? ''userId''::text) AND ((data ->> ''subscriptionId''::text) IS NOT NULL) AND ((data ->> ''reminderDate''::text) IS NOT NULL) AND ((data ->> ''userId''::text) IS NOT NULL))' THEN
    RAISE EXCEPTION 'CUT2_ABORT: WhatsApp unique indexdef drift for idx_notifications_queue_whatsapp_subscription_expiring_unique';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_whatsapp_welcome_unique';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT: missing WhatsApp unique idx_notifications_queue_whatsapp_welcome_unique';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_welcome_unique ON public.notifications_queue USING btree (((data ->> ''membershipId''::text))) WHERE ((channel = ''whatsapp''::notification_channel) AND (template = ''welcome''::text) AND (data ? ''membershipId''::text))' THEN
    RAISE EXCEPTION 'CUT2_ABORT: WhatsApp unique indexdef drift for idx_notifications_queue_whatsapp_welcome_unique';
  END IF;
END;
$cut2_pre$;

ALTER TABLE public.notifications_queue
  ADD COLUMN cut2_provenance_version smallint;

ALTER TABLE public.notifications_queue
  ADD CONSTRAINT notifications_queue_cut2_provenance_version_check
  CHECK (cut2_provenance_version IS NULL OR cut2_provenance_version = 1);

DO $cut2_rebuild$
BEGIN
  DROP INDEX public.idx_notifications_queue_whatsapp_claim_approved_unique;
  CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_claim_approved_unique ON public.notifications_queue USING btree (((data ->> 'claimId'::text))) WHERE (((channel = 'whatsapp'::notification_channel) AND (template = 'relief_claim_approved'::text) AND (data ? 'claimId'::text) AND ((data ->> 'claimId'::text) IS NOT NULL)) AND cut2_provenance_version = 1);
  DROP INDEX public.idx_notifications_queue_whatsapp_claim_denied_unique;
  CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_claim_denied_unique ON public.notifications_queue USING btree (((data ->> 'claimId'::text))) WHERE (((channel = 'whatsapp'::notification_channel) AND (template = 'relief_claim_denied'::text) AND (data ? 'claimId'::text) AND ((data ->> 'claimId'::text) IS NOT NULL)) AND cut2_provenance_version = 1);
  DROP INDEX public.idx_notifications_queue_whatsapp_event_reminder_unique;
  CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_event_reminder_unique ON public.notifications_queue USING btree (((data ->> 'eventId'::text)), ((data ->> 'userId'::text))) WHERE (((channel = 'whatsapp'::notification_channel) AND (template = 'event_reminder'::text) AND (data ? 'eventId'::text) AND (data ? 'userId'::text) AND ((data ->> 'eventId'::text) IS NOT NULL) AND ((data ->> 'userId'::text) IS NOT NULL)) AND cut2_provenance_version = 1);
  DROP INDEX public.idx_notifications_queue_whatsapp_fine_issued_unique;
  CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_fine_issued_unique ON public.notifications_queue USING btree (((data ->> 'fineId'::text))) WHERE (((channel = 'whatsapp'::notification_channel) AND (template = 'fine_issued'::text) AND (data ? 'fineId'::text) AND ((data ->> 'fineId'::text) IS NOT NULL)) AND cut2_provenance_version = 1);
  DROP INDEX public.idx_notifications_queue_whatsapp_hosting_assignment_unique;
  CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_hosting_assignment_unique ON public.notifications_queue USING btree (((data ->> 'assignmentId'::text))) WHERE (((channel = 'whatsapp'::notification_channel) AND (template = 'hosting_assignment'::text) AND (data ? 'assignmentId'::text) AND ((data ->> 'assignmentId'::text) IS NOT NULL)) AND cut2_provenance_version = 1);
  DROP INDEX public.idx_notifications_queue_whatsapp_hosting_reminder_unique;
  CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_hosting_reminder_unique ON public.notifications_queue USING btree (((data ->> 'assignmentId'::text)), ((data ->> 'assignedDate'::text))) WHERE (((channel = 'whatsapp'::notification_channel) AND (template = 'hosting_reminder'::text) AND (data ? 'assignmentId'::text) AND (data ? 'assignedDate'::text) AND ((data ->> 'assignmentId'::text) IS NOT NULL) AND ((data ->> 'assignedDate'::text) IS NOT NULL)) AND cut2_provenance_version = 1);
  DROP INDEX public.idx_notifications_queue_whatsapp_loan_approved_unique;
  CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_loan_approved_unique ON public.notifications_queue USING btree (((data ->> 'loanId'::text))) WHERE (((channel = 'whatsapp'::notification_channel) AND (template = 'loan_approved'::text) AND (data ? 'loanId'::text) AND ((data ->> 'loanId'::text) IS NOT NULL)) AND cut2_provenance_version = 1);
  DROP INDEX public.idx_notifications_queue_whatsapp_loan_overdue_unique;
  CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_loan_overdue_unique ON public.notifications_queue USING btree (((data ->> 'loanId'::text)), ((data ->> 'reminderDate'::text))) WHERE (((channel = 'whatsapp'::notification_channel) AND (template = 'loan_overdue'::text) AND (data ? 'loanId'::text) AND (data ? 'reminderDate'::text) AND ((data ->> 'loanId'::text) IS NOT NULL) AND ((data ->> 'reminderDate'::text) IS NOT NULL)) AND cut2_provenance_version = 1);
  DROP INDEX public.idx_notifications_queue_whatsapp_member_invitation_unique;
  CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_member_invitation_unique ON public.notifications_queue USING btree (((data ->> 'invitationId'::text)), ((data ->> 'sendDate'::text))) WHERE (((channel = 'whatsapp'::notification_channel) AND (template = 'member_invitation'::text) AND (data ? 'invitationId'::text) AND (data ? 'sendDate'::text) AND ((data ->> 'invitationId'::text) IS NOT NULL) AND ((data ->> 'sendDate'::text) IS NOT NULL)) AND cut2_provenance_version = 1);
  DROP INDEX public.idx_notifications_queue_whatsapp_payment_receipt_unique;
  CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_payment_receipt_unique ON public.notifications_queue USING btree (((data ->> 'paymentId'::text))) WHERE (((channel = 'whatsapp'::notification_channel) AND (template = 'payment_receipt'::text) AND (data ? 'paymentId'::text)) AND cut2_provenance_version = 1);
  DROP INDEX public.idx_notifications_queue_whatsapp_payment_reminder_unique;
  CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_payment_reminder_unique ON public.notifications_queue USING btree (((data ->> 'obligationId'::text)), ((data ->> 'reminderDate'::text))) WHERE (((channel = 'whatsapp'::notification_channel) AND (template = 'payment_reminder'::text) AND (data ? 'obligationId'::text) AND (data ? 'reminderDate'::text) AND ((data ->> 'obligationId'::text) IS NOT NULL) AND ((data ->> 'reminderDate'::text) IS NOT NULL)) AND cut2_provenance_version = 1);
  DROP INDEX public.idx_notifications_queue_whatsapp_relief_enrollment_unique;
  CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_relief_enrollment_unique ON public.notifications_queue USING btree (((data ->> 'enrollmentId'::text))) WHERE (((channel = 'whatsapp'::notification_channel) AND (template = 'relief_enrollment'::text) AND (data ? 'enrollmentId'::text) AND ((data ->> 'enrollmentId'::text) IS NOT NULL)) AND cut2_provenance_version = 1);
  DROP INDEX public.idx_notifications_queue_whatsapp_remittance_confirmed_unique;
  CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_remittance_confirmed_unique ON public.notifications_queue USING btree (((data ->> 'remittanceId'::text)), ((data ->> 'recipientUserId'::text))) WHERE (((channel = 'whatsapp'::notification_channel) AND (template = 'remittance_confirmed'::text) AND (data ? 'remittanceId'::text) AND (data ? 'recipientUserId'::text) AND ((data ->> 'remittanceId'::text) IS NOT NULL) AND ((data ->> 'recipientUserId'::text) IS NOT NULL)) AND cut2_provenance_version = 1);
  DROP INDEX public.idx_notifications_queue_whatsapp_remittance_disputed_unique;
  CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_remittance_disputed_unique ON public.notifications_queue USING btree (((data ->> 'remittanceId'::text)), ((data ->> 'recipientUserId'::text))) WHERE (((channel = 'whatsapp'::notification_channel) AND (template = 'remittance_disputed'::text) AND (data ? 'remittanceId'::text) AND (data ? 'recipientUserId'::text) AND ((data ->> 'remittanceId'::text) IS NOT NULL) AND ((data ->> 'recipientUserId'::text) IS NOT NULL)) AND cut2_provenance_version = 1);
  DROP INDEX public.idx_notifications_queue_whatsapp_standing_changed_unique;
  CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_standing_changed_unique ON public.notifications_queue USING btree (((data ->> 'membershipId'::text)), ((data ->> 'newStanding'::text)), ((data ->> 'changeDate'::text))) WHERE (((channel = 'whatsapp'::notification_channel) AND (template = 'standing_changed'::text) AND (data ? 'membershipId'::text) AND (data ? 'newStanding'::text) AND (data ? 'changeDate'::text) AND ((data ->> 'membershipId'::text) IS NOT NULL) AND ((data ->> 'newStanding'::text) IS NOT NULL) AND ((data ->> 'changeDate'::text) IS NOT NULL)) AND cut2_provenance_version = 1);
  DROP INDEX public.idx_notifications_queue_whatsapp_subscription_expiring_unique;
  CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_subscription_expiring_unique ON public.notifications_queue USING btree (((data ->> 'subscriptionId'::text)), ((data ->> 'reminderDate'::text)), ((data ->> 'userId'::text))) WHERE (((channel = 'whatsapp'::notification_channel) AND (template = 'subscription_expiring'::text) AND (data ? 'subscriptionId'::text) AND (data ? 'reminderDate'::text) AND (data ? 'userId'::text) AND ((data ->> 'subscriptionId'::text) IS NOT NULL) AND ((data ->> 'reminderDate'::text) IS NOT NULL) AND ((data ->> 'userId'::text) IS NOT NULL)) AND cut2_provenance_version = 1);
  DROP INDEX public.idx_notifications_queue_whatsapp_welcome_unique;
  CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_welcome_unique ON public.notifications_queue USING btree (((data ->> 'membershipId'::text))) WHERE (((channel = 'whatsapp'::notification_channel) AND (template = 'welcome'::text) AND (data ? 'membershipId'::text)) AND cut2_provenance_version = 1);
END;
$cut2_rebuild$;

CREATE UNIQUE INDEX idx_notifications_queue_cut2_semantic_idempotency_unique
ON public.notifications_queue (channel, template, ((data ->> 'idempotencyKey')))
WHERE cut2_provenance_version = 1
  AND NULLIF(BTRIM(data ->> 'idempotencyKey'), '') IS NOT NULL;


CREATE OR REPLACE FUNCTION public.cut2_internal_channel_allowed(
  p_type text,
  p_channel public.notification_channel
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
BEGIN
  IF p_channel = 'push'::public.notification_channel THEN
    RETURN false;
  END IF;
  RETURN CASE p_type
    WHEN 'payment_receipt' THEN p_channel IN ('whatsapp'::public.notification_channel, 'sms'::public.notification_channel, 'email'::public.notification_channel)
    WHEN 'payment_reminder' THEN p_channel IN ('whatsapp'::public.notification_channel, 'sms'::public.notification_channel, 'email'::public.notification_channel)
    WHEN 'welcome' THEN p_channel IN ('whatsapp'::public.notification_channel, 'sms'::public.notification_channel, 'email'::public.notification_channel)
    WHEN 'standing_changed' THEN p_channel IN ('whatsapp'::public.notification_channel, 'sms'::public.notification_channel)
    WHEN 'relief_enrollment' THEN p_channel IN ('whatsapp'::public.notification_channel, 'sms'::public.notification_channel)
    WHEN 'relief_claim_approved' THEN p_channel IN ('whatsapp'::public.notification_channel, 'sms'::public.notification_channel)
    WHEN 'relief_claim_denied' THEN p_channel IN ('whatsapp'::public.notification_channel, 'sms'::public.notification_channel)
    WHEN 'remittance_confirmed' THEN p_channel IN ('whatsapp'::public.notification_channel, 'sms'::public.notification_channel)
    WHEN 'remittance_disputed' THEN p_channel IN ('whatsapp'::public.notification_channel, 'sms'::public.notification_channel)
    WHEN 'hosting_assignment' THEN p_channel IN ('whatsapp'::public.notification_channel, 'sms'::public.notification_channel)
    WHEN 'hosting_reminder' THEN p_channel IN ('whatsapp'::public.notification_channel, 'sms'::public.notification_channel)
    WHEN 'event_reminder' THEN p_channel IN ('whatsapp'::public.notification_channel, 'sms'::public.notification_channel, 'email'::public.notification_channel)
    WHEN 'loan_approved' THEN p_channel IN ('whatsapp'::public.notification_channel, 'sms'::public.notification_channel)
    WHEN 'loan_overdue' THEN p_channel = 'whatsapp'::public.notification_channel
    WHEN 'fine_issued' THEN p_channel IN ('whatsapp'::public.notification_channel, 'sms'::public.notification_channel)
    WHEN 'member_invitation' THEN p_channel IN ('whatsapp'::public.notification_channel, 'email'::public.notification_channel)
    WHEN 'subscription_expiring' THEN p_channel IN ('whatsapp'::public.notification_channel, 'sms'::public.notification_channel)
    WHEN 'minutes_published' THEN p_channel IN ('whatsapp'::public.notification_channel, 'sms'::public.notification_channel, 'email'::public.notification_channel)
    WHEN 'election_opened' THEN p_channel = 'whatsapp'::public.notification_channel
    WHEN 'announcement' THEN p_channel IN ('whatsapp'::public.notification_channel, 'sms'::public.notification_channel)
    WHEN 'proxy_claim' THEN p_channel IN ('whatsapp'::public.notification_channel, 'sms'::public.notification_channel)
    WHEN 'hosting_swap' THEN p_channel IN ('whatsapp'::public.notification_channel, 'sms'::public.notification_channel)
    ELSE false
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.cut2_internal_channel_allowed(text, public.notification_channel) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cut2_internal_channel_pref_allows(
  p_user_id uuid,
  p_prefs_key text,
  p_channel text,
  p_group_id uuid,
  p_skip boolean
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
DECLARE
  v_prefs jsonb;
  v_global boolean;
  v_type boolean;
  v_lookup_key text;
  v_muted boolean := false;
BEGIN
  IF p_skip THEN
    RETURN true;
  END IF;
  IF p_user_id IS NULL THEN
    RETURN p_channel = 'whatsapp';
  END IF;

  BEGIN
    SELECT p.notification_preferences INTO v_prefs
      FROM public.profiles p
     WHERE p.id = p_user_id;
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;

  v_prefs := COALESCE(v_prefs, '{}'::jsonb);

  IF p_group_id IS NOT NULL AND jsonb_typeof(v_prefs->'muted_groups') = 'array' THEN
    SELECT EXISTS (
      SELECT 1
        FROM jsonb_array_elements_text(v_prefs->'muted_groups') g(val)
       WHERE g.val = p_group_id::text
    ) INTO v_muted;
    IF v_muted THEN
      RETURN false;
    END IF;
  END IF;

  IF p_channel = 'push' THEN
    v_global := COALESCE((v_prefs->'channels'->>'push')::boolean, false);
  ELSE
    v_global := COALESCE((v_prefs->'channels'->>p_channel)::boolean, true);
  END IF;

  v_lookup_key := CASE WHEN p_prefs_key = 'meeting_minutes' THEN 'minutes_published' ELSE p_prefs_key END;

  v_type := CASE
    WHEN v_lookup_key = 'new_member' THEN false
    WHEN v_lookup_key = 'subscription_updates' AND p_channel IN ('sms', 'whatsapp') THEN false
    WHEN v_lookup_key = 'transfer_updates' AND p_channel IN ('sms', 'whatsapp') THEN false
    WHEN p_channel = 'push' AND v_lookup_key IN ('minutes_published', 'standing_changes') THEN false
    WHEN p_channel = 'push' THEN false
    ELSE true
  END;

  IF v_prefs->'types'->v_lookup_key ? p_channel THEN
    v_type := COALESCE((v_prefs->'types'->v_lookup_key->>p_channel)::boolean, v_type);
  ELSIF p_prefs_key = 'meeting_minutes' AND v_prefs->'types'->'meeting_minutes' ? p_channel THEN
    v_type := COALESCE((v_prefs->'types'->'meeting_minutes'->>p_channel)::boolean, v_type);
  ELSIF p_prefs_key = 'elections' AND v_prefs->'types'->'elections' ? p_channel THEN
    v_type := COALESCE((v_prefs->'types'->'elections'->>p_channel)::boolean, v_type);
  END IF;

  RETURN v_global AND v_type;
END;
$$;

REVOKE ALL ON FUNCTION public.cut2_internal_channel_pref_allows(uuid, text, text, uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cut2_internal_resolve_phone(
  p_membership_id uuid,
  p_mode text
) RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
DECLARE
  v_phone text;
BEGIN
  IF p_membership_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_mode = 'proxy' THEN
    SELECT NULLIF(btrim(COALESCE(m.privacy_settings->>'proxy_phone', '')), '')
           INTO v_phone
      FROM public.memberships m
     WHERE m.id = p_membership_id;
    IF v_phone IS NULL THEN
      SELECT NULLIF(btrim(COALESCE(m.phone, '')), '')
        INTO v_phone
        FROM public.memberships m
       WHERE m.id = p_membership_id;
    END IF;
    RETURN v_phone;
  END IF;

  SELECT COALESCE(
           NULLIF(btrim(pr.phone), ''),
           NULLIF(btrim(m.phone), ''),
           NULLIF(btrim(m.privacy_settings->>'proxy_phone'), ''),
           NULLIF(btrim(au.phone), '')
         )
    INTO v_phone
    FROM public.memberships m
    LEFT JOIN public.profiles pr ON pr.id = m.user_id
    LEFT JOIN auth.users au ON au.id = m.user_id
   WHERE m.id = p_membership_id;

  RETURN v_phone;
END;
$$;

REVOKE ALL ON FUNCTION public.cut2_internal_resolve_phone(uuid, text) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cut2_internal_resolve_email(
  p_membership_id uuid
) RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
DECLARE
  v_email text;
BEGIN
  IF p_membership_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT NULLIF(btrim(au.email), '')
    INTO v_email
    FROM public.memberships m
    JOIN auth.users au ON au.id = m.user_id
   WHERE m.id = p_membership_id;
  RETURN v_email;
END;
$$;

REVOKE ALL ON FUNCTION public.cut2_internal_resolve_email(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enqueue_outbound_notification(
  p_notification_type text,
  p_domain_object_id uuid,
  p_channel public.notification_channel,
  p_recipient_membership_id uuid DEFAULT NULL,
  p_locale text DEFAULT NULL
)
RETURNS TABLE (queue_id uuid, result text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_group_id uuid;
  v_recipient_membership_id uuid;
  v_recipient_user_id uuid;
  v_is_proxy boolean;
  v_membership_status text;
  v_role text;
  v_phone text;
  v_email text;
  v_key text;
  v_envelope jsonb;
  v_type_ids jsonb := '{}'::jsonb;
  v_skip_prefs boolean := false;
  v_prefs_key text;
  v_fanout boolean := false;
  v_utc_date text := to_char((timezone('utc', now()))::date, 'YYYY-MM-DD');
  v_queue_id uuid;
  v_existing uuid;
  v_contact_ok boolean := true;
  -- domain rows
  v_payment public.payments%ROWTYPE;
  v_obligation public.contribution_obligations%ROWTYPE;
  v_membership public.memberships%ROWTYPE;
  v_enrollment public.relief_enrollments%ROWTYPE;
  v_plan public.relief_plans%ROWTYPE;
  v_claim public.relief_claims%ROWTYPE;
  v_remittance public.relief_remittances%ROWTYPE;
  v_assignment public.hosting_assignments%ROWTYPE;
  v_roster public.hosting_rosters%ROWTYPE;
  v_event public.events%ROWTYPE;
  v_loan public.loans%ROWTYPE;
  v_fine public.fines%ROWTYPE;
  v_invitation public.invitations%ROWTYPE;
  v_sub public.group_subscriptions%ROWTYPE;
  v_minutes public.meeting_minutes%ROWTYPE;
  v_election public.elections%ROWTYPE;
  v_announcement public.announcements%ROWTYPE;
  v_swap public.hosting_swap_requests%ROWTYPE;
  v_event_gid uuid;
  v_aud_type text;
BEGIN
  IF p_locale IS NOT NULL AND p_locale NOT IN ('en', 'fr') THEN
    queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
  END IF;

  IF p_domain_object_id IS NULL OR p_notification_type IS NULL THEN
    queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
  END IF;

  IF NOT public.cut2_internal_channel_allowed(p_notification_type, p_channel) THEN
    queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
  END IF;

  IF p_notification_type = 'payment_receipt' THEN
    SELECT * INTO v_payment FROM public.payments WHERE id = p_domain_object_id;
    IF NOT FOUND THEN queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN; END IF;
    v_group_id := v_payment.group_id;
    v_recipient_membership_id := v_payment.membership_id;
    SELECT * INTO v_membership FROM public.memberships WHERE id = v_recipient_membership_id;
    IF NOT FOUND OR v_membership.group_id IS DISTINCT FROM v_group_id THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    IF p_recipient_membership_id IS NOT NULL AND p_recipient_membership_id IS DISTINCT FROM v_recipient_membership_id THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    v_recipient_user_id := v_membership.user_id;
    v_is_proxy := COALESCE(v_membership.is_proxy, false);
    v_prefs_key := 'payment_reminders';
    v_key := p_domain_object_id::text;
    v_type_ids := jsonb_build_object('paymentId', v_payment.id);
    v_phone := public.cut2_internal_resolve_phone(v_recipient_membership_id, CASE WHEN v_is_proxy THEN 'proxy' ELSE 'standard' END);

  ELSIF p_notification_type = 'payment_reminder' THEN
    SELECT * INTO v_obligation FROM public.contribution_obligations WHERE id = p_domain_object_id;
    IF NOT FOUND THEN queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN; END IF;
    v_group_id := v_obligation.group_id;
    v_recipient_membership_id := v_obligation.membership_id;
    SELECT * INTO v_membership FROM public.memberships WHERE id = v_recipient_membership_id;
    IF NOT FOUND OR v_membership.group_id IS DISTINCT FROM v_group_id THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    IF COALESCE(v_membership.is_proxy, false) OR v_membership.user_id IS NULL THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    IF p_recipient_membership_id IS NOT NULL AND p_recipient_membership_id IS DISTINCT FROM v_recipient_membership_id THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    v_recipient_user_id := v_membership.user_id;
    v_prefs_key := 'payment_reminders';
    v_key := v_obligation.id::text || ':' || v_utc_date;
    v_type_ids := jsonb_build_object('obligationId', v_obligation.id, 'reminderDate', v_utc_date);
    v_phone := public.cut2_internal_resolve_phone(v_recipient_membership_id, 'standard');

  ELSIF p_notification_type = 'welcome' THEN
    SELECT * INTO v_membership FROM public.memberships WHERE id = p_domain_object_id;
    IF NOT FOUND OR v_membership.user_id IS NULL THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    v_group_id := v_membership.group_id;
    v_recipient_membership_id := v_membership.id;
    IF p_recipient_membership_id IS NOT NULL AND p_recipient_membership_id IS DISTINCT FROM v_recipient_membership_id THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    v_recipient_user_id := v_membership.user_id;
    v_prefs_key := 'new_member';
    v_key := p_domain_object_id::text;
    v_type_ids := jsonb_build_object('membershipId', v_membership.id);
    v_phone := public.cut2_internal_resolve_phone(v_recipient_membership_id, 'standard');

  ELSIF p_notification_type = 'standing_changed' THEN
    SELECT * INTO v_membership FROM public.memberships WHERE id = p_domain_object_id;
    IF NOT FOUND OR v_membership.user_id IS NULL THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    v_group_id := v_membership.group_id;
    v_recipient_membership_id := v_membership.id;
    IF p_recipient_membership_id IS NOT NULL AND p_recipient_membership_id IS DISTINCT FROM v_recipient_membership_id THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    v_recipient_user_id := v_membership.user_id;
    v_prefs_key := 'standing_changes';
    v_key := v_membership.id::text || ':' || v_membership.standing::text || ':' || v_utc_date;
    v_type_ids := jsonb_build_object(
      'membershipId', v_membership.id,
      'newStanding', v_membership.standing,
      'changeDate', v_utc_date
    );
    v_phone := public.cut2_internal_resolve_phone(v_recipient_membership_id, 'standard');

  ELSIF p_notification_type = 'relief_enrollment' THEN
    SELECT * INTO v_enrollment FROM public.relief_enrollments WHERE id = p_domain_object_id;
    IF NOT FOUND THEN queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN; END IF;
    SELECT * INTO v_plan FROM public.relief_plans WHERE id = v_enrollment.plan_id;
    IF NOT FOUND THEN queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN; END IF;
    v_group_id := v_plan.group_id;
    v_recipient_membership_id := v_enrollment.membership_id;
    SELECT * INTO v_membership FROM public.memberships WHERE id = v_recipient_membership_id;
    IF NOT FOUND OR v_membership.group_id IS DISTINCT FROM v_group_id THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    IF p_recipient_membership_id IS NOT NULL AND p_recipient_membership_id IS DISTINCT FROM v_recipient_membership_id THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    v_recipient_user_id := v_membership.user_id;
    v_is_proxy := COALESCE(v_membership.is_proxy, false);
    v_prefs_key := 'relief_updates';
    v_key := p_domain_object_id::text;
    v_type_ids := jsonb_build_object('enrollmentId', v_enrollment.id);
    v_phone := public.cut2_internal_resolve_phone(v_recipient_membership_id, CASE WHEN v_is_proxy THEN 'proxy' ELSE 'standard' END);

  ELSIF p_notification_type IN ('relief_claim_approved', 'relief_claim_denied') THEN
    SELECT * INTO v_claim FROM public.relief_claims WHERE id = p_domain_object_id;
    IF NOT FOUND THEN queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN; END IF;
    IF p_notification_type = 'relief_claim_approved' AND v_claim.status IS DISTINCT FROM 'approved' THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    IF p_notification_type = 'relief_claim_denied' AND v_claim.status IS DISTINCT FROM 'denied' THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    SELECT * INTO v_plan FROM public.relief_plans WHERE id = v_claim.plan_id;
    IF NOT FOUND THEN queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN; END IF;
    v_group_id := v_plan.group_id;
    v_recipient_membership_id := v_claim.membership_id;
    SELECT * INTO v_membership FROM public.memberships WHERE id = v_recipient_membership_id;
    IF NOT FOUND OR v_membership.group_id IS DISTINCT FROM v_group_id THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    IF p_recipient_membership_id IS NOT NULL AND p_recipient_membership_id IS DISTINCT FROM v_recipient_membership_id THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    v_recipient_user_id := v_membership.user_id;
    v_is_proxy := COALESCE(v_membership.is_proxy, false);
    v_prefs_key := 'relief_updates';
    v_key := p_domain_object_id::text;
    v_type_ids := jsonb_build_object('claimId', v_claim.id);
    v_phone := public.cut2_internal_resolve_phone(v_recipient_membership_id, CASE WHEN v_is_proxy THEN 'proxy' ELSE 'standard' END);

  ELSIF p_notification_type IN ('remittance_confirmed', 'remittance_disputed') THEN
    v_fanout := true;
    SELECT * INTO v_remittance FROM public.relief_remittances WHERE id = p_domain_object_id;
    IF NOT FOUND THEN queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN; END IF;
    IF p_notification_type = 'remittance_confirmed' AND v_remittance.status IS DISTINCT FROM 'confirmed' THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    IF p_notification_type = 'remittance_disputed' AND v_remittance.status IS DISTINCT FROM 'disputed' THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    IF p_recipient_membership_id IS NULL THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    v_group_id := v_remittance.branch_group_id;
    SELECT * INTO v_membership FROM public.memberships WHERE id = p_recipient_membership_id;
    IF NOT FOUND
       OR v_membership.group_id IS DISTINCT FROM v_group_id
       OR v_membership.user_id IS NULL
       OR COALESCE(v_membership.membership_status, 'active') IS DISTINCT FROM 'active'
       OR v_membership.role::text NOT IN ('owner', 'admin') THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    v_recipient_membership_id := v_membership.id;
    v_recipient_user_id := v_membership.user_id;
    v_prefs_key := 'relief_updates';
    v_key := v_remittance.id::text || ':' || v_recipient_user_id::text;
    v_type_ids := jsonb_build_object('remittanceId', v_remittance.id, 'recipientUserId', v_recipient_user_id);
    v_phone := public.cut2_internal_resolve_phone(v_recipient_membership_id, 'standard');

  ELSIF p_notification_type IN ('hosting_assignment', 'hosting_reminder') THEN
    SELECT * INTO v_assignment FROM public.hosting_assignments WHERE id = p_domain_object_id;
    IF NOT FOUND THEN queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN; END IF;
    SELECT * INTO v_roster FROM public.hosting_rosters WHERE id = v_assignment.roster_id;
    IF NOT FOUND THEN queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN; END IF;
    v_group_id := v_roster.group_id;
    IF v_assignment.event_id IS NOT NULL THEN
      SELECT e.group_id INTO v_event_gid FROM public.events e WHERE e.id = v_assignment.event_id;
      IF v_event_gid IS NULL OR v_event_gid IS DISTINCT FROM v_group_id THEN
        queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
      END IF;
    END IF;
    v_recipient_membership_id := v_assignment.membership_id;
    SELECT * INTO v_membership FROM public.memberships WHERE id = v_recipient_membership_id;
    IF NOT FOUND OR v_membership.group_id IS DISTINCT FROM v_group_id THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    IF p_recipient_membership_id IS NOT NULL AND p_recipient_membership_id IS DISTINCT FROM v_recipient_membership_id THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    v_recipient_user_id := v_membership.user_id;
    v_is_proxy := COALESCE(v_membership.is_proxy, false);
    v_prefs_key := 'hosting_reminders';
    IF p_notification_type = 'hosting_assignment' THEN
      v_key := p_domain_object_id::text;
      v_type_ids := jsonb_build_object('assignmentId', v_assignment.id);
    ELSE
      v_key := v_assignment.id::text || ':' || v_assignment.assigned_date::text;
      v_type_ids := jsonb_build_object('assignmentId', v_assignment.id, 'assignedDate', v_assignment.assigned_date);
    END IF;
    v_phone := public.cut2_internal_resolve_phone(v_recipient_membership_id, CASE WHEN v_is_proxy THEN 'proxy' ELSE 'standard' END);

  ELSIF p_notification_type = 'event_reminder' THEN
    v_fanout := true;
    SELECT * INTO v_event FROM public.events WHERE id = p_domain_object_id;
    IF NOT FOUND THEN queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN; END IF;
    IF p_recipient_membership_id IS NULL THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    v_group_id := v_event.group_id;
    SELECT * INTO v_membership FROM public.memberships WHERE id = p_recipient_membership_id;
    IF NOT FOUND
       OR v_membership.group_id IS DISTINCT FROM v_group_id
       OR v_membership.user_id IS NULL
       OR COALESCE(v_membership.is_proxy, false)
       OR COALESCE(v_membership.membership_status, 'active') IS DISTINCT FROM 'active' THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    v_recipient_membership_id := v_membership.id;
    v_recipient_user_id := v_membership.user_id;
    v_prefs_key := 'event_reminders';
    v_key := v_event.id::text || ':' || v_recipient_user_id::text;
    v_type_ids := jsonb_build_object('eventId', v_event.id, 'userId', v_recipient_user_id);
    v_phone := public.cut2_internal_resolve_phone(v_recipient_membership_id, 'standard');

  ELSIF p_notification_type = 'loan_approved' THEN
    SELECT * INTO v_loan FROM public.loans WHERE id = p_domain_object_id;
    IF NOT FOUND OR v_loan.status NOT IN ('approved', 'disbursed', 'repaying') THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    v_group_id := v_loan.group_id;
    v_recipient_membership_id := v_loan.membership_id;
    SELECT * INTO v_membership FROM public.memberships WHERE id = v_recipient_membership_id;
    IF NOT FOUND OR v_membership.group_id IS DISTINCT FROM v_group_id THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    IF p_recipient_membership_id IS NOT NULL AND p_recipient_membership_id IS DISTINCT FROM v_recipient_membership_id THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    v_recipient_user_id := v_membership.user_id;
    v_is_proxy := COALESCE(v_membership.is_proxy, false);
    v_prefs_key := 'loan_updates';
    v_key := p_domain_object_id::text;
    v_type_ids := jsonb_build_object('loanId', v_loan.id);
    v_phone := public.cut2_internal_resolve_phone(v_recipient_membership_id, CASE WHEN v_is_proxy THEN 'proxy' ELSE 'standard' END);

  ELSIF p_notification_type = 'loan_overdue' THEN
    SELECT * INTO v_loan FROM public.loans WHERE id = p_domain_object_id;
    IF NOT FOUND THEN queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN; END IF;
    v_group_id := v_loan.group_id;
    v_recipient_membership_id := v_loan.membership_id;
    SELECT * INTO v_membership FROM public.memberships WHERE id = v_recipient_membership_id;
    IF NOT FOUND OR v_membership.group_id IS DISTINCT FROM v_group_id THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    IF p_recipient_membership_id IS NOT NULL AND p_recipient_membership_id IS DISTINCT FROM v_recipient_membership_id THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    v_recipient_user_id := v_membership.user_id;
    v_is_proxy := COALESCE(v_membership.is_proxy, false);
    v_prefs_key := 'loan_updates';
    v_key := v_loan.id::text || ':' || v_utc_date;
    v_type_ids := jsonb_build_object('loanId', v_loan.id, 'reminderDate', v_utc_date);
    v_phone := public.cut2_internal_resolve_phone(v_recipient_membership_id, CASE WHEN v_is_proxy THEN 'proxy' ELSE 'standard' END);

  ELSIF p_notification_type = 'fine_issued' THEN
    SELECT * INTO v_fine FROM public.fines WHERE id = p_domain_object_id;
    IF NOT FOUND THEN queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN; END IF;
    v_group_id := v_fine.group_id;
    v_recipient_membership_id := v_fine.membership_id;
    SELECT * INTO v_membership FROM public.memberships WHERE id = v_recipient_membership_id;
    IF NOT FOUND OR v_membership.group_id IS DISTINCT FROM v_group_id THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    IF p_recipient_membership_id IS NOT NULL AND p_recipient_membership_id IS DISTINCT FROM v_recipient_membership_id THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    v_recipient_user_id := v_membership.user_id;
    v_is_proxy := COALESCE(v_membership.is_proxy, false);
    v_prefs_key := 'fine_updates';
    v_key := p_domain_object_id::text;
    v_type_ids := jsonb_build_object('fineId', v_fine.id);
    v_phone := public.cut2_internal_resolve_phone(v_recipient_membership_id, CASE WHEN v_is_proxy THEN 'proxy' ELSE 'standard' END);

  ELSIF p_notification_type = 'member_invitation' THEN
    SELECT * INTO v_invitation FROM public.invitations WHERE id = p_domain_object_id;
    IF NOT FOUND THEN queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN; END IF;
    IF p_recipient_membership_id IS NOT NULL THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    v_group_id := v_invitation.group_id;
    v_recipient_membership_id := NULL;
    v_recipient_user_id := NULL;
    v_skip_prefs := true;
    v_prefs_key := NULL;
    v_key := v_invitation.id::text || ':' || v_utc_date;
    v_type_ids := jsonb_build_object('invitationId', v_invitation.id, 'sendDate', v_utc_date);
    v_phone := NULLIF(btrim(v_invitation.phone), '');
    v_email := NULLIF(btrim(v_invitation.email), '');

  ELSIF p_notification_type = 'subscription_expiring' THEN
    v_fanout := true;
    SELECT * INTO v_sub FROM public.group_subscriptions WHERE id = p_domain_object_id;
    IF NOT FOUND THEN queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN; END IF;
    IF p_recipient_membership_id IS NULL THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    v_group_id := v_sub.group_id;
    SELECT * INTO v_membership FROM public.memberships WHERE id = p_recipient_membership_id;
    IF NOT FOUND
       OR v_membership.group_id IS DISTINCT FROM v_group_id
       OR v_membership.user_id IS NULL
       OR COALESCE(v_membership.is_proxy, false)
       OR COALESCE(v_membership.membership_status, 'active') IS DISTINCT FROM 'active'
       OR v_membership.role::text NOT IN ('owner', 'admin') THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    v_recipient_membership_id := v_membership.id;
    v_recipient_user_id := v_membership.user_id;
    v_prefs_key := 'subscription_updates';
    v_key := v_sub.id::text || ':' || v_utc_date || ':' || v_recipient_user_id::text;
    v_type_ids := jsonb_build_object(
      'subscriptionId', v_sub.id,
      'reminderDate', v_utc_date,
      'userId', v_recipient_user_id
    );
    v_phone := public.cut2_internal_resolve_phone(v_recipient_membership_id, 'standard');

  ELSIF p_notification_type = 'minutes_published' THEN
    v_fanout := true;
    SELECT * INTO v_minutes FROM public.meeting_minutes WHERE id = p_domain_object_id;
    IF NOT FOUND THEN queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN; END IF;
    IF p_recipient_membership_id IS NULL THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    v_group_id := v_minutes.group_id;
    SELECT * INTO v_membership FROM public.memberships WHERE id = p_recipient_membership_id;
    IF NOT FOUND
       OR v_membership.group_id IS DISTINCT FROM v_group_id
       OR v_membership.user_id IS NULL
       OR COALESCE(v_membership.membership_status, 'active') IS DISTINCT FROM 'active' THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    v_recipient_membership_id := v_membership.id;
    v_recipient_user_id := v_membership.user_id;
    v_prefs_key := 'meeting_minutes';
    v_key := v_minutes.id::text || ':' || v_recipient_user_id::text;
    v_type_ids := jsonb_build_object('minutesId', v_minutes.id, 'userId', v_recipient_user_id);
    v_phone := public.cut2_internal_resolve_phone(v_recipient_membership_id, 'standard');

  ELSIF p_notification_type = 'election_opened' THEN
    v_fanout := true;
    SELECT * INTO v_election FROM public.elections WHERE id = p_domain_object_id;
    IF NOT FOUND THEN queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN; END IF;
    IF p_recipient_membership_id IS NULL THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    v_group_id := v_election.group_id;
    SELECT * INTO v_membership FROM public.memberships WHERE id = p_recipient_membership_id;
    IF NOT FOUND
       OR v_membership.group_id IS DISTINCT FROM v_group_id
       OR v_membership.user_id IS NULL THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    v_recipient_membership_id := v_membership.id;
    v_recipient_user_id := v_membership.user_id;
    v_prefs_key := 'elections';
    v_key := v_election.id::text || ':' || v_recipient_user_id::text;
    v_type_ids := jsonb_build_object('electionId', v_election.id, 'userId', v_recipient_user_id);
    v_phone := public.cut2_internal_resolve_phone(v_recipient_membership_id, 'standard');

  ELSIF p_notification_type = 'announcement' THEN
    v_fanout := true;
    SELECT * INTO v_announcement FROM public.announcements WHERE id = p_domain_object_id;
    IF NOT FOUND THEN queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN; END IF;
    IF p_recipient_membership_id IS NULL THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    v_group_id := v_announcement.group_id;
    SELECT * INTO v_membership FROM public.memberships WHERE id = p_recipient_membership_id;
    IF NOT FOUND
       OR v_membership.group_id IS DISTINCT FROM v_group_id
       OR v_membership.user_id IS NULL
       OR COALESCE(v_membership.membership_status, 'active') IS DISTINCT FROM 'active'
       OR v_membership.standing::text = 'banned' THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    v_aud_type := COALESCE(v_announcement.audience->>'type', 'all');
    IF v_aud_type = 'roles' THEN
      IF NOT (v_announcement.audience->'roles' ? v_membership.role::text) THEN
        queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
      END IF;
    ELSIF v_aud_type = 'members' THEN
      IF NOT (v_announcement.audience->'members' ? v_membership.id::text) THEN
        queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
      END IF;
    ELSIF v_aud_type IS DISTINCT FROM 'all' THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    v_recipient_membership_id := v_membership.id;
    v_recipient_user_id := v_membership.user_id;
    v_prefs_key := 'announcements';
    v_key := v_announcement.id::text || ':' || v_recipient_user_id::text;
    v_type_ids := jsonb_build_object('announcementId', v_announcement.id, 'userId', v_recipient_user_id);
    v_phone := public.cut2_internal_resolve_phone(v_recipient_membership_id, 'standard');

  ELSIF p_notification_type = 'proxy_claim' THEN
    SELECT * INTO v_membership FROM public.memberships WHERE id = p_domain_object_id;
    IF NOT FOUND
       OR NOT COALESCE(v_membership.is_proxy, false)
       OR v_membership.user_id IS NOT NULL
       OR COALESCE(v_membership.membership_status, 'active') IS DISTINCT FROM 'active' THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    IF p_recipient_membership_id IS NOT NULL AND p_recipient_membership_id IS DISTINCT FROM v_membership.id THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    v_group_id := v_membership.group_id;
    v_recipient_membership_id := v_membership.id;
    v_recipient_user_id := NULL;
    v_skip_prefs := true;
    v_prefs_key := NULL;
    v_key := p_domain_object_id::text;
    v_type_ids := jsonb_build_object('membershipId', v_membership.id);
    v_phone := public.cut2_internal_resolve_phone(v_recipient_membership_id, 'proxy');

  ELSIF p_notification_type = 'hosting_swap' THEN
    v_fanout := true;
    SELECT * INTO v_swap FROM public.hosting_swap_requests WHERE id = p_domain_object_id;
    IF NOT FOUND THEN queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN; END IF;
    IF p_recipient_membership_id IS NULL THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    SELECT * INTO v_assignment FROM public.hosting_assignments WHERE id = v_swap.from_assignment_id;
    IF NOT FOUND THEN queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN; END IF;
    SELECT * INTO v_roster FROM public.hosting_rosters WHERE id = v_assignment.roster_id;
    IF NOT FOUND THEN queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN; END IF;
    v_group_id := v_roster.group_id;
    SELECT * INTO v_membership FROM public.memberships WHERE id = p_recipient_membership_id;
    IF NOT FOUND OR v_membership.group_id IS DISTINCT FROM v_group_id THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    IF v_swap.status::text = 'pending' THEN
      IF COALESCE(v_membership.membership_status, 'active') IS DISTINCT FROM 'active'
         OR v_membership.role::text NOT IN ('owner', 'admin')
         OR v_membership.user_id IS NULL THEN
        queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
      END IF;
    ELSIF v_swap.status::text IN ('approved', 'rejected') THEN
      IF v_membership.user_id IS DISTINCT FROM v_swap.requested_by THEN
        queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
      END IF;
    ELSE
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
    v_recipient_membership_id := v_membership.id;
    v_recipient_user_id := v_membership.user_id;
    v_prefs_key := 'hosting_reminders';
    v_key := v_swap.id::text || ':' || v_membership.id::text || ':' || v_swap.status::text;
    v_type_ids := jsonb_build_object(
      'swapRequestId', v_swap.id,
      'userId', v_recipient_user_id,
      'decision', v_swap.status
    );
    v_phone := public.cut2_internal_resolve_phone(v_recipient_membership_id, 'standard');

  ELSE
    queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
  END IF;

  IF p_notification_type <> 'member_invitation' THEN
    v_email := public.cut2_internal_resolve_email(v_recipient_membership_id);
  END IF;

  IF p_channel = 'email'::public.notification_channel THEN
    IF v_email IS NULL THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
  ELSIF p_channel IN ('sms'::public.notification_channel, 'whatsapp'::public.notification_channel) THEN
    IF v_phone IS NULL THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;
  END IF;

  IF NOT public.cut2_internal_channel_pref_allows(
       v_recipient_user_id,
       v_prefs_key,
       p_channel::text,
       v_group_id,
       v_skip_prefs
     ) THEN
    queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
  END IF;

  IF v_key IS NULL OR btrim(v_key) = '' THEN
    queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
  END IF;

  v_envelope := jsonb_strip_nulls(jsonb_build_object(
      'envelopeVersion', 2,
      'cut2Semantic', true,
      'notification_type', p_notification_type,
      'domain_object_id', p_domain_object_id,
      'derived_group_id', v_group_id,
      'groupId', v_group_id,
      'recipient_membership_id', v_recipient_membership_id,
      'recipient_user_id', v_recipient_user_id,
      'idempotencyKey', v_key,
      'locale', p_locale
    ) || COALESCE(v_type_ids, '{}'::jsonb));

  -- Forbidden provider-authority keys must never be written.
  v_envelope := v_envelope - 'message' - 'components' - 'whatsappData';

  BEGIN
    INSERT INTO public.notifications_queue (
      user_id,
      channel,
      template,
      data,
      status,
      cut2_provenance_version
    ) VALUES (
      v_recipient_user_id,
      p_channel,
      p_notification_type,
      v_envelope,
      'queued',
      1
    )
    RETURNING id INTO v_queue_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT nq.id INTO v_existing
      FROM public.notifications_queue nq
     WHERE nq.cut2_provenance_version = 1
       AND nq.channel = p_channel
       AND nq.template = p_notification_type
       AND nq.data->>'idempotencyKey' = v_key
     LIMIT 1;
    IF v_existing IS NOT NULL THEN
      queue_id := v_existing;
      result := 'duplicate';
      RETURN NEXT;
      RETURN;
    END IF;
    queue_id := NULL;
    result := 'trusted_idempotency_conflict_mismatch';
    RETURN NEXT;
    RETURN;
  END;

  queue_id := v_queue_id;
  result := 'inserted';
  RETURN NEXT;
END;
$$;


REVOKE ALL ON FUNCTION public.enqueue_outbound_notification(text, uuid, public.notification_channel, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_outbound_notification(text, uuid, public.notification_channel, uuid, text)
  TO service_role;

DROP POLICY IF EXISTS "Authenticated users can queue notifications" ON public.notifications_queue;
DROP POLICY IF EXISTS "Staff can update notification queue" ON public.notifications_queue;

REVOKE ALL ON TABLE public.notifications_queue FROM PUBLIC;
REVOKE ALL ON TABLE public.notifications_queue FROM anon;
REVOKE ALL ON TABLE public.notifications_queue FROM authenticated;
REVOKE ALL ON TABLE public.notifications_queue FROM service_role;

GRANT SELECT ON TABLE public.notifications_queue TO authenticated;
GRANT SELECT ON TABLE public.notifications_queue TO service_role;
GRANT UPDATE (status, error_message, attempts, sent_at, data)
  ON TABLE public.notifications_queue TO service_role;

CREATE OR REPLACE FUNCTION public.cut2_protect_queue_immutables()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.cut2_provenance_version IS DISTINCT FROM NEW.cut2_provenance_version THEN
      RAISE EXCEPTION 'cut2_provenance_version is immutable';
    END IF;
    IF OLD.channel IS DISTINCT FROM NEW.channel
       OR OLD.template IS DISTINCT FROM NEW.template
       OR OLD.user_id IS DISTINCT FROM NEW.user_id
       OR OLD.id IS DISTINCT FROM NEW.id
       OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
      RAISE EXCEPTION 'notifications_queue identity columns are immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cut2_protect_queue_immutables ON public.notifications_queue;
CREATE TRIGGER trg_cut2_protect_queue_immutables
  BEFORE UPDATE ON public.notifications_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.cut2_protect_queue_immutables();

REVOKE ALL ON FUNCTION public.cut2_protect_queue_immutables() FROM PUBLIC, anon, authenticated, service_role;

DO $cut2_post$
DECLARE
  v_indexdef text;
  v_legacy bigint;
  v_default text;
  v_has boolean;
  v_nargs int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'notifications_queue'
       AND column_name = 'cut2_provenance_version'
       AND data_type = 'smallint'
  ) THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: cut2_provenance_version missing';
  END IF;

  SELECT column_default INTO v_default
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'notifications_queue'
     AND column_name = 'cut2_provenance_version';
  IF v_default IS NOT NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: cut2_provenance_version must have no DEFAULT';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
     WHERE conname = 'notifications_queue_cut2_provenance_version_check'
  ) THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: provenance CHECK missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.notifications_queue
     WHERE cut2_provenance_version IS NOT NULL
       AND cut2_provenance_version IS DISTINCT FROM 1
  ) THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: illegal provenance value present';
  END IF;

  -- Existing rows must remain NULL (no backfill)
  -- (new trusted rows are only created after this point via RPC)


  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_whatsapp_claim_approved_unique';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: missing rewritten WhatsApp unique idx_notifications_queue_whatsapp_claim_approved_unique';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_claim_approved_unique ON public.notifications_queue USING btree (((data ->> ''claimId''::text))) WHERE (((channel = ''whatsapp''::notification_channel) AND (template = ''relief_claim_approved''::text) AND (data ? ''claimId''::text) AND ((data ->> ''claimId''::text) IS NOT NULL)) AND cut2_provenance_version = 1)'
     AND v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_claim_approved_unique ON public.notifications_queue USING btree (((data ->> ''claimId''::text))) WHERE ((channel = ''whatsapp''::notification_channel) AND (template = ''relief_claim_approved''::text) AND (data ? ''claimId''::text) AND ((data ->> ''claimId''::text) IS NOT NULL) AND (cut2_provenance_version = 1))' THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: rewritten WhatsApp unique indexdef drift for idx_notifications_queue_whatsapp_claim_approved_unique: %', v_indexdef;
  END IF;
  IF position('cut2_provenance_version = 1' in v_indexdef) = 0 THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: rewritten WhatsApp unique idx_notifications_queue_whatsapp_claim_approved_unique is not provenance-scoped';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_whatsapp_claim_denied_unique';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: missing rewritten WhatsApp unique idx_notifications_queue_whatsapp_claim_denied_unique';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_claim_denied_unique ON public.notifications_queue USING btree (((data ->> ''claimId''::text))) WHERE (((channel = ''whatsapp''::notification_channel) AND (template = ''relief_claim_denied''::text) AND (data ? ''claimId''::text) AND ((data ->> ''claimId''::text) IS NOT NULL)) AND cut2_provenance_version = 1)'
     AND v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_claim_denied_unique ON public.notifications_queue USING btree (((data ->> ''claimId''::text))) WHERE ((channel = ''whatsapp''::notification_channel) AND (template = ''relief_claim_denied''::text) AND (data ? ''claimId''::text) AND ((data ->> ''claimId''::text) IS NOT NULL) AND (cut2_provenance_version = 1))' THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: rewritten WhatsApp unique indexdef drift for idx_notifications_queue_whatsapp_claim_denied_unique: %', v_indexdef;
  END IF;
  IF position('cut2_provenance_version = 1' in v_indexdef) = 0 THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: rewritten WhatsApp unique idx_notifications_queue_whatsapp_claim_denied_unique is not provenance-scoped';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_whatsapp_event_reminder_unique';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: missing rewritten WhatsApp unique idx_notifications_queue_whatsapp_event_reminder_unique';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_event_reminder_unique ON public.notifications_queue USING btree (((data ->> ''eventId''::text)), ((data ->> ''userId''::text))) WHERE (((channel = ''whatsapp''::notification_channel) AND (template = ''event_reminder''::text) AND (data ? ''eventId''::text) AND (data ? ''userId''::text) AND ((data ->> ''eventId''::text) IS NOT NULL) AND ((data ->> ''userId''::text) IS NOT NULL)) AND cut2_provenance_version = 1)'
     AND v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_event_reminder_unique ON public.notifications_queue USING btree (((data ->> ''eventId''::text)), ((data ->> ''userId''::text))) WHERE ((channel = ''whatsapp''::notification_channel) AND (template = ''event_reminder''::text) AND (data ? ''eventId''::text) AND (data ? ''userId''::text) AND ((data ->> ''eventId''::text) IS NOT NULL) AND ((data ->> ''userId''::text) IS NOT NULL) AND (cut2_provenance_version = 1))' THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: rewritten WhatsApp unique indexdef drift for idx_notifications_queue_whatsapp_event_reminder_unique: %', v_indexdef;
  END IF;
  IF position('cut2_provenance_version = 1' in v_indexdef) = 0 THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: rewritten WhatsApp unique idx_notifications_queue_whatsapp_event_reminder_unique is not provenance-scoped';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_whatsapp_fine_issued_unique';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: missing rewritten WhatsApp unique idx_notifications_queue_whatsapp_fine_issued_unique';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_fine_issued_unique ON public.notifications_queue USING btree (((data ->> ''fineId''::text))) WHERE (((channel = ''whatsapp''::notification_channel) AND (template = ''fine_issued''::text) AND (data ? ''fineId''::text) AND ((data ->> ''fineId''::text) IS NOT NULL)) AND cut2_provenance_version = 1)'
     AND v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_fine_issued_unique ON public.notifications_queue USING btree (((data ->> ''fineId''::text))) WHERE ((channel = ''whatsapp''::notification_channel) AND (template = ''fine_issued''::text) AND (data ? ''fineId''::text) AND ((data ->> ''fineId''::text) IS NOT NULL) AND (cut2_provenance_version = 1))' THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: rewritten WhatsApp unique indexdef drift for idx_notifications_queue_whatsapp_fine_issued_unique: %', v_indexdef;
  END IF;
  IF position('cut2_provenance_version = 1' in v_indexdef) = 0 THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: rewritten WhatsApp unique idx_notifications_queue_whatsapp_fine_issued_unique is not provenance-scoped';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_whatsapp_hosting_assignment_unique';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: missing rewritten WhatsApp unique idx_notifications_queue_whatsapp_hosting_assignment_unique';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_hosting_assignment_unique ON public.notifications_queue USING btree (((data ->> ''assignmentId''::text))) WHERE (((channel = ''whatsapp''::notification_channel) AND (template = ''hosting_assignment''::text) AND (data ? ''assignmentId''::text) AND ((data ->> ''assignmentId''::text) IS NOT NULL)) AND cut2_provenance_version = 1)'
     AND v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_hosting_assignment_unique ON public.notifications_queue USING btree (((data ->> ''assignmentId''::text))) WHERE ((channel = ''whatsapp''::notification_channel) AND (template = ''hosting_assignment''::text) AND (data ? ''assignmentId''::text) AND ((data ->> ''assignmentId''::text) IS NOT NULL) AND (cut2_provenance_version = 1))' THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: rewritten WhatsApp unique indexdef drift for idx_notifications_queue_whatsapp_hosting_assignment_unique: %', v_indexdef;
  END IF;
  IF position('cut2_provenance_version = 1' in v_indexdef) = 0 THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: rewritten WhatsApp unique idx_notifications_queue_whatsapp_hosting_assignment_unique is not provenance-scoped';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_whatsapp_hosting_reminder_unique';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: missing rewritten WhatsApp unique idx_notifications_queue_whatsapp_hosting_reminder_unique';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_hosting_reminder_unique ON public.notifications_queue USING btree (((data ->> ''assignmentId''::text)), ((data ->> ''assignedDate''::text))) WHERE (((channel = ''whatsapp''::notification_channel) AND (template = ''hosting_reminder''::text) AND (data ? ''assignmentId''::text) AND (data ? ''assignedDate''::text) AND ((data ->> ''assignmentId''::text) IS NOT NULL) AND ((data ->> ''assignedDate''::text) IS NOT NULL)) AND cut2_provenance_version = 1)'
     AND v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_hosting_reminder_unique ON public.notifications_queue USING btree (((data ->> ''assignmentId''::text)), ((data ->> ''assignedDate''::text))) WHERE ((channel = ''whatsapp''::notification_channel) AND (template = ''hosting_reminder''::text) AND (data ? ''assignmentId''::text) AND (data ? ''assignedDate''::text) AND ((data ->> ''assignmentId''::text) IS NOT NULL) AND ((data ->> ''assignedDate''::text) IS NOT NULL) AND (cut2_provenance_version = 1))' THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: rewritten WhatsApp unique indexdef drift for idx_notifications_queue_whatsapp_hosting_reminder_unique: %', v_indexdef;
  END IF;
  IF position('cut2_provenance_version = 1' in v_indexdef) = 0 THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: rewritten WhatsApp unique idx_notifications_queue_whatsapp_hosting_reminder_unique is not provenance-scoped';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_whatsapp_loan_approved_unique';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: missing rewritten WhatsApp unique idx_notifications_queue_whatsapp_loan_approved_unique';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_loan_approved_unique ON public.notifications_queue USING btree (((data ->> ''loanId''::text))) WHERE (((channel = ''whatsapp''::notification_channel) AND (template = ''loan_approved''::text) AND (data ? ''loanId''::text) AND ((data ->> ''loanId''::text) IS NOT NULL)) AND cut2_provenance_version = 1)'
     AND v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_loan_approved_unique ON public.notifications_queue USING btree (((data ->> ''loanId''::text))) WHERE ((channel = ''whatsapp''::notification_channel) AND (template = ''loan_approved''::text) AND (data ? ''loanId''::text) AND ((data ->> ''loanId''::text) IS NOT NULL) AND (cut2_provenance_version = 1))' THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: rewritten WhatsApp unique indexdef drift for idx_notifications_queue_whatsapp_loan_approved_unique: %', v_indexdef;
  END IF;
  IF position('cut2_provenance_version = 1' in v_indexdef) = 0 THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: rewritten WhatsApp unique idx_notifications_queue_whatsapp_loan_approved_unique is not provenance-scoped';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_whatsapp_loan_overdue_unique';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: missing rewritten WhatsApp unique idx_notifications_queue_whatsapp_loan_overdue_unique';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_loan_overdue_unique ON public.notifications_queue USING btree (((data ->> ''loanId''::text)), ((data ->> ''reminderDate''::text))) WHERE (((channel = ''whatsapp''::notification_channel) AND (template = ''loan_overdue''::text) AND (data ? ''loanId''::text) AND (data ? ''reminderDate''::text) AND ((data ->> ''loanId''::text) IS NOT NULL) AND ((data ->> ''reminderDate''::text) IS NOT NULL)) AND cut2_provenance_version = 1)'
     AND v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_loan_overdue_unique ON public.notifications_queue USING btree (((data ->> ''loanId''::text)), ((data ->> ''reminderDate''::text))) WHERE ((channel = ''whatsapp''::notification_channel) AND (template = ''loan_overdue''::text) AND (data ? ''loanId''::text) AND (data ? ''reminderDate''::text) AND ((data ->> ''loanId''::text) IS NOT NULL) AND ((data ->> ''reminderDate''::text) IS NOT NULL) AND (cut2_provenance_version = 1))' THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: rewritten WhatsApp unique indexdef drift for idx_notifications_queue_whatsapp_loan_overdue_unique: %', v_indexdef;
  END IF;
  IF position('cut2_provenance_version = 1' in v_indexdef) = 0 THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: rewritten WhatsApp unique idx_notifications_queue_whatsapp_loan_overdue_unique is not provenance-scoped';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_whatsapp_member_invitation_unique';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: missing rewritten WhatsApp unique idx_notifications_queue_whatsapp_member_invitation_unique';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_member_invitation_unique ON public.notifications_queue USING btree (((data ->> ''invitationId''::text)), ((data ->> ''sendDate''::text))) WHERE (((channel = ''whatsapp''::notification_channel) AND (template = ''member_invitation''::text) AND (data ? ''invitationId''::text) AND (data ? ''sendDate''::text) AND ((data ->> ''invitationId''::text) IS NOT NULL) AND ((data ->> ''sendDate''::text) IS NOT NULL)) AND cut2_provenance_version = 1)'
     AND v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_member_invitation_unique ON public.notifications_queue USING btree (((data ->> ''invitationId''::text)), ((data ->> ''sendDate''::text))) WHERE ((channel = ''whatsapp''::notification_channel) AND (template = ''member_invitation''::text) AND (data ? ''invitationId''::text) AND (data ? ''sendDate''::text) AND ((data ->> ''invitationId''::text) IS NOT NULL) AND ((data ->> ''sendDate''::text) IS NOT NULL) AND (cut2_provenance_version = 1))' THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: rewritten WhatsApp unique indexdef drift for idx_notifications_queue_whatsapp_member_invitation_unique: %', v_indexdef;
  END IF;
  IF position('cut2_provenance_version = 1' in v_indexdef) = 0 THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: rewritten WhatsApp unique idx_notifications_queue_whatsapp_member_invitation_unique is not provenance-scoped';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_whatsapp_payment_receipt_unique';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: missing rewritten WhatsApp unique idx_notifications_queue_whatsapp_payment_receipt_unique';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_payment_receipt_unique ON public.notifications_queue USING btree (((data ->> ''paymentId''::text))) WHERE (((channel = ''whatsapp''::notification_channel) AND (template = ''payment_receipt''::text) AND (data ? ''paymentId''::text)) AND cut2_provenance_version = 1)'
     AND v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_payment_receipt_unique ON public.notifications_queue USING btree (((data ->> ''paymentId''::text))) WHERE ((channel = ''whatsapp''::notification_channel) AND (template = ''payment_receipt''::text) AND (data ? ''paymentId''::text) AND (cut2_provenance_version = 1))' THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: rewritten WhatsApp unique indexdef drift for idx_notifications_queue_whatsapp_payment_receipt_unique: %', v_indexdef;
  END IF;
  IF position('cut2_provenance_version = 1' in v_indexdef) = 0 THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: rewritten WhatsApp unique idx_notifications_queue_whatsapp_payment_receipt_unique is not provenance-scoped';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_whatsapp_payment_reminder_unique';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: missing rewritten WhatsApp unique idx_notifications_queue_whatsapp_payment_reminder_unique';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_payment_reminder_unique ON public.notifications_queue USING btree (((data ->> ''obligationId''::text)), ((data ->> ''reminderDate''::text))) WHERE (((channel = ''whatsapp''::notification_channel) AND (template = ''payment_reminder''::text) AND (data ? ''obligationId''::text) AND (data ? ''reminderDate''::text) AND ((data ->> ''obligationId''::text) IS NOT NULL) AND ((data ->> ''reminderDate''::text) IS NOT NULL)) AND cut2_provenance_version = 1)'
     AND v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_payment_reminder_unique ON public.notifications_queue USING btree (((data ->> ''obligationId''::text)), ((data ->> ''reminderDate''::text))) WHERE ((channel = ''whatsapp''::notification_channel) AND (template = ''payment_reminder''::text) AND (data ? ''obligationId''::text) AND (data ? ''reminderDate''::text) AND ((data ->> ''obligationId''::text) IS NOT NULL) AND ((data ->> ''reminderDate''::text) IS NOT NULL) AND (cut2_provenance_version = 1))' THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: rewritten WhatsApp unique indexdef drift for idx_notifications_queue_whatsapp_payment_reminder_unique: %', v_indexdef;
  END IF;
  IF position('cut2_provenance_version = 1' in v_indexdef) = 0 THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: rewritten WhatsApp unique idx_notifications_queue_whatsapp_payment_reminder_unique is not provenance-scoped';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_whatsapp_relief_enrollment_unique';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: missing rewritten WhatsApp unique idx_notifications_queue_whatsapp_relief_enrollment_unique';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_relief_enrollment_unique ON public.notifications_queue USING btree (((data ->> ''enrollmentId''::text))) WHERE (((channel = ''whatsapp''::notification_channel) AND (template = ''relief_enrollment''::text) AND (data ? ''enrollmentId''::text) AND ((data ->> ''enrollmentId''::text) IS NOT NULL)) AND cut2_provenance_version = 1)'
     AND v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_relief_enrollment_unique ON public.notifications_queue USING btree (((data ->> ''enrollmentId''::text))) WHERE ((channel = ''whatsapp''::notification_channel) AND (template = ''relief_enrollment''::text) AND (data ? ''enrollmentId''::text) AND ((data ->> ''enrollmentId''::text) IS NOT NULL) AND (cut2_provenance_version = 1))' THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: rewritten WhatsApp unique indexdef drift for idx_notifications_queue_whatsapp_relief_enrollment_unique: %', v_indexdef;
  END IF;
  IF position('cut2_provenance_version = 1' in v_indexdef) = 0 THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: rewritten WhatsApp unique idx_notifications_queue_whatsapp_relief_enrollment_unique is not provenance-scoped';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_whatsapp_remittance_confirmed_unique';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: missing rewritten WhatsApp unique idx_notifications_queue_whatsapp_remittance_confirmed_unique';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_remittance_confirmed_unique ON public.notifications_queue USING btree (((data ->> ''remittanceId''::text)), ((data ->> ''recipientUserId''::text))) WHERE (((channel = ''whatsapp''::notification_channel) AND (template = ''remittance_confirmed''::text) AND (data ? ''remittanceId''::text) AND (data ? ''recipientUserId''::text) AND ((data ->> ''remittanceId''::text) IS NOT NULL) AND ((data ->> ''recipientUserId''::text) IS NOT NULL)) AND cut2_provenance_version = 1)'
     AND v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_remittance_confirmed_unique ON public.notifications_queue USING btree (((data ->> ''remittanceId''::text)), ((data ->> ''recipientUserId''::text))) WHERE ((channel = ''whatsapp''::notification_channel) AND (template = ''remittance_confirmed''::text) AND (data ? ''remittanceId''::text) AND (data ? ''recipientUserId''::text) AND ((data ->> ''remittanceId''::text) IS NOT NULL) AND ((data ->> ''recipientUserId''::text) IS NOT NULL) AND (cut2_provenance_version = 1))' THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: rewritten WhatsApp unique indexdef drift for idx_notifications_queue_whatsapp_remittance_confirmed_unique: %', v_indexdef;
  END IF;
  IF position('cut2_provenance_version = 1' in v_indexdef) = 0 THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: rewritten WhatsApp unique idx_notifications_queue_whatsapp_remittance_confirmed_unique is not provenance-scoped';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_whatsapp_remittance_disputed_unique';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: missing rewritten WhatsApp unique idx_notifications_queue_whatsapp_remittance_disputed_unique';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_remittance_disputed_unique ON public.notifications_queue USING btree (((data ->> ''remittanceId''::text)), ((data ->> ''recipientUserId''::text))) WHERE (((channel = ''whatsapp''::notification_channel) AND (template = ''remittance_disputed''::text) AND (data ? ''remittanceId''::text) AND (data ? ''recipientUserId''::text) AND ((data ->> ''remittanceId''::text) IS NOT NULL) AND ((data ->> ''recipientUserId''::text) IS NOT NULL)) AND cut2_provenance_version = 1)'
     AND v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_remittance_disputed_unique ON public.notifications_queue USING btree (((data ->> ''remittanceId''::text)), ((data ->> ''recipientUserId''::text))) WHERE ((channel = ''whatsapp''::notification_channel) AND (template = ''remittance_disputed''::text) AND (data ? ''remittanceId''::text) AND (data ? ''recipientUserId''::text) AND ((data ->> ''remittanceId''::text) IS NOT NULL) AND ((data ->> ''recipientUserId''::text) IS NOT NULL) AND (cut2_provenance_version = 1))' THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: rewritten WhatsApp unique indexdef drift for idx_notifications_queue_whatsapp_remittance_disputed_unique: %', v_indexdef;
  END IF;
  IF position('cut2_provenance_version = 1' in v_indexdef) = 0 THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: rewritten WhatsApp unique idx_notifications_queue_whatsapp_remittance_disputed_unique is not provenance-scoped';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_whatsapp_standing_changed_unique';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: missing rewritten WhatsApp unique idx_notifications_queue_whatsapp_standing_changed_unique';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_standing_changed_unique ON public.notifications_queue USING btree (((data ->> ''membershipId''::text)), ((data ->> ''newStanding''::text)), ((data ->> ''changeDate''::text))) WHERE (((channel = ''whatsapp''::notification_channel) AND (template = ''standing_changed''::text) AND (data ? ''membershipId''::text) AND (data ? ''newStanding''::text) AND (data ? ''changeDate''::text) AND ((data ->> ''membershipId''::text) IS NOT NULL) AND ((data ->> ''newStanding''::text) IS NOT NULL) AND ((data ->> ''changeDate''::text) IS NOT NULL)) AND cut2_provenance_version = 1)'
     AND v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_standing_changed_unique ON public.notifications_queue USING btree (((data ->> ''membershipId''::text)), ((data ->> ''newStanding''::text)), ((data ->> ''changeDate''::text))) WHERE ((channel = ''whatsapp''::notification_channel) AND (template = ''standing_changed''::text) AND (data ? ''membershipId''::text) AND (data ? ''newStanding''::text) AND (data ? ''changeDate''::text) AND ((data ->> ''membershipId''::text) IS NOT NULL) AND ((data ->> ''newStanding''::text) IS NOT NULL) AND ((data ->> ''changeDate''::text) IS NOT NULL) AND (cut2_provenance_version = 1))' THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: rewritten WhatsApp unique indexdef drift for idx_notifications_queue_whatsapp_standing_changed_unique: %', v_indexdef;
  END IF;
  IF position('cut2_provenance_version = 1' in v_indexdef) = 0 THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: rewritten WhatsApp unique idx_notifications_queue_whatsapp_standing_changed_unique is not provenance-scoped';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_whatsapp_subscription_expiring_unique';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: missing rewritten WhatsApp unique idx_notifications_queue_whatsapp_subscription_expiring_unique';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_subscription_expiring_unique ON public.notifications_queue USING btree (((data ->> ''subscriptionId''::text)), ((data ->> ''reminderDate''::text)), ((data ->> ''userId''::text))) WHERE (((channel = ''whatsapp''::notification_channel) AND (template = ''subscription_expiring''::text) AND (data ? ''subscriptionId''::text) AND (data ? ''reminderDate''::text) AND (data ? ''userId''::text) AND ((data ->> ''subscriptionId''::text) IS NOT NULL) AND ((data ->> ''reminderDate''::text) IS NOT NULL) AND ((data ->> ''userId''::text) IS NOT NULL)) AND cut2_provenance_version = 1)'
     AND v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_subscription_expiring_unique ON public.notifications_queue USING btree (((data ->> ''subscriptionId''::text)), ((data ->> ''reminderDate''::text)), ((data ->> ''userId''::text))) WHERE ((channel = ''whatsapp''::notification_channel) AND (template = ''subscription_expiring''::text) AND (data ? ''subscriptionId''::text) AND (data ? ''reminderDate''::text) AND (data ? ''userId''::text) AND ((data ->> ''subscriptionId''::text) IS NOT NULL) AND ((data ->> ''reminderDate''::text) IS NOT NULL) AND ((data ->> ''userId''::text) IS NOT NULL) AND (cut2_provenance_version = 1))' THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: rewritten WhatsApp unique indexdef drift for idx_notifications_queue_whatsapp_subscription_expiring_unique: %', v_indexdef;
  END IF;
  IF position('cut2_provenance_version = 1' in v_indexdef) = 0 THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: rewritten WhatsApp unique idx_notifications_queue_whatsapp_subscription_expiring_unique is not provenance-scoped';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'notifications_queue'
     AND indexname = 'idx_notifications_queue_whatsapp_welcome_unique';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: missing rewritten WhatsApp unique idx_notifications_queue_whatsapp_welcome_unique';
  END IF;
  IF v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_welcome_unique ON public.notifications_queue USING btree (((data ->> ''membershipId''::text))) WHERE (((channel = ''whatsapp''::notification_channel) AND (template = ''welcome''::text) AND (data ? ''membershipId''::text)) AND cut2_provenance_version = 1)'
     AND v_indexdef IS DISTINCT FROM 'CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_welcome_unique ON public.notifications_queue USING btree (((data ->> ''membershipId''::text))) WHERE ((channel = ''whatsapp''::notification_channel) AND (template = ''welcome''::text) AND (data ? ''membershipId''::text) AND (cut2_provenance_version = 1))' THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: rewritten WhatsApp unique indexdef drift for idx_notifications_queue_whatsapp_welcome_unique: %', v_indexdef;
  END IF;
  IF position('cut2_provenance_version = 1' in v_indexdef) = 0 THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: rewritten WhatsApp unique idx_notifications_queue_whatsapp_welcome_unique is not provenance-scoped';
  END IF;

  SELECT indexdef INTO v_indexdef
    FROM pg_catalog.pg_indexes
   WHERE schemaname = 'public'
     AND indexname = 'idx_notifications_queue_cut2_semantic_idempotency_unique';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: canonical semantic idempotency index missing';
  END IF;
  IF position('cut2_provenance_version = 1' in v_indexdef) = 0 THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: canonical index missing provenance predicate: %', v_indexdef;
  END IF;
  IF position('idempotencyKey' in v_indexdef) = 0 THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: canonical index missing idempotencyKey';
  END IF;
  IF position('status' in v_indexdef) > 0 AND position('queued' in v_indexdef) > 0 THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: canonical index must not filter status';
  END IF;

  -- Trusted indexes must exclude NULL provenance
  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_indexes
     WHERE schemaname = 'public'
       AND tablename = 'notifications_queue'
       AND (
         indexname LIKE 'idx_notifications_queue_whatsapp_%_unique'
         OR indexname = 'idx_notifications_queue_cut2_semantic_idempotency_unique'
       )
       AND position('cut2_provenance_version = 1' in indexdef) = 0
  ) THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: a trusted unique index is not provenance-scoped';
  END IF;

  SELECT count(*) INTO v_nargs
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'enqueue_outbound_notification';
  IF v_nargs <> 1 THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: enqueue_outbound_notification overload count %', v_nargs;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy pol
    JOIN pg_catalog.pg_class c ON c.oid = pol.polrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname = 'notifications_queue'
     AND pol.polname IN (
       'Authenticated users can queue notifications',
       'Staff can update notification queue'
     )
  ) THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: dropped mutation policies still present';
  END IF;

  IF has_table_privilege('anon', 'public.notifications_queue', 'INSERT')
     OR has_table_privilege('anon', 'public.notifications_queue', 'UPDATE')
     OR has_table_privilege('anon', 'public.notifications_queue', 'DELETE')
     OR has_table_privilege('anon', 'public.notifications_queue', 'TRUNCATE')
     OR has_table_privilege('anon', 'public.notifications_queue', 'SELECT') THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: anon still has table privileges';
  END IF;

  IF has_table_privilege('authenticated', 'public.notifications_queue', 'INSERT')
     OR has_table_privilege('authenticated', 'public.notifications_queue', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.notifications_queue', 'DELETE')
     OR has_table_privilege('authenticated', 'public.notifications_queue', 'TRUNCATE') THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: authenticated still has mutation privileges';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.notifications_queue', 'SELECT') THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: authenticated SELECT missing';
  END IF;

  IF has_table_privilege('service_role', 'public.notifications_queue', 'INSERT')
     OR has_table_privilege('service_role', 'public.notifications_queue', 'DELETE')
     OR has_table_privilege('service_role', 'public.notifications_queue', 'TRUNCATE') THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: service_role still has INSERT/DELETE/TRUNCATE';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.notifications_queue', 'SELECT') THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: service_role SELECT missing';
  END IF;

  IF NOT (
    has_column_privilege('service_role', 'public.notifications_queue', 'status', 'UPDATE')
    AND has_column_privilege('service_role', 'public.notifications_queue', 'error_message', 'UPDATE')
    AND has_column_privilege('service_role', 'public.notifications_queue', 'attempts', 'UPDATE')
    AND has_column_privilege('service_role', 'public.notifications_queue', 'sent_at', 'UPDATE')
    AND has_column_privilege('service_role', 'public.notifications_queue', 'data', 'UPDATE')
  ) THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: service_role worker UPDATE columns missing';
  END IF;

  IF has_column_privilege('service_role', 'public.notifications_queue', 'cut2_provenance_version', 'UPDATE')
     OR has_column_privilege('service_role', 'public.notifications_queue', 'channel', 'UPDATE')
     OR has_column_privilege('service_role', 'public.notifications_queue', 'template', 'UPDATE')
     OR has_column_privilege('service_role', 'public.notifications_queue', 'user_id', 'UPDATE')
     OR has_column_privilege('service_role', 'public.notifications_queue', 'created_at', 'UPDATE')
     OR has_column_privilege('service_role', 'public.notifications_queue', 'id', 'UPDATE') THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: service_role UPDATE granted on immutable columns';
  END IF;

  IF has_function_privilege('anon', 'public.enqueue_outbound_notification(text, uuid, public.notification_channel, uuid, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.enqueue_outbound_notification(text, uuid, public.notification_channel, uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: enqueue EXECUTE granted beyond service_role';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.enqueue_outbound_notification(text, uuid, public.notification_channel, uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CUT2_ABORT_POST: service_role EXECUTE enqueue missing';
  END IF;

  SELECT count(*) INTO v_legacy
    FROM public.notifications_queue
   WHERE status = 'queued'
     AND cut2_provenance_version IS NULL;
  RAISE NOTICE 'legacy_quarantine_count=%', v_legacy;
END;
$cut2_post$;

COMMIT;
