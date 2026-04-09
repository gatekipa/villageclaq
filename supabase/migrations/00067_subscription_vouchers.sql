-- ============================================================================
-- Migration 00067: Subscription Vouchers System
-- ============================================================================
-- PRIMARY revenue mechanism for VillageClaq in Africa.
-- Admin generates voucher codes → sells via cash/MoMo → buyer redeems in-app.
-- This replaces the old discount-based voucher system with subscription upgrades.
-- ============================================================================

-- ==================== SUBSCRIPTION VOUCHERS TABLE ====================

CREATE TABLE IF NOT EXISTS subscription_vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The 8-char alphanumeric code (no O/0/I/1 confusion)
  code TEXT NOT NULL UNIQUE,

  -- Which tier this voucher upgrades to
  tier TEXT NOT NULL CHECK (tier IN ('starter', 'pro', 'enterprise')),

  -- How many days the subscription lasts from redemption
  duration_days INTEGER NOT NULL DEFAULT 30 CHECK (duration_days > 0),

  -- Usage limits
  max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses > 0),
  current_uses INTEGER NOT NULL DEFAULT 0 CHECK (current_uses >= 0),

  -- Status lifecycle: active → used/expired/revoked
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired', 'revoked')),

  -- Audit trail: JSONB array of { group_id, group_name, redeemed_by, redeemed_at }
  used_by_groups JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Optional admin notes (e.g. "Sold to Cyril for 5000 FCFA cash")
  notes TEXT,

  -- Expiry: voucher becomes invalid after this date (NULL = never expires)
  expires_at TIMESTAMPTZ,

  -- Who created this voucher (platform staff)
  created_by UUID REFERENCES profiles(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_sub_vouchers_code ON subscription_vouchers(code);
CREATE INDEX idx_sub_vouchers_status ON subscription_vouchers(status);
CREATE INDEX idx_sub_vouchers_tier ON subscription_vouchers(tier);

-- Auto-update updated_at
CREATE TRIGGER set_subscription_vouchers_updated_at
  BEFORE UPDATE ON subscription_vouchers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ==================== RLS POLICIES ====================

ALTER TABLE subscription_vouchers ENABLE ROW LEVEL SECURITY;

-- Platform staff can do everything
CREATE POLICY "Platform staff full access to subscription_vouchers"
  ON subscription_vouchers FOR ALL
  USING (is_platform_staff());

-- Authenticated users can look up active vouchers by code (for redemption)
CREATE POLICY "Authenticated users can look up vouchers by code"
  ON subscription_vouchers FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ==================== REDEEM VOUCHER RPC ====================
-- Atomic: validates → updates voucher → upserts group_subscriptions
-- SECURITY DEFINER to bypass RLS for cross-table writes

CREATE OR REPLACE FUNCTION redeem_voucher(
  p_code TEXT,
  p_group_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_voucher RECORD;
  v_user_id UUID;
  v_group_name TEXT;
  v_membership RECORD;
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
  v_audit_entry JSONB;
BEGIN
  -- Get calling user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHENTICATED');
  END IF;

  -- Verify user is owner/admin of the group
  SELECT id, role INTO v_membership
  FROM memberships
  WHERE group_id = p_group_id
    AND user_id = v_user_id
    AND role IN ('owner', 'admin')
  LIMIT 1;

  IF v_membership IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
  END IF;

  -- Lock and fetch the voucher
  SELECT * INTO v_voucher
  FROM subscription_vouchers
  WHERE UPPER(code) = UPPER(TRIM(p_code))
  FOR UPDATE;

  IF v_voucher IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'VOUCHER_NOT_FOUND');
  END IF;

  -- Check status
  IF v_voucher.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'VOUCHER_NOT_ACTIVE',
      'detail', v_voucher.status);
  END IF;

  -- Check expiry
  IF v_voucher.expires_at IS NOT NULL AND v_voucher.expires_at < now() THEN
    -- Auto-expire it
    UPDATE subscription_vouchers SET status = 'expired' WHERE id = v_voucher.id;
    RETURN jsonb_build_object('success', false, 'error', 'VOUCHER_EXPIRED');
  END IF;

  -- Check usage limit
  IF v_voucher.current_uses >= v_voucher.max_uses THEN
    UPDATE subscription_vouchers SET status = 'used' WHERE id = v_voucher.id;
    RETURN jsonb_build_object('success', false, 'error', 'VOUCHER_USED_UP');
  END IF;

  -- Check if this group already redeemed this specific voucher
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_voucher.used_by_groups) AS elem
    WHERE elem->>'group_id' = p_group_id::text
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'ALREADY_REDEEMED_BY_GROUP');
  END IF;

  -- Get group name for audit trail
  SELECT name INTO v_group_name FROM groups WHERE id = p_group_id;

  -- Calculate subscription period
  v_period_start := now();
  v_period_end := now() + (v_voucher.duration_days || ' days')::interval;

  -- Build audit entry
  v_audit_entry := jsonb_build_object(
    'group_id', p_group_id,
    'group_name', v_group_name,
    'redeemed_by', v_user_id,
    'redeemed_at', now()
  );

  -- Upsert group_subscriptions
  INSERT INTO group_subscriptions (group_id, tier, status, billing_period, current_period_start, current_period_end)
  VALUES (p_group_id, v_voucher.tier, 'active', 'monthly', v_period_start, v_period_end)
  ON CONFLICT (group_id) DO UPDATE SET
    tier = v_voucher.tier,
    status = 'active',
    current_period_start = v_period_start,
    current_period_end = v_period_end,
    updated_at = now();

  -- Update voucher usage
  UPDATE subscription_vouchers
  SET
    current_uses = current_uses + 1,
    used_by_groups = used_by_groups || v_audit_entry,
    status = CASE
      WHEN current_uses + 1 >= max_uses THEN 'used'
      ELSE 'active'
    END
  WHERE id = v_voucher.id;

  RETURN jsonb_build_object(
    'success', true,
    'tier', v_voucher.tier,
    'duration_days', v_voucher.duration_days,
    'period_start', v_period_start,
    'period_end', v_period_end
  );
END;
$$;
