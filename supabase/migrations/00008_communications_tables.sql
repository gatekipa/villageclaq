-- ============================================================
-- Phase 8: Communications Tables
-- Notifications, announcements, delivery tracking
-- ============================================================

-- ==================== ENUM TYPES ====================

CREATE TYPE announcement_channel AS ENUM ('in_app', 'email', 'sms', 'whatsapp');
CREATE TYPE delivery_status AS ENUM ('pending', 'sent', 'delivered', 'read', 'failed');

-- ==================== ADD NOTIFICATION PREFERENCES TO PROFILES ====================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{
  "channels": {
    "in_app": true,
    "email": true,
    "sms": false,
    "whatsapp": false,
    "push": false
  },
  "types": {
    "payment_reminders": {"in_app": true, "email": true, "sms": false, "whatsapp": false},
    "event_reminders": {"in_app": true, "email": true, "sms": false, "whatsapp": false},
    "minutes_published": {"in_app": true, "email": true, "sms": false, "whatsapp": false},
    "relief_updates": {"in_app": true, "email": true, "sms": false, "whatsapp": false},
    "standing_changes": {"in_app": true, "email": true, "sms": false, "whatsapp": false},
    "announcements": {"in_app": true, "email": true, "sms": false, "whatsapp": false},
    "hosting_reminders": {"in_app": true, "email": true, "sms": false, "whatsapp": false},
    "new_member": {"in_app": true, "email": false, "sms": false, "whatsapp": false}
  },
  "quiet_hours": {"enabled": false, "start": "22:00", "end": "07:00"},
  "muted_groups": []
}'::jsonb;

-- ==================== ANNOUNCEMENTS ====================

CREATE TABLE announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  title_fr TEXT,
  content TEXT NOT NULL,
  content_fr TEXT,
  channels JSONB NOT NULL DEFAULT '["in_app"]',
  audience JSONB NOT NULL DEFAULT '{"type": "all"}',
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_announcements_group ON announcements(group_id);
CREATE INDEX idx_announcements_sent ON announcements(sent_at DESC);
CREATE INDEX idx_announcements_scheduled ON announcements(scheduled_at) WHERE scheduled_at IS NOT NULL AND sent_at IS NULL;

-- ==================== ANNOUNCEMENT DELIVERIES ====================

CREATE TABLE announcement_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  channel announcement_channel NOT NULL DEFAULT 'in_app',
  status delivery_status NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_announcement_deliveries_announcement ON announcement_deliveries(announcement_id);
CREATE INDEX idx_announcement_deliveries_membership ON announcement_deliveries(membership_id);
CREATE INDEX idx_announcement_deliveries_status ON announcement_deliveries(status);

-- ==================== TRIGGERS ====================

CREATE TRIGGER set_announcements_updated_at BEFORE UPDATE ON announcements FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ==================== ROW LEVEL SECURITY ====================

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_deliveries ENABLE ROW LEVEL SECURITY;

-- Announcements: group members can view, admins can manage
CREATE POLICY "Members can view group announcements" ON announcements
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM memberships WHERE group_id = announcements.group_id AND user_id = auth.uid() AND standing != 'suspended')
  );

CREATE POLICY "Admins can manage group announcements" ON announcements
  FOR ALL USING (
    EXISTS (SELECT 1 FROM memberships WHERE group_id = announcements.group_id AND user_id = auth.uid() AND role IN ('admin', 'owner', 'moderator'))
  );

-- Announcement deliveries: members see their own, admins see all for their group
CREATE POLICY "Members can view own deliveries" ON announcement_deliveries
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM memberships WHERE id = announcement_deliveries.membership_id AND user_id = auth.uid())
  );

CREATE POLICY "Admins can manage deliveries" ON announcement_deliveries
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM announcements a
      JOIN memberships m ON m.group_id = a.group_id
      WHERE a.id = announcement_deliveries.announcement_id
        AND m.user_id = auth.uid()
        AND m.role IN ('admin', 'owner', 'moderator')
    )
  );
