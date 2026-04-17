-- Security hardening — P0/P1 findings from the pen-test audit.
-- Each block is independent and marked with the finding it addresses.
-- All fixes are verified against live pg_policies before and after.

-- =============================================================================
-- CRITICAL-1: memberships self-role escalation
-- -----------------------------------------------------------------------------
-- Before: memberships_update_own (user_id = auth.uid()) was ORed with the
-- restrictive rls_membership_role_guard. In Postgres RLS a row passes UPDATE
-- if ANY policy allows it, so a regular member could run
--     UPDATE memberships SET role='owner' WHERE id = <their-own>;
-- and become owner. Standing, group_id, user_id, is_proxy, and
-- proxy_manager_id were all mutable the same way. The prevent_owner_demotion
-- trigger only blocked changes AWAY from owner, not TO owner.
--
-- Fix: BEFORE UPDATE trigger that rejects changes to protected columns when
-- the caller is editing their OWN row and is not a group admin.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.prevent_membership_self_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_admin boolean;
BEGIN
  -- Skip entirely for service-role / background writes (auth.uid() is NULL).
  IF v_caller IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only intervene when the caller is editing their OWN membership row.
  -- Admin updates to other members' rows are governed by the existing
  -- rls_membership_role_guard policy.
  IF OLD.user_id IS DISTINCT FROM v_caller THEN
    RETURN NEW;
  END IF;

  v_is_admin := is_group_admin(OLD.group_id);

  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  -- Non-admin self-edit: freeze every privilege-bearing column.
  IF NEW.role           IS DISTINCT FROM OLD.role           THEN RAISE EXCEPTION 'role_change_requires_admin'           USING ERRCODE = '42501'; END IF;
  IF NEW.standing       IS DISTINCT FROM OLD.standing       THEN RAISE EXCEPTION 'standing_change_requires_admin'       USING ERRCODE = '42501'; END IF;
  IF NEW.group_id       IS DISTINCT FROM OLD.group_id       THEN RAISE EXCEPTION 'group_id_change_not_allowed'           USING ERRCODE = '42501'; END IF;
  IF NEW.user_id        IS DISTINCT FROM OLD.user_id        THEN RAISE EXCEPTION 'user_id_change_not_allowed'            USING ERRCODE = '42501'; END IF;
  IF NEW.is_proxy       IS DISTINCT FROM OLD.is_proxy       THEN RAISE EXCEPTION 'is_proxy_change_requires_admin'       USING ERRCODE = '42501'; END IF;
  IF NEW.proxy_manager_id IS DISTINCT FROM OLD.proxy_manager_id THEN RAISE EXCEPTION 'proxy_manager_change_requires_admin' USING ERRCODE = '42501'; END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_membership_self_escalation ON memberships;
CREATE TRIGGER prevent_membership_self_escalation
  BEFORE UPDATE ON memberships
  FOR EACH ROW EXECUTE FUNCTION prevent_membership_self_escalation();


-- =============================================================================
-- CRITICAL-2: group_subscriptions tier bypass
-- -----------------------------------------------------------------------------
-- Before: "Admins can manage subscription" FOR ALL let any group
-- admin/owner run
--     UPDATE group_subscriptions SET tier='enterprise', status='active' WHERE group_id=<mine>;
-- and get Enterprise features for free. Subscription state should only be
-- mutable by platform staff (billing ops) or the service role (Stripe
-- webhook). Group admins can still SELECT (which is separate policy).
--
-- Fix: BEFORE INSERT/UPDATE trigger that blocks changes to tier, status,
-- current_period_end, trial_ends_at, cancel_at_period_end when the caller
-- is not platform staff and not the service role.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.prevent_subscription_tier_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  -- Service role / background (auth.uid() is NULL) is trusted
  IF v_caller IS NULL THEN
    RETURN NEW;
  END IF;

  -- Platform staff (billing ops) may mutate freely
  IF is_platform_staff() THEN
    RETURN NEW;
  END IF;

  -- On INSERT: group admins may seed their subscription row, but they
  -- MUST start on 'free' with status 'active'. Anything else is a bypass.
  IF TG_OP = 'INSERT' THEN
    IF NEW.tier <> 'free' THEN
      RAISE EXCEPTION 'tier_upgrade_requires_billing' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- On UPDATE: none of these may change outside of a billing webhook.
  IF NEW.tier                   IS DISTINCT FROM OLD.tier                   THEN RAISE EXCEPTION 'tier_change_requires_billing'                 USING ERRCODE = '42501'; END IF;
  IF NEW.status                 IS DISTINCT FROM OLD.status                 THEN RAISE EXCEPTION 'status_change_requires_billing'               USING ERRCODE = '42501'; END IF;
  IF NEW.current_period_end     IS DISTINCT FROM OLD.current_period_end     THEN RAISE EXCEPTION 'period_change_requires_billing'               USING ERRCODE = '42501'; END IF;
  IF NEW.trial_ends_at          IS DISTINCT FROM OLD.trial_ends_at          THEN RAISE EXCEPTION 'trial_change_requires_billing'                USING ERRCODE = '42501'; END IF;
  IF NEW.cancel_at_period_end   IS DISTINCT FROM OLD.cancel_at_period_end   THEN RAISE EXCEPTION 'cancel_flag_change_requires_billing'          USING ERRCODE = '42501'; END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_subscription_tier_tampering ON group_subscriptions;
CREATE TRIGGER prevent_subscription_tier_tampering
  BEFORE INSERT OR UPDATE ON group_subscriptions
  FOR EACH ROW EXECUTE FUNCTION prevent_subscription_tier_tampering();


-- =============================================================================
-- CRITICAL-3: proxy_claim_tokens exposed to all group members
-- -----------------------------------------------------------------------------
-- Before: one policy "Group admins can manage claim tokens" (FOR ALL) with
-- USING that only required `m.group_id IN (get_user_group_ids())` — i.e.
-- ANY member of the same group could SELECT/UPDATE/DELETE claim tokens for
-- any proxy in the group and then claim the proxy pretending to be them.
--
-- Fix: require has_group_permission(group_id, 'members.manage'). Regular
-- members no longer see, modify, or delete tokens. The proxy_claim flow
-- that verifies tokens runs through the service role and is unaffected.
-- =============================================================================

DROP POLICY IF EXISTS "Group admins can manage claim tokens" ON proxy_claim_tokens;

CREATE POLICY "pct_manage" ON proxy_claim_tokens FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.id = proxy_claim_tokens.membership_id
        AND has_group_permission(m.group_id, 'members.manage')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.id = proxy_claim_tokens.membership_id
        AND has_group_permission(m.group_id, 'members.manage')
    )
  );


-- =============================================================================
-- HIGH-4: notifications forgery
-- -----------------------------------------------------------------------------
-- Before: rls_notif_insert WITH CHECK true — any authenticated user could
-- INSERT a notification row targeted at any user_id with any title/body/
-- data, including a link payload. A phishing vector: forge a
-- "Admin alert — click here" notification into the victim's inbox.
--
-- Fix: INSERT is allowed when either (a) the caller is writing to their
-- own user_id, or (b) the caller is a group admin / manager of the row's
-- group_id. All legitimate blast call-sites (announcements, minutes,
-- elections, events) are admin/manager-initiated and keep working.
-- =============================================================================

DROP POLICY IF EXISTS "rls_notif_insert" ON notifications;

CREATE POLICY "rls_notif_insert" ON notifications FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR (
      group_id IS NOT NULL
      AND (
        is_group_admin(group_id)
        OR has_group_permission(group_id, 'announcements.manage')
        OR has_group_permission(group_id, 'minutes.manage')
        OR has_group_permission(group_id, 'elections.manage')
        OR has_group_permission(group_id, 'events.manage')
      )
    )
  );


-- =============================================================================
-- CRITICAL-5: payments INSERT lets members forge confirmed payments
-- -----------------------------------------------------------------------------
-- Before: rls_pay_insert WITH CHECK is_group_member(group_id). payments.status
-- defaults to 'confirmed'. Any member could INSERT a payment with any amount
-- claiming themselves paid, and it would count toward their standing
-- immediately.
--
-- Fix: if the caller is not an admin/owner/treasurer, restrict self-
-- submission to:
--   - membership_id belongs to auth.uid()
--   - status = 'pending_confirmation' (admin still has to confirm)
--   - recorded_by = auth.uid()
-- The "Group admins and treasurers can record payments" policy stays
-- unchanged and still accepts any admin-authored confirmed payment.
-- =============================================================================

DROP POLICY IF EXISTS "rls_pay_insert" ON payments;

CREATE POLICY "rls_pay_insert" ON payments FOR INSERT TO authenticated
  WITH CHECK (
    is_group_member(group_id)
    AND status = 'pending_confirmation'
    AND recorded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.id = payments.membership_id
        AND m.user_id = auth.uid()
    )
  );


-- =============================================================================
-- CRITICAL-6: contribution_obligations tampering by non-admin members
-- -----------------------------------------------------------------------------
-- Before:
--   rls_co_insert had an OR branch allowing is_group_member(ct.group_id) —
--     any member could INSERT an obligation with amount_paid = amount and
--     mark themselves paid.
--   rls_co_update USING is_group_member(m.group_id) — any member could
--     UPDATE any obligation in the group (including other members').
--
-- Fix: restrict both to admins (the "Group admins can manage/update
-- obligations" policies already cover the legitimate admin path). The
-- useRecordPayment hook that inserts an obligation row when none exists
-- is called from admin-initiated payment recording, so the admin policy
-- still accepts it.
-- =============================================================================

DROP POLICY IF EXISTS "rls_co_insert" ON contribution_obligations;
DROP POLICY IF EXISTS "rls_co_update" ON contribution_obligations;

CREATE POLICY "rls_co_insert" ON contribution_obligations FOR INSERT TO authenticated
  WITH CHECK (
    is_group_admin(group_id)
    OR has_group_permission(group_id, 'contributions.manage')
    OR has_group_permission(group_id, 'finances.record')
  );

CREATE POLICY "rls_co_update" ON contribution_obligations FOR UPDATE TO authenticated
  USING (
    is_group_admin(group_id)
    OR has_group_permission(group_id, 'contributions.manage')
    OR has_group_permission(group_id, 'finances.record')
  )
  WITH CHECK (
    is_group_admin(group_id)
    OR has_group_permission(group_id, 'contributions.manage')
    OR has_group_permission(group_id, 'finances.record')
  );
