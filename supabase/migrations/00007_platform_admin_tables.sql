-- ============================================================
-- Phase 7: Platform Admin Tables
-- SaaS owner dashboard, staff RBAC, subscriptions, content
-- ============================================================

-- ==================== ENUM TYPES ====================

CREATE TYPE platform_role AS ENUM ('super_admin', 'admin', 'support', 'sales', 'finance');
CREATE TYPE plan_billing_period AS ENUM ('monthly', 'annual');
CREATE TYPE voucher_discount_type AS ENUM ('percent', 'flat');
CREATE TYPE enquiry_status AS ENUM ('new', 'in_progress', 'resolved');

-- ==================== PLATFORM STAFF ====================

CREATE TABLE platform_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role platform_role NOT NULL DEFAULT 'support',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

CREATE INDEX idx_platform_staff_user ON platform_staff(user_id);
CREATE INDEX idx_platform_staff_role ON platform_staff(role);

-- ==================== SUBSCRIPTION PLANS ====================

CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_fr TEXT,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  billing_period plan_billing_period NOT NULL DEFAULT 'monthly',
  features JSONB NOT NULL DEFAULT '[]',
  member_limit INTEGER,
  group_limit INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==================== VOUCHERS ====================

CREATE TABLE vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  discount_type voucher_discount_type NOT NULL DEFAULT 'percent',
  discount_value NUMERIC(10,2) NOT NULL,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ,
  max_uses INTEGER,
  current_uses INTEGER NOT NULL DEFAULT 0,
  applicable_plans JSONB DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vouchers_code ON vouchers(code);
CREATE INDEX idx_vouchers_active ON vouchers(is_active);

-- ==================== VOUCHER USAGE ====================

CREATE TABLE voucher_usages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id UUID NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  used_by UUID NOT NULL REFERENCES profiles(id),
  used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_voucher_usages_voucher ON voucher_usages(voucher_id);

-- ==================== CONTACT ENQUIRIES ====================

CREATE TABLE contact_enquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT,
  message TEXT NOT NULL,
  status enquiry_status NOT NULL DEFAULT 'new',
  assigned_to UUID REFERENCES platform_staff(id),
  reply TEXT,
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contact_enquiries_status ON contact_enquiries(status);

-- ==================== PLATFORM AUDIT LOG ====================

CREATE TABLE platform_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES platform_staff(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_staff ON platform_audit_logs(staff_id);
CREATE INDEX idx_audit_logs_action ON platform_audit_logs(action);
CREATE INDEX idx_audit_logs_created ON platform_audit_logs(created_at DESC);

-- ==================== TRIGGERS ====================

CREATE TRIGGER set_platform_staff_updated_at BEFORE UPDATE ON platform_staff FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_subscription_plans_updated_at BEFORE UPDATE ON subscription_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_vouchers_updated_at BEFORE UPDATE ON vouchers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_contact_enquiries_updated_at BEFORE UPDATE ON contact_enquiries FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ==================== ROW LEVEL SECURITY ====================

ALTER TABLE platform_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE voucher_usages ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper function: check if user is platform staff
CREATE OR REPLACE FUNCTION is_platform_staff(check_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform_staff
    WHERE user_id = check_user_id AND is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_platform_super_admin(check_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform_staff
    WHERE user_id = check_user_id AND role = 'super_admin' AND is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Platform staff: only super_admin can manage, staff can see themselves
CREATE POLICY "Staff can view own record" ON platform_staff FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Super admin can manage staff" ON platform_staff FOR ALL USING (is_platform_super_admin());

-- Subscription plans: public read, staff manage
CREATE POLICY "Anyone can view active plans" ON subscription_plans FOR SELECT USING (is_active = true);
CREATE POLICY "Staff can manage plans" ON subscription_plans FOR ALL USING (is_platform_staff());

-- Vouchers: staff only
CREATE POLICY "Staff can view vouchers" ON vouchers FOR SELECT USING (is_platform_staff());
CREATE POLICY "Staff can manage vouchers" ON vouchers FOR ALL USING (is_platform_staff());

-- Voucher usages: staff can view
CREATE POLICY "Staff can view voucher usages" ON voucher_usages FOR SELECT USING (is_platform_staff());

-- Contact enquiries: public can insert, staff can manage
CREATE POLICY "Anyone can submit enquiry" ON contact_enquiries FOR INSERT WITH CHECK (true);
CREATE POLICY "Staff can view enquiries" ON contact_enquiries FOR SELECT USING (is_platform_staff());
CREATE POLICY "Staff can manage enquiries" ON contact_enquiries FOR UPDATE USING (is_platform_staff());

-- Audit logs: super_admin and admin can view (immutable - no update/delete)
CREATE POLICY "Admin staff can view audit logs" ON platform_audit_logs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM platform_staff
    WHERE user_id = auth.uid() AND role IN ('super_admin', 'admin') AND is_active = true
  ));
CREATE POLICY "Staff actions create audit logs" ON platform_audit_logs FOR INSERT WITH CHECK (is_platform_staff());

-- ==================== SEED DATA ====================

-- Seed subscription plans
INSERT INTO subscription_plans (name, name_fr, price, billing_period, features, member_limit, group_limit, sort_order) VALUES
  ('Free', 'Gratuit', 0, 'monthly', '["Up to 15 members", "Basic contribution tracking", "Meeting minutes", "1 group"]', 15, 1, 1),
  ('Starter', 'Débutant', 10, 'monthly', '["Up to 100 members", "Full contribution tracking", "Attendance & hosting", "Reports", "3 groups", "Email support"]', 100, 3, 2),
  ('Pro', 'Professionnel', 25, 'monthly', '["Up to 500 members", "All features", "Relief plans", "Enterprise dashboard", "10 groups", "Priority support", "API access"]', 500, 10, 3),
  ('Enterprise', 'Entreprise', 0, 'monthly', '["Unlimited members", "Unlimited groups", "Custom branding", "Dedicated support", "SLA guarantee", "Custom integrations"]', NULL, 999, 4);
