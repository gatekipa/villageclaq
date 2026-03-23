-- ============================================================
-- Phase 11: Stickiness Features
-- Activity feed, reminders, fines, loans, projects, badges, photos
-- ============================================================

-- ==================== ACTIVITY FEED ====================

CREATE TABLE activity_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  actor_membership_id UUID REFERENCES memberships(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL, -- payment_made, event_created, member_joined, minutes_published, etc.
  entity_type TEXT, -- payment, event, membership, meeting_minutes, etc.
  entity_id UUID,
  message TEXT NOT NULL,
  message_fr TEXT,
  metadata JSONB DEFAULT '{}',
  pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_feed_group ON activity_feed(group_id, created_at DESC);
CREATE INDEX idx_activity_feed_pinned ON activity_feed(group_id, pinned) WHERE pinned = true;

CREATE TABLE feed_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_item_id UUID NOT NULL REFERENCES activity_feed(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL, -- emoji: 👍 ❤️ 🎉
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(feed_item_id, membership_id, reaction)
);

CREATE INDEX idx_feed_reactions_item ON feed_reactions(feed_item_id);

-- ==================== PAYMENT REMINDER RULES ====================

CREATE TYPE reminder_severity AS ENUM ('gentle', 'firm', 'warning', 'critical', 'suspension');

CREATE TABLE payment_reminder_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  days_after_due INTEGER NOT NULL,
  severity reminder_severity NOT NULL DEFAULT 'gentle',
  auto_change_standing BOOLEAN NOT NULL DEFAULT false,
  new_standing membership_standing,
  message_template TEXT NOT NULL,
  message_template_fr TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payment_reminders_sent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES payment_reminder_rules(id) ON DELETE CASCADE,
  obligation_id UUID NOT NULL REFERENCES contribution_obligations(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'in_app',
  responded BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reminders_sent_obligation ON payment_reminders_sent(obligation_id);

-- ==================== FINES ====================

CREATE TYPE fine_trigger AS ENUM ('late_attendance', 'missed_attendance', 'late_payment', 'missed_hosting', 'custom');
CREATE TYPE fine_status AS ENUM ('pending', 'paid', 'waived', 'disputed');

CREATE TABLE fine_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  trigger_type fine_trigger NOT NULL,
  amount NUMERIC(12,2),
  percentage NUMERIC(5,2),
  description TEXT,
  description_fr TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE fines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES fine_rules(id) ON DELETE SET NULL,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL,
  status fine_status NOT NULL DEFAULT 'pending',
  dispute_reason TEXT,
  resolved_by UUID REFERENCES profiles(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fines_membership ON fines(membership_id);
CREATE INDEX idx_fines_group ON fines(group_id);

-- ==================== EVENT PHOTOS ====================

CREATE TABLE event_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_photos_event ON event_photos(event_id);

-- ==================== LOANS ====================

CREATE TYPE loan_status AS ENUM ('pending', 'approved', 'denied', 'active', 'repaid', 'defaulted');

CREATE TABLE loan_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  reason TEXT,
  repayment_months INTEGER NOT NULL DEFAULT 3,
  interest_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  status loan_status NOT NULL DEFAULT 'pending',
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  disbursed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_loans_group ON loan_requests(group_id);
CREATE INDEX idx_loans_membership ON loan_requests(membership_id);

CREATE TABLE loan_repayments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES loan_requests(id) ON DELETE CASCADE,
  amount_due NUMERIC(12,2) NOT NULL,
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  paid_at TIMESTAMPTZ,
  status obligation_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_loan_repayments_loan ON loan_repayments(loan_id);

-- ==================== PROJECTS ====================

CREATE TYPE project_status AS ENUM ('planning', 'active', 'completed', 'paused');

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_fr TEXT,
  description TEXT,
  target_amount NUMERIC(12,2),
  currency TEXT NOT NULL DEFAULT 'XAF',
  deadline DATE,
  status project_status NOT NULL DEFAULT 'planning',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_group ON projects(group_id);

CREATE TABLE project_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  payment_method payment_method NOT NULL DEFAULT 'cash',
  reference TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE project_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  receipt_url TEXT,
  approved_by UUID REFERENCES profiles(id),
  spent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE project_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  title_fr TEXT,
  description TEXT,
  target_date DATE,
  completed_at TIMESTAMPTZ,
  photo_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==================== BADGES ====================

CREATE TABLE badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_fr TEXT,
  description TEXT,
  description_fr TEXT,
  icon TEXT NOT NULL, -- emoji
  criteria_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE member_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  shared BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(membership_id, badge_id)
);

CREATE INDEX idx_member_badges_membership ON member_badges(membership_id);

-- ==================== ADD DOB TO PROFILES ====================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- ==================== TRIGGERS ====================

CREATE TRIGGER set_payment_reminder_rules_updated_at BEFORE UPDATE ON payment_reminder_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_fine_rules_updated_at BEFORE UPDATE ON fine_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_fines_updated_at BEFORE UPDATE ON fines FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_loan_requests_updated_at BEFORE UPDATE ON loan_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ==================== ROW LEVEL SECURITY ====================

ALTER TABLE activity_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_reminder_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_reminders_sent ENABLE ROW LEVEL SECURITY;
ALTER TABLE fine_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE fines ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_repayments ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_badges ENABLE ROW LEVEL SECURITY;

-- RLS: inline EXISTS queries (no helper functions needed)

-- Activity Feed
CREATE POLICY "Members view feed" ON activity_feed FOR SELECT USING (
  EXISTS (SELECT 1 FROM memberships WHERE memberships.group_id = activity_feed.group_id AND memberships.user_id = auth.uid())
);
CREATE POLICY "Members insert feed" ON activity_feed FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM memberships WHERE memberships.group_id = activity_feed.group_id AND memberships.user_id = auth.uid())
);
CREATE POLICY "Admin update feed" ON activity_feed FOR UPDATE USING (
  EXISTS (SELECT 1 FROM memberships WHERE memberships.group_id = activity_feed.group_id AND memberships.user_id = auth.uid() AND memberships.role IN ('owner', 'admin'))
);

-- Feed Reactions
CREATE POLICY "Members react" ON feed_reactions FOR ALL USING (
  EXISTS (SELECT 1 FROM activity_feed af JOIN memberships m ON m.group_id = af.group_id WHERE af.id = feed_reactions.feed_item_id AND m.user_id = auth.uid())
);

-- Payment Reminder Rules
CREATE POLICY "Members view reminder rules" ON payment_reminder_rules FOR SELECT USING (
  EXISTS (SELECT 1 FROM memberships WHERE memberships.group_id = payment_reminder_rules.group_id AND memberships.user_id = auth.uid())
);
CREATE POLICY "Admin manage reminder rules" ON payment_reminder_rules FOR ALL USING (
  EXISTS (SELECT 1 FROM memberships WHERE memberships.group_id = payment_reminder_rules.group_id AND memberships.user_id = auth.uid() AND memberships.role IN ('owner', 'admin'))
);

-- Payment Reminders Sent
CREATE POLICY "Members view reminders sent" ON payment_reminders_sent FOR SELECT USING (
  EXISTS (SELECT 1 FROM payment_reminder_rules r JOIN memberships m ON m.group_id = r.group_id WHERE r.id = payment_reminders_sent.rule_id AND m.user_id = auth.uid())
);

-- Fine Rules
CREATE POLICY "Members view fine rules" ON fine_rules FOR SELECT USING (
  EXISTS (SELECT 1 FROM memberships WHERE memberships.group_id = fine_rules.group_id AND memberships.user_id = auth.uid())
);
CREATE POLICY "Admin manage fine rules" ON fine_rules FOR ALL USING (
  EXISTS (SELECT 1 FROM memberships WHERE memberships.group_id = fine_rules.group_id AND memberships.user_id = auth.uid() AND memberships.role IN ('owner', 'admin'))
);

-- Fines
CREATE POLICY "Members view own fines" ON fines FOR SELECT USING (
  EXISTS (SELECT 1 FROM memberships WHERE memberships.group_id = fines.group_id AND memberships.user_id = auth.uid())
);
CREATE POLICY "Admin manage fines" ON fines FOR ALL USING (
  EXISTS (SELECT 1 FROM memberships WHERE memberships.group_id = fines.group_id AND memberships.user_id = auth.uid() AND memberships.role IN ('owner', 'admin'))
);

-- Event Photos
CREATE POLICY "Members view event photos" ON event_photos FOR SELECT USING (
  EXISTS (SELECT 1 FROM events e JOIN memberships m ON m.group_id = e.group_id WHERE e.id = event_photos.event_id AND m.user_id = auth.uid())
);
CREATE POLICY "Members upload photos" ON event_photos FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM events e JOIN memberships m ON m.group_id = e.group_id WHERE e.id = event_photos.event_id AND m.user_id = auth.uid())
);

-- Loan Requests
CREATE POLICY "Members view loans" ON loan_requests FOR SELECT USING (
  EXISTS (SELECT 1 FROM memberships WHERE memberships.group_id = loan_requests.group_id AND memberships.user_id = auth.uid())
);
CREATE POLICY "Members request loans" ON loan_requests FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM memberships WHERE memberships.group_id = loan_requests.group_id AND memberships.user_id = auth.uid())
);
CREATE POLICY "Admin manage loans" ON loan_requests FOR UPDATE USING (
  EXISTS (SELECT 1 FROM memberships WHERE memberships.group_id = loan_requests.group_id AND memberships.user_id = auth.uid() AND memberships.role IN ('owner', 'admin'))
);

-- Loan Repayments
CREATE POLICY "Members view repayments" ON loan_repayments FOR SELECT USING (
  EXISTS (SELECT 1 FROM loan_requests lr JOIN memberships m ON m.group_id = lr.group_id WHERE lr.id = loan_repayments.loan_id AND m.user_id = auth.uid())
);

-- Projects
CREATE POLICY "Members view projects" ON projects FOR SELECT USING (
  EXISTS (SELECT 1 FROM memberships WHERE memberships.group_id = projects.group_id AND memberships.user_id = auth.uid())
);
CREATE POLICY "Admin manage projects" ON projects FOR ALL USING (
  EXISTS (SELECT 1 FROM memberships WHERE memberships.group_id = projects.group_id AND memberships.user_id = auth.uid() AND memberships.role IN ('owner', 'admin'))
);

-- Project Contributions
CREATE POLICY "Members view project contributions" ON project_contributions FOR SELECT USING (
  EXISTS (SELECT 1 FROM projects p JOIN memberships m ON m.group_id = p.group_id WHERE p.id = project_contributions.project_id AND m.user_id = auth.uid())
);
CREATE POLICY "Members contribute to projects" ON project_contributions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM projects p JOIN memberships m ON m.group_id = p.group_id WHERE p.id = project_contributions.project_id AND m.user_id = auth.uid())
);

-- Project Expenses
CREATE POLICY "Members view expenses" ON project_expenses FOR SELECT USING (
  EXISTS (SELECT 1 FROM projects p JOIN memberships m ON m.group_id = p.group_id WHERE p.id = project_expenses.project_id AND m.user_id = auth.uid())
);
CREATE POLICY "Admin manage expenses" ON project_expenses FOR ALL USING (
  EXISTS (SELECT 1 FROM projects p JOIN memberships m ON m.group_id = p.group_id WHERE p.id = project_expenses.project_id AND m.user_id = auth.uid() AND m.role IN ('owner', 'admin'))
);

-- Project Milestones
CREATE POLICY "Members view milestones" ON project_milestones FOR SELECT USING (
  EXISTS (SELECT 1 FROM projects p JOIN memberships m ON m.group_id = p.group_id WHERE p.id = project_milestones.project_id AND m.user_id = auth.uid())
);
CREATE POLICY "Admin manage milestones" ON project_milestones FOR ALL USING (
  EXISTS (SELECT 1 FROM projects p JOIN memberships m ON m.group_id = p.group_id WHERE p.id = project_milestones.project_id AND m.user_id = auth.uid() AND m.role IN ('owner', 'admin'))
);

-- Badges (public read)
CREATE POLICY "Anyone view badges" ON badges FOR SELECT USING (true);
CREATE POLICY "Members view earned badges" ON member_badges FOR SELECT USING (true);
CREATE POLICY "System award badges" ON member_badges FOR INSERT WITH CHECK (true);

-- ==================== SEED BADGES ====================

INSERT INTO badges (code, name, name_fr, description, description_fr, icon, criteria_json) VALUES
  ('perfect_attendance', 'Perfect Attendance', 'Présence Parfaite', 'Attended every meeting this year', 'A assisté à chaque réunion cette année', '🏆', '{"type":"attendance","threshold":100,"period":"year"}'),
  ('never_missed_payment', 'Never Missed a Payment', 'Jamais Manqué un Paiement', 'All obligations paid on time for 12+ months', 'Toutes les obligations payées à temps pendant 12+ mois', '💪', '{"type":"payment","months":12}'),
  ('founding_member', 'Founding Member', 'Membre Fondateur', 'One of the first 10 members', 'Parmi les 10 premiers membres', '⭐', '{"type":"membership","first":10}'),
  ('3_year_member', '3-Year Member', 'Membre de 3 Ans', '3 years of membership', '3 ans d''adhésion', '🎖️', '{"type":"anniversary","years":3}'),
  ('5_year_member', '5-Year Member', 'Membre de 5 Ans', '5 years of membership', '5 ans d''adhésion', '🎖️', '{"type":"anniversary","years":5}'),
  ('10_year_member', '10-Year Member', 'Membre de 10 Ans', '10 years of membership', '10 ans d''adhésion', '🎖️', '{"type":"anniversary","years":10}'),
  ('top_contributor', 'Top Contributor', 'Meilleur Contributeur', 'Highest total contributions this year', 'Plus hautes contributions totales cette année', '💰', '{"type":"contribution","rank":1,"period":"year"}'),
  ('reliable_host', 'Reliable Host', 'Hôte Fiable', 'Hosted 3+ events without missing', 'A accueilli 3+ événements sans manquer', '🏠', '{"type":"hosting","count":3}'),
  ('community_champion', 'Community Champion', 'Champion Communautaire', 'Referred 3+ new members', 'A référé 3+ nouveaux membres', '🤝', '{"type":"referral","count":3}');
