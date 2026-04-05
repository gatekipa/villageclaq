-- ================================================
-- MIGRATION 00063: Phone sync trigger + member limit trigger
-- Item 1: Add phone column to memberships for non-proxy member sync
-- Item 2: AFTER UPDATE trigger on profiles syncs phone to memberships
-- Item 3: check_member_limit() SECURITY DEFINER function
-- Item 4: BEFORE INSERT trigger on memberships enforces tier limits
-- Run in Supabase SQL Editor
-- ================================================


-- ── Part 0: Add phone column to memberships ─────────────────────────────────
-- For non-proxy real members, phone is kept in sync with profiles.phone.
-- Proxy members continue using privacy_settings->>'proxy_phone'.

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT NULL;

GRANT ALL ON public.memberships TO authenticated;


-- ── Part 1: Phone sync trigger ───────────────────────────────────────────────
-- When a real user updates profiles.phone, propagate to all their
-- non-exited memberships so notification routing never needs an extra join.

CREATE OR REPLACE FUNCTION public.sync_profile_phone_to_memberships()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.phone IS DISTINCT FROM OLD.phone THEN
    UPDATE public.memberships
    SET    phone      = NEW.phone,
           updated_at = NOW()
    WHERE  user_id          = NEW.id
      AND  is_proxy         = false
      AND  membership_status != 'exited';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_phone ON public.profiles;
CREATE TRIGGER trg_sync_profile_phone
  AFTER UPDATE OF phone ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_profile_phone_to_memberships();

GRANT EXECUTE ON FUNCTION public.sync_profile_phone_to_memberships() TO authenticated;


-- ── Part 2: check_member_limit() function ────────────────────────────────────
-- Called BEFORE INSERT on memberships to enforce subscription tier limits.
-- Tier limits must match src/lib/subscription-tiers.ts (free=15, starter=50,
-- pro=200, enterprise=unlimited).
-- Exception message starts with "member_limit_reached:" so the client can
-- detect it and show a user-friendly message instead of a raw error.

CREATE OR REPLACE FUNCTION public.check_member_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier  TEXT;
  v_limit INTEGER;
  v_count INTEGER;
BEGIN
  -- Exited rows should never appear on INSERT, but be defensive.
  IF NEW.membership_status = 'exited' THEN
    RETURN NEW;
  END IF;

  -- Resolve this group's active subscription tier (defaults to 'free').
  SELECT tier INTO v_tier
  FROM   public.group_subscriptions
  WHERE  group_id = NEW.group_id
    AND  status   = 'active'
  LIMIT  1;

  v_tier := COALESCE(v_tier, 'free');

  -- Enterprise is always unlimited — skip the check entirely.
  IF v_tier = 'enterprise' THEN
    RETURN NEW;
  END IF;

  -- Map tier name → member limit (mirrors subscription-tiers.ts constants).
  v_limit := CASE v_tier
    WHEN 'free'    THEN 15
    WHEN 'starter' THEN 50
    WHEN 'pro'     THEN 200
    ELSE                15  -- unknown tier → treat as free
  END;

  -- Count active + pending_approval members already in this group.
  -- Exited members do NOT count toward the limit.
  SELECT COUNT(*) INTO v_count
  FROM   public.memberships
  WHERE  group_id         = NEW.group_id
    AND  membership_status IN ('active', 'pending_approval');

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'member_limit_reached: % members allowed on % plan', v_limit, v_tier
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

-- ── Part 3: BEFORE INSERT trigger on memberships ─────────────────────────────

DROP TRIGGER IF EXISTS trg_check_member_limit ON public.memberships;
CREATE TRIGGER trg_check_member_limit
  BEFORE INSERT ON public.memberships
  FOR EACH ROW
  EXECUTE FUNCTION check_member_limit();

GRANT EXECUTE ON FUNCTION public.check_member_limit() TO authenticated;


-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
