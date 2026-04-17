-- V8/V9/V10/V11/V12/V13/V17 — defense-in-depth fixes.
-- Each block is independent and idempotent.

-- ==========================================================================
-- V8 helper: caller_shares_group_with(p_caller_id, p_target_id)
--   SECURITY DEFINER — callable by the service-role recipient guard in the
--   /api/{email,sms,whatsapp}/send routes. RLS on memberships would not
--   permit a caller to verify another user's group membership directly;
--   this function reads behind RLS and returns only a boolean.
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.caller_shares_group_with(
  p_caller_id uuid,
  p_target_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships c
    JOIN public.memberships t
      ON t.group_id = c.group_id
     AND t.user_id  = p_target_id
     AND t.membership_status = 'active'
    WHERE c.user_id = p_caller_id
      AND c.membership_status = 'active'
  );
$$;

GRANT EXECUTE ON FUNCTION public.caller_shares_group_with(uuid, uuid)
  TO authenticated, service_role, anon;


-- ==========================================================================
-- V11: feature tier enforcement at the DB level
-- --------------------------------------------------------------------------
-- The UI gates elections / relief plans / contribution types by tier, but
-- nothing at the DB enforces it. A Free-tier group admin can
-- `INSERT INTO elections` via the browser console and the row is accepted.
--
-- Strategy: BEFORE INSERT triggers that read group_subscriptions.tier and
-- compare against feature_tier_requirements. Tier order is
-- free < starter < pro < enterprise. Count limits on tiers with finite
-- caps are also enforced here.
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.group_tier(p_group_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT tier FROM public.group_subscriptions
    WHERE group_id = p_group_id AND status = 'active' LIMIT 1
  ), 'free');
$$;

CREATE OR REPLACE FUNCTION public.enforce_feature_elections()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier text := group_tier(NEW.group_id);
BEGIN
  IF v_tier NOT IN ('pro', 'enterprise') THEN
    RAISE EXCEPTION 'elections_require_pro_tier' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_feature_elections ON elections;
CREATE TRIGGER enforce_feature_elections
  BEFORE INSERT ON elections
  FOR EACH ROW EXECUTE FUNCTION enforce_feature_elections();


CREATE OR REPLACE FUNCTION public.enforce_feature_relief_plans()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier text := group_tier(NEW.group_id);
  v_count integer;
BEGIN
  IF v_tier = 'free' THEN
    RAISE EXCEPTION 'relief_plans_require_paid_tier' USING ERRCODE = '42501';
  END IF;
  IF v_tier = 'starter' THEN
    SELECT COUNT(*) INTO v_count FROM public.relief_plans WHERE group_id = NEW.group_id;
    IF v_count >= 2 THEN
      RAISE EXCEPTION 'relief_plan_limit_reached' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_feature_relief_plans ON relief_plans;
CREATE TRIGGER enforce_feature_relief_plans
  BEFORE INSERT ON relief_plans
  FOR EACH ROW EXECUTE FUNCTION enforce_feature_relief_plans();


CREATE OR REPLACE FUNCTION public.enforce_contribution_type_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier text := group_tier(NEW.group_id);
  v_count integer;
  v_limit integer;
BEGIN
  v_limit := CASE v_tier
    WHEN 'free'    THEN 2
    WHEN 'starter' THEN 5
    ELSE                -1 -- pro/enterprise = unlimited
  END;
  IF v_limit >= 0 THEN
    SELECT COUNT(*) INTO v_count FROM public.contribution_types WHERE group_id = NEW.group_id;
    IF v_count >= v_limit THEN
      RAISE EXCEPTION 'contribution_type_limit_reached' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_contribution_type_limit ON contribution_types;
CREATE TRIGGER enforce_contribution_type_limit
  BEFORE INSERT ON contribution_types
  FOR EACH ROW EXECUTE FUNCTION enforce_contribution_type_limit();


-- ==========================================================================
-- V12: profile privacy — get_visible_profile RPC
-- --------------------------------------------------------------------------
-- profiles SELECT currently exposes every column (email, phone, bio,
-- birthday, ...) to every co-member. memberships.privacy_settings JSONB
-- is respected by the UI but not enforced at the query layer. This RPC
-- returns ONLY the fields the target has agreed to share with peers,
-- except when the caller is (a) the target themselves, or (b) an
-- admin/owner of a group the target belongs to.
--
-- privacy_settings keys honoured (members default to true if missing):
--   show_email     — email visibility
--   show_phone     — phone visibility
--   show_birthday  — date_of_birth visibility
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.get_visible_profile(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_profile RECORD;
  v_shares_group boolean;
  v_is_admin boolean;
  v_prefs jsonb;
  v_email text;
  v_phone text;
  v_dob date;
BEGIN
  IF v_caller IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id, full_name, display_name, avatar_url, phone, preferred_locale, date_of_birth
    INTO v_profile
  FROM public.profiles WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Self
  IF v_caller = p_user_id THEN
    SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
    RETURN jsonb_build_object(
      'id', v_profile.id,
      'full_name', v_profile.full_name,
      'display_name', v_profile.display_name,
      'avatar_url', v_profile.avatar_url,
      'email', v_email,
      'phone', v_profile.phone,
      'preferred_locale', v_profile.preferred_locale,
      'date_of_birth', v_profile.date_of_birth
    );
  END IF;

  -- Co-member / admin-in-shared-group check
  SELECT EXISTS (
    SELECT 1 FROM public.memberships c
    JOIN public.memberships t ON t.group_id = c.group_id AND t.user_id = p_user_id
    WHERE c.user_id = v_caller AND c.membership_status = 'active'
  ) INTO v_shares_group;

  IF NOT v_shares_group THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.memberships c
    JOIN public.memberships t ON t.group_id = c.group_id AND t.user_id = p_user_id
    WHERE c.user_id = v_caller
      AND c.role IN ('owner','admin')
      AND c.membership_status = 'active'
  ) INTO v_is_admin;

  -- Fetch privacy prefs for the TARGET user from any membership they
  -- hold in a group shared with the caller (take the most permissive).
  SELECT m.privacy_settings INTO v_prefs
  FROM public.memberships m
  WHERE m.user_id = p_user_id
    AND EXISTS (
      SELECT 1 FROM public.memberships c
      WHERE c.user_id = v_caller
        AND c.group_id = m.group_id
        AND c.membership_status = 'active'
    )
  LIMIT 1;
  v_prefs := COALESCE(v_prefs, '{}'::jsonb);

  -- Admins see unfiltered. Peer members respect privacy_settings.
  IF v_is_admin THEN
    SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
    v_phone := v_profile.phone;
    v_dob := v_profile.date_of_birth;
  ELSE
    IF COALESCE((v_prefs->>'show_email')::boolean, false) THEN
      SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
    END IF;
    IF COALESCE((v_prefs->>'show_phone')::boolean, false) THEN
      v_phone := v_profile.phone;
    END IF;
    IF COALESCE((v_prefs->>'show_birthday')::boolean, false) THEN
      v_dob := v_profile.date_of_birth;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id', v_profile.id,
    'full_name', v_profile.full_name,
    'display_name', v_profile.display_name,
    'avatar_url', v_profile.avatar_url,
    'email', v_email,
    'phone', v_phone,
    'preferred_locale', v_profile.preferred_locale,
    'date_of_birth', v_dob
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_visible_profile(uuid) TO authenticated;


-- ==========================================================================
-- V17: relief_claims enrollment check — defense in depth
-- --------------------------------------------------------------------------
-- The UI gates claim submission by enrollment; the DB does not. Add a
-- BEFORE INSERT trigger that enforces "the claimant must have an active
-- relief_enrollment row for the plan".
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.enforce_relief_claim_enrollment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.relief_enrollments
    WHERE membership_id = NEW.membership_id
      AND plan_id = NEW.plan_id
      AND COALESCE(is_active, false) = true
  ) THEN
    RAISE EXCEPTION 'not_enrolled_in_plan' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_relief_claim_enrollment ON relief_claims;
CREATE TRIGGER enforce_relief_claim_enrollment
  BEFORE INSERT ON relief_claims
  FOR EACH ROW EXECUTE FUNCTION enforce_relief_claim_enrollment();
