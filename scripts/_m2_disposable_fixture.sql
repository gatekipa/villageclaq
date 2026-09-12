-- M2 disposable 00116-era stub. NOT a migration. NOT for production.
-- Synthetic UUIDs only. Zero provider sends. Zero queue rows from this file
-- except the empty notifications_queue table itself.

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

CREATE TABLE public.notifications_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  channel public.notification_channel NOT NULL,
  template text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  error_message text,
  attempts integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  sent_at timestamptz,
  cut2_provenance_version smallint
);

-- Cut 1 active has_group_permission (00114 body, disposable copy)
CREATE FUNCTION public.has_group_permission(
  gid uuid,
  perm_key text,
  uid uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_membership_id uuid;
  v_role text;
  v_assignment_count int;
  v_has_perm boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND uid IS NOT NULL AND uid IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  SELECT m.id, m.role::text
    INTO v_membership_id, v_role
  FROM public.memberships m
  WHERE m.group_id = gid
    AND m.user_id = uid
    AND m.membership_status = 'active'
  LIMIT 1;

  IF v_membership_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_role = 'owner' THEN
    RETURN true;
  END IF;

  SELECT COUNT(*) INTO v_assignment_count
  FROM public.position_assignments
  WHERE membership_id = v_membership_id AND ended_at IS NULL;

  IF v_role = 'admin' AND v_assignment_count = 0 THEN
    RETURN true;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.position_assignments pa
    JOIN public.position_permissions pp ON pp.position_id = pa.position_id
    JOIN public.group_positions gp
      ON gp.id = pa.position_id
     AND gp.group_id = gid
    WHERE pa.membership_id = v_membership_id
      AND pa.ended_at IS NULL
      AND pp.permission = perm_key
  ) INTO v_has_perm;

  RETURN v_has_perm;
END;
$$;

REVOKE ALL ON FUNCTION public.has_group_permission(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_group_permission(uuid, text, uuid) TO authenticated;

-- Cut 2 enqueue identity (stub body — 00117 must not replace)
CREATE FUNCTION public.enqueue_outbound_notification(
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
BEGIN
  queue_id := NULL;
  result := 'denied';
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_outbound_notification(text, uuid, public.notification_channel, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_outbound_notification(text, uuid, public.notification_channel, uuid, text)
  TO service_role;

REVOKE ALL ON TABLE public.notifications_queue FROM PUBLIC;
REVOKE ALL ON TABLE public.notifications_queue FROM anon;
REVOKE ALL ON TABLE public.notifications_queue FROM authenticated;
REVOKE ALL ON TABLE public.notifications_queue FROM service_role;
GRANT SELECT ON TABLE public.notifications_queue TO authenticated;
GRANT SELECT ON TABLE public.notifications_queue TO service_role;
GRANT UPDATE (status, error_message, attempts, sent_at, data)
  ON TABLE public.notifications_queue TO service_role;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.groups TO authenticated;
GRANT SELECT ON public.memberships TO authenticated;
GRANT SELECT ON public.group_positions TO authenticated;
GRANT SELECT ON public.position_assignments TO authenticated;
GRANT SELECT ON public.position_permissions TO authenticated;
