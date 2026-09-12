-- Cut 2 disposable no-send fixture. NOT a migration. NOT for production.
-- Synthetic UUIDs, fake phones/emails only. Zero provider sends.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END$$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS supabase_migrations;

CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  name text
);
INSERT INTO supabase_migrations.schema_migrations(version, name)
VALUES ('20260911183755', 's0_p0a_cut1_active_authorization')
ON CONFLICT (version) DO NOTHING;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(current_setting('request.jwt.claims', true), '{}')::jsonb
$$;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text,
  phone text
);

DO $$ BEGIN
  CREATE TYPE public.notification_channel AS ENUM ('email','sms','whatsapp','push');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.notification_queue_status AS ENUM ('queued','sent','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.membership_role AS ENUM ('owner','admin','moderator','member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.membership_standing AS ENUM ('good','warning','suspended','banned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.groups (
  id uuid PRIMARY KEY,
  name text,
  locale text
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  full_name text,
  display_name text,
  phone text,
  preferred_locale text,
  notification_preferences jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.memberships (
  id uuid PRIMARY KEY,
  group_id uuid,
  user_id uuid,
  is_proxy boolean DEFAULT false,
  membership_status text DEFAULT 'active',
  standing public.membership_standing DEFAULT 'good',
  role public.membership_role DEFAULT 'member',
  phone text,
  privacy_settings jsonb DEFAULT '{}'::jsonb,
  display_name text
);

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY,
  group_id uuid,
  membership_id uuid
);

CREATE TABLE IF NOT EXISTS public.contribution_obligations (
  id uuid PRIMARY KEY,
  group_id uuid,
  membership_id uuid
);

CREATE TABLE IF NOT EXISTS public.relief_plans (
  id uuid PRIMARY KEY,
  group_id uuid
);

CREATE TABLE IF NOT EXISTS public.relief_enrollments (
  id uuid PRIMARY KEY,
  plan_id uuid,
  membership_id uuid,
  collecting_group_id uuid
);

CREATE TABLE IF NOT EXISTS public.relief_claims (
  id uuid PRIMARY KEY,
  plan_id uuid,
  membership_id uuid,
  status text
);

CREATE TABLE IF NOT EXISTS public.relief_remittances (
  id uuid PRIMARY KEY,
  branch_group_id uuid NOT NULL,
  relief_plan_id uuid,
  status text
);

CREATE TABLE IF NOT EXISTS public.hosting_rosters (
  id uuid PRIMARY KEY,
  group_id uuid
);

CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY,
  group_id uuid
);

CREATE TABLE IF NOT EXISTS public.hosting_assignments (
  id uuid PRIMARY KEY,
  roster_id uuid,
  event_id uuid,
  membership_id uuid,
  assigned_date date
);

CREATE TABLE IF NOT EXISTS public.loans (
  id uuid PRIMARY KEY,
  group_id uuid,
  membership_id uuid,
  status text
);

CREATE TABLE IF NOT EXISTS public.fines (
  id uuid PRIMARY KEY,
  group_id uuid,
  membership_id uuid
);

CREATE TABLE IF NOT EXISTS public.invitations (
  id uuid PRIMARY KEY,
  group_id uuid NOT NULL,
  phone text,
  email text
);

CREATE TABLE IF NOT EXISTS public.group_subscriptions (
  id uuid PRIMARY KEY,
  group_id uuid NOT NULL UNIQUE,
  status text,
  current_period_end timestamptz
);

CREATE TABLE IF NOT EXISTS public.meeting_minutes (
  id uuid PRIMARY KEY,
  group_id uuid
);

CREATE TABLE IF NOT EXISTS public.elections (
  id uuid PRIMARY KEY,
  group_id uuid
);

CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY,
  group_id uuid,
  audience jsonb DEFAULT '{"type":"all"}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.hosting_swap_requests (
  id uuid PRIMARY KEY,
  from_assignment_id uuid,
  requested_by uuid,
  status text
);

CREATE TABLE IF NOT EXISTS public.proxy_claim_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid,
  token text,
  email text,
  phone text,
  claimed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.notifications_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  channel public.notification_channel NOT NULL,
  template text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.notification_queue_status NOT NULL DEFAULT 'queued',
  error_message text,
  attempts integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX idx_notifications_queue_created ON public.notifications_queue USING btree (created_at DESC);
CREATE INDEX idx_notifications_queue_queued ON public.notifications_queue USING btree (status, created_at) WHERE (status = 'queued'::notification_queue_status);
CREATE INDEX idx_notifications_queue_status ON public.notifications_queue USING btree (status);
CREATE INDEX idx_notifications_queue_user ON public.notifications_queue USING btree (user_id);

CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_claim_approved_unique ON public.notifications_queue USING btree (((data ->> 'claimId'::text))) WHERE ((channel = 'whatsapp'::notification_channel) AND (template = 'relief_claim_approved'::text) AND (data ? 'claimId'::text) AND ((data ->> 'claimId'::text) IS NOT NULL));
CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_claim_denied_unique ON public.notifications_queue USING btree (((data ->> 'claimId'::text))) WHERE ((channel = 'whatsapp'::notification_channel) AND (template = 'relief_claim_denied'::text) AND (data ? 'claimId'::text) AND ((data ->> 'claimId'::text) IS NOT NULL));
CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_event_reminder_unique ON public.notifications_queue USING btree (((data ->> 'eventId'::text)), ((data ->> 'userId'::text))) WHERE ((channel = 'whatsapp'::notification_channel) AND (template = 'event_reminder'::text) AND (data ? 'eventId'::text) AND (data ? 'userId'::text) AND ((data ->> 'eventId'::text) IS NOT NULL) AND ((data ->> 'userId'::text) IS NOT NULL));
CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_fine_issued_unique ON public.notifications_queue USING btree (((data ->> 'fineId'::text))) WHERE ((channel = 'whatsapp'::notification_channel) AND (template = 'fine_issued'::text) AND (data ? 'fineId'::text) AND ((data ->> 'fineId'::text) IS NOT NULL));
CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_hosting_assignment_unique ON public.notifications_queue USING btree (((data ->> 'assignmentId'::text))) WHERE ((channel = 'whatsapp'::notification_channel) AND (template = 'hosting_assignment'::text) AND (data ? 'assignmentId'::text) AND ((data ->> 'assignmentId'::text) IS NOT NULL));
CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_hosting_reminder_unique ON public.notifications_queue USING btree (((data ->> 'assignmentId'::text)), ((data ->> 'assignedDate'::text))) WHERE ((channel = 'whatsapp'::notification_channel) AND (template = 'hosting_reminder'::text) AND (data ? 'assignmentId'::text) AND (data ? 'assignedDate'::text) AND ((data ->> 'assignmentId'::text) IS NOT NULL) AND ((data ->> 'assignedDate'::text) IS NOT NULL));
CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_loan_approved_unique ON public.notifications_queue USING btree (((data ->> 'loanId'::text))) WHERE ((channel = 'whatsapp'::notification_channel) AND (template = 'loan_approved'::text) AND (data ? 'loanId'::text) AND ((data ->> 'loanId'::text) IS NOT NULL));
CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_loan_overdue_unique ON public.notifications_queue USING btree (((data ->> 'loanId'::text)), ((data ->> 'reminderDate'::text))) WHERE ((channel = 'whatsapp'::notification_channel) AND (template = 'loan_overdue'::text) AND (data ? 'loanId'::text) AND (data ? 'reminderDate'::text) AND ((data ->> 'loanId'::text) IS NOT NULL) AND ((data ->> 'reminderDate'::text) IS NOT NULL));
CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_member_invitation_unique ON public.notifications_queue USING btree (((data ->> 'invitationId'::text)), ((data ->> 'sendDate'::text))) WHERE ((channel = 'whatsapp'::notification_channel) AND (template = 'member_invitation'::text) AND (data ? 'invitationId'::text) AND (data ? 'sendDate'::text) AND ((data ->> 'invitationId'::text) IS NOT NULL) AND ((data ->> 'sendDate'::text) IS NOT NULL));
CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_payment_receipt_unique ON public.notifications_queue USING btree (((data ->> 'paymentId'::text))) WHERE ((channel = 'whatsapp'::notification_channel) AND (template = 'payment_receipt'::text) AND (data ? 'paymentId'::text));
CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_payment_reminder_unique ON public.notifications_queue USING btree (((data ->> 'obligationId'::text)), ((data ->> 'reminderDate'::text))) WHERE ((channel = 'whatsapp'::notification_channel) AND (template = 'payment_reminder'::text) AND (data ? 'obligationId'::text) AND (data ? 'reminderDate'::text) AND ((data ->> 'obligationId'::text) IS NOT NULL) AND ((data ->> 'reminderDate'::text) IS NOT NULL));
CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_relief_enrollment_unique ON public.notifications_queue USING btree (((data ->> 'enrollmentId'::text))) WHERE ((channel = 'whatsapp'::notification_channel) AND (template = 'relief_enrollment'::text) AND (data ? 'enrollmentId'::text) AND ((data ->> 'enrollmentId'::text) IS NOT NULL));
CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_remittance_confirmed_unique ON public.notifications_queue USING btree (((data ->> 'remittanceId'::text)), ((data ->> 'recipientUserId'::text))) WHERE ((channel = 'whatsapp'::notification_channel) AND (template = 'remittance_confirmed'::text) AND (data ? 'remittanceId'::text) AND (data ? 'recipientUserId'::text) AND ((data ->> 'remittanceId'::text) IS NOT NULL) AND ((data ->> 'recipientUserId'::text) IS NOT NULL));
CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_remittance_disputed_unique ON public.notifications_queue USING btree (((data ->> 'remittanceId'::text)), ((data ->> 'recipientUserId'::text))) WHERE ((channel = 'whatsapp'::notification_channel) AND (template = 'remittance_disputed'::text) AND (data ? 'remittanceId'::text) AND (data ? 'recipientUserId'::text) AND ((data ->> 'remittanceId'::text) IS NOT NULL) AND ((data ->> 'recipientUserId'::text) IS NOT NULL));
CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_standing_changed_unique ON public.notifications_queue USING btree (((data ->> 'membershipId'::text)), ((data ->> 'newStanding'::text)), ((data ->> 'changeDate'::text))) WHERE ((channel = 'whatsapp'::notification_channel) AND (template = 'standing_changed'::text) AND (data ? 'membershipId'::text) AND (data ? 'newStanding'::text) AND (data ? 'changeDate'::text) AND ((data ->> 'membershipId'::text) IS NOT NULL) AND ((data ->> 'newStanding'::text) IS NOT NULL) AND ((data ->> 'changeDate'::text) IS NOT NULL));
CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_subscription_expiring_unique ON public.notifications_queue USING btree (((data ->> 'subscriptionId'::text)), ((data ->> 'reminderDate'::text)), ((data ->> 'userId'::text))) WHERE ((channel = 'whatsapp'::notification_channel) AND (template = 'subscription_expiring'::text) AND (data ? 'subscriptionId'::text) AND (data ? 'reminderDate'::text) AND (data ? 'userId'::text) AND ((data ->> 'subscriptionId'::text) IS NOT NULL) AND ((data ->> 'reminderDate'::text) IS NOT NULL) AND ((data ->> 'userId'::text) IS NOT NULL));
CREATE UNIQUE INDEX idx_notifications_queue_whatsapp_welcome_unique ON public.notifications_queue USING btree (((data ->> 'membershipId'::text))) WHERE ((channel = 'whatsapp'::notification_channel) AND (template = 'welcome'::text) AND (data ? 'membershipId'::text));

CREATE OR REPLACE FUNCTION public.is_platform_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT COALESCE((auth.jwt()->>'is_platform_staff')::boolean, false)
$$;

ALTER TABLE public.notifications_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can queue notifications"
  ON public.notifications_queue
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Platform staff can view all notifications_queue"
  ON public.notifications_queue
  FOR SELECT
  USING (is_platform_staff());

CREATE POLICY "Staff can view notification queue"
  ON public.notifications_queue
  FOR SELECT
  USING (is_platform_staff());

CREATE POLICY "Staff can update notification queue"
  ON public.notifications_queue
  FOR UPDATE
  USING (is_platform_staff());

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE ON TABLE public.notifications_queue TO anon, authenticated, service_role;
