-- R-011: hierarchy/report visibility is aggregate by default. Claim details
-- require the claimant's identity or current operational relief.manage access.
-- The S0 policies allowed a suspended admin and general platform staff to
-- read claimant detail through independent OR-combined SELECT policies.
DROP POLICY IF EXISTS "Admins can manage claims" ON public.relief_claims;
DROP POLICY IF EXISTS "Admins can view all claims" ON public.relief_claims;
DROP POLICY IF EXISTS "Members can view own claims" ON public.relief_claims;
DROP POLICY IF EXISTS "Platform staff can view all relief_claims"
  ON public.relief_claims;
DROP POLICY IF EXISTS relief_claims_select ON public.relief_claims;
REVOKE SELECT ON public.relief_claims FROM PUBLIC,anon;
GRANT SELECT ON public.relief_claims TO authenticated;
CREATE POLICY relief_claim_detail_current_scope ON public.relief_claims
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.memberships claimant
      WHERE claimant.id=relief_claims.membership_id
        AND claimant.user_id=auth.uid())
    OR EXISTS (SELECT 1 FROM public.relief_plans plan
      WHERE plan.id=relief_claims.plan_id
        AND public.has_group_permission(plan.group_id,'relief.manage',auth.uid()))
  );
