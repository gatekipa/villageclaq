-- ============================================================================
-- 00111_harden_relief_branch_summary.sql
-- Backend Audit Batch C — clear the `security_definer_view` advisor ERROR on
-- public.relief_branch_summary without breaking HQ relief oversight.
--
-- CURRENT RISK (Supabase advisor 0010, ERROR):
--   relief_branch_summary (00045, last touched 00102) is an OWNER-RIGHTS view —
--   pg_class.reloptions IS NULL, owner = postgres (superuser) — so it runs with
--   the owner's privileges and BYPASSES RLS on relief_plans / relief_enrollments
--   / payments / relief_remittances. It is GRANTed SELECT to `authenticated`
--   AND (over-granted) to `anon`. 00102 already added an explicit caller-org
--   WHERE boundary using get_user_group_ids(), so it is NOT an unbounded
--   cross-tenant leak today — but the structural owner-rights posture is what the
--   advisor flags as a security ERROR, and `anon` should not be granted at all.
--
-- WHY PLAIN security_invoker IS NOT SUFFICIENT (verified against live RLS):
--   Under security_invoker the view would run with the CALLER's RLS. An HQ admin
--   is NOT a direct member of the branch groups, and:
--     * relief_enrollments / relief_plans / relief_remittances RLS DO grant the
--       HQ admin cross-branch read (enrollment policy keys on the PLAN's group =
--       HQ; remittance policy is org-aware), BUT
--     * payments.rls_pay_select = can_view_member_financial(membership_id,
--       group_id) keys on the BRANCH group, which the HQ admin does NOT
--       administer -> branch payments are hidden -> `collected_this_month` and
--       `paid_this_month` would silently read 0 for HQ admins.
--   So security_invoker alone UNDER-RETURNS the collection columns. The HQ
--   relief-rollup needs owner-privilege visibility of branch payments.
--
-- DESIGN (the safer explicit boundary):
--   1. Move the privileged aggregate into a dedicated SECURITY DEFINER function
--      get_relief_branch_summary() that keeps the SAME caller-org boundary
--      (get_user_group_ids() is caller-aware via auth.uid() even under definer
--      rights). This isolates the necessary owner-rights aggregation behind ONE
--      explicitly-bounded function (the sanctioned pattern) instead of a broad
--      owner-rights view.
--   2. Recreate relief_branch_summary as a thin view WITH (security_invoker =
--      true) that just SELECTs from the function. The view is now invoker-rights
--      -> the `security_definer_view` advisor ERROR clears. Same name + same 12
--      columns -> the relief-rollup + reports/[reportId] consumers are
--      UNCHANGED (no route/page change needed).
--   3. Revoke the erroneous `anon` grant; grant only authenticated + service_role.
--
-- EFFECTIVE ACCESS is identical to today's bounded behaviour (a caller sees only
-- their organisation's branch summaries) — this is a STRUCTURAL hardening that
-- clears the advisor and removes the anon over-grant, not a behaviour change.
-- Tightening org-wide visibility to admins-only is a separate, deliberately
-- deferred policy decision (documented in the 00102 follow-ups).
--
-- THIS MIGRATION CHANGES NO DATA ROWS — it only redefines a function + a view and
-- adjusts grants. No relief/payments/membership rows are read or written at apply
-- time. No other relief tables or their RLS policies are altered.
--
-- PREFLIGHT (run read-only BEFORE applying):
--   SELECT reloptions FROM pg_class WHERE oid='public.relief_branch_summary'::regclass; -- expect NULL (owner-rights)
--   SELECT count(*)=1 FROM pg_proc WHERE proname='get_user_group_ids';                  -- helper present
--   SELECT string_agg(grantee,',') FROM information_schema.role_table_grants
--     WHERE table_name='relief_branch_summary' AND privilege_type='SELECT';             -- includes anon (to be revoked)
--   -- nothing depends on the view (safe to DROP):
--   SELECT count(*) FROM pg_depend d JOIN pg_rewrite r ON r.oid=d.objid
--     JOIN pg_class c ON c.oid=r.ev_class
--     WHERE d.refobjid='public.relief_branch_summary'::regclass AND c.relname<>'relief_branch_summary'; -- expect 0
--
-- ROLLBACK (ORDER MATTERS — the view depends on the function): FIRST run
--   `CREATE OR REPLACE VIEW public.relief_branch_summary AS <the 00102
--   owner-rights body>` to sever the view's dependency on the function, THEN
--   `DROP FUNCTION public.get_relief_branch_summary()`. Dropping the function
--   first would ERROR (the view still depends on it). This re-introduces the
--   advisor ERROR + the anon grant, so it is NOT recommended. The 00102
--   definition is in 00102_tenant_isolation_hardening.sql. No data to roll back.
--
-- POST-APPLY VERIFICATION (run read-only):
--   SELECT reloptions FROM pg_class WHERE oid='public.relief_branch_summary'::regclass; -- expect {security_invoker=true}
--   SELECT prosecdef, proconfig FROM pg_proc WHERE proname='get_relief_branch_summary'; -- t, {search_path=public}
--   SELECT pg_get_viewdef('public.relief_branch_summary'::regclass) ILIKE '%get_relief_branch_summary%'; -- t
--   SELECT bool_or(grantee='anon') FROM information_schema.role_table_grants
--     WHERE table_name='relief_branch_summary';                                          -- expect f (anon revoked)
--   -- (real HQ-admin session, NOT service role): SELECT count(*) FROM relief_branch_summary; -- returns the org's branches
-- ============================================================================

-- 1. Privileged aggregate as a bounded SECURITY DEFINER function.
CREATE OR REPLACE FUNCTION public.get_relief_branch_summary()
RETURNS TABLE (
  relief_plan_id uuid,
  plan_name text,
  collecting_group_id uuid,
  branch_name text,
  branch_currency text,
  enrolled_count bigint,
  full_member_count bigint,
  relief_only_count bigint,
  external_count bigint,
  paid_this_month bigint,
  collected_this_month numeric,
  total_remitted numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    -- Explicit caller-organisation boundary (preserved from 00102):
    -- a branch summary is visible only when its collecting branch belongs to an
    -- organisation the caller is part of. get_user_group_ids() reads auth.uid(),
    -- so this is caller-aware even though the function runs with definer rights.
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
$function$;

-- LOAD-BEARING — DO NOT remove as "redundant": Supabase's pg_default_acl
-- auto-GRANTs EXECUTE to anon on every newly created public function, so these
-- REVOKEs are required to actually deny anon. (The org boundary already returns
-- 0 rows for anon since auth.uid() is NULL, but this strips the privilege too.)
REVOKE ALL ON FUNCTION public.get_relief_branch_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_relief_branch_summary() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_relief_branch_summary() TO authenticated, service_role;

-- 2. Recreate the view as a thin security_invoker passthrough (clears the
--    advisor ERROR; same name + columns => consumers unchanged). Nothing depends
--    on the view (preflight), so a plain DROP/CREATE is safe (no CASCADE).
DROP VIEW IF EXISTS public.relief_branch_summary;

CREATE VIEW public.relief_branch_summary
  WITH (security_invoker = true)
  AS SELECT * FROM public.get_relief_branch_summary();

-- 3. Grants: authenticated + service_role only. anon is NOT granted (an over-grant
--    from the 00045 view); the org boundary already denies anon (no auth.uid()),
--    but revoking is defense-in-depth.
REVOKE ALL ON public.relief_branch_summary FROM anon;
GRANT SELECT ON public.relief_branch_summary TO authenticated, service_role;
