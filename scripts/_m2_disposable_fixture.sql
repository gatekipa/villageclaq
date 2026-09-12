-- M2 disposable 00116-era stub. NOT a migration. NOT for production.
-- Reproduces EXACT production security floor for:
--   has_group_permission, enqueue_outbound_notification,
--   notifications_queue table ACL, notifications_queue column attacl.
-- Functions + postgres-owned ACLs are applied by
-- scripts/_m2_apply_disposable_floor.mjs (live has_group_permission hex
-- + 00115 enqueue extract). ZERO production writes.
--
-- Chief-confirmed production notifications_queue TABLE ACL (aclexplode):
--   authenticated | SELECT     | postgres | false
--   postgres      | DELETE     | postgres | false
--   postgres      | INSERT     | postgres | false
--   postgres      | MAINTAIN   | postgres | false
--   postgres      | REFERENCES | postgres | false
--   postgres      | SELECT     | postgres | false
--   postgres      | TRIGGER    | postgres | false
--   postgres      | TRUNCATE   | postgres | false
--   postgres      | UPDATE     | postgres | false
--   service_role  | SELECT     | postgres | false
-- No anon/PUBLIC. No authenticated/service_role table INSERT/UPDATE/DELETE.
--
-- Chief-confirmed COLUMN attacl (exactly five service_role UPDATE rows):
--   attempts | data | error_message | sent_at | status
--   grantee service_role, privilege UPDATE, grantor postgres, is_grantable false

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

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('m2.uid', true), ''),
    NULLIF(current_setting('request.jwt.claim.sub', true), '')
  )::uuid
$$;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(current_setting('request.jwt.claims', true), '{}')::jsonb
$$;

DO $$ BEGIN
  CREATE TYPE public.notification_channel AS ENUM ('email','sms','whatsapp','push');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.membership_role AS ENUM ('owner','admin','moderator','member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.membership_standing AS ENUM ('good','warning','suspended','banned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.groups (
  id uuid PRIMARY KEY,
  name text
);

CREATE TABLE public.memberships (
  id uuid PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES public.groups(id),
  user_id uuid,
  role public.membership_role NOT NULL DEFAULT 'member',
  standing public.membership_standing NOT NULL DEFAULT 'good',
  membership_status text NOT NULL DEFAULT 'active',
  is_proxy boolean NOT NULL DEFAULT false,
  display_name text
);

CREATE TABLE public.group_positions (
  id uuid PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES public.groups(id),
  name text
);

CREATE TABLE public.position_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL REFERENCES public.memberships(id),
  position_id uuid NOT NULL REFERENCES public.group_positions(id),
  ended_at timestamptz NULL
);

CREATE TABLE public.position_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid NOT NULL REFERENCES public.group_positions(id),
  permission text NOT NULL
);

-- ROWTYPE stubs required so live enqueue CREATE can bind composites.
-- Not a send path. Not production shape beyond existence.
CREATE TABLE public.payments (id uuid);
CREATE TABLE public.contribution_obligations (id uuid);
CREATE TABLE public.relief_enrollments (id uuid);
CREATE TABLE public.relief_plans (id uuid);
CREATE TABLE public.relief_claims (id uuid);
CREATE TABLE public.relief_remittances (id uuid);
CREATE TABLE public.hosting_assignments (id uuid);
CREATE TABLE public.hosting_rosters (id uuid);
CREATE TABLE public.events (id uuid);
CREATE TABLE public.loans (id uuid);
CREATE TABLE public.fines (id uuid);
CREATE TABLE public.invitations (id uuid);
CREATE TABLE public.group_subscriptions (id uuid);
CREATE TABLE public.meeting_minutes (id uuid);
CREATE TABLE public.elections (id uuid);
CREATE TABLE public.announcements (id uuid);
CREATE TABLE public.hosting_swap_requests (id uuid);

CREATE TABLE public.notifications_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  channel public.notification_channel NOT NULL,
  template text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  error_message text,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  cut2_provenance_version smallint
);

ALTER TABLE public.notifications_queue OWNER TO postgres;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.groups TO authenticated;
GRANT SELECT ON public.memberships TO authenticated;
GRANT SELECT ON public.group_positions TO authenticated;
GRANT SELECT ON public.position_assignments TO authenticated;
GRANT SELECT ON public.position_permissions TO authenticated;
