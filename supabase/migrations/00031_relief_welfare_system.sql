-- ============================================================
-- 00031: Relief / Welfare System — RLS Fix + GRANTs
-- ============================================================
-- Fixes insecure blanket USING(true) policies on relief_enrollments,
-- relief_claims, and relief_payouts. Replaces with proper group-scoped
-- policies using get_user_group_ids() SECURITY DEFINER helper.
-- Also adds missing GRANT statements for PostgREST schema cache.
-- ============================================================

-- ─── relief_plans: already has is_group_member/is_group_admin policies ────
-- Just add the GRANT
GRANT ALL ON relief_plans TO authenticated;

-- ─── relief_enrollments: replace blanket allow-all ────────────────────────
DROP POLICY IF EXISTS "rls_re_all" ON relief_enrollments;

-- SELECT: any member of the group (via plan → group_id)
CREATE POLICY "relief_enrollments_select"
  ON relief_enrollments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM relief_plans rp
      WHERE rp.id = relief_enrollments.plan_id
        AND rp.group_id IN (SELECT get_user_group_ids())
    )
  );

-- INSERT: admin/owner of the group (enrolling members)
CREATE POLICY "relief_enrollments_insert"
  ON relief_enrollments FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM relief_plans rp
      JOIN memberships m ON m.group_id = rp.group_id
        AND m.user_id = auth.uid()
        AND m.role IN ('admin', 'owner')
      WHERE rp.id = relief_enrollments.plan_id
    )
  );

-- UPDATE: admin/owner only
CREATE POLICY "relief_enrollments_update"
  ON relief_enrollments FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM relief_plans rp
      JOIN memberships m ON m.group_id = rp.group_id
        AND m.user_id = auth.uid()
        AND m.role IN ('admin', 'owner')
      WHERE rp.id = relief_enrollments.plan_id
    )
  );

-- DELETE: admin/owner only
CREATE POLICY "relief_enrollments_delete"
  ON relief_enrollments FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM relief_plans rp
      JOIN memberships m ON m.group_id = rp.group_id
        AND m.user_id = auth.uid()
        AND m.role IN ('admin', 'owner')
      WHERE rp.id = relief_enrollments.plan_id
    )
  );

GRANT ALL ON relief_enrollments TO authenticated;

-- ─── relief_claims: replace blanket allow-all ─────────────────────────────
DROP POLICY IF EXISTS "rls_rc_all" ON relief_claims;

-- SELECT: claimant themselves OR admin/owner of the group
CREATE POLICY "relief_claims_select"
  ON relief_claims FOR SELECT TO authenticated
  USING (
    -- The claimant (via their membership)
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.id = relief_claims.membership_id
        AND m.user_id = auth.uid()
    )
    OR
    -- Admin/owner of the group
    EXISTS (
      SELECT 1 FROM relief_plans rp
      JOIN memberships m ON m.group_id = rp.group_id
        AND m.user_id = auth.uid()
        AND m.role IN ('admin', 'owner')
      WHERE rp.id = relief_claims.plan_id
    )
  );

-- INSERT: any enrolled member of the group (self-service claim)
CREATE POLICY "relief_claims_insert"
  ON relief_claims FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.id = relief_claims.membership_id
        AND m.user_id = auth.uid()
    )
  );

-- UPDATE: admin/owner only (reviewing claims)
CREATE POLICY "relief_claims_update"
  ON relief_claims FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM relief_plans rp
      JOIN memberships m ON m.group_id = rp.group_id
        AND m.user_id = auth.uid()
        AND m.role IN ('admin', 'owner')
      WHERE rp.id = relief_claims.plan_id
    )
  );

-- DELETE: admin/owner only
CREATE POLICY "relief_claims_delete"
  ON relief_claims FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM relief_plans rp
      JOIN memberships m ON m.group_id = rp.group_id
        AND m.user_id = auth.uid()
        AND m.role IN ('admin', 'owner')
      WHERE rp.id = relief_claims.plan_id
    )
  );

GRANT ALL ON relief_claims TO authenticated;

-- ─── relief_payouts: replace blanket allow-all ────────────────────────────
DROP POLICY IF EXISTS "rls_rpay_all" ON relief_payouts;

-- SELECT: the claimant (via claim → membership) OR admin/owner
CREATE POLICY "relief_payouts_select"
  ON relief_payouts FOR SELECT TO authenticated
  USING (
    -- Claimant of this payout's claim
    EXISTS (
      SELECT 1 FROM relief_claims rc
      JOIN memberships m ON m.id = rc.membership_id
        AND m.user_id = auth.uid()
      WHERE rc.id = relief_payouts.claim_id
    )
    OR
    -- Admin/owner of the group
    EXISTS (
      SELECT 1 FROM relief_claims rc
      JOIN relief_plans rp ON rp.id = rc.plan_id
      JOIN memberships m ON m.group_id = rp.group_id
        AND m.user_id = auth.uid()
        AND m.role IN ('admin', 'owner')
      WHERE rc.id = relief_payouts.claim_id
    )
  );

-- INSERT: admin/owner only (recording payouts)
CREATE POLICY "relief_payouts_insert"
  ON relief_payouts FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM relief_claims rc
      JOIN relief_plans rp ON rp.id = rc.plan_id
      JOIN memberships m ON m.group_id = rp.group_id
        AND m.user_id = auth.uid()
        AND m.role IN ('admin', 'owner')
      WHERE rc.id = relief_payouts.claim_id
    )
  );

-- UPDATE: admin/owner only
CREATE POLICY "relief_payouts_update"
  ON relief_payouts FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM relief_claims rc
      JOIN relief_plans rp ON rp.id = rc.plan_id
      JOIN memberships m ON m.group_id = rp.group_id
        AND m.user_id = auth.uid()
        AND m.role IN ('admin', 'owner')
      WHERE rc.id = relief_payouts.claim_id
    )
  );

-- DELETE: admin/owner only
CREATE POLICY "relief_payouts_delete"
  ON relief_payouts FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM relief_claims rc
      JOIN relief_plans rp ON rp.id = rc.plan_id
      JOIN memberships m ON m.group_id = rp.group_id
        AND m.user_id = auth.uid()
        AND m.role IN ('admin', 'owner')
      WHERE rc.id = relief_payouts.claim_id
    )
  );

GRANT ALL ON relief_payouts TO authenticated;
