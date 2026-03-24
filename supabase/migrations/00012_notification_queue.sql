-- ============================================================
-- Notification Queue Table
-- Queues outbound notifications for external delivery channels
-- (email, SMS, WhatsApp, push) for later processing
-- ============================================================

CREATE TYPE notification_channel AS ENUM ('email', 'sms', 'whatsapp', 'push');
CREATE TYPE notification_queue_status AS ENUM ('queued', 'sent', 'failed');

CREATE TABLE notifications_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  channel notification_channel NOT NULL,
  template TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  status notification_queue_status NOT NULL DEFAULT 'queued',
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX idx_notifications_queue_status ON notifications_queue(status);
CREATE INDEX idx_notifications_queue_user ON notifications_queue(user_id);
CREATE INDEX idx_notifications_queue_created ON notifications_queue(created_at DESC);

ALTER TABLE notifications_queue ENABLE ROW LEVEL SECURITY;

-- Only platform staff can view the queue; system inserts via service role
CREATE POLICY "Staff can view notification queue" ON notifications_queue
  FOR SELECT USING (is_platform_staff());

-- Allow inserts from authenticated users (service writes on behalf of system)
CREATE POLICY "Authenticated users can queue notifications" ON notifications_queue
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
