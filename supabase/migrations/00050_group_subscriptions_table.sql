-- ============================================================================
-- Migration 00050: Create group_subscriptions table
-- ============================================================================
-- The useSubscription() hook reads from this table to determine each group's
-- tier. Without it, all groups silently default to "free" because the query
-- fails and the hook falls back.
--
-- This table stores the active subscription for each group.
-- ============================================================================

CREATE TABLE IF NOT EXISTS group_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'starter', 'pro', 'enterprise')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'cancelled', 'expired')),
  billing_period TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_period IN ('monthly', 'yearly')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id)
);

-- Trigger for updated_at
CREATE TRIGGER set_group_subscriptions_updated_at
  BEFORE UPDATE ON group_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE group_subscriptions ENABLE ROW LEVEL SECURITY;

-- Group members can read their group's subscription
CREATE POLICY "Group members can view subscription"
  ON group_subscriptions FOR SELECT
  USING (group_id IN (SELECT get_user_group_ids()));

-- Only group owners/admins can manage subscription
CREATE POLICY "Admins can manage subscription"
  ON group_subscriptions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.group_id = group_subscriptions.group_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
    )
  );

-- Platform staff can manage all subscriptions
CREATE POLICY "Platform staff can manage all subscriptions"
  ON group_subscriptions FOR ALL
  USING (is_platform_staff());
