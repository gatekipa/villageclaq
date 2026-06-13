-- 00102: Multi-tenant isolation hardening (Build 2)
-- ===========================================================================
-- Closes cross-tenant exposure surfaces found in the Build 2 data-isolation
-- audit. CREATE OR REPLACE / ALTER / DROP POLICY only — no table changes, no
-- data writes. Re-runnable.
--
-- FINDINGS ADDRESSED
-- ------------------
-- 1. [HIGH — cross-tenant leak] The relief_branch_summary VIEW (00045) has no
--    security_invoker and is GRANTed to `authenticated`, so it runs with the
--    view owner's privileges and BYPASSES RLS on relief_plans /
--    relief_enrollments / payments / relief_remittances. Any logged-in user
--    can `SELECT * FROM relief_branch_summary` and read EVERY organization's
--    branch financials. (Confirmed live: pg_class.reloptions IS NULL.)
--
--    Fix: keep the aggregate's owner-privilege cross-branch visibility (HQ
--    oversight needs to see branches the HQ admin is not a direct member of),
--    but add an explicit CALLER-ORG boundary in the view body using
--    get_user_group_ids() (which reads auth.uid(), so it is caller-aware even
--    in an owner-run view). A branch summary row is now visible only when its
--    collecting branch belongs to an organization the caller is part of.
--
-- 2. [MEDIUM — over-broad legacy policy] loan_requests_v1 / loan_repayments_v1
--    (renamed away from the live loan tables in 00032) still carry the
--    permissive rls_lr_all / rls_lrep_all = FOR ALL USING(true) policies from
--    00014. The live app uses the NEW loan_requests / loan_repayments tables
--    (verified: no app code references the _v1 tables), so these orphaned
--    deprecated tables should not be world-readable.
--    Fix: drop the permissive policies (RLS stays enabled => deny-all).
--
-- 3. [INFO — hardening hygiene] is_group_admin_or_owner (00040) is
--    SECURITY DEFINER but omits SET search_path = public, unlike every other
--    definer function. Fix: add the search_path pin (search_path-injection
--    hardening).
--
-- DOCUMENTED FOLLOW-UPS (NOT changed here — need their own tested redesign):
--   * relief_remittances_select (00045) lets any member of any group in the
--     same organization read branch remitted amounts (within-org over-share,
--     not cross-tenant). Tightening to admins risks breaking the legitimate
--     branch/HQ remittance view; redesign + test separately.
--   * position_assignments / position_permissions keep USING(true)
--     (00026) by design for the client permission resolver — org-chart
--     metadata, no PII/financial. Revisit only with a resolver redesign.
--
-- PREFLIGHT (read-only — confirm before applying):
--   SELECT
--     (SELECT reloptions FROM pg_class WHERE relname='relief_branch_summary') AS view_opts, -- expect NULL (pre-fix)
--     to_regclass('public.loan_requests_v1') IS NOT NULL AS lr_v1,
--     to_regclass('public.loan_repayments_v1') IS NOT NULL AS lrep_v1,
--     (SELECT count(*) FROM pg_proc WHERE proname='get_user_group_ids')=1 AS has_helper;
--
-- VERIFICATION (after apply):
--   -- view now carries the org-boundary WHERE clause:
--   SELECT pg_get_viewdef('public.relief_branch_summary'::regclass) ILIKE '%get_user_group_ids%';
--   -- permissive legacy policies gone:
--   SELECT count(*) FROM pg_policies
--     WHERE tablename IN ('loan_requests_v1','loan_repayments_v1')
--       AND policyname IN ('rls_lr_all','rls_lrep_all');         -- expect 0
--   -- definer hardened:
--   SELECT proconfig FROM pg_proc WHERE proname='is_group_admin_or_owner'; -- includes search_path=public
--   -- regression: an HQ admin still sees THEIR org's branch summaries (run as a
--   -- real HQ-admin session, not service role): SELECT count(*) FROM relief_branch_summary;
--
-- ROLLBACK: re-apply 00045's view definition (no org WHERE clause) and 00014's
--   rls_lr_all / rls_lrep_all policies; drop the search_path from
--   is_group_admin_or_owner. No data to undo.
--
-- RELEASE SEQUENCING: this migration is independent of application code (it
--   only tightens RLS/visibility). It can be applied any time after the Build 2
--   deploy is READY. Apply as a single-file manual execution; do not run a
--   broad migration runner.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. relief_branch_summary — add the caller-organization boundary.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.relief_branch_summary AS
SELECT
  rp.id AS relief_plan_id,
  rp.name AS plan_name,
  re.collecting_group_id,
  g.name AS branch_name,
  g.currency AS branch_currency,
  COUNT(re.id) AS enrolled_count,
  COUNT(re.id) FILTER (WHERE re.enrollment_type = 'full_member') AS full_member_count,
  COUNT(re.id) FILTER (WHERE re.enrollment_type = 'relief_only') AS relief_only_count,
  COUNT(re.id) FILTER (WHERE re.enrollment_type = 'external') AS external_count,
  COUNT(DISTINCT p.membership_id) FILTER (WHERE p.created_at >= date_trunc('month', CURRENT_DATE)) AS paid_this_month,
  COALESCE(SUM(p.amount) FILTER (WHERE p.created_at >= date_trunc('month', CURRENT_DATE) AND p.status = 'confirmed'), 0) AS collected_this_month,
  COALESCE(SUM(rr.amount) FILTER (WHERE rr.status = 'confirmed'), 0) AS total_remitted
FROM relief_plans rp
JOIN relief_enrollments re ON re.plan_id = rp.id
LEFT JOIN groups g ON g.id = re.collecting_group_id
LEFT JOIN payments p ON p.relief_plan_id = rp.id AND p.membership_id = re.membership_id AND p.status = 'confirmed'
LEFT JOIN relief_remittances rr ON rr.relief_plan_id = rp.id AND rr.branch_group_id = re.collecting_group_id
WHERE rp.shared_from_org = true
  -- CALLER-ORG BOUNDARY: the collecting branch must belong to an organization
  -- the caller is part of. get_user_group_ids() reads auth.uid(), so this is
  -- enforced per-caller even though the view runs with owner privileges.
  AND re.collecting_group_id IN (
    SELECT g_branch.id
    FROM groups g_branch
    WHERE g_branch.organization_id IS NOT NULL
      AND g_branch.organization_id IN (
        SELECT g_user.organization_id
        FROM groups g_user
        WHERE g_user.id IN (SELECT get_user_group_ids())
          AND g_user.organization_id IS NOT NULL
      )
  )
GROUP BY rp.id, rp.name, re.collecting_group_id, g.name, g.currency;

GRANT SELECT ON public.relief_branch_summary TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Drop the orphaned permissive policies on the deprecated _v1 loan tables.
--    RLS stays enabled, so the tables become deny-all (the live app uses the
--    new loan_requests / loan_repayments tables, not these).
-- ---------------------------------------------------------------------------
-- Guarded so the migration is a no-op (not an error) in any environment where
-- the deprecated _v1 tables were never created.
DO $$ BEGIN
  IF to_regclass('public.loan_requests_v1') IS NOT NULL THEN
    DROP POLICY IF EXISTS "rls_lr_all" ON public.loan_requests_v1;
  END IF;
  IF to_regclass('public.loan_repayments_v1') IS NOT NULL THEN
    DROP POLICY IF EXISTS "rls_lrep_all" ON public.loan_repayments_v1;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Pin search_path on the one definer function that lacked it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_group_admin_or_owner(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE group_id = p_group_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'admin')
  );
$$;
