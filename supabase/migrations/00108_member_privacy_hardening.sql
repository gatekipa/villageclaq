-- ============================================================================
-- 00108_member_privacy_hardening.sql
-- Build 15 — Member Privacy + Financial Report Access Hardening
--
-- ⚠️  CREATE-NOT-APPLY. DO NOT RUN THIS IN PRODUCTION AS PART OF BUILD 15.
--     The live protection for Build 15 ships at the APP layer (a page-level
--     permission gate on /dashboard/members/[id]). This migration is the
--     defense-in-depth DB layer: it tightens the SELECT policies on the two
--     core financial tables so a plain group member can read ONLY their own
--     payments / obligations at the database, not a peer's — even if an app
--     gate is ever removed or bypassed.
--
-- WHY (audit finding, Build 15):
--   payments.rls_pay_select and contribution_obligations.rls_co_select today
--   authorize on group membership alone (is_group_member / group-wide read).
--   So at the DB layer ANY group member can SELECT ANY peer's payments and
--   obligations. The app hides this on every finance page via RequirePermission,
--   and the member-detail page is now gated too — but the DB remains permissive.
--
-- PRE-APPLY VALIDATION CHECKLIST (run in a Supabase BRANCH db first, never prod):
--   1. Confirm the live SELECT policy names are still exactly `rls_pay_select`
--      and `rls_co_select` (SELECT policyname FROM pg_policies WHERE tablename
--      IN ('payments','contribution_obligations')). Reconcile if renamed.
--   2. Confirm NO member-FACING (non-finance-gated) page relies on reading
--      group-wide payments/obligations. The confirmed-only money engine
--      (useGroupDuesPayments → computeObligationStates) is consumed by
--      finance-permissioned pages (unpaid/matrix/finances/reports), whose
--      viewers satisfy the admin/owner OR finances.* position-permission clause
--      below. my-payments/my-dashboard read the member's OWN rows (own clause).
--      VERIFY this still holds before applying, or members lose self-service data.
--   3. Confirm a finance-permissioned MODERATOR (not owner/admin, holding a
--      position with finances.view/finances.manage/members.manage) still passes
--      the position-permission clause — i.e. the dues matrix keeps working.
--   4. Confirm write paths are unaffected (this migration touches SELECT only;
--      rls_pay_insert / rls_co_insert / rls_co_update are left intact — Pay Now,
--      bulk record, and obligation generation must continue to work).
--   5. Run the full app smoke (record payment, view matrix as treasurer, view
--      own statement as a plain member, attempt peer deep-link → denied).
--
-- DOES NOT TOUCH: reminder cron/producers, notification queue, receipts,
--   Stripe/Meta/WABA config, the P0 bulk-receipt guard, Build-4 confirmed-only
--   accounting (read-only policy change; the money engine math is unchanged),
--   Build-10 due dates, Build-12/13 accuracy, or the Build-8 announcement
--   producer. SELECT-only; no data is mutated.
--
-- FOLLOW-UP (NOT in this migration — separate, each needs its own validation):
--   fines (rls_fin_select + permissive rls_fin_all USING(true)),
--   relief_enrollments (permissive rls_re_all USING(true)),
--   family_members (rls_fm_select USING(true) + rls_fm_all USING(true)).
--   These carry FOR ALL USING(true) policies that also grant SELECT, so they
--   need the permissive policy dropped + per-command policies rebuilt — a larger
--   change deferred to keep this migration focused on the financial statement.
-- ============================================================================

-- Permission-aware visibility helper. SECURITY DEFINER so it can read the
-- permission tables regardless of the caller's own row-level visibility.
-- Mirrors the app's usePermissions model exactly: owner/admin bypass, plus any
-- active position assignment carrying a finance/members view permission.
CREATE OR REPLACE FUNCTION public.can_view_member_financial(
  p_membership_id uuid,
  p_group_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- (a) the caller owns the target membership (their OWN financial data).
    --     Exited memberships are excluded (matches the 00061 hardening pattern).
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.id = p_membership_id AND m.user_id = auth.uid()
        AND m.membership_status != 'exited'
    )
    -- (b) the caller is an owner/admin of the group
    OR public.is_group_admin_or_owner(p_group_id)
    -- (c) the caller holds an active finance/members view permission in the group.
    --     The caller's own membership must be non-exited so a stale position
    --     assignment on an exited member cannot replay group-wide read access.
    OR EXISTS (
      SELECT 1
      FROM public.memberships cm
      JOIN public.position_assignments pa
        ON pa.membership_id = cm.id AND pa.ended_at IS NULL
      JOIN public.position_permissions pp
        ON pp.position_id = pa.position_id
      WHERE cm.group_id = p_group_id
        AND cm.user_id = auth.uid()
        AND cm.membership_status != 'exited'
        AND pp.permission IN ('finances.view', 'finances.manage', 'members.manage')
    );
$$;

COMMENT ON FUNCTION public.can_view_member_financial(uuid, uuid) IS
  'Build 15: true if auth.uid() may read the target membership''s financial rows — own data, or group owner/admin, or a finance/members position permission. Used by tightened payments/contribution_obligations SELECT policies.';

-- ── payments: own rows OR finance-permissioned reader ───────────────────────
DROP POLICY IF EXISTS rls_pay_select ON public.payments;
CREATE POLICY rls_pay_select ON public.payments
  FOR SELECT TO authenticated
  USING (public.can_view_member_financial(membership_id, group_id));

-- ── contribution_obligations: own rows OR finance-permissioned reader ───────
DROP POLICY IF EXISTS rls_co_select ON public.contribution_obligations;
CREATE POLICY rls_co_select ON public.contribution_obligations
  FOR SELECT TO authenticated
  USING (public.can_view_member_financial(membership_id, group_id));
