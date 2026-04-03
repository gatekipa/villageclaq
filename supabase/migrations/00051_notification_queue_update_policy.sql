-- ============================================================
-- Allow service role to UPDATE notification queue items
-- The drain worker cron uses service role key, which bypasses RLS.
-- This policy is for completeness — allows staff to manually
-- update queue items via the dashboard if needed.
-- ============================================================

CREATE POLICY "Staff can update notification queue" ON notifications_queue
  FOR UPDATE USING (is_platform_staff());
