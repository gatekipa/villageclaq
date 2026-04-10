-- ============================================================================
-- Migration 00070: Admin Dashboard P1 Fixes
-- ============================================================================
-- 1. Create platform_permissions table for staff role permission matrix
-- 2. Platform staff RLS for notifications_queue reads
-- 3. Seed default permission matrix
-- ============================================================================

-- ─── 1. Platform Permissions Table ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform_permissions (
  permission_key TEXT PRIMARY KEY,
  roles_allowed TEXT[] NOT NULL DEFAULT '{}',
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES profiles(id)
);

ALTER TABLE platform_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform staff can view permissions"
  ON platform_permissions FOR SELECT
  USING (is_platform_staff());

CREATE POLICY "Platform staff can manage permissions"
  ON platform_permissions FOR ALL
  USING (is_platform_staff());

GRANT ALL ON platform_permissions TO authenticated;

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_platform_permissions_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_platform_permissions_updated_at ON platform_permissions;
CREATE TRIGGER set_platform_permissions_updated_at
  BEFORE UPDATE ON platform_permissions
  FOR EACH ROW EXECUTE FUNCTION update_platform_permissions_timestamp();

-- ─── 2. Seed default permissions ────────────────────────────────────────────
-- super_admin always has all (enforced in UI). Only non-super_admin roles stored.

INSERT INTO platform_permissions (permission_key, roles_allowed, description) VALUES
  -- Platform Overview
  ('view_dashboard', ARRAY['admin','support','sales','finance'], 'View admin dashboard'),
  ('view_analytics', ARRAY['admin','support','sales','finance'], 'View usage analytics'),
  ('view_usage_stats', ARRAY['admin','support','sales','finance'], 'View platform usage statistics'),
  -- Users & Groups
  ('view_groups', ARRAY['admin','support','sales','finance'], 'View all groups'),
  ('manage_groups', ARRAY['admin'], 'Create, edit, suspend groups'),
  ('view_users', ARRAY['admin','support','sales','finance'], 'View all users'),
  ('manage_users', ARRAY['admin'], 'Suspend, activate, delete users'),
  ('export_data', ARRAY['admin','finance'], 'Export user and group data'),
  -- Financial Controls
  ('view_transactions', ARRAY['admin','support','sales','finance'], 'View transactions'),
  ('export_transactions', ARRAY['admin','finance'], 'Export transaction data'),
  ('manage_subscriptions', ARRAY['admin','sales'], 'Manage subscription plans'),
  ('manage_vouchers', ARRAY['admin','sales'], 'Create and manage vouchers'),
  ('flag_anomalies', ARRAY['admin','finance'], 'Flag suspicious transactions'),
  -- Reports
  ('view_reports', ARRAY['admin','support','sales','finance'], 'View platform reports'),
  ('export_reports', ARRAY['admin','finance'], 'Export report data'),
  -- System Configuration
  ('edit_settings', ARRAY['admin'], 'Edit global platform settings'),
  ('manage_notifications', ARRAY['admin'], 'Manage notification settings'),
  ('view_security', ARRAY['admin'], 'View security and data settings'),
  -- Content Management
  ('manage_testimonials', ARRAY['admin'], 'Manage testimonials'),
  ('manage_faqs', ARRAY['admin'], 'Manage FAQs'),
  ('manage_enquiries', ARRAY['admin','support'], 'Manage contact enquiries'),
  -- Access Control
  ('manage_staff', ARRAY[]::TEXT[], 'Add, remove, change staff roles'),
  ('edit_permissions', ARRAY[]::TEXT[], 'Edit role permission matrix'),
  ('view_audit_log', ARRAY['admin','finance'], 'View platform audit log')
ON CONFLICT (permission_key) DO NOTHING;

-- ─── 3. Ensure platform staff can read notifications_queue ──────────────────
-- Policy already exists from 00012 but ensure it's there
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Platform staff can view all notifications_queue'
    AND tablename = 'notifications_queue'
  ) THEN
    CREATE POLICY "Platform staff can view all notifications_queue"
      ON notifications_queue FOR SELECT
      USING (is_platform_staff());
  END IF;
END $$;

-- ─── 4. Add platform_permissions to admin mutate allowlist ──────────────────
-- (Handled in application code — /api/admin/mutate route.ts allowlist)
