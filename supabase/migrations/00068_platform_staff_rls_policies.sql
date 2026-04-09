-- ============================================================================
-- Migration 00068: Platform Staff RLS Policies for Admin Dashboard
-- ============================================================================
-- The super admin dashboard pages use createClient() (anon key) on the client.
-- Without these policies, RLS restricts admin users to only seeing data from
-- groups they belong to. Platform staff need read access to ALL data.
-- ============================================================================

-- ── Groups ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Platform staff can view all groups' AND tablename = 'groups'
  ) THEN
    CREATE POLICY "Platform staff can view all groups"
      ON groups FOR SELECT
      USING (is_platform_staff());
  END IF;
END $$;

-- ── Profiles ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Platform staff can view all profiles' AND tablename = 'profiles'
  ) THEN
    CREATE POLICY "Platform staff can view all profiles"
      ON profiles FOR SELECT
      USING (is_platform_staff());
  END IF;
END $$;

-- ── Memberships ──────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Platform staff can view all memberships' AND tablename = 'memberships'
  ) THEN
    CREATE POLICY "Platform staff can view all memberships"
      ON memberships FOR SELECT
      USING (is_platform_staff());
  END IF;
END $$;

-- ── Payments ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Platform staff can view all payments' AND tablename = 'payments'
  ) THEN
    CREATE POLICY "Platform staff can view all payments"
      ON payments FOR SELECT
      USING (is_platform_staff());
  END IF;
END $$;

-- ── Events ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Platform staff can view all events' AND tablename = 'events'
  ) THEN
    CREATE POLICY "Platform staff can view all events"
      ON events FOR SELECT
      USING (is_platform_staff());
  END IF;
END $$;

-- ── Event Attendances ────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Platform staff can view all event_attendances' AND tablename = 'event_attendances'
  ) THEN
    CREATE POLICY "Platform staff can view all event_attendances"
      ON event_attendances FOR SELECT
      USING (is_platform_staff());
  END IF;
END $$;

-- ── Contribution Types ───────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Platform staff can view all contribution_types' AND tablename = 'contribution_types'
  ) THEN
    CREATE POLICY "Platform staff can view all contribution_types"
      ON contribution_types FOR SELECT
      USING (is_platform_staff());
  END IF;
END $$;

-- ── Contribution Obligations ─────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Platform staff can view all contribution_obligations' AND tablename = 'contribution_obligations'
  ) THEN
    CREATE POLICY "Platform staff can view all contribution_obligations"
      ON contribution_obligations FOR SELECT
      USING (is_platform_staff());
  END IF;
END $$;

-- ── Notifications ────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Platform staff can view all notifications' AND tablename = 'notifications'
  ) THEN
    CREATE POLICY "Platform staff can view all notifications"
      ON notifications FOR SELECT
      USING (is_platform_staff());
  END IF;
END $$;

-- ── Relief Plans ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Platform staff can view all relief_plans' AND tablename = 'relief_plans'
  ) THEN
    CREATE POLICY "Platform staff can view all relief_plans"
      ON relief_plans FOR SELECT
      USING (is_platform_staff());
  END IF;
END $$;

-- ── Relief Claims ────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Platform staff can view all relief_claims' AND tablename = 'relief_claims'
  ) THEN
    CREATE POLICY "Platform staff can view all relief_claims"
      ON relief_claims FOR SELECT
      USING (is_platform_staff());
  END IF;
END $$;

-- ── Disputes ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Platform staff can view all disputes' AND tablename = 'disputes'
  ) THEN
    CREATE POLICY "Platform staff can view all disputes"
      ON disputes FOR SELECT
      USING (is_platform_staff());
  END IF;
END $$;

-- ── Documents ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Platform staff can view all documents' AND tablename = 'documents'
  ) THEN
    CREATE POLICY "Platform staff can view all documents"
      ON documents FOR SELECT
      USING (is_platform_staff());
  END IF;
END $$;

-- ── Savings Cycles ───────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Platform staff can view all savings_cycles' AND tablename = 'savings_cycles'
  ) THEN
    CREATE POLICY "Platform staff can view all savings_cycles"
      ON savings_cycles FOR SELECT
      USING (is_platform_staff());
  END IF;
END $$;

-- ── Announcements ────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Platform staff can view all announcements' AND tablename = 'announcements'
  ) THEN
    CREATE POLICY "Platform staff can view all announcements"
      ON announcements FOR SELECT
      USING (is_platform_staff());
  END IF;
END $$;

-- ── Fines ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Platform staff can view all fines' AND tablename = 'fines'
  ) THEN
    CREATE POLICY "Platform staff can view all fines"
      ON fines FOR SELECT
      USING (is_platform_staff());
  END IF;
END $$;

-- ── Elections ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Platform staff can view all elections' AND tablename = 'elections'
  ) THEN
    CREATE POLICY "Platform staff can view all elections"
      ON elections FOR SELECT
      USING (is_platform_staff());
  END IF;
END $$;

-- ── Activity Feed ────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Platform staff can view all activity_feed' AND tablename = 'activity_feed'
  ) THEN
    CREATE POLICY "Platform staff can view all activity_feed"
      ON activity_feed FOR SELECT
      USING (is_platform_staff());
  END IF;
END $$;

-- ── Group Subscriptions (already has a policy but ensure SELECT is covered) ──
-- Already exists from migration 00050: "Platform staff can manage all subscriptions"

-- ── Platform Audit Logs (ensure staff can read all) ──────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Platform staff can view all audit logs' AND tablename = 'platform_audit_logs'
  ) THEN
    CREATE POLICY "Platform staff can view all audit logs"
      ON platform_audit_logs FOR SELECT
      USING (is_platform_staff());
  END IF;
END $$;

-- ── Organizations (if exists) ────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organizations') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE policyname = 'Platform staff can view all organizations' AND tablename = 'organizations'
    ) THEN
      CREATE POLICY "Platform staff can view all organizations"
        ON organizations FOR SELECT
        USING (is_platform_staff());
    END IF;
  END IF;
END $$;

-- ── Relief Payouts (if exists) ───────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'relief_payouts') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE policyname = 'Platform staff can view all relief_payouts' AND tablename = 'relief_payouts'
    ) THEN
      CREATE POLICY "Platform staff can view all relief_payouts"
        ON relief_payouts FOR SELECT
        USING (is_platform_staff());
    END IF;
  END IF;
END $$;

-- ============================================================================
-- Also create a get_platform_stats() RPC for the dashboard summary
-- This provides a single efficient call for all dashboard metrics
-- ============================================================================

CREATE OR REPLACE FUNCTION get_platform_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_now TIMESTAMPTZ := now();
  v_30d TIMESTAMPTZ := now() - interval '30 days';
  v_60d TIMESTAMPTZ := now() - interval '60 days';
BEGIN
  -- Only platform staff can call this
  IF NOT is_platform_staff() THEN
    RETURN jsonb_build_object('error', 'NOT_AUTHORIZED');
  END IF;

  SELECT jsonb_build_object(
    'active_groups', (SELECT COUNT(*) FROM groups WHERE is_active = true),
    'total_groups', (SELECT COUNT(*) FROM groups),
    'total_users', (SELECT COUNT(*) FROM profiles),
    'payments_30d', (SELECT COUNT(*) FROM payments WHERE recorded_at >= v_30d),
    'revenue_30d', (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE recorded_at >= v_30d),
    'payments_prev_30d', (SELECT COUNT(*) FROM payments WHERE recorded_at >= v_60d AND recorded_at < v_30d),
    'revenue_prev_30d', (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE recorded_at >= v_60d AND recorded_at < v_30d),
    'active_subscriptions', (SELECT COUNT(*) FROM group_subscriptions WHERE status = 'active'),
    'pending_payments', (SELECT COUNT(*) FROM payments WHERE status = 'pending'),
    'events_30d', (SELECT COUNT(*) FROM events WHERE created_at >= v_30d),
    'prev_users', (SELECT COUNT(*) FROM profiles WHERE created_at < v_30d),
    'prev_groups', (SELECT COUNT(*) FROM groups WHERE is_active = true AND created_at < v_30d),
    'vouchers_active', (SELECT COUNT(*) FROM subscription_vouchers WHERE status = 'active'),
    'vouchers_redeemed', (SELECT COALESCE(SUM(current_uses), 0) FROM subscription_vouchers)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_platform_stats() TO authenticated;
