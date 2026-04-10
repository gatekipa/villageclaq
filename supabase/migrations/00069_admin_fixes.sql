-- ============================================================================
-- Migration 00069: Admin Dashboard P0 Fixes
-- ============================================================================
-- 1. Create platform_config table for settings persistence
-- 2. Update subscription_plans with correct pricing
-- 3. Add slug column to subscription_plans
-- 4. RLS policies for platform_config
-- 5. Add platform_staff write policies for admin API
-- ============================================================================

-- ─── 1. Platform Config (key-value store for global settings) ───────────────

CREATE TABLE IF NOT EXISTS platform_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE platform_config ENABLE ROW LEVEL SECURITY;

-- Platform staff can read all config
CREATE POLICY "Platform staff can view config"
  ON platform_config FOR SELECT
  USING (is_platform_staff());

-- Platform staff can upsert config
CREATE POLICY "Platform staff can manage config"
  ON platform_config FOR ALL
  USING (is_platform_staff());

GRANT ALL ON platform_config TO authenticated;

-- Seed default config values
INSERT INTO platform_config (key, value) VALUES
  ('general', '{"platformName": "VillageClaq", "supportEmail": "support@villageclaq.com", "description": "", "defaultLanguage": "en", "defaultTimezone": "Africa/Douala", "defaultCurrency": "XAF", "dateFormat": "DD/MM/YYYY", "userRegistration": true, "groupCreation": true, "maintenanceMode": false}'),
  ('branding', '{"primaryColor": "#10b981", "secondaryColor": "#1a4155", "accentColor": "#14b8a6"}'),
  ('notifications', '{"emailNotifs": true, "smsNotifs": false, "whatsappNotifs": false, "inAppNotifs": true, "adminAlerts": true}'),
  ('security', '{"sessionTimeout": 60, "maxLoginAttempts": 5, "twoFactor": false, "passwordComplexity": true, "passwordExpiry": 90}')
ON CONFLICT (key) DO NOTHING;

-- ─── 2. Add slug column to subscription_plans if not exists ─────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_plans' AND column_name = 'slug'
  ) THEN
    ALTER TABLE subscription_plans ADD COLUMN slug TEXT;
  END IF;
END $$;

-- ─── 3. Update subscription_plans with correct pricing ──────────────────────
-- Correct: Free $0/15 members, Starter $5/50, Pro $15/200, Enterprise $40/unlimited

UPDATE subscription_plans SET
  price = 0,
  member_limit = 15,
  group_limit = 1,
  slug = 'free',
  features = '["Up to 15 members", "Basic contribution tracking", "Meeting minutes", "1 group"]'
WHERE name = 'Free';

UPDATE subscription_plans SET
  price = 5,
  member_limit = 50,
  group_limit = 3,
  slug = 'starter',
  features = '["Up to 50 members", "Full contribution tracking", "Attendance & hosting", "Reports", "3 groups", "Email support"]'
WHERE name = 'Starter';

UPDATE subscription_plans SET
  price = 15,
  member_limit = 200,
  group_limit = 10,
  slug = 'pro',
  features = '["Up to 200 members", "All features", "Relief plans", "Enterprise dashboard", "10 groups", "Priority support", "API access"]'
WHERE name = 'Pro';

UPDATE subscription_plans SET
  price = 40,
  member_limit = NULL,
  group_limit = 999,
  slug = 'enterprise',
  features = '["Unlimited members", "Unlimited groups", "Custom branding", "Dedicated support", "SLA guarantee", "Custom integrations"]'
WHERE name = 'Enterprise';

-- ─── 4. Ensure platform_staff has proper write policies for admin API ───────
-- The admin API uses service role key (bypasses RLS), but we also need
-- platform staff to be able to write audit logs via their own session.

-- Allow all platform staff to INSERT audit logs (not just admin/super_admin)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'All staff can create audit logs'
    AND tablename = 'platform_audit_logs'
  ) THEN
    CREATE POLICY "All staff can create audit logs"
      ON platform_audit_logs FOR INSERT
      WITH CHECK (is_platform_staff());
  END IF;
END $$;

-- ─── 5. Ensure platform staff can read group_subscriptions ──────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Platform staff can view all group_subscriptions'
    AND tablename = 'group_subscriptions'
  ) THEN
    CREATE POLICY "Platform staff can view all group_subscriptions"
      ON group_subscriptions FOR SELECT
      USING (is_platform_staff());
  END IF;
END $$;

-- ─── 6. Ensure platform_config trigger for updated_at ───────────────────────
CREATE OR REPLACE FUNCTION update_platform_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_platform_config_updated_at ON platform_config;
CREATE TRIGGER set_platform_config_updated_at
  BEFORE UPDATE ON platform_config
  FOR EACH ROW EXECUTE FUNCTION update_platform_config_timestamp();
