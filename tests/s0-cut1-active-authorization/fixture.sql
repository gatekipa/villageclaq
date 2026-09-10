
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END;
$roles$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

DO $types$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'membership_role') THEN
    CREATE TYPE public.membership_role AS ENUM ('owner', 'admin', 'moderator', 'member');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'membership_standing') THEN
    CREATE TYPE public.membership_standing AS ENUM ('good', 'warning', 'suspended', 'banned');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transfer_status') THEN
    CREATE TYPE public.transfer_status AS ENUM (
      'requested', 'approved', 'rejected', 'cancelled', 'completed'
    );
  END IF;
END;
$types$;

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hq_group_id uuid
);
CREATE TABLE IF NOT EXISTS public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  group_level text
);
CREATE TABLE IF NOT EXISTS public.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  group_id uuid,
  display_name text,
  role public.membership_role NOT NULL DEFAULT 'member',
  standing public.membership_standing NOT NULL DEFAULT 'good',
  membership_status text NOT NULL DEFAULT 'active',
  is_proxy boolean NOT NULL DEFAULT false,
  proxy_manager_id uuid,
  joined_at timestamptz DEFAULT now(),
  privacy_settings jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT memberships_membership_status_check
    CHECK (membership_status = ANY (ARRAY[
      'active'::text, 'pending_approval'::text, 'exited'::text,
      'suspended'::text, 'archived'::text
    ]))
);
CREATE TABLE IF NOT EXISTS public.group_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL
);
CREATE TABLE IF NOT EXISTS public.position_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL,
  position_id uuid NOT NULL,
  ended_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.position_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid NOT NULL,
  permission text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.activity_feed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid
);
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid
);
CREATE TABLE IF NOT EXISTS public.announcement_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid
);
CREATE TABLE IF NOT EXISTS public.committees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid
);
CREATE TABLE IF NOT EXISTS public.committee_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id uuid
);
CREATE TABLE IF NOT EXISTS public.constitution_amendments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid
);
CREATE TABLE IF NOT EXISTS public.contribution_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid
);
CREATE TABLE IF NOT EXISTS public.contribution_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid
);
CREATE TABLE IF NOT EXISTS public.disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid
);
CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid
);
CREATE TABLE IF NOT EXISTS public.elections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid
);
CREATE TABLE IF NOT EXISTS public.election_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id uuid
);
CREATE TABLE IF NOT EXISTS public.event_attendances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid
);
CREATE TABLE IF NOT EXISTS public.event_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid
);
CREATE TABLE IF NOT EXISTS public.event_rsvps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid
);
CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid
);
CREATE TABLE IF NOT EXISTS public.exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid
);
CREATE TABLE IF NOT EXISTS public.family_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid
);
CREATE TABLE IF NOT EXISTS public.feed_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_item_id uuid
);
CREATE TABLE IF NOT EXISTS public.fine_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid
);
CREATE TABLE IF NOT EXISTS public.fines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid
);
CREATE TABLE IF NOT EXISTS public.group_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid
);
CREATE TABLE IF NOT EXISTS public.group_constitutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid
);
CREATE TABLE IF NOT EXISTS public.group_payment_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid
);
CREATE TABLE IF NOT EXISTS public.group_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid
);
CREATE TABLE IF NOT EXISTS public.hosting_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roster_id uuid
);
CREATE TABLE IF NOT EXISTS public.hosting_rosters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid
);
CREATE TABLE IF NOT EXISTS public.hosting_swap_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid, from_assignment_id uuid
);
CREATE TABLE IF NOT EXISTS public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid
);
CREATE TABLE IF NOT EXISTS public.loan_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid
);
CREATE TABLE IF NOT EXISTS public.loan_repayments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid
);
CREATE TABLE IF NOT EXISTS public.loan_requests_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid
);
CREATE TABLE IF NOT EXISTS public.loan_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid
);
CREATE TABLE IF NOT EXISTS public.loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid
);
CREATE TABLE IF NOT EXISTS public.member_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_group_id uuid, status public.transfer_status
);
CREATE TABLE IF NOT EXISTS public.payment_reminder_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid
);
CREATE TABLE IF NOT EXISTS public.payment_reminders_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid
);
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid, status text, recorded_by uuid, membership_id uuid
);
CREATE TABLE IF NOT EXISTS public.project_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid
);
CREATE TABLE IF NOT EXISTS public.project_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid
);
CREATE TABLE IF NOT EXISTS public.project_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid
);
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid
);
CREATE TABLE IF NOT EXISTS public.relief_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid, membership_id uuid
);
CREATE TABLE IF NOT EXISTS public.relief_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid
);
CREATE TABLE IF NOT EXISTS public.relief_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid
);
CREATE TABLE IF NOT EXISTS public.relief_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid
);
CREATE TABLE IF NOT EXISTS public.relief_remittances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_group_id uuid
);
CREATE TABLE IF NOT EXISTS public.savings_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid
);
CREATE TABLE IF NOT EXISTS public.savings_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid
);
CREATE TABLE IF NOT EXISTS public.savings_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid
);
CREATE TABLE IF NOT EXISTS public.sub_group_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid
);
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS hq_group_id uuid;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.organizations TO authenticated, anon, service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.groups TO authenticated, anon, service_role;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.memberships TO authenticated, anon, service_role;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.group_positions TO authenticated, anon, service_role;
ALTER TABLE public.group_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_positions FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.position_assignments TO authenticated, anon, service_role;
ALTER TABLE public.position_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.position_assignments FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.position_permissions TO authenticated, anon, service_role;
ALTER TABLE public.position_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.position_permissions FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.activity_feed TO authenticated, anon, service_role;
ALTER TABLE public.activity_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_feed FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.announcements TO authenticated, anon, service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.announcement_deliveries TO authenticated, anon, service_role;
ALTER TABLE public.announcement_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_deliveries FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.committees TO authenticated, anon, service_role;
ALTER TABLE public.committees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.committees FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.committee_members TO authenticated, anon, service_role;
ALTER TABLE public.committee_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.committee_members FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.constitution_amendments TO authenticated, anon, service_role;
ALTER TABLE public.constitution_amendments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.constitution_amendments FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.contribution_obligations TO authenticated, anon, service_role;
ALTER TABLE public.contribution_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contribution_obligations FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.contribution_types TO authenticated, anon, service_role;
ALTER TABLE public.contribution_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contribution_types FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.disputes TO authenticated, anon, service_role;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.documents TO authenticated, anon, service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.elections TO authenticated, anon, service_role;
ALTER TABLE public.elections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.elections FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.election_options TO authenticated, anon, service_role;
ALTER TABLE public.election_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.election_options FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.event_attendances TO authenticated, anon, service_role;
ALTER TABLE public.event_attendances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_attendances FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.event_photos TO authenticated, anon, service_role;
ALTER TABLE public.event_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_photos FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.event_rsvps TO authenticated, anon, service_role;
ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_rsvps FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.events TO authenticated, anon, service_role;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.exchange_rates TO authenticated, anon, service_role;
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_rates FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.family_members TO authenticated, anon, service_role;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.feed_reactions TO authenticated, anon, service_role;
ALTER TABLE public.feed_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_reactions FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.fine_types TO authenticated, anon, service_role;
ALTER TABLE public.fine_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fine_types FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.fines TO authenticated, anon, service_role;
ALTER TABLE public.fines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fines FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.group_audit_logs TO authenticated, anon, service_role;
ALTER TABLE public.group_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_audit_logs FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.group_constitutions TO authenticated, anon, service_role;
ALTER TABLE public.group_constitutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_constitutions FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.group_payment_config TO authenticated, anon, service_role;
ALTER TABLE public.group_payment_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_payment_config FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.group_subscriptions TO authenticated, anon, service_role;
ALTER TABLE public.group_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_subscriptions FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.hosting_assignments TO authenticated, anon, service_role;
ALTER TABLE public.hosting_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hosting_assignments FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.hosting_rosters TO authenticated, anon, service_role;
ALTER TABLE public.hosting_rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hosting_rosters FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.hosting_swap_requests TO authenticated, anon, service_role;
ALTER TABLE public.hosting_swap_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hosting_swap_requests FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.invitations TO authenticated, anon, service_role;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.loan_configs TO authenticated, anon, service_role;
ALTER TABLE public.loan_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_configs FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.loan_repayments TO authenticated, anon, service_role;
ALTER TABLE public.loan_repayments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_repayments FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.loan_requests_v1 TO authenticated, anon, service_role;
ALTER TABLE public.loan_requests_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_requests_v1 FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.loan_schedule TO authenticated, anon, service_role;
ALTER TABLE public.loan_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_schedule FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.loans TO authenticated, anon, service_role;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.member_transfers TO authenticated, anon, service_role;
ALTER TABLE public.member_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_transfers FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.payment_reminder_rules TO authenticated, anon, service_role;
ALTER TABLE public.payment_reminder_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_reminder_rules FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.payment_reminders_sent TO authenticated, anon, service_role;
ALTER TABLE public.payment_reminders_sent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_reminders_sent FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.payments TO authenticated, anon, service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.project_contributions TO authenticated, anon, service_role;
ALTER TABLE public.project_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_contributions FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.project_expenses TO authenticated, anon, service_role;
ALTER TABLE public.project_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_expenses FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.project_milestones TO authenticated, anon, service_role;
ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_milestones FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.projects TO authenticated, anon, service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.relief_claims TO authenticated, anon, service_role;
ALTER TABLE public.relief_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relief_claims FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.relief_enrollments TO authenticated, anon, service_role;
ALTER TABLE public.relief_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relief_enrollments FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.relief_payouts TO authenticated, anon, service_role;
ALTER TABLE public.relief_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relief_payouts FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.relief_plans TO authenticated, anon, service_role;
ALTER TABLE public.relief_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relief_plans FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.relief_remittances TO authenticated, anon, service_role;
ALTER TABLE public.relief_remittances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relief_remittances FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.savings_contributions TO authenticated, anon, service_role;
ALTER TABLE public.savings_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_contributions FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.savings_cycles TO authenticated, anon, service_role;
ALTER TABLE public.savings_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_cycles FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.savings_participants TO authenticated, anon, service_role;
ALTER TABLE public.savings_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_participants FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.sub_group_transfers TO authenticated, anon, service_role;
ALTER TABLE public.sub_group_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_group_transfers FORCE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.is_group_member(gid uuid, uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships WHERE group_id = gid AND user_id = uid
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_user_group_ids(uid uuid DEFAULT auth.uid())
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT group_id FROM public.memberships WHERE user_id = uid;
$function$;

CREATE OR REPLACE FUNCTION public.is_group_admin(gid uuid, uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE group_id = gid AND user_id = uid AND role IN ('owner', 'admin')
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_group_owner(gid uuid, uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE group_id = gid AND user_id = uid AND role = 'owner'
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_group_admin_or_owner(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE group_id = p_group_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'admin')
  );
$function$;

CREATE OR REPLACE FUNCTION public.has_group_permission(gid uuid, perm_key text, uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_membership_id uuid;
  v_role text;
  v_assignment_count int;
  v_has_perm boolean;
BEGIN
  SELECT m.id, m.role::text
    INTO v_membership_id, v_role
  FROM public.memberships m
  WHERE m.group_id = gid AND m.user_id = uid
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
    WHERE pa.membership_id = v_membership_id
      AND pa.ended_at IS NULL
      AND pp.permission = perm_key
  ) INTO v_has_perm;

  RETURN v_has_perm;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_proxy_member(p_group_id uuid, p_display_name text, p_phone text DEFAULT NULL, p_role text DEFAULT 'member')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  new_membership_id UUID;
  caller_id UUID;
BEGIN
  caller_id := auth.uid();

  -- Caller must be an OFFICER of the target group. Proxy members are an
  -- admin-managed feature; a plain member can no longer mint them.
  IF NOT EXISTS (
    SELECT 1 FROM memberships
    WHERE group_id = p_group_id
      AND user_id = caller_id
      AND role IN ('owner', 'admin', 'moderator')
  ) THEN
    RAISE EXCEPTION 'Not authorized to create proxy members in this group';
  END IF;

  -- Proxies have no account and must never hold a privileged role. Whitelist
  -- the requested role instead of casting raw client input.
  IF COALESCE(p_role, 'member') NOT IN ('member', 'moderator') THEN
    RAISE EXCEPTION 'invalid_proxy_role';
  END IF;

  new_membership_id := gen_random_uuid();

  INSERT INTO memberships (
    id, user_id, group_id, display_name, role, standing,
    is_proxy, proxy_manager_id, joined_at, privacy_settings
  ) VALUES (
    new_membership_id,
    NULL,
    p_group_id,
    p_display_name,
    COALESCE(p_role, 'member')::membership_role,
    'good'::membership_standing,
    true,
    caller_id,
    now(),
    jsonb_build_object(
      'proxy_phone', COALESCE(p_phone, ''),
      'proxy_name', p_display_name,
      'show_phone', false,
      'show_email', false
    )
  );

  RETURN new_membership_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_group_ids(uuid) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_group_admin(uuid, uuid) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_group_owner(uuid, uuid) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_group_admin_or_owner(uuid) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_group_permission(uuid, text, uuid) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_proxy_member(uuid, text, text, text) TO PUBLIC, anon, authenticated, service_role;
DROP POLICY IF EXISTS $pn$rls_af_all$pn$ ON public.activity_feed;
CREATE POLICY $pn$rls_af_all$pn$ ON public.activity_feed
  FOR ALL
  TO authenticated
  USING (is_group_member(group_id))
  WITH CHECK (is_group_member(group_id));
DROP POLICY IF EXISTS $pn$rls_ad_update$pn$ ON public.announcement_deliveries;
CREATE POLICY $pn$rls_ad_update$pn$ ON public.announcement_deliveries
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM announcements a
  WHERE ((a.id = announcement_deliveries.announcement_id) AND is_group_member(a.group_id)))));
DROP POLICY IF EXISTS $pn$Admins can manage committee members$pn$ ON public.committee_members;
CREATE POLICY $pn$Admins can manage committee members$pn$ ON public.committee_members
  FOR ALL
  TO public
  USING ((committee_id IN ( SELECT c.id
   FROM committees c
  WHERE ((c.group_id IN ( SELECT get_user_group_ids() AS get_user_group_ids)) AND (EXISTS ( SELECT 1
           FROM memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.group_id = c.group_id) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))))));
DROP POLICY IF EXISTS $pn$Admins can manage committees$pn$ ON public.committees;
CREATE POLICY $pn$Admins can manage committees$pn$ ON public.committees
  FOR ALL
  TO public
  USING (((group_id IN ( SELECT get_user_group_ids() AS get_user_group_ids)) AND (EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.group_id = committees.group_id) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))));
DROP POLICY IF EXISTS $pn$rls_amend_insert$pn$ ON public.constitution_amendments;
CREATE POLICY $pn$rls_amend_insert$pn$ ON public.constitution_amendments
  FOR INSERT
  TO authenticated
  WITH CHECK (is_group_member(group_id));
DROP POLICY IF EXISTS $pn$Users can create disputes in their groups$pn$ ON public.disputes;
CREATE POLICY $pn$Users can create disputes in their groups$pn$ ON public.disputes
  FOR INSERT
  TO public
  WITH CHECK ((group_id IN ( SELECT get_user_group_ids() AS get_user_group_ids)));
DROP POLICY IF EXISTS $pn$Users can delete disputes in their groups$pn$ ON public.disputes;
CREATE POLICY $pn$Users can delete disputes in their groups$pn$ ON public.disputes
  FOR DELETE
  TO public
  USING ((group_id IN ( SELECT get_user_group_ids() AS get_user_group_ids)));
DROP POLICY IF EXISTS $pn$Users can update disputes in their groups$pn$ ON public.disputes;
CREATE POLICY $pn$Users can update disputes in their groups$pn$ ON public.disputes
  FOR UPDATE
  TO public
  USING ((group_id IN ( SELECT get_user_group_ids() AS get_user_group_ids)));
DROP POLICY IF EXISTS $pn$disputes_insert$pn$ ON public.disputes;
CREATE POLICY $pn$disputes_insert$pn$ ON public.disputes
  FOR INSERT
  TO public
  WITH CHECK ((group_id IN ( SELECT get_user_group_ids() AS get_user_group_ids)));
DROP POLICY IF EXISTS $pn$rls_att_insert$pn$ ON public.event_attendances;
CREATE POLICY $pn$rls_att_insert$pn$ ON public.event_attendances
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = event_attendances.event_id) AND is_group_member(e.group_id)))));
DROP POLICY IF EXISTS $pn$rls_ep_insert$pn$ ON public.event_photos;
CREATE POLICY $pn$rls_ep_insert$pn$ ON public.event_photos
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = event_photos.event_id) AND is_group_member(e.group_id)))));
DROP POLICY IF EXISTS $pn$rls_rsvp_insert$pn$ ON public.event_rsvps;
CREATE POLICY $pn$rls_rsvp_insert$pn$ ON public.event_rsvps
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = event_rsvps.event_id) AND is_group_member(e.group_id)))));
DROP POLICY IF EXISTS $pn$HQ admins can manage exchange rates$pn$ ON public.exchange_rates;
CREATE POLICY $pn$HQ admins can manage exchange rates$pn$ ON public.exchange_rates
  FOR ALL
  TO public
  USING ((organization_id IN ( SELECT o.id
   FROM (organizations o
     JOIN groups g ON ((g.id = o.hq_group_id)))
  WHERE ((g.id IN ( SELECT get_user_group_ids() AS get_user_group_ids)) AND (EXISTS ( SELECT 1
           FROM memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.group_id = g.id) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))))));
DROP POLICY IF EXISTS $pn$rls_fr_insert$pn$ ON public.feed_reactions;
CREATE POLICY $pn$rls_fr_insert$pn$ ON public.feed_reactions
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM activity_feed af
  WHERE ((af.id = feed_reactions.feed_item_id) AND is_group_member(af.group_id)))));
DROP POLICY IF EXISTS $pn$rls_fin_update$pn$ ON public.fines;
CREATE POLICY $pn$rls_fin_update$pn$ ON public.fines
  FOR UPDATE
  TO authenticated
  USING (is_group_member(group_id));
DROP POLICY IF EXISTS $pn$member_insert_audit_logs$pn$ ON public.group_audit_logs;
CREATE POLICY $pn$member_insert_audit_logs$pn$ ON public.group_audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK ((group_id IN ( SELECT get_user_group_ids() AS get_user_group_ids)));
DROP POLICY IF EXISTS $pn$rls_hsr_insert$pn$ ON public.hosting_swap_requests;
CREATE POLICY $pn$rls_hsr_insert$pn$ ON public.hosting_swap_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (((requested_by = auth.uid()) AND (from_assignment_id IN ( SELECT ha.id
   FROM (hosting_assignments ha
     JOIN hosting_rosters hr ON ((hr.id = ha.roster_id)))
  WHERE (hr.group_id IN ( SELECT get_user_group_ids() AS get_user_group_ids))))));
DROP POLICY IF EXISTS $pn$Admins can add proxy members$pn$ ON public.memberships;
CREATE POLICY $pn$Admins can add proxy members$pn$ ON public.memberships
  FOR INSERT
  TO public
  WITH CHECK (((is_proxy = true) AND (proxy_manager_id = auth.uid()) AND (group_id IN ( SELECT get_user_group_ids(auth.uid()) AS get_user_group_ids))));
DROP POLICY IF EXISTS $pn$rls_prs_insert$pn$ ON public.payment_reminders_sent;
CREATE POLICY $pn$rls_prs_insert$pn$ ON public.payment_reminders_sent
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM payment_reminder_rules prr
  WHERE ((prr.id = payment_reminders_sent.rule_id) AND is_group_member(prr.group_id)))));
DROP POLICY IF EXISTS $pn$rls_pay_insert$pn$ ON public.payments;
CREATE POLICY $pn$rls_pay_insert$pn$ ON public.payments
  FOR INSERT
  TO authenticated
  WITH CHECK ((is_group_member(group_id) AND (status = 'pending_confirmation'::text) AND (recorded_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.id = payments.membership_id) AND (m.user_id = auth.uid()))))));
DROP POLICY IF EXISTS $pn$rls_pcon_write$pn$ ON public.project_contributions;
CREATE POLICY $pn$rls_pcon_write$pn$ ON public.project_contributions
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = project_contributions.project_id) AND is_group_member(p.group_id)))));
DROP POLICY IF EXISTS $pn$Admins can update transfers$pn$ ON public.sub_group_transfers;
CREATE POLICY $pn$Admins can update transfers$pn$ ON public.sub_group_transfers
  FOR UPDATE
  TO public
  USING (((group_id IN ( SELECT get_user_group_ids() AS get_user_group_ids)) AND (EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.group_id = sub_group_transfers.group_id) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))));
DROP POLICY IF EXISTS $pn$Users can create transfers$pn$ ON public.sub_group_transfers;
CREATE POLICY $pn$Users can create transfers$pn$ ON public.sub_group_transfers
  FOR INSERT
  TO public
  WITH CHECK ((group_id IN ( SELECT get_user_group_ids() AS get_user_group_ids)));
DROP POLICY IF EXISTS $pn$Admin update feed$pn$ ON public.activity_feed;
CREATE POLICY $pn$Admin update feed$pn$ ON public.activity_feed
  FOR UPDATE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = activity_feed.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));
DROP POLICY IF EXISTS $pn$Members insert feed$pn$ ON public.activity_feed;
CREATE POLICY $pn$Members insert feed$pn$ ON public.activity_feed
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = activity_feed.group_id) AND (memberships.user_id = auth.uid())))));
DROP POLICY IF EXISTS $pn$Admins can manage amendments$pn$ ON public.constitution_amendments;
CREATE POLICY $pn$Admins can manage amendments$pn$ ON public.constitution_amendments
  FOR ALL
  TO public
  USING ((group_id IN ( SELECT memberships.group_id
   FROM memberships
  WHERE ((memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));
DROP POLICY IF EXISTS $pn$Group admins can manage obligations$pn$ ON public.contribution_obligations;
CREATE POLICY $pn$Group admins can manage obligations$pn$ ON public.contribution_obligations
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = contribution_obligations.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));
DROP POLICY IF EXISTS $pn$Group admins can update obligations$pn$ ON public.contribution_obligations;
CREATE POLICY $pn$Group admins can update obligations$pn$ ON public.contribution_obligations
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = contribution_obligations.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));
DROP POLICY IF EXISTS $pn$Group admins can delete contribution types$pn$ ON public.contribution_types;
CREATE POLICY $pn$Group admins can delete contribution types$pn$ ON public.contribution_types
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = contribution_types.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));
DROP POLICY IF EXISTS $pn$Group admins can manage contribution types$pn$ ON public.contribution_types;
CREATE POLICY $pn$Group admins can manage contribution types$pn$ ON public.contribution_types
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = contribution_types.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));
DROP POLICY IF EXISTS $pn$Group admins can update contribution types$pn$ ON public.contribution_types;
CREATE POLICY $pn$Group admins can update contribution types$pn$ ON public.contribution_types
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = contribution_types.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));
DROP POLICY IF EXISTS $pn$disputes_admin$pn$ ON public.disputes;
CREATE POLICY $pn$disputes_admin$pn$ ON public.disputes
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = disputes.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));
DROP POLICY IF EXISTS $pn$Admins can manage documents$pn$ ON public.documents;
CREATE POLICY $pn$Admins can manage documents$pn$ ON public.documents
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = documents.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role, 'moderator'::membership_role]))))));
DROP POLICY IF EXISTS $pn$Admins can manage options$pn$ ON public.election_options;
CREATE POLICY $pn$Admins can manage options$pn$ ON public.election_options
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (elections e
     JOIN memberships m ON ((m.group_id = e.group_id)))
  WHERE ((e.id = election_options.election_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role, 'moderator'::membership_role]))))));
DROP POLICY IF EXISTS $pn$Admins can manage elections$pn$ ON public.elections;
CREATE POLICY $pn$Admins can manage elections$pn$ ON public.elections
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = elections.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role, 'moderator'::membership_role]))))));
DROP POLICY IF EXISTS $pn$Group admins can manage attendance$pn$ ON public.event_attendances;
CREATE POLICY $pn$Group admins can manage attendance$pn$ ON public.event_attendances
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (events
     JOIN memberships ON ((memberships.group_id = events.group_id)))
  WHERE ((events.id = event_attendances.event_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));
DROP POLICY IF EXISTS $pn$Members upload photos$pn$ ON public.event_photos;
CREATE POLICY $pn$Members upload photos$pn$ ON public.event_photos
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (events e
     JOIN memberships m ON ((m.group_id = e.group_id)))
  WHERE ((e.id = event_photos.event_id) AND (m.user_id = auth.uid())))));
DROP POLICY IF EXISTS $pn$Group admins can create events$pn$ ON public.events;
CREATE POLICY $pn$Group admins can create events$pn$ ON public.events
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = events.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));
DROP POLICY IF EXISTS $pn$Group admins can delete events$pn$ ON public.events;
CREATE POLICY $pn$Group admins can delete events$pn$ ON public.events
  FOR DELETE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = events.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));
DROP POLICY IF EXISTS $pn$Group admins can update events$pn$ ON public.events;
CREATE POLICY $pn$Group admins can update events$pn$ ON public.events
  FOR UPDATE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = events.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));
DROP POLICY IF EXISTS $pn$rls_fm_delete$pn$ ON public.family_members;
CREATE POLICY $pn$rls_fm_delete$pn$ ON public.family_members
  FOR DELETE
  TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.id = family_members.membership_id) AND (m.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (memberships m
     JOIN memberships target ON (((target.id = family_members.membership_id) AND (target.group_id = m.group_id))))
  WHERE ((m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))));
DROP POLICY IF EXISTS $pn$rls_fm_insert$pn$ ON public.family_members;
CREATE POLICY $pn$rls_fm_insert$pn$ ON public.family_members
  FOR INSERT
  TO authenticated
  WITH CHECK (((EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.id = family_members.membership_id) AND (m.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (memberships m
     JOIN memberships target ON (((target.id = family_members.membership_id) AND (target.group_id = m.group_id))))
  WHERE ((m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))));
DROP POLICY IF EXISTS $pn$rls_fm_update$pn$ ON public.family_members;
CREATE POLICY $pn$rls_fm_update$pn$ ON public.family_members
  FOR UPDATE
  TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.id = family_members.membership_id) AND (m.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (memberships m
     JOIN memberships target ON (((target.id = family_members.membership_id) AND (target.group_id = m.group_id))))
  WHERE ((m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))));
DROP POLICY IF EXISTS $pn$Members react$pn$ ON public.feed_reactions;
CREATE POLICY $pn$Members react$pn$ ON public.feed_reactions
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (activity_feed af
     JOIN memberships m ON ((m.group_id = af.group_id)))
  WHERE ((af.id = feed_reactions.feed_item_id) AND (m.user_id = auth.uid())))));
DROP POLICY IF EXISTS $pn$fine_types_admin$pn$ ON public.fine_types;
CREATE POLICY $pn$fine_types_admin$pn$ ON public.fine_types
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = fine_types.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));
DROP POLICY IF EXISTS $pn$Admin manage fines$pn$ ON public.fines;
CREATE POLICY $pn$Admin manage fines$pn$ ON public.fines
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = fines.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));
DROP POLICY IF EXISTS $pn$Admins can manage constitutions$pn$ ON public.group_constitutions;
CREATE POLICY $pn$Admins can manage constitutions$pn$ ON public.group_constitutions
  FOR ALL
  TO public
  USING ((group_id IN ( SELECT memberships.group_id
   FROM memberships
  WHERE ((memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));
DROP POLICY IF EXISTS $pn$Admins can manage subscription$pn$ ON public.group_subscriptions;
CREATE POLICY $pn$Admins can manage subscription$pn$ ON public.group_subscriptions
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = group_subscriptions.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));
DROP POLICY IF EXISTS $pn$Group admins can manage hosting assignments$pn$ ON public.hosting_assignments;
CREATE POLICY $pn$Group admins can manage hosting assignments$pn$ ON public.hosting_assignments
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (hosting_rosters
     JOIN memberships ON ((memberships.group_id = hosting_rosters.group_id)))
  WHERE ((hosting_rosters.id = hosting_assignments.roster_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));
DROP POLICY IF EXISTS $pn$Group admins can manage hosting rosters$pn$ ON public.hosting_rosters;
CREATE POLICY $pn$Group admins can manage hosting rosters$pn$ ON public.hosting_rosters
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = hosting_rosters.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));
DROP POLICY IF EXISTS $pn$Group admins can create invitations$pn$ ON public.invitations;
CREATE POLICY $pn$Group admins can create invitations$pn$ ON public.invitations
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = invitations.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'moderator'::membership_role]))))));
DROP POLICY IF EXISTS $pn$Group admins can delete invitations$pn$ ON public.invitations;
CREATE POLICY $pn$Group admins can delete invitations$pn$ ON public.invitations
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = invitations.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'moderator'::membership_role]))))));
DROP POLICY IF EXISTS $pn$Group admins can update invitations$pn$ ON public.invitations;
CREATE POLICY $pn$Group admins can update invitations$pn$ ON public.invitations
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = invitations.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'moderator'::membership_role]))))));
DROP POLICY IF EXISTS $pn$loan_configs_delete$pn$ ON public.loan_configs;
CREATE POLICY $pn$loan_configs_delete$pn$ ON public.loan_configs
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.group_id = loan_configs.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role]))))));
DROP POLICY IF EXISTS $pn$loan_configs_insert$pn$ ON public.loan_configs;
CREATE POLICY $pn$loan_configs_insert$pn$ ON public.loan_configs
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.group_id = loan_configs.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role]))))));
DROP POLICY IF EXISTS $pn$loan_configs_update$pn$ ON public.loan_configs;
CREATE POLICY $pn$loan_configs_update$pn$ ON public.loan_configs
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.group_id = loan_configs.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role]))))));
DROP POLICY IF EXISTS $pn$loan_repayments_delete$pn$ ON public.loan_repayments;
CREATE POLICY $pn$loan_repayments_delete$pn$ ON public.loan_repayments
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (loans l
     JOIN memberships m ON (((m.group_id = l.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))
  WHERE (l.id = loan_repayments.loan_id))));
DROP POLICY IF EXISTS $pn$loan_repayments_insert$pn$ ON public.loan_repayments;
CREATE POLICY $pn$loan_repayments_insert$pn$ ON public.loan_repayments
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (loans l
     JOIN memberships m ON (((m.group_id = l.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))
  WHERE (l.id = loan_repayments.loan_id))));
DROP POLICY IF EXISTS $pn$loan_repayments_update$pn$ ON public.loan_repayments;
CREATE POLICY $pn$loan_repayments_update$pn$ ON public.loan_repayments
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (loans l
     JOIN memberships m ON (((m.group_id = l.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))
  WHERE (l.id = loan_repayments.loan_id))));
DROP POLICY IF EXISTS $pn$Admin manage loans$pn$ ON public.loan_requests_v1;
CREATE POLICY $pn$Admin manage loans$pn$ ON public.loan_requests_v1
  FOR UPDATE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = loan_requests_v1.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));
DROP POLICY IF EXISTS $pn$Members request loans$pn$ ON public.loan_requests_v1;
CREATE POLICY $pn$Members request loans$pn$ ON public.loan_requests_v1
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = loan_requests_v1.group_id) AND (memberships.user_id = auth.uid())))));
DROP POLICY IF EXISTS $pn$loan_schedule_delete$pn$ ON public.loan_schedule;
CREATE POLICY $pn$loan_schedule_delete$pn$ ON public.loan_schedule
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (loans l
     JOIN memberships m ON (((m.group_id = l.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))
  WHERE (l.id = loan_schedule.loan_id))));
DROP POLICY IF EXISTS $pn$loan_schedule_insert$pn$ ON public.loan_schedule;
CREATE POLICY $pn$loan_schedule_insert$pn$ ON public.loan_schedule
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (loans l
     JOIN memberships m ON (((m.group_id = l.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))
  WHERE (l.id = loan_schedule.loan_id))));
DROP POLICY IF EXISTS $pn$loan_schedule_update$pn$ ON public.loan_schedule;
CREATE POLICY $pn$loan_schedule_update$pn$ ON public.loan_schedule
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (loans l
     JOIN memberships m ON (((m.group_id = l.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))
  WHERE (l.id = loan_schedule.loan_id))));
DROP POLICY IF EXISTS $pn$loans_delete$pn$ ON public.loans;
CREATE POLICY $pn$loans_delete$pn$ ON public.loans
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.group_id = loans.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role]))))));
DROP POLICY IF EXISTS $pn$loans_insert$pn$ ON public.loans;
CREATE POLICY $pn$loans_insert$pn$ ON public.loans
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.group_id = loans.group_id) AND (m.user_id = auth.uid())))));
DROP POLICY IF EXISTS $pn$loans_update$pn$ ON public.loans;
CREATE POLICY $pn$loans_update$pn$ ON public.loans
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.group_id = loans.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role]))))));
DROP POLICY IF EXISTS $pn$transfers_delete$pn$ ON public.member_transfers;
CREATE POLICY $pn$transfers_delete$pn$ ON public.member_transfers
  FOR DELETE
  TO authenticated
  USING (((status = ANY (ARRAY['requested'::transfer_status, 'rejected'::transfer_status, 'cancelled'::transfer_status])) AND (EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])) AND (m.group_id = member_transfers.source_group_id))))));
DROP POLICY IF EXISTS $pn$Admin manage reminder rules$pn$ ON public.payment_reminder_rules;
CREATE POLICY $pn$Admin manage reminder rules$pn$ ON public.payment_reminder_rules
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = payment_reminder_rules.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));
DROP POLICY IF EXISTS $pn$Group admins and treasurers can record payments$pn$ ON public.payments;
CREATE POLICY $pn$Group admins and treasurers can record payments$pn$ ON public.payments
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = payments.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));
DROP POLICY IF EXISTS $pn$Group owners/admins can manage assignments$pn$ ON public.position_assignments;
CREATE POLICY $pn$Group owners/admins can manage assignments$pn$ ON public.position_assignments
  FOR ALL
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (group_positions gp
     JOIN memberships m ON ((m.group_id = gp.group_id)))
  WHERE ((gp.id = position_assignments.position_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));
DROP POLICY IF EXISTS $pn$Members contribute to projects$pn$ ON public.project_contributions;
CREATE POLICY $pn$Members contribute to projects$pn$ ON public.project_contributions
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (projects p
     JOIN memberships m ON ((m.group_id = p.group_id)))
  WHERE ((p.id = project_contributions.project_id) AND (m.user_id = auth.uid())))));
DROP POLICY IF EXISTS $pn$Admin manage expenses$pn$ ON public.project_expenses;
CREATE POLICY $pn$Admin manage expenses$pn$ ON public.project_expenses
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (projects p
     JOIN memberships m ON ((m.group_id = p.group_id)))
  WHERE ((p.id = project_expenses.project_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));
DROP POLICY IF EXISTS $pn$Admin manage milestones$pn$ ON public.project_milestones;
CREATE POLICY $pn$Admin manage milestones$pn$ ON public.project_milestones
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (projects p
     JOIN memberships m ON ((m.group_id = p.group_id)))
  WHERE ((p.id = project_milestones.project_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));
DROP POLICY IF EXISTS $pn$Admin manage projects$pn$ ON public.projects;
CREATE POLICY $pn$Admin manage projects$pn$ ON public.projects
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = projects.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));
DROP POLICY IF EXISTS $pn$Admins can manage claims$pn$ ON public.relief_claims;
CREATE POLICY $pn$Admins can manage claims$pn$ ON public.relief_claims
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (relief_plans
     JOIN memberships ON ((memberships.group_id = relief_plans.group_id)))
  WHERE ((relief_plans.id = relief_claims.plan_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));
DROP POLICY IF EXISTS $pn$Members can submit claims$pn$ ON public.relief_claims;
CREATE POLICY $pn$Members can submit claims$pn$ ON public.relief_claims
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.id = relief_claims.membership_id) AND (memberships.user_id = auth.uid())))));
DROP POLICY IF EXISTS $pn$relief_claims_delete$pn$ ON public.relief_claims;
CREATE POLICY $pn$relief_claims_delete$pn$ ON public.relief_claims
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (relief_plans rp
     JOIN memberships m ON (((m.group_id = rp.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))
  WHERE (rp.id = relief_claims.plan_id))));
DROP POLICY IF EXISTS $pn$relief_claims_insert$pn$ ON public.relief_claims;
CREATE POLICY $pn$relief_claims_insert$pn$ ON public.relief_claims
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.id = relief_claims.membership_id) AND (m.user_id = auth.uid())))));
DROP POLICY IF EXISTS $pn$relief_claims_update$pn$ ON public.relief_claims;
CREATE POLICY $pn$relief_claims_update$pn$ ON public.relief_claims
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (relief_plans rp
     JOIN memberships m ON (((m.group_id = rp.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))
  WHERE (rp.id = relief_claims.plan_id))));
DROP POLICY IF EXISTS $pn$Admins can manage enrollments$pn$ ON public.relief_enrollments;
CREATE POLICY $pn$Admins can manage enrollments$pn$ ON public.relief_enrollments
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (relief_plans
     JOIN memberships ON ((memberships.group_id = relief_plans.group_id)))
  WHERE ((relief_plans.id = relief_enrollments.plan_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));
DROP POLICY IF EXISTS $pn$relief_enrollments_delete$pn$ ON public.relief_enrollments;
CREATE POLICY $pn$relief_enrollments_delete$pn$ ON public.relief_enrollments
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (relief_plans rp
     JOIN memberships m ON (((m.group_id = rp.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))
  WHERE (rp.id = relief_enrollments.plan_id))));
DROP POLICY IF EXISTS $pn$relief_enrollments_insert$pn$ ON public.relief_enrollments;
CREATE POLICY $pn$relief_enrollments_insert$pn$ ON public.relief_enrollments
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (relief_plans rp
     JOIN memberships m ON (((m.group_id = rp.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))
  WHERE (rp.id = relief_enrollments.plan_id))));
DROP POLICY IF EXISTS $pn$relief_enrollments_update$pn$ ON public.relief_enrollments;
CREATE POLICY $pn$relief_enrollments_update$pn$ ON public.relief_enrollments
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (relief_plans rp
     JOIN memberships m ON (((m.group_id = rp.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))
  WHERE (rp.id = relief_enrollments.plan_id))));
DROP POLICY IF EXISTS $pn$Admins can manage payouts$pn$ ON public.relief_payouts;
CREATE POLICY $pn$Admins can manage payouts$pn$ ON public.relief_payouts
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM ((relief_claims
     JOIN relief_plans ON ((relief_plans.id = relief_claims.plan_id)))
     JOIN memberships ON ((memberships.group_id = relief_plans.group_id)))
  WHERE ((relief_claims.id = relief_payouts.claim_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));
DROP POLICY IF EXISTS $pn$relief_payouts_delete$pn$ ON public.relief_payouts;
CREATE POLICY $pn$relief_payouts_delete$pn$ ON public.relief_payouts
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM ((relief_claims rc
     JOIN relief_plans rp ON ((rp.id = rc.plan_id)))
     JOIN memberships m ON (((m.group_id = rp.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))
  WHERE (rc.id = relief_payouts.claim_id))));
DROP POLICY IF EXISTS $pn$relief_payouts_insert$pn$ ON public.relief_payouts;
CREATE POLICY $pn$relief_payouts_insert$pn$ ON public.relief_payouts
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM ((relief_claims rc
     JOIN relief_plans rp ON ((rp.id = rc.plan_id)))
     JOIN memberships m ON (((m.group_id = rp.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))
  WHERE (rc.id = relief_payouts.claim_id))));
DROP POLICY IF EXISTS $pn$relief_payouts_update$pn$ ON public.relief_payouts;
CREATE POLICY $pn$relief_payouts_update$pn$ ON public.relief_payouts
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM ((relief_claims rc
     JOIN relief_plans rp ON ((rp.id = rc.plan_id)))
     JOIN memberships m ON (((m.group_id = rp.group_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])))))
  WHERE (rc.id = relief_payouts.claim_id))));
DROP POLICY IF EXISTS $pn$Group admins can manage relief plans$pn$ ON public.relief_plans;
CREATE POLICY $pn$Group admins can manage relief plans$pn$ ON public.relief_plans
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = relief_plans.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));
DROP POLICY IF EXISTS $pn$relief_remittances_insert$pn$ ON public.relief_remittances;
CREATE POLICY $pn$relief_remittances_insert$pn$ ON public.relief_remittances
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.group_id = relief_remittances.branch_group_id) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role]))))));
DROP POLICY IF EXISTS $pn$relief_remittances_update$pn$ ON public.relief_remittances;
CREATE POLICY $pn$relief_remittances_update$pn$ ON public.relief_remittances
  FOR UPDATE
  TO public
  USING (((EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.group_id = relief_remittances.branch_group_id) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role]))))) OR (EXISTS ( SELECT 1
   FROM ((memberships m
     JOIN groups g_hq ON (((g_hq.id = m.group_id) AND (g_hq.group_level = 'hq'::text))))
     JOIN groups g_branch ON (((g_branch.organization_id = g_hq.organization_id) AND (g_branch.organization_id IS NOT NULL))))
  WHERE ((m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role])) AND (g_branch.id = relief_remittances.branch_group_id))))));
DROP POLICY IF EXISTS $pn$Admins can manage contributions$pn$ ON public.savings_contributions;
CREATE POLICY $pn$Admins can manage contributions$pn$ ON public.savings_contributions
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (savings_cycles sc
     JOIN memberships m ON ((m.group_id = sc.group_id)))
  WHERE ((sc.id = savings_contributions.cycle_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role, 'moderator'::membership_role]))))));
DROP POLICY IF EXISTS $pn$Admins can manage savings cycles$pn$ ON public.savings_cycles;
CREATE POLICY $pn$Admins can manage savings cycles$pn$ ON public.savings_cycles
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM memberships
  WHERE ((memberships.group_id = savings_cycles.group_id) AND (memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role, 'moderator'::membership_role]))))));
DROP POLICY IF EXISTS $pn$Admins can manage participants$pn$ ON public.savings_participants;
CREATE POLICY $pn$Admins can manage participants$pn$ ON public.savings_participants
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (savings_cycles sc
     JOIN memberships m ON ((m.group_id = sc.group_id)))
  WHERE ((sc.id = savings_participants.cycle_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role, 'moderator'::membership_role]))))));
DROP POLICY IF EXISTS $pn$Admins can delete payment config$pn$ ON public.group_payment_config;
CREATE POLICY $pn$Admins can delete payment config$pn$ ON public.group_payment_config
  FOR DELETE
  TO public
  USING ((group_id IN ( SELECT memberships.group_id
   FROM memberships
  WHERE ((memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role]))))));
DROP POLICY IF EXISTS $pn$Admins can insert payment config$pn$ ON public.group_payment_config;
CREATE POLICY $pn$Admins can insert payment config$pn$ ON public.group_payment_config
  FOR INSERT
  TO public
  WITH CHECK ((group_id IN ( SELECT memberships.group_id
   FROM memberships
  WHERE ((memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role]))))));
DROP POLICY IF EXISTS $pn$Admins can update payment config$pn$ ON public.group_payment_config;
CREATE POLICY $pn$Admins can update payment config$pn$ ON public.group_payment_config
  FOR UPDATE
  TO public
  USING ((group_id IN ( SELECT memberships.group_id
   FROM memberships
  WHERE ((memberships.user_id = auth.uid()) AND (memberships.role = ANY (ARRAY['admin'::membership_role, 'owner'::membership_role]))))));
DROP POLICY IF EXISTS $pn$rls_const_insert$pn$ ON public.group_constitutions;
CREATE POLICY $pn$rls_const_insert$pn$ ON public.group_constitutions
  FOR INSERT
  TO authenticated
  WITH CHECK (is_group_admin(group_id));
DROP POLICY IF EXISTS $pn$rls_const_update$pn$ ON public.group_constitutions;
CREATE POLICY $pn$rls_const_update$pn$ ON public.group_constitutions
  FOR UPDATE
  TO authenticated
  USING (is_group_admin(group_id));
DROP POLICY IF EXISTS $pn$rls_const_delete$pn$ ON public.group_constitutions;
CREATE POLICY $pn$rls_const_delete$pn$ ON public.group_constitutions
  FOR DELETE
  TO authenticated
  USING (is_group_admin(group_id));
DROP POLICY IF EXISTS $pn$rls_amend_update$pn$ ON public.constitution_amendments;
CREATE POLICY $pn$rls_amend_update$pn$ ON public.constitution_amendments
  FOR UPDATE
  TO authenticated
  USING (is_group_admin(group_id));
DROP POLICY IF EXISTS $pn$rls_amend_delete$pn$ ON public.constitution_amendments;
CREATE POLICY $pn$rls_amend_delete$pn$ ON public.constitution_amendments
  FOR DELETE
  TO authenticated
  USING (is_group_admin(group_id));
